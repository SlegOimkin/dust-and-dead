const path = require("node:path");
const { expect, test } = require("@playwright/test");

function fileUrl(relativePath) {
  const absolute = path.resolve(__dirname, "..", relativePath).replace(/\\/g, "/");
  return `file:///${absolute}`;
}

function installHitRegistrationHelpers() {
  window.__hitRegistrationV13 = {
    equipRifle(api, playerId) {
      const player = api.getState().players.find((entry) => entry.id === playerId);
      return api.setProgression(playerId, {
        weapon: "rifle",
        ownedWeapons: { revolver: true, rifle: true, launcher: false, coachGun: false },
        ammo: Object.assign({}, player.progression.ammo, { rifle: 18 }),
        ammoReserve: { revolver: 30, rifle: 54, launcher: 18, coachGun: 30 },
        reloadTimers: Object.assign({}, player.progression.reloadTimers, { rifle: 0 }),
      });
    },
  };
}

async function openGame(page) {
  await page.addInitScript(installHitRegistrationHelpers);
  await page.goto(`${fileUrl("index.html")}?mapSeed=7331`);
  const intro = page.locator("#intro-screen");
  if (await intro.isVisible().catch(() => false)) {
    await page.keyboard.press("KeyM");
    await expect(intro).toBeHidden();
  }
  await page.waitForFunction(() => Boolean(
    window.__dustMultiplayerTest?.spawnEnemyAt &&
    window.__dustMultiplayerTest?.stepBullets &&
    window.__dustMultiplayerTest?.getAuthoritativeBullets &&
    window.__dustMultiplayerTest?.getAuthoritativeEnemies &&
    window.__dustMultiplayerTest?.setNetworkRtt
  ));
}

test.describe.configure({ mode: "serial" });

test("a client rifle bullet sweeps through a zombie during one 40 ms physics step", async ({ page }) => {
  await openGame(page);

  const result = await page.evaluate(() => {
    const api = window.__dustMultiplayerTest;
    api.startMockHost(["Host", "Guest"]);
    api.setPlayerPosition("mock-player-1", -10, -10);
    api.setPlayerPosition("mock-player-2", 0, 0);
    window.__hitRegistrationV13.equipRifle(api, "mock-player-2");

    const shooter = api.getState().players.find((player) => player.id === "mock-player-2");
    const target = api.spawnEnemyAt(shooter.x + 2.28, shooter.z, "runner", 10);
    const fired = api.fireAt("mock-player-2", target.x, target.z);
    const before = api.getAuthoritativeBullets();
    const bullet = before[0];
    const aimLength = Math.hypot(target.x - shooter.x, target.z - shooter.z);
    const dirX = (target.x - shooter.x) / aimLength;
    const dirZ = (target.z - shooter.z) / aimLength;
    const endpointX = bullet.x + dirX * bullet.speed * 0.04;
    const endpointZ = bullet.z + dirZ * bullet.speed * 0.04;
    const combinedRadius = target.radius + 0.18;
    const startDistance = Math.hypot(bullet.x - target.x, bullet.z - target.z);
    const endpointDistance = Math.hypot(endpointX - target.x, endpointZ - target.z);

    api.stepBullets(0.04);
    const enemyAfter = api.getAuthoritativeEnemies().find((enemy) => enemy.id === target.id);
    const impact = api.getNetworkCombatDiagnostics().queuedEvents.find(
      (event) => event.type === "projectileImpact" && event.ownerId === "mock-player-2"
    );
    return {
      fired,
      before,
      after: api.getAuthoritativeBullets(),
      target,
      enemyAfter,
      impact,
      combinedRadius,
      startDistance,
      endpointDistance,
    };
  });

  expect(result.fired).toBe(true);
  expect(result.before).toHaveLength(1);
  // Neither endpoint overlaps the runner: only a segment sweep can register it.
  expect(result.startDistance).toBeGreaterThan(result.combinedRadius);
  expect(result.endpointDistance).toBeGreaterThan(result.combinedRadius);
  expect(result.enemyAfter.hp).toBeLessThan(result.target.hp);
  expect(result.after).toEqual([]);
  expect(result.impact).toMatchObject({
    impactKind: "enemy",
    targetEnemyId: result.target.id,
  });
});

test("a client rifle bullet sweeps through another player during one 40 ms physics step", async ({ page }) => {
  await openGame(page);

  const result = await page.evaluate(() => {
    const api = window.__dustMultiplayerTest;
    api.startMockHost(["Target", "Guest"]);
    api.setPlayerPosition("mock-player-2", 0, 0);
    window.__hitRegistrationV13.equipRifle(api, "mock-player-2");

    const shooter = api.getState().players.find((player) => player.id === "mock-player-2");
    api.setPlayerPosition("mock-player-1", shooter.x + 2.17, shooter.z);
    api.setHealth("mock-player-1", 120);
    const target = api.getState().players.find((player) => player.id === "mock-player-1");
    const fired = api.fireAt("mock-player-2", target.x, target.z);
    const before = api.getAuthoritativeBullets();
    const bullet = before[0];
    const aimLength = Math.hypot(target.x - shooter.x, target.z - shooter.z);
    const dirX = (target.x - shooter.x) / aimLength;
    const dirZ = (target.z - shooter.z) / aimLength;
    const endpointX = bullet.x + dirX * bullet.speed * 0.04;
    const endpointZ = bullet.z + dirZ * bullet.speed * 0.04;
    const combinedRadius = 0.72 + 0.18;
    const startDistance = Math.hypot(bullet.x - target.x, bullet.z - target.z);
    const endpointDistance = Math.hypot(endpointX - target.x, endpointZ - target.z);

    api.stepBullets(0.04);
    const targetAfter = api.getState().players.find((player) => player.id === "mock-player-1");
    const impact = api.getNetworkCombatDiagnostics().queuedEvents.find(
      (event) => event.type === "projectileImpact" && event.ownerId === "mock-player-2"
    );
    return {
      fired,
      before,
      after: api.getAuthoritativeBullets(),
      target,
      targetAfter,
      impact,
      combinedRadius,
      startDistance,
      endpointDistance,
    };
  });

  expect(result.fired).toBe(true);
  expect(result.before).toHaveLength(1);
  // The projectile starts in contact, then moves beyond the target in this frame.
  // An endpoint-only check would miss; the swept check must preserve the hit.
  expect(result.startDistance).toBeLessThan(result.combinedRadius);
  expect(result.endpointDistance).toBeGreaterThan(result.combinedRadius);
  expect(result.targetAfter.hp).toBeLessThan(result.target.hp);
  expect(result.after).toEqual([]);
  expect(result.impact).toMatchObject({
    impactKind: "player",
    targetId: "mock-player-1",
  });
});

test("a wall impact wins when the wall is earlier on the sweep than the zombie", async ({ page }) => {
  await openGame(page);

  const result = await page.evaluate(() => {
    const api = window.__dustMultiplayerTest;
    const game = window.__dustAndDeadTest;
    api.startMockHost(["Host", "Guest"]);
    api.setPlayerPosition("mock-player-1", -10, -10);

    // Ruins expose their deterministic transform through the existing map diagnostics.
    // Their collider is centered 0.18 world units forward, matching map construction.
    const ruin = game.validateMapLayout().interestPoints.find((point) => point.type === "ruin");
    const center = { x: ruin.x, z: ruin.z + 0.18 };
    const axis = { x: Math.cos(ruin.rotation), z: -Math.sin(ruin.rotation) };
    api.setPlayerPosition(
      "mock-player-2",
      center.x - axis.x * 6,
      center.z - axis.z * 6
    );
    window.__hitRegistrationV13.equipRifle(api, "mock-player-2");

    const shooter = api.getState().players.find((player) => player.id === "mock-player-2");
    const target = api.spawnEnemyAt(
      center.x + axis.x * 5.3,
      center.z + axis.z * 5.3,
      "runner",
      10
    );
    const fired = api.fireAt("mock-player-2", target.x, target.z);
    const before = api.getAuthoritativeBullets();
    const targetDistanceFromMuzzle = Math.hypot(
      target.x - before[0].x,
      target.z - before[0].z
    );

    api.stepBullets(0.24);
    const enemyAfter = api.getAuthoritativeEnemies().find((enemy) => enemy.id === target.id);
    const impact = api.getNetworkCombatDiagnostics().queuedEvents.find(
      (event) => event.type === "projectileImpact" && event.ownerId === "mock-player-2"
    );
    return {
      fired,
      before,
      after: api.getAuthoritativeBullets(),
      target,
      enemyAfter,
      impact,
      targetDistanceFromMuzzle,
    };
  });

  expect(result.fired).toBe(true);
  expect(result.before).toHaveLength(1);
  // The same step is long enough to reach the zombie if the ruin were ignored.
  expect(result.before[0].speed * 0.24).toBeGreaterThan(result.targetDistanceFromMuzzle);
  expect(result.enemyAfter.hp).toBe(result.target.hp);
  expect(result.after).toEqual([]);
  expect(result.impact).toMatchObject({
    impactKind: "world",
    targetEnemyId: 0,
  });
});

test("the host accepts a trusted moving origin, rejects an implausible one, and applies action age", async ({ page }) => {
  await openGame(page);

  const result = await page.evaluate(() => {
    const api = window.__dustMultiplayerTest;

    function runShot(actionAgeMs, originOffset) {
      api.startMockHost(["Host", "Guest"]);
      api.setPlayerPosition("mock-player-1", -10, -10);
      api.setPlayerPosition("mock-player-2", 0, 0);
      api.setNetworkRtt("mock-player-2", 0);
      const shooter = api.getState().players.find((player) => player.id === "mock-player-2");
      const reportedOrigin = { x: shooter.x + originOffset, z: shooter.z };
      const queued = api.injectFireAction("mock-player-2", 1, Math.PI / 2, 20, {
        weaponId: "revolver",
        originX: reportedOrigin.x,
        originZ: reportedOrigin.z,
        actionAgeMs,
      });
      window.advanceTime(17);
      const state = api.getState();
      const player = state.players.find((entry) => entry.id === "mock-player-2");
      const spawn = api.getNetworkCombatDiagnostics().queuedEvents.find(
        (event) => event.type === "projectileSpawn" && event.ownerId === "mock-player-2"
      );
      const bullet = api.getAuthoritativeBullets().find((entry) => entry.ownerId === "mock-player-2");
      return {
        queued,
        shooter,
        reportedOrigin,
        player,
        spawn,
        bullet,
        travel: bullet ? Math.hypot(bullet.x - spawn.startX, bullet.z - spawn.startZ) : null,
      };
    }

    return {
      baseline: runShot(0, 2),
      aged: runShot(40, 2),
      rejectedOrigin: runShot(0, 20),
    };
  });

  for (const shot of [result.baseline, result.aged, result.rejectedOrigin]) {
    expect(shot.queued).toBe(true);
    expect(shot.player).toMatchObject({
      lastProcessedFireActionSequence: 1,
      lastFireActionAccepted: true,
    });
    expect(shot.player.pendingFireResults).toEqual([
      { sequence: 1, accepted: true, reason: "accepted" },
    ]);
    // Temporarily using a reported origin must never move the authoritative avatar.
    expect(shot.player.x).toBeCloseTo(shot.shooter.x, 3);
    expect(shot.player.z).toBeCloseTo(shot.shooter.z, 3);
  }

  // A plausible client-predicted origin two units ahead is retained by the host.
  expect(result.baseline.spawn.startX).toBeCloseTo(result.baseline.reportedOrigin.x + 0.95, 3);
  expect(result.aged.spawn.startX).toBeCloseTo(result.aged.reportedOrigin.x + 0.95, 3);
  // Forty milliseconds of reported action age advances the 29 u/s bullet by 1.16 units.
  expect(result.aged.travel - result.baseline.travel).toBeCloseTo(29 * 0.04, 2);
  // An origin far outside the validation window falls back to the host position.
  expect(result.rejectedOrigin.spawn.startX).toBeCloseTo(result.rejectedOrigin.shooter.x + 0.95, 3);
  expect(result.rejectedOrigin.spawn.startX).not.toBeCloseTo(
    result.rejectedOrigin.reportedOrigin.x + 0.95,
    1
  );
});

test("a validated target claim compensates the delayed position seen by the shooter", async ({ page }) => {
  await openGame(page);

  const result = await page.evaluate(() => {
    const api = window.__dustMultiplayerTest;

    function run(withClaim) {
      api.startMockHost(["Target", "Guest"]);
      api.setPlayerPosition("mock-player-1", -18, -16);
      api.setPlayerPosition("mock-player-2", -25, -16);
      api.setNetworkRtt("mock-player-2", 200);
      api.setHealth("mock-player-1", 120);
      const shooter = api.getState().players.find((player) => player.id === "mock-player-2");
      const claimed = { x: shooter.x + 7, z: shooter.z };
      api.setPlayerPosition("mock-player-1", claimed.x, claimed.z + 1.2);
      const targetBefore = api.getState().players.find((player) => player.id === "mock-player-1");
      const queued = api.injectFireAction("mock-player-2", 1, Math.PI / 2, 20, {
        weaponId: "revolver",
        originX: shooter.x,
        originZ: shooter.z,
        targetKind: withClaim ? "player" : "",
        targetId: withClaim ? "mock-player-1" : "",
        targetX: withClaim ? claimed.x : undefined,
        targetZ: withClaim ? claimed.z : undefined,
      });
      window.advanceTime(420);
      const targetAfter = api.getState().players.find((player) => player.id === "mock-player-1");
      const impact = api.getNetworkCombatDiagnostics().queuedEvents.find(
        (event) => event.type === "projectileImpact" && event.ownerId === "mock-player-2"
      );
      return { queued, targetBefore, targetAfter, impact };
    }

    return { withoutClaim: run(false), withClaim: run(true) };
  });

  expect(result.withoutClaim.queued).toBe(true);
  expect(result.withoutClaim.targetAfter.hp).toBe(result.withoutClaim.targetBefore.hp);
  expect(result.withClaim.queued).toBe(true);
  expect(result.withClaim.targetAfter.hp).toBeLessThan(result.withClaim.targetBefore.hp);
  expect(result.withClaim.impact).toMatchObject({ impactKind: "player", targetId: "mock-player-1" });
});
