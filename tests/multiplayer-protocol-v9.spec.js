const path = require("node:path");
const { expect, test } = require("@playwright/test");

function fileUrl(relativePath) {
  const absolute = path.resolve(__dirname, "..", relativePath).replace(/\\/g, "/");
  return `file:///${absolute}`;
}

async function openGame(page, query = "") {
  await page.goto(`${fileUrl("index.html")}?mapSeed=7331${query}`);
  const intro = page.locator("#intro-screen");
  if (await intro.isVisible().catch(() => false)) {
    await page.keyboard.press("KeyM");
    await expect(intro).toBeHidden();
  }
  await page.waitForFunction(() => Boolean(
    window.__dustMultiplayerTest?.buildWireSnapshot &&
    window.__dustMultiplayerTest?.acknowledgeClientState
  ));
}

function installNearbyCaptureMock() {
  const listeners = Object.create(null);

  function decode(data) {
    const binary = window.atob(String(data || ""));
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  }

  function encode(message) {
    const bytes = new TextEncoder().encode(JSON.stringify(message));
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return window.btoa(binary);
  }

  function currentOperationId() {
    return window.__dustMultiplayerTest?.getNearbyEndpointDiagnostics?.().operationId;
  }

  function currentConnectionNonce(endpointId) {
    return window.__dustMultiplayerTest?.getNearbyEndpointDiagnostics?.().connectionNonces?.[endpointId];
  }

  const capture = {
    sent: [],
    addListener(eventName, callback) {
      (listeners[eventName] || (listeners[eventName] = [])).push(callback);
      return Promise.resolve({ remove() {} });
    },
    emitProtocol(message, endpointId = "mock-host-endpoint") {
      (listeners.message || []).slice().forEach((callback) => callback({
        endpointId,
        data: encode(message),
        operationId: currentOperationId(),
        connectionNonce: currentConnectionNonce(endpointId),
      }));
    },
    requestNearbyPermissions() {
      return Promise.resolve({ granted: true });
    },
    sendBytes(options) {
      capture.sent.push({
        endpointId: options.endpointId || "",
        latestOnly: !!options.latestOnly,
        latestKind: options.latestKind || "",
        message: decode(options.data),
      });
      return Promise.resolve({});
    },
    stopAll() {
      return Promise.resolve({});
    },
  };

  window.__nearbyCapture = capture;
  window.Capacitor = { Plugins: { NearbyConnections: capture } };
}

test.describe.configure({ mode: "serial" });

test("continuous guest input is replaceable while each predicted shot stays reliable", async ({ page }) => {
  await page.addInitScript(installNearbyCaptureMock);
  await openGame(page);

  const result = await page.evaluate(async () => {
    const api = window.__dustMultiplayerTest;
    api.startMockGuest(["Host", "Guest"], 1);
    window.__nearbyCapture.sent.length = 0;
    window.advanceTime(50);
    const guest = api.getState().players[1];
    const fired = api.predictAndSendGuestShot("mock-player-2", guest.x + 20, guest.z);
    await Promise.resolve();
    return { fired, sent: window.__nearbyCapture.sent.slice() };
  });

  const input = result.sent.find((entry) => entry.message.type === "input");
  const fire = result.sent.find((entry) => entry.message.type === "decision" && entry.message.action === "fire");
  expect(result.fired).toBe(true);
  expect(input).toMatchObject({ latestOnly: true, latestKind: "input" });
  expect(input.message).not.toHaveProperty("fire");
  expect(fire).toBeTruthy();
  expect(fire.latestOnly).toBe(false);
  expect(fire.message).toMatchObject({ fireSequence: 1, lifeFireSequence: 1 });
});

test("host deduplicates reliable fire actions and consumes their recorded aim", async ({ page }) => {
  await openGame(page);

  const result = await page.evaluate(async () => {
    const api = window.__dustMultiplayerTest;
    const started = api.startMockHost(["Host", "Guest"]);
    const guest = started.players[1];
    api.setProgression("mock-player-2", { weapon: "revolver" });
    const first = api.injectFireAction("mock-player-2", 1, Math.PI / 2, 20);
    const duplicate = api.injectFireAction("mock-player-2", 1, -Math.PI / 2, 20);
    window.advanceTime(17);
    const after = api.getState().players[1];
    const replicas = api.buildSnapshot(false, false, "mock-player-2").bullets.filter((bullet) => bullet.ownerId === "mock-player-2");
    return { guest, first, duplicate, after, replicas };
  });

  expect(result.first).toBe(true);
  expect(result.duplicate).toBe(false);
  expect(result.after.lastFireActionSequence).toBe(1);
  expect(result.after.pendingFireActions).toBe(0);
  expect(result.replicas).toHaveLength(1);
  expect(result.replicas[0].dirX).toBeGreaterThan(0.9);
});

test("unacknowledged fire is retried and stops after the host acknowledgement", async ({ page }) => {
  await page.addInitScript(installNearbyCaptureMock);
  await openGame(page);

  const result = await page.evaluate(() => {
    const api = window.__dustMultiplayerTest;
    api.startMockGuest(["Host", "Guest"], 1);
    window.__nearbyCapture.sent.length = 0;
    const guest = api.getState().players[1];
    api.predictAndSendGuestShot("mock-player-2", guest.x + 20, guest.z);
    const initiallyPending = api.getState().pendingLocalFireActions;
    window.advanceTime(260);
    const beforeAck = window.__nearbyCapture.sent.filter((entry) => entry.message.type === "decision" && entry.message.action === "fire").length;
    const acknowledgement = api.buildSnapshot(false, false);
    acknowledgement.players.find((player) => player.id === "mock-player-2").fireAck = 1;
    api.applySnapshot(acknowledgement);
    const pendingAfterAck = api.getState().pendingLocalFireActions;
    window.advanceTime(300);
    const afterAck = window.__nearbyCapture.sent.filter((entry) => entry.message.type === "decision" && entry.message.action === "fire").length;
    return { initiallyPending, beforeAck, pendingAfterAck, afterAck };
  });

  expect(result.initiallyPending).toBe(1);
  expect(result.beforeAck).toBeGreaterThanOrEqual(2);
  expect(result.pendingAfterAck).toBe(0);
  expect(result.afterAck).toBe(result.beforeAck);
});

test("host acknowledges a fire action only after authoritative processing", async ({ page }) => {
  await openGame(page);

  const result = await page.evaluate(() => {
    const api = window.__dustMultiplayerTest;
    const started = api.startMockHost(["Host", "Guest"]);
    const guest = started.players[1];
    api.setProgression("mock-player-2", {
      weapon: "revolver",
      ammo: Object.assign({}, guest.progression.ammo, { revolver: 0 }),
    });
    const queued = api.injectFireAction("mock-player-2", 1, Math.PI / 2, 20);
    const beforeProcessing = api.buildSnapshot(false, false, "mock-player-2");
    window.advanceTime(17);
    const afterProcessing = api.buildSnapshot(false, false, "mock-player-2");
    return {
      queued,
      before: beforeProcessing.players.find((player) => player.id === "mock-player-2"),
      after: afterProcessing.players.find((player) => player.id === "mock-player-2"),
      bullets: afterProcessing.bullets.filter((bullet) => bullet.ownerId === "mock-player-2"),
      state: api.getState().players[1],
    };
  });

  expect(result.queued).toBe(true);
  expect(result.before).toMatchObject({ fireReceived: 1, fireAck: 0 });
  expect(result.after).toMatchObject({ fireReceived: 1, fireAck: 1 });
  expect(result.after.fireResults).toEqual([{ sequence: 1, accepted: false, reason: "empty" }]);
  expect(result.bullets).toEqual([]);
  expect(result.state).toMatchObject({
    lastFireActionSequence: 1,
    lastProcessedFireActionSequence: 1,
    lastFireActionAccepted: false,
    pendingFireActions: 0,
  });
});

test("guest replays pending ammo cost over snapshots and rolls back a rejected prediction", async ({ page }) => {
  await openGame(page);

  const result = await page.evaluate(async () => {
    const api = window.__dustMultiplayerTest;
    const started = api.startMockGuest(["Host", "Guest"], 1);
    const guest = started.players[1];
    const authoritative = JSON.parse(JSON.stringify(api.buildSnapshot(false, false)));
    const initialAmmo = authoritative.players.find((player) => player.id === "mock-player-2").progression.ammo.revolver;
    const fired = api.predictAndSendGuestShot("mock-player-2", guest.x + 20, guest.z);
    const afterPrediction = {
      state: api.getState(),
      bullets: api.getGuestCombatReplicas().bullets,
    };

    await new Promise((resolve) => window.setTimeout(resolve, 90));

    authoritative.sequence = 1;
    authoritative.bullets = [];
    authoritative.players.find((player) => player.id === "mock-player-2").fireAck = 0;
    api.applySnapshot(authoritative);
    const whilePending = {
      state: api.getState(),
      bullets: api.getGuestCombatReplicas().bullets,
    };

    const rejected = JSON.parse(JSON.stringify(authoritative));
    rejected.sequence = 2;
    const rejectedPlayer = rejected.players.find((player) => player.id === "mock-player-2");
    rejectedPlayer.fireAck = 1;
    rejectedPlayer.fireResults = [{ sequence: 1, accepted: false, reason: "empty" }];
    api.applySnapshot(rejected);
    return {
      fired,
      initialAmmo,
      afterPrediction,
      whilePending,
      afterRejection: {
        state: api.getState(),
        bullets: api.getGuestCombatReplicas().bullets,
      },
    };
  });

  const predictedPlayer = result.afterPrediction.state.players[1];
  const pendingPlayer = result.whilePending.state.players[1];
  const reconciledPlayer = result.afterRejection.state.players[1];
  expect(result.fired).toBe(true);
  expect(predictedPlayer.progression.ammo.revolver).toBe(result.initialAmmo - 1);
  expect(pendingPlayer.progression.ammo.revolver).toBe(result.initialAmmo - 1);
  expect(result.whilePending.state.pendingLocalFireActions).toBe(1);
  expect(result.whilePending.bullets).toHaveLength(1);
  expect(reconciledPlayer.progression.ammo.revolver).toBe(result.initialAmmo);
  expect(result.afterRejection.state.pendingLocalFireActions).toBe(0);
  expect(result.afterRejection.bullets).toEqual([]);
});

test("guest reload requests retry until processed and survive an older snapshot", async ({ page }) => {
  await page.addInitScript(installNearbyCaptureMock);
  await openGame(page);

  const result = await page.evaluate(() => {
    const api = window.__dustMultiplayerTest;
    const capture = window.__nearbyCapture;
    const started = api.startMockGuest(["Host", "Guest"], 1);
    const guest = started.players[1];
    api.setProgression("mock-player-2", {
      ammo: Object.assign({}, guest.progression.ammo, { revolver: 3 }),
      ammoReserve: { revolver: 30, rifle: 0, launcher: 0, coachGun: 0 },
    });
    const authoritative = JSON.parse(JSON.stringify(api.buildSnapshot(false, false)));
    capture.sent.length = 0;
    const requested = api.requestLocalReload();
    const firstReload = capture.sent.find((entry) => entry.message.action === "reload").message;
    const afterRequest = api.getState();

    authoritative.sequence = 1;
    authoritative.players.find((player) => player.id === "mock-player-2").reloadAck = "";
    api.applySnapshot(authoritative);
    const afterOldSnapshot = api.getState();
    window.advanceTime(300);
    const beforeAckCount = capture.sent.filter((entry) => entry.message.action === "reload").length;

    const acknowledged = JSON.parse(JSON.stringify(authoritative));
    acknowledged.sequence = 2;
    const localEntry = acknowledged.players.find((player) => player.id === "mock-player-2");
    localEntry.reloadAck = firstReload.requestId;
    localEntry.progression.reloadTimers = Object.assign({}, localEntry.progression.reloadTimers, { revolver: 1.25 });
    api.applySnapshot(acknowledged);
    const afterAck = api.getState();
    window.advanceTime(350);
    const finalCount = capture.sent.filter((entry) => entry.message.action === "reload").length;
    return { requested, firstReload, afterRequest, afterOldSnapshot, beforeAckCount, afterAck, finalCount };
  });

  expect(result.requested).toBe(true);
  expect(result.firstReload).toMatchObject({ action: "reload", weaponId: "revolver", afterFireSequence: 0 });
  expect(result.afterRequest.pendingLocalReloadAction).toBe(result.firstReload.requestId);
  expect(result.afterRequest.players[1].progression.reloadTimers.revolver).toBeGreaterThan(0);
  expect(result.afterOldSnapshot.pendingLocalReloadAction).toBe(result.firstReload.requestId);
  expect(result.afterOldSnapshot.players[1].progression.reloadTimers.revolver).toBeGreaterThan(0);
  expect(result.beforeAckCount).toBeGreaterThanOrEqual(2);
  expect(result.afterAck.pendingLocalReloadAction).toBe("");
  expect(result.afterAck.players[1].progression.reloadTimers.revolver).toBe(1.25);
  expect(result.finalCount).toBe(result.beforeAckCount);
});

test("fire epochs reject old lives and reload waits for the preceding shot", async ({ page }) => {
  await openGame(page);

  const result = await page.evaluate(() => {
    const api = window.__dustMultiplayerTest;
    const started = api.startMockHost(["Host", "Guest"]);
    const firstMatchId = started.matchId;
    api.setProgression("mock-player-2", { weapon: "revolver" });
    const fireQueued = api.injectFireAction("mock-player-2", 1, Math.PI / 2, 20);
    const reloadQueued = api.injectReloadAction("mock-player-2", 1);
    window.advanceTime(17);
    const afterOrderedActions = api.getState().players[1];
    const bullets = api.buildSnapshot(false, false, "mock-player-2").bullets.filter((bullet) => bullet.ownerId === "mock-player-2");

    api.setPoints("mock-player-2", 10);
    api.damagePlayer("mock-player-2", 999, "mock-player-1");
    api.revive("mock-player-2", "epoch-revive");
    const staleLife = api.injectFireAction("mock-player-2", 2, 0, 12, { lifeSequence: 0 });
    const outOfOrderSecond = api.injectFireAction("mock-player-2", 3, 0, 12, { lifeSequence: 1, lifeFireSequence: 2 });
    const currentLife = api.injectFireAction("mock-player-2", 2, 0, 12, { lifeSequence: 1, lifeFireSequence: 1 });
    const retriedSecond = api.injectFireAction("mock-player-2", 3, 0, 12, { lifeSequence: 1, lifeFireSequence: 2 });

    const next = api.startMockHost(["Host", "Guest"]);
    const staleMatch = api.injectFireAction("mock-player-2", 1, 0, 12, { matchId: firstMatchId, lifeSequence: 0 });
    return { fireQueued, reloadQueued, afterOrderedActions, bullets, staleLife, outOfOrderSecond, currentLife, retriedSecond, staleMatch, nextMatchId: next.matchId, firstMatchId };
  });

  expect(result.fireQueued).toBe(true);
  expect(result.reloadQueued).toBe(true);
  expect(result.bullets).toHaveLength(1);
  expect(result.afterOrderedActions.progression.reloadTimers.revolver).toBeGreaterThan(0);
  expect(result.staleLife).toBe(false);
  expect(result.outOfOrderSecond).toBe(false);
  expect(result.currentLife).toBe(true);
  expect(result.retriedSecond).toBe(true);
  expect(result.nextMatchId).not.toBe(result.firstMatchId);
  expect(result.staleMatch).toBe(false);
});

test("batched enemy samples use host time and do not launch zombie replicas forward", async ({ page }) => {
  await openGame(page);

  const result = await page.evaluate(() => {
    const multiplayer = window.__dustMultiplayerTest;
    const game = window.__dustAndDeadTest;
    const host = multiplayer.startMockHost(["Host", "Guest"]);
    const viewer = host.players[1];
    game.spawnZombieAt("runner", viewer.x + 8, viewer.z);
    const first = JSON.parse(JSON.stringify(multiplayer.buildSnapshot(false, false, "mock-player-2")));
    const second = JSON.parse(JSON.stringify(first));
    second.sequence = first.sequence + 1;
    second.time = first.time + 0.066;
    second.enemies[0].x += 0.15;
    const authoritativeTarget = second.enemies[0].x;

    multiplayer.startMockGuest(["Host", "Guest"], 1);
    multiplayer.applySnapshot(first);
    multiplayer.applySnapshot(second);
    window.advanceTime(100);
    const enemy = multiplayer.getGuestEnemyDiagnostics()[0];
    return { authoritativeTarget, enemy };
  });

  expect(result.enemy).toBeTruthy();
  expect(Math.abs(result.enemy.velocityX)).toBeLessThan(4);
  expect(Math.abs(result.enemy.x - result.authoritativeTarget)).toBeLessThan(0.5);
});

test("enemy FX-only deltas do not reset the position sample or velocity", async ({ page }) => {
  await openGame(page);

  const result = await page.evaluate(() => {
    const multiplayer = window.__dustMultiplayerTest;
    const game = window.__dustAndDeadTest;
    const host = multiplayer.startMockHost(["Host", "Guest"]);
    const viewer = host.players[1];
    game.spawnZombieAt("runner", viewer.x + 8, viewer.z);
    const first = JSON.parse(JSON.stringify(multiplayer.buildWireSnapshot(false, false, "mock-player-2")));
    multiplayer.acknowledgeClientState("mock-player-2", first.sequence, 0, false);
    window.advanceTime(100);
    const movement = JSON.parse(JSON.stringify(multiplayer.buildWireSnapshot(false, false, "mock-player-2")));
    multiplayer.acknowledgeClientState("mock-player-2", movement.sequence, 0, false);
    multiplayer.applyMarshalEffectToFirstEnemy("mock-player-1", "mark", 4);
    const fxOnly = JSON.parse(JSON.stringify(multiplayer.buildWireSnapshot(false, false, "mock-player-2")));

    multiplayer.startMockGuest(["Host", "Guest"], 1);
    multiplayer.applySnapshot(first);
    multiplayer.applySnapshot(movement);
    const beforeFx = multiplayer.getGuestEnemyDiagnostics()[0];
    multiplayer.applySnapshot(fxOnly);
    const afterFx = multiplayer.getGuestEnemyDiagnostics()[0];
    return { beforeFx, afterFx, movementDelta: movement.enemyDelta, fxDelta: fxOnly.enemyDelta };
  });

  expect(result.movementDelta.c).toBeGreaterThan(0);
  expect(result.fxDelta.c).toBeGreaterThan(0);
  expect(result.beforeFx.sampleTime).toBeGreaterThan(0);
  expect(result.afterFx.sampleTime).toBe(result.beforeFx.sampleTime);
  expect(result.afterFx.targetReceivedAt).toBe(result.beforeFx.targetReceivedAt);
  expect(result.afterFx.velocityX).toBe(result.beforeFx.velocityX);
  expect(result.afterFx.velocityZ).toBe(result.beforeFx.velocityZ);
});

test("combat events stay queued past 48 until every client acknowledges them", async ({ page }) => {
  await openGame(page);

  const result = await page.evaluate(() => {
    const multiplayer = window.__dustMultiplayerTest;
    const game = window.__dustAndDeadTest;
    multiplayer.startMockHost(["Host", "Guest A", "Guest B"]);

    for (let index = 0; index < 64; index += 1) {
      game.triggerLauncherExplosionAt(42, 42, "main", 2, 2, {
        ownerPlayerId: "mock-player-1",
        noFire: true,
        noShrapnel: true,
        noCluster: true,
        noCrossfire: true,
      });
    }

    const guestAFirst = multiplayer.buildSnapshot(false, false, "mock-player-2");
    const guestBFirst = multiplayer.buildSnapshot(false, false, "mock-player-3");
    const lastEventSequence = guestAFirst.combatEvents.at(-1).sequence;
    const guestAAck = multiplayer.acknowledgeClientState(
      "mock-player-2",
      guestAFirst.sequence,
      lastEventSequence,
      false
    );
    const guestAAfterAck = multiplayer.buildSnapshot(false, false, "mock-player-2");
    const guestBBeforeAck = multiplayer.buildSnapshot(false, false, "mock-player-3");
    const queueWhileBIsBehind = multiplayer.getNetworkCombatDiagnostics().queuedEvents;
    const guestBAck = multiplayer.acknowledgeClientState(
      "mock-player-3",
      guestBBeforeAck.sequence,
      lastEventSequence,
      false
    );
    const queueAfterBothAck = multiplayer.getNetworkCombatDiagnostics().queuedEvents;

    return {
      guestAFirst: guestAFirst.combatEvents,
      guestBFirst: guestBFirst.combatEvents,
      guestAAck,
      guestAAfterAck: guestAAfterAck.combatEvents,
      guestBBeforeAck: guestBBeforeAck.combatEvents,
      queueWhileBIsBehind,
      guestBAck,
      queueAfterBothAck,
    };
  });

  expect(result.guestAFirst).toHaveLength(64);
  expect(result.guestBFirst).toHaveLength(64);
  expect(result.guestAFirst.map((event) => event.sequence)).toEqual(
    Array.from({ length: 64 }, (_, index) => index + 1)
  );
  expect(result.guestAAck.combatAck).toBe(64);
  expect(result.guestAAfterAck).toEqual([]);
  expect(result.guestBBeforeAck).toHaveLength(64);
  expect(result.queueWhileBIsBehind).toHaveLength(64);
  expect(result.guestBAck).toMatchObject({ combatAck: 64, queuedEvents: 0 });
  expect(result.queueAfterBothAck).toEqual([]);
});

test("a point-blank hit carries projectile spawn and impact events even after its bullet is gone", async ({ page }) => {
  await openGame(page);

  const result = await page.evaluate(() => {
    const multiplayer = window.__dustMultiplayerTest;
    const started = multiplayer.startMockHost(["Shooter", "Target"]);
    const shooter = started.players[0];
    multiplayer.setPlayerPosition("mock-player-1", shooter.x, shooter.z);
    multiplayer.setPlayerPosition("mock-player-2", shooter.x + 1.8, shooter.z);
    multiplayer.setHealth("mock-player-2", 120);
    const positioned = multiplayer.getState();
    const target = positioned.players.find((player) => player.id === "mock-player-2");
    const fired = multiplayer.fireAt("mock-player-1", target.x, target.z);
    window.advanceTime(120);

    const snapshot = multiplayer.buildSnapshot(false, false, "mock-player-2");
    const authoritativeTarget = snapshot.players.find((player) => player.id === "mock-player-2");
    const eventTypes = snapshot.combatEvents.map((event) => event.type);
    const eventSequences = snapshot.combatEvents.map((event) => event.sequence);

    multiplayer.startMockGuest(["Shooter", "Target"], 1);
    multiplayer.applySnapshot(snapshot);
    return {
      fired,
      authoritativeHp: authoritativeTarget.hp,
      bulletsInSnapshot: snapshot.bullets,
      eventTypes,
      eventSequences,
      guestTargetHp: multiplayer.getState().players.find((player) => player.id === "mock-player-2").hp,
      guestBullets: multiplayer.getGuestCombatReplicas().bullets,
      guestEvents: multiplayer.getNetworkCombatDiagnostics().guestEvents,
    };
  });

  expect(result.fired).toBe(true);
  expect(result.authoritativeHp).toBeLessThan(120);
  expect(result.bulletsInSnapshot).toEqual([]);
  expect(result.eventTypes).toEqual(["projectileSpawn", "projectileImpact"]);
  expect(result.eventSequences).toEqual([1, 2]);
  expect(result.guestTargetHp).toBe(result.authoritativeHp);
  expect(result.guestBullets).toEqual([]);
  expect(result.guestEvents.map((event) => event.type)).toEqual(["projectileSpawn", "projectileImpact"]);
});

test("a client-owned bullet sends a terminal impact when it hits a zombie", async ({ page }) => {
  await openGame(page);

  const result = await page.evaluate(() => {
    const multiplayer = window.__dustMultiplayerTest;
    const game = window.__dustAndDeadTest;
    multiplayer.startMockHost(["Host", "Guest"]);
    multiplayer.setPlayerPosition("mock-player-2", 0, 0);
    const shooter = multiplayer.getState().players.find((player) => player.id === "mock-player-2");
    multiplayer.setProgression("mock-player-2", { weapon: "revolver" });
    const target = game.spawnZombieAt("walker", shooter.x + 3, shooter.z);
    const aimAngle = Math.atan2(target.x - shooter.x, target.z - shooter.z);
    const queued = multiplayer.injectFireAction("mock-player-2", 1, aimAngle, 12);
    window.advanceTime(240);
    const snapshot = multiplayer.buildSnapshot(false, false, "mock-player-2");
    const events = snapshot.combatEvents.filter((event) => event.ownerId === "mock-player-2");
    return { queued, bullets: snapshot.bullets, events };
  });

  expect(result.queued).toBe(true);
  expect(result.bullets).toEqual([]);
  expect(result.events.map((event) => event.type)).toEqual(["projectileSpawn", "projectileImpact"]);
  expect(result.events[0].clientFireSequence).toBe(1);
  expect(result.events[0]).toMatchObject({ dirX: 1, dirZ: 0 });
  expect(result.events[1]).toMatchObject({ clientFireSequence: 1, impactKind: "enemy" });
});

test("the final hit is acknowledged before results and matchEnd applies its final snapshot before standings", async ({ page }) => {
  await page.addInitScript(installNearbyCaptureMock);
  await openGame(page, "&localMultiplayer=1");

  const result = await page.evaluate(() => {
    const multiplayer = window.__dustMultiplayerTest;
    const capture = window.__nearbyCapture;
    const started = multiplayer.startMockHost(["Shooter", "Target"]);
    const shooter = started.players[0];
    multiplayer.setPlayerPosition("mock-player-2", shooter.x + 1.8, shooter.z);
    multiplayer.setHealth("mock-player-2", 10);
    const target = multiplayer.getState().players.find((player) => player.id === "mock-player-2");
    const fired = multiplayer.fireAt("mock-player-1", target.x, target.z);
    window.advanceTime(120);
    const afterHit = multiplayer.getState();

    const surrendered = multiplayer.surrender("mock-player-2");
    const afterSurrender = multiplayer.getState();
    const sentBeforeFinalizationSnapshot = capture.sent.length;
    window.advanceTime(100);

    function snapshotPlayers(message) {
      return message?.players || multiplayer.decodePlayerWireEntries(message?.ps) || [];
    }

    function isFinalStateSnapshot(message) {
      if (!message || message.type !== "snapshot") return false;
      const targetEntry = snapshotPlayers(message).find((player) => player.id === "mock-player-2");
      return targetEntry?.alive === false &&
        targetEntry.hp === 0 &&
        message.combatEvents?.some((event) => event.type === "projectileImpact");
    }

    const relativeFinalStateSnapshotIndex = capture.sent
      .slice(sentBeforeFinalizationSnapshot)
      .findIndex((entry) => isFinalStateSnapshot(entry.message));
    const finalStateSnapshotIndex = relativeFinalStateSnapshotIndex < 0
      ? -1
      : sentBeforeFinalizationSnapshot + relativeFinalStateSnapshotIndex;
    const finalStateSnapshot = capture.sent[finalStateSnapshotIndex]?.message || null;
    const impactSequence = finalStateSnapshot?.combatEvents
      ?.find((event) => event.type === "projectileImpact")?.sequence || 0;
    const finalCombatSequence = finalStateSnapshot?.combatEvents?.at(-1)?.sequence || impactSequence;
    const acknowledged = multiplayer.acknowledgeClientState(
      "mock-player-2",
      finalStateSnapshot.sequence,
      finalCombatSequence,
      false
    );
    const immediatelyAfterAck = multiplayer.getState();
    window.advanceTime(450);
    const beforeDeathAnimationFinishes = multiplayer.getState();
    window.advanceTime(700);
    const hostAfterFinish = multiplayer.getState();

    const matchEndIndex = capture.sent.findIndex((entry) => entry.message?.type === "matchEnd");
    const actualMatchEnd = capture.sent[matchEndIndex]?.message || null;
    const guestMessage = Object.assign({}, actualMatchEnd, {
      finalSnapshot: JSON.parse(JSON.stringify(finalStateSnapshot)),
    });

    multiplayer.startMockGuest(["Shooter", "Target"], 1);
    capture.emitProtocol(guestMessage, "mock-host-endpoint");
    const guestState = multiplayer.getState();
    const guestDiagnostics = multiplayer.getNetworkCombatDiagnostics();
    const guestTargetVisual = multiplayer.getPlayerVisualDiagnostics("mock-player-2");
    const standings = Array.from(document.querySelectorAll("#multiplayer-final-results-body tr"))
      .map((row) => row.innerText);

    return {
      fired,
      surrendered,
      afterHit,
      afterSurrender,
      finalStateSnapshotIndex,
      finalStateSnapshot,
      finalStatePlayers: snapshotPlayers(finalStateSnapshot),
      impactSequence,
      finalCombatSequence,
      acknowledged,
      immediatelyAfterAck,
      beforeDeathAnimationFinishes,
      hostAfterFinish,
      matchEndIndex,
      actualMatchEnd,
      actualMatchEndPlayers: snapshotPlayers(actualMatchEnd?.finalSnapshot),
      guestState,
      guestEvents: guestDiagnostics.guestEvents,
      guestTargetVisual,
      standings,
    };
  });

  const hostAfterHit = result.afterHit.players.find((player) => player.id === "mock-player-1");
  const targetAfterHit = result.afterHit.players.find((player) => player.id === "mock-player-2");
  expect(result.fired).toBe(true);
  expect(targetAfterHit).toMatchObject({ hp: 0, alive: false, deaths: 1 });
  expect(hostAfterHit).toMatchObject({ points: 5, playerKills: 1 });
  expect(result.surrendered).toBe(true);
  expect(result.afterSurrender).toMatchObject({ phase: "match", matchEnded: false });

  expect(result.finalStateSnapshotIndex).toBeGreaterThanOrEqual(0);
  expect(result.finalStateSnapshot.combatEvents.map((event) => event.type)).toEqual([
    "projectileSpawn",
    "projectileImpact",
    "playerDied",
    "playerEliminated",
  ]);
  expect(result.finalStatePlayers.find((player) => player.id === "mock-player-1"))
    .toMatchObject({ points: 5, playerKills: 1, alive: true });
  expect(result.finalStatePlayers.find((player) => player.id === "mock-player-2"))
    .toMatchObject({ hp: 0, hpSequence: result.impactSequence, alive: false, deaths: 1 });
  expect(result.acknowledged).toMatchObject({
    snapshotAck: result.finalStateSnapshot.sequence,
    combatAck: result.finalCombatSequence,
  });
  expect(result.immediatelyAfterAck).toMatchObject({ phase: "match", matchEnded: false });
  expect(result.beforeDeathAnimationFinishes).toMatchObject({ phase: "match", matchEnded: false });
  expect(result.hostAfterFinish).toMatchObject({ phase: "ended", matchEnded: true });
  expect(result.matchEndIndex).toBeGreaterThan(result.finalStateSnapshotIndex);
  expect(result.actualMatchEnd).toMatchObject({
    type: "matchEnd",
    version: 46,
    winnerIds: ["mock-player-1"],
    reason: "lastSurvivorLeads",
  });
  expect(result.actualMatchEndPlayers.find((player) => player.id === "mock-player-1"))
    .toMatchObject({ points: 5, playerKills: 1 });

  const guestShooter = result.guestState.players.find((player) => player.id === "mock-player-1");
  const guestTarget = result.guestState.players.find((player) => player.id === "mock-player-2");
  expect(result.guestEvents.map((event) => event.type)).toEqual([
    "projectileSpawn",
    "projectileImpact",
    "playerDied",
    "playerEliminated",
  ]);
  expect(result.guestState).toMatchObject({
    phase: "ended",
    matchEnded: true,
    winnerIds: ["mock-player-1"],
  });
  expect(guestShooter).toMatchObject({ points: 5, playerKills: 1, alive: true });
  expect(guestTarget).toMatchObject({ hp: 0, alive: false, deaths: 1 });
  expect(result.guestTargetVisual.deathAnimationActive).toBe(true);
  expect(result.standings).toHaveLength(2);
  expect(result.standings[0]).toContain("Shooter");
  expect(result.standings[0]).toContain("5");
  expect(result.standings[1]).toContain("Target");
});

test("timeout matchEnd force-applies final HP and standings when the last combat event cannot advance its ACK", async ({ page }) => {
  await page.addInitScript(installNearbyCaptureMock);
  await openGame(page, "&localMultiplayer=1");

  const result = await page.evaluate(() => {
    const multiplayer = window.__dustMultiplayerTest;
    const capture = window.__nearbyCapture;
    const started = multiplayer.startMockHost(["Shooter", "Target"]);
    const shooter = started.players[0];
    multiplayer.setPlayerPosition("mock-player-2", shooter.x + 1.8, shooter.z);
    multiplayer.setHealth("mock-player-2", 10);
    const target = multiplayer.getState().players.find((player) => player.id === "mock-player-2");
    multiplayer.fireAt("mock-player-1", target.x, target.z);
    window.advanceTime(120);
    multiplayer.surrender("mock-player-2");

    const sentBeforePendingSnapshot = capture.sent.length;
    window.advanceTime(100);
    const snapshotPlayers = (message) => message?.players || multiplayer.decodePlayerWireEntries(message?.ps) || [];
    const pendingSnapshot = capture.sent.slice(sentBeforePendingSnapshot)
      .map((entry) => entry.message)
      .find((message) => message?.type === "snapshot" &&
        snapshotPlayers(message).find((player) => player.id === "mock-player-2")?.hp === 0 &&
        message.combatEvents?.some((event) => event.type === "projectileImpact"));
    const partialAck = multiplayer.acknowledgeClientState(
      "mock-player-2",
      pendingSnapshot.sequence,
      1,
      false
    );

    window.advanceTime(1200);
    const beforeTimeout = multiplayer.getState();
    window.advanceTime(900);
    const hostAfterTimeout = multiplayer.getState();
    const matchEnd = capture.sent.map((entry) => entry.message).find((message) => message?.type === "matchEnd");

    multiplayer.startMockGuest(["Shooter", "Target"], 1);
    capture.emitProtocol(matchEnd, "mock-host-endpoint");
    const guestState = multiplayer.getState();
    const guestDiagnostics = multiplayer.getNetworkCombatDiagnostics();
    const standings = Array.from(document.querySelectorAll("#multiplayer-final-results-body tr"))
      .map((row) => row.innerText);
    return {
      pendingSnapshot,
      partialAck,
      beforeTimeout,
      hostAfterTimeout,
      matchEnd,
      finalSnapshotPlayers: snapshotPlayers(matchEnd?.finalSnapshot),
      guestState,
      guestDiagnostics,
      standings,
    };
  });

  expect(result.pendingSnapshot.combatEvents.map((event) => event.type)).toEqual([
    "projectileSpawn",
    "projectileImpact",
    "playerDied",
    "playerEliminated",
  ]);
  expect(result.partialAck).toMatchObject({
    snapshotAck: result.pendingSnapshot.sequence,
    combatAck: 1,
  });
  expect(result.beforeTimeout).toMatchObject({ phase: "match", matchEnded: false });
  expect(result.hostAfterTimeout).toMatchObject({ phase: "ended", matchEnded: true });
  expect(result.matchEnd.finalSnapshot.forceFinalState).toBe(true);
  expect(result.matchEnd.finalSnapshot.combatEvents.map((event) => event.type)).toEqual([
    "projectileImpact",
    "playerDied",
    "playerEliminated",
  ]);
  expect(result.finalSnapshotPlayers.find((player) => player.id === "mock-player-2"))
    .toMatchObject({ hp: 0, hpSequence: 2, alive: false, deaths: 1 });

  const guestShooter = result.guestState.players.find((player) => player.id === "mock-player-1");
  const guestTarget = result.guestState.players.find((player) => player.id === "mock-player-2");
  expect(result.guestDiagnostics.lastCombatEventSequence).toBe(0);
  expect(result.guestDiagnostics.guestEvents).toEqual([]);
  expect(result.guestState).toMatchObject({
    phase: "ended",
    matchEnded: true,
    winnerIds: ["mock-player-1"],
  });
  expect(guestShooter).toMatchObject({ points: 5, playerKills: 1, alive: true });
  expect(guestTarget).toMatchObject({ hp: 0, alive: false, deaths: 1 });
  expect(result.standings).toHaveLength(2);
  expect(result.standings[0]).toContain("Shooter");
  expect(result.standings[0]).toContain("5");
  expect(result.standings[1]).toContain("Target");
});

test("a remote player cannot take persistent hazard damage before acknowledging its visual", async ({ page }) => {
  await openGame(page);

  const result = await page.evaluate(() => {
    const multiplayer = window.__dustMultiplayerTest;
    const game = window.__dustAndDeadTest;
    const started = multiplayer.startMockHost(["Pyro", "Guest"]);
    const guest = started.players[1];
    multiplayer.setHealth("mock-player-2", 120);

    game.spawnRifleTrapAt(guest.x, guest.z);
    const unacknowledgedIntroduction = multiplayer.buildSnapshot(false, false, "mock-player-2");
    multiplayer.triggerFirstRifleTrap();
    const beforeAck = multiplayer.getState().players.find((player) => player.id === "mock-player-2").hp;

    game.spawnRifleTrapAt(guest.x, guest.z);
    const acknowledgedIntroduction = multiplayer.buildSnapshot(false, false, "mock-player-2");
    const acknowledged = multiplayer.acknowledgeClientState(
      "mock-player-2",
      acknowledgedIntroduction.sequence,
      0,
      false
    );
    multiplayer.triggerFirstRifleTrap();
    const afterAck = multiplayer.getState().players.find((player) => player.id === "mock-player-2").hp;
    return {
      unacknowledgedUpserts: unacknowledgedIntroduction.hazardUpserts,
      acknowledgedUpserts: acknowledgedIntroduction.hazardUpserts,
      introductionSequence: acknowledgedIntroduction.sequence,
      beforeAck,
      afterAck,
      acknowledged,
    };
  });

  expect(result.unacknowledgedUpserts.rifleTraps).toHaveLength(1);
  expect(result.acknowledgedUpserts.rifleTraps).toHaveLength(1);
  expect(result.beforeAck).toBe(120);
  expect(result.acknowledged.snapshotAck).toBe(result.introductionSequence);
  expect(result.afterAck).toBeLessThan(result.beforeAck);
});

test("a packed 1000-enemy keyframe stays compact and the latest unacknowledged delta survives a skipped frame", async ({ page }) => {
  await openGame(page);

  const result = await page.evaluate(() => {
    const multiplayer = window.__dustMultiplayerTest;
    const game = window.__dustAndDeadTest;
    const started = multiplayer.startMockHost(["Host", "Guest"]);
    const host = started.players[0];
    multiplayer.setPlayerPosition("mock-player-2", host.x, host.z);
    multiplayer.spawnEnemyStressField(1000, "visible");

    const keyframe = multiplayer.buildWireSnapshot(false, false, "mock-player-2");
    const keyframeBytes = new TextEncoder().encode(JSON.stringify(keyframe)).length;
    const keyframeEnemyBytes = window.atob(keyframe.enemyDelta.d).length;
    multiplayer.acknowledgeClientState("mock-player-2", keyframe.sequence, 0, false);

    game.spawnZombieAt("walker", host.x + 1, host.z + 1);
    const skippedDelta = multiplayer.buildWireSnapshot(false, false, "mock-player-2");
    game.spawnZombieAt("runner", host.x + 2, host.z + 2);
    const latestDelta = multiplayer.buildWireSnapshot(false, false, "mock-player-2");
    const latestDeltaBytes = new TextEncoder().encode(JSON.stringify(latestDelta)).length;
    const expected = multiplayer.buildSnapshot(false, false, "mock-player-2");
    const expectedIds = expected.enemies.map((enemy) => enemy.id).sort((a, b) => a - b);

    multiplayer.startMockGuest(["Host", "Guest"], 1);
    multiplayer.applySnapshot(keyframe);
    const afterKeyframe = multiplayer.getGuestEnemyDiagnostics();
    multiplayer.applySnapshot(latestDelta);
    const afterSkippedFrame = multiplayer.getGuestEnemyDiagnostics();

    return {
      keyframeHasLegacyEnemies: Object.prototype.hasOwnProperty.call(keyframe, "enemies"),
      keyframeKind: keyframe.enemyDelta.k,
      keyframeBytes,
      keyframeEnemyBytes,
      skippedKind: skippedDelta.enemyDelta.k,
      latestKind: latestDelta.enemyDelta.k,
      latestDeltaBytes,
      afterKeyframeIds: afterKeyframe.map((enemy) => enemy.id).sort((a, b) => a - b),
      afterSkippedFrameIds: afterSkippedFrame.map((enemy) => enemy.id).sort((a, b) => a - b),
      expectedIds,
    };
  });

  expect(result.keyframeHasLegacyEnemies).toBe(false);
  expect(result.keyframeKind).toBe(1);
  expect(result.keyframeBytes).toBeLessThan(24 * 1024);
  expect(result.keyframeEnemyBytes).toBeLessThan(12 * 1024);
  expect(result.skippedKind).toBe(0);
  expect(result.latestKind).toBe(0);
  expect(result.latestDeltaBytes).toBeLessThan(8 * 1024);
  expect(result.afterKeyframeIds).toHaveLength(1000);
  expect(result.afterSkippedFrameIds).toEqual(result.expectedIds);
  expect(result.afterSkippedFrameIds).toHaveLength(1002);
});

test("the latest staggered delta keeps all 1000 moving enemy IDs after two earlier frames are coalesced", async ({ page }) => {
  await openGame(page);

  const result = await page.evaluate(() => {
    const multiplayer = window.__dustMultiplayerTest;
    const started = multiplayer.startMockHost(["Host", "Guest"]);
    const host = started.players[0];
    multiplayer.setPlayerPosition("mock-player-2", host.x, host.z);
    multiplayer.spawnEnemyStressField(1000, "visible");
    const initial = multiplayer.buildSnapshot(false, false, "mock-player-2");
    const keyframe = multiplayer.buildWireSnapshot(false, false, "mock-player-2");
    multiplayer.acknowledgeClientState("mock-player-2", keyframe.sequence, 0, false);

    window.advanceTime(120);
    const skippedDeltaA = multiplayer.buildWireSnapshot(false, false, "mock-player-2");
    window.advanceTime(120);
    const skippedDeltaB = multiplayer.buildWireSnapshot(false, false, "mock-player-2");
    window.advanceTime(120);
    const latestDelta = multiplayer.buildWireSnapshot(false, false, "mock-player-2");
    const expected = multiplayer.buildSnapshot(false, false, "mock-player-2");
    const expectedById = new Map(expected.enemies.map((enemy) => [enemy.id, enemy]));
    const initialById = new Map(initial.enemies.map((enemy) => [enemy.id, enemy]));
    const movedCount = expected.enemies.filter((enemy) => {
      const before = initialById.get(enemy.id);
      return before && Math.hypot(enemy.x - before.x, enemy.z - before.z) > 0.05;
    }).length;

    multiplayer.startMockGuest(["Host", "Guest"], 1);
    multiplayer.applySnapshot(keyframe);
    multiplayer.applySnapshot(latestDelta);
    const guestEnemies = multiplayer.getGuestEnemyDiagnostics();
    let maxTargetError = 0;
    let missingExpected = 0;
    const targetErrors = [];
    for (const enemy of guestEnemies) {
      const expectedEnemy = expectedById.get(enemy.id);
      if (!expectedEnemy) {
        missingExpected += 1;
        continue;
      }
      const targetError = Math.hypot(enemy.targetX - expectedEnemy.x, enemy.targetZ - expectedEnemy.z);
      targetErrors.push(targetError);
      maxTargetError = Math.max(maxTargetError, targetError);
    }
    targetErrors.sort((a, b) => a - b);
    const guestIds = guestEnemies.map((enemy) => enemy.id).sort((a, b) => a - b);
    const expectedIds = expected.enemies.map((enemy) => enemy.id).sort((a, b) => a - b);
    return {
      skippedCounts: [skippedDeltaA.enemyDelta.c, skippedDeltaB.enemyDelta.c],
      latestCount: latestDelta.enemyDelta.c,
      movedCount,
      maxTargetError,
      p95TargetError: targetErrors[Math.floor(targetErrors.length * 0.95)] || 0,
      p99TargetError: targetErrors[Math.floor(targetErrors.length * 0.99)] || 0,
      missingExpected,
      guestIds,
      expectedIds,
    };
  });

  expect(result.skippedCounts[0]).toBeGreaterThan(0);
  expect(result.skippedCounts[1]).toBeGreaterThan(0);
  expect(result.latestCount).toBeGreaterThan(0);
  expect(result.movedCount).toBeGreaterThan(750);
  expect(result.missingExpected).toBe(0);
  expect(result.guestIds).toHaveLength(1000);
  expect(result.guestIds).toEqual(result.expectedIds);
  expect(result.p99TargetError).toBeLessThan(0.9);
  expect(result.maxTargetError).toBeLessThan(1.2);
});

test("the JS wire budget keeps 1000 visible enemies with allowed hazards and projectiles below 31 KiB", async ({ page }) => {
  await openGame(page);

  const result = await page.evaluate(() => {
    const multiplayer = window.__dustMultiplayerTest;
    const game = window.__dustAndDeadTest;
    const started = multiplayer.startMockHost(["Host", "Guest"]);
    const host = started.players[0];
    multiplayer.setPlayerPosition("mock-player-2", host.x, host.z);
    const positionedGuest = multiplayer.getState().players.find((player) => player.id === "mock-player-2");

    multiplayer.setProgression("mock-player-1", {
      weapon: "revolver",
      ammo: Object.assign({}, host.progression.ammo, { revolver: 40 }),
    });
    let firedBullets = 0;
    for (let index = 0; index < 24; index += 1) {
      if (multiplayer.fireAt("mock-player-1", host.x + 30, host.z)) firedBullets += 1;
    }

    for (let index = 0; index < 60; index += 1) {
      multiplayer.spawnSpitterShotAtPlayer("mock-player-2");
    }
    for (let index = 0; index < 50; index += 1) {
      game.spawnAcidPuddleAt(
        positionedGuest.x + (index % 5 - 2) * 0.18,
        positionedGuest.z + (Math.floor(index / 5) % 5 - 2) * 0.18
      );
    }
    for (let index = 0; index < 128; index += 1) {
      const x = positionedGuest.x + (index % 8 - 3.5) * 0.22;
      const z = positionedGuest.z + (Math.floor(index / 8) % 8 - 3.5) * 0.22;
      multiplayer.spawnFirePatch("mock-player-1", { x, z, radius: 1.2, life: 8, type: "trail" });
      game.spawnRifleTrapAt(x, z);
    }
    const stress = multiplayer.spawnEnemyStressField(1000, "visible");
    const sources = {
      firePatches: game.getFireOptimizationStats().activePatches,
      rifleTraps: game.getRifleTrapOptimizationStats().activeTraps,
      acid: game.getAcidPuddleOptimizationStats(),
    };

    const wire = multiplayer.buildWireSnapshot(true, true, "mock-player-2");
    const wireBytes = new TextEncoder().encode(JSON.stringify(wire)).length;
    const budget = multiplayer.getNetworkBudgetDiagnostics();
    const packedTrapMain = multiplayer.decodeRifleTrapState(wire.rt) || wire.rifleTraps || [];
    const packedTrapUpserts = multiplayer.decodeRifleTrapState(wire.ru) || wire.hazardUpserts?.rifleTraps || [];
    const hazardKinds = ["firePatches", "acidPuddles"];
    const hazardOverlap = hazardKinds.reduce((total, kind) => {
      const mainIds = new Set((wire[kind] || []).map((entry) => entry.id));
      return total + (wire.hazardUpserts?.[kind] || []).filter((entry) => mainIds.has(entry.id)).length;
    }, 0) + packedTrapUpserts.filter((entry) => (
      new Set(packedTrapMain.map((trap) => trap.id)).has(entry.id)
    )).length;
    return {
      stress,
      firedBullets,
      sources,
      wireBytes,
      enemyCount: wire.enemyDelta.n,
      combatTypes: wire.combatEvents.map((event) => event.type),
      hazardCounts: {
        firePatches: (wire.firePatches?.length || 0) + (wire.hazardUpserts?.firePatches?.length || 0),
        rifleTraps: packedTrapMain.length + packedTrapUpserts.length,
        acidPuddles: (wire.acidPuddles?.length || 0) + (wire.hazardUpserts?.acidPuddles?.length || 0),
      },
      hazardOverlap,
      compactTrapWire: {
        main: wire.rt == null || typeof wire.rt === "string",
        upserts: wire.ru == null || typeof wire.ru === "string",
        hasPackedState: typeof wire.rt === "string" || typeof wire.ru === "string",
        hasLegacyMain: Array.isArray(wire.rifleTraps),
        hasLegacyUpserts: Array.isArray(wire.hazardUpserts?.rifleTraps),
      },
      budget,
    };
  });

  expect(result.stress.added).toBe(1000);
  expect(result.enemyCount).toBeGreaterThanOrEqual(1000);
  expect(result.firedBullets).toBeGreaterThan(0);
  expect(result.sources.firePatches).toBe(128);
  expect(result.sources.rifleTraps).toBe(128);
  expect(result.sources.acid).toMatchObject({ activeProjectiles: 60, activePuddles: 50 });
  expect(result.combatTypes).toContain("projectileSpawn");
  expect(result.hazardCounts.firePatches).toBeGreaterThan(0);
  expect(result.hazardCounts.rifleTraps).toBeGreaterThan(0);
  expect(result.hazardCounts.acidPuddles).toBeGreaterThan(0);
  expect(result.hazardOverlap).toBe(0);
  expect(result.compactTrapWire).toEqual({
    main: true,
    upserts: true,
    hasPackedState: true,
    hasLegacyMain: false,
    hasLegacyUpserts: false,
  });
  expect(result.wireBytes).toBeLessThanOrEqual(31 * 1024);
  expect(result.budget.stats.lastPreBudgetBytes).toBeGreaterThan(result.wireBytes);
  expect(result.budget.stats.wireBudgetTrims).toBeGreaterThan(0);
  expect(result.budget.stats.wireOversizeSnapshots).toBe(0);
});
