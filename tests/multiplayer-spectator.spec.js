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
    window.__dustMultiplayerTest?.getSpectatorDiagnostics &&
    window.__dustAndDeadTest &&
    window.render_game_to_text
  ));
}

function installNearbyInputCapture() {
  function decode(data) {
    const binary = window.atob(String(data || ""));
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  }

  const capture = {
    sent: [],
    addListener() {
      return Promise.resolve({ remove() {} });
    },
    requestNearbyPermissions() {
      return Promise.resolve({ granted: true });
    },
    sendBytes(options) {
      capture.sent.push({
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

  window.__spectatorNearbyCapture = capture;
  window.Capacitor = { Plugins: { NearbyConnections: capture } };
}

test("local surrender enters spectator mode, hides combat controls, and follows the next player", async ({ page }) => {
  await openGame(page);

  const result = await page.evaluate(() => {
    const api = window.__dustMultiplayerTest;
    api.startMockHost(["Observer", "Alice", "Bob"]);
    api.setPlayerPosition("mock-player-2", 28, 18);
    api.refreshPlayerUi();
    if (JSON.parse(window.render_game_to_text()).render.contextLost) {
      window.__dustAndDeadTest.recoverRenderer();
      api.refreshPlayerUi();
    }

    const controlsBefore = {
      ammo: getComputedStyle(document.getElementById("ammo-hud")).display,
      mobile: getComputedStyle(document.getElementById("mobile-controls")).display,
    };

    api.damagePlayer("mock-player-1", 999, "mock-player-2");
    const surrendered = api.surrender("mock-player-1");
    api.refreshPlayerUi();

    const state = api.getState();
    const target = state.players.find((player) => player.id === "mock-player-2");
    return {
      surrendered,
      controlsBefore,
      controlsAfter: {
        ammo: getComputedStyle(document.getElementById("ammo-hud")).display,
        mobile: getComputedStyle(document.getElementById("mobile-controls")).display,
      },
      target,
      diagnostics: api.getSpectatorDiagnostics(),
      render: JSON.parse(window.render_game_to_text()).render,
    };
  });

  expect(result.surrendered).toBe(true);
  expect(result.controlsBefore.ammo).not.toBe("none");
  expect(result.controlsAfter).toEqual({ ammo: "none", mobile: "none" });
  expect(result.diagnostics).toMatchObject({
    active: true,
    targetId: "mock-player-2",
    targetName: "Alice",
    eligibleIds: ["mock-player-2", "mock-player-3"],
    panelHidden: false,
    previousDisabled: false,
    nextDisabled: false,
    rootClassActive: true,
    localGroupVisible: false,
    localWeaponVisible: false,
    pointerDown: false,
    moveActive: false,
    autoRun: false,
    fireActive: false,
    fieldFireActive: false,
  });
  expect(result.diagnostics.viewX).toBeCloseTo(result.target.x, 1);
  expect(result.diagnostics.viewZ).toBeCloseTo(result.target.z, 1);
  expect(result.diagnostics.cameraX, JSON.stringify(result.render)).toBeCloseTo(result.target.x, 1);
  expect(result.diagnostics.cameraZ).toBeCloseTo(result.target.z, 1);
  await expect(page.locator("#multiplayer-spectator")).toBeVisible();
  await expect(page.locator("#multiplayer-spectator-name")).toHaveText("Alice");
  await expect(page.locator("#ammo-hud")).toBeHidden();
  await expect(page.locator("#mobile-controls")).toBeHidden();
  await expect(page.locator("#multiplayer-death-panel")).toBeHidden();
});

test("spectator arrows cycle through living players in both directions with wraparound", async ({ page }) => {
  await openGame(page);

  const initial = await page.evaluate(() => {
    const api = window.__dustMultiplayerTest;
    api.startMockHost(["Observer", "P2", "P3", "P4"]);
    api.damagePlayer("mock-player-1", 999, "mock-player-2");
    api.surrender("mock-player-1");
    return api.getSpectatorDiagnostics();
  });
  expect(initial.targetId).toBe("mock-player-2");

  const next = page.locator("#multiplayer-spectator-next");
  const previous = page.locator("#multiplayer-spectator-prev");
  const seen = [initial.targetId];
  for (let index = 0; index < 3; index += 1) {
    await next.click();
    seen.push(await page.evaluate(() => window.__dustMultiplayerTest.getSpectatorDiagnostics().targetId));
  }
  await previous.click();
  seen.push(await page.evaluate(() => window.__dustMultiplayerTest.getSpectatorDiagnostics().targetId));

  expect(seen).toEqual([
    "mock-player-2",
    "mock-player-3",
    "mock-player-4",
    "mock-player-2",
    "mock-player-4",
  ]);
  await expect(page.locator("#multiplayer-spectator-name")).toHaveText("P4");
});

test("spectator automatically skips a dead or disconnected target", async ({ page }) => {
  await openGame(page);

  const result = await page.evaluate(() => {
    const api = window.__dustMultiplayerTest;
    api.startMockHost(["Observer", "First", "Second", "Last"]);
    api.damagePlayer("mock-player-1", 999, "mock-player-2");
    api.surrender("mock-player-1");
    const initial = api.getSpectatorDiagnostics();

    api.damagePlayer("mock-player-2", 999, "mock-player-3");
    const afterDeath = api.getSpectatorDiagnostics();

    api.setConnected("mock-player-3", false);
    const afterDisconnect = api.getSpectatorDiagnostics();
    return { initial, afterDeath, afterDisconnect };
  });

  expect(result.initial.targetId).toBe("mock-player-2");
  expect(result.afterDeath).toMatchObject({
    targetId: "mock-player-3",
    eligibleIds: ["mock-player-3", "mock-player-4"],
  });
  expect(result.afterDisconnect).toMatchObject({
    targetId: "mock-player-4",
    targetName: "Last",
    eligibleIds: ["mock-player-4"],
    previousDisabled: true,
    nextDisabled: true,
  });
});

test("host scopes a surrendered remote observer snapshot around the selected target", async ({ page }) => {
  await openGame(page);

  const result = await page.evaluate(() => {
    const api = window.__dustMultiplayerTest;
    api.startMockHost(["Host", "Observer", "Fighter", "Target"]);
    api.setPlayerPosition("mock-player-2", -170, -120);
    api.setPlayerPosition("mock-player-4", 170, 120);
    let state = api.getState();
    const corpseBefore = state.players.find((player) => player.id === "mock-player-2");
    const targetBefore = state.players.find((player) => player.id === "mock-player-4");

    api.damagePlayer("mock-player-2", 999, "mock-player-1");
    api.surrender("mock-player-2");
    api.injectInput("mock-player-2", {
      sequence: 1,
      moveX: 0,
      moveZ: 0,
      spectatorTargetId: "mock-player-4",
    });

    state = api.getState();
    const observer = state.players.find((player) => player.id === "mock-player-2");
    const target = state.players.find((player) => player.id === "mock-player-4");
    const corpse = { x: corpseBefore.x, z: corpseBefore.z };

    const targetEnemy = api.spawnEnemyAt(target.x + 3, target.z + 2, "walker", 20);
    const corpseEnemy = api.spawnEnemyAt(corpse.x + 3, corpse.z + 2, "walker", 20);
    const targetFire = api.spawnFirePatch("mock-player-1", {
      x: target.x + 2,
      z: target.z - 2,
      radius: 1.4,
      life: 8,
      type: "trail",
    });
    const corpseFire = api.spawnFirePatch("mock-player-1", {
      x: corpse.x + 2,
      z: corpse.z - 2,
      radius: 1.4,
      life: 8,
      type: "trail",
    });
    const snapshot = api.buildSnapshot(false, true, "mock-player-2");

    function contains(scope, point) {
      return point.x >= scope.minX && point.x <= scope.maxX && point.z >= scope.minZ && point.z <= scope.maxZ;
    }

    return {
      observerTargetId: observer.spectatorTargetPlayerId,
      targetBefore,
      target,
      corpse,
      scope: snapshot.enemyScope,
      targetInScope: contains(snapshot.enemyScope, target),
      corpseInScope: contains(snapshot.enemyScope, corpse),
      snapshotEnemyIds: snapshot.enemies.map((enemy) => enemy.id),
      targetEnemyId: targetEnemy.id,
      corpseEnemyId: corpseEnemy.id,
      snapshotFireIds: snapshot.firePatches.map((fire) => fire.id),
      targetFireId: targetFire.networkId,
      corpseFireId: corpseFire.networkId,
    };
  });

  expect(result.observerTargetId).toBe("mock-player-4");
  expect(result.targetInScope).toBe(true);
  expect(result.corpseInScope).toBe(false);
  expect(result.snapshotEnemyIds).toContain(result.targetEnemyId);
  expect(result.snapshotEnemyIds).not.toContain(result.corpseEnemyId);
  expect(result.snapshotFireIds).toContain(result.targetFireId);
  expect(result.snapshotFireIds).not.toContain(result.corpseFireId);
  const scopeCenter = {
    x: (result.scope.minX + result.scope.maxX) / 2,
    z: (result.scope.minZ + result.scope.maxZ) / 2,
  };
  expect(Math.hypot(scopeCenter.x - result.target.x, scopeCenter.z - result.target.z))
    .toBeLessThan(Math.hypot(scopeCenter.x - result.corpse.x, scopeCenter.z - result.corpse.z));
});

test("a guest keeps its ACK heartbeat and sends the selected spectator target to the host", async ({ page }) => {
  await page.addInitScript(installNearbyInputCapture);
  await openGame(page);

  const result = await page.evaluate(() => {
    const api = window.__dustMultiplayerTest;
    const capture = window.__spectatorNearbyCapture;
    api.startMockGuest(["Host", "Observer", "Third", "Fourth"], 1);
    api.setPlayerPosition("mock-player-3", 36, -22);
    api.setPlayerPosition("mock-player-4", -42, 28);

    const snapshot = api.buildSnapshot(false, false, "mock-player-2");
    const observer = snapshot.players.find((player) => player.id === "mock-player-2");
    observer.hp = 0;
    observer.alive = false;
    observer.surrendered = true;
    observer.deaths = 1;
    api.applySnapshot(snapshot);
    const initial = api.getSpectatorDiagnostics();
    const selected = api.cycleSpectator(1);
    window.advanceTime(80);

    const inputs = capture.sent.filter((entry) => entry.message?.type === "input");
    return {
      initial,
      selected,
      input: inputs.at(-1) || null,
    };
  });

  expect(result.initial).toMatchObject({
    active: true,
    targetId: "mock-player-3",
  });
  expect(result.selected).toMatchObject({
    active: true,
    targetId: "mock-player-4",
  });
  expect(result.selected.enemyKeyframeRequestSequence).toBeGreaterThan(0);
  expect(result.input).toMatchObject({
    latestOnly: true,
    latestKind: "input",
    message: {
      spectatorTargetId: "mock-player-4",
      moveX: 0,
      moveZ: 0,
    },
  });
  expect(result.input.message.snapshotAck).toBeGreaterThanOrEqual(0);
  expect(result.input.message.combatAck).toBeGreaterThanOrEqual(0);
  expect(result.input.message.enemyKeyframeRequestSequence).toBeGreaterThan(0);
});

test("finishing the match closes and resets spectator controls", async ({ page }) => {
  await openGame(page);

  const result = await page.evaluate(() => {
    const api = window.__dustMultiplayerTest;
    api.startMockHost(["Observer", "Winner", "Other"]);
    api.damagePlayer("mock-player-1", 999, "mock-player-2");
    api.surrender("mock-player-1");
    const before = api.getSpectatorDiagnostics();
    const match = api.finishMatch(["mock-player-2"], "test");
    const after = api.getSpectatorDiagnostics();
    return { before, match, after };
  });

  expect(result.before).toMatchObject({ active: true, panelHidden: false, rootClassActive: true });
  expect(result.match).toMatchObject({ phase: "ended", matchEnded: true });
  expect(result.after).toMatchObject({
    active: false,
    targetId: "",
    panelHidden: true,
    previousDisabled: true,
    nextDisabled: true,
    rootClassActive: false,
  });
  await expect(page.locator("#multiplayer-spectator")).toBeHidden();
  await expect(page.locator("#multiplayer-result-panel")).toBeVisible();
});

test("keyboard, canvas, and hidden mobile inputs cannot move or fire while spectating", async ({ page }) => {
  await openGame(page);

  const before = await page.evaluate(() => {
    const api = window.__dustMultiplayerTest;
    api.startMockHost(["Observer", "Fighter", "Other"]);
    api.damagePlayer("mock-player-1", 999, "mock-player-2");
    api.surrender("mock-player-1");
    api.refreshPlayerUi();
    return {
      multiplayer: api.getState(),
      world: JSON.parse(window.render_game_to_text()),
      diagnostics: api.getSpectatorDiagnostics(),
    };
  });

  await page.keyboard.down("KeyD");
  await page.evaluate(() => {
    const canvas = document.querySelector("#game-root > canvas");
    const rect = canvas.getBoundingClientRect();
    const pointerOptions = {
      bubbles: true,
      cancelable: true,
      button: 0,
      buttons: 1,
      clientX: rect.left + rect.width * 0.5,
      clientY: rect.top + rect.height * 0.5,
    };
    canvas.dispatchEvent(new PointerEvent("pointerdown", Object.assign({ pointerId: 71, pointerType: "mouse" }, pointerOptions)));
    canvas.dispatchEvent(new PointerEvent("pointerdown", Object.assign({ pointerId: 72, pointerType: "touch" }, pointerOptions)));
    document.getElementById("move-stick").dispatchEvent(new PointerEvent("pointerdown", Object.assign({ pointerId: 73, pointerType: "touch" }, pointerOptions)));
    document.getElementById("mobile-fire").dispatchEvent(new PointerEvent("pointerdown", Object.assign({ pointerId: 74, pointerType: "touch" }, pointerOptions)));
    window.advanceTime(500);
  });
  await page.keyboard.up("KeyD");

  const after = await page.evaluate(() => ({
    multiplayer: window.__dustMultiplayerTest.getState(),
    world: JSON.parse(window.render_game_to_text()),
    diagnostics: window.__dustMultiplayerTest.getSpectatorDiagnostics(),
  }));

  const beforePlayer = before.multiplayer.players.find((player) => player.id === "mock-player-1");
  const afterPlayer = after.multiplayer.players.find((player) => player.id === "mock-player-1");
  expect(afterPlayer.x).toBe(beforePlayer.x);
  expect(afterPlayer.z).toBe(beforePlayer.z);
  expect(after.world.bullets).toBe(before.world.bullets);
  expect(after.world.ammo.current).toBe(before.world.ammo.current);
  expect(after.world.ammo.reserve).toBe(before.world.ammo.reserve);
  expect(after.diagnostics).toMatchObject({
    active: true,
    pointerDown: false,
    moveActive: false,
    autoRun: false,
    fireActive: false,
    fieldFireActive: false,
  });
});
