const path = require("node:path");
const { gzipSync } = require("node:zlib");
const { expect, test } = require("@playwright/test");

const CURRENT_PROTOCOL = 46;
const SNAPSHOT_HZ = 12;
const SNAPSHOT_INTERVAL_MS = 1000 / SNAPSHOT_HZ;
const MEASURED_FRAMES = SNAPSHOT_HZ * 2;
const MAX_WIRE_BYTES = 31 * 1024;
// Pre-codec protocol 21 baseline on this deterministic workload was
// 79.33 KiB/s. Keeping the hard ceiling at 66 preserves a meaningful saving
// while retaining exact 8-bit angles for every visible movement update.
const SINGLE_CLIENT_COMPRESSED_TARGET = 66 * 1024;
// The matching four-player host baseline was 244.96 KiB/s across three remote
// clients. 210 KiB/s leaves normal measurement headroom without accepting a
// regression to the former wire format.
const FOUR_PLAYER_HOST_COMPRESSED_TARGET = 210 * 1024;
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
    window.__dustMultiplayerTest?.acknowledgeClientState &&
    window.__dustMultiplayerTest?.spawnEnemyStressField &&
    window.__dustMultiplayerTest?.getGuestEnemyDiagnostics
  ));
}

function wireRawBytes(wire) {
  return Buffer.byteLength(JSON.stringify(wire));
}

function wireCompressedBytes(wire) {
  // Android prepends D9GZ to an ordinary GZIP stream. Node's default level is
  // the same level used by java.util.zip.GZIPOutputStream, so this is a close
  // byte-for-byte model of the real Nearby payload rather than a JSON estimate.
  return NATIVE_GZIP_PREFIX_BYTES + gzipSync(Buffer.from(JSON.stringify(wire))).length;
}

function percentile(values, ratio) {
  const sorted = values.slice().sort((first, second) => first - second);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))] || 0;
}

test("current protocol keeps 1000 moving zombies below 66 KiB/s at 12 Hz and coalesced snapshots standalone", async ({ page, context }) => {
  test.setTimeout(180_000);
  await openGame(page);
  const guestPage = await context.newPage();
  await openGame(guestPage);
  const controlPage = await context.newPage();
  await openGame(controlPage);

  const captured = await page.evaluate((config) => {
    const multiplayer = window.__dustMultiplayerTest;
    const started = multiplayer.startMockHost(["Host", "Guest"]);
    const center = started.players[0];
    const spawned = multiplayer.spawnEnemyStressField(1000, "visible");
    multiplayer.setPlayerPosition("mock-player-1", center.x + 29, center.z);
    multiplayer.setPlayerPosition("mock-player-2", center.x + 29, center.z);
    multiplayer.setProgression("mock-player-1", { hpRegen: 10000 });
    multiplayer.setProgression("mock-player-2", { hpRegen: 10000 });

    const initialPositions = new Map(multiplayer.getAuthoritativeEnemies().map((enemy) => [
      enemy.id,
      { x: enemy.x, z: enemy.z },
    ]));
    const cloneWire = () => JSON.parse(JSON.stringify(
      multiplayer.buildWireSnapshot(false, false, "mock-player-2")
    ));
    const acknowledge = (wire) => multiplayer.acknowledgeClientState(
      "mock-player-2",
      wire.sequence,
      0,
      false
    );

    const bootstrap = [];
    let wire = cloneWire();
    for (let attempt = 0; attempt < 64 && wire.enemyDelta?.k === 1; attempt += 1) {
      bootstrap.push(wire);
      acknowledge(wire);
      if (wire.enemyDelta.f === 1) break;
      wire = cloneWire();
    }

    const ordinary = [];
    for (let frame = 0; frame < config.frames; frame += 1) {
      window.advanceTime(config.intervalMs);
      multiplayer.setHealth("mock-player-1", 100);
      multiplayer.setHealth("mock-player-2", 100);
      wire = cloneWire();
      ordinary.push(wire);
      acknowledge(wire);
    }

    // Simulate latestOnly coalescing exactly: this first frame is built but is
    // neither delivered nor ACKed. The successor must therefore contain all
    // state needed to advance a client from the last acknowledged frame.
    window.advanceTime(config.intervalMs);
    const skipped = cloneWire();
    window.advanceTime(config.intervalMs);
    const successor = cloneWire();

    const authoritative = multiplayer.getAuthoritativeEnemies();
    const visibleGround = JSON.parse(window.render_game_to_text()).camera.visibleGround;
    const moved = authoritative.filter((enemy) => {
      const initial = initialPositions.get(enemy.id);
      return initial && Math.hypot(enemy.x - initial.x, enemy.z - initial.z) > 0.1;
    }).length;

    return {
      protocol: multiplayer.getNetworkBudgetDiagnostics().protocol,
      spawned,
      bootstrap,
      ordinary,
      skipped,
      successor,
      authoritative,
      visibleGround,
      moved,
    };
  }, {
    frames: MEASURED_FRAMES,
    intervalMs: SNAPSHOT_INTERVAL_MS,
  });

  const replica = await guestPage.evaluate((run) => {
    const multiplayer = window.__dustMultiplayerTest;
    multiplayer.startMockGuest(["Host", "Guest"], 1);
    run.bootstrap.forEach((wire) => multiplayer.applySnapshot(wire));
    run.ordinary.forEach((wire) => multiplayer.applySnapshot(wire));
    // Deliberately do not apply run.skipped.
    multiplayer.applySnapshot(run.successor);
    return multiplayer.getGuestEnemyDiagnostics();
  }, captured);

  const controlReplica = await controlPage.evaluate((run) => {
    const multiplayer = window.__dustMultiplayerTest;
    multiplayer.startMockGuest(["Host", "Guest"], 1);
    run.bootstrap.forEach((wire) => multiplayer.applySnapshot(wire));
    run.ordinary.forEach((wire) => multiplayer.applySnapshot(wire));
    multiplayer.applySnapshot(run.skipped);
    multiplayer.applySnapshot(run.successor);
    return multiplayer.getGuestEnemyDiagnostics();
  }, captured);

  const authoritativeById = new Map(captured.authoritative.map((enemy) => [enemy.id, enemy]));
  const positionErrors = replica.flatMap((enemy) => {
    const authoritative = authoritativeById.get(enemy.id);
    if (!authoritative) return [];
    const error = Math.hypot(enemy.targetX - authoritative.x, enemy.targetZ - authoritative.z);
    const guard = 2.5;
    const nearVisibleGround = authoritative.x >= captured.visibleGround.minX - guard &&
      authoritative.x <= captured.visibleGround.maxX + guard &&
      authoritative.z >= captured.visibleGround.minZ - guard &&
      authoritative.z <= captured.visibleGround.maxZ + guard;
    return [{
      id: enemy.id,
      error,
      x: authoritative.x,
      z: authoritative.z,
      nearVisibleGround,
    }];
  });
  const errors = positionErrors.map((entry) => entry.error);
  const visibleErrors = positionErrors.filter((entry) => entry.nearVisibleGround).map((entry) => entry.error);
  const prefetchErrors = positionErrors.filter((entry) => !entry.nearVisibleGround).map((entry) => entry.error);
  const maxOrZero = (values) => values.length ? Math.max(...values) : 0;
  const worstPositionError = positionErrors.reduce((worst, entry) =>
    !worst || entry.error > worst.error ? entry : worst, null);
  const controlById = new Map(controlReplica.map((enemy) => [enemy.id, enemy]));
  const coalescingDifferences = replica.flatMap((enemy) => {
    const control = controlById.get(enemy.id);
    if (!control) return [Infinity];
    return [Math.max(
      Math.abs(enemy.targetX - control.targetX),
      Math.abs(enemy.targetZ - control.targetZ),
      Math.abs(enemy.hp - control.hp)
    )];
  });
  const replicaSpeeds = replica.map((enemy) => Math.hypot(enemy.velocityX, enemy.velocityZ));
  const compressedSizes = captured.ordinary.map(wireCompressedBytes);
  const rawSizes = captured.ordinary.map(wireRawBytes);
  const measuredSeconds = captured.ordinary.length / SNAPSHOT_HZ;
  const compressedBytesPerSecond = Math.round(
    compressedSizes.reduce((total, bytes) => total + bytes, 0) / measuredSeconds
  );
  const report = {
    protocol: captured.protocol,
    zombies: captured.spawned.active,
    moved: captured.moved,
    snapshotHz: SNAPSHOT_HZ,
    frames: captured.ordinary.length,
    compressedBytesPerSecond,
    compressedKiBPerSecond: Number((compressedBytesPerSecond / 1024).toFixed(2)),
    averageCompressedPacketBytes: Math.round(
      compressedSizes.reduce((total, bytes) => total + bytes, 0) / compressedSizes.length
    ),
    p95CompressedPacketBytes: percentile(compressedSizes, 0.95),
    maxRawPacketBytes: Math.max(...rawSizes),
    skippedSequence: captured.skipped.sequence,
    successorSequence: captured.successor.sequence,
    replicaEnemies: replica.length,
    controlReplicaEnemies: controlReplica.length,
    comparedEnemies: errors.length,
    p95StandalonePositionError: Number(percentile(errors, 0.95).toFixed(4)),
    maxStandalonePositionError: Number(maxOrZero(errors).toFixed(4)),
    nearVisibleEnemies: visibleErrors.length,
    maxNearVisiblePositionError: Number(maxOrZero(visibleErrors).toFixed(4)),
    maxPrefetchPositionError: Number(maxOrZero(prefetchErrors).toFixed(4)),
    worstPositionError,
    coalescedReplicaDifferences: coalescingDifferences.filter((difference) => difference > 0).length,
    maxCoalescedReplicaDifference: Math.max(...coalescingDifferences),
    maxReplicaVelocity: Number(Math.max(...replicaSpeeds).toFixed(3)),
  };
  const details = JSON.stringify(report, null, 2);
  console.log(`protocol ${CURRENT_PROTOCOL} single-client network metrics\n${details}`);

  expect(captured.protocol, details).toBe(CURRENT_PROTOCOL);
  expect(captured.spawned.active, details).toBe(1000);
  expect(captured.moved, details).toBeGreaterThanOrEqual(700);
  expect(captured.ordinary, details).toHaveLength(MEASURED_FRAMES);
  expect(Math.max(...rawSizes), details).toBeLessThanOrEqual(MAX_WIRE_BYTES);
  expect(compressedBytesPerSecond, details).toBeLessThanOrEqual(SINGLE_CLIENT_COMPRESSED_TARGET);

  expect(captured.successor.sequence, details).toBeGreaterThan(captured.skipped.sequence);
  expect(errors.length, details).toBeGreaterThanOrEqual(950);
  // Only the invisible prefetch ring intentionally uses /2 or /3 cadence.
  // Keep a strict bound for the real camera plus an approach guard, while the
  // wider ring gets a bounded allowance that cannot be mistaken for a visible
  // synchronization regression. The transition itself is covered separately.
  expect(visibleErrors.length, details).toBeGreaterThanOrEqual(300);
  expect(maxOrZero(visibleErrors), details).toBeLessThanOrEqual(1);
  expect(percentile(errors, 0.95), details).toBeLessThanOrEqual(0.65);
  expect(maxOrZero(errors), details).toBeLessThanOrEqual(3.5);
  expect(replica.length, details).toBe(controlReplica.length);
  expect(coalescingDifferences.every((difference) => difference === 0), details).toBe(true);
  expect(replicaSpeeds.every((speed) => Number.isFinite(speed) && speed <= 22.01), details).toBe(true);
});

test("current protocol keeps aggregate host outbound below 210 KiB/s for four distributed players and 4000 moving zombies", async ({ page }) => {
  test.setTimeout(240_000);
  await openGame(page);

  const captured = await page.evaluate((config) => {
    const multiplayer = window.__dustMultiplayerTest;
    multiplayer.startMockHost(["Host", "Guest A", "Guest B", "Guest C"]);

    const clusterCenters = [
      { x: -110, z: -70 },
      { x: 70, z: -70 },
      { x: -110, z: 70 },
      { x: 70, z: 70 },
    ];
    const playerIds = ["mock-player-1", "mock-player-2", "mock-player-3", "mock-player-4"];
    const guestIds = playerIds.slice(1);
    const initialPositions = new Map();

    clusterCenters.forEach((center) => {
      multiplayer.setPlayerPosition("mock-player-1", center.x, center.z);
      multiplayer.spawnEnemyStressField(1000, "visible");
    });
    playerIds.forEach((playerId, index) => {
      const center = clusterCenters[index];
      multiplayer.setPlayerPosition(playerId, center.x + 29, center.z);
      multiplayer.setProgression(playerId, { hpRegen: 10000 });
    });
    multiplayer.getAuthoritativeEnemies().forEach((enemy) => {
      initialPositions.set(enemy.id, { x: enemy.x, z: enemy.z });
    });

    const cloneWire = (viewerId) => JSON.parse(JSON.stringify(
      multiplayer.buildWireSnapshot(false, false, viewerId)
    ));
    const acknowledge = (viewerId, wire) => multiplayer.acknowledgeClientState(
      viewerId,
      wire.sequence,
      0,
      false
    );

    const bootstrap = {};
    guestIds.forEach((viewerId) => {
      bootstrap[viewerId] = [];
      let wire = cloneWire(viewerId);
      for (let attempt = 0; attempt < 64 && wire.enemyDelta?.k === 1; attempt += 1) {
        bootstrap[viewerId].push(wire);
        acknowledge(viewerId, wire);
        if (wire.enemyDelta.f === 1) break;
        wire = cloneWire(viewerId);
      }
    });

    const relevantByPlayer = {};
    playerIds.forEach((playerId) => {
      relevantByPlayer[playerId] = multiplayer.getEnemyNetworkDiagnostics(playerId).selected;
    });

    const frames = [];
    for (let frame = 0; frame < config.frames; frame += 1) {
      window.advanceTime(config.intervalMs);
      playerIds.forEach((playerId) => multiplayer.setHealth(playerId, 100));
      guestIds.forEach((viewerId) => {
        const wire = cloneWire(viewerId);
        frames.push({ viewerId, wire });
        acknowledge(viewerId, wire);
      });
    }

    const authoritative = multiplayer.getAuthoritativeEnemies();
    const moved = authoritative.filter((enemy) => {
      const initial = initialPositions.get(enemy.id);
      return initial && Math.hypot(enemy.x - initial.x, enemy.z - initial.z) > 0.1;
    }).length;

    return {
      protocol: multiplayer.getNetworkBudgetDiagnostics().protocol,
      totalEnemies: authoritative.length,
      moved,
      relevantByPlayer,
      bootstrapChunks: Object.fromEntries(Object.entries(bootstrap).map(([id, wires]) => [id, wires.length])),
      frames,
    };
  }, {
    frames: MEASURED_FRAMES,
    intervalMs: SNAPSHOT_INTERVAL_MS,
  });

  const measuredSeconds = MEASURED_FRAMES / SNAPSHOT_HZ;
  const guestIds = ["mock-player-2", "mock-player-3", "mock-player-4"];
  const perClient = {};
  for (const viewerId of guestIds) {
    const frames = captured.frames.filter((frame) => frame.viewerId === viewerId);
    const compressedBytes = frames.reduce((total, frame) => total + wireCompressedBytes(frame.wire), 0);
    perClient[viewerId] = {
      frames: frames.length,
      compressedBytesPerSecond: Math.round(compressedBytes / measuredSeconds),
      compressedKiBPerSecond: Number((compressedBytes / measuredSeconds / 1024).toFixed(2)),
      maxRawPacketBytes: Math.max(...frames.map((frame) => wireRawBytes(frame.wire))),
    };
  }
  const aggregateBytesPerSecond = Object.values(perClient).reduce(
    (total, client) => total + client.compressedBytesPerSecond,
    0
  );
  const report = {
    protocol: captured.protocol,
    totalEnemies: captured.totalEnemies,
    moved: captured.moved,
    snapshotHz: SNAPSHOT_HZ,
    relevantByPlayer: captured.relevantByPlayer,
    bootstrapChunks: captured.bootstrapChunks,
    perClient,
    aggregateHostCompressedBytesPerSecond: aggregateBytesPerSecond,
    aggregateHostCompressedKiBPerSecond: Number((aggregateBytesPerSecond / 1024).toFixed(2)),
  };
  const details = JSON.stringify(report, null, 2);
  console.log(`protocol ${CURRENT_PROTOCOL} four-player distributed network metrics\n${details}`);

  expect(captured.protocol, details).toBe(CURRENT_PROTOCOL);
  expect(captured.totalEnemies, details).toBe(4000);
  expect(captured.moved, details).toBeGreaterThanOrEqual(2800);
  for (const playerId of ["mock-player-1", ...guestIds]) {
    expect(captured.relevantByPlayer[playerId], details).toBeGreaterThanOrEqual(850);
    expect(captured.relevantByPlayer[playerId], details).toBeLessThanOrEqual(1250);
  }
  for (const viewerId of guestIds) {
    const frames = captured.frames.filter((frame) => frame.viewerId === viewerId);
    expect(perClient[viewerId].frames, details).toBe(MEASURED_FRAMES);
    expect(perClient[viewerId].maxRawPacketBytes, details).toBeLessThanOrEqual(MAX_WIRE_BYTES);
    expect(captured.bootstrapChunks[viewerId], details).toBeGreaterThan(0);
    expect(frames.every(({ wire }) => wire.enemyDelta?.k === 0), details).toBe(true);
    expect(frames.some(({ wire }) => Number(wire.enemyDelta?.c) > 0), details).toBe(true);
  }
  expect(aggregateBytesPerSecond, details).toBeLessThanOrEqual(FOUR_PLAYER_HOST_COMPRESSED_TARGET);
});
