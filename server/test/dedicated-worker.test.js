"use strict";

const assert = require("node:assert/strict");
const http = require("node:http");
const test = require("node:test");

const { GameWorkerManager } = require("../game-worker.js");
const { createStaticHandler } = require("../static-handler.js");
const { decodeGameMessage, encodeGameMessage } = require("../wire.js");

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

test("dedicated browser worker owns the match and emits per-player snapshots", { timeout: 90000 }, async () => {
  const packets = [];
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
      matchId: "authority-test",
      startId: "authority-test",
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
    assert.equal(state.matchId, "authority-test");
    assert.equal(state.players.length, 2);

    for (const endpointId of ["player-a", "player-b"]) {
      worker.receiveWire(endpointId, encodeGameMessage({
        type: "input",
        matchId: "authority-test",
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
    assert.ok(snapshots.every((packet) => packet.message.matchId === "authority-test"));
  } finally {
    await manager.close();
    await closeServer(staticServer);
  }
});
