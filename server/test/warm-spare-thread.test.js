"use strict";

// Warm spare threads: the manager keeps N booted-and-compiled idle threads so
// the first room after a quiet period skips the ~3.5 s cold half of a spawn.
// Pinned here: the spare exists after boot warmup, the first match lands ON
// the spare (not on a new cold thread), packing still prefers the fullest
// thread over an idle spare, the spare is replenished in the background, and
// warmSpareThreads=0 keeps the old fully-lazy behavior.

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

const { NodeGameWorkerManager } = require("../node-game-worker.js");

const ROOT = path.join(__dirname, "..", "..");

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
      setTimeout(poll, 50);
    };
    poll();
  });
}

function matchOptions(id) {
  return {
    matchId: id,
    startId: id,
    mapSeed: 313000 + id.length,
    players: [
      { id: "player-a", endpointId: "player-a", name: "Alpha" },
      { id: "player-b", endpointId: "player-b", name: "Bravo" },
    ],
    onPacket() {},
    onFatal(error) { throw error; },
  };
}

test("a warm spare is kept, used by the first match, and replenished", { timeout: 180000 }, async () => {
  const manager = new NodeGameWorkerManager({
    root: ROOT,
    maxMatches: 4,
    matchesPerWorker: 2,
    warmSpareThreads: 1,
    startupTimeoutMs: 90000,
    shutdownTimeoutMs: 10000,
    logLevel: "warn",
  });
  try {
    await manager.ensureBrowser();
    assert.equal(manager.threads.size, 1, "boot warmup must start exactly one spare");
    const spare = Array.from(manager.threads)[0];
    await waitFor(
      () => manager.readiness().idleThreads === 1,
      60000,
      "the spare to boot idle"
    );

    await manager.createMatch(matchOptions("warm-spare-first"));
    const firstThread = manager.get("warm-spare-first").thread;
    assert.equal(firstThread, spare, "the first match must land on the pre-warmed spare");
    await waitFor(
      () => manager.readiness().idleThreads === 1,
      60000,
      "a replacement spare to boot"
    );
    assert.equal(manager.threads.size, 2, "busy thread + one fresh spare");

    // Packing still wins over the spare: the second match shares the first
    // thread (matchesPerWorker=2) instead of waking the idle one.
    await manager.createMatch(matchOptions("warm-spare-second"));
    assert.equal(
      manager.get("warm-spare-second").thread,
      firstThread,
      "the second match must pack onto the fullest thread, not the spare"
    );
    assert.equal(manager.readiness().idleThreads, 1, "the spare must stay idle after packing");
  } finally {
    await manager.close();
  }
});

test("warmSpareThreads=0 keeps the old lazy behavior", { timeout: 120000 }, async () => {
  const manager = new NodeGameWorkerManager({
    root: ROOT,
    maxMatches: 1,
    warmSpareThreads: 0,
    startupTimeoutMs: 90000,
    shutdownTimeoutMs: 10000,
    logLevel: "warn",
  });
  try {
    await manager.ensureBrowser();
    assert.equal(manager.threads.size, 0, "no spares may exist when disabled");
    await manager.createMatch(matchOptions("lazy-only"));
    assert.equal(manager.threads.size, 1, "only the match's own thread may exist");
    assert.equal(manager.readiness().idleThreads, 0);
  } finally {
    await manager.close();
  }
});

test("spares never exceed remaining match capacity", { timeout: 120000 }, async () => {
  const manager = new NodeGameWorkerManager({
    root: ROOT,
    maxMatches: 1,
    matchesPerWorker: 1,
    warmSpareThreads: 1,
    startupTimeoutMs: 90000,
    shutdownTimeoutMs: 10000,
    logLevel: "warn",
  });
  try {
    await manager.ensureBrowser();
    assert.equal(manager.threads.size, 1, "one spare before the only slot is used");
    await manager.createMatch(matchOptions("full-capacity"));
    // The only match slot is taken: replenishing another spare would burn RAM
    // for a room that can never be admitted.
    assert.equal(manager.threads.size, 1, "no replacement spare at full capacity");
    await manager.closeMatch("full-capacity");
    await waitFor(
      () => manager.readiness().idleThreads === 1,
      60000,
      "a spare to return once capacity frees up"
    );
  } finally {
    await manager.close();
  }
});
