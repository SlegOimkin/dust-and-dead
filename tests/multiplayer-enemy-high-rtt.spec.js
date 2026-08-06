const path = require("node:path");
const { expect, test } = require("@playwright/test");

const SIMULATED_RTT_MS = 750;
const RETRIES_PER_CHUNK = 10;
const ENEMY_COUNT = 1300;

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
    window.__dustMultiplayerTest?.getGuestEnemyDiagnostics &&
    window.__dustMultiplayerTest?.acknowledgeClientState
  ));
}

test("ordinary guest keeps fresh zombie motion while a multi-chunk keyframe waits on high RTT", async ({ page, context }) => {
  test.setTimeout(180_000);
  await openGame(page);
  const guestPage = await context.newPage();
  await openGame(guestPage);

  const hostRun = await page.evaluate(({ enemyCount, simulatedRttMs, retriesPerChunk }) => {
    const multiplayer = window.__dustMultiplayerTest;
    const started = multiplayer.startMockHost(["RTT Host", "RTT Guest"]);
    const center = started.players[0];
    multiplayer.setPlayerPosition("mock-player-2", center.x, center.z);
    multiplayer.spawnEnemyStressField(enemyCount, "visible");
    // Pull the horde across the arena instead of leaving a player in its dense
    // centre. This provides deterministic continuous movement during transfer.
    multiplayer.setPlayerPosition("mock-player-1", center.x + 29, center.z);
    multiplayer.setPlayerPosition("mock-player-2", center.x + 29, center.z);
    multiplayer.setNetworkRtt("mock-player-2", simulatedRttMs);
    const cloneWire = () => JSON.parse(JSON.stringify(
      multiplayer.buildWireSnapshot(false, false, "mock-player-2")
    ));
    const combatAck = (wire) => (wire.combatEvents || []).reduce(
      (highest, event) => Math.max(highest, Number(event && event.sequence) || 0),
      0
    );
    const acknowledge = (wire, requestKeyframe) => multiplayer.acknowledgeClientState(
      "mock-player-2",
      wire.sequence,
      combatAck(wire),
      !!requestKeyframe
    );

    const initialFrames = [];
    let frame = cloneWire();
    const setupEpoch = frame.enemyDelta && frame.enemyDelta.e;
    while (frame.enemyDelta && frame.enemyDelta.k === 1) {
      initialFrames.push(frame);
      acknowledge(frame, false);
      if (frame.enemyDelta.f === 1) break;
      frame = cloneWire();
    }

    const ordinaryFrames = [];
    for (let ordinaryIndex = 0; ordinaryIndex < 9; ordinaryIndex += 1) {
      if (ordinaryIndex < 2) window.advanceTime(250);
      else multiplayer.stepBullets(0.25);
      frame = cloneWire();
      ordinaryFrames.push(frame);
      acknowledge(frame, false);
    }

    // The already ACKed snapshot is reused only to issue an explicit recovery
    // request. This is equivalent to the guest's monotonic request sequence.
    acknowledge(frame, true);
    const recoveryFirst = cloneWire();
    const transferEpoch = recoveryFirst.enemyDelta && recoveryFirst.enemyDelta.e;
    const chunkCount = recoveryFirst.enemyDelta && recoveryFirst.enemyDelta.m;
    const transferStartTime = Number(recoveryFirst.enemyDelta && recoveryFirst.enemyDelta.t);
    const transferFrames = [];
    let networkAdvanceIndex = 0;

    for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex += 1) {
      let latestFrame = recoveryFirst;
      for (let retry = 0; retry < retriesPerChunk; retry += 1) {
        if (chunkIndex > 0 || retry > 0) {
          networkAdvanceIndex += 1;
          const milliseconds = simulatedRttMs / retriesPerChunk;
          if (networkAdvanceIndex % 3 === 1) window.advanceTime(milliseconds);
          else multiplayer.stepBullets(milliseconds / 1000);
          latestFrame = cloneWire();
        }
        transferFrames.push(latestFrame);
      }
      acknowledge(latestFrame, false);
    }

    window.advanceTime(67);
    const freshFrame = cloneWire();
    return {
      setupEpoch,
      initialFrames,
      ordinaryFrames,
      recoveryFirst,
      transferEpoch,
      chunkCount,
      transferStartTime,
      transferFrames,
      freshFrame,
    };
  }, {
    enemyCount: ENEMY_COUNT,
    simulatedRttMs: SIMULATED_RTT_MS,
    retriesPerChunk: RETRIES_PER_CHUNK,
  });

  expect(hostRun.initialFrames.length).toBeGreaterThan(1);
  expect(hostRun.initialFrames.every((wire) => wire.enemyDelta?.e === hostRun.setupEpoch)).toBe(true);
  expect(
    hostRun.ordinaryFrames.every((wire) => wire.enemyDelta?.k === 0),
    "an established ordinary guest must not enter periodic stop-and-wait recovery"
  ).toBe(true);
  expect(hostRun.recoveryFirst.enemyDelta).toMatchObject({
    k: 1,
    e: hostRun.transferEpoch,
    i: 0,
    m: hostRun.chunkCount,
  });
  expect(hostRun.chunkCount).toBeGreaterThan(1);
  expect(hostRun.freshFrame.enemyDelta?.k).toBe(0);

  const metrics = await guestPage.evaluate(({ run, simulatedRttMs }) => {
    const multiplayer = window.__dustMultiplayerTest;
    multiplayer.startMockGuest(["RTT Host", "RTT Guest"], 1);
    run.initialFrames.forEach((wire) => multiplayer.applySnapshot(wire));

    let ordinaryMaxMovingSampleAgeSeconds = 0;
    let lastOrdinaryDiagnostics = [];
    let lastOrdinaryTime = 0;
    run.ordinaryFrames.forEach((wire) => {
      multiplayer.applySnapshot(wire);
      const diagnostics = multiplayer.getGuestEnemyDiagnostics();
      lastOrdinaryDiagnostics = diagnostics;
      lastOrdinaryTime = Number(wire.time);
      diagnostics.forEach((enemy) => {
        if (Math.hypot(enemy.velocityX, enemy.velocityZ) > 0.05) {
          ordinaryMaxMovingSampleAgeSeconds = Math.max(
            ordinaryMaxMovingSampleAgeSeconds,
            Number(wire.time) - enemy.sampleTime
          );
        }
      });
    });

    let trackedIds = null;
    const lastTarget = new Map();
    let lastAnyTargetChangeAt = run.transferStartTime;
    let framesWithLiveDelta = 0;
    let framesWithTrackedMovement = 0;
    let oldestTrackedSampleAgeSeconds = 0;
    let maxChangedSampleAgeSeconds = 0;
    let maxGlobalMotionSilenceSeconds = 0;
    const transferFrames = [];

    run.transferFrames.forEach((wire) => {
      multiplayer.applySnapshot(wire);
      const diagnostics = multiplayer.getGuestEnemyDiagnostics();
      const snapshotTime = Number(wire.time);
      if (!trackedIds) {
        trackedIds = new Set(diagnostics
          .filter((enemy) => Math.abs(enemy.sampleTime - run.transferStartTime) < 0.005)
          .sort((a, b) => Math.hypot(b.velocityX, b.velocityZ) - Math.hypot(a.velocityX, a.velocityZ))
          .slice(0, 200)
          .map((enemy) => enemy.id));
      }
      if (wire.enemyLiveDelta && wire.enemyLiveDelta.c > 0) framesWithLiveDelta += 1;
      let frameOldestSampleAge = 0;
      let changedTracked = 0;
      let frameChangedSampleAge = 0;
      diagnostics.forEach((enemy) => {
        if (!enemy.sampleTime || !trackedIds.has(enemy.id)) return;
        frameOldestSampleAge = Math.max(frameOldestSampleAge, snapshotTime - enemy.sampleTime);
        const previous = lastTarget.get(enemy.id);
        if (!previous || Math.hypot(enemy.targetX - previous.x, enemy.targetZ - previous.z) > 0.001) {
          if (previous) {
            changedTracked += 1;
            frameChangedSampleAge = Math.max(frameChangedSampleAge, snapshotTime - enemy.sampleTime);
          }
          lastTarget.set(enemy.id, { x: enemy.targetX, z: enemy.targetZ });
        }
      });
      if (changedTracked > 0) {
        framesWithTrackedMovement += 1;
        lastAnyTargetChangeAt = snapshotTime;
        maxChangedSampleAgeSeconds = Math.max(maxChangedSampleAgeSeconds, frameChangedSampleAge);
      }
      maxGlobalMotionSilenceSeconds = Math.max(
        maxGlobalMotionSilenceSeconds,
        snapshotTime - lastAnyTargetChangeAt
      );
      oldestTrackedSampleAgeSeconds = Math.max(oldestTrackedSampleAgeSeconds, frameOldestSampleAge);
      transferFrames.push({
        time: snapshotTime,
        chunk: wire.enemyDelta.i,
        liveOps: wire.enemyLiveDelta ? wire.enemyLiveDelta.c : 0,
        changedTracked,
        oldestSampleAge: Number(frameOldestSampleAge.toFixed(3)),
      });
    });

    const beforeCatchUp = new Map(multiplayer.getGuestEnemyDiagnostics().map((enemy) => [enemy.id, enemy]));
    multiplayer.applySnapshot(run.freshFrame);
    const afterApply = new Map(multiplayer.getGuestEnemyDiagnostics().map((enemy) => [enemy.id, enemy]));
    window.advanceTime(100);
    const afterRender = new Map(multiplayer.getGuestEnemyDiagnostics().map((enemy) => [enemy.id, enemy]));
    const targetCorrections = [];
    const immediateCorrections = [];
    const renderedCorrections = [];
    let maxImmediateTeleport = 0;
    let maxRenderedCatchUp100Ms = 0;
    const distance = (first, second, xField, zField) => Math.hypot(
      first[xField] - second[xField],
      first[zField] - second[zField]
    );
    beforeCatchUp.forEach((before, id) => {
      if (!trackedIds || !trackedIds.has(id)) return;
      const applied = afterApply.get(id);
      const rendered = afterRender.get(id);
      if (!applied || !rendered) return;
      const targetCorrection = distance(before, applied, "targetX", "targetZ");
      const immediateCorrection = distance(before, applied, "x", "z");
      const renderedCorrection = distance(before, rendered, "x", "z");
      targetCorrections.push(targetCorrection);
      immediateCorrections.push(immediateCorrection);
      renderedCorrections.push(renderedCorrection);
      maxImmediateTeleport = Math.max(maxImmediateTeleport, immediateCorrection);
      maxRenderedCatchUp100Ms = Math.max(maxRenderedCatchUp100Ms, renderedCorrection);
    });
    targetCorrections.sort((a, b) => a - b);
    immediateCorrections.sort((a, b) => a - b);
    renderedCorrections.sort((a, b) => a - b);
    const percentile = (values, ratio) => values[Math.min(values.length - 1, Math.floor(values.length * ratio))] || 0;
    const ordinaryTrackedSampleAgeSeconds = trackedIds
      ? lastOrdinaryDiagnostics.reduce((oldest, enemy) => trackedIds.has(enemy.id)
        ? Math.max(oldest, lastOrdinaryTime - enemy.sampleTime)
        : oldest, 0)
      : 0;

    return {
      enemyCount: beforeCatchUp.size,
      trackedEnemies: trackedIds ? trackedIds.size : 0,
      chunkCount: run.chunkCount,
      simulatedRttMs,
      ordinaryFrameCount: run.ordinaryFrames.length,
      ordinaryMaxMovingSampleAgeSeconds: Number(ordinaryMaxMovingSampleAgeSeconds.toFixed(3)),
      ordinaryTrackedSampleAgeSeconds: Number(ordinaryTrackedSampleAgeSeconds.toFixed(3)),
      transferDurationSeconds: Number((Number(run.freshFrame.time) - run.transferStartTime).toFixed(3)),
      framesWithLiveDelta,
      framesWithTrackedMovement,
      oldestTrackedSampleAgeSeconds: Number(oldestTrackedSampleAgeSeconds.toFixed(3)),
      maxChangedSampleAgeSeconds: Number(maxChangedSampleAgeSeconds.toFixed(3)),
      maxGlobalMotionSilenceSeconds: Number(maxGlobalMotionSilenceSeconds.toFixed(3)),
      p95TargetCorrection: Number(percentile(targetCorrections, 0.95).toFixed(3)),
      p95ImmediateCorrection: Number(percentile(immediateCorrections, 0.95).toFixed(3)),
      p95RenderedCatchUp100Ms: Number(percentile(renderedCorrections, 0.95).toFixed(3)),
      maxImmediateTeleport: Number(maxImmediateTeleport.toFixed(3)),
      maxRenderedCatchUp100Ms: Number(maxRenderedCatchUp100Ms.toFixed(3)),
      transferFrames,
    };
  }, { run: hostRun, simulatedRttMs: SIMULATED_RTT_MS });

  const report = JSON.stringify(metrics, null, 2);
  expect(metrics.trackedEnemies, report).toBeGreaterThan(0);
  expect(metrics.framesWithLiveDelta, report).toBeGreaterThan(0);
  expect(metrics.framesWithTrackedMovement, report).toBeGreaterThanOrEqual(3);
  expect(metrics.maxChangedSampleAgeSeconds, report).toBeLessThanOrEqual(0.15);
  expect(metrics.maxGlobalMotionSilenceSeconds, report).toBeLessThanOrEqual(0.3);
  expect(metrics.p95TargetCorrection, report).toBeLessThanOrEqual(2.5);
  expect(metrics.p95ImmediateCorrection, report).toBeLessThan(1);
});
