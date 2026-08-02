const path = require("node:path");
const { expect, test } = require("@playwright/test");

const ATTACKS = [
  { kind: "fleshTide", phase: "whole", targetCount: 4, attackerCount: 1, duration: 1.954 },
  { kind: "ribBloom", phase: "whole", targetCount: 8, attackerCount: 1, duration: 2.461 },
  { kind: "systole", phase: "whole", targetCount: 4, attackerCount: 1, duration: 2.685 },
  { kind: "pincer", phase: "halves", targetCount: 2, attackerCount: 2, duration: 1.963 },
  { kind: "arterialSweep", phase: "halves", targetCount: 2, attackerCount: 2, duration: 2.313 },
  { kind: "rush", phase: "quarters", targetCount: 4, attackerCount: 4, duration: 1.774 },
  { kind: "carrionNest", phase: "quarters", targetCount: 4, attackerCount: 4, duration: 1.954 },
];

const REQUIRED_TEST_API = [
  "startWaveNow",
  "forceHordeheartAttack",
  "forceHordeheartPhase",
  "setHordeheartAiEnabled",
  "advanceHordeheart",
  "seekHordeheartAction",
  "getHordeheartDiagnostics",
  "getHordeheartWireState",
  "getHordeheartPackedWireDiagnostics",
  "getPlayerHealth",
];

function fileUrl(relativePath) {
  const absolute = path.resolve(__dirname, "..", relativePath).replace(/\\/g, "/");
  return `file:///${absolute}`;
}

async function startHunt(page) {
  await page.goto(`${fileUrl("index.html")}?mapSeed=7331`);
  const intro = page.locator("#intro-screen");
  if (await intro.isVisible().catch(() => false)) {
    await page.keyboard.press("KeyM");
    await expect(intro).toBeHidden();
  }
  await page.getByRole("button", { name: "Start Hunt" }).click();
  await page.waitForFunction(() => Boolean(window.__dustAndDeadTest?.forceHordeheartAttack));

  const missing = await page.evaluate((names) => names.filter(
    (name) => typeof window.__dustAndDeadTest?.[name] !== "function"
  ), REQUIRED_TEST_API);
  expect(missing, `Hordeheart threat test API is incomplete: ${missing.join(", ")}`).toEqual([]);
}

function rounded(value, digits = 4) {
  return Number(Number(value).toFixed(digits));
}

function normalizeTarget(target) {
  return {
    ordinal: Number(target.ordinal),
    bodyIndex: Number(target.bodyIndex),
    playerSlot: Number(target.playerSlot),
    sourceX: rounded(target.sourceX, 1),
    sourceZ: rounded(target.sourceZ, 1),
    targetX: rounded(target.targetX, 1),
    targetZ: rounded(target.targetZ, 1),
    lockedX: rounded(target.lockedX, 1),
    lockedZ: rounded(target.lockedZ, 1),
    // Public encounter diagnostics intentionally present radii to 1 mm while
    // semantic wire state retains the underlying 1/16-world-unit quantum.
    radius: rounded(target.radius, 3),
    // Delay is packed in exact 5 ms gameplay quanta.
    delay: rounded(Math.round(Number(target.delay) * 200) / 200, 3),
    wave: Number(target.wave),
  };
}

function normalizeHazard(hazard) {
  return {
    id: Number(hazard.id),
    kind: String(hazard.kind),
    sourceX: rounded(hazard.sourceX, 1),
    sourceZ: rounded(hazard.sourceZ, 1),
    targetX: rounded(hazard.targetX, 1),
    targetZ: rounded(hazard.targetZ, 1),
    radius: rounded(hazard.radius, 4),
    // Hordeheart action and hazard timers use dedicated millisecond quanta.
    life: rounded(hazard.life, 1),
    duration: rounded(hazard.duration, 1),
  };
}

function normalizeActionState(actionState) {
  if (!actionState) return null;
  return {
    sequence: Number(actionState.sequence),
    kind: String(actionState.kind),
    timer: rounded(actionState.timer, 1),
    duration: rounded(actionState.duration, 1),
    impactMask: Number(actionState.impactMask),
    targets: (actionState.targets || []).map(normalizeTarget),
  };
}

test("all seven forced attacks enter their owning phase and lock exact target sets", async ({ page }) => {
  await startHunt(page);

  const samples = await page.evaluate((attackSpecs) => {
    const game = window.__dustAndDeadTest;
    const multiplayer = window.__dustMultiplayerTest;
    multiplayer.startMockHost(["Host", "North", "South", "West"]);

    return attackSpecs.map((spec) => {
      game.startWaveNow(10, "hordeheart");
      const center = game.getHordeheartDiagnostics();
      const offsets = [
        { x: -20, z: -8 },
        { x: 21, z: -7 },
        { x: -15, z: 18 },
        { x: 16, z: 19 },
      ];
      offsets.forEach((offset, index) => {
        multiplayer.setPlayerPosition(
          `mock-player-${index + 1}`,
          center.centerX + offset.x,
          center.centerZ + offset.z
        );
      });

      const diagnostics = game.forceHordeheartAttack(spec.kind);
      const wire = game.getHordeheartWireState();
      const bodyByIndex = Object.fromEntries(
        diagnostics.bodies.map((body) => [body.index, { x: body.x, z: body.z }])
      );
      return {
        kind: spec.kind,
        diagnostics,
        wire,
        bodyByIndex,
        attackingBodyIndices: wire.bodies
          .filter((body) => body.action === spec.kind)
          .map((body) => body.index)
          .sort((left, right) => left - right),
      };
    });
  }, ATTACKS);

  expect(samples).toHaveLength(ATTACKS.length);
  for (let index = 0; index < ATTACKS.length; index += 1) {
    const spec = ATTACKS[index];
    const sample = samples[index];
    const targets = sample.diagnostics.actionTargets;
    const wireTargets = sample.wire.actionState?.targets || [];

    expect(sample.kind).toBe(spec.kind);
    expect(sample.diagnostics).toMatchObject({
      active: true,
      defeated: false,
      phase: spec.phase,
      attack: spec.kind,
      attackSequence: 1,
    });
    expect(sample.wire).toMatchObject({ phase: spec.phase });
    expect(sample.wire.actionState).toMatchObject({
      sequence: 1,
      kind: spec.kind,
      timer: 0,
      duration: spec.duration,
      impactMask: 0,
    });
    expect(targets).toHaveLength(spec.targetCount);
    expect(wireTargets).toHaveLength(spec.targetCount);
    expect(targets.map(normalizeTarget)).toEqual(wireTargets.map(normalizeTarget));
    expect(targets.map((target) => target.ordinal)).toEqual(
      Array.from({ length: spec.targetCount }, (_, ordinal) => ordinal)
    );
    expect(sample.attackingBodyIndices).toHaveLength(spec.attackerCount);
    expect(new Set(targets.map((target) => target.bodyIndex)).size).toBe(spec.attackerCount);

    for (const target of targets) {
      const sourceBody = sample.bodyByIndex[String(target.bodyIndex)];
      expect(sourceBody, `${spec.kind} target references a live attacking body`).toBeTruthy();
      expect(Math.hypot(target.sourceX - sourceBody.x, target.sourceZ - sourceBody.z)).toBeLessThan(0.09);
      expect(Number.isFinite(target.targetX) && Number.isFinite(target.targetZ)).toBe(true);
      expect(target.radius).toBeGreaterThan(0);
    }

    if (["fleshTide", "systole", "rush", "carrionNest"].includes(spec.kind)) {
      expect(targets.map((target) => target.playerSlot).sort((a, b) => a - b)).toEqual([0, 1, 2, 3]);
    } else if (spec.kind === "pincer") {
      expect(new Set(targets.map((target) => target.playerSlot)).size).toBe(2);
      expect(targets.every((target) => target.playerSlot >= 0 && target.playerSlot <= 3)).toBe(true);
    } else if (spec.kind === "arterialSweep") {
      expect(new Set(targets.map((target) => target.playerSlot)).size).toBe(2);
      expect(targets.every((target) => target.playerSlot >= 0 && target.playerSlot <= 3)).toBe(true);
    } else {
      expect(targets.every((target) => target.playerSlot === 255)).toBe(true);
    }

    if (spec.kind === "ribBloom") {
      expect(targets.map((target) => target.wave)).toEqual([0, 0, 0, 0, 1, 1, 1, 1]);
      expect(targets.map((target) => rounded(target.delay, 3))).toEqual([
        0, 0, 0, 0, 0.2, 0.2, 0.2, 0.2,
      ]);
    } else if (spec.kind === "rush" || spec.kind === "carrionNest") {
      expect(targets.map((target) => rounded(target.delay, 3))).toEqual([0, 0.065, 0.13, 0.195]);
    } else {
      expect(targets.every((target) => target.delay === 0 && target.wave === 0)).toBe(true);
    }
  }
});

test("colossal Hordeheart scaling triples models, bodies, attack geometry, and the half pincer haul", async ({ page }) => {
  await startHunt(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    game.startWaveNow(10, "hordeheart");
    game.setPlayerMaxHp(10000, 10000);

    const phases = {};
    for (const phase of ["whole", "halves", "quarters"]) {
      game.forceHordeheartPhase(phase);
      phases[phase] = game.getHordeheartDiagnostics();
    }

    const attackRadii = {};
    for (const kind of [
      "fleshTide", "ribBloom", "systole", "pincer", "arterialSweep", "rush", "carrionNest",
    ]) {
      const center = game.getHordeheartDiagnostics();
      game.setPlayerPosition(center.centerX + 42, center.centerZ + 54);
      const attack = game.forceHordeheartAttack(kind);
      attackRadii[kind] = attack.actionTargets[0].radius;
    }

    game.forceHordeheartPhase("halves");
    const formation = game.getHordeheartDiagnostics();
    game.setPlayerPosition(formation.centerX + 120, formation.centerZ + 20);
    const pincer = game.forceHordeheartAttack("pincer");
    const opening = Object.fromEntries(pincer.bodies.map((body) => [body.index, body]));
    const laneLengths = pincer.actionTargets.map((target) => Math.hypot(
      target.targetX - target.sourceX,
      target.targetZ - target.sourceZ
    ));
    const hauled = game.seekHordeheartAction(0.68);
    const travel = hauled.bodies.map((body) => Math.hypot(
      body.x - opening[body.index].x,
      body.z - opening[body.index].z
    ));

    return { phases, attackRadii, pincer, laneLengths, hauled, travel };
  });

  expect(result.phases.whole.movementTuning).toMatchObject({
    worldScale: 3,
    modelScale: 2.7,
    bodyRadii: { whole: 11.1, half: 7.35, quarter: 4.95 },
    actionMaxTravel: { pincer: 42, rush: 33 },
  });
  for (const [phase, expectedRadius, expectedCount] of [
    ["whole", 11.1, 1],
    ["halves", 7.35, 2],
    ["quarters", 4.95, 4],
  ]) {
    expect(result.phases[phase].bodies).toHaveLength(expectedCount);
    expect(result.phases[phase].bodies.every((body) => body.radius === expectedRadius)).toBe(true);
    expect(result.phases[phase].bodies.every((body) => (
      body.modelScale.x === 2.7 && body.modelScale.y === 2.7 && body.modelScale.z === 2.7
    ))).toBe(true);
  }
  expect(result.attackRadii).toEqual({
    fleshTide: 6.75,
    ribBloom: 5.625,
    systole: 12.25,
    pincer: 7.375,
    arterialSweep: 6.5,
    rush: 6.75,
    carrionNest: 10.875,
  });
  expect(result.pincer.threatTuning).toMatchObject({
    attackDistanceScale: 3,
    attackWarningMultiplier: 1.15,
    throwWarningMultiplier: 1.13,
    otherWarningMultiplier: 1.06,
    phaseWarningDurationMultiplier: { whole: 0.95, halves: 1, quarters: 0.97 },
    wholeWindupTimeMultiplier: 1.25,
    systoleWarningMultiplier: 1.2,
    halfWarningMultiplier: 1.15,
    halfProximityRepulseWarningMultiplier: 1.265,
    wholeActionDuration: {
      fleshTide: 1.954,
      ribBloom: 2.461,
      systole: 2.685,
      movementLock: 2.388,
    },
    halfActionDuration: {
      pincer: 1.963,
      arterialSweep: 2.313,
      proximityRepulse: 1.862,
    },
    quarterActionDuration: {
      rush: 1.774,
      carrionNest: 1.954,
      proximityRepulse: 1.242,
    },
    wireRadiusScale: 8,
    radialHitRadius: { ribBloom: 20.76, systole: 17.46 },
  });
  expect(Math.max(...result.laneLengths)).toBeGreaterThan(45);
  expect(Math.max(...result.travel)).toBeGreaterThan(34);
  expect(Math.max(...result.travel)).toBeLessThanOrEqual(42.1);
});

test("the whole body's thrown organ keeps its landing zone escapable until the delayed impact", async ({ page }) => {
  await startHunt(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    game.startWaveNow(10, "hordeheart");
    game.forceHordeheartPhase("whole");
    const body = game.getHordeheartDiagnostics().bodies[0];
    game.setPlayerPosition(body.x, body.z + 30);
    game.setPlayerMaxHp(1000, 1000);
    const opening = game.forceHordeheartAttack("systole");
    const landing = opening.actionTargets[0];
    game.setPlayerPosition(landing.targetX, landing.targetZ);
    game.setHordeheartAiEnabled(true);

    const before = game.getPlayerHealth().hp;
    const warning = game.advanceHordeheart(1800);
    const duringWarning = game.getPlayerHealth().hp;
    const impact = game.advanceHordeheart(200);
    const afterImpact = game.getPlayerHealth().hp;
    return { opening, warning, impact, before, duringWarning, afterImpact };
  });

  expect(result.opening).toMatchObject({
    phase: "whole",
    attack: "systole",
    threatTuning: {
      systoleWarningMultiplier: 1.2,
      attackWarningMultiplier: 1.15,
      throwWarningMultiplier: 1.13,
      otherWarningMultiplier: 1.06,
      phaseWarningDurationMultiplier: { whole: 0.95, halves: 1, quarters: 0.97 },
      wholeActionDuration: { systole: 2.685 },
    },
  });
  expect(result.warning.actionProgress).toBeGreaterThan(0.59);
  expect(result.warning.actionProgress).toBeLessThan(0.68);
  expect(result.duringWarning).toBe(result.before);
  expect(result.impact.actionProgress).toBeGreaterThan(0.68);
  expect(result.afterImpact).toBeLessThan(result.before);
});

test("both half-body lane attacks preserve their marked warning through the additional six percent", async ({ page }) => {
  await startHunt(page);

  const samples = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const sample = (kind, warningMs) => {
      game.startWaveNow(10, "hordeheart");
      game.forceHordeheartPhase("halves");
      const formation = game.getHordeheartDiagnostics();
      game.setPlayerPosition(formation.centerX, formation.centerZ + 30);
      game.setPlayerMaxHp(1000, 1000);
      const opening = game.forceHordeheartAttack(kind);
      const lane = opening.actionTargets[0];
      game.setPlayerPosition(lane.targetX, lane.targetZ);
      game.setHordeheartAiEnabled(true);

      const before = game.getPlayerHealth().hp;
      const warning = game.advanceHordeheart(warningMs);
      const duringWarning = game.getPlayerHealth().hp;
      const impact = game.advanceHordeheart(150);
      const afterImpact = game.getPlayerHealth().hp;
      return {
        kind,
        warningMs,
        opening,
        warning,
        impact,
        before,
        duringWarning,
        afterImpact,
      };
    };

    // Each sample is already beyond the old 68%-impact time, while remaining
    // below the new host-authored one.
    return [
      sample("pincer", 1300),
      sample("arterialSweep", 1530),
    ];
  });

  for (const sample of samples) {
    expect(sample.opening).toMatchObject({
      phase: "halves",
      attack: sample.kind,
      threatTuning: {
        attackWarningMultiplier: 1.15,
        throwWarningMultiplier: 1.13,
        otherWarningMultiplier: 1.06,
        phaseWarningDurationMultiplier: { whole: 0.95, halves: 1, quarters: 0.97 },
        halfWarningMultiplier: 1.15,
        halfActionDuration: sample.kind === "pincer"
          ? { pincer: 1.963 }
          : { arterialSweep: 2.313 },
      },
    });
    expect(sample.warning.actionProgress).toBeGreaterThan(0.6);
    expect(sample.warning.actionProgress).toBeLessThan(0.68);
    expect(sample.duringWarning).toBe(sample.before);
    expect(sample.impact.actionProgress).toBeGreaterThan(0.68);
    expect(sample.afterImpact).toBeLessThan(sample.before);
  }
});

test("far-pressure AI immediately locks its map-wide attack onto the distant hunter", async ({ page }) => {
  await startHunt(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const multiplayer = window.__dustMultiplayerTest;
    multiplayer.startMockHost(["Host", "Far Hunter"]);
    game.startWaveNow(10, "hordeheart");
    game.forceHordeheartPhase("whole");
    const body = game.getHordeheartDiagnostics().bodies[0];

    multiplayer.setPlayerPosition("mock-player-1", body.x + 8, body.z + 1);
    multiplayer.setPlayerPosition(
      "mock-player-2",
      body.x > 0 ? body.x - 82 : body.x + 82,
      body.z > 0 ? body.z - 68 : body.z + 68
    );
    const positionedPlayers = multiplayer.getState().players.map((player, slot) => ({
      id: player.id,
      slot,
      x: player.x,
      z: player.z,
      distance: Math.hypot(player.x - body.x, player.z - body.z),
    }));

    game.setHordeheartAiEnabled(true);
    let diagnostics = game.getHordeheartDiagnostics();
    for (let guard = 0; guard < 110 && !diagnostics.attack; guard += 1) {
      diagnostics = game.advanceHordeheart(1000 / 60);
    }
    return { body, positionedPlayers, diagnostics, wire: game.getHordeheartWireState() };
  });

  const farHunter = result.positionedPlayers.find((player) => player.id === "mock-player-2");
  expect(farHunter.distance).toBeGreaterThan(90);
  expect(result.diagnostics).toMatchObject({
    phase: "whole",
    attack: "fleshTide",
    attackDecision: "far-pressure",
  });
  expect(result.wire.actionState).toMatchObject({ kind: "fleshTide" });

  const farTarget = result.wire.actionState.targets.find((target) => target.playerSlot === farHunter.slot);
  expect(farTarget, "far-pressure must carry an authoritative target for the far hunter").toBeTruthy();
  expect(Math.hypot(farTarget.lockedX - farHunter.x, farTarget.lockedZ - farHunter.z)).toBeLessThan(0.16);
  expect(
    Math.hypot(farTarget.targetX - farTarget.sourceX, farTarget.targetZ - farTarget.sourceZ)
  ).toBeGreaterThan(
    Math.hypot(farTarget.lockedX - farTarget.sourceX, farTarget.lockedZ - farTarget.sourceZ) + 20.4
  );
});

test("the whole body raises a closed persistent flesh pen around a circling player", async ({ page }) => {
  await startHunt(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    game.startWaveNow(10, "hordeheart");
    game.forceHordeheartPhase("whole");
    const body = game.getHordeheartDiagnostics().bodies[0];
    game.setPlayerPosition(body.x + 12, body.z + 1.5);
    game.setHordeheartAiEnabled(true);

    let diagnostics = game.getHordeheartDiagnostics();
    for (let guard = 0; guard < 180 && !diagnostics.attack; guard += 1) {
      diagnostics = game.advanceHordeheart(1000 / 60);
    }
    const openingWire = game.getHordeheartWireState();
    game.seekHordeheartAction(0.7);
    const afterImpact = game.advanceHordeheart(1000 / 60);
    return { diagnostics, openingWire, afterImpact };
  });

  expect(result.diagnostics).toMatchObject({
    phase: "whole",
    attack: "fleshTide",
    attackVariant: "movement-lock",
    attackDecision: "movement-lock",
  });
  expect(result.openingWire.actionState).toMatchObject({
    kind: "fleshTide",
  });
  expect(result.openingWire.actionState.duration).toBeCloseTo(2.388, 3);
  const targets = result.openingWire.actionState.targets;
  expect(targets).toHaveLength(4);
  expect(targets.every((target) => target.wave === 3 && target.playerSlot === 255)).toBe(true);
  expect(new Set(targets.map((target) => `${target.lockedX}:${target.lockedZ}`)).size).toBe(1);
  for (let index = 0; index < targets.length; index += 1) {
    const next = targets[(index + 1) % targets.length];
    expect(Math.hypot(targets[index].targetX - next.sourceX, targets[index].targetZ - next.sourceZ)).toBeLessThan(0.16);
    expect(targets[index].radius).toBeCloseTo(4.125, 3);
  }
  expect(result.afterImpact.attackHazards).toHaveLength(4);
  expect(result.afterImpact.attackHazards.every((hazard) => (
    hazard.kind === "fleshTrail" &&
    Math.abs(hazard.radius - 4.125) < 0.01 &&
    Math.abs(hazard.duration - 5.2) < 0.02
  ))).toBe(true);
});

test("halves and quarters punish body crossing with an exact heavy repulse", async ({ page }) => {
  await startHunt(page);

  const samples = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const sample = (phase) => {
      game.startWaveNow(10, "hordeheart");
      game.forceHordeheartPhase(phase);
      const phaseStart = game.getHordeheartDiagnostics();
      const body = phaseStart.bodies.reduce((best, candidate) => {
        const distance = Math.hypot(candidate.x - phaseStart.centerX, candidate.z - phaseStart.centerZ);
        return !best || distance > best.distance ? { ...candidate, distance } : best;
      }, null);
      let outwardX = body.x - phaseStart.centerX;
      let outwardZ = body.z - phaseStart.centerZ;
      const outwardLength = Math.max(0.001, Math.hypot(outwardX, outwardZ));
      outwardX /= outwardLength;
      outwardZ /= outwardLength;
      const approachDistance = (phase === "halves" ? 4.2 : 3.7) * 3;
      game.setPlayerPosition(
        body.x + outwardX * approachDistance,
        body.z + outwardZ * approachDistance
      );
      game.setPlayerMaxHp(1000, 1000);
      game.setHordeheartAiEnabled(true);

      let diagnostics = game.getHordeheartDiagnostics();
      for (let guard = 0; guard < 180 && !diagnostics.attack; guard += 1) {
        diagnostics = game.advanceHordeheart(1000 / 60);
      }
      const wire = game.getHordeheartWireState();
      const target = diagnostics.actionTargets.reduce((best, candidate) => {
        const distance = Math.hypot(candidate.targetX - body.x, candidate.targetZ - body.z);
        return !best || distance < best.distance ? { ...candidate, distance } : best;
      }, null);
      const before = {
        health: game.getPlayerHealth(),
        position: game.getPlayerPosition(),
        sourceDistance: approachDistance,
      };
      game.seekHordeheartAction(0.55);
      const afterDiagnostics = game.advanceHordeheart(1000 / 60);
      return {
        phase,
        diagnostics,
        wire,
        target,
        before,
        afterHealth: game.getPlayerHealth(),
        afterDiagnostics,
        afterPosition: game.getPlayerPosition(),
      };
    };
    return [sample("halves"), sample("quarters")];
  });

  for (const sample of samples) {
    expect(sample.diagnostics).toMatchObject({
      phase: sample.phase,
      attack: "ribBloom",
      attackVariant: "proximity-repulse",
      attackDecision: "proximity-repulse",
    });
    expect(sample.wire.actionState).toMatchObject({
      kind: "ribBloom",
      duration: sample.phase === "halves" ? 1.862 : 1.242,
    });
    expect(sample.wire.actionState.targets.length).toBeGreaterThanOrEqual(1);
    expect(sample.wire.actionState.targets.every((target) => target.wave === 2)).toBe(true);
    expect(sample.target.radius).toBeCloseTo(sample.phase === "halves" ? 19.125 : 15.375, 3);
    expect(sample.afterHealth.hp).toBeLessThanOrEqual(sample.phase === "halves" ? 580 : 620);
    const beforeDistance = Math.hypot(
      sample.before.position.x - sample.target.targetX,
      sample.before.position.z - sample.target.targetZ,
    );
    const afterDistance = Math.hypot(
      sample.afterPosition.x - sample.target.targetX,
      sample.afterPosition.z - sample.target.targetZ,
    );
    expect(afterDistance - beforeDistance).toBeGreaterThan(sample.phase === "halves" ? 16.5 : 13.5);
  }
});

test("a proximity repulse packet drives guest visuals but never guest-side damage", async ({ page, context }) => {
  test.setTimeout(70_000);
  const guest = await context.newPage();
  try {
    await startHunt(page);
    await startHunt(guest);

    const host = await page.evaluate(() => {
      const game = window.__dustAndDeadTest;
      const multiplayer = window.__dustMultiplayerTest;
      multiplayer.startMockHost(["Host", "Guest"]);
      game.startWaveNow(10, "hordeheart");
      game.forceHordeheartPhase("halves");
      const opening = game.getHordeheartDiagnostics();
      const body = opening.bodies[0];
      const outward = body.x <= opening.centerX ? -1 : 1;
      multiplayer.setPlayerPosition("mock-player-1", body.x - outward * 15, body.z + 10);
      multiplayer.setPlayerPosition("mock-player-2", body.x + outward * 4.1, body.z);
      game.setHordeheartAiEnabled(true);
      let diagnostics = game.getHordeheartDiagnostics();
      for (let guard = 0; guard < 180 && !diagnostics.attack; guard += 1) {
        diagnostics = game.advanceHordeheart(1000 / 60);
      }
      game.seekHordeheartAction(0.42);
      const snapshot = JSON.parse(JSON.stringify(
        multiplayer.buildWireSnapshot(true, true, "mock-player-2")
      ));
      return {
        diagnostics: game.getHordeheartDiagnostics(),
        semantic: game.getHordeheartWireState(),
        decoded: multiplayer.decodeBossState(snapshot.bossState),
        snapshot,
      };
    });

    expect(host.diagnostics).toMatchObject({
      phase: "halves",
      attack: "ribBloom",
      attackVariant: "proximity-repulse",
    });
    expect(host.decoded.actionState.targets.every((target) => target.wave === 2)).toBe(true);
    expect(normalizeActionState(host.decoded.actionState)).toEqual(
      normalizeActionState(host.semantic.actionState)
    );

    const replica = await guest.evaluate((snapshot) => {
      const game = window.__dustAndDeadTest;
      const multiplayer = window.__dustMultiplayerTest;
      multiplayer.startMockGuest(["Host", "Guest"], 1);
      multiplayer.applySnapshot(snapshot);
      const before = {
        hp: game.getPlayerHealth().hp,
        diagnostics: game.getHordeheartDiagnostics(),
        wire: game.getHordeheartWireState(),
      };
      game.advanceHordeheart(500);
      return {
        before,
        afterHp: game.getPlayerHealth().hp,
        afterDiagnostics: game.getHordeheartDiagnostics(),
      };
    }, host.snapshot);

    expect(replica.before.diagnostics).toMatchObject({
      replica: true,
      phase: "halves",
      attack: "ribBloom",
      attackVariant: "proximity-repulse",
    });
    expect(normalizeActionState(replica.before.wire.actionState)).toEqual(
      normalizeActionState(host.decoded.actionState)
    );
    expect(replica.afterHp).toBe(replica.before.hp);
    expect(replica.afterDiagnostics.actionProgress).toBeGreaterThan(replica.before.diagnostics.actionProgress);
  } finally {
    await guest.close();
  }
});

test("protocol 46 round-trips colossal attack radii and persistent hazards without semantic drift", async ({ page }) => {
  await startHunt(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const multiplayer = window.__dustMultiplayerTest;
    multiplayer.startMockHost(["Host", "Guest", "North", "South"]);
    game.startWaveNow(10, "hordeheart");
    game.forceHordeheartPhase("quarters");
    const bodies = game.getHordeheartDiagnostics().bodies;
    const center = bodies.reduce((point, body) => ({
      x: point.x + body.x / bodies.length,
      z: point.z + body.z / bodies.length,
    }), { x: 0, z: 0 });
    [
      { x: -12, z: 14 },
      { x: 12, z: 14 },
      { x: -14, z: -14 },
      { x: 14, z: -14 },
    ].forEach((offset, index) => multiplayer.setPlayerPosition(
      `mock-player-${index + 1}`,
      center.x + offset.x,
      center.z + offset.z
    ));

    game.forceHordeheartAttack("carrionNest");
    game.setHordeheartAiEnabled(true);
    game.advanceHordeheart(1600);
    return {
      semantic: game.getHordeheartWireState(),
      packed: game.getHordeheartPackedWireDiagnostics(),
    };
  });

  expect(result.packed).toMatchObject({
    protocolVersion: 46,
    typeCode: 5,
    kind: "hordeheart",
    phase: "quarters",
    bodyCount: 4,
  });
  expect(result.packed.bytes).toBeGreaterThan(0);
  expect(result.packed.bytes).toBeLessThanOrEqual(768);
  expect(result.semantic.actionState).toBeTruthy();
  expect(result.semantic.hazards).toHaveLength(4);
  expect(result.semantic.hazards.every((hazard) => hazard.kind === "carrionNest")).toBe(true);
  expect(normalizeActionState(result.packed.decoded.actionState)).toEqual(
    normalizeActionState(result.semantic.actionState)
  );
  expect(result.packed.decoded.hazards.map(normalizeHazard)).toEqual(
    result.semantic.hazards.map(normalizeHazard)
  );
});

test("a guest receives exact targets and hazards but never applies Hordeheart damage locally", async ({ page, context }) => {
  test.setTimeout(100_000);
  const guest = await context.newPage();
  try {
    await startHunt(page);
    await startHunt(guest);

    const host = await page.evaluate(() => {
      const game = window.__dustAndDeadTest;
      const multiplayer = window.__dustMultiplayerTest;
      multiplayer.startMockHost(["Host", "Guest", "North", "South"]);
      game.startWaveNow(10, "hordeheart");
      game.forceHordeheartPhase("quarters");
      const bodies = game.getHordeheartDiagnostics().bodies;
      const center = bodies.reduce((point, body) => ({
        x: point.x + body.x / bodies.length,
        z: point.z + body.z / bodies.length,
      }), { x: 0, z: 0 });
      [
        { x: -12, z: 14 },
        { x: 12, z: 14 },
        { x: -14, z: -14 },
        { x: 14, z: -14 },
      ].forEach((offset, index) => multiplayer.setPlayerPosition(
        `mock-player-${index + 1}`,
        center.x + offset.x,
        center.z + offset.z
      ));

      game.forceHordeheartAttack("carrionNest");
      game.setHordeheartAiEnabled(true);
      game.advanceHordeheart(1600);
      const snapshot = JSON.parse(JSON.stringify(
        multiplayer.buildWireSnapshot(true, true, "mock-player-2")
      ));
      return {
        snapshot,
        decodedBoss: multiplayer.decodeBossState(snapshot.bossState),
      };
    });

    expect(host.decodedBoss.actionState).toBeTruthy();
    expect(host.decodedBoss.hazards).toHaveLength(4);

    const replica = await guest.evaluate((snapshot) => {
      const game = window.__dustAndDeadTest;
      const multiplayer = window.__dustMultiplayerTest;
      multiplayer.startMockGuest(["Host", "Guest", "North", "South"], 1);
      multiplayer.applySnapshot(snapshot);
      const before = {
        diagnostics: game.getHordeheartDiagnostics(),
        wire: game.getHordeheartWireState(),
        hp: game.getPlayerHealth().hp,
      };
      // A few authoritative hazard ticks are sufficient to prove that the
      // replica never applies local damage; avoid simulating two visual-heavy
      // seconds in a single browser task.
      game.advanceHordeheart(450);
      const after = {
        diagnostics: game.getHordeheartDiagnostics(),
        hp: game.getPlayerHealth().hp,
      };
      return { before, after };
    }, host.snapshot);

    expect(replica.before.diagnostics).toMatchObject({
      active: true,
      replica: true,
      phase: "quarters",
      attack: "carrionNest",
    });
    expect(normalizeActionState(replica.before.wire.actionState)).toEqual(
      normalizeActionState(host.decodedBoss.actionState)
    );
    expect(replica.before.wire.hazards.map(normalizeHazard)).toEqual(
      host.decodedBoss.hazards.map(normalizeHazard)
    );
    expect(replica.before.diagnostics.actionTargets.map(normalizeTarget)).toEqual(
      host.decodedBoss.actionState.targets.map(normalizeTarget)
    );
    expect(replica.before.diagnostics.attackHazards.map(normalizeHazard)).toEqual(
      host.decodedBoss.hazards.map(normalizeHazard)
    );
    expect(replica.after.hp).toBe(replica.before.hp);
    expect(replica.after.diagnostics.attackHazards).toHaveLength(4);
    expect(replica.after.diagnostics.attackHazards.map((hazard) => hazard.id)).toEqual(
      replica.before.diagnostics.attackHazards.map((hazard) => hazard.id)
    );
  } finally {
    await guest.close();
  }
});

test("pincer and rush replicate a smooth false-true-false translation window", async ({ page, context }) => {
  test.setTimeout(90_000);
  const guest = await context.newPage();
  try {
    await startHunt(page);
    await startHunt(guest);

    const host = await page.evaluate(() => {
      const game = window.__dustAndDeadTest;
      const multiplayer = window.__dustMultiplayerTest;
      multiplayer.startMockHost(["Host", "Guest"]);
      game.startWaveNow(10, "hordeheart");

      const positions = (wire) => wire.bodies.map((body) => ({
        index: body.index,
        x: body.x,
        z: body.z,
      }));
      const snapshot = () => JSON.parse(JSON.stringify(
        multiplayer.buildWireSnapshot(true, true, "mock-player-2")
      ));

      const captureAttack = (kind, phase) => {
        game.forceHordeheartPhase(phase);
        const opening = game.getHordeheartDiagnostics();
        const focus = opening.bodies[0];
        multiplayer.setPlayerPosition("mock-player-1", focus.x - 2.5, focus.z + 13);
        multiplayer.setPlayerPosition("mock-player-2", focus.x + 3.5, focus.z + 14);
        game.forceHordeheartAttack(kind);
        game.seekHordeheartAction(0.1);

        const earlyWire = game.getHordeheartWireState();
        const early = {
          snapshot: snapshot(),
          decoded: game.getHordeheartPackedWireDiagnostics().decoded,
          positions: positions(earlyWire),
        };

        game.advanceHordeheart(50);
        game.seekHordeheartAction(0.56);
        const midWire = game.getHordeheartWireState();
        const mid = {
          snapshot: snapshot(),
          decoded: game.getHordeheartPackedWireDiagnostics().decoded,
          positions: positions(midWire),
        };

        game.advanceHordeheart(50);
        game.seekHordeheartAction(0.9);
        const finalWire = game.getHordeheartWireState();
        const final = {
          snapshot: snapshot(),
          decoded: game.getHordeheartPackedWireDiagnostics().decoded,
          positions: positions(finalWire),
        };
        return { kind, early, mid, final };
      };

      return [
        captureAttack("pincer", "halves"),
        captureAttack("rush", "quarters"),
      ];
    });

    for (const attack of host) {
      expect(attack.early.decoded.bodies.every((body) => body.translating === false)).toBe(true);
      expect(attack.mid.decoded.bodies.some((body) => body.translating === true)).toBe(true);
      expect(attack.final.decoded.bodies.every((body) => body.translating === false)).toBe(true);
      expect(Math.max(...attack.mid.positions.map((body, index) => Math.hypot(
        body.x - attack.early.positions[index].x,
        body.z - attack.early.positions[index].z,
      )))).toBeGreaterThan(0.15);
    }

    const replica = await guest.evaluate((attacks) => {
      const game = window.__dustAndDeadTest;
      const multiplayer = window.__dustMultiplayerTest;
      multiplayer.startMockGuest(["Host", "Guest"], 1);
      const positions = () => game.getHordeheartDiagnostics().bodies.map((body) => ({
        index: body.index,
        x: body.x,
        z: body.z,
      }));
      const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
      const hp = game.getPlayerHealth().hp;
      const results = [];

      for (const attack of attacks) {
        multiplayer.applySnapshot(attack.early.snapshot);
        const early = positions();
        multiplayer.applySnapshot(attack.mid.snapshot);
        const immediate = positions();
        game.advanceHordeheart(140);
        const planted = positions();
        // Rush targets are intentionally wave-delayed; allow the local clock
        // to cross the first target's authored 43% haul boundary.
        game.advanceHordeheart(400);
        const blended = positions();
        multiplayer.applySnapshot(attack.final.snapshot);
        game.advanceHordeheart(820);
        const settled = positions();
        results.push({
          kind: attack.kind,
          immediateJump: Math.max(...immediate.map((body, index) => distance(body, early[index]))),
          plantedTravel: Math.max(...planted.map((body, index) => distance(body, immediate[index]))),
          blendedTravel: Math.max(...blended.map((body, index) => distance(body, planted[index]))),
          settledError: Math.max(...settled.map((body, index) => distance(body, attack.final.positions[index]))),
        });
      }
      return { hpBefore: hp, hpAfter: game.getPlayerHealth().hp, results };
    }, host);

    expect(replica.hpAfter).toBe(replica.hpBefore);
    for (const attack of replica.results) {
      expect(attack.immediateJump, `${attack.kind} snapped on the translating packet`).toBeLessThan(0.02);
      expect(attack.plantedTravel, `${attack.kind} slid before its planted claws pulled`).toBeLessThan(0.03);
      expect(attack.blendedTravel, `${attack.kind} froze during the translating window`).toBeGreaterThan(0.03);
      expect(attack.settledError, `${attack.kind} did not converge to host coordinates`).toBeLessThan(0.35);
    }
  } finally {
    await guest.close();
  }
});

test("painted lane and circle boundaries are the exact host damage boundaries", async ({ page }) => {
  await startHunt(page);

  const samples = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;

    const sampleLane = (boundaryOffset) => {
      game.startWaveNow(10, "hordeheart");
      game.forceHordeheartPhase("whole");
      const body = game.getHordeheartDiagnostics().bodies[0];
      game.setPlayerPosition(body.x, body.z + 12);
      const attack = game.forceHordeheartAttack("fleshTide");
      const target = attack.actionTargets[0];
      const dx = target.targetX - target.sourceX;
      const dz = target.targetZ - target.sourceZ;
      const length = Math.max(0.001, Math.hypot(dx, dz));
      const midpointX = target.sourceX + dx * 0.58;
      const midpointZ = target.sourceZ + dz * 0.58;
      game.setPlayerPosition(
        midpointX - dz / length * (target.radius + boundaryOffset),
        midpointZ + dx / length * (target.radius + boundaryOffset)
      );
      game.setPlayerMaxHp(1000, 1000);
      game.setHordeheartAiEnabled(true);
      const before = game.getPlayerHealth().hp;
      // The colossal whole form now deliberately warns for longer than one
      // second. Prove both contracts independently: no premature damage
      // during that warning, then the same painted capsule decides the hit
      // once the authoritative 0.68 impact point has passed.
      game.advanceHordeheart(1300);
      const duringWarning = game.getPlayerHealth().hp;
      game.advanceHordeheart(100);
      return { before, duringWarning, after: game.getPlayerHealth().hp, target };
    };

    const sampleCircle = (boundaryOffset) => {
      game.startWaveNow(10, "hordeheart");
      game.forceHordeheartPhase("quarters");
      const center = game.getHordeheartDiagnostics();
      game.setPlayerPosition(center.centerX, center.centerZ + 10);
      const attack = game.forceHordeheartAttack("carrionNest");
      const target = attack.actionTargets[0];
      const otherTargets = attack.actionTargets.slice(1);
      let bestPoint = null;
      for (let candidateIndex = 0; candidateIndex < 96; candidateIndex += 1) {
        const angle = candidateIndex / 96 * Math.PI * 2;
        const point = {
          x: target.targetX + Math.cos(angle) * (target.radius + boundaryOffset),
          z: target.targetZ + Math.sin(angle) * (target.radius + boundaryOffset),
        };
        const clearance = Math.min(...otherTargets.map((other) => (
          Math.hypot(point.x - other.targetX, point.z - other.targetZ) - other.radius
        )));
        if (!bestPoint || clearance > bestPoint.clearance) bestPoint = { ...point, clearance };
      }
      game.setPlayerPosition(bestPoint.x, bestPoint.z);
      game.setPlayerMaxHp(1000, 1000);
      game.setHordeheartAiEnabled(true);
      const before = game.getPlayerHealth().hp;
      game.advanceHordeheart(1250);
      const duringWarning = game.getPlayerHealth().hp;
      const afterImpact = game.advanceHordeheart(350);
      return {
        before,
        duringWarning,
        after: game.getPlayerHealth().hp,
        target,
        targets: attack.actionTargets,
        hazards: afterImpact.attackHazards,
      };
    };

    return {
      laneInside: sampleLane(-0.08),
      laneOutside: sampleLane(0.08),
      circleInside: sampleCircle(-0.08),
      circleOutside: sampleCircle(0.08),
    };
  });

  expect(samples.laneInside.duringWarning).toBe(samples.laneInside.before);
  expect(samples.laneOutside.duringWarning).toBe(samples.laneOutside.before);
  expect(samples.circleInside.duringWarning).toBe(samples.circleInside.before);
  expect(samples.circleOutside.duringWarning).toBe(samples.circleOutside.before);
  expect(samples.laneInside.after).toBeLessThan(samples.laneInside.before);
  expect(samples.laneOutside.after).toBe(samples.laneOutside.before);
  expect(samples.circleInside.after).toBeLessThan(samples.circleInside.before);
  expect(samples.circleOutside.after).toBe(samples.circleOutside.before);
  // One throw punishes the predicted centre while the other three deny the
  // surrounding escape space. Their painted circles remain distinct and use
  // the shared damage grace rather than stacking four hits in one frame.
  expect(new Set(samples.circleInside.targets.map((target) => (
    `${target.targetX.toFixed(2)}:${target.targetZ.toFixed(2)}`
  ))).size).toBe(4);
  expect(samples.circleInside.hazards).toHaveLength(4);
  expect(samples.circleOutside.hazards).toHaveLength(4);
});
