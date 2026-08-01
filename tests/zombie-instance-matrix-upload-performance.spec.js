const path = require("node:path");
const { expect, test } = require("@playwright/test");

function fileUrl(relativePath) {
  const absolute = path.resolve(__dirname, "..", relativePath).replace(/\\/g, "/");
  return `file:///${absolute}`;
}

async function startHunt(page) {
  await page.goto(`${fileUrl("index.html")}?mapSeed=7331`);
  const intro = page.locator("#intro-screen");
  if (await intro.isVisible().catch(() => false)) await page.keyboard.press("KeyM");
  await page.getByRole("button", { name: "Start Hunt" }).click();
  await page.waitForFunction(() => Boolean(
    window.__dustAndDeadTest?.getZombieInstanceMatrixUploadRangesForTest &&
    window.__dustMultiplayerTest?.spawnEnemyStressField
  ));
}

test("dense host frames upload only the packed visible instance-matrix prefix", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(String(error)));
  await startHunt(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const multiplayer = window.__dustMultiplayerTest;
    game.setAutomaticFrameLoopModeForTest("paused");
    multiplayer.startMockHost(["Host", "Guest One", "Guest Two", "Guest Three"], "matrix-upload-range");
    game.clearEnemies();
    const stress = multiplayer.spawnEnemyStressField(586, "map");

    // The simulation packs every visible mesh into [0, count). Inspect the
    // pending ranges before Three.js consumes and clears them during upload.
    game.advanceRealFrame(1000 / 60, { render: false });
    const instances = game.getZombieOptimizationStats().instances;
    const ranges = game.getZombieInstanceMatrixUploadRangesForTest();
    game.renderNowForTest();

    return {
      stress,
      instances,
      ranges,
      afterRender: game.getZombieOptimizationStats().instances,
      renderer: game.getRendererDiagnosticsForTest(),
    };
  });

  expect(pageErrors).toEqual([]);
  expect(result.stress.active).toBe(586);
  expect(result.instances).toMatchObject({
    active: true,
    attached: true,
    invalidMatrices: 0,
    shadowDrawCalls: 0,
  });
  expect(result.instances.suppressedShadowDrawCalls).toBeGreaterThan(0);
  expect(result.instances.handoff).toMatchObject({
    authoredVisibleGroups: 0,
    emptyFrame: false,
    doubleFrame: false,
  });
  expect(result.instances.handoff.renderVisibleEnemies).toBeGreaterThan(0);

  expect(result.ranges.activeChunks).toBe(result.instances.drawCalls);
  expect(result.ranges.exactRanges).toBe(result.ranges.activeChunks);
  expect(result.ranges.mismatchedRanges).toBe(0);
  expect(result.ranges.uploadedFloats).toBe(result.instances.drawnParts * 16);
  expect(result.instances.matrixUploads.lastUploadedFloats).toBe(result.ranges.uploadedFloats);
  expect(result.instances.matrixUploads.lastFullCapacityFloats).toBe(result.ranges.fullCapacityFloats);
  expect(result.instances.matrixUploads.partialUploads).toBeGreaterThan(0);
  expect(result.instances.matrixUploads.fullUploads).toBe(0);
  expect(result.ranges.uploadedFloats).toBeLessThan(result.ranges.fullCapacityFloats * 0.2);

  expect(result.afterRender.invalidMatrices).toBe(0);
  expect(result.afterRender.crowdShadowBudget.active).toBe(true);
  expect(result.afterRender.handoff).toMatchObject({ emptyFrame: false, doubleFrame: false });
  expect(result.renderer.contextLost).toBe(false);
});
