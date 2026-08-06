"use strict";

// A stalled online client must be SUSPENDED by the authority's backpressure
// guard, not surrendered: the server may still be inside its reconnect grace,
// promising that client a rejoin. These tests pin the whole recovery contract:
// suspension stops delivery but keeps the seat, an input heartbeat or a
// worker.reconnect restores it, and the enemy stream restarts from a keyframe
// because the shared event queue may have pruned past the absent viewer.
// Also pinned: the worker delivery bridge coalesces input to one in-flight
// RPC per endpoint and never drops reliable one-shot actions (revive!) at the
// input cap.

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

const { NodeGameWorkerManager, NodeMatchWorker } = require("../node-game-worker.js");
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function inputMessage(matchId, sequence, px) {
  return encodeGameMessage({
    type: "input",
    matchId,
    lifeSequence: 0,
    sequence,
    moveX: 0.4,
    moveZ: 0.1,
    aimAngle: 1,
    aimDistance: 10,
    px: px == null ? 0 : px,
    pz: 0,
  });
}

test("backpressure suspends instead of surrendering; heartbeat and reconnect both recover with a keyframe", { timeout: 120000 }, async () => {
  const matchId = "suspend-resume-test";
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
      matchId,
      startId: matchId,
      mapSeed: 777123,
      players: [
        { id: "player-a", endpointId: "player-a", name: "Alpha" },
        { id: "player-b", endpointId: "player-b", name: "Bravo" },
      ],
      onPacket(packet) {
        packets.push({
          at: Date.now(),
          endpointId: packet.endpointId,
          message: decodeGameMessage(packet.data),
        });
      },
      onFatal(error) {
        throw error;
      },
    });

    worker.receiveWire("player-a", inputMessage(matchId, 1, -3), "input");
    worker.receiveWire("player-b", inputMessage(matchId, 1, 3), "input");
    await waitFor(() => {
      const seen = new Set(
        packets.filter((p) => p.message && p.message.type === "snapshot").map((p) => p.endpointId)
      );
      return seen.has("player-a") && seen.has("player-b");
    }, 20000, "initial snapshots for both players");

    // 1. The manufactured stall must suspend, not surrender: alive, mapped,
    //    just no longer connected for delivery.
    const stalled = await worker.page.evaluate(
      () => window.__dustMultiplayerTest.forceClientBackpressureStallForTest("player-b")
    );
    assert.equal(stalled.connected, false, "delivery must stop for the stalled client");
    assert.ok(stalled.deliverySuspendedAt > 0, "the suspension must be stamped");
    assert.equal(stalled.alive, true, "a suspended player must NOT be killed");
    assert.equal(stalled.surrendered, false, "a suspended player must NOT be surrendered");
    assert.equal(stalled.endpointMapped, true, "the endpoint mapping worker.reconnect resolves through must survive");

    // 2. Snapshots keep flowing to the healthy player and stop for the
    //    suspended one.
    const cutoff = Date.now();
    await sleep(700);
    const after = packets.filter((p) => p.at > cutoff && p.message && p.message.type === "snapshot");
    assert.ok(after.some((p) => p.endpointId === "player-a"), "the healthy player must keep receiving snapshots");
    assert.equal(
      after.filter((p) => p.endpointId === "player-b").length,
      0,
      "the suspended player must receive nothing"
    );

    // 3. An input heartbeat from the stalled client proves it is back:
    //    delivery resumes and the enemy stream restarts from a keyframe.
    const resumeCutoff = Date.now();
    worker.receiveWire("player-b", inputMessage(matchId, 2, 3), "input");
    await waitFor(() => packets.some(
      (p) => p.at > resumeCutoff && p.endpointId === "player-b" && p.message && p.message.type === "snapshot"
    ), 10000, "snapshots to resume after the heartbeat");
    const resumed = await worker.page.evaluate(
      () => window.__dustMultiplayerTest.getEndpointDeliveryStateForTest("player-b")
    );
    assert.equal(resumed.connected, true, "the heartbeat must restore delivery");
    assert.equal(resumed.deliverySuspendedAt, 0, "the suspension stamp must clear");
    const firstResumed = packets.find(
      (p) => p.at > resumeCutoff && p.endpointId === "player-b" && p.message && p.message.type === "snapshot"
    );
    assert.ok(firstResumed.message.enemyDelta, "the resumed snapshot must carry the enemy section");
    assert.equal(firstResumed.message.enemyDelta.k, 1, "the resumed enemy stream must restart from a keyframe");

    // 4. The same recovery must work through the server's rejoin path:
    //    suspend again, then worker.reconnect as a reloaded page.
    const stalledAgain = await worker.page.evaluate(
      () => window.__dustMultiplayerTest.forceClientBackpressureStallForTest("player-b")
    );
    assert.equal(stalledAgain.connected, false, "the second stall must suspend again");
    const reconnected = await worker.reconnect("player-b", true);
    assert.equal(reconnected, true, "reconnect must succeed against a suspended (never surrendered) seat");
    const reconnectCutoff = Date.now();
    await waitFor(() => packets.some(
      (p) => p.at > reconnectCutoff && p.endpointId === "player-b" && p.message && p.message.type === "snapshot"
    ), 10000, "snapshots to resume after reconnect");
    const firstReconnected = packets.find(
      (p) => p.at > reconnectCutoff && p.endpointId === "player-b" && p.message && p.message.type === "snapshot"
    );
    assert.equal(firstReconnected.message.enemyDelta.k, 1, "a fresh rejoin must restart the enemy stream from a keyframe");
  } finally {
    await manager.close();
  }
});

test("worker bridge coalesces input to one in-flight RPC per endpoint and never drops reliable actions at the input cap", async () => {
  const manager = { startupTimeoutMs: 5000, shutdownTimeoutMs: 1000, logLevel: "warn" };
  const worker = new NodeMatchWorker(manager, { matchId: "bridge-test" });
  const calls = [];
  const resolvers = [];
  worker.thread = {
    destroyed: false,
    rpc(kind, workerMatchId, fields) {
      calls.push({ kind, fields });
      return new Promise((resolve) => resolvers.push(resolve));
    },
  };
  worker.ready = true;

  // 30 Hz worth of input arriving while the match thread never answers must
  // collapse to exactly ONE in-flight input RPC carrying the freshest sample.
  for (let i = 1; i <= 50; i++) {
    worker.receiveWire("endpoint-1", "input-" + i, "input");
  }
  await new Promise((resolve) => setImmediate(resolve));
  const inFlight = calls.filter((c) => c.kind === "wire" && c.fields.latestKind === "input");
  assert.equal(inFlight.length, 1, "only one input may be in flight per endpoint");
  assert.equal(inFlight[0].fields.data, "input-50", "the pre-flush storm coalesces to the freshest sample");

  // More input while one is in flight keeps coalescing instead of stacking.
  for (let i = 51; i <= 60; i++) {
    worker.receiveWire("endpoint-1", "input-" + i, "input");
  }
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(
    calls.filter((c) => c.kind === "wire" && c.fields.latestKind === "input").length,
    1,
    "input arriving mid-flight must wait behind the in-flight one"
  );

  // When the thread finally answers, the NEWEST coalesced sample follows.
  resolvers.shift()(true);
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  const secondWave = calls.filter((c) => c.kind === "wire" && c.fields.latestKind === "input");
  assert.equal(secondWave.length, 2, "the coalesced sample must follow the resolved one");
  assert.equal(secondWave[1].fields.data, "input-60", "only the freshest coalesced sample is sent");

  // A saturated in-flight window (a genuinely stalled thread) drops input...
  worker.pendingDeliveries = 256;
  worker.receiveWire("endpoint-2", "input-drop", "input");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(worker.droppedDeliveries, 1, "input beyond the cap is dropped");
  assert.ok(
    !calls.some((c) => c.fields.data === "input-drop"),
    "the dropped input must not reach the thread"
  );

  // ...but a one-shot reliable action (a revive decision) still goes through.
  const before = calls.length;
  worker.receiveWire("endpoint-2", "decision-revive", "");
  assert.equal(calls.length, before + 1, "reliable actions bypass the input cap");
  assert.equal(calls[calls.length - 1].fields.data, "decision-revive");
  assert.equal(worker.droppedDeliveries, 1, "the reliable action must not count as dropped");

  // The reliable path still has its own absurd-overload backstop.
  worker.pendingDeliveries = 4096;
  worker.receiveWire("endpoint-2", "decision-late", "");
  assert.equal(worker.droppedDeliveries, 2, "the hard reliable bound still exists");

  worker.pendingDeliveries = 0;
  worker.closed = true;
});
