const path = require("node:path");
const { expect, test } = require("@playwright/test");

const REQUIRED_GAME_API = [
  "startWaveNow",
  "rebuildMapForTest",
  "clearEnemies",
  "setPlayerMaxHp",
  "setPlayerPosition",
  "spawnZombieAt",
  "getLandEaterDiagnostics",
  "getLandEaterWorldCellDiagnostics",
  "setLandEaterVoidCellsForTest",
  "pointHitsStaticObstacleForTest",
  "setLandEaterAiEnabled",
  "forceLandEaterPhase",
  "forceLandEaterAction",
  "seekLandEaterAction",
  "advanceLandEater",
  "stepLandEater",
  "damageLandEater",
];

function fileUrl(relativePath) {
  const absolute = path.resolve(__dirname, "..", relativePath).replace(/\\/g, "/");
  return `file:///${absolute}`;
}

async function startHunt(page) {
  await page.goto(`${fileUrl("index.html")}?mapSeed=7331&landEaterTest=1`);
  const intro = page.locator("#intro-screen");
  if (await intro.isVisible().catch(() => false)) {
    await page.keyboard.press("KeyM");
    await expect(intro).toBeHidden();
  }
  await page.getByRole("button", { name: "Start Hunt" }).click();
  await page.waitForFunction(() => Boolean(window.__dustAndDeadTest?.getLandEaterDiagnostics));

  const missing = await page.evaluate((names) => names.filter(
    (name) => typeof window.__dustAndDeadTest?.[name] !== "function"
  ), REQUIRED_GAME_API);
  expect(missing, `Land Eater test API is incomplete: ${missing.join(", ")}`).toEqual([]);

  const started = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const wave = game.startWaveNow(10, "landEater");
    game.setLandEaterAiEnabled(false);
    return { wave, diagnostics: game.getLandEaterDiagnostics() };
  });
  expect(started.wave).toMatchObject({ wave: 10, wave10BossKind: "landEater" });
  expect(started.diagnostics).toMatchObject({
    active: true,
    replica: false,
    defeated: false,
  });
}

function gridOf(diagnostics) {
  return diagnostics.grid || diagnostics.topology || {};
}

function voidCellIds(diagnostics) {
  const grid = gridOf(diagnostics);
  return (grid.voidCellIds || grid.consumedCellIds || diagnostics.voidCellIds || [])
    .map(Number)
    .sort((left, right) => left - right);
}

test("the playable Land Eater rifle stand opens paused with the maxed rifle", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto(`${fileUrl("index.html")}?mapSeed=7331&preview=land-eater-rifle-test`);
  await page.waitForFunction(() => Boolean(window.__dustAndDeadTest?.getLandEaterDiagnostics));

  const result = await page.evaluate(() => ({
    game: JSON.parse(window.render_game_to_text()),
    boss: window.__dustAndDeadTest.getLandEaterDiagnostics(),
  }));

  expect(pageErrors).toEqual([]);
  expect(result.game).toMatchObject({
    mode: "playing",
    paused: true,
    wave: 10,
    wave10BossKind: "landEater",
    weapon: "rifle",
    player: { visible: true },
    ammo: { current: 36, magazine: 36, reserve: 9999 },
    progression: {
      level: 30,
      playerClass: "ranger",
      rifleUpgrade: "leverBarrage",
    },
  });
  expect(result.game.progression.upgrades).toMatchObject({
    extendedTube: 1,
    trailLoader: 1,
    chainLightning: 1,
    stormTempo: 1,
    steadyHand: 10,
    quickReload: 8,
    hairTrigger: 8,
    longReach: 5,
  });
  expect(result.boss).toMatchObject({
    active: true,
    defeated: false,
    replica: false,
    phase: 1,
    action: "idle",
  });
  await expect(page.locator("#boss-name")).toHaveText("THE LAND-EATER · LAST ACRE");
  await expect(page.getByRole("dialog", { name: "Paused" })).toBeVisible();

  const pausedSpineAudit = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const forced = game.forceLandEaterAction("burrow", {
      route: [
        { x: -42, z: -16 },
        { x: 35, z: 22 },
      ],
      targetPlayerId: "local",
    });
    game.forceLandEaterAction("idle", { cooldown: 1 });
    return forced;
  });
  expect(pausedSpineAudit.articulation).toMatchObject({
    active: true,
    mode: "burrow",
    rootYaw: 0,
    segmentCount: 10,
    pathDistance: 0,
    pathCacheFinite: true,
  });
  expect(pausedSpineAudit.articulation.segments).toHaveLength(10);
  for (const segment of pausedSpineAudit.articulation.segments) {
    expect(Number.isFinite(segment.x)).toBe(true);
    expect(Number.isFinite(segment.z)).toBe(true);
    expect(Number.isFinite(segment.angle)).toBe(true);
  }

  await page.getByRole("button", { name: "Continue" }).click();
  await expect.poll(async () => JSON.parse(
    await page.evaluate(() => window.render_game_to_text())
  ).paused).toBe(false);
  await page.getByRole("button", { name: "Open menu" }).click();
  await expect(page.getByRole("dialog", { name: "Paused" })).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test("AI performs four player attacks before every terrain devour", async ({ page }) => {
  await startHunt(page);

  const ai = await page.evaluate(() => (
    window.__dustAndDeadTest.getLandEaterDiagnostics().ai
  ));
  expect(ai.playerAttacksPerDevour).toBe(4);
  expect(ai.pattern).toHaveLength(15);
  expect(ai.devourAttemptsPerCycle).toBe(3);
  expect(ai.burrowAttemptsPerCycle + ai.zigzagAttemptsPerCycle).toBe(12);
  expect(ai.zigzagAttemptsPerCycle).toBe(1);
  expect(ai.fallbackCanStartDevour).toBe(false);

  for (let offset = 0; offset < ai.pattern.length; offset += 5) {
    expect(ai.pattern.slice(offset, offset + 4).every(
      (action) => action === "burrow" || action === "zigzag"
    )).toBe(true);
    expect(ai.pattern[offset + 4]).toBe("devour");
  }
});

test("host AI starts a second attack after the first full action cycle", async ({ page }) => {
  await startHunt(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const multiplayer = window.__dustMultiplayerTest;
    multiplayer.startMockHost(["Host", "Guest"]);
    game.startWaveNow(10, "landEater");

    // Keep the authored first strike away from both players so the regression
    // exercises target selection with two living candidates after recovery.
    const first = game.forceLandEaterAction("burrow", {
      route: [
        { x: 20, z: 0 },
        { x: 55, z: 0 },
      ],
      targetPlayerId: "mock-player-1",
      duration: 2.05,
    });
    game.setLandEaterAiEnabled(true);

    const samples = [];
    for (let step = 0; step < 32; step += 1) {
      game.advanceLandEater(250);
      const diagnostics = game.getLandEaterDiagnostics();
      samples.push({
        action: diagnostics.action,
        actionSeq: diagnostics.actionSeq,
        attackCursor: diagnostics.ai.attackCursor,
      });
    }
    const players = multiplayer.getState().players;
    return {
      firstActionSeq: first.actionSeq,
      livingPlayers: players.filter((player) => player.alive).length,
      sawRecovery: samples.some((sample) => sample.action === "recover"),
      sawIdleAfterFirst: samples.some((sample) => (
        sample.action === "idle" && sample.actionSeq > first.actionSeq
      )),
      secondAttack: samples.find((sample) => (
        ["burrow", "zigzag", "devour"].includes(sample.action) &&
        sample.actionSeq > first.actionSeq &&
        sample.attackCursor >= 1
      )) || null,
    };
  });

  expect(result.livingPlayers).toBe(2);
  expect(result.sawRecovery).toBe(true);
  expect(result.sawIdleAfterFirst).toBe(true);
  expect(result.secondAttack).toMatchObject({
    action: "burrow",
    attackCursor: 1,
  });
  expect(result.secondAttack.actionSeq).toBeGreaterThan(result.firstActionSeq);
});

test("a consumed cell hides its real building visual as well as its collider", async ({ page }) => {
  await startHunt(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const rebuilt = game.rebuildMapForTest(7332);
    game.startWaveNow(10, "landEater");
    game.setLandEaterAiEnabled(false);
    const grid = game.getLandEaterDiagnostics().grid;
    let before = null;
    for (let cellId = 0; cellId < grid.totalCells; cellId += 1) {
      const candidate = game.getLandEaterWorldCellDiagnostics(cellId);
      if (candidate?.visibleBuildings > 0 && candidate.state === 0) {
        before = candidate;
        break;
      }
    }
    if (!before) return { before: null };

    const started = game.forceLandEaterAction("devour", {
      targetCellId: before.cellId,
    });
    game.seekLandEaterAction(0.999);
    game.stepLandEater(1 / 30);
    return {
      rebuilt,
      before,
      started: Boolean(started),
      after: game.getLandEaterWorldCellDiagnostics(before.cellId),
      consumed: game.getLandEaterDiagnostics().grid.consumedCellIds,
    };
  });

  expect(result.before).not.toBeNull();
  expect(result.rebuilt).toMatchObject({ rebuilt: true, mapSeed: 7332 });
  expect(result.before.mapSeed).toBe(result.before.indexedMapSeed);
  expect(result.before.visibleBuildings).toBeGreaterThan(0);
  expect(result.started).toBe(true);
  expect(result.consumed).toContain(result.before.cellId);
  expect(result.after).toMatchObject({
    state: 2,
    visibleBuildings: 0,
    hiddenBuildings: result.before.buildingEntries,
  });
  expect(result.after.mapSeed).toBe(result.after.indexedMapSeed);
});

test("zombies can continuously traverse a diagonal corner between consumed cells", async ({ page }) => {
  await startHunt(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const grid = game.getLandEaterDiagnostics().grid;
    game.clearEnemies();
    game.setPlayerMaxHp(9999, 9999);
    let terrain = null;
    let vertexColumn = -1;
    let vertexRow = -1;
    let vertexX = 0;
    let vertexZ = 0;
    for (let row = 2; row < grid.rows - 1 && !terrain; row += 1) {
      for (let column = 2; column < grid.columns - 1; column += 1) {
        const x = -grid.cellWidth * grid.columns * 0.5
          + column * grid.cellWidth;
        const z = -grid.cellDepth * grid.rows * 0.5
          + row * grid.cellDepth;
        const northEast = (row - 1) * grid.columns + column;
        const southWest = row * grid.columns + column - 1;
        const candidateTerrain = game.setLandEaterVoidCellsForTest([
          northEast,
          southWest,
        ]);
        let clear = true;
        for (let distance = -11; distance <= 11; distance += 1) {
          if (
            game.pointHitsStaticObstacleForTest(
              x + distance,
              z + distance,
              1.25
            )
          ) {
            clear = false;
            break;
          }
        }
        if (!clear) continue;
        vertexColumn = column;
        vertexRow = row;
        vertexX = x;
        vertexZ = z;
        terrain = candidateTerrain;
        break;
      }
    }
    if (!terrain) return { terrain: null };

    game.setPlayerPosition(vertexX + 7, vertexZ + 7);
    const spawned = [
      game.spawnZombieAt("walker", vertexX - 7.4, vertexZ - 6.8),
      game.spawnZombieAt("walker", vertexX - 8.4, vertexZ - 8.2),
      game.spawnZombieAt("brute", vertexX - 9.6, vertexZ - 7.8),
    ];
    const initial = JSON.parse(window.render_game_to_text()).enemies;
    const samples = [];
    for (let step = 0; step < 24; step += 1) {
      window.advanceTime(500);
      const frame = JSON.parse(window.render_game_to_text());
      samples.push(frame.enemies.map((enemy) => ({
        groupId: enemy.groupId,
        x: enemy.x,
        z: enemy.z,
        blocked: enemy.blocked,
      })));
    }
    const final = JSON.parse(window.render_game_to_text()).enemies;
    return {
      terrain,
      spawned,
      initial,
      samples,
      final,
      vertexX,
      vertexZ,
    };
  });

  expect(result.terrain).not.toBeNull();
  expect(result.terrain.appliedIds).toHaveLength(2);
  expect(result.terrain.grid.remainingConnected).toBe(true);
  expect(result.initial).toHaveLength(3);
  expect(result.final).toHaveLength(3);
  for (const enemy of result.final) {
    expect(enemy.x, `${enemy.type} did not cross the corner on x`).toBeGreaterThan(
      result.vertexX + 0.2
    );
    expect(enemy.z, `${enemy.type} did not cross the corner on z`).toBeGreaterThan(
      result.vertexZ + 0.2
    );
    expect(enemy.blocked, `${enemy.type} ended inside terrain`).toBe(false);
  }
  const previousByEnemy = new Map(
    result.initial.map((enemy) => [enemy.groupId, enemy])
  );
  for (const frame of result.samples) {
    for (const enemy of frame) {
      const previous = previousByEnemy.get(enemy.groupId);
      if (previous) {
        expect(
          Math.hypot(enemy.x - previous.x, enemy.z - previous.z),
          `zombie ${enemy.groupId} jumped while crossing the corner`
        ).toBeLessThan(3.2);
      }
      expect(
        enemy.blocked,
        `zombie ${enemy.groupId} became blocked at ${enemy.x}, ${enemy.z}`
      ).toBe(false);
      const localX = enemy.x - result.vertexX;
      const localZ = enemy.z - result.vertexZ;
      if (localX * localZ < 0) {
        expect(
          Math.min(Math.abs(localX), Math.abs(localZ)),
          `zombie ${enemy.groupId} walked too deeply onto consumed ground`
        ).toBeLessThan(1.7);
      }
      previousByEnemy.set(enemy.groupId, enemy);
    }
  }
});

test("Land Eater uses a deterministic connected 16x14 destruction grid", async ({ page, context }) => {
  test.setTimeout(180_000);
  const twin = await context.newPage();
  try {
    await startHunt(page);
    await startHunt(twin);

    const consumeSequence = async (targetPage) => targetPage.evaluate(() => {
      const game = window.__dustAndDeadTest;
      const readGrid = (diagnostics) => diagnostics.grid || diagnostics.topology || {};
      const readIds = (diagnostics) => {
        const grid = readGrid(diagnostics);
        return (grid.voidCellIds || grid.consumedCellIds || diagnostics.voidCellIds || [])
          .map(Number)
          .sort((left, right) => left - right);
      };
      const placedPlayer = game.setPlayerPosition(0, 0);
      const opening = game.getLandEaterDiagnostics();
      const steps = [];
      for (let index = 0; index < 58; index += 1) {
        const before = game.getLandEaterDiagnostics();
        const beforeGrid = readGrid(before);
        const targetPlayer = game.getPlayerPosition?.() || placedPlayer;
        const consumed = new Set(readIds(before));
        const activeRingBefore = Number(beforeGrid.activeRing);
        const remainsConnectedAfter = (excludedCellId) => {
          const passableCount = beforeGrid.totalCells - consumed.size - 1;
          let startCellId = -1;
          for (let cellId = 0; cellId < beforeGrid.totalCells; cellId += 1) {
            if (cellId !== excludedCellId && !consumed.has(cellId)) {
              startCellId = cellId;
              break;
            }
          }
          if (startCellId < 0) return true;
          const visited = new Set([startCellId]);
          const queue = [startCellId];
          for (let cursor = 0; cursor < queue.length; cursor += 1) {
            const cellId = queue[cursor];
            const column = cellId % beforeGrid.columns;
            const row = Math.floor(cellId / beforeGrid.columns);
            const neighbors = [];
            if (column > 0) neighbors.push(cellId - 1);
            if (column + 1 < beforeGrid.columns) neighbors.push(cellId + 1);
            if (row > 0) neighbors.push(cellId - beforeGrid.columns);
            if (row + 1 < beforeGrid.rows) neighbors.push(cellId + beforeGrid.columns);
            for (const neighbor of neighbors) {
              if (
                neighbor === excludedCellId
                || consumed.has(neighbor)
                || visited.has(neighbor)
              ) continue;
              visited.add(neighbor);
              queue.push(neighbor);
            }
          }
          return visited.size === passableCount;
        };
        let closestRingDistance = Infinity;
        let closestRingCellId = -1;
        for (let cellId = 0; cellId < beforeGrid.totalCells; cellId += 1) {
          if (consumed.has(cellId)) continue;
          const column = cellId % beforeGrid.columns;
          const row = Math.floor(cellId / beforeGrid.columns);
          const ring = Math.min(
            column,
            row,
            beforeGrid.columns - 1 - column,
            beforeGrid.rows - 1 - row
          );
          if (ring !== activeRingBefore) continue;
          if (!remainsConnectedAfter(cellId)) continue;
          const x = -beforeGrid.columns * beforeGrid.cellWidth * 0.5
            + (column + 0.5) * beforeGrid.cellWidth;
          const z = -beforeGrid.rows * beforeGrid.cellDepth * 0.5
            + (row + 0.5) * beforeGrid.cellDepth;
          const candidateDistance = Math.hypot(x - targetPlayer.x, z - targetPlayer.z);
          if (candidateDistance < closestRingDistance) {
            closestRingDistance = candidateDistance;
            closestRingCellId = cellId;
          }
        }
        const started = game.forceLandEaterAction("devour");
        const target = started && (started.targetCell || started.devour?.targetCell);
        const targetCellId = Number(target?.id ?? started?.targetCellId);
        const targetRing = Number(target?.ring ?? Math.min(
          target?.column,
          target?.row,
          beforeGrid.columns - 1 - target?.column,
          beforeGrid.rows - 1 - target?.row
        ));
        const targetDistance = Math.hypot(
          Number(target?.x) - targetPlayer.x,
          Number(target?.z) - targetPlayer.z
        );
        game.seekLandEaterAction(0.999);
        game.stepLandEater(1 / 30);
        const after = game.getLandEaterDiagnostics();
        const grid = readGrid(after);
        steps.push({
          targetCellId,
          targetRing,
          targetDistance,
          closestRingDistance,
          closestRingCellId,
          activeRingBefore,
          activeRingAfter: Number(grid.activeRing),
          voidCellIds: readIds(after),
          safeCellCount: Number(grid.safeCellCount),
          reachableSafeCells: Number(grid.reachableSafeCells),
          remainingConnected: grid.remainingConnected ?? grid.connected,
        });
      }
      return {
        opening,
        steps,
      };
    });

    const [first, second] = await Promise.all([
      consumeSequence(page),
      consumeSequence(twin),
    ]);
    const openingGrid = gridOf(first.opening);

    expect(openingGrid).toMatchObject({
      columns: 16,
      rows: 14,
      totalCells: 224,
      cellWidth: 29,
      cellDepth: 28,
      maskBytes: 28,
    });
    expect(first.steps.map((step) => step.targetCellId)).toEqual(
      second.steps.map((step) => step.targetCellId)
    );
    expect(new Set(first.steps.map((step) => step.targetCellId)).size).toBe(58);

    first.steps.forEach((step, index) => {
      const expectedTargetRing = index < 56 ? 0 : 1;
      expect(step.targetCellId).toBeGreaterThanOrEqual(0);
      expect(step.targetCellId).toBeLessThan(224);
      expect(step.activeRingBefore).toBe(expectedTargetRing);
      expect(step.targetRing).toBe(expectedTargetRing);
      expect(
        step.targetDistance,
        `step ${index}: target ${step.targetCellId} should be the safe current-ring square nearest `
          + `to the player (candidate ${step.closestRingCellId})`
      ).toBeCloseTo(step.closestRingDistance, 6);
      expect(step.activeRingAfter).toBe(index < 55 ? 0 : 1);
      expect(step.voidCellIds).toHaveLength(index + 1);
      expect(step.voidCellIds).toContain(step.targetCellId);
      expect(step.remainingConnected).toBe(true);
      expect(step.reachableSafeCells).toBe(step.safeCellCount);
      expect(step.safeCellCount + step.voidCellIds.length).toBe(224);
    });
  } finally {
    await twin.close();
  }
});

test("production devour emerges beside the warned cell and dives into it", async ({ page }) => {
  await startHunt(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const grid = game.getLandEaterDiagnostics().grid;
    const targetCellId = Math.floor(grid.columns / 2);
    const before = game.getLandEaterDiagnostics();
    const opening = game.forceLandEaterAction("devour", { targetCellId });
    const diveTime = opening.actionDuration - opening.warningDuration - 0.38;
    const tunnelMiddle = game.seekLandEaterAction(
      opening.devour.tunnelDuration * 0.5 / opening.actionDuration
    );
    const emergeMiddle = game.seekLandEaterAction(
      (
        opening.devour.tunnelDuration +
        (
          opening.warningDuration - opening.devour.tunnelDuration
        ) * 0.5
      ) / opening.actionDuration
    );
    const middleProgress = (
      opening.warningDuration + diveTime * 0.5
    ) / opening.actionDuration;
    const middle = game.seekLandEaterAction(middleProgress);
    const impact = game.seekLandEaterAction(0.999);
    const target = opening.targetCell;
    const distanceToTarget = (sample) => Math.hypot(
      sample.x - target.x,
      sample.z - target.z
    );
    const outsideTarget = (point) => (
      point.x < target.minX || point.x > target.maxX
      || point.z < target.minZ || point.z > target.maxZ
    );
    const insideTarget = (point) => (
      point.x >= target.minX && point.x <= target.maxX
      && point.z >= target.minZ && point.z <= target.maxZ
    );
    const travelAngle = Math.atan2(
      -(opening.devour.end.z - opening.devour.start.z),
      opening.devour.end.x - opening.devour.start.x
    );
    const angleError = Math.abs(Math.atan2(
      Math.sin(opening.devour.facingAngle - travelAngle),
      Math.cos(opening.devour.facingAngle - travelAngle)
    ));
    const recoveryStart = game.forceLandEaterAction("recover", { duration: 1 });
    const recoveryMiddle = game.seekLandEaterAction(0.5);
    game.seekLandEaterAction(0.999);
    const hiddenIdle = game.stepLandEater(0.01);
    const hiddenIdlePosition = { x: hiddenIdle.x, z: hiddenIdle.z };
    const nextDevour = game.forceLandEaterAction("devour", {
      targetCellId: targetCellId + 1,
    });
    return {
      opening,
      before,
      tunnelMiddle,
      emergeMiddle,
      middle,
      impact,
      recoveryStart,
      recoveryMiddle,
      hiddenIdle,
      nextDevour,
      hiddenRepositionDistance: Math.hypot(
        nextDevour.x - hiddenIdlePosition.x,
        nextDevour.z - hiddenIdlePosition.z
      ),
      startOutsideTarget: outsideTarget(opening.devour.start),
      endInsideTarget: insideTarget(opening.devour.end),
      startDistance: distanceToTarget(opening.devour.start),
      middleDistance: distanceToTarget(middle.head),
      impactDistance: distanceToTarget(impact.head),
      angleError,
    };
  });

  expect(result.opening.action).toBe("devour");
  expect(result.opening.targetCell.ring).toBe(0);
  expect(result.opening.route).toHaveLength(2);
  expect(result.opening.route[0].x).toBeCloseTo(result.before.x, 3);
  expect(result.opening.route[0].z).toBeCloseTo(result.before.z, 3);
  expect(result.opening.x).toBeCloseTo(result.before.x, 3);
  expect(result.opening.z).toBeCloseTo(result.before.z, 3);
  expect(result.startOutsideTarget).toBe(true);
  expect(result.endInsideTarget).toBe(true);
  expect(result.opening.visualY).toBeCloseTo(-6.5, 3);
  expect(result.opening.submerged).toBe(true);
  expect(result.tunnelMiddle.devour.tunnelProgress).toBeCloseTo(0.5, 2);
  expect(result.tunnelMiddle.visualY).toBeGreaterThan(-4);
  expect(result.tunnelMiddle.visualY).toBeLessThan(-3.5);
  expect(Math.hypot(
    result.tunnelMiddle.x - result.opening.x,
    result.tunnelMiddle.z - result.opening.z
  )).toBeGreaterThan(10);
  expect(result.emergeMiddle.visualY).toBeCloseTo(-3.25, 2);
  expect(result.emergeMiddle.submerged).toBe(false);
  expect(result.impact.visualY).toBeCloseTo(0, 3);
  expect(result.startDistance).toBeGreaterThan(result.middleDistance + 5);
  expect(result.middleDistance).toBeGreaterThan(result.impactDistance + 5);
  expect(result.impactDistance).toBeLessThan(3.6);
  expect(result.middle.devour.diveProgress).toBeCloseTo(0.5, 2);
  expect(result.impact.devour.diveProgress).toBeGreaterThan(0.99);
  expect(result.angleError).toBeLessThan(0.001);
  expect(result.recoveryStart.visualY).toBeCloseTo(0, 3);
  expect(result.recoveryMiddle.visualY).toBeCloseTo(-3.25, 2);
  expect(result.hiddenIdle).toMatchObject({
    action: "idle",
    submerged: true,
    visualY: -6.5,
  });
  expect(result.hiddenRepositionDistance).toBeLessThan(0.01);
  expect(result.nextDevour.submerged).toBe(true);
  expect(result.nextDevour.visualY).toBeCloseTo(-6.5, 3);
});

test("production ricochet varies a non-crossing wall-bounce route without sliding", async ({ page }) => {
  await startHunt(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const opening = game.forceLandEaterAction("zigzag");
    const route = opening.zigzag.route;
    const facingProbe = game.stepLandEater(0.25);
    const lengths = route.slice(1).map((point, index) => Math.hypot(
      point.x - route[index].x,
      point.z - route[index].z
    ));
    const travelSpeed = opening.zigzag.speed;
    const turnTime = opening.zigzag.turnDuration;
    const totalTimeline = lengths.reduce((sum, length) => sum + length / travelSpeed, 0)
      + turnTime * Math.max(0, route.length - 2);
    const firstTurnStart = (lengths[0] / travelSpeed) / totalTimeline;
    const turnQuarter = game.seekLandEaterAction(
      firstTurnStart + turnTime * 0.25 / totalTimeline
    );
    const turnThreeQuarters = game.seekLandEaterAction(
      firstTurnStart + turnTime * 0.75 / totalTimeline
    );
    const firstLegA = game.seekLandEaterAction(
      lengths[0] / travelSpeed * 0.35 / totalTimeline
    );
    const firstLegB = game.seekLandEaterAction(
      lengths[0] / travelSpeed * 0.65 / totalTimeline
    );
    const motionAngle = Math.atan2(
      -(firstLegB.z - firstLegA.z),
      firstLegB.x - firstLegA.x
    );
    const facingError = Math.abs(Math.atan2(
      Math.sin(firstLegB.facingAngle - motionAngle),
      Math.cos(firstLegB.facingAngle - motionAngle)
    ));
    const turnFacingDelta = Math.abs(Math.atan2(
      Math.sin(turnThreeQuarters.facingAngle - turnQuarter.facingAngle),
      Math.cos(turnThreeQuarters.facingAngle - turnQuarter.facingAngle)
    ));
    const cross = (a, b, c) =>
      (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
    const properlyIntersects = (a, b, c, d) => {
      const abC = cross(a, b, c);
      const abD = cross(a, b, d);
      const cdA = cross(c, d, a);
      const cdB = cross(c, d, b);
      return abC * abD < 0 && cdA * cdB < 0;
    };
    let selfIntersections = 0;
    for (let first = 0; first < route.length - 1; first += 1) {
      for (let second = first + 2; second < route.length - 1; second += 1) {
        if (properlyIntersects(
          route[first],
          route[first + 1],
          route[second],
          route[second + 1]
        )) {
          selfIntersections += 1;
        }
      }
    }
    const nextRoute = game.forceLandEaterAction("zigzag").zigzag.route;
    return {
      opening,
      facingProbe,
      route,
      lengths,
      turnQuarter,
      turnThreeQuarters,
      firstLegA,
      firstLegB,
      facingError,
      turnFacingDelta,
      selfIntersections,
      nextRoute,
      stationaryTurnDistance: Math.hypot(
        turnThreeQuarters.x - turnQuarter.x,
        turnThreeQuarters.z - turnQuarter.z
      ),
    };
  });

  const start = result.route[0];
  const finish = result.route[result.route.length - 1];
  const depthDirection = Math.sign(finish.z - start.z);
  expect(result.route.length).toBeGreaterThanOrEqual(8);
  expect(result.route.length).toBeLessThanOrEqual(10);
  expect(result.lengths.length).toBeGreaterThanOrEqual(7);
  expect(result.lengths.length).toBeLessThanOrEqual(9);
  expect(result.opening.zigzag.bounceCount).toBe(result.route.length - 2);
  expect(result.opening.zigzag.turnDuration).toBeCloseTo(0.65, 6);
  expect(Math.abs(start.x)).toBeCloseTo(224, 6);
  expect(Math.abs(start.z)).toBeGreaterThan(160);
  expect(Math.abs(finish.z)).toBeGreaterThan(160);
  expect(depthDirection).not.toBe(0);
  result.route.forEach((point, index) => {
    expect(Math.abs(point.x)).toBeCloseTo(224, 6);
    if (index === 0) return;
    expect(Math.sign(point.x)).toBe(-Math.sign(result.route[index - 1].x));
    expect(Math.sign(point.z - result.route[index - 1].z)).toBe(depthDirection);
    expect(Math.abs(point.z - result.route[index - 1].z)).toBeGreaterThan(15);
  });
  result.lengths.forEach((length, index) => {
    const from = result.route[index];
    const to = result.route[index + 1];
    expect(Math.abs(to.x - from.x)).toBeGreaterThan(400);
    expect(Math.abs(to.z - from.z)).toBeGreaterThan(15);
    expect(length).toBeGreaterThan(448);
  });
  expect(result.selfIntersections).toBe(0);
  expect(result.opening.actionDuration).toBeGreaterThan(15);
  expect(result.opening.actionDuration).toBeLessThan(23);
  expect(result.opening.zigzag.speed).toBe(300);
  expect(result.nextRoute).not.toEqual(result.route);
  expect(Math.abs(result.firstLegB.x - result.firstLegA.x)).toBeGreaterThan(100);
  expect(Math.abs(result.firstLegB.z - result.firstLegA.z)).toBeGreaterThan(10);
  expect(result.facingError).toBeLessThan(0.001);
  expect(result.turnQuarter.zigzag.turning).toBe(true);
  expect(result.turnThreeQuarters.zigzag.turning).toBe(true);
  expect(result.turnQuarter.zigzag.locomotionWeight).toBe(0);
  expect(result.turnThreeQuarters.zigzag.locomotionWeight).toBe(0);
  expect(result.stationaryTurnDistance).toBeLessThan(0.001);
  expect(Math.abs(result.turnQuarter.zigzag.turnAmount)).toBeGreaterThan(0.6);
  expect(Math.abs(result.turnThreeQuarters.zigzag.turnAmount)).toBeGreaterThan(0.6);
  expect(result.turnFacingDelta).toBeGreaterThan(1);
  expect(result.facingProbe.orientation.modelForwardAxis).toBe("+X");
  expect(result.facingProbe.orientation.mouthForwardDot).toBeGreaterThan(0.98);
  expect(result.facingProbe.visualFacingAngle).toBeCloseTo(
    result.facingProbe.facingAngle,
    3
  );
  expect(result.facingProbe.orientation.minimapRotation).toBeCloseTo(
    Math.PI * 0.5 - result.facingProbe.facingAngle,
    3
  );
});

test("burrow hunt locks a random player, travels underground, and erupts without eating terrain", async ({ page }) => {
  await startHunt(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const world = () => JSON.parse(window.render_game_to_text());
    game.clearEnemies();
    game.setPlayerMaxHp(10000, 10000);
    const placedTarget = game.setPlayerPosition(72, -46);
    const before = game.getLandEaterDiagnostics();
    const opening = game.forceLandEaterAction("burrow");
    game.setPlayerPosition(-120, 110);
    const underground = game.seekLandEaterAction(0.4);
    const zombie = game.spawnZombieAt(
      "brute",
      opening.burrow.target.x + 0.25,
      opening.burrow.target.z + 0.25
    );
    const beforeImpact = game.seekLandEaterAction(0.999);
    const afterImpact = game.stepLandEater(1 / 30);
    const afterWorld = world();
    const start = opening.burrow.start;
    const target = opening.burrow.target;
    const lineDx = target.x - start.x;
    const lineDz = target.z - start.z;
    const lineLength = Math.hypot(lineDx, lineDz);
    const lateralDistance = Math.abs(
      lineDz * underground.x -
      lineDx * underground.z +
      target.x * start.z -
      target.z * start.x
    ) / Math.max(0.001, lineLength);
    return {
      placedTarget,
      before,
      opening,
      underground,
      beforeImpact,
      afterImpact,
      zombie,
      afterWorld,
      lateralDistance,
    };
  });

  expect(result.opening).toMatchObject({
    action: "burrow",
    submerged: true,
    visualY: -6.5,
    burrow: {
      active: true,
      targetPlayerId: "local",
      targetVisible: true,
      wakeVisible: true,
      impacted: false,
    },
  });
  expect(result.opening.route).toHaveLength(2);
  expect(result.opening.burrow.target.x).toBeCloseTo(result.placedTarget.x, 3);
  expect(result.opening.burrow.target.z).toBeCloseTo(result.placedTarget.z, 3);
  expect(result.underground.submerged).toBe(false);
  expect(result.underground.visualY).toBeGreaterThan(-4);
  expect(result.underground.visualY).toBeLessThan(-3.5);
  expect(result.underground.burrow.movement)
    .toBe("distance-synchronized-serpentine");
  expect(result.underground.burrow.travelProgress).toBeGreaterThan(0.5);
  expect(Math.hypot(
    result.underground.x - result.opening.burrow.start.x,
    result.underground.z - result.opening.burrow.start.z
  )).toBeGreaterThan(10);
  expect(result.lateralDistance).toBeGreaterThan(1);
  expect(result.beforeImpact.burrow.emergeProgress).toBe(1);
  expect(result.beforeImpact.burrow.strikeProgress).toBeGreaterThan(0.6);
  expect(result.afterImpact.burrow.impacted).toBe(true);
  expect(result.afterImpact.telegraph.burrow.playerCenterHitRadius).toBeCloseTo(
    result.afterImpact.burrow.playerCenterHitRadius,
    6
  );
  expect(result.afterWorld.enemies.map((enemy) => enemy.groupId))
    .not.toContain(result.zombie.groupId);
  expect(result.afterWorld.player.hp).toBeGreaterThan(0);
  expect(result.afterImpact.collision.lastSweepHits.length).toBeGreaterThanOrEqual(1);
  expect(result.afterImpact.grid.voidCellIds).toEqual(result.before.grid.voidCellIds);
  expect(result.opening.ai).toMatchObject({
    pattern: [
      "burrow", "burrow", "burrow", "burrow", "devour",
      "burrow", "burrow", "burrow", "burrow", "devour",
      "burrow", "zigzag", "burrow", "burrow", "devour",
    ],
    playerAttacksPerDevour: 4,
    devourAttemptsPerCycle: 3,
    burrowAttemptsPerCycle: 11,
    zigzagAttemptsPerCycle: 1,
    nonZigzagAttemptsBetweenZigzags: 14,
    fallbackCanStartZigzag: false,
    fallbackCanStartDevour: false,
    cycleLength: 15,
  });
  expect(result.opening.ai.burrowAttemptsPerCycle)
    .toBeGreaterThanOrEqual(result.opening.ai.devourAttemptsPerCycle);
});

test("zigzag pre-marks and eats each fifth crossed square while preserving connected ground", async ({ page }) => {
  await startHunt(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    game.clearEnemies();
    game.setPlayerPosition(0, 180);
    const before = game.getLandEaterDiagnostics();
    const opening = game.forceLandEaterAction("zigzag", {
      route: [
        { x: -220, z: -150 },
        { x: 220, z: -120 },
        { x: -220, z: -90 },
      ],
      duration: 2,
    });
    const active = game.stepLandEater(opening.actionDuration - 0.05);
    return { before, opening, active };
  });

  expect(result.active.action).toBe("zigzag");
  expect(result.opening.zigzag.consumeEveryCrossedCells).toBe(5);
  expect(result.opening.zigzag.futureDoomedCellIds.length)
    .toBeGreaterThan(3);
  expect(result.opening.telegraph.zigzag.doomedCellIds)
    .toEqual(result.opening.zigzag.futureDoomedCellIds);
  expect(result.opening.telegraph.zigzag.doomedFillInstances)
    .toBe(result.opening.zigzag.futureDoomedCellIds.length);
  expect(result.opening.telegraph.zigzag.doomedDetailInstances)
    .toBe(result.opening.zigzag.futureDoomedCellIds.length);
  expect(result.opening.telegraph.zigzag.doomedPalette.semantic)
    .toBe("terrain-devour-red");
  const [fillRed, fillGreen, fillBlue] =
    result.opening.telegraph.zigzag.doomedPalette.fill;
  const [markRed, markGreen, markBlue] =
    result.opening.telegraph.zigzag.doomedPalette.mark;
  expect(fillRed).toBeGreaterThan(fillGreen * 8);
  expect(fillRed).toBeGreaterThan(fillBlue * 8);
  expect(markRed).toBeGreaterThan(0.9);
  expect(markGreen).toBeLessThan(0.2);
  expect(markBlue).toBeLessThan(0.2);
  expect(result.active.zigzag.crossedCellCount).toBeGreaterThan(20);
  expect(result.active.zigzag.consumedCellIds.length).toBe(
    Math.floor(result.active.zigzag.crossedCellCount / 5)
  );
  const expectedIds = result.active.zigzag.cellSchedule
    .slice(0, result.active.zigzag.scheduleCursor)
    .filter((crossing) => crossing.ordinal % 5 === 0)
    .map((crossing) => crossing.id);
  expect(result.active.zigzag.consumedCellIds).toEqual(expectedIds);
  expect(result.active.grid.voidCellIds).toEqual(
    [...expectedIds].sort((left, right) => left - right)
  );
  expect(result.active.grid.remainingConnected).toBe(true);
  expect(result.active.grid.cellRevision - result.before.grid.cellRevision)
    .toBe(expectedIds.length);
});

test("consumed cells persist after the boss dies and reject every gameplay spawn class", async ({ page }) => {
  await startHunt(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    game.clearEnemies();
    game.clearAmmoCrates();
    game.clearFireHazards();
    game.clearXpOrbs();
    game.clearRifleTraps();
    game.clearPaleDeputies();
    const opening = game.forceLandEaterAction("devour");
    const doomed = opening.targetCell;
    game.stepLandEater(
      opening.warningDuration + 1.55 + 0.01
    );
    const eaten = game.getLandEaterDiagnostics();
    game.damageLandEater(99999999);
    game.stepLandEater(3.4);
    const persistent = game.getLandEaterMapDiagnostics();

    const player = game.setPlayerPosition(doomed.x, doomed.z);
    const enemy = game.spawnZombieAt(
      "walker",
      doomed.x,
      doomed.z
    );
    const crate = game.spawnAmmoCrateAt(doomed.x, doomed.z);
    const fire = game.spawnFirePatchAt(
      doomed.x,
      doomed.z,
      1.4,
      4
    );
    const deputy = game.spawnPaleDeputyAt(doomed.x, doomed.z);
    const xpOrb = game.spawnXpOrbAt(doomed.x, doomed.z, 12);
    const trap = game.spawnRifleTrapAt(doomed.x, doomed.z);
    const afterSpawns = game.getLandEaterMapDiagnostics();

    function cellIdAt(point, grid) {
      const halfWidth = grid.columns * grid.cellWidth * 0.5;
      const halfDepth = grid.rows * grid.cellDepth * 0.5;
      const column = Math.max(
        0,
        Math.min(
          grid.columns - 1,
          Math.floor((point.x + halfWidth) / grid.cellWidth)
        )
      );
      const row = Math.max(
        0,
        Math.min(
          grid.rows - 1,
          Math.floor((point.z + halfDepth) / grid.cellDepth)
        )
      );
      return row * grid.columns + column;
    }

    const points = {
      player,
      enemy,
      crate,
      fire,
      deputy,
      xpOrb,
    };
    const spawnedCellIds = Object.fromEntries(
      Object.entries(points).map(([kind, point]) => [
        kind,
        point ? cellIdAt(point, afterSpawns) : null,
      ])
    );
    return {
      doomedId: doomed.id,
      eatenIds: eaten.grid.voidCellIds,
      persistent,
      afterSpawns,
      points,
      spawnedCellIds,
      trap,
    };
  });

  expect(result.eatenIds).toContain(result.doomedId);
  expect(result.persistent).toMatchObject({
    persistsUntilRunReset: true,
    spawnSafety: {
      rejectsConsumedCells: true,
    },
  });
  expect(result.persistent.voidCellIds).toContain(result.doomedId);
  expect(result.afterSpawns.voidCellIds).toEqual(
    result.persistent.voidCellIds
  );
  expect(result.trap).toBeNull();
  expect(Object.values(result.points).every(Boolean)).toBe(true);
  for (const [kind, cellId] of Object.entries(
    result.spawnedCellIds
  )) {
    expect(
      result.afterSpawns.voidCellIds,
      `${kind} spawned in consumed cell ${cellId}`
    ).not.toContain(cellId);
  }
  expect(result.afterSpawns.spawnSafety.relocations)
    .toBeGreaterThanOrEqual(4);
});

test("phase forcing preserves the 70/35 percent contract and actions stay mutually exclusive", async ({ page }) => {
  await startHunt(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const phaseOne = game.forceLandEaterPhase(1);
    const phaseTwo = game.forceLandEaterPhase(2);
    const phaseThree = game.forceLandEaterPhase(3);

    game.forceLandEaterPhase(2);
    const devour = game.forceLandEaterAction("devour");
    const devourFlags = {
      devour: Boolean(devour.devour?.active ?? devour.action === "devour"),
      zigzag: Boolean(devour.zigzag?.active),
    };
    const zigzag = game.forceLandEaterAction("zigzag", {
      route: [
        { x: -220, z: -150 },
        { x: 220, z: -90 },
        { x: -220, z: -30 },
        { x: 220, z: 30 },
        { x: -220, z: 90 },
        { x: 220, z: 150 },
      ],
    });
    const zigzagFlags = {
      devour: Boolean(zigzag.devour?.active),
      zigzag: Boolean(zigzag.zigzag?.active ?? zigzag.action === "zigzag"),
    };
    const beforeDamage = game.forceLandEaterAction("recover");
    const applied = game.damageLandEater(17);
    const afterDamage = game.getLandEaterDiagnostics();
    return {
      phaseOne,
      phaseTwo,
      phaseThree,
      devour,
      devourFlags,
      zigzag,
      zigzagFlags,
      beforeDamage,
      applied,
      afterDamage,
    };
  });

  expect(result.phaseOne.phase).toBe(1);
  expect(result.phaseTwo.phase).toBe(2);
  expect(result.phaseThree.phase).toBe(3);
  expect(result.phaseOne.hp / result.phaseOne.maxHp).toBeGreaterThan(0.7);
  expect(result.phaseTwo.hp / result.phaseTwo.maxHp).toBeLessThanOrEqual(0.7);
  expect(result.phaseTwo.hp / result.phaseTwo.maxHp).toBeGreaterThan(0.35);
  expect(result.phaseThree.hp / result.phaseThree.maxHp).toBeLessThanOrEqual(0.35);

  expect(result.devour.action).toBe("devour");
  expect(result.devourFlags).toEqual({ devour: true, zigzag: false });
  expect(result.devour.targetCell || result.devour.devour?.targetCell).toBeTruthy();
  expect(result.zigzag.action).toBe("zigzag");
  expect(result.zigzagFlags).toEqual({ devour: false, zigzag: true });
  expect(result.zigzag.route || result.zigzag.zigzag?.route).toHaveLength(6);

  expect(result.beforeDamage.action).toBe("recover");
  expect(result.applied).toBe(17);
  expect(result.afterDamage.hp).toBe(result.beforeDamage.hp - 17);
});

test("attack telegraphs match the exact devour cell and player-center zigzag capsule", async ({ page }) => {
  await startHunt(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const world = () => JSON.parse(window.render_game_to_text());
    game.clearEnemies();
    game.setPlayerMaxHp(10000, 10000);

    const opening = game.getLandEaterDiagnostics();
    const targetCellId = opening.grid.columns * 6 + 8;
    const devourTelegraph = game.forceLandEaterAction("devour", { targetCellId });
    const target = devourTelegraph.telegraph.devour.bounds;
    game.setPlayerPosition(target.maxX + 0.05, target.z);
    game.seekLandEaterAction(0.999);
    game.stepLandEater(1 / 30);
    const afterDevour = game.getLandEaterDiagnostics();
    const afterDevourWorld = world();

    const routeZ = 120;
    const route = [
      { x: -18, z: routeZ },
      { x: 18, z: routeZ },
    ];
    const playerCenterHitRadius =
      devourTelegraph.telegraph.zigzag.playerCenterHitRadius;
    game.setPlayerPosition(0, routeZ + playerCenterHitRadius + 0.08);
    const zigzagTelegraph = game.forceLandEaterAction("zigzag", {
      route,
      duration: 1,
    });
    const zigzagActive = game.seekLandEaterAction(0.25);
    game.stepLandEater(0.5);
    const outsideWorld = world();

    game.setPlayerPosition(0, routeZ + playerCenterHitRadius - 0.08);
    game.forceLandEaterAction("zigzag", { route, duration: 1 });
    game.seekLandEaterAction(0.25);
    game.stepLandEater(0.5);
    const insideWorld = world();

    return {
      targetCellId,
      devourTelegraph,
      afterDevour,
      afterDevourHp: afterDevourWorld.player?.hp ?? 0,
      zigzagTelegraph,
      zigzagActive,
      outsideHp: outsideWorld.player?.hp ?? 0,
      insideHp: insideWorld.player?.hp ?? 0,
    };
  });

  expect(result.devourTelegraph.telegraph.devour).toMatchObject({
    active: true,
    cellId: result.targetCellId,
    fillInstances: 1,
    detailInstances: 1,
  });
  expect(result.devourTelegraph.telegraph.devour.width)
    .toBeCloseTo(result.devourTelegraph.grid.cellWidth, 6);
  expect(result.devourTelegraph.telegraph.devour.depth)
    .toBeCloseTo(result.devourTelegraph.grid.cellDepth, 6);
  expect(result.afterDevourHp).toBeGreaterThan(0);
  expect(result.afterDevour.grid.voidCellIds).toContain(result.targetCellId);

  const zigzag = result.zigzagTelegraph.telegraph.zigzag;
  expect(zigzag.playerCenterHitRadius)
    .toBeCloseTo(zigzag.bodyHitRadius + zigzag.localPlayerRadius, 6);
  expect(zigzag.renderedCorridorRadius).toBeCloseTo(zigzag.playerCenterHitRadius, 6);
  expect(zigzag.renderedCorridorWidth).toBeCloseTo(zigzag.playerCenterHitRadius * 2, 6);
  expect(zigzag.capTangentRadius).toBeCloseTo(zigzag.playerCenterHitRadius, 6);
  expect(zigzag.segmentInstances).toBe(1);
  expect(zigzag.coreInstances).toBe(1);
  expect(zigzag.capInstances).toBe(2);
  expect(zigzag.doomedCellIds).toHaveLength(0);
  expect(zigzag.doomedFillInstances).toBe(zigzag.doomedCellIds.length);
  expect(zigzag.doomedDetailInstances).toBe(zigzag.doomedCellIds.length);
  expect(result.zigzagActive.telegraph.zigzag.sweepVisible).toBe(true);
  expect(result.zigzagTelegraph.grid.overlayDrawCalls).toBeLessThanOrEqual(11);
  expect(result.zigzagTelegraph.effects).toMatchObject({
    motionParticlesPerPulseMax: 3,
    impactParticles: 24,
    bounceParticles: 10,
    routeOverlayDrawCalls: 4,
    marchWarningDrawCalls: 2,
  });
  expect(result.outsideHp).toBeGreaterThan(0);
  expect(result.insideHp).toBe(0);
});

test("a devoured cell kills high-HP occupants without XP, score, drops, or kill credit", async ({ page }) => {
  await startHunt(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const world = () => JSON.parse(window.render_game_to_text());
    const grid = game.getLandEaterDiagnostics().grid;
    const probeCellId = Math.floor(grid.totalCells / 2) + 1;
    const started = game.forceLandEaterAction("devour", { targetCellId: probeCellId });
    const target = started.targetCell || started.devour?.targetCell;
    const column = probeCellId % grid.columns;
    const row = Math.floor(probeCellId / grid.columns);
    const x = Number(target?.x ?? (-232 + (column + 0.5) * grid.cellWidth));
    const z = Number(target?.z ?? (-196 + (row + 0.5) * grid.cellDepth));

    game.clearEnemies();
    game.setPlayerMaxHp(10000, 10000);
    const playerPosition = game.setPlayerPosition(x, z);
    const zombie = game.spawnZombieAt("brute", x + 0.25, z + 0.25);
    const before = world();
    game.seekLandEaterAction(0.999);
    game.stepLandEater(1 / 30);
    const after = world();
    const diagnostics = game.getLandEaterDiagnostics();
    return {
      probeCellId,
      playerPosition,
      zombie,
      before: {
        score: before.score,
        kills: before.kills,
        xp: before.progression.xp,
        totalXp: before.progression.totalXp,
        xpOrbs: before.progression.xpOrbs,
        enemyCount: before.enemyCount,
      },
      after: {
        score: after.score,
        kills: after.kills,
        xp: after.progression.xp,
        totalXp: after.progression.totalXp,
        xpOrbs: after.progression.xpOrbs,
        enemyCount: after.enemyCount,
        playerHp: after.player?.hp ?? 0,
        enemyIds: after.enemies.map((enemy) => enemy.groupId),
      },
      voidCellIds: (diagnostics.grid.voidCellIds || diagnostics.grid.consumedCellIds || [])
        .map(Number),
    };
  });

  expect(result.before.enemyCount).toBe(1);
  expect(result.after.playerHp).toBe(0);
  expect(result.after.enemyCount).toBe(0);
  expect(result.after.enemyIds).not.toContain(result.zombie.groupId);
  expect(result.after).toMatchObject({
    score: result.before.score,
    kills: result.before.kills,
    xp: result.before.xp,
    totalXp: result.before.totalXp,
    xpOrbs: result.before.xpOrbs,
  });
  expect(result.voidCellIds).toContain(result.probeCellId);
});

test("zigzag uses swept collision when both sampled endpoints miss the victim", async ({ page }) => {
  await startHunt(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const world = () => JSON.parse(window.render_game_to_text());
    game.clearEnemies();
    game.setPlayerMaxHp(10000, 10000);
    const placed = game.setPlayerPosition(0, 150);
    const center = { x: placed.x, z: placed.z };
    const route = [
      { x: center.x - 18, z: center.z },
      { x: center.x + 18, z: center.z },
    ];
    game.forceLandEaterAction("zigzag", { route, duration: 1 });
    game.seekLandEaterAction(0.25);
    const before = game.getLandEaterDiagnostics();
    const zombie = game.spawnZombieAt("brute", center.x + 0.2, center.z);
    game.stepLandEater(0.5);
    const after = game.getLandEaterDiagnostics();
    const afterWorld = world();
    const beforeHead = before.head || { x: before.x, z: before.z };
    const afterHead = after.head || { x: after.x, z: after.z };
    return {
      center,
      zombie,
      beforeHead,
      afterHead,
      hitRadius: Number(
        before.zigzag?.collisionRadius
          ?? before.collisionRadius
          ?? 3
      ),
      playerHp: afterWorld.player?.hp ?? 0,
      enemyIds: afterWorld.enemies.map((enemy) => enemy.groupId),
      sweepHits: after.collision?.lastSweepHits || after.lastSweepHits || [],
      voidCellIds: after.grid.voidCellIds || after.grid.consumedCellIds || [],
    };
  });

  expect(Math.hypot(
    result.beforeHead.x - result.center.x,
    result.beforeHead.z - result.center.z
  )).toBeGreaterThan(result.hitRadius + 2);
  expect(Math.hypot(
    result.afterHead.x - result.center.x,
    result.afterHead.z - result.center.z
  )).toBeGreaterThan(result.hitRadius + 2);
  expect(result.playerHp).toBe(0);
  expect(result.enemyIds).not.toContain(result.zombie.groupId);
  expect(result.sweepHits.length).toBeGreaterThanOrEqual(2);
  expect(result.voidCellIds).toHaveLength(0);
});

test("the rendered head and ten body sections follow the route as an articulated snake", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await startHunt(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const route = [
      { x: -118, z: -82 },
      { x: 92, z: 64 },
    ];
    game.forceLandEaterAction("burrow", {
      route,
      targetPlayerId: "local",
    });
    game.advanceLandEater(1450);
    const early = game.getLandEaterDiagnostics();
    game.advanceLandEater(720);
    const later = game.getLandEaterDiagnostics();
    const beforeRecovery = game.getLandEaterDiagnostics();
    const recoveryStart = game.forceLandEaterAction("recovery", {
      duration: 0.8,
    });

    const ricochetRoute = [
      { x: -26, z: -14 },
      { x: 18, z: -10 },
      { x: -20, z: -6 },
      { x: 24, z: -2 },
    ];
    game.forceLandEaterAction("zigzag", { route: ricochetRoute });
    game.seekLandEaterAction(0.494);
    game.stepLandEater(1 / 60);
    const corner = game.getLandEaterDiagnostics();
    return {
      early,
      later,
      beforeRecovery,
      recoveryStart,
      corner,
    };
  });

  const early = result.early.articulation;
  const later = result.later.articulation;
  expect(pageErrors).toEqual([]);
  expect(early).toMatchObject({
    active: true,
    mode: "burrow",
    rootYaw: 0,
    rigidRootYawDuringLocomotion: false,
    segmentCount: 10,
  });
  expect(early.segments).toHaveLength(10);
  expect(early.independentSectionCount).toBeGreaterThanOrEqual(6);
  expect(early.maxCenterlineDeviation).toBeGreaterThan(2.5);
  expect(early.maxNeighborYawDelta).toBeGreaterThan(0.025);
  expect(later.rootYaw).toBeCloseTo(0, 5);
  const headMotion = {
    x: later.head.x - early.head.x,
    z: later.head.z - early.head.z,
  };
  const tailMotion = {
    x: later.segments[9].x - early.segments[9].x,
    z: later.segments[9].z - early.segments[9].z,
  };
  expect(Math.hypot(headMotion.x, headMotion.z)).toBeGreaterThan(1);
  expect(Math.hypot(
    headMotion.x - tailMotion.x,
    headMotion.z - tailMotion.z
  )).toBeGreaterThan(0.25);
  const recoveryDiscontinuity = Math.max(
    Math.hypot(
      result.recoveryStart.articulation.head.x -
        result.beforeRecovery.articulation.head.x,
      result.recoveryStart.articulation.head.z -
        result.beforeRecovery.articulation.head.z
    ),
    ...result.recoveryStart.articulation.segments.map((segment, index) =>
      Math.hypot(
        segment.x -
          result.beforeRecovery.articulation.segments[index].x,
        segment.z -
          result.beforeRecovery.articulation.segments[index].z
      )
    )
  );
  expect(recoveryDiscontinuity).toBeLessThan(0.015);
  expect(result.corner.zigzag.turning).toBe(false);
  expect(result.corner.zigzag.segmentIndex).toBe(1);
  expect(result.corner.articulation).toMatchObject({
    active: true,
    mode: "zigzag",
    rootYaw: 0,
    segmentCount: 10,
  });
  expect(result.corner.articulation.maxCenterlineDeviation).toBeGreaterThan(8);
  expect(result.corner.articulation.maxNeighborYawDelta).toBeGreaterThan(0.2);
  expect(result.corner.articulation.maxNeighborYawDelta).toBeLessThanOrEqual(0.381);
  expect(result.corner.articulation.independentSectionCount).toBeGreaterThan(0);
});

test("visible body and tail contacts damage, repel, and remain solid", async ({ page }) => {
  await startHunt(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const playerRadius = 0.72;
    const position = () => game.getPlayerPosition();
    const health = () => game.getPlayerHealth();
    const displacement = (left, right) => Math.hypot(
      right.x - left.x,
      right.z - left.z
    );
    const pickNode = (diagnostics, predicate) => (
      diagnostics.collision.body.nodes
        .filter((node) => node.radius > 0.2)
        .filter(predicate)
        .sort((left, right) =>
          Math.hypot(left.x, left.z) - Math.hypot(right.x, right.z)
        )[0]
    );

    game.clearEnemies();
    game.setPlayerMaxHp(10000, 10000);
    const burrowOpening = game.forceLandEaterAction("burrow", {
      route: [
        { x: -24, z: 20 },
        { x: 36, z: 20 },
      ],
      targetPlayerId: "local",
    });
    const burrowTravelDuration =
      burrowOpening.actionDuration - 1.05 - 0.9;
    const emergedBurrow = game.seekLandEaterAction(
      (burrowTravelDuration + 1.05 * 0.86) /
        burrowOpening.actionDuration
    );
    const burrowTail = pickNode(
      emergedBurrow,
      (node) => node.tail &&
        Math.abs(node.x) < 210 &&
        Math.abs(node.z) < 180
    );
    game.setPlayerPosition(burrowTail.x, burrowTail.z);
    const burrowBeforePosition = position();
    const burrowBeforeHealth = health();
    const burrowAfter = game.stepLandEater(1 / 60);
    const burrowAfterPosition = position();
    const burrowAfterHealth = health();

    game.setPlayerMaxHp(10000, 10000);
    const recoveryOpening = game.forceLandEaterAction("recovery", {
      duration: 1,
    });
    const recoveryTail = pickNode(
      recoveryOpening,
      (node) => node.tail &&
        Math.abs(node.x) < 210 &&
        Math.abs(node.z) < 180
    );
    game.setPlayerPosition(recoveryTail.x, recoveryTail.z);
    const recoveryBeforePosition = position();
    const recoveryBeforeHealth = health();
    const recoveryAfter = game.stepLandEater(1 / 60);
    const recoveryAfterPosition = position();
    const recoveryAfterHealth = health();

    game.setPlayerMaxHp(10000, 10000);
    const grid = game.getLandEaterDiagnostics().grid;
    const targetCellId = Math.floor(grid.columns / 2);
    const devourOpening = game.forceLandEaterAction("devour", {
      targetCellId,
    });
    const devourEmergenceTime =
      devourOpening.devour.tunnelDuration +
      (
        devourOpening.warningDuration -
        devourOpening.devour.tunnelDuration
      ) * 0.84;
    const emergedDevour = game.seekLandEaterAction(
      devourEmergenceTime / devourOpening.actionDuration
    );
    const devourBodyNode = pickNode(
      emergedDevour,
      (node) => node.role.startsWith("body-") &&
        Math.abs(node.x) < 210 &&
        Math.abs(node.z) < 180
    );
    game.setPlayerPosition(devourBodyNode.x, devourBodyNode.z);
    const devourBeforePosition = position();
    const devourBeforeHealth = health();
    const devourDamageEventsBefore =
      emergedDevour.collision.body.damageEvents;
    const devourAfter = game.stepLandEater(1 / 60);
    const devourAfterPosition = position();
    const devourAfterHealth = health();

    return {
      playerRadius,
      burrowTail,
      burrowBeforeHealth,
      burrowAfterHealth,
      burrowDisplacement: displacement(
        burrowBeforePosition,
        burrowAfterPosition
      ),
      burrowCollision: burrowAfter.collision.body,
      recoveryTail,
      recoveryDisplacement: displacement(
        recoveryBeforePosition,
        recoveryAfterPosition
      ),
      recoveryBeforeHealth,
      recoveryHealth: recoveryAfterHealth,
      recoveryCollision: recoveryAfter.collision.body,
      devourBodyNode,
      devourBeforeHealth,
      devourAfterHealth,
      devourDisplacement: displacement(
        devourBeforePosition,
        devourAfterPosition
      ),
      devourDamageEventsBefore,
      devourCollision: devourAfter.collision.body,
    };
  });

  expect(result.burrowTail).toBeTruthy();
  expect(result.burrowCollision).toMatchObject({
    mode: "burrow",
    solidTail: true,
    damageOnContact: true,
    authoritativeDamage: true,
    lastTailContact: true,
    lastNodeRole: expect.stringMatching(/^tail/),
  });
  expect(result.burrowAfterHealth.hp)
    .toBeLessThan(result.burrowBeforeHealth.hp);
  expect(result.burrowBeforeHealth.hp - result.burrowAfterHealth.hp)
    .toBeGreaterThanOrEqual(2000);
  expect(result.burrowAfterHealth.hp).toBeGreaterThan(0);
  expect(result.burrowDisplacement).toBeGreaterThan(4.8);

  expect(result.recoveryTail).toBeTruthy();
  expect(result.recoveryCollision).toMatchObject({
    mode: "recovery",
    solidTail: true,
    damageOnContact: true,
    lastTailContact: true,
    lastNodeRole: expect.stringMatching(/^tail/),
    damageRatio: 0.2,
    minimumDamage: 18,
    knockbackDistance: 5.4,
  });
  expect(result.recoveryHealth.hp)
    .toBeLessThan(result.recoveryBeforeHealth.hp);
  expect(result.recoveryBeforeHealth.hp - result.recoveryHealth.hp)
    .toBeGreaterThanOrEqual(2000);
  expect(result.recoveryDisplacement).toBeGreaterThan(4.8);

  expect(result.devourBodyNode).toBeTruthy();
  expect(result.devourCollision).toMatchObject({
    mode: "devour",
    damageOnContact: true,
    authoritativeDamage: true,
    lastNodeRole: expect.stringMatching(/^body-/),
  });
  expect(result.devourAfterHealth.hp)
    .toBeLessThan(result.devourBeforeHealth.hp);
  expect(result.devourBeforeHealth.hp - result.devourAfterHealth.hp)
    .toBeGreaterThanOrEqual(2000);
  expect(result.devourAfterHealth.hp).toBeGreaterThan(0);
  expect(result.devourDisplacement).toBeGreaterThan(4.8);
  expect(result.devourCollision.damageEvents)
    .toBeGreaterThan(result.devourDamageEventsBefore);
});

test("ricochet orientation propagates smoothly from the head into the body", async ({ page }) => {
  await startHunt(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const angleDelta = (from, to) => Math.atan2(
      Math.sin(to - from),
      Math.cos(to - from)
    );
    game.setPlayerPosition(0, 180);
    game.forceLandEaterAction("zigzag", {
      route: [
        { x: -72, z: -34 },
        { x: 72, z: -22 },
        { x: -72, z: -8 },
        { x: 72, z: 8 },
      ],
    });
    const samples = [];
    let sawTurn = false;
    for (let frame = 0; frame < 360; frame += 1) {
      game.stepLandEater(1 / 60);
      const diagnostics = game.getLandEaterDiagnostics();
      if (diagnostics.zigzag.turning) {
        sawTurn = true;
        samples.push({
          progress: diagnostics.zigzag.turnProgress,
          headX: diagnostics.articulation.head.x,
          headZ: diagnostics.articulation.head.z,
          headAngle: diagnostics.articulation.head.angle,
          segmentAngles: diagnostics.articulation.segments.map(
            (segment) => segment.angle
          ),
          segmentPositions: diagnostics.articulation.segments.map(
            (segment) => ({ x: segment.x, z: segment.z })
          ),
          maxNeighborYawDelta:
            diagnostics.articulation.maxNeighborYawDelta,
        });
      } else if (
        sawTurn &&
        diagnostics.zigzag.segmentIndex >= 1
      ) {
        break;
      }
    }
    const first = samples[0];
    const middle = samples.reduce((best, sample) => (
      Math.abs(sample.progress - 0.5) <
      Math.abs(best.progress - 0.5)
        ? sample
        : best
    ), first);
    let maximumHeadStep = 0;
    let maximumTailStep = 0;
    let maximumTailStepDetails = null;
    for (let index = 1; index < samples.length; index += 1) {
      maximumHeadStep = Math.max(
        maximumHeadStep,
        Math.abs(angleDelta(
          samples[index - 1].headAngle,
          samples[index].headAngle
        ))
      );
      const tailStep = Math.abs(angleDelta(
        samples[index - 1].segmentAngles[9],
        samples[index].segmentAngles[9]
      ));
      if (tailStep > maximumTailStep) {
        maximumTailStep = tailStep;
        maximumTailStepDetails = {
          previousProgress: samples[index - 1].progress,
          progress: samples[index].progress,
          previousAngle: samples[index - 1].segmentAngles[9],
          angle: samples[index].segmentAngles[9],
          previousHeadAngle: samples[index - 1].headAngle,
          headAngle: samples[index].headAngle,
          previousSegmentAngles: samples[index - 1].segmentAngles,
          segmentAngles: samples[index].segmentAngles,
        };
      }
    }
    const headTurn = Math.abs(angleDelta(
      first.headAngle,
      middle.headAngle
    ));
    const frontTurn = [0, 1, 2].reduce(
      (sum, index) => sum + Math.abs(angleDelta(
        first.segmentAngles[index],
        middle.segmentAngles[index]
      )),
      0
    ) / 3;
    const rearTurn = [7, 8, 9].reduce(
      (sum, index) => sum + Math.abs(angleDelta(
        first.segmentAngles[index],
        middle.segmentAngles[index]
      )),
      0
    ) / 3;
    const maximumHeadTranslation = Math.max(
      ...samples.map((sample) => Math.hypot(
        sample.headX - first.headX,
        sample.headZ - first.headZ
      ))
    );
    const maximumTailTranslation = Math.max(
      ...samples.map((sample) => Math.hypot(
        sample.segmentPositions[9].x -
          first.segmentPositions[9].x,
        sample.segmentPositions[9].z -
          first.segmentPositions[9].z
      ))
    );
    return {
      sampleCount: samples.length,
      maximumHeadStep,
      maximumTailStep,
      maximumTailStepDetails,
      maximumJointBend: Math.max(
        ...samples.map((sample) => sample.maxNeighborYawDelta)
      ),
      headTurn,
      frontTurn,
      rearTurn,
      maximumHeadTranslation,
      maximumTailTranslation,
    };
  });

  expect(result.sampleCount).toBeGreaterThan(20);
  expect(result.maximumHeadStep).toBeLessThanOrEqual(0.105);
  expect(
    result.maximumTailStep,
    JSON.stringify(result.maximumTailStepDetails)
  ).toBeLessThanOrEqual(0.105);
  expect(result.maximumJointBend).toBeLessThanOrEqual(0.381);
  expect(result.headTurn).toBeGreaterThan(0.7);
  expect(result.frontTurn).toBeGreaterThan(result.rearTurn + 0.25);
  expect(result.maximumHeadTranslation).toBeLessThan(4);
  expect(result.maximumTailTranslation)
    .toBeLessThan(result.maximumHeadTranslation - 0.25);
});
