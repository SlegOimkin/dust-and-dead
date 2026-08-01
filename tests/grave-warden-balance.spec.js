const path = require("node:path");
const { expect, test } = require("@playwright/test");

function fileUrl(relativePath) {
  const absolute = path.resolve(__dirname, "..", relativePath).replace(/\\/g, "/");
  return `file:///${absolute}`;
}

async function openGame(page, query = "mapSeed=7331") {
  await page.goto(`${fileUrl("index.html")}?${query}`);
  const intro = page.locator("#intro-screen");
  if (await intro.isVisible().catch(() => false)) {
    await page.keyboard.press("KeyM");
    await expect(intro).toBeHidden();
  }
  const startButton = page.getByRole("button", { name: "Start Hunt" });
  if (await startButton.isVisible().catch(() => false)) await startButton.click();
  await page.waitForFunction(() => Boolean(window.__dustAndDeadTest));
}

test("Grave Warden consecration and Stillness use the intended two-shot damage rhythm", async ({ page }) => {
  await openGame(page, "mapSeed=7331&graveWarden=damage");

  const result = await page.evaluate(() => {
    const api = window.__dustAndDeadTest;

    api.startWaveNow(10, "landEater");
    api.setLandEaterAiEnabled(false);
    api.configureBossWeaponBuildForTest({
      playerClass: "marshal",
      marshalUpgrade: "graveWarden",
      weapon: "coachGun",
    });
    const consecrating = api.resolveCoachGunBossVolleyForTest({ pellets: 8, distance: 6 });
    const marked = api.resolveCoachGunBossVolleyForTest({ pellets: 8, distance: 6 });

    api.startWaveNow(10, "landEater");
    api.setLandEaterAiEnabled(false);
    api.configureBossWeaponBuildForTest({
      playerClass: "marshal",
      marshalUpgrade: "graveWarden",
      weapon: "coachGun",
      upgrades: ["stillness"],
    });
    const braced = api.resolveCoachGunBossVolleyForTest({
      pellets: 8,
      distance: 6,
      braced: true,
      commitShot: true,
    });
    const armed = api.getBossWeaponDiagnostics();
    const followup = api.resolveCoachGunBossVolleyForTest({ pellets: 8, distance: 6 });
    const consumed = api.getBossWeaponDiagnostics();
    const ordinaryMarked = api.resolveCoachGunBossVolleyForTest({ pellets: 8, distance: 6 });

    return { consecrating, marked, braced, armed, followup, consumed, ordinaryMarked };
  });

  expect(result.marked.applied / result.consecrating.applied).toBeCloseTo(1.3 / 1.15, 2);
  expect(result.armed.marshalStillnessFollowupTimer).toBeGreaterThan(0.65);
  expect(result.followup.applied / result.ordinaryMarked.applied).toBeCloseTo(1.25, 2);
  expect(result.followup.applied / result.braced.applied).toBeCloseTo((1.3 * 1.25) / (1.15 * 1.5), 2);
  expect(result.consumed.marshalStillnessFollowupTimer).toBe(0);
});

test("Grave Warden boss conversions raise Deputies, return shells, echo judgment, and claim bounties", async ({ page }) => {
  await openGame(page, "mapSeed=7331&graveWarden=conversions");

  const result = await page.evaluate(() => {
    const api = window.__dustAndDeadTest;

    api.startWaveNow(10, "landEater");
    api.setLandEaterAiEnabled(false);
    api.clearPaleDeputies();
    api.configureBossWeaponBuildForTest({
      playerClass: "marshal",
      marshalUpgrade: "graveWarden",
      weapon: "coachGun",
      upgrades: ["lastRites", "graveTithe", "passingJudgment"],
      ammoCurrent: 0,
      ammoReserve: 0,
    });
    const conversionHits = [];
    for (let index = 0; index < 5; index += 1) {
      conversionHits.push(api.resolveCoachGunBossVolleyForTest({ pellets: 8, distance: 6 }));
    }
    const conversionDiagnostics = api.getBossWeaponDiagnostics();
    const deputies = api.getPaleDeputyDiagnostics();

    api.startWaveNow(10, "landEater");
    api.setLandEaterAiEnabled(false);
    api.clearPaleDeputies();
    api.configureBossWeaponBuildForTest({
      playerClass: "marshal",
      marshalUpgrade: "graveWarden",
      weapon: "coachGun",
      upgrades: ["heavensBounty"],
      ammoCurrent: 0,
      ammoReserve: 0,
    });
    const shellsBeforeBounty = api.getBossWeaponDiagnostics().marshalGeneratedShells;
    window.advanceTime(4000);
    window.advanceTime(4000);
    window.advanceTime(4000);
    const bountyApplied = api.getBossWeaponDiagnostics();
    for (let index = 0; index < 3; index += 1) {
      api.resolveCoachGunBossVolleyForTest({ pellets: 8, distance: 6 });
    }
    const bountyClaimed = api.getBossWeaponDiagnostics();
    const ammoAfterBounty = JSON.parse(window.render_game_to_text()).ammo.weapons.coachGun;

    return {
      conversionHits,
      conversionDiagnostics,
      deputies,
      shellsBeforeBounty,
      bountyApplied,
      bountyClaimed,
      ammoAfterBounty,
    };
  });

  expect(result.conversionHits[3].applied / result.conversionHits[2].applied).toBeCloseTo(1.28, 2);
  expect(result.conversionDiagnostics.marshalGeneratedShells).toBe(1);
  expect(result.conversionDiagnostics.marshalBossMarkedVolleys).toBe(1);
  expect(result.conversionDiagnostics.marshalBossLastRitesVolleys).toBe(0);
  expect(result.conversionDiagnostics.marshalBossPassingVolleys).toBe(1);
  expect(result.deputies).toMatchObject({ active: 1, summoned: 1, lifetime: 18 });

  expect(result.bountyApplied).toMatchObject({ targetMarked: true, targetBounty: true });
  expect(result.bountyClaimed.targetBounty).toBe(false);
  expect(result.bountyClaimed.marshalBountiesClaimed).toBe(1);
  expect(result.bountyClaimed.marshalGeneratedShells - result.shellsBeforeBounty).toBe(3);
  expect(result.ammoAfterBounty).toMatchObject({ current: 2, reserve: 1 });
});

test("Rock Salt protects its Warden while an active boss remains consecrated", async ({ page }) => {
  await openGame(page, "mapSeed=7331&graveWarden=rockSalt");

  const result = await page.evaluate(() => {
    const api = window.__dustAndDeadTest;
    api.startWaveNow(10, "landEater");
    api.setLandEaterAiEnabled(false);
    api.configureBossWeaponBuildForTest({
      playerClass: "marshal",
      marshalUpgrade: "graveWarden",
      weapon: "coachGun",
      upgrades: ["rockSalt"],
    });
    api.resolveCoachGunBossVolleyForTest({ pellets: 8, distance: 6 });
    api.setPlayerMaxHp(100, 100);
    const protectedHit = api.damagePlayerForTest(20);

    api.configureBossWeaponBuildForTest({
      playerClass: "marshal",
      marshalUpgrade: "graveWarden",
      weapon: "coachGun",
    });
    api.setPlayerHp(100);
    const normalHit = api.damagePlayerForTest(20);
    return { protectedHit, normalHit };
  });

  expect(result.protectedHit.applied).toBeCloseTo(18, 4);
  expect(result.normalHit.applied).toBeCloseTo(20, 4);
});

test("Purifying Salt heals after a cleanse and Hallowed Ground has the expanded sanctuary", async ({ page }) => {
  await openGame(page, "mapSeed=7331&graveWarden=sanctuary");

  const result = await page.evaluate(() => {
    const api = window.__dustAndDeadTest;
    api.startWaveNow(1);
    api.configureBossWeaponBuildForTest({
      playerClass: "marshal",
      marshalUpgrade: "graveWarden",
      weapon: "coachGun",
      upgrades: ["purifyingSalt", "hallowedGround"],
      ammoCurrent: 2,
      ammoReserve: 0,
    });
    api.clearEnemies();
    const position = api.getPlayerPosition();
    api.setPlayerMaxHp(100, 50);
    api.spawnAcidProjectileAt(position.x, position.z + 5, position.x, position.z + 12);
    api.setAimTarget(position.x, position.z + 12);
    api.shootOnce();
    const afterCleanse = JSON.parse(window.render_game_to_text());

    const sanctuary = api.spawnHallowedGroundAtPlayerForTest();
    api.setPlayerHp(50);
    window.advanceTime(1000);
    const afterSanctuary = api.getPlayerHealth();
    return { afterCleanse, sanctuary, afterSanctuary };
  });

  expect(result.afterCleanse.acidProjectiles).toBe(0);
  expect(result.afterCleanse.player.hp).toBeCloseTo(52, 2);
  expect(result.afterCleanse.progression.marshalSpecial.purifyReloadTimer).toBeGreaterThan(2.9);
  expect(result.sanctuary).toMatchObject({ radius: 5, life: 8 });
  expect(result.afterSanctuary.hp).toBeCloseTo(51, 1);
});
