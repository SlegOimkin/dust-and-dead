const path = require("node:path");
const { expect, test } = require("@playwright/test");

function fileUrl(relativePath) {
  const absolute = path.resolve(__dirname, "..", relativePath).replace(/\\/g, "/");
  return `file:///${absolute}`;
}

// Local play needs the Nearby Connections plugin, so the menu hides its entry
// outside the Android build. These specs drive that lobby, so they put the
// button back the same way the Android build would.
async function revealLocalMultiplayerEntry(page) {
  await page.evaluate(() =>
    document.documentElement.classList.remove("no-local-multiplayer")
  );
}

async function installFakeWebSocket(page) {
  await page.addInitScript(() => {
    window.__onlineSockets = [];
    window.__onlineSent = [];
    class FakeWebSocket {
      constructor(url) {
        this.url = url;
        this.readyState = 0;
        window.__onlineSockets.push(this);
        setTimeout(() => {
          if (this.readyState !== 0) return;
          this.readyState = 1;
          if (this.onopen) this.onopen({});
        }, 0);
      }

      send(data) {
        window.__onlineSent.push(JSON.parse(String(data)));
      }

      close() {
        this.readyState = 3;
        if (this.onclose) this.onclose({ code: 1000 });
      }

      serverSend(message) {
        if (this.onmessage) this.onmessage({ data: JSON.stringify(message) });
      }

      drop() {
        this.readyState = 3;
        if (this.onclose) this.onclose({ code: 1006 });
      }
    }
    window.WebSocket = FakeWebSocket;
  });
}

async function openOnlineLobby(page) {
  await page.goto(fileUrl("index.html"));
  await page.keyboard.press("KeyM");
  await page.evaluate(() => {
    window.DustAndDeadOnlineConfig = { url: "ws://online.test/online", path: "/online", reconnect: true, botBackfill: false };
  });
  await page.locator("#online-multiplayer-btn").click();
  await expect(page.locator("#online-multiplayer-lobby")).toBeVisible();
}

test("online matchmaking uses the namespaced dedicated-server contract", async ({ page }) => {
  await installFakeWebSocket(page);
  await openOnlineLobby(page);

  await expect(page.locator("#local-multiplayer-lobby")).toBeHidden();
  await expect(page.locator("#online-multiplayer-lobby")).not.toContainText("Host Match");
  await expect(page.locator("#online-multiplayer-lobby")).not.toContainText("Start Match");

  await page.locator("#online-multiplayer-player-name").fill("Ranger Jane");
  await page.locator("#online-multiplayer-search-code").fill("dust friends!");
  await expect(page.locator("#online-multiplayer-search-code")).toHaveValue("DUSTFRIENDS");
  await page.locator("#online-matchmaking-find-btn").click();

  await expect.poll(() => page.evaluate(() => window.__onlineSent.length)).toBe(1);
  await expect(page.locator("#online-multiplayer-status .multiplayer-lobby__status-dot")).toHaveCount(1);
  const join = await page.evaluate(() => window.__onlineSent[0]);
  expect(join).toMatchObject({
    type: "session.join",
    protocolVersion: 47,
    name: "Ranger Jane",
    searchCode: "DUSTFRIENDS",
  });
  expect(join.type).not.toBe("hello");

  await page.evaluate(() => {
    window.__onlineSockets[0].serverSend({
      type: "session.welcome",
      protocolVersion: 47,
      sessionId: "session-1",
      playerId: "player-1",
      resumeToken: "resume-1",
      reconnectGraceMs: 20000,
      resumed: false,
      serverNow: Date.now(),
    });
    const serverNow = Date.now();
    window.__onlineSockets[0].serverSend({
      type: "room.state",
      serverNow,
      room: {
        id: "room-1",
        revision: 1,
        phase: "lobby",
        players: [
          { id: "player-1", name: "Ranger Jane", ready: false, connected: true },
          { id: "player-2", name: "Doc", ready: true, connected: true },
          { id: "player-3", name: "Marshal", ready: true, connected: true },
        ],
        playerCount: 3,
        readyCount: 2,
        minPlayers: 2,
        maxPlayers: 4,
        autoStartAt: serverNow + 40000,
        serverNow,
        startReason: "",
        matchId: "",
        mapSeed: 0,
        error: "",
      },
    });
  });

  await expect(page.locator("#online-multiplayer-player-list .multiplayer-player-row")).toHaveCount(3);
  await expect(page.locator("#online-multiplayer-player-count")).toHaveText("3 / 4");
  await expect(page.locator("#online-multiplayer-countdown")).toBeVisible();
  const seconds = Number(await page.locator("#online-multiplayer-countdown-value").textContent());
  expect(seconds).toBeGreaterThanOrEqual(39);
  expect(seconds).toBeLessThanOrEqual(40);

  await page.locator("#online-multiplayer-ready-btn").click();
  await expect.poll(() => page.evaluate(() => window.__onlineSent.at(-1).type)).toBe("room.ready");
  expect(await page.evaluate(() => window.__onlineSent.at(-1).ready)).toBe(true);
  await expect(page.locator("#online-multiplayer-ready-btn")).toHaveText("Saving…");

  await page.evaluate(() => {
    const now = Date.now();
    window.__onlineSockets[0].serverSend({
      type: "room.state",
      room: {
        id: "room-1",
        revision: 2,
        phase: "lobby",
        players: [
          { id: "player-1", name: "Ranger Jane", ready: true, connected: true },
          { id: "player-2", name: "Doc", ready: true, connected: true },
          { id: "player-3", name: "Marshal", ready: false, connected: true },
        ],
        playerCount: 3,
        readyCount: 2,
        minPlayers: 2,
        maxPlayers: 4,
        autoStartAt: now + 40000,
        serverNow: now,
      },
    });
  });
  await expect(page.locator("#online-multiplayer-ready-btn")).toHaveText("Cancel Ready");

  await page.locator("#online-matchmaking-cancel-btn").click();
  await expect.poll(() => page.evaluate(() => window.__onlineSent.at(-1).type)).toBe("queue.leave");
  await expect(page.locator("#online-multiplayer-player-list .multiplayer-player-row")).toHaveCount(0);

  await page.locator("#online-multiplayer-lobby-back-btn").click();
  await expect(page.locator("#menu")).toBeVisible();
  await revealLocalMultiplayerEntry(page);
  await page.locator("#local-multiplayer-btn").click();
  await expect(page.locator("#local-multiplayer-lobby")).toBeVisible();
});

test("online reconnect rotates through session.join with resume credentials", async ({ page }) => {
  await installFakeWebSocket(page);
  await openOnlineLobby(page);
  await page.locator("#online-matchmaking-find-btn").click();
  await expect.poll(() => page.evaluate(() => window.__onlineSent.length)).toBe(1);

  await page.evaluate(() => {
    window.__onlineSockets[0].serverSend({
      type: "session.welcome",
      protocolVersion: 47,
      sessionId: "session-reconnect",
      playerId: "player-reconnect",
      resumeToken: "rotating-token",
      reconnectGraceMs: 20000,
      resumed: false,
      serverNow: Date.now(),
    });
    window.__onlineSockets[0].drop();
  });

  await expect(page.locator("#online-matchmaking-state")).toHaveText("Reconnecting");
  await expect.poll(() => page.evaluate(() => window.__onlineSockets.length), { timeout: 3000 }).toBe(2);
  await expect.poll(() => page.evaluate(() => window.__onlineSent.length), { timeout: 3000 }).toBe(2);
  const resume = await page.evaluate(() => window.__onlineSent[1]);
  expect(resume).toMatchObject({
    type: "session.join",
    protocolVersion: 47,
    sessionId: "session-reconnect",
    resumeToken: "rotating-token",
  });
});

test("expired reconnect grace leaves an active online match safely", async ({ page }) => {
  await installFakeWebSocket(page);
  await openOnlineLobby(page);
  await page.locator("#online-matchmaking-find-btn").click();
  await expect.poll(() => page.evaluate(() => window.__onlineSent.length)).toBe(1);
  await page.evaluate(() => {
    window.__onlineSockets[0].serverSend({
      type: "session.welcome",
      protocolVersion: 47,
      sessionId: "session-expiry",
      playerId: "player-expiry",
      resumeToken: "resume-expiry",
      reconnectGraceMs: 1000,
      resumed: false,
      serverNow: Date.now(),
    });
    window.__dustOnlineTest.expireReconnectGrace("match");
  });

  await expect(page.locator("#online-multiplayer-lobby")).toBeHidden();
  await expect(page.locator("#menu")).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__onlineSent.at(-1).type)).toBe("match.leave");
  expect(await page.evaluate(() => window.__dustOnlineTest.getState())).toMatchObject({
    open: false,
    transportKind: "none",
    phase: "idle",
  });
});

test("an aborted preparation accepts the next startPrepare without reconnecting", async ({ page }) => {
  await installFakeWebSocket(page);
  await openOnlineLobby(page);
  await page.locator("#online-matchmaking-find-btn").click();
  await expect.poll(() => page.evaluate(() => window.__onlineSent.length)).toBe(1);

  const mapSeed = await page.evaluate(() => window.__dustMultiplayerTest.getState().renderedMapSeed);
  await page.evaluate(({ mapSeed }) => {
    const socket = window.__onlineSockets[0];
    const readyPlayers = [
      { id: "retry-local", name: "Cowboy", ready: true, connected: true },
      { id: "retry-peer", name: "Ranger", ready: true, connected: true },
    ];
    socket.serverSend({
      type: "session.welcome",
      protocolVersion: 47,
      sessionId: "session-retry",
      playerId: "retry-local",
      resumeToken: "resume-retry",
      reconnectGraceMs: 20000,
      resumed: false,
      serverNow: Date.now(),
    });
    socket.serverSend({
      type: "room.state",
      room: {
        id: "room-retry",
        revision: 1,
        phase: "preparing",
        players: readyPlayers,
        playerCount: 2,
        readyCount: 2,
        minPlayers: 2,
        maxPlayers: 4,
        autoStartAt: 0,
        serverNow: Date.now(),
      },
    });
    socket.serverSend({
      type: "game",
      data: btoa(JSON.stringify({
        type: "startPrepare",
        authority: "server",
        startId: "start-retry-1",
        version: 47,
        mapSeed,
        hostPlayerId: "retry-local",
        players: readyPlayers,
      })),
    });
  }, { mapSeed });

  await expect.poll(() => page.evaluate(() => window.__dustOnlineTest.getState().pendingStartId)).toBe("start-retry-1");
  await expect.poll(() => page.evaluate(() => window.__onlineSent.filter((entry) => entry.type === "game").length)).toBe(1);

  await page.evaluate(({ mapSeed }) => {
    const socket = window.__onlineSockets[0];
    socket.serverSend({
      type: "room.state",
      room: {
        id: "room-retry",
        revision: 2,
        phase: "lobby",
        players: [
          { id: "retry-local", name: "Cowboy", ready: false, connected: true },
          { id: "retry-peer", name: "Ranger", ready: false, connected: true },
        ],
        playerCount: 2,
        readyCount: 0,
        minPlayers: 2,
        maxPlayers: 4,
        autoStartAt: 0,
        serverNow: Date.now(),
        error: "start_ack_timeout",
      },
    });
    const readyPlayers = [
      { id: "retry-local", name: "Cowboy", ready: true, connected: true },
      { id: "retry-peer", name: "Ranger", ready: true, connected: true },
    ];
    socket.serverSend({
      type: "room.state",
      room: {
        id: "room-retry",
        revision: 3,
        phase: "preparing",
        players: readyPlayers,
        playerCount: 2,
        readyCount: 2,
        minPlayers: 2,
        maxPlayers: 4,
        autoStartAt: 0,
        serverNow: Date.now(),
      },
    });
    socket.serverSend({
      type: "game",
      data: btoa(JSON.stringify({
        type: "startPrepare",
        authority: "server",
        startId: "start-retry-2",
        version: 47,
        mapSeed,
        hostPlayerId: "retry-local",
        players: readyPlayers,
      })),
    });
  }, { mapSeed });

  await expect.poll(() => page.evaluate(() => window.__dustOnlineTest.getState())).toMatchObject({
    phase: "starting",
    pendingStartId: "start-retry-2",
  });
  const acknowledgements = await page.evaluate(() => window.__onlineSent
    .filter((entry) => entry.type === "game")
    .map((entry) => JSON.parse(decodeURIComponent(escape(atob(entry.data))))));
  expect(acknowledgements).toHaveLength(2);
  expect(acknowledgements.map((entry) => entry.startId)).toEqual(["start-retry-1", "start-retry-2"]);
  expect(acknowledgements.every((entry) => entry.type === "startAck")).toBe(true);
  expect(await page.evaluate(() => window.__onlineSockets.length)).toBe(1);
});
