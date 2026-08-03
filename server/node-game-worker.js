"use strict";

// Node-hosted match workers: the drop-in replacement for the Chromium-based
// GameWorkerManager in game-worker.js. Same public surface — createMatch, get,
// closeMatch, close, readiness, and per-worker receiveWire/disconnect/
// reconnect/state/close plus a `page.evaluate` shim — so the online server and
// the whole existing test suite run unchanged on either runtime.
//
// Matches are hosted in worker threads. By default each match owns a thread
// (full crash isolation, one core per match). MATCHES_PER_WORKER lets an
// operator pack several matches into one thread: they then share the ~50 MB
// per-isolate cost of parsed game.js + jsdom, at the price of sharing a heap
// cap and a single core.

const path = require("node:path");
const { Worker } = require("node:worker_threads");

const { loadAuthorityBundle } = require("./node-worker/environment.js");

// Same bound as the browser worker: how many input deliveries may be in
// flight to the match before the newest is dropped instead of queued. Inputs
// are additionally gated to one in-flight per endpoint (the newest sample
// coalesces while one is on the wire), so this cap is a backstop, not a
// working limit.
const MAX_PENDING_DELIVERIES = 256;
// Reliable (non-input) client messages — startAck, revive/surrender
// decisions, progression choices, return-to-lobby — are rare, small, and sent
// exactly once by the client, so they are never dropped at the input cap; a
// one-shot revive decision silently discarded under load auto-surrenders the
// player 15 s later. This hard bound only guards against a wedged match
// accumulating promises without limit (the watchdog kills it first).
const MAX_PENDING_RELIABLE_DELIVERIES = 4096;
// A wedged game loop stops answering RPCs but never throws; the watchdog turns
// that silence into the normal fatal path so the match slot is reclaimed
// instead of holding a thread and its heap forever.
const WATCHDOG_INTERVAL_MS = 20000;
const WATCHDOG_TIMEOUT_MS = 15000;

function withTimeout(promise, timeoutMs, message) {
  let timer = null;
  const timeout = new Promise((resolve, reject) => {
    timer = setTimeout(() => reject(new Error(message || "operation_timed_out")), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// One worker thread hosting up to manager.matchesPerWorker match environments.
class AuthorityThread {
  constructor(manager) {
    this.manager = manager;
    this.matches = new Map(); // matchId -> NodeMatchWorker
    this.pendingSpawns = 0;
    this.requests = new Map();
    this.nextRequestId = 1;
    this.stopResolvers = [];
    this.destroyed = false;
    this.bootResolve = null;
    this.bootReject = null;
    this.bootPromise = new Promise((resolve, reject) => {
      this.bootResolve = resolve;
      this.bootReject = reject;
    });
    // The boot rejection is always consumed by whichever createMatch awaits it;
    // an idle thread failing at boot must not crash the process.
    this.bootPromise.catch(() => {});
    this.worker = new Worker(path.join(__dirname, "node-worker", "match-thread.js"), {
      workerData: { root: manager.root },
      // A thread that leaks or is fed a pathological wave must die alone: the
      // cap turns unbounded growth into this thread's exit (surfaced through
      // onFatal), never the whole node's OOM kill. Scaled by how many matches
      // may legitimately share this heap.
      resourceLimits: {
        maxOldGenerationSizeMb: manager.workerMaxOldHeapMb * manager.matchesPerWorker,
      },
    });
    this.worker.unref();
    this.worker.on("message", (message) => this.handleMessage(message));
    this.worker.on("error", (error) => {
      if (this.bootReject) {
        const reject = this.bootReject;
        this.bootResolve = null;
        this.bootReject = null;
        reject(error);
      }
      this.failAllMatches(error);
    });
    this.worker.on("exit", (code) => {
      for (const pending of this.requests.values()) {
        pending.reject(new Error("authority_thread_exited"));
      }
      this.requests.clear();
      for (const resolve of this.stopResolvers.splice(0)) resolve();
      if (this.bootReject) {
        const reject = this.bootReject;
        this.bootResolve = null;
        this.bootReject = null;
        reject(new Error("authority_thread_exited:" + code));
      }
      if (!this.destroyed) {
        this.destroyed = true;
        this.manager.threads.delete(this);
        this.failAllMatches(new Error("authority_thread_exited:" + code));
        this.manager.ensureWarmSpares();
      }
    });
  }

  hasCapacity() {
    return !this.destroyed
      && this.matches.size + this.pendingSpawns < this.manager.matchesPerWorker;
  }

  failAllMatches(error) {
    const workers = Array.from(this.matches.values());
    this.matches.clear();
    for (const worker of workers) {
      if (!worker.closed) worker.onFatal(error);
    }
  }

  handleMessage(message) {
    if (!message || typeof message !== "object") return;
    if (message.type === "boot") {
      if (this.bootResolve) {
        const resolve = this.bootResolve;
        this.bootResolve = null;
        this.bootReject = null;
        resolve();
      }
      return;
    }
    if (message.type === "packet") {
      const worker = this.matches.get(String(message.matchId || ""));
      if (worker && !worker.closed) worker.onPacket(message.packet);
      return;
    }
    if (message.type === "reply") {
      const pending = this.requests.get(message.id);
      if (!pending) return;
      this.requests.delete(message.id);
      if (message.ok) pending.resolve(message.result);
      else pending.reject(new Error(message.error || "worker_request_failed"));
      return;
    }
    if (message.type === "fatal") {
      const matchId = String(message.matchId || "");
      const error = new Error(message.error || "authority_thread_failed");
      if (matchId) {
        const worker = this.matches.get(matchId);
        if (worker && !worker.closed) worker.onFatal(error);
      } else {
        // Unattributable throw (a shared timer, an OOM warning): every match
        // hosted on this thread is compromised.
        this.failAllMatches(error);
      }
      return;
    }
    if (message.type === "console") {
      if (this.manager.logLevel === "debug") {
        process.stderr.write(
          "[match " + String(message.matchId || "?") + "] " + message.kind + ": " + message.text + "\n"
        );
      }
      return;
    }
    if (message.type === "stopped") {
      for (const resolve of this.stopResolvers.splice(0)) resolve();
    }
  }

  rpc(kind, matchId, fields, timeoutMs) {
    if (this.destroyed) return Promise.reject(new Error("worker_closed"));
    const id = this.nextRequestId;
    this.nextRequestId += 1;
    const request = new Promise((resolve, reject) => {
      this.requests.set(id, { resolve, reject });
    });
    this.worker.postMessage(Object.assign({ type: "request", id, kind, matchId }, fields || {}));
    return timeoutMs
      ? withTimeout(request, timeoutMs, kind + "_timed_out").finally(() => this.requests.delete(id))
      : request;
  }

  // Graceful stop of the whole thread; used by manager.close() and when the
  // last match leaves. Safe to call more than once.
  async destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.manager.threads.delete(this);
    const stopped = new Promise((resolve) => this.stopResolvers.push(resolve));
    try {
      this.worker.postMessage({ type: "stop" });
    } catch (error) {
      // The thread is already gone; terminate below is the cleanup.
    }
    await withTimeout(stopped, this.manager.shutdownTimeoutMs, "worker_close_timeout").catch(() => {});
    await this.worker.terminate().catch(() => {});
  }
}

class NodeMatchWorker {
  constructor(manager, options) {
    const settings = options || {};
    this.manager = manager;
    this.id = String(settings.matchId || settings.startId || "");
    this.options = settings;
    this.onPacket = typeof settings.onPacket === "function" ? settings.onPacket : function () {};
    this.onFatal = typeof settings.onFatal === "function" ? settings.onFatal : function () {};
    this.thread = null;
    this.closed = false;
    this.ready = false;
    this.pendingInputs = new Map();
    this.inputsInFlight = new Set();
    this.inputFlushScheduled = false;
    this.pendingDeliveries = 0;
    this.droppedDeliveries = 0;
    this.watchdogTimer = null;
    this.startedAt = 0;
    // Playwright-compatible view of the match page for tests and probes.
    this.page = {
      evaluate: (fn, argument) => this.rpc("evaluate", {
        source: typeof fn === "function" ? fn.toString() : String(fn),
        argument,
      }, this.manager.startupTimeoutMs),
      // Same shape as Playwright's: poll the predicate inside the match realm
      // until it returns truthy, then resolve with that value.
      waitForFunction: async (fn, argument, options) => {
        const timeoutMs = Math.max(1, Number(options && options.timeout) || 30000);
        const deadline = Date.now() + timeoutMs;
        for (;;) {
          const value = await this.page.evaluate(fn, argument);
          if (value) return value;
          if (Date.now() >= deadline) throw new Error("waitForFunction_timed_out");
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
      },
    };
  }

  rpc(kind, fields, timeoutMs) {
    if (this.closed || !this.thread) {
      return Promise.reject(new Error("worker_closed"));
    }
    return this.thread.rpc(kind, this.id, fields, timeoutMs);
  }

  async start() {
    // Validates the deployment once in the parent (a broken bundle fails
    // here, before a thread exists); threads read the same files from disk
    // themselves so the 7 MB of sources is never structured-cloned per match.
    await this.manager.ensureBundle();
    const thread = this.manager.acquireThread();
    this.thread = thread;
    thread.pendingSpawns += 1;
    try {
      await withTimeout(thread.bootPromise, this.manager.startupTimeoutMs, "authoritative_runtime_timeout");
      await thread.rpc("spawn", this.id, { mapSeed: this.options.mapSeed }, this.manager.startupTimeoutMs);
    } finally {
      thread.pendingSpawns = Math.max(0, thread.pendingSpawns - 1);
    }
    thread.matches.set(this.id, this);
    const result = await this.rpc("start", {
      settings: {
        matchId: this.options.matchId,
        startId: this.options.startId,
        mapSeed: this.options.mapSeed,
        players: this.options.players,
      },
    }, this.manager.startupTimeoutMs);
    const expectedMatchId = String(this.options.startId || this.options.matchId || "");
    if (!result || !result.ready || result.matchId !== expectedMatchId) {
      throw new Error("authoritative_runtime_rejected_match");
    }
    this.ready = true;
    this.startedAt = Date.now();
    this.startWatchdog();
    return result;
  }

  startWatchdog() {
    this.watchdogTimer = setInterval(() => {
      if (this.closed || !this.thread) return;
      this.rpc("state", {}, WATCHDOG_TIMEOUT_MS).catch((error) => {
        if (this.closed) return;
        this.onFatal(new Error("authority_watchdog_failed: " + (error && error.message || error)));
      });
    }, WATCHDOG_INTERVAL_MS);
    if (typeof this.watchdogTimer.unref === "function") this.watchdogTimer.unref();
  }

  enqueueDelivery(delivery) {
    const cap = delivery.latestKind === "input"
      ? MAX_PENDING_DELIVERIES
      : MAX_PENDING_RELIABLE_DELIVERIES;
    if (this.pendingDeliveries >= cap) {
      this.droppedDeliveries += 1;
      return Promise.resolve(false);
    }
    this.pendingDeliveries += 1;
    return this.rpc("wire", delivery).catch((error) => {
      if (!this.closed) this.onFatal(error);
      return false;
    }).finally(() => {
      this.pendingDeliveries = Math.max(0, this.pendingDeliveries - 1);
    });
  }

  flushPendingInput(endpointId) {
    // One input on the wire per endpoint: while it is in flight the newest
    // sample keeps coalescing in pendingInputs (exactly the native latestOnly
    // semantics), and the in-flight window can no longer be flooded by a
    // stalled match thread multiplying 30 Hz input into hundreds of queued
    // RPCs.
    if (this.inputsInFlight.has(endpointId)) return null;
    const pending = this.pendingInputs.get(endpointId);
    if (!pending) return null;
    this.pendingInputs.delete(endpointId);
    this.inputsInFlight.add(endpointId);
    this.enqueueDelivery(pending).finally(() => {
      this.inputsInFlight.delete(endpointId);
      if (!this.closed && this.pendingInputs.has(endpointId)) this.scheduleInputFlush();
    });
    return pending;
  }

  scheduleInputFlush() {
    if (this.inputFlushScheduled) return;
    this.inputFlushScheduled = true;
    setImmediate(() => {
      this.inputFlushScheduled = false;
      for (const endpointId of Array.from(this.pendingInputs.keys())) this.flushPendingInput(endpointId);
    });
  }

  receiveWire(endpointId, data, messageType) {
    if (this.closed || !this.ready) return false;
    const delivery = {
      endpointId: String(endpointId || ""),
      data: String(data || ""),
      latestKind: messageType === "input" ? "input" : "",
    };
    if (!delivery.endpointId || !delivery.data) return false;
    if (delivery.latestKind === "input") {
      this.pendingInputs.set(delivery.endpointId, delivery);
      this.scheduleInputFlush();
      return true;
    }
    // Reliable actions do not wait for the endpoint's in-flight input: the
    // worker processes messages in post order, and any still-pending input is
    // a NEWER movement sample that may legitimately apply after this action.
    this.flushPendingInput(delivery.endpointId);
    this.enqueueDelivery(delivery);
    return true;
  }

  async disconnect(endpointId) {
    if (this.closed || !this.thread) return false;
    this.pendingInputs.delete(String(endpointId || ""));
    return this.rpc("disconnect", { endpointId: String(endpointId || "") });
  }

  async reconnect(endpointId, freshClient) {
    if (this.closed || !this.thread) return false;
    return this.rpc("reconnect", { endpointId: String(endpointId || ""), fresh: !!freshClient });
  }

  async state() {
    if (this.closed || !this.thread) return null;
    return this.rpc("state", {});
  }

  async close() {
    if (this.closed) return;
    this.closed = true;
    this.ready = false;
    this.pendingInputs.clear();
    if (this.watchdogTimer) {
      clearInterval(this.watchdogTimer);
      this.watchdogTimer = null;
    }
    const thread = this.thread;
    this.thread = null;
    if (!thread || thread.destroyed) return;
    thread.matches.delete(this.id);
    if (thread.matches.size === 0 && thread.pendingSpawns === 0) {
      // Last match out turns the thread off; the graceful stop disposes any
      // environment a lost reply might have left behind.
      await thread.destroy();
      return;
    }
    await thread.rpc("closeMatch", this.id, {}, this.manager.shutdownTimeoutMs).catch(() => {});
  }
}

class NodeGameWorkerManager {
  constructor(options) {
    const settings = options || {};
    this.root = path.resolve(settings.root || path.join(__dirname, ".."));
    this.maxMatches = Math.max(1, Number(settings.maxMatches) || 4);
    this.matchesPerWorker = Math.max(1, Number(settings.matchesPerWorker) || 1);
    // How many booted-and-compiled idle threads to keep ready. 0 (the code
    // default) keeps the old lazy behavior; deployments set 1 so the first
    // match after a quiet period starts in ~1.5 s instead of ~5 s.
    const spares = Number(settings.warmSpareThreads);
    this.warmSpareThreads = Number.isFinite(spares) ? Math.max(0, Math.min(4, Math.floor(spares))) : 0;
    this.startupTimeoutMs = Math.max(5000, Number(settings.startupTimeoutMs) || 45000);
    this.shutdownTimeoutMs = Math.max(1000, Number(settings.shutdownTimeoutMs) || 5000);
    this.workerMaxOldHeapMb = Math.max(128, Number(settings.workerMaxOldHeapMb) || 512);
    this.logLevel = settings.logLevel || "info";
    this.workers = new Map();
    this.threads = new Set();
    this.bundle = null;
    this.bundlePromise = null;
    this.closed = false;
  }

  // The Node runtime needs no browser, but the app warms its manager through
  // this name; here it preloads and caches the game bundle so the first match
  // does not pay the disk read, and a broken deployment fails at boot. The
  // warm spare threads start here too, so the very first room of the day
  // already lands on a compiled isolate.
  async ensureBrowser() {
    await this.ensureBundle();
    this.ensureWarmSpares();
    return null;
  }

  ensureWarmSpares() {
    if (this.closed || !this.warmSpareThreads) return;
    // A spare is only useful while another match could still be admitted.
    if (this.workers.size >= this.maxMatches) return;
    let idle = 0;
    for (const thread of this.threads) {
      if (!thread.destroyed && thread.matches.size === 0 && thread.pendingSpawns === 0) idle += 1;
    }
    while (idle < this.warmSpareThreads) {
      const thread = new AuthorityThread(this);
      this.threads.add(thread);
      idle += 1;
      thread.bootPromise
        .then(() => thread.rpc("warm", "", {}, this.startupTimeoutMs))
        .catch(() => {
          // A spare that cannot even warm (broken deployment, boot failure)
          // is useless — but never tear it down under a match that just
          // claimed it; that spawn will surface the same root cause itself.
          if (thread.matches.size === 0 && thread.pendingSpawns === 0) {
            thread.destroy().catch(() => {});
          }
        });
    }
  }

  ensureBundle() {
    if (this.closed) return Promise.reject(new Error("worker_manager_closed"));
    if (this.bundle) return Promise.resolve(this.bundle);
    if (!this.bundlePromise) {
      this.bundlePromise = Promise.resolve().then(() => {
        this.bundle = loadAuthorityBundle(this.root);
        return this.bundle;
      }).finally(() => {
        this.bundlePromise = null;
      });
    }
    return this.bundlePromise;
  }

  acquireThread() {
    // Pack the fullest thread first: spares must stay idle until every
    // partially-filled thread is at capacity, or MATCHES_PER_WORKER packing
    // (and the point of keeping a spare warm) silently degrades.
    let best = null;
    let bestLoad = -1;
    for (const thread of this.threads) {
      if (!thread.hasCapacity()) continue;
      const load = thread.matches.size + thread.pendingSpawns;
      if (load > bestLoad) {
        best = thread;
        bestLoad = load;
      }
    }
    if (best) return best;
    const thread = new AuthorityThread(this);
    this.threads.add(thread);
    return thread;
  }

  async createMatch(options) {
    if (this.closed) throw new Error("worker_manager_closed");
    if (this.workers.size >= this.maxMatches) throw new Error("server_at_capacity");
    const matchId = String(options && (options.matchId || options.startId) || "");
    if (!matchId || this.workers.has(matchId)) throw new Error("duplicate_match_worker");
    const worker = new NodeMatchWorker(this, options);
    this.workers.set(matchId, worker);
    worker.startPromise = worker.start();
    try {
      await worker.startPromise;
      return worker;
    } catch (error) {
      this.workers.delete(matchId);
      await worker.close();
      throw error;
    } finally {
      worker.startPromise = null;
      // The spare this match may have claimed is replaced in the background;
      // by the time the current rooms fill up, the next one is compiled.
      this.ensureWarmSpares();
    }
  }

  get(matchId) {
    return this.workers.get(String(matchId || "")) || null;
  }

  async closeMatch(matchId) {
    const id = String(matchId || "");
    const worker = this.workers.get(id);
    if (!worker) return false;
    this.workers.delete(id);
    await worker.close();
    this.ensureWarmSpares();
    return true;
  }

  async close() {
    if (this.closed) return;
    this.closed = true;
    const workers = Array.from(this.workers.values());
    this.workers.clear();
    for (const worker of workers) {
      worker.closed = true;
      if (worker.watchdogTimer) clearInterval(worker.watchdogTimer);
    }
    const threads = Array.from(this.threads);
    this.threads.clear();
    await Promise.all(threads.map((thread) => thread.destroy()));
  }

  readiness() {
    return {
      ready: !this.closed,
      activeMatches: this.workers.size,
      maxMatches: this.maxMatches,
      // Kept for interface parity with the browser manager: health gates and
      // the region heartbeat read this field.
      browserConnected: !this.closed,
      runtime: "node",
      threads: this.threads.size,
      matchesPerWorker: this.matchesPerWorker,
      idleThreads: Array.from(this.threads).filter(
        (thread) => !thread.destroyed && thread.matches.size === 0 && thread.pendingSpawns === 0
      ).length,
    };
  }
}

module.exports = {
  NodeGameWorkerManager,
  NodeMatchWorker,
};
