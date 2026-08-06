const path = require("node:path");
const { expect, test } = require("@playwright/test");

function fileUrl(relativePath) {
  const absolute = path.resolve(__dirname, "..", relativePath).replace(/\\/g, "/");
  return `file:///${absolute}`;
}

async function startHunt(page) {
  await page.goto(`${fileUrl("index.html")}?mapSeed=7331`);
  const intro = page.locator("#intro-screen");
  if (await intro.isVisible().catch(() => false)) {
    await page.keyboard.press("KeyM");
    await expect(intro).toBeHidden();
  }
  await page.getByRole("button", { name: "Start Hunt" }).click();
  await page.waitForFunction(() => Boolean(
    window.__dustAndDeadTest?.getOilBaronDiagnostics &&
    window.__dustAndDeadTest?.forceOilBaronAction &&
    window.__dustAndDeadTest?.forceOilBaronDoubleAction &&
    window.__dustAndDeadTest?.damageOilBaronDebtChain &&
    window.__dustAndDeadTest?.getOilBaronPackedWireDiagnostics
  ));
}

async function startBaron(page) {
  return page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    game.startWaveNow(10, "oilBaron");
    game.clearEnemies();
    game.setOilBaronAiEnabled(false);
    return game.getOilBaronDiagnostics();
  });
}

test("phase-one gates all three abilities and the summon creates exactly two 35%-HP oil doubles", async ({ page }) => {
  await startHunt(page);
  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    game.startWaveNow(10, "oilBaron");
    game.clearEnemies();
    game.setOilBaronAiEnabled(false);

    const phaseZero = game.getOilBaronDiagnostics();
    const gated = {
      monocle: game.forceOilBaronAction("monocle"),
      debt: game.forceOilBaronAction("debt"),
      doubles: game.forceOilBaronAction("doubles"),
    };

    game.damageOilBaron(game.getOilBaronDiagnostics().boss.maxHp * 0.4, true);
    const phaseOne = game.advanceOilBaron(34);
    const summonStarted = game.forceOilBaronAction("doubles");
    const hpAtSummon = summonStarted.boss.hp;
    const summoned = game.advanceOilBaron(1700);
    const duplicateSummon = game.forceOilBaronAction("doubles");
    game.forceOilBaronDoubleAction(0, "star");
    const airborne = game.advanceOilBaron(1900);
    return { phaseZero, gated, phaseOne, hpAtSummon, summoned, duplicateSummon, airborne };
  });

  expect(result.phaseZero).toMatchObject({ phase: 0 });
  expect(result.phaseZero.monocleSentence.phaseUnlocked).toBe(false);
  expect(result.phaseZero.debtChains.phaseUnlocked).toBe(false);
  expect(result.phaseZero.oilDoubles.phaseUnlocked).toBe(false);
  expect(result.gated).toEqual({ monocle: false, debt: false, doubles: false });

  expect(result.phaseOne.phase).toBe(1);
  expect(result.summoned.oilDoubles).toMatchObject({ phaseUnlocked: true, spawned: true, count: 2, generation: 1 });
  expect(result.summoned.oilDoubles.units).toHaveLength(2);
  for (const unit of result.summoned.oilDoubles.units) {
    expect(unit.maxHp).toBeCloseTo(result.hpAtSummon * 0.35, 1);
    expect(unit.hp).toBeCloseTo(unit.maxHp, 2);
    expect(unit.worldHealthBar).toBe(true);
    expect(unit.appearance).toBe("achromatic-black-v1");
    expect(unit.coloredDetailCount).toBe(0);
    expect(unit.silhouetteColor).toBe("060606");
    expect(unit.detailColor).toBe("151515");
    expect(unit.healthBarBaseY).toBeGreaterThan(6.5);
    expect(unit.healthBarY).toBeCloseTo(unit.healthBarBaseY, 2);
    expect(unit.healthBarWorldAligned).toBe(true);
    expect(Math.abs(unit.healthBarWorldYaw)).toBeLessThan(0.001);
    expect(unit.coatingVisible).toBe(true);
    expect(unit.permanentOilBlend).toBeGreaterThanOrEqual(0.8);
    expect(unit.modelScale).toBeGreaterThan(1);
    expect(unit.render).toMatchObject({
      batched: true,
      visualBatches: 4,
      shadowCasters: 5,
      shadowBatches: 2,
      batchError: "",
    });
    expect(unit.render.visibleDrawItems).toBeLessThanOrEqual(13);
  }
  const airborneDouble = result.airborne.oilDoubles.units[0];
  expect(airborneDouble.action).toBe("oilStar");
  expect(airborneDouble.healthBarJumpOffset).toBeGreaterThan(4);
  expect(airborneDouble.healthBarY).toBeCloseTo(
    airborneDouble.healthBarBaseY + airborneDouble.healthBarJumpOffset,
    2
  );
  expect(result.duplicateSummon).toBe(false);
});

test("Debt Chain has a forgiving invisible hit collider without enlarging its links", async ({ page }) => {
  await startHunt(page);
  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const multi = window.__dustMultiplayerTest;
    multi.startMockHost(["Shooter", "Debtor"]);
    game.startWaveNow(10, "oilBaron");
    game.clearEnemies();
    game.setOilBaronAiEnabled(false);
    game.damageOilBaron(game.getOilBaronDiagnostics().boss.maxHp * 0.4, true);
    game.advanceOilBaron(34);

    const boss = game.getOilBaronDiagnostics().boss;
    const centerDistance = Math.max(0.001, Math.hypot(boss.x, boss.z));
    const dirX = -boss.x / centerDistance;
    const dirZ = -boss.z / centerDistance;
    const sideX = -dirZ;
    const sideZ = dirX;
    // The debtor is the closest target. The collision probe follows the real
    // bullet sweep parallel to the chain, 0.58 units to its side: strictly
    // outside the authored 0.34 link, but inside the 0.72 damage collider.
    multi.setPlayerPosition("mock-player-2", boss.x + dirX * 8, boss.z + dirZ * 8);
    multi.setPlayerPosition(
      "mock-player-1",
      boss.x + dirX * 4 + sideX * 9,
      boss.z + dirZ * 4 + sideZ * 9,
    );
    const started = game.forceOilBaronAction("debt") !== false;
    game.advanceOilBaron(1600);
    const before = game.getOilBaronDiagnostics();
    const offset = 0.58;
    const hitProbe = game.probeOilBaronDebtChainCollider(0, offset, 0);
    return { started, before, hitProbe };
  });

  expect(result.started).toBe(true);
  expect(result.before.debtChains).toMatchObject({
    count: 1,
    visualLinkRadius: 0.34,
    hitRadius: 0.72,
  });
  expect(result.before.debtChains.chains[0].hitRadius).toBe(0.72);
  expect(result.hitProbe).toMatchObject({
    hitChain: true,
    hitType: "oilDebtChain",
    hitRadius: 0.72,
    visualRadius: 0.34,
    offset: 0.58,
  });
  expect(result.hitProbe.sweepHitTime).not.toBeNull();
});

test("Monocle Sentence marks the farthest unobstructed player", async ({ page }) => {
  await startHunt(page);
  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const multi = window.__dustMultiplayerTest;
    multi.startMockHost(["Host", "Guest"]);
    game.startWaveNow(10, "oilBaron");
    game.clearEnemies();
    game.setOilBaronAiEnabled(false);
    game.damageOilBaron(game.getOilBaronDiagnostics().boss.maxHp * 0.4, true);
    game.advanceOilBaron(34);
    const boss = game.getOilBaronDiagnostics().boss;
    const centerDistance = Math.max(0.001, Math.hypot(boss.x, boss.z));
    const towardCenterX = -boss.x / centerDistance;
    const towardCenterZ = -boss.z / centerDistance;
    multi.setPlayerPosition("mock-player-1", boss.x + towardCenterX * 12, boss.z + towardCenterZ * 12);
    multi.setPlayerPosition("mock-player-2", boss.x + towardCenterX * 26, boss.z + towardCenterZ * 26);
    const started = game.forceOilBaronAction("monocle");
    return { started, diagnostics: game.getOilBaronDiagnostics() };
  });

  expect(result.started).not.toBe(false);
  expect(result.diagnostics.monocleSentence).toMatchObject({
    active: true,
    phaseUnlocked: true,
    targetPlayerId: "mock-player-2",
    markVisible: true,
    damageRatio: 0.4,
  });
  expect(result.diagnostics.monocleSentence.projectileSpeed).toBeGreaterThan(35);
  expect(result.diagnostics.monocleSentence.projectileSpeed).toBeLessThan(60);
});

test("Monocle Sentence skips a farther player hidden behind a derrick", async ({ page }) => {
  await startHunt(page);
  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const multi = window.__dustMultiplayerTest;
    multi.startMockHost(["Near", "Far"]);
    game.startWaveNow(10, "oilBaron");
    game.clearEnemies();
    game.setOilBaronAiEnabled(false);
    game.damageOilBaron(game.getOilBaronDiagnostics().boss.maxHp * 0.4, true);
    game.advanceOilBaron(34);
    const boss = game.getOilBaronDiagnostics().boss;
    const centerDistance = Math.max(0.001, Math.hypot(boss.x, boss.z));
    const dirX = -boss.x / centerDistance;
    const dirZ = -boss.z / centerDistance;
    multi.setPlayerPosition("mock-player-1", boss.x + dirX * 10, boss.z + dirZ * 10);
    multi.setPlayerPosition("mock-player-2", boss.x + dirX * 26, boss.z + dirZ * 26);
    game.spawnOilDerrick(boss.x + dirX * 18, boss.z + dirZ * 18, {
      instant: true,
      silent: true,
      logicalOnly: true,
    });
    const started = game.forceOilBaronAction("monocle");
    return { started, diagnostics: game.getOilBaronDiagnostics() };
  });

  expect(result.started).not.toBe(false);
  expect(result.diagnostics.monocleSentence).toMatchObject({
    active: true,
    targetPlayerId: "mock-player-1",
    markVisible: true,
  });
});

test("Monocle Sentence launches a physical dodgeable round and deals 40% maximum HP on impact", async ({ page }) => {
  await startHunt(page);
  await startBaron(page);
  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    game.damageOilBaron(game.getOilBaronDiagnostics().boss.maxHp * 0.4, true);
    game.advanceOilBaron(34);
    const boss = game.getOilBaronDiagnostics().boss;
    game.setPlayerMaxHp(500, 500);
    game.setPlayerPosition(boss.x, boss.z + 20);

    game.forceOilBaronAction("monocle");
    const marked = game.getOilBaronDiagnostics();
    const launched = game.advanceOilBaron(1580);
    const projectileBefore = launched.monocleSentence.projectiles[0];
    const impacted = game.advanceOilBaron(650);
    const hitHealth = game.getPlayerHealth();

    game.advanceOilBaron(700);
    game.setPlayerMaxHp(500, 500);
    game.setPlayerPosition(boss.x, boss.z + 30);
    game.forceOilBaronAction("monocle");
    const dodgeLaunch = game.advanceOilBaron(1580);
    const dodgeProjectileBefore = dodgeLaunch.monocleSentence.projectiles[0];
    game.setPlayerPosition(boss.x + 10, boss.z + 30);
    const dodgeMoved = game.advanceOilBaron(260);
    const dodgeProjectileAfter = dodgeMoved.monocleSentence.projectiles[0];
    game.advanceOilBaron(2200);
    const dodgeHealth = game.getPlayerHealth();
    return {
      marked,
      projectileBefore,
      impacted,
      hitHealth,
      dodgeProjectileBefore,
      dodgeProjectileAfter,
      dodgeHealth,
    };
  });

  expect(result.marked.monocleSentence).toMatchObject({ active: true, markVisible: true, targetPlayerId: "solo" });
  expect(result.projectileBefore).toBeTruthy();
  expect(result.projectileBefore.visualParts).toBeGreaterThanOrEqual(3);
  expect(result.hitHealth).toMatchObject({ maxHp: 500, hp: 300 });
  expect(result.impacted.monocleSentence.projectileCount).toBe(0);

  expect(result.dodgeProjectileBefore).toBeTruthy();
  expect(result.dodgeProjectileAfter).toBeTruthy();
  expect(Math.hypot(
    result.dodgeProjectileAfter.x - result.dodgeProjectileBefore.x,
    result.dodgeProjectileAfter.z - result.dodgeProjectileBefore.z,
  )).toBeGreaterThan(7);
  expect(result.dodgeProjectileAfter.remaining).toBeLessThan(result.dodgeProjectileBefore.remaining);
  expect(result.dodgeHealth).toMatchObject({ maxHp: 500, hp: 500 });
});

test("Debt Chain immobilizes, pulls for 5 DPS, exposes a detailed breakable chain, then releases the player", async ({ page }) => {
  await startHunt(page);
  await startBaron(page);
  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    game.damageOilBaron(game.getOilBaronDiagnostics().boss.maxHp * 0.4, true);
    game.advanceOilBaron(34);
    const boss = game.getOilBaronDiagnostics().boss;
    game.setPlayerMaxHp(500, 500);
    game.setPlayerPosition(boss.x, boss.z + 20);
    game.forceOilBaronAction("debt");
    const warning = game.getOilBaronDiagnostics();
    const attached = game.advanceOilBaron(1120);
    const attachedDistance = Math.hypot(attached.player.x - attached.boss.x, attached.player.z - attached.boss.z);
    const pulled = game.advanceOilBaron(2100);
    const pulledDistance = Math.hypot(pulled.player.x - pulled.boss.x, pulled.player.z - pulled.boss.z);
    const chain = pulled.debtChains.chains[0];
    const partialDamage = game.damageOilBaronDebtChain(chain.id, chain.maxHp - 1);
    const weakened = game.getOilBaronDiagnostics();
    const finalDamage = game.damageOilBaronDebtChain(chain.id, 1);
    const broken = game.getOilBaronDiagnostics();
    return { warning, attached, attachedDistance, pulled, pulledDistance, chain, partialDamage, weakened, finalDamage, broken };
  });

  expect(result.warning.debtChains).toMatchObject({ activeWindup: true, telegraphVisible: true, dps: 5, pullSpeed: 1.65, maxHp: 36 });
  expect(result.attached.player).toMatchObject({ debtChained: true, oilSpeedMultiplier: 0 });
  expect(result.attached.debtChains.count).toBe(1);
  expect(result.chain).toMatchObject({ hp: 36, maxHp: 36, healthBar: true });
  expect(result.chain.activeLinks).toBeGreaterThanOrEqual(20);
  expect(result.chain.matrixUpdates).toBeGreaterThan(20);
  expect(result.attached.player.hp - result.pulled.player.hp).toBeCloseTo(10, 0);
  expect(result.attachedDistance - result.pulledDistance).toBeGreaterThan(2.8);

  expect(result.partialDamage).toBe(35);
  expect(result.weakened.debtChains).toMatchObject({ count: 1, chains: [{ hp: 1, maxHp: 36 }] });
  expect(result.finalDamage).toBe(1);
  expect(result.broken.debtChains.count).toBe(0);
  expect(result.broken.player).toMatchObject({ debtChained: false, oilSpeedMultiplier: 1 });
});

test("Debt Chain is a cast-and-release attack: the Baron resumes combat while the belt-anchored chain keeps pulling", async ({ page }) => {
  await startHunt(page);
  await startBaron(page);
  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    game.damageOilBaron(game.getOilBaronDiagnostics().boss.maxHp * 0.4, true);
    game.advanceOilBaron(34);
    const boss = game.getOilBaronDiagnostics().boss;
    game.setPlayerMaxHp(500, 500);
    game.setPlayerPosition(boss.x, boss.z + 20);

    const started = game.forceOilBaronAction("debt");
    const windup = game.getOilBaronDiagnostics();
    const released = game.advanceOilBaron(1120);
    const freeDuringHandoff = game.advanceOilBaron(320);
    const latched = game.advanceOilBaron(160);
    const distanceBeforeCane = Math.hypot(
      latched.player.x - latched.boss.x,
      latched.player.z - latched.boss.z,
    );

    const caneStarted = game.forceOilBaronAction("cane");
    const caneWindup = game.advanceOilBaron(260);
    const distanceDuringCane = Math.hypot(
      caneWindup.player.x - caneWindup.boss.x,
      caneWindup.player.z - caneWindup.boss.z,
    );
    return {
      started: started !== false,
      windup,
      released,
      freeDuringHandoff,
      latched,
      caneStarted: caneStarted !== false,
      caneWindup,
      distanceBeforeCane,
      distanceDuringCane,
    };
  });

  // The winding spectral preview is only the readable cast warning, not the
  // persistent damageable chain.
  expect(result.started).toBe(true);
  expect(result.windup.boss.action).toBe("debtWindup");
  expect(result.windup.debtChains).toMatchObject({
    activeWindup: true,
    telegraphVisible: true,
    count: 0,
  });
  // At release, the warning is already gone while the physical chain gets a
  // short, readable flight/handoff instead of snapping instantly to the belt.
  expect(["recover", "idle"]).toContain(result.released.boss.action);
  expect(result.released.debtChains).toMatchObject({
    activeWindup: false,
    telegraphVisible: false,
    count: 1,
  });
  expect(result.released.debtChains.chains[0]).toMatchObject({
    visualVisible: true,
  });

  // Recovery ends before the automatic belt handoff: the Baron is already
  // free while the mechanism finishes accepting the latched chain.
  expect(result.freeDuringHandoff.boss.action).toBe("idle");
  expect(result.freeDuringHandoff.debtChains.count).toBe(1);
  expect(result.freeDuringHandoff.debtChains.chains[0]).toMatchObject({
    visualVisible: true,
    latched: true,
    anchorMode: "transfer",
  });

  // After the brief handoff, the real tether hangs from the Baron's belt/body
  // spool, leaving his cane and his combat state free for another attack.
  expect(result.latched.boss.action).toBe("idle");
  expect(result.latched.debtChains.count).toBe(1);
  expect(result.latched.debtChains.chains[0]).toMatchObject({
    visualVisible: true,
    latched: true,
    anchorMode: "belt",
  });
  expect(result.latched.debtChains.chains[0].distanceFromCaneMuzzle).toBeGreaterThan(0.35);
  expect(result.latched.player).toMatchObject({ debtChained: true, oilSpeedMultiplier: 0 });

  expect(result.caneStarted).toBe(true);
  expect(result.caneWindup.boss.action).toBe("caneWindup");
  expect(result.caneWindup.debtChains).toMatchObject({
    activeWindup: false,
    telegraphVisible: false,
    count: 1,
  });
  expect(result.caneWindup.debtChains.chains[0]).toMatchObject({
    visualVisible: true,
    latched: true,
    anchorMode: "belt",
  });
  expect(result.distanceBeforeCane - result.distanceDuringCane).toBeGreaterThan(0.25);
});

test("one area attack damages a Debt Chain once while separate direct hits still stack", async ({ page }) => {
  await startHunt(page);
  await startBaron(page);
  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    game.damageOilBaron(game.getOilBaronDiagnostics().boss.maxHp * 0.4, true);
    game.advanceOilBaron(34);
    const boss = game.getOilBaronDiagnostics().boss;
    game.setPlayerPosition(boss.x, boss.z + 20);
    game.forceOilBaronAction("debt");
    game.advanceOilBaron(1120);
    const attached = game.advanceOilBaron(500);
    const chain = attached.debtChains.chains[0];

    const launcher = JSON.parse(window.render_game_to_text()).progression.launcherSpecial;
    // Use the real unupgraded launcher blast near the chain's player-side
    // endpoint, not an artificial direct hit. Even with the explosion centre
    // at 90% of its radius away from the nearest link, the area attack must
    // damage the canonical chain exactly once rather than once per proxy.
    const explosionX = chain.x + launcher.blastRadius * 0.9;
    game.triggerLauncherExplosionAt(
      explosionX,
      chain.z,
      "main",
      launcher.blastRadius,
      launcher.blastDamage,
      { noAudio: true, noFire: true, noCluster: true, noShrapnel: true }
    );
    const afterArea = game.getOilBaronDiagnostics().debtChains.chains[0];

    // Two distinct bullets/hits must remain two distinct damage events.
    const directOne = game.damageOilBaronDebtChain(chain.id, 1);
    const directTwo = game.damageOilBaronDebtChain(chain.id, 1);
    const afterDirect = game.getOilBaronDiagnostics().debtChains.chains[0];
    return { chain, launcher, explosionX, afterArea, directOne, directTwo, afterDirect };
  });

  expect(result.chain).toMatchObject({ hp: 36, maxHp: 36 });
  expect(result.afterArea).toMatchObject({ hp: 31, maxHp: 36 });
  expect(result.directOne).toBe(1);
  expect(result.directTwo).toBe(1);
  expect(result.afterDirect).toMatchObject({ hp: 29, maxHp: 36 });
});

test("player fire damages isolated Debt Chains and Oil Derricks without a normal enemy nearby", async ({ page }) => {
  await startHunt(page);
  await startBaron(page);
  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const multiplayer = window.__dustMultiplayerTest;
    game.damageOilBaron(game.getOilBaronDiagnostics().boss.maxHp * 0.4, true);
    game.advanceOilBaron(34);
    const boss = game.getOilBaronDiagnostics().boss;
    game.setPlayerPosition(boss.x, boss.z + 20);
    game.forceOilBaronAction("debt");
    game.advanceOilBaron(1120);
    const attached = game.advanceOilBaron(500);
    const chain = attached.debtChains.chains[0];
    const chainLink = game.probeOilBaronDebtChainCollider(chain.id, 0, 0);
    game.configureBossWeaponBuildForTest({
      playerClass: "demolitionist",
      launcherUpgrade: "pyrotechnician",
      weapon: "launcher",
      upgrades: ["hotterFire", "hotterFire"],
      ammoCurrent: 3,
    });
    game.setAimTarget(chainLink.centerX, chainLink.centerZ);
    const fired = game.shootOnce();
    for (let frame = 0; frame < 180 && multiplayer.getAuthoritativeBullets().length; frame += 1) {
      multiplayer.stepBullets(1 / 60);
    }
    const afterShell = game.getOilBaronDiagnostics().debtChains.chains[0];

    game.spawnOilDerrick(chainLink.centerX + 7, chainLink.centerZ, {
      instant: true,
      silent: true,
      maxHp: 80,
    });
    const before = game.getOilBaronDiagnostics();
    const derrick = before.derricks[before.derricks.length - 1];
    game.spawnFirePatchAt(derrick.x, derrick.z, 2.6, 2);
    window.advanceTime(520);
    const after = game.getOilBaronDiagnostics();
    return {
      chainBefore: chain,
      chainLink,
      fired,
      afterShell,
      chainAfter: after.debtChains.chains.find((entry) => entry.id === chain.id),
      derrickBefore: derrick,
      derrickAfter: after.derricks.find((entry) => entry.id === derrick.id),
    };
  });

  expect(result.chainBefore).toMatchObject({ hp: 36, maxHp: 36 });
  expect(result.chainLink).toMatchObject({ hitChain: true, offset: 0 });
  expect(result.fired).toBe(true);
  expect(result.afterShell.hp).toBeLessThanOrEqual(result.chainBefore.hp - 8);
  expect(result.chainAfter.hp).toBeLessThan(result.afterShell.hp);
  expect(result.derrickBefore).toMatchObject({ hp: 80, maxHp: 80, destroyed: false });
  expect(result.derrickAfter.hp).toBeLessThan(result.derrickBefore.hp);
  expect(result.derrickAfter.destroyed).toBe(false);
});

test("oil doubles stay inside the cane, debt-chain, and oil-star action whitelist", async ({ page }) => {
  await startHunt(page);
  await startBaron(page);
  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    game.damageOilBaron(game.getOilBaronDiagnostics().boss.maxHp * 0.4, true);
    game.advanceOilBaron(34);
    game.forceOilBaronAction("doubles");
    game.advanceOilBaron(1700);
    const unit = game.getOilBaronDiagnostics().oilDoubles.units[0];
    game.setPlayerPosition(unit.x, unit.z + 14);

    const cane = game.forceOilBaronDoubleAction(0, "cane");
    game.advanceOilBaron(1700);
    const forbidden = game.forceOilBaronDoubleAction(0, "monocle");
    game.advanceOilBaron(1700);
    const debt = game.forceOilBaronDoubleAction(0, "debt");
    game.advanceOilBaron(1120);
    const chain = game.getOilBaronDiagnostics().debtChains.chains[0];
    if (chain) game.damageOilBaronDebtChain(chain.id, 999);
    game.advanceOilBaron(650);
    const star = game.forceOilBaronDoubleAction(0, "star");
    return {
      actions: [
        cane && cane.oilDoubles.units[0].action,
        forbidden && forbidden.oilDoubles.units[0].action,
        debt && debt.oilDoubles.units[0].action,
        star && star.oilDoubles.units[0].action,
      ],
      star,
    };
  });

  expect(result.actions).toEqual(["caneWindup", "caneWindup", "debtWindup", "oilStar"]);
  const allowed = new Set(["idle", "caneWindup", "debtWindup", "oilStar", "recover"]);
  expect(result.actions.every((action) => allowed.has(action))).toBe(true);
  expect(result.star.oilDoubles.units[0].invulnerable).toBe(true);
});

test("compact Oil Baron wire round-trips phase-one target, projectile, double, and chain fields within budget", async ({ page }) => {
  await startHunt(page);
  await startBaron(page);
  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    game.damageOilBaron(game.getOilBaronDiagnostics().boss.maxHp * 0.4, true);
    game.advanceOilBaron(34);
    game.forceOilBaronAction("doubles");
    game.advanceOilBaron(1700);
    game.advanceOilBaron(800);
    const boss = game.getOilBaronDiagnostics().boss;
    game.setPlayerPosition(boss.x, boss.z + 20);

    game.forceOilBaronAction("debt");
    game.advanceOilBaron(1120);
    const chainWire = game.getOilBaronPackedWireDiagnostics();
    const chain = game.getOilBaronDiagnostics().debtChains.chains[0];
    game.damageOilBaronDebtChain(chain.id, 999);
    game.advanceOilBaron(700);

    game.setPlayerPosition(boss.x, boss.z + 30);
    game.forceOilBaronAction("monocle");
    const markWire = game.getOilBaronPackedWireDiagnostics();
    game.advanceOilBaron(1580);
    const projectileWire = game.getOilBaronPackedWireDiagnostics();
    return { chainWire, markWire, projectileWire };
  });

  for (const wire of [result.chainWire, result.markWire, result.projectileWire]) {
    expect(wire.regularBytes).toBeLessThan(320);
    expect(wire.keyframeBytes).toBeLessThan(16 * 1024);
    expect(wire.regularDecoded).toMatchObject({ valid: true });
    expect(wire.keyframeDecoded).toMatchObject({ valid: true });
    expect(wire.regularDecoded.data).toMatchObject({ kind: "oilBaron", phase: 1, oilDoublesSpawned: true });
    expect(wire.regularDecoded.data.oilDoubles).toHaveLength(2);
    expect(wire.keyframeDecoded.data.oilDoubles).toEqual(wire.regularDecoded.data.oilDoubles);
  }

  expect(result.chainWire.regularDecoded.data.debtChains).toHaveLength(1);
  expect(result.chainWire.regularDecoded.data.debtChains[0]).toMatchObject({ sourceId: "oil-baron", targetId: "solo", hp: 36, maxHp: 36 });
  expect(result.markWire.regularDecoded.data).toMatchObject({ action: "monocleWindup", targetId: "solo" });
  expect(result.projectileWire.regularDecoded.data.monocleProjectiles).toHaveLength(1);
  expect(result.projectileWire.regularDecoded.data.monocleProjectiles[0]).toMatchObject({
    id: expect.stringMatching(/^oil-monocle-/),
  });
  expect(result.projectileWire.regularDecoded.data.monocleProjectiles[0].remaining).toBeGreaterThan(0);
});

test("all four simultaneous Debt Chains survive compact host-to-guest replication without truncation or duplicates", async ({ page, context }) => {
  const guest = await context.newPage();
  try {
    await startHunt(page);
    await startHunt(guest);

    const host = await page.evaluate(() => {
      const game = window.__dustAndDeadTest;
      const multi = window.__dustMultiplayerTest;
      multi.startMockHost(["Host", "Guest A", "Guest B", "Guest C"]);
      game.startWaveNow(10, "oilBaron");
      game.clearEnemies();
      game.setOilBaronAiEnabled(false);
      const initialBoss = game.getOilBaronDiagnostics().boss;
      game.damageOilBaron(initialBoss.maxHp * 0.4 + 1, true);
      game.advanceOilBaron(34);

      const boss = game.getOilBaronDiagnostics().boss;
      const centerDistance = Math.max(0.001, Math.hypot(boss.x, boss.z));
      const dirX = centerDistance > 0.01 ? -boss.x / centerDistance : 0;
      const dirZ = centerDistance > 0.01 ? -boss.z / centerDistance : 1;
      [8, 12, 16, 20].forEach((distance, index) => {
        multi.setPlayerPosition(
          `mock-player-${index + 1}`,
          boss.x + dirX * distance,
          boss.z + dirZ * distance,
        );
      });

      const starts = [];
      for (let index = 0; index < 4; index += 1) {
        starts.push(game.forceOilBaronAction("debt") !== false);
        game.advanceOilBaron(1120);
      }
      const diagnostics = game.getOilBaronDiagnostics();
      const packed = game.getOilBaronPackedWireDiagnostics();
      return {
        starts,
        diagnostics,
        packed,
        snapshot: multi.buildWireSnapshot(true, true, "mock-player-4"),
      };
    });

    expect(host.starts).toEqual([true, true, true, true]);
    expect(host.diagnostics.debtChains.count).toBe(4);
    expect(new Set(host.diagnostics.debtChains.chains.map((chain) => chain.id)).size).toBe(4);
    expect(new Set(host.diagnostics.debtChains.chains.map((chain) => chain.targetPlayerId))).toEqual(new Set([
      "mock-player-1",
      "mock-player-2",
      "mock-player-3",
      "mock-player-4",
    ]));
    for (const chain of host.diagnostics.debtChains.chains) {
      expect(chain.render).toMatchObject({
        instanced: true,
        linkDrawCalls: 1,
        dynamicMatrices: true,
        analyticBounds: true,
        sharedMaterial: true,
        accessoriesBatched: true,
        targetUpdateHz: 30,
      });
      expect(chain.render.activeInstances).toBe(chain.activeLinks);
      expect(chain.render.collisionProxiesActive).toBe(chain.activeLinks);
      expect(chain.render.visibleDrawItems).toBe(1);
      expect(chain.render.instanceCapacity).toBe(48);
    }
    expect(host.diagnostics.debtChains.accessoryBatch).toMatchObject({
      enabled: true,
      // Three persistent contracts plus the newest chain's two-piece cast head.
      drawCalls: 9,
      shadowDrawCalls: 2,
      activeInstances: 23,
      batchCount: 9,
    });
    for (const decoded of [host.packed.regularDecoded, host.packed.keyframeDecoded]) {
      expect(decoded).toMatchObject({ valid: true, data: { kind: "oilBaron" } });
      expect(decoded.data.debtChains).toHaveLength(4);
      expect(new Set(decoded.data.debtChains.map((chain) => chain.targetId)).size).toBe(4);
    }

    const guestFirst = await guest.evaluate((snapshot) => {
      const game = window.__dustAndDeadTest;
      const multi = window.__dustMultiplayerTest;
      multi.startMockGuest(["Host", "Guest A", "Guest B", "Guest C"], 3);
      multi.applySnapshot(snapshot);
      return game.advanceOilBaron(34);
    }, host.snapshot);
    expect(guestFirst).toMatchObject({ replica: true, debtChains: { count: 4 } });
    expect(new Set(guestFirst.debtChains.chains.map((chain) => chain.id)).size).toBe(4);
    expect(new Set(guestFirst.debtChains.chains.map((chain) => chain.targetPlayerId))).toEqual(new Set([
      "mock-player-1",
      "mock-player-2",
      "mock-player-3",
      "mock-player-4",
    ]));
    expect(guestFirst.debtChains.chains.filter((chain) => chain.replicaCastInferred)).toHaveLength(1);
    expect(guestFirst.debtChains.chains.filter((chain) => chain.anchorMode === "belt")).toHaveLength(3);
    expect(guestFirst.debtChains.chains.find((chain) => chain.replicaCastInferred)).toMatchObject({
      latched: false,
      anchorMode: "cane",
    });
    expect(guestFirst.player).toMatchObject({ debtChained: true, oilSpeedMultiplier: 0 });

    const repeated = await page.evaluate(() => (
      window.__dustMultiplayerTest.buildWireSnapshot(true, true, "mock-player-4")
    ));
    const guestRepeated = await guest.evaluate((snapshot) => {
      window.__dustMultiplayerTest.applySnapshot(snapshot);
      return window.__dustAndDeadTest.getOilBaronDiagnostics();
    }, repeated);
    expect(guestRepeated.debtChains.count).toBe(4);
    expect(guestRepeated.debtChains.chains.map((chain) => chain.id).sort()).toEqual(
      guestFirst.debtChains.chains.map((chain) => chain.id).sort(),
    );
    const firstLiveCast = guestFirst.debtChains.chains.find((chain) => chain.replicaCastInferred);
    const repeatedLiveCast = guestRepeated.debtChains.chains.find((chain) => chain.id === firstLiveCast.id);
    expect(repeatedLiveCast.castAge).toBeGreaterThanOrEqual(firstLiveCast.castAge);

    const guestLatched = await guest.evaluate(() => window.__dustAndDeadTest.advanceOilBaron(520));
    expect(guestLatched.debtChains.chains.find((chain) => chain.id === firstLiveCast.id)).toMatchObject({
      replicaCastInferred: true,
      latched: true,
      anchorMode: "belt",
    });
  } finally {
    await guest.close();
  }
});

test("Monocle launch and impact combat events play exactly once on a guest even when snapshots repeat", async ({ page, context }) => {
  const guest = await context.newPage();
  try {
    await startHunt(page);
    await startHunt(guest);

    const launch = await page.evaluate(() => {
      const game = window.__dustAndDeadTest;
      const multi = window.__dustMultiplayerTest;
      multi.startMockHost(["Host", "Guest"]);
      game.startWaveNow(10, "oilBaron");
      game.clearEnemies();
      game.setOilBaronAiEnabled(false);
      const initialBoss = game.getOilBaronDiagnostics().boss;
      game.damageOilBaron(initialBoss.maxHp * 0.4 + 1, true);
      game.advanceOilBaron(34);

      const boss = game.getOilBaronDiagnostics().boss;
      const centerDistance = Math.max(0.001, Math.hypot(boss.x, boss.z));
      const dirX = centerDistance > 0.01 ? -boss.x / centerDistance : 0;
      const dirZ = centerDistance > 0.01 ? -boss.z / centerDistance : 1;
      multi.setPlayerPosition("mock-player-1", boss.x - dirZ * 7, boss.z + dirX * 7);
      multi.setPlayerPosition("mock-player-2", boss.x + dirX * 18, boss.z + dirZ * 18);
      const started = game.forceOilBaronAction("monocle") !== false;
      game.advanceOilBaron(1580);
      const diagnostics = game.getOilBaronDiagnostics();
      return {
        started,
        diagnostics,
        snapshot: multi.buildWireSnapshot(true, true, "mock-player-2"),
      };
    });
    expect(launch.started).toBe(true);
    expect(launch.diagnostics.monocleSentence.projectileCount).toBe(1);
    expect(launch.snapshot.combatEvents.map((event) => event.type)).toEqual(["oilBaronMonocleLaunch"]);

    const guestLaunch = await guest.evaluate((snapshot) => {
      const multi = window.__dustMultiplayerTest;
      multi.startMockGuest(["Host", "Guest"], 1);
      multi.applySnapshot(snapshot);
      return multi.getNetworkCombatDiagnostics();
    }, launch.snapshot);
    expect(guestLaunch.guestEvents).toMatchObject([{
      type: "oilBaronMonocleLaunch",
      sound: "oilBaronMonocleLaunch",
      visuals: 1,
    }]);

    const repeatedLaunch = await page.evaluate(() => (
      window.__dustMultiplayerTest.buildWireSnapshot(true, true, "mock-player-2")
    ));
    const guestRepeatedLaunch = await guest.evaluate((snapshot) => {
      const multi = window.__dustMultiplayerTest;
      multi.applySnapshot(snapshot);
      return multi.getNetworkCombatDiagnostics();
    }, repeatedLaunch);
    expect(guestRepeatedLaunch.guestEvents).toEqual(guestLaunch.guestEvents);
    expect(guestRepeatedLaunch.lastCombatEventSequence).toBe(guestLaunch.lastCombatEventSequence);

    const impact = await page.evaluate(() => {
      const game = window.__dustAndDeadTest;
      const multi = window.__dustMultiplayerTest;
      game.advanceOilBaron(700);
      return {
        diagnostics: game.getOilBaronDiagnostics(),
        snapshot: multi.buildWireSnapshot(true, true, "mock-player-2"),
      };
    });
    expect(impact.diagnostics.monocleSentence.projectileCount).toBe(0);
    expect(impact.snapshot.combatEvents.map((event) => event.type)).toEqual([
      "oilBaronMonocleLaunch",
      "oilBaronMonocleImpact",
    ]);

    const guestImpact = await guest.evaluate((snapshot) => {
      const multi = window.__dustMultiplayerTest;
      multi.applySnapshot(snapshot);
      return multi.getNetworkCombatDiagnostics();
    }, impact.snapshot);
    expect(guestImpact.guestEvents.map((event) => event.type)).toEqual([
      "oilBaronMonocleLaunch",
      "oilBaronMonocleImpact",
    ]);
    expect(guestImpact.guestEvents.filter((event) => event.type === "oilBaronMonocleLaunch")).toHaveLength(1);
    expect(guestImpact.guestEvents.filter((event) => event.type === "oilBaronMonocleImpact")).toHaveLength(1);
    expect(guestImpact.guestEvents[1]).toMatchObject({
      sound: "oilBaronMonocleImpact",
      visuals: 3,
    });

    const repeatedImpact = await page.evaluate(() => (
      window.__dustMultiplayerTest.buildWireSnapshot(true, true, "mock-player-2")
    ));
    const guestRepeatedImpact = await guest.evaluate((snapshot) => {
      const multi = window.__dustMultiplayerTest;
      multi.applySnapshot(snapshot);
      return multi.getNetworkCombatDiagnostics();
    }, repeatedImpact);
    expect(guestRepeatedImpact.guestEvents).toEqual(guestImpact.guestEvents);
    expect(guestRepeatedImpact.lastCombatEventSequence).toBe(guestImpact.lastCombatEventSequence);
  } finally {
    await guest.close();
  }
});

test("live host snapshots reconcile oil doubles, debt chains, and Monocle projectiles on a guest without duplicates", async ({ page, context }) => {
  const guest = await context.newPage();
  try {
    await startHunt(page);
    await startHunt(guest);
    // This scenario advances both peers explicitly. Park their live RAF loops
    // so wall-clock time between cross-page assertions cannot age a 180 ms
    // chain handoff from "transfer" all the way to "belt".
    await page.evaluate(() => window.__dustAndDeadTest.setAutomaticFrameLoopModeForTest("paused"));
    await guest.evaluate(() => window.__dustAndDeadTest.setAutomaticFrameLoopModeForTest("paused"));

    const bootstrap = await page.evaluate(() => {
      const game = window.__dustAndDeadTest;
      const multi = window.__dustMultiplayerTest;
      multi.startMockHost(["Host", "Guest"]);
      game.startWaveNow(10, "oilBaron");
      game.clearEnemies();
      game.setOilBaronAiEnabled(false);
      game.damageOilBaron(game.getOilBaronDiagnostics().boss.maxHp * 0.4, true);
      game.advanceOilBaron(34);
      game.forceOilBaronAction("doubles");
      game.advanceOilBaron(2500);
      const diagnostics = game.getOilBaronDiagnostics();
      return {
        diagnostics,
        snapshot: multi.buildWireSnapshot(true, true, "mock-player-2"),
      };
    });

    expect(bootstrap.diagnostics.oilDoubles.count).toBe(2);
    expect(new Set(bootstrap.diagnostics.oilDoubles.units.map((unit) => unit.id)).size).toBe(2);

    const guestBootstrap = await guest.evaluate((snapshot) => {
      const game = window.__dustAndDeadTest;
      const multi = window.__dustMultiplayerTest;
      multi.startMockGuest(["Host", "Guest"], 1);
      multi.applySnapshot(snapshot);
      return game.getOilBaronDiagnostics();
    }, bootstrap.snapshot);
    expect(guestBootstrap).toMatchObject({ replica: true, phase: 1, oilDoubles: { spawned: true, count: 2 } });
    expect(new Set(guestBootstrap.oilDoubles.units.map((unit) => unit.id)).size).toBe(2);

    const repeatedBootstrap = await page.evaluate(() => (
      window.__dustMultiplayerTest.buildWireSnapshot(true, true, "mock-player-2")
    ));
    const guestAfterRepeat = await guest.evaluate((snapshot) => {
      window.__dustMultiplayerTest.applySnapshot(snapshot);
      return window.__dustAndDeadTest.getOilBaronDiagnostics();
    }, repeatedBootstrap);
    expect(guestAfterRepeat.oilDoubles.count).toBe(2);
    expect(guestAfterRepeat.oilDoubles.units.map((unit) => unit.id).sort()).toEqual(
      guestBootstrap.oilDoubles.units.map((unit) => unit.id).sort(),
    );

    const chained = await page.evaluate(() => {
      const game = window.__dustAndDeadTest;
      const multi = window.__dustMultiplayerTest;
      const boss = game.getOilBaronDiagnostics().boss;
      const centerDistance = Math.max(0.001, Math.hypot(boss.x, boss.z));
      const towardCenterX = -boss.x / centerDistance;
      const towardCenterZ = -boss.z / centerDistance;
      multi.setPlayerPosition("mock-player-1", boss.x + towardCenterX * 26, boss.z + towardCenterZ * 26);
      multi.setPlayerPosition("mock-player-2", boss.x + towardCenterX * 14, boss.z + towardCenterZ * 14);
      const started = game.forceOilBaronAction("debt");
      game.advanceOilBaron(1120);
      return {
        started: started !== false,
        diagnostics: game.getOilBaronDiagnostics(),
        snapshot: multi.buildWireSnapshot(true, true, "mock-player-2"),
      };
    });
    expect(chained.started).toBe(true);
    expect(chained.diagnostics.debtChains).toMatchObject({ count: 1, chains: [{ targetPlayerId: "mock-player-2" }] });

    const guestChained = await guest.evaluate((snapshot) => {
      const multi = window.__dustMultiplayerTest;
      multi.applySnapshot(snapshot);
      return {
        diagnostics: window.__dustAndDeadTest.advanceOilBaron(34),
        effects: multi.getNetworkCombatDiagnostics(),
      };
    }, chained.snapshot);
    expect(guestChained.diagnostics.oilDoubles.count).toBe(2);
    expect(guestChained.diagnostics.debtChains).toMatchObject({
      count: 1,
      visualLinkRadius: 0.34,
      hitRadius: 0.72,
      chains: [{
        targetPlayerId: "mock-player-2",
        hitRadius: 0.72,
        healthBar: true,
        replicaCastInferred: true,
        latched: false,
        anchorMode: "cane",
      }],
    });
    expect(guestChained.diagnostics.player).toMatchObject({ debtChained: true, oilSpeedMultiplier: 0 });

    const guestTransfer = await guest.evaluate(() => window.__dustAndDeadTest.advanceOilBaron(250));
    expect(guestTransfer.debtChains.chains[0]).toMatchObject({
      replicaCastInferred: true,
      latched: true,
      anchorMode: "transfer",
    });

    const repeatedChain = await page.evaluate(() => (
      window.__dustMultiplayerTest.buildWireSnapshot(true, true, "mock-player-2")
    ));
    const guestRepeatedChain = await guest.evaluate((snapshot) => {
      const multi = window.__dustMultiplayerTest;
      multi.applySnapshot(snapshot);
      return {
        diagnostics: window.__dustAndDeadTest.getOilBaronDiagnostics(),
        effects: multi.getNetworkCombatDiagnostics(),
      };
    }, repeatedChain);
    expect(guestRepeatedChain.diagnostics.oilDoubles.count).toBe(2);
    expect(guestRepeatedChain.diagnostics.debtChains.count).toBe(1);
    expect(guestRepeatedChain.diagnostics.debtChains.chains[0]).toMatchObject({
      replicaCastInferred: true,
      latched: true,
      anchorMode: "transfer",
    });
    expect(guestRepeatedChain.diagnostics.debtChains.chains[0].castAge).toBeGreaterThanOrEqual(
      guestTransfer.debtChains.chains[0].castAge,
    );
    expect(guestRepeatedChain.effects).toEqual(guestChained.effects);

    const guestBelt = await guest.evaluate(() => window.__dustAndDeadTest.advanceOilBaron(220));
    expect(guestBelt.debtChains.chains[0]).toMatchObject({
      replicaCastInferred: true,
      latched: true,
      anchorMode: "belt",
    });

    const partialRemoval = await page.evaluate(() => {
      const game = window.__dustAndDeadTest;
      const multi = window.__dustMultiplayerTest;
      const diagnostics = game.getOilBaronDiagnostics();
      game.damageOilBaronDebtChain(diagnostics.debtChains.chains[0].id, 999);
      game.damageOilBaronDouble(
        diagnostics.oilDoubles.units[0].id,
        diagnostics.oilDoubles.units[0].maxHp
      );
      game.advanceOilBaron(700);
      return {
        diagnostics: game.getOilBaronDiagnostics(),
        snapshot: multi.buildWireSnapshot(true, true, "mock-player-2"),
      };
    });
    expect(partialRemoval.diagnostics).toMatchObject({
      debtChains: { count: 0, accessoryBatch: { drawCalls: 0, activeInstances: 0 } },
      oilDoubles: { count: 1 },
    });

    const guestPartialRemoval = await guest.evaluate((snapshot) => {
      window.__dustMultiplayerTest.applySnapshot(snapshot);
      return window.__dustAndDeadTest.getOilBaronDiagnostics();
    }, partialRemoval.snapshot);
    expect(guestPartialRemoval.debtChains.count).toBe(0);
    expect(guestPartialRemoval.debtChains.accessoryBatch).toMatchObject({ drawCalls: 0, activeInstances: 0 });
    expect(guestPartialRemoval.player).toMatchObject({ debtChained: false, oilSpeedMultiplier: 1 });
    expect(guestPartialRemoval.oilDoubles.count).toBe(1);

    const monocleMark = await page.evaluate(() => {
      const game = window.__dustAndDeadTest;
      const multi = window.__dustMultiplayerTest;
      const started = game.forceOilBaronAction("monocle");
      return {
        started: started !== false,
        diagnostics: game.getOilBaronDiagnostics(),
        snapshot: multi.buildWireSnapshot(true, true, "mock-player-2"),
      };
    });
    expect(monocleMark.started).toBe(true);
    expect(monocleMark.diagnostics.monocleSentence).toMatchObject({ active: true, markVisible: true, targetPlayerId: "mock-player-1" });

    const guestMarked = await guest.evaluate((snapshot) => {
      window.__dustMultiplayerTest.applySnapshot(snapshot);
      return window.__dustAndDeadTest.getOilBaronDiagnostics();
    }, monocleMark.snapshot);
    expect(guestMarked.monocleSentence).toMatchObject({ active: true, markVisible: true, targetPlayerId: "mock-player-1" });
    expect(guestMarked.oilDoubles.count).toBe(1);

    const projectile = await page.evaluate(() => {
      const game = window.__dustAndDeadTest;
      const multi = window.__dustMultiplayerTest;
      game.advanceOilBaron(1580);
      return {
        diagnostics: game.getOilBaronDiagnostics(),
        snapshot: multi.buildWireSnapshot(true, true, "mock-player-2"),
      };
    });
    expect(projectile.diagnostics.monocleSentence.projectileCount).toBe(1);

    const guestProjectile = await guest.evaluate((snapshot) => {
      window.__dustMultiplayerTest.applySnapshot(snapshot);
      return window.__dustAndDeadTest.getOilBaronDiagnostics();
    }, projectile.snapshot);
    expect(guestProjectile.monocleSentence.projectileCount).toBe(1);
    const projectileId = guestProjectile.monocleSentence.projectiles[0].id;

    const repeatedProjectile = await page.evaluate(() => (
      window.__dustMultiplayerTest.buildWireSnapshot(true, true, "mock-player-2")
    ));
    const guestRepeatedProjectile = await guest.evaluate((snapshot) => {
      window.__dustMultiplayerTest.applySnapshot(snapshot);
      return window.__dustAndDeadTest.getOilBaronDiagnostics();
    }, repeatedProjectile);
    expect(guestRepeatedProjectile.monocleSentence.projectileCount).toBe(1);
    expect(guestRepeatedProjectile.monocleSentence.projectiles[0].id).toBe(projectileId);

    const finalRemoval = await page.evaluate(() => {
      const game = window.__dustAndDeadTest;
      const multi = window.__dustMultiplayerTest;
      game.advanceOilBaron(2500);
      const remaining = game.getOilBaronDiagnostics().oilDoubles.units[0];
      if (remaining) game.damageOilBaronDouble(remaining.id, remaining.maxHp);
      return {
        diagnostics: game.getOilBaronDiagnostics(),
        snapshot: multi.buildWireSnapshot(true, true, "mock-player-2"),
      };
    });
    expect(finalRemoval.diagnostics).toMatchObject({ oilDoubles: { count: 0 }, monocleSentence: { projectileCount: 0 } });

    const guestFinal = await guest.evaluate((snapshot) => {
      window.__dustMultiplayerTest.applySnapshot(snapshot);
      return window.__dustAndDeadTest.getOilBaronDiagnostics();
    }, finalRemoval.snapshot);
    expect(guestFinal.oilDoubles.count).toBe(0);
    expect(guestFinal.debtChains.count).toBe(0);
    expect(guestFinal.monocleSentence.projectileCount).toBe(0);
  } finally {
    await guest.close();
  }
});

test("Oil Baron replicas turn 15 Hz boss, double, and Monocle samples into smooth bounded motion", async ({ page, context }) => {
  const guest = await context.newPage();
  try {
    await startHunt(page);
    await startHunt(guest);

    const frames = await page.evaluate(() => {
      const game = window.__dustAndDeadTest;
      const multi = window.__dustMultiplayerTest;
      const clone = (value) => JSON.parse(JSON.stringify(value));
      multi.startMockHost(["Host", "Guest"]);
      game.startWaveNow(10, "oilBaron");
      game.clearEnemies();
      game.setOilBaronAiEnabled(false);
      game.damageOilBaron(game.getOilBaronDiagnostics().boss.maxHp * 0.4, true);
      game.advanceOilBaron(34);
      game.forceOilBaronAction("doubles");
      game.advanceOilBaron(2500);
      const base = clone(multi.buildSnapshot(true, true, "mock-player-2"));
      const boss = base.bellRinger;
      const baseBoss = { x: boss.x, z: boss.z };
      const baseDoubles = boss.oilDoubles.map((unit) => ({ x: unit.x, z: unit.z }));
      const projectileOrigin = { x: boss.x - 3.5, z: boss.z + 2.25 };
      const projectileDirection = { x: 0.8, z: 0.6 };
      const sampleInterval = 1 / 15;
      return Array.from({ length: 14 }, (_, index) => {
        const snapshot = clone(base);
        const elapsed = index * sampleInterval;
        snapshot.sequence = base.sequence + index;
        snapshot.time = Number(base.time || 0) + elapsed;
        snapshot.bellRinger.x = baseBoss.x + elapsed * 3.6;
        snapshot.bellRinger.z = baseBoss.z + elapsed * 1.8;
        snapshot.bellRinger.oilDoubles.forEach((unit, unitIndex) => {
          const direction = unitIndex === 0 ? 1 : -1;
          unit.x = baseDoubles[unitIndex].x + elapsed * 3.9;
          unit.z = baseDoubles[unitIndex].z + elapsed * 1.35 * direction;
        });
        snapshot.bellRinger.monocleProjectiles = [{
          id: "oil-baron-smoothing-round",
          x: projectileOrigin.x + projectileDirection.x * 44 * elapsed,
          y: 2.4,
          z: projectileOrigin.z + projectileDirection.z * 44 * elapsed,
          dx: projectileDirection.x,
          dz: projectileDirection.z,
          remaining: 120 - 44 * elapsed,
        }];
        return snapshot;
      });
    });

    const result = await guest.evaluate((snapshots) => {
      const game = window.__dustAndDeadTest;
      const multi = window.__dustMultiplayerTest;
      multi.startMockGuest(["Host", "Guest"], 1);
      const tracks = { boss: [], oilDouble: [], projectile: [] };
      for (let sample = 0; sample < snapshots.length; sample += 1) {
        multi.applySnapshot(snapshots[sample]);
        for (let subframe = 0; subframe < 4; subframe += 1) {
          window.advanceTime(1000 / 60);
          const diagnostics = game.getOilBaronDiagnostics();
          const oilDouble = diagnostics.oilDoubles.units[0];
          const projectile = diagnostics.monocleSentence.projectiles[0];
          tracks.boss.push({ sample, subframe, x: diagnostics.boss.x, z: diagnostics.boss.z });
          tracks.oilDouble.push({ sample, subframe, x: oilDouble.x, z: oilDouble.z });
          tracks.projectile.push({ sample, subframe, x: projectile.x, z: projectile.z });
        }
      }
      const beforeGap = game.getOilBaronDiagnostics();
      window.advanceTime(250);
      const duringGap = game.getOilBaronDiagnostics();
      window.advanceTime(500);
      const afterCap = game.getOilBaronDiagnostics();

      function summarize(track) {
        const steps = [];
        for (let index = 1; index < track.length; index += 1) {
          steps.push({
            distance: Math.hypot(track[index].x - track[index - 1].x, track[index].z - track[index - 1].z),
            boundary: track[index].subframe === 0,
          });
        }
        const steady = steps.slice(11);
        const distances = steady.map((step) => step.distance);
        const mean = distances.reduce((sum, distance) => sum + distance, 0) / distances.length;
        const deviation = Math.sqrt(
          distances.reduce((sum, distance) => sum + (distance - mean) ** 2, 0) / distances.length
        );
        const boundary = steady.filter((step) => step.boundary);
        const inside = steady.filter((step) => !step.boundary);
        const boundaryMean = boundary.reduce((sum, step) => sum + step.distance, 0) / boundary.length;
        const insideMean = inside.reduce((sum, step) => sum + step.distance, 0) / inside.length;
        return {
          coefficientOfVariation: deviation / mean,
          packetBoundaryRatio: boundaryMean / insideMean,
          minimumStep: Math.min(...distances),
          maximumStep: Math.max(...distances),
        };
      }

      function projectileProjection(diagnostics) {
        const projectile = diagnostics.monocleSentence.projectiles[0];
        const velocityLength = Math.max(0.001, Math.hypot(projectile.velocityX, projectile.velocityZ));
        return {
          displayed: (
            (projectile.x - projectile.targetX) * projectile.velocityX +
            (projectile.z - projectile.targetZ) * projectile.velocityZ
          ) / velocityLength,
          velocity: velocityLength,
        };
      }

      return {
        boss: summarize(tracks.boss),
        oilDouble: summarize(tracks.oilDouble),
        projectile: summarize(tracks.projectile),
        beforeGap: projectileProjection(beforeGap),
        duringGap: projectileProjection(duringGap),
        afterCap: projectileProjection(afterCap),
      };
    }, frames);

    for (const actor of [result.boss, result.oilDouble, result.projectile]) {
      expect(actor.coefficientOfVariation).toBeLessThan(0.35);
      expect(actor.packetBoundaryRatio).toBeGreaterThan(0.65);
      expect(actor.packetBoundaryRatio).toBeLessThan(1.4);
      expect(actor.minimumStep).toBeGreaterThan(0.005);
    }
    expect(result.duringGap.displayed).toBeGreaterThan(result.beforeGap.displayed + 0.5);
    expect(result.afterCap.displayed).toBeLessThanOrEqual(result.afterCap.velocity * 0.18 + 0.15);
  } finally {
    await guest.close();
  }
});
