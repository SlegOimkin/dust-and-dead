const path = require("node:path");
const { expect, test } = require("@playwright/test");

function fileUrl(relativePath) {
  const absolute = path.resolve(__dirname, "..", relativePath).replace(/\\/g, "/");
  return `file:///${absolute}`;
}

async function startHunt(page) {
  await page.goto(`${fileUrl("index.html")}?mapSeed=7`);
  const intro = page.locator("#intro-screen");
  if (await intro.isVisible().catch(() => false)) await page.keyboard.press("KeyM");
  await page.getByRole("button", { name: "Start Hunt" }).click();
  await page.waitForFunction(() => window.__dustAndDeadTest && window.render_game_to_text);
}

test("miner and preacher unlock on their requested waves and scale with the player roster", async ({ page }) => {
  await startHunt(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    return {
      wave3: game.getEnemyArchetypeWaveQuotas(3, 1),
      wave4: game.getEnemyArchetypeWaveQuotas(4, 1),
      wave5: game.getEnemyArchetypeWaveQuotas(5, 1),
      wave6: game.getEnemyArchetypeWaveQuotas(6, 1),
      wave10: game.getEnemyArchetypeWaveQuotas(10, 1),
      wave11: game.getEnemyArchetypeWaveQuotas(11, 1),
      wave11Players: [1, 2, 3, 4].map((players) => game.getEnemyArchetypeWaveQuotas(11, players)),
      sample3: game.sampleZombieTypes(3, 100),
      sample4: game.sampleZombieTypes(4, 100),
      sample5: game.sampleZombieTypes(5, 100),
      sample6: game.sampleZombieTypes(6, 100),
      sample10: game.sampleZombieTypes(10, 100),
      sample11: game.sampleZombieTypes(11, 100),
    };
  });

  expect(result.wave3).toEqual({ armoredMiner: 0, gravePreacher: 0 });
  expect(result.wave4).toEqual({ armoredMiner: 3, gravePreacher: 0 });
  expect(result.wave6).toEqual({ armoredMiner: 3, gravePreacher: 0 });
  expect(result.wave10.gravePreacher).toBe(0);
  expect(result.wave11).toEqual({ armoredMiner: 5, gravePreacher: 1 });
  expect(result.wave11Players).toEqual([
    { armoredMiner: 5, gravePreacher: 1 },
    { armoredMiner: 9, gravePreacher: 2 },
    { armoredMiner: 12, gravePreacher: 2 },
    { armoredMiner: 16, gravePreacher: 3 },
  ]);
  expect(result.sample3.armoredMiner || 0).toBe(0);
  expect(result.sample4.armoredMiner).toBe(3);
  expect(result.sample10.gravePreacher || 0).toBe(0);
  expect(result.sample11.gravePreacher).toBe(1);
});

test("miner armor and preacher resurrection animate correctly and reset through pools", async ({ page }) => {
  const browserErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));
  await startHunt(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    game.clearEnemies();
    const state = JSON.parse(window.render_game_to_text());
    const { x, z } = state.player;
    const miner = game.spawnZombieAt("armoredMiner", x - 5, z + 7);
    const preacher = game.spawnZombieAt("gravePreacher", x + 5, z + 7);
    const modelStats = { miner, preacher };
    let maximumBookGripError = 0;
    let maximumCrossGripError = 0;
    for (let frame = 0; frame < 120; frame += 1) {
      window.advanceTime(25);
      const animatedPreacher = game.getEnemyArchetypeDiagnostics().enemies.find((enemy) => enemy.type === "gravePreacher");
      maximumBookGripError = Math.max(maximumBookGripError, animatedPreacher.attachments.bookGripError);
      maximumCrossGripError = Math.max(maximumCrossGripError, animatedPreacher.attachments.crossGripError);
    }
    const attachmentDiagnostics = game.getEnemyArchetypeDiagnostics().enemies
      .filter((enemy) => ["armoredMiner", "gravePreacher"].includes(enemy.type));
    const animationOptimization = game.getZombieOptimizationStats();
    const minerState = game.getEnemyArchetypeDiagnostics().enemies.find((enemy) => enemy.type === "armoredMiner");
    game.setEnemyHp(miner.groupId, minerState.maxHp * 0.32);
    const damagedMiner = game.getEnemyArchetypeDiagnostics().enemies.find((enemy) => enemy.type === "armoredMiner");
    const armorDebris = game.getThreeObjectDiagnostics().state.debris;

    game.clearEnemies();
    game.spawnZombieAt("walker", x - 1.2, z + 5);
    game.spawnZombieAt("brute", x + 1.2, z + 5);
    game.killNearestZombie();
    game.killNearestZombie();
    game.spawnZombieAt("gravePreacher", x, z + 6);
    const ritual = game.triggerGravePreacher();
    window.advanceTime(1700);
    const afterRitual = game.getEnemyArchetypeDiagnostics();
    game.clearEnemies();
    const pools = game.getZombieOptimizationStats().pools;
    return { modelStats, attachmentDiagnostics, maximumBookGripError, maximumCrossGripError, animationOptimization, damagedMiner, armorDebris, ritual, afterRitual, pools };
  });

  expect(result.modelStats.miner.type).toBe("armoredMiner");
  expect(result.modelStats.preacher.type).toBe("gravePreacher");
  expect(result.modelStats.miner.visualParts).toBeGreaterThan(15);
  expect(result.modelStats.preacher.visualParts).toBeGreaterThan(20);
  const minerAttachments = result.attachmentDiagnostics.find((enemy) => enemy.type === "armoredMiner").attachments;
  const preacherAttachments = result.attachmentDiagnostics.find((enemy) => enemy.type === "gravePreacher").attachments;
  expect(minerAttachments.helmetDome).toBe(true);
  expect(result.damagedMiner.attachments.armorDetachedPieces).toBe(3);
  expect(result.armorDebris).toBeGreaterThanOrEqual(3);
  expect(preacherAttachments).toMatchObject({
    bookParentedToGrip: true,
    bookGripError: 0,
    crossParentedToGrip: true,
    crossGripError: 0,
  });
  expect(result.maximumBookGripError).toBe(0);
  expect(result.maximumCrossGripError).toBe(0);
  expect(result.animationOptimization.instances.invalidMatrices).toBe(0);
  expect(result.ritual).toMatchObject({ started: true, reserved: 2 });
  expect(result.afterRitual.enemies.filter((enemy) => enemy.resurrected)).toHaveLength(2);
  expect(result.afterRitual.enemies.find((enemy) => enemy.type === "gravePreacher").preacherRaises).toBe(2);
  expect(result.pools.armoredMiner.inUse).toBe(0);
  expect(result.pools.gravePreacher.inUse).toBe(0);
  expect(browserErrors).toEqual([]);
});

test("all seven animated enemy models remain valid under instanced rendering", async ({ page }) => {
  await startHunt(page);
  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    game.clearEnemies();
    const stress = window.__dustMultiplayerTest.spawnEnemyStressField(192, "allTypes");
    window.advanceTime(34);
    return { stress, optimization: game.getZombieOptimizationStats() };
  });

  expect(result.stress.added).toBe(192);
  expect(result.optimization.instances.active).toBe(true);
  expect(result.optimization.instances.invalidMatrices).toBe(0);
  expect(result.optimization.instances.drawnParts).toBeGreaterThan(192);
  expect(result.optimization.instances.drawCalls).toBeLessThan(150);
});

test("prewarmed instancing enters early and stays active through the late-wave draw-call cliff", async ({ page }) => {
  await startHunt(page);
  // Production deliberately refuses heavyweight allocation while a combat
  // wave is populated. Park the bootstrap wave so this audit uses the same
  // safe inter-wave window as the runtime scheduler.
  await page.evaluate(() => window.__dustAndDeadTest.clearEnemies());
  await expect.poll(async () => page.evaluate(() => {
    const prewarm = window.__dustAndDeadTest?.getZombieOptimizationStats().instances.prewarm;
    return prewarm ? {
      complete: prewarm.complete,
      cpuComplete: prewarm.cpu?.complete,
      gpuComplete: prewarm.gpu?.complete,
      createdChunks: prewarm.cpu?.createdChunks,
      readyChunks: prewarm.gpu?.readyChunks,
      failedChunks: prewarm.gpu?.failedChunks,
      error: prewarm.gpu?.error,
    } : null;
  }), {
    timeout: 60_000,
    intervals: [250],
    message: "zombie instance prewarm should finish before the late-wave threshold",
  }).toMatchObject({
    complete: true,
    cpuComplete: true,
    gpuComplete: true,
    failedChunks: 0,
  });

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const multiplayer = window.__dustMultiplayerTest;
    game.clearEnemies();
    const warmed = game.getZombieOptimizationStats().instances;
    multiplayer.spawnEnemyStressField(47, "allTypes");
    window.advanceTime(34);
    const belowThreshold = game.getZombieOptimizationStats().instances;
    multiplayer.spawnEnemyStressField(1, "allTypes");
    window.advanceTime(34);
    const activated = game.getZombieOptimizationStats().instances;
    for (let index = 0; index < 20; index += 1) game.killNearestZombie();
    window.advanceTime(34);
    const retained = game.getZombieOptimizationStats().instances;
    for (let index = 0; index < 5; index += 1) game.killNearestZombie();
    window.advanceTime(34);
    const released = game.getZombieOptimizationStats().instances;
    return { warmed, belowThreshold, activated, retained, released };
  });

  expect(result.warmed.prewarm.complete).toBe(true);
  expect(result.belowThreshold.threshold).toBe(48);
  expect(result.belowThreshold.releaseThreshold).toBe(24);
  expect(result.belowThreshold.active).toBe(false);
  expect(result.activated.active).toBe(true);
  expect(result.activated.chunks).toBe(result.warmed.chunks);
  expect(result.activated.batchKeyBuilds).toBe(result.warmed.batchKeyBuilds);
  expect(result.activated.drawnParts).toBeGreaterThan(48);
  expect(result.activated.invalidMatrices).toBe(0);
  expect(result.retained.active).toBe(true);
  expect(result.retained.handoff).toMatchObject({ emptyFrame: false, doubleFrame: false });
  expect(result.released.active).toBe(false);
  expect(result.released.handoff).toMatchObject({ emptyFrame: false, doubleFrame: false });
});

test("a 159-enemy late-wave snapshot stays batched on both the host and the guest", async ({ page }) => {
  await startHunt(page);
  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const multiplayer = window.__dustMultiplayerTest;
    const started = multiplayer.startMockHost(["Host", "Guest"]);
    multiplayer.setPlayerPosition("mock-player-2", started.players[0].x, started.players[0].z);
    game.clearEnemies();
    multiplayer.spawnEnemyStressField(159, "allTypes");
    window.advanceTime(34);
    const host = game.getZombieOptimizationStats().instances;
    const wires = [];
    for (let guard = 0; guard < 12; guard += 1) {
      const wire = JSON.parse(JSON.stringify(
        multiplayer.buildWireSnapshot(false, false, "mock-player-2")
      ));
      wires.push(wire);
      multiplayer.acknowledgeClientState(
        "mock-player-2",
        wire.sequence,
        (wire.combatEvents || []).reduce(
          (highest, event) => Math.max(highest, Number(event.sequence) || 0),
          0
        ),
        false
      );
      const backlog = multiplayer.getReplicationBacklogDiagnostics("mock-player-2");
      if (!backlog.keyframeActive && backlog.enemyOps === 0 && backlog.sentEnemyFrames === 0) break;
    }

    multiplayer.startMockGuest(["Host", "Guest"], 1);
    for (const wire of wires) multiplayer.applySnapshot(wire);
    window.advanceTime(34);
    const guest = game.getZombieOptimizationStats().instances;
    const guestEnemies = multiplayer.getGuestEnemyDiagnostics();
    return { host, guest, guestEnemyCount: guestEnemies.length };
  });

  expect(result.host).toMatchObject({
    active: true,
    threshold: 48,
    releaseThreshold: 24,
    invalidMatrices: 0,
  });
  expect(result.host.drawCalls).toBeLessThan(150);
  expect(result.host.handoff).toMatchObject({ emptyFrame: false, doubleFrame: false });
  expect(result.guestEnemyCount).toBe(159);
  expect(result.guest).toMatchObject({ active: true, invalidMatrices: 0 });
  expect(result.guest.drawCalls).toBeLessThan(150);
  expect(result.guest.handoff).toMatchObject({ emptyFrame: false, doubleFrame: false });
});

test("host-authoritative preacher raises uniquely identified enemies that replicate to a guest", async ({ page }) => {
  await startHunt(page);
  const host = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const multiplayer = window.__dustMultiplayerTest;
    multiplayer.startMockHost(["Host", "Guest", "Rider", "Scout"]);
    game.clearEnemies();
    const local = multiplayer.getState().players.find((player) => player.id === "mock-player-1");
    multiplayer.setPlayerPosition("mock-player-2", local.x, local.z);
    multiplayer.spawnEnemyAt(local.x - 1, local.z + 5, "walker", 2);
    multiplayer.spawnEnemyAt(local.x + 1, local.z + 5, "armoredMiner", 9);
    game.killNearestZombie();
    game.killNearestZombie();
    multiplayer.spawnEnemyAt(local.x, local.z + 6, "gravePreacher", 7);
    const ritual = game.triggerGravePreacher();
    window.advanceTime(1700);
    const authoritative = multiplayer.getAuthoritativeEnemies();
    const resurrected = game.getEnemyArchetypeDiagnostics().enemies.filter((enemy) => enemy.resurrected);
    const source = multiplayer.buildSnapshot(false, false, "mock-player-2");
    const wire = JSON.parse(JSON.stringify(multiplayer.buildWireSnapshot(false, false, "mock-player-2")));
    return { ritual, authoritative, resurrected, sourceEnemyIds: source.enemies.map((enemy) => enemy.id), wire };
  });

  expect(host.ritual).toMatchObject({ started: true, reserved: 2 });
  expect(host.resurrected).toHaveLength(2);
  const resurrectedIds = host.authoritative
    .filter((enemy) => host.resurrected.some((entry) => entry.type === enemy.type) && enemy.type !== "gravePreacher")
    .map((enemy) => enemy.id);
  expect(resurrectedIds).toHaveLength(2);
  expect(resurrectedIds.every((id) => id > 0)).toBe(true);
  expect(new Set(resurrectedIds).size).toBe(2);

  const guest = await page.evaluate((wire) => {
    const multiplayer = window.__dustMultiplayerTest;
    multiplayer.startMockGuest(["Host", "Guest", "Rider", "Scout"], 1);
    multiplayer.applySnapshot(wire);
    return multiplayer.getGuestEnemyDiagnostics();
  }, host.wire);
  const guestIds = new Set(guest.map((enemy) => enemy.id));
  expect(
    resurrectedIds.every((id) => guestIds.has(id)),
    JSON.stringify({ resurrectedIds, sourceEnemyIds: host.sourceEnemyIds, guest }, null, 2)
  ).toBe(true);
  expect(guest.some((enemy) => enemy.type === "gravePreacher")).toBe(true);
});
