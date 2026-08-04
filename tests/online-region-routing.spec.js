const path = require("node:path");
const { expect, test } = require("@playwright/test");

const PROTOCOL_VERSION = 47;

function fileUrl(relativePath) {
  const absolute = path.resolve(__dirname, "..", relativePath).replace(/\\/g, "/");
  return `file:///${absolute}`;
}

// A WebSocket stub whose greeting and pong delays are configurable per host, so
// a test can decide which region "wins" the latency probe deterministically.
async function installRegionNetwork(page, options) {
  await page.addInitScript((settings) => {
    window.__regionLog = {
      directorRequests: [],
      claims: [],
      sockets: [],
      sent: [],
    };

    const latency = settings.latency || {};
    const directorBody = settings.directorBody;
    const directorFails = !!settings.directorFails;

    function delayFor(url) {
      const entry = Object.keys(latency).find((key) => String(url).indexOf(key) !== -1);
      return entry ? latency[entry] : 5;
    }

    window.fetch = function (url, init) {
      const target = String(url);
      const method = String((init && init.method) || "GET").toUpperCase();
      if (method === "POST" && target.indexOf("/v1/route/claim") !== -1) {
        const body = JSON.parse(String(init.body || "{}"));
        window.__regionLog.claims.push(body);
        const winner = settings.claimWinner || body.regionId;
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ ok: true, code: body.code, regionId: winner, reason: "claim" }),
        });
      }
      window.__regionLog.directorRequests.push(target);
      if (directorFails) return Promise.reject(new Error("director unreachable"));
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(directorBody),
      });
    };

    class FakeWebSocket {
      constructor(url) {
        this.url = url;
        this.readyState = 0;
        this.closedWith = null;
        this.sent = [];
        window.__regionLog.sockets.push(this);
        const delay = delayFor(url);
        setTimeout(() => {
          if (this.readyState !== 0) return;
          this.readyState = 1;
          if (this.onopen) this.onopen({});
          // The real server greets immediately on connect.
          this.deliver({
            type: "server.hello",
            protocolVersion: settings.protocolVersion,
            reconnectGraceMs: 20000,
            regionId: this.regionId(),
            regionLabel: this.regionId(),
            serverNow: Date.now(),
          });
        }, delay);
      }

      regionId() {
        const match = /\/\/([^./:]+)/.exec(String(this.url));
        return match ? match[1] : "";
      }

      deliver(message) {
        if (this.onmessage) this.onmessage({ data: JSON.stringify(message) });
      }

      send(data) {
        const message = JSON.parse(String(data));
        this.sent.push(message);
        window.__regionLog.sent.push({ url: this.url, message });
        if (message.type !== "session.ping") return;
        setTimeout(() => {
          if (this.readyState !== 1) return;
          this.deliver({
            type: "session.pong",
            nonce: message.nonce,
            clientTime: message.clientTime,
            regionId: this.regionId(),
            serverNow: Date.now(),
          });
        }, delayFor(this.url));
      }

      close(code, reason) {
        if (this.readyState === 3) return;
        this.readyState = 3;
        this.closedWith = { code, reason };
        if (this.onclose) this.onclose({ code: code || 1000 });
      }
    }

    window.WebSocket = FakeWebSocket;
  }, Object.assign({ protocolVersion: PROTOCOL_VERSION }, options));
}

function directory(regions, pinnedRegionId) {
  return {
    protocolVersion: PROTOCOL_VERSION,
    serverNow: Date.now(),
    ttlMs: 30000,
    pinnedRegionId: pinnedRegionId || "",
    pinnedReason: pinnedRegionId ? "active_room" : "",
    regions: regions.map((region) => Object.assign({
      healthy: true,
      load: 0,
      priority: 0,
      reachable: true,
      verified: true,
    }, region)),
  };
}

async function openOnlineLobby(page, config) {
  await page.goto(fileUrl("index.html"));
  await page.keyboard.press("KeyM");
  await page.evaluate((value) => {
    window.DustAndDeadOnlineConfig = value;
  }, Object.assign({
    directorUrl: "https://director.test",
    url: "",
    path: "/online",
    reconnect: true,
    regionProbeLimit: 4,
    regionProbeTimeoutMs: 2000,
    botBackfill: false,
  }, config || {}));
  await page.locator("#online-multiplayer-btn").click();
  await expect(page.locator("#online-multiplayer-lobby")).toBeVisible();
}

test("the client connects to the region with the lowest measured round trip", async ({ page }) => {
  await installRegionNetwork(page, {
    latency: { "far.test": 220, "mid.test": 90, "near.test": 8 },
    directorBody: directory([
      { id: "far", label: "Far", url: "wss://far.test/online" },
      { id: "mid", label: "Mid", url: "wss://mid.test/online" },
      { id: "near", label: "Near", url: "wss://near.test/online" },
    ]),
  });
  await openOnlineLobby(page);

  await page.locator("#online-matchmaking-find-btn").click();

  await expect
    .poll(() => page.evaluate(() => window.__dustOnlineTest.getState().regionId), { timeout: 15000 })
    .toBe("near");

  const state = await page.evaluate(() => window.__dustOnlineTest.getState());
  expect(state.regionUrl).toBe("wss://near.test/online");
  expect(state.regionPingMs).toBeGreaterThanOrEqual(0);
  expect(state.regionSelectionPending).toBe(false);

  // Every candidate was measured, and only the winner survived.
  const sockets = await page.evaluate(() => window.__regionLog.sockets.map((socket) => ({
    url: socket.url,
    readyState: socket.readyState,
  })));
  expect(sockets).toHaveLength(3);
  expect(sockets.filter((socket) => socket.readyState === 1).map((socket) => socket.url))
    .toEqual(["wss://near.test/online"]);

  // The winning probe became the live connection: session.join went out on it
  // without opening a second socket to the same host.
  const joins = await page.evaluate(() => window.__regionLog.sent
    .filter((entry) => entry.message.type === "session.join")
    .map((entry) => entry.url));
  expect(joins).toEqual(["wss://near.test/online"]);

  await expect(page.locator("#online-multiplayer-region")).toBeVisible();
  await expect(page.locator("#online-multiplayer-region-value")).toContainText("Near");
});

test("a search code already held by a region overrides the latency winner", async ({ page }) => {
  await installRegionNetwork(page, {
    latency: { "far.test": 200, "near.test": 5 },
    directorBody: directory([
      { id: "far", label: "Far", url: "wss://far.test/online" },
      { id: "near", label: "Near", url: "wss://near.test/online" },
    ], "far"),
  });
  await openOnlineLobby(page);

  await page.locator("#online-multiplayer-search-code").fill("POSSE");
  await page.locator("#online-matchmaking-find-btn").click();

  await expect
    .poll(() => page.evaluate(() => window.__dustOnlineTest.getState().regionId), { timeout: 15000 })
    .toBe("far");

  const state = await page.evaluate(() => window.__dustOnlineTest.getState());
  expect(state.regionPinned).toBe(true);

  // A pinned code skips the race entirely: the near region is never probed.
  const probed = await page.evaluate(() => window.__regionLog.sockets.map((socket) => socket.url));
  expect(probed).toEqual(["wss://far.test/online"]);

  const request = await page.evaluate(() => window.__regionLog.directorRequests[0]);
  expect(request).toContain("code=POSSE");
});

test("losing a claim race re-targets the client to the region that won it", async ({ page }) => {
  await installRegionNetwork(page, {
    latency: { "alpha.test": 5, "beta.test": 120 },
    directorBody: directory([
      { id: "alpha", label: "Alpha", url: "wss://alpha.test/online" },
      { id: "beta", label: "Beta", url: "wss://beta.test/online" },
    ]),
    claimWinner: "beta",
  });
  await openOnlineLobby(page);

  await page.locator("#online-multiplayer-search-code").fill("POSSE");
  await page.locator("#online-matchmaking-find-btn").click();

  await expect
    .poll(() => page.evaluate(() => window.__dustOnlineTest.getState().regionId), { timeout: 15000 })
    .toBe("beta");

  const claims = await page.evaluate(() => window.__regionLog.claims);
  expect(claims).toEqual([{ code: "POSSE", regionId: "alpha" }]);

  const joins = await page.evaluate(() => window.__regionLog.sent
    .filter((entry) => entry.message.type === "session.join")
    .map((entry) => entry.url));
  expect(joins).toEqual(["wss://beta.test/online"]);
});

test("an unreachable director falls back to the configured direct address", async ({ page }) => {
  await installRegionNetwork(page, {
    latency: { "fallback.test": 5 },
    directorFails: true,
  });
  await openOnlineLobby(page, { url: "wss://fallback.test/online" });

  await page.locator("#online-matchmaking-find-btn").click();

  const joins = await page.evaluate(() => window.__regionLog.sent
    .filter((entry) => entry.message.type === "session.join")
    .map((entry) => entry.url));
  await expect
    .poll(() => page.evaluate(() => window.__regionLog.sent
      .filter((entry) => entry.message.type === "session.join").length), { timeout: 15000 })
    .toBe(1);
  expect(joins.length).toBeLessThanOrEqual(1);

  const state = await page.evaluate(() => window.__dustOnlineTest.getState());
  expect(state.regionSelectionPending).toBe(false);
  const finalJoins = await page.evaluate(() => window.__regionLog.sent
    .filter((entry) => entry.message.type === "session.join")
    .map((entry) => entry.url));
  expect(finalJoins).toEqual(["wss://fallback.test/online"]);
});

test("no reachable region and no fallback reports a routing error instead of hanging", async ({ page }) => {
  await installRegionNetwork(page, {
    directorBody: directory([]),
  });
  await openOnlineLobby(page, { url: "" });

  await page.locator("#online-matchmaking-find-btn").click();

  await expect
    .poll(() => page.evaluate(() => window.__dustOnlineTest.getState().connectionState), { timeout: 15000 })
    .toBe("error");
  await expect(page.locator("#online-multiplayer-status")).toContainText("No game region is available");
  const state = await page.evaluate(() => window.__dustOnlineTest.getState());
  expect(state.regionSelectionPending).toBe(false);
  expect(state.desiredQueue).toBe(false);
});

test("a director on another protocol version is ignored rather than trusted", async ({ page }) => {
  await installRegionNetwork(page, {
    latency: { "fallback.test": 5 },
    directorBody: Object.assign(directory([
      { id: "wrong", label: "Wrong", url: "wss://wrong.test/online" },
    ]), { protocolVersion: PROTOCOL_VERSION - 1 }),
  });
  await openOnlineLobby(page, { url: "wss://fallback.test/online" });

  await page.locator("#online-matchmaking-find-btn").click();

  await expect
    .poll(() => page.evaluate(() => window.__regionLog.sent
      .filter((entry) => entry.message.type === "session.join")
      .map((entry) => entry.url)), { timeout: 15000 })
    .toEqual(["wss://fallback.test/online"]);
  const probed = await page.evaluate(() => window.__regionLog.sockets.map((socket) => socket.url));
  expect(probed).not.toContain("wss://wrong.test/online");
});

test("a reconnect returns to the chosen region instead of re-racing the probe", async ({ page }) => {
  await installRegionNetwork(page, {
    latency: { "far.test": 200, "near.test": 6 },
    directorBody: directory([
      { id: "far", label: "Far", url: "wss://far.test/online" },
      { id: "near", label: "Near", url: "wss://near.test/online" },
    ]),
  });
  await openOnlineLobby(page);

  await page.locator("#online-matchmaking-find-btn").click();
  await expect
    .poll(() => page.evaluate(() => window.__dustOnlineTest.getState().regionId), { timeout: 15000 })
    .toBe("near");

  const beforeRequests = await page.evaluate(() => window.__regionLog.directorRequests.length);
  await page.evaluate(() => {
    window.__dustOnlineTest.receiveEnvelope({
      type: "session.welcome",
      protocolVersion: 47,
      sessionId: "session-1",
      playerId: "player-1",
      resumeToken: "resume-1",
      reconnectGraceMs: 20000,
      resumed: false,
      serverNow: Date.now(),
    });
    const live = window.__regionLog.sockets.filter((socket) => socket.readyState === 1);
    live[live.length - 1].close(1006, "dropped");
  });

  await expect
    .poll(() => page.evaluate(() => window.__regionLog.sockets
      .filter((socket) => String(socket.url).indexOf("near.test") !== -1).length), { timeout: 15000 })
    .toBeGreaterThan(1);

  const probed = await page.evaluate(() => window.__regionLog.sockets.map((socket) => socket.url));
  expect(probed.filter((url) => url.indexOf("far.test") !== -1)).toHaveLength(1);
  const afterRequests = await page.evaluate(() => window.__regionLog.directorRequests.length);
  expect(afterRequests).toBe(beforeRequests);
});
