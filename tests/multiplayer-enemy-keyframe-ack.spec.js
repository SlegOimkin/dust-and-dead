const path = require("node:path");
const { expect, test } = require("@playwright/test");

function fileUrl(relativePath) {
  const absolute = path.resolve(__dirname, "..", relativePath).replace(/\\/g, "/");
  return `file:///${absolute}`;
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

async function openGame(page) {
  await page.addInitScript(installNearbyCaptureMock);
  await page.goto(`${fileUrl("index.html")}?mapSeed=7331`);
  const intro = page.locator("#intro-screen");
  if (await intro.isVisible().catch(() => false)) {
    await page.keyboard.press("KeyM");
    await expect(intro).toBeHidden();
  }
  await page.waitForFunction(() => Boolean(
    window.__dustMultiplayerTest?.buildWireSnapshot &&
    window.__dustMultiplayerTest?.spawnEnemyStressField &&
    window.__nearbyCapture
  ));
}

function latestInput(entries) {
  return entries.filter((entry) => entry.message?.type === "input").at(-1)?.message || null;
}

test("protocol 47 advances an enemy keyframe only after the guest applies and explicitly acknowledges its exact chunk", async ({ page, context }) => {
  test.setTimeout(120_000);
  await openGame(page);
  const guestPage = await context.newPage();
  await openGame(guestPage);

  const hostBootstrap = await page.evaluate(() => {
    const multiplayer = window.__dustMultiplayerTest;
    const started = multiplayer.startMockHost(["Host", "Guest"]);
    multiplayer.setPlayerPosition("mock-player-2", started.players[0].x, started.players[0].z);
    multiplayer.spawnEnemyStressField(1400, "visible");
    const first = JSON.parse(JSON.stringify(
      multiplayer.buildWireSnapshot(false, false, "mock-player-2")
    ));
    return {
      first,
      matchId: multiplayer.getState().matchId,
    };
  });

  expect(hostBootstrap.first.version).toBe(47);
  expect(hostBootstrap.first.enemyDelta.k).toBe(1);
  expect(hostBootstrap.first.enemyDelta.m).toBeGreaterThan(1);
  expect(hostBootstrap.first.enemyDelta.i).toBe(0);

  const invalidInput = await guestPage.evaluate((first) => {
    const multiplayer = window.__dustMultiplayerTest;
    multiplayer.startMockGuest(["Host", "Guest"], 1);
    window.__nearbyCapture.sent.length = 0;
    const damaged = JSON.parse(JSON.stringify(first));
    damaged.enemyDelta.d = "not-valid-base64";
    multiplayer.applySnapshot(damaged);
    window.advanceTime(60);
    return window.__nearbyCapture.sent
      .filter((entry) => entry.message?.type === "input")
      .at(-1)?.message || null;
  }, hostBootstrap.first);

  expect(invalidInput).toBeTruthy();
  expect(invalidInput.snapshotAck).toBe(hostBootstrap.first.sequence);
  expect(invalidInput).not.toHaveProperty("enemyKeyframeAck");

  const transportRetry = await page.evaluate(({ input, matchId }) => {
    window.__nearbyCapture.emitProtocol(
      {
        ...input,
        matchId,
        enemyKeyframeRequestSequence: 0,
        requestEnemyKeyframe: false,
      },
      "mock-endpoint-1"
    );
    return JSON.parse(JSON.stringify(
      window.__dustMultiplayerTest.buildWireSnapshot(false, false, "mock-player-2")
    ));
  }, { input: invalidInput, matchId: hostBootstrap.matchId });

  // A cumulative snapshot ACK proves transport delivery only. The damaged
  // payload was not applied, so the host must keep retrying the frozen chunk.
  expect(transportRetry.enemyDelta.e).toBe(hostBootstrap.first.enemyDelta.e);
  expect(transportRetry.enemyDelta.i).toBe(hostBootstrap.first.enemyDelta.i);
  expect(transportRetry.enemyDelta.d).toBe(hostBootstrap.first.enemyDelta.d);

  const recoveryRetry = await page.evaluate(({ input, matchId }) => {
    // Deliver the guest's real recovery request as well. It may restart the
    // epoch, but it must still begin at chunk zero rather than falsely advance.
    window.__nearbyCapture.emitProtocol(
      { ...input, matchId },
      "mock-endpoint-1"
    );
    return JSON.parse(JSON.stringify(
      window.__dustMultiplayerTest.buildWireSnapshot(false, false, "mock-player-2")
    ));
  }, { input: invalidInput, matchId: hostBootstrap.matchId });

  expect(recoveryRetry.enemyDelta.e).toBeGreaterThan(transportRetry.enemyDelta.e);
  expect(recoveryRetry.enemyDelta.i).toBe(0);

  const validInput = await guestPage.evaluate((wire) => {
    window.__nearbyCapture.sent.length = 0;
    window.__dustMultiplayerTest.applySnapshot(wire);
    window.advanceTime(60);
    return window.__nearbyCapture.sent
      .filter((entry) => entry.message?.type === "input")
      .at(-1)?.message || null;
  }, recoveryRetry);

  const expectedAck = {
    v: recoveryRetry.enemyDelta.vr,
    e: recoveryRetry.enemyDelta.e,
    i: recoveryRetry.enemyDelta.i,
  };
  expect(validInput).toBeTruthy();
  expect(validInput.snapshotAck).toBe(recoveryRetry.sequence);
  expect(validInput.enemyKeyframeAck).toEqual(expectedAck);

  const next = await page.evaluate(({ input, matchId }) => {
    window.__nearbyCapture.emitProtocol(
      { ...input, matchId },
      "mock-endpoint-1"
    );
    return JSON.parse(JSON.stringify(
      window.__dustMultiplayerTest.buildWireSnapshot(false, false, "mock-player-2")
    ));
  }, { input: validInput, matchId: hostBootstrap.matchId });

  expect(next.enemyDelta.k).toBe(1);
  expect(next.enemyDelta.e).toBe(recoveryRetry.enemyDelta.e);
  expect(next.enemyDelta.i).toBe(recoveryRetry.enemyDelta.i + 1);
});
