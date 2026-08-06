const path = require("node:path");
const { expect, test } = require("@playwright/test");

test.setTimeout(120000);

function fileUrl(relativePath) {
  const absolute = path.resolve(__dirname, "..", relativePath).replace(/\\/g, "/");
  return `file:///${absolute}`;
}

async function openGame(page) {
  await page.goto(`${fileUrl("index.html")}?mapSeed=9107`);
  const intro = page.locator("#intro-screen");
  if (await intro.isVisible().catch(() => false)) {
    await page.keyboard.press("KeyM");
    await expect(intro).toBeHidden();
  }
  await page.waitForFunction(() => Boolean(
    window.__dustMultiplayerTest &&
    window.__dustAndDeadTest?.getFireOptimizationStats &&
    window.advanceTime
  ));
}

test("both 100-fire GPU slot pools are fully ready before any player can unlock mass fire", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const hostPage = await context.newPage();
  const guestPage = await context.newPage();
  await openGame(hostPage);
  await openGame(guestPage);

  const hostTrigger = await hostPage.evaluate(() => {
    const multiplayer = window.__dustMultiplayerTest;
    const game = window.__dustAndDeadTest;
    multiplayer.startMockHost(["Host", "Demolitionist"]);
    const before = game.getFireOptimizationStats().visuals;
    multiplayer.setProgression("mock-player-2", {
      level: 5,
      playerClass: "demolitionist",
      weapon: "launcher",
      ownedWeapons: { revolver: true, rifle: false, launcher: true, coachGun: false },
    });
    const immediatelyAfterChoice = game.getFireOptimizationStats().visuals;
    const snapshot = JSON.parse(JSON.stringify(multiplayer.buildSnapshot(false, false, "mock-player-2")));
    window.advanceTime(1000);
    const afterOneSecond = game.getFireOptimizationStats().visuals;
    return { before, immediatelyAfterChoice, afterOneSecond, snapshot };
  });

  expect(hostTrigger.before.fullPrewarm).toMatchObject({ requested: true, completed: true, target: 200, targetPerPool: 100 });
  expect(hostTrigger.before.totalCreated).toBe(200);
  expect(hostTrigger.before.gpu).toMatchObject({
    enabled: true,
    preparedSlots: 200,
    preparedMaterials: 17,
    compiledMaterials: 17,
    gpuAnimated: true,
  });
  expect(hostTrigger.immediatelyAfterChoice.totalCreated).toBe(hostTrigger.before.totalCreated);
  expect(hostTrigger.afterOneSecond.totalCreated).toBe(hostTrigger.before.totalCreated);
  expect(hostTrigger.snapshot.players.some((player) => player.progression?.playerClass === "demolitionist")).toBe(true);

  const guestTrigger = await guestPage.evaluate((snapshot) => {
    const multiplayer = window.__dustMultiplayerTest;
    const game = window.__dustAndDeadTest;
    multiplayer.startMockGuest(["Host", "Demolitionist"], 1);
    const before = game.getFireOptimizationStats().visuals;
    multiplayer.applySnapshot(snapshot);
    const immediatelyAfterSnapshot = game.getFireOptimizationStats().visuals;
    window.advanceTime(1000);
    const afterOneSecond = game.getFireOptimizationStats().visuals;
    return { before, immediatelyAfterSnapshot, afterOneSecond };
  }, hostTrigger.snapshot);

  expect(guestTrigger.before.fullPrewarm).toMatchObject({ requested: true, completed: true, target: 200, targetPerPool: 100 });
  expect(guestTrigger.before.totalCreated).toBe(200);
  expect(guestTrigger.immediatelyAfterSnapshot.totalCreated).toBe(guestTrigger.before.totalCreated);
  expect(guestTrigger.afterOneSecond.totalCreated).toBe(guestTrigger.before.totalCreated);

  for (const ready of [hostTrigger.afterOneSecond, guestTrigger.afterOneSecond]) {
    expect(ready.fullPrewarm.completed).toBe(true);
    expect(ready.fullPrewarm.target).toBe(200);
    expect(ready.fullPrewarm.targetPerPool).toBe(100);
    expect(ready.totalCreated).toBe(200);
    expect(ready.separatePools).toBe(true);
    expect(ready.standard.created).toBe(100);
    expect(ready.trail.created).toBe(100);
    expect(ready.standard.available + ready.standard.inUse).toBe(100);
    expect(ready.trail.available + ready.trail.inUse).toBe(100);
    expect(ready.gpu.compiledMaterials).toBe(ready.gpu.preparedMaterials);
    expect(ready.gpu.drawCalls).toBe(0);
  }

  await context.close();
});

test("the completed standard and trail pools do not allocate beyond their separate 100-unit reserves", async ({ page }) => {
  await openGame(page);

  const result = await page.evaluate(() => {
    const multiplayer = window.__dustMultiplayerTest;
    const game = window.__dustAndDeadTest;
    const started = multiplayer.startMockHost(["Demolitionist", "Guest"]);
    multiplayer.setProgression("mock-player-1", {
      level: 5,
      playerClass: "demolitionist",
      weapon: "launcher",
      ownedWeapons: { revolver: true, rifle: false, launcher: true, coachGun: false },
    });
    window.advanceTime(4000);
    window.advanceTime(4000);
    window.advanceTime(4000);
    window.advanceTime(4000);
    window.advanceTime(4000);
    const player = started.players[0];

    function fill(type) {
      for (let index = 0; index < 100; index++) {
        multiplayer.spawnFirePatch("mock-player-1", {
          x: player.x + (index % 10) * 0.22 - 1,
          z: player.z + Math.floor(index / 10) * 0.22 - 1,
          radius: 0.7,
          life: 20,
          type,
        });
      }
      window.advanceTime(150);
      return game.getFireOptimizationStats().visuals;
    }

    const trail = fill("trail");
    game.clearFireHazards();
    const cleared = game.getFireOptimizationStats().visuals;
    const standard = fill("standard");
    return { trail, cleared, standard };
  });

  expect(result.trail.totalCreated).toBe(200);
  expect(result.trail.activeDetailed).toBe(100);
  expect(result.trail.trail.inUse).toBe(100);
  expect(result.cleared.activeDetailed).toBe(0);
  expect(result.cleared.standard.available).toBe(100);
  expect(result.cleared.trail.available).toBe(100);
  expect(result.standard.totalCreated).toBe(200);
  expect(result.standard.activeDetailed).toBe(100);
  expect(result.standard.standard.inUse).toBe(100);
  expect(result.standard.gpu.gpuAnimated).toBe(true);
  expect(result.standard.gpu.drawCalls).toBeLessThanOrEqual(13);
  expect(result.standard.gpu.instances).toBeGreaterThan(5000);
});

test("mass fire batches particles once per burst and reuses unchanged GPU instance layouts", async ({ page }) => {
  await openGame(page);

  const result = await page.evaluate(() => {
    const multiplayer = window.__dustMultiplayerTest;
    const game = window.__dustAndDeadTest;
    const started = multiplayer.startMockHost(["Pyro", "Guest"]);
    const player = started.players[0];
    const beforeParticles = game.getParticleOptimizationStats().visuals;
    for (let index = 0; index < 140; index++) {
      const angle = index * 2.399963;
      const distance = 1.4 + (index % 14) * 0.34;
      multiplayer.spawnFirePatch("mock-player-1", {
        x: player.x + Math.cos(angle) * distance,
        z: player.z + Math.sin(angle) * distance,
        radius: 0.7,
        life: 12,
        type: index % 3 ? "trail" : "standard",
      });
    }
    const afterSpawnParticles = game.getParticleOptimizationStats().visuals;
    window.advanceTime(17);
    const first = game.getFireOptimizationStats().visuals;
    const afterFirstFrameParticles = game.getParticleOptimizationStats().visuals;
    window.advanceTime(250);
    const cached = game.getFireOptimizationStats().visuals;
    window.advanceTime(1250);
    const pooledWarm = game.getParticleOptimizationStats().visuals;
    window.advanceTime(1000);
    const pooledSteady = game.getParticleOptimizationStats().visuals;
    return {
      beforeParticles,
      afterSpawnParticles,
      afterFirstFrameParticles,
      first,
      cached,
      pooledWarm,
      pooledSteady,
    };
  });

  expect(result.afterSpawnParticles.reservationBatches - result.beforeParticles.reservationBatches).toBe(140);
  expect(result.afterFirstFrameParticles.reservationBatches - result.afterSpawnParticles.reservationBatches).toBe(1);
  expect(result.first.activeDetailed).toBe(100);
  expect(result.first.gpu.drawCalls).toBeLessThanOrEqual(13);
  expect(result.first.fallbackVisible).toBe(40);
  expect(result.first.fallbackDrawCalls).toBeLessThanOrEqual(4);
  expect(result.cached.gpu.rebuilds).toBe(result.first.gpu.rebuilds);
  expect(result.cached.fallbackRebuilds).toBe(result.first.fallbackRebuilds);
  expect(result.cached.fallbackCacheHits).toBeGreaterThan(result.first.fallbackCacheHits);
  expect(result.pooledWarm.stateEntries.created).toBeLessThanOrEqual(result.pooledWarm.maxParticles);
  expect(result.pooledSteady.stateEntries.created).toBe(result.pooledWarm.stateEntries.created);
});

test("periodic guest fire snapshots keep static spatial entries and GPU buffers cached", async ({ page }) => {
  await openGame(page);

  const result = await page.evaluate(() => {
    const multiplayer = window.__dustMultiplayerTest;
    const game = window.__dustAndDeadTest;
    const started = multiplayer.startMockHost(["Pyro", "Guest"]);
    const player = started.players[0];
    multiplayer.setPlayerPosition("mock-player-2", player.x, player.z);
    for (let index = 0; index < 120; index += 1) {
      const angle = index * 2.399963;
      const distance = 1.2 + (index % 12) * 0.32;
      multiplayer.spawnFirePatch("mock-player-1", {
        x: player.x + Math.cos(angle) * distance,
        z: player.z + Math.sin(angle) * distance,
        radius: 0.7,
        life: 20,
        type: index % 3 ? "trail" : "standard",
      });
    }
    const snapshot = JSON.parse(JSON.stringify(multiplayer.buildSnapshot(true, true, "mock-player-2")));
    const initialLives = snapshot.firePatches.map((patch) => patch.life);

    multiplayer.startMockGuest(["Pyro", "Guest"], 1);
    multiplayer.applySnapshot(snapshot);
    window.advanceTime(17);
    const initial = game.getFireOptimizationStats();

    for (let frame = 1; frame <= 20; frame += 1) {
      const update = JSON.parse(JSON.stringify(snapshot));
      update.sequence = snapshot.sequence + frame;
      update.time = snapshot.time + frame * 0.1;
      update.firePatches.forEach((patch, index) => {
        patch.life = Math.max(0.1, initialLives[index] - frame * 0.1);
      });
      multiplayer.applySnapshot(update);
      window.advanceTime(100);
    }
    const settled = game.getFireOptimizationStats();
    return { initial, settled };
  });

  expect(result.initial.guestSpatialGrid.occupants).toBe(120);
  expect(result.settled.guestSpatialGrid.occupants).toBe(120);
  expect(result.settled.guestSpatialGrid.cells).toBe(result.initial.guestSpatialGrid.cells);
  expect(result.initial.visuals.activeDetailed).toBe(100);
  expect(result.initial.visuals.fallbackVisible).toBe(20);
  expect(result.settled.visuals.gpu.rebuilds).toBe(result.initial.visuals.gpu.rebuilds);
  expect(result.settled.visuals.fallbackRebuilds).toBe(result.initial.visuals.fallbackRebuilds);
  expect(result.settled.visuals.fallbackCacheHits).toBeGreaterThan(result.initial.visuals.fallbackCacheHits);
});
