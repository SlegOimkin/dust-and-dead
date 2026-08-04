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
  allReadyCountdownMs: 300,
  allReadyStartMs: 350,
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
  // Two clocks have to move together: advanceTime drives the simulation (the
  // in-match bot brains), and advanceBackfillClockForTest drives the lobby's
  // wall-clock timers. advanceTime also caps how much simulated time one call
  // may cover, so long waits are fed in slices. The simulation is stepped
  // first each slice, so the lobby timer starts from the current clock before
  // the jump rather than after it.
  for (let remaining = ms; remaining > 0; remaining -= 500) {
    const slice = Math.min(500, remaining);
    await page.evaluate((value) => {
      window.advanceTime(value);
      window.__dustOnlineTest.advanceBackfillClockForTest(value);
    }, slice);
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
  await advanceMs(page, FAST_BACKFILL.allReadyStartMs + FAST_BACKFILL.prepareMs + 500);
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

  // The player readies up. The match does not begin on the click: a countdown
  // runs first, so the room is never yanked away the instant the last bot
  // settles.
  await page.locator("#online-multiplayer-ready-btn").click();
  await advanceMs(page, 100);
  await expect(page.locator("#online-multiplayer-countdown")).toBeVisible();
  expect(await page.evaluate(() => window.__dustMultiplayerTest.getState().phase)).not.toBe("match");

  await advanceMs(page, FAST_BACKFILL.allReadyStartMs + FAST_BACKFILL.prepareMs + 500);
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
  // With the arena empty the only thing a bot could shoot is the player, so a
  // single fired round is a real failure rather than a stray zombie. Assert the
  // emptiness explicitly: if it ever stops holding, the test says so instead of
  // failing further down for a reason nobody can reconstruct.
  const enemiesLeft = await page.evaluate(() => JSON.parse(window.render_game_to_text()).enemies.length);
  expect(enemiesLeft).toBe(0);
  const fireCountsBefore = await page.evaluate(() =>
    window.__dustMultiplayerTest.getBackfillBotDiagnostics().map((entry) => entry.lastFireActionSequence));
  await advanceMs(page, 4000);
  let diagnostics = await page.evaluate(() => window.__dustMultiplayerTest.getBackfillBotDiagnostics());
  diagnostics.forEach((bot, index) => {
    expect(bot.targetPlayerId).toBe("");
    expect(bot.playerKills).toBe(0);
    expect(bot.lastFireActionSequence).toBe(fireCountsBefore[index]);
  });
  const localState = await page.evaluate((id) => {
    const player = window.__dustMultiplayerTest.getState().players.find((entry) => entry.id === id);
    return player ? { alive: player.alive, hp: player.hp } : null;
  }, localId);
  expect(localState.alive).toBe(true);
  expect(localState.hp).toBe(120);

  // Hurting a bot flips only that bot into revenge mode. Top it up first: a hit
  // that happens to KILL grants the separate lifelong vendetta, which is a
  // different mechanism and would mask the timed grudge this asserts.
  await page.evaluate((args) => {
    window.__dustMultiplayerTest.setHealth(args.botId, 120);
    window.__dustMultiplayerTest.damagePlayer(args.botId, 30, args.localId);
  }, { botId: bots[1].id, localId });
  await advanceMs(page, 1500);
  diagnostics = await page.evaluate(() => window.__dustMultiplayerTest.getBackfillBotDiagnostics());
  const avenger = diagnostics.find((entry) => entry.id === bots[1].id);
  expect(avenger.grudgeAttackerId).toBe(localId);
  expect(avenger.vendettaPlayerId).toBe("");
  expect(avenger.targetPlayerId).toBe(localId);
  for (const bot of diagnostics) {
    if (bot.id !== bots[1].id) expect(bot.targetPlayerId).toBe("");
  }

  // Being shot and surviving buys a grudge that expires, not a vendetta.
  await advanceMs(page, 11000);
  diagnostics = await page.evaluate(() => window.__dustMultiplayerTest.getBackfillBotDiagnostics());
  for (const bot of diagnostics) {
    if (bot.vendettaPlayerId) continue;
    expect(bot.targetPlayerId).toBe("");
  }
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

test("bots hold fire while the Bell Ringer is shielded and go take the churches", async ({ page }) => {
  await bootLobby(page);
  await findPublicMatch(page);
  await startBackfillMatch(page);
  await page.evaluate(() => window.__dustAndDeadTest.clearEnemies());

  await page.evaluate(() => window.__dustAndDeadTest.forceWaveState(10, 0, 0, "bellRinger"));
  await advanceMs(page, 1000);
  const shielded = await page.evaluate(() => {
    const encounter = window.__dustAndDeadTest.getBellRingerDiagnostics
      ? window.__dustAndDeadTest.getBellRingerDiagnostics()
      : null;
    return encounter ? encounter.shielded : null;
  });
  // The fight opens shielded; if that ever changes the rest of this test is
  // meaningless, so assert it rather than assume it.
  expect(shielded === null || shielded === true).toBe(true);

  // Shield up: nobody wastes rounds on the boss, and every bot has a church to
  // walk to.
  await advanceMs(page, 2500);
  let diagnostics = await page.evaluate(() => window.__dustMultiplayerTest.getBackfillBotDiagnostics());
  for (const bot of diagnostics) {
    if (!bot.alive) continue;
    expect(bot.targetKind).not.toBe("boss");
    expect(bot.churchGoal).toBeGreaterThanOrEqual(0);
  }

  // The bots actually close on their church rather than milling around.
  const approach = await page.evaluate(() => {
    const before = window.__dustMultiplayerTest.getBackfillBotDiagnostics();
    return before.map((bot) => ({ id: bot.id, x: bot.x, z: bot.z }));
  });
  await advanceMs(page, 5000);
  const after = await page.evaluate(() => window.__dustMultiplayerTest.getBackfillBotDiagnostics());
  const moved = after.filter((bot, index) => {
    const start = approach[index];
    return start && Math.hypot(bot.x - start.x, bot.z - start.z) > 2;
  });
  expect(moved.length).toBeGreaterThan(0);
});

test("an empty gun stops a bot pretending to fight and sends it through the horde", async ({ page }) => {
  await bootLobby(page);
  await findPublicMatch(page);
  const bots = await startBackfillMatch(page);
  await page.evaluate(() => window.__dustAndDeadTest.clearEnemies());

  const setup = await page.evaluate((botId) => {
    const multi = window.__dustMultiplayerTest;
    const game = window.__dustAndDeadTest;
    const bot = multi.getBackfillBotDiagnostics().find((entry) => entry.id === botId);
    multi.setProgression(botId, { ammo: { revolver: 0 }, ammoReserve: { revolver: 0 } });
    const cx = bot.x + 14;
    const cz = bot.z;
    game.spawnAmmoCrateAt(cx, cz);
    // A wall of zombies directly between the bot and the crate.
    for (let i = 0; i < 7; i += 1) multi.spawnEnemyAt(bot.x + 7, bot.z - 4.5 + i * 1.5, "walker", 500);
    return { cx, cz };
  }, bots[0].id);

  // With nothing to shoot, the bot must not hold a target: aiming at zombies it
  // cannot kill is what made it swivel unnaturally, and at a boss it cannot
  // hurt is wasted time.
  await advanceMs(page, 500);
  const dry = await page.evaluate((botId) =>
    window.__dustMultiplayerTest.getBackfillBotDiagnostics().find((entry) => entry.id === botId), bots[0].id);
  expect(dry.targetKind).toBe("");

  // And it walks the gauntlet rather than circling at a safe distance.
  let collected = false;
  for (let round = 0; round < 12 && !collected; round += 1) {
    await advanceMs(page, 1000);
    collected = await page.evaluate((args) => {
      const crates = JSON.parse(window.render_game_to_text()).ammoCrates || [];
      return !crates.some((crate) => Math.hypot(crate.x - args.cx, crate.z - args.cz) < 2);
    }, setup);
  }
  expect(collected).toBe(true);

  const fed = await page.evaluate((botId) =>
    window.__dustMultiplayerTest.getBackfillBotDiagnostics().find((entry) => entry.id === botId), bots[0].id);
  expect(fed.targetKind).not.toBe("");
});

test("bots restock at two magazines, not at the last round", async ({ page }) => {
  await bootLobby(page);
  await findPublicMatch(page);
  const bots = await startBackfillMatch(page);
  await page.evaluate(() => window.__dustAndDeadTest.clearEnemies());

  const crate = await page.evaluate((botId) => {
    const bot = window.__dustMultiplayerTest.getBackfillBotDiagnostics().find((entry) => entry.id === botId);
    const point = { cx: bot.x + 20, cz: bot.z };
    window.__dustAndDeadTest.spawnAmmoCrateAt(point.cx, point.cz);
    return point;
  }, bots[0].id);

  const distance = () => page.evaluate((args) => {
    const bot = window.__dustMultiplayerTest.getBackfillBotDiagnostics().find((entry) => entry.id === args.id);
    return Math.hypot(bot.x - args.cx, bot.z - args.cz);
  }, { id: bots[0].id, cx: crate.cx, cz: crate.cz });

  const settleWith = async (magazine, reserve) => {
    await page.evaluate((args) => window.__dustMultiplayerTest.setProgression(args.id, {
      ammo: { revolver: args.magazine },
      ammoReserve: { revolver: args.reserve },
    }), { id: bots[0].id, magazine, reserve });
    await advanceMs(page, 4000);
    return distance();
  };

  // A bot with rounds to spare drifts around fighting; it must not commit to
  // the crate. The revolver holds six, so thirteen rounds is over two mags.
  expect(await settleWith(6, 7)).toBeGreaterThan(8);
  // At exactly two magazines it goes and gets them.
  expect(await settleWith(6, 6)).toBeLessThan(4);
});

test("the lobby keeps counting down while the room is still filling", async ({ page }) => {
  await bootLobby(page);
  await findPublicMatch(page);
  await page.evaluate((config) => window.__dustOnlineTest.configureBackfillForTest(config), {
    ...FAST_BACKFILL,
    joinIntervalMs: 2000,
    allReadyCountdownMs: 5000,
    allReadyStartMs: 5500,
  });

  await advanceMs(page, FAST_BACKFILL.delayMs + 400);
  await advanceMs(page, 1000);
  await page.locator("#online-multiplayer-ready-btn").click();
  await advanceMs(page, 500);

  // Everyone present is ready but bots are still walking in. The lobby used to
  // claim the match was starting and show nothing at all; it must show the
  // player when it will actually begin.
  const filling = await page.evaluate(() => window.__dustOnlineTest.getBackfillState());
  expect(filling.pendingJoins).toBeGreaterThan(0);
  await expect(page.locator("#online-multiplayer-countdown")).toBeVisible();
  const shown = Number(await page.locator("#online-multiplayer-countdown-value").textContent());
  expect(shown).toBeGreaterThan(0);
});

test("derricks do not hold the bots back from the Baron himself", async ({ page }) => {
  await bootLobby(page);
  await findPublicMatch(page);
  await startBackfillMatch(page);
  await page.evaluate(() => window.__dustAndDeadTest.clearEnemies());

  // Derricks plant on top of the party, so they are always the nearest thing
  // to shoot. They must not become the thing the bots walk to.
  await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    game.startWaveNow(10, "oilBaron");
    game.clearEnemies();
    game.setOilBaronAiEnabled(false);
    for (let i = 0; i < 6; i++) game.spawnOilDerrick(undefined, undefined, { instant: true, silent: true });
  });
  await advanceMs(page, 1000);

  const distanceToBaron = () => page.evaluate(() => {
    const boss = window.__dustAndDeadTest.getOilBaronDiagnostics().boss;
    return window.__dustMultiplayerTest.getBackfillBotDiagnostics()
      .map((bot) => Math.hypot(bot.x - boss.x, bot.z - boss.z));
  });

  const before = await distanceToBaron();
  await advanceMs(page, 10000);
  const after = await distanceToBaron();

  // Every bot is meaningfully closer to the Baron than it started, with the
  // derrick field still standing between them.
  after.forEach((distance, index) => expect(distance).toBeLessThan(before[index] - 10));
  const derricksAlive = await page.evaluate(() =>
    window.__dustAndDeadTest.getOilBaronDiagnostics().derricks.filter((d) => d.active && !d.destroyed).length);
  expect(derricksAlive).toBeGreaterThan(0);
});

test("player damage is muted during a boss fight, except against the Baron's ally", async ({ page }) => {
  await bootLobby(page);
  await findPublicMatch(page);
  const bots = await startBackfillMatch(page);
  await page.evaluate(() => window.__dustAndDeadTest.clearEnemies());
  const localId = await page.evaluate(() => window.__dustOnlineTest.getState().playerId);

  const hitFor = async (amount) => page.evaluate((args) => {
    const multi = window.__dustMultiplayerTest;
    multi.setHealth(args.botId, 120);
    multi.damagePlayer(args.botId, args.amount, args.localId);
    const bot = multi.getBackfillBotDiagnostics().find((entry) => entry.id === args.botId);
    return 120 - (multi.getState().players.find((p) => p.id === args.botId).hp ?? bot.hp);
  }, { botId: bots[0].id, amount, localId });

  // No boss: full damage.
  expect(await hitFor(50)).toBeCloseTo(50, 1);

  // Boss on the field: a fifth of it, so a duel cannot decide the encounter.
  await page.evaluate(() => {
    window.__dustAndDeadTest.startWaveNow(10, "bellRinger");
    window.__dustAndDeadTest.clearEnemies();
  });
  await advanceMs(page, 500);
  expect(await hitFor(50)).toBeCloseTo(10, 1);

  // Unless the target took the Baron's gold: that duel IS the encounter.
  await page.evaluate(() => {
    window.__dustAndDeadTest.startWaveNow(10, "oilBaron");
    window.__dustAndDeadTest.clearEnemies();
  });
  await advanceMs(page, 500);
  expect(await hitFor(50)).toBeCloseTo(10, 1);
  await page.evaluate((botId) => window.__dustMultiplayerTest.setOilBaronAllyForTest(botId, true), bots[0].id);
  expect(await hitFor(50)).toBeCloseTo(50, 1);
});

test("a bot killed outside a boss wave sometimes carries the grudge into its next life", async ({ page }) => {
  await bootLobby(page);
  await findPublicMatch(page);
  const bots = await startBackfillMatch(page);
  await page.evaluate(() => window.__dustAndDeadTest.clearEnemies());
  const localId = await page.evaluate(() => window.__dustOnlineTest.getState().playerId);

  // Killed during a boss wave: the truce holds, no vendetta is even rolled.
  await page.evaluate(() => {
    window.__dustAndDeadTest.startWaveNow(10, "bellRinger");
    window.__dustAndDeadTest.clearEnemies();
  });
  await page.evaluate((args) => {
    window.__dustMultiplayerTest.setPoints(args.botId, 9999);
    window.__dustMultiplayerTest.damagePlayer(args.botId, 9999, args.localId);
  }, { botId: bots[0].id, localId });
  let state = await page.evaluate((botId) =>
    window.__dustMultiplayerTest.getBackfillBotDiagnostics().find((entry) => entry.id === botId), bots[0].id);
  expect(state.vendettaPlayerId).toBe("");

  // On a regular wave the roll happens; over many deaths at least one bot ends
  // up holding a grudge, and it is always aimed at the killer.
  await page.evaluate(() => window.__dustAndDeadTest.startWaveNow(11));
  let sworn = null;
  for (let attempt = 0; attempt < 25 && !sworn; attempt += 1) {
    for (const bot of bots) {
      await page.evaluate((args) => {
        const multi = window.__dustMultiplayerTest;
        multi.setPoints(args.botId, 9999);
        multi.setHealth(args.botId, 120);
        multi.damagePlayer(args.botId, 9999, args.localId);
        multi.revive(args.botId);
      }, { botId: bot.id, localId });
    }
    const all = await page.evaluate(() => window.__dustMultiplayerTest.getBackfillBotDiagnostics());
    sworn = all.find((entry) => entry.vendettaPlayerId) || null;
  }
  expect(sworn).not.toBe(null);
  expect(sworn.vendettaPlayerId).toBe(localId);
  expect(sworn.vendettaLife).toBe(sworn.deaths);

  // Taking the shot settles it: once the bot kills the player it was hunting,
  // the grudge is spent.
  await page.evaluate((args) => {
    window.__dustMultiplayerTest.setHealth(args.localId, 120);
    window.__dustMultiplayerTest.damagePlayer(args.localId, 9999, args.botId);
  }, { botId: sworn.id, localId });
  const settled = await page.evaluate((botId) =>
    window.__dustMultiplayerTest.getBackfillBotDiagnostics().find((entry) => entry.id === botId), sworn.id);
  expect(settled.vendettaPlayerId).toBe("");
});

test("bots do not shoot a boss that cannot be damaged", async ({ page }) => {
  await bootLobby(page);
  await findPublicMatch(page);
  await startBackfillMatch(page);
  await page.evaluate(() => window.__dustAndDeadTest.clearEnemies());

  // The Ghost Train spends the fight cycling between spectral (immune) and
  // materialized (only its current tail car can be hurt), so sampling across
  // the whole encounter exercises both states.
  await page.evaluate(() => window.__dustAndDeadTest.forceWaveState(10, 0, 0, "ghostTrain"));
  for (let sample = 0; sample < 10; sample++) {
    await advanceMs(page, 1000);
    const targeting = await page.evaluate(() => window.__dustMultiplayerTest.getBackfillBossTargetAudit());
    // A bot may aim at the boss or at nothing, but never at a target the damage
    // pipeline would reject outright.
    for (const entry of targeting) expect(entry.damageable).toBe(true);
  }
  const diagnostics = await page.evaluate(() => window.__dustMultiplayerTest.getBackfillBotDiagnostics());
  expect(diagnostics.length).toBe(3);
});
