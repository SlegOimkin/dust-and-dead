"use strict";

const crypto = require("node:crypto");
const protocol = require("../../multiplayer-protocol.js");

function readPositiveInteger(name, fallback, minimum, maximum) {
  const raw = process.env[name];
  if (raw == null || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.floor(value)));
}

function readList(value) {
  return String(value || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

// Regions may be declared statically so a fresh director answers clients before
// the first heartbeat arrives. Heartbeats then overwrite health and load for the
// same id; a static entry that never heartbeats stays "unverified" rather than
// healthy, and the client's own latency probe remains the final gate.
function readStaticRegions(value) {
  const raw = String(value || "").trim();
  if (!raw) return [];
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error("REGIONS must be valid JSON: " + (error && error.message));
  }
  if (!Array.isArray(parsed)) throw new Error("REGIONS must be a JSON array");
  return parsed.map((entry, index) => {
    if (!entry || typeof entry !== "object") throw new Error("REGIONS[" + index + "] must be an object");
    const id = String(entry.id || "").trim();
    const url = String(entry.url || "").trim();
    if (!id) throw new Error("REGIONS[" + index + "] is missing id");
    if (!url) throw new Error("REGIONS[" + index + "] is missing url");
    return {
      id,
      label: String(entry.label || id),
      url,
      priority: Number.isFinite(Number(entry.priority)) ? Math.floor(Number(entry.priority)) : 0,
      maxMatches: readPositiveIntegerValue(entry.maxMatches, 0),
      maxConnections: readPositiveIntegerValue(entry.maxConnections, 0),
    };
  });
}

function readPositiveIntegerValue(value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return fallback;
  return Math.floor(number);
}

module.exports = Object.freeze({
  host: process.env.DIRECTOR_HOST || process.env.HOST || "0.0.0.0",
  port: readPositiveInteger("DIRECTOR_PORT", 8686, 1, 65535),
  trustProxy: process.env.TRUST_PROXY === "1",
  protocolVersion: protocol.VERSION,
  // Shared secret every region presents on POST /v1/regions/heartbeat.
  heartbeatToken: String(process.env.DIRECTOR_TOKEN || ""),
  // A region is dropped from the healthy set once its last heartbeat is older
  // than this. Keep it at a few heartbeat intervals so one lost packet does not
  // eject a live region.
  regionTtlMs: readPositiveInteger("REGION_TTL_MS", 45000, 5000, 10 * 60 * 1000),
  heartbeatIntervalMs: readPositiveInteger("REGION_HEARTBEAT_INTERVAL_MS", 10000, 1000, 5 * 60 * 1000),
  // How long a client may cache the region list before asking again.
  regionsCacheTtlMs: readPositiveInteger("REGIONS_CACHE_TTL_MS", 30000, 1000, 10 * 60 * 1000),
  // Client-supplied search-code stickiness. Heartbeat-reported codes are ground
  // truth and outlive this; a claim only bridges the gap until the next beat.
  claimTtlMs: readPositiveInteger("ROUTE_CLAIM_TTL_MS", 90000, 5000, 10 * 60 * 1000),
  maxClaims: readPositiveInteger("MAX_ROUTE_CLAIMS", 4096, 16, 1000000),
  maxRegions: readPositiveInteger("MAX_REGIONS", 64, 1, 1000),
  maxCodesPerRegion: readPositiveInteger("MAX_CODES_PER_REGION", 512, 1, 100000),
  requestRatePerSecond: readPositiveInteger("DIRECTOR_RATE_PER_SECOND", 20, 1, 1000),
  requestRateBurst: readPositiveInteger("DIRECTOR_RATE_BURST", 60, 2, 5000),
  maxBodyBytes: readPositiveInteger("DIRECTOR_MAX_BODY_BYTES", 64 * 1024, 1024, 4 * 1024 * 1024),
  staticRegions: readStaticRegions(process.env.REGIONS),
  logLevel: process.env.LOG_LEVEL || "info",
  instanceId: crypto.randomBytes(8).toString("hex"),
});
