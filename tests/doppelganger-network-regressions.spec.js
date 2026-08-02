const path = require("node:path");
const { expect, test } = require("@playwright/test");

function fileUrl(relativePath) {
  const absolute = path.resolve(__dirname, "..", relativePath).replace(/\\/g, "/");
  return `file:///${absolute}`;
}

async function openDoppelgangerGame(page) {
  await page.goto(`${fileUrl("index.html")}?mapSeed=7331&doppelgangerTest=1`);
  const intro = page.locator("#intro-screen");
  if (await intro.isVisible().catch(() => false)) {
    await page.keyboard.press("KeyM");
    await expect(intro).toBeHidden();
  }
  await page.getByRole("button", { name: "Start Hunt" }).click();
  await page.waitForFunction(() => Boolean(
    window.__dustAndDeadTest?.forceDoppelgangerScoutForTest &&
    window.__dustAndDeadTest?.forceDoppelgangerTransformForTest &&
    window.__dustAndDeadTest?.getDoppelgangerDiagnostics &&
    window.__dustAndDeadTest?.resolveDoppelgangerProjectileHitForTest &&
    window.__dustMultiplayerTest?.buildWireSnapshot &&
    window.__dustMultiplayerTest?.decodeRifleTrapState &&
    window.__dustMultiplayerTest?.packPlayerWireEntries
  ));
  await page.evaluate(() => {
    window.__dustAndDeadTest.setAutomaticFrameLoopModeForTest("paused");
  });
}

test("a sparse copy slot survives the rifle-trap codec with identical host and guest owner ids", async ({ page }) => {
  await openDoppelgangerGame(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const multiplayer = window.__dustMultiplayerTest;
    const names = ["Host", "Second", "Third", "Ranger"];
    multiplayer.startMockHost(names);
    multiplayer.setProgression("mock-player-4", {
      playerClass: "ranger",
      weapon: "rifle",
      ownedWeapons: { revolver: true, rifle: true },
      upgradeCounts: { snapTraps: 1 },
      ammo: { revolver: 6, rifle: 12, launcher: 0, coachGun: 0 },
      ammoReserve: { revolver: 36, rifle: 48, launcher: 0, coachGun: 0 },
    });

    game.forceDoppelgangerScoutForTest({ sourceBossWave: 5, dueBossWave: 10 });
    const hostBoss = game.forceDoppelgangerTransformForTest();
    const sparseHostClone = hostBoss.clones.find((clone) => clone.sourceSlot === 3);
    if (!sparseHostClone) throw new Error("Missing source-slot 3 clone");

    const planted = game.resolveDoppelgangerProjectileHitForTest(
      sparseHostClone.networkId,
      "mock-player-2",
      { type: "rifle", damage: 1, plantsTrap: true }
    );
    const hostSnapshot = multiplayer.buildSnapshot(false, true, "mock-player-2");
    const wire = JSON.parse(JSON.stringify(
      multiplayer.buildWireSnapshot(false, true, "mock-player-2")
    ));
    const packedTrapField = wire.rt || wire.ru;
    const decodedTraps = multiplayer.decodeRifleTrapState(packedTrapField);
    const decodedBoss = multiplayer.decodeBossState(wire.bossState);
    const hostTrap = hostSnapshot.rifleTraps.find(
      (trap) => trap.ownerId === "doppel:copy-4"
    );

    multiplayer.startMockGuest(names, 1);
    multiplayer.applySnapshot(wire);
    const guestBoss = game.getDoppelgangerDiagnostics();
    const guestReplicas = multiplayer.getGuestCombatReplicas();
    const sparseGuestClone = guestBoss.clones.find((clone) => clone.sourceSlot === 3);
    const guestTrap = guestReplicas.rifleTraps.find(
      (trap) => trap.ownerId === "doppel:copy-4"
    );

    return {
      planted,
      packedTrapField,
      hostClone: sparseHostClone,
      decodedClone: decodedBoss.clones.find((clone) => clone.sourceSlot === 3),
      guestClone: sparseGuestClone,
      hostTrap,
      decodedTrap: decodedTraps && decodedTraps.find(
        (trap) => trap.ownerId === "doppel:copy-4"
      ),
      guestTrap,
    };
  });

  expect(result.planted).toMatchObject({ plantsTrap: true, trapsCreated: 1 });
  expect(typeof result.packedTrapField).toBe("string");
  expect(result.packedTrapField.length).toBeGreaterThan(0);
  expect(result.hostClone).toMatchObject({
    sourceSlot: 3,
    networkId: "doppel-copy-4",
    sourcePlayerId: "mock-player-4",
  });
  expect(result.decodedClone).toMatchObject({ sourceSlot: 3 });
  expect(result.guestClone).toMatchObject({
    sourceSlot: 3,
    networkId: result.hostClone.networkId,
    sourcePlayerId: result.hostClone.sourcePlayerId,
  });
  expect(result.hostTrap).toMatchObject({ ownerId: "doppel:copy-4" });
  expect(result.decodedTrap).toMatchObject({
    id: result.hostTrap.id,
    ownerId: result.hostTrap.ownerId,
  });
  expect(result.guestTrap).toMatchObject({
    id: result.hostTrap.id,
    ownerId: result.hostTrap.ownerId,
  });
});

test("player wire format 2 drives and then resets the live local-guest movement multiplier", async ({ page }) => {
  await openDoppelgangerGame(page);

  const setup = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const multiplayer = window.__dustMultiplayerTest;
    const names = ["Host", "Guest"];
    multiplayer.startMockHost(names);

    const slowWire = JSON.parse(JSON.stringify(
      multiplayer.buildWireSnapshot(false, false, "mock-player-2")
    ));
    const slowPlayers = multiplayer.decodePlayerWireEntries(slowWire.ps);
    slowPlayers.find((player) => player.id === "mock-player-2")
      .doppelMoveMultiplier = 0.5;
    slowWire.ps = multiplayer.packPlayerWireEntries(slowPlayers);

    const resetWire = JSON.parse(JSON.stringify(slowWire));
    resetWire.sequence = slowWire.sequence + 1;
    const resetPlayers = multiplayer.decodePlayerWireEntries(resetWire.ps);
    resetPlayers.find((player) => player.id === "mock-player-2")
      .doppelMoveMultiplier = 1;
    resetWire.ps = multiplayer.packPlayerWireEntries(resetPlayers);

    const roundTrip = multiplayer.decodePlayerWireEntries(slowWire.ps);
    const roundTripGuest = roundTrip.find(
      (player) => player.id === "mock-player-2"
    );

    multiplayer.startMockGuest(names, 1);
    multiplayer.applySnapshot(slowWire);

    let corridor = null;
    for (let z = -80; z <= 80 && !corridor; z += 8) {
      for (let x = -80; x <= 72 && !corridor; x += 8) {
        let clear = true;
        for (let step = 0; step <= 8; step += 0.5) {
          if (game.pointHitsStaticObstacleForTest(x + step, z, 0.7)) {
            clear = false;
            break;
          }
        }
        if (clear) corridor = { x, z };
      }
    }
    if (!corridor) throw new Error("No clear movement corridor found");
    multiplayer.setPlayerPosition("mock-player-2", corridor.x, corridor.z);
    return {
      names,
      slowWire,
      resetWire,
      corridor,
      wireFormat: slowWire.ps[0],
      roundTripMultiplier: roundTripGuest.doppelMoveMultiplier,
    };
  });

  await page.keyboard.down("KeyD");
  const slowWalk = await page.evaluate(() => {
    const multiplayer = window.__dustMultiplayerTest;
    const game = window.__dustAndDeadTest;
    const before = multiplayer.getState().players.find(
      (player) => player.id === "mock-player-2"
    );
    for (let frame = 0; frame < 30; frame += 1) {
      game.advanceRealFrame(1000 / 60, { render: false });
    }
    const after = multiplayer.getState().players.find(
      (player) => player.id === "mock-player-2"
    );
    return { before, after, distance: Math.hypot(after.x - before.x, after.z - before.z) };
  });
  await page.keyboard.up("KeyD");

  await page.evaluate(({ resetWire, corridor }) => {
    const multiplayer = window.__dustMultiplayerTest;
    multiplayer.applySnapshot(resetWire);
    multiplayer.setPlayerPosition("mock-player-2", corridor.x, corridor.z);
  }, { resetWire: setup.resetWire, corridor: setup.corridor });

  await page.keyboard.down("KeyD");
  const resetWalk = await page.evaluate(() => {
    const multiplayer = window.__dustMultiplayerTest;
    const game = window.__dustAndDeadTest;
    const before = multiplayer.getState().players.find(
      (player) => player.id === "mock-player-2"
    );
    for (let frame = 0; frame < 30; frame += 1) {
      game.advanceRealFrame(1000 / 60, { render: false });
    }
    const after = multiplayer.getState().players.find(
      (player) => player.id === "mock-player-2"
    );
    return { before, after, distance: Math.hypot(after.x - before.x, after.z - before.z) };
  });
  await page.keyboard.up("KeyD");

  expect(setup.wireFormat).toBe(2);
  expect(setup.roundTripMultiplier).toBeCloseTo(0.5, 2);
  expect(slowWalk.distance).toBeGreaterThan(1);
  expect(resetWalk.distance).toBeGreaterThan(slowWalk.distance * 1.85);
  expect(resetWalk.distance).toBeLessThan(slowWalk.distance * 2.15);
});

test("a lag-compensated guest fire claim at the scout's old position counts one attack", async ({ page }) => {
  await openDoppelgangerGame(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const multiplayer = window.__dustMultiplayerTest;
    multiplayer.startMockHost(["Host", "Guest"]);
    multiplayer.setPlayerPosition("mock-player-1", 34, 34);
    multiplayer.setPlayerPosition("mock-player-2", 0, 0);
    multiplayer.setNetworkRtt("mock-player-2", 320);
    multiplayer.setProgression("mock-player-2", {
      playerClass: "marshal",
      marshalUpgrade: "graveWarden",
      weapon: "coachGun",
      ownedWeapons: { revolver: true, coachGun: true },
      ammo: { revolver: 6, rifle: 0, launcher: 0, coachGun: 2 },
      ammoReserve: { revolver: 36, rifle: 0, launcher: 0, coachGun: 20 },
    });

    const shooter = multiplayer.getState().players.find(
      (player) => player.id === "mock-player-2"
    );
    game.forceDoppelgangerScoutForTest({
      sourceBossWave: 5,
      dueBossWave: 10,
      x: shooter.x,
      z: shooter.z + 7,
    });
    const staleScout = game.getDoppelgangerDiagnostics().scout;
    for (let frame = 0; frame < 10; frame += 1) {
      game.advanceRealFrame(1000 / 60, { render: false });
    }
    const movedScout = game.getDoppelgangerDiagnostics().scout;
    const aimAngle = Math.atan2(
      staleScout.x - shooter.x,
      staleScout.z - shooter.z
    );
    const aimDistance = Math.hypot(
      staleScout.x - shooter.x,
      staleScout.z - shooter.z
    );
    const queued = multiplayer.injectFireAction(
      "mock-player-2",
      1,
      aimAngle,
      aimDistance,
      {
        weaponId: "coachGun",
        actionAgeMs: 120,
        targetKind: "enemy",
        targetId: "doppelganger-scout",
        targetX: staleScout.x,
        targetZ: staleScout.z,
      }
    );
    const beforeFire = game.getDoppelgangerDiagnostics();
    for (let frame = 0; frame < 6; frame += 1) {
      game.advanceRealFrame(1000 / 60, { render: false });
      const player = multiplayer.getState().players.find(
        (entry) => entry.id === "mock-player-2"
      );
      if (!player.pendingFireActions) break;
    }
    const afterFire = game.getDoppelgangerDiagnostics();
    const remote = multiplayer.getState().players.find(
      (player) => player.id === "mock-player-2"
    );
    return {
      queued,
      staleScout,
      movedScout,
      drift: Math.hypot(
        movedScout.x - staleScout.x,
        movedScout.z - staleScout.z
      ),
      beforeHits: beforeFire.hitsRemaining,
      afterHits: afterFire.hitsRemaining,
      remote,
    };
  });

  expect(result.queued).toBe(true);
  expect(result.drift).toBeGreaterThan(0.2);
  expect(result.beforeHits).toBe(4);
  expect(result.afterHits).toBe(3);
  expect(result.remote).toMatchObject({
    lastProcessedFireActionSequence: 1,
    lastFireActionAccepted: true,
    pendingFireActions: 0,
  });
  expect(result.remote.pendingFireResults).toEqual([
    { sequence: 1, accepted: true, reason: "accepted" },
  ]);
});

test("same-snapshot stale upserts cannot resurrect a dead copy's hazards or purge a living copy", async ({ page }) => {
  await openDoppelgangerGame(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const multiplayer = window.__dustMultiplayerTest;
    const names = ["Copy A", "Copy B"];
    const host = multiplayer.startMockHost(names);
    const guestPosition = host.players[1];
    game.forceDoppelgangerScoutForTest({ sourceBossWave: 5, dueBossWave: 10 });
    const boss = game.forceDoppelgangerTransformForTest();
    const copyA = boss.clones.find((clone) => clone.sourceSlot === 0);
    const copyB = boss.clones.find((clone) => clone.sourceSlot === 1);
    game.damageDoppelgangerCloneForTest(copyA.networkId, copyA.maxHp, {
      type: "revolver",
      ownerPlayerId: "mock-player-2",
      direct: true,
    });
    const wire = JSON.parse(JSON.stringify(
      multiplayer.buildWireSnapshot(false, false, "mock-player-2")
    ));
    const staleUpserts = {
      firePatches: [
        {
          id: 901,
          ownerId: "doppel:copy-1",
          x: guestPosition.x + 0.5,
          z: guestPosition.z,
          radius: 1.8,
          life: 4,
          type: "splinter",
          armed: true,
        },
        {
          id: 902,
          ownerId: "doppel:copy-2",
          x: guestPosition.x + 1,
          z: guestPosition.z,
          radius: 1.8,
          life: 4,
          type: "splinter",
          armed: true,
        },
      ],
      rifleTraps: [
        {
          id: 903,
          ownerId: "doppel:copy-1",
          x: guestPosition.x + 0.5,
          z: guestPosition.z,
          radius: 2,
          life: null,
          type: "rifle-hit",
          armed: true,
        },
        {
          id: 904,
          ownerId: "doppel:copy-2",
          x: guestPosition.x + 1,
          z: guestPosition.z,
          radius: 2,
          life: null,
          type: "rifle-hit",
          armed: true,
        },
      ],
    };
    wire.hazardUpserts = staleUpserts;

    multiplayer.startMockGuest(names, 1);
    multiplayer.applySnapshot(wire);
    const first = {
      boss: game.getDoppelgangerDiagnostics(),
      replicas: multiplayer.getGuestCombatReplicas(),
    };

    const repeatedWire = JSON.parse(JSON.stringify(wire));
    repeatedWire.sequence = wire.sequence + 1;
    repeatedWire.time = Number(wire.time || 0) + 1 / 15;
    multiplayer.applySnapshot(repeatedWire);
    game.renderNowForTest();
    const repeated = {
      boss: game.getDoppelgangerDiagnostics(),
      replicas: multiplayer.getGuestCombatReplicas(),
    };
    return { copyA, copyB, first, repeated };
  });

  for (const sample of [result.first, result.repeated]) {
    const guestA = sample.boss.clones.find((clone) => clone.sourceSlot === 0);
    const guestB = sample.boss.clones.find((clone) => clone.sourceSlot === 1);
    expect(guestA).toMatchObject({ active: false, hp: 0 });
    expect(guestB).toMatchObject({ active: true });
    expect(sample.replicas.firePatches.map((patch) => patch.ownerId)).toEqual([
      "doppel:copy-2",
    ]);
    expect(sample.replicas.rifleTraps.map((trap) => trap.ownerId)).toEqual([
      "doppel:copy-2",
    ]);
  }
  const livingFire = result.repeated.replicas.firePatches[0];
  expect(livingFire.visualAttached || livingFire.fallbackVisual).toBe(true);
});

test("a stale scout claim beats a farther sweep zombie but not a nearer blocking zombie", async ({ page }) => {
  await openDoppelgangerGame(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const multiplayer = window.__dustMultiplayerTest;
    const names = ["Host", "Guest Shooter"];

    const findClearNorthboundCorridor = () => {
      for (let z = -72; z <= 60; z += 8) {
        for (let x = -72; x <= 72; x += 8) {
          let clear = true;
          for (let step = -10; step <= 12; step += 0.5) {
            if (game.pointHitsStaticObstacleForTest(x, z + step, 0.85)) {
              clear = false;
              break;
            }
          }
          if (clear) return { x, z };
        }
      }
      throw new Error("No clear northbound corridor found");
    };

    const runShot = (zombieDistance) => {
      multiplayer.startMockHost(names);
      game.clearEnemies();
      const corridor = findClearNorthboundCorridor();
      multiplayer.setPlayerPosition(
        "mock-player-1",
        corridor.x,
        corridor.z - 9
      );
      multiplayer.setPlayerPosition(
        "mock-player-2",
        corridor.x,
        corridor.z
      );
      multiplayer.setNetworkRtt("mock-player-2", 0);
      multiplayer.setProgression("mock-player-2", {
        weapon: "revolver",
        ownedWeapons: { revolver: true },
        ammo: { revolver: 6, rifle: 0, launcher: 0, coachGun: 0 },
        ammoReserve: { revolver: 36, rifle: 0, launcher: 0, coachGun: 0 },
      });

      const shooter = multiplayer.getState().players.find(
        (player) => player.id === "mock-player-2"
      );
      game.forceDoppelgangerScoutForTest({
        sourceBossWave: 5,
        dueBossWave: 10,
        x: shooter.x,
        z: shooter.z + 7,
      });
      const staleScout = game.getDoppelgangerDiagnostics().scout;
      for (let frame = 0; frame < 10; frame += 1) {
        game.advanceRealFrame(1000 / 60, { render: false });
      }
      const movedScout = game.getDoppelgangerDiagnostics().scout;
      const zombie = multiplayer.spawnEnemyAt(
        shooter.x,
        shooter.z + zombieDistance,
        "walker",
        1000
      );
      const aimAngle = Math.atan2(
        staleScout.x - shooter.x,
        staleScout.z - shooter.z
      );
      const queued = multiplayer.injectFireAction(
        "mock-player-2",
        1,
        aimAngle,
        Math.hypot(staleScout.x - shooter.x, staleScout.z - shooter.z),
        {
          weaponId: "revolver",
          actionAgeMs: 200,
          targetKind: "enemy",
          targetId: "doppelganger-scout",
          targetX: staleScout.x,
          targetZ: staleScout.z,
        }
      );
      const beforeHits = game.getDoppelgangerDiagnostics().hitsRemaining;
      for (let frame = 0; frame < 8; frame += 1) {
        game.advanceRealFrame(1000 / 60, { render: false });
        const remote = multiplayer.getState().players.find(
          (player) => player.id === "mock-player-2"
        );
        if (!remote.pendingFireActions && !multiplayer.getAuthoritativeBullets().length) {
          break;
        }
      }
      const enemyAfter = multiplayer.getAuthoritativeEnemies().find(
        (enemy) => enemy.id === zombie.id
      );
      const remote = multiplayer.getState().players.find(
        (player) => player.id === "mock-player-2"
      );
      return {
        queued,
        staleScout,
        movedScout,
        drift: Math.hypot(
          movedScout.x - staleScout.x,
          movedScout.z - staleScout.z
        ),
        zombie,
        zombieAfter: enemyAfter,
        beforeHits,
        afterHits: game.getDoppelgangerDiagnostics().hitsRemaining,
        remote,
      };
    };

    return {
      farther: runShot(8),
      blocking: runShot(4.5),
    };
  });

  expect(result.farther.queued).toBe(true);
  expect(result.farther.drift).toBeGreaterThan(0.2);
  expect(result.farther.zombie.z).toBeGreaterThan(
    result.farther.staleScout.z
  );
  expect(result.farther.beforeHits).toBe(4);
  expect(result.farther.afterHits).toBe(3);
  expect(result.farther.zombieAfter).toMatchObject({ hp: 1000, active: true });
  expect(result.farther.remote).toMatchObject({
    lastProcessedFireActionSequence: 1,
    lastFireActionAccepted: true,
    pendingFireActions: 0,
  });

  expect(result.blocking.queued).toBe(true);
  expect(result.blocking.drift).toBeGreaterThan(0.2);
  expect(result.blocking.zombie.z).toBeLessThan(
    result.blocking.staleScout.z
  );
  expect(result.blocking.beforeHits).toBe(4);
  expect(result.blocking.afterHits).toBe(4);
  expect(result.blocking.zombieAfter.hp).toBeLessThan(1000);
  expect(result.blocking.remote).toMatchObject({
    lastProcessedFireActionSequence: 1,
    lastFireActionAccepted: true,
    pendingFireActions: 0,
  });
});

test("a Coach Gun stale scout claim counts past a farther zombie but not a nearer blocking zombie", async ({ page }) => {
  await openDoppelgangerGame(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const multiplayer = window.__dustMultiplayerTest;
    const names = ["Host", "Guest Marshal"];

    const findClearNorthboundCorridor = () => {
      for (let z = -72; z <= 60; z += 8) {
        for (let x = -72; x <= 72; x += 8) {
          let clear = true;
          for (let step = -10; step <= 13; step += 0.5) {
            if (game.pointHitsStaticObstacleForTest(x, z + step, 1.15)) {
              clear = false;
              break;
            }
          }
          if (clear) return { x, z };
        }
      }
      throw new Error("No clear Coach Gun corridor found");
    };

    const runVolley = (zombieDistance) => {
      multiplayer.startMockHost(names);
      game.clearEnemies();
      const corridor = findClearNorthboundCorridor();
      multiplayer.setPlayerPosition(
        "mock-player-1",
        corridor.x,
        corridor.z - 9
      );
      multiplayer.setPlayerPosition(
        "mock-player-2",
        corridor.x,
        corridor.z
      );
      multiplayer.setNetworkRtt("mock-player-2", 0);
      multiplayer.setProgression("mock-player-2", {
        playerClass: "marshal",
        marshalUpgrade: "graveWarden",
        weapon: "coachGun",
        ownedWeapons: { revolver: true, coachGun: true },
        ammo: { revolver: 6, rifle: 0, launcher: 0, coachGun: 2 },
        ammoReserve: { revolver: 36, rifle: 0, launcher: 0, coachGun: 20 },
      });

      const shooter = multiplayer.getState().players.find(
        (player) => player.id === "mock-player-2"
      );
      game.forceDoppelgangerScoutForTest({
        sourceBossWave: 5,
        dueBossWave: 10,
        x: shooter.x,
        z: shooter.z + 7,
      });
      const staleScout = game.getDoppelgangerDiagnostics().scout;
      for (let frame = 0; frame < 10; frame += 1) {
        game.advanceRealFrame(1000 / 60, { render: false });
      }
      const movedScout = game.getDoppelgangerDiagnostics().scout;
      const zombie = multiplayer.spawnEnemyAt(
        shooter.x,
        shooter.z + zombieDistance,
        "brute",
        1000
      );
      const queued = multiplayer.injectFireAction(
        "mock-player-2",
        1,
        Math.atan2(
          staleScout.x - shooter.x,
          staleScout.z - shooter.z
        ),
        Math.hypot(
          staleScout.x - shooter.x,
          staleScout.z - shooter.z
        ),
        {
          weaponId: "coachGun",
          actionAgeMs: 200,
          targetKind: "enemy",
          targetId: "doppelganger-scout",
          targetX: staleScout.x,
          targetZ: staleScout.z,
        }
      );
      const beforeHits = game.getDoppelgangerDiagnostics().hitsRemaining;
      for (let frame = 0; frame < 3; frame += 1) {
        game.advanceRealFrame(1000 / 60, { render: false });
        const remote = multiplayer.getState().players.find(
          (player) => player.id === "mock-player-2"
        );
        if (!remote.pendingFireActions) break;
      }
      return {
        queued,
        staleScout,
        movedScout,
        drift: Math.hypot(
          movedScout.x - staleScout.x,
          movedScout.z - staleScout.z
        ),
        zombie,
        zombieAfter: multiplayer.getAuthoritativeEnemies().find(
          (enemy) => enemy.id === zombie.id
        ),
        beforeHits,
        afterHits: game.getDoppelgangerDiagnostics().hitsRemaining,
        remote: multiplayer.getState().players.find(
          (player) => player.id === "mock-player-2"
        ),
      };
    };

    return {
      farther: runVolley(8.5),
      blocking: runVolley(3.5),
    };
  });

  expect(result.farther).toMatchObject({
    queued: true,
    beforeHits: 4,
    afterHits: 3,
    remote: {
      lastProcessedFireActionSequence: 1,
      lastFireActionAccepted: true,
      pendingFireActions: 0,
    },
  });
  expect(result.farther.drift).toBeGreaterThan(0.2);
  expect(result.farther.zombie.z).toBeGreaterThan(
    result.farther.staleScout.z
  );

  expect(result.blocking).toMatchObject({
    queued: true,
    beforeHits: 4,
    afterHits: 4,
    remote: {
      lastProcessedFireActionSequence: 1,
      lastFireActionAccepted: true,
      pendingFireActions: 0,
    },
  });
  expect(result.blocking.drift).toBeGreaterThan(0.2);
  expect(result.blocking.zombie.z).toBeLessThan(
    result.blocking.staleScout.z
  );
  expect(result.blocking.zombieAfter.hp).toBeLessThan(1000);
});

test("late reliable clone projectiles cannot outlive their encounter or cross into a new doppel wave", async ({ page }) => {
  await openDoppelgangerGame(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const multiplayer = window.__dustMultiplayerTest;
    const names = ["Host", "Guest"];
    multiplayer.startMockHost(names);
    game.clearEnemies();
    multiplayer.setPlayerPosition("mock-player-1", 0, 0);
    multiplayer.setPlayerPosition("mock-player-2", 2.5, 0);
    game.forceDoppelgangerScoutForTest({
      sourceBossWave: 5,
      dueBossWave: 10,
      x: 1.25,
      z: 7,
    });
    game.forceDoppelgangerTransformForTest();

    let spawnEvent = null;
    for (let frame = 0; frame < 240 && !spawnEvent; frame += 1) {
      game.advanceRealFrame(1000 / 60, { render: false });
      spawnEvent = multiplayer.getNetworkCombatDiagnostics().queuedEvents.find(
        (event) => (
          event.type === "projectileSpawn" &&
          String(event.ownerId || "").startsWith("doppel:")
        )
      ) || null;
    }
    if (!spawnEvent) {
      throw new Error("Clone did not emit a reliable projectileSpawn");
    }
    const oldActiveWire = JSON.parse(JSON.stringify(
      multiplayer.buildWireSnapshot(false, false, "mock-player-2")
    ));

    game.forceDoppelgangerScoutForTest({
      sourceBossWave: 10,
      dueBossWave: 15,
      x: 1.25,
      z: 7,
    });
    game.forceDoppelgangerTransformForTest();
    const newActiveWire = JSON.parse(JSON.stringify(
      multiplayer.buildWireSnapshot(false, false, "mock-player-2")
    ));

    const sanitize = (source, sequence, bossState, combatEvents) => {
      const wire = JSON.parse(JSON.stringify(source));
      wire.sequence = sequence;
      wire.bossState = bossState;
      wire.combatEvents = combatEvents;
      wire.bullets = [];
      return wire;
    };
    const oldBossState = oldActiveWire.bossState;
    const newBossState = newActiveWire.bossState;
    const firstSpawn = Object.assign({}, spawnEvent, { sequence: 1 });
    const staleWaveSpawn = Object.assign({}, spawnEvent, {
      sequence: 2,
      projectileId: Number(spawnEvent.projectileId) + 100000,
    });
    const packets = {
      oldActive: sanitize(oldActiveWire, 1, oldBossState, []),
      noBoss: sanitize(oldActiveWire, 2, null, []),
      lateAfterNoBoss: sanitize(
        oldActiveWire,
        3,
        null,
        [firstSpawn]
      ),
      newActive: sanitize(newActiveWire, 4, newBossState, []),
      staleDuringNew: sanitize(
        newActiveWire,
        5,
        newBossState,
        [staleWaveSpawn]
      ),
    };

    multiplayer.startMockGuest(names, 1);
    multiplayer.applySnapshot(packets.oldActive);
    const oldGuestBoss = game.getDoppelgangerDiagnostics();
    multiplayer.applySnapshot(packets.noBoss);
    const afterNoBoss = {
      boss: game.getDoppelgangerDiagnostics(),
      replicas: multiplayer.getGuestCombatReplicas(),
    };
    multiplayer.applySnapshot(packets.lateAfterNoBoss);
    const afterLate = {
      boss: game.getDoppelgangerDiagnostics(),
      replicas: multiplayer.getGuestCombatReplicas(),
      events: multiplayer.getNetworkCombatDiagnostics().guestEvents,
    };
    multiplayer.applySnapshot(packets.newActive);
    const newGuestBoss = game.getDoppelgangerDiagnostics();
    multiplayer.applySnapshot(packets.staleDuringNew);
    const afterStaleWave = {
      boss: game.getDoppelgangerDiagnostics(),
      replicas: multiplayer.getGuestCombatReplicas(),
      events: multiplayer.getNetworkCombatDiagnostics().guestEvents,
    };
    return {
      spawnEvent,
      oldGuestBoss,
      afterNoBoss,
      afterLate,
      newGuestBoss,
      afterStaleWave,
    };
  });

  expect(result.spawnEvent).toMatchObject({
    type: "projectileSpawn",
    doppelWave: 5,
  });
  expect(result.spawnEvent.ownerId).toMatch(/^doppel:copy-\d+$/);
  expect(result.oldGuestBoss).toMatchObject({
    replica: true,
    sourceBossWave: 5,
    phase: "boss",
  });
  expect(result.afterNoBoss.replicas.bullets).toEqual([]);
  expect(result.afterLate.replicas.bullets).toEqual([]);
  expect(result.afterLate.events.at(-1)).toMatchObject({
    sequence: 1,
    type: "projectileSpawn",
    ownerId: result.spawnEvent.ownerId,
    visuals: 0,
  });
  expect(result.newGuestBoss).toMatchObject({
    replica: true,
    sourceBossWave: 10,
    phase: "boss",
  });
  expect(result.afterStaleWave.boss).toMatchObject({
    replica: true,
    sourceBossWave: 10,
    phase: "boss",
  });
  expect(result.afterStaleWave.replicas.bullets).toEqual([]);
  expect(result.afterStaleWave.events.at(-1)).toMatchObject({
    sequence: 2,
    type: "projectileSpawn",
    ownerId: result.spawnEvent.ownerId,
    visuals: 0,
  });
});

test("budget-trimmed mixed Marshal replicas preserve friendly entries and reconcile hostile entries at the full 48/24 caps", async ({ page }) => {
  test.setTimeout(120000);
  await openDoppelgangerGame(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const multiplayer = window.__dustMultiplayerTest;
    const names = ["Marshal A", "Marshal B", "Marshal C", "Marshal D"];
    const started = multiplayer.startMockHost(names);
    started.players.forEach((player, playerIndex) => {
      multiplayer.setProgression(player.id, {
        playerClass: "marshal",
        marshalUpgrade: "graveWarden",
        weapon: "coachGun",
        ownedWeapons: { revolver: true, coachGun: true },
        upgradeCounts: {
          hallowedGround: 1,
          lastRites: 1,
        },
      });
      for (let groundIndex = 0; groundIndex < 6; groundIndex += 1) {
        multiplayer.spawnHallowedGround(player.id, 30);
      }
      for (let deputyIndex = 0; deputyIndex < 3; deputyIndex += 1) {
        multiplayer.spawnPaleDeputy(
          player.id,
          player.x + 1.2 + deputyIndex * 0.8,
          player.z + (playerIndex % 2 ? -1 : 1) * 0.8
        );
      }
    });

    game.forceDoppelgangerScoutForTest({
      sourceBossWave: 5,
      dueBossWave: 10,
    });
    const boss = game.forceDoppelgangerTransformForTest();
    boss.clones.forEach((clone, cloneIndex) => {
      const targetId = started.players[cloneIndex].id;
      for (let summonIndex = 0; summonIndex < 6; summonIndex += 1) {
        multiplayer.setHealth(targetId, 100);
        const summon = game.runDoppelgangerPaleDeputyAttackForTest(
          clone.networkId,
          targetId
        );
        if (!summon || !summon.hostile) {
          throw new Error(`Failed hostile Marshal summon for ${clone.networkId}`);
        }
      }
    });

    const fullWire = JSON.parse(JSON.stringify(
      multiplayer.buildWireSnapshot(true, false, "mock-player-2")
    ));
    const fullHostCounts = {
      grounds: fullWire.hallowedGrounds?.length || 0,
      deputies: fullWire.paleDeputies?.length || 0,
      friendlyGrounds: (fullWire.hallowedGrounds || []).filter(
        (entry) => !String(entry.ownerId || "").startsWith("doppel:")
      ).length,
      hostileGrounds: (fullWire.hallowedGrounds || []).filter(
        (entry) => String(entry.ownerId || "").startsWith("doppel:")
      ).length,
      friendlyDeputies: (fullWire.paleDeputies || []).filter(
        (entry) => !String(entry.ownerId || "").startsWith("doppel:")
      ).length,
      hostileDeputies: (fullWire.paleDeputies || []).filter(
        (entry) => String(entry.ownerId || "").startsWith("doppel:")
      ).length,
    };

    multiplayer.spawnEnemyStressField(1000, "visible");
    for (let acidIndex = 0; acidIndex < 60; acidIndex += 1) {
      multiplayer.spawnSpitterShotAtPlayer("mock-player-2");
    }
    for (let xpIndex = 0; xpIndex < 500; xpIndex += 1) {
      multiplayer.spawnXpOrb(
        "mock-player-1",
        -160 + (xpIndex % 25) * 12,
        -100 + Math.floor(xpIndex / 25) * 10,
        1
      );
    }
    const viewer = multiplayer.getState().players.find(
      (player) => player.id === "mock-player-2"
    );
    for (let hazardIndex = 0; hazardIndex < 128; hazardIndex += 1) {
      const x = viewer.x + (hazardIndex % 8 - 3.5) * 0.22;
      const z = viewer.z +
        (Math.floor(hazardIndex / 8) % 8 - 3.5) * 0.22;
      multiplayer.spawnFirePatch("mock-player-1", {
        x,
        z,
        radius: 1.2,
        life: 8,
        type: "trail",
      });
      game.spawnRifleTrapAt(x, z);
    }
    const trimmedWire = JSON.parse(JSON.stringify(
      multiplayer.buildWireSnapshot(true, true, "mock-player-2")
    ));
    const budget = multiplayer.getNetworkBudgetDiagnostics();
    const trimmedBytes = new TextEncoder().encode(
      JSON.stringify(trimmedWire)
    ).length;
    const trimmedBeforeOmission = {
      grounds: (trimmedWire.hallowedGrounds || []).map(
        (entry) => ({ id: entry.id, ownerId: entry.ownerId })
      ),
      deputies: (trimmedWire.paleDeputies || []).map(
        (entry) => ({ id: entry.id, ownerId: entry.ownerId })
      ),
      groundsComplete: trimmedWire.hallowedGroundsComplete,
      deputiesComplete: trimmedWire.paleDeputiesComplete,
    };
    const omittedGround = trimmedWire.hallowedGrounds.pop();
    const omittedDeputy = trimmedWire.paleDeputies.pop();

    fullWire.sequence = 1;
    fullWire.combatEvents = [];
    fullWire.bullets = [];
    trimmedWire.sequence = 2;
    trimmedWire.combatEvents = [];
    trimmedWire.bullets = [];
    delete trimmedWire.enemyDelta;
    delete trimmedWire.enemyLiveDelta;
    delete trimmedWire.acidProjectiles;

    multiplayer.startMockGuest(names, 1);
    multiplayer.applySnapshot(fullWire);
    const fullGuest = multiplayer.getGuestCombatReplicas();
    multiplayer.applySnapshot(trimmedWire);
    const partialGuest = multiplayer.getGuestCombatReplicas();

    const summarize = (entries) => ({
      ids: entries.map((entry) => Number(entry.id)).sort((a, b) => a - b),
      friendlyIds: entries.filter(
        (entry) => !String(entry.ownerId || "").startsWith("doppel:")
      ).map((entry) => Number(entry.id)).sort((a, b) => a - b),
      hostileIds: entries.filter(
        (entry) => String(entry.ownerId || "").startsWith("doppel:")
      ).map((entry) => Number(entry.id)).sort((a, b) => a - b),
    });
    return {
      fullHostCounts,
      fullWire: {
        groundsComplete: fullWire.hallowedGroundsComplete,
        deputiesComplete: fullWire.paleDeputiesComplete,
      },
      trimmedBeforeOmission,
      omittedGround,
      omittedDeputy,
      trimmedBytes,
      budget,
      fullGuest: {
        grounds: summarize(fullGuest.hallowedGrounds),
        deputies: summarize(fullGuest.paleDeputies),
      },
      partialGuest: {
        grounds: summarize(partialGuest.hallowedGrounds),
        deputies: summarize(partialGuest.paleDeputies),
      },
    };
  });

  expect(result.fullHostCounts).toEqual({
    grounds: 48,
    deputies: 24,
    friendlyGrounds: 24,
    hostileGrounds: 24,
    friendlyDeputies: 12,
    hostileDeputies: 12,
  });
  expect(result.fullWire).toEqual({
    groundsComplete: true,
    deputiesComplete: true,
  });
  expect(result.fullGuest.grounds.ids).toHaveLength(48);
  expect(result.fullGuest.grounds.friendlyIds).toHaveLength(24);
  expect(result.fullGuest.grounds.hostileIds).toHaveLength(24);
  expect(result.fullGuest.deputies.ids).toHaveLength(24);
  expect(result.fullGuest.deputies.friendlyIds).toHaveLength(12);
  expect(result.fullGuest.deputies.hostileIds).toHaveLength(12);

  expect(result.trimmedBeforeOmission).toMatchObject({
    groundsComplete: false,
    deputiesComplete: false,
  });
  expect(result.trimmedBeforeOmission.grounds).toHaveLength(24);
  expect(result.trimmedBeforeOmission.deputies).toHaveLength(12);
  expect(result.trimmedBeforeOmission.grounds.every(
    (entry) => entry.ownerId.startsWith("doppel:")
  )).toBe(true);
  expect(result.trimmedBeforeOmission.deputies.every(
    (entry) => entry.ownerId.startsWith("doppel:")
  )).toBe(true);
  expect(result.trimmedBytes).toBeLessThanOrEqual(31 * 1024);
  expect(result.budget.stats.lastPreBudgetBytes).toBeGreaterThan(
    result.trimmedBytes
  );
  expect(result.budget.stats.wireBudgetTrims).toBeGreaterThan(0);
  expect(result.budget.stats.wireOversizeSnapshots).toBe(0);

  expect(result.partialGuest.grounds.friendlyIds).toEqual(
    result.fullGuest.grounds.friendlyIds
  );
  expect(result.partialGuest.deputies.friendlyIds).toEqual(
    result.fullGuest.deputies.friendlyIds
  );
  expect(result.partialGuest.grounds.hostileIds).toEqual(
    result.trimmedBeforeOmission.grounds.slice(0, -1)
      .map((entry) => Number(entry.id))
      .sort((a, b) => a - b)
  );
  expect(result.partialGuest.deputies.hostileIds).toEqual(
    result.trimmedBeforeOmission.deputies.slice(0, -1)
      .map((entry) => Number(entry.id))
      .sort((a, b) => a - b)
  );
  expect(result.partialGuest.grounds.ids).not.toContain(
    Number(result.omittedGround.id)
  );
  expect(result.partialGuest.deputies.ids).not.toContain(
    Number(result.omittedDeputy.id)
  );
});

test("a wounded player creates a full-max-HP copy that still takes raw damage", async ({ page }) => {
  await openDoppelgangerGame(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    game.setPlayerMaxHp(275, 31);
    game.forceDoppelgangerScoutForTest({ sourceBossWave: 5, dueBossWave: 10 });
    const transformed = game.forceDoppelgangerTransformForTest();
    const clone = transformed.clones[0];
    const hit = game.damageDoppelgangerCloneForTest(
      clone.networkId,
      43.75,
      { type: "revolver", ownerPlayerId: "solo", direct: true }
    );
    return {
      player: JSON.parse(window.render_game_to_text()).player,
      clone,
      hit,
    };
  });

  expect(result.player).toMatchObject({ hp: 31, maxHp: 275 });
  expect(result.clone).toMatchObject({ hp: 275, maxHp: 275 });
  expect(result.hit).toMatchObject({
    requested: 43.75,
    applied: 43.75,
    hpBefore: 275,
    hpAfter: 231.25,
  });
});

test("hostile Backdraft follows a lethal fire tick in either player order without damaging zombies", async ({ page }) => {
  await openDoppelgangerGame(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const multiplayer = window.__dustMultiplayerTest;
    const names = ["Copied Pyro", "Second", "Third"];

    const findClearNorthboundLane = () => {
      for (let z = -64; z <= 48; z += 8) {
        for (let x = -64; x <= 64; x += 8) {
          let clear = true;
          for (let step = -20; step <= 18; step += 0.5) {
            if (game.pointHitsStaticObstacleForTest(x, z + step, 0.9)) {
              clear = false;
              break;
            }
          }
          if (clear) return { x, z };
        }
      }
      throw new Error("No clear lane for the Backdraft regression");
    };

    const runScenario = (victimId, splashId) => {
      multiplayer.startMockHost(names);
      game.clearEnemies();
      game.clearFireHazards();
      const lane = findClearNorthboundLane();
      multiplayer.setProgression("mock-player-1", {
        playerClass: "demolitionist",
        weapon: "launcher",
        launcherUpgrade: "pyrotechnician",
        ownedWeapons: { revolver: true, launcher: true },
        upgradeCounts: { backdraft: 1 },
        ammo: { revolver: 6, rifle: 0, launcher: 3, coachGun: 0 },
        ammoReserve: { revolver: 36, rifle: 0, launcher: 30, coachGun: 0 },
      });
      multiplayer.setPlayerPosition("mock-player-1", lane.x, lane.z - 18);
      multiplayer.setPlayerPosition("mock-player-2", lane.x, lane.z + 11);
      multiplayer.setPlayerPosition("mock-player-3", lane.x, lane.z + 13);

      game.forceDoppelgangerScoutForTest({
        sourceBossWave: 5,
        dueBossWave: 10,
        x: lane.x,
        z: lane.z,
      });
      const transformed = game.forceDoppelgangerTransformForTest();
      const clone = transformed.clones.find(
        (entry) => entry.sourcePlayerId === "mock-player-1"
      );
      if (!clone) throw new Error("Missing copied Pyrotechnician");
      const ownerId = `doppel:copy-${clone.sourceSlot + 1}`;

      let initialPatch = null;
      let framesToPatch = 0;
      for (; framesToPatch < 360 && !initialPatch; framesToPatch += 1) {
        game.advanceRealFrame(1000 / 60, { render: false });
        if (!game.getDoppelgangerDiagnostics().worldObjects.firePatches) {
          continue;
        }
        const snapshot = multiplayer.buildSnapshot(
          false,
          true,
          splashId
        );
        initialPatch = (snapshot.firePatches || []).find(
          (patch) => patch.ownerId === ownerId && patch.type === "fire"
        ) || null;
      }
      if (!initialPatch) {
        throw new Error("Copied Pyrotechnician did not create a fire patch");
      }

      multiplayer.setPlayerPosition(
        "mock-player-1",
        initialPatch.x,
        initialPatch.z - 12
      );
      multiplayer.setPlayerPosition(
        victimId,
        initialPatch.x,
        initialPatch.z
      );
      multiplayer.setPlayerPosition(
        splashId,
        initialPatch.x + 1.6,
        initialPatch.z
      );
      multiplayer.setHealth(victimId, 2);
      multiplayer.setHealth(splashId, 100);
      const zombie = multiplayer.spawnEnemyAt(
        initialPatch.x,
        initialPatch.z,
        "walker",
        777
      );
      const before = {
        players: multiplayer.getState().players,
        zombie: multiplayer.getAuthoritativeEnemies().find(
          (enemy) => enemy.id === zombie.id
        ),
        patches: multiplayer.buildSnapshot(
          false,
          true,
          splashId
        ).firePatches || [],
        boss: game.getDoppelgangerDiagnostics(),
      };

      // The original puddle starts with a 0.05 s damage delay. This advances
      // exactly its first tick, while the new Backdraft puddle's 0.12 s delay
      // prevents a second persistent-fire tick from entering the measurement.
      game.advanceBossFireForTest(0.07);

      const afterSnapshot = multiplayer.buildSnapshot(
        false,
        true,
        splashId
      );
      const afterPlayers = multiplayer.getState().players;
      const afterPatches = afterSnapshot.firePatches || [];
      const beforeIds = new Set(before.patches.map((patch) => patch.id));
      return {
        victimId,
        splashId,
        ownerId,
        framesToPatch,
        before,
        after: {
          victim: afterPlayers.find((player) => player.id === victimId),
          splash: afterPlayers.find((player) => player.id === splashId),
          zombie: multiplayer.getAuthoritativeEnemies().find(
            (enemy) => enemy.id === zombie.id
          ),
          boss: game.getDoppelgangerDiagnostics(),
          patches: afterPatches,
          newPatches: afterPatches.filter(
            (patch) => !beforeIds.has(patch.id)
          ),
        },
      };
    };

    return [
      runScenario("mock-player-2", "mock-player-3"),
      runScenario("mock-player-3", "mock-player-2"),
    ];
  });

  expect(result).toHaveLength(2);
  for (const sample of result) {
    const beforeSplash = sample.before.players.find(
      (player) => player.id === sample.splashId
    );
    expect(sample.framesToPatch).toBeLessThan(360);
    expect(sample.before.patches.filter(
      (patch) => patch.ownerId === sample.ownerId
    )).toHaveLength(1);
    expect(sample.before.zombie).toMatchObject({ hp: 777, active: true });
    expect(sample.after.victim).toMatchObject({
      id: sample.victimId,
      alive: false,
      hp: 0,
      deaths: 1,
    });
    expect(beforeSplash.hp - sample.after.splash.hp).toBe(3);
    expect(sample.after.splash).toMatchObject({
      id: sample.splashId,
      alive: true,
      hp: 97,
    });
    expect(sample.after.zombie).toMatchObject({ hp: 777, active: true });
    expect(sample.after.newPatches).toEqual([
      expect.objectContaining({
        ownerId: sample.ownerId,
        type: "backdraft",
      }),
    ]);
    expect(sample.after.patches.filter(
      (patch) => patch.ownerId === sample.ownerId &&
        patch.type === "backdraft"
    )).toHaveLength(1);
    expect(sample.after.boss.worldObjects.firePatches).toBe(2);
    expect(sample.after.boss.clones.find(
      (clone) => clone.sourcePlayerId === "mock-player-1"
    )).toMatchObject({
      lastRawDamage: 2,
      lastAppliedDamage: 2,
    });
  }
});
