const path = require("node:path");
const { expect, test } = require("@playwright/test");

function fileUrl(relativePath) {
  const absolute = path.resolve(__dirname, "..", relativePath).replace(/\\/g, "/");
  return `file:///${absolute}`;
}

async function openGame(page) {
  await page.goto(`${fileUrl("index.html")}?mapSeed=7331`);
  const intro = page.locator("#intro-screen");
  if (await intro.isVisible().catch(() => false)) {
    await page.keyboard.press("KeyM");
    await expect(intro).toBeHidden();
  }
  await page.waitForFunction(() => Boolean(
    window.__dustMultiplayerTest?.getMatchHistoryDiagnostics &&
    window.__dustMultiplayerTest?.getNetworkCombatDiagnostics
  ));
}

test("host death adds one match-history row", async ({ page }) => {
  await openGame(page);

  const result = await page.evaluate(() => {
    const api = window.__dustMultiplayerTest;
    api.startMockHost(["Host", "Guest"]);
    const firstDamage = api.damagePlayer("mock-player-1", 999, "mock-player-2");
    const afterFirstDamage = api.getMatchHistoryDiagnostics();
    const repeatedDamage = api.damagePlayer("mock-player-1", 999, "mock-player-2");
    const afterRepeatedDamage = api.getMatchHistoryDiagnostics();
    return { firstDamage, repeatedDamage, afterFirstDamage, afterRepeatedDamage };
  });

  expect(result.firstDamage).toBe(true);
  expect(result.repeatedDamage).toBe(false);
  expect(result.afterFirstDamage).toMatchObject({
    hidden: false,
    entries: [{
      type: "playerDied",
      playerId: "mock-player-1",
      playerName: "Host",
      deathSequence: 1,
      text: "Host went down",
    }],
    rendered: [{
      type: "playerDied",
      playerId: "mock-player-1",
      deathSequence: 1,
      text: "Host went down",
    }],
  });
  expect(result.afterRepeatedDamage.entries).toEqual(result.afterFirstDamage.entries);
  expect(result.afterRepeatedDamage.rendered).toEqual(result.afterFirstDamage.rendered);
});

test("reviving and dying again records death sequence two", async ({ page }) => {
  await openGame(page);

  const result = await page.evaluate(() => {
    const api = window.__dustMultiplayerTest;
    api.startMockHost(["Host", "Guest"]);
    api.setPoints("mock-player-1", 20);
    api.damagePlayer("mock-player-1", 999, "mock-player-2");
    const revived = api.revive("mock-player-1", "history-revive-life-1");
    const secondDeath = api.damagePlayer("mock-player-1", 999, "mock-player-2");
    return {
      revived,
      secondDeath,
      player: api.getState().players.find((entry) => entry.id === "mock-player-1"),
      history: api.getMatchHistoryDiagnostics(),
    };
  });

  expect(result.revived).toBe(true);
  expect(result.secondDeath).toBe(true);
  expect(result.player.deaths).toBe(2);
  expect(result.history.entries.map(({ type, playerId, deathSequence }) => ({
    type,
    playerId,
    deathSequence,
  }))).toEqual([
    { type: "playerDied", playerId: "mock-player-1", deathSequence: 2 },
    { type: "playerDied", playerId: "mock-player-1", deathSequence: 1 },
  ]);
  expect(result.history.rendered.map((entry) => entry.deathSequence)).toEqual([2, 1]);
});

test("surrender adds the final-fall row after the death row", async ({ page }) => {
  await openGame(page);

  const result = await page.evaluate(() => {
    const api = window.__dustMultiplayerTest;
    api.startMockHost(["Host", "Fallen", "Witness"]);
    api.damagePlayer("mock-player-2", 999, "mock-player-1");
    const surrendered = api.surrender("mock-player-2");
    return { surrendered, history: api.getMatchHistoryDiagnostics() };
  });

  expect(result.surrendered).toBe(true);
  expect(result.history.hidden).toBe(false);
  expect(result.history.entries.map(({ type, playerId, playerName, deathSequence, text }) => ({
    type,
    playerId,
    playerName,
    deathSequence,
    text,
  }))).toEqual([
    {
      type: "playerEliminated",
      playerId: "mock-player-2",
      playerName: "Fallen",
      deathSequence: 1,
      text: "Fallen fell for good",
    },
    {
      type: "playerDied",
      playerId: "mock-player-2",
      playerName: "Fallen",
      deathSequence: 1,
      text: "Fallen went down",
    },
  ]);
  expect(result.history.rendered.map((entry) => entry.type)).toEqual([
    "playerEliminated",
    "playerDied",
  ]);
});

test("a disconnected player gets one distinct left-match row", async ({ page }) => {
  await openGame(page);

  const result = await page.evaluate(() => {
    const api = window.__dustMultiplayerTest;
    api.startMockHost(["Host", "Quitter", "Witness"]);
    const disconnected = api.setConnected("mock-player-2", false);
    api.setConnected("mock-player-2", false);
    return { disconnected, history: api.getMatchHistoryDiagnostics() };
  });

  expect(result.disconnected).toBe(true);
  expect(result.history).toMatchObject({
    hidden: false,
    entries: [{
      type: "playerLeft",
      playerId: "mock-player-2",
      playerName: "Quitter",
      deathSequence: 0,
      text: "Quitter left the match",
    }],
    rendered: [{
      type: "playerLeft",
      playerId: "mock-player-2",
      deathSequence: 0,
      text: "Quitter left the match",
    }],
  });
});

test("guest applies reliable death events once and keeps consuming the event stream", async ({ page }) => {
  await openGame(page);

  const result = await page.evaluate(() => {
    const api = window.__dustMultiplayerTest;
    api.startMockHost(["Host", "Fallen", "Guest"]);
    api.damagePlayer("mock-player-2", 999, "mock-player-1");
    api.surrender("mock-player-2");
    const snapshot = api.buildSnapshot();

    api.startMockGuest(["Host", "Fallen", "Guest"], 2);
    api.applySnapshot(snapshot);
    const afterFirst = {
      history: api.getMatchHistoryDiagnostics(),
      network: api.getNetworkCombatDiagnostics(),
    };

    const replay = JSON.parse(JSON.stringify(snapshot));
    replay.sequence += 1;
    api.applySnapshot(replay);
    const afterReplay = {
      history: api.getMatchHistoryDiagnostics(),
      network: api.getNetworkCombatDiagnostics(),
    };

    const continuation = JSON.parse(JSON.stringify(snapshot));
    continuation.sequence += 2;
    continuation.combatEvents = [{
      sequence: 3,
      type: "playerLeft",
      playerId: "mock-player-3",
      playerName: "Guest",
      deathSequence: 0,
      matchTime: 12.5,
    }];
    api.applySnapshot(continuation);
    const afterContinuation = {
      history: api.getMatchHistoryDiagnostics(),
      network: api.getNetworkCombatDiagnostics(),
    };

    return {
      snapshotEvents: snapshot.combatEvents,
      afterFirst,
      afterReplay,
      afterContinuation,
    };
  });

  expect(result.snapshotEvents.map(({ sequence, type }) => ({ sequence, type }))).toEqual([
    { sequence: 1, type: "playerDied" },
    { sequence: 2, type: "playerEliminated" },
  ]);
  expect(result.afterFirst.history.entries.map((entry) => entry.type)).toEqual([
    "playerEliminated",
    "playerDied",
  ]);
  expect(result.afterFirst.network.lastCombatEventSequence).toBe(2);
  expect(result.afterFirst.network.guestEvents.map((entry) => entry.type)).toEqual([
    "playerDied",
    "playerEliminated",
  ]);

  expect(result.afterReplay.history.entries).toEqual(result.afterFirst.history.entries);
  expect(result.afterReplay.history.rendered).toEqual(result.afterFirst.history.rendered);
  expect(result.afterReplay.network.guestEvents).toEqual(result.afterFirst.network.guestEvents);

  expect(result.afterContinuation.network.lastCombatEventSequence).toBe(3);
  expect(result.afterContinuation.network.guestEvents.map((entry) => entry.type)).toEqual([
    "playerDied",
    "playerEliminated",
    "playerLeft",
  ]);
  expect(result.afterContinuation.history.entries.map((entry) => entry.type)).toEqual([
    "playerLeft",
    "playerEliminated",
    "playerDied",
  ]);
  expect(result.afterContinuation.history.entries.filter((entry) => entry.type === "playerDied")).toHaveLength(1);
  expect(result.afterContinuation.history.entries.filter((entry) => entry.type === "playerEliminated")).toHaveLength(1);
});

test("starting a new mock match clears and hides the old feed", async ({ page }) => {
  await openGame(page);

  const result = await page.evaluate(() => {
    const api = window.__dustMultiplayerTest;
    api.startMockHost(["First Host", "First Guest"]);
    api.damagePlayer("mock-player-2", 999, "mock-player-1");
    const before = api.getMatchHistoryDiagnostics();
    api.startMockHost(["New Host", "New Guest"]);
    const after = api.getMatchHistoryDiagnostics();
    return { before, after };
  });

  expect(result.before.hidden).toBe(false);
  expect(result.before.entries).toHaveLength(1);
  expect(result.after).toEqual({ hidden: true, entries: [], rendered: [] });
  await expect(page.locator("#multiplayer-event-history")).toBeHidden();
  await expect(page.locator("#multiplayer-event-history-list > li")).toHaveCount(0);
});

test("compact landscape history stays on the right without covering mobile fire", async ({ page }) => {
  await page.setViewportSize({ width: 740, height: 380 });
  await openGame(page);

  const diagnostics = await page.evaluate(() => {
    const api = window.__dustMultiplayerTest;
    api.startMockHost(["Host", "Guest", "Witness"]);
    api.damagePlayer("mock-player-2", 999, "mock-player-1");
    api.refreshPlayerUi();
    return api.getMatchHistoryDiagnostics();
  });

  expect(diagnostics.hidden).toBe(false);
  await expect(page.locator("#multiplayer-event-history")).toBeVisible();
  await expect(page.locator("#mobile-fire")).toBeVisible();

  const layout = await page.evaluate(() => {
    function rect(selector) {
      const box = document.querySelector(selector).getBoundingClientRect();
      return {
        left: box.left,
        top: box.top,
        right: box.right,
        bottom: box.bottom,
        width: box.width,
        height: box.height,
      };
    }
    return {
      viewport: { width: innerWidth, height: innerHeight },
      history: rect("#multiplayer-event-history"),
      fire: rect("#mobile-fire"),
    };
  });

  const overlaps = !(
    layout.history.right <= layout.fire.left ||
    layout.history.left >= layout.fire.right ||
    layout.history.bottom <= layout.fire.top ||
    layout.history.top >= layout.fire.bottom
  );
  expect(layout.history.left).toBeGreaterThan(layout.viewport.width / 2);
  expect(layout.viewport.width - layout.history.right).toBeGreaterThanOrEqual(0);
  expect(layout.viewport.width - layout.history.right).toBeLessThanOrEqual(24);
  expect(overlaps).toBe(false);
});
