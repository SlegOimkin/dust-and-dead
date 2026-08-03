"use strict";

// Worker-thread entry hosting one or more authoritative matches. The parent
// speaks a small RPC protocol; inside, the real game.js runs in a jsdom
// environment per match. The game bundle is read and compiled ONCE per thread
// — every additional match on this thread reuses the compiled scripts, so the
// ~50 MB parse cost of game.js + jsdom is paid once, not per match. How many
// matches share a thread (and therefore a heap and a core) is the parent's
// MATCHES_PER_WORKER policy; this file just hosts whatever it is told to.

const { parentPort, workerData } = require("node:worker_threads");
const vm = require("node:vm");
const { compileAuthorityScripts, createAuthorityEnvironment, loadAuthorityBundle } = require("./environment.js");

// matchId -> { environment }
const matches = new Map();
let compiled = null;
let stopped = false;

function post(message) {
  try {
    parentPort.postMessage(message);
  } catch (error) {
    // A non-clonable payload here is a bug in this file, not in the game;
    // surface it instead of silently dropping the reply.
    parentPort.postMessage({
      type: "fatal",
      matchId: String(message && message.matchId || ""),
      error: "worker_post_failed: " + (error && error.message || String(error)),
    });
  }
}

function fatal(matchId, error) {
  post({ type: "fatal", matchId: String(matchId || ""), error: error && error.message || String(error) });
}

// An uncaught throw cannot be attributed to a match (jsdom timers all run on
// this thread's loop), so it fails the whole thread; the parent then fails
// every match hosted here. With one match per thread this is exactly the old
// behaviour.
process.on("uncaughtException", (error) => fatal("", error));
process.on("unhandledRejection", (error) => fatal("", error));

function ensureCompiled() {
  if (!compiled) {
    // The bundle's source strings are deliberately not retained: after
    // compileAuthorityScripts they are dead weight (~7 MB) and V8 keeps what
    // it needs for the compiled scripts on its own.
    compiled = compileAuthorityScripts(loadAuthorityBundle(workerData.root));
  }
  return compiled;
}

function spawnMatch(matchId, mapSeed) {
  if (matches.has(matchId)) throw new Error("duplicate_match_environment");
  const environment = createAuthorityEnvironment({
    compiled: ensureCompiled(),
    mapSeed,
    onConsole: (kind, text) => {
      if (kind === "error" || kind === "warning") post({ type: "console", matchId, kind, text });
    },
    onFatal: (error) => fatal(matchId, error),
  });
  environment.window.__dustDedicatedServerEmit = function (packet) {
    if (packet && packet.endpointId && packet.data) {
      post({
        type: "packet",
        matchId,
        packet: {
          endpointId: String(packet.endpointId),
          data: String(packet.data),
          latestOnly: !!packet.latestOnly,
          latestKind: String(packet.latestKind || ""),
        },
      });
    }
    return true;
  };
  matches.set(matchId, { environment });
  return { spawned: true, hostedMatches: matches.size };
}

function closeMatch(matchId) {
  const entry = matches.get(matchId);
  if (!entry) return false;
  matches.delete(matchId);
  entry.environment.dispose();
  return true;
}

async function handleRequest(message) {
  const matchId = String(message.matchId || "");
  if (message.kind === "warm") {
    // A spare thread pre-pays the expensive half of a cold first spawn — the
    // disk read and compile of the whole game bundle — while it has nothing
    // to host. The first real match then only builds its jsdom world.
    ensureCompiled();
    return { warmed: true };
  }
  if (message.kind === "spawn") {
    return spawnMatch(matchId, message.mapSeed);
  }
  if (message.kind === "closeMatch") {
    return closeMatch(matchId);
  }
  const entry = matches.get(matchId);
  if (!entry) throw new Error("unknown_match:" + matchId);
  const api = entry.environment.window.__dustDedicatedServer;
  switch (message.kind) {
    case "start":
      return api.start(message.settings);
    case "wire":
      return api.receiveWire(message.endpointId, message.data, message.latestKind);
    case "disconnect":
      return api.disconnect(message.endpointId);
    case "reconnect":
      return api.reconnect(message.endpointId, message.fresh);
    case "state":
      return api.getState();
    case "evaluate": {
      // Mirrors Playwright's page.evaluate closely enough for the test suite:
      // the function source runs inside the game's realm, so bare `window`,
      // `document`, `performance` and `requestAnimationFrame` all resolve.
      const script = new vm.Script("(" + message.source + ")", { filename: "evaluate" });
      const fn = script.runInContext(entry.environment.vmContext);
      return await Promise.resolve(fn(message.argument));
    }
    default:
      throw new Error("unknown_request:" + message.kind);
  }
}

parentPort.on("message", (message) => {
  if (!message || typeof message !== "object") return;
  if (message.type === "stop") {
    if (!stopped) {
      stopped = true;
      for (const entry of matches.values()) entry.environment.dispose();
      matches.clear();
    }
    // The parent awaits this before terminating, so a graceful stop never
    // races the environment teardown.
    post({ type: "stopped" });
    return;
  }
  if (message.type !== "request") return;
  handleRequest(message).then(
    (result) => post({ type: "reply", id: message.id, ok: true, result }),
    (error) => post({
      type: "reply",
      id: message.id,
      ok: false,
      error: error && error.message || String(error),
    })
  );
});

post({ type: "boot" });
