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
    window.__dustAndDeadTest?.getZombieOptimizationStats
  ));
}

test("a scoped removal does not release and recreate an active zombie at the normal gameplay boundary", async ({ page, context }) => {
  await openGame(page);
  const guestPage = await context.newPage();
  await openGame(guestPage);

  const frames = await page.evaluate(() => {
    const multiplayer = window.__dustMultiplayerTest;
    multiplayer.startMockHost(["Host", "Guest"]);
    multiplayer.setPlayerPosition("mock-player-2", 0, 0);
    const guest = multiplayer.getState().players.find((player) => player.id === "mock-player-2");
    const origin = { x: guest.x, z: guest.z };
    const probe = multiplayer.buildSnapshot(false, false, "mock-player-2");
    const spawned = multiplayer.spawnEnemyAt(
      probe.enemyScope.minX + 2.25,
      (probe.enemyScope.minZ + probe.enemyScope.maxZ) * 0.5,
      "brute",
      5
    );

    const initial = multiplayer.buildWireSnapshot(false, false, "mock-player-2");
    multiplayer.acknowledgeClientState("mock-player-2", initial.sequence, 0, false);

    // A short ordinary movement is enough to put this off-screen zombie just
    // beyond the padded relevance boundary. It remains authoritative and can
    // cross back into the scope on the next movement sample.
    multiplayer.setPlayerPosition("mock-player-2", origin.x + 8, origin.z);
    const outside = multiplayer.buildWireSnapshot(false, false, "mock-player-2");
    multiplayer.acknowledgeClientState("mock-player-2", outside.sequence, 0, false);

    multiplayer.setPlayerPosition("mock-player-2", origin.x, origin.z);
    const returned = multiplayer.buildWireSnapshot(false, false, "mock-player-2");
    return { spawned, probeScope: probe.enemyScope, initial, outside, returned };
  });

  expect(decodeEnemyOpKinds(frames.initial.enemyDelta)).toEqual([
    { id: frames.spawned.id, kind: 0 },
  ]);
  expect(
    decodeEnemyOpKinds(frames.outside.enemyDelta),
    JSON.stringify({ spawned: frames.spawned, probe: frames.probeScope, outside: frames.outside.enemyScope })
  ).toEqual([
    { id: frames.spawned.id, kind: 2 },
  ]);
  expect(decodeEnemyOpKinds(frames.returned.enemyDelta)).toEqual([
    { id: frames.spawned.id, kind: 0 },
  ]);

  const result = await guestPage.evaluate(({ initial, outside, returned, enemyId }) => {
    const multiplayer = window.__dustMultiplayerTest;
    const game = window.__dustAndDeadTest;
    multiplayer.startMockGuest(["Host", "Guest"], 1);

    multiplayer.applySnapshot(initial);
    const before = {
      enemies: multiplayer.getGuestEnemyDiagnostics(),
      pool: game.getZombieOptimizationStats().pools.brute,
    };

    multiplayer.applySnapshot(outside);
    const whileOutside = {
      enemies: multiplayer.getGuestEnemyDiagnostics(),
      pool: game.getZombieOptimizationStats().pools.brute,
    };

    multiplayer.applySnapshot(returned);
    const afterReturn = {
      enemies: multiplayer.getGuestEnemyDiagnostics(),
      pool: game.getZombieOptimizationStats().pools.brute,
    };
    return { enemyId, before, whileOutside, afterReturn };
  }, {
    initial: frames.initial,
    outside: frames.outside,
    returned: frames.returned,
    enemyId: frames.spawned.id,
  });

  expect(result.before.enemies.map((enemy) => enemy.id)).toEqual([result.enemyId]);
  expect(result.before.enemies[0].attached).toBe(true);

  // Scope churn is not an authoritative death. Keep the replica alive briefly
  // so a quick return to the same relevance boundary cannot create a visible
  // one-frame disappearance or force a pool release/acquire cycle.
  expect(result.whileOutside.enemies.map((enemy) => enemy.id)).toEqual([result.enemyId]);
  expect(result.whileOutside.enemies[0].attached).toBe(true);
  expect(result.whileOutside.pool.inUse).toBe(result.before.pool.inUse);
  expect(result.whileOutside.pool.available).toBe(result.before.pool.available);

  expect(result.afterReturn.enemies.map((enemy) => enemy.id)).toEqual([result.enemyId]);
  expect(result.afterReturn.enemies[0].attached).toBe(true);
  expect(result.afterReturn.pool.created).toBe(result.before.pool.created);
  expect(result.afterReturn.pool.inUse).toBe(result.before.pool.inUse);
});
