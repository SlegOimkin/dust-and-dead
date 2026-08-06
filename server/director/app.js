"use strict";

const http = require("node:http");

const defaultConfig = require("./config.js");
const { RegionRegistry } = require("./registry.js");
const { createDirectorHandler } = require("./http.js");
const { closeHttpServer, defaultLogger, listen } = require("../http-util.js");

function createDirectorApplication(options) {
  const settings = options || {};
  const config = Object.assign({}, defaultConfig, settings.config || {});
  const log = settings.log === false
    ? function () {}
    : typeof settings.log === "function" ? settings.log : defaultLogger;
  const registry = settings.registry || new RegionRegistry({
    clock: settings.clock,
    regionTtlMs: config.regionTtlMs,
    claimTtlMs: config.claimTtlMs,
    maxRegions: config.maxRegions,
    maxClaims: config.maxClaims,
    maxCodesPerRegion: config.maxCodesPerRegion,
    protocolVersion: config.protocolVersion,
    staticRegions: config.staticRegions,
  });
  const handler = createDirectorHandler({ registry, config, log });
  const httpServer = settings.httpServer || http.createServer(handler);
  httpServer.requestTimeout = 15000;
  httpServer.headersTimeout = 10000;
  httpServer.keepAliveTimeout = 5000;
  httpServer.maxHeadersCount = 64;
  httpServer.on("clientError", (error, socket) => {
    if (socket.writable) socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");
    else socket.destroy();
  });
  let started = false;
  let closing = false;

  return {
    config,
    registry,
    httpServer,
    async start() {
      if (started) return this.address();
      if (closing) throw new Error("application_closing");
      const requestedPort = Number.isInteger(Number(settings.port)) ? Number(settings.port) : Number(config.port);
      const host = settings.host != null ? String(settings.host) : String(config.host || "0.0.0.0");
      const address = await listen(httpServer, requestedPort, host);
      started = true;
      log("info", "director_started", {
        host,
        port: address.port,
        protocolVersion: config.protocolVersion,
        declaredRegions: registry.regions.size,
        heartbeatAuth: config.heartbeatToken ? "enabled" : "disabled",
      });
      return this.address();
    },
    address() {
      const address = httpServer.address();
      if (!address || typeof address === "string") return address;
      return {
        host: address.address,
        port: address.port,
        family: address.family,
        httpUrl: "http://127.0.0.1:" + address.port,
      };
    },
    readiness() {
      return registry.readiness();
    },
    metrics() {
      return registry.metrics();
    },
    async close() {
      if (closing) return;
      closing = true;
      await closeHttpServer(httpServer);
      started = false;
      log("info", "director_stopped");
    },
  };
}

module.exports = {
  createDirectorApplication,
};
