const path = require("node:path");
const { expect, test } = require("@playwright/test");

function fileUrl(relativePath) {
  const absolute = path.resolve(__dirname, "..", relativePath).replace(/\\/g, "/");
  return `file:///${absolute}`;
}

async function startHunt(page) {
  await page.goto(`${fileUrl("index.html")}?mapSeed=7331&lightFlashBudgetAudit=1`);
  const intro = page.locator("#intro-screen");
  if (await intro.isVisible().catch(() => false)) {
    await page.keyboard.press("KeyM");
    await expect(intro).toBeHidden();
  }
  await page.getByRole("button", { name: "Start Hunt" }).click();
  await page.waitForFunction(() => Boolean(
    window.__dustAndDeadTest?.setLightFlashStressCount
      && window.__dustAndDeadTest?.getLightFlashRenderBudgetDiagnostics
      && window.__dustAndDeadTest?.renderNowForTest
  ));
  await page.evaluate(() => window.__dustAndDeadTest.clearEnemies());
  await expect.poll(async () => page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const train = game?.getGhostTrainVisualBundlePoolDiagnostics?.();
    const bossFx = game?.getBossShaderFxPrewarmDiagnostics?.();
    const bossVisual = game?.getBossVisualPrewarmDiagnostics?.();
    const zombies = game?.getZombieOptimizationStats?.().instances?.prewarm;
    const doppel = game?.getDoppelgangerVisualPoolDiagnostics?.();
    return Boolean(
      train?.prewarm?.completed &&
      train?.prewarm?.gpuReady &&
      bossFx?.completed &&
      bossVisual?.completed &&
      bossVisual?.geometryGpu?.completed &&
      zombies?.complete &&
      zombies?.gpu?.complete &&
      doppel?.prewarm?.completed
    );
  }), {
    timeout: 150_000,
    intervals: [250],
    message: "all staged render resources should settle before timing light flashes",
  }).toBe(true);
}

test("0..40 overlapping logical flashes keep exactly four visible render lights and one shader variant", async ({ page }) => {
  test.setTimeout(180_000);
  const pageErrors = [];
  const consoleErrors = [];
  page.on("pageerror", (error) => pageErrors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  await startHunt(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    game.clearEnemies();
    game.clearLightFlashStress();
    game.renderNowForTest();
    game.renderNowForTest();

    const initialObjects = game.getThreeObjectDiagnostics();
    const counts = [0, 1, 2, 4, 8, 16, 24, 40, 3, 32, 0, 40, 0];
    const samples = [];
    for (const count of counts) {
      game.setLightFlashStressCount(count);
      const frameTimes = [];
      for (let frame = 0; frame < 6; frame += 1) {
        const startedAt = performance.now();
        game.renderNowForTest();
        frameTimes.push(performance.now() - startedAt);
      }
      const sustainedFrameTimes = frameTimes.slice().sort((a, b) => a - b).slice(0, -1);
      const diagnostics = game.getLightFlashRenderBudgetDiagnostics();
      const objects = game.getThreeObjectDiagnostics();
      samples.push({
        count,
        diagnostics,
        parity: game.getLightFlashFieldParityDiagnostics(),
        rendererCalls: objects.rendererFrame?.calls || 0,
        maxFrameMs: Math.max(...frameTimes),
        averageFrameMs: frameTimes.reduce((sum, value) => sum + value, 0) / frameTimes.length,
        sustainedAverageFrameMs: sustainedFrameTimes.reduce((sum, value) => sum + value, 0)
          / sustainedFrameTimes.length,
      });
    }

    const layoutSamples = {};
    for (const layout of ["separated", "clustered"]) {
      game.setLightFlashStressCount(40, layout === "separated" ? "separated" : "clustered");
      const frameTimes = [];
      for (let frame = 0; frame < 6; frame += 1) {
        const startedAt = performance.now();
        game.renderNowForTest();
        frameTimes.push(performance.now() - startedAt);
      }
      const sustainedFrameTimes = frameTimes.slice().sort((a, b) => a - b).slice(0, -1);
      layoutSamples[layout] = {
        diagnostics: game.getLightFlashRenderBudgetDiagnostics(),
        maxFrameMs: Math.max(...frameTimes),
        averageFrameMs: frameTimes.reduce((sum, value) => sum + value, 0) / frameTimes.length,
        sustainedAverageFrameMs: sustainedFrameTimes.reduce((sum, value) => sum + value, 0)
          / sustainedFrameTimes.length,
      };
    }
    game.setLightFlashStressCount(40, "clustered");
    const mixedFadeEntries = game.setLightFlashStressFades([
      1,
      ...new Array(39).fill(0.01),
    ]);
    game.renderNowForTest();
    const mixedFadeDiagnostics = game.getLightFlashRenderBudgetDiagnostics();

    game.clearLightFlashStress();
    game.renderNowForTest();
    const finalDiagnostics = game.getLightFlashRenderBudgetDiagnostics();
    const finalObjects = game.getThreeObjectDiagnostics();
    game.recoverRenderer();
    const recoveredIdle = game.getLightFlashRenderBudgetDiagnostics();
    // Renderer recreation has its own one-time canvas/driver submit. Pay that
    // baseline before timing the first recovered flash so this assertion
    // measures the flash shader path rather than generic context startup.
    game.renderNowForTest();
    game.setLightFlashStressCount(1);
    const programsBeforeFirstRecoveredFlash = game.getLightFlashRenderBudgetDiagnostics().rendererPrograms;
    const recoveredFirstFlashStartedAt = performance.now();
    game.renderNowForTest();
    const recoveredFirstFlashMs = performance.now() - recoveredFirstFlashStartedAt;
    const recoveredActive = game.getLightFlashRenderBudgetDiagnostics();
    game.clearLightFlashStress();
    return {
      initialObjects,
      finalObjects,
      finalDiagnostics,
      samples,
      layoutSamples,
      mixedFadeEntries,
      mixedFadeDiagnostics,
      recoveredIdle,
      recoveredActive,
      programsBeforeFirstRecoveredFlash,
      recoveredFirstFlashMs,
    };
  });

  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
  const programCounts = new Set();
  const renderBudget = result.samples[0].diagnostics.budget;
  for (const sample of result.samples) {
    const diagnostics = sample.diagnostics;
    expect(diagnostics.stable, `fixed slots @ ${sample.count}`).toBe(true);
    expect(diagnostics.renderSlots, `render slots @ ${sample.count}`).toBe(renderBudget);
    expect(diagnostics.attached, `attached slots @ ${sample.count}`).toBe(renderBudget);
    expect(diagnostics.visibleSlots, `visible slots @ ${sample.count}`).toBe(renderBudget);
    expect(diagnostics.logicalActive, `logical flashes @ ${sample.count}`).toBe(sample.count);
    expect(diagnostics.assigned, `assigned slots @ ${sample.count}`).toBe(Math.min(renderBudget, sample.count));
    expect(diagnostics.zeroIntensity, `idle slots @ ${sample.count}`).toBe(renderBudget - Math.min(renderBudget, sample.count));
    expect(diagnostics.contributors, `merged contributors @ ${sample.count}`).toBe(sample.count);
    expect(diagnostics.droppedContributors, `dropped contributors @ ${sample.count}`).toBe(0);
    expect(diagnostics.energyRatio, `preserved light energy @ ${sample.count}`).toBeCloseTo(1, 5);
    expect(
      diagnostics.slots.reduce((sum, slot) => sum + slot.mergedCount, 0),
      `cluster membership @ ${sample.count}`
    ).toBe(sample.count);
    expect(diagnostics.groundGlow, `ground glow @ ${sample.count}`).toMatchObject({
      created: 1,
      attached: true,
      visible: true,
      capacity: 40,
      currentCount: sample.count,
      active: sample.count,
      hidden: 40 - sample.count,
      drawCalls: sample.count > 0 ? 1 : 0,
      hasInstanceColor: true,
      warmed: true,
      stable: true,
    });
    expect(diagnostics.coverageError, `cluster displacement @ ${sample.count}`).toBeLessThan(0.3);
    if (sample.count > 0) {
      expect(sample.parity.localColorInstances, `local glow instances @ ${sample.count}`).toBe(sample.count);
      expect(sample.parity.localColorTopologyCoverage, `local glow topology @ ${sample.count}`).toBe(1);
      expect(sample.parity.localColorBufferSimilarity, `local glow color buffer @ ${sample.count}`).toBeCloseTo(1, 5);
      expect(sample.parity.localColorBufferMinimum, `minimum local glow color fidelity @ ${sample.count}`).toBeCloseTo(1, 5);
      expect(sample.parity.normalizedColorError, `perceptual color parity @ ${sample.count}`).toBeLessThan(0.26);
      expect(sample.parity.brightnessRatio, `brightness parity @ ${sample.count}`).toBeGreaterThan(0.9);
      expect(sample.parity.brightnessRatio, `brightness parity @ ${sample.count}`).toBeLessThan(1.15);
      expect(sample.parity.colorEnergyRatio, `color coverage @ ${sample.count}`).toBeGreaterThan(0.9);
      expect(sample.parity.colorEnergyRatio, `color coverage @ ${sample.count}`).toBeLessThan(1.15);
      expect(sample.parity.coverageRatio, `spatial coverage @ ${sample.count}`).toBeGreaterThan(0.9);
      expect(sample.parity.coverageRatio, `spatial coverage @ ${sample.count}`).toBeLessThan(1.25);
    }
    // A single headless SwiftShader submit can be descheduled by the OS even
    // with no logical flashes. Guard sustained cost separately from a true
    // multi-frame hitch instead of treating one scheduler outlier as a shader
    // regression.
    expect(sample.sustainedAverageFrameMs, `sustained render cost @ ${sample.count}`)
      .toBeLessThan(45);
    expect(sample.maxFrameMs, `render hitch @ ${sample.count}`).toBeLessThan(90);
    programCounts.add(diagnostics.rendererPrograms);
  }

  expect(programCounts.size, "PointLight count must not create extra shader programs").toBe(1);
  expect(result.layoutSamples.separated.diagnostics.groundGlow).toMatchObject({
    active: 40,
    currentCount: 40,
    minimumCrowdScale: 1,
    averageCrowdScale: 1,
  });
  expect(result.layoutSamples.clustered.diagnostics.groundGlow.active).toBe(40);
  expect(result.layoutSamples.clustered.diagnostics.groundGlow.minimumCrowdScale).toBeLessThan(0.6);
  expect(result.layoutSamples.clustered.diagnostics.groundGlow.averageCrowdScale).toBeLessThan(0.7);
  expect(result.layoutSamples.separated.sustainedAverageFrameMs).toBeLessThan(45);
  expect(result.layoutSamples.clustered.sustainedAverageFrameMs).toBeLessThan(45);
  expect(result.layoutSamples.separated.maxFrameMs).toBeLessThan(90);
  expect(result.layoutSamples.clustered.maxFrameMs).toBeLessThan(90);
  expect(result.layoutSamples.separated.diagnostics.rendererPrograms)
    .toBe(result.layoutSamples.clustered.diagnostics.rendererPrograms);
  expect(result.mixedFadeEntries[0].glowCrowdScale).toBeGreaterThan(0.65);
  expect(result.mixedFadeEntries.slice(1).every((entry) => entry.intensity > 0 && entry.intensity < 0.08)).toBe(true);
  expect(result.mixedFadeDiagnostics.groundGlow.active).toBe(40);
  expect(result.mixedFadeDiagnostics.rendererPrograms)
    .toBe(result.layoutSamples.clustered.diagnostics.rendererPrograms);
  expect(result.finalDiagnostics).toMatchObject({
    stable: true,
    logicalActive: 0,
    logicalInUse: 0,
    logicalAvailable: 40,
    renderSlots: renderBudget,
    attached: renderBudget,
    visibleSlots: renderBudget,
    assigned: 0,
    zeroIntensity: renderBudget,
    groundGlow: {
      created: 1,
      attached: true,
      visible: true,
      capacity: 40,
      currentCount: 0,
      active: 0,
      hidden: 40,
      drawCalls: 0,
      warmed: true,
      stable: true,
    },
  });
  expect(result.finalObjects.roots.scene.lights).toBe(result.initialObjects.roots.scene.lights);
  expect(result.finalObjects.roots.scene.objects).toBe(result.initialObjects.roots.scene.objects);
  expect(result.recoveredIdle.groundGlow).toMatchObject({
    created: 1,
    attached: true,
    currentCount: 0,
    active: 0,
    warmed: true,
    stable: true,
  });
  expect(result.recoveredActive.groundGlow).toMatchObject({
    created: 1,
    attached: true,
    currentCount: 1,
    active: 1,
    warmed: true,
    stable: true,
  });
  expect(result.recoveredActive.rendererPrograms).toBe(result.programsBeforeFirstRecoveredFlash);
  expect(result.recoveredFirstFlashMs).toBeLessThan(25);
});
