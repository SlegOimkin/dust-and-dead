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
  const startButton = page.getByRole("button", { name: "Start Hunt" });
  if (await startButton.isVisible().catch(() => false)) await startButton.click();
  await page.waitForFunction(() => Boolean(
    window.__dustAndDeadTest?.resolveCoachGunWalkerVolleyForTest &&
    window.__dustAndDeadTest?.damagePlayerForTest
  ));
}

test("Room Sweeper queues after 3 distinct hits and speeds exactly the next shell", async ({ page }) => {
  await openGame(page);

  const result = await page.evaluate(() => {
    const api = window.__dustAndDeadTest;
    api.startWaveNow(10, "landEater");
    api.configureBossWeaponBuildForTest({
      playerClass: "marshal",
      marshalUpgrade: "breachMarshal",
      weapon: "coachGun",
      upgrades: ["roomSweeper"],
      ammoCurrent: 0,
      ammoReserve: 30,
    });
    api.setBreachMomentumForTest(3, 60);
    const twoHits = api.resolveCoachGunWalkerVolleyForTest({
      walkers: 2,
      pellets: 6,
      distance: 3,
      walkerHp: 500,
      startReload: true,
    });
    api.setBreachMomentumForTest(3, 60);
    const threeHits = api.resolveCoachGunWalkerVolleyForTest({
      walkers: 3,
      pellets: 6,
      distance: 3,
      walkerHp: 500,
      startReload: true,
    });
    return { twoHits, threeHits };
  });

  expect(result.twoHits.diagnostics.marshalBreachRoomSweeperQueued).toBe(false);
  expect(result.twoHits.diagnostics.marshalBreachRoomSweeperActive).toBe(false);
  expect(result.threeHits.diagnostics.marshalBreachRoomSweeperActive).toBe(true);
  expect(result.twoHits.reloadTime / result.threeHits.reloadTime).toBeCloseTo(1.35, 2);
});

test("Sheriff's Pace extends Breach Step per close kill up to 0.8s and raises its speed bonus to +40%", async ({ page }) => {
  await openGame(page);

  const result = await page.evaluate(() => {
    const api = window.__dustAndDeadTest;
    api.startWaveNow(10, "landEater");
    api.configureBossWeaponBuildForTest({
      playerClass: "marshal",
      marshalUpgrade: "breachMarshal",
      weapon: "coachGun",
      upgrades: ["buckAndBall", "sheriffsPace"],
      ammoCurrent: 2,
    });
    const step = api.activateBreachStepForTest(1, 0);
    const smallVolley = api.resolveCoachGunWalkerVolleyForTest({
      walkers: 2,
      pellets: 6,
      distance: 3,
      walkerHp: 1,
    });
    api.advanceBossWeaponStatusesForTest(1);
    const stepAgain = api.activateBreachStepForTest(1, 0);
    const cappedVolley = api.resolveCoachGunWalkerVolleyForTest({
      walkers: 6,
      pellets: 6,
      distance: 3,
      walkerHp: 1,
    });
    return { step, smallVolley, stepAgain, cappedVolley };
  });

  expect(result.step.activated).toBe(true);
  expect(result.step.movementMultiplier).toBeCloseTo(1.4, 2);
  expect(result.smallVolley.sheriffStepExtension).toBeCloseTo(0.4, 3);
  expect(result.smallVolley.diagnostics.marshalBreachStepTimer).toBeCloseTo(0.85, 2);
  expect(result.cappedVolley.sheriffStepExtension).toBeCloseTo(0.8, 3);
  expect(result.cappedVolley.diagnostics.marshalBreachStepTimer).toBeCloseTo(1.25, 2);
});

test("Rolling Thunder stores capped Overpressure from full-Momentum overflow and the next volley spends it", async ({ page }) => {
  await openGame(page);

  const result = await page.evaluate(() => {
    const api = window.__dustAndDeadTest;
    api.startWaveNow(10, "landEater");
    api.configureBossWeaponBuildForTest({
      playerClass: "marshal",
      marshalUpgrade: "breachMarshal",
      weapon: "coachGun",
      upgrades: ["rideTheRecoil", "rollingThunder"],
      ammoCurrent: 2,
    });
    api.setBreachMomentumForTest(3, 60);
    const overflowVolley = api.resolveCoachGunWalkerVolleyForTest({
      walkers: 1,
      pellets: 6,
      distance: 3,
      walkerHp: 500,
    });
    api.setBreachMomentumForTest(3, 60);
    const secondOverflow = api.resolveCoachGunWalkerVolleyForTest({
      walkers: 1,
      pellets: 6,
      distance: 3,
      walkerHp: 500,
    });
    const spendingVolley = api.resolveCoachGunWalkerVolleyForTest({
      walkers: 0,
    });
    const afterSpend = api.getBossWeaponDiagnostics();
    return { overflowVolley, secondOverflow, spendingVolley, afterSpend };
  });

  expect(result.overflowVolley.diagnostics.marshalBreachOverpressureStacks).toBe(2);
  expect(result.secondOverflow.diagnostics.marshalBreachOverpressureStacks).toBe(2);
  expect(result.spendingVolley.overpressureConsumed).toBe(2);
  expect(result.spendingVolley.spread / result.overflowVolley.spread).toBeCloseTo(0.8, 2);
  expect(result.afterSpend.marshalBreachOverpressureStacks).toBe(0);
});

test("Master Key lowers the close-range Door Kicker gate to 3 pellets, boosts boss breach damage 15%, and speeds full Momentum", async ({ page }) => {
  await openGame(page);

  const result = await page.evaluate(() => {
    const api = window.__dustAndDeadTest;
    api.startWaveNow(10, "landEater");
    const baseBuild = {
      playerClass: "marshal",
      marshalUpgrade: "breachMarshal",
      weapon: "coachGun",
      ammoCurrent: 2,
    };
    api.configureBossWeaponBuildForTest({ ...baseBuild, upgrades: ["doorKicker"] });
    const withoutKey = api.resolveCoachGunWalkerVolleyForTest({
      walkers: 1,
      pellets: 3,
      distance: 3,
      walkerHp: 500,
    });
    const bossWithoutKey = api.resolveCoachGunBossVolleyForTest({ pellets: 10, distance: 4 });
    api.configureBossWeaponBuildForTest({ ...baseBuild, upgrades: ["doorKicker", "masterKey"] });
    const closeWithKey = api.resolveCoachGunWalkerVolleyForTest({
      walkers: 1,
      pellets: 3,
      distance: 3,
      walkerHp: 500,
    });
    const farWithKey = api.resolveCoachGunWalkerVolleyForTest({
      walkers: 1,
      pellets: 3,
      distance: 8,
      walkerHp: 500,
    });
    const bossWithKey = api.resolveCoachGunBossVolleyForTest({ pellets: 10, distance: 4 });
    const fullMomentum = api.setBreachMomentumForTest(3, 60);
    return { withoutKey, bossWithoutKey, closeWithKey, farWithKey, bossWithKey, fullMomentum };
  });

  expect(result.withoutKey.entries[0].stunTimer).toBe(0);
  expect(result.withoutKey.entries[0].launched).toBe(false);
  expect(result.closeWithKey.entries[0].stunTimer).toBeCloseTo(0.45, 2);
  expect(result.closeWithKey.entries[0].launched).toBe(true);
  expect(result.farWithKey.entries[0].stunTimer).toBe(0);
  expect(result.bossWithKey.applied / result.bossWithoutKey.applied).toBeCloseTo(1.15, 2);
  expect(result.fullMomentum.marshalBreachMoveMultiplier).toBeCloseTo(1.5, 2);
});

test("Hold the Door reduces incoming damage 12% per loaded shell until the shells are fired", async ({ page }) => {
  await openGame(page);

  const result = await page.evaluate(() => {
    const api = window.__dustAndDeadTest;
    api.startWaveNow(10, "landEater");
    const build = {
      playerClass: "marshal",
      marshalUpgrade: "breachMarshal",
      weapon: "coachGun",
      upgrades: ["holdTheDoor"],
    };
    api.configureBossWeaponBuildForTest({ ...build, ammoCurrent: 2 });
    api.setPlayerHp(80);
    const twoShells = api.damagePlayerForTest(25);
    api.configureBossWeaponBuildForTest({ ...build, ammoCurrent: 1 });
    api.setPlayerHp(80);
    const oneShell = api.damagePlayerForTest(25);
    api.configureBossWeaponBuildForTest({ ...build, ammoCurrent: 0 });
    api.setPlayerHp(80);
    const emptyGun = api.damagePlayerForTest(25);
    return { twoShells, oneShell, emptyGun };
  });

  expect(result.twoShells.applied).toBeCloseTo(25 * 0.76, 1);
  expect(result.oneShell.applied).toBeCloseTo(25 * 0.88, 1);
  expect(result.emptyGun.applied).toBeCloseTo(25, 1);
});

test("Powder Curtain destroys hostile projectiles in the cone and grants exactly 1 Momentum per volley", async ({ page }) => {
  await openGame(page);

  const result = await page.evaluate(() => {
    const api = window.__dustAndDeadTest;
    api.startWaveNow(10, "landEater");
    const build = {
      playerClass: "marshal",
      marshalUpgrade: "breachMarshal",
      weapon: "coachGun",
      ammoCurrent: 2,
    };
    api.configureBossWeaponBuildForTest({ ...build, upgrades: [] });
    const withoutCurtain = api.resolveCoachGunWalkerVolleyForTest({ walkers: 0, acidSpits: 2 });
    api.configureBossWeaponBuildForTest({ ...build, upgrades: ["powderCurtain"] });
    const withCurtain = api.resolveCoachGunWalkerVolleyForTest({ walkers: 0, acidSpits: 2 });
    return { withoutCurtain, withCurtain };
  });

  expect(result.withoutCurtain.projectilesSwept).toBe(0);
  expect(result.withoutCurtain.acidProjectilesRemaining).toBe(2);
  expect(result.withoutCurtain.diagnostics.marshalBreachMomentumStacks).toBe(0);
  expect(result.withCurtain.projectilesSwept).toBe(2);
  expect(result.withCurtain.acidProjectilesRemaining).toBe(0);
  expect(result.withCurtain.diagnostics.marshalBreachMomentumStacks).toBe(1);
  expect(result.withCurtain.diagnostics.marshalBreachProjectilesSwept).toBe(2);
});
