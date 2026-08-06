"use strict";

// Shared by the regional game server and the region director. It deliberately
// pulls in nothing but node:http types so the director image can ship without
// Playwright or Chromium.

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

const LOG_LEVEL_RANK = Object.freeze({ debug: 10, info: 20, warn: 30, error: 40, silent: 100 });

function logLevelRank(level) {
  return LOG_LEVEL_RANK[String(level || "").toLowerCase()] || LOG_LEVEL_RANK.info;
}

function defaultLogger(level, event, details) {
  const record = Object.assign({
    time: new Date().toISOString(),
    level: String(level || "info"),
    event: String(event || "server_event"),
  }, details || {});
  // LOG_LEVEL is honoured here so high-frequency lobby churn can be turned down
  // without editing call sites; it was previously read but never applied.
  if (logLevelRank(record.level) < logLevelRank(process.env.LOG_LEVEL || "info")) return;
  const line = JSON.stringify(record) + "\n";
  if (record.level === "error" || record.level === "warn") process.stderr.write(line);
  else process.stdout.write(line);
}

module.exports = {
  closeHttpServer,
  defaultLogger,
  listen,
  logLevelRank,
};
