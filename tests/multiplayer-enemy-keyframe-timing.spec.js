const path = require("node:path");
const { expect, test } = require("@playwright/test");
const { decodeEnemyIds, decodeEnemyOps } = require("./helpers/enemy-wire-decoder");

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
    window.__dustMultiplayerTest?.acknowledgeClientState
  ));
}

test("a retried keyframe baseline stays idempotent while its live delta advances motion", async ({ page }) => {
  await openGame(page);

  const result = await page.evaluate(() => {
    const multiplayer = window.__dustMultiplayerTest;
    const game = window.__dustAndDeadTest;
    const started = multiplayer.startMockHost(["Host", "Guest"]);
    const viewer = started.players[1];
    game.spawnZombieAt("runner", viewer.x + 8, viewer.z);

    const initial = JSON.parse(JSON.stringify(multiplayer.buildWireSnapshot(false, false, "mock-player-2")));
    multiplayer.acknowledgeClientState("mock-player-2", initial.sequence, 0, false);
    window.advanceTime(140);
    const movement = JSON.parse(JSON.stringify(multiplayer.buildWireSnapshot(false, false, "mock-player-2")));
    multiplayer.acknowledgeClientState("mock-player-2", movement.sequence, 0, false);

    window.advanceTime(140);
    multiplayer.acknowledgeClientState("mock-player-2", movement.sequence, 0, true);
    const keyframe = JSON.parse(JSON.stringify(multiplayer.buildWireSnapshot(false, false, "mock-player-2")));
    window.advanceTime(320);
    const retry = JSON.parse(JSON.stringify(multiplayer.buildWireSnapshot(false, false, "mock-player-2")));

    multiplayer.startMockGuest(["Host", "Guest"], 1);
    multiplayer.applySnapshot(initial);
    multiplayer.applySnapshot(movement);
    multiplayer.applySnapshot(keyframe);
    const beforeRetry = multiplayer.getGuestEnemyDiagnostics()[0];
    multiplayer.applySnapshot(retry);
    const afterRetry = multiplayer.getGuestEnemyDiagnostics()[0];

    return {
      sameChunk: keyframe.enemyDelta.d === retry.enemyDelta.d,
      sameEpoch: keyframe.enemyDelta.e === retry.enemyDelta.e,
      sameIndex: keyframe.enemyDelta.i === retry.enemyDelta.i,
      keyframeHasLive: !!keyframe.enemyLiveDelta,
      retryHasLive: !!retry.enemyLiveDelta,
      keyframeTime: keyframe.time,
      retryTime: retry.time,
      beforeRetry,
      afterRetry,
    };
  });

  expect(result.sameChunk).toBe(true);
  expect(result.sameEpoch).toBe(true);
  expect(result.sameIndex).toBe(true);
  expect(result.retryTime).toBeGreaterThan(result.keyframeTime);
  expect(Math.hypot(result.beforeRetry.velocityX, result.beforeRetry.velocityZ)).toBeGreaterThan(0.01);
  expect(result.keyframeHasLive).toBe(true);
  expect(result.retryHasLive).toBe(true);
  expect(result.afterRetry.sampleTime).toBeGreaterThan(result.beforeRetry.sampleTime);
  expect(result.afterRetry.targetReceivedAt).toBeGreaterThan(result.beforeRetry.targetReceivedAt);
  expect(Math.hypot(result.afterRetry.velocityX, result.afterRetry.velocityZ)).toBeGreaterThan(0.01);
});

test("late keyframe chunks capture fresh coordinates and keep their own capture time", async ({ page }) => {
  test.setTimeout(120_000);
  await openGame(page);

  const hostFrames = await page.evaluate(() => {
    const multiplayer = window.__dustMultiplayerTest;
    const started = multiplayer.startMockHost(["Host", "Guest"]);
    multiplayer.setPlayerPosition("mock-player-2", started.players[0].x, started.players[0].z);
    multiplayer.spawnEnemyStressField(1400, "visible");

    const first = JSON.parse(JSON.stringify(multiplayer.buildWireSnapshot(false, false, "mock-player-2")));
    window.advanceTime(320);
    const retry = JSON.parse(JSON.stringify(multiplayer.buildWireSnapshot(false, false, "mock-player-2")));
    multiplayer.acknowledgeClientState("mock-player-2", retry.sequence, 0, false);
    window.advanceTime(1400);
    const late = JSON.parse(JSON.stringify(multiplayer.buildWireSnapshot(false, false, "mock-player-2")));
    return { first, retry, late };
  });

  expect(hostFrames.first.enemyDelta.k).toBe(1);
  expect(hostFrames.first.enemyDelta.m).toBeGreaterThan(1);
  expect(hostFrames.first.enemyDelta.i).toBe(0);
  expect(hostFrames.retry.enemyDelta.d).toBe(hostFrames.first.enemyDelta.d);
  expect(hostFrames.retry.enemyDelta.e).toBe(hostFrames.first.enemyDelta.e);
  expect(hostFrames.retry.enemyDelta.i).toBe(0);
  expect(hostFrames.late.enemyDelta.e).toBe(hostFrames.first.enemyDelta.e);
  expect(hostFrames.late.enemyDelta.i).toBe(1);
  expect(hostFrames.late.time - hostFrames.first.time).toBeGreaterThan(1);

  const firstIds = decodeEnemyIds(hostFrames.first.enemyDelta);
  const lateIds = decodeEnemyIds(hostFrames.late.enemyDelta);
  expect(firstIds.length).toBeGreaterThan(0);
  expect(lateIds.length).toBeGreaterThan(0);
  const firstEnemyId = firstIds[0];
  const lateEnemyId = lateIds[0];
  const guestResult = await page.evaluate(({ first, retry, late, firstId, lateId }) => {
    const multiplayer = window.__dustMultiplayerTest;
    multiplayer.startMockGuest(["Host", "Guest"], 1);
    multiplayer.applySnapshot(first);
    const firstBeforeRetry = multiplayer.getGuestEnemyDiagnostics().find((enemy) => enemy.id === firstId) || null;
    multiplayer.applySnapshot(retry);
    const firstAfterRetry = multiplayer.getGuestEnemyDiagnostics().find((enemy) => enemy.id === firstId) || null;
    multiplayer.applySnapshot(late);
    const lateEnemy = multiplayer.getGuestEnemyDiagnostics().find((enemy) => enemy.id === lateId) || null;
    return { firstBeforeRetry, firstAfterRetry, lateEnemy };
  }, {
    first: hostFrames.first,
    retry: hostFrames.retry,
    late: hostFrames.late,
    firstId: firstEnemyId,
    lateId: lateEnemyId,
  });

  expect(guestResult.firstBeforeRetry).toBeTruthy();
  expect(guestResult.firstAfterRetry.sampleTime).toBe(guestResult.firstBeforeRetry.sampleTime);
  expect(guestResult.firstAfterRetry.targetReceivedAt).toBe(guestResult.firstBeforeRetry.targetReceivedAt);
  expect(guestResult.lateEnemy).toBeTruthy();
  expect(hostFrames.late.enemyDelta.t).toBeGreaterThan(hostFrames.first.enemyDelta.t + 1);
  expect(guestResult.lateEnemy.sampleTime).toBeCloseTo(hostFrames.late.enemyDelta.t, 3);
  expect(Math.abs(guestResult.lateEnemy.sampleTime - hostFrames.late.time)).toBeLessThan(0.01);
});

test("high-RTT chunk retries stay idempotent without starving live motion until the next chunk", async ({ page }) => {
  test.setTimeout(120_000);
  await openGame(page);

  const frames = await page.evaluate(() => {
    const multiplayer = window.__dustMultiplayerTest;
    const started = multiplayer.startMockHost(["Host", "Guest"]);
    multiplayer.setPlayerPosition("mock-player-2", started.players[0].x, started.players[0].z);
    const viewer = multiplayer.getState().players.find((player) => player.id === "mock-player-2");
    const tracked = multiplayer.spawnEnemyAt(viewer.x + 7, viewer.z, "runner");

    const bootstrap = JSON.parse(JSON.stringify(multiplayer.buildWireSnapshot(false, false, "mock-player-2")));
    multiplayer.acknowledgeClientState("mock-player-2", bootstrap.sequence, 0, false);
    window.advanceTime(220);
    const movement = JSON.parse(JSON.stringify(multiplayer.buildWireSnapshot(false, false, "mock-player-2")));
    multiplayer.acknowledgeClientState("mock-player-2", movement.sequence, 0, false);

    multiplayer.spawnEnemyStressField(1399, "visible");
    multiplayer.acknowledgeClientState("mock-player-2", movement.sequence, 0, true);
    const firstChunk = JSON.parse(JSON.stringify(multiplayer.buildWireSnapshot(false, false, "mock-player-2")));

    // Model a congested Nearby link: the same stop-and-wait chunk is still the
    // newest payload after one high-RTT interval, then is acknowledged.
    window.advanceTime(450);
    const duplicate = JSON.parse(JSON.stringify(multiplayer.buildWireSnapshot(false, false, "mock-player-2")));
    multiplayer.acknowledgeClientState("mock-player-2", duplicate.sequence, 0, false);

    // The next wire opportunity must carry a fresh sample for enemies that the
    // client can already render. Sending only the next frozen membership chunk
    // leaves them stalled for another RTT (and for every remaining chunk).
    window.advanceTime(450);
    const nextDelivery = JSON.parse(JSON.stringify(multiplayer.buildWireSnapshot(false, false, "mock-player-2")));
    const authoritative = multiplayer.getAuthoritativeEnemies().find((enemy) => enemy.id === tracked.id) || null;
    return { tracked, bootstrap, movement, firstChunk, duplicate, nextDelivery, authoritative };
  });

  const firstOps = decodeEnemyOps(frames.firstChunk.enemyDelta);
  const duplicateOps = decodeEnemyOps(frames.duplicate.enemyDelta);
  const nextOps = decodeEnemyOps(frames.nextDelivery.enemyLiveDelta || frames.nextDelivery.enemyDelta);
  const firstTracked = firstOps.find((op) => op.id === frames.tracked.id);
  const duplicateTracked = duplicateOps.find((op) => op.id === frames.tracked.id);
  const nextTracked = nextOps.find((op) => op.id === frames.tracked.id);

  expect(frames.firstChunk.enemyDelta.k).toBe(1);
  expect(frames.firstChunk.enemyDelta.m).toBeGreaterThan(1);
  expect(firstTracked).toBeTruthy();
  expect(frames.duplicate.enemyDelta.e).toBe(frames.firstChunk.enemyDelta.e);
  expect(frames.duplicate.enemyDelta.i).toBe(frames.firstChunk.enemyDelta.i);
  expect(frames.duplicate.enemyDelta.d).toBe(frames.firstChunk.enemyDelta.d);
  expect(duplicateTracked).toEqual(firstTracked);
  expect(frames.duplicate.enemyLiveDelta).toBeTruthy();
  expect(frames.nextDelivery.enemyLiveDelta).toBeTruthy();
  expect(frames.nextDelivery.time - frames.firstChunk.time).toBeGreaterThan(0.75);
  expect(frames.authoritative).toBeTruthy();
  expect(Math.hypot(
    frames.authoritative.x - firstTracked.x,
    frames.authoritative.z - firstTracked.z
  )).toBeGreaterThan(0.25);

  // A duplicate may never perturb motion, but after it is acknowledged the
  // already-visible tracked zombie needs a newer sample before another full
  // RTT is spent on the next membership chunk.
  expect(frames.nextDelivery.enemyLiveDelta.c).toBeGreaterThan(0);
  if (frames.nextDelivery.enemyDelta.k) {
    expect(frames.nextDelivery.enemyDelta.t).toBeGreaterThan(frames.firstChunk.enemyDelta.t + 0.25);
  }
});
