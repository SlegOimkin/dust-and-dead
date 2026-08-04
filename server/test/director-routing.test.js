"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { chromium } = require("playwright");

const protocol = require("../../multiplayer-protocol.js");
const { createOnlineApplication } = require("../app.js");
const { createDirectorApplication } = require("../director/app.js");

const TOKEN = "director-routing-integration-token";

// The routing decision happens before a match exists, so a stub keeps two whole
// Chromium instances out of a test that never starts one.
class IdleWorkerManager {
  async createMatch() { throw new Error("no_match_in_this_test"); }
  get() { return null; }
  async closeMatch() { return false; }
  readiness() {
    return { ready: true, activeMatches: 0, maxMatches: 4, browserConnected: true };
  }
  async close() {}
}

async function waitFor(predicate, timeoutMs, label) {
  const deadline = Date.now() + (timeoutMs || 8000);
  while (Date.now() < deadline) {
    const value = await predicate();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  throw new Error("timed out waiting for " + (label || "condition"));
}

async function startRegion(regionId, directorHttpUrl, options) {
  const settings = options || {};
  const application = createOnlineApplication({
    host: "127.0.0.1",
    port: 0,
    log: false,
    // A real GameWorkerManager is only needed by the test that actually plays a
    // match; the routing tests would otherwise pay for two idle Chromiums.
    workerManager: settings.realWorkers ? null : new IdleWorkerManager(),
    config: {
      allowedOrigins: [],
      resumeTokenSecret: "director-routing-secret",
      heartbeatIntervalMs: 60000,
      maxMatches: 1,
      startAckTimeoutMs: 20000,
      reconnectGraceMs: 5000,
      workerStartupTimeoutMs: 60000,
      workerShutdownTimeoutMs: 10000,
      regionId,
      regionLabel: regionId.toUpperCase(),
      directorUrl: directorHttpUrl,
      directorToken: TOKEN,
      regionHeartbeatIntervalMs: 1000,
    },
  });
  const address = await application.start();
  // The listening port is only known now, so the heartbeat is configured with the
  // real loopback address and started here rather than during start().
  application.regionHeartbeat.regionUrl = address.websocketUrl;
  application.regionHeartbeat.start();
  return { application, address };
}

function launchBrowser() {
  return chromium.launch({
    headless: true,
    args: [
      "--disable-background-timer-throttling",
      "--disable-backgrounding-occluded-windows",
      "--disable-renderer-backgrounding",
    ],
  });
}

async function openClient(browser, pageUrl, directorHttpUrl, searchCode, name) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.goto(pageUrl, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.__dustOnlineTest);
  await page.evaluate((director) => {
    window.DustAndDeadOnlineConfig = {
      directorUrl: director,
      url: "",
      path: "/online",
      reconnect: true,
      regionProbeLimit: 4,
      regionProbeTimeoutMs: 3000,
      // A public-pool client idling alone must stay on the real server: bot
      // backfill would silently detach it after 12 seconds.
      botBackfill: false,
    };
  }, directorHttpUrl);
  await page.keyboard.press("KeyM");
  await page.locator("#online-multiplayer-btn").click();
  await page.locator("#online-multiplayer-player-name").fill(name || "Router");
  if (searchCode) await page.locator("#online-multiplayer-search-code").fill(searchCode);
  await page.locator("#online-matchmaking-find-btn").click();
  return { context, page };
}

function settledState(client, timeoutMs, label) {
  return waitFor(async () => {
    const state = await client.page.evaluate(() => window.__dustOnlineTest.getState());
    return state.regionId && state.room ? state : null;
  }, timeoutMs || 30000, label || "the client to settle on a region");
}

test(
  "a real browser client is routed through the director onto a live region",
  { timeout: 120000 },
  async () => {
    const director = createDirectorApplication({
      host: "127.0.0.1",
      port: 0,
      log: false,
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
    const regions = [];
    let browser = null;
    const clients = [];

    try {
      regions.push(await startRegion("alpha", directorAddress.httpUrl));
      regions.push(await startRegion("beta", directorAddress.httpUrl));

      const directory = await waitFor(async () => {
        const body = await (await fetch(directorAddress.httpUrl + "/v1/regions")).json();
        return body.regions.length === 2 && body.regions.every((region) => region.healthy) ? body : null;
      }, 10000, "both regions to register");
      assert.deepEqual(directory.regions.map((region) => region.id).sort(), ["alpha", "beta"]);

      browser = await launchBrowser();

      // Public queue: the client measures both regions and commits to one of
      // them, ending up in a real room on that region's own matchmaker.
      const publicClient = await openClient(browser, regions[0].address.httpUrl + "/", directorAddress.httpUrl, "");
      clients.push(publicClient);
      const publicState = await settledState(publicClient);

      const chosen = regions.find((region) => region.application.config.regionId === publicState.regionId);
      assert.ok(chosen, "the client must choose one of the advertised regions");
      assert.equal(publicState.regionUrl, chosen.address.websocketUrl);
      assert.equal(publicState.regionSelectionPending, false);
      assert.equal(chosen.application.onlineServer.matchmaker.rooms.size, 1);
      const other = regions.find((region) => region !== chosen);
      assert.equal(other.application.onlineServer.matchmaker.rooms.size, 0);

      // A search code already claimed for the other region must beat latency:
      // otherwise two friends on the same code never meet.
      const pinnedRegion = other.application.config.regionId;
      const claim = await (await fetch(directorAddress.httpUrl + "/v1/route/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: "PINNED", regionId: pinnedRegion }),
      })).json();
      assert.equal(claim.regionId, pinnedRegion);

      const pinnedClient = await openClient(
        browser,
        chosen.address.httpUrl + "/",
        directorAddress.httpUrl,
        "PINNED"
      );
      clients.push(pinnedClient);
      const pinnedState = await settledState(pinnedClient, 30000, "the pinned client to settle");

      assert.equal(pinnedState.regionId, pinnedRegion);
      assert.equal(pinnedState.regionPinned, true);
      assert.equal(pinnedState.regionUrl, other.address.websocketUrl);
      assert.equal(other.application.onlineServer.matchmaker.rooms.size, 1);

      // The region now reports the code itself, so the director stops depending
      // on the client's claim.
      const pinnedDirectory = await waitFor(async () => {
        const body = await (await fetch(directorAddress.httpUrl + "/v1/regions?code=PINNED")).json();
        return body.pinnedReason === "active_room" ? body : null;
      }, 10000, "the region to report the open code");
      assert.equal(pinnedDirectory.pinnedRegionId, pinnedRegion);
    } finally {
      for (const client of clients) await client.context.close().catch(() => {});
      if (browser) await browser.close().catch(() => {});
      for (const region of regions) await region.application.close().catch(() => {});
      await director.close().catch(() => {});
    }
  }
);

test(
  "two friends sharing a code are routed to one region and play a real match there",
  { timeout: 300000 },
  async () => {
    const director = createDirectorApplication({
      host: "127.0.0.1",
      port: 0,
      log: false,
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
    const regions = [];
    let browser = null;
    const clients = [];

    try {
      // Both regions can really host a match, so nothing about the routing is
      // rigged: whichever one wins the probe has to carry the whole match.
      regions.push(await startRegion("west", directorAddress.httpUrl, { realWorkers: true }));
      regions.push(await startRegion("east", directorAddress.httpUrl, { realWorkers: true }));
      await waitFor(async () => {
        const body = await (await fetch(directorAddress.httpUrl + "/v1/regions")).json();
        return body.regions.length === 2 && body.regions.every((region) => region.healthy);
      }, 20000, "both regions to register");

      browser = await launchBrowser();

      // The first friend picks a region on measured latency and claims the code.
      const host = await openClient(
        browser,
        regions[0].address.httpUrl + "/",
        directorAddress.httpUrl,
        "DUSTPOSSE",
        "Routed Alpha"
      );
      clients.push(host);
      const hostState = await settledState(host, 60000, "the first friend to settle");
      const chosen = regions.find((region) => region.application.config.regionId === hostState.regionId);
      assert.ok(chosen, "the first friend must land on an advertised region");

      // The second friend joins from the *other* region's page, so only the code
      // can bring them together — latency alone would be a coin flip here.
      const guestOrigin = regions.find((region) => region !== chosen);
      const guest = await openClient(
        browser,
        guestOrigin.address.httpUrl + "/",
        directorAddress.httpUrl,
        "DUSTPOSSE",
        "Routed Bravo"
      );
      clients.push(guest);
      const guestState = await settledState(guest, 60000, "the second friend to settle");
      assert.equal(guestState.regionId, hostState.regionId);
      assert.equal(guestState.regionUrl, chosen.address.websocketUrl);

      // Same region and same room: the code did its job across regions.
      await Promise.all(clients.map(({ page }) => page.waitForFunction(() => {
        const state = window.__dustOnlineTest.getState();
        return state.room && state.room.players && state.room.players.length === 2;
      }, null, { timeout: 60000 })));
      const roomIds = await Promise.all(clients.map(({ page }) => page.evaluate(
        () => window.__dustOnlineTest.getState().room.id
      )));
      assert.equal(roomIds[0], roomIds[1]);

      // And the routed pair can actually play: ready up, then wait for the
      // server-authoritative match to take over on the chosen region.
      await Promise.all(clients.map(({ page }) => page.locator("#online-multiplayer-ready-btn").click()));
      await Promise.all(clients.map(({ page }) => page.waitForFunction(() => {
        const state = window.__dustOnlineTest.getState();
        return state.phase === "match" && state.transportKind === "online" && state.role === "guest";
      }, null, { timeout: 120000 })));

      const finalStates = await Promise.all(clients.map(({ page }) => page.evaluate(
        () => window.__dustOnlineTest.getState()
      )));
      assert.equal(finalStates[0].room.matchId, finalStates[1].room.matchId);
      assert.ok(finalStates[0].room.matchId, "the match must have a server-issued id");
      assert.equal(chosen.application.metrics().matchesStarted, 1);
      assert.equal(guestOrigin.application.metrics().matchesStarted, 0);

      // The authority page on that region is really simulating both players.
      const worker = chosen.application.workerManager.get(finalStates[0].room.matchId);
      assert.ok(worker, "the chosen region must own the authoritative worker");
      const authority = await worker.state();
      assert.equal(authority.dedicatedAuthority, true);
      assert.equal(authority.players.length, 2);
      assert.ok(authority.snapshotSequence > 0, "the authority must be broadcasting snapshots");

      // The director sees the region's load without being told by any client.
      const busy = await waitFor(async () => {
        const body = await (await fetch(directorAddress.httpUrl + "/v1/regions")).json();
        const entry = body.regions.find((region) => region.id === hostState.regionId);
        return entry && entry.activeMatches === 1 ? entry : null;
      }, 10000, "the director to observe the running match");
      assert.ok(busy.load > 0);
    } finally {
      for (const client of clients) await client.context.close().catch(() => {});
      if (browser) await browser.close().catch(() => {});
      for (const region of regions) await region.application.close().catch(() => {});
      await director.close().catch(() => {});
    }
  }
);
