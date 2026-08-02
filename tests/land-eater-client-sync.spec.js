const path = require("node:path");
const { expect, test } = require("@playwright/test");

const REQUIRED_GAME_API = [
  "startWaveNow",
  "getLandEaterDiagnostics",
  "getLandEaterMapDiagnostics",
  "getLandEaterWorldCellDiagnostics",
  "setLandEaterAiEnabled",
  "forceLandEaterAction",
  "seekLandEaterAction",
  "stepLandEater",
  "damageLandEater",
  "forceWaveState",
  "getLandEaterWireState",
  "getLandEaterPackedWireDiagnostics",
];

function fileUrl(relativePath) {
  const absolute = path.resolve(__dirname, "..", relativePath).replace(/\\/g, "/");
  return `file:///${absolute}`;
}

async function startHunt(page) {
  await page.goto(`${fileUrl("index.html")}?mapSeed=7331&landEaterClientSync=1`);
  const intro = page.locator("#intro-screen");
  if (await intro.isVisible().catch(() => false)) {
    await page.keyboard.press("KeyM");
    await expect(intro).toBeHidden();
  }
  await page.getByRole("button", { name: "Start Hunt" }).click();
  await page.waitForFunction(() => Boolean(
    window.__dustAndDeadTest?.getLandEaterDiagnostics
      && window.__dustMultiplayerTest?.buildWireSnapshot
      && window.__dustMultiplayerTest?.applySnapshot
      && window.__dustMultiplayerTest?.decodeBossState
  ));
  const missing = await page.evaluate((names) => names.filter(
    (name) => typeof window.__dustAndDeadTest?.[name] !== "function"
  ), REQUIRED_GAME_API);
  expect(missing, `Land Eater sync API is incomplete: ${missing.join(", ")}`).toEqual([]);
}

function voidCellIds(diagnostics) {
  const grid = diagnostics.grid || diagnostics.topology || {};
  return (grid.voidCellIds || grid.consumedCellIds || diagnostics.voidCellIds || [])
    .map(Number)
    .sort((left, right) => left - right);
}

test("protocol 46 type 6 round-trips the full cell mask and rejects truncation", async ({ page }) => {
  await startHunt(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const multiplayer = window.__dustMultiplayerTest;
    multiplayer.startMockHost(["Host", "Guest"]);
    game.startWaveNow(10, "landEater");
    game.setLandEaterAiEnabled(false);
    for (let index = 0; index < 3; index += 1) {
      game.forceLandEaterAction("devour");
      game.seekLandEaterAction(0.999);
      game.stepLandEater(1 / 30);
    }
    const diagnostics = game.getLandEaterDiagnostics();
    const wire = game.getLandEaterWireState();
    const packed = game.getLandEaterPackedWireDiagnostics();
    const bytes = Uint8Array.from(atob(packed.packed), (character) => character.charCodeAt(0));
    const encode = (values) => {
      let binary = "";
      for (const value of values) binary += String.fromCharCode(value);
      return btoa(binary);
    };
    const wrongType = Uint8Array.from(bytes);
    wrongType[1] = 255;
    return {
      diagnostics,
      wire,
      packed,
      decodedDirect: multiplayer.decodeBossState(packed.packed),
      truncated: multiplayer.decodeBossState(encode(bytes.slice(0, -1))),
      wrongType: multiplayer.decodeBossState(encode(wrongType)),
    };
  });

  expect(result.packed).toMatchObject({
    protocolVersion: 46,
    typeCode: 6,
    kind: "landEater",
  });
  expect(result.packed.bytes).toBeLessThanOrEqual(160);
  expect(result.decodedDirect).toMatchObject({ kind: "landEater" });
  expect(result.packed.decoded).toMatchObject({ kind: "landEater" });
  expect(result.truncated).toBeNull();
  expect(result.wrongType).toBeNull();
  expect(voidCellIds(result.diagnostics)).toHaveLength(3);

  const decodedIds = voidCellIds(result.packed.decoded);
  const wireIds = voidCellIds(result.wire);
  expect(decodedIds).toEqual(voidCellIds(result.diagnostics));
  expect(wireIds).toEqual(voidCellIds(result.diagnostics));
  expect((result.packed.decoded.grid || result.packed.decoded.topology).maskBytes).toBe(28);
  expect(result.packed.decoded.route).toHaveLength(2);
  result.packed.decoded.route.forEach((point, index) => {
    expect(point.x).toBeCloseTo(result.wire.route[index].x, 1);
    expect(point.z).toBeCloseTo(result.wire.route[index].z, 1);
  });
});

test("the replicated void mask hides the same consumed building on every client", async ({ page, context }) => {
  const guest = await context.newPage();
  const hostErrors = [];
  const guestErrors = [];
  page.on("pageerror", (error) => hostErrors.push(error.message));
  guest.on("pageerror", (error) => guestErrors.push(error.message));

  try {
    await startHunt(page);
    await startHunt(guest);

    const host = await page.evaluate(() => {
      const game = window.__dustAndDeadTest;
      const multiplayer = window.__dustMultiplayerTest;
      multiplayer.startMockHost(["Host", "Guest"]);
      game.startWaveNow(10, "landEater");
      game.setLandEaterAiEnabled(false);
      const grid = game.getLandEaterDiagnostics().grid;
      let cell = null;
      for (let cellId = 0; cellId < grid.totalCells; cellId += 1) {
        const candidate = game.getLandEaterWorldCellDiagnostics(cellId);
        if (candidate?.visibleBuildings > 0 && candidate.state === 0) {
          cell = candidate;
          break;
        }
      }
      if (!cell) return { cell: null };
      game.forceLandEaterAction("devour", { targetCellId: cell.cellId });
      game.seekLandEaterAction(0.999);
      game.stepLandEater(1 / 30);
      return {
        cell,
        hidden: game.getLandEaterWorldCellDiagnostics(cell.cellId),
        snapshot: multiplayer.buildWireSnapshot(false, false, "mock-player-2"),
      };
    });

    expect(host.cell).not.toBeNull();
    expect(host.hidden).toMatchObject({
      state: 2,
      visibleBuildings: 0,
      hiddenBuildings: host.cell.buildingEntries,
    });

    const replica = await guest.evaluate(({ snapshot, cellId }) => {
      const game = window.__dustAndDeadTest;
      const multiplayer = window.__dustMultiplayerTest;
      multiplayer.startMockGuest(["Host", "Guest"], 1);
      multiplayer.applySnapshot(snapshot);
      return game.getLandEaterWorldCellDiagnostics(cellId);
    }, {
      snapshot: host.snapshot,
      cellId: host.cell.cellId,
    });

    expect(replica).toMatchObject({
      state: 2,
      visibleBuildings: 0,
      hiddenBuildings: host.cell.buildingEntries,
    });
    expect(replica.mapSeed).toBe(replica.indexedMapSeed);
    expect(hostErrors).toEqual([]);
    expect(guestErrors).toEqual([]);
  } finally {
    await guest.close();
  }
});

test("a guest repairs a dropped devour update from the next full-mask snapshot", async ({ page, context }) => {
  test.setTimeout(120_000);
  const guest = await context.newPage();
  const hostErrors = [];
  const guestErrors = [];
  page.on("pageerror", (error) => hostErrors.push(error.message));
  guest.on("pageerror", (error) => guestErrors.push(error.message));

  try {
    await startHunt(page);
    await startHunt(guest);

    const host = await page.evaluate(() => {
      const game = window.__dustAndDeadTest;
      const multiplayer = window.__dustMultiplayerTest;
      const snapshot = () => JSON.parse(JSON.stringify(
        multiplayer.buildWireSnapshot(false, false, "mock-player-2")
      ));
      const consume = () => {
        const started = game.forceLandEaterAction("devour");
        const target = started.targetCell || started.devour?.targetCell;
        const start = {
          diagnostics: game.getLandEaterDiagnostics(),
          snapshot: snapshot(),
        };
        game.seekLandEaterAction(0.999);
        game.stepLandEater(1 / 30);
        return {
          targetCellId: Number(target?.id ?? started.targetCellId),
          start,
          diagnostics: game.getLandEaterDiagnostics(),
          snapshot: snapshot(),
        };
      };

      multiplayer.startMockHost(["Host", "Guest"]);
      game.startWaveNow(10, "landEater");
      game.setLandEaterAiEnabled(false);
      const opening = {
        diagnostics: game.getLandEaterDiagnostics(),
        snapshot: snapshot(),
      };
      const first = consume();
      const second = consume();
      return { opening, first, second };
    });

    const replica = await guest.evaluate((packets) => {
      const game = window.__dustAndDeadTest;
      const multiplayer = window.__dustMultiplayerTest;
      multiplayer.startMockGuest(["Host", "Guest"], 1);
      multiplayer.applySnapshot(packets.opening.snapshot);
      const opening = game.getLandEaterDiagnostics();
      multiplayer.applySnapshot(packets.first.start.snapshot);
      const firstEmergence = game.getLandEaterDiagnostics();
      game.stepLandEater(1 / 30);
      const firstTravelFrame = game.getLandEaterDiagnostics();

      // packets.first is deliberately dropped.
      multiplayer.applySnapshot(packets.second.snapshot);
      const repaired = game.getLandEaterDiagnostics();
      multiplayer.applySnapshot(packets.second.snapshot);
      const duplicate = game.getLandEaterDiagnostics();

      // A fresh replica must also be able to start from this active snapshot.
      multiplayer.startMockGuest(["Host", "Guest"], 1, packets.second.snapshot.matchId);
      multiplayer.applySnapshot(packets.second.snapshot);
      const firstActive = game.getLandEaterDiagnostics();
      return {
        opening,
        firstEmergence,
        firstTravelFrame,
        repaired,
        duplicate,
        firstActive,
      };
    }, host);

    expect(replica.opening).toMatchObject({
      active: true,
      replica: true,
      action: "idle",
      submerged: true,
      visualY: -6.5,
    });
    expect(voidCellIds(replica.opening)).toHaveLength(0);
    expect(replica.firstEmergence).toMatchObject({
      active: true,
      replica: true,
      action: "devour",
      submerged: true,
      visualY: -6.5,
    });
    expect(replica.firstEmergence.x).toBeCloseTo(host.first.start.diagnostics.x, 2);
    expect(replica.firstEmergence.z).toBeCloseTo(host.first.start.diagnostics.z, 2);
    expect(Math.hypot(
      replica.firstEmergence.x - replica.opening.x,
      replica.firstEmergence.z - replica.opening.z
    )).toBeLessThan(0.1);
    expect(replica.firstEmergence.route).toHaveLength(2);
    replica.firstEmergence.route.forEach((point, index) => {
      expect(point.x).toBeCloseTo(
        host.first.start.diagnostics.route[index].x,
        1
      );
      expect(point.z).toBeCloseTo(
        host.first.start.diagnostics.route[index].z,
        1
      );
    });
    expect(replica.firstEmergence.route[0].x).toBeCloseTo(
      replica.opening.x,
      2
    );
    expect(replica.firstEmergence.route[0].z).toBeCloseTo(
      replica.opening.z,
      2
    );
    const firstFrameDistance = Math.hypot(
      replica.firstTravelFrame.x - replica.firstEmergence.x,
      replica.firstTravelFrame.z - replica.firstEmergence.z
    );
    expect(firstFrameDistance).toBeGreaterThan(0.001);
    expect(firstFrameDistance).toBeLessThan(4);
    expect(voidCellIds(replica.repaired)).toEqual(voidCellIds(host.second.diagnostics));
    expect(voidCellIds(replica.repaired)).toEqual([
      host.first.targetCellId,
      host.second.targetCellId,
    ].sort((left, right) => left - right));
    expect(replica.repaired.cellRevision ?? replica.repaired.grid.cellRevision).toBe(
      host.second.diagnostics.cellRevision ?? host.second.diagnostics.grid.cellRevision
    );
    expect(voidCellIds(replica.duplicate)).toEqual(voidCellIds(replica.repaired));
    expect(replica.duplicate.actionSeq).toBe(replica.repaired.actionSeq);
    for (const axis of ["x", "z"]) {
      expect(replica.repaired.devour.start[axis])
        .toBeCloseTo(host.second.diagnostics.devour.start[axis], 1);
      expect(replica.repaired.devour.end[axis])
        .toBeCloseTo(host.second.diagnostics.devour.end[axis], 1);
    }
    expect(replica.repaired.devour.facingAngle)
      .toBeCloseTo(host.second.diagnostics.devour.facingAngle, 3);
    expect(replica.firstActive).toMatchObject({ active: true, replica: true });
    expect(voidCellIds(replica.firstActive)).toEqual(voidCellIds(host.second.diagnostics));
    expect(replica.firstActive.route).toHaveLength(2);
    expect(Math.hypot(
      replica.firstActive.head.x - host.second.diagnostics.head.x,
      replica.firstActive.head.z - host.second.diagnostics.head.z
    )).toBeLessThan(0.15);
    expect(hostErrors).toEqual([]);
    expect(guestErrors).toEqual([]);
  } finally {
    await guest.close();
  }
});

test("root le preserves eaten topology after the boss entity is gone and a new run clears it", async ({ page, context }) => {
  test.setTimeout(120_000);
  const guest = await context.newPage();
  const hostErrors = [];
  const guestErrors = [];
  page.on("pageerror", (error) => hostErrors.push(error.message));
  guest.on("pageerror", (error) => guestErrors.push(error.message));

  try {
    await startHunt(page);
    await startHunt(guest);

    const host = await page.evaluate(() => {
      const game = window.__dustAndDeadTest;
      const multiplayer = window.__dustMultiplayerTest;
      const snapshot = () => JSON.parse(JSON.stringify(
        multiplayer.buildWireSnapshot(false, false, "mock-player-2")
      ));
      const consume = () => {
        const started = game.forceLandEaterAction("devour");
        const target = started.targetCell || started.devour?.targetCell;
        game.seekLandEaterAction(0.999);
        game.stepLandEater(1 / 30);
        return Number(target?.id ?? started.targetCellId);
      };
      const idsFromLe = (le) => {
        if (!Array.isArray(le) || le.length !== 2) return null;
        const bytes = Uint8Array.from(atob(le[1]), (character) => character.charCodeAt(0));
        const ids = [];
        for (let id = 0; id < 224; id += 1) {
          if (bytes[id >> 3] & (1 << (id & 7))) ids.push(id);
        }
        return ids;
      };

      multiplayer.startMockHost(["Host", "Guest"]);
      game.startWaveNow(10, "landEater");
      game.setLandEaterAiEnabled(false);
      const eatenCellIds = [consume(), consume()].sort((left, right) => left - right);
      const activeMap = game.getLandEaterMapDiagnostics();
      const activeSnapshot = snapshot();

      game.damageLandEater(1e9);
      game.forceWaveState(11, 0, 0);
      const persistentMap = game.getLandEaterMapDiagnostics();
      const persistentSnapshot = snapshot();
      const bossAfterTransition = game.getLandEaterDiagnostics();

      // Starting another match is the public test path through resetRun().
      multiplayer.startMockHost(["Host", "Guest"]);
      const resetMap = game.getLandEaterMapDiagnostics();
      const resetSnapshot = snapshot();
      return {
        eatenCellIds,
        activeMap,
        activeSnapshot,
        persistentMap,
        persistentSnapshot,
        persistentLeIds: idsFromLe(persistentSnapshot.le),
        bossAfterTransition,
        resetMap,
        resetSnapshot,
        resetLeIds: idsFromLe(resetSnapshot.le),
      };
    });

    const replica = await guest.evaluate((packets) => {
      const game = window.__dustAndDeadTest;
      const multiplayer = window.__dustMultiplayerTest;

      multiplayer.startMockGuest(["Host", "Guest"], 1);
      multiplayer.applySnapshot(packets.activeSnapshot);
      const active = game.getLandEaterMapDiagnostics();
      multiplayer.applySnapshot(packets.persistentSnapshot);
      const afterTransition = game.getLandEaterMapDiagnostics();
      const bossAfterTransition = game.getLandEaterDiagnostics();

      // A fresh client sees only the post-boss packet. Its topology must come
      // from root `le`, because that snapshot contains no Land Eater entity.
      multiplayer.startMockGuest(["Host", "Guest"], 1, packets.persistentSnapshot.matchId);
      const beforeLateJoin = game.getLandEaterMapDiagnostics();
      multiplayer.applySnapshot(packets.persistentSnapshot);
      const lateJoin = game.getLandEaterMapDiagnostics();
      const lateJoinBoss = game.getLandEaterDiagnostics();

      // startMockGuest starts a new run and therefore exercises resetRun().
      multiplayer.startMockGuest(["Host", "Guest"], 1);
      const reset = game.getLandEaterMapDiagnostics();
      return {
        active,
        afterTransition,
        bossAfterTransition,
        beforeLateJoin,
        lateJoin,
        lateJoinBoss,
        reset,
      };
    }, host);

    expect(host.eatenCellIds).toHaveLength(2);
    expect(voidCellIds(host.activeMap)).toEqual(host.eatenCellIds);
    expect(host.bossAfterTransition).toBeNull();
    expect(host.persistentSnapshot).toHaveProperty("le");
    expect(host.persistentSnapshot.bossState).toBeNull();
    expect(host.persistentLeIds).toEqual(host.eatenCellIds);
    expect(voidCellIds(host.persistentMap)).toEqual(host.eatenCellIds);

    expect(voidCellIds(replica.active)).toEqual(host.eatenCellIds);
    expect(replica.bossAfterTransition).toBeNull();
    expect(voidCellIds(replica.afterTransition)).toEqual(host.eatenCellIds);
    expect(voidCellIds(replica.beforeLateJoin)).toHaveLength(0);
    expect(replica.lateJoinBoss).toBeNull();
    expect(voidCellIds(replica.lateJoin)).toEqual(host.eatenCellIds);

    expect(voidCellIds(host.resetMap)).toHaveLength(0);
    expect(host.resetSnapshot).toHaveProperty("le");
    expect(host.resetLeIds).toEqual([]);
    expect(voidCellIds(replica.reset)).toHaveLength(0);
    expect(replica.reset.cellRevision).toBe(0);
    expect(replica.reset.overlayActive).toBe(0);
    expect(hostErrors).toEqual([]);
    expect(guestErrors).toEqual([]);
  } finally {
    await guest.close();
  }
});

test("zigzag replicas follow the authoritative route clock without smoothing through walls", async ({ page, context }) => {
  test.setTimeout(120_000);
  const guest = await context.newPage();
  try {
    await startHunt(page);
    await startHunt(guest);
    const host = await page.evaluate(() => {
      const game = window.__dustAndDeadTest;
      const multiplayer = window.__dustMultiplayerTest;
      multiplayer.startMockHost(["Host", "Guest"]);
      game.startWaveNow(10, "landEater");
      game.setLandEaterAiEnabled(false);
      game.setPlayerPosition(0, 190);
      const route = [
        { x: -220, z: -160 },
        { x: 220, z: -120 },
        { x: -220, z: -70 },
        { x: 220, z: -20 },
        { x: -220, z: 30 },
        { x: 220, z: 80 },
        { x: -220, z: 130 },
        { x: 220, z: 165 },
      ];
      const opening = game.forceLandEaterAction("zigzag", { route });
      game.stepLandEater(
        2.4 + (opening.actionDuration - 2.4) * 0.37
      );
      return {
        diagnostics: game.getLandEaterDiagnostics(),
        snapshot: JSON.parse(JSON.stringify(
          multiplayer.buildWireSnapshot(false, false, "mock-player-2")
        )),
      };
    });
    const replica = await guest.evaluate((packet) => {
      const game = window.__dustAndDeadTest;
      const multiplayer = window.__dustMultiplayerTest;
      multiplayer.startMockGuest(["Host", "Guest"], 1);
      multiplayer.applySnapshot(packet.snapshot);
      const immediate = game.getLandEaterDiagnostics();
      game.stepLandEater(1 / 15);
      const advanced = game.getLandEaterDiagnostics();
      return { immediate, advanced };
    }, host);

    const hostRoute = host.diagnostics.route || host.diagnostics.zigzag?.route;
    const guestRoute = replica.immediate.route || replica.immediate.zigzag?.route;
    expect(replica.immediate).toMatchObject({
      active: true,
      replica: true,
      action: "zigzag",
    });
    expect(guestRoute).toEqual(hostRoute);
    expect(guestRoute.length).toBeLessThanOrEqual(12);
    expect(replica.immediate.actionSeq).toBe(host.diagnostics.actionSeq);
    expect(Math.abs(
      replica.immediate.actionDuration - host.diagnostics.actionDuration
    )).toBeLessThan(0.02);
    expect(Math.abs(
      replica.immediate.actionTimer - host.diagnostics.actionTimer
    )).toBeLessThan(0.02);
    expect(Math.hypot(
      replica.immediate.head.x - host.diagnostics.head.x,
      replica.immediate.head.z - host.diagnostics.head.z
    )).toBeLessThan(0.12);
    expect(Math.abs(Math.atan2(
      Math.sin(replica.immediate.facingAngle - host.diagnostics.facingAngle),
      Math.cos(replica.immediate.facingAngle - host.diagnostics.facingAngle)
    ))).toBeLessThan(0.03);
    expect(host.diagnostics.articulation).toMatchObject({
      active: true,
      mode: "zigzag",
      rootYaw: 0,
      segmentCount: 10,
    });
    expect(replica.immediate.articulation).toMatchObject({
      active: true,
      mode: "zigzag",
      rootYaw: 0,
      segmentCount: 10,
    });
    for (const segmentIndex of [0, 4, 9]) {
      expect(Math.hypot(
        replica.immediate.articulation.segments[segmentIndex].x -
          host.diagnostics.articulation.segments[segmentIndex].x,
        replica.immediate.articulation.segments[segmentIndex].z -
          host.diagnostics.articulation.segments[segmentIndex].z
      )).toBeLessThan(0.4);
    }
    expect(replica.advanced.actionTimer).toBeGreaterThan(replica.immediate.actionTimer);
    expect(replica.advanced.route || replica.advanced.zigzag?.route).toEqual(guestRoute);
    expect(host.diagnostics.zigzag.consumeEveryCrossedCells).toBe(5);
    expect(replica.immediate.zigzag.consumeEveryCrossedCells).toBe(5);
    expect(replica.immediate.zigzag.futureDoomedCellIds).toEqual(
      host.diagnostics.zigzag.futureDoomedCellIds
    );
    expect(replica.immediate.telegraph.zigzag.doomedCellIds).toEqual(
      host.diagnostics.telegraph.zigzag.doomedCellIds
    );
    expect(replica.immediate.telegraph.zigzag.doomedFillInstances).toBe(
      replica.immediate.zigzag.futureDoomedCellIds.length
    );
    expect(replica.immediate.telegraph.zigzag.doomedDetailInstances).toBe(
      replica.immediate.zigzag.futureDoomedCellIds.length
    );
    expect(replica.immediate.telegraph.zigzag.doomedPalette.semantic)
      .toBe("terrain-devour-red");
    expect(replica.immediate.telegraph.zigzag.doomedPalette.mark[0])
      .toBeGreaterThan(0.9);
    expect(replica.immediate.telegraph.zigzag.doomedPalette.mark[1])
      .toBeLessThan(0.2);
    expect(replica.immediate.telegraph.zigzag.doomedPalette.mark[2])
      .toBeLessThan(0.2);
    expect(replica.advanced.zigzag.futureDoomedCellIds.length)
      .toBeLessThanOrEqual(
        replica.immediate.zigzag.futureDoomedCellIds.length
      );
    expect(voidCellIds(host.diagnostics).length).toBeGreaterThan(0);
    expect(voidCellIds(replica.immediate)).toEqual(
      voidCellIds(host.diagnostics)
    );
  } finally {
    await guest.close();
  }
});

test("burrow replicas keep the locked target and consume delayed clocks without teleporting", async ({ page, context }) => {
  test.setTimeout(120_000);
  const guest = await context.newPage();
  try {
    await startHunt(page);
    await startHunt(guest);
    const host = await page.evaluate(() => {
      const game = window.__dustAndDeadTest;
      const multiplayer = window.__dustMultiplayerTest;
      const snapshot = () => JSON.parse(JSON.stringify(
        multiplayer.buildWireSnapshot(false, false, "mock-player-2")
      ));
      const route = [
        { x: -132, z: -94 },
        { x: 74, z: 48 },
      ];
      multiplayer.startMockHost(["Host", "Guest"]);
      game.startWaveNow(10, "landEater");
      game.setLandEaterAiEnabled(false);
      game.forceLandEaterAction("burrow", {
        route,
        targetPlayerId: "local",
      });
      game.seekLandEaterAction(0.36);
      const early = {
        diagnostics: game.getLandEaterDiagnostics(),
        snapshot: snapshot(),
      };
      game.seekLandEaterAction(0.86);
      const delayed = {
        diagnostics: game.getLandEaterDiagnostics(),
        snapshot: snapshot(),
        packed: game.getLandEaterPackedWireDiagnostics(),
      };
      return { route, early, delayed };
    });

    const replica = await guest.evaluate((packets) => {
      const game = window.__dustAndDeadTest;
      const multiplayer = window.__dustMultiplayerTest;
      multiplayer.startMockGuest(["Host", "Guest"], 1);
      multiplayer.applySnapshot(packets.early.snapshot);
      const immediate = game.getLandEaterDiagnostics();
      game.stepLandEater(1 / 30);
      const advanced = game.getLandEaterDiagnostics();
      multiplayer.applySnapshot(packets.delayed.snapshot);
      const afterCorrection = game.getLandEaterDiagnostics();
      game.stepLandEater(1 / 60);
      const afterFrame = game.getLandEaterDiagnostics();
      return { immediate, advanced, afterCorrection, afterFrame };
    }, host);

    expect(host.delayed.packed).toMatchObject({
      protocolVersion: 46,
      typeCode: 6,
      kind: "landEater",
      decoded: {
        action: "burrow",
      },
    });
    expect(host.delayed.packed.decoded.route).toEqual(host.route);
    expect(replica.immediate).toMatchObject({
      active: true,
      replica: true,
      action: "burrow",
      burrow: {
        active: true,
        targetVisible: true,
        wakeVisible: true,
      },
    });
    expect(replica.immediate.route).toEqual(host.route);
    expect(Math.abs(
      replica.immediate.actionTimer - host.early.diagnostics.actionTimer
    )).toBeLessThan(0.02);
    expect(Math.hypot(
      replica.immediate.head.x - host.early.diagnostics.head.x,
      replica.immediate.head.z - host.early.diagnostics.head.z
    )).toBeLessThan(0.12);
    expect(host.early.diagnostics.articulation).toMatchObject({
      active: true,
      mode: "burrow",
      rootYaw: 0,
      segmentCount: 10,
    });
    expect(replica.immediate.articulation).toMatchObject({
      active: true,
      mode: "burrow",
      rootYaw: 0,
      segmentCount: 10,
    });
    for (const segmentIndex of [0, 4, 9]) {
      expect(Math.hypot(
        replica.immediate.articulation.segments[segmentIndex].x -
          host.early.diagnostics.articulation.segments[segmentIndex].x,
        replica.immediate.articulation.segments[segmentIndex].z -
          host.early.diagnostics.articulation.segments[segmentIndex].z
      )).toBeLessThan(0.4);
    }
    expect(replica.advanced.actionTimer).toBeGreaterThan(replica.immediate.actionTimer);
    expect(Math.hypot(
      replica.advanced.head.x - replica.immediate.head.x,
      replica.advanced.head.z - replica.immediate.head.z
    )).toBeGreaterThan(0.01);
    expect(host.delayed.diagnostics.actionTimer).toBeGreaterThan(
      host.early.diagnostics.actionTimer + 1
    );
    expect(replica.afterCorrection.actionTimer).toBeCloseTo(
      replica.advanced.actionTimer,
      4
    );
    expect(replica.afterCorrection.head.x).toBeCloseTo(replica.advanced.head.x, 3);
    expect(replica.afterCorrection.head.z).toBeCloseTo(replica.advanced.head.z, 3);
    expect(replica.afterCorrection.networkClock.targetTimer).toBeGreaterThan(
      replica.afterCorrection.actionTimer + 1
    );
    expect(replica.afterFrame.actionTimer).toBeGreaterThan(
      replica.afterCorrection.actionTimer
    );
    expect(Math.hypot(
      replica.afterFrame.head.x - replica.afterCorrection.head.x,
      replica.afterFrame.head.z - replica.afterCorrection.head.z
    )).toBeLessThan(4);
  } finally {
    await guest.close();
  }
});

test("a delayed same-action packet is consumed by a smooth monotonic phase servo", async ({ page, context }) => {
  test.setTimeout(120_000);
  const guest = await context.newPage();
  const hostErrors = [];
  const guestErrors = [];
  page.on("pageerror", (error) => hostErrors.push(error.message));
  guest.on("pageerror", (error) => guestErrors.push(error.message));
  try {
    await startHunt(page);
    await startHunt(guest);
    const host = await page.evaluate(() => {
      const game = window.__dustAndDeadTest;
      const multiplayer = window.__dustMultiplayerTest;
      const snapshot = () => JSON.parse(JSON.stringify(
        multiplayer.buildWireSnapshot(false, false, "mock-player-2")
      ));
      const route = [
        { x: -220, z: -160 },
        { x: 220, z: -120 },
        { x: -220, z: -70 },
        { x: 220, z: -20 },
        { x: -220, z: 30 },
        { x: 220, z: 80 },
        { x: -220, z: 130 },
        { x: 220, z: 165 },
      ];
      multiplayer.startMockHost(["Host", "Guest"]);
      game.startWaveNow(10, "landEater");
      game.setLandEaterAiEnabled(false);
      game.forceLandEaterAction("zigzag", { route });
      game.seekLandEaterAction(0.18);
      const early = {
        diagnostics: game.getLandEaterDiagnostics(),
        snapshot: snapshot(),
      };
      game.seekLandEaterAction(0.78);
      const delayed = {
        diagnostics: game.getLandEaterDiagnostics(),
        snapshot: snapshot(),
      };
      return { early, delayed };
    });

    const replica = await guest.evaluate((packets) => {
      const game = window.__dustAndDeadTest;
      const multiplayer = window.__dustMultiplayerTest;
      multiplayer.startMockGuest(["Host", "Guest"], 1);
      multiplayer.applySnapshot(packets.early.snapshot);
      const beforeCorrection = game.getLandEaterDiagnostics();
      multiplayer.applySnapshot(packets.delayed.snapshot);
      const afterCorrection = game.getLandEaterDiagnostics();
      game.stepLandEater(1 / 60);
      const afterFrame = game.getLandEaterDiagnostics();
      for (let index = 0; index < 59; index += 1) game.stepLandEater(1 / 60);
      const afterCatchup = game.getLandEaterDiagnostics();
      return { beforeCorrection, afterCorrection, afterFrame, afterCatchup };
    }, host);

    expect(host.early.diagnostics.actionSeq).toBe(host.delayed.diagnostics.actionSeq);
    expect(host.delayed.diagnostics.actionTimer).toBeGreaterThan(
      host.early.diagnostics.actionTimer + 1
    );
    expect(replica.afterCorrection.actionTimer).toBeCloseTo(
      replica.beforeCorrection.actionTimer,
      4
    );
    expect(replica.afterCorrection.head.x).toBeCloseTo(replica.beforeCorrection.head.x, 3);
    expect(replica.afterCorrection.head.z).toBeCloseTo(replica.beforeCorrection.head.z, 3);
    expect(replica.afterCorrection.networkClock).toMatchObject({
      mode: "monotonic-phase-servo",
    });
    expect(replica.afterCorrection.networkClock.targetTimer).toBeGreaterThan(
      replica.afterCorrection.actionTimer + 1
    );
    expect(replica.afterFrame.actionTimer).toBeGreaterThan(replica.afterCorrection.actionTimer);
    expect(
      replica.afterFrame.actionTimer - replica.afterCorrection.actionTimer
    ).toBeLessThanOrEqual(1 / 60 * 1.62 + 0.001);
    expect(replica.afterFrame.networkClock.playbackRate).toBeGreaterThan(1);
    expect(replica.afterCatchup.actionTimer).toBeGreaterThan(replica.afterFrame.actionTimer);
    expect(Math.abs(replica.afterCatchup.networkClock.phaseError)).toBeLessThan(
      Math.abs(replica.afterFrame.networkClock.phaseError)
    );
    expect(hostErrors).toEqual([]);
    expect(guestErrors).toEqual([]);
  } finally {
    await guest.close();
  }
});

test("body contact is host-authoritative while the guest receives the same solid pose", async ({ page, context }) => {
  test.setTimeout(120_000);
  const guest = await context.newPage();
  try {
    await startHunt(page);
    await startHunt(guest);

    const host = await page.evaluate(() => {
      const game = window.__dustAndDeadTest;
      const multiplayer = window.__dustMultiplayerTest;
      multiplayer.startMockHost(["Host", "Guest"]);
      game.startWaveNow(10, "landEater");
      game.setLandEaterAiEnabled(false);
      game.setPlayerPosition(0, 180);
      multiplayer.setHealth("mock-player-2", 100);
      const opening = game.forceLandEaterAction("burrow", {
        route: [
          { x: -24, z: 20 },
          { x: 36, z: 20 },
        ],
        targetPlayerId: "mock-player-2",
      });
      const travelDuration = opening.actionDuration - 1.05 - 0.9;
      const emerged = game.seekLandEaterAction(
        (travelDuration + 1.05 * 0.86) / opening.actionDuration
      );
      const tail = emerged.collision.body.nodes
        .filter((node) => node.tail && node.radius > 0.2)
        .sort((left, right) => right.radius - left.radius)[0];
      multiplayer.setPlayerPosition("mock-player-2", tail.x, tail.z);
      const before = multiplayer.getState().players.find(
        (player) => player.id === "mock-player-2"
      );
      const preContactSnapshot = JSON.parse(JSON.stringify(
        multiplayer.buildWireSnapshot(
          false,
          false,
          "mock-player-2"
        )
      ));
      game.stepLandEater(1 / 60);
      const diagnostics = game.getLandEaterDiagnostics();
      const after = multiplayer.getState().players.find(
        (player) => player.id === "mock-player-2"
      );
      return {
        tail,
        before,
        after,
        diagnostics,
        preContactSnapshot,
        snapshot: JSON.parse(JSON.stringify(
          multiplayer.buildWireSnapshot(false, false, "mock-player-2")
        )),
      };
    });

    const replica = await guest.evaluate((packet) => {
      const game = window.__dustAndDeadTest;
      const multiplayer = window.__dustMultiplayerTest;
      multiplayer.startMockGuest(["Host", "Guest"], 1);
      multiplayer.applySnapshot(packet.preContactSnapshot);
      const beforePrediction =
        multiplayer.getState().players.find(
          (entry) => entry.id === "mock-player-2"
        );
      game.stepLandEater(1 / 60);
      const predicted = {
        diagnostics: game.getLandEaterDiagnostics(),
        player: multiplayer.getState().players.find(
          (entry) => entry.id === "mock-player-2"
        ),
      };
      multiplayer.applySnapshot(packet.snapshot);
      const immediate = {
        diagnostics: game.getLandEaterDiagnostics(),
        player: multiplayer.getState().players.find(
          (entry) => entry.id === "mock-player-2"
        ),
      };
      game.stepLandEater(1 / 60);
      return {
        beforePrediction,
        predicted,
        immediate,
        afterPrediction: {
          diagnostics: game.getLandEaterDiagnostics(),
          player: multiplayer.getState().players.find(
            (entry) => entry.id === "mock-player-2"
          ),
        },
      };
    }, host);

    expect(host.after.hp).toBeLessThan(host.before.hp);
    expect(host.after.hp).toBeGreaterThan(0);
    expect(Math.hypot(
      host.after.x - host.before.x,
      host.after.z - host.before.z
    )).toBeGreaterThan(2);
    expect(host.diagnostics.collision.body).toMatchObject({
      mode: "burrow",
      authoritativeDamage: true,
      predictedLocalPush: false,
      solidTail: true,
      lastPlayerId: "mock-player-2",
      lastTailContact: true,
    });
    expect(replica.predicted.player.hp)
      .toBe(replica.beforePrediction.hp);
    expect(Math.hypot(
      replica.predicted.player.x - replica.beforePrediction.x,
      replica.predicted.player.z - replica.beforePrediction.z
    )).toBeGreaterThan(4.8);
    expect(replica.predicted.diagnostics.collision.body)
      .toMatchObject({
        authoritativeDamage: false,
        predictedLocalPush: true,
        predictedImpulseEvents: 1,
        lastTailContact: true,
      });
    expect(replica.immediate.player.hp).toBe(host.after.hp);
    expect(replica.immediate.player.networkTargetX).toBeCloseTo(
      host.after.x,
      1
    );
    expect(replica.immediate.player.networkTargetZ).toBeCloseTo(
      host.after.z,
      1
    );
    expect(replica.immediate.diagnostics.collision.body).toMatchObject({
      mode: "burrow",
      authoritativeDamage: false,
      predictedLocalPush: true,
      solidTail: true,
    });
    const hostNodes = host.diagnostics.collision.body.nodes;
    const guestNodes =
      replica.immediate.diagnostics.collision.body.nodes;
    for (const role of ["head", "body-5", "tail-tip"]) {
      const hostNode = hostNodes.find((node) => node.role === role);
      const guestNode = guestNodes.find((node) => node.role === role);
      expect(guestNode).toBeTruthy();
      expect(Math.hypot(
        guestNode.x - hostNode.x,
        guestNode.z - hostNode.z
      )).toBeLessThan(0.55);
      expect(Math.abs(guestNode.radius - hostNode.radius))
        .toBeLessThan(0.2);
    }
    expect(replica.afterPrediction.player.hp).toBe(host.after.hp);
  } finally {
    await guest.close();
  }
});
