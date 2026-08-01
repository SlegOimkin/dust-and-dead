"use strict";

const protocol = require("../multiplayer-protocol.js");

function defaultClock() {
  return Date.now();
}

function defaultSchedule(callback, delay) {
  const timer = setTimeout(callback, delay);
  if (timer && typeof timer.unref === "function") timer.unref();
  return timer;
}

function clonePublicPlayer(player) {
  return {
    id: player.id,
    name: player.name,
    ready: !!player.ready,
    connected: player.connected !== false,
    autoReady: !!player.autoReady,
    cosmetics: player.cosmetics || null,
  };
}

class MatchRoom {
  constructor(options) {
    const settings = options || {};
    this.id = String(settings.id || "");
    this.key = String(settings.key || "public");
    this.searchCode = protocol.normalizeSearchCode(settings.searchCode);
    this.minPlayers = settings.minPlayers || protocol.MIN_PLAYERS;
    this.maxPlayers = settings.maxPlayers || protocol.MAX_PLAYERS;
    this.autoStartDelayMs = settings.autoStartDelayMs || protocol.AUTO_START_DELAY_MS;
    this.clock = settings.clock || defaultClock;
    this.schedule = settings.schedule || defaultSchedule;
    this.cancelSchedule = settings.cancelSchedule || clearTimeout;
    this.onState = typeof settings.onState === "function" ? settings.onState : function () {};
    this.onStartRequested = typeof settings.onStartRequested === "function"
      ? settings.onStartRequested
      : function () {};
    this.phase = "lobby";
    this.players = new Map();
    this.revision = 0;
    this.createdAt = this.clock();
    this.autoStartAt = 0;
    this.autoStartKey = "";
    this.autoStartTimer = null;
    this.startReason = "";
    this.matchId = "";
    this.mapSeed = 0;
    this.lastError = "";
    this.disposed = false;
  }

  get size() {
    return this.players.size;
  }

  canJoin() {
    return !this.disposed && this.phase === "lobby" && this.players.size < this.maxPlayers;
  }

  addPlayer(player) {
    if (!this.canJoin()) throw new Error("room_unavailable");
    if (!player || !player.id) throw new Error("invalid_player");
    if (this.players.has(player.id)) throw new Error("duplicate_player");
    player.name = protocol.normalizePlayerName(player.name);
    player.ready = false;
    player.autoReady = false;
    player.connected = true;
    player.roomId = this.id;
    this.players.set(player.id, player);
    this.bump("player_joined", true);
    return this.snapshot();
  }

  removePlayer(playerId, reason) {
    const player = this.players.get(playerId);
    if (!player) return false;
    this.players.delete(playerId);
    player.roomId = "";
    this.bump(reason || "player_left", true);
    return true;
  }

  setConnected(playerId, connected) {
    const player = this.players.get(playerId);
    if (!player) return false;
    const next = !!connected;
    if (player.connected === next) return true;
    player.connected = next;
    if (!next && this.phase === "lobby") player.ready = false;
    this.bump(next ? "player_reconnected" : "player_disconnected", this.phase === "lobby");
    return true;
  }

  setReady(playerId, ready, profile) {
    if (this.phase !== "lobby") return false;
    const player = this.players.get(playerId);
    if (!player || player.connected === false) return false;
    const next = !!ready;
    if (profile && typeof profile === "object") {
      if (profile.unlocks && typeof profile.unlocks === "object") player.unlocks = profile.unlocks;
      if (profile.cosmetics && typeof profile.cosmetics === "object") player.cosmetics = profile.cosmetics;
    }
    if (player.ready === next && !player.autoReady) return true;
    player.ready = next;
    player.autoReady = false;
    this.bump("ready_changed", false);
    return true;
  }

  connectedPlayers() {
    return Array.from(this.players.values()).filter((player) => player.connected !== false);
  }

  publicPlayers() {
    return Array.from(this.players.values()).map(clonePublicPlayer);
  }

  readinessState() {
    const allPlayers = Array.from(this.players.values());
    const players = allPlayers.filter((player) => player.connected !== false);
    const unready = players.filter((player) => !player.ready);
    return {
      playerCount: players.length,
      readyCount: players.length - unready.length,
      unready: unready,
      eligible: players.length >= this.minPlayers,
      hasDisconnected: allPlayers.some((player) => player.connected === false),
    };
  }

  bump(reason, rosterChanged) {
    if (this.disposed) return;
    this.revision += 1;
    this.lastError = "";
    this.evaluateStart(!!rosterChanged);
    this.onState(this, reason || "updated");
  }

  evaluateStart(rosterChanged) {
    if (this.phase !== "lobby" || this.disposed) {
      this.clearAutoStart();
      return;
    }
    const state = this.readinessState();
    if (!state.eligible || state.hasDisconnected) {
      this.clearAutoStart();
      return;
    }
    if (state.unready.length === 0) {
      this.clearAutoStart();
      this.requestStart("all_ready", []);
      return;
    }
    if (state.unready.length !== 1) {
      this.clearAutoStart();
      return;
    }

    const key = this.connectedPlayers().map((player) => player.id).sort().join(",") + "|" + state.unready[0].id;
    if (rosterChanged || !this.autoStartAt || this.autoStartKey !== key) {
      this.clearAutoStart();
      this.autoStartKey = key;
      this.autoStartAt = this.clock() + this.autoStartDelayMs;
      this.autoStartTimer = this.schedule(() => {
        this.autoStartTimer = null;
        this.finishAutoStart(key);
      }, this.autoStartDelayMs);
    }
  }

  finishAutoStart(expectedKey) {
    if (this.phase !== "lobby" || this.disposed || this.autoStartKey !== expectedKey) return;
    const state = this.readinessState();
    if (!state.eligible || state.hasDisconnected || state.unready.length !== 1) {
      this.clearAutoStart();
      this.revision += 1;
      this.onState(this, "countdown_cancelled");
      return;
    }
    const forcedPlayer = state.unready[0];
    forcedPlayer.ready = true;
    forcedPlayer.autoReady = true;
    this.clearAutoStart();
    this.revision += 1;
    this.onState(this, "countdown_elapsed");
    this.requestStart("countdown", [forcedPlayer.id]);
  }

  clearAutoStart() {
    if (this.autoStartTimer) this.cancelSchedule(this.autoStartTimer);
    this.autoStartTimer = null;
    this.autoStartAt = 0;
    this.autoStartKey = "";
  }

  requestStart(reason, forcedPlayerIds) {
    if (this.phase !== "lobby" || this.disposed) return false;
    const state = this.readinessState();
    if (!state.eligible || state.hasDisconnected || state.unready.length) return false;
    this.phase = "preparing";
    this.startReason = reason || "all_ready";
    this.clearAutoStart();
    this.revision += 1;
    this.onState(this, "start_requested");
    Promise.resolve(this.onStartRequested(this, {
      reason: this.startReason,
      forcedPlayerIds: Array.isArray(forcedPlayerIds) ? forcedPlayerIds.slice() : [],
    })).catch((error) => {
      this.failStart(error && error.message || "match_start_failed");
    });
    return true;
  }

  markMatchStarted(matchId, mapSeed) {
    if (this.disposed) return false;
    this.phase = "match";
    this.matchId = String(matchId || "");
    this.mapSeed = Number(mapSeed) || 0;
    this.lastError = "";
    this.revision += 1;
    this.onState(this, "match_started");
    return true;
  }

  markMatchEnded() {
    if (this.phase !== "match") return false;
    this.phase = "ended";
    this.revision += 1;
    this.onState(this, "match_ended");
    return true;
  }

  returnToLobby() {
    if (this.disposed) return false;
    this.phase = "lobby";
    this.matchId = "";
    this.mapSeed = 0;
    this.startReason = "";
    this.lastError = "";
    for (const player of this.players.values()) {
      player.ready = false;
      player.autoReady = false;
    }
    this.revision += 1;
    this.evaluateStart(true);
    this.onState(this, "returned_to_lobby");
    return true;
  }

  failStart(reason) {
    if (this.disposed) return false;
    this.phase = "lobby";
    this.startReason = "";
    this.lastError = String(reason || "match_start_failed").slice(0, 160);
    for (const player of this.players.values()) {
      player.ready = false;
      player.autoReady = false;
    }
    this.clearAutoStart();
    this.revision += 1;
    this.onState(this, "start_failed");
    return true;
  }

  snapshot() {
    const readiness = this.readinessState();
    return {
      id: this.id,
      revision: this.revision,
      phase: this.phase,
      searchCode: this.searchCode,
      players: this.publicPlayers(),
      playerCount: readiness.playerCount,
      readyCount: readiness.readyCount,
      minPlayers: this.minPlayers,
      maxPlayers: this.maxPlayers,
      autoStartAt: this.autoStartAt || 0,
      serverNow: this.clock(),
      startReason: this.startReason,
      matchId: this.matchId,
      mapSeed: this.mapSeed,
      error: this.lastError,
    };
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.clearAutoStart();
    this.players.clear();
  }
}

module.exports = {
  MatchRoom,
  clonePublicPlayer,
};
