"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const protocol = require("../../../multiplayer-protocol.js");
const { createDirectorApplication } = require("../app.js");

const TOKEN = "director-test-token";

async function withDirector(overrides, run) {
  const application = createDirectorApplication({
    log: false,
    port: 0,
    host: "127.0.0.1",
    config: Object.assign({
      heartbeatToken: TOKEN,
      protocolVersion: protocol.VERSION,
      regionTtlMs: 45000,
      claimTtlMs: 90000,
      requestRatePerSecond: 500,
      requestRateBurst: 1000,
      staticRegions: [],
    }, overrides || {}),
  });
  const address = await application.start();
  try {
    await run(address.httpUrl, application);
  } finally {
    await application.close();
  }
}

function heartbeatBody(overrides) {
  return Object.assign({
    id: "eu-central",
    label: "Europe",
    url: "wss://eu.example.com/online",
    protocolVersion: protocol.VERSION,
    ready: true,
    accepting: true,
    activeMatches: 0,
    maxMatches: 4,
    connections: 0,
    maxConnections: 256,
    codes: [],
  }, overrides || {});
}

function postJson(base, path, body, token) {
  return fetch(base + path, {
    method: "POST",
    headers: Object.assign(
      { "Content-Type": "application/json" },
      token ? { Authorization: "Bearer " + token } : {}
    ),
    body: JSON.stringify(body),
  });
}

test("an unauthenticated heartbeat cannot register a region", async () => {
  await withDirector({}, async (base) => {
    const anonymous = await postJson(base, "/v1/regions/heartbeat", heartbeatBody());
    assert.equal(anonymous.status, 401);
    const wrong = await postJson(base, "/v1/regions/heartbeat", heartbeatBody(), "not-the-token");
    assert.equal(wrong.status, 401);
    const listed = await (await fetch(base + "/v1/regions")).json();
    assert.equal(listed.regions.length, 0);
  });
});

test("heartbeats are refused outright when no shared secret is configured", async () => {
  await withDirector({ heartbeatToken: "" }, async (base) => {
    const response = await postJson(base, "/v1/regions/heartbeat", heartbeatBody(), "anything");
    assert.equal(response.status, 503);
  });
});

test("an authenticated heartbeat publishes a routable region to clients", async () => {
  await withDirector({}, async (base) => {
    const accepted = await postJson(base, "/v1/regions/heartbeat", heartbeatBody(), TOKEN);
    assert.equal(accepted.status, 200);
    const acknowledgement = await accepted.json();
    assert.equal(acknowledgement.ok, true);
    assert.equal(acknowledgement.regionId, "eu-central");
    assert.equal(typeof acknowledgement.intervalMs, "number");

    const directory = await (await fetch(base + "/v1/regions")).json();
    assert.equal(directory.protocolVersion, protocol.VERSION);
    assert.equal(directory.regions.length, 1);
    assert.equal(directory.regions[0].id, "eu-central");
    assert.equal(directory.regions[0].url, "wss://eu.example.com/online");
    assert.equal(directory.regions[0].healthy, true);
    assert.equal(directory.pinnedRegionId, "");
  });
});

test("the directory is readable cross-origin so a WebView or another origin can route", async () => {
  await withDirector({}, async (base) => {
    const response = await fetch(base + "/v1/regions", { headers: { Origin: "null" } });
    assert.equal(response.headers.get("access-control-allow-origin"), "*");
    const preflight = await fetch(base + "/v1/route/claim", {
      method: "OPTIONS",
      headers: { Origin: "null", "Access-Control-Request-Method": "POST" },
    });
    assert.equal(preflight.status, 204);
    assert.ok(String(preflight.headers.get("access-control-allow-headers")).includes("content-type"));
  });
});

test("readiness reports not-ready until at least one region can actually take players", async () => {
  await withDirector({}, async (base) => {
    assert.equal((await fetch(base + "/readyz")).status, 503);
    assert.equal((await fetch(base + "/healthz")).status, 200);
    await postJson(base, "/v1/regions/heartbeat", heartbeatBody(), TOKEN);
    assert.equal((await fetch(base + "/readyz")).status, 200);
    await postJson(base, "/v1/regions/heartbeat", heartbeatBody({ accepting: false }), TOKEN);
    assert.equal((await fetch(base + "/readyz")).status, 503);
  });
});

test("a claimed search code pins both friends to the same region", async () => {
  await withDirector({}, async (base) => {
    await postJson(base, "/v1/regions/heartbeat", heartbeatBody({ id: "eu", url: "wss://eu.example.com/online" }), TOKEN);
    await postJson(base, "/v1/regions/heartbeat", heartbeatBody({ id: "us", url: "wss://us.example.com/online" }), TOKEN);

    const first = await (await postJson(base, "/v1/route/claim", { code: "posse", regionId: "us" })).json();
    assert.equal(first.regionId, "us");

    const second = await (await postJson(base, "/v1/route/claim", { code: "POSSE", regionId: "eu" })).json();
    assert.equal(second.regionId, "us");

    const directory = await (await fetch(base + "/v1/regions?code=posse")).json();
    assert.equal(directory.pinnedRegionId, "us");
    assert.equal(directory.pinnedReason, "claim");

    const publicQueue = await (await fetch(base + "/v1/regions")).json();
    assert.equal(publicQueue.pinnedRegionId, "");
  });
});

test("claiming an unknown region is refused instead of silently pinning nothing", async () => {
  await withDirector({}, async (base) => {
    const response = await postJson(base, "/v1/route/claim", { code: "posse", regionId: "nowhere" });
    assert.equal(response.status, 409);
    assert.equal((await response.json()).error, "region_unavailable");
  });
});

test("a heartbeat with a mismatched protocol version is rejected with a clear error", async () => {
  await withDirector({}, async (base) => {
    const response = await postJson(
      base,
      "/v1/regions/heartbeat",
      heartbeatBody({ protocolVersion: protocol.VERSION - 1 }),
      TOKEN
    );
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error, "protocol_version_mismatch");
  });
});

test("oversized and malformed bodies are rejected without crashing the director", async () => {
  await withDirector({ maxBodyBytes: 2048 }, async (base) => {
    const huge = await fetch(base + "/v1/regions/heartbeat", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + TOKEN },
      body: JSON.stringify(heartbeatBody({ label: "x".repeat(4096) })),
    });
    assert.equal(huge.status, 413);

    const malformed = await fetch(base + "/v1/route/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{not json",
    });
    assert.equal(malformed.status, 400);

    assert.equal((await fetch(base + "/healthz")).status, 200);
  });
});

test("unknown routes and methods answer with json instead of hanging", async () => {
  await withDirector({}, async (base) => {
    assert.equal((await fetch(base + "/v1/nope")).status, 404);
    assert.equal((await fetch(base + "/v1/regions", { method: "DELETE" })).status, 405);
    assert.equal((await fetch(base + "/v1/nope", { method: "POST" })).status, 404);
  });
});

test("request flooding from one address is rate limited", async () => {
  await withDirector({ requestRatePerSecond: 1, requestRateBurst: 3 }, async (base) => {
    const statuses = [];
    for (let index = 0; index < 8; index += 1) {
      statuses.push((await fetch(base + "/healthz")).status);
    }
    assert.ok(statuses.includes(429), "expected at least one 429, got " + statuses.join(","));
  });
});

test("metrics expose region and claim counts for operators", async () => {
  await withDirector({}, async (base) => {
    await postJson(base, "/v1/regions/heartbeat", heartbeatBody(), TOKEN);
    await postJson(base, "/v1/route/claim", { code: "posse", regionId: "eu-central" });
    const metrics = await (await fetch(base + "/metrics")).json();
    assert.equal(metrics.regions, 1);
    assert.equal(metrics.joinableRegions, 1);
    assert.equal(metrics.claims, 1);
    assert.equal(metrics.heartbeatsReceived, 1);
  });
});
