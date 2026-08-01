const path = require("node:path");
const { expect, test } = require("@playwright/test");

function fileUrl(relativePath) {
  const absolute = path.resolve(__dirname, "..", relativePath).replace(/\\/g, "/");
  return `file:///${absolute}`;
}

async function openGame(page) {
  await page.goto(`${fileUrl("index.html")}?mapSeed=7331`);
  const intro = page.locator("#intro-screen");
  if (await intro.isVisible().catch(() => false)) await page.keyboard.press("KeyM");
  await page.getByRole("button", { name: "Start Hunt" }).click();
}

async function waitForZombieGpuPrewarm(page) {
  // Production intentionally pauses heavyweight uploads while enemies are
  // alive. These stress tests force their own waves afterward, so park the
  // bootstrap wave and wait in the same safe window used by the runtime.
  await page.evaluate(() => window.__dustAndDeadTest?.clearEnemies?.());
  await expect.poll(async () => page.evaluate(() => {
    const prewarm = window.__dustAndDeadTest?.getZombieOptimizationStats?.().instances?.prewarm;
    return prewarm ? {
      complete: prewarm.complete,
      cpuComplete: prewarm.cpu?.complete,
      gpuComplete: prewarm.gpu?.complete,
      createdChunks: prewarm.cpu?.createdChunks,
      readyChunks: prewarm.gpu?.readyChunks,
      failedChunks: prewarm.gpu?.failedChunks,
      error: prewarm.gpu?.error,
    } : null;
  }), {
    timeout: 60_000,
    message: "zombie instance CPU/GPU prewarm should settle in a safe window",
  }).toMatchObject({
    complete: true,
    cpuComplete: true,
    gpuComplete: true,
    failedChunks: 0,
  });
}

async function waitForGhostTrainGpuPrewarm(page) {
  await page.evaluate(() => window.__dustAndDeadTest?.clearEnemies?.());
  await page.waitForFunction(() => {
    const prewarm = window.__dustAndDeadTest?.getGhostTrainVisualBundlePoolDiagnostics?.().prewarm;
    return Boolean(
      prewarm?.completed &&
      prewarm.gpuReady &&
      prewarm.gpuUploadComplete &&
      prewarm.gpuReadyStageCount === prewarm.gpuStageCount &&
      !prewarm.gpuPending &&
      !prewarm.gpuCompileError &&
      !prewarm.gpuUploadError
    );
  }, undefined, { polling: "raf", timeout: 60_000 });
}

async function waitForBossShaderFxPrewarm(page) {
  await page.evaluate(() => window.__dustAndDeadTest?.clearEnemies?.());
  await page.waitForFunction(() => {
    const prewarm = window.__dustAndDeadTest?.getBossShaderFxPrewarmDiagnostics?.();
    return Boolean(prewarm?.completed && !prewarm?.cleanupActive && !prewarm?.error);
  }, undefined, { polling: "raf", timeout: 90_000 });
}

test("heavy prewarm jobs are serialized and stay out of populated combat frames", async ({ page }) => {
  await openGame(page);
  const initial = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    game.setAutomaticFrameLoopModeForTest("paused");
    game.startWaveNow(2);
    for (let frame = 0; frame < 8; frame += 1) {
      game.advanceRealFrame(100, { render: false });
    }
    const liveEnemies = game.getThreeObjectDiagnostics().state.enemies;
    game.resetBossShaderFxPrewarm();
    const bossBeforeBusyFrames = game.getBossShaderFxPrewarmDiagnostics();
    const schedulerBeforeBusyFrames = game.getHeavyPrewarmSchedulerDiagnostics();
    const poolsBeforeBusyFrames = game.getThreeObjectDiagnostics().pools;
    for (let frame = 0; frame < 5; frame += 1) {
      game.advanceRealFrame(16, { render: false });
    }
    const bossAfterBusyFrames = game.getBossShaderFxPrewarmDiagnostics();
    const schedulerAfterBusyFrames = game.getHeavyPrewarmSchedulerDiagnostics();
    const poolsAfterBusyFrames = game.getThreeObjectDiagnostics().pools;

    game.clearEnemies();
    const pendingWave = game.forceWaveState(2, 0, 20);
    for (let frame = 0; frame < 3; frame += 1) {
      game.advanceRealFrame(16, { render: false });
    }
    const schedulerAfterPendingSpawnFrames =
      game.getHeavyPrewarmSchedulerDiagnostics();

    game.clearEnemies();
    game.setAutomaticFrameLoopModeForTest("full");
    return {
      liveEnemies,
      bossBeforeBusyFrames,
      bossAfterBusyFrames,
      pendingSpawns: pendingWave.spawnLeft,
      poolsBeforeBusyFrames,
      poolsAfterBusyFrames,
      schedulerBeforeBusyFrames,
      schedulerAfterBusyFrames,
      schedulerAfterPendingSpawnFrames,
    };
  });
  const busyBossRuns = initial.schedulerAfterBusyFrames.jobs.bosses?.runs || 0;
  await page.waitForFunction(
    (previousRuns) => (
      window.__dustAndDeadTest.getHeavyPrewarmSchedulerDiagnostics().jobs.bosses?.runs || 0
    ) > previousRuns,
    busyBossRuns,
    { polling: "raf", timeout: 90_000 }
  );
  const safe = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    game.setAutomaticFrameLoopModeForTest("paused");
    return {
      schedulerAfterSafeFrames: game.getHeavyPrewarmSchedulerDiagnostics(),
      bossAfterSafeFrames: game.getBossShaderFxPrewarmDiagnostics(),
    };
  });
  const result = { ...initial, ...safe };

  expect(result.liveEnemies).toBeGreaterThan(0);
  expect(result.bossAfterBusyFrames.buildStage).toBe(result.bossBeforeBusyFrames.buildStage);
  expect(result.schedulerAfterBusyFrames.runs).toBe(
    result.schedulerBeforeBusyFrames.runs
  );
  expect(result.schedulerAfterBusyFrames.skippedBusyGameplay).toBeGreaterThan(
    result.schedulerBeforeBusyFrames.skippedBusyGameplay
  );
  expect(result.poolsAfterBusyFrames.rifleTrapVisuals.created).toBe(
    result.poolsBeforeBusyFrames.rifleTrapVisuals.created
  );
  expect(result.poolsAfterBusyFrames.acidPuddleVisuals.created).toBe(
    result.poolsBeforeBusyFrames.acidPuddleVisuals.created
  );
  expect(
    result.poolsAfterBusyFrames.acidPuddleVisuals.projectiles.created
  ).toBe(
    result.poolsBeforeBusyFrames.acidPuddleVisuals.projectiles.created
  );
  expect(result.pendingSpawns).toBe(20);
  expect(result.schedulerAfterPendingSpawnFrames.runs).toBe(
    result.schedulerAfterBusyFrames.runs
  );
  expect(result.schedulerAfterSafeFrames.maxJobsPerRaf).toBe(1);
  expect(result.schedulerAfterSafeFrames.jobs.bosses?.runs || 0).toBeGreaterThan(
    result.schedulerAfterBusyFrames.jobs.bosses?.runs || 0
  );
});

test("the last zombie gets a quiet death window before paced inter-wave prewarm", async ({ page }) => {
  await openGame(page);
  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    game.setAutomaticFrameLoopModeForTest("paused");
    game.forceWaveState(1, 1, 0);
    game.resetBossShaderFxPrewarm();
    const schedulerBefore = game.getHeavyPrewarmSchedulerDiagnostics();
    const killStartedAt = performance.now();
    const killed = game.killNearestZombie();
    const killMs = performance.now() - killStartedAt;
    game.clearXpOrbs();

    const frames = [];
    for (let index = 0; index < 60; index += 1) {
      const startedAt = performance.now();
      game.advanceRealFrame(1000 / 60, { render: false });
      const updateMs = performance.now() - startedAt;
      const scheduler = game.getHeavyPrewarmSchedulerDiagnostics();
      frames.push({
        frame: index + 1,
        updateMs,
        runs: scheduler.runs,
        lastJobMs: scheduler.lastJobMs,
        skippedCombatGraceFrames: scheduler.skippedCombatGraceFrames,
        skippedActiveCadenceFrames: scheduler.skippedActiveCadenceFrames,
      });
    }
    const schedulerAfter = game.getHeavyPrewarmSchedulerDiagnostics();
    const runFrames = frames
      .filter((frame, index) => (
        frame.runs > (index ? frames[index - 1].runs : schedulerBefore.runs)
      ))
      .map((frame) => frame.frame);
    return {
      killed,
      killMs,
      schedulerBefore,
      schedulerAfter,
      frames,
      runFrames,
      world: JSON.parse(window.render_game_to_text()),
    };
  });

  const firstRunFrame = result.runFrames[0] || Infinity;
  const graceFrames = result.frames.filter((frame) => frame.frame < firstRunFrame);
  const runSamples = result.frames.filter((frame, index) => (
    frame.runs > (
      index ? result.frames[index - 1].runs : result.schedulerBefore.runs
    )
  ));
  const cooldownsRespected = runSamples.every((sample, index) => {
    const next = runSamples[index + 1];
    if (!next) return true;
    const frameMs = 1000 / 60;
    let cooldownMs = result.schedulerAfter.activeJobIntervalMs;
    let recoveryFrames = 0;
    if (sample.lastJobMs > result.schedulerAfter.slowJobMs) {
      cooldownMs = result.schedulerAfter.slowCooldownMs;
      recoveryFrames = result.schedulerAfter.slowRecoveryFrames;
    } else if (sample.lastJobMs > result.schedulerAfter.moderateJobMs) {
      cooldownMs = result.schedulerAfter.moderateCooldownMs;
    }
    const minimumGap = Math.ceil(cooldownMs / frameMs) + recoveryFrames;
    return next.frame - sample.frame >= minimumGap;
  });
  expect(result.killed).toBe(true);
  expect(result.killMs).toBeLessThan(5);
  expect(result.world).toMatchObject({
    mode: "playing",
    wave: 1,
    enemyCount: 0,
    spawnLeft: 0,
  });
  expect(result.schedulerAfter.postCombatGraceMs).toBeGreaterThanOrEqual(400);
  expect(firstRunFrame).toBeGreaterThanOrEqual(25);
  expect(Math.max(...graceFrames.map((frame) => frame.updateMs))).toBeLessThan(5);
  expect(result.runFrames.length).toBeGreaterThan(0);
  expect(result.runFrames.length).toBeLessThanOrEqual(35);
  expect(cooldownsRespected).toBe(true);
  expect(result.schedulerAfter.skippedCombatGraceFrames).toBeGreaterThan(
    result.schedulerBefore.skippedCombatGraceFrames
  );
  expect(result.schedulerAfter.skippedActiveCadenceFrames).toBeGreaterThan(
    result.schedulerBefore.skippedActiveCadenceFrames
  );
  expect(result.schedulerAfter.maxJobsPerRaf).toBe(1);
});

test("upgrade choice screens do not compete with heavyweight prewarm", async ({ page }) => {
  await openGame(page);
  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    game.setAutomaticFrameLoopModeForTest("paused");
    game.forceWaveState(2, 4, 12);
    game.previewUpgradeCards(["swiftBoots", "steadyHand", "quickReload"]);
    game.resetBossShaderFxPrewarm();
    const before = game.getHeavyPrewarmSchedulerDiagnostics();
    for (let frame = 0; frame < 30; frame += 1) {
      game.advanceRealFrame(1000 / 60, { render: false });
    }
    return {
      before,
      after: game.getHeavyPrewarmSchedulerDiagnostics(),
      world: JSON.parse(window.render_game_to_text()),
    };
  });

  expect(result.world.mode).toBe("level-up");
  expect(result.after.runs).toBe(result.before.runs);
  expect(result.after.skippedInteractiveRunFrames).toBeGreaterThan(
    result.before.skippedInteractiveRunFrames
  );
});

test("paced inter-wave windows still prepare the opening bosses before wave five", async ({ page }) => {
  test.setTimeout(120_000);
  await openGame(page);
  const snapshots = await page.evaluate(async () => {
    const game = window.__dustAndDeadTest;
    game.setAutomaticFrameLoopModeForTest("paused");
    const results = [];
    for (let wave = 1; wave <= 4; wave += 1) {
      game.forceWaveState(wave, 1, 0);
      game.killNearestZombie();
      game.clearXpOrbs();
      for (let frame = 0; frame < 112; frame += 1) {
        await new Promise((resolve) => requestAnimationFrame(resolve));
        game.advanceRealFrame(1000 / 60, { render: false });
      }
      results.push({
        wave,
        scheduler: game.getHeavyPrewarmSchedulerDiagnostics(),
        train: game.getGhostTrainVisualBundlePoolDiagnostics().prewarm,
        boss: game.getBossVisualPrewarmDiagnostics(),
        shaders: game.getBossShaderFxPrewarmDiagnostics(),
      });
    }
    return results;
  });

  const final = snapshots.at(-1);
  console.log("PACED_OPENING_PREWARM", JSON.stringify({
    jobs: final.scheduler.runs,
    maxJobsPerRaf: final.scheduler.maxJobsPerRaf,
    maxJobMs: final.scheduler.maxJobMs,
    trainUploads: `${final.train.gpuUploadCursor}/${final.train.gpuUploadTotal}`,
    trainReady: final.train.gpuReady,
    bossCpuReady: final.boss.cpuReady,
    shaderBuild: `${final.shaders.buildStage}/${final.shaders.buildStageCount}`,
    shaderCompileSteps: final.shaders.compileSteps,
    shaderCompilePending: final.shaders.compilePending,
  }));
  expect(snapshots).toHaveLength(4);
  expect(snapshots.every((entry) => entry.scheduler.maxJobsPerRaf === 1)).toBe(true);
  expect(final.train).toMatchObject({
    completed: true,
    gpuReady: true,
    gpuUploadComplete: true,
    gpuCompileError: "",
    gpuUploadError: "",
    gpuPending: false,
  });
  expect(final.train.gpuReadyStageCount).toBe(final.train.gpuStageCount);
  expect(final.train.gpuUploadCursor).toBe(final.train.gpuUploadTotal);
  expect(final.boss).toMatchObject({
    cpuReady: true,
    error: "",
  });
  expect(final.shaders.buildStage).toBe(final.shaders.buildStageCount);
  expect(
    final.shaders.compileSteps > 0 || final.shaders.compilePending
  ).toBe(true);
});

test("a long real frame is recovered through bounded simulation steps without losing game time", async ({ page }) => {
  await openGame(page);
  const frames = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    window.__dustMultiplayerTest.startMockHost(["Timing Host", "Timing Guest"]);
    game.resetFrameTiming();
    const diagnostics = [game.advanceRealFrame(300, { render: false })];
    for (let index = 0; index < 16 && diagnostics.at(-1).pendingMs > 0.001; index += 1) {
      diagnostics.push(game.advanceRealFrame(0, { render: false }));
    }
    return diagnostics;
  });

  const simulatedMs = frames.reduce((total, frame) => total + frame.simulatedMs, 0);
  expect(simulatedMs).toBeCloseTo(300, 3);
  expect(frames.at(-1).pendingMs).toBeLessThanOrEqual(0.001);
  expect(frames.at(-1).totalDroppedMs).toBe(0);
  expect(Math.max(...frames.map((frame) => frame.maxStepMs))).toBeLessThanOrEqual(40.001);
  expect(frames.every((frame) => frame.steps <= 4)).toBe(true);
  expect(frames.every((frame) => frame.frameWorkRuns === 1)).toBe(true);
  expect(frames.every((frame) => frame.networkFlushes === 1)).toBe(true);
});

test("sustained long frames shed catch-up debt instead of carrying it forever", async ({ page }) => {
  await openGame(page);
  const frames = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    window.__dustMultiplayerTest.startMockHost(["Timing Host", "Timing Guest"]);
    game.resetFrameTiming();
    return [
      game.advanceRealFrame(200, { render: false }),
      game.advanceRealFrame(200, { render: false }),
      game.advanceRealFrame(200, { render: false }),
    ];
  });

  expect(frames[0].catchUpLimited).toBe(true);
  expect(frames[1].catchUpLimited).toBe(true);
  expect(frames[2].catchUpLimited).toBe(true);
  expect(frames[1].pendingMs).toBeLessThanOrEqual(0.001);
  expect(frames[2].pendingMs).toBeLessThanOrEqual(0.001);
  expect(frames[1].backlogDroppedMs).toBeGreaterThan(0);
  expect(frames[2].backlogDroppedMs).toBeGreaterThan(0);
  expect(["cpu-budget", "step-budget"]).toContain(frames[1].backlogDropReason);
  expect(["cpu-budget", "step-budget"]).toContain(frames[2].backlogDropReason);
  expect(frames.every((frame) => frame.steps <= 4)).toBe(true);
  expect(frames.every((frame) => frame.maxStepMs <= 40.001)).toBe(true);
  expect(frames.every((frame) => frame.networkFlushes === 1)).toBe(true);
});

test("all boss defeats discard host simulation debt before the next wave", async ({ page }) => {
  test.setTimeout(120_000);
  await openGame(page);

  const results = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const multiplayer = window.__dustMultiplayerTest;
    multiplayer.startMockHost(["Host", "Guest A", "Guest B", "Guest C"]);
    const kinds = [
      "bellRinger",
      "ghostTrain",
      "oilBaron",
      "slothArchbishop",
      "hordeheart",
      "landEater",
    ];
    return kinds.map((kind) => {
      game.forceWaveState(10, 0, 0, kind);
      const stress = multiplayer.spawnEnemyStressField(543, "map");
      game.resetFrameTiming();
      const seeded = game.setSimulationBacklogForTest(400);
      const defeated = game.forceActiveBossDefeat(true);
      const afterDefeat = game.getFrameTimingDiagnostics();
      if (kind === "landEater") game.advanceLandEater(3300);
      const transitionStartedAt = performance.now();
      const transition = game.advanceWaveProgress(8000);
      const transitionMs = performance.now() - transitionStartedAt;
      const afterTransition = game.getFrameTimingDiagnostics();
      game.advanceRealFrame(17, { render: false });
      const objects = game.getThreeObjectDiagnostics();
      const activeBoss = [
        game.getBellRingerDiagnostics(),
        game.getGhostTrainDiagnostics(),
        game.getOilBaronDiagnostics(),
        game.getSlothArchbishopDiagnostics(),
        game.getHordeheartDiagnostics(),
        game.getLandEaterDiagnostics(),
      ].some((boss) => boss && boss.active);
      return {
        kind,
        stress,
        seeded,
        defeated,
        afterDefeat,
        transition,
        transitionMs,
        afterTransition,
        objects,
        activeBoss,
      };
    });
  });

  for (const result of results) {
    expect(result.stress, result.kind).toMatchObject({ added: 543, active: 543 });
    expect(result.seeded.pendingMs, result.kind).toBeCloseTo(400, 3);
    expect(result.defeated, result.kind).toBe(true);
    expect(result.afterDefeat.pendingMs, result.kind).toBe(0);
    expect(result.afterDefeat.backlogDroppedMs, result.kind).toBeCloseTo(400, 3);
    expect(result.afterDefeat.backlogDropReason, result.kind).toBe("boss-defeat");
    expect(result.transition.wave, result.kind).toBe(11);
    expect(result.afterTransition.pendingMs, result.kind).toBe(0);
    expect(result.objects.state.enemies, result.kind).toBe(0);
    expect(result.objects.spatial.zombies.occupants, result.kind).toBe(0);
    expect(result.activeBoss, result.kind).toBe(false);
    expect(result.transitionMs, result.kind).toBeLessThan(150);
  }
});

test("a four-player late horde stays backlog-free under real frame feedback", async ({ page }) => {
  test.setTimeout(120_000);
  await openGame(page);
  await waitForZombieGpuPrewarm(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const multiplayer = window.__dustMultiplayerTest;
    multiplayer.startMockHost(["Host", "Guest A", "Guest B", "Guest C"]);
    multiplayer.setPlayerPosition("mock-player-1", -42, -42);
    multiplayer.setPlayerPosition("mock-player-2", 42, -42);
    multiplayer.setPlayerPosition("mock-player-3", -42, 42);
    multiplayer.setPlayerPosition("mock-player-4", 42, 42);
    for (const player of multiplayer.getState().players) multiplayer.setHealth(player.id, 999999);
    // setHealth intentionally clamps to the player's authored maximum. Keep
    // the local host alive through this sustained horde probe so the test does
    // not silently turn into an ended-match/menu benchmark halfway through.
    game.setPlayerMaxHp(10_000, 10_000);
    game.forceWaveState(11, 0, 0);
    const stress = multiplayer.spawnEnemyStressField(586, "map");
    game.resetFrameTiming();

    const frames = [];
    let nextElapsedMs = 1000 / 60;
    for (let index = 0; index < 90; index += 1) {
      const startedAt = performance.now();
      const timing = game.advanceRealFrame(nextElapsedMs, { render: true });
      const workMs = performance.now() - startedAt;
      frames.push({ index, workMs, ...timing });
      nextElapsedMs = Math.max(1000 / 60, Math.min(120, workMs));
    }
    const warmFrames = frames.slice(15);
    const sortedWork = warmFrames.map((frame) => frame.workMs).sort((a, b) => a - b);
    return {
      stress,
      frames,
      performance: {
        averageMs: warmFrames.reduce((sum, frame) => sum + frame.workMs, 0) / warmFrames.length,
        p95Ms: sortedWork[Math.floor(sortedWork.length * 0.95)],
        maxMs: sortedWork[sortedWork.length - 1],
      },
      zombies: game.getZombieOptimizationStats(),
      objects: game.getThreeObjectDiagnostics(),
      world: JSON.parse(window.render_game_to_text()),
    };
  });

  expect(result.stress).toMatchObject({ added: 586, active: 586, mode: "map" });
  expect(result.world).toMatchObject({ wave: 11 });
  expect(result.objects.state.enemies).toBe(586);
  expect(result.objects.spatial.zombies.occupants).toBe(586);
  expect(result.frames.every((frame) => frame.pendingMs <= 0.001)).toBe(true);
  expect(result.frames.every((frame) => frame.steps <= 4)).toBe(true);
  expect(result.frames.every((frame) => frame.maxStepMs <= 40.001)).toBe(true);
  expect(result.frames.every((frame) => frame.networkFlushes === 1)).toBe(true);
  expect(result.zombies.instances).toMatchObject({ active: true, invalidMatrices: 0 });
  expect(result.zombies.instances.shadowDrawCalls).toBe(0);
  expect(result.zombies.instances.suppressedShadowDrawCalls).toBeGreaterThan(0);
  expect(result.zombies.instances.crowdShadowBudget).toMatchObject({
    active: true,
    threshold: 240,
    mapSize: 1024,
    updateInterval: 4,
  });
  expect(result.zombies.instances.crowdShadowBudget.skips).toBeGreaterThan(0);
  expect(result.performance.averageMs).toBeLessThan(33.4);
  expect(result.performance.p95Ms).toBeLessThan(50);
  expect(result.performance.maxMs).toBeLessThan(150);
});

test("a 4000-zombie host never carries simulation debt into the next frame", async ({ page }) => {
  test.setTimeout(180_000);
  await openGame(page);
  await waitForZombieGpuPrewarm(page);

  const result = await page.evaluate(async () => {
    const game = window.__dustAndDeadTest;
    const multiplayer = window.__dustMultiplayerTest;
    multiplayer.startMockHost(["Host", "Guest A", "Guest B", "Guest C"]);
    multiplayer.setPlayerPosition("mock-player-1", -42, -42);
    multiplayer.setPlayerPosition("mock-player-2", 42, -42);
    multiplayer.setPlayerPosition("mock-player-3", -42, 42);
    multiplayer.setPlayerPosition("mock-player-4", 42, 42);
    for (const player of multiplayer.getState().players) multiplayer.setHealth(player.id, 999999);
    game.forceWaveState(11, 0, 0);
    const stress = multiplayer.spawnEnemyStressField(4000, "map");
    // Drive exactly one measured update/render per browser frame. A tight loop
    // of synchronous renderer.render() calls measures WebGL queue backpressure,
    // not the debt a real RAF-driven host can carry between displayed frames.
    game.setAutomaticFrameLoopModeForTest("paused");

    const runFeedbackPhase = async (count, render) => {
      const frames = [];
      let nextElapsedMs = 1000 / 60;
      for (let index = 0; index < count; index += 1) {
        await new Promise((resolve) => requestAnimationFrame(resolve));
        const startedAt = performance.now();
        const timing = game.advanceRealFrame(nextElapsedMs, { render });
        const workMs = performance.now() - startedAt;
        frames.push({ index, workMs, ...timing });
        nextElapsedMs = Math.max(1000 / 60, Math.min(120, workMs));
      }
      const warmFrames = frames.slice(Math.min(5, frames.length));
      const sortedWork = warmFrames
        .map((frame) => frame.workMs)
        .sort((a, b) => a - b);
      return {
        frames,
        performance: {
          averageMs: warmFrames.reduce((sum, frame) => sum + frame.workMs, 0) /
            Math.max(1, warmFrames.length),
          p95Ms: sortedWork[Math.floor(sortedWork.length * 0.95)] || 0,
          maxMs: sortedWork[sortedWork.length - 1] || 0,
        },
      };
    };

    game.resetFrameTiming();
    const simulationOnly = await runFeedbackPhase(240, false);
    const simulationEnd = game.getFrameTimingDiagnostics();
    game.resetFrameTiming();
    const rendered = await runFeedbackPhase(180, true);
    const renderedEnd = game.getFrameTimingDiagnostics();
    const result = {
      stress,
      simulationOnly,
      simulationEnd,
      rendered,
      renderedEnd,
      zombies: game.getZombieOptimizationStats(),
      objects: game.getThreeObjectDiagnostics(),
      world: JSON.parse(window.render_game_to_text()),
    };
    game.setAutomaticFrameLoopModeForTest("full");
    return result;
  });

  console.log(`ZOMBIE_4000_DEBT ${JSON.stringify({
    simulation: result.simulationOnly.performance,
    rendered: result.rendered.performance,
    simulationDroppedMs: result.simulationEnd.totalDroppedMs,
    renderedDroppedMs: result.renderedEnd.totalDroppedMs,
    endingPendingMs: result.renderedEnd.pendingMs,
    active: result.objects.state.enemies,
    renderVisible: result.zombies.instances.handoff.renderVisibleEnemies,
    drawCalls: result.zombies.instances.drawCalls,
    shadowDrawCalls: result.zombies.instances.shadowDrawCalls,
  })}`);

  const allFrames = [
    ...result.simulationOnly.frames,
    ...result.rendered.frames,
  ];
  expect(result.stress).toMatchObject({ added: 4000, active: 4000, mode: "map" });
  expect(result.world).toMatchObject({ wave: 11 });
  expect(result.world.multiplayer).toMatchObject({
    active: true,
    phase: "match",
    role: "host",
    matchEnded: false,
  });
  expect(result.objects.state.enemies).toBe(4000);
  expect(result.objects.spatial.zombies.occupants).toBe(4000);
  expect(allFrames.every((frame) => frame.pendingMs <= 0.001)).toBe(true);
  expect(allFrames.every((frame) => frame.steps <= 4)).toBe(true);
  expect(allFrames.every((frame) => frame.maxStepMs <= 40.001)).toBe(true);
  expect(allFrames.every((frame) => frame.networkFlushes === 1)).toBe(true);
  expect(allFrames
    .filter((frame) => frame.backlogDroppedMs > 0)
    .every((frame) => ["cpu-budget", "step-budget"].includes(frame.backlogDropReason)))
    .toBe(true);
  expect(result.simulationEnd.pendingMs).toBeLessThanOrEqual(0.001);
  expect(result.renderedEnd.pendingMs).toBeLessThanOrEqual(0.001);
  expect(result.zombies.instances).toMatchObject({
    active: true,
    invalidMatrices: 0,
    shadowDrawCalls: 0,
  });
  expect(result.zombies.instances.drawCalls).toBeLessThanOrEqual(96);
  expect(result.zombies.instances.suppressedShadowDrawCalls).toBeGreaterThan(0);
  expect(result.zombies.instances.handoff).toMatchObject({
    authoredVisibleGroups: 0,
    emptyFrame: false,
    doubleFrame: false,
  });
  expect(result.zombies.instances.handoff.renderVisibleEnemies).toBeGreaterThan(0);
  expect(result.zombies.instances.handoff.renderVisibleEnemies).toBeLessThan(4000);
  expect(result.zombies.instances.crowdShadowBudget).toMatchObject({
    active: true,
    threshold: 240,
    mapSize: 1024,
    updateInterval: 4,
  });
  // This pathological field is more than seven times the production
  // multiplayer active cap. Keep it strict enough to catch runaway work while
  // allowing an honest, still-active SwiftShader match (the old fixture ended
  // early and accidentally measured the result screen for many of its frames).
  expect(result.simulationOnly.performance.averageMs).toBeLessThan(40);
  expect(result.simulationOnly.performance.p95Ms).toBeLessThan(90);
  expect(result.simulationOnly.performance.maxMs).toBeLessThan(150);
  expect(result.rendered.performance.averageMs).toBeLessThan(65);
  expect(result.rendered.performance.p95Ms).toBeLessThan(90);
  expect(result.rendered.performance.maxMs).toBeLessThan(150);
});

test("Ghost Train phase two stays bounded with a four-player boss horde and releases all debt", async ({ page }) => {
  test.setTimeout(180_000);
  await openGame(page);
  await Promise.all([
    waitForZombieGpuPrewarm(page),
    waitForGhostTrainGpuPrewarm(page),
    waitForBossShaderFxPrewarm(page),
  ]);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const multiplayer = window.__dustMultiplayerTest;
    multiplayer.startMockHost(["Host", "Guest A", "Guest B", "Guest C"]);
    multiplayer.setPlayerPosition("mock-player-1", -42, -42);
    multiplayer.setPlayerPosition("mock-player-2", 42, -42);
    multiplayer.setPlayerPosition("mock-player-3", -42, 42);
    multiplayer.setPlayerPosition("mock-player-4", 42, 42);
    for (const player of multiplayer.getState().players) multiplayer.setHealth(player.id, 999999);

    game.forceWaveState(10, 0, 0, "ghostTrain");
    game.setGhostTrainAiEnabled(false);
    game.damageGhostTrainTail(9999, true);
    game.advanceGhostTrain(600);
    game.damageGhostTrainTail(9999, true);
    const phaseTwo = game.getGhostTrainDiagnostics();
    const stress = multiplayer.spawnEnemyStressField(543, "map");
    game.forceGhostTrainAction("crossfire", 6.1);
    game.setGhostTrainAiEnabled(true);
    game.advanceRealFrame(17, { render: true });
    game.advanceRealFrame(17, { render: true });
    game.resetFrameTiming();

    const frames = [];
    let maxCannonballs = 0;
    let maxTelegraphs = 0;
    let maxCannonDrawCalls = 0;
    let nextElapsedMs = 1000 / 60;
    for (let index = 0; index < 90; index += 1) {
      const startedAt = performance.now();
      const timing = game.advanceRealFrame(nextElapsedMs, { render: true });
      const workMs = performance.now() - startedAt;
      frames.push({ index, workMs, ...timing });
      nextElapsedMs = Math.max(1000 / 60, Math.min(120, workMs));
      if (index % 10 === 0 || index === 89) {
        const train = game.getGhostTrainDiagnostics();
        maxCannonballs = Math.max(maxCannonballs, train.cannonballs.length);
        maxTelegraphs = Math.max(maxTelegraphs, train.telegraphs.length);
        maxCannonDrawCalls = Math.max(maxCannonDrawCalls, train.cannonVisuals.drawCalls);
      }
    }
    const warmFrames = frames.slice(15);
    const sortedWork = warmFrames.map((frame) => frame.workMs).sort((a, b) => a - b);
    const beforeDefeat = {
      train: game.getGhostTrainDiagnostics(),
      zombies: game.getZombieOptimizationStats(),
      objects: game.getThreeObjectDiagnostics(),
    };
    game.resetFrameTiming();
    game.setSimulationBacklogForTest(300);
    const defeated = game.forceActiveBossDefeat(true);
    const afterDefeat = game.getFrameTimingDiagnostics();
    const transition = game.advanceWaveProgress(8000);
    game.advanceRealFrame(17, { render: false });
    return {
      phaseTwo,
      stress,
      frames,
      performance: {
        averageMs: warmFrames.reduce((sum, frame) => sum + frame.workMs, 0) / warmFrames.length,
        p95Ms: sortedWork[Math.floor(sortedWork.length * 0.95)],
        maxMs: sortedWork[sortedWork.length - 1],
      },
      maxCannonballs,
      maxTelegraphs,
      maxCannonDrawCalls,
      beforeDefeat,
      defeated,
      afterDefeat,
      transition,
      afterTransition: {
        train: game.getGhostTrainDiagnostics(),
        pool: game.getGhostTrainVisualBundlePoolDiagnostics(),
        objects: game.getThreeObjectDiagnostics(),
      },
    };
  });

  expect(result.phaseTwo).toMatchObject({
    active: true,
    phase: 2,
    activeTailIndex: 2,
    cannonInterval: 0.18,
  });
  expect(result.stress).toMatchObject({ added: 543, active: 543, mode: "map" });
  expect(result.frames.every((frame) => frame.pendingMs <= 0.001)).toBe(true);
  expect(result.frames.every((frame) => frame.steps <= 4)).toBe(true);
  expect(result.frames.every((frame) => frame.maxStepMs <= 40.001)).toBe(true);
  expect(result.frames.every((frame) => frame.networkFlushes === 1)).toBe(true);
  expect(result.beforeDefeat.objects.state.enemies).toBeGreaterThanOrEqual(450);
  expect(result.beforeDefeat.objects.spatial.zombies.occupants).toBe(
    result.beforeDefeat.objects.state.enemies
  );
  expect(result.beforeDefeat.zombies.instances).toMatchObject({
    active: true,
    invalidMatrices: 0,
    shadowDrawCalls: 0,
  });
  expect(result.beforeDefeat.zombies.instances.suppressedShadowDrawCalls).toBeGreaterThan(0);
  expect(result.maxCannonballs).toBeGreaterThan(0);
  expect(result.maxCannonballs).toBeLessThanOrEqual(68);
  expect(result.maxTelegraphs).toBeLessThanOrEqual(2);
  expect(result.maxCannonDrawCalls).toBeLessThanOrEqual(5);
  expect(result.performance.averageMs).toBeLessThan(33.4);
  // Cannon salvos and the two delayed wagon blasts can share one software-GPU
  // submit; keep that bounded without making the 50 ms scheduler edge flaky.
  expect(result.performance.p95Ms).toBeLessThan(60);
  expect(result.performance.maxMs).toBeLessThan(150);
  expect(result.defeated).toBe(true);
  expect(result.afterDefeat).toMatchObject({
    pendingMs: 0,
    backlogDroppedMs: 300,
    backlogDropReason: "boss-defeat",
  });
  expect(result.transition.wave).toBe(11);
  expect(result.afterTransition.train.active).toBe(false);
  expect(result.afterTransition.pool).toMatchObject({ inUse: 0, available: 1 });
  expect(result.afterTransition.objects.state.enemies).toBe(0);
  expect(result.afterTransition.objects.spatial.zombies.occupants).toBe(0);
});

test("Sloth, Hordeheart, and Land Eater acquire and return their retained visual pools", async ({ page }) => {
  test.setTimeout(180_000);
  await openGame(page);
  await page.evaluate(() => window.__dustAndDeadTest.clearEnemies());
  await page.waitForFunction(
    () => {
      const diagnostics =
        window.__dustAndDeadTest.getBossVisualPrewarmDiagnostics();
      return diagnostics.completed && diagnostics.geometryGpu?.completed;
    },
    null,
    { timeout: 150_000 }
  );

  const diagnostics = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const snapshots = [];
    game.startWaveNow(10, "slothArchbishop");
    snapshots.push(game.getBossVisualPrewarmDiagnostics());
    game.startWaveNow(1);
    game.startWaveNow(10, "hordeheart");
    game.forceHordeheartPhase("gather");
    game.advanceHordeheart(6000);
    snapshots.push(game.getBossVisualPrewarmDiagnostics());
    game.startWaveNow(1);
    game.startWaveNow(10, "landEater");
    snapshots.push(game.getBossVisualPrewarmDiagnostics());
    game.startWaveNow(1);
    return {
      snapshots,
      final: game.getBossVisualPrewarmDiagnostics(),
    };
  });

  expect(diagnostics.snapshots[0].poolHits.sloth).toBe(1);
  expect(diagnostics.snapshots[1].poolHits).toMatchObject({
    horde: 1,
    hordeFlesh: 1,
    hordeTelegraph: 1,
  });
  expect(diagnostics.snapshots[2].poolHits.land).toBe(1);
  expect(diagnostics.final.coldFallbacks).toEqual({
    sloth: 0,
    horde: 0,
    hordeFlesh: 0,
    hordeTelegraph: 0,
    land: 0,
  });
  expect(diagnostics.final.slothInUse).toBe(false);
  expect(Object.values(diagnostics.final.hordeSlots).every((slot) => !slot.inUse)).toBe(true);
  expect(diagnostics.final.geometryGpu).toMatchObject({
    completed: true,
    pending: false,
    error: "",
  });
  // Keep this above a single headless-OS scheduling quantum: the batches
  // themselves are normally single-digit milliseconds, while this still
  // catches the former monolithic 100+ ms upload.
  expect(diagnostics.final.geometryGpu.maxMs).toBeLessThan(50);
});
