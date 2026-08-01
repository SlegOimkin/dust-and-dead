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
  await page.waitForFunction(() => Boolean(window.__dustMultiplayerTest));
}

async function buildHostCombatSnapshot(page) {
  return page.evaluate(() => {
    const api = window.__dustMultiplayerTest;
    const initial = api.startMockHost(["Pyro Host", "Trap Guest"]);
    api.spawnFirePatch("mock-player-1", {
      x: initial.players[0].x + 1,
      z: initial.players[0].z,
      radius: 1.75,
      life: 4,
      type: "splinter",
    });
    api.spawnTrailTrapNow("mock-player-2");
    return {
      first: api.buildSnapshot(),
      second: api.buildSnapshot(),
    };
  });
}

test("host snapshots stable compact fire-patch and rifle-trap identities", async ({ page }) => {
  await openGame(page);
  const snapshots = await buildHostCombatSnapshot(page);

  expect(snapshots.first.firePatches).toHaveLength(1);
  expect(snapshots.first.rifleTraps).toHaveLength(1);
  expect(snapshots.first.hazardUpserts).toBeUndefined();

  const fire = snapshots.first.firePatches[0];
  expect(Object.keys(fire).sort()).toEqual(["armed", "id", "life", "ownerId", "radius", "type", "x", "z"]);
  expect(fire).toMatchObject({ ownerId: "mock-player-1", radius: 1.75, life: 4, type: "splinter", armed: true });
  expect(fire.id).toBeGreaterThan(0);

  const trap = snapshots.first.rifleTraps[0];
  expect(Object.keys(trap).sort()).toEqual(["armed", "id", "life", "ownerId", "radius", "type", "x", "z"]);
  expect(trap).toMatchObject({ ownerId: "mock-player-2", life: null, type: "trail-layer", armed: false });
  expect(trap.id).toBeGreaterThan(0);

  expect(snapshots.second.firePatches[0].id).toBe(fire.id);
  expect(snapshots.second.rifleTraps[0].id).toBe(trap.id);
});

test("a delayed snapshot from the previous match cannot resurrect hazards or poison the new sequence", async ({ page }) => {
  await openGame(page);

  const result = await page.evaluate(() => {
    const api = window.__dustMultiplayerTest;
    const oldMatch = api.startMockHost(["Old Host", "Old Guest"], "mock-match-old");
    api.spawnFirePatch("mock-player-1", {
      x: oldMatch.players[1].x,
      z: oldMatch.players[1].z,
      radius: 1.5,
      life: 4,
      type: "splinter",
    });
    api.spawnTrailTrapNow("mock-player-2");
    const stale = JSON.parse(JSON.stringify(api.buildSnapshot(true, true, "mock-player-2")));
    stale.bullets.push({
      id: 9001,
      ownerId: "mock-player-1",
      clientFireSequence: 0,
      type: "revolver",
      startX: oldMatch.players[1].x - 1,
      startY: 0.9,
      startZ: oldMatch.players[1].z,
      x: oldMatch.players[1].x,
      y: 0.9,
      z: oldMatch.players[1].z,
      dirX: 1,
      dirZ: 0,
      speed: 30,
      life: 1,
      hitRadius: 0.1,
      visualWidth: 0.1,
      visualLength: 0.5,
      chainLightning: false,
      piercing: false,
    });
    stale.sequence = 50;

    const freshMatch = api.startMockGuest(["Fresh Host", "Fresh Guest"], 1, "mock-match-fresh");
    const fresh = JSON.parse(JSON.stringify(api.buildSnapshot(true, true, "mock-player-2")));
    fresh.sequence = 1;
    api.applySnapshot(fresh);
    const beforeStale = {
      diagnostics: api.getIncomingRealtimeDiagnostics(),
      replicas: api.getGuestCombatReplicas(),
    };

    api.applySnapshot(stale);
    const afterStale = {
      diagnostics: api.getIncomingRealtimeDiagnostics(),
      replicas: api.getGuestCombatReplicas(),
    };

    const nextFresh = JSON.parse(JSON.stringify(fresh));
    nextFresh.sequence = 2;
    api.applySnapshot(nextFresh);
    const afterNextFresh = {
      diagnostics: api.getIncomingRealtimeDiagnostics(),
      replicas: api.getGuestCombatReplicas(),
    };

    return {
      oldMatchId: stale.matchId,
      freshMatchId: freshMatch.matchId,
      staleHazards: {
        bullets: stale.bullets.length,
        firePatches: stale.firePatches.length,
        rifleTraps: stale.rifleTraps.length,
      },
      beforeStale,
      afterStale,
      afterNextFresh,
    };
  });

  expect(result.oldMatchId).toBe("mock-match-old");
  expect(result.freshMatchId).toBe("mock-match-fresh");
  expect(result.staleHazards).toEqual({ bullets: 1, firePatches: 1, rifleTraps: 1 });
  expect(result.beforeStale.diagnostics.lastSnapshotSequence).toBe(1);
  expect(result.afterStale.diagnostics.lastSnapshotSequence).toBe(1);
  expect(result.afterStale.replicas.firePatches).toEqual([]);
  expect(result.afterStale.replicas.rifleTraps).toEqual([]);
  expect(result.afterStale.replicas.bullets).toEqual([]);
  expect(result.afterNextFresh.diagnostics.lastSnapshotSequence).toBe(2);
});

test("stale match-end and return-to-lobby messages cannot close the next match", async ({ page }) => {
  await openGame(page);

  const result = await page.evaluate(() => {
    const api = window.__dustMultiplayerTest;
    const started = api.startMockGuest(["Fresh Host", "Fresh Guest"], 1, "mock-match-fresh");
    const currentFinal = JSON.parse(JSON.stringify(api.buildSnapshot(true, true, "mock-player-2")));
    currentFinal.sequence = 1;
    const staleFinal = JSON.parse(JSON.stringify(currentFinal));
    staleFinal.matchId = "mock-match-old";
    staleFinal.sequence = 50;

    const staleEnd = api.receiveProtocol({
      type: "matchEnd",
      version: currentFinal.version,
      mapSeed: started.mapSeed,
      matchId: "mock-match-old",
      winnerIds: ["mock-player-1"],
      reason: "stale",
      finalSnapshot: staleFinal,
    });
    const afterStaleEndSequence = api.getIncomingRealtimeDiagnostics().lastSnapshotSequence;

    const validEnd = api.receiveProtocol({
      type: "matchEnd",
      version: currentFinal.version,
      mapSeed: started.mapSeed,
      matchId: started.matchId,
      winnerIds: ["mock-player-1"],
      reason: "finished",
      finalSnapshot: currentFinal,
    });

    const staleLobby = api.receiveProtocol({
      type: "returnLobby",
      version: currentFinal.version,
      mapSeed: started.mapSeed,
      matchId: "mock-match-old",
      hostPlayerId: "mock-player-1",
      players: [],
    });
    const validLobby = api.receiveProtocol({
      type: "returnLobby",
      version: currentFinal.version,
      mapSeed: started.mapSeed,
      matchId: started.matchId,
      hostPlayerId: "mock-player-1",
      players: [],
    });
    const duplicateEndAfterLobby = api.receiveProtocol({
      type: "matchEnd",
      version: currentFinal.version,
      mapSeed: started.mapSeed,
      matchId: started.matchId,
      winnerIds: ["mock-player-1"],
      reason: "duplicate",
      finalSnapshot: currentFinal,
    });

    const reordered = api.startMockGuest(
      ["Reordered Host", "Reordered Guest"],
      1,
      "mock-match-reordered"
    );
    const reorderedFinal = JSON.parse(JSON.stringify(api.buildSnapshot(true, true, "mock-player-2")));
    reorderedFinal.sequence = 1;
    const earlyLobby = api.receiveProtocol({
      type: "returnLobby",
      version: reorderedFinal.version,
      mapSeed: reordered.mapSeed,
      matchId: reordered.matchId,
      hostPlayerId: "mock-player-1",
      players: [],
    });
    const endAfterEarlyLobby = api.receiveProtocol({
      type: "matchEnd",
      version: reorderedFinal.version,
      mapSeed: reordered.mapSeed,
      matchId: reordered.matchId,
      winnerIds: ["mock-player-1"],
      reason: "reordered",
      finalSnapshot: reorderedFinal,
    });

    return {
      staleEnd,
      afterStaleEndSequence,
      validEnd,
      staleLobby,
      validLobby,
      duplicateEndAfterLobby,
      earlyLobby,
      endAfterEarlyLobby,
    };
  });

  expect(result.staleEnd).toMatchObject({ phase: "match", matchEnded: false });
  expect(result.afterStaleEndSequence).toBe(-1);
  expect(result.validEnd).toMatchObject({ phase: "ended", matchEnded: true });
  expect(result.staleLobby).toMatchObject({ phase: "ended", matchEnded: true });
  expect(result.validLobby).toMatchObject({ phase: "lobby", matchEnded: false });
  expect(result.duplicateEndAfterLobby).toMatchObject({ phase: "lobby", matchEnded: false });
  expect(result.earlyLobby).toMatchObject({ phase: "match", matchEnded: false });
  expect(result.endAfterEarlyLobby).toMatchObject({ phase: "lobby", matchEnded: false });
});

test("dangerous persistent objects are upserted before damage snapshots without a full-world resend", async ({ page }) => {
  await openGame(page);

  const result = await page.evaluate(() => {
    const multiplayer = window.__dustMultiplayerTest;
    const game = window.__dustAndDeadTest;
    const started = multiplayer.startMockHost(["Hazard Host", "Hazard Guest"]);
    const guest = started.players[1];
    multiplayer.spawnFirePatch("mock-player-1", {
      x: guest.x,
      z: guest.z,
      radius: 2,
      life: 4,
      damage: 3,
    });
    game.spawnRifleTrapAt(guest.x + 0.5, guest.z);
    multiplayer.spawnSpitterShotAtPlayer("mock-player-2");
    multiplayer.impactFirstAcidProjectile();

    const sparse = JSON.parse(JSON.stringify(multiplayer.buildSnapshot(false, false, "mock-player-2")));
    const sparseWithoutThreats = JSON.parse(JSON.stringify(sparse));
    sparseWithoutThreats.sequence += 1;
    delete sparseWithoutThreats.hazardUpserts;
    const fullClear = JSON.parse(JSON.stringify(sparseWithoutThreats));
    fullClear.sequence += 1;
    fullClear.firePatches = [];
    fullClear.rifleTraps = [];
    fullClear.acidPuddles = [];

    multiplayer.startMockGuest(["Hazard Host", "Hazard Guest"], 1);
    multiplayer.applySnapshot(sparse);
    const visibleBeforeHp = multiplayer.getGuestCombatReplicas();
    multiplayer.applySnapshot(sparseWithoutThreats);
    const preservedByPartialUpdate = multiplayer.getGuestCombatReplicas();
    multiplayer.applySnapshot(fullClear);
    const reconciledByFullUpdate = multiplayer.getGuestCombatReplicas();
    return { sparse, visibleBeforeHp, preservedByPartialUpdate, reconciledByFullUpdate };
  });

  expect(result.sparse.firePatches).toBeUndefined();
  expect(result.sparse.rifleTraps).toBeUndefined();
  expect(result.sparse.acidPuddles).toBeUndefined();
  expect(result.sparse.hazardUpserts.firePatches).toHaveLength(1);
  expect(result.sparse.hazardUpserts.rifleTraps).toHaveLength(1);
  expect(result.sparse.hazardUpserts.acidPuddles).toHaveLength(1);
  expect(result.visibleBeforeHp.firePatches).toHaveLength(1);
  expect(result.visibleBeforeHp.rifleTraps).toHaveLength(1);
  expect(result.visibleBeforeHp.acidPuddles).toHaveLength(1);
  expect(result.visibleBeforeHp.firePatches[0].visualAttached || result.visibleBeforeHp.firePatches[0].fallbackVisual).toBe(true);
  expect(result.visibleBeforeHp.rifleTraps[0].visualAttached).toBe(true);
  expect(result.visibleBeforeHp.acidPuddles[0].visualAttached).toBe(true);
  expect(result.preservedByPartialUpdate.firePatches).toHaveLength(1);
  expect(result.preservedByPartialUpdate.rifleTraps).toHaveLength(1);
  expect(result.preservedByPartialUpdate.acidPuddles).toHaveLength(1);
  expect(result.reconciledByFullUpdate.firePatches).toEqual([]);
  expect(result.reconciledByFullUpdate.rifleTraps).toEqual([]);
  expect(result.reconciledByFullUpdate.acidPuddles).toEqual([]);
});

test("multiplayer spitter launches authoritative acid projectiles and puddles with stable identities", async ({ page }) => {
  await openGame(page);

  const result = await page.evaluate(() => {
    const api = window.__dustMultiplayerTest;
    const gameApi = window.__dustAndDeadTest;
    api.startMockHost(["Host", "Guest"]);
    const typeSamples = gameApi.sampleZombieTypes(5, 1200);
    const shot = api.spawnSpitterShotAtPlayer("mock-player-2");
    const flight = api.buildSnapshot();
    const impacted = api.impactFirstAcidProjectile();
    const puddle = api.buildSnapshot();
    return { typeSamples, shot, flight, impacted, puddle };
  });

  expect(result.typeSamples.spitter).toBeGreaterThan(0);
  expect(result.shot).toBeTruthy();
  expect(result.flight.enemies.some((enemy) => enemy.type === "spitter")).toBe(true);
  expect(result.flight.acidProjectiles).toHaveLength(1);
  expect(result.flight.acidProjectiles[0].id).toBe(result.shot.projectileId);
  expect(result.flight.acidProjectiles[0].maxLife).toBeGreaterThan(0);
  expect(result.impacted).toBe(true);
  expect(result.puddle.acidProjectiles).toEqual([]);
  expect(result.puddle.acidPuddles).toHaveLength(1);
  expect(result.puddle.acidPuddles[0].id).toBeGreaterThan(0);
  expect(result.puddle.acidPuddles[0].life).toBeGreaterThan(5);
});

test("large spitter hordes support sixty shots and fifty pooled puddles", async ({ page }) => {
  await openGame(page);

  const result = await page.evaluate(() => {
    const api = window.__dustMultiplayerTest;
    const gameApi = window.__dustAndDeadTest;
    api.startMockHost(["Host", "Guest"]);
    for (let index = 0; index < 80; index += 1) api.spawnSpitterShotAtPlayer("mock-player-2");
    const flight = api.buildSnapshot();
    const duringFlight = gameApi.getAcidPuddleOptimizationStats();
    for (let index = 0; index < 60; index += 1) api.impactFirstAcidProjectile();
    const landed = api.buildSnapshot();
    const afterLanding = gameApi.getAcidPuddleOptimizationStats();
    return { flight, duringFlight, landed, afterLanding };
  });

  expect(result.flight.acidProjectiles).toHaveLength(60);
  expect(result.duringFlight.visuals.projectiles).toMatchObject({ created: 60, inUse: 60, maxActive: 60 });
  expect(result.landed.acidProjectiles).toEqual([]);
  expect(result.landed.acidPuddles).toHaveLength(50);
  expect(result.afterLanding.activePuddles).toBe(50);
  expect(result.afterLanding.visuals.created).toBe(50);
  expect(result.afterLanding.visuals.inUse).toBe(50);
});

test("guest renders acid, hallowed ground, and Pale Deputy replicas without simulating their damage", async ({ page }) => {
  await openGame(page);

  const result = await page.evaluate(() => {
    const api = window.__dustMultiplayerTest;
    api.startMockHost(["Marshal Host", "Guest"]);
    api.spawnSpitterShotAtPlayer("mock-player-2");
    api.spawnHallowedGround("mock-player-1", 4);
    api.spawnPaleDeputy("mock-player-1");
    const flight = api.buildSnapshot();
    api.impactFirstAcidProjectile();
    const puddle = api.buildSnapshot();

    api.startMockGuest(["Marshal Host", "Guest"], 1);
    api.applySnapshot(flight);
    const duringFlight = api.getGuestCombatReplicas();
    api.applySnapshot(puddle);
    const afterImpact = api.getGuestCombatReplicas();
    return { duringFlight, afterImpact };
  });

  expect(result.duringFlight.acidProjectiles).toHaveLength(1);
  expect(result.duringFlight.acidProjectiles[0].visualAttached).toBe(true);
  expect(result.duringFlight.hallowedGrounds).toHaveLength(1);
  expect(result.duringFlight.hallowedGrounds[0]).toMatchObject({ ownerId: "mock-player-1", visualAttached: true });
  expect(result.duringFlight.paleDeputies).toHaveLength(1);
  expect(result.duringFlight.paleDeputies[0]).toMatchObject({ ownerId: "mock-player-1", visualAttached: true });
  expect(result.afterImpact.acidProjectiles).toEqual([]);
  expect(result.afterImpact.acidPuddles).toHaveLength(1);
  expect(result.afterImpact.acidPuddles[0].visualAttached).toBe(true);
});

test("Pale Deputy interpolates between compact snapshots, snaps only on leash teleports, and plays each remote volley once", async ({ page }) => {
  await openGame(page);
  await page.waitForFunction(() => window.__dustAndDeadTest.getAudioDiagnostics().contextState === "running");

  const result = await page.evaluate(() => {
    const api = window.__dustMultiplayerTest;
    const game = window.__dustAndDeadTest;
    const clone = (value) => JSON.parse(JSON.stringify(value));
    api.startMockHost(["Marshal Host", "Guest"]);
    api.spawnPaleDeputy("mock-player-1");
    const initial = clone(api.buildSnapshot());
    const moving = clone(initial);
    moving.sequence += 1;
    moving.time += 0.1;
    moving.paleDeputies[0].x += 0.83;
    moving.paleDeputies[0].move = 1;
    moving.paleDeputies[0].shot = 1;

    api.startMockGuest(["Marshal Host", "Guest"], 1);
    api.applySnapshot(initial);
    const initialReplica = api.getGuestCombatReplicas().paleDeputies[0];
    const soundBefore = game.getAudioDiagnostics().paleDeputyShotSfxCount;
    api.applySnapshot(moving);
    window.advanceTime(50);
    const after50 = api.getGuestCombatReplicas().paleDeputies[0];
    const soundAfterFirst = game.getAudioDiagnostics().paleDeputyShotSfxCount;
    window.advanceTime(120);
    const after170 = api.getGuestCombatReplicas().paleDeputies[0];

    const repeated = clone(moving);
    repeated.sequence += 1;
    api.applySnapshot(repeated);
    const soundAfterRepeat = game.getAudioDiagnostics().paleDeputyShotSfxCount;

    const nextVolley = clone(repeated);
    nextVolley.sequence += 1;
    nextVolley.time += 0.1;
    nextVolley.paleDeputies[0].x += 0.83;
    nextVolley.paleDeputies[0].shot = 2;
    api.applySnapshot(nextVolley);
    const soundAfterSecond = game.getAudioDiagnostics().paleDeputyShotSfxCount;
    const lastShot = game.getAudioDiagnostics().lastShotSpatialization;

    const packetGap = clone(nextVolley);
    packetGap.sequence += 1;
    packetGap.time += 0.6;
    packetGap.paleDeputies[0].x += 4.98;
    api.applySnapshot(packetGap);
    const afterPacketGap = api.getGuestCombatReplicas().paleDeputies[0];

    const teleported = clone(packetGap);
    teleported.sequence += 1;
    teleported.time += 0.1;
    teleported.paleDeputies[0].x += 6;
    api.applySnapshot(teleported);
    const afterTeleport = api.getGuestCombatReplicas().paleDeputies[0];
    return {
      initialReplica,
      after50,
      after170,
      afterPacketGap,
      afterTeleport,
      teleportTargetX: teleported.paleDeputies[0].x,
      soundBefore,
      soundAfterFirst,
      soundAfterRepeat,
      soundAfterSecond,
      lastShot,
    };
  });

  expect(result.after50.velocityX).toBeGreaterThan(0);
  expect(result.after50.x).toBeGreaterThan(result.initialReplica.x);
  expect(result.after170.x).toBeGreaterThan(result.after50.x);
  expect(result.soundAfterFirst).toBe(result.soundBefore + 1);
  expect(result.soundAfterRepeat).toBe(result.soundAfterFirst);
  expect(result.soundAfterSecond).toBe(result.soundAfterFirst + 1);
  expect(result.lastShot).toMatchObject({ kind: "paleDeputy" });
  expect(result.afterPacketGap.teleportCount).toBe(0);
  expect(result.afterTeleport.teleportCount).toBe(1);
  expect(result.afterTeleport.x).toBeCloseTo(result.teleportTargetX, 2);
});

test("guest reconstructs rich zombie hit and death effects from compact enemy snapshots", async ({ page }) => {
  await openGame(page);

  const result = await page.evaluate(() => {
    const api = window.__dustMultiplayerTest;
    const gameApi = window.__dustAndDeadTest;
    api.startMockHost(["Host", "Guest"]);
    gameApi.spawnZombieAt("brute", 5, 5);
    const initial = api.buildSnapshot();
    const damaged = JSON.parse(JSON.stringify(initial));
    damaged.sequence += 1;
    damaged.enemies[0].hp = Math.max(0.5, damaged.enemies[0].hp - 1);
    const dead = JSON.parse(JSON.stringify(damaged));
    dead.sequence += 1;
    dead.enemies = [];

    api.startMockGuest(["Host", "Guest"], 1);
    api.applySnapshot(initial);
    const before = api.getNetworkCombatDiagnostics();
    api.applySnapshot(damaged);
    const afterHit = api.getNetworkCombatDiagnostics();
    api.applySnapshot(dead);
    const afterDeath = api.getNetworkCombatDiagnostics();
    return { before, afterHit, afterDeath };
  });

  expect(result.afterHit.particles).toBeGreaterThan(result.before.particles);
  expect(result.afterDeath.debris).toBeGreaterThan(0);
  expect(result.afterDeath.decals).toBeGreaterThan(0);
  expect(result.afterDeath.particles).toBeGreaterThan(result.before.particles);
});

test("rich guest death effects remain inside pooled mobile limits during a mass kill", async ({ page }) => {
  await openGame(page);

  const result = await page.evaluate(() => {
    const api = window.__dustMultiplayerTest;
    api.startMockGuest(["Host", "Guest"], 1);
    const initial = api.buildSnapshot();
    initial.sequence = 1;
    initial.enemies = Array.from({ length: 60 }, (_, index) => ({
      id: 5000 + index,
      type: index % 8 === 0 ? "brute" : "walker",
      x: -18 + (index % 12) * 3,
      z: -12 + Math.floor(index / 12) * 4,
      hp: index % 8 === 0 ? 12 : 3,
      maxHp: index % 8 === 0 ? 12 : 3,
      angle: 0,
      fx: 0,
    }));
    initial.acidProjectiles = [];
    initial.acidPuddles = [];
    initial.hallowedGrounds = [];
    initial.paleDeputies = [];
    api.applySnapshot(initial);

    const dead = JSON.parse(JSON.stringify(initial));
    dead.sequence = 2;
    dead.enemies = [];
    api.applySnapshot(dead);
    return {
      effects: api.getNetworkCombatDiagnostics(),
      limits: window.__dustAndDeadTest.getThreeObjectDiagnostics().limits,
    };
  });

  expect(result.effects.particles).toBeGreaterThan(0);
  expect(result.effects.debris).toBeGreaterThan(0);
  expect(result.effects.decals).toBeGreaterThan(0);
  expect(result.effects.particles).toBeLessThanOrEqual(result.limits.particles);
  expect(result.effects.debris).toBeLessThanOrEqual(result.limits.debris);
  expect(result.effects.decals).toBeLessThanOrEqual(result.limits.decals);
});

test("every dangerous fire patch remains visible while detailed visuals stay bounded", async ({ page }) => {
  await openGame(page);

  const result = await page.evaluate(() => {
    const api = window.__dustMultiplayerTest;
    const gameApi = window.__dustAndDeadTest;
    const started = api.startMockHost(["Pyro", "Guest"]);
    const viewer = started.players[0];
    api.setPlayerPosition("mock-player-2", viewer.x, viewer.z);
    for (let index = 0; index < 140; index += 1) {
      api.spawnFirePatch("mock-player-1", {
        x: viewer.x,
        z: viewer.z,
        radius: 1.2,
        life: 8,
        type: "trail",
      });
    }
    const optimization = gameApi.getFireOptimizationStats();
    const full = api.buildSnapshot(true, true);
    const relevant = api.buildSnapshot(true, true, "mock-player-2");
    const sparse = api.buildSnapshot(true, false, "mock-player-2");

    api.startMockGuest(["Pyro", "Guest"], 1);
    api.applySnapshot(relevant);
    const guest = api.getGuestCombatReplicas();
    api.applySnapshot(sparse);
    const guestAfterSparse = api.getGuestCombatReplicas();
    return { optimization, fullCount: full.firePatches.length, relevantCount: relevant.firePatches.length, sparseHasFire: Array.isArray(sparse.firePatches), guest, guestAfterSparse };
  });

  expect(result.optimization.activePatches).toBe(140);
  expect(result.fullCount).toBe(140);
  expect(result.optimization.visuals.activeDetailed).toBeLessThanOrEqual(result.optimization.visuals.detailedBudget);
  expect(result.optimization.visuals.detailedBudget).toBe(100);
  expect(result.relevantCount).toBe(140);
  expect(result.sparseHasFire).toBe(false);
  expect(result.guest.firePatches).toHaveLength(140);
  expect(result.guest.firePatches.filter((patch) => patch.visualAttached)).toHaveLength(100);
  expect(result.guest.firePatches.filter((patch) => patch.visualAttached || patch.fallbackVisual)).toHaveLength(140);
  expect(result.guestAfterSparse.firePatches).toHaveLength(140);
});

test("remote pyrotechnician upgrades replicate every fire zone to a late guest and clear on reset", async ({ page }) => {
  await openGame(page);

  const result = await page.evaluate(() => {
    const multiplayer = window.__dustMultiplayerTest;
    const game = window.__dustAndDeadTest;
    const started = multiplayer.startMockHost(["Host", "Remote Pyro"]);
    const remotePlayerId = started.players[1].id;
    multiplayer.setPlayerPosition(started.players[0].id, -12, -12);
    multiplayer.setPlayerPosition(remotePlayerId, 0, 0);
    multiplayer.setProgression(remotePlayerId, {
      level: 99,
      playerClass: "demolitionist",
      launcherUpgrade: "pyrotechnician",
      weapon: "launcher",
      ownedWeapons: {
        revolver: true,
        rifle: false,
        launcher: true,
        coachGun: false,
      },
    });
    const upgradeIds = [
      "rollingFlame",
      "longBurn",
      "hotterFire",
      "scorchedEarth",
      "thermiteCore",
      "backdraft",
      "crossfireShells",
    ];
    const upgradeCounts = {};
    for (const upgradeId of upgradeIds) {
      upgradeCounts[upgradeId] = multiplayer.grantUpgrade(remotePlayerId, upgradeId);
    }
    const queued = multiplayer.injectFireAction(remotePlayerId, 1, 0, 10, {
      weaponId: "launcher",
      originX: 0,
      originZ: 0,
    });
    window.advanceTime(1017);
    const accepted = multiplayer.getState().players[1].lastFireActionAccepted;
    const snapshot = JSON.parse(JSON.stringify(multiplayer.buildSnapshot(true, true, remotePlayerId)));
    const hostTypes = snapshot.firePatches.reduce((counts, patch) => {
      counts[patch.type] = (counts[patch.type] || 0) + 1;
      return counts;
    }, {});
    const allOwnedByRemote = snapshot.firePatches.every((patch) => patch.ownerId === remotePlayerId);

    game.clearFireHazards();
    const resetSnapshot = JSON.parse(JSON.stringify(multiplayer.buildSnapshot(true, true, remotePlayerId)));

    multiplayer.startMockGuest(["Host", "Remote Pyro"], 1);
    const before = multiplayer.getGuestCombatReplicas();
    multiplayer.applySnapshot(snapshot);
    window.advanceTime(1);
    const applied = multiplayer.getGuestCombatReplicas();
    multiplayer.applySnapshot(resetSnapshot);
    window.advanceTime(1);
    const cleared = multiplayer.getGuestCombatReplicas();
    multiplayer.startMockGuest(["Host", "Remote Pyro"], 1);
    const restarted = multiplayer.getGuestCombatReplicas();
    return {
      upgradeCounts,
      queued,
      accepted,
      hostTypes,
      allOwnedByRemote,
      hostCount: snapshot.firePatches.length,
      resetCount: resetSnapshot.firePatches.length,
      before,
      applied,
      cleared,
      restarted,
    };
  });

  expect(Object.values(result.upgradeCounts)).toEqual([1, 1, 1, 1, 1, 1, 1]);
  expect(result.queued).toBe(true);
  expect(result.accepted).toBe(true);
  expect(result.hostTypes).toEqual({ thermite: 1, trail: 5, fire: 1, splinter: 8 });
  expect(result.allOwnedByRemote).toBe(true);
  expect(result.hostCount).toBe(15);
  expect(result.resetCount).toBe(0);
  expect(result.before.firePatches).toEqual([]);
  expect(result.applied.firePatches).toHaveLength(15);
  expect(result.applied.firePatches.every((patch) => patch.visualAttached || patch.fallbackVisual)).toBe(true);
  expect(result.applied.simulatedFirePatches).toBe(0);
  expect(result.cleared.firePatches).toEqual([]);
  expect(result.restarted.firePatches).toEqual([]);
});

test("guest replicas use pooled visuals, expire locally, and are removed by authoritative snapshots", async ({ page }) => {
  await openGame(page);
  const snapshots = await buildHostCombatSnapshot(page);

  const result = await page.evaluate(({ first }) => {
    const api = window.__dustMultiplayerTest;
    const gameApi = window.__dustAndDeadTest;
    api.startMockGuest(["Pyro Host", "Trap Guest"], 1);
    api.applySnapshot(first);
    const initial = api.getGuestCombatReplicas();

    const updated = JSON.parse(JSON.stringify(first));
    updated.sequence += 1;
    updated.firePatches[0].life = 0.15;
    updated.rifleTraps[0].armed = true;
    api.applySnapshot(updated);
    const authoritativeUpdate = api.getGuestCombatReplicas();

    window.advanceTime(1000);
    const afterLocalTime = api.getGuestCombatReplicas();
    const afterLocalOptimization = gameApi.getFireOptimizationStats();

    const removed = JSON.parse(JSON.stringify(updated));
    removed.sequence += 1;
    removed.firePatches = [];
    removed.rifleTraps = [];
    api.applySnapshot(removed);
    const afterRemoval = api.getGuestCombatReplicas();
    return { initial, authoritativeUpdate, afterLocalTime, afterLocalOptimization, afterRemoval };
  }, snapshots);

  expect(result.initial.firePatches).toHaveLength(1);
  expect(result.initial.rifleTraps).toHaveLength(1);
  expect(result.initial.firePatches[0]).toMatchObject({ ownerId: "mock-player-1", type: "splinter", life: 4, visualAttached: false });
  expect(result.initial.rifleTraps[0]).toMatchObject({ ownerId: "mock-player-2", type: "trail-layer", armed: false, visualAttached: true });
  expect(result.initial.simulatedFirePatches).toBe(0);
  expect(result.initial.simulatedRifleTraps).toBe(0);

  expect(result.authoritativeUpdate.firePatches[0].life).toBe(0.15);
  expect(result.authoritativeUpdate.rifleTraps[0].armed).toBe(true);
  expect(result.authoritativeUpdate.firePatches[0].visualId).toBe(result.initial.firePatches[0].visualId);
  expect(result.authoritativeUpdate.rifleTraps[0].visualId).toBe(result.initial.rifleTraps[0].visualId);

  expect(result.afterLocalTime.firePatches).toEqual([]);
  expect(result.afterLocalOptimization.guestSpatialGrid.occupants).toBe(0);
  expect(result.afterLocalOptimization.guestSpatialGrid.cells).toBe(0);
  expect(result.afterLocalTime.rifleTraps[0].visualAttached).toBe(true);
  expect(result.afterRemoval.firePatches).toEqual([]);
  expect(result.afterRemoval.rifleTraps).toEqual([]);
});

test("guest animates remote cowboy limbs and keeps stable roster colors with a local accent", async ({ page }) => {
  await openGame(page);

  const result = await page.evaluate(() => {
    const api = window.__dustMultiplayerTest;
    api.startMockHost(["Host", "Guest"]);
    const snapshot = api.buildSnapshot();
    snapshot.players[0].x += 2;
    snapshot.players[0].moveAmount = 0.9;
    snapshot.players[0].walkPhase = 1.1;
    snapshot.players[0].shootKick = 0.5;

    api.startMockGuest(["Host", "Guest"], 1);
    api.applySnapshot(snapshot);
    window.advanceTime(50);
    return {
      host: api.getPlayerVisualDiagnostics("mock-player-1"),
      guest: api.getPlayerVisualDiagnostics("mock-player-2"),
    };
  });

  expect(result.host.moveAmount).toBeGreaterThan(0.1);
  expect(Math.abs(result.host.leftArmRotationX)).toBeGreaterThan(0.01);
  expect(Math.abs(result.host.rightArmRotationX)).toBeGreaterThan(0.05);
  expect(Math.abs(result.host.leftLegRotationX)).toBeGreaterThan(0.01);
  expect(result.host.cosmetics.weaponAttachments.right.rigParentIsArm).toBe(true);
  expect(result.host.cosmetics.weaponAttachments.right.handParentIsRig).toBe(true);
  expect(result.host.cosmetics.weaponAttachments.right.localPositionError).toBeLessThan(0.06);
  expect(result.host.cosmetics.weaponAttachments.right.cuffToPalmDistance).toBeLessThan(0.25);
  expect(result.host.markerColor).toBe("55d7ff");
  expect(result.guest.markerColor).toBe("ff5f57");
  expect(result.host.hasLocalAccent).toBe(false);
  expect(result.guest.hasLocalAccent).toBe(true);
});

test("guest bullet replicas expire locally when their removal snapshot is lost", async ({ page }) => {
  await openGame(page);

  const result = await page.evaluate(() => {
    const api = window.__dustMultiplayerTest;
    api.startMockGuest(["Host", "Guest"], 1);
    const snapshot = api.buildSnapshot();
    snapshot.sequence = 1;
    snapshot.bullets = [{
      id: 777,
      ownerId: "mock-player-1",
      type: "revolver",
      x: 2,
      y: 0.9,
      z: 3,
      dirX: 1,
      dirZ: 0,
      life: 0.08,
      visualWidth: 0.1,
      visualLength: 0.5,
      chainLightning: false,
    }];
    api.applySnapshot(snapshot);
    const initial = api.getGuestCombatReplicas().bullets;
    window.advanceTime(400);
    const expired = api.getGuestCombatReplicas().bullets;
    return { initial, expired };
  });

  expect(result.initial).toHaveLength(1);
  expect(result.initial[0]).toMatchObject({ id: 777, ownerId: "mock-player-1" });
  expect(result.expired).toEqual([]);
});

test("a locally predicted guest bullet is adopted by the host snapshot without a duplicate", async ({ page }) => {
  await openGame(page);

  const result = await page.evaluate(() => {
    const api = window.__dustMultiplayerTest;
    const started = api.startMockGuest(["Host", "Guest"], 1);
    const guest = started.players[1];
    const predicted = api.predictGuestShot("mock-player-2", guest.x + 20, guest.z);
    window.advanceTime(90);
    const before = api.getGuestCombatReplicas().bullets;
    const snapshot = api.buildSnapshot();
    snapshot.sequence = 1;
    snapshot.bullets = [{
      id: 901,
      ownerId: "mock-player-2",
      type: "revolver",
      startX: before[0].x,
      startY: 1,
      startZ: before[0].z,
      // Emulate an authoritative confirmation that arrives behind the visual
      // position already reached by the locally predicted projectile.
      x: before[0].x - 1.5,
      y: 1,
      z: before[0].z,
      dirX: 1,
      dirZ: 0,
      speed: 26,
      life: 0.8,
      visualWidth: 0.1,
      visualLength: 0.5,
      chainLightning: false,
    }];
    api.applySnapshot(snapshot);
    const afterConfirmation = api.getGuestCombatReplicas().bullets;
    window.advanceTime(34);
    const afterMovement = api.getGuestCombatReplicas().bullets;
    return { predicted, before, afterConfirmation, afterMovement };
  });

  expect(result.predicted).toBe(true);
  expect(result.before).toHaveLength(1);
  expect(result.before[0].predicted).toBe(true);
  expect(result.afterConfirmation).toHaveLength(1);
  expect(result.afterConfirmation[0]).toMatchObject({
    id: 901,
    ownerId: "mock-player-2",
    predicted: false,
    locallyPredicted: true,
    dirX: 1,
    dirZ: 0,
  });
  expect(result.afterConfirmation[0].x).toBeGreaterThanOrEqual(result.before[0].x - 0.001);
  expect(result.afterMovement[0].x).toBeGreaterThan(result.afterConfirmation[0].x);
});

test("a delayed authoritative bullet matches the exact client shot without replaying muzzle effects", async ({ page }) => {
  await openGame(page);

  const result = await page.evaluate(() => {
    const api = window.__dustMultiplayerTest;
    const started = api.startMockGuest(["Host", "Guest"], 1);
    const guest = started.players[1];
    const fired = api.predictAndSendGuestShot("mock-player-2", guest.x + 20, guest.z);
    window.advanceTime(450);
    const before = api.getGuestCombatReplicas().bullets;
    const snapshot = api.buildSnapshot();
    snapshot.sequence = 1;
    snapshot.bullets = [{
      id: 9901,
      ownerId: "mock-player-2",
      clientFireSequence: 1,
      type: "revolver",
      startX: guest.x,
      startY: 1,
      startZ: guest.z,
      x: guest.x + 5,
      y: 1,
      z: guest.z,
      dirX: 1,
      dirZ: 0,
      speed: 26,
      life: 0.7,
      visualWidth: 0.1,
      visualLength: 0.5,
      chainLightning: false,
      piercing: false,
    }];
    api.applySnapshot(snapshot);
    return {
      fired,
      before,
      after: api.getGuestCombatReplicas().bullets,
      sounds: api.getNetworkCombatDiagnostics().projectileSounds,
    };
  });

  expect(result.fired).toBe(true);
  expect(result.before).toHaveLength(1);
  expect(result.after).toHaveLength(1);
  expect(result.after[0]).toMatchObject({
    id: 9901,
    clientFireSequence: 1,
    predicted: false,
    locallyPredicted: true,
  });
  expect(result.sounds).toEqual([]);
});

test("a predicted guest bullet is hidden on visual zombie contact instead of flying through", async ({ page }) => {
  await openGame(page);

  const result = await page.evaluate(() => {
    const api = window.__dustMultiplayerTest;
    const game = window.__dustAndDeadTest;
    const hostState = api.startMockHost(["Host", "Guest"]);
    const guest = hostState.players[1];
    game.spawnZombieAt("walker", guest.x + 4, guest.z);
    const world = api.buildSnapshot(false, false, "mock-player-2");
    const target = world.enemies[0];

    api.startMockGuest(["Host", "Guest"], 1);
    api.applySnapshot(world);
    const fired = api.predictAndSendGuestShot("mock-player-2", target.x, target.z);
    window.advanceTime(240);
    return { fired, target, bullets: api.getGuestCombatReplicas().bullets };
  });

  expect(result.fired).toBe(true);
  expect(result.bullets).toHaveLength(1);
  expect(result.bullets[0].visualContact).toBe(true);
  expect(result.bullets[0].visualVisible).toBe(false);
  expect(result.bullets[0].instanceVisible).toBe(false);
  expect(result.bullets[0].contactEnemyId).toBe(result.target.id);
});

test("multiplayer XP can be collected by a non-owner using the collector's attraction radius", async ({ page }) => {
  await openGame(page);

  const result = await page.evaluate(() => {
    const api = window.__dustMultiplayerTest;
    api.startMockHost(["Owner", "Collector"]);
    api.setPlayerPosition("mock-player-1", -20, 0);
    api.setPlayerPosition("mock-player-2", 0, 0);
    api.spawnXpOrb("mock-player-1", 8.2, 0, 5);
    const spawned = { state: api.getState(), orbs: api.getXpOrbs(), snapshot: api.buildSnapshot() };

    window.advanceTime(200);
    const withoutRadiusUpgrade = { state: api.getState(), orbs: api.getXpOrbs() };

    api.setProgression("mock-player-2", { xpPickupRadiusBonus: 0.25 });
    window.advanceTime(2000);
    const withRadiusUpgrade = {
      state: api.getState(),
      orbs: api.getXpOrbs(),
      snapshot: api.buildSnapshot(true),
    };
    api.startMockGuest(["Owner", "Collector"], 1);
    api.applySnapshot(spawned.snapshot);
    const guestReplica = api.getXpOrbs();
    const removed = JSON.parse(JSON.stringify(spawned.snapshot));
    removed.sequence += 1;
    removed.xpOrbs = [];
    api.applySnapshot(removed);
    const guestAfterRemoval = api.getXpOrbs();
    return { spawned, withoutRadiusUpgrade, withRadiusUpgrade, guestReplica, guestAfterRemoval };
  });

  expect(result.spawned.state.players[0].progression.xp).toBe(0);
  expect(result.spawned.state.players[1].progression.xp).toBe(0);
  expect(result.spawned.orbs).toHaveLength(1);
  expect(result.spawned.orbs[0].multiplayerShared).toBe(true);
  expect(result.spawned.snapshot.xpOrbs).toHaveLength(1);
  expect(result.withoutRadiusUpgrade.state.players[1].progression.xp).toBe(0);
  expect(result.withoutRadiusUpgrade.orbs).toHaveLength(1);
  expect(result.withRadiusUpgrade.state.players[0].progression.xp).toBe(0);
  expect(result.withRadiusUpgrade.state.players[1].progression.xp).toBe(5);
  expect(result.withRadiusUpgrade.orbs).toEqual([]);
  expect(result.withRadiusUpgrade.snapshot.xpOrbs).toEqual([]);
  expect(result.guestReplica).toHaveLength(1);
  expect(result.guestReplica[0].networkReplica).toBe(true);
  expect(result.guestAfterRemoval).toEqual([]);
});

test("the host awards a contested shared XP orb exactly once", async ({ page }) => {
  await openGame(page);

  const result = await page.evaluate(() => {
    const api = window.__dustMultiplayerTest;
    api.startMockHost(["First", "Second"]);
    api.setPlayerPosition("mock-player-1", 0, 0);
    api.setPlayerPosition("mock-player-2", 0, 0);
    api.spawnXpOrb("mock-player-2", 0, 0, 7);
    window.advanceTime(20);
    return { state: api.getState(), orbs: api.getXpOrbs() };
  });

  const totals = result.state.players.map((player) => player.progression.totalXp);
  expect(result.orbs).toEqual([]);
  expect(totals.reduce((sum, value) => sum + value, 0)).toBe(7);
  expect(totals.filter((value) => value === 7)).toHaveLength(1);
});

test("guest XP replicas extrapolate between the low-rate orb snapshots", async ({ page }) => {
  await openGame(page);

  const movingSnapshot = await page.evaluate(() => {
    const api = window.__dustMultiplayerTest;
    api.startMockHost(["Collector", "Observer"]);
    api.setPlayerPosition("mock-player-1", 0, 0);
    api.spawnXpOrb("mock-player-1", 6, 0, 5);
    window.advanceTime(120);
    return JSON.parse(JSON.stringify(api.buildSnapshot(true, false, "mock-player-2")));
  });

  expect(movingSnapshot.xpOrbs).toHaveLength(1);
  expect(Math.hypot(movingSnapshot.xpOrbs[0].vx, movingSnapshot.xpOrbs[0].vz)).toBeGreaterThan(0.1);

  const result = await page.evaluate(async (snapshot) => {
    const api = window.__dustMultiplayerTest;
    api.startMockGuest(["Collector", "Observer"], 1);
    snapshot.sequence = 1;
    api.applySnapshot(snapshot);
    const before = api.getXpOrbs()[0];
    await new Promise((resolve) => setTimeout(resolve, 90));
    window.advanceTime(90);
    const after = api.getXpOrbs()[0];
    return { before, after };
  }, movingSnapshot);

  const predictedDx = result.after.x - result.before.x;
  const predictedDz = result.after.z - result.before.z;
  expect(Math.hypot(predictedDx, predictedDz)).toBeGreaterThan(0.05);
  expect(predictedDx * movingSnapshot.xpOrbs[0].vx + predictedDz * movingSnapshot.xpOrbs[0].vz).toBeGreaterThan(0);
});

test("mass XP drops aggregate into at most 140 instanced piles without losing value", async ({ page }) => {
  await openGame(page);

  const result = await page.evaluate(() => {
    const api = window.__dustMultiplayerTest;
    api.startMockHost(["Owner", "Observer"]);
    for (let index = 0; index < 500; index += 1) {
      const x = 40 + (index % 25) * 8;
      const z = -120 + Math.floor(index / 25) * 8;
      api.spawnXpOrb("mock-player-1", x, z, 1);
    }
    const orbs = api.getXpOrbs();
    const snapshot = api.buildSnapshot();
    const optimization = window.__dustAndDeadTest.getParticleOptimizationStats();
    return {
      count: orbs.length,
      totalValue: orbs.reduce((sum, orb) => sum + orb.value, 0),
      snapshotCount: snapshot.xpOrbs.length,
      snapshotValue: snapshot.xpOrbs.reduce((sum, orb) => sum + orb.value, 0),
      optimization,
    };
  });

  expect(result.count).toBe(140);
  expect(result.totalValue).toBe(500);
  expect(result.snapshotCount).toBe(140);
  expect(result.snapshotValue).toBe(500);
  expect(result.optimization.xpOrbVisuals).toMatchObject({
    maxActive: 140,
    instanced: true,
    drawnInstances: 140,
    drawCalls: 2,
  });
});

test("guest trusts recent local direction changes instead of being dragged by a stale host snapshot", async ({ page }) => {
  await openGame(page);
  const result = await page.evaluate(() => {
    const api = window.__dustMultiplayerTest;
    api.startMockGuest(["Host", "Guest"], 1);
    const baseline = api.buildSnapshot();
    baseline.sequence = 1;
    api.applySnapshot(baseline);
    const turn = api.getState().players[1];
    const stale = api.buildSnapshot();
    stale.sequence = 1000;
    stale.players.find((player) => player.id === "mock-player-2").z = turn.z - 2.2;
    api.applySnapshot(stale);
    const immediate = api.getState().players[1];
    const after = api.stepLocalGuestReconciliation(0, 1, 1 / 60).players[1];
    return { turn, immediate, after };
  });

  expect(result.turn.hasNetworkSnapshot).toBe(true);
  expect(result.immediate.z).toBeCloseTo(result.turn.z, 1);
  expect(result.after.z).toBeCloseTo(result.turn.z, 1);
  expect(result.after.z).toBeGreaterThan(result.after.networkTargetZ + 1.5);
});

test("eliminated players fall before their model is hidden", async ({ page }) => {
  await openGame(page);

  const result = await page.evaluate(() => {
    const api = window.__dustMultiplayerTest;
    api.startMockHost(["Shooter", "Target"]);
    api.setHealth("mock-player-2", 10);
    api.damagePlayer("mock-player-2", 20, "mock-player-1");
    const started = api.getPlayerVisualDiagnostics("mock-player-2");
    window.advanceTime(450);
    const falling = api.getPlayerVisualDiagnostics("mock-player-2");
    window.advanceTime(750);
    const finished = api.getPlayerVisualDiagnostics("mock-player-2");
    return { started, falling, finished };
  });

  expect(result.started.deathAnimationActive).toBe(true);
  expect(result.started.visible).toBe(true);
  expect(result.falling.deathAnimationActive).toBe(true);
  expect(result.falling.visible).toBe(true);
  expect(Math.abs(result.falling.deathRotationX)).toBeGreaterThan(0.35);
  expect(result.falling.deathPositionY).toBeGreaterThan(0.02);
  expect(result.finished.deathAnimationActive).toBe(false);
  expect(result.finished.visible).toBe(false);
});
