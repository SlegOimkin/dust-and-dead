const path = require("node:path");
const { expect, test } = require("@playwright/test");

function fileUrl(relativePath) {
  const absolute = path.resolve(__dirname, "..", relativePath).replace(/\\/g, "/");
  return `file:///${absolute}`;
}

async function openGame(page) {
  await page.goto(`${fileUrl("index.html")}?mapSeed=7331&networkDiagnostics=1`);
  const intro = page.locator("#intro-screen");
  if (await intro.isVisible().catch(() => false)) {
    await page.keyboard.press("KeyM");
    await expect(intro).toBeHidden();
  }
  await page.waitForFunction(() => Boolean(window.__dustMultiplayerTest));
}

test("protocol 46 compacts and ACK-streams the maximum trap field without losing a replica", async ({ page }) => {
  await openGame(page);

  const result = await page.evaluate(() => {
    const multiplayer = window.__dustMultiplayerTest;
    const game = window.__dustAndDeadTest;
    const started = multiplayer.startMockHost(["Trap Host", "Trap Guest"]);
    const guest = started.players[1];
    let spawned = 0;
    for (let index = 0; index < 240; index += 1) {
      if (game.spawnRifleTrapAt(guest.x, guest.z)) spawned += 1;
    }

    const hostTrapDiagnostics = game.getRifleTrapOptimizationStats();
    const encoder = new TextEncoder();
    const wires = [];
    const transmittedIds = new Set();
    let firstMain = [];
    let firstUpserts = [];
    let firstCompactBytes = 0;
    let firstEquivalentLegacyBytes = 0;
    let firstWireBytes = 0;
    let maxWireBytes = 0;
    let firstHasLegacyMain = false;
    let firstHasLegacyUpserts = false;
    for (let cycle = 0; cycle < 8 && transmittedIds.size < spawned; cycle += 1) {
      const wire = multiplayer.buildWireSnapshot(true, true, "mock-player-2");
      const main = multiplayer.decodeRifleTrapState(wire.rt) || [];
      const upserts = multiplayer.decodeRifleTrapState(wire.ru) || [];
      main.concat(upserts).forEach((trap) => transmittedIds.add(trap.id));
      const wireBytes = encoder.encode(JSON.stringify(wire)).length;
      maxWireBytes = Math.max(maxWireBytes, wireBytes);
      wires.push(wire);
      if (cycle === 0) {
        firstMain = main;
        firstUpserts = upserts;
        firstCompactBytes = encoder.encode(JSON.stringify({ rt: wire.rt, ru: wire.ru })).length;
        firstEquivalentLegacyBytes = encoder.encode(JSON.stringify({
          rifleTraps: main,
          hazardUpserts: { rifleTraps: upserts },
        })).length;
        firstWireBytes = wireBytes;
        firstHasLegacyMain = Array.isArray(wire.rifleTraps);
        firstHasLegacyUpserts = Array.isArray(wire.hazardUpserts?.rifleTraps);
      }
      multiplayer.acknowledgeClientState("mock-player-2", wire.sequence, 0, false);
    }
    const hostNetworkStats = multiplayer.getNetworkBudgetDiagnostics().stats;

    multiplayer.startMockGuest(["Trap Host", "Trap Guest"], 1);
    wires.forEach((wire) => multiplayer.applySnapshot(wire));
    const guestReplicas = multiplayer.getGuestCombatReplicas().rifleTraps;

    return {
      spawned,
      active: hostTrapDiagnostics.activeTraps,
      max: hostTrapDiagnostics.maxTraps,
      firstMainCount: firstMain.length,
      firstUpsertCount: firstUpserts.length,
      transmittedCount: transmittedIds.size,
      deliveryCycles: wires.length,
      firstCompactBytes,
      firstEquivalentLegacyBytes,
      firstWireBytes,
      maxWireBytes,
      hasLegacyMain: firstHasLegacyMain,
      hasLegacyUpserts: firstHasLegacyUpserts,
      guestReplicaCount: guestReplicas.length,
      guestReplicaIds: guestReplicas.map((trap) => trap.id).sort((a, b) => a - b),
      transmittedIds: Array.from(transmittedIds).sort((a, b) => a - b),
      hostNetworkStats,
    };
  });

  expect(result.spawned).toBe(240);
  expect(result.active).toBe(result.max);
  expect(result.max).toBe(240);
  expect(result.firstMainCount).toBe(96);
  expect(result.firstUpsertCount).toBeGreaterThan(0);
  expect(result.transmittedCount).toBe(240);
  expect(result.deliveryCycles).toBeGreaterThan(1);
  expect(result.deliveryCycles).toBeLessThanOrEqual(5);
  expect(result.hasLegacyMain).toBe(false);
  expect(result.hasLegacyUpserts).toBe(false);
  expect(result.firstCompactBytes * 4).toBeLessThan(result.firstEquivalentLegacyBytes);
  expect(result.firstWireBytes).toBeLessThan(10 * 1024);
  expect(result.maxWireBytes).toBeLessThan(10 * 1024);
  expect(result.hostNetworkStats.rifleTrapLegacyBytes).toBeGreaterThan(
    result.hostNetworkStats.rifleTrapWireBytes * 4
  );
  expect(result.guestReplicaCount).toBe(240);
  expect(result.guestReplicaIds).toEqual(result.transmittedIds);
});

test("a corrupt compact trap field does not advance the snapshot and the exact retry repairs it", async ({ page }) => {
  await openGame(page);

  const result = await page.evaluate(() => {
    const multiplayer = window.__dustMultiplayerTest;
    const game = window.__dustAndDeadTest;
    const started = multiplayer.startMockHost(["Trap Host", "Trap Guest"]);
    const guest = started.players[1];
    game.spawnRifleTrapAt(guest.x, guest.z);
    const repaired = JSON.parse(JSON.stringify(
      multiplayer.buildWireSnapshot(true, true, "mock-player-2")
    ));
    const corrupt = JSON.parse(JSON.stringify(repaired));
    corrupt.rt = "not-a-valid-trap-packet";

    multiplayer.startMockGuest(["Trap Host", "Trap Guest"], 1);
    multiplayer.applySnapshot(corrupt);
    const afterCorrupt = multiplayer.getGuestCombatReplicas().rifleTraps;
    multiplayer.applySnapshot(repaired);
    const afterRetry = multiplayer.getGuestCombatReplicas().rifleTraps;
    return {
      hadPackedField: typeof repaired.rt === "string",
      afterCorruptCount: afterCorrupt.length,
      afterRetryCount: afterRetry.length,
      retryVisualAttached: Boolean(afterRetry[0]?.visualAttached),
    };
  });

  expect(result.hadPackedField).toBe(true);
  expect(result.afterCorruptCount).toBe(0);
  expect(result.afterRetryCount).toBe(1);
  expect(result.retryVisualAttached).toBe(true);
});

test("one reliable packet carries mixed visible and offscreen trap bursts and removes replicas exactly once", async ({ page }) => {
  await openGame(page);

  const result = await page.evaluate(() => {
    const multiplayer = window.__dustMultiplayerTest;
    const game = window.__dustAndDeadTest;
    const started = multiplayer.startMockHost(["Trap Host", "Trap Guest"]);
    const guest = started.players[1];
    const visibleCount = 12;
    const offscreenCount = 24;
    for (let index = 0; index < visibleCount; index += 1) {
      game.spawnRifleTrapAt(guest.x, guest.z);
    }

    const farCandidates = [
      [180, 150], [-180, 150], [180, -150], [-180, -150], [140, 130],
    ];
    let farPoint = null;
    for (const candidate of farCandidates) {
      const trap = game.spawnRifleTrapAt(candidate[0], candidate[1]);
      if (trap) {
        farPoint = trap;
        break;
      }
    }
    for (let index = 1; index < offscreenCount; index += 1) {
      game.spawnRifleTrapAt(farPoint.x, farPoint.z);
    }

    const introduction = multiplayer.buildWireSnapshot(true, true, "mock-player-2");
    const introduced = (multiplayer.decodeRifleTrapState(introduction.rt) || [])
      .concat(multiplayer.decodeRifleTrapState(introduction.ru) || []);
    for (let index = 0; index < visibleCount + offscreenCount; index += 1) {
      multiplayer.triggerFirstRifleTrap();
    }
    const rawEvents = multiplayer.getNetworkCombatDiagnostics().queuedEvents;
    const triggerSnapshot = multiplayer.buildWireSnapshot(false, false, "mock-player-2");
    const triggerEvents = triggerSnapshot.combatEvents.filter((event) => event.type === "rifleTrapTrigger");
    const decoded = multiplayer.decodeRifleTrapTriggerEvent(triggerEvents[0]);
    const encoder = new TextEncoder();
    const packedEventBytes = encoder.encode(JSON.stringify(triggerEvents[0])).length;
    const legacyEventBytes = encoder.encode(JSON.stringify(rawEvents[0].traps.map((trap) => ({
      type: "rifleTrapTrigger",
      sequence: rawEvents[0].sequence,
      trapId: trap[0],
      x: trap[1] / 64,
      z: trap[2] / 64,
      radius: trap[3] / 100,
      lure: Boolean(trap[4]),
    })))).length;

    multiplayer.startMockGuest(["Trap Host", "Trap Guest"], 1);
    multiplayer.applySnapshot(introduction);
    const before = multiplayer.getGuestCombatReplicas().rifleTraps;
    multiplayer.applySnapshot(triggerSnapshot);
    const after = multiplayer.getGuestCombatReplicas().rifleTraps;
    const guestEvents = multiplayer.getNetworkCombatDiagnostics().guestEvents;

    return {
      farPoint,
      introducedCount: introduced.length,
      rawEventCount: rawEvents.length,
      rawTriggerCount: rawEvents[0]?.traps?.length || 0,
      wireEventCount: triggerEvents.length,
      visibleTriggers: decoded.visible.length,
      removalTriggers: decoded.removals.length,
      packedEventBytes,
      legacyEventBytes,
      beforeCount: before.length,
      afterCount: after.length,
      guestEvents,
    };
  });

  expect(result.farPoint).toBeTruthy();
  expect(result.rawEventCount).toBe(1);
  expect(result.rawTriggerCount).toBe(36);
  expect(result.wireEventCount).toBe(1);
  expect(result.visibleTriggers).toBe(12);
  expect(result.removalTriggers).toBe(24);
  expect(result.packedEventBytes * 3).toBeLessThan(result.legacyEventBytes);
  expect(result.beforeCount).toBe(result.introducedCount);
  expect(result.beforeCount).toBe(12);
  expect(result.afterCount).toBe(0);
  expect(result.guestEvents).toHaveLength(1);
  expect(result.guestEvents[0]).toMatchObject({ type: "rifleTrapTrigger" });
  expect(result.guestEvents[0].visuals).toBeGreaterThan(0);
});

test("an offscreen sixty-trap burst kills authoritatively without allocating explosion or death effects", async ({ page }) => {
  await openGame(page);

  const result = await page.evaluate(() => {
    const multiplayer = window.__dustMultiplayerTest;
    const game = window.__dustAndDeadTest;
    multiplayer.startMockHost(["Trap Host", "Trap Guest"]);
    const farCandidates = [
      [180, 150], [-180, 150], [180, -150], [-180, -150], [140, 130],
    ];
    let farPoint = null;
    for (const candidate of farCandidates) {
      const trap = game.spawnRifleTrapAt(candidate[0], candidate[1]);
      if (trap) {
        farPoint = trap;
        break;
      }
    }
    for (let index = 1; index < 60; index += 1) game.spawnRifleTrapAt(farPoint.x, farPoint.z);
    for (let index = 0; index < 60; index += 1) {
      multiplayer.spawnEnemyAt(farPoint.x, farPoint.z, "walker", 1);
    }

    const before = game.getThreeObjectDiagnostics();
    for (let index = 0; index < 60; index += 1) multiplayer.triggerFirstRifleTrap();
    const after = game.getThreeObjectDiagnostics();
    const wire = multiplayer.buildWireSnapshot(false, false, "mock-player-2");
    const event = wire.combatEvents.find((entry) => entry.type === "rifleTrapTrigger");
    const decoded = multiplayer.decodeRifleTrapTriggerEvent(event);
    const eventBytes = new TextEncoder().encode(JSON.stringify(event)).length;
    const stats = multiplayer.getNetworkBudgetDiagnostics().stats;
    return {
      farPoint,
      enemiesBefore: before.state.enemies,
      enemiesAfter: after.state.enemies,
      effectsBefore: {
        particles: before.state.particles,
        shockwaves: before.state.shockwaves,
        lightFlashes: before.state.lightFlashes,
        debris: before.state.debris,
        decals: before.state.decals,
      },
      effectsAfter: {
        particles: after.state.particles,
        shockwaves: after.state.shockwaves,
        lightFlashes: after.state.lightFlashes,
        debris: after.state.debris,
        decals: after.state.decals,
      },
      visibleTriggers: decoded.visible.length,
      removalTriggers: decoded.removals.length,
      eventBytes,
      stats,
    };
  });

  expect(result.farPoint).toBeTruthy();
  expect(result.enemiesBefore).toBe(60);
  expect(result.enemiesAfter).toBe(0);
  expect(result.effectsAfter).toEqual(result.effectsBefore);
  expect(result.visibleTriggers).toBe(0);
  expect(result.removalTriggers).toBe(60);
  expect(result.eventBytes).toBeLessThan(256);
  expect(result.stats.rifleTrapTriggerBatches).toBe(1);
  expect(result.stats.rifleTrapTriggerEntries).toBe(60);
});
