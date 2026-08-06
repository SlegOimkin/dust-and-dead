"use strict";

const http = require("node:http");
const path = require("node:path");

const defaultConfig = require("./config.js");
const { GameWorkerManager } = require("./game-worker.js");
const { NodeGameWorkerManager } = require("./node-game-worker.js");
const { OnlineMultiplayerServer } = require("./online-server.js");
const { RegionHeartbeat } = require("./region-heartbeat.js");
const { createStaticHandler } = require("./static-handler.js");
const { closeHttpServer, defaultLogger, listen } = require("./http-util.js");

function createOnlineApplication(options) {
  const settings = options || {};
  const config = Object.assign({}, defaultConfig, settings.config || {});
  const root = path.resolve(settings.root || path.join(__dirname, ".."));
  const log = settings.log === false
    ? function () {}
    : typeof settings.log === "function" ? settings.log : defaultLogger;
  let onlineServer = null;
  let workerManager = settings.workerManager || null;
  let ownsWorkerManager = !workerManager;
  let started = false;
  let closing = false;
  const heartbeat = settings.regionHeartbeat === false ? null : new RegionHeartbeat({
    directorUrl: config.directorUrl,
    token: config.directorToken,
    regionId: config.regionId,
    regionLabel: config.regionLabel || config.regionId,
    regionUrl: config.regionPublicUrl,
    priority: config.regionPriority,
    intervalMs: config.regionHeartbeatIntervalMs,
    log,
    getState() {
      return onlineServer ? onlineServer.regionSnapshot() : { ready: false, accepting: false };
    },
  });

  const handler = createStaticHandler({
    root,
    getReadiness() {
      if (!onlineServer) return { ready: false, acceptingConnections: false };
      return onlineServer.readiness();
    },
    getMetrics() {
      return onlineServer ? onlineServer.metrics() : { activeConnections: 0, ready: false };
    },
  });
  const httpServer = settings.httpServer || http.createServer(handler);
  httpServer.requestTimeout = 15000;
  httpServer.headersTimeout = 10000;
  httpServer.keepAliveTimeout = 5000;
  httpServer.maxHeadersCount = 64;
  httpServer.on("clientError", (error, socket) => {
    if (socket.writable) socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");
    else socket.destroy();
  });

  return {
    config,
    httpServer,
    get onlineServer() { return onlineServer; },
    get workerManager() { return workerManager; },
    async start() {
      if (started) return this.address();
      if (closing) throw new Error("application_closing");
      // A shipped image runs with NODE_ENV=production, so these two misconfigs
      // fail loudly at boot instead of silently degrading every player's session.
      if (process.env.NODE_ENV === "production") {
        if (!config.resumeTokenSecretConfigured) {
          throw new Error("RESUME_TOKEN_SECRET must be set to at least 32 characters in production");
        }
        if (!config.publicOrigin && !(config.allowedOrigins || []).length) {
          throw new Error("Set PUBLIC_ORIGIN or ALLOWED_ORIGINS so browser origins are enforced");
        }
      } else if (!config.resumeTokenSecretConfigured) {
        log("warn", "resume_secret_ephemeral", {
          detail: "RESUME_TOKEN_SECRET is unset; reconnect tokens die with this process",
        });
      }
      const requestedPort = Number.isInteger(Number(settings.port))
        ? Number(settings.port)
        : Number(config.port);
      const host = settings.host != null ? String(settings.host) : String(config.host || "0.0.0.0");
      if (!workerManager) {
        workerManager = config.matchRuntime === "browser"
          ? new GameWorkerManager({
            // The actual ephemeral/listening port is assigned immediately after
            // the upgrade handler is installed below.
            baseUrl: "http://127.0.0.1:1",
            maxMatches: config.maxMatches,
            startupTimeoutMs: config.workerStartupTimeoutMs,
            shutdownTimeoutMs: config.workerShutdownTimeoutMs,
            logLevel: config.logLevel,
            launchArgs: config.workerLaunchArgs,
          })
          : new NodeGameWorkerManager({
            // The node runtime reads the game straight from disk: matches load
            // the exact files the static handler serves to real clients.
            root,
            maxMatches: config.maxMatches,
            matchesPerWorker: config.matchesPerWorker,
            startupTimeoutMs: config.workerStartupTimeoutMs,
            shutdownTimeoutMs: config.workerShutdownTimeoutMs,
            logLevel: config.logLevel,
            workerMaxOldHeapMb: config.workerMaxOldHeapMb,
            warmSpareThreads: config.warmSpareThreads,
          });
        ownsWorkerManager = true;
      }
      try {
        onlineServer = new OnlineMultiplayerServer({
          httpServer,
          workerManager,
          config,
          log,
        });
        const address = await listen(httpServer, requestedPort, host);
        const internalHost = String(address.address).includes(":") ? "[::1]" : "127.0.0.1";
        if (ownsWorkerManager) {
          if (config.matchRuntime === "browser") {
            workerManager.baseUrl = "http://" + internalHost + ":" + address.port;
          }
          // Warmed here rather than on the first match so a host that cannot
          // run matches (no Chromium / unreadable game bundle) fails at boot,
          // and /readyz never reports ready before matches can actually start.
          if (settings.warmBrowser !== false) await workerManager.ensureBrowser();
        }
        started = true;
        log("info", "server_started", {
          host,
          port: address.port,
          protocolVersion: require("../multiplayer-protocol.js").VERSION,
          regionId: config.regionId || "",
          matchRuntime: config.matchRuntime,
        });
        // Started last so the first beat already reports a listening server.
        if (heartbeat) heartbeat.start();
        return this.address();
      } catch (error) {
        if (heartbeat) await heartbeat.stop();
        if (onlineServer) await onlineServer.close().catch(() => {});
        onlineServer = null;
        if (ownsWorkerManager && workerManager) await workerManager.close().catch(() => {});
        await closeHttpServer(httpServer);
        throw error;
      }
    },
    address() {
      const address = httpServer.address();
      if (!address || typeof address === "string") return address;
      return {
        host: address.address,
        port: address.port,
        family: address.family,
        httpUrl: "http://127.0.0.1:" + address.port,
        websocketUrl: "ws://127.0.0.1:" + address.port + "/online",
      };
    },
    readiness() {
      return onlineServer ? onlineServer.readiness() : { ready: false, acceptingConnections: false };
    },
    metrics() {
      return onlineServer ? onlineServer.metrics() : { activeConnections: 0, ready: false };
    },
    get regionHeartbeat() { return heartbeat; },
    async close() {
      if (closing) return;
      closing = true;
      if (heartbeat) await heartbeat.stop();
      if (onlineServer) await onlineServer.close();
      onlineServer = null;
      if (workerManager && (ownsWorkerManager || settings.closeWorkerManager !== false)) {
        await workerManager.close();
      }
      await closeHttpServer(httpServer);
      started = false;
      log("info", "server_stopped");
    },
  };
}

module.exports = {
  closeHttpServer,
  createOnlineApplication,
  defaultLogger,
  listen,
};
