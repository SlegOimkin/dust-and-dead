"use strict";

const protocol = require("../multiplayer-protocol.js");

function encodeGameMessage(message) {
  const json = JSON.stringify(message);
  const bytes = Buffer.from(json, "utf8");
  if (bytes.length > protocol.MAX_WIRE_BYTES) throw new Error("wire_message_too_large");
  return bytes.toString("base64");
}

function decodeGameMessage(data) {
  if (typeof data !== "string" || !data || data.length > Math.ceil(protocol.MAX_WIRE_BYTES * 4 / 3) + 8) {
    throw new Error("invalid_wire_payload");
  }
  const bytes = Buffer.from(data, "base64");
  if (!bytes.length || bytes.length > protocol.MAX_WIRE_BYTES) throw new Error("invalid_wire_payload");
  const message = JSON.parse(bytes.toString("utf8"));
  if (!message || typeof message !== "object" || Array.isArray(message) || typeof message.type !== "string") {
    throw new Error("invalid_wire_message");
  }
  return message;
}

module.exports = {
  encodeGameMessage,
  decodeGameMessage,
};
