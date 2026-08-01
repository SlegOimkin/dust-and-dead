const path = require("node:path");
const { expect, test } = require("@playwright/test");
const { decodeEnemyOpKinds } = require("./helpers/enemy-wire-decoder");

function fileUrl(relativePath) {
  const absolute = path.resolve(__dirname, "..", relativePath).replace(/\\/g, "/");
  return `file:///${absolute}`;
}

async function openGame(page) {
  await page.goto(`${fileUrl("index.html")}?mapSeed=7331`);
  const intro = page.locator("#intro-screen");
  if (await intro.isVisible().catch(() => false)) {
    await page.keyboard.press("KeyM");
    await expect(intro).toBeHidden();
  }
  await page.waitForFunction(() => Boolean(
    window.__dustMultiplayerTest?.buildWireSnapshot &&
    window.__dustMultiplayerTest?.getGuestEnemyDiagnostics &&
    window.__dustMultiplayerTest?.cycleSpectator
  ));
}

function readEnemyViewContract(wire) {
  const delta = wire?.enemyDelta || {};
  const view = wire?.enemyView || delta.enemyView || delta.view || {};
  const revision = Number(
    view.r ?? view.revision ??
    wire?.enemyViewRevision ?? wire?.viewRevision ?? wire?.scopeRevision ??
    delta.vr ?? delta.viewRevision ?? delta.scopeRevision
  );
  const targetId = String(
    view.t ?? view.targetId ?? view.targetPlayerId ??
    wire?.enemyViewTargetId ?? wire?.viewTargetId ?? wire?.scopeTargetId ??
    delta.vt ?? delta.viewTargetId ?? delta.scopeTargetId ?? ""
  );
  return { revision, targetId };
}

test("a delayed old spectator-scope delta cannot remove zombies at the newly selected target", async ({ page }) => {
  await openGame(page);

  const fixture = await page.evaluate(() => {
    const multiplayer = window.__dustMultiplayerTest;
    multiplayer.startMockHost(["Host", "Observer", "West", "East"]);
    multiplayer.setPlayerPosition("mock-player-3", -165, -110);
    multiplayer.setPlayerPosition("mock-player-4", 165, 110);
    const players = multiplayer.getState().players;
    const west = players.find((player) => player.id === "mock-player-3");
    const east = players.find((player) => player.id === "mock-player-4");
    const westEnemy = multiplayer.spawnEnemyAt(west.x + 3, west.z + 2, "walker", 20);
    const eastEnemy = multiplayer.spawnEnemyAt(east.x - 3, east.z - 2, "walker", 20);

    multiplayer.damagePlayer("mock-player-2", 999, "mock-player-1");
    multiplayer.surrender("mock-player-2");

    function acknowledge(wire) {
      const combatAck = (wire.combatEvents || []).reduce(
        (highest, event) => Math.max(highest, Number(event?.sequence) || 0),
        0
      );
      multiplayer.acknowledgeClientState("mock-player-2", wire.sequence, combatAck, false);
    }

    // First complete an East keyframe so that the guest has a cached East
    // zombie which can remain visible while cycling between targets.
    multiplayer.injectInput("mock-player-2", { sequence: 1, spectatorTargetId: "mock-player-4" });
    const eastWire = multiplayer.buildWireSnapshot(false, false, "mock-player-2");
    acknowledge(eastWire);

    // Switch the authoritative view to West and complete its keyframe. The
    // following ordinary delta now legitimately contains an interest-removal
    // for the East zombie, but it still belongs to the West view revision.
    multiplayer.injectInput("mock-player-2", { sequence: 2, spectatorTargetId: "mock-player-3" });
    const westWire = multiplayer.buildWireSnapshot(false, false, "mock-player-2");
    // Protocol 19 streams current movement/removals next to an established
    // spectator handoff keyframe. Preserve a later copy of that live section
    // as the delayed old-view packet exercised below.
    const delayedWestCleanup = multiplayer.buildWireSnapshot(false, false, "mock-player-2");
    delayedWestCleanup.enemyDelta = delayedWestCleanup.enemyLiveDelta;
    delete delayedWestCleanup.enemyLiveDelta;
    acknowledge(westWire);

    // This is the first authoritative packet for the observer's return East.
    // It must supersede, rather than visually resurrect after, the delayed West
    // cleanup packet.
    multiplayer.injectInput("mock-player-2", { sequence: 3, spectatorTargetId: "mock-player-4" });
    const eastReturnWire = multiplayer.buildWireSnapshot(false, false, "mock-player-2");

    const stateOnly = JSON.parse(JSON.stringify(eastWire));
    stateOnly.sequence = 0;
    stateOnly.combatEvents = [];
    delete stateOnly.enemyDelta;
    delete stateOnly.enemies;

    multiplayer.startMockGuest(["Host", "Observer", "West", "East"], 1);
    multiplayer.applySnapshot(stateOnly);
    multiplayer.cycleSpectator(1); // Default West -> East.
    multiplayer.applySnapshot(eastWire);
    const afterEast = multiplayer.getGuestEnemyDiagnostics().map((enemy) => enemy.id).sort((a, b) => a - b);

    multiplayer.cycleSpectator(-1); // East -> West.
    multiplayer.applySnapshot(westWire);
    const afterWest = multiplayer.getGuestEnemyDiagnostics().map((enemy) => enemy.id).sort((a, b) => a - b);

    multiplayer.cycleSpectator(1); // West -> East before the host sees it.
    const pendingBeforeDelayed = multiplayer.getSpectatorDiagnostics();
    multiplayer.applySnapshot(delayedWestCleanup);
    const afterDelayed = multiplayer.getGuestEnemyDiagnostics().map((enemy) => enemy.id).sort((a, b) => a - b);
    const pendingAfterDelayed = multiplayer.getSpectatorDiagnostics();

    multiplayer.applySnapshot(eastReturnWire);
    const afterReturn = multiplayer.getGuestEnemyDiagnostics().map((enemy) => enemy.id).sort((a, b) => a - b);
    const confirmedAfterReturn = multiplayer.getSpectatorDiagnostics();

    return {
      westEnemyId: westEnemy.id,
      eastEnemyId: eastEnemy.id,
      west: { x: west.x, z: west.z },
      east: { x: east.x, z: east.z },
      eastWire,
      westWire,
      delayedWestCleanup,
      eastReturnWire,
      afterEast,
      afterWest,
      pendingBeforeDelayed,
      pendingAfterDelayed,
      afterDelayed,
      afterReturn,
      confirmedAfterReturn,
    };
  });

  const firstEastView = readEnemyViewContract(fixture.eastWire);
  const westView = readEnemyViewContract(fixture.westWire);
  const delayedWestView = readEnemyViewContract(fixture.delayedWestCleanup);
  const returnEastView = readEnemyViewContract(fixture.eastReturnWire);

  expect(fixture.delayedWestCleanup.enemyDelta.k).toBe(0);
  expect(decodeEnemyOpKinds(fixture.delayedWestCleanup.enemyDelta)).toContainEqual({
    id: fixture.eastEnemyId,
    kind: 2,
  });
  expect(fixture.afterEast).toContain(fixture.eastEnemyId);
  expect(fixture.afterWest).toEqual(expect.arrayContaining([fixture.westEnemyId, fixture.eastEnemyId]));
  expect(fixture.pendingBeforeDelayed.targetId).toBe("mock-player-4");
  expect(fixture.pendingBeforeDelayed.viewX).toBeCloseTo(fixture.west.x, 1);
  expect(fixture.pendingBeforeDelayed.viewZ).toBeCloseTo(fixture.west.z, 1);
  // The delayed removal was produced for West. Once the observer has selected
  // East again, applying it would make the East zombie disappear until the
  // host's next East keyframe recreates it.
  expect(fixture.afterDelayed).toContain(fixture.eastEnemyId);
  expect(fixture.pendingAfterDelayed.viewX).toBeCloseTo(fixture.west.x, 1);
  expect(fixture.pendingAfterDelayed.viewZ).toBeCloseTo(fixture.west.z, 1);
  expect(fixture.afterReturn).toContain(fixture.eastEnemyId);
  expect(fixture.confirmedAfterReturn.viewX).toBeCloseTo(fixture.east.x, 1);
  expect(fixture.confirmedAfterReturn.viewZ).toBeCloseTo(fixture.east.z, 1);

  expect(firstEastView.targetId).toBe("mock-player-4");
  expect(westView.targetId).toBe("mock-player-3");
  expect(delayedWestView).toEqual(westView);
  expect(returnEastView.targetId).toBe("mock-player-4");
  expect(Number.isInteger(firstEastView.revision)).toBe(true);
  expect(westView.revision).toBeGreaterThan(firstEastView.revision);
  expect(returnEastView.revision).toBeGreaterThan(westView.revision);
});

test("a spectator keeps the confirmed camera and cached enemies until a multi-chunk target keyframe completes", async ({ page }) => {
  test.setTimeout(180_000);
  await openGame(page);

  const result = await page.evaluate(() => {
    const multiplayer = window.__dustMultiplayerTest;
    multiplayer.startMockHost(["East Host", "Observer", "West", "Spare"]);
    multiplayer.setPlayerPosition("mock-player-1", 165, 108);
    multiplayer.setPlayerPosition("mock-player-3", -165, -108);
    multiplayer.setPlayerPosition("mock-player-4", 0, 118);
    const players = multiplayer.getState().players;
    const east = players.find((player) => player.id === "mock-player-1");
    const west = players.find((player) => player.id === "mock-player-3");
    const westEnemy = multiplayer.spawnEnemyAt(west.x + 3, west.z + 2, "walker", 20);
    const stress = multiplayer.spawnEnemyStressField(1200, "visible");

    multiplayer.damagePlayer("mock-player-2", 999, "mock-player-1");
    multiplayer.surrender("mock-player-2");

    function acknowledge(wire) {
      const combatAck = (wire.combatEvents || []).reduce(
        (highest, event) => Math.max(highest, Number(event?.sequence) || 0),
        0
      );
      multiplayer.acknowledgeClientState("mock-player-2", wire.sequence, combatAck, false);
    }

    // West is the default target after the observer. Complete that small view
    // first so the guest has both a confirmed camera and a cached enemy.
    const westWire = multiplayer.buildWireSnapshot(false, false, "mock-player-2");
    acknowledge(westWire);

    // The host is deliberately surrounded by enough enemies to force the new
    // East view keyframe through the stop-and-wait chunk path.
    multiplayer.injectInput("mock-player-2", { sequence: 1, spectatorTargetId: "mock-player-1" });
    const eastChunks = [];
    for (let guard = 0; guard < 64; guard += 1) {
      const wire = multiplayer.buildWireSnapshot(false, false, "mock-player-2");
      eastChunks.push(wire);
      acknowledge(wire);
      if (wire.enemyDelta?.f === 1) break;
    }

    const stateOnly = JSON.parse(JSON.stringify(westWire));
    stateOnly.sequence = 0;
    stateOnly.combatEvents = [];
    delete stateOnly.enemyDelta;
    delete stateOnly.enemies;

    multiplayer.startMockGuest(["East Host", "Observer", "West", "Spare"], 1);
    multiplayer.applySnapshot(stateOnly);
    multiplayer.applySnapshot(westWire);
    const confirmedWest = multiplayer.getSpectatorDiagnostics();

    // Desired target order is West -> Spare -> East Host. The camera must not
    // follow those local selections until the host's East keyframe is complete.
    multiplayer.cycleSpectator(1);
    multiplayer.cycleSpectator(1);
    const beforeChunks = multiplayer.getSpectatorDiagnostics();
    const samples = [];
    eastChunks.forEach((wire) => {
      multiplayer.applySnapshot(wire);
      const diagnostics = multiplayer.getSpectatorDiagnostics();
      const enemies = multiplayer.getGuestEnemyDiagnostics();
      samples.push({
        index: wire.enemyDelta.i,
        final: wire.enemyDelta.f === 1,
        targetId: diagnostics.targetId,
        viewX: diagnostics.viewX,
        viewZ: diagnostics.viewZ,
        cachedWestEnemyPresent: enemies.some((enemy) => enemy.id === westEnemy.id),
        enemyCount: enemies.length,
      });
    });

    return {
      west: { x: west.x, z: west.z },
      east: { x: east.x, z: east.z },
      westEnemyId: westEnemy.id,
      stress,
      confirmedWest,
      beforeChunks,
      chunkContract: eastChunks.map((wire) => ({
        epoch: wire.enemyDelta.e,
        index: wire.enemyDelta.i,
        count: wire.enemyDelta.m,
        final: wire.enemyDelta.f,
        viewRevision: wire.enemyDelta.vr,
        viewTargetId: wire.enemyDelta.vt,
        selectedEnemies: wire.enemyDelta.n,
      })),
      samples,
    };
  });

  expect(result.stress.active).toBe(1201);
  expect(result.chunkContract.length).toBeGreaterThan(1);
  const firstChunk = result.chunkContract[0];
  expect(firstChunk.count).toBe(result.chunkContract.length);
  expect(firstChunk.selectedEnemies).toBeGreaterThan(500);
  expect(result.chunkContract.map((chunk) => chunk.index)).toEqual(
    Array.from({ length: firstChunk.count }, (_, index) => index)
  );
  for (const chunk of result.chunkContract) {
    expect(chunk).toMatchObject({
      epoch: firstChunk.epoch,
      count: firstChunk.count,
      viewRevision: firstChunk.viewRevision,
      viewTargetId: "mock-player-1",
    });
  }
  expect(result.chunkContract.at(-1).final).toBe(1);

  expect(result.confirmedWest).toMatchObject({ targetId: "mock-player-3" });
  expect(result.confirmedWest.viewX).toBeCloseTo(result.west.x, 1);
  expect(result.confirmedWest.viewZ).toBeCloseTo(result.west.z, 1);
  expect(result.beforeChunks.targetId).toBe("mock-player-1");
  expect(result.beforeChunks.viewX).toBeCloseTo(result.west.x, 1);
  expect(result.beforeChunks.viewZ).toBeCloseTo(result.west.z, 1);

  const partialSamples = result.samples.slice(0, -1);
  expect(partialSamples.length).toBeGreaterThan(0);
  for (const sample of partialSamples) {
    expect(sample.final).toBe(false);
    expect(sample.targetId).toBe("mock-player-1");
    expect(sample.viewX).toBeCloseTo(result.west.x, 1);
    expect(sample.viewZ).toBeCloseTo(result.west.z, 1);
    expect(sample.cachedWestEnemyPresent).toBe(true);
  }

  const completed = result.samples.at(-1);
  expect(completed.final).toBe(true);
  expect(completed.targetId).toBe("mock-player-1");
  expect(completed.viewX).toBeCloseTo(result.east.x, 1);
  expect(completed.viewZ).toBeCloseTo(result.east.z, 1);
  expect(completed.cachedWestEnemyPresent).toBe(true);
  expect(completed.enemyCount).toBeGreaterThan(500);
});
