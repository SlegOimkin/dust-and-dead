const path = require("node:path");
const { expect, test } = require("@playwright/test");

const EXPECTED_TEST_API = [
  "startWaveNow",
  "forceWaveState",
  "advanceSpawningOnly",
  "killNearestZombie",
  "getHordeheartDiagnostics",
  "advanceHordeheart",
  "damageHordeheart",
  "forceHordeheartPhase",
  "getHordeheartWireState",
  "getHordeheartPackedWireDiagnostics",
  "forceActiveBossDefeat",
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
  await page.waitForFunction(() => Boolean(window.__dustAndDeadTest?.startWaveNow));

  const missing = await page.evaluate((names) => names.filter(
    (name) => typeof window.__dustAndDeadTest?.[name] !== "function"
  ), EXPECTED_TEST_API);
  expect(
    missing,
    `Hordeheart test API is incomplete; missing: ${missing.join(", ")}`
  ).toEqual([]);
}

function readPhase(diagnostics) {
  return String(diagnostics.phase || diagnostics.stage || diagnostics.lifecycle || "");
}

function readBodies(diagnostics) {
  const candidates = diagnostics.bodies || diagnostics.fragments || diagnostics.targets;
  if (Array.isArray(candidates)) return candidates;
  if (diagnostics.boss && typeof diagnostics.boss === "object") return [diagnostics.boss];
  return [];
}

function bodyHealth(diagnostics) {
  return readBodies(diagnostics)
    .map((body, fallbackIndex) => ({
      index: Number(body.index ?? body.bodyIndex ?? body.fragmentIndex ?? fallbackIndex),
      hp: Number(body.hp) || 0,
      maxHp: Number(body.maxHp) || 0,
      active: body.active !== false,
      downed: Boolean(body.downed || body.inert || body.defeated),
    }))
    .sort((left, right) => left.index - right.index);
}

test("the Horde becomes floor flesh, gathers, and completes the readable 1-to-2-to-4 false-death sequence", async ({ page }) => {
  await startHunt(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const phase = (diagnostics) => String(
      diagnostics.phase || diagnostics.stage || diagnostics.lifecycle || ""
    );
    const chunks = (diagnostics) => {
      const value = diagnostics.fleshChunks ?? diagnostics.chunks ?? diagnostics.fleshChunkCount ?? 0;
      return Array.isArray(value) ? value.length : Math.max(0, Number(value) || 0);
    };
    const hordeHp = (diagnostics) => {
      const horde = diagnostics.horde || diagnostics.hordeHealth || {};
      return Number(horde.hp ?? diagnostics.hordeHp ?? diagnostics.hordeRemaining ?? 0);
    };
    const bodies = (diagnostics) => {
      const value = diagnostics.bodies || diagnostics.fragments || diagnostics.targets;
      if (Array.isArray(value)) return value;
      return diagnostics.boss ? [diagnostics.boss] : [];
    };
    const crates = () => {
      const world = JSON.parse(window.render_game_to_text());
      return Array.isArray(world.ammoCrates)
        ? world.ammoCrates.length
        : Math.max(0, Number(world.ammoCrates) || 0);
    };

    const wave = game.startWaveNow(10, "hordeheart");
    const opening = game.getHordeheartDiagnostics();
    const spawn = game.advanceSpawningOnly(3000);
    const beforeKill = game.getHordeheartDiagnostics();
    const killWorked = game.killNearestZombie();
    const afterKill = game.getHordeheartDiagnostics();
    const crateCounts = [crates()];

    game.forceHordeheartPhase("gather");
    const gathering = game.getHordeheartDiagnostics();
    crateCounts.push(crates());
    game.advanceHordeheart(6000);
    const whole = game.getHordeheartDiagnostics();
    const wholeHud = {
      hidden: document.querySelector("#boss-hud")?.hidden,
      classes: Array.from(document.querySelector("#boss-hud")?.classList || []),
      labels: Array.from(document.querySelectorAll(".boss-hordeheart-phase")).map((pip) => pip.dataset.label),
      phaseIndicatorsHidden: document.querySelector("#boss-church-pips")?.hidden,
      status: document.querySelector("#boss-status")?.textContent || "",
    };
    crateCounts.push(crates());

    game.damageHordeheart(999999, 0);
    const splitOne = game.getHordeheartDiagnostics();
    const splitHud = {
      hidden: document.querySelector("#boss-hud")?.hidden,
      classes: Array.from(document.querySelector("#boss-hud")?.classList || []),
    };
    crateCounts.push(crates());
    game.advanceHordeheart(5000);
    const halves = game.getHordeheartDiagnostics();
    crateCounts.push(crates());

    game.damageHordeheart(999999, 0);
    const firstHalfDown = game.getHordeheartDiagnostics();
    const firstHalfHud = {
      hidden: document.querySelector("#boss-hud")?.hidden,
      ariaValueText: document.querySelector(".boss-health-track")?.getAttribute("aria-valuetext") || "",
    };
    game.damageHordeheart(999999, 1);
    const splitTwo = game.getHordeheartDiagnostics();
    crateCounts.push(crates());
    game.advanceHordeheart(5000);
    const quarters = game.getHordeheartDiagnostics();
    crateCounts.push(crates());

    const quarterProgress = [];
    for (let index = 0; index < 4; index += 1) {
      game.damageHordeheart(999999, index);
      quarterProgress.push(game.getHordeheartDiagnostics());
    }
    const defeated = game.getHordeheartDiagnostics();
    crateCounts.push(crates());

    return {
      wave,
      opening,
      openingPhase: phase(opening),
      spawn,
      killWorked,
      beforeKillHp: hordeHp(beforeKill),
      afterKillHp: hordeHp(afterKill),
      chunksBefore: chunks(beforeKill),
      chunksAfter: chunks(afterKill),
      gathering,
      gatheringPhase: phase(gathering),
      whole,
      wholeHud,
      wholePhase: phase(whole),
      wholeBodyCount: bodies(whole).length,
      splitOne,
      splitHud,
      splitOnePhase: phase(splitOne),
      halves,
      halvesPhase: phase(halves),
      halfBodyCount: bodies(halves).length,
      firstHalfDown,
      firstHalfHud,
      firstHalfDownPhase: phase(firstHalfDown),
      firstHalfDownBodies: bodies(firstHalfDown),
      splitTwo,
      splitTwoPhase: phase(splitTwo),
      quarters,
      quartersPhase: phase(quarters),
      quarterBodyCount: bodies(quarters).length,
      quarterProgress: quarterProgress.map((entry) => ({
        phase: phase(entry),
        bodies: bodies(entry),
        defeated: Boolean(entry.defeated),
      })),
      defeated,
      defeatedPhase: phase(defeated),
      crateCounts,
    };
  });

  expect(result.wave).toMatchObject({ wave: 10, wave10BossKind: "hordeheart" });
  expect(result.opening).toMatchObject({ active: true, defeated: false });
  expect(result.openingPhase).toBe("horde");
  expect(result.opening.minimapMarkerVisible).toBe(false);
  expect(result.spawn.live).toBeGreaterThan(0);
  expect(result.killWorked).toBe(true);
  expect(result.beforeKillHp).toBeGreaterThan(0);
  expect(result.afterKillHp).toBeLessThan(result.beforeKillHp);
  expect(result.chunksAfter).toBe(result.chunksBefore + 1);

  expect(result.gatheringPhase).toBe("gather");
  expect(result.gathering).toMatchObject({ active: true, defeated: false });
  expect(result.gathering.minimapMarkerVisible).toBe(false);
  expect(result.wholePhase).toBe("whole");
  expect(result.whole.minimapMarkerVisible).toBe(true);
  expect(result.wholeBodyCount).toBe(1);
  expect(result.wholeHud).toMatchObject({
    hidden: false,
    labels: [],
    phaseIndicatorsHidden: true,
    status: "",
  });
  expect(result.splitOnePhase).toBe("split1");
  expect(result.splitOne.minimapMarkerVisible).toBe(true);
  expect(result.splitHud.hidden).toBe(true);
  expect(result.halvesPhase).toBe("halves");
  expect(result.halves.minimapMarkerVisible).toBe(true);
  expect(result.halfBodyCount).toBe(2);

  // The first half is a harmless corpse until its sibling falls; it must not
  // prematurely complete the encounter or skip the second false death.
  expect(result.firstHalfDownPhase).toBe("halves");
  expect(result.firstHalfDown.defeated).toBe(false);
  expect(result.firstHalfHud.hidden).toBe(false);
  expect(result.firstHalfHud.ariaValueText).toMatch(/^\d+% health$/);
  expect(result.firstHalfDownBodies.filter((body) => (
    body.downed || body.inert || body.defeated || body.active === false || Number(body.hp) <= 0
  ))).toHaveLength(1);
  expect(result.splitTwoPhase).toBe("split2");
  expect(result.splitTwo.minimapMarkerVisible).toBe(true);
  expect(result.quartersPhase).toBe("quarters");
  expect(result.quarters.minimapMarkerVisible).toBe(true);
  expect(result.quarterBodyCount).toBe(4);

  expect(result.quarterProgress.slice(0, 3).every((entry) => (
    entry.phase === "quarters" && !entry.defeated
  ))).toBe(true);
  expect(result.defeatedPhase).toBe("defeated");
  expect(result.defeated).toMatchObject({ active: false, defeated: true });
  expect(result.defeated.minimapMarkerVisible).toBe(false);

  // Ambient supply crates remain allowed. This specifically proves that none
  // are injected by gather/split transitions as a guaranteed phase refill.
  expect(new Set(result.crateCounts).size).toBe(1);
});

test("the Horde bar keeps the last zombie alive and reveals the final ten across the minimap", async ({ page }) => {
  await startHunt(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const multiplayer = window.__dustMultiplayerTest;
    multiplayer.startMockHost(["Host", "Guest"]);
    game.forceWaveState(10, 11, 0, "hordeheart");
    game.setHordeheartAiEnabled(false);
    game.advanceHordeheart(17);

    const hud = () => ({
      hidden: document.querySelector("#boss-hud")?.hidden,
      fill: document.querySelector("#boss-health-fill")?.style.transform || "",
    });
    const atEleven = game.getHordeheartDiagnostics();
    const scopedSnapshot = multiplayer.buildSnapshot(false, false, "mock-player-2");

    game.killNearestZombie();
    const atTen = game.getHordeheartDiagnostics();
    const revealSnapshot = multiplayer.buildSnapshot(false, false, "mock-player-2");

    while (game.getHordeheartDiagnostics().hordeHp > 1) {
      if (!game.killNearestZombie()) break;
    }
    const atOne = game.getHordeheartDiagnostics();
    const oneHud = hud();
    game.advanceHordeheart(17);
    const oneFrameLater = game.getHordeheartDiagnostics();

    const killedLast = game.killNearestZombie();
    const afterLastKill = game.getHordeheartDiagnostics();
    const afterLastHud = hud();
    const gathering = game.advanceHordeheart(17);

    return {
      atEleven,
      atTen,
      atOne,
      oneHud,
      oneFrameLater,
      killedLast,
      afterLastKill,
      afterLastHud,
      gathering,
      scopedSnapshot: {
        enemyScope: scopedSnapshot.enemyScope,
        enemyCount: scopedSnapshot.enemies?.length ?? 0,
      },
      revealSnapshot: {
        enemyScope: revealSnapshot.enemyScope,
        enemyCount: revealSnapshot.enemies?.length ?? 0,
      },
    };
  });

  expect(result.atEleven).toMatchObject({
    phase: "horde",
    hordeHp: 11,
    hordeMinimapRevealThreshold: 10,
    hordeMinimapRevealActive: false,
    hordeMinimapHighlightedCount: 0,
  });
  expect(result.scopedSnapshot.enemyScope).not.toBeNull();

  expect(result.atTen).toMatchObject({
    phase: "horde",
    hordeHp: 10,
    hordeMinimapRevealActive: true,
    hordeMinimapHighlightedCount: 10,
  });
  expect(result.revealSnapshot).toEqual({ enemyScope: null, enemyCount: 10 });

  expect(result.atOne).toMatchObject({
    phase: "horde",
    hordeHp: 1,
    hordeMinimapRevealActive: true,
    hordeMinimapHighlightedCount: 1,
  });
  expect(result.oneHud.hidden).toBe(false);
  expect(result.oneHud.fill).toMatch(/^scaleX\(0\.\d+\)$/);
  expect(result.oneFrameLater).toMatchObject({ phase: "horde", hordeHp: 1 });

  expect(result.killedLast).toBe(true);
  expect(result.afterLastKill).toMatchObject({ phase: "horde", hordeHp: 0 });
  expect(result.afterLastHud.hidden).toBe(true);
  expect(result.gathering).toMatchObject({ phase: "gather", hordeHp: 0 });
});

test("Hordeheart descendants inherit real split-node transforms and emerge continuously from their own parents", async ({ page }) => {
  await startHunt(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const distance = (left, right) => Math.hypot(left.x - right.x, left.z - right.z);

    game.startWaveNow(10, "hordeheart");
    game.advanceSpawningOnly(3000);
    game.killNearestZombie();
    const floorFlesh = game.getHordeheartDiagnostics().fleshChunkSamples[0];
    game.forceHordeheartPhase("gather");
    const gatherStart = game.getHordeheartDiagnostics().fleshChunkSamples[0];
    game.advanceHordeheart(17);
    const gatherFirstFrame = game.getHordeheartDiagnostics().fleshChunkSamples[0];

    game.forceHordeheartPhase("whole");
    const wholeAtCenter = game.getHordeheartDiagnostics();
    game.setPlayerPosition(wholeAtCenter.centerX + 32, wholeAtCenter.centerZ + 8);
    game.advanceHordeheart(900);
    const movedWhole = game.getHordeheartDiagnostics();

    game.damageHordeheart(999999, 0);
    const splitOne = game.getHordeheartDiagnostics();
    game.advanceHordeheart(3520);
    const halvesBorn = game.getHordeheartDiagnostics();
    game.advanceHordeheart(450);
    const halvesMidEmergence = game.getHordeheartDiagnostics();
    game.advanceHordeheart(600);
    const halvesSettled = game.getHordeheartDiagnostics();

    const halfParents = halvesSettled.bodies.map((body) => ({
      index: body.index,
      fragmentId: body.fragmentId,
      x: body.x,
      z: body.z,
    }));
    game.damageHordeheart(999999, 0);
    game.damageHordeheart(999999, 1);
    const splitTwo = game.getHordeheartDiagnostics();
    game.advanceHordeheart(3520);
    const quartersBorn = game.getHordeheartDiagnostics();
    game.advanceHordeheart(450);
    const quartersMidEmergence = game.getHordeheartDiagnostics();

    const halfSourceMidpoint = halvesBorn.bodies.reduce((point, body) => ({
      x: point.x + body.sourceX / halvesBorn.bodies.length,
      z: point.z + body.sourceZ / halvesBorn.bodies.length,
    }), { x: 0, z: 0 });

    return {
      gather: {
        sameId: floorFlesh.id === gatherStart.id && gatherStart.id === gatherFirstFrame.id,
        transitionError: distance(floorFlesh, gatherStart),
        firstFrameTravel: distance(gatherStart, gatherFirstFrame),
      },
      wholeTravelFromCenter: distance(
        movedWhole.bodies[0],
        { x: movedWhole.centerX, z: movedWhole.centerZ }
      ),
      splitOne,
      halvesBorn,
      halvesMidEmergence,
      halvesSettled,
      halfSourceToMovedParent: distance(halfSourceMidpoint, movedWhole.bodies[0]),
      halfSourceToEncounterCenter: distance(halfSourceMidpoint, {
        x: movedWhole.centerX,
        z: movedWhole.centerZ,
      }),
      halfParents,
      splitTwo,
      quartersBorn,
      quartersMidEmergence,
    };
  });

  expect(result.gather.sameId).toBe(true);
  expect(result.gather.transitionError).toBeLessThanOrEqual(0.001);
  expect(result.gather.firstFrameTravel).toBeLessThan(0.08);

  expect(result.wholeTravelFromCenter).toBeGreaterThan(1);
  expect(result.splitOne.phase).toBe("split1");
  expect(result.splitOne.splitProvenance).toMatchObject({
    fromPhase: "whole",
    targetPhase: "halves",
  });

  expect(result.halvesBorn.phase).toBe("halves");
  expect(result.halvesBorn.bodies).toHaveLength(2);
  expect(result.halfSourceToMovedParent).toBeLessThan(0.4);
  expect(result.halfSourceToEncounterCenter).toBeGreaterThan(1);
  expect(result.halvesBorn.bodies.map((body) => body.fragmentId)).toEqual([
    "root/half-0",
    "root/half-1",
  ]);
  for (const body of result.halvesBorn.bodies) {
    expect(body.targetSplitIndex).toBe(body.index);
    expect(body.parentFragmentId).toBe("root");
    expect(body.parentBodyIndex).toBe(0);
    expect(body.sourceApi).toBe("getSplitAnchors");
    expect(body.sourceNode).toMatch(/HalfSplitAnchor$/);
    expect(body.usedModelAnchor).toBe(true);
    expect(body.spawnContinuityError).toBeLessThanOrEqual(0.001);
    expect(Math.hypot(body.x - body.sourceX, body.z - body.sourceZ)).toBeLessThanOrEqual(0.001);
    expect(body.emergence).toMatchObject({ active: true, progress: 0 });
    expect(Math.hypot(
      body.emergence.targetX - body.emergence.startX,
      body.emergence.targetZ - body.emergence.startZ
    )).toBeGreaterThan(0.3);
  }
  expect(result.halvesMidEmergence.bodies.every((body) => (
    body.emergence.active
    && body.emergence.progress > 0.35
    && body.emergence.progress < 0.7
    && body.emergence.distanceFromSource > 0.1
  ))).toBe(true);
  expect(result.halvesSettled.bodies.every((body) => (
    !body.emergence.active && body.emergence.progress === 1
  ))).toBe(true);

  expect(result.splitTwo.phase).toBe("split2");
  expect(result.splitTwo.splitProvenance).toMatchObject({
    fromPhase: "halves",
    targetPhase: "quarters",
  });
  expect(result.quartersBorn.phase).toBe("quarters");
  expect(result.quartersBorn.bodies).toHaveLength(4);
  // Quarter indices retain the model's side/front identity: parity is the
  // parent side, while indices 2/3 are the front fragments.
  expect(result.quartersBorn.bodies.map((body) => body.parentBodyIndex)).toEqual([0, 1, 0, 1]);
  expect(result.quartersBorn.bodies.map((body) => body.parentFragmentId)).toEqual([
    "root/half-0",
    "root/half-1",
    "root/half-0",
    "root/half-1",
  ]);
  expect(result.quartersBorn.bodies.map((body) => body.fragmentId)).toEqual([
    "root/half-0/quarter-1",
    "root/half-1/quarter-1",
    "root/half-0/quarter-0",
    "root/half-1/quarter-0",
  ]);
  for (const body of result.quartersBorn.bodies) {
    const parent = result.halfParents.find((candidate) => candidate.index === body.parentBodyIndex);
    const otherParent = result.halfParents.find((candidate) => candidate.index !== body.parentBodyIndex);
    expect(parent).toBeTruthy();
    expect(body.targetSplitIndex).toBe(body.index);
    expect(body.sourceApi).toBe("getSplitAnchors");
    expect(body.sourceNode.length).toBeGreaterThan(0);
    expect(body.usedModelAnchor).toBe(true);
    expect(body.spawnContinuityError).toBeLessThanOrEqual(0.001);
    expect(Math.hypot(body.x - body.sourceX, body.z - body.sourceZ)).toBeLessThanOrEqual(0.001);
    expect(Math.hypot(body.sourceX - parent.x, body.sourceZ - parent.z)).toBeLessThan(
      Math.hypot(body.sourceX - otherParent.x, body.sourceZ - otherParent.z)
    );
  }
  expect(result.quartersMidEmergence.bodies.every((body) => (
    body.emergence.active
    && body.emergence.progress > 0.35
    && body.emergence.progress < 0.7
    && body.emergence.distanceFromSource > 0.08
  ))).toBe(true);
});

test("Hordeheart body health keeps its phase bases and scaling, then applies the wave 10 health reduction", async ({ page }) => {
  await startHunt(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const bodies = (diagnostics) => {
      const value = diagnostics.bodies || diagnostics.fragments || diagnostics.targets;
      const list = Array.isArray(value) ? value : diagnostics.boss ? [diagnostics.boss] : [];
      return list.map((body) => Number(body.maxHp) || 0).sort((a, b) => a - b);
    };
    const capture = (wave, playerNames) => {
      if (playerNames) window.__dustMultiplayerTest.startMockHost(playerNames);
      game.startWaveNow(wave, "hordeheart");
      const phases = {};
      for (const phase of ["whole", "halves", "quarters"]) {
        game.forceHordeheartPhase(phase);
        phases[phase] = {
          maxHps: bodies(game.getHordeheartDiagnostics()),
          diagnostics: game.getHordeheartDiagnostics(),
        };
      }
      return phases;
    };
    const wave10Solo = capture(10);
    const wave15Solo = capture(15);
    const wave15FourPlayers = capture(15, ["Host", "North", "South", "West"]);
    game.startWaveNow(10, "hordeheart");
    game.forceHordeheartPhase("whole");
    const forcedDefeatResult = game.forceActiveBossDefeat();
    const forcedDefeat = game.getHordeheartDiagnostics();
    return {
      wave10Solo,
      wave15Solo,
      wave15FourPlayers,
      forcedDefeatResult,
      forcedDefeat,
    };
  });

  expect(result.wave10Solo.whole.maxHps).toEqual([1680]);
  expect(result.wave10Solo.halves.maxHps).toEqual([630, 630]);
  expect(result.wave10Solo.quarters.maxHps).toEqual([228, 228, 228, 228]);

  expect(result.wave15Solo.whole.maxHps).toEqual([2016]);
  expect(result.wave15Solo.halves.maxHps).toEqual([756, 756]);
  expect(result.wave15Solo.quarters.maxHps).toEqual([273, 273, 273, 273]);

  expect(result.wave15FourPlayers.whole.maxHps).toEqual([5040]);
  expect(result.wave15FourPlayers.halves.maxHps).toEqual([1890, 1890]);
  expect(result.wave15FourPlayers.quarters.maxHps).toEqual([683, 683, 683, 683]);
  expect(result.forcedDefeatResult).toBe(true);
  expect(result.forcedDefeat).toMatchObject({
    active: false,
    defeated: true,
    phase: "defeated",
  });

  const tuning = result.wave15FourPlayers.whole.diagnostics.healthTuning
    || result.wave15FourPlayers.whole.diagnostics.combatConfig;
  expect(tuning).toMatchObject({
    wholeBaseHp: 2400,
    halfBaseHp: 900,
    quarterBaseHp: 325,
    combatHpMultiplier: 5,
    waveHealthScale: 1.2,
    playerHealthScale: 2.5,
  });
});

test("packed host snapshots preserve the Hordeheart phase and every independently damaged body", async ({ page, context }) => {
  const guest = await context.newPage();
  try {
    await startHunt(page);
    await startHunt(guest);

    const host = await page.evaluate(() => {
      const game = window.__dustAndDeadTest;
      const multiplayer = window.__dustMultiplayerTest;
      multiplayer.startMockHost(["Host", "Guest"]);
      game.startWaveNow(15, "hordeheart");
      game.forceHordeheartPhase("halves");
      game.damageHordeheart(37, 0);
      const diagnostics = game.getHordeheartDiagnostics();
      const hordeheartWire = game.getHordeheartWireState();
      const packed = game.getHordeheartPackedWireDiagnostics();
      const snapshot = JSON.parse(JSON.stringify(
        multiplayer.buildWireSnapshot(false, false, "mock-player-2")
      ));
      return {
        diagnostics,
        hordeheartWire,
        packed,
        snapshot,
        decoded: multiplayer.decodeBossState(snapshot.bossState),
      };
    });

    const replica = await guest.evaluate((snapshot) => {
      const multiplayer = window.__dustMultiplayerTest;
      multiplayer.startMockGuest(["Host", "Guest"], 1);
      multiplayer.applySnapshot(snapshot);
      return {
        diagnostics: window.__dustAndDeadTest.getHordeheartDiagnostics(),
        world: JSON.parse(window.render_game_to_text()),
      };
    }, host.snapshot);

    const hostBodies = bodyHealth(host.diagnostics);
    const wireBodies = bodyHealth(host.hordeheartWire);
    const decodedBodies = bodyHealth(host.decoded);
    const guestBodies = bodyHealth(replica.diagnostics);

    expect(readPhase(host.diagnostics)).toBe("halves");
    expect(hostBodies).toHaveLength(2);
    expect(hostBodies[0].hp).toBe(hostBodies[0].maxHp - 37);
    expect(hostBodies[1].hp).toBe(hostBodies[1].maxHp);
    expect(readPhase(host.hordeheartWire)).toBe("halves");
    expect(wireBodies).toEqual(hostBodies);

    expect(host.packed).toMatchObject({
      protocolVersion: 46,
      typeCode: 5,
      kind: "hordeheart",
      phase: "halves",
      bodyCount: 2,
    });
    expect(Number(host.packed.bytes) || 0).toBeGreaterThan(0);
    expect(Number(host.packed.bytes) || Infinity).toBeLessThanOrEqual(768);

    expect(host.decoded).toMatchObject({ kind: "hordeheart" });
    expect(readPhase(host.decoded)).toBe("halves");
    expect(decodedBodies).toEqual(hostBodies);
    expect(replica.world).toMatchObject({ wave: 15, wave10BossKind: "hordeheart" });
    expect(replica.diagnostics).toMatchObject({
      active: true,
      defeated: false,
      replica: true,
    });
    expect(readPhase(replica.diagnostics)).toBe("halves");
    expect(guestBodies).toEqual(hostBodies);
  } finally {
    await guest.close();
  }
});

test("Hordeheart health vanishes during every false death and follows replicated forms without phase spoilers", async ({ page, context }) => {
  test.setTimeout(240_000);
  const guest = await context.newPage();
  try {
    await startHunt(page);
    await startHunt(guest);

    const openingSnapshot = await page.evaluate(() => {
      const game = window.__dustAndDeadTest;
      const multiplayer = window.__dustMultiplayerTest;
      multiplayer.startMockHost(["Host", "Guest"]);
      game.startWaveNow(10, "hordeheart");
      game.forceHordeheartPhase("horde");
      return JSON.parse(JSON.stringify(
        multiplayer.buildWireSnapshot(false, false, "mock-player-2")
      ));
    });
    await guest.evaluate((snapshot) => {
      const multiplayer = window.__dustMultiplayerTest;
      multiplayer.startMockGuest(["Host", "Guest"], 1);
      multiplayer.applySnapshot(snapshot);
    }, openingSnapshot);

    const assertHud = async (visible) => {
      if (visible) {
        await expect(guest.locator("#boss-hud")).toBeVisible();
        await expect(guest.locator(".boss-health-track")).toBeVisible();
        await expect(guest.locator(".boss-health-track")).toHaveAttribute("aria-valuetext", /^\d+% health$/);
      } else {
        await expect(guest.locator("#boss-hud")).toBeHidden();
        await expect(guest.locator(".boss-health-track")).toBeHidden();
      }
      await expect(guest.locator("#boss-status")).toBeHidden();
      await expect(guest.locator("#boss-status")).toHaveText("");
      await expect(guest.locator("#boss-church-pips")).toBeHidden();
      await expect(guest.locator("#boss-church-pips")).not.toHaveAttribute("aria-label");
      await expect(guest.locator("#boss-church-pips .boss-hordeheart-phase")).toHaveCount(0);
    };

    await assertHud(true);
    const phases = [
      ["gather", false],
      ["whole", true],
      ["split1", false],
      ["halves", true],
      ["split2", false],
      ["quarters", true],
      ["defeated", false],
    ];
    for (const [phase, healthVisible] of phases) {
      const snapshot = await page.evaluate((nextPhase) => {
        const game = window.__dustAndDeadTest;
        const multiplayer = window.__dustMultiplayerTest;
        if (nextPhase === "defeated") game.forceActiveBossDefeat();
        else game.forceHordeheartPhase(nextPhase);
        return JSON.parse(JSON.stringify(
          multiplayer.buildWireSnapshot(false, false, "mock-player-2")
        ));
      }, phase);
      await guest.evaluate((nextSnapshot) => {
        window.__dustMultiplayerTest.applySnapshot(nextSnapshot);
      }, snapshot);
      await assertHud(healthVisible);
    }
  } finally {
    await guest.close();
  }
});

test("the procedural model exposes stable whole, half, and quarter rigs for gameplay splitting", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto(fileUrl("index.html"));
  await page.waitForFunction(() => Boolean(window.THREE && window.createHordeheartModel));

  const result = await page.evaluate(() => {
    const inspect = (sizeClass, splitIndex) => {
      const model = window.createHordeheartModel({
        sizeClass,
        splitIndex,
        reviewPass: "interaction-pass",
      });
      const parts = model.userData.hordeheartParts;
      let meshCount = 0;
      let triangleCount = 0;
      model.traverse((node) => {
        if (!node.isMesh || !node.geometry) return;
        meshCount += 1;
        const geometry = node.geometry;
        triangleCount += geometry.index
          ? geometry.index.count / 3
          : geometry.attributes.position.count / 3;
      });
      const splitNodes = sizeClass === "whole" ? parts.halfGroups : parts.quarterGroups;
      const before = splitNodes.map((group) => ({
        x: group.position.x,
        z: group.position.z,
        rx: group.rotation.x,
        rz: group.rotation.z,
      }));
      const armRigs = parts.armRigs || [];
      const ribPivots = parts.ribPivots || [];
      const armRest = armRigs.map((rig) => ({
        shoulderY: rig.shoulder.rotation.y,
        elbowY: rig.elbow.rotation.y,
      }));
      const ribRest = ribPivots.map((pivot) => pivot.rotation.y);
      model.userData.animate(0.37, { moveAmount: 1, action: "idle", actionProgress: 0, damageFlash: 0 });
      const crawlPoseMoved = armRigs.some((rig, index) => (
        Math.abs(rig.shoulder.rotation.y - armRest[index].shoulderY) > 0.01
        || Math.abs(rig.elbow.rotation.y - armRest[index].elbowY) > 0.01
      ));
      model.userData.animate(0.37, { moveAmount: 0, action: "ribBloom", actionProgress: 0.64, damageFlash: 0 });
      const ribBloomMoved = ribPivots.some((pivot, index) => Math.abs(pivot.rotation.y - ribRest[index]) > 0.2);
      model.userData.animate(0.37, { moveAmount: 0, action: "fleshTide", actionProgress: 0.64, damageFlash: 0 });
      const attackLunge = Math.abs(parts.bodyRoot.position.z) > 0.5;
      model.userData.setSplitPreview(1, "x");
      model.userData.animate(1.25, { enraged: sizeClass !== "whole", damageFlash: 0.5 });
      model.updateMatrixWorld(true);
      const chestPosition = new THREE.Vector3();
      const chestQuaternion = new THREE.Quaternion();
      const chestNormal = new THREE.Vector3(0, 0, 1);
      const skullPosition = new THREE.Vector3();
      if (parts.centralChestRig) {
        parts.centralChestRig.getWorldPosition(chestPosition);
        parts.centralChestRig.getWorldQuaternion(chestQuaternion);
        chestNormal.applyQuaternion(chestQuaternion);
      }
      if (parts.skull) parts.skull.getWorldPosition(skullPosition);
      let centralRibMeshCount = 0;
      let hasOuterRibFrame = false;
      let forearmBoneSleeveCount = 0;
      let bonePalmPlateCount = 0;
      let proximalDigitCount = 0;
      model.traverse((node) => {
        if (node.isMesh && /^CentralRib(?:Frame)?_/.test(node.name)) centralRibMeshCount += 1;
        if (node.isMesh && /^CentralRibFrame_/.test(node.name)) hasOuterRibFrame = true;
        if (node.isMesh && node.name === "ForearmBoneSleeve") forearmBoneSleeveCount += 1;
        if (node.isMesh && node.name === "BonePalmPlate") bonePalmPlateCount += 1;
        if (node.isMesh && /^BoneDigitProximal_/.test(node.name)) proximalDigitCount += 1;
      });
      const after = splitNodes.map((group) => ({
        x: group.position.x,
        z: group.position.z,
        rx: group.rotation.x,
        rz: group.rotation.z,
      }));
      const output = {
        name: model.name,
        sizeClass: model.userData.sizeClass,
        splitIndex: model.userData.splitIndex,
        modelVersion: model.userData.modelVersion,
        isHordeheartModel: model.userData.isHordeheartModel,
        quarterCount: parts.quarterGroups.length,
        halfRigCount: parts.halfGroups.length,
        heartCount: parts.hearts.length,
        armCount: parts.arms.length,
        colliderCount: parts.colliders.length,
        woundSocketCount: parts.woundSockets.length,
        meshCount,
        triangleCount,
        movedBySplitPreview: after.some((point, index) => (
          Math.abs(point.x - before[index].x) > 0.01
          || Math.abs(point.z - before[index].z) > 0.01
          || Math.abs(point.rx - before[index].rx) > 0.01
          || Math.abs(point.rz - before[index].rz) > 0.01
        )),
        animation: {
          states: model.userData.animationStates,
          armRigCount: armRigs.length,
          digitCounts: armRigs.map((rig) => rig.fingers.length),
          crawlPoseMoved,
          ribPivotCount: ribPivots.length,
          ribBloomMoved,
          attackLunge,
          hasOuterRibFrame,
          forearmBoneSleeveCount,
          bonePalmPlateCount,
          proximalDigitCount,
        },
        functions: {
          animate: typeof model.userData.animate,
          split: typeof model.userData.setSplitPreview,
          dispose: typeof model.userData.dispose,
        },
        destructionGroups: Object.keys(parts.destructionGroups || {}).sort(),
        centralChest: parts.centralChestRig ? {
          position: { x: chestPosition.x, y: chestPosition.y, z: chestPosition.z },
          normal: { x: chestNormal.x, y: chestNormal.y, z: chestNormal.z },
          skullPosition: { x: skullPosition.x, y: skullPosition.y, z: skullPosition.z },
          centralRibMeshCount,
        } : null,
      };
      model.userData.dispose();
      return output;
    };
    return {
      passes: window.HORDEHEART_MODEL_PASSES,
      whole: inspect("whole", 0),
      half: inspect("half", 1),
      quarter: inspect("quarter", 3),
    };
  });

  expect(pageErrors).toEqual([]);
  expect(result.passes).toEqual([
    "blockout",
    "structural-pass",
    "form-refinement",
    "material-pass",
    "surface-pass",
    "lighting-pass",
    "interaction-pass",
  ]);

  expect(result.whole).toMatchObject({
    name: "Hordeheart_whole",
    sizeClass: "whole",
    splitIndex: 0,
    modelVersion: 10,
    isHordeheartModel: true,
    quarterCount: 4,
    halfRigCount: 2,
    heartCount: 5,
    armCount: 8,
    colliderCount: 4,
    woundSocketCount: 4,
    movedBySplitPreview: true,
    functions: { animate: "function", split: "function", dispose: "function" },
    destructionGroups: ["final", "halves", "whole"],
  });
  expect(result.whole.centralChest.centralRibMeshCount).toBe(10);
  expect(result.whole.animation).toMatchObject({
    armRigCount: 8,
    crawlPoseMoved: true,
    ribPivotCount: 10,
    ribBloomMoved: true,
    attackLunge: true,
    hasOuterRibFrame: false,
    forearmBoneSleeveCount: 8,
    bonePalmPlateCount: 8,
    proximalDigitCount: 32,
  });
  expect(result.whole.animation.digitCounts).toEqual(Array(8).fill(4));
  expect(result.whole.animation.states).toEqual(expect.arrayContaining([
    "crawl", "fleshTide", "ribBloom", "systole", "pincer", "rush",
  ]));
  expect(Math.abs(result.whole.centralChest.position.x)).toBeLessThan(0.05);
  expect(Math.abs(result.whole.centralChest.position.z)).toBeLessThan(0.3);
  expect(result.whole.centralChest.position.y).toBeGreaterThan(1.5);
  expect(result.whole.centralChest.normal.y).toBeGreaterThan(0.8);
  expect(result.whole.centralChest.skullPosition.z - result.whole.centralChest.position.z).toBeGreaterThan(3);
  expect(result.half).toMatchObject({
    name: "Hordeheart_half",
    sizeClass: "half",
    splitIndex: 1,
    quarterCount: 2,
    heartCount: 2,
    armCount: 4,
    colliderCount: 2,
    woundSocketCount: 2,
    movedBySplitPreview: true,
  });
  expect(result.half.animation.armRigCount).toBe(4);
  expect(result.half.animation.digitCounts).toEqual(Array(4).fill(4));
  expect(result.half.animation.crawlPoseMoved).toBe(true);
  expect(result.half.animation.attackLunge).toBe(true);
  expect(result.quarter).toMatchObject({
    name: "Hordeheart_quarter",
    sizeClass: "quarter",
    splitIndex: 3,
    quarterCount: 1,
    heartCount: 1,
    armCount: 2,
    colliderCount: 1,
    woundSocketCount: 1,
  });
  expect(result.quarter.animation.armRigCount).toBe(2);
  expect(result.quarter.animation.digitCounts).toEqual(Array(2).fill(4));
  expect(result.quarter.animation.crawlPoseMoved).toBe(true);
  expect(result.quarter.animation.attackLunge).toBe(true);
  for (const model of [result.whole, result.half, result.quarter]) {
    expect(model.meshCount).toBeGreaterThan(20);
    expect(model.triangleCount).toBeGreaterThan(200);
    expect(model.triangleCount).toBeLessThan(100_000);
  }
});

test("Hordeheart conceals phase count and shows health only while the current form can be fought", async ({ page }) => {
  test.setTimeout(120_000);
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await startHunt(page);
  await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    game.startWaveNow(10, "hordeheart");
    game.setHordeheartAiEnabled(false);
  });
  const stages = [
    ["horde", true, "THE HORDE"],
    ["gather", false, ""],
    ["whole", true, "HORDEHEART · MASS OF THE FALLEN"],
    ["split1", false, ""],
    ["halves", true, "HORDEHEART · MASS OF THE FALLEN"],
    ["split2", false, ""],
    ["quarters", true, "HORDEHEART · MASS OF THE FALLEN"],
    ["defeated", false, ""],
  ];

  for (const [phase, healthVisible, name] of stages) {
    await page.evaluate((nextPhase) => {
      const game = window.__dustAndDeadTest;
      if (nextPhase === "defeated") game.forceActiveBossDefeat();
      else game.forceHordeheartPhase(nextPhase);
    }, phase);
    if (healthVisible) {
      await expect(page.locator("#boss-hud")).toBeVisible();
      await expect(page.locator(".boss-health-track")).toBeVisible();
      await expect(page.locator("#boss-name")).toHaveText(name);
    } else {
      await expect(page.locator("#boss-hud")).toBeHidden();
      await expect(page.locator(".boss-health-track")).toBeHidden();
    }
    await expect(page.locator("#boss-status")).toBeHidden();
    await expect(page.locator("#boss-status")).toHaveText("");
    await expect(page.locator("#boss-church-pips")).toBeHidden();
    await expect(page.locator("#boss-church-pips")).not.toHaveAttribute("aria-label");
    await expect(page.locator("#boss-church-pips .boss-hordeheart-phase")).toHaveCount(0);
  }
  expect(pageErrors).toEqual([]);
});

test("the playable Hordeheart rifle test scene starts the full encounter with a maxed rifle", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto(`${fileUrl("index.html")}?mapSeed=7331&preview=hordeheart-rifle-test`);
  await page.waitForFunction(() => Boolean(window.__dustAndDeadTest?.getHordeheartDiagnostics));

  const result = await page.evaluate(() => ({
    game: JSON.parse(window.render_game_to_text()),
    boss: window.__dustAndDeadTest.getHordeheartDiagnostics(),
  }));

  expect(pageErrors).toEqual([]);
  expect(result.game).toMatchObject({
    mode: "playing",
    wave: 10,
    wave10BossKind: "hordeheart",
    weapon: "rifle",
    player: { visible: true },
    ammo: { current: 36, magazine: 36, reserve: 9999 },
    progression: {
      level: 30,
      playerClass: "ranger",
      rifleUpgrade: "leverBarrage",
    },
  });
  expect(result.game.progression.upgrades).toMatchObject({
    extendedTube: 1,
    trailLoader: 1,
    chainLightning: 1,
    stormTempo: 1,
    steadyHand: 10,
    quickReload: 8,
    hairTrigger: 8,
    longReach: 5,
  });
  expect(result.game.waveSpawnTarget).toBeGreaterThan(0);
  expect(result.boss).toMatchObject({
    active: true,
    defeated: false,
    replica: false,
    phase: "horde",
    guaranteedPhaseCrates: 0,
  });
  expect(result.boss.horde.maxHp).toBeGreaterThan(0);
  await expect(page.locator("#boss-hud")).toBeVisible();
  await expect(page.locator("#boss-name")).toHaveText("THE HORDE");
});
