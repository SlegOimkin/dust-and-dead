"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { chromium } = require("playwright");

const { createOnlineApplication } = require("../app.js");

async function openClient(browser, url, name, code) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
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

test("two real browser clients enter one server-authoritative online match", { timeout: 120000 }, async () => {
  const application = createOnlineApplication({
    host: "127.0.0.1",
    port: 0,
    log: false,
    config: {
      allowedOrigins: [],
      maxMatches: 1,
      startAckTimeoutMs: 20000,
      reconnectGraceMs: 5000,
      heartbeatIntervalMs: 60000,
      resumeTokenSecret: "full-online-match-integration-secret",
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
    clients.push(await openClient(browser, address.httpUrl + "/", "E2E Alpha", "E2E-ROOM"));
    clients.push(await openClient(browser, address.httpUrl + "/", "E2E Bravo", "E2E-ROOM"));

    await Promise.all(clients.map(({ page }) => page.waitForFunction(() => {
      const state = window.__dustOnlineTest.getState();
      return state.room && state.room.players && state.room.players.length === 2;
    })));
    await Promise.all(clients.map(({ page }) => page.locator("#online-multiplayer-ready-btn").click()));
    await Promise.all(clients.map(({ page }) => page.waitForFunction(() => {
      const state = window.__dustOnlineTest.getState();
      return state.phase === "match" && state.transportKind === "online" && state.role === "guest";
    }, null, { timeout: 90000 })));

    const firstState = await clients[0].page.evaluate(() => window.__dustOnlineTest.getState());
    const secondState = await clients[1].page.evaluate(() => window.__dustOnlineTest.getState());
    assert.equal(firstState.room.id, secondState.room.id);
    assert.ok(firstState.room.matchId);
    assert.equal(firstState.room.matchId, secondState.room.matchId);
    assert.equal(application.metrics().matchesStarted, 1);
    assert.equal(application.metrics().worker.activeMatches, 1);

    const worker = application.workerManager.get(firstState.room.matchId);
    assert.ok(worker, "authoritative worker should exist on the server");
    const authorityState = await worker.state();
    assert.equal(authorityState.dedicatedAuthority, true);
    assert.equal(authorityState.matchId, firstState.room.matchId);
    assert.equal(authorityState.players.length, 2);
    assert.ok(authorityState.snapshotSequence > 0);
  } finally {
    for (const client of clients) await client.context.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
    await application.close().catch(() => {});
  }
});
