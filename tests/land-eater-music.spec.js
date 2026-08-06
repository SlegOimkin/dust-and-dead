const path = require("node:path");
const { expect, test } = require("@playwright/test");

const REQUIRED_TEST_API = [
  "startWaveNow",
  "clearEnemies",
  "setPlayerPosition",
  "setLandEaterAiEnabled",
  "forceLandEaterPhase",
  "forceLandEaterAction",
  "seekLandEaterAction",
  "stepLandEater",
  "getLandEaterDiagnostics",
  "getLandEaterMusicPlan",
  "getAudioDiagnostics",
  "forceActiveBossDefeat",
  "forceWaveState",
];

const LAND_EATER_EVENT_COUNTERS = [
  "landEaterDrumHitCount",
  "landEaterChainHitCount",
  "landEaterResonatorHitCount",
  "landEaterScrapeHitCount",
  "landEaterStringHitCount",
  "landEaterBrassHitCount",
  "landEaterChoirHitCount",
  "landEaterCymbalHitCount",
  "landEaterMotifHitCount",
  "landEaterDevourCueCount",
  "landEaterBurrowCueCount",
  "landEaterImpactCueCount",
  "landEaterZigzagCueCount",
  "landEaterRecoveryCueCount",
  "landEaterBounceCueCount",
];

function fileUrl(relativePath) {
  const absolute = path.resolve(__dirname, "..", relativePath).replace(/\\/g, "/");
  return `file:///${absolute}`;
}

async function startHunt(page, { audio = true } = {}) {
  await page.goto(`${fileUrl("index.html")}?mapSeed=7331&landEaterMusicTest=1`);
  const intro = page.locator("#intro-screen");
  if (await intro.isVisible().catch(() => false)) {
    await page.keyboard.press("KeyM");
    await expect(intro).toBeHidden();
  }

  await page.waitForFunction(() => Boolean(window.__dustAndDeadTest?.getAudioDiagnostics));
  const audioEnabled = await page.evaluate(() => window.__dustAndDeadTest.getAudioDiagnostics().enabled);
  if (audioEnabled !== audio) await page.locator("#menu-music-btn").click();

  // Clicking the production Start button supplies Chromium's required audio
  // gesture. The tests observe the real scheduler rather than a mocked clock.
  await page.getByRole("button", { name: "Start Hunt" }).click();
  await page.waitForFunction(() => Boolean(window.__dustAndDeadTest?.getLandEaterDiagnostics));

  const missing = await page.evaluate((names) => names.filter(
    (name) => typeof window.__dustAndDeadTest?.[name] !== "function"
  ), REQUIRED_TEST_API);
  expect(missing, `Land Eater music test API is incomplete: ${missing.join(", ")}`).toEqual([]);

  if (audio) {
    await page.waitForFunction(() => {
      const diagnostics = window.__dustAndDeadTest.getAudioDiagnostics();
      return diagnostics.unlocked && diagnostics.contextState === "running";
    });
  }
}

function pitchClass(frequency) {
  const midi = Math.round(69 + 12 * Math.log2(Number(frequency) / 440));
  return ((midi % 12) + 12) % 12;
}

function containsSequence(values, wanted) {
  for (let start = 0; start <= values.length - wanted.length; start += 1) {
    if (wanted.every((value, offset) => values[start + offset] === value)) return true;
  }
  return false;
}

function planDensity(plan) {
  return plan.reduce((total, row) => total + Number(row.eventCount || 0), 0) /
    Math.max(1, plan.length);
}

test("The World Ends Below keeps its prophecy while every phase adds bounded orchestral drive", async ({ page }) => {
  await startHunt(page, { audio: false });

  const plans = await page.evaluate(() => {
    const getPlan = window.__dustAndDeadTest.getLandEaterMusicPlan;
    return [0, 1, 2].map((phase) => ({
      first: getPlan(phase, "idle", 0, 192),
      repeated: getPlan(phase, "idle", 0, 192),
    }));
  });

  const densities = [];
  for (const [phase, result] of plans.entries()) {
    expect(result.first, `phase ${phase + 1} plan must be deterministic`).toEqual(result.repeated);
    expect(result.first).toHaveLength(192);
    expect(result.first.every((row) => row.motifFamily === "world-ends-prophecy")).toBe(true);
    expect(Math.max(...result.first.map((row) => row.eventCount))).toBeLessThanOrEqual(7);

    const resonatorPitchClasses = result.first
      .map((row) => Number(row.resonator) || 0)
      .filter((frequency) => frequency > 0)
      .map(pitchClass);
    // D - Eb - F - D - Ab - G - Eb - D is the original "end is coming"
    // prophecy in every arrangement, independent of the octave used.
    expect(
      containsSequence(resonatorPitchClasses, [2, 3, 5, 2, 8, 7, 3, 2]),
      `phase ${phase + 1} must contain the complete eight-note prophecy`
    ).toBe(true);

    expect(result.first.some((row) => row.drum)).toBe(true);
    expect(result.first.some((row) => Number(row.resonator) > 0)).toBe(true);
    expect(result.first.some((row) => Number(row.stringNote) > 0)).toBe(true);
    expect(result.first.some((row) => row.brass)).toBe(true);
    expect(result.first.some((row) => row.choir)).toBe(true);
    expect(result.first.some((row) => row.cymbal)).toBe(true);
    if (phase >= 1) expect(result.first.some((row) => row.chain)).toBe(true);
    if (phase >= 1) expect(result.first.some((row) => row.scrape)).toBe(true);
    densities.push(planDensity(result.first));
  }

  expect(densities[1]).toBeGreaterThan(densities[0]);
  expect(densities[2]).toBeGreaterThan(densities[1]);
});

test("The World Ends Below grows through all phases without restarting and scores each attack once", async ({ page }) => {
  test.setTimeout(120_000);
  const browserErrors = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));

  await startHunt(page, { audio: true });
  await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    game.startWaveNow(10, "landEater");
    game.setLandEaterAiEnabled(false);
    game.forceLandEaterPhase(1);
  });
  await page.waitForFunction(() => {
    const music = window.__dustAndDeadTest.getAudioDiagnostics().bossMusic;
    return music.id === "land-eater" &&
      music.active &&
      music.boundToActiveBoss &&
      music.arrangementPhase === 0 &&
      music.scheduledStepCount >= 16 &&
      music.landEaterDrumHitCount > 0 &&
      music.landEaterStringHitCount > 0 &&
      music.landEaterBrassHitCount > 0 &&
      music.landEaterChoirHitCount > 0 &&
      music.landEaterCymbalHitCount > 0 &&
      music.landEaterMotifHitCount > 0 &&
      music.themeGain >= 1.07;
  });
  const phaseOne = await page.evaluate(() => window.__dustAndDeadTest.getAudioDiagnostics());

  expect(phaseOne).toMatchObject({
    supportsWebAudio: true,
    unlocked: true,
    contextState: "running",
    gameActive: true,
  });
  expect(phaseOne.bossMusic).toMatchObject({
    id: "land-eater",
    title: "The World Ends Below",
    lifecycle: "active",
    encounterLifecycle: "active",
    boundToActiveBoss: true,
    active: true,
    normalSuppressed: true,
    tempo: 138,
    meter: "4/4",
    stepsPerBar: 16,
    phraseBars: 12,
    arrangementPhase: 0,
    motif: "D-Eb-F-D-Ab-G-Eb-D",
    compositionVersion: "world-ends-below-v2",
    mixProfile: "apocalyptic-orchestral-frontier-v2",
    phaseMasterGains: [1.08, 1.14, 1.2],
  });
  expect(phaseOne.bossMusic.normalGain).toBeLessThan(0.02);
  expect(phaseOne.bossMusic.themeGain).toBeGreaterThanOrEqual(1.07);
  expect(phaseOne.bossMusic.themeGain).toBeLessThanOrEqual(1.09);
  for (const name of LAND_EATER_EVENT_COUNTERS) {
    expect(Number.isInteger(phaseOne.bossMusic[name]), `${name} must be an integer counter`).toBe(true);
  }
  for (const layer of ["drone", "tremor", "rhythm", "strings", "brass", "choir", "lead"]) {
    expect(Number.isFinite(phaseOne.bossMusic.layerMix[layer]), `${layer} layer must be diagnosed`).toBe(true);
  }

  const startCount = phaseOne.bossMusic.startCount;
  await page.evaluate(() => window.__dustAndDeadTest.forceLandEaterPhase(2));
  await page.waitForFunction((opening) => {
    const music = window.__dustAndDeadTest.getAudioDiagnostics().bossMusic;
    return music.arrangementPhase === 1 &&
      music.startCount === opening.startCount &&
      music.scheduledStepCount > opening.scheduledStepCount &&
      music.themeGain >= 1.13;
  }, phaseOne.bossMusic);
  const phaseTwo = await page.evaluate(() => window.__dustAndDeadTest.getAudioDiagnostics());

  expect(phaseTwo.bossMusic).toMatchObject({
    id: "land-eater",
    arrangementPhase: 1,
    tempo: 138,
    meter: "4/4",
    startCount,
  });
  expect(phaseTwo.bossMusic.transitionCount).toBeGreaterThan(phaseOne.bossMusic.transitionCount);
  expect(phaseTwo.bossMusic.layerMix.rhythm).toBeGreaterThan(phaseOne.bossMusic.layerMix.rhythm);
  expect(phaseTwo.bossMusic.layerMix.strings).toBeGreaterThan(phaseOne.bossMusic.layerMix.strings);
  expect(phaseTwo.bossMusic.layerMix.brass).toBeGreaterThan(phaseOne.bossMusic.layerMix.brass);
  expect(phaseTwo.bossMusic.themeGain).toBeGreaterThanOrEqual(1.13);
  expect(phaseTwo.bossMusic.themeGain).toBeLessThanOrEqual(1.15);

  await page.evaluate(() => window.__dustAndDeadTest.forceLandEaterPhase(3));
  await page.waitForFunction((middle) => {
    const music = window.__dustAndDeadTest.getAudioDiagnostics().bossMusic;
    return music.arrangementPhase === 2 &&
      music.startCount === middle.startCount &&
      music.landEaterCymbalHitCount > middle.landEaterCymbalHitCount &&
      music.landEaterBrassHitCount > middle.landEaterBrassHitCount &&
      music.themeGain >= 1.19;
  }, phaseTwo.bossMusic);
  const phaseThree = await page.evaluate(() => window.__dustAndDeadTest.getAudioDiagnostics());

  expect(phaseThree.bossMusic).toMatchObject({
    id: "land-eater",
    arrangementPhase: 2,
    tempo: 138,
    meter: "4/4",
    startCount,
  });
  expect(phaseThree.bossMusic.transitionCount).toBeGreaterThan(phaseTwo.bossMusic.transitionCount);
  expect(phaseThree.bossMusic.layerMix.rhythm).toBeGreaterThan(phaseTwo.bossMusic.layerMix.rhythm);
  expect(phaseThree.bossMusic.layerMix.strings).toBeGreaterThan(phaseTwo.bossMusic.layerMix.strings);
  expect(phaseThree.bossMusic.layerMix.brass).toBeGreaterThan(phaseTwo.bossMusic.layerMix.brass);
  expect(phaseThree.bossMusic.layerMix.choir).toBeGreaterThan(phaseTwo.bossMusic.layerMix.choir);
  expect(phaseThree.bossMusic.layerMix.lead).toBeGreaterThanOrEqual(phaseTwo.bossMusic.layerMix.lead);
  expect(phaseThree.bossMusic.themeGain).toBeGreaterThanOrEqual(1.19);
  expect(phaseThree.bossMusic.themeGain).toBeLessThanOrEqual(1.21);

  const devourStarted = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const before = game.getAudioDiagnostics().bossMusic;
    const boss = game.forceLandEaterAction("devour");
    // Devour targets the player's current cell. Leave that cell before the
    // forced impact so the production game-over path does not stop WebAudio.
    game.setPlayerPosition(-210, -165);
    return { before, boss };
  });
  await page.waitForFunction((baseline) => {
    const music = window.__dustAndDeadTest.getAudioDiagnostics().bossMusic;
    return music.action === "devour" &&
      music.actionSequence === baseline.boss.actionSeq &&
      music.landEaterDevourCueCount === baseline.before.landEaterDevourCueCount + 1;
  }, devourStarted);
  const devour = await page.evaluate(() => window.__dustAndDeadTest.getAudioDiagnostics().bossMusic);
  expect(devour.startCount).toBe(startCount);

  await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    game.seekLandEaterAction(0.999);
    game.stepLandEater(1 / 30);
  });
  await page.waitForFunction((baseline) => {
    const music = window.__dustAndDeadTest.getAudioDiagnostics().bossMusic;
    // The impact mask is intentionally transient and may already be cleared
    // when the scheduler enters recovery; the monotonic cue counter is the
    // stable exactly-once contract.
    return music.landEaterImpactCueCount === baseline.landEaterImpactCueCount + 1;
  }, devour);
  await page.waitForFunction((baseline) => {
    const music = window.__dustAndDeadTest.getAudioDiagnostics().bossMusic;
    return music.action === "recovery" &&
      music.landEaterRecoveryCueCount === baseline.landEaterRecoveryCueCount + 1;
  }, devour);
  const recovery = await page.evaluate(() => window.__dustAndDeadTest.getAudioDiagnostics().bossMusic);

  const burrowStarted = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const before = game.getAudioDiagnostics().bossMusic;
    const boss = game.forceLandEaterAction("burrow", {
      route: [
        { x: -96, z: -72 },
        { x: 82, z: 54 },
      ],
      targetPlayerId: "local",
    });
    game.seekLandEaterAction(0.25);
    return { before, boss };
  });
  await page.waitForFunction((baseline) => {
    const music = window.__dustAndDeadTest.getAudioDiagnostics().bossMusic;
    return music.action === "burrow" &&
      music.actionSequence === baseline.boss.actionSeq &&
      music.landEaterBurrowCueCount ===
        baseline.before.landEaterBurrowCueCount + 1;
  }, burrowStarted);
  const burrow = await page.evaluate(
    () => window.__dustAndDeadTest.getAudioDiagnostics().bossMusic
  );
  expect(burrow.startCount).toBe(startCount);
  expect(burrow.arrangement).toBe("buried-apocalypse");

  const zigzagStarted = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const before = game.getAudioDiagnostics().bossMusic;
    const boss = game.forceLandEaterAction("zigzag", {
      route: [
        { x: -210, z: -120 },
        { x: 210, z: -58 },
        { x: -210, z: 24 },
        { x: 210, z: 112 },
      ],
    });
    game.seekLandEaterAction(0.1);
    return { before, boss };
  });
  await page.waitForFunction((baseline) => {
    const music = window.__dustAndDeadTest.getAudioDiagnostics().bossMusic;
    return music.action === "zigzag" &&
      music.actionSequence === baseline.boss.actionSeq &&
      music.landEaterZigzagCueCount === baseline.before.landEaterZigzagCueCount + 1 &&
      music.routeSegment === 0;
  }, zigzagStarted);
  const zigzag = await page.evaluate(() => window.__dustAndDeadTest.getAudioDiagnostics().bossMusic);

  // Stay comfortably inside the second leg after its first bounce. With the
  // denser ricochet route, 0.58 can naturally reach the next wall during the
  // observation window and is no longer a valid duplicate-cue probe.
  await page.evaluate(() => window.__dustAndDeadTest.seekLandEaterAction(0.42));
  await page.waitForFunction((baseline) => {
    const music = window.__dustAndDeadTest.getAudioDiagnostics().bossMusic;
    return music.routeSegment > baseline.routeSegment &&
      music.landEaterBounceCueCount === baseline.landEaterBounceCueCount + 1;
  }, zigzag);
  const bounced = await page.evaluate(() => window.__dustAndDeadTest.getAudioDiagnostics().bossMusic);

  // Re-reading the same segment must not schedule a second wall accent.
  await page.evaluate(() => window.__dustAndDeadTest.seekLandEaterAction(0.42));
  await page.waitForTimeout(350);
  const duplicateBounce = await page.evaluate(() => window.__dustAndDeadTest.getAudioDiagnostics().bossMusic);
  expect(duplicateBounce.landEaterBounceCueCount).toBe(bounced.landEaterBounceCueCount);
  expect(duplicateBounce.startCount).toBe(startCount);
  expect(duplicateBounce.themeGain).toBeGreaterThanOrEqual(1.19);
  expect(duplicateBounce.peakStepEventCount).toBeLessThanOrEqual(10);

  // Recover from a main-thread stall without trying to synthesize every missed
  // beat in one scheduler tick.
  const beforeStall = await page.evaluate(() => window.__dustAndDeadTest.getAudioDiagnostics());
  await page.evaluate(() => {
    const until = performance.now() + 850;
    while (performance.now() < until) {
      // Deliberately block the scheduler.
    }
  });
  await page.waitForFunction((skipped) => (
    window.__dustAndDeadTest.getAudioDiagnostics().bossMusic.skippedStepCount > skipped
  ), beforeStall.bossMusic.skippedStepCount);
  const recoveredFromStall = await page.evaluate(() => window.__dustAndDeadTest.getAudioDiagnostics());
  expect(
    recoveredFromStall.bossMusic.skippedStepCount - beforeStall.bossMusic.skippedStepCount
  ).toBeLessThan(18);
  expect(recoveredFromStall.bossMusic.peakStepEventCount).toBeLessThanOrEqual(10);
  expect(recoveredFromStall.transientAudioNodeCount).toBeLessThan(360);
  expect(recoveredFromStall.pendingAudioDisconnectGroups).toBeLessThan(80);

  const deathBaseline = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    game.clearEnemies();
    const before = game.getAudioDiagnostics().bossMusic;
    const defeated = game.forceActiveBossDefeat();
    return { before, defeated };
  });
  expect(deathBaseline.defeated).toBe(true);
  await page.waitForFunction((baseline) => {
    const music = window.__dustAndDeadTest.getAudioDiagnostics().bossMusic;
    return music.lifecycle === "aftermath" &&
      music.fading &&
      music.deathStingCount === baseline.deathStingCount + 1;
  }, deathBaseline.before);
  const deathStarted = await page.evaluate(() => window.__dustAndDeadTest.getAudioDiagnostics().bossMusic);
  expect(deathStarted).toMatchObject({
    id: "land-eater",
    lifecycle: "aftermath",
    encounterLifecycle: "aftermath",
    active: false,
    fading: true,
    normalSuppressed: true,
    deathFadeSeconds: 2.85,
  });
  expect(deathStarted.fadeSecondsRemaining).toBeGreaterThan(1.5);

  // A repeated terminal update cannot duplicate the final cadence.
  const repeatedDefeat = await page.evaluate(() => ({
    defeated: window.__dustAndDeadTest.forceActiveBossDefeat(),
    music: window.__dustAndDeadTest.getAudioDiagnostics().bossMusic,
  }));
  expect(repeatedDefeat.defeated).toBe(false);
  expect(repeatedDefeat.music.deathStingCount).toBe(deathStarted.deathStingCount);

  await page.waitForFunction(() => {
    const audio = window.__dustAndDeadTest.getAudioDiagnostics();
    return !audio.bossMusic.fading &&
      audio.bossMusic.themeGain < 0.01 &&
      audio.bossMusic.persistentNodeCount === 0 &&
      audio.transientAudioNodeCount === 0 &&
      audio.pendingAudioDisconnectGroups === 0;
  }, null, { timeout: 12_000 });
  const deathTail = await page.evaluate(() => window.__dustAndDeadTest.getAudioDiagnostics());
  expect(deathTail.bossMusic).toMatchObject({
    lifecycle: "aftermath",
    active: false,
    fading: false,
    normalSuppressed: true,
    persistentNodeCount: 0,
  });

  await page.evaluate(() => window.__dustAndDeadTest.forceWaveState(11, 0, 0));
  await page.waitForFunction(() => {
    const music = window.__dustAndDeadTest.getAudioDiagnostics().bossMusic;
    return music.lifecycle === "normal" &&
      !music.normalSuppressed &&
      music.normalGain > 0.9 &&
      music.themeGain < 0.01;
  });
  expect(browserErrors).toEqual([]);
});

test("multiplayer peers synthesize Land Eater attack cues locally and deduplicate snapshots", async ({ page, context }) => {
  test.setTimeout(100_000);
  const guest = await context.newPage();
  try {
    await startHunt(page, { audio: true });
    await startHunt(guest, { audio: true });

    await page.evaluate(() => {
      const game = window.__dustAndDeadTest;
      window.__dustMultiplayerTest.startMockHost(["Host", "Guest"]);
      game.startWaveNow(10, "landEater");
      game.setLandEaterAiEnabled(false);
      game.forceLandEaterPhase(3);
      game.forceLandEaterAction("devour");
    });
    await page.waitForFunction(() => {
      const music = window.__dustAndDeadTest.getAudioDiagnostics().bossMusic;
      return music.id === "land-eater" &&
        music.action === "devour" &&
        music.landEaterDevourCueCount > 0;
    });

    const hostDevour = await page.evaluate(() => {
      const game = window.__dustAndDeadTest;
      const multiplayer = window.__dustMultiplayerTest;
      const snapshot = JSON.parse(JSON.stringify(
        multiplayer.buildWireSnapshot(true, true, "mock-player-2")
      ));
      const serialized = JSON.stringify(snapshot).toLowerCase();
      const forbidden = [
        "bossmusic",
        "the world ends below",
        "world-ends-below-v2",
        "compositionversion",
        "scheduledstepcount",
        "landeaterdevourcuecount",
        "landeaterresonatorhitcount",
      ];
      return {
        snapshot,
        decodedBoss: multiplayer.decodeBossState(snapshot.bossState),
        hasMusicPayload: forbidden.some((field) => serialized.includes(field)),
        musicCombatEvents: multiplayer.getNetworkCombatDiagnostics().queuedEvents.filter(
          (event) => /music|soundtrack|stinger/i.test(String(event.type || ""))
        ),
        music: game.getAudioDiagnostics().bossMusic,
        plan: game.getLandEaterMusicPlan(2, "devour", 0, 48),
      };
    });

    const replica = await guest.evaluate((snapshot) => {
      const multiplayer = window.__dustMultiplayerTest;
      multiplayer.startMockGuest(["Host", "Guest"], 1);
      multiplayer.applySnapshot(snapshot);
      multiplayer.applySnapshot(snapshot);
      return window.__dustAndDeadTest.getLandEaterDiagnostics();
    }, hostDevour.snapshot);
    await guest.waitForFunction(() => {
      const music = window.__dustAndDeadTest.getAudioDiagnostics().bossMusic;
      return music.id === "land-eater" &&
        music.active &&
        music.boundToActiveBoss &&
        music.action === "devour" &&
        music.arrangementPhase === 2 &&
        music.landEaterDevourCueCount > 0;
    });
    const guestDevour = await guest.evaluate(() => ({
      music: window.__dustAndDeadTest.getAudioDiagnostics().bossMusic,
      plan: window.__dustAndDeadTest.getLandEaterMusicPlan(2, "devour", 0, 48),
    }));

    await guest.evaluate((snapshot) => window.__dustMultiplayerTest.applySnapshot(snapshot), hostDevour.snapshot);
    await guest.waitForTimeout(350);
    const duplicateDevour = await guest.evaluate(() => window.__dustAndDeadTest.getAudioDiagnostics().bossMusic);
    expect(duplicateDevour.landEaterDevourCueCount).toBe(guestDevour.music.landEaterDevourCueCount);

    const hostZigzag = await page.evaluate(() => {
      const game = window.__dustAndDeadTest;
      game.forceLandEaterAction("zigzag", {
        route: [
          { x: -210, z: -120 },
          { x: 210, z: -50 },
          { x: -210, z: 38 },
          { x: 210, z: 116 },
        ],
      });
      const snapshot = JSON.parse(JSON.stringify(
        window.__dustMultiplayerTest.buildWireSnapshot(true, true, "mock-player-2")
      ));
      return {
        snapshot,
        actionSeq: game.getLandEaterDiagnostics().actionSeq,
      };
    });

    await guest.evaluate((snapshot) => {
      window.__dustMultiplayerTest.applySnapshot(snapshot);
      window.__dustMultiplayerTest.applySnapshot(snapshot);
    }, hostZigzag.snapshot);
    await guest.waitForFunction((baseline) => {
      const music = window.__dustAndDeadTest.getAudioDiagnostics().bossMusic;
      return music.action === "zigzag" &&
        music.actionSequence === baseline.actionSeq &&
        music.landEaterZigzagCueCount === baseline.cueCount + 1;
    }, {
      actionSeq: hostZigzag.actionSeq,
      cueCount: guestDevour.music.landEaterZigzagCueCount,
    });
    const guestZigzag = await guest.evaluate(() => window.__dustAndDeadTest.getAudioDiagnostics().bossMusic);

    await guest.evaluate((snapshot) => window.__dustMultiplayerTest.applySnapshot(snapshot), hostZigzag.snapshot);
    await guest.waitForTimeout(350);
    const duplicateZigzag = await guest.evaluate(() => window.__dustAndDeadTest.getAudioDiagnostics().bossMusic);

    expect(hostDevour.hasMusicPayload).toBe(false);
    expect(hostDevour.musicCombatEvents).toEqual([]);
    expect(hostDevour.decodedBoss).toMatchObject({ kind: "landEater", phase: 3, action: "devour" });
    expect(replica).toMatchObject({ active: true, replica: true, phase: 3, action: "devour" });
    expect(guestDevour.music).toMatchObject({
      id: "land-eater",
      title: "The World Ends Below",
      compositionVersion: "world-ends-below-v2",
      mixProfile: "apocalyptic-orchestral-frontier-v2",
      motif: "D-Eb-F-D-Ab-G-Eb-D",
      tempo: 138,
      meter: "4/4",
      arrangementPhase: 2,
      normalSuppressed: true,
    });
    expect(guestDevour.plan).toEqual(hostDevour.plan);
    expect(guestZigzag.landEaterZigzagCueCount).toBe(
      guestDevour.music.landEaterZigzagCueCount + 1
    );
    expect(duplicateZigzag.landEaterZigzagCueCount).toBe(
      guestZigzag.landEaterZigzagCueCount
    );
  } finally {
    await guest.close();
  }
});
