const path = require("node:path");
const { expect, test } = require("@playwright/test");

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
    window.__dustAndDeadTest?.getOilBaronDiagnostics &&
    window.__dustAndDeadTest?.advanceOilBaron &&
    window.__dustAndDeadTest?.acceptOilBaronBribe
  ));
}

async function startBaron(page) {
  return page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const wave = game.startWaveNow(10, "oilBaron");
    game.clearEnemies();
    game.setOilBaronAiEnabled(false);
    return { wave, baron: game.getOilBaronDiagnostics() };
  });
}

test("the Oil Baron preview presents the black-gold boss and detailed pumpjacks", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto(`${fileUrl("index.html")}?mapSeed=7331&preview=oil-baron`);
  await page.waitForFunction(() => Boolean(window.__dustAndDeadTest?.getOilBaronDiagnostics));

  const baron = await page.evaluate(() => window.__dustAndDeadTest.getOilBaronDiagnostics());

  expect(pageErrors).toEqual([]);
  expect(baron).toMatchObject({ active: true, defeated: false, phase: 0, derrickCount: 3 });
  expect(baron.boss.hp).toBe(2160);
  expect(baron.boss.visualParts).toBeGreaterThanOrEqual(25);
  expect(baron.boss.modelScale).toBeGreaterThanOrEqual(1.29);
  expect(baron.boss.modelScale).toBeLessThan(1.4);
  expect(baron.boss.worldHealthBar).toBe(false);
  expect(baron.boss.render).toMatchObject({
    batched: true,
    visualBatches: 9,
    batchSourceCount: 59,
    shadowBatches: 7,
    batchError: "",
  });
  expect(baron.boss.render.visibleDrawItems).toBeLessThanOrEqual(19);
  expect(baron.boss.render.shadowCasters).toBeLessThanOrEqual(14);
  expect(baron.derricks.every((derrick) => derrick.visualParts >= 10)).toBe(true);
  expect(baron.burningPuddles).toBe(1);
  await expect(page.locator("#boss-hud")).toHaveClass(/is-oil-baron/);
  await expect(page.locator("#boss-name")).toHaveText("THE OIL BARON · KING OF BLACK GOLD");
  await expect(page.locator(".boss-oil-indicator")).toContainText("DERRICKS · 3");
});

test("the playable Oil Baron rifle stand starts a full fight with no prebuilt derricks", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto(`${fileUrl("index.html")}?mapSeed=7331&preview=oil-baron-rifle-test`);
  await page.waitForFunction(() => Boolean(window.__dustAndDeadTest?.getOilBaronDiagnostics));

  const result = await page.evaluate(() => ({
    state: JSON.parse(window.render_game_to_text()),
    baron: window.__dustAndDeadTest.getOilBaronDiagnostics(),
  }));

  expect(pageErrors).toEqual([]);
  expect(result.state).toMatchObject({
    mode: "playing",
    wave: 10,
    wave10BossKind: "oilBaron",
    weapon: "rifle",
    player: { visible: true },
    progression: {
      level: 30,
      playerClass: "ranger",
      rifleUpgrade: "leverBarrage",
    },
    ammo: { reserve: 9999 },
  });
  expect(result.state.ownedWeapons).toContain("rifle");
  expect(result.state.waveSpawnTarget).toBeGreaterThan(0);
  expect(result.baron).toMatchObject({ active: true, defeated: false, aiEnabled: true, derrickCount: 0 });
  await expect(page.locator("#boss-hud")).toHaveClass(/is-oil-baron/);
  await expect(page.locator(".boss-oil-indicator")).toContainText("DERRICKS");
});

test("Black Gold Covenant has a deterministic 48-bar form with distinct combat, deal, and starfall arrangements", async ({ page }) => {
  await startHunt(page, { audio: false });
  const plans = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    return {
      opening: game.getOilBaronMusicPlan(0, "combat", 0, 384),
      openingRepeat: game.getOilBaronMusicPlan(0, "combat", 0, 384),
      finale: game.getOilBaronMusicPlan(2, "combat", 0, 384),
      offer: game.getOilBaronMusicPlan(1, "offer", 0, 64),
      starfall: game.getOilBaronMusicPlan(1, "starfall", 0, 64),
    };
  });

  expect(plans.opening).toEqual(plans.openingRepeat);
  expect(plans.opening).toHaveLength(384);
  expect([...new Set(plans.opening.map((entry) => entry.section))]).toEqual([0, 1, 2, 3, 4, 5]);
  expect(new Set(plans.opening.map((entry) => entry.harmony)).size).toBeGreaterThanOrEqual(12);
  expect(new Set(plans.opening.filter((entry) => entry.lead).map((entry) => entry.lead)).size).toBeGreaterThanOrEqual(7);
  expect(Math.max(...plans.finale.map((entry) => entry.eventCount))).toBeLessThanOrEqual(8);
  expect(plans.finale).not.toEqual(plans.opening);
  expect(plans.opening.every((entry) => entry.motifFamily === "black-gold-brand")).toBe(true);
  expect(plans.offer.some((entry) => entry.coin > 0)).toBe(true);
  expect(plans.offer.every((entry) => !entry.pump && !entry.chain && entry.lead === 0)).toBe(true);
  expect(plans.starfall.some((entry) => entry.pump && entry.chain === false)).toBe(true);
  expect(plans.starfall.some((entry) => entry.chain)).toBe(true);
  expect(plans.starfall.every((entry) => entry.lead === 0)).toBe(true);
});

test("Black Gold Covenant owns the Oil Baron route, evolves by phase, and cleans up after the fight", async ({ page }) => {
  await startHunt(page, { audio: true });
  await startBaron(page);
  await page.waitForFunction(() => {
    const music = window.__dustAndDeadTest.getAudioDiagnostics().bossMusic;
    return music.id === "oil-baron" && music.active && music.scheduledStepCount >= 8 && music.chainHitCount > 0;
  });
  const opening = await page.evaluate(() => window.__dustAndDeadTest.getAudioDiagnostics());

  await page.evaluate(() => window.__dustAndDeadTest.forceOilBaronAction("bribe"));
  await page.waitForFunction(() => window.__dustAndDeadTest.getAudioDiagnostics().bossMusic.action === "offer");
  const offer = await page.evaluate(() => window.__dustAndDeadTest.getAudioDiagnostics());
  await page.evaluate(() => window.__dustAndDeadTest.acceptOilBaronBribe());
  await page.waitForFunction(() => window.__dustAndDeadTest.getAudioDiagnostics().bossMusic.action === "combat");

  await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    game.damageOilBaron(game.getOilBaronDiagnostics().boss.maxHp * 0.4, true);
    game.advanceOilBaron(34);
  });
  await page.waitForFunction(() => window.__dustAndDeadTest.getAudioDiagnostics().bossMusic.arrangementPhase === 1);
  const burning = await page.evaluate(() => window.__dustAndDeadTest.getAudioDiagnostics());

  await page.evaluate(() => window.__dustAndDeadTest.forceOilBaronAction("star"));
  await page.waitForFunction(() => window.__dustAndDeadTest.getAudioDiagnostics().bossMusic.action === "starfall");
  const starfall = await page.evaluate(() => window.__dustAndDeadTest.getAudioDiagnostics());
  await page.evaluate(() => window.__dustAndDeadTest.damageOilBaron(0, true));
  await page.waitForFunction(() => window.__dustAndDeadTest.getAudioDiagnostics().bossMusic.action === "combat");

  await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    game.damageOilBaron(game.getOilBaronDiagnostics().boss.maxHp * 0.31, true);
    game.advanceOilBaron(34);
  });
  await page.waitForFunction(() => window.__dustAndDeadTest.getAudioDiagnostics().bossMusic.arrangementPhase === 2);
  const finale = await page.evaluate(() => window.__dustAndDeadTest.getAudioDiagnostics());

  expect(opening.bossMusic).toMatchObject({
    id: "oil-baron",
    title: "Black Gold Covenant",
    lifecycle: "active",
    active: true,
    boundToActiveBoss: true,
    normalSuppressed: true,
    tempo: 117,
    arrangementPhase: 0,
    arrangement: "black-gold-ledger-march",
    motif: "black-gold-brand",
    compositionVersion: "black-gold-covenant-v1",
    mixProfile: "industrial-frontier-v1",
    meter: "4/4 swing",
    stepsPerBar: 8,
    phraseBars: 48,
    persistentNodeCount: 11,
  });
  expect(opening.bossMusic.pumpHitCount).toBeGreaterThan(0);
  expect(opening.bossMusic.chainHitCount).toBeGreaterThan(0);
  expect(opening.bossMusic.oilBassHitCount).toBeGreaterThan(0);
  expect(opening.bossMusic.oilLeadHitCount).toBeGreaterThan(0);
  expect(opening.bossMusic.oilChordHitCount).toBeGreaterThan(0);
  expect(opening.bossMusic.peakStepEventCount).toBeLessThanOrEqual(8);
  expect(offer.bossMusic).toMatchObject({ action: "offer", arrangement: "gilded-bargain-break", tempo: 117 });
  expect(offer.bossMusic.coinHitCount).toBeGreaterThan(0);
  expect(burning.bossMusic).toMatchObject({ action: "combat", arrangementPhase: 1, tempo: 123, arrangement: "burning-contract" });
  expect(starfall.bossMusic).toMatchObject({ action: "starfall", arrangement: "oil-star-stampede", tempo: 123 });
  expect(finale.bossMusic).toMatchObject({ action: "combat", arrangementPhase: 2, tempo: 130, arrangement: "black-gold-reckoning" });
  expect(finale.bossMusic.startCount).toBe(opening.bossMusic.startCount);
  expect(finale.bossMusic.transitionCount).toBeGreaterThanOrEqual(6);
  expect(finale.bossMusic.peakStepEventCount).toBeLessThanOrEqual(10);
  expect(finale.transientAudioNodeCount).toBeLessThan(360);
  expect(finale.pendingAudioDisconnectGroups).toBeLessThan(80);

  const beforeStall = await page.evaluate(() => window.__dustAndDeadTest.getAudioDiagnostics());
  await page.evaluate(() => {
    const deadline = performance.now() + 1300;
    while (performance.now() < deadline) {
      // Model a suspended/backgrounded tab without adding a test-only scheduler path.
    }
  });
  await page.waitForFunction((previousSkippedSteps) => {
    const music = window.__dustAndDeadTest.getAudioDiagnostics().bossMusic;
    return music.skippedStepCount > previousSkippedSteps;
  }, beforeStall.bossMusic.skippedStepCount, { timeout: 5000 });
  await page.waitForTimeout(650);
  const recovered = await page.evaluate(() => window.__dustAndDeadTest.getAudioDiagnostics());
  expect(recovered.bossMusic.skippedStepCount).toBeGreaterThan(beforeStall.bossMusic.skippedStepCount);
  expect(recovered.bossMusic.skippedStepCount - beforeStall.bossMusic.skippedStepCount).toBeLessThan(16);
  expect(recovered.bossMusic.scheduledStepCount).toBeGreaterThan(beforeStall.bossMusic.scheduledStepCount);
  expect(recovered.bossMusic.peakStepEventCount).toBeLessThanOrEqual(10);
  expect(recovered.transientAudioNodeCount).toBeLessThan(360);
  expect(recovered.pendingAudioDisconnectGroups).toBeLessThan(80);

  await page.evaluate(() => window.__dustAndDeadTest.damageOilBaron(9999, true));
  await page.waitForFunction(() => {
    const music = window.__dustAndDeadTest.getAudioDiagnostics().bossMusic;
    return music.lifecycle === "aftermath" && music.deathStingCount === 1;
  });
  const death = await page.evaluate(() => window.__dustAndDeadTest.getAudioDiagnostics());
  expect(death.bossMusic).toMatchObject({ id: "oil-baron", active: false, fading: true, deathFadeSeconds: 4, deathStingCount: 1 });
  expect(death.bossMusic.fadeSecondsRemaining).toBeGreaterThan(3);

  await page.waitForFunction(() => {
    const audio = window.__dustAndDeadTest.getAudioDiagnostics();
    return !audio.bossMusic.fading &&
      audio.transientAudioNodeCount === 0 &&
      audio.pendingAudioDisconnectGroups === 0;
  }, null, { timeout: 10000 });
  const drained = await page.evaluate(() => window.__dustAndDeadTest.getAudioDiagnostics());
  expect(drained.bossMusic).toMatchObject({ lifecycle: "aftermath", active: false, fading: false, persistentNodeCount: 0 });
  expect(drained.transientAudioNodeCount).toBe(0);
  expect(drained.pendingAudioDisconnectGroups).toBe(0);

  await page.evaluate(() => window.__dustAndDeadTest.startWaveNow(11));
  await page.waitForFunction(() => !window.__dustAndDeadTest.getAudioDiagnostics().bossMusic.normalSuppressed);
  const resumed = await page.evaluate(() => window.__dustAndDeadTest.getAudioDiagnostics());
  expect(resumed.bossMusic).toMatchObject({ lifecycle: "normal", active: false, normalSuppressed: false, persistentNodeCount: 0 });
});

test("Black Gold Covenant is synthesized locally and adds no multiplayer payload", async ({ page, context }) => {
  const guest = await context.newPage();
  try {
    await startHunt(page, { audio: true });
    await startHunt(guest, { audio: true });
    const host = await page.evaluate(() => {
      const game = window.__dustAndDeadTest;
      const multi = window.__dustMultiplayerTest;
      multi.startMockHost(["Host", "Guest"]);
      game.startWaveNow(10, "oilBaron");
      game.clearEnemies();
      game.setOilBaronAiEnabled(false);
      game.forceOilBaronAction("bribe");
      const snapshot = multi.buildWireSnapshot(true, true, "mock-player-2");
      const wireText = JSON.stringify(snapshot).toLowerCase();
      const forbiddenMusicFields = [
        "bossmusic",
        "black gold covenant",
        "black-gold-covenant-v1",
        "compositionversion",
        "scheduledstepcount",
        "pumphitcount",
        "oilleadhitcount",
      ];
      const combat = multi.getNetworkCombatDiagnostics();
      return {
        snapshot,
        decodedBoss: multi.decodeBossState(snapshot.bossState),
        hasMusicPayload: forbiddenMusicFields.some((field) => wireText.includes(field)),
        musicCombatEvents: combat.queuedEvents.filter((event) => /music/i.test(String(event.type || ""))),
        packed: game.getOilBaronPackedWireDiagnostics(),
        budget: multi.getNetworkBudgetDiagnostics(),
      };
    });

    const replicaState = await guest.evaluate((snapshot) => {
      const multi = window.__dustMultiplayerTest;
      multi.startMockGuest(["Host", "Guest"], 1);
      multi.applySnapshot(snapshot);
      return {
        baron: window.__dustAndDeadTest.getOilBaronDiagnostics(),
        audio: window.__dustAndDeadTest.getAudioDiagnostics().bossMusic,
      };
    }, host.snapshot);
    await guest.waitForFunction(() => {
      const music = window.__dustAndDeadTest.getAudioDiagnostics().bossMusic;
      return music.id === "oil-baron" && music.active && music.scheduledStepCount > 0;
    });
    const guestAudio = await guest.evaluate(() => window.__dustAndDeadTest.getAudioDiagnostics());

    expect(host.hasMusicPayload).toBe(false);
    expect(host.musicCombatEvents).toEqual([]);
    expect(host.decodedBoss).toMatchObject({ kind: "oilBaron", phase: 0, action: "offer", bribeState: "offered" });
    expect(host.packed.regularBytes).toBeLessThan(96);
    expect(host.packed.keyframeBytes).toBeLessThan(96);
    expect(host.budget).toMatchObject({ snapshotHz: 15 });
    expect(replicaState.baron).toMatchObject({ replica: true, phase: 0 });
    // Music is composed locally from the replicated encounter. Depending on
    // the audio scheduler boundary, the bed can still report its previous
    // combat arrangement until the next bar; neither state adds wire payload.
    expect(replicaState.audio.id).toBe("oil-baron");
    expect(["combat", "offer"]).toContain(replicaState.audio.action);
    expect(guestAudio.bossMusic).toMatchObject({
      id: "oil-baron",
      title: "Black Gold Covenant",
      active: true,
      boundToActiveBoss: true,
      compositionVersion: "black-gold-covenant-v1",
    });
  } finally {
    await guest.close();
  }
});

test("a rapid Oil Baron restart retires the fading bed before starting a new one", async ({ page }) => {
  await startHunt(page, { audio: true });
  await startBaron(page);
  await page.waitForFunction(() => {
    const music = window.__dustAndDeadTest.getAudioDiagnostics().bossMusic;
    return music.id === "oil-baron" && music.active && music.scheduledStepCount >= 4;
  });
  const before = await page.evaluate(() => window.__dustAndDeadTest.getAudioDiagnostics());

  await page.evaluate(() => window.__dustAndDeadTest.damageOilBaron(9999, true));
  await page.waitForFunction(() => {
    const audio = window.__dustAndDeadTest.getAudioDiagnostics();
    return audio.bossMusic.lifecycle === "aftermath" && audio.retiringBossMusicGroups > 0;
  });
  const fading = await page.evaluate(() => window.__dustAndDeadTest.getAudioDiagnostics());
  expect(fading.retiringBossMusicGroups).toBe(1);

  await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    game.startWaveNow(10, "oilBaron");
    game.clearEnemies();
    game.setOilBaronAiEnabled(false);
  });
  await page.waitForFunction((previousStarts) => {
    const music = window.__dustAndDeadTest.getAudioDiagnostics().bossMusic;
    return music.id === "oil-baron" && music.active && music.startCount > previousStarts;
  }, before.bossMusic.startCount);
  const restarted = await page.evaluate(() => window.__dustAndDeadTest.getAudioDiagnostics());

  expect(restarted.bossMusic).toMatchObject({
    id: "oil-baron",
    active: true,
    fading: false,
    persistentNodeCount: 11,
  });
  expect(restarted.retiringBossMusicGroups).toBe(0);
  expect(restarted.transientAudioNodeCount).toBeLessThan(360);
  expect(restarted.pendingAudioDisconnectGroups).toBeLessThan(80);
});

test("automatic derricks prioritize the nearest valid ground around players", async ({ page }) => {
  await startHunt(page);
  await startBaron(page);
  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    for (let index = 0; index < 8; index += 1) {
      game.spawnOilDerrick(undefined, undefined, { instant: true, silent: true });
    }
    const diagnostics = game.getOilBaronDiagnostics();
    let minimumSpacing = Infinity;
    for (let left = 0; left < diagnostics.derricks.length; left += 1) {
      for (let right = left + 1; right < diagnostics.derricks.length; right += 1) {
        minimumSpacing = Math.min(
          minimumSpacing,
          Math.hypot(
            diagnostics.derricks[left].x - diagnostics.derricks[right].x,
            diagnostics.derricks[left].z - diagnostics.derricks[right].z,
          ),
        );
      }
    }
    return { diagnostics, minimumSpacing };
  });

  expect(result.diagnostics.derrickCount).toBe(8);
  expect(result.diagnostics.combatConfig).toMatchObject({
    derrickBaseHp: 58.5,
    derrickFirstDelay: 3,
    derrickIntervals: [7, 5.8, 4.6],
    derrickMinSpacing: 18,
    derrickPlacementPriority: "nearest-player",
    derrickNearPlayerRadius: 11,
    derrickPlayerSearchRadius: 64,
    igniteFirstDelay: 14,
    igniteIntervals: [17, 15, 13],
    caneRange: 32,
    caneHalfWidth: 1.9,
    caneWindup: 1.05,
  });
  expect(result.minimumSpacing).toBeGreaterThanOrEqual(17.98);
  expect(result.diagnostics.derricks.every((derrick) => derrick.groundClear)).toBe(true);
  expect(result.diagnostics.derricks[0].placementMode).toBe("near-player");
  expect(result.diagnostics.derricks[0].playerDistanceAtPlant).toBeLessThan(3.4);
  expect(result.diagnostics.render.roadSurfaceMaxTopY).toBeGreaterThan(0);
  expect(result.diagnostics.derricks.every((derrick) => (
    derrick.oilGroundY >= result.diagnostics.render.roadSurfaceMaxTopY + 0.011
  ))).toBe(true);
  expect(result.diagnostics.derricks.some((derrick) => (
    derrick.placementMode === "near-player" &&
    derrick.playerDistanceAtPlant <= result.diagnostics.combatConfig.derrickNearPlayerRadius + 0.05
  ))).toBe(true);
});

test("multiplayer derrick priority considers every hostile player", async ({ page }) => {
  await startHunt(page);
  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const multi = window.__dustMultiplayerTest;
    multi.startMockHost(["Host", "Guest"]);
    game.startWaveNow(10, "oilBaron");
    game.clearEnemies();
    game.setOilBaronAiEnabled(false);
    const boss = game.getOilBaronDiagnostics().boss;
    const players = [
      { id: "mock-player-1", x: boss.x - 13, z: boss.z },
      { id: "mock-player-2", x: boss.x + 13, z: boss.z },
    ];
    players.forEach((player) => multi.setPlayerPosition(player.id, player.x, player.z));
    game.spawnOilDerrick(undefined, undefined, { instant: true, silent: true });
    game.spawnOilDerrick(undefined, undefined, { instant: true, silent: true });
    return { players, derricks: game.getOilBaronDiagnostics().derricks };
  });

  expect(result.derricks).toHaveLength(2);
  expect(result.derricks.every((derrick) => derrick.playerDistanceAtPlant < 3.4)).toBe(true);
  for (const player of result.players) {
    expect(Math.min(...result.derricks.map((derrick) => (
      Math.hypot(derrick.x - player.x, derrick.z - player.z)
    )))).toBeLessThan(3.4);
  }
  expect(Math.hypot(
    result.derricks[0].x - result.derricks[1].x,
    result.derricks[0].z - result.derricks[1].z,
  )).toBeGreaterThanOrEqual(17.98);
});

test("a bigger party gets more derricks, not tougher ones", async ({ page }) => {
  await startHunt(page);
  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const multi = window.__dustMultiplayerTest;

    const measure = () => {
      game.startWaveNow(10, "oilBaron");
      game.clearEnemies();
      game.setOilBaronAiEnabled(false);
      game.spawnOilDerrick(undefined, undefined, { instant: true, silent: true });
      const diagnostics = game.getOilBaronDiagnostics();
      return {
        maxHp: diagnostics.derricks[diagnostics.derricks.length - 1].maxHp,
        intervalScale: diagnostics.combatConfig.derrickIntervalPlayerScale,
        ratePerExtraPlayer: diagnostics.combatConfig.derrickRatePerExtraPlayer,
        hpPerExtraPlayer: diagnostics.combatConfig.derrickHpPerExtraPlayer,
      };
    };

    const solo = measure();
    multi.startMockHost(["Host", "Guest", "Third", "Fourth"]);
    const fullParty = measure();
    return { solo, fullParty };
  });

  // Health is flat: a four-player derrick dies to the same magazine as a solo one.
  expect(result.solo.maxHp).toBeCloseTo(58.5, 3);
  expect(result.fullParty.maxHp).toBeCloseTo(58.5, 3);
  expect(result.solo.hpPerExtraPlayer).toBe(0);

  // The pressure arrives as cadence instead: +7% spawn rate per extra player,
  // so four players see them 21% faster.
  expect(result.solo.ratePerExtraPlayer).toBeCloseTo(0.07, 5);
  expect(result.solo.intervalScale).toBeCloseTo(1, 3);
  expect(result.fullParty.intervalScale).toBeCloseTo(1 / 1.21, 3);
});

test("the Baron plants substantially faster than he ignites", async ({ page }) => {
  await startHunt(page);
  await startBaron(page);
  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    game.setPlayerMaxHp(5000, 5000);
    game.setOilBaronAiEnabled(true);
    return game.advanceOilBaron(45000);
  });

  expect(result.cadence.derrickPlants).toBeGreaterThanOrEqual(3);
  expect(result.cadence.igniteAttacks).toBeGreaterThanOrEqual(1);
  expect(result.cadence.derrickPlants).toBeGreaterThan(result.cadence.igniteAttacks);
  result.combatConfig.derrickIntervals.forEach((interval, phase) => {
    expect(interval).toBeLessThan(result.combatConfig.igniteIntervals[phase]);
  });
});

test("oil starfall triggers at half health, protects the Baron, hits marked landings, and repeats", async ({ page }) => {
  await startHunt(page);
  await startBaron(page);
  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    game.setPlayerMaxHp(500, 500);
    const audioBefore = game.getAudioDiagnostics();
    game.forceOilBaronAction("bribe");
    game.acceptOilBaronBribe();
    const maxHp = game.getOilBaronDiagnostics().boss.maxHp;
    const thresholdDamage = game.damageOilBaron(maxHp * 0.5, false);
    const started = game.getOilBaronDiagnostics();
    const firstLanding = started.starAttack.landingPoints[0];
    game.setPlayerPosition(firstLanding.x, firstLanding.z);
    game.setPlayerHp(500);
    const guardedDamage = game.damageOilBaron(80, false);
    game.advanceOilBaron(2600);
    const afterImpact = {
      diagnostics: game.getOilBaronDiagnostics(),
      health: game.getPlayerHealth(),
      audio: game.getAudioDiagnostics(),
    };
    game.advanceOilBaron(1000);
    const afterSecondImpact = game.getOilBaronDiagnostics();
    game.advanceOilBaron(7000);
    const finished = game.getOilBaronDiagnostics();
    game.setOilBaronAiEnabled(true);
    const repeated = game.advanceOilBaron((finished.starAttack.cooldown + 5) * 1000);
    return { audioBefore, maxHp, thresholdDamage, guardedDamage, started, afterImpact, afterSecondImpact, finished, repeated };
  });

  expect(result.thresholdDamage).toBe(result.maxHp * 0.5);
  expect(result.started.boss).toMatchObject({ hp: result.maxHp * 0.5, action: "oilStar", invulnerable: true });
  expect(result.started.starAttack).toMatchObject({ active: true, triggered: true, count: 1 });
  expect(result.started.starAttack.landingPoints).toHaveLength(8);
  {
    let previous = result.started.boss;
    for (const point of result.started.starAttack.landingPoints) {
      expect(Math.hypot(point.x - previous.x, point.z - previous.z)).toBeLessThanOrEqual(15.02);
      previous = point;
    }
  }
  expect(result.started.starAttack.landingPoints.every((point) => point.playerId === "solo")).toBe(true);
  expect(result.started.starAttack.landingPoints.map((point) => point.directTarget)).toEqual([
    false, true, false, true, false, true, false, true,
  ]);
  expect(result.started.starAttack.landingPoints.filter((point) => point.directTarget).every((point) => (
    point.targetDistance <= 1.5
  ))).toBe(true);
  expect(new Set(result.started.starAttack.landingPoints.map((point) => (
    `${point.chaosOffsetX.toFixed(1)}:${point.chaosOffsetZ.toFixed(1)}`
  ))).size).toBeGreaterThan(4);
  expect(result.started.combatConfig).toMatchObject({
    starHpRatio: 0.5,
    starDamage: 46,
    starLandingRadius: 4.3,
    starJumpCount: 8,
    starRepeatIntervals: [26, 20],
  });
  expect(result.started.hud.status).toContain("IMMUNE");
  expect(result.guardedDamage).toBe(0);
  expect(result.afterImpact.health.hp).toBeLessThanOrEqual(454);
  expect(result.afterImpact.diagnostics.starAttack.resolvedImpacts & 1).toBe(1);
  expect(result.afterImpact.diagnostics.starAttack.bounceSoundCount).toBe(1);
  expect(result.afterImpact.audio.oilBaronBounceSfxCount - result.audioBefore.oilBaronBounceSfxCount).toBe(1);
  expect(result.afterImpact.diagnostics.starAttack.coatingVisible).toBe(true);
  expect(result.afterSecondImpact.starAttack.bounceSoundCount).toBeGreaterThanOrEqual(2);
  expect(result.finished.boss).toMatchObject({ action: "idle", invulnerable: false });
  expect(result.finished.starAttack.cooldown).toBeGreaterThan(20);
  expect(result.repeated.starAttack.count).toBe(2);
  expect(result.repeated.boss.action).toBe("oilStar");
});

test("oil starfall advances toward a distant player without crossing the whole arena in one hop", async ({ page }) => {
  await startHunt(page);
  await startBaron(page);
  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const boss = game.getOilBaronDiagnostics().boss;
    game.setPlayerPosition(boss.x >= 0 ? -160 : 160, boss.z >= 0 ? -160 : 160);
    return game.forceOilBaronAction("star");
  });

  expect(result.starAttack.landingPoints).toHaveLength(8);
  let previous = result.boss;
  for (const point of result.starAttack.landingPoints) {
    expect(Math.hypot(point.x - previous.x, point.z - previous.z)).toBeLessThanOrEqual(15.02);
    previous = point;
  }
  expect(Math.hypot(
    result.starAttack.landingPoints[0].x - result.boss.x,
    result.starAttack.landingPoints[0].z - result.boss.z,
  )).toBeGreaterThan(8);
});

test("oil starfall warns through its landing mark without a pre-attack text overlay", async ({ page }) => {
  await startHunt(page);
  await startBaron(page);
  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const started = game.forceOilBaronAction("star");
    const flight = game.advanceOilBaron(2000);
    return { started, flight };
  });

  expect(result.started.starAttack).toMatchObject({ active: true, telegraphVisible: false });
  expect(result.started.hud.overlayHidden).toBe(true);
  expect(result.started.hud.overlayTitle).not.toBe("THE BARON BATHES IN BLACK GOLD");
  expect(result.started.hud.overlaySubtitle).not.toBe("IMMUNE · DODGE THE FALLING BARON");
  expect(result.flight.starAttack).toMatchObject({ active: true, telegraphVisible: true });
  expect(result.flight.hud.status).toContain("MOVE FROM THE MARK");
  expect(result.flight.hud.overlayHidden).toBe(true);
});

test("oil-star impact sound is delivered to guests once through the ordered combat stream", async ({ page, context }) => {
  const guest = await context.newPage();
  try {
    await startHunt(page);
    await startHunt(guest);
    const host = await page.evaluate(() => {
      const game = window.__dustAndDeadTest;
      const multi = window.__dustMultiplayerTest;
      multi.startMockHost(["Host", "Guest"]);
      game.startWaveNow(10, "oilBaron");
      game.clearEnemies();
      game.setOilBaronAiEnabled(false);
      game.forceOilBaronAction("star");
      game.advanceOilBaron(2600);
      return multi.buildWireSnapshot(true, true, "mock-player-2");
    });
    const result = await guest.evaluate((snapshot) => {
      const game = window.__dustAndDeadTest;
      const multi = window.__dustMultiplayerTest;
      multi.startMockGuest(["Host", "Guest"], 1);
      const before = game.getAudioDiagnostics().oilBaronBounceSfxCount;
      multi.applySnapshot(snapshot);
      const first = multi.getNetworkCombatDiagnostics();
      const afterFirst = game.getAudioDiagnostics().oilBaronBounceSfxCount;
      multi.applySnapshot(snapshot);
      return {
        before,
        afterFirst,
        afterReplay: game.getAudioDiagnostics().oilBaronBounceSfxCount,
        events: first.guestEvents,
      };
    }, host);

    const impacts = result.events.filter((event) => event.type === "oilBaronStarImpact");
    expect(impacts).toHaveLength(1);
    expect(impacts[0]).toMatchObject({ sound: "oilBaronBounce", visuals: 3 });
    expect(result.afterFirst - result.before).toBe(1);
    expect(result.afterReplay).toBe(result.afterFirst);
  } finally {
    await guest.close();
  }
});

test("multiplayer starfall distributes every chaotic landing between nearby enemies", async ({ page }) => {
  await startHunt(page);
  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const multi = window.__dustMultiplayerTest;
    multi.startMockHost(["Host", "Guest", "Rival"]);
    game.startWaveNow(10, "oilBaron");
    game.clearEnemies();
    game.setOilBaronAiEnabled(false);
    const boss = game.getOilBaronDiagnostics().boss;
    multi.setPlayerPosition("mock-player-1", boss.x - 18, boss.z);
    multi.setPlayerPosition("mock-player-2", boss.x + 18, boss.z);
    multi.setPlayerPosition("mock-player-3", boss.x, boss.z + 22);
    const validIds = multi.getState().players.map((player) => player.id);
    const started = game.forceOilBaronAction("star");
    return { validIds, points: started.starAttack.landingPoints };
  });

  expect(result.points).toHaveLength(8);
  expect(result.points.every((point) => result.validIds.includes(point.playerId))).toBe(true);
  expect(result.points.every((point) => !point.directTarget && point.targetDistance <= 5.2)).toBe(true);
  expect(new Set(result.points.map((point) => point.playerId)).size).toBeGreaterThanOrEqual(3);
});

test("oil starfall action, landing target, and airborne pose stay synchronized on guests", async ({ page, context }) => {
  const guest = await context.newPage();
  try {
    await startHunt(page);
    await startHunt(guest);
    const host = await page.evaluate(() => {
      const game = window.__dustAndDeadTest;
      const multi = window.__dustMultiplayerTest;
      multi.startMockHost(["Host", "Guest"]);
      game.startWaveNow(10, "oilBaron");
      game.clearEnemies();
      game.setOilBaronAiEnabled(false);
      game.forceOilBaronAction("star");
      game.advanceOilBaron(2300);
      const snapshot = multi.buildWireSnapshot(true, true, "mock-player-2");
      return {
        diagnostics: game.getOilBaronDiagnostics(),
        decoded: multi.decodeBossState(snapshot.bossState),
        snapshot,
      };
    });
    const replica = await guest.evaluate((snapshot) => {
      const multi = window.__dustMultiplayerTest;
      multi.startMockGuest(["Host", "Guest"], 1);
      multi.applySnapshot(snapshot);
      return window.__dustAndDeadTest.getOilBaronDiagnostics();
    }, host.snapshot);

    expect(host.decoded).toMatchObject({ kind: "oilBaron", action: "oilStar" });
    expect(host.decoded.starX).toBeCloseTo(host.diagnostics.starAttack.targetX, 1);
    expect(host.decoded.starZ).toBeCloseTo(host.diagnostics.starAttack.targetZ, 1);
    expect(host.diagnostics.boss.starVisualY).toBeGreaterThan(1);
    expect(replica).toMatchObject({ replica: true });
    expect(replica.boss).toMatchObject({ action: "oilStar", invulnerable: true });
    expect(replica.starAttack).toMatchObject({ active: true, telegraphVisible: true, coatingVisible: true });
    expect(replica.starAttack.targetX).toBeCloseTo(host.diagnostics.starAttack.targetX, 1);
    expect(replica.starAttack.targetZ).toBeCloseTo(host.diagnostics.starAttack.targetZ, 1);
    expect(replica.boss.starVisualY).toBeCloseTo(host.diagnostics.boss.starVisualY, 1);
  } finally {
    await guest.close();
  }
});

test("Oil Baron is the third wave-10 choice and derricks are unlimited destroyable mobs", async ({ page }) => {
  await startHunt(page);
  const result = await startBaron(page);
  const spawned = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const origin = game.getOilBaronDiagnostics().boss;
    for (let i = 0; i < 24; i += 1) {
      game.spawnOilDerrick(origin.x + (i % 8) * 0.2, origin.z + Math.floor(i / 8) * 0.2, { instant: true, silent: true });
    }
    const before = game.getOilBaronDiagnostics();
    const partial = game.damageOilDerrick(0, 7);
    const afterPartial = game.getOilBaronDiagnostics();
    const destroyed = game.damageOilDerrick(0, 999);
    return { before, partial, afterPartial, destroyed, after: game.getOilBaronDiagnostics() };
  });

  expect(result.wave).toMatchObject({ wave: 10, wave10BossKind: "oilBaron" });
  expect(result.baron.boss).toMatchObject({ hp: 2160, maxHp: 2160 });
  expect(spawned.before.derrickCount).toBe(24);
  expect(spawned.before.activeDerricks).toBe(24);
  expect(spawned.before.derricks[0].maxHp).toBe(58.5);
  expect(spawned.partial).toBe(7);
  expect(spawned.afterPartial.derricks[0].hp).toBe(51.5);
  expect(spawned.destroyed).toBe(51.5);
  expect(spawned.after.derricks[0]).toMatchObject({ destroyed: true, active: false, hp: 0 });
});

test("rapid and aggregated derrick damage keeps impact FX bounded", async ({ page }) => {
  await startHunt(page);
  await startBaron(page);
  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const boss = game.getOilBaronDiagnostics().boss;
    game.spawnOilDerrick(boss.x + 6, boss.z, {
      instant: true,
      silent: true,
      maxHp: 5000,
      oilRadius: 11.8,
      oilAge: 9,
      burnTime: 4.8,
    });
    const before = game.getParticleOptimizationStats().activeParticles;
    const suppressedDamage = game.damageOilDerrick(0, 1, true, "", { suppressVisuals: true });
    const afterSuppressed = game.getParticleOptimizationStats().activeParticles;
    let rapidDamage = 0;
    for (let hit = 0; hit < 32; hit += 1) rapidDamage += game.damageOilDerrick(0, 1);
    const afterRapid = game.getParticleOptimizationStats().activeParticles;
    const hitDerrick = game.getOilBaronDiagnostics().derricks[0];
    const suppressedDestroyDamage = game.damageOilDerrick(0, 5000, true, "", { suppressVisuals: true });
    return {
      before,
      afterSuppressed,
      afterRapid,
      suppressedDamage,
      rapidDamage,
      hitDerrick,
      suppressedDestroyDamage,
      afterSuppressedDestroy: game.getParticleOptimizationStats().activeParticles,
      destroyedDerrick: game.getOilBaronDiagnostics().derricks[0],
    };
  });

  expect(result.suppressedDamage).toBe(1);
  expect(result.afterSuppressed).toBe(result.before);
  expect(result.rapidDamage).toBe(32);
  expect(result.afterRapid - result.before).toBe(14);
  expect(result.hitDerrick).toMatchObject({ hp: 4967, hitFxBursts: 1 });
  expect(result.hitDerrick.hitFxCooldown).toBeGreaterThan(0);
  expect(result.suppressedDestroyDamage).toBe(4967);
  expect(result.afterSuppressedDestroy).toBe(result.afterRapid);
  expect(result.destroyedDerrick).toMatchObject({ hp: 0, destroyed: true, active: false });
});

test("destroying a derrick makes its unsupported puddle visibly drain away", async ({ page }) => {
  await startHunt(page);
  await startBaron(page);
  const drainage = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const boss = game.getOilBaronDiagnostics().boss;
    game.spawnOilDerrick(boss.x + 7, boss.z, {
      instant: true,
      silent: true,
      oilRadius: 5,
      oilAge: 8,
    });
    const before = game.getOilBaronDiagnostics().derricks[0];
    game.damageOilDerrick(0, 999);
    const destroyed = game.getOilBaronDiagnostics().derricks[0];
    const middle = game.advanceOilBaron(6500).derricks.find((entry) => entry.id === destroyed.id);
    const end = game.advanceOilBaron(9000);
    return {
      before,
      destroyed,
      middle,
      remains: end.derricks.some((entry) => entry.id === destroyed.id),
      drainingPuddles: end.drainingPuddles,
    };
  });

  expect(drainage.before.oilRadius).toBeCloseTo(5, 1);
  expect(drainage.destroyed.destroyed).toBe(true);
  expect(drainage.destroyed.oilDrainRate).toBeGreaterThan(0);
  expect(drainage.middle.oilRadius).toBeGreaterThan(0.12);
  expect(drainage.middle.oilRadius).toBeLessThan(drainage.destroyed.oilRadius);
  expect(drainage.remains).toBe(false);
  expect(drainage.drainingPuddles).toBe(0);
});

test("oil slows, burning oil hurts, and the solo deal locks every gun for 45 seconds", async ({ page }) => {
  await startHunt(page);
  await startBaron(page);
  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const boss = game.getOilBaronDiagnostics().boss;
    const x = boss.x + 8;
    const z = boss.z;
    game.spawnOilDerrick(x, z, { instant: true, silent: true, oilRadius: 4, oilAge: 6 });
    game.setPlayerPosition(x, z);
    game.setPlayerHp(100);
    const cold = game.getOilBaronDiagnostics();
    game.igniteOilDerrick(0, true);
    const hpBeforeFire = game.getPlayerHealth().hp;
    game.advanceOilBaron(100);
    const hpAfterFire = game.getPlayerHealth().hp;
    const offer = game.forceOilBaronAction("bribe");
    const immuneDamage = game.damageOilBaron(20, false);
    const accepted = game.acceptOilBaronBribe();
    const firedWhileLocked = game.shootOnce();
    const unlocked = game.advanceOilBaron(46000);
    const firedAfterLock = game.shootOnce();
    return { cold, hpBeforeFire, hpAfterFire, offer, immuneDamage, accepted, firedWhileLocked, unlocked, firedAfterLock };
  });

  expect(result.cold.player.oilSpeedMultiplier).toBe(0.72);
  expect(result.hpBeforeFire - result.hpAfterFire).toBeGreaterThanOrEqual(8);
  expect(result.offer.bribe).toMatchObject({
    state: "offered",
    timeLeft: 25,
    chestVisible: true,
    goldLayout: "treasure-pile",
    goldCoinCount: 48,
    goldStackCount: 0,
    goldIngotCount: 5,
    goldNuggetCount: 14,
  });
  expect(result.offer.bribe.lidOpenAngle).toBeGreaterThan(1);
  expect(result.offer.hud.overlayTitle).toBe("THE BARON OFFERS YOU A DEAL");
  expect(result.immuneDamage).toBe(0);
  expect(result.accepted.player.score - result.cold.player.score).toBe(5000);
  expect(result.accepted.player.disarmTime).toBe(45);
  expect(result.firedWhileLocked).toBe(false);
  expect(result.unlocked.player.disarmTime).toBe(0);
  expect(result.firedAfterLock).toBe(true);
});

test("the solo deal never changes allegiance, so the Baron keeps attacking during the 45 second lock", async ({ page }) => {
  await startHunt(page);
  await startBaron(page);
  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const boss = game.getOilBaronDiagnostics().boss;
    game.setPlayerMaxHp(300, 300);
    game.setPlayerPosition(boss.x, boss.z + 11);
    const accepted = game.acceptOilBaronBribe();
    const fired = game.shootOnce();
    const aimed = game.forceOilBaronAction("cane");
    const resolved = game.advanceOilBaron(1200);
    return { accepted, fired, aimed, resolved };
  });

  expect(result.accepted.player).toMatchObject({ oilBaronAlly: false, disarmTime: 45, hp: 300 });
  expect(result.fired).toBe(false);
  expect(result.aimed.monocleSentence.targetPlayerId).toBe("solo");
  expect(result.resolved.player.oilBaronAlly).toBe(false);
  expect(result.resolved.player.disarmTime).toBeGreaterThan(43);
  expect(result.resolved.player.hp).toBeLessThan(300);
});

test("burning oil lasts for the puddle lifetime and chains through touching oil in phases two and three", async ({ page }) => {
  await startHunt(page);
  await startBaron(page);
  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const boss = game.getOilBaronDiagnostics().boss;
    const startX = boss.x + 24;
    const startZ = boss.z + 18;
    for (let index = 0; index < 3; index += 1) {
      game.spawnOilDerrick(startX + index * 5, startZ, {
        instant: true,
        silent: true,
        oilRadius: 2.6,
        oilAge: 0,
      });
    }
    game.igniteOilDerrick(0, true);
    const phaseOne = game.advanceOilBaron(450);
    game.damageOilBaron(game.getOilBaronDiagnostics().boss.maxHp * 0.4, true);
    const spread = game.advanceOilBaron(350);
    const persistent = game.advanceOilBaron(8000);
    const firstId = persistent.derricks[0].id;
    game.damageOilDerrick(firstId, 999);
    const drained = game.advanceOilBaron(10000);
    return { phaseOne, spread, persistent, firstId, drained };
  });

  expect(result.phaseOne).toMatchObject({ phase: 0, burningPuddles: 1, fireSpreadCount: 0 });
  expect(result.spread.phase).toBe(1);
  expect(result.spread.burningPuddles).toBe(3);
  expect(result.spread.fireSpreadCount).toBe(2);
  expect(result.persistent.burningPuddles).toBe(3);
  expect(result.persistent.derricks.every((derrick) => derrick.burnTime > 0)).toBe(true);
  expect(result.drained.derricks.some((derrick) => derrick.id === result.firstId)).toBe(false);
  expect(result.drained.burningPuddles).toBe(2);
});

test("the cane fires a visible round from its gold top and stays aligned with the damage lane", async ({ page }) => {
  await startHunt(page);
  await startBaron(page);
  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const boss = game.getOilBaronDiagnostics().boss;
    game.setPlayerMaxHp(200, 200);
    game.setPlayerPosition(boss.x, boss.z + 20);
    game.setPlayerHp(200);
    game.forceOilBaronAction("cane");
    const aimed = game.advanceOilBaron(950);
    const fired = game.advanceOilBaron(150);
    return { aimed, fired, health: game.getPlayerHealth() };
  });

  expect(result.aimed.boss.action).toBe("caneWindup");
  expect(result.aimed.caneAttack.alignment).toBeGreaterThan(0.94);
  expect(result.aimed.caneAttack.muzzleY).toBeGreaterThan(1.2);
  expect(result.fired.animation).toMatchObject({ action: "recover", recoverFrom: "caneWindup" });
  expect(result.fired.caneAttack.projectileCount).toBeGreaterThanOrEqual(2);
  expect(result.fired.caneAttack.projectiles[0]).toMatchObject({
    dirX: result.fired.caneAttack.directionX,
    dirZ: result.fired.caneAttack.directionZ,
    impact: "oilBaronCane",
  });
  expect(result.health.hp).toBeLessThanOrEqual(162);
});

test("a nearby player triggers the Baron's telegraphed ground slam, takes damage, and is knocked clear", async ({ page }) => {
  await startHunt(page);
  await startBaron(page);
  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const boss = game.getOilBaronDiagnostics().boss;
    game.setPlayerMaxHp(500, 500);
    const placed = game.setPlayerPosition(boss.x + 4, boss.z);
    game.setPlayerHp(500);
    game.setOilBaronAiEnabled(true);
    const warning = game.advanceOilBaron(120);
    const beforeDistance = Math.hypot(placed.x - boss.x, placed.z - boss.z);
    const impact = game.advanceOilBaron(720);
    const afterDistance = Math.hypot(impact.player.x - impact.boss.x, impact.player.z - impact.boss.z);
    return { warning, impact, beforeDistance, afterDistance };
  });

  expect(result.warning.boss.action).toBe("groundSlam");
  expect(result.warning.groundSlam).toMatchObject({ active: true, resolved: false, telegraphVisible: true });
  expect(result.warning.hud.status).toContain("GROUND CRASH");
  expect(result.impact.groundSlam).toMatchObject({ active: true, resolved: true, telegraphVisible: false });
  expect(result.impact.player.hp).toBeLessThanOrEqual(466);
  expect(result.afterDistance).toBeGreaterThan(result.beforeDistance + 3);
  expect(result.impact.combatConfig).toMatchObject({
    groundSlamTriggerRange: 7.2,
    groundSlamRadius: 6.6,
    groundSlamDamage: 34,
    groundSlamKnockback: 8.4,
  });
});

test("ground slam and cane projectile transitions replicate as distinct Oil Baron actions", async ({ page, context }) => {
  const guest = await context.newPage();
  try {
    await startHunt(page);
    await startHunt(guest);
    const hostSlam = await page.evaluate(() => {
      const game = window.__dustAndDeadTest;
      const multi = window.__dustMultiplayerTest;
      multi.startMockHost(["Host", "Guest"]);
      game.startWaveNow(10, "oilBaron");
      game.clearEnemies();
      game.setOilBaronAiEnabled(false);
      game.forceOilBaronAction("slam");
      game.advanceOilBaron(480);
      const snapshot = multi.buildWireSnapshot(true, true, "mock-player-2");
      return {
        snapshot,
        decoded: multi.decodeBossState(snapshot.bossState),
        diagnostics: game.getOilBaronDiagnostics(),
      };
    });
    const guestSlam = await guest.evaluate((snapshot) => {
      const multi = window.__dustMultiplayerTest;
      multi.startMockGuest(["Host", "Guest"], 1);
      multi.applySnapshot(snapshot);
      return window.__dustAndDeadTest.getOilBaronDiagnostics();
    }, hostSlam.snapshot);

    expect(hostSlam.decoded.action).toBe("groundSlam");
    expect(hostSlam.diagnostics.groundSlam.telegraphVisible).toBe(true);
    expect(guestSlam).toMatchObject({ replica: true, groundSlam: { active: true, telegraphVisible: true } });

    const hostCane = await page.evaluate(() => {
      const game = window.__dustAndDeadTest;
      const multi = window.__dustMultiplayerTest;
      game.advanceOilBaron(1600);
      game.forceOilBaronAction("cane");
      game.advanceOilBaron(1100);
      const snapshot = multi.buildWireSnapshot(true, true, "mock-player-2");
      return {
        snapshot,
        decoded: multi.decodeBossState(snapshot.bossState),
        diagnostics: game.getOilBaronDiagnostics(),
      };
    });
    const guestCane = await guest.evaluate((snapshot) => {
      window.__dustMultiplayerTest.applySnapshot(snapshot);
      return window.__dustAndDeadTest.getOilBaronDiagnostics();
    }, hostCane.snapshot);

    expect(hostCane.decoded).toMatchObject({ action: "recover" });
    expect(hostCane.diagnostics.animation.recoverFrom).toBe("caneWindup");
    expect(hostCane.diagnostics.caneAttack.projectileCount).toBeGreaterThanOrEqual(2);
    expect(guestCane.animation.recoverFrom).toBe("caneWindup");
    expect(guestCane.caneAttack.projectileCount).toBeGreaterThanOrEqual(2);
  } finally {
    await guest.close();
  }
});

test("a multiplayer buyer becomes hostile, shares the Baron's fate, and receives no victory reward", async ({ page }) => {
  await startHunt(page);
  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const multi = window.__dustMultiplayerTest;
    multi.startMockHost(["Host", "Bought", "Rival"]);
    game.startWaveNow(10, "oilBaron");
    game.clearEnemies();
    game.setOilBaronAiEnabled(false);
    const accepted = game.acceptOilBaronBribe("mock-player-2");
    const markedState = multi.getState();
    const markedUi = multi.refreshPlayerUi();
    const buyerDamage = game.damageOilBaron(30, false, "mock-player-2");
    const rivalDamage = game.damageOilBaron(30, false, "mock-player-1");
    game.damageOilBaron(9999, true, "mock-player-1");
    const defeatedState = multi.getState();
    const defeatedUi = multi.refreshPlayerUi();
    return { accepted, markedState, markedUi, buyerDamage, rivalDamage, defeatedState, defeatedUi };
  });

  const boughtBefore = result.markedState.players.find((player) => player.id === "mock-player-2");
  const boughtNameplate = result.markedUi.nameplates.find((entry) => entry.id === "mock-player-2");
  expect(boughtBefore).toMatchObject({ points: 5000, alive: true, oilBaronAlly: true });
  expect(boughtNameplate.name).toContain("BOUGHT");
  expect(boughtNameplate.classes).toContain("is-oil-baron-ally");
  expect(boughtNameplate.ariaLabel).toContain("hostile");
  expect(result.buyerDamage).toBe(0);
  expect(result.rivalDamage).toBe(30);

  const playersAfter = Object.fromEntries(result.defeatedState.players.map((player) => [player.id, player]));
  expect(playersAfter["mock-player-1"].points).toBe(4000);
  expect(playersAfter["mock-player-3"].points).toBe(4000);
  expect(playersAfter["mock-player-2"]).toMatchObject({ points: 5000, alive: false, oilBaronAlly: false });
  const clearedNameplate = result.defeatedUi.nameplates.find((entry) => entry.id === "mock-player-2");
  expect(clearedNameplate.classes).not.toContain("is-oil-baron-ally");
});

test("a bought player's Pale Deputies drop the Oil Baron and cannot damage his faction", async ({ page }) => {
  await startHunt(page);
  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const multi = window.__dustMultiplayerTest;
    multi.startMockHost(["Host", "Bought"]);
    game.startWaveNow(10, "oilBaron");
    game.clearEnemies();
    game.setOilBaronAiEnabled(false);

    const boss = game.getOilBaronDiagnostics().boss;
    multi.setPlayerPosition("mock-player-2", boss.x + 4.5, boss.z);
    multi.spawnPaleDeputy("mock-player-2", boss.x + 3.2, boss.z);
    window.advanceTime(450);

    const beforePact = {
      bossHp: game.getOilBaronDiagnostics().boss.hp,
      deputies: multi.getPaleDeputyOwnership(),
      shots: multi.getCombatDiagnostics("mock-player-2").marshalPaleDeputyShots,
    };
    const launchedSource = multi.capturePaleDeputyDamageSource("mock-player-2");
    const accepted = game.acceptOilBaronBribe("mock-player-2");
    const hpAtPact = game.getOilBaronDiagnostics().boss.hp;

    // This represents damage arriving at the authority boundary from an attack
    // whose source was captured immediately before the pact was accepted.
    const staleAttack = multi.applyOilBaronDamageSource(launchedSource, 75);
    window.advanceTime(900);
    const existingAfterPact = {
      bossHp: game.getOilBaronDiagnostics().boss.hp,
      deputies: multi.getPaleDeputyOwnership(),
      shots: multi.getCombatDiagnostics("mock-player-2").marshalPaleDeputyShots,
    };

    multi.spawnPaleDeputy("mock-player-2", boss.x + 3.8, boss.z + 0.8);
    window.advanceTime(900);
    const spawnedAfterPact = {
      bossHp: game.getOilBaronDiagnostics().boss.hp,
      deputies: multi.getPaleDeputyOwnership(),
      shots: multi.getCombatDiagnostics("mock-player-2").marshalPaleDeputyShots,
    };

    return { accepted, beforePact, hpAtPact, staleAttack, existingAfterPact, spawnedAfterPact };
  });

  expect(result.beforePact.deputies).toHaveLength(1);
  expect(result.beforePact.deputies[0]).toMatchObject({
    ownerPlayerId: "mock-player-2",
    targetType: "oilBaron",
  });
  expect(result.beforePact.shots).toBeGreaterThan(0);
  expect(result.accepted).toBeTruthy();
  expect(result.staleAttack).toMatchObject({
    applied: 0,
    ownerPlayerId: "mock-player-2",
  });
  expect(result.staleAttack.hpAfter).toBe(result.staleAttack.hpBefore);
  expect(result.staleAttack.hpAfter).toBeCloseTo(result.hpAtPact, 1);
  expect(result.existingAfterPact.bossHp).toBe(result.hpAtPact);
  expect(result.existingAfterPact.shots).toBe(result.beforePact.shots);
  expect(result.existingAfterPact.deputies.every((deputy) => deputy.targetType === null)).toBe(true);
  expect(result.spawnedAfterPact.deputies).toHaveLength(2);
  expect(result.spawnedAfterPact.bossHp).toBe(result.hpAtPact);
  expect(result.spawnedAfterPact.shots).toBe(result.beforePact.shots);
  expect(result.spawnedAfterPact.deputies.every((deputy) => deputy.targetType === null)).toBe(true);
});

test("the multiplayer pact blocks stale bullets and persistent fire, clears chains, and makes Baron attacks ignore the buyer", async ({ page }) => {
  await startHunt(page);
  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const multi = window.__dustMultiplayerTest;
    multi.startMockHost(["Host", "Bought", "Rival"]);
    game.startWaveNow(10, "oilBaron");
    game.clearEnemies();
    game.setOilBaronAiEnabled(false);

    const boss = game.getOilBaronDiagnostics().boss;
    multi.setPlayerPosition("mock-player-2", boss.x, boss.z - 16);
    multi.setPlayerPosition("mock-player-3", boss.x + 18, boss.z + 14);

    const beforePact = multi.getState();
    const buyerBeforePact = beforePact.players.find((player) => player.id === "mock-player-2");
    const dx = boss.x - buyerBeforePact.x;
    const dz = boss.z - buyerBeforePact.z;
    const aimAngle = Math.atan2(dx, dz);
    multi.setProgression("mock-player-2", {
      weapon: "revolver",
      ownedWeapons: { revolver: true, rifle: false, launcher: false, coachGun: false },
      ammo: { revolver: 6, rifle: 0, launcher: 0, coachGun: 0 },
      ammoReserve: { revolver: 36, rifle: 0, launcher: 0, coachGun: 0 },
      reloadTimers: { revolver: 0, rifle: 0, launcher: 0, coachGun: 0 },
    });
    multi.setNetworkRtt("mock-player-2", 0);
    const queuedShot = multi.injectFireAction("mock-player-2", 1, aimAngle, 24, {
      weaponId: "revolver",
      targetKind: "boss",
      targetId: "oil-baron",
      targetX: boss.x,
      targetZ: boss.z,
    });
    window.advanceTime(17);
    const staleBullet = multi.getAuthoritativeBullets().find((bullet) => bullet.ownerId === "mock-player-2");
    const chained = game.forceOilBaronDebtChainForPlayer("mock-player-2");

    const accepted = game.acceptOilBaronBribe("mock-player-2");
    const immediatelyAfterPact = game.getOilBaronDiagnostics();
    const hpAtPact = immediatelyAfterPact.boss.hp;
    const buyerAtPact = multi.getState().players.find((player) => player.id === "mock-player-2");

    multi.stepBullets(0.5);
    const afterStaleBullet = game.getOilBaronDiagnostics().boss.hp;

    multi.spawnFirePatch("mock-player-2", {
      x: boss.x,
      z: boss.z,
      radius: 3.5,
      life: 0.3,
      damage: 8,
    });
    window.advanceTime(500);
    const afterBuyerFire = game.getOilBaronDiagnostics().boss.hp;

    multi.spawnFirePatch("mock-player-3", {
      x: boss.x,
      z: boss.z,
      radius: 3.5,
      life: 0.3,
      damage: 8,
    });
    window.advanceTime(500);
    const afterRivalFire = game.getOilBaronDiagnostics().boss.hp;

    multi.setPlayerPosition("mock-player-2", boss.x, boss.z + 4);
    multi.setPlayerPosition("mock-player-3", boss.x, boss.z + 12);
    const beforeCane = multi.getState();
    const buyerBeforeCane = beforeCane.players.find((player) => player.id === "mock-player-2");
    const rivalBeforeCane = beforeCane.players.find((player) => player.id === "mock-player-3");
    const cane = game.forceOilBaronAction("cane");
    game.advanceOilBaron(1200);
    const afterCane = multi.getState();
    const buyerAfterCane = afterCane.players.find((player) => player.id === "mock-player-2");
    const rivalAfterCane = afterCane.players.find((player) => player.id === "mock-player-3");

    return {
      chained,
      queuedShot,
      staleBullet,
      accepted,
      immediatelyAfterPact,
      hpAtPact,
      buyerAtPact,
      afterStaleBullet,
      afterBuyerFire,
      afterRivalFire,
      cane,
      buyerBeforeCane,
      rivalBeforeCane,
      buyerAfterCane,
      rivalAfterCane,
    };
  });

  expect(result.chained.debtChains.count).toBe(1);
  expect(result.queuedShot).toBe(true);
  expect(result.staleBullet).toMatchObject({ ownerId: "mock-player-2", type: "revolver" });
  expect(result.accepted).toBeTruthy();
  expect(result.buyerAtPact.oilBaronAlly).toBe(true);
  expect(result.immediatelyAfterPact.debtChains.count).toBe(0);
  expect(result.immediatelyAfterPact.player.debtChained).toBe(false);
  expect(result.afterStaleBullet).toBe(result.hpAtPact);
  expect(result.afterBuyerFire).toBe(result.hpAtPact);
  expect(result.afterRivalFire).toBeLessThan(result.afterBuyerFire);
  expect(result.cane.monocleSentence.targetPlayerId).toBe("mock-player-3");
  expect(result.buyerAfterCane.hp).toBe(result.buyerBeforeCane.hp);
  expect(result.rivalAfterCane.hp).toBeLessThan(result.rivalBeforeCane.hp);
});

test("a buyer who is already dead loses the pact on host and guest, including after revival", async ({ page, context }) => {
  const guest = await context.newPage();
  try {
    await startHunt(page);
    await startHunt(guest);

    const beforeDefeat = await page.evaluate(() => {
      const game = window.__dustAndDeadTest;
      const multi = window.__dustMultiplayerTest;
      multi.startMockHost(["Host", "Bought", "Rival"]);
      game.startWaveNow(10, "oilBaron");
      game.clearEnemies();
      game.setOilBaronAiEnabled(false);
      game.acceptOilBaronBribe("mock-player-2");
      multi.damagePlayer("mock-player-2", 9999, "");
      return {
        state: multi.getState(),
        ui: multi.refreshPlayerUi(),
        snapshot: multi.buildWireSnapshot(true, true, "mock-player-1"),
      };
    });

    const hostBuyerBefore = beforeDefeat.state.players.find((player) => player.id === "mock-player-2");
    expect(hostBuyerBefore).toMatchObject({ alive: false, oilBaronAlly: true, oilBaronAllyVisualVisible: true });

    const guestBefore = await guest.evaluate((snapshot) => {
      const multi = window.__dustMultiplayerTest;
      multi.startMockGuest(["Host", "Bought", "Rival"], 0);
      multi.applySnapshot(snapshot);
      return { state: multi.getState(), ui: multi.refreshPlayerUi() };
    }, beforeDefeat.snapshot);
    const guestBuyerBefore = guestBefore.state.players.find((player) => player.id === "mock-player-2");
    expect(guestBuyerBefore).toMatchObject({ alive: false, oilBaronAlly: true, oilBaronAllyVisualVisible: true });

    const defeated = await page.evaluate(() => {
      const game = window.__dustAndDeadTest;
      const multi = window.__dustMultiplayerTest;
      game.damageOilBaron(9999, true, "mock-player-1");
      return {
        state: multi.getState(),
        ui: multi.refreshPlayerUi(),
        snapshot: multi.buildWireSnapshot(true, true, "mock-player-1"),
      };
    });
    const hostBuyerAfter = defeated.state.players.find((player) => player.id === "mock-player-2");
    expect(hostBuyerAfter).toMatchObject({ alive: false, oilBaronAlly: false, oilBaronAllyVisualVisible: false });
    const hostBuyerNameplate = defeated.ui.nameplates.find((entry) => entry.id === "mock-player-2");
    expect(hostBuyerNameplate.classes).not.toContain("is-oil-baron-ally");
    expect(hostBuyerNameplate.ariaLabel).not.toContain("hostile");

    // Boss state is applied before the roster. Even a partial death snapshot
    // must clear a stale pact; an older packet must not restore it afterward.
    const partialDeathSnapshot = { ...defeated.snapshot, players: [] };
    const guestAfter = await guest.evaluate(({ deathSnapshot, staleSnapshot }) => {
      const multi = window.__dustMultiplayerTest;
      multi.applySnapshot(deathSnapshot);
      const afterDeath = { state: multi.getState(), ui: multi.refreshPlayerUi() };
      multi.applySnapshot(staleSnapshot);
      return { afterDeath, afterStale: { state: multi.getState(), ui: multi.refreshPlayerUi() } };
    }, { deathSnapshot: partialDeathSnapshot, staleSnapshot: beforeDefeat.snapshot });
    for (const result of [guestAfter.afterDeath, guestAfter.afterStale]) {
      const buyer = result.state.players.find((player) => player.id === "mock-player-2");
      const nameplate = result.ui.nameplates.find((entry) => entry.id === "mock-player-2");
      expect(buyer).toMatchObject({ alive: false, oilBaronAlly: false, oilBaronAllyVisualVisible: false });
      if (nameplate) {
        expect(nameplate.classes).not.toContain("is-oil-baron-ally");
        expect(nameplate.ariaLabel).not.toContain("hostile");
      }
    }

    const revived = await page.evaluate(() => {
      const multi = window.__dustMultiplayerTest;
      const didRevive = multi.revive("mock-player-2", "post-baron-revive");
      return {
        didRevive,
        state: multi.getState(),
        snapshot: multi.buildWireSnapshot(true, true, "mock-player-1"),
      };
    });
    expect(revived.didRevive).toBe(true);
    expect(revived.state.players.find((player) => player.id === "mock-player-2"))
      .toMatchObject({ alive: true, oilBaronAlly: false, oilBaronAllyVisualVisible: false });
    const guestRevived = await guest.evaluate((snapshot) => {
      const multi = window.__dustMultiplayerTest;
      multi.applySnapshot(snapshot);
      return { state: multi.getState(), ui: multi.refreshPlayerUi() };
    }, revived.snapshot);
    expect(guestRevived.state.players.find((player) => player.id === "mock-player-2"))
      .toMatchObject({ alive: true, oilBaronAlly: false, oilBaronAllyVisualVisible: false });
  } finally {
    await guest.close();
  }
});

test("destroyed derricks keep oil and fire timing synchronized during packet gaps", async ({ page, context }) => {
  const guest = await context.newPage();
  try {
    await startHunt(page);
    await startHunt(guest);
    const active = await page.evaluate(() => {
      const game = window.__dustAndDeadTest;
      const multi = window.__dustMultiplayerTest;
      multi.startMockHost(["Host", "Guest"]);
      game.startWaveNow(10, "oilBaron");
      game.clearEnemies();
      game.setOilBaronAiEnabled(false);
      const viewer = multi.getState().players[1];
      game.spawnOilDerrick(viewer.x + 4, viewer.z, {
        instant: true,
        silent: true,
        oilRadius: 9,
        oilAge: 12,
      });
      game.igniteOilDerrick(0, true);
      return {
        diagnostics: game.getOilBaronDiagnostics(),
        snapshot: multi.buildWireSnapshot(true, true, "mock-player-2"),
      };
    });
    const guestActive = await guest.evaluate((snapshot) => {
      const multi = window.__dustMultiplayerTest;
      multi.startMockGuest(["Host", "Guest"], 1);
      multi.applySnapshot(snapshot);
      return window.__dustAndDeadTest.getOilBaronDiagnostics();
    }, active.snapshot);
    expect(guestActive.replica).toBe(true);
    expect(guestActive.derricks[0]).toMatchObject({ destroyed: false, oilRadius: 9 });
    expect(guestActive.derricks[0].burnTime).toBeCloseTo(active.diagnostics.derricks[0].burnTime, 1);

    const delayed = await page.evaluate(() => {
      const game = window.__dustAndDeadTest;
      const multi = window.__dustMultiplayerTest;
      game.damageOilDerrick(0, 999);
      const diagnostics = game.advanceOilBaron(3500);
      return {
        diagnostics,
        snapshot: multi.buildWireSnapshot(true, true, "mock-player-2"),
      };
    });
    const guestDelayed = await guest.evaluate((snapshot) => {
      window.__dustMultiplayerTest.applySnapshot(snapshot);
      return window.__dustAndDeadTest.getOilBaronDiagnostics();
    }, delayed.snapshot);
    const hostDelayedDerrick = delayed.diagnostics.derricks[0];
    const guestDelayedDerrick = guestDelayed.derricks[0];
    expect(guestDelayedDerrick.destroyed).toBe(true);
    expect(guestDelayedDerrick.oilRadius).toBeCloseTo(hostDelayedDerrick.oilRadius, 2);
    expect(guestDelayedDerrick.oilDrainRate).toBeCloseTo(hostDelayedDerrick.oilDrainRate, 3);
    expect(guestDelayedDerrick.burnTime).toBeCloseTo(hostDelayedDerrick.burnTime, 1);

    const [hostGap, guestGap] = await Promise.all([
      page.evaluate(() => {
        const game = window.__dustAndDeadTest;
        return { before: game.getOilBaronDiagnostics(), after: game.advanceOilBaron(1000) };
      }),
      guest.evaluate(() => {
        const game = window.__dustAndDeadTest;
        return { before: game.getOilBaronDiagnostics(), after: game.advanceOilBaron(1000) };
      }),
    ]);
    const hostGapDerrick = hostGap.after.derricks[0];
    const guestGapDerrick = guestGap.after.derricks[0];
    const hostGapDrain = hostGap.before.derricks[0].oilRadius - hostGapDerrick.oilRadius;
    const guestGapDrain = guestGap.before.derricks[0].oilRadius - guestGapDerrick.oilRadius;
    expect(guestGapDrain).toBeCloseTo(hostGapDrain, 2);
    expect(guestGapDerrick.burnTime).toBeCloseTo(hostGapDerrick.burnTime, 1);
  } finally {
    await guest.close();
  }
});

test("sparse Oil frames preserve derrick replicas and locally advance their puddles", async ({ page, context }) => {
  const guest = await context.newPage();
  try {
    await startHunt(page);
    await startHunt(guest);
    const host = await page.evaluate(() => {
      const game = window.__dustAndDeadTest;
      const multi = window.__dustMultiplayerTest;
      multi.startMockHost(["Host", "Guest"]);
      game.startWaveNow(10, "oilBaron");
      game.clearEnemies();
      game.setOilBaronAiEnabled(false);
      const viewer = multi.getState().players[1];
      game.spawnOilDerrick(viewer.x + 4, viewer.z, {
        instant: true,
        silent: true,
        oilRadius: 2.6,
        oilAge: 0,
      });
      const bootstrap = multi.buildWireSnapshot(true, true, "mock-player-2");
      multi.acknowledgeClientState("mock-player-2", bootstrap.sequence, 0, false);
      const repeated = multi.buildWireSnapshot(true, true, "mock-player-2");
      multi.acknowledgeClientState("mock-player-2", repeated.sequence, 0, false);
      const regular = multi.buildWireSnapshot(true, true, "mock-player-2");
      const regularBoss = multi.decodeBossState(regular.bossState);
      game.advanceOilBaron(1300);
      const recovery = multi.buildWireSnapshot(true, true, "mock-player-2");
      return {
        bootstrap,
        regular,
        recovery,
        regularBoss,
        recoveryBoss: multi.decodeBossState(recovery.bossState),
      };
    });

    expect(host.regularBoss).toMatchObject({ keyframe: false, derricksComplete: false, derricks: [] });
    expect(host.recoveryBoss).toMatchObject({ keyframe: true, derricksComplete: true });
    expect(host.recoveryBoss.derricks).toHaveLength(1);

    const replica = await guest.evaluate(({ bootstrap, regular, recovery }) => {
      const game = window.__dustAndDeadTest;
      const multi = window.__dustMultiplayerTest;
      multi.startMockGuest(["Host", "Guest"], 1);
      multi.applySnapshot(bootstrap);
      const initial = game.getOilBaronDiagnostics();
      multi.applySnapshot(regular);
      const afterSparse = game.getOilBaronDiagnostics();
      const locallyAdvanced = game.advanceOilBaron(500);
      multi.applySnapshot(recovery);
      return {
        initial,
        afterSparse,
        locallyAdvanced,
        recovered: game.getOilBaronDiagnostics(),
      };
    }, { bootstrap: host.bootstrap, regular: host.regular, recovery: host.recovery });

    expect(replica.initial.derrickCount).toBe(1);
    expect(replica.afterSparse.derrickCount).toBe(1);
    expect(replica.locallyAdvanced.derricks[0].oilRadius).toBeGreaterThan(replica.afterSparse.derricks[0].oilRadius);
    expect(replica.recovered.derrickCount).toBe(1);
    expect(replica.recovered.derricks[0].oilRadius).toBeCloseTo(host.recoveryBoss.derricks[0].oil, 2);
  } finally {
    await guest.close();
  }
});

test("every guest HUD receives the global active-derrick count outside its relevance scope", async ({ page, context }) => {
  const guest = await context.newPage();
  try {
    await startHunt(page);
    await startHunt(guest);
    const host = await page.evaluate(() => {
      const game = window.__dustAndDeadTest;
      const multi = window.__dustMultiplayerTest;
      multi.startMockHost(["Host", "Guest"]);
      game.startWaveNow(10, "oilBaron");
      game.clearEnemies();
      game.setOilBaronAiEnabled(false);
      multi.setPlayerPosition("mock-player-1", -170, 0);
      multi.setPlayerPosition("mock-player-2", 170, 0);
      const players = multi.getState().players;
      game.spawnOilDerrickBatch(players.map((player) => ({
        x: player.x,
        z: player.z + 4,
        options: { oilRadius: 6, oilAge: 8 },
      })));
      const snapshot = multi.buildWireSnapshot(true, true, "mock-player-2");
      const decoded = multi.decodeBossState(snapshot.bossState);
      return {
        snapshot,
        serializedDerricks: decoded.derricks.length,
        activeDerrickTotal: decoded.activeDerrickTotal,
      };
    });

    expect(host.activeDerrickTotal).toBe(2);
    expect(host.serializedDerricks).toBe(1);
    const replica = await guest.evaluate((snapshot) => {
      const multi = window.__dustMultiplayerTest;
      multi.startMockGuest(["Host", "Guest"], 1);
      multi.applySnapshot(snapshot);
      return window.__dustAndDeadTest.getOilBaronDiagnostics();
    }, host.snapshot);
    expect(replica).toMatchObject({ replica: true, derrickCount: 1, activeDerricks: 2 });
    expect(replica.hud.indicator).toContain("DERRICKS · 2");
  } finally {
    await guest.close();
  }
});

test("remote oil slow and fire wait for the derrick and ignition-warning ACK", async ({ page }) => {
  await startHunt(page);
  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const multi = window.__dustMultiplayerTest;
    multi.startMockHost(["Host", "Remote"]);
    game.startWaveNow(10, "oilBaron");
    game.clearEnemies();
    game.setOilBaronAiEnabled(false);
    multi.setPlayerPosition("mock-player-2", 170, 0);
    const remote = multi.getState().players.find((player) => player.id === "mock-player-2");
    multi.setHealth("mock-player-2", 100);
    game.spawnOilDerrick(remote.x, remote.z, {
      instant: true,
      silent: true,
      oilRadius: 9,
      oilAge: 12,
    });

    const unknown = multi.getOilBaronPlayerHazardDiagnostics("mock-player-2");
    const coldSnapshot = multi.buildWireSnapshot(true, true, "mock-player-2");
    const coldPending = multi.getOilBaronPlayerHazardDiagnostics("mock-player-2");
    multi.acknowledgeClientState("mock-player-2", coldSnapshot.sequence, 0, false);
    const coldAcknowledged = multi.getOilBaronPlayerHazardDiagnostics("mock-player-2");

    multi.setPlayerPosition("mock-player-2", -170, 0);
    multi.buildWireSnapshot(true, true, "mock-player-2");
    const outsideScope = multi.getOilBaronPlayerHazardDiagnostics("mock-player-2");
    multi.setPlayerPosition("mock-player-2", remote.x, remote.z);
    const returnedUnknown = multi.getOilBaronPlayerHazardDiagnostics("mock-player-2");
    const returnedSnapshot = multi.buildWireSnapshot(true, true, "mock-player-2");
    multi.acknowledgeClientState("mock-player-2", returnedSnapshot.sequence, 0, false);
    const returnedAcknowledged = multi.getOilBaronPlayerHazardDiagnostics("mock-player-2");

    game.igniteOilDerrick(0, false);
    const warningUnknown = multi.getOilBaronPlayerHazardDiagnostics("mock-player-2");
    const warningSnapshot = multi.buildWireSnapshot(true, true, "mock-player-2");
    const hpBeforeAck = multi.getOilBaronPlayerHazardDiagnostics("mock-player-2").hp;
    game.advanceOilBaron(100);
    const hpWithoutAck = multi.getOilBaronPlayerHazardDiagnostics("mock-player-2").hp;
    multi.acknowledgeClientState("mock-player-2", warningSnapshot.sequence, 0, false);
    const warningAcknowledged = multi.getOilBaronPlayerHazardDiagnostics("mock-player-2");
    game.advanceOilBaron(2000);
    const burning = multi.getOilBaronPlayerHazardDiagnostics("mock-player-2");
    return {
      unknown,
      coldPending,
      coldAcknowledged,
      outsideScope,
      returnedUnknown,
      returnedAcknowledged,
      warningUnknown,
      hpBeforeAck,
      hpWithoutAck,
      warningAcknowledged,
      burning,
    };
  });

  expect(result.unknown).toMatchObject({ rawInsideOil: true, known: false, effectiveInsideOil: false, speedMultiplier: 1 });
  expect(result.coldPending.pending).toBe(true);
  expect(result.coldAcknowledged).toMatchObject({ known: true, effectiveInsideOil: true, speedMultiplier: 0.72 });
  expect(result.outsideScope).toMatchObject({ known: false, rawInsideOil: false, effectiveInsideOil: false, speedMultiplier: 1 });
  expect(result.returnedUnknown).toMatchObject({ known: false, rawInsideOil: true, effectiveInsideOil: false, speedMultiplier: 1 });
  expect(result.returnedAcknowledged).toMatchObject({ known: true, effectiveInsideOil: true, speedMultiplier: 0.72 });
  expect(result.warningUnknown).toMatchObject({ known: false, effectiveInsideOil: false, speedMultiplier: 1 });
  expect(result.warningUnknown.hazards[0].warning).toBeGreaterThan(0);
  expect(result.hpWithoutAck).toBe(result.hpBeforeAck);
  expect(result.warningAcknowledged).toMatchObject({ known: true, effectiveInsideOil: true, speedMultiplier: 0.72 });
  expect(result.burning.hazards[0].burning).toBe(true);
  expect(result.burning.hp).toBeLessThan(result.hpWithoutAck);
});

test("the compact Oil Baron stream keeps hundreds of derricks inside both packet and steady-state budgets", async ({ page }) => {
  await startHunt(page);
  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const multi = window.__dustMultiplayerTest;
    multi.startMockHost(["Host", "Guest", "Rival", "Fourth"]);
    game.startWaveNow(10, "oilBaron");
    game.clearEnemies();
    game.setOilBaronAiEnabled(false);
    const player = multi.getState().players[0];
    game.spawnOilDerrickBatch(Array.from({ length: 400 }, (_, index) => ({
      x: player.x + (index % 20) * 0.08,
      z: player.z + Math.floor(index / 20) * 0.08,
      options: { oilRadius: 11.8, oilAge: 20, logicalOnly: true },
    })));
    const keyframeWire = multi.buildWireSnapshot(true, true, "mock-player-1");
    const keyframe = multi.decodeBossState(keyframeWire.bossState);
    multi.acknowledgeClientState("mock-player-1", keyframeWire.sequence, 0, false);
    const repeatedKeyframeWire = multi.buildWireSnapshot(true, true, "mock-player-1");
    multi.acknowledgeClientState("mock-player-1", repeatedKeyframeWire.sequence, 0, false);
    const regularWire = multi.buildWireSnapshot(true, true, "mock-player-1");
    const regular = multi.decodeBossState(regularWire.bossState);
    const steadyBossBytes = [];
    const steadyKeyframes = [];
    for (let frame = 0; frame < 30; frame += 1) {
      const wire = multi.buildWireSnapshot(true, true, "mock-player-1");
      const decoded = multi.decodeBossState(wire.bossState);
      steadyBossBytes.push(atob(wire.bossState).length);
      steadyKeyframes.push(Boolean(decoded?.keyframe));
      game.advanceOilBaron(67);
    }
    const diagnostics = game.getOilBaronDiagnostics();
    return {
      keyframeBytes: new TextEncoder().encode(JSON.stringify(keyframeWire)).length,
      keyframeBossBytes: atob(keyframeWire.bossState).length,
      regularBossBytes: atob(regularWire.bossState).length,
      averageSteadyBossBytes: steadyBossBytes.reduce((sum, bytes) => sum + bytes, 0) / steadyBossBytes.length,
      steadyKeyframeCount: steadyKeyframes.filter(Boolean).length,
      hasBossState: typeof keyframeWire.bossState === "string",
      hasLegacyBoss: Object.prototype.hasOwnProperty.call(keyframeWire, "bellRinger"),
      kind: keyframe?.kind || "",
      keyframe: keyframe?.keyframe,
      derricks: keyframe?.derricks?.length || 0,
      activeDerrickTotal: keyframe?.activeDerrickTotal,
      regular,
      hostActiveDerricks: diagnostics.activeDerricks,
    };
  });

  expect(result).toMatchObject({ hasBossState: true, hasLegacyBoss: false, kind: "oilBaron", keyframe: true, derricks: 400 });
  expect(result.activeDerrickTotal).toBe(result.hostActiveDerricks);
  expect(result.keyframeBytes).toBeLessThan(31 * 1024);
  expect(result.keyframeBossBytes).toBeLessThan(16 * 1024);
  expect(result.regular).toMatchObject({
    kind: "oilBaron",
    keyframe: false,
    derricksComplete: false,
    activeDerrickTotal: 400,
    derricks: [],
  });
  expect(result.regularBossBytes).toBeLessThan(96);
  expect(result.steadyKeyframeCount).toBeLessThanOrEqual(4);
  expect(result.averageSteadyBossBytes).toBeLessThan(result.keyframeBossBytes * 0.2);
});

test("the Baron's side receives its one-time $5,000 bonus when every rival surrenders", async ({ page }) => {
  await startHunt(page);
  const state = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const multi = window.__dustMultiplayerTest;
    multi.startMockHost(["Buyer", "Rival"]);
    game.startWaveNow(10, "oilBaron");
    game.clearEnemies();
    game.setOilBaronAiEnabled(false);
    game.acceptOilBaronBribe("mock-player-1");
    multi.damagePlayer("mock-player-2", 9999, "");
    multi.surrender("mock-player-2");
    return { match: multi.getState(), baron: game.getOilBaronDiagnostics() };
  });

  const buyer = state.match.players.find((player) => player.id === "mock-player-1");
  expect(buyer.points).toBe(10000);
  expect(state.baron.bribe.surrenderRewardGranted).toBe(true);
});
