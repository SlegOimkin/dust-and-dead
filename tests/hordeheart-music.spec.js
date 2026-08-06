const path = require("node:path");
const { expect, test } = require("@playwright/test");

const REQUIRED_TEST_API = [
  "startWaveNow",
  "forceHordeheartPhase",
  "setHordeheartAiEnabled",
  "getHordeheartDiagnostics",
  "getHordeheartPackedWireDiagnostics",
  "getAudioDiagnostics",
  "forceActiveBossDefeat",
];

const HORDE_EVENT_COUNTERS = [
  "hordePulseHitCount",
  "hordeStringHitCount",
  "hordeChoirHitCount",
  "hordeLeadHitCount",
  "hordeImpactHitCount",
];

function fileUrl(relativePath) {
  const absolute = path.resolve(__dirname, "..", relativePath).replace(/\\/g, "/");
  return `file:///${absolute}`;
}

async function startHunt(page, { audio = true } = {}) {
  await page.goto(`${fileUrl("index.html")}?mapSeed=7331`);
  const intro = page.locator("#intro-screen");
  if (await intro.isVisible().catch(() => false)) {
    await page.keyboard.press("KeyM");
    await expect(intro).toBeHidden();
  }

  await page.waitForFunction(() => Boolean(window.__dustAndDeadTest?.getAudioDiagnostics));
  const audioEnabled = await page.evaluate(() => window.__dustAndDeadTest.getAudioDiagnostics().enabled);
  if (audioEnabled !== audio) await page.locator("#menu-music-btn").click();

  // The real pointer gesture unlocks WebAudio in Chromium. Tests intentionally
  // use the production scheduler and only observe its deterministic counters.
  await page.getByRole("button", { name: "Start Hunt" }).click();
  await page.waitForFunction(() => Boolean(window.__dustAndDeadTest?.forceHordeheartPhase));

  const missing = await page.evaluate((names) => names.filter(
    (name) => typeof window.__dustAndDeadTest?.[name] !== "function"
  ), REQUIRED_TEST_API);
  expect(missing, `Hordeheart music test API is incomplete: ${missing.join(", ")}`).toEqual([]);

  if (audio) {
    await page.waitForFunction(() => {
      const diagnostics = window.__dustAndDeadTest.getAudioDiagnostics();
      return diagnostics.unlocked && diagnostics.contextState === "running";
    });
  }
}

function pickHordeCounters(music) {
  return Object.fromEntries(HORDE_EVENT_COUNTERS.map((name) => [name, music[name]]));
}

test("Litany of the Many dissolves the quiet horde and grows one continuous 12/8 boss theme", async ({ page }) => {
  test.setTimeout(90_000);
  const browserErrors = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));

  await startHunt(page, { audio: true });
  await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    game.startWaveNow(10, "hordeheart");
    game.setHordeheartAiEnabled(false);
    game.forceHordeheartPhase("horde");
  });
  await page.waitForFunction(() => {
    const music = window.__dustAndDeadTest.getAudioDiagnostics().bossMusic;
    return music.id === "hordeheart" &&
      music.active &&
      music.action === "horde" &&
      music.scheduledStepCount >= 2 &&
      music.hordePulseHitCount > 0 &&
      music.hordeChoirHitCount > 0 &&
      music.themeGain >= 1.34;
  });
  const horde = await page.evaluate(() => window.__dustAndDeadTest.getAudioDiagnostics());

  expect(horde).toMatchObject({
    supportsWebAudio: true,
    unlocked: true,
    contextState: "running",
    gameActive: true,
  });
  expect(horde.bossMusic).toMatchObject({
    id: "hordeheart",
    title: "Litany of the Many",
    lifecycle: "active",
    encounterLifecycle: "active",
    boundToActiveBoss: true,
    active: true,
    normalSuppressed: true,
    phase: 0,
    arrangementPhase: 0,
    action: "horde",
    arrangement: "murmur-of-the-horde",
    motif: "D-Eb-murmur",
    compositionVersion: "litany-of-the-many-v3",
    mixProfile: "organic-choral-pressure-v3",
    tempo: 64,
    meter: "6/4",
    stepsPerBar: 12,
    phraseBars: 8,
    hordeAccentPattern: "3+3+2+2+2",
    hordeHordeTempo: 64,
    hordeMasterGainMultiplier: 1.25,
    hordeHordeMasterGain: 1.35,
    hordeMainMasterGain: 1.3,
    hordeFinaleMasterGain: 1.4,
    hordeMainDottedQuarterTempo: 86,
  });
  expect(horde.bossMusic.themeGain).toBeGreaterThanOrEqual(1.34);
  expect(horde.bossMusic.themeGain).toBeLessThanOrEqual(1.36);
  expect(horde.bossMusic.normalGain).toBeLessThan(0.02);
  expect(horde.bossMusic.peakStepEventCount).toBeLessThanOrEqual(2);
  expect(horde.bossMusic.persistentNodeCount).toBeGreaterThanOrEqual(7);
  for (const counter of HORDE_EVENT_COUNTERS) {
    expect(Number.isInteger(horde.bossMusic[counter]), `${counter} must be an independent integer counter`).toBe(true);
  }

  const hordeStartCount = horde.bossMusic.startCount;
  await page.evaluate(() => window.__dustAndDeadTest.forceHordeheartPhase("gather"));
  await page.waitForFunction(() => {
    const music = window.__dustAndDeadTest.getAudioDiagnostics().bossMusic;
    return music.action === "gather" &&
      music.arrangement === "the-horde-falls-silent" &&
      music.hordeDissolveCount === 1;
  });
  const gatherStarted = await page.evaluate(() => window.__dustAndDeadTest.getAudioDiagnostics().bossMusic);
  const gatherCounters = pickHordeCounters(gatherStarted);
  await page.waitForTimeout(1100);
  const gatherSilent = await page.evaluate(() => window.__dustAndDeadTest.getAudioDiagnostics().bossMusic);

  expect(gatherStarted).toMatchObject({
    action: "gather",
    arrangementPhase: 0,
    arrangement: "the-horde-falls-silent",
    tempo: 64,
    meter: "6/4",
    normalSuppressed: true,
    hordeDissolveCount: 1,
    startCount: hordeStartCount,
  });
  expect(gatherSilent.hordeDissolveCount).toBe(1);
  expect(pickHordeCounters(gatherSilent)).toEqual(gatherCounters);
  expect(gatherSilent.themeGain).toBeLessThan(0.01);
  expect(gatherSilent.normalGain).toBeLessThan(0.01);

  await page.evaluate(() => window.__dustAndDeadTest.forceHordeheartPhase("whole"));
  await page.waitForFunction((previousScheduledSteps) => {
    const music = window.__dustAndDeadTest.getAudioDiagnostics().bossMusic;
    return music.action === "whole" &&
      music.arrangementPhase === 1 &&
      music.hordeAssemblyCueCount === 1 &&
      music.hordeLeadHitCount > 0 &&
      music.scheduledStepCount > previousScheduledSteps &&
      music.themeGain >= 1.29;
  }, gatherSilent.scheduledStepCount);
  const whole = await page.evaluate(() => window.__dustAndDeadTest.getAudioDiagnostics().bossMusic);

  expect(whole).toMatchObject({
    action: "whole",
    arrangementPhase: 1,
    arrangement: "litany-of-one-flesh",
    motif: "D-Eb-A-G-F",
    tempo: 86,
    meter: "12/8",
    materialized: true,
    hordeAssemblyCueCount: 1,
    hordeDissolveCount: 1,
    startCount: hordeStartCount,
  });
  expect(whole.themeGain).toBeGreaterThanOrEqual(1.29);
  expect(whole.themeGain).toBeLessThanOrEqual(1.31);
  expect(whole.hordeImpactHitCount).toBeGreaterThan(gatherSilent.hordeImpactHitCount);

  await page.evaluate(() => window.__dustAndDeadTest.forceHordeheartPhase("halves"));
  await page.waitForFunction((baseline) => {
    const music = window.__dustAndDeadTest.getAudioDiagnostics().bossMusic;
    return music.action === "halves" &&
      music.arrangementPhase === 2 &&
      music.hordeStringHitCount > baseline.hordeStringHitCount &&
      music.hordeChoirHitCount > baseline.hordeChoirHitCount &&
      music.themeGain >= 1.29;
  }, whole);
  const halves = await page.evaluate(() => window.__dustAndDeadTest.getAudioDiagnostics().bossMusic);

  expect(halves).toMatchObject({
    action: "halves",
    arrangementPhase: 2,
    arrangement: "divided-counterlitany",
    motif: "D-Eb-A-G-F",
    tempo: 86,
    meter: "12/8",
    hordeAssemblyCueCount: 1,
    startCount: hordeStartCount,
  });
  expect(halves.transitionCount).toBeGreaterThan(whole.transitionCount);
  expect(halves.themeGain).toBeGreaterThanOrEqual(1.29);
  expect(halves.themeGain).toBeLessThanOrEqual(1.31);

  await page.evaluate(() => window.__dustAndDeadTest.forceHordeheartPhase("quarters"));
  await page.waitForFunction((baseline) => {
    const music = window.__dustAndDeadTest.getAudioDiagnostics().bossMusic;
    return music.action === "quarters" &&
      music.arrangementPhase === 3 &&
      music.hordeLeadHitCount > baseline.hordeLeadHitCount &&
      music.hordeStringHitCount > baseline.hordeStringHitCount &&
      music.themeGain >= 1.39;
  }, halves);
  const quarters = await page.evaluate(() => window.__dustAndDeadTest.getAudioDiagnostics().bossMusic);

  expect(quarters).toMatchObject({
    action: "quarters",
    arrangementPhase: 3,
    arrangement: "many-mouths-finale",
    motif: "D-Eb-A-G-F",
    tempo: 86,
    meter: "12/8",
    hordeAssemblyCueCount: 1,
    startCount: hordeStartCount,
  });
  expect(quarters.transitionCount).toBeGreaterThan(halves.transitionCount);
  expect(quarters.themeGain).toBeGreaterThanOrEqual(1.39);
  expect(quarters.themeGain).toBeLessThanOrEqual(1.41);

  await page.evaluate(() => window.__dustAndDeadTest.forceActiveBossDefeat());
  await page.waitForFunction(() => {
    const music = window.__dustAndDeadTest.getAudioDiagnostics().bossMusic;
    return music.lifecycle === "aftermath" && music.fading && music.deathStingCount === 1;
  });
  const deathStarted = await page.evaluate(() => window.__dustAndDeadTest.getAudioDiagnostics().bossMusic);
  await page.evaluate(() => window.__dustAndDeadTest.forceActiveBossDefeat());
  await page.waitForTimeout(250);
  const deathRepeated = await page.evaluate(() => window.__dustAndDeadTest.getAudioDiagnostics().bossMusic);

  expect(deathStarted).toMatchObject({
    lifecycle: "aftermath",
    encounterLifecycle: "aftermath",
    active: false,
    fading: true,
    normalSuppressed: true,
    deathStingCount: 1,
    deathFadeSeconds: 2.65,
  });
  // Polling can observe the fade after part of its 2.65 s tail has elapsed;
  // the exact configured duration above is the stable contract.
  expect(deathStarted.fadeSecondsRemaining).toBeGreaterThan(0.8);
  expect(deathRepeated.deathStingCount).toBe(1);
  expect(deathRepeated.startCount).toBe(hordeStartCount);

  await page.waitForFunction(() => {
    const music = window.__dustAndDeadTest.getAudioDiagnostics().bossMusic;
    return !music.fading && music.themeGain < 0.01;
  }, null, { timeout: 7_000 });
  const deathTail = await page.evaluate(() => window.__dustAndDeadTest.getAudioDiagnostics().bossMusic);
  expect(deathTail).toMatchObject({
    lifecycle: "aftermath",
    active: false,
    fading: false,
    normalSuppressed: true,
    deathStingCount: 1,
  });
  expect(deathTail.themeGain).toBeLessThan(0.01);
  expect(browserErrors).toEqual([]);
});

test("Hordeheart music is synthesized locally from replicated phase with no music snapshot payload", async ({ page, context }) => {
  test.setTimeout(70_000);
  const guest = await context.newPage();
  try {
    await startHunt(page, { audio: true });
    await startHunt(guest, { audio: true });

    await page.evaluate(() => {
      const game = window.__dustAndDeadTest;
      const multiplayer = window.__dustMultiplayerTest;
      multiplayer.startMockHost(["Host", "Guest"]);
      game.startWaveNow(10, "hordeheart");
      game.setHordeheartAiEnabled(false);
      game.forceHordeheartPhase("horde");
    });
    await page.waitForFunction(() => {
      const music = window.__dustAndDeadTest.getAudioDiagnostics().bossMusic;
      return music.id === "hordeheart" &&
        music.action === "horde" &&
        music.arrangementPhase === 0 &&
        music.step >= 3 && music.step <= 6;
    });
    const recoveryBaseline = await page.evaluate(() => window.__dustAndDeadTest.getAudioDiagnostics().bossMusic);
    await page.evaluate(() => {
      window.__dustAndDeadTest.forceHordeheartPhase("quarters");
    });
    await page.waitForFunction(() => {
      const music = window.__dustAndDeadTest.getAudioDiagnostics().bossMusic;
      return music.action === "quarters" &&
        music.arrangementPhase === 3 &&
        music.tempo === 86 &&
        music.meter === "12/8";
    }, null, { timeout: 1_500 });
    const recoveredMusic = await page.evaluate(() => window.__dustAndDeadTest.getAudioDiagnostics().bossMusic);

    const host = await page.evaluate(() => {
      const game = window.__dustAndDeadTest;
      const multiplayer = window.__dustMultiplayerTest;
      const snapshot = JSON.parse(JSON.stringify(
        multiplayer.buildWireSnapshot(true, true, "mock-player-2")
      ));
      const serializedWire = JSON.stringify(snapshot).toLowerCase();
      const forbiddenMusicFields = [
        "bossmusic",
        "carrion communion",
        "litany-of-the-many-v3",
        "compositionversion",
        "scheduledstepcount",
        "hordepulsehitcount",
        "hordeassemblycuecount",
      ];
      const combat = multiplayer.getNetworkCombatDiagnostics();
      return {
        snapshot,
        decodedBoss: multiplayer.decodeBossState(snapshot.bossState),
        packed: game.getHordeheartPackedWireDiagnostics(),
        hasMusicPayload: forbiddenMusicFields.some((field) => serializedWire.includes(field)),
        musicCombatEvents: combat.queuedEvents.filter((event) => /music/i.test(String(event.type || ""))),
      };
    });

    expect(recoveredMusic).toMatchObject({
      action: "quarters",
      arrangementPhase: 3,
      arrangement: "many-mouths-finale",
      tempo: 86,
      meter: "12/8",
      startCount: recoveryBaseline.startCount,
      hordeAssemblyCueCount: 0,
    });

    const replica = await guest.evaluate((snapshot) => {
      const multiplayer = window.__dustMultiplayerTest;
      multiplayer.startMockGuest(["Host", "Guest"], 1);
      multiplayer.applySnapshot(snapshot);
      return window.__dustAndDeadTest.getHordeheartDiagnostics();
    }, host.snapshot);
    await guest.waitForFunction(() => {
      const music = window.__dustAndDeadTest.getAudioDiagnostics().bossMusic;
      return music.id === "hordeheart" &&
        music.active &&
        music.action === "quarters" &&
        music.arrangementPhase === 3 &&
        music.scheduledStepCount > 0;
    });
    const guestMusic = await guest.evaluate(() => window.__dustAndDeadTest.getAudioDiagnostics().bossMusic);

    expect(host.hasMusicPayload).toBe(false);
    expect(host.musicCombatEvents).toEqual([]);
    expect(host.decodedBoss).toMatchObject({ kind: "hordeheart", phase: "quarters" });
    expect(host.packed).toMatchObject({ kind: "hordeheart", phase: "quarters", bodyCount: 4 });
    expect(replica).toMatchObject({ active: true, replica: true, phase: "quarters" });
    expect(guestMusic).toMatchObject({
      id: "hordeheart",
      title: "Litany of the Many",
      active: true,
      boundToActiveBoss: true,
      action: "quarters",
      arrangementPhase: 3,
      arrangement: "many-mouths-finale",
      motif: "D-Eb-A-G-F",
      compositionVersion: "litany-of-the-many-v3",
      tempo: 86,
      meter: "12/8",
      normalSuppressed: true,
    });
  } finally {
    await guest.close();
  }
});
