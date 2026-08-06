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
    window.__dustAndDeadTest?.damageDoppelgangerCloneForTest &&
    window.__dustAndDeadTest?.runDoppelgangerPyrotechnicianFireForTest &&
    window.__dustAndDeadTest?.resolveDoppelgangerProjectileHitForTest &&
    window.__dustMultiplayerTest?.buildWireSnapshot &&
    window.__dustMultiplayerTest?.applySnapshot &&
    window.__dustMultiplayerTest?.getGuestCombatReplicas &&
    window.__dustMultiplayerTest?.injectFireAction
  ));
  await page.evaluate(() => {
    window.__dustAndDeadTest.setAutomaticFrameLoopModeForTest("paused");
  });
}

test("an active snapshot from a new doppelganger source wave replaces the active old generation and its threats", async ({ page }) => {
  await openDoppelgangerGame(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const multiplayer = window.__dustMultiplayerTest;
    const names = ["Host", "Guest", "Old Pyro", "Old Ranger"];
    const started = multiplayer.startMockHost(names);
    const positions = [
      { x: -26, z: -22 },
      { x: -22, z: -22 },
      { x: -26, z: -18 },
      { x: -22, z: -18 },
    ];
    started.players.forEach((player, index) => {
      multiplayer.setPlayerPosition(
        player.id,
        positions[index].x,
        positions[index].z
      );
      multiplayer.setHealth(player.id, 100);
    });
    multiplayer.setProgression("mock-player-3", {
      playerClass: "demolitionist",
      weapon: "launcher",
      launcherUpgrade: "pyrotechnician",
      ownedWeapons: { revolver: true, launcher: true },
      upgradeCounts: { scorchedEarth: 1 },
      ammo: { revolver: 6, rifle: 0, launcher: 4, coachGun: 0 },
      ammoReserve: { revolver: 36, rifle: 0, launcher: 20, coachGun: 0 },
    });
    multiplayer.setProgression("mock-player-4", {
      playerClass: "ranger",
      weapon: "rifle",
      rifleUpgrade: "trailWarden",
      ownedWeapons: { revolver: true, rifle: true },
      upgradeCounts: { snapTraps: 1 },
      ammo: { revolver: 6, rifle: 12, launcher: 0, coachGun: 0 },
      ammoReserve: { revolver: 36, rifle: 48, launcher: 0, coachGun: 0 },
    });
    game.clearEnemies();
    game.clearFireHazards();
    game.clearRifleTraps();
    game.forceDoppelgangerScoutForTest({
      sourceBossWave: 5,
      dueBossWave: 10,
      x: -24,
      z: -20,
    });
    const oldBoss = game.forceDoppelgangerTransformForTest();
    const pyro = oldBoss.clones.find(
      (clone) => clone.sourcePlayerId === "mock-player-3"
    );
    const ranger = oldBoss.clones.find(
      (clone) => clone.sourcePlayerId === "mock-player-4"
    );
    if (!pyro || !ranger) throw new Error("Missing old-generation hazard copies");

    const fire = game.runDoppelgangerPyrotechnicianFireForTest(
      pyro.networkId,
      "mock-player-2"
    );
    const trap = game.resolveDoppelgangerProjectileHitForTest(
      ranger.networkId,
      "mock-player-2",
      { type: "rifle", damage: 1, plantsTrap: true }
    );
    const oldWire = JSON.parse(JSON.stringify(
      multiplayer.buildWireSnapshot(false, true, "mock-player-2")
    ));
    oldWire.combatEvents = [];
    oldWire.bullets = [];

    multiplayer.setConnected("mock-player-3", false);
    multiplayer.setConnected("mock-player-4", false);
    game.forceDoppelgangerScoutForTest({
      sourceBossWave: 10,
      dueBossWave: 15,
      x: -24,
      z: -20,
    });
    const newHostBoss = game.forceDoppelgangerTransformForTest();
    const newWire = JSON.parse(JSON.stringify(
      multiplayer.buildWireSnapshot(false, true, "mock-player-2")
    ));
    newWire.combatEvents = [];
    newWire.bullets = [];

    multiplayer.startMockGuest(names, 1);
    multiplayer.applySnapshot(oldWire);
    const oldGuest = {
      boss: game.getDoppelgangerDiagnostics(),
      replicas: multiplayer.getGuestCombatReplicas(),
    };
    multiplayer.applySnapshot(newWire);
    const replacedGuest = {
      boss: game.getDoppelgangerDiagnostics(),
      replicas: multiplayer.getGuestCombatReplicas(),
    };
    return {
      fire,
      trap,
      oldHostCloneSlots: oldBoss.clones.map((clone) => clone.sourceSlot),
      newHostCloneSlots: newHostBoss.clones.map((clone) => clone.sourceSlot),
      oldGuest,
      replacedGuest,
      sequences: {
        old: oldWire.sequence,
        replacement: newWire.sequence,
      },
    };
  });

  expect(result.fire).toMatchObject({
    patchCreated: true,
    ownerId: "doppel:copy-3",
  });
  expect(result.trap).toMatchObject({
    plantsTrap: true,
    trapsCreated: 1,
  });
  expect(result.sequences.replacement).toBeGreaterThan(result.sequences.old);
  expect(result.oldHostCloneSlots).toEqual([0, 1, 2, 3]);
  expect(result.newHostCloneSlots).toEqual([0, 1]);
  expect(result.oldGuest.boss).toMatchObject({
    replica: true,
    active: true,
    phase: "boss",
    sourceBossWave: 5,
    cloneCount: 4,
  });
  expect(result.oldGuest.replicas.firePatches).toEqual([
    expect.objectContaining({ ownerId: "doppel:copy-3" }),
  ]);
  expect(result.oldGuest.replicas.rifleTraps).toEqual([
    expect.objectContaining({ ownerId: "doppel:copy-4" }),
  ]);

  expect(result.replacedGuest.boss).toMatchObject({
    replica: true,
    active: true,
    phase: "boss",
    sourceBossWave: 10,
    cloneCount: 2,
  });
  expect(
    result.replacedGuest.boss.clones.map((clone) => clone.sourceSlot)
  ).toEqual([0, 1]);
  expect(result.replacedGuest.replicas.bullets.filter(
    (entry) => String(entry.ownerId).startsWith("doppel:")
  )).toEqual([]);
  expect(result.replacedGuest.replicas.firePatches.filter(
    (entry) => String(entry.ownerId).startsWith("doppel:")
  )).toEqual([]);
  expect(result.replacedGuest.replicas.rifleTraps.filter(
    (entry) => String(entry.ownerId).startsWith("doppel:")
  )).toEqual([]);
  expect(result.replacedGuest.replicas.hallowedGrounds.filter(
    (entry) => String(entry.ownerId).startsWith("doppel:")
  )).toEqual([]);
  expect(result.replacedGuest.replicas.paleDeputies.filter(
    (entry) => String(entry.ownerId).startsWith("doppel:")
  )).toEqual([]);
});

test("a stale Coach Gun clone claim obeys nearest-hit blocking and cannot duplicate a canonical hit", async ({ page }) => {
  await openDoppelgangerGame(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const multiplayer = window.__dustMultiplayerTest;
    const names = ["Copied Host", "Guest Marshal"];

    function findClearCoachGunPatch() {
      for (let z = -64; z <= 48; z += 8) {
        for (let x = -64; x <= 64; x += 8) {
          let clear = true;
          for (let dz = -3; dz <= 12 && clear; dz += 0.5) {
            for (let dx = -1; dx <= 3.2; dx += 0.5) {
              if (game.pointHitsStaticObstacleForTest(x + dx, z + dz, 0.85)) {
                clear = false;
                break;
              }
            }
          }
          if (clear) return { x, z };
        }
      }
      throw new Error("No clear patch for doppelganger Coach Gun claims");
    }

    const patch = findClearCoachGunPatch();

    function runVolley(options) {
      const config = options || {};
      multiplayer.startMockHost(names);
      game.clearEnemies();
      game.clearFireHazards();
      game.clearRifleTraps();
      multiplayer.setProgression("mock-player-1", {
        weapon: "revolver",
        ownedWeapons: { revolver: true },
        ammo: { revolver: 6, rifle: 0, launcher: 0, coachGun: 0 },
        ammoReserve: { revolver: 36, rifle: 0, launcher: 0, coachGun: 0 },
      });
      multiplayer.setProgression("mock-player-2", {
        playerClass: "marshal",
        weapon: "coachGun",
        marshalUpgrade: "graveWarden",
        ownedWeapons: { revolver: true, coachGun: true },
        upgradeCounts: {},
        ammo: { revolver: 6, rifle: 0, launcher: 0, coachGun: 2 },
        ammoReserve: { revolver: 36, rifle: 0, launcher: 0, coachGun: 0 },
        reloadTimers: { revolver: 0, rifle: 0, launcher: 0, coachGun: 0 },
      });
      game.setPlayerMaxHp(1000, 1000);
      multiplayer.setPlayerPosition(
        "mock-player-1",
        patch.x - 8,
        patch.z - 6
      );
      multiplayer.setPlayerPosition("mock-player-2", patch.x, patch.z);
      multiplayer.setHealth("mock-player-2", 100);
      const shooter = multiplayer.getState().players.find(
        (player) => player.id === "mock-player-2"
      );
      multiplayer.setNetworkRtt("mock-player-2", 320);

      game.forceDoppelgangerScoutForTest({
        sourceBossWave: 5,
        dueBossWave: 10,
        x: shooter.x + (Number(config.targetOffsetX) || 0),
        z: shooter.z + 3,
      });
      const transformed = game.forceDoppelgangerTransformForTest();
      const target = transformed.clones.find(
        (clone) => clone.sourcePlayerId === "mock-player-1"
      );
      const other = transformed.clones.find(
        (clone) => clone.sourcePlayerId === "mock-player-2"
      );
      if (!target || !other) throw new Error("Missing Coach Gun target copies");
      game.damageDoppelgangerCloneForTest(
        other.networkId,
        other.maxHp,
        {
          type: "test",
          ownerPlayerId: "mock-player-2",
          direct: true,
        }
      );
      const liveTarget = game.getDoppelgangerDiagnostics().clones.find(
        (clone) => clone.networkId === target.networkId
      );
      const stalePoint = config.canonicalAlreadyHit
        ? {
            x: liveTarget.x + 0.45,
            z: liveTarget.z,
          }
        : {
            x: shooter.x,
            z: liveTarget.z,
          };
      const claimDistance = Math.hypot(
        stalePoint.x - shooter.x,
        stalePoint.z - shooter.z
      );
      const aimAngle = Math.atan2(
        stalePoint.x - shooter.x,
        stalePoint.z - shooter.z
      );

      let zombie = null;
      if (config.zombiePosition === "nearer") {
        zombie = multiplayer.spawnEnemyAt(
          shooter.x,
          shooter.z + 2.5,
          "brute",
          1000
        );
      } else if (config.zombiePosition === "farther") {
        zombie = multiplayer.spawnEnemyAt(
          shooter.x,
          shooter.z + claimDistance + 2,
          "brute",
          1000
        );
      }

      const before = game.getDoppelgangerDiagnostics().clones.find(
        (clone) => clone.networkId === target.networkId
      );
      const fireOptions = {
        weaponId: "coachGun",
        actionAgeMs: 200,
      };
      if (config.withClaim) {
        Object.assign(fireOptions, {
          targetKind: "enemy",
          targetId: target.networkId,
          targetX: stalePoint.x,
          targetZ: stalePoint.z,
        });
      }
      const queued = multiplayer.injectFireAction(
        "mock-player-2",
        1,
        aimAngle,
        claimDistance,
        fireOptions
      );
      for (let frame = 0; frame < 6; frame += 1) {
        game.advanceRealFrame(1000 / 60, { render: false });
        const remote = multiplayer.getState().players.find(
          (player) => player.id === "mock-player-2"
        );
        if (!remote.pendingFireActions) break;
      }
      const after = game.getDoppelgangerDiagnostics().clones.find(
        (clone) => clone.networkId === target.networkId
      );
      const zombieAfter = zombie
        ? multiplayer.getAuthoritativeEnemies().find(
            (enemy) => enemy.id === zombie.id
          )
        : null;
      return {
        queued,
        shooter,
        targetBefore: before,
        targetAfter: after,
        stalePoint,
        staleDrift: Math.hypot(
          stalePoint.x - before.x,
          stalePoint.z - before.z
        ),
        damage: before.hp - after.hp,
        zombie,
        zombieAfter,
        remote: multiplayer.getState().players.find(
          (player) => player.id === "mock-player-2"
        ),
      };
    }

    return {
      compensatedPastFarther: runVolley({
        targetOffsetX: 2.2,
        zombiePosition: "farther",
        withClaim: true,
      }),
      blockedByNearer: runVolley({
        targetOffsetX: 2.2,
        zombiePosition: "nearer",
        withClaim: true,
      }),
      canonicalControl: runVolley({
        targetOffsetX: 0,
        canonicalAlreadyHit: true,
        withClaim: false,
      }),
      canonicalWithClaim: runVolley({
        targetOffsetX: 0,
        canonicalAlreadyHit: true,
        withClaim: true,
      }),
    };
  });

  const compensated = result.compensatedPastFarther;
  expect(compensated.queued).toBe(true);
  expect(compensated.staleDrift).toBeGreaterThan(1.5);
  expect(compensated.damage).toBeGreaterThan(0);
  expect(compensated.targetAfter.lastAppliedDamage).toBeCloseTo(
    compensated.damage,
    2
  );
  expect(compensated.zombie.z).toBeGreaterThan(compensated.stalePoint.z);
  expect(compensated.zombieAfter.hp).toBeLessThan(1000);
  expect(compensated.remote).toMatchObject({
    lastProcessedFireActionSequence: 1,
    lastFireActionAccepted: true,
    pendingFireActions: 0,
  });

  const blocked = result.blockedByNearer;
  expect(blocked.queued).toBe(true);
  expect(blocked.staleDrift).toBeGreaterThan(1.5);
  expect(blocked.zombie.z).toBeLessThan(blocked.stalePoint.z);
  expect(blocked.zombieAfter.hp).toBeLessThan(1000);
  expect(blocked.damage).toBe(0);
  expect(blocked.targetAfter.lastAppliedDamage).toBe(0);
  expect(blocked.remote).toMatchObject({
    lastProcessedFireActionSequence: 1,
    lastFireActionAccepted: true,
    pendingFireActions: 0,
  });

  const control = result.canonicalControl;
  const claimed = result.canonicalWithClaim;
  expect(control.queued).toBe(true);
  expect(claimed.queued).toBe(true);
  expect(control.damage).toBeGreaterThan(0);
  expect(claimed.staleDrift).toBeGreaterThan(0.4);
  expect(claimed.damage).toBeCloseTo(control.damage, 6);
  expect(claimed.targetAfter.lastAppliedDamage).toBeCloseTo(
    control.targetAfter.lastAppliedDamage,
    6
  );
  expect(claimed.remote).toMatchObject({
    lastProcessedFireActionSequence: 1,
    lastFireActionAccepted: true,
    pendingFireActions: 0,
  });
});
