const path = require("node:path");
const { expect, test } = require("@playwright/test");
const { decodeEnemyOps } = require("./helpers/enemy-wire-decoder");

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
    window.__dustMultiplayerTest?.acknowledgeClientState &&
    window.__dustMultiplayerTest?.getGuestEnemyDiagnostics
  ));
}

test("a zombie introduced by live delta during recovery survives final membership reconciliation", async ({ page, context }) => {
  test.setTimeout(120_000);
  await openGame(page);
  const guestPage = await context.newPage();
  await openGame(guestPage);

  const run = await page.evaluate(() => {
    const multiplayer = window.__dustMultiplayerTest;
    const started = multiplayer.startMockHost(["Host", "Guest"]);
    const center = started.players[0];
    multiplayer.spawnEnemyStressField(1400, "visible");
    multiplayer.setPlayerPosition("mock-player-1", center.x + 29, center.z);
    multiplayer.setPlayerPosition("mock-player-2", center.x + 29, center.z);

    const cloneWire = () => JSON.parse(JSON.stringify(
      multiplayer.buildWireSnapshot(false, false, "mock-player-2")
    ));
    const acknowledge = (wire, requestKeyframe) => multiplayer.acknowledgeClientState(
      "mock-player-2",
      wire.sequence,
      0,
      !!requestKeyframe
    );

    const initialFrames = [];
    let frame = cloneWire();
    while (frame.enemyDelta?.k === 1) {
      initialFrames.push(frame);
      acknowledge(frame, false);
      if (frame.enemyDelta.f === 1) break;
      frame = cloneWire();
    }

    acknowledge(initialFrames[initialFrames.length - 1], true);
    const recoveryFrames = [];
    frame = cloneWire();
    recoveryFrames.push(frame);
    acknowledge(frame, false);

    const viewer = multiplayer.getState().players.find((player) => player.id === "mock-player-2");
    const newcomer = multiplayer.spawnEnemyAt(viewer.x + 3, viewer.z + 8, "runner");

    while (frame.enemyDelta?.f !== 1) {
      frame = cloneWire();
      recoveryFrames.push(frame);
      acknowledge(frame, false);
    }

    return { initialFrames, recoveryFrames, newcomer };
  });

  expect(run.recoveryFrames[0].enemyDelta).toMatchObject({ k: 1, i: 0 });
  expect(run.recoveryFrames[0].enemyDelta.m).toBeGreaterThan(1);
  const liveIntroduction = run.recoveryFrames
    .slice(1)
    .flatMap((wire) => wire.enemyLiveDelta ? decodeEnemyOps(wire.enemyLiveDelta) : [])
    .find((op) => op.id === run.newcomer.id);
  expect(liveIntroduction).toMatchObject({ id: run.newcomer.id, kind: 0 });

  const immediatelyAfter = await guestPage.evaluate(({ initialFrames, recoveryFrames, newcomerId }) => {
    const multiplayer = window.__dustMultiplayerTest;
    multiplayer.startMockGuest(["Host", "Guest"], 1);
    initialFrames.forEach((wire) => multiplayer.applySnapshot(wire));
    recoveryFrames.forEach((wire) => multiplayer.applySnapshot(wire));
    return multiplayer.getGuestEnemyDiagnostics().find((enemy) => enemy.id === newcomerId) || null;
  }, {
    initialFrames: run.initialFrames,
    recoveryFrames: run.recoveryFrames,
    newcomerId: run.newcomer.id,
  });

  expect(immediatelyAfter).toMatchObject({ id: run.newcomer.id, attached: true });

  // Missing membership is retired after a grace period, not synchronously at
  // the final chunk. Waiting here catches a latent disappear-after-reconcile.
  await guestPage.waitForTimeout(1150);
  const afterRetirementGrace = await guestPage.evaluate((newcomerId) => {
    window.advanceTime(17);
    return window.__dustMultiplayerTest.getGuestEnemyDiagnostics()
      .find((enemy) => enemy.id === newcomerId) || null;
  }, run.newcomer.id);
  expect(afterRetirementGrace).toMatchObject({ id: run.newcomer.id, attached: true });
});

test("fresh live movement and tombstone win over a retried frozen recovery chunk", async ({ page, context }) => {
  test.setTimeout(120_000);
  await openGame(page);
  const guestPage = await context.newPage();
  await openGame(guestPage);

  const run = await page.evaluate(() => {
    const multiplayer = window.__dustMultiplayerTest;
    const game = window.__dustAndDeadTest;
    const started = multiplayer.startMockHost(["Host", "Guest"]);
    const center = started.players[0];
    multiplayer.spawnEnemyStressField(1400, "visible");
    multiplayer.setPlayerPosition("mock-player-1", center.x + 29, center.z);
    multiplayer.setPlayerPosition("mock-player-2", center.x + 29, center.z);
    const target = multiplayer.spawnEnemyAt(center.x + 32, center.z, "runner");

    const cloneWire = () => JSON.parse(JSON.stringify(
      multiplayer.buildWireSnapshot(false, false, "mock-player-2")
    ));
    const acknowledge = (wire, requestKeyframe) => multiplayer.acknowledgeClientState(
      "mock-player-2",
      wire.sequence,
      0,
      !!requestKeyframe
    );

    const initialFrames = [];
    let frame = cloneWire();
    while (frame.enemyDelta?.k === 1) {
      initialFrames.push(frame);
      acknowledge(frame, false);
      if (frame.enemyDelta.f === 1) break;
      frame = cloneWire();
    }

    acknowledge(initialFrames[initialFrames.length - 1], true);
    const frozen = cloneWire();

    window.advanceTime(180);
    const liveMovement = cloneWire();
    const currentTarget = multiplayer.getAuthoritativeEnemies()
      .find((enemy) => enemy.id === target.id);
    multiplayer.setPlayerPosition("mock-player-1", currentTarget.x - 0.2, currentTarget.z);
    multiplayer.setPlayerPosition("mock-player-2", currentTarget.x - 0.2, currentTarget.z);
    game.killNearestZombie();
    const targetStillAuthoritative = multiplayer.getAuthoritativeEnemies()
      .some((enemy) => enemy.id === target.id);
    const liveTombstone = cloneWire();

    // ACK the newest retry: its primary block is the same frozen chunk, while
    // its live block contains the authoritative death.
    acknowledge(liveTombstone, false);
    const remainingRecoveryFrames = [];
    frame = cloneWire();
    while (frame.enemyDelta?.k === 1) {
      remainingRecoveryFrames.push(frame);
      acknowledge(frame, false);
      if (frame.enemyDelta.f === 1) break;
      frame = cloneWire();
    }

    return {
      target,
      initialFrames,
      frozen,
      liveMovement,
      liveTombstone,
      remainingRecoveryFrames,
      targetStillAuthoritative,
    };
  });

  expect(run.frozen.enemyDelta).toMatchObject({ k: 1, i: 0 });
  expect(run.frozen.enemyDelta.m).toBeGreaterThan(1);
  expect(run.liveMovement.enemyDelta.d).toBe(run.frozen.enemyDelta.d);
  expect(run.liveTombstone.enemyDelta.d).toBe(run.frozen.enemyDelta.d);
  expect(run.targetStillAuthoritative).toBe(false);

  const frozenTarget = decodeEnemyOps(run.frozen.enemyDelta)
    .find((op) => op.id === run.target.id);
  const movementTarget = decodeEnemyOps(run.liveMovement.enemyLiveDelta)
    .find((op) => op.id === run.target.id);
  const tombstoneTarget = decodeEnemyOps(run.liveTombstone.enemyLiveDelta)
    .find((op) => op.id === run.target.id);
  expect(frozenTarget).toMatchObject({ id: run.target.id, kind: 0 });
  expect(movementTarget).toMatchObject({ id: run.target.id, kind: 1 });
  expect(tombstoneTarget).toMatchObject({ id: run.target.id, kind: 3 });
  expect(Math.hypot(movementTarget.x - frozenTarget.x, movementTarget.z - frozenTarget.z)).toBeGreaterThan(0.05);

  const guestResult = await guestPage.evaluate((captured) => {
    const multiplayer = window.__dustMultiplayerTest;
    multiplayer.startMockGuest(["Host", "Guest"], 1);
    captured.initialFrames.forEach((wire) => multiplayer.applySnapshot(wire));
    multiplayer.applySnapshot(captured.frozen);
    multiplayer.applySnapshot(captured.liveMovement);
    const afterMovement = multiplayer.getGuestEnemyDiagnostics()
      .find((enemy) => enemy.id === captured.targetId) || null;
    multiplayer.applySnapshot(captured.liveTombstone);
    const afterTombstone = multiplayer.getGuestEnemyDiagnostics()
      .find((enemy) => enemy.id === captured.targetId) || null;
    captured.remainingRecoveryFrames.forEach((wire) => multiplayer.applySnapshot(wire));
    const afterFinalReconcile = multiplayer.getGuestEnemyDiagnostics()
      .find((enemy) => enemy.id === captured.targetId) || null;
    return { afterMovement, afterTombstone, afterFinalReconcile };
  }, {
    targetId: run.target.id,
    initialFrames: run.initialFrames,
    frozen: run.frozen,
    liveMovement: run.liveMovement,
    liveTombstone: run.liveTombstone,
    remainingRecoveryFrames: run.remainingRecoveryFrames,
  });

  expect(guestResult.afterMovement).toBeTruthy();
  expect(guestResult.afterMovement.targetX).toBeCloseTo(movementTarget.x, 3);
  expect(guestResult.afterMovement.targetZ).toBeCloseTo(movementTarget.z, 3);
  expect(guestResult.afterTombstone).toBeNull();
  expect(guestResult.afterFinalReconcile).toBeNull();
});
