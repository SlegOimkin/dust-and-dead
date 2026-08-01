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
    window.__dustMultiplayerTest?.spawnFireStressField
      && window.__dustAndDeadTest?.getFireOptimizationStats
      && window.__dustAndDeadTest?.getThreeObjectDiagnostics
  ));
}

test("fallback fire releases retired GPU geometry and plateaus across stress cycles", async ({ page }) => {
  test.setTimeout(90000);
  await openGame(page);

  const result = await page.evaluate(() => {
    const multiplayer = window.__dustMultiplayerTest;
    const game = window.__dustAndDeadTest;
    multiplayer.startMockHost(["Host", "Guest"]);
    game.clearFireHazards();
    window.advanceTime(16);
    game.renderNowForTest();

    const baseline = game.getThreeObjectDiagnostics();
    const runCycle = () => {
      multiplayer.spawnFireStressField("mock-player-1", 4000, "visible", 0.2);
      window.advanceTime(16);
      game.renderNowForTest();
      const active = game.getFireOptimizationStats();
      const peak = game.getThreeObjectDiagnostics();

      window.advanceTime(500);
      game.renderNowForTest();
      const settledStats = game.getFireOptimizationStats();
      const settled = game.getThreeObjectDiagnostics();
      return { active, peak, settledStats, settled };
    };

    const cycles = [runCycle(), runCycle(), runCycle(), runCycle()];
    return { baseline, cycles };
  });

  for (const cycle of result.cycles) {
    expect(cycle.active.activePatches).toBe(4000);
    expect(cycle.active.visuals.activeDetailed).toBeLessThanOrEqual(cycle.active.visuals.detailedBudget);
    expect(cycle.active.visuals.activeDetailed + cycle.active.visuals.fallbackVisible).toBe(4000);
    expect(cycle.active.visuals.fallbackDrawCalls).toBeGreaterThan(0);
    expect(cycle.peak.rendererFrame.triangles).toBeLessThan(700000);
    expect(cycle.settledStats.activePatches).toBe(0);
    expect(cycle.settled.state.firePatches).toBe(0);
  }

  const baselineGeometry = result.baseline.rendererMemory.geometries;
  const peakGeometries = result.cycles.map((cycle) => cycle.peak.rendererMemory.geometries);
  const settledGeometries = result.cycles.map((cycle) => cycle.settled.rendererMemory.geometries);

  expect(peakGeometries[0]).toBeGreaterThan(baselineGeometry);
  // Four fallback layers intentionally keep at most one warm spare each.
  expect(settledGeometries[0]).toBeLessThanOrEqual(baselineGeometry + 4);
  for (let index = 0; index < result.cycles.length; index += 1) {
    expect(peakGeometries[index]).toBeGreaterThan(settledGeometries[index]);
  }
  console.log(`FIRE_FALLBACK_GEOMETRY ${JSON.stringify({ baselineGeometry, peakGeometries, settledGeometries })}`);
  expect(settledGeometries[3]).toBe(settledGeometries[2]);
  expect(result.cycles[3].settled.roots.effectRoot.objects).toBe(result.cycles[2].settled.roots.effectRoot.objects);
});
