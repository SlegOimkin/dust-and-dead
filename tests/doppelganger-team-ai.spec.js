const path = require("node:path");
const { expect, test } = require("@playwright/test");

const TEAM_BUILDS = [
  {
    playerClass: "gunslinger",
    weapon: "revolver",
    revolverUpgrade: "duelist",
    ownedWeapons: { revolver: true },
    upgradeCounts: {},
    ammo: { revolver: 6, rifle: 0, launcher: 0, coachGun: 0 },
    ammoReserve: { revolver: 36, rifle: 0, launcher: 0, coachGun: 0 },
  },
  {
    playerClass: "ranger",
    weapon: "rifle",
    rifleUpgrade: "trailWarden",
    ownedWeapons: { revolver: true, rifle: true },
    upgradeCounts: { trailLayer: 1 },
    ammo: { revolver: 6, rifle: 12, launcher: 0, coachGun: 0 },
    ammoReserve: { revolver: 36, rifle: 48, launcher: 0, coachGun: 0 },
  },
  {
    playerClass: "demolitionist",
    weapon: "launcher",
    launcherUpgrade: "bombardier",
    ownedWeapons: { revolver: true, launcher: true },
    upgradeCounts: {},
    ammo: { revolver: 6, rifle: 0, launcher: 4, coachGun: 0 },
    ammoReserve: { revolver: 36, rifle: 0, launcher: 20, coachGun: 0 },
  },
  {
    playerClass: "marshal",
    weapon: "coachGun",
    marshalUpgrade: "breachMarshal",
    ownedWeapons: { revolver: true, coachGun: true },
    upgradeCounts: {},
    ammo: { revolver: 6, rifle: 0, launcher: 0, coachGun: 2 },
    ammoReserve: { revolver: 36, rifle: 0, launcher: 0, coachGun: 20 },
  },
];

function fileUrl(relativePath) {
  const absolute = path.resolve(__dirname, "..", relativePath).replace(/\\/g, "/");
  return `file:///${absolute}`;
}

async function openDoppelgangerTeamGame(page) {
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
    window.__dustAndDeadTest?.replanDoppelgangerTeamForTest &&
    window.__dustAndDeadTest?.advanceDoppelgangerCloneRuntimeForTest &&
    window.__dustAndDeadTest?.damageDoppelgangerCloneForTest &&
    window.__dustAndDeadTest?.getDoppelgangerDiagnostics &&
    window.__dustAndDeadTest?.clearFireHazards &&
    window.__dustAndDeadTest?.clearRifleTraps &&
    window.__dustMultiplayerTest?.startMockHost &&
    window.__dustMultiplayerTest?.setHealth &&
    window.__dustMultiplayerTest?.setProgression &&
    window.__dustMultiplayerTest?.setConnected &&
    window.__dustMultiplayerTest?.spawnTrailTrapNow &&
    window.__dustMultiplayerTest?.spawnFirePatch
  ));
  await page.evaluate(() => {
    window.__dustAndDeadTest.setAutomaticFrameLoopModeForTest("paused");
  });
}

function circularDistance(a, b) {
  return Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
}

function minimumPairDistance(points) {
  let minimum = Infinity;
  for (let left = 0; left < points.length; left += 1) {
    for (let right = left + 1; right < points.length; right += 1) {
      minimum = Math.min(
        minimum,
        Math.hypot(
          points[left].x - points[right].x,
          points[left].z - points[right].z
        )
      );
    }
  }
  return minimum;
}

test("timed focus caps attackers, then cools down into a balanced split", async ({ page }) => {
  await openDoppelgangerTeamGame(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const multiplayer = window.__dustMultiplayerTest;
    multiplayer.startMockHost(["Low", "Wing A", "Wing B", "Wing C"]);
    game.clearEnemies();

    const players = multiplayer.getState().players;
    const lowId = players[0].id;
    const positions = [
      [-34, -32],
      [24, 22],
      [28, 22],
      [24, 26],
    ];
    players.forEach((player, index) => {
      multiplayer.setPlayerPosition(player.id, positions[index][0], positions[index][1]);
    });
    multiplayer.setHealth(lowId, 1);

    game.forceDoppelgangerScoutForTest({
      sourceBossWave: 5,
      dueBossWave: 10,
      x: 0,
      z: 0,
    });
    game.forceDoppelgangerTransformForTest();
    const focused = game.replanDoppelgangerTeamForTest();

    game.advanceDoppelgangerCloneRuntimeForTest(0, { seconds: 1.2 });
    const expired = game.replanDoppelgangerTeamForTest();
    const cooldown = game.replanDoppelgangerTeamForTest();

    game.advanceDoppelgangerCloneRuntimeForTest(0, { seconds: 1.45 });
    const refocused = game.replanDoppelgangerTeamForTest();

    return { lowId, focused, expired, cooldown, refocused };
  });

  expect(result.focused.team).toMatchObject({
    mode: "focus",
    focusTargetPlayerId: result.lowId,
    livingCount: 4,
    playerCount: 4,
  });
  expect(result.focused.team.targetLoads[result.lowId]).toBeGreaterThanOrEqual(1);
  expect(result.focused.team.targetLoads[result.lowId]).toBeLessThanOrEqual(2);

  for (const sample of [result.expired, result.cooldown]) {
    expect(sample.team.mode).toBe("split");
    expect(sample.team.focusTargetPlayerId).toBe("");
    const loads = Object.values(sample.team.targetLoads);
    expect(loads.reduce((sum, load) => sum + load, 0)).toBe(4);
    expect(Math.max(...loads) - Math.min(...loads)).toBeLessThanOrEqual(1);
  }

  expect(result.refocused.team).toMatchObject({
    mode: "focus",
    focusTargetPlayerId: result.lowId,
  });
  expect(result.refocused.team.targetLoads[result.lowId]).toBeLessThanOrEqual(2);
});

test("a lethal in-flight reservation keeps the following copy from firing", async ({ page }) => {
  await openDoppelgangerTeamGame(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const multiplayer = window.__dustMultiplayerTest;
    multiplayer.startMockHost(["Target", "Detached Copy"]);
    game.clearEnemies();

    const players = multiplayer.getState().players;
    players.forEach((player) => {
      multiplayer.setProgression(player.id, {
        weapon: "revolver",
        ownedWeapons: { revolver: true },
        ammo: { revolver: 6, rifle: 0, launcher: 0, coachGun: 0 },
        ammoReserve: { revolver: 36, rifle: 0, launcher: 0, coachGun: 0 },
      });
    });

    let clearPatch = null;
    for (let z = -72; z <= 72 && !clearPatch; z += 8) {
      for (let x = -72; x <= 56 && !clearPatch; x += 8) {
        let clear = true;
        for (let dz = -5; dz <= 5 && clear; dz += 1) {
          for (let dx = -4; dx <= 12; dx += 1) {
            if (game.pointHitsStaticObstacleForTest(x + dx, z + dz, 0.82)) {
              clear = false;
              break;
            }
          }
        }
        if (clear) clearPatch = { x, z };
      }
    }
    if (!clearPatch) throw new Error("No clear Doppelganger fire-discipline patch found");

    game.forceDoppelgangerScoutForTest({
      sourceBossWave: 5,
      dueBossWave: 10,
      x: clearPatch.x,
      z: clearPatch.z,
    });
    multiplayer.setPlayerPosition(
      players[0].id,
      clearPatch.x + 10,
      clearPatch.z
    );
    multiplayer.setPlayerPosition(
      players[1].id,
      clearPatch.x - 10,
      clearPatch.z
    );
    game.forceDoppelgangerTransformForTest();

    multiplayer.setConnected(players[1].id, false);
    multiplayer.setHealth(players[0].id, 1);
    const assigned = game.replanDoppelgangerTeamForTest();
    let after = game.getDoppelgangerDiagnostics();
    let shotSnapshot = null;
    for (let frame = 0; frame < 90; frame += 1) {
      game.advanceRealFrame(1000 / 60, { render: false });
      after = game.getDoppelgangerDiagnostics();
      if (!shotSnapshot && after.clones.some(
        (clone) => clone.shotSequence > 0 &&
          clone.reservedTargetPlayerId === players[0].id &&
          clone.reservedDamage >= 1
      )) {
        shotSnapshot = after;
      }
      if (after.clones.some(
        (clone) => clone.holdFireReason === "reserved-damage"
      )) {
        break;
      }
    }

    return {
      targetId: players[0].id,
      clearPatch,
      assigned,
      after,
      shotSnapshot,
    };
  });

  expect(result.assigned.team.targetLoads[result.targetId]).toBe(2);
  expect(result.assigned.clones.every(
    (clone) => clone.teamTargetPlayerId === result.targetId
  )).toBe(true);

  const shooters = (result.shotSnapshot?.clones || []).filter(
    (clone) => clone.shotSequence > 0 &&
      clone.reservedTargetPlayerId === result.targetId &&
      clone.reservedDamage >= 1
  );
  const held = result.after.clones.filter(
    (clone) => clone.holdFireReason === "reserved-damage"
  );
  expect(shooters).toHaveLength(1);
  expect(held).toHaveLength(1);
  expect(held[0].shotSequence).toBe(0);
  expect(result.after.worldObjects.bullets).toBeGreaterThanOrEqual(1);
});

test("a switched target cannot be shot until the visible aim catches the real shot ray", async ({ page }) => {
  await openDoppelgangerTeamGame(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const multiplayer = window.__dustMultiplayerTest;
    const started = multiplayer.startMockHost(["East", "West"]);
    started.players.forEach((player) => {
      multiplayer.setProgression(player.id, {
        weapon: "revolver",
        ownedWeapons: { revolver: true },
        ammo: { revolver: 6, rifle: 0, launcher: 0, coachGun: 0 },
        ammoReserve: { revolver: 36, rifle: 0, launcher: 0, coachGun: 0 },
      });
      multiplayer.setHealth(player.id, 100);
    });
    game.clearEnemies();

    let clearPatch = null;
    for (let z = -56; z <= 56 && !clearPatch; z += 8) {
      for (let x = -24; x <= 24 && !clearPatch; x += 8) {
        let clear = true;
        for (let dz = -5; dz <= 5 && clear; dz += 1) {
          for (let dx = -12; dx <= 12; dx += 1) {
            if (game.pointHitsStaticObstacleForTest(x + dx, z + dz, 0.82)) {
              clear = false;
              break;
            }
          }
        }
        if (clear) clearPatch = { x, z };
      }
    }
    if (!clearPatch) throw new Error("No clear aim-switch lane found");

    multiplayer.setPlayerPosition(
      started.players[0].id,
      clearPatch.x + 46,
      clearPatch.z
    );
    multiplayer.setPlayerPosition(
      started.players[1].id,
      clearPatch.x - 46,
      clearPatch.z
    );
    game.forceDoppelgangerScoutForTest({
      sourceBossWave: 5,
      dueBossWave: 10,
      x: clearPatch.x,
      z: clearPatch.z,
    });
    game.forceDoppelgangerTransformForTest();
    game.advanceRealFrame(900, { render: false });

    const settled = game.getDoppelgangerDiagnostics();
    const clone = settled.clones.find(
      (entry) => entry.sourcePlayerId === started.players[0].id
    );
    multiplayer.setPlayerPosition(
      started.players[1].id,
      clone.x - 10,
      clone.z
    );
    multiplayer.setConnected(started.players[0].id, false);
    game.replanDoppelgangerTeamForTest();
    const shotsBefore = clone.shotSequence;
    game.advanceRealFrame(1000 / 60, { render: false });
    const turning = game.getDoppelgangerDiagnostics().clones.find(
      (entry) => entry.id === clone.id
    );

    let fired = null;
    for (let frame = 0; frame < 120 && !fired; frame += 1) {
      game.advanceRealFrame(1000 / 60, { render: false });
      const sample = game.getDoppelgangerDiagnostics().clones.find(
        (entry) => entry.id === clone.id
      );
      if (sample.shotSequence > shotsBefore) fired = sample;
    }
    return {
      targetId: started.players[1].id,
      shotsBefore,
      turning,
      fired,
    };
  });

  expect(result.turning).toMatchObject({
    teamTargetPlayerId: result.targetId,
    shotSequence: result.shotsBefore,
    holdFireReason: "turning",
  });
  expect(result.turning.shotAngularError).toBeGreaterThan(0.12);
  expect(result.fired).not.toBeNull();
  expect(result.fired.shotAngularError).toBeLessThanOrEqual(0.1);
  const rayAngle = Math.atan2(
    result.fired.shotRayTargetX - result.fired.x,
    result.fired.shotRayTargetZ - result.fired.z
  );
  expect(circularDistance(rayAngle, result.fired.aimAngle))
    .toBeLessThan(0.01);
});

test("four copies keep weapon-derived roles and split a 4v4 roster evenly", async ({ page }) => {
  await openDoppelgangerTeamGame(page);

  const result = await page.evaluate(({ builds }) => {
    const game = window.__dustAndDeadTest;
    const multiplayer = window.__dustMultiplayerTest;
    multiplayer.startMockHost(["Flanker", "Anchor", "Artillery", "Vanguard"]);
    const players = multiplayer.getState().players;
    const positions = [
      [-26, -22],
      [-22, -22],
      [-26, -18],
      [-22, -18],
    ];
    players.forEach((player, index) => {
      multiplayer.setProgression(player.id, builds[index]);
      multiplayer.setPlayerPosition(
        player.id,
        positions[index][0],
        positions[index][1]
      );
      multiplayer.setHealth(player.id, 100);
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
    game.forceDoppelgangerTransformForTest();
    const first = game.replanDoppelgangerTeamForTest();
    const second = game.replanDoppelgangerTeamForTest();

    return {
      playerIds: players.map((player) => player.id),
      first,
      second,
    };
  }, { builds: TEAM_BUILDS });

  expect(result.first.phase).toBe("boss");
  expect(result.first.team).toMatchObject({
    mode: "split",
    livingCount: 4,
    playerCount: 4,
  });
  expect(
    result.first.clones.map((clone) => ({
      sourcePlayerId: clone.sourcePlayerId,
      weapon: clone.weapon,
      teamRole: clone.teamRole,
    }))
  ).toEqual([
    {
      sourcePlayerId: result.playerIds[0],
      weapon: "revolver",
      teamRole: "flanker",
    },
    {
      sourcePlayerId: result.playerIds[1],
      weapon: "rifle",
      teamRole: "anchor",
    },
    {
      sourcePlayerId: result.playerIds[2],
      weapon: "launcher",
      teamRole: "artillery",
    },
    {
      sourcePlayerId: result.playerIds[3],
      weapon: "coachGun",
      teamRole: "vanguard",
    },
  ]);
  expect(Object.keys(result.first.team.targetLoads).sort()).toEqual(
    result.playerIds.slice().sort()
  );
  expect(Object.values(result.first.team.targetLoads).sort()).toEqual([1, 1, 1, 1]);
  expect(new Set(
    result.first.clones.map((clone) => clone.teamTargetPlayerId)
  ).size).toBe(4);

  const firstById = new Map(
    result.first.clones.map((clone) => [clone.id, clone])
  );
  for (const clone of result.second.clones) {
    const prior = firstById.get(clone.id);
    expect(prior).toBeTruthy();
    expect(clone.teamRole).toBe(prior.teamRole);
    expect(clone.teamTargetPlayerId).toBe(prior.teamTargetPlayerId);
  }
});

test("two and four copies assigned to one survivor keep separated stable sectors and goals", async ({ page }) => {
  await openDoppelgangerTeamGame(page);

  const result = await page.evaluate(({ builds }) => {
    function runScenario(copyCount, originX) {
      const game = window.__dustAndDeadTest;
      const multiplayer = window.__dustMultiplayerTest;
      const names = ["Survivor", "Copy B", "Copy C", "Copy D"].slice(
        0,
        copyCount
      );
      multiplayer.startMockHost(names);
      const players = multiplayer.getState().players;
      players.forEach((player, index) => {
        multiplayer.setProgression(player.id, builds[index]);
        multiplayer.setPlayerPosition(
          player.id,
          originX + (index % 2) * 3,
          -22 + Math.floor(index / 2) * 3
        );
        multiplayer.setHealth(player.id, 100);
      });
      game.clearEnemies();
      game.clearFireHazards();
      game.clearRifleTraps();
      game.forceDoppelgangerScoutForTest({
        sourceBossWave: 5,
        dueBossWave: 10,
        x: originX + 1.5,
        z: -20.5,
      });
      game.forceDoppelgangerTransformForTest();
      players.slice(1).forEach((player) => {
        multiplayer.setConnected(player.id, false);
      });

      const first = game.replanDoppelgangerTeamForTest();
      const second = game.replanDoppelgangerTeamForTest();
      return {
        survivorId: multiplayer.getState().players[0].id,
        first,
        second,
      };
    }

    return {
      two: runScenario(2, -30),
      four: runScenario(4, -24),
    };
  }, { builds: TEAM_BUILDS });

  for (const [key, expectedCount] of [["two", 2], ["four", 4]]) {
    const scenario = result[key];
    const active = scenario.first.clones.filter((clone) => clone.active);
    expect(scenario.first.team).toMatchObject({
      mode: "split",
      livingCount: expectedCount,
      playerCount: 1,
    });
    expect(scenario.first.team.targetLoads[scenario.survivorId]).toBe(
      expectedCount
    );
    expect(active).toHaveLength(expectedCount);
    expect(active.every(
      (clone) => clone.teamTargetPlayerId === scenario.survivorId
    )).toBe(true);
    expect(
      active.map((clone) => clone.teamFormationSlot).sort((a, b) => a - b)
    ).toEqual(Array.from({ length: expectedCount }, (_, index) => index));

    const firstById = new Map(active.map((clone) => [clone.id, clone]));
    for (const clone of scenario.second.clones.filter((entry) => entry.active)) {
      const prior = firstById.get(clone.id);
      expect(prior).toBeTruthy();
      expect(clone.teamFormationSlot).toBe(prior.teamFormationSlot);
      expect(clone.teamSectorAngle).toBe(prior.teamSectorAngle);
      expect(clone.teamGoalX).toBe(prior.teamGoalX);
      expect(clone.teamGoalZ).toBe(prior.teamGoalZ);
    }

    let minimumAngleGap = Infinity;
    for (let left = 0; left < active.length; left += 1) {
      for (let right = left + 1; right < active.length; right += 1) {
        minimumAngleGap = Math.min(
          minimumAngleGap,
          circularDistance(
            active[left].teamSectorAngle,
            active[right].teamSectorAngle
          )
        );
      }
    }
    expect(minimumAngleGap).toBeGreaterThan(expectedCount === 2 ? 3 : 1.45);
    expect(minimumPairDistance(
      active.map((clone) => ({ x: clone.teamGoalX, z: clone.teamGoalZ }))
    )).toBeGreaterThan(3.5);
  }
});

test("one recently hit low-health copy receives exactly one stable peel rescuer", async ({ page }) => {
  await openDoppelgangerTeamGame(page);

  const result = await page.evaluate(({ builds }) => {
    const game = window.__dustAndDeadTest;
    const multiplayer = window.__dustMultiplayerTest;
    multiplayer.startMockHost(["Flanker", "Anchor", "Endangered", "Attacker"]);
    const players = multiplayer.getState().players;
    const positions = [
      [-26, -22],
      [-22, -22],
      [-26, -18],
      [-22, -18],
    ];
    players.forEach((player, index) => {
      multiplayer.setProgression(player.id, builds[index]);
      multiplayer.setPlayerPosition(
        player.id,
        positions[index][0],
        positions[index][1]
      );
      multiplayer.setHealth(player.id, 100);
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
    const transformed = game.forceDoppelgangerTransformForTest();
    const endangered = transformed.clones.find(
      (clone) => clone.sourcePlayerId === players[2].id
    );

    const farPositions = [
      [-64, -58],
      [-61, -58],
      [-64, -55],
      [-61, -55],
    ];
    players.forEach((player, index) => {
      multiplayer.setPlayerPosition(
        player.id,
        farPositions[index][0],
        farPositions[index][1]
      );
    });
    game.advanceRealFrame(20, { render: false });
    const requestedDamage = endangered.maxHp * 0.6;
    const hit = game.damageDoppelgangerCloneForTest(
      endangered.networkId,
      requestedDamage,
      {
        type: "rifle",
        ownerPlayerId: players[3].id,
        attackerId: players[3].id,
        direct: true,
      }
    );
    const first = game.replanDoppelgangerTeamForTest();
    const second = game.replanDoppelgangerTeamForTest();
    const endangeredAfter = first.clones.find(
      (clone) => clone.id === endangered.id
    );
    const nearestPlayerDistance = Math.min(
      ...multiplayer.getState().players
        .filter((player) => player.alive)
        .map((player) => Math.hypot(
          player.x - endangeredAfter.x,
          player.z - endangeredAfter.z
        ))
    );
    players.forEach((player) => {
      multiplayer.setConnected(player.id, false);
    });
    const idle = game.replanDoppelgangerTeamForTest();

    return {
      attackerPlayerId: players[3].id,
      endangeredCloneId: endangered.id,
      requestedDamage,
      hit,
      nearestPlayerDistance,
      first,
      second,
      idle,
    };
  }, { builds: TEAM_BUILDS });

  expect(result.nearestPlayerDistance).toBeGreaterThan(7.5);
  expect(result.hit.applied).toBe(result.hit.requested);
  expect(result.hit.applied).toBeCloseTo(result.requestedDamage, 5);
  expect(result.hit.hpAfter / result.hit.hpBefore).toBeCloseTo(0.4, 5);
  expect(result.first.team).toMatchObject({
    mode: "peel",
    focusTargetPlayerId: "",
    rescueCloneId: result.endangeredCloneId,
    rescueTargetPlayerId: result.attackerPlayerId,
  });

  const peelers = result.first.clones.filter(
    (clone) => clone.active && clone.teamIntent === "peel"
  );
  expect(peelers).toHaveLength(1);
  expect(peelers[0].id).toBe(result.first.team.rescuerCloneId);
  expect(peelers[0].id).not.toBe(result.endangeredCloneId);
  expect(peelers[0]).toMatchObject({
    teamTargetPlayerId: result.attackerPlayerId,
    teamTargetReason: "ally-pressure",
    teamAssistCloneId: result.endangeredCloneId,
  });

  const endangered = result.first.clones.find(
    (clone) => clone.id === result.endangeredCloneId
  );
  expect(endangered).toMatchObject({
    teamIntent: "retreat",
    teamTargetPlayerId: result.attackerPlayerId,
    teamTargetReason: "rescued",
    teamAssistCloneId: peelers[0].id,
  });

  const repeatedPeelers = result.second.clones.filter(
    (clone) => clone.active && clone.teamIntent === "peel"
  );
  expect(result.second.team.rescuerCloneId).toBe(peelers[0].id);
  expect(repeatedPeelers).toHaveLength(1);
  expect(repeatedPeelers[0].id).toBe(peelers[0].id);
  expect(result.idle.team).toMatchObject({
    mode: "idle",
    playerCount: 0,
    focusTargetPlayerId: "",
    rescueCloneId: "",
    rescuerCloneId: "",
    rescueTargetPlayerId: "",
    targetLoads: {},
  });
});

test("player fire and rifle traps enter the team hazard map without mutating copy stats or direction invariants", async ({ page }) => {
  await openDoppelgangerTeamGame(page);

  const result = await page.evaluate(({ builds }) => {
    const game = window.__dustAndDeadTest;
    const multiplayer = window.__dustMultiplayerTest;
    multiplayer.startMockHost(["Flanker", "Anchor", "Artillery", "Vanguard"]);
    const players = multiplayer.getState().players;
    const positions = [
      [-26, -22],
      [-22, -22],
      [-26, -18],
      [-22, -18],
    ];
    players.forEach((player, index) => {
      multiplayer.setProgression(player.id, builds[index]);
      multiplayer.setPlayerPosition(
        player.id,
        positions[index][0],
        positions[index][1]
      );
      multiplayer.setHealth(player.id, 100);
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
    game.forceDoppelgangerTransformForTest();
    const before = game.replanDoppelgangerTeamForTest();

    function copyStats(diagnostics) {
      return diagnostics.clones.map((clone) => ({
        id: clone.id,
        weapon: clone.weapon,
        level: clone.level,
        playerClass: clone.playerClass,
        hp: clone.hp,
        maxHp: clone.maxHp,
        speed: clone.speed,
        activeMoveSpeed: clone.activeMoveSpeed,
        cooldown: clone.cooldown,
        copiedShotDamage: clone.copiedShotDamage,
        attackSequence: clone.attackSequence,
        shotSequence: clone.shotSequence,
        runtime: clone.runtime,
      }));
    }

    function playerStats() {
      return multiplayer.getState().players.map((player) => ({
        id: player.id,
        alive: player.alive,
        hp: player.hp,
        progression: player.progression,
      }));
    }

    const hazardClone = before.clones.find((clone) => clone.active);
    const hazardPoint = {
      x: hazardClone.teamGoalX,
      z: hazardClone.teamGoalZ,
    };
    multiplayer.setPlayerPosition(players[1].id, hazardPoint.x, hazardPoint.z);
    const fire = multiplayer.spawnFirePatch(players[0].id, {
      x: hazardPoint.x,
      z: hazardPoint.z,
      radius: 2.2,
      life: 8,
      damage: 1,
      type: "trail",
    });
    const trap = multiplayer.spawnTrailTrapNow(players[1].id);
    const preReplan = game.getDoppelgangerDiagnostics();
    const cloneStatsBefore = copyStats(preReplan);
    const playerStatsBefore = playerStats();
    const after = game.replanDoppelgangerTeamForTest();
    const cloneStatsAfter = copyStats(after);
    const playerStatsAfter = playerStats();

    return {
      fire,
      trap,
      trapOwnerId: players[1].id,
      before,
      preReplan,
      after,
      cloneStatsBefore,
      cloneStatsAfter,
      playerStatsBefore,
      playerStatsAfter,
    };
  }, { builds: TEAM_BUILDS });

  expect(result.fire).toMatchObject({ ownerPlayerId: "mock-player-1" });
  expect(result.trap).not.toBeNull();
  expect(result.trap.ownerPlayerId).toBe(result.trapOwnerId);
  expect(result.before.team.hazardCounts).toMatchObject({
    firePatches: 0,
    rifleTraps: 0,
  });
  expect(result.preReplan.team.hazardCounts).toMatchObject({
    firePatches: 0,
    rifleTraps: 0,
  });
  expect(result.after.team.hazardCounts).toMatchObject({
    firePatches: 1,
    rifleTraps: 1,
  });
  expect(result.cloneStatsAfter).toEqual(result.cloneStatsBefore);
  expect(result.playerStatsAfter).toEqual(result.playerStatsBefore);

  for (const clone of result.after.clones.filter((entry) => entry.active)) {
    expect(Number.isFinite(clone.teamGoalX)).toBe(true);
    expect(Number.isFinite(clone.teamGoalZ)).toBe(true);
    expect(Number.isFinite(clone.steerX)).toBe(true);
    expect(Number.isFinite(clone.steerZ)).toBe(true);

    const goalLength = Math.hypot(
      clone.teamGoalX - clone.x,
      clone.teamGoalZ - clone.z
    );
    const normalizedGoalLength = Math.hypot(
      (clone.teamGoalX - clone.x) / goalLength,
      (clone.teamGoalZ - clone.z) / goalLength
    );
    const steerLength = Math.hypot(clone.steerX, clone.steerZ);
    expect(goalLength).toBeGreaterThan(0.001);
    expect(normalizedGoalLength).toBeCloseTo(1, 6);
    expect(steerLength).toBeLessThanOrEqual(1.001);
    expect(
      steerLength <= 0.001 || Math.abs(steerLength - 1) <= 0.001
    ).toBe(true);
  }
});
