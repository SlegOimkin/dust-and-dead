const path = require("node:path");
const { gzipSync } = require("node:zlib");
const { expect, test } = require("@playwright/test");

const CURRENT_PROTOCOL = 47;
const NATIVE_GZIP_PREFIX_BYTES = 4;

function fileUrl(relativePath) {
  const absolute = path.resolve(__dirname, "..", relativePath).replace(/\\/g, "/");
  return `file:///${absolute}`;
}

function compressedBytes(value) {
  return NATIVE_GZIP_PREFIX_BYTES + gzipSync(Buffer.from(JSON.stringify(value))).length;
}

async function openGame(page) {
  await page.goto(`${fileUrl("index.html")}?mapSeed=7331&networkDiagnostics=1`);
  const intro = page.locator("#intro-screen");
  if (await intro.isVisible().catch(() => false)) {
    await page.keyboard.press("KeyM");
    await expect(intro).toBeHidden();
  }
  await page.waitForFunction(() => Boolean(
    window.__dustMultiplayerTest?.packPlayerWireEntries &&
    window.__dustMultiplayerTest?.decodePlayerWireEntries
  ));
}

test("protocol 47 player codec round-trips local and remote state without changing standalone snapshot semantics", async ({ page, context }) => {
  await openGame(page);
  const guest = await context.newPage();
  await openGame(guest);

  const host = await page.evaluate(() => {
    const api = window.__dustMultiplayerTest;
    api.startMockHost(["Codec Host", "Codec Guest"]);
    api.setProgression("mock-player-1", {
      level: 17,
      playerClass: "ranger",
      rifleUpgrade: "trailWarden",
      weapon: "rifle",
      ownedWeapons: { revolver: true, rifle: true, launcher: false, coachGun: false },
      moveSpeedBonus: 0.35,
      maxHpBonus: 45,
    });
    api.setProgression("mock-player-2", {
      level: 23,
      xp: 731,
      xpToNext: 1200,
      totalXp: 4900,
      playerClass: "demolitionist",
      revolverUpgrade: null,
      launcherUpgrade: "pyrotechnician",
      weapon: "launcher",
      ownedWeapons: { revolver: true, rifle: false, launcher: true, coachGun: false },
      ammo: { revolver: 5, rifle: 0, launcher: 3, coachGun: 0 },
      ammoReserve: { revolver: 26, rifle: 0, launcher: 17, coachGun: 0 },
      reloadTimers: { revolver: 0, rifle: 0, launcher: 0.625, coachGun: 0 },
      launcherFireBuffActive: false,
      launcherFireAmmoAccumulator: 1.75,
      marshalDoubleTapReadyUntil: 0,
    });

    const semanticPlayers = api.buildSnapshot(false, false, "mock-player-2").players;
    const local = semanticPlayers.find((entry) => entry.id === "mock-player-2");
    // Exercise the reliable optional fields explicitly, including a present
    // null-capable offer and both accepted/rejected fire results.
    local.fireResults = [
      { sequence: 71, accepted: true, reason: "accepted" },
      { sequence: 72, accepted: false, reason: "ammo" },
    ];
    local.pendingUpgradeLevels = [24, 25];
    local.upgradeOffer = {
      id: "mock-player-2-upgrade-9",
      kind: "standard",
      level: 24,
      choices: ["quickHands", "deadEye", "trailLayer"],
    };
    const packed = api.packPlayerWireEntries(semanticPlayers);
    const decoded = api.decodePlayerWireEntries(JSON.parse(JSON.stringify(packed)));
    const nullOptionals = Object.assign({}, semanticPlayers[0], {
      fireResults: null,
      progression: null,
      pendingUpgradeLevels: null,
      upgradeOffer: null,
    });
    const decodedNullOptionals = api.decodePlayerWireEntries(JSON.parse(JSON.stringify(
      api.packPlayerWireEntries([nullOptionals])
    )));
    const duplicatePlayers = api.decodePlayerWireEntries(api.packPlayerWireEntries([
      semanticPlayers[0], semanticPlayers[0],
    ]));
    const tooManyPlayers = api.decodePlayerWireEntries(api.packPlayerWireEntries([
      semanticPlayers[0], semanticPlayers[1],
      Object.assign({}, semanticPlayers[0], { id: "extra-player-1" }),
      Object.assign({}, semanticPlayers[0], { id: "extra-player-2" }),
      Object.assign({}, semanticPlayers[0], { id: "extra-player-3" }),
    ]));

    const wire = JSON.parse(JSON.stringify(api.buildWireSnapshot(false, false, "mock-player-2")));
    const legacyWire = Object.assign({}, wire, { players: api.decodePlayerWireEntries(wire.ps) });
    delete legacyWire.ps;
    const malformed = JSON.parse(JSON.stringify(wire));
    malformed.sequence += 1000;
    malformed.ps[1][25][0] = "!not-base64!";
    return {
      protocol: wire.version,
      semanticPlayers: JSON.parse(JSON.stringify(semanticPlayers)),
      decoded: JSON.parse(JSON.stringify(decoded)),
      nullOptionals: JSON.parse(JSON.stringify(nullOptionals)),
      decodedNullOptionals: JSON.parse(JSON.stringify(decodedNullOptionals)),
      duplicatePlayers,
      tooManyPlayers,
      packed,
      wire,
      legacyWire,
      malformed,
      stats: api.getNetworkBudgetDiagnostics().stats,
    };
  });

  expect(host.protocol).toBe(CURRENT_PROTOCOL);
  expect(host.decoded).toEqual(host.semanticPlayers);
  expect(host.decodedNullOptionals).toEqual([host.nullOptionals]);
  expect(host.duplicatePlayers).toBeNull();
  expect(host.tooManyPlayers).toBeNull();
  expect(host.wire.players).toBeUndefined();
  expect(host.wire.ps[0]).toBe(2);

  const decodedLocal = host.decoded.find((entry) => entry.id === "mock-player-2");
  const decodedRemote = host.decoded.find((entry) => entry.id === "mock-player-1");
  expect(decodedLocal.fireResults).toEqual([
    { sequence: 71, accepted: true, reason: "accepted" },
    { sequence: 72, accepted: false, reason: "ammo" },
  ]);
  expect(decodedLocal.pendingUpgradeLevels).toEqual([24, 25]);
  expect(decodedLocal.upgradeOffer).toMatchObject({ level: 24, choices: ["quickHands", "deadEye", "trailLayer"] });
  expect(decodedLocal.progression).toMatchObject({
    playerClass: "demolitionist",
    revolverUpgrade: null,
    launcherUpgrade: "pyrotechnician",
    launcherFireBuffActive: false,
    launcherFireAmmoAccumulator: 1.75,
  });
  expect(decodedRemote.progression).toMatchObject({
    level: 17,
    playerClass: "ranger",
    rifleUpgrade: "trailWarden",
    weapon: "rifle",
  });
  expect(Object.hasOwn(decodedRemote, "fireResults")).toBe(false);
  expect(Object.hasOwn(decodedRemote, "pendingUpgradeLevels")).toBe(false);
  expect(Object.hasOwn(decodedRemote, "upgradeOffer")).toBe(false);
  expect(Object.hasOwn(decodedRemote.progression, "ammo")).toBe(false);

  const application = await guest.evaluate(({ malformed, valid }) => {
    const api = window.__dustMultiplayerTest;
    api.startMockGuest(["Codec Host", "Codec Guest"], 1);
    api.applySnapshot(malformed);
    const afterMalformed = api.getIncomingRealtimeDiagnostics().lastSnapshotSequence;
    api.applySnapshot(valid);
    const state = api.getState();
    return {
      afterMalformed,
      afterValid: api.getIncomingRealtimeDiagnostics().lastSnapshotSequence,
      local: state.players.find((entry) => entry.id === "mock-player-2"),
      remote: state.players.find((entry) => entry.id === "mock-player-1"),
    };
  }, { malformed: host.malformed, valid: host.wire });

  expect(application.afterMalformed).toBe(-1);
  expect(application.afterValid).toBe(host.wire.sequence);
  expect(application.local.progression).toMatchObject({
    playerClass: "demolitionist",
    launcherUpgrade: "pyrotechnician",
    weapon: "launcher",
  });
  expect(application.remote.progression).toMatchObject({
    playerClass: "ranger",
    rifleUpgrade: "trailWarden",
    weapon: "rifle",
  });

  const packedBytes = compressedBytes(host.wire);
  const legacyBytes = compressedBytes(host.legacyWire);
  const report = JSON.stringify({
    packedBytes,
    legacyBytes,
    savedBytes: legacyBytes - packedBytes,
    savedPercent: Number(((legacyBytes - packedBytes) / legacyBytes * 100).toFixed(2)),
    playerLegacyJsonBytes: host.stats.lastPlayerLegacyBytes,
    playerPackedJsonBytes: host.stats.lastPlayerWireBytes,
  }, null, 2);
  console.log(`protocol ${CURRENT_PROTOCOL} player codec metrics\n${report}`);
  expect(packedBytes, report).toBeLessThan(legacyBytes);
  expect(legacyBytes - packedBytes, report).toBeGreaterThanOrEqual(350);
  expect(host.stats.lastPlayerWireBytes, report).toBeLessThan(host.stats.lastPlayerLegacyBytes * 0.72);
});
