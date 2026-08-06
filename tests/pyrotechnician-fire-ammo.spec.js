const path = require("node:path");
const { expect, test } = require("@playwright/test");

function fileUrl(relativePath) {
  const absolute = path.resolve(__dirname, "..", relativePath).replace(/\\/g, "/");
  return `file:///${absolute}`;
}

async function dismissIntro(page) {
  const intro = page.locator("#intro-screen");
  if (await intro.isVisible().catch(() => false)) {
    await page.keyboard.press("KeyM");
    await expect(intro).toBeHidden();
  }
}

async function openGame(page) {
  await page.goto(`${fileUrl("index.html")}?mapSeed=7331`);
  await dismissIntro(page);
  await page.waitForFunction(() => Boolean(window.__dustAndDeadTest && window.__dustMultiplayerTest));
}

async function startSoloPyrotechnician(page) {
  await page.getByRole("button", { name: "Start Hunt" }).click();
  await page.waitForFunction(() => typeof window.advanceTime === "function");
  await page.evaluate(() => {
    const api = window.__dustAndDeadTest;
    api.clearEnemies();
    api.clearFireHazards();
    api.grantXp(240);
    if (!api.chooseClass("demolitionist")) throw new Error("Could not choose Demolitionist");
    api.forceAllStandardUpgrades("swiftBoots");
    api.grantXp(1200);
    if (!api.chooseLauncherUpgrade("pyrotechnician")) throw new Error("Could not choose Pyrotechnician");
    api.forceAllStandardUpgrades("swiftBoots");
    api.clearEnemies();
    api.clearFireHazards();
  });
}

test.describe.configure({ mode: "serial" });

test("solo Pyrotechnician restores one launcher round every 0.625 seconds only while standing in fire", async ({ page }) => {
  await openGame(page);
  await startSoloPyrotechnician(page);

  const result = await page.evaluate(() => {
    const api = window.__dustAndDeadTest;
    const read = () => JSON.parse(window.render_game_to_text());
    const player = read().player;
    api.setAmmo("launcher", 0, 0);
    api.setPlayerHp(70);
    api.spawnFirePatchAt(player.x, player.z, 2, 4);

    window.advanceTime(600);
    const beforeThreshold = read();
    window.advanceTime(50);
    const firstRound = read();
    window.advanceTime(625);
    const secondRound = read();

    api.setPlayerPosition(player.x + 8, player.z + 8);
    window.advanceTime(700);
    const afterLeaving = read();
    return {
      beforeThreshold,
      firstRound,
      secondRound,
      afterLeaving,
      hudAmmo: document.getElementById("ammo-current").textContent,
    };
  });

  expect(result.beforeThreshold.progression.launcherSpecial.fireBuffActive).toBe(true);
  expect(result.beforeThreshold.ammo.weapons.launcher.current).toBe(0);
  expect(result.firstRound.ammo.weapons.launcher.current).toBe(1);
  expect(result.secondRound.ammo.weapons.launcher.current).toBe(2);
  expect(result.secondRound.player.hp).toBeGreaterThan(70);
  expect(result.afterLeaving.progression.launcherSpecial.fireBuffActive).toBe(false);
  expect(result.afterLeaving.ammo.weapons.launcher.current).toBe(2);
  expect(result.hudAmmo).toBe("2");
});

test("host authoritatively restores and grants free empty-magazine Pyrotechnician shots to a remote player", async ({ page }) => {
  await openGame(page);

  const result = await page.evaluate(() => {
    const api = window.__dustMultiplayerTest;
    const started = api.startMockHost(["Host", "Remote Pyro"]);
    const remote = started.players[1];
    api.setProgression("mock-player-2", {
      playerClass: "demolitionist",
      launcherUpgrade: "pyrotechnician",
      weapon: "launcher",
      ownedWeapons: { revolver: true, rifle: false, launcher: true, coachGun: false },
      ammo: Object.assign({}, remote.progression.ammo, { launcher: 0 }),
      ammoReserve: { revolver: 0, rifle: 0, launcher: 0, coachGun: 0 },
      reloadTimers: Object.assign({}, remote.progression.reloadTimers, { launcher: 1 }),
      launcherFireBuffActive: false,
      launcherFireAmmoAccumulator: 0,
    });
    api.setPlayerPosition("mock-player-2", remote.x + 12, remote.z);
    const positionedRemote = api.getState().players[1];
    api.setHealth("mock-player-2", 70);
    api.spawnFirePatch("mock-player-2", {
      x: positionedRemote.x,
      z: positionedRemote.z,
      radius: 2,
      life: 4,
    });

    window.advanceTime(650);
    const restored = api.getState().players[1];
    const restoredCombat = api.getCombatDiagnostics("mock-player-2");
    api.setProgression("mock-player-2", {
      ammo: Object.assign({}, restored.progression.ammo, { launcher: 0 }),
      ammoReserve: { revolver: 0, rifle: 0, launcher: 0, coachGun: 0 },
      reloadTimers: Object.assign({}, restored.progression.reloadTimers, { launcher: 0 }),
    });
    const queued = api.injectFireAction("mock-player-2", 1, Math.PI / 2, 12, { weaponId: "launcher" });
    window.advanceTime(17);
    const afterFreeShot = api.getState().players[1];
    const snapshot = api.buildSnapshot(false, false, "mock-player-2");
    const localEntry = snapshot.players.find((player) => player.id === "mock-player-2");
    return {
      restored,
      restoredCombat,
      queued,
      afterFreeShot,
      localEntry,
      bullets: snapshot.bullets.filter((bullet) => bullet.ownerId === "mock-player-2"),
    };
  });

  expect(result.restored.progression.ammo.launcher).toBe(1);
  expect(result.restored.progression.reloadTimers.launcher).toBe(0);
  expect(result.restored.hp).toBeGreaterThan(70);
  expect(result.queued).toBe(true);
  expect(result.afterFreeShot.lastFireActionAccepted).toBe(true);
  expect(result.afterFreeShot.progression.ammo.launcher).toBe(0);
  expect(result.localEntry.progression.launcherFireBuffActive).toBe(true);
  expect(result.localEntry.fireResults).toEqual([{ sequence: 1, accepted: true, reason: "accepted" }]);
  expect(result.bullets).toHaveLength(1);
});

test("guest predicts an authoritative fire-buff shot at zero ammo and then reconciles ammo and HUD", async ({ page }) => {
  await openGame(page);

  const result = await page.evaluate(() => {
    const api = window.__dustMultiplayerTest;
    const started = api.startMockGuest(["Host", "Guest Pyro"], 1);
    const guest = started.players[1];
    const authoritative = JSON.parse(JSON.stringify(api.buildSnapshot(false, false)));
    const local = authoritative.players.find((player) => player.id === "mock-player-2");
    authoritative.sequence = 1;
    authoritative.bullets = [];
    local.progressionRevision += 1;
    local.progression.playerClass = "demolitionist";
    local.progression.launcherUpgrade = "pyrotechnician";
    local.progression.weapon = "launcher";
    local.progression.ownedWeapons = { revolver: true, rifle: false, launcher: true, coachGun: false };
    local.progression.ammo.launcher = 0;
    local.progression.ammoReserve.launcher = 0;
    local.progression.reloadTimers.launcher = 0;
    local.progression.launcherFireBuffActive = true;
    local.progression.launcherFireAmmoAccumulator = 0.25;
    api.applySnapshot(authoritative);
    window.advanceTime(17);

    const fired = api.predictAndSendGuestShot("mock-player-2", guest.x + 12, guest.z);
    const predicted = {
      state: api.getState(),
      bullets: api.getGuestCombatReplicas().bullets,
      hudAmmo: document.getElementById("ammo-current").textContent,
    };

    const accepted = JSON.parse(JSON.stringify(authoritative));
    accepted.sequence = 2;
    accepted.bullets = [];
    const acceptedLocal = accepted.players.find((player) => player.id === "mock-player-2");
    acceptedLocal.fireAck = 1;
    acceptedLocal.fireResults = [{ sequence: 1, accepted: true, reason: "accepted" }];
    acceptedLocal.progressionRevision += 1;
    acceptedLocal.progression.ammo.launcher = 1;
    acceptedLocal.progression.launcherFireBuffActive = true;
    api.applySnapshot(accepted);
    window.advanceTime(17);
    const reconciled = {
      state: api.getState(),
      bullets: api.getGuestCombatReplicas().bullets,
      hudAmmo: document.getElementById("ammo-current").textContent,
    };
    return { fired, predicted, reconciled };
  });

  expect(result.fired).toBe(true);
  expect(result.predicted.state.pendingLocalFireActions).toBe(1);
  expect(result.predicted.state.players[1].progression.ammo.launcher).toBe(0);
  expect(result.predicted.hudAmmo).toBe("0");
  expect(result.predicted.bullets).toHaveLength(1);
  expect(result.predicted.bullets[0]).toMatchObject({ type: "launcher", predicted: true, clientFireSequence: 1 });

  expect(result.reconciled.state.pendingLocalFireActions).toBe(0);
  expect(result.reconciled.state.players[1].progression.ammo.launcher).toBe(1);
  expect(result.reconciled.hudAmmo).toBe("1");
  // An accepted speculative projectile stays visible until its authoritative
  // projectile update arrives (or its normal lifetime expires).
  expect(result.reconciled.bullets).toHaveLength(1);
  expect(result.reconciled.bullets[0]).toMatchObject({ type: "launcher", predicted: true, clientFireSequence: 1 });
});
