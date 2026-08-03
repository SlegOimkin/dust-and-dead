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
    window.__dustAndDeadTest?.resolveCoachGunBossVolleyForTest &&
    window.__dustMultiplayerTest?.buildWireSnapshot
  ));
}

test("Breach Momentum ramps, sustains boss pressure, heals, rewards shells, and decays one stack at a time", async ({ page }) => {
  await openGame(page);

  const result = await page.evaluate(() => {
    const api = window.__dustAndDeadTest;
    api.startWaveNow(10, "landEater");
    api.configureBossWeaponBuildForTest({
      playerClass: "marshal",
      marshalUpgrade: "breachMarshal",
      weapon: "coachGun",
      upgrades: [
        "doorKicker",
        "shellCatcher",
        "rideTheRecoil",
        "noTimeToBleed",
        "hardCast",
        "hardCast",
        "hardCast",
        "hardCast",
        "hardCast",
      ],
      ammoCurrent: 0,
    });
    const initial = JSON.parse(window.render_game_to_text());
    api.setPlayerHp(initial.player.maxHp - 12);

    const shots = [];
    for (let index = 0; index < 5; index += 1) {
      api.resolveCoachGunBossVolleyForTest({ pellets: 10, distance: 3 });
      shots.push({
        diagnostics: api.getBossWeaponDiagnostics(),
        playerHp: JSON.parse(window.render_game_to_text()).player.hp,
      });
    }
    const afterFirstDecay = api.advanceBossWeaponStatusesForTest(3.71);
    const afterSecondDecay = api.advanceBossWeaponStatusesForTest(0.61);
    const afterThirdDecay = api.advanceBossWeaponStatusesForTest(0.61);
    return { initial, shots, afterFirstDecay, afterSecondDecay, afterThirdDecay };
  });

  expect(result.shots.map((entry) => entry.diagnostics.marshalBreachMomentumStacks)).toEqual([2, 3, 3, 3, 3]);
  expect(result.shots.map((entry) => entry.diagnostics.marshalBreachShellVolleys)).toEqual([1, 2, 0, 1, 2]);
  expect(result.shots.map((entry) => entry.diagnostics.marshalBreachFullVolleys)).toEqual([0, 1, 2, 3, 0]);
  expect(result.shots[4].diagnostics.marshalGeneratedShells).toBe(1);
  expect(result.shots[4].diagnostics.ammo.coachGun).toBe(1);
  expect(result.shots[4].diagnostics.marshalBreachMoveMultiplier).toBeCloseTo(1.45, 2);
  expect(result.shots[4].diagnostics.marshalBreachMomentumTimer).toBeGreaterThan(3);
  expect(result.shots[4].playerHp).toBe(result.initial.player.maxHp - 8);
  expect(result.afterFirstDecay.marshalBreachMomentumStacks).toBe(2);
  expect(result.afterSecondDecay.marshalBreachMomentumStacks).toBe(1);
  expect(result.afterThirdDecay.marshalBreachMomentumStacks).toBe(0);
});

test("Double Tap, Last Word, Breach Step, and full-Momentum contact push use the reworked rules", async ({ page }) => {
  await openGame(page);

  const result = await page.evaluate(() => {
    const api = window.__dustAndDeadTest;
    api.startWaveNow(10, "landEater");
    api.configureBossWeaponBuildForTest({
      playerClass: "marshal",
      marshalUpgrade: "breachMarshal",
      weapon: "coachGun",
      upgrades: [
        "doorKicker",
        "doubleTap",
        "lastWord",
        "shellCatcher",
        "buckAndBall",
        "rideTheRecoil",
        "bonebreaker",
      ],
      ammoCurrent: 0,
    });

    const distant = api.resolveCoachGunBossVolleyForTest({ pellets: 2, distance: 14 });
    api.setBreachMomentumForTest(0, 0);
    const distantDoubleTap = api.resolveCoachGunBossVolleyForTest({
      pellets: 2,
      distance: 14,
      doubleTap: true,
    });
    api.setBreachMomentumForTest(0, 0);
    const regular = api.resolveCoachGunBossVolleyForTest({ pellets: 6, distance: 6 });
    api.setBreachMomentumForTest(0, 0);
    const doubleTap = api.resolveCoachGunBossVolleyForTest({ pellets: 6, distance: 6, doubleTap: true });

    api.setBreachMomentumForTest(3, 2);
    window.advanceTime(16);
    const momentumVisuals = api.getBreachMomentumVisualDiagnostics();
    const idleStep = api.activateBreachStepForTest(0, 0);
    const movingStep = api.activateBreachStepForTest(0, -1);

    api.setBreachMomentumForTest(0, 0);
    const lastWord = api.resolveCoachGunBossVolleyForTest({ pellets: 3, distance: 8, lastShell: true });
    const reload = api.startReload("coachGun");
    const reloadDiagnostics = api.getBossWeaponDiagnostics();

    api.clearEnemies();
    const state = JSON.parse(window.render_game_to_text());
    api.spawnZombieAt("walker", state.player.x + 1.4, state.player.z);
    api.setBreachMomentumForTest(3, 2);
    const contactPush = api.pushFirstZombieWithBreachContactForTest();
    const baseBonebreaker = api.runBreachBonebreakerCollisionForTest(0);
    const fullBonebreaker = api.runBreachBonebreakerCollisionForTest(3);

    return {
      distant,
      distantDoubleTap,
      regular,
      doubleTap,
      momentumVisuals,
      idleStep,
      movingStep,
      lastWord,
      reload,
      reloadDiagnostics,
      contactPush,
      baseBonebreaker,
      fullBonebreaker,
    };
  });

  expect(result.distant.diagnostics.marshalBreachMomentumStacks).toBe(1);
  expect(result.distantDoubleTap.diagnostics.marshalBreachMomentumStacks).toBe(2);
  expect(result.distant.diagnostics.marshalBreachShellVolleys).toBe(0);
  expect(result.distantDoubleTap.diagnostics.marshalBreachShellVolleys).toBe(0);
  expect(result.regular.diagnostics.marshalBreachMomentumStacks).toBe(2);
  expect(result.regular.diagnostics.marshalBreachShellVolleys).toBe(1);
  expect(result.doubleTap.applied).toBeCloseTo(result.regular.applied * 1.15, 1);
  expect(result.doubleTap.diagnostics.marshalBreachMomentumStacks).toBe(2);
  expect(result.doubleTap.diagnostics.marshalBreachShellVolleys).toBe(2);
  expect(result.momentumVisuals).toHaveLength(3);
  expect(result.momentumVisuals.map((visual) => visual.visible)).toEqual([true, true, true]);
  expect(result.momentumVisuals.map((visual) => visual.childVisible)).toEqual([2, 2, 2]);
  expect(result.momentumVisuals.map((visual) => visual.depthTests)).toEqual([
    [false, false],
    [false, false],
    [false, false],
  ]);
  expect(result.momentumVisuals.map((visual) => visual.colors[0])).toEqual([
    0xff3f2d,
    0xff3f2d,
    0xffd45c,
  ]);
  expect(result.idleStep.activated).toBe(false);
  expect(result.movingStep).toMatchObject({ activated: true, timer: 0.45 });
  expect(result.movingStep.movementMultiplier).toBeCloseTo(1.7, 2);
  expect(result.lastWord.diagnostics.marshalBreachMomentumStacks).toBe(1);
  expect(result.lastWord.diagnostics.marshalBreachMomentumTimer).toBeGreaterThanOrEqual(1.2);
  expect(result.lastWord.diagnostics.marshalBreachLastWordQueued).toBe(true);
  expect(result.reload.reloading).toBe(true);
  expect(result.reload.reloadRemaining).toBeLessThan(0.44);
  expect(result.reloadDiagnostics.marshalBreachLastWordActive).toBe(true);
  expect(result.contactPush.pushed).toBe(true);
  expect(result.contactPush.distance).toBeGreaterThan(0.5);
  expect(result.contactPush.contactPushes).toBe(1);
  expect(result.baseBonebreaker.collisionDamage).toBeCloseTo(2, 2);
  expect(result.baseBonebreaker.bursts).toBe(0);
  expect(result.fullBonebreaker.collisionDamage).toBeCloseTo(3.2, 2);
  expect(result.fullBonebreaker.bursts).toBe(1);
  expect(result.fullBonebreaker.neighborMoved).toBeGreaterThan(0.2);
  expect(result.fullBonebreaker.impactPoints).toBe(3);
});

test("protocol 47 round-trips every movement-critical Breach state to the owning client", async ({ page, context }) => {
  await openGame(page);
  const guest = await context.newPage();
  await openGame(guest);

  const wire = await page.evaluate(() => {
    const api = window.__dustMultiplayerTest;
    api.startMockHost(["Host", "Guest"]);
    api.setProgression("mock-player-2", {
      playerClass: "marshal",
      marshalUpgrade: "breachMarshal",
      weapon: "coachGun",
      ownedWeapons: { revolver: true, rifle: false, launcher: false, coachGun: true },
      upgradeCounts: { buckAndBall: 1, rideTheRecoil: 1 },
      marshalBreachMomentumStacks: 3,
      marshalBreachMomentumTimer: 2.75,
      marshalBreachStepTimer: 0.4,
      marshalBreachHealCooldown: 2.4,
      marshalBreachLastWordReloadQueued: 0,
      marshalBreachLastWordReloadActive: 1,
      marshalShellCatcherKills: 2,
      marshalCloseKills: 3,
    });
    return JSON.parse(JSON.stringify(api.buildWireSnapshot(false, false, "mock-player-2")));
  });

  const replica = await guest.evaluate((snapshot) => {
    const api = window.__dustMultiplayerTest;
    api.startMockGuest(["Host", "Guest"], 1);
    api.applySnapshot(snapshot);
    const local = api.getState().players.find((player) => player.id === "mock-player-2");
    const rendered = JSON.parse(window.render_game_to_text());
    return {
      protocol: snapshot.version,
      progression: local.progression,
      marshal: rendered.progression.marshalSpecial,
    };
  }, wire);

  expect(replica.protocol).toBe(47);
  expect(replica.progression).toMatchObject({
    playerClass: "marshal",
    marshalUpgrade: "breachMarshal",
    weapon: "coachGun",
  });
  expect(replica.marshal.momentumStacks).toBe(3);
  expect(replica.marshal.momentumTimer).toBeCloseTo(2.75, 2);
  expect(replica.marshal.breachStepTimer).toBeCloseTo(0.4, 2);
  expect(replica.marshal.breachHealCooldown).toBeCloseTo(2.4, 2);
  expect(replica.marshal.momentumMoveMultiplier).toBeCloseTo(1.7, 2);
  expect(replica.marshal.lastWordReloadActive).toBe(true);
  expect(replica.marshal.shellCatcherVolleys).toBe(2);
  expect(replica.marshal.fullMomentumVolleys).toBe(3);
});
