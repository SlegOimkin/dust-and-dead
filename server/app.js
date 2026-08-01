"use strict";

const http = require("node:http");
const path = require("node:path");

const defaultConfig = require("./config.js");
const { GameWorkerManager } = require("./game-worker.js");
const { OnlineMultiplayerServer } = require("./online-server.js");
const { createStaticHandler } = require("./static-handler.js");

function listen(server, port, host) {
  return new Promise((resolve, reject) => {
    const onError = (error) => {
      server.removeListener("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      server.removeListener("error", onError);
      resolve(server.address());
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, host);
  });
}

function closeHttpServer(server) {
  if (!server.listening) return Promise.resolve();
  return new Promise((resolve) => {
    server.close(() => resolve());
    if (typeof server.closeIdleConnections === "function") server.closeIdleConnections();
  });
}

function defaultLogger(level, event, details) {
  const record = Object.assign({
    time: new Date().toISOString(),
    level: String(level || "info"),
    event: String(event || "server_event"),
  }, details || {});
  const line = JSON.stringify(record) + "\n";
  if (record.level === "error" || record.level === "warn") process.stderr.write(line);
  else process.stdout.write(line);
}

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
      const requestedPort = Number.isInteger(Number(settings.port))
        ? Number(settings.port)
        : Number(config.port);
      const host = settings.host != null ? String(settings.host) : String(config.host || "0.0.0.0");
      if (!workerManager) {
        workerManager = new GameWorkerManager({
          // The actual ephemeral/listening port is assigned immediately after
          // the upgrade handler is installed below.
          baseUrl: "http://127.0.0.1:1",
          maxMatches: config.maxMatches,
          startupTimeoutMs: config.workerStartupTimeoutMs,
          shutdownTimeoutMs: config.workerShutdownTimeoutMs,
          logLevel: config.logLevel,
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
          workerManager.baseUrl = "http://" + internalHost + ":" + address.port;
        }
        started = true;
        log("info", "server_started", {
          host,
          port: address.port,
          protocolVersion: require("../multiplayer-protocol.js").VERSION,
        });
        return this.address();
      } catch (error) {
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
    async close() {
      if (closing) return;
      closing = true;
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
