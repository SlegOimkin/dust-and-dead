const path = require("node:path");
const { gzipSync } = require("node:zlib");
const { expect, test } = require("@playwright/test");

const MAX_WIRE_BYTES = 31 * 1024;
const MAX_RECOVERY_PACKED_ENEMY_BYTES = 12 * 1024;
const ENEMY_COUNT = 4000;
const PROJECTILE_COUNT = 200;
const FIRE_PATCH_COUNT = 200;
const SNAPSHOT_HZ = 10;
const SNAPSHOT_INTERVAL_MS = 1000 / SNAPSHOT_HZ;
const ORDINARY_FRAMES = 21;
const SIMULATED_RTT_MS = 1000;
const RETRIES_PER_RTT = SIMULATED_RTT_MS / SNAPSHOT_INTERVAL_MS;
const NATIVE_GZIP_PREFIX_BYTES = 4;

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
    window.__dustMultiplayerTest?.buildWireSnapshot &&
    window.__dustMultiplayerTest?.spawnEnemyStressField &&
    window.__dustMultiplayerTest?.spawnFirePatch &&
    window.__dustMultiplayerTest?.acknowledgeClientState
  ));
}

test("current protocol keeps a 4000-enemy mixed battle inside the 10 Hz network envelope at 1000 ms RTT", async ({ page }) => {
  test.setTimeout(240_000);
  await openGame(page);

  const run = await page.evaluate((config) => {
    const multiplayer = window.__dustMultiplayerTest;
    const encoder = new TextEncoder();
    const started = multiplayer.startMockHost(["Throughput Host", "Throughput Guest"]);
    const origin = started.players[0];

    multiplayer.spawnEnemyStressField(config.enemyCount, "visible");
    // Pull the whole dense field across the arena so it keeps producing real
    // movement deltas instead of idling on top of a stationary player.
    multiplayer.setPlayerPosition("mock-player-1", origin.x + 29, origin.z);
    multiplayer.setPlayerPosition("mock-player-2", origin.x + 29, origin.z);
    multiplayer.setNetworkRtt("mock-player-2", config.simulatedRttMs);
    // Regeneration prevents this long synthetic crowd run from ending the
    // match while retaining normal authoritative zombie movement and attacks.
    multiplayer.setProgression("mock-player-1", { hpRegen: 10000 });
    multiplayer.setProgression("mock-player-2", { hpRegen: 10000 });

    const currentPlayer = (id) => multiplayer.getState().players.find((player) => player.id === id);
    const spawnProjectileBurst = () => {
      const shooter = currentPlayer("mock-player-1");
      let fired = 0;
      for (let index = 0; index < config.projectileCount; index += 1) {
        if (index % 6 === 0) {
          const progression = currentPlayer("mock-player-1").progression;
          multiplayer.setProgression("mock-player-1", {
            weapon: "revolver",
            ammo: Object.assign({}, progression.ammo, { revolver: 6 }),
            reloadTimers: Object.assign({}, progression.reloadTimers, { revolver: 0 }),
          });
        }
        // The shooter starts just beyond the east edge of the dense field and
        // fires farther east, keeping the projectile load from killing the
        // enemies whose movement traffic is under measurement.
        if (multiplayer.fireAt("mock-player-1", shooter.x + 26, shooter.z)) fired += 1;
      }
      return fired;
    };

    const positionedGuest = currentPlayer("mock-player-2");
    let fireSpawned = 0;
    for (let index = 0; index < config.firePatchCount; index += 1) {
      const patch = multiplayer.spawnFirePatch("mock-player-1", {
        x: positionedGuest.x + 17 + (index % 10) * 0.15,
        z: positionedGuest.z - 7 + Math.floor(index / 10) * 0.7,
        radius: 0.5,
        life: 60,
        damage: 1,
        type: index % 2 ? "trail" : "thermite",
      });
      if (patch) fireSpawned += 1;
    }
    const firstProjectileBurst = spawnProjectileBurst();

    const sourceSnapshot = multiplayer.buildSnapshot(true, true, "mock-player-2");
    const initialPositions = new Map(sourceSnapshot.enemies.map((enemy) => [enemy.id, { x: enemy.x, z: enemy.z }]));

    const rawBytes = (wire) => encoder.encode(JSON.stringify(wire)).length;
    const packedSectionBytes = (section) => section?.d ? window.atob(section.d).length : 0;
    const combatAck = (wire) => (wire.combatEvents || []).reduce(
      (highest, event) => Math.max(highest, Number(event?.sequence) || 0),
      0
    );
    const build = (includePersistentWorld) => JSON.parse(JSON.stringify(
      multiplayer.buildWireSnapshot(true, includePersistentWorld, "mock-player-2")
    ));
    const acknowledge = (wire, requestKeyframe) => multiplayer.acknowledgeClientState(
      "mock-player-2",
      wire.sequence,
      combatAck(wire),
      !!requestKeyframe
    );
    const describe = (wire) => ({
      sequence: wire.sequence,
      time: Number(wire.time),
      version: wire.version,
      rawBytes: rawBytes(wire),
      packedPrimaryBytes: packedSectionBytes(wire.enemyDelta),
      packedLiveBytes: packedSectionBytes(wire.enemyLiveDelta),
      packedEnemyBytes: packedSectionBytes(wire.enemyDelta) + packedSectionBytes(wire.enemyLiveDelta),
      primaryKind: wire.enemyDelta?.k ?? null,
      primaryEpoch: wire.enemyDelta?.e ?? null,
      primaryChunk: wire.enemyDelta?.i ?? null,
      primaryChunkCount: wire.enemyDelta?.m ?? null,
      primaryFinal: wire.enemyDelta?.f ?? null,
      primaryOps: wire.enemyDelta?.c || 0,
      liveOps: wire.enemyLiveDelta?.c || 0,
      bulletsOnWire: wire.bullets?.length || 0,
      fireOnWire: (wire.firePatches?.length || 0) + (wire.hazardUpserts?.firePatches?.length || 0),
      combatEvents: wire.combatEvents?.length || 0,
    });

    const bootstrap = [];
    let bootstrapComplete = false;
    for (let attempt = 0; attempt < 64 && !bootstrapComplete; attempt += 1) {
      const wire = build(attempt === 0);
      const frame = describe(wire);
      bootstrap.push(frame);
      if (wire.enemyDelta?.k !== 1) continue;
      acknowledge(wire, false);
      bootstrapComplete = wire.enemyDelta.f === 1;
    }

    const ordinary = [];
    const ordinaryWirePayloads = [];
    let lastOrdinaryWire = null;
    for (let index = 0; index < config.ordinaryFrameCount; index += 1) {
      window.advanceTime(config.snapshotIntervalMs);
      multiplayer.setHealth("mock-player-1", 100);
      multiplayer.setHealth("mock-player-2", 100);
      const wire = build((index + 1) % config.snapshotHz === 0);
      const legacyWire = Object.assign({}, wire, {
        players: multiplayer.decodePlayerWireEntries(wire.ps),
      });
      delete legacyWire.ps;
      ordinaryWirePayloads.push({
        packed: JSON.stringify(wire),
        legacy: JSON.stringify(legacyWire),
      });
      ordinary.push(Object.assign(describe(wire), {
        authoritativeBullets: multiplayer.getAuthoritativeBullets().length,
        authoritativeEnemies: multiplayer.getAuthoritativeEnemies().length,
      }));
      acknowledge(wire, false);
      lastOrdinaryWire = wire;
    }

    const secondProjectileBurst = spawnProjectileBurst();
    acknowledge(lastOrdinaryWire, true);

    const recovery = [];
    let recoveryChunkCount = 0;
    let recoveryComplete = false;
    let recoveryFrameIndex = 0;
    let recoveryClockSteps = 0;
    const advanceRecoveryClock = () => {
      recoveryClockSteps += 1;
      // Preserve the full logical 10 Hz/1000 ms timeline while avoiding a
      // renderer benchmark: two intervals per RTT run authoritative zombie
      // simulation and the remaining intervals advance projectile/network time.
      if (recoveryClockSteps % 5 === 0) window.advanceTime(config.snapshotIntervalMs);
      else multiplayer.stepBullets(config.snapshotIntervalMs / 1000);
      multiplayer.setHealth("mock-player-1", 100);
      multiplayer.setHealth("mock-player-2", 100);
    };
    for (let expectedChunk = 0; expectedChunk < 64 && !recoveryComplete; expectedChunk += 1) {
      let ackCandidate = null;
      for (let retry = 0; retry < config.retriesPerRtt; retry += 1) {
        if (retry > 0) advanceRecoveryClock();
        recoveryFrameIndex += 1;
        const wire = build(recoveryFrameIndex % config.snapshotHz === 0);
        const frame = Object.assign(describe(wire), {
          expectedChunk,
          retry,
          authoritativeBullets: multiplayer.getAuthoritativeBullets().length,
          authoritativeEnemies: multiplayer.getAuthoritativeEnemies().length,
        });
        recovery.push(frame);
        if (wire.enemyDelta?.k === 1 && wire.enemyDelta.i === expectedChunk) {
          ackCandidate = wire;
          recoveryChunkCount = wire.enemyDelta.m;
        }
      }
      // The first transmission of this frozen chunk has now spent one logical
      // RTT in flight. ACK the newest retry that actually contained it.
      advanceRecoveryClock();
      if (!ackCandidate) break;
      acknowledge(ackCandidate, false);
      recoveryComplete = recoveryChunkCount > 0 && expectedChunk + 1 >= recoveryChunkCount;
    }

    const finalEnemies = multiplayer.getAuthoritativeEnemies();
    const movedEnemies = finalEnemies.filter((enemy) => {
      const initial = initialPositions.get(enemy.id);
      return initial && Math.hypot(enemy.x - initial.x, enemy.z - initial.z) > 0.1;
    }).length;
    const budget = multiplayer.getNetworkBudgetDiagnostics();
    const allFrames = bootstrap.concat(ordinary, recovery);
    const ordinarySeconds = ordinary.length / config.snapshotHz;
    const recoverySeconds = recovery.length / config.snapshotHz;
    const sumRaw = (frames) => frames.reduce((total, frame) => total + frame.rawBytes, 0);
    const percentile = (values, ratio) => {
      const sorted = values.slice().sort((first, second) => first - second);
      return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))] || 0;
    };

    return {
      protocol: allFrames[0]?.version || 0,
      configuredSnapshotHz: config.snapshotHz,
      simulatedRttMs: config.simulatedRttMs,
      source: {
        totalEnemies: sourceSnapshot.totalEnemies,
        relevantEnemies: sourceSnapshot.enemies.length,
        relevantBullets: sourceSnapshot.bullets.length,
        relevantFirePatches: sourceSnapshot.firePatches.length,
        activeFirePatches: fireSpawned,
        firstProjectileBurst,
        secondProjectileBurst,
      },
      bootstrap: {
        complete: bootstrapComplete,
        frames: bootstrap.length,
        chunks: bootstrap[0]?.primaryChunkCount || 0,
        maxRawBytes: Math.max(...bootstrap.map((frame) => frame.rawBytes)),
      },
      ordinary: {
        frames: ordinary.length,
        seconds: ordinarySeconds,
        keyframes: ordinary.filter((frame) => frame.primaryKind === 1).length,
        deltaFrames: ordinary.filter((frame) => frame.primaryKind === 0).length,
        liveRecoveryFrames: ordinary.filter((frame) => frame.liveOps > 0).length,
        maxRawBytes: Math.max(...ordinary.map((frame) => frame.rawBytes)),
        p95RawBytes: percentile(ordinary.map((frame) => frame.rawBytes), 0.95),
        rawBytesPerSecond: Math.round(sumRaw(ordinary) / ordinarySeconds),
        maxAuthoritativeBullets: Math.max(...ordinary.map((frame) => frame.authoritativeBullets)),
        minAuthoritativeEnemies: Math.min(...ordinary.map((frame) => frame.authoritativeEnemies)),
      },
      ordinaryWirePayloads,
      recovery: {
        complete: recoveryComplete,
        chunks: recoveryChunkCount,
        frames: recovery.length,
        seconds: recoverySeconds,
        keyframeFrames: recovery.filter((frame) => frame.primaryKind === 1).length,
        liveFrames: recovery.filter((frame) => frame.liveOps > 0).length,
        maxRawBytes: Math.max(...recovery.map((frame) => frame.rawBytes)),
        p95RawBytes: percentile(recovery.map((frame) => frame.rawBytes), 0.95),
        maxPackedEnemyBytes: Math.max(...recovery.map((frame) => frame.packedEnemyBytes)),
        rawBytesPerSecond: Math.round(sumRaw(recovery) / recoverySeconds),
        maxAuthoritativeBullets: Math.max(...recovery.map((frame) => frame.authoritativeBullets)),
        minAuthoritativeEnemies: Math.min(...recovery.map((frame) => frame.authoritativeEnemies)),
        chunkIndices: Array.from(new Set(recovery
          .filter((frame) => frame.primaryKind === 1)
          .map((frame) => frame.primaryChunk))),
      },
      movement: {
        remainingEnemies: finalEnemies.length,
        movedEnemies,
      },
      limits: {
        maxRawBytes: Math.max(...allFrames.map((frame) => frame.rawBytes)),
        oversizeFrames: allFrames.filter((frame) => frame.rawBytes > config.maxWireBytes).length,
        recoveryPackedOverBudgetFrames: recovery.filter(
          (frame) => frame.packedEnemyBytes > config.maxRecoveryPackedEnemyBytes
        ).length,
        theoreticalRawBytesPerSecondAt10Hz: config.maxWireBytes * config.snapshotHz,
      },
      networkHealth: {
        wireBudgetTrims: budget.stats.wireBudgetTrims,
        wireOversizeSnapshots: budget.stats.wireOversizeSnapshots,
        slowClientDisconnects: budget.stats.slowClientDisconnects,
        enemyOpHighWater: budget.stats.enemyOpHighWater,
        maxEnemyChunkCount: budget.stats.maxEnemyChunkCount,
      },
    };
  }, {
    enemyCount: ENEMY_COUNT,
    projectileCount: PROJECTILE_COUNT,
    firePatchCount: FIRE_PATCH_COUNT,
    snapshotHz: SNAPSHOT_HZ,
    snapshotIntervalMs: SNAPSHOT_INTERVAL_MS,
    ordinaryFrameCount: ORDINARY_FRAMES,
    simulatedRttMs: SIMULATED_RTT_MS,
    retriesPerRtt: RETRIES_PER_RTT,
    maxWireBytes: MAX_WIRE_BYTES,
    maxRecoveryPackedEnemyBytes: MAX_RECOVERY_PACKED_ENEMY_BYTES,
  });

  const compressedPayloadBytes = (json) => NATIVE_GZIP_PREFIX_BYTES + gzipSync(Buffer.from(json)).length;
  const packedCompressedBytes = run.ordinaryWirePayloads.reduce(
    (total, payload) => total + compressedPayloadBytes(payload.packed),
    0
  );
  const legacyCompressedBytes = run.ordinaryWirePayloads.reduce(
    (total, payload) => total + compressedPayloadBytes(payload.legacy),
    0
  );
  const averagePackedPacketBytes = packedCompressedBytes / run.ordinaryWirePayloads.length;
  const averageLegacyPacketBytes = legacyCompressedBytes / run.ordinaryWirePayloads.length;
  run.playerCodec = {
    packedCompressedBytesPerSecondAt10Hz: Math.round(averagePackedPacketBytes * 10),
    legacyCompressedBytesPerSecondAt10Hz: Math.round(averageLegacyPacketBytes * 10),
    savedCompressedBytesPerSecondAt10Hz: Math.round((averageLegacyPacketBytes - averagePackedPacketBytes) * 10),
    packedCompressedKiBPerSecondAt10Hz: Number((averagePackedPacketBytes * 10 / 1024).toFixed(2)),
    legacyCompressedKiBPerSecondAt10Hz: Number((averageLegacyPacketBytes * 10 / 1024).toFixed(2)),
    projectedPackedKiBPerSecondAt12Hz: Number((averagePackedPacketBytes * 12 / 1024).toFixed(2)),
    projectedLegacyKiBPerSecondAt12Hz: Number((averageLegacyPacketBytes * 12 / 1024).toFixed(2)),
    projectedPackedKiBPerSecondAt15Hz: Number((averagePackedPacketBytes * 15 / 1024).toFixed(2)),
    projectedLegacyKiBPerSecondAt15Hz: Number((averageLegacyPacketBytes * 15 / 1024).toFixed(2)),
  };
  delete run.ordinaryWirePayloads;
  const report = JSON.stringify(run, null, 2);
  console.log(`protocol ${run.protocol} network throughput metrics\n${report}`);

  expect(run.protocol, report).toBe(46);
  expect(run.configuredSnapshotHz, report).toBe(10);
  expect(run.simulatedRttMs, report).toBe(1000);
  expect(run.source, report).toMatchObject({
    totalEnemies: ENEMY_COUNT,
    relevantBullets: PROJECTILE_COUNT,
    activeFirePatches: FIRE_PATCH_COUNT,
    firstProjectileBurst: PROJECTILE_COUNT,
    secondProjectileBurst: PROJECTILE_COUNT,
  });
  expect(run.source.relevantEnemies, report).toBeGreaterThanOrEqual(ENEMY_COUNT * 0.85);
  expect(run.source.relevantFirePatches, report).toBeGreaterThanOrEqual(100);

  expect(run.bootstrap.complete, report).toBe(true);
  expect(run.bootstrap.chunks, report).toBeGreaterThan(1);
  expect(run.ordinary.frames, report).toBe(ORDINARY_FRAMES);
  expect(run.ordinary.seconds, report).toBe(ORDINARY_FRAMES / SNAPSHOT_HZ);
  expect(run.ordinary.keyframes, "established replication must not schedule periodic keyframes\n" + report).toBe(0);
  expect(run.ordinary.deltaFrames, report).toBeGreaterThanOrEqual(run.ordinary.frames - 1);
  expect(run.ordinary.liveRecoveryFrames, report).toBe(0);

  expect(run.recovery.complete, report).toBe(true);
  expect(run.recovery.chunks, report).toBeGreaterThan(1);
  expect(run.recovery.frames, report).toBe(run.recovery.chunks * RETRIES_PER_RTT);
  expect(run.recovery.keyframeFrames, report).toBeGreaterThanOrEqual(run.recovery.chunks);
  expect(run.recovery.liveFrames, report).toBeGreaterThan(run.recovery.chunks);
  expect(run.recovery.chunkIndices, report).toEqual(
    Array.from({ length: run.recovery.chunks }, (_, index) => index)
  );

  expect(run.limits.oversizeFrames, report).toBe(0);
  expect(run.limits.maxRawBytes, report).toBeLessThanOrEqual(MAX_WIRE_BYTES);
  expect(run.limits.recoveryPackedOverBudgetFrames, report).toBe(0);
  expect(run.recovery.maxPackedEnemyBytes, report).toBeLessThanOrEqual(MAX_RECOVERY_PACKED_ENEMY_BYTES);
  expect(run.ordinary.rawBytesPerSecond, report).toBeLessThanOrEqual(
    run.limits.theoreticalRawBytesPerSecondAt10Hz
  );
  expect(run.playerCodec.packedCompressedBytesPerSecondAt10Hz, report)
    .toBeLessThan(run.playerCodec.legacyCompressedBytesPerSecondAt10Hz);
  expect(run.playerCodec.savedCompressedBytesPerSecondAt10Hz, report).toBeGreaterThanOrEqual(5 * 1024);
  expect(run.recovery.rawBytesPerSecond, report).toBeLessThanOrEqual(
    run.limits.theoreticalRawBytesPerSecondAt10Hz
  );

  expect(run.networkHealth.wireOversizeSnapshots, report).toBe(0);
  expect(run.networkHealth.slowClientDisconnects, report).toBe(0);
  expect(run.ordinary.minAuthoritativeEnemies, report).toBeGreaterThanOrEqual(ENEMY_COUNT * 0.95);
  expect(run.recovery.minAuthoritativeEnemies, report).toBeGreaterThanOrEqual(ENEMY_COUNT * 0.95);
  expect(run.movement.movedEnemies, report).toBeGreaterThanOrEqual(ENEMY_COUNT * 0.7);
});
