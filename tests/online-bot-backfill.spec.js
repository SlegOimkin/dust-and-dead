const path = require("node:path");
const { expect, test } = require("@playwright/test");

function fileUrl(relativePath) {
  const absolute = path.resolve(__dirname, "..", relativePath).replace(/\\/g, "/");
  return `file:///${absolute}`;
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
    }
    window.WebSocket = FakeWebSocket;
  });
}

const FAST_BACKFILL = {
  delayMs: 1200,
  firstJoinMs: 100,
  joinIntervalMs: 400,
  joinJitterMs: 0,
  readyMinMs: 150,
  readyMaxMs: 151,
  prepareMs: 200,
  // Long enough that the emulated post-match auto-return can never race an
  // "ended"-phase assertion.
  postMatchReturnMs: 60000,
};

async function bootLobby(page) {
  await installFakeWebSocket(page);
  await page.goto(fileUrl("index.html?mapSeed=7331"));
  await page.keyboard.press("KeyM");
  await page.waitForFunction(() => !!window.advanceTime && !!window.__dustOnlineTest && !!window.__dustAndDeadTest);
  await page.evaluate(() => {
    window.DustAndDeadOnlineConfig = { url: "ws://online.test/online", path: "/online", reconnect: true };
    window.__dustAndDeadTest.setAutomaticFrameLoopModeForTest("paused");
  });
  await page.locator("#online-multiplayer-btn").click();
  await expect(page.locator("#online-multiplayer-lobby")).toBeVisible();
}

async function findPublicMatch(page, options) {
  const searchCode = options && options.searchCode ? options.searchCode : "";
  await page.locator("#online-multiplayer-player-name").fill("Ranger Jane");
  if (searchCode) await page.locator("#online-multiplayer-search-code").fill(searchCode);
  await page.locator("#online-matchmaking-find-btn").click();
  await page.waitForFunction(() => window.__onlineSockets.length >= 1 && window.__onlineSockets[0].readyState === 1);
  await page.evaluate((code) => {
    const socket = window.__onlineSockets[window.__onlineSockets.length - 1];
    socket.serverSend({
      type: "session.welcome",
      sessionId: "session-1",
      playerId: "player_local1",
      resumeToken: "resume-1",
      reconnectGraceMs: 20000,
    });
    socket.serverSend({ type: "queue.joined" });
    socket.serverSend({
      type: "room.state",
      room: {
        id: "room-1",
        revision: 1,
        phase: "lobby",
        searchCode: code || "",
        players: [{ id: "player_local1", name: "Ranger Jane", ready: false, connected: true, autoReady: false, cosmetics: null }],
        playerCount: 1,
        readyCount: 0,
        minPlayers: 2,
        maxPlayers: 4,
        autoStartAt: 0,
        serverNow: Date.now(),
        startReason: "",
        matchId: "",
        mapSeed: 0,
        error: "",
      },
    });
  }, searchCode);
  await expect.poll(() => page.evaluate(() => window.__dustOnlineTest.getState().connectionState)).toBe("room");
}

async function advanceMs(page, ms) {
  // advanceTime caps how much simulated time a single call may cover, so long
  // waits must be fed to it in small slices.
  for (let remaining = ms; remaining > 0; remaining -= 1000) {
    await page.evaluate((value) => window.advanceTime(value), Math.min(1000, remaining));
  }
}

function backfillState(page) {
  return page.evaluate(() => window.__dustOnlineTest.getBackfillState());
}

async function fillRoomWithBots(page) {
  await page.evaluate((config) => window.__dustOnlineTest.configureBackfillForTest(config), FAST_BACKFILL);
  await advanceMs(page, FAST_BACKFILL.delayMs + 100);
  expect((await backfillState(page)).active).toBe(true);
  // First bot joins, then the rest at the configured interval; every bot
  // presses ready shortly after joining.
  await advanceMs(page, 4000);
  const state = await backfillState(page);
  expect(state.room.players.length).toBe(4);
  expect(state.room.players.filter((entry) => entry.ready).length).toBe(3);
  return state;
}

async function startBackfillMatch(page) {
  await fillRoomWithBots(page);
  await page.locator("#online-multiplayer-ready-btn").click();
  await advanceMs(page, FAST_BACKFILL.prepareMs + 300);
  await expect.poll(() => page.evaluate(() => window.__dustMultiplayerTest.getState().phase)).toBe("match");
  const role = await page.evaluate(() => window.__dustMultiplayerTest.getState().role);
  expect(role).toBe("host");
  await expect(page.locator("#online-multiplayer-lobby")).toBeHidden();
  return page.evaluate(() => window.__dustMultiplayerTest.getBackfillBotDiagnostics());
}

test("waiting alone in the public queue for 12 seconds fills the room with bots", async ({ page }) => {
  await bootLobby(page);
  await findPublicMatch(page);
  await page.evaluate((config) => window.__dustOnlineTest.configureBackfillForTest(config), FAST_BACKFILL);

  await advanceMs(page, FAST_BACKFILL.delayMs - 300);
  expect((await backfillState(page)).active).toBe(false);
  await expect(page.locator("#online-multiplayer-player-list .multiplayer-player-row")).toHaveCount(1);

  await advanceMs(page, 400);
  expect((await backfillState(page)).active).toBe(true);

  // The client silently left the real queue when the emulation took over.
  const sent = await page.evaluate(() => window.__onlineSent.map((message) => message.type));
  expect(sent).toContain("queue.leave");
  const storedSession = await page.evaluate(() => window.sessionStorage.getItem("dustAndDeadOnlineSessionV1"));
  expect(storedSession).toBe(null);

  // Bots trickle in on the join cadence and ready up like players would.
  await advanceMs(page, 200);
  await expect(page.locator("#online-multiplayer-player-list .multiplayer-player-row")).toHaveCount(2);
  await advanceMs(page, 4000);
  await expect(page.locator("#online-multiplayer-player-list .multiplayer-player-row")).toHaveCount(4);
  await expect(page.locator("#online-multiplayer-player-count")).toHaveText("4 / 4");
  await expect(page.locator("#online-multiplayer-player-list .multiplayer-player-row.is-ready")).toHaveCount(3);

  // Bot identities look like real accounts, not like bots.
  const state = await backfillState(page);
  for (const id of state.botIds) expect(id).toMatch(/^player_[a-z0-9]{10}$/);
  const names = new Set(state.botNames);
  expect(names.size).toBe(3);

  // The player readies up and the match starts as a host-authoritative match
  // that still reports the online transport.
  await page.locator("#online-multiplayer-ready-btn").click();
  await advanceMs(page, FAST_BACKFILL.prepareMs + 300);
  const matchState = await page.evaluate(() => window.__dustMultiplayerTest.getState());
  expect(matchState.phase).toBe("match");
  expect(matchState.role).toBe("host");
  const bots = await page.evaluate(() => window.__dustMultiplayerTest.getBackfillBotDiagnostics());
  expect(bots.length).toBe(3);
  await expect(page.locator("#multiplayer-scoreboard-mode")).toHaveText("Online PvP");
});

test("a search code always waits for real friends instead of bots", async ({ page }) => {
  await bootLobby(page);
  await findPublicMatch(page, { searchCode: "POSSE" });
  await page.evaluate((config) => window.__dustOnlineTest.configureBackfillForTest(config), FAST_BACKFILL);
  await advanceMs(page, FAST_BACKFILL.delayMs * 4);
  expect((await backfillState(page)).active).toBe(false);
  await expect(page.locator("#online-multiplayer-player-list .multiplayer-player-row")).toHaveCount(1);
});

test("a real player joining resets the lonely timer", async ({ page }) => {
  await bootLobby(page);
  await findPublicMatch(page);
  await page.evaluate((config) => window.__dustOnlineTest.configureBackfillForTest(config), FAST_BACKFILL);

  await advanceMs(page, FAST_BACKFILL.delayMs - 300);
  await page.evaluate(() => {
    const socket = window.__onlineSockets[window.__onlineSockets.length - 1];
    const players = [
      { id: "player_local1", name: "Ranger Jane", ready: false, connected: true },
      { id: "player_other", name: "Stranger", ready: false, connected: true },
    ];
    socket.serverSend({
      type: "room.state",
      room: {
        id: "room-1", revision: 2, phase: "lobby", searchCode: "", players,
        playerCount: 2, readyCount: 0, minPlayers: 2, maxPlayers: 4,
        autoStartAt: 0, serverNow: Date.now(), startReason: "", matchId: "", mapSeed: 0, error: "",
      },
    });
  });
  await advanceMs(page, FAST_BACKFILL.delayMs);
  expect((await backfillState(page)).active).toBe(false);

  // The stranger leaves; only a fresh full wait may summon bots.
  await page.evaluate(() => {
    const socket = window.__onlineSockets[window.__onlineSockets.length - 1];
    socket.serverSend({
      type: "room.state",
      room: {
        id: "room-1", revision: 3, phase: "lobby", searchCode: "",
        players: [{ id: "player_local1", name: "Ranger Jane", ready: false, connected: true }],
        playerCount: 1, readyCount: 0, minPlayers: 2, maxPlayers: 4,
        autoStartAt: 0, serverNow: Date.now(), startReason: "", matchId: "", mapSeed: 0, error: "",
      },
    });
  });
  await advanceMs(page, FAST_BACKFILL.delayMs - 300);
  expect((await backfillState(page)).active).toBe(false);
  await advanceMs(page, 400);
  expect((await backfillState(page)).active).toBe(true);
});

test("cancelling a backfilled room returns to the real matchmaking path", async ({ page }) => {
  await bootLobby(page);
  await findPublicMatch(page);
  await fillRoomWithBots(page);
  const socketsBefore = await page.evaluate(() => window.__onlineSockets.length);

  await page.locator("#online-matchmaking-cancel-btn").click();
  expect((await backfillState(page)).active).toBe(false);
  await expect.poll(() => page.evaluate(() => window.__dustOnlineTest.getState().connectionState)).toBe("idle");

  // Finding again dials a genuine server socket, not the emulation.
  await page.locator("#online-matchmaking-find-btn").click();
  await expect.poll(() => page.evaluate(() => window.__onlineSockets.length)).toBe(socketsBefore + 1);
});

test("the in-match menu never pauses a backfilled match", async ({ page }) => {
  await bootLobby(page);
  await findPublicMatch(page);
  await startBackfillMatch(page);

  await page.locator("#pause-menu-btn").click();
  await expect(page.locator("#pause-menu")).toBeVisible();
  const before = await page.evaluate(() => window.__dustMultiplayerTest.getMultiplayerSyncDiagnostics().time);
  await advanceMs(page, 800);
  const after = await page.evaluate(() => window.__dustMultiplayerTest.getMultiplayerSyncDiagnostics().time);
  expect(after).toBeGreaterThan(before);
  await page.locator("#pause-continue-btn").click();
  await expect(page.locator("#pause-menu")).toBeHidden();
});

test("bots fight zombies and never shoot an innocent player, but do retaliate", async ({ page }) => {
  await bootLobby(page);
  await findPublicMatch(page);
  const bots = await startBackfillMatch(page);
  await page.evaluate(() => window.__dustAndDeadTest.clearEnemies());

  // A zombie dropped onto a bot gets shot.
  await page.evaluate((botId) => {
    const bot = window.__dustMultiplayerTest.getBackfillBotDiagnostics().find((entry) => entry.id === botId);
    window.__dustMultiplayerTest.spawnEnemyAt(bot.x + 4, bot.z, "walker", 30);
    window.__dustMultiplayerTest.spawnEnemyAt(bot.x - 4, bot.z, "walker", 30);
  }, bots[0].id);
  await advanceMs(page, 5000);
  const fought = await page.evaluate((botId) =>
    window.__dustMultiplayerTest.getBackfillBotDiagnostics().find((entry) => entry.id === botId), bots[0].id);
  expect(fought.lastFireActionSequence).toBeGreaterThan(0);

  // The real player stands right next to every bot and nobody targets them:
  // with no zombies and no grudge the bots do not fire a single shot.
  await page.evaluate(() => window.__dustAndDeadTest.clearEnemies());
  const localId = await page.evaluate(() => window.__dustOnlineTest.getState().playerId);
  await page.evaluate((args) => {
    const bot = window.__dustMultiplayerTest.getBackfillBotDiagnostics()[0];
    window.__dustMultiplayerTest.setPlayerPosition(args.localId, bot.x + 5, bot.z);
  }, { localId });
  await advanceMs(page, 1000);
  const fireCountsBefore = await page.evaluate(() =>
    window.__dustMultiplayerTest.getBackfillBotDiagnostics().map((entry) => entry.lastFireActionSequence));
  await advanceMs(page, 4000);
  let diagnostics = await page.evaluate(() => window.__dustMultiplayerTest.getBackfillBotDiagnostics());
  diagnostics.forEach((bot, index) => {
    expect(bot.targetPlayerId).toBe("");
    expect(bot.playerKills).toBe(0);
    expect(bot.lastFireActionSequence).toBe(fireCountsBefore[index]);
  });
  const localAlive = await page.evaluate((id) => {
    const player = window.__dustMultiplayerTest.getState().players.find((entry) => entry.id === id);
    return player ? player.alive : null;
  }, localId);
  expect(localAlive).toBe(true);

  // Hurting a bot flips only that bot into revenge mode.
  await page.evaluate((args) => {
    window.__dustMultiplayerTest.damagePlayer(args.botId, 30, args.localId);
  }, { botId: bots[1].id, localId });
  await advanceMs(page, 1500);
  diagnostics = await page.evaluate(() => window.__dustMultiplayerTest.getBackfillBotDiagnostics());
  const avenger = diagnostics.find((entry) => entry.id === bots[1].id);
  expect(avenger.grudgeAttackerId).toBe(localId);
  expect(avenger.targetPlayerId).toBe(localId);
  for (const bot of diagnostics) {
    if (bot.id !== bots[1].id) expect(bot.targetPlayerId).toBe("");
  }

  // The grudge cools off instead of becoming a permanent vendetta.
  await advanceMs(page, 11000);
  diagnostics = await page.evaluate(() => window.__dustMultiplayerTest.getBackfillBotDiagnostics());
  for (const bot of diagnostics) expect(bot.targetPlayerId).toBe("");
});

test("bots draft real builds and revive when they can afford it", async ({ page }) => {
  await bootLobby(page);
  await findPublicMatch(page);
  const bots = await startBackfillMatch(page);
  await page.evaluate(() => window.__dustAndDeadTest.clearEnemies());

  // Levels queue drafts; the bot works through them with human-like pauses and
  // ends up with a class and a coherent build.
  await page.evaluate((botId) => window.__dustMultiplayerTest.awardXp(botId, 700), bots[0].id);
  let drafted = null;
  for (let round = 0; round < 12; round++) {
    await advanceMs(page, 10000);
    drafted = await page.evaluate((botId) =>
      window.__dustMultiplayerTest.getBackfillBotDiagnostics().find((entry) => entry.id === botId), bots[0].id);
    if (drafted.pendingUpgradeLevels === 0 && !drafted.hasUpgradeOffer) break;
  }
  expect(drafted.level).toBeGreaterThanOrEqual(5);
  expect(drafted.playerClass).not.toBe("");
  expect(drafted.pendingUpgradeLevels).toBe(0);

  // A rich bot buys a revive; a broke bot bows out.
  await page.evaluate((botId) => window.__dustMultiplayerTest.setPoints(botId, 50), bots[1].id);
  await page.evaluate((botId) => window.__dustMultiplayerTest.damagePlayer(botId, 999, ""), bots[1].id);
  await advanceMs(page, 9000);
  const revived = await page.evaluate((botId) =>
    window.__dustMultiplayerTest.getBackfillBotDiagnostics().find((entry) => entry.id === botId), bots[1].id);
  expect(revived.alive).toBe(true);
  expect(revived.points).toBeLessThan(50);

  await page.evaluate((botId) => window.__dustMultiplayerTest.setPoints(botId, 0), bots[2].id);
  await page.evaluate((botId) => window.__dustMultiplayerTest.damagePlayer(botId, 999, ""), bots[2].id);
  await advanceMs(page, 9000);
  const eliminated = await page.evaluate((botId) =>
    window.__dustMultiplayerTest.getBackfillBotDiagnostics().find((entry) => entry.id === botId), bots[2].id);
  expect(eliminated.alive).toBe(false);
  expect(eliminated.surrendered).toBe(true);
});

test("when the player is out for good the bots finish the match among themselves", async ({ page }) => {
  await bootLobby(page);
  await findPublicMatch(page);
  const bots = await startBackfillMatch(page);
  await page.evaluate(() => window.__dustAndDeadTest.clearEnemies());
  const localId = await page.evaluate(() => window.__dustOnlineTest.getState().playerId);

  await page.evaluate((id) => {
    window.__dustMultiplayerTest.damagePlayer(id, 999, "");
    window.__dustMultiplayerTest.surrender(id);
  }, localId);

  // Spectating player, live bots: they now hunt each other.
  await advanceMs(page, 2000);
  const diagnostics = await page.evaluate(() => window.__dustMultiplayerTest.getBackfillBotDiagnostics());
  const botIds = new Set(bots.map((entry) => entry.id));
  for (const bot of diagnostics) {
    if (!bot.alive || bot.surrendered) continue;
    expect(botIds.has(bot.targetPlayerId)).toBe(true);
    expect(bot.targetPlayerId).not.toBe(bot.id);
  }

  // Bots that die in the endgame let go instead of reviving forever, so the
  // match converges. Give two of them the push and let the survivor lead.
  await page.evaluate((args) => {
    window.__dustMultiplayerTest.setPoints(args.last, 999);
    window.__dustMultiplayerTest.damagePlayer(args.first, 999, "");
    window.__dustMultiplayerTest.damagePlayer(args.second, 999, "");
  }, { first: bots[0].id, second: bots[1].id, last: bots[2].id });
  await advanceMs(page, 9000);
  const after = await page.evaluate(() => window.__dustMultiplayerTest.getBackfillBotDiagnostics());
  expect(after.find((entry) => entry.id === bots[0].id).surrendered).toBe(true);
  expect(after.find((entry) => entry.id === bots[1].id).surrendered).toBe(true);

  await advanceMs(page, 4000);
  await expect.poll(() => page.evaluate(() => window.__dustMultiplayerTest.getState().phase)).toBe("ended");
  await expect(page.locator("#multiplayer-result-panel")).toBeVisible();
});

test("a player bought by the Baron becomes fair game while he is in sight", async ({ page }) => {
  await bootLobby(page);
  await findPublicMatch(page);
  const bots = await startBackfillMatch(page);
  await page.evaluate(() => window.__dustAndDeadTest.clearEnemies());
  const localId = await page.evaluate(() => window.__dustOnlineTest.getState().playerId);

  await page.evaluate(() => window.__dustAndDeadTest.forceWaveState(10, 0, 0, "oilBaron"));
  await advanceMs(page, 2000);

  // Standing next to the bots during the boss fight is safe while loyal.
  await page.evaluate((args) => {
    const bot = window.__dustMultiplayerTest.getBackfillBotDiagnostics().find((entry) => entry.alive);
    window.__dustMultiplayerTest.setPlayerPosition(args.localId, bot.x + 6, bot.z);
  }, { localId });
  await advanceMs(page, 3000);
  let diagnostics = await page.evaluate(() => window.__dustMultiplayerTest.getBackfillBotDiagnostics());
  for (const bot of diagnostics) expect(bot.targetPlayerId).not.toBe(localId);

  // Taking the Baron's gold makes this player everyone's enemy on sight.
  await page.evaluate((args) => window.__dustMultiplayerTest.setOilBaronAllyForTest(args.localId, true), { localId });
  let hunted = false;
  for (let round = 0; round < 10 && !hunted; round++) {
    await page.evaluate((args) => {
      window.__dustMultiplayerTest.setHealth(args.localId, 120);
      const bot = window.__dustMultiplayerTest.getBackfillBotDiagnostics().find((entry) => entry.alive);
      if (bot) window.__dustMultiplayerTest.setPlayerPosition(args.localId, bot.x + 6, bot.z);
    }, { localId });
    await advanceMs(page, 1000);
    diagnostics = await page.evaluate(() => window.__dustMultiplayerTest.getBackfillBotDiagnostics());
    hunted = diagnostics.some((bot) => bot.targetPlayerId === localId);
  }
  expect(hunted).toBe(true);

  // Out of the hunt range the bots let the boss keep their attention.
  await page.evaluate((args) => {
    window.__dustMultiplayerTest.setHealth(args.localId, 120);
    const bot = window.__dustMultiplayerTest.getBackfillBotDiagnostics().find((entry) => entry.alive);
    window.__dustMultiplayerTest.setPlayerPosition(args.localId, bot.x + 60, bot.z);
  }, { localId });
  await advanceMs(page, 2500);
  diagnostics = await page.evaluate(() => window.__dustMultiplayerTest.getBackfillBotDiagnostics());
  for (const bot of diagnostics) expect(bot.targetPlayerId).not.toBe(localId);
});

test("losing the player during a boss wave delays the bot feud until the next wave", async ({ page }) => {
  await bootLobby(page);
  await findPublicMatch(page);
  const bots = await startBackfillMatch(page);
  await page.evaluate(() => window.__dustAndDeadTest.clearEnemies());
  const localId = await page.evaluate(() => window.__dustOnlineTest.getState().playerId);
  const botIds = new Set(bots.map((entry) => entry.id));

  await page.evaluate(() => window.__dustAndDeadTest.forceWaveState(10, 0, 0, "bellRinger"));
  await advanceMs(page, 1500);
  await page.evaluate((args) => {
    args.botIds.forEach((id) => window.__dustMultiplayerTest.setHealth(id, 120));
    window.__dustMultiplayerTest.damagePlayer(args.localId, 999, "");
    window.__dustMultiplayerTest.surrender(args.localId);
  }, { localId, botIds: [...botIds] });

  // The player is gone, but this is still the boss wave: the bots finish the
  // fight together instead of turning on each other.
  await advanceMs(page, 4000);
  let diagnostics = await page.evaluate(() => window.__dustMultiplayerTest.getBackfillBotDiagnostics());
  for (const bot of diagnostics) {
    if (!bot.alive || bot.surrendered) continue;
    expect(botIds.has(bot.targetPlayerId)).toBe(false);
  }

  // Boss down, next regular wave: now the feud is on.
  await page.evaluate((ids) => {
    window.__dustAndDeadTest.forceActiveBossDefeat();
    ids.forEach((id) => window.__dustMultiplayerTest.setHealth(id, 120));
    window.__dustAndDeadTest.forceWaveState(11, 0, 0);
  }, [...botIds]);
  await advanceMs(page, 3000);
  diagnostics = await page.evaluate(() => window.__dustMultiplayerTest.getBackfillBotDiagnostics());
  const aliveBots = diagnostics.filter((bot) => bot.alive && !bot.surrendered);
  expect(aliveBots.length).toBeGreaterThanOrEqual(2);
  for (const bot of aliveBots) {
    expect(botIds.has(bot.targetPlayerId)).toBe(true);
    expect(bot.targetPlayerId).not.toBe(bot.id);
  }
});
