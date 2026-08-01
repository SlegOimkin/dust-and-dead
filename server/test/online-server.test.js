"use strict";

const http = require("node:http");
const test = require("node:test");
const assert = require("node:assert/strict");
const { WebSocket } = require("ws");

const protocol = require("../../multiplayer-protocol.js");
const { createOnlineApplication } = require("../app.js");
const { decodeGameMessage, encodeGameMessage } = require("../wire.js");

const TEST_TIMEOUT_MS = 5000;

class FakeMatchWorker {
  constructor(options) {
    this.options = options;
    this.id = options.matchId;
    this.received = [];
    this.reconnected = [];
    this.disconnected = [];
    this.closed = false;
  }

  receiveWire(endpointId, data, messageType) {
    if (this.closed) return false;
    this.received.push({ endpointId, data, messageType });
    return true;
  }

  reconnect(endpointId) {
    this.reconnected.push(endpointId);
    return true;
  }

  disconnect(endpointId) {
    this.disconnected.push(endpointId);
    return true;
  }

  close() {
    this.closed = true;
    return Promise.resolve();
  }
}

class FakeWorkerManager {
  constructor() {
    this.matches = new Map();
    this.created = [];
    this.closeCalls = [];
    this.closed = false;
  }

  async createMatch(options) {
    const worker = new FakeMatchWorker(options);
    this.matches.set(options.matchId, worker);
    this.created.push(worker);
    return worker;
  }

  get(matchId) {
    return this.matches.get(String(matchId || "")) || null;
  }

  async closeMatch(matchId) {
    const id = String(matchId || "");
    this.closeCalls.push(id);
    const worker = this.matches.get(id);
    if (!worker) return false;
    this.matches.delete(id);
    await worker.close();
    return true;
  }

  readiness() {
    return {
      ready: !this.closed,
      activeMatches: this.matches.size,
      maxMatches: 32,
    };
  }

  async close() {
    this.closed = true;
    const workers = Array.from(this.matches.values());
    this.matches.clear();
    await Promise.all(workers.map((worker) => worker.close()));
  }
}

class TestClient {
  constructor(socket) {
    this.socket = socket;
    this.messages = [];
    this.waiters = new Set();
    socket.on("message", (data) => {
      const message = JSON.parse(Buffer.isBuffer(data) ? data.toString("utf8") : String(data));
      this.messages.push(message);
      for (const waiter of Array.from(this.waiters)) {
        if (!waiter.predicate(message)) continue;
        this.waiters.delete(waiter);
        clearTimeout(waiter.timer);
        waiter.resolve(message);
      }
    });
  }

  send(message) {
    this.socket.send(JSON.stringify(message));
  }

  waitFor(predicate, description, timeoutMs) {
    const existing = this.messages.find(predicate);
    if (existing) return Promise.resolve(existing);
    return new Promise((resolve, reject) => {
      const waiter = {
        predicate,
        resolve,
        timer: setTimeout(() => {
          this.waiters.delete(waiter);
          reject(new Error("Timed out waiting for " + (description || "WebSocket message")));
        }, timeoutMs || TEST_TIMEOUT_MS),
      };
      this.waiters.add(waiter);
    });
  }

  waitForType(type, predicate) {
    return this.waitFor(
      (message) => message.type === type && (!predicate || predicate(message)),
      type
    );
  }

  waitForGameType(type, predicate) {
    return this.waitFor((envelope) => {
      if (envelope.type !== "game" || typeof envelope.data !== "string") return false;
      let message;
      try {
        message = decodeGameMessage(envelope.data);
      } catch (error) {
        return false;
      }
      return message.type === type && (!predicate || predicate(message));
    }, "game message " + type).then((envelope) => ({
      envelope,
      message: decodeGameMessage(envelope.data),
    }));
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

  terminate() {
    this.socket.terminate();
  }
}

async function connectClient(url, options) {
  const socket = new WebSocket(url, options);
  // The gateway sends server.hello immediately from its connection callback.
  // Attach the collector before awaiting open so that a fast loopback server
  // cannot deliver the greeting in the gap between those two operations.
  const client = new TestClient(socket);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("WebSocket connection timed out")), TEST_TIMEOUT_MS);
    socket.once("open", () => {
      clearTimeout(timer);
      resolve();
    });
    socket.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
  return client;
}

function expectUpgradeStatus(url, expectedStatus, options) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url, options);
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { socket.terminate(); } catch (error) {}
      reject(new Error("Timed out waiting for rejected WebSocket upgrade"));
    }, TEST_TIMEOUT_MS);
    socket.once("unexpected-response", (request, response) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const status = response.statusCode;
      response.resume();
      try { socket.terminate(); } catch (error) {}
      try {
        assert.equal(status, expectedStatus);
        resolve(status);
      } catch (error) {
        reject(error);
      }
    });
    socket.once("open", () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { socket.terminate(); } catch (error) {}
      reject(new Error("WebSocket upgrade unexpectedly succeeded"));
    });
    socket.once("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
  });
}

async function waitForCondition(predicate, description, timeoutMs) {
  const deadline = Date.now() + (timeoutMs || TEST_TIMEOUT_MS);
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Timed out waiting for " + (description || "condition"));
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
      resumeTokenSecret: "online-server-integration-test-secret",
    }, overrides || {}),
  });
  const address = await application.start();
  return { application, workerManager, address, clients: [] };
}

async function stopTestApplication(context) {
  await Promise.all(context.clients.map((client) => client.close()));
  await context.application.close();
}

async function joinSession(context, name, searchCode, resume) {
  const client = await connectClient(context.address.websocketUrl);
  context.clients.push(client);
  await client.waitForType("server.hello");
  client.send({
    type: "session.join",
    protocolVersion: protocol.VERSION,
    name,
    searchCode: searchCode || "",
    sessionId: resume && resume.sessionId,
    resumeToken: resume && resume.resumeToken,
  });
  const welcome = await client.waitForType("session.welcome");
  const room = await client.waitForType("room.state");
  return { client, welcome, room: room.room };
}

async function startTwoPlayerMatch(context, searchCode) {
  const first = await joinSession(context, "Match One", searchCode);
  const second = await joinSession(context, "Match Two", searchCode);
  await first.client.waitForType(
    "room.state",
    (message) => message.room.id === first.room.id && message.room.players.length === 2
  );
  first.client.send({ type: "room.ready", ready: true });
  second.client.send({ type: "room.ready", ready: true });
  const [firstPrepare, secondPrepare] = await Promise.all([
    first.client.waitForGameType("startPrepare"),
    second.client.waitForGameType("startPrepare"),
  ]);
  first.client.send({
    type: "game",
    data: encodeGameMessage({ type: "startAck", startId: firstPrepare.message.startId }),
  });
  second.client.send({
    type: "game",
    data: encodeGameMessage({ type: "startAck", startId: secondPrepare.message.startId }),
  });
  const [firstStart] = await Promise.all([
    first.client.waitForGameType("start"),
    second.client.waitForGameType("start"),
  ]);
  await first.client.waitForType(
    "room.state",
    (message) => message.room.id === first.room.id && message.room.phase === "match"
  );
  return {
    first,
    second,
    roomId: first.room.id,
    matchId: firstPrepare.message.startId,
    mapSeed: firstStart.message.mapSeed,
    worker: context.workerManager.get(firstPrepare.message.startId),
  };
}

function getJson(url) {
  return new Promise((resolve, reject) => {
    const request = http.get(url, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        let body = null;
        try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch (error) {}
        resolve({ statusCode: response.statusCode, body });
      });
    });
    request.on("error", reject);
  });
}

test("automatic matchmaking isolates search codes and exposes no room-list route", async () => {
  const context = await startTestApplication();
  try {
    const first = await joinSession(context, "Alpha One", " posse-7 ");
    const second = await joinSession(context, "Alpha Two", "POSSE-7");
    const otherCode = await joinSession(context, "Beta", "POSSE-8");
    const publicPlayer = await joinSession(context, "Public", "");

    assert.equal(first.room.id, second.room.id);
    assert.notEqual(first.room.id, otherCode.room.id);
    assert.notEqual(first.room.id, publicPlayer.room.id);
    assert.notEqual(otherCode.room.id, publicPlayer.room.id);

    const alphaRoom = await first.client.waitForType(
      "room.state",
      (message) => message.room.id === first.room.id && message.room.players.length === 2
    );
    assert.deepEqual(
      alphaRoom.room.players.map((player) => player.name).sort(),
      ["Alpha One", "Alpha Two"]
    );

    const listResponse = await getJson(context.address.httpUrl + "/rooms");
    assert.equal(listResponse.statusCode, 404);
    assert.deepEqual(listResponse.body, { error: "not_found" });
  } finally {
    await stopTestApplication(context);
  }
});

test("all-ready room performs prepare acknowledgements before one server-owned start", async () => {
  const context = await startTestApplication();
  try {
    const first = await joinSession(context, "Ready One", "READY");
    const second = await joinSession(context, "Ready Two", "READY");
    await first.client.waitForType(
      "room.state",
      (message) => message.room.id === first.room.id && message.room.players.length === 2
    );

    first.client.send({ type: "room.ready", ready: true });
    await first.client.waitForType(
      "room.state",
      (message) => message.room.id === first.room.id && message.room.readyCount === 1 && message.room.autoStartAt > 0
    );
    second.client.send({ type: "room.ready", ready: true });

    const [firstPrepare, secondPrepare] = await Promise.all([
      first.client.waitForGameType("startPrepare"),
      second.client.waitForGameType("startPrepare"),
    ]);
    assert.equal(firstPrepare.message.authority, "server");
    assert.equal(firstPrepare.message.startId, secondPrepare.message.startId);
    assert.equal(firstPrepare.message.players.length, 2);
    assert.equal(context.workerManager.created.length, 0);

    const acknowledgement = encodeGameMessage({
      type: "startAck",
      startId: firstPrepare.message.startId,
    });
    first.client.send({ type: "game", data: acknowledgement });
    second.client.send({ type: "game", data: acknowledgement });

    const [firstStart, secondStart] = await Promise.all([
      first.client.waitForGameType("start"),
      second.client.waitForGameType("start"),
    ]);
    assert.equal(firstStart.message.authority, "server");
    assert.equal(firstStart.message.startId, firstPrepare.message.startId);
    assert.equal(secondStart.message.startId, firstPrepare.message.startId);
    assert.equal(context.workerManager.created.length, 1);
    assert.equal(context.workerManager.created[0].id, firstPrepare.message.startId);
    assert.equal(context.workerManager.created[0].options.players.length, 2);

    const runningRoom = await first.client.waitForType(
      "room.state",
      (message) => message.room.id === first.room.id && message.room.phase === "match"
    );
    assert.equal(runningRoom.room.matchId, firstPrepare.message.startId);
    assert.equal(context.application.metrics().matchesStarted, 1);

    const worker = context.workerManager.created[0];
    worker.options.onPacket({
      endpointId: first.welcome.playerId,
      data: encodeGameMessage({
        type: "matchEnd",
        version: protocol.VERSION,
        mapSeed: firstStart.message.mapSeed,
        matchId: firstStart.message.startId,
        winnerIds: [],
        reason: "finished",
      }),
    });
    await first.client.waitForType(
      "room.state",
      (message) => message.room.id === first.room.id && message.room.phase === "ended"
    );
    first.client.send({
      type: "game",
      data: encodeGameMessage({
        type: "returnLobbyRequest",
        version: protocol.VERSION,
        mapSeed: firstStart.message.mapSeed,
        matchId: firstStart.message.startId,
      }),
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.ok(worker.received.some((entry) => (
      entry.endpointId === first.welcome.playerId &&
      decodeGameMessage(entry.data).type === "returnLobbyRequest"
    )));
  } finally {
    await stopTestApplication(context);
  }
});

test("resume keeps the same player and room while rotating the resume token", async () => {
  const context = await startTestApplication({ reconnectGraceMs: 4000 });
  try {
    const original = await joinSession(context, "Reconnect", "RETURN");
    const originalRoomId = original.room.id;
    const originalPlayerId = original.welcome.playerId;
    original.client.terminate();
    await new Promise((resolve) => setTimeout(resolve, 30));

    const resumed = await joinSession(context, "Reconnect", "IGNORED", {
      sessionId: original.welcome.sessionId,
      resumeToken: original.welcome.resumeToken,
    });
    assert.equal(resumed.welcome.resumed, true);
    assert.equal(resumed.welcome.playerId, originalPlayerId);
    assert.equal(resumed.room.id, originalRoomId);
    assert.notEqual(resumed.welcome.resumeToken, original.welcome.resumeToken);
    assert.equal(resumed.room.players.length, 1);
    assert.equal(resumed.room.players[0].connected, true);
    assert.equal(context.application.metrics().sessionsResumed, 1);
    assert.equal(context.application.metrics().activeSessions, 1);
  } finally {
    await stopTestApplication(context);
  }
});

test("disconnecting a lobby player cancels the forty-second readiness countdown", async () => {
  const context = await startTestApplication({ reconnectGraceMs: 4000 });
  try {
    const first = await joinSession(context, "Waiting One", "COUNTDOWN");
    const second = await joinSession(context, "Waiting Two", "COUNTDOWN");
    await first.client.waitForType(
      "room.state",
      (message) => message.room.id === first.room.id && message.room.players.length === 2
    );

    first.client.send({ type: "room.ready", ready: true });
    const countdown = await first.client.waitForType(
      "room.state",
      (message) => message.room.id === first.room.id && message.room.readyCount === 1 && message.room.autoStartAt > 0
    );
    assert.ok(countdown.room.autoStartAt - countdown.room.serverNow >= 39900);

    second.client.terminate();
    const cancelled = await first.client.waitForType(
      "room.state",
      (message) => message.room.id === first.room.id &&
        message.room.autoStartAt === 0 &&
        message.room.players.some((player) => player.name === "Waiting Two" && player.connected === false)
    );
    assert.equal(cancelled.room.phase, "lobby");
    assert.equal(cancelled.room.readyCount, 1);
    assert.equal(context.workerManager.created.length, 0);
  } finally {
    await stopTestApplication(context);
  }
});

test("explicit match leaves remove memberships and close the worker after the last player", async () => {
  const context = await startTestApplication();
  try {
    const match = await startTwoPlayerMatch(context, "LEAVE-CLEANUP");
    assert.ok(match.worker);
    match.worker.options.onPacket({
      endpointId: match.first.welcome.playerId,
      data: encodeGameMessage({
        type: "matchEnd",
        version: protocol.VERSION,
        mapSeed: match.mapSeed,
        matchId: match.matchId,
        winnerIds: [],
        reason: "finished",
      }),
    });
    await match.second.client.waitForType(
      "room.state",
      (message) => message.room.id === match.roomId && message.room.phase === "ended"
    );

    match.first.client.send({ type: "match.leave" });
    await match.second.client.waitForType(
      "room.state",
      (message) => message.room.id === match.roomId &&
        message.room.phase === "ended" &&
        message.room.players.length === 1
    );
    await waitForCondition(
      () => match.worker.disconnected.includes(match.first.welcome.playerId),
      "first player to be disconnected from authority"
    );
    assert.equal(context.application.onlineServer.matchmaker.rooms.size, 1);
    assert.equal(context.application.onlineServer.sessionStore.sessions.size, 1);
    assert.equal(context.workerManager.matches.size, 1);

    match.second.client.send({ type: "match.leave" });
    await waitForCondition(
      () => context.application.onlineServer.matchmaker.rooms.size === 0 &&
        context.application.onlineServer.sessionStore.sessions.size === 0 &&
        context.workerManager.matches.size === 0,
      "last match leave cleanup"
    );
    assert.equal(
      context.workerManager.closeCalls.filter((id) => id === match.matchId).length,
      1
    );
  } finally {
    await stopTestApplication(context);
  }
});

test("reconnect expiry removes match players and closes the orphaned worker", async () => {
  const context = await startTestApplication({ reconnectGraceMs: 1000 });
  try {
    const match = await startTwoPlayerMatch(context, "EXPIRY-CLEANUP");
    match.first.client.terminate();
    match.second.client.terminate();

    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(context.application.onlineServer.matchmaker.rooms.size, 1);
    assert.equal(context.workerManager.matches.size, 1);

    await waitForCondition(
      () => context.application.onlineServer.matchmaker.rooms.size === 0 &&
        context.application.onlineServer.sessionStore.sessions.size === 0 &&
        context.workerManager.matches.size === 0,
      "reconnect grace expiry cleanup",
      3000
    );
    assert.equal(
      context.workerManager.closeCalls.filter((id) => id === match.matchId).length,
      1
    );
  } finally {
    await stopTestApplication(context);
  }
});

test("global and per-IP active connection caps reject upgrades without leaking counters", async () => {
  const globalContext = await startTestApplication({
    maxConnections: 2,
    maxConnectionsPerIp: 10,
  });
  try {
    const first = await connectClient(globalContext.address.websocketUrl);
    const second = await connectClient(globalContext.address.websocketUrl);
    globalContext.clients.push(first, second);
    assert.equal(globalContext.application.metrics().activeConnections, 2);
    await expectUpgradeStatus(globalContext.address.websocketUrl, 503);
    assert.equal(globalContext.application.metrics().activeConnections, 2);

    await first.close();
    await waitForCondition(
      () => globalContext.application.metrics().activeConnections === 1,
      "released global connection slot"
    );
    const replacement = await connectClient(globalContext.address.websocketUrl);
    globalContext.clients.push(replacement);
    assert.equal(globalContext.application.metrics().activeConnections, 2);
  } finally {
    await stopTestApplication(globalContext);
  }

  const perIpContext = await startTestApplication({
    trustProxy: true,
    maxConnections: 4,
    maxConnectionsPerIp: 1,
  });
  const firstIp = { headers: { "x-forwarded-for": "198.51.100.10" } };
  const secondIp = { headers: { "x-forwarded-for": "198.51.100.11" } };
  try {
    const first = await connectClient(perIpContext.address.websocketUrl, firstIp);
    perIpContext.clients.push(first);
    await expectUpgradeStatus(perIpContext.address.websocketUrl, 429, firstIp);
    assert.equal(perIpContext.application.metrics().activeConnections, 1);

    const otherAddress = await connectClient(perIpContext.address.websocketUrl, secondIp);
    perIpContext.clients.push(otherAddress);
    assert.equal(perIpContext.application.metrics().activeConnections, 2);

    await first.close();
    await waitForCondition(
      () => perIpContext.application.metrics().activeConnections === 1,
      "released per-IP connection slot"
    );
    const replacement = await connectClient(perIpContext.address.websocketUrl, firstIp);
    perIpContext.clients.push(replacement);
    assert.equal(perIpContext.application.metrics().activeConnections, 2);
  } finally {
    await stopTestApplication(perIpContext);
  }
});

test("session cap bounds disconnect churn while allowing the capped session to resume", async () => {
  const context = await startTestApplication({
    maxConnections: 4,
    maxConnectionsPerIp: 4,
    maxSessions: 1,
    reconnectGraceMs: 1000,
  });
  try {
    const original = await joinSession(context, "Only Session", "SESSION-CAP");
    const rejected = await connectClient(context.address.websocketUrl);
    context.clients.push(rejected);
    await rejected.waitForType("server.hello");
    rejected.send({
      type: "session.join",
      protocolVersion: protocol.VERSION,
      name: "Rejected Session",
      searchCode: "SESSION-CAP",
    });
    const capacityError = await rejected.waitForType("session.error");
    assert.equal(capacityError.code, "server_capacity");
    assert.equal(context.application.metrics().activeSessions, 1);

    original.client.terminate();
    await new Promise((resolve) => setTimeout(resolve, 30));
    const resumed = await joinSession(context, "Only Session", "SESSION-CAP", {
      sessionId: original.welcome.sessionId,
      resumeToken: original.welcome.resumeToken,
    });
    assert.equal(resumed.welcome.resumed, true);
    assert.equal(resumed.welcome.playerId, original.welcome.playerId);
    assert.equal(context.application.metrics().activeSessions, 1);
  } finally {
    await stopTestApplication(context);
  }
});

test("idle solo lobby TTL evicts connected sessions but never shortens reconnect grace", async () => {
  const idleContext = await startTestApplication({
    idleLobbyTtlMs: 100,
    reconnectGraceMs: 1000,
  });
  try {
    const idle = await joinSession(idleContext, "Idle Player", "IDLE-TTL");
    const timeoutError = await idle.client.waitForType("session.error", (message) => (
      message.code === "idle_lobby_timeout"
    ));
    assert.equal(timeoutError.fatal, true);
    await waitForCondition(
      () => idleContext.application.onlineServer.matchmaker.rooms.size === 0 &&
        idleContext.application.onlineServer.sessionStore.sessions.size === 0,
      "idle lobby eviction"
    );
    assert.equal(idleContext.application.metrics().idleLobbyExpirations, 1);
  } finally {
    await stopTestApplication(idleContext);
  }

  const reconnectContext = await startTestApplication({
    idleLobbyTtlMs: 200,
    reconnectGraceMs: 1000,
  });
  try {
    const original = await joinSession(reconnectContext, "Grace Player", "IDLE-GRACE");
    const roomId = original.room.id;
    original.client.terminate();
    await new Promise((resolve) => setTimeout(resolve, 300));
    assert.equal(reconnectContext.application.onlineServer.sessionStore.sessions.size, 1);
    assert.equal(reconnectContext.application.onlineServer.matchmaker.rooms.size, 1);

    const resumed = await joinSession(reconnectContext, "Grace Player", "IDLE-GRACE", {
      sessionId: original.welcome.sessionId,
      resumeToken: original.welcome.resumeToken,
    });
    assert.equal(resumed.welcome.resumed, true);
    assert.equal(resumed.room.id, roomId);
    assert.equal(resumed.welcome.playerId, original.welcome.playerId);
  } finally {
    await stopTestApplication(reconnectContext);
  }
});
