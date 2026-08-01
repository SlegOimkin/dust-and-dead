(function (root, factory) {
  var protocol = factory();
  if (typeof module === "object" && module.exports) module.exports = protocol;
  if (root) root.DustAndDeadMultiplayerProtocol = protocol;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var VERSION = 47;
  var MIN_PLAYERS = 2;
  var MAX_PLAYERS = 4;
  var AUTO_START_DELAY_MS = 40000;
  var START_ACK_TIMEOUT_MS = 12000;
  var RECONNECT_GRACE_MS = 20000;
  var MAX_PLAYER_NAME_LENGTH = 20;
  var MAX_SEARCH_CODE_LENGTH = 12;
  var MAX_WIRE_BYTES = 512 * 1024;

  function normalizePlayerName(value) {
    var name = String(value || "Cowboy")
      .replace(/[<>\u0000-\u001f]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return (name || "Cowboy").slice(0, MAX_PLAYER_NAME_LENGTH);
  }

  function normalizeSearchCode(value) {
    return String(value || "")
      .normalize("NFKC")
      .toUpperCase()
      .replace(/[^A-Z0-9-]/g, "")
      .slice(0, MAX_SEARCH_CODE_LENGTH);
  }

  function isProtocolVersion(value) {
    return Number(value) === VERSION;
  }

  function createPublicRoomKey(code) {
    var normalized = normalizeSearchCode(code);
    return normalized ? "code:" + normalized : "public";
  }

  return Object.freeze({
    VERSION: VERSION,
    MIN_PLAYERS: MIN_PLAYERS,
    MAX_PLAYERS: MAX_PLAYERS,
    AUTO_START_DELAY_MS: AUTO_START_DELAY_MS,
    START_ACK_TIMEOUT_MS: START_ACK_TIMEOUT_MS,
    RECONNECT_GRACE_MS: RECONNECT_GRACE_MS,
    MAX_PLAYER_NAME_LENGTH: MAX_PLAYER_NAME_LENGTH,
    MAX_SEARCH_CODE_LENGTH: MAX_SEARCH_CODE_LENGTH,
    MAX_WIRE_BYTES: MAX_WIRE_BYTES,
    normalizePlayerName: normalizePlayerName,
    normalizeSearchCode: normalizeSearchCode,
    isProtocolVersion: isProtocolVersion,
    createPublicRoomKey: createPublicRoomKey,
  });
});
