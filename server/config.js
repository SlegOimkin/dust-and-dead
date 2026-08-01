"use strict";

const crypto = require("node:crypto");
const protocol = require("../multiplayer-protocol.js");

function readPositiveInteger(name, fallback, minimum, maximum) {
  const raw = process.env[name];
  if (raw == null || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.floor(value)));
}

function readOrigins(value) {
  return String(value || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

module.exports = Object.freeze({
  host: process.env.HOST || "0.0.0.0",
  port: readPositiveInteger("PORT", 8787, 1, 65535),
  publicOrigin: String(process.env.PUBLIC_ORIGIN || "").replace(/\/$/, ""),
  allowedOrigins: readOrigins(process.env.ALLOWED_ORIGINS),
  trustProxy: process.env.TRUST_PROXY === "1",
  autoStartDelayMs: readPositiveInteger(
    "AUTO_START_DELAY_MS",
    protocol.AUTO_START_DELAY_MS,
    1000,
    10 * 60 * 1000
  ),
  startAckTimeoutMs: readPositiveInteger(
    "START_ACK_TIMEOUT_MS",
    protocol.START_ACK_TIMEOUT_MS,
    2000,
    60 * 1000
  ),
  reconnectGraceMs: readPositiveInteger(
    "RECONNECT_GRACE_MS",
    protocol.RECONNECT_GRACE_MS,
    1000,
    2 * 60 * 1000
  ),
  heartbeatIntervalMs: readPositiveInteger("HEARTBEAT_INTERVAL_MS", 15000, 5000, 60000),
  connectionRatePerSecond: readPositiveInteger("CONNECTION_RATE_PER_SECOND", 90, 10, 500),
  connectionBurst: readPositiveInteger("CONNECTION_RATE_BURST", 180, 20, 1000),
  maxConnections: readPositiveInteger("MAX_CONNECTIONS", 256, 8, 10000),
  maxConnectionsPerIp: readPositiveInteger("MAX_CONNECTIONS_PER_IP", 32, 2, 1000),
  maxSessions: readPositiveInteger("MAX_SESSIONS", 512, 16, 20000),
  idleLobbyTtlMs: readPositiveInteger(
    "IDLE_LOBBY_TTL_MS",
    10 * 60 * 1000,
    30 * 1000,
    24 * 60 * 60 * 1000
  ),
  maxMatches: readPositiveInteger("MAX_MATCHES", 12, 1, 100),
  workerStartupTimeoutMs: readPositiveInteger("WORKER_STARTUP_TIMEOUT_MS", 45000, 5000, 120000),
  workerShutdownTimeoutMs: readPositiveInteger("WORKER_SHUTDOWN_TIMEOUT_MS", 5000, 1000, 30000),
  logLevel: process.env.LOG_LEVEL || "info",
  resumeTokenSecret: process.env.RESUME_TOKEN_SECRET || crypto.randomBytes(32).toString("hex"),
});
