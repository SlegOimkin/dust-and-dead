"use strict";

// The dedicated authority runs in headless Chromium with no GPU. Drawing the
// scene there through SwiftShader once held it at ~11 fps, which starved the
// 15 Hz snapshot cadence and coarsened every remote input to one sample per
// ~90 ms frame — online play was measurably worse than a local host for reasons
// that had nothing to do with the network. These assertions keep the draw off.

const assert = require("node:assert/strict");
const http = require("node:http");
const test = require("node:test");

const { GameWorkerManager } = require("../game-worker.js");
const { createStaticHandler } = require("../static-handler.js");
const { decodeGameMessage, encodeGameMessage } = require("../wire.js");

const MATCH_ID = "authority-frame-rate";
// Four is the supported maximum and the authority's worst case: snapshots are
// built per viewer, so the outbound work scales with the roster.
const ROSTER = ["player-a", "player-b", "player-c", "player-d"];
const SAMPLE_MS = 4000;
// A local host targets 60 fps. Anything below this on the authority means the
// draw came back, or the simulation is being starved some other way.
const MIN_AUTHORITY_FPS = 40;
// Per viewer. The design cadence is 15 Hz; allow for sampling edges.
const MIN_SNAPSHOTS_PER_SECOND = 12;

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.removeListener("error", reject);
      resolve(server.address());
    });
  });
}

function closeServer(server) {
  return new Promise((resolve) => server.close(() => resolve()));
}

function sendInput(worker, endpointId, sequence) {
  const index = ROSTER.indexOf(endpointId);
  const angle = (index / ROSTER.length) * Math.PI * 2;
  worker.receiveWire(endpointId, encodeGameMessage({
    type: "input",
    matchId: MATCH_ID,
    lifeSequence: 1,
    sequence,
    // Fan the roster out so the per-viewer relevance scoping has to do real
    // work instead of resolving four overlapping camera rects.
    moveX: Number(Math.cos(angle).toFixed(3)),
    moveZ: Number(Math.sin(angle).toFixed(3)),
    aimAngle: angle,
    aimDistance: 10,
    px: Number((Math.cos(angle) * 3).toFixed(3)),
    pz: Number((Math.sin(angle) * 3).toFixed(3)),
  }), "input");
}

test(
  "the dedicated authority simulates at full rate and holds its snapshot cadence",
  { timeout: 120000 },
  async () => {
    const snapshots = [];
    const staticServer = http.createServer(createStaticHandler());
    const address = await listen(staticServer);
    const manager = new GameWorkerManager({
      baseUrl: "http://127.0.0.1:" + address.port,
      maxMatches: 1,
      startupTimeoutMs: 60000,
      shutdownTimeoutMs: 10000,
      logLevel: "warn",
    });

    try {
      const worker = await manager.createMatch({
        matchId: MATCH_ID,
        startId: MATCH_ID,
        mapSeed: 123456789,
        players: ROSTER.map((id, index) => ({ id, endpointId: id, name: "Player " + (index + 1) })),
        onPacket(packet) {
          const message = decodeGameMessage(packet.data);
          if (message && message.type === "snapshot") {
            snapshots.push({ endpointId: packet.endpointId, at: Date.now() });
          }
        },
        onFatal(error) { throw error; },
      });

      // Keep both players moving so the match cannot quietly end mid-sample.
      let sequence = 1;
      const inputTimer = setInterval(() => {
        sequence += 1;
        for (const endpointId of ROSTER) sendInput(worker, endpointId, sequence);
      }, 33);
      if (inputTimer && typeof inputTimer.unref === "function") inputTimer.unref();

      try {
        // Let the first wave settle so the sample covers real simulation load.
        await new Promise((resolve) => setTimeout(resolve, 6000));

        const startedAt = Date.now();
        const before = snapshots.length;
        const frames = await worker.page.evaluate(async (duration) => {
          let count = 0;
          const start = performance.now();
          const tick = () => { count += 1; requestAnimationFrame(tick); };
          requestAnimationFrame(tick);
          await new Promise((resolve) => setTimeout(resolve, duration));
          return { count, seconds: (performance.now() - start) / 1000 };
        }, SAMPLE_MS);
        const elapsedSeconds = (Date.now() - startedAt) / 1000;

        const fps = frames.count / frames.seconds;
        assert.ok(
          fps >= MIN_AUTHORITY_FPS,
          "authority ran at " + fps.toFixed(1) + " fps, expected at least " + MIN_AUTHORITY_FPS +
          " — the headless page is most likely drawing the scene again"
        );

        const sampled = snapshots.slice(before);
        for (const endpointId of ROSTER) {
          const perSecond = sampled.filter((entry) => entry.endpointId === endpointId).length / elapsedSeconds;
          assert.ok(
            perSecond >= MIN_SNAPSHOTS_PER_SECOND,
            endpointId + " received " + perSecond.toFixed(1) + " snapshots/s, expected at least " +
            MIN_SNAPSHOTS_PER_SECOND
          );
        }

        // The simulation must be keeping up with wall clock, not dropping time.
        const timing = await worker.page.evaluate(() => {
          const api = window.__dustAndDeadTest;
          return api.getFrameTimingDiagnostics();
        });
        assert.equal(timing.backlogDropReason, "");
      } finally {
        clearInterval(inputTimer);
      }
    } finally {
      await manager.close();
      await closeServer(staticServer);
    }
  }
);
