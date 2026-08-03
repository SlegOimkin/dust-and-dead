"use strict";

// Builds the browser-like environment a dedicated authority match runs in when
// it is hosted by Node instead of Chromium. The game is NOT rewritten: the very
// same game.js the client ships runs here inside jsdom, with
// ?dedicatedServer=1 engaging the exact headless-authority code paths (renderer
// stub, no draw calls) that were already validated under the browser runtime.
// Anything the simulation is allowed to touch must behave like the browser;
// anything render-only may be inert.

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { webcrypto } = require("node:crypto");
const { JSDOM, VirtualConsole } = require("jsdom");

const FRAME_MS = 1000 / 60;
// If the event loop stalls longer than this, the frame target resets instead of
// replaying a burst of catch-up frames; the game's own fixed-step accumulator
// handles the missing time exactly as it does after a browser hitch.
const FRAME_RESYNC_MS = 250;
// Pacing is done with setTimeout only. setImmediate looks attractive (a raw
// benchmark clocks ~900k/s) but an unref'd immediate is barely serviced on an
// otherwise idle loop — measured at 1 wakeup/s here, which stalls the match.
// A plain deadline-corrected setTimeout holds a steady ~60 Hz.

const SCRIPT_TAG_PATTERN = /<script\s+src="([^"?]+)(?:\?[^"]*)?"/g;

// The localization stack is display-only: localizeSpec touches only
// title/subtitle/label/description strings, never a number the simulation
// uses, and every game.js helper (tr/trText/trPlural/trSpec) falls back
// cleanly when window.DustAndDeadI18n is absent. Skipping it saves ~345 KB of
// source per isolate plus a MutationObserver that regex-scans every DOM
// mutation. The four files must be dropped TOGETHER: the gameplay and
// progression locale packs throw at load when DustAndDeadI18n is missing.
function isAuthoritySkippedScript(file) {
  return file === "localization.js" || file.startsWith("locales/");
}

function extractScriptFiles(indexHtml) {
  const files = [];
  let match;
  while ((match = SCRIPT_TAG_PATTERN.exec(indexHtml)) !== null) files.push(match[1]);
  return files.filter((file) => !isAuthoritySkippedScript(file));
}

// One bundle serves every match on the node: the html, the script sources and
// their compile order, read from the same root the static handler serves to
// real clients — so the authority always runs the exact bytes players run.
function loadAuthorityBundle(root) {
  const resolvedRoot = path.resolve(root);
  const indexHtml = fs.readFileSync(path.join(resolvedRoot, "index.html"), "utf8");
  const files = extractScriptFiles(indexHtml);
  if (!files.includes("game.js")) {
    throw new Error("authority_bundle_missing_game_script");
  }
  const scripts = files.map((file) => ({
    file,
    source: fs.readFileSync(path.join(resolvedRoot, file.replace(/\//g, path.sep)), "utf8"),
  }));
  return { root: resolvedRoot, indexHtml, scripts };
}

function installAnimationFrameDriver(window, onFrameError) {
  let nextId = 1;
  let callbacks = new Map();
  let timer = null;
  let stopped = false;
  let target = window.performance.now() + FRAME_MS;

  window.requestAnimationFrame = function (callback) {
    const id = nextId;
    nextId += 1;
    callbacks.set(id, callback);
    return id;
  };
  window.cancelAnimationFrame = function (id) {
    callbacks.delete(id);
  };

  function schedule(delayMs) {
    timer = setTimeout(pump, Math.max(0, delayMs));
    if (timer && typeof timer.unref === "function") timer.unref();
  }

  function pump() {
    timer = null;
    if (stopped) return;
    const now = window.performance.now();
    if (callbacks.size) {
      const batch = callbacks;
      callbacks = new Map();
      for (const callback of batch.values()) {
        try {
          callback(now);
        } catch (error) {
          onFrameError(error);
          return;
        }
      }
    }
    target += FRAME_MS;
    if (target < now - FRAME_RESYNC_MS) target = now + FRAME_MS;
    schedule(target - window.performance.now());
  }

  schedule(FRAME_MS);

  return {
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      callbacks.clear();
    },
  };
}

// The minimap and a few effects paint onto 2D canvases. Nobody sees the
// authority's pixels, so a permissive no-op context keeps that code running
// without pulling a native canvas implementation into the server.
function installCanvasStub(window) {
  const noop = function () {};
  function createContextStub(canvas) {
    const gradient = { addColorStop: noop };
    const base = {
      canvas,
      save: noop, restore: noop, beginPath: noop, closePath: noop,
      moveTo: noop, lineTo: noop, arc: noop, arcTo: noop, rect: noop,
      fill: noop, stroke: noop, clip: noop, clearRect: noop, fillRect: noop,
      strokeRect: noop, fillText: noop, strokeText: noop,
      drawImage: noop, putImageData: noop, setTransform: noop, transform: noop,
      translate: noop, rotate: noop, scale: noop, setLineDash: noop,
      quadraticCurveTo: noop, bezierCurveTo: noop, ellipse: noop,
      createLinearGradient: function () { return gradient; },
      createRadialGradient: function () { return gradient; },
      createPattern: function () { return null; },
      measureText: function () { return { width: 1 }; },
      getImageData: function () {
        return { data: new Uint8ClampedArray(4), width: 1, height: 1 };
      },
      createImageData: function (w, h) {
        const width = Math.max(1, Number(w) || 1);
        const height = Math.max(1, Number(h) || 1);
        return { data: new Uint8ClampedArray(width * height * 4), width, height };
      },
    };
    // Unknown members resolve to a shared no-op so a future drawing call cannot
    // crash a match; property writes (fillStyle, font, ...) land normally.
    return new Proxy(base, {
      get(target, property) {
        if (property in target) return target[property];
        return noop;
      },
    });
  }
  const contexts = new WeakMap();
  window.HTMLCanvasElement.prototype.getContext = function (type) {
    if (type !== "2d") return null;
    let context = contexts.get(this);
    if (!context) {
      context = createContextStub(this);
      contexts.set(this, context);
    }
    return context;
  };
  window.HTMLCanvasElement.prototype.toDataURL = function () { return "data:,"; };
}

// Compiles the bundle once. The returned scripts are context-free: the same
// compiled script can instantiate into any number of jsdom windows, so a
// thread hosting several matches parses game.js once instead of per match.
function compileAuthorityScripts(bundle) {
  if (!bundle || !Array.isArray(bundle.scripts)) throw new Error("authority_bundle_required");
  return {
    indexHtml: bundle.indexHtml,
    scripts: bundle.scripts.map((entry) => ({
      file: entry.file,
      script: new vm.Script(entry.source, { filename: entry.file }),
    })),
  };
}

function createAuthorityEnvironment(options) {
  const settings = options || {};
  const compiled = settings.compiled
    ? settings.compiled
    : compileAuthorityScripts(settings.bundle);
  const mapSeed = Number(settings.mapSeed) || 0;
  const onConsole = typeof settings.onConsole === "function" ? settings.onConsole : function () {};
  const onFatal = typeof settings.onFatal === "function" ? settings.onFatal : function () {};

  const virtualConsole = new VirtualConsole();
  virtualConsole.on("error", (...args) => onConsole("error", args.map(String).join(" ")));
  virtualConsole.on("warn", (...args) => onConsole("warning", args.map(String).join(" ")));
  virtualConsole.on("jsdomError", (error) => {
    onConsole("error", "jsdom: " + (error && error.message || String(error)));
  });

  const dom = new JSDOM(compiled.indexHtml, {
    // The query string is the contract: game.js reads dedicatedServer=1 and
    // boots straight into the proven headless-authority mode.
    url: "http://dedicated-authority.local/?dedicatedServer=1&mapSeed=" + mapSeed,
    runScripts: "outside-only",
    pretendToBeVisual: true,
    virtualConsole,
  });
  const window = dom.window;

  // Match the browser worker's viewport so anything derived from window size
  // (camera frustum, layout-driven constants) is identical across runtimes.
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 960 });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: 540 });
  window.devicePixelRatio = 1;
  if (!window.TextEncoder) window.TextEncoder = TextEncoder;
  if (!window.TextDecoder) window.TextDecoder = TextDecoder;
  if (!window.crypto || typeof window.crypto.getRandomValues !== "function") {
    Object.defineProperty(window, "crypto", { configurable: true, value: webcrypto });
  }
  installCanvasStub(window);

  const frameDriver = installAnimationFrameDriver(window, (error) => {
    // A throw escaping the frame loop is what "pageerror" meant in the browser
    // runtime: the match is broken and must fail loudly, not tick on silently.
    onFatal(error instanceof Error ? error : new Error(String(error)));
  });
  window.addEventListener("error", (event) => {
    onFatal(event.error instanceof Error ? event.error : new Error(String(event.message || "window_error")));
  });

  const context = dom.getInternalVMContext();
  for (const entry of compiled.scripts) {
    entry.script.runInContext(context);
  }
  if (!window.__dustDedicatedServer || typeof window.__dustDedicatedServer.start !== "function") {
    frameDriver.stop();
    window.close();
    throw new Error("authoritative_runtime_missing");
  }

  return {
    window,
    vmContext: context,
    dispose() {
      frameDriver.stop();
      try { window.close(); } catch (error) {}
    },
  };
}

module.exports = {
  compileAuthorityScripts,
  createAuthorityEnvironment,
  extractScriptFiles,
  loadAuthorityBundle,
};
