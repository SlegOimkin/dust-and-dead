const path = require("node:path");
const { expect, test } = require("@playwright/test");

function fileUrl(relativePath) {
  const absolute = path.resolve(__dirname, "..", relativePath).replace(/\\/g, "/");
  return `file:///${absolute}`;
}

async function startHunt(page) {
  await page.goto(`${fileUrl("index.html")}?mapSeed=7331&doppelgangerTest=1`);
  const intro = page.locator("#intro-screen");
  if (await intro.isVisible().catch(() => false)) {
    await page.keyboard.press("KeyM");
    await expect(intro).toBeHidden();
  }
  await page.getByRole("button", { name: "Start Hunt" }).click();
  await page.waitForFunction(() => Boolean(
    window.__dustAndDeadTest?.getDoppelgangerDiagnostics &&
    window.__dustAndDeadTest?.forceDoppelgangerScoutForTest &&
    window.__dustAndDeadTest?.addDoppelgangerScoutNavigationObstacleForTest &&
    window.__dustAndDeadTest?.forceDoppelgangerTransformForTest &&
    window.__dustAndDeadTest?.damageDoppelgangerScoutForTest &&
    window.__dustAndDeadTest?.damageDoppelgangerCloneForTest &&
    window.__dustAndDeadTest?.damageDoppelgangerCloneViaEnemyPipelineForTest &&
    window.__dustAndDeadTest?.runDoppelgangerFireShardPassThroughForTest &&
    window.__dustAndDeadTest?.resolveDoppelgangerCloneHitForTest &&
    window.__dustAndDeadTest?.advanceDoppelgangerCloneRuntimeForTest &&
    window.__dustAndDeadTest?.getDoppelgangerPerkParityDiagnosticsForTest &&
    window.__dustAndDeadTest?.resolveDoppelgangerCoachGunVolleyForTest &&
    window.__dustAndDeadTest?.resolveDoppelgangerLauncherExplosionForTest &&
    window.__dustAndDeadTest?.runDoppelgangerPyrotechnicianFireForTest &&
    window.__dustAndDeadTest?.runDoppelgangerPaleDeputyAttackForTest &&
    window.__dustAndDeadTest?.runDoppelgangerPurifyingSaltReciprocityForTest &&
    window.__dustAndDeadTest?.resolveDoppelgangerProjectileHitForTest &&
    window.__dustAndDeadTest?.getDoppelgangerPackedWireDiagnostics &&
    window.__dustMultiplayerTest?.buildWireSnapshot
  ));
  await page.evaluate(() => {
    window.__dustAndDeadTest.setAutomaticFrameLoopModeForTest("paused");
  });
}

test("a defeated regular boss releases one scout that survives four waves and replaces the due boss", async ({ page }) => {
  await startHunt(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    game.startWaveNow(5, "bellRinger");
    const defeated = game.forceActiveBossDefeat(true);
    const progressed = game.advanceWaveProgress(7100);
    const scoutAtSix = game.getDoppelgangerDiagnostics();
    const ordinaryWaves = [7, 8, 9].map((wave) => {
      game.startWaveNow(wave, "random");
      const diagnostic = game.getDoppelgangerDiagnostics();
      return {
        wave,
        phase: diagnostic.phase,
        dueBossWave: diagnostic.dueBossWave,
        hitsRemaining: diagnostic.hitsRemaining,
        hudVisible: diagnostic.hud.visible,
      };
    });
    const rotationBeforeDue = game.getBossRotationDiagnostics();
    const dueWave = game.startWaveNow(10, "random");
    const transformed = game.getDoppelgangerDiagnostics();
    const rotationAfterDue = game.getBossRotationDiagnostics();
    return {
      defeated,
      progressed,
      scoutAtSix,
      ordinaryWaves,
      rotationBeforeDue,
      dueWave,
      transformed,
      rotationAfterDue,
    };
  });

  expect(result.defeated).toBe(true);
  expect(result.progressed.wave).toBe(6);
  expect(result.scoutAtSix).toMatchObject({
    phase: "scout",
    sourceBossWave: 5,
    dueBossWave: 10,
    hitsRemaining: 4,
    cloneCount: 0,
    hud: { visible: false },
  });
  expect(result.ordinaryWaves).toEqual([
    { wave: 7, phase: "scout", dueBossWave: 10, hitsRemaining: 4, hudVisible: false },
    { wave: 8, phase: "scout", dueBossWave: 10, hitsRemaining: 4, hudVisible: false },
    { wave: 9, phase: "scout", dueBossWave: 10, hitsRemaining: 4, hudVisible: false },
  ]);
  expect(result.dueWave).toMatchObject({ wave: 10, wave10BossKind: "doppelganger" });
  expect(result.transformed).toMatchObject({
    active: true,
    phase: "transforming",
    dueBossWave: 10,
    cloneCount: 1,
    aliveClones: 1,
    hud: { visible: true, name: "YOU???" },
  });
  expect(result.rotationAfterDue.remaining).toEqual(result.rotationBeforeDue.remaining);
  expect(result.rotationAfterDue.lastKind).toBe(result.rotationBeforeDue.lastKind);
  expect(result.rotationAfterDue.cycle).toBe(result.rotationBeforeDue.cycle);
});

test("an active offscreen scout keeps its minimap marker before and after the XP trace pulse", async ({ page }) => {
  await startHunt(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    game.clearXpOrbs();
    const initial = game.forceDoppelgangerScoutForTest({
      sourceBossWave: 5,
      dueBossWave: 10,
      x: 170,
      z: 120,
    });
    const scout = initial.scout;
    const orb = game.spawnXpOrbAt(scout.x, scout.z, 7);
    game.advanceRealFrame(17, { render: false });
    const traced = game.getDoppelgangerDiagnostics();
    for (let frame = 0; frame < 130; frame += 1) {
      game.advanceRealFrame(17, { render: false });
    }
    return {
      orb,
      initial,
      traced,
      expired: game.getDoppelgangerDiagnostics(),
    };
  });

  expect(result.orb).not.toBeNull();
  expect(result.initial.scout).toMatchObject({
    active: true,
    minimapMarkerVisible: true,
    minimapVisibleToLocalPlayer: false,
    minimapXpTraceVisible: false,
  });
  expect(result.traced.stolenXp).toBe(7);
  expect(result.traced.scout).toMatchObject({
    minimapMarkerVisible: true,
    minimapVisibleToLocalPlayer: false,
    minimapXpTraceVisible: true,
  });
  expect(result.traced.scout.minimapXpTraceX).toBeCloseTo(result.orb.x, 1);
  expect(result.traced.scout.minimapXpTraceZ).toBeCloseTo(result.orb.z, 1);
  expect(result.expired.scout).toMatchObject({
    active: true,
    minimapMarkerVisible: true,
    minimapVisibleToLocalPlayer: false,
    minimapXpTraceVisible: false,
  });
});

test("the existing compact scout packet reconstructs the permanent minimap marker for a guest", async ({ page }) => {
  await startHunt(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const multiplayer = window.__dustMultiplayerTest;
    multiplayer.startMockHost(["Host", "Guest"]);
    const host = game.forceDoppelgangerScoutForTest({
      sourceBossWave: 5,
      dueBossWave: 10,
      x: 170,
      z: 120,
    });
    const wire = JSON.parse(JSON.stringify(
      multiplayer.buildWireSnapshot(false, false, "mock-player-2")
    ));
    const decoded = multiplayer.decodeBossState(wire.bossState);
    multiplayer.startMockGuest(["Host", "Guest"], 1);
    multiplayer.applySnapshot(wire);
    return {
      host,
      decoded,
      guest: game.getDoppelgangerDiagnostics(),
    };
  });

  expect(result.decoded).toMatchObject({
    kind: "doppelganger",
    phase: "scout",
    active: true,
  });
  expect(result.host.scout).toMatchObject({
    minimapMarkerVisible: true,
    minimapVisibleToLocalPlayer: false,
  });
  expect(result.guest).toMatchObject({
    active: true,
    replica: true,
    phase: "scout",
    scout: {
      minimapMarkerVisible: true,
      minimapVisibleToLocalPlayer: false,
    },
  });
  expect(result.guest.scout.minimapMarkerX).toBeCloseTo(
    result.host.scout.minimapMarkerX,
    1
  );
  expect(result.guest.scout.minimapMarkerZ).toBeCloseTo(
    result.host.scout.minimapMarkerZ,
    1
  );
});

test("Doppelganger cowboy visuals are staged once and reused at the transform boundary", async ({ page }) => {
  await startHunt(page);

  await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    game.clearEnemies();
    game.setAutomaticFrameLoopModeForTest("full");
  });
  await page.waitForFunction(
    () => window.__dustAndDeadTest.getDoppelgangerVisualPoolDiagnostics().prewarm.completed,
    null,
    { polling: "raf", timeout: 60_000 }
  );
  await page.evaluate(() => {
    window.__dustAndDeadTest.setAutomaticFrameLoopModeForTest("paused");
  });

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const multiplayer = window.__dustMultiplayerTest;
    const prepared = game.getDoppelgangerVisualPoolDiagnostics();
    multiplayer.startMockHost(["A", "B", "C", "D"]);
    game.forceDoppelgangerScoutForTest({
      sourceBossWave: 5,
      dueBossWave: 10,
      x: 0,
      z: 0,
    });
    const beforeTransform = game.getDoppelgangerVisualPoolDiagnostics();
    const transformed = game.forceDoppelgangerTransformForTest(false);
    const afterTransform = game.getDoppelgangerVisualPoolDiagnostics();
    // Starting another scout clears the live copy through the same production
    // cleanup path used by a replaced guest generation.
    game.forceDoppelgangerScoutForTest({
      sourceBossWave: 15,
      dueBossWave: 20,
      x: 1,
      z: 1,
    });
    const released = game.getDoppelgangerVisualPoolDiagnostics();
    return {
      prepared,
      beforeTransform,
      transformed,
      afterTransform,
      released,
    };
  });

  expect(result.prepared).toMatchObject({
    capacity: 4,
    created: 4,
    available: 4,
    inUse: 0,
    coldFallbacks: 0,
    prewarm: { completed: true, steps: 4 },
  });
  expect(result.prepared.materialCount).toBeGreaterThan(0);
  expect(result.prepared.materialCount).toBeLessThanOrEqual(16);
  expect(result.transformed).toMatchObject({
    phase: "transforming",
    cloneCount: 4,
    aliveClones: 4,
  });
  expect(result.afterTransform.created).toBe(result.beforeTransform.created);
  expect(result.afterTransform.acquireHits).toBe(result.beforeTransform.acquireHits + 4);
  expect(result.afterTransform.coldFallbacks).toBe(result.beforeTransform.coldFallbacks);
  expect(result.afterTransform).toMatchObject({ available: 0, inUse: 4 });
  expect(result.released).toMatchObject({
    created: 4,
    available: 4,
    inUse: 0,
  });
});

test("the scout counts four unique direct attacks and suppresses exactly the next boss slot", async ({ page }) => {
  await startHunt(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    game.forceDoppelgangerScoutForTest({
      sourceBossWave: 5,
      dueBossWave: 10,
      x: 0,
      z: 0,
    });
    const hit = (ownerPlayerId, sequence, direct = true) =>
      game.damageDoppelgangerScoutForTest(999, {
        type: direct ? "coachGun" : "fire",
        ownerPlayerId,
        lifeSequence: 0,
        clientFireSequence: sequence,
        volleyId: sequence,
        direct,
      });
    const chainedLightning = () =>
      game.damageDoppelgangerScoutForTest(999, {
        type: "rifleLightning",
        ownerPlayerId: "mock-player-1",
        lifeSequence: 0,
        clientFireSequence: 99,
        direct: true,
      });
    const hits = [
      hit("mock-player-1", 1),
      hit("mock-player-1", 1),
      chainedLightning(),
      hit("mock-player-2", 1),
      hit("mock-player-1", 2, false),
      hit("mock-player-1", 2),
      hit("mock-player-1", 3),
    ];
    const caught = game.getDoppelgangerDiagnostics();
    const rotationBeforeDue = game.getBossRotationDiagnostics();
    const dueWave = game.startWaveNow(10, "random");
    const suppressed = game.getDoppelgangerDiagnostics();
    const rotationAfterDue = game.getBossRotationDiagnostics();
    const nextBoss = game.startWaveNow(15, "random");
    const rotationAfterNextBoss = game.getBossRotationDiagnostics();
    const cleaned = game.getDoppelgangerDiagnostics();
    return {
      hits,
      caught,
      rotationBeforeDue,
      dueWave,
      suppressed,
      rotationAfterDue,
      nextBoss,
      rotationAfterNextBoss,
      cleaned,
    };
  });

  expect(result.hits.map((entry) => entry.hitsRemaining)).toEqual([3, 3, 3, 2, 2, 1, 0]);
  expect(result.hits.map((entry) => entry.counted)).toEqual([true, false, false, true, false, true, true]);
  expect(result.hits.map((entry) => entry.reason)).toEqual([
    "counted",
    "duplicate",
    "indirect",
    "counted",
    "indirect",
    "counted",
    "counted",
  ]);
  expect(result.hits.at(-1).phase).toBe("caught");
  expect(result.caught).toMatchObject({
    phase: "caught",
    suppressesBoss: true,
    hitsRemaining: 0,
    cloneCount: 0,
  });
  expect(result.dueWave).toMatchObject({ wave: 10, wave10BossKind: "" });
  expect(result.suppressed).toMatchObject({
    phase: "suppressed",
    suppressedWave: 10,
    suppressesBoss: true,
    cloneCount: 0,
    hud: { visible: false },
  });
  expect(result.rotationAfterDue.remaining).toEqual(result.rotationBeforeDue.remaining);
  expect(result.rotationAfterDue.lastKind).toBe(result.rotationBeforeDue.lastKind);
  expect(result.nextBoss.wave).toBe(15);
  expect(result.nextBoss.wave10BossKind).not.toBe("");
  expect(result.rotationAfterNextBoss.remaining).toHaveLength(
    result.rotationBeforeDue.remaining.length - 1
  );
  expect(result.cleaned.phase).toBe("");
});

test("the copy takes exact incoming damage and deals its snapshotted weapon damage without caps", async ({ page }) => {
  await startHunt(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    game.configureBossWeaponBuildForTest({ weapon: "revolver" });
    game.grantUpgrade("steadyHand");
    game.grantUpgrade("steadyHand");
    game.grantUpgrade("steadyHand");
    const copiedPlayerDamage =
      JSON.parse(window.render_game_to_text()).ammo.weapons.revolver.damage;

    game.forceDoppelgangerScoutForTest({ sourceBossWave: 5, dueBossWave: 10 });
    const transformed = game.forceDoppelgangerTransformForTest();
    const clone = transformed.clones[0];
    const requestedDamage = clone.maxHp * 0.55;
    const playerToClone = game.damageDoppelgangerCloneForTest(
      clone.networkId,
      requestedDamage,
      { type: "revolver", ownerPlayerId: "solo", direct: true }
    );

    game.grantUpgrade("steadyHand");
    const upgradedPlayerDamage =
      JSON.parse(window.render_game_to_text()).ammo.weapons.revolver.damage;
    game.setPlayerMaxHp(1000, 1000);
    const cloneToPlayer = game.resolveDoppelgangerCloneHitForTest(
      clone.networkId,
      "solo"
    );
    return {
      copiedPlayerDamage,
      upgradedPlayerDamage,
      transformed,
      requestedDamage,
      playerToClone,
      cloneToPlayer,
    };
  });

  expect(result.transformed).toMatchObject({
    phase: "boss",
    cloneCount: 1,
    aliveClones: 1,
    hud: {
      visible: true,
      name: "YOU???",
      status: "1 COPY REMAINS",
    },
  });
  expect(result.transformed.clones[0].copiedShotDamage).toBeCloseTo(
    result.copiedPlayerDamage,
    6
  );
  expect(result.playerToClone.requested).toBeCloseTo(result.requestedDamage, 6);
  expect(result.playerToClone.applied).toBeCloseTo(result.requestedDamage, 6);
  expect(
    result.playerToClone.hpBefore - result.playerToClone.hpAfter
  ).toBeCloseTo(result.requestedDamage, 6);
  expect(result.upgradedPlayerDamage).toBeGreaterThan(result.copiedPlayerDamage);
  expect(result.cloneToPlayer.rawDamage).toBeCloseTo(result.copiedPlayerDamage, 6);
  expect(result.cloneToPlayer.appliedDamage).toBeCloseTo(result.copiedPlayerDamage, 6);
  expect(
    result.cloneToPlayer.targetHpBefore - result.cloneToPlayer.targetHpAfter
  ).toBeCloseTo(result.copiedPlayerDamage, 6);
});

test("the scout stays 12% faster than the player's current Breach movement speed", async ({ page }) => {
  await startHunt(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    game.configureBossWeaponBuildForTest({
      playerClass: "marshal",
      weapon: "coachGun",
      marshalUpgrade: "breachMarshal",
      upgrades: ["rideTheRecoil"],
    });
    const breach = game.setBreachMomentumForTest(999, 10);
    game.forceDoppelgangerScoutForTest({
      sourceBossWave: 5,
      dueBossWave: 10,
    });
    game.advanceRealFrame(1000 / 60, { render: false });
    return {
      breach,
      scout: game.getDoppelgangerDiagnostics().scout,
    };
  });

  expect(result.breach.marshalBreachMoveMultiplier).toBeGreaterThan(1);
  expect(result.scout.fastestPlayerSpeed).toBeGreaterThan(8.3);
  expect(result.scout.speed).toBeCloseTo(
    result.scout.fastestPlayerSpeed * 1.12,
    2
  );
});

test("a scout trapped between an arena corner and a wall takes the open side out", async ({ page }) => {
  await startHunt(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    game.clearXpOrbs();
    const initial = game.forceDoppelgangerScoutForTest({
      sourceBossWave: 5,
      dueBossWave: 10,
      x: 230,
      z: 194,
    });
    const origin = initial.scout;
    const player = game.setPlayerPosition(origin.x - 14, origin.z - 0.5);
    const wall = game.addDoppelgangerScoutNavigationObstacleForTest({
      x: origin.x - 1,
      z: origin.z - 2.2,
      width: 6.4,
      depth: 0.18,
      pad: 0.04,
    });

    let minScoutX = origin.x;
    let maxDistanceFromCorner = 0;
    for (let frame = 0; frame < 180; frame += 1) {
      game.advanceRealFrame(1000 / 60, { render: false });
      const current = game.getDoppelgangerDiagnostics().scout;
      minScoutX = Math.min(minScoutX, current.x);
      maxDistanceFromCorner = Math.max(
        maxDistanceFromCorner,
        Math.hypot(current.x - origin.x, current.z - origin.z)
      );
    }

    return {
      origin,
      player,
      wall,
      minScoutX,
      maxDistanceFromCorner,
      scout: game.getDoppelgangerDiagnostics().scout,
    };
  });

  expect(result.origin.x).toBeGreaterThan(225);
  expect(result.origin.z).toBeGreaterThan(189);
  expect(result.player.x).toBeLessThan(result.origin.x);
  expect(result.minScoutX).toBeLessThan(result.origin.x - 4.6);
  expect(result.maxDistanceFromCorner).toBeGreaterThan(5);
});

test("copies are shielded while transforming and Pale Deputy keeps full damage afterward", async ({ page }) => {
  await startHunt(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    game.forceDoppelgangerScoutForTest({
      sourceBossWave: 5,
      dueBossWave: 10,
    });
    const transforming = game.forceDoppelgangerTransformForTest(false);
    const clone = transforming.clones[0];
    const shieldedHit = game.damageDoppelgangerCloneForTest(
      clone.networkId,
      25,
      { type: "revolver", ownerPlayerId: "solo", direct: true }
    );
    for (let frame = 0; frame < 76; frame += 1) {
      game.advanceRealFrame(1000 / 60, { render: false });
    }
    const boss = game.getDoppelgangerDiagnostics();
    const paleDeputyHit = game.damageDoppelgangerCloneViaEnemyPipelineForTest(
      clone.networkId,
      25,
      {
        type: "paleDeputy",
        alliedSummon: true,
        ownerPlayerId: "solo",
        direct: true,
      }
    );
    return { transforming, shieldedHit, boss, paleDeputyHit };
  });

  expect(result.transforming).toMatchObject({
    phase: "transforming",
    clones: [{ damageable: false }],
  });
  expect(result.shieldedHit.applied).toBe(0);
  expect(result.shieldedHit.hpAfter).toBe(result.shieldedHit.hpBefore);
  expect(result.boss).toMatchObject({
    phase: "boss",
    clones: [{ damageable: true }],
  });
  expect(result.paleDeputyHit.applied).toBeCloseTo(25, 6);
  expect(
    result.paleDeputyHit.hpBefore - result.paleDeputyHit.hpAfter
  ).toBeCloseTo(25, 6);
});

test("a hostile launcher fire shard passes through players and completes its fire trail", async ({ page }) => {
  await startHunt(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    game.setPlayerMaxHp(1000, 1000);
    game.forceDoppelgangerScoutForTest({
      sourceBossWave: 5,
      dueBossWave: 10,
    });
    const boss = game.forceDoppelgangerTransformForTest();
    return game.runDoppelgangerFireShardPassThroughForTest(
      boss.clones[0].networkId
    );
  });

  expect(result).not.toBeNull();
  expect(result.survivedPlayerOverlap).toBe(true);
  expect(result.removedAtEnd).toBe(true);
  expect(result.hpAfterOverlap).toBe(result.hpBefore);
  expect(result.invulnAfterOverlap).toBe(0);
  expect(result.hitPlayerCount).toBe(0);
  expect(result.trailPatchesCreated).toBeGreaterThan(0);
  expect(result.terminalPatchesCreated).toBeGreaterThan(0);
});

test("four multiplayer builds create four compact guest replicas and the YOU??? HUD", async ({ page }) => {
  await startHunt(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const multiplayer = window.__dustMultiplayerTest;
    const players = multiplayer.startMockHost(["A", "B", "C", "D"]).players;
    const builds = [
      { level: 11, playerClass: "gunslinger", weapon: "revolver" },
      { level: 12, playerClass: "ranger", weapon: "rifle" },
      { level: 13, playerClass: "demolitionist", weapon: "launcher" },
      { level: 14, playerClass: "marshal", weapon: "coachGun" },
    ];
    players.forEach((player, index) => {
      const build = builds[index];
      multiplayer.setProgression(player.id, {
        level: build.level,
        playerClass: build.playerClass,
        weapon: build.weapon,
        ownedWeapons: { [build.weapon]: true },
      });
    });

    game.forceDoppelgangerScoutForTest({ sourceBossWave: 5, dueBossWave: 10 });
    const hostBoss = game.forceDoppelgangerTransformForTest();
    const packed = game.getDoppelgangerPackedWireDiagnostics();
    const wire = JSON.parse(JSON.stringify(
      multiplayer.buildWireSnapshot(false, false, "mock-player-2")
    ));
    const decoded = multiplayer.decodeBossState(wire.bossState);
    const wireBytes = Uint8Array.from(
      atob(wire.bossState),
      (character) => character.charCodeAt(0)
    ).length;
    const hostRosterCount = multiplayer.getState().players.length;

    multiplayer.startMockGuest(["A", "B", "C", "D"], 1);
    multiplayer.applySnapshot(wire);
    game.renderNowForTest();
    const guestBoss = game.getDoppelgangerDiagnostics();
    const guestRosterCount = multiplayer.getState().players.length;
    const beforeCorrupt = JSON.parse(window.render_game_to_text());
    const corrupt = Object.assign({}, wire, {
      sequence: wire.sequence + 1,
      bossState: "not-base64",
    });
    multiplayer.applySnapshot(corrupt);
    const afterCorrupt = JSON.parse(window.render_game_to_text());
    const afterCorruptBoss = game.getDoppelgangerDiagnostics();
    return {
      builds,
      hostBoss,
      packed,
      wireVersion: wire.version,
      decoded,
      wireBytes,
      hostRosterCount,
      guestBoss,
      guestRosterCount,
      beforeCorruptSequence: beforeCorrupt.multiplayer.lastSnapshotSequence,
      afterCorruptSequence: afterCorrupt.multiplayer.lastSnapshotSequence,
      afterCorruptBoss,
    };
  });

  expect(result.hostRosterCount).toBe(4);
  expect(result.hostBoss).toMatchObject({
    phase: "boss",
    cloneCount: 4,
    aliveClones: 4,
  });
  expect(result.hostBoss.clones.map((clone) => clone.sourcePlayerId)).toEqual([
    "mock-player-1",
    "mock-player-2",
    "mock-player-3",
    "mock-player-4",
  ]);
  expect(result.hostBoss.clones.map((clone) => clone.weapon)).toEqual(
    result.builds.map((build) => build.weapon)
  );
  expect(result.hostBoss.clones.map((clone) => clone.level)).toEqual(
    result.builds.map((build) => build.level)
  );

  expect(result.packed).toMatchObject({
    protocolVersion: result.wireVersion,
    typeCode: 7,
    kind: "doppelganger",
    phase: "boss",
    cloneCount: 4,
  });
  expect(result.packed.bytes).toBeLessThanOrEqual(128);
  expect(result.wireBytes).toBeLessThanOrEqual(128);
  expect(result.decoded).toMatchObject({
    kind: "doppelganger",
    phase: "boss",
    active: true,
  });
  expect(result.decoded.clones).toHaveLength(4);
  expect(result.decoded.clones.map((clone) => clone.sourceSlot)).toEqual([0, 1, 2, 3]);

  expect(result.guestRosterCount).toBe(4);
  expect(result.guestBoss).toMatchObject({
    active: true,
    replica: true,
    phase: "boss",
    cloneCount: 4,
    aliveClones: 4,
    hud: {
      visible: true,
      name: "YOU???",
      status: "4 COPIES REMAIN",
      ariaValueNow: 100,
    },
  });
  expect(result.guestBoss.clones.map((clone) => clone.sourcePlayerId)).toEqual([
    "mock-player-1",
    "mock-player-2",
    "mock-player-3",
    "mock-player-4",
  ]);
  expect(result.beforeCorruptSequence).toBe(result.afterCorruptSequence);
  expect(result.afterCorruptBoss.clones.map((clone) => clone.networkId)).toEqual(
    result.guestBoss.clones.map((clone) => clone.networkId)
  );

  await expect(page.locator("#boss-hud")).toBeVisible();
  await expect(page.locator("#boss-hud")).toHaveClass(/is-doppelganger/);
  await expect(page.locator("#boss-name")).toHaveText("YOU???");
  await expect(page.locator("#boss-status")).toHaveText("4 COPIES REMAIN");
  await expect(page.locator(".boss-health-track")).toHaveAttribute("aria-valuenow", "100");
});

test("a caught scout is a valid latest-only packet and disappears for the guest", async ({ page }) => {
  await startHunt(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const multiplayer = window.__dustMultiplayerTest;
    multiplayer.startMockHost(["Host", "Guest"]);
    game.forceDoppelgangerScoutForTest({ sourceBossWave: 5, dueBossWave: 10 });
    for (let sequence = 1; sequence <= 4; sequence += 1) {
      game.damageDoppelgangerScoutForTest(1, {
        type: "revolver",
        ownerPlayerId: "mock-player-1",
        clientFireSequence: sequence,
        direct: true,
      });
    }
    const wire = JSON.parse(JSON.stringify(
      multiplayer.buildWireSnapshot(false, false, "mock-player-2")
    ));
    const decoded = multiplayer.decodeBossState(wire.bossState);
    multiplayer.startMockGuest(["Host", "Guest"], 1);
    multiplayer.applySnapshot(wire);
    return {
      decoded,
      guest: game.getDoppelgangerDiagnostics(),
      lastSnapshotSequence: JSON.parse(window.render_game_to_text())
        .multiplayer.lastSnapshotSequence,
      wireSequence: wire.sequence,
    };
  });

  expect(result.decoded).toMatchObject({
    kind: "doppelganger",
    phase: "caught",
    active: false,
    defeated: false,
  });
  expect(result.guest).toMatchObject({
    replica: true,
    phase: "caught",
    cloneCount: 0,
    scout: null,
    hud: { visible: false },
  });
  expect(result.lastSnapshotSequence).toBe(result.wireSequence);
});

test("the live clone AI repositions, aims, and damages the player through real projectiles", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await startHunt(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    game.clearEnemies();
    game.configureBossWeaponBuildForTest({ weapon: "revolver" });
    game.setAmmo("revolver", 6, 36);
    game.setPlayerMaxHp(1000, 1000);
    const player = game.getPlayerPosition();
    game.forceDoppelgangerScoutForTest({
      sourceBossWave: 5,
      dueBossWave: 10,
      x: player.x + 7,
      z: player.z,
    });
    const before = game.forceDoppelgangerTransformForTest();
    let sawProjectile = false;
    for (let frame = 0; frame < 360; frame += 1) {
      game.advanceRealFrame(1000 / 60, { render: false });
      if (JSON.parse(window.render_game_to_text()).bullets > 0) sawProjectile = true;
    }
    game.renderNowForTest();
    return {
      before,
      after: game.getDoppelgangerDiagnostics(),
      player: JSON.parse(window.render_game_to_text()).player,
      sawProjectile,
    };
  });

  const beforeClone = result.before.clones[0];
  const afterClone = result.after.clones[0];
  expect(result.sawProjectile).toBe(true);
  expect(afterClone.shotSequence).toBeGreaterThan(0);
  expect(afterClone.attackSequence).toBe(afterClone.shotSequence);
  expect(Math.hypot(afterClone.x - beforeClone.x, afterClone.z - beforeClone.z)).toBeGreaterThan(0.25);
  expect(result.player.hp).toBeLessThan(1000);
  expect(pageErrors).toEqual([]);
});

test("the final clone death is atomic even after the wave hard limit", async ({ page }) => {
  await startHunt(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    game.forceDoppelgangerScoutForTest({
      sourceBossWave: 5,
      dueBossWave: 10,
    });
    const dueWave = game.startWaveNow(10, "random");
    const aliveAtLimit = game.advanceWaveProgress(120100);
    for (let frame = 0; frame < 76; frame += 1) {
      game.advanceRealFrame(1000 / 60, { render: false });
    }
    const clone = game.getDoppelgangerDiagnostics().clones[0];
    const kill = game.damageDoppelgangerCloneForTest(
      clone.networkId,
      clone.maxHp,
      { type: "revolver", ownerPlayerId: "solo", direct: true }
    );
    const immediatelyAfterKill = game.getDoppelgangerDiagnostics();
    const heldForDeathPresentation = game.advanceWaveProgress(17);
    for (let frame = 0; frame < 180; frame += 1) {
      game.advanceRealFrame(1000 / 60, { render: false });
    }
    return {
      dueWave,
      aliveAtLimit,
      kill,
      immediatelyAfterKill,
      heldForDeathPresentation,
      afterPresentation: {
        wave: JSON.parse(window.render_game_to_text()).wave,
        doppelganger: game.getDoppelgangerDiagnostics(),
      },
    };
  });

  expect(result.dueWave).toMatchObject({ wave: 10, wave10BossKind: "doppelganger" });
  expect(result.aliveAtLimit.wave).toBe(10);
  expect(result.kill.applied).toBeCloseTo(result.kill.hpBefore, 6);
  expect(result.immediatelyAfterKill).toMatchObject({
    phase: "defeated",
    active: false,
    defeated: true,
    aliveClones: 0,
  });
  expect(result.heldForDeathPresentation.wave).toBe(10);
  expect(result.afterPresentation.wave).toBe(11);
});

test("defeat neutralizes and clears every in-flight clone threat before another hit", async ({ page }) => {
  await startHunt(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    game.clearEnemies();
    game.configureBossWeaponBuildForTest({ weapon: "revolver" });
    game.setAmmo("revolver", 6, 36);
    game.setPlayerMaxHp(1000, 1000);
    const player = game.getPlayerPosition();
    game.forceDoppelgangerScoutForTest({
      sourceBossWave: 5,
      dueBossWave: 10,
      x: player.x + 18,
      z: player.z,
    });
    game.forceDoppelgangerTransformForTest();
    let armed = null;
    for (let frame = 0; frame < 180; frame += 1) {
      game.advanceRealFrame(1000 / 60, { render: false });
      const diagnostic = game.getDoppelgangerDiagnostics();
      if (diagnostic.worldObjects.bullets > 0) {
        armed = diagnostic;
        break;
      }
    }
    if (!armed) throw new Error("The clone did not create an in-flight projectile");
    const hpAtKill = JSON.parse(window.render_game_to_text()).player.hp;
    const clone = armed.clones[0];
    game.damageDoppelgangerCloneForTest(
      clone.networkId,
      clone.maxHp,
      { type: "revolver", ownerPlayerId: "solo", direct: true }
    );
    const immediatelyDefeated = game.getDoppelgangerDiagnostics();
    game.advanceRealFrame(1000 / 60, { render: false });
    return {
      hpAtKill,
      hpAfterCleanup: JSON.parse(window.render_game_to_text()).player.hp,
      armed,
      immediatelyDefeated,
      afterCleanup: game.getDoppelgangerDiagnostics(),
    };
  });

  expect(result.armed.worldObjects.bullets).toBeGreaterThan(0);
  expect(result.immediatelyDefeated).toMatchObject({
    phase: "defeated",
    worldObjects: {
      cleanupPending: true,
    },
  });
  expect(result.afterCleanup.worldObjects).toMatchObject({
    cleanupPending: false,
    bullets: 0,
    firePatches: 0,
    rifleTraps: 0,
    delayedExplosions: 0,
    total: 0,
  });
  expect(result.hpAfterCleanup).toBe(result.hpAtKill);
});

test("copied transient buffs and class upkeep advance in clone-isolated runtime", async ({ page }) => {
  await startHunt(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const createClone = (build) => {
      game.configureBossWeaponBuildForTest(build);
      game.forceDoppelgangerScoutForTest({ sourceBossWave: 5, dueBossWave: 10 });
      return game.forceDoppelgangerTransformForTest().clones[0];
    };

    const duelistClone = createClone({
      playerClass: "gunslinger",
      weapon: "revolver",
      revolverUpgrade: "dualRevolvers",
      upgrades: ["fanTheHammer", "duelistFocus"],
    });
    const duelist = game.advanceDoppelgangerCloneRuntimeForTest(
      duelistClone.networkId,
      {
        seconds: 0.25,
        moveAmount: 1,
        progression: {
          fanTheHammerTimer: 1,
          duelistFocus: 0,
        },
      }
    );

    const marshalClone = createClone({
      playerClass: "marshal",
      weapon: "coachGun",
      marshalUpgrade: "graveWarden",
      upgrades: [
        "purifyingSalt",
        "stillness",
        "heavensBounty",
        "hallowedGround",
      ],
    });
    const marshalStartHp = marshalClone.maxHp - 10;
    const marshal = game.advanceDoppelgangerCloneRuntimeForTest(
      marshalClone.networkId,
      {
        seconds: 0.3,
        moveAmount: 0,
        hp: marshalStartHp,
        spawnHallowedGround: true,
        progression: {
          marshalPurifyReloadTimer: 0.8,
          marshalStillnessRemaining: 0.2,
          marshalBountyTimer: 0.8,
        },
      }
    );

    const launcherClone = createClone({
      playerClass: "demolitionist",
      weapon: "launcher",
      launcherUpgrade: "pyrotechnician",
    });
    const launcher = game.advanceDoppelgangerCloneRuntimeForTest(
      launcherClone.networkId,
      {
        seconds: 0.1,
        progression: {
          launcherFireBuffActive: true,
          launcherFireAmmoAccumulator: 0.75,
        },
      }
    );
    return { duelist, marshal, marshalStartHp, launcher };
  });

  expect(result.duelist.clone.runtime.fanTheHammerTimer).toBeCloseTo(0.75, 5);
  expect(result.duelist.clone.runtime.duelistFocus).toBeGreaterThan(0);
  expect(result.duelist.original.fanTheHammerTimer).toBe(0);
  expect(result.duelist.original.duelistFocus).toBe(0);

  expect(result.marshal.clone.runtime.marshalPurifyReloadTimer).toBeCloseTo(0.5, 5);
  expect(result.marshal.clone.runtime.marshalStillnessRemaining).toBe(0);
  expect(result.marshal.clone.runtime.marshalBountyTimer).toBeCloseTo(0.5, 5);
  expect(result.marshal.ownedHallowedGrounds).toBe(1);
  expect(result.marshal.hp).toBeGreaterThan(result.marshalStartHp);

  expect(result.launcher.clone.runtime.launcherFireBuffActive).toBe(false);
  expect(result.launcher.clone.runtime.launcherFireAmmoAccumulator).toBe(0);
});

test("hostile hits preserve traps, lightning, and strict boss-target revolver symmetry", async ({ page }) => {
  await startHunt(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const createClone = (build) => {
      game.configureBossWeaponBuildForTest(build);
      game.forceDoppelgangerScoutForTest({ sourceBossWave: 5, dueBossWave: 10 });
      return game.forceDoppelgangerTransformForTest().clones[0];
    };

    game.setPlayerMaxHp(1000, 1000);
    const trapClone = createClone({
      playerClass: "ranger",
      weapon: "rifle",
      rifleUpgrade: "trailWarden",
      upgrades: ["snapTraps"],
    });
    const snapTrap = game.resolveDoppelgangerProjectileHitForTest(
      trapClone.networkId,
      "solo",
      {
        type: "rifle",
        damage: 10,
        plantsTrap: true,
        triggerTrap: true,
      }
    );

    game.setPlayerMaxHp(1000, 1000);
    const lightningClone = createClone({
      playerClass: "ranger",
      weapon: "rifle",
      rifleUpgrade: "leverBarrage",
      upgrades: ["chainLightning", "stormTempo"],
    });
    const lightning = game.resolveDoppelgangerProjectileHitForTest(
      lightningClone.networkId,
      "solo",
      {
        type: "rifle",
        damage: 10,
        chainLightning: true,
      }
    );

    game.setPlayerMaxHp(100, 28);
    const executionerClone = createClone({
      playerClass: "gunslinger",
      weapon: "revolver",
      revolverUpgrade: "bigIron",
      upgrades: ["executioner"],
    });
    game.damageDoppelgangerCloneForTest(
      executionerClone.networkId,
      72,
      { type: "testSetup", ownerPlayerId: "solo", direct: true }
    );
    const playerExecutioner = game.damageDoppelgangerCloneViaEnemyPipelineForTest(
      executionerClone.networkId,
      10,
      {
        type: "revolver",
        ownerPlayerId: "solo",
        executioner: true,
        direct: true,
      }
    );
    const executioner = game.resolveDoppelgangerProjectileHitForTest(
      executionerClone.networkId,
      "solo",
      {
        type: "revolver",
        damage: 10,
      }
    );

    game.setPlayerMaxHp(1000, 1000);
    const bigIronClone = createClone({
      playerClass: "gunslinger",
      weapon: "revolver",
      revolverUpgrade: "bigIron",
      upgrades: [
        "throughAndThrough",
        "heavyRupture",
        "leadBloom",
        "silverCache",
      ],
    });
    const bigIronHits = [];
    for (let hit = 1; hit <= 4; hit += 1) {
      bigIronHits.push(game.resolveDoppelgangerProjectileHitForTest(
        bigIronClone.networkId,
        "solo",
        {
          type: "revolver",
          damage: 10,
          throughAndThrough: true,
          heavyRupture: true,
          leadBloom: true,
          silverBullet: true,
          ...(hit === 1 ? { cloneAmmoCurrent: 0 } : {}),
        }
      ));
    }

    game.setPlayerMaxHp(1000, 1000);
    const dualClone = createClone({
      playerClass: "gunslinger",
      weapon: "revolver",
      revolverUpgrade: "dualRevolvers",
      upgrades: [
        "ricochetRounds",
        "trickShot",
        "fanTheHammer",
        "allRightAllLeft",
      ],
    });
    const dualHits = [];
    for (let hit = 1; hit <= 8; hit += 1) {
      dualHits.push(game.resolveDoppelgangerProjectileHitForTest(
        dualClone.networkId,
        "solo",
        {
          type: "revolver",
          damage: 10,
          dualHand: hit % 2 ? "right" : "left",
          ricochetRemaining: 1,
          resolveRebound: true,
        }
      ));
    }
    return {
      snapTrap,
      lightning,
      executioner,
      playerExecutioner,
      bigIronHits,
      dualHits,
    };
  });

  expect(result.snapTrap.trapsCreated).toBe(1);
  expect(result.snapTrap.trapsRemaining).toBe(0);
  expect(result.snapTrap.directAppliedDamage).toBeCloseTo(10, 6);
  expect(result.snapTrap.trapAppliedDamage).toBeCloseTo(4, 6);
  expect(result.snapTrap.appliedDamage).toBeCloseTo(14, 6);

  expect(result.lightning.primaryLightningDamage).toBe(3);
  expect(result.lightning.directAppliedDamage).toBeCloseTo(13, 6);
  expect(result.lightning.appliedDamage).toBeCloseTo(13, 6);
  expect(result.lightning.cloneRuntime.rifleLightningStrikes).toBe(
    result.lightning.cloneRuntime.rifleLightningStrikesBefore + 1
  );
  expect(result.lightning.cloneRuntime.rifleStormTempoTimer).toBeCloseTo(1.65, 6);
  expect(result.lightning.originalRuntime.rifleLightningStrikesAfter).toBe(
    result.lightning.originalRuntime.rifleLightningStrikesBefore
  );
  expect(result.lightning.originalRuntime.rifleStormTempoTimerAfter).toBe(
    result.lightning.originalRuntime.rifleStormTempoTimerBefore
  );

  expect(result.executioner.executioner).toBe(true);
  expect(result.executioner.targetHpBefore).toBe(28);
  expect(result.executioner.targetHpAfter).toBeCloseTo(14.5, 6);
  expect(result.executioner.appliedDamage).toBeCloseTo(13.5, 6);
  expect(result.playerExecutioner.applied).toBeCloseTo(
    result.executioner.appliedDamage,
    6
  );

  expect(result.bigIronHits.map((hit) => hit.directAppliedDamage)).toEqual([
    15,
    15,
    15,
    20,
  ]);
  expect(result.bigIronHits.map((hit) => hit.cloneRuntime.bossBigIronHitCounter))
    .toEqual([1, 2, 3, 4]);
  expect(result.bigIronHits[2].cloneRuntime.bossBigIronSilverHits).toBe(0);
  expect(result.bigIronHits[2].cloneRuntime.revolverAmmo).toBe(2);
  expect(result.bigIronHits[3].cloneRuntime.bossBigIronSilverHits).toBe(1);
  expect(result.bigIronHits[3].originalRuntime.bossBigIronHitCounter).toBe(0);

  expect(result.dualHits.map((hit) => hit.directAppliedDamage)).toEqual([
    10,
    10.5,
    11,
    11.5,
    12,
    12.5,
    12.5,
    12.5,
  ]);
  for (const hit of result.dualHits) {
    expect(hit.reboundAppliedDamage).toBeCloseTo(4.7, 6);
  }
  expect(result.dualHits[7].cloneRuntime).toMatchObject({
    bossDualStacks: 5,
    bossDualHitCounter: 8,
    fanTheHammerTimer: 0.65,
    dualFreeReloadsEarned: 1,
  });
  expect(result.dualHits[7].originalRuntime).toMatchObject({
    bossDualStacks: 0,
    bossDualHitCounter: 0,
    fanTheHammerTimer: 0,
    dualFreeReloadsEarned: 0,
  });
});

test("Grave Warden copies use exact mark, Sanctified Lead, Stillness, and raw incoming damage", async ({ page }) => {
  await startHunt(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    game.setPlayerMaxHp(100000, 100000);
    game.configureBossWeaponBuildForTest({
      playerClass: "marshal",
      weapon: "coachGun",
      marshalUpgrade: "graveWarden",
      upgradeCounts: {
        sanctifiedLead: 2,
        stillness: 1,
        rockSalt: 1,
      },
    });
    game.forceDoppelgangerScoutForTest({
      sourceBossWave: 5,
      dueBossWave: 10,
    });
    const clone = game.forceDoppelgangerTransformForTest().clones[0];
    const first = game.resolveDoppelgangerCoachGunVolleyForTest(
      clone.networkId,
      "solo",
      { pellets: 7, distance: 0.8 }
    );
    const marked = game.resolveDoppelgangerCoachGunVolleyForTest(
      clone.networkId,
      "solo",
      { pellets: 7, distance: 0.8 }
    );
    const braced = game.resolveDoppelgangerCoachGunVolleyForTest(
      clone.networkId,
      "solo",
      { pellets: 7, distance: 0.8, braced: true }
    );
    const followup = game.resolveDoppelgangerCoachGunVolleyForTest(
      clone.networkId,
      "solo",
      { pellets: 7, distance: 0.8 }
    );
    const incoming = game.damageDoppelgangerCloneForTest(
      clone.networkId,
      123.456,
      {
        type: "coachGun",
        ownerPlayerId: "solo",
        direct: true,
      }
    );
    return { first, marked, braced, followup, incoming };
  });

  expect(result.first.diagnostics.marked).toBe(true);
  expect(result.first.diagnostics.speedMultiplier).toBe(0.75);
  expect(result.marked.applied / result.first.applied).toBeCloseTo(
    (1.3 * 1.24) / 1.15,
    6
  );
  expect(result.braced.applied / result.marked.applied).toBeCloseTo(1.5, 6);
  expect(result.followup.applied / result.marked.applied).toBeCloseTo(1.25, 6);
  expect(result.braced.diagnostics.stillnessRemaining).toBeGreaterThan(0);
  expect(result.followup.diagnostics.stillnessRemaining).toBe(0);
  expect(result.incoming.applied).toBeCloseTo(123.456, 6);
  expect(result.incoming.hpBefore - result.incoming.hpAfter).toBeCloseTo(
    123.456,
    6
  );
});

test("Coach Gun pellets choose the nearest collinear player only", async ({ page }) => {
  await startHunt(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const multiplayer = window.__dustMultiplayerTest;
    const players = multiplayer.startMockHost(["Front", "Rear"]).players;
    multiplayer.setProgression(players[0].id, {
      playerClass: "marshal",
      weapon: "coachGun",
      ownedWeapons: { coachGun: true },
      marshalUpgrade: "graveWarden",
      upgradeCounts: {},
    });
    const anchor = { x: -28, z: -22 };
    multiplayer.setPlayerPosition(players[0].id, anchor.x, anchor.z);
    multiplayer.setPlayerPosition(players[1].id, anchor.x + 3, anchor.z);
    const before = multiplayer.getState().players;
    game.forceDoppelgangerScoutForTest({
      sourceBossWave: 5,
      dueBossWave: 10,
      x: anchor.x - 5,
      z: anchor.z,
    });
    const clone = game.forceDoppelgangerTransformForTest().clones[0];
    const volley = game.resolveDoppelgangerCoachGunVolleyForTest(
      clone.networkId,
      players[0].id,
      { pellets: 7, distance: 2, spread: 0 }
    );
    const after = multiplayer.getState().players;
    return {
      frontId: players[0].id,
      rearId: players[1].id,
      before,
      after,
      volley,
    };
  });

  expect(result.volley.assignedPellets).toBe(7);
  expect(result.volley.hits).toEqual([
    expect.objectContaining({
      playerId: result.frontId,
      pellets: 7,
    }),
  ]);
  expect(result.after[0].hp).toBeLessThan(result.before[0].hp);
  expect(result.after[1].hp).toBe(result.before[1].hp);
});

test("Bombardier copy counts direct player hits once and never damages zombies", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await startHunt(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const multiplayer = window.__dustMultiplayerTest;
    game.clearEnemies();
    game.setPlayerMaxHp(100000, 100000);
    game.configureBossWeaponBuildForTest({
      playerClass: "demolitionist",
      weapon: "launcher",
      launcherUpgrade: "bombardier",
      upgrades: [
        "clusterCharge",
        "moreBomblets",
        "moreBomblets",
        "shrapnelRain",
        "powderEcho",
        "chainDetonation",
        "moreChainDetonations",
        "moreChainDetonations",
        "fullSalvo",
        "madmansJourney",
      ],
    });
    const player = game.getPlayerPosition();
    multiplayer.spawnEnemyAt(player.x, player.z, "walker", 1000);
    game.forceDoppelgangerScoutForTest({
      sourceBossWave: 5,
      dueBossWave: 10,
      x: player.x + 4,
      z: player.z,
    });
    const clone = game.forceDoppelgangerTransformForTest().clones[0];
    return game.resolveDoppelgangerLauncherExplosionForTest(
      clone.networkId,
      "solo",
      {
        shots: 4,
        damage: 1,
        radius: 8,
        powderEcho: true,
        zeroAmmo: true,
        targetMaxHp: 100000,
        targetHp: 100000,
      }
    );
  });

  expect(result.sourceResults.map((entry) => entry.killedEnemies)).toEqual([
    0,
    0,
    0,
    0,
  ]);
  expect(result.sourceResults.map((entry) => entry.applied)).toEqual([
    8.22,
    9.28,
    8.22,
    9.28,
  ]);
  expect(result.enemyHpAfter).toBe(result.enemyHpBefore);
  expect(result.diagnostics).toMatchObject({
    launcherDirectHits: 4,
    launcherSalvoHits: 0,
    launcherMadmanStacks: 2,
    launcherMadmanTriggers: 2,
    launcherAmmoRefills: 1,
    launcherAmmo: 2,
  });
  expect(result.derivedOwners.length).toBeGreaterThan(0);
  expect(result.ownerIsolation).toBe(true);
  expect(pageErrors).toEqual([]);
});

test("a hostile Pale Deputy hits players per pellet but never enters the zombie damage branch", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await startHunt(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const multiplayer = window.__dustMultiplayerTest;
    game.clearEnemies();
    const players = multiplayer.startMockHost(["Marshal", "Partner"]).players;
    multiplayer.setProgression(players[0].id, {
      playerClass: "marshal",
      weapon: "coachGun",
      ownedWeapons: { coachGun: true },
      marshalUpgrade: "graveWarden",
      upgradeCounts: { lastRites: 1, hallowedGround: 1 },
    });
    multiplayer.setPlayerPosition(players[0].id, -24, -20);
    multiplayer.setPlayerPosition(players[1].id, 20, 20);
    multiplayer.spawnEnemyAt(-21, -20, "walker", 1000);
    game.forceDoppelgangerScoutForTest({
      sourceBossWave: 5,
      dueBossWave: 10,
      x: -27,
      z: -20,
    });
    const clone = game.forceDoppelgangerTransformForTest().clones[0];
    return game.runDoppelgangerPaleDeputyAttackForTest(
      clone.networkId,
      players[0].id
    );
  });

  expect(result).not.toBeNull();
  expect(result).toMatchObject({
    fired: true,
    hostile: true,
    selectedPlayer: true,
    ownerIsolated: true,
    cloneInsideOwnHallowed: true,
    originalInsideCloneHallowed: false,
  });
  expect(result.applied).toBeGreaterThan(0);
  expect(result.enemyHpAfter).toEqual(result.enemyHpBefore);
  expect(result.diagnostics.deputies).toBe(1);
  expect(result.diagnostics.deputyOwners).toEqual([result.ownerId]);
  expect(pageErrors).toEqual([]);
});

test("defeating one copy clears only that owner's status maps", async ({ page }) => {
  await startHunt(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const multiplayer = window.__dustMultiplayerTest;
    const players = multiplayer.startMockHost(["Warden A", "Warden B"]).players;
    for (const player of players) {
      multiplayer.setProgression(player.id, {
        playerClass: "marshal",
        weapon: "coachGun",
        ownedWeapons: { coachGun: true },
        marshalUpgrade: "graveWarden",
        upgradeCounts: { rockSalt: 1 },
      });
    }
    multiplayer.setPlayerPosition(players[0].id, -26, -22);
    multiplayer.setPlayerPosition(players[1].id, 20, 20);
    game.forceDoppelgangerScoutForTest({
      sourceBossWave: 5,
      dueBossWave: 10,
      x: -30,
      z: -22,
    });
    const boss = game.forceDoppelgangerTransformForTest();
    const cloneA = boss.clones[0];
    const cloneB = boss.clones[1];
    game.resolveDoppelgangerCoachGunVolleyForTest(
      cloneA.networkId,
      players[0].id,
      { pellets: 1, distance: 1, marked: true }
    );
    game.resolveDoppelgangerCoachGunVolleyForTest(
      cloneB.networkId,
      players[0].id,
      { pellets: 1, distance: 1, marked: true }
    );
    const beforeA = game.getDoppelgangerPerkParityDiagnosticsForTest(
      cloneA.networkId,
      players[0].id
    );
    const beforeB = game.getDoppelgangerPerkParityDiagnosticsForTest(
      cloneB.networkId,
      players[0].id
    );
    game.damageDoppelgangerCloneForTest(
      cloneA.networkId,
      cloneA.maxHp,
      { type: "revolver", ownerPlayerId: players[0].id, direct: true }
    );
    const afterA = game.getDoppelgangerPerkParityDiagnosticsForTest(
      cloneA.networkId,
      players[0].id
    );
    const afterB = game.getDoppelgangerPerkParityDiagnosticsForTest(
      cloneB.networkId,
      players[0].id
    );
    return {
      cloneAOwner: beforeA.ownerId,
      cloneBOwner: beforeB.ownerId,
      beforeA,
      beforeB,
      afterA,
      afterB,
      boss: game.getDoppelgangerDiagnostics(),
    };
  });

  expect(result.cloneAOwner).not.toBe(result.cloneBOwner);
  expect(result.beforeA.marked).toBe(true);
  expect(result.beforeB.marked).toBe(true);
  expect(result.afterA.marked).toBe(false);
  expect(result.afterA.markTimer).toBe(0);
  expect(result.afterB.marked).toBe(true);
  expect(result.afterB.markTimer).toBeGreaterThan(0);
  expect(result.afterB.speedMultiplier).toBe(0.75);
  expect(result.boss.aliveClones).toBe(1);
});

test("Grave Tithe, Last Rites, Passing Judgment, and Bounty use boss-volley cadence", async ({ page }) => {
  await startHunt(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const multiplayer = window.__dustMultiplayerTest;
    const players = multiplayer.startMockHost(["Marked", "Nearby"]).players;
    multiplayer.setProgression(players[0].id, {
      playerClass: "marshal",
      weapon: "coachGun",
      ownedWeapons: { coachGun: true },
      marshalUpgrade: "graveWarden",
      upgradeCounts: {
        graveTithe: 1,
        lastRites: 1,
        passingJudgment: 1,
        heavensBounty: 1,
      },
    });
    multiplayer.setPlayerPosition(players[0].id, -22, -20);
    multiplayer.setPlayerPosition(players[1].id, -22, -16);
    game.forceDoppelgangerScoutForTest({
      sourceBossWave: 5,
      dueBossWave: 10,
      x: -26,
      z: -20,
    });
    const clone = game.forceDoppelgangerTransformForTest().clones[0];
    const volleys = [];
    for (let volley = 0; volley < 4; volley += 1) {
      volleys.push(game.resolveDoppelgangerCoachGunVolleyForTest(
        clone.networkId,
        players[0].id,
        {
          pellets: 1,
          distance: 1,
          ...(volley === 0 ? { marked: true, bounty: true } : {}),
        }
      ));
    }
    return {
      volleys,
      markedTarget: game.getDoppelgangerPerkParityDiagnosticsForTest(
        clone.networkId,
        players[0].id
      ),
      nearbyTarget: game.getDoppelgangerPerkParityDiagnosticsForTest(
        clone.networkId,
        players[1].id
      ),
    };
  });

  expect(result.volleys[2].diagnostics).toMatchObject({
    markedVolleys: 0,
    ritesVolleys: 3,
    passingVolleys: 0,
    bountyHits: 0,
    bountiesClaimed: 1,
    generatedShells: 4,
    bounty: false,
  });
  expect(result.nearbyTarget.marked).toBe(true);
  expect(result.markedTarget).toMatchObject({
    markedVolleys: 1,
    ritesVolleys: 0,
    passingVolleys: 1,
    bountiesClaimed: 1,
    generatedShells: 4,
    deputies: 1,
  });
  expect(result.markedTarget.deputyOwners).toEqual([
    result.markedTarget.ownerId,
  ]);
});

test("Purifying Salt removes only the opposing side's projectiles", async ({ page }) => {
  await startHunt(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    game.configureBossWeaponBuildForTest({
      playerClass: "marshal",
      weapon: "coachGun",
      marshalUpgrade: "graveWarden",
      upgrades: ["purifyingSalt"],
    });
    game.forceDoppelgangerScoutForTest({
      sourceBossWave: 5,
      dueBossWave: 10,
    });
    const clone = game.forceDoppelgangerTransformForTest().clones[0];
    return game.runDoppelgangerPurifyingSaltReciprocityForTest(
      clone.networkId
    );
  });

  expect(result.cloneCleansed).toBe(1);
  expect(result.afterCloneOwners).toEqual([result.ownerId]);
  expect(result.playerCleansed).toBe(1);
  expect(result.afterPlayerOwners).toEqual([result.playerOwnerId]);
});

test("Pyrotechnician fire uses the shared Scorched slow and thermite does not double-tick inside fire", async ({ page }) => {
  await startHunt(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    game.setPlayerMaxHp(10000, 10000);
    game.configureBossWeaponBuildForTest({
      playerClass: "demolitionist",
      weapon: "launcher",
      launcherUpgrade: "pyrotechnician",
      upgrades: ["scorchedEarth", "thermiteCore", "hotterFire"],
    });
    const player = game.getPlayerPosition();
    game.forceDoppelgangerScoutForTest({
      sourceBossWave: 5,
      dueBossWave: 10,
      x: player.x + 4,
      z: player.z,
    });
    const clone = game.forceDoppelgangerTransformForTest().clones[0];
    return game.runDoppelgangerPyrotechnicianFireForTest(
      clone.networkId,
      "solo"
    );
  });

  expect(result.patchCreated).toBe(true);
  expect(result.fireApplied).toBeGreaterThan(0);
  expect(result.speedMultiplier).toBe(0.72);
  expect(result.burnAttached).toBe(true);
  expect(result.insideThermiteApplied).toBe(0);
  expect(result.outsideThermiteApplied).toBeGreaterThan(0);
  expect(result.launcher.ownerIsolation).toBe(true);
});
