"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { MatchRoom } = require("../room.js");

function createFakeClock(start) {
  let now = Number(start) || 1000;
  let nextId = 1;
  const timers = new Map();
  return {
    now: () => now,
    schedule(callback, delay) {
      const timer = { id: nextId++, at: now + delay, callback };
      timers.set(timer.id, timer);
      return timer.id;
    },
    cancel(timerId) {
      timers.delete(timerId);
    },
    advance(ms) {
      const target = now + ms;
      while (true) {
        const due = Array.from(timers.values())
          .filter((timer) => timer.at <= target)
          .sort((left, right) => left.at - right.at || left.id - right.id)[0];
        if (!due) break;
        timers.delete(due.id);
        now = due.at;
        due.callback();
      }
      now = target;
    },
  };
}

function player(id) {
  return { id, name: id, connected: true };
}

function createRoom(options) {
  const settings = options || {};
  const clock = settings.clock || createFakeClock();
  const starts = [];
  const room = new MatchRoom({
    id: "room-test",
    autoStartDelayMs: 40000,
    clock: clock.now,
    schedule: clock.schedule,
    cancelSchedule: clock.cancel,
    onStartRequested(current, details) {
      starts.push({ roomId: current.id, details });
    },
  });
  return { room, clock, starts };
}

test("all connected players ready starts immediately without a player host", () => {
  const { room, starts } = createRoom();
  room.addPlayer(player("one"));
  room.addPlayer(player("two"));

  room.setReady("one", true);
  assert.equal(room.phase, "lobby");
  assert.ok(room.autoStartAt > 0);

  room.setReady("two", true);
  assert.equal(room.phase, "preparing");
  assert.equal(room.autoStartAt, 0);
  assert.equal(starts.length, 1);
  assert.equal(starts[0].details.reason, "all_ready");
  assert.deepEqual(starts[0].details.forcedPlayerIds, []);
});

test("exactly one unready player is included after exactly forty seconds", () => {
  const { room, clock, starts } = createRoom();
  room.addPlayer(player("one"));
  room.addPlayer(player("two"));
  room.addPlayer(player("three"));
  room.setReady("one", true);
  room.setReady("two", true);

  const deadline = room.autoStartAt;
  assert.equal(deadline, clock.now() + 40000);
  clock.advance(39999);
  assert.equal(room.phase, "lobby");
  assert.equal(starts.length, 0);

  clock.advance(1);
  assert.equal(room.phase, "preparing");
  assert.equal(starts.length, 1);
  assert.equal(starts[0].details.reason, "countdown");
  assert.deepEqual(starts[0].details.forcedPlayerIds, ["three"]);
  assert.equal(room.players.get("three").ready, true);
  assert.equal(room.players.get("three").autoReady, true);
});

test("countdown is cancelled as soon as there are two unready players", () => {
  const { room, clock, starts } = createRoom();
  room.addPlayer(player("one"));
  room.addPlayer(player("two"));
  room.addPlayer(player("three"));
  room.setReady("one", true);
  room.setReady("two", true);
  assert.ok(room.autoStartAt);

  room.setReady("one", false);
  assert.equal(room.autoStartAt, 0);
  clock.advance(50000);
  assert.equal(room.phase, "lobby");
  assert.equal(starts.length, 0);
});

test("roster changes restart rather than inherit the previous countdown", () => {
  const { room, clock } = createRoom();
  room.addPlayer(player("one"));
  room.addPlayer(player("two"));
  room.setReady("one", true);
  const firstDeadline = room.autoStartAt;
  clock.advance(10000);

  room.removePlayer("two");
  room.addPlayer(player("three"));
  const secondDeadline = room.autoStartAt;
  assert.ok(secondDeadline > firstDeadline);
  assert.equal(secondDeadline, clock.now() + 40000);
});

test("disconnect in the lobby cancels readiness and countdown", () => {
  const { room, clock, starts } = createRoom();
  room.addPlayer(player("one"));
  room.addPlayer(player("two"));
  room.setReady("one", true);
  assert.ok(room.autoStartAt);

  room.setConnected("two", false);
  assert.equal(room.autoStartAt, 0);
  clock.advance(40000);
  assert.equal(starts.length, 0);
});
