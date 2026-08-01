(function (root) {
  "use strict";

  root.DustAndDeadOnlineConfig = Object.freeze({
    // Leave empty for same-origin WebSocket when the game is served by the
    // multiplayer server. Android/file builds must set a deployed wss:// URL.
    url: "",
    path: "/online",
    reconnect: true,
  });
})(typeof globalThis !== "undefined" ? globalThis : this);
