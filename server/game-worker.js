"use strict";

const { chromium } = require("playwright");

// Deliveries are handed to the authority page one at a time. This bounds how far
// a flood of non-coalescable messages (decision, progressionChoice, acks) may run
// ahead of the page before the excess is dropped instead of queued.
const MAX_PENDING_DELIVERIES = 256;

function withTimeout(promise, timeoutMs, message) {
  let timer = null;
  const timeout = new Promise((resolve, reject) => {
    timer = setTimeout(() => reject(new Error(message || "operation_timed_out")), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

class BrowserMatchWorker {
  constructor(manager, options) {
    const settings = options || {};
    this.manager = manager;
    this.id = String(settings.matchId || settings.startId || "");
    this.options = settings;
    this.onPacket = typeof settings.onPacket === "function" ? settings.onPacket : function () {};
    this.onFatal = typeof settings.onFatal === "function" ? settings.onFatal : function () {};
    this.context = null;
    this.page = null;
    this.closed = false;
    this.ready = false;
    this.pendingInputs = new Map();
    this.inputFlushScheduled = false;
    this.deliveryChain = Promise.resolve();
    this.pendingDeliveries = 0;
    this.droppedDeliveries = 0;
    this.startPromise = null;
    this.startedAt = 0;
  }

  // start() is a long chain of awaits, and close() can land in any gap between
  // them. Every step therefore re-checks `closed` and releases whatever it just
  // created, so a cancelled start can never leave an unreachable browser context
  // holding a MAX_MATCHES slot.
  async releaseContext() {
    const context = this.context;
    this.context = null;
    this.page = null;
    if (!context) return;
    await withTimeout(context.close().catch(() => {}), this.manager.shutdownTimeoutMs, "worker_close_timeout")
      .catch(() => {});
  }

  async abortIfClosed() {
    if (!this.closed) return false;
    await this.releaseContext();
    throw new Error("worker_closed");
  }

  async start() {
    await this.abortIfClosed();
    const browser = await this.manager.ensureBrowser();
    await this.abortIfClosed();
    this.context = await browser.newContext({
      viewport: { width: 960, height: 540 },
      deviceScaleFactor: 1,
      reducedMotion: "reduce",
    });
    await this.abortIfClosed();
    this.page = await this.context.newPage();
    await this.abortIfClosed();
    await this.page.exposeFunction("__dustDedicatedServerEmit", (packet) => {
      if (!this.closed && packet && packet.endpointId && packet.data) this.onPacket(packet);
      return true;
    });
    this.page.on("pageerror", (error) => {
      if (!this.closed) this.onFatal(error instanceof Error ? error : new Error(String(error)));
    });
    this.page.on("crash", () => {
      if (!this.closed) this.onFatal(new Error("authoritative_page_crashed"));
    });
    if (this.manager.logLevel === "debug") {
      this.page.on("console", (message) => {
        const type = message.type();
        if (type === "error" || type === "warning") {
          process.stderr.write("[match " + this.id + "] " + type + ": " + message.text() + "\n");
        }
      });
    }

    const target = new URL("/", this.manager.baseUrl);
    target.searchParams.set("dedicatedServer", "1");
    target.searchParams.set("mapSeed", String(this.options.mapSeed));
    await withTimeout(
      this.page.goto(target.toString(), { waitUntil: "domcontentloaded" }),
      this.manager.startupTimeoutMs,
      "authoritative_page_load_timeout"
    );
    await this.abortIfClosed();
    await withTimeout(
      this.page.waitForFunction(() => !!(window.__dustDedicatedServer && window.__dustDedicatedServer.start)),
      this.manager.startupTimeoutMs,
      "authoritative_runtime_timeout"
    );
    await this.abortIfClosed();
    const result = await withTimeout(
      this.page.evaluate((settings) => window.__dustDedicatedServer.start(settings), {
        matchId: this.options.matchId,
        startId: this.options.startId,
        mapSeed: this.options.mapSeed,
        players: this.options.players,
      }),
      this.manager.startupTimeoutMs,
      "authoritative_match_start_timeout"
    );
    await this.abortIfClosed();
    const expectedMatchId = String(this.options.startId || this.options.matchId || "");
    if (!result || !result.ready || result.matchId !== expectedMatchId) {
      throw new Error("authoritative_runtime_rejected_match");
    }
    this.ready = true;
    this.startedAt = Date.now();
    return result;
  }

  enqueueDelivery(delivery) {
    // The chain is serial by design, so a client that outruns the authority page
    // would otherwise grow it without bound. Dropping the newest message past the
    // cap keeps the already-queued (older, still-relevant) ones intact.
    if (this.pendingDeliveries >= MAX_PENDING_DELIVERIES) {
      this.droppedDeliveries += 1;
      return Promise.resolve(false);
    }
    this.pendingDeliveries += 1;
    this.deliveryChain = this.deliveryChain.then(async () => {
      if (this.closed || !this.page) return false;
      return this.page.evaluate((entry) => {
        return window.__dustDedicatedServer.receiveWire(entry.endpointId, entry.data, entry.latestKind);
      }, delivery);
    }).catch((error) => {
      if (!this.closed) this.onFatal(error);
      return false;
    }).finally(() => {
      this.pendingDeliveries = Math.max(0, this.pendingDeliveries - 1);
    });
    return this.deliveryChain;
  }

  flushPendingInput(endpointId) {
    const pending = this.pendingInputs.get(endpointId);
    if (!pending) return null;
    this.pendingInputs.delete(endpointId);
    this.enqueueDelivery(pending);
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
    this.flushPendingInput(delivery.endpointId);
    this.enqueueDelivery(delivery);
    return true;
  }

  async disconnect(endpointId) {
    if (this.closed || !this.page) return false;
    this.pendingInputs.delete(String(endpointId || ""));
    return this.page.evaluate((id) => window.__dustDedicatedServer.disconnect(id), String(endpointId || ""));
  }

  // `freshClient` marks a page that reloaded (rather than a socket blip): the
  // authority then also resets that player's client-sequence counters.
  async reconnect(endpointId, freshClient) {
    if (this.closed || !this.page) return false;
    return this.page.evaluate(
      (entry) => window.__dustDedicatedServer.reconnect(entry.id, entry.fresh),
      { id: String(endpointId || ""), fresh: !!freshClient }
    );
  }

  async state() {
    if (this.closed || !this.page) return null;
    return this.page.evaluate(() => window.__dustDedicatedServer.getState());
  }

  async close() {
    if (this.closed) return;
    this.closed = true;
    this.ready = false;
    this.pendingInputs.clear();
    // A start still in flight owns the context; waiting for it to unwind is what
    // guarantees the release below sees whatever it managed to create.
    if (this.startPromise) await this.startPromise.catch(() => {});
    await this.releaseContext();
  }
}

class GameWorkerManager {
  constructor(options) {
    const settings = options || {};
    this.baseUrl = String(settings.baseUrl || "http://127.0.0.1:8787");
    this.maxMatches = Math.max(1, Number(settings.maxMatches) || 4);
    this.startupTimeoutMs = Math.max(5000, Number(settings.startupTimeoutMs) || 45000);
    this.shutdownTimeoutMs = Math.max(1000, Number(settings.shutdownTimeoutMs) || 5000);
    this.logLevel = settings.logLevel || "info";
    // Extra Chromium switches appended at launch. Lets a deployment tune the
    // browser (process model, memory flags) without patching this file.
    this.launchArgs = Array.isArray(settings.launchArgs)
      ? settings.launchArgs.map((value) => String(value)).filter(Boolean)
      : [];
    this.browser = null;
    this.browserPromise = null;
    this.workers = new Map();
    this.closed = false;
  }

  async ensureBrowser() {
    if (this.closed) throw new Error("worker_manager_closed");
    if (this.browser && this.browser.isConnected()) return this.browser;
    if (!this.browserPromise) {
      this.browserPromise = chromium.launch({
        headless: true,
        args: [
          "--disable-background-timer-throttling",
          "--disable-backgrounding-occluded-windows",
          "--disable-renderer-backgrounding",
          "--no-first-run",
        ].concat(this.launchArgs),
      }).then((browser) => {
        this.browser = browser;
        browser.on("disconnected", () => {
          this.browser = null;
          for (const worker of this.workers.values()) {
            if (!worker.closed) worker.onFatal(new Error("authoritative_browser_disconnected"));
          }
        });
        return browser;
      }).finally(() => {
        this.browserPromise = null;
      });
    }
    return this.browserPromise;
  }

  async createMatch(options) {
    if (this.closed) throw new Error("worker_manager_closed");
    if (this.workers.size >= this.maxMatches) throw new Error("server_at_capacity");
    const matchId = String(options && (options.matchId || options.startId) || "");
    if (!matchId || this.workers.has(matchId)) throw new Error("duplicate_match_worker");
    const worker = new BrowserMatchWorker(this, options);
    this.workers.set(matchId, worker);
    // Tracked on the worker so a concurrent close() can await the same start
    // rather than racing it and orphaning the context it is about to create.
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
    return true;
  }

  async close() {
    if (this.closed) return;
    this.closed = true;
    const workers = Array.from(this.workers.values());
    this.workers.clear();
    await Promise.all(workers.map((worker) => worker.close()));
    if (this.browser) await this.browser.close().catch(() => {});
    this.browser = null;
  }

  readiness() {
    const browserConnected = !!(this.browser && this.browser.isConnected());
    return {
      // A node that cannot launch Chromium cannot run a single match, so it must
      // not advertise itself as ready to a health gate or to the region director.
      ready: !this.closed && browserConnected,
      activeMatches: this.workers.size,
      maxMatches: this.maxMatches,
      browserConnected,
    };
  }
}

module.exports = {
  BrowserMatchWorker,
  GameWorkerManager,
  withTimeout,
};
