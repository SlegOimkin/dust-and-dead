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
  await page.waitForFunction(() => Boolean(window.__dustMultiplayerTest?.spawnEnemyStressField));
}

test.describe.configure({ mode: "serial" });

test("natural zombie spawns stay hidden and distant from every living player", async ({ page }) => {
  await openGame(page);

  const result = await page.evaluate(() => {
    const multiplayer = window.__dustMultiplayerTest;
    const game = window.__dustAndDeadTest;
    multiplayer.startMockHost(["North West", "North East", "South West", "South East"]);
    multiplayer.setPlayerPosition("mock-player-1", -170, -135);
    multiplayer.setPlayerPosition("mock-player-2", 170, -135);
    multiplayer.setPlayerPosition("mock-player-3", -170, 135);
    multiplayer.setPlayerPosition("mock-player-4", 170, 135);
    const spawns = [];
    for (let index = 0; index < 24; index += 1) spawns.push(game.spawnZombieNow());
    return spawns;
  });

  expect(result).toHaveLength(24);
  expect(result.every(Boolean)).toBe(true);
  expect(result.every((spawn) => spawn.outsideAllPlayerViews)).toBe(true);
  expect(result.every((spawn) => spawn.nearestAlivePlayerDistance >= 20)).toBe(true);
  expect(result.every((spawn) => spawn.insideEnemyBounds && !spawn.blocked && spawn.hasClearStep)).toBe(true);
});

test("four-player interest snapshots keep a 1200-enemy world bounded without hiding visible threats", async ({ page }) => {
  await openGame(page);
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));

  const result = await page.evaluate(() => {
    const multiplayer = window.__dustMultiplayerTest;
    const game = window.__dustAndDeadTest;
    const started = multiplayer.startMockHost(["Host", "North", "East", "West"]);
    const spawned = multiplayer.spawnEnemyStressField(1200, "map");
    const diagnostics = started.players.map((player) => multiplayer.getEnemyNetworkDiagnostics(player.id));
    const startedAt = performance.now();
    window.advanceTime(1000);
    const simulationMs = performance.now() - startedAt;
    return {
      spawned,
      diagnostics,
      simulationMs,
      optimization: game.getZombieOptimizationStats(),
      budget: multiplayer.getNetworkBudgetDiagnostics(),
    };
  });

  expect(errors).toEqual([]);
  expect(result.spawned.active).toBe(1200);
  expect(result.budget.protocol).toBe(47);
  expect(result.diagnostics).toHaveLength(4);
  for (const diagnostic of result.diagnostics) {
    expect(diagnostic.total).toBe(1200);
    expect(diagnostic.invalidEnemies).toBe(0);
    expect(diagnostic.missingVisible).toEqual([]);
    expect(diagnostic.selected).toBeGreaterThanOrEqual(diagnostic.visible);
    expect(diagnostic.selected).toBeLessThan(240);
    expect(diagnostic.bytes).toBeLessThan(32 * 1024);
  }
  expect(new Set(result.diagnostics.map((entry) => entry.ids.join(","))).size).toBeGreaterThan(1);
  expect(result.optimization.grid.occupants).toBe(1200);
  expect(result.optimization.grid.separationChecks).toBeLessThanOrEqual(1200 * 32);
  expect(result.optimization.instances.active).toBe(true);
  expect(result.optimization.instances.attached).toBe(true);
  expect(result.optimization.instances.drawCalls).toBeLessThan(100);
  expect(result.optimization.instances.invalidMatrices).toBe(0);
  expect(result.simulationMs).toBeLessThan(5000);
});

test("leaving an interest scope is silent while a visible authoritative death stays rich", async ({ page }) => {
  await openGame(page);

  const result = await page.evaluate(() => {
    const multiplayer = window.__dustMultiplayerTest;
    const game = window.__dustAndDeadTest;
    const started = multiplayer.startMockHost(["Host", "Guest"]);
    const guest = started.players[1];
    game.spawnZombieAt("brute", guest.x + 4, guest.z);
    const visible = JSON.parse(JSON.stringify(multiplayer.buildSnapshot(false, false, "mock-player-2")));

    multiplayer.setPlayerPosition("mock-player-2", guest.x + 150, guest.z - 120);
    const leftScope = JSON.parse(JSON.stringify(multiplayer.buildSnapshot(false, false, "mock-player-2")));
    multiplayer.setPlayerPosition("mock-player-2", guest.x, guest.z);
    const returned = JSON.parse(JSON.stringify(multiplayer.buildSnapshot(false, false, "mock-player-2")));
    const died = JSON.parse(JSON.stringify(returned));
    died.sequence += 1;
    died.enemies = [];

    multiplayer.startMockGuest(["Host", "Guest"], 1);
    multiplayer.applySnapshot(visible);
    const beforeLeave = multiplayer.getNetworkCombatDiagnostics();
    multiplayer.applySnapshot(leftScope);
    const afterLeave = {
      effects: multiplayer.getNetworkCombatDiagnostics(),
      replicas: multiplayer.getGuestEnemyDiagnostics(),
    };
    multiplayer.applySnapshot(returned);
    const afterReturn = multiplayer.getGuestEnemyDiagnostics();
    multiplayer.applySnapshot(died);
    const afterDeath = multiplayer.getNetworkCombatDiagnostics();
    return { beforeLeave, afterLeave, afterReturn, afterDeath };
  });

  expect(result.afterLeave.replicas).toEqual([]);
  expect(result.afterLeave.effects.debris).toBe(result.beforeLeave.debris);
  expect(result.afterLeave.effects.decals).toBe(result.beforeLeave.decals);
  expect(result.afterReturn).toHaveLength(1);
  expect(result.afterReturn[0].visualParts).toBeGreaterThan(8);
  expect(result.afterDeath.debris).toBeGreaterThan(result.afterLeave.effects.debris);
  expect(result.afterDeath.decals).toBeGreaterThan(result.afterLeave.effects.decals);
});

test("one thousand on-screen zombies retain full model parts through bounded instance batches", async ({ page }) => {
  await openGame(page);
  const result = await page.evaluate(() => {
    const multiplayer = window.__dustMultiplayerTest;
    const game = window.__dustAndDeadTest;
    multiplayer.startMockHost(["Host", "Guest"]);
    multiplayer.spawnEnemyStressField(1000, "visible");
    const startedAt = performance.now();
    window.advanceTime(16);
    const initialFrameMs = performance.now() - startedAt;
    const firstFrame = game.getZombieOptimizationStats();
    const frameSamples = [];
    for (let frame = 0; frame < 12; frame += 1) {
      const frameStartedAt = performance.now();
      window.advanceTime(16);
      frameSamples.push(performance.now() - frameStartedAt);
    }
    return {
      frameMs: initialFrameMs,
      frameSamples,
      firstFrame,
      optimization: game.getZombieOptimizationStats(),
    };
  });

  expect(result.optimization.grid.occupants).toBe(1000);
  expect(result.optimization.instances.active).toBe(true);
  expect(result.optimization.instances.attached).toBe(true);
  expect(result.optimization.instances.drawCalls).toBeLessThan(100);
  expect(result.optimization.instances.drawnParts).toBeGreaterThan(10000);
  expect(result.optimization.instances.invalidMatrices).toBe(0);
  expect(result.optimization.instances.maxScale).toBeLessThan(2);
  expect(result.firstFrame.instances.batchCacheMisses).toBeGreaterThan(0);
  expect(result.optimization.instances.batchCacheMisses).toBe(result.firstFrame.instances.batchCacheMisses);
  // The per-zombie hierarchy now retains its resolved record array, so warm
  // frames bypass the shared cache lookup entirely instead of incrementing a
  // hit counter on every mesh leaf.
  expect(result.optimization.instances.batchCacheHits).toBe(result.firstFrame.instances.batchCacheHits);
  expect(result.firstFrame.instances.batchKeyBuilds).toBe(result.firstFrame.instances.batches);
  expect(result.optimization.instances.batchKeyBuilds).toBe(result.firstFrame.instances.batchKeyBuilds);
  expect(result.optimization.instances.hierarchyFallbackBuilds).toBe(0);
  expect(result.frameMs).toBeLessThan(5000);
});

test("a dense wave reuses offscreen GPU-ready zombie chunks with a single-frame visual handoff", async ({ page }) => {
  await openGame(page);
  await page.waitForFunction(() => {
    const prewarm = window.__dustAndDeadTest?.getZombieOptimizationStats?.().instances?.prewarm;
    return Boolean(
      prewarm?.complete &&
      prewarm.cpu?.complete &&
      prewarm.gpu?.complete &&
      prewarm.cpu.createdChunks > 0 &&
      prewarm.gpu.readyChunks === prewarm.cpu.createdChunks
    );
  });

  const result = await page.evaluate(() => {
    const multiplayer = window.__dustMultiplayerTest;
    const game = window.__dustAndDeadTest;
    multiplayer.startMockHost(["Host", "Guest"]);
    const before = game.getZombieOptimizationStats().instances;
    const firstSpawn = multiplayer.spawnEnemyStressField(47, "visible");
    window.advanceTime(16);
    const belowThreshold = game.getZombieOptimizationStats().instances;
    const thresholdSpawn = multiplayer.spawnEnemyStressField(1, "visible");
    window.advanceTime(16);
    const after = game.getZombieOptimizationStats().instances;
    return { before, belowThreshold, after, firstSpawn, thresholdSpawn };
  });

  expect(result.before.prewarm.complete).toBe(true);
  expect(result.before.prewarm.cpu).toMatchObject({ complete: true, remainingSources: 0 });
  expect(result.before.prewarm.cpu.processedSources).toBe(result.before.prewarm.cpu.totalSources);
  expect(result.before.prewarm.cpu.createdChunks).toBeGreaterThan(0);
  expect(result.before.chunks).toBe(result.before.prewarm.cpu.createdChunks);
  expect(result.before.prewarm.gpu).toMatchObject({
    complete: true,
    finished: true,
    remainingChunks: 0,
    failedChunks: 0,
    canvasPasses: 0,
    zeroVisiblePixels: true,
    renderTarget: "private-1x1",
    error: "",
  });
  expect(result.before.prewarm.gpu.readyChunks).toBe(result.before.chunks);
  expect(result.before.prewarm.gpu.offscreenPasses).toBe(result.before.prewarm.gpu.readyChunks);
  expect(result.firstSpawn.active).toBe(47);
  expect(result.belowThreshold.active).toBe(false);
  expect(result.belowThreshold.threshold).toBe(48);
  expect(result.belowThreshold.releaseThreshold).toBe(24);
  expect(result.belowThreshold.handoff.renderVisibleEnemies).toBe(47);
  expect(result.belowThreshold.handoff.authoredVisibleGroups).toBe(47);
  expect(result.belowThreshold.handoff.instancedVisibleChunks).toBe(0);
  expect(result.belowThreshold.handoff.emptyFrame).toBe(false);
  expect(result.belowThreshold.handoff.doubleFrame).toBe(false);
  expect(result.thresholdSpawn.active).toBe(48);
  expect(result.after.active).toBe(true);
  expect(result.after.chunks).toBe(result.before.chunks);
  expect(result.after.batchKeyBuilds).toBe(result.before.batchKeyBuilds);
  expect(result.after.drawnParts).toBeGreaterThan(48);
  expect(result.after.invalidMatrices).toBe(0);
  expect(result.after.handoff.renderVisibleEnemies).toBe(48);
  expect(result.after.handoff.authoredVisibleGroups).toBe(0);
  expect(result.after.handoff.instancedVisibleChunks).toBeGreaterThan(0);
  expect(result.after.handoff.emptyFrame).toBe(false);
  expect(result.after.handoff.doubleFrame).toBe(false);
  expect(result.after.prewarm.gpu.offscreenPasses).toBe(result.before.prewarm.gpu.offscreenPasses);
  expect(result.after.prewarm.gpu.canvasPasses).toBe(0);
});

test("zombies visible to a distant guest keep full-rate host simulation", async ({ page }) => {
  await openGame(page);
  const result = await page.evaluate(() => {
    const multiplayer = window.__dustMultiplayerTest;
    const game = window.__dustAndDeadTest;
    multiplayer.startMockHost(["Host", "Distant Guest"]);
    multiplayer.setPlayerPosition("mock-player-1", -120, -90);
    multiplayer.setPlayerPosition("mock-player-2", 110, 80);
    const guest = multiplayer.getState().players[1];
    // This is just beyond the horizontal camera edge, inside the approach
    // margin where simulation must already be smooth before it becomes visible.
    const zombie = game.spawnZombieAt("walker", guest.x + 19, guest.z);
    window.advanceTime(34);
    return { guest, zombie, optimization: game.getZombieOptimizationStats() };
  });

  expect(Math.hypot(result.zombie.x - result.guest.x, result.zombie.z - result.guest.z)).toBeLessThan(22);
  expect(result.optimization.grid.fullRateUpdates).toBe(1);
  expect(result.optimization.grid.farRateSkips).toBe(0);
  expect(result.optimization.grid.offscreenEngagedSkips).toBe(0);
});

test("five thousand finite fire patches use local spatial queries and leave no stale cells", async ({ page }) => {
  await openGame(page);
  const result = await page.evaluate(() => {
    const multiplayer = window.__dustMultiplayerTest;
    const game = window.__dustAndDeadTest;
    multiplayer.startMockHost(["Host", "Guest"]);
    const spawned = multiplayer.spawnFireStressField("mock-player-1", 5000, "map", 0.1);
    const snapshot = multiplayer.buildSnapshot(true, true, "mock-player-2");
    const active = game.getFireOptimizationStats();
    window.advanceTime(250);
    const expired = game.getFireOptimizationStats();
    return { spawned, snapshotCount: snapshot.firePatches.length, active, expired };
  });

  expect(result.spawned.active).toBe(5000);
  expect(result.active.spatialGrid.occupants).toBe(5000);
  expect(result.snapshotCount).toBeLessThan(1000);
  expect(result.active.spatialGrid.lastCandidateChecks).toBeLessThan(1000);
  expect(result.expired.activePatches).toBe(0);
  expect(result.expired.spatialGrid.occupants).toBe(0);
  expect(result.expired.spatialGrid.cells).toBe(0);
});

test("spatial fire candidates preserve authoritative zombie damage", async ({ page }) => {
  await openGame(page);
  const result = await page.evaluate(() => {
    const multiplayer = window.__dustMultiplayerTest;
    const game = window.__dustAndDeadTest;
    const started = multiplayer.startMockHost(["Host", "Guest"]);
    const host = started.players[0];
    game.spawnZombieAt("walker", host.x + 1.2, host.z);
    const beforeSnapshot = multiplayer.buildSnapshot(false, false, "mock-player-1");
    const before = beforeSnapshot.enemies[0];
    multiplayer.spawnFirePatch("mock-player-1", {
      x: before.x,
      z: before.z,
      radius: 1.5,
      life: 2,
      damage: 4,
    });
    window.advanceTime(500);
    const after = multiplayer.buildSnapshot(false, false, "mock-player-1").enemies.find((enemy) => enemy.id === before.id);
    return { before, after };
  });

  expect(result.after == null || result.after.hp < result.before.hp).toBe(true);
});
