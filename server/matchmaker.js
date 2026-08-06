"use strict";

const crypto = require("node:crypto");
const protocol = require("../multiplayer-protocol.js");
const { MatchRoom } = require("./room.js");

function randomId(prefix) {
  return String(prefix || "id") + "_" + crypto.randomBytes(12).toString("base64url");
}

class Matchmaker {
  constructor(options) {
    const settings = options || {};
    this.rooms = new Map();
    this.playerRooms = new Map();
    this.autoStartDelayMs = settings.autoStartDelayMs || protocol.AUTO_START_DELAY_MS;
    this.clock = settings.clock;
    this.schedule = settings.schedule;
    this.cancelSchedule = settings.cancelSchedule;
    this.onRoomState = typeof settings.onRoomState === "function" ? settings.onRoomState : function () {};
    this.onStartRequested = typeof settings.onStartRequested === "function"
      ? settings.onStartRequested
      : function () {};
    this.onRoomRemoved = typeof settings.onRoomRemoved === "function"
      ? settings.onRoomRemoved
      : function () {};
  }

  createRoom(searchCode) {
    const normalizedCode = protocol.normalizeSearchCode(searchCode);
    const room = new MatchRoom({
      id: randomId("room"),
      key: protocol.createPublicRoomKey(normalizedCode),
      searchCode: normalizedCode,
      autoStartDelayMs: this.autoStartDelayMs,
      clock: this.clock,
      schedule: this.schedule,
      cancelSchedule: this.cancelSchedule,
      onState: (changedRoom, reason) => this.onRoomState(changedRoom, reason),
      onStartRequested: (startingRoom, details) => this.onStartRequested(startingRoom, details),
    });
    this.rooms.set(room.id, room);
    return room;
  }

  findJoinableRoom(searchCode) {
    const key = protocol.createPublicRoomKey(searchCode);
    for (const room of this.rooms.values()) {
      if (room.key === key && room.canJoin()) return room;
    }
    return null;
  }

  join(player, searchCode) {
    if (!player || !player.id) throw new Error("invalid_player");
    this.leave(player.id, "moved_room");
    const normalizedCode = protocol.normalizeSearchCode(searchCode);
    const room = this.findJoinableRoom(normalizedCode) || this.createRoom(normalizedCode);
    room.addPlayer(player);
    this.playerRooms.set(player.id, room.id);
    return room;
  }

  leave(playerId, reason) {
    const room = this.getRoomForPlayer(playerId);
    if (!room) return false;
    this.playerRooms.delete(playerId);
    room.removePlayer(playerId, reason || "player_left");
    if (!room.size) this.removeRoom(room.id, reason || "player_left");
    return true;
  }

  removeRoom(roomId, reason) {
    const room = this.rooms.get(roomId);
    if (!room) return false;
    for (const playerId of room.players.keys()) this.playerRooms.delete(playerId);
    this.rooms.delete(roomId);
    this.onRoomRemoved(room, reason || "room_removed");
    room.dispose();
    return true;
  }

  getRoom(roomId) {
    return this.rooms.get(roomId) || null;
  }

  getRoomForPlayer(playerId) {
    const roomId = this.playerRooms.get(playerId);
    return roomId ? this.getRoom(roomId) : null;
  }

  setReady(playerId, ready, profile) {
    const room = this.getRoomForPlayer(playerId);
    return room ? room.setReady(playerId, ready, profile) : false;
  }

  dispose() {
    for (const room of this.rooms.values()) room.dispose();
    this.rooms.clear();
    this.playerRooms.clear();
  }
}

module.exports = {
  Matchmaker,
  randomId,
};
