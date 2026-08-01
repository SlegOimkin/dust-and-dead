"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const protocol = require("../../multiplayer-protocol.js");
const { Matchmaker } = require("../matchmaker.js");

function player(id) {
  return { id, name: id, connected: true };
}

test("public matchmaking automatically fills the oldest open room", () => {
  const matchmaker = new Matchmaker();
  const first = matchmaker.join(player("one"), "");
  const second = matchmaker.join(player("two"), "");
  assert.equal(first.id, second.id);
  assert.equal(first.size, 2);
  matchmaker.dispose();
});

test("search code normalization isolates rooms without exposing a server list", () => {
  const matchmaker = new Matchmaker();
  const alphaOne = matchmaker.join(player("alpha-one"), " ab-c 12 ");
  const alphaTwo = matchmaker.join(player("alpha-two"), "AB-C12");
  const beta = matchmaker.join(player("beta"), "AB-C13");
  const publicRoom = matchmaker.join(player("public"), "");

  assert.equal(alphaOne.id, alphaTwo.id);
  assert.notEqual(alphaOne.id, beta.id);
  assert.notEqual(alphaOne.id, publicRoom.id);
  assert.equal(alphaOne.searchCode, "AB-C12");
  assert.equal(protocol.createPublicRoomKey("ab-c 12"), "code:AB-C12");
  matchmaker.dispose();
});

test("a fifth player is placed in another room", () => {
  const matchmaker = new Matchmaker();
  const rooms = [];
  for (let index = 0; index < protocol.MAX_PLAYERS + 1; index += 1) {
    rooms.push(matchmaker.join(player("player-" + index), "FULL"));
  }
  assert.equal(rooms[0].size, protocol.MAX_PLAYERS);
  assert.notEqual(rooms[0].id, rooms[protocol.MAX_PLAYERS].id);
  assert.equal(rooms[protocol.MAX_PLAYERS].size, 1);
  matchmaker.dispose();
});
