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
  await page.waitForFunction(() => Boolean(window.__dustMultiplayerTest && window.__dustAndDeadTest));
}

test("sequenced combat events replicate Coach Gun, launcher, and rifle trap effects once without guest damage", async ({ page }) => {
  await openGame(page);

  const result = await page.evaluate(() => {
    const api = window.__dustMultiplayerTest;
    const gameApi = window.__dustAndDeadTest;
    const ownerId = "mock-player-1";
    api.startMockHost(["Host", "Guest"]);

    const owner = api.getState().players[0];
    api.setPlayerPosition("mock-player-2", owner.x + 2, owner.z + 2);
    api.setProgression(ownerId, {
      playerClass: "marshal",
      marshalUpgrade: "breachMarshal",
      weapon: "coachGun",
      ownedWeapons: { revolver: true, rifle: false, launcher: false, coachGun: true },
      ammo: Object.assign({}, owner.progression.ammo, { coachGun: 2 }),
      ammoReserve: { revolver: 36, rifle: 0, launcher: 0, coachGun: 8 },
      reloadTimers: { revolver: 0, rifle: 0, launcher: 0, coachGun: 0 },
      upgradeCounts: {},
    });
    const firedCoachGun = api.fireAt(ownerId, owner.x + 12, owner.z);

    gameApi.triggerLauncherExplosionAt(owner.x + 1, owner.z + 1, "main", 3.2, 5.5, {
      ownerPlayerId: ownerId,
      noFire: true,
      noShrapnel: true,
      noCluster: true,
      noCrossfire: true,
    });

    api.setProgression(ownerId, {
      playerClass: "ranger",
      rifleUpgrade: "trailWarden",
      marshalUpgrade: null,
      weapon: "rifle",
      ownedWeapons: { revolver: true, rifle: true, launcher: false, coachGun: false },
      upgradeCounts: { trailLayer: 1 },
      rifleAutoTrapTimer: 0,
    });
    const trap = api.spawnTrailTrapNow(ownerId);
    const triggeredTrap = api.triggerFirstRifleTrap();

    const hostDiagnostics = api.getNetworkCombatDiagnostics();
    const snapshot = api.buildSnapshot();
    const authoritativeHp = snapshot.players.map((player) => ({ id: player.id, hp: player.hp }));

    api.startMockGuest(["Host", "Guest"], 1);
    gameApi.setPlayerPosition(owner.x + 2, owner.z + 2);
    api.applySnapshot(snapshot);
    const afterFirstApply = {
      state: api.getState(),
      diagnostics: api.getNetworkCombatDiagnostics(),
    };

    const replay = JSON.parse(JSON.stringify(snapshot));
    replay.sequence += 1;
    api.applySnapshot(replay);
    const afterReplay = {
      state: api.getState(),
      diagnostics: api.getNetworkCombatDiagnostics(),
    };

    return {
      firedCoachGun,
      trap,
      triggeredTrap,
      hostDiagnostics,
      snapshotEvents: snapshot.combatEvents,
      authoritativeHp,
      afterFirstApply,
      afterReplay,
    };
  });

  expect(result.firedCoachGun).toBe(true);
  expect(result.trap).toBeTruthy();
  expect(result.triggeredTrap).toBe(true);
  expect(result.hostDiagnostics.queuedEvents.map((event) => event.type)).toEqual([
    "coachGunVolley",
    "launcherExplosion",
    "rifleTrapTrigger",
  ]);
  expect(result.snapshotEvents.map((event) => event.sequence)).toEqual([1, 2, 3]);
  expect(result.snapshotEvents.map((event) => event.type)).toEqual([
    "coachGunVolley",
    "launcherExplosion",
    "rifleTrapTrigger",
  ]);

  const firstDiagnostics = result.afterFirstApply.diagnostics;
  expect(firstDiagnostics.lastCombatEventSequence).toBe(3);
  expect(firstDiagnostics.guestEvents.map((event) => event.type)).toEqual([
    "coachGunVolley",
    "launcherExplosion",
    "rifleTrapTrigger",
  ]);
  expect(firstDiagnostics.guestEvents.map((event) => event.sound)).toEqual([
    "coachGun",
    "launcherExplosion",
    null,
  ]);
  expect(firstDiagnostics.coachGunTracers).toBeGreaterThan(0);
  expect(firstDiagnostics.shockwaves).toBeGreaterThanOrEqual(2);

  const expectedHp = Object.fromEntries(result.authoritativeHp.map((entry) => [entry.id, entry.hp]));
  for (const player of result.afterFirstApply.state.players) {
    expect(player.hp).toBe(expectedHp[player.id]);
  }

  expect(result.afterReplay.diagnostics.guestEvents).toEqual(firstDiagnostics.guestEvents);
  expect(result.afterReplay.diagnostics.coachGunTracers).toBe(firstDiagnostics.coachGunTracers);
  expect(result.afterReplay.diagnostics.shockwaves).toBe(firstDiagnostics.shockwaves);
});

test("guest bullet snapshots select weapon sounds and keep shrapnel and fire shards silent", async ({ page }) => {
  await openGame(page);

  const result = await page.evaluate(() => {
    const api = window.__dustMultiplayerTest;
    api.startMockHost(["Host", "Guest"]);
    const snapshot = api.buildSnapshot();
    snapshot.bullets = ["revolver", "rifle", "launcher", "launcherShrapnel", "launcherFireShard"].map((type, index) => ({
      id: 100 + index,
      ownerId: "mock-player-1",
      type,
      x: index * 1.2,
      y: 0.9,
      z: 3,
      dirX: 0,
      dirZ: 1,
      life: 1,
      visualWidth: 0.12,
      visualLength: 0.6,
      chainLightning: type === "rifle",
    }));
    snapshot.combatEvents = [];

    api.startMockGuest(["Host", "Guest"], 1);
    api.applySnapshot(snapshot);
    const first = api.getNetworkCombatDiagnostics();

    const replay = JSON.parse(JSON.stringify(snapshot));
    replay.sequence += 1;
    api.applySnapshot(replay);
    const second = api.getNetworkCombatDiagnostics();
    return { first, second };
  });

  expect(result.first.projectileSounds).toEqual([
    { id: 100, type: "revolver", sound: "revolver" },
    { id: 101, type: "rifle", sound: "rifle" },
    { id: 102, type: "launcher", sound: "launcher" },
    { id: 103, type: "launcherShrapnel", sound: null },
    { id: 104, type: "launcherFireShard", sound: null },
  ]);
  expect(result.second.projectileSounds).toEqual(result.first.projectileSounds);
});

test("guest lightning reuses its instanced layers and offscreen rifle effects allocate no visuals", async ({ page }) => {
  await openGame(page);

  const result = await page.evaluate(() => {
    const api = window.__dustMultiplayerTest;
    const game = window.__dustAndDeadTest;
    api.startMockHost(["Host", "Guest"]);
    const base = api.buildSnapshot();
    api.startMockGuest(["Host", "Guest"], 1);
    const visibleGround = game.getVisibleGroundRect();
    const viewX = visibleGround.targetX;
    const viewZ = visibleGround.targetZ;

    const first = JSON.parse(JSON.stringify(base));
    first.sequence = 1;
    first.combatEvents = [{
      sequence: 1,
      type: "rifleLightning",
      ownerId: "mock-player-1",
      path: [viewX, viewZ, viewX + 4, viewZ, viewX + 8, viewZ + 2],
    }];
    api.applySnapshot(first);
    const firstPool = game.getThreeObjectDiagnostics().pools.lightningBoltVisuals;

    window.advanceTime(500);
    const settledPool = game.getThreeObjectDiagnostics().pools.lightningBoltVisuals;
    const second = JSON.parse(JSON.stringify(base));
    second.sequence = 2;
    second.combatEvents = [{
      sequence: 2,
      type: "rifleLightning",
      ownerId: "mock-player-1",
      path: [viewX, viewZ, viewX + 4, viewZ, viewX + 8, viewZ + 2],
    }];
    api.applySnapshot(second);
    const secondPool = game.getThreeObjectDiagnostics().pools.lightningBoltVisuals;

    window.advanceTime(500);
    const beforeOffscreen = api.getNetworkCombatDiagnostics();
    const farX = viewX + 150;
    const farZ = viewZ + 150;
    const offscreen = JSON.parse(JSON.stringify(base));
    offscreen.sequence = 3;
    offscreen.rifleTrapsComplete = true;
    offscreen.rifleTraps = [{
      id: 900,
      ownerId: "mock-player-1",
      x: farX,
      z: farZ,
      radius: 3,
      type: "rifle",
      armed: true,
    }];
    offscreen.combatEvents = [
      {
        sequence: 3,
        type: "rifleTrapTrigger",
        ownerId: "mock-player-1",
        trapId: 900,
        x: farX,
        z: farZ,
        radius: 3,
      },
      {
        sequence: 4,
        type: "rifleLightning",
        ownerId: "mock-player-1",
        path: [farX, farZ, farX + 4, farZ, farX + 8, farZ + 2],
      },
    ];
    api.applySnapshot(offscreen);
    return {
      firstPool,
      settledPool,
      secondPool,
      beforeOffscreen,
      afterOffscreen: api.getNetworkCombatDiagnostics(),
      replicas: api.getGuestCombatReplicas(),
    };
  });

  expect(result.firstPool.inUse).toBe(2);
  expect(result.firstPool.drawCalls).toBeLessThanOrEqual(6);
  expect(result.firstPool.mainInstances).toBe(14);
  expect(result.firstPool.branchInstances).toBe(10);
  expect(result.firstPool.glowInstances).toBe(24);
  expect(result.settledPool.inUse).toBe(0);
  expect(result.secondPool.inUse).toBe(2);
  expect(result.secondPool.created).toBe(result.firstPool.created);

  expect(result.afterOffscreen.lastCombatEventSequence).toBe(4);
  expect(result.afterOffscreen.guestEvents.slice(-2).map((event) => event.type)).toEqual([
    "rifleTrapTrigger",
    "rifleLightning",
  ]);
  expect(result.afterOffscreen.guestEvents.slice(-2).map((event) => event.visuals)).toEqual([0, 0]);
  expect(result.afterOffscreen.lightningBolts).toBe(result.beforeOffscreen.lightningBolts);
  expect(result.afterOffscreen.shockwaves).toBe(result.beforeOffscreen.shockwaves);
  expect(result.afterOffscreen.lightFlashes).toBe(result.beforeOffscreen.lightFlashes);
  expect(result.afterOffscreen.particles).toBe(result.beforeOffscreen.particles);
  expect(result.replicas.rifleTraps).toHaveLength(0);
});

test("shot audio uses shooter position for stereo direction and distance falloff", async ({ page }) => {
  await openGame(page);

  const result = await page.evaluate(() => {
    const multiplayer = window.__dustMultiplayerTest;
    const game = window.__dustAndDeadTest;
    multiplayer.startMockHost(["Listener", "Shooter"]);
    multiplayer.setPlayerPosition("mock-player-1", 0, 0);
    return {
      local: game.getShotSfxSpatialization(1.2, 0, 1, 0.18),
      rightAimingLeft: game.getShotSfxSpatialization(12, 0, -1, 0.18),
      leftAimingRight: game.getShotSfxSpatialization(-12, 0, 1, 0.18),
      farRight: game.getShotSfxSpatialization(12, 24, -1, 0.18),
      acrossMap: game.getShotSfxSpatialization(220, 180, -1, 0.18),
      farExplosionSingle: game.getLauncherExplosionGroupLevel([0.004]),
      farExplosionBurst: game.getLauncherExplosionGroupLevel([0.004, 0.004, 0.004, 0.004]),
    };
  });

  expect(result.local.gain).toBe(1);
  expect(result.rightAimingLeft.pan).toBeGreaterThan(0.5);
  expect(result.leftAimingRight.pan).toBeLessThan(-0.5);
  expect(result.rightAimingLeft.gain).toBeLessThan(result.local.gain);
  expect(result.rightAimingLeft.gain).toBeLessThan(0.5);
  expect(result.farRight.gain).toBeLessThan(result.rightAimingLeft.gain);
  expect(result.farRight.gain).toBeLessThan(0.18);
  expect(result.acrossMap.gain).toBeLessThanOrEqual(0.007);
  expect(result.farExplosionSingle).toBe(0.004);
  expect(result.farExplosionBurst).toBeLessThan(0.007);
  expect(result.farRight.distance).toBeGreaterThan(result.rightAimingLeft.distance);
  expect(result.acrossMap.distance).toBeGreaterThan(result.farRight.distance);
});
