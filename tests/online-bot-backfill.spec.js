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
  // Zero is also the shipped value: a public room hands the lobby straight to
  // the emulation. It stays spelled out here because the helpers below wait it
  // out, and because a deployment may put a real-player window back in front.
  delayMs: 0,
  firstJoinMs: 2000,
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
  await advanceMs(page, FAST_BACKFILL.delayMs + 500);
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

test("a codeless match is handed to bots as soon as the room is found", async ({ page }) => {
  await bootLobby(page);
  await findPublicMatch(page);
  await page.evaluate((config) => window.__dustOnlineTest.configureBackfillForTest(config), FAST_BACKFILL);

  // Finding a public room is itself the trigger: there is no window in which a
  // stranger could turn up, because nobody is being waited for. The room is
  // still empty though — the first player is not due for another beat.
  await advanceMs(page, 500);
  expect((await backfillState(page)).active).toBe(true);
  await expect(page.locator("#online-multiplayer-player-list .multiplayer-player-row")).toHaveCount(1);

  // The client silently left the real queue when the emulation took over.
  const sent = await page.evaluate(() => window.__onlineSent.map((message) => message.type));
  expect(sent).toContain("queue.leave");
  const storedSession = await page.evaluate(() => window.sessionStorage.getItem("dustAndDeadOnlineSessionV1"));
  expect(storedSession).toBe(null);

  // Bots trickle in on the join cadence and ready up like players would.
  await advanceMs(page, 4500);
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
  // Long past the point where a public room would have filled itself.
  await advanceMs(page, FAST_BACKFILL.firstJoinMs * 4);
  expect((await backfillState(page)).active).toBe(false);
  await expect(page.locator("#online-multiplayer-player-list .multiplayer-player-row")).toHaveCount(1);
});

test("the shipped public queue needs no waiting period at all", async ({ page }) => {
  await bootLobby(page);
  await findPublicMatch(page);
  // Deliberately no delayMs override: this is the value the game ships with,
  // and it is what makes every codeless match a bot match.
  await page.evaluate(() => window.__dustOnlineTest.configureBackfillForTest(null));

  await advanceMs(page, 500);
  expect((await backfillState(page)).active).toBe(true);
  const sent = await page.evaluate(() => window.__onlineSent.map((message) => message.type));
  expect(sent).toContain("queue.leave");

  // Seven seconds of empty room, and then the first player walks in. The
  // margins are wide because these deadlines are wall clock: the real time a
  // Playwright round trip takes counts towards them too.
  await advanceMs(page, 3000);
  await expect(page.locator("#online-multiplayer-player-list .multiplayer-player-row")).toHaveCount(1);
  await advanceMs(page, 5000);
  await expect(page.locator("#online-multiplayer-player-list .multiplayer-player-row")).toHaveCount(2);
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

test("an empty gun with no crate to walk to sends the bot looking", async ({ page }) => {
  await bootLobby(page);
  await findPublicMatch(page);
  const bots = await startBackfillMatch(page);
  await page.evaluate(() => {
    window.__dustAndDeadTest.clearEnemies();
    // Nothing to shoot and nothing to collect: the exact spot where bots used
    // to stand and wait for a crate to appear under them.
    window.__dustAndDeadTest.clearAmmoCrates();
  });

  const start = await page.evaluate((botId) => {
    const multi = window.__dustMultiplayerTest;
    multi.setProgression(botId, { ammo: { revolver: 0 }, ammoReserve: { revolver: 0 } });
    const bot = multi.getBackfillBotDiagnostics().find((entry) => entry.id === botId);
    return { x: bot.x, z: bot.z };
  }, bots[0].id);

  await advanceMs(page, 1000);
  const searching = await page.evaluate((botId) =>
    window.__dustMultiplayerTest.getBackfillBotDiagnostics().find((entry) => entry.id === botId), bots[0].id);
  expect(searching.roaming).toBe(true);

  // Net displacement, not path length: a bot jittering on the spot covers
  // ground without going anywhere, and that is the thing being fixed. The bar
  // is well under the ~20 units it walks in five seconds — a roam goal can be
  // reached and replaced mid-window, and the pull back toward the human bends
  // the line — but far above the two or three a bot managed while idling.
  await advanceMs(page, 5000);
  const travelled = await page.evaluate((args) => {
    const bot = window.__dustMultiplayerTest.getBackfillBotDiagnostics().find((entry) => entry.id === args.botId);
    return Math.hypot(bot.x - args.start.x, bot.z - args.start.z);
  }, { botId: bots[0].id, start });
  expect(travelled).toBeGreaterThan(10);
});

test("no more than two bots walk to the same ammo crate", async ({ page }) => {
  await bootLobby(page);
  await findPublicMatch(page);
  const bots = await startBackfillMatch(page);
  await page.evaluate(() => {
    window.__dustAndDeadTest.clearEnemies();
    window.__dustAndDeadTest.clearAmmoCrates();
  });

  // Every bot dry, and exactly one crate on the map: without the cap all three
  // filed toward it in a queue.
  await page.evaluate((botIds) => {
    const multi = window.__dustMultiplayerTest;
    botIds.forEach((id) => multi.setProgression(id, { ammo: { revolver: 0 }, ammoReserve: { revolver: 0 } }));
    const bot = multi.getBackfillBotDiagnostics()[0];
    // Far enough that nobody arrives and collects it while the claims are
    // being read, which would free a slot and hide the cap.
    window.__dustAndDeadTest.spawnAmmoCrateAt(bot.x + 60, bot.z);
  }, bots.map((bot) => bot.id));

  await advanceMs(page, 1000);
  const claims = await page.evaluate(() => window.__dustMultiplayerTest.getBackfillBotDiagnostics());
  const takers = claims.filter((bot) => bot.crateGoalIndex === 0);
  expect(takers.length).toBe(2);
  // And the one left out does not stand around waiting its turn.
  const leftOut = claims.filter((bot) => bot.crateGoalIndex < 0);
  expect(leftOut.length).toBe(1);
  expect(leftOut[0].roaming).toBe(true);
});

test("a bot shot by another bot does not drop the horde to answer it", async ({ page }) => {
  await bootLobby(page);
  await findPublicMatch(page);
  const bots = await startBackfillMatch(page);
  const localId = await page.evaluate(() => window.__dustOnlineTest.getState().playerId);
  await page.evaluate(() => window.__dustAndDeadTest.clearEnemies());

  // A zombie to be busy with, far enough out that it is an ordinary target
  // rather than the point-blank self-defence case.
  await page.evaluate((botId) => {
    const multi = window.__dustMultiplayerTest;
    const bot = multi.getBackfillBotDiagnostics().find((entry) => entry.id === botId);
    multi.spawnEnemyAt(bot.x + 10, bot.z, "walker", 4000);
  }, bots[0].id);
  await advanceMs(page, 500);

  // Clipped by another bot. With friendly fire live outside boss fights this
  // happens constantly, and answering it used to send both of them across the
  // map for nine seconds at a time.
  await page.evaluate((args) => window.__dustMultiplayerTest.damagePlayer(args.victimId, 15, args.shooterId),
    { victimId: bots[0].id, shooterId: bots[1].id });
  await advanceMs(page, 1000);
  const shrugged = await page.evaluate((botId) =>
    window.__dustMultiplayerTest.getBackfillBotDiagnostics().find((entry) => entry.id === botId), bots[0].id);
  expect(shrugged.targetPlayerId).toBe("");
  expect(shrugged.targetKind).toBe("enemy");

  // The human is a different matter: that is a real opponent, and it does
  // answer. Without this the rule would just be "bots never fight back".
  await page.evaluate((args) => window.__dustMultiplayerTest.damagePlayer(args.victimId, 15, args.shooterId),
    { victimId: bots[0].id, shooterId: localId });
  await advanceMs(page, 1000);
  const answered = await page.evaluate((botId) =>
    window.__dustMultiplayerTest.getBackfillBotDiagnostics().find((entry) => entry.id === botId), bots[0].id);
  expect(answered.targetPlayerId).toBe(localId);
  expect(answered.targetKind).toBe("player");
});

test("an empty gun outranks a church capture", async ({ page }) => {
  await bootLobby(page);
  await findPublicMatch(page);
  const bots = await startBackfillMatch(page);
  await page.evaluate(() => {
    window.__dustAndDeadTest.clearEnemies();
    window.__dustAndDeadTest.clearAmmoCrates();
    // The Bell Ringer opens shielded, so every bot is assigned a church and
    // walks off to hold it — the run this test has to outrank.
    window.__dustAndDeadTest.forceWaveState(10, 0, 0, "bellRinger");
  });
  await advanceMs(page, 1500);
  const called = await page.evaluate((botId) =>
    window.__dustMultiplayerTest.getBackfillBotDiagnostics().find((entry) => entry.id === botId), bots[0].id);
  expect(called.churchGoal).toBeGreaterThanOrEqual(0);

  // Empty gun, crate within reach. A bot that spends the capture standing in
  // the yard with nothing to shoot is neither holding the church nor able to
  // hurt the boss when the shield drops, so the crate wins.
  await page.evaluate((botId) => {
    const multi = window.__dustMultiplayerTest;
    multi.setProgression(botId, { ammo: { revolver: 0 }, ammoReserve: { revolver: 0 } });
    const bot = multi.getBackfillBotDiagnostics().find((entry) => entry.id === botId);
    window.__dustAndDeadTest.spawnAmmoCrateAt(bot.x + 14, bot.z);
  }, bots[0].id);
  await advanceMs(page, 5000);
  const fed = await page.evaluate((botId) =>
    window.__dustMultiplayerTest.getBackfillBotDiagnostics().find((entry) => entry.id === botId), bots[0].id);
  expect(fed.ammoTotal).toBeGreaterThan(0);
});

test("bots restock at two magazines, not at the last round", async ({ page }) => {
  await bootLobby(page);
  await findPublicMatch(page);
  const bots = await startBackfillMatch(page);
  await page.evaluate(() => window.__dustAndDeadTest.clearEnemies());

  // Personas draw a random weapon and the threshold under test is quoted in
  // revolver magazines — six rounds. Pin it, or the ammo the spec sets belongs
  // to a gun the bot is not holding and nothing happens, for the wrong reason.
  await page.evaluate((id) => window.__dustMultiplayerTest.setProgression(id, { weapon: "revolver" }), bots[0].id);

  const botState = () => page.evaluate((id) =>
    window.__dustMultiplayerTest.getBackfillBotDiagnostics().find((entry) => entry.id === id), bots[0].id);

  // Sets the bot's rounds and drops a crate a given distance away, then reports
  // whether it counts as low on ammo. The bot's own position is never the
  // measurement: an empty arena leaves it wandering at about the speed it would
  // walk to a crate, so where it ends up proves nothing. Whether it picked the
  // crate up does.
  const stageCrate = async (magazine, reserve, crateDistance) => {
    return page.evaluate((args) => {
      const multi = window.__dustMultiplayerTest;
      multi.setProgression(args.id, {
        ammo: { revolver: args.magazine },
        ammoReserve: { revolver: args.reserve },
      });
      const bot = multi.getBackfillBotDiagnostics().find((entry) => entry.id === args.id);
      window.__dustAndDeadTest.spawnAmmoCrateAt(bot.x + args.crateDistance, bot.z);
      return multi.getBackfillBotDiagnostics().find((entry) => entry.id === args.id).ammoLow;
    }, { id: bots[0].id, magazine, reserve, crateDistance });
  };

  // Exactly two magazines is the threshold: the bot sets out and collects the
  // crate, which is what "restocks" means — arriving is not enough, and a bot
  // covers roughly four units a second, so sixteen is a comfortable walk.
  expect(await stageCrate(6, 6, 16)).toBe(true);
  await advanceMs(page, 5000);
  expect((await botState()).ammoTotal).toBeGreaterThan(12);

  // One round more is not low, and nothing is collected. The crate sits well
  // beyond anything the bot could stumble into while wandering, so a gain in
  // ammo could only mean it went shopping. Firing at whatever the wave sends
  // can only lower the count, never raise it.
  expect(await stageCrate(6, 7, 34)).toBe(false);
  await advanceMs(page, 4000);
  const idle = await botState();
  expect(idle.ammoTotal).toBeLessThanOrEqual(13);
  expect(idle.ammoLow).toBe(false);
});

// Everything the player can read off the lobby, sampled on the lobby's own
// clock. Mixing the spec's Date.now into the countdown would measure the round
// trip instead of the timer.
function readLobby(page) {
  return page.evaluate(() => {
    window.__dustOnlineTest.updateCountdown();
    const state = window.__dustOnlineTest.getBackfillState();
    const room = state.room || { players: [], autoStartAt: 0 };
    const value = document.getElementById("online-multiplayer-countdown-value");
    return {
      players: room.players.length,
      readyCount: room.players.filter((entry) => entry.ready).length,
      pendingJoins: state.pendingJoins,
      autoStartAt: room.autoStartAt,
      remainingMs: room.autoStartAt ? room.autoStartAt - state.now : 0,
      shown: Number(value && value.textContent),
      countdownVisible: !document.getElementById("online-multiplayer-countdown").hidden,
    };
  });
}

async function advanceUntilLobby(page, describe, predicate) {
  let reading = await readLobby(page);
  for (let slice = 0; slice < 40 && !predicate(reading); slice += 1) {
    await advanceMs(page, 300);
    reading = await readLobby(page);
  }
  expect(predicate(reading), `lobby never reached: ${describe}`).toBe(true);
  return reading;
}

test("every arrival drops the countdown and readying brings it back at five", async ({ page }) => {
  await bootLobby(page);
  await findPublicMatch(page);
  // The shipped lobby timings, at full length: this test is about what the
  // player reads off the clock, so scaling them down would measure nothing.
  // Only the ready delay is pinned, and pinned long, so that "walked in" and
  // "pressed ready" are two separate moments a spec can stand between.
  await page.evaluate((config) => window.__dustOnlineTest.configureBackfillForTest(config), {
    ...FAST_BACKFILL,
    firstJoinMs: 7000,
    joinIntervalMs: 5000,
    readyMinMs: 2000,
    readyMaxMs: 2001,
    allReadyCountdownMs: 5000,
    allReadyStartMs: 5500,
    prepareMs: 950,
  });

  // One player has walked in and readied up; two seats are still empty.
  await advanceMs(page, 500);
  await advanceMs(page, 9500);
  const seated = await readLobby(page);
  expect(seated.players).toBe(2);
  expect(seated.readyCount).toBe(1);

  await page.locator("#online-multiplayer-ready-btn").click();
  const armed = await readLobby(page);
  // Quoting the empty seats' natural arrival time instead used to put twenty
  // seconds on screen, for a room the player had already committed to.
  expect(armed.pendingJoins).toBe(2);
  expect(armed.countdownVisible).toBe(true);
  expect(armed.remainingMs).toBeLessThanOrEqual(5000);
  expect(armed.remainingMs).toBeGreaterThan(4000);
  expect(armed.shown).toBe(5);

  // Somebody walks in part way through: the timer goes away while they settle,
  // then comes back at a full five when they press ready. That stutter is what
  // makes the room feel like it has people in it.
  const interrupted = await advanceUntilLobby(page, "a third player", (state) => state.players === 3);
  expect(interrupted.autoStartAt).toBe(0);
  expect(interrupted.countdownVisible).toBe(false);

  const rearmed = await advanceUntilLobby(page, "the countdown again", (state) => state.autoStartAt > 0);
  expect(rearmed.readyCount).toBe(3);
  expect(rearmed.pendingJoins).toBe(1);
  expect(rearmed.remainingMs).toBeGreaterThan(4000);
  expect(rearmed.shown).toBe(5);

  // And again for the last seat.
  const lastArrival = await advanceUntilLobby(page, "a fourth player", (state) => state.players === 4);
  expect(lastArrival.autoStartAt).toBe(0);
  const finalCountdown = await advanceUntilLobby(page, "the last countdown", (state) => state.autoStartAt > 0);
  expect(finalCountdown.pendingJoins).toBe(0);
  expect(finalCountdown.readyCount).toBe(4);
  expect(finalCountdown.shown).toBe(5);

  // Nothing interrupts this one, so it runs out and the match starts full.
  await advanceMs(page, 7000);
  await expect.poll(() => page.evaluate(() => window.__dustMultiplayerTest.getState().phase)).toBe("match");
  const roster = await page.evaluate(() => window.__dustMultiplayerTest.getState().players.length);
  expect(roster).toBe(4);
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

test("bots only watch their line of fire while a boss is on the field", async ({ page }) => {
  await bootLobby(page);
  await findPublicMatch(page);
  const bots = await startBackfillMatch(page);
  await page.evaluate(() => window.__dustAndDeadTest.clearEnemies());
  const localId = await page.evaluate(() => window.__dustOnlineTest.getState().playerId);
  const botId = bots[0].id;

  const fireCount = () => page.evaluate((id) =>
    window.__dustMultiplayerTest.getBackfillBotDiagnostics().find((entry) => entry.id === id).lastFireActionSequence, botId);

  // Ordinary wave: a zombie to shoot, with the player standing squarely in the
  // way. This is a free-for-all at full damage, so the bot takes the shot.
  await page.evaluate((args) => {
    const multi = window.__dustMultiplayerTest;
    const bot = multi.getBackfillBotDiagnostics().find((entry) => entry.id === args.botId);
    multi.spawnEnemyAt(bot.x + 12, bot.z, "walker", 4000);
    multi.setPlayerPosition(args.localId, bot.x + 6, bot.z);
  }, { botId, localId });
  const before = await fireCount();
  // Long enough for a short-ranged gun to close the distance first: a coach gun
  // reaches ten units and the zombie is dropped at twelve.
  for (let i = 0; i < 12; i += 1) {
    await page.evaluate((args) => {
      const multi = window.__dustMultiplayerTest;
      const bot = multi.getBackfillBotDiagnostics().find((entry) => entry.id === args.botId);
      multi.setPlayerPosition(args.localId, bot.x + 6, bot.z);
      multi.setHealth(args.localId, 120);
    }, { botId, localId });
    await advanceMs(page, 500);
  }
  expect(await fireCount()).toBeGreaterThan(before);

  // Boss encounter: the same obstruction, but now the other players are allies
  // and the shot is held instead.
  await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    game.startWaveNow(10, "oilBaron");
    game.clearEnemies();
    game.setOilBaronAiEnabled(false);
  });
  await advanceMs(page, 500);
  const bossBefore = await fireCount();
  // Re-pinned every 100 ms, not every 500: a bot covers four units in half a
  // second, which slides the player clean off its line to the Baron. Measured
  // at the old cadence the gap grew past the rule's own threshold, so the shots
  // that followed were legal ones and the test was watching drift, not the
  // rule.
  let worstOffLane = 0;
  for (let i = 0; i < 40; i += 1) {
    const offLane = await page.evaluate((args) => {
      const multi = window.__dustMultiplayerTest;
      const boss = window.__dustAndDeadTest.getOilBaronDiagnostics().boss;
      const bot = multi.getBackfillBotDiagnostics().find((entry) => entry.id === args.botId);
      const local = multi.getState().players.find((entry) => entry.id === args.localId);
      // How far the player has slid off the bot's line to the Baron since the
      // last pin. This is what has to stay small, or "the bot never fired"
      // proves nothing.
      const reach = Math.max(0.001, Math.hypot(boss.x - bot.x, boss.z - bot.z));
      const dirX = (boss.x - bot.x) / reach;
      const dirZ = (boss.z - bot.z) / reach;
      const drift = Math.abs((local.x - bot.x) * dirZ - (local.z - bot.z) * dirX);
      // Park the bot in range of the Baron and the player exactly between them.
      const dx = bot.x - boss.x;
      const dz = bot.z - boss.z;
      const length = Math.max(0.001, Math.hypot(dx, dz));
      multi.setPlayerPosition(args.botId, boss.x + (dx / length) * 14, boss.z + (dz / length) * 14);
      multi.setPlayerPosition(args.localId, boss.x + (dx / length) * 7, boss.z + (dz / length) * 7);
      multi.setHealth(args.localId, 120);
      return drift;
    }, { botId, localId });
    // The first reading predates the first pin, so it measures nothing.
    if (i > 0) worstOffLane = Math.max(worstOffLane, offLane);
    await advanceMs(page, 100);
  }
  expect(worstOffLane).toBeLessThan(1);
  expect(await fireCount()).toBe(bossBefore);
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

test("a bot steps out of the Bell Ringer's sweep and keeps shooting on the way", async ({ page }) => {
  await bootLobby(page);
  await findPublicMatch(page);
  const bots = await startBackfillMatch(page);
  await page.evaluate(() => {
    window.__dustAndDeadTest.clearEnemies();
    window.__dustAndDeadTest.forceWaveState(10, 0, 0, "bellRinger");
  });
  await advanceMs(page, 500);

  // Park the bot inside the sweep — the disc the Bell Ringer's own attack
  // picker chooses against anybody within 6.35 — with a zombie to shoot so the
  // "keep firing while leaving" half of this is measurable.
  const staged = await page.evaluate((botId) => {
    const multi = window.__dustMultiplayerTest;
    const boss = window.__dustAndDeadTest.getBellRingerDiagnostics().bossPosition;
    multi.setPlayerPosition(botId, boss.x + 3, boss.z);
    multi.spawnEnemyAt(boss.x + 9, boss.z + 2, "walker", 4000);
    window.__dustAndDeadTest.forceBellRingerAction("sweep");
    const bot = multi.getBackfillBotDiagnostics().find((entry) => entry.id === botId);
    return {
      action: window.__dustAndDeadTest.getBellRingerDiagnostics().action,
      distance: Math.hypot(bot.x - boss.x, bot.z - boss.z),
      fired: bot.lastFireActionSequence,
    };
  }, bots[0].id);
  expect(staged.action).toBe("sweepWindup");
  expect(staged.distance).toBeLessThan(4);

  await advanceMs(page, 600);
  const escaped = await page.evaluate((botId) => {
    const multi = window.__dustMultiplayerTest;
    const boss = window.__dustAndDeadTest.getBellRingerDiagnostics().bossPosition;
    const bot = multi.getBackfillBotDiagnostics().find((entry) => entry.id === botId);
    return {
      distance: Math.hypot(bot.x - boss.x, bot.z - boss.z),
      fired: bot.lastFireActionSequence,
      alive: bot.alive,
    };
  }, bots[0].id);
  // Out of the 6.6 disc (the resolver adds the player's own radius on top).
  expect(escaped.distance).toBeGreaterThan(7.4);
  // And it did not stop being a player while doing it.
  expect(escaped.fired).toBeGreaterThan(staged.fired);
  expect(escaped.alive).toBe(true);
});

test("a bot leaves the ground slam sideways instead of running down it", async ({ page }) => {
  await bootLobby(page);
  await findPublicMatch(page);
  const bots = await startBackfillMatch(page);
  await page.evaluate(() => {
    window.__dustAndDeadTest.clearEnemies();
    window.__dustAndDeadTest.forceWaveState(10, 0, 0, "bellRinger");
  });
  await advanceMs(page, 500);

  // Halfway down the lane, dead on its axis. The lane is 17 long and 3.6 to
  // each side: running along it is nine units of exposure, stepping across it
  // is four, and a bot with no shape model picked the long way out.
  const staged = await page.evaluate((botId) => {
    const multi = window.__dustMultiplayerTest;
    const game = window.__dustAndDeadTest;
    game.forceBellRingerAction("groundSlam");
    const bell = game.getBellRingerDiagnostics();
    const forwardX = Math.sin(bell.bossFacing);
    const forwardZ = Math.cos(bell.bossFacing);
    multi.setPlayerPosition(
      botId,
      bell.bossPosition.x + forwardX * 8,
      bell.bossPosition.z + forwardZ * 8
    );
    return {
      action: bell.action,
      facing: bell.bossFacing,
      bossX: bell.bossPosition.x,
      bossZ: bell.bossPosition.z,
    };
  }, bots[0].id);
  expect(staged.action).toBe("groundSlam");

  // The slam lands 0.899 s in, so this is the window the bot actually has.
  await advanceMs(page, 800);
  const moved = await page.evaluate((args) => {
    const bot = window.__dustMultiplayerTest.getBackfillBotDiagnostics()
      .find((entry) => entry.id === args.botId);
    const forwardX = Math.sin(args.staged.facing);
    const forwardZ = Math.cos(args.staged.facing);
    const dx = bot.x - args.staged.bossX;
    const dz = bot.z - args.staged.bossZ;
    return {
      along: dx * forwardX + dz * forwardZ,
      across: Math.abs(dx * forwardZ - dz * forwardX),
      alive: bot.alive,
    };
  }, { botId: bots[0].id, staged });

  // Clear of the lane's width, and by stepping out of it rather than by
  // sprinting to one of its ends.
  expect(moved.across).toBeGreaterThan(4.7);
  expect(moved.along).toBeGreaterThan(0);
  expect(moved.along).toBeLessThan(17);
  expect(moved.alive).toBe(true);
});
