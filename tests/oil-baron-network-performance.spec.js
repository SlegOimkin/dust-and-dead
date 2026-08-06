const path = require("node:path");
const { expect, test } = require("@playwright/test");

function fileUrl(relativePath) {
  const absolute = path.resolve(__dirname, "..", relativePath).replace(/\\/g, "/");
  return `file:///${absolute}`;
}

async function startHunt(page) {
  await page.goto(`${fileUrl("index.html")}?mapSeed=7331&baronNetworkAudit=1`);
  const intro = page.locator("#intro-screen");
  if (await intro.isVisible().catch(() => false)) {
    await page.keyboard.press("KeyM");
    await expect(intro).toBeHidden();
  }
  await page.getByRole("button", { name: "Start Hunt" }).click();
  await page.waitForFunction(() => Boolean(
    window.__dustAndDeadTest?.getOilBaronPackedWireDiagnostics
      && window.__dustAndDeadTest?.getThreeObjectDiagnostics
      && window.__dustMultiplayerTest?.buildWireSnapshot
  ));
}

async function createWorstCaseAbilityState(page) {
  return page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const multiplayer = window.__dustMultiplayerTest;
    multiplayer.startMockHost(["Host", "Guest A", "Guest B", "Guest C"]);
    game.startWaveNow(10, "oilBaron");
    game.clearEnemies();
    game.setOilBaronAiEnabled(false);
    const initialBoss = game.getOilBaronDiagnostics().boss;
    game.damageOilBaron(initialBoss.maxHp * 0.4 + 1, true);
    game.advanceOilBaron(34);

    const baseline = game.getOilBaronPackedWireDiagnostics();
    game.forceOilBaronAction("doubles");
    game.advanceOilBaron(1700);
    const doubles = game.getOilBaronPackedWireDiagnostics();

    const boss = game.getOilBaronDiagnostics().boss;
    const centerDistance = Math.max(0.001, Math.hypot(boss.x, boss.z));
    const dirX = centerDistance > 0.01 ? -boss.x / centerDistance : 0;
    const dirZ = centerDistance > 0.01 ? -boss.z / centerDistance : 1;
    [8, 12, 16, 20].forEach((distance, index) => {
      multiplayer.setPlayerPosition(
        `mock-player-${index + 1}`,
        boss.x + dirX * distance,
        boss.z + dirZ * distance,
      );
    });
    const starts = [];
    for (let index = 0; index < 4; index += 1) {
      starts.push(game.forceOilBaronAction("debt") !== false);
      game.advanceOilBaron(1120);
    }
    game.advanceOilBaron(500);

    const maximum = game.getOilBaronPackedWireDiagnostics();
    const keyframeA = multiplayer.buildWireSnapshot(false, false, "mock-player-4");
    const keyframeB = multiplayer.buildWireSnapshot(false, false, "mock-player-4");
    const regular = multiplayer.buildWireSnapshot(false, false, "mock-player-4");
    const buildStartedAt = performance.now();
    for (let index = 0; index < 240; index += 1) {
      multiplayer.buildWireSnapshot(false, false, "mock-player-4");
    }
    const buildMsFor240 = performance.now() - buildStartedAt;
    const byteLength = (base64) => atob(base64 || "").length;
    const jsonBytes = (value) => new TextEncoder().encode(JSON.stringify(value)).length;
    return {
      starts,
      baseline: { regular: baseline.regularBytes, keyframe: baseline.keyframeBytes },
      doubles: { regular: doubles.regularBytes, keyframe: doubles.keyframeBytes },
      maximum: { regular: maximum.regularBytes, keyframe: maximum.keyframeBytes },
      packets: {
        keyframeA: { boss: byteLength(keyframeA.bossState), total: jsonBytes(keyframeA) },
        keyframeB: { boss: byteLength(keyframeB.bossState), total: jsonBytes(keyframeB) },
        regular: { boss: byteLength(regular.bossState), total: jsonBytes(regular) },
      },
      state: game.getOilBaronDiagnostics(),
      regular,
      network: multiplayer.getNetworkBudgetDiagnostics(),
      buildMsFor240,
    };
  });
}

test("Oil Baron worst-case abilities stay compact at 15 Hz", async ({ page }) => {
  await startHunt(page);
  const result = await createWorstCaseAbilityState(page);
  console.log(`OIL_BARON_NETWORK_BUDGET ${JSON.stringify({
    baseline: result.baseline,
    doubles: result.doubles,
    maximum: result.maximum,
    packets: result.packets,
    snapshotHz: result.network.snapshotHz,
    buildMsFor240: Number(result.buildMsFor240.toFixed(2)),
  })}`);

  expect(result.starts).toEqual([true, true, true, true]);
  expect(result.state.oilDoubles.count).toBe(2);
  expect(result.state.debtChains.count).toBe(4);
  expect(result.network.snapshotHz).toBe(15);
  expect(result.maximum.regular).toBeLessThan(320);
  expect(result.maximum.keyframe).toBeLessThan(16 * 1024);
  expect(result.packets.regular.boss).toBe(result.maximum.regular);
});

test("derrick damage uses repeated sparse HP deltas instead of full tower keyframes", async ({ page }) => {
  await startHunt(page);
  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const multiplayer = window.__dustMultiplayerTest;
    multiplayer.startMockHost(["Host", "Guest"]);
    game.startWaveNow(10, "oilBaron");
    game.clearEnemies();
    game.setOilBaronAiEnabled(false);
    const player = multiplayer.getState().players[0];
    game.spawnOilDerrickBatch(Array.from({ length: 400 }, (_, index) => ({
      x: player.x + (index % 20) * 0.08,
      z: player.z + Math.floor(index / 20) * 0.08,
      options: { oilRadius: 11.8, oilAge: 20, logicalOnly: true },
    })));

    const bootstrap = multiplayer.buildWireSnapshot(false, false, "mock-player-1");
    multiplayer.acknowledgeClientState("mock-player-1", bootstrap.sequence, 0, false);
    const bootstrapRepeat = multiplayer.buildWireSnapshot(false, false, "mock-player-1");
    multiplayer.acknowledgeClientState("mock-player-1", bootstrapRepeat.sequence, 0, false);
    const regular = multiplayer.buildWireSnapshot(false, false, "mock-player-1");
    game.damageOilDerrick(0, 1, true, "mock-player-1", { suppressVisuals: true });
    const firstDelta = multiplayer.buildWireSnapshot(false, false, "mock-player-1");
    const repeatedDelta = multiplayer.buildWireSnapshot(false, false, "mock-player-1");
    game.advanceOilBaron(400);
    const settled = multiplayer.buildWireSnapshot(false, false, "mock-player-1");
    const inspect = (wire) => ({
      bytes: atob(wire.bossState).length,
      boss: multiplayer.decodeBossState(wire.bossState),
    });
    return {
      bootstrapBytes: atob(bootstrap.bossState).length,
      regular: inspect(regular),
      firstDelta: inspect(firstDelta),
      repeatedDelta: inspect(repeatedDelta),
      settled: inspect(settled),
    };
  });

  console.log(`OIL_BARON_DERRICK_DELTA ${JSON.stringify({
    bootstrapBytes: result.bootstrapBytes,
    regularBytes: result.regular.bytes,
    deltaBytes: result.firstDelta.bytes,
    deltaRecords: result.firstDelta.boss.derricks.length,
    repeatRecords: result.repeatedDelta.boss.derricks.length,
    settledBytes: result.settled.bytes,
  })}`);

  expect(result.regular.boss).toMatchObject({ keyframe: false, derricks: [] });
  expect(result.firstDelta.boss).toMatchObject({ keyframe: false, derricksComplete: false });
  expect(result.firstDelta.boss.derricks).toHaveLength(1);
  expect(result.firstDelta.boss.derricks[0].hp).toBe(result.firstDelta.boss.derricks[0].maxHp - 1);
  expect(result.repeatedDelta.boss.derricks).toHaveLength(1);
  expect(result.firstDelta.bytes).toBeLessThan(96);
  expect(result.firstDelta.bytes).toBeLessThan(result.bootstrapBytes * 0.02);
  expect(result.settled.boss).toMatchObject({ keyframe: false, derricks: [] });
});

test("late join and repeated Oil Baron snapshots reuse stable doubles and chains without replaying FX", async ({ page, context }) => {
  test.setTimeout(120_000);
  const guest = await context.newPage();
  try {
    await startHunt(page);
    const host = await createWorstCaseAbilityState(page);
    await page.evaluate(() => window.__dustAndDeadTest.setAutomaticFrameLoopModeForTest("paused"));
    await startHunt(guest);

    // This case measures whether repeated Oil snapshots allocate anything.
    // Finish the intentionally frame-staged zombie GPU warmup first so its one
    // bounded renderer registration cannot be mistaken for an Oil replica leak.
    await guest.bringToFront();
    await guest.evaluate(() => window.__dustAndDeadTest.clearEnemies());
    await expect.poll(async () => guest.evaluate(() => {
      const prewarm = window.__dustAndDeadTest
        ?.getZombieOptimizationStats?.()
        ?.instances?.prewarm;
      return prewarm ? {
        cpuComplete: prewarm.cpu?.complete,
        gpuComplete: prewarm.gpu?.complete,
        createdChunks: prewarm.cpu?.createdChunks,
        readyChunks: prewarm.gpu?.readyChunks,
        failedChunks: prewarm.gpu?.failedChunks,
        error: prewarm.gpu?.error,
      } : null;
    }), {
      timeout: 60_000,
      intervals: [250],
      message: "guest zombie instance prewarm should settle before the Oil leak baseline",
    }).toMatchObject({
      cpuComplete: true,
      gpuComplete: true,
      failedChunks: 0,
    });

    await guest.evaluate((snapshot) => {
      const game = window.__dustAndDeadTest;
      const multiplayer = window.__dustMultiplayerTest;
      multiplayer.startMockGuest(["Host", "Guest A", "Guest B", "Guest C"], 3);
      multiplayer.applySnapshot(snapshot);
      game.advanceOilBaron(34);
      // One additional packet lets one-time remote-player/ability presentation
      // objects finish their lazy initialization before the leak baseline.
      multiplayer.applySnapshot({
        ...snapshot,
        sequence: snapshot.sequence + 1,
        time: Number(snapshot.time || 0) + 1 / 15,
      });
    }, host.regular);

    // Replica upload/reveal is deliberately spread across displayed frames.
    // Take the allocation baseline only after those bounded first-use submits,
    // then any later renderer-memory growth really belongs to repeated packets.
    await guest.waitForFunction(() => {
      const reveal = window.__dustAndDeadTest?.getOilBaronDiagnostics?.()?.replicaReveal;
      return !!reveal
        && !reveal.collecting
        && !reveal.active
        && reveal.queued === 0
        && !reveal.measureNextRender
        && !reveal.upload?.pendingCommit
        && !reveal.upload?.gatePending;
    }, null, { polling: "raf", timeout: 45_000 });
    // Renderer.info may register a lazily compiled shared geometry on the next
    // draw even though the staged replica reveal is already logically settled.
    // Flush that bounded first-use work before taking the leak baseline.
    await guest.evaluate(async () => {
      window.__dustAndDeadTest.renderNowForTest();
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });

    const first = await guest.evaluate(() => {
      const game = window.__dustAndDeadTest;
      const multiplayer = window.__dustMultiplayerTest;
      return {
        baron: game.getOilBaronDiagnostics(),
        objects: game.getThreeObjectDiagnostics(),
        effects: multiplayer.getNetworkCombatDiagnostics(),
      };
    });

    const repeated = await guest.evaluate((snapshot) => {
      const game = window.__dustAndDeadTest;
      const multiplayer = window.__dustMultiplayerTest;
      const baselineObjects = game.getThreeObjectDiagnostics();
      const baselineEffects = multiplayer.getNetworkCombatDiagnostics();
      const startedAt = performance.now();
      for (let index = 0; index < 240; index += 1) {
        multiplayer.applySnapshot({
          ...snapshot,
          sequence: snapshot.sequence + index + 2,
          time: Number(snapshot.time || 0) + (index + 2) / 15,
        });
      }
      const applyMs = performance.now() - startedAt;
      return {
        applyMs,
        baselineObjects,
        baselineEffects,
        baron: game.getOilBaronDiagnostics(),
        objects: game.getThreeObjectDiagnostics(),
        effects: multiplayer.getNetworkCombatDiagnostics(),
      };
    }, host.regular);

    console.log(`OIL_BARON_REPLICA_REUSE ${JSON.stringify({
      applyMsFor240: Number(repeated.applyMs.toFixed(2)),
      objectsBefore: repeated.baselineObjects.roots.effectRoot.objects,
      objectsAfter: repeated.objects.roots.effectRoot.objects,
      geometriesBefore: repeated.baselineObjects.rendererMemory?.geometries,
      geometriesAfter: repeated.objects.rendererMemory?.geometries,
      materialsBefore: repeated.baselineObjects.roots.effectRoot.uniqueMaterials,
      materialsAfter: repeated.objects.roots.effectRoot.uniqueMaterials,
      texturesBefore: repeated.baselineObjects.rendererMemory?.textures,
      texturesAfter: repeated.objects.rendererMemory?.textures,
      effectsBefore: {
        particles: repeated.baselineEffects.particles,
        shockwaves: repeated.baselineEffects.shockwaves,
        lightFlashes: repeated.baselineEffects.lightFlashes,
      },
      effectsAfter: {
        particles: repeated.effects.particles,
        shockwaves: repeated.effects.shockwaves,
        lightFlashes: repeated.effects.lightFlashes,
      },
    })}`);

    expect(first.baron).toMatchObject({ replica: true, oilDoubles: { count: 2 }, debtChains: { count: 4 } });
    expect(repeated.baron.oilDoubles.units.map((unit) => unit.id).sort()).toEqual(
      first.baron.oilDoubles.units.map((unit) => unit.id).sort(),
    );
    expect(repeated.baron.debtChains.chains.map((chain) => chain.id).sort()).toEqual(
      first.baron.debtChains.chains.map((chain) => chain.id).sort(),
    );
    expect(repeated.objects.roots.effectRoot.objects)
      .toBe(repeated.baselineObjects.roots.effectRoot.objects);
    expect(repeated.objects.roots.effectRoot.uniqueMaterials)
      .toBe(repeated.baselineObjects.roots.effectRoot.uniqueMaterials);
    expect(repeated.objects.rendererMemory?.geometries)
      .toBe(repeated.baselineObjects.rendererMemory?.geometries);
    expect(repeated.objects.rendererMemory?.textures)
      .toBe(repeated.baselineObjects.rendererMemory?.textures);
    expect(repeated.effects).toMatchObject({
      particles: repeated.baselineEffects.particles,
      shockwaves: repeated.baselineEffects.shockwaves,
      lightFlashes: repeated.baselineEffects.lightFlashes,
    });
  } finally {
    await guest.close();
  }
});
