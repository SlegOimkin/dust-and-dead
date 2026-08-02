const path = require("node:path");
const { expect, test } = require("@playwright/test");

function fileUrl(relativePath) {
  const absolute = path.resolve(__dirname, "..", relativePath).replace(/\\/g, "/");
  return `file:///${absolute}`;
}

async function openGame(page) {
  await page.goto(`${fileUrl("index.html")}?mapSeed=7331&doppelgangerTest=1`);
  const intro = page.locator("#intro-screen");
  if (await intro.isVisible().catch(() => false)) {
    await page.keyboard.press("KeyM");
    await expect(intro).toBeHidden();
  }
  await page.getByRole("button", { name: "Start Hunt" }).click();
  await page.waitForFunction(() => Boolean(
    window.__dustAndDeadTest?.configureBossWeaponBuildForTest &&
    window.__dustAndDeadTest?.forceDoppelgangerScoutForTest &&
    window.__dustAndDeadTest?.forceDoppelgangerTransformForTest &&
    window.__dustAndDeadTest?.setDoppelgangerCloneAmmoForTest &&
    window.__dustAndDeadTest?.getDoppelgangerDiagnostics &&
    window.__dustAndDeadTest?.spawnAmmoCrateAt &&
    window.__dustAndDeadTest?.spawnMiniAmmoCrateAt &&
    window.__dustAndDeadTest?.clearAmmoCrates &&
    window.__dustAndDeadTest?.setAmmoCrateTimer &&
    window.__dustAndDeadTest?.pointHitsStaticObstacleForTest &&
    window.__dustAndDeadTest?.advanceRealFrame &&
    window.__dustMultiplayerTest?.startMockHost &&
    window.__dustMultiplayerTest?.setProgression &&
    window.__dustMultiplayerTest?.setPlayerPosition &&
    window.__dustMultiplayerTest?.getMetaProgression
  ));
  await page.evaluate(() => {
    window.__dustAndDeadTest.setAutomaticFrameLoopModeForTest("paused");
  });
}

test("an exhausted copy reaches a standard crate, reloads, and resumes combat", async ({ page }) => {
  await openGame(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const multiplayer = window.__dustMultiplayerTest;
    const read = () => JSON.parse(window.render_game_to_text());
    const cloneFrom = (diagnostics, id) => diagnostics.clones.find(
      (entry) => entry.id === id
    );

    game.clearEnemies();
    game.clearFireHazards();
    game.clearRifleTraps();
    game.clearAmmoCrates();
    game.setAmmoCrateTimer(999);
    game.setPlayerMaxHp(100000, 100000);
    game.configureBossWeaponBuildForTest({
      playerClass: "gunslinger",
      weapon: "revolver",
      revolverUpgrade: "duelist",
      ammoCurrent: 6,
      ammoReserve: 36,
    });

    function findOpenLane() {
      for (let z = -72; z <= 72; z += 8) {
        for (let x = -80; x <= 56; x += 8) {
          let clear = true;
          for (let dz = -3; dz <= 3 && clear; dz += 1) {
            for (let dx = -2; dx <= 22; dx += 1) {
              if (game.pointHitsStaticObstacleForTest(x + dx, z + dz, 0.84)) {
                clear = false;
                break;
              }
            }
          }
          if (clear) return { x, z };
        }
      }
      return null;
    }

    const lane = findOpenLane();
    if (!lane) throw new Error("No open lane for Doppelganger ammo regression");
    game.setPlayerPosition(lane.x + 18, lane.z);
    game.forceDoppelgangerScoutForTest({
      sourceBossWave: 5,
      dueBossWave: 10,
      x: lane.x,
      z: lane.z,
    });
    const transformed = game.forceDoppelgangerTransformForTest();
    const initialClone = transformed.clones.find((entry) => entry.active);
    if (!initialClone) throw new Error("No active copy after transform");

    game.setDoppelgangerCloneAmmoForTest(initialClone.id, {
      current: 0,
      reserve: 0,
    });
    const initial = game.getDoppelgangerDiagnostics();
    const exhausted = cloneFrom(initial, initialClone.id);
    const crate = game.spawnAmmoCrateAt(exhausted.x + 7, exhausted.z);
    if (!crate || crate.id == null) {
      throw new Error("Standard ammo crate did not receive a stable id");
    }

    const playerAmmoBefore = read().ammo.weapons.revolver;
    const careerBefore = JSON.parse(JSON.stringify(
      multiplayer.getMetaProgression()
    ));
    const pickupCountBefore = exhausted.ammoPickupCount;
    const shotSequenceBefore = exhausted.shotSequence;
    const start = { x: exhausted.x, z: exhausted.z };
    let maximumTravel = 0;
    let seekingSamples = 0;
    let targetIds = [];
    let collected = null;

    for (let frame = 0; frame < 360; frame += 1) {
      game.advanceRealFrame(1000 / 60, { render: false });
      const clone = cloneFrom(
        game.getDoppelgangerDiagnostics(),
        initialClone.id
      );
      if (!clone || !clone.active) {
        throw new Error("Copy disappeared while seeking ammo");
      }
      maximumTravel = Math.max(
        maximumTravel,
        Math.hypot(clone.x - start.x, clone.z - start.z)
      );
      if (clone.ammoSeeking) seekingSamples += 1;
      if (clone.ammoTargetId != null && String(clone.ammoTargetId)) {
        targetIds.push(String(clone.ammoTargetId));
      }
      if (clone.shotSequence !== shotSequenceBefore) {
        throw new Error("Exhausted copy fired before collecting ammo");
      }
      if (clone.ammoPickupCount > pickupCountBefore) {
        collected = clone;
        break;
      }
    }

    if (!collected) throw new Error("Copy did not collect the reachable crate");
    let reloaded = collected.ammo.current > 0 ? collected : null;
    let resumed = collected.shotSequence > shotSequenceBefore ? collected : null;
    for (let frame = 0; frame < 240 && !resumed; frame += 1) {
      game.advanceRealFrame(1000 / 60, { render: false });
      const clone = cloneFrom(
        game.getDoppelgangerDiagnostics(),
        initialClone.id
      );
      if (!clone || !clone.active) {
        throw new Error("Copy disappeared after collecting ammo");
      }
      if (!reloaded && clone.ammo.current > 0) reloaded = clone;
      if (clone.shotSequence > shotSequenceBefore) resumed = clone;
    }

    const playerAmmoAfter = read().ammo.weapons.revolver;
    const careerAfter = JSON.parse(JSON.stringify(
      multiplayer.getMetaProgression()
    ));
    return {
      crate,
      initialAmmo: exhausted.ammo,
      collected,
      reloaded,
      resumed,
      maximumTravel,
      seekingSamples,
      targetIds: Array.from(new Set(targetIds)),
      pickupCountBefore,
      shotSequenceBefore,
      playerAmmoBefore: {
        current: playerAmmoBefore.current,
        reserve: playerAmmoBefore.reserve,
      },
      playerAmmoAfter: {
        current: playerAmmoAfter.current,
        reserve: playerAmmoAfter.reserve,
      },
      careerBefore,
      careerAfter,
      remainingCrates: read().ammoCrates,
    };
  });

  expect(result.initialAmmo).toMatchObject({
    current: 0,
    reserve: 0,
    total: 0,
  });
  expect(result.seekingSamples).toBeGreaterThan(0);
  expect(result.targetIds).toEqual([String(result.crate.id)]);
  expect(result.maximumTravel).toBeGreaterThan(3);
  expect(result.collected.ammoPickupCount).toBe(result.pickupCountBefore + 1);
  expect(result.collected.ammo.total).toBe(36);
  expect(
    result.collected.ammo.reloading || result.collected.ammo.current > 0
  ).toBe(true);
  expect(result.collected.ammoTargetId == null || result.collected.ammoTargetId === "").toBe(true);
  expect(result.reloaded).not.toBeNull();
  expect(result.reloaded.ammo.current).toBeGreaterThan(0);
  expect(result.resumed).not.toBeNull();
  expect(result.resumed.shotSequence).toBeGreaterThan(result.shotSequenceBefore);
  expect(result.playerAmmoAfter).toEqual(result.playerAmmoBefore);
  expect(result.careerAfter).toEqual(result.careerBefore);
  expect(result.remainingCrates).toHaveLength(0);
});

test("healthy and mini crates are ignored, while a simultaneous player pickup wins", async ({ page }) => {
  await openGame(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const read = () => JSON.parse(window.render_game_to_text());
    const cloneFrom = (diagnostics, id) => diagnostics.clones.find(
      (entry) => entry.id === id
    );

    game.clearEnemies();
    game.clearFireHazards();
    game.clearRifleTraps();
    game.clearAmmoCrates();
    game.setAmmoCrateTimer(999);
    game.setPlayerMaxHp(100000, 100000);
    game.configureBossWeaponBuildForTest({
      playerClass: "gunslinger",
      weapon: "revolver",
      revolverUpgrade: "duelist",
      ammoCurrent: 6,
      ammoReserve: 36,
    });
    game.setPlayerPosition(72, 56);
    game.forceDoppelgangerScoutForTest({
      sourceBossWave: 5,
      dueBossWave: 10,
      x: -24,
      z: -24,
    });
    const transformed = game.forceDoppelgangerTransformForTest();
    const initialClone = transformed.clones.find((entry) => entry.active);
    if (!initialClone) throw new Error("No active copy after transform");

    game.setDoppelgangerCloneAmmoForTest(initialClone.id, {
      current: 6,
      reserve: 36,
    });
    const healthyBefore = cloneFrom(
      game.getDoppelgangerDiagnostics(),
      initialClone.id
    );
    const standard = game.spawnAmmoCrateAt(healthyBefore.x, healthyBefore.z);
    if (!standard || standard.id == null) {
      throw new Error("Standard ammo crate did not receive a stable id");
    }
    let healthySeekingSamples = 0;
    for (let frame = 0; frame < 30; frame += 1) {
      game.advanceRealFrame(1000 / 60, { render: false });
      const clone = cloneFrom(
        game.getDoppelgangerDiagnostics(),
        initialClone.id
      );
      if (clone.ammoSeeking) healthySeekingSamples += 1;
    }
    const healthyAfter = cloneFrom(
      game.getDoppelgangerDiagnostics(),
      initialClone.id
    );
    const standardCratesAfterHealthy = read().ammoCrates;

    game.clearAmmoCrates();
    game.setDoppelgangerCloneAmmoForTest(initialClone.id, {
      current: 0,
      reserve: 0,
    });
    const emptyBefore = cloneFrom(
      game.getDoppelgangerDiagnostics(),
      initialClone.id
    );
    const mini = game.spawnMiniAmmoCrateAt(emptyBefore.x, emptyBefore.z);
    let miniSeekingSamples = 0;
    for (let frame = 0; frame < 60; frame += 1) {
      game.advanceRealFrame(1000 / 60, { render: false });
      const clone = cloneFrom(
        game.getDoppelgangerDiagnostics(),
        initialClone.id
      );
      if (clone.ammoSeeking) miniSeekingSamples += 1;
    }
    const emptyAfter = cloneFrom(
      game.getDoppelgangerDiagnostics(),
      initialClone.id
    );
    const miniCratesAfterEmpty = read().ammoCrates;

    game.clearAmmoCrates();
    game.setPlayerPosition(emptyAfter.x, emptyAfter.z);
    game.setAmmo("revolver", 0, 0);
    game.setDoppelgangerCloneAmmoForTest(initialClone.id, {
      current: 0,
      reserve: 0,
    });
    const priorityBefore = cloneFrom(
      game.getDoppelgangerDiagnostics(),
      initialClone.id
    );
    const contested = game.spawnAmmoCrateAt(
      priorityBefore.x,
      priorityBefore.z
    );
    for (let frame = 0; frame < 2; frame += 1) {
      game.advanceRealFrame(1000 / 60, { render: false });
    }
    const priorityAfter = cloneFrom(
      game.getDoppelgangerDiagnostics(),
      initialClone.id
    );
    const playerAfterPriority = read().ammo.weapons.revolver;

    return {
      standard,
      mini,
      healthyBefore,
      healthyAfter,
      healthySeekingSamples,
      standardCratesAfterHealthy,
      emptyBefore,
      emptyAfter,
      miniSeekingSamples,
      miniCratesAfterEmpty,
      contested,
      priorityBefore,
      priorityAfter,
      playerAfterPriority: {
        current: playerAfterPriority.current,
        reserve: playerAfterPriority.reserve,
        total: playerAfterPriority.total,
      },
      priorityCratesAfter: read().ammoCrates,
    };
  });

  expect(result.healthyBefore.ammo).toMatchObject({
    current: 6,
    reserve: 36,
    total: 42,
  });
  expect(result.healthySeekingSamples).toBe(0);
  expect(result.healthyAfter.ammoPickupCount).toBe(
    result.healthyBefore.ammoPickupCount
  );
  expect(result.healthyAfter.ammoSeeking).toBe(false);
  expect(result.healthyAfter.ammoTargetId == null || result.healthyAfter.ammoTargetId === "").toBe(true);
  expect(result.standardCratesAfterHealthy).toHaveLength(1);
  expect(result.standardCratesAfterHealthy[0].mini).toBe(false);

  expect(result.emptyBefore.ammo).toMatchObject({
    current: 0,
    reserve: 0,
    total: 0,
  });
  expect(result.mini.mini).toBe(true);
  expect(result.miniSeekingSamples).toBe(0);
  expect(result.emptyAfter.ammoPickupCount).toBe(
    result.emptyBefore.ammoPickupCount
  );
  expect(result.emptyAfter.ammo).toMatchObject({
    current: 0,
    reserve: 0,
    total: 0,
  });
  expect(result.emptyAfter.ammoTargetId == null || result.emptyAfter.ammoTargetId === "").toBe(true);
  expect(result.miniCratesAfterEmpty).toHaveLength(1);
  expect(result.miniCratesAfterEmpty[0].mini).toBe(true);

  expect(result.contested).not.toBeNull();
  expect(result.priorityAfter.ammoPickupCount).toBe(
    result.priorityBefore.ammoPickupCount
  );
  expect(result.priorityAfter.ammo.total).toBe(0);
  expect(result.playerAfterPriority.total).toBe(36);
  expect(result.priorityCratesAfter).toHaveLength(0);
});

test("every copied weapon refills from a standard crate without touching player state", async ({ page }) => {
  await openGame(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const read = () => JSON.parse(window.render_game_to_text());
    const builds = [
      {
        label: "dual revolvers",
        weapon: "revolver",
        spec: {
          playerClass: "gunslinger",
          weapon: "revolver",
          revolverUpgrade: "dualRevolvers",
          ammoCurrent: 12,
          ammoReserve: 72,
        },
      },
      {
        label: "rifle",
        weapon: "rifle",
        spec: {
          playerClass: "ranger",
          weapon: "rifle",
          rifleUpgrade: "trailWarden",
          ammoCurrent: 18,
          ammoReserve: 65,
        },
      },
      {
        label: "launcher",
        weapon: "launcher",
        spec: {
          playerClass: "demolitionist",
          weapon: "launcher",
          launcherUpgrade: "bombardier",
          ammoCurrent: 3,
          ammoReserve: 30,
        },
      },
      {
        label: "coach gun",
        weapon: "coachGun",
        spec: {
          playerClass: "marshal",
          weapon: "coachGun",
          marshalUpgrade: "breachMarshal",
          ammoCurrent: 2,
          ammoReserve: 36,
        },
      },
    ];
    const samples = [];

    for (let buildIndex = 0; buildIndex < builds.length; buildIndex += 1) {
      const build = builds[buildIndex];
      game.clearEnemies();
      game.clearFireHazards();
      game.clearRifleTraps();
      game.clearAmmoCrates();
      game.setAmmoCrateTimer(999);
      game.setPlayerMaxHp(100000, 100000);
      game.configureBossWeaponBuildForTest(build.spec);
      game.setPlayerPosition(72, 56);
      game.forceDoppelgangerScoutForTest({
        sourceBossWave: 5,
        dueBossWave: 10,
        x: -24,
        z: -24,
      });
      const transformed = game.forceDoppelgangerTransformForTest();
      const initialClone = transformed.clones.find((entry) => entry.active);
      if (!initialClone) {
        throw new Error(`No active ${build.label} copy`);
      }
      const empty = game.setDoppelgangerCloneAmmoForTest(
        initialClone.id,
        { current: 0, reserve: 0 }
      );
      const playerBeforeState = read();
      const playerBefore = playerBeforeState.ammo.weapons[build.weapon];
      const hpBefore = playerBeforeState.player.hp;
      const crate = game.spawnAmmoCrateAt(empty.x + 7, empty.z);
      if (!crate || crate.id == null) {
        throw new Error(`No stable crate id for ${build.label}`);
      }

      let collected = null;
      let lastClone = empty;
      for (let frame = 0; frame < 120; frame += 1) {
        game.advanceRealFrame(1000 / 60, { render: false });
        const clone = game.getDoppelgangerDiagnostics().clones.find(
          (entry) => entry.id === initialClone.id
        );
        lastClone = clone;
        if (clone.ammoPickupCount > empty.ammoPickupCount) {
          collected = clone;
          break;
        }
      }
      if (!collected) {
        throw new Error(
          `${build.label} copy did not collect ammo: ` +
          JSON.stringify({
            ammo: lastClone && lastClone.ammo,
            seeking: lastClone && lastClone.ammoSeeking,
            targetId: lastClone && lastClone.ammoTargetId,
            x: lastClone && lastClone.x,
            z: lastClone && lastClone.z,
            crate,
          })
        );
      }

      let loaded = collected.ammo.current > 0 ? collected : null;
      for (let frame = 0; frame < 180 && !loaded; frame += 1) {
        game.advanceRealFrame(1000 / 60, { render: false });
        const clone = game.getDoppelgangerDiagnostics().clones.find(
          (entry) => entry.id === initialClone.id
        );
        if (clone.ammo.current > 0) loaded = clone;
      }
      const playerAfterState = read();
      const playerAfter = playerAfterState.ammo.weapons[build.weapon];
      samples.push({
        label: build.label,
        weapon: build.weapon,
        copiedVisual: initialClone.weaponVisualId,
        freeFireActive: empty.ammo.freeFireActive,
        pickupCountBefore: empty.ammoPickupCount,
        collected,
        loaded,
        playerBefore: {
          current: playerBefore.current,
          reserve: playerBefore.reserve,
          total: playerBefore.total,
        },
        playerAfter: {
          current: playerAfter.current,
          reserve: playerAfter.reserve,
          total: playerAfter.total,
        },
        hpBefore,
        hpAfter: playerAfterState.player.hp,
      });
    }
    return samples;
  });

  expect(result.map((sample) => sample.weapon)).toEqual([
    "revolver",
    "rifle",
    "launcher",
    "coachGun",
  ]);
  expect(result[0].copiedVisual).toBe("dualRevolvers");
  for (const sample of result) {
    expect(sample.freeFireActive, sample.label).toBe(false);
    expect(sample.collected.ammoPickupCount, sample.label).toBe(
      sample.pickupCountBefore + 1
    );
    expect(sample.collected.ammo.total, sample.label).toBeGreaterThan(0);
    expect(sample.loaded, sample.label).not.toBeNull();
    expect(sample.loaded.ammo.current, sample.label).toBeGreaterThan(0);
    expect(sample.playerAfter, sample.label).toEqual(sample.playerBefore);
    expect(sample.hpAfter, sample.label).toBe(sample.hpBefore);
  }
});

test("two exhausted copies reserve different nearby crates", async ({ page }) => {
  await openGame(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const multiplayer = window.__dustMultiplayerTest;
    const build = {
      playerClass: "gunslinger",
      weapon: "revolver",
      revolverUpgrade: "duelist",
      ownedWeapons: { revolver: true },
      upgradeCounts: {},
      ammo: { revolver: 6, rifle: 0, launcher: 0, coachGun: 0 },
      ammoReserve: { revolver: 36, rifle: 0, launcher: 0, coachGun: 0 },
    };

    multiplayer.startMockHost(["North", "South"]);
    game.clearEnemies();
    game.clearFireHazards();
    game.clearRifleTraps();
    game.clearAmmoCrates();
    game.setAmmoCrateTimer(999);
    const players = multiplayer.getState().players;
    players.forEach((player, index) => {
      multiplayer.setProgression(player.id, build);
      multiplayer.setPlayerPosition(player.id, 32, index ? 8 : -8);
    });

    function findOpenPatch() {
      for (let z = -64; z <= 64; z += 8) {
        for (let x = -64; x <= 64; x += 8) {
          let clear = true;
          for (let dz = -12; dz <= 12 && clear; dz += 1) {
            for (let dx = -12; dx <= 12; dx += 1) {
              if (game.pointHitsStaticObstacleForTest(x + dx, z + dz, 0.84)) {
                clear = false;
                break;
              }
            }
          }
          if (clear) return { x, z };
        }
      }
      return null;
    }

    const patch = findOpenPatch();
    if (!patch) throw new Error("No open patch for two-copy ammo regression");
    players.forEach((player, index) => {
      multiplayer.setPlayerPosition(
        player.id,
        patch.x + 22,
        patch.z + (index ? 4 : -4)
      );
    });
    game.forceDoppelgangerScoutForTest({
      sourceBossWave: 5,
      dueBossWave: 10,
      x: patch.x,
      z: patch.z,
    });
    const transformed = game.forceDoppelgangerTransformForTest();
    const clones = transformed.clones
      .filter((entry) => entry.active)
      .sort((a, b) => a.sourceSlot - b.sourceSlot);
    if (clones.length !== 2) throw new Error("Expected two active copies");
    clones.forEach((clone) => {
      game.setDoppelgangerCloneAmmoForTest(clone.id, {
        current: 0,
        reserve: 0,
      });
    });

    const north = game.spawnAmmoCrateAt(patch.x, patch.z + 10);
    const south = game.spawnAmmoCrateAt(patch.x, patch.z - 10);
    if (!north || north.id == null || !south || south.id == null) {
      throw new Error("Team ammo crates did not receive stable ids");
    }

    let assigned = null;
    for (let frame = 0; frame < 24; frame += 1) {
      game.advanceRealFrame(1000 / 60, { render: false });
      const diagnostics = game.getDoppelgangerDiagnostics();
      const current = clones.map((clone) => diagnostics.clones.find(
        (entry) => entry.id === clone.id
      ));
      if (current.every((clone) => (
        clone &&
        clone.ammoSeeking &&
        clone.ammoTargetId != null &&
        String(clone.ammoTargetId)
      ))) {
        assigned = current;
        break;
      }
    }

    return {
      north,
      south,
      assigned,
      pickupCounts: clones.map((clone) => clone.ammoPickupCount),
    };
  });

  expect(result.assigned).not.toBeNull();
  const expectedIds = [String(result.north.id), String(result.south.id)].sort();
  const assignedIds = result.assigned.map(
    (clone) => String(clone.ammoTargetId)
  ).sort();
  expect(assignedIds).toEqual(expectedIds);
  expect(new Set(assignedIds).size).toBe(2);
  for (const clone of result.assigned) {
    expect(clone.ammoUrgency).toBeGreaterThan(0);
    expect(clone.ammoPickupCount).toBe(0);
  }
});
