"use strict";

// Process lifecycle shared by the regional game server and the region director:
// one graceful stop per signal, a hard exit if shutdown wedges, and JSON logs on
// stdout/stderr so a container runtime can consume them.

function writeRecord(stream, level, event, details) {
  stream.write(JSON.stringify(Object.assign({
    time: new Date().toISOString(),
    level,
    event,
  }, details || {})) + "\n");
}

function runService(createApplication, options) {
  const settings = options || {};
  const forceExitDelayMs = Math.max(1000, Number(settings.forceExitDelayMs) || 30000);
  const application = createApplication();
  let stopping = false;

  async function stop(signal) {
    if (stopping) return;
    stopping = true;
    writeRecord(process.stdout, "info", "shutdown_requested", { signal });
    const forceTimer = setTimeout(() => process.exit(1), forceExitDelayMs);
    if (forceTimer && typeof forceTimer.unref === "function") forceTimer.unref();
    try {
      await application.close();
      clearTimeout(forceTimer);
      process.exit(0);
    } catch (error) {
      clearTimeout(forceTimer);
      writeRecord(process.stderr, "error", "shutdown_failed", {
        error: error && error.message || String(error),
      });
      process.exit(1);
    }
  }

  process.once("SIGINT", () => { stop("SIGINT"); });
  process.once("SIGTERM", () => { stop("SIGTERM"); });
  process.on("uncaughtException", (error) => {
    writeRecord(process.stderr, "error", "uncaught_exception", {
      error: error && error.stack || String(error),
    });
    stop("uncaughtException");
  });
  process.on("unhandledRejection", (error) => {
    writeRecord(process.stderr, "error", "unhandled_rejection", {
      error: error && error.stack || String(error),
    });
    stop("unhandledRejection");
  });

  return application.start().then(() => application);
}

function reportStartupFailure(error) {
  writeRecord(process.stderr, "error", "startup_failed", {
    error: error && error.stack || String(error),
  });
  process.exit(1);
}

module.exports = {
  reportStartupFailure,
  runService,
};
