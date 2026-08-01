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

async function openDoppelgangerSoloGame(page) {
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
    window.__dustAndDeadTest?.pointHitsStaticObstacleForTest &&
    window.__dustAndDeadTest?.isStaticLineBlockedForTest &&
    window.__dustAndDeadTest?.advanceRealFrame &&
    window.__dustMultiplayerTest?.startMockHost &&
    window.__dustMultiplayerTest?.getState &&
    window.__dustMultiplayerTest?.setPlayerPosition &&
    window.__dustMultiplayerTest?.setProgression &&
    window.__dustMultiplayerTest?.setConnected &&
    window.__dustMultiplayerTest?.setHealth &&
    window.__dustMultiplayerTest?.injectInput &&
    window.__dustMultiplayerTest?.fireAt
  ));
  await page.evaluate(() => {
    window.__dustAndDeadTest.setAutomaticFrameLoopModeForTest("paused");
  });
}

async function createSoloDuel(page, keepPlayerIndex) {
  return page.evaluate(({ build, survivorIndex }) => {
    const game = window.__dustAndDeadTest;
    const multiplayer = window.__dustMultiplayerTest;

    multiplayer.startMockHost(["Local Copy", "Remote Copy"]);
    const players = multiplayer.getState().players.slice(0, 2);
    players.forEach((player) => {
      multiplayer.setProgression(player.id, build);
    });
    game.clearEnemies();
    game.clearFireHazards();
    game.clearRifleTraps();

    function findOpenPatch() {
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

    const patch = findOpenPatch();
    if (!patch) throw new Error("No open patch for solo Doppelganger test");

    players.forEach((player, index) => {
      multiplayer.setPlayerPosition(
        player.id,
        patch.x + 9.5,
        patch.z + (index === survivorIndex ? 0 : 1.25)
      );
    });
    game.forceDoppelgangerScoutForTest({
      sourceBossWave: 5,
      dueBossWave: 10,
      x: patch.x,
      z: patch.z,
    });
    const transformed = game.forceDoppelgangerTransformForTest();

    const survivor = players[survivorIndex];
    const detached = players[survivorIndex === 0 ? 1 : 0];
    const detachedClone = transformed.clones.find(
      (clone) => clone.sourcePlayerId === detached.id
    );
    if (!detachedClone) {
      throw new Error("No copy matched the detached mock player");
    }

    multiplayer.setConnected(detached.id, false);
    game.damageDoppelgangerCloneForTest(
      detachedClone.id,
      detachedClone.maxHp
    );
    const solo = game.replanDoppelgangerTeamForTest();
    const clone = solo.clones.find((entry) => entry.active);
    if (!clone) throw new Error("No living copy remained for solo duel");
    if (!solo.team?.soloDuel) {
      throw new Error("Solo duel diagnostics were not created");
    }

    return {
      patch,
      survivorId: survivor.id,
      detachedId: detached.id,
      cloneId: clone.id,
      solo,
    };
  }, {
    build: DIRECT_REVOLVER_BUILD,
    survivorIndex: keepPlayerIndex,
  });
}

test("an observed player shot starts one counter phase without retriggering", async ({ page }) => {
  await openDoppelgangerSoloGame(page);
  const setup = await createSoloDuel(page, 0);

  const result = await page.evaluate(({ playerId, cloneId }) => {
    const game = window.__dustAndDeadTest;
    const multiplayer = window.__dustMultiplayerTest;
    const before = game.replanDoppelgangerTeamForTest();
    const beforeObservation = before.team.observations[playerId];
    const beforeDuel = before.team.soloDuel;
    const clone = before.clones.find((entry) => entry.id === cloneId);
    const player = multiplayer.getState().players.find(
      (entry) => entry.id === playerId
    );
    if (!clone || !player) throw new Error("Solo combatants disappeared");

    // Fire directly away from the copy. The shot is genuinely visible through
    // shootKick, but its projectile is not an incoming threat that could mask
    // the observed-shot counter decision with projectile evasion.
    const dx = clone.x - player.x;
    const dz = clone.z - player.z;
    const length = Math.max(0.001, Math.hypot(dx, dz));
    const fired = multiplayer.fireAt(
      playerId,
      player.x - dx / length * 12,
      player.z - dz / length * 12
    );
    let counter = game.replanDoppelgangerTeamForTest();
    for (
      let frame = 0;
      frame < 8 &&
      counter.team.soloDuel.phase !== "counter";
      frame += 1
    ) {
      multiplayer.setHealth(playerId, 999999);
      game.advanceRealFrame(1000 / 60, { render: false });
      counter = game.replanDoppelgangerTeamForTest();
    }

    const samples = [counter];
    for (let frame = 0; frame < 75; frame += 1) {
      multiplayer.setHealth(playerId, 999999);
      game.advanceRealFrame(1000 / 60, { render: false });
      samples.push(game.replanDoppelgangerTeamForTest());
    }
    const after = samples[samples.length - 1];
    const counterSequences = Array.from(new Set(
      samples
        .map((sample) => sample.team.soloDuel)
        .filter((duel) => (
          duel.phase === "counter" &&
          duel.reason === "observed-shot"
        ))
        .map((duel) => duel.sequence)
    ));

    return {
      fired,
      beforeObservation,
      beforeDuel,
      counter,
      after,
      counterSequences,
    };
  }, {
    playerId: setup.survivorId,
    cloneId: setup.cloneId,
  });

  expect(result.fired).toBe(true);
  expect(result.counter.team).toMatchObject({
    mode: "solo",
    livingCount: 1,
    playerCount: 1,
  });

  const counterObservation =
    result.counter.team.observations[setup.survivorId];
  expect(counterObservation.observedShotCount).toBe(
    result.beforeObservation.observedShotCount + 1
  );
  expect(result.counter.team.soloDuel).toMatchObject({
    cloneId: setup.cloneId,
    targetPlayerId: setup.survivorId,
    phase: "counter",
    reason: "observed-shot",
    triggerObservedShotCount: counterObservation.observedShotCount,
    lastObservedShotCount: counterObservation.observedShotCount,
  });
  expect(result.counter.team.soloDuel.sequence).toBeGreaterThan(
    result.beforeDuel.sequence
  );

  expect(result.counterSequences).toEqual([
    result.counter.team.soloDuel.sequence,
  ]);
  expect(
    result.after.team.observations[setup.survivorId].observedShotCount
  ).toBe(counterObservation.observedShotCount);
  expect(result.after.team.soloDuel.triggerObservedShotCount).toBe(
    counterObservation.observedShotCount
  );
});

test("sustained aim produces evade, feint, and one side reversal without stat changes", async ({ page }) => {
  await openDoppelgangerSoloGame(page);
  // Keep the remote mock player: injectInput remains authoritative for its aim
  // and cannot be overwritten by the browser's local pointer state.
  const setup = await createSoloDuel(page, 1);

  const result = await page.evaluate(({ playerId, cloneId }) => {
    const game = window.__dustAndDeadTest;
    const multiplayer = window.__dustMultiplayerTest;
    const initial = game.replanDoppelgangerTeamForTest();
    const initialClone = initial.clones.find((entry) => entry.id === cloneId);
    const initialObservation = initial.team.observations[playerId];
    const initialStats = {
      speed: initialClone.speed,
      maxHp: initialClone.maxHp,
      copiedShotDamage: initialClone.copiedShotDamage,
    };

    let firstEvade = null;
    let firstFeint = null;
    let reversal = null;
    let aimedSamples = 0;
    const phases = [];

    for (let frame = 0; frame < 210 && !reversal; frame += 1) {
      const state = multiplayer.getState();
      const player = state.players.find((entry) => entry.id === playerId);
      const diagnostics = game.getDoppelgangerDiagnostics();
      const clone = diagnostics.clones.find((entry) => entry.id === cloneId);
      if (!player || !clone || !clone.active) {
        throw new Error("Solo combatants disappeared during aim test");
      }

      const dx = clone.x - player.x;
      const dz = clone.z - player.z;
      multiplayer.injectInput(playerId, {
        moveX: 0,
        moveZ: 0,
        aimAngle: Math.atan2(dx, dz),
        aimDistance: Math.max(1.5, Math.min(34, Math.hypot(dx, dz))),
        fire: false,
      });
      multiplayer.setHealth(playerId, 999999);
      game.advanceRealFrame(1000 / 60, { render: false });

      const sample = game.replanDoppelgangerTeamForTest();
      const duel = sample.team.soloDuel;
      const observation = sample.team.observations[playerId];
      if (observation.aimedCloneId === cloneId) aimedSamples += 1;
      if (phases[phases.length - 1] !== duel.phase) {
        phases.push(duel.phase);
      }
      if (
        !firstEvade &&
        duel.phase === "evade" &&
        duel.reason === "sustained-aim"
      ) {
        firstEvade = duel;
      }
      if (
        !firstFeint &&
        duel.phase === "feint" &&
        duel.reason === "sustained-aim"
      ) {
        firstFeint = duel;
      }
      if (
        firstFeint &&
        duel.phase === "feint" &&
        duel.reversalCount > firstFeint.reversalCount &&
        duel.side === -firstFeint.side
      ) {
        reversal = {
          duel,
          clone: sample.clones.find((entry) => entry.id === cloneId),
        };
      }
    }

    const final = game.getDoppelgangerDiagnostics();
    const finalClone = final.clones.find((entry) => entry.id === cloneId);
    return {
      initial,
      initialObservation,
      initialStats,
      firstEvade,
      firstFeint,
      reversal,
      aimedSamples,
      phases,
      final,
      finalStats: {
        speed: finalClone.speed,
        maxHp: finalClone.maxHp,
        copiedShotDamage: finalClone.copiedShotDamage,
      },
    };
  }, {
    playerId: setup.survivorId,
    cloneId: setup.cloneId,
  });

  expect(result.firstEvade).toMatchObject({
    phase: "evade",
    reason: "sustained-aim",
  });
  expect(result.firstFeint).toMatchObject({
    phase: "feint",
    reason: "sustained-aim",
  });
  expect(result.reversal).not.toBeNull();
  expect(result.reversal.duel.side).toBe(-result.firstFeint.side);
  expect(result.reversal.duel.reversalCount).toBe(
    result.firstFeint.reversalCount + 1
  );
  expect(result.aimedSamples).toBeGreaterThanOrEqual(20);
  expect(result.phases).toEqual(expect.arrayContaining(["evade", "feint"]));

  expect(result.finalStats).toEqual(result.initialStats);
  expect(
    result.final.team.observations[setup.survivorId].observedShotCount
  ).toBe(result.initialObservation.observedShotCount);
});

test("hidden relocation is not tracked and solo search follows memory without firing", async ({ page }) => {
  await openDoppelgangerSoloGame(page);
  const setup = await createSoloDuel(page, 0);

  const result = await page.evaluate(({ playerId, cloneId }) => {
    const game = window.__dustAndDeadTest;
    const multiplayer = window.__dustMultiplayerTest;
    const visible = game.replanDoppelgangerTeamForTest();
    const visibleObservation = visible.team.observations[playerId];
    const clone = visible.clones.find((entry) => entry.id === cloneId);
    if (!clone || !visibleObservation.visible) {
      throw new Error("Solo target was not initially visible");
    }

    function blockedFromClone(x, z) {
      return (
        !game.pointHitsStaticObstacleForTest(x, z, 0.92) &&
        game.isStaticLineBlockedForTest(
          clone.x,
          clone.z,
          x,
          z,
          0.08
        )
      );
    }

    const hiddenPoints = [];
    for (let z = -104; z <= 104 && hiddenPoints.length < 2; z += 3) {
      for (let x = -104; x <= 104 && hiddenPoints.length < 2; x += 3) {
        if (
          Math.hypot(
            x - visibleObservation.lastSeenX,
            z - visibleObservation.lastSeenZ
          ) < 14
        ) continue;
        if (!blockedFromClone(x, z)) continue;
        if (hiddenPoints.some((point) => (
          Math.hypot(point.x - x, point.z - z) < 8
        ))) continue;
        hiddenPoints.push({ x, z });
      }
    }
    if (hiddenPoints.length < 2) {
      throw new Error("No two clean hidden relocation points were found");
    }

    function moveHidden(point) {
      multiplayer.setPlayerPosition(playerId, point.x, point.z);
      const actual = multiplayer.getState().players.find(
        (entry) => entry.id === playerId
      );
      if (!actual || !blockedFromClone(actual.x, actual.z)) {
        throw new Error("Resolved player position is not hidden from the copy");
      }
      return {
        actual: { x: actual.x, z: actual.z },
        diagnostics: game.replanDoppelgangerTeamForTest(),
      };
    }

    const firstHidden = moveHidden(hiddenPoints[0]);
    const secondHidden = moveHidden(hiddenPoints[1]);
    const shotSequenceBeforeSearch = secondHidden.diagnostics.clones.find(
      (entry) => entry.id === cloneId
    ).shotSequence;

    game.advanceDoppelgangerCloneRuntimeForTest(
      cloneId,
      { seconds: 1.72 }
    );
    const expired = game.replanDoppelgangerTeamForTest();
    const sameTime = game.replanDoppelgangerTeamForTest();

    game.advanceDoppelgangerCloneRuntimeForTest(
      cloneId,
      { seconds: 0.3 }
    );
    const progressed = game.replanDoppelgangerTeamForTest();

    multiplayer.setHealth(playerId, 999999);
    game.advanceRealFrame(1000 / 60, { render: false });
    const checked = game.getDoppelgangerDiagnostics();

    return {
      visible,
      visibleObservation,
      firstHidden,
      secondHidden,
      expired,
      sameTime,
      progressed,
      checked,
      shotSequenceBeforeSearch,
    };
  }, {
    playerId: setup.survivorId,
    cloneId: setup.cloneId,
  });

  for (const hidden of [result.firstHidden, result.secondHidden]) {
    const observation =
      hidden.diagnostics.team.observations[setup.survivorId];
    expect(observation).toMatchObject({
      initialized: true,
      visible: false,
      visibleByCloneIds: [],
      lastSeenX: result.visibleObservation.lastSeenX,
      lastSeenZ: result.visibleObservation.lastSeenZ,
      seenSamples: result.visibleObservation.seenSamples,
    });
  }

  const expiredDuel = result.expired.team.soloDuel;
  const expiredObservation =
    result.expired.team.observations[setup.survivorId];
  expect(expiredDuel).toMatchObject({
    cloneId: setup.cloneId,
    targetPlayerId: setup.survivorId,
    phase: "search",
    reason: "memory-expired",
    goalKind: "memory-sweep",
    searchAnchorX: result.visibleObservation.lastSeenX,
    searchAnchorZ: result.visibleObservation.lastSeenZ,
  });
  expect(expiredObservation).toMatchObject({
    visible: false,
    lastSeenX: result.visibleObservation.lastSeenX,
    lastSeenZ: result.visibleObservation.lastSeenZ,
    seenSamples: result.visibleObservation.seenSamples,
  });
  expect(expiredDuel.searchGoalX).toBeCloseTo(
    expiredObservation.predictedX,
    2
  );
  expect(expiredDuel.searchGoalZ).toBeCloseTo(
    expiredObservation.predictedZ,
    2
  );

  expect(result.sameTime.team.soloDuel).toMatchObject({
    sequence: expiredDuel.sequence,
    searchAnchorX: expiredDuel.searchAnchorX,
    searchAnchorZ: expiredDuel.searchAnchorZ,
    searchGoalX: expiredDuel.searchGoalX,
    searchGoalZ: expiredDuel.searchGoalZ,
  });
  expect({
    x: result.progressed.team.soloDuel.searchGoalX,
    z: result.progressed.team.soloDuel.searchGoalZ,
  }).not.toEqual({
    x: expiredDuel.searchGoalX,
    z: expiredDuel.searchGoalZ,
  });

  const hiddenActuals = [
    result.firstHidden.actual,
    result.secondHidden.actual,
  ];
  for (const actual of hiddenActuals) {
    expect(Math.hypot(
      expiredDuel.searchGoalX - actual.x,
      expiredDuel.searchGoalZ - actual.z
    )).toBeGreaterThan(5);
  }

  const checkedObservation =
    result.checked.team.observations[setup.survivorId];
  expect(checkedObservation).toMatchObject({
    visible: false,
    lastSeenX: result.visibleObservation.lastSeenX,
    lastSeenZ: result.visibleObservation.lastSeenZ,
    seenSamples: result.visibleObservation.seenSamples,
  });
  const checkedClone = result.checked.clones.find(
    (entry) => entry.id === setup.cloneId
  );
  expect(checkedClone.shotSequence).toBe(result.shotSequenceBeforeSearch);
});
