"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { WebSocket } = require("ws");

const protocol = require("../../multiplayer-protocol.js");
const { createOnlineApplication } = require("../app.js");
const { createDirectorApplication } = require("../director/app.js");
const { RegionHeartbeat } = require("../region-heartbeat.js");

const TOKEN = "region-heartbeat-test-token";
const TEST_TIMEOUT_MS = 15000;

async function waitFor(predicate, timeoutMs, label) {
  const deadline = Date.now() + (timeoutMs || 5000);
  let last = null;
  while (Date.now() < deadline) {
    last = await predicate();
    if (last) return last;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("timed out waiting for " + (label || "condition"));
}

// The server greets a new socket immediately, so the listener has to be attached
// in the same tick the socket is created or server.hello is dropped on the floor.
class ProbeClient {
  constructor(url) {
    this.messages = [];
    this.socket = new WebSocket(url);
    this.socket.on("message", (data) => {
      try {
        this.messages.push(JSON.parse(Buffer.isBuffer(data) ? data.toString("utf8") : String(data)));
      } catch (error) {
        // A non-JSON frame is never sent by this server; ignoring keeps the
        // helper from masking the real assertion failure.
      }
    });
  }

  open() {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.socket.terminate();
        reject(new Error("socket_open_timeout"));
      }, 5000);
      this.socket.once("open", () => {
        clearTimeout(timer);
        resolve(this);
      });
      this.socket.once("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
    });
  }

  send(message) {
    this.socket.send(JSON.stringify(message));
  }

  async waitFor(type) {
    const found = await waitFor(
      async () => this.messages.find((message) => message.type === type) || null,
      5000,
      "message " + type
    );
    return found;
  }

  close() {
    this.socket.close();
  }
}

function openSocket(url) {
  return new ProbeClient(url).open();
}

test("a region registers itself with the director and advertises its open codes", { timeout: TEST_TIMEOUT_MS }, async () => {
  const director = createDirectorApplication({
    log: false,
    port: 0,
    host: "127.0.0.1",
    config: {
      heartbeatToken: TOKEN,
      protocolVersion: protocol.VERSION,
      heartbeatIntervalMs: 1000,
      requestRatePerSecond: 500,
      requestRateBurst: 1000,
      staticRegions: [],
    },
  });
  const directorAddress = await director.start();

  const region = createOnlineApplication({
    log: false,
    port: 0,
    host: "127.0.0.1",
    config: {
      allowedOrigins: [],
      regionId: "eu-test",
      regionLabel: "Europe Test",
      regionPublicUrl: "wss://eu-test.example.com/online",
      directorUrl: directorAddress.httpUrl,
      directorToken: TOKEN,
      regionHeartbeatIntervalMs: 1000,
    },
  });
  const regionAddress = await region.start();

  try {
    const listed = await waitFor(async () => {
      const directory = await (await fetch(directorAddress.httpUrl + "/v1/regions")).json();
      return directory.regions.find((entry) => entry.id === "eu-test") || null;
    }, 6000, "the region to appear in the directory");

    assert.equal(listed.url, "wss://eu-test.example.com/online");
    assert.equal(listed.label, "Europe Test");
    assert.equal(listed.healthy, true);
    assert.equal(listed.verified, true);
    assert.equal((await fetch(directorAddress.httpUrl + "/readyz")).status, 200);

    // A player takes a coded room on this region; the next beat must publish the
    // code so a friend typing it is routed here rather than to the nearest box.
    const socket = await openSocket(regionAddress.websocketUrl);
    try {
      await socket.waitFor("server.hello");
      socket.send({
        type: "session.join",
        protocolVersion: protocol.VERSION,
        name: "Cowboy",
        searchCode: "POSSE",
      });
      await socket.waitFor("room.state");

      const pinned = await waitFor(async () => {
        const directory = await (await fetch(directorAddress.httpUrl + "/v1/regions?code=posse")).json();
        return directory.pinnedRegionId === "eu-test" ? directory : null;
      }, 6000, "the search code to pin to the region");
      assert.equal(pinned.pinnedReason, "active_room");
    } finally {
      socket.close();
    }
  } finally {
    await region.close();
    await director.close();
  }
});

test("a region answers latency probes before any session exists", { timeout: TEST_TIMEOUT_MS }, async () => {
  const region = createOnlineApplication({
    log: false,
    port: 0,
    host: "127.0.0.1",
    regionHeartbeat: false,
    config: { allowedOrigins: [], regionId: "probe-region" },
  });
  const address = await region.start();
  try {
    const socket = await openSocket(address.websocketUrl);
    try {
      const hello = await socket.waitFor("server.hello");
      assert.equal(hello.regionId, "probe-region");

      socket.send({ type: "session.ping", nonce: "abc", clientTime: 1234 });
      const pong = await socket.waitFor("session.pong");
      assert.equal(pong.nonce, "abc");
      assert.equal(pong.clientTime, 1234);
      assert.equal(pong.regionId, "probe-region");
      assert.equal(typeof pong.serverNow, "number");

      // The probe must not have consumed a session slot.
      assert.equal(region.metrics().activeSessions, 0);
      assert.equal(region.metrics().pingsAnswered, 1);
    } finally {
      socket.close();
    }
  } finally {
    await region.close();
  }
});

test("a half-configured region logs the missing settings instead of beating blindly", async () => {
  const events = [];
  const heartbeat = new RegionHeartbeat({
    directorUrl: "http://127.0.0.1:1",
    regionId: "",
    regionUrl: "",
    token: "",
    log: (level, event, details) => events.push({ level, event, details }),
    getState: () => ({}),
  });
  assert.equal(heartbeat.isConfigured(), false);
  assert.equal(heartbeat.start(), false);
  assert.equal(events.length, 1);
  assert.equal(events[0].event, "region_heartbeat_disabled");
  assert.deepEqual(events[0].details.missing, ["DIRECTOR_TOKEN", "REGION_ID", "REGION_PUBLIC_URL"]);
  await heartbeat.stop();
});

test("a director outage backs off and recovers without stopping the region", async () => {
  const attempts = [];
  let failing = true;
  const heartbeat = new RegionHeartbeat({
    directorUrl: "http://director.invalid",
    token: TOKEN,
    regionId: "eu-test",
    regionUrl: "wss://eu-test.example.com/online",
    intervalMs: 1000,
    log: () => {},
    getState: () => ({ protocolVersion: protocol.VERSION, ready: true, accepting: true }),
    fetch: async (url, init) => {
      attempts.push(JSON.parse(init.body));
      if (failing) throw new Error("connect_refused");
      return { ok: true, status: 200, json: async () => ({ ok: true, intervalMs: 1000 }) };
    },
  });

  assert.equal(await heartbeat.sendOnce(), false);
  assert.equal(heartbeat.failures, 1);
  assert.ok(heartbeat.nextDelayMs() > heartbeat.intervalMs, "expected backoff after a failure");

  failing = false;
  assert.equal(await heartbeat.sendOnce(), true);
  assert.equal(heartbeat.failures, 0);
  assert.equal(heartbeat.nextDelayMs(), heartbeat.intervalMs);
  assert.equal(attempts.length, 2);
  assert.equal(attempts[1].id, "eu-test");
  assert.equal(attempts[1].protocolVersion, protocol.VERSION);
  await heartbeat.stop();
});
