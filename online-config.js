(function (root) {
  "use strict";

  root.DustAndDeadOnlineConfig = Object.freeze({
    // Region director: the aggregator every client contacts first. It returns the
    // regional matchmaking servers; the client then measures latency to them and
    // connects to the fastest one. Leave empty to skip discovery and use `url`.
    directorUrl: "",
    // Direct fallback, used when no director is configured, when the director is
    // unreachable, or when it lists no usable region. Leave empty for a
    // same-origin WebSocket when the game is served by a matchmaking server.
    // Android/file builds must set a deployed https:// director or wss:// URL.
    url: "",
    path: "/online",
    reconnect: true,
    // How many regions are probed in parallel, and how long the whole latency
    // measurement may take before the best answer so far wins.
    regionProbeLimit: 4,
    regionProbeTimeoutMs: 2500,
  });
})(typeof globalThis !== "undefined" ? globalThis : this);
