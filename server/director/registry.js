"use strict";

const protocol = require("../../multiplayer-protocol.js");

const MAX_ID_LENGTH = 48;
const MAX_LABEL_LENGTH = 64;
const MAX_URL_LENGTH = 300;

function defaultClock() {
  return Date.now();
}

function normalizeRegionId(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "")
    .slice(0, MAX_ID_LENGTH);
}

// Labels are rendered straight into the lobby, so angle brackets and control
// characters are folded to spaces rather than escaped at every call site.
function normalizeLabel(value, fallback) {
  const source = String(value == null ? "" : value);
  let cleaned = "";
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const code = character.charCodeAt(0);
    cleaned += (character === "<" || character === ">" || code < 32 || code === 127) ? " " : character;
  }
  const label = cleaned.replace(/\s+/g, " ").trim().slice(0, MAX_LABEL_LENGTH);
  return label || String(fallback || "");
}

// Only absolute ws/wss (or http/https, which are upgraded here) endpoints are
// accepted. Anything else would let a heartbeat point players at an arbitrary
// scheme, so a malformed url rejects the whole region instead of being patched.
function normalizeRegionUrl(value) {
  const raw = String(value || "").trim().slice(0, MAX_URL_LENGTH);
  if (!raw) return "";
  let url;
  try {
    url = new URL(raw);
  } catch (error) {
    return "";
  }
  if (url.protocol === "http:") url.protocol = "ws:";
  if (url.protocol === "https:") url.protocol = "wss:";
  if (url.protocol !== "ws:" && url.protocol !== "wss:") return "";
  url.hash = "";
  url.search = "";
  if (!url.pathname || url.pathname === "/") url.pathname = "/online";
  return url.toString();
}

function clampCount(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return 0;
  return Math.min(1000000, Math.floor(number));
}

class RegionRegistry {
  constructor(options) {
    const settings = options || {};
    this.clock = settings.clock || defaultClock;
    this.regionTtlMs = Math.max(1000, Number(settings.regionTtlMs) || 45000);
    this.claimTtlMs = Math.max(1000, Number(settings.claimTtlMs) || 90000);
    this.maxRegions = Math.max(1, Number(settings.maxRegions) || 64);
    this.maxClaims = Math.max(1, Number(settings.maxClaims) || 4096);
    this.maxCodesPerRegion = Math.max(1, Number(settings.maxCodesPerRegion) || 512);
    this.protocolVersion = Number(settings.protocolVersion) || protocol.VERSION;
    this.regions = new Map();
    this.claims = new Map();
    this.heartbeatsReceived = 0;
    this.heartbeatsRejected = 0;
    for (const entry of Array.isArray(settings.staticRegions) ? settings.staticRegions : []) {
      this.declareStaticRegion(entry);
    }
  }

  // A statically declared region is advertised but never counted as verified
  // until it heartbeats, so operators can pre-seed the list without pretending
  // an unreachable box is healthy.
  declareStaticRegion(entry) {
    const id = normalizeRegionId(entry && entry.id);
    const url = normalizeRegionUrl(entry && entry.url);
    if (!id || !url) return null;
    const region = {
      id,
      label: normalizeLabel(entry && entry.label, id),
      url,
      priority: Number.isFinite(Number(entry && entry.priority)) ? Math.floor(Number(entry.priority)) : 0,
      declared: true,
      protocolVersion: 0,
      ready: false,
      accepting: false,
      activeMatches: 0,
      maxMatches: clampCount(entry && entry.maxMatches),
      connections: 0,
      maxConnections: clampCount(entry && entry.maxConnections),
      players: 0,
      lastHeartbeatAt: 0,
      codes: new Set(),
    };
    this.regions.set(id, region);
    return region;
  }

  applyHeartbeat(payload) {
    const body = payload && typeof payload === "object" ? payload : {};
    const id = normalizeRegionId(body.id);
    const url = normalizeRegionUrl(body.url);
    if (!id || !url) {
      this.heartbeatsRejected += 1;
      return { ok: false, error: "invalid_region" };
    }
    const version = Number(body.protocolVersion);
    if (!Number.isFinite(version) || version !== this.protocolVersion) {
      this.heartbeatsRejected += 1;
      return { ok: false, error: "protocol_version_mismatch" };
    }
    let region = this.regions.get(id);
    if (!region) {
      if (this.regions.size >= this.maxRegions) {
        this.heartbeatsRejected += 1;
        return { ok: false, error: "region_capacity" };
      }
      region = this.declareStaticRegion({ id, url, label: body.label });
      if (!region) {
        this.heartbeatsRejected += 1;
        return { ok: false, error: "invalid_region" };
      }
    }
    region.declared = false;
    region.url = url;
    region.label = normalizeLabel(body.label, region.label || id);
    region.protocolVersion = version;
    region.ready = body.ready !== false;
    region.accepting = body.accepting !== false;
    region.activeMatches = clampCount(body.activeMatches);
    region.maxMatches = clampCount(body.maxMatches) || region.maxMatches;
    region.connections = clampCount(body.connections);
    region.maxConnections = clampCount(body.maxConnections) || region.maxConnections;
    region.players = clampCount(body.players);
    if (Number.isFinite(Number(body.priority))) region.priority = Math.floor(Number(body.priority));
    region.lastHeartbeatAt = this.clock();
    region.codes = this.normalizeCodes(body.codes);
    this.heartbeatsReceived += 1;
    return { ok: true, regionId: region.id };
  }

  normalizeCodes(value) {
    const codes = new Set();
    if (!Array.isArray(value)) return codes;
    for (const entry of value) {
      if (codes.size >= this.maxCodesPerRegion) break;
      const code = protocol.normalizeSearchCode(entry);
      if (code) codes.add(code);
    }
    return codes;
  }

  removeRegion(regionId) {
    const id = normalizeRegionId(regionId);
    if (!this.regions.has(id)) return false;
    this.regions.delete(id);
    for (const [code, claim] of this.claims) {
      if (claim.regionId === id) this.claims.delete(code);
    }
    return true;
  }

  isFresh(region, now) {
    return !!region && region.lastHeartbeatAt > 0 && (now - region.lastHeartbeatAt) <= this.regionTtlMs;
  }

  // "Joinable" is deliberately stricter than "fresh": a region that answered but
  // reports itself draining or at match capacity must not receive new players,
  // yet it still appears in the list so an already-running client can reconnect.
  isJoinable(region, now) {
    if (!this.isFresh(region, now)) return false;
    if (!region.ready || !region.accepting) return false;
    if (region.maxMatches && region.activeMatches >= region.maxMatches) return false;
    if (region.maxConnections && region.connections >= region.maxConnections) return false;
    return true;
  }

  loadOf(region) {
    const matchLoad = region.maxMatches ? region.activeMatches / region.maxMatches : 0;
    const connectionLoad = region.maxConnections ? region.connections / region.maxConnections : 0;
    return Math.min(1, Math.max(0, Math.max(matchLoad, connectionLoad)));
  }

  describeRegion(region, now) {
    const fresh = this.isFresh(region, now);
    return {
      id: region.id,
      label: region.label,
      url: region.url,
      priority: region.priority,
      healthy: this.isJoinable(region, now),
      reachable: fresh,
      verified: region.lastHeartbeatAt > 0,
      load: Number(this.loadOf(region).toFixed(3)),
      activeMatches: region.activeMatches,
      maxMatches: region.maxMatches,
      connections: region.connections,
      maxConnections: region.maxConnections,
      players: region.players,
      staleMs: region.lastHeartbeatAt ? Math.max(0, now - region.lastHeartbeatAt) : -1,
    };
  }

  pruneClaims(now) {
    for (const [code, claim] of this.claims) {
      if (claim.expiresAt <= now) this.claims.delete(code);
    }
  }

  // Ground truth first: if any live region says it currently holds a joinable
  // room for this code, friends must land there no matter what a client claimed
  // or how the latency probe would have scored.
  findRegionHostingCode(code, now) {
    const normalized = protocol.normalizeSearchCode(code);
    if (!normalized) return null;
    let best = null;
    for (const region of this.regions.values()) {
      if (!region.codes.has(normalized)) continue;
      if (!this.isFresh(region, now)) continue;
      if (!best || region.lastHeartbeatAt > best.lastHeartbeatAt) best = region;
    }
    return best;
  }

  resolveCode(code, now) {
    const normalized = protocol.normalizeSearchCode(code);
    if (!normalized) return null;
    const hosting = this.findRegionHostingCode(normalized, now);
    if (hosting) return { regionId: hosting.id, reason: "active_room" };
    this.pruneClaims(now);
    const claim = this.claims.get(normalized);
    if (!claim) return null;
    const region = this.regions.get(claim.regionId);
    if (!region || !this.isJoinable(region, now)) {
      this.claims.delete(normalized);
      return null;
    }
    return { regionId: region.id, reason: "claim" };
  }

  // First writer wins, and the winner is echoed back so a losing client can
  // re-target instead of stranding two friends in different regions.
  claimCode(code, regionId, now) {
    const normalized = protocol.normalizeSearchCode(code);
    if (!normalized) return { ok: false, error: "invalid_code" };
    const existing = this.resolveCode(normalized, now);
    if (existing) {
      const claim = this.claims.get(normalized);
      if (claim && claim.regionId === existing.regionId) claim.expiresAt = now + this.claimTtlMs;
      return { ok: true, code: normalized, regionId: existing.regionId, reason: existing.reason };
    }
    const id = normalizeRegionId(regionId);
    const region = this.regions.get(id);
    if (!region || !this.isJoinable(region, now)) return { ok: false, error: "region_unavailable" };
    this.pruneClaims(now);
    if (this.claims.size >= this.maxClaims) {
      let oldestCode = "";
      let oldestAt = Infinity;
      for (const [entryCode, claim] of this.claims) {
        if (claim.expiresAt < oldestAt) {
          oldestAt = claim.expiresAt;
          oldestCode = entryCode;
        }
      }
      if (oldestCode) this.claims.delete(oldestCode);
    }
    this.claims.set(normalized, { regionId: id, expiresAt: now + this.claimTtlMs });
    return { ok: true, code: normalized, regionId: id, reason: "claim" };
  }

  // Ordering is only a hint: the client still probes and decides on measured
  // latency. Sorting joinable-then-least-loaded keeps the probe set useful when
  // the client can only afford to measure the first few candidates.
  listRegions(now) {
    const described = [];
    for (const region of this.regions.values()) described.push(this.describeRegion(region, now));
    described.sort((left, right) => {
      if (left.healthy !== right.healthy) return left.healthy ? -1 : 1;
      if (left.priority !== right.priority) return left.priority - right.priority;
      if (left.load !== right.load) return left.load - right.load;
      return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
    });
    return described;
  }

  directory(searchCode) {
    const now = this.clock();
    const regions = this.listRegions(now);
    const pinned = this.resolveCode(searchCode, now);
    return {
      protocolVersion: this.protocolVersion,
      serverNow: now,
      regions,
      pinnedRegionId: pinned ? pinned.regionId : "",
      pinnedReason: pinned ? pinned.reason : "",
    };
  }

  metrics() {
    const now = this.clock();
    let joinable = 0;
    let fresh = 0;
    for (const region of this.regions.values()) {
      if (this.isFresh(region, now)) fresh += 1;
      if (this.isJoinable(region, now)) joinable += 1;
    }
    this.pruneClaims(now);
    return {
      regions: this.regions.size,
      freshRegions: fresh,
      joinableRegions: joinable,
      claims: this.claims.size,
      heartbeatsReceived: this.heartbeatsReceived,
      heartbeatsRejected: this.heartbeatsRejected,
    };
  }

  // The director itself may be up while it cannot route anyone. Reporting that
  // as not-ready keeps a fresh deployment out of a load balancer rotation.
  readiness() {
    const now = this.clock();
    let joinable = 0;
    for (const region of this.regions.values()) {
      if (this.isJoinable(region, now)) joinable += 1;
    }
    return { ready: joinable > 0, joinableRegions: joinable, regions: this.regions.size };
  }
}

module.exports = {
  RegionRegistry,
  normalizeRegionId,
  normalizeRegionUrl,
  normalizeLabel,
};
