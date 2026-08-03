"use strict";

// End to end: a player's page reloads in the middle of a live online match, the
// lobby auto-resumes the stored session, the server replays the start, and the
// player is back inside the same match — input accepted, snapshots flowing.

const assert = require("node:assert/strict");
const test = require("node:test");
const { chromium } = require("playwright");

const { createOnlineApplication } = require("../app.js");

async function openClient(browser, url, name, code) {
  const context = await browser.newContext({
    viewport: { width: 960, height: 540 },
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.__dustOnlineTest);
  await page.keyboard.press("KeyM");
  await page.locator("#online-multiplayer-btn").click();
  await page.locator("#online-multiplayer-player-name").fill(name);
  await page.locator("#online-multiplayer-search-code").fill(code);
  await page.locator("#online-matchmaking-find-btn").click();
  return { context, page };
}

test("a page reload mid-match rejoins the same running match", { timeout: 240000 }, async () => {
  const application = createOnlineApplication({
    host: "127.0.0.1",
    port: 0,
    log: false,
    config: {
      allowedOrigins: [],
      maxMatches: 1,
      startAckTimeoutMs: 20000,
      reconnectGraceMs: 20000,
      heartbeatIntervalMs: 60000,
      resumeTokenSecret: "online-rejoin-integration-secret",
      workerStartupTimeoutMs: 60000,
      workerShutdownTimeoutMs: 10000,
    },
  });
  let browser = null;
  const clients = [];
  try {
    const address = await application.start();
    browser = await chromium.launch({
      headless: true,
      args: [
        "--disable-background-timer-throttling",
        "--disable-backgrounding-occluded-windows",
        "--disable-renderer-backgrounding",
      ],
    });
    clients.push(await openClient(browser, address.httpUrl + "/", "Rejoin Alpha", "REJOIN-E2E"));
    clients.push(await openClient(browser, address.httpUrl + "/", "Rejoin Bravo", "REJOIN-E2E"));

    await Promise.all(clients.map(({ page }) => page.waitForFunction(() => {
      const state = window.__dustOnlineTest.getState();
      return state.room && state.room.players && state.room.players.length === 2;
    }, null, { timeout: 90000 })));
    await Promise.all(clients.map(({ page }) => page.locator("#online-multiplayer-ready-btn").click()));
    await Promise.all(clients.map(({ page }) => page.waitForFunction(() => {
      const state = window.__dustOnlineTest.getState();
      return state.phase === "match" && state.transportKind === "online";
    }, null, { timeout: 120000 })));

    const pageA = clients[0].page;
    const before = await pageA.evaluate(() => window.__dustOnlineTest.getState());
    const matchId = before.room.matchId;
    const playerId = before.playerId;
    assert.ok(matchId, "the match must have started");

    // The page dies mid-match. sessionStorage survives the reload.
    await pageA.reload({ waitUntil: "domcontentloaded" });
    await pageA.waitForFunction(() => !!window.__dustOnlineTest, null, { timeout: 60000 });
    await pageA.keyboard.press("KeyM");
    await pageA.locator("#online-multiplayer-btn").click();

    // No Find Match click: opening the lobby auto-resumes the stored session,
    // the server replays the start, and the client re-enters the match.
    await pageA.waitForFunction((expected) => {
      const state = window.__dustOnlineTest.getState();
      return state.phase === "match" &&
        state.room && state.room.matchId === expected.matchId &&
        state.playerId === expected.playerId;
    }, { matchId, playerId }, { timeout: 60000 });

    // The other player never left the match.
    const stateB = await clients[1].page.evaluate(() => window.__dustOnlineTest.getState());
    assert.equal(stateB.phase, "match");
    assert.equal(stateB.room.matchId, matchId);

    // The authority sees the rejoined player as connected again.
    const worker = application.workerManager.get(matchId);
    assert.ok(worker, "the match worker must still be running");
    const authority = await worker.page.evaluate(
      () => window.__dustMultiplayerTest.getMultiplayerSyncDiagnostics()
    );
    const rejoined = authority.players.find((player) => player.id === playerId);
    assert.ok(rejoined, "the rejoined player must still be on the roster");
    assert.equal(rejoined.connected, true);

    // Snapshots flow to the rejoined page.
    await pageA.waitForFunction(() => {
      const state = window.__dustMultiplayerTest.getState();
      return state.players.some((player) => player.hasNetworkSnapshot);
    }, null, { timeout: 30000 });

    // If the player survived the reload, their input must act on the authority
    // again — the fresh-client counter reset is what makes this possible.
    if (rejoined.alive) {
      await pageA.keyboard.down("KeyW");
      await new Promise((resolve) => setTimeout(resolve, 2000));
      await pageA.keyboard.up("KeyW");
      const moved = await worker.page.evaluate(
        () => window.__dustMultiplayerTest.getMultiplayerSyncDiagnostics()
      );
      const after = moved.players.find((player) => player.id === playerId);
      assert.ok(
        after.lastInputSequence >= 0,
        "the authority must accept the reloaded client's fresh input sequence, got " + after.lastInputSequence
      );
    }
  } finally {
    for (const client of clients) await client.context.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
    await application.close().catch(() => {});
  }
});
