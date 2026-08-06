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

async function startHunt(page, query) {
  await page.goto(`${fileUrl("index.html")}?mapSeed=7&${query}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Boolean(
    window.DustAndDeadProgression &&
    window.__dustAndDeadTest &&
    window.render_game_to_text &&
    typeof window.advanceTime === "function"
  ));
  await page.evaluate(() => window.DustAndDeadProgression.resetForTest());
  await dismissIntro(page);
  await page.getByRole("button", { name: "Start Hunt" }).click();
  await page.waitForFunction(() => typeof window.__dustAndDeadTest?.shootOnce === "function");
}

// Shared page-side setup: level a fresh hunt into a Lever Barrage ranger with
// no branch cards taken, so each test grants exactly the cards it needs.
const SETUP_LEVER_BARRAGE = `
  const api = window.__dustAndDeadTest;
  const read = () => JSON.parse(window.render_game_to_text());
  api.clearEnemies();
  api.grantXp(240);
  if (!api.chooseClass("ranger")) throw new Error("Could not choose ranger");
  api.forceAllStandardUpgrades("swiftBoots");
  api.grantXp(1200);
  if (!api.chooseRifleUpgrade("leverBarrage")) throw new Error("Could not choose leverBarrage");
  api.forceAllStandardUpgrades("swiftBoots");
`;

test.afterEach(async ({ page }) => {
  if (page.isClosed()) return;
  await page.evaluate(() => window.DustAndDeadProgression?.resetForTest()).catch(() => {});
});

test("lever rhythm ramps fire rate over five shots and resets on pause or reload", async ({ page }) => {
  await startHunt(page, "leverRhythm=1");

  const result = await page.evaluate(`(() => {
    ${SETUP_LEVER_BARRAGE}
    api.setAmmo("rifle", 18, 54);
    const start = read();
    for (let i = 0; i < 5; i++) api.shootOnce();
    const afterFive = read();
    window.advanceTime(700);
    const afterPause = read();
    for (let i = 0; i < 2; i++) api.shootOnce();
    const afterTwo = read();
    api.setAmmo("rifle", 1, 12);
    api.shootOnce();
    const afterReload = read();
    return {
      startStacks: start.progression.rifleSpecial.leverRhythmStacks,
      cooldownBase: start.ammo.weapons.rifle.cooldown,
      afterFiveStacks: afterFive.progression.rifleSpecial.leverRhythmStacks,
      cooldownRamped: afterFive.ammo.weapons.rifle.cooldown,
      afterPauseStacks: afterPause.progression.rifleSpecial.leverRhythmStacks,
      afterTwoStacks: afterTwo.progression.rifleSpecial.leverRhythmStacks,
      afterReloadStacks: afterReload.progression.rifleSpecial.leverRhythmStacks,
      reloading: afterReload.ammo.weapons.rifle.current === 0,
    };
  })()`);

  expect(result.startStacks).toBe(0);
  expect(result.afterFiveStacks).toBe(5);
  expect(result.cooldownRamped).toBeLessThan(result.cooldownBase);
  expect(result.cooldownRamped).toBeCloseTo(result.cooldownBase / 1.15, 3);
  expect(result.afterPauseStacks).toBe(0);
  expect(result.afterTwoStacks).toBe(2);
  expect(result.afterReloadStacks).toBe(0);
  expect(result.reloading).toBe(true);
});

test("red line speeds up the last quarter of the magazine and pierces one extra enemy", async ({ page }) => {
  await startHunt(page, "redLine=1");

  const result = await page.evaluate(`(() => {
    ${SETUP_LEVER_BARRAGE}
    if (!api.grantUpgrade("redLine")) throw new Error("Could not grant redLine");
    api.setAmmo("rifle", 18, 0);
    const cooldownFull = read().ammo.weapons.rifle.cooldown;
    api.setAmmo("rifle", 5, 0);
    const cooldownFive = read().ammo.weapons.rifle.cooldown;
    api.setAmmo("rifle", 4, 0);
    const cooldownRed = read().ammo.weapons.rifle.cooldown;

    api.clearEnemies();
    const player = read().player;
    api.setAimTarget(player.x, player.z + 14);
    api.spawnZombieAt("walker", player.x, player.z + 4);
    api.spawnZombieAt("walker", player.x, player.z + 5.6);
    api.spawnZombieAt("walker", player.x, player.z + 7.2);
    const killsBeforeRed = read().kills;
    api.setAmmo("rifle", 4, 0);
    api.shootOnce();
    window.advanceTime(400);
    const redKills = read().kills - killsBeforeRed;

    api.clearEnemies();
    const playerAfter = read().player;
    api.setAimTarget(playerAfter.x, playerAfter.z + 14);
    api.spawnZombieAt("walker", playerAfter.x, playerAfter.z + 4);
    api.spawnZombieAt("walker", playerAfter.x, playerAfter.z + 5.6);
    const killsBeforeFull = read().kills;
    api.setAmmo("rifle", 18, 0);
    api.shootOnce();
    window.advanceTime(400);
    const fullKills = read().kills - killsBeforeFull;

    return { cooldownFull, cooldownFive, cooldownRed, redKills, fullKills };
  })()`);

  expect(result.cooldownFive).toBe(result.cooldownFull);
  expect(result.cooldownRed).toBeLessThan(result.cooldownFull);
  expect(result.cooldownRed).toBeCloseTo(result.cooldownFull / 1.2, 3);
  expect(result.redKills).toBe(2);
  expect(result.fullKills).toBe(1);
});

test("lever echo repeats every 6th shot for free without advancing the shot counter", async ({ page }) => {
  await startHunt(page, "leverEcho=1");

  const result = await page.evaluate(`(() => {
    ${SETUP_LEVER_BARRAGE}
    if (!api.grantUpgrade("leverEcho")) throw new Error("Could not grant leverEcho");
    api.clearEnemies();
    api.setAmmo("rifle", 18, 54);
    const player = read().player;
    api.setAimTarget(player.x, player.z + 12);
    for (let i = 0; i < 5; i++) api.shootOnce();
    const afterFive = read().progression.rifleSpecial;
    // Let the five ranging shots expire so the kill count below can only
    // come from the 6th shot and its echo.
    window.advanceTime(1100);
    api.spawnZombieAt("walker", player.x, player.z + 4);
    api.spawnZombieAt("runner", player.x, player.z + 6);
    const killsBefore = read().kills;
    api.shootOnce();
    const afterSix = read().progression.rifleSpecial;
    window.advanceTime(500);
    const settled = read();
    return {
      queuedAfterFive: afterFive.echoQueued,
      queuedAfterSix: afterSix.echoQueued,
      shotsFired: settled.progression.rifleSpecial.shotsFired,
      echoQueuedSettled: settled.progression.rifleSpecial.echoQueued,
      ammoCurrent: settled.ammo.weapons.rifle.current,
      kills: settled.kills - killsBefore,
    };
  })()`);

  expect(result.queuedAfterFive).toBe(0);
  expect(result.queuedAfterSix).toBe(1);
  expect(result.echoQueuedSettled).toBe(0);
  // The echo neither consumes ammo nor advances the lightning shot counter.
  expect(result.shotsFired).toBe(6);
  expect(result.ammoCurrent).toBe(12);
  // Main shot kills the walker (2 hp); the free echo at 60% damage still
  // one-shots the runner (1 hp) behind it.
  expect(result.kills).toBe(2);
});

test("storm feed moves one reserve round into the magazine when a charged shot hits", async ({ page }) => {
  await startHunt(page, "stormFeed=1");

  const result = await page.evaluate(`(() => {
    ${SETUP_LEVER_BARRAGE}
    if (!api.grantUpgrade("chainLightning")) throw new Error("Could not grant chainLightning");
    if (!api.grantUpgrade("stormFeed")) throw new Error("Could not grant stormFeed");
    api.clearEnemies();
    api.setAmmo("rifle", 6, 10);
    const player = read().player;
    api.setAimTarget(player.x, player.z + 12);
    api.spawnZombieAt("walker", player.x, player.z + 4);
    api.spawnZombieAt("walker", player.x, player.z + 4.8);
    api.spawnZombieAt("walker", player.x, player.z + 5.6);
    api.spawnZombieAt("walker", player.x, player.z + 6.4);
    const killsBefore = read().kills;
    for (let i = 0; i < 4; i++) {
      api.shootOnce();
      window.advanceTime(150);
    }
    const settled = read();
    return {
      kills: settled.kills - killsBefore,
      ammoCurrent: settled.ammo.weapons.rifle.current,
      ammoReserve: settled.ammo.weapons.rifle.reserve,
    };
  })()`);

  expect(result.kills).toBe(4);
  // 6 rounds - 4 shots + 1 fed round; reserve pays for the fed round.
  expect(result.ammoCurrent).toBe(3);
  expect(result.ammoReserve).toBe(9);
});

test("forked lightning adds chain targets and return stroke refunds unused jumps into the first target", async ({ page }) => {
  await startHunt(page, "returnStroke=1");

  const result = await page.evaluate(`(() => {
    ${SETUP_LEVER_BARRAGE}
    if (!api.grantUpgrade("chainLightning")) throw new Error("Could not grant chainLightning");
    api.grantUpgrade("forkedLightning");
    api.grantUpgrade("forkedLightning");
    const targets = read().progression.rifleSpecial.lightningTargets;

    // Control: without Return Stroke a lone armored miner (9 hp) survives a
    // charged shot (2 bullet + 3 lightning).
    api.clearEnemies();
    api.setAmmo("rifle", 8, 0);
    const player = read().player;
    api.setAimTarget(player.x, player.z + 20);
    for (let i = 0; i < 3; i++) api.shootOnce();
    window.advanceTime(1100);
    api.spawnZombieAt("armoredMiner", player.x, player.z + 5);
    api.setAimTarget(player.x, player.z + 5);
    const killsBeforeControl = read().kills;
    api.shootOnce();
    window.advanceTime(400);
    const controlKills = read().kills - killsBeforeControl;

    // With Return Stroke the 5 unused jumps return 3 * 0.3 * 5 = 4.5 damage,
    // pushing the same charged shot to 9.5 total and killing the miner.
    if (!api.grantUpgrade("returnStroke")) throw new Error("Could not grant returnStroke");
    api.clearEnemies();
    api.setAimTarget(player.x, player.z + 20);
    for (let i = 0; i < 3; i++) api.shootOnce();
    window.advanceTime(1100);
    api.spawnZombieAt("armoredMiner", player.x, player.z + 5);
    api.setAimTarget(player.x, player.z + 5);
    const killsBeforeStroke = read().kills;
    api.shootOnce();
    window.advanceTime(400);
    const strokeKills = read().kills - killsBeforeStroke;

    return { targets, controlKills, strokeKills };
  })()`);

  expect(result.targets).toBe(6);
  expect(result.controlKills).toBe(0);
  expect(result.strokeKills).toBe(1);
});

test("unbroken storm freezes tempo through faster reloads and eye of the storm quickens lightning", async ({ page }) => {
  await startHunt(page, "unbrokenStorm=1");

  const result = await page.evaluate(`(() => {
    ${SETUP_LEVER_BARRAGE}
    for (const id of ["chainLightning", "stormTempo", "unbrokenStorm", "eyeOfTheStorm"]) {
      if (!api.grantUpgrade(id)) throw new Error("Could not grant " + id);
    }
    api.clearEnemies();
    api.setAmmo("rifle", 12, 20);
    const player = read().player;
    api.setAimTarget(player.x, player.z + 12);
    for (const offset of [4, 4.7, 5.4, 6.1, 6.8, 7.5]) {
      api.spawnZombieAt("walker", player.x, player.z + offset);
    }
    const intervalIdle = read().progression.rifleSpecial.lightningIntervalActive;
    for (let i = 0; i < 4; i++) {
      api.shootOnce();
      window.advanceTime(250);
    }
    const afterFour = read().progression.rifleSpecial;
    api.shootOnce();
    const shotFive = read().projectiles.some((projectile) => projectile.chainLightning);
    window.advanceTime(100);
    api.shootOnce();
    const shotSix = read().projectiles.some((projectile) => projectile.chainLightning);
    window.advanceTime(150);

    const beforeReload = read().progression.rifleSpecial;
    api.setAmmo("rifle", 0, 20);
    api.shootOnce();
    const reloadStarted = read().progression.rifleSpecial;
    window.advanceTime(600);
    const midReload = read();
    window.advanceTime(700);
    const reloadDone = read();
    api.setAimTarget(player.x, player.z + 12);
    api.shootOnce();
    const afterShot = read().progression.rifleSpecial;
    window.advanceTime(300);
    const decayed = read().progression.rifleSpecial;

    return {
      intervalIdle,
      tempoAfterFour: afterFour.stormTempoTimer,
      intervalDuringTempo: afterFour.lightningIntervalActive,
      shotFive,
      shotSix,
      frozenAtReload: reloadStarted.stormFrozen,
      tempoAtReload: reloadStarted.stormTempoTimer,
      frozenMidReload: midReload.progression.rifleSpecial.stormFrozen,
      tempoMidReload: midReload.progression.rifleSpecial.stormTempoTimer,
      ammoMidReload: midReload.ammo.weapons.rifle.current,
      ammoAfterReload: reloadDone.ammo.weapons.rifle.current,
      tempoAfterReload: reloadDone.progression.rifleSpecial.stormTempoTimer,
      frozenAfterShot: afterShot.stormFrozen,
      tempoDecayed: decayed.stormTempoTimer,
    };
  })()`);

  expect(result.intervalIdle).toBe(4);
  expect(result.tempoAfterFour).toBeGreaterThan(0);
  expect(result.intervalDuringTempo).toBe(3);
  // With Eye of the Storm active, the 6th shot (not the 8th) is charged.
  expect(result.shotFive).toBe(false);
  expect(result.shotSix).toBe(true);
  expect(result.frozenAtReload).toBe(true);
  expect(result.frozenMidReload).toBe(true);
  expect(result.tempoMidReload).toBeCloseTo(result.tempoAtReload, 2);
  // 35% faster reload: 1.55s / 1.35 ~ 1.15s, so the magazine is refilled by
  // 1.3s where a stock reload would still be running.
  expect(result.ammoMidReload).toBe(0);
  expect(result.ammoAfterReload).toBe(18);
  expect(result.tempoAfterReload).toBeCloseTo(result.tempoAtReload, 2);
  expect(result.frozenAfterShot).toBe(false);
  expect(result.tempoDecayed).toBeLessThan(result.tempoAtReload);
});

test("pin down boosts sustained Winchester damage against the Bell Ringer", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto(`${fileUrl("index.html")}?preview=bell-ringer-rifle-test&mapSeed=7331`);
  await page.waitForFunction(() => Boolean(
    window.__dustAndDeadTest?.getBellRingerDiagnostics &&
    window.__dustAndDeadTest?.completeBellChurchCapture &&
    window.__dustAndDeadTest?.shootOnce
  ));

  const result = await page.evaluate(() => {
    const api = window.__dustAndDeadTest;
    api.setBellRingerAiEnabled(false);
    api.clearEnemies();
    for (let church = 0; church < 3; church += 1) api.completeBellChurchCapture(church);
    if (!api.grantUpgrade("pinDown")) throw new Error("Could not grant pinDown");
    const boss = api.getBellRingerDiagnostics();
    const player = JSON.parse(window.render_game_to_text()).player;
    const raws = [];
    for (let shot = 0; shot < 7; shot += 1) {
      api.setAmmo("rifle", 36, 9999);
      api.setAimTarget(boss.bossPosition.x, boss.bossPosition.z);
      api.shootOnce();
      window.advanceTime(700);
      raws.push(api.getBellRingerDiagnostics().lastDamage.raw);
    }
    return {
      shielded: boss.shielded,
      distance: Math.hypot(boss.bossPosition.x - player.x, boss.bossPosition.z - player.z),
      raws,
    };
  });

  expect(pageErrors).toEqual([]);
  expect(result.shielded).toBe(false);
  expect(result.distance).toBeLessThan(30);
  // Shots 1-3 are plain hits at the same raw damage; the 4th shot's chain
  // lightning overwrites lastDamage, so it is skipped. The 6th hit pins the
  // boss and the 7th hit lands 15% harder.
  expect(result.raws[0]).toBeGreaterThan(0);
  expect(result.raws[1]).toBe(result.raws[0]);
  expect(result.raws[2]).toBe(result.raws[0]);
  expect(result.raws[6]).toBeCloseTo(result.raws[0] * 1.15, 2);
});
