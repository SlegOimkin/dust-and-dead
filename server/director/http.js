"use strict";

const crypto = require("node:crypto");

const { TokenBucket } = require("../rate-limit.js");

const MAX_URL_LENGTH = 2048;

function getClientAddress(request, trustProxy) {
  if (trustProxy) {
    const forwarded = String(request.headers["x-forwarded-for"] || "").split(",")[0].trim();
    if (forwarded) return forwarded.slice(0, 80);
  }
  return String(request.socket && request.socket.remoteAddress || "unknown").slice(0, 80);
}

// The directory is public, non-credentialed data and has to be readable from the
// game's own origin, from a region's origin and from an Android WebView whose
// Origin is "null", so a wildcard is the only value that covers all three.
function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type, authorization",
    "Access-Control-Max-Age": "600",
    "Vary": "Origin",
  };
}

function writeJson(response, status, body, extraHeaders) {
  const payload = Buffer.from(JSON.stringify(body));
  response.writeHead(status, Object.assign({
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": payload.length,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  }, corsHeaders(), extraHeaders || {}));
  response.end(payload);
}

function readJsonBody(request, maxBytes) {
  return new Promise((resolve, reject) => {
    const declared = Number(request.headers["content-length"]);
    if (Number.isFinite(declared) && declared > maxBytes) {
      reject(new Error("payload_too_large"));
      return;
    }
    const chunks = [];
    let size = 0;
    let settled = false;
    function fail(error) {
      if (settled) return;
      settled = true;
      request.removeAllListeners("data");
      request.removeAllListeners("end");
      reject(error);
    }
    request.on("data", (chunk) => {
      if (settled) return;
      size += chunk.length;
      if (size > maxBytes) {
        fail(new Error("payload_too_large"));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      if (settled) return;
      settled = true;
      const text = Buffer.concat(chunks).toString("utf8");
      if (!text.trim()) {
        resolve({});
        return;
      }
      try {
        const parsed = JSON.parse(text);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          reject(new Error("invalid_body"));
          return;
        }
        resolve(parsed);
      } catch (error) {
        reject(new Error("invalid_body"));
      }
    });
    request.on("error", () => fail(new Error("invalid_body")));
    request.on("aborted", () => fail(new Error("invalid_body")));
  });
}

function timingSafeEqualText(left, right) {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);
}

function readBearerToken(request) {
  const header = String(request.headers.authorization || "");
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : "";
}

function createDirectorHandler(options) {
  const settings = options || {};
  const registry = settings.registry;
  const config = settings.config || {};
  const log = typeof settings.log === "function" ? settings.log : function () {};
  if (!registry) throw new Error("registry_required");
  const maxBodyBytes = Math.max(1024, Number(config.maxBodyBytes) || 64 * 1024);
  const buckets = new Map();
  const bucketSweepIntervalMs = 2 * 60 * 1000;
  let lastBucketSweepAt = 0;

  function takeToken(address, now) {
    if (now - lastBucketSweepAt > bucketSweepIntervalMs) {
      lastBucketSweepAt = now;
      for (const [key, bucket] of buckets) {
        if (now - bucket.updatedAt > bucketSweepIntervalMs) buckets.delete(key);
      }
    }
    let bucket = buckets.get(address);
    if (!bucket) {
      bucket = new TokenBucket(config.requestRatePerSecond || 20, config.requestRateBurst || 60);
      buckets.set(address, bucket);
    }
    return bucket.take(1);
  }

  async function handleHeartbeat(request, response) {
    const expected = String(config.heartbeatToken || "");
    if (!expected) {
      writeJson(response, 503, { error: "heartbeat_disabled" });
      return;
    }
    if (!timingSafeEqualText(expected, readBearerToken(request))) {
      writeJson(response, 401, { error: "unauthorized" });
      return;
    }
    let body;
    try {
      body = await readJsonBody(request, maxBodyBytes);
    } catch (error) {
      const tooLarge = error && error.message === "payload_too_large";
      writeJson(response, tooLarge ? 413 : 400, { error: error && error.message || "invalid_body" });
      return;
    }
    const result = registry.applyHeartbeat(body);
    if (!result.ok) {
      log("warn", "region_heartbeat_rejected", { error: result.error, regionId: String(body.id || "") });
      writeJson(response, 400, { ok: false, error: result.error });
      return;
    }
    writeJson(response, 200, {
      ok: true,
      regionId: result.regionId,
      intervalMs: config.heartbeatIntervalMs || 10000,
      serverNow: Date.now(),
    });
  }

  async function handleClaim(request, response) {
    let body;
    try {
      body = await readJsonBody(request, maxBodyBytes);
    } catch (error) {
      const tooLarge = error && error.message === "payload_too_large";
      writeJson(response, tooLarge ? 413 : 400, { error: error && error.message || "invalid_body" });
      return;
    }
    const result = registry.claimCode(body.code, body.regionId, Date.now());
    if (!result.ok) {
      writeJson(response, 409, { ok: false, error: result.error });
      return;
    }
    writeJson(response, 200, Object.assign({ ok: true, serverNow: Date.now() }, result));
  }

  return function handleRequest(request, response) {
    let parsed;
    const rawUrl = String(request.url || "/");
    if (rawUrl.length > MAX_URL_LENGTH) {
      writeJson(response, 414, { error: "uri_too_long" });
      return;
    }
    try {
      parsed = new URL(rawUrl, "http://localhost");
    } catch (error) {
      writeJson(response, 400, { error: "invalid_path" });
      return;
    }

    if (request.method === "OPTIONS") {
      response.writeHead(204, Object.assign({ "Content-Length": 0 }, corsHeaders()));
      response.end();
      return;
    }

    const address = getClientAddress(request, config.trustProxy === true);
    if (!takeToken(address, Date.now())) {
      writeJson(response, 429, { error: "rate_limited" }, { "Retry-After": "1" });
      return;
    }

    const path = parsed.pathname;
    if (request.method === "GET" || request.method === "HEAD") {
      if (path === "/healthz") {
        writeJson(response, 200, { ok: true, uptime: Math.floor(process.uptime()) });
        return;
      }
      if (path === "/readyz") {
        const readiness = registry.readiness();
        writeJson(response, readiness.ready ? 200 : 503, readiness);
        return;
      }
      if (path === "/metrics") {
        writeJson(response, 200, Object.assign({ uptime: Math.floor(process.uptime()) }, registry.metrics()));
        return;
      }
      if (path === "/v1/regions") {
        const directory = registry.directory(parsed.searchParams.get("code") || "");
        writeJson(response, 200, Object.assign({
          ttlMs: config.regionsCacheTtlMs || 30000,
          heartbeatIntervalMs: config.heartbeatIntervalMs || 10000,
        }, directory));
        return;
      }
      writeJson(response, 404, { error: "not_found" });
      return;
    }

    if (request.method === "POST") {
      if (path === "/v1/regions/heartbeat") {
        handleHeartbeat(request, response).catch(() => {
          if (!response.headersSent) writeJson(response, 500, { error: "internal_error" });
        });
        return;
      }
      if (path === "/v1/route/claim") {
        handleClaim(request, response).catch(() => {
          if (!response.headersSent) writeJson(response, 500, { error: "internal_error" });
        });
        return;
      }
      writeJson(response, 404, { error: "not_found" });
      return;
    }

    writeJson(response, 405, { error: "method_not_allowed" });
  };
}

module.exports = {
  createDirectorHandler,
  getClientAddress,
  readJsonBody,
  timingSafeEqualText,
  writeJson,
};
