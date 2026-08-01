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
    window.__dustAndDeadTest?.getDoppelgangerDiagnostics &&
    window.__dustAndDeadTest?.pointHitsStaticObstacleForTest &&
    window.__dustAndDeadTest?.isStaticLineBlockedForTest &&
    window.__dustAndDeadTest?.advanceRealFrame
  ));
  await page.evaluate(() => {
    window.__dustAndDeadTest.setAutomaticFrameLoopModeForTest("paused");
  });
}

test("an unseen Dual Revolvers copy leaves its edge spawn without blind-firing", async ({ page }) => {
  await openGame(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    game.clearEnemies();
    game.clearFireHazards();
    game.clearRifleTraps();
    game.setPlayerMaxHp(100000, 100000);
    game.configureBossWeaponBuildForTest({
      playerClass: "gunslinger",
      weapon: "revolver",
      revolverUpgrade: "dualRevolvers",
      ammoCurrent: 12,
      ammoReserve: 72,
    });

    function clear(x, z, radius = 0.9) {
      return !game.pointHitsStaticObstacleForTest(x, z, radius);
    }

    function findScenario() {
      const preferred = {
        clone: { x: 96, z: 144 },
        player: { x: 84, z: 72 },
      };
      if (
        clear(preferred.clone.x, preferred.clone.z) &&
        clear(preferred.player.x, preferred.player.z) &&
        game.isStaticLineBlockedForTest(
          preferred.clone.x,
          preferred.clone.z,
          preferred.player.x,
          preferred.player.z,
          0.08
        )
      ) {
        return preferred;
      }
      const players = [];
      for (let z = -72; z <= 72; z += 12) {
        for (let x = -84; x <= 84; x += 12) {
          if (clear(x, z)) players.push({ x, z });
        }
      }
      const candidates = [];
      for (let z = -184; z <= 184; z += 4) {
        for (let x = -220; x <= 220; x += 4) {
          if (Math.abs(x) < 176 && Math.abs(z) < 144) continue;
          if (!clear(x, z)) continue;
          let exitCount = 0;
          for (const [dx, dz] of [[4, 0], [-4, 0], [0, 4], [0, -4]]) {
            if (clear(x + dx, z + dz)) exitCount += 1;
          }
          if (exitCount < 2) continue;
          candidates.push({ x, z });
        }
      }
      let best = null;
      for (const clone of candidates) {
        for (const player of players) {
          const distance = Math.hypot(player.x - clone.x, player.z - clone.z);
          if (distance < 70 || distance > 260) continue;
          if (!game.isStaticLineBlockedForTest(
            clone.x,
            clone.z,
            player.x,
            player.z,
            0.08
          )) continue;
          const score = distance + Math.abs(Math.abs(clone.x) - 198) * 0.2 +
            Math.abs(Math.abs(clone.z) - 164) * 0.2;
          if (!best || score < best.score) {
            best = { clone, player, distance, score };
          }
        }
      }
      return best;
    }

    const scenario = findScenario();
    if (!scenario) throw new Error("No deterministic hidden edge scenario found");
    game.setPlayerPosition(scenario.player.x, scenario.player.z);
    const playerPosition = game.getPlayerPosition();
    game.forceDoppelgangerScoutForTest({
      sourceBossWave: 5,
      dueBossWave: 10,
      x: scenario.clone.x,
      z: scenario.clone.z,
    });
    const transformed = game.forceDoppelgangerTransformForTest();
    const initial = game.getDoppelgangerDiagnostics();
    const first = initial.clones.find((entry) => entry.active);
    if (!first) throw new Error("No active transformed copy");
    const initialObservation = initial.team.observations.solo;
    const actualInitialLosBlocked = game.isStaticLineBlockedForTest(
      first.x,
      first.z,
      playerPosition.x,
      playerPosition.z,
      0.08
    );

    let maximumDistance = 0;
    let hiddenShotIncrements = 0;
    let previousShotSequence = first.shotSequence;
    let firstVisibleFrame = null;
    for (let frame = 0; frame < 180; frame += 1) {
      game.advanceRealFrame(1000 / 60, { render: false });
      const diagnostics = game.getDoppelgangerDiagnostics();
      const clone = diagnostics.clones.find((entry) => entry.active);
      maximumDistance = Math.max(
        maximumDistance,
        Math.hypot(clone.x - first.x, clone.z - first.z)
      );
      const observation = diagnostics.team.observations.solo;
      if (!observation.visible) {
        hiddenShotIncrements += Math.max(
          0,
          clone.shotSequence - previousShotSequence
        );
      } else if (firstVisibleFrame == null) {
        firstVisibleFrame = frame;
      }
      previousShotSequence = clone.shotSequence;
    }
    const final = game.getDoppelgangerDiagnostics();
    const finalClone = final.clones.find((entry) => entry.active);

    return {
      playerPosition,
      copiedBuild: {
        playerClass: first.playerClass,
        weapon: first.weapon,
        weaponVisualId: first.weaponVisualId,
      },
      phase: transformed.phase,
      initialObservation,
      actualInitialLosBlocked,
      maximumDistance,
      hiddenShotIncrements,
      firstVisibleFrame,
      finalShotSequence: finalClone.shotSequence,
      finalClone: {
        x: finalClone.x,
        z: finalClone.z,
        moveAmount: finalClone.moveAmount,
        steerX: finalClone.steerX,
        steerZ: finalClone.steerZ,
        soloPhase: finalClone.soloPhase,
        soloReason: finalClone.soloReason,
        soloGoalKind: finalClone.soloGoalKind,
        teamGoalX: finalClone.teamGoalX,
        teamGoalZ: finalClone.teamGoalZ,
        navMode: finalClone.navMode,
        navObstacleKind: finalClone.navObstacleKind,
        navGoalX: finalClone.navGoalX,
        navGoalZ: finalClone.navGoalZ,
        holdFireReason: finalClone.holdFireReason,
      },
    };
  });

  expect(result.copiedBuild).toEqual({
    playerClass: "gunslinger",
    weapon: "revolver",
    weaponVisualId: "dualRevolvers",
  });
  expect(result.phase).toBe("boss");
  expect(result.actualInitialLosBlocked).toBe(true);
  expect(result.initialObservation).toMatchObject({
    initialized: false,
    visible: false,
  });
  expect(result.initialObservation.acquisitionHintX)
    .toBeCloseTo(result.playerPosition.x, 2);
  expect(result.initialObservation.acquisitionHintZ)
    .toBeCloseTo(result.playerPosition.z, 2);
  expect(result.initialObservation.predictedX)
    .toBeCloseTo(result.playerPosition.x, 2);
  expect(result.initialObservation.predictedZ)
    .toBeCloseTo(result.playerPosition.z, 2);
  expect(
    result.maximumDistance,
    `copy remained at its hidden spawn: ${JSON.stringify(result)}`
  ).toBeGreaterThan(1);
  expect(
    result.hiddenShotIncrements,
    `copy fired without line of sight: ${JSON.stringify(result)}`
  ).toBe(0);
});
