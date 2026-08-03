const path = require("node:path");
const { expect, test } = require("@playwright/test");

const CURRENT_PROTOCOL = 47;

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
    window.__dustMultiplayerTest?.getGuestCombatReplicas &&
    window.__dustMultiplayerTest?.getNetworkCombatDiagnostics
  ));
}

function fireEntries(wire) {
  return [
    ...(wire.firePatches || []),
    ...(wire.hazardUpserts?.firePatches || []),
  ];
}

test("current protocol preserves projectile spawn, hit registration and fire replicas across coalesced snapshots", async ({ page, context }) => {
  test.setTimeout(120_000);
  await openGame(page);
  const guestPage = await context.newPage();
  await openGame(guestPage);

  const captured = await page.evaluate(() => {
    const multiplayer = window.__dustMultiplayerTest;
    multiplayer.startMockHost(["Host", "Guest"]);
    multiplayer.setPlayerPosition("mock-player-1", -18, -16);
    multiplayer.setPlayerPosition("mock-player-2", -10, -16);
    multiplayer.setHealth("mock-player-1", 100);
    multiplayer.setHealth("mock-player-2", 100);

    const cloneWire = () => JSON.parse(JSON.stringify(
      multiplayer.buildWireSnapshot(false, false, "mock-player-2")
    ));
    const acknowledgeStateOnly = (wire) => multiplayer.acknowledgeClientState(
      "mock-player-2",
      wire.sequence,
      0,
      false
    );

    const bootstrap = [];
    let wire = cloneWire();
    for (let attempt = 0; attempt < 16 && wire.enemyDelta?.k === 1; attempt += 1) {
      bootstrap.push(wire);
      acknowledgeStateOnly(wire);
      if (wire.enemyDelta.f === 1) break;
      wire = cloneWire();
    }

    const shooter = multiplayer.getState().players.find((player) => player.id === "mock-player-1");
    const target = multiplayer.spawnEnemyAt(shooter.x + 5, shooter.z, "runner", 100);
    const patch = multiplayer.spawnFirePatch("mock-player-1", {
      x: shooter.x,
      z: shooter.z + 2,
      radius: 0.8,
      life: 2,
      damage: 1,
      type: "thermite",
    });
    const fired = multiplayer.fireAt("mock-player-1", target.x, target.z);
    const authoritativeSpawn = multiplayer.getAuthoritativeBullets()[0] || null;

    // The first creation snapshot is lost. With no ACK, the next snapshot must
    // still carry the projectile, its spawn event and the new fire patch.
    const creationLost = cloneWire();
    multiplayer.stepBullets(0.02);
    const creationDelivered = cloneWire();
    acknowledgeStateOnly(creationDelivered);

    // The bullet reaches the zombie. Again the first result snapshot is lost;
    // combatAck deliberately remains zero so the successor must retain impact.
    multiplayer.stepBullets(0.2);
    const authoritativeAfterImpact = {
      bullets: multiplayer.getAuthoritativeBullets(),
      enemy: multiplayer.getAuthoritativeEnemies().find((enemy) => enemy.id === target.id) || null,
      events: multiplayer.getNetworkCombatDiagnostics().queuedEvents,
    };
    const impactLost = cloneWire();
    const impactDelivered = cloneWire();

    return {
      protocol: multiplayer.getNetworkBudgetDiagnostics().protocol,
      bootstrap,
      fired,
      target,
      patch,
      authoritativeSpawn,
      authoritativeAfterImpact,
      creationLost,
      creationDelivered,
      impactLost,
      impactDelivered,
    };
  });

  const guest = await guestPage.evaluate((run) => {
    const multiplayer = window.__dustMultiplayerTest;
    multiplayer.startMockGuest(["Host", "Guest"], 1);
    run.bootstrap.forEach((wire) => multiplayer.applySnapshot(wire));

    // Neither of the two "Lost" snapshots is ever applied.
    multiplayer.applySnapshot(run.creationDelivered);
    const afterCreation = {
      combat: multiplayer.getGuestCombatReplicas(),
      events: multiplayer.getNetworkCombatDiagnostics().guestEvents,
      enemy: multiplayer.getGuestEnemyDiagnostics().find((enemy) => enemy.id === run.target.id) || null,
    };

    multiplayer.applySnapshot(run.impactDelivered);
    const afterImpact = {
      combat: multiplayer.getGuestCombatReplicas(),
      events: multiplayer.getNetworkCombatDiagnostics().guestEvents,
      enemy: multiplayer.getGuestEnemyDiagnostics().find((enemy) => enemy.id === run.target.id) || null,
    };

    // Fire lifetime is simulated locally. A missing later world snapshot must
    // neither erase it early nor leave it as a permanent ghost.
    window.advanceTime(2300);
    const afterFireExpiry = multiplayer.getGuestCombatReplicas();
    return { afterCreation, afterImpact, afterFireExpiry };
  }, captured);

  const creationSpawnEvent = captured.creationDelivered.combatEvents.find(
    (event) => event.type === "projectileSpawn" && event.ownerId === "mock-player-1"
  );
  const impactEvent = captured.impactDelivered.combatEvents.find(
    (event) => event.type === "projectileImpact" && event.ownerId === "mock-player-1"
  );
  const creationFire = fireEntries(captured.creationDelivered).find(
    (entry) => entry.id === captured.patch.networkId
  );
  const guestBullet = guest.afterCreation.combat.bullets.find(
    (bullet) => bullet.id === captured.authoritativeSpawn.id
  );
  const guestFireAfterCreation = guest.afterCreation.combat.firePatches.find(
    (patch) => patch.id === captured.patch.networkId
  );
  const guestFireAfterImpact = guest.afterImpact.combat.firePatches.find(
    (patch) => patch.id === captured.patch.networkId
  );
  const guestImpactEvent = guest.afterImpact.events.find(
    (event) => event.type === "projectileImpact" && event.ownerId === "mock-player-1"
  );
  const report = {
    protocol: captured.protocol,
    sequences: {
      creationLost: captured.creationLost.sequence,
      creationDelivered: captured.creationDelivered.sequence,
      impactLost: captured.impactLost.sequence,
      impactDelivered: captured.impactDelivered.sequence,
    },
    creationDelivered: {
      bullets: captured.creationDelivered.bullets.length,
      fireUpserts: fireEntries(captured.creationDelivered).length,
      combatEvents: captured.creationDelivered.combatEvents.map((event) => event.type),
    },
    impactDelivered: {
      bullets: captured.impactDelivered.bullets.length,
      combatEvents: captured.impactDelivered.combatEvents.map((event) => event.type),
    },
    authoritativeEnemyHp: captured.authoritativeAfterImpact.enemy?.hp,
    guestEnemyAfterCreation: guest.afterCreation.enemy || null,
    guestEnemyHp: guest.afterImpact.enemy?.hp,
    guestBulletsAfterImpact: guest.afterImpact.combat.bullets.length,
    guestFireAfterImpact: Boolean(guestFireAfterImpact),
    guestFireAfterExpiry: guest.afterFireExpiry.firePatches.length,
  };
  const details = JSON.stringify(report, null, 2);
  console.log(`current protocol combat coalescing metrics\n${details}`);

  expect(captured.protocol, details).toBe(CURRENT_PROTOCOL);
  expect(captured.fired, details).toBe(true);
  expect(captured.authoritativeSpawn, details).toBeTruthy();
  expect(captured.creationDelivered.sequence, details).toBeGreaterThan(captured.creationLost.sequence);
  expect(captured.impactDelivered.sequence, details).toBeGreaterThan(captured.impactLost.sequence);

  expect(creationSpawnEvent, details).toBeTruthy();
  expect(creationFire, details).toBeTruthy();
  expect(captured.creationDelivered.bullets.some(
    (bullet) => bullet.id === captured.authoritativeSpawn.id
  ), details).toBe(true);
  expect(guestBullet, details).toMatchObject({
    id: captured.authoritativeSpawn.id,
    visualVisible: true,
    instanceVisible: true,
  });
  expect(guestFireAfterCreation, details).toMatchObject({
    id: captured.patch.networkId,
    visualAttached: true,
  });

  expect(captured.authoritativeAfterImpact.bullets, details).toEqual([]);
  expect(captured.authoritativeAfterImpact.enemy.hp, details).toBeLessThan(captured.target.hp);
  expect(impactEvent, details).toMatchObject({
    impactKind: "enemy",
    targetEnemyId: captured.target.id,
  });
  expect(captured.impactDelivered.bullets, details).toEqual([]);
  expect(guestImpactEvent, details).toMatchObject({
    type: "projectileImpact",
    ownerId: "mock-player-1",
  });
  expect(guest.afterImpact.combat.bullets, details).toEqual([]);
  expect(guest.afterCreation.enemy, details).toBeTruthy();
  expect(guest.afterImpact.enemy, details).toBeTruthy();
  expect(guest.afterImpact.enemy.hp, details).toBeCloseTo(captured.authoritativeAfterImpact.enemy.hp, 0);
  expect(guestFireAfterImpact, details).toBeTruthy();
  expect(guest.afterFireExpiry.firePatches, details).toEqual([]);
});
