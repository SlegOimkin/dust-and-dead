const path = require("node:path");
const { expect, test } = require("@playwright/test");

const REQUIRED_GAME_API = [
  "startWaveNow",
  "forceWaveState",
  "advanceSpawningOnly",
  "killNearestZombie",
  "getHordeheartDiagnostics",
  "forceHordeheartPhase",
  "forceHordeheartAttack",
  "seekHordeheartAction",
  "setHordeheartAiEnabled",
  "advanceHordeheart",
];

function fileUrl(relativePath) {
  const absolute = path.resolve(__dirname, "..", relativePath).replace(/\\/g, "/");
  return `file:///${absolute}`;
}

async function startHunt(page) {
  await page.goto(`${fileUrl("index.html")}?mapSeed=7331&hordeheartClientSync=1`);
  const intro = page.locator("#intro-screen");
  if (await intro.isVisible().catch(() => false)) {
    await page.keyboard.press("KeyM");
    await expect(intro).toBeHidden();
  }
  await page.getByRole("button", { name: "Start Hunt" }).click();
  await page.waitForFunction(() => Boolean(
    window.__dustAndDeadTest?.getHordeheartDiagnostics
      && window.__dustMultiplayerTest?.buildWireSnapshot
      && window.__dustMultiplayerTest?.applySnapshot
  ));

  const missing = await page.evaluate((names) => names.filter(
    (name) => typeof window.__dustAndDeadTest?.[name] !== "function"
  ), REQUIRED_GAME_API);
  expect(missing, `Hordeheart client-sync API is incomplete: ${missing.join(", ")}`).toEqual([]);
}

function maxOf(values) {
  return values.length ? Math.max(...values) : 0;
}

test("protocol 46 rejects malformed Hordeheart topology instead of spawning phantom fragments", async ({ page }) => {
  await startHunt(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const multiplayer = window.__dustMultiplayerTest;
    game.startWaveNow(10, "hordeheart");
    game.forceHordeheartPhase("quarters");
    const packed = game.getHordeheartPackedWireDiagnostics().packed;
    const bytes = Uint8Array.from(atob(packed), (character) => character.charCodeAt(0));
    const encode = (next) => {
      let binary = "";
      for (const value of next) binary += String.fromCharCode(value);
      return btoa(binary);
    };
    const mutate = (callback) => {
      const next = Uint8Array.from(bytes);
      callback(next);
      return multiplayer.decodeBossState(encode(next));
    };
    let offset = 8; // format/type/flags/phase + center x/z
    const skipUleb = () => {
      while (offset < bytes.length) {
        const value = bytes[offset++];
        if (!(value & 128)) break;
      }
    };
    skipUleb(); // horde hp
    skipUleb(); // horde max hp
    skipUleb(); // phase sequence
    offset += 4; // phase/death timers
    const bodyCountOffset = offset;
    const firstBodyIndexOffset = bodyCountOffset + 1;
    const firstBodyFlagsOffset = firstBodyIndexOffset + 1;
    return {
      bytes: bytes.length,
      valid: multiplayer.decodeBossState(packed),
      wrongCount: mutate((next) => { next[bodyCountOffset] = 3; }),
      wrongIndex: mutate((next) => { next[firstBodyIndexOffset] = 7; }),
      wrongSize: mutate((next) => { next[firstBodyFlagsOffset] &= ~12; }),
      missingProvenance: mutate((next) => { next[firstBodyFlagsOffset] &= ~64; }),
      unknownFlag: mutate((next) => { next[firstBodyFlagsOffset] |= 128; }),
      truncated: multiplayer.decodeBossState(encode(bytes.slice(0, -1))),
    };
  });

  expect(result.bytes).toBeLessThanOrEqual(768);
  expect(result.valid).toMatchObject({ kind: "hordeheart", phase: "quarters" });
  expect(result.valid.bodies).toHaveLength(4);
  expect(result.wrongCount).toBeNull();
  expect(result.wrongIndex).toBeNull();
  expect(result.wrongSize).toBeNull();
  expect(result.missingProvenance).toBeNull();
  expect(result.unknownFlag).toBeNull();
  expect(result.truncated).toBeNull();
});

test("all final ten horde zombies reach an out-of-view guest for minimap highlighting", async ({ page, context }) => {
  const guest = await context.newPage();
  try {
    await startHunt(page);
    await startHunt(guest);

    const host = await page.evaluate(() => {
      const game = window.__dustAndDeadTest;
      const multiplayer = window.__dustMultiplayerTest;
      multiplayer.startMockHost(["Host", "Guest"]);
      game.forceWaveState(10, 10, 0, "hordeheart");
      game.setHordeheartAiEnabled(false);
      game.advanceHordeheart(17);
      return {
        diagnostics: game.getHordeheartDiagnostics(),
        snapshot: JSON.parse(JSON.stringify(
          multiplayer.buildWireSnapshot(false, false, "mock-player-2")
        )),
      };
    });

    const replica = await guest.evaluate((snapshot) => {
      const game = window.__dustAndDeadTest;
      const multiplayer = window.__dustMultiplayerTest;
      multiplayer.startMockGuest(["Host", "Guest"], 1);
      multiplayer.applySnapshot(snapshot);
      return {
        diagnostics: game.getHordeheartDiagnostics(),
        enemies: game.getThreeObjectDiagnostics().state.enemies,
      };
    }, host.snapshot);

    expect(host.diagnostics).toMatchObject({
      phase: "horde",
      hordeHp: 10,
      hordeMinimapRevealActive: true,
      hordeMinimapHighlightedCount: 10,
    });
    expect(replica.diagnostics).toMatchObject({
      replica: true,
      phase: "horde",
      hordeHp: 10,
      hordeMinimapRevealActive: true,
      hordeMinimapHighlightedCount: 10,
    });
    expect(replica.enemies).toBe(10);
  } finally {
    await guest.close();
  }
});

test("a guest receives floor flesh and animates the same horde -> gather -> whole assembly", async ({ page, context }) => {
  test.setTimeout(120_000);
  const guest = await context.newPage();
  const hostErrors = [];
  const guestErrors = [];
  page.on("pageerror", (error) => hostErrors.push(error.message));
  guest.on("pageerror", (error) => guestErrors.push(error.message));

  try {
    await startHunt(page);
    await startHunt(guest);

    const host = await page.evaluate(() => {
      const game = window.__dustAndDeadTest;
      const multiplayer = window.__dustMultiplayerTest;
      const snapshot = () => JSON.parse(JSON.stringify(
        multiplayer.buildWireSnapshot(false, false, "mock-player-2")
      ));
      multiplayer.startMockHost(["Host", "Guest"]);
      game.startWaveNow(10, "hordeheart");
      game.setHordeheartAiEnabled(false);
      game.advanceSpawningOnly(3000);
      let killed = 0;
      while (killed < 8 && game.killNearestZombie()) killed += 1;
      const horde = game.getHordeheartDiagnostics();
      const hordeSnapshot = snapshot();

      game.forceHordeheartPhase("gather");
      const gather = game.getHordeheartDiagnostics();
      const gatherSnapshot = snapshot();

      game.advanceHordeheart(4300);
      const whole = game.getHordeheartDiagnostics();
      const wholeSnapshot = snapshot();
      return {
        killed,
        horde,
        gather,
        whole,
        snapshots: { horde: hordeSnapshot, gather: gatherSnapshot, whole: wholeSnapshot },
      };
    });

    const replica = await guest.evaluate((snapshots) => {
      const game = window.__dustAndDeadTest;
      const multiplayer = window.__dustMultiplayerTest;
      const distanceToCenter = (diagnostics) => diagnostics.fleshChunkSamples.map((chunk) => (
        Math.hypot(chunk.x - diagnostics.centerX, chunk.z - diagnostics.centerZ)
      ));
      multiplayer.startMockGuest(["Host", "Guest"], 1);
      multiplayer.applySnapshot(snapshots.horde);
      const horde = game.getHordeheartDiagnostics();

      const beforeGatherEffects = game.getThreeObjectDiagnostics().state;
      multiplayer.applySnapshot(snapshots.gather);
      const afterGatherEffects = game.getThreeObjectDiagnostics().state;
      multiplayer.applySnapshot(snapshots.gather);
      const afterRepeatedGather = game.getThreeObjectDiagnostics().state;
      const gatherStart = game.getHordeheartDiagnostics();
      const gatherStartDistances = distanceToCenter(gatherStart);
      const gatherFrames = [];
      for (let frame = 0; frame < 36; frame += 1) {
        game.advanceHordeheart(1000 / 60);
        const diagnostics = game.getHordeheartDiagnostics();
        gatherFrames.push({
          phaseTimer: diagnostics.phaseTimer,
          distances: distanceToCenter(diagnostics),
        });
      }
      const gatherAfter = game.getHordeheartDiagnostics();

      multiplayer.applySnapshot(snapshots.whole);
      const whole = game.getHordeheartDiagnostics();
      return {
        horde,
        beforeGatherEffects,
        afterGatherEffects,
        afterRepeatedGather,
        gatherStart,
        gatherStartDistances,
        gatherFrames,
        gatherAfter,
        whole,
      };
    }, host.snapshots);

    const downSnapshot = await page.evaluate(() => {
      const game = window.__dustAndDeadTest;
      game.damageHordeheart(1e9, 0);
      return JSON.parse(JSON.stringify(
        window.__dustMultiplayerTest.buildWireSnapshot(false, false, "mock-player-2")
      ));
    });
    const downReplica = await guest.evaluate((snapshot) => {
      const game = window.__dustAndDeadTest;
      const multiplayer = window.__dustMultiplayerTest;
      const before = game.getThreeObjectDiagnostics().state;
      multiplayer.applySnapshot(snapshot);
      const diagnostics = game.getHordeheartDiagnostics();
      const after = game.getThreeObjectDiagnostics().state;
      multiplayer.applySnapshot(snapshot);
      const afterRepeated = game.getThreeObjectDiagnostics().state;
      return { before, diagnostics, after, afterRepeated };
    }, downSnapshot);

    expect(host.killed).toBeGreaterThanOrEqual(6);
    expect(host.horde.phase).toBe("horde");
    expect(host.horde.fleshChunks).toBe(host.killed);
    expect(host.gather).toMatchObject({ phase: "gather", fleshChunks: host.killed });
    expect(host.whole.phase).toBe("whole");

    expect(replica.horde).toMatchObject({
      replica: true,
      phase: "horde",
      fleshChunks: host.horde.fleshChunks,
    });
    expect(replica.horde.fleshChunkSamples.map((chunk) => chunk.id)).toEqual(
      host.horde.fleshChunkSamples.map((chunk) => chunk.id)
    );
    for (let index = 0; index < replica.horde.fleshChunkSamples.length; index += 1) {
      const actual = replica.horde.fleshChunkSamples[index];
      const expected = host.horde.fleshChunkSamples[index];
      expect(Math.hypot(actual.x - expected.x, actual.z - expected.z)).toBeLessThan(0.04);
    }

    expect(replica.gatherStart).toMatchObject({
      replica: true,
      phase: "gather",
      fleshChunks: host.gather.fleshChunks,
    });
    expect(replica.afterGatherEffects.shockwaves - replica.beforeGatherEffects.shockwaves).toBe(1);
    expect(replica.afterGatherEffects.lightFlashes - replica.beforeGatherEffects.lightFlashes).toBe(1);
    expect(replica.afterRepeatedGather).toMatchObject({
      shockwaves: replica.afterGatherEffects.shockwaves,
      lightFlashes: replica.afterGatherEffects.lightFlashes,
    });
    expect(replica.gatherFrames).toHaveLength(36);
    expect(replica.gatherFrames.at(-1).phaseTimer).toBeLessThan(replica.gatherStart.phaseTimer);
    expect(replica.gatherAfter.fleshChunkSamples).toHaveLength(replica.gatherStart.fleshChunkSamples.length);
    expect(maxOf(replica.gatherStartDistances)).toBeGreaterThan(1);
    expect(maxOf(replica.gatherFrames.at(-1).distances)).toBeLessThan(
      maxOf(replica.gatherStartDistances) - 0.05
    );
    expect(replica.whole).toMatchObject({ replica: true, phase: "whole" });
    expect(replica.whole.bodies).toHaveLength(1);
    expect(downReplica.diagnostics).toMatchObject({ replica: true, phase: "split1" });
    expect(downReplica.diagnostics.bodies[0]).toMatchObject({ downed: true, hitPulse: 1 });
    expect(downReplica.after.shockwaves - downReplica.before.shockwaves).toBe(2);
    expect(downReplica.after.lightFlashes - downReplica.before.lightFlashes).toBe(2);
    expect(downReplica.afterRepeated).toMatchObject({
      shockwaves: downReplica.after.shockwaves,
      lightFlashes: downReplica.after.lightFlashes,
    });
    expect(hostErrors).toEqual([]);
    expect(guestErrors).toEqual([]);
  } finally {
    await guest.close();
  }
});

test("late first halves and quarters packets emerge from rendered parent nodes without a boundary pop", async ({ page, context }) => {
  test.setTimeout(180_000);
  const guest = await context.newPage();
  const blackoutGuest = await context.newPage();
  const hostErrors = [];
  const guestErrors = [];
  page.on("pageerror", (error) => hostErrors.push(error.message));
  guest.on("pageerror", (error) => guestErrors.push(error.message));
  blackoutGuest.on("pageerror", (error) => guestErrors.push(error.message));

  try {
    await startHunt(page);
    await startHunt(guest);
    await startHunt(blackoutGuest);

    const host = await page.evaluate(() => {
      const game = window.__dustAndDeadTest;
      const multiplayer = window.__dustMultiplayerTest;
      const snapshot = () => JSON.parse(JSON.stringify(
        multiplayer.buildWireSnapshot(false, false, "mock-player-2")
      ));
      multiplayer.startMockHost(["Host", "Guest"]);
      game.startWaveNow(10, "hordeheart");
      game.setHordeheartAiEnabled(false);
      game.forceHordeheartPhase("whole");
      const whole = { diagnostics: game.getHordeheartDiagnostics(), snapshot: snapshot() };

      // The guest deliberately misses split1 and the first halves packets.
      game.forceHordeheartPhase("split1");
      game.advanceHordeheart(3500);
      game.advanceHordeheart(420);
      const halvesLate = { diagnostics: game.getHordeheartDiagnostics(), snapshot: snapshot() };
      game.advanceHordeheart(650);
      const halvesSteady = { diagnostics: game.getHordeheartDiagnostics(), snapshot: snapshot() };

      // It then misses split2 and the first quarters packets as well.
      game.forceHordeheartPhase("split2");
      const split2Late = { diagnostics: game.getHordeheartDiagnostics(), snapshot: snapshot() };
      game.advanceHordeheart(3500);
      game.advanceHordeheart(420);
      const quartersLate = { diagnostics: game.getHordeheartDiagnostics(), snapshot: snapshot() };
      for (const bodyIndex of [0, 1, 2, 3]) game.damageHordeheart(1e9, bodyIndex);
      const defeated = { diagnostics: game.getHordeheartDiagnostics(), snapshot: snapshot() };
      return { whole, halvesLate, halvesSteady, split2Late, quartersLate, defeated };
    });

    const replica = await guest.evaluate((hostPackets) => {
      const game = window.__dustAndDeadTest;
      const multiplayer = window.__dustMultiplayerTest;
      multiplayer.startMockGuest(["Host", "Guest"], 1);
      multiplayer.applySnapshot(hostPackets.whole.snapshot);

      const sampleTransition = (incomingSnapshot) => {
        const before = game.getHordeheartDiagnostics();
        multiplayer.applySnapshot(incomingSnapshot);
        const immediate = game.getHordeheartDiagnostics();
        const frames = [immediate];
        for (let frame = 0; frame < 30; frame += 1) {
          game.advanceHordeheart(1000 / 60);
          frames.push(game.getHordeheartDiagnostics());
        }
        const frameSteps = [];
        for (let frame = 1; frame < frames.length; frame += 1) {
          for (const current of frames[frame].bodies) {
            const previous = frames[frame - 1].bodies.find((body) => body.index === current.index);
            if (previous) frameSteps.push(Math.hypot(current.x - previous.x, current.z - previous.z));
          }
        }
        return {
          before,
          immediate,
          after: frames.at(-1),
          maxFrameStep: frameSteps.length ? Math.max(...frameSteps) : 0,
        };
      };

      const halves = sampleTransition(hostPackets.halvesLate.snapshot);
      multiplayer.applySnapshot(hostPackets.halvesSteady.snapshot);
      game.advanceHordeheart(950);
      const quarters = sampleTransition(hostPackets.quartersLate.snapshot);
      return { halves, quarters };
    }, host);

    const blackoutReplica = await blackoutGuest.evaluate((hostPackets) => {
      const game = window.__dustAndDeadTest;
      const multiplayer = window.__dustMultiplayerTest;
      multiplayer.startMockGuest(["Host", "Guest"], 1);
      multiplayer.applySnapshot(hostPackets.whole.snapshot);
      const before = game.getHordeheartDiagnostics();
      // This client misses split1 and the entire stable halves phase. Its next
      // packet is already split2, so topology must be recovered from the
      // currently rendered whole instead of the generic halves layout.
      multiplayer.applySnapshot(hostPackets.split2Late.snapshot);
      const immediate = game.getHordeheartDiagnostics();
      const frames = [immediate];
      for (let frame = 0; frame < 30; frame += 1) {
        game.advanceHordeheart(1000 / 60);
        frames.push(game.getHordeheartDiagnostics());
      }
      const steps = [];
      for (let frame = 1; frame < frames.length; frame += 1) {
        for (const body of frames[frame].bodies) {
          const previous = frames[frame - 1].bodies.find((candidate) => candidate.index === body.index);
          if (previous) steps.push(Math.hypot(body.x - previous.x, body.z - previous.z));
        }
      }
      multiplayer.applySnapshot(hostPackets.defeated.snapshot);
      const defeatedImmediate = game.getHordeheartDiagnostics();
      const defeatedFrames = [defeatedImmediate];
      for (let frame = 0; frame < 30; frame += 1) {
        game.advanceHordeheart(1000 / 60);
        defeatedFrames.push(game.getHordeheartDiagnostics());
      }
      const defeatedSteps = [];
      for (let frame = 1; frame < defeatedFrames.length; frame += 1) {
        for (const body of defeatedFrames[frame].bodies) {
          const previous = defeatedFrames[frame - 1].bodies.find((candidate) => candidate.index === body.index);
          if (previous) defeatedSteps.push(Math.hypot(body.x - previous.x, body.z - previous.z));
        }
      }
      return {
        before,
        immediate,
        after: frames.at(-1),
        maxFrameStep: steps.length ? Math.max(...steps) : 0,
        defeatedImmediate,
        defeatedAfter: defeatedFrames.at(-1),
        defeatedMaxFrameStep: defeatedSteps.length ? Math.max(...defeatedSteps) : 0,
      };
    }, host);

    expect(host.halvesLate.diagnostics).toMatchObject({ phase: "halves" });
    expect(host.split2Late.diagnostics).toMatchObject({ phase: "split2" });
    expect(host.quartersLate.diagnostics).toMatchObject({ phase: "quarters" });
    expect(host.defeated.diagnostics).toMatchObject({ phase: "defeated", defeated: true });
    for (const lateHostPhase of [host.halvesLate, host.quartersLate]) {
      expect(lateHostPhase.diagnostics.bodies.every((body) => body.emergence.active)).toBe(true);
      expect(maxOf(lateHostPhase.diagnostics.bodies.map(
        (body) => body.emergence.distanceFromSource
      ))).toBeGreaterThan(0.12);
    }

    expect(replica.halves.before.phase).toBe("whole");
    expect(replica.quarters.before.phase).toBe("halves");
    for (const [transition, phase, count] of [
      [replica.halves, "halves", 2],
      [replica.quarters, "quarters", 4],
    ]) {
      expect(transition.immediate).toMatchObject({ replica: true, phase });
      expect(transition.immediate.bodies).toHaveLength(count);
      expect(transition.immediate.bodies.every((body) => body.emergence.active)).toBe(true);
      // New roots must first occupy their split-anchor transforms. The late
      // authoritative target belongs in the interpolation buffer, not directly
      // in the currently rendered transform.
      expect(maxOf(transition.immediate.bodies.map(
        (body) => body.emergence.distanceFromSource
      ))).toBeLessThan(0.035);
      expect(maxOf(transition.immediate.bodies.map(
        (body) => body.emergence.progress
      ))).toBeLessThanOrEqual(0.02);
      expect(transition.after.bodies.every(
        (body) => body.emergence.progress > 0.35
      )).toBe(true);
      expect(maxOf(transition.after.bodies.map(
        (body) => body.emergence.distanceFromSource
      ))).toBeGreaterThan(0.06);
      expect(transition.maxFrameStep).toBeLessThan(0.28);
    }
    expect(blackoutReplica.before).toMatchObject({ replica: true, phase: "whole" });
    expect(blackoutReplica.immediate).toMatchObject({ replica: true, phase: "split2" });
    expect(blackoutReplica.immediate.bodies).toHaveLength(2);
    expect(blackoutReplica.immediate.bodies.every((body) => body.emergence.active)).toBe(true);
    expect(maxOf(blackoutReplica.immediate.bodies.map(
      (body) => body.emergence.distanceFromSource
    ))).toBeLessThan(0.035);
    expect(blackoutReplica.immediate.lastSpawnProvenance.every(
      (source) => source.sourceApi !== "phaseLayoutFallback"
    )).toBe(true);
    expect(maxOf(blackoutReplica.immediate.lastSpawnProvenance.map(
      (source) => source.continuityError
    ))).toBeLessThan(0.001);
    expect(blackoutReplica.after.bodies.every(
      (body) => body.emergence.progress > 0.35
    )).toBe(true);
    expect(blackoutReplica.maxFrameStep).toBeLessThan(0.28);
    expect(blackoutReplica.defeatedImmediate).toMatchObject({
      replica: true,
      phase: "defeated",
      defeated: true,
    });
    expect(blackoutReplica.defeatedImmediate.bodies).toHaveLength(4);
    expect(blackoutReplica.defeatedImmediate.bodies.every(
      (body) => body.emergence.active && body.downed
    )).toBe(true);
    expect(blackoutReplica.defeatedImmediate.lastSpawnProvenance.every(
      (source) => source.sourceApi !== "phaseLayoutFallback"
    )).toBe(true);
    expect(blackoutReplica.defeatedAfter.bodies.every(
      (body) => body.emergence.progress > 0.35
    )).toBe(true);
    expect(blackoutReplica.defeatedMaxFrameStep).toBeLessThan(0.28);
    expect(hostErrors).toEqual([]);
    expect(guestErrors).toEqual([]);
  } finally {
    await guest.close();
    await blackoutGuest.close();
  }
});

for (const attack of ["pincer", "rush"]) {
  test(`a long packet-loss burst during ${attack} never hard-snaps a guest body`, async ({ page, context }) => {
    test.setTimeout(120_000);
    const guest = await context.newPage();
    const hostErrors = [];
    const guestErrors = [];
    page.on("pageerror", (error) => hostErrors.push(error.message));
    guest.on("pageerror", (error) => guestErrors.push(error.message));

    try {
      await startHunt(page);
      await startHunt(guest);

      const host = await page.evaluate((requestedAttack) => {
        const game = window.__dustAndDeadTest;
        const multiplayer = window.__dustMultiplayerTest;
        const snapshot = () => JSON.parse(JSON.stringify(
          multiplayer.buildWireSnapshot(false, false, "mock-player-2")
        ));
        multiplayer.startMockHost(["Host", "Guest"]);
        game.startWaveNow(10, "hordeheart");
        game.setHordeheartAiEnabled(false);
        const requiredPhase = requestedAttack === "pincer" ? "halves" : "quarters";
        game.forceHordeheartPhase(requiredPhase);
        const formation = game.getHordeheartDiagnostics();
        multiplayer.setPlayerPosition("mock-player-1", formation.centerX - 2, formation.centerZ + 22);
        multiplayer.setPlayerPosition("mock-player-2", formation.centerX + 2, formation.centerZ + 22);
        game.forceHordeheartAttack(requestedAttack);
        game.seekHordeheartAction(0.16);
        const opening = { diagnostics: game.getHordeheartDiagnostics(), snapshot: snapshot() };
        const packets = [];
        for (let packet = 0; packet < 8; packet += 1) {
          game.advanceHordeheart(100);
          game.seekHordeheartAction(0.16 + (packet + 1) * 0.065);
          packets.push({ diagnostics: game.getHordeheartDiagnostics(), snapshot: snapshot() });
        }
        return { opening, late: packets.at(-1), packets };
      }, attack);

      const replica = await guest.evaluate(({ opening, late }) => {
        const game = window.__dustAndDeadTest;
        const multiplayer = window.__dustMultiplayerTest;
        multiplayer.startMockGuest(["Host", "Guest"], 1);
        multiplayer.applySnapshot(opening.snapshot);
        const openingReplica = game.getHordeheartDiagnostics();

        // No packets arrive for 800 ms, spanning the violent translation part
        // of both attacks. The guest still advances its local playback clock.
        for (let frame = 0; frame < 48; frame += 1) game.advanceHordeheart(1000 / 60);
        const beforePacket = game.getHordeheartDiagnostics();
        multiplayer.applySnapshot(late.snapshot);
        const afterPacket = game.getHordeheartDiagnostics();

        const frames = [afterPacket];
        for (let frame = 0; frame < 48; frame += 1) {
          game.advanceHordeheart(1000 / 60);
          frames.push(game.getHordeheartDiagnostics());
        }
        const steps = [];
        const turns = [];
        for (let frame = 1; frame < frames.length; frame += 1) {
          for (const current of frames[frame].bodies) {
            const previous = frames[frame - 1].bodies.find((body) => body.index === current.index);
            if (previous) {
              steps.push(Math.hypot(current.x - previous.x, current.z - previous.z));
              turns.push(Math.abs(Math.atan2(
                Math.sin(current.facingAngle - previous.facingAngle),
                Math.cos(current.facingAngle - previous.facingAngle),
              )));
            }
          }
        }
        return {
          opening: openingReplica,
          beforePacket,
          afterPacket,
          final: frames.at(-1),
          maxFrameStep: steps.length ? Math.max(...steps) : 0,
          maxFrameTurn: turns.length ? Math.max(...turns) : 0,
        };
      }, { opening: host.opening, late: host.late });

      expect(host.opening.diagnostics.attack).toBe(attack);
      expect(host.late.diagnostics.attack).toBe(attack);
      const hostTravel = host.late.diagnostics.bodies.map((body) => {
        const opening = host.opening.diagnostics.bodies.find((candidate) => candidate.index === body.index);
        return opening ? Math.hypot(body.x - opening.x, body.z - opening.z) : 0;
      });
      expect(maxOf(hostTravel)).toBeGreaterThan(1);

      expect(replica.opening).toMatchObject({ replica: true, attack });
      const packetJumps = replica.afterPacket.bodies.map((body) => {
        const before = replica.beforePacket.bodies.find((candidate) => candidate.index === body.index);
        return before ? Math.hypot(body.x - before.x, body.z - before.z) : Infinity;
      });
      const packetTurns = replica.afterPacket.bodies.map((body) => {
        const before = replica.beforePacket.bodies.find((candidate) => candidate.index === body.index);
        return before ? Math.abs(Math.atan2(
          Math.sin(body.facingAngle - before.facingAngle),
          Math.cos(body.facingAngle - before.facingAngle),
        )) : Infinity;
      });
      expect(maxOf(packetJumps)).toBeLessThan(0.003);
      expect(maxOf(packetTurns)).toBeLessThan(0.003);
      // Colossal translating attacks cap replica velocity at 102 units/s,
      // i.e. 1.7 units on one 60 Hz frame. Allow that authored haul speed while the
      // exact packet boundary above remains effectively motionless.
      expect(replica.maxFrameStep).toBeLessThan(1.95);
      expect(replica.maxFrameTurn).toBeLessThan(0.21);
      const recoveredTravel = replica.final.bodies.map((body) => {
        const before = replica.afterPacket.bodies.find((candidate) => candidate.index === body.index);
        return before ? Math.hypot(body.x - before.x, body.z - before.z) : 0;
      });
      expect(maxOf(recoveredTravel)).toBeGreaterThan(0.5);
      expect(replica.final.networkInterpolation).toMatchObject({
        bufferedBodyMotion: true,
        boundedExtrapolation: true,
        monotonicActionClock: true,
      });
      expect(hostErrors).toEqual([]);
      expect(guestErrors).toEqual([]);
    } finally {
      await guest.close();
    }
  });
}

test("the first late packet for a new attack begins at windup instead of jumping to a mid-pose", async ({ page, context }) => {
  test.setTimeout(120_000);
  const guest = await context.newPage();
  const hostErrors = [];
  const guestErrors = [];
  page.on("pageerror", (error) => hostErrors.push(error.message));
  guest.on("pageerror", (error) => guestErrors.push(error.message));

  try {
    await startHunt(page);
    await startHunt(guest);

    const host = await page.evaluate(() => {
      const game = window.__dustAndDeadTest;
      const multiplayer = window.__dustMultiplayerTest;
      const snapshot = () => JSON.parse(JSON.stringify(
        multiplayer.buildWireSnapshot(false, false, "mock-player-2")
      ));
      multiplayer.startMockHost(["Host", "Guest"]);
      game.startWaveNow(10, "hordeheart");
      game.setHordeheartAiEnabled(false);
      game.forceHordeheartPhase("quarters");
      const formation = game.getHordeheartDiagnostics();
      multiplayer.setPlayerPosition("mock-player-1", formation.centerX - 2, formation.centerZ + 22);
      multiplayer.setPlayerPosition("mock-player-2", formation.centerX + 2, formation.centerZ + 22);
      const idle = { diagnostics: game.getHordeheartDiagnostics(), snapshot: snapshot() };
      game.forceHordeheartAttack("rush");
      game.advanceHordeheart(900);
      game.seekHordeheartAction(0.62);
      const lateAttack = { diagnostics: game.getHordeheartDiagnostics(), snapshot: snapshot() };
      game.setHordeheartAiEnabled(true);
      game.seekHordeheartAction(0.999);
      game.advanceHordeheart(17);
      game.setHordeheartAiEnabled(false);
      const idleAfter = { diagnostics: game.getHordeheartDiagnostics(), snapshot: snapshot() };
      return { idle, lateAttack, idleAfter };
    });

    const replica = await guest.evaluate(({ idle, lateAttack, idleAfter }) => {
      const game = window.__dustAndDeadTest;
      const multiplayer = window.__dustMultiplayerTest;
      const roots = [];
      const prototype = window.THREE.Object3D.prototype;
      const originalAdd = prototype.add;
      prototype.add = function captureHordeheartRoots(...objects) {
        for (const object of objects) {
          if (object?.userData?.isHordeheartModel) roots.push(object);
        }
        return originalAdd.apply(this, objects);
      };
      multiplayer.startMockGuest(["Host", "Guest"], 1);
      multiplayer.applySnapshot(idle.snapshot);
      prototype.add = originalAdd;

      const pose = () => roots.flatMap((root) => {
        const parts = root.userData.hordeheartParts;
        const nodes = [parts?.bodyRoot];
        for (const rig of parts?.armRigs || []) nodes.push(rig.shoulder, rig.elbow, rig.wrist);
        return nodes.filter(Boolean).flatMap((node) => [
          node.position.x, node.position.y, node.position.z,
          node.rotation.x, node.rotation.y, node.rotation.z,
          node.scale.x, node.scale.y, node.scale.z,
        ]);
      });
      const delta = (left, right) => Math.max(
        0,
        ...left.map((value, index) => Math.abs(value - right[index]))
      );

      const before = game.getHordeheartDiagnostics();
      const beforePose = pose();
      multiplayer.applySnapshot(lateAttack.snapshot);
      const immediate = game.getHordeheartDiagnostics();
      const immediatePose = pose();
      game.advanceHordeheart(120);
      const advanced = game.getHordeheartDiagnostics();
      const advancedPose = pose();
      multiplayer.applySnapshot(idleAfter.snapshot);
      const afterHostIdle = game.getHordeheartDiagnostics();
      for (let guard = 0; guard < 100 && game.getHordeheartDiagnostics().actionProgress < 0.55; guard += 1) {
        game.advanceHordeheart(17);
      }
      const hauled = game.getHordeheartDiagnostics();
      const beforeCompletionEffects = game.getThreeObjectDiagnostics().state;
      for (let guard = 0; guard < 120 && game.getHordeheartDiagnostics().attack; guard += 1) {
        game.advanceHordeheart(17);
      }
      const completed = game.getHordeheartDiagnostics();
      const afterCompletionEffects = game.getThreeObjectDiagnostics().state;
      const maxBodyTravel = (from, to) => Math.max(0, ...to.bodies.map((body) => {
        const previous = from.bodies.find((candidate) => candidate.index === body.index);
        return previous ? Math.hypot(body.x - previous.x, body.z - previous.z) : 0;
      }));
      return {
        rootCount: roots.length,
        before,
        immediate,
        advanced,
        afterHostIdle,
        hauled,
        completed,
        beforeCompletionEffects,
        afterCompletionEffects,
        immediatePoseJump: delta(beforePose, immediatePose),
        advancedPoseTravel: delta(immediatePose, advancedPose),
        immediateRootJump: maxBodyTravel(before, immediate),
        windupRootTravel: maxBodyTravel(immediate, advanced),
        idlePacketRootJump: maxBodyTravel(advanced, afterHostIdle),
        haulRootTravel: maxBodyTravel(advanced, hauled),
      };
    }, host);

    expect(host.idle.diagnostics.attack).toBe("");
    expect(host.lateAttack.diagnostics).toMatchObject({ attack: "rush" });
    expect(host.lateAttack.diagnostics.actionProgress).toBeGreaterThan(0.5);
    expect(host.idleAfter.diagnostics.attack).toBe("");
    expect(replica.rootCount).toBe(4);
    expect(replica.before).toMatchObject({ replica: true, phase: "quarters", attack: "" });
    expect(replica.immediate).toMatchObject({ replica: true, attack: "rush" });
    // A newly discovered attack must start from its authored windup on an
    // already visible replica. The authoritative mid-action timer is a target
    // for catch-up playback, never an immediate rendered pose assignment.
    expect(replica.immediate.actionProgress).toBeLessThanOrEqual(0.02);
    expect(replica.immediatePoseJump).toBeLessThan(0.01);
    expect(replica.immediateRootJump).toBeLessThan(0.003);
    expect(replica.advanced.actionProgress).toBeGreaterThan(replica.immediate.actionProgress + 0.02);
    expect(replica.advancedPoseTravel).toBeGreaterThan(0.01);
    expect(replica.windupRootTravel).toBeLessThan(0.03);
    expect(replica.afterHostIdle).toMatchObject({ replica: true, attack: "rush" });
    expect(replica.afterHostIdle.actionProgress).toBeGreaterThanOrEqual(replica.advanced.actionProgress);
    expect(replica.idlePacketRootJump).toBeLessThan(0.003);
    expect(replica.hauled.actionProgress).toBeGreaterThanOrEqual(0.55);
    expect(replica.haulRootTravel).toBeGreaterThan(0.2);
    expect(replica.completed.attack).toBe("");
    expect(replica.afterCompletionEffects.shockwaves - replica.beforeCompletionEffects.shockwaves).toBeGreaterThanOrEqual(1);
    expect(replica.afterCompletionEffects.lightFlashes - replica.beforeCompletionEffects.lightFlashes).toBeGreaterThanOrEqual(1);
    expect(hostErrors).toEqual([]);
    expect(guestErrors).toEqual([]);
  } finally {
    await guest.close();
  }
});
