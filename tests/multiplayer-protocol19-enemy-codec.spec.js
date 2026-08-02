const path = require("node:path");
const { expect, test } = require("@playwright/test");

const ENEMY_FORMAT = 2;
const POSITION_ANGLE_BATCH = 1;
const POSITION_BATCH = 2;
const FULL_BATCH = 3;
const ANGLE_BATCH = 4;
const UPDATE_POSITION = 1;
const UPDATE_ANGLE = 2;
const UPDATE_HP = 4;
const UPDATE_FX = 8;
const UPDATE_SPITTER = 16;
const ENEMY_TYPES = ["walker", "runner", "brute", "fastZombie", "spitter", "armoredMiner", null, "gravePreacher"];

function fileUrl(relativePath) {
  const absolute = path.resolve(__dirname, "..", relativePath).replace(/\\/g, "/");
  return `file:///${absolute}`;
}

function installNearbyCaptureMock() {
  const listeners = Object.create(null);

  function decode(data) {
    const binary = window.atob(String(data || ""));
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  }

  const capture = {
    sent: [],
    addListener(eventName, callback) {
      (listeners[eventName] || (listeners[eventName] = [])).push(callback);
      return Promise.resolve({ remove() {} });
    },
    requestNearbyPermissions() {
      return Promise.resolve({ granted: true });
    },
    sendBytes(options) {
      capture.sent.push({
        latestOnly: !!options.latestOnly,
        latestKind: options.latestKind || "",
        message: decode(options.data),
      });
      return Promise.resolve({});
    },
    stopAll() {
      return Promise.resolve({});
    },
  };

  window.__nearbyCapture = capture;
  window.Capacitor = { Plugins: { NearbyConnections: capture } };
}

async function openGame(page, captureNearby = false) {
  if (captureNearby) await page.addInitScript(installNearbyCaptureMock);
  await page.goto(`${fileUrl("index.html")}?mapSeed=7331`);
  const intro = page.locator("#intro-screen");
  if (await intro.isVisible().catch(() => false)) {
    await page.keyboard.press("KeyM");
    await expect(intro).toBeHidden();
  }
  await page.waitForFunction(() => Boolean(
    window.__dustMultiplayerTest?.buildWireSnapshot &&
    window.__dustMultiplayerTest?.getGuestEnemyDiagnostics &&
    window.render_game_to_text
  ));
}

function decodeEnemySection(section) {
  const bytes = Buffer.from(section.d, "base64");
  let offset = 0;
  const fail = (message) => { throw new Error(`${message} at byte ${offset}/${bytes.length}`); };
  const readByte = () => {
    if (offset >= bytes.length) fail("Unexpected end of enemy payload");
    return bytes[offset++];
  };
  const readUint16 = () => {
    if (offset + 2 > bytes.length) fail("Truncated uint16");
    const value = bytes[offset] | (bytes[offset + 1] << 8);
    offset += 2;
    return value;
  };
  const readInt16 = () => {
    const value = readUint16();
    return value & 0x8000 ? value - 0x10000 : value;
  };
  const readUint32 = () => {
    if (offset + 4 > bytes.length) fail("Truncated uint32");
    const value = (
      bytes[offset] |
      (bytes[offset + 1] << 8) |
      (bytes[offset + 2] << 16) |
      (bytes[offset + 3] << 24)
    ) >>> 0;
    offset += 4;
    return value;
  };
  const readUleb128 = () => {
    let value = 0;
    let shift = 0;
    while (offset < bytes.length && shift <= 28) {
      const byte = readByte();
      value |= (byte & 0x7f) << shift;
      if (!(byte & 0x80)) return value >>> 0;
      shift += 7;
    }
    fail("Invalid ULEB128");
  };
  const readAngle = () => readByte() / 255 * Math.PI * 2 - Math.PI;

  const format = readByte();
  const keyframe = readByte();
  const revision = readUint32();
  const count = readUint16();
  if (format !== 1 && format !== ENEMY_FORMAT) fail(`Unsupported enemy format ${format}`);
  const originX = format === ENEMY_FORMAT ? readInt16() : 0;
  const originZ = format === ENEMY_FORMAT ? readInt16() : 0;

  const readRelativePosition = () => {
    const lowX = readByte();
    const middle = readByte();
    const highZ = readByte();
    const packedX = lowX | ((middle & 15) << 8);
    const packedZ = (middle >>> 4) | (highZ << 4);
    return {
      x: (originX + packedX - 2048) / 16,
      z: (originZ + packedZ - 2048) / 16,
    };
  };

  const readPackedBatchPositions = (entryCount) => {
    const mode = readByte();
    if (mode !== 0 && mode !== 1) fail(`Invalid batch position mode ${mode}`);
    let wideBitmap = null;
    if (mode === 1) {
      const bitmapLength = Math.ceil(entryCount / 8);
      wideBitmap = bytes.subarray(offset, offset + bitmapLength);
      if (wideBitmap.length !== bitmapLength) fail("Truncated wide-position bitmap");
      offset += bitmapLength;
      if (!(wideBitmap[0] & 1)) fail("Delta batch must start with a wide position");
    }
    const positions = [];
    for (let index = 0; index < entryCount; index += 1) {
      const wide = mode === 0 || (wideBitmap[index >>> 3] & (1 << (index & 7)));
      if (wide) {
        positions.push(readRelativePosition());
        continue;
      }
      let dx = readByte();
      let dz = readByte();
      if (dx & 128) dx -= 256;
      if (dz & 128) dz -= 256;
      const previous = positions.at(-1);
      if (!previous) fail("Position delta has no predecessor");
      positions.push({
        x: (Math.round(previous.x * 16) + dx) / 16,
        z: (Math.round(previous.z * 16) + dz) / 16,
      });
    }
    return positions;
  };

  const readFull = (id, relative) => {
    const typeFx = readByte();
    const position = relative
      ? readRelativePosition()
      : { x: readInt16() / 16, z: readInt16() / 16 };
    const hpRatio = readByte();
    const maxHp = Math.max(0.1, readUint16() / 10);
    const result = {
      id,
      kind: 0,
      type: ENEMY_TYPES[typeFx & 7] || "walker",
      x: position.x,
      z: position.z,
      hp: hpRatio / 255 * maxHp,
      maxHp,
      angle: readAngle(),
      fx: (typeFx >>> 3) & 15,
    };
    if ((typeFx & 7) === 4) {
      result.spit = readByte() / 255;
      result.windup = readByte() / 100;
    }
    return result;
  };

  const readUpdate = (id, mask) => {
    const result = { id, kind: 1, mask };
    if (mask & UPDATE_POSITION) {
      result.x = readInt16() / 16;
      result.z = readInt16() / 16;
    }
    if (mask & UPDATE_ANGLE) result.angle = readAngle();
    if (mask & UPDATE_HP) result.hpRatio = readByte();
    if (mask & UPDATE_FX) result.fx = readByte();
    if (mask & UPDATE_SPITTER) {
      result.spit = readByte() / 255;
      result.windup = readByte() / 100;
    }
    return result;
  };

  const ops = [];
  const batches = [];
  let previousId = 0;
  while (ops.length < count) {
    const header = readByte();
    if (format === ENEMY_FORMAT && header >= 1 && header <= 4) {
      const firstId = previousId + readUleb128();
      const span = readUleb128();
      if (span <= 0 || span > 1024) fail(`Invalid batch span ${span}`);
      const bitmapOffset = offset;
      const bitmap = bytes.subarray(offset, offset + Math.ceil(span / 8));
      if (bitmap.length !== Math.ceil(span / 8)) fail("Truncated bitmap");
      offset += bitmap.length;
      const ids = [];
      for (let relativeId = 0; relativeId < span; relativeId += 1) {
        if (bitmap[relativeId >>> 3] & (1 << (relativeId & 7))) ids.push(firstId + relativeId);
      }
      if (!ids.length || ids.at(-1) !== firstId + span - 1) fail("Bitmap omits its terminal id");
      batches.push({ kind: header, firstId, span, ids: ids.slice(), bitmapOffset });

      if (header === POSITION_ANGLE_BATCH) {
        const positions = readPackedBatchPositions(ids.length);
        ids.forEach((id, index) => ops.push({
          id,
          kind: 1,
          mask: UPDATE_POSITION | UPDATE_ANGLE,
          ...positions[index],
          angle: readAngle(),
        }));
      } else if (header === POSITION_BATCH) {
        const positions = readPackedBatchPositions(ids.length);
        ids.forEach((id, index) => ops.push({ id, kind: 1, mask: UPDATE_POSITION, ...positions[index] }));
      } else if (header === ANGLE_BATCH) {
        ids.forEach((id) => ops.push({ id, kind: 1, mask: UPDATE_ANGLE, angle: readAngle() }));
      } else {
        const positions = readPackedBatchPositions(ids.length);
        ids.forEach((id, index) => {
          const typeFx = readByte();
          const hpRatio = readByte();
          const maxHp = Math.max(0.1, readUint16() / 10);
          const full = {
            id,
            kind: 0,
            type: ENEMY_TYPES[typeFx & 7] || "walker",
            ...positions[index],
            hp: hpRatio / 255 * maxHp,
            maxHp,
            angle: readAngle(),
            fx: (typeFx >>> 3) & 15,
          };
          if ((typeFx & 7) === 4) {
            full.spit = readByte() / 255;
            full.windup = readByte() / 100;
          }
          ops.push(full);
        });
      }
      previousId = firstId + span - 1;
      continue;
    }

    const id = previousId + readUleb128();
    previousId = id;
    const kind = header >>> 6;
    const mask = header & 31;
    if (kind >= 2) ops.push({ id, kind });
    else if (kind === 0) ops.push(readFull(id, false));
    else ops.push(readUpdate(id, mask));
  }

  if (offset !== bytes.length) fail("Trailing enemy bytes");
  return { format, keyframe: !!keyframe, revision, count, originX, originZ, ops, batches, bytes };
}

function normalizedAngle(value) {
  return Math.atan2(Math.sin(Number(value) || 0), Math.cos(Number(value) || 0));
}

function expectedAngle(value) {
  const normalized = normalizedAngle(value);
  const byte = Math.max(0, Math.min(255, Math.round((normalized + Math.PI) / (Math.PI * 2) * 255)));
  return byte / 255 * Math.PI * 2 - Math.PI;
}

function pushUint16(bytes, value) {
  const number = Math.max(0, Math.min(65535, Math.floor(Number(value) || 0)));
  bytes.push(number & 255, (number >>> 8) & 255);
}

function pushInt16(bytes, value) {
  const number = Math.max(-32768, Math.min(32767, Math.round(Number(value) || 0))) & 65535;
  bytes.push(number & 255, (number >>> 8) & 255);
}

function pushUint32(bytes, value) {
  const number = Math.max(0, Math.floor(Number(value) || 0)) >>> 0;
  bytes.push(number & 255, (number >>> 8) & 255, (number >>> 16) & 255, (number >>> 24) & 255);
}

function pushUleb128(bytes, value) {
  let number = Math.max(0, Math.floor(Number(value) || 0)) >>> 0;
  do {
    let byte = number & 127;
    number >>>= 7;
    if (number) byte |= 128;
    bytes.push(byte);
  } while (number);
}

function makeWideFallbackSnapshot() {
  const enemyId = 9001;
  const x = -300;
  const z = 300;
  const maxHp = 18;
  const hpByte = 200;
  const angleByte = 201;
  const spitByte = 153;
  const windupByte = 42;
  const fx = 5;
  const bytes = [ENEMY_FORMAT, 1];
  pushUint32(bytes, 7);
  pushUint16(bytes, 1);
  pushInt16(bytes, 0);
  pushInt16(bytes, 0);
  // A generic full record is the lossless fallback when the quantized
  // coordinate cannot fit the section's signed 12-bit relative window.
  bytes.push(0);
  pushUleb128(bytes, enemyId);
  bytes.push(4 | (fx << 3));
  pushInt16(bytes, x * 16);
  pushInt16(bytes, z * 16);
  bytes.push(hpByte);
  pushUint16(bytes, maxHp * 10);
  bytes.push(angleByte, spitByte, windupByte);

  return {
    expected: {
      id: enemyId,
      type: "spitter",
      x,
      z,
      hp: hpByte / 255 * maxHp,
      maxHp,
      angle: angleByte / 255 * Math.PI * 2 - Math.PI,
      spit: spitByte / 255,
      windup: windupByte / 100,
      fx,
    },
    snapshot: {
      type: "snapshot",
      version: 46,
      matchId: "codec-wide-fallback",
      sequence: 1,
      time: 1,
      wave: 1,
      score: 0,
      players: [],
      enemyScope: { minX: -400, maxX: 400, minZ: -400, maxZ: 400 },
      enemyDelta: {
        v: 2,
        k: 1,
        r: 7,
        vr: 1,
        vt: "mock-player-2",
        c: 1,
        n: 1,
        e: 1,
        i: 0,
        m: 1,
        f: 1,
        t: 1,
        s: { minX: -400, maxX: 400, minZ: -400, maxZ: 400 },
        d: Buffer.from(bytes).toString("base64"),
      },
    },
  };
}

function makeReservedEnemyTypeSnapshot() {
  const enemyId = 9061;
  const bytes = [ENEMY_FORMAT, 1];
  pushUint32(bytes, 8);
  pushUint16(bytes, 1);
  pushInt16(bytes, 0);
  pushInt16(bytes, 0);
  bytes.push(0);
  pushUleb128(bytes, enemyId);
  bytes.push(6);
  pushInt16(bytes, -3 * 16);
  pushInt16(bytes, 4 * 16);
  bytes.push(255);
  pushUint16(bytes, 10 * 10);
  bytes.push(128);
  return {
    type: "snapshot",
    version: 46,
    matchId: "codec-reserved-type",
    sequence: 1,
    time: 1,
    wave: 1,
    score: 0,
    players: [],
    enemyScope: { minX: -20, maxX: 20, minZ: -20, maxZ: 20 },
    enemyDelta: {
      v: 2,
      k: 1,
      r: 8,
      vr: 1,
      vt: "mock-player-2",
      c: 1,
      n: 1,
      e: 1,
      i: 0,
      m: 1,
      f: 1,
      t: 1,
      s: { minX: -20, maxX: 20, minZ: -20, maxZ: 20 },
      d: Buffer.from(bytes).toString("base64"),
    },
  };
}

test("protocol 46 format 2 round-trips exact quantized enemy state for negative coordinates, every type, a spitter and gapped ids", async ({ page }) => {
  test.setTimeout(90_000);
  await openGame(page);

  const fixture = await page.evaluate(() => {
    const multiplayer = window.__dustMultiplayerTest;
    multiplayer.startMockHost(["Host", "Guest"]);
    multiplayer.setPlayerPosition("mock-player-1", -72, -54);
    multiplayer.setPlayerPosition("mock-player-2", -72, -54);
    multiplayer.setProgression("mock-player-1", { hpRegen: 1000 });
    multiplayer.setProgression("mock-player-2", { hpRegen: 1000 });
    const guest = multiplayer.getState().players.find((player) => player.id === "mock-player-2");
    const relevantIds = [];
    const types = ["walker", "runner", "brute", "fastZombie", "spitter", "armoredMiner", "gravePreacher"];
    types.forEach((type, index) => {
      const spawned = multiplayer.spawnEnemyAt(
        guest.x - 8 + index * 3.25,
        guest.z - 6 + (index % 2) * 4.5,
        type,
        2.35 + index * 3.17
      );
      relevantIds.push(spawned.id);
      if (index < types.length - 1) {
        multiplayer.spawnEnemyAt(205 - index, 166 - index, "walker", 1);
        multiplayer.spawnEnemyAt(198 - index, 158 - index, "runner", 2);
      }
    });
    window.advanceTime(1450);
    multiplayer.setHealth("mock-player-1", 100);
    multiplayer.setHealth("mock-player-2", 100);
    const source = multiplayer.buildSnapshot(false, false, "mock-player-2");
    const expected = source.enemies.filter((enemy) => relevantIds.includes(enemy.id));
    const wire = JSON.parse(JSON.stringify(
      multiplayer.buildWireSnapshot(false, false, "mock-player-2")
    ));
    return { relevantIds, expected, wire };
  });

  expect(fixture.wire.version).toBe(46);
  expect(fixture.wire.enemyDelta.v).toBe(2);
  const decoded = decodeEnemySection(fixture.wire.enemyDelta);
  expect(decoded.format).toBe(2);
  expect(decoded.keyframe).toBe(true);
  expect(decoded.batches.some((batch) => batch.kind === FULL_BATCH)).toBe(true);
  expect(fixture.relevantIds.slice(1).some((id, index) => id - fixture.relevantIds[index] > 1)).toBe(true);
  expect(fixture.expected.some((enemy) => enemy.x < 0 && enemy.z < 0)).toBe(true);

  const expectedById = new Map(fixture.expected.map((enemy) => [enemy.id, enemy]));
  const decodedRelevant = decoded.ops.filter((op) => expectedById.has(op.id));
  expect(decodedRelevant.map((op) => op.id)).toEqual(fixture.relevantIds.slice().sort((a, b) => a - b));
  for (const actual of decodedRelevant) {
    const source = expectedById.get(actual.id);
    const quantizedMaxHp = Math.max(0.1, Math.round(source.maxHp * 10) / 10);
    const hpByte = Math.max(0, Math.min(255, Math.round(Math.max(0, source.hp) / source.maxHp * 255)));
    expect(actual.kind).toBe(0);
    expect(actual.type).toBe(source.type);
    expect(actual.x).toBe(Math.round(source.x * 16) / 16);
    expect(actual.z).toBe(Math.round(source.z * 16) / 16);
    expect(actual.maxHp).toBeCloseTo(quantizedMaxHp, 8);
    expect(actual.hp).toBeCloseTo(hpByte / 255 * quantizedMaxHp, 8);
    expect(actual.angle).toBeCloseTo(expectedAngle(source.angle), 8);
    expect(actual.fx).toBe(source.fx & 15);
    if (source.type === "spitter") {
      expect(actual.spit).toBeCloseTo(Math.round(Math.max(0, source.spit) * 255) / 255, 8);
      expect(actual.windup).toBeCloseTo(Math.round(Math.max(0, source.windup) * 100) / 100, 8);
    }
  }

  const guestEnemies = await page.evaluate((wire) => {
    const multiplayer = window.__dustMultiplayerTest;
    multiplayer.startMockGuest(["Host", "Guest"], 1);
    multiplayer.applySnapshot(wire);
    return multiplayer.getGuestEnemyDiagnostics();
  }, fixture.wire);
  const guestById = new Map(guestEnemies.map((enemy) => [enemy.id, enemy]));
  for (const expected of decodedRelevant) {
    const guest = guestById.get(expected.id);
    expect(guest).toBeTruthy();
    expect(guest.type).toBe(expected.type);
    // Diagnostics round to three decimals; half of the final displayed unit is
    // still the exact same 1/16 target stored by the replica.
    expect(guest.targetX).toBeCloseTo(expected.x, 2);
    expect(guest.targetZ).toBeCloseTo(expected.z, 2);
    expect(guest.hp).toBeCloseTo(expected.hp, 2);
  }
});

test("protocol 46 keeps the exact int16 fallback outside a signed 12-bit section origin", async ({ page }) => {
  await openGame(page);
  const fixture = makeWideFallbackSnapshot();
  const decoded = decodeEnemySection(fixture.snapshot.enemyDelta);
  expect(decoded.bytes[12], "wide fallback must be a generic full record, not a relative batch").toBe(0);
  expect(decoded.ops).toHaveLength(1);
  expect(decoded.ops[0]).toMatchObject({
    id: fixture.expected.id,
    type: fixture.expected.type,
    x: fixture.expected.x,
    z: fixture.expected.z,
    maxHp: fixture.expected.maxHp,
    fx: fixture.expected.fx,
  });
  expect(decoded.ops[0].hp).toBeCloseTo(fixture.expected.hp, 8);
  expect(decoded.ops[0].angle).toBeCloseTo(fixture.expected.angle, 8);
  expect(decoded.ops[0].spit).toBeCloseTo(fixture.expected.spit, 8);
  expect(decoded.ops[0].windup).toBeCloseTo(fixture.expected.windup, 8);

  const applied = await page.evaluate((snapshot) => {
    const multiplayer = window.__dustMultiplayerTest;
    multiplayer.startMockGuest(["Host", "Guest"], 1, snapshot.matchId);
    multiplayer.applySnapshot(snapshot);
    return {
      enemies: multiplayer.getGuestEnemyDiagnostics(),
      rendered: JSON.parse(window.render_game_to_text()).enemies,
    };
  }, fixture.snapshot);
  expect(applied.enemies).toHaveLength(1);
  expect(applied.enemies[0]).toMatchObject({
    id: fixture.expected.id,
    type: "spitter",
    targetX: fixture.expected.x,
    targetZ: fixture.expected.z,
  });
  expect(applied.enemies[0].hp).toBeCloseTo(fixture.expected.hp, 2);
  expect(applied.rendered[0]).toMatchObject({ type: "spitter" });
  expect(applied.rendered[0].spitPulse).toBeCloseTo(fixture.expected.spit, 2);
  expect(applied.rendered[0].spitWindup).toBeCloseTo(fixture.expected.windup, 2);
});

test("protocol 46 keeps removed enemy type code 6 reserved and decodes it safely", async ({ page }) => {
  await openGame(page);
  const snapshot = makeReservedEnemyTypeSnapshot();
  const enemies = await page.evaluate((wire) => {
    const multiplayer = window.__dustMultiplayerTest;
    multiplayer.startMockGuest(["Host", "Guest"], 1, wire.matchId);
    multiplayer.applySnapshot(wire);
    return multiplayer.getGuestEnemyDiagnostics();
  }, snapshot);

  expect(enemies).toHaveLength(1);
  expect(enemies[0]).toMatchObject({ id: 9061, type: "walker", targetX: -3, targetZ: 4 });
});

test("corrupt protocol 46 bitmap, count and trailing bytes never partially apply or explicitly ACK a keyframe chunk", async ({ page }) => {
  await openGame(page, true);
  const valid = await page.evaluate(() => {
    const multiplayer = window.__dustMultiplayerTest;
    const started = multiplayer.startMockHost(["Host", "Guest"]);
    multiplayer.setPlayerPosition("mock-player-2", started.players[0].x, started.players[0].z);
    const guest = multiplayer.getState().players.find((player) => player.id === "mock-player-2");
    for (let index = 0; index < 12; index += 1) {
      multiplayer.spawnEnemyAt(guest.x - 8 + index * 1.2, guest.z + (index % 3) * 1.4, "walker", 2);
    }
    return JSON.parse(JSON.stringify(multiplayer.buildWireSnapshot(false, false, "mock-player-2")));
  });
  const decoded = decodeEnemySection(valid.enemyDelta);
  const firstBatch = decoded.batches[0];
  expect(firstBatch).toBeTruthy();

  const variants = [];
  {
    const bytes = Buffer.from(valid.enemyDelta.d, "base64");
    const terminalBit = firstBatch.span - 1;
    bytes[firstBatch.bitmapOffset + (terminalBit >>> 3)] &= ~(1 << (terminalBit & 7));
    variants.push({ name: "bitmap", data: bytes.toString("base64") });
  }
  {
    const bytes = Buffer.from(valid.enemyDelta.d, "base64");
    const count = bytes[6] | (bytes[7] << 8);
    const corruptCount = count + 1;
    bytes[6] = corruptCount & 255;
    bytes[7] = (corruptCount >>> 8) & 255;
    variants.push({ name: "count", data: bytes.toString("base64") });
  }
  {
    const bytes = Buffer.concat([Buffer.from(valid.enemyDelta.d, "base64"), Buffer.from([0x7f])]);
    variants.push({ name: "trailing", data: bytes.toString("base64") });
  }
  variants.push({
    name: "section-version",
    patch: { v: valid.enemyDelta.v === 2 ? 1 : 2 },
  });
  variants.push({
    name: "section-keyframe",
    patch: { k: valid.enemyDelta.k ? 0 : 1 },
  });
  variants.push({
    name: "section-revision",
    patch: { r: Number(valid.enemyDelta.r) + 1 },
  });
  variants.push({ name: "section-revision-negative", patch: { r: -1 } });
  variants.push({ name: "section-revision-overflow", patch: { r: 0x1_0000_0000 } });
  variants.push({
    name: "section-count",
    patch: { c: Number(valid.enemyDelta.c) + 1 },
  });
  variants.push({ name: "section-count-negative", patch: { c: -1 } });
  variants.push({ name: "section-count-overflow", patch: { c: 0x1_0000 } });
  {
    const bytes = Buffer.from(valid.enemyDelta.d, "base64");
    bytes[1] = 2;
    variants.push({
      name: "invalid-binary-keyframe-flag",
      data: bytes.toString("base64"),
      // Match the outer value deliberately so this variant exercises the
      // binary 0/1 validation rather than only the metadata equality check.
      patch: { k: 2 },
    });
  }

  const results = await page.evaluate(({ wire, variants: corruptions }) => {
    const multiplayer = window.__dustMultiplayerTest;
    return corruptions.map((corruption) => {
      multiplayer.startMockGuest(["Host", "Guest"], 1, wire.matchId);
      window.__nearbyCapture.sent.length = 0;
      const damaged = JSON.parse(JSON.stringify(wire));
      Object.assign(damaged.enemyDelta, corruption.patch || {});
      if (corruption.data) damaged.enemyDelta.d = corruption.data;
      multiplayer.applySnapshot(damaged);
      window.advanceTime(60);
      const input = window.__nearbyCapture.sent
        .filter((entry) => entry.message?.type === "input")
        .at(-1)?.message || null;
      return {
        name: corruption.name,
        enemies: multiplayer.getGuestEnemyDiagnostics(),
        requestSequence: multiplayer.getSpectatorDiagnostics().enemyKeyframeRequestSequence,
        input,
      };
    });
  }, { wire: valid, variants });

  for (const result of results) {
    expect(result.enemies, result.name).toEqual([]);
    expect(result.requestSequence, result.name).toBe(1);
    expect(result.input, result.name).toBeTruthy();
    // snapshotAck is only transport/cumulative-delivery state. The exact enemy
    // chunk ACK is the authority that may advance a frozen keyframe.
    expect(result.input.snapshotAck, result.name).toBe(valid.sequence);
    expect(result.input, result.name).not.toHaveProperty("enemyKeyframeAck");
  }
});

test("a reported wide client viewport and high RTT reach full enemy cadence before the client camera edge", async ({ page }) => {
  test.setTimeout(120_000);

  await page.setViewportSize({ width: 1920, height: 800 });
  await openGame(page);
  const wideView = await page.evaluate(() => {
    const camera = JSON.parse(window.render_game_to_text()).camera;
    const bounds = camera.viewGround;
    return {
      bounds: [bounds.minX, bounds.maxX, bounds.minZ, bounds.maxZ],
      width: bounds.maxX - bounds.minX,
    };
  });

  await page.setViewportSize({ width: 1024, height: 768 });
  await page.waitForFunction((wideWidth) => {
    const bounds = JSON.parse(window.render_game_to_text()).camera.viewGround;
    return bounds.maxX - bounds.minX < wideWidth - 20;
  }, wideView.width);
  const narrowView = await page.evaluate(() => {
    const bounds = JSON.parse(window.render_game_to_text()).camera.viewGround;
    return {
      bounds: [bounds.minX, bounds.maxX, bounds.minZ, bounds.maxZ],
      width: bounds.maxX - bounds.minX,
    };
  });

  expect(wideView.width).toBeGreaterThan(narrowView.width + 20);

  const hostRun = await page.evaluate(({ wide, narrow }) => {
    const multiplayer = window.__dustMultiplayerTest;
    multiplayer.startMockHost(["Host", "Wide Guest", "Future Spectator"]);
    multiplayer.setPlayerPosition("mock-player-1", 0, 0);
    multiplayer.setPlayerPosition("mock-player-2", 0, 0);
    multiplayer.setPlayerPosition("mock-player-3", 0, 0);
    multiplayer.setProgression("mock-player-1", { hpRegen: 1000 });
    multiplayer.setProgression("mock-player-2", { hpRegen: 1000 });
    multiplayer.setProgression("mock-player-3", { hpRegen: 1000 });
    multiplayer.injectInput("mock-player-2", {
      sequence: 1,
      view: wide.bounds,
    });
    multiplayer.setNetworkRtt("mock-player-2", 500);

    const desiredX = wide.bounds[1] + 15;
    const spawned = multiplayer.spawnEnemyAt(desiredX, 0, "fastZombie", 18);
    const initial = JSON.parse(JSON.stringify(
      multiplayer.buildWireSnapshot(false, false, "mock-player-2")
    ));
    multiplayer.acknowledgeClientState("mock-player-2", initial.sequence, 0, false);

    const frames = [];
    let visibleFrames = 0;
    for (let index = 0; index < 240; index += 1) {
      // Immediate test ACKs would otherwise pull the smoothed RTT toward zero.
      // Restore the measured high-latency value before every host snapshot.
      multiplayer.setNetworkRtt("mock-player-2", 500);
      window.advanceTime(1000 / 15);
      multiplayer.setHealth("mock-player-1", 100);
      multiplayer.setHealth("mock-player-2", 100);
      const authoritative = multiplayer.getAuthoritativeEnemies().find(
        (enemy) => enemy.id === spawned.id
      );
      const wire = JSON.parse(JSON.stringify(
        multiplayer.buildWireSnapshot(false, false, "mock-player-2")
      ));
      multiplayer.acknowledgeClientState("mock-player-2", wire.sequence, 0, false);
      const insideClientCamera = !!authoritative &&
        authoritative.x - spawned.radius <= wide.bounds[1] &&
        authoritative.x + spawned.radius >= wide.bounds[0] &&
        authoritative.z - spawned.radius <= wide.bounds[3] &&
        authoritative.z + spawned.radius >= wide.bounds[2];
      frames.push({
        wire,
        x: authoritative && authoritative.x,
        z: authoritative && authoritative.z,
        teleports: authoritative && authoritative.teleports,
        insideClientCamera,
      });
      if (insideClientCamera) visibleFrames += 1;
      if (visibleFrames >= 12) break;
    }

    // The live target now reports a narrow camera while a surrendered third
    // player spectates it through the wide camera. Spawn safety must still use
    // the observer's wider viewport even though that observer is not a pressure
    // target and cannot receive a zombie assignment.
    multiplayer.injectInput("mock-player-2", { sequence: 2, view: narrow.bounds });
    multiplayer.injectInput("mock-player-3", { sequence: 1, view: wide.bounds });
    multiplayer.surrender("mock-player-3");
    multiplayer.injectInput("mock-player-3", {
      sequence: 2,
      view: wide.bounds,
      spectatorTargetId: "mock-player-2",
    });
    const spectatorSafeSpawns = [];
    for (let index = 0; index < 12; index += 1) {
      spectatorSafeSpawns.push(window.__dustAndDeadTest.spawnZombieNow());
    }
    return { spawned, initial, frames, wide, narrow, spectatorSafeSpawns };
  }, { wide: wideView, narrow: narrowView });

  expect(hostRun.initial.enemyScope.maxX).toBeCloseTo(wideView.bounds[1] + 20, 1);
  expect(hostRun.initial.enemyScope.maxX).toBeGreaterThan(narrowView.bounds[1] + 30);

  const decodedFrames = hostRun.frames.map((frame) => {
    const decoded = decodeEnemySection(frame.wire.enemyDelta);
    const op = decoded.ops.find((candidate) => candidate.id === hostRun.spawned.id);
    return {
      ...frame,
      hasPosition: !!(op && (
        op.kind === 0 || op.kind === 1 && (op.mask & UPDATE_POSITION)
      )),
    };
  });
  decodedFrames.forEach((frame, index) => {
    frame.quantizedHostMoved = index > 0 && (
      Math.round(frame.x * 16) !== Math.round(decodedFrames[index - 1].x * 16) ||
      Math.round(frame.z * 16) !== Math.round(decodedFrames[index - 1].z * 16)
    );
  });

  const firstVisible = decodedFrames.findIndex((frame) => frame.insideClientCamera);
  expect(firstVisible, "the fast zombie must enter the reported wide camera").toBeGreaterThan(12);
  expect(decodedFrames.slice(1, Math.max(2, firstVisible - 12)).some(
    (frame) => frame.quantizedHostMoved && !frame.hasPosition
  ), "the genuinely offscreen prefetch ring should retain reduced cadence").toBe(true);

  // With 500 ms RTT the dynamic lead adds about 3.8 units beyond the fixed
  // five-unit pad. This band is outside the fixed pad (including the one-unit
  // overlap radius), so consecutive movement here proves the RTT lead is live.
  const rttOnlyLeadBand = decodedFrames.filter((frame) =>
    frame.x > wideView.bounds[1] + 6.4 &&
    frame.x < wideView.bounds[1] + 8.2
  );
  expect(rttOnlyLeadBand.length).toBeGreaterThanOrEqual(3);
  expect(rttOnlyLeadBand.every(
    (frame) => !frame.quantizedHostMoved || frame.hasPosition
  ), JSON.stringify(rttOnlyLeadBand.map((frame) => ({
    x: frame.x,
    moved: frame.quantizedHostMoved,
    sent: frame.hasPosition,
  })))).toBe(true);

  const cameraApproach = decodedFrames.slice(Math.max(1, firstVisible - 10), firstVisible + 8);
  expect(cameraApproach.every(
    (frame) => !frame.quantizedHostMoved || frame.hasPosition
  )).toBe(true);
  expect(Math.max(...decodedFrames.map((frame) => frame.teleports || 0))).toBe(0);
  expect(hostRun.spectatorSafeSpawns).toHaveLength(12);
  expect(hostRun.spectatorSafeSpawns.every(Boolean)).toBe(true);
  expect(hostRun.spectatorSafeSpawns.every(
    (spawn) => spawn.outsideAllPlayerViews && spawn.insideEnemyBounds && !spawn.blocked
  )).toBe(true);
});

test("an offscreen reduced-cadence enemy becomes full-rate before entering the real camera without disappearance, teleport or a long freeze", async ({ page }) => {
  test.setTimeout(120_000);
  await openGame(page);

  const hostRun = await page.evaluate(() => {
    const multiplayer = window.__dustMultiplayerTest;
    multiplayer.startMockHost(["Host", "Guest"]);
    multiplayer.setPlayerPosition("mock-player-1", 0, 0);
    multiplayer.setPlayerPosition("mock-player-2", 0, 0);
    multiplayer.setProgression("mock-player-1", { hpRegen: 1000 });
    multiplayer.setProgression("mock-player-2", { hpRegen: 1000 });
    const guest = multiplayer.getState().players.find((player) => player.id === "mock-player-2");
    const visible = JSON.parse(window.render_game_to_text()).camera.visibleGround;
    const desiredX = Math.max(visible.maxX + 17, guest.x + 31);
    const spawned = multiplayer.spawnEnemyAt(desiredX, guest.z, "fastZombie", 18);
    const initial = JSON.parse(JSON.stringify(multiplayer.buildWireSnapshot(false, false, "mock-player-2")));
    multiplayer.acknowledgeClientState("mock-player-2", initial.sequence, 0, false);

    const frames = [];
    let visibleFrames = 0;
    for (let index = 0; index < 240; index += 1) {
      window.advanceTime(1000 / 15);
      multiplayer.setHealth("mock-player-1", 100);
      multiplayer.setHealth("mock-player-2", 100);
      const authoritative = multiplayer.getAuthoritativeEnemies().find((enemy) => enemy.id === spawned.id);
      const rendered = JSON.parse(window.render_game_to_text()).enemies.find((enemy) => enemy.groupId);
      const wire = JSON.parse(JSON.stringify(multiplayer.buildWireSnapshot(false, false, "mock-player-2")));
      multiplayer.acknowledgeClientState("mock-player-2", wire.sequence, 0, false);
      const outsideView = rendered ? rendered.outsideView : true;
      frames.push({
        wire,
        x: authoritative && authoritative.x,
        z: authoritative && authoritative.z,
        teleports: authoritative && authoritative.teleports,
        outsideView,
      });
      if (!outsideView) visibleFrames += 1;
      if (visibleFrames >= 12) break;
    }
    return { spawned, initial, frames };
  });

  const decodedFrames = hostRun.frames.map((frame) => {
    const decoded = decodeEnemySection(frame.wire.enemyDelta);
    const op = decoded.ops.find((candidate) => candidate.id === hostRun.spawned.id);
    return {
      ...frame,
      hasPosition: !!(op && (op.kind === 0 || op.kind === 1 && (op.mask & UPDATE_POSITION))),
    };
  });
  decodedFrames.forEach((frame, index) => {
    frame.quantizedHostMoved = index > 0 && (
      Math.round(frame.x * 16) !== Math.round(decodedFrames[index - 1].x * 16) ||
      Math.round(frame.z * 16) !== Math.round(decodedFrames[index - 1].z * 16)
    );
  });
  const firstVisible = decodedFrames.findIndex((frame) => !frame.outsideView);
  expect(firstVisible, "the probe zombie must reach the actual camera").toBeGreaterThan(8);
  expect(decodedFrames.slice(1, Math.max(2, firstVisible - 12)).some(
    (frame) => frame.quantizedHostMoved && !frame.hasPosition
  )).toBe(true);
  // The protocol intentionally keeps the broad relevance ring reduced-rate;
  // the narrow full-rate guard begins immediately before the true camera edge.
  const cameraCrossing = decodedFrames.slice(Math.max(1, firstVisible - 3), firstVisible + 8);
  expect(cameraCrossing.every(
    (frame) => !frame.quantizedHostMoved || frame.hasPosition
  ), JSON.stringify(cameraCrossing.map((frame, index) => ({
    index: firstVisible - 3 + index,
    x: frame.x,
    z: frame.z,
    moved: frame.quantizedHostMoved,
    sent: frame.hasPosition,
    outside: frame.outsideView,
    ops: frame.wire.enemyDelta && frame.wire.enemyDelta.c,
  })))).toBe(true);
  expect(Math.max(...decodedFrames.map((frame) => frame.teleports || 0))).toBe(0);
  expect(Math.hypot(
    decodedFrames[0].x - decodedFrames.at(-1).x,
    decodedFrames[0].z - decodedFrames.at(-1).z
  )).toBeGreaterThan(4);

  const guestRun = await page.evaluate(({ initial, frames, enemyId }) => {
    const multiplayer = window.__dustMultiplayerTest;
    multiplayer.startMockGuest(["Host", "Guest"], 1);
    multiplayer.applySnapshot(initial);
    const samples = [];
    for (const frame of frames) {
      multiplayer.applySnapshot(frame.wire);
      window.advanceTime(1000 / 15);
      const enemy = multiplayer.getGuestEnemyDiagnostics().find((candidate) => candidate.id === enemyId);
      samples.push(enemy || null);
    }
    return samples;
  }, { initial: hostRun.initial, frames: hostRun.frames, enemyId: hostRun.spawned.id });

  expect(guestRun.every(Boolean)).toBe(true);
  expect(guestRun.every((enemy) => enemy.attached)).toBe(true);
  let maxTargetJump = 0;
  let maxCameraTargetJump = 0;
  let maxRenderedStep = 0;
  let maxCameraRenderedStep = 0;
  let longestFreeze = 0;
  let currentFreeze = 0;
  for (let index = 1; index < guestRun.length; index += 1) {
    const targetJump = Math.hypot(
      guestRun[index].targetX - guestRun[index - 1].targetX,
      guestRun[index].targetZ - guestRun[index - 1].targetZ
    );
    const renderedStep = Math.hypot(
      guestRun[index].x - guestRun[index - 1].x,
      guestRun[index].z - guestRun[index - 1].z
    );
    maxTargetJump = Math.max(maxTargetJump, targetJump);
    if (index >= Math.max(1, firstVisible - 3)) {
      maxCameraTargetJump = Math.max(maxCameraTargetJump, targetJump);
    }
    maxRenderedStep = Math.max(maxRenderedStep, renderedStep);
    if (index >= Math.max(1, firstVisible - 3)) {
      maxCameraRenderedStep = Math.max(maxCameraRenderedStep, renderedStep);
    }
    const hostMoved = Math.hypot(
      decodedFrames[index].x - decodedFrames[index - 1].x,
      decodedFrames[index].z - decodedFrames[index - 1].z
    ) > 0.015;
    if (hostMoved && renderedStep < 0.002) {
      currentFreeze += 1;
      longestFreeze = Math.max(longestFreeze, currentFreeze);
    } else {
      currentFreeze = 0;
    }
  }
  // A far fast zombie may legitimately cover three 15 Hz samples before its
  // reduced-cadence absolute update. Once it reaches the camera guard, every
  // changed sample is present and the target corrections become single-frame.
  expect(maxTargetJump).toBeLessThan(2.2);
  expect(maxCameraTargetJump).toBeLessThan(0.9);
  expect(maxRenderedStep).toBeLessThan(2.2);
  expect(maxCameraRenderedStep).toBeLessThan(1.5);
  expect(longestFreeze).toBeLessThanOrEqual(2);
  expect(guestRun[firstVisible].visible).toBe(true);
});
