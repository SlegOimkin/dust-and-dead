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
    window.__dustMultiplayerTest?.buildSnapshot &&
    window.__dustMultiplayerTest?.getGuestCombatReplicas
  ));
}

test.describe.configure({ mode: "serial" });

test("protocol 46 reports accepted and rejected shots separately and repeats results until acknowledged", async ({ page }) => {
  await openGame(page);

  const result = await page.evaluate(() => {
    const api = window.__dustMultiplayerTest;
    const started = api.startMockHost(["Host", "Guest"]);
    const guest = started.players[1];
    api.setProgression("mock-player-2", {
      weapon: "revolver",
      ammo: Object.assign({}, guest.progression.ammo, { revolver: 1 }),
      ammoReserve: { revolver: 0, rifle: 0, launcher: 0, coachGun: 0 },
      reloadTimers: Object.assign({}, guest.progression.reloadTimers, { revolver: 0 }),
    });

    const firstQueued = api.injectFireAction("mock-player-2", 1, Math.PI / 2, 20);
    const secondQueued = api.injectFireAction("mock-player-2", 2, Math.PI / 2, 20);
    window.advanceTime(550);

    const firstSnapshot = api.buildSnapshot(false, false, "mock-player-2");
    const secondSnapshot = api.buildSnapshot(false, false, "mock-player-2");
    return {
      firstQueued,
      secondQueued,
      protocol: firstSnapshot.version,
      state: api.getState().players[1],
      first: firstSnapshot.players.find((player) => player.id === "mock-player-2"),
      second: secondSnapshot.players.find((player) => player.id === "mock-player-2"),
    };
  });

  expect(result.firstQueued).toBe(true);
  expect(result.secondQueued).toBe(true);
  expect(result.protocol).toBe(46);
  expect(result.state).toMatchObject({
    lastProcessedFireActionSequence: 2,
    pendingFireActions: 0,
    lastFireResultAck: 0,
  });
  expect(result.state.pendingFireResults).toEqual([
    { sequence: 1, accepted: true, reason: "accepted" },
    { sequence: 2, accepted: false, reason: "empty" },
  ]);
  expect(result.first).toMatchObject({
    fireAck: 2,
    fireResults: [
      { sequence: 1, accepted: true, reason: "accepted" },
      { sequence: 2, accepted: false, reason: "empty" },
    ],
  });
  expect(result.second.fireResults).toEqual(result.first.fireResults);
});

test("guest keeps an accepted prediction, removes a rejected one, and restores authoritative ammo in the HUD", async ({ page }) => {
  await openGame(page);

  const result = await page.evaluate(() => {
    const api = window.__dustMultiplayerTest;
    const started = api.startMockGuest(["Host", "Guest"], 1);
    const guest = started.players[1];
    const authoritative = JSON.parse(JSON.stringify(api.buildSnapshot(false, false)));
    const local = authoritative.players.find((player) => player.id === "mock-player-2");
    const initialAmmo = local.progression.ammo.revolver;

    const firstFired = api.predictAndSendGuestShot("mock-player-2", guest.x + 20, guest.z);
    const secondFired = api.predictAndSendGuestShot("mock-player-2", guest.x + 20, guest.z);
    const before = {
      state: api.getState(),
      bullets: api.getGuestCombatReplicas().bullets,
    };

    authoritative.sequence = 1;
    authoritative.bullets = [];
    local.fireAck = 2;
    // Delivery order must not matter; the guest sorts reliable per-shot results.
    local.fireResults = [
      { sequence: 2, accepted: false, reason: "empty" },
      { sequence: 1, accepted: true, reason: "accepted" },
    ];
    local.progressionRevision += 2;
    local.progression.ammo.revolver = initialAmmo - 1;
    local.progression.reloadTimers.revolver = 0;
    api.applySnapshot(authoritative);
    window.advanceTime(17);

    return {
      initialAmmo,
      firstFired,
      secondFired,
      before,
      after: {
        state: api.getState(),
        bullets: api.getGuestCombatReplicas().bullets,
        hudAmmo: document.getElementById("ammo-current").textContent,
      },
    };
  });

  expect(result.firstFired).toBe(true);
  expect(result.secondFired).toBe(true);
  expect(result.before.state.pendingLocalFireActions).toBe(2);
  expect(result.before.state.players[1].progression.ammo.revolver).toBe(result.initialAmmo - 2);
  expect(result.before.bullets.map((bullet) => bullet.clientFireSequence).sort()).toEqual([1, 2]);

  expect(result.after.state.pendingLocalFireActions).toBe(0);
  expect(result.after.state.players[1].progression.ammo.revolver).toBe(result.initialAmmo - 1);
  expect(result.after.hudAmmo).toBe(String(result.initialAmmo - 1));
  expect(result.after.bullets).toHaveLength(1);
  expect(result.after.bullets[0]).toMatchObject({
    clientFireSequence: 1,
    predicted: true,
  });
});

test("a shot near the end of a reload is deferred without ACK and then accepted exactly once", async ({ page }) => {
  await openGame(page);

  const result = await page.evaluate(() => {
    const api = window.__dustMultiplayerTest;
    const started = api.startMockHost(["Host", "Guest"]);
    const guest = started.players[1];
    api.setProgression("mock-player-2", {
      weapon: "revolver",
      ammo: Object.assign({}, guest.progression.ammo, { revolver: 5 }),
      ammoReserve: { revolver: 10, rifle: 0, launcher: 0, coachGun: 0 },
      reloadTimers: Object.assign({}, guest.progression.reloadTimers, { revolver: 0.2 }),
    });

    const queued = api.injectFireAction("mock-player-2", 1, Math.PI / 2, 20);
    window.advanceTime(50);
    const whileDeferred = api.getState().players[1];
    const deferredSnapshot = api.buildSnapshot(false, false, "mock-player-2");

    window.advanceTime(250);
    const afterReload = api.getState().players[1];
    const acceptedSnapshot = api.buildSnapshot(false, false, "mock-player-2");
    return {
      queued,
      whileDeferred,
      afterReload,
      deferred: deferredSnapshot.players.find((player) => player.id === "mock-player-2"),
      accepted: acceptedSnapshot.players.find((player) => player.id === "mock-player-2"),
      bullets: acceptedSnapshot.bullets.filter((bullet) => bullet.ownerId === "mock-player-2"),
    };
  });

  expect(result.queued).toBe(true);
  expect(result.whileDeferred).toMatchObject({
    lastProcessedFireActionSequence: 0,
    pendingFireActions: 1,
    pendingFireResults: [],
  });
  expect(result.deferred).toMatchObject({ fireAck: 0, fireResults: [] });
  expect(result.afterReload).toMatchObject({
    lastProcessedFireActionSequence: 1,
    pendingFireActions: 0,
    pendingFireResults: [{ sequence: 1, accepted: true, reason: "accepted" }],
  });
  expect(result.accepted).toMatchObject({
    fireAck: 1,
    fireResults: [{ sequence: 1, accepted: true, reason: "accepted" }],
  });
  expect(result.bullets).toHaveLength(1);
  expect(result.afterReload.progression.ammo.revolver).toBe(5);
});

test("a shot sent during a long reload is explicitly rejected instead of waiting indefinitely", async ({ page }) => {
  await openGame(page);

  const result = await page.evaluate(() => {
    const api = window.__dustMultiplayerTest;
    const started = api.startMockHost(["Host", "Guest"]);
    const guest = started.players[1];
    api.setProgression("mock-player-2", {
      weapon: "revolver",
      ammo: Object.assign({}, guest.progression.ammo, { revolver: 5 }),
      ammoReserve: { revolver: 10, rifle: 0, launcher: 0, coachGun: 0 },
      reloadTimers: Object.assign({}, guest.progression.reloadTimers, { revolver: 0.8 }),
    });

    const queued = api.injectFireAction("mock-player-2", 1, Math.PI / 2, 20);
    window.advanceTime(17);
    const snapshot = api.buildSnapshot(false, false, "mock-player-2");
    return {
      queued,
      state: api.getState().players[1],
      entry: snapshot.players.find((player) => player.id === "mock-player-2"),
      bullets: snapshot.bullets.filter((bullet) => bullet.ownerId === "mock-player-2"),
    };
  });

  expect(result.queued).toBe(true);
  expect(result.state).toMatchObject({
    lastProcessedFireActionSequence: 1,
    lastFireActionAccepted: false,
    pendingFireActions: 0,
    pendingFireResults: [{ sequence: 1, accepted: false, reason: "empty" }],
  });
  expect(result.entry).toMatchObject({
    fireAck: 1,
    fireResults: [{ sequence: 1, accepted: false, reason: "empty" }],
  });
  expect(result.state.progression.ammo.revolver).toBe(5);
  expect(result.state.progression.reloadTimers.revolver).toBeGreaterThan(0.7);
  expect(result.bullets).toEqual([]);
});

test("a queued shot keeps its captured weapon and snapshots the runtime counters changed by that weapon", async ({ page }) => {
  await openGame(page);

  const result = await page.evaluate(() => {
    const api = window.__dustMultiplayerTest;
    const started = api.startMockHost(["Host", "Guest"]);
    const guest = started.players[1];
    api.setProgression("mock-player-2", {
      weapon: "rifle",
      ownedWeapons: { revolver: true, rifle: true, launcher: false, coachGun: false },
      ammo: Object.assign({}, guest.progression.ammo, { revolver: 6, rifle: 7 }),
      ammoReserve: { revolver: 0, rifle: 0, launcher: 0, coachGun: 0 },
      reloadTimers: Object.assign({}, guest.progression.reloadTimers, { revolver: 0, rifle: 0 }),
      rifleShotsFired: 7,
      rifleStormTempoTimer: 1.2,
    });

    const queued = api.injectFireAction("mock-player-2", 1, Math.PI / 2, 20, {
      weaponId: "rifle",
    });
    // Changing the selected weapon after the click must not rewrite the queued shot.
    api.setProgression("mock-player-2", { weapon: "revolver" });
    window.advanceTime(17);

    const snapshot = api.buildSnapshot(false, false, "mock-player-2");
    return {
      queued,
      entry: snapshot.players.find((player) => player.id === "mock-player-2"),
      bullets: snapshot.bullets.filter((bullet) => bullet.ownerId === "mock-player-2"),
    };
  });

  expect(result.queued).toBe(true);
  expect(result.entry).toMatchObject({
    fireAck: 1,
    fireResults: [{ sequence: 1, accepted: true, reason: "accepted" }],
  });
  expect(result.entry.progression.weapon).toBe("revolver");
  expect(result.entry.progression.ammo).toMatchObject({ revolver: 6, rifle: 6 });
  expect(result.entry.progression.rifleShotsFired).toBe(8);
  expect(result.entry.progression.rifleStormTempoTimer).toBeGreaterThan(1);
  expect(result.bullets).toHaveLength(1);
  expect(result.bullets[0]).toMatchObject({
    ownerId: "mock-player-2",
    clientFireSequence: 1,
    type: "rifle",
  });
});
