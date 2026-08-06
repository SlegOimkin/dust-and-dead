"use strict";

const crypto = require("node:crypto");
const protocol = require("../multiplayer-protocol.js");

function timingSafeEqualText(left, right) {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

class SessionStore {
  constructor(options) {
    const settings = options || {};
    this.secret = String(settings.secret || crypto.randomBytes(32).toString("hex"));
    this.sessions = new Map();
    this.playerSessions = new Map();
  }

  hashToken(token) {
    return crypto.createHmac("sha256", this.secret).update(String(token || "")).digest("hex");
  }

  issueToken(session) {
    const token = crypto.randomBytes(32).toString("base64url");
    session.resumeTokenHash = this.hashToken(token);
    return token;
  }

  create(profile) {
    const data = profile || {};
    const session = {
      id: "session_" + crypto.randomBytes(16).toString("base64url"),
      playerId: "player_" + crypto.randomBytes(12).toString("base64url"),
      name: protocol.normalizePlayerName(data.name),
      unlocks: data.unlocks && typeof data.unlocks === "object" ? data.unlocks : null,
      cosmetics: data.cosmetics && typeof data.cosmetics === "object" ? data.cosmetics : null,
      roomId: "",
      socket: null,
      connectionEpoch: 0,
      connected: false,
      disconnectedAt: 0,
      expiryTimer: null,
      createdAt: Date.now(),
      lastSeenAt: Date.now(),
      resumeTokenHash: "",
      outbound: null,
    };
    const resumeToken = this.issueToken(session);
    this.sessions.set(session.id, session);
    this.playerSessions.set(session.playerId, session.id);
    return { session, resumeToken };
  }

  resume(sessionId, token) {
    const session = this.sessions.get(String(sessionId || ""));
    if (!session || !token) return null;
    const expected = session.resumeTokenHash;
    const actual = this.hashToken(token);
    if (!timingSafeEqualText(expected, actual)) return null;
    const resumeToken = this.issueToken(session);
    session.lastSeenAt = Date.now();
    return { session, resumeToken };
  }

  get(sessionId) {
    return this.sessions.get(String(sessionId || "")) || null;
  }

  getByPlayerId(playerId) {
    const sessionId = this.playerSessions.get(String(playerId || ""));
    return sessionId ? this.get(sessionId) : null;
  }

  delete(sessionId) {
    const session = this.get(sessionId);
    if (!session) return false;
    if (session.expiryTimer) clearTimeout(session.expiryTimer);
    this.sessions.delete(session.id);
    this.playerSessions.delete(session.playerId);
    session.socket = null;
    session.connected = false;
    return true;
  }

  dispose() {
    for (const session of this.sessions.values()) {
      if (session.expiryTimer) clearTimeout(session.expiryTimer);
    }
    this.sessions.clear();
    this.playerSessions.clear();
  }
}

module.exports = {
  SessionStore,
  timingSafeEqualText,
};
