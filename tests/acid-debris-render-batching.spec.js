const path = require("node:path");
const { expect, test } = require("@playwright/test");

function fileUrl(relativePath, query = "") {
  const absolute = path.resolve(__dirname, "..", relativePath).replace(/\\/g, "/");
  return `file:///${absolute}${query}`;
}

async function startHunt(page, query = "?mapSeed=31") {
  await page.goto(fileUrl("index.html", query));
  const intro = page.locator("#intro-screen");
  if (await intro.isVisible().catch(() => false)) await page.keyboard.press("KeyM");
  await page.getByRole("button", { name: "Start Hunt" }).click();
  await page.waitForFunction(() => window.__dustAndDeadTest && window.render_game_to_text);
}

function meaningfulBrowserErrors(errors) {
  return errors.filter((message) => !/^THREE\.WebGLProgram: Shader Error (?:0|1282) - VALIDATE_STATUS false\s+Program Info Log:\s*$/m.test(message));
}

test("acid and debris batching initializes without renderer errors", async ({ page }) => {
  const browserErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));
  await startHunt(page);
  const stats = await page.evaluate(() => {
    window.__dustAndDeadTest.renderNowForTest();
    return window.__dustAndDeadTest.getThreeObjectDiagnostics().pools;
  });
  expect(stats.acidPuddleVisuals.mode).toBe("instanced");
  expect(stats.acidPuddleVisuals.shaderValidated).toBe(true);
  expect(stats.deathDebrisVisuals.mode).toBe("hybrid-instanced-fade");
  expect(meaningfulBrowserErrors(browserErrors)).toEqual([]);
});

test("forced legacy effect paths remain renderer-clean", async ({ page }) => {
  const browserErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));
  await startHunt(page, "?mapSeed=31&acidVisualFallback=1&debrisVisualFallback=1");
  const stats = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const state = JSON.parse(window.render_game_to_text());
    game.spawnAcidPuddleAt(state.player.x, state.player.z + 2);
    game.spawnAcidProjectileAt(state.player.x, state.player.z, state.player.x, state.player.z + 7);
    game.spawnZombieAt("walker", state.player.x + 1, state.player.z + 3);
    game.killNearestZombie();
    game.renderNowForTest();
    return game.getThreeObjectDiagnostics().pools;
  });
  expect(stats.acidPuddleVisuals).toMatchObject({ mode: "fallback", instanced: false });
  expect(stats.deathDebrisVisuals).toMatchObject({ mode: "legacy-forced", instanced: false });
  expect(stats.deathDebrisVisuals.legacyInstances).toBeGreaterThan(0);
  expect(meaningfulBrowserErrors(browserErrors)).toEqual([]);
});

test("debris batch shader variants remain renderer-clean", async ({ page }) => {
  const browserErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));
  await startHunt(page);
  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    game.clearEnemies();
    const state = JSON.parse(window.render_game_to_text());
    const miner = game.spawnZombieAt("armoredMiner", state.player.x - 2, state.player.z + 5);
    const minerState = game.getEnemyArchetypeDiagnostics().enemies.find((enemy) => enemy.type === "armoredMiner");
    game.setEnemyHp(miner.groupId, minerState.maxHp * 0.18);
    game.spawnZombieAt("walker", state.player.x - 1, state.player.z + 4);
    game.spawnZombieAt("brute", state.player.x + 1, state.player.z + 4);
    game.killNearestZombie();
    game.killNearestZombie();
    game.killNearestZombie();
    game.renderNowForTest();
    return game.getThreeObjectDiagnostics().pools.deathDebrisVisuals;
  });
  expect(result.opaqueInstances + result.legacyInstances).toBe(result.inUse);
  expect(meaningfulBrowserErrors(browserErrors)).toEqual([]);
});

test("maximum visible acid load batches puddles and projectile shadows without changing color order", async ({ page }) => {
  const browserErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));
  await startHunt(page);
  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    game.clearAcidHazards();
    const state = JSON.parse(window.render_game_to_text());
    const { x, z } = state.player;
    for (let index = 0; index < 50; index += 1) {
      const px = x + (index % 10) * 0.7 - 3.15;
      const pz = z + Math.floor(index / 10) * 0.7 - 1.4;
      game.spawnAcidPuddleAt(px, pz);
    }
    for (let index = 0; index < 60; index += 1) {
      const sx = x + (index % 12) * 0.45 - 2.5;
      const sz = z + Math.floor(index / 12) * 0.4 - 1;
      game.spawnAcidProjectileAt(sx, sz, sx, sz + 8);
    }
    game.renderNowForTest();
    const active = game.getAcidPuddleOptimizationStats();
    game.clearAcidHazards();
    game.renderNowForTest();
    const cleared = game.getAcidPuddleOptimizationStats();
    return { active, cleared };
  });

  console.log("ACID_BATCH_METRICS", JSON.stringify({
    projectiles: result.active.visuals.projectiles,
    puddles: result.active.visuals.puddles,
    totalDrawCalls: result.active.visuals.drawCalls,
    mainDrawCalls: result.active.visuals.mainDrawCalls,
    shadowDrawCalls: result.active.visuals.shadowDrawCalls,
    batchDrawCalls: result.active.visuals.batchDrawCalls,
    submittedInstances: result.active.visuals.submittedInstances,
  }));

  expect(result.active).toMatchObject({ activeProjectiles: 60, activePuddles: 50 });
  expect(result.active.visuals).toMatchObject({
    mode: "instanced",
    instanced: true,
    shaderValidated: true,
    drawCalls: 437,
    mainDrawCalls: 430,
    shadowDrawCalls: 7,
    batchDrawCalls: 13,
    submittedInstances: 970,
  });
  expect(result.active.visuals.projectiles).toMatchObject({
    visible: 60,
    colorMode: "legacy-depth-sorted",
    shadowMode: "instanced",
    drawCalls: 420,
    shadowDrawCalls: 7,
    shadowBatchMeshes: 7,
    colorCameraExcluded: true,
    shadowCameraIncluded: true,
    submittedInstances: 420,
    layers: 7,
  });
  expect(result.active.visuals.puddles).toMatchObject({
    visible: 50,
    drawCalls: 10,
    batchMeshes: 6,
    submittedInstances: 550,
    surfaceInstances: 50,
    darkInstances: 50,
    ringInstances: 50,
    foamInstances: 50,
    acidBubbleInstances: 200,
    highlightBubbleInstances: 150,
  });
  expect(result.active.visuals.parity).toMatchObject({
    matrixMismatches: 0,
    opacityMismatches: 0,
    materialMismatches: 0,
    countMismatches: 0,
    shadowMismatches: 0,
  });
  expect(result.active.visuals.parity.maxMatrixError).toBeLessThanOrEqual(0.00001);
  expect(result.active.visuals.parity.maxOpacityError).toBeLessThanOrEqual(0.00001);
  expect(result.cleared).toMatchObject({ activeProjectiles: 0, activePuddles: 0 });
  expect(result.cleared.visuals).toMatchObject({ drawCalls: 0, submittedInstances: 0 });
  expect(meaningfulBrowserErrors(browserErrors)).toEqual([]);
});

test("mass-death debris stays batched through its per-instance fade", async ({ page }) => {
  const browserErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));
  await startHunt(page);
  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    game.clearEnemies();
    game.clearDeathDebris();
    const state = JSON.parse(window.render_game_to_text());
    const { x, z } = state.player;
    for (let index = 0; index < 12; index += 1) {
      game.spawnZombieAt("walker", x + (index % 4) * 0.25 - 0.4, z + 4 + Math.floor(index / 4) * 0.25);
      game.killNearestZombie();
    }
    game.renderNowForTest();
    const opaque = game.getDeathDebrisOptimizationStats();
    window.advanceTime(650);
    game.renderNowForTest();
    const fading = game.getDeathDebrisOptimizationStats();
    window.advanceTime(4000);
    game.renderNowForTest();
    const settled = game.getDeathDebrisOptimizationStats();
    return { opaque, fading, settled };
  });

  console.log("DEBRIS_BATCH_METRICS", JSON.stringify({
    opaque: {
      inUse: result.opaque.inUse,
      opaqueInstances: result.opaque.opaqueInstances,
      legacyInstances: result.opaque.legacyInstances,
      activeBatches: result.opaque.activeBatches,
      drawCalls: result.opaque.drawCalls,
    },
    fading: {
      inUse: result.fading.inUse,
      opaqueInstances: result.fading.opaqueInstances,
      legacyInstances: result.fading.legacyInstances,
      activeBatches: result.fading.activeBatches,
      drawCalls: result.fading.drawCalls,
      fadeHandoffs: result.fading.fadeHandoffs,
    },
  }));

  expect(result.opaque.inUse).toBeGreaterThan(80);
  expect(result.opaque.opaqueInstances).toBeGreaterThan(0);
  expect(result.opaque.drawCalls).toBeLessThan(result.opaque.inUse);
  expect(result.opaque.opaqueInstances + result.opaque.legacyInstances).toBe(result.opaque.inUse);
  expect(result.opaque.parity).toMatchObject({ matrixMismatches: 0, opacityMismatches: 0, materialMismatches: 0, countMismatches: 0, shadowMismatches: 0 });
  expect(result.opaque.parity.maxMatrixError).toBeLessThanOrEqual(0.00001);
  expect(result.fading.opaqueInstances + result.fading.legacyInstances).toBe(result.fading.inUse);
  expect(result.fading.fadeHandoffs).toBe(result.opaque.fadeHandoffs);
  expect(result.fading.drawCalls).toBeLessThanOrEqual(result.opaque.drawCalls);
  expect(result.fading.opacityMin).toBeLessThan(1);
  expect(result.fading.parity).toMatchObject({ matrixMismatches: 0, opacityMismatches: 0, materialMismatches: 0, countMismatches: 0, shadowMismatches: 0 });
  expect(result.fading.parity.maxOpacityError).toBeLessThanOrEqual(0.00001);
  expect(result.settled).toMatchObject({ inUse: 0, activeBatches: 0, opaqueInstances: 0, legacyInstances: 0, drawCalls: 0 });
  expect(meaningfulBrowserErrors(browserErrors)).toEqual([]);
});

test("sparse guest acid upserts stay within the fixed puddle batch capacity", async ({ page }) => {
  await startHunt(page);
  const result = await page.evaluate(() => {
    const api = window.__dustMultiplayerTest;
    const game = window.__dustAndDeadTest;
    const base = api.startMockHost(["Host", "Guest"]);
    const firstSnapshot = api.buildSnapshot();
    api.startMockGuest(["Host", "Guest"], 1);
    api.applySnapshot(firstSnapshot);
    for (let index = 0; index < 65; index += 1) {
      const packet = JSON.parse(JSON.stringify(firstSnapshot));
      packet.sequence = firstSnapshot.sequence + index + 1;
      packet.time = (firstSnapshot.time || 0) + (index + 1) * 0.1;
      delete packet.acidPuddles;
      packet.hazardUpserts = {
        acidPuddles: [{
          id: 1000 + index,
          x: Number(base.players[1].x || 0) + (index % 10) * 0.1,
          z: Number(base.players[1].z || 0) + Math.floor(index / 10) * 0.1,
          radius: 2.55,
          life: 5,
          startLife: 5.8,
        }],
      };
      api.applySnapshot(packet);
    }
    game.renderNowForTest();
    return {
      replicas: api.getGuestCombatReplicas().acidPuddles,
      visuals: game.getAcidPuddleOptimizationStats().visuals,
    };
  });

  expect(result.replicas).toHaveLength(50);
  expect(result.replicas.map((entry) => entry.id).sort((a, b) => a - b)).toEqual(
    Array.from({ length: 50 }, (_, index) => 1015 + index)
  );
  expect(result.visuals.puddles).toMatchObject({ visible: 50, surfaceInstances: 50 });
  expect(result.visuals.parity).toMatchObject({ countMismatches: 0, matrixMismatches: 0 });
});
