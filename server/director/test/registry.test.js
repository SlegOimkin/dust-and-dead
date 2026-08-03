"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const protocol = require("../../../multiplayer-protocol.js");
const { RegionRegistry, normalizeRegionUrl } = require("../registry.js");

function createClock(start) {
  let now = Number(start) || 1000000;
  const clock = () => now;
  clock.advance = (ms) => { now += Number(ms) || 0; };
  return clock;
}

function beat(overrides) {
  return Object.assign({
    id: "eu-central",
    label: "Europe",
    url: "wss://eu.example.com/online",
    protocolVersion: protocol.VERSION,
    ready: true,
    accepting: true,
    activeMatches: 0,
    maxMatches: 4,
    connections: 0,
    maxConnections: 256,
    codes: [],
  }, overrides || {});
}

test("only absolute ws or wss endpoints are accepted and the online path is implied", () => {
  assert.equal(normalizeRegionUrl("wss://eu.example.com/online"), "wss://eu.example.com/online");
  assert.equal(normalizeRegionUrl("https://eu.example.com"), "wss://eu.example.com/online");
  assert.equal(normalizeRegionUrl("http://127.0.0.1:8787"), "ws://127.0.0.1:8787/online");
  assert.equal(normalizeRegionUrl("javascript:alert(1)"), "");
  assert.equal(normalizeRegionUrl("/online"), "");
  assert.equal(normalizeRegionUrl(""), "");
});

test("a heartbeat from a mismatched protocol version never becomes routable", () => {
  const clock = createClock();
  const registry = new RegionRegistry({ clock, protocolVersion: protocol.VERSION });
  const result = registry.applyHeartbeat(beat({ protocolVersion: protocol.VERSION - 1 }));
  assert.equal(result.ok, false);
  assert.equal(result.error, "protocol_version_mismatch");
  assert.equal(registry.directory("").regions.length, 0);
  assert.equal(registry.readiness().ready, false);
});

test("a statically declared region is advertised but stays unverified until it beats", () => {
  const clock = createClock();
  const registry = new RegionRegistry({
    clock,
    protocolVersion: protocol.VERSION,
    staticRegions: [{ id: "us-east", label: "US East", url: "wss://us.example.com/online" }],
  });
  const before = registry.directory("");
  assert.equal(before.regions.length, 1);
  assert.equal(before.regions[0].verified, false);
  assert.equal(before.regions[0].healthy, false);
  assert.equal(registry.readiness().ready, false);

  registry.applyHeartbeat(beat({ id: "us-east", url: "wss://us.example.com/online" }));
  const after = registry.directory("");
  assert.equal(after.regions[0].verified, true);
  assert.equal(after.regions[0].healthy, true);
  assert.equal(registry.readiness().ready, true);
});

test("a region stops being routable once its heartbeat goes stale", () => {
  const clock = createClock();
  const registry = new RegionRegistry({ clock, protocolVersion: protocol.VERSION, regionTtlMs: 30000 });
  registry.applyHeartbeat(beat());
  assert.equal(registry.directory("").regions[0].healthy, true);
  clock.advance(30001);
  const stale = registry.directory("").regions[0];
  assert.equal(stale.healthy, false);
  assert.equal(stale.reachable, false);
  // The entry stays listed so a client mid-reconnect can still resolve its url.
  assert.equal(stale.url, "wss://eu.example.com/online");
});

test("a full or draining region is listed but never advertised as joinable", () => {
  const clock = createClock();
  const registry = new RegionRegistry({ clock, protocolVersion: protocol.VERSION });
  registry.applyHeartbeat(beat({ activeMatches: 4, maxMatches: 4 }));
  assert.equal(registry.directory("").regions[0].healthy, false);
  registry.applyHeartbeat(beat({ activeMatches: 1, maxMatches: 4, accepting: false }));
  assert.equal(registry.directory("").regions[0].healthy, false);
  registry.applyHeartbeat(beat({ activeMatches: 1, maxMatches: 4 }));
  assert.equal(registry.directory("").regions[0].healthy, true);
});

test("healthy regions sort ahead of unhealthy ones, then by priority and load", () => {
  const clock = createClock();
  const registry = new RegionRegistry({ clock, protocolVersion: protocol.VERSION });
  registry.applyHeartbeat(beat({ id: "a", url: "wss://a.example.com/online", priority: 0, activeMatches: 3, maxMatches: 4 }));
  registry.applyHeartbeat(beat({ id: "b", url: "wss://b.example.com/online", priority: 0, activeMatches: 1, maxMatches: 4 }));
  registry.applyHeartbeat(beat({ id: "c", url: "wss://c.example.com/online", priority: -5, activeMatches: 3, maxMatches: 4 }));
  registry.applyHeartbeat(beat({ id: "d", url: "wss://d.example.com/online", ready: false }));
  const ids = registry.directory("").regions.map((region) => region.id);
  assert.deepEqual(ids, ["c", "b", "a", "d"]);
});

test("a search code follows the region that actually reports the open room", () => {
  const clock = createClock();
  const registry = new RegionRegistry({ clock, protocolVersion: protocol.VERSION });
  registry.applyHeartbeat(beat({ id: "eu", url: "wss://eu.example.com/online" }));
  registry.applyHeartbeat(beat({ id: "us", url: "wss://us.example.com/online", codes: ["posse"] }));
  const directory = registry.directory("POSSE");
  assert.equal(directory.pinnedRegionId, "us");
  assert.equal(directory.pinnedReason, "active_room");
});

test("a reported open room outranks an earlier client claim for the same code", () => {
  const clock = createClock();
  const registry = new RegionRegistry({ clock, protocolVersion: protocol.VERSION });
  registry.applyHeartbeat(beat({ id: "eu", url: "wss://eu.example.com/online" }));
  registry.applyHeartbeat(beat({ id: "us", url: "wss://us.example.com/online" }));
  assert.equal(registry.claimCode("posse", "eu", clock()).regionId, "eu");
  registry.applyHeartbeat(beat({ id: "us", url: "wss://us.example.com/online", codes: ["POSSE"] }));
  assert.equal(registry.directory("posse").pinnedRegionId, "us");
});

test("a second claim for the same code loses and is told the winning region", () => {
  const clock = createClock();
  const registry = new RegionRegistry({ clock, protocolVersion: protocol.VERSION });
  registry.applyHeartbeat(beat({ id: "eu", url: "wss://eu.example.com/online" }));
  registry.applyHeartbeat(beat({ id: "us", url: "wss://us.example.com/online" }));
  const first = registry.claimCode("posse", "eu", clock());
  const second = registry.claimCode("posse", "us", clock());
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(second.regionId, "eu");
  assert.equal(second.reason, "claim");
});

test("a claim expires and stops pinning the code", () => {
  const clock = createClock();
  const registry = new RegionRegistry({ clock, protocolVersion: protocol.VERSION, claimTtlMs: 60000 });
  registry.applyHeartbeat(beat({ id: "eu", url: "wss://eu.example.com/online" }));
  registry.claimCode("posse", "eu", clock());
  assert.equal(registry.directory("posse").pinnedRegionId, "eu");
  clock.advance(60001);
  registry.applyHeartbeat(beat({ id: "eu", url: "wss://eu.example.com/online" }));
  assert.equal(registry.directory("posse").pinnedRegionId, "");
});

test("a claim pointing at a region that went away is dropped rather than stranding friends", () => {
  const clock = createClock();
  const registry = new RegionRegistry({ clock, protocolVersion: protocol.VERSION, regionTtlMs: 30000 });
  registry.applyHeartbeat(beat({ id: "eu", url: "wss://eu.example.com/online" }));
  registry.claimCode("posse", "eu", clock());
  clock.advance(30001);
  assert.equal(registry.directory("posse").pinnedRegionId, "");
  assert.equal(registry.claims.size, 0);
});

test("claiming an unknown or unhealthy region is refused", () => {
  const clock = createClock();
  const registry = new RegionRegistry({ clock, protocolVersion: protocol.VERSION });
  assert.equal(registry.claimCode("posse", "nowhere", clock()).error, "region_unavailable");
  registry.applyHeartbeat(beat({ id: "eu", url: "wss://eu.example.com/online", ready: false }));
  assert.equal(registry.claimCode("posse", "eu", clock()).error, "region_unavailable");
  assert.equal(registry.claimCode("", "eu", clock()).error, "invalid_code");
});

test("the public queue is never pinned to a region", () => {
  const clock = createClock();
  const registry = new RegionRegistry({ clock, protocolVersion: protocol.VERSION });
  registry.applyHeartbeat(beat({ id: "eu", url: "wss://eu.example.com/online", codes: [""] }));
  const directory = registry.directory("");
  assert.equal(directory.pinnedRegionId, "");
  assert.equal(directory.pinnedReason, "");
});

test("reported codes are normalized and bounded", () => {
  const clock = createClock();
  const registry = new RegionRegistry({ clock, protocolVersion: protocol.VERSION, maxCodesPerRegion: 3 });
  registry.applyHeartbeat(beat({ codes: ["  posse  ", "po$$e", "a", "b", "c", "d"] }));
  const region = registry.regions.get("eu-central");
  assert.equal(region.codes.size, 3);
  assert.equal(region.codes.has("POSSE"), true);
  assert.equal(registry.directory("posse").pinnedRegionId, "eu-central");
});

test("claims are bounded and evict the closest to expiry", () => {
  const clock = createClock();
  const registry = new RegionRegistry({ clock, protocolVersion: protocol.VERSION, maxClaims: 2, claimTtlMs: 60000 });
  registry.applyHeartbeat(beat({ id: "eu", url: "wss://eu.example.com/online" }));
  registry.claimCode("one", "eu", clock());
  clock.advance(10);
  registry.claimCode("two", "eu", clock());
  clock.advance(10);
  registry.claimCode("three", "eu", clock());
  assert.equal(registry.claims.size, 2);
  assert.equal(registry.claims.has("ONE"), false);
  assert.equal(registry.claims.has("THREE"), true);
});

test("removing a region drops the claims that pointed at it", () => {
  const clock = createClock();
  const registry = new RegionRegistry({ clock, protocolVersion: protocol.VERSION });
  registry.applyHeartbeat(beat({ id: "eu", url: "wss://eu.example.com/online" }));
  registry.claimCode("posse", "eu", clock());
  assert.equal(registry.removeRegion("eu"), true);
  assert.equal(registry.claims.size, 0);
  assert.equal(registry.directory("posse").pinnedRegionId, "");
});

test("a hostile label cannot smuggle markup or control characters into the lobby", () => {
  const clock = createClock();
  const registry = new RegionRegistry({ clock, protocolVersion: protocol.VERSION });
  registry.applyHeartbeat(beat({ label: "<script>alert(1)</script>" }));
  const label = registry.directory("").regions[0].label;
  assert.equal(label.includes("<"), false);
  assert.equal(label.includes(">"), false);
});

test("the region cap refuses unknown regions instead of growing without bound", () => {
  const clock = createClock();
  const registry = new RegionRegistry({ clock, protocolVersion: protocol.VERSION, maxRegions: 1 });
  assert.equal(registry.applyHeartbeat(beat({ id: "eu", url: "wss://eu.example.com/online" })).ok, true);
  const rejected = registry.applyHeartbeat(beat({ id: "us", url: "wss://us.example.com/online" }));
  assert.equal(rejected.ok, false);
  assert.equal(rejected.error, "region_capacity");
  assert.equal(registry.regions.size, 1);
});
