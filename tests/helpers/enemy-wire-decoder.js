const ENEMY_UPDATE_POSITION = 1;
const ENEMY_UPDATE_ANGLE = 2;
const ENEMY_UPDATE_HP = 4;
const ENEMY_UPDATE_FX = 8;
const ENEMY_UPDATE_SPITTER = 16;
const FORMAT_2_POSITION_ANGLE_BATCH = 1;
const FORMAT_2_POSITION_BATCH = 2;
const FORMAT_2_FULL_BATCH = 3;
const FORMAT_2_ANGLE_BATCH = 4;
const FORMAT_2_MAX_BATCH_SPAN = 1024;

function decodeEnemyOps(section) {
  if (!section?.d) throw new Error("Missing packed enemy payload");
  const bytes = Buffer.from(section.d, "base64");
  let offset = 0;

  const requireBytes = (count, label) => {
    if (offset + count > bytes.length) {
      throw new Error(`Truncated enemy payload while reading ${label}`);
    }
  };
  const readByte = () => {
    requireBytes(1, "byte");
    return bytes[offset++];
  };
  const readUint16 = () => {
    requireBytes(2, "uint16");
    const value = bytes[offset] | (bytes[offset + 1] << 8);
    offset += 2;
    return value;
  };
  const readInt16 = () => {
    const value = readUint16();
    return value & 0x8000 ? value - 0x10000 : value;
  };
  const readUint32 = () => {
    requireBytes(4, "uint32");
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
      const byte = bytes[offset++];
      value |= (byte & 0x7f) << shift;
      if (!(byte & 0x80)) return value >>> 0;
      shift += 7;
    }
    throw new Error("Invalid enemy id varint");
  };
  const readRelativePosition = (originX, originZ) => {
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
  const readPackedBatchPositions = (entryCount, originX, originZ) => {
    const mode = readByte();
    if (mode !== 0 && mode !== 1) throw new Error(`Invalid packed position mode ${mode}`);
    let wideBitmap = null;
    if (mode === 1) {
      const bitmapLength = Math.ceil(entryCount / 8);
      requireBytes(bitmapLength, "wide-position bitmap");
      wideBitmap = bytes.subarray(offset, offset + bitmapLength);
      offset += bitmapLength;
      if (!(wideBitmap[0] & 1)) throw new Error("First packed batch position must be absolute");
    }
    const positions = [];
    for (let index = 0; index < entryCount; index += 1) {
      const wide = mode === 0 || (wideBitmap[index >>> 3] & (1 << (index & 7)));
      if (wide) {
        positions.push(readRelativePosition(originX, originZ));
        continue;
      }
      if (!positions.length) throw new Error("Packed position delta has no baseline");
      let dx = readByte();
      let dz = readByte();
      if (dx & 0x80) dx -= 0x100;
      if (dz & 0x80) dz -= 0x100;
      const previous = positions[positions.length - 1];
      positions.push({
        x: (Math.round(previous.x * 16) + dx) / 16,
        z: (Math.round(previous.z * 16) + dz) / 16,
      });
    }
    return positions;
  };
  const readFullEnemy = (id, revision, relative, originX, originZ) => {
    const typeFx = readByte();
    const position = relative
      ? readRelativePosition(originX, originZ)
      : { x: readInt16() / 16, z: readInt16() / 16 };
    const hpRatio = readByte();
    const maxHp = readUint16() / 10;
    const angleByte = readByte();
    const type = typeFx & 7;
    const op = {
      id,
      kind: 0,
      mask: 0,
      revision,
      type,
      x: position.x,
      z: position.z,
      hpRatio,
      maxHp,
      angle: angleByte / 255 * Math.PI * 2 - Math.PI,
      fx: (typeFx >>> 3) & 15,
    };
    if (type === 4) {
      op.spit = readByte() / 255;
      op.windup = readByte() / 100;
    }
    return op;
  };
  const readGenericUpdate = (id, mask, revision) => {
    const op = { id, kind: 1, mask, revision };
    if (mask & ENEMY_UPDATE_POSITION) {
      op.x = readInt16() / 16;
      op.z = readInt16() / 16;
    }
    if (mask & ENEMY_UPDATE_ANGLE) op.angle = readByte() / 255 * Math.PI * 2 - Math.PI;
    if (mask & ENEMY_UPDATE_HP) op.hpRatio = readByte();
    if (mask & ENEMY_UPDATE_FX) op.fx = readByte();
    if (mask & ENEMY_UPDATE_SPITTER) {
      op.spit = readByte() / 255;
      op.windup = readByte() / 100;
    }
    return op;
  };
  const readBatchedFullEnemy = (id, revision, position) => {
    const typeFx = readByte();
    const hpRatio = readByte();
    const maxHp = readUint16() / 10;
    const angleByte = readByte();
    const type = typeFx & 7;
    const op = {
      id,
      kind: 0,
      mask: 0,
      revision,
      type,
      x: position.x,
      z: position.z,
      hpRatio,
      maxHp,
      angle: angleByte / 255 * Math.PI * 2 - Math.PI,
      fx: (typeFx >>> 3) & 15,
    };
    if (type === 4) {
      op.spit = readByte() / 255;
      op.windup = readByte() / 100;
    }
    return op;
  };

  const format = readByte();
  readByte(); // keyframe flag; the tests use the enclosing section contract.
  const revision = readUint32();
  const count = readUint16();
  if (format !== 1 && format !== 2) throw new Error(`Unsupported enemy payload format ${format}`);

  let originX = 0;
  let originZ = 0;
  if (format === 2) {
    originX = readInt16();
    originZ = readInt16();
  }

  const ops = [];
  let previousId = 0;
  while (ops.length < count) {
    const header = readByte();
    if (format === 2 && header >= FORMAT_2_POSITION_ANGLE_BATCH && header <= FORMAT_2_ANGLE_BATCH) {
      const firstId = previousId + readUleb128();
      const span = readUleb128();
      if (firstId <= previousId || span <= 0 || span > FORMAT_2_MAX_BATCH_SPAN) {
        throw new Error("Invalid packed enemy batch range");
      }
      const bitmapLength = Math.ceil(span / 8);
      requireBytes(bitmapLength, "batch bitmap");
      const bitmap = bytes.subarray(offset, offset + bitmapLength);
      offset += bitmapLength;
      const ids = [];
      for (let relativeId = 0; relativeId < span; relativeId += 1) {
        if (bitmap[relativeId >>> 3] & (1 << (relativeId & 7))) ids.push(firstId + relativeId);
      }
      if (
        !ids.length ||
        ids[ids.length - 1] !== firstId + span - 1 ||
        ops.length + ids.length > count
      ) throw new Error("Invalid packed enemy batch bitmap");

      if (header === FORMAT_2_POSITION_ANGLE_BATCH) {
        const positions = readPackedBatchPositions(ids.length, originX, originZ);
        const batch = ids.map((id, index) => {
          const position = positions[index];
          return {
            id,
            kind: 1,
            mask: ENEMY_UPDATE_POSITION | ENEMY_UPDATE_ANGLE,
            revision,
            x: position.x,
            z: position.z,
          };
        });
        batch.forEach((op) => { op.angle = readByte() / 255 * Math.PI * 2 - Math.PI; });
        ops.push(...batch);
      } else if (header === FORMAT_2_POSITION_BATCH) {
        const positions = readPackedBatchPositions(ids.length, originX, originZ);
        ids.forEach((id, index) => {
          const position = positions[index];
          ops.push({
            id,
            kind: 1,
            mask: ENEMY_UPDATE_POSITION,
            revision,
            x: position.x,
            z: position.z,
          });
        });
      } else if (header === FORMAT_2_ANGLE_BATCH) {
        ids.forEach((id) => {
          ops.push({
            id,
            kind: 1,
            mask: ENEMY_UPDATE_ANGLE,
            revision,
            angle: readByte() / 255 * Math.PI * 2 - Math.PI,
          });
        });
      } else if (header === FORMAT_2_FULL_BATCH) {
        const positions = readPackedBatchPositions(ids.length, originX, originZ);
        ids.forEach((id, index) => ops.push(readBatchedFullEnemy(id, revision, positions[index])));
      }
      previousId = firstId + span - 1;
      continue;
    }

    const id = previousId + readUleb128();
    if (id <= previousId) throw new Error("Packed enemy ids must increase");
    previousId = id;
    const kind = header >>> 6;
    const mask = header & 31;
    if (kind >= 2) {
      if (header !== 128 && header !== 192) throw new Error(`Invalid enemy removal header ${header}`);
      ops.push({ id, kind, mask: 0, revision });
    } else if (kind === 0) {
      if (header !== 0) throw new Error(`Invalid full enemy header ${header}`);
      ops.push(readFullEnemy(id, revision, false, 0, 0));
    } else {
      ops.push(readGenericUpdate(id, mask, revision));
    }
  }

  if (offset !== bytes.length) {
    throw new Error(`Enemy payload has ${bytes.length - offset} trailing bytes`);
  }
  return ops;
}

function decodeEnemyOpKinds(section) {
  return decodeEnemyOps(section).map(({ id, kind }) => ({ id, kind }));
}

function decodeEnemyIds(section) {
  return decodeEnemyOps(section).map((op) => op.id);
}

module.exports = { decodeEnemyIds, decodeEnemyOpKinds, decodeEnemyOps };
