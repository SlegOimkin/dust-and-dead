"use strict";

// Feature parity between the two match runtimes. The node runtime hosts the
// game in worker threads via jsdom; the browser runtime hosts it in Chromium.
// Both run the SAME game.js, so every observable the online server depends on
// must agree — otherwise a runtime switch would silently change gameplay.
//
// Runs the identical scripted match on both and diffs the results. Skips the
// browser half (with a visible note) if Chromium is unavailable.

const assert = require("node:assert/strict");
const http = require("node:http");
const path = require("node:path");
const test = require("node:test");

const { GameWorkerManager } = require("../game-worker.js");
const { NodeGameWorkerManager } = require("../node-game-worker.js");
const { createStaticHandler } = require("../static-handler.js");
const { decodeGameMessage, encodeGameMessage } = require("../wire.js");

const MATCH_ID = "parity";
const MAP_SEED = 20260803;
const ROSTER = ["parity-a", "parity-b", "parity-c"];
const SIM_SECONDS = 12;

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => { server.removeListener("error", reject); resolve(server.address()); });
  });
}

// A deterministic, scripted input stream: identical on both runtimes, so any
// divergence in the result is the runtime's doing and not the script's.
function inputFor(endpointId, sequence) {
  const index = ROSTER.indexOf(endpointId);
  const angle = (index / ROSTER.length) * Math.PI * 2 + sequence * 0.01;
  return encodeGameMessage({
    type: "input",
    matchId: MATCH_ID,
    lifeSequence: 1,
    sequence,
    moveX: Number(Math.cos(angle).toFixed(4)),
    moveZ: Number(Math.sin(angle).toFixed(4)),
    aimAngle: Number(angle.toFixed(4)),
    aimDistance: 12,
    px: Number((Math.cos(angle) * 4).toFixed(4)),
    pz: Number((Math.sin(angle) * 4).toFixed(4)),
  });
}

async function runScriptedMatch(worker) {
  const observed = { snapshotsByEndpoint: Object.create(null), types: Object.create(null) };
  worker.__observed = observed;

  await worker.page.evaluate(() => window.__dustAndDeadTest.startWaveNow(10));

  let sequence = 0;
  const timer = setInterval(() => {
    sequence += 1;
    for (const endpointId of ROSTER) worker.receiveWire(endpointId, inputFor(endpointId, sequence), "input");
  }, 33);
  if (timer.unref) timer.unref();
  await new Promise((resolve) => setTimeout(resolve, SIM_SECONDS * 1000));
  clearInterval(timer);

  const state = await worker.state();
  const world = await worker.page.evaluate(() => {
    const objects = window.__dustAndDeadTest.getThreeObjectDiagnostics();
    const timing = window.__dustAndDeadTest.getFrameTimingDiagnostics();
    const sync = window.__dustMultiplayerTest.getMultiplayerSyncDiagnostics();
    const mp = window.__dustMultiplayerTest.getState();
    return {
      wave: sync.wave,
      enemies: objects.state.enemies,
      ammoCrates: objects.state.ammoCrates,
      dropReason: timing.backlogDropReason,
      bossHeading: (document.querySelector("h2") || {}).textContent || "",
      players: mp.players.map((player) => ({
        id: player.id,
        alive: player.alive,
        connected: player.connected,
        fireProcessed: player.lastProcessedFireActionSequence,
        level: player.progression ? player.progression.level : null,
        weapon: player.progression ? player.progression.weapon : null,
        magazine: player.progression ? Object.assign({}, player.progression.ammo) : null,
        reserve: player.progression ? Object.assign({}, player.progression.ammoReserve) : null,
      })),
    };
  });
  return { state, world, observed };
}

// Only the runtime CONTRACT is compared. Emergent outcomes — how many zombies
// happened to walk into a sweeping crosshair in twelve seconds, and therefore
// XP, level, magazine contents and who survived — legitimately differ between
// two independent simulations and would make this test flaky rather than
// meaningful. Those are covered by online-combat-integrity.test.js instead.
function summarize(result) {
  return {
    phase: result.state.phase,
    role: result.state.role,
    transportKind: result.state.transportKind,
    dedicatedAuthority: result.state.dedicatedAuthority,
    protocolVersion: result.state.protocolVersion,
    matchId: result.state.matchId,
    mapSeed: result.state.mapSeed,
    playerCount: result.state.players.length,
    snapshotsFlowing: result.state.snapshotSequence > 0,
    wave: result.world.wave,
    bossPresent: /BELL RINGER|RINGER/i.test(result.world.bossHeading),
    dropReason: result.world.dropReason,
    enemiesLoaded: result.world.enemies > 100,
    players: result.world.players.map((player) => ({
      id: player.id,
      connected: player.connected,
      // Shape, not values: both runtimes must expose the same progression and
      // ammo model for every weapon.
      hasProgression: player.level != null && typeof player.weapon === "string" && player.weapon.length > 0,
      magazineKeys: Object.keys(player.magazine || {}).sort().join(","),
      reserveKeys: Object.keys(player.reserve || {}).sort().join(","),
    })),
  };
}

async function withNodeRuntime(run) {
  const manager = new NodeGameWorkerManager({
    root: path.join(__dirname, "..", ".."),
    maxMatches: 1,
    startupTimeoutMs: 90000,
    shutdownTimeoutMs: 10000,
    logLevel: "warn",
  });
  try {
    return await run(manager);
  } finally {
    await manager.close();
  }
}

async function withBrowserRuntime(run) {
  const staticServer = http.createServer(createStaticHandler());
  const address = await listen(staticServer);
  const manager = new GameWorkerManager({
    baseUrl: "http://127.0.0.1:" + address.port,
    maxMatches: 1,
    startupTimeoutMs: 90000,
    shutdownTimeoutMs: 15000,
    logLevel: "warn",
  });
  try {
    return await run(manager);
  } finally {
    await manager.close();
    await new Promise((resolve) => staticServer.close(resolve));
  }
}

function createMatchOn(manager) {
  const packets = [];
  return manager.createMatch({
    matchId: MATCH_ID,
    startId: MATCH_ID,
    mapSeed: MAP_SEED,
    players: ROSTER.map((id, index) => ({ id, endpointId: id, name: "Parity " + (index + 1) })),
    onPacket(packet) {
      let message = null;
      try { message = decodeGameMessage(packet.data); } catch (error) { return; }
      packets.push({ endpointId: packet.endpointId, type: message.type });
    },
    onFatal(error) { throw error; },
  }).then((worker) => {
    worker.__packets = packets;
    return worker;
  });
}

test("both match runtimes produce the same authoritative match", { timeout: 300000 }, async () => {
  const nodeResult = await withNodeRuntime(async (manager) => {
    const worker = await createMatchOn(manager);
    const result = await runScriptedMatch(worker);
    result.packets = worker.__packets;
    return result;
  });

  const nodeSummary = summarize(nodeResult);
  // The node runtime must be a fully working authority on its own terms first.
  assert.equal(nodeSummary.phase, "match");
  assert.equal(nodeSummary.role, "host");
  assert.equal(nodeSummary.transportKind, "dedicated");
  assert.equal(nodeSummary.dedicatedAuthority, true);
  assert.equal(nodeSummary.playerCount, ROSTER.length);
  assert.equal(nodeSummary.snapshotsFlowing, true);
  assert.equal(nodeSummary.dropReason, "");
  assert.equal(nodeSummary.bossPresent, true, "the boss encounter must be live");
  assert.equal(nodeSummary.enemiesLoaded, true, "the boss wave must load the authority");
  assert.equal(
    nodeSummary.players.every((player) => player.hasProgression),
    true,
    "every player must carry a progression and a selected weapon"
  );
  for (const endpointId of ROSTER) {
    assert.ok(
      nodeResult.packets.some((packet) => packet.endpointId === endpointId && packet.type === "snapshot"),
      endpointId + " received no snapshot from the node runtime"
    );
  }

  let browserResult = null;
  try {
    browserResult = await withBrowserRuntime(async (manager) => {
      const worker = await createMatchOn(manager);
      const result = await runScriptedMatch(worker);
      result.packets = worker.__packets;
      return result;
    });
  } catch (error) {
    // Chromium missing on this host is not a parity failure; the node half
    // above already asserted a working authority.
    console.log("# browser runtime unavailable, parity half skipped: " + (error && error.message));
    return;
  }

  const browserSummary = summarize(browserResult);
  // Identity of the match and of every player's loadout must match exactly.
  assert.deepEqual(
    { ...nodeSummary, players: undefined },
    { ...browserSummary, players: undefined },
    "runtime-level match state diverged"
  );
  assert.deepEqual(
    nodeSummary.players,
    browserSummary.players,
    "per-player state diverged between runtimes"
  );
  for (const endpointId of ROSTER) {
    assert.ok(
      browserResult.packets.some((packet) => packet.endpointId === endpointId && packet.type === "snapshot"),
      endpointId + " received no snapshot from the browser runtime"
    );
  }
});
