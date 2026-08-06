"use strict";

const DEFAULT_INTERVAL_MS = 10000;
const MIN_INTERVAL_MS = 1000;
const MAX_BACKOFF_MS = 60000;
const REQUEST_TIMEOUT_MS = 5000;

// Regions push their state to the director instead of being polled: a region
// behind NAT or a private network still registers, the director learns real load
// numbers, and the shared token authenticates one direction only.
class RegionHeartbeat {
  constructor(options) {
    const settings = options || {};
    this.directorUrl = String(settings.directorUrl || "").replace(/\/+$/, "");
    this.token = String(settings.token || "");
    this.regionId = String(settings.regionId || "");
    this.regionLabel = String(settings.regionLabel || settings.regionId || "");
    this.regionUrl = String(settings.regionUrl || "");
    this.priority = Number.isFinite(Number(settings.priority)) ? Math.floor(Number(settings.priority)) : 0;
    this.intervalMs = Math.max(MIN_INTERVAL_MS, Number(settings.intervalMs) || DEFAULT_INTERVAL_MS);
    this.getState = typeof settings.getState === "function" ? settings.getState : function () { return {}; };
    this.log = typeof settings.log === "function" ? settings.log : function () {};
    this.fetchImpl = settings.fetch || (typeof fetch === "function" ? fetch : null);
    this.timer = null;
    this.stopped = false;
    this.inFlight = false;
    this.failures = 0;
    this.sent = 0;
    this.rejected = 0;
    this.lastError = "";
    this.lastSuccessAt = 0;
  }

  // Every field must be present for the director to accept the region, so a
  // half-configured deployment fails loudly at start rather than silently never
  // appearing in the region list.
  isConfigured() {
    return !!(this.directorUrl && this.token && this.regionId && this.regionUrl && this.fetchImpl);
  }

  describeMissingConfiguration() {
    const missing = [];
    if (!this.directorUrl) missing.push("DIRECTOR_URL");
    if (!this.token) missing.push("DIRECTOR_TOKEN");
    if (!this.regionId) missing.push("REGION_ID");
    if (!this.regionUrl) missing.push("REGION_PUBLIC_URL");
    if (!this.fetchImpl) missing.push("fetch");
    return missing;
  }

  buildPayload() {
    const state = this.getState() || {};
    return {
      id: this.regionId,
      label: this.regionLabel,
      url: this.regionUrl,
      priority: this.priority,
      protocolVersion: Number(state.protocolVersion) || 0,
      ready: state.ready !== false,
      accepting: state.accepting !== false,
      activeMatches: Number(state.activeMatches) || 0,
      maxMatches: Number(state.maxMatches) || 0,
      connections: Number(state.connections) || 0,
      maxConnections: Number(state.maxConnections) || 0,
      players: Number(state.players) || 0,
      codes: Array.isArray(state.codes) ? state.codes : [],
    };
  }

  async sendOnce() {
    if (this.stopped || this.inFlight || !this.isConfigured()) return false;
    this.inFlight = true;
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    const timeout = controller
      ? setTimeout(() => { try { controller.abort(); } catch (error) {} }, REQUEST_TIMEOUT_MS)
      : null;
    if (timeout && typeof timeout.unref === "function") timeout.unref();
    try {
      const response = await this.fetchImpl(this.directorUrl + "/v1/regions/heartbeat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + this.token,
        },
        body: JSON.stringify(this.buildPayload()),
        signal: controller ? controller.signal : undefined,
      });
      if (!response.ok) {
        this.rejected += 1;
        this.failures += 1;
        this.lastError = "http_" + response.status;
        this.log("warn", "region_heartbeat_failed", {
          regionId: this.regionId,
          status: response.status,
          failures: this.failures,
        });
        return false;
      }
      // The director owns the cadence, so a fleet-wide interval change needs no
      // region redeploy.
      let body = null;
      try {
        body = await response.json();
      } catch (error) {
        body = null;
      }
      const suggested = body && Number(body.intervalMs);
      if (Number.isFinite(suggested) && suggested >= MIN_INTERVAL_MS) {
        this.intervalMs = Math.min(MAX_BACKOFF_MS, Math.floor(suggested));
      }
      if (this.failures) {
        this.log("info", "region_heartbeat_recovered", { regionId: this.regionId, failures: this.failures });
      }
      this.failures = 0;
      this.sent += 1;
      this.lastError = "";
      this.lastSuccessAt = Date.now();
      return true;
    } catch (error) {
      this.failures += 1;
      this.lastError = error && error.message || "heartbeat_failed";
      this.log("warn", "region_heartbeat_failed", {
        regionId: this.regionId,
        error: this.lastError,
        failures: this.failures,
      });
      return false;
    } finally {
      if (timeout) clearTimeout(timeout);
      this.inFlight = false;
    }
  }

  nextDelayMs() {
    if (!this.failures) return this.intervalMs;
    return Math.min(MAX_BACKOFF_MS, this.intervalMs * Math.pow(2, Math.min(6, this.failures)));
  }

  schedule() {
    if (this.stopped) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      this.sendOnce().finally(() => this.schedule());
    }, this.nextDelayMs());
    if (this.timer && typeof this.timer.unref === "function") this.timer.unref();
  }

  start() {
    if (this.stopped || this.timer) return false;
    if (!this.isConfigured()) {
      this.log("warn", "region_heartbeat_disabled", { missing: this.describeMissingConfiguration() });
      return false;
    }
    this.log("info", "region_heartbeat_started", {
      regionId: this.regionId,
      directorUrl: this.directorUrl,
      intervalMs: this.intervalMs,
    });
    this.sendOnce().finally(() => this.schedule());
    return true;
  }

  async stop() {
    if (this.stopped) return;
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  status() {
    return {
      configured: this.isConfigured(),
      regionId: this.regionId,
      sent: this.sent,
      rejected: this.rejected,
      failures: this.failures,
      lastError: this.lastError,
      lastSuccessAt: this.lastSuccessAt,
      intervalMs: this.intervalMs,
    };
  }
}

module.exports = {
  RegionHeartbeat,
};
