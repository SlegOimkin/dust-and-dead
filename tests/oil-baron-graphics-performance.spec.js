const path = require("node:path");
const { expect, test } = require("@playwright/test");

function fileUrl(relativePath) {
  const absolute = path.resolve(__dirname, "..", relativePath).replace(/\\/g, "/");
  return `file:///${absolute}`;
}

async function startHunt(page) {
  await page.goto(`${fileUrl("index.html")}?mapSeed=7331&baronGraphicsAudit=1`);
  const intro = page.locator("#intro-screen");
  if (await intro.isVisible().catch(() => false)) {
    await page.keyboard.press("KeyM");
    await expect(intro).toBeHidden();
  }
  await page.getByRole("button", { name: "Start Hunt" }).click();
  await page.waitForFunction(() => Boolean(
    window.__dustAndDeadTest?.spawnOilDerrickBatch
      && window.__dustAndDeadTest?.getThreeObjectDiagnostics
  ));
  // Zombie instance batches are also registered one displayed frame at a time.
  // Only their CPU-side scene registration can change the live geometry
  // ownership measured below. GPU uploads use a detached 1x1 target and are
  // covered by the dedicated prewarm regression, so do not make this Oil audit
  // wait behind every unrelated boss/background upload.
  await page.evaluate(() => window.__dustAndDeadTest.clearEnemies());
  await expect.poll(async () => page.evaluate(() => {
    const prewarm = window.__dustAndDeadTest
      ?.getZombieOptimizationStats?.()
      ?.instances?.prewarm;
    return prewarm ? {
      cpuComplete: prewarm.cpu?.complete,
      createdChunks: prewarm.cpu?.createdChunks,
      failedChunks: prewarm.gpu?.failedChunks,
      error: prewarm.gpu?.error,
    } : null;
  }), {
    timeout: 60_000,
    intervals: [250],
    message: "zombie instance scene registration should settle before the Oil render audit",
  }).toMatchObject({
    cpuComplete: true,
    failedChunks: 0,
  });
}

test("eight detailed Oil Baron derricks reuse exact static geometry inside the render budget", async ({ page }) => {
  await startHunt(page);
  const result = await page.evaluate(async () => {
    const game = window.__dustAndDeadTest;
    game.startWaveNow(10, "oilBaron");
    game.clearEnemies();
    game.setOilBaronAiEnabled(false);
    const boss = game.getOilBaronDiagnostics().boss;
    game.damageOilBaron(boss.maxHp * 0.4 + 1, true);
    game.advanceOilBaron(34);
    game.forceOilBaronAction("doubles");
    game.advanceOilBaron(1700);

    const player = game.getOilBaronDiagnostics().player;
    const offsets = [
      [-10, -6], [-3.4, -6], [3.4, -6], [10, -6],
      [-10, 1.5], [-3.4, 1.5], [3.4, 1.5], [10, 1.5],
    ];
    const toEntry = ([x, z], index) => ({
      x: player.x + x,
      z: player.z + z,
      options: {
        id: `graphics-budget-${index}`,
        oilRadius: 4.8,
        oilAge: 20,
        angle: index * 0.7,
      },
    });
    game.spawnOilDerrickBatch([toEntry(offsets[0], 0)]);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const one = {
      baron: game.getOilBaronDiagnostics(),
      three: game.getThreeObjectDiagnostics(),
    };

    game.spawnOilDerrickBatch(offsets.slice(1).map((offset, index) => toEntry(offset, index + 1)));
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const cold = {
      baron: game.getOilBaronDiagnostics(),
      three: game.getThreeObjectDiagnostics(),
    };
    const animated = game.advanceOilBaron(167);

    for (let index = 0; index < offsets.length; index += 1) {
      game.igniteOilDerrick(`graphics-budget-${index}`, true);
    }
    game.advanceOilBaron(34);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const hot = {
      baron: game.getOilBaronDiagnostics(),
      three: game.getThreeObjectDiagnostics(),
    };

    const updateSamples = [];
    for (let sample = 0; sample < 5; sample += 1) {
      const startedAt = performance.now();
      game.advanceOilBaron(2000);
      updateSamples.push(performance.now() - startedAt);
    }
    updateSamples.sort((a, b) => a - b);
    return {
      one,
      cold,
      animated,
      hot,
      medianMsFor120Steps: updateSamples[Math.floor(updateSamples.length / 2)],
    };
  });

  const derricks = result.cold.baron.derricks;
  expect(derricks).toHaveLength(8);
  for (const derrick of derricks) {
    expect(derrick).toMatchObject({
      visualVisible: true,
      staticBatched: true,
      staticBatchCount: 2,
      staticBatchSourceCount: 12,
      staticBatchError: "",
    });
    // The static boxes, cylinders and toruses are transformed into shared
    // geometry without changing a single authored triangle.
    expect(derrick.staticBatchTriangles).toBe(derrick.staticBatchSourceTriangles);
    expect(derrick.staticBatchTriangles).toBeGreaterThan(0);
  }

  // Renderer memory also registers unrelated frame-staged background prewarm
  // resources. The live scene graph is the deterministic ownership check:
  // seven more rigs must introduce no new geometry identities at all.
  expect(result.cold.three.roots.scene.uniqueGeometries).toBe(
    result.one.three.roots.scene.uniqueGeometries,
  );
  const animationBefore = result.cold.baron.derricks[0].pumpAnimation;
  const animationAfter = result.animated.derricks[0].pumpAnimation;
  expect(Math.abs(animationAfter.beamRotationZ - animationBefore.beamRotationZ)).toBeGreaterThan(0.001);
  expect(Math.abs(animationAfter.rodY - animationBefore.rodY)).toBeGreaterThan(0.001);
  expect(Math.abs(animationAfter.flywheelRotationZ - animationBefore.flywheelRotationZ)).toBeGreaterThan(0.1);
  expect(Math.abs(animationAfter.counterweightY - animationBefore.counterweightY)).toBeGreaterThan(0.001);
  expect(result.cold.three.rendererFrame.calls).toBeLessThan(270);
  expect(result.hot.three.rendererFrame.calls).toBeLessThan(390);
  expect(result.hot.baron.render).toMatchObject({
    visibleDerricks: 8,
    burningVisible: 8,
    flameCardsVisible: 768,
    flameDrawCalls: 32,
  });
  expect(result.hot.three.rendererFrame.triangles).toBeGreaterThan(result.cold.three.rendererFrame.triangles);

  console.log(`OIL_BARON_GRAPHICS_BUDGET ${JSON.stringify({
    oneDerrickCalls: result.one.three.rendererFrame.calls,
    eightDerrickCalls: result.cold.three.rendererFrame.calls,
    eightBurningDerrickCalls: result.hot.three.rendererFrame.calls,
    coldTriangles: result.cold.three.rendererFrame.triangles,
    hotTriangles: result.hot.three.rendererFrame.triangles,
    sharedGeometryCount: result.cold.three.rendererMemory.geometries,
    medianMsFor120Steps: Number(result.medianMsFor120Steps.toFixed(2)),
  })}`);
});
