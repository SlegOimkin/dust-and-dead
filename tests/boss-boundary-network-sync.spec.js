const path = require("node:path");
const { expect, test } = require("@playwright/test");

const MAX_WIRE_BYTES = 31 * 1024;
const MAX_BUILD_MS = 25;
// A dense first boss keyframe may create its retained replica shell while two
// software WebGL contexts coexist; keep it below one 30 Hz network tick. The
// detailed uploads themselves remain staged and are measured separately.
const MAX_APPLY_MS = 30;
const MAX_RENDER_MS = 50;
// The inactive synthetic peer is parked while the foreground peer renders.
// This models production, where peers own separate GPUs, while retaining enough
// headroom for a real context handoff on headless SwiftShader.
const MAX_FIRST_CROSS_CONTEXT_RENDER_MS = 150;
// A synthetic late join deliberately materializes 84 authored draw items at
// once in a second WebGL context. They are admitted one at a time and remain
// hidden until complete; visible/repeated frames still use MAX_RENDER_MS.
const MAX_COLD_REPLICA_UPLOAD_MS = 400;
// One of several synchronous manual renders can occasionally wait for the
// other tab's software-GPU queue. Sustained performance is guarded by the
// three-sample median below; this ceiling still catches a wedged context.
const MAX_SHARED_GPU_OUTLIER_MS = 800;
const MAX_TRANSITION_MS = 50;
const MAX_PREWARM_SLICE_MS = 25;
// A background shadow submit can straddle one headless scheduler quantum even
// though its measured GPU work stays below a 30 Hz frame. Combat frames retain
// their stricter limits and are profiled independently.
const MAX_GPU_PREWARM_SLICE_MS = 30;
const WAVE_9_ENEMIES = 24;
const BOSS_WAVE_ENEMIES = 12;
const WAVE_11_ENEMIES = 16;
const SCOPED_VISIBLE_ENEMIES = 6;

const BOSS_CASES = [
  {
    kind: "bellRinger",
    expectedMaxHp: 491,
    assertStructure(summary) {
      expect(summary.bell, "Bell Ringer replica").toMatchObject({
        active: true,
        replica: true,
        defeated: false,
        hp: 491,
        maxHp: 491,
        churchCount: 3,
        activeChurchCount: 3,
      });
      expect(summary.train.active).toBe(false);
      expect(summary.baron).toBeNull();
      expect(summary.sloth.active).toBe(false);
    },
  },
  {
    kind: "ghostTrain",
    expectedMaxHp: 640,
    assertStructure(summary) {
      expect(summary.train, "Ghost Train replica").toMatchObject({
        active: true,
        replica: true,
        defeated: false,
        hp: 640,
        maxHp: 640,
        segmentCount: 5,
        attachedSegmentCount: 5,
        trackPoints: 16,
      });
      expect(summary.bell.active).toBe(false);
      expect(summary.baron).toBeNull();
      expect(summary.sloth.active).toBe(false);
    },
  },
  {
    kind: "oilBaron",
    expectedMaxHp: 3240,
    expectedHp: 1340,
    assertStructure(summary) {
      expect(summary.baron, "Oil Baron replica").toMatchObject({
        active: true,
        replica: true,
        defeated: false,
        hp: 1340,
        maxHp: 3240,
        derrickCount: 3,
        doubleCount: 2,
        chainCount: 1,
      });
      expect(summary.bell.active).toBe(false);
      expect(summary.train.active).toBe(false);
      expect(summary.sloth.active).toBe(false);
    },
  },
  {
    kind: "slothArchbishop",
    expectedMaxHp: null,
    assertStructure(summary) {
      expect(summary.sloth, "Sloth Archbishop replica").toMatchObject({
        active: true,
        replica: true,
        defeated: false,
      });
      expect(summary.sloth.hp).toBeGreaterThan(0);
      expect(summary.sloth.hp).toBe(summary.sloth.maxHp);
      expect(summary.sloth.phase).toBeGreaterThanOrEqual(0);
      expect(summary.bell.active).toBe(false);
      expect(summary.train.active).toBe(false);
      expect(summary.baron).toBeNull();
    },
  },
];

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

async function startHunt(page, options = {}) {
  await page.goto(`${fileUrl("index.html")}?mapSeed=7331&bossBoundaryNetworkSync=1`);
  // Each network peer owns the foreground WebGL context on its real device.
  // Keep the page being prepared in that same state instead of letting the
  // browser throttle its staged requestAnimationFrame work as a background tab.
  await page.bringToFront();
  const intro = page.locator("#intro-screen");
  if (await intro.isVisible().catch(() => false)) {
    await page.keyboard.press("KeyM");
    await expect(intro).toBeHidden();
  }
  const audioEnabled = await page.evaluate(() => window.__dustAndDeadTest.getAudioDiagnostics().enabled);
  if (audioEnabled) await page.locator("#menu-music-btn").click();
  await page.getByRole("button", { name: "Start Hunt" }).click();
  await page.waitForFunction(() => Boolean(
    window.__dustAndDeadTest?.forceWaveState
      && window.__dustAndDeadTest?.setWave10BossOverride
      && window.__dustAndDeadTest?.advanceWaveProgress
      && window.__dustAndDeadTest?.forceActiveBossDefeat
      && window.__dustAndDeadTest?.forceOilBaronDebtChainForPlayer
      && window.__dustAndDeadTest?.renderNowForTest
      && window.__dustAndDeadTest?.profileNextRenderForTest
      && window.__dustAndDeadTest?.setAutomaticFrameLoopModeForTest
      && window.__dustAndDeadTest?.advanceOilBaronReplicaRevealFrameForTest
      && window.__dustAndDeadTest?.getLightFlashRenderBudgetDiagnostics
      && window.__dustAndDeadTest?.getSlothArchbishopDiagnostics
      && window.__dustMultiplayerTest?.buildWireSnapshot
      && window.__dustMultiplayerTest?.acknowledgeClientState
      && window.__dustMultiplayerTest?.getGuestEnemyDiagnostics
  ));
  // In a real run the game has nine full waves in which to populate its
  // background pools. Wait for those ordinary staged jobs to finish before
  // measuring the wave-nine boundary instead of benchmarking cold bootstrap.
  // Heavy uploads now pause while enemies are alive, so use an explicit safe
  // preparation window; every scenario below installs its own authoritative
  // wave state after this wait.
  await page.evaluate(() => window.__dustAndDeadTest.clearEnemies());
  try {
    await page.waitForFunction(() => {
      const game = window.__dustAndDeadTest;
      const train = game?.getGhostTrainVisualBundlePoolDiagnostics?.();
      const bossFx = game?.getBossShaderFxPrewarmDiagnostics?.();
      const bossVisual = game?.getBossVisualPrewarmDiagnostics?.();
      return Boolean(
        train?.prewarm?.completed &&
        train?.prewarm?.gpuReady &&
        bossFx?.completed &&
        bossVisual?.completed &&
        bossVisual?.geometryGpu?.completed
      );
    }, null, { timeout: options.prewarmTimeout || 150_000 });
  } catch (error) {
    const diagnostics = await page.evaluate(() => ({
      train: window.__dustAndDeadTest?.getGhostTrainVisualBundlePoolDiagnostics?.()?.prewarm,
      bossFx: window.__dustAndDeadTest?.getBossShaderFxPrewarmDiagnostics?.(),
      bossVisual: window.__dustAndDeadTest?.getBossVisualPrewarmDiagnostics?.(),
    }));
    console.log(`BOSS_PREWARM_TIMEOUT ${JSON.stringify(diagnostics)}`);
    throw error;
  }
}

async function setAutomaticFrameLoopMode(page, mode) {
  return page.evaluate((requestedMode) => (
    window.__dustAndDeadTest.setAutomaticFrameLoopModeForTest(requestedMode)
  ), mode);
}

async function restoreForegroundRenderContext(page, inactivePage) {
  if (inactivePage) await setAutomaticFrameLoopMode(inactivePage, "paused");
  await page.bringToFront();
  await page.evaluate(async () => {
    const game = window.__dustAndDeadTest;
    game.setAutomaticFrameLoopModeForTest("render-only");
    for (let index = 0; index < 6; index += 1) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    game.setAutomaticFrameLoopModeForTest("paused");
  });
}

async function buildHostWire(page) {
  const built = await page.evaluate(() => {
    const multiplayer = window.__dustMultiplayerTest;
    const startedAt = performance.now();
    const wire = JSON.parse(JSON.stringify(
      multiplayer.buildWireSnapshot(false, false, "mock-player-2")
    ));
    const players = wire.players || multiplayer.decodePlayerWireEntries(wire.ps) || [];
    return { wire, players, buildMs: performance.now() - startedAt };
  });
  return { ...built, bytes: wireBytes(built.wire) };
}

async function acknowledgeHostWire(page, wire) {
  await page.evaluate(({ sequence, combatAck }) => {
    window.__dustMultiplayerTest.acknowledgeClientState(
      "mock-player-2",
      sequence,
      combatAck,
      false
    );
  }, { sequence: wire.sequence, combatAck: highestCombatSequence(wire) });
}

async function applyGuestWire(page, wire) {
  return page.evaluate((snapshot) => {
    const game = window.__dustAndDeadTest;
    const multiplayer = window.__dustMultiplayerTest;
    const getRendererProgramCount = () => (
      game.getLightFlashRenderBudgetDiagnostics().rendererPrograms
    );
    const getRendererProgramDetails = () => (
      typeof game.getRendererProgramDiagnostics === "function"
        ? game.getRendererProgramDiagnostics()
        : []
    );
    const rendererProgramsBefore = getRendererProgramCount();
    const rendererProgramDetailsBefore = getRendererProgramDetails();
    const applyStartedAt = performance.now();
    multiplayer.applySnapshot(snapshot);
    const applyMs = performance.now() - applyStartedAt;
    const rendererProgramsAfterApply = getRendererProgramCount();
    const renderStartedAt = performance.now();
    const renderProfile = game.profileNextRenderForTest();
    const renderMs = performance.now() - renderStartedAt;
    const rendererProgramsAfterFirstRender = getRendererProgramCount();
    const rendererProgramDetailsAfterFirst = getRendererProgramDetails();
    const repeatRenderMs = [];
    const rendererProgramsAfterRepeatRenders = [];
    for (let index = 0; index < 3; index += 1) {
      const repeatStartedAt = performance.now();
      game.renderNowForTest();
      repeatRenderMs.push(performance.now() - repeatStartedAt);
      rendererProgramsAfterRepeatRenders.push(getRendererProgramCount());
    }

    const world = JSON.parse(window.render_game_to_text());
    const bell = game.getBellRingerDiagnostics();
    const train = game.getGhostTrainDiagnostics();
    const baron = game.getOilBaronDiagnostics();
    const sloth = game.getSlothArchbishopDiagnostics();
    const players = multiplayer.getState().players;
    const host = players.find((player) => player.id === "mock-player-1");
    const enemies = multiplayer.getGuestEnemyDiagnostics();
    const objects = game.getThreeObjectDiagnostics();

    return {
      applyMs,
      renderMs,
      renderProfile,
      repeatRenderMs,
      rendererPrograms: {
        before: rendererProgramsBefore,
        afterApply: rendererProgramsAfterApply,
        afterFirstRender: rendererProgramsAfterFirstRender,
        afterRepeats: rendererProgramsAfterRepeatRenders,
      },
      rendererProgramDiff: {
        added: rendererProgramDetailsAfterFirst.filter((program) => (
          !rendererProgramDetailsBefore.some((before) => before.cacheKey === program.cacheKey)
        )),
        removed: rendererProgramDetailsBefore.filter((program) => (
          !rendererProgramDetailsAfterFirst.some((after) => after.cacheKey === program.cacheKey)
        )),
      },
      wave: world.wave,
      waveTarget: world.waveSpawnTarget,
      waveRemaining: world.waveRemaining,
      kind: world.wave10BossKind,
      lastSnapshotSequence: world.multiplayer.lastSnapshotSequence,
      remoteHostTarget: host ? { x: host.networkTargetX, z: host.networkTargetZ } : null,
      enemyCount: enemies.length,
      enemyIds: enemies.map((enemy) => enemy.id).sort((a, b) => a - b),
      dynamicObjects: objects.roots.dynamicRoot.objects,
      effectObjects: objects.roots.effectRoot.objects,
      bell: {
        active: Boolean(bell && bell.active),
        replica: Boolean(bell && bell.replica),
        defeated: Boolean(bell && bell.defeated),
        hp: bell ? bell.hp : 0,
        maxHp: bell ? bell.maxHp : 0,
        churchCount: bell && bell.churches ? bell.churches.length : 0,
        activeChurchCount: bell && bell.churches
          ? bell.churches.filter((church) => church.active).length
          : 0,
      },
      train: {
        active: Boolean(train && train.active),
        replica: Boolean(train && train.replica),
        defeated: Boolean(train && train.defeated),
        hp: train ? train.hp : 0,
        maxHp: train ? train.maxHp : 0,
        segmentCount: train && train.segments ? train.segments.length : 0,
        attachedSegmentCount: train && train.segments
          ? train.segments.filter((segment) => segment.attached).length
          : 0,
        trackPoints: train && train.track ? train.track.points : 0,
      },
      baron: baron ? {
        active: Boolean(baron.active),
        replica: Boolean(baron.replica),
        defeated: Boolean(baron.defeated),
        hp: baron.boss ? baron.boss.hp : 0,
        maxHp: baron.boss ? baron.boss.maxHp : 0,
        derrickCount: baron.derrickCount || 0,
        doubleCount: baron.oilDoubles ? baron.oilDoubles.count : 0,
        chainCount: baron.debtChains ? baron.debtChains.count : 0,
        chainVisuals: baron.debtChains ? baron.debtChains.chains.map((chain) => ({
          id: chain.id,
          revealPending: Boolean(chain.revealPending),
          groupVisible: Boolean(chain.groupVisible),
          activeLinks: chain.activeLinks,
          visualVisible: chain.visualVisible,
          visibleDrawItems: chain.render ? chain.render.visibleDrawItems : 0,
          linkDrawCalls: chain.render ? chain.render.linkDrawCalls : 0,
          accessoriesBatched: chain.render ? chain.render.accessoriesBatched : false,
        })) : [],
        chainAccessoryBatch: baron.debtChains ? baron.debtChains.accessoryBatch : null,
        replicaReveal: baron.replicaReveal ? {
          collecting: Boolean(baron.replicaReveal.collecting),
          active: Boolean(baron.replicaReveal.active),
          queued: baron.replicaReveal.queued || 0,
          total: baron.replicaReveal.total || 0,
          revealed: baron.replicaReveal.revealed || 0,
          lastKind: baron.replicaReveal.lastKind || "",
          lastRenderKind: baron.replicaReveal.lastRenderKind || "",
          maxRenderKind: baron.replicaReveal.maxRenderKind || "",
          measureNextRender: Boolean(baron.replicaReveal.measureNextRender),
          lastRenderMs: baron.replicaReveal.lastRenderMs || 0,
          maxRenderMs: baron.replicaReveal.maxRenderMs || 0,
          upload: baron.replicaReveal.upload ? {
            queued: baron.replicaReveal.upload.queued || 0,
            total: baron.replicaReveal.upload.total || 0,
            completed: baron.replicaReveal.upload.completed || 0,
            objectRefs: baron.replicaReveal.upload.objectRefs || 0,
            pendingCommit: Boolean(baron.replicaReveal.upload.pendingCommit),
            fencePending: Boolean(baron.replicaReveal.upload.fencePending),
            fenceWaits: baron.replicaReveal.upload.fenceWaits || 0,
            fenceMaxWaits: baron.replicaReveal.upload.fenceMaxWaits || 0,
            fenceCreated: baron.replicaReveal.upload.fenceCreated || 0,
            fenceSupported: Boolean(baron.replicaReveal.upload.fenceSupported),
            gateReady: Boolean(baron.replicaReveal.upload.gateReady),
            gatePending: Boolean(baron.replicaReveal.upload.gatePending),
            gateWaits: baron.replicaReveal.upload.gateWaits || 0,
            lastKind: baron.replicaReveal.upload.lastKind || "",
            lastMs: baron.replicaReveal.upload.lastMs || 0,
            maxMs: baron.replicaReveal.upload.maxMs || 0,
            frameLastMs: baron.replicaReveal.upload.frameLastMs || 0,
            frameMaxMs: baron.replicaReveal.upload.frameMaxMs || 0,
            programsBefore: baron.replicaReveal.upload.programsBefore || 0,
            programsAfter: baron.replicaReveal.upload.programsAfter || 0,
            gameplayScenePasses: baron.replicaReveal.upload.gameplayScenePasses || 0,
            gameplayShadowPasses: baron.replicaReveal.upload.gameplayShadowPasses || 0,
            stateRestores: baron.replicaReveal.upload.stateRestores || 0,
            inBandPasses: baron.replicaReveal.upload.inBandPasses || 0,
            extraRenderPasses: baron.replicaReveal.upload.extraRenderPasses || 0,
            compositePasses: baron.replicaReveal.upload.compositePasses || 0,
            compositeLastMs: baron.replicaReveal.upload.compositeLastMs || 0,
            compositeMaxMs: baron.replicaReveal.upload.compositeMaxMs || 0,
            compositeStateRestores: baron.replicaReveal.upload.compositeStateRestores || 0,
            gameplayFramebufferPasses: baron.replicaReveal.upload.gameplayFramebufferPasses || 0,
            viewportRestores: baron.replicaReveal.upload.viewportRestores || 0,
            scissorRestores: baron.replicaReveal.upload.scissorRestores || 0,
            surfaceActive: Boolean(baron.replicaReveal.upload.surfaceActive),
            targetRetained: Boolean(baron.replicaReveal.upload.targetRetained),
            sceneRetained: Boolean(baron.replicaReveal.upload.sceneRetained),
            shadowLightRetained: Boolean(baron.replicaReveal.upload.shadowLightRetained),
            error: baron.replicaReveal.upload.error || "",
          } : null,
        } : null,
      } : null,
      sloth: {
        active: Boolean(sloth && sloth.active),
        replica: Boolean(sloth && sloth.replica),
        defeated: Boolean(sloth && sloth.defeated),
        hp: sloth ? sloth.hp : 0,
        maxHp: sloth ? sloth.maxHp : 0,
        phase: sloth ? sloth.phase : 0,
        action: sloth ? sloth.action : "",
      },
    };
  }, wire);
}

async function waitForOilBaronReplicaReveal(page, maxFrames = 480) {
  return page.evaluate(async (requestedFrames) => {
    const game = window.__dustAndDeadTest;
    game.setAutomaticFrameLoopModeForTest("paused");
    try {
      const multiplayer = window.__dustMultiplayerTest;
    const read = () => {
      const world = JSON.parse(window.render_game_to_text());
      const baron = game.getOilBaronDiagnostics();
      const objects = game.getThreeObjectDiagnostics();
      const enemies = multiplayer.getGuestEnemyDiagnostics();
      const reveal = baron && baron.replicaReveal;
      return {
        wave: world.wave,
        waveRemaining: world.waveRemaining,
        kind: world.wave10BossKind,
        lastSnapshotSequence: world.multiplayer.lastSnapshotSequence,
        enemyIds: enemies.map((enemy) => enemy.id).sort((a, b) => a - b),
        dynamicObjects: objects.roots.dynamicRoot.objects,
        effectObjects: objects.roots.effectRoot.objects,
        rendererPrograms: game.getLightFlashRenderBudgetDiagnostics().rendererPrograms,
        boss: baron && baron.boss ? {
          hp: baron.boss.hp,
          maxHp: baron.boss.maxHp,
        } : null,
        derrickCount: baron ? baron.derrickCount : 0,
        doubleCount: baron && baron.oilDoubles ? baron.oilDoubles.count : 0,
        chainCount: baron && baron.debtChains ? baron.debtChains.count : 0,
        reveal: reveal ? {
          collecting: Boolean(reveal.collecting),
          active: Boolean(reveal.active),
          queued: reveal.queued || 0,
          total: reveal.total || 0,
          revealed: reveal.revealed || 0,
          lastKind: reveal.lastKind || "",
          lastRenderKind: reveal.lastRenderKind || "",
          maxRenderKind: reveal.maxRenderKind || "",
          measureNextRender: Boolean(reveal.measureNextRender),
          lastRenderMs: reveal.lastRenderMs || 0,
          maxRenderMs: reveal.maxRenderMs || 0,
          upload: reveal.upload ? {
            queued: reveal.upload.queued || 0,
            total: reveal.upload.total || 0,
            completed: reveal.upload.completed || 0,
            objectRefs: reveal.upload.objectRefs || 0,
            pendingCommit: Boolean(reveal.upload.pendingCommit),
            fencePending: Boolean(reveal.upload.fencePending),
            fenceWaits: reveal.upload.fenceWaits || 0,
            fenceMaxWaits: reveal.upload.fenceMaxWaits || 0,
            fenceCreated: reveal.upload.fenceCreated || 0,
            fenceSupported: Boolean(reveal.upload.fenceSupported),
            gateReady: Boolean(reveal.upload.gateReady),
            gatePending: Boolean(reveal.upload.gatePending),
            gateWaits: reveal.upload.gateWaits || 0,
            lastKind: reveal.upload.lastKind || "",
            lastMs: reveal.upload.lastMs || 0,
            maxMs: reveal.upload.maxMs || 0,
            frameLastMs: reveal.upload.frameLastMs || 0,
            frameMaxMs: reveal.upload.frameMaxMs || 0,
            programsBefore: reveal.upload.programsBefore || 0,
            programsAfter: reveal.upload.programsAfter || 0,
            gameplayScenePasses: reveal.upload.gameplayScenePasses || 0,
            gameplayShadowPasses: reveal.upload.gameplayShadowPasses || 0,
            stateRestores: reveal.upload.stateRestores || 0,
            inBandPasses: reveal.upload.inBandPasses || 0,
            extraRenderPasses: reveal.upload.extraRenderPasses || 0,
            compositePasses: reveal.upload.compositePasses || 0,
            compositeLastMs: reveal.upload.compositeLastMs || 0,
            compositeMaxMs: reveal.upload.compositeMaxMs || 0,
            compositeStateRestores: reveal.upload.compositeStateRestores || 0,
            gameplayFramebufferPasses: reveal.upload.gameplayFramebufferPasses || 0,
            viewportRestores: reveal.upload.viewportRestores || 0,
            scissorRestores: reveal.upload.scissorRestores || 0,
            surfaceActive: Boolean(reveal.upload.surfaceActive),
            targetRetained: Boolean(reveal.upload.targetRetained),
            sceneRetained: Boolean(reveal.upload.sceneRetained),
            shadowLightRetained: Boolean(reveal.upload.shadowLightRetained),
            error: reveal.upload.error || "",
          } : null,
        } : null,
        fidelity: baron ? {
          original: baron.boss ? baron.boss.render : null,
          derricks: {
            count: baron.derrickCount || 0,
            active: baron.activeDerricks || 0,
            networkComplete: baron.networkDerricksComplete !== false,
            visible: baron.render ? baron.render.visibleDerricks || 0 : 0,
            sampleGraph: baron.render ? baron.render.sampleDerrickGraph : null,
            poses: (baron.derricks || []).map((derrick) => ({
              id: derrick.id,
              frozen: Boolean(derrick.revealPoseFrozen),
              transform: derrick.transform || null,
            })),
          },
          doubles: baron.oilDoubles ? baron.oilDoubles.units.map((unit) => ({
            appearance: unit.appearance,
            coloredDetailCount: unit.coloredDetailCount,
            visibleDrawItems: unit.render ? unit.render.visibleDrawItems : 0,
            shadowCasters: unit.render ? unit.render.shadowCasters : 0,
            shadowBatches: unit.render ? unit.render.shadowBatches : 0,
            shadowBatchSourceCount: unit.render ? unit.render.shadowBatchSourceCount : 0,
            plainBatchSourceCount: unit.render ? unit.render.plainBatchSourceCount : 0,
            visualBatches: unit.render ? unit.render.visualBatches : 0,
            batchSourceCount: unit.render ? unit.render.batchSourceCount : 0,
            batchSyncCount: unit.render ? unit.render.batchSyncCount : 0,
            batchLastSyncFrame: unit.render ? unit.render.batchLastSyncFrame : -1,
            detailInstanceSyncCount: unit.detailInstanceSyncCount || 0,
            detailInstanceLastSyncFrame: unit.detailInstanceLastSyncFrame || -1,
            frozen: Boolean(unit.revealPoseFrozen),
            transform: unit.transform || null,
          })) : [],
          chains: baron.debtChains ? baron.debtChains.chains.map((chain) => ({
            id: chain.id,
            revealPending: Boolean(chain.revealPending),
            groupVisible: Boolean(chain.groupVisible),
            activeLinks: chain.activeLinks,
            visualVisible: chain.visualVisible,
            visibleDrawItems: chain.render ? chain.render.visibleDrawItems : 0,
            linkDrawCalls: chain.render ? chain.render.linkDrawCalls : 0,
            accessoriesBatched: chain.render ? chain.render.accessoriesBatched : false,
            frozen: Boolean(chain.revealPoseFrozen),
            transform: chain.transform || null,
          })) : [],
          chainAccessoryBatch: baron.debtChains ? baron.debtChains.accessoryBatch : null,
        } : null,
      };
    };

    const frames = Math.max(1, Math.floor(Number(requestedFrames) || 1));
    const samples = [read()];
    let settledFrames = 0;
    for (let index = 0; index < frames; index += 1) {
      const previous = samples[samples.length - 1];
      if (!previous.reveal || !previous.reveal.active) {
        // Keep two ordinary post-reveal frames in the sample.  This proves
        // that the exact frozen pose resumes its full detail-instance and
        // batched-part synchronization after the atomic first frame.
        if (settledFrames >= 2) break;
        settledFrames += 1;
      }
      await new Promise((resolve) => requestAnimationFrame(resolve));
      game.advanceOilBaronReplicaRevealFrameForTest();
      samples.push(read());
    }
      return { samples, settled: samples[samples.length - 1] };
    } finally {
      game.setAutomaticFrameLoopModeForTest("paused");
    }
  }, maxFrames);
}

function logOilBaronRevealSummary(label, run) {
  const settled = run && run.settled;
  const reveal = settled && settled.reveal;
  const upload = reveal && reveal.upload;
  console.log(`${label} ${JSON.stringify({
    frames: run && run.samples ? run.samples.length : 0,
    total: reveal ? reveal.total : 0,
    revealed: reveal ? reveal.revealed : 0,
    maxRenderMs: reveal ? Number(reveal.maxRenderMs.toFixed(2)) : 0,
    uploadTotal: upload ? upload.total : 0,
    uploadCompleted: upload ? upload.completed : 0,
    uploadMaxMs: upload ? Number(upload.maxMs.toFixed(2)) : 0,
    rendererPrograms: settled ? settled.rendererPrograms : 0,
  })}`);
}

async function readGuestAfterAnimationFrames(page, frameCount) {
  return page.evaluate(async (requestedFrames) => {
    const game = window.__dustAndDeadTest;
    game.setAutomaticFrameLoopModeForTest("render-only");
    try {
      const frames = Math.max(1, Math.floor(Number(requestedFrames) || 1));
      for (let index = 0; index < frames; index += 1) {
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }
      const multiplayer = window.__dustMultiplayerTest;
      const world = JSON.parse(window.render_game_to_text());
      const enemies = multiplayer.getGuestEnemyDiagnostics();
      const objects = game.getThreeObjectDiagnostics();
      const bell = game.getBellRingerDiagnostics();
      const train = game.getGhostTrainDiagnostics();
      const baron = game.getOilBaronDiagnostics();
      const sloth = game.getSlothArchbishopDiagnostics();
      return {
        wave: world.wave,
        waveRemaining: world.waveRemaining,
        kind: world.wave10BossKind,
        enemyCount: enemies.length,
        enemyIds: enemies.map((enemy) => enemy.id).sort((a, b) => a - b),
        dynamicObjects: objects.roots.dynamicRoot.objects,
        effectObjects: objects.roots.effectRoot.objects,
        effectState: objects.state,
        rendererMemory: objects.rendererMemory,
        bellActive: Boolean(bell && bell.active),
        bellChurchCount: bell && bell.churches ? bell.churches.length : 0,
        trainActive: Boolean(train && train.active),
        trainSegmentCount: train && train.segments ? train.segments.length : 0,
        baronActive: Boolean(baron && baron.active),
        baronPresent: Boolean(baron),
        slothActive: Boolean(sloth && sloth.active),
      };
    } finally {
      game.setAutomaticFrameLoopModeForTest("paused");
    }
  }, frameCount);
}

async function readHostEnemyIds(page) {
  return page.evaluate(() => window.__dustMultiplayerTest
    .getAuthoritativeEnemies()
    .map((enemy) => enemy.id)
    .sort((a, b) => a - b));
}

function expectPacketHealthy(record, label) {
  expect(record.bytes, `${label} packet bytes`).toBeLessThanOrEqual(MAX_WIRE_BYTES);
  expect(record.buildMs, `${label} packet build`).toBeLessThan(MAX_BUILD_MS);
}

function logGuestFrameDiagnostics(record, label) {
  console.log(`BOSS_GUEST_FRAME ${JSON.stringify({
    label,
    applyMs: Number(record.applyMs.toFixed(2)),
    firstCrossContextMs: Number(record.renderMs.toFixed(2)),
    firstRenderPhases: record.renderProfile ? {
      cameraMs: Number(record.renderProfile.cameraMs.toFixed(2)),
      preRenderSyncMs: Number(record.renderProfile.preRenderSyncMs.toFixed(2)),
      shadowPrepareMs: Number(record.renderProfile.shadowPrepareMs.toFixed(2)),
      rendererMs: Number(record.renderProfile.rendererMs.toFixed(2)),
      postRenderMs: Number(record.renderProfile.postRenderMs.toFixed(2)),
      totalMs: Number(record.renderProfile.totalMs.toFixed(2)),
    } : null,
    warmedRepeatMs: record.repeatRenderMs.map((value) => Number(value.toFixed(2))),
    rendererPrograms: record.rendererPrograms,
    rendererProgramDiff: record.rendererProgramDiff,
  })}`);
}

function expectGuestTimingHealthy(
  record,
  label,
  firstRenderLimit = MAX_FIRST_CROSS_CONTEXT_RENDER_MS,
  repeatRenderLimit = MAX_RENDER_MS
) {
  logGuestFrameDiagnostics(record, label);
  expect(record.applyMs, `${label} guest apply`).toBeLessThan(MAX_APPLY_MS);
  expect(record.renderMs, `${label} guest first cross-context render`)
    .toBeLessThan(firstRenderLimit);
  expect(record.renderProfile, `${label} first-render phase profile`).toBeTruthy();
  expect(record.renderProfile.error, `${label} first-render error`).toBe("");
  expect(record.renderProfile.totalMs, `${label} profiled first render`)
    .toBeLessThan(firstRenderLimit);
  const firstRenderJsMs =
    record.renderProfile.cameraMs +
    record.renderProfile.preRenderSyncMs +
    record.renderProfile.shadowPrepareMs +
    record.renderProfile.postRenderMs;
  expect(firstRenderJsMs, `${label} first-render JS phases`).toBeLessThan(MAX_RENDER_MS);
  expect(record.repeatRenderMs, `${label} warmed repeat samples`).toHaveLength(3);
  const healthyRepeats = record.repeatRenderMs.filter((sample) => sample < repeatRenderLimit);
  expect(healthyRepeats.length, `${label} warmed repeat frame majority`).toBeGreaterThanOrEqual(2);
  for (const [index, sample] of record.repeatRenderMs.entries()) {
    expect(sample, `${label} shared-GPU hard ceiling ${index + 1}`).toBeLessThan(MAX_SHARED_GPU_OUTLIER_MS);
  }
  const sortedRepeats = record.repeatRenderMs.slice().sort((a, b) => a - b);
  const repeatMedian = sortedRepeats[Math.floor(sortedRepeats.length / 2)];
  expect(repeatMedian, `${label} warmed repeat render median`).toBeLessThan(repeatRenderLimit);
}

function expectGuestProgramsStable(record, label) {
  const programSamples = [
    record.rendererPrograms.afterApply,
    record.rendererPrograms.afterFirstRender,
    ...record.rendererPrograms.afterRepeats,
  ];
  for (const [index, count] of programSamples.entries()) {
    expect(count, `${label} renderer program growth sample ${index + 1}`)
      .toBeLessThanOrEqual(record.rendererPrograms.before);
  }
}

function expectGuestFrameHealthy(
  record,
  label,
  firstRenderLimit = MAX_FIRST_CROSS_CONTEXT_RENDER_MS,
  repeatRenderLimit = MAX_RENDER_MS
) {
  expectGuestTimingHealthy(
    record,
    label,
    firstRenderLimit,
    repeatRenderLimit
  );
  expectGuestProgramsStable(record, label);
}

function expectRemotePlayerSynchronized(record, built, label) {
  const host = (built.players || []).find((player) => player.id === "mock-player-1");
  expect(host, `${label} host player payload`).toBeTruthy();
  expect(record.remoteHostTarget, `${label} guest host target`).toBeTruthy();
  expect(record.remoteHostTarget.x, `${label} host x`).toBeCloseTo(host.x, 1);
  expect(record.remoteHostTarget.z, `${label} host z`).toBeCloseTo(host.z, 1);
}

function expectWaveProgressSynchronized(record, wire, label) {
  expect(Array.isArray(wire.ws), `${label} compact wave state`).toBe(true);
  expect(record.waveTarget, `${label} wave target`).toBe(wire.ws[0]);
  expect(record.waveRemaining, `${label} wave remaining`).toBe(wire.ws[1]);
}

function expectOilBaronDenseRevealStarted(record) {
  expect(record.baron.replicaReveal, "Oil Baron dense late-join reveal starts staged").toMatchObject({
    collecting: false,
    active: true,
    queued: 6,
    total: 6,
    revealed: 0,
    lastKind: "",
    measureNextRender: false,
    lastRenderMs: 0,
    maxRenderMs: 0,
    upload: {
      completed: 0,
      pendingCommit: false,
      sceneRetained: false,
      error: "",
    },
  });
  expect(record.baron.replicaReveal.upload.total, "dense upload work is registered synchronously")
    .toBeGreaterThan(0);
  expect(record.baron.replicaReveal.upload.queued, "dense upload queue is visible immediately")
    .toBeGreaterThan(0);
  expect(record.baron.replicaReveal.upload.queued, "dense upload queue stays within total")
    .toBeLessThanOrEqual(record.baron.replicaReveal.upload.total);
  expect(record.baron.replicaReveal.upload.objectRefs, "dense upload refs are retained until commit")
    .toBeGreaterThanOrEqual(record.baron.replicaReveal.upload.queued);
}

function expectOilBaronUploadSampleHealthy(
  upload,
  previousUpload,
  initialPrograms,
  label,
  isRafStep
) {
  expect(upload, `${label} upload diagnostics`).toBeTruthy();
  expect(upload.error, `${label} upload error`).toBe("");
  // A WebGL2 fence keeps the exact first submit hidden until the driver has
  // actually completed it. It is expected to remain pending for one or more
  // ordinary RAFs; only its matching fence may be pending.
  if (upload.pendingCommit && upload.fenceSupported) {
    expect(upload.fencePending, `${label} pending upload owns a GPU fence`).toBe(true);
  }
  expect(upload.fenceWaits, `${label} fence wait count`).toBeGreaterThanOrEqual(0);
  expect(upload.fenceMaxWaits, `${label} fence maximum wait count`)
    .toBeGreaterThanOrEqual(upload.fenceWaits > 0 ? 1 : 0);
  expect(upload.fenceCreated, `${label} final-entry fence count`).toBeGreaterThanOrEqual(0);
  expect(upload.completed, `${label} upload cannot pass discovered total`)
    .toBeLessThanOrEqual(upload.total);
  expect(upload.queued, `${label} upload queue non-negative`).toBeGreaterThanOrEqual(0);
  expect(upload.objectRefs, `${label} upload refs retain queued items`)
    .toBeGreaterThanOrEqual(upload.queued);
  expect(upload.maxMs, `${label} exact cold in-band draw-item ceiling`)
    .toBeLessThan(MAX_COLD_REPLICA_UPLOAD_MS);
  expect(upload.frameMaxMs, `${label} in-band ordinary frame budget`)
    .toBeLessThan(MAX_COLD_REPLICA_UPLOAD_MS);
  expect(upload.gameplayScenePasses, `${label} in-band submit stays on gameplay scene path`)
    .toBeGreaterThanOrEqual(upload.completed);
  expect(upload.gameplayShadowPasses, `${label} in-band submit uses gameplay shadow path`)
    .toBeGreaterThanOrEqual(upload.completed);
  expect(upload.stateRestores, `${label} in-band submit restores all gameplay state`)
    .toBeGreaterThanOrEqual(upload.completed);
  expect(upload.inBandPasses, `${label} every submit belongs to the ordinary render`)
    .toBeGreaterThanOrEqual(upload.completed);
  expect(upload.extraRenderPasses, `${label} performs no auxiliary renderer pass`).toBe(0);
  expect(upload.compositePasses, `${label} performs no auxiliary composite`).toBe(0);
  expect(upload.compositeStateRestores, `${label} has no composite state to restore`).toBe(0);
  expect(upload.compositeMaxMs, `${label} has no composite timing`).toBe(0);
  expect(upload.gameplayFramebufferPasses, `${label} never switches the gameplay framebuffer`).toBe(0);
  expect(upload.viewportRestores, `${label} never mutates the gameplay viewport`).toBe(0);
  expect(upload.scissorRestores, `${label} never mutates gameplay scissor state`).toBe(0);
  if (upload.completed > 0) {
    expect(upload.programsBefore, `${label} pre-submit begins from warmed shaders`)
      .toBe(initialPrograms);
    expect(upload.programsAfter, `${label} pre-submit creates no shader variant`)
      .toBe(initialPrograms);
  }
  if (previousUpload) {
    expect(upload.total, `${label} discovered upload total is monotonic`)
      .toBeGreaterThanOrEqual(previousUpload.total);
    expect(upload.completed, `${label} completed upload count is monotonic`)
      .toBeGreaterThanOrEqual(previousUpload.completed);
    expect(upload.fenceWaits, `${label} non-blocking fence wait count is monotonic`)
      .toBeGreaterThanOrEqual(previousUpload.fenceWaits);
    expect(upload.fenceMaxWaits, `${label} non-blocking fence maximum is monotonic`)
      .toBeGreaterThanOrEqual(previousUpload.fenceMaxWaits);
    expect(upload.fenceCreated, `${label} final-entry fence count is monotonic`)
      .toBeGreaterThanOrEqual(previousUpload.fenceCreated);
    if (isRafStep) {
      expect(
        upload.completed - previousUpload.completed,
        `${label} pre-submits at most one exact draw item per RAF`
      ).toBeLessThanOrEqual(1);
    }
  }
}

function expectOilBaronUploadSettled(upload, lastKind, label) {
  expect(upload, `${label} upload cleanup`).toMatchObject({
    queued: 0,
    objectRefs: 0,
    pendingCommit: false,
    fencePending: false,
    lastKind,
    sceneRetained: false,
    shadowLightRetained: false,
    error: "",
  });
  expect(upload.total, `${label} performs actual draw-item pre-submits`).toBeGreaterThan(0);
  expect(upload.completed, `${label} commits every draw-item pre-submit`).toBe(upload.total);
  expect(upload.fenceSupported, `${label} uses the WebGL2 GPU-completion fence`).toBe(true);
  expect(upload.fenceWaits, `${label} polls GPU completion without blocking`)
    .toBeGreaterThan(0);
  expect(upload.fenceCreated, `${label} creates one final GPU fence per heavy reveal`)
    .toBeGreaterThan(0);
  expect(upload.inBandPasses, `${label} submits every leaf in an ordinary gameplay render`)
    .toBe(upload.total);
  expect(upload.extraRenderPasses, `${label} performs no extra renderer calls`).toBe(0);
  expect(upload.compositePasses, `${label} performs no final auxiliary composite`).toBe(0);
  expect(upload.compositeStateRestores, `${label} has no auxiliary composite restore`).toBe(0);
  expect(upload.compositeMaxMs, `${label} has no auxiliary composite timing`).toBe(0);
  expect(upload.gameplayScenePasses, `${label} submits leaves through the one gameplay scene render`)
    .toBe(upload.total);
  expect(upload.gameplayShadowPasses, `${label} keeps the ordinary gameplay shadow pass`)
    .toBe(upload.total);
  expect(upload.gameplayFramebufferPasses, `${label} never switches the gameplay framebuffer`).toBe(0);
  expect(upload.stateRestores, `${label} restores every temporarily staged leaf`)
    .toBe(upload.total);
  expect(upload.viewportRestores, `${label} never mutates the gameplay viewport`).toBe(0);
  expect(upload.scissorRestores, `${label} never mutates gameplay scissor state`).toBe(0);
  expect(upload.surfaceActive, `${label} releases in-band submit state`).toBe(false);
  expect(upload.targetRetained, `${label} creates no hidden target`).toBe(false);
  expect(upload.maxMs, `${label} exact in-band draw-item maximum`).toBeGreaterThan(0);
  expect(upload.frameMaxMs, `${label} in-band ordinary frame maximum`).toBeGreaterThan(0);
}

function expectOilBaronFrozenReplicaPosesStayExact(samples, label) {
  const previous = new Map();
  let frozenObserved = 0;
  const record = (kind, item) => {
    if (!item || !item.id || !item.transform) return;
    const key = `${kind}:${item.id}`;
    const signature = JSON.stringify(item.transform);
    const prior = previous.get(key);
    if (item.frozen) {
      frozenObserved += 1;
      if (prior && prior.frozen) {
        expect(signature, `${label} ${key} frozen authored pose`).toBe(prior.signature);
      }
    }
    previous.set(key, { frozen: Boolean(item.frozen), signature });
  };
  for (const sample of samples) {
    const fidelity = sample && sample.fidelity;
    if (!fidelity) continue;
    for (const derrick of fidelity.derricks && fidelity.derricks.poses || []) record("derrick", derrick);
    for (const oilDouble of fidelity.doubles || []) record("double", oilDouble);
    for (const chain of fidelity.chains || []) record("chain", chain);
  }
  expect(frozenObserved, `${label} observes queued authored poses`).toBeGreaterThan(0);
}

function expectOilBaronSingleDerrickRevealStarted(record) {
  expect(record.baron.replicaReveal, "isolated Oil Derrick reveal starts staged").toMatchObject({
    collecting: false,
    active: true,
    queued: 1,
    total: 1,
    revealed: 0,
    lastKind: "",
    measureNextRender: false,
    lastRenderMs: 0,
    maxRenderMs: 0,
    upload: {
      completed: 0,
      pendingCommit: false,
      sceneRetained: false,
      error: "",
    },
  });
  expect(record.baron.replicaReveal.upload.total, "isolated Derrick registers every draw item")
    .toBeGreaterThan(0);
  expect(record.baron.replicaReveal.upload.queued, "isolated Derrick upload queue is visible")
    .toBe(record.baron.replicaReveal.upload.total);
  expect(record.baron.replicaReveal.upload.objectRefs, "isolated Derrick retains its upload refs")
    .toBe(record.baron.replicaReveal.upload.total);
}

function expectOilBaronSingleDerrickRevealSettled(run, initial, wire, enemyIds) {
  expect(run.samples.length, "isolated Oil Derrick reveal RAF samples").toBeGreaterThan(1);
  const initialPrograms = initial.rendererPrograms.afterRepeats[
    initial.rendererPrograms.afterRepeats.length - 1
  ];
  let previousReveal = initial.baron.replicaReveal;
  let previousUpload = initial.baron.replicaReveal.upload;
  for (const [index, sample] of run.samples.entries()) {
    expect(sample, `isolated Oil Derrick frame ${index}`).toMatchObject({
      wave: 10,
      waveRemaining: wire.ws[1],
      kind: "oilBaron",
      lastSnapshotSequence: wire.sequence,
      enemyIds,
      boss: { hp: 1340, maxHp: 3240 },
      derrickCount: 4,
      doubleCount: 2,
      chainCount: 1,
    });
    expect(sample.reveal.total, `isolated Oil Derrick reveal total ${index}`).toBe(1);
    expect(
      sample.reveal.queued + sample.reveal.revealed,
      `isolated Oil Derrick reveal accounting ${index}`
    ).toBe(1);
    expect(sample.reveal.revealed, `isolated Oil Derrick reveal monotonic ${index}`)
      .toBeGreaterThanOrEqual(previousReveal.revealed);
    if (index > 0) {
      expect(
        sample.reveal.revealed - previousReveal.revealed,
        `isolated Oil Derrick admits at most one component per RAF ${index}`
      ).toBeLessThanOrEqual(1);
    }
    expectOilBaronUploadSampleHealthy(
      sample.reveal.upload,
      previousUpload,
      initialPrograms,
      `isolated Oil Derrick frame ${index}`,
      index > 0
    );
    expect(sample.rendererPrograms, `isolated Oil Derrick shader growth ${index}`)
      .toBeLessThanOrEqual(initialPrograms);
    expect(sample.dynamicObjects, `isolated Oil Derrick dynamic object growth ${index}`)
      // Expanding the mock guest's relevance window can lazily admit one
      // already-authoritative enemy/player visual bundle on the first RAF.
      // The Oil Derrick itself is already present in the apply baseline.
      .toBeLessThanOrEqual(initial.dynamicObjects + 64);
    expect(sample.effectObjects, `isolated Oil Derrick effect object growth ${index}`)
      .toBeLessThanOrEqual(initial.effectObjects);
    previousReveal = sample.reveal;
    previousUpload = sample.reveal.upload;
  }
  expect(run.settled.reveal, "isolated Oil Derrick reveal settles completely").toMatchObject({
    collecting: false,
    active: false,
    queued: 0,
    total: 1,
    revealed: 1,
    lastKind: "derrick",
    lastRenderKind: "derrick",
    measureNextRender: false,
  });
  expect(run.settled.reveal.maxRenderMs, "isolated Oil Derrick staged render measured")
    .toBeGreaterThan(0);
  expectOilBaronUploadSettled(
    run.settled.reveal.upload,
    "derrick",
    "isolated Oil Derrick"
  );
  expect(run.settled.fidelity.derricks, "isolated Derrick retains full visuals").toMatchObject({
    count: 4,
    active: 4,
    networkComplete: true,
    visible: 4,
  });
}

function expectOilBaronDenseRevealSettled(run, initial, wire, enemyIds) {
  expect(run.samples.length, "Oil Baron reveal RAF samples").toBeGreaterThan(1);
  const initialPrograms = initial.rendererPrograms.afterRepeats[
    initial.rendererPrograms.afterRepeats.length - 1
  ];
  let previousReveal = initial.baron.replicaReveal;
  let previousUpload = initial.baron.replicaReveal.upload;
  for (const [index, sample] of run.samples.entries()) {
    expect(sample, `Oil Baron reveal frame ${index}`).toMatchObject({
      wave: 10,
      waveRemaining: wire.ws[1],
      kind: "oilBaron",
      lastSnapshotSequence: wire.sequence,
      enemyIds,
      boss: { hp: 1340, maxHp: 3240 },
      derrickCount: 3,
      doubleCount: 2,
      chainCount: 1,
    });
    expect(sample.reveal, `Oil Baron reveal state ${index}`).toBeTruthy();
    expect(sample.reveal.total, `Oil Baron reveal total ${index}`).toBe(6);
    expect(
      sample.reveal.queued + sample.reveal.revealed,
      `Oil Baron reveal queue accounting ${index}`
    ).toBe(6);
    expect(sample.reveal.revealed, `Oil Baron reveal monotonic ${index}`)
      .toBeGreaterThanOrEqual(previousReveal.revealed);
    if (index > 0) {
      expect(
        sample.reveal.revealed - previousReveal.revealed,
        `Oil Baron reveal admits at most one component per RAF ${index}`
      ).toBeLessThanOrEqual(1);
    }
    expect(sample.reveal.queued, `Oil Baron reveal queue monotonic ${index}`)
      .toBeLessThanOrEqual(previousReveal.queued);
    expect(sample.reveal.maxRenderMs, `Oil Baron reveal frame budget ${index}`)
      .toBeLessThan(MAX_RENDER_MS);
    expect(sample.reveal.maxRenderMs, `Oil Baron reveal render timing monotonic ${index}`)
      .toBeGreaterThanOrEqual(previousReveal.maxRenderMs);
    expectOilBaronUploadSampleHealthy(
      sample.reveal.upload,
      previousUpload,
      initialPrograms,
      `Oil Baron reveal frame ${index}`,
      index > 0
    );
    expect(sample.rendererPrograms, `Oil Baron reveal shader growth ${index}`)
      .toBeLessThanOrEqual(initialPrograms);
    expect(sample.dynamicObjects, `Oil Baron reveal dynamic object growth ${index}`)
      .toBeLessThanOrEqual(initial.dynamicObjects);
    expect(sample.effectObjects, `Oil Baron reveal effect object growth ${index}`)
      .toBeLessThanOrEqual(initial.effectObjects);
    previousReveal = sample.reveal;
    previousUpload = sample.reveal.upload;
  }

  expectOilBaronFrozenReplicaPosesStayExact(run.samples, "Oil Baron dense late join");

  expect(run.settled.reveal, "Oil Baron reveal settles completely").toMatchObject({
    collecting: false,
    active: false,
    queued: 0,
    total: 6,
    revealed: 6,
    lastKind: "double",
    lastRenderKind: "double",
    measureNextRender: false,
  });
  expect(run.settled.reveal.lastRenderMs, "Oil Baron final staged reveal render measured")
    .toBeGreaterThan(0);
  expect(run.settled.reveal.maxRenderMs, "Oil Baron maximum staged reveal render")
    .toBeGreaterThan(0);
  expectOilBaronUploadSettled(
    run.settled.reveal.upload,
    "double",
    "Oil Baron dense late join"
  );

  const fidelity = run.settled.fidelity;
  expect(fidelity.original, "Oil Baron original model keeps full batching").toMatchObject({
    batched: true,
    visualBatches: 9,
    batchSourceCount: 59,
    batchError: "",
  });
  expect(fidelity.original.visibleDrawItems, "Oil Baron original remains visible")
    .toBeGreaterThan(0);
  expect(fidelity.doubles, "both black doubles remain present").toHaveLength(2);
  for (const [index, oilDouble] of fidelity.doubles.entries()) {
    expect(oilDouble, `Oil double ${index + 1} keeps full silhouette`).toMatchObject({
      appearance: "achromatic-black-v1",
      coloredDetailCount: 0,
      shadowCasters: 5,
      shadowBatches: 2,
      visualBatches: 4,
    });
    expect(oilDouble.shadowBatchSourceCount, `Oil double ${index + 1} keeps authored shadow sources`)
      .toBeGreaterThan(0);
    expect(oilDouble.plainBatchSourceCount, `Oil double ${index + 1} keeps authored non-shadow sources`)
      .toBeGreaterThan(0);
    expect(oilDouble.visibleDrawItems, `Oil double ${index + 1} remains visible`)
      .toBeGreaterThan(0);
    expect(oilDouble.batchSourceCount, `Oil double ${index + 1} keeps batched detail`)
      .toBeGreaterThan(0);
    expect(oilDouble.batchSyncCount, `Oil double ${index + 1} resumes batched detail sync`)
      .toBeGreaterThan(1);
    expect(oilDouble.detailInstanceSyncCount, `Oil double ${index + 1} resumes per-frame chain detail sync`)
      .toBeGreaterThan(1);
  }
  expect(fidelity.chains, "debt chain remains present").toHaveLength(1);
  expect(fidelity.chains[0], "debt chain keeps its visible instanced links").toMatchObject({
    revealPending: false,
    groupVisible: true,
    visualVisible: true,
    visibleDrawItems: 1,
    linkDrawCalls: 1,
    accessoriesBatched: true,
  });
  expect(fidelity.chains[0].activeLinks, "debt chain active links").toBeGreaterThan(0);
  expect(fidelity.chainAccessoryBatch, "debt chain accessories stay batched").toMatchObject({
    enabled: true,
    visibleChainCount: 1,
    pendingChainCount: 0,
  });
  expect(fidelity.chainAccessoryBatch.drawCalls, "debt chain accessory batch remains visible")
    .toBeGreaterThan(0);
  expect(fidelity.chainAccessoryBatch.activeInstances, "debt chain accessory instances remain active")
    .toBeGreaterThan(0);
  expect(fidelity.derricks, "all derrick visuals survive staged reveal").toMatchObject({
    count: 3,
    active: 3,
    networkComplete: true,
    visible: 3,
  });
  expect(fidelity.derricks.sampleGraph, "derrick scene graph remains attached").toBeTruthy();
  expect(fidelity.derricks.sampleGraph.objects, "derrick scene graph objects")
    .toBeGreaterThan(0);
  expect(fidelity.derricks.sampleGraph.meshes, "derrick scene graph meshes")
    .toBeGreaterThan(0);
}

function expectOilBaronDeltaRevealSettled(run, initial, wire, enemyIds) {
  expect(run.samples.length, "Oil Baron multi-delta reveal RAF samples").toBeGreaterThan(1);
  const initialPrograms = initial.rendererPrograms.afterRepeats[
    initial.rendererPrograms.afterRepeats.length - 1
  ];
  let previousReveal = initial.baron.replicaReveal;
  let previousUpload = initial.baron.replicaReveal.upload;
  for (const [index, sample] of run.samples.entries()) {
    expect(sample, `Oil Baron multi-delta frame ${index}`).toMatchObject({
      wave: 10,
      waveRemaining: wire.ws[1],
      kind: "oilBaron",
      lastSnapshotSequence: wire.sequence,
      enemyIds,
      boss: { hp: 1340, maxHp: 3240 },
      derrickCount: 7,
      doubleCount: 2,
      chainCount: 2,
    });
    expect(sample.reveal.total, `Oil Baron multi-delta total ${index}`).toBe(4);
    expect(
      sample.reveal.queued + sample.reveal.revealed,
      `Oil Baron multi-delta queue accounting ${index}`
    ).toBe(4);
    expect(sample.reveal.revealed, `Oil Baron multi-delta reveal monotonic ${index}`)
      .toBeGreaterThanOrEqual(previousReveal.revealed);
    if (index > 0) {
      expect(
        sample.reveal.revealed - previousReveal.revealed,
        `Oil Baron multi-delta admits at most one component per RAF ${index}`
      ).toBeLessThanOrEqual(1);
    }
    expect(sample.reveal.queued, `Oil Baron multi-delta queue monotonic ${index}`)
      .toBeLessThanOrEqual(previousReveal.queued);
    expect(sample.reveal.maxRenderMs, `Oil Baron multi-delta frame budget ${index}`)
      .toBeLessThan(MAX_RENDER_MS);
    expectOilBaronUploadSampleHealthy(
      sample.reveal.upload,
      previousUpload,
      initialPrograms,
      `Oil Baron multi-delta frame ${index}`,
      index > 0
    );
    expect(sample.rendererPrograms, `Oil Baron multi-delta shader growth ${index}`)
      .toBeLessThanOrEqual(initialPrograms);
    expect(sample.dynamicObjects, `Oil Baron multi-delta dynamic object growth ${index}`)
      .toBeLessThanOrEqual(initial.dynamicObjects);
    expect(sample.effectObjects, `Oil Baron multi-delta effect object growth ${index}`)
      .toBeLessThanOrEqual(initial.effectObjects);
    previousReveal = sample.reveal;
    previousUpload = sample.reveal.upload;
  }
  expect(run.settled.reveal, "Oil Baron multi-delta reveal settles completely").toMatchObject({
    collecting: false,
    active: false,
    queued: 0,
    total: 4,
    revealed: 4,
    lastKind: "derrick",
    lastRenderKind: "derrick",
    measureNextRender: false,
  });
  expect(run.settled.reveal.maxRenderMs, "Oil Baron multi-delta maximum staged render")
    .toBeGreaterThan(0);
  expectOilBaronUploadSettled(
    run.settled.reveal.upload,
    "derrick",
    "Oil Baron existing-replica delta"
  );
  expect(run.settled.fidelity.derricks, "all delta derricks retain their visuals").toMatchObject({
    count: 7,
    active: 7,
    networkComplete: true,
  });
  expect(run.settled.fidelity.derricks.visible, "delta derrick visibility remains populated")
    .toBeGreaterThan(0);
  expect(run.settled.fidelity.derricks.sampleGraph.objects, "delta derrick graph objects")
    .toBeGreaterThan(0);
  expect(run.settled.fidelity.chains, "both debt chains remain attached").toHaveLength(2);
  for (const [index, chain] of run.settled.fidelity.chains.entries()) {
    expect(chain, `debt chain ${index + 1} remains visible and batched`).toMatchObject({
      revealPending: false,
      groupVisible: true,
      visualVisible: true,
      visibleDrawItems: 1,
      linkDrawCalls: 1,
      accessoriesBatched: true,
    });
    expect(chain.activeLinks, `debt chain ${index + 1} active links`).toBeGreaterThan(0);
  }
  expect(run.settled.fidelity.chainAccessoryBatch, "shared chain accessories remain valid").toMatchObject({
    enabled: true,
    visibleChainCount: 2,
    pendingChainCount: 0,
  });
  expect(run.settled.fidelity.chainAccessoryBatch.drawCalls, "shared chain accessory batch is visible")
    .toBeGreaterThan(0);
  expect(
    run.settled.fidelity.chainAccessoryBatch.activeInstances,
    "both chains retain accessory instances"
  ).toBeGreaterThan(0);
}

test.describe.configure({ mode: "serial" });

for (const bossCase of BOSS_CASES) {
  test(`wave 9 -> ${bossCase.kind} -> wave 11 remains authoritative, bounded, and stale-safe`, async ({ page, context }) => {
    test.setTimeout(bossCase.kind === "oilBaron" ? 600_000 : 420_000);
    const guest = await context.newPage();
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(`host: ${error.message}`));
    guest.on("pageerror", (error) => pageErrors.push(`guest: ${error.message}`));

    try {
      // Host and guest are separate machines in production. Preparing both
      // WebGL contexts concurrently on one test GPU creates artificial shader
      // contention, so finish each client's ordinary pre-wave warmup in turn.
      await startHunt(page);
      await setAutomaticFrameLoopMode(page, "paused");
      // A second concurrently alive WebGL context can need just over twenty
      // seconds for the same one-source-per-frame cleanup. Keep every
      // completion requirement strict while allowing that staged test work to
      // finish before the gameplay measurements begin.
      await startHunt(guest, { prewarmTimeout: 180_000 });
      await setAutomaticFrameLoopMode(guest, "paused");

      const prewarm = await page.evaluate(() => ({
        train: window.__dustAndDeadTest.getGhostTrainVisualBundlePoolDiagnostics(),
        bossFx: window.__dustAndDeadTest.getBossShaderFxPrewarmDiagnostics(),
        bossVisual: window.__dustAndDeadTest.getBossVisualPrewarmDiagnostics(),
      }));
      const guestPrewarm = await guest.evaluate(() => ({
        train: window.__dustAndDeadTest.getGhostTrainVisualBundlePoolDiagnostics(),
        bossFx: window.__dustAndDeadTest.getBossShaderFxPrewarmDiagnostics(),
        bossVisual: window.__dustAndDeadTest.getBossVisualPrewarmDiagnostics(),
      }));
      console.log(`BOSS_PREWARM_DIAGNOSTICS ${JSON.stringify({
        kind: bossCase.kind,
        train: prewarm.train.prewarm,
        bossFx: {
          buildMaxMs: prewarm.bossFx.buildMaxMs,
          compileSubmitMaxMs: prewarm.bossFx.compileSubmitMaxMs,
          compileSteps: prewarm.bossFx.compileSteps,
          pointLightVariants: prewarm.bossFx.pointLightVariants,
          shadowWarmupCompleted: prewarm.bossFx.shadowWarmupCompleted,
          shadowWarmupStage: prewarm.bossFx.shadowWarmupStage,
          shadowWarmupStageCount: prewarm.bossFx.shadowWarmupStageCount,
          shadowWarmupStageMs: prewarm.bossFx.shadowWarmupStageMs,
          shadowWarmupMaxMs: prewarm.bossFx.shadowWarmupMaxMs,
          shadowWarmupProgramsBefore: prewarm.bossFx.shadowWarmupProgramsBefore,
          shadowWarmupProgramsAfter: prewarm.bossFx.shadowWarmupProgramsAfter,
          cleanupActive: prewarm.bossFx.cleanupActive,
          cleanupPhase: prewarm.bossFx.cleanupPhase,
          cleanupSteps: prewarm.bossFx.cleanupSteps,
          cleanupMaxMs: prewarm.bossFx.cleanupMaxMs,
          retainedSources: prewarm.bossFx.retainedSources,
          error: prewarm.bossFx.error,
        },
        bossGeometry: prewarm.bossVisual.geometryGpu,
        guestBossFx: {
          shadowWarmupCompleted: guestPrewarm.bossFx.shadowWarmupCompleted,
          shadowWarmupStage: guestPrewarm.bossFx.shadowWarmupStage,
          shadowWarmupStageCount: guestPrewarm.bossFx.shadowWarmupStageCount,
          shadowWarmupStageMs: guestPrewarm.bossFx.shadowWarmupStageMs,
          shadowWarmupMaxMs: guestPrewarm.bossFx.shadowWarmupMaxMs,
          shadowWarmupProgramsBefore: guestPrewarm.bossFx.shadowWarmupProgramsBefore,
          shadowWarmupProgramsAfter: guestPrewarm.bossFx.shadowWarmupProgramsAfter,
          cleanupActive: guestPrewarm.bossFx.cleanupActive,
          cleanupPhase: guestPrewarm.bossFx.cleanupPhase,
          cleanupSteps: guestPrewarm.bossFx.cleanupSteps,
          cleanupMaxMs: guestPrewarm.bossFx.cleanupMaxMs,
          retainedSources: guestPrewarm.bossFx.retainedSources,
          error: guestPrewarm.bossFx.error,
        },
        guestBossGeometry: guestPrewarm.bossVisual.geometryGpu,
      })}`);
      expect(prewarm.train.prewarm).toMatchObject({
        completed: true,
        gpuReady: true,
        gpuPending: false,
        gpuCompileError: "",
        gpuUploadComplete: true,
        gpuUploadError: "",
        gpuUploadTarget: "private-1x1",
      });
      expect(prewarm.train.prewarm.gpuUploadPasses, "Ghost Train authored GPU upload passes")
        .toBe(prewarm.train.prewarm.gpuUploadTotal);
      expect(prewarm.train.prewarm.gpuUploadMaxMs, "Ghost Train staged 1px GPU upload slice")
        .toBeLessThan(MAX_FIRST_CROSS_CONTEXT_RENDER_MS);
      expect(prewarm.train.prewarm.stageMs[0], "Ghost Train one-time menu material setup")
        .toBeLessThan(MAX_RENDER_MS);
      expect(
        Math.max(0, ...prewarm.train.prewarm.stageMs.slice(1)),
        "Ghost Train in-play staged prewarm slice"
      ).toBeLessThan(MAX_PREWARM_SLICE_MS);
      expect(prewarm.bossFx).toMatchObject({
        pending: false,
        completed: true,
        shadowWarmupCompleted: true,
        cleanupActive: false,
        cleanupPhase: "done",
        cleanupSettleFramesRemaining: 0,
        retainedSources: 0,
        error: "",
      });
      expect(prewarm.bossFx.buildMaxMs, "Bell/Oil staged build slice")
        .toBeLessThan(MAX_PREWARM_SLICE_MS);
      expect(prewarm.bossFx.compileSubmitMaxMs, "Bell/Oil shader submit slice")
        .toBeLessThan(MAX_PREWARM_SLICE_MS);
      expect(prewarm.bossFx.shadowWarmupMaxMs, "Oil Baron batched-shadow warmup slice")
        .toBeLessThan(MAX_GPU_PREWARM_SLICE_MS);
      expect(prewarm.bossFx.shadowWarmupStageCount, "Oil Baron exact GPU warmup stage count")
        .toBeGreaterThan(2);
      expect(prewarm.bossFx.shadowWarmupStage, "Oil Baron completed every exact GPU warmup stage")
        .toBe(prewarm.bossFx.shadowWarmupStageCount);
      expect(prewarm.bossFx.shadowWarmupStageMs, "Oil Baron exact GPU warmup samples")
        .toHaveLength(prewarm.bossFx.shadowWarmupStageCount);
      for (const [index, sample] of prewarm.bossFx.shadowWarmupStageMs.entries()) {
        expect(sample, `Oil Baron GPU warmup stage ${index + 1}`)
          .toBeLessThan(MAX_GPU_PREWARM_SLICE_MS);
      }
      expect(
        prewarm.bossFx.shadowWarmupProgramsAfter,
        "Oil Baron batched-shadow warmup retains the compiled variant"
      ).toBeGreaterThanOrEqual(prewarm.bossFx.shadowWarmupProgramsBefore);
      expect(prewarm.bossFx.cleanupMaxMs, "Bell/Oil staged cleanup slice")
        .toBeLessThan(MAX_PREWARM_SLICE_MS);
      expect(prewarm.bossVisual.geometryGpu, "Host authored boss geometry prewarm").toMatchObject({
        completed: true,
        pending: false,
        error: "",
      });
      expect(guestPrewarm.train.prewarm).toMatchObject({
        completed: true,
        gpuReady: true,
        gpuPending: false,
        gpuCompileError: "",
        gpuUploadComplete: true,
        gpuUploadError: "",
        gpuUploadTarget: "private-1x1",
      });
      expect(guestPrewarm.train.prewarm.gpuUploadPasses, "Guest Ghost Train authored GPU upload passes")
        .toBe(guestPrewarm.train.prewarm.gpuUploadTotal);
      expect(guestPrewarm.train.prewarm.gpuUploadMaxMs, "Guest Ghost Train staged 1px GPU upload slice")
        .toBeLessThan(MAX_FIRST_CROSS_CONTEXT_RENDER_MS);
      expect(guestPrewarm.train.prewarm.maxMs, "Guest Ghost Train cross-context prewarm slice")
        .toBeLessThan(MAX_FIRST_CROSS_CONTEXT_RENDER_MS);
      expect(guestPrewarm.bossFx).toMatchObject({
        pending: false,
        completed: true,
        shadowWarmupCompleted: true,
        cleanupActive: false,
        cleanupPhase: "done",
        cleanupSettleFramesRemaining: 0,
        retainedSources: 0,
        error: "",
      });
      expect(guestPrewarm.bossVisual.geometryGpu, "Guest authored boss geometry prewarm").toMatchObject({
        completed: true,
        pending: false,
        error: "",
      });
      expect(guestPrewarm.bossFx.buildMaxMs, "Guest Bell/Oil staged build slice")
        .toBeLessThan(MAX_PREWARM_SLICE_MS);
      expect(guestPrewarm.bossFx.compileSubmitMaxMs, "Guest Bell/Oil cross-context shader submit slice")
        .toBeLessThan(MAX_FIRST_CROSS_CONTEXT_RENDER_MS);
      expect(guestPrewarm.bossFx.shadowWarmupMaxMs, "Guest Oil Baron cross-context batched-shadow warmup")
        .toBeLessThan(MAX_FIRST_CROSS_CONTEXT_RENDER_MS);
      expect(guestPrewarm.bossFx.shadowWarmupStageCount, "Guest Oil Baron exact GPU warmup stage count")
        .toBeGreaterThan(2);
      expect(guestPrewarm.bossFx.shadowWarmupStage, "Guest Oil Baron completed every exact GPU warmup stage")
        .toBe(guestPrewarm.bossFx.shadowWarmupStageCount);
      expect(guestPrewarm.bossFx.shadowWarmupStageMs, "Guest Oil Baron exact GPU warmup samples")
        .toHaveLength(guestPrewarm.bossFx.shadowWarmupStageCount);
      for (const [index, sample] of guestPrewarm.bossFx.shadowWarmupStageMs.entries()) {
        expect(sample, `Guest Oil Baron GPU warmup stage ${index + 1}`)
          .toBeLessThan(MAX_FIRST_CROSS_CONTEXT_RENDER_MS);
      }
      expect(
        guestPrewarm.bossFx.shadowWarmupProgramsAfter,
        "Guest Oil Baron batched-shadow warmup retains the compiled variant"
      ).toBeGreaterThanOrEqual(guestPrewarm.bossFx.shadowWarmupProgramsBefore);
      expect(guestPrewarm.bossFx.cleanupMaxMs, "Guest Bell/Oil staged cleanup slice")
        .toBeLessThan(MAX_PREWARM_SLICE_MS);

      const wave9Host = await page.evaluate(({ waveEnemyCount, scopedVisibleCount }) => {
        const game = window.__dustAndDeadTest;
        const multiplayer = window.__dustMultiplayerTest;
        multiplayer.startMockHost(["Host", "Guest"]);
        multiplayer.setPlayerPosition("mock-player-1", -18, 8);
        multiplayer.setPlayerPosition("mock-player-2", -18, 8);
        // Report a deterministic client camera. The headless host viewport can
        // otherwise be wide enough to cover the stress points and accidentally
        // turn this into a full-world replication test.
        multiplayer.injectInput("mock-player-2", {
          sequence: 1,
          view: [-14, 14, -18, 18],
        });
        const wave = game.forceWaveState(9, 0, 0);
        const enemyTypes = ["walker", "runner", "brute", "spitter"];
        for (let index = 0; index < waveEnemyCount; index += 1) {
          const nearViewer = index < scopedVisibleCount;
          const farIndex = index - scopedVisibleCount;
          const x = nearViewer
            ? -18 + (index % 3 - 1) * 4
            : 217 + (farIndex % 2) * 3;
          const z = nearViewer
            ? 8 + (Math.floor(index / 3) - 0.5) * 4
            : 120 + Math.floor(farIndex / 4) * 12;
          multiplayer.spawnEnemyAt(x, z, enemyTypes[index % enemyTypes.length]);
        }
        const field = {
          added: waveEnemyCount,
          active: multiplayer.getAuthoritativeEnemies().length,
        };
        return { wave, field };
      }, { waveEnemyCount: WAVE_9_ENEMIES, scopedVisibleCount: SCOPED_VISIBLE_ENEMIES });
      expect(wave9Host.wave).toMatchObject({ wave: 9, wave10BossKind: "", live: 0, spawnLeft: 0 });
      expect(wave9Host.field).toMatchObject({ added: WAVE_9_ENEMIES, active: WAVE_9_ENEMIES });

      const wave9Ids = await readHostEnemyIds(page);
      const wave9Wire = await buildHostWire(page);
      expect(wave9Wire.wire).toMatchObject({ wave: 9, bossState: null });
      expect(wave9Wire.wire.totalEnemies, `${bossCase.kind} wave 9 authoritative total`)
        .toBe(WAVE_9_ENEMIES);
      const wave9ScopedCount = wave9Wire.wire.enemyDelta && wave9Wire.wire.enemyDelta.n;
      const wave9DeliveredCount = wave9Wire.wire.enemyDelta && wave9Wire.wire.enemyDelta.k
        ? wave9Wire.wire.enemyDelta.c
        : wave9ScopedCount;
      expect(wave9ScopedCount, `${bossCase.kind} wave 9 encoded scope count`).toBeGreaterThan(0);
      expect(wave9ScopedCount, `${bossCase.kind} wave 9 encoded scope is partial`)
        .toBeLessThan(wave9Wire.wire.totalEnemies);
      expectPacketHealthy(wave9Wire, `${bossCase.kind} wave 9`);

      await guest.evaluate(() => window.__dustMultiplayerTest.startMockGuest(["Host", "Guest"], 1));
      const wave9Guest = await applyGuestWire(guest, wave9Wire.wire);
      expectGuestFrameHealthy(wave9Guest, `${bossCase.kind} wave 9`);
      expect(wave9Guest).toMatchObject({
        wave: 9,
        kind: "",
        // A non-instanced bootstrap deliberately stages at most 18 models in
        // one frame. `n` is the complete scoped membership; `c` is what this
        // first keyframe chunk can reveal without a visible upload spike.
        enemyCount: wave9DeliveredCount,
      });
      expect(wave9Guest.enemyCount, `${bossCase.kind} wave 9 scoped replica count`)
        .toBeLessThan(wave9Wire.wire.totalEnemies);
      expect(wave9Guest.enemyIds.every((id) => wave9Ids.includes(id)), `${bossCase.kind} wave 9 scoped ids`)
        .toBe(true);
      expectRemotePlayerSynchronized(wave9Guest, wave9Wire, `${bossCase.kind} wave 9`);
      expectWaveProgressSynchronized(wave9Guest, wave9Wire.wire, `${bossCase.kind} wave 9`);
      expect(wave9Guest.bell.active).toBe(false);
      expect(wave9Guest.train.active).toBe(false);
      expect(wave9Guest.baron).toBeNull();
      expect(wave9Guest.sloth.active).toBe(false);
      await acknowledgeHostWire(page, wave9Wire.wire);

      // Real guests ACK every enemy-keyframe chunk through their 30 Hz input
      // stream. Complete that exchange before advancing eight simulated
      // seconds to the boss wave; otherwise this synthetic test skips the ACK
      // traffic and intentionally strands the guest on chunk one.
      let wave9TransferWire = wave9Wire;
      let wave9SettledGuest = wave9Guest;
      for (let guard = 0; guard < 8 && wave9TransferWire.wire.enemyDelta?.k && !wave9TransferWire.wire.enemyDelta.f; guard += 1) {
        wave9TransferWire = await buildHostWire(page);
        expectPacketHealthy(wave9TransferWire, `${bossCase.kind} wave 9 chunk ${guard + 2}`);
        wave9SettledGuest = await applyGuestWire(guest, wave9TransferWire.wire);
        expectGuestFrameHealthy(wave9SettledGuest, `${bossCase.kind} wave 9 chunk ${guard + 2}`);
        await acknowledgeHostWire(page, wave9TransferWire.wire);
      }
      expect(wave9SettledGuest.enemyCount, `${bossCase.kind} complete wave 9 scoped replica count`)
        .toBe(wave9ScopedCount);
      const wave9AfterRaf = await readGuestAfterAnimationFrames(guest, 4);
      expect(wave9AfterRaf).toMatchObject({
        wave: 9,
        waveRemaining: wave9Wire.wire.ws[1],
        enemyCount: wave9SettledGuest.enemyCount,
        enemyIds: wave9SettledGuest.enemyIds,
      });

      // Production peers render in independent foreground contexts. The test's
      // two tabs share one software GPU, so restore the host's ordinary wave-9
      // context before timing boss-specific uploads instead of charging an
      // artificial whole-context swap to the Train's first frame.
      await restoreForegroundRenderContext(page, guest);

      const entered = await page.evaluate((kind) => {
        const game = window.__dustAndDeadTest;
        const multiplayer = window.__dustMultiplayerTest;
        game.forceWaveState(9, 0, 0);
        game.setWave10BossOverride(kind);
        const startedAt = performance.now();
        const transition = game.advanceWaveProgress(8000);
        const transitionMs = performance.now() - startedAt;
        game.setWave10BossOverride("random");
        multiplayer.setPlayerPosition("mock-player-1", 14, -9);
        multiplayer.setPlayerPosition("mock-player-2", 14, -9);
        let oilSetup = null;
        if (kind === "oilBaron") {
          game.setOilBaronAiEnabled(false);
          game.damageOilBaron(1900, true, "mock-player-1");
          game.spawnOilDerrickBatch([
            { x: -6, z: -9 },
            { x: 14, z: -9 },
            { x: 34, z: -9 },
          ]);
          const doublesStarted = Boolean(game.forceOilBaronAction("doubles"));
          game.advanceOilBaron(1800);
          const chainStarted = Boolean(game.forceOilBaronDebtChainForPlayer("mock-player-2"));
          const baron = game.getOilBaronDiagnostics();
          oilSetup = {
            doublesStarted,
            chainStarted,
            hp: baron && baron.boss ? baron.boss.hp : 0,
            derrickCount: baron ? baron.derrickCount : 0,
            doubleCount: baron && baron.oilDoubles ? baron.oilDoubles.count : 0,
            chainCount: baron && baron.debtChains ? baron.debtChains.count : 0,
          };
        }
        const field = multiplayer.spawnEnemyStressField(12, "visible");
        const firstRenderStartedAt = performance.now();
        const firstRenderProfile = game.profileNextRenderForTest();
        const firstRenderMs = performance.now() - firstRenderStartedAt;
        const repeatRenderStartedAt = performance.now();
        game.renderNowForTest();
        const repeatRenderMs = performance.now() - repeatRenderStartedAt;
        return {
          transition,
          transitionMs,
          firstRenderMs,
          firstRenderProfile,
          repeatRenderMs,
          field,
          oilSetup,
        };
      }, bossCase.kind);
      expect(entered.transition.wave).toBe(10);
      expect(entered.transitionMs, `${bossCase.kind} host wave 10 transition`).toBeLessThan(MAX_TRANSITION_MS);
      console.log(`BOSS_HOST_FIRST_RENDER ${JSON.stringify({
        kind: bossCase.kind,
        measuredMs: Number(entered.firstRenderMs.toFixed(2)),
        phases: entered.firstRenderProfile,
      })}`);
      expect(entered.firstRenderProfile, `${bossCase.kind} host first-render phase profile`).toBeTruthy();
      expect(entered.firstRenderProfile.error, `${bossCase.kind} host first-render error`).toBe("");
      expect(entered.firstRenderMs, `${bossCase.kind} host first cross-context boss render`)
        .toBeLessThan(MAX_FIRST_CROSS_CONTEXT_RENDER_MS);
      expect(entered.firstRenderProfile.totalMs, `${bossCase.kind} profiled host first render`)
        .toBeLessThan(MAX_FIRST_CROSS_CONTEXT_RENDER_MS);
      expect(entered.repeatRenderMs, `${bossCase.kind} host repeat boss render`).toBeLessThan(MAX_RENDER_MS);
      expect(entered.field).toMatchObject({ added: BOSS_WAVE_ENEMIES, active: BOSS_WAVE_ENEMIES });
      if (bossCase.kind === "oilBaron") {
        expect(entered.oilSetup, "Oil Baron network structure setup").toMatchObject({
          doublesStarted: true,
          chainStarted: true,
          hp: bossCase.expectedHp,
          derrickCount: 3,
          doubleCount: 2,
          chainCount: 1,
        });
      } else {
        expect(entered.oilSetup).toBeNull();
      }

      const bossWaveIds = await readHostEnemyIds(page);
      const activeWire = await buildHostWire(page);
      const decodedBoss = await page.evaluate((wire) => (
        window.__dustMultiplayerTest.decodeBossState(wire.bossState)
      ), activeWire.wire);
      expect(activeWire.wire.wave).toBe(10);
      expect(decodedBoss).toMatchObject({ kind: bossCase.kind });
      if (bossCase.expectedMaxHp != null) {
        expect(decodedBoss).toMatchObject({
          hp: bossCase.expectedHp || bossCase.expectedMaxHp,
          maxHp: bossCase.expectedMaxHp,
        });
      } else {
        expect(decodedBoss.hp).toBeGreaterThan(0);
        expect(decodedBoss.hp).toBe(decodedBoss.maxHp);
      }
      expectPacketHealthy(activeWire, `${bossCase.kind} active`);

      await restoreForegroundRenderContext(guest, page);
      const activeGuest = await applyGuestWire(guest, activeWire.wire);
      expectGuestFrameHealthy(activeGuest, `${bossCase.kind} active`);
      expect(activeGuest).toMatchObject({
        wave: 10,
        kind: bossCase.kind,
        enemyCount: BOSS_WAVE_ENEMIES,
        enemyIds: bossWaveIds,
      });
      expectRemotePlayerSynchronized(activeGuest, activeWire, `${bossCase.kind} active`);
      expectWaveProgressSynchronized(activeGuest, activeWire.wire, `${bossCase.kind} active`);
      bossCase.assertStructure(activeGuest);
      let oilRevealRun = null;
      if (bossCase.kind === "oilBaron") {
        // The full gameplay snapshot is authoritative at once, but the six
        // detailed component uploads are serialized over displayed frames.
        // Verify both halves of that contract and the exact full-fidelity end
        // state so this optimization can never silently turn into an LOD cut.
        expectOilBaronDenseRevealStarted(activeGuest);
        oilRevealRun = await waitForOilBaronReplicaReveal(guest);
        logOilBaronRevealSummary("OIL_BARON_REPLICA_REVEAL", oilRevealRun);
        expectOilBaronDenseRevealSettled(
          oilRevealRun,
          activeGuest,
          activeWire.wire,
          bossWaveIds
        );
      }

      const staleWave9 = await applyGuestWire(guest, wave9Wire.wire);
      expect(staleWave9).toMatchObject({
        wave: 10,
        kind: bossCase.kind,
        lastSnapshotSequence: activeWire.wire.sequence,
        enemyIds: bossWaveIds,
      });
      bossCase.assertStructure(staleWave9);
      await acknowledgeHostWire(page, activeWire.wire);

      let oilSingleDelta = null;
      let oilDeltaRevealRun = null;
      if (bossCase.kind === "oilBaron") {
        const singleDeltaSetup = await page.evaluate(() => {
          const game = window.__dustAndDeadTest;
          const multiplayer = window.__dustMultiplayerTest;
          multiplayer.injectInput("mock-player-2", {
            sequence: 2,
            // Report the largest protocol-valid 96 m view. The previous
            // 120 m synthetic rect was correctly rejected by input validation.
            view: [-48, 48, -48, 48],
          });
          // The host RAF is parked while the guest owns the shared test GPU.
          // Consume the queued relevance view through one real host update
          // without submitting another WebGL frame.
          game.advanceRealFrame(17, { render: false });
          game.spawnOilDerrickBatch([{ x: 14, z: 11 }]);
          const baron = game.getOilBaronDiagnostics();
          return {
            derrickCount: baron.derrickCount,
            chainCount: baron.debtChains.count,
          };
        });
        expect(singleDeltaSetup, "single Oil Derrick host delta").toEqual({
          derrickCount: 4,
          chainCount: 1,
        });
        const singleDeltaWire = await buildHostWire(page);
        const singleDeltaBoss = await page.evaluate((wire) => (
          window.__dustMultiplayerTest.decodeBossState(wire.bossState)
        ), singleDeltaWire.wire);
        expect(singleDeltaBoss.derricks, "single Oil Derrick encoded delta").toHaveLength(4);
        expect(singleDeltaBoss.debtChains, "single Oil Derrick keeps existing chain").toHaveLength(1);
        expectPacketHealthy(singleDeltaWire, "oilBaron single derrick delta");
        await restoreForegroundRenderContext(guest, page);
        const singleDeltaGuest = await applyGuestWire(guest, singleDeltaWire.wire);
        expectGuestFrameHealthy(
          singleDeltaGuest,
          "oilBaron single derrick delta",
          MAX_COLD_REPLICA_UPLOAD_MS,
          60
        );
        expect(singleDeltaGuest.baron, "single new derrick gameplay state is authoritative immediately").toMatchObject({
          hp: 1340,
          maxHp: 3240,
          derrickCount: 4,
          doubleCount: 2,
          chainCount: 1,
        });
        expectOilBaronSingleDerrickRevealStarted(singleDeltaGuest);
        const singleDeltaRevealRun = await waitForOilBaronReplicaReveal(guest);
        logOilBaronRevealSummary("OIL_BARON_SINGLE_DERRICK_REVEAL", singleDeltaRevealRun);
        expectOilBaronSingleDerrickRevealSettled(
          singleDeltaRevealRun,
          singleDeltaGuest,
          singleDeltaWire.wire,
          singleDeltaGuest.enemyIds
        );
        oilSingleDelta = {
          wire: singleDeltaWire,
          guest: singleDeltaGuest,
          reveal: singleDeltaRevealRun,
        };
        await acknowledgeHostWire(page, singleDeltaWire.wire);

        const multiDeltaSetup = await page.evaluate(() => {
          const game = window.__dustAndDeadTest;
          game.spawnOilDerrickBatch([
            { x: -6, z: 11 },
            { x: 34, z: 11 },
            { x: 14, z: 31 },
          ]);
          const secondChainStarted = Boolean(game.forceOilBaronDebtChainForPlayer("mock-player-1"));
          const baron = game.getOilBaronDiagnostics();
          return {
            secondChainStarted,
            derrickCount: baron.derrickCount,
            chainCount: baron.debtChains.count,
          };
        });
        expect(multiDeltaSetup, "multi-component Oil Baron host delta").toEqual({
          secondChainStarted: true,
          derrickCount: 7,
          chainCount: 2,
        });
        const multiDeltaWire = await buildHostWire(page);
        const multiDeltaBoss = await page.evaluate((wire) => (
          window.__dustMultiplayerTest.decodeBossState(wire.bossState)
        ), multiDeltaWire.wire);
        expect(multiDeltaBoss.derricks, "multi Oil Derrick encoded delta").toHaveLength(7);
        expect(multiDeltaBoss.debtChains, "two simultaneous debt chains encoded").toHaveLength(2);
        expectPacketHealthy(multiDeltaWire, "oilBaron multi-component delta");
        await restoreForegroundRenderContext(guest, page);
        const multiDeltaGuest = await applyGuestWire(guest, multiDeltaWire.wire);
        expectGuestFrameHealthy(
          multiDeltaGuest,
          "oilBaron multi-component delta",
          MAX_COLD_REPLICA_UPLOAD_MS,
          60
        );
        expect(multiDeltaGuest.baron, "multi-component Oil delta is authoritative immediately")
          .toMatchObject({
            hp: 1340,
            maxHp: 3240,
            derrickCount: 7,
            doubleCount: 2,
            chainCount: 2,
            replicaReveal: {
              collecting: false,
              active: true,
              queued: 4,
              total: 4,
              revealed: 0,
              measureNextRender: false,
              upload: {
                completed: 0,
                pendingCommit: false,
                sceneRetained: false,
                error: "",
              },
            },
          });
        expect(
          multiDeltaGuest.baron.replicaReveal.upload.total,
          "new chain upload work is registered synchronously"
        ).toBeGreaterThan(0);
        expect(
          multiDeltaGuest.baron.replicaReveal.upload.queued,
          "new chain upload queue is visible immediately"
        ).toBeGreaterThan(0);
        expect(
          multiDeltaGuest.baron.replicaReveal.upload.queued,
          "new chain upload queue stays within total"
        ).toBeLessThanOrEqual(multiDeltaGuest.baron.replicaReveal.upload.total);
        expect(
          multiDeltaGuest.baron.replicaReveal.upload.objectRefs,
          "new chain upload refs are retained until commit"
        ).toBeGreaterThanOrEqual(multiDeltaGuest.baron.replicaReveal.upload.queued);
        const originalChainId = oilRevealRun.settled.fidelity.chains[0].id;
        const existingChainDuringDelta = multiDeltaGuest.baron.chainVisuals.find(
          (chain) => chain.id === originalChainId
        );
        const pendingChainDuringDelta = multiDeltaGuest.baron.chainVisuals.find(
          (chain) => chain.id !== originalChainId
        );
        expect(existingChainDuringDelta, "existing chain stays visible during the new chain upload")
          .toMatchObject({
            revealPending: false,
            groupVisible: true,
            visualVisible: true,
            visibleDrawItems: 1,
            linkDrawCalls: 1,
            accessoriesBatched: true,
          });
        expect(existingChainDuringDelta.activeLinks, "existing chain links stay active during staging")
          .toBeGreaterThan(0);
        expect(pendingChainDuringDelta, "new chain gameplay state exists before visual reveal")
          .toBeTruthy();
        expect(pendingChainDuringDelta.activeLinks, "pending chain already has authoritative links")
          .toBeGreaterThan(0);
        expect(pendingChainDuringDelta, "new chain visuals remain pending atomically").toMatchObject({
          revealPending: true,
          groupVisible: false,
          visualVisible: false,
          visibleDrawItems: 0,
          linkDrawCalls: 0,
          accessoriesBatched: true,
        });
        expect(
          multiDeltaGuest.baron.chainAccessoryBatch.activeInstances,
          "pending chain accessories are excluded while old accessories remain"
        ).toBe(oilRevealRun.settled.fidelity.chainAccessoryBatch.activeInstances);
        expect(
          multiDeltaGuest.baron.chainAccessoryBatch,
          "shared accessory batch distinguishes visible and pending chains"
        ).toMatchObject({
          visibleChainCount: 1,
          pendingChainCount: 1,
        });
        expect(
          multiDeltaGuest.baron.chainAccessoryBatch.drawCalls,
          "existing chain accessory batch stays visible during staging"
        ).toBeGreaterThan(0);
        oilDeltaRevealRun = await waitForOilBaronReplicaReveal(guest);
        logOilBaronRevealSummary("OIL_BARON_DELTA_REVEAL", oilDeltaRevealRun);
        expectOilBaronDeltaRevealSettled(
          oilDeltaRevealRun,
          multiDeltaGuest,
          multiDeltaWire.wire,
          multiDeltaGuest.enemyIds
        );
        expect(
          oilDeltaRevealRun.settled.fidelity.chainAccessoryBatch.activeInstances,
          "second chain adds accessory instances without orphaning the first chain"
        ).toBeGreaterThan(oilRevealRun.settled.fidelity.chainAccessoryBatch.activeInstances);
        await acknowledgeHostWire(page, multiDeltaWire.wire);
        await page.evaluate(() => {
          window.__dustMultiplayerTest.injectInput("mock-player-2", {
            sequence: 3,
            view: [-14, 14, -18, 18],
          });
          window.__dustAndDeadTest.advanceRealFrame(17, { render: false });
        });
      }

      const defeated = await page.evaluate(() => {
        const game = window.__dustAndDeadTest;
        const startedAt = performance.now();
        const result = game.forceActiveBossDefeat(true);
        return { result, defeatMs: performance.now() - startedAt };
      });
      expect(defeated.result).toBe(true);
      expect(defeated.defeatMs, `${bossCase.kind} host defeat`).toBeLessThan(MAX_TRANSITION_MS);

      const deathWire = await buildHostWire(page);
      expect(deathWire.wire.wave).toBe(10);
      expect(await page.evaluate((wire) => (
        window.__dustMultiplayerTest.decodeBossState(wire.bossState)
      ), deathWire.wire)).toMatchObject({
        kind: bossCase.kind,
        active: false,
        defeated: true,
        hp: 0,
      });
      expectPacketHealthy(deathWire, `${bossCase.kind} death`);
      const deathGuest = await applyGuestWire(guest, deathWire.wire);
      expectGuestFrameHealthy(deathGuest, `${bossCase.kind} death`);
      expect(deathGuest).toMatchObject({ wave: 10, kind: bossCase.kind });
      expectWaveProgressSynchronized(deathGuest, deathWire.wire, `${bossCase.kind} death`);
      if (bossCase.kind === "bellRinger") {
        expect(deathGuest.bell).toMatchObject({ active: false, replica: true, defeated: true, hp: 0 });
      } else if (bossCase.kind === "ghostTrain") {
        expect(deathGuest.train).toMatchObject({ active: false, replica: true, defeated: true, hp: 0 });
      } else if (bossCase.kind === "slothArchbishop") {
        expect(deathGuest.sloth).toMatchObject({ active: false, replica: true, defeated: true, hp: 0 });
      } else {
        expect(deathGuest.baron).toMatchObject({
          active: false,
          replica: true,
          defeated: true,
          hp: 0,
          replicaReveal: {
            collecting: false,
            active: false,
            queued: 0,
            measureNextRender: false,
            upload: {
              queued: 0,
              objectRefs: 0,
              pendingCommit: false,
              sceneRetained: false,
              error: "",
            },
          },
        });
      }
      await acknowledgeHostWire(page, deathWire.wire);

      const exited = await page.evaluate(({ waveEnemyCount, scopedVisibleCount }) => {
        const game = window.__dustAndDeadTest;
        const multiplayer = window.__dustMultiplayerTest;
        const startedAt = performance.now();
        const transition = game.advanceWaveProgress(8000);
        const transitionMs = performance.now() - startedAt;
        multiplayer.setPlayerPosition("mock-player-1", -4, 19);
        multiplayer.setPlayerPosition("mock-player-2", -4, 19);
        const enemyTypes = ["walker", "runner", "brute", "spitter"];
        for (let index = 0; index < waveEnemyCount; index += 1) {
          const nearViewer = index < scopedVisibleCount;
          const farIndex = index - scopedVisibleCount;
          const x = nearViewer
            ? -4 + (index % 3 - 1) * 4
            : 217 + (farIndex % 2) * 3;
          const z = nearViewer
            ? 19 + (Math.floor(index / 3) - 0.5) * 4
            : 120 + Math.floor(farIndex / 4) * 12;
          multiplayer.spawnEnemyAt(x, z, enemyTypes[index % enemyTypes.length]);
        }
        const field = {
          added: waveEnemyCount,
          active: multiplayer.getAuthoritativeEnemies().length,
        };
        return { transition, transitionMs, field };
      }, { waveEnemyCount: WAVE_11_ENEMIES, scopedVisibleCount: SCOPED_VISIBLE_ENEMIES });
      expect(exited.transition.wave).toBe(11);
      expect(exited.transitionMs, `${bossCase.kind} host wave 11 transition`).toBeLessThan(MAX_TRANSITION_MS);
      expect(exited.field).toMatchObject({ added: WAVE_11_ENEMIES, active: WAVE_11_ENEMIES });

      const wave11Ids = await readHostEnemyIds(page);
      const wave11Wire = await buildHostWire(page);
      expect(wave11Wire.wire.wave).toBe(11);
      const wave11Scout = await page.evaluate((wire) => (
        window.__dustMultiplayerTest.decodeBossState(wire.bossState)
      ), wave11Wire.wire);
      expect(wave11Scout).toMatchObject({
        kind: "doppelganger",
        phase: "scout",
        sourceBossWave: 10,
        dueBossWave: 15,
        hitsRemaining: 4,
      });
      expect(wave11Wire.wire.totalEnemies, `${bossCase.kind} wave 11 authoritative total`)
        .toBe(WAVE_11_ENEMIES);
      const wave11ScopedCount = wave11Wire.wire.enemyDelta && wave11Wire.wire.enemyDelta.n;
      expect(wave11ScopedCount, `${bossCase.kind} wave 11 encoded scope count`).toBeGreaterThan(0);
      expect(wave11ScopedCount, `${bossCase.kind} wave 11 encoded scope is partial`)
        .toBeLessThan(wave11Wire.wire.totalEnemies);
      expectPacketHealthy(wave11Wire, `${bossCase.kind} wave 11`);
      const wave11Guest = await applyGuestWire(guest, wave11Wire.wire);
      expectGuestFrameHealthy(wave11Guest, `${bossCase.kind} wave 11`);
      expect(wave11Guest).toMatchObject({
        wave: 11,
        kind: "",
        enemyCount: wave11ScopedCount,
      });
      expect(wave11Guest.enemyCount, `${bossCase.kind} wave 11 scoped replica count`)
        .toBeLessThan(wave11Wire.wire.totalEnemies);
      expect(wave11Guest.enemyIds.every((id) => wave11Ids.includes(id)), `${bossCase.kind} wave 11 scoped ids`)
        .toBe(true);
      expectRemotePlayerSynchronized(wave11Guest, wave11Wire, `${bossCase.kind} wave 11`);
      expectWaveProgressSynchronized(wave11Guest, wave11Wire.wire, `${bossCase.kind} wave 11`);
      expect(wave11Guest.bell).toMatchObject({ active: false, churchCount: 0 });
      expect(wave11Guest.train).toMatchObject({ active: false, segmentCount: 0, trackPoints: 0 });
      expect(wave11Guest.baron).toBeNull();
      expect(wave11Guest.sloth.active).toBe(false);
      // Wave 11 now intentionally retains the small slime scout. Its authored
      // body adds a fixed, bounded set of meshes while the defeated boss is
      // still required to be fully gone.
      expect(wave11Guest.dynamicObjects).toBeLessThanOrEqual(wave9AfterRaf.dynamicObjects + 20);

      const wave11AfterRaf = await readGuestAfterAnimationFrames(guest, 6);
      expect(wave11AfterRaf).toMatchObject({
        wave: 11,
        waveRemaining: wave11Wire.wire.ws[1],
        kind: "",
        enemyCount: wave11Guest.enemyCount,
        enemyIds: wave11Guest.enemyIds,
        bellActive: false,
        bellChurchCount: 0,
        trainActive: false,
        trainSegmentCount: 0,
        baronActive: false,
        baronPresent: false,
        slothActive: false,
      });
      expect(wave11AfterRaf.dynamicObjects, `${bossCase.kind} post-wave dynamic growth`)
        .toBeLessThanOrEqual(wave11Guest.dynamicObjects);
      expect(wave11AfterRaf.effectObjects, `${bossCase.kind} post-wave effect growth`)
        .toBeLessThanOrEqual(wave11Guest.effectObjects);

      for (const [staleIndex, staleWire] of [activeWire.wire, deathWire.wire, wave9Wire.wire].entries()) {
        const afterStale = await applyGuestWire(guest, staleWire);
        expectGuestFrameHealthy(afterStale, `${bossCase.kind} stale snapshot ${staleIndex + 1}`);
        expect(afterStale).toMatchObject({
          wave: 11,
          kind: "",
          lastSnapshotSequence: wave11Wire.wire.sequence,
          enemyIds: wave11Guest.enemyIds,
        });
        expect(afterStale.bell).toMatchObject({ active: false, churchCount: 0 });
        expect(afterStale.train).toMatchObject({ active: false, segmentCount: 0 });
        expect(afterStale.baron).toBeNull();
        expect(afterStale.sloth.active).toBe(false);
      }

      const wave11Repeated = await readGuestAfterAnimationFrames(guest, 8);
      expect(wave11Repeated).toMatchObject({
        wave: 11,
        waveRemaining: wave11Wire.wire.ws[1],
        kind: "",
        enemyCount: wave11AfterRaf.enemyCount,
        enemyIds: wave11AfterRaf.enemyIds,
        bellActive: false,
        bellChurchCount: 0,
        trainActive: false,
        trainSegmentCount: 0,
        baronActive: false,
        baronPresent: false,
        slothActive: false,
      });
      expect(wave11Repeated.dynamicObjects, `${bossCase.kind} repeated dynamic leak`)
        .toBeLessThanOrEqual(wave11AfterRaf.dynamicObjects);
      expect(wave11Repeated.effectObjects, `${bossCase.kind} repeated effect leak`)
        .toBeLessThanOrEqual(wave11AfterRaf.effectObjects);
      for (const [effectKey, baselineCount] of Object.entries(wave11AfterRaf.effectState)) {
        expect(
          wave11Repeated.effectState[effectKey],
          `${bossCase.kind} repeated ${effectKey} state leak`
        ).toBeLessThanOrEqual(baselineCount);
      }
      if (wave11AfterRaf.rendererMemory && wave11Repeated.rendererMemory) {
        expect(wave11Repeated.rendererMemory.geometries, `${bossCase.kind} repeated geometry leak`)
          .toBeLessThanOrEqual(wave11AfterRaf.rendererMemory.geometries);
        expect(wave11Repeated.rendererMemory.textures, `${bossCase.kind} repeated texture leak`)
          .toBeLessThanOrEqual(wave11AfterRaf.rendererMemory.textures);
      }

      console.log(`BOSS_BOUNDARY_NETWORK_SYNC ${JSON.stringify({
        kind: bossCase.kind,
        packetBytes: {
          wave9: wave9Wire.bytes,
          active: activeWire.bytes,
          death: deathWire.bytes,
          wave11: wave11Wire.bytes,
        },
        buildMs: {
          wave9: Number(wave9Wire.buildMs.toFixed(2)),
          active: Number(activeWire.buildMs.toFixed(2)),
          death: Number(deathWire.buildMs.toFixed(2)),
          wave11: Number(wave11Wire.buildMs.toFixed(2)),
        },
        applyMs: {
          wave9: Number(wave9Guest.applyMs.toFixed(2)),
          active: Number(activeGuest.applyMs.toFixed(2)),
          death: Number(deathGuest.applyMs.toFixed(2)),
          wave11: Number(wave11Guest.applyMs.toFixed(2)),
        },
        renderMs: {
          firstCrossContext: {
            wave9: Number(wave9Guest.renderMs.toFixed(2)),
            active: Number(activeGuest.renderMs.toFixed(2)),
            death: Number(deathGuest.renderMs.toFixed(2)),
            wave11: Number(wave11Guest.renderMs.toFixed(2)),
          },
          warmedRepeats: {
            wave9: wave9Guest.repeatRenderMs.map((value) => Number(value.toFixed(2))),
            active: activeGuest.repeatRenderMs.map((value) => Number(value.toFixed(2))),
            death: deathGuest.repeatRenderMs.map((value) => Number(value.toFixed(2))),
            wave11: wave11Guest.repeatRenderMs.map((value) => Number(value.toFixed(2))),
          },
          warmedMedian: {
            wave9: Number(wave9Guest.repeatRenderMs.slice().sort((a, b) => a - b)[1].toFixed(2)),
            active: Number(activeGuest.repeatRenderMs.slice().sort((a, b) => a - b)[1].toFixed(2)),
            death: Number(deathGuest.repeatRenderMs.slice().sort((a, b) => a - b)[1].toFixed(2)),
            wave11: Number(wave11Guest.repeatRenderMs.slice().sort((a, b) => a - b)[1].toFixed(2)),
          },
        },
        rendererPrograms: {
          wave9: wave9Guest.rendererPrograms,
          active: activeGuest.rendererPrograms,
          death: deathGuest.rendererPrograms,
          wave11: wave11Guest.rendererPrograms,
        },
        transitionMs: {
          enter: Number(entered.transitionMs.toFixed(2)),
          defeat: Number(defeated.defeatMs.toFixed(2)),
          exit: Number(exited.transitionMs.toFixed(2)),
        },
        hostRenderMs: {
          firstBoss: Number(entered.firstRenderMs.toFixed(2)),
          repeatBoss: Number(entered.repeatRenderMs.toFixed(2)),
        },
        prewarmMs: {
          trainMaxSlice: prewarm.train.prewarm.maxMs,
          bossBuildMaxSlice: prewarm.bossFx.buildMaxMs,
          bossCompileMaxSlice: prewarm.bossFx.compileSubmitMaxMs,
          bossShadowWarmupMaxSlice: prewarm.bossFx.shadowWarmupMaxMs,
          bossCleanupMaxSlice: prewarm.bossFx.cleanupMaxMs,
        },
        oilReplicaReveal: oilRevealRun ? {
          frames: oilRevealRun.samples.length,
          total: oilRevealRun.settled.reveal.total,
          revealed: oilRevealRun.settled.reveal.revealed,
          lastKind: oilRevealRun.settled.reveal.lastKind,
          lastRenderMs: oilRevealRun.settled.reveal.lastRenderMs,
          maxRenderMs: oilRevealRun.settled.reveal.maxRenderMs,
          maxRenderKind: oilRevealRun.settled.reveal.maxRenderKind,
          rendererPrograms: oilRevealRun.settled.rendererPrograms,
          upload: oilRevealRun.settled.reveal.upload,
        } : null,
        oilExistingReplicaUpdates: oilSingleDelta && oilDeltaRevealRun ? {
          single: {
            packetBytes: oilSingleDelta.wire.bytes,
            applyMs: Number(oilSingleDelta.guest.applyMs.toFixed(2)),
            firstRenderMs: Number(oilSingleDelta.guest.renderMs.toFixed(2)),
            total: oilSingleDelta.guest.baron.replicaReveal.total,
            revealed: oilSingleDelta.guest.baron.replicaReveal.revealed,
          },
          multi: {
            frames: oilDeltaRevealRun.samples.length,
            total: oilDeltaRevealRun.settled.reveal.total,
            revealed: oilDeltaRevealRun.settled.reveal.revealed,
            lastKind: oilDeltaRevealRun.settled.reveal.lastKind,
            maxRenderMs: oilDeltaRevealRun.settled.reveal.maxRenderMs,
            maxRenderKind: oilDeltaRevealRun.settled.reveal.maxRenderKind,
            accessoryInstances:
              oilDeltaRevealRun.settled.fidelity.chainAccessoryBatch.activeInstances,
            upload: oilDeltaRevealRun.settled.reveal.upload,
          },
        } : null,
        scopedEnemies: {
          wave9: { host: wave9Wire.wire.totalEnemies, guest: wave9Guest.enemyCount },
          wave11: { host: wave11Wire.wire.totalEnemies, guest: wave11Guest.enemyCount },
        },
        objects: {
          wave9: wave9Guest.dynamicObjects,
          active: activeGuest.dynamicObjects,
          wave11Immediate: {
            dynamic: wave11Guest.dynamicObjects,
            effects: wave11Guest.effectObjects,
          },
          wave11Settled: {
            dynamic: wave11AfterRaf.dynamicObjects,
            effects: wave11AfterRaf.effectObjects,
          },
          wave11Repeated: {
            dynamic: wave11Repeated.dynamicObjects,
            effects: wave11Repeated.effectObjects,
          },
        },
      })}`);

      expect(pageErrors).toEqual([]);
    } finally {
      await guest.close();
    }
  });
}

test("Oil Baron isolated late join keeps each component ladder stage warm", async ({ page, context }) => {
  test.setTimeout(120_000);
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(`host: ${error.message}`));
  await startHunt(page);

  const entered = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const multiplayer = window.__dustMultiplayerTest;
    multiplayer.startMockHost(["Host", "Guest"]);
    multiplayer.setPlayerPosition("mock-player-1", 14, -9);
    multiplayer.setPlayerPosition("mock-player-2", 14, -9);
    multiplayer.injectInput("mock-player-2", {
      sequence: 1,
      view: [-14, 14, -18, 18],
    });
    game.forceWaveState(9, 0, 0);
    game.setWave10BossOverride("oilBaron");
    const transition = game.advanceWaveProgress(8000);
    game.setWave10BossOverride("random");
    game.setOilBaronAiEnabled(false);
    return {
      transition,
      baron: game.getOilBaronDiagnostics(),
    };
  });
  expect(entered.transition.wave).toBe(10);
  expect(entered.baron).toMatchObject({
    active: true,
    derrickCount: 0,
    oilDoubles: { count: 0 },
    debtChains: { count: 0 },
  });

  const originalWire = await buildHostWire(page);
  await acknowledgeHostWire(page, originalWire.wire);

  const derrickSetup = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    game.spawnOilDerrickBatch([
      { x: -6, z: -9 },
      { x: 14, z: -9 },
      { x: 34, z: -9 },
    ]);
    return game.getOilBaronDiagnostics();
  });
  expect(derrickSetup).toMatchObject({ derrickCount: 3 });
  const derrickWire = await buildHostWire(page);
  await acknowledgeHostWire(page, derrickWire.wire);

  const doubleSetup = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    game.damageOilBaron(1900, true, "mock-player-1");
    const started = Boolean(game.forceOilBaronAction("doubles"));
    game.advanceOilBaron(1800);
    return { started, baron: game.getOilBaronDiagnostics() };
  });
  expect(doubleSetup).toMatchObject({
    started: true,
    baron: {
      boss: { hp: 1340 },
      derrickCount: 3,
      oilDoubles: { count: 2 },
      debtChains: { count: 0 },
    },
  });
  const doubleWire = await buildHostWire(page);
  await acknowledgeHostWire(page, doubleWire.wire);

  const chainSetup = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const started = Boolean(game.forceOilBaronDebtChainForPlayer("mock-player-2"));
    return { started, baron: game.getOilBaronDiagnostics() };
  });
  expect(chainSetup).toMatchObject({
    started: true,
    baron: {
      derrickCount: 3,
      oilDoubles: { count: 2 },
      debtChains: { count: 1 },
    },
  });
  const chainWire = await buildHostWire(page);

  // The wire payloads are ordinary JSON snapshots and no longer depend on the
  // host renderer. Closing it before opening the guest makes this a true
  // single-WebGL-context late-join measurement rather than a shared-GPU race.
  await page.close();
  const guest = await context.newPage();
  guest.on("pageerror", (error) => pageErrors.push(`guest: ${error.message}`));
  try {
    await startHunt(guest);
    await guest.evaluate(() => window.__dustMultiplayerTest.startMockGuest(["Host", "Guest"], 1));
    const stages = [
      { label: "original", wire: originalWire.wire, expected: { derrickCount: 0, doubleCount: 0, chainCount: 0 } },
      { label: "three derricks", wire: derrickWire.wire, expected: { derrickCount: 3, doubleCount: 0, chainCount: 0 } },
      { label: "two doubles", wire: doubleWire.wire, expected: { derrickCount: 3, doubleCount: 2, chainCount: 0 } },
      { label: "debt chain", wire: chainWire.wire, expected: { derrickCount: 3, doubleCount: 2, chainCount: 1 } },
    ];
    const samples = [];
    const stageRecords = [];
    for (const stage of stages) {
      const sample = await applyGuestWire(guest, stage.wire);
      expectGuestTimingHealthy(sample, `isolated Oil Baron ${stage.label}`, MAX_RENDER_MS);
      expect(sample.baron).toMatchObject({
        active: true,
        replica: true,
        derrickCount: stage.expected.derrickCount,
        doubleCount: stage.expected.doubleCount,
        chainCount: stage.expected.chainCount,
      });
      samples.push({
        label: stage.label,
        applyMs: Number(sample.applyMs.toFixed(2)),
        firstMs: Number(sample.renderMs.toFixed(2)),
        repeats: sample.repeatRenderMs.map((value) => Number(value.toFixed(2))),
        programs: sample.rendererPrograms,
      });
      stageRecords.push({ label: stage.label, sample });
    }
    console.log(`OIL_BARON_ISOLATED_LATE_JOIN ${JSON.stringify(samples)}`);
    for (const stageRecord of stageRecords) {
      expectGuestProgramsStable(stageRecord.sample, `isolated Oil Baron ${stageRecord.label}`);
    }
    expect(pageErrors).toEqual([]);
  } finally {
    await guest.close();
  }
});
