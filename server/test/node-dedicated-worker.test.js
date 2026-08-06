"use strict";

// The Node-hosted match worker must satisfy the same contract the browser
// worker satisfies: own the match, accept wire input, emit per-player
// snapshots, expose state, and honor page.evaluate for diagnostics.

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

const { NodeGameWorkerManager } = require("../node-game-worker.js");
const { decodeGameMessage, encodeGameMessage } = require("../wire.js");

function waitFor(predicate, timeoutMs, description) {
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    const poll = () => {
      const result = predicate();
      if (result) {
        resolve(result);
        return;
      }
      if (Date.now() - startedAt >= timeoutMs) {
        reject(new Error("Timed out waiting for " + description));
        return;
      }
      setTimeout(poll, 25);
    };
    poll();
  });
}

test("node-hosted worker owns the match and emits per-player snapshots", { timeout: 90000 }, async () => {
  const packets = [];
  const manager = new NodeGameWorkerManager({
    root: path.join(__dirname, "..", ".."),
    maxMatches: 1,
    startupTimeoutMs: 60000,
    shutdownTimeoutMs: 10000,
    logLevel: "warn",
  });

  try {
    const worker = await manager.createMatch({
      matchId: "node-authority-test",
      startId: "node-authority-test",
      mapSeed: 123456789,
      players: [
        { id: "player-a", endpointId: "player-a", name: "Alpha" },
        { id: "player-b", endpointId: "player-b", name: "Bravo" },
      ],
      onPacket(packet) {
        packets.push({
          endpointId: packet.endpointId,
          message: decodeGameMessage(packet.data),
        });
      },
      onFatal(error) {
        throw error;
      },
    });

    const state = await worker.state();
    assert.equal(state.dedicatedAuthority, true);
    assert.equal(state.role, "host");
    assert.equal(state.transportKind, "dedicated");
    assert.equal(state.matchId, "node-authority-test");
    assert.equal(state.players.length, 2);

    for (const endpointId of ["player-a", "player-b"]) {
      worker.receiveWire(endpointId, encodeGameMessage({
        type: "input",
        matchId: "node-authority-test",
        lifeSequence: 1,
        sequence: 1,
        moveX: endpointId === "player-a" ? 1 : -1,
        moveZ: 0,
        aimAngle: 0,
        aimDistance: 10,
        px: endpointId === "player-a" ? -3 : 3,
        pz: 0,
      }), "input");
    }

    await waitFor(() => {
      const snapshotEndpoints = new Set(
        packets.filter((packet) => packet.message && packet.message.type === "snapshot")
          .map((packet) => packet.endpointId)
      );
      return snapshotEndpoints.size === 2 && snapshotEndpoints;
    }, 15000, "authoritative snapshots for both players");

    const snapshots = packets.filter((packet) => packet.message && packet.message.type === "snapshot");
    assert.ok(snapshots.some((packet) => packet.endpointId === "player-a"));
    assert.ok(snapshots.some((packet) => packet.endpointId === "player-b"));
    assert.ok(snapshots.every((packet) => packet.message.matchId === "node-authority-test"));

    // The Playwright-compatible evaluate shim must reach the game's realm.
    // The first wave takes a few seconds of intro before enemies spawn.
    const enemyDeadline = Date.now() + 20000;
    let enemies = 0;
    while (Date.now() < enemyDeadline) {
      enemies = await worker.page.evaluate(
        () => window.__dustAndDeadTest.getThreeObjectDiagnostics().state.enemies
      );
      if (enemies > 0) break;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    assert.ok(enemies > 0, "the wave must have spawned enemies, saw " + enemies);
    const fps = await worker.page.evaluate(async (duration) => {
      let count = 0;
      const start = performance.now();
      const tick = () => { count += 1; requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
      await new Promise((resolve) => setTimeout(resolve, duration));
      return count / ((performance.now() - start) / 1000);
    }, 2000);
    assert.ok(fps >= 40, "the frame driver must hold the loop near 60 fps, got " + fps.toFixed(1));
  } finally {
    await manager.close();
  }
});
