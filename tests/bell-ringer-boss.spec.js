const path = require("node:path");
const { expect, test } = require("@playwright/test");

const MAX_WIRE_BYTES = 31 * 1024;

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
  const wantAudio = Boolean(options.audio);
  const audioEnabled = await page.evaluate(() => window.__dustAndDeadTest.getAudioDiagnostics().enabled);
  if (audioEnabled !== wantAudio) await page.locator("#menu-music-btn").click();
  await page.getByRole("button", { name: "Start Hunt" }).click();
  await page.waitForFunction(() => Boolean(
    window.__dustAndDeadTest?.startWaveNow &&
    window.__dustAndDeadTest?.getBellRingerDiagnostics &&
    window.__dustAndDeadTest?.completeBellChurchCapture &&
    window.__dustAndDeadTest?.damageBellRinger &&
    window.__dustAndDeadTest?.setBellRingerAiEnabled &&
    window.__dustAndDeadTest?.forceBellRingerToll &&
    window.__dustAndDeadTest?.advanceWaveProgress
  ));
}

function expectThreeResetChurches(churches) {
  expect(churches).toHaveLength(3);
  expect(churches.map((church) => church.index)).toEqual([0, 1, 2]);
  expect(new Set(churches.map((church) => church.id)).size).toBe(3);
  for (const church of churches) {
    expect(church.active).toBe(true);
    expect(church.captureProgress).toBe(0);
  }
}

test("the playable Bell Ringer rifle test scene starts fully upgraded on wave 10", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto(`${fileUrl("index.html")}?preview=bell-ringer-rifle-test&mapSeed=7331`);
  await page.waitForTimeout(3000);
  expect(pageErrors).toEqual([]);
  await page.waitForFunction(() => Boolean(window.__dustAndDeadTest?.getBellRingerDiagnostics));

  const result = await page.evaluate(() => ({
    game: JSON.parse(window.render_game_to_text()),
    boss: window.__dustAndDeadTest.getBellRingerDiagnostics(),
  }));

  expect(result.game).toMatchObject({ wave: 10, weapon: "rifle" });
  expect(result.game.ammo).toMatchObject({ current: 36, magazine: 36, reserve: 9999 });
  expect(result.game.progression).toMatchObject({
    level: 30,
    playerClass: "ranger",
    rifleUpgrade: "leverBarrage",
  });
  expect(result.game.progression.upgrades).toMatchObject({
    extendedTube: 1,
    trailLoader: 1,
    chainLightning: 1,
    stormTempo: 1,
    steadyHand: 10,
    quickReload: 8,
    hairTrigger: 8,
    longReach: 5,
  });
  expect(result.boss).toMatchObject({ active: true, shielded: true, defeated: false });
  expect(result.boss.maxHp).toBe(328);
  expect(result.boss.churches).toHaveLength(3);
});

test("phone landscape fits the Bell Ringer HUD into the clear strip between the combat panels", async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 378 });
  await startHunt(page);

  await page.evaluate(() => {
    window.__dustMultiplayerTest.startMockHost(["Host", "Guest"]);
    window.__dustAndDeadTest.startWaveNow(10);
    window.__dustAndDeadTest.clearEnemies();
    window.__dustAndDeadTest.setBellRingerAiEnabled(false);
  });

  await expect(page.locator("#boss-hud")).toBeVisible();
  await expect(page.locator("#multiplayer-scoreboard-toggle")).toBeVisible();
  const layout = await page.evaluate(() => {
    const box = (selector) => {
      const rect = document.querySelector(selector).getBoundingClientRect();
      return {
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      };
    };
    const name = document.querySelector("#boss-name");
    const status = document.querySelector("#boss-status");
    return {
      viewport: { width: innerWidth, height: innerHeight },
      boss: box("#boss-hud"),
      playerHud: box("#hud"),
      ammoHud: box("#ammo-hud"),
      scores: box("#multiplayer-scoreboard-toggle"),
      frame: box(".boss-hud__frame"),
      track: box(".boss-health-track"),
      name: {
        clientWidth: name.clientWidth,
        scrollWidth: name.scrollWidth,
        fontSize: Number.parseFloat(getComputedStyle(name).fontSize),
      },
      statusFontSize: Number.parseFloat(getComputedStyle(status).fontSize),
    };
  });

  expect(layout.boss.top).toBeGreaterThanOrEqual(layout.scores.bottom + 1);
  expect(layout.boss.top).toBeLessThanOrEqual(layout.scores.bottom + 8);
  expect(layout.boss.bottom).toBeLessThanOrEqual(97);
  expect(layout.playerHud.width).toBeLessThanOrEqual(264);
  expect(layout.ammoHud.width).toBeLessThanOrEqual(224);
  expect(layout.boss.width).toBeGreaterThanOrEqual(320);
  expect(layout.boss.width).toBeLessThanOrEqual(layout.viewport.width * 0.45);
  expect(layout.boss.left).toBeGreaterThanOrEqual(layout.playerHud.right - 2);
  expect(layout.boss.right).toBeLessThanOrEqual(layout.ammoHud.left + 2);
  expect(layout.track.height).toBeGreaterThanOrEqual(9);
  expect(layout.name.scrollWidth).toBeLessThanOrEqual(layout.name.clientWidth + 1);
  expect(layout.name.fontSize).toBeGreaterThanOrEqual(10);
  expect(layout.statusFontSize).toBeGreaterThanOrEqual(7.5);
});

test("desktop Bell Ringer HUD sits slightly higher without touching the top combat panels", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await startHunt(page);
  await page.evaluate(() => {
    window.__dustAndDeadTest.startWaveNow(10);
    window.__dustAndDeadTest.clearEnemies();
    window.__dustAndDeadTest.setBellRingerAiEnabled(false);
  });

  const layout = await page.evaluate(() => {
    const boss = document.querySelector("#boss-hud").getBoundingClientRect();
    const player = document.querySelector("#hud").getBoundingClientRect();
    const ammo = document.querySelector("#ammo-hud").getBoundingClientRect();
    return {
      boss: { top: boss.top, left: boss.left, right: boss.right, width: boss.width },
      player: { right: player.right },
      ammo: { left: ammo.left },
    };
  });

  expect(layout.boss.top).toBeGreaterThanOrEqual(73);
  expect(layout.boss.top).toBeLessThanOrEqual(75);
  expect(layout.boss.width).toBeGreaterThanOrEqual(700);
  expect(layout.boss.left).toBeGreaterThan(layout.player.right);
  expect(layout.boss.right).toBeLessThan(layout.ammo.left);
});

test("a Bell toll acknowledges a queued guest reload instead of leaving it in the resend loop", async ({ page }) => {
  await startHunt(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const multiplayer = window.__dustMultiplayerTest;
    const requestId = "reload-before-toll";
    multiplayer.startMockHost(["Host", "Guest"]);
    game.startWaveNow(10);
    game.clearEnemies();
    game.setBellRingerAiEnabled(false);

    const guest = multiplayer.getState().players[1];
    multiplayer.setProgression(guest.id, {
      weapon: "rifle",
      ammo: Object.assign({}, guest.progression.ammo, { rifle: 0 }),
      ammoReserve: Object.assign({}, guest.progression.ammoReserve, { rifle: 90 }),
      reloadTimers: Object.assign({}, guest.progression.reloadTimers, { rifle: 1.4 }),
    });
    const queued = multiplayer.injectReloadAction(guest.id, 0, {
      requestId,
      weaponId: "rifle",
    });
    const before = multiplayer.getState().players[1];
    const toll = game.forceBellRingerToll();
    const after = multiplayer.getState().players[1];
    const wire = multiplayer.buildSnapshot(false, false, guest.id);
    const wireGuest = wire.players.find((player) => player.id === guest.id);
    const duplicateAccepted = multiplayer.injectReloadAction(guest.id, 0, {
      requestId,
      weaponId: "rifle",
    });
    const afterDuplicate = multiplayer.getState().players[1];
    return { requestId, queued, before, toll, after, wireGuest, duplicateAccepted, afterDuplicate };
  });

  expect(result.queued).toBe(true);
  expect(result.before.pendingReloadAfterFireSequence).toBe(0);
  expect(result.before.lastProcessedReloadRequestId).toBe("");
  expect(result.toll).toBe(true);
  expect(result.after.pendingReloadAfterFireSequence).toBe(-1);
  expect(result.after.progression.reloadTimers.rifle).toBe(0);
  expect(result.after.lastProcessedReloadRequestId).toBe(result.requestId);
  expect(result.wireGuest.reloadAck).toBe(result.requestId);
  expect(result.duplicateAccepted).toBe(false);
  expect(result.afterDuplicate.lastProcessedReloadRequestId).toBe(result.requestId);
});

test("a Bell toll restarts an interrupted rifle reload after the stagger without requiring death", async ({ page }) => {
  await startHunt(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const multiplayer = window.__dustMultiplayerTest;
    const clone = (value) => JSON.parse(JSON.stringify(value));
    multiplayer.startMockHost(["Host", "Guest"]);
    game.startWaveNow(10, "bellRinger");
    game.clearEnemies();
    game.setBellRingerAiEnabled(false);

    const guest = multiplayer.getState().players[1];
    multiplayer.setProgression(guest.id, {
      weapon: "rifle",
      ammo: Object.assign({}, guest.progression.ammo, { rifle: 0 }),
      ammoReserve: Object.assign({}, guest.progression.ammoReserve, { rifle: 90 }),
      reloadTimers: Object.assign({}, guest.progression.reloadTimers, { rifle: 1.2 }),
    });
    const read = () => {
      const snapshot = multiplayer.buildSnapshot(false, false, guest.id);
      const player = snapshot.players.find((entry) => entry.id === guest.id);
      return {
        alive: player.alive,
        deaths: guest.deaths,
        bellStagger: player.bellStagger,
        ammo: player.progression.ammo.rifle,
        reserve: player.progression.ammoReserve.rifle,
        reloadTimer: player.progression.reloadTimers.rifle,
      };
    };

    const before = read();
    const beforeWire = clone(multiplayer.buildWireSnapshot(false, false, guest.id));
    const toll = game.forceBellRingerToll();
    const interrupted = read();
    const interruptedWire = clone(multiplayer.buildWireSnapshot(false, false, guest.id));
    window.advanceTime(700);
    const duringStagger = read();
    const duringStaggerWire = clone(multiplayer.buildWireSnapshot(false, false, guest.id));
    window.advanceTime(400);
    const resumed = read();
    const resumedWire = clone(multiplayer.buildWireSnapshot(false, false, guest.id));
    window.advanceTime(3000);
    const completed = read();
    const completedWire = clone(multiplayer.buildWireSnapshot(false, false, guest.id));
    return {
      before,
      toll,
      interrupted,
      duringStagger,
      resumed,
      completed,
      wires: {
        before: beforeWire,
        interrupted: interruptedWire,
        duringStagger: duringStaggerWire,
        resumed: resumedWire,
        completed: completedWire,
      },
    };
  });

  const replica = await page.evaluate((wires) => {
    const multiplayer = window.__dustMultiplayerTest;
    multiplayer.startMockGuest(["Host", "Guest"], 1);
    const read = () => {
      const player = multiplayer.getState().players[1];
      return {
        alive: player.alive,
        deaths: player.deaths,
        ammo: player.progression.ammo.rifle,
        reserve: player.progression.ammoReserve.rifle,
        reloadTimer: player.progression.reloadTimers.rifle,
      };
    };
    multiplayer.applySnapshot(wires.before);
    const before = read();
    multiplayer.applySnapshot(wires.interrupted);
    const interrupted = read();
    window.advanceTime(700);
    multiplayer.applySnapshot(wires.duringStagger);
    const duringStagger = read();
    window.advanceTime(400);
    multiplayer.applySnapshot(wires.resumed);
    const resumed = read();
    window.advanceTime(3000);
    multiplayer.applySnapshot(wires.completed);
    const completed = read();
    return { before, interrupted, duringStagger, resumed, completed };
  }, result.wires);

  expect(result.before).toMatchObject({ alive: true, deaths: 0, ammo: 0, reserve: 90 });
  expect(result.before.reloadTimer).toBeGreaterThan(0);
  expect(result.toll).toBe(true);
  expect(result.interrupted.bellStagger).toBeGreaterThan(0);
  expect(result.interrupted.reloadTimer).toBe(0);
  expect(result.duringStagger.bellStagger).toBeGreaterThan(0);
  expect(result.duringStagger.reloadTimer).toBe(0);
  expect(result.resumed).toMatchObject({ alive: true, deaths: 0, bellStagger: 0, ammo: 0 });
  expect(result.resumed.reloadTimer).toBeGreaterThan(0);
  expect(result.completed).toMatchObject({ alive: true, deaths: 0, bellStagger: 0, reloadTimer: 0 });
  expect(result.completed.ammo).toBeGreaterThan(0);
  expect(result.completed.reserve).toBeLessThan(90);
  expect(replica.before).toMatchObject({ alive: true, deaths: 0, ammo: 0, reserve: 90 });
  expect(replica.before.reloadTimer).toBeGreaterThan(0);
  expect(replica.interrupted.reloadTimer).toBe(0);
  expect(replica.duringStagger.reloadTimer).toBe(0);
  expect(replica.resumed).toMatchObject({ alive: true, deaths: 0, ammo: 0 });
  expect(replica.resumed.reloadTimer).toBeGreaterThan(0);
  expect(replica.completed).toMatchObject({ alive: true, deaths: 0, reloadTimer: 0 });
  expect(replica.completed.ammo).toBe(result.completed.ammo);
  expect(replica.completed.reserve).toBe(result.completed.reserve);
});

test("the cathedral theme follows the Bell Ringer entity, fades on death, and yields to normal music next wave", async ({ page }) => {
  const browserErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));

  await startHunt(page, { audio: true });
  await page.waitForFunction(() => window.__dustAndDeadTest.getAudioDiagnostics().contextState === "running");
  const ordinary = await page.evaluate(() => window.__dustAndDeadTest.getAudioDiagnostics());

  await page.evaluate(() => {
    window.__dustAndDeadTest.startWaveNow(10);
    window.__dustAndDeadTest.setBellRingerAiEnabled(false);
    window.__dustAndDeadTest.setPlayerMaxHp(9999, 9999);
  });
  await page.waitForFunction(() => {
    const music = window.__dustAndDeadTest.getAudioDiagnostics().bossMusic;
    return music.active && music.boundToActiveBoss && music.scheduledStepCount > 0;
  });
  const active = await page.evaluate(() => window.__dustAndDeadTest.getAudioDiagnostics());
  await page.waitForTimeout(5000);
  const steadyTheme = await page.evaluate(() => window.__dustAndDeadTest.getAudioDiagnostics());

  await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const maxHp = game.getBellRingerDiagnostics().maxHp;
    for (let cycle = 0; cycle < 2; cycle += 1) {
      for (let church = 0; church < 3; church += 1) game.completeBellChurchCapture(church);
      game.damageBellRinger(maxHp * 10);
    }
  });
  await page.waitForFunction(() => window.__dustAndDeadTest.getAudioDiagnostics().bossMusic.tempo === 140);
  const dangerTheme = await page.evaluate(() => ({
    boss: window.__dustAndDeadTest.getBellRingerDiagnostics(),
    audio: window.__dustAndDeadTest.getAudioDiagnostics(),
  }));

  await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const maxHp = game.getBellRingerDiagnostics().maxHp;
    for (let church = 0; church < 3; church += 1) game.completeBellChurchCapture(church);
    game.damageBellRinger(maxHp * 10);
  });
  await page.waitForFunction(() => window.__dustAndDeadTest.getAudioDiagnostics().bossMusic.tempo === 152);
  const finalShieldedTheme = await page.evaluate(() => ({
    boss: window.__dustAndDeadTest.getBellRingerDiagnostics(),
    audio: window.__dustAndDeadTest.getAudioDiagnostics(),
  }));

  const finalVulnerable = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    for (let church = 0; church < 3; church += 1) game.completeBellChurchCapture(church);
    game.forceBellRingerBellDrop();
    return {
      boss: game.getBellRingerDiagnostics(),
      audio: game.getAudioDiagnostics(),
    };
  });
  await page.waitForTimeout(2400);
  const finalThemeSteady = await page.evaluate(() => window.__dustAndDeadTest.getAudioDiagnostics());

  const defeatedState = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const maxHp = game.getBellRingerDiagnostics().maxHp;
    game.damageBellRinger(maxHp * 10);
    return {
      boss: game.getBellRingerDiagnostics(),
      audio: game.getAudioDiagnostics(),
    };
  });
  const deathStart = defeatedState.audio;
  await page.waitForTimeout(3600);
  const deathTail = await page.evaluate(() => window.__dustAndDeadTest.getAudioDiagnostics());

  await page.evaluate(() => window.__dustAndDeadTest.advanceWaveProgress(7100));
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).wave === 11);
  await page.waitForFunction(() => !window.__dustAndDeadTest.getAudioDiagnostics().bossMusic.normalSuppressed);
  await page.waitForTimeout(1800);
  const nextWave = await page.evaluate(() => ({
    world: JSON.parse(window.render_game_to_text()),
    audio: window.__dustAndDeadTest.getAudioDiagnostics(),
  }));

  expect(ordinary.bossMusic).toMatchObject({ lifecycle: "normal", active: false, normalSuppressed: false });
  expect(active.bossMusic).toMatchObject({
    id: "bell-ringer",
    title: "The Last Parish",
    lifecycle: "active",
    encounterLifecycle: "active",
    boundToActiveBoss: true,
    active: true,
    normalSuppressed: true,
    tempo: 128,
  });
  expect(active.bossMusic.persistentNodeCount).toBeGreaterThanOrEqual(4);
  expect(active.bossMusic.scheduledStepCount).toBeGreaterThan(0);
  expect(steadyTheme.bossMusic.active).toBe(true);
  expect(steadyTheme.transientAudioNodeCount).toBeLessThan(360);
  expect(steadyTheme.pendingAudioDisconnectGroups).toBeLessThan(80);
  expect(dangerTheme.boss).toMatchObject({ phase: 2, shielded: true });
  expect(dangerTheme.boss.attacks.attackRateMultiplier).toBe(1.2);
  expect(dangerTheme.boss.bellDrop.rateMultiplier).toBe(1.4);
  expect(dangerTheme.audio.bossMusic).toMatchObject({
    phase: 2,
    arrangementPhase: 2,
    tempo: 140,
    arrangement: "danger-chorale",
    motif: "phrygian-danger-chorale",
  });
  expect(dangerTheme.audio.bossMusic.transitionCount).toBeGreaterThanOrEqual(1);
  expect(finalShieldedTheme.boss).toMatchObject({ phase: 3, shielded: true });
  expect(finalShieldedTheme.boss.attacks.attackRateMultiplier).toBe(1.5);
  expect(finalShieldedTheme.boss.bellDrop.rateMultiplier).toBe(2);
  expect(finalShieldedTheme.audio.bossMusic).toMatchObject({
    phase: 3,
    arrangementPhase: 3,
    tempo: 152,
    arrangement: "last-judgment-finale",
    motif: "last-judgment-chorale",
  });
  expect(finalShieldedTheme.audio.bossMusic.transitionCount).toBeGreaterThan(dangerTheme.audio.bossMusic.transitionCount);
  expect(finalVulnerable.boss.speed).toMatchObject({
    finalPhaseMultiplier: 1.6,
    finalExtraMultiplier: 1.17,
    finaleCombinedMultiplier: 1.872,
  });
  expect(finalVulnerable.boss.attacks).toMatchObject({ attackRateMultiplier: 1.5 });
  expect(finalVulnerable.boss.attacks.sweepCooldown).toBeCloseTo(finalShieldedTheme.boss.attacks.sweepCooldown, 3);
  expect(finalVulnerable.boss.bellDrop.rateMultiplier).toBe(2);
  expect(finalVulnerable.boss.bellDrop.nextIn).toBeGreaterThanOrEqual(finalVulnerable.boss.bellDrop.minimumInterval);
  expect(finalVulnerable.boss.bellDrop.nextIn).toBeLessThanOrEqual(finalVulnerable.boss.bellDrop.maximumInterval);
  expect(finalThemeSteady.bossMusic).toMatchObject({
    phase: 3,
    arrangementPhase: 3,
    tempo: 152,
    arrangement: "last-judgment-finale",
    motif: "last-judgment-chorale",
  });
  expect(finalThemeSteady.transientAudioNodeCount).toBeLessThan(520);
  expect(finalThemeSteady.pendingAudioDisconnectGroups).toBeLessThan(110);
  expect(deathStart.bossMusic).toMatchObject({
    lifecycle: "aftermath",
    encounterLifecycle: "aftermath",
    active: false,
    fading: true,
    normalSuppressed: true,
    deathFadeSeconds: 3.4,
  });
  expect(deathStart.bossMusic.fadeSecondsRemaining).toBeGreaterThan(2.5);
  expect(deathTail.bossMusic.fading).toBe(false);
  expect(deathTail.bossMusic.normalSuppressed).toBe(true);
  expect(deathTail.bossMusic.themeGain).toBeLessThan(0.01);
  expect(deathTail.bossMusic.normalGain).toBeLessThan(0.01);
  expect(nextWave.world.wave).toBe(11);
  expect(nextWave.audio.gameActive).toBe(true);
  expect(nextWave.audio.bossMusic).toMatchObject({
    id: "",
    lifecycle: "normal",
    encounterLifecycle: "normal",
    active: false,
    fading: false,
    normalSuppressed: false,
  });
  expect(nextWave.audio.bossMusic.normalGain).toBeGreaterThan(0.9);
  expect(nextWave.audio.bossMusic.themeGain).toBeLessThan(0.01);
  expect(browserErrors).toEqual([]);
});

test("an active sub-tenth Bell Ringer replica keeps boss music until the authoritative death flag", async ({ page }) => {
  await startHunt(page, { audio: true });
  await page.waitForFunction(() => window.__dustAndDeadTest.getAudioDiagnostics().contextState === "running");

  const prepared = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const multiplayer = window.__dustMultiplayerTest;
    const clone = (value) => JSON.parse(JSON.stringify(value));
    multiplayer.startMockHost(["Host", "Guest"]);
    game.startWaveNow(15, "bellRinger");
    game.clearEnemies();
    game.setBellRingerAiEnabled(false);
    const maxHp = game.getBellRingerDiagnostics().maxHp;
    for (let phase = 0; phase < 3; phase += 1) {
      for (let church = 0; church < 3; church += 1) game.completeBellChurchCapture(church);
      game.damageBellRinger(maxHp * 10);
    }
    for (let church = 0; church < 3; church += 1) game.completeBellChurchCapture(church);
    const finalSection = game.getBellRingerDiagnostics();
    game.damageBellRinger((finalSection.hp - maxHp * 0.1) / (1 - finalSection.damageResistance));
    const lastStand = game.getBellRingerDiagnostics();
    game.damageBellRinger((lastStand.hp - 0.04) / (1 - lastStand.damageResistance));
    const hostLive = game.getBellRingerDiagnostics();
    const liveWire = clone(multiplayer.buildWireSnapshot(false, false, "mock-player-2"));
    const liveBoss = multiplayer.decodeBossState(liveWire.bossState);
    game.forceActiveBossDefeat(true);
    const deathWire = clone(multiplayer.buildWireSnapshot(false, false, "mock-player-2"));
    const deathBoss = multiplayer.decodeBossState(deathWire.bossState);
    return { hostLive, liveWire, liveBoss, deathWire, deathBoss };
  });

  expect(prepared.hostLive).toMatchObject({ active: true, defeated: false, phase: 3, hp: 0.04 });
  expect(prepared.hostLive.lastStand).toMatchObject({ active: true, damageResistance: 0.9 });
  expect(prepared.liveBoss).toMatchObject({ active: true, hp: 0.1, phase: 3 });
  expect(prepared.liveBoss.defeated).toBeUndefined();
  expect(prepared.deathBoss).toMatchObject({
    active: false,
    defeated: true,
    hp: 0,
    action: "defeated",
  });

  await page.evaluate((wire) => {
    window.__dustMultiplayerTest.startMockGuest(["Host", "Guest"], 1);
    window.__dustMultiplayerTest.applySnapshot(wire);
  }, prepared.liveWire);
  await page.waitForFunction(() => {
    const boss = window.__dustAndDeadTest.getBellRingerDiagnostics();
    const music = window.__dustAndDeadTest.getAudioDiagnostics().bossMusic;
    return boss.replica && boss.active && !boss.defeated && boss.hp > 0 &&
      music.lifecycle === "active" && music.encounterLifecycle === "active" &&
      music.boundToActiveBoss && music.normalSuppressed;
  });
  const guestLive = await page.evaluate(() => ({
    boss: window.__dustAndDeadTest.getBellRingerDiagnostics(),
    music: window.__dustAndDeadTest.getAudioDiagnostics().bossMusic,
  }));
  expect(guestLive.boss).toMatchObject({
    replica: true,
    active: true,
    defeated: false,
    hp: 0.1,
  });
  expect(guestLive.music).toMatchObject({
    lifecycle: "active",
    encounterLifecycle: "active",
    boundToActiveBoss: true,
    normalSuppressed: true,
  });

  const guestDeathTiming = await page.evaluate((wire) => {
    const game = window.__dustAndDeadTest;
    game.resetFrameTiming();
    game.setSimulationBacklogForTest(400);
    window.__dustMultiplayerTest.applySnapshot(wire);
    return game.getFrameTimingDiagnostics();
  }, prepared.deathWire);
  expect(guestDeathTiming).toMatchObject({
    pendingMs: 0,
    backlogDroppedMs: 400,
    backlogDropReason: "remote-boss-defeat",
  });
  await page.waitForFunction(() => {
    const boss = window.__dustAndDeadTest.getBellRingerDiagnostics();
    const music = window.__dustAndDeadTest.getAudioDiagnostics().bossMusic;
    return boss.defeated && music.lifecycle === "aftermath" &&
      music.encounterLifecycle === "aftermath";
  });
  const guestDeath = await page.evaluate(() => ({
    boss: window.__dustAndDeadTest.getBellRingerDiagnostics(),
    music: window.__dustAndDeadTest.getAudioDiagnostics().bossMusic,
  }));
  expect(guestDeath.boss).toMatchObject({
    replica: true,
    active: false,
    defeated: true,
    hp: 0,
  });
  expect(guestDeath.music).toMatchObject({
    lifecycle: "aftermath",
    encounterLifecycle: "aftermath",
    active: false,
    fading: true,
    normalSuppressed: true,
  });
});

test("wave 10 keeps its full zombie budget and presents one shielded Bell Ringer with three churches", async ({ page }) => {
  await startHunt(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const expectedZombieCount = game.getWaveZombieCount(10);
    const wave = game.startWaveNow(10);
    game.setBellRingerAiEnabled(false);
    const initial = game.getBellRingerDiagnostics();
    const forcedToll = game.forceBellRingerToll();
    const afterToll = game.getBellRingerDiagnostics();
    return { expectedZombieCount, wave, initial, forcedToll, afterToll };
  });

  expect(result.expectedZombieCount).toBe(175);
  expect(result.wave).toMatchObject({
    wave: 10,
    waveSpawnTarget: result.expectedZombieCount,
  });
  expect(result.initial).toMatchObject({
    active: true,
    shielded: true,
    aiEnabled: false,
    hpRatio: 1,
    maxHp: 328,
  });
  expect(result.initial.hp).toBe(result.initial.maxHp);
  expect(result.initial.maxHp).toBeGreaterThan(0);
  expect(result.initial.model).toMatchObject({
    weaponLinks: 10,
    weaponGripAttached: true,
  });
  expectThreeResetChurches(result.initial.churches);
  for (const church of result.initial.churches) {
    expect(church.captureRadius).toBeGreaterThan(church.visualRadius);
    expect(church.collision).toMatchObject({
      captureContainsModel: true,
      colliderCount: 4,
      walkRingBlockedSamples: 0,
    });
    expect(church.collision.footprints.map((footprint) => footprint.name)).toEqual([
      "nave",
      "left-transept",
      "right-transept",
      "bell-tower",
    ]);
  }
  for (let first = 0; first < result.initial.churches.length; first += 1) {
    for (let second = first + 1; second < result.initial.churches.length; second += 1) {
      const a = result.initial.churches[first];
      const b = result.initial.churches[second];
      expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(320);
    }
  }
  const churchXs = result.initial.churches.map((church) => church.x);
  const churchZs = result.initial.churches.map((church) => church.z);
  expect(Math.max(...churchXs) - Math.min(...churchXs)).toBeGreaterThan(360);
  expect(Math.max(...churchZs) - Math.min(...churchZs)).toBeGreaterThan(300);
  const [churchA, churchB, churchC] = result.initial.churches;
  const triangleArea = Math.abs(
    churchA.x * (churchB.z - churchC.z) +
    churchB.x * (churchC.z - churchA.z) +
    churchC.x * (churchA.z - churchB.z)
  ) / 2;
  expect(triangleArea).toBeGreaterThan(55000);
  expect(result.initial.hud).toMatchObject({
    visible: true,
    hpRatio: 1,
  });
  expect(result.initial.hud.name).toMatch(/bell ringer/i);
  expect(result.forcedToll).toBeTruthy();
  expect(result.afterToll.tollSequence).toBeGreaterThan(result.initial.tollSequence);

  await expect(page.locator("#boss-hud")).toBeVisible();
  await expect(page.locator("#boss-name")).toContainText(/bell ringer/i);
  await expect(page.locator("#boss-hud")).toHaveClass(/is-shielded/);
  await expect(page.locator(".boss-health-track")).toHaveAttribute("role", "progressbar");
  await expect(page.locator(".boss-health-track")).toHaveAttribute("aria-valuemin", "0");
  await expect(page.locator(".boss-health-track")).toHaveAttribute("aria-valuemax", "100");
  await expect(page.locator(".boss-health-track")).toHaveAttribute("aria-valuenow", "100");
  await expect(page.locator("#boss-church-pips span")).toHaveCount(3);
  await expect(page.locator("#boss-church-pips span.is-active")).toHaveCount(3);

  const shieldCoverage = await page.evaluate(() => {
    const health = document.querySelector("#boss-health-fill").getBoundingClientRect();
    const sheen = document.querySelector("#boss-shield-sheen").getBoundingClientRect();
    const style = getComputedStyle(document.querySelector("#boss-shield-sheen"));
    return {
      health: { x: health.x, width: health.width },
      sheen: { x: sheen.x, width: sheen.width },
      transform: style.transform,
      background: style.backgroundImage,
    };
  });
  expect(shieldCoverage.sheen.x).toBeCloseTo(shieldCoverage.health.x, 1);
  expect(shieldCoverage.sheen.width).toBeCloseTo(shieldCoverage.health.width, 1);
  expect(shieldCoverage.transform).toBe("none");
  expect(shieldCoverage.background).toMatch(/repeating-linear-gradient/i);
});

test("churches stay map-wide when wave 10 begins near any arena corner", async ({ page }) => {
  await startHunt(page);

  const samples = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const starts = [
      [-210, -170],
      [210, -170],
      [210, 170],
      [-210, 170],
    ];
    return starts.map(([x, z]) => {
      game.setPlayerPosition(x, z);
      game.startWaveNow(10);
      game.setBellRingerAiEnabled(false);
      return game.getBellRingerDiagnostics();
    });
  });

  for (const sample of samples) {
    const xs = sample.churches.map((church) => church.x);
    const zs = sample.churches.map((church) => church.z);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(360);
    expect(Math.max(...zs) - Math.min(...zs)).toBeGreaterThan(300);
    for (let first = 0; first < sample.churches.length; first += 1) {
      const church = sample.churches[first];
      expect(Math.hypot(church.x - sample.bossPosition.x, church.z - sample.bossPosition.z)).toBeGreaterThan(120);
      for (let second = first + 1; second < sample.churches.length; second += 1) {
        const other = sample.churches[second];
        expect(Math.hypot(church.x - other.x, church.z - other.z)).toBeGreaterThan(320);
      }
    }
  }
});

test("spectral chains keep full detail while rebuilding matrices at a bounded visual cadence", async ({ page }) => {
  await startHunt(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    game.startWaveNow(10);
    game.setBellRingerAiEnabled(false);
    const before = game.getBellRingerDiagnostics();
    window.advanceTime(1000);
    const after = game.getBellRingerDiagnostics();
    return { before, after };
  });

  const visibleIndices = result.before.churches
    .map((church, index) => church.chainVisible ? index : -1)
    .filter((index) => index >= 0);
  expect(visibleIndices.length).toBeGreaterThan(0);
  for (const index of visibleIndices) {
    const rebuilds = result.after.churches[index].chainMatrixRebuilds - result.before.churches[index].chainMatrixRebuilds;
    expect(rebuilds).toBeGreaterThanOrEqual(20);
    expect(rebuilds).toBeLessThanOrEqual(35);
    expect(result.after.churches[index]).toMatchObject({
      chainAttached: true,
      chainEnabled: true,
      chainVisible: true,
    });
    expect(result.after.churches[index].chainLinkCount).toBeGreaterThanOrEqual(42);
    expect(result.after.churches[index].chainLinkCount).toBeLessThanOrEqual(448);
    expect(result.after.churches[index].chainLinkSpacing).toBeLessThanOrEqual(0.4);
  }
});

test("a chain whose Bell Ringer endpoint is below the screen continues cleanly through the viewport edge", async ({ page }) => {
  await startHunt(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    game.startWaveNow(10);
    game.clearEnemies();
    game.setBellRingerAiEnabled(false);
    const initial = game.getBellRingerDiagnostics();
    game.setPlayerPosition(initial.bossPosition.x, initial.bossPosition.z - 58);
    window.advanceTime(3000);
    return {
      boss: game.getBellRingerDiagnostics(),
      camera: JSON.parse(window.render_game_to_text()).camera,
    };
  });

  expect(result.boss.bossPosition.z).toBeGreaterThan(result.camera.visibleGround.maxZ + 25);
  const crossingChains = result.boss.churches.filter((church) => church.chainVisible && church.chainLinkCount > 0);
  expect(crossingChains.length).toBeGreaterThan(0);
  for (const church of crossingChains) {
    expect(church.chainVisibleStart).toBe(0);
    expect(church.chainLinkSpacing).toBeLessThanOrEqual(0.4);
  }
});

test("Bell Ringer starts twice as fast, gains five percent each minute, and drives its gait from actual distance", async ({ page }) => {
  await startHunt(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    game.startWaveNow(10);
    game.clearEnemies();
    game.setBellRingerAiEnabled(false);
    const initial = game.getBellRingerDiagnostics();
    const atFiftyNine = game.setBellRingerElapsedSeconds(59.9);
    const atSixty = game.setBellRingerElapsedSeconds(60.1);
    const atOneTwenty = game.setBellRingerElapsedSeconds(120.1);
    const targetX = atOneTwenty.bossPosition.x < 0
      ? atOneTwenty.bossPosition.x + 14
      : atOneTwenty.bossPosition.x - 14;
    game.setPlayerPosition(targetX, atOneTwenty.bossPosition.z);
    const beforeMove = game.getBellRingerDiagnostics();
    const gaitSamples = [];
    for (let sample = 0; sample < 6; sample += 1) gaitSamples.push(game.advanceBellRingerAction(50));
    const afterMove = gaitSamples[gaitSamples.length - 1];
    const maxHipSpread = Math.max(...gaitSamples.map((frame) => Math.abs(frame.model.leftHipPitch - frame.model.rightHipPitch)));
    return { initial, atFiftyNine, atSixty, atOneTwenty, beforeMove, afterMove, maxHipSpread };
  });

  expect(result.initial.speed).toMatchObject({
    base: 3.1,
    minuteStage: 0,
    multiplier: 1,
    offscreenMultiplier: 1,
    finalPhaseMultiplier: 1,
  });
  expect(result.initial.attacks).toMatchObject({
    sweepDamage: 176,
    chargeDamage: 224,
    groundSlamDamage: 208,
    bellDropDamage: 240,
    chargeLength: 30,
    groundSlamLength: 17,
  });
  expect(result.atFiftyNine.speed).toMatchObject({ minuteStage: 0, multiplier: 1 });
  expect(result.atSixty.speed.minuteStage).toBe(1);
  expect(result.atSixty.speed.multiplier).toBeCloseTo(1.05, 6);
  expect(result.atOneTwenty.speed.minuteStage).toBe(2);
  expect(result.atOneTwenty.speed.multiplier).toBeCloseTo(1.1025, 6);
  expect(result.atOneTwenty.speed.effective).toBeCloseTo(3.4178, 4);
  expect(result.atOneTwenty.attacks.chargeDuration).toBeCloseTo(1.3152, 4);
  expect(Math.hypot(
    result.afterMove.bossPosition.x - result.beforeMove.bossPosition.x,
    result.afterMove.bossPosition.z - result.beforeMove.bossPosition.z
  )).toBeGreaterThan(0.9);
  expect(result.afterMove.model.walkPhase - result.beforeMove.model.walkPhase).toBeGreaterThan(2);
  expect(result.afterMove.model.moveAmount).toBeGreaterThan(0.8);
  expect(result.maxHipSpread).toBeGreaterThan(0.5);
});

test("Bell Ringer gains forty percent speed outside every player view and routes around a blocking building", async ({ page }) => {
  await startHunt(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    game.startWaveNow(10);
    game.clearEnemies();
    game.setBellRingerAiEnabled(false);
    const boss = game.getBellRingerDiagnostics();
    const visiblePlayerX = boss.bossPosition.x < 0
      ? boss.bossPosition.x + 12
      : boss.bossPosition.x - 12;
    game.setPlayerPosition(visiblePlayerX, boss.bossPosition.z);
    const visible = game.advanceBellRingerAction(20);

    const offscreenPlayerX = boss.bossPosition.x < 0
      ? boss.bossPosition.x + 90
      : boss.bossPosition.x - 90;
    game.setPlayerPosition(offscreenPlayerX, boss.bossPosition.z);
    const offscreen = game.advanceBellRingerAction(20);

    const scenario = game.configureBellRingerNavigationTest();
    const before = game.getBellRingerDiagnostics();
    const samples = [];
    for (let sample = 0; sample < 24; sample += 1) samples.push(game.advanceBellRingerAction(50));
    const after = samples[samples.length - 1];
    return { visible, offscreen, scenario, before, samples, after };
  });

  expect(result.visible.speed).toMatchObject({ outsideAllPlayerViews: false, offscreenMultiplier: 1 });
  expect(result.offscreen.speed).toMatchObject({ outsideAllPlayerViews: true, offscreenMultiplier: 1.4 });
  expect(result.offscreen.speed.effective / result.visible.speed.effective).toBeCloseTo(1.4, 3);

  expect(result.scenario).toBeTruthy();
  expect(result.scenario.obstacle.type).toMatch(/^building:/);
  expect(result.samples.some((sample) => sample.navigation.navigating)).toBe(true);
  const lateralMovement = result.scenario.axis === "x"
    ? Math.abs(result.after.bossPosition.z - result.before.bossPosition.z)
    : Math.abs(result.after.bossPosition.x - result.before.bossPosition.x);
  expect(lateralMovement).toBeGreaterThan(0.45);
  expect(Math.hypot(
    result.after.bossPosition.x - result.scenario.player.x,
    result.after.bossPosition.z - result.scenario.player.z
  )).toBeLessThan(Math.hypot(
    result.before.bossPosition.x - result.scenario.player.x,
    result.before.bossPosition.z - result.scenario.player.z
  ));
});

test("a telegraphed cathedral bell falls on every player no later than once per minute and remains dodgeable", async ({ page }) => {
  await startHunt(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    game.startWaveNow(10);
    game.clearEnemies();
    game.setBellRingerAiEnabled(false);
    const initial = game.getBellRingerDiagnostics();
    const hpBefore = game.setPlayerHp(100).hp;
    const forced = game.forceBellRingerBellDrop();
    const target = forced.bellDrop.drops[0];
    game.setPlayerPosition(target.x + forced.attacks.bellDropRadius + 5, target.z);
    const afterImpact = game.advanceBellRingerBellDrops((forced.attacks.bellDropWarning + 0.1) * 1000);
    const hpAfter = JSON.parse(window.render_game_to_text()).player.hp;
    const cleared = game.advanceBellRingerBellDrops(1000);
    return { initial, hpBefore, forced, afterImpact, hpAfter, cleared };
  });

  expect(result.initial.bellDrop.nextIn).toBeGreaterThanOrEqual(24);
  expect(result.initial.bellDrop.nextIn).toBeLessThanOrEqual(42);
  expect(result.initial.bellDrop.maximumInterval).toBeLessThanOrEqual(60);
  expect(result.forced.bellDrop).toMatchObject({ sequence: 1, activeCount: 1 });
  expect(result.forced.bellDrop.drops[0]).toMatchObject({
    impacted: false,
    visualAttached: true,
  });
  expect(result.forced.bellDrop.drops[0].bellHeight).toBeGreaterThan(13);
  expect(result.afterImpact.bellDrop.drops[0].impacted).toBe(true);
  expect(result.hpAfter).toBe(result.hpBefore);
  expect(result.cleared.bellDrop.activeCount).toBe(0);
});

test("the circular sweep animates through a full turn and can hit a player behind the Bell Ringer", async ({ page }) => {
  await startHunt(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    game.startWaveNow(10);
    game.clearEnemies();
    game.setBellRingerAiEnabled(false);
    const boss = game.getBellRingerDiagnostics();
    game.setPlayerPosition(boss.bossPosition.x, boss.bossPosition.z + 4.2);
    game.setPlayerMaxHp(300, 300);
    const windup = game.forceBellRingerAction("sweep");
    game.advanceBellRingerAction(730);
    const angle = game.getBellRingerDiagnostics().bossFacing;
    game.setPlayerPosition(
      boss.bossPosition.x - Math.sin(angle) * 4.2,
      boss.bossPosition.z - Math.cos(angle) * 4.2
    );
    game.setPlayerMaxHp(300, 300);
    const spinning = game.advanceBellRingerAction(270);
    const afterImpact = game.advanceBellRingerAction(270);
    return {
      windup,
      spinning,
      afterImpact,
      player: JSON.parse(window.render_game_to_text()).player,
    };
  });

  expect(result.windup).toMatchObject({ action: "sweepWindup", model: { sweepTelegraphVisible: true } });
  expect(result.spinning.action).toBe("sweepRecover");
  expect(result.spinning.actionProgress).toBeLessThan(0.48);
  expect(Math.abs(result.spinning.model.rigYaw)).toBeGreaterThan(0.6);
  expect(result.spinning.model.sweepTelegraphVisible).toBe(true);
  expect(result.afterImpact.actionProgress).toBeGreaterThanOrEqual(0.48);
  expect(result.afterImpact.model.sweepTelegraphVisible).toBe(false);
  expect(result.player.hp).toBe(210);
});

test("the directional ground smash has a readable animated windup and deals its doubled damage only inside the lane", async ({ page }) => {
  await startHunt(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    game.startWaveNow(10);
    game.clearEnemies();
    game.setBellRingerAiEnabled(false);
    const boss = game.getBellRingerDiagnostics();
    game.setPlayerPosition(boss.bossPosition.x, boss.bossPosition.z + 10);
    game.setPlayerMaxHp(300, 300);
    const windup = game.forceBellRingerAction("groundSlam");
    const hoist = game.advanceBellRingerAction(600);
    const impact = game.advanceBellRingerAction(330);
    const playerAfterHit = JSON.parse(window.render_game_to_text()).player;

    game.startWaveNow(10);
    game.clearEnemies();
    game.setBellRingerAiEnabled(false);
    const secondBoss = game.getBellRingerDiagnostics();
    game.setPlayerPosition(secondBoss.bossPosition.x, secondBoss.bossPosition.z + 10);
    game.setPlayerMaxHp(300, 300);
    const secondWindup = game.forceBellRingerAction("groundSlam");
    const forwardX = Math.sin(secondWindup.bossFacing);
    const forwardZ = Math.cos(secondWindup.bossFacing);
    game.setPlayerPosition(
      secondBoss.bossPosition.x + forwardX * 10 + forwardZ * 9,
      secondBoss.bossPosition.z + forwardZ * 10 - forwardX * 9
    );
    game.setPlayerMaxHp(300, 300);
    game.advanceBellRingerAction(930);
    const playerOutsideLane = JSON.parse(window.render_game_to_text()).player;
    return { windup, hoist, impact, playerAfterHit, playerOutsideLane };
  });

  expect(result.windup).toMatchObject({
    action: "groundSlam",
    attacks: { groundSlamDamage: 208, groundSlamLength: 17, groundSlamWidth: 7.2 },
    model: { groundSlamTelegraphVisible: true },
  });
  expect(result.hoist.actionProgress).toBeGreaterThan(0.35);
  expect(result.hoist.actionProgress).toBeLessThan(0.58);
  expect(result.hoist.model.rigY).toBeLessThan(-0.2);
  expect(result.hoist.model.rightArmPitch).toBeLessThan(-1.4);
  expect(result.impact.actionProgress).toBeGreaterThanOrEqual(0.58);
  expect(result.impact.model.groundSlamTelegraphVisible).toBe(false);
  expect(result.playerAfterHit.hp).toBe(210);
  expect(result.playerOutsideLane.hp).toBe(300);
});

test("every damaging Bell Ringer attack is capped at thirty percent of the target's maximum health", async ({ page }) => {
  await startHunt(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    game.startWaveNow(10);
    game.clearEnemies();
    game.setBellRingerAiEnabled(false);

    game.setPlayerMaxHp(100, 100);
    game.forceBellRingerAction("ascension");
    const ascent = game.getBellRingerDiagnostics();
    game.setPlayerPosition(ascent.ascension.targetX, ascent.ascension.targetZ);
    game.advanceBellRingerAction(3400);
    const landing = game.getPlayerHealth();

    game.setPlayerMaxHp(100, 100);
    game.forceBellRingerAction("frenzy");
    game.advanceBellRingerAction(1900);
    const directStrike = game.getPlayerHealth();

    game.setPlayerMaxHp(100, 100);
    const beforeCharge = game.getBellRingerDiagnostics();
    game.setPlayerPosition(beforeCharge.bossPosition.x + 4.5, beforeCharge.bossPosition.z);
    game.forceBellRingerAction("charge");
    game.advanceBellRingerAction(2600);
    const charge = game.getPlayerHealth();

    game.setPlayerMaxHp(100, 100);
    const beforeSweep = game.getBellRingerDiagnostics();
    game.setPlayerPosition(beforeSweep.bossPosition.x, beforeSweep.bossPosition.z + 4.2);
    game.forceBellRingerAction("sweep");
    game.advanceBellRingerAction(1270);
    const sweep = game.getPlayerHealth();

    game.setPlayerMaxHp(100, 100);
    const beforeSlam = game.getBellRingerDiagnostics();
    game.setPlayerPosition(beforeSlam.bossPosition.x, beforeSlam.bossPosition.z + 10);
    game.forceBellRingerAction("groundSlam");
    game.advanceBellRingerAction(930);
    const groundSlam = game.getPlayerHealth();

    game.setPlayerMaxHp(100, 100);
    const forcedBell = game.forceBellRingerBellDrop();
    const bellTarget = forcedBell.bellDrop.drops[0];
    game.setPlayerPosition(bellTarget.x, bellTarget.z);
    game.advanceBellRingerBellDrops((forcedBell.attacks.bellDropWarning + 0.1) * 1000);
    const bellDrop = game.getPlayerHealth();

    return {
      landing,
      directStrike,
      charge,
      sweep,
      groundSlam,
      bellDrop,
      attacks: game.getBellRingerDiagnostics().attacks,
    };
  });

  expect(result.landing).toEqual({ hp: 70, maxHp: 100 });
  expect(result.directStrike).toEqual({ hp: 70, maxHp: 100 });
  expect(result.charge).toEqual({ hp: 70, maxHp: 100 });
  expect(result.sweep).toEqual({ hp: 70, maxHp: 100 });
  expect(result.groundSlam).toEqual({ hp: 70, maxHp: 100 });
  expect(result.bellDrop).toEqual({ hp: 70, maxHp: 100 });
  expect(result.attacks.heavyHitMaxHpRatio).toBe(0.3);
});

test("the host caps a Bell Ringer hit for every player and replicates the surviving health exactly", async ({ page }) => {
  await startHunt(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const multiplayer = window.__dustMultiplayerTest;
    multiplayer.startMockHost(["Host", "Guest"]);
    game.startWaveNow(10, "bellRinger");
    game.clearEnemies();
    game.setBellRingerAiEnabled(false);
    const boss = game.getBellRingerDiagnostics();
    multiplayer.setPlayerPosition("mock-player-1", boss.bossPosition.x, boss.bossPosition.z + 4.2);
    multiplayer.setPlayerPosition("mock-player-2", boss.bossPosition.x, boss.bossPosition.z - 4.2);
    multiplayer.setHealth("mock-player-1", 120);
    multiplayer.setHealth("mock-player-2", 120);
    game.forceBellRingerAction("sweep");
    game.advanceBellRingerAction(1270);
    const hostPlayers = multiplayer.getState().players.map((player) => ({
      id: player.id,
      hp: player.hp,
      alive: player.alive,
    }));
    const wire = JSON.parse(JSON.stringify(
      multiplayer.buildWireSnapshot(false, false, "mock-player-2")
    ));

    multiplayer.startMockGuest(["Host", "Guest"], 1);
    multiplayer.applySnapshot(wire);
    window.advanceTime(17);
    const guestPlayers = multiplayer.getState().players.map((player) => ({
      id: player.id,
      hp: player.hp,
      alive: player.alive,
    }));
    return { hostPlayers, guestPlayers };
  });

  expect(result.hostPlayers).toEqual([
    { id: "mock-player-1", hp: 84, alive: true },
    { id: "mock-player-2", hp: 84, alive: true },
  ]);
  expect(result.guestPlayers).toEqual(result.hostPlayers);
});

test("the doubled charge lane has a distinct brace and running pose", async ({ page }) => {
  await startHunt(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    game.startWaveNow(10);
    game.clearEnemies();
    game.setBellRingerAiEnabled(false);
    const boss = game.getBellRingerDiagnostics();
    const targetX = boss.bossPosition.x < 0 ? boss.bossPosition.x + 36 : boss.bossPosition.x - 36;
    game.setPlayerPosition(targetX, boss.bossPosition.z);
    const start = game.forceBellRingerAction("charge");
    const braced = game.advanceBellRingerAction(525);
    game.advanceBellRingerAction(550);
    const running = game.advanceBellRingerAction(300);
    return { start, braced, running };
  });

  expect(result.start).toMatchObject({
    action: "chargeWindup",
    attacks: { chargeDamage: 224, chargeLength: 30 },
    model: { chargeTelegraphVisible: true },
  });
  expect(result.braced.model.rigY).toBeLessThan(-0.15);
  expect(result.braced.model.rigPitch).toBeGreaterThan(0.05);
  expect(result.running.action).toBe("charge");
  expect(result.running.model.chargeTelegraphVisible).toBe(false);
  expect(result.running.model.rigPitch).toBeCloseTo(-0.22, 2);
  expect(result.running.model.moveAmount).toBeGreaterThan(0.9);
  expect(Math.hypot(
    result.running.bossPosition.x - result.start.bossPosition.x,
    result.running.bossPosition.z - result.start.bossPosition.z
  )).toBeGreaterThan(3);
});

test("the ground-smash action round-trips through the compact boss packet without growing it", async ({ page }) => {
  await startHunt(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const multiplayer = window.__dustMultiplayerTest;
    multiplayer.startMockHost(["Host", "Guest"]);
    game.startWaveNow(10);
    game.clearEnemies();
    game.setBellRingerAiEnabled(false);
    game.forceBellRingerAction("groundSlam");
    const wire = JSON.parse(JSON.stringify(multiplayer.buildWireSnapshot(false, false, "mock-player-2")));
    const decoded = multiplayer.decodeBossState(wire.bossState);
    multiplayer.startMockGuest(["Host", "Guest"], 1);
    multiplayer.applySnapshot(wire);
    window.advanceTime(17);
    const guest = game.getBellRingerDiagnostics();
    return { version: wire.version, bossBytes: wire.bossState.length, decoded, guest };
  });

  expect(result.version).toBe(47);
  expect(result.bossBytes).toBeLessThan(160);
  expect(result.decoded).toMatchObject({ action: "groundSlam", actionSeq: 1 });
  expect(result.decoded.actionTimeLeft).toBeCloseTo(1.55, 1);
  expect(result.guest).toMatchObject({
    replica: true,
    action: "groundSlam",
    actionSequence: 1,
    model: { groundSlamTelegraphVisible: true },
  });
});

test("the Bell Ringer replica turns 15 Hz movement snapshots into even displayed motion", async ({ page }) => {
  await startHunt(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const multiplayer = window.__dustMultiplayerTest;
    const clone = (value) => JSON.parse(JSON.stringify(value));

    multiplayer.startMockHost(["Host", "Guest"]);
    game.startWaveNow(10, "bellRinger");
    game.clearEnemies();
    game.setBellRingerAiEnabled(false);
    const scenario = game.configureBellRingerNavigationTest();
    const wires = [];
    const hostPositions = [];
    for (let sample = 0; sample < 12; sample += 1) {
      game.advanceBellRingerAction(67);
      hostPositions.push(game.getBellRingerDiagnostics().bossPosition);
      wires.push(clone(multiplayer.buildWireSnapshot(false, false, "mock-player-2")));
    }

    multiplayer.startMockGuest(["Host", "Guest"], 1);
    const frames = [];
    for (let sample = 0; sample < wires.length; sample += 1) {
      multiplayer.applySnapshot(wires[sample]);
      for (let subframe = 0; subframe < 4; subframe += 1) {
        window.advanceTime(1000 / 60);
        const position = game.getBellRingerDiagnostics().bossPosition;
        frames.push({ sample, subframe, x: position.x, z: position.z });
      }
    }

    const steps = [];
    for (let index = 1; index < frames.length; index += 1) {
      steps.push({
        distance: Math.hypot(frames[index].x - frames[index - 1].x, frames[index].z - frames[index - 1].z),
        boundary: frames[index].subframe === 0,
      });
    }
    // Ignore the one-sample warm-up. Before the second authoritative position
    // arrives there is intentionally no velocity to extrapolate.
    const steadySteps = steps.slice(7);
    const distances = steadySteps.map((step) => step.distance);
    const mean = distances.reduce((total, distance) => total + distance, 0) / distances.length;
    const deviation = Math.sqrt(
      distances.reduce((total, distance) => total + (distance - mean) ** 2, 0) / distances.length
    );
    const boundarySteps = steadySteps.filter((step) => step.boundary);
    const insideSteps = steadySteps.filter((step) => !step.boundary);
    const boundaryMean = boundarySteps.reduce((total, step) => total + step.distance, 0) / boundarySteps.length;
    const insideMean = insideSteps.reduce((total, step) => total + step.distance, 0) / insideSteps.length;
    const firstHost = hostPositions[0];
    const lastHost = hostPositions[hostPositions.length - 1];
    const firstGuest = frames[0];
    const lastGuest = frames[frames.length - 1];
    const packedBossBytes = wires.map((wire) => (
      Uint8Array.from(atob(wire.bossState), (character) => character.charCodeAt(0)).length
    ));
    return {
      scenario,
      hostTravel: Math.hypot(lastHost.x - firstHost.x, lastHost.z - firstHost.z),
      guestTravel: Math.hypot(lastGuest.x - firstGuest.x, lastGuest.z - firstGuest.z),
      coefficientOfVariation: deviation / mean,
      packetBoundaryRatio: boundaryMean / insideMean,
      minimumStep: Math.min(...distances),
      maximumStep: Math.max(...distances),
      maximumBossBytes: Math.max(...packedBossBytes),
    };
  });

  expect(result.scenario).toBeTruthy();
  expect(result.hostTravel).toBeGreaterThan(2);
  expect(result.guestTravel).toBeGreaterThan(1.8);
  expect(result.coefficientOfVariation).toBeLessThan(0.18);
  expect(result.packetBoundaryRatio).toBeGreaterThan(0.72);
  expect(result.packetBoundaryRatio).toBeLessThan(1.3);
  expect(result.minimumStep).toBeGreaterThan(0.02);
  expect(result.maximumStep).toBeLessThan(0.085);
  expect(result.maximumBossBytes).toBeLessThanOrEqual(64);
});

test("a live wave transition keeps the Bell Ringer arrival while a mid-fight late join stays silent", async ({ page }) => {
  await startHunt(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const multiplayer = window.__dustMultiplayerTest;
    const clone = (value) => JSON.parse(JSON.stringify(value));
    const effects = () => {
      const diagnostics = game.getThreeObjectDiagnostics();
      return {
        shockwaves: diagnostics.state.shockwaves,
        lightFlashes: diagnostics.state.lightFlashes,
        effectObjects: diagnostics.roots.effectRoot.objects,
      };
    };

    // An already-connected guest has an authoritative wave-9 snapshot before
    // the host enters wave 10, so the arrival presentation belongs on screen.
    multiplayer.startMockHost(["Host", "Guest"]);
    game.forceWaveState(9, 0, 0);
    const waveNine = clone(multiplayer.buildWireSnapshot(false, false, "mock-player-2"));
    game.forceWaveState(10, 0, 0, "bellRinger");
    game.setBellRingerAiEnabled(false);
    window.advanceTime(1000);
    const liveTransition = clone(multiplayer.buildWireSnapshot(false, false, "mock-player-2"));

    multiplayer.startMockGuest(["Host", "Guest"], 1);
    multiplayer.applySnapshot(waveNine);
    const liveBefore = effects();
    multiplayer.applySnapshot(liveTransition);
    const liveAfter = effects();
    const liveBoss = game.getBellRingerDiagnostics();

    // Let the temporary arrival effects retire, then simulate a fresh client
    // whose very first authoritative snapshot is already inside the boss fight.
    window.advanceTime(1000);
    multiplayer.startMockHost(["Host", "Guest"]);
    game.forceWaveState(10, 0, 0, "bellRinger");
    game.setBellRingerAiEnabled(false);
    window.advanceTime(1000);
    const midFight = clone(multiplayer.buildWireSnapshot(false, false, "mock-player-2"));
    multiplayer.startMockGuest(["Host", "Guest"], 1);
    const lateBefore = effects();
    multiplayer.applySnapshot(midFight);
    const lateAfter = effects();
    const lateBoss = game.getBellRingerDiagnostics();

    return {
      liveBefore,
      liveAfter,
      liveBoss,
      lateBefore,
      lateAfter,
      lateBoss,
      liveBossBytes: Uint8Array.from(atob(liveTransition.bossState), (character) => character.charCodeAt(0)).length,
      lateBossBytes: Uint8Array.from(atob(midFight.bossState), (character) => character.charCodeAt(0)).length,
    };
  });

  expect(result.liveBoss).toMatchObject({ active: true, replica: true });
  expect(result.liveAfter.shockwaves - result.liveBefore.shockwaves).toBe(1);
  expect(result.liveAfter.lightFlashes - result.liveBefore.lightFlashes).toBe(1);
  expect(result.lateBoss).toMatchObject({ active: true, replica: true });
  expect(result.lateAfter.shockwaves).toBe(result.lateBefore.shockwaves);
  expect(result.lateAfter.lightFlashes).toBe(result.lateBefore.lightFlashes);
  expect(result.liveBossBytes).toBeLessThanOrEqual(64);
  expect(result.lateBossBytes).toBeLessThanOrEqual(64);
});

test("after the first health section the Bell Ringer retargets through a holy ascension every thirty seconds", async ({ page }) => {
  await startHunt(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const multiplayer = window.__dustMultiplayerTest;
    multiplayer.startMockHost(["Host", "Guest", "Third"]);
    game.startWaveNow(10);
    game.clearEnemies();
    game.setBellRingerAiEnabled(false);
    game.setPlayerMaxHp(9999, 9999);

    const players = multiplayer.getState().players;
    multiplayer.setPlayerPosition(players[0].id, -34, -18);
    multiplayer.setPlayerPosition(players[1].id, 32, -12);
    multiplayer.setPlayerPosition(players[2].id, 4, 34);

    game.setBellRingerAscensionTimer(0);
    const beforeFirstSection = game.advanceBellRingerAction(17);
    for (let church = 0; church < 3; church += 1) game.completeBellChurchCapture(church);
    game.damageBellRinger(beforeFirstSection.maxHp * 10);
    game.advanceBellRingerAction(17);
    const ordinaryTarget = game.getBellRingerDiagnostics().targetPlayerId;

    game.setBellRingerAscensionTimer(0);
    const ascending = game.advanceBellRingerAction(17);
    const retargetedPlayer = multiplayer.getState().players.find((player) => player.id === ascending.targetPlayerId);
    const falling = game.advanceBellRingerAction(920);
    const wire = JSON.parse(JSON.stringify(multiplayer.buildWireSnapshot(false, false, players[1].id)));
    const decoded = multiplayer.decodeBossState(wire.bossState);

    multiplayer.startMockGuest(["Host", "Guest", "Third"], 1);
    multiplayer.applySnapshot(wire);
    window.advanceTime(17);
    const guest = game.getBellRingerDiagnostics();
    return { beforeFirstSection, ordinaryTarget, ascending, retargetedPlayer, falling, decoded, guest, bossBytes: wire.bossState.length };
  });

  expect(result.beforeFirstSection).toMatchObject({ phase: 0, action: "idle", ascension: { enabled: false } });
  expect(result.ascending).toMatchObject({
    phase: 1,
    action: "ascend",
    ascension: { enabled: true, airborne: true, interval: 30 },
    model: { ascensionVisualVisible: true, holyRayCount: 6 },
  });
  expect(result.ascending.ascension.nextIn).toBeGreaterThan(29.9);
  expect(result.ascending.targetPlayerId).not.toBe(result.ordinaryTarget);
  expect(result.retargetedPlayer).toBeTruthy();
  expect(result.falling).toMatchObject({
    action: "heavenDrop",
    ascension: { airborne: true },
    model: { ascensionVisualVisible: true },
  });
  expect(result.falling.model.rigY).toBeGreaterThan(18);
  expect(Math.hypot(
    result.falling.bossPosition.x - result.retargetedPlayer.x,
    result.falling.bossPosition.z - result.retargetedPlayer.z
  )).toBeLessThan(5);
  expect(result.decoded).toMatchObject({ action: "heavenDrop", phase: 1 });
  expect(result.guest).toMatchObject({
    replica: true,
    action: "heavenDrop",
    ascension: { airborne: true },
    model: { ascensionVisualVisible: true, holyRayCount: 6 },
  });
  expect(result.bossBytes).toBeLessThan(160);
});

test("the last two sections escalate attack and bell rates while the final section resists forty percent damage", async ({ page }) => {
  await startHunt(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    game.startWaveNow(10);
    game.clearEnemies();
    game.setBellRingerAiEnabled(false);
    const maxHp = game.getBellRingerDiagnostics().maxHp;
    const reachNextPhase = () => {
      for (let church = 0; church < 3; church += 1) game.completeBellChurchCapture(church);
      game.damageBellRinger(maxHp * 10);
      return game.getBellRingerDiagnostics();
    };
    const phase1 = reachNextPhase();
    const phase2 = reachNextPhase();
    const phase3Shielded = reachNextPhase();
    for (let church = 0; church < 3; church += 1) game.completeBellChurchCapture(church);
    const finalBeforeHit = game.getBellRingerDiagnostics();
    const applied = game.damageBellRinger(10);
    const finalAfterHit = game.getBellRingerDiagnostics();
    return { phase1, phase2, phase3Shielded, finalBeforeHit, applied, finalAfterHit };
  });

  expect(result.phase1.attacks.attackRateMultiplier).toBe(1);
  expect(result.phase1.bellDrop.rateMultiplier).toBe(1);
  expect(result.phase2.attacks.attackRateMultiplier).toBe(1.2);
  expect(result.phase2.bellDrop.rateMultiplier).toBe(1.4);
  expect(result.phase3Shielded.attacks.attackRateMultiplier).toBe(1.5);
  expect(result.phase3Shielded.bellDrop.rateMultiplier).toBe(2);
  expect(result.finalBeforeHit.damageResistance).toBe(0.4);
  expect(result.applied).toBeCloseTo(6, 5);
  expect(result.finalBeforeHit.hp - result.finalAfterHit.hp).toBeCloseTo(6, 5);
  expect(result.finalAfterHit.lastDamage).toMatchObject({ raw: 10, afterResistance: 6, applied: 6, resistance: 0.4 });
});

test("at ten percent health the Bell Ringer alternates players with rapid direct strikes and drops bells every seven seconds", async ({ page }) => {
  await startHunt(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const multiplayer = window.__dustMultiplayerTest;
    multiplayer.startMockHost(["Host", "Guest", "Third"]);
    game.startWaveNow(10);
    game.clearEnemies();
    game.setBellRingerAiEnabled(false);
    const players = multiplayer.getState().players;
    multiplayer.setPlayerPosition(players[0].id, -34, -22);
    multiplayer.setPlayerPosition(players[1].id, 35, -18);
    multiplayer.setPlayerPosition(players[2].id, 6, 38);

    const maxHp = game.getBellRingerDiagnostics().maxHp;
    for (let phase = 0; phase < 3; phase += 1) {
      for (let church = 0; church < 3; church += 1) game.completeBellChurchCapture(church);
      game.damageBellRinger(maxHp * 10);
    }
    for (let church = 0; church < 3; church += 1) game.completeBellChurchCapture(church);
    const vulnerable = game.getBellRingerDiagnostics();
    const rawToTenPercent = (vulnerable.hp - maxHp * 0.1) / (1 - vulnerable.damageResistance);
    game.damageBellRinger(rawToTenPercent);
    const threshold = game.getBellRingerDiagnostics();
    game.forceBellRingerBellDrop();
    const bells = game.getBellRingerDiagnostics();

    const firstDash = game.advanceBellRingerAction(17);
    const firstTarget = firstDash.targetPlayerId;
    const firstSequence = firstDash.actionSequence;
    let windup = firstDash;
    for (let step = 0; step < 40 && windup.action === "frenzyDash"; step += 1) windup = game.advanceBellRingerAction(17);
    const wire = JSON.parse(JSON.stringify(multiplayer.buildWireSnapshot(false, false, players[1].id)));
    const decoded = multiplayer.decodeBossState(wire.bossState);

    let nextDash = windup;
    for (let step = 0; step < 140 && nextDash.actionSequence === firstSequence; step += 1) nextDash = game.advanceBellRingerAction(17);
    return { threshold, bells, firstDash, windup, decoded, nextDash, bossBytes: wire.bossState.length };
  });

  expect(result.threshold).toMatchObject({
    phase: 3,
    shielded: false,
    hpRatio: 0.1,
    damageResistance: 0.9,
    lastStand: { active: true, threshold: 0.1, damageResistance: 0.9, bellInterval: 7, directStrikeWindup: 1.32 },
    model: { frenzyAuraVisible: true },
  });
  expect(result.threshold.bellDrop.nextIn).toBeLessThanOrEqual(7);
  expect(result.bells.bellDrop).toMatchObject({ rateMultiplier: 2, minimumInterval: 7, maximumInterval: 7, nextIn: 7 });
  expect(result.firstDash.action).toBe("frenzyDash");
  expect(result.windup).toMatchObject({
    action: "frenzyStrikeWindup",
    actionDuration: 1.32,
    model: { directStrikeTelegraphVisible: true, frenzyAuraVisible: true },
  });
  expect(result.decoded).toMatchObject({ action: "frenzyStrikeWindup", phase: 3 });
  expect(result.nextDash.actionSequence).toBeGreaterThan(result.firstDash.actionSequence);
  expect(result.nextDash.targetPlayerId).not.toBe(result.firstDash.targetPlayerId);
  expect(result.nextDash.action).toBe("frenzyDash");
  expect(result.bossBytes).toBeLessThan(160);
});

test("three short shield phases preserve their health while the final unshielded phase equals all three combined", async ({ page }) => {
  await startHunt(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    game.startWaveNow(10);
    game.setBellRingerAiEnabled(false);

    const initial = game.getBellRingerDiagnostics();
    game.damageBellRinger(initial.maxHp * 10);
    const blockedByShield = game.getBellRingerDiagnostics();

    const captureCycle = () => {
      const steps = [];
      for (let index = 0; index < 3; index += 1) {
        game.completeBellChurchCapture(index);
        steps.push(game.getBellRingerDiagnostics());
      }
      return steps;
    };

    const firstCaptures = captureCycle();
    const vulnerableAtFullHp = game.getBellRingerDiagnostics();
    game.damageBellRinger(initial.maxHp * 10);
    const threshold75 = game.getBellRingerDiagnostics();

    const secondCaptures = captureCycle();
    game.damageBellRinger(initial.maxHp * 10);
    const threshold50 = game.getBellRingerDiagnostics();

    const thirdCaptures = captureCycle();
    game.damageBellRinger(initial.maxHp * 10);
    const threshold25 = game.getBellRingerDiagnostics();

    const finalCaptures = captureCycle();
    game.damageBellRinger(initial.maxHp * 10);
    const defeated = game.getBellRingerDiagnostics();

    return {
      initial,
      blockedByShield,
      firstCaptures,
      vulnerableAtFullHp,
      threshold75,
      secondCaptures,
      threshold50,
      thirdCaptures,
      threshold25,
      finalCaptures,
      defeated,
    };
  });

  expect(result.blockedByShield.hp).toBe(result.initial.maxHp);
  expect(result.blockedByShield.shielded).toBe(true);

  for (const captures of [
    result.firstCaptures,
    result.secondCaptures,
    result.thirdCaptures,
    result.finalCaptures,
  ]) {
    expect(captures).toHaveLength(3);
    expect(captures[0].shielded).toBe(true);
    expect(captures[1].shielded).toBe(true);
    expect(captures[2].shielded).toBe(false);
    expect(captures.map((state) => state.churches.filter((church) => church.active).length)).toEqual([2, 1, 0]);
  }

  expect(result.vulnerableAtFullHp).toMatchObject({
    active: true,
    shielded: false,
    hpRatio: 1,
  });

  const thresholds = [result.threshold75, result.threshold50, result.threshold25];
  const expectedRatios = [5 / 6, 4 / 6, 3 / 6];
  thresholds.forEach((state, index) => {
    expect(state.active).toBe(true);
    expect(state.shielded).toBe(true);
    // Three decimals, not five: the diagnostics report hp rounded to four, and
    // a phase floor of five sixths of the pool is only exact when the pool
    // divides by six. It did while the boss had 252 health.
    expect(state.hp).toBeCloseTo(result.initial.maxHp * expectedRatios[index], 3);
    expect(state.hpRatio).toBeCloseTo(expectedRatios[index], 3);
    expect(state.hud).toMatchObject({ visible: true });
    expect(state.hud.hpRatio).toBeCloseTo(expectedRatios[index], 3);
    expectThreeResetChurches(state.churches);
  });
  expect(result.threshold50.phase).toBeGreaterThan(result.threshold75.phase);
  expect(result.threshold25.phase).toBeGreaterThan(result.threshold50.phase);
  expect(result.initial.maxHp).toBe(328);
  expect(result.finalCaptures[2].hp).toBeCloseTo(result.initial.maxHp / 2, 5);
  expect(result.initial.maxHp - result.threshold25.hp).toBeCloseTo(result.finalCaptures[2].hp, 5);
  expect(result.threshold25.speed.finalPhaseMultiplier).toBe(1);
  expect(result.threshold25.speed.finalExtraMultiplier).toBe(1);
  expect(result.finalCaptures[2].speed.finalPhaseMultiplier).toBe(1.6);
  expect(result.finalCaptures[2].speed.finalExtraMultiplier).toBe(1.17);
  expect(result.finalCaptures[2].speed.finaleCombinedMultiplier).toBe(1.872);
  expect(result.finalCaptures[2].speed.effective / result.threshold25.speed.effective).toBeCloseTo(1.872, 3);
  expect(result.finalCaptures[2].attacks.attackRateMultiplier).toBe(1.5);
  expect(result.finalCaptures[2].bellDrop.rateMultiplier).toBe(2);

  expect(result.defeated).toMatchObject({
    active: false,
    shielded: false,
    hp: 0,
    hpRatio: 0,
  });
  expect(result.defeated.hud.visible).toBe(false);
  await expect(page.locator("#boss-hud")).toBeHidden();
});

test("wave 10 keeps the defeated Bell Ringer and churches for seven seconds before advancing", async ({ page }) => {
  await startHunt(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const clearedWave = game.forceWaveState(10, 0, 0);
    game.setBellRingerAiEnabled(false);
    const beforeHardLimit = JSON.parse(window.render_game_to_text());

    game.advanceWaveProgress(121000);
    const whileBossLives = JSON.parse(window.render_game_to_text());
    const livingBoss = game.getBellRingerDiagnostics();

    const maxHp = livingBoss.maxHp;
    for (let cycle = 0; cycle < 4; cycle += 1) {
      for (let church = 0; church < 3; church += 1) game.completeBellChurchCapture(church);
      game.damageBellRinger(maxHp * 10);
    }
    const defeated = game.getBellRingerDiagnostics();

    game.advanceWaveProgress(6900);
    const beforeSevenSeconds = {
      world: JSON.parse(window.render_game_to_text()),
      boss: game.getBellRingerDiagnostics(),
    };

    game.advanceWaveProgress(200);
    const afterCleanup = {
      world: JSON.parse(window.render_game_to_text()),
      boss: game.getBellRingerDiagnostics(),
    };
    return {
      clearedWave,
      beforeHardLimit,
      whileBossLives,
      livingBoss,
      defeated,
      beforeSevenSeconds,
      afterCleanup,
    };
  });

  expect(result.clearedWave).toMatchObject({
    wave: 10,
    live: 0,
    spawnLeft: 0,
  });
  expect(result.beforeHardLimit.wave).toBe(10);
  expect(result.whileBossLives.wave).toBe(10);
  expect(result.livingBoss).toMatchObject({ active: true, shielded: true });
  expect(result.defeated).toMatchObject({
    active: false,
    defeated: true,
    hp: 0,
    action: "defeated",
    deathDuration: 7,
    deathProgress: 0,
    model: { attached: true },
  });
  expect(result.defeated.deathTimeLeft).toBeCloseTo(7, 2);
  expect(result.defeated.churches).toHaveLength(3);

  expect(result.beforeSevenSeconds.world.wave).toBe(10);
  expect(result.beforeSevenSeconds.boss).toMatchObject({
    active: false,
    defeated: true,
    deathDuration: 7,
    model: { attached: true },
  });
  expect(result.beforeSevenSeconds.boss.deathTimeLeft).toBeGreaterThan(0);
  expect(result.beforeSevenSeconds.boss.deathProgress).toBeGreaterThan(0.95);
  expect(result.beforeSevenSeconds.boss.churches).toHaveLength(3);
  expect(result.beforeSevenSeconds.boss.churches.every((church) => !church.active && !church.chainVisible)).toBe(true);
  expect(result.beforeSevenSeconds.boss.churches.every((church) => !church.captureVisualVisible)).toBe(true);

  expect(result.afterCleanup.world.wave).toBe(11);
  expect(result.afterCleanup.boss).toMatchObject({
    active: false,
    defeated: false,
    replica: false,
    churches: [],
  });
});

test("Bell Ringer snapshots preserve the three churches and clear the guest replica when the encounter ends", async ({ page }) => {
  await startHunt(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const multiplayer = window.__dustMultiplayerTest;

    multiplayer.startMockHost(["Host", "Guest"]);
    game.startWaveNow(10);
    game.setBellRingerAiEnabled(false);
    game.completeBellChurchCapture(0);

    const host = game.getBellRingerDiagnostics();
    const raw = JSON.parse(JSON.stringify(
      multiplayer.buildSnapshot(false, false, "mock-player-2")
    ));
    const wire = JSON.parse(JSON.stringify(
      multiplayer.buildWireSnapshot(false, false, "mock-player-2")
    ));
    const decodedWireBoss = multiplayer.decodeBossState(wire.bossState);

    multiplayer.startMockGuest(["Host", "Guest"], 1);
    multiplayer.applySnapshot(wire);
    const guest = game.getBellRingerDiagnostics();

    const clearedSnapshot = JSON.parse(JSON.stringify(wire));
    clearedSnapshot.sequence += 1;
    clearedSnapshot.bossState = null;
    multiplayer.applySnapshot(clearedSnapshot);
    const cleared = game.getBellRingerDiagnostics();

    return {
      host,
      raw: raw.bellRinger,
      wire: decodedWireBoss,
      wireVersion: wire.version,
      wireHasLegacyBoss: Object.prototype.hasOwnProperty.call(wire, "bellRinger"),
      guest,
      cleared,
    };
  });

  expect(result.host).toMatchObject({
    active: true,
    replica: false,
    shielded: true,
  });
  expect(result.host.churches).toHaveLength(3);
  expect(result.host.churches.map((church) => church.active)).toEqual([false, true, true]);
  expect(result.host.churches.map((church) => church.chainEnabled)).toEqual([false, true, true]);
  expect(result.host.churches.every((church) => church.chainAttached)).toBe(true);
  expect(result.host.churches[0].chainVisible).toBe(false);
  expect(result.wireVersion).toBe(47);
  expect(result.wireHasLegacyBoss).toBe(false);

  for (const snapshotBoss of [result.raw, result.wire]) {
    expect(snapshotBoss).toMatchObject({
      kind: "bellRinger",
      shield: true,
    });
    expect(snapshotBoss.churches).toHaveLength(3);
    expect(snapshotBoss.churches.map((church) => church.index)).toEqual([0, 1, 2]);
    expect(snapshotBoss.churches.map((church) => church.active)).toEqual([false, true, true]);
    expect(snapshotBoss.churches.map((church) => church.capture)).toEqual([1, 0, 0]);
  }

  expect(result.guest).toMatchObject({
    active: true,
    replica: true,
    shielded: true,
    hp: result.host.hp,
    maxHp: result.host.maxHp,
  });
  expect(result.guest.churches).toHaveLength(3);
  expect(result.guest.churches.map((church) => church.active)).toEqual([false, true, true]);
  expect(result.guest.churches.map((church) => church.captured)).toEqual([true, false, false]);
  expect(result.guest.churches.map((church) => church.captureProgress)).toEqual([1, 0, 0]);
  expect(result.guest.churches.map((church) => church.chainEnabled)).toEqual([false, true, true]);
  expect(result.guest.churches.every((church) => church.chainAttached)).toBe(true);
  expect(result.guest.churches[0].chainVisible).toBe(false);

  expect(result.cleared).toMatchObject({
    active: false,
    replica: false,
    churches: [],
  });
  expect(result.cleared.hud.visible).toBe(false);
});

test("one compact reliable event reproduces a falling bell for every client player", async ({ page }) => {
  await startHunt(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const multiplayer = window.__dustMultiplayerTest;
    const clone = (value) => JSON.parse(JSON.stringify(value));

    multiplayer.startMockHost(["Host", "Guest"]);
    game.startWaveNow(10);
    game.clearEnemies();
    game.setBellRingerAiEnabled(false);
    const host = game.forceBellRingerBellDrop();
    const wire = clone(multiplayer.buildWireSnapshot(false, false, "mock-player-2"));
    const event = wire.combatEvents.find((entry) => entry.type === "bellRingerBellDrop");
    const wireBytes = new TextEncoder().encode(JSON.stringify(wire)).length;

    multiplayer.startMockGuest(["Host", "Guest"], 1);
    multiplayer.applySnapshot(wire);
    const guest = game.getBellRingerDiagnostics();
    return { host, event, wireBytes, guest };
  });

  expect(result.host.bellDrop.activeCount).toBe(2);
  expect(result.event).toBeTruthy();
  expect(result.event.drops).toHaveLength(2);
  expect(new Set(result.event.drops.map((drop) => drop.targetPlayerId)).size).toBe(2);
  expect(result.wireBytes).toBeLessThan(MAX_WIRE_BYTES);
  expect(result.guest).toMatchObject({ replica: true });
  expect(result.guest.bellDrop).toMatchObject({ sequence: 1, activeCount: 2 });
  expect(result.guest.bellDrop.drops.every((drop) => drop.visualAttached)).toBe(true);
});

test("the defeated state and an intermediate death animation replicate before the authoritative cleanup", async ({ page }) => {
  await startHunt(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const multiplayer = window.__dustMultiplayerTest;
    const clone = (value) => JSON.parse(JSON.stringify(value));

    multiplayer.startMockHost(["Host", "Guest"]);
    game.forceWaveState(10, 0, 0);
    game.setBellRingerAiEnabled(false);

    const maxHp = game.getBellRingerDiagnostics().maxHp;
    for (let cycle = 0; cycle < 4; cycle += 1) {
      for (let church = 0; church < 3; church += 1) game.completeBellChurchCapture(church);
      game.damageBellRinger(maxHp * 10);
    }

    const hostAtDeath = game.getBellRingerDiagnostics();
    const deathWire = clone(multiplayer.buildWireSnapshot(false, false, "mock-player-2"));
    const deathBoss = multiplayer.decodeBossState(deathWire.bossState);

    game.advanceWaveProgress(3500);
    const hostMidway = game.getBellRingerDiagnostics();
    const midwayWire = clone(multiplayer.buildWireSnapshot(false, false, "mock-player-2"));
    const midwayBoss = multiplayer.decodeBossState(midwayWire.bossState);

    game.advanceWaveProgress(3400);
    const hostBeforeCleanup = game.getBellRingerDiagnostics();
    const beforeCleanupWire = clone(multiplayer.buildWireSnapshot(false, false, "mock-player-2"));
    const beforeCleanupBoss = multiplayer.decodeBossState(beforeCleanupWire.bossState);

    game.advanceWaveProgress(200);
    const hostAfterCleanup = game.getBellRingerDiagnostics();
    const cleanupWire = clone(multiplayer.buildWireSnapshot(false, false, "mock-player-2"));
    const cleanupBoss = multiplayer.decodeBossState(cleanupWire.bossState);

    multiplayer.startMockGuest(["Host", "Guest"], 1);
    multiplayer.applySnapshot(deathWire);
    const guestAtDeath = game.getBellRingerDiagnostics();
    multiplayer.applySnapshot(midwayWire);
    const guestMidway = game.getBellRingerDiagnostics();
    multiplayer.applySnapshot(deathWire);
    const guestAfterStaleDeathSnapshot = game.getBellRingerDiagnostics();
    multiplayer.applySnapshot(beforeCleanupWire);
    const guestBeforeCleanup = game.getBellRingerDiagnostics();
    window.advanceTime(500);
    const guestExpiredWithoutCleanup = game.getBellRingerDiagnostics();
    multiplayer.applySnapshot(cleanupWire);
    const guestAfterCleanup = game.getBellRingerDiagnostics();

    return {
      hostAtDeath,
      hostMidway,
      hostBeforeCleanup,
      hostAfterCleanup,
      deathWire,
      deathBoss,
      midwayWire,
      midwayBoss,
      beforeCleanupWire,
      beforeCleanupBoss,
      cleanupWire,
      cleanupBoss,
      guestAtDeath,
      guestMidway,
      guestAfterStaleDeathSnapshot,
      guestBeforeCleanup,
      guestExpiredWithoutCleanup,
      guestAfterCleanup,
    };
  });

  for (const [snapshot, snapshotBoss] of [
    [result.deathWire, result.deathBoss],
    [result.midwayWire, result.midwayBoss],
    [result.beforeCleanupWire, result.beforeCleanupBoss],
  ]) {
    expect(snapshot.wave).toBe(10);
    expect(snapshotBoss).toMatchObject({
      kind: "bellRinger",
      active: false,
      defeated: true,
      deathDuration: 7,
      hp: 0,
      action: "defeated",
    });
    expect(snapshotBoss.churches ?? snapshotBoss.cs).toHaveLength(3);
  }
  expect(result.deathBoss.deathTimeLeft).toBeCloseTo(7, 2);
  expect(result.midwayBoss.deathTimeLeft).toBeCloseTo(3.5, 1);
  expect(result.beforeCleanupBoss.deathTimeLeft).toBeGreaterThan(0);
  expect(result.cleanupWire.wave).toBe(11);
  expect(result.cleanupBoss).toMatchObject({
    kind: "doppelganger",
    phase: "scout",
    sourceBossWave: 10,
    dueBossWave: 15,
    hitsRemaining: 4,
  });

  expect(result.hostAtDeath).toMatchObject({ defeated: true, deathProgress: 0 });
  expect(result.hostMidway.deathProgress).toBeGreaterThan(0.45);
  expect(result.hostMidway.deathProgress).toBeLessThan(0.55);
  expect(result.hostBeforeCleanup).toMatchObject({
    active: false,
    defeated: true,
    model: { attached: true },
  });
  expect(result.hostAfterCleanup).toMatchObject({ defeated: false, churches: [] });

  for (const guest of [result.guestAtDeath, result.guestMidway, result.guestBeforeCleanup]) {
    expect(guest).toMatchObject({
      active: false,
      defeated: true,
      replica: true,
      action: "defeated",
      deathDuration: 7,
      model: { attached: true },
    });
    expect(guest.churches).toHaveLength(3);
    expect(guest.churches.every((church) => !church.captureVisualVisible)).toBe(true);
  }
  expect(result.guestAtDeath.deathProgress).toBeCloseTo(0, 2);
  expect(result.guestMidway.deathProgress).toBeGreaterThan(0.45);
  expect(result.guestMidway.deathProgress).toBeLessThan(0.55);
  expect(result.guestMidway.deathProgress).toBeCloseTo(result.hostMidway.deathProgress, 2);
  expect(result.guestAfterStaleDeathSnapshot.deathProgress).toBeCloseTo(result.guestMidway.deathProgress, 3);
  expect(result.guestBeforeCleanup.deathProgress).toBeGreaterThan(0.95);
  expect(result.guestExpiredWithoutCleanup).toMatchObject({
    active: false,
    defeated: true,
    replica: true,
    deathProgress: 1,
    model: { attached: true },
  });
  expect(result.guestExpiredWithoutCleanup.churches).toHaveLength(3);
  expect(result.guestAfterCleanup).toMatchObject({
    active: false,
    defeated: false,
    replica: false,
    churches: [],
  });
});

test("Bell Ringer wire snapshots use compact church deltas and periodic recovery keyframes", async ({ page }) => {
  await startHunt(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const multiplayer = window.__dustMultiplayerTest;
    const clone = (value) => JSON.parse(JSON.stringify(value));
    const bytes = (value) => new TextEncoder().encode(JSON.stringify(value)).length;

    multiplayer.startMockHost(["Host", "Guest"]);
    game.startWaveNow(10);
    game.setBellRingerAiEnabled(false);
    const full = clone(multiplayer.buildWireSnapshot(false, false, "mock-player-2"));
    const repeatedFull = clone(multiplayer.buildWireSnapshot(false, false, "mock-player-2"));
    const delta = clone(multiplayer.buildWireSnapshot(false, false, "mock-player-2"));
    game.advanceWaveProgress(1300);
    const recovery = clone(multiplayer.buildWireSnapshot(false, false, "mock-player-2"));

    const decode = (wire) => multiplayer.decodeBossState(wire.bossState);
    const binaryBytes = (wire) => Uint8Array.from(atob(wire.bossState), (character) => character.charCodeAt(0)).length;

    multiplayer.startMockGuest(["Host", "Guest"], 1);
    multiplayer.applySnapshot(full);
    multiplayer.applySnapshot(delta);
    multiplayer.applySnapshot(recovery);
    const guest = game.getBellRingerDiagnostics();

    return {
      fullBoss: decode(full),
      repeatedFullBoss: decode(repeatedFull),
      deltaBoss: decode(delta),
      recoveryBoss: decode(recovery),
      fullBossBytes: binaryBytes(full),
      repeatedFullBossBytes: binaryBytes(repeatedFull),
      deltaBossBytes: binaryBytes(delta),
      fullWireOverhead: bytes(full) - bytes(Object.assign({}, full, { bossState: undefined })),
      hasLegacyBoss: Object.prototype.hasOwnProperty.call(full, "bellRinger"),
      guest,
    };
  });

  expect(result.fullBoss.churches).toHaveLength(3);
  expect(result.repeatedFullBoss.churches).toHaveLength(3);
  expect(result.fullBoss.cs).toBeUndefined();
  expect(result.deltaBoss.churches).toBeUndefined();
  expect(result.deltaBoss.cs).toHaveLength(3);
  expect(result.recoveryBoss.churches).toHaveLength(3);
  expect(result.fullBossBytes).toBeLessThanOrEqual(64);
  expect(result.repeatedFullBossBytes).toBe(result.fullBossBytes);
  expect(result.deltaBossBytes).toBeLessThanOrEqual(36);
  expect(result.deltaBossBytes).toBeLessThan(result.fullBossBytes);
  expect(result.fullWireOverhead).toBeLessThanOrEqual(128);
  expect(result.hasLegacyBoss).toBe(false);
  expect(result.guest).toMatchObject({
    active: true,
    defeated: false,
    replica: true,
  });
  expect(result.guest.churches).toHaveLength(3);
});

test("the packed toll channel preserves church zero as its source", async ({ page }) => {
  await startHunt(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const multiplayer = window.__dustMultiplayerTest;

    multiplayer.startMockHost(["Host", "Guest"]);
    game.startWaveNow(10);
    window.advanceTime(4000);
    window.advanceTime(4000);
    window.advanceTime(1400);
    const host = game.getBellRingerDiagnostics();
    const wire = multiplayer.buildWireSnapshot(false, false, "mock-player-2");
    return {
      host,
      decoded: multiplayer.decodeBossState(wire.bossState),
    };
  });

  expect(result.host.tollActive).toBe(true);
  expect(result.decoded.tollActive).toBe(true);
  expect(result.decoded.tollSourceIndex).toBe(0);
  expect(result.decoded.tollX).toBeCloseTo(result.host.churches[0].x, 1);
  expect(result.decoded.tollZ).toBeCloseTo(result.host.churches[0].z, 1);
});

test("a corrupt boss payload preserves the replica and the repeated keyframe repairs it", async ({ page }) => {
  await startHunt(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const multiplayer = window.__dustMultiplayerTest;
    const clone = (value) => JSON.parse(JSON.stringify(value));

    multiplayer.startMockHost(["Host", "Guest"]);
    game.startWaveNow(10);
    game.setBellRingerAiEnabled(false);
    const initial = clone(multiplayer.buildWireSnapshot(false, false, "mock-player-2"));
    multiplayer.buildWireSnapshot(false, false, "mock-player-2");
    multiplayer.buildWireSnapshot(false, false, "mock-player-2");

    game.completeBellChurchCapture(0);
    const changed = clone(multiplayer.buildWireSnapshot(false, false, "mock-player-2"));
    const repeatedChanged = clone(multiplayer.buildWireSnapshot(false, false, "mock-player-2"));
    const changedBoss = multiplayer.decodeBossState(changed.bossState);
    const repeatedBoss = multiplayer.decodeBossState(repeatedChanged.bossState);

    multiplayer.startMockGuest(["Host", "Guest"], 1);
    multiplayer.applySnapshot(initial);
    const beforeCorrupt = game.getBellRingerDiagnostics();
    const corrupt = clone(changed);
    corrupt.bossState = "not-base64";
    multiplayer.applySnapshot(corrupt);
    const afterCorrupt = game.getBellRingerDiagnostics();
    multiplayer.applySnapshot(repeatedChanged);
    const afterRecovery = game.getBellRingerDiagnostics();

    return { beforeCorrupt, afterCorrupt, afterRecovery, changedBoss, repeatedBoss };
  });

  expect(result.changedBoss.churches).toHaveLength(3);
  expect(result.repeatedBoss.churches).toHaveLength(3);
  expect(result.beforeCorrupt.churches.map((church) => church.active)).toEqual([true, true, true]);
  expect(result.afterCorrupt).toMatchObject({ active: true, replica: true, hp: result.beforeCorrupt.hp });
  expect(result.afterCorrupt.churches.map((church) => church.active)).toEqual([true, true, true]);
  expect(result.afterRecovery.churches.map((church) => church.active)).toEqual([false, true, true]);
  expect(result.afterRecovery.churches[0].captureProgress).toBe(1);
});

test("a high-RTT guest hit on the Bell Ringer is authoritative and reaches every replica", async ({ page }) => {
  await startHunt(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const multiplayer = window.__dustMultiplayerTest;
    multiplayer.startMockHost(["Host", "Guest"]);
    game.startWaveNow(10);
    game.setBellRingerAiEnabled(false);
    for (let church = 0; church < 3; church += 1) game.completeBellChurchCapture(church);

    const before = game.getBellRingerDiagnostics();
    const target = before.bossPosition;
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
      targetId: "bell-ringer",
      targetX: target.x,
      targetZ: target.z,
    });
    window.advanceTime(700);

    const authoritative = game.getBellRingerDiagnostics();
    const fireState = multiplayer.getState().players.find((player) => player.id === "mock-player-2");
    const impact = multiplayer.getNetworkCombatDiagnostics().queuedEvents.find(
      (event) => event.type === "projectileImpact" && event.ownerId === "mock-player-2"
    );
    const wire = JSON.parse(JSON.stringify(multiplayer.buildWireSnapshot(false, false, "mock-player-2")));
    multiplayer.startMockGuest(["Host", "Guest"], 1);
    multiplayer.applySnapshot(wire);
    const guest = game.getBellRingerDiagnostics();
    return { queued, before, authoritative, fireState, impact, guest };
  });

  expect(result.queued).toBe(true);
  expect(result.fireState).toMatchObject({
    lastProcessedFireActionSequence: 1,
    lastFireActionAccepted: true,
  });
  expect(result.impact).toMatchObject({
    impactKind: "enemy",
    targetEnemyId: "bell-ringer",
    clientFireSequence: 1,
  });
  expect(result.authoritative.hp).toBeLessThan(result.before.hp);
  expect(result.guest).toMatchObject({
    active: true,
    replica: true,
    hp: result.authoritative.hp,
    maxHp: result.authoritative.maxHp,
  });
  expect(result.guest.bossPosition.x).toBeCloseTo(result.authoritative.bossPosition.x, 1);
  expect(result.guest.bossPosition.z).toBeCloseTo(result.authoritative.bossPosition.z, 1);
});

test("the Bell Ringer remains in a stressed wire snapshot without exceeding the packet budget", async ({ page }) => {
  await startHunt(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const multiplayer = window.__dustMultiplayerTest;
    const bytes = (value) => new TextEncoder().encode(JSON.stringify(value)).length;

    multiplayer.startMockHost(["Host", "Guest"]);
    game.startWaveNow(10);
    game.setBellRingerAiEnabled(false);
    const stress = multiplayer.spawnEnemyStressField(1000, "visible");
    const wire = multiplayer.buildWireSnapshot(false, false, "mock-player-2");
    const wireWithoutBoss = Object.assign({}, wire);
    delete wireWithoutBoss.bossState;
    const packedBossBytes = Uint8Array.from(atob(wire.bossState), (character) => character.charCodeAt(0)).length;
    const serializedWire = JSON.stringify(wire);

    return {
      stress,
      wireBytes: bytes(wire),
      bossOverheadBytes: bytes(wire) - bytes(wireWithoutBoss),
      packedBossBytes,
      boss: multiplayer.decodeBossState(wire.bossState),
      hasLegacyBoss: Object.prototype.hasOwnProperty.call(wire, "bellRinger"),
      hasMusicPayload: serializedWire.includes("bossMusic")
        || serializedWire.includes("The Last Parish")
        || serializedWire.includes("scheduledStepCount"),
      budget: multiplayer.getNetworkBudgetDiagnostics(),
    };
  });

  expect(result.stress.added).toBe(1000);
  expect(result.boss).toMatchObject({
    kind: "bellRinger",
    shield: true,
  });
  expect(result.boss.hp).toBe(result.boss.maxHp);
  expect(result.boss.churches).toHaveLength(3);
  expect(result.hasLegacyBoss).toBe(false);
  expect(result.hasMusicPayload).toBe(false);
  expect(result.packedBossBytes).toBeLessThanOrEqual(64);
  expect(result.bossOverheadBytes).toBeGreaterThan(0);
  expect(result.bossOverheadBytes).toBeLessThanOrEqual(128);
  expect(result.wireBytes).toBeLessThanOrEqual(MAX_WIRE_BYTES);
  expect(result.budget.stats.wireOversizeSnapshots).toBe(0);
});
