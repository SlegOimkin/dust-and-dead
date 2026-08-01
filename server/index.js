"use strict";

const { createOnlineApplication } = require("./app.js");

async function main() {
  const application = createOnlineApplication();
  let stopping = false;

  async function stop(signal) {
    if (stopping) return;
    stopping = true;
    process.stdout.write(JSON.stringify({
      time: new Date().toISOString(),
      level: "info",
      event: "shutdown_requested",
      signal,
    }) + "\n");
    const forceTimer = setTimeout(() => process.exit(1), 30000);
    if (forceTimer && typeof forceTimer.unref === "function") forceTimer.unref();
    try {
      await application.close();
      clearTimeout(forceTimer);
      process.exit(0);
    } catch (error) {
      clearTimeout(forceTimer);
      process.stderr.write(JSON.stringify({
        time: new Date().toISOString(),
        level: "error",
        event: "shutdown_failed",
        error: error && error.message || String(error),
      }) + "\n");
      process.exit(1);
    }
  }

  process.once("SIGINT", () => { stop("SIGINT"); });
  process.once("SIGTERM", () => { stop("SIGTERM"); });
  process.on("uncaughtException", (error) => {
    process.stderr.write(JSON.stringify({
      time: new Date().toISOString(),
      level: "error",
      event: "uncaught_exception",
      error: error && error.stack || String(error),
    }) + "\n");
    stop("uncaughtException");
  });
  process.on("unhandledRejection", (error) => {
    process.stderr.write(JSON.stringify({
      time: new Date().toISOString(),
      level: "error",
      event: "unhandled_rejection",
      error: error && error.stack || String(error),
    }) + "\n");
    stop("unhandledRejection");
  });

  await application.start();
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(JSON.stringify({
      time: new Date().toISOString(),
      level: "error",
      event: "startup_failed",
      error: error && error.stack || String(error),
    }) + "\n");
    process.exit(1);
  });
}

module.exports = { main };
