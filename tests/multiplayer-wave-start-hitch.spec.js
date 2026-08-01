const path = require("node:path");
const { expect, test } = require("@playwright/test");

const FIXED_FRAME_MS = 1000 / 60;
const SNAPSHOT_FRAME_INTERVAL = 6;
const OPENING_PRESSURE_TOTAL = 100;
const OPENING_PRESSURE_TICK_CAP = 20;
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
    window.__dustMultiplayerTest?.getZombiePressureDiagnostics &&
    window.__dustAndDeadTest?.advanceSpawningOnly
  ));
}

test("wave 15 Ghost Train stages the 100-enemy opening pressure without a host or guest burst", async ({ page }) => {
  test.setTimeout(90_000);
  await openGame(page);

  const result = await page.evaluate((config) => {
    const multiplayer = window.__dustMultiplayerTest;
    const game = window.__dustAndDeadTest;
    const encoder = new TextEncoder();
    const cloneWire = () => JSON.parse(JSON.stringify(
      multiplayer.buildWireSnapshot(false, false, "mock-player-2")
    ));
    const acknowledge = (wire) => multiplayer.acknowledgeClientState(
      "mock-player-2",
      wire.sequence,
      0,
      false
    );

    multiplayer.startMockHost(["Host", "Guest A", "Guest B", "Guest C"]);
    multiplayer.setPlayerPosition("mock-player-1", -170, -135);
    multiplayer.setPlayerPosition("mock-player-2", 170, -135);
    multiplayer.setPlayerPosition("mock-player-3", -170, 135);
    multiplayer.setPlayerPosition("mock-player-4", 170, 135);
    game.forceWaveState(14, 0, 0);

    const baseline = cloneWire();
    acknowledge(baseline);
    const startBeganAt = performance.now();
    const wave = game.startWaveNow(15, "ghostTrain");
    const startMs = performance.now() - startBeganAt;

    const wires = [];
    const captureWire = (label) => {
      const beganAt = performance.now();
      const wire = cloneWire();
      const buildMs = performance.now() - beganAt;
      const decodedBoss = multiplayer.decodeBossState(wire.bossState);
      wires.push({
        label,
        wire,
        buildMs,
        bytes: encoder.encode(JSON.stringify(wire)).length,
        enemyOps: wire.enemyDelta?.c || 0,
        bossKind: decodedBoss?.kind || "",
      });
      acknowledge(wire);
    };

    // The first boundary frame introduces the already-prewarmed Train while
    // the ordinary 0.2 s spawn lead-in is still intact.
    captureWire("boundary");
    const spawnTicks = [];
    let previousLive = 0;
    for (let frame = 0; frame < 24; frame += 1) {
      const beganAt = performance.now();
      const spawning = game.advanceSpawningOnly(config.fixedFrameMs);
      const tickMs = performance.now() - beganAt;
      const created = spawning.live - previousLive;
      if (created > 0) spawnTicks.push({ frame, created, tickMs });
      previousLive = spawning.live;
      if ((frame + 1) % config.snapshotFrameInterval === 0) {
        captureWire(`snapshot-${(frame + 1) / config.snapshotFrameInterval}`);
      }
    }
    const pressure = multiplayer.getZombiePressureDiagnostics();
    const hostBacklog = multiplayer.getReplicationBacklogDiagnostics("mock-player-2");
    const hostTrainPool = game.getGhostTrainVisualBundlePoolDiagnostics();

    // Replay the exact latest-only 10 Hz boundary stream as a guest. This
    // catches accidental recombination of the Train build and a dense replica
    // allocation burst without needing two WebViews in one test worker.
    const replay = [baseline].concat(wires.map((entry) => entry.wire));
    multiplayer.startMockGuest(["Host", "Guest A", "Guest B", "Guest C"], 1);
    const guestFrames = [];
    let previousReplicas = 0;
    for (let index = 0; index < replay.length; index += 1) {
      const beganAt = performance.now();
      multiplayer.applySnapshot(replay[index]);
      const applyMs = performance.now() - beganAt;
      const replicas = multiplayer.getAuthoritativeEnemies().length;
      guestFrames.push({
        index,
        applyMs,
        replicas,
        introduced: Math.max(0, replicas - previousReplicas),
      });
      previousReplicas = replicas;
    }
    const guestState = JSON.parse(window.render_game_to_text());
    const guestTrainPool = game.getGhostTrainVisualBundlePoolDiagnostics();

    return {
      wave,
      startMs,
      spawnTicks,
      pressure,
      hostBacklog,
      hostTrainPool,
      wires: wires.map(({ wire, ...entry }) => entry),
      guestFrames,
      guestTrainPool,
      guest: {
        wave: guestState.wave,
        bossKind: guestState.wave10BossKind,
        trainReplica: guestState.ghostTrain.replica,
        enemies: guestState.enemyCount,
      },
    };
  }, {
    fixedFrameMs: FIXED_FRAME_MS,
    snapshotFrameInterval: SNAPSHOT_FRAME_INTERVAL,
  });

  const report = JSON.stringify(result, null, 2);
  console.log(`wave-15 Ghost Train boundary metrics\n${report}`);
  expect(result.wave, report).toMatchObject({
    wave: 15,
    wave10BossKind: "ghostTrain",
    initialPressureLeft: OPENING_PRESSURE_TOTAL,
  });
  expect(result.pressure, report).toMatchObject({
    initialPressurePerPlayer: 25,
    initialPressureBatchCap: OPENING_PRESSURE_TICK_CAP,
    initialPressureBatchInterval: 0.04,
    initialPressureLeft: 0,
  });
  expect(result.spawnTicks.map((tick) => tick.created), report).toEqual([20, 20, 20, 20, 20]);
  expect(Math.max(...result.spawnTicks.map((tick) => tick.created)), report).toBe(OPENING_PRESSURE_TICK_CAP);
  expect(result.spawnTicks.reduce((sum, tick) => sum + tick.created, 0), report).toBe(OPENING_PRESSURE_TOTAL);
  expect(result.spawnTicks[result.spawnTicks.length - 1].frame, report).toBeLessThan(24);

  expect(result.wires[0], report).toMatchObject({ label: "boundary", enemyOps: 0, bossKind: "ghostTrain" });
  expect(result.wires.every((frame) => frame.bossKind === "ghostTrain"), report).toBe(true);
  expect(Math.max(...result.wires.map((frame) => frame.enemyOps)), report).toBeLessThanOrEqual(15);
  expect(Math.max(...result.wires.map((frame) => frame.bytes)), report).toBeLessThanOrEqual(MAX_WIRE_BYTES);
  expect(result.hostBacklog, report).toMatchObject({ enemyOps: 0, sentEnemyFrames: 0 });

  expect(result.guest, report).toMatchObject({
    wave: 15,
    bossKind: "ghostTrain",
    trainReplica: true,
    enemies: 25,
  });
  expect(Math.max(...result.guestFrames.map((frame) => frame.introduced)), report).toBeLessThanOrEqual(15);
  // These generous ceilings are alarms for a real synchronous regression,
  // while the deterministic per-tick/per-packet caps above carry the contract.
  expect(result.startMs, report).toBeLessThan(250);
  expect(Math.max(...result.spawnTicks.map((tick) => tick.tickMs)), report).toBeLessThan(100);
  expect(Math.max(...result.wires.map((frame) => frame.buildMs)), report).toBeLessThan(100);
  expect(Math.max(...result.guestFrames.map((frame) => frame.applyMs)), report).toBeLessThan(250);
});
