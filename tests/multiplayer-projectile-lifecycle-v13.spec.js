const path = require("node:path");
const { expect, test } = require("@playwright/test");

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
    window.__dustMultiplayerTest?.getGuestCombatReplicas &&
    window.__dustMultiplayerTest?.applySnapshot &&
    window.render_game_to_text &&
    window.advanceTime
  ));
}

test("projectile despawn and impact events are terminal and release their instances", async ({ page }) => {
  await openGame(page);

  const result = await page.evaluate(() => {
    const api = window.__dustMultiplayerTest;
    const started = api.startMockGuest(["Host", "Guest"], 1);
    const host = started.players[0];
    const readPools = () => JSON.parse(window.render_game_to_text()).optimization.projectileVisualPools;
    const baseline = readPools();

    const projectile = (id) => ({
      id,
      ownerId: "mock-player-1",
      clientFireSequence: 0,
      type: "revolver",
      startX: host.x,
      startY: 1.18,
      startZ: host.z,
      x: host.x + 0.5,
      y: 1.18,
      z: host.z,
      dirX: 1,
      dirZ: 0,
      speed: 29,
      life: 0.7,
      hitRadius: 0.24,
      visualWidth: 0.14,
      visualLength: 0.82,
      chainLightning: false,
      piercing: false,
    });
    const spawnEvent = (id, sequence) => ({
      sequence,
      type: "projectileSpawn",
      projectileId: id,
      ownerId: "mock-player-1",
      clientFireSequence: 0,
      projectileType: "revolver",
      startX: host.x,
      startY: 1.18,
      startZ: host.z,
      x: host.x + 0.5,
      y: 1.18,
      z: host.z,
      dirX: 1,
      dirZ: 0,
      speed: 29,
      life: 0.7,
      hitRadius: 0.24,
      visualWidth: 0.14,
      visualLength: 0.82,
      chainLightning: false,
      piercing: false,
    });

    const first = api.buildSnapshot();
    first.sequence = 1;
    first.bullets = [projectile(9101)];
    first.combatEvents = [spawnEvent(9101, 1)];
    api.applySnapshot(first);
    const duringFlight = {
      bullets: api.getGuestCombatReplicas().bullets,
      pools: readPools(),
    };

    const despawn = JSON.parse(JSON.stringify(first));
    despawn.sequence = 2;
    despawn.bullets = [];
    despawn.combatEvents = [{
      sequence: 2,
      type: "projectileDespawn",
      projectileId: 9101,
      ownerId: "mock-player-1",
    }];
    api.applySnapshot(despawn);
    const afterDespawn = {
      bullets: api.getGuestCombatReplicas().bullets,
      pools: readPools(),
    };

    const impact = JSON.parse(JSON.stringify(first));
    impact.sequence = 3;
    impact.bullets = [];
    impact.combatEvents = [
      spawnEvent(9102, 3),
      {
        ...spawnEvent(9102, 4),
        type: "projectileImpact",
        impactKind: "enemy",
        impactX: host.x + 1.2,
        impactY: 1.18,
        impactZ: host.z,
      },
    ];
    api.applySnapshot(impact);
    const afterImpact = {
      bullets: api.getGuestCombatReplicas().bullets,
      pools: readPools(),
      events: api.getNetworkCombatDiagnostics().guestEvents.map((event) => event.type),
    };

    return { baseline, duringFlight, afterDespawn, afterImpact };
  });

  expect(result.duringFlight.bullets).toHaveLength(1);
  expect(result.duringFlight.bullets[0]).toMatchObject({
    id: 9101,
    type: "revolver",
    visualKind: "standard",
    instanceVisible: true,
  });
  expect(result.duringFlight.pools.standard.inUse).toBe(result.baseline.standard.inUse + 1);
  expect(result.duringFlight.pools.standard.drawnInstances).toBe(result.baseline.standard.drawnInstances + 1);

  expect(result.afterDespawn.bullets).toEqual([]);
  expect(result.afterDespawn.pools.standard.inUse).toBe(result.baseline.standard.inUse);
  expect(result.afterDespawn.pools.standard.drawnInstances).toBe(result.baseline.standard.drawnInstances);

  expect(result.afterImpact.bullets).toEqual([]);
  expect(result.afterImpact.pools.standard.inUse).toBe(result.baseline.standard.inUse);
  expect(result.afterImpact.pools.standard.drawnInstances).toBe(result.baseline.standard.drawnInstances);
  expect(result.afterImpact.events).toEqual([
    "projectileSpawn",
    "projectileDespawn",
    "projectileSpawn",
    "projectileImpact",
  ]);
});

test("impact-only snapshots apply post-hit enemy HP once for guest revolver and launcher shots", async ({ page }) => {
  await openGame(page);

  const result = await page.evaluate(() => {
    const api = window.__dustMultiplayerTest;
    const game = window.__dustAndDeadTest;

    function runCase(weapon, caseIndex) {
      const started = api.startMockHost(["Host", "Guest"], `impact-hp-${weapon}-${caseIndex}`);
      const guest = started.players[1];
      api.setPlayerPosition("mock-player-1", guest.x - 20, guest.z - 20);
      api.setProgression("mock-player-2", {
        weapon,
        ownedWeapons: { revolver: true, rifle: true, launcher: true, coachGun: true },
        ammo: { revolver: 6, rifle: 18, launcher: 3, coachGun: 2 },
        ammoReserve: { revolver: 30, rifle: 54, launcher: 9, coachGun: 12 },
        reloadTimers: { revolver: 0, rifle: 0, launcher: 0, coachGun: 0 },
      });
      const target = api.spawnEnemyAt(guest.x + 4, guest.z, "walker", 180);
      const initial = api.buildSnapshot(false, false, "mock-player-2");
      const dx = target.x - guest.x;
      const dz = target.z - guest.z;
      const accepted = api.injectFireAction(
        "mock-player-2",
        1,
        Math.atan2(dx, dz),
        Math.hypot(dx, dz),
        {
          weaponId: weapon,
          targetKind: "enemy",
          targetId: target.id,
          targetX: target.x,
          targetZ: target.z,
        }
      );
      window.advanceTime(17);
      api.stepBullets(0.5);
      const authoritativeTarget = api.getAuthoritativeEnemies().find((enemy) => enemy.id === target.id);
      const impactSnapshot = api.buildSnapshot(false, false, "mock-player-2");
      const impactEvent = impactSnapshot.combatEvents.find((event) =>
        event.type === "projectileImpact" && event.targetEnemyId === target.id
      );

      api.startMockGuest(["Host", "Guest"], 1, initial.matchId);
      api.applySnapshot(initial);
      const before = api.getAuthoritativeEnemies().find((enemy) => enemy.id === target.id);
      const particlesBefore = game.getExplosionOptimizationStats().particles;

      const impactOnly = JSON.parse(JSON.stringify(impactSnapshot));
      delete impactOnly.enemies;
      delete impactOnly.enemyDelta;
      delete impactOnly.enemyLiveDelta;
      api.applySnapshot(impactOnly);
      const afterImpact = api.getAuthoritativeEnemies().find((enemy) => enemy.id === target.id);
      const particlesAfterImpact = game.getExplosionOptimizationStats().particles;

      const lateFull = JSON.parse(JSON.stringify(impactSnapshot));
      lateFull.sequence = impactOnly.sequence + 1;
      api.applySnapshot(lateFull);
      const afterLateDelta = api.getAuthoritativeEnemies().find((enemy) => enemy.id === target.id);
      const particlesAfterLateDelta = game.getExplosionOptimizationStats().particles;

      const lastCombatSequence = Math.max(...impactSnapshot.combatEvents.map((event) => event.sequence));
      const staleImpact = JSON.parse(JSON.stringify(impactOnly));
      staleImpact.sequence = lateFull.sequence + 1;
      staleImpact.combatEvents = [{
        ...impactEvent,
        sequence: lastCombatSequence + 1,
        projectileId: 9800 + caseIndex,
        targetHp: before.hp,
      }];
      api.applySnapshot(staleImpact);
      const afterStaleImpact = api.getAuthoritativeEnemies().find((enemy) => enemy.id === target.id);
      const particlesAfterStaleImpact = game.getExplosionOptimizationStats().particles;

      return {
        weapon,
        accepted,
        target,
        authoritativeTarget,
        impactEvent,
        before,
        afterImpact,
        afterLateDelta,
        afterStaleImpact,
        particlesBefore,
        particlesAfterImpact,
        particlesAfterLateDelta,
        particlesAfterStaleImpact,
      };
    }

    return [runCase("revolver", 1), runCase("launcher", 2)];
  });

  for (const shot of result) {
    const report = JSON.stringify(shot, null, 2);
    expect(shot.accepted, report).toBe(true);
    expect(shot.impactEvent, report).toBeTruthy();
    expect(shot.authoritativeTarget.hp, report).toBeLessThan(shot.target.hp);
    expect(shot.impactEvent.targetHp, report).toBe(shot.authoritativeTarget.hp);
    expect(shot.impactEvent.targetMaxHp, report).toBe(shot.target.hp);
    expect(shot.before.hp, report).toBe(shot.target.hp);
    expect(shot.afterImpact.hp, report).toBe(shot.authoritativeTarget.hp);
    expect(shot.afterImpact.hitPulse, report).toBeGreaterThan(0);
    expect(shot.particlesAfterImpact, report).toBeGreaterThan(shot.particlesBefore);
    expect(shot.afterLateDelta.hp, report).toBe(shot.afterImpact.hp);
    expect(shot.particlesAfterLateDelta, report).toBe(shot.particlesAfterImpact);
    expect(shot.afterStaleImpact.hp, report).toBe(shot.afterImpact.hp);
    expect(shot.particlesAfterStaleImpact, report).toBe(shot.particlesAfterImpact);
  }
});

test("Big Iron and shrapnel keep authoritative snapshot speed, piercing, and visual kind", async ({ page }) => {
  await openGame(page);

  const result = await page.evaluate(() => {
    const api = window.__dustMultiplayerTest;
    const hostState = api.startMockHost(["Host", "Guest"]);
    const host = hostState.players[0];
    api.setProgression("mock-player-1", {
      weapon: "revolver",
      revolverUpgrade: "bigIron",
    });
    const fired = api.fireAt("mock-player-1", host.x + 20, host.z);
    const authoritative = api.buildSnapshot(false, false);
    const bigIronOnHost = authoritative.bullets.find((bullet) => bullet.ownerId === "mock-player-1");

    api.startMockGuest(["Host", "Guest"], 1);
    api.applySnapshot(authoritative);
    const bigIronOnGuest = api.getGuestCombatReplicas().bullets.find((bullet) => bullet.id === bigIronOnHost.id);

    const shrapnelSnapshot = JSON.parse(JSON.stringify(authoritative));
    shrapnelSnapshot.sequence = authoritative.sequence + 1;
    shrapnelSnapshot.combatEvents = [];
    shrapnelSnapshot.bullets = [{
      id: 9202,
      ownerId: "mock-player-1",
      clientFireSequence: 0,
      type: "launcherShrapnel",
      startX: host.x,
      startY: 1.18,
      startZ: host.z,
      x: host.x + 0.4,
      y: 1.18,
      z: host.z,
      dirX: 1,
      dirZ: 0,
      speed: 26,
      life: 0.42,
      hitRadius: 0.12,
      visualWidth: 0.08,
      visualLength: 0.54,
      chainLightning: false,
      piercing: false,
    }];
    api.applySnapshot(shrapnelSnapshot);
    const shrapnelOnGuest = api.getGuestCombatReplicas().bullets[0];

    return { fired, bigIronOnHost, bigIronOnGuest, shrapnelOnGuest };
  });

  expect(result.fired).toBe(true);
  expect(result.bigIronOnHost).toMatchObject({
    type: "revolver",
    speed: 17.98,
    piercing: true,
  });
  expect(result.bigIronOnGuest).toMatchObject({
    type: "revolver",
    speed: 17.98,
    piercing: true,
    visualKind: "standard",
  });
  expect(result.shrapnelOnGuest).toMatchObject({
    id: 9202,
    type: "launcherShrapnel",
    speed: 26,
    piercing: false,
    visualKind: "standard",
    instanceVisible: true,
  });
});

test("local rifle prediction is non-piercing while Big Iron prediction is piercing", async ({ page }) => {
  await openGame(page);

  const result = await page.evaluate(() => {
    const api = window.__dustMultiplayerTest;

    let started = api.startMockGuest(["Host", "Guest"], 1);
    let guest = started.players[1];
    api.setProgression("mock-player-2", { weapon: "rifle" });
    const rifleFired = api.predictAndSendGuestShot("mock-player-2", guest.x + 20, guest.z);
    const rifle = api.getGuestCombatReplicas().bullets[0];

    started = api.startMockGuest(["Host", "Guest"], 1);
    guest = started.players[1];
    api.setProgression("mock-player-2", {
      weapon: "revolver",
      revolverUpgrade: "bigIron",
    });
    const bigIronFired = api.predictAndSendGuestShot("mock-player-2", guest.x + 20, guest.z);
    const bigIron = api.getGuestCombatReplicas().bullets[0];

    return { rifleFired, rifle, bigIronFired, bigIron };
  });

  expect(result.rifleFired).toBe(true);
  expect(result.rifle).toMatchObject({ type: "rifle", predicted: true, piercing: false });
  expect(result.bigIronFired).toBe(true);
  expect(result.bigIron).toMatchObject({ type: "revolver", predicted: true, piercing: true });
});

test("rapid rifle predictions advance Chain Lightning cadence before host acknowledgement", async ({ page }) => {
  await openGame(page);

  const result = await page.evaluate(() => {
    const api = window.__dustMultiplayerTest;
    const started = api.startMockGuest(["Host", "Guest"], 1);
    const guest = started.players[1];
    api.setProgression("mock-player-2", {
      playerClass: "ranger",
      weapon: "rifle",
      ownedWeapons: { revolver: true, rifle: true, launcher: false, coachGun: false },
      rifleUpgrade: "leverBarrage",
      upgradeCounts: { chainLightning: 1 },
      rifleShotsFired: 3,
      ammo: Object.assign({}, guest.progression.ammo, { rifle: 18 }),
      ammoReserve: Object.assign({}, guest.progression.ammoReserve, { rifle: 54 }),
      reloadTimers: Object.assign({}, guest.progression.reloadTimers, { rifle: 0 }),
    });

    const frames = [];
    for (let shot = 0; shot < 3; shot += 1) {
      const fired = api.predictAndSendGuestShot("mock-player-2", guest.x + 20, guest.z);
      const text = JSON.parse(window.render_game_to_text());
      frames.push({
        fired,
        rifleShotsFired: text.progression.rifleSpecial.shotsFired,
        visualKinds: api.getGuestCombatReplicas().bullets.map((bullet) => bullet.visualKind),
      });
    }
    return frames;
  });

  expect(result).toEqual([
    { fired: true, rifleShotsFired: 4, visualKinds: ["electric"] },
    { fired: true, rifleShotsFired: 5, visualKinds: ["electric", "standard"] },
    { fired: true, rifleShotsFired: 6, visualKinds: ["electric", "standard", "standard"] },
  ]);
});

test("a locally predicted launcher grenade keeps a continuous arc through irregular authoritative snapshots", async ({ page }) => {
  await openGame(page);

  const result = await page.evaluate(() => {
    const api = window.__dustMultiplayerTest;
    const started = api.startMockGuest(["Host", "Guest"], 1);
    api.setPlayerPosition("mock-player-2", -170, -130);
    api.setProgression("mock-player-2", {
      weapon: "launcher",
      ownedWeapons: { revolver: true, rifle: true, launcher: true, coachGun: true },
      ammo: { revolver: 6, rifle: 18, launcher: 3, coachGun: 2 },
      ammoReserve: { revolver: 30, rifle: 30, launcher: 30, coachGun: 30 },
      reloadTimers: { revolver: 0, rifle: 0, launcher: 0, coachGun: 0 },
    });
    const guest = api.getState().players.find((player) => player.id === "mock-player-2");
    const fired = api.predictAndSendGuestShot("mock-player-2", guest.x + 14, guest.z);
    const initial = api.getGuestCombatReplicas().bullets[0];
    const baseSnapshot = api.buildSnapshot(false, false);
    const shotTime = Number(baseSnapshot.time) || 0;
    const start = { x: initial.x, y: initial.y, z: initial.z };
    const direction = { x: initial.dirX, z: initial.dirZ };
    const maxLife = initial.life;
    const arrivals = new Set([5, 11, 20, 25, 37]);
    const frames = [];
    let sequence = Math.max(0, Number(baseSnapshot.sequence) || 0);

    for (let frame = 1; frame <= 44; frame += 1) {
      window.advanceTime(1000 / 60);
      if (arrivals.has(frame)) {
        const localAge = frame / 60;
        const sampleAge = Math.max(0.02, localAge - 0.08);
        const snapshot = JSON.parse(JSON.stringify(baseSnapshot));
        snapshot.sequence = ++sequence;
        snapshot.time = shotTime + sampleAge;
        snapshot.combatEvents = [];
        snapshot.bullets = [{
          id: 9401,
          ownerId: "mock-player-2",
          clientFireSequence: 1,
          type: "launcher",
          startX: start.x,
          startY: start.y,
          startZ: start.z,
          x: start.x + direction.x * initial.speed * sampleAge,
          y: 0.68 + Math.sin(Math.min(1, sampleAge / maxLife) * Math.PI) * 1.15,
          z: start.z + direction.z * initial.speed * sampleAge,
          dirX: direction.x,
          dirZ: direction.z,
          speed: initial.speed,
          life: Math.max(0.02, maxLife - sampleAge),
          hitRadius: 0.45,
          visualWidth: 0.34,
          visualLength: 0.5,
          chainLightning: false,
          piercing: false,
        }];
        api.applySnapshot(snapshot);
      }
      const bullet = api.getGuestCombatReplicas().bullets[0];
      if (!bullet) break;
      frames.push({ frame, ...bullet });
    }

    const steps = [];
    const accelerations = [];
    let backwards = 0;
    for (let index = 1; index < frames.length; index += 1) {
      const dx = frames[index].x - frames[index - 1].x;
      const dz = frames[index].z - frames[index - 1].z;
      const forward = dx * direction.x + dz * direction.z;
      if (forward < -0.0001) backwards += 1;
      steps.push(Math.hypot(dx, dz));
      if (steps.length > 1) accelerations.push(Math.abs(steps[steps.length - 1] - steps[steps.length - 2]));
    }
    return {
      fired,
      initial,
      frames,
      steps,
      accelerations,
      backwards,
      distinctHeights: new Set(frames.map((frame) => frame.y.toFixed(3))).size,
    };
  });

  const report = JSON.stringify(result, null, 2);
  expect(result.fired, report).toBe(true);
  expect(result.frames.length, report).toBeGreaterThanOrEqual(40);
  expect(result.frames.some((frame) => frame.locallyPredicted && !frame.predicted), report).toBe(true);
  expect(result.frames.some((frame) => frame.sampleLead >= 0.06), report).toBe(true);
  expect(result.backwards, report).toBe(0);
  expect(Math.min(...result.steps), report).toBeGreaterThan(0.18);
  expect(Math.max(...result.steps), report).toBeLessThan(0.34);
  // One arrival may move the correction from the local launcher's 12% back
  // cap to its 20% ahead cap. Keep the measured swing inside that authored
  // envelope instead of imposing a smaller, contradictory fixed threshold.
  const correctionSwingLimit = result.initial.speed / 60 * (0.12 + 0.2);
  expect(Math.max(...result.accelerations), report).toBeLessThan(correctionSwingLimit + 0.002);
  expect(result.distinctHeights, report).toBeGreaterThan(24);
});

test("manual touch aim immediately uses the multiplayer fire path for every weapon", async ({ page }) => {
  await openGame(page);

  const result = await page.evaluate(() => {
    const api = window.__dustMultiplayerTest;
    const canvas = document.querySelector("canvas");
    const weapons = ["revolver", "rifle", "launcher", "coachGun"];

    return weapons.map((weapon, index) => {
      const started = api.startMockGuest(["Host", "Guest"], 1);
      const guest = started.players[1];
      // Two rounds is valid for every magazine, including the base launcher
      // and Coach Gun, so the comparison measures one actual shot cost.
      const ammo = Object.assign({}, guest.progression.ammo, { [weapon]: 2 });
      const reloadTimers = Object.assign({}, guest.progression.reloadTimers, { [weapon]: 0 });
      api.setProgression("mock-player-2", {
        weapon,
        ownedWeapons: { revolver: true, rifle: true, launcher: true, coachGun: true },
        ammo,
        ammoReserve: { revolver: 30, rifle: 30, launcher: 30, coachGun: 30 },
        reloadTimers,
        launcherFireBuffActive: false,
      });

      const before = api.getState().players.find((player) => player.id === "mock-player-2");
      const rect = canvas.getBoundingClientRect();
      const pointerId = 800 + index;
      canvas.dispatchEvent(new PointerEvent("pointerdown", {
        bubbles: true,
        cancelable: true,
        button: 0,
        pointerId,
        pointerType: "touch",
        clientX: rect.left + rect.width * 0.78,
        clientY: rect.top + rect.height * 0.42,
      }));

      const immediately = {
        state: api.getState(),
        replicas: api.getGuestCombatReplicas().bullets,
        allBullets: api.getAuthoritativeBullets(),
      };
      // The held pointer is also observed by updatePlayer. Cooldown must keep
      // this first simulation frame from producing a duplicate fire action.
      window.advanceTime(17);
      const afterFirstFrame = api.getState();
      canvas.dispatchEvent(new PointerEvent("pointerup", {
        bubbles: true,
        cancelable: true,
        button: 0,
        pointerId,
        pointerType: "touch",
        clientX: rect.left + rect.width * 0.78,
        clientY: rect.top + rect.height * 0.42,
      }));
      window.advanceTime(80);

      const afterMove = api.getGuestCombatReplicas().bullets;
      const local = immediately.state.players.find((player) => player.id === "mock-player-2");
      return {
        weapon,
        initialAmmo: before.progression.ammo[weapon],
        ammoAfterTap: local.progression.ammo[weapon],
        pendingImmediately: immediately.state.pendingLocalFireActions,
        pendingAfterFirstFrame: afterFirstFrame.pendingLocalFireActions,
        replicas: immediately.replicas,
        allBullets: immediately.allBullets,
        afterMove,
      };
    });
  });

  for (const shot of result) {
    expect(shot.pendingImmediately, shot.weapon).toBe(1);
    expect(shot.pendingAfterFirstFrame, shot.weapon).toBe(1);
    expect(shot.ammoAfterTap, shot.weapon).toBe(shot.initialAmmo - 1);
    if (shot.weapon === "coachGun") {
      expect(shot.replicas).toEqual([]);
      expect(shot.allBullets).toEqual([]);
      continue;
    }
    expect(shot.replicas, shot.weapon).toHaveLength(1);
    expect(shot.replicas[0]).toMatchObject({
      type: shot.weapon,
      clientFireSequence: 1,
      predicted: true,
    });
    // Every state.bullets entry created by a guest tap is now managed by the
    // guest replica map; there is no unmanaged projectile left to freeze.
    expect(shot.allBullets, shot.weapon).toHaveLength(1);
    expect(shot.allBullets[0]).toMatchObject({
      type: shot.weapon,
      clientFireSequence: 1,
    });
    expect(shot.afterMove, shot.weapon).toHaveLength(1);
    expect(Math.hypot(
      shot.afterMove[0].x - shot.replicas[0].x,
      shot.afterMove[0].z - shot.replicas[0].z
    ), shot.weapon).toBeGreaterThan(0.05);
  }
});

test("a predicted bullet hidden by visual contact still expires and releases its instance", async ({ page }) => {
  await openGame(page);

  const result = await page.evaluate(() => {
    const api = window.__dustMultiplayerTest;
    const game = window.__dustAndDeadTest;
    const hostState = api.startMockHost(["Host", "Guest"]);
    const guest = hostState.players[1];
    game.spawnZombieAt("walker", guest.x + 4, guest.z);
    const world = api.buildSnapshot(false, false, "mock-player-2");
    const target = world.enemies[0];

    api.startMockGuest(["Host", "Guest"], 1);
    api.applySnapshot(world);
    const readPools = () => JSON.parse(window.render_game_to_text()).optimization.projectileVisualPools;
    const baseline = readPools();
    const fired = api.predictAndSendGuestShot("mock-player-2", target.x, target.z);
    window.advanceTime(240);
    const atContact = {
      bullets: api.getGuestCombatReplicas().bullets,
      target: api.getAuthoritativeEnemies().find((enemy) => enemy.id === target.id),
      pools: readPools(),
    };
    window.advanceTime(1000);
    const settled = {
      bullets: api.getGuestCombatReplicas().bullets,
      pools: readPools(),
    };
    return { fired, target, baseline, atContact, settled };
  });

  expect(result.fired).toBe(true);
  expect(result.atContact.bullets).toHaveLength(1);
  expect(result.atContact.bullets[0]).toMatchObject({
    predicted: true,
    visualContact: true,
    contactKind: "enemy",
    contactEnemyId: result.target.id,
    contactFxShown: true,
    visualVisible: false,
    instanceVisible: false,
  });
  // Contact feedback is immediate but speculative: pulse/spark now, HP only
  // after an authoritative impact or enemy snapshot.
  expect(result.atContact.target.hp).toBe(result.target.hp);
  expect(result.atContact.target.hitPulse).toBeGreaterThan(0);
  expect(result.atContact.pools.standard.inUse).toBe(result.baseline.standard.inUse + 1);

  expect(result.settled.bullets).toEqual([]);
  expect(result.settled.pools.standard.inUse).toBe(result.baseline.standard.inUse);
  expect(result.settled.pools.standard.drawnInstances).toBe(result.baseline.standard.drawnInstances);
});

test("mock match restart clears stale guest bullets and safely reuses projectile ids", async ({ page }) => {
  await openGame(page);

  const result = await page.evaluate(() => {
    const api = window.__dustMultiplayerTest;
    const readPools = () => JSON.parse(window.render_game_to_text()).optimization.projectileVisualPools;
    const makeBullet = (host) => ({
      id: 1,
      ownerId: "mock-player-1",
      clientFireSequence: 0,
      type: "revolver",
      startX: host.x,
      startY: 1.18,
      startZ: host.z,
      x: host.x + 0.5,
      y: 1.18,
      z: host.z,
      dirX: 1,
      dirZ: 0,
      speed: 29,
      life: 0.7,
      hitRadius: 0.24,
      visualWidth: 0.14,
      visualLength: 0.82,
      chainLightning: false,
      piercing: false,
    });

    let started = api.startMockGuest(["Host", "Guest"], 1);
    const baseline = readPools();
    let snapshot = api.buildSnapshot();
    snapshot.sequence = 1;
    snapshot.combatEvents = [];
    snapshot.bullets = [makeBullet(started.players[0])];
    api.applySnapshot(snapshot);
    const beforeRestart = {
      bullets: api.getGuestCombatReplicas().bullets,
      pools: readPools(),
    };

    api.finishMatch(["mock-player-1"], "test-restart");
    started = api.startMockGuest(["Host", "Guest"], 1);
    const afterRestart = {
      bullets: api.getGuestCombatReplicas().bullets,
      pools: readPools(),
    };

    snapshot = api.buildSnapshot();
    snapshot.sequence = 1;
    snapshot.combatEvents = [];
    snapshot.bullets = [makeBullet(started.players[0])];
    api.applySnapshot(snapshot);
    const afterIdReuse = {
      bullets: api.getGuestCombatReplicas().bullets,
      pools: readPools(),
    };

    return { baseline, beforeRestart, afterRestart, afterIdReuse };
  });

  expect(result.beforeRestart.bullets).toHaveLength(1);
  expect(result.beforeRestart.pools.standard.inUse).toBe(result.baseline.standard.inUse + 1);

  expect(result.afterRestart.bullets).toEqual([]);
  expect(result.afterRestart.pools.standard.inUse).toBe(result.baseline.standard.inUse);
  expect(result.afterRestart.pools.standard.drawnInstances).toBe(result.baseline.standard.drawnInstances);

  expect(result.afterIdReuse.bullets).toHaveLength(1);
  expect(result.afterIdReuse.bullets[0]).toMatchObject({
    id: 1,
    visualKind: "standard",
    visualVisible: true,
    instanceVisible: true,
  });
  expect(result.afterIdReuse.pools.standard.inUse).toBe(result.baseline.standard.inUse + 1);
  expect(result.afterIdReuse.pools.standard.drawnInstances).toBe(result.baseline.standard.drawnInstances + 1);
});
