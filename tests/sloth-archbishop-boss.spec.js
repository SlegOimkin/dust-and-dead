const path = require("node:path");
const { expect, test } = require("@playwright/test");

function fileUrl(relativePath) {
  const absolute = path.resolve(__dirname, "..", relativePath).replace(/\\/g, "/");
  return `file:///${absolute}`;
}

function slothHandReach(hand) {
  return Math.hypot(
    hand.palmX - hand.rootX,
    hand.palmY - hand.rootY,
    hand.palmZ - hand.rootZ
  );
}

function slothElbowAngle(hand) {
  const upper = {
    x: hand.rootX - hand.elbowX,
    y: hand.rootY - hand.elbowY,
    z: hand.rootZ - hand.elbowZ,
  };
  const lower = {
    x: hand.wristX - hand.elbowX,
    y: hand.wristY - hand.elbowY,
    z: hand.wristZ - hand.elbowZ,
  };
  const upperLength = Math.hypot(upper.x, upper.y, upper.z);
  const lowerLength = Math.hypot(lower.x, lower.y, lower.z);
  const cosine = (
    upper.x * lower.x + upper.y * lower.y + upper.z * lower.z
  ) / Math.max(0.0001, upperLength * lowerLength);
  return Math.acos(Math.max(-1, Math.min(1, cosine)));
}

function slothHandLocal(diag, hand) {
  const dx = hand.palmX - diag.x;
  const dz = hand.palmZ - diag.z;
  const cosine = Math.cos(diag.facingAngle);
  const sine = Math.sin(diag.facingAngle);
  return {
    x: dx * cosine - dz * sine,
    z: dx * sine + dz * cosine,
  };
}

function slothHandRootLocal(diag, hand) {
  const dx = hand.rootX - diag.x;
  const dz = hand.rootZ - diag.z;
  const cosine = Math.cos(diag.facingAngle);
  const sine = Math.sin(diag.facingAngle);
  return {
    x: dx * cosine - dz * sine,
    z: dx * sine + dz * cosine,
  };
}

function slothHandElbowLocal(diag, hand) {
  const dx = hand.elbowX - diag.x;
  const dz = hand.elbowZ - diag.z;
  const cosine = Math.cos(diag.facingAngle);
  const sine = Math.sin(diag.facingAngle);
  return {
    x: dx * cosine - dz * sine,
    y: hand.elbowY,
    z: dx * sine + dz * cosine,
  };
}

function slothGrabElbowSideReach(diag) {
  const hands = diag.hands.filter((hand) => hand.kind === "grab");
  if (!hands.length) return 0;
  const targetX = hands.reduce((sum, hand) => sum + hand.palmX, 0) / hands.length;
  const targetZ = hands.reduce((sum, hand) => sum + hand.palmZ, 0) / hands.length;
  const dx = targetX - diag.x;
  const dz = targetZ - diag.z;
  const length = Math.max(0.0001, Math.hypot(dx, dz));
  const rightX = dz / length;
  const rightZ = -dx / length;
  return Math.max(...hands.map((hand) => Math.abs(
    (hand.elbowX - diag.x) * rightX + (hand.elbowZ - diag.z) * rightZ
  )));
}

async function startHunt(page, options) {
  await page.goto(`${fileUrl("index.html")}?mapSeed=7331`);
  const intro = page.locator("#intro-screen");
  if (await intro.isVisible().catch(() => false)) {
    await page.keyboard.press("KeyM");
    await expect(intro).toBeHidden();
  }
  if (options && typeof options.audio === "boolean") {
    await page.waitForFunction(() => typeof window.__dustAndDeadTest?.getAudioDiagnostics === "function");
    const audioEnabled = await page.evaluate(() => window.__dustAndDeadTest.getAudioDiagnostics().enabled);
    if (audioEnabled !== options.audio) await page.locator("#menu-music-btn").click();
  }
  await page.getByRole("button", { name: "Start Hunt" }).click();
  await page.waitForFunction(() => Boolean(
    window.__dustAndDeadTest?.startWaveNow &&
    window.__dustAndDeadTest?.getSlothArchbishopDiagnostics &&
    window.__dustAndDeadTest?.setSlothArchbishopAiEnabled &&
    window.__dustAndDeadTest?.damageSlothArchbishop &&
    window.__dustAndDeadTest?.forceSlothArchbishopAction &&
    window.__dustAndDeadTest?.advanceSlothArchbishop &&
    window.__dustAndDeadTest?.getSlothArchbishopPackedWireDiagnostics &&
    window.__dustAndDeadTest?.forceActiveBossDefeat
  ));
}

async function startSlothArchbishop(page) {
  return page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    game.startWaveNow(10, "slothArchbishop");
    game.clearEnemies();
    game.setSlothArchbishopAiEnabled(false);
    return game.getSlothArchbishopDiagnostics();
  });
}

test("the playable Archbishop Coach Gun stand starts with the finite Breach Marshal build maxed", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto(`${fileUrl("index.html")}?mapSeed=7331&preview=sloth-archbishop-coach-gun-test`);
  await page.waitForFunction(() => Boolean(window.__dustAndDeadTest?.getSlothArchbishopDiagnostics));

  const result = await page.evaluate(() => ({
    game: JSON.parse(window.render_game_to_text()),
    boss: window.__dustAndDeadTest.getSlothArchbishopDiagnostics(),
  }));

  expect(pageErrors).toEqual([]);
  expect(result.game).toMatchObject({
    mode: "playing",
    paused: false,
    wave: 10,
    wave10BossKind: "slothArchbishop",
    weapon: "coachGun",
    spawnLeft: 0,
    player: { visible: true },
    progression: {
      level: 30,
      playerClass: "marshal",
      marshalUpgrade: "breachMarshal",
      marshalSpecial: {
        branch: "breachMarshal",
        pelletCount: 14,
        range: 18.6,
        masteryStacks: 0,
        masteryDamageMultiplier: 1,
      },
    },
    ammo: { current: 2, magazine: 2, reserve: 9999 },
  });
  expect(result.game.progression.upgrades).toMatchObject({
    doorKicker: 1,
    doubleTap: 1,
    lastWord: 1,
    shellCatcher: 1,
    buckAndBall: 1,
    rideTheRecoil: 1,
    bonebreaker: 1,
    noTimeToBleed: 1,
    packedBuckshot: 4,
    hardCast: 5,
    steadyHand: 10,
    quickReload: 8,
    hairTrigger: 8,
    longReach: 5,
  });
  expect(result.boss).toMatchObject({
    active: true,
    defeated: false,
    aiEnabled: true,
    phase: 0,
    action: "sleep",
    sleeping: true,
  });
  await expect(page.locator("#boss-hud")).toHaveClass(/is-sloth-archbishop/);
});

test("the Litany of Still Hands keeps one memorable motif while sleep, waking, and spider layers evolve", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await startHunt(page, { audio: true });
  await page.waitForFunction(() => window.__dustAndDeadTest.getAudioDiagnostics().contextState === "running");
  await startSlothArchbishop(page);
  await page.waitForFunction(() => {
    const music = window.__dustAndDeadTest.getAudioDiagnostics().bossMusic;
    return music.id === "sloth-archbishop" && music.active && music.boundToActiveBoss && music.scheduledStepCount > 3;
  });
  await page.waitForTimeout(1450);
  const sleeping = await page.evaluate(() => window.__dustAndDeadTest.getAudioDiagnostics());
  const openingBoss = await page.evaluate(() => window.__dustAndDeadTest.getSlothArchbishopDiagnostics());

  await page.evaluate(() => window.__dustAndDeadTest.forceSlothArchbishopAction("wake"));
  await page.waitForFunction(() => {
    const boss = window.__dustAndDeadTest.getSlothArchbishopDiagnostics();
    const music = window.__dustAndDeadTest.getAudioDiagnostics().bossMusic;
    return boss.phase === 0 && boss.action === "wake" &&
      music.arrangementPhase === 1 && music.tempo === 96 &&
      music.action === "wake" && music.motif === "waking-litany" && music.leadHitCount >= 6;
  });
  const waking = await page.evaluate(() => ({
    boss: window.__dustAndDeadTest.getSlothArchbishopDiagnostics(),
    audio: window.__dustAndDeadTest.getAudioDiagnostics(),
  }));

  await page.evaluate(() => window.__dustAndDeadTest.advanceSlothArchbishop(5000));
  await page.waitForFunction(() => {
    const music = window.__dustAndDeadTest.getAudioDiagnostics().bossMusic;
    return music.arrangementPhase === 1 && music.tempo === 96 && music.motif === "still-hands-litany";
  });
  await page.waitForTimeout(1350);
  const combat = await page.evaluate(() => window.__dustAndDeadTest.getAudioDiagnostics());

  await page.evaluate(() => window.__dustAndDeadTest.forceSlothArchbishopAction("spider"));
  await page.waitForFunction(() => {
    const game = window.__dustAndDeadTest;
    const boss = game.getSlothArchbishopDiagnostics();
    const music = game.getAudioDiagnostics().bossMusic;
    return boss.phase === 1 && boss.action === "spiderRise" &&
      music.arrangementPhase === 2 && music.tempo === 144;
  });
  const spiderRise = await page.evaluate(() => ({
    boss: window.__dustAndDeadTest.getSlothArchbishopDiagnostics(),
    audio: window.__dustAndDeadTest.getAudioDiagnostics(),
  }));
  await page.evaluate(() => window.__dustAndDeadTest.advanceSlothArchbishop(5000));
  await page.waitForFunction(() => {
    const music = window.__dustAndDeadTest.getAudioDiagnostics().bossMusic;
    return music.arrangementPhase === 2 && music.tempo === 144 && music.motif === "twelve-hand-litany";
  });
  await page.waitForTimeout(1700);
  const spider = await page.evaluate(() => window.__dustAndDeadTest.getAudioDiagnostics());

  const skippedBefore = spider.bossMusic.skippedStepCount;
  await page.evaluate(() => {
    const stalledUntil = performance.now() + 1300;
    while (performance.now() < stalledUntil) {}
  });
  await page.waitForFunction((before) => (
    window.__dustAndDeadTest.getAudioDiagnostics().bossMusic.skippedStepCount > before
  ), skippedBefore, { timeout: 5000 });
  const recovered = await page.evaluate(() => window.__dustAndDeadTest.getAudioDiagnostics());

  await page.evaluate(() => window.__dustAndDeadTest.forceActiveBossDefeat());
  await page.waitForFunction(() => {
    const music = window.__dustAndDeadTest.getAudioDiagnostics().bossMusic;
    return music.lifecycle === "aftermath" && music.fading && music.deathStingCount === 1;
  });
  const death = await page.evaluate(() => window.__dustAndDeadTest.getAudioDiagnostics());
  await page.waitForTimeout(300);
  const deathTail = await page.evaluate(() => window.__dustAndDeadTest.getAudioDiagnostics());

  expect(pageErrors).toEqual([]);
  expect(sleeping.bossMusic).toMatchObject({
    id: "sloth-archbishop",
    title: "Litany of Still Hands",
    tempo: 72,
    arrangementPhase: 0,
    arrangement: "unfinished-sleep-vespers",
    motif: "unfinished-sleep-litany",
    compositionVersion: "litany-of-still-hands-v3",
    mixProfile: "somnolent-litany-v3",
    meter: "6/4",
    stepsPerBar: 12,
    phraseBars: 8,
    persistentNodeCount: 11,
    deathFadeSeconds: 3.8,
  });
  expect(sleeping.bossMusic.padHitCount).toBeGreaterThan(0);
  expect(sleeping.bossMusic.melodyHitCount).toBeGreaterThan(0);
  expect(openingBoss).toMatchObject({ phase: 0, action: "sleep", sleeping: true });
  expect(sleeping.bossMusic.themeGain).toBeGreaterThan(1.1);
  expect(sleeping.bossMusic.effects).toMatchObject({ rhythmSeparated: true });
  expect(sleeping.bossMusic.effects.dry).toBeGreaterThan(0.84);
  expect(sleeping.bossMusic.effects.rhythmGain).toBeGreaterThan(0.65);
  expect(waking.boss).toMatchObject({ phase: 0, action: "wake" });
  expect(waking.audio.bossMusic).toMatchObject({
    action: "wake",
    arrangementPhase: 1,
    tempo: 96,
    arrangement: "the-litany-awakens",
    motif: "waking-litany",
  });
  expect(waking.audio.bossMusic.leadHitCount).toBeGreaterThanOrEqual(6);
  expect(waking.audio.bossMusic.peakStepEventCount).toBeLessThanOrEqual(9);
  expect(combat.bossMusic).toMatchObject({
    tempo: 96,
    arrangementPhase: 1,
    arrangement: "procession-of-still-hands",
    motif: "still-hands-litany",
    meter: "6/4",
  });
  expect(spiderRise.boss).toMatchObject({ phase: 1, action: "spiderRise" });
  expect(spiderRise.audio.bossMusic).toMatchObject({ arrangementPhase: 2, tempo: 144, meter: "12/8" });
  expect(spider.bossMusic).toMatchObject({
    tempo: 144,
    arrangementPhase: 2,
    arrangement: "twelve-hand-harvestman-litany",
    motif: "twelve-hand-litany",
    meter: "12/8",
  });
  expect(spider.bossMusic.chainHitCount).toBeGreaterThan(combat.bossMusic.chainHitCount);
  expect(spider.bossMusic.leadHitCount).toBeGreaterThan(combat.bossMusic.leadHitCount);
  expect(spider.bossMusic.peakStepEventCount).toBeLessThanOrEqual(9);
  expect(spider.bossMusic.effects.dry).toBeGreaterThan(0.98);
  expect(spider.bossMusic.effects.lowpass).toBeGreaterThan(4000);
  expect(spider.bossMusic.effects.rhythmGain).toBeGreaterThan(1.05);
  expect(recovered.bossMusic.skippedStepCount).toBeGreaterThan(skippedBefore);
  expect(recovered.transientAudioNodeCount).toBeLessThanOrEqual(360);
  expect(recovered.pendingAudioDisconnectGroups).toBeLessThanOrEqual(80);
  expect(death.bossMusic).toMatchObject({ active: false, fading: true, deathStingCount: 1, deathFadeSeconds: 3.8 });
  expect(deathTail.bossMusic.deathStingCount).toBe(1);
});

test("Coach Gun damage never displaces a boss while ordinary zombies still recoil", async ({ page }) => {
  await page.goto(`${fileUrl("index.html")}?mapSeed=7331&preview=sloth-archbishop-coach-gun-test`);
  await page.waitForFunction(() => Boolean(
    window.__dustAndDeadTest?.shootOnce &&
    window.__dustAndDeadTest?.probeCoachGunKnockback
  ));

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    game.setSlothArchbishopAiEnabled(false);
    const beforeShot = game.getSlothArchbishopDiagnostics();
    game.setAimTarget(beforeShot.x, beforeShot.z);
    const fired = game.shootOnce();
    const afterShot = game.getSlothArchbishopDiagnostics();

    const bosses = ["bellRinger", "ghostTrain", "oilBaron", "slothArchbishop"].map((kind) => {
      game.startWaveNow(10, kind);
      game.clearEnemies();
      return { kind, probe: game.probeCoachGunKnockback("boss", "", 8) };
    });

    game.startWaveNow(11);
    game.clearEnemies();
    const state = JSON.parse(window.render_game_to_text());
    const zombie = game.spawnZombieAt("brute", state.player.x, state.player.z + 4.5);
    const zombieProbe = game.probeCoachGunKnockback("enemy", zombie.groupId, 0.6);
    return { fired, beforeShot, afterShot, bosses, zombieProbe };
  });

  expect(result.fired).toBe(true);
  expect(result.afterShot.hp).toBeLessThan(result.beforeShot.hp);
  expect(result.afterShot.x).toBe(result.beforeShot.x);
  expect(result.afterShot.z).toBe(result.beforeShot.z);
  expect(result.bosses.map(({ kind }) => kind)).toEqual([
    "bellRinger", "ghostTrain", "oilBaron", "slothArchbishop",
  ]);
  for (const { probe } of result.bosses) {
    expect(probe).toMatchObject({ immune: true, moved: 0 });
    expect(probe.afterX).toBe(probe.beforeX);
    expect(probe.afterZ).toBe(probe.beforeZ);
  }
  expect(result.zombieProbe.immune).toBe(false);
  expect(result.zombieProbe.moved).toBeGreaterThan(0.1);
});

test("the Archbishop keeps a human silhouette while the spectral attacks use the expanded combat scale", async ({ page }) => {
  await startHunt(page);
  const initial = await startSlothArchbishop(page);

  const impact = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    game.forceSlothArchbishopAction("sweep");
    return game.advanceSlothArchbishop(683);
  });

  expect(initial.model).toMatchObject({
    actorScale: 0.48,
    collisionRadius: 0.96,
    humanBodyIntact: true,
    headStyle: "human-low-poly-mitre",
    sleepingOnSide: true,
  });
  expect(initial.model.estimatedHeight).toBeGreaterThan(3.8);
  expect(initial.model.estimatedHeight).toBeLessThan(4);
  expect(Math.abs(initial.model.actorRotationX)).toBeLessThan(0.15);
  expect(initial.model.actorRotationZ).toBeGreaterThan(1.45);
  expect(initial.model.actorX).toBeGreaterThan(1.4);
  expect(initial.spiderTuning).toMatchObject({
    supportHandCount: 12,
    supportHandsPerSide: 6,
    supportHandScale: 1.14,
    supportLimbThicknessScale: 0.82,
    liftHeight: 4.55,
  });
  expect(initial.attackTuning).toMatchObject({
    attackRangeUnlimited: true,
    targetsAllLivingPlayers: true,
    simultaneousTargets: true,
    maxHpDamageRatio: 1 / 3,
    damage: {
      sweep: 32,
      skySlam: 40,
      prayerClap: 30,
      fourSides: 36,
      crossSweep: 34,
    },
    sweepTargetRadius: 2.8,
    sweepRadius: 10.4,
    skySlamRadius: 4.25,
    grabRange: 10.8,
    grabHalfWidth: 2.85,
    phaseThreeSweepRadius: 13.6,
    phaseThreeSkySlamRadius: 5.6,
    phaseThreeGrabRange: 14.5,
    phaseThreeGrabHalfWidth: 4.2,
    throwDistance: 36,
    throwDuration: 1.04,
    phaseThreeGrabDuration: 1.72,
    grabGuaranteedAfterLock: true,
    phaseThreeSweepImpactProgress: 0.42,
    phaseThreeSkySlamImpactProgress: 0.48,
    phaseThreeGrabImpactProgress: 0.36,
  });

  const sweep = impact.hands.find((hand) => hand.kind === "sweep");
  const sweepTarget = impact.slamTargets[0];
  expect(sweep).toBeTruthy();
  expect(sweep).toMatchObject({
    connected: true,
    targetId: sweepTarget.id,
    armSegments: 8,
    trajectoryStyle: "smoothElbow",
  });
  const planarReach = Math.hypot(sweep.palmX - sweep.rootX, sweep.palmZ - sweep.rootZ);
  const targetDistance = Math.hypot(sweepTarget.x - impact.x, sweepTarget.z - impact.z);
  expect(impact.actionProgress).toBeCloseTo(0.56, 1);
  expect(Math.hypot(sweep.palmX - sweepTarget.x, sweep.palmZ - sweepTarget.z)).toBeLessThan(1.5);
  expect(planarReach).toBeGreaterThan(targetDistance - 2);
  expect(Math.hypot(sweep.elbowX - sweep.rootX, sweep.elbowZ - sweep.rootZ)).toBeGreaterThan(2);
  expect(Math.hypot(sweep.wristX - sweep.elbowX, sweep.wristZ - sweep.elbowZ)).toBeGreaterThan(2);
  expect(Math.abs(sweep.pitch)).toBeGreaterThan(0.8);
});

test("the standard sweep coils, accelerates through its mark, and follows through with a smooth arm", async ({ page }) => {
  await startHunt(page);

  const samples = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const sampleAt = (milliseconds) => {
      game.startWaveNow(10, "slothArchbishop");
      game.clearEnemies();
      game.setSlothArchbishopAiEnabled(false);
      game.setPlayerMaxHp(500, 500);
      game.forceSlothArchbishopAction("sweep");
      return game.advanceSlothArchbishop(milliseconds);
    };
    return {
      coiled: sampleAt(310),
      crossing: sampleAt(520),
      impact: sampleAt(683),
      follow: sampleAt(805),
      recovery: sampleAt(1180),
    };
  });

  const hand = (sample) => sample.hands.find((candidate) => candidate.kind === "sweep");
  const sweepOffset = (sample) => {
    const target = sample.slamTargets[0];
    const targetAngle = Math.atan2(target.x - sample.x, target.z - sample.z);
    const palm = hand(sample);
    const palmAngle = Math.atan2(palm.palmX - sample.x, palm.palmZ - sample.z);
    return Math.atan2(Math.sin(palmAngle - targetAngle), Math.cos(palmAngle - targetAngle));
  };

  const coiledHand = hand(samples.coiled);
  const crossingHand = hand(samples.crossing);
  const impactHand = hand(samples.impact);
  const followHand = hand(samples.follow);
  expect([coiledHand, crossingHand, impactHand, followHand].every(Boolean)).toBe(true);
  expect(coiledHand).toMatchObject({ armSegments: 8, trajectoryStyle: "smoothElbow" });
  expect(samples.coiled.handPartInstances).toBeGreaterThanOrEqual(14);
  expect(sweepOffset(samples.coiled)).toBeLessThan(-1.1);
  expect(sweepOffset(samples.crossing)).toBeLessThan(-0.15);
  expect(Math.abs(sweepOffset(samples.impact))).toBeLessThan(0.2);
  expect(sweepOffset(samples.follow)).toBeGreaterThan(0.85);
  expect(coiledHand.wristY).toBeGreaterThan(impactHand.wristY + 0.7);
  expect(coiledHand.curl).toBeGreaterThan(impactHand.curl + 0.35);
  expect(Math.abs(coiledHand.pitch - impactHand.pitch)).toBeGreaterThan(0.45);
  expect(samples.coiled.model.torsoRotationY * samples.impact.model.torsoRotationY).toBeLessThan(0);
  expect(Math.abs(samples.impact.model.torsoRotationY)).toBeGreaterThan(0.35);
  expect(Math.abs(samples.impact.model.actorRotationY)).toBeGreaterThan(0.08);
  expect(Math.abs(samples.recovery.model.torsoRotationY)).toBeLessThan(0.18);
});

test("sweep, overhead, and grab cast across the map while preserving their visible dodge zones", async ({ page }) => {
  await startHunt(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const restart = () => {
      game.startWaveNow(10, "slothArchbishop");
      game.clearEnemies();
      game.setSlothArchbishopAiEnabled(false);
      game.setPlayerMaxHp(500, 500);
      return game.getSlothArchbishopDiagnostics();
    };
    const placeAcrossMap = (boss) => game.setPlayerPosition(
      boss.x >= 0 ? -220 : 220,
      boss.z >= 0 ? -180 : 180
    );

    let boss = restart();
    const sweepFarPosition = placeAcrossMap(boss);
    const sweepStart = game.forceSlothArchbishopAction("sweep");
    const sweepApproach = game.advanceSlothArchbishop(620);
    game.advanceSlothArchbishop(100);
    const sweepHit = game.getPlayerHealth();

    boss = restart();
    placeAcrossMap(boss);
    const sweepDodgeStart = game.forceSlothArchbishopAction("sweep");
    const sweepDodgeTarget = sweepDodgeStart.slamTargets[0];
    const sweepDodgePosition = game.setPlayerPosition(sweepDodgeTarget.x + 5.5, sweepDodgeTarget.z);
    game.advanceSlothArchbishop(700);
    const sweepDodged = game.getPlayerHealth();

    boss = restart();
    placeAcrossMap(boss);
    const skyNearStart = game.forceSlothArchbishopAction("overhead");
    const skyNearTarget = skyNearStart.slamTargets[0];
    const skyNearPosition = game.setPlayerPosition(skyNearTarget.x + 3.9, skyNearTarget.z);
    game.advanceSlothArchbishop(1400);
    const skyNear = game.getPlayerHealth();

    boss = restart();
    placeAcrossMap(boss);
    const skyFarStart = game.forceSlothArchbishopAction("overhead");
    const skyFarTarget = skyFarStart.slamTargets[0];
    const skyFarPosition = game.setPlayerPosition(skyFarTarget.x + 5.6, skyFarTarget.z);
    game.advanceSlothArchbishop(1400);
    const skyFar = game.getPlayerHealth();

    boss = restart();
    game.forceSlothArchbishopAction("spider");
    boss = game.advanceSlothArchbishop(1900);
    const grabFarPosition = placeAcrossMap(boss);
    const grabStart = game.forceSlothArchbishopAction("grab");
    game.advanceSlothArchbishop(250);
    const grabEvadedPosition = game.setPlayerPosition(
      grabFarPosition.x >= 0 ? -220 : 220,
      grabFarPosition.z >= 0 ? -180 : 180
    );
    const grabFar = game.advanceSlothArchbishop(420);

    return {
      boss,
      sweepStart,
      sweepApproach,
      sweepHit,
      sweepDodgeStart,
      sweepDodgeTarget,
      sweepDodgePosition,
      sweepDodged,
      skyNear,
      skyFar,
      grabStart,
      grabFar,
      placements: {
        sweepFarPosition,
        skyNearPosition,
        skyFarPosition,
        grabFarPosition,
        grabEvadedPosition,
      },
    };
  });

  expect(result.sweepStart).toMatchObject({
    action: "sweep",
    telegraphCount: 1,
    attackTuning: { attackRangeUnlimited: true, sweepTargetRadius: 2.8 },
  });
  expect(Math.hypot(
    result.placements.sweepFarPosition.x - result.sweepStart.x,
    result.placements.sweepFarPosition.z - result.sweepStart.z
  )).toBeGreaterThan(150);
  const sweepHand = result.sweepApproach.hands.find((hand) => hand.kind === "sweep");
  expect(sweepHand).toMatchObject({ connected: true, targetId: result.sweepStart.slamTargets[0].id });
  expect(slothHandReach(sweepHand)).toBeGreaterThan(150);
  expect(result.sweepHit.hp).toBeLessThan(500);
  expect(Math.hypot(
    result.sweepDodgePosition.x - result.sweepDodgeTarget.x,
    result.sweepDodgePosition.z - result.sweepDodgeTarget.z
  )).toBeGreaterThan(4.5);
  expect(result.sweepDodged.hp).toBe(500);
  expect(result.skyNear.hp).toBeLessThan(500);
  expect(result.skyFar.hp).toBe(500);
  expect(Math.hypot(
    result.placements.grabFarPosition.x - result.grabStart.x,
    result.placements.grabFarPosition.z - result.grabStart.z
  )).toBeGreaterThan(150);
  expect(result.grabFar.throwing).toBe(true);
  expect(result.grabFar.throwTargetIds).toEqual([result.grabStart.slamTargets[0].id]);
});

test("the final phase shortens every offensive windup while preserving the full recovery", async ({ page }) => {
  await startHunt(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const restart = () => {
      game.startWaveNow(10, "slothArchbishop");
      game.clearEnemies();
      game.setSlothArchbishopAiEnabled(false);
      game.setPlayerMaxHp(500, 500);
      return game.getSlothArchbishopDiagnostics();
    };
    const placeInFront = (boss, distance) => game.setPlayerPosition(
      boss.x + Math.sin(boss.facingAngle) * distance,
      boss.z + Math.cos(boss.facingAngle) * distance
    );
    const enterFinalPhase = () => {
      game.forceSlothArchbishopAction("spider");
      return game.advanceSlothArchbishop(1900);
    };

    let boss = restart();
    placeInFront(boss, 4);
    const normalSweepStart = game.forceSlothArchbishopAction("sweep");
    game.advanceSlothArchbishop(550);
    const normalSweepHealth = game.getPlayerHealth();

    boss = restart();
    boss = enterFinalPhase();
    placeInFront(boss, 4);
    const finalSweepStart = game.forceSlothArchbishopAction("sweep");
    game.advanceSlothArchbishop(550);
    const finalSweepHealth = game.getPlayerHealth();

    boss = restart();
    placeInFront(boss, 5);
    const normalSkyStart = game.forceSlothArchbishopAction("overhead");
    const normalSkyAfter = game.advanceSlothArchbishop(1100);

    boss = restart();
    boss = enterFinalPhase();
    placeInFront(boss, 5);
    const finalSkyStart = game.forceSlothArchbishopAction("overhead");
    const finalSkyAfter = game.advanceSlothArchbishop(1100);

    boss = restart();
    boss = enterFinalPhase();
    placeInFront(boss, 4);
    const finalGrabStart = game.forceSlothArchbishopAction("grab");
    const grabBeforeImpact = game.advanceSlothArchbishop(580);
    const grabAfterImpact = game.advanceSlothArchbishop(80);

    return {
      normalSweepStart,
      normalSweepHealth,
      finalSweepStart,
      finalSweepHealth,
      normalSkyStart,
      normalSkyAfter,
      finalSkyStart,
      finalSkyAfter,
      finalGrabStart,
      grabBeforeImpact,
      grabAfterImpact,
    };
  });

  expect(result.normalSweepStart).toMatchObject({ phase: 1, actionDuration: 1.22, impactProgress: 0.56 });
  expect(result.normalSweepStart.reactionTime).toBeCloseTo(0.6832, 3);
  expect(result.normalSweepHealth.hp).toBe(500);
  expect(result.finalSweepStart).toMatchObject({
    phase: 2,
    actionDuration: 1.22,
    impactProgress: 0.42,
    supportHandCount: 12,
    orbitShieldHandCount: 2,
    transientHandCount: 1,
    activeHandCount: 15,
  });
  expect(result.finalSweepStart.reactionTime).toBeCloseTo(0.5124, 3);
  expect(result.finalSweepHealth.hp).toBeLessThan(500);

  expect(result.normalSkyStart).toMatchObject({ phase: 1, actionDuration: 2.18, impactProgress: 0.63 });
  expect(result.normalSkyStart.reactionTime).toBeCloseTo(1.3734, 3);
  expect(result.normalSkyAfter.slamTargets[0].resolved).toBe(false);
  expect(result.finalSkyStart).toMatchObject({
    phase: 2,
    actionDuration: 2.18,
    impactProgress: 0.48,
    supportHandCount: 12,
    orbitShieldHandCount: 2,
    transientHandCount: 1,
    activeHandCount: 15,
  });
  expect(result.finalSkyStart.reactionTime).toBeCloseTo(1.0464, 3);
  expect(result.finalSkyAfter.slamTargets[0].resolved).toBe(true);

  expect(result.finalGrabStart).toMatchObject({
    phase: 2,
    actionDuration: 1.72,
    impactProgress: 0.36,
    supportHandCount: 12,
    orbitShieldHandCount: 2,
    transientHandCount: 2,
    activeHandCount: 16,
  });
  expect(result.finalGrabStart.reactionTime).toBeCloseTo(0.6192, 3);
  expect(result.grabBeforeImpact.throwing).toBe(false);
  expect(result.grabAfterImpact.throwing).toBe(true);
});

test("the sleeping Archbishop accepts free damage only down to the 82 percent wake threshold", async ({ page }) => {
  await startHunt(page);
  const initial = await startSlothArchbishop(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const maximum = game.getSlothArchbishopDiagnostics().maxHp;
    const firstHit = game.damageSlothArchbishop(maximum * 0.17);
    const stillSleeping = game.getSlothArchbishopDiagnostics();
    const thresholdHit = game.damageSlothArchbishop(maximum);
    const waking = game.getSlothArchbishopDiagnostics();
    const protectedHit = game.damageSlothArchbishop(40);
    const protectedTransition = game.getSlothArchbishopDiagnostics();
    return { maximum, firstHit, stillSleeping, thresholdHit, waking, protectedHit, protectedTransition };
  });

  expect(initial).toMatchObject({
    active: true,
    defeated: false,
    phase: 0,
    action: "sleep",
    sleeping: true,
    hp: 1260,
    maxHp: 1260,
    activeHandCount: 0,
  });
  expect(result.firstHit).toBeCloseTo(result.maximum * 0.17, 5);
  expect(result.stillSleeping).toMatchObject({ phase: 0, action: "sleep", sleeping: true });
  expect(result.stillSleeping.hp / result.maximum).toBeCloseTo(0.83, 5);
  expect(result.thresholdHit).toBeCloseTo(result.maximum * 0.01, 5);
  expect(result.waking).toMatchObject({ phase: 0, action: "wake", sleeping: false });
  expect(result.waking.hp / result.maximum).toBeCloseTo(0.82, 5);
  expect(result.protectedHit).toBe(0);
  expect(result.protectedTransition).toMatchObject({
    action: "wake",
    lastDamageResult: "transition",
    lastDamageAmount: 0,
  });
  expect(result.protectedTransition.hp).toBe(result.waking.hp);
});

test("waking visibly grips and carries the player across half the map without damage", async ({ page }) => {
  await startHunt(page);
  await startSlothArchbishop(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const boss = game.getSlothArchbishopDiagnostics();
    game.setPlayerMaxHp(300, 300);
    game.setPlayerPosition(boss.x, boss.z + 4);
    const before = JSON.parse(window.render_game_to_text()).player;
    const beforeHealth = game.getPlayerHealth();
    game.damageSlothArchbishop(boss.maxHp);
    const start = game.getSlothArchbishopDiagnostics();
    const reaching = game.advanceSlothArchbishop(1250);
    const midCarry = game.advanceSlothArchbishop(800);
    const duringCarry = JSON.parse(window.render_game_to_text()).player;
    const afterHealth = game.getPlayerHealth();
    const landed = game.advanceSlothArchbishop(750);
    const afterCarry = JSON.parse(window.render_game_to_text()).player;
    const awake = game.advanceSlothArchbishop(400);
    return { before, beforeHealth, start, reaching, midCarry, duringCarry, afterHealth, landed, afterCarry, awake };
  });

  expect(result.start).toMatchObject({ action: "wake", phase: 0 });
  expect(result.start.wakeTargetIds).toHaveLength(1);
  expect(result.start.wakeCarryTuning).toMatchObject({ distance: 196, duration: 1.45 });
  expect(result.reaching).toMatchObject({ action: "wake", wakeCarrying: false, connectedHandCount: 1, transientHandCount: 1 });
  expect(result.midCarry).toMatchObject({ action: "wake", wakeCarrying: true, connectedHandCount: 1, transientHandCount: 1 });
  expect(result.midCarry.handTargetIds).toEqual(result.start.wakeTargetIds);
  expect(result.midCarry.hands).toEqual([
    expect.objectContaining({ connected: true, targetId: result.start.wakeTargetIds[0] }),
  ]);
  const midHand = result.midCarry.hands[0];
  const midState = result.midCarry.wakeCarries[0];
  expect(midHand.curl).toBeGreaterThan(0.95);
  expect(Math.hypot(midHand.palmX - result.duringCarry.x, midHand.palmZ - result.duringCarry.z)).toBeLessThan(0.5);
  expect(Math.abs(midHand.palmY - (midState.currentY + 0.78))).toBeLessThan(0.12);
  expect(midHand.fingerTips.filter((tip) => Math.hypot(
    tip.x - result.duringCarry.x,
    tip.z - result.duringCarry.z
  ) < 1.1)).toHaveLength(4);
  expect(midState.currentY).toBeGreaterThan(4);
  expect(midState.plannedDistance).toBeGreaterThan(190);
  expect(result.landed).toMatchObject({ action: "wake", wakeCarrying: false });
  expect(result.landed.wakeCarries[0]).toMatchObject({ completed: true, currentY: 0 });
  expect(Math.hypot(result.afterCarry.x - result.before.x, result.afterCarry.z - result.before.z)).toBeGreaterThan(165);
  expect(result.afterHealth).toEqual(result.beforeHealth);
  expect(result.awake).toMatchObject({ phase: 1, action: "idle", walkingOnLegs: true, raised: false });
  expect(result.awake.wakeCarries).toHaveLength(0);
});

test("wake carry releases movement and aiming after the player lands", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await startHunt(page);
  await startSlothArchbishop(page);

  const transition = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const boss = game.getSlothArchbishopDiagnostics();
    game.setPlayerMaxHp(300, 300);
    game.setPlayerPosition(boss.x, boss.z + 4);
    game.forceSlothArchbishopAction("wake");
    window.advanceTime(2860);
    const released = JSON.parse(window.render_game_to_text());
    window.advanceTime(500);
    const awake = JSON.parse(window.render_game_to_text());
    return { released, awake };
  });
  const landed = transition.awake;

  await page.keyboard.down("KeyD");
  await page.evaluate(() => window.advanceTime(500));
  await page.keyboard.up("KeyD");
  const afterMove = await page.evaluate(() => JSON.parse(window.render_game_to_text()));

  const canvas = page.locator("#game-root > canvas");
  const bounds = await canvas.boundingBox();
  expect(bounds).toBeTruthy();
  await page.mouse.move(bounds.x + bounds.width * 0.82, bounds.y + bounds.height * 0.24);
  await page.evaluate(() => window.advanceTime(34));
  const afterAim = await page.evaluate(() => JSON.parse(window.render_game_to_text()));

  expect(pageErrors).toEqual([]);
  expect(transition.released.slothArchbishop).toMatchObject({
    phase: 0,
    action: "wake",
    wakeCarrying: false,
  });
  expect(transition.released.player).toMatchObject({
    bellStagger: 0,
    slothCarryLocked: false,
  });
  expect(landed.slothArchbishop).toMatchObject({
    phase: 1,
    action: "idle",
    wakeCarrying: false,
  });
  expect(afterMove.player.x - landed.player.x).toBeGreaterThan(1);
  expect(Math.abs(afterAim.player.aimAngle - afterMove.player.aimAngle)).toBeGreaterThan(0.05);
});

test("the wake transition assigns one gripping carry hand to every player", async ({ page }) => {
  await startHunt(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const multiplayer = window.__dustMultiplayerTest;
    multiplayer.startMockHost(["Host", "North", "South", "West"]);
    game.startWaveNow(5, "slothArchbishop");
    game.clearEnemies();
    game.setSlothArchbishopAiEnabled(false);
    const boss = game.getSlothArchbishopDiagnostics();
    const players = multiplayer.getState().players;
    const offsets = [[0, 4], [4, 0], [0, -4], [-4, 0]];
    players.forEach((player, index) => multiplayer.setPlayerPosition(
      player.id,
      boss.x + offsets[index][0],
      boss.z + offsets[index][1]
    ));
    const before = multiplayer.getState().players.map((player) => ({
      id: player.id,
      x: player.x,
      z: player.z,
      hp: player.hp,
    }));
    game.damageSlothArchbishop(boss.maxHp);
    const start = game.getSlothArchbishopDiagnostics();
    const mid = game.advanceSlothArchbishop(2050);
    const midPacked = game.getSlothArchbishopPackedWireDiagnostics();
    const afterMid = multiplayer.getState().players.map((player) => ({
      id: player.id,
      x: player.x,
      z: player.z,
      hp: player.hp,
    }));
    const awake = game.advanceSlothArchbishop(1150);
    const after = multiplayer.getState().players.map((player) => ({
      id: player.id,
      x: player.x,
      z: player.z,
      hp: player.hp,
    }));
    return { before, start, mid, midPacked, afterMid, awake, after };
  });

  expect(result.start.wakeTargetIds).toHaveLength(4);
  expect(new Set(result.start.wakeTargetIds).size).toBe(4);
  expect(result.mid).toMatchObject({ action: "wake", wakeCarrying: true, connectedHandCount: 4, transientHandCount: 4 });
  expect(result.mid.wakeCarries).toHaveLength(4);
  expect(result.midPacked.regularBytes).toBeLessThanOrEqual(256);
  expect(result.midPacked.regularDecoded.valid).toBe(true);
  expect(result.midPacked.regularDecoded.data.throws).toHaveLength(4);
  expect(result.midPacked.regularDecoded.data.throws.every((thrown) => thrown.kind === "wake")).toBe(true);
  expect(result.mid.hands.filter((hand) => hand.kind === "wake")).toHaveLength(4);
  expect(result.mid.hands.filter((hand) => hand.kind === "wake").every((hand) => hand.curl > 0.95)).toBe(true);
  expect(result.mid.wakeCarries.every((carry) => carry.plannedDistance > 165 && carry.currentY > 4)).toBe(true);
  for (const carry of result.mid.wakeCarries) {
    const hand = result.mid.hands.find((candidate) => candidate.kind === "wake" && candidate.targetId === carry.id);
    const player = result.afterMid.find((candidate) => candidate.id === carry.id);
    expect(hand).toBeTruthy();
    expect(Math.hypot(hand.palmX - player.x, hand.palmZ - player.z)).toBeLessThan(0.5);
  }
  for (let first = 0; first < result.mid.wakeCarries.length; first += 1) {
    for (let second = first + 1; second < result.mid.wakeCarries.length; second += 1) {
      expect(Math.hypot(
        result.mid.wakeCarries[first].endX - result.mid.wakeCarries[second].endX,
        result.mid.wakeCarries[first].endZ - result.mid.wakeCarries[second].endZ
      )).toBeGreaterThan(7);
    }
  }
  for (const player of result.after) {
    const before = result.before.find((candidate) => candidate.id === player.id);
    expect(Math.hypot(player.x - before.x, player.z - before.z)).toBeGreaterThan(165);
    expect(player.hp).toBe(before.hp);
  }
  expect(result.awake).toMatchObject({ phase: 1, action: "idle", wakeCarrying: false });
  expect(result.awake.wakeCarries).toHaveLength(0);
});

test("a guest regains movement and aiming after the replicated wake carry ends", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await startHunt(page);

  const snapshots = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const multiplayer = window.__dustMultiplayerTest;
    multiplayer.startMockHost(["Host", "Guest"]);
    game.startWaveNow(10, "slothArchbishop");
    game.clearEnemies();
    game.setSlothArchbishopAiEnabled(false);
    const sleeping = game.getSlothArchbishopDiagnostics();
    multiplayer.setPlayerPosition("mock-player-1", sleeping.x - 4, sleeping.z - 5);
    multiplayer.setPlayerPosition("mock-player-2", sleeping.x + 4, sleeping.z - 5);
    multiplayer.setHealth("mock-player-1", 1000);
    multiplayer.setHealth("mock-player-2", 1000);
    game.forceSlothArchbishopAction("wake");
    const stream = [];
    for (let index = 0; index < 52; index += 1) {
      window.advanceTime(67);
      stream.push(JSON.parse(JSON.stringify(
        multiplayer.buildWireSnapshot(false, false, "mock-player-2")
      )));
    }
    return stream;
  });

  const landed = await page.evaluate((stream) => {
    const multiplayer = window.__dustMultiplayerTest;
    multiplayer.startMockGuest(["Host", "Guest"], 1);
    for (const snapshot of stream) {
      multiplayer.applySnapshot(snapshot);
      window.advanceTime(50);
    }
    return JSON.parse(window.render_game_to_text());
  }, snapshots);

  await page.keyboard.down("KeyD");
  await page.evaluate(() => window.advanceTime(500));
  await page.keyboard.up("KeyD");
  const afterMove = await page.evaluate(() => JSON.parse(window.render_game_to_text()));

  const canvas = page.locator("#game-root > canvas");
  const bounds = await canvas.boundingBox();
  expect(bounds).toBeTruthy();
  await page.mouse.move(bounds.x + bounds.width * 0.2, bounds.y + bounds.height * 0.78);
  await page.evaluate(() => window.advanceTime(34));
  const afterAim = await page.evaluate(() => JSON.parse(window.render_game_to_text()));

  expect(pageErrors).toEqual([]);
  expect(landed.multiplayer).toMatchObject({ active: true, role: "guest", phase: "match" });
  expect(landed.slothArchbishop).toMatchObject({
    phase: 1,
    action: "idle",
    wakeCarrying: false,
  });
  expect(landed.player).toMatchObject({
    bellStagger: 0,
    slothCarryLocked: false,
  });
  expect(afterMove.player.x - landed.player.x).toBeGreaterThan(1);
  expect(Math.abs(afterAim.player.aimAngle - afterMove.player.aimAngle)).toBeGreaterThan(0.05);
});

test("phase two walks on the body legs and the guard blocks only front projectiles", async ({ page }) => {
  await startHunt(page);
  await startSlothArchbishop(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const spawn = game.getSlothArchbishopDiagnostics();
    game.setPlayerPosition(spawn.x + 24, spawn.z + 16);
    game.setSlothArchbishopAiEnabled(true);
    game.forceSlothArchbishopAction("guard");
    game.advanceSlothArchbishop(1800);
    const beforeWalk = game.getSlothArchbishopDiagnostics();
    const walking = game.advanceSlothArchbishop(900);
    game.setSlothArchbishopAiEnabled(false);
    const walkDistance = Math.hypot(
      walking.x - beforeWalk.x,
      walking.z - beforeWalk.z
    );
    const guard = game.forceSlothArchbishopAction("guard");
    const forwardX = Math.sin(guard.facingAngle);
    const forwardZ = Math.cos(guard.facingAngle);
    const sideX = Math.cos(guard.facingAngle);
    const sideZ = -Math.sin(guard.facingAngle);
    const frontDamage = game.damageSlothArchbishop(25, {
      projectile: true,
      sourceX: guard.x + forwardX * 12,
      sourceZ: guard.z + forwardZ * 12,
    });
    const front = game.getSlothArchbishopDiagnostics();
    const sideDamage = game.damageSlothArchbishop(25, {
      projectile: true,
      sourceX: guard.x + sideX * 12,
      sourceZ: guard.z + sideZ * 12,
    });
    const side = game.getSlothArchbishopDiagnostics();
    return { beforeWalk, walking, walkDistance, guard, frontDamage, front, sideDamage, side };
  });

  expect(result.walking).toMatchObject({ phase: 1, action: "idle", walkingOnLegs: true, raised: false });
  expect(result.walkDistance).toBeGreaterThan(1);
  expect(result.walking.moveAmount).toBeGreaterThan(0.5);
  expect(result.guard).toMatchObject({ phase: 1, action: "guard", transientHandCount: 2 });
  expect(result.frontDamage).toBe(0);
  expect(result.front.lastDamageResult).toBe("blocked");
  expect(result.sideDamage).toBe(25);
  expect(result.side.lastDamageResult).toBe("applied");
  expect(result.side.hp).toBe(result.guard.hp - 25);
});

test("half health summons two opposed outward palms that orbit and block their current sectors", async ({ page }) => {
  await startHunt(page);
  await startSlothArchbishop(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const sleeping = game.getSlothArchbishopDiagnostics();
    game.damageSlothArchbishop(sleeping.maxHp);
    const awake = game.advanceSlothArchbishop(3200);
    game.damageSlothArchbishop(awake.hp - awake.maxHp * 0.51);
    const beforeThreshold = game.getSlothArchbishopDiagnostics();
    const thresholdDamage = game.damageSlothArchbishop(awake.maxHp * 0.01);
    const appearing = game.advanceSlothArchbishop(200);
    const ready = game.advanceSlothArchbishop(650);
    const rotated = game.advanceSlothArchbishop(500);
    const angle = rotated.orbitShield.angle;
    const hpBeforeBlocks = rotated.hp;
    const firstBlockedDamage = game.damageSlothArchbishop(20, {
      sourceX: rotated.x + Math.sin(angle) * 80,
      sourceZ: rotated.z + Math.cos(angle) * 80,
    });
    const afterFirstBlock = game.getSlothArchbishopDiagnostics();
    const oppositeAngle = angle + Math.PI;
    const secondBlockedDamage = game.damageSlothArchbishop(20, {
      sourceX: rotated.x + Math.sin(oppositeAngle) * 80,
      sourceZ: rotated.z + Math.cos(oppositeAngle) * 80,
    });
    const afterSecondBlock = game.getSlothArchbishopDiagnostics();
    const openAngle = angle + Math.PI * 0.5;
    const openDamage = game.damageSlothArchbishop(20, {
      sourceX: rotated.x + Math.sin(openAngle) * 80,
      sourceZ: rotated.z + Math.cos(openAngle) * 80,
    });
    const afterOpen = game.getSlothArchbishopDiagnostics();
    return {
      beforeThreshold,
      thresholdDamage,
      appearing,
      ready,
      rotated,
      hpBeforeBlocks,
      firstBlockedDamage,
      afterFirstBlock,
      secondBlockedDamage,
      afterSecondBlock,
      openDamage,
      afterOpen,
    };
  });

  expect(result.beforeThreshold.hp / result.beforeThreshold.maxHp).toBeCloseTo(0.51, 3);
  expect(result.beforeThreshold.orbitShield).toMatchObject({ unlocked: false, active: false, hpRatio: 0.5 });
  expect(result.beforeThreshold.orbitShieldHandCount).toBe(0);
  expect(result.thresholdDamage).toBeCloseTo(result.beforeThreshold.maxHp * 0.01, 2);
  expect(result.appearing.orbitShield).toMatchObject({
    unlocked: true,
    active: true,
    palmsOpposed: true,
    palmsFaceOutward: true,
    speed: 0.92,
    radius: 3.75,
  });
  expect(result.appearing.orbitShield.visibility).toBeGreaterThan(0);
  expect(result.appearing.orbitShield.visibility).toBeLessThan(0.5);
  expect(result.ready).toMatchObject({
    phase: 1,
    action: "idle",
    orbitShieldHandCount: 2,
    transientHandCount: 0,
    activeHandCount: 2,
    connectedHandCount: 2,
    handPartInstances: 22,
  });
  expect(result.ready.orbitShield.visibility).toBeGreaterThan(0.99);
  const shieldHands = result.ready.hands.filter((hand) => hand.kind === "orbitShield");
  expect(shieldHands).toHaveLength(2);
  const normalizedDelta = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
  expect(normalizedDelta(shieldHands[0].angle, shieldHands[1].angle)).toBeCloseTo(Math.PI, 3);
  for (const hand of shieldHands) {
    const palmAngle = Math.atan2(hand.palmX - result.ready.x, hand.palmZ - result.ready.z);
    expect(normalizedDelta(palmAngle, hand.angle)).toBeLessThan(0.02);
    expect(Math.hypot(hand.palmX - result.ready.x, hand.palmZ - result.ready.z)).toBeCloseTo(3.75, 1);
    expect(hand.pitch).toBeCloseTo(Math.PI * 0.5, 3);
    expect(hand.connected).toBe(true);
  }
  const rotation = normalizedDelta(result.rotated.orbitShield.angle, result.ready.orbitShield.angle);
  expect(rotation).toBeGreaterThan(0.42);
  expect(rotation).toBeLessThan(0.5);
  expect(result.firstBlockedDamage).toBe(0);
  expect(result.afterFirstBlock.hp).toBe(result.hpBeforeBlocks);
  expect(result.afterFirstBlock.lastDamageResult).toBe("blocked");
  expect(result.secondBlockedDamage).toBe(0);
  expect(result.afterSecondBlock.hp).toBe(result.hpBeforeBlocks);
  expect(result.afterSecondBlock.lastDamageResult).toBe("blocked");
  expect(result.openDamage).toBe(20);
  expect(result.afterOpen.hp).toBe(result.hpBeforeBlocks - 20);
  expect(result.afterOpen.lastDamageResult).toBe("applied");
});

test("an overhead palm has a ground telegraph and stays visibly connected to the boss", async ({ page }) => {
  await startHunt(page);
  await startSlothArchbishop(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const boss = game.getSlothArchbishopDiagnostics();
    game.setPlayerPosition(boss.x + 7, boss.z + 4);
    const started = game.forceSlothArchbishopAction("overhead");
    const telegraph = started.slamTargets[0];
    game.setPlayerPosition(boss.x - 14, boss.z - 10);
    const rising = game.advanceSlothArchbishop(800);
    const approach = game.advanceSlothArchbishop(400);
    const impacted = game.advanceSlothArchbishop(300);
    return { started, telegraph, rising, approach, impacted };
  });

  expect(result.started).toMatchObject({
    phase: 1,
    action: "skySlam",
    telegraphCount: 1,
    transientHandCount: 1,
    connectedHandCount: 1,
  });
  expect(result.started.slamTargets).toHaveLength(1);
  expect(result.rising).toMatchObject({ action: "skySlam", telegraphCount: 1, connectedHandCount: 1 });
  expect(result.rising.slamTargets[0]).toMatchObject({
    id: result.telegraph.id,
    x: result.telegraph.x,
    z: result.telegraph.z,
    resolved: false,
  });
  const overhead = result.rising.hands.find((hand) => hand.kind === "overhead");
  expect(overhead).toMatchObject({ connected: true, targetId: result.telegraph.id });
  expect(Math.hypot(overhead.rootX - result.rising.x, overhead.rootZ - result.rising.z)).toBeLessThan(3);
  expect(overhead.palmY).toBeGreaterThan(5);
  expect(overhead.palmY).toBeLessThan(9.4);
  const approachingPalm = result.approach.hands.find((hand) => hand.kind === "overhead");
  expect(approachingPalm).toMatchObject({ connected: true, targetId: result.telegraph.id });
  expect(Math.hypot(
    approachingPalm.palmX - result.telegraph.x,
    approachingPalm.palmZ - result.telegraph.z
  )).toBeLessThan(0.35);
  expect(Math.hypot(
    approachingPalm.palmX - result.approach.x,
    approachingPalm.palmZ - result.approach.z
  )).toBeGreaterThan(6);
  expect(approachingPalm.palmY).toBeLessThan(9.4);
  expect(result.impacted).toMatchObject({ action: "skySlam", telegraphCount: 0 });
  expect(result.impacted.slamTargets[0].resolved).toBe(true);
});

test("the sky slam reaches every living player across the map and lands simultaneously", async ({ page }) => {
  await startHunt(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const multiplayer = window.__dustMultiplayerTest;
    multiplayer.startMockHost(["Host", "North", "South", "West"]);
    game.startWaveNow(10, "slothArchbishop");
    game.clearEnemies();
    game.setSlothArchbishopAiEnabled(false);
    game.forceSlothArchbishopAction("spider");
    const spider = game.advanceSlothArchbishop(1900);
    const corners = [
      [-220, -180],
      [220, -180],
      [-220, 180],
      [220, 180],
    ];
    const players = multiplayer.getState().players;
    players.forEach((player, index) => {
      multiplayer.setPlayerPosition(player.id, corners[index][0], corners[index][1]);
      multiplayer.setHealth(player.id, 100);
    });
    const before = multiplayer.getState().players.map((player) => ({
      id: player.id,
      x: player.x,
      z: player.z,
      hp: player.hp,
    }));
    const started = game.forceSlothArchbishopAction("overhead");
    const beforeImpact = game.advanceSlothArchbishop(1000);
    const healthBeforeImpact = multiplayer.getState().players.map((player) => ({ id: player.id, hp: player.hp }));
    const impacted = game.advanceSlothArchbishop(80);
    const after = multiplayer.getState().players.map((player) => ({ id: player.id, hp: player.hp }));
    return { spider, before, started, beforeImpact, healthBeforeImpact, impacted, after };
  });

  expect(result.started).toMatchObject({
    phase: 2,
    action: "skySlam",
    telegraphCount: 4,
    supportHandCount: 12,
    orbitShieldHandCount: 2,
    transientHandCount: 4,
    activeHandCount: 18,
    connectedHandCount: 18,
    handPartInstances: 178,
  });
  expect(result.started.attackTuning).toMatchObject({
    skySlamTargetsAllLivingPlayers: true,
    skySlamSimultaneous: true,
  });
  expect(result.started.slamTargets).toHaveLength(4);
  expect(new Set(result.started.slamTargets.map((target) => target.id)).size).toBe(4);
  expect(result.started.slamTargets.every((target) => target.impactOffset === 0 && !target.resolved)).toBe(true);
  expect(Math.max(...result.started.slamTargets.map((target) => (
    Math.hypot(target.x - result.started.x, target.z - result.started.z)
  )))).toBeGreaterThan(250);
  expect(result.started.hands.filter((hand) => hand.kind === "overhead")).toHaveLength(4);
  expect(new Set(
    result.started.hands.filter((hand) => hand.kind === "overhead").map((hand) => hand.targetId)
  ).size).toBe(4);
  expect(result.beforeImpact.telegraphCount).toBe(4);
  expect(result.beforeImpact.slamTargets.every((target) => !target.resolved)).toBe(true);
  expect(result.beforeImpact.hands.filter((hand) => hand.kind === "overhead")).toHaveLength(4);
  const farthestConnectedReach = Math.max(...result.beforeImpact.slamTargets.map((target) => {
    const hand = result.beforeImpact.hands.find((candidate) => (
      candidate.kind === "overhead" && candidate.targetId === target.id
    ));
    expect(hand).toBeTruthy();
    expect(hand.connected).toBe(true);
    expect(Math.hypot(hand.rootX - result.beforeImpact.x, hand.rootZ - result.beforeImpact.z)).toBeLessThan(3);
    expect(Math.hypot(hand.palmX - target.x, hand.palmZ - target.z)).toBeLessThan(7);
    return slothHandReach(hand);
  }));
  expect(farthestConnectedReach).toBeGreaterThan(250);
  expect(result.healthBeforeImpact.map((player) => player.hp)).toEqual(result.before.map((player) => player.hp));
  expect(result.impacted.telegraphCount).toBe(0);
  expect(result.impacted.slamTargets.every((target) => target.resolved)).toBe(true);
  expect(result.after.every((player) => player.hp < result.before.find((before) => before.id === player.id).hp)).toBe(true);
  expect(result.after.every((player) => player.hp > 0)).toBe(true);
  expect(result.after.map((player) => player.hp)).toEqual([60, 60, 60, 60]);
});

test("every offensive hand attack targets all four living players at unlimited range", async ({ page }) => {
  await startHunt(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const multiplayer = window.__dustMultiplayerTest;
    const corners = [
      [-220, -180],
      [220, -180],
      [-220, 180],
      [220, 180],
    ];
    const impactTimes = {
      sweep: 720,
      clap: 1000,
      "lazy-grip": 920,
      "four-sides": 750,
      cross: 600,
      grab: 650,
    };
    const samples = [];
    for (const action of Object.keys(impactTimes)) {
      multiplayer.startMockHost(["Host", "North", "South", "West"]);
      game.startWaveNow(5, "slothArchbishop");
      game.clearEnemies();
      game.setSlothArchbishopAiEnabled(false);
      const players = multiplayer.getState().players;
      players.forEach((player, index) => {
        multiplayer.setPlayerPosition(player.id, corners[index][0], corners[index][1]);
        multiplayer.setHealth(player.id, 100);
      });
      const before = multiplayer.getState().players.map((player) => ({ id: player.id, hp: player.hp }));
      const started = game.forceSlothArchbishopAction(action);
      const startPacked = game.getSlothArchbishopPackedWireDiagnostics();
      const impacted = game.advanceSlothArchbishop(impactTimes[action]);
      const impactPacked = game.getSlothArchbishopPackedWireDiagnostics();
      const after = multiplayer.getState().players.map((player) => ({ id: player.id, hp: player.hp }));
      samples.push({ action, started, impacted, before, after, startPacked, impactPacked });
    }
    return samples;
  });

  const expectedVisuals = {
    sweep: { phase: 1, action: "sweep", hands: 4, telegraphs: 4, activeHands: 4, parts: 56 },
    clap: { phase: 1, action: "prayerClap", hands: 8, telegraphs: 8, activeHands: 8, parts: 96 },
    "lazy-grip": { phase: 1, action: "lazyGrip", hands: 4, telegraphs: 4, activeHands: 4, parts: 56 },
    "four-sides": { phase: 2, action: "fourSides", hands: 16, telegraphs: 16, activeHands: 30, parts: 322 },
    cross: { phase: 2, action: "crossSweep", hands: 8, telegraphs: 8, activeHands: 22, parts: 226 },
    grab: { phase: 2, action: "grab", hands: 8, telegraphs: 4, activeHands: 22, parts: 218 },
  };
  for (const sample of result) {
    const expected = expectedVisuals[sample.action];
    expect(sample.started).toMatchObject({
      phase: expected.phase,
      action: expected.action,
      telegraphCount: expected.telegraphs,
      activeHandCount: expected.activeHands,
      handPartInstances: expected.parts,
      attackTuning: {
        attackRangeUnlimited: true,
        targetsAllLivingPlayers: true,
        simultaneousTargets: true,
      },
    });
    expect(sample.started.slamTargets).toHaveLength(4);
    expect(sample.started.orbitShieldHandCount).toBe(expected.phase === 2 ? 2 : 0);
    expect(new Set(sample.started.slamTargets.map((target) => target.id)).size).toBe(4);
    expect(sample.started.slamTargets.every((target) => target.impactOffset === 0)).toBe(true);
    expect(Math.max(...sample.started.slamTargets.map((target) => (
      Math.hypot(target.x - sample.started.x, target.z - sample.started.z)
    )))).toBeGreaterThan(250);
    const attackHands = sample.started.hands.filter((hand) => hand.kind === expected.action);
    expect(attackHands).toHaveLength(expected.hands);
    expect(new Set(attackHands.map((hand) => hand.targetId)).size).toBe(4);
    expect(new Set(sample.started.telegraphs.map((telegraph) => telegraph.targetId)).size).toBe(4);
    expect(sample.startPacked.regularBytes).toBeLessThanOrEqual(512);
    expect(sample.startPacked.regularDecoded.valid).toBe(true);
    expect(sample.startPacked.regularDecoded.data.slamTargets).toHaveLength(4);
    expect(new Set(sample.startPacked.regularDecoded.data.slamTargets.map((target) => target.id)).size).toBe(4);
    expect(sample.impacted.slamTargets.every((target) => target.resolved)).toBe(true);
    const harmlessCarry = sample.action === "lazy-grip" || sample.action === "grab";
    if (harmlessCarry) {
      expect(sample.after.map((player) => player.hp)).toEqual(sample.before.map((player) => player.hp));
      expect(sample.impacted.throwTargetIds).toHaveLength(4);
      expect(new Set(sample.impacted.throwTargetIds).size).toBe(4);
      expect(sample.impacted.throws).toHaveLength(4);
      expect(sample.impactPacked.regularBytes).toBeLessThanOrEqual(512);
      expect(sample.impactPacked.regularDecoded.valid).toBe(true);
      expect(sample.impactPacked.regularDecoded.data.throws).toHaveLength(4);
      expect(new Set(sample.impactPacked.regularDecoded.data.throws.map((thrown) => thrown.id)).size).toBe(4);
    } else {
      expect(sample.after.every((player) => (
        player.hp < sample.before.find((before) => before.id === player.id).hp
      ))).toBe(true);
      expect(sample.after.every((player) => player.hp > 0)).toBe(true);
      const expectedDamage = {
        sweep: 32,
        clap: 30,
        "four-sides": 36,
        cross: 34,
      }[sample.action];
      expect(sample.after.map((player) => player.hp)).toEqual([
        100 - expectedDamage,
        100 - expectedDamage,
        100 - expectedDamage,
        100 - expectedDamage,
      ]);
    }
  }
});

test("every damaging Archbishop move leaves a full-health player alive after two clean hits", async ({ page }) => {
  await startHunt(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const attacks = [
      { action: "sweep", impactMs: 720 },
      { action: "overhead", impactMs: 1400 },
      { action: "clap", impactMs: 1000 },
      { action: "four-sides", impactMs: 750 },
      { action: "cross", impactMs: 600 },
    ];
    const samples = [];
    for (const attack of attacks) {
      game.startWaveNow(10, "slothArchbishop");
      game.clearEnemies();
      game.setSlothArchbishopAiEnabled(false);
      game.setPlayerMaxHp(120, 120);
      const health = [120];
      for (let hitIndex = 0; hitIndex < 2; hitIndex += 1) {
        const boss = game.getSlothArchbishopDiagnostics();
        game.setPlayerHp(health[health.length - 1]);
        game.setPlayerPosition(boss.x, boss.z + 6);
        const started = game.forceSlothArchbishopAction(attack.action);
        const target = started.slamTargets[0];
        game.setPlayerPosition(target.x, target.z);
        game.advanceSlothArchbishop(attack.impactMs);
        health.push(game.getPlayerHealth().hp);
      }
      samples.push({
        action: attack.action,
        health,
        tuning: game.getSlothArchbishopDiagnostics().attackTuning,
      });
    }
    return samples;
  });

  const expectedDamage = {
    sweep: 32,
    overhead: 40,
    clap: 30,
    "four-sides": 36,
    cross: 34,
  };
  for (const sample of result) {
    const damage = expectedDamage[sample.action];
    expect(sample.health).toEqual([120, 120 - damage, 120 - damage * 2]);
    expect(sample.health[2]).toBeGreaterThan(0);
    expect(Math.ceil(120 / damage)).toBeGreaterThanOrEqual(3);
    expect(Math.ceil(120 / damage)).toBeLessThanOrEqual(4);
    expect(sample.tuning.maxHpDamageRatio).toBeCloseTo(1 / 3, 8);
  }
});

test("the AI keeps every offensive phase-two move at unlimited range without guarding on a timer", async ({ page }) => {
  await startHunt(page);
  await startSlothArchbishop(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const sleeping = game.getSlothArchbishopDiagnostics();
    game.damageSlothArchbishop(sleeping.maxHp);
    const awake = game.advanceSlothArchbishop(3200);
    const farPosition = game.setPlayerPosition(
      awake.x >= 0 ? -220 : 220,
      awake.z >= 0 ? -180 : 180
    );
    game.setPlayerMaxHp(10000, 10000);
    game.setSlothArchbishopAiEnabled(true);
    const casts = [];
    let lastSequence = -1;
    for (let step = 0; step < 300; step += 1) {
      const diagnostics = game.advanceSlothArchbishop(100);
      if (diagnostics.actionSequence !== lastSequence && diagnostics.action !== "idle") {
        lastSequence = diagnostics.actionSequence;
        casts.push(diagnostics);
        const seen = new Set(casts.map((cast) => cast.action));
        if (["prayerClap", "sweep", "lazyGrip", "skySlam"].every((action) => seen.has(action))) break;
      }
    }
    return {
      farPosition,
      casts,
    };
  });

  const castsByAction = new Map(result.casts.map((cast) => [cast.action, cast]));
  expect([...castsByAction.keys()]).toEqual(expect.arrayContaining([
    "prayerClap", "sweep", "lazyGrip", "skySlam",
  ]));
  expect(castsByAction.has("guard")).toBe(false);
  for (const action of ["prayerClap", "sweep", "lazyGrip", "skySlam"]) {
    const cast = castsByAction.get(action);
    expect(cast.attackTuning).toMatchObject({
      attackRangeUnlimited: true,
      targetsAllLivingPlayers: true,
      simultaneousTargets: true,
    });
    expect(cast.slamTargets).toHaveLength(1);
    expect(Math.hypot(
      cast.slamTargets[0].x - cast.x,
      cast.slamTargets[0].z - cast.z
    )).toBeGreaterThan(100);
  }
});

test("phase-two guard waits for concentrated incoming damage and turns toward its source", async ({ page }) => {
  await startHunt(page);
  await startSlothArchbishop(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const sleeping = game.getSlothArchbishopDiagnostics();
    game.damageSlothArchbishop(sleeping.maxHp);
    const awake = game.advanceSlothArchbishop(3200);
    const sourceAngle = -1.08;
    const sourceX = awake.x + Math.sin(sourceAngle) * 30;
    const sourceZ = awake.z + Math.cos(sourceAngle) * 30;
    const damagePerHit = awake.maxHp * 0.022;
    for (let hit = 0; hit < 3; hit += 1) {
      game.damageSlothArchbishop(damagePerHit, {
        ownerPlayerId: "solo",
        projectile: true,
        sourceX,
        sourceZ,
      });
    }
    const pressure = game.getSlothArchbishopDiagnostics();
    game.setSlothArchbishopAiEnabled(true);
    const guarding = game.advanceSlothArchbishop(17);
    const blocked = game.damageSlothArchbishop(damagePerHit, {
      ownerPlayerId: "solo",
      projectile: true,
      sourceX,
      sourceZ,
    });
    return {
      sourceAngle,
      pressure,
      guarding,
      blocked,
      afterBlock: game.getSlothArchbishopDiagnostics(),
    };
  });

  expect(result.pressure).toMatchObject({ phase: 1, action: "idle" });
  expect(result.pressure.adaptiveAi.directionalGuardDamage).toBeGreaterThan(
    result.pressure.maxHp * result.pressure.adaptiveAi.directionalGuardDamageRatio
  );
  expect(result.pressure.adaptiveAi.directionalGuardConcentration).toBeGreaterThan(0.98);
  expect(result.guarding).toMatchObject({
    phase: 1,
    action: "guard",
    adaptiveAi: { reactiveAction: "directionalGuard" },
  });
  const facingDelta = Math.atan2(
    Math.sin(result.guarding.facingAngle - result.sourceAngle),
    Math.cos(result.guarding.facingAngle - result.sourceAngle)
  );
  expect(Math.abs(facingDelta)).toBeLessThan(0.03);
  expect(result.blocked).toBe(0);
  expect(result.afterBlock.lastDamageResult).toBe("blocked");
});

test("a sustained cluster is gripped together and separated without damage", async ({ page }) => {
  await startHunt(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const multiplayer = window.__dustMultiplayerTest;
    multiplayer.startMockHost(["Host", "North", "South", "West"]);
    game.startWaveNow(10, "slothArchbishop");
    game.clearEnemies();
    game.setSlothArchbishopAiEnabled(false);
    const sleeping = game.getSlothArchbishopDiagnostics();
    game.damageSlothArchbishop(sleeping.maxHp);
    const awake = game.advanceSlothArchbishop(3200);
    const offsets = [
      [-1.1, -1.1],
      [1.1, -1.1],
      [-1.1, 1.1],
      [1.1, 1.1],
    ];
    const players = multiplayer.getState().players;
    players.forEach((player, index) => {
      multiplayer.setPlayerPosition(
        player.id,
        awake.x + 9 + offsets[index][0],
        awake.z + 7 + offsets[index][1]
      );
      multiplayer.setHealth(player.id, 1000);
    });
    const before = multiplayer.getState().players.map((player) => ({
      id: player.id,
      x: player.x,
      z: player.z,
      hp: player.hp,
    }));
    game.setSlothArchbishopAiEnabled(true);
    const reacting = game.advanceSlothArchbishop(1000);
    const airborne = game.advanceSlothArchbishop(900);
    game.advanceSlothArchbishop(900);
    const after = multiplayer.getState().players.map((player) => ({
      id: player.id,
      x: player.x,
      z: player.z,
      hp: player.hp,
    }));
    const minimumPairDistance = (samples) => {
      let minimum = Infinity;
      for (let first = 0; first < samples.length; first += 1) {
        for (let second = first + 1; second < samples.length; second += 1) {
          minimum = Math.min(minimum, Math.hypot(
            samples[first].x - samples[second].x,
            samples[first].z - samples[second].z
          ));
        }
      }
      return minimum;
    };
    return {
      before,
      reacting,
      airborne,
      after,
      beforeMinimum: minimumPairDistance(before),
      afterMinimum: minimumPairDistance(after),
    };
  });

  expect(result.beforeMinimum).toBeLessThan(2.3);
  expect(result.reacting).toMatchObject({
    phase: 1,
    action: "lazyGrip",
    adaptiveAi: { reactiveAction: "clusterSeparation" },
  });
  expect(result.reacting.slamTargets).toHaveLength(4);
  expect(new Set(result.reacting.slamTargets.map((target) => target.id)).size).toBe(4);
  expect(result.airborne).toMatchObject({ throwing: true, throwKind: "lazyGrip" });
  expect(result.airborne.throwTargetIds).toHaveLength(4);
  expect(result.afterMinimum).toBeGreaterThan(12);
  expect(result.after.map((player) => player.hp)).toEqual(result.before.map((player) => player.hp));
});

test("sustained spider pressure grips only its source and stays synchronized for the guest", async ({ page }) => {
  await startHunt(page);

  const host = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const multiplayer = window.__dustMultiplayerTest;
    multiplayer.startMockHost(["Host", "Guest"]);
    game.startWaveNow(10, "slothArchbishop");
    game.clearEnemies();
    game.setSlothArchbishopAiEnabled(false);
    game.forceSlothArchbishopAction("spider");
    const spider = game.advanceSlothArchbishop(1900);
    const forwardX = Math.sin(spider.facingAngle);
    const forwardZ = Math.cos(spider.facingAngle);
    multiplayer.setPlayerPosition("mock-player-1", spider.x - 70, spider.z - 70);
    multiplayer.setPlayerPosition("mock-player-2", spider.x + forwardX * 7, spider.z + forwardZ * 7);
    multiplayer.setHealth("mock-player-1", 1000);
    multiplayer.setHealth("mock-player-2", 1000);
    const source = multiplayer.getState().players.find((player) => player.id === "mock-player-2");
    for (let hit = 0; hit < 9; hit += 1) {
      game.damageSlothArchbishop(8, {
        ownerPlayerId: source.id,
        projectile: false,
        sourceX: source.x,
        sourceZ: source.z,
      });
      game.advanceSlothArchbishop(200);
    }
    const pressure = game.getSlothArchbishopDiagnostics();
    game.setSlothArchbishopAiEnabled(true);
    const reacting = game.advanceSlothArchbishop(17);
    const airborne = game.advanceSlothArchbishop(650);
    const wire = JSON.parse(JSON.stringify(multiplayer.buildWireSnapshot(false, false, "mock-player-2")));
    return {
      pressure,
      reacting,
      airborne,
      wire,
      decoded: multiplayer.decodeBossState(wire.bossState),
      packetBytes: Uint8Array.from(atob(wire.bossState), (char) => char.charCodeAt(0)).length,
    };
  });

  const guest = await page.evaluate((wire) => {
    const game = window.__dustAndDeadTest;
    const multiplayer = window.__dustMultiplayerTest;
    multiplayer.startMockGuest(["Host", "Guest"], 1);
    multiplayer.applySnapshot(wire);
    const replicated = game.getSlothArchbishopDiagnostics();
    const before = multiplayer.getState().players.find((player) => player.id === "mock-player-2");
    game.advanceSlothArchbishop(1200);
    const landed = multiplayer.getState().players.find((player) => player.id === "mock-player-2");
    return { replicated, before, landed };
  }, host.wire);

  const pressure = host.pressure.adaptiveAi.spiderPressure.find((entry) => entry.id === "mock-player-2");
  expect(pressure).toMatchObject({ hitCount: 9 });
  expect(pressure.streak).toBeGreaterThanOrEqual(host.pressure.adaptiveAi.spiderPressureStreakTime);
  expect(pressure.damage).toBeGreaterThan(
    host.pressure.maxHp * host.pressure.adaptiveAi.spiderPressureDamageRatio
  );
  expect(host.reacting).toMatchObject({
    phase: 2,
    action: "grab",
    adaptiveAi: { reactiveAction: "spiderPressure" },
  });
  expect(host.reacting.slamTargets.map((target) => target.id)).toEqual(["mock-player-2"]);
  expect(host.airborne).toMatchObject({ throwing: true, throwKind: "grab" });
  expect(host.airborne.throwTargetIds).toEqual(["mock-player-2"]);
  expect(host.decoded.throws).toHaveLength(1);
  expect(host.decoded.throws[0].id).toBe("mock-player-2");
  expect(host.packetBytes).toBeLessThanOrEqual(256);
  expect(guest.replicated).toMatchObject({
    replica: true,
    phase: 2,
    action: "grab",
    throwing: true,
    throwTargetId: "mock-player-2",
  });
  expect(guest.replicated.throwTargetIds).toEqual(["mock-player-2"]);
  expect(Math.hypot(
    guest.landed.x - guest.before.x,
    guest.landed.z - guest.before.z
  )).toBeGreaterThan(28);
  expect(guest.landed.hp).toBe(guest.before.hp);
});

test("phase two adds a telegraphed prayer clap and a harmless sideways lazy grip", async ({ page }) => {
  await startHunt(page);
  await startSlothArchbishop(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const boss = game.getSlothArchbishopDiagnostics();
    const forwardX = Math.sin(boss.facingAngle);
    const forwardZ = Math.cos(boss.facingAngle);
    game.setPlayerMaxHp(1000, 1000);
    game.setPlayerPosition(boss.x + forwardX * 7, boss.z + forwardZ * 7);
    const clapStart = game.forceSlothArchbishopAction("clap");
    const clapTarget = clapStart.slamTargets[0];
    const clapAngle = Math.atan2(clapTarget.x - clapStart.x, clapTarget.z - clapStart.z);
    const clapForwardX = Math.sin(clapAngle);
    const clapForwardZ = Math.cos(clapAngle);
    const clapReady = game.advanceSlothArchbishop(700);
    game.setPlayerPosition(clapTarget.x + clapForwardX * 4, clapTarget.z + clapForwardZ * 4);
    const safeBefore = game.getPlayerHealth();
    const clapSafeImpact = game.advanceSlothArchbishop(350);
    const safeAfter = game.getPlayerHealth();

    game.setPlayerPosition(clapTarget.x, clapTarget.z);
    game.setPlayerHp(1000);
    const clapHitStart = game.forceSlothArchbishopAction("clap");
    const clapHitImpact = game.advanceSlothArchbishop(1000);
    const clapHitHealth = game.getPlayerHealth();

    const gripOrigin = game.setPlayerPosition(boss.x + forwardX * 30, boss.z + forwardZ * 30);
    game.setPlayerHp(1000);
    const gripBeforeHealth = game.getPlayerHealth();
    const gripStart = game.forceSlothArchbishopAction("lazy-grip");
    const gripBeforeImpact = game.advanceSlothArchbishop(820);
    const gripAirborne = game.advanceSlothArchbishop(120);
    const gripMid = game.advanceSlothArchbishop(300);
    const gripMidPlayer = JSON.parse(window.render_game_to_text()).player;
    const gripLanded = game.advanceSlothArchbishop(700);
    const gripFinalPlayer = JSON.parse(window.render_game_to_text()).player;
    const gripAfterHealth = game.getPlayerHealth();
    return {
      clapStart,
      clapReady,
      clapSafeImpact,
      safeBefore,
      safeAfter,
      clapHitStart,
      clapHitImpact,
      clapHitHealth,
      gripOrigin,
      gripBeforeHealth,
      gripStart,
      gripBeforeImpact,
      gripAirborne,
      gripMid,
      gripMidPlayer,
      gripLanded,
      gripFinalPlayer,
      gripAfterHealth,
    };
  });

  expect(result.clapStart).toMatchObject({
    phase: 1,
    action: "prayerClap",
    telegraphCount: 2,
    transientHandCount: 2,
    connectedHandCount: 2,
  });
  expect(result.clapStart.telegraphs).toHaveLength(2);
  expect(result.clapStart.telegraphs.every((warning) => (
    warning.kind === "prayerClap" && warning.halfWidth === 1.65 && warning.halfLength > 3.4
  ))).toBe(true);
  expect(result.clapReady.hands.filter((hand) => hand.kind === "prayerClap")).toHaveLength(2);
  expect(result.clapReady.hands.filter((hand) => hand.kind === "prayerClap").every((hand) => hand.connected)).toBe(true);
  expect(result.clapSafeImpact.telegraphCount).toBe(0);
  expect(result.safeAfter).toEqual(result.safeBefore);
  expect(result.clapHitStart.telegraphCount).toBe(2);
  expect(result.clapHitImpact.slamTargets[0].resolved).toBe(true);
  expect(result.clapHitHealth.hp).toBeLessThan(1000);

  expect(result.gripStart).toMatchObject({
    phase: 1,
    action: "lazyGrip",
    telegraphCount: 1,
    transientHandCount: 1,
    connectedHandCount: 1,
  });
  expect(result.gripBeforeImpact).toMatchObject({ action: "lazyGrip", throwing: false, telegraphCount: 1 });
  expect(result.gripAirborne).toMatchObject({
    action: "lazyGrip",
    throwing: true,
    throwKind: "lazyGrip",
    telegraphCount: 0,
  });
  expect(result.gripAirborne.throwDistance).toBeGreaterThan(13);
  const lazyHand = result.gripMid.hands.find((hand) => hand.kind === "lazyGrip");
  expect(lazyHand.connected).toBe(true);
  expect(lazyHand.targetId).toBe(result.gripMid.throwTargetId);
  expect(lazyHand.targetId).not.toBe("");
  expect(lazyHand.curl).toBeGreaterThan(0.92);
  expect(Math.hypot(lazyHand.palmX - result.gripMidPlayer.x, lazyHand.palmZ - result.gripMidPlayer.z)).toBeLessThan(0.8);
  expect(result.gripLanded).toMatchObject({ phase: 1, action: "idle", throwing: false });
  expect(Math.hypot(
    result.gripFinalPlayer.x - result.gripOrigin.x,
    result.gripFinalPlayer.z - result.gripOrigin.z
  )).toBeGreaterThan(13);
  expect(result.gripAfterHealth).toEqual(result.gripBeforeHealth);
});

test("phase three adds four-sided compression and a crossed sweep with diagonal safe sectors", async ({ page }) => {
  await startHunt(page);
  await startSlothArchbishop(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    game.forceSlothArchbishopAction("spider");
    const spider = game.advanceSlothArchbishop(1900);
    const forwardX = Math.sin(spider.facingAngle);
    const forwardZ = Math.cos(spider.facingAngle);
    const rightX = Math.cos(spider.facingAngle);
    const rightZ = -Math.sin(spider.facingAngle);
    game.setPlayerMaxHp(1000, 1000);

    game.setPlayerPosition(spider.x + forwardX * 8, spider.z + forwardZ * 8);
    const fourStart = game.forceSlothArchbishopAction("four-sides");
    const fourTarget = fourStart.slamTargets[0];
    game.setPlayerPosition(
      fourTarget.x + (forwardX + rightX) * 4,
      fourTarget.z + (forwardZ + rightZ) * 4
    );
    const fourSafeBefore = game.getPlayerHealth();
    const fourSafeImpact = game.advanceSlothArchbishop(760);
    const fourSafeAfter = game.getPlayerHealth();
    game.setPlayerPosition(fourTarget.x, fourTarget.z);
    game.setPlayerHp(1000);
    const fourHitStart = game.forceSlothArchbishopAction("four-sides");
    const fourHitImpact = game.advanceSlothArchbishop(760);
    const fourHitHealth = game.getPlayerHealth();

    game.setPlayerPosition(spider.x + forwardX * 8, spider.z + forwardZ * 8);
    game.setPlayerHp(1000);
    const crossStart = game.forceSlothArchbishopAction("cross");
    const crossTarget = crossStart.slamTargets[0];
    game.setPlayerPosition(crossTarget.x + forwardX * 4, crossTarget.z + forwardZ * 4);
    const crossSafeBefore = game.getPlayerHealth();
    const crossSafeImpact = game.advanceSlothArchbishop(600);
    const crossSafeAfter = game.getPlayerHealth();
    game.setPlayerPosition(crossTarget.x, crossTarget.z);
    game.setPlayerHp(1000);
    const crossHitStart = game.forceSlothArchbishopAction("cross");
    const crossHitImpact = game.advanceSlothArchbishop(600);
    const crossHitHealth = game.getPlayerHealth();
    return {
      fourStart,
      fourSafeBefore,
      fourSafeImpact,
      fourSafeAfter,
      fourHitStart,
      fourHitImpact,
      fourHitHealth,
      crossStart,
      crossSafeBefore,
      crossSafeImpact,
      crossSafeAfter,
      crossHitStart,
      crossHitImpact,
      crossHitHealth,
    };
  });

  expect(result.fourStart).toMatchObject({
    phase: 2,
    action: "fourSides",
    supportHandCount: 12,
    orbitShieldHandCount: 2,
    transientHandCount: 4,
    activeHandCount: 18,
    connectedHandCount: 18,
    handPartInstances: 178,
    telegraphCount: 4,
  });
  expect(result.fourStart.telegraphs).toHaveLength(4);
  expect(result.fourStart.telegraphs.every((warning) => warning.kind === "fourSides")).toBe(true);
  expect(result.fourStart.hands.filter((hand) => hand.kind === "fourSides")).toHaveLength(4);
  expect(result.fourSafeAfter).toEqual(result.fourSafeBefore);
  expect(result.fourSafeImpact.telegraphCount).toBe(0);
  expect(result.fourHitStart.telegraphCount).toBe(4);
  expect(result.fourHitImpact.slamTargets[0].resolved).toBe(true);
  expect(result.fourHitHealth.hp).toBeLessThan(1000);

  expect(result.crossStart).toMatchObject({
    phase: 2,
    action: "crossSweep",
    supportHandCount: 12,
    orbitShieldHandCount: 2,
    transientHandCount: 2,
    activeHandCount: 16,
    connectedHandCount: 16,
    handPartInstances: 154,
    telegraphCount: 2,
  });
  expect(result.crossStart.telegraphs).toHaveLength(2);
  expect(result.crossStart.telegraphs.every((warning) => (
    warning.kind === "crossSweep" && warning.halfLength === 9.2 && warning.halfWidth === 1.42
  ))).toBe(true);
  expect(result.crossStart.hands.filter((hand) => hand.kind === "crossSweep")).toHaveLength(2);
  expect(result.crossSafeAfter).toEqual(result.crossSafeBefore);
  expect(result.crossSafeImpact.telegraphCount).toBe(0);
  expect(result.crossHitStart.telegraphCount).toBe(2);
  expect(result.crossHitImpact.slamTargets[0].resolved).toBe(true);
  expect(result.crossHitHealth.hp).toBeLessThan(1000);
});

test("the AI attack rotations use both new moves in their intended phases", async ({ page }) => {
  await startHunt(page);
  await startSlothArchbishop(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const sleeping = game.getSlothArchbishopDiagnostics();
    game.setPlayerMaxHp(5000, 5000);
    game.damageSlothArchbishop(sleeping.maxHp);
    let diagnostics = game.advanceSlothArchbishop(3200);
    const walkingActions = [];
    let lastSequence = diagnostics.actionSequence;
    game.setSlothArchbishopAiEnabled(true);
    for (let step = 0; step < 260; step += 1) {
      if (diagnostics.action === "idle") {
        game.setPlayerPosition(
          diagnostics.x + Math.sin(diagnostics.facingAngle) * 7,
          diagnostics.z + Math.cos(diagnostics.facingAngle) * 7
        );
      }
      diagnostics = game.advanceSlothArchbishop(100);
      if (diagnostics.actionSequence !== lastSequence) {
        lastSequence = diagnostics.actionSequence;
        walkingActions.push(diagnostics.action);
      }
      if (walkingActions.includes("prayerClap") && walkingActions.includes("lazyGrip")) break;
    }

    game.forceSlothArchbishopAction("spider");
    diagnostics = game.advanceSlothArchbishop(1900);
    const spiderActions = [];
    lastSequence = diagnostics.actionSequence;
    for (let step = 0; step < 320; step += 1) {
      if (diagnostics.action === "idle") {
        game.setPlayerPosition(
          diagnostics.x + Math.sin(diagnostics.facingAngle) * 8,
          diagnostics.z + Math.cos(diagnostics.facingAngle) * 8
        );
      }
      diagnostics = game.advanceSlothArchbishop(100);
      if (diagnostics.actionSequence !== lastSequence) {
        lastSequence = diagnostics.actionSequence;
        spiderActions.push(diagnostics.action);
      }
      if (spiderActions.includes("fourSides") && spiderActions.includes("crossSweep")) break;
    }
    return { walkingActions, spiderActions, final: diagnostics, health: game.getPlayerHealth() };
  });

  expect(result.walkingActions).toContain("prayerClap");
  expect(result.walkingActions).toContain("lazyGrip");
  expect(result.spiderActions).toContain("fourSides");
  expect(result.spiderActions).toContain("crossSweep");
  expect(result.final.phase).toBe(2);
  expect(result.health.hp).toBeGreaterThan(0);
});

test("phase three stands higher on twelve supports while orbiting palms guard the open front and rear", async ({ page }) => {
  await startHunt(page);
  await startSlothArchbishop(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    game.forceSlothArchbishopAction("spider");
    const firstPairEarly = game.advanceSlothArchbishop(300);
    const firstPairExtended = game.advanceSlothArchbishop(200);
    const rising = game.advanceSlothArchbishop(500);
    const spider = game.advanceSlothArchbishop(900);
    const sideX = Math.cos(spider.facingAngle);
    const sideZ = -Math.sin(spider.facingAngle);
    const sideDamage = game.damageSlothArchbishop(20, {
      projectile: true,
      sourceX: spider.x + sideX * 12,
      sourceZ: spider.z + sideZ * 12,
    });
    const side = game.getSlothArchbishopDiagnostics();
    const angularDistance = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
    const chooseUnshieldedOpening = (baseAngle) => {
      for (const offset of [0, 0.3, -0.3, 0.55, -0.55, 0.8, -0.8]) {
        const candidate = baseAngle + offset;
        const firstGap = angularDistance(candidate, spider.orbitShield.angle);
        const secondGap = angularDistance(candidate, spider.orbitShield.angle + Math.PI);
        if (Math.min(firstGap, secondGap) > spider.orbitShield.blockHalfAngle + 0.08) return candidate;
      }
      return baseAngle + 0.8;
    };
    const frontAngle = chooseUnshieldedOpening(spider.facingAngle);
    const rearAngle = chooseUnshieldedOpening(spider.facingAngle + Math.PI);
    const frontDamage = game.damageSlothArchbishop(20, {
      projectile: true,
      sourceX: spider.x + Math.sin(frontAngle) * 12,
      sourceZ: spider.z + Math.cos(frontAngle) * 12,
    });
    const rearDamage = game.damageSlothArchbishop(20, {
      projectile: true,
      sourceX: spider.x + Math.sin(rearAngle) * 12,
      sourceZ: spider.z + Math.cos(rearAngle) * 12,
    });
    const open = game.getSlothArchbishopDiagnostics();
    return {
      firstPairEarly,
      firstPairExtended,
      rising,
      spider,
      sideDamage,
      side,
      frontDamage,
      rearDamage,
      open,
    };
  });

  expect(result.firstPairEarly).toMatchObject({
    action: "spiderRise",
    supportHandCount: 2,
    orbitShieldHandCount: 2,
    connectedHandCount: 4,
  });
  expect(result.firstPairExtended).toMatchObject({
    action: "spiderRise",
    supportHandCount: 2,
    orbitShieldHandCount: 2,
    connectedHandCount: 4,
  });
  const earlySupports = result.firstPairEarly.hands.filter((hand) => hand.kind === "support");
  const extendedSupports = result.firstPairExtended.hands.filter((hand) => hand.kind === "support");
  expect(earlySupports).toHaveLength(2);
  expect(extendedSupports).toHaveLength(2);
  expect(earlySupports[0].visibility).toBeLessThan(0.3);
  expect(extendedSupports[0].visibility).toBeGreaterThan(0.7);
  expect(slothHandReach(extendedSupports[0])).toBeGreaterThan(slothHandReach(earlySupports[0]) + 2);
  const localEarly = earlySupports.map((hand) => slothHandLocal(result.firstPairEarly, hand)).sort((a, b) => a.x - b.x);
  const localExtended = extendedSupports.map((hand) => slothHandLocal(result.firstPairExtended, hand)).sort((a, b) => a.x - b.x);
  expect(localEarly[0].x).toBeCloseTo(-localEarly[1].x, 2);
  expect(localEarly[0].z).toBeCloseTo(localEarly[1].z, 2);
  expect(localExtended[0].x).toBeCloseTo(-localExtended[1].x, 2);
  expect(localExtended[0].z).toBeCloseTo(localExtended[1].z, 2);
  expect([0, 2, 4, 6, 8, 10, 12]).toContain(result.rising.supportHandCount);
  expect(result.spider).toMatchObject({
    phase: 2,
    action: "idle",
    raised: true,
    walkingOnLegs: false,
    model: { humanBodyIntact: true },
    supportHandCount: 12,
    orbitShieldHandCount: 2,
    transientHandCount: 0,
    activeHandCount: 14,
    connectedHandCount: 14,
    spiderTuning: {
      supportHandCount: 12,
      supportHandsPerSide: 6,
      supportHandScale: 1.14,
      supportLimbThicknessScale: 0.82,
      liftHeight: 4.55,
    },
  });
  expect(result.spider.hands).toHaveLength(14);
  const spiderSupports = result.spider.hands.filter((hand) => hand.kind === "support");
  const spiderOrbitShields = result.spider.hands.filter((hand) => hand.kind === "orbitShield");
  expect(spiderSupports).toHaveLength(12);
  expect(spiderSupports.every((hand) => hand.connected)).toBe(true);
  expect(spiderOrbitShields).toHaveLength(2);
  const elbowAngles = spiderSupports.map(slothElbowAngle);
  const averageElbowAngle = elbowAngles.reduce((sum, angle) => sum + angle, 0) / elbowAngles.length;
  expect(Math.max(...elbowAngles)).toBeLessThan(2.75);
  expect(averageElbowAngle).toBeLessThan(2.55);
  const elbowLocals = spiderSupports.map((hand) => slothHandElbowLocal(result.spider, hand));
  for (const sideElbows of [
    elbowLocals.filter((elbow) => elbow.x < 0),
    elbowLocals.filter((elbow) => elbow.x > 0),
  ]) {
    const ordered = sideElbows.sort((a, b) => a.z - b.z);
    const heightSpread = Math.max(...ordered.map((elbow) => elbow.y)) - Math.min(...ordered.map((elbow) => elbow.y));
    const minimumNeighborDistance = Math.min(...ordered.slice(1).map((elbow, index) => Math.hypot(
      elbow.x - ordered[index].x,
      elbow.z - ordered[index].z
    )));
    expect(ordered).toHaveLength(6);
    expect(ordered.at(-1).z - ordered[0].z).toBeGreaterThan(9);
    expect(minimumNeighborDistance).toBeGreaterThan(0.82);
    expect(heightSpread).toBeGreaterThan(0.6);
    expect(heightSpread).toBeLessThan(0.9);
  }
  expect(spiderSupports.every((hand) => hand.elbowY > hand.rootY + 1.2)).toBe(true);
  expect(Math.min(...spiderSupports.map(slothHandReach))).toBeGreaterThan(9.5);
  const spiderLocals = spiderSupports.map((hand) => slothHandLocal(result.spider, hand));
  expect(spiderLocals.filter((hand) => hand.x < 0).length).toBe(6);
  expect(spiderLocals.filter((hand) => hand.x > 0).length).toBe(6);
  expect(Math.max(...spiderLocals.map((hand) => Math.abs(hand.x)))).toBeGreaterThan(8);
  expect(Math.max(...spiderLocals.map((hand) => hand.z)) - Math.min(...spiderLocals.map((hand) => hand.z))).toBeGreaterThan(16);
  expect(result.spider.model.actorY).toBeGreaterThan(4.4);
  expect(result.sideDamage).toBe(0);
  expect(result.side.lastDamageResult).toBe("blocked");
  expect(result.frontDamage).toBe(20);
  expect(result.rearDamage).toBe(20);
  expect(result.open.lastDamageResult).toBe("applied");
  expect(result.open.hp).toBe(result.spider.hp - 40);
});

test("the spider phase enlarges the overhead dodge zone without restoring distance limits", async ({ page }) => {
  await startHunt(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const restart = (spider) => {
      game.startWaveNow(10, "slothArchbishop");
      game.clearEnemies();
      game.setSlothArchbishopAiEnabled(false);
      game.setPlayerMaxHp(500, 500);
      if (spider) {
        game.forceSlothArchbishopAction("spider");
        game.advanceSlothArchbishop(1900);
      }
      return game.getSlothArchbishopDiagnostics();
    };
    const placeAcrossMap = (boss) => game.setPlayerPosition(
      boss.x >= 0 ? -220 : 220,
      boss.z >= 0 ? -180 : 180
    );

    let boss = restart(false);
    const normalSweepPosition = placeAcrossMap(boss);
    const normalSweepStart = game.forceSlothArchbishopAction("sweep");
    game.advanceSlothArchbishop(720);
    const normalSweep = game.getPlayerHealth();

    boss = restart(true);
    const spiderSweepPosition = placeAcrossMap(boss);
    const spiderSweepStart = game.forceSlothArchbishopAction("sweep");
    game.advanceSlothArchbishop(600);
    const spiderSweep = game.getPlayerHealth();

    boss = restart(false);
    placeAcrossMap(boss);
    const normalSkyStart = game.forceSlothArchbishopAction("overhead");
    const normalSkyTarget = normalSkyStart.slamTargets[0];
    const normalSkyPosition = game.setPlayerPosition(normalSkyTarget.x + 5.1, normalSkyTarget.z);
    game.advanceSlothArchbishop(1400);
    const normalSky = game.getPlayerHealth();

    boss = restart(true);
    placeAcrossMap(boss);
    const spiderSkyStart = game.forceSlothArchbishopAction("overhead");
    const spiderSkyTarget = spiderSkyStart.slamTargets[0];
    const spiderSkyPosition = game.setPlayerPosition(spiderSkyTarget.x + 5.1, spiderSkyTarget.z);
    game.advanceSlothArchbishop(1120);
    const spiderSky = game.getPlayerHealth();

    boss = restart(true);
    const grabPosition = placeAcrossMap(boss);
    const grabStart = game.forceSlothArchbishopAction("grab");
    const grabImpact = game.advanceSlothArchbishop(650);

    return {
      tuning: grabStart.attackTuning,
      normalSweep,
      spiderSweep,
      normalSweepDistance: Math.hypot(normalSweepPosition.x - normalSweepStart.x, normalSweepPosition.z - normalSweepStart.z),
      spiderSweepDistance: Math.hypot(spiderSweepPosition.x - spiderSweepStart.x, spiderSweepPosition.z - spiderSweepStart.z),
      normalSky,
      spiderSky,
      normalSkyOffset: Math.hypot(normalSkyPosition.x - normalSkyTarget.x, normalSkyPosition.z - normalSkyTarget.z),
      spiderSkyOffset: Math.hypot(spiderSkyPosition.x - spiderSkyTarget.x, spiderSkyPosition.z - spiderSkyTarget.z),
      grabDistance: Math.hypot(grabPosition.x - grabStart.x, grabPosition.z - grabStart.z),
      grabImpact,
    };
  });

  expect(result.tuning).toMatchObject({
    attackRangeUnlimited: true,
    targetsAllLivingPlayers: true,
    simultaneousTargets: true,
    sweepTargetRadius: 2.8,
    skySlamRadius: 5.6,
  });
  expect(result.normalSweepDistance).toBeGreaterThan(150);
  expect(result.spiderSweepDistance).toBeGreaterThan(150);
  expect(result.normalSweep.hp).toBeLessThan(500);
  expect(result.spiderSweep.hp).toBeLessThan(500);
  expect(result.normalSkyOffset).toBeGreaterThan(5);
  expect(result.spiderSkyOffset).toBeGreaterThan(5);
  expect(result.normalSky.hp).toBe(500);
  expect(result.spiderSky.hp).toBeLessThan(500);
  expect(result.grabDistance).toBeGreaterThan(150);
  expect(result.grabImpact.throwing).toBe(true);
  expect(slothGrabElbowSideReach(result.grabImpact)).toBeLessThanOrEqual(2.8);
});

test("the phase-three grab tracks its locked player and drags them far without damage", async ({ page }) => {
  await startHunt(page);
  await startSlothArchbishop(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    game.forceSlothArchbishopAction("spider");
    const spider = game.advanceSlothArchbishop(1900);
    const forwardX = Math.sin(spider.facingAngle);
    const forwardZ = Math.cos(spider.facingAngle);
    const rightX = Math.cos(spider.facingAngle);
    const rightZ = -Math.sin(spider.facingAngle);
    game.setPlayerMaxHp(300, 300);
    game.setPlayerPosition(spider.x + forwardX * 8, spider.z + forwardZ * 8);
    const beforeHealth = game.getPlayerHealth();
    const grab = game.forceSlothArchbishopAction("grab");
    game.advanceSlothArchbishop(300);
    game.setPlayerPosition(
      spider.x - forwardX * 7 + rightX * 8,
      spider.z - forwardZ * 7 + rightZ * 8
    );
    const evaded = JSON.parse(window.render_game_to_text()).player;
    const trackedBeforeImpact = game.advanceSlothArchbishop(300);
    const trackedPlayer = JSON.parse(window.render_game_to_text()).player;
    const airborne = game.advanceSlothArchbishop(80);
    const during = JSON.parse(window.render_game_to_text()).player;
    const midThrow = game.advanceSlothArchbishop(350);
    const midPlayer = JSON.parse(window.render_game_to_text()).player;
    const after = game.advanceSlothArchbishop(1200);
    const landed = JSON.parse(window.render_game_to_text()).player;
    const afterHealth = game.getPlayerHealth();
    return {
      beforeHealth,
      grab,
      evaded,
      trackedBeforeImpact,
      trackedPlayer,
      airborne,
      during,
      midThrow,
      midPlayer,
      after,
      landed,
      afterHealth,
    };
  });

  expect(result.grab).toMatchObject({
    phase: 2,
    action: "grab",
    supportHandCount: 12,
    orbitShieldHandCount: 2,
    transientHandCount: 2,
    activeHandCount: 16,
    connectedHandCount: 16,
    attackTuning: {
      grabRange: 14.5,
      throwDistance: 36,
      throwDuration: 1.04,
      phaseThreeGrabDuration: 1.72,
      grabGuaranteedAfterLock: true,
    },
  });
  expect(result.trackedBeforeImpact.throwing).toBe(false);
  const grabCenterDistance = (sample, player) => {
    const hands = sample.hands.filter((hand) => hand.kind === "grab");
    const centerX = hands.reduce((sum, hand) => sum + hand.palmX, 0) / hands.length;
    const centerZ = hands.reduce((sum, hand) => sum + hand.palmZ, 0) / hands.length;
    return Math.hypot(centerX - player.x, centerZ - player.z);
  };
  const grabPalmSeparation = (sample) => {
    const hands = sample.hands.filter((hand) => hand.kind === "grab");
    return Math.hypot(hands[0].palmX - hands[1].palmX, hands[0].palmZ - hands[1].palmZ);
  };
  const grippingFingerCounts = (sample, player) => sample.hands
    .filter((hand) => hand.kind === "grab")
    .map((hand) => hand.fingerTips.filter((tip) => Math.hypot(tip.x - player.x, tip.z - player.z) < 0.86).length);
  expect(grabCenterDistance(result.trackedBeforeImpact, result.trackedPlayer)).toBeLessThan(0.8);
  expect(grabPalmSeparation(result.trackedBeforeImpact)).toBeGreaterThan(1.1);
  expect(grabPalmSeparation(result.trackedBeforeImpact)).toBeLessThan(1.4);
  expect(result.trackedBeforeImpact.hands.filter((hand) => hand.kind === "grab").every((hand) => hand.curl > 0.92)).toBe(true);
  expect(grippingFingerCounts(result.trackedBeforeImpact, result.trackedPlayer).every((count) => count >= 3)).toBe(true);
  expect(result.airborne).toMatchObject({ action: "grab", throwing: true });
  expect(result.airborne.throwTargetId).not.toBe("");
  expect(grabCenterDistance(result.airborne, result.during)).toBeLessThan(0.8);
  expect(result.midThrow).toMatchObject({ action: "grab", throwing: true });
  expect(grabCenterDistance(result.midThrow, result.midPlayer)).toBeLessThan(0.8);
  expect(grabPalmSeparation(result.midThrow)).toBeGreaterThan(1.1);
  expect(grabPalmSeparation(result.midThrow)).toBeLessThan(1.4);
  expect(grippingFingerCounts(result.midThrow, result.midPlayer).every((count) => count >= 3)).toBe(true);
  expect(result.after).toMatchObject({ phase: 2, action: "idle", throwing: false });
  expect(Math.hypot(
    result.landed.x - result.evaded.x,
    result.landed.z - result.evaded.z
  )).toBeGreaterThan(33);
  expect(result.afterHealth).toEqual(result.beforeHealth);
});

test("spectral hands stay continuous across sweep, grab, rise, and death boundaries", async ({ page }) => {
  await startHunt(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const restart = () => {
      game.startWaveNow(10, "slothArchbishop");
      game.clearEnemies();
      game.setSlothArchbishopAiEnabled(false);
      game.setPlayerMaxHp(1000, 1000);
    };

    restart();
    const sweepStart = game.forceSlothArchbishopAction("sweep");
    const sweepMiddle = game.advanceSlothArchbishop(600);
    const sweepEnd = game.advanceSlothArchbishop(600);

    restart();
    game.forceSlothArchbishopAction("spider");
    const grabBaseline = game.advanceSlothArchbishop(1900);
    const forwardX = Math.sin(grabBaseline.facingAngle);
    const forwardZ = Math.cos(grabBaseline.facingAngle);
    game.setPlayerPosition(grabBaseline.x + forwardX * 4, grabBaseline.z + forwardZ * 4);
    const grabStart = game.forceSlothArchbishopAction("grab");
    const grabMiddle = game.advanceSlothArchbishop(600);
    const grabEnd = game.advanceSlothArchbishop(1110);

    restart();
    game.forceSlothArchbishopAction("spider");
    const riseBefore = game.advanceSlothArchbishop(1780);
    const riseAfter = game.advanceSlothArchbishop(80);

    restart();
    game.forceSlothArchbishopAction("spider");
    game.advanceSlothArchbishop(1900);
    game.forceActiveBossDefeat();
    const deathStart = game.advanceSlothArchbishop(1);
    const deathEarly = game.advanceSlothArchbishop(700);
    const deathMiddle = game.advanceSlothArchbishop(900);
    const deathImpact = game.advanceSlothArchbishop(700);
    const deathLate = game.advanceSlothArchbishop(1300);
    const deathGone = game.advanceSlothArchbishop(600);

    return {
      sweepStart,
      sweepMiddle,
      sweepEnd,
      grabBaseline,
      grabStart,
      grabMiddle,
      grabEnd,
      riseBefore,
      riseAfter,
      death: [deathStart, deathEarly, deathMiddle, deathImpact, deathLate, deathGone],
    };
  });

  const sweepSamples = [result.sweepStart, result.sweepMiddle, result.sweepEnd];
  const sweepHands = sweepSamples.map((sample) => sample.hands.find((hand) => hand.kind === "sweep"));
  expect(sweepHands.every(Boolean)).toBe(true);
  const sweepRoots = sweepHands.map((hand, index) => slothHandRootLocal(sweepSamples[index], hand));
  for (let index = 0; index < sweepRoots.length; index += 1) {
    const actorScale = sweepSamples[index].model.actorScale;
    expect(sweepRoots[index].x).toBeCloseTo(-1.32 * actorScale, 2);
    // The socket now follows the small authored torso turn during the sweep,
    // so it may leave the old world-space Z axis while remaining glued to the
    // shoulder throughout the motion.
    expect(Math.abs(sweepRoots[index].z)).toBeLessThan(0.06);
  }
  expect(sweepHands[0].visibility).toBeLessThan(0.05);
  expect(sweepHands[1].visibility).toBeGreaterThan(0.95);
  expect(result.sweepEnd.actionProgress).toBeGreaterThan(0.95);
  expect(sweepHands[2].visibility).toBeLessThan(0.05);

  const baselineSupports = result.grabBaseline.hands.filter((hand) => hand.kind === "support");
  const sortedGrabHands = (sample) => sample.hands
    .filter((hand) => hand.kind === "grab")
    .sort((a, b) => slothHandLocal(sample, a).x - slothHandLocal(sample, b).x);
  const grabStartHands = sortedGrabHands(result.grabStart);
  const grabMiddleHands = sortedGrabHands(result.grabMiddle);
  const grabEndHands = sortedGrabHands(result.grabEnd);
  expect(baselineSupports).toHaveLength(12);
  expect(grabStartHands).toHaveLength(2);
  expect(grabMiddleHands).toHaveLength(2);
  expect(grabEndHands).toHaveLength(2);
  expect(result.grabStart.actionProgress).toBe(0);
  expect(result.grabEnd.actionProgress).toBeGreaterThan(0.95);
  expect(result.grabStart).toMatchObject({ supportHandCount: 12, orbitShieldHandCount: 2, transientHandCount: 2, activeHandCount: 16 });
  expect(result.grabMiddle).toMatchObject({ supportHandCount: 12, orbitShieldHandCount: 2, transientHandCount: 2, activeHandCount: 16 });
  expect(grabStartHands.every((hand) => hand.visibility < 0.05)).toBe(true);
  expect(grabMiddleHands.every((hand) => hand.visibility > 0.95)).toBe(true);
  expect(grabEndHands.every((hand) => hand.visibility < 0.05)).toBe(true);
  for (const hand of grabMiddleHands) {
    const nearestSupportRoot = Math.min(...baselineSupports.map((support) => Math.hypot(
      hand.rootX - support.rootX,
      hand.rootY - support.rootY,
      hand.rootZ - support.rootZ
    )));
    expect(nearestSupportRoot).toBeGreaterThan(0.14);
    expect(slothHandReach(hand)).toBeGreaterThan(4);
  }

  expect(result.riseBefore).toMatchObject({ phase: 1, action: "spiderRise", supportHandCount: 12 });
  expect(result.riseBefore.actionProgress).toBeGreaterThan(0.95);
  expect(result.riseAfter).toMatchObject({ phase: 2, action: "idle", supportHandCount: 12 });
  const rootYs = [result.riseBefore, result.riseAfter]
    .flatMap((sample) => sample.hands.filter((hand) => hand.kind === "support").map((hand) => hand.rootY));
  expect(Math.max(...rootYs) - Math.min(...rootYs)).toBeLessThan(0.03);

  const deathVisibilities = result.death.map((sample) => {
    const supports = sample.hands.filter((hand) => hand.kind === "support");
    return supports.length
      ? supports.reduce((sum, hand) => sum + hand.visibility, 0) / supports.length
      : 0;
  });
  expect(result.death.map((sample) => sample.supportHandCount)).toEqual([12, 12, 12, 12, 12, 0]);
  expect(deathVisibilities[0]).toBeGreaterThan(0.95);
  expect(deathVisibilities[1]).toBeGreaterThan(0.95);
  expect(deathVisibilities[2]).toBeGreaterThan(0.95);
  expect(deathVisibilities[3]).toBeLessThan(deathVisibilities[2]);
  expect(deathVisibilities[4]).toBeLessThan(deathVisibilities[3]);
  expect(deathVisibilities[4]).toBeLessThan(0.25);
  expect(deathVisibilities[5]).toBe(0);

  const deathActorYs = result.death.map((sample) => sample.model.actorY);
  const deathActorRolls = result.death.map((sample) => sample.model.actorRotationZ);
  expect(deathActorYs[0]).toBeGreaterThan(3.2);
  expect(deathActorYs[2]).toBeLessThan(deathActorYs[1]);
  expect(deathActorYs[3]).toBeLessThan(0.9);
  expect(deathActorRolls[1]).toBeLessThan(0.2);
  expect(deathActorRolls[3]).toBeGreaterThan(0.7);
  expect(deathActorRolls[4]).toBeGreaterThan(1.45);
  expect(result.death[4].model.humanBodyIntact).toBe(true);
  expect(result.death.map((sample) => sample.deathStage)).toEqual([0, 0, 1, 2, 3, 3]);

  const supportElbowAverage = (sample) => {
    const supports = sample.hands.filter((hand) => hand.kind === "support");
    return supports.reduce((sum, hand) => sum + hand.elbowY, 0) / Math.max(1, supports.length);
  };
  const supportWristSpread = (sample) => {
    const wrists = sample.hands.filter((hand) => hand.kind === "support").map((hand) => hand.wristY);
    return wrists.length ? Math.max(...wrists) - Math.min(...wrists) : 0;
  };
  expect(supportElbowAverage(result.death[2])).toBeLessThan(supportElbowAverage(result.death[0]) - 1.5);
  expect(supportWristSpread(result.death[2])).toBeLessThan(0.02);
  const impactVisibilities = result.death[3].hands
    .filter((hand) => hand.kind === "support")
    .map((hand) => hand.visibility.toFixed(3));
  expect(new Set(impactVisibilities).size).toBeGreaterThan(2);
});

test("all spectral hands reuse one fixed instanced render pool across attack churn", async ({ page }) => {
  await startHunt(page);
  await startSlothArchbishop(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    game.forceSlothArchbishopAction("spider");
    game.advanceSlothArchbishop(1900);
    game.forceSlothArchbishopAction("overhead");
    game.advanceSlothArchbishop(400);
    game.forceSlothArchbishopAction("grab");
    game.advanceSlothArchbishop(400);
    const warm = game.getSlothArchbishopDiagnostics();
    const actions = [
      "overhead", "grab", "guard", "sweep",
      "clap", "lazy-grip", "four-sides", "cross",
    ];
    const samples = [];
    for (let index = 0; index < 32; index += 1) {
      game.forceSlothArchbishopAction(actions[index % actions.length]);
      game.advanceSlothArchbishop(34);
      samples.push(game.getSlothArchbishopDiagnostics());
    }
    return { warm, samples, final: game.getSlothArchbishopDiagnostics() };
  });

  expect(result.warm.renderPool).toMatchObject({
    modelDrawItems: 16,
    legacyModelDrawItems: 57,
    savedModelDrawItems: 41,
    handDrawItems: 3,
    telegraphDrawItems: 2,
    handCapacity: 352,
    logicalHandPoolSize: 30,
    logicalTelegraphPoolSize: 16,
    pointScratchSize: 96,
    instanced: true,
  });
  expect(result.warm.renderPool.modelTriangles).toBeLessThanOrEqual(2200);
  for (const sample of result.samples) {
    expect(sample.renderPool).toMatchObject({
      handDrawItems: 3,
      telegraphDrawItems: 2,
      handCapacity: 352,
      instanced: true,
    });
    expect(sample.handPartInstances).toBeLessThanOrEqual(352);
    expect(sample.activeHandCount).toBeLessThanOrEqual(30);
  }
  expect(result.final.renderPool.geometries).toBe(result.warm.renderPool.geometries);
  expect(result.final.renderPool.textures).toBe(result.warm.renderPool.textures);
  expect(result.final.renderPool.matrixUploads).toBeGreaterThan(result.warm.renderPool.matrixUploads);
});

test("idle Archbishop frames skip empty hand and telegraph buffer uploads", async ({ page }) => {
  await startHunt(page);
  await startSlothArchbishop(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const before = game.getSlothArchbishopDiagnostics();
    const idle = game.advanceSlothArchbishop(1000);
    game.forceSlothArchbishopAction("overhead");
    const attacking = game.advanceSlothArchbishop(250);
    return { before, idle, attacking };
  });

  expect(result.idle).toMatchObject({
    action: "sleep",
    activeHandCount: 0,
    telegraphCount: 0,
  });
  expect(result.idle.renderPool.matrixUploads).toBe(result.before.renderPool.matrixUploads);
  expect(result.idle.renderPool.telegraphMatrixUploads).toBe(result.before.renderPool.telegraphMatrixUploads);
  expect(result.idle.renderPool.skippedHandMatrixUploads).toBeGreaterThan(
    result.before.renderPool.skippedHandMatrixUploads
  );
  expect(result.idle.renderPool.skippedTelegraphMatrixUploads).toBeGreaterThan(
    result.before.renderPool.skippedTelegraphMatrixUploads
  );
  expect(result.attacking.activeHandCount).toBeGreaterThan(0);
  expect(result.attacking.telegraphCount).toBeGreaterThan(0);
  expect(result.attacking.renderPool.matrixUploads).toBeGreaterThan(result.idle.renderPool.matrixUploads);
  expect(result.attacking.renderPool.telegraphMatrixUploads).toBeGreaterThan(
    result.idle.renderPool.telegraphMatrixUploads
  );
});

test("the compact Archbishop packet decodes the current phase and connected overhead target", async ({ page }) => {
  await startHunt(page);
  await startSlothArchbishop(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    game.forceSlothArchbishopAction("overhead");
    const host = game.advanceSlothArchbishop(400);
    const packed = game.getSlothArchbishopPackedWireDiagnostics();
    return { host, packed };
  });

  expect(result.packed.regularBytes).toBeLessThanOrEqual(128);
  expect(result.packed.keyframeBytes).toBeLessThanOrEqual(128);
  expect(result.packed.regularDecoded.valid).toBe(true);
  expect(result.packed.keyframeDecoded.valid).toBe(true);
  const regular = result.packed.regularDecoded.data;
  const keyframe = result.packed.keyframeDecoded.data;
  expect(regular).toMatchObject({
    id: "sloth-archbishop",
    kind: "slothArchbishop",
    active: true,
    phase: 1,
    action: "skySlam",
    actionSeq: result.host.actionSequence,
    hp: result.host.hp,
    maxHp: result.host.maxHp,
  });
  expect(regular.slamTargets).toHaveLength(1);
  expect(regular.orbitShieldVisibility).toBe(0);
  expect(regular.slamTargets[0]).toMatchObject({
    id: result.host.slamTargets[0].id,
    resolved: false,
  });
  expect(regular.x).toBeCloseTo(result.host.x, 1);
  expect(regular.z).toBeCloseTo(result.host.z, 1);
  expect(keyframe).toEqual(regular);
});

test("the four new attack states and their captured marks survive compact multiplayer packets", async ({ page }) => {
  await startHunt(page);
  await startSlothArchbishop(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const samples = [];
    for (const action of ["clap", "lazy-grip", "four-sides", "cross"]) {
      const boss = game.getSlothArchbishopDiagnostics();
      game.setPlayerPosition(
        boss.x + Math.sin(boss.facingAngle) * 7,
        boss.z + Math.cos(boss.facingAngle) * 7
      );
      const host = game.forceSlothArchbishopAction(action);
      const packed = game.getSlothArchbishopPackedWireDiagnostics();
      samples.push({
        host,
        bytes: packed.regularBytes,
        regular: packed.regularDecoded,
        keyframe: packed.keyframeDecoded,
      });
    }
    return samples;
  });

  expect(result.map((sample) => sample.regular.data.action)).toEqual([
    "prayerClap",
    "lazyGrip",
    "fourSides",
    "crossSweep",
  ]);
  expect(result.map((sample) => sample.regular.data.phase)).toEqual([1, 1, 2, 2]);
  expect(result.map((sample) => sample.regular.data.slamTargets.length)).toEqual([1, 1, 1, 1]);
  expect(result.map((sample) => sample.regular.data.orbitShieldVisibility)).toEqual([0, 0, 1, 1]);
  for (const sample of result) {
    expect(sample.bytes).toBeLessThanOrEqual(128);
    expect(sample.regular.valid).toBe(true);
    expect(sample.keyframe.valid).toBe(true);
    expect(sample.keyframe.data).toEqual(sample.regular.data);
    expect(sample.regular.data.actionSeq).toBe(sample.host.actionSequence);
  }
});

test("a guest reconstructs the same optimized four-sides animation frame", async ({ page }) => {
  await startHunt(page);

  const host = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const multiplayer = window.__dustMultiplayerTest;
    multiplayer.startMockHost(["Host", "Guest"]);
    game.startWaveNow(10, "slothArchbishop");
    game.clearEnemies();
    game.setSlothArchbishopAiEnabled(false);
    game.forceSlothArchbishopAction("spider");
    game.advanceSlothArchbishop(1900);
    game.forceSlothArchbishopAction("four-sides");
    const frame = game.advanceSlothArchbishop(420);
    return {
      frame,
      wire: JSON.parse(JSON.stringify(multiplayer.buildWireSnapshot(false, false, "mock-player-2"))),
    };
  });

  const guest = await page.evaluate((wire) => {
    const multiplayer = window.__dustMultiplayerTest;
    multiplayer.startMockGuest(["Host", "Guest"], 1);
    multiplayer.applySnapshot(wire);
    return window.__dustAndDeadTest.getSlothArchbishopDiagnostics();
  }, host.wire);

  expect(guest).toMatchObject({
    replica: true,
    phase: host.frame.phase,
    action: host.frame.action,
    actionSequence: host.frame.actionSequence,
    supportHandCount: host.frame.supportHandCount,
    orbitShieldHandCount: host.frame.orbitShieldHandCount,
    transientHandCount: host.frame.transientHandCount,
    activeHandCount: host.frame.activeHandCount,
  });
  expect(Math.abs(guest.actionProgress - host.frame.actionProgress)).toBeLessThanOrEqual(0.012);
  expect(guest.renderPool).toMatchObject({
    modelDrawItems: 16,
    handDrawItems: 3,
    telegraphDrawItems: 2,
    instanced: true,
  });

  expect(guest.orbitShield).toMatchObject({
    unlocked: true,
    active: true,
    palmsOpposed: true,
    palmsFaceOutward: true,
  });
  const hostOrbitHands = host.frame.hands.filter((hand) => hand.kind === "orbitShield");
  const guestOrbitHands = guest.hands.filter((hand) => hand.kind === "orbitShield");
  expect(hostOrbitHands).toHaveLength(2);
  expect(guestOrbitHands).toHaveLength(2);
  expect(Math.abs(Math.atan2(
    Math.sin(guest.orbitShield.angle - host.frame.orbitShield.angle),
    Math.cos(guest.orbitShield.angle - host.frame.orbitShield.angle)
  ))).toBeLessThan(0.02);
  for (let index = 0; index < hostOrbitHands.length; index += 1) {
    for (const coordinate of ["elbowX", "elbowY", "elbowZ", "wristX", "wristY", "wristZ", "palmX", "palmY", "palmZ"]) {
      expect(Math.abs(guestOrbitHands[index][coordinate] - hostOrbitHands[index][coordinate])).toBeLessThan(0.16);
    }
    expect(guestOrbitHands[index].pitch).toBeCloseTo(hostOrbitHands[index].pitch, 3);
  }

  const hostAttackHands = host.frame.hands.filter((hand) => hand.kind === "fourSides");
  const guestAttackHands = guest.hands.filter((hand) => hand.kind === "fourSides");
  expect(guestAttackHands).toHaveLength(hostAttackHands.length);
  expect(guestAttackHands.map((hand) => hand.targetId)).toEqual(
    hostAttackHands.map((hand) => hand.targetId)
  );
  for (let index = 0; index < hostAttackHands.length; index += 1) {
    for (const coordinate of [
      "rootX", "rootY", "rootZ",
      "elbowX", "elbowY", "elbowZ",
      "wristX", "wristY", "wristZ",
      "palmX", "palmY", "palmZ",
    ]) {
      expect(
        Math.abs(guestAttackHands[index][coordinate] - hostAttackHands[index][coordinate]),
        `hand ${index} ${coordinate}`
      ).toBeLessThan(0.35);
    }
  }
  expect(guest.telegraphs.map((telegraph) => telegraph.kind)).toEqual(
    host.frame.telegraphs.map((telegraph) => telegraph.kind)
  );
});

test("guest boss movement remains smooth through uneven and dropped-rate position samples", async ({ page }) => {
  await startHunt(page);

  const host = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const multiplayer = window.__dustMultiplayerTest;
    multiplayer.startMockHost(["Host", "Guest"]);
    game.startWaveNow(10, "slothArchbishop");
    game.clearEnemies();
    game.setSlothArchbishopAiEnabled(false);
    game.forceSlothArchbishopAction("spider");
    const spider = game.advanceSlothArchbishop(1900);
    multiplayer.setPlayerPosition("mock-player-1", spider.x + 150, spider.z + 150);
    multiplayer.setPlayerPosition("mock-player-2", spider.x + 150, spider.z - 150);
    game.setSlothArchbishopAiEnabled(true);
    const intervals = [67, 67, 134, 50, 100, 67, 133, 67, 67, 100];
    const snapshots = [];
    for (const interval of intervals) {
      const frame = game.advanceSlothArchbishop(interval);
      snapshots.push({
        interval,
        frame,
        wire: JSON.parse(JSON.stringify(multiplayer.buildWireSnapshot(false, false, "mock-player-2"))),
      });
    }
    return { snapshots };
  });

  const guest = await page.evaluate((stream) => {
    const game = window.__dustAndDeadTest;
    const multiplayer = window.__dustMultiplayerTest;
    multiplayer.startMockGuest(["Host", "Guest"], 1);
    const samples = [];
    const boundaryJumps = [];
    const orbitBoundaryJumps = [];
    const capture = () => {
      const frame = game.getSlothArchbishopDiagnostics();
      const orbitHand = (frame.hands || []).find((hand) => hand.kind === "orbitShield");
      return { frame, orbitHand };
    };
    for (let index = 0; index < stream.length; index += 1) {
      if (index > 0) {
        const steps = Math.max(1, Math.round(stream[index].interval / 17));
        for (let step = 0; step < steps; step += 1) {
          const frame = game.advanceSlothArchbishop(17);
          samples.push({ x: frame.x, z: frame.z });
        }
      }
      const before = capture();
      multiplayer.applySnapshot(stream[index].wire);
      const after = capture();
      if (index > 0) {
        boundaryJumps.push(Math.hypot(
          after.frame.x - before.frame.x,
          after.frame.z - before.frame.z
        ));
        if (before.orbitHand && after.orbitHand) {
          orbitBoundaryJumps.push(Math.hypot(
            after.orbitHand.palmX - before.orbitHand.palmX,
            after.orbitHand.palmY - before.orbitHand.palmY,
            after.orbitHand.palmZ - before.orbitHand.palmZ
          ));
        }
      }
      samples.push({ x: after.frame.x, z: after.frame.z });
    }
    return {
      samples,
      boundaryJumps,
      orbitBoundaryJumps,
      final: game.getSlothArchbishopDiagnostics(),
    };
  }, host.snapshots);

  const steps = guest.samples.slice(1).map((sample, index) => Math.hypot(
    sample.x - guest.samples[index].x,
    sample.z - guest.samples[index].z
  ));
  const movingSteps = steps.slice(8).filter((distance) => distance > 0.002);
  const guestTravel = Math.hypot(
    guest.samples.at(-1).x - guest.samples[0].x,
    guest.samples.at(-1).z - guest.samples[0].z
  );
  const hostFinal = host.snapshots.at(-1).frame;
  expect(Math.max(...guest.boundaryJumps)).toBeLessThan(0.02);
  expect(Math.max(...guest.orbitBoundaryJumps)).toBeLessThan(0.15);
  expect(Math.max(...steps)).toBeLessThan(0.16);
  expect(movingSteps.length).toBeGreaterThan(steps.slice(8).length * 0.72);
  expect(guestTravel).toBeGreaterThan(1.2);
  expect(Math.hypot(guest.final.x - hostFinal.x, guest.final.z - hostFinal.z)).toBeLessThan(1.4);
  expect(guest.final.networkInterpolation).toMatchObject({
    snapshotHz: 15,
    bufferedBossMotion: true,
    monotonicActionClock: true,
  });
  expect(guest.final).toMatchObject({ supportHandCount: 12, orbitShieldHandCount: 2 });
});

test("guest hand animation never rewinds or jumps at 15 Hz packet boundaries", async ({ page }) => {
  await startHunt(page);

  const host = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const multiplayer = window.__dustMultiplayerTest;
    multiplayer.startMockHost(["Host", "Guest"]);
    game.startWaveNow(10, "slothArchbishop");
    game.clearEnemies();
    game.setSlothArchbishopAiEnabled(false);
    const boss = game.getSlothArchbishopDiagnostics();
    multiplayer.setPlayerPosition("mock-player-2", boss.x + 210, boss.z + 170);
    game.forceSlothArchbishopAction("sweep");
    const snapshots = [];
    for (let index = 0; index < 12; index += 1) {
      const frame = game.advanceSlothArchbishop(67);
      const wire = JSON.parse(JSON.stringify(multiplayer.buildWireSnapshot(false, false, "mock-player-2")));
      snapshots.push({
        frame,
        wire,
        bytes: Uint8Array.from(atob(wire.bossState), (char) => char.charCodeAt(0)).length,
      });
    }
    return snapshots;
  });

  const guest = await page.evaluate((stream) => {
    const game = window.__dustAndDeadTest;
    const multiplayer = window.__dustMultiplayerTest;
    multiplayer.startMockGuest(["Host", "Guest"], 1);
    const progress = [];
    const progressErrors = [];
    const boundaryPalmJumps = [];
    const capture = () => {
      const frame = game.getSlothArchbishopDiagnostics();
      const hand = (frame.hands || []).find((candidate) => (
        candidate.kind === "sweep" && candidate.targetId === "mock-player-2"
      ));
      return { frame, hand };
    };
    for (let index = 0; index < stream.length; index += 1) {
      const before = capture();
      multiplayer.applySnapshot(stream[index].wire);
      const after = capture();
      if (index > 0 && before.hand && after.hand) {
        boundaryPalmJumps.push(Math.hypot(
          after.hand.palmX - before.hand.palmX,
          after.hand.palmY - before.hand.palmY,
          after.hand.palmZ - before.hand.palmZ
        ));
      }
      progress.push(after.frame.actionProgress);
      progressErrors.push(Math.abs(after.frame.actionProgress - stream[index].frame.actionProgress));
      for (let step = 0; step < 4; step += 1) {
        const frame = game.advanceSlothArchbishop(17);
        progress.push(frame.actionProgress);
      }
    }
    return {
      progress,
      progressErrors,
      boundaryPalmJumps,
      final: game.getSlothArchbishopDiagnostics(),
    };
  }, host);

  for (let index = 1; index < guest.progress.length; index += 1) {
    expect(guest.progress[index]).toBeGreaterThanOrEqual(guest.progress[index - 1] - 0.0001);
  }
  expect(Math.max(...guest.progressErrors)).toBeLessThan(0.035);
  expect(Math.max(...guest.boundaryPalmJumps)).toBeLessThan(0.12);
  expect(Math.max(...host.map((sample) => sample.bytes))).toBeLessThanOrEqual(160);
  expect(guest.final.networkInterpolation.maxActionPhaseError).toBeLessThan(0.08);
  expect(guest.final.networkInterpolation).toMatchObject({
    monotonicActionClock: true,
    orbitAngleSmoothed: true,
  });
});

test("wake carry keeps the player inside a smooth replicated hand arc when packets are skipped", async ({ page }) => {
  await startHunt(page);

  const host = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const multiplayer = window.__dustMultiplayerTest;
    multiplayer.startMockHost(["Host", "Guest"]);
    game.startWaveNow(10, "slothArchbishop");
    game.clearEnemies();
    game.setSlothArchbishopAiEnabled(false);
    const sleeping = game.getSlothArchbishopDiagnostics();
    multiplayer.setPlayerPosition("mock-player-1", sleeping.x - 4, sleeping.z - 5);
    multiplayer.setPlayerPosition("mock-player-2", sleeping.x + 4, sleeping.z - 5);
    multiplayer.setHealth("mock-player-1", 1000);
    multiplayer.setHealth("mock-player-2", 1000);
    const before = multiplayer.getState().players.find((player) => player.id === "mock-player-2");
    game.forceSlothArchbishopAction("wake");
    const snapshots = [];
    let maxPacketBytes = 0;
    for (let index = 0; index < 48; index += 1) {
      const frame = game.advanceSlothArchbishop(67);
      const wire = JSON.parse(JSON.stringify(multiplayer.buildWireSnapshot(false, false, "mock-player-2")));
      maxPacketBytes = Math.max(
        maxPacketBytes,
        Uint8Array.from(atob(wire.bossState), (char) => char.charCodeAt(0)).length
      );
      snapshots.push({ frame, wire });
    }
    const after = multiplayer.getState().players.find((player) => player.id === "mock-player-2");
    return { before, after, snapshots, maxPacketBytes };
  });

  const guest = await page.evaluate((stream) => {
    const game = window.__dustAndDeadTest;
    const multiplayer = window.__dustMultiplayerTest;
    multiplayer.startMockGuest(["Host", "Guest"], 1);
    const boundaryJumps = [];
    const carryProgress = [];
    let maximumLift = 0;
    let sawWakeThrow = false;
    for (let index = 0; index < stream.length; index += 1) {
      if (index > 0) {
        for (let step = 0; step < 4; step += 1) {
          const frame = game.advanceSlothArchbishop(17);
          const wakeThrow = frame.throws.find((thrown) => (
            thrown.kind === "wake" && thrown.id === "mock-player-2"
          ));
          if (wakeThrow) {
            sawWakeThrow = true;
            carryProgress.push(wakeThrow.progress);
            maximumLift = Math.max(maximumLift, wakeThrow.currentY);
          }
        }
      }
      const shouldDrop = index > 0 && index < stream.length - 1 && index % 7 === 3;
      if (shouldDrop) continue;
      const before = multiplayer.getState().players.find((player) => player.id === "mock-player-2");
      multiplayer.applySnapshot(stream[index].wire);
      const after = multiplayer.getState().players.find((player) => player.id === "mock-player-2");
      if (index > 0 && before && after) {
        boundaryJumps.push(Math.hypot(after.x - before.x, after.z - before.z));
      }
      const frame = game.getSlothArchbishopDiagnostics();
      const wakeThrow = frame.throws.find((thrown) => (
        thrown.kind === "wake" && thrown.id === "mock-player-2"
      ));
      if (wakeThrow) {
        sawWakeThrow = true;
        carryProgress.push(wakeThrow.progress);
        maximumLift = Math.max(maximumLift, wakeThrow.currentY);
      }
    }
    const player = multiplayer.getState().players.find((candidate) => candidate.id === "mock-player-2");
    return {
      boundaryJumps,
      carryProgress,
      maximumLift,
      sawWakeThrow,
      player,
      final: game.getSlothArchbishopDiagnostics(),
    };
  }, host.snapshots);

  for (let index = 1; index < guest.carryProgress.length; index += 1) {
    expect(guest.carryProgress[index]).toBeGreaterThanOrEqual(guest.carryProgress[index - 1] - 0.0001);
  }
  expect(guest.sawWakeThrow).toBe(true);
  expect(guest.maximumLift).toBeGreaterThan(4);
  expect(Math.max(...guest.boundaryJumps)).toBeLessThan(0.55);
  expect(Math.hypot(
    guest.player.x - host.before.x,
    guest.player.z - host.before.z
  )).toBeGreaterThan(165);
  expect(guest.player.hp).toBe(host.before.hp);
  expect(host.after.hp).toBe(host.before.hp);
  expect(host.maxPacketBytes).toBeLessThanOrEqual(256);
  expect(guest.final.networkInterpolation).toMatchObject({
    smoothedThrowClock: true,
    wakeCarryArcReplicated: true,
  });
  expect(guest.final.networkInterpolation.maxThrowTimerError).toBeLessThan(0.12);
});

test("a packed grab carries the matching guest player without changing health", async ({ page }) => {
  await startHunt(page);

  const host = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const multiplayer = window.__dustMultiplayerTest;
    multiplayer.startMockHost(["Host", "Guest"]);
    game.startWaveNow(10, "slothArchbishop");
    game.clearEnemies();
    game.setSlothArchbishopAiEnabled(false);
    game.forceSlothArchbishopAction("spider");
    const spider = game.advanceSlothArchbishop(1900);
    const forwardX = Math.sin(spider.facingAngle);
    const forwardZ = Math.cos(spider.facingAngle);
    multiplayer.setPlayerPosition("mock-player-2", spider.x + forwardX * 4, spider.z + forwardZ * 4);
    const before = multiplayer.getState().players.find((player) => player.id === "mock-player-2");
    game.forceSlothArchbishopAction("grab");
    const airborne = game.advanceSlothArchbishop(900);
    const wire = JSON.parse(JSON.stringify(multiplayer.buildWireSnapshot(false, false, "mock-player-2")));
    return {
      before,
      airborne,
      wire,
      decoded: multiplayer.decodeBossState(wire.bossState),
      packetBytes: Uint8Array.from(atob(wire.bossState), (char) => char.charCodeAt(0)).length,
    };
  });

  const guest = await page.evaluate((wire) => {
    const game = window.__dustAndDeadTest;
    const multiplayer = window.__dustMultiplayerTest;
    multiplayer.startMockGuest(["Host", "Guest"], 1);
    multiplayer.applySnapshot(wire);
    const replicated = game.getSlothArchbishopDiagnostics();
    const before = multiplayer.getState().players.find((player) => player.id === "mock-player-2");
    game.advanceSlothArchbishop(900);
    const landed = multiplayer.getState().players.find((player) => player.id === "mock-player-2");
    return { replicated, before, landed, final: game.getSlothArchbishopDiagnostics() };
  }, host.wire);

  expect(host.airborne).toMatchObject({ action: "grab", throwing: true, throwTargetId: "mock-player-2" });
  expect(host.airborne.throwTargetIds).toHaveLength(2);
  expect(new Set(host.airborne.throwTargetIds)).toEqual(new Set(["mock-player-1", "mock-player-2"]));
  expect(host.packetBytes).toBeLessThanOrEqual(256);
  expect(host.decoded).toMatchObject({
    kind: "slothArchbishop",
    phase: 2,
    action: "grab",
    targetId: "mock-player-2",
    throw: { id: "mock-player-2" },
  });
  expect(host.decoded.throws).toHaveLength(2);
  expect(new Set(host.decoded.throws.map((thrown) => thrown.id))).toEqual(
    new Set(["mock-player-1", "mock-player-2"])
  );
  expect(Math.hypot(
    host.decoded.throw.endX - host.decoded.throw.startX,
    host.decoded.throw.endZ - host.decoded.throw.startZ
  )).toBeGreaterThan(33);
  expect(guest.replicated).toMatchObject({
    replica: true,
    action: "grab",
    throwing: true,
    throwTargetId: "mock-player-2",
  });
  expect(guest.replicated.throwTargetIds).toHaveLength(2);
  expect(Math.hypot(guest.landed.x - guest.before.x, guest.landed.z - guest.before.z)).toBeGreaterThan(28);
  expect(guest.landed.hp).toBe(guest.before.hp);
  expect(guest.final.throwing).toBe(false);
});

test("a packed lazy grip reproduces the sideways no-damage drag for its guest target", async ({ page }) => {
  await startHunt(page);

  const host = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const multiplayer = window.__dustMultiplayerTest;
    multiplayer.startMockHost(["Host", "Guest"]);
    game.startWaveNow(10, "slothArchbishop");
    game.clearEnemies();
    game.setSlothArchbishopAiEnabled(false);
    const boss = game.getSlothArchbishopDiagnostics();
    const forwardX = Math.sin(boss.facingAngle);
    const forwardZ = Math.cos(boss.facingAngle);
    multiplayer.setPlayerPosition("mock-player-2", boss.x + forwardX * 30, boss.z + forwardZ * 30);
    const before = multiplayer.getState().players.find((player) => player.id === "mock-player-2");
    game.forceSlothArchbishopAction("lazy-grip");
    const airborne = game.advanceSlothArchbishop(950);
    const wire = JSON.parse(JSON.stringify(multiplayer.buildWireSnapshot(false, false, "mock-player-2")));
    return {
      before,
      airborne,
      wire,
      decoded: multiplayer.decodeBossState(wire.bossState),
    };
  });

  const guest = await page.evaluate((wire) => {
    const game = window.__dustAndDeadTest;
    const multiplayer = window.__dustMultiplayerTest;
    multiplayer.startMockGuest(["Host", "Guest"], 1);
    multiplayer.applySnapshot(wire);
    const replicated = game.getSlothArchbishopDiagnostics();
    const before = multiplayer.getState().players.find((player) => player.id === "mock-player-2");
    game.advanceSlothArchbishop(800);
    const landed = multiplayer.getState().players.find((player) => player.id === "mock-player-2");
    return { replicated, before, landed, final: game.getSlothArchbishopDiagnostics() };
  }, host.wire);

  expect(host.airborne).toMatchObject({
    phase: 1,
    action: "lazyGrip",
    throwing: true,
    throwKind: "lazyGrip",
    throwTargetId: "mock-player-2",
  });
  expect(host.airborne.throwTargetIds).toHaveLength(2);
  expect(new Set(host.airborne.throwTargetIds)).toEqual(new Set(["mock-player-1", "mock-player-2"]));
  expect(host.decoded).toMatchObject({
    kind: "slothArchbishop",
    phase: 1,
    action: "lazyGrip",
    targetId: "mock-player-2",
    throw: { id: "mock-player-2" },
  });
  expect(host.decoded.throws).toHaveLength(2);
  expect(new Set(host.decoded.throws.map((thrown) => thrown.id))).toEqual(
    new Set(["mock-player-1", "mock-player-2"])
  );
  expect(guest.replicated).toMatchObject({
    replica: true,
    action: "lazyGrip",
    throwing: true,
    throwKind: "lazyGrip",
    throwTargetId: "mock-player-2",
  });
  expect(guest.replicated.throwTargetIds).toHaveLength(2);
  expect(Math.hypot(guest.landed.x - guest.before.x, guest.landed.z - guest.before.z)).toBeGreaterThan(13);
  expect(guest.landed.hp).toBe(guest.before.hp);
  expect(guest.final.throwing).toBe(false);
});

test("defeat removes the support hands and the next wave clears the encounter and HUD", async ({ page }) => {
  await startHunt(page);
  await startSlothArchbishop(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    game.forceSlothArchbishopAction("spider");
    const alive = game.advanceSlothArchbishop(1900);
    const defeatedResult = game.forceActiveBossDefeat();
    const defeated = game.getSlothArchbishopDiagnostics();
    const deathWire = game.getSlothArchbishopPackedWireDiagnostics();
    const faded = game.advanceSlothArchbishop(5000);
    game.startWaveNow(11);
    game.clearEnemies();
    const cleared = game.getSlothArchbishopDiagnostics();
    return { alive, defeatedResult, defeated, deathWire, faded, cleared };
  });

  expect(result.alive.supportHandCount).toBe(12);
  expect(result.defeatedResult).toBe(true);
  expect(result.defeated).toMatchObject({
    active: false,
    defeated: true,
    action: "defeated",
    hp: 0,
    supportHandCount: 12,
  });
  expect(result.deathWire.regularDecoded).toMatchObject({
    valid: true,
    data: { kind: "slothArchbishop", active: false, defeated: true, action: "defeated", hp: 0 },
  });
  expect(result.faded).toMatchObject({ active: false, defeated: true, activeHandCount: 0, supportHandCount: 0 });
  expect(result.cleared).toMatchObject({ active: false, defeated: false, phase: -1, action: "", hp: 0, maxHp: 0 });
  await expect(page.locator("#boss-hud")).toBeHidden();
});

test("the Archbishop HUD remains legible between the combat panels at 820 by 378", async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 378 });
  await startHunt(page);
  await page.evaluate(() => {
    window.__dustMultiplayerTest.startMockHost(["Host", "Guest"]);
    window.__dustAndDeadTest.startWaveNow(10, "slothArchbishop");
    window.__dustAndDeadTest.clearEnemies();
    window.__dustAndDeadTest.setSlothArchbishopAiEnabled(false);
  });

  await expect(page.locator("#boss-hud")).toBeVisible();
  await expect(page.locator("#boss-hud")).toHaveClass(/is-sloth-archbishop/);
  await expect(page.locator("#boss-name")).toHaveText("BOB · THE ARCHBISHOP OF SLOTH");
  await expect(page.locator("#boss-church-pips")).toBeHidden();
  await expect(page.locator("#boss-church-pips .boss-sloth-phase")).toHaveCount(0);
  await expect(page.locator("#boss-status")).toBeHidden();
  await expect(page.locator("#boss-status")).toHaveText("");
  await expect(page.locator("#multiplayer-scoreboard-toggle")).toBeVisible();

  const layout = await page.evaluate(() => {
    const box = (selector) => {
      const rect = document.querySelector(selector).getBoundingClientRect();
      return {
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      };
    };
    const name = document.querySelector("#boss-name");
    return {
      viewport: { width: innerWidth, height: innerHeight },
      boss: box("#boss-hud"),
      playerHud: box("#hud"),
      ammoHud: box("#ammo-hud"),
      scores: box("#multiplayer-scoreboard-toggle"),
      track: box(".boss-health-track"),
      name: {
        clientWidth: name.clientWidth,
        scrollWidth: name.scrollWidth,
        fontSize: Number.parseFloat(getComputedStyle(name).fontSize),
      },
    };
  });

  expect(layout.boss.top).toBeGreaterThanOrEqual(layout.scores.bottom + 1);
  expect(layout.boss.top).toBeLessThanOrEqual(layout.scores.bottom + 8);
  expect(layout.boss.bottom).toBeLessThanOrEqual(105);
  expect(layout.boss.width).toBeGreaterThanOrEqual(320);
  expect(layout.boss.width).toBeLessThanOrEqual(layout.viewport.width * 0.45);
  expect(layout.boss.left).toBeGreaterThanOrEqual(layout.playerHud.right - 2);
  expect(layout.boss.right).toBeLessThanOrEqual(layout.ammoHud.left + 2);
  expect(layout.track.height).toBeGreaterThanOrEqual(9);
  expect(layout.name.scrollWidth).toBeLessThanOrEqual(layout.name.clientWidth + 1);
  expect(layout.name.fontSize).toBeGreaterThanOrEqual(9);
});
