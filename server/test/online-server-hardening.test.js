"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { WebSocket } = require("ws");

const protocol = require("../../multiplayer-protocol.js");
const { createOnlineApplication } = require("../app.js");
const {
  OutboundQueue,
  getClientAddress,
  sanitizeProfile,
} = require("../online-server.js");
const { decodeGameMessage, encodeGameMessage } = require("../wire.js");

const TEST_TIMEOUT_MS = 8000;

class FakeMatchWorker {
  constructor(options) {
    this.options = options;
    this.id = options.matchId;
    this.received = [];
    this.closed = false;
  }

  receiveWire(endpointId, data, messageType) {
    if (this.closed) return false;
    this.received.push({ endpointId, data, messageType });
    return true;
  }

  reconnect(endpointId, freshClient) {
    this.reconnected = this.reconnected || [];
    this.reconnected.push({ endpointId, freshClient: !!freshClient });
    return true;
  }

  disconnect() { return true; }
  close() {
    this.closed = true;
    return Promise.resolve();
  }
}

class FakeWorkerManager {
  constructor() {
    this.matches = new Map();
    this.created = [];
  }

  async createMatch(options) {
    const worker = new FakeMatchWorker(options);
    this.matches.set(options.matchId, worker);
    this.created.push(worker);
    return worker;
  }

  get(matchId) { return this.matches.get(String(matchId || "")) || null; }

  async closeMatch(matchId) {
    const worker = this.matches.get(String(matchId || ""));
    if (!worker) return false;
    this.matches.delete(String(matchId || ""));
    await worker.close();
    return true;
  }

  readiness() {
    return { ready: true, activeMatches: this.matches.size, maxMatches: 32, browserConnected: true };
  }

  async close() {
    const workers = Array.from(this.matches.values());
    this.matches.clear();
    await Promise.all(workers.map((worker) => worker.close()));
  }
}

class TestClient {
  constructor(socket) {
    this.socket = socket;
    this.messages = [];
    this.closeEvents = [];
    socket.on("message", (data) => {
      try {
        this.messages.push(JSON.parse(Buffer.isBuffer(data) ? data.toString("utf8") : String(data)));
      } catch (error) {
        // The server never sends a non-JSON frame; swallowing keeps a parse
        // failure from masking the assertion that actually matters.
      }
    });
    socket.on("close", (code, reason) => {
      this.closeEvents.push({ code, reason: String(reason || "") });
    });
    socket.on("error", () => {});
  }

  send(message) { this.socket.send(JSON.stringify(message)); }
  sendRaw(text) { this.socket.send(text); }

  find(type, predicate) {
    return this.messages.find((message) => message.type === type && (!predicate || predicate(message))) || null;
  }

  waitFor(type, predicate, description) {
    return waitForCondition(
      () => this.find(type, predicate),
      description || ("message " + type)
    );
  }

  waitForClose() {
    return waitForCondition(() => this.closeEvents[0] || null, "socket close");
  }

  async close() {
    if (this.socket.readyState === WebSocket.CLOSED) return;
    await new Promise((resolve) => {
      const timer = setTimeout(() => {
        try { this.socket.terminate(); } catch (error) {}
        resolve();
      }, 500);
      this.socket.once("close", () => {
        clearTimeout(timer);
        resolve();
      });
      try { this.socket.close(1000, "test_complete"); } catch (error) { resolve(); }
    });
  }
}

async function waitForCondition(predicate, description, timeoutMs) {
  const deadline = Date.now() + (timeoutMs || TEST_TIMEOUT_MS);
  while (Date.now() < deadline) {
    const value = predicate();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Timed out waiting for " + (description || "condition"));
}

async function connectClient(url, options) {
  const socket = new WebSocket(url, options);
  const client = new TestClient(socket);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("connection timed out")), TEST_TIMEOUT_MS);
    socket.once("open", () => { clearTimeout(timer); resolve(); });
    socket.once("error", (error) => { clearTimeout(timer); reject(error); });
  });
  return client;
}

async function startTestApplication(overrides) {
  const workerManager = new FakeWorkerManager();
  const application = createOnlineApplication({
    host: "127.0.0.1",
    port: 0,
    workerManager,
    log: false,
    config: Object.assign({
      autoStartDelayMs: 40000,
      startAckTimeoutMs: 2000,
      reconnectGraceMs: 3000,
      heartbeatIntervalMs: 60000,
      connectionRatePerSecond: 200,
      connectionBurst: 400,
      resumeTokenSecret: "hardening-test-secret",
    }, overrides || {}),
  });
  const address = await application.start();
  return { application, workerManager, address, clients: [] };
}

async function stopTestApplication(context) {
  await Promise.all(context.clients.map((client) => client.close()));
  await context.application.close();
}

async function joinSession(context, name, searchCode, extra) {
  const client = await connectClient(context.address.websocketUrl);
  context.clients.push(client);
  await client.waitFor("server.hello");
  client.send(Object.assign({
    type: "session.join",
    protocolVersion: protocol.VERSION,
    name,
    searchCode: searchCode || "",
  }, extra || {}));
  const welcome = await client.waitFor("session.welcome");
  const room = await client.waitFor("room.state");
  return { client, welcome, room: room.room };
}

// Passes every structural check the old sanitizer applied (depth, node count,
// per-string length) yet serializes to ~200 KB — far past what four of these fit
// into one wire message, but still small enough to be accepted as one envelope.
function buildOversizedProfile() {
  const profile = {};
  for (let group = 0; group < 4; group += 1) {
    profile["group" + group] = Array.from({ length: 100 }, () => "x".repeat(512));
  }
  return profile;
}

async function startTwoPlayerMatch(context, searchCode) {
  const first = await joinSession(context, "Match One", searchCode);
  const second = await joinSession(context, "Match Two", searchCode);
  await first.client.waitFor("room.state", (message) => message.room.players.length === 2);
  first.client.send({ type: "room.ready", ready: true });
  second.client.send({ type: "room.ready", ready: true });
  const server = context.application.onlineServer;
  const room = server.matchmaker.getRoom(first.room.id);
  const pending = await waitForCondition(() => server.pendingStarts.get(room.id), "pending start");
  first.client.send({ type: "game", data: encodeGameMessage({ type: "startAck", startId: pending.startId }) });
  second.client.send({ type: "game", data: encodeGameMessage({ type: "startAck", startId: pending.startId }) });
  const matchId = await waitForCondition(() => room.matchId, "committed match");
  return { first, second, room, matchId, server };
}

test("an oversized profile is rejected at ingestion rather than at encode time", () => {
  const oversized = buildOversizedProfile();
  assert.ok(Buffer.byteLength(JSON.stringify(oversized)) > 512 * 1024 / (protocol.MAX_PLAYERS * 4));
  assert.equal(sanitizeProfile(oversized), null);
  // A normal profile still round-trips untouched.
  const ordinary = { cards: ["revolver", "rifle"], level: 7 };
  assert.equal(sanitizeProfile(ordinary), ordinary);
});

test("profile keys that would reach Object.prototype are rejected", () => {
  assert.equal(sanitizeProfile(JSON.parse('{"__proto__":{"polluted":true}}')), null);
  assert.equal(sanitizeProfile(JSON.parse('{"nested":{"constructor":{"x":1}}}')), null);
});

test(
  "a client that floods an oversized profile cannot take the server down",
  { timeout: 30000 },
  async () => {
    const context = await startTestApplication();
    const exits = [];
    const uncaught = [];
    const onUncaught = (error) => uncaught.push(error);
    process.on("uncaughtException", onUncaught);
    try {
      const oversized = buildOversizedProfile();
      const first = await joinSession(context, "Fat One", "HARDEN", { unlocks: oversized });
      const second = await joinSession(context, "Fat Two", "HARDEN", { unlocks: oversized });
      await first.client.waitFor("room.state", (message) => message.room.players.length === 2);

      first.client.send({ type: "room.ready", ready: true, unlocks: oversized });
      second.client.send({ type: "room.ready", ready: true, unlocks: oversized });

      // The start must still happen: the oversized profile was dropped, not the
      // match. Before the fix this path threw out of the socket handler.
      const prepare = await first.client.waitFor(
        "game",
        (message) => typeof message.data === "string" && message.data.length > 0,
        "startPrepare envelope"
      );
      assert.ok(prepare);
      assert.equal(uncaught.length, 0);
      assert.equal(exits.length, 0);
      assert.equal(context.application.readiness().acceptingConnections, true);
    } finally {
      process.off("uncaughtException", onUncaught);
      await stopTestApplication(context);
    }
  }
);

test("a retired session cannot be resurrected by frames still in the socket buffer", async () => {
  const context = await startTestApplication();
  try {
    const match = await startTwoPlayerMatch(context, "RETIRE");
    const server = match.server;
    assert.equal(server.matchmaker.rooms.size, 1);
    const sessionsBefore = server.sessionStore.sessions.size;

    // match.leave retires the session; the queue.join frames right behind it in
    // the same write must not create rooms no session can ever be resolved to.
    match.first.client.send({ type: "match.leave" });
    match.first.client.send({ type: "queue.join", searchCode: "GHOST" });
    match.first.client.send({ type: "queue.join", searchCode: "GHOST2" });
    await match.first.client.waitForClose();
    await new Promise((resolve) => setTimeout(resolve, 80));

    assert.equal(server.sessionStore.sessions.size, sessionsBefore - 1);
    // Only the original room survives — the one the second player is still in.
    assert.equal(server.matchmaker.rooms.size, 1);
    assert.equal(server.matchmaker.getRoom(match.room.id), match.room);
    for (const room of server.matchmaker.rooms.values()) {
      assert.notEqual(room.searchCode, "GHOST");
      assert.notEqual(room.searchCode, "GHOST2");
    }
  } finally {
    await stopTestApplication(context);
  }
});

test("an unsupported message type closes the connection instead of answering forever", async () => {
  const context = await startTestApplication();
  try {
    const joined = await joinSession(context, "Chatty", "");
    joined.client.send({ type: "totally.unknown" });
    const error = await joined.client.waitFor("session.error", (message) => message.code === "unsupported_message");
    assert.ok(error);
    const closed = await joined.client.waitForClose();
    assert.equal(closed.code, 1008);
  } finally {
    await stopTestApplication(context);
  }
});

test("the per-connection budget is charged by frame size, not by frame count", async () => {
  const context = await startTestApplication({
    connectionRatePerSecond: 10,
    connectionBurst: 12,
  });
  try {
    const client = await connectClient(context.address.websocketUrl);
    context.clients.push(client);
    await client.waitFor("server.hello");
    // One frame well under the envelope cap already outweighs the whole burst.
    client.sendRaw(JSON.stringify({ type: "session.ping", pad: "x".repeat(400 * 1024) }));
    const limited = await client.waitFor("session.error", (message) => message.code === "rate_limited");
    assert.ok(limited);
    const closed = await client.waitForClose();
    assert.equal(closed.code, 1008);
  } finally {
    await stopTestApplication(context);
  }
});

test("a late ack for the match that just ended is absorbed, not answered with an error", async () => {
  const context = await startTestApplication();
  try {
    const { first, server, room, matchId } = await startTwoPlayerMatch(context, "LATEACK");

    // The relay finishes the match and returns the room to the lobby.
    server.recentMatches.set(room.id, { matchId, until: Date.now() + 20000 });
    room.markMatchEnded();
    room.returnToLobby();

    const before = first.client.messages.length;
    first.client.send({
      type: "game",
      data: encodeGameMessage({ type: "returnLobbyAck", matchId }),
    });
    await new Promise((resolve) => setTimeout(resolve, 120));
    const errors = first.client.messages
      .slice(before)
      .filter((message) => message.type === "session.error");
    assert.deepEqual(errors, []);

    // An ack for some other match is still an error.
    first.client.send({
      type: "game",
      data: encodeGameMessage({ type: "returnLobbyAck", matchId: "match_not_ours" }),
    });
    const rejected = await first.client.waitFor("session.error");
    assert.ok(rejected);
  } finally {
    await stopTestApplication(context);
  }
});

async function resumeClient(context, welcome, extra) {
  const client = await connectClient(context.address.websocketUrl);
  context.clients.push(client);
  await client.waitFor("server.hello");
  client.send(Object.assign({
    type: "session.join",
    protocolVersion: protocol.VERSION,
    name: "Rejoiner",
    sessionId: welcome.sessionId,
    resumeToken: welcome.resumeToken,
  }, extra || {}));
  const resumed = await client.waitFor("session.welcome", (message) => message.resumed === true);
  return { client, welcome: resumed };
}

function decodeGameEnvelopes(client) {
  return client.messages
    .filter((message) => message.type === "game" && typeof message.data === "string")
    .map((message) => {
      try {
        return decodeGameMessage(message.data);
      } catch (error) {
        return null;
      }
    })
    .filter(Boolean);
}

test("a reloaded page resuming into a running match gets the start replayed", async () => {
  const context = await startTestApplication();
  try {
    const { first, room, matchId } = await startTwoPlayerMatch(context, "REJOIN");
    const worker = context.workerManager.get(matchId);

    // The page died: the socket drops without a clean leave.
    first.client.socket.terminate();
    await waitForCondition(
      () => room.players.get(first.welcome.playerId).connected === false,
      "the player to be marked disconnected"
    );

    // The reloaded page resumes with the stored credentials and, having no
    // match state, does NOT name a resumeMatchId.
    const rejoined = await resumeClient(context, first.welcome);
    await waitForCondition(() => {
      const envelopes = decodeGameEnvelopes(rejoined.client);
      return envelopes.some((message) => message.type === "startPrepare") &&
        envelopes.some((message) => message.type === "start");
    }, "the start replay to arrive");

    const envelopes = decodeGameEnvelopes(rejoined.client);
    const prepare = envelopes.find((message) => message.type === "startPrepare");
    const start = envelopes.find((message) => message.type === "start");
    assert.equal(prepare.startId, matchId);
    assert.equal(start.startId, matchId);
    assert.equal(start.mapSeed, room.mapSeed);
    assert.equal(start.players.length, 2);
    assert.equal(start.authority, "server");

    // The authority was told this is a fresh client and must reset counters.
    const freshReconnects = (worker.reconnected || []).filter((entry) => entry.freshClient);
    assert.equal(freshReconnects.length, 1);
    assert.equal(freshReconnects[0].endpointId, first.welcome.playerId);

    // Its startAck for the running match is absorbed, never answered with an error.
    rejoined.client.send({
      type: "game",
      data: encodeGameMessage({ type: "startAck", startId: matchId }),
    });
    await new Promise((resolve) => setTimeout(resolve, 150));
    assert.equal(rejoined.client.find("session.error"), null);

    // And its gameplay traffic routes to the worker again.
    rejoined.client.send({
      type: "game",
      data: encodeGameMessage({ type: "input", matchId, sequence: 1, moveX: 1, moveZ: 0 }),
    });
    await waitForCondition(
      () => worker.received.some((entry) => entry.endpointId === first.welcome.playerId),
      "the rejoined player's input to reach the worker"
    );
  } finally {
    await stopTestApplication(context);
  }
});

test("a same-page socket reconnect is not treated as a reload", async () => {
  const context = await startTestApplication();
  try {
    const { first, room, matchId } = await startTwoPlayerMatch(context, "SOCKETBLIP");
    const worker = context.workerManager.get(matchId);
    first.client.socket.terminate();
    await waitForCondition(
      () => room.players.get(first.welcome.playerId).connected === false,
      "the player to be marked disconnected"
    );

    // The same page reconnects and names the match it still holds.
    const rejoined = await resumeClient(context, first.welcome, { resumeMatchId: matchId });
    await waitForCondition(
      () => (worker.reconnected || []).length === 1,
      "the worker reconnect call"
    );
    assert.equal(worker.reconnected[0].freshClient, false);

    // No replay: continuity is assumed, the client already has the match.
    await new Promise((resolve) => setTimeout(resolve, 200));
    const envelopes = decodeGameEnvelopes(rejoined.client);
    assert.equal(envelopes.some((message) => message.type === "startPrepare"), false);
    assert.equal(envelopes.some((message) => message.type === "start"), false);
  } finally {
    await stopTestApplication(context);
  }
});

test("a server at match capacity tells the room why the start failed", async () => {
  const context = await startTestApplication();
  try {
    // The worker backend refuses new matches, exactly as it does at MAX_MATCHES.
    context.workerManager.createMatch = async () => { throw new Error("server_at_capacity"); };

    const first = await joinSession(context, "Full One", "CAPACITY");
    const second = await joinSession(context, "Full Two", "CAPACITY");
    await first.client.waitFor("room.state", (message) => message.room.players.length === 2);
    first.client.send({ type: "room.ready", ready: true });
    second.client.send({ type: "room.ready", ready: true });

    const server = context.application.onlineServer;
    const room = server.matchmaker.getRoom(first.room.id);
    const pending = await waitForCondition(() => server.pendingStarts.get(room.id), "pending start");
    first.client.send({ type: "game", data: encodeGameMessage({ type: "startAck", startId: pending.startId }) });
    second.client.send({ type: "game", data: encodeGameMessage({ type: "startAck", startId: pending.startId }) });

    // The room must carry the reason, or the client can only show a silent
    // readiness reset with nothing explaining it.
    const failed = await first.client.waitFor(
      "room.state",
      (message) => message.room.phase === "lobby" && !!message.room.error,
      "the failed start to be reported on the room"
    );
    assert.match(failed.room.error, /capacity/);
    assert.equal(failed.room.players.every((player) => !player.ready), true);
  } finally {
    await stopTestApplication(context);
  }
});

test("a finished match returns its room to the lobby even when nobody clicks return", async () => {
  const context = await startTestApplication({ postMatchAutoReturnMs: 1500 });
  try {
    const { first, second, server, room, matchId } = await startTwoPlayerMatch(context, "IDLERESULT");
    assert.ok(context.workerManager.get(matchId), "the match worker must be running");

    // The authority reports the match over; both players just sit on the
    // results screen and never click return.
    server.handleWorkerPacket(room.id, matchId, {
      endpointId: room.players.keys().next().value,
      data: encodeGameMessage({ type: "matchEnd", matchId, winnerIds: [] }),
    });
    assert.equal(room.phase, "ended");

    await waitForCondition(() => room.phase === "lobby", "the room to auto-return", 6000);
    assert.equal(context.workerManager.get(matchId), null, "the match worker must be released");
    // Both connected clients were told the room is a lobby again.
    await first.client.waitFor("room.state", (message) => message.room.phase === "lobby");
    await second.client.waitFor("room.state", (message) => message.room.phase === "lobby");
  } finally {
    await stopTestApplication(context);
  }
});

test("a player's return click is not delayed by the pending auto-return fallback", async () => {
  const context = await startTestApplication({ postMatchAutoReturnMs: 60000 });
  try {
    const { server, room, matchId } = await startTwoPlayerMatch(context, "FASTRETURN");
    const playerId = room.players.keys().next().value;
    server.handleWorkerPacket(room.id, matchId, {
      endpointId: playerId,
      data: encodeGameMessage({ type: "matchEnd", matchId, winnerIds: [] }),
    });
    assert.equal(room.phase, "ended");

    // The authority relays the player-driven return; the long fallback timer
    // must be replaced by the short one, not honored.
    const startedAt = Date.now();
    server.handleWorkerPacket(room.id, matchId, {
      endpointId: playerId,
      data: encodeGameMessage({ type: "returnLobby", matchId, players: [] }),
    });
    await waitForCondition(() => room.phase === "lobby", "the room to return quickly", 3000);
    assert.ok(Date.now() - startedAt < 2500, "the return must not wait for the fallback delay");
  } finally {
    await stopTestApplication(context);
  }
});

test("the forwarded client address is read from the trusted end of the header chain", () => {
  const request = {
    headers: { "x-forwarded-for": "9.9.9.9, 203.0.113.7" },
    socket: { remoteAddress: "10.0.0.5" },
  };
  // One trusted proxy: the rightmost entry is the one Caddy appended.
  assert.equal(getClientAddress(request, true, 1), "203.0.113.7");
  // Two trusted hops: one further left.
  assert.equal(getClientAddress(request, true, 2), "9.9.9.9");
  // A spoofed header shorter than the trusted chain falls back to the real peer.
  assert.equal(getClientAddress(request, true, 3), "10.0.0.5");
  assert.equal(getClientAddress(request, false, 1), "10.0.0.5");
});

test("the outbound queue stops accepting reliable messages once it is over budget", () => {
  const slowClientCalls = [];
  const socket = { readyState: 3, bufferedAmount: 0, send() {} };
  const queue = new OutboundQueue(socket, () => slowClientCalls.push(1));
  const chunk = { type: "game", data: "x".repeat(256 * 1024) };
  let accepted = 0;
  for (let index = 0; index < 64; index += 1) {
    if (queue.enqueue(chunk, "")) accepted += 1;
  }
  assert.ok(accepted > 0, "expected the queue to accept messages before the cap");
  assert.ok(accepted < 64, "expected the queue to refuse messages past the cap");
  assert.equal(slowClientCalls.length, 1);
  assert.equal(queue.closed, true);
  // Everything after the cap is refused rather than buffered.
  assert.equal(queue.enqueue(chunk, ""), false);
  assert.equal(queue.reliableBytes, 0);
});

test("readiness only reports ready when the worker backend can actually host a match", async () => {
  const context = await startTestApplication();
  try {
    assert.equal(context.application.readiness().ready, true);
    context.workerManager.readiness = () => ({
      ready: false,
      activeMatches: 0,
      maxMatches: 4,
      browserConnected: false,
    });
    assert.equal(context.application.readiness().ready, false);
  } finally {
    await stopTestApplication(context);
  }
});
