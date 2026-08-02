const path = require("node:path");
const { expect, test } = require("@playwright/test");
const { decodeEnemyOps } = require("./helpers/enemy-wire-decoder");

const MAX_WIRE_BYTES = 31 * 1024;
const ENEMY_COUNT = 4000;
const PROJECTILE_COUNT = 200;
const MOVEMENT_FRAMES = 12;

function fileUrl(relativePath) {
  const absolute = path.resolve(__dirname, "..", relativePath).replace(/\\/g, "/");
  return `file:///${absolute}`;
}

function wireBytes(wire) {
  return Buffer.byteLength(JSON.stringify(wire), "utf8");
}

function highestCombatSequence(wire) {
  return (wire.combatEvents || []).reduce(
    (highest, event) => Math.max(highest, Number(event && event.sequence) || 0),
    0
  );
}

function hasChunkContract(delta) {
  return Boolean(
    delta && delta.k === 1 && Number.isInteger(delta.e) &&
    Number.isInteger(delta.i) && delta.i >= 0 &&
    Number.isInteger(delta.m) && delta.m > 1 &&
    (delta.f === 0 || delta.f === 1)
  );
}

function applyEnemyOps(replica, delta) {
  for (const op of decodeEnemyOps(delta)) {
    if (op.kind >= 2) {
      replica.delete(op.id);
    } else if (op.kind === 0) {
      replica.set(op.id, { x: op.x, z: op.z });
    } else {
      const current = replica.get(op.id);
      if (!current) continue;
      if (Number.isFinite(op.x)) current.x = op.x;
      if (Number.isFinite(op.z)) current.z = op.z;
    }
  }
}

async function openGame(page) {
  await page.goto(`${fileUrl("index.html")}?mapSeed=7331`);
  const intro = page.locator("#intro-screen");
  if (await intro.isVisible().catch(() => false)) {
    await page.keyboard.press("KeyM");
    await expect(intro).toBeHidden();
  }
  await page.waitForFunction(() => Boolean(
    window.__dustMultiplayerTest?.buildWireSnapshot &&
    window.__dustMultiplayerTest?.spawnEnemyStressField &&
    window.__dustMultiplayerTest?.acknowledgeClientState
  ));
}

async function setupHostStress(page) {
  return page.evaluate(({ enemyCount, projectileCount }) => {
    const multiplayer = window.__dustMultiplayerTest;
    const started = multiplayer.startMockHost(["Stress Host", "Stress Guest"]);
    const originalHost = started.players[0];
    const center = { x: originalHost.x, z: originalHost.z };

    // Build the dense enemy field around the viewer, then move the shooter to
    // one edge of the relevance area and fire away from the horde. This keeps
    // all 4000 enemies moving without the 200 test bullets legitimately killing
    // enemies and confusing a scoped-removal regression with real deaths.
    multiplayer.setPlayerPosition("mock-player-2", center.x, center.z);
    const stress = multiplayer.spawnEnemyStressField(enemyCount, "visible");
    multiplayer.setPlayerPosition("mock-player-1", center.x - 32, center.z);
    const shooter = multiplayer.getState().players[0];

    let fired = 0;
    for (let index = 0; index < projectileCount; index += 1) {
      if (index % 6 === 0) {
        const current = multiplayer.getState().players[0].progression;
        multiplayer.setProgression("mock-player-1", {
          weapon: "revolver",
          ammo: Object.assign({}, current.ammo, { revolver: 6 }),
          reloadTimers: Object.assign({}, current.reloadTimers, { revolver: 0 }),
        });
      }
      if (multiplayer.fireAt("mock-player-1", shooter.x - 24, shooter.z)) fired += 1;
    }

    const initial = multiplayer.buildSnapshot(false, false, "mock-player-2");
    const combat = multiplayer.getNetworkCombatDiagnostics();
    return {
      stress,
      fired,
      relevantBullets: initial.bullets.length,
      queuedCombatEvents: combat.queuedEvents.length,
      expectedIds: initial.enemies.map((enemy) => enemy.id).sort((a, b) => a - b),
      initialPositions: initial.enemies.map((enemy) => [enemy.id, enemy.x, enemy.z]),
    };
  }, { enemyCount: ENEMY_COUNT, projectileCount: PROJECTILE_COUNT });
}

async function buildHostWire(page, advanceMs = 0) {
  return page.evaluate((milliseconds) => {
    if (milliseconds > 0) window.advanceTime(milliseconds);
    const multiplayer = window.__dustMultiplayerTest;
    const before = multiplayer.getNetworkCombatDiagnostics();
    const wire = multiplayer.buildWireSnapshot(false, false, "mock-player-2");
    return {
      wire,
      queuedBefore: before.queuedEvents.length,
      eventSequenceBefore: before.combatEventSequence,
    };
  }, advanceMs);
}

async function applyGuestWire(page, wire, includeIds) {
  return page.evaluate(({ snapshot, readIds }) => {
    const multiplayer = window.__dustMultiplayerTest;
    multiplayer.applySnapshot(snapshot);
    const enemies = multiplayer.getGuestEnemyDiagnostics();
    return {
      count: enemies.length,
      ids: readIds ? enemies.map((enemy) => enemy.id).sort((a, b) => a - b) : [],
      eventSequences: multiplayer.getNetworkCombatDiagnostics().guestEvents.map((event) => event.sequence),
    };
  }, { snapshot: wire, readIds: includeIds });
}

async function acknowledgeHostWire(page, wire) {
  const combatAck = highestCombatSequence(wire);
  return page.evaluate(({ sequence, eventAck }) => {
    return window.__dustMultiplayerTest.acknowledgeClientState(
      "mock-player-2",
      sequence,
      eventAck,
      false
    );
  }, { sequence: wire.sequence, eventAck: combatAck });
}

test("4000 moving relevant enemies and 200 projectiles stay chunked, reliable, and inside the raw wire budget", async ({ page }) => {
  test.setTimeout(180_000);
  await openGame(page);
  // Keep the whole host-side stress run in one browser task. Yielding between
  // every packet would also run the real-time renderer for a synthetic crowd of
  // 4000 on-screen models and measure WebGL throughput instead of networking.
  const run = await page.evaluate(({ enemyCount, projectileCount, movementFrames }) => {
    const multiplayer = window.__dustMultiplayerTest;
    const game = window.__dustAndDeadTest;
    const started = multiplayer.startMockHost(["Stress Host", "Stress Guest"]);
    const center = { x: started.players[0].x, z: started.players[0].z };
    multiplayer.setPlayerPosition("mock-player-2", center.x, center.z);
    const stress = multiplayer.spawnEnemyStressField(enemyCount, "visible");
    multiplayer.setPlayerPosition("mock-player-1", center.x - 32, center.z);
    const shooter = multiplayer.getState().players[0];

    let fired = 0;
    for (let index = 0; index < projectileCount; index += 1) {
      if (index % 6 === 0) {
        const current = multiplayer.getState().players[0].progression;
        multiplayer.setProgression("mock-player-1", {
          weapon: "revolver",
          ammo: Object.assign({}, current.ammo, { revolver: 6 }),
          reloadTimers: Object.assign({}, current.reloadTimers, { revolver: 0 }),
        });
      }
      if (multiplayer.fireAt("mock-player-1", shooter.x - 24, shooter.z)) fired += 1;
    }

    const initial = multiplayer.buildSnapshot(false, false, "mock-player-2");
    const initialCombat = multiplayer.getNetworkCombatDiagnostics();
    const frames = [];
    const build = (advanceMs, phase, applied) => {
      if (advanceMs > 0) window.advanceTime(advanceMs);
      const before = multiplayer.getNetworkCombatDiagnostics();
      const wire = multiplayer.buildWireSnapshot(false, false, "mock-player-2");
      const record = { wire, queuedBefore: before.queuedEvents.length, phase, applied };
      frames.push(record);
      return record;
    };
    const acknowledge = (record) => {
      const combatAck = (record.wire.combatEvents || []).reduce(
        (highest, event) => Math.max(highest, Number(event && event.sequence) || 0),
        0
      );
      multiplayer.acknowledgeClientState("mock-player-2", record.wire.sequence, combatAck, false);
    };

    const dropped = build(0, "dropped", false);
    const first = dropped.wire.enemyDelta;
    const chunkCount = Number(first && first.m) || 0;
    build(0, "keyframe", true);
    const repeatedAck = build(0, "keyframe", true);
    acknowledge(repeatedAck);

    for (let index = 1; index < chunkCount; index += 1) {
      const record = build(17, "keyframe", true);
      acknowledge(record);
    }
    for (let index = 0; index < movementFrames; index += 1) {
      const record = build(17, "movement", true);
      acknowledge(record);
    }

    let settledDeltaCount = null;
    for (let index = 0; index < 24; index += 1) {
      const record = build(0, "settle", true);
      acknowledge(record);
      settledDeltaCount = Number(record.wire.enemyDelta && record.wire.enemyDelta.c);
      if (record.wire.enemyDelta && record.wire.enemyDelta.k === 0 && settledDeltaCount === 0 &&
          multiplayer.getNetworkCombatDiagnostics().queuedEvents.length === 0) break;
    }

    const finalSnapshot = multiplayer.buildSnapshot(false, false, "mock-player-2");
    const finalCombat = multiplayer.getNetworkCombatDiagnostics();
    return {
      setup: {
        stress,
        fired,
        relevantBullets: initial.bullets.length,
        queuedCombatEvents: initialCombat.queuedEvents.length,
        expectedIds: initial.enemies.map((enemy) => enemy.id).sort((a, b) => a - b),
        initialPositions: initial.enemies.map((enemy) => [enemy.id, enemy.x, enemy.z]),
      },
      frames,
      settledDeltaCount,
      finalHost: {
        enemies: finalSnapshot.enemies.map((enemy) => ({ id: enemy.id, x: enemy.x, z: enemy.z })),
        queuedEvents: finalCombat.queuedEvents.length,
        combatEventSequence: finalCombat.combatEventSequence,
        budget: multiplayer.getNetworkBudgetDiagnostics(),
      },
    };
  }, { enemyCount: ENEMY_COUNT, projectileCount: PROJECTILE_COUNT, movementFrames: MOVEMENT_FRAMES });

  const { setup, frames, settledDeltaCount, finalHost } = run;
  const dropped = frames[0];
  const repeatedDrop = frames[1];
  const repeatedAck = frames[2];
  const firstDelta = dropped.wire.enemyDelta;
  const chunkContractSupported = hasChunkContract(firstDelta);
  expect(chunkContractSupported, "enemyDelta must expose k/e/i/m/f chunk metadata").toBe(true);
  const epoch = firstDelta.e;
  const chunkCount = firstDelta.m;
  expect(repeatedDrop.wire.enemyDelta).toMatchObject({ k: 1, e: epoch, i: 0, m: chunkCount, f: 0 });
  expect(repeatedAck.wire.enemyDelta).toMatchObject({ k: 1, e: epoch, i: 0, m: chunkCount, f: 0 });
  expect(repeatedDrop.wire.enemyDelta.d).toBe(firstDelta.d);
  expect(repeatedAck.wire.enemyDelta.d).toBe(firstDelta.d);

  const logicalReplica = new Map();
  const initialPositionById = new Map(setup.initialPositions.map(([id, x, z]) => [id, { x, z }]));
  const rawSizes = [];
  const deliveredCombatSequences = new Set();
  const deliveredCombatTypes = new Map();
  const keyframeIndices = [];
  let starvationFrames = 0;
  let afterKeyframeIds = [];
  for (const frame of frames) {
    rawSizes.push(wireBytes(frame.wire));
    if (frame.queuedBefore > 0 && !(frame.wire.combatEvents || []).length) starvationFrames += 1;
    if (!frame.applied) continue;
    for (const event of frame.wire.combatEvents || []) {
      deliveredCombatSequences.add(event.sequence);
      deliveredCombatTypes.set(event.sequence, event.type);
    }
    if (frame.wire.enemyDelta) applyEnemyOps(logicalReplica, frame.wire.enemyDelta);
    if (frame.phase === "keyframe") {
      keyframeIndices.push(frame.wire.enemyDelta.i);
      if (frame.wire.enemyDelta.f === 1) {
        afterKeyframeIds = Array.from(logicalReplica.keys()).sort((a, b) => a - b);
      }
    }
  }

  const finalHostById = new Map(finalHost.enemies.map((enemy) => [enemy.id, enemy]));
  const finalGuestIds = Array.from(logicalReplica.keys()).sort((a, b) => a - b);
  const movedCount = finalHost.enemies.filter((enemy) => {
    const initial = initialPositionById.get(enemy.id);
    return initial && Math.hypot(enemy.x - initial.x, enemy.z - initial.z) > 0.05;
  }).length;
  const targetErrors = Array.from(logicalReplica.entries()).map(([id, enemy]) => {
    const authoritative = finalHostById.get(id);
    return authoritative ? Math.hypot(enemy.x - authoritative.x, enemy.z - authoritative.z) : Infinity;
  }).sort((a, b) => a - b);
  const p99TargetError = targetErrors[Math.floor(targetErrors.length * 0.99)] || 0;
  const missingCombatSequences = [];
  for (let sequence = 1; sequence <= finalHost.combatEventSequence; sequence += 1) {
    if (!deliveredCombatSequences.has(sequence)) missingCombatSequences.push(sequence);
  }

  expect(setup.stress).toMatchObject({ added: ENEMY_COUNT, active: ENEMY_COUNT, mode: "visible" });
  expect(setup.expectedIds).toHaveLength(ENEMY_COUNT);
  expect(setup.fired).toBe(PROJECTILE_COUNT);
  expect(setup.relevantBullets).toBe(PROJECTILE_COUNT);
  expect(setup.queuedCombatEvents).toBe(PROJECTILE_COUNT);

  expect(chunkCount).toBeGreaterThan(1);
  expect(keyframeIndices).toEqual([0, 0].concat(Array.from({ length: chunkCount - 1 }, (_, index) => index + 1)));
  expect(afterKeyframeIds).toEqual(setup.expectedIds);
  expect(finalGuestIds).toEqual(finalHost.enemies.map((enemy) => enemy.id).sort((a, b) => a - b));

  expect(Math.max(...rawSizes)).toBeLessThanOrEqual(MAX_WIRE_BYTES);
  expect(starvationFrames).toBe(0);
  expect(missingCombatSequences).toEqual([]);
  expect(Array.from(deliveredCombatTypes.values()).filter((type) => type === "projectileSpawn")).toHaveLength(PROJECTILE_COUNT);
  expect(finalHost.queuedEvents).toBe(0);
  expect(settledDeltaCount).toBe(0);
  expect(finalHost.budget.stats.wireOversizeSnapshots).toBe(0);
  expect(finalHost.budget.stats.slowClientDisconnects).toBe(0);

  expect(movedCount).toBeGreaterThan(ENEMY_COUNT * 0.75);
  expect(p99TargetError).toBeLessThan(1.25);
});

test("a guest accumulates partial keyframe chunks without deleting earlier enemies", async ({ page, context }) => {
  test.setTimeout(180_000);
  await openGame(page);
  const guestPage = await context.newPage();
  await openGame(guestPage);
  await guestPage.evaluate(() => window.__dustMultiplayerTest.startMockGuest(["Chunk Host", "Chunk Guest"], 1));

  const expectedIds = await page.evaluate(() => {
    const multiplayer = window.__dustMultiplayerTest;
    const started = multiplayer.startMockHost(["Chunk Host", "Chunk Guest"]);
    multiplayer.setPlayerPosition("mock-player-2", started.players[0].x, started.players[0].z);
    multiplayer.spawnEnemyStressField(1200, "visible");
    return multiplayer.buildSnapshot(false, false, "mock-player-2").enemies
      .map((enemy) => enemy.id)
      .sort((a, b) => a - b);
  });

  const dropped = await buildHostWire(page);
  expect(hasChunkContract(dropped.wire.enemyDelta)).toBe(true);
  expect(wireBytes(dropped.wire)).toBeLessThanOrEqual(MAX_WIRE_BYTES);

  const first = await buildHostWire(page);
  const afterFirst = await applyGuestWire(guestPage, first.wire, true);
  expect(afterFirst.count).toBeGreaterThan(0);
  expect(afterFirst.count).toBeLessThan(expectedIds.length);

  const duplicate = await buildHostWire(page);
  expect(duplicate.wire.enemyDelta.d).toBe(first.wire.enemyDelta.d);
  const afterDuplicate = await applyGuestWire(guestPage, duplicate.wire, true);
  expect(afterDuplicate.ids).toEqual(afterFirst.ids);
  await acknowledgeHostWire(page, duplicate.wire);

  const epoch = first.wire.enemyDelta.e;
  const chunkCount = first.wire.enemyDelta.m;
  for (let index = 1; index < chunkCount; index += 1) {
    const frame = await buildHostWire(page);
    expect(wireBytes(frame.wire)).toBeLessThanOrEqual(MAX_WIRE_BYTES);
    expect(frame.wire.enemyDelta).toMatchObject({ k: 1, e: epoch, i: index, m: chunkCount });
    const applied = await applyGuestWire(guestPage, frame.wire, true);
    for (const id of afterFirst.ids) expect(applied.ids).toContain(id);
    await acknowledgeHostWire(page, frame.wire);
  }

  const finalIds = await guestPage.evaluate(() =>
    window.__dustMultiplayerTest.getGuestEnemyDiagnostics().map((enemy) => enemy.id).sort((a, b) => a - b)
  );
  expect(finalIds).toEqual(expectedIds);
});
