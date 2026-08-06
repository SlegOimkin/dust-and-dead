const path = require("node:path");
const { expect, test } = require("@playwright/test");

function fileUrl(relativePath) {
  const absolute = path.resolve(__dirname, "..", relativePath).replace(/\\/g, "/");
  return `file:///${absolute}`;
}

async function startHunt(page) {
  await page.goto(`${fileUrl("index.html")}?mapSeed=7331&bossTransitionAudit=1`);
  const intro = page.locator("#intro-screen");
  if (await intro.isVisible().catch(() => false)) {
    await page.keyboard.press("KeyM");
    await expect(intro).toBeHidden();
  }
  await page.getByRole("button", { name: "Start Hunt" }).click();
  await page.waitForFunction(() => Boolean(
    window.__dustAndDeadTest?.forceActiveBossDefeat
      && window.__dustAndDeadTest?.advanceWaveProgress
      && window.__dustAndDeadTest?.getThreeObjectDiagnostics
      && window.__dustAndDeadTest?.getSlothArchbishopDiagnostics
  ));
  await page.evaluate(() => window.__dustAndDeadTest.clearEnemies());
  await page.waitForFunction(() => {
    const game = window.__dustAndDeadTest;
    const train = game?.getGhostTrainVisualBundlePoolDiagnostics?.();
    const bossFx = game?.getBossShaderFxPrewarmDiagnostics?.();
    return Boolean(train?.prewarm?.completed && train?.prewarm?.gpuReady && bossFx?.completed);
  }, null, { timeout: 150_000 });
}

test("every defeated boss stops its spawn budget and releases encounter adds before the next wave", async ({ page }) => {
  test.setTimeout(180_000);
  await startHunt(page);
  const results = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    return ["bellRinger", "ghostTrain", "oilBaron", "slothArchbishop"].map((kind) => {
      const liveAdds = 18;
      game.forceWaveState(10, liveAdds, 47, kind);
      const before = game.getThreeObjectDiagnostics();
      const defeated = game.forceActiveBossDefeat();
      const scoreAfterDefeat = game.grantScore(0);
      const firstDeathTick = game.advanceWaveProgress(17);
      const afterSpawnAttempt = game.advanceSpawningOnly(3000);
      const fxBeforeTransition = game.getThreeObjectDiagnostics().state;
      const startedAt = performance.now();
      const transition = game.advanceWaveProgress(8000);
      const transitionMs = performance.now() - startedAt;
      const after = game.getThreeObjectDiagnostics();
      return {
        kind,
        defeated,
        before,
        firstDeathTick,
        afterSpawnAttempt,
        fxBeforeTransition,
        transition,
        transitionMs,
        scoreAfterDefeat,
        scoreAfterTransition: game.grantScore(0),
        after,
        bossStillPresent: Boolean(
          game.getBellRingerDiagnostics().active
            || game.getGhostTrainDiagnostics().active
            || game.getOilBaronDiagnostics()?.active
            || game.getSlothArchbishopDiagnostics().active
        ),
      };
    });
  });

  for (const result of results) {
    expect(result.defeated, result.kind).toBe(true);
    // The death pause keeps the already-visible adds, but can no longer create
    // any of the 47 unspent boss-wave enemies.
    expect(result.firstDeathTick.remaining, result.kind).toBe(18);
    expect(result.afterSpawnAttempt, result.kind).toMatchObject({ live: 18, spawnLeft: 0 });
    expect(result.transition.wave, result.kind).toBe(11);
    expect(result.after.state.enemies, result.kind).toBe(0);
    expect(result.bossStillPresent, result.kind).toBe(false);
    expect(result.scoreAfterTransition, result.kind).toBe(result.scoreAfterDefeat);

    const walkerBefore = result.before.pools.zombies.walker;
    const walkerAfter = result.after.pools.zombies.walker;
    expect(walkerBefore.inUse, result.kind).toBe(18);
    expect(walkerAfter.inUse, result.kind).toBe(0);
    expect(walkerAfter.created, result.kind).toBe(walkerBefore.created);
    expect(walkerAfter.available, result.kind).toBeGreaterThanOrEqual(walkerBefore.available + 18);

    // Pool release is not a kill: it adds no combat particles/debris.
    expect(result.after.state.particles, result.kind).toBe(result.fxBeforeTransition.particles);
    expect(result.after.state.debris, result.kind).toBe(result.fxBeforeTransition.debris);
    expect(result.transitionMs, result.kind).toBeLessThan(100);
  }
});

test("a tower-heavy Oil Baron defeat drops retained graphics and network state before wave transition", async ({ page }) => {
  test.setTimeout(180_000);
  await startHunt(page);
  const result = await page.evaluate(async () => {
    const game = window.__dustAndDeadTest;
    const multiplayer = window.__dustMultiplayerTest;
    multiplayer.startMockHost(["Host", "Guest"]);
    game.forceWaveState(10, 24, 80, "oilBaron");
    game.setOilBaronAiEnabled(false);
    const boss = game.getOilBaronDiagnostics().boss;
    multiplayer.setPlayerPosition("mock-player-2", boss.x, boss.z);
    game.damageOilBaron(boss.maxHp * 0.52, true);
    game.advanceOilBaron(34);

    const entries = [];
    for (let index = 0; index < 48; index += 1) {
      entries.push({
        x: boss.x + (index % 8 - 3.5) * 8.5,
        z: boss.z + (Math.floor(index / 8) - 2.5) * 8.5,
        options: {
          id: `transition-stress-${index}`,
          oilRadius: 3.2,
          oilAge: 12,
          angle: index * 0.37,
        },
      });
    }
    game.spawnOilDerrickBatch(entries);
    game.advanceOilBaron(34);
    game.forceOilBaronAction("doubles");
    game.advanceOilBaron(1700);
    game.advanceOilBaron(800);
    multiplayer.setPlayerPosition("mock-player-1", boss.x, boss.z + 60);
    multiplayer.setPlayerPosition("mock-player-2", boss.x + 4, boss.z + 22);
    game.forceOilBaronDebtChainForPlayer("mock-player-2");
    game.forceOilBaronAction("monocle");
    game.advanceOilBaron(1580);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

    multiplayer.buildWireSnapshot(false, false, "mock-player-2");
    multiplayer.buildWireSnapshot(false, false, "mock-player-2");
    const stressed = {
      baron: game.getOilBaronDiagnostics(),
      objects: game.getThreeObjectDiagnostics(),
      hazards: multiplayer.getOilBaronPlayerHazardDiagnostics("mock-player-2"),
    };

    // The focused Oil helper advances only the encounter and intentionally
    // leaves short-lived global FX untouched. Age those FX through the real
    // game loop before measuring the death frame, matching normal combat.
    window.advanceTime(900);

    const defeatStartedAt = performance.now();
    // Measure the authoritative state change itself. The helper's optional
    // immediate render is a synchronous testing convenience that does not
    // match the real RAF lifecycle and can include unrelated queued WebGL work.
    const defeated = game.forceActiveBossDefeat(true);
    const defeatMs = performance.now() - defeatStartedAt;
    const firstDeathRenderStartedAt = performance.now();
    game.renderNowForTest();
    const firstDeathRenderMs = performance.now() - firstDeathRenderStartedAt;
    const secondDeathRenderStartedAt = performance.now();
    game.renderNowForTest();
    const secondDeathRenderMs = performance.now() - secondDeathRenderStartedAt;
    const afterDefeat = {
      baron: game.getOilBaronDiagnostics(),
      objects: game.getThreeObjectDiagnostics(),
    };
    multiplayer.buildWireSnapshot(false, false, "mock-player-2");
    const afterDefeatHazards = multiplayer.getOilBaronPlayerHazardDiagnostics("mock-player-2");
    const cleanupTickStartedAt = performance.now();
    game.advanceWaveProgress(17);
    const cleanupTickMs = performance.now() - cleanupTickStartedAt;
    const afterFirstCleanupTick = game.getOilBaronDeferredCleanupDiagnostics();

    // Advance only the defeated encounter clock.  The fully animated corpse
    // is then retired in a short authoritative wave-10 cleanup hold, rather
    // than being queued by startWave(11) after that tick's cleanup budget.
    game.advanceOilBaron(7100);
    const cleanupHoldStartedAt = performance.now();
    const cleanupHold = {
      transition: game.advanceWaveProgress(17),
      baron: game.getOilBaronDiagnostics(),
      cleanup: game.getOilBaronDeferredCleanupDiagnostics(),
      wire: game.getOilBaronWireState(),
    };
    const cleanupHoldMs = performance.now() - cleanupHoldStartedAt;
    const transitionStartedAt = performance.now();
    const transition = game.advanceWaveProgress(400);
    const transitionMs = performance.now() - transitionStartedAt;
    const afterTransitionBeforeRaf = game.getThreeObjectDiagnostics();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return {
      defeated,
      defeatMs,
      firstDeathRenderMs,
      secondDeathRenderMs,
      cleanupTickMs,
      stressed,
      afterDefeat,
      afterDefeatHazards,
      afterFirstCleanupTick,
      cleanupHold,
      cleanupHoldMs,
      transition,
      transitionMs,
      afterTransitionBeforeRaf,
      afterTransition: game.getThreeObjectDiagnostics(),
      pressureAfterTransition: multiplayer.getZombiePressureDiagnostics(),
      cleanupAfterTransition: game.getOilBaronDeferredCleanupDiagnostics(),
      baronAfterTransition: game.getOilBaronDiagnostics(),
    };
  });

  console.log(`BOSS_WAVE_TRANSITION_PERF ${JSON.stringify({
    defeatMs: Number(result.defeatMs.toFixed(2)),
    firstDeathRenderMs: Number(result.firstDeathRenderMs.toFixed(2)),
    secondDeathRenderMs: Number(result.secondDeathRenderMs.toFixed(2)),
    cleanupTickMs: Number(result.cleanupTickMs.toFixed(2)),
    cleanupHoldMs: Number(result.cleanupHoldMs.toFixed(2)),
    transitionMs: Number(result.transitionMs.toFixed(2)),
    queued: result.afterDefeat.baron.deferredCleanup.queued,
    rendererBefore: result.stressed.objects.rendererMemory,
    rendererAfter: result.afterTransition.rendererMemory,
  })}`);

  expect(result.defeated).toBe(true);
  expect(result.stressed.baron.derrickCount).toBe(48);
  expect(result.stressed.baron.render.fireSpreadScratchBuckets).toBeGreaterThan(0);
  expect(result.stressed.baron.render.fireSpreadScratchRetainedDerricks).toBe(48);
  expect(result.stressed.baron.oilDoubles.count).toBe(2);
  expect(result.stressed.baron.debtChains.count).toBe(1);
  expect(result.stressed.baron.monocleSentence.projectileCount).toBe(1);
  expect(result.stressed.hazards.pendingOilKeys).toBeGreaterThan(0);

  expect(result.afterDefeat.baron).toMatchObject({ defeated: true, derrickCount: 0 });
  expect(result.afterDefeat.baron.oilDoubles.count).toBe(0);
  expect(result.afterDefeat.baron.debtChains.count).toBe(0);
  // Towers, doubles, and the chain/accessory batch are all hidden
  // synchronously, then GPU-disposed one top-level visual per fixed tick. The
  // short-lived Monocle round naturally expires during the real-loop FX aging.
  expect(result.afterDefeat.baron.deferredCleanup.queued).toBeGreaterThanOrEqual(52);
  expect(result.afterFirstCleanupTick.queued)
    .toBe(result.afterDefeat.baron.deferredCleanup.queued - 1);
  expect(result.afterFirstCleanupTick.lastTickProcessed).toBe(1);
  expect(result.afterFirstCleanupTick.maxTickProcessed).toBe(1);
  expect(result.afterDefeat.baron.render.fireSpreadScratchBuckets).toBe(0);
  expect(result.afterDefeat.baron.render.fireSpreadScratchPool).toBe(0);
  expect(result.afterDefeat.baron.render.fireSpreadScratchRetainedDerricks).toBe(0);
  expect(result.afterDefeatHazards.knownOilKeys).toBe(0);
  expect(result.afterDefeatHazards.pendingOilKeys).toBe(0);
  expect(result.defeatMs).toBeLessThan(16.7);
  expect(result.firstDeathRenderMs).toBeLessThan(50);
  expect(result.secondDeathRenderMs).toBeLessThan(50);
  expect(result.cleanupTickMs).toBeLessThan(16.7);

  // The full death delay is over, but the authoritative encounter remains
  // serializable until the one-per-tick cleanup queue has released the exact
  // corpse and any leftover Oil-only objects.
  expect(result.cleanupHold.transition.wave).toBe(10);
  expect(result.cleanupHold.baron).toMatchObject({
    defeated: true,
    active: false,
    postDeathCleanup: { active: true, corpseRetired: true },
  });
  expect(result.cleanupHold.cleanup.queued).toBeGreaterThan(0);
  expect(result.cleanupHold.wire).toMatchObject({
    kind: "oilBaron",
    defeated: true,
    deathTimeLeft: 0,
  });
  expect(result.cleanupHoldMs).toBeLessThan(16.7);

  expect(result.transition.wave).toBe(11);
  // Boss-wave adds are gone synchronously. The following RAFs are allowed to
  // seed wave 11's ordinary multiplayer opening pressure.
  expect(result.afterTransitionBeforeRaf.state.enemies).toBe(0);
  const openingPressure = Math.min(
    result.pressureAfterTransition.waveTarget,
    result.pressureAfterTransition.participantCount *
      result.pressureAfterTransition.initialPressurePerPlayer
  );
  expect(
    result.afterTransition.state.enemies +
      result.pressureAfterTransition.initialPressureLeft
  ).toBe(openingPressure);
  expect(result.baronAfterTransition).toBeNull();
  expect(result.cleanupAfterTransition.queued).toBe(0);
  expect(result.afterTransition.roots.dynamicRoot.objects)
    .toBeLessThan(result.stressed.objects.roots.dynamicRoot.objects);
  expect(result.afterTransition.roots.effectRoot.objects)
    .toBeLessThan(result.stressed.objects.roots.effectRoot.objects);
  expect(result.transitionMs).toBeLessThan(16.7);
});

test("an authoritative Oil Baron defeat retires a guest's dense replicated field without a packet spike", async ({ page, context }) => {
  test.setTimeout(360_000);
  const guest = await context.newPage();
  try {
    await startHunt(page);
    await page.evaluate(() => window.__dustAndDeadTest.setAutomaticFrameLoopModeForTest("paused"));
    await startHunt(guest);
    await guest.evaluate(() => window.__dustAndDeadTest.setAutomaticFrameLoopModeForTest("paused"));

    await page.bringToFront();
    const bootstrap = await page.evaluate(() => {
      const game = window.__dustAndDeadTest;
      const multiplayer = window.__dustMultiplayerTest;
      multiplayer.startMockHost(["Host", "Guest"]);
      game.forceWaveState(10, 0, 0, "oilBaron");
      game.setOilBaronAiEnabled(false);
      const boss = game.getOilBaronDiagnostics().boss;
      multiplayer.setPlayerPosition("mock-player-1", boss.x, boss.z + 60);
      multiplayer.setPlayerPosition("mock-player-2", boss.x + 4, boss.z + 22);
      game.damageOilBaron(boss.maxHp * 0.52, true);
      game.advanceOilBaron(34);
      game.spawnOilDerrickBatch(Array.from({ length: 48 }, (_, index) => ({
        x: boss.x + (index % 8 - 3.5) * 8.5,
        z: boss.z + (Math.floor(index / 8) - 2.5) * 8.5,
        options: {
          id: `guest-transition-stress-${index}`,
          oilRadius: 3.2,
          oilAge: 12,
          angle: index * 0.37,
        },
      })));
      game.forceOilBaronAction("doubles");
      game.advanceOilBaron(1700);
      game.advanceOilBaron(800);
      game.forceOilBaronDebtChainForPlayer("mock-player-2");
      game.forceOilBaronAction("monocle");
      game.advanceOilBaron(1580);
      return multiplayer.buildWireSnapshot(true, true, "mock-player-2");
    });

    await guest.bringToFront();
    await guest.evaluate(() => window.__dustAndDeadTest.setAutomaticFrameLoopModeForTest("full"));
    const guestBefore = await guest.evaluate(async (snapshot) => {
      const game = window.__dustAndDeadTest;
      const multiplayer = window.__dustMultiplayerTest;
      multiplayer.startMockGuest(["Host", "Guest"], 1);
      multiplayer.applySnapshot(snapshot);
      game.advanceOilBaron(34);
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return {
        baron: game.getOilBaronDiagnostics(),
        cleanup: game.getOilBaronDeferredCleanupDiagnostics(),
      };
    }, bootstrap);
    await guest.evaluate(() => window.__dustAndDeadTest.setAutomaticFrameLoopModeForTest("paused"));

    await page.bringToFront();
    const deathSnapshot = await page.evaluate(() => {
      const game = window.__dustAndDeadTest;
      const multiplayer = window.__dustMultiplayerTest;
      game.forceActiveBossDefeat();
      return multiplayer.buildWireSnapshot(true, true, "mock-player-2");
    });

    await guest.bringToFront();
    const guestAfter = await guest.evaluate((snapshot) => {
      const game = window.__dustAndDeadTest;
      const multiplayer = window.__dustMultiplayerTest;
      game.setAutomaticFrameLoopModeForTest("paused");
      const startedAt = performance.now();
      multiplayer.applySnapshot(snapshot);
      const applyMs = performance.now() - startedAt;
      const afterPacket = {
        baron: game.getOilBaronDiagnostics(),
        cleanup: game.getOilBaronDeferredCleanupDiagnostics(),
      };
      game.advanceOilBaron(17);
      const afterOneTick = game.getOilBaronDeferredCleanupDiagnostics();
      game.advanceOilBaron(1200);
      return {
        applyMs,
        afterPacket,
        afterOneTick,
        afterDrain: game.getOilBaronDeferredCleanupDiagnostics(),
      };
    }, deathSnapshot);

    console.log(`BOSS_WAVE_GUEST_DEFEAT_PERF ${JSON.stringify({
      applyMs: Number(guestAfter.applyMs.toFixed(2)),
      queued: guestAfter.afterPacket.cleanup.queued,
    })}`);

    expect(guestBefore.baron).toMatchObject({
      replica: true,
      derrickCount: 48,
      oilDoubles: { count: 2 },
      debtChains: { count: 1 },
      monocleSentence: { projectileCount: 1 },
    });
    expect(guestBefore.cleanup.queued).toBe(0);
    expect(guestAfter.afterPacket.baron).toMatchObject({
      replica: true,
      defeated: true,
      derrickCount: 0,
      oilDoubles: { count: 0 },
      debtChains: { count: 0 },
      monocleSentence: { projectileCount: 0 },
    });
    expect(guestAfter.afterPacket.cleanup.queued).toBeGreaterThanOrEqual(53);
    expect(guestAfter.afterOneTick.queued)
      .toBe(guestAfter.afterPacket.cleanup.queued - 1);
    expect(guestAfter.afterOneTick.lastTickProcessed).toBe(1);
    expect(guestAfter.afterOneTick.maxTickProcessed).toBe(1);
    expect(guestAfter.afterDrain.queued).toBe(0);
    expect(guestAfter.applyMs).toBeLessThan(25);
  } finally {
    await guest.close();
  }
});
