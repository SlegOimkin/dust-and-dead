"use strict";

// Combat integrity over the online transport, under boss load. The dedicated
// authority runs the match with NO local player, so every shot, kill and pickup
// travels the remote-player code path — the one a local host only uses for its
// guests. These assertions cover the failure modes that would be invisible in
// the local-multiplayer specs:
//   - fire actions rejected or piling up unprocessed
//   - a reload that never completes (players stuck unable to shoot)
//   - kills not credited, or credited to the wrong player
//   - the authority stalling once a boss and hundreds of enemies are live

const assert = require("node:assert/strict");
const test = require("node:test");
const { chromium } = require("playwright");

const { createOnlineApplication } = require("../app.js");

const CODE = "COMBAT-E2E";
// This probe co-hosts two software-WebGL browser clients with the authority on
// one machine — production never does that. Isolated the authority holds ~60 fps
// at 542 enemies; under this probe's contention it can dip while `dropReason`
// stays empty (no simulation time lost), which is the real quality gate
// together with the shot/kill/reload assertions below.
const MIN_AUTHORITY_FPS = 30;
// A revolver reload is well under a second. Anything past this is the stuck
// reload that would leave a player permanently unable to fire.
const MAX_HEALTHY_RELOAD_S = 3;
// Shots in flight at the instant of a sample. Anything beyond this is a backlog
// the authority is not keeping up with.
const MAX_FIRE_BACKLOG = 5;

async function openClient(browser, url, name) {
  const context = await browser.newContext({
    viewport: { width: 320, height: 200 },
    reducedMotion: "reduce",
  });
  // The shipped online-config points every client at the production server.
  // Integration clients must resolve same-origin back to the app under test,
  // and the lock survives both reloads and online-config.js reassigning it.
  await context.addInitScript(() => {
    const testConfig = Object.freeze({ url: "", path: "/online", reconnect: true, botBackfill: false });
    Object.defineProperty(window, "DustAndDeadOnlineConfig", {
      configurable: false,
      get() { return testConfig; },
      set() {},
    });
  });
  const page = await context.newPage();
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.__dustOnlineTest);
  await page.keyboard.press("KeyM");
  await page.locator("#online-multiplayer-btn").click();
  await page.locator("#online-multiplayer-player-name").fill(name);
  await page.locator("#online-multiplayer-search-code").fill(CODE);
  await page.locator("#online-matchmaking-find-btn").click();
  return { context, page, name };
}

const readCombat = () => {
  const mp = window.__dustMultiplayerTest.getState();
  const objects = window.__dustAndDeadTest.getThreeObjectDiagnostics();
  const timing = window.__dustAndDeadTest.getFrameTimingDiagnostics();
  return {
    enemies: objects.state.enemies,
    dropReason: timing.backlogDropReason,
    players: mp.players.map((player) => ({
      id: player.id,
      alive: player.alive,
      kills: player.zombieKills,
      points: player.points,
      fireSent: player.lastFireActionSequence,
      fireProcessed: player.lastProcessedFireActionSequence,
      firePending: player.pendingFireActions,
      rejected: (player.pendingFireResults || []).filter((result) => !result.accepted).length,
      reload: player.progression
        ? Math.max(
          0,
          ...Object.keys(player.progression.reloadTimers || {})
            .map((key) => Number(player.progression.reloadTimers[key]) || 0)
        )
        : 0,
    })),
  };
};

const sampleFps = async (duration) => {
  let count = 0;
  const start = performance.now();
  const tick = () => { count += 1; requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  await new Promise((resolve) => setTimeout(resolve, duration));
  return count / ((performance.now() - start) / 1000);
};

test(
  "online combat keeps shots, kills and reloads healthy through a boss wave",
  { timeout: 300000 },
  async () => {
    const application = createOnlineApplication({
      host: "127.0.0.1",
      port: 0,
      log: false,
      config: {
        allowedOrigins: [],
        maxMatches: 1,
        startAckTimeoutMs: 30000,
        reconnectGraceMs: 15000,
        heartbeatIntervalMs: 60000,
        resumeTokenSecret: "online-combat-integrity-secret",
        workerStartupTimeoutMs: 90000,
        workerShutdownTimeoutMs: 10000,
      },
    });
    let browser = null;
    const clients = [];
    let aimTimer = null;
    try {
      const address = await application.start();
      browser = await chromium.launch({
        headless: true,
        args: [
          "--disable-background-timer-throttling",
          "--disable-backgrounding-occluded-windows",
          "--disable-renderer-backgrounding",
        ],
      });
      clients.push(await openClient(browser, address.httpUrl + "/", "Combat Alpha"));
      clients.push(await openClient(browser, address.httpUrl + "/", "Combat Bravo"));

      await Promise.all(clients.map(({ page }) => page.waitForFunction(() => {
        const state = window.__dustOnlineTest.getState();
        return state.room && state.room.players && state.room.players.length === 2;
      }, null, { timeout: 90000 })));
      await Promise.all(clients.map(({ page }) => page.locator("#online-multiplayer-ready-btn").click()));
      await Promise.all(clients.map(({ page }) => page.waitForFunction(
        () => window.__dustOnlineTest.getState().phase === "match",
        null,
        { timeout: 150000 }
      )));

      const matchId = await clients[0].page.evaluate(
        () => window.__dustOnlineTest.getState().room.matchId
      );
      const worker = application.workerManager.get(matchId);
      assert.ok(worker, "the match worker must be running");

      // Boss immediately, while both players are alive and fully stocked.
      await worker.page.evaluate(() => window.__dustAndDeadTest.startWaveNow(10));

      // The pointer must stay off the player's own screen position or the aim
      // direction degenerates and every shot misses.
      for (const client of clients) {
        await client.page.mouse.move(290, 100);
        await client.page.mouse.down();
      }
      let aim = 0;
      aimTimer = setInterval(() => {
        aim += 0.4;
        const x = 160 + Math.cos(aim) * 130;
        const y = 100 + Math.sin(aim) * 80;
        for (const client of clients) client.page.mouse.move(x, y).catch(() => {});
      }, 200);

      let worstReload = 0;
      let worstFps = Infinity;
      let peakEnemies = 0;
      let killsByPlayer = null;
      let mirrored = false;
      for (let round = 0; round < 5; round += 1) {
        const fps = await worker.page.evaluate(sampleFps, 1200);
        const authority = await worker.page.evaluate(readCombat);
        worstFps = Math.min(worstFps, fps);
        peakEnemies = Math.max(peakEnemies, authority.enemies);
        killsByPlayer = authority.players.map((player) => player.kills);

        assert.equal(
          authority.dropReason,
          "",
          "the authority must not drop simulation time under boss load"
        );
        for (const player of authority.players) {
          assert.equal(
            player.rejected,
            0,
            player.id + " had " + player.rejected + " rejected shots"
          );
          // A shot in flight is normal; an unbounded or growing backlog is the
          // failure. The drain-to-zero check after fire stops is below.
          const backlog = player.fireSent - player.fireProcessed;
          assert.ok(
            backlog >= 0 && backlog <= MAX_FIRE_BACKLOG,
            player.id + " has a fire backlog of " + backlog
          );
          assert.ok(
            player.firePending <= MAX_FIRE_BACKLOG,
            player.id + " has " + player.firePending + " queued fire actions"
          );
          worstReload = Math.max(worstReload, player.reload);
          assert.ok(
            player.reload <= MAX_HEALTHY_RELOAD_S,
            player.id + " is stuck reloading for " + player.reload.toFixed(2) + "s"
          );
        }
        // Kill credit must reach every guest. Checked mid-fight and monotonically:
        // the totals keep climbing while fire is live, so "at least what the
        // authority already had" is the only stable equality.
        if (!mirrored && authority.players.every((player) => player.kills > 0)) {
          const expected = authority.players.map((player) => ({
            id: player.id,
            kills: player.kills,
            points: player.points,
          }));
          for (const client of clients) {
            await client.page.waitForFunction((want) => {
              const state = window.__dustMultiplayerTest.getState();
              return want.every((entry) => {
                const mirror = state.players.find((player) => player.id === entry.id);
                // The raw test API exposes zombieKills; `kills` is this file's
                // own shorthand and does not exist on that object.
                return mirror && mirror.zombieKills >= entry.kills && mirror.points >= entry.points;
              });
            }, expected, { timeout: 20000 });
          }
          mirrored = true;
        }
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
      assert.equal(mirrored, true, "no sample ever had both players scoring, so kill mirroring went unchecked");

      assert.ok(
        worstFps >= MIN_AUTHORITY_FPS,
        "authority fell to " + worstFps.toFixed(1) + " fps under boss load"
      );
      assert.ok(peakEnemies > 100, "the boss wave must actually load the authority, saw " + peakEnemies);

      clearInterval(aimTimer);
      aimTimer = null;
      for (const client of clients) await client.page.mouse.up().catch(() => {});

      // With fire stopped the queue must drain completely. A shot that is never
      // processed is the bug this guards; a shot in flight is not.
      await worker.page.waitForFunction(() => {
        const state = window.__dustMultiplayerTest.getState();
        return state.players.every((player) => (
          player.lastFireActionSequence === player.lastProcessedFireActionSequence &&
          !player.pendingFireActions
        ));
      }, null, { timeout: 20000 });

      // Both players must be scoring: a kill-credit bug typically starves one.
      const authority = await worker.page.evaluate(readCombat);
      const totalKills = authority.players.reduce((sum, player) => sum + player.kills, 0);
      assert.ok(totalKills > 0, "no kills were credited at all");
      assert.equal(
        authority.players.every((player) => player.kills > 0),
        true,
        "every shooter must be credited, got " + JSON.stringify(killsByPlayer)
      );
    } finally {
      if (aimTimer) clearInterval(aimTimer);
      for (const client of clients) await client.context.close().catch(() => {});
      if (browser) await browser.close().catch(() => {});
      await application.close().catch(() => {});
    }
  }
);
