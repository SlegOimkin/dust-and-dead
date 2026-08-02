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
    window.__dustMultiplayerTest?.getGuestEnemyDiagnostics &&
    window.__dustAndDeadTest?.forceWaveState &&
    window.advanceTime
  ));
}

test("two-player wave 4 remains smooth through ordinary latest-only packet gaps", async ({ page, context }) => {
  test.setTimeout(150_000);
  await openGame(page);

  const hostRun = await page.evaluate(() => {
    const multiplayer = window.__dustMultiplayerTest;
    const game = window.__dustAndDeadTest;
    const encoder = new TextEncoder();
    const percentile = (values, ratio) => {
      const sorted = values.slice().sort((a, b) => a - b);
      return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))] || 0;
    };
    const started = multiplayer.startMockHost(["Host", "Guest"]);
    const center = started.players[1];
    multiplayer.setPlayerPosition("mock-player-1", center.x - 2, center.z);
    multiplayer.setPlayerPosition("mock-player-2", center.x + 2, center.z);
    const wave = game.forceWaveState(4, 0, 0);
    const stress = multiplayer.spawnEnemyStressField(wave.waveSpawnTarget, "visible");
    const cloneWire = () => JSON.parse(JSON.stringify(
      multiplayer.buildWireSnapshot(false, false, "mock-player-2")
    ));
    const acknowledge = (wire) => multiplayer.acknowledgeClientState(
      "mock-player-2",
      wire.sequence,
      (wire.combatEvents || []).reduce((highest, event) => Math.max(highest, Number(event.sequence) || 0), 0),
      false
    );
    const frames = [];
    let maximumBuildMs = 0;
    let maximumBytes = 0;
    let bootstrapFrames = 0;
    const buildSamples = [];

    for (let guard = 0; guard < 24; guard += 1) {
      const beganAt = performance.now();
      const wire = cloneWire();
      const buildMs = performance.now() - beganAt;
      maximumBuildMs = Math.max(maximumBuildMs, buildMs);
      buildSamples.push({
        phase: "bootstrap",
        frame: guard,
        buildMs,
        enemyOps: wire.enemyDelta?.c || 0,
        chunk: wire.enemyDelta?.i ?? -1,
        chunks: wire.enemyDelta?.m ?? 0,
      });
      maximumBytes = Math.max(maximumBytes, encoder.encode(JSON.stringify(wire)).length);
      frames.push({ delivered: true, wire });
      acknowledge(wire);
      bootstrapFrames += 1;
      const backlog = multiplayer.getReplicationBacklogDiagnostics("mock-player-2");
      if (!backlog.keyframeActive && backlog.enemyOps === 0 && backlog.sentEnemyFrames === 0) break;
    }

    let dropped = 0;
    for (let sample = 0; sample < 30; sample += 1) {
      window.advanceTime(1000 / 15);
      const beganAt = performance.now();
      const wire = cloneWire();
      const buildMs = performance.now() - beganAt;
      maximumBuildMs = Math.max(maximumBuildMs, buildMs);
      buildSamples.push({
        phase: "motion",
        frame: sample,
        buildMs,
        enemyOps: wire.enemyDelta?.c || 0,
        chunk: wire.enemyDelta?.i ?? -1,
        chunks: wire.enemyDelta?.m ?? 0,
      });
      maximumBytes = Math.max(maximumBytes, encoder.encode(JSON.stringify(wire)).length);
      const delivered = sample % 9 !== 4;
      if (delivered) acknowledge(wire);
      else dropped += 1;
      frames.push({ delivered, wire });
    }
    window.advanceTime(1000 / 15);
    const finalWire = cloneWire();
    acknowledge(finalWire);
    frames.push({ delivered: true, wire: finalWire });

    return {
      wave,
      stress,
      frames,
      dropped,
      bootstrapFrames,
      maximumBuildMs,
      maximumBytes,
      buildSamples,
      maximumBootstrapBuildMs: Math.max(...buildSamples.filter((sample) => sample.phase === "bootstrap").map((sample) => sample.buildMs), 0),
      p90MotionBuildMs: percentile(buildSamples.filter((sample) => sample.phase === "motion").map((sample) => sample.buildMs), 0.90),
      backlog: multiplayer.getReplicationBacklogDiagnostics("mock-player-2"),
      budget: multiplayer.getNetworkBudgetDiagnostics(),
    };
  });

  // Host and guest normally run on separate phones. Close the synthetic host
  // renderer before timing guest application so two Chromium tabs do not turn
  // OS scheduling pauses into fictitious network work.
  await page.close();
  const guestPage = await context.newPage();
  await openGame(guestPage);

  const guestRun = await guestPage.evaluate((run) => {
    const multiplayer = window.__dustMultiplayerTest;
    const percentile = (values, ratio) => {
      const sorted = values.slice().sort((a, b) => a - b);
      return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))] || 0;
    };
    multiplayer.startMockGuest(["Host", "Guest"], 1);
    const last = new Map();
    const movementById = new Map();
    const applyTimes = [];
    const immediateCorrections = [];
    let maximumStep = 0;
    let backwardsClocks = 0;
    let renderedFrames = 0;

    const recordFrame = () => {
      const enemies = multiplayer.getGuestEnemyDiagnostics();
      for (const enemy of enemies) {
        const previous = last.get(enemy.id);
        if (previous) {
          const step = Math.hypot(enemy.x - previous.x, enemy.z - previous.z);
          maximumStep = Math.max(maximumStep, step);
          movementById.set(enemy.id, (movementById.get(enemy.id) || 0) + step);
          if (enemy.renderSampleTime + 0.0001 < previous.renderSampleTime) backwardsClocks += 1;
        }
        last.set(enemy.id, enemy);
      }
      renderedFrames += 1;
    };

    for (const frame of run.frames) {
      if (frame.delivered) {
        const before = new Map(multiplayer.getGuestEnemyDiagnostics().map((enemy) => [enemy.id, enemy]));
        const beganAt = performance.now();
        multiplayer.applySnapshot(frame.wire);
        applyTimes.push({
          frame: applyTimes.length,
          applyMs: performance.now() - beganAt,
          enemyOps: frame.wire.enemyDelta?.c || 0,
          chunk: frame.wire.enemyDelta?.i ?? -1,
          chunks: frame.wire.enemyDelta?.m ?? 0,
        });
        for (const enemy of multiplayer.getGuestEnemyDiagnostics()) {
          const previous = before.get(enemy.id);
          if (previous) immediateCorrections.push(Math.hypot(enemy.x - previous.x, enemy.z - previous.z));
        }
      }
      for (let renderFrame = 0; renderFrame < 4; renderFrame += 1) {
        window.advanceTime(1000 / 60);
        recordFrame();
      }
    }
    const movingEnemies = Array.from(movementById.values()).filter((distance) => distance > 0.25);
    const keyframeApplyTimes = applyTimes.filter((sample) => sample.chunks > 0).map((sample) => sample.applyMs);
    const liveApplyTimes = applyTimes.filter((sample) => sample.chunks === 0).map((sample) => sample.applyMs);
    return {
      replicas: multiplayer.getGuestEnemyDiagnostics().length,
      renderedFrames,
      movingEnemies: movingEnemies.length,
      maximumStep,
      maximumApplyMs: Math.max(...applyTimes.map((sample) => sample.applyMs), 0),
      maximumKeyframeApplyMs: Math.max(...keyframeApplyTimes, 0),
      maximumLiveApplyMs: Math.max(...liveApplyTimes, 0),
      p90LiveApplyMs: percentile(liveApplyTimes, 0.90),
      applySamples: applyTimes,
      immediateCorrection: Math.max(...immediateCorrections, 0),
      backwardsClocks,
    };
  }, hostRun);

  const report = JSON.stringify({ hostRun: { ...hostRun, frames: undefined }, guestRun }, null, 2);
  expect(hostRun.wave.wave, report).toBe(4);
  expect(hostRun.wave.waveSpawnTarget, report).toBe(66);
  expect(hostRun.dropped, report).toBeGreaterThanOrEqual(3);
  expect(hostRun.maximumBytes, report).toBeLessThan(12 * 1024);
  // Wall-clock maxima can include an unrelated browser scheduling pause; the
  // sustained percentile guards the actual replication work while retaining a
  // generous ceiling for a single cold/JIT sample.
  expect(hostRun.maximumBootstrapBuildMs, report).toBeLessThan(120);
  expect(hostRun.p90MotionBuildMs, report).toBeLessThan(15);
  expect(hostRun.maximumBuildMs, report).toBeLessThan(120);
  expect(hostRun.backlog, report).toMatchObject({
    enemyOps: 0,
    sentEnemyFrames: 0,
    keyframeActive: false,
  });
  expect(hostRun.budget.stats.wireOversizeSnapshots, report).toBe(0);
  expect(guestRun.replicas, report).toBeGreaterThanOrEqual(55);
  expect(guestRun.movingEnemies, report).toBeGreaterThan(20);
  expect(guestRun.backwardsClocks, report).toBe(0);
  expect(guestRun.immediateCorrection, report).toBeLessThan(0.001);
  expect(guestRun.maximumStep, report).toBeLessThan(0.65);
  expect(guestRun.maximumKeyframeApplyMs, report).toBeLessThan(60);
  expect(guestRun.p90LiveApplyMs, report).toBeLessThan(10);
  expect(guestRun.maximumLiveApplyMs, report).toBeLessThan(80);
});
