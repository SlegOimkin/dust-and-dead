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

function readSignedInteger(name, fallback, minimum, maximum) {
  const raw = process.env[name];
  if (raw == null || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.trunc(value)));
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
  // How many proxies sit in front of this server. The client address is read
  // that many entries from the right of X-Forwarded-For, so adding a CDN in
  // front of Caddy means raising this to 2 rather than silently bucketing every
  // player under the CDN's address.
  trustProxyHops: readPositiveInteger("TRUST_PROXY_HOPS", 1, 1, 10),
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
  // A finished match whose players idle on the results screen is returned to
  // the lobby (and its Chromium worker released) after this long on its own.
  postMatchAutoReturnMs: readPositiveInteger(
    "POST_MATCH_AUTO_RETURN_MS",
    90 * 1000,
    5 * 1000,
    30 * 60 * 1000
  ),
  // Which runtime hosts authoritative matches. "node" runs the game inside
  // worker threads via jsdom — no Chromium at all; "browser" is the original
  // Playwright/Chromium path, kept as a rollback.
  matchRuntime: String(process.env.MATCH_RUNTIME || "node").toLowerCase() === "browser" ? "browser" : "node",
  maxMatches: readPositiveInteger("MAX_MATCHES", 4, 1, 100),
  // Node-runtime only: how many matches may share one worker thread. 1 (the
  // default) keeps full per-match crash isolation and one core per match.
  // Raising it packs matches into fewer isolates so they share the ~50 MB
  // parse cost of game.js + jsdom — much less RAM per match — but matches on
  // one thread share a single core and die together if the thread dies.
  matchesPerWorker: readPositiveInteger("MATCHES_PER_WORKER", 1, 1, 16),
  // Extra Chromium switches for the match browser, whitespace-separated.
  // "--process-per-site" collapses all authority pages into one renderer
  // process: measurably less RAM, but one renderer crash then fails every
  // running match on the node instead of one.
  workerLaunchArgs: String(process.env.WORKER_LAUNCH_ARGS || "")
    .split(/\s+/)
    .filter(Boolean),
  workerStartupTimeoutMs: readPositiveInteger("WORKER_STARTUP_TIMEOUT_MS", 45000, 5000, 120000),
  workerShutdownTimeoutMs: readPositiveInteger("WORKER_SHUTDOWN_TIMEOUT_MS", 5000, 1000, 30000),
  // Node-runtime only: V8 old-space cap per match worker thread. A match that
  // outgrows it dies alone (onFatal) instead of OOM-killing every match on the
  // node. Keep comfortably above a boss wave's working set.
  workerMaxOldHeapMb: readPositiveInteger("WORKER_MAX_OLD_HEAP_MB", 512, 128, 8192),
  // Node-runtime only: idle threads kept booted with the game bundle already
  // compiled, so the first room after a quiet period starts in ~1.5 s instead
  // of ~5 s. Each spare idles at a few tens of MB; 0 disables.
  warmSpareThreads: readPositiveInteger("WARM_SPARE_THREADS", 1, 0, 4),
  logLevel: process.env.LOG_LEVEL || "info",
  // An unset secret still boots (tests and `npm run server:start` never set it),
  // but the value is then per-process: every restart invalidates every reconnect
  // token. app.js refuses to start in production without a real one.
  resumeTokenSecret: process.env.RESUME_TOKEN_SECRET || crypto.randomBytes(32).toString("hex"),
  resumeTokenSecretConfigured: String(process.env.RESUME_TOKEN_SECRET || "").length >= 32,

  // Region identity and the director this server reports to. Leaving DIRECTOR_URL
  // empty keeps the single-server deployment working exactly as before: the
  // heartbeat simply never starts.
  regionId: String(process.env.REGION_ID || "").trim(),
  regionLabel: String(process.env.REGION_LABEL || "").trim(),
  // The public wss:// address players must use for this region. It has to be the
  // externally reachable one, not the container's internal port.
  regionPublicUrl: String(process.env.REGION_PUBLIC_URL || "").trim(),
  regionPriority: readSignedInteger("REGION_PRIORITY", 0, -1000, 1000),
  directorUrl: String(process.env.DIRECTOR_URL || "").trim().replace(/\/+$/, ""),
  directorToken: String(process.env.DIRECTOR_TOKEN || ""),
  regionHeartbeatIntervalMs: readPositiveInteger("REGION_HEARTBEAT_INTERVAL_MS", 10000, 1000, 5 * 60 * 1000),
});
