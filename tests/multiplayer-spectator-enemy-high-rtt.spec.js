const path = require("node:path");
const { expect, test } = require("@playwright/test");
const { decodeEnemyOpKinds } = require("./helpers/enemy-wire-decoder");

const SIMULATED_RTT_MS = 1000;
const SNAPSHOTS_PER_RTT = 10;
const ENEMY_COUNT = 560;
const POST_HANDOFF_FRAMES = 6;

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
    window.__dustMultiplayerTest?.getSpectatorDiagnostics &&
    window.__dustMultiplayerTest?.acknowledgeClientState
  ));
}

test("spectator handoff keeps the new horde fresh and moving through a multi-chunk 1000 ms RTT transition", async ({ page, context }) => {
  test.setTimeout(180_000);
  await openGame(page);
  const guestPage = await context.newPage();
  await openGame(guestPage);

  const hostRun = await page.evaluate(({
    enemyCount,
    simulatedRttMs,
    snapshotsPerRtt,
    postHandoffFrames,
  }) => {
    const multiplayer = window.__dustMultiplayerTest;
    multiplayer.startMockHost(["East Host", "Observer", "West", "Spare"]);
    multiplayer.setPlayerPosition("mock-player-1", 165, 108);
    multiplayer.setPlayerPosition("mock-player-3", -165, -108);
    multiplayer.setPlayerPosition("mock-player-4", 0, 118);

    const stress = multiplayer.spawnEnemyStressField(enemyCount, "visible");

    // The dense East horde moves toward the host while remaining inside the
    // East spectator interest rectangle.
    multiplayer.setNetworkRtt("mock-player-2", simulatedRttMs);
    multiplayer.damagePlayer("mock-player-2", 999, "mock-player-1");
    multiplayer.surrender("mock-player-2");

    const cloneWire = () => JSON.parse(JSON.stringify(
      multiplayer.buildWireSnapshot(false, false, "mock-player-2")
    ));
    const combatAck = (wire) => (wire.combatEvents || []).reduce(
      (highest, event) => Math.max(highest, Number(event?.sequence) || 0),
      0
    );
    const acknowledge = (wire) => multiplayer.acknowledgeClientState(
      "mock-player-2",
      wire.sequence,
      combatAck(wire),
      false
    );
    const advanceNetworkInterval = () => {
      const intervalMs = simulatedRttMs / snapshotsPerRtt;
      // One world tick per network sample is enough to give every zombie a
      // continuously changing position. Advance the remaining server clock
      // without multiplying the cost of this stress regression.
      multiplayer.setHealth("mock-player-1", 100);
      multiplayer.setHealth("mock-player-4", 100);
      window.advanceTime(1000 / 60);
      multiplayer.stepBullets(Math.max(0, intervalMs / 1000 - 1 / 60));
      multiplayer.setHealth("mock-player-1", 100);
      multiplayer.setHealth("mock-player-4", 100);
    };

    // The surrendered observer initially watches West. Finish that small view
    // first so the guest has a confirmed old camera and a cached old zombie.
    const westFrames = [];
    for (let guard = 0; guard < 32; guard += 1) {
      const wire = cloneWire();
      westFrames.push(wire);
      acknowledge(wire);
      if (wire.enemyDelta?.f === 1) break;
    }

    // ResolveMover can relocate a requested player coordinate around town
    // geometry. Spawn the control zombie from the actual authoritative West
    // coordinate carried by the completed snapshot, then deliver its upsert.
    const confirmedWestWire = westFrames.at(-1);
    const confirmedWestPlayers = confirmedWestWire.players ||
      multiplayer.decodePlayerWireEntries(confirmedWestWire.ps) || [];
    const confirmedWestEntry = confirmedWestPlayers
      .find((player) => player.id === "mock-player-3");
    const westEnemy = multiplayer.spawnEnemyAt(
      confirmedWestEntry.x + 3,
      confirmedWestEntry.z + 2,
      "walker",
      20
    );
    const previousWest = westFrames.at(-1);
    multiplayer.acknowledgeClientState(
      "mock-player-2",
      previousWest.sequence,
      combatAck(previousWest),
      true
    );
    for (let guard = 0; guard < 32; guard += 1) {
      const wire = cloneWire();
      westFrames.push(wire);
      acknowledge(wire);
      if (wire.enemyDelta?.f === 1) break;
    }

    multiplayer.injectInput("mock-player-2", {
      sequence: 1,
      spectatorTargetId: "mock-player-1",
    });
    const transitionFirst = cloneWire();
    const chunkCount = Number(transitionFirst.enemyDelta?.m) || 0;
    const transitionEpoch = Number(transitionFirst.enemyDelta?.e) || 0;
    const transitionStartTime = Number(transitionFirst.enemyDelta?.t) || Number(transitionFirst.time);
    const transitionFrames = [];
    let firstForChunk = transitionFirst;

    for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex += 1) {
      let latest = firstForChunk;
      for (let retry = 0; retry < snapshotsPerRtt; retry += 1) {
        if (retry > 0) latest = cloneWire();
        transitionFrames.push(latest);
        advanceNetworkInterval();
      }
      // The ACK reaches the host one RTT after the first transmission of this
      // frozen chunk. Until then it keeps sending snapshots at the normal rate.
      acknowledge(latest);
      if (chunkIndex + 1 < chunkCount) firstForChunk = cloneWire();
    }

    const postFrames = [];
    for (let frameIndex = 0; frameIndex < postHandoffFrames; frameIndex += 1) {
      advanceNetworkInterval();
      const wire = cloneWire();
      postFrames.push(wire);
      acknowledge(wire);
    }

    return {
      westFrames,
      transitionFrames,
      postFrames,
      westEnemyId: westEnemy.id,
      stress,
      chunkCount,
      transitionEpoch,
      transitionStartTime,
      east: { x: 165, z: 108 },
      intervalMs: simulatedRttMs / snapshotsPerRtt,
    };
  }, {
    enemyCount: ENEMY_COUNT,
    simulatedRttMs: SIMULATED_RTT_MS,
    snapshotsPerRtt: SNAPSHOTS_PER_RTT,
    postHandoffFrames: POST_HANDOFF_FRAMES,
  });

  expect(hostRun.chunkCount).toBeGreaterThan(1);
  expect(hostRun.transitionFrames.length).toBe(hostRun.chunkCount * SNAPSHOTS_PER_RTT);
  expect(hostRun.transitionFrames.every((wire) => wire.enemyDelta?.k === 1)).toBe(true);
  expect(hostRun.transitionFrames.every((wire) => wire.enemyDelta?.e === hostRun.transitionEpoch)).toBe(true);
  expect(hostRun.postFrames.every((wire) => wire.enemyDelta?.k === 0)).toBe(true);
  expect(hostRun.westFrames.some((wire) => (
    wire.enemyDelta && decodeEnemyOpKinds(wire.enemyDelta).some((op) => (
      op.id === hostRun.westEnemyId && op.kind === 0
    ))
  ))).toBe(true);
  expect(hostRun.transitionFrames.some((wire) => (
    wire.enemyLiveDelta && decodeEnemyOpKinds(wire.enemyLiveDelta).some((op) => (
      op.id === hostRun.westEnemyId && op.kind === 2
    ))
  ))).toBe(true);

  const metrics = await guestPage.evaluate(async ({ run, simulatedRttMs }) => {
    const multiplayer = window.__dustMultiplayerTest;
    const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
    const distance = (first, second, xField, zField) => Math.hypot(
      Number(first?.[xField]) - Number(second?.[xField]),
      Number(first?.[zField]) - Number(second?.[zField])
    );
    const percentile = (values, ratio) => {
      if (!values.length) return 0;
      const sorted = values.slice().sort((a, b) => a - b);
      return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))];
    };
    const inStressRange = (enemy) => (
      enemy.id >= run.stress.firstNetworkId && enemy.id <= run.stress.lastNetworkId
    );

    multiplayer.startMockGuest(["East Host", "Observer", "West", "Spare"], 1);
    run.westFrames.forEach((wire) => multiplayer.applySnapshot(wire));
    const confirmedWest = multiplayer.getSpectatorDiagnostics();
    const initialWestEnemy = multiplayer.getGuestEnemyDiagnostics()
      .find((enemy) => enemy.id === run.westEnemyId);

    // Local desired order is West -> Spare -> East Host. The camera remains on
    // confirmed West until the East keyframe reaches its final chunk.
    multiplayer.cycleSpectator(1);
    multiplayer.cycleSpectator(1);
    const desiredEastBeforeTransfer = multiplayer.getSpectatorDiagnostics();

    let previous = new Map(multiplayer.getGuestEnemyDiagnostics().map((enemy) => [enemy.id, enemy]));
    let handoffFrame = -1;
    let handoffDiagnostics = [];
    let handoffSampleAges = [];
    let lastTargetChangeFrame = -1;
    let longestTargetSilenceSeconds = 0;
    let framesAfterHandoffWithoutTargetMovement = 0;
    let framesAfterHandoffWithTargetMovement = 0;
    let minimumTrackedAfterHandoff = Infinity;
    let preHandoffWestChecks = 0;
    let preHandoffWestMissingChecks = 0;
    let preHandoffWestDetachedChecks = 0;
    const targetCorrections = [];
    const immediateCorrections = [];
    const renderedSteps = [];
    const frameMetrics = [];

    for (let frameIndex = 0; frameIndex < run.transitionFrames.length; frameIndex += 1) {
      const wire = run.transitionFrames[frameIndex];
      let beforeApply = previous;
      const viewBeforeApply = multiplayer.getSpectatorDiagnostics();
      if (wire.enemyDelta?.f === 1 && Math.abs(viewBeforeApply.viewX - run.east.x) >= 1) {
        // The previous chunk has now spent a full RTT in flight. Process one
        // render tick after the grace deadline so a deferred old-scope removal
        // would be observable immediately before the camera handoff.
        await wait(simulatedRttMs + 50);
        window.advanceTime(1000 / 60);
        previous = new Map(multiplayer.getGuestEnemyDiagnostics().map((enemy) => [enemy.id, enemy]));
        beforeApply = previous;
      }
      if (Math.abs(viewBeforeApply.viewX - run.east.x) >= 1) {
        preHandoffWestChecks += 1;
        const westBeforeApply = beforeApply.get(run.westEnemyId);
        if (!westBeforeApply) preHandoffWestMissingChecks += 1;
        else if (!westBeforeApply.attached) preHandoffWestDetachedChecks += 1;
      }
      multiplayer.applySnapshot(wire);
      const afterApplyList = multiplayer.getGuestEnemyDiagnostics();
      const afterApply = new Map(afterApplyList.map((enemy) => [enemy.id, enemy]));
      const spectator = multiplayer.getSpectatorDiagnostics();
      const stressEnemies = afterApplyList.filter(inStressRange);
      let changedTargets = 0;

      stressEnemies.forEach((enemy) => {
        const before = beforeApply.get(enemy.id);
        if (!before) return;
        const targetCorrection = distance(before, enemy, "targetX", "targetZ");
        const immediateCorrection = distance(before, enemy, "x", "z");
        if (targetCorrection > 0.001) changedTargets += 1;
        if (handoffFrame >= 0) {
          targetCorrections.push(targetCorrection);
          immediateCorrections.push(immediateCorrection);
        }
      });

      if (handoffFrame < 0 && Math.abs(spectator.viewX - run.east.x) < 1) {
        handoffFrame = frameIndex;
        handoffDiagnostics = stressEnemies;
        handoffSampleAges = stressEnemies
          .filter((enemy) => enemy.sampleTime > 0)
          .map((enemy) => Math.max(0, Number(wire.time) - enemy.sampleTime));
        lastTargetChangeFrame = frameIndex;
      }
      if (handoffFrame >= 0) {
        minimumTrackedAfterHandoff = Math.min(minimumTrackedAfterHandoff, stressEnemies.length);
        if (changedTargets > 0) {
          framesAfterHandoffWithTargetMovement += 1;
          lastTargetChangeFrame = frameIndex;
        } else {
          framesAfterHandoffWithoutTargetMovement += 1;
        }
        longestTargetSilenceSeconds = Math.max(
          longestTargetSilenceSeconds,
          (frameIndex - lastTargetChangeFrame) * run.intervalMs / 1000
        );
      }

      // One rendered game tick is enough to expose an immediate snap.
      if (handoffFrame >= 0) window.advanceTime(1000 / 60);
      const afterRenderList = multiplayer.getGuestEnemyDiagnostics();
      const afterRender = new Map(afterRenderList.map((enemy) => [enemy.id, enemy]));
      if (handoffFrame >= 0) {
        stressEnemies.forEach((enemy) => {
          const rendered = afterRender.get(enemy.id);
          const before = beforeApply.get(enemy.id);
          if (before && rendered) renderedSteps.push(distance(before, rendered, "x", "z"));
        });
      }
      previous = afterRender;
      frameMetrics.push({
        phase: "transition",
        frameIndex,
        chunkIndex: wire.enemyDelta?.i,
        final: wire.enemyDelta?.f === 1,
        liveOps: wire.enemyLiveDelta?.c || 0,
        viewX: spectator.viewX,
        stressEnemies: stressEnemies.length,
        changedTargets,
      });
    }

    for (let frameIndex = 0; frameIndex < run.postFrames.length; frameIndex += 1) {
      const wire = run.postFrames[frameIndex];
      const globalFrameIndex = run.transitionFrames.length + frameIndex;
      const beforeApply = previous;
      multiplayer.applySnapshot(wire);
      const afterApplyList = multiplayer.getGuestEnemyDiagnostics();
      const stressEnemies = afterApplyList.filter(inStressRange);
      let changedTargets = 0;
      stressEnemies.forEach((enemy) => {
        const before = beforeApply.get(enemy.id);
        if (!before) return;
        const targetCorrection = distance(before, enemy, "targetX", "targetZ");
        const immediateCorrection = distance(before, enemy, "x", "z");
        if (targetCorrection > 0.001) changedTargets += 1;
        targetCorrections.push(targetCorrection);
        immediateCorrections.push(immediateCorrection);
      });
      minimumTrackedAfterHandoff = Math.min(minimumTrackedAfterHandoff, stressEnemies.length);
      if (changedTargets > 0) {
        framesAfterHandoffWithTargetMovement += 1;
        lastTargetChangeFrame = globalFrameIndex;
      } else {
        framesAfterHandoffWithoutTargetMovement += 1;
      }
      longestTargetSilenceSeconds = Math.max(
        longestTargetSilenceSeconds,
        (globalFrameIndex - lastTargetChangeFrame) * run.intervalMs / 1000
      );

      window.advanceTime(1000 / 60);
      const afterRender = new Map(multiplayer.getGuestEnemyDiagnostics().map((enemy) => [enemy.id, enemy]));
      stressEnemies.forEach((enemy) => {
        const before = beforeApply.get(enemy.id);
        const rendered = afterRender.get(enemy.id);
        if (before && rendered) renderedSteps.push(distance(before, rendered, "x", "z"));
      });
      previous = afterRender;
      frameMetrics.push({
        phase: "post",
        frameIndex,
        liveOps: wire.enemyLiveDelta?.c || 0,
        stressEnemies: stressEnemies.length,
        changedTargets,
      });
    }

    const completedEast = multiplayer.getSpectatorDiagnostics();
    const visibleAtHandoff = handoffDiagnostics.filter((enemy) => enemy.visible).length;
    return {
      simulatedRttMs,
      chunkCount: run.chunkCount,
      transitionFrameCount: run.transitionFrames.length,
      handoffFrame,
      framesRemainingInTransitionAfterHandoff: handoffFrame < 0
        ? -1
        : run.transitionFrames.length - handoffFrame - 1,
      confirmedWest,
      desiredEastBeforeTransfer,
      completedEast,
      initialWestEnemyCached: !!initialWestEnemy,
      initialWestEnemyAttached: !!initialWestEnemy?.attached,
      preHandoffWestChecks,
      preHandoffWestMissingChecks,
      preHandoffWestDetachedChecks,
      handoffEnemyCount: handoffDiagnostics.length,
      visibleAtHandoff,
      minimumTrackedAfterHandoff: Number.isFinite(minimumTrackedAfterHandoff)
        ? minimumTrackedAfterHandoff
        : 0,
      p95HandoffSampleAgeSeconds: Number(percentile(handoffSampleAges, 0.95).toFixed(3)),
      maxHandoffSampleAgeSeconds: Number(Math.max(0, ...handoffSampleAges).toFixed(3)),
      framesAfterHandoffWithTargetMovement,
      framesAfterHandoffWithoutTargetMovement,
      longestTargetSilenceSeconds: Number(longestTargetSilenceSeconds.toFixed(3)),
      p95TargetCorrection: Number(percentile(targetCorrections, 0.95).toFixed(3)),
      maxTargetCorrection: Number(Math.max(0, ...targetCorrections).toFixed(3)),
      p95ImmediateCorrection: Number(percentile(immediateCorrections, 0.95).toFixed(3)),
      maxImmediateCorrection: Number(Math.max(0, ...immediateCorrections).toFixed(3)),
      p95RenderedStep: Number(percentile(renderedSteps, 0.95).toFixed(3)),
      maxRenderedStep: Number(Math.max(0, ...renderedSteps).toFixed(3)),
      frameMetrics,
    };
  }, { run: hostRun, simulatedRttMs: SIMULATED_RTT_MS });

  const report = JSON.stringify(metrics, null, 2);
  expect(metrics.confirmedWest.targetId, report).toBe("mock-player-3");
  expect(metrics.initialWestEnemyCached, report).toBe(true);
  expect(metrics.initialWestEnemyAttached, report).toBe(true);
  expect(metrics.preHandoffWestChecks, report).toBeGreaterThanOrEqual(SNAPSHOTS_PER_RTT);
  expect(metrics.preHandoffWestMissingChecks, report).toBe(0);
  expect(metrics.preHandoffWestDetachedChecks, report).toBe(0);
  expect(metrics.desiredEastBeforeTransfer.targetId, report).toBe("mock-player-1");
  expect(metrics.desiredEastBeforeTransfer.viewX, report).toBeCloseTo(
    metrics.confirmedWest.viewX,
    1
  );
  expect(metrics.handoffFrame, report).toBeGreaterThanOrEqual(0);
  expect(metrics.completedEast.targetId, report).toBe("mock-player-1");
  expect(metrics.completedEast.viewX, report).toBeCloseTo(hostRun.east.x, 1);
  expect(metrics.handoffEnemyCount, report).toBeGreaterThan(500);
  expect(metrics.visibleAtHandoff, report).toBeGreaterThan(100);
  // A few enemies may legitimately leave the interest edge or die on the
  // authoritative host; a mass scope blink would drop far more than 5%.
  expect(metrics.minimumTrackedAfterHandoff, report).toBeGreaterThanOrEqual(
    Math.floor(metrics.handoffEnemyCount * 0.95)
  );

  // These limits turn the field symptoms into measurable regressions. At the
  // handoff the staged horde must have recent samples, it must not spend most
  // of an RTT frozen, and the first live delta must not visibly teleport it.
  expect(metrics.p95HandoffSampleAgeSeconds, report).toBeLessThanOrEqual(0.35);
  expect(metrics.longestTargetSilenceSeconds, report).toBeLessThanOrEqual(0.35);
  expect(metrics.framesAfterHandoffWithTargetMovement, report).toBeGreaterThanOrEqual(4);
  expect(metrics.p95TargetCorrection, report).toBeLessThanOrEqual(2.5);
  expect(metrics.p95ImmediateCorrection, report).toBeLessThan(1);
  expect(metrics.p95RenderedStep, report).toBeLessThanOrEqual(2.5);
});
