const path = require("node:path");
const { expect, test } = require("@playwright/test");

test.setTimeout(120_000);

function fileUrl(relativePath) {
  const absolute = path.resolve(__dirname, "..", relativePath).replace(/\\/g, "/");
  return `file:///${absolute}`;
}

async function openGame(page, query = "") {
  const suffix = query ? `&${query}` : "";
  await page.goto(`${fileUrl("index.html")}?mapSeed=7331${suffix}`);
  const intro = page.locator("#intro-screen");
  if (await intro.isVisible().catch(() => false)) {
    await page.keyboard.press("KeyM");
    await expect(intro).toBeHidden();
  }
  await page.waitForFunction(() => Boolean(
    window.__dustAndDeadTest?.compareRifleTrapCandidateCollectors &&
    window.__dustAndDeadTest?.getFirePatchVisualAssignments &&
    window.__dustMultiplayerTest?.compareEnemyRelevanceSelectors
  ));
}

test("trap broadphase keeps the exact legacy candidate set and the post-movement trigger", async ({ page }) => {
  await openGame(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const multiplayer = window.__dustMultiplayerTest;
    const started = multiplayer.startMockHost(["Rifle Host", "Guest"]);
    const host = started.players[0];

    multiplayer.setPlayerPosition("mock-player-1", host.x + 10, host.z);
    const trap = game.spawnRifleTrapAt(host.x, host.z);
    window.advanceTime(200);
    const enemy = multiplayer.spawnEnemyAt(host.x - 8, host.z, "walker", 20);
    const triggerDistance = 0.85 + enemy.radius;
    multiplayer.setEnemyPosition(enemy.id, trap.x - triggerDistance - 0.001, trap.z);

    const before = JSON.parse(window.render_game_to_text());
    const enemyBefore = multiplayer.getAuthoritativeEnemies().find((entry) => entry.id === enemy.id);
    const parityBefore = game.compareRifleTrapCandidateCollectors();
    window.advanceTime(17);
    const after = JSON.parse(window.render_game_to_text());
    const parityAfter = game.compareRifleTrapCandidateCollectors();
    const wire = multiplayer.buildWireSnapshot(false, false, "mock-player-2");
    const triggerEvents = (wire.combatEvents || []).filter((event) => event.type === "rifleTrapTrigger");
    game.clearRifleTraps();
    multiplayer.spawnEnemyStressField(673, "arena");
    const fullScansBeforeStress = game.getRifleTrapOptimizationStats().candidates.fullEnemyScans;
    game.spawnRifleTrapAt(host.x, host.z);
    window.advanceTime(17);
    const optimization = game.getRifleTrapOptimizationStats();

    return {
      parityBefore,
      parityAfter,
      beforeTraps: before.progression.rifleSpecial.activeTraps,
      afterTraps: after.progression.rifleSpecial.activeTraps,
      beforeTriggers: before.progression.rifleSpecial.trapTriggers,
      afterTriggers: after.progression.rifleSpecial.trapTriggers,
      enemyBefore,
      enemyAfter: multiplayer.getAuthoritativeEnemies().find((entry) => entry.id === enemy.id),
      triggerEventCount: triggerEvents.length,
      optimization,
      stressFullScanDelta: optimization.candidates.fullEnemyScans - fullScansBeforeStress,
    };
  });

  expect(result.parityBefore).toMatchObject({ matches: true, missingFromSpatial: [], extraInSpatial: [] });
  expect(result.parityAfter).toMatchObject({ matches: true, missingFromSpatial: [], extraInSpatial: [] });
  expect(result.beforeTraps).toBe(1);
  expect(result.afterTraps, JSON.stringify(result)).toBe(0);
  expect(result.afterTriggers - result.beforeTriggers).toBe(1);
  expect(result.enemyAfter.hp).toBeLessThan(20);
  expect(result.triggerEventCount).toBe(1);
  expect(result.stressFullScanDelta).toBe(0);
});

test("replacing the 240th visible trap reuses an instanced slot without a five-call fallback", async ({ page }) => {
  await openGame(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const multiplayer = window.__dustMultiplayerTest;
    const started = multiplayer.startMockHost(["Rifle Host", "Guest"]);
    const host = started.players[0];
    let spawned = 0;
    for (let index = 0; index < 241; index += 1) {
      if (game.spawnRifleTrapAt(host.x, host.z)) spawned += 1;
    }
    return { spawned, stats: game.getRifleTrapOptimizationStats() };
  });

  expect(result.spawned).toBe(241);
  expect(result.stats.activeTraps).toBe(240);
  expect(result.stats.visuals).toMatchObject({
    instanced: true,
    inUse: 240,
    fallbackInUse: 0,
    drawCalls: 3,
  });
});

test("fire detail membership does not thrash when two boundary patches trade a few centimeters", async ({ page }) => {
  await openGame(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const multiplayer = window.__dustMultiplayerTest;
    const started = multiplayer.startMockHost(["Pyro", "Guest"]);
    const host = started.players[0];
    multiplayer.setPlayerPosition("mock-player-1", host.x, host.z);

    for (let index = 0; index < 99; index += 1) {
      const angle = index * 2.399963;
      const distance = 0.8 + (index % 11) * 0.22;
      multiplayer.spawnFirePatch("mock-player-1", {
        x: host.x + Math.cos(angle) * distance,
        z: host.z + Math.sin(angle) * distance,
        radius: 0.7,
        life: 30,
        type: "standard",
      });
    }
    multiplayer.spawnFirePatch("mock-player-1", {
      x: host.x - 8,
      z: host.z,
      radius: 0.7,
      life: 30,
      type: "standard",
    });
    multiplayer.spawnFirePatch("mock-player-1", {
      x: host.x + 8,
      z: host.z,
      radius: 0.7,
      life: 30,
      type: "standard",
    });
    window.advanceTime(150);

    const initialAssignments = game.getFirePatchVisualAssignments();
    const initialStats = game.getFireOptimizationStats().visuals;
    const initialDetailed = initialAssignments.filter((patch) => patch.detailed).map((patch) => patch.id).sort((a, b) => a - b);
    for (let cycle = 0; cycle < 20; cycle += 1) {
      multiplayer.setPlayerPosition("mock-player-1", host.x + (cycle % 2 ? -0.08 : 0.08), host.z);
      window.advanceTime(130);
    }
    const settledAssignments = game.getFirePatchVisualAssignments();
    const settledStats = game.getFireOptimizationStats().visuals;
    const settledDetailed = settledAssignments.filter((patch) => patch.detailed).map((patch) => patch.id).sort((a, b) => a - b);
    return { initialAssignments, settledAssignments, initialStats, settledStats, initialDetailed, settledDetailed };
  });

  expect(result.initialAssignments).toHaveLength(101);
  expect(result.settledAssignments).toHaveLength(101);
  expect(result.initialDetailed).toEqual(result.settledDetailed);
  expect(result.settledStats.activeDetailed).toBe(100);
  expect(result.settledStats.fallbackVisible).toBe(1);
  expect(result.settledStats.gpu.rebuilds - result.initialStats.gpu.rebuilds).toBe(0);
  expect(result.settledStats.fallbackRebuilds - result.initialStats.fallbackRebuilds).toBe(0);
  expect(result.settledAssignments.every((patch) => patch.detailed || patch.fallback)).toBe(true);
});

test("spatial enemy relevance is order-identical to the linear selector and preserves wire bytes", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const linearPage = await context.newPage();
  const hybridPage = await context.newPage();
  await openGame(linearPage, "enemyRelevance=linear");
  await openGame(hybridPage, "enemyRelevance=hybrid");

  async function run(page) {
    return page.evaluate(() => {
      const multiplayer = window.__dustMultiplayerTest;
      const started = multiplayer.startMockHost(["Host", "Guest A", "Guest B", "Guest C"]);
      multiplayer.setPlayerPosition("mock-player-2", started.players[0].x + 70, started.players[0].z + 25);
      multiplayer.setPlayerPosition("mock-player-3", started.players[0].x - 65, started.players[0].z - 30);
      multiplayer.setPlayerPosition("mock-player-4", started.players[0].x + 12, started.players[0].z - 72);
      multiplayer.spawnEnemyStressField(1330, "arena");

      const parity = ["mock-player-2", "mock-player-3", "mock-player-4"].map((id) => (
        multiplayer.compareEnemyRelevanceSelectors(id)
      ));
      const snapshots = ["mock-player-2", "mock-player-3", "mock-player-4"].map((id) => (
        multiplayer.buildWireSnapshot(false, false, id)
      ));
      return {
        parity,
        snapshots: snapshots.map((snapshot) => JSON.stringify(snapshot)),
        diagnostics: multiplayer.getNetworkBudgetDiagnostics(),
      };
    });
  }

  const linear = await run(linearPage);
  const hybrid = await run(hybridPage);
  for (const parity of hybrid.parity) {
    expect(parity.matches).toBe(true);
    expect(parity.linearIds).toEqual(parity.spatialIds);
    expect(parity.activeIdCacheMatches).toBe(true);
  }
  expect(hybrid.snapshots).toEqual(linear.snapshots);
  expect(hybrid.diagnostics.enemyRelevance.activeIdCacheMismatches).toBe(0);

  await context.close();
});

test("late-wave optimization profiles keep parity in the rifle-host and distributed-client cases", async ({ page }) => {
  await openGame(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const multiplayer = window.__dustMultiplayerTest;
    const started = multiplayer.startMockHost(["Rifle Host", "Guest A", "Guest B", "Guest C"]);
    multiplayer.setProgression("mock-player-1", {
      playerClass: "ranger",
      weapon: "rifle",
      rifleUpgrade: "trailWarden",
      upgradeCounts: { baitedTrap: 1, trailLayer: 1 },
    });
    multiplayer.setPlayerPosition("mock-player-2", started.players[0].x + 70, started.players[0].z + 25);
    multiplayer.setPlayerPosition("mock-player-3", started.players[0].x - 65, started.players[0].z - 30);
    multiplayer.setPlayerPosition("mock-player-4", started.players[0].x + 12, started.players[0].z - 72);
    multiplayer.spawnEnemyStressField(1330, "arena");

    game.spawnRifleTrapAt(started.players[0].x, started.players[0].z);
    const oneTrap = game.profileRifleTrapCandidateCollectors(120);
    game.clearRifleTraps();
    let farTrap = null;
    for (const [x, z] of [[180, 150], [-180, 150], [180, -150], [-180, -150], [140, 130]]) {
      farTrap = game.spawnRifleTrapAt(x, z);
      if (farTrap) break;
    }
    for (let index = 1; farTrap && index < 240; index += 1) game.spawnRifleTrapAt(farTrap.x, farTrap.z);
    const maxTraps = game.profileRifleTrapCandidateCollectors(40);
    const network = multiplayer.profileEnemyRelevanceSelectors(
      ["mock-player-2", "mock-player-3", "mock-player-4"],
      120
    );
    const reset = multiplayer.startMockHost(["Rifle Host", "Guest"]);
    multiplayer.setProgression("mock-player-1", {
      playerClass: "ranger",
      weapon: "rifle",
      rifleUpgrade: "trailWarden",
      upgradeCounts: { baitedTrap: 1, trailLayer: 1 },
    });
    multiplayer.spawnEnemyStressField(673, "arena");
    let farTrap673 = null;
    for (const [x, z] of [[180, 150], [-180, 150], [180, -150], [-180, -150], [140, 130]]) {
      farTrap673 = game.spawnRifleTrapAt(x, z);
      if (farTrap673) break;
    }
    for (let index = 1; farTrap673 && index < 240; index += 1) game.spawnRifleTrapAt(farTrap673.x, farTrap673.z);
    const wave13MaxTraps = game.profileRifleTrapCandidateCollectors(60);
    multiplayer.startMockHost(["Rifle Host", "Guest"]);
    multiplayer.setProgression("mock-player-1", {
      playerClass: "ranger",
      weapon: "rifle",
      rifleUpgrade: "trailWarden",
      upgradeCounts: { baitedTrap: 1, trailLayer: 1 },
    });
    multiplayer.spawnEnemyStressField(64, "arena");
    let farTrap64 = null;
    for (const [x, z] of [[180, 150], [-180, 150], [180, -150], [-180, -150], [140, 130]]) {
      farTrap64 = game.spawnRifleTrapAt(x, z);
      if (farTrap64) break;
    }
    for (let index = 1; farTrap64 && index < 240; index += 1) game.spawnRifleTrapAt(farTrap64.x, farTrap64.z);
    const lowEnemyMaxTraps = game.profileRifleTrapCandidateCollectors(100);
    return { oneTrap, maxTraps, network, wave13MaxTraps, lowEnemyMaxTraps, resetPlayers: reset.players.length };
  });

  console.log(`late-wave-profile ${JSON.stringify(result)}`);
  expect(result.oneTrap.matches).toBe(true);
  expect(result.maxTraps.matches).toBe(true);
  expect(result.wave13MaxTraps.matches).toBe(true);
  expect(result.lowEnemyMaxTraps.matches).toBe(true);
  expect(result.network.selectedMatches).toBe(true);
  expect(result.oneTrap.spatialPerBuildMs).toBeLessThan(result.oneTrap.legacyPerBuildMs);
});
