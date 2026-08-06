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
    window.__dustMultiplayerTest?.getZombiePressureDiagnostics &&
    window.__dustAndDeadTest?.forceWaveState
  ));
}

test.describe.configure({ mode: "serial" });

test("multiplayer waves scale their fixed target and spawn batch with the participant roster", async ({ page }) => {
  await openGame(page);

  const result = await page.evaluate(() => {
    const multiplayer = window.__dustMultiplayerTest;
    const game = window.__dustAndDeadTest;
    const solo = game.getWaveZombieCount(1);
    const samples = [2, 3, 4].map((count) => {
      multiplayer.startMockHost(Array.from({ length: count }, (_, index) => `Player ${index + 1}`));
      const initialPressure = multiplayer.getZombiePressureDiagnostics();
      const waveOne = game.forceWaveState(1, 0, 0);
      const waveFive = game.forceWaveState(5, 0, 0);
      const nearCapWave = game.forceWaveState(56, 0, 0);
      return { count, initialPressure, waveOne, waveFive, nearCapWave, pressure: multiplayer.getZombiePressureDiagnostics() };
    });
    return { solo, samples };
  });

  expect(result.solo).toBe(21);
  expect(result.samples.map((sample) => sample.waveOne.waveSpawnTarget)).toEqual([36, 50, 65]);
  expect(result.samples.map((sample) => sample.waveOne.spawnBatchSize)).toEqual([2, 3, 4]);
  expect(result.samples.map((sample) => sample.waveFive.waveSpawnTarget)).toEqual([128, 180, 233]);
  expect(result.samples.map((sample) => sample.waveFive.spawnBatchSize)).toEqual([3, 4, 5]);
  expect(result.samples.map((sample) => sample.nearCapWave.waveSpawnTarget)).toEqual([2188, 3089, 3990]);
  expect(result.samples.map((sample) => sample.nearCapWave.spawnBatchSize)).toEqual([28, 39, 50]);
  for (const sample of result.samples) {
    expect(sample.initialPressure.waveTarget).toBe(sample.waveOne.waveSpawnTarget);
    expect(sample.initialPressure.participantCount).toBe(sample.count);
    expect(sample.waveOne.waveSpawnPlayerCount).toBe(sample.count);
    expect(sample.pressure.activeCap).toBe(4000);
  }
});

test("natural spawns distribute evenly around four separated players while remaining hidden from everyone", async ({ page }) => {
  await openGame(page);

  const spawns = await page.evaluate(() => {
    const multiplayer = window.__dustMultiplayerTest;
    const game = window.__dustAndDeadTest;
    multiplayer.startMockHost(["North West", "North East", "South West", "South East"]);
    multiplayer.setPlayerPosition("mock-player-1", -170, -135);
    multiplayer.setPlayerPosition("mock-player-2", 170, -135);
    multiplayer.setPlayerPosition("mock-player-3", -170, 135);
    multiplayer.setPlayerPosition("mock-player-4", 170, 135);
    return Array.from({ length: 80 }, () => game.spawnZombieNow());
  });

  expect(spawns).toHaveLength(80);
  expect(spawns.every(Boolean)).toBe(true);
  expect(spawns.every((spawn) => spawn.outsideAllPlayerViews)).toBe(true);
  expect(spawns.every((spawn) => spawn.nearestAlivePlayerDistance >= 20)).toBe(true);
  expect(spawns.every((spawn) => spawn.insideEnemyBounds && !spawn.blocked && spawn.hasClearStep)).toBe(true);
  const counts = new Map();
  for (const spawn of spawns) counts.set(spawn.pressureTargetPlayerId, (counts.get(spawn.pressureTargetPlayerId) || 0) + 1);
  expect(Array.from(counts.keys()).sort()).toEqual([
    "mock-player-1", "mock-player-2", "mock-player-3", "mock-player-4",
  ]);
  expect(Math.max(...counts.values()) - Math.min(...counts.values())).toBeLessThanOrEqual(1);
});

test("a new multiplayer wave immediately creates a substantial pressure pack for every player", async ({ page }) => {
  await openGame(page);

  const result = await page.evaluate(() => {
    const multiplayer = window.__dustMultiplayerTest;
    const game = window.__dustAndDeadTest;
    multiplayer.startMockHost(["North West", "North East", "South West", "South East"]);
    multiplayer.setPlayerPosition("mock-player-1", -170, -135);
    multiplayer.setPlayerPosition("mock-player-2", 170, -135);
    multiplayer.setPlayerPosition("mock-player-3", -170, 135);
    multiplayer.setPlayerPosition("mock-player-4", 170, 135);
    const wave = game.startWaveNow(5);
    const startedAt = performance.now();
    // The same 100-enemy opening pressure is intentionally staged across
    // several small host frames so it cannot pause the Nearby message loop.
    window.advanceTime(450);
    return {
      wave,
      simulationMs: performance.now() - startedAt,
      pressure: multiplayer.getZombiePressureDiagnostics(),
      enemies: multiplayer.getAuthoritativeEnemies(),
      state: JSON.parse(window.render_game_to_text()),
    };
  });

  expect(result.wave.waveSpawnTarget).toBe(233);
  expect(result.simulationMs).toBeLessThan(5000);
  expect(result.enemies).toHaveLength(100);
  expect(result.pressure.initialPressureLeft).toBe(0);
  expect(result.pressure.initialPressureBatchCap).toBe(20);
  expect(result.pressure.initialPressureBatchInterval).toBe(0.04);
  expect(result.state.spawnLeft).toBe(133);
  expect(result.pressure.players.map((player) => player.assigned)).toEqual([25, 25, 25, 25]);
  expect(new Set(result.enemies.map((enemy) => enemy.pressureTargetPlayerId))).toEqual(new Set([
    "mock-player-1", "mock-player-2", "mock-player-3", "mock-player-4",
  ]));
});

test("a large multiplayer wave fills the arena in seconds instead of arriving as tiny packs", async ({ page }) => {
  await openGame(page);

  const result = await page.evaluate(() => {
    const multiplayer = window.__dustMultiplayerTest;
    const game = window.__dustAndDeadTest;
    multiplayer.startMockHost(["North West", "North East", "South West", "South East"]);
    multiplayer.setPlayerPosition("mock-player-1", -170, -135);
    multiplayer.setPlayerPosition("mock-player-2", 170, -135);
    multiplayer.setPlayerPosition("mock-player-3", -170, 135);
    multiplayer.setPlayerPosition("mock-player-4", 170, 135);
    const wave = game.startWaveNow(20);
    const startedAt = performance.now();
    const filled = game.advanceSpawningOnly(8200);
    const wire = multiplayer.buildWireSnapshot(false, false, "mock-player-2");
    return {
      wave,
      filled,
      simulationMs: performance.now() - startedAt,
      pressure: multiplayer.getZombiePressureDiagnostics(),
      wireBytes: new TextEncoder().encode(JSON.stringify(wire)).length,
      combatEvents: multiplayer.getNetworkCombatDiagnostics().queuedEvents.length,
    };
  });

  expect(result.wave.waveSpawnTarget).toBe(1535);
  expect(result.wave.spawnBatchSize).toBe(20);
  expect(result.filled.spawnLeft).toBe(0);
  expect(result.filled.live).toBe(result.wave.waveSpawnTarget);
  expect(result.pressure.targetWaveFillSeconds).toBe(8);
  expect(result.pressure.rapidSpawnInterval).toBe(0.1);
  expect(result.pressure.rapidSpawnBatchCap).toBe(50);
  expect(result.simulationMs).toBeLessThan(10000);
  expect(result.wireBytes).toBeLessThanOrEqual(31 * 1024);
  expect(result.combatEvents).toBe(0);
});

test("only far unseen zombies are gradually redistributed to under-pressured players", async ({ page }) => {
  await openGame(page);

  const result = await page.evaluate(() => {
    const multiplayer = window.__dustMultiplayerTest;
    const game = window.__dustAndDeadTest;
    multiplayer.startMockHost(["North West", "North East", "South West", "South East"]);
    multiplayer.setPlayerPosition("mock-player-1", -150, -110);
    multiplayer.setPlayerPosition("mock-player-2", 150, -110);
    multiplayer.setPlayerPosition("mock-player-3", -150, 110);
    multiplayer.setPlayerPosition("mock-player-4", 150, 110);
    const host = multiplayer.getState().players[0];
    const engagedIds = [];
    for (let index = 0; index < 4; index++) {
      engagedIds.push(multiplayer.spawnEnemyAt(host.x + 3 + index * 0.5, host.z + 2, "walker").id);
    }
    for (let index = 0; index < 240; index++) {
      multiplayer.spawnEnemyAt((index % 16) * 1.2 - 9, Math.floor(index / 16) * 1.2 - 8.4, "walker");
    }
    const firstStartedAt = performance.now();
    window.advanceTime(100);
    const relocationWire = multiplayer.buildWireSnapshot(false, false, "mock-player-2");
    const firstFrame = {
      pressure: multiplayer.getZombiePressureDiagnostics(),
      enemies: multiplayer.getAuthoritativeEnemies(),
      simulationMs: performance.now() - firstStartedAt,
      wireBytes: new TextEncoder().encode(JSON.stringify(relocationWire)).length,
      combatEvents: multiplayer.getNetworkCombatDiagnostics().queuedEvents.length,
    };
    window.advanceTime(500);
    return {
      engagedIds,
      firstFrame,
      pressure: multiplayer.getZombiePressureDiagnostics(),
      enemies: multiplayer.getAuthoritativeEnemies(),
    };
  });

  expect(result.firstFrame.pressure.totalRelocations).toBe(100);
  expect(result.firstFrame.simulationMs).toBeLessThan(5000);
  expect(result.firstFrame.wireBytes).toBeLessThanOrEqual(31 * 1024);
  expect(result.firstFrame.combatEvents).toBe(0);
  const firstRelocated = result.firstFrame.enemies.filter((enemy) => enemy.pressureRelocations > 0);
  expect(firstRelocated.length).toBe(result.firstFrame.pressure.totalRelocations);
  expect(firstRelocated.every((enemy) => !enemy.visibleToAnyPlayer)).toBe(true);

  const assigned = result.pressure.players.map((player) => player.assigned);
  expect(Math.max(...assigned) - Math.min(...assigned)).toBeLessThanOrEqual(1);
  expect(result.pressure.totalRelocations).toBe(200);
  expect(result.pressure.lastRebalanceMs).toBeLessThan(50);
  expect(result.pressure.maxRelocationBatchMs).toBeLessThan(5000);
  const engaged = result.enemies.filter((enemy) => result.engagedIds.includes(enemy.id));
  expect(engaged).toHaveLength(4);
  expect(engaged.every((enemy) => enemy.pressureRelocations === 0)).toBe(true);
});

test("the final small pack is left with its current player instead of being teleported for artificial equality", async ({ page }) => {
  await openGame(page);

  const result = await page.evaluate(() => {
    const multiplayer = window.__dustMultiplayerTest;
    const game = window.__dustAndDeadTest;
    multiplayer.startMockHost(["Finisher", "Waiting Player"]);
    multiplayer.setPlayerPosition("mock-player-1", -130, -90);
    multiplayer.setPlayerPosition("mock-player-2", 130, 90);
    game.forceWaveState(1, 0, 0);
    multiplayer.spawnEnemyAt(0, 0, "walker");
    multiplayer.spawnEnemyAt(2, 0, "walker");
    window.advanceTime(2000);
    return {
      pressure: multiplayer.getZombiePressureDiagnostics(),
      enemies: multiplayer.getAuthoritativeEnemies(),
    };
  });

  expect(result.enemies).toHaveLength(2);
  expect(result.pressure.totalRelocations).toBe(0);
  expect(result.enemies.every((enemy) => enemy.pressureRelocations === 0)).toBe(true);
});

test("a hidden authoritative relocation snaps once on the guest without an interpolation streak", async ({ page }) => {
  await openGame(page);

  const result = await page.evaluate(() => {
    const multiplayer = window.__dustMultiplayerTest;
    multiplayer.startMockHost(["Host", "Guest"]);
    const guest = multiplayer.getState().players[1];
    multiplayer.spawnEnemyAt(guest.x + 4, guest.z, "walker");
    const initial = JSON.parse(JSON.stringify(multiplayer.buildSnapshot(false, false, "mock-player-2")));
    if (!initial.enemies || initial.enemies.length !== 1) throw new Error("Expected one full enemy entry");
    const jumped = JSON.parse(JSON.stringify(initial));
    jumped.sequence += 1;
    jumped.time += 0.1;
    jumped.enemies[0].x = guest.x - 100;
    jumped.enemies[0].z = guest.z - 80;

    multiplayer.startMockGuest(["Host", "Guest"], 1);
    multiplayer.applySnapshot(initial);
    multiplayer.applySnapshot(jumped);
    const immediate = multiplayer.getGuestEnemyDiagnostics()[0];
    window.advanceTime(17);
    const afterFrame = multiplayer.getGuestEnemyDiagnostics()[0];
    return { target: jumped.enemies[0], immediate, afterFrame };
  });

  expect(result.immediate.x).toBeCloseTo(result.target.x, 3);
  expect(result.immediate.z).toBeCloseTo(result.target.z, 3);
  expect(result.immediate.velocityX).toBe(0);
  expect(result.immediate.velocityZ).toBe(0);
  expect(result.immediate.previousSampleTime).toBe(result.immediate.sampleTime);
  expect(result.immediate.visible).toBe(false);
  expect(Math.hypot(result.afterFrame.x - result.target.x, result.afterFrame.z - result.target.z)).toBeLessThan(0.01);
});
