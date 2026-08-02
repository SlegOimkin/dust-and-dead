const path = require("node:path");
const { expect, test } = require("@playwright/test");

const MULTIPLAYER_PROTOCOL_VERSION = 46;

function fileUrl(relativePath) {
  const absolute = path.resolve(__dirname, "..", relativePath).replace(/\\/g, "/");
  return `file:///${absolute}`;
}

function installNearbyMock(options = {}) {
  const listeners = Object.create(null);
  const calls = {
    addListener: [],
    acceptConnection: [],
    disconnect: [],
    disconnectOptions: [],
    removeListener: [],
    rejectConnection: [],
    requestConnection: [],
    requestNearbyPermissions: 0,
    send: [],
    operationIds: {
      acceptConnection: [],
      disconnect: [],
      rejectConnection: [],
      requestConnection: [],
      sendBytes: [],
      startDiscovery: [],
      startHost: [],
      stopAdvertising: [],
      stopAll: [],
      stopDiscovery: [],
    },
    startDiscovery: 0,
    startHost: 0,
    stopAdvertising: 0,
    stopAll: 0,
    stopDiscovery: 0,
    identityRejections: [],
  };

  function decodeMessage(data) {
    try {
      const binary = window.atob(String(data || ""));
      const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
      return JSON.parse(new TextDecoder().decode(bytes));
    } catch (error) {
      return null;
    }
  }

  const pendingListenerBindings = [];
  const pendingMessageSends = [];
  function getOperationId(options) {
    return options && Object.prototype.hasOwnProperty.call(options, "operationId")
      ? options.operationId
      : undefined;
  }
  function recordOperationId(kind, options, adopt) {
    const operationId = getOperationId(options);
    calls.operationIds[kind].push(operationId);
    if (adopt && Number.isFinite(operationId)) mock.currentOperationId = operationId;
    return operationId;
  }
  function validateConnectionIdentity(action, options, endpointId) {
    const id = String(endpointId || "");
    const diagnostics = window.__dustMultiplayerTest?.getNearbyEndpointDiagnostics?.();
    const nativeExpected = Number(mock.endpointConnectionNonces[id]);
    const appExpected = Number(diagnostics?.connectionNonces?.[id]);
    const expected = Number.isSafeInteger(nativeExpected) && nativeExpected > 0
      ? nativeExpected
      : appExpected;
    const actual = Number(options?.connectionNonce);
    if (
      !id ||
      !Number.isSafeInteger(actual) ||
      actual <= 0 ||
      (Number.isSafeInteger(expected) && expected > 0 && actual !== expected)
    ) {
      const error = new Error(`Synthetic stale connection identity for ${action}`);
      error.code = "STALE_CONNECTION";
      calls.identityRejections.push({ action, endpointId: id, expected, actual });
      return error;
    }
    return null;
  }
  function createListenerHandle(eventName, callback) {
    (listeners[eventName] || (listeners[eventName] = [])).push(callback);
    let removed = false;
    return {
      remove() {
        if (removed) return Promise.resolve();
        removed = true;
        calls.removeListener.push(eventName);
        const eventListeners = listeners[eventName] || [];
        const index = eventListeners.indexOf(callback);
        if (index !== -1) eventListeners.splice(index, 1);
        return Promise.resolve();
      },
    };
  }

  const mock = {
    calls,
    currentOperationId: 0,
    nextConnectionNonce: 1,
    endpointConnectionNonces: Object.create(null),
    deferStartHost: false,
    deferMessageType: "",
    failMessageType: "",
    failListenerOnce: String(options.failListenerOnce || ""),
    failListenerRemaining: Math.max(
      0,
      Math.floor(Number(options.failListenerCount) || (options.failListenerOnce ? 1 : 0))
    ),
    deferListenerEvents: options.deferListeners
      ? ["peer", "message", "state"]
      : [String(options.deferListenerEvent || "")].filter(Boolean),
    pendingHostStarts: [],
    pendingMessageSends,
    startHostError: null,
    startHostSyncError: null,
    addListener(eventName, callback) {
      calls.addListener.push(eventName);
      if (mock.failListenerOnce === eventName && mock.failListenerRemaining > 0) {
        mock.failListenerRemaining -= 1;
        if (!mock.failListenerRemaining) mock.failListenerOnce = "";
        return Promise.reject(new Error(`Synthetic ${eventName} listener failure`));
      }
      if (mock.deferListenerEvents.includes(eventName)) {
        return new Promise((resolve) => {
          pendingListenerBindings.push({ eventName, callback, resolve });
        });
      }
      return Promise.resolve(createListenerHandle(eventName, callback));
    },
    getCurrentOperationId() {
      const diagnostics = window.__dustMultiplayerTest?.getNearbyEndpointDiagnostics?.();
      if (diagnostics && Number.isFinite(diagnostics.operationId)) {
        mock.currentOperationId = diagnostics.operationId;
      }
      return mock.currentOperationId;
    },
    emitRaw(eventName, payload) {
      (listeners[eventName] || []).slice().forEach((callback) => callback(payload));
    },
    emit(eventName, payload) {
      const currentPayload = { ...(payload || {}) };
      if (!Object.prototype.hasOwnProperty.call(currentPayload, "operationId")) {
        currentPayload.operationId = mock.getCurrentOperationId();
      }
      const endpointId = String(currentPayload.endpointId || "");
      const terminalState = eventName === "state" && [
        "disconnected",
        "connectionRejected",
        "connectionRejectedLocally",
        "connectionFailed",
      ].includes(currentPayload.event);
      if (endpointId && eventName !== "peer") {
        let connectionNonce = Number(currentPayload.connectionNonce);
        if (!Number.isSafeInteger(connectionNonce) || connectionNonce <= 0) {
          connectionNonce = mock.endpointConnectionNonces[endpointId] || mock.nextConnectionNonce++;
        }
        currentPayload.connectionNonce = connectionNonce;
        if (!terminalState) mock.endpointConnectionNonces[endpointId] = connectionNonce;
      }
      mock.emitRaw(eventName, currentPayload);
      if (
        terminalState &&
        mock.endpointConnectionNonces[endpointId] === currentPayload.connectionNonce
      ) delete mock.endpointConnectionNonces[endpointId];
    },
    listenerCount(eventName) {
      return (listeners[eventName] || []).length;
    },
    resolveListenerBindings() {
      mock.deferListenerEvents = [];
      pendingListenerBindings.splice(0).forEach(({ eventName, callback, resolve }) => {
        resolve(createListenerHandle(eventName, callback));
      });
    },
    acceptConnection(options = {}) {
      const { endpointId } = options;
      const operationId = recordOperationId("acceptConnection", options, false);
      const identityError = validateConnectionIdentity("acceptConnection", options, endpointId);
      if (identityError) return Promise.reject(identityError);
      calls.acceptConnection.push(endpointId);
      return Promise.resolve({ endpointId, operationId });
    },
    disconnect(options = {}) {
      const { endpointId } = options;
      const operationId = recordOperationId("disconnect", options, false);
      const identityError = validateConnectionIdentity("disconnect", options, endpointId);
      if (identityError) return Promise.reject(identityError);
      calls.disconnect.push(endpointId);
      calls.disconnectOptions.push({ ...options });
      return Promise.resolve({ endpointId, operationId });
    },
    rejectConnection(options = {}) {
      const { endpointId } = options;
      const operationId = recordOperationId("rejectConnection", options, false);
      const identityError = validateConnectionIdentity("rejectConnection", options, endpointId);
      if (identityError) return Promise.reject(identityError);
      calls.rejectConnection.push(endpointId);
      mock.emit("state", { event: "connectionRejectedLocally", endpointId, operationId });
      return Promise.resolve({ endpointId, operationId });
    },
    requestConnection(options) {
      recordOperationId("requestConnection", options, true);
      calls.requestConnection.push(options);
      return Promise.resolve({});
    },
    requestNearbyPermissions() {
      calls.requestNearbyPermissions += 1;
      return Promise.resolve({ granted: true });
    },
    sendBytes(options) {
      const message = decodeMessage(options.data);
      const operationId = recordOperationId("sendBytes", options, false);
      if (options.endpointId) {
        const identityError = validateConnectionIdentity("sendBytes", options, options.endpointId);
        if (identityError) return Promise.reject(identityError);
      }
      calls.send.push({
        endpointId: options.endpointId || "",
        endpointIds: options.endpointIds || [],
        operationId,
        connectionNonce: options.connectionNonce,
        message,
      });
      if (message && message.type === mock.deferMessageType) {
        return new Promise((resolve, reject) => {
          pendingMessageSends.push({ message, options: { ...options }, resolve, reject });
        });
      }
      if (message && message.type === mock.failMessageType) {
        return Promise.reject(new Error(`Synthetic ${message.type} send failure`));
      }
      return Promise.resolve({});
    },
    rejectDeferredMessages(type) {
      const pending = pendingMessageSends.splice(0);
      pending.forEach((entry) => {
        if (!type || entry.message?.type === type) {
          entry.reject(new Error(`Synthetic delayed ${entry.message?.type || "message"} send failure`));
        } else {
          pendingMessageSends.push(entry);
        }
      });
    },
    resolveDeferredMessages(type) {
      const pending = pendingMessageSends.splice(0);
      pending.forEach((entry) => {
        if (!type || entry.message?.type === type) entry.resolve({});
        else pendingMessageSends.push(entry);
      });
    },
    startDiscovery(options = {}) {
      recordOperationId("startDiscovery", options, true);
      calls.startDiscovery += 1;
      return Promise.resolve({ discovering: true });
    },
    startHost(options = {}) {
      recordOperationId("startHost", options, true);
      calls.startHost += 1;
      if (mock.startHostSyncError) {
        const error = mock.startHostSyncError;
        mock.startHostSyncError = null;
        throw error;
      }
      if (mock.startHostError) return Promise.reject(mock.startHostError);
      if (mock.deferStartHost) {
        return new Promise((resolve) => mock.pendingHostStarts.push(resolve));
      }
      return Promise.resolve({ advertising: true });
    },
    resolveHostStarts() {
      mock.pendingHostStarts.splice(0).forEach((resolve) => resolve({ advertising: true }));
    },
    stopAdvertising(options = {}) {
      recordOperationId("stopAdvertising", options, true);
      calls.stopAdvertising += 1;
      return Promise.resolve({ advertising: false });
    },
    stopAll(options = {}) {
      recordOperationId("stopAll", options, true);
      calls.stopAll += 1;
      return Promise.resolve({});
    },
    stopDiscovery(options = {}) {
      recordOperationId("stopDiscovery", options, true);
      calls.stopDiscovery += 1;
      return Promise.resolve({ discovering: false });
    },
  };

  window.__nearbyMock = mock;
  window.Capacitor = { Plugins: { NearbyConnections: mock } };
}

async function dismissIntro(page) {
  const intro = page.locator("#intro-screen");
  if (await intro.isVisible().catch(() => false)) {
    await page.keyboard.press("KeyM");
    await expect(intro).toBeHidden();
  }
}

async function openMockLobby(page, options = {}) {
  await page.addInitScript(installNearbyMock, options);
  await page.goto(`${fileUrl("index.html")}?mapSeed=7331&localMultiplayer=1`);
  await dismissIntro(page);
  await page.waitForFunction(() => Boolean(window.__dustMultiplayerTest && window.__nearbyMock));
  await expect(page.locator("#local-multiplayer-lobby")).toBeVisible();
}

async function emitNearby(page, eventName, payload) {
  await page.evaluate(
    ({ eventName, payload }) => window.__nearbyMock.emit(eventName, payload),
    { eventName, payload }
  );
}

async function emitProtocol(page, endpointId, message) {
  await page.evaluate(
    ({ endpointId, message }) => {
      const bytes = new TextEncoder().encode(JSON.stringify(message));
      let binary = "";
      for (const byte of bytes) binary += String.fromCharCode(byte);
      window.__nearbyMock.emit("message", { endpointId, data: window.btoa(binary) });
    },
    { endpointId, message }
  );
}

async function prepareReadyHostAndGuest(page) {
  await openMockLobby(page);
  await page.locator("#multiplayer-host-btn").click();
  await expect.poll(() => page.evaluate(() => window.__nearbyMock.calls.startHost)).toBe(1);

  await emitNearby(page, "state", { event: "connected", endpointId: "guest-a-endpoint" });
  await emitProtocol(page, "guest-a-endpoint", {
    type: "hello",
    version: MULTIPLAYER_PROTOCOL_VERSION,
    playerId: "guest-a-player",
    name: "Guest A",
  });
  await emitProtocol(page, "guest-a-endpoint", { type: "ready", ready: true });
  await page.locator("#multiplayer-ready-btn").click();

  await expect(page.locator("#multiplayer-start-btn")).toBeEnabled();
}

test("opening the Android lobby requests Nearby permissions automatically", async ({ page }) => {
  await openMockLobby(page);

  await expect.poll(() => page.evaluate(() => window.__nearbyMock.calls.requestNearbyPermissions)).toBe(1);
  await expect(page.locator("#multiplayer-lobby-status")).toContainText("Permission granted");
  await expect(page.locator("#multiplayer-host-btn")).toBeEnabled();
});

test("an authenticated hello arriving before connected state is buffered and consumed once", async ({ page }) => {
  await openMockLobby(page);
  await page.locator("#multiplayer-host-btn").click();
  await expect.poll(() => page.evaluate(() => window.__nearbyMock.calls.startHost)).toBe(1);

  await emitProtocol(page, "unknown-endpoint", {
    type: "hello",
    version: MULTIPLAYER_PROTOCOL_VERSION,
    playerId: "unknown-player",
    name: "Unknown",
  });
  expect((await page.evaluate(() => window.__dustMultiplayerTest.getNearbyEndpointDiagnostics())).queuedHelloCount).toBe(0);

  const verificationDialog = page.waitForEvent("dialog");
  await emitNearby(page, "state", {
    event: "authenticationRequired",
    endpointId: "early-guest-endpoint",
    authenticationDigits: "2468",
  });
  const dialog = await verificationDialog;
  await dialog.accept();
  await expect.poll(() => page.evaluate(() => window.__nearbyMock.calls.acceptConnection)).toEqual(["early-guest-endpoint"]);

  await emitProtocol(page, "early-guest-endpoint", {
    type: "hello",
    version: MULTIPLAYER_PROTOCOL_VERSION,
    playerId: "early-guest-player",
    name: "Early Guest",
  });
  const queued = await page.evaluate(() => ({
    state: window.__dustMultiplayerTest.getState(),
    nearby: window.__dustMultiplayerTest.getNearbyEndpointDiagnostics(),
  }));
  expect(queued.state.players).toHaveLength(1);
  expect(queued.nearby.queuedHelloCount).toBe(1);

  await emitNearby(page, "state", { event: "connected", endpointId: "early-guest-endpoint" });
  await expect.poll(() => page.evaluate(() => window.__dustMultiplayerTest.getState().players.map((player) => player.id)))
    .toEqual(expect.arrayContaining(["early-guest-player"]));
  await emitNearby(page, "state", { event: "connected", endpointId: "early-guest-endpoint" });
  await emitProtocol(page, "early-guest-endpoint", {
    type: "hello",
    version: MULTIPLAYER_PROTOCOL_VERSION,
    playerId: "early-guest-player",
    name: "Early Guest",
  });

  const connected = await page.evaluate(() => ({
    state: window.__dustMultiplayerTest.getState(),
    nearby: window.__dustMultiplayerTest.getNearbyEndpointDiagnostics(),
  }));
  expect(connected.state.players.filter((player) => player.id === "early-guest-player")).toHaveLength(1);
  expect(connected.nearby).toMatchObject({
    connectedEndpointIds: ["early-guest-endpoint"],
    expectedEndpointIds: ["early-guest-endpoint"],
    pendingAuthenticationIds: [],
    queuedHelloCount: 0,
  });
});

test("duplicate connected state is idempotent after the hosted match starts", async ({ page }) => {
  await prepareReadyHostAndGuest(page);
  await page.locator("#multiplayer-start-btn").click();
  await expect.poll(() => page.evaluate(() => (
    window.__nearbyMock.calls.send.find((entry) => entry.message?.type === "startPrepare")?.message || null
  ))).not.toBeNull();
  const startPrepare = await page.evaluate(() => (
    window.__nearbyMock.calls.send.find((entry) => entry.message?.type === "startPrepare").message
  ));
  await emitProtocol(page, "guest-a-endpoint", {
    type: "startAck",
    startId: startPrepare.startId,
  });
  await expect.poll(() => page.evaluate(() => window.__dustMultiplayerTest.getState().phase)).toBe("match");

  const before = await page.evaluate(() => ({
    disconnects: window.__nearbyMock.calls.disconnect.length,
    state: window.__dustMultiplayerTest.getState(),
  }));
  await emitNearby(page, "state", { event: "connected", endpointId: "guest-a-endpoint" });
  const after = await page.evaluate(() => ({
    disconnects: window.__nearbyMock.calls.disconnect.length,
    state: window.__dustMultiplayerTest.getState(),
  }));
  expect(after.disconnects).toBe(before.disconnects);
  expect(after.state.phase).toBe("match");
  expect(after.state.matchId).toBe(before.state.matchId);
  expect(after.state.players.map((player) => player.id)).toEqual(before.state.players.map((player) => player.id));
});

test("late authentication and connected events cannot resurrect a closed Nearby session", async ({ page }) => {
  const dialogs = [];
  page.on("dialog", async (dialog) => {
    dialogs.push(dialog.message());
    await dialog.dismiss();
  });
  await openMockLobby(page);
  await page.locator("#multiplayer-host-btn").click();
  await expect.poll(() => page.evaluate(() => window.__nearbyMock.calls.startHost)).toBe(1);
  await page.locator("#multiplayer-lobby-back-btn").click();
  await expect(page.locator("#local-multiplayer-lobby")).toBeHidden();

  await emitNearby(page, "state", {
    event: "authenticationRequired",
    endpointId: "late-endpoint",
    authenticationDigits: "1357",
  });
  await emitNearby(page, "state", { event: "connected", endpointId: "late-endpoint" });
  await expect.poll(() => page.evaluate(() => ({
    rejected: window.__nearbyMock.calls.rejectConnection,
    disconnected: window.__nearbyMock.calls.disconnect,
  }))).toEqual({
    rejected: ["late-endpoint"],
    disconnected: ["late-endpoint"],
  });

  const result = await page.evaluate(() => ({
    state: window.__dustMultiplayerTest.getState(),
    nearby: window.__dustMultiplayerTest.getNearbyEndpointDiagnostics(),
  }));
  expect(dialogs).toEqual([]);
  expect(result.state).toMatchObject({ active: false, phase: "idle", role: "none", players: [] });
  expect(result.nearby).toMatchObject({
    connectedEndpointIds: [],
    expectedEndpointIds: [],
    pendingAuthenticationIds: [],
    queuedHelloCount: 0,
  });
});

test("Nearby operation tokens isolate host discovery host sessions", async ({ page }) => {
  const dialogs = [];
  page.on("dialog", async (dialog) => {
    dialogs.push(dialog.message());
    await dialog.accept();
  });
  await openMockLobby(page);

  await page.locator("#multiplayer-host-btn").click();
  await expect.poll(() => page.evaluate(() => window.__nearbyMock.calls.startHost)).toBe(1);
  const firstHostOperationId = await page.evaluate(() => (
    window.__nearbyMock.calls.operationIds.startHost[0]
  ));

  await expect(page.locator("#multiplayer-discover-btn")).toBeEnabled();
  await page.locator("#multiplayer-discover-btn").click();
  await expect.poll(() => page.evaluate(() => window.__nearbyMock.calls.startDiscovery)).toBe(1);
  const discoveryOperationId = await page.evaluate(() => (
    window.__nearbyMock.calls.operationIds.startDiscovery[0]
  ));
  expect(discoveryOperationId).toBeGreaterThan(firstHostOperationId);

  await emitNearby(page, "peer", {
    event: "found",
    endpointId: "old-token-host",
    name: "Old token",
    operationId: firstHostOperationId,
  });
  await page.evaluate(() => {
    window.__nearbyMock.emitRaw("peer", {
      event: "found",
      endpointId: "missing-token-host",
      name: "Missing token",
    });
  });
  await emitNearby(page, "peer", {
    event: "found",
    endpointId: "current-token-host",
    name: "Current token",
    operationId: discoveryOperationId,
  });
  await expect(page.locator('[data-endpoint-id="current-token-host"]')).toHaveCount(1);
  await expect(page.locator('[data-endpoint-id="old-token-host"]')).toHaveCount(0);
  await expect(page.locator('[data-endpoint-id="missing-token-host"]')).toHaveCount(0);

  await expect(page.locator("#multiplayer-host-btn")).toBeEnabled();
  await page.locator("#multiplayer-host-btn").click();
  await expect.poll(() => page.evaluate(() => window.__nearbyMock.calls.startHost)).toBe(2);
  const currentOperationId = await page.evaluate(() => (
    window.__nearbyMock.calls.operationIds.startHost[1]
  ));
  expect(currentOperationId).toBeGreaterThan(discoveryOperationId);

  await emitNearby(page, "state", {
    event: "authenticationRequired",
    endpointId: "stale-endpoint",
    authenticationDigits: "1111",
    operationId: firstHostOperationId,
  });
  await page.evaluate(() => {
    window.__nearbyMock.emitRaw("state", {
      event: "authenticationRequired",
      endpointId: "missing-operation-endpoint",
      authenticationDigits: "2222",
    });
  });
  await page.waitForTimeout(50);
  expect(dialogs).toEqual([]);
  expect(await page.evaluate(() => ({
    rejected: window.__nearbyMock.calls.rejectConnection.slice(),
    disconnected: window.__nearbyMock.calls.disconnect.slice(),
    nearby: window.__dustMultiplayerTest.getNearbyEndpointDiagnostics(),
  }))).toMatchObject({
    rejected: [],
    disconnected: [],
    nearby: {
      operationId: currentOperationId,
      connectedEndpointIds: [],
      expectedEndpointIds: [],
      pendingAuthenticationIds: [],
      queuedHelloCount: 0,
    },
  });

  await emitNearby(page, "state", {
    event: "authenticationRequired",
    endpointId: "current-endpoint",
    authenticationDigits: "3333",
    operationId: currentOperationId,
  });
  await expect.poll(() => page.evaluate(() => window.__nearbyMock.calls.acceptConnection))
    .toEqual(["current-endpoint"]);
  expect(dialogs).toHaveLength(1);

  await emitNearby(page, "state", {
    event: "connected",
    endpointId: "current-endpoint",
    operationId: discoveryOperationId,
  });
  await page.evaluate(() => {
    window.__nearbyMock.emitRaw("state", {
      event: "connected",
      endpointId: "current-endpoint",
    });
  });
  expect(await page.evaluate(() => ({
    disconnected: window.__nearbyMock.calls.disconnect.slice(),
    nearby: window.__dustMultiplayerTest.getNearbyEndpointDiagnostics(),
  }))).toMatchObject({
    disconnected: [],
    nearby: {
      connectedEndpointIds: [],
      expectedEndpointIds: ["current-endpoint"],
      pendingAuthenticationIds: ["current-endpoint"],
    },
  });

  await emitNearby(page, "state", {
    event: "connected",
    endpointId: "current-endpoint",
    operationId: currentOperationId,
  });
  await expect.poll(() => page.evaluate(() => (
    window.__dustMultiplayerTest.getNearbyEndpointDiagnostics().connectedEndpointIds
  ))).toEqual(["current-endpoint"]);

  await page.evaluate(({ oldOperationId }) => {
    const message = {
      type: "hello",
      version: 46,
      playerId: "current-player",
      name: "Current player",
    };
    const bytes = new TextEncoder().encode(JSON.stringify(message));
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    const payload = {
      endpointId: "current-endpoint",
      data: window.btoa(binary),
    };
    window.__nearbyMock.emit("message", {
      ...payload,
      operationId: oldOperationId,
    });
    window.__nearbyMock.emitRaw("message", payload);
  }, { oldOperationId: firstHostOperationId });
  expect((await page.evaluate(() => window.__dustMultiplayerTest.getState())).players).toHaveLength(1);

  await emitProtocol(page, "current-endpoint", {
    type: "hello",
    version: MULTIPLAYER_PROTOCOL_VERSION,
    playerId: "current-player",
    name: "Current player",
  });
  await expect.poll(() => page.evaluate(() => (
    window.__dustMultiplayerTest.getState().players.filter((player) => player.id === "current-player").length
  ))).toBe(1);

  const result = await page.evaluate(() => ({
    operationIds: window.__nearbyMock.calls.operationIds,
    lobbySendCount: window.__nearbyMock.calls.send.filter((entry) => entry.message?.type === "lobby").length,
    rejected: window.__nearbyMock.calls.rejectConnection.slice(),
    disconnected: window.__nearbyMock.calls.disconnect.slice(),
  }));
  expect(result.operationIds.startHost).toEqual([firstHostOperationId, currentOperationId]);
  expect(result.operationIds.startDiscovery).toEqual([discoveryOperationId]);
  expect(result.operationIds.stopAll).toEqual([
    firstHostOperationId,
    discoveryOperationId,
    currentOperationId,
  ]);
  expect(result.operationIds.acceptConnection).toEqual([currentOperationId]);
  expect(result.operationIds.sendBytes).toEqual([currentOperationId]);
  expect(result.lobbySendCount).toBe(1);
  expect(result.rejected).toEqual([]);
  expect(result.disconnected).toEqual([]);
});

test("a delayed rejection send cannot disconnect a same-id replacement connection", async ({ page }) => {
  await openMockLobby(page);
  await page.locator("#multiplayer-host-btn").click();
  await expect.poll(() => page.evaluate(() => window.__nearbyMock.calls.startHost)).toBe(1);

  const result = await page.evaluate(async (protocolVersion) => {
    const api = window.__dustMultiplayerTest;
    const mock = window.__nearbyMock;
    const endpointId = "mock-endpoint-1";
    mock.emit("state", {
      event: "connected",
      endpointId,
      connectionNonce: 101,
    });
    const oldNonce = api.getNearbyEndpointDiagnostics().connectionNonces[endpointId];

    mock.deferMessageType = "error";
    api.receiveProtocol({
      type: "hello",
      version: protocolVersion - 1,
      playerId: "invalid-old-player",
      name: "Old Guest",
    }, endpointId);
    const deferredBeforeReconnect = mock.pendingMessageSends.length;
    const rejectedSendNonce = mock.calls.send.find((entry) => entry.message?.type === "error")?.connectionNonce;

    mock.emit("state", {
      event: "disconnected",
      endpointId,
      connectionNonce: oldNonce,
    });
    const replacementNonce = oldNonce + 1000;
    mock.emit("state", {
      event: "connected",
      endpointId,
      connectionNonce: replacementNonce,
    });
    api.receiveProtocol({
      type: "hello",
      version: protocolVersion,
      playerId: "replacement-player",
      name: "Replacement Guest",
    }, endpointId);

    mock.rejectDeferredMessages("error");
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    return {
      deferredBeforeReconnect,
      oldNonce,
      replacementNonce,
      rejectedSendNonce,
      disconnected: mock.calls.disconnect.slice(),
      disconnectOptions: mock.calls.disconnectOptions.slice(),
      identityRejections: mock.calls.identityRejections.slice(),
      diagnostics: api.getNearbyEndpointDiagnostics(),
      players: api.getState().players.map((player) => player.id),
    };
  }, MULTIPLAYER_PROTOCOL_VERSION);

  expect(result.deferredBeforeReconnect).toBe(1);
  expect(result.rejectedSendNonce).toBe(result.oldNonce);
  expect(result.replacementNonce).not.toBe(result.oldNonce);
  expect(result.disconnected).toEqual([]);
  expect(result.disconnectOptions).toEqual([]);
  expect(result.identityRejections).toEqual([]);
  expect(result.diagnostics.connectionNonces["mock-endpoint-1"]).toBeGreaterThan(1000);
  expect(result.players).toContain("replacement-player");
});

test("stale same-id message and disconnect events cannot replace the current connection identity", async ({ page }) => {
  await openMockLobby(page);
  await page.locator("#multiplayer-host-btn").click();
  await expect.poll(() => page.evaluate(() => window.__nearbyMock.calls.startHost)).toBe(1);

  const identity = await page.evaluate((protocolVersion) => {
    const api = window.__dustMultiplayerTest;
    const mock = window.__nearbyMock;
    const endpointId = "reused-endpoint";
    const operationId = api.getNearbyEndpointDiagnostics().operationId;
    const encode = (message) => {
      const bytes = new TextEncoder().encode(JSON.stringify(message));
      let binary = "";
      for (const byte of bytes) binary += String.fromCharCode(byte);
      return window.btoa(binary);
    };

    const oldNonce = 501;
    const replacementNonce = 1501;
    mock.emit("state", { event: "connected", endpointId, operationId, connectionNonce: oldNonce });
    mock.emit("state", { event: "disconnected", endpointId, operationId, connectionNonce: oldNonce });
    mock.emit("state", {
      event: "connected",
      endpointId,
      operationId,
      connectionNonce: replacementNonce,
    });
    mock.emitRaw("message", {
      endpointId,
      operationId,
      connectionNonce: replacementNonce,
      data: encode({
        type: "hello",
        version: protocolVersion,
        playerId: "replacement-player",
        name: "Replacement Guest",
      }),
    });
    return { endpointId, operationId, oldNonce, replacementNonce };
  }, MULTIPLAYER_PROTOCOL_VERSION);

  await expect.poll(() => page.evaluate(() => (
    window.__dustMultiplayerTest.getState().players.map((player) => player.id)
  ))).toContain("replacement-player");

  await page.evaluate(({ identity, protocolVersion }) => {
    const encode = (message) => {
      const bytes = new TextEncoder().encode(JSON.stringify(message));
      let binary = "";
      for (const byte of bytes) binary += String.fromCharCode(byte);
      return window.btoa(binary);
    };
    window.__nearbyMock.emitRaw("message", {
      endpointId: identity.endpointId,
      operationId: identity.operationId,
      connectionNonce: identity.oldNonce,
      data: encode({
        type: "hello",
        version: protocolVersion,
        playerId: "stale-player",
        name: "Stale Guest",
      }),
    });
    window.__nearbyMock.emitRaw("state", {
      event: "disconnected",
      endpointId: identity.endpointId,
      operationId: identity.operationId,
      connectionNonce: identity.oldNonce,
    });
  }, { identity, protocolVersion: MULTIPLAYER_PROTOCOL_VERSION });

  await expect.poll(() => page.evaluate(() => ({
    diagnostics: window.__dustMultiplayerTest.getNearbyEndpointDiagnostics(),
    playerIds: window.__dustMultiplayerTest.getState().players.map((player) => player.id),
  }))).toMatchObject({
    diagnostics: {
      connectedEndpointIds: [identity.endpointId],
      connectionNonces: { [identity.endpointId]: identity.replacementNonce },
    },
    playerIds: expect.arrayContaining(["replacement-player"]),
  });
  expect(await page.evaluate(() => (
    window.__dustMultiplayerTest.getState().players.some((player) => player.id === "stale-player")
  ))).toBe(false);
});

test("Nearby listener binding rolls back a partial rejection and retries single-flight", async ({ page }) => {
  await openMockLobby(page, { failListenerOnce: "message" });

  await expect.poll(() => page.evaluate(() => ({
    binding: window.__dustMultiplayerTest.getNearbyBindingDiagnostics(),
    addListener: window.__nearbyMock.calls.addListener.slice(),
    removeListener: window.__nearbyMock.calls.removeListener.slice(),
    activeListeners: ["peer", "message", "state"].map((eventName) => (
      window.__nearbyMock.listenerCount(eventName)
    )),
  }))).toEqual({
    binding: { bound: false, binding: false, listenerHandleCount: 0 },
    addListener: ["peer", "message", "state"],
    removeListener: ["peer", "state"],
    activeListeners: [0, 0, 0],
  });

  const retry = await page.evaluate(async () => {
    const first = window.__dustMultiplayerTest.bindNearbyConnectionsForTest();
    const second = window.__dustMultiplayerTest.bindNearbyConnectionsForTest();
    const singleFlight = first === second;
    const results = await Promise.all([first, second]);
    return {
      singleFlight,
      results,
      binding: window.__dustMultiplayerTest.getNearbyBindingDiagnostics(),
      addListener: window.__nearbyMock.calls.addListener.slice(),
      removeListener: window.__nearbyMock.calls.removeListener.slice(),
      activeListeners: ["peer", "message", "state"].map((eventName) => (
        window.__nearbyMock.listenerCount(eventName)
      )),
    };
  });

  expect(retry).toEqual({
    singleFlight: true,
    results: [true, true],
    binding: { bound: true, binding: false, listenerHandleCount: 3 },
    addListener: ["peer", "message", "state", "peer", "message", "state"],
    removeListener: ["peer", "state"],
    activeListeners: [1, 1, 1],
  });
});

test("hosting waits for delayed Nearby listeners and starts only once", async ({ page }) => {
  await openMockLobby(page, { deferListeners: true });
  await expect(page.locator("#multiplayer-host-btn")).toBeEnabled();

  await page.evaluate(() => {
    const button = document.getElementById("multiplayer-host-btn");
    button.click();
    button.click();
  });

  await expect(page.locator("#local-multiplayer-lobby")).toHaveAttribute("aria-busy", "true");
  await expect(page.locator("#multiplayer-lobby-status")).toContainText(
    "Preparing Nearby listeners for hosting"
  );
  expect(await page.evaluate(() => ({
    binding: window.__dustMultiplayerTest.getNearbyBindingDiagnostics(),
    addListener: window.__nearbyMock.calls.addListener.slice(),
    stopAll: window.__nearbyMock.calls.stopAll,
    startHost: window.__nearbyMock.calls.startHost,
  }))).toEqual({
    binding: { bound: false, binding: true, listenerHandleCount: 0 },
    addListener: ["peer", "message", "state"],
    stopAll: 0,
    startHost: 0,
  });

  await page.evaluate(() => window.__nearbyMock.resolveListenerBindings());
  await expect.poll(() => page.evaluate(() => window.__nearbyMock.calls.startHost)).toBe(1);
  await expect(page.locator("#multiplayer-lobby-status")).toContainText("Match created");
  await expect(page.locator("#local-multiplayer-lobby")).toHaveAttribute("aria-busy", "false");
  expect(await page.evaluate(() => ({
    binding: window.__dustMultiplayerTest.getNearbyBindingDiagnostics(),
    addListener: window.__nearbyMock.calls.addListener.slice(),
    stopAll: window.__nearbyMock.calls.stopAll,
    startHost: window.__nearbyMock.calls.startHost,
  }))).toEqual({
    binding: { bound: true, binding: false, listenerHandleCount: 3 },
    addListener: ["peer", "message", "state"],
    stopAll: 1,
    startHost: 1,
  });
});

test("discovery never starts after a failed Nearby bind and remains retryable", async ({ page }) => {
  await openMockLobby(page, {
    failListenerOnce: "message",
    failListenerCount: 2,
  });

  await expect.poll(() => page.evaluate(() => ({
    binding: window.__dustMultiplayerTest.getNearbyBindingDiagnostics(),
    addListener: window.__nearbyMock.calls.addListener.slice(),
    removeListener: window.__nearbyMock.calls.removeListener.slice(),
  }))).toEqual({
    binding: { bound: false, binding: false, listenerHandleCount: 0 },
    addListener: ["peer", "message", "state"],
    removeListener: ["peer", "state"],
  });
  await expect(page.locator("#multiplayer-discover-btn")).toBeEnabled();

  await page.locator("#multiplayer-discover-btn").click();
  await expect.poll(() => page.evaluate(() => ({
    binding: window.__dustMultiplayerTest.getNearbyBindingDiagnostics(),
    addListener: window.__nearbyMock.calls.addListener.length,
    removeListener: window.__nearbyMock.calls.removeListener.slice(),
    stopAll: window.__nearbyMock.calls.stopAll,
    startDiscovery: window.__nearbyMock.calls.startDiscovery,
    activeListeners: ["peer", "message", "state"].map((eventName) => (
      window.__nearbyMock.listenerCount(eventName)
    )),
  }))).toEqual({
    binding: { bound: false, binding: false, listenerHandleCount: 0 },
    addListener: 6,
    removeListener: ["peer", "state", "peer", "state"],
    stopAll: 0,
    startDiscovery: 0,
    activeListeners: [0, 0, 0],
  });
  await expect(page.locator("#multiplayer-lobby-status")).toContainText(
    "Synthetic message listener failure"
  );
  await expect(page.locator("#local-multiplayer-lobby")).toHaveAttribute("aria-busy", "false");
  await expect(page.locator("#multiplayer-discover-btn")).toBeEnabled();

  await page.locator("#multiplayer-discover-btn").click();
  await expect.poll(() => page.evaluate(() => window.__nearbyMock.calls.startDiscovery)).toBe(1);
  await expect(page.locator("#multiplayer-lobby-status")).toContainText("Discovery started");
  expect(await page.evaluate(() => ({
    binding: window.__dustMultiplayerTest.getNearbyBindingDiagnostics(),
    addListener: window.__nearbyMock.calls.addListener.length,
    stopAll: window.__nearbyMock.calls.stopAll,
    startDiscovery: window.__nearbyMock.calls.startDiscovery,
    activeListeners: ["peer", "message", "state"].map((eventName) => (
      window.__nearbyMock.listenerCount(eventName)
    )),
  }))).toEqual({
    binding: { bound: true, binding: false, listenerHandleCount: 3 },
    addListener: 9,
    stopAll: 1,
    startDiscovery: 1,
    activeListeners: [1, 1, 1],
  });
});

test("joining waits for its delayed Nearby listener before requesting a connection", async ({ page }) => {
  await openMockLobby(page, { deferListenerEvent: "state" });
  await expect(page.locator("#multiplayer-host-btn")).toBeEnabled();
  await expect.poll(() => page.evaluate(() => ({
    binding: window.__dustMultiplayerTest.getNearbyBindingDiagnostics(),
    activeListeners: ["peer", "message", "state"].map((eventName) => (
      window.__nearbyMock.listenerCount(eventName)
    )),
  }))).toEqual({
    binding: { bound: false, binding: true, listenerHandleCount: 0 },
    activeListeners: [1, 1, 0],
  });

  // Prime only the selection under test. A real peer cannot be discovered
  // before the deferred state listener has completed and discovery has begun;
  // accepting such a synthetic event would weaken the stale-event gate.
  await page.evaluate(() => {
    window.__dustMultiplayerTest.prepareNearbyJoinForTest("delayed-host", "Delayed Host");
  });
  await expect(page.locator("#multiplayer-join-btn")).toBeEnabled();
  await page.evaluate(() => {
    const button = document.getElementById("multiplayer-join-btn");
    button.click();
    button.click();
  });

  await expect(page.locator("#local-multiplayer-lobby")).toHaveAttribute("aria-busy", "true");
  await expect(page.locator("#multiplayer-lobby-status")).toContainText(
    "Preparing Nearby listeners for connection"
  );
  expect(await page.evaluate(() => window.__nearbyMock.calls.requestConnection)).toEqual([]);

  await page.evaluate(() => window.__nearbyMock.resolveListenerBindings());
  await expect.poll(() => page.evaluate(() => window.__nearbyMock.calls.requestConnection.length)).toBe(1);
  await expect(page.locator("#local-multiplayer-lobby")).toHaveAttribute("aria-busy", "true");
  expect(await page.evaluate(() => ({
    binding: window.__dustMultiplayerTest.getNearbyBindingDiagnostics(),
    endpoints: window.__nearbyMock.calls.requestConnection.map((entry) => entry.endpointId),
  }))).toEqual({
    binding: { bound: true, binding: false, listenerHandleCount: 3 },
    endpoints: ["delayed-host"],
  });

  await page.evaluate(() => document.getElementById("multiplayer-join-btn").click());
  expect(await page.evaluate(() => window.__nearbyMock.calls.requestConnection.length)).toBe(1);

  await emitNearby(page, "state", { event: "connected", endpointId: "delayed-host" });
  await expect(page.locator("#local-multiplayer-lobby")).toHaveAttribute("aria-busy", "false");
});

test("a failed guest connection resumes discovery with the current operation token", async ({ page }) => {
  await openMockLobby(page);
  await page.locator("#multiplayer-discover-btn").click();
  await expect.poll(() => page.evaluate(() => window.__nearbyMock.calls.startDiscovery)).toBe(1);

  await emitNearby(page, "peer", {
    event: "found",
    endpointId: "failed-host",
    name: "Unavailable Host",
  });
  await page.locator('[data-endpoint-id="failed-host"]').click();
  await page.locator("#multiplayer-join-btn").click();
  await expect.poll(() => page.evaluate(() => window.__nearbyMock.calls.requestConnection.length)).toBe(1);

  const operationIds = await page.evaluate(() => ({
    discovery: window.__nearbyMock.calls.operationIds.startDiscovery[0],
    connection: window.__nearbyMock.calls.operationIds.requestConnection[0],
    stoppedDiscovery: window.__nearbyMock.calls.operationIds.stopDiscovery[0],
  }));
  expect(operationIds.connection).toBeGreaterThan(operationIds.discovery);
  expect(operationIds.stoppedDiscovery).toBe(operationIds.connection);

  await emitNearby(page, "state", {
    event: "connectionFailed",
    endpointId: "failed-host",
    operationId: operationIds.discovery,
  });
  await page.waitForTimeout(50);
  expect(await page.evaluate(() => window.__nearbyMock.calls.startDiscovery)).toBe(1);

  await emitNearby(page, "state", {
    event: "connectionFailed",
    endpointId: "failed-host",
    operationId: operationIds.connection,
  });
  await expect.poll(() => page.evaluate(() => window.__nearbyMock.calls.startDiscovery)).toBe(2);

  expect(await page.evaluate(() => ({
    operationIds: window.__nearbyMock.calls.operationIds.startDiscovery.slice(),
    state: window.__dustMultiplayerTest.getState(),
    nearby: window.__dustMultiplayerTest.getNearbyEndpointDiagnostics(),
  }))).toMatchObject({
    operationIds: [operationIds.discovery, operationIds.connection],
    state: {
      active: true,
      phase: "lobby",
      role: "guest",
    },
    nearby: {
      operationId: operationIds.connection,
      connectedEndpointIds: [],
      expectedEndpointIds: [],
      pendingAuthenticationIds: [],
    },
  });
  await expect(page.locator("#multiplayer-discover-btn")).toBeEnabled();
  await expect(page.locator("#multiplayer-join-btn")).toBeDisabled();
  await expect(page.locator("#multiplayer-lobby-status")).toContainText("Discovery resumed");
});

test("a discovered match uses the full session row width", async ({ page }) => {
  await openMockLobby(page);
  await page.locator("#multiplayer-discover-btn").click();
  await emitNearby(page, "peer", { event: "found", endpointId: "wide-host", name: "Nearby Cowboys" });

  const row = page.locator('[data-endpoint-id="wide-host"]');
  await expect(row.locator(".multiplayer-session-row__signal")).toBeVisible();
  await expect(row.locator(".multiplayer-session-row__name")).toHaveText("Nearby Cowboys");
  await expect(row.locator(".multiplayer-session-row__capacity")).toHaveText("Join");
  const sizes = await row.evaluate((element) => ({ width: element.getBoundingClientRect().width, parentWidth: element.parentElement.getBoundingClientRect().width }));
  expect(sizes.width).toBeGreaterThan(180);
  expect(sizes.width).toBeGreaterThan(sizes.parentWidth * 0.85);
});

test("a guest can request the shared lobby or leave the result screen for the menu", async ({ page }) => {
  await openMockLobby(page);
  await page.evaluate(() => {
    window.__dustMultiplayerTest.startMockGuest(["Host", "Guest"], 1);
    window.__dustMultiplayerTest.finishMatch(["mock-player-1"], "test");
  });
  await expect(page.locator("#multiplayer-result-panel")).toBeVisible();
  await expect(page.locator("#game-over")).toBeHidden();

  await page.locator("#multiplayer-return-lobby-btn").click();
  const matchId = (await page.evaluate(() => window.__dustMultiplayerTest.getState())).matchId;
  await expect.poll(() => page.evaluate((expectedMatchId) => window.__nearbyMock.calls.send.some((entry) => (
    entry.message?.type === "returnLobbyRequest" &&
    entry.message?.matchId === expectedMatchId
  )), matchId)).toBe(true);
  await emitProtocol(page, "mock-host-endpoint", {
    type: "returnLobby",
    version: MULTIPLAYER_PROTOCOL_VERSION,
    mapSeed: 7331,
    matchId,
    hostPlayerId: "mock-player-1",
    players: [
      { id: "mock-player-1", name: "Host", ready: false, connected: true },
      { id: "mock-player-2", name: "Guest", ready: false, connected: true },
    ],
  });
  await expect(page.locator("#local-multiplayer-lobby")).toBeVisible();
  expect((await page.evaluate(() => window.__dustMultiplayerTest.getState())).phase).toBe("lobby");

  await page.evaluate(() => {
    window.__dustMultiplayerTest.startMockGuest(["Host", "Guest"], 1);
    window.__dustMultiplayerTest.finishMatch(["mock-player-1"], "test");
  });
  await page.locator("#multiplayer-return-menu-btn").click();
  await expect(page.locator("#menu")).toBeVisible();
  expect((await page.evaluate(() => window.__dustMultiplayerTest.getState())).active).toBe(false);
});

test("a guest rebuilds the host map in place and restores its solo map on Back", async ({ page }) => {
  await openMockLobby(page);
  await page.locator("#multiplayer-discover-btn").click();
  const localPlayerId = await page.evaluate(() => window.__dustMultiplayerTest.getState().localPlayerId);
  await emitNearby(page, "peer", { event: "found", endpointId: "host-endpoint", name: "Host" });
  await page.locator('[data-endpoint-id="host-endpoint"]').click();
  await page.locator("#multiplayer-join-btn").click();
  await emitNearby(page, "state", { event: "connected", endpointId: "host-endpoint" });
  await emitProtocol(page, "host-endpoint", {
    type: "lobby",
    version: MULTIPLAYER_PROTOCOL_VERSION,
    mapSeed: 4242,
    hostPlayerId: "host-player",
    players: [
      { id: "host-player", name: "Host", ready: false, connected: true },
      { id: localPlayerId, name: "Guest", ready: false, connected: true },
    ],
  });

  await expect.poll(() => page.evaluate(() => window.__dustMultiplayerTest.getState().renderedMapSeed)).toBe(4242);
  expect(await page.evaluate(() => window.__dustMultiplayerTest.getState().mapSeed)).toBe(4242);
  expect(await page.evaluate(() => window.__dustAndDeadTest.validateMapLayout().issueCount)).toBe(0);

  await page.locator("#multiplayer-lobby-back-btn").click();
  await expect.poll(() => page.evaluate(() => JSON.parse(window.render_game_to_text()).map.seed)).not.toBe(4242);
  expect(await page.evaluate(() => window.__dustAndDeadTest.validateMapLayout().issueCount)).toBe(0);
  expect(new URL(page.url()).searchParams.has("mapSeed")).toBe(false);
});

test("every hosted match gets a fresh map seed, including a lobby rematch", async ({ page }) => {
  await prepareReadyHostAndGuest(page);
  const initialSeed = await page.evaluate(() => window.__dustMultiplayerTest.getState().mapSeed);
  const hostLook = { cowboyId: "ashenProspector", hatId: "bellCrown" };
  const guestReadyLook = { cowboyId: "moonlitOutlaw", hatId: "railmanCap" };
  const guestLook = { cowboyId: "crimsonLawman", hatId: "marshalStar" };
  const hostEquipped = await page.evaluate((profile) => {
    [
      "ghostTrain",
      "bellRinger",
      "oilBaron",
      "slothArchbishop",
      "hordeheart",
      "landEater",
    ].forEach((boss) => window.DustAndDeadProgression.recordSoloBoss(boss));
    return window.DustAndDeadProgression.selectCosmeticProfile(profile);
  }, hostLook);
  expect(hostEquipped.accepted).toBe(true);
  await emitProtocol(page, "guest-a-endpoint", {
    type: "ready",
    ready: true,
    cosmetics: guestReadyLook,
  });

  await page.locator("#multiplayer-start-btn").click();
  await expect.poll(() => page.evaluate(() => window.__nearbyMock.calls.send.filter((entry) => entry.message?.type === "startPrepare").length)).toBe(1);
  const firstPrepare = await page.evaluate(() => window.__nearbyMock.calls.send.find((entry) => entry.message?.type === "startPrepare").message);
  expect(firstPrepare.mapSeed).not.toBe(initialSeed);
  expect(firstPrepare.players.map((player) => player.cosmetics)).toEqual([
    { version: 1, ...hostLook },
    { version: 1, ...guestReadyLook },
  ]);
  await expect.poll(() => page.evaluate(() => window.__dustMultiplayerTest.getState().renderedMapSeed)).toBe(firstPrepare.mapSeed);

  await emitProtocol(page, "guest-a-endpoint", {
    type: "startAck",
    startId: firstPrepare.startId,
    cosmetics: guestLook,
  });
  await expect.poll(() => page.evaluate(() => window.__dustMultiplayerTest.getState().phase)).toBe("match");
  const firstStart = await page.evaluate(() => window.__nearbyMock.calls.send.find((entry) => entry.message?.type === "start").message);
  expect(firstStart.mapSeed).toBe(firstPrepare.mapSeed);
  expect(firstStart.players.map((player) => player.cosmetics)).toEqual([
    { version: 1, ...hostLook },
    { version: 1, ...guestLook },
  ]);

  await page.evaluate(() => window.__dustMultiplayerTest.finishMatch(["mock-player-1"], "test"));
  await page.locator("#multiplayer-return-lobby-btn").click();
  await expect.poll(() => page.evaluate(() => window.__dustMultiplayerTest.getState().phase)).toBe("lobby");
  expect((await page.evaluate(() => window.__dustMultiplayerTest.getState())).players
    .map((player) => player.cosmetics)).toEqual([
    { version: 1, ...hostLook },
    { version: 1, ...guestLook },
  ]);
  await emitProtocol(page, "guest-a-endpoint", {
    type: "ready",
    ready: true,
    cosmetics: guestReadyLook,
  });
  await page.locator("#multiplayer-ready-btn").click();
  await expect(page.locator("#multiplayer-start-btn")).toBeEnabled();

  await page.locator("#multiplayer-start-btn").click();
  await expect.poll(() => page.evaluate(() => window.__nearbyMock.calls.send.filter((entry) => entry.message?.type === "startPrepare").length)).toBe(2);
  const secondPrepare = await page.evaluate(() => window.__nearbyMock.calls.send.filter((entry) => entry.message?.type === "startPrepare").at(-1).message);
  expect(secondPrepare.mapSeed).not.toBe(firstPrepare.mapSeed);
  expect(secondPrepare.players.map((player) => player.cosmetics)).toEqual([
    { version: 1, ...hostLook },
    { version: 1, ...guestReadyLook },
  ]);
  await expect.poll(() => page.evaluate(() => window.__dustMultiplayerTest.getState().renderedMapSeed)).toBe(secondPrepare.mapSeed);

  await emitProtocol(page, "guest-a-endpoint", {
    type: "startAck",
    startId: secondPrepare.startId,
    cosmetics: guestLook,
  });
  await expect.poll(() => page.evaluate(() => window.__dustMultiplayerTest.getState().phase)).toBe("match");
  const secondStart = await page.evaluate(() => window.__nearbyMock.calls.send.filter((entry) => entry.message?.type === "start").at(-1).message);
  expect(secondStart.players.map((player) => player.cosmetics)).toEqual([
    { version: 1, ...hostLook },
    { version: 1, ...guestLook },
  ]);
  const secondMatch = await page.evaluate(() => window.__dustMultiplayerTest.getState());
  expect(secondMatch.players.map((player) => player.cosmetics)).toEqual([
    { version: 1, ...hostLook },
    { version: 1, ...guestLook },
  ]);
  expect(secondMatch.players.map((player) => player.entityCosmetics.cosmetics))
    .toEqual(secondMatch.players.map((player) => player.cosmetics));
});

test("guest rebuilds a fresh startPrepare map before acknowledging and starting", async ({ page }) => {
  await openMockLobby(page);
  await page.locator("#multiplayer-discover-btn").click();
  const localPlayerId = await page.evaluate(() => window.__dustMultiplayerTest.getState().localPlayerId);
  await emitNearby(page, "peer", { event: "found", endpointId: "host-endpoint", name: "Host" });
  await page.locator('[data-endpoint-id="host-endpoint"]').click();
  await page.locator("#multiplayer-join-btn").click();
  await emitNearby(page, "state", { event: "connected", endpointId: "host-endpoint" });
  const roster = [
    { id: "host-player", name: "Host", ready: true, connected: true },
    { id: localPlayerId, name: "Guest", ready: true, connected: true },
  ];
  await emitProtocol(page, "host-endpoint", {
    type: "lobby",
    version: MULTIPLAYER_PROTOCOL_VERSION,
    mapSeed: 4242,
    hostPlayerId: "host-player",
    players: roster,
  });

  await emitProtocol(page, "host-endpoint", {
    type: "startPrepare",
    startId: "fresh-map-start",
    version: MULTIPLAYER_PROTOCOL_VERSION,
    mapSeed: 5151,
    hostPlayerId: "host-player",
    players: roster,
  });

  await expect.poll(() => page.evaluate(() => window.__dustMultiplayerTest.getState().renderedMapSeed)).toBe(5151);
  await expect.poll(() => page.evaluate(() => window.__nearbyMock.calls.send.some((entry) => entry.message?.type === "startAck" && entry.message?.startId === "fresh-map-start"))).toBe(true);
  expect((await page.evaluate(() => window.__dustMultiplayerTest.getState())).mapSeed).toBe(5151);

  await emitProtocol(page, "host-endpoint", {
    type: "start",
    startId: "fresh-map-start",
    version: MULTIPLAYER_PROTOCOL_VERSION,
    mapSeed: 5151,
    hostPlayerId: "host-player",
    players: roster,
  });
  await expect.poll(() => page.evaluate(() => window.__dustMultiplayerTest.getState().phase)).toBe("match");
  expect((await page.evaluate(() => window.__dustMultiplayerTest.getState())).renderedMapSeed).toBe(5151);
});

test("a late connected peer blocks start until it joins the roster and becomes ready", async ({ page }) => {
  await prepareReadyHostAndGuest(page);

  await emitNearby(page, "state", { event: "connected", endpointId: "guest-b-endpoint" });

  await expect(page.locator("#multiplayer-start-btn")).toBeDisabled();
  expect(await page.evaluate(() => window.__dustMultiplayerTest.getState().phase)).toBe("lobby");

  await emitProtocol(page, "guest-b-endpoint", {
    type: "hello",
    version: MULTIPLAYER_PROTOCOL_VERSION,
    playerId: "guest-b-player",
    name: "Guest B",
  });
  await expect(page.locator("#multiplayer-start-btn")).toBeDisabled();

  await emitProtocol(page, "guest-b-endpoint", { type: "ready", ready: true });
  await expect(page.locator("#multiplayer-start-btn")).toBeEnabled();
  await expect(page.locator("#multiplayer-player-list [data-player-id]")).toHaveCount(3);
});

test("canceling connection-code verification cannot leave a phantom player blocking the host", async ({ page }) => {
  await prepareReadyHostAndGuest(page);

  const localCancelDialog = page.waitForEvent("dialog");
  await emitNearby(page, "state", {
    event: "authenticationRequired",
    endpointId: "cancelled-locally-endpoint",
    authenticationDigits: "4821",
  });
  const localDialog = await localCancelDialog;
  expect(localDialog.message()).toContain("4821");
  await localDialog.dismiss();

  await expect.poll(() => page.evaluate(() => window.__nearbyMock.calls.rejectConnection)).toEqual(["cancelled-locally-endpoint"]);
  await expect(page.locator("#multiplayer-start-btn")).toBeEnabled();
  await expect(page.locator("#multiplayer-player-list [data-player-id]")).toHaveCount(2);
  await expect(page.locator("#multiplayer-connection-code")).not.toHaveText("4821");

  const remoteCancelDialog = page.waitForEvent("dialog");
  await emitNearby(page, "state", {
    event: "authenticationRequired",
    endpointId: "cancelled-remotely-endpoint",
    authenticationDigits: "7394",
  });
  const remoteDialog = await remoteCancelDialog;
  expect(remoteDialog.message()).toContain("7394");
  await remoteDialog.accept();
  await expect.poll(() => page.evaluate(() => window.__nearbyMock.calls.acceptConnection)).toEqual(["cancelled-remotely-endpoint"]);

  await emitNearby(page, "state", {
    event: "connectionRejected",
    endpointId: "cancelled-remotely-endpoint",
  });
  await expect(page.locator("#multiplayer-start-btn")).toBeEnabled();
  await expect(page.locator("#multiplayer-player-list [data-player-id]")).toHaveCount(2);
  await expect(page.locator("#multiplayer-connection-code")).not.toHaveText("7394");

  // A late bridge event can arrive after hello has already registered the
  // endpoint. The terminal rejection must remove that not-ready roster row too.
  await emitNearby(page, "state", { event: "connected", endpointId: "late-cancel-endpoint" });
  await emitProtocol(page, "late-cancel-endpoint", {
    type: "hello",
    version: MULTIPLAYER_PROTOCOL_VERSION,
    playerId: "late-cancel-player",
    name: "Canceled Guest",
  });
  await expect(page.locator("#multiplayer-start-btn")).toBeDisabled();
  await expect(page.locator("#multiplayer-player-list [data-player-id]")).toHaveCount(3);

  await emitNearby(page, "state", {
    event: "connectionRejectedLocally",
    endpointId: "late-cancel-endpoint",
  });
  await expect(page.locator("#multiplayer-start-btn")).toBeEnabled();
  await expect(page.locator("#multiplayer-player-list [data-player-id]")).toHaveCount(2);
});

test("the host does not enter the match when the start message cannot be sent", async ({ page }) => {
  await prepareReadyHostAndGuest(page);
  await page.evaluate(() => {
    window.__nearbyMock.failMessageType = "start";
  });

  await page.locator("#multiplayer-start-btn").click();
  await page.waitForTimeout(150);

  const state = await page.evaluate(() => window.__dustMultiplayerTest.getState());
  expect(state.phase).not.toBe("match");
  expect(state.matchEnded).toBe(false);
  await expect(page.locator("#local-multiplayer-lobby")).toBeVisible();
  const transportCalls = await page.evaluate(() => window.__nearbyMock.calls);
  expect(transportCalls.stopAdvertising).toBe(0);
  expect(transportCalls.startHost).toBe(1);
});

test("a guest disconnected in the lobby remains in a reconnectable lobby", async ({ page }) => {
  await openMockLobby(page);
  await page.locator("#multiplayer-discover-btn").click();
  await expect.poll(() => page.evaluate(() => window.__nearbyMock.calls.startDiscovery)).toBe(1);

  const localPlayerId = await page.evaluate(() => window.__dustMultiplayerTest.getState().localPlayerId);
  await emitNearby(page, "peer", { event: "found", endpointId: "host-endpoint", name: "Host" });
  await page.locator('[data-endpoint-id="host-endpoint"]').click();
  await page.locator("#multiplayer-join-btn").click();
  await emitNearby(page, "state", { event: "connected", endpointId: "host-endpoint" });
  await emitProtocol(page, "host-endpoint", {
    type: "lobby",
    version: MULTIPLAYER_PROTOCOL_VERSION,
    mapSeed: 7331,
    hostPlayerId: "host-player",
    players: [
      { id: "host-player", name: "Host", ready: false, connected: true },
      { id: localPlayerId, name: "Guest", ready: false, connected: true },
    ],
  });

  expect(await page.evaluate(() => window.__dustMultiplayerTest.getState().phase)).toBe("lobby");
  await emitNearby(page, "state", { event: "disconnected", endpointId: "host-endpoint" });

  const state = await page.evaluate(() => window.__dustMultiplayerTest.getState());
  expect(state.phase).toBe("lobby");
  expect(state.matchEnded).toBe(false);
  await expect(page.locator("#local-multiplayer-lobby")).toBeVisible();
  await expect(page.locator("#multiplayer-discover-btn")).toBeEnabled();
});

test("a guest ignores foreign or out-of-phase lobby packets during an active match", async ({ page }) => {
  await openMockLobby(page);

  const result = await page.evaluate((protocolVersion) => {
    const api = window.__dustMultiplayerTest;
    const before = api.startMockGuest(["Host", "Guest"], 1, "endpoint-gate-match");
    const foreignLobby = {
      type: "lobby",
      version: protocolVersion,
      mapSeed: 4242,
      hostPlayerId: "foreign-host-player",
      players: [
        { id: "foreign-host-player", name: "Foreign Host", ready: false, connected: true },
        { id: before.localPlayerId, name: "Guest", ready: false, connected: true },
      ],
    };
    const afterForeign = api.receiveProtocol(foreignLobby, "foreign-host-endpoint");
    const afterLateActiveHost = api.receiveProtocol(foreignLobby, "mock-host-endpoint");
    return {
      before,
      afterForeign,
      afterLateActiveHost,
    };
  }, MULTIPLAYER_PROTOCOL_VERSION);

  const expectedIds = result.before.players.map((player) => player.id);
  for (const state of [result.afterForeign, result.afterLateActiveHost]) {
    expect(state.phase).toBe("match");
    expect(state.matchId).toBe("endpoint-gate-match");
    expect(state.mapSeed).toBe(result.before.mapSeed);
    expect(state.renderedMapSeed).toBe(result.before.renderedMapSeed);
    expect(state.players.map((player) => player.id)).toEqual(expectedIds);
  }
});

test("disconnect clears queued realtime traffic and a delayed hello cannot recreate the player", async ({ page }) => {
  await prepareReadyHostAndGuest(page);

  const result = await page.evaluate((protocolVersion) => {
    const endpointId = "departed-endpoint";
    const encode = (message) => {
      const bytes = new TextEncoder().encode(JSON.stringify(message));
      let binary = "";
      for (const byte of bytes) binary += String.fromCharCode(byte);
      return window.btoa(binary);
    };
    const mock = window.__nearbyMock;
    const api = window.__dustMultiplayerTest;
    const expectedPlayerIds = api.getState().players.map((player) => player.id);

    mock.emit("state", { event: "connected", endpointId });
    mock.emit("message", {
      endpointId,
      latestKind: "input",
      data: encode({ type: "input", sequence: 1 }),
    });
    const queued = api.getIncomingRealtimeDiagnostics();

    mock.emit("state", { event: "disconnected", endpointId });
    const afterDisconnect = {
      realtime: api.getIncomingRealtimeDiagnostics(),
      state: api.getState(),
    };

    mock.emit("message", {
      endpointId,
      data: encode({
        type: "hello",
        version: protocolVersion,
        playerId: "departed-player",
        name: "Departed Player",
      }),
    });
    mock.emit("message", {
      endpointId,
      data: encode({ type: "ready", ready: true }),
    });
    return {
      expectedPlayerIds,
      queued,
      afterDisconnect,
      afterDelayedTraffic: api.getState(),
    };
  }, MULTIPLAYER_PROTOCOL_VERSION);

  expect(result.queued.pendingLatestMessages).toBe(1);
  expect(result.afterDisconnect.realtime.pendingLatestMessages).toBe(0);
  expect(result.afterDisconnect.state.players.map((player) => player.id)).toEqual(result.expectedPlayerIds);
  expect(result.afterDelayedTraffic.players.map((player) => player.id)).toEqual(result.expectedPlayerIds);

  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
  expect(
    await page.evaluate(() => window.__dustMultiplayerTest.getState().players.map((player) => player.id))
  ).toEqual(result.expectedPlayerIds);
  await expect(page.locator("#multiplayer-start-btn")).toBeEnabled();
});

test("hosting is single-flight and ignores a rapid second tap", async ({ page }) => {
  await openMockLobby(page);
  await page.evaluate(() => {
    window.__nearbyMock.deferStartHost = true;
    const button = document.getElementById("multiplayer-host-btn");
    button.click();
    button.click();
  });

  await expect.poll(() => page.evaluate(() => window.__nearbyMock.calls.startHost)).toBe(1);
  await expect(page.locator("#multiplayer-host-btn")).toBeDisabled();
  await expect(page.locator("#multiplayer-discover-btn")).toBeDisabled();
  await expect(page.locator("#local-multiplayer-lobby")).toHaveAttribute("aria-busy", "true");

  await page.evaluate(() => window.__nearbyMock.resolveHostStarts());
  await expect(page.locator("#multiplayer-host-btn")).toBeEnabled();
  await expect(page.locator("#local-multiplayer-lobby")).toHaveAttribute("aria-busy", "false");
  await expect(page.locator("#multiplayer-lobby-status")).toContainText("Match created");
  expect(await page.evaluate(() => window.__nearbyMock.calls.stopAll)).toBe(1);
});

test("a synchronous host transport failure releases the operation for retry", async ({ page }) => {
  await openMockLobby(page);
  await expect(page.locator("#multiplayer-host-btn")).toBeEnabled();
  await page.evaluate(() => {
    window.__nearbyMock.startHostSyncError = new Error("Synthetic synchronous startHost failure");
  });

  await page.locator("#multiplayer-host-btn").click();
  await expect(page.locator("#multiplayer-lobby-status")).toContainText(
    "Synthetic synchronous startHost failure"
  );
  await expect(page.locator("#local-multiplayer-lobby")).toHaveAttribute("aria-busy", "false");
  await expect(page.locator("#multiplayer-host-btn")).toBeEnabled();
  expect(await page.evaluate(() => ({
    stopAll: window.__nearbyMock.calls.stopAll,
    startHost: window.__nearbyMock.calls.startHost,
  }))).toEqual({ stopAll: 1, startHost: 1 });

  await page.locator("#multiplayer-host-btn").click();
  await expect.poll(() => page.evaluate(() => window.__nearbyMock.calls.startHost)).toBe(2);
  await expect(page.locator("#multiplayer-lobby-status")).toContainText("Match created");
  await expect(page.locator("#local-multiplayer-lobby")).toHaveAttribute("aria-busy", "false");
  expect(await page.evaluate(() => window.__nearbyMock.calls.stopAll)).toBe(2);
});

test("Nearby status details survive the Capacitor rejection", async ({ page }) => {
  await openMockLobby(page);
  await page.evaluate(() => {
    window.__nearbyMock.startHostError = {
      message: "Nearby Connections startAdvertising failed.",
      data: {
        action: "startAdvertising",
        statusCode: 8007,
        statusMessage: "STATUS_RADIO_ERROR",
      },
    };
  });

  await page.locator("#multiplayer-host-btn").click();
  await expect(page.locator("#multiplayer-lobby-status")).toContainText("Bluetooth and Wi-Fi");
  await expect(page.locator("#multiplayer-lobby-status")).toContainText("8007");
  await expect(page.locator("#multiplayer-lobby-status")).toContainText("STATUS_RADIO_ERROR");
  await expect(page.locator("#multiplayer-host-btn")).toBeEnabled();
});

test("matchEnd retries per endpoint until a duplicate ACK is delivered", async ({ page, context }) => {
  const guestPage = await context.newPage();
  await Promise.all([openMockLobby(page), openMockLobby(guestPage)]);

  const matchId = "terminal-drop-match-end";
  await page.evaluate((id) => window.__dustMultiplayerTest.startMockHost(["Host", "Guest"], id), matchId);
  await guestPage.evaluate((id) => window.__dustMultiplayerTest.startMockGuest(["Host", "Guest"], 1, id), matchId);

  await page.evaluate(() => {
    window.__dustMultiplayerTest.finishMatch(["mock-player-1"], "terminal-test", true);
  });
  const initial = await page.evaluate(() => {
    const sends = window.__nearbyMock.calls.send.filter((entry) => entry.message?.type === "matchEnd");
    return {
      message: sends[sends.length - 1].message,
      count: sends.length,
      diagnostics: window.__dustMultiplayerTest.getTerminalControlDiagnostics(),
    };
  });
  expect(initial.count).toBeGreaterThanOrEqual(1);
  expect(initial.diagnostics.pending).toHaveLength(1);
  expect(initial.diagnostics.pending[0]).toMatchObject({
    type: "matchEnd",
    endpointId: "mock-endpoint-1",
    matchId,
    attempts: 1,
  });
  expect(initial.diagnostics.pending[0].wireBytes).toBeGreaterThan(0);
  expect(initial.diagnostics.stats.measurements).toBe(1);

  const rejectedAcks = await page.evaluate(({ protocolVersion, id, mapSeed }) => {
    const api = window.__dustMultiplayerTest;
    api.receiveProtocol({
      type: "matchEndAck",
      version: protocolVersion,
      mapSeed: mapSeed + 1,
      matchId: id,
    }, "mock-endpoint-1");
    api.receiveProtocol({
      type: "matchEndAck",
      version: protocolVersion,
      mapSeed,
      matchId: id,
    }, "foreign-endpoint");
    return api.getTerminalControlDiagnostics();
  }, {
    protocolVersion: MULTIPLAYER_PROTOCOL_VERSION,
    id: matchId,
    mapSeed: initial.message.mapSeed,
  });
  expect(rejectedAcks.pending).toHaveLength(1);
  expect(rejectedAcks.stats.acknowledgements).toBe(0);

  // Drop the first control packet and force the bounded retry without waiting 500 ms.
  await page.evaluate(() => window.__dustMultiplayerTest.retryTerminalControlsNow());
  const retriedControl = await page.evaluate(() => {
    const sends = window.__nearbyMock.calls.send.filter((entry) => entry.message?.type === "matchEnd");
    return { message: sends[sends.length - 1].message, count: sends.length };
  });
  expect(retriedControl.count).toBeGreaterThan(initial.count);

  const firstGuestResult = await guestPage.evaluate((message) => {
    const state = window.__dustMultiplayerTest.receiveProtocol(message, "mock-host-endpoint");
    const acks = window.__nearbyMock.calls.send.filter((entry) => entry.message?.type === "matchEndAck");
    return {
      state,
      ack: acks[acks.length - 1].message,
      ackCount: acks.length,
      diagnostics: window.__dustMultiplayerTest.getTerminalControlDiagnostics(),
    };
  }, retriedControl.message);
  expect(firstGuestResult.state).toMatchObject({ phase: "ended", matchEnded: true });
  expect(firstGuestResult.ack).toMatchObject({
    type: "matchEndAck",
    version: MULTIPLAYER_PROTOCOL_VERSION,
    matchId,
  });
  expect(firstGuestResult.diagnostics.guestAppliedMatchEndId).toBe(matchId);

  // Drop the first ACK. The host resends, and the guest ACKs the duplicate without replaying the finish.
  await page.evaluate(() => window.__dustMultiplayerTest.retryTerminalControlsNow());
  const duplicateControl = await page.evaluate(() => {
    const sends = window.__nearbyMock.calls.send.filter((entry) => entry.message?.type === "matchEnd");
    return sends[sends.length - 1].message;
  });
  const duplicateGuestResult = await guestPage.evaluate((message) => {
    const state = window.__dustMultiplayerTest.receiveProtocol(message, "mock-host-endpoint");
    const acks = window.__nearbyMock.calls.send.filter((entry) => entry.message?.type === "matchEndAck");
    return { state, ack: acks[acks.length - 1].message, ackCount: acks.length };
  }, duplicateControl);
  expect(duplicateGuestResult.state).toMatchObject({ phase: "ended", matchEnded: true });
  expect(duplicateGuestResult.ackCount).toBeGreaterThan(firstGuestResult.ackCount);

  await page.evaluate((ack) => {
    window.__dustMultiplayerTest.receiveProtocol(ack, "mock-endpoint-1");
  }, duplicateGuestResult.ack);
  const acknowledged = await page.evaluate(() => window.__dustMultiplayerTest.getTerminalControlDiagnostics());
  expect(acknowledged.pending).toEqual([]);
  expect(acknowledged.stats.acknowledgements).toBe(1);

  const sendsBeforeExtraFlush = await page.evaluate(() => (
    window.__nearbyMock.calls.send.filter((entry) => entry.message?.type === "matchEnd").length
  ));
  await page.evaluate(() => window.__dustMultiplayerTest.retryTerminalControlsNow());
  const sendsAfterExtraFlush = await page.evaluate(() => (
    window.__nearbyMock.calls.send.filter((entry) => entry.message?.type === "matchEnd").length
  ));
  expect(sendsAfterExtraFlush).toBe(sendsBeforeExtraFlush);
});

test("returnLobby waits behind matchEnd and re-ACKs after an ACK loss", async ({ page, context }) => {
  const guestPage = await context.newPage();
  await Promise.all([openMockLobby(page), openMockLobby(guestPage)]);

  const matchId = "terminal-reordered-return";
  await page.evaluate((id) => window.__dustMultiplayerTest.startMockHost(["Host", "Guest"], id), matchId);
  await guestPage.evaluate((id) => window.__dustMultiplayerTest.startMockGuest(["Host", "Guest"], 1, id), matchId);
  await page.evaluate(() => {
    const api = window.__dustMultiplayerTest;
    api.finishMatch(["mock-player-1"], "terminal-reorder", true);
    api.returnToLobby(true);
  });

  const controls = await page.evaluate(() => {
    const calls = window.__nearbyMock.calls.send;
    return {
      matchEnd: calls.filter((entry) => entry.message?.type === "matchEnd").at(-1).message,
      returnLobby: calls.filter((entry) => entry.message?.type === "returnLobby").at(-1).message,
      diagnostics: window.__dustMultiplayerTest.getTerminalControlDiagnostics(),
    };
  });
  expect(controls.diagnostics.pending.map((entry) => entry.type).sort()).toEqual(["matchEnd", "returnLobby"]);
  expect(controls.diagnostics.stats.measurements).toBe(2);

  const earlyReturn = await guestPage.evaluate((message) => {
    const state = window.__dustMultiplayerTest.receiveProtocol(message, "mock-host-endpoint");
    return {
      state,
      diagnostics: window.__dustMultiplayerTest.getTerminalControlDiagnostics(),
      returnAckCount: window.__nearbyMock.calls.send.filter((entry) => entry.message?.type === "returnLobbyAck").length,
    };
  }, controls.returnLobby);
  expect(earlyReturn.state).toMatchObject({ phase: "match", matchEnded: false });
  expect(earlyReturn.diagnostics.pendingReturnLobby).toMatchObject({ matchId });
  expect(earlyReturn.returnAckCount).toBe(0);

  // Mutate the host roster while the guest is still behind the terminal phase
  // gate. The pending reliable payload must refresh, even if an older copy is
  // then delivered after the newer one.
  await page.locator("#multiplayer-ready-btn").click();
  await expect.poll(() => page.evaluate(() => (
    window.__nearbyMock.calls.send
      .filter((entry) => entry.message?.type === "returnLobby")
      .at(-1)?.message?.players?.find((player) => player.id === "mock-player-1")?.ready
  ))).toBe(true);
  const refreshedReturn = await page.evaluate(() => (
    window.__nearbyMock.calls.send.filter((entry) => entry.message?.type === "returnLobby").at(-1).message
  ));
  await guestPage.evaluate(({ newer, older }) => {
    const api = window.__dustMultiplayerTest;
    api.receiveProtocol(newer, "mock-host-endpoint");
    api.receiveProtocol(older, "mock-host-endpoint");
  }, { newer: refreshedReturn, older: controls.returnLobby });

  const completed = await guestPage.evaluate((message) => {
    const state = window.__dustMultiplayerTest.receiveProtocol(message, "mock-host-endpoint");
    const sends = window.__nearbyMock.calls.send;
    return {
      state,
      matchEndAck: sends.filter((entry) => entry.message?.type === "matchEndAck").at(-1).message,
      returnLobbyAck: sends.filter((entry) => entry.message?.type === "returnLobbyAck").at(-1).message,
      returnAckCount: sends.filter((entry) => entry.message?.type === "returnLobbyAck").length,
      diagnostics: window.__dustMultiplayerTest.getTerminalControlDiagnostics(),
    };
  }, controls.matchEnd);
  expect(completed.state).toMatchObject({ phase: "lobby", matchEnded: false });
  expect(completed.state.players.find((player) => player.id === "mock-player-1").ready).toBe(false);
  expect(completed.diagnostics.guestAppliedMatchEndId).toBe(matchId);
  expect(completed.diagnostics.guestAppliedReturnLobbyId).toBe(matchId);
  expect(completed.matchEndAck.type).toBe("matchEndAck");
  expect(completed.returnLobbyAck.type).toBe("returnLobbyAck");

  // Deliver matchEnd ACK, but drop the first returnLobby ACK.
  await page.evaluate((ack) => window.__dustMultiplayerTest.receiveProtocol(ack, "mock-endpoint-1"), completed.matchEndAck);
  expect(
    (await page.evaluate(() => window.__dustMultiplayerTest.getTerminalControlDiagnostics())).pending.map((entry) => entry.type)
  ).toEqual(["returnLobby"]);

  await page.evaluate(() => window.__dustMultiplayerTest.retryTerminalControlsNow());
  const duplicateReturn = await page.evaluate(() => (
    window.__nearbyMock.calls.send.filter((entry) => entry.message?.type === "returnLobby").at(-1).message
  ));
  const duplicateResult = await guestPage.evaluate((message) => {
    const state = window.__dustMultiplayerTest.receiveProtocol(message, "mock-host-endpoint");
    const acks = window.__nearbyMock.calls.send.filter((entry) => entry.message?.type === "returnLobbyAck");
    return { state, ack: acks.at(-1).message, ackCount: acks.length };
  }, duplicateReturn);
  expect(duplicateResult.state).toMatchObject({ phase: "lobby", matchEnded: false });
  expect(duplicateResult.ackCount).toBeGreaterThan(completed.returnAckCount);

  await page.evaluate((ack) => window.__dustMultiplayerTest.receiveProtocol(ack, "mock-endpoint-1"), duplicateResult.ack);
  expect((await page.evaluate(() => window.__dustMultiplayerTest.getTerminalControlDiagnostics())).pending).toEqual([]);
  const currentLobby = await page.evaluate(() => (
    window.__nearbyMock.calls.send.filter((entry) => entry.message?.type === "lobby").at(-1).message
  ));
  const reconciled = await guestPage.evaluate((message) => (
    window.__dustMultiplayerTest.receiveProtocol(message, "mock-host-endpoint")
  ), currentLobby);
  expect(reconciled.players.find((player) => player.id === "mock-player-1").ready).toBe(true);
});

test("a dropped returnLobbyRequest is retried until the guest actually enters the lobby", async ({ page }) => {
  await openMockLobby(page);
  const matchId = "terminal-drop-return-request";
  await page.evaluate((id) => {
    const api = window.__dustMultiplayerTest;
    api.startMockGuest(["Host", "Guest"], 1, id);
    api.finishMatch(["mock-player-1"], "request-retry", false);
    api.requestReturnToLobby();
  }, matchId);

  const initial = await page.evaluate(() => {
    const requests = window.__nearbyMock.calls.send.filter((entry) => entry.message?.type === "returnLobbyRequest");
    return {
      message: requests.at(-1).message,
      count: requests.length,
      diagnostics: window.__dustMultiplayerTest.getTerminalControlDiagnostics(),
    };
  });
  expect(initial.message).toMatchObject({
    type: "returnLobbyRequest",
    version: MULTIPLAYER_PROTOCOL_VERSION,
    matchId,
  });
  expect(initial.diagnostics.returnLobbyRequest).toMatchObject({ matchId, attempts: 1 });

  // Drop the first request and force its next bounded attempt.
  await page.evaluate(() => window.__dustMultiplayerTest.retryTerminalControlsNow());
  const retried = await page.evaluate(() => {
    const requests = window.__nearbyMock.calls.send.filter((entry) => entry.message?.type === "returnLobbyRequest");
    return { message: requests.at(-1).message, count: requests.length };
  });
  expect(retried.count).toBeGreaterThan(initial.count);
  expect(retried.message).toEqual(initial.message);

  const returned = await page.evaluate(({ protocolVersion, id, mapSeed }) => {
    const api = window.__dustMultiplayerTest;
    const state = api.receiveProtocol({
      type: "returnLobby",
      version: protocolVersion,
      mapSeed,
      matchId: id,
      hostPlayerId: "mock-player-1",
      players: [],
    }, "mock-host-endpoint");
    return { state, diagnostics: api.getTerminalControlDiagnostics() };
  }, { protocolVersion: MULTIPLAYER_PROTOCOL_VERSION, id: matchId, mapSeed: initial.message.mapSeed });
  expect(returned.state).toMatchObject({ phase: "lobby", matchEnded: false });
  expect(returned.diagnostics.returnLobbyRequest).toBeNull();
  expect(returned.diagnostics.returnLobbyRequestStats.completed).toBe(1);
});

test("a host disconnect releases a guest waiting to return to the lobby", async ({ page }) => {
  await openMockLobby(page);
  await page.evaluate(() => {
    const api = window.__dustMultiplayerTest;
    api.startMockGuest(["Host", "Guest"], 1, "terminal-return-disconnect");
    api.finishMatch(["mock-player-1"], "request-disconnect", false);
    api.requestReturnToLobby();
  });

  await expect(page.locator("#multiplayer-return-lobby-btn")).toBeDisabled();
  await expect(page.locator("#multiplayer-result-title")).toHaveText("Waiting for Host");

  await emitNearby(page, "state", {
    event: "disconnected",
    endpointId: "mock-host-endpoint",
  });

  const diagnostics = await page.evaluate(() => (
    window.__dustMultiplayerTest.getTerminalControlDiagnostics()
  ));
  expect(diagnostics.returnLobbyRequest).toBeNull();
  expect(diagnostics.returnLobbyRequestStats.failed).toBe(1);
  await expect(page.locator("#multiplayer-return-lobby-btn")).toBeEnabled();
  await expect(page.locator("#multiplayer-result-title")).toHaveText("Host Unavailable");
  await expect(page.locator("#multiplayer-result-summary")).toContainText("return to the main menu");
});

test("switching from hosting to discovery cancels stale terminal retries", async ({ page }) => {
  await openMockLobby(page);
  const matchId = "terminal-role-switch";
  const beforeSwitch = await page.evaluate((id) => {
    const api = window.__dustMultiplayerTest;
    api.startMockHost(["Host", "Guest"], id);
    api.finishMatch(["mock-player-1"], "role-switch", true);
    api.returnToLobby(true);
    const terminalSends = window.__nearbyMock.calls.send.filter((entry) => (
      entry.message?.type === "matchEnd" || entry.message?.type === "returnLobby"
    ));
    return {
      count: terminalSends.length,
      diagnostics: api.getTerminalControlDiagnostics(),
    };
  }, matchId);
  expect(beforeSwitch.diagnostics.pending.map((entry) => entry.type).sort()).toEqual([
    "matchEnd",
    "returnLobby",
  ]);

  await page.locator("#multiplayer-discover-btn").click();
  await expect.poll(() => page.evaluate(() => window.__nearbyMock.calls.startDiscovery)).toBe(1);
  expect((await page.evaluate(() => window.__dustMultiplayerTest.getTerminalControlDiagnostics())).pending).toEqual([]);

  const countAfterSwitch = await page.evaluate(() => (
    window.__nearbyMock.calls.send.filter((entry) => (
      entry.message?.type === "matchEnd" || entry.message?.type === "returnLobby"
    )).length
  ));
  await page.evaluate(() => window.__dustMultiplayerTest.retryTerminalControlsNow());
  const countAfterForcedRetry = await page.evaluate(() => (
    window.__nearbyMock.calls.send.filter((entry) => (
      entry.message?.type === "matchEnd" || entry.message?.type === "returnLobby"
    )).length
  ));
  expect(countAfterForcedRetry).toBe(countAfterSwitch);
});

test("a delayed host terminal send failure cannot leak into a replacement session", async ({ page }) => {
  await openMockLobby(page);

  const result = await page.evaluate(async () => {
    const api = window.__dustMultiplayerTest;
    const mock = window.__nearbyMock;
    mock.deferMessageType = "returnLobby";
    api.startMockHost(["Old Host", "Old Guest"], "stale-host-terminal-send");
    api.finishMatch(["mock-player-1"], "stale-host-terminal-send", true);
    api.returnToLobby(true);
    const deferredBeforeReset = mock.pendingMessageSends.length;

    mock.deferMessageType = "";
    api.startMockHost(["New Host", "New Guest"], "replacement-host-session");
    const statusBeforeReject = document.getElementById("multiplayer-lobby-status").textContent;
    mock.rejectDeferredMessages("returnLobby");
    await new Promise((resolve) => window.setTimeout(resolve, 0));

    return {
      deferredBeforeReset,
      deferredAfterReject: mock.pendingMessageSends.length,
      state: api.getState(),
      diagnostics: api.getTerminalControlDiagnostics(),
      statusBeforeReject,
      statusAfterReject: document.getElementById("multiplayer-lobby-status").textContent,
    };
  });

  expect(result.deferredBeforeReset).toBeGreaterThan(0);
  expect(result.deferredAfterReject).toBe(0);
  expect(result.state).toMatchObject({
    phase: "match",
    role: "host",
    matchId: "replacement-host-session",
  });
  expect(result.diagnostics.pending).toEqual([]);
  expect(result.diagnostics.stats.sendFailures).toBe(0);
  expect(result.statusAfterReject).toBe(result.statusBeforeReject);
  expect(result.statusAfterReject).not.toContain("Synthetic delayed");
});

test("a delayed guest return request failure cannot leak into a replacement session", async ({ page }) => {
  await openMockLobby(page);

  const result = await page.evaluate(async () => {
    const api = window.__dustMultiplayerTest;
    const mock = window.__nearbyMock;
    mock.deferMessageType = "returnLobbyRequest";
    api.startMockGuest(["Old Host", "Old Guest"], 1, "stale-guest-return-request");
    api.finishMatch(["mock-player-1"], "stale-guest-return-request", false);
    api.requestReturnToLobby();
    const deferredBeforeReset = mock.pendingMessageSends.length;

    mock.deferMessageType = "";
    api.startMockGuest(["New Host", "New Guest"], 1, "replacement-guest-session");
    const statusBeforeReject = document.getElementById("multiplayer-lobby-status").textContent;
    mock.rejectDeferredMessages("returnLobbyRequest");
    await new Promise((resolve) => window.setTimeout(resolve, 0));

    return {
      deferredBeforeReset,
      deferredAfterReject: mock.pendingMessageSends.length,
      state: api.getState(),
      diagnostics: api.getTerminalControlDiagnostics(),
      statusBeforeReject,
      statusAfterReject: document.getElementById("multiplayer-lobby-status").textContent,
    };
  });

  expect(result.deferredBeforeReset).toBeGreaterThan(0);
  expect(result.deferredAfterReject).toBe(0);
  expect(result.state).toMatchObject({
    phase: "match",
    role: "guest",
    matchId: "replacement-guest-session",
  });
  expect(result.diagnostics.returnLobbyRequest).toBeNull();
  expect(result.diagnostics.returnLobbyRequestStats.sendFailures).toBe(0);
  expect(result.statusAfterReject).toBe(result.statusBeforeReject);
  expect(result.statusAfterReject).not.toContain("Synthetic delayed");
});
