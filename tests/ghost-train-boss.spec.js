const fs = require("node:fs/promises");
const http = require("node:http");
const path = require("node:path");
const { chromium, expect, test } = require("@playwright/test");

const projectRoot = path.resolve(__dirname, "..");

async function startStaticServer() {
  const contentTypes = {
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".svg": "image/svg+xml",
  };
  const server = http.createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url, "http://127.0.0.1");
      const pathname = decodeURIComponent(requestUrl.pathname === "/" ? "/index.html" : requestUrl.pathname);
      const filePath = path.resolve(projectRoot, `.${pathname}`);
      if (filePath !== projectRoot && !filePath.startsWith(`${projectRoot}${path.sep}`)) {
        response.writeHead(403).end("Forbidden");
        return;
      }
      const body = await fs.readFile(filePath);
      response.writeHead(200, { "Content-Type": contentTypes[path.extname(filePath)] || "application/octet-stream" });
      response.end(body);
    } catch (error) {
      response.writeHead(error?.code === "ENOENT" ? 404 : 500).end("Not found");
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}

function fileUrl(relativePath) {
  const absolute = path.resolve(__dirname, "..", relativePath).replace(/\\/g, "/");
  return `file:///${absolute}`;
}

async function startHunt(page, options = {}) {
  await page.goto(`${fileUrl("index.html")}?mapSeed=7331`);
  const intro = page.locator("#intro-screen");
  if (await intro.isVisible().catch(() => false)) {
    await page.keyboard.press("KeyM");
    await expect(intro).toBeHidden();
  }
  if (Object.prototype.hasOwnProperty.call(options, "audio")) {
    const wantAudio = Boolean(options.audio);
    const audioEnabled = await page.evaluate(() => window.__dustAndDeadTest.getAudioDiagnostics().enabled);
    if (audioEnabled !== wantAudio) await page.locator("#menu-music-btn").click();
  }
  await page.getByRole("button", { name: "Start Hunt" }).click();
  await page.waitForFunction(() => Boolean(
    window.__dustAndDeadTest?.getGhostTrainDiagnostics &&
    window.__dustAndDeadTest?.advanceGhostTrain &&
    window.__dustAndDeadTest?.damageGhostTrainTail
  ));
}

async function startTrain(page) {
  return page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const wave = game.startWaveNow(10, "ghostTrain");
    game.clearEnemies();
    game.setGhostTrainAiEnabled(false);
    return { wave, train: game.getGhostTrainDiagnostics() };
  });
}

async function waitForGhostTrainGpuPrewarm(page) {
  await page.evaluate(() => window.__dustAndDeadTest?.clearEnemies?.());
  await page.waitForFunction(() => {
    const prewarm = window.__dustAndDeadTest
      ?.getGhostTrainVisualBundlePoolDiagnostics?.().prewarm;
    return Boolean(
      prewarm?.completed &&
      prewarm.gpuReady &&
      prewarm.gpuUploadComplete &&
      prewarm.gpuReadyStageCount === prewarm.gpuStageCount &&
      !prewarm.gpuPending &&
      !prewarm.gpuCompileError &&
      !prewarm.gpuUploadError
    );
  }, undefined, { polling: "raf", timeout: 120_000 });
}

test("the Ghost Train preview finishes bootstrap without a page error", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto(`${fileUrl("index.html")}?mapSeed=7331&preview=ghost-train`);
  await page.waitForFunction(() => Boolean(
    window.render_game_to_text &&
    window.__dustAndDeadTest?.getGhostTrainDiagnostics
  ));

  const train = await page.evaluate(() => window.__dustAndDeadTest.getGhostTrainDiagnostics());

  expect(pageErrors).toEqual([]);
  expect(train).toMatchObject({
    active: true,
    defeated: false,
    phase: 0,
    activeTailIndex: 4,
    action: "spectral",
  });
  expect(train.segments).toHaveLength(5);
  await expect(page.locator("#boss-hud")).toHaveClass(/is-ghost-train/);
});

test("the detailed train is statically batched, uses proxy shadows, and uploads only visible rails", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto(`${fileUrl("index.html")}?mapSeed=7331&preview=ghost-train`);
  await page.waitForFunction(() => Boolean(
    window.__dustAndDeadTest?.getGhostTrainDiagnostics &&
    window.__dustAndDeadTest?.profileNextRenderForTest
  ));

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    game.setAutomaticFrameLoopModeForTest("paused");
    game.setGhostTrainAiEnabled(false);
    for (let index = 0; index < 6; index += 1) game.renderNowForTest();
    const spectral = game.getGhostTrainDiagnostics();
    const spectralRender = game.profileNextRenderForTest();
    game.forceGhostTrainAction("broadside", 4);
    game.advanceGhostTrain(17);
    for (let index = 0; index < 6; index += 1) game.renderNowForTest();
    const materialized = game.getGhostTrainDiagnostics();
    const materializedRender = game.profileNextRenderForTest();
    game.advanceGhostTrain(1600);
    const advanced = game.getGhostTrainDiagnostics();
    return { spectral, spectralRender, materialized, materializedRender, advanced };
  });

  const allSegments = [...result.spectral.segments, ...result.materialized.segments];
  expect(pageErrors).toEqual([]);
  expect(result.spectral.segments.reduce((sum, segment) => sum + segment.staticBatchSources, 0)).toBe(306);
  expect(result.spectral.segments.reduce((sum, segment) => sum + segment.staticVisualBatches, 0)).toBe(35);
  expect(result.spectral.segments.reduce((sum, segment) => sum + segment.shadowProxyMeshes, 0)).toBe(16);
  expect(allSegments.every((segment) => !segment.staticBatchError)).toBe(true);
  expect(allSegments.every((segment) => segment.detailedShadowCasters === 0)).toBe(true);
  expect(result.spectral.segments.every((segment) => !segment.shadowProxyVisible)).toBe(true);
  expect(result.materialized.segments.every((segment) => segment.shadowProxyVisible)).toBe(true);
  // The authored geometry remains intact; batching changes submissions, not detail.
  expect(result.spectralRender.triangles).toBeGreaterThan(10_000);
  expect(result.materializedRender.triangles).toBeGreaterThan(10_000);
  expect(result.spectralRender.renderCalls).toBeLessThanOrEqual(260);
  expect(result.materializedRender.renderCalls).toBeLessThanOrEqual(260);
  expect(result.advanced.track.partialUploads).toBeGreaterThan(0);
  expect(result.advanced.track.avoidedMatrixUploadFloats).toBeGreaterThan(0);
});

test("the local Ghost Train stand starts its music automatically once combat audio is available", async () => {
  const server = await startStaticServer();
  const audioBrowser = await chromium.launch({
    headless: true,
    args: ["--autoplay-policy=no-user-gesture-required"],
  });
  try {
    const page = await audioBrowser.newPage();
    await page.goto(`${server.baseUrl}/dev/ghost-train-scene.html`);
    await page.waitForFunction(() => Boolean(
      document.querySelector("iframe")?.contentWindow?.__dustAndDeadTest?.getAudioDiagnostics
    ));
    const gameFrame = page.frames().find((frame) => frame.url().includes("index.html"));
    expect(gameFrame).toBeTruthy();
    await gameFrame.waitForFunction(() => {
      const audio = window.__dustAndDeadTest.getAudioDiagnostics();
      return audio.contextState === "running" &&
        audio.gameActive &&
        audio.bossMusic.active &&
        audio.bossMusic.id === "ghost-train";
    }, null, { timeout: 12000 });

    const audio = await gameFrame.evaluate(() => window.__dustAndDeadTest.getAudioDiagnostics());
    expect(await page.locator("#enable-audio").count()).toBe(0);
    expect(audio).toMatchObject({
      enabled: true,
      unlocked: true,
      contextState: "running",
      gameActive: true,
    });
    expect(audio.bossMusic).toMatchObject({ id: "ghost-train", active: true, lifecycle: "active" });
  } finally {
    await audioBrowser.close();
    await server.close();
  }
});

test("the Ghost Train attack and death previews expose their intended combat states", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto(`${fileUrl("index.html")}?mapSeed=7331&preview=ghost-train-attack-warning`);
  await page.waitForFunction(() => Boolean(window.__dustAndDeadTest?.getGhostTrainDiagnostics));
  const warning = await page.evaluate(() => window.__dustAndDeadTest.getGhostTrainDiagnostics());

  await page.goto(`${fileUrl("index.html")}?mapSeed=7331&preview=ghost-train-attack`);
  await page.waitForFunction(() => Boolean(window.__dustAndDeadTest?.getGhostTrainDiagnostics));
  const attack = await page.evaluate(() => window.__dustAndDeadTest.getGhostTrainDiagnostics());

  await page.goto(`${fileUrl("index.html")}?mapSeed=7331&preview=ghost-train-death`);
  await page.waitForFunction(() => Boolean(window.__dustAndDeadTest?.getGhostTrainDiagnostics));
  const death = await page.evaluate(() => window.__dustAndDeadTest.getGhostTrainDiagnostics());

  expect(pageErrors).toEqual([]);
  expect(warning).toMatchObject({ active: true, action: "broadside", materialized: true, vulnerable: true });
  expect(warning.telegraphs).toHaveLength(2);
  expect(warning.telegraphs.map((telegraph) => telegraph.side).sort()).toEqual([-1, 1]);
  expect(warning.telegraphs.every((telegraph) => telegraph.step === 0 && telegraph.trajectoryVisible)).toBe(true);
  expect(warning.telegraphs.every((telegraph) => telegraph.trajectoryLength > 10)).toBe(true);
  expect(warning.cannonballs).toHaveLength(0);
  expect(attack).toMatchObject({ active: true, action: "broadside", materialized: true, vulnerable: true });
  expect(attack.cannonballs.length).toBeGreaterThan(0);
  expect(attack.cannonballs[0].trajectoryVisible).toBe(true);
  expect(death).toMatchObject({ active: false, defeated: true, hp: 0, action: "defeated" });
  expect(death.deathTimeLeft).toBeGreaterThan(0);
});

test("wave 10 can select the detailed five-section Ghost Train without bloating its wire state", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await startHunt(page);
  const randomChoices = await page.evaluate(() => Array.from(
    { length: 12 },
    () => window.__dustAndDeadTest.startWaveNow(10, "random").wave10BossKind
  ));
  const result = await startTrain(page);

  expect(pageErrors).toEqual([]);
  expect(new Set(randomChoices)).toEqual(new Set([
    "bellRinger",
    "ghostTrain",
    "hordeheart",
    "landEater",
    "oilBaron",
    "slothArchbishop",
  ]));
  expect(result.wave).toMatchObject({ wave: 10, wave10BossKind: "ghostTrain" });
  expect(result.train).toMatchObject({
    active: true,
    defeated: false,
    phase: 0,
    activeTailIndex: 4,
    materialized: false,
    vulnerable: false,
  });
  expect(result.train.segments).toHaveLength(5);
  expect(result.train.segments.map((segment) => segment.kind)).toEqual([
    "locomotive", "wagon", "wagon", "wagon", "wagon",
  ]);
  expect(result.train.segments.reduce((sum, segment) => sum + segment.cannonCount, 0)).toBe(16);
  expect(result.train.segments.slice(1).every((segment) => segment.cannonCount === 4)).toBe(true);
  expect(result.train.segments.slice(1).every((segment) => JSON.stringify(segment.cannonMounts.map(({ side, offsetZ }) => ({ side, offsetZ }))) === JSON.stringify([
    { side: -1, offsetZ: -1.42 },
    { side: -1, offsetZ: 1.42 },
    { side: 1, offsetZ: -1.42 },
    { side: 1, offsetZ: 1.42 },
  ]))).toBe(true);
  expect(result.train.segments.every((segment) => segment.modelParts >= 20)).toBe(true);
  expect(result.train.track.ahead).toBeGreaterThanOrEqual(result.train.track.previewRequired);
  expect(result.train.track.drawCalls).toBe(3);
  expect(result.train.network).toMatchObject({ cannonballsReplicated: false, meshesReplicated: false });
  expect(result.train.network.regularBytes).toBeLessThanOrEqual(32);
  expect(result.train.network.keyframeBytes).toBeLessThanOrEqual(80);
  expect(result.train.network.trackPoints).toBe(16);

  await expect(page.locator("#boss-hud")).toHaveClass(/is-ghost-train/);
  await expect(page.locator("#boss-name")).toHaveText("THE LAST TRAIN TO PERDITION");
  await expect(page.locator(".boss-train-section")).toHaveCount(5);
  await expect(page.locator(".boss-train-section.is-target")).toHaveCount(1);
});

test("Ghost Train phase tuning keeps the finale cadence while earlier wagons fire faster and attacks last longer", async ({ page }) => {
  await startHunt(page);
  await startTrain(page);

  const phases = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const samples = [];
    for (let phase = 0; phase <= 4; phase += 1) {
      const train = game.getGhostTrainDiagnostics();
      samples.push({
        phase: train.phase,
        interval: train.cannonInterval,
        timing: train.timing,
      });
      if (phase < 4) game.damageGhostTrainTail(9999, true);
    }
    return samples;
  });

  expect(phases.map((sample) => sample.phase)).toEqual([0, 1, 2, 3, 4]);
  expect(phases.map((sample) => sample.interval)).toEqual([0.38, 0.27, 0.18, 0.09, 0.1]);
  expect(phases.map((sample) => sample.timing.attackDuration)).toEqual([6.1, 5.9, 5.6, 5.3, 4.65]);
  expect(phases.map((sample) => sample.timing.spectralCooldown)).toEqual([8.8, 7.8, 6.8, 5.4, 2.8]);
  expect(phases[0].timing).toMatchObject({
    initialSpectralDuration: 5.5,
    approachLeadTime: 3.15,
    earlyMaterializeWindow: 1.05,
    materializeDuration: 1.05,
    materializeSolidProgress: 0.3,
    materializedBeforeAttack: 0.735,
  });
});

test("materialized attack passes stay catchable and the last locomotive cannot outrun any revolver bullet", async ({ page }) => {
  await startHunt(page);

  const phases = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const samples = [];
    for (let phase = 0; phase <= 4; phase += 1) {
      game.startWaveNow(10, "ghostTrain");
      game.clearEnemies();
      game.setGhostTrainAiEnabled(false);
      for (let index = 0; index < phase; index += 1) game.damageGhostTrainTail(9999, true);
      const attack = game.forceGhostTrainAction("broadside", 4);
      samples.push(attack);
    }
    return samples;
  });

  expect(phases.map((phase) => phase.phase)).toEqual([0, 1, 2, 3, 4]);
  expect(phases.slice(0, 4).map((phase) => phase.speed)).toEqual([6.6, 6.9, 7.2, 7.5]);
  for (const phase of phases.slice(0, 4)) {
    expect(phase.speed).toBeLessThan(phase.playerBaseSpeed);
    expect((phase.playerBaseSpeed - phase.speed) * phase.timing.attackDuration).toBeGreaterThanOrEqual(4);
    expect(phase.track.previewSpeed).toBeGreaterThan(phase.speed);
  }
  expect(phases[4].speed).toBe(17.5);
  expect(phases[4].speed).toBeLessThan(29 * 0.62);
  expect(phases[4].speed).toBeLessThan(29);
  expect(phases[4].speed).toBeLessThan(43);
});

test("the vulnerable wagon has one gold world marker that follows the authoritative tail on host and guest", async ({ page }) => {
  await startHunt(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const multiplayer = window.__dustMultiplayerTest;
    const clone = (value) => JSON.parse(JSON.stringify(value));
    multiplayer.startMockHost(["Host", "Guest"]);
    game.startWaveNow(10, "ghostTrain");
    game.clearEnemies();
    game.setGhostTrainAiEnabled(false);
    game.forceGhostTrainAction("broadside", 4);
    const first = game.advanceGhostTrain(17);
    game.damageGhostTrainTail(9999, true);
    game.forceGhostTrainAction("broadside", 4);
    const second = game.advanceGhostTrain(17);
    const wire = clone(multiplayer.buildWireSnapshot(false, false, "mock-player-2"));
    multiplayer.startMockGuest(["Host", "Guest"], 1);
    multiplayer.applySnapshot(wire);
    const guest = game.advanceGhostTrain(17);
    return { first, second, guest };
  });

  const visibleMarkers = (train) => train.segments.filter((segment) => segment.targetMarkerVisible);
  expect(visibleMarkers(result.first)).toHaveLength(1);
  expect(visibleMarkers(result.first)[0]).toMatchObject({ index: 4, targetMarkerGold: true });
  expect(visibleMarkers(result.second)).toHaveLength(1);
  expect(visibleMarkers(result.second)[0]).toMatchObject({ index: 3, targetMarkerGold: true });
  expect(visibleMarkers(result.guest)).toHaveLength(1);
  expect(visibleMarkers(result.guest)[0]).toMatchObject({ index: 3, targetMarkerGold: true });
});

test("Ghost Train gives the always-materialized lone locomotive twenty percent damage resistance", async ({ page }) => {
  await startHunt(page);
  await startTrain(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const initial = game.getGhostTrainDiagnostics();
    const wagonDamage = game.damageGhostTrainTail(20, true);
    game.damageGhostTrainTail(9999, true);
    for (let index = 0; index < 3; index += 1) game.damageGhostTrainTail(9999, true);
    const finalBefore = game.getGhostTrainDiagnostics();
    const finalSpectral = game.forceGhostTrainAction("spectral", 2);
    const finalDematerialize = game.forceGhostTrainAction("dematerialize", 0.5);
    const finalDamage = game.damageGhostTrainTail(20, true);
    const finalAfter = game.getGhostTrainDiagnostics();
    return { initial, wagonDamage, finalBefore, finalSpectral, finalDematerialize, finalDamage, finalAfter };
  });

  expect(result.initial).toMatchObject({ hp: 425, maxHp: 425 });
  expect(result.initial.segments.every((segment) => segment.hp === 85 && segment.maxHp === 85)).toBe(true);
  expect(result.initial.healthTuning).toMatchObject({
    baseSegmentHp: 100,
    healthMultiplier: 1,
    playerHealthScale: 1,
    segmentMaxHp: 85,
    finalDamageResistance: 0.2,
    activeDamageTakenMultiplier: 1,
  });
  expect(result.wagonDamage).toBe(20);
  expect(result.finalBefore).toMatchObject({ phase: 4, activeTailIndex: 0, hp: 85, maxHp: 425, materialized: true, vulnerable: true });
  expect(result.finalBefore.healthTuning.activeDamageTakenMultiplier).toBe(0.8);
  expect(result.finalSpectral).toMatchObject({ phase: 4, action: "spectral", materialized: true, vulnerable: true });
  expect(result.finalDematerialize).toMatchObject({ phase: 4, action: "dematerialize", materialized: true, vulnerable: true });
  expect(result.finalDamage).toBe(16);
  expect(result.finalAfter).toMatchObject({ hp: 69, materialized: true, vulnerable: true });
  expect(result.finalAfter.segments[0].hp).toBe(69);
  expect(result.finalAfter.hud.status).toContain("20% DAMAGE RESISTANCE");
});

test("materialization has a universal nine second start-to-start cooldown", async ({ page }) => {
  await startHunt(page);
  await startTrain(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    game.setGhostTrainAiEnabled(false);
    const first = game.forceGhostTrainAction("materialize", 0.4);
    const spectral = game.forceGhostTrainAction("spectral", 20);
    const immediateRetry = game.forceGhostTrainAction("materialize", 0.4);
    const atEightPointEight = game.advanceGhostTrain(8800);
    const blockedRetry = game.forceGhostTrainAction("materialize", 0.4);
    const afterNine = game.advanceGhostTrain(250);
    const second = game.forceGhostTrainAction("materialize", 0.4);
    return { first, spectral, immediateRetry, atEightPointEight, blockedRetry, afterNine, second };
  });

  expect(result.first).toMatchObject({ action: "materialize" });
  expect(result.first.materialization).toMatchObject({
    cooldown: 9,
    cooldownRemaining: 9,
    canMaterialize: false,
    count: 1,
    timeSinceLast: 0,
  });
  expect(result.spectral.action).toBe("spectral");
  expect(result.immediateRetry).toMatchObject({ action: "spectral" });
  expect(result.immediateRetry.materialization).toMatchObject({ canMaterialize: false, count: 1 });
  expect(result.atEightPointEight.materialization.cooldownRemaining).toBeCloseTo(0.2, 2);
  expect(result.blockedRetry).toMatchObject({ action: "spectral" });
  expect(result.blockedRetry.materialization).toMatchObject({ canMaterialize: false, count: 1 });
  expect(result.afterNine.materialization).toMatchObject({ cooldownRemaining: 0, canMaterialize: true, count: 1 });
  expect(result.second).toMatchObject({ action: "materialize" });
  expect(result.second.materialization).toMatchObject({ cooldownRemaining: 9, canMaterialize: false, count: 2 });
});

test("restarting wave 10 swaps bosses without leaving the previous encounter alive", async ({ page }) => {
  test.setTimeout(150_000);
  await startHunt(page);
  await waitForGhostTrainGpuPrewarm(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    game.startWaveNow(10, "bellRinger");
    const firstBell = game.getBellRingerDiagnostics();
    const firstTrain = game.getGhostTrainDiagnostics();

    game.startWaveNow(10, "ghostTrain");
    const trainAfterSwap = game.getGhostTrainDiagnostics();
    const bellAfterSwap = game.getBellRingerDiagnostics();
    const firstTrainPool = game.getGhostTrainVisualBundlePoolDiagnostics();
    const firstTrainObjects = game.getThreeObjectDiagnostics().roots.dynamicRoot.objects;

    game.startWaveNow(10, "bellRinger");
    const bellAfterReturn = game.getBellRingerDiagnostics();
    const trainAfterReturn = game.getGhostTrainDiagnostics();
    const releasedPool = game.getGhostTrainVisualBundlePoolDiagnostics();

    game.startWaveNow(10, "ghostTrain");
    const reusedTrain = game.getGhostTrainDiagnostics();
    const reusedPool = game.getGhostTrainVisualBundlePoolDiagnostics();
    const reusedTrainObjects = game.getThreeObjectDiagnostics().roots.dynamicRoot.objects;
    game.startWaveNow(10, "bellRinger");
    const rereleasedPool = game.getGhostTrainVisualBundlePoolDiagnostics();
    return {
      firstBell,
      firstTrain,
      trainAfterSwap,
      bellAfterSwap,
      bellAfterReturn,
      trainAfterReturn,
      firstTrainPool,
      firstTrainObjects,
      releasedPool,
      reusedTrain,
      reusedPool,
      reusedTrainObjects,
      rereleasedPool,
    };
  });

  expect(result.firstBell.active).toBe(true);
  expect(result.firstTrain).toMatchObject({ active: false, segments: [] });
  expect(result.trainAfterSwap).toMatchObject({ active: true, segments: expect.any(Array) });
  expect(result.trainAfterSwap.segments).toHaveLength(5);
  expect(result.bellAfterSwap).toMatchObject({ active: false, churches: [] });
  expect(result.bellAfterReturn.active).toBe(true);
  expect(result.bellAfterReturn.churches).toHaveLength(3);
  expect(result.trainAfterReturn).toMatchObject({ active: false, segments: [] });
  expect(result.reusedTrain.segments).toHaveLength(5);
  expect(result.reusedTrain.segments.every((segment) => !segment.staticBatchError)).toBe(true);
  expect(result.reusedPool.created).toBe(result.firstTrainPool.created);
  expect(result.reusedPool.acquireHits).toBeGreaterThan(result.firstTrainPool.acquireHits);
  expect(result.firstTrainObjects).toBe(result.reusedTrainObjects);
  expect(result.releasedPool).toMatchObject({ available: 1, inUse: 0 });
  expect(result.rereleasedPool).toMatchObject({
    available: 1,
    created: result.firstTrainPool.created,
    inUse: 0,
  });
});

test("only the materialized tail takes damage and a destroyed wagon cannot spill damage into the next bar", async ({ page }) => {
  await startHunt(page);
  await startTrain(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const before = game.getGhostTrainDiagnostics();
    const spectralDamage = game.damageGhostTrainTail(25, false);
    const locomotiveDamage = game.damageGhostTrainSegment(0, 25, true);
    const tailDamage = game.damageGhostTrainTail(25, true);
    const lethalApplied = game.damageGhostTrainTail(999, true);
    const afterDetach = game.getGhostTrainDiagnostics();
    const afterExplosion = game.advanceGhostTrain(3200);
    return { before, spectralDamage, locomotiveDamage, tailDamage, lethalApplied, afterDetach, afterExplosion };
  });

  expect(result.spectralDamage).toBe(0);
  expect(result.locomotiveDamage).toBe(0);
  expect(result.tailDamage).toBe(25);
  expect(result.lethalApplied).toBe(result.before.segments[4].maxHp - 25);
  expect(result.afterDetach.activeTailIndex).toBe(3);
  expect(result.afterDetach.phase).toBe(1);
  expect(result.afterDetach.hp).toBe(result.before.hp - result.before.segments[4].maxHp);
  expect(result.afterDetach.segments[3].hp).toBe(result.afterDetach.segments[3].maxHp);
  expect(result.afterDetach.segments[4]).toMatchObject({ attached: false, detaching: true, hp: 0 });
  expect(result.afterDetach.segments.reduce((sum, segment) => sum + (segment.attached ? segment.cannonCount : 0), 0)).toBe(12);
  expect(result.afterDetach.detached).toHaveLength(1);
  expect(result.afterExplosion.detached).toHaveLength(0);
  expect(result.afterExplosion.segments[4].modelAttached).toBe(false);
});

test("combat speed escalates while the spectral patrol stays fast and every section remains exactly on its generated rails", async ({ page }) => {
  await startHunt(page);
  await startTrain(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const start = game.getGhostTrainDiagnostics();
    for (let index = 0; index < 4; index += 1) game.damageGhostTrainTail(9999, true);
    const lone = game.getGhostTrainDiagnostics();
    const advanced = game.advanceGhostTrain(1800);
    return { start, lone, advanced };
  });

  expect(result.lone.activeTailIndex).toBe(0);
  expect(result.lone.phase).toBe(4);
  expect(result.lone.segments.filter((segment) => segment.attached)).toHaveLength(1);
  expect(result.start.action).toBe("spectral");
  expect(result.start.spectralSpeedMultiplier).toBeGreaterThan(2);
  expect(result.start.speed).toBeGreaterThan(result.start.baseSpeed * 2);
  expect(result.lone.baseSpeed).toBeGreaterThan(result.start.baseSpeed * 1.8);
  expect(result.lone.speed).toBe(result.lone.finalSpeed);
  expect(result.advanced.engineDistance).toBeGreaterThan(result.lone.engineDistance + 25);
  expect(result.advanced.segments.filter((segment) => segment.attached).every((segment) => segment.railError === 0)).toBe(true);
  expect(result.advanced.track.ahead).toBeGreaterThanOrEqual(result.advanced.track.previewRequired - 0.2);
});

test("the visible rail preview never contracts when attack speed engages", async ({ page }) => {
  await startHunt(page);

  const samples = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const phases = [];
    for (let destroyedWagons = 0; destroyedWagons <= 4; destroyedWagons += 1) {
      game.startWaveNow(10, "ghostTrain");
      game.clearEnemies();
      game.setGhostTrainAiEnabled(false);
      for (let index = 0; index < destroyedWagons; index += 1) game.damageGhostTrainTail(9999, true);
      game.forceGhostTrainAction("spectral", 3);
      const spectral = game.advanceGhostTrain(180);
      game.setGhostTrainAiEnabled(true);
      const transition = game.forceGhostTrainAction("materialize", 1.25);
      const solid = game.advanceGhostTrain(650);
      phases.push({ spectral, transition, solid });
    }
    return phases;
  });

  expect(samples).toHaveLength(5);
  for (const sample of samples) {
    expect(sample.spectral.action).toBe("spectral");
    expect(sample.transition.action).toBe("materialize");
    if (sample.spectral.phase < 4) expect(sample.transition.speed).toBeLessThan(sample.spectral.speed);
    else expect(sample.transition.speed).toBe(sample.spectral.speed);
    expect(sample.transition.track.previewSpeed).toBe(sample.spectral.track.previewSpeed);
    expect(sample.transition.track.previewRequired).toBe(sample.spectral.track.previewRequired);
    expect(sample.transition.track.visibleAhead).toBeGreaterThanOrEqual(sample.spectral.track.visibleAhead - 1.5);
    expect(sample.transition.track.visibleAhead).toBeGreaterThanOrEqual(sample.transition.track.previewRequired);
    expect(sample.solid.materialized).toBe(true);
    expect(sample.solid.track.previewRequired).toBe(sample.spectral.track.previewRequired);
    expect(sample.solid.track.visibleAhead).toBeGreaterThanOrEqual(sample.solid.track.previewRequired);
  }
});

test("wagon cannons launch immutable straight piercing projectiles and retract their red path", async ({ page }) => {
  await startHunt(page);
  await startTrain(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    game.forceGhostTrainAction("broadside", 4);
    game.fireGhostTrainCannon(4, 1, 0);
    const fired = game.getGhostTrainDiagnostics().cannonballs[0];
    game.fireGhostTrainCannon(4, 1, 1);
    const paired = game.getGhostTrainDiagnostics().cannonballs.find((ball) => ball.id !== fired.id);
    const advanced = game.advanceGhostTrain(600).cannonballs.find((ball) => ball.id === fired.id);
    const expired = game.advanceGhostTrain(3000).cannonballs.some((ball) => ball.id === fired.id);
    return { fired, paired, advanced, expired };
  });

  expect(result.fired).toMatchObject({ piercing: true, cosmeticOnly: false, trajectoryVisible: true });
  expect(result.fired.mountOffset).toBeCloseTo(-1.42, 3);
  expect(result.paired.mountOffset).toBeCloseTo(1.42, 3);
  expect(Math.hypot(result.paired.x - result.fired.x, result.paired.z - result.fired.z)).toBeGreaterThan(2.2);
  expect(Math.hypot(result.paired.x - result.fired.x, result.paired.z - result.fired.z)).toBeLessThan(3.4);
  expect(result.advanced.dirX).toBeCloseTo(result.fired.dirX, 6);
  expect(result.advanced.dirZ).toBeCloseTo(result.fired.dirZ, 6);
  const travelX = result.advanced.x - result.fired.x;
  const travelZ = result.advanced.z - result.fired.z;
  expect(travelX * result.fired.dirZ - travelZ * result.fired.dirX).toBeCloseTo(0, 2);
  expect(Math.hypot(travelX, travelZ)).toBeCloseTo(result.fired.speed * 0.6, 1);
  expect(result.advanced.trajectoryStartX).toBeCloseTo(result.advanced.x, 3);
  expect(result.advanced.trajectoryStartZ).toBeCloseTo(result.advanced.z, 3);
  expect(result.advanced.trajectoryEndX).toBeCloseTo(result.fired.trajectoryEndX, 3);
  expect(result.advanced.trajectoryEndZ).toBeCloseTo(result.fired.trajectoryEndZ, 3);
  expect(result.advanced.trajectoryLength).toBeLessThan(result.fired.trajectoryLength - 10);
  expect(result.expired).toBe(false);
});

test("each scheduled cannon salvo telegraphs and fires both sides together", async ({ page }) => {
  await startHunt(page);
  await startTrain(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    game.setGhostTrainAiEnabled(true);
    game.forceGhostTrainAction("broadside", 4);
    const warning = game.advanceGhostTrain(260);
    const fired = game.advanceGhostTrain(300);
    return { warning, fired };
  });

  expect(result.warning.cannonballs).toHaveLength(0);
  expect(result.warning.telegraphs).toHaveLength(2);
  expect(result.warning.telegraphs.map((telegraph) => telegraph.side).sort()).toEqual([-1, 1]);
  expect(result.warning.telegraphs.every((telegraph) => telegraph.timeUntilShot > 0)).toBe(true);
  expect(result.warning.telegraphs.every((telegraph) => telegraph.trajectoryVisible)).toBe(true);
  expect(result.fired.cannonballs).toHaveLength(2);
  expect(result.fired.cannonballs.map((ball) => ball.side).sort()).toEqual([-1, 1]);
  expect(result.fired.cannonballs.every((ball) => ball.trajectoryVisible)).toBe(true);
});

test("broadside, crossfire, and ram attacks always fire both train broadsides", async ({ page }) => {
  await startHunt(page);

  const attacks = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    return ["broadside", "crossfire", "ram"].map((action) => {
      game.startWaveNow(10, "ghostTrain");
      game.clearEnemies();
      game.setPlayerMaxHp(9999, 9999);
      game.setGhostTrainAiEnabled(true);
      game.forceGhostTrainAction(action, 4);
      const warning = game.advanceGhostTrain(260);
      const fired = game.advanceGhostTrain(300);
      return { action, warning, fired };
    });
  });

  for (const attack of attacks) {
    expect(attack.warning.action).toBe(attack.action);
    expect(attack.warning.telegraphs).toHaveLength(2);
    expect(attack.warning.telegraphs.map((telegraph) => telegraph.side).sort()).toEqual([-1, 1]);
    expect(new Set(attack.warning.telegraphs.map((telegraph) => telegraph.segmentIndex)).size).toBe(1);
    expect(new Set(attack.warning.telegraphs.map((telegraph) => telegraph.mountOffset)).size).toBe(1);
    expect(attack.fired.cannonballs).toHaveLength(2);
    expect(attack.fired.cannonballs.map((ball) => ball.side).sort()).toEqual([-1, 1]);
    expect(new Set(attack.fired.cannonballs.map((ball) => ball.mountOffset)).size).toBe(1);
  }
});

test("each wagon cannon targets the nearest living player from its own muzzle", async ({ page }) => {
  await startHunt(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const multiplayer = window.__dustMultiplayerTest;
    multiplayer.startMockHost(["Host", "Near", "Other"]);
    game.startWaveNow(10, "ghostTrain");
    game.clearEnemies();
    game.setGhostTrainAiEnabled(false);
    game.forceGhostTrainAction("broadside", 4);

    const tail = game.getGhostTrainDiagnostics().segments[4];
    const farX = tail.x >= 0 ? -42 : 42;
    const farZ = tail.z >= 0 ? -42 : 42;
    multiplayer.setPlayerPosition("mock-player-1", farX, farZ);
    multiplayer.setPlayerPosition("mock-player-2", tail.x + 0.6, tail.z + 0.4);
    multiplayer.setPlayerPosition("mock-player-3", farX, -farZ);
    const firstState = game.fireGhostTrainCannon(4, 1, 0);
    const first = firstState.cannonballs[firstState.cannonballs.length - 1];
    const firstPlayers = multiplayer.getState().players;

    multiplayer.setPlayerPosition("mock-player-2", farX, farZ);
    multiplayer.setPlayerPosition("mock-player-3", tail.x - 0.5, tail.z - 0.3);
    const secondState = game.fireGhostTrainCannon(4, -1, 1);
    const second = secondState.cannonballs[secondState.cannonballs.length - 1];
    const secondPlayers = multiplayer.getState().players;

    const nearestTo = (ball, players) => players
      .filter((player) => player.alive)
      .map((player) => ({ id: player.id, distance: Math.hypot(player.x - ball.x, player.z - ball.z) }))
      .sort((a, b) => a.distance - b.distance || a.id.localeCompare(b.id))[0];
    return {
      first,
      second,
      firstNearest: nearestTo(first, firstPlayers),
      secondNearest: nearestTo(second, secondPlayers),
    };
  });

  expect(result.first.targetPlayerId).toBe("mock-player-2");
  expect(result.first.targetPlayerId).toBe(result.firstNearest.id);
  expect(result.second.targetPlayerId).toBe("mock-player-3");
  expect(result.second.targetPlayerId).toBe(result.secondNearest.id);
  expect(result.first.targetDistance).toBeLessThan(result.firstNearest.distance + 0.1);
  expect(result.second.targetDistance).toBeLessThan(result.secondNearest.distance + 0.1);
});

test("wagon cannon barrels turn toward their widened firing arc before the projectile leaves", async ({ page }) => {
  await startHunt(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const multiplayer = window.__dustMultiplayerTest;
    multiplayer.startMockHost(["Target"]);
    game.startWaveNow(10, "ghostTrain");
    game.clearEnemies();
    game.setGhostTrainAiEnabled(false);
    game.forceGhostTrainAction("broadside", 4);

    const tail = game.getGhostTrainDiagnostics().segments[4];
    const rightX = Math.cos(tail.facingAngle);
    const rightZ = -Math.sin(tail.facingAngle);
    const forwardX = Math.sin(tail.facingAngle);
    const forwardZ = Math.cos(tail.facingAngle);
    const players = multiplayer.getState().players;
    for (const player of players) multiplayer.setPlayerPosition(player.id, -180, -150);
    const target = players[0];
    multiplayer.setPlayerPosition(
      target.id,
      tail.x + rightX * 10 + forwardX * 12,
      tail.z + rightZ * 10 + forwardZ * 12
    );

    const firedState = game.fireGhostTrainCannon(4, 1, 0);
    const ball = firedState.cannonballs[firedState.cannonballs.length - 1];
    const mount = firedState.segments[4].cannonMounts.find((cannon) => cannon.side === 1 && cannon.offsetZ < 0);
    const crossfireLimit = game.forceGhostTrainAction("crossfire", 4).cannonAimLimit;
    const ramLimit = game.forceGhostTrainAction("ram", 4).cannonAimLimit;
    return { ball, mount, targetId: target.id, crossfireLimit, ramLimit };
  });

  const directionDelta = Math.atan2(
    Math.sin(result.ball.angle - result.ball.broadsideAngle),
    Math.cos(result.ball.angle - result.ball.broadsideAngle)
  );
  expect(result.ball.targetPlayerId).toBe(result.targetId);
  expect(result.ball.aimLimit).toBeCloseTo(0.92, 4);
  expect(Math.abs(result.ball.aimDelta)).toBeGreaterThan(0.6);
  expect(Math.abs(result.ball.aimDelta)).toBeLessThanOrEqual(result.ball.aimLimit + 0.0001);
  expect(directionDelta).toBeCloseTo(result.ball.aimDelta, 4);
  expect(result.mount.aimAngle).toBeCloseTo(result.ball.aimDelta, 4);
  expect(result.mount.targetAimAngle).toBeCloseTo(result.ball.aimDelta, 4);
  expect(result.mount.pivotRotation).toBeCloseTo(result.ball.aimDelta, 4);
  expect(result.crossfireLimit).toBeCloseTo(1.12, 4);
  expect(result.ramLimit).toBeCloseTo(1.02, 4);
});

test("cannon cadence accelerates sharply as wagons are destroyed", async ({ page }) => {
  await startHunt(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    game.setPlayerMaxHp(9999, 9999);

    const runBarrage = (destroyedWagons) => {
      game.startWaveNow(10, "ghostTrain");
      game.clearEnemies();
      game.setGhostTrainAiEnabled(false);
      for (let index = 0; index < destroyedWagons; index += 1) game.damageGhostTrainTail(9999, true);
      game.setGhostTrainAiEnabled(true);
      const before = game.forceGhostTrainAction("broadside", 4);
      const after = game.advanceGhostTrain(1800);
      return {
        phase: before.phase,
        tail: before.activeTailIndex,
        interval: before.cannonInterval,
        shotsPerSecond: before.cannonShotsPerSecond,
        cannonballs: after.cannonballs.length,
      };
    };

    return { fullTrain: runBarrage(0), oneWagon: runBarrage(3) };
  });

  expect(result.fullTrain).toMatchObject({ phase: 0, tail: 4, interval: 0.38 });
  expect(result.oneWagon).toMatchObject({ phase: 3, tail: 1, interval: 0.09 });
  expect(result.oneWagon.shotsPerSecond).toBeGreaterThan(result.fullTrain.shotsPerSecond * 3);
  expect(result.fullTrain.cannonballs).toBeGreaterThanOrEqual(3);
  expect(result.oneWagon.cannonballs).toBeGreaterThanOrEqual(10);
  expect(result.oneWagon.cannonballs).toBeGreaterThan(result.fullTrain.cannonballs * 3);
});

test("one spectral machine gun follows the last wagon and moves to the locomotive roof with 360-degree aim", async ({ page }) => {
  await startHunt(page);
  await startTrain(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const initial = game.getGhostTrainDiagnostics();
    game.setPlayerMaxHp(9999, 9999);
    game.forceGhostTrainAction("broadside", 4);

    let tail = game.getGhostTrainDiagnostics().segments[4];
    let forwardX = Math.sin(tail.facingAngle);
    let forwardZ = Math.cos(tail.facingAngle);
    game.setPlayerPosition(tail.x - forwardX * 7, tail.z - forwardZ * 7);
    const rearHpBefore = game.getPlayerHealth().hp;
    const rear = game.advanceGhostTrain(520);
    const rearHpAfter = game.getPlayerHealth().hp;

    tail = rear.segments[4];
    forwardX = Math.sin(tail.facingAngle);
    forwardZ = Math.cos(tail.facingAngle);
    game.setPlayerHp(9999);
    game.setPlayerPosition(tail.x + forwardX * 20, tail.z + forwardZ * 20);
    const frontSequence = rear.rearMachineGun.fireSequence;
    const front = game.advanceGhostTrain(500);
    const frontHp = game.getPlayerHealth().hp;

    game.forceGhostTrainAction("spectral", 2);
    tail = game.getGhostTrainDiagnostics().segments[4];
    forwardX = Math.sin(tail.facingAngle);
    forwardZ = Math.cos(tail.facingAngle);
    game.setPlayerHp(9999);
    game.setPlayerPosition(tail.x - forwardX * 6, tail.z - forwardZ * 6);
    const spectralSequence = game.getGhostTrainDiagnostics().rearMachineGun.fireSequence;
    const spectral = game.advanceGhostTrain(500);
    const spectralHp = game.getPlayerHealth().hp;

    game.startWaveNow(10, "ghostTrain");
    game.clearEnemies();
    game.setGhostTrainAiEnabled(false);
    game.damageGhostTrainTail(9999, true);
    const transferred = game.getGhostTrainDiagnostics();
    for (let index = 0; index < 3; index += 1) game.damageGhostTrainTail(9999, true);
    const locomotiveOnly = game.getGhostTrainDiagnostics();
    return {
      initial,
      rear,
      rearHpBefore,
      rearHpAfter,
      front,
      frontSequence,
      frontHp,
      spectral,
      spectralSequence,
      spectralHp,
      transferred,
      locomotiveOnly,
    };
  });

  expect(result.initial.rearMachineGun).toMatchObject({
    present: true,
    visible: true,
    attachedSegmentIndex: 4,
    spectralModel: true,
    materialOnlyAttack: true,
    active: false,
    zoneVisible: false,
    range: 55,
    sectorDegrees: 120,
    interval: 0.12,
    damage: 5,
    projectileSpeed: 50,
    projectileHitRadius: 0.18,
    projectileTravelTimeAtMaxRange: 1.1,
    dodgeableProjectiles: true,
    hitscanDamage: false,
  });
  expect(result.initial.segments.filter((segment) => segment.rearMachineGunMounted).map((segment) => segment.index)).toEqual([4]);
  expect(result.rearHpAfter).toBeLessThan(result.rearHpBefore);
  expect(result.rear.rearMachineGun).toMatchObject({
    active: true,
    targetPlayerId: "solo",
    zoneVisible: true,
    attachedSegmentIndex: 4,
    tracerCapacity: 16,
  });
  expect(result.rear.rearMachineGun.fireSequence).toBeGreaterThanOrEqual(3);
  expect(result.rear.rearMachineGun.tracerInUse).toBeLessThanOrEqual(12);
  expect(result.rear.rearMachineGun.drawCalls).toBeLessThanOrEqual(2);
  expect(result.front.rearMachineGun.active).toBe(false);
  expect(result.front.rearMachineGun.fireSequence).toBe(result.frontSequence);
  expect(result.spectralHp).toBe(9999);
  expect(result.spectral.rearMachineGun.active).toBe(false);
  expect(result.spectral.rearMachineGun.zoneVisible).toBe(false);
  expect(result.spectral.rearMachineGun.fireSequence).toBe(result.spectralSequence);
  expect(result.transferred.rearMachineGun).toMatchObject({ present: true, visible: true, attachedSegmentIndex: 3 });
  expect(result.transferred.segments.filter((segment) => segment.rearMachineGunMounted).map((segment) => segment.index)).toEqual([3]);
  expect(result.locomotiveOnly.rearMachineGun).toMatchObject({
    present: true,
    visible: true,
    attachedSegmentIndex: 0,
    locomotiveRoofMounted: true,
    sectorDegrees: 360,
    interval: 0.15,
    projectileSpeed: 45,
    projectileTravelTimeAtMaxRange: 1.222,
    active: false,
  });
  expect(result.locomotiveOnly.segments.filter((segment) => segment.rearMachineGunMounted).map((segment) => segment.index)).toEqual([0]);
});

test("rear machine gun bullets travel authoritatively and can be dodged without networking projectile objects", async ({ page }) => {
  await startHunt(page);
  await startTrain(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const prepare = () => {
      game.startWaveNow(10, "ghostTrain");
      game.clearEnemies();
      game.setGhostTrainAiEnabled(false);
      game.setGhostTrainMotionFrozen(true);
      game.setPlayerMaxHp(9999, 9999);
      game.forceGhostTrainAction("broadside", 4);
      const tail = game.getGhostTrainDiagnostics().segments[4];
      const forwardX = Math.sin(tail.facingAngle);
      const forwardZ = Math.cos(tail.facingAngle);
      const rightX = Math.cos(tail.facingAngle);
      const rightZ = -Math.sin(tail.facingAngle);
      return { tail, forwardX, forwardZ, rightX, rightZ };
    };

    const dodge = prepare();
    game.setPlayerPosition(dodge.tail.x - dodge.forwardX * 28, dodge.tail.z - dodge.forwardZ * 28);
    const dodgeHpBefore = game.getPlayerHealth().hp;
    const fired = game.advanceGhostTrain(120);
    game.forceGhostTrainAction("spectral", 3);
    game.setPlayerPosition(
      dodge.tail.x - dodge.forwardX * 28 + dodge.rightX * 6,
      dodge.tail.z - dodge.forwardZ * 28 + dodge.rightZ * 6
    );
    const dodged = game.advanceGhostTrain(1300);
    const dodgeHpAfter = game.getPlayerHealth().hp;

    const stationary = prepare();
    game.setPlayerPosition(stationary.tail.x - stationary.forwardX * 28, stationary.tail.z - stationary.forwardZ * 28);
    const stationaryHpBefore = game.getPlayerHealth().hp;
    const hit = game.advanceGhostTrain(900);
    const stationaryHpAfter = game.getPlayerHealth().hp;

    return {
      fired,
      dodged,
      hit,
      dodgeHpBefore,
      dodgeHpAfter,
      stationaryHpBefore,
      stationaryHpAfter,
    };
  });

  expect(result.fired.rearMachineGun).toMatchObject({
    active: true,
    range: 55,
    projectileSpeed: 50,
    dodgeableProjectiles: true,
    hitscanDamage: false,
  });
  expect(result.fired.rearMachineGun.fireSequence).toBeGreaterThan(0);
  expect(result.fired.rearMachineGun.authoritativeProjectilesInFlight).toBeGreaterThan(0);
  expect(result.dodgeHpAfter).toBe(result.dodgeHpBefore);
  expect(result.dodged.rearMachineGun.authoritativeMisses).toBeGreaterThan(0);
  expect(result.stationaryHpAfter).toBeLessThan(result.stationaryHpBefore);
  expect(result.hit.rearMachineGun.authoritativeHits).toBeGreaterThan(0);
  expect(result.hit.rearMachineGun.drawCalls).toBeLessThanOrEqual(2);
  expect(result.hit.rearMachineGun.tracerInUse).toBeLessThanOrEqual(result.hit.rearMachineGun.tracerCapacity);
  expect(result.hit.network.rearGunProjectileObjectsReplicated).toBe(false);
});

test("the host replicates rear machine gun aim and burst sequence without networking its tracers", async ({ page }) => {
  await startHunt(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const multiplayer = window.__dustMultiplayerTest;
    const clone = (value) => JSON.parse(JSON.stringify(value));
    multiplayer.startMockHost(["Host", "Guest"]);
    game.startWaveNow(10, "ghostTrain");
    game.clearEnemies();
    game.setGhostTrainAiEnabled(false);
    game.forceGhostTrainAction("broadside", 4);

    const tail = game.getGhostTrainDiagnostics().segments[4];
    const forwardX = Math.sin(tail.facingAngle);
    const forwardZ = Math.cos(tail.facingAngle);
    multiplayer.setPlayerPosition("mock-player-1", tail.x + forwardX * 28, tail.z + forwardZ * 28);
    multiplayer.setPlayerPosition("mock-player-2", tail.x - forwardX * 7, tail.z - forwardZ * 7);
    multiplayer.setHealth("mock-player-2", 120);
    const hostFirst = game.advanceGhostTrain(240);
    const firstWire = clone(multiplayer.buildWireSnapshot(false, false, "mock-player-2"));
    const decodedFirst = multiplayer.decodeBossState(firstWire.bossState);
    const hostFinal = game.advanceGhostTrain(360);
    multiplayer.buildWireSnapshot(false, false, "mock-player-2");
    const finalWire = clone(multiplayer.buildWireSnapshot(false, false, "mock-player-2"));
    const decodedFinal = multiplayer.decodeBossState(finalWire.bossState);
    const hostPlayers = multiplayer.getState().players;

    multiplayer.startMockGuest(["Host", "Guest"], 1);
    multiplayer.applySnapshot(firstWire);
    const guestFirst = game.getGhostTrainDiagnostics();
    game.advanceGhostTrain(250);
    const acquisitionsBeforeFinal = game.getGhostTrainDiagnostics().rearMachineGun.tracerAcquisitions;
    multiplayer.applySnapshot(finalWire);
    const guestFinal = game.getGhostTrainDiagnostics();
    const guestPlayers = multiplayer.getState().players;
    return {
      hostFirst,
      hostFinal,
      decodedFirst,
      decodedFinal,
      firstRawBytes: atob(firstWire.bossState).length,
      finalRawBytes: atob(finalWire.bossState).length,
      guestFirst,
      guestFinal,
      acquisitionsBeforeFinal,
      hostGuestHp: hostPlayers.find((player) => player.id === "mock-player-2").hp,
      replicaGuestHp: guestPlayers.find((player) => player.id === "mock-player-2").hp,
    };
  });

  expect(result.hostFirst.rearMachineGun.fireSequence).toBeGreaterThan(0);
  expect(result.hostFinal.rearMachineGun.fireSequence).toBeGreaterThan(result.hostFirst.rearMachineGun.fireSequence);
  expect(result.decodedFirst.rearGunActive).toBe(true);
  expect(result.decodedFinal.rearGunSeq).toBe(result.hostFinal.rearMachineGun.fireSequence);
  expect(Math.abs(result.decodedFinal.rearGunAim - result.hostFinal.rearMachineGun.aim)).toBeLessThan(0.03);
  expect(result.firstRawBytes).toBeLessThanOrEqual(84);
  expect(result.finalRawBytes).toBeLessThanOrEqual(36);
  expect(result.guestFirst.rearMachineGun).toMatchObject({ active: true, attachedSegmentIndex: 4 });
  expect(result.guestFirst.rearMachineGun.fireSequence).toBe(result.hostFirst.rearMachineGun.fireSequence);
  expect(result.guestFirst.rearMachineGun.tracerInUse).toBeGreaterThan(0);
  expect(result.guestFinal.rearMachineGun.fireSequence).toBe(result.hostFinal.rearMachineGun.fireSequence);
  expect(result.guestFinal.rearMachineGun.tracerAcquisitions).toBeGreaterThan(result.acquisitionsBeforeFinal);
  expect(Math.abs(result.guestFinal.rearMachineGun.targetAim - result.hostFinal.rearMachineGun.aim)).toBeLessThan(0.03);
  expect(result.hostGuestHp).toBeLessThan(120);
  expect(result.replicaGuestHp).toBe(result.hostGuestHp);
  expect(result.guestFinal.network.rearGunStateReplicated).toBe(true);
  expect(result.guestFinal.network.rearGunProjectileObjectsReplicated).toBe(false);
});

test("the material locomotive emits pooled damaging steam waves and its roof gun covers 360 degrees", async ({ page }) => {
  await startHunt(page);
  await startTrain(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    game.setPlayerMaxHp(9999, 9999);
    game.setGhostTrainMotionFrozen(true);
    game.forceGhostTrainAction("broadside", 3);
    const wagonPhase = game.advanceGhostTrain(1200);

    for (let index = 0; index < 4; index += 1) game.damageGhostTrainTail(9999, true);
    game.setGhostTrainMotionFrozen(true);
    game.forceGhostTrainAction("broadside", 4);
    const engine = game.getGhostTrainDiagnostics().segments[0];
    game.setPlayerPosition(engine.x + 10, engine.z);
    game.setPlayerHp(9999);
    const hpBefore = game.getPlayerHealth().hp;
    const firstWave = game.advanceGhostTrain(1100);
    const hpAfterFirst = game.getPlayerHealth().hp;
    const secondWave = game.advanceGhostTrain(1000);
    return { wagonPhase, firstWave, secondWave, hpBefore, hpAfterFirst };
  });

  expect(result.wagonPhase.steamWaveAttack.sequence).toBe(0);
  expect(result.wagonPhase.steamWaveAttack.activeCount).toBe(0);
  expect(result.firstWave).toMatchObject({ phase: 4, activeTailIndex: 0, materialized: true });
  expect(result.firstWave.rearMachineGun).toMatchObject({
    attachedSegmentIndex: 0,
    locomotiveRoofMounted: true,
    sectorDegrees: 360,
    interval: 0.15,
    projectileSpeed: 45,
    projectileTravelTimeAtMaxRange: 1.222,
    active: true,
    fullCircleVisible: true,
    rearSectorVisible: false,
  });
  expect(result.firstWave.rearMachineGun.fireSequence).toBeGreaterThan(0);
  expect(result.firstWave.steamWaveAttack).toMatchObject({
    finalPhaseOnly: true,
    materialOnly: true,
    damage: 24,
    active: true,
    activeCount: 1,
    hitCount: 1,
    damageApplied: 24,
    lastHitPlayerId: "solo",
    batched: true,
    drawCalls: 2,
  });
  expect(result.firstWave.steamWaveAttack.cloudInstances).toBeGreaterThan(0);
  expect(result.firstWave.steamWaveAttack.cloudInstances).toBeLessThanOrEqual(result.firstWave.steamWaveAttack.cloudCapacity);
  expect(result.firstWave.steamWaveAttack.cloudCandidates).toBeLessThanOrEqual(result.firstWave.steamWaveAttack.cloudCapacity);
  expect(result.firstWave.steamWaveAttack.cloudInstances + result.firstWave.steamWaveAttack.cloudCulledOffscreen)
    .toBe(result.firstWave.steamWaveAttack.cloudCandidates);
  expect(result.firstWave.steamWaveAttack).toMatchObject({ usesGlobalParticles: false, cachedNoiseFloatsPerWave: 360 });
  expect(result.firstWave.steamWaveAttack.sequence).toBe(1);
  expect(result.firstWave.steamWaveAttack.pooledStates).toBe(3);
  expect(result.hpAfterFirst).toBeLessThan(result.hpBefore);
  expect(result.secondWave.steamWaveAttack.sequence).toBeGreaterThanOrEqual(2);
  expect(result.secondWave.steamWaveAttack.hitCount).toBeGreaterThanOrEqual(2);
  expect(result.secondWave.steamWaveAttack.activeCount).toBeLessThanOrEqual(result.secondWave.steamWaveAttack.capacity);
  expect(result.secondWave.steamWaveAttack.drawCalls).toBeLessThanOrEqual(2);
});

test("steam waves replicate as compact cosmetic state while damage remains host authoritative", async ({ page }) => {
  await startHunt(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const multiplayer = window.__dustMultiplayerTest;
    const clone = (value) => JSON.parse(JSON.stringify(value));
    multiplayer.startMockHost(["Host", "Guest"]);
    game.startWaveNow(10, "ghostTrain");
    game.clearEnemies();
    game.setGhostTrainAiEnabled(false);
    game.setGhostTrainMotionFrozen(true);
    for (let index = 0; index < 4; index += 1) game.damageGhostTrainTail(9999, true);
    game.forceGhostTrainAction("broadside", 4);
    const engine = game.getGhostTrainDiagnostics().segments[0];
    multiplayer.setPlayerPosition("mock-player-1", engine.x + 10, engine.z);
    multiplayer.setPlayerPosition("mock-player-2", engine.x - 10, engine.z);
    multiplayer.setHealth("mock-player-1", 9999);
    multiplayer.setHealth("mock-player-2", 9999);
    const host = game.advanceGhostTrain(420);
    const wire = clone(multiplayer.buildWireSnapshot(true, false, "mock-player-2"));
    const decoded = multiplayer.decodeBossState(wire.bossState);
    const rawBytes = atob(wire.bossState).length;

    multiplayer.startMockGuest(["Host", "Guest"], 1);
    multiplayer.applySnapshot(wire);
    const guestInitial = game.getGhostTrainDiagnostics();
    const guestAfter = game.advanceGhostTrain(1000);
    return { host, decoded, rawBytes, guestInitial, guestAfter };
  });

  expect(result.host.steamWaveAttack.sequence).toBe(1);
  expect(result.decoded.steamWaveSeq).toBe(result.host.steamWaveAttack.sequence);
  expect(result.decoded.steamWaveAge).toBeGreaterThanOrEqual(0);
  expect(Math.abs(result.decoded.steamWaveAge - result.host.steamWaveAttack.newestAge)).toBeLessThan(0.02);
  expect(result.rawBytes).toBeLessThanOrEqual(90);
  expect(result.guestInitial.steamWaveAttack).toMatchObject({
    activeCount: 1,
    sequence: 1,
    damageAuthoritative: false,
    batched: true,
    hitCount: 0,
  });
  expect(result.guestInitial.steamWaveAttack.drawCalls).toBeGreaterThanOrEqual(1);
  expect(result.guestInitial.steamWaveAttack.drawCalls).toBeLessThanOrEqual(2);
  expect(result.guestInitial.network.steamWaveStateReplicated).toBe(true);
  expect(result.guestInitial.network.steamWaveParticleObjectsReplicated).toBe(false);
  expect(result.guestAfter.steamWaveAttack.hitCount).toBe(0);
});

test("sustained steam clouds stay bounded and fully return to their pool", async ({ page }) => {
  await startHunt(page);
  await startTrain(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    game.setPlayerMaxHp(9999, 9999);
    game.setGhostTrainMotionFrozen(true);
    for (let index = 0; index < 4; index += 1) game.damageGhostTrainTail(9999, true);
    game.forceGhostTrainAction("broadside", 20);
    const during = game.advanceGhostTrain(12000).steamWaveAttack;
    game.forceGhostTrainAction("spectral", 4);
    const after = game.advanceGhostTrain(2000).steamWaveAttack;
    // The final locomotive is deliberately material during spectral routing,
    // so its steam remains active there. Replacing the encounter must still
    // return every state and instance to the shared pool.
    game.startWaveNow(10, "ghostTrain");
    game.clearEnemies();
    game.setGhostTrainAiEnabled(false);
    const recycled = game.getGhostTrainDiagnostics().steamWaveAttack;
    return { during, after, recycled };
  });

  expect(result.during.sequence).toBeGreaterThanOrEqual(10);
  expect(result.during.activeCount).toBeLessThanOrEqual(result.during.capacity);
  expect(result.during.activeCount + result.during.pooledStates).toBe(result.during.capacity);
  expect(result.during.cloudCandidates).toBeLessThanOrEqual(result.during.cloudCapacity);
  expect(result.during.cloudInstances + result.during.cloudCulledOffscreen).toBe(result.during.cloudCandidates);
  expect(result.during.peakVisibleCloudInstances).toBeLessThanOrEqual(result.during.cloudCapacity);
  expect(result.during.drawCalls).toBeGreaterThanOrEqual(1);
  expect(result.during.drawCalls).toBeLessThanOrEqual(2);
  expect(result.after.activeCount).toBeLessThanOrEqual(result.after.capacity);
  expect(result.after.activeCount + result.after.pooledStates).toBe(result.after.capacity);
  expect(result.after.cloudInstances).toBeLessThanOrEqual(result.after.cloudCapacity);
  expect(result.after.drawCalls).toBeLessThanOrEqual(2);
  expect(result.recycled).toMatchObject({ activeCount: 0, pooledStates: 4, drawCalls: 0, cloudInstances: 0, cloudCandidates: 0 });
});

test("the fast spectral train patrols spread players and hooks around a clustered group", async ({ page }) => {
  await startHunt(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const multiplayer = window.__dustMultiplayerTest;
    multiplayer.startMockHost(["West", "East", "North"]);
    multiplayer.setPlayerPosition("mock-player-1", -32, -12);
    multiplayer.setPlayerPosition("mock-player-2", 32, -12);
    multiplayer.setPlayerPosition("mock-player-3", 0, 32);
    game.startWaveNow(10, "ghostTrain");
    game.clearEnemies();
    game.setGhostTrainAiEnabled(false);

    const spreadStart = game.getGhostTrainDiagnostics();
    const seenTargets = new Set();
    const minimumDistances = new Map(multiplayer.getState().players.map((player) => [player.id, Infinity]));
    let spreadEnd = spreadStart;
    for (let step = 0; step < 240; step += 1) {
      spreadEnd = game.advanceGhostTrain(250);
      seenTargets.add(spreadEnd.targetPlayerId);
      const engine = spreadEnd.segments[0];
      for (const player of multiplayer.getState().players) {
        minimumDistances.set(player.id, Math.min(minimumDistances.get(player.id), Math.hypot(player.x - engine.x, player.z - engine.z)));
      }
      const closeVisits = [...minimumDistances.values()].filter((distance) => distance <= 16).length;
      const completedVisits = new Set(spreadEnd.patrol.visitedPlayerIds).size;
      if (seenTargets.size === 3 && closeVisits >= 2 && completedVisits >= 2) break;
    }

    multiplayer.setPlayerPosition("mock-player-1", -2, 0);
    multiplayer.setPlayerPosition("mock-player-2", 2, 0);
    multiplayer.setPlayerPosition("mock-player-3", 0, 2);
    game.startWaveNow(10, "ghostTrain");
    game.clearEnemies();
    game.setGhostTrainAiEnabled(false);
    let clustered = game.getGhostTrainDiagnostics();
    let closestHookDistance = Infinity;
    for (let step = 0; step < 40; step += 1) {
      clustered = game.advanceGhostTrain(250);
      const players = multiplayer.getState().players;
      const centerX = players.reduce((sum, player) => sum + player.x, 0) / players.length;
      const centerZ = players.reduce((sum, player) => sum + player.z, 0) / players.length;
      closestHookDistance = Math.min(closestHookDistance, Math.hypot(clustered.segments[0].x - centerX, clustered.segments[0].z - centerZ));
    }
    for (let index = 0; index < 4; index += 1) game.damageGhostTrainTail(9999, true);
    game.advanceGhostTrain(3200);
    game.forceGhostTrainAction("spectral", 3);
    const runawayLoop = game.getGhostTrainDiagnostics();

    return {
      spreadStart,
      spreadEnd,
      seenTargets: [...seenTargets],
      minimumDistances: Object.fromEntries(minimumDistances),
      clustered,
      closestHookDistance,
      runawayLoop,
    };
  });

  expect(result.spreadStart.action).toBe("spectral");
  expect(result.spreadStart.speed).toBeGreaterThan(result.spreadStart.baseSpeed * 2.4);
  expect(result.spreadEnd.patrol.groupHook).toBe(false);
  expect(new Set(result.seenTargets).size).toBe(3);
  expect(new Set(result.spreadEnd.patrol.visitedPlayerIds).size).toBeGreaterThanOrEqual(2);
  expect(Object.values(result.minimumDistances).filter((distance) => distance <= 16).length).toBeGreaterThanOrEqual(2);
  expect(result.clustered.patrol.groupHook).toBe(true);
  expect(result.clustered.patrol.clusterRadius).toBeLessThanOrEqual(10);
  expect(result.clustered.patrol.hookRadius).toBe(38);
  expect(result.clustered.track.spectralTurnRadius).toBe(30);
  expect(result.clustered.track.minimumSpectralLoopLength).toBeGreaterThan(result.clustered.track.spectralVisibleSpanBudget);
  expect(result.clustered.track.spectralLoopClearance).toBeGreaterThan(30);
  expect(result.closestHookDistance).toBeLessThanOrEqual(result.clustered.patrol.hookRadius + 7);
  expect(result.runawayLoop).toMatchObject({ phase: 4, activeTailIndex: 0, action: "spectral" });
  expect(result.runawayLoop.patrol).toMatchObject({ groupHook: false, finalPursuit: true });
  expect(result.runawayLoop.track.spectralTurnRadius).toBe(15.5);
  expect(result.runawayLoop.track.fadeDelay).toBe(0.55);
  expect(result.runawayLoop.track.tailLength).toBe(0);
  expect(result.runawayLoop.track.maximumSpectralTurnDegreesPerSecond).toBeCloseTo(
    result.runawayLoop.speed / result.runawayLoop.track.spectralTurnRadius * 180 / Math.PI,
    1
  );
  expect(result.runawayLoop.track.maximumSpectralTurnDegreesPerSecond).toBeGreaterThan(60);
  expect(result.runawayLoop.track.maximumSpectralTurnDegreesPerSecond).toBeLessThan(70);
  expect(result.runawayLoop.track.minimumSpectralLoopLength).toBeGreaterThan(result.runawayLoop.track.spectralVisibleSpanBudget);
  expect(result.runawayLoop.track.spectralLoopClearance).toBeGreaterThan(4);
});

test("with two health bars left the train uses an instanced phantom tunnel to attack the next player", async ({ page }) => {
  await startHunt(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const multiplayer = window.__dustMultiplayerTest;
    const clone = (value) => JSON.parse(JSON.stringify(value));
    multiplayer.startMockHost(["Host", "Next"]);
    multiplayer.setPlayerPosition("mock-player-1", -28, -18);
    multiplayer.setPlayerPosition("mock-player-2", 30, 22);
    game.startWaveNow(10, "ghostTrain");
    game.clearEnemies();
    game.setGhostTrainAiEnabled(false);
    for (let index = 0; index < 3; index += 1) game.damageGhostTrainTail(9999, true);
    game.advanceGhostTrain(3200);

    game.setGhostTrainAiEnabled(true);
    game.forceGhostTrainAction("dematerialize", 0.05);
    const entering = game.advanceGhostTrain(100);
    const wireEntering = clone(multiplayer.buildWireSnapshot(false, false, "mock-player-2"));
    const decodedEntering = multiplayer.decodeBossState(wireEntering.bossState);
    const dissolving = game.advanceGhostTrain(400);
    const emerging = game.advanceGhostTrain(1000);
    const wireEmerging = clone(multiplayer.buildWireSnapshot(false, false, "mock-player-2"));
    const emergingFrames = [{
      host: emerging,
      wire: wireEmerging,
      decoded: multiplayer.decodeBossState(wireEmerging.bossState),
    }];
    for (let sample = 0; sample < 5; sample += 1) {
      const host = game.advanceGhostTrain(150);
      const wire = clone(multiplayer.buildWireSnapshot(false, false, "mock-player-2"));
      emergingFrames.push({ host, wire, decoded: multiplayer.decodeBossState(wire.bossState) });
    }

    let transition = emergingFrames[emergingFrames.length - 1].host;
    let elapsed = 0;
    while (transition.action === "spectral" && elapsed < 4000) {
      transition = game.advanceGhostTrain(50);
      elapsed += 50;
    }
    const getTunnelTailClearance = (state) => {
      const portal = state.tunnel.exitPortal;
      const tail = state.segments[state.activeTailIndex];
      if (!portal || !tail) return null;
      const forwardX = Math.sin(portal.angle);
      const forwardZ = Math.cos(portal.angle);
      return (tail.x - portal.x) * forwardX + (tail.z - portal.z) * forwardZ - 3.55;
    };
    const transitionTailClearance = getTunnelTailClearance(transition);
    const wireTransition = clone(multiplayer.buildWireSnapshot(false, false, "mock-player-2"));
    const regularBytes = game.getGhostTrainDiagnostics().network.regularBytes;

    multiplayer.startMockGuest(["Host", "Next"], 1);
    multiplayer.applySnapshot(wireEntering);
    const guestEntering = game.getGhostTrainDiagnostics();
    // Emulate latest-only replacement dropping the first two exit-route
    // packets. The surviving packet must still be self-contained.
    const deliveredEmergingIndices = [2, 3, 5];
    const guestEmergingFrames = [];
    const guestEmergingImmediateFrames = [];
    const firstDelivered = emergingFrames[deliveredEmergingIndices[0]];
    game.advanceGhostTrain(Math.max(17, Math.round((firstDelivered.wire.time - wireEntering.time) * 1000)));
    const guestBeforeEmerging = game.getGhostTrainDiagnostics();
    multiplayer.applySnapshot(firstDelivered.wire);
    guestEmergingImmediateFrames.push(game.getGhostTrainDiagnostics());
    game.advanceGhostTrain(17);
    guestEmergingFrames.push(game.getGhostTrainDiagnostics());
    for (let delivery = 1; delivery < deliveredEmergingIndices.length; delivery += 1) {
      const previous = emergingFrames[deliveredEmergingIndices[delivery - 1]];
      const next = emergingFrames[deliveredEmergingIndices[delivery]];
      game.advanceGhostTrain(Math.max(17, Math.round((next.wire.time - previous.wire.time) * 1000)));
      multiplayer.applySnapshot(next.wire);
      guestEmergingImmediateFrames.push(game.getGhostTrainDiagnostics());
      game.advanceGhostTrain(17);
      guestEmergingFrames.push(game.getGhostTrainDiagnostics());
    }
    const guestEmerging = guestEmergingFrames[0];
    multiplayer.applySnapshot(wireTransition);
    game.advanceGhostTrain(17);
    const guestTransition = game.getGhostTrainDiagnostics();
    const guestTransitionTailClearance = getTunnelTailClearance(guestTransition);

    return {
      entering,
      decodedEntering,
      dissolving,
      emerging,
      transition,
      transitionTailClearance,
      elapsed,
      regularBytes,
      guestEntering,
      guestBeforeEmerging,
      guestEmerging,
      emergingFrames,
      deliveredEmergingIndices,
      guestEmergingImmediateFrames,
      guestEmergingFrames,
      guestTransition,
      guestTransitionTailClearance,
    };
  });

  expect(result.entering).toMatchObject({ phase: 3, activeTailIndex: 1, action: "spectral" });
  expect(result.entering.tunnel).toMatchObject({
    active: true,
    teleported: false,
    stage: "entering",
    targetPlayerId: "mock-player-2",
    instanced: true,
    stoneGate: true,
    monumentalGate: true,
    closedRoof: true,
    roofAxisLockedToRail: true,
    blackPortal: true,
    portalDepth: 4.2,
    alignmentMode: "visible-rail-chord",
    progressiveDissolve: true,
    dissolveMode: "world-plane-dither",
    dissolveWidth: 1.25,
    wholeSegmentPopping: false,
    dissolveVisualObjectsReplicated: false,
    visibleRoofSlabCount: 4,
    visiblePylonCount: 12,
    visibleStoneCount: 42,
    visiblePortalCount: 1,
    drawCalls: 6,
  });
  expect(result.entering.tunnel.entryPortal).not.toBeNull();
  expect(result.entering.tunnel.exitPortal).not.toBeNull();
  expect(result.entering.tunnel.entryPortalLead).toBe(7.5);
  expect(result.entering.tunnel.entryOpenDelay).toBe(0.25);
  expect(result.entering.tunnel.entryPortalDistance - result.entering.tunnel.entryStartDistance).toBeCloseTo(7.5, 2);
  expect(result.entering.tunnel.entryRailClipDistance - result.entering.tunnel.entryStartDistance).toBeGreaterThanOrEqual(4.84);
  expect(result.entering.tunnel.currentRouteSequence).toBe(result.entering.tunnel.entryRouteSequence);
  expect(Math.hypot(
    result.dissolving.tunnel.entryPortal.x - result.entering.tunnel.entryPortal.x,
    result.dissolving.tunnel.entryPortal.z - result.entering.tunnel.entryPortal.z
  )).toBeLessThan(0.001);
  expect(result.entering.tunnel.entryRailsStopAtPortal).toBe(true);
  expect(result.entering.tunnel.entryRailsStopBeforeOpening).toBe(true);
  expect(result.entering.tunnel.entryPortalDistance - result.entering.tunnel.entryRailClipDistance).toBeGreaterThanOrEqual(2.649);
  expect(result.entering.tunnel.rimsConfined).toBe(true);
  expect(result.entering.tunnel.rimMaxTwist).toBeLessThanOrEqual(0.0151);
  expect(result.entering.track.tunnelClipMode).toBe("entry");
  expect(result.entering.track.tunnelClipMaxDistance).toBeCloseTo(result.entering.tunnel.entryRailClipDistance, 3);
  expect(result.entering.track.lastVisibleDistance).toBeLessThanOrEqual(result.entering.tunnel.entryRailClipDistance + 0.001);
  expect(result.entering.hud.status).toContain("PHANTOM TUNNEL");
  expect(result.entering.network.regularBytes).toBeLessThanOrEqual(32);
  expect(result.decodedEntering.track).toHaveLength(16);
  expect(result.dissolving.tunnel).toMatchObject({
    active: true,
    teleported: false,
    progressiveDissolve: true,
    dissolveActive: true,
    wholeSegmentPopping: false,
  });
  expect(result.dissolving.tunnel.partialSegmentCount).toBeGreaterThanOrEqual(1);

  expect(result.emerging.tunnel).toMatchObject({
    active: true,
    teleported: true,
    stage: "emerging",
    targetPlayerId: "mock-player-2",
    targetLocked: true,
    guaranteedAttackApproach: true,
    routeRebased: true,
    stoneGate: true,
    monumentalGate: true,
    closedRoof: true,
    roofAxisLockedToRail: true,
    blackPortal: true,
    portalDepth: 4.2,
    alignmentMode: "visible-rail-chord",
    progressiveDissolve: true,
    dissolveMode: "world-plane-dither",
    dissolveWidth: 1.25,
    wholeSegmentPopping: false,
    dissolveVisualObjectsReplicated: false,
    visibleRoofSlabCount: 4,
    visiblePylonCount: 12,
    visibleStoneCount: 42,
    visiblePortalCount: 1,
    drawCalls: 6,
  });
  expect(result.emerging.tunnel.visibleSegments).toBeLessThanOrEqual(2);
  expect(result.emerging.tunnel.fullyOccludedBeforeTeleport).toBe(true);
  expect(result.emerging.tunnel.visibleSegmentsBeforeTeleport).toBe(0);
  expect(result.emerging.tunnel.currentRouteSequence).toBe(result.emerging.tunnel.entryRouteSequence + 1);
  expect(result.emerging.tunnel.peakDrawCalls).toBeLessThanOrEqual(6);
  expect(result.emerging.tunnel.staticSkips).toBeGreaterThan(0);
  expect(result.emerging.tunnel.exitRailsStartAtPortal).toBe(true);
  expect(result.emerging.tunnel.exitRailsStartAfterOpening).toBe(true);
  expect(result.emerging.tunnel.exitRailClipDistance - result.emerging.tunnel.exitPortalDistance).toBeGreaterThanOrEqual(2.649);
  expect(result.emerging.track.tunnelClipMode).toBe("exit");
  expect(result.emerging.track.tunnelClipMinDistance).toBeCloseTo(result.emerging.tunnel.exitRailClipDistance, 3);
  expect(result.emerging.track.firstVisibleDistance).toBeGreaterThanOrEqual(result.emerging.tunnel.exitRailClipDistance - 0.001);
  expect(result.emerging.network.regularBytes).toBeLessThanOrEqual(32);
  expect(result.emerging.network.keyframeBytes).toBeLessThanOrEqual(80);

  expect(result.transition.action).toBe("materialize");
  expect(result.elapsed).toBeLessThan(4000);
  expect(result.transition.tunnel.exitTravel).toBeCloseTo(17.05, 2);
  expect(result.transition.tunnel.fullyCleared).toBe(true);
  expect(result.transitionTailClearance).toBeGreaterThanOrEqual(1.7);
  expect(result.transition.approach.lastMaterializeEntry).toMatchObject({
    targetPlayerId: "mock-player-2",
    visible: true,
    withinReturnFireRange: true,
  });
  expect(result.transition.approach.lastMaterializeEntry.distance).toBeGreaterThanOrEqual(14);
  expect(result.transition.approach.lastMaterializeEntry.distance).toBeLessThanOrEqual(35);
  expect(result.regularBytes).toBeLessThanOrEqual(32);

  expect(result.guestEntering).toMatchObject({ replica: true, action: "spectral" });
  expect(result.guestEntering.tunnel).toMatchObject({ active: true, teleported: false, progressiveDissolve: true, drawCalls: 6, entryRailsStopAtPortal: true });
  expect(result.guestEntering.track.tunnelClipMode).toBe("entry");
  expect(result.guestBeforeEmerging.tunnel).toMatchObject({
    active: true,
    teleported: false,
    replicaHoldHidden: true,
    replicaAwaitingRoute: true,
    visibleSegments: 0,
  });
  expect(result.guestBeforeEmerging.segments.filter((segment) => segment.attached).every((segment) => !segment.visible)).toBe(true);
  expect(result.guestEmerging.tunnel).toMatchObject({ active: true, teleported: true, progressiveDissolve: true, drawCalls: 6, exitRailsStartAtPortal: true });
  expect(result.guestEmerging.tunnel.visibleSegments).toBe(0);
  expect(result.guestEmerging.segments.filter((segment) => segment.attached).every((segment) => !segment.visible)).toBe(true);
  expect(result.guestEmergingImmediateFrames[0].tunnel.replicaHoldHidden).toBe(true);
  expect(result.guestEmergingImmediateFrames.slice(1).every((frame) => !frame.tunnel.replicaHoldHidden)).toBe(true);
  expect(result.guestEmerging.track.tunnelClipMode).toBe("exit");
  expect(result.guestEmergingFrames.every((frame) => frame.tunnel.replicaPortalWorldLocked)).toBe(true);
  expect(result.guestEmergingFrames.every((frame) => frame.track.tunnelClipMode === "exit")).toBe(true);
  const guestExitPortal = result.guestEmergingFrames[0].tunnel.exitPortal;
  const maximumGuestPortalDrift = Math.max(...result.guestEmergingFrames.map((frame) => Math.hypot(
    frame.tunnel.exitPortal.x - guestExitPortal.x,
    frame.tunnel.exitPortal.z - guestExitPortal.z
  )));
  expect(maximumGuestPortalDrift).toBeLessThan(0.01);
  const guestEngineStart = result.guestEmergingFrames[0].segments[0];
  const guestEngineEnd = result.guestEmergingFrames[result.guestEmergingFrames.length - 1].segments[0];
  expect(Math.hypot(guestEngineEnd.x - guestEngineStart.x, guestEngineEnd.z - guestEngineStart.z)).toBeGreaterThan(2);
  expect(Math.hypot(
    guestExitPortal.x - result.emergingFrames[0].host.tunnel.exitPortal.x,
    guestExitPortal.z - result.emergingFrames[0].host.tunnel.exitPortal.z
  )).toBeLessThan(1);
  expect(result.emergingFrames.every((frame) => Array.isArray(frame.decoded.track) && frame.decoded.track.length === 16)).toBe(true);
  const firstDeliveredFrame = result.emergingFrames[result.deliveredEmergingIndices[0]];
  expect(firstDeliveredFrame.decoded.routeSeq).toBeGreaterThan(result.decodedEntering.routeSeq);
  expect(Math.hypot(
    result.guestBeforeEmerging.segments[0].x - firstDeliveredFrame.decoded.x,
    result.guestBeforeEmerging.segments[0].z - firstDeliveredFrame.decoded.z
  )).toBeGreaterThan(20);
  expect(Math.hypot(
    result.guestEmergingFrames[0].segments[0].x - firstDeliveredFrame.decoded.x,
    result.guestEmergingFrames[0].segments[0].z - firstDeliveredFrame.decoded.z
  )).toBeLessThan(0.5);
  expect(result.guestTransition).toMatchObject({ replica: true, action: "materialize" });
  expect(result.guestTransition.tunnel.active).toBe(false);
  if (result.guestTransition.tunnel.visiblePortalCount > 0) {
    expect(result.guestTransitionTailClearance).toBeGreaterThanOrEqual(1.7);
  }
  expect(result.guestTransition.network.tunnelDerivedFromCompactActionState).toBe(true);
  expect(result.guestTransition.network.tunnelVisualObjectsReplicated).toBe(false);
});

test("a tunnel exit keeps one route after target disconnect and reconstructs a late guest portal", async ({ page }) => {
  await startHunt(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const multiplayer = window.__dustMultiplayerTest;
    const clone = (value) => JSON.parse(JSON.stringify(value));
    const angleDelta = (left, right) => Math.atan2(Math.sin(left - right), Math.cos(left - right));
    multiplayer.startMockHost(["Host", "Target"]);
    multiplayer.setPlayerPosition("mock-player-1", -28, -18);
    multiplayer.setPlayerPosition("mock-player-2", 30, 22);
    game.startWaveNow(10, "ghostTrain");
    game.clearEnemies();
    game.setGhostTrainAiEnabled(false);
    for (let index = 0; index < 3; index += 1) game.damageGhostTrainTail(9999, true);
    game.advanceGhostTrain(3200);
    game.setGhostTrainAiEnabled(true);
    game.forceGhostTrainAction("dematerialize", 0.05);

    let emerging = game.advanceGhostTrain(100);
    for (let guard = 0; guard < 40 && !emerging.tunnel.teleported; guard += 1) {
      emerging = game.advanceGhostTrain(50);
    }
    const routeAfterTeleport = emerging.tunnel.currentRouteSequence;
    const targetPlayerId = emerging.tunnel.targetPlayerId;
    multiplayer.setConnected(targetPlayerId, false);

    const activeExitFrames = [];
    let previousEngine = emerging.segments[0];
    let hostLate = emerging;
    for (let step = 0; step < 24 && hostLate.tunnel.active; step += 1) {
      hostLate = game.advanceGhostTrain(50);
      if (!hostLate.tunnel.active) break;
      const engine = hostLate.segments[0];
      activeExitFrames.push({
        routeSequence: hostLate.tunnel.currentRouteSequence,
        engineStep: Math.hypot(engine.x - previousEngine.x, engine.z - previousEngine.z),
      });
      previousEngine = engine;
    }

    const lateWire = clone(multiplayer.buildWireSnapshot(false, false, "mock-player-2"));
    const decodedLate = multiplayer.decodeBossState(lateWire.bossState);
    multiplayer.startMockGuest(["Host", "Target"], 1);
    multiplayer.applySnapshot(lateWire);
    const guestImmediate = game.getGhostTrainDiagnostics();
    const guestFirstFrame = game.advanceGhostTrain(17);
    const guestSecondFrame = game.advanceGhostTrain(17);

    return {
      emerging,
      routeAfterTeleport,
      targetPlayerId,
      activeExitFrames,
      hostLate,
      decodedLate,
      guestImmediate,
      guestFirstFrame,
      guestSecondFrame,
      portalDrift: Math.hypot(
        hostLate.tunnel.exitPortal.x - guestImmediate.tunnel.exitPortal.x,
        hostLate.tunnel.exitPortal.z - guestImmediate.tunnel.exitPortal.z
      ),
      portalAngleDelta: Math.abs(angleDelta(
        hostLate.tunnel.exitPortal.angle,
        guestImmediate.tunnel.exitPortal.angle
      )),
    };
  });

  expect(result.emerging.tunnel).toMatchObject({ active: true, teleported: true });
  expect(result.targetPlayerId).toBe("mock-player-2");
  expect(result.routeAfterTeleport).toBe(result.emerging.tunnel.entryRouteSequence + 1);
  expect(result.activeExitFrames.length).toBeGreaterThan(10);
  expect(result.activeExitFrames.every((frame) => frame.routeSequence === result.routeAfterTeleport)).toBe(true);
  expect(Math.max(...result.activeExitFrames.map((frame) => frame.engineStep))).toBeLessThan(1.5);
  expect(result.hostLate.tunnel).toMatchObject({ active: true, teleported: true, stage: "emerging" });
  expect(result.decodedLate.track).toHaveLength(16);
  expect(result.guestImmediate.tunnel).toMatchObject({
    active: true,
    teleported: true,
    replicaHoldHidden: true,
    replicaAwaitingRoute: false,
    visibleSegments: 0,
    roofAxisLockedToRail: true,
  });
  expect(result.portalDrift).toBeLessThan(1);
  expect(result.portalAngleDelta).toBeLessThan(0.3);
  expect(result.guestFirstFrame.tunnel.visibleSegments).toBe(0);
  expect(result.guestSecondFrame.tunnel.replicaHoldHidden).toBe(false);
  expect(result.guestSecondFrame.tunnel.visibleSegments).toBeGreaterThan(0);
  expect(result.guestSecondFrame.track.tunnelClipMode).toBe("exit");
});

test("a missed pass tunnels on both last stages while the final locomotive remains corporeal", async ({ page }) => {
  await startHunt(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const multiplayer = window.__dustMultiplayerTest;
    const clone = (value) => JSON.parse(JSON.stringify(value));

    const missPass = (destroyedWagons) => {
      game.startWaveNow(10, "ghostTrain");
      game.clearEnemies();
      game.setGhostTrainAiEnabled(false);
      game.setPlayerMaxHp(9999, 9999);
      for (let index = 0; index < destroyedWagons; index += 1) game.damageGhostTrainTail(9999, true);
      game.advanceGhostTrain(3200);
      game.setGhostTrainAiEnabled(true);
      game.forceGhostTrainAction("spectral", 3.2);

      let state = game.getGhostTrainDiagnostics();
      let materialRun = null;
      for (let step = 0; step < 45 && !state.tunnel.active; step += 1) {
        state = game.advanceGhostTrain(100);
        if (!state.approach.active || state.tunnel.active) continue;
        if (state.phase === 4 && !materialRun) materialRun = state;
        const tail = state.segments[state.activeTailIndex];
        const forwardX = Math.sin(tail.facingAngle);
        const forwardZ = Math.cos(tail.facingAngle);
        game.setPlayerPosition(tail.x - forwardX * 12, tail.z - forwardZ * 12);
      }
      const entering = game.getGhostTrainDiagnostics();
      const emerging = entering.tunnel.active ? game.advanceGhostTrain(1500) : entering;
      return { materialRun, entering, emerging };
    };

    const oneWagon = missPass(3);
    const locomotiveOnly = missPass(4);

    multiplayer.startMockHost(["Host", "Guest"]);
    game.startWaveNow(10, "ghostTrain");
    game.clearEnemies();
    game.setGhostTrainAiEnabled(false);
    for (let index = 0; index < 4; index += 1) game.damageGhostTrainTail(9999, true);
    game.advanceGhostTrain(3200);
    game.setGhostTrainAiEnabled(true);
    game.forceGhostTrainAction("dematerialize", 0.05);
    const hostEntering = game.advanceGhostTrain(100);
    const hostTunnelDamage = game.damageGhostTrainTail(10, false);
    const enteringWire = clone(multiplayer.buildWireSnapshot(false, false, "mock-player-2"));
    const hostEmerging = game.advanceGhostTrain(1500);
    const emergingWire = clone(multiplayer.buildWireSnapshot(false, false, "mock-player-2"));
    multiplayer.startMockGuest(["Host", "Guest"], 1);
    multiplayer.applySnapshot(enteringWire);
    const guestEntering = game.getGhostTrainDiagnostics();
    multiplayer.applySnapshot(emergingWire);
    // Replica rail matrices are deliberately committed on the next displayed
    // frame so a packed snapshot cannot force a visible upload spike.
    game.advanceGhostTrain(34);
    const guestEmerging = game.getGhostTrainDiagnostics();

    return { oneWagon, locomotiveOnly, hostEntering, hostTunnelDamage, hostEmerging, guestEntering, guestEmerging };
  });

  expect(result.oneWagon.entering.action).toBe("spectral");
  expect(result.oneWagon.entering.tunnel).toMatchObject({
    active: true,
    stage: "entering",
    afterMissedApproach: true,
    missedApproachCount: 1,
    lastMissedApproachReason: "passed-target",
    entryRailsStopAtPortal: true,
    supportedPhases: [3, 4],
  });
  expect(result.oneWagon.entering.approach.lastMissedApproach).toMatchObject({ reason: "passed-target" });
  expect(result.oneWagon.emerging.tunnel).toMatchObject({ active: true, teleported: true, exitRailsStartAtPortal: true });
  expect(result.oneWagon.entering).toMatchObject({ phase: 3, activeTailIndex: 1 });
  expect(result.oneWagon.entering.materialization.count).toBe(0);
  expect(result.locomotiveOnly.entering).toMatchObject({ phase: 4, activeTailIndex: 0, action: "spectral", materialized: true, vulnerable: true });
  expect(result.locomotiveOnly.entering.tunnel).toMatchObject({
    active: true,
    stage: "entering",
    supportedPhases: [3, 4],
    afterMissedApproach: true,
    missedApproachCount: 1,
    entryRailsStopAtPortal: true,
  });
  expect(result.locomotiveOnly.materialRun).toMatchObject({
    action: "spectral",
    materialized: true,
    vulnerable: true,
    phase: 4,
    activeTailIndex: 0,
    approach: expect.objectContaining({ active: true, finalMaterialRun: true, materialThroughoutFinalRun: true }),
  });
  expect(result.locomotiveOnly.materialRun.speed).toBeLessThanOrEqual(17.5);
  expect(result.locomotiveOnly.materialRun.speed).toBeLessThan(29 * 0.62);
  expect(result.locomotiveOnly.materialRun.track.previewSpeed).toBeGreaterThan(result.locomotiveOnly.materialRun.speed);
  expect(result.locomotiveOnly.entering.materialization.count).toBe(1);
  expect(result.locomotiveOnly.emerging).toMatchObject({ action: "spectral", materialized: true, vulnerable: true });
  expect(result.locomotiveOnly.emerging.tunnel).toMatchObject({ active: true, teleported: true, stage: "emerging", exitRailsStartAtPortal: true });
  expect(result.locomotiveOnly.emerging.approach.desiredLateralDistance).toBe(0);
  expect(result.hostEntering).toMatchObject({ phase: 4, activeTailIndex: 0, materialized: true, vulnerable: true });
  expect(result.hostEntering.tunnel).toMatchObject({ active: true, stage: "entering", supportedPhases: [3, 4], entryRailsStopAtPortal: true });
  expect(result.hostTunnelDamage).toBeCloseTo(8, 3);
  expect(result.hostEmerging).toMatchObject({ materialized: true, vulnerable: true });
  expect(result.hostEmerging.tunnel).toMatchObject({ active: true, teleported: true, stage: "emerging", exitRailsStartAtPortal: true });
  expect(result.guestEntering).toMatchObject({ replica: true, phase: 4, activeTailIndex: 0, materialized: true, vulnerable: true });
  expect(result.guestEntering.tunnel).toMatchObject({ active: true, stage: "entering", supportedPhases: [3, 4], entryRailsStopAtPortal: true });
  expect(result.guestEmerging).toMatchObject({ materialized: true, vulnerable: true });
  expect(result.guestEmerging.tunnel).toMatchObject({ active: true, teleported: true, stage: "emerging", exitRailsStartAtPortal: true });
});

test("the lone locomotive makes a fast continuous pursuit turn without snapping", async ({ page }) => {
  await startHunt(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    game.setPlayerPosition(0, 0);
    game.startWaveNow(10, "ghostTrain");
    game.clearEnemies();
    game.setGhostTrainAiEnabled(false);
    for (let index = 0; index < 4; index += 1) game.damageGhostTrainTail(9999, true);

    let state = game.getGhostTrainDiagnostics();
    const engine = state.segments[0];
    const forwardX = Math.sin(engine.facingAngle);
    const forwardZ = Math.cos(engine.facingAngle);
    game.setPlayerPosition(engine.x - forwardX * 34, engine.z - forwardZ * 34);
    state = game.forceGhostTrainAction("spectral", 8);

    let previousHeading = state.segments[0].facingAngle;
    let cumulativeTurn = 0;
    let maximumStepTurn = 0;
    for (let sample = 0; sample < 180; sample += 1) {
      state = game.advanceGhostTrain(17);
      const heading = state.segments[0].facingAngle;
      const delta = Math.abs(Math.atan2(Math.sin(heading - previousHeading), Math.cos(heading - previousHeading)));
      cumulativeTurn += delta;
      maximumStepTurn = Math.max(maximumStepTurn, delta);
      previousHeading = heading;
    }
    return { state, cumulativeTurn, maximumStepTurn };
  });

  expect(result.state).toMatchObject({ phase: 4, activeTailIndex: 0, action: "spectral" });
  expect(result.state.patrol).toMatchObject({
    groupHook: false,
    finalPursuit: true,
    directCollisionPursuit: true,
    standoffDistance: 0,
  });
  expect(result.state.approach.desiredLateralDistance).toBe(0);
  expect(result.cumulativeTurn).toBeGreaterThan(1.2);
  expect(result.maximumStepTurn).toBeGreaterThan(0.012);
  expect(result.maximumStepTurn).toBeLessThan(0.14);
});

test("wagons keep a broadside lane while the lone locomotive commits to the player", async ({ page }) => {
  await startHunt(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    game.setPlayerPosition(0, 0);
    game.startWaveNow(10, "ghostTrain");
    game.clearEnemies();
    for (let index = 0; index < 4; index += 1) game.damageGhostTrainTail(9999, true);

    let state = game.getGhostTrainDiagnostics();
    const engine = state.segments[0];
    const forwardX = Math.sin(engine.facingAngle);
    const forwardZ = Math.cos(engine.facingAngle);
    const playerX = engine.x + forwardX * 26;
    const playerZ = engine.z + forwardZ * 26;
    game.setPlayerPosition(playerX, playerZ);
    state = game.forceGhostTrainAction("spectral", 1.2);

    let elapsed = 0;
    let materialRun = null;
    while (state.action === "spectral" && elapsed < 3000) {
      state = game.advanceGhostTrain(25);
      elapsed += 25;
      if (state.action === "spectral" && state.approach.finalMaterialRun && !materialRun) materialRun = state;
    }
    const transition = state;
    let minimumDistance = Infinity;
    let sawRam = false;
    let ramTrackBefore = null;
    let ramTrackAfter = null;
    let ramFrames = 0;
    for (let sample = 0; sample < 140; sample += 1) {
      state = game.advanceGhostTrain(25);
      const currentEngine = state.segments[0];
      minimumDistance = Math.min(minimumDistance, Math.hypot(playerX - currentEngine.x, playerZ - currentEngine.z));
      if (state.action === "ram") {
        sawRam = true;
        ramFrames += 1;
        if (!ramTrackBefore) ramTrackBefore = game.getGhostTrainTrackPoints();
        else if (ramFrames === 12) ramTrackAfter = game.getGhostTrainTrackPoints();
      }
    }
    const afterByDistance = new Map((ramTrackAfter || []).map((point) => [point.d.toFixed(6), point]));
    const overlappingTrack = (ramTrackBefore || []).filter((point) => afterByDistance.has(point.d.toFixed(6)));
    const changedTrack = overlappingTrack.filter((point) => {
      const after = afterByDistance.get(point.d.toFixed(6));
      return Math.abs(after.x - point.x) > 0.000001 || Math.abs(after.z - point.z) > 0.000001;
    });
    return {
      transition,
      materialRun,
      state,
      elapsed,
      minimumDistance,
      sawRam,
      overlappingTrackCount: overlappingTrack.length,
      changedTrackCount: changedTrack.length,
    };
  });

  expect(result.materialRun).toMatchObject({
    phase: 4,
    activeTailIndex: 0,
    action: "spectral",
    materialized: true,
    vulnerable: true,
    approach: expect.objectContaining({ active: true, finalMaterialRun: true }),
  });
  expect(result.materialRun.speed).toBeLessThanOrEqual(17.5);
  expect(result.materialRun.speed).toBeLessThan(29 * 0.62);
  expect(result.materialRun.track.previewSpeed).toBeGreaterThan(result.materialRun.speed);
  expect(result.transition).toMatchObject({ phase: 4, activeTailIndex: 0, action: "ram", materialized: true, vulnerable: true });
  expect(result.transition.patrol).toMatchObject({ directCollisionPursuit: true, standoffDistance: 0 });
  expect(result.transition.approach).toMatchObject({
    desiredLateralDistance: 0,
    minLateral: 0,
    lastMaterializeEntry: expect.objectContaining({ visible: true, withinReturnFireRange: true }),
  });
  expect(result.transition.approach.lastMaterializeEntry.lateralDistance).toBeLessThan(1.5);
  expect(result.transition.approach.lastMaterializeEntry.distance).toBeLessThanOrEqual(result.transition.approach.maxDistance);
  expect(result.elapsed).toBeLessThan(3000);
  expect(result.sawRam).toBe(true);
  expect(result.minimumDistance).toBeLessThan(4.5);
  expect(result.overlappingTrackCount).toBeGreaterThan(10);
  expect(result.changedTrackCount).toBe(0);
});

test("the final material approach keeps the same compact synchronized state on the guest", async ({ page }) => {
  await startHunt(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const multiplayer = window.__dustMultiplayerTest;
    const clone = (value) => JSON.parse(JSON.stringify(value));

    multiplayer.startMockHost(["Host", "Guest"]);
    game.startWaveNow(10, "ghostTrain");
    game.clearEnemies();
    game.setGhostTrainAiEnabled(false);
    for (let index = 0; index < 4; index += 1) game.damageGhostTrainTail(9999, true);
    game.advanceGhostTrain(3200);
    const before = game.getGhostTrainDiagnostics();
    const engine = before.segments[0];
    const forwardX = Math.sin(engine.facingAngle);
    const forwardZ = Math.cos(engine.facingAngle);
    for (const player of multiplayer.getState().players) {
      multiplayer.setPlayerPosition(player.id, engine.x + forwardX * 26, engine.z + forwardZ * 26);
    }
    game.setGhostTrainAiEnabled(true);
    game.forceGhostTrainAction("spectral", 1.2);
    const host = game.advanceGhostTrain(25);
    const wire = clone(multiplayer.buildWireSnapshot(false, false, "mock-player-2"));

    multiplayer.startMockGuest(["Host", "Guest"], 1);
    multiplayer.applySnapshot(wire);
    const guest = game.getGhostTrainDiagnostics();
    return { host, guest };
  });

  for (const state of [result.host, result.guest]) {
    expect(state).toMatchObject({
      phase: 4,
      activeTailIndex: 0,
      action: "spectral",
      materialized: true,
      vulnerable: true,
      approach: expect.objectContaining({ finalMaterialRun: true, materialThroughoutFinalRun: true }),
    });
    expect(state.speed).toBeLessThanOrEqual(17.5);
    expect(state.speed).toBeLessThan(29 * 0.62);
    expect(state.track.previewSpeed).toBeGreaterThan(state.speed);
  }
  expect(result.host.approach.active).toBe(true);
  expect(result.guest.replica).toBe(true);
  expect(result.guest.network).toMatchObject({ meshesReplicated: false });
  expect(result.guest.network.regularBytes).toBeLessThanOrEqual(32);
  expect(result.guest.network.keyframeBytes).toBeLessThanOrEqual(80);
});

test("the final phase remains materialized across routing actions and enters its next tunnel approach", async ({ page }) => {
  await startHunt(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    game.startWaveNow(10, "ghostTrain");
    game.clearEnemies();
    game.setGhostTrainAiEnabled(false);
    for (let index = 0; index < 4; index += 1) game.damageGhostTrainTail(9999, true);
    game.advanceGhostTrain(3200);
    const finalStart = game.getGhostTrainDiagnostics();
    const spectral = game.forceGhostTrainAction("spectral", 0.2);
    const dematerialize = game.forceGhostTrainAction("dematerialize", 0.05);
    game.setGhostTrainAiEnabled(true);
    const resumed = game.advanceGhostTrain(250);
    return { finalStart, spectral, dematerialize, resumed };
  });

  for (const state of [result.finalStart, result.spectral, result.dematerialize, result.resumed]) {
    expect(state).toMatchObject({ phase: 4, activeTailIndex: 0, materialized: true, vulnerable: true });
    expect(state.tunnel.supportedPhases).toEqual([3, 4]);
  }
  for (const state of [result.finalStart, result.spectral, result.dematerialize]) expect(state.tunnel.active).toBe(false);
  expect(result.spectral.action).toBe("spectral");
  expect(result.dematerialize.action).toBe("dematerialize");
  expect(result.resumed).toMatchObject({
    action: "spectral",
    tunnel: expect.objectContaining({ active: true, stage: "entering", entryRailsStopAtPortal: true }),
    approach: expect.objectContaining({ active: false, finalMaterialRun: false }),
  });
  expect(result.resumed.materialization.count).toBe(0);
});

test("the final locomotive stops emitting attacks for the tunnel entry and one second after exit", async ({ page }) => {
  await startHunt(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const multiplayer = window.__dustMultiplayerTest;
    multiplayer.startMockHost(["Host", "Guest"]);
    game.startWaveNow(10, "ghostTrain");
    game.clearEnemies();
    game.setPlayerMaxHp(9999, 9999);
    game.setGhostTrainAiEnabled(false);
    for (let index = 0; index < 4; index += 1) game.damageGhostTrainTail(9999, true);
    game.advanceGhostTrain(3200);
    game.setGhostTrainAiEnabled(true);
    game.forceGhostTrainAction("dematerialize", 0.05);
    const entering = game.advanceGhostTrain(100);
    const baseRear = entering.rearMachineGun.fireSequence;
    const baseSteam = entering.steamWaveAttack.sequence;
    const during = [];
    let state = entering;
    for (let guard = 0; guard < 70 && state.tunnel.active; guard += 1) {
      state = game.advanceGhostTrain(50);
      during.push({
        active: state.tunnel.active,
        locked: state.tunnel.attackLocked,
        rear: state.rearMachineGun.fireSequence,
        steam: state.steamWaveAttack.sequence,
      });
    }
    const exited = state;
    const after850 = game.advanceGhostTrain(850);
    const after1050 = game.advanceGhostTrain(200);
    return { entering, baseRear, baseSteam, during, exited, after850, after1050 };
  });

  expect(result.entering).toMatchObject({ phase: 4, activeTailIndex: 0, materialized: true });
  expect(result.entering.tunnel).toMatchObject({
    active: true,
    stage: "entering",
    attackLocked: true,
    entryDuration: 1,
    postExitAttackLock: 1,
  });
  expect(result.during.length).toBeGreaterThan(40);
  expect(result.during.every((sample) => (
    sample.locked && sample.rear === result.baseRear && sample.steam === result.baseSteam
  ))).toBe(true);
  expect(result.exited.tunnel).toMatchObject({ active: false, attackLocked: true });
  expect(result.exited.tunnel.attackLockTimeLeft).toBeGreaterThan(0.9);
  expect(result.after850.tunnel.attackLocked).toBe(true);
  expect(result.after850.rearMachineGun.fireSequence).toBe(result.baseRear);
  expect(result.after850.steamWaveAttack.sequence).toBe(result.baseSteam);
  expect(result.after1050.tunnel.attackLocked).toBe(false);
});

test("wagon attacks aim for thirty metres within the expanded fourteen-to-thirty-five metre corridor", async ({ page }) => {
  await startHunt(page);

  const samples = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const values = [];
    for (let sample = 0; sample < 12; sample += 1) {
      game.startWaveNow(10, "ghostTrain");
      game.clearEnemies();
      game.setGhostTrainAiEnabled(true);
      game.forceGhostTrainAction("spectral", 1);
      const state = game.advanceGhostTrain(17);
      values.push({
        target: state.approach.engagementDistance,
        minimum: state.approach.minimumEngagementDistance,
        maximum: state.approach.maximumEngagementDistance,
      });
    }
    return values;
  });

  expect(samples).toHaveLength(12);
  expect(samples.every((sample) => sample.target === 30)).toBe(true);
  expect(samples.every((sample) => sample.minimum === 14 && sample.maximum === 35)).toBe(true);
});

test("a suitable pass on existing spectral rails can start the attack before the cooldown window", async ({ page }) => {
  await startHunt(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    game.setPlayerPosition(0, 0);
    game.startWaveNow(10, "ghostTrain");
    game.clearEnemies();
    game.setGhostTrainAiEnabled(true);
    let state = game.forceGhostTrainAction("spectral", 8.8);
    const tail = state.segments[state.activeTailIndex];
    const forwardX = Math.sin(tail.facingAngle);
    const forwardZ = Math.cos(tail.facingAngle);
    const rightX = Math.cos(tail.facingAngle);
    const rightZ = -Math.sin(tail.facingAngle);
    const passDistance = 34.8;
    const lateralDistance = 34;
    const forwardDistance = Math.sqrt(passDistance * passDistance - lateralDistance * lateralDistance);
    game.setPlayerPosition(
      tail.x + forwardX * forwardDistance + rightX * lateralDistance,
      tail.z + forwardZ * forwardDistance + rightZ * lateralDistance
    );
    const trackBefore = game.getGhostTrainTrackPoints();
    const initialTimeLeft = state.actionTimeLeft;
    let elapsed = 0;
    while (state.action === "spectral" && elapsed < 500) {
      state = game.advanceGhostTrain(17);
      elapsed += 17;
    }
    const trackAfter = game.getGhostTrainTrackPoints();
    const afterByDistance = new Map(trackAfter.map((point) => [point.d.toFixed(6), point]));
    const overlapping = trackBefore.filter((point) => afterByDistance.has(point.d.toFixed(6)));
    const changed = overlapping.filter((point) => {
      const after = afterByDistance.get(point.d.toFixed(6));
      return Math.abs(point.x - after.x) > 0.000001 || Math.abs(point.z - after.z) > 0.000001;
    });
    return { state, elapsed, initialTimeLeft, overlapping: overlapping.length, changed: changed.length };
  });

  expect(result.initialTimeLeft).toBeGreaterThan(8);
  expect(result.elapsed).toBeLessThan(500);
  expect(result.state).toMatchObject({ action: "materialize", materialized: false, vulnerable: false });
  expect(result.state.approach).toMatchObject({
    opportunisticAttackCount: 1,
    lastMaterializeEntry: expect.objectContaining({ existingRail: true, visible: true }),
  });
  expect(result.state.approach.lastMaterializeEntry.distance).toBeGreaterThan(30);
  expect(result.state.approach.lastMaterializeEntry.distance).toBeLessThanOrEqual(35);
  expect(result.state.approach.lastMaterializeEntry.lateralDistance).toBeGreaterThan(18);
  expect(result.state.approach.lastMaterializeEntry.lateralDistance).toBeLessThanOrEqual(35);
  expect(result.overlapping).toBeGreaterThan(20);
  expect(result.changed).toBe(0);
});

test("the train materializes early on a visible pass and stays solid before its longer attack", async ({ page }) => {
  await startHunt(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const multiplayer = window.__dustMultiplayerTest;
    multiplayer.startMockHost(["Hunter"]);
    game.startWaveNow(10, "ghostTrain");
    game.clearEnemies();
    game.setGhostTrainAiEnabled(true);
    for (const player of multiplayer.getState().players) multiplayer.setPlayerPosition(player.id, 120, 120);
    let state = game.forceGhostTrainAction("spectral", 1.2);
    state = game.advanceGhostTrain(25);
    let elapsed = 25;
    const plannedApproach = {
      active: state.approach.active,
      existingRail: state.approach.existingRail,
    };
    while (state.action === "spectral" && elapsed < 1300) {
      const tail = state.segments[state.activeTailIndex];
      const forwardX = Math.sin(tail.facingAngle);
      const forwardZ = Math.cos(tail.facingAngle);
      const rightX = Math.cos(tail.facingAngle);
      const rightZ = -Math.sin(tail.facingAngle);
      for (const player of multiplayer.getState().players) {
        multiplayer.setPlayerPosition(
          player.id,
          tail.x + forwardX * 8 + rightX * 14,
          tail.z + forwardZ * 8 + rightZ * 14
        );
      }
      state = game.advanceGhostTrain(50);
      elapsed += 50;
    }
    const transition = state;
    const solid = game.advanceGhostTrain(350);
    const attack = game.advanceGhostTrain(750);
    let firstShot = attack;
    let firstShotAt = elapsed + 1100;
    while (!firstShot.cannonballs.length && firstShotAt < 2200) {
      firstShot = game.advanceGhostTrain(50);
      firstShotAt += 50;
    }
    return { elapsed, plannedApproach, transition, solid, attack, firstShot, firstShotAt };
  });

  expect(result.plannedApproach).toEqual({ active: true, existingRail: false });
  expect(result.transition.action).toBe("materialize");
  expect(result.transition.actionDuration).toBe(1.05);
  expect(result.elapsed).toBeLessThanOrEqual(200);
  expect(result.transition.patrol).toMatchObject({ directCollisionPursuit: false, standoffDistance: 18 });
  expect(result.transition.approach).toMatchObject({
    desiredLateralDistance: 14,
    minimumEngagementDistance: 14,
    maximumEngagementDistance: 35,
    engagementDistance: 30,
    minLateral: 10,
    maxLateral: 35,
  });
  expect(result.transition.approach.lastMaterializeEntry).toMatchObject({
    visible: true,
    withinReturnFireRange: true,
  });
  expect(result.transition.approach.lastMaterializeEntry.distance).toBeLessThanOrEqual(
    result.transition.approach.lastMaterializeEntry.engagementDistance + 0.5
  );
  expect(result.transition.approach.lastMaterializeEntry.distance).toBeGreaterThanOrEqual(14);
  expect(result.solid).toMatchObject({
    action: "materialize",
    materialized: true,
    vulnerable: true,
  });
  expect(result.solid.actionTimeLeft).toBeGreaterThan(0);
  expect(["broadside", "crossfire", "ram"]).toContain(result.attack.action);
  expect(result.attack.actionDuration).toBe(6.1);
  expect(result.attack).toMatchObject({ materialized: true, vulnerable: true });
  expect(result.firstShotAt).toBeLessThanOrEqual(1850);
  expect(result.firstShot.cannonballs.length).toBeGreaterThan(0);
});

test("the spectral train waits for a visible return-fire pass before materializing", async ({ page }) => {
  await startHunt(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const multiplayer = window.__dustMultiplayerTest;
    multiplayer.startMockHost(["Hunter"]);
    for (const player of multiplayer.getState().players) multiplayer.setPlayerPosition(player.id, 0, 0);
    game.startWaveNow(10, "ghostTrain");
    game.clearEnemies();
    for (const player of multiplayer.getState().players) multiplayer.setPlayerPosition(player.id, 120, 120);
    game.setGhostTrainAiEnabled(true);
    game.forceGhostTrainAction("spectral", 0.1);

    const waiting = game.advanceGhostTrain(1000);
    let transition = waiting;
    let elapsed = 0;
    while (transition.action === "spectral" && elapsed < 40000) {
      transition = game.advanceGhostTrain(100);
      elapsed += 100;
    }
    const entry = transition.approach.lastMaterializeEntry;
    const player = multiplayer.getState().players.find((candidate) => candidate.id === (entry && entry.targetPlayerId)) || multiplayer.getState().players[0];
    const transitionTarget = transition.segments[transition.activeTailIndex];
    const transitionDistance = transitionTarget
      ? Math.hypot(player.x - transitionTarget.x, player.z - transitionTarget.z)
      : Infinity;
    const solid = game.advanceGhostTrain(650);
    const solidTarget = solid.segments[solid.activeTailIndex];
    const solidDistance = solidTarget
      ? Math.hypot(player.x - solidTarget.x, player.z - solidTarget.z)
      : Infinity;
    const attack = game.advanceGhostTrain(700);

    return { waiting, transition, transitionDistance, solid, solidDistance, attack, elapsed };
  });

  expect(result.waiting).toMatchObject({ action: "spectral", materialized: false, vulnerable: false });
  expect(result.waiting.actionTimeLeft).toBe(0);
  expect(result.waiting.approach).toMatchObject({ active: true, ready: false, visible: false });
  expect(result.waiting.telegraphs).toHaveLength(0);
  expect(result.waiting.cannonballs).toHaveLength(0);

  expect(result.transition.action).toBe("materialize");
  expect(result.elapsed).toBeLessThan(40000);
  expect(result.transition.approach.lastMaterializeEntry).toMatchObject({
    visible: true,
    withinReturnFireRange: true,
  });
  expect(result.transition.approach.lastMaterializeEntry.distance).toBeLessThanOrEqual(result.transition.approach.maxDistance);
  expect(result.transition.approach).toMatchObject({
    minimumEngagementDistance: 14,
    maximumEngagementDistance: 35,
    engagementDistance: 30,
  });
  expect(result.transition.approach.lastMaterializeEntry.engagementDistance).toBeGreaterThanOrEqual(14);
  expect(result.transition.approach.lastMaterializeEntry.engagementDistance).toBeLessThanOrEqual(35);
  expect(result.transition.approach.lastMaterializeEntry.distance).toBeLessThanOrEqual(
    result.transition.approach.lastMaterializeEntry.engagementDistance + 0.5
  );
  expect(result.transition.approach.lastMaterializeEntry.distance).toBeGreaterThanOrEqual(14);
  expect(
    result.transition.approach.lastMaterializeEntry.forwardDistance >= result.transition.approach.minForward &&
    result.transition.approach.lastMaterializeEntry.lateralDistance >= result.transition.approach.minLateral &&
    result.transition.approach.lastMaterializeEntry.lateralDistance <= result.transition.approach.maxLateral
  ).toBe(true);
  expect(result.transitionDistance).toBeLessThanOrEqual(result.transition.approach.maxDistance + 0.5);
  expect(result.transition.telegraphs).toHaveLength(0);
  expect(result.transition.cannonballs).toHaveLength(0);

  expect(result.solid).toMatchObject({ action: "materialize", materialized: true, vulnerable: true });
  expect(result.solidDistance).toBeLessThanOrEqual(result.solid.approach.maxDistance + 1);
  expect(["broadside", "crossfire", "ram"]).toContain(result.attack.action);
  expect(result.attack.materialized).toBe(true);
  expect(result.attack.vulnerable).toBe(true);
});

test("Midnight Iron Run soundtrack adapts from spectral railride to runaway finale and death", async ({ page }) => {
  const browserErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));
  await startHunt(page, { audio: true });
  await page.waitForFunction(() => window.__dustAndDeadTest.getAudioDiagnostics().contextState === "running");

  await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    game.startWaveNow(10, "ghostTrain");
    game.clearEnemies();
    game.setGhostTrainAiEnabled(false);
    game.setPlayerMaxHp(9999, 9999);
  });
  await page.waitForFunction(() => {
    const music = window.__dustAndDeadTest.getAudioDiagnostics().bossMusic;
    return music.id === "ghost-train" && music.active && music.scheduledStepCount >= 4;
  });
  const spectral = await page.evaluate(() => window.__dustAndDeadTest.getAudioDiagnostics());

  await page.evaluate(() => window.__dustAndDeadTest.forceGhostTrainAction("broadside", 4));
  await page.waitForFunction(() => {
    const music = window.__dustAndDeadTest.getAudioDiagnostics().bossMusic;
    return music.action === "broadside" && music.materialized && music.arrangement === "armored-night-run";
  });
  await page.waitForTimeout(900);
  const broadside = await page.evaluate(() => window.__dustAndDeadTest.getAudioDiagnostics());

  await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    game.damageGhostTrainTail(9999, true);
    game.forceGhostTrainAction("broadside", 4);
  });
  await page.waitForFunction(() => {
    const music = window.__dustAndDeadTest.getAudioDiagnostics().bossMusic;
    return music.phase === 1 && music.arrangementPhase === 1 && music.tempo === 104;
  });
  const phaseOneTempo = await page.evaluate(() => window.__dustAndDeadTest.getAudioDiagnostics().bossMusic.tempo);

  await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    game.damageGhostTrainTail(9999, true);
    game.forceGhostTrainAction("broadside", 4);
  });
  await page.waitForFunction(() => {
    const music = window.__dustAndDeadTest.getAudioDiagnostics().bossMusic;
    return music.phase === 2 && music.arrangementPhase === 2 && music.tempo === 114;
  });
  const phaseTwoTempo = await page.evaluate(() => window.__dustAndDeadTest.getAudioDiagnostics().bossMusic.tempo);

  await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    game.damageGhostTrainTail(9999, true);
    game.forceGhostTrainAction("crossfire", 3.8);
  });
  await page.waitForFunction(() => {
    const music = window.__dustAndDeadTest.getAudioDiagnostics().bossMusic;
    return music.phase === 3 && music.arrangementPhase === 3 && music.tempo === 126 && music.materialized;
  });
  await page.waitForTimeout(1100);
  const runaway = await page.evaluate(() => window.__dustAndDeadTest.getAudioDiagnostics());

  await page.evaluate(() => window.__dustAndDeadTest.forceGhostTrainAction("spectral", 3.8));
  await page.waitForFunction(() => {
    const music = window.__dustAndDeadTest.getAudioDiagnostics().bossMusic;
    return music.phase === 3 && music.action === "spectral" && music.materialized && music.combatArrangementLocked;
  });
  const lateSpectralCombat = await page.evaluate(() => window.__dustAndDeadTest.getAudioDiagnostics());

  await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    game.damageGhostTrainTail(9999, true);
    game.forceGhostTrainAction("spectral", 3.15);
  });
  await page.waitForFunction(() => {
    const music = window.__dustAndDeadTest.getAudioDiagnostics().bossMusic;
    return music.phase === 4 && music.arrangementPhase === 4 && music.tempo === 140 && music.action === "spectral" && music.materialized && music.combatArrangementLocked;
  });
  const finalSpectralCombat = await page.evaluate(() => window.__dustAndDeadTest.getAudioDiagnostics());
  await page.evaluate(() => window.__dustAndDeadTest.forceGhostTrainAction("ram", 3.15));
  await page.waitForTimeout(1000);
  const finale = await page.evaluate(() => window.__dustAndDeadTest.getAudioDiagnostics());

  const defeated = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    game.damageGhostTrainTail(99999, true);
    return { boss: game.getGhostTrainDiagnostics(), audio: game.getAudioDiagnostics() };
  });
  await page.waitForFunction(() => {
    const music = window.__dustAndDeadTest.getAudioDiagnostics().bossMusic;
    return music.lifecycle === "aftermath" && music.deathStingCount >= 1;
  });
  const deathStart = await page.evaluate(() => window.__dustAndDeadTest.getAudioDiagnostics());
  await page.waitForTimeout(4400);
  const deathTail = await page.evaluate(() => window.__dustAndDeadTest.getAudioDiagnostics());

  await page.evaluate(() => window.__dustAndDeadTest.startWaveNow(11));
  await page.waitForFunction(() => !window.__dustAndDeadTest.getAudioDiagnostics().bossMusic.normalSuppressed);
  const resumed = await page.evaluate(() => window.__dustAndDeadTest.getAudioDiagnostics());

  expect(spectral.bossMusic).toMatchObject({
    id: "ghost-train",
    title: "Midnight Iron Run",
    lifecycle: "active",
    boundToActiveBoss: true,
    active: true,
    tempo: 96,
    arrangement: "midnight-railride",
    motif: "midnight-whistle-call",
    compositionVersion: "midnight-iron-run-v3-clean-mix",
    mixProfile: "clean-forward-v3",
    melodyBoost: 2.25,
    noiseBedGain: 0.00115,
    tonalBedGain: 0.014,
    meter: "12/8",
    stepsPerBar: 12,
    phraseBars: 16,
    materialized: false,
  });
  expect(spectral.bossMusic.persistentNodeCount).toBeGreaterThanOrEqual(8);
  expect(spectral.bossMusic.persistentNodeCount).toBeLessThanOrEqual(12);
  expect(spectral.bossMusic.padHitCount).toBeGreaterThan(0);
  expect(spectral.bossMusic.leadHitCount).toBeGreaterThan(0);
  expect(spectral.bossMusic.melodyHitCount).toBeGreaterThan(0);
  expect(spectral.bossMusic.tonalBedGain).toBeGreaterThan(spectral.bossMusic.noiseBedGain * 10);
  expect(spectral.bossMusic.effects).toMatchObject({ rhythmSeparated: true });
  expect(spectral.bossMusic.effects.delay).toBeCloseTo(0.313, 2);
  expect(spectral.bossMusic.effects.rhythmGain).toBeCloseTo(0.92, 2);
  expect(broadside.bossMusic).toMatchObject({
    action: "broadside",
    materialized: true,
    arrangement: "armored-night-run",
    motif: "armored-night-run",
  });
  expect(broadside.bossMusic.brassHitCount).toBeGreaterThan(0);
  expect(broadside.bossMusic.brakeHitCount).toBeGreaterThan(0);
  expect(broadside.bossMusic.effects.rhythmGain).toBeCloseTo(1, 2);
  expect([spectral.bossMusic.tempo, phaseOneTempo, phaseTwoTempo, runaway.bossMusic.tempo, finale.bossMusic.tempo]).toEqual([96, 104, 114, 126, 140]);
  expect(runaway.bossMusic).toMatchObject({
    phase: 3,
    arrangementPhase: 3,
    tempo: 126,
    arrangement: "runaway-iron-barrage",
    motif: "runaway-iron-riff",
  });
  expect(runaway.bossMusic.transitionCount).toBeGreaterThanOrEqual(1);
  expect(lateSpectralCombat.bossMusic).toMatchObject({
    phase: 3,
    action: "spectral",
    materialized: true,
    combatArrangementLocked: true,
    arrangement: "runaway-iron-barrage",
    motif: "runaway-iron-riff",
  });
  expect(finalSpectralCombat.bossMusic).toMatchObject({
    phase: 4,
    action: "spectral",
    materialized: true,
    combatArrangementLocked: true,
    arrangement: "midnight-iron-finale",
    motif: "last-locomotive-theme",
  });
  expect(finale.bossMusic).toMatchObject({
    phase: 4,
    arrangementPhase: 4,
    tempo: 140,
    arrangement: "midnight-iron-finale",
    motif: "last-locomotive-theme",
  });
  expect(finale.bossMusic.railHitCount).toBeGreaterThan(runaway.bossMusic.railHitCount);
  expect(finale.bossMusic.steamHitCount).toBeGreaterThan(0);
  expect(finale.bossMusic.whistleCount).toBeGreaterThan(0);
  expect(finale.bossMusic.peakStepEventCount).toBeLessThanOrEqual(10);
  expect(finale.bossMusic.railDensity).toBeLessThan(0.75);
  expect(finale.bossMusic.whistleDensity).toBeLessThan(0.3);
  expect(finale.transientAudioNodeCount).toBeLessThan(360);
  expect(finale.pendingAudioDisconnectGroups).toBeLessThan(70);
  expect(defeated.boss).toMatchObject({ active: false, defeated: true, hp: 0 });
  expect(deathStart.bossMusic).toMatchObject({
    id: "ghost-train",
    lifecycle: "aftermath",
    active: false,
    fading: true,
    deathFadeSeconds: 4.2,
    deathStingCount: 1,
  });
  expect(deathStart.bossMusic.fadeSecondsRemaining).toBeGreaterThan(3.5);
  expect(deathTail.bossMusic.fading).toBe(false);
  expect(deathTail.bossMusic.themeGain).toBeLessThan(0.01);
  expect(resumed.bossMusic).toMatchObject({
    id: "",
    lifecycle: "normal",
    active: false,
    normalSuppressed: false,
  });
  expect(browserErrors).toEqual([]);
});

test("a compact keyframe reconstructs the train, rails, and detached wagon on a guest", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await startHunt(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const multiplayer = window.__dustMultiplayerTest;
    const clone = (value) => JSON.parse(JSON.stringify(value));
    multiplayer.startMockHost(["Host", "Guest"]);
    game.startWaveNow(10, "ghostTrain");
    game.clearEnemies();
    game.setGhostTrainAiEnabled(false);
    game.damageGhostTrainTail(9999, true);
    const host = game.getGhostTrainDiagnostics();
    const wire = clone(multiplayer.buildWireSnapshot(false, false, "mock-player-2"));
    const decoded = multiplayer.decodeBossState(wire.bossState);
    const bossBytes = Uint8Array.from(atob(wire.bossState), (character) => character.charCodeAt(0)).length;
    game.advanceGhostTrain(700);
    const followupWire = clone(multiplayer.buildWireSnapshot(false, false, "mock-player-2"));
    const followupDecoded = multiplayer.decodeBossState(followupWire.bossState);

    multiplayer.startMockGuest(["Host", "Guest"], 1);
    multiplayer.applySnapshot(wire);
    const guest = game.getGhostTrainDiagnostics();
    const advancedGuest = game.advanceGhostTrain(240);
    multiplayer.applySnapshot(followupWire);
    const reconciledGuest = game.advanceGhostTrain(17);

    const clearedWire = clone(followupWire);
    clearedWire.sequence += 1;
    clearedWire.bossState = null;
    multiplayer.applySnapshot(clearedWire);
    const cleared = game.getGhostTrainDiagnostics();
    return {
      host,
      decoded,
      followupDecoded,
      wireVersion: wire.version,
      bossBytes,
      hasLegacy: Object.prototype.hasOwnProperty.call(wire, "bellRinger"),
      guest,
      advancedGuest,
      reconciledGuest,
      cleared,
    };
  });

  expect(pageErrors).toEqual([]);
  expect(result.bossBytes).toBeLessThanOrEqual(80);
  expect(result.wireVersion).toBe(47);
  expect(result.hasLegacy).toBe(false);
  expect(result.decoded).toMatchObject({
    kind: "ghostTrain",
    phase: 1,
    tail: 3,
    hp: result.host.hp,
    maxHp: result.host.maxHp,
  });
  expect(result.decoded.track).toHaveLength(16);
  expect(result.decoded.detach.x).toBeCloseTo(result.host.detached[0].x, 1);
  expect(result.decoded.detach.z).toBeCloseTo(result.host.detached[0].z, 1);
  expect(Math.abs(result.decoded.detach.a - result.host.segments[4].facingAngle)).toBeLessThan(0.03);
  expect(result.followupDecoded.track).toHaveLength(16);
  expect(result.guest).toMatchObject({
    active: true,
    replica: true,
    phase: 1,
    activeTailIndex: 3,
    hp: result.host.hp,
    maxHp: result.host.maxHp,
  });
  expect(result.guest.segments).toHaveLength(5);
  expect(result.guest.segments[4]).toMatchObject({ attached: false, detaching: true });
  expect(result.guest.detached).toHaveLength(1);
  expect(result.guest.track.points).toBe(16);
  expect(result.guest.track.renderPoints).toBeGreaterThan(16);
  expect(result.guest.track.maxSectionLength).toBeLessThanOrEqual(1.36);
  expect(result.guest.track.drawCalls).toBeLessThanOrEqual(3);
  expect(result.guest.track.progressiveReplicaReveal).toBe(true);
  expect(result.advancedGuest.segments.filter((segment) => segment.attached).every((segment) => segment.railError === 0)).toBe(true);
  expect(result.reconciledGuest.track.stableReplicaMerges).toBeGreaterThanOrEqual(1);
  expect(result.reconciledGuest.track.maxSectionLength).toBeLessThanOrEqual(1.36);
  expect(result.reconciledGuest.track.revealDistance).toBeLessThanOrEqual(result.reconciledGuest.track.revealTargetDistance);
  expect(result.reconciledGuest.segments.filter((segment) => segment.attached).every((segment) => segment.railError === 0)).toBe(true);
  expect(result.cleared).toMatchObject({ active: false, replica: false, segments: [] });
});

test("a detached wagon stays in smooth authoritative world space across dropped sliding-route snapshots", async ({ page }) => {
  await startHunt(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const multiplayer = window.__dustMultiplayerTest;
    const clone = (value) => JSON.parse(JSON.stringify(value));
    multiplayer.startMockHost(["Host", "Guest"]);
    game.startWaveNow(10, "ghostTrain");
    game.clearEnemies();
    game.setGhostTrainAiEnabled(false);
    game.damageGhostTrainTail(9999, true);

    const frames = [];
    for (let index = 0; index < 10; index += 1) {
      const host = game.getGhostTrainDiagnostics();
      const wire = clone(multiplayer.buildWireSnapshot(false, false, "mock-player-2"));
      frames.push({
        host,
        wire,
        decoded: multiplayer.decodeBossState(wire.bossState),
      });
      if (index + 1 < 10) game.advanceGhostTrain(200);
    }

    multiplayer.startMockGuest(["Host", "Guest"], 1);
    const deliveredIndices = [0, 2, 5, 9];
    multiplayer.applySnapshot(frames[deliveredIndices[0]].wire);
    const positions = [];
    const renderClocks = [];
    const deliveries = [];
    const record = () => {
      const state = game.getGhostTrainDiagnostics();
      const wagon = state.detached[0];
      if (wagon) {
        positions.push({ x: wagon.x, z: wagon.z });
        renderClocks.push({
          train: state.replicaNetwork.renderSampleTime,
          detached: wagon.networkRenderSampleTime,
        });
      }
      return state;
    };
    record();
    for (let delivery = 1; delivery < deliveredIndices.length; delivery += 1) {
      const previousFrame = frames[deliveredIndices[delivery - 1]];
      const nextFrame = frames[deliveredIndices[delivery]];
      const gapMs = Math.max(17, Math.round((nextFrame.wire.time - previousFrame.wire.time) * 1000));
      for (let elapsed = 0; elapsed < gapMs; elapsed += 34) {
        game.advanceGhostTrain(Math.min(34, gapMs - elapsed));
        record();
      }
      const before = record();
      multiplayer.applySnapshot(nextFrame.wire);
      const applied = record();
      game.advanceGhostTrain(17);
      const afterFrame = record();
      deliveries.push({ before, applied, afterFrame, decoded: nextFrame.decoded });
    }
    const guest = game.getGhostTrainDiagnostics();
    const keyframes = frames.filter((frame) => Array.isArray(frame.decoded.track) && frame.decoded.track.length > 1);
    return { frames, keyframes, deliveredIndices, positions, renderClocks, deliveries, guest };
  });

  expect(result.frames.every((frame) => frame.decoded.detach)).toBe(true);
  for (const frame of result.frames) {
    expect(frame.decoded.detach.x).toBeCloseTo(frame.host.detached[0].x, 1);
    expect(frame.decoded.detach.z).toBeCloseTo(frame.host.detached[0].z, 1);
    expect(Math.abs(frame.decoded.detach.a - frame.host.segments[4].facingAngle)).toBeLessThan(0.03);
  }
  expect(result.keyframes.length).toBeGreaterThanOrEqual(3);
  const firstTrackPoint = result.keyframes[0].decoded.track[0];
  const lastTrackPoint = result.keyframes[result.keyframes.length - 1].decoded.track[0];
  const firstTrackFront = result.keyframes[0].decoded.track[result.keyframes[0].decoded.track.length - 1];
  const lastTrackFront = result.keyframes[result.keyframes.length - 1].decoded.track[
    result.keyframes[result.keyframes.length - 1].decoded.track.length - 1
  ];
  expect(Math.max(
    Math.hypot(lastTrackPoint.x - firstTrackPoint.x, lastTrackPoint.z - firstTrackPoint.z),
    Math.hypot(lastTrackFront.x - firstTrackFront.x, lastTrackFront.z - firstTrackFront.z)
  )).toBeGreaterThan(0.5);

  const frameSteps = result.positions.slice(1).map((position, index) => Math.hypot(
    position.x - result.positions[index].x,
    position.z - result.positions[index].z
  ));
  expect(Math.max(...frameSteps)).toBeLessThan(0.9);
  const trainClockSteps = result.renderClocks.slice(1).map(
    (clock, index) => clock.train - result.renderClocks[index].train
  );
  const detachedClockSteps = result.renderClocks.slice(1).map(
    (clock, index) => clock.detached - result.renderClocks[index].detached
  );
  expect(Math.min(...trainClockSteps)).toBeGreaterThanOrEqual(-0.0001);
  expect(Math.min(...detachedClockSteps)).toBeGreaterThanOrEqual(-0.0001);
  expect(result.renderClocks.at(-1).train).toBeGreaterThan(result.renderClocks[0].train);
  expect(result.renderClocks.at(-1).detached).toBeGreaterThan(result.renderClocks[0].detached);
  expect(result.guest.detached).toHaveLength(1);
  expect(result.guest.detached[0]).toMatchObject({ replicaWorldSpace: true, exploded: false });
  expect(result.guest.detached[0].networkVelocity).toBeLessThanOrEqual(32.001);
  for (const delivery of result.deliveries) {
    const before = delivery.before.detached[0];
    const applied = delivery.applied.detached[0];
    const afterFrame = delivery.afterFrame.detached[0];
    expect(Math.hypot(applied.x - before.x, applied.z - before.z)).toBeLessThan(0.01);
    expect(delivery.applied.replicaNetwork.renderSampleTime).toBeGreaterThanOrEqual(
      delivery.before.replicaNetwork.renderSampleTime - 0.0001
    );
    expect(applied.networkRenderSampleTime).toBeGreaterThanOrEqual(
      before.networkRenderSampleTime - 0.0001
    );
    expect(applied.networkTargetX).toBeCloseTo(delivery.decoded.detach.x, 1);
    expect(applied.networkTargetZ).toBeCloseTo(delivery.decoded.detach.z, 1);
    expect(Math.hypot(afterFrame.x - applied.x, afterFrame.z - applied.z)).toBeLessThan(0.65);
  }
});

test("a high-RTT guest hit damages the authoritative tail and reaches the replica", async ({ page }) => {
  await startHunt(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const multiplayer = window.__dustMultiplayerTest;
    multiplayer.startMockHost(["Host", "Guest"]);
    game.startWaveNow(10, "ghostTrain");
    game.clearEnemies();
    game.setGhostTrainAiEnabled(false);
    game.forceGhostTrainAction("broadside", 4);

    const before = game.getGhostTrainDiagnostics();
    const target = before.segments[before.activeTailIndex];
    multiplayer.setPlayerPosition("mock-player-2", target.x, target.z - 6);
    multiplayer.setNetworkRtt("mock-player-2", 750);
    const shooter = multiplayer.getState().players.find((player) => player.id === "mock-player-2");
    const aimAngle = Math.atan2(target.x - shooter.x, target.z - shooter.z);
    const queued = multiplayer.injectFireAction("mock-player-2", 1, aimAngle, 14, {
      weaponId: "revolver",
      originX: shooter.x,
      originZ: shooter.z,
      actionAgeMs: 120,
      targetKind: "enemy",
      targetId: target.id,
      targetX: target.x,
      targetZ: target.z,
    });
    window.advanceTime(700);

    const authoritative = game.getGhostTrainDiagnostics();
    const fireState = multiplayer.getState().players.find((player) => player.id === "mock-player-2");
    const impact = multiplayer.getNetworkCombatDiagnostics().queuedEvents.find(
      (event) => event.type === "projectileImpact" && event.ownerId === "mock-player-2"
    );
    const wire = JSON.parse(JSON.stringify(multiplayer.buildWireSnapshot(false, false, "mock-player-2")));
    multiplayer.startMockGuest(["Host", "Guest"], 1);
    multiplayer.applySnapshot(wire);
    const guest = game.getGhostTrainDiagnostics();
    return { queued, before, authoritative, fireState, impact, guest, targetId: target.id };
  });

  expect(result.queued).toBe(true);
  expect(result.fireState).toMatchObject({
    lastProcessedFireActionSequence: 1,
    lastFireActionAccepted: true,
  });
  expect(result.impact).toMatchObject({
    impactKind: "enemy",
    targetEnemyId: result.targetId,
    clientFireSequence: 1,
  });
  expect(result.authoritative.hp).toBeLessThan(result.before.hp);
  expect(result.authoritative.segments[4].hp).toBeLessThan(result.before.segments[4].hp);
  expect(result.guest).toMatchObject({
    active: true,
    replica: true,
    hp: result.authoritative.hp,
    maxHp: result.authoritative.maxHp,
    activeTailIndex: 4,
  });
  expect(result.guest.segments[4].hp).toBe(result.authoritative.segments[4].hp);
});

test("the defeated train and its death countdown replicate before authoritative cleanup", async ({ page }) => {
  await startHunt(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const multiplayer = window.__dustMultiplayerTest;
    const clone = (value) => JSON.parse(JSON.stringify(value));
    multiplayer.startMockHost(["Host", "Guest"]);
    game.startWaveNow(10, "ghostTrain");
    game.clearEnemies();
    game.setGhostTrainAiEnabled(false);
    for (let index = 0; index < 5; index += 1) game.damageGhostTrainTail(99999, true);

    const host = game.getGhostTrainDiagnostics();
    const deathWire = clone(multiplayer.buildWireSnapshot(false, false, "mock-player-2"));
    const decoded = multiplayer.decodeBossState(deathWire.bossState);

    multiplayer.startMockGuest(["Host", "Guest"], 1);
    multiplayer.applySnapshot(deathWire);
    const guest = game.getGhostTrainDiagnostics();
    const advancedGuest = game.advanceGhostTrain(1200);

    const clearWire = clone(deathWire);
    clearWire.sequence += 1;
    clearWire.bossState = null;
    multiplayer.applySnapshot(clearWire);
    const cleared = game.getGhostTrainDiagnostics();
    return { host, decoded, guest, advancedGuest, cleared };
  });

  expect(result.host).toMatchObject({ active: false, defeated: true, hp: 0, deathDuration: 7 });
  expect(result.decoded).toMatchObject({ kind: "ghostTrain", active: false, defeated: true, hp: 0 });
  expect(result.guest).toMatchObject({ active: false, replica: true, defeated: true, hp: 0 });
  expect(result.guest.deathTimeLeft).toBeCloseTo(result.decoded.deathTimeLeft, 2);
  expect(result.advancedGuest.deathTimeLeft).toBeLessThan(result.guest.deathTimeLeft);
  expect(result.advancedGuest.segments[0].modelAttached).toBe(true);
  expect(result.cleared).toMatchObject({ active: false, replica: false, defeated: false, segments: [] });
});

test("the defeated locomotive burns out for seven seconds before wave 11 cleans the encounter", async ({ page }) => {
  await startHunt(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    game.forceWaveState(10, 0, 0, "ghostTrain");
    game.setGhostTrainAiEnabled(false);
    for (let index = 0; index < 5; index += 1) game.damageGhostTrainTail(9999, true);
    const defeated = game.getGhostTrainDiagnostics();
    const middleWave = game.advanceWaveProgress(3500);
    const middle = game.getGhostTrainDiagnostics();
    const finalWave = game.advanceWaveProgress(3800);
    const cleared = game.getGhostTrainDiagnostics();
    return { defeated, middleWave, middle, finalWave, cleared };
  });

  expect(result.defeated).toMatchObject({ active: false, defeated: true, hp: 0, deathDuration: 7 });
  expect(result.defeated.deathTimeLeft).toBeCloseTo(7, 2);
  expect(result.middleWave.wave).toBe(10);
  expect(result.middle.defeated).toBe(true);
  expect(result.middle.deathTimeLeft).toBeGreaterThan(3);
  expect(result.finalWave.wave).toBe(11);
  expect(result.cleared).toMatchObject({ active: false, defeated: false, segments: [] });
});

test("the turquoise train HUD stays legible in compact phone landscape", async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 378 });
  await startHunt(page);
  await startTrain(page);

  const layout = await page.evaluate(() => {
    const box = document.querySelector("#boss-hud").getBoundingClientRect();
    const name = document.querySelector("#boss-name");
    const status = document.querySelector("#boss-status");
    const locomotiveIcon = document.querySelector(".boss-train-locomotive-icon");
    const wagonIcons = [...document.querySelectorAll(".boss-train-wagon-icon")];
    const pips = [...document.querySelectorAll(".boss-train-section")].map((element) => {
      const rect = element.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    });
    return {
      box: { top: box.top, bottom: box.bottom, left: box.left, right: box.right, width: box.width },
      nameFits: name.scrollWidth <= name.clientWidth + 1,
      nameSize: Number.parseFloat(getComputedStyle(name).fontSize),
      statusSize: Number.parseFloat(getComputedStyle(status).fontSize),
      pips,
      locomotiveIcon: locomotiveIcon ? {
        viewBox: locomotiveIcon.getAttribute("viewBox"),
        width: locomotiveIcon.getBoundingClientRect().width,
        height: locomotiveIcon.getBoundingClientRect().height,
        paths: locomotiveIcon.querySelectorAll("path").length,
        circles: locomotiveIcon.querySelectorAll("circle").length,
      } : null,
      wagonIcons: wagonIcons.map((icon) => {
        const wheel = icon.querySelector("defs > g[id]");
        return {
          viewBox: icon.getAttribute("viewBox"),
          width: icon.getBoundingClientRect().width,
          height: icon.getBoundingClientRect().height,
          wheelId: wheel?.id || "",
          uses: [...icon.querySelectorAll("use")].map((use) => use.getAttribute("href")),
        };
      }),
    };
  });

  expect(layout.box.top).toBeGreaterThanOrEqual(50);
  expect(layout.box.bottom).toBeLessThanOrEqual(105);
  expect(layout.box.width).toBeGreaterThanOrEqual(300);
  expect(layout.nameFits).toBe(true);
  expect(layout.nameSize).toBeGreaterThanOrEqual(9);
  expect(layout.statusSize).toBeGreaterThanOrEqual(7);
  expect(layout.pips).toHaveLength(5);
  expect(layout.pips.every((pip) => pip.width >= 10 && pip.height >= 7)).toBe(true);
  expect(layout.locomotiveIcon).toMatchObject({ viewBox: "16 45 496 390" });
  expect(layout.locomotiveIcon.width).toBeGreaterThanOrEqual(30);
  expect(layout.locomotiveIcon.height).toBeGreaterThanOrEqual(24);
  expect(layout.locomotiveIcon.paths).toBeGreaterThanOrEqual(14);
  expect(layout.locomotiveIcon.circles).toBeGreaterThanOrEqual(25);
  expect(layout.wagonIcons).toHaveLength(4);
  expect(new Set(layout.wagonIcons.map((icon) => icon.wheelId)).size).toBe(4);
  expect(layout.wagonIcons.every((icon) => icon.viewBox === "0 78 512 370")).toBe(true);
  expect(layout.wagonIcons.every((icon) => icon.width >= 24 && icon.height >= 18)).toBe(true);
  expect(layout.wagonIcons.every((icon) => icon.uses.length === 3 && icon.uses.every((href) => href === `#${icon.wheelId}`))).toBe(true);
});

test("the materialized train uses the vulnerable red health bar and the detailed SVG locomotive", async ({ page }) => {
  await startHunt(page);
  await startTrain(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const fill = document.querySelector("#boss-health-fill");
    const engineElement = document.querySelector('.boss-train-section[data-segment="0"]');
    const locomotiveIcon = engineElement.querySelector(".boss-train-locomotive-icon");
    const wagonElements = [...document.querySelectorAll('.boss-train-section:not([data-segment="0"])')];
    const spectralFill = getComputedStyle(fill).backgroundImage;
    const spectralIconColor = getComputedStyle(engineElement).color;
    const spectralWagonColors = wagonElements.map((element) => ({ segment: Number(element.dataset.segment), color: getComputedStyle(element).color }));
    game.forceGhostTrainAction("broadside", 4);
    const materializedFill = getComputedStyle(fill).backgroundImage;
    const materializedIconColor = getComputedStyle(engineElement).color;
    const materializedWagonColors = wagonElements.map((element) => ({ segment: Number(element.dataset.segment), color: getComputedStyle(element).color }));
    const sections = [...document.querySelectorAll(".boss-train-section")].map((element) => {
      const rect = element.getBoundingClientRect();
      return {
        segment: Number(element.dataset.segment),
        left: rect.left,
        bottom: rect.bottom,
        width: rect.width,
        hasSilhouette: Boolean(element.querySelector(".boss-train-section__silhouette")),
      };
    });
    return {
      spectralFill,
      materializedFill,
      spectralIconColor,
      materializedIconColor,
      iconPaths: locomotiveIcon.querySelectorAll("path").length,
      iconTransform: getComputedStyle(locomotiveIcon).transform,
      wagonIconCount: document.querySelectorAll(".boss-train-wagon-icon").length,
      wagonWheelUses: document.querySelectorAll(".boss-train-wagon-icon use").length,
      spectralWagonColors,
      materializedWagonColors,
      sections,
    };
  });

  expect(result.spectralFill).toContain("rgb(66, 242, 189)");
  expect(result.materializedFill).toContain("rgb(185, 54, 60)");
  expect(result.materializedFill).not.toBe(result.spectralFill);
  expect(result.spectralIconColor).toBe("rgb(121, 239, 209)");
  expect(result.materializedIconColor).toBe("rgb(223, 90, 88)");
  expect(result.iconPaths).toBeGreaterThanOrEqual(14);
  expect(result.iconTransform).not.toBe("none");
  expect(result.wagonIconCount).toBe(4);
  expect(result.wagonWheelUses).toBe(12);
  expect(result.spectralWagonColors.find((entry) => entry.segment === 1).color).toBe("rgb(121, 239, 209)");
  expect(result.materializedWagonColors.find((entry) => entry.segment === 1).color).toBe("rgb(223, 90, 88)");
  expect(result.materializedWagonColors.find((entry) => entry.segment === 4).color).toBe("rgb(255, 216, 102)");
  expect(result.sections.every((section) => section.hasSilhouette)).toBe(true);
  const engine = result.sections.find((section) => section.segment === 0);
  const tail = result.sections.find((section) => section.segment === 4);
  expect(engine.left).toBeGreaterThan(tail.left);
  expect(engine.width).toBeGreaterThan(tail.width);
  expect(Math.max(...result.sections.map((section) => section.bottom)) - Math.min(...result.sections.map((section) => section.bottom))).toBeLessThanOrEqual(1);
});

test("a host-authoritative cannon hit damages a remote player once and replicates the resulting HP", async ({ page }) => {
  await startHunt(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const multiplayer = window.__dustMultiplayerTest;
    const clone = (value) => JSON.parse(JSON.stringify(value));
    multiplayer.startMockHost(["Host", "Guest"]);
    game.startWaveNow(10, "ghostTrain");
    game.clearEnemies();
    game.setGhostTrainAiEnabled(false);

    const tail = game.getGhostTrainDiagnostics().segments[4];
    const broadsideX = Math.cos(tail.facingAngle);
    const broadsideZ = -Math.sin(tail.facingAngle);
    const forwardX = Math.sin(tail.facingAngle);
    const forwardZ = Math.cos(tail.facingAngle);
    multiplayer.setPlayerPosition(
      "mock-player-1",
      tail.x - broadsideX * 60,
      tail.z - broadsideZ * 60
    );
    multiplayer.setPlayerPosition(
      "mock-player-2",
      tail.x + broadsideX * 8 - forwardX * 1.42,
      tail.z + broadsideZ * 8 - forwardZ * 1.42
    );
    multiplayer.setHealth("mock-player-2", 100);

    const fired = game.fireGhostTrainCannon(4, 1, 0);
    const ball = fired.cannonballs[fired.cannonballs.length - 1];
    const firstPass = game.advanceGhostTrain(240);
    const afterFirstHit = multiplayer.getState().players.find((player) => player.id === "mock-player-2");
    const hitBall = firstPass.cannonballs.find((entry) => entry.id === ball.id);
    game.advanceGhostTrain(320);
    const afterSecondPass = multiplayer.getState().players.find((player) => player.id === "mock-player-2");
    const wire = clone(multiplayer.buildWireSnapshot(false, false, "mock-player-2"));

    multiplayer.startMockGuest(["Host", "Guest"], 1);
    multiplayer.applySnapshot(wire);
    const replica = multiplayer.getState().players.find((player) => player.id === "mock-player-2");

    multiplayer.startMockHost(["Host", "Guest"]);
    game.startWaveNow(10, "ghostTrain");
    game.clearEnemies();
    game.setGhostTrainAiEnabled(false);
    const ram = game.forceGhostTrainAction("ram", 4);
    multiplayer.setPlayerPosition("mock-player-1", -42, -42);
    multiplayer.setPlayerPosition("mock-player-2", ram.segments[0].x, ram.segments[0].z);
    multiplayer.setHealth("mock-player-2", 100);
    game.advanceGhostTrain(17);
    const afterRam = multiplayer.getState().players.find((player) => player.id === "mock-player-2");
    game.advanceGhostTrain(240);
    const afterRamSecondPass = multiplayer.getState().players.find((player) => player.id === "mock-player-2");
    const ramWire = clone(multiplayer.buildWireSnapshot(false, false, "mock-player-2"));
    multiplayer.startMockGuest(["Host", "Guest"], 1);
    multiplayer.applySnapshot(ramWire);
    const ramReplica = multiplayer.getState().players.find((player) => player.id === "mock-player-2");
    return { ball, hitBall, afterFirstHit, afterSecondPass, replica, afterRam, afterRamSecondPass, ramReplica };
  });

  expect(result.ball.cosmeticOnly).toBe(false);
  expect(result.ball.targetPlayerId).toBe("mock-player-2");
  expect(result.hitBall.hitCount).toBe(1);
  expect(result.afterFirstHit.hp).toBe(62);
  expect(result.afterSecondPass.hp).toBe(62);
  expect(result.replica.hp).toBe(62);
  expect(result.afterRam.hp).toBe(28);
  expect(result.afterRamSecondPass.hp).toBe(28);
  expect(result.ramReplica.hp).toBe(28);
});

test("the detached-wagon danger zone and its authoritative explosion remain synchronized", async ({ page }) => {
  await startHunt(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const multiplayer = window.__dustMultiplayerTest;
    const clone = (value) => JSON.parse(JSON.stringify(value));

    multiplayer.startMockHost(["Host", "Guest"]);
    game.startWaveNow(10, "ghostTrain");
    game.clearEnemies();
    game.setGhostTrainAiEnabled(false);
    game.damageGhostTrainTail(9999, true);
    const hostWarning = game.getGhostTrainDiagnostics().detached[0];
    const warningWire = clone(multiplayer.buildWireSnapshot(false, false, "mock-player-2"));

    multiplayer.startMockGuest(["Host", "Guest"], 1);
    multiplayer.applySnapshot(warningWire);
    const guestWarning = game.advanceGhostTrain(17).detached[0];

    multiplayer.startMockHost(["Host", "Guest"]);
    game.startWaveNow(10, "ghostTrain");
    game.clearEnemies();
    game.setGhostTrainAiEnabled(false);
    multiplayer.setPlayerPosition("mock-player-1", -42, -42);
    multiplayer.setPlayerPosition("mock-player-2", 42, 42);
    game.damageGhostTrainTail(9999, true);
    const beforeBlast = game.advanceGhostTrain(2700).detached[0];
    multiplayer.setPlayerPosition("mock-player-2", beforeBlast.x, beforeBlast.z);
    multiplayer.setHealth("mock-player-2", 100);
    const afterBlastTrain = game.advanceGhostTrain(350);
    const authoritativePlayer = multiplayer.getState().players.find((player) => player.id === "mock-player-2");
    const blastWire = clone(multiplayer.buildWireSnapshot(false, false, "mock-player-2"));
    multiplayer.startMockGuest(["Host", "Guest"], 1);
    multiplayer.applySnapshot(blastWire);
    const replicaPlayer = multiplayer.getState().players.find((player) => player.id === "mock-player-2");
    return { hostWarning, guestWarning, beforeBlast, afterBlastTrain, authoritativePlayer, replicaPlayer };
  });

  expect(result.hostWarning).toMatchObject({ warningVisible: true, warningRadius: 6.4 });
  expect(result.guestWarning).toMatchObject({ warningVisible: true, warningRadius: 6.4 });
  expect(result.guestWarning.timer).toBeLessThanOrEqual(result.hostWarning.timer);
  expect(Math.hypot(result.guestWarning.x - result.hostWarning.x, result.guestWarning.z - result.hostWarning.z)).toBeLessThan(1.5);
  expect(result.beforeBlast.timer).toBeGreaterThan(0);
  expect(result.afterBlastTrain.detached).toHaveLength(0);
  expect(result.authoritativePlayer.hp).toBe(16);
  expect(result.replicaPlayer.hp).toBe(16);
});

test("cannon warnings and projectiles reconstruct on a guest despite dropped intermediate snapshots", async ({ page }) => {
  await startHunt(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const multiplayer = window.__dustMultiplayerTest;
    const clone = (value) => JSON.parse(JSON.stringify(value));
    multiplayer.startMockHost(["Host", "Guest"]);
    multiplayer.setPlayerPosition("mock-player-1", -28, 18);
    multiplayer.setPlayerPosition("mock-player-2", 24, -12);
    game.startWaveNow(10, "ghostTrain");
    game.clearEnemies();
    game.setGhostTrainAiEnabled(true);
    game.forceGhostTrainAction("broadside", 4);

    const frames = [];
    for (let index = 0; index < 11; index += 1) {
      const train = game.advanceGhostTrain(67);
      frames.push({
        train,
        wire: clone(multiplayer.buildWireSnapshot(false, false, "mock-player-2")),
      });
    }
    const hostWarningFrame = frames.find((frame) => frame.train.telegraphs.length);
    const hostFinal = frames[frames.length - 1].train;

    multiplayer.startMockGuest(["Host", "Guest"], 1);
    const guestFrames = [];
    for (let index = 0; index < frames.length; index += 1) {
      if (index !== 2 && index !== 5) multiplayer.applySnapshot(frames[index].wire);
      if (index < frames.length - 1) guestFrames.push(game.advanceGhostTrain(67));
    }
    const guestWarningFrame = guestFrames.find((frame) => frame.telegraphs.length);
    const guestFinal = game.getGhostTrainDiagnostics();
    return { hostWarningFrame: hostWarningFrame && hostWarningFrame.train, guestWarningFrame, hostFinal, guestFinal };
  });

  expect(result.hostWarningFrame.telegraphs).toHaveLength(2);
  expect(result.guestWarningFrame.telegraphs).toHaveLength(2);
  for (const side of [-1, 1]) {
    const hostWarning = result.hostWarningFrame.telegraphs.find((warning) => warning.side === side);
    const guestWarning = result.guestWarningFrame.telegraphs.find((warning) => warning.side === side);
    expect(guestWarning).toMatchObject({
      step: hostWarning.step,
      segmentIndex: hostWarning.segmentIndex,
      side: hostWarning.side,
      mountIndex: hostWarning.mountIndex,
      targetPlayerId: hostWarning.targetPlayerId,
      trajectoryVisible: true,
    });
    expect(Math.hypot(guestWarning.trajectoryEndX - hostWarning.trajectoryEndX, guestWarning.trajectoryEndZ - hostWarning.trajectoryEndZ)).toBeLessThan(4);
  }
  expect(result.hostFinal.cannonballs.length).toBeGreaterThan(0);
  expect(result.guestFinal.cannonballs.length).toBeGreaterThan(0);
  const hostBall = result.hostFinal.cannonballs[0];
  const guestBall = result.guestFinal.cannonballs[0];
  expect(guestBall).toMatchObject({
    cosmeticOnly: true,
    targetPlayerId: hostBall.targetPlayerId,
    trajectoryVisible: true,
  });
  expect(hostBall.dirX * guestBall.dirX + hostBall.dirZ * guestBall.dirZ).toBeGreaterThan(0.97);
  expect(Math.abs(result.guestFinal.cannonballs.length - result.hostFinal.cannonballs.length)).toBeLessThanOrEqual(1);
});

test("the compact boss stream stays below budget and rapid fire does not accumulate objects", async ({ page }) => {
  test.setTimeout(150_000);
  await startHunt(page);
  await waitForGhostTrainGpuPrewarm(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const multiplayer = window.__dustMultiplayerTest;
    multiplayer.startMockHost(["Host", "Guest"]);
    game.startWaveNow(10, "ghostTrain");
    game.clearEnemies();
    game.setGhostTrainAiEnabled(false);

    const samples = [];
    for (let index = 0; index < 150; index += 1) {
      game.advanceGhostTrain(1000 / 15);
      const wire = multiplayer.buildWireSnapshot(false, false, "mock-player-2");
      const decoded = multiplayer.decodeBossState(wire.bossState);
      const rawBytes = atob(wire.bossState).length;
      const withBossBytes = new TextEncoder().encode(JSON.stringify(wire)).length;
      const withoutBoss = { ...wire };
      delete withoutBoss.bossState;
      const withoutBossBytes = new TextEncoder().encode(JSON.stringify(withoutBoss)).length;
      samples.push({ rawBytes, overheadBytes: withBossBytes - withoutBossBytes, keyframe: Array.isArray(decoded.track) });
    }
    const regular = samples.filter((sample) => !sample.keyframe);
    const keyframes = samples.filter((sample) => sample.keyframe);
    const bossBytesPerSecond = samples.reduce((sum, sample) => sum + sample.overheadBytes, 0) / 10;

    game.startWaveNow(10, "ghostTrain");
    game.clearEnemies();
    game.setGhostTrainAiEnabled(false);
    const prewarmedCannonVisuals = game.getGhostTrainDiagnostics().cannonVisuals;
    multiplayer.setPlayerPosition("mock-player-1", -42, -42);
    multiplayer.setPlayerPosition("mock-player-2", 42, 42);
    for (let index = 0; index < 3; index += 1) game.damageGhostTrainTail(9999, true);
    game.setGhostTrainAiEnabled(true);
    game.forceGhostTrainAction("broadside", 3.8);
    let maxCannonballs = 0;
    let maxTelegraphs = 0;
    let maxParticles = 0;
    let maxCannonVisualDrawCalls = 0;
    let finalTrain = null;
    for (let index = 0; index < 85; index += 1) {
      finalTrain = game.advanceGhostTrain(100);
      maxCannonballs = Math.max(maxCannonballs, finalTrain.cannonballs.length);
      maxTelegraphs = Math.max(maxTelegraphs, finalTrain.telegraphs.length);
      maxParticles = Math.max(maxParticles, multiplayer.getNetworkCombatDiagnostics().particles);
      maxCannonVisualDrawCalls = Math.max(maxCannonVisualDrawCalls, finalTrain.cannonVisuals.drawCalls);
    }
    const firstStateCreated = finalTrain.cannonVisuals.stateCreated;
    game.forceGhostTrainAction("broadside", 3.8);
    let secondFinalTrain = null;
    for (let index = 0; index < 40; index += 1) secondFinalTrain = game.advanceGhostTrain(100);
    game.forceGhostTrainAction("spectral", 2);
    game.setGhostTrainAiEnabled(false);
    for (let index = 0; index < 35; index += 1) secondFinalTrain = game.advanceGhostTrain(100);
    return {
      regularMax: Math.max(...regular.map((sample) => sample.rawBytes)),
      keyframeMax: Math.max(...keyframes.map((sample) => sample.rawBytes)),
      keyframeCount: keyframes.length,
      bossBytesPerSecond,
      prewarmedCannonVisuals,
      maxCannonballs,
      maxTelegraphs,
      maxParticles,
      maxCannonVisualDrawCalls,
      finalCannonballs: finalTrain.cannonballs.length,
      finalTelegraphs: finalTrain.telegraphs.length,
      finalProjectileVisuals: finalTrain.cannonVisuals.projectileInUse,
      finalTrajectoryVisuals: finalTrain.cannonVisuals.trajectoryInUse,
      firstStateCreated,
      secondStateCreated: secondFinalTrain.cannonVisuals.stateCreated,
      secondStateAvailable: secondFinalTrain.cannonVisuals.stateAvailable,
      secondFinalCannonballs: secondFinalTrain.cannonballs.length,
      trackDrawCalls: finalTrain.track.drawCalls,
      trackUpdates: finalTrain.track.updates,
      trackRebuilds: finalTrain.track.rebuilds,
      trackSkips: finalTrain.track.skippedRebuilds,
    };
  });

  expect(result.regularMax).toBeLessThanOrEqual(32);
  expect(result.keyframeMax).toBeLessThanOrEqual(80);
  expect(result.keyframeCount).toBeGreaterThanOrEqual(10);
  expect(result.keyframeCount).toBeLessThanOrEqual(24);
  expect(result.bossBytesPerSecond).toBeLessThan(1200);
  expect(result.prewarmedCannonVisuals).toMatchObject({
    gpuPrewarmed: true,
    pooledBeforeFirstShot: true,
    pairedSalvoSound: true,
    batchedProjectileTrail: true,
    maxTrailParticlesPerFrame: 8,
    stateCreated: 68,
    stateAvailable: 68,
  });
  expect(result.maxCannonballs).toBeGreaterThanOrEqual(32);
  expect(result.maxCannonballs).toBeLessThanOrEqual(68);
  expect(result.maxTelegraphs).toBeLessThanOrEqual(2);
  expect(result.maxParticles).toBeLessThanOrEqual(512);
  expect(result.maxCannonVisualDrawCalls).toBeLessThanOrEqual(5);
  expect(result.finalCannonballs).toBe(0);
  expect(result.finalTelegraphs).toBe(0);
  expect(result.finalProjectileVisuals).toBe(0);
  expect(result.finalTrajectoryVisuals).toBe(0);
  expect(result.secondFinalCannonballs).toBe(0);
  // A later salvo may establish a slightly higher legitimate concurrency peak.
  // The fixed cap and a fully returned pool distinguish that warm-up from a leak.
  expect(result.secondStateCreated).toBeGreaterThanOrEqual(result.firstStateCreated);
  expect(result.secondStateCreated).toBeLessThanOrEqual(68);
  expect(result.secondStateAvailable).toBe(result.secondStateCreated);
  expect(result.trackDrawCalls).toBe(3);
  expect(result.trackSkips).toBeGreaterThan(0);
  expect(result.trackRebuilds).toBeLessThan(result.trackUpdates);
});
