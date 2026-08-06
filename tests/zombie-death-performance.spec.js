const path = require("node:path");
const { expect, test } = require("@playwright/test");

function fileUrl(relativePath) {
  const absolute = path.resolve(__dirname, "..", relativePath).replace(/\\/g, "/");
  return `file:///${absolute}`;
}

async function openFirstWave(page) {
  await page.goto(`${fileUrl("index.html")}?mapSeed=7331&zombieDeathPerf=1`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForFunction(() => Boolean(
    window.__dustAndDeadTest &&
    window.DustAndDeadProgression &&
    window.render_game_to_text
  ));
  await page.evaluate(() => window.DustAndDeadProgression.resetForTest());
  const intro = page.locator("#intro-screen");
  if (await intro.isVisible().catch(() => false)) await page.keyboard.press("KeyM");
  await page.getByRole("button", { name: "Start Hunt" }).click();
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).mode === "playing");
}

test("first-wave zombie deaths stay warm and frame-safe", async ({ page }) => {
  await openFirstWave(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    game.setAutomaticFrameLoopModeForTest("paused");
    game.forceWaveState(1, 0, 100);
    game.clearDeathDebris();
    game.clearXpOrbs();

    const world = JSON.parse(window.render_game_to_text());
    const programCountBefore = game.getRendererProgramDiagnostics().length;
    const poolsBefore = game.getThreeObjectDiagnostics().pools;
    const fadeHandoffsBefore = poolsBefore.deathDebrisVisuals.fadeHandoffs;
    const samples = [];

    for (let index = 0; index < 12; index += 1) {
      game.spawnZombieAt(
        "walker",
        world.player.x + (index % 3) * 0.2 - 0.2,
        world.player.z + 4 + Math.floor(index / 3) * 0.15
      );
      const killStartedAt = performance.now();
      const killed = game.killNearestZombie();
      const killMs = performance.now() - killStartedAt;
      const frameStartedAt = performance.now();
      game.advanceRealFrame(1000 / 60);
      const frameMs = performance.now() - frameStartedAt;
      const renderStartedAt = performance.now();
      const renderProfile = game.profileNextRenderForTest();
      const renderMs = performance.now() - renderStartedAt;
      const debrisStats = game.getThreeObjectDiagnostics().pools.deathDebrisVisuals;
      samples.push({
        index: index + 1,
        killed,
        killMs,
        frameMs,
        renderMs,
        renderProfile,
        programs: game.getRendererProgramDiagnostics().length,
        fadeHandoffs: debrisStats.fadeHandoffs,
        debrisDrawCalls: debrisStats.drawCalls,
        toasts: document.querySelectorAll(".progression-toast").length,
      });
    }

    const poolsAfter = game.getThreeObjectDiagnostics().pools;
    const programCountAfter = game.getRendererProgramDiagnostics().length;
    const fadeFrames = [];
    let previousFadeHandoffs = poolsAfter.deathDebrisVisuals.fadeHandoffs;
    for (let frame = 0; frame < 66; frame += 1) {
      const fadeFrameStartedAt = performance.now();
      game.advanceRealFrame(1000 / 60);
      const fadeFrameMs = performance.now() - fadeFrameStartedAt;
      const debrisStats = game.getThreeObjectDiagnostics().pools.deathDebrisVisuals;
      fadeFrames.push({
        frame: frame + 1,
        frameMs: fadeFrameMs,
        handoffDelta: debrisStats.fadeHandoffs - previousFadeHandoffs,
        drawCalls: debrisStats.drawCalls,
      });
      previousFadeHandoffs = debrisStats.fadeHandoffs;
    }
    const poolsAfterFade = game.getThreeObjectDiagnostics().pools;

    return {
      samples,
      fadeFrames,
      programCountBefore,
      programCountAfter,
      fadeHandoffsBefore,
      poolsBefore,
      poolsAfter,
      poolsAfterFade,
      progression: window.DustAndDeadProgression.getSnapshot(),
    };
  });

  console.log("ZOMBIE_DEATH_PERF", JSON.stringify({
    programs: [result.programCountBefore, result.programCountAfter],
    samples: result.samples.map((sample) => ({
      index: sample.index,
      killMs: Number(sample.killMs.toFixed(3)),
      frameMs: Number(sample.frameMs.toFixed(3)),
      renderMs: Number(sample.renderMs.toFixed(3)),
      renderProfileMs: Number((sample.renderProfile?.totalMs || 0).toFixed(3)),
      rendererMs: Number((sample.renderProfile?.rendererMs || 0).toFixed(3)),
      programs: sample.programs,
      fadeHandoffs: sample.fadeHandoffs,
      debrisDrawCalls: sample.debrisDrawCalls,
      toasts: sample.toasts,
    })),
    fade: {
      maxFrameMs: Number(Math.max(...result.fadeFrames.map((frame) => frame.frameMs)).toFixed(3)),
      maxHandoffsPerFrame: Math.max(...result.fadeFrames.map((frame) => frame.handoffDelta)),
      maxDrawCalls: Math.max(...result.fadeFrames.map((frame) => frame.drawCalls)),
    },
  }));

  expect(result.samples.every((sample) => sample.killed)).toBe(true);
  expect(result.progression.stats.killsTotal).toBe(12);
  expect(result.programCountAfter).toBe(result.programCountBefore);
  expect(result.samples.every((sample) => sample.fadeHandoffs === result.fadeHandoffsBefore)).toBe(true);
  expect(Math.max(...result.fadeFrames.map((frame) => frame.handoffDelta))).toBe(0);
  expect(Math.max(...result.fadeFrames.map((frame) => frame.drawCalls))).toBeLessThanOrEqual(12);
  expect(Math.max(...result.fadeFrames.map((frame) => frame.frameMs))).toBeLessThan(120);
  expect(result.poolsAfterFade.deathDebrisVisuals).toMatchObject({
    fadeHandoffs: result.fadeHandoffsBefore,
    legacyInstances: 0,
  });
  expect(result.poolsAfterFade.deathDebrisVisuals.opacityMin).toBeLessThan(1);
  expect(result.poolsAfterFade.deathDebrisVisuals.parity).toMatchObject({
    matrixMismatches: 0,
    opacityMismatches: 0,
    materialMismatches: 0,
    countMismatches: 0,
    shadowMismatches: 0,
  });
  expect(Math.max(...result.samples.map((sample) => sample.killMs))).toBeLessThan(100);
  expect(Math.max(...result.samples.map((sample) => sample.frameMs))).toBeLessThan(120);
  expect(Math.max(...result.samples.map((sample) => sample.renderMs))).toBeLessThan(120);
  expect(result.poolsAfter.deathDebrisVisuals.parity).toMatchObject({
    matrixMismatches: 0,
    materialMismatches: 0,
    countMismatches: 0,
    shadowMismatches: 0,
  });
});

test("the final kill stays frame-safe while inter-wave warming is paced", async ({ page }) => {
  await openFirstWave(page);
  const setup = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    game.setAutomaticFrameLoopModeForTest("paused");
    game.forceWaveState(1, 1, 0);
    game.clearDeathDebris();
    game.clearXpOrbs();
    game.resetBossShaderFxPrewarm();
    const scheduler = game.getHeavyPrewarmSchedulerDiagnostics();
    const startedAt = performance.now();
    const killed = game.killNearestZombie();
    const killMs = performance.now() - startedAt;
    game.clearXpOrbs();
    return {
      killed,
      killMs,
      schedulerRuns: scheduler.runs,
      programs: game.getRendererProgramDiagnostics().length,
    };
  });

  const frames = [];
  for (let index = 0; index < 60; index += 1) {
    await page.waitForTimeout(17);
    frames.push(await page.evaluate((frame) => {
      const game = window.__dustAndDeadTest;
      const startedAt = performance.now();
      const timing = game.advanceRealFrame(1000 / 60, { render: true });
      const workMs = performance.now() - startedAt;
      const scheduler = game.getHeavyPrewarmSchedulerDiagnostics();
      return {
        frame,
        workMs,
        timing,
        schedulerRuns: scheduler.runs,
        schedulerLastJob: scheduler.lastJob,
        schedulerLastJobMs: scheduler.lastJobMs,
        graceSkips: scheduler.skippedCombatGraceFrames,
        cadenceSkips: scheduler.skippedActiveCadenceFrames,
        deferredShadowUpdates: scheduler.deferredShadowUpdates,
        programs: game.getRendererProgramDiagnostics().length,
      };
    }, index + 1));
  }

  const firstJobFrame = frames.find((frame) => (
    frame.schedulerRuns > setup.schedulerRuns
  ))?.frame || Infinity;
  const quietFrames = frames.filter((frame) => frame.frame < firstJobFrame);
  const orderedWork = frames
    .map((frame) => frame.workMs)
    .sort((left, right) => left - right);
  const p95 = orderedWork[Math.floor(orderedWork.length * 0.95)];
  console.log("FINAL_KILL_PREWARM_PERF", JSON.stringify({
    killMs: Number(setup.killMs.toFixed(3)),
    firstJobFrame,
    quietMaxMs: Number(Math.max(...quietFrames.map((frame) => frame.workMs)).toFixed(3)),
    p95Ms: Number(p95.toFixed(3)),
    maxMs: Number(orderedWork.at(-1).toFixed(3)),
    jobs: frames.at(-1).schedulerRuns - setup.schedulerRuns,
    maxJobMs: Number(Math.max(...frames.map((frame) => frame.schedulerLastJobMs)).toFixed(3)),
    topFrames: frames
      .slice()
      .sort((left, right) => right.workMs - left.workMs)
      .slice(0, 5)
      .map((frame) => ({
        frame: frame.frame,
        workMs: Number(frame.workMs.toFixed(3)),
        job: frame.schedulerLastJob,
        jobMs: Number(frame.schedulerLastJobMs.toFixed(3)),
      })),
  }));

  expect(setup.killed).toBe(true);
  expect(setup.killMs).toBeLessThan(6);
  expect(firstJobFrame).toBeGreaterThanOrEqual(25);
  expect(Math.max(...quietFrames.map((frame) => frame.workMs))).toBeLessThan(25);
  expect(p95).toBeLessThan(25);
  expect(orderedWork.at(-1)).toBeLessThan(50);
  expect(frames.every((frame) => frame.programs >= setup.programs)).toBe(true);
  expect(frames.at(-1).graceSkips).toBeGreaterThan(0);
  expect(frames.at(-1).cadenceSkips).toBeGreaterThan(0);
  expect(frames.at(-1).deferredShadowUpdates).toBeGreaterThan(0);
  expect(frames.every((frame) => frame.timing.pendingMs <= 0.001)).toBe(true);
});

test("a crowd drops the horde out of the shadow map without stepping what is left", async ({ page }) => {
  await openFirstWave(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    game.setAutomaticFrameLoopModeForTest("paused");
    game.forceWaveState(1, 0, 400);
    game.clearEnemies();
    const world = JSON.parse(window.render_game_to_text());

    // render_game_to_text caps its enemy list at twelve entries, so the live
    // population has to come from the object diagnostics instead.
    function liveEnemies() {
      return game.getThreeObjectDiagnostics().state.enemies;
    }

    function fill(count) {
      const live = liveEnemies();
      for (let index = live; index < count; index += 1) {
        const angle = (index * 2.399) % (Math.PI * 2);
        const radius = 18 + (index % 40) * 1.6;
        game.spawnZombieAt(
          "walker",
          world.player.x + Math.sin(angle) * radius,
          world.player.z + Math.cos(angle) * radius
        );
      }
      game.advanceRealFrame(1000 / 60);
      const stats = game.getZombieOptimizationStats().instances.crowdShadowBudget;
      return {
        enemies: liveEnemies(),
        active: stats.active,
        shadowAutoUpdate: stats.shadowAutoUpdate,
        updateInterval: stats.updateInterval,
      };
    }

    function thinTo(count) {
      let live = liveEnemies();
      while (live > count && game.killNearestZombie()) {
        live = liveEnemies();
      }
      game.advanceRealFrame(1000 / 60);
      const stats = game.getZombieOptimizationStats().instances.crowdShadowBudget;
      return { enemies: live, active: stats.active, shadowAutoUpdate: stats.shadowAutoUpdate };
    }

    const quiet = fill(60);
    const crowded = fill(260);
    const thinned = thinTo(215);
    const released = thinTo(180);
    return { quiet, crowded, thinned, released };
  });

  // Below the threshold nothing is budgeted at all.
  expect(result.quiet.active).toBe(false);

  // A four-player-sized horde takes the zombies out of the shadow map — that is
  // the saving — but the shadow map itself keeps updating every frame. Skipping
  // frames here is what made bullets and gib debris advance in visible steps
  // while the frame rate stayed high, because with the crowd suppressed they
  // are the only moving casters left.
  expect(result.crowded.enemies).toBeGreaterThanOrEqual(240);
  expect(result.crowded.active).toBe(true);
  expect(result.crowded.shadowAutoUpdate).toBe(true);
  expect(result.crowded.updateInterval).toBe(1);

  // Hysteresis: thinning the horde past the engage point does not immediately
  // flip every shadow in the scene back on, and the release point is lower.
  expect(result.thinned.enemies).toBeLessThan(240);
  expect(result.thinned.active).toBe(true);
  expect(result.released.enemies).toBeLessThan(200);
  expect(result.released.active).toBe(false);
  expect(result.released.shadowAutoUpdate).toBe(true);
});
