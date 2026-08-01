const path = require("node:path");
const { expect, test } = require("@playwright/test");

const REQUIRED_TEST_API = [
  "startWaveNow",
  "clearEnemies",
  "forceDoppelgangerScoutForTest",
  "forceDoppelgangerTransformForTest",
  "damageDoppelgangerCloneForTest",
  "getDoppelgangerDiagnostics",
  "getDoppelgangerMusicPlan",
  "getDoppelgangerMusicIntensity",
  "getAudioDiagnostics",
];

const DOPPELGANGER_EVENT_COUNTERS = [
  "doppelgangerBassHitCount",
  "doppelgangerGuitarHitCount",
  "doppelgangerLeadHitCount",
  "doppelgangerShadowHitCount",
  "doppelgangerSpurHitCount",
  "doppelgangerDrumHitCount",
  "doppelgangerWhistleCount",
  "doppelgangerDrawCueCount",
  "doppelgangerPhaseCueCount",
];

const STEPS_PER_BAR = 6;
const PHRASE_BARS = 16;
const CYCLE_STEPS = STEPS_PER_BAR * PHRASE_BARS;

function fileUrl(relativePath) {
  const absolute = path.resolve(__dirname, "..", relativePath).replace(/\\/g, "/");
  return `file:///${absolute}`;
}

async function startHunt(page, { audio = true } = {}) {
  await page.goto(`${fileUrl("index.html")}?mapSeed=7331&doppelgangerMusicTest=1`);
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
  await page.waitForFunction(() => Boolean(window.__dustAndDeadTest?.getDoppelgangerDiagnostics));

  const missing = await page.evaluate((names) => names.filter(
    (name) => typeof window.__dustAndDeadTest?.[name] !== "function"
  ), REQUIRED_TEST_API);
  expect(missing, `Doppelganger music test API is incomplete: ${missing.join(", ")}`).toEqual([]);

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

function planDensity(plan) {
  return plan.reduce((total, row) => total + Number(row.eventCount || 0), 0) /
    Math.max(1, plan.length);
}

test("Waltz of the Second Gun keeps a strict 3/4 spine while every phase adds bounded drive", async ({ page }) => {
  await startHunt(page, { audio: false });

  const plans = await page.evaluate((cycleSteps) => {
    const getPlan = window.__dustAndDeadTest.getDoppelgangerMusicPlan;
    return [0, 1, 2, 3].map((phase) => ({
      first: getPlan(phase, phase === 0 ? "transforming" : "boss", 0, cycleSteps),
      repeated: getPlan(phase, phase === 0 ? "transforming" : "boss", 0, cycleSteps),
    }));
  }, CYCLE_STEPS);

  const densities = [];
  for (const [phase, result] of plans.entries()) {
    expect(result.first, `phase ${phase} plan must be deterministic`).toEqual(result.repeated);
    expect(result.first).toHaveLength(CYCLE_STEPS);
    expect(result.first.every((row) => row.motifFamily === "second-gun-waltz")).toBe(true);
    // A dense step is still a waltz step: the arrangement must never pile up
    // more simultaneous voices than the boss bus was measured with.
    expect(Math.max(...result.first.map((row) => row.eventCount))).toBeLessThanOrEqual(8);

    // The bass falls on the downbeat of every bar and nowhere else before the
    // alternating-bass phases; that is what keeps the oom-pah-pah readable.
    const downbeats = result.first.filter((row) => row.beat === 0);
    expect(downbeats).toHaveLength(PHRASE_BARS);
    expect(downbeats.every((row) => Number(row.bassNote) > 0)).toBe(true);
    const offbeatBass = result.first.filter((row) => row.beat !== 0 && Number(row.bassNote) > 0);
    if (phase >= 2) expect(offbeatBass.every((row) => row.beat === 3)).toBe(true);
    else expect(offbeatBass).toHaveLength(0);

    densities.push(planDensity(result.first));
  }

  // The draw is the quietest thing in the encounter and the last exchange the
  // busiest, with no step in between going backwards.
  expect(densities[1]).toBeGreaterThan(densities[0]);
  expect(densities[2]).toBeGreaterThan(densities[1]);
  expect(densities[3]).toBeGreaterThan(densities[2]);
});

test("Waltz of the Second Gun answers itself in canon before both violins collide", async ({ page }) => {
  await startHunt(page, { audio: false });

  const [draw, opening, escalation, finale] = await page.evaluate((cycleSteps) => {
    const getPlan = window.__dustAndDeadTest.getDoppelgangerMusicPlan;
    return [
      getPlan(0, "transforming", 0, cycleSteps),
      getPlan(1, "boss", 0, cycleSteps),
      getPlan(2, "boss", 0, cycleSteps),
      getPlan(3, "boss", 0, cycleSteps),
    ];
  }, CYCLE_STEPS);

  // Nobody has drawn yet: no violins, no spurs, only the pedal, one guitar and
  // the whistled head.
  expect(draw.every((row) => Number(row.leadNote) === 0)).toBe(true);
  expect(draw.every((row) => Number(row.shadowNote) === 0)).toBe(true);
  expect(draw.every((row) => row.spur === false)).toBe(true);
  expect(draw.some((row) => Number(row.whistleNote) > 0)).toBe(true);

  // Opening duel: the copy repeats what the player's violin played one bar
  // earlier, so the second bar of the answer is the first bar of the theme.
  expect(opening.every((row) => row.shadowMode === "silent" || row.shadowMode === "canon")).toBe(true);
  const leadByStep = new Map(opening.map((row) => [row.step, Number(row.leadNote)]));
  const canonRows = opening.filter((row) => row.shadowMode === "canon" && Number(row.shadowNote) > 0);
  expect(canonRows.length).toBeGreaterThan(0);
  for (const row of canonRows) {
    const sourceStep = (row.step - STEPS_PER_BAR + CYCLE_STEPS) % CYCLE_STEPS;
    expect(
      Number(row.shadowNote),
      `step ${row.step} must echo the lead from step ${sourceStep}`
    ).toBeCloseTo(leadByStep.get(sourceStep), 2);
  }

  // Escalation alternates the echo with the copy's own line.
  expect(escalation.some((row) => row.shadowMode === "canon")).toBe(true);
  expect(escalation.some((row) => row.shadowMode === "contrary")).toBe(true);

  // Last exchange: the copy stops answering and plays across the lead. The two
  // voices must actually sound together on the phrase's opening leap.
  expect(finale.every((row) => row.shadowMode === "silent" || row.shadowMode === "contrary")).toBe(true);
  const collisions = finale.filter((row) => Number(row.leadNote) > 0 && Number(row.shadowNote) > 0);
  expect(collisions.length).toBeGreaterThan(0);
  // Bar 4 is the octave leap: the lead jumps to D5 while the copy stays on D4.
  const leap = finale.find((row) => row.bar === 4 && row.beat === 0);
  expect(pitchClass(leap.leadNote)).toBe(pitchClass(leap.shadowNote));
  expect(Number(leap.leadNote)).toBeGreaterThan(Number(leap.shadowNote));

  // The whole waltz stays inside one Andalusian cycle in D minor: the bar
  // roots are exactly D, C, Bb, A and G, with D as home and A as the dominant.
  const roots = [...new Set(finale.map((row) => pitchClass(row.harmonicRoot)))].sort((a, b) => a - b);
  expect(roots).toEqual([0, 2, 7, 9, 10]);
  const barRoots = [];
  for (const row of finale) {
    if (row.beat === 0) barRoots.push(pitchClass(row.harmonicRoot));
  }
  expect(barRoots[0], "the cycle must open on D").toBe(2);
  expect(barRoots[barRoots.length - 1], "and turn around on A").toBe(9);
});

test("Waltz of the Second Gun follows the copies, then resolves and hands the score back", async ({ page }) => {
  test.setTimeout(120_000);
  const browserErrors = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));

  await startHunt(page, { audio: true });
  await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    game.clearEnemies();
    game.forceDoppelgangerScoutForTest();
    game.startWaveNow(10);
  });

  await page.waitForFunction(() => {
    const music = window.__dustAndDeadTest.getAudioDiagnostics().bossMusic;
    return music.id === "doppelganger" &&
      music.active &&
      music.boundToActiveBoss &&
      music.scheduledStepCount >= 12 &&
      music.doppelgangerBassHitCount > 0 &&
      music.doppelgangerGuitarHitCount > 0 &&
      music.doppelgangerLeadHitCount > 0 &&
      music.doppelgangerShadowHitCount > 0;
  });

  const opening = await page.evaluate(() => window.__dustAndDeadTest.getAudioDiagnostics());
  expect(opening).toMatchObject({
    supportsWebAudio: true,
    unlocked: true,
    contextState: "running",
    gameActive: true,
  });
  expect(opening.bossMusic).toMatchObject({
    id: "doppelganger",
    title: "Waltz of the Second Gun",
    lifecycle: "active",
    encounterLifecycle: "active",
    boundToActiveBoss: true,
    active: true,
    normalSuppressed: true,
    meter: "3/4",
    stepsPerBar: STEPS_PER_BAR,
    phraseBars: PHRASE_BARS,
    compositionVersion: "waltz-of-the-second-gun-v1",
    mixProfile: "dry-street-duel-trio-v1",
    doppelgangerTempos: [92, 126, 138, 152],
  });
  // The Bell Ringer's cathedral organ must never stand in for this fight again.
  expect(opening.bossMusic.arrangement).not.toBe("procession");
  expect(opening.bossMusic.normalGain).toBeLessThan(0.02);
  expect(opening.bossMusic.tempo).toBe(126);
  expect(opening.bossMusic.doppelgangerTotalCount).toBeGreaterThan(0);
  for (const name of DOPPELGANGER_EVENT_COUNTERS) {
    expect(Number.isInteger(opening.bossMusic[name]), `${name} must be an integer counter`).toBe(true);
  }
  for (const layer of ["drone", "shadowDrone", "rhythm", "guitar", "lead", "shadow", "spurs"]) {
    expect(Number.isFinite(opening.bossMusic.layerMix[layer]), `${layer} layer must be diagnosed`).toBe(true);
  }

  const startCount = opening.bossMusic.startCount;

  // Hurting the copies is the only thing that drives this arrangement, so the
  // score has to tighten from the damage alone.
  await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const diagnostics = game.getDoppelgangerDiagnostics();
    const clones = diagnostics.clones || [];
    for (let index = 0; index < clones.length; index += 1) {
      game.damageDoppelgangerCloneForTest(index, (clones[index].maxHp || 120) * 0.55);
    }
  });
  await page.waitForFunction((opened) => {
    const music = window.__dustAndDeadTest.getAudioDiagnostics().bossMusic;
    return music.arrangementPhase >= 2 && music.startCount === opened;
  }, startCount);

  const escalated = await page.evaluate(() => window.__dustAndDeadTest.getAudioDiagnostics());
  expect(escalated.bossMusic.tempo).toBeGreaterThanOrEqual(138);
  expect(escalated.bossMusic.startCount, "the waltz must tighten, not restart").toBe(startCount);
  expect(escalated.bossMusic.transitionCount).toBeGreaterThan(0);
  expect(escalated.bossMusic.doppelgangerPhaseCueCount).toBeGreaterThan(0);
  expect(escalated.bossMusic.doppelgangerHpRatio).toBeLessThan(opening.bossMusic.doppelgangerHpRatio + 0.001);

  await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const clones = game.getDoppelgangerDiagnostics().clones || [];
    for (let index = 0; index < clones.length; index += 1) {
      game.damageDoppelgangerCloneForTest(
        index,
        Math.max(1, Number(clones[index].maxHp) || 1)
      );
    }
  });
  await page.waitForFunction(() => {
    const music = window.__dustAndDeadTest.getAudioDiagnostics().bossMusic;
    return music.lifecycle === "aftermath" && music.deathStingCount > 0;
  });
  const aftermath = await page.evaluate(() => window.__dustAndDeadTest.getAudioDiagnostics());
  expect(aftermath.bossMusic.deathFadeSeconds).toBeCloseTo(1.95, 2);
  // The encounter is cleared 2.2 s after the last copy falls; the cadence has
  // to finish inside that window rather than being cut off by the next wave.
  expect(aftermath.bossMusic.deathFadeSeconds).toBeLessThan(2.2);

  await page.waitForFunction(() => {
    const music = window.__dustAndDeadTest.getAudioDiagnostics().bossMusic;
    return music.lifecycle === "normal" &&
      !music.normalSuppressed &&
      music.normalGain > 0.5;
  }, undefined, { timeout: 30_000 });
  const restored = await page.evaluate(() => window.__dustAndDeadTest.getAudioDiagnostics());
  expect(restored.bossMusic.id).toBe("");
  expect(restored.bossMusic.themeGain).toBeLessThan(0.02);
  expect(restored.bossMusic.normalGain).toBeGreaterThan(0.5);
  expect(restored.bossMusic.persistentNodeCount).toBe(0);

  expect(browserErrors, `browser errors: ${browserErrors.join(" | ")}`).toEqual([]);
});

test("Waltz of the Second Gun stays out of the wire protocol", async ({ page }) => {
  await startHunt(page, { audio: false });
  await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    game.clearEnemies();
    game.forceDoppelgangerScoutForTest();
    game.forceDoppelgangerTransformForTest(true);
  });

  // Music is a local presentation decision. No tempo, gain, note, theme id or
  // scheduler state may ever reach another peer.
  const wire = await page.evaluate(() => JSON.stringify(
    window.__dustAndDeadTest.getDoppelgangerWireState()
  ));
  for (const forbidden of [
    "waltz",
    "secondGun",
    "second-gun",
    "tempo",
    "music",
    "whistle",
    "violin",
    "guitar",
    "spur",
    "rasgueado",
  ]) {
    expect(wire.toLowerCase(), `wire state must not carry "${forbidden}"`).not.toContain(forbidden.toLowerCase());
  }
});
