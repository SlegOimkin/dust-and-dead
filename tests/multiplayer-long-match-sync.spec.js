const path = require("node:path");
const { expect, test } = require("@playwright/test");

const LONG_RUN_FRAMES = 240;
const SNAPSHOT_INTERVAL_MS = 100;
const REALISTIC_WAVE_10_ENEMIES = 542;
const MAX_WIRE_BYTES = 31 * 1024;

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
    window.__dustMultiplayerTest?.getReplicationBacklogDiagnostics &&
    window.__dustMultiplayerTest?.getPlayerReplicaDiagnostics
  ));
}

function installNearbyReceiveMock() {
  const listeners = Object.create(null);
  const encode = (message) => {
    const bytes = new TextEncoder().encode(JSON.stringify(message));
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return window.btoa(binary);
  };
  const currentOperationId = () => (
    window.__dustMultiplayerTest?.getNearbyEndpointDiagnostics?.().operationId
  );
  const currentConnectionNonce = (endpointId) => (
    window.__dustMultiplayerTest?.getNearbyEndpointDiagnostics?.().connectionNonces?.[endpointId]
  );
  const capture = {
    addListener(eventName, callback) {
      (listeners[eventName] || (listeners[eventName] = [])).push(callback);
      return Promise.resolve({ remove() {} });
    },
    requestNearbyPermissions() { return Promise.resolve({ granted: true }); },
    sendBytes() { return Promise.resolve({}); },
    stopAll() { return Promise.resolve({}); },
    emitLatest(message, latestKind, coalescedCount = 0) {
      (listeners.message || []).slice().forEach((callback) => callback({
        endpointId: "mock-host-endpoint",
        data: encode(message),
        latestKind,
        coalescedCount,
        operationId: currentOperationId(),
        connectionNonce: currentConnectionNonce("mock-host-endpoint"),
      }));
    },
    emitReliable(message) {
      (listeners.message || []).slice().forEach((callback) => callback({
        endpointId: "mock-host-endpoint",
        data: encode(message),
        operationId: currentOperationId(),
        connectionNonce: currentConnectionNonce("mock-host-endpoint"),
      }));
    },
  };
  window.__nearbyReceiveCapture = capture;
  window.Capacitor = { Plugins: { NearbyConnections: capture } };
}

test("the WebView bridge applies only the newest cumulative realtime message per frame", async ({ page }) => {
  await page.addInitScript(installNearbyReceiveMock);
  await openGame(page);

  const metrics = await page.evaluate(async () => {
    const multiplayer = window.__dustMultiplayerTest;
    const capture = window.__nearbyReceiveCapture;
    multiplayer.startMockGuest(["Host", "Guest"], 1);
    const template = multiplayer.buildSnapshot(false, false, "mock-player-2");
    const hostEntry = template.players.find((entry) => entry.id === "mock-player-1");
    for (let index = 1; index <= 12; index += 1) {
      const snapshot = JSON.parse(JSON.stringify(template));
      snapshot.sequence = 20_000 + index;
      snapshot.time = 100 + index * 0.1;
      snapshot.players.find((entry) => entry.id === "mock-player-1").x = hostEntry.x + index * 0.25;
      capture.emitLatest(snapshot, "snapshot", index === 1 ? 2 : 0);
    }
    const queued = multiplayer.getIncomingRealtimeDiagnostics();
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const afterFrame = multiplayer.getIncomingRealtimeDiagnostics();
    const afterFrameHost = multiplayer.getState().players.find((player) => player.id === "mock-player-1");

    const successor = JSON.parse(JSON.stringify(template));
    successor.sequence = 20_013;
    successor.time = 101.3;
    successor.players.find((entry) => entry.id === "mock-player-1").x = hostEntry.x + 3.25;
    capture.emitLatest(successor, "snapshot");
    const beforeReliable = multiplayer.getIncomingRealtimeDiagnostics();
    capture.emitReliable({
      type: "decision",
      version: 47,
      action: "noop",
      playerId: "mock-player-1",
    });
    const afterReliable = multiplayer.getIncomingRealtimeDiagnostics();
    return { queued, afterFrame, afterFrameHost, beforeReliable, afterReliable };
  });

  const report = JSON.stringify(metrics, null, 2);
  console.log(`WebView last-mile coalescing metrics\n${report}`);
  expect(metrics.queued, report).toMatchObject({
    lastSnapshotSequence: -1,
    pendingLatestMessages: 1,
    bridgeCoalescedSnapshots: 11,
    nativeCoalescedSnapshots: 2,
  });
  expect(metrics.afterFrame, report).toMatchObject({
    lastSnapshotSequence: 20_012,
    pendingLatestMessages: 0,
    bridgeCoalescedSnapshots: 11,
  });
  expect(metrics.afterFrameHost.networkTargetX, report).toBeCloseTo(
    metrics.afterFrameHost.x,
    1
  );
  expect(metrics.beforeReliable, report).toMatchObject({
    lastSnapshotSequence: 20_012,
    pendingLatestMessages: 1,
  });
  expect(metrics.afterReliable, report).toMatchObject({
    lastSnapshotSequence: 20_013,
    pendingLatestMessages: 0,
  });
});

test("a four-player wave-10 sized session does not accumulate snapshot, ACK, or enemy-delta debt", async ({ page }) => {
  test.setTimeout(90_000);
  await openGame(page);

  const metrics = await page.evaluate((config) => {
    const multiplayer = window.__dustMultiplayerTest;
    const encoder = new TextEncoder();
    const pctl = (values, ratio) => {
      const sorted = values.slice().sort((a, b) => a - b);
      return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))] || 0;
    };
    multiplayer.startMockHost(["Host", "Guest A", "Guest B", "Guest C"]);
    const origin = multiplayer.getState().players[1];
    multiplayer.setPlayerPosition("mock-player-1", origin.x, origin.z);
    multiplayer.setPlayerPosition("mock-player-2", origin.x, origin.z);
    multiplayer.setPlayerPosition("mock-player-3", origin.x + 3, origin.z);
    multiplayer.setPlayerPosition("mock-player-4", origin.x - 3, origin.z);
    multiplayer.spawnEnemyStressField(config.enemyCount, "visible");
    for (let index = 1; index <= 4; index += 1) {
      multiplayer.setProgression(`mock-player-${index}`, {
        level: 23,
        hpRegen: 10000,
        fireRateBonus: 0.5,
        moveSpeedBonus: 0.5,
        standardUpgradesChosen: 18,
        upgradeCounts: {
          swiftBoots: 5,
          steadyHand: 5,
          quickReload: 5,
          hairTrigger: 5,
          grit: 5,
          longReach: 5,
          scavengerLuck: 5,
          desertMender: 5,
          luckyMagnet: 5,
          xpHunger: 5,
        },
      });
    }

    const cloneWire = () => JSON.parse(JSON.stringify(
      multiplayer.buildWireSnapshot(false, false, "mock-player-2")
    ));
    const acknowledge = (wire) => multiplayer.acknowledgeClientState(
      "mock-player-2",
      wire.sequence,
      0,
      false
    );

    let wire = cloneWire();
    let bootstrapFrames = 0;
    while (wire.enemyDelta?.k === 1 && bootstrapFrames < 64) {
      bootstrapFrames += 1;
      acknowledge(wire);
      if (wire.enemyDelta.f === 1) break;
      wire = cloneWire();
    }

    const samples = [];
    let skippedSnapshots = 0;
    for (let frame = 0; frame < config.frames; frame += 1) {
      // Advance the authoritative clock without rendering/updating hundreds of
      // zombie meshes. This test measures replication debt rather than frame
      // rendering, and keeping those concerns separate makes the long run
      // deterministic on slower CI workers.
      window.__dustAndDeadTest.advanceWaveProgress(config.intervalMs);
      for (let playerIndex = 1; playerIndex <= 4; playerIndex += 1) {
        multiplayer.setHealth(`mock-player-${playerIndex}`, 100);
      }
      const startedAt = performance.now();
      wire = cloneWire();
      const buildMs = performance.now() - startedAt;
      const bytes = encoder.encode(JSON.stringify(wire)).length;
      // Model latest-only delivery under intermittent pressure: one frame in
      // every three is built by the host but replaced before the guest ACKs it.
      const delivered = frame % 3 !== 1;
      if (delivered) acknowledge(wire);
      else skippedSnapshots += 1;
      if (frame < 120 || frame >= config.frames - 120 || frame % 100 === 0) {
        samples.push({ frame, bytes, buildMs, delivered });
      }
    }
    // Finish on an acknowledged standalone successor so every skipped delta
    // has a chance to drain through the real cumulative ACK contract.
    window.__dustAndDeadTest.advanceWaveProgress(config.intervalMs);
    wire = cloneWire();
    acknowledge(wire);

    const backlog = multiplayer.getReplicationBacklogDiagnostics("mock-player-2");
    const budget = multiplayer.getNetworkBudgetDiagnostics();
    const early = samples.filter((sample) => sample.frame < 120);
    const late = samples.filter((sample) => sample.frame >= config.frames - 120);
    return {
      protocol: budget.protocol,
      bootstrapFrames,
      skippedSnapshots,
      finalSequence: wire.sequence,
      finalBytes: encoder.encode(JSON.stringify(wire)).length,
      backlog,
      health: {
        oversize: budget.stats.wireOversizeSnapshots,
        enemyOpHighWater: budget.stats.enemyOpHighWater,
        maxEnemyChunks: budget.stats.maxEnemyChunkCount,
      },
      early: {
        p95Bytes: pctl(early.map((sample) => sample.bytes), 0.95),
        p95BuildMs: pctl(early.map((sample) => sample.buildMs), 0.95),
      },
      late: {
        p95Bytes: pctl(late.map((sample) => sample.bytes), 0.95),
        p95BuildMs: pctl(late.map((sample) => sample.buildMs), 0.95),
      },
      maxBytes: Math.max(...samples.map((sample) => sample.bytes), 0),
    };
  }, {
    frames: LONG_RUN_FRAMES,
    intervalMs: SNAPSHOT_INTERVAL_MS,
    enemyCount: REALISTIC_WAVE_10_ENEMIES,
  });

  const report = JSON.stringify(metrics, null, 2);
  console.log(`long-match replication metrics\n${report}`);
  expect(metrics.protocol, report).toBe(47);
  expect(metrics.bootstrapFrames, report).toBeGreaterThan(0);
  expect(metrics.skippedSnapshots, report).toBe(80);
  expect(metrics.finalSequence, report).toBeGreaterThan(LONG_RUN_FRAMES);
  expect(metrics.maxBytes, report).toBeLessThanOrEqual(MAX_WIRE_BYTES);
  expect(metrics.finalBytes, report).toBeLessThanOrEqual(MAX_WIRE_BYTES);
  expect(metrics.health.oversize, report).toBe(0);
  expect(metrics.backlog, report).toMatchObject({
    pendingCombatEvents: 0,
    enemyOps: 0,
    sentEnemyFrames: 0,
    keyframeActive: false,
    pendingHazardFrames: 0,
  });
  expect(metrics.backlog.observedEnemies, report).toBeGreaterThanOrEqual(REALISTIC_WAVE_10_ENEMIES * 0.9);
  expect(metrics.late.p95Bytes, report).toBeLessThanOrEqual(metrics.early.p95Bytes * 1.15 + 256);
  expect(metrics.late.p95BuildMs, report).toBeLessThanOrEqual(metrics.early.p95BuildMs * 2 + 2);
});

test("waves 15 through 17 keep hundreds of guest zombie replicas smooth without lowering a healthy 15 Hz link", async ({ page, context }) => {
  test.setTimeout(180_000);
  await openGame(page);

  const hostRun = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const multiplayer = window.__dustMultiplayerTest;
    const encoder = new TextEncoder();
    const started = multiplayer.startMockHost(["Late Host", "Late Guest", "Third", "Fourth"]);
    const origin = started.players[1];
    for (let playerIndex = 1; playerIndex <= 4; playerIndex += 1) {
      multiplayer.setPlayerPosition(
        `mock-player-${playerIndex}`,
        origin.x + (playerIndex - 2) * 0.35,
        origin.z
      );
      multiplayer.setProgression(`mock-player-${playerIndex}`, { hpRegen: 10_000 });
    }
    multiplayer.setNetworkRtt("mock-player-2", 1_000);

    const cloneWire = () => JSON.parse(JSON.stringify(
      multiplayer.buildWireSnapshot(false, false, "mock-player-2")
    ));
    const combatAck = (wire) => (wire.combatEvents || []).reduce(
      (highest, event) => Math.max(highest, Number(event && event.sequence) || 0),
      0
    );
    const acknowledge = (wire) => multiplayer.acknowledgeClientState(
      "mock-player-2",
      wire.sequence,
      combatAck(wire),
      false
    );
    const describeBacklog = () => multiplayer.getReplicationBacklogDiagnostics("mock-player-2");
    const phases = [];
    const healthyCadence = [];

    for (const setup of [
      { wave: 15, boss: "ghostTrain" },
      { wave: 16 },
      { wave: 17 },
    ]) {
      const wave = game.forceWaveState(setup.wave, 0, 0, setup.boss);
      const stress = multiplayer.spawnEnemyStressField(wave.waveSpawnTarget, "visible");
      healthyCadence.push(multiplayer.advanceAdaptiveSnapshotWindow(
        0,
        wave.waveSpawnTarget,
        31 * 1024
      ));
      const frames = [];
      let settled = false;
      let maxWireBytes = 0;

      // Drain both the initial keyframe and the remove/add delta created by a
      // real late-wave transition. Every packet is applied by the guest below.
      for (let guard = 0; guard < 80; guard += 1) {
        const wire = cloneWire();
        maxWireBytes = Math.max(maxWireBytes, encoder.encode(JSON.stringify(wire)).length);
        frames.push({ kind: "sync", wire });
        acknowledge(wire);
        const backlog = describeBacklog();
        if (!backlog.keyframeActive && backlog.enemyOps === 0 && backlog.sentEnemyFrames === 0) {
          settled = true;
          break;
        }
      }

      let droppedMotionPackets = 0;
      for (let sampleIndex = 0; sampleIndex < 12; sampleIndex += 1) {
        window.advanceTime(100);
        for (let playerIndex = 1; playerIndex <= 4; playerIndex += 1) {
          multiplayer.setHealth(`mock-player-${playerIndex}`, 100);
        }
        const wire = cloneWire();
        maxWireBytes = Math.max(maxWireBytes, encoder.encode(JSON.stringify(wire)).length);
        // Latest-only transport replaces an occasional packet. The successor
        // remains cumulative, producing a real 200 ms interpolation gap.
        if (sampleIndex % 4 === 1) {
          droppedMotionPackets += 1;
          continue;
        }
        frames.push({ kind: "motion", wire });
        acknowledge(wire);
      }
      window.advanceTime(100);
      const successor = cloneWire();
      maxWireBytes = Math.max(maxWireBytes, encoder.encode(JSON.stringify(successor)).length);
      frames.push({ kind: "motion", wire: successor });
      acknowledge(successor);

      phases.push({
        wave: setup.wave,
        target: wave.waveSpawnTarget,
        stress,
        frames,
        settled,
        droppedMotionPackets,
        maxWireBytes,
        backlog: describeBacklog(),
      });
    }

    // Large packets and enemy counts alone must not reduce visual update rate.
    // Only sustained evidence that native latest-only sends are being replaced
    // may do so, and one clean second must restore the normal rate.
    const isolatedReplacement = multiplayer.advanceAdaptiveSnapshotWindow(1, 2_200, 31 * 1024);
    // The native counter is summed across three remote endpoints. Feed three
    // replacements per guest to exercise the normalized moderate threshold.
    const moderateFirst = multiplayer.advanceAdaptiveSnapshotWindow(9, 2_200, 31 * 1024);
    const moderateSecond = multiplayer.advanceAdaptiveSnapshotWindow(9, 2_200, 31 * 1024);
    const moderateRecovered = multiplayer.advanceAdaptiveSnapshotWindow(0, 2_200, 31 * 1024);
    const severe = multiplayer.advanceAdaptiveSnapshotWindow(24, 2_200, 31 * 1024);
    const severeRecovered = multiplayer.advanceAdaptiveSnapshotWindow(0, 2_200, 31 * 1024);

    return {
      phases,
      cadence: {
        healthyCadence,
        isolatedReplacement,
        moderateFirst,
        moderateSecond,
        moderateRecovered,
        severe,
        severeRecovered,
      },
      budget: multiplayer.getNetworkBudgetDiagnostics(),
    };
  });

  // The real peers render on separate phones. Replaying the captured wire data
  // after closing the synthetic host avoids charging two full 1330-zombie
  // renderers to the same CI process and keeps this a network-smoothing test.
  await page.close();
  const guestPage = await context.newPage();
  await openGame(guestPage);

  const guestMetrics = await guestPage.evaluate((run) => {
    const multiplayer = window.__dustMultiplayerTest;
    multiplayer.startMockGuest(["Late Host", "Late Guest", "Third", "Fourth"], 1);
    const distance = (first, second) => Math.hypot(first.x - second.x, first.z - second.z);
    const percentile = (values, ratio) => {
      if (!values.length) return 0;
      const sorted = values.slice().sort((first, second) => first - second);
      return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))];
    };
    const phaseMetrics = [];
    let backwardsRenderClocks = 0;
    let renderTicksWithHundreds = 0;
    const immediateCorrections = [];
    const renderedSteps = [];
    const lastRendered = new Map();

    const recordRenderedFrame = (range, target) => {
      const diagnostics = multiplayer.getGuestEnemyDiagnostics().filter((enemy) => (
        enemy.id >= range.firstNetworkId && enemy.id <= range.lastNetworkId
      ));
      if (diagnostics.length >= Math.min(400, Math.floor(target * 0.8))) {
        renderTicksWithHundreds += 1;
      }
      diagnostics.forEach((enemy) => {
        const previous = lastRendered.get(enemy.id);
        if (previous) {
          if (enemy.renderSampleTime + 0.0001 < previous.renderSampleTime) {
            backwardsRenderClocks += 1;
          }
          renderedSteps.push(distance(previous, enemy));
        }
        lastRendered.set(enemy.id, enemy);
      });
      return diagnostics;
    };

    for (const phase of run.phases) {
      let relevant = [];
      let motionFrames = 0;
      for (const record of phase.frames) {
        const before = new Map(multiplayer.getGuestEnemyDiagnostics().map((enemy) => [enemy.id, enemy]));
        multiplayer.applySnapshot(record.wire);
        const applied = multiplayer.getGuestEnemyDiagnostics();
        applied.forEach((enemy) => {
          const previous = before.get(enemy.id);
          if (previous) immediateCorrections.push(distance(previous, enemy));
        });
        window.advanceTime(1000 / 60);
        relevant = recordRenderedFrame(phase.stress, phase.target);
        if (record.kind === "motion") {
          motionFrames += 1;
          // Exercise updateMultiplayerGuestWorldInterpolation repeatedly, not
          // just snapshot application, with the entire late-wave replica set.
          window.advanceTime(1000 / 60);
          relevant = recordRenderedFrame(phase.stress, phase.target);
        }
      }
      for (let tailFrame = 0; tailFrame < 2; tailFrame += 1) {
        window.advanceTime(1000 / 60);
        relevant = recordRenderedFrame(phase.stress, phase.target);
      }
      phaseMetrics.push({
        wave: phase.wave,
        target: phase.target,
        replicas: relevant.length,
        motionFrames,
      });
    }

    return {
      phaseMetrics,
      backwardsRenderClocks,
      renderTicksWithHundreds,
      p95ImmediateCorrection: percentile(immediateCorrections, 0.95),
      maxImmediateCorrection: immediateCorrections.reduce((largest, value) => Math.max(largest, value), 0),
      p95RenderedStep: percentile(renderedSteps, 0.95),
      maxRenderedStep: renderedSteps.reduce((largest, value) => Math.max(largest, value), 0),
    };
  }, hostRun);

  const report = JSON.stringify({ host: hostRun, guest: guestMetrics }, (key, value) => (
    key === "frames" ? `[${value.length} wire frames]` : value
  ), 2);
  console.log(`late-wave guest replication metrics\n${report}`);
  expect(hostRun.phases.map((phase) => phase.target), report).toEqual([760, 1262, 1330]);
  expect(hostRun.phases.every((phase) => phase.settled), report).toBe(true);
  expect(hostRun.phases.every((phase) => phase.droppedMotionPackets === 3), report).toBe(true);
  expect(hostRun.phases.every((phase) => phase.maxWireBytes <= MAX_WIRE_BYTES), report).toBe(true);
  expect(hostRun.phases.every((phase) => (
    phase.backlog.enemyOps === 0 && phase.backlog.sentEnemyFrames === 0 && !phase.backlog.keyframeActive
  )), report).toBe(true);
  expect(hostRun.budget.stats.wireOversizeSnapshots, report).toBe(0);

  expect(hostRun.cadence.healthyCadence.every((entry) => entry.snapshotHz === 15), report).toBe(true);
  expect(hostRun.cadence.isolatedReplacement.snapshotHz, report).toBe(15);
  expect(hostRun.cadence.moderateFirst.snapshotHz, report).toBe(15);
  expect(hostRun.cadence.moderateSecond.snapshotHz, report).toBe(12);
  expect(hostRun.cadence.moderateRecovered.snapshotHz, report).toBe(15);
  expect(hostRun.cadence.severe.snapshotHz, report).toBe(10);
  expect(hostRun.cadence.severeRecovered.snapshotHz, report).toBe(15);

  expect(guestMetrics.phaseMetrics.map((phase) => phase.replicas), report).toEqual([760, 1262, 1330]);
  expect(guestMetrics.phaseMetrics.every((phase) => phase.motionFrames === 10), report).toBe(true);
  expect(guestMetrics.renderTicksWithHundreds, report).toBeGreaterThan(60);
  expect(guestMetrics.backwardsRenderClocks, report).toBe(0);
  expect(guestMetrics.p95ImmediateCorrection, report).toBeLessThan(0.01);
  expect(guestMetrics.maxImmediateCorrection, report).toBeLessThan(0.1);
  expect(guestMetrics.p95RenderedStep, report).toBeLessThan(0.35);
  // The test deliberately renders only two 16.7 ms ticks per delivered 100 ms
  // sample to keep CI bounded. Keep a separate generous outlier guard while
  // the p95 assertion above enforces ordinary frame-to-frame smoothness.
  expect(guestMetrics.maxRenderedStep, report).toBeLessThan(1.1);
});

test("remote players remain smooth at 10 Hz with coalesced gaps even after a long match clock", async ({ page }) => {
  await openGame(page);

  const metrics = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const multiplayer = window.__dustMultiplayerTest;
    const pctl = (values, ratio) => {
      const sorted = values.slice().sort((a, b) => a - b);
      return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))] || 0;
    };
    game.setAutomaticFrameLoopModeForTest("paused");
    try {
      multiplayer.startMockGuest(["Host", "Guest"], 1);
      const template = multiplayer.buildSnapshot(false, false, "mock-player-2");
      let sequence = 50_000;
      let sampleTime = 3_600;
      let authoritativeX = template.players[0].x;
      const speed = 8;
      const applyHostSample = (gapSeconds) => {
        sampleTime += gapSeconds;
        authoritativeX += speed * gapSeconds;
        sequence += gapSeconds > 0.11 ? 2 : 1;
        const snapshot = JSON.parse(JSON.stringify(template));
        snapshot.sequence = sequence;
        snapshot.time = Number(sampleTime.toFixed(3));
        snapshot.players[0].x = Number(authoritativeX.toFixed(3));
        snapshot.players[0].moveAmount = 1;
        multiplayer.applySnapshot(snapshot);
      };

      applyHostSample(0.1);
      const positions = [];
      let arrivals = 0;
      for (let frame = 0; frame < 150; frame += 1) {
        if (frame > 0 && frame % 6 === 0) {
          arrivals += 1;
          // Every fifth delivery replaces one intermediate 10 Hz snapshot.
          applyHostSample(arrivals % 5 === 0 ? 0.2 : 0.1);
        }
        game.advanceRealFrame(1000 / 60, { render: false });
        positions.push(multiplayer.getPlayerReplicaDiagnostics("mock-player-1").x);
      }
      const steps = positions.slice(1).map((value, index) => value - positions[index]);
      const steadySteps = steps.slice(12);
      const positiveSteps = steadySteps.filter((step) => step > 0.001);
      const diagnostics = multiplayer.getPlayerReplicaDiagnostics("mock-player-1");
      return {
        arrivals,
        finalError: authoritativeX - positions[positions.length - 1],
        backwardsFrames: steadySteps.filter((step) => step < -0.001).length,
        stalledFrames: steadySteps.filter((step) => Math.abs(step) <= 0.001).length,
        maximumStep: Math.max(...steadySteps),
        p95Step: pctl(positiveSteps, 0.95),
        medianStep: pctl(positiveSteps, 0.5),
        diagnostics,
      };
    } finally {
      game.setAutomaticFrameLoopModeForTest("full");
    }
  });

  const report = JSON.stringify(metrics, null, 2);
  console.log(`long-clock remote-player interpolation metrics\n${report}`);
  expect(metrics.arrivals, report).toBeGreaterThan(20);
  expect(metrics.backwardsFrames, report).toBe(0);
  expect(metrics.stalledFrames, report).toBeLessThanOrEqual(2);
  expect(metrics.maximumStep, report).toBeLessThan(0.5);
  expect(metrics.p95Step, report).toBeLessThan(metrics.medianStep * 2.4 + 0.03);
  // A replica may be at most the configured 180 ms extrapolation tail ahead
  // of the newest authoritative point; at 8 m/s that is 1.44 m.
  expect(metrics.finalError, report).toBeGreaterThanOrEqual(-1.6);
  expect(metrics.finalError, report).toBeLessThan(2.5);
  expect(metrics.diagnostics.sampleTime, report).toBeGreaterThan(3602);
  expect(Math.hypot(metrics.diagnostics.velocityX, metrics.diagnostics.velocityZ), report).toBeLessThanOrEqual(12);
});

test("a delayed host pose does not pull the locally predicted guest backwards", async ({ page }) => {
  await openGame(page);

  const metrics = await page.evaluate(() => {
    const multiplayer = window.__dustMultiplayerTest;
    multiplayer.startMockGuest(["Host", "Guest"], 1);
    // Reproduce a realistic startup/main-thread stall. The receive-side
    // interpolation clock may advance across this pause, but local prediction
    // history must still be sampled at the host's original simulation time.
    const stallUntil = performance.now() + 140;
    while (performance.now() < stallUntil) {}
    const baseline = multiplayer.buildSnapshot(false, false, "mock-player-2");
    baseline.sequence = 1;
    multiplayer.applySnapshot(baseline);

    const localId = multiplayer.getState().localPlayerId;
    const origin = multiplayer.getState().players.find((player) => player.id === localId);
    const historical = [];
    for (let index = 1; index <= 5; index += 1) {
      window.advanceTime(100);
      multiplayer.setPlayerPosition(localId, origin.x + index, origin.z);
      const sample = multiplayer.buildSnapshot(false, false, localId);
      const playerSample = sample.players.find((player) => player.id === localId);
      historical.push({ time: sample.time, x: playerSample.x, z: playerSample.z });
    }

    const before = multiplayer.getState().players.find((player) => player.id === localId);
    const delayed = multiplayer.buildSnapshot(false, false, localId);
    delayed.sequence = 10_000;
    delayed.time = historical[0].time;
    const delayedLocal = delayed.players.find((player) => player.id === localId);
    delayedLocal.x = historical[0].x;
    delayedLocal.z = historical[0].z;
    multiplayer.applySnapshot(delayed);

    const positions = [multiplayer.getState().players.find((player) => player.id === localId).x];
    for (let frame = 0; frame < 60; frame += 1) {
      positions.push(multiplayer.stepLocalGuestReconciliation(0, 0, 1 / 60).players.find((player) => player.id === localId).x);
    }
    const after = multiplayer.getState().players.find((player) => player.id === localId);
    const steps = positions.slice(1).map((value, index) => value - positions[index]);
    return {
      staleGap: before.x - historical[0].x,
      backwardsFrames: steps.filter((step) => step < -0.001).length,
      minimumStep: Math.min(...steps),
      rollback: before.x - after.x,
      correction: Math.hypot(after.localCorrectionX, after.localCorrectionZ),
      historySamples: after.localPredictionSamples,
    };
  });

  const report = JSON.stringify(metrics, null, 2);
  expect(metrics.staleGap, report).toBeGreaterThanOrEqual(3.9);
  expect(metrics.backwardsFrames, report).toBe(0);
  expect(metrics.minimumStep, report).toBeGreaterThanOrEqual(-0.001);
  expect(Math.abs(metrics.rollback), report).toBeLessThanOrEqual(0.02);
  expect(metrics.correction, report).toBeLessThan(0.001);
  expect(metrics.historySamples, report).toBeGreaterThan(5);
});

test("adaptive snapshot pressure is normalized per connected guest", async ({ page }) => {
  await openGame(page);
  const cadence = await page.evaluate(() => {
    const multiplayer = window.__dustMultiplayerTest;
    multiplayer.startMockHost(["Host", "Guest", "Third", "Fourth"]);
    const occasionalFirst = multiplayer.advanceAdaptiveSnapshotWindow(6, 1_500, 24 * 1024);
    const occasionalSecond = multiplayer.advanceAdaptiveSnapshotWindow(6, 1_500, 24 * 1024);
    const congestedFirst = multiplayer.advanceAdaptiveSnapshotWindow(9, 1_500, 24 * 1024);
    const congestedSecond = multiplayer.advanceAdaptiveSnapshotWindow(9, 1_500, 24 * 1024);
    const recovered = multiplayer.advanceAdaptiveSnapshotWindow(0, 1_500, 24 * 1024);
    return { occasionalFirst, occasionalSecond, congestedFirst, congestedSecond, recovered };
  });

  expect(cadence.occasionalFirst.snapshotHz).toBe(15);
  expect(cadence.occasionalSecond.snapshotHz).toBe(15);
  expect(cadence.congestedFirst.snapshotHz).toBe(15);
  expect(cadence.congestedSecond.snapshotHz).toBe(12);
  expect(cadence.recovered.snapshotHz).toBe(15);
});
