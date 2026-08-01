"use strict";

const fs = require("node:fs");
const path = require("node:path");

const MIME_TYPES = Object.freeze({
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8",
});

const STATIC_FILES = new Set([
  "index.html",
  "styles.css",
  "build-profile.js",
  "multiplayer-protocol.js",
  "online-config.js",
  "localization.js",
  "locales/ui.js",
  "locales/gameplay.js",
  "locales/progression.js",
  "game.js",
  "progression.js",
  "hordeheart-model.js",
  "land-eater-model.js",
  "vendor/three.min.js",
]);

function writeJson(response, status, body) {
  const payload = Buffer.from(JSON.stringify(body));
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": payload.length,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(payload);
}

function createStaticHandler(options) {
  const settings = options || {};
  const root = path.resolve(settings.root || path.join(__dirname, ".."));
  const getReadiness = settings.getReadiness || function () { return { ready: true }; };
  const getMetrics = settings.getMetrics || function () { return {}; };

  return function handleRequest(request, response) {
    const parsed = new URL(request.url || "/", "http://localhost");
    if (request.method !== "GET" && request.method !== "HEAD") {
      writeJson(response, 405, { error: "method_not_allowed" });
      return;
    }
    if (parsed.pathname === "/healthz") {
      writeJson(response, 200, { ok: true, uptime: Math.floor(process.uptime()) });
      return;
    }
    if (parsed.pathname === "/readyz") {
      const readiness = getReadiness();
      writeJson(response, readiness.ready ? 200 : 503, readiness);
      return;
    }
    if (parsed.pathname === "/metrics") {
      writeJson(response, 200, getMetrics());
      return;
    }

    let relative = parsed.pathname === "/" ? "index.html" : parsed.pathname.replace(/^\/+/, "");
    try {
      relative = decodeURIComponent(relative).replace(/\\/g, "/");
    } catch (error) {
      writeJson(response, 400, { error: "invalid_path" });
      return;
    }
    if (!STATIC_FILES.has(relative)) {
      writeJson(response, 404, { error: "not_found" });
      return;
    }
    const filePath = path.resolve(root, relative);
    if (filePath !== root && !filePath.startsWith(root + path.sep)) {
      writeJson(response, 404, { error: "not_found" });
      return;
    }
    fs.stat(filePath, (statError, stat) => {
      if (statError || !stat.isFile()) {
        writeJson(response, 404, { error: "not_found" });
        return;
      }
      response.writeHead(200, {
        "Content-Type": MIME_TYPES[path.extname(filePath)] || "application/octet-stream",
        "Content-Length": stat.size,
        "Cache-Control": relative === "index.html" || relative === "online-config.js"
          ? "no-cache"
          : "public, max-age=300",
        "X-Content-Type-Options": "nosniff",
        "Cross-Origin-Resource-Policy": "same-origin",
      });
      if (request.method === "HEAD") {
        response.end();
        return;
      }
      const stream = fs.createReadStream(filePath);
      stream.on("error", () => response.destroy());
      stream.pipe(response);
    });
  };
}

module.exports = {
  STATIC_FILES,
  createStaticHandler,
  writeJson,
};
