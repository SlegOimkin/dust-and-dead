const path = require("node:path");
const { expect, test } = require("@playwright/test");

const DIRECT_REVOLVER_BUILD = {
  playerClass: "gunslinger",
  weapon: "revolver",
  revolverUpgrade: "duelist",
  ownedWeapons: { revolver: true },
  upgradeCounts: {},
  ammo: { revolver: 6, rifle: 0, launcher: 0, coachGun: 0 },
  ammoReserve: { revolver: 36, rifle: 0, launcher: 0, coachGun: 0 },
};

function fileUrl(relativePath) {
  const absolute = path.resolve(__dirname, "..", relativePath).replace(/\\/g, "/");
  return `file:///${absolute}`;
}

async function openDoppelgangerAdvancedGame(page) {
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
    window.__dustAndDeadTest?.getDoppelgangerDiagnostics &&
    window.__dustAndDeadTest?.pointHitsStaticObstacleForTest &&
    window.__dustAndDeadTest?.isStaticLineBlockedForTest &&
    window.__dustAndDeadTest?.advanceRealFrame &&
    window.__dustMultiplayerTest?.startMockHost &&
    window.__dustMultiplayerTest?.getState &&
    window.__dustMultiplayerTest?.setPlayerPosition &&
    window.__dustMultiplayerTest?.setProgression &&
    window.__dustMultiplayerTest?.setConnected
  ));
  await page.evaluate(() => {
    window.__dustAndDeadTest.setAutomaticFrameLoopModeForTest("paused");
  });
}

test("shared memory keeps the last seen position while a hidden player relocates twice", async ({ page }) => {
  await openDoppelgangerAdvancedGame(page);

  const result = await page.evaluate(({ build }) => {
    const game = window.__dustAndDeadTest;
    const multiplayer = window.__dustMultiplayerTest;
    multiplayer.startMockHost(["Observed Survivor", "Detached Copy"]);
    const players = multiplayer.getState().players;
    players.forEach((player) => {
      multiplayer.setProgression(player.id, build);
    });
    game.clearEnemies();
    game.clearFireHazards();
    game.clearRifleTraps();

    function findClearOrigin() {
      for (let z = -64; z <= 64; z += 8) {
        for (let x = -64; x <= 64; x += 8) {
          let clear = true;
          for (let dz = -5; dz <= 5 && clear; dz += 1) {
            for (let dx = -5; dx <= 5; dx += 1) {
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

    const origin = findClearOrigin();
    if (!origin) throw new Error("No clear origin for Doppelganger memory test");
    multiplayer.setPlayerPosition(players[0].id, origin.x, origin.z);
    multiplayer.setPlayerPosition(players[1].id, origin.x + 2, origin.z);
    game.forceDoppelgangerScoutForTest({
      sourceBossWave: 5,
      dueBossWave: 10,
      x: origin.x,
      z: origin.z,
    });
    game.forceDoppelgangerTransformForTest();
    multiplayer.setConnected(players[1].id, false);
    const visible = game.replanDoppelgangerTeamForTest();
    const targetId = players[0].id;
    const visibleObservation = visible.team.observations[targetId];
    const activeClones = visible.clones.filter((clone) => clone.active);

    function blockedFromEveryClone(x, z) {
      if (game.pointHitsStaticObstacleForTest(x, z, 0.92)) return false;
      return activeClones.every((clone) => (
        game.isStaticLineBlockedForTest(
          clone.x,
          clone.z,
          x,
          z,
          0.08
        )
      ));
    }

    const hiddenPoints = [];
    for (let z = -104; z <= 104 && hiddenPoints.length < 2; z += 3) {
      for (let x = -104; x <= 104 && hiddenPoints.length < 2; x += 3) {
        if (Math.hypot(x - origin.x, z - origin.z) < 12) continue;
        if (!blockedFromEveryClone(x, z)) continue;
        if (hiddenPoints.some((point) => Math.hypot(
          point.x - x,
          point.z - z
        ) < 8)) continue;
        hiddenPoints.push({ x, z });
      }
    }
    if (hiddenPoints.length < 2) {
      throw new Error("No two clean points hidden from every active clone");
    }

    function moveAndVerifyHidden(point) {
      multiplayer.setPlayerPosition(targetId, point.x, point.z);
      const actual = multiplayer.getState().players.find(
        (player) => player.id === targetId
      );
      if (!actual || !blockedFromEveryClone(actual.x, actual.z)) {
        throw new Error("Resolved player position is not hidden from every clone");
      }
      return {
        actual: { x: actual.x, z: actual.z },
        diagnostics: game.replanDoppelgangerTeamForTest(),
      };
    }

    const firstHidden = moveAndVerifyHidden(hiddenPoints[0]);
    const secondHidden = moveAndVerifyHidden(hiddenPoints[1]);
    const shotsBeforeCheck = Object.fromEntries(
      secondHidden.diagnostics.clones
        .filter((clone) => clone.active)
        .map((clone) => [clone.id, clone.shotSequence])
    );

    game.advanceRealFrame(1000 / 60, { render: false });
    const checked = game.getDoppelgangerDiagnostics();

    return {
      targetId,
      origin,
      hiddenPoints,
      visible,
      visibleObservation,
      firstHidden,
      secondHidden,
      shotsBeforeCheck,
      checked,
    };
  }, { build: DIRECT_REVOLVER_BUILD });

  expect(result.visibleObservation).toMatchObject({
    initialized: true,
    visible: true,
  });
  expect(result.visibleObservation.visibleByCloneIds).toHaveLength(2);

  for (const sample of [
    result.firstHidden.diagnostics,
    result.secondHidden.diagnostics,
    result.checked,
  ]) {
    const observation = sample.team.observations[result.targetId];
    expect(observation).toMatchObject({
      initialized: true,
      visible: false,
      visibleByCloneIds: [],
      lastSeenX: result.visibleObservation.lastSeenX,
      lastSeenZ: result.visibleObservation.lastSeenZ,
      seenSamples: result.visibleObservation.seenSamples,
    });
  }

  expect(result.hiddenPoints).toHaveLength(2);
  expect(Math.hypot(
    result.hiddenPoints[0].x - result.hiddenPoints[1].x,
    result.hiddenPoints[0].z - result.hiddenPoints[1].z
  )).toBeGreaterThanOrEqual(8);

  const directClones = result.checked.clones.filter(
    (clone) => clone.active && clone.weapon !== "launcher"
  );
  expect(directClones).toHaveLength(2);
  for (const clone of directClones) {
    expect(clone.shotSequence).toBe(result.shotsBeforeCheck[clone.id]);
    expect(clone.holdFireReason).toBe("lost-visual");
  }
});

test("two copies stage a fair pressure-and-intercept pincer before committing", async ({ page }) => {
  await openDoppelgangerAdvancedGame(page);

  const result = await page.evaluate(({ build }) => {
    const game = window.__dustAndDeadTest;
    const multiplayer = window.__dustMultiplayerTest;
    multiplayer.startMockHost(["Survivor", "Detached Copy"]);
    const players = multiplayer.getState().players;
    players.forEach((player) => {
      multiplayer.setProgression(player.id, build);
    });
    game.clearEnemies();
    game.clearFireHazards();
    game.clearRifleTraps();

    function findOpenPincerPatch() {
      for (let z = -64; z <= 64; z += 8) {
        for (let x = -64; x <= 64; x += 8) {
          let clear = true;
          for (let dz = -7; dz <= 7 && clear; dz += 1) {
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

    const patch = findOpenPincerPatch();
    if (!patch) throw new Error("No open patch for staged pincer test");
    players.forEach((player, index) => {
      multiplayer.setPlayerPosition(
        player.id,
        patch.x + index * 1.5,
        patch.z
      );
    });
    game.forceDoppelgangerScoutForTest({
      sourceBossWave: 5,
      dueBossWave: 10,
      x: patch.x,
      z: patch.z,
    });
    game.forceDoppelgangerTransformForTest();
    multiplayer.setConnected(players[1].id, false);
    const initial = game.replanDoppelgangerTeamForTest();
    const targetId = players[0].id;
    const initialManeuver = initial.team.maneuvers.find(
      (maneuver) => maneuver.targetPlayerId === targetId
    );
    if (!initialManeuver) {
      throw new Error("Pincer was not created for the sole survivor");
    }
    const nonSuppressorId = initialManeuver.participantCloneIds.find(
      (cloneId) => cloneId !== initialManeuver.suppressorCloneId
    );
    const initialShots = Object.fromEntries(
      initial.clones.map((clone) => [clone.id, clone.shotSequence])
    );
    const initialStats = initial.clones.map((clone) => ({
      id: clone.id,
      speed: clone.speed,
      maxHp: clone.maxHp,
      copiedShotDamage: clone.copiedShotDamage,
    }));

    let sawPosition = initialManeuver.stage === "position";
    let sawCommit = initialManeuver.stage === "commit";
    let sawTeamStage = false;
    let syncWaitFired = false;
    let directNavigationOnly = true;
    let commit = sawCommit ? initial : null;
    const stages = [initialManeuver.stage];
    const previousShots = { ...initialShots };
    const previousPermissions = Object.fromEntries(
      initial.clones.map((clone) => [
        clone.id,
        clone.teamFirePermission,
      ])
    );

    for (let frame = 0; frame < 100 && !commit; frame += 1) {
      game.advanceRealFrame(1000 / 60, { render: false });
      const sample = game.getDoppelgangerDiagnostics();
      const maneuver = sample.team.maneuvers.find(
        (entry) => entry.targetPlayerId === targetId
      );
      if (!maneuver) {
        for (const participant of sample.clones.filter(
          (clone) => clone.active
        )) {
          previousShots[participant.id] = participant.shotSequence;
          previousPermissions[participant.id] =
            participant.teamFirePermission;
        }
        continue;
      }
      if (stages[stages.length - 1] !== maneuver.stage) {
        stages.push(maneuver.stage);
      }
      const nonSuppressor = sample.clones.find(
        (clone) => clone.id === nonSuppressorId
      );
      if (maneuver.stage === "position") {
        sawPosition = true;
        if (nonSuppressor.holdFireReason === "team-stage") {
          sawTeamStage = true;
        }
        for (const participantId of maneuver.participantCloneIds) {
          const participant = sample.clones.find(
            (clone) => clone.id === participantId
          );
          if (
            previousPermissions[participantId] === "sync-wait" &&
            participant.teamFirePermission === "sync-wait" &&
            participant.shotSequence >
              (previousShots[participantId] || 0)
          ) {
            syncWaitFired = true;
          }
          if (
            participant.navMode !== "direct" ||
            participant.navObstacleKind !== ""
          ) {
            directNavigationOnly = false;
          }
        }
      }
      for (const participantId of maneuver.participantCloneIds) {
        const participant = sample.clones.find(
          (clone) => clone.id === participantId
        );
        previousShots[participantId] = participant.shotSequence;
        previousPermissions[participantId] =
          participant.teamFirePermission;
      }
      if (maneuver.stage === "commit") {
        sawCommit = true;
        commit = sample;
      }
    }

    const finalStats = (commit || game.getDoppelgangerDiagnostics())
      .clones.map((clone) => ({
        id: clone.id,
        speed: clone.speed,
        maxHp: clone.maxHp,
        copiedShotDamage: clone.copiedShotDamage,
      }));

    return {
      targetId,
      patch,
      initial,
      initialManeuver,
      nonSuppressorId,
      initialStats,
      finalStats,
      stages,
      sawPosition,
      sawCommit,
      sawTeamStage,
      syncWaitFired,
      directNavigationOnly,
      commit,
    };
  }, { build: DIRECT_REVOLVER_BUILD });

  expect(result.initial.team).toMatchObject({
    livingCount: 2,
    playerCount: 1,
  });
  expect(result.initial.team.targetLoads[result.targetId]).toBe(2);
  expect(result.initial.team.maneuvers).toHaveLength(1);
  expect(result.initialManeuver).toMatchObject({
    kind: "pincer",
    targetPlayerId: result.targetId,
    stage: "position",
  });
  expect(result.initialManeuver.participantCloneIds).toHaveLength(2);

  const participants = result.initial.clones.filter((clone) => (
    result.initialManeuver.participantCloneIds.includes(clone.id)
  ));
  expect(participants).toHaveLength(2);
  expect(participants.map((clone) => clone.teamDuty).sort()).toEqual([
    expect.stringMatching(/^intercept-(left|right)$/),
    "pressure",
  ]);

  const suppressor = participants.find(
    (clone) => clone.id === result.initialManeuver.suppressorCloneId
  );
  const nonSuppressor = participants.find(
    (clone) => clone.id === result.nonSuppressorId
  );
  expect(suppressor).toMatchObject({
    teamDuty: "pressure",
    teamManeuverRole: "suppressor",
    teamManeuverStage: "position",
    teamFirePermission: "pressure",
  });
  expect(nonSuppressor.teamDuty).toMatch(/^intercept-(left|right)$/);
  expect(nonSuppressor).toMatchObject({
    teamManeuverStage: "position",
    teamFirePermission: "sync-wait",
  });

  expect(result.sawPosition).toBe(true);
  expect(result.sawTeamStage).toBe(true);
  expect(result.syncWaitFired).toBe(false);
  expect(result.directNavigationOnly).toBe(true);
  expect(result.sawCommit).toBe(true);
  expect(result.commit).not.toBeNull();
  expect(result.stages).toEqual(["position", "commit"]);

  const committedManeuver = result.commit.team.maneuvers.find(
    (maneuver) => maneuver.targetPlayerId === result.targetId
  );
  expect(committedManeuver).toMatchObject({
    kind: "pincer",
    stage: "commit",
  });
  expect(committedManeuver.participantCloneIds).toHaveLength(2);
  for (const clone of result.commit.clones.filter((entry) => (
    committedManeuver.participantCloneIds.includes(entry.id)
  ))) {
    expect(clone).toMatchObject({
      teamManeuverStage: "commit",
      teamFirePermission: "strike",
    });
  }

  expect(result.finalStats).toEqual(result.initialStats);
});

test("a copy follows a stable corner waypoint without sweeping through the blocking obstacle", async ({ page }) => {
  await openDoppelgangerAdvancedGame(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    game.clearEnemies();
    game.clearFireHazards();
    game.clearRifleTraps();
    game.setPlayerMaxHp(10000, 10000);

    const cloneClearance = 0.9;
    // A lone copy receives the pressure duty. The regular revolver range is
    // shortened by 0.7 for that duty, matching assignDoppelgangerTeamGoals.
    const idealRange = 8.3;
    const observerDistance = 7;
    const cardinalAimAngles = [
      0,
      Math.PI * 0.5,
      Math.PI,
      -Math.PI * 0.5,
    ];

    function findBlockedFormationGoal() {
      for (let z = -96; z <= 96; z += 4) {
        for (let x = -96; x <= 96; x += 4) {
          if (game.pointHitsStaticObstacleForTest(x, z, cloneClearance)) {
            continue;
          }
          for (const aimAngle of cardinalAimAngles) {
            const sectorAngle = aimAngle;
            const dirX = Math.sin(sectorAngle);
            const dirZ = Math.cos(sectorAngle);
            const goalX = x + dirX * idealRange;
            const goalZ = z + dirZ * idealRange;
            const originX = x - dirX * observerDistance;
            const originZ = z - dirZ * observerDistance;
            if (
              Math.abs(goalX) > 108 ||
              Math.abs(goalZ) > 108 ||
              Math.abs(originX) > 108 ||
              Math.abs(originZ) > 108
            ) continue;
            if (
              game.pointHitsStaticObstacleForTest(
                goalX,
                goalZ,
                cloneClearance
              ) ||
              game.pointHitsStaticObstacleForTest(
                originX,
                originZ,
                cloneClearance
              )
            ) continue;
            if (
              game.isStaticLineBlockedForTest(
                originX,
                originZ,
                x,
                z,
                0.08
              )
            ) continue;
            if (
              !game.isStaticLineBlockedForTest(
                x,
                z,
                goalX,
                goalZ,
                0.82
              )
            ) continue;
            return {
              originX,
              originZ,
              playerX: x,
              playerZ: z,
              aimAngle,
              expectedGoalX: goalX,
              expectedGoalZ: goalZ,
            };
          }
        }
      }
      return null;
    }

    const scenario = findBlockedFormationGoal();
    if (!scenario) {
      throw new Error("No clear observed target with a blocked formation goal");
    }

    game.setPlayerPosition(scenario.playerX, scenario.playerZ);
    game.setAimTarget(
      scenario.playerX + Math.sin(scenario.aimAngle) * 12,
      scenario.playerZ + Math.cos(scenario.aimAngle) * 12
    );
    game.forceDoppelgangerScoutForTest({
      sourceBossWave: 5,
      dueBossWave: 10,
      x: scenario.originX,
      z: scenario.originZ,
    });
    game.forceDoppelgangerTransformForTest();

    const initial = game.getDoppelgangerDiagnostics();
    const initialClone = initial.clones.find((clone) => clone.active);
    if (!initialClone) throw new Error("Doppelganger clone did not transform");

    const samples = [];
    let previous = { x: initialClone.x, z: initialClone.z };
    let cumulativeDistance = 0;
    let centerTouchedObstacle = false;
    let sweptThroughObstacle = false;
    let cornerSamples = 0;
    let maximumStuckReplans = initialClone.stuckReplans;
    let firstCornerGoal = null;
    let firstCornerStartDistance = null;
    let firstCornerMinimumDistance = Infinity;
    let cornerGoalSwitches = 0;
    let previousCornerGoal = null;

    for (let frame = 0; frame < 150; frame += 1) {
      game.advanceRealFrame(1000 / 60, { render: false });
      const diagnostics = game.getDoppelgangerDiagnostics();
      const clone = diagnostics.clones.find((entry) => entry.active);
      if (!clone) throw new Error("Doppelganger clone became inactive");

      const stepDistance = Math.hypot(
        clone.x - previous.x,
        clone.z - previous.z
      );
      cumulativeDistance += stepDistance;
      if (
        game.pointHitsStaticObstacleForTest(clone.x, clone.z, 0.05)
      ) {
        centerTouchedObstacle = true;
      }
      if (
        stepDistance > 0.015 &&
        game.isStaticLineBlockedForTest(
          previous.x,
          previous.z,
          clone.x,
          clone.z,
          0.01
        )
      ) {
        sweptThroughObstacle = true;
      }

      maximumStuckReplans = Math.max(
        maximumStuckReplans,
        clone.stuckReplans
      );
      if (clone.navMode === "corner") {
        cornerSamples += 1;
        const cornerGoal = {
          x: clone.navGoalX,
          z: clone.navGoalZ,
        };
        if (
          previousCornerGoal &&
          Math.hypot(
            cornerGoal.x - previousCornerGoal.x,
            cornerGoal.z - previousCornerGoal.z
          ) > 1
        ) {
          cornerGoalSwitches += 1;
        }
        previousCornerGoal = cornerGoal;
        if (!firstCornerGoal) {
          firstCornerGoal = cornerGoal;
          firstCornerStartDistance = Math.hypot(
            cornerGoal.x - clone.x,
            cornerGoal.z - clone.z
          );
        }
        if (
          Math.hypot(
            cornerGoal.x - firstCornerGoal.x,
            cornerGoal.z - firstCornerGoal.z
          ) <= 0.8
        ) {
          firstCornerMinimumDistance = Math.min(
            firstCornerMinimumDistance,
            Math.hypot(
              firstCornerGoal.x - clone.x,
              firstCornerGoal.z - clone.z
            )
          );
        }
      }
      samples.push({
        x: clone.x,
        z: clone.z,
        navMode: clone.navMode,
        navGoalX: clone.navGoalX,
        navGoalZ: clone.navGoalZ,
        navObstacleKind: clone.navObstacleKind,
        stuckReplans: clone.stuckReplans,
      });
      previous = { x: clone.x, z: clone.z };
    }

    const firstCornerSample = samples.find(
      (sample) => sample.navMode === "corner"
    );
    const final = game.getDoppelgangerDiagnostics();
    return {
      scenario,
      initial,
      final,
      firstCornerSample,
      cornerSamples,
      cornerGoalSwitches,
      cumulativeDistance,
      centerTouchedObstacle,
      sweptThroughObstacle,
      maximumStuckReplans,
      firstCornerStartDistance,
      firstCornerMinimumDistance,
      expectedGoalError: Math.hypot(
        initialClone.teamGoalX - scenario.expectedGoalX,
        initialClone.teamGoalZ - scenario.expectedGoalZ
      ),
      initialGoalBlocked: game.isStaticLineBlockedForTest(
        initialClone.x,
        initialClone.z,
        initialClone.teamGoalX,
        initialClone.teamGoalZ,
        0.82
      ),
    };
  });

  expect(result.initial.clones.filter((clone) => clone.active)).toHaveLength(1);
  expect(result.expectedGoalError).toBeLessThan(0.15);
  expect(result.initialGoalBlocked).toBe(true);
  expect(result.firstCornerSample).not.toBeNull();
  expect(result.firstCornerSample.navObstacleKind).not.toBe("");
  expect(result.cornerSamples).toBeGreaterThan(3);
  expect(result.centerTouchedObstacle).toBe(false);
  expect(result.sweptThroughObstacle).toBe(false);
  expect(result.cumulativeDistance).toBeGreaterThan(1);
  expect(result.maximumStuckReplans).toBe(0);
  expect(result.cornerGoalSwitches).toBeLessThanOrEqual(2);
  expect(result.firstCornerStartDistance).toBeGreaterThan(0.5);
  expect(result.firstCornerMinimumDistance).toBeLessThan(
    result.firstCornerStartDistance - 0.35
  );
});
