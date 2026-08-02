const path = require("node:path");
const { expect, test } = require("@playwright/test");

function fileUrl(relativePath) {
  const absolute = path.resolve(__dirname, "..", relativePath).replace(/\\/g, "/");
  return `file:///${absolute}`;
}

async function openGame(page) {
  await page.goto(`${fileUrl("index.html")}?mapSeed=7331`);
  const intro = page.locator("#intro-screen");
  if (await intro.isVisible().catch(() => false)) {
    await page.keyboard.press("KeyM");
    await expect(intro).toBeHidden();
  }
  await page.waitForFunction(() => Boolean(window.__dustAndDeadTest && window.__dustMultiplayerTest));
}

test("boss weapon progress only advances after authoritative damage and dual revolvers ramp", async ({ page }) => {
  await openGame(page);

  const result = await page.evaluate(() => {
    const api = window.__dustAndDeadTest;

    api.startWaveNow(10, "bellRinger");
    api.configureBossWeaponBuildForTest({
      playerClass: "demolitionist",
      launcherUpgrade: "bombardier",
      weapon: "launcher",
      upgrades: ["clusterCharge", "chainDetonation", "fullSalvo", "madmansJourney"],
      ammoCurrent: 0,
    });
    const shielded = api.damageActiveBossWithSourceForTest(8, {
      type: "launcherExplosion",
      kind: "main",
      directTarget: true,
    });

    api.startWaveNow(10, "landEater");
    api.configureBossWeaponBuildForTest({
      playerClass: "gunslinger",
      revolverUpgrade: "dualRevolvers",
      weapon: "revolver",
      upgrades: ["ricochetRounds", "trickShot", "fanTheHammer", "allRightAllLeft"],
    });
    const hits = [];
    for (let i = 0; i < 8; i += 1) {
      const right = i % 2 === 0;
      hits.push(api.damageActiveBossWithSourceForTest(2, {
        type: "revolver",
        muzzleSide: right ? -1 : 1,
        dualHand: right ? "right" : "left",
      }));
    }
    const rebound = api.triggerBossRevolverReboundForTest(2);
    return { shielded, hits, rebound, final: api.getBossWeaponDiagnostics() };
  });

  expect(result.shielded.applied).toBe(0);
  expect(result.shielded.diagnostics.launcherDirectHits).toBe(0);
  expect(result.shielded.diagnostics.launcherSalvoHits).toBe(0);
  expect(result.hits.every((entry) => entry.applied > 0)).toBe(true);
  expect(result.hits[1].applied).toBeCloseTo(2.1, 3);
  expect(result.hits[5].applied).toBeCloseTo(2.5, 3);
  expect(result.hits[7].applied).toBeGreaterThan(result.hits[0].applied);
  expect(result.final.dualStacks).toBe(5);
  expect(result.final.dualHits).toBe(8);
  expect(result.final.fanTimer).toBeGreaterThanOrEqual(0.64);
  expect(result.final.dualFreeRounds).toBe(1);
  expect(result.rebound.triggered).toBe(true);
  expect(result.rebound.applied).toBeGreaterThan(0);
});

test("Big Iron converts dead boss perks and Bombardier rewards direct hits without cluster double dipping", async ({ page }) => {
  await openGame(page);

  const result = await page.evaluate(() => {
    const api = window.__dustAndDeadTest;

    api.startWaveNow(10, "landEater");
    api.configureBossWeaponBuildForTest({
      playerClass: "gunslinger",
      revolverUpgrade: "bigIron",
      weapon: "revolver",
      upgrades: ["throughAndThrough", "heavyRupture", "leadBloom", "silverBullet", "silverCache", "executioner"],
    });
    const plain = api.damageActiveBossWithSourceForTest(4, { type: "revolver" });
    const exitWound = api.damageActiveBossWithSourceForTest(4, {
      type: "revolver",
      throughAndThrough: true,
      heavyRupture: true,
    });

    api.configureBossWeaponBuildForTest({
      playerClass: "gunslinger",
      revolverUpgrade: "bigIron",
      weapon: "revolver",
      upgrades: ["leadBloom", "silverBullet", "silverCache"],
      ammoCurrent: 0,
    });
    const bloomHits = [];
    for (let i = 0; i < 4; i += 1) {
      bloomHits.push(api.damageActiveBossWithSourceForTest(4, { type: "revolver", leadBloom: true }));
    }
    for (let i = 0; i < 3; i += 1) {
      api.damageActiveBossWithSourceForTest(4, { type: "revolver", silverBullet: true });
    }
    const bigIronFinal = api.getBossWeaponDiagnostics();

    api.startWaveNow(10, "landEater");
    api.configureBossWeaponBuildForTest({
      playerClass: "demolitionist",
      launcherUpgrade: "bombardier",
      weapon: "launcher",
      upgrades: [
        "clusterCharge",
        "moreBomblets",
        "moreBomblets",
        "chainDetonation",
        "fullSalvo",
        "madmansJourney",
      ],
      ammoCurrent: 0,
    });
    const launcherHits = [];
    for (let i = 0; i < 4; i += 1) {
      launcherHits.push(api.damageActiveBossWithSourceForTest(8, {
        type: "launcherExplosion",
        kind: "main",
        directTarget: true,
      }));
    }
    const focusedCluster = api.damageActiveBossWithSourceForTest(8, {
      type: "launcherExplosion",
      kind: "cluster",
      bossFocusedTarget: true,
    });
    return {
      plain,
      exitWound,
      bloomHits,
      bigIronFinal,
      launcherHits,
      focusedCluster,
      launcherFinal: api.getBossWeaponDiagnostics(),
    };
  });

  expect(result.exitWound.applied).toBeGreaterThan(result.plain.applied * 1.45);
  expect(result.bloomHits[3].applied).toBeGreaterThan(result.bloomHits[0].applied * 1.45);
  expect(result.bigIronFinal.bigIronSilverHits).toBe(0);
  expect(result.bigIronFinal.ammo.revolver).toBe(2);
  expect(result.launcherHits[1].applied).toBeGreaterThan(result.launcherHits[0].applied);
  expect(result.launcherFinal.launcherDirectHits).toBe(4);
  expect(result.launcherFinal.launcherSalvoHits).toBe(0);
  expect(result.launcherFinal.launcherMadmanStacks).toBe(2);
  expect(result.launcherFinal.ammo.launcher).toBe(2);
  expect(result.focusedCluster.applied).toBe(0);
});

test("Bombardier consolidates boss bomblets, shrapnel, echoes, and longer chains into reliable direct damage", async ({ page }) => {
  await openGame(page);

  const result = await page.evaluate(() => {
    const api = window.__dustAndDeadTest;

    const measureBranchDirectHit = (launcherUpgrade) => {
      api.startWaveNow(10, "landEater");
      api.configureBossWeaponBuildForTest({
        playerClass: "demolitionist",
        launcherUpgrade,
        weapon: "launcher",
        upgrades: [],
      });
      return api.damageActiveBossWithSourceForTest(8, {
        type: "launcherExplosion",
        kind: "main",
        directTarget: true,
      });
    };
    const pyrotechnicianDirect = measureBranchDirectHit("pyrotechnician");
    const bombardierDirect = measureBranchDirectHit("bombardier");

    api.startWaveNow(10, "landEater");
    api.configureBossWeaponBuildForTest({
      playerClass: "demolitionist",
      launcherUpgrade: "bombardier",
      weapon: "launcher",
      upgrades: [
        "clusterCharge",
        ...Array(5).fill("moreBomblets"),
        "chainDetonation",
        ...Array(8).fill("moreChainDetonations"),
        "shrapnelRain",
        "powderEcho",
      ],
    });
    const focusedDirectHits = [];
    for (let hit = 1; hit <= 6; hit += 1) {
      focusedDirectHits.push(api.damageActiveBossWithSourceForTest(8, {
        type: "launcherExplosion",
        kind: "main",
        directTarget: true,
        powderEcho: hit % 3 === 0,
      }));
    }
    const suppressedChildren = ["cluster", "echo", "chain"].map((kind) =>
      api.damageActiveBossWithSourceForTest(8, {
        type: "launcherExplosion",
        kind,
        bossFocusedTarget: true,
      })
    );
    suppressedChildren.push(api.damageActiveBossWithSourceForTest(8, {
      type: "launcherShrapnel",
      bossFocusedTarget: true,
    }));
    return {
      pyrotechnicianDirect,
      bombardierDirect,
      focusedDirectHits,
      suppressedChildren,
    };
  });

  expect(result.pyrotechnicianDirect.applied).toBeCloseTo(12.8, 3);
  expect(result.bombardierDirect.applied).toBeCloseTo(20.8, 3);
  expect(result.focusedDirectHits.map((entry) => entry.applied)).toEqual([
    28.96,
    35.12,
    34.56,
    35.12,
    28.96,
    40.72,
  ]);
  expect(result.suppressedChildren.every((entry) => entry.applied === 0)).toBe(true);
});

test("Bombardier destroys an Oil Baron derrick within one magazine while Pyrotechnician keeps ordinary blast damage", async ({ page }) => {
  await openGame(page);

  const result = await page.evaluate(() => {
    const api = window.__dustAndDeadTest;
    const multiplayer = window.__dustMultiplayerTest;
    const measureDerrick = (launcherUpgrade) => {
      api.startWaveNow(10, "oilBaron");
      api.configureBossWeaponBuildForTest({
        playerClass: "demolitionist",
        launcherUpgrade,
        weapon: "launcher",
        upgrades: [],
      });
      const opening = api.spawnOilDerrick(34, 34, {
        instant: true,
        silent: true,
        logicalOnly: true,
      });
      const target = opening.derricks[opening.derricks.length - 1];
      const hitDamage = [];
      let shots = 0;
      while (shots < 20) {
        const before = api.getOilBaronDiagnostics().derricks.find((entry) => entry.id === target.id);
        if (!before || before.destroyed) break;
        api.triggerLauncherExplosionAt(target.x, target.z, "main", 3.78, 4.8, {
          noAudio: true,
          noFire: true,
          noCluster: true,
          noShrapnel: true,
        });
        const after = api.getOilBaronDiagnostics().derricks.find((entry) => entry.id === target.id);
        hitDamage.push(before.hp - after.hp);
        shots += 1;
      }
      const closing = api.getOilBaronDiagnostics().derricks.find((entry) => entry.id === target.id);
      return {
        shots,
        hitDamage,
        destroyed: closing.destroyed,
        maxHp: target.maxHp,
      };
    };
    const measureGuestBombardier = () => {
      multiplayer.startMockHost(["Host", "Guest"]);
      const guest = multiplayer.getState().players[1];
      multiplayer.setProgression(guest.id, {
        playerClass: "demolitionist",
        launcherUpgrade: "bombardier",
        weapon: "launcher",
        ownedWeapons: { revolver: true, rifle: false, launcher: true, coachGun: false },
        upgradeCounts: {},
      });
      api.startWaveNow(10, "oilBaron");
      const opening = api.spawnOilDerrick(34, 34, {
        instant: true,
        silent: true,
        logicalOnly: true,
      });
      const target = opening.derricks[opening.derricks.length - 1];
      api.triggerLauncherExplosionAt(target.x, target.z, "main", 3.78, 4.8, {
        ownerPlayerId: guest.id,
        noAudio: true,
        noFire: true,
        noCluster: true,
        noShrapnel: true,
      });
      const closing = api.getOilBaronDiagnostics().derricks.find((entry) => entry.id === target.id);
      return {
        damage: target.hp - closing.hp,
        ownerId: guest.id,
      };
    };
    return {
      bombardier: measureDerrick("bombardier"),
      pyrotechnician: measureDerrick("pyrotechnician"),
      guestBombardier: measureGuestBombardier(),
    };
  });

  expect(result.bombardier.destroyed).toBe(true);
  expect(result.bombardier.shots).toBeLessThanOrEqual(6);
  expect(result.bombardier.hitDamage[0]).toBeCloseTo(15, 2);
  expect(result.pyrotechnician.destroyed).toBe(true);
  expect(result.pyrotechnician.shots).toBe(10);
  expect(result.pyrotechnician.hitDamage[0]).toBeCloseTo(6, 2);
  expect(result.guestBombardier.ownerId).toBe("mock-player-2");
  expect(result.guestBombardier.damage).toBeCloseTo(15, 2);
});

test("Pyrotechnician boss fire caps overlap per owner and never applies guest-side damage", async ({ page }) => {
  await openGame(page);

  const result = await page.evaluate(() => {
    const api = window.__dustAndDeadTest;
    const multiplayer = window.__dustMultiplayerTest;

    const measureSoloOverlap = (patchCount) => {
      api.startWaveNow(10, "landEater");
      api.configureBossWeaponBuildForTest({
        playerClass: "demolitionist",
        launcherUpgrade: "pyrotechnician",
        weapon: "launcher",
        upgrades: ["hotterFire", "hotterFire"],
      });
      api.clearFirePatchesForTest();
      const before = api.getBossWeaponDiagnostics();
      api.spawnBossFirePatchesForTest(patchCount, { damage: 3 });
      const after = api.advanceBossFireForTest(0.12);
      return {
        damage: Number((before.targetHp - after.targetHp).toFixed(3)),
        diagnostics: after,
      };
    };
    const singlePool = measureSoloOverlap(1);
    const tenPools = measureSoloOverlap(10);

    multiplayer.startMockHost(["Host", "Guest"]);
    const players = multiplayer.getState().players;
    const progression = {
      playerClass: "demolitionist",
      launcherUpgrade: "pyrotechnician",
      weapon: "launcher",
      upgradeCounts: { hotterFire: 2 },
    };
    multiplayer.setProgression(players[0].id, progression);
    multiplayer.setProgression(players[1].id, progression);
    api.startWaveNow(10, "landEater");
    api.clearFirePatchesForTest();
    const hostBefore = api.getBossWeaponDiagnostics();
    api.spawnBossFirePatchesForTest(1, { ownerPlayerId: players[0].id, damage: 3 });
    api.spawnBossFirePatchesForTest(1, { ownerPlayerId: players[1].id, damage: 3 });
    const hostAfter = api.advanceBossFireForTest(0.12);
    const hostDamage = Number((hostBefore.targetHp - hostAfter.targetHp).toFixed(3));
    const snapshot = multiplayer.buildSnapshot();

    multiplayer.startMockGuest(["Host", "Guest"], 1);
    multiplayer.applySnapshot(snapshot);
    const guestBefore = api.getBossWeaponDiagnostics();
    const guestAfter = api.advanceBossFireForTest(0.6);
    return {
      singlePool,
      tenPools,
      hostDamage,
      hostAfter,
      guestBefore,
      guestAfter,
    };
  });

  expect(result.singlePool.damage).toBeGreaterThan(0);
  expect(result.singlePool.diagnostics.bossFireMaxMultiplier).toBe(1);
  expect(result.tenPools.diagnostics.bossFireMaxPatchCount).toBe(10);
  expect(result.tenPools.diagnostics.bossFireMaxMultiplier).toBe(2);
  expect(result.tenPools.damage).toBeCloseTo(result.singlePool.damage * 2, 2);
  expect(result.hostAfter.bossFireOwners).toBe(2);
  expect(result.hostDamage).toBeCloseTo(result.hostAfter.bossFireLastDamage * 2, 2);
  expect(result.guestAfter.targetHp).toBe(result.guestBefore.targetHp);
  expect(result.guestAfter.bossFireOwners).toBe(0);
});

test("launcher blasts damage every Hordeheart form from the real outer flesh surface", async ({ page }) => {
  await openGame(page);

  const samples = await page.evaluate(() => {
    const api = window.__dustAndDeadTest;
    return ["whole", "halves", "quarters"].map((phase) => {
      api.startWaveNow(10, "hordeheart");
      api.forceHordeheartPhase(phase);
      api.configureBossWeaponBuildForTest({
        playerClass: "demolitionist",
        weapon: "launcher",
      });
      const opening = api.getHordeheartDiagnostics();
      const body = opening.bodies
        .filter((candidate) => candidate.active && !candidate.downed)
        .reduce((best, candidate) => {
          const distance = Math.hypot(
            candidate.x - opening.centerX,
            candidate.z - opening.centerZ,
          );
          return !best || distance > best.distance
            ? { ...candidate, distance }
            : best;
        }, null);
      let outwardX = body.x - opening.centerX;
      let outwardZ = body.z - opening.centerZ;
      let outwardLength = Math.hypot(outwardX, outwardZ);
      if (outwardLength < 0.001) {
        outwardX = 1;
        outwardZ = 0;
        outwardLength = 1;
      }
      const blastX = body.x + outwardX / outwardLength * body.radius;
      const blastZ = body.z + outwardZ / outwardLength * body.radius;
      api.triggerLauncherExplosionAt(blastX, blastZ, "main", 2.4, 10, {
        noAudio: true,
        noFire: true,
        noCluster: true,
        noShrapnel: true,
      });
      const closing = api.getHordeheartDiagnostics();
      const after = closing.bodies.find((candidate) => candidate.index === body.index);
      return {
        phase,
        radius: body.radius,
        centerDistance: Math.hypot(blastX - body.x, blastZ - body.z),
        damage: body.hp - after.hp,
      };
    });
  });

  expect(samples.map((sample) => sample.phase)).toEqual(["whole", "halves", "quarters"]);
  for (const sample of samples) {
    expect(sample.centerDistance).toBeCloseTo(sample.radius, 3);
    expect(sample.damage).toBeGreaterThanOrEqual(10);
  }
});

test("Pyrotechnician fire reaches the real outer surface of every Hordeheart form", async ({ page }) => {
  await openGame(page);

  const samples = await page.evaluate(() => {
    const api = window.__dustAndDeadTest;
    return ["whole", "halves", "quarters"].map((phase) => {
      api.startWaveNow(10, "hordeheart");
      api.forceHordeheartPhase(phase);
      api.configureBossWeaponBuildForTest({
        playerClass: "demolitionist",
        launcherUpgrade: "pyrotechnician",
        weapon: "launcher",
        upgrades: ["hotterFire", "hotterFire"],
      });
      api.clearFirePatchesForTest();
      const opening = api.getHordeheartDiagnostics();
      const body = opening.bodies
        .filter((candidate) => candidate.active && !candidate.downed)
        .reduce((best, candidate) => {
          const distance = Math.hypot(
            candidate.x - opening.centerX,
            candidate.z - opening.centerZ,
          );
          return !best || distance > best.distance
            ? { ...candidate, distance }
            : best;
        }, null);
      let outwardX = body.x - opening.centerX;
      let outwardZ = body.z - opening.centerZ;
      let outwardLength = Math.hypot(outwardX, outwardZ);
      if (outwardLength < 0.001) {
        outwardX = 1;
        outwardZ = 0;
        outwardLength = 1;
      }
      const surfaceX = body.x + outwardX / outwardLength * body.radius;
      const surfaceZ = body.z + outwardZ / outwardLength * body.radius;
      const patch = api.spawnFirePatchAt(surfaceX, surfaceZ, 2.4, 2);
      const beforeHp = body.hp;
      api.advanceBossFireForTest(0.12);
      const closing = api.getHordeheartDiagnostics();
      const after = closing.bodies.find((candidate) => candidate.index === body.index);
      return {
        phase,
        surfaceDistance: Math.max(
          0,
          Math.hypot(patch.x - body.x, patch.z - body.z) - body.radius,
        ),
        patchRadius: patch.radius,
        damage: beforeHp - after.hp,
      };
    });
  });

  expect(samples.map((sample) => sample.phase)).toEqual(["whole", "halves", "quarters"]);
  for (const sample of samples) {
    expect(sample.surfaceDistance).toBeLessThanOrEqual(sample.patchRadius + 0.05);
    expect(sample.damage).toBeGreaterThan(0);
  }
});

test("real contact and Heavy Payload grenades both hurt the whole Hordeheart without entering it", async ({ page }) => {
  await openGame(page);

  const result = await page.evaluate(() => {
    const api = window.__dustAndDeadTest;
    const multiplayer = window.__dustMultiplayerTest;
    const shootCase = (heavyPayload) => {
      api.startWaveNow(10, "hordeheart");
      api.forceHordeheartPhase("whole");
      api.configureBossWeaponBuildForTest({
        playerClass: "demolitionist",
        launcherUpgrade: heavyPayload ? "bombardier" : null,
        weapon: "launcher",
        upgrades: heavyPayload ? ["heavyPayload"] : [],
      });
      const opening = api.getHordeheartDiagnostics();
      const body = opening.bodies[0];
      const surfaceX = body.x - body.radius;
      const surfaceZ = body.z;
      const player = api.setPlayerPosition(surfaceX - 5, surfaceZ);
      api.setAimTarget(heavyPayload ? surfaceX : body.x, body.z);
      api.setAmmo("launcher", 3, 0);
      const beforeHp = api.getHordeheartDiagnostics().bodies[0].hp;
      const fired = api.shootOnce();
      for (let frame = 0; frame < 180 && multiplayer.getAuthoritativeBullets().length; frame += 1) {
        multiplayer.stepBullets(1 / 60);
      }
      const closing = api.getHordeheartDiagnostics();
      return {
        heavyPayload,
        fired,
        playerDistanceFromCenter: Math.hypot(player.x - body.x, player.z - body.z),
        radius: body.radius,
        damage: beforeHp - closing.bodies[0].hp,
        bulletsLeft: multiplayer.getAuthoritativeBullets().length,
      };
    };
    return [shootCase(false), shootCase(true)];
  });

  for (const sample of result) {
    expect(sample.fired).toBe(true);
    expect(sample.playerDistanceFromCenter).toBeGreaterThan(sample.radius + 4);
    expect(sample.damage).toBeGreaterThan(0);
    expect(sample.bulletsLeft).toBe(0);
  }
});

test("Pyrotechnician burn follows moving bosses and both Coach Gun branches gain boss sustain", async ({ page }) => {
  await openGame(page);

  const result = await page.evaluate(() => {
    const api = window.__dustAndDeadTest;

    api.startWaveNow(10, "landEater");
    api.configureBossWeaponBuildForTest({
      playerClass: "demolitionist",
      launcherUpgrade: "pyrotechnician",
      weapon: "launcher",
      upgrades: ["napalmShells", "hotterFire", "hotterFire"],
    });
    const thermiteHit = api.damageActiveBossWithSourceForTest(5, {
      type: "launcherExplosion",
      kind: "main",
      directTarget: true,
    });
    api.advanceBossWeaponStatusesForTest(0.25);
    const thermiteRefresh = api.damageActiveBossWithSourceForTest(5, {
      type: "launcherExplosion",
      kind: "main",
      directTarget: true,
    });
    const beforeBurn = api.getBossWeaponDiagnostics();
    const refreshedTick = api.advanceBossWeaponStatusesForTest(0.2);
    const duringBurn = api.advanceBossWeaponStatusesForTest(0.6);
    const afterBurn = api.advanceBossWeaponStatusesForTest(2.4);

    api.startWaveNow(10, "landEater");
    api.configureBossWeaponBuildForTest({
      playerClass: "marshal",
      marshalUpgrade: "breachMarshal",
      weapon: "coachGun",
      upgrades: [
        "doorKicker",
        "shellCatcher",
        "rideTheRecoil",
        "noTimeToBleed",
        "hardCast",
        "hardCast",
        "hardCast",
        "hardCast",
        "hardCast",
      ],
      ammoCurrent: 0,
    });
    const breachHits = [];
    for (let i = 0; i < 3; i += 1) {
      breachHits.push(api.resolveCoachGunBossVolleyForTest({ pellets: 10, distance: 3 }));
    }
    const breachFinal = api.getBossWeaponDiagnostics();

    api.startWaveNow(10, "landEater");
    api.configureBossWeaponBuildForTest({
      playerClass: "marshal",
      marshalUpgrade: "graveWarden",
      weapon: "coachGun",
      upgrades: [
        "graveTithe",
        "sanctifiedLead",
        "sanctifiedLead",
        "sanctifiedLead",
        "sanctifiedLead",
        "sanctifiedLead",
      ],
      ammoCurrent: 0,
    });
    const graveHits = [];
    for (let i = 0; i < 5; i += 1) {
      graveHits.push(api.resolveCoachGunBossVolleyForTest({ pellets: 8, distance: 6 }));
    }
    return {
      thermiteHit,
      thermiteRefresh,
      beforeBurn,
      refreshedTick,
      duringBurn,
      afterBurn,
      breachHits,
      breachFinal,
      graveHits,
      graveFinal: api.getBossWeaponDiagnostics(),
    };
  });

  expect(result.thermiteHit.applied).toBeGreaterThan(5);
  expect(result.thermiteRefresh.applied).toBeGreaterThan(5);
  expect(result.beforeBurn.thermiteBurns).toBe(1);
  expect(result.refreshedTick.targetHp).toBeLessThan(result.beforeBurn.targetHp);
  expect(result.duringBurn.targetHp).toBeLessThan(result.beforeBurn.targetHp);
  expect(result.afterBurn.thermiteBurns).toBe(0);
  expect(result.breachHits.every((entry) => entry.applied > 8)).toBe(true);
  expect(result.breachFinal.marshalBreachMomentumStacks).toBe(3);
  expect(result.breachFinal.marshalBreachMomentumTimer).toBeGreaterThan(2.8);
  expect(result.breachFinal.marshalBreachMoveMultiplier).toBeCloseTo(1.45, 2);
  expect(result.breachFinal.marshalGeneratedShells).toBe(1);
  expect(result.breachFinal.ammo.coachGun).toBe(1);
  expect(result.graveHits[1].applied).toBeGreaterThan(result.graveHits[0].applied * 1.25);
  expect(result.graveFinal.targetMarked).toBe(true);
  expect(result.graveFinal.targetMarkTimer).toBeGreaterThanOrEqual(9.9);
  expect(result.graveFinal.marshalGeneratedShells - result.breachFinal.marshalGeneratedShells).toBe(1);
  expect(result.graveFinal.ammo.coachGun).toBe(1);
});

test("boss weapon proc cosmetics replicate once and never calculate guest damage", async ({ page }) => {
  await openGame(page);

  const result = await page.evaluate(() => {
    const multiplayer = window.__dustMultiplayerTest;
    const game = window.__dustAndDeadTest;
    multiplayer.startMockHost(["Host", "Guest"]);
    const guest = multiplayer.getState().players[1];
    game.emitBossWeaponProcForTest("launcherCluster", guest.x, guest.z, 1.1);
    game.emitBossWeaponProcForTest("launcherShrapnel", guest.x + 0.4, guest.z, 0.96);
    game.emitBossWeaponProcForTest("launcherEcho", guest.x - 0.4, guest.z, 1.08);
    const snapshot = multiplayer.buildSnapshot();

    multiplayer.startMockGuest(["Host", "Guest"], 1);
    multiplayer.applySnapshot(snapshot);
    const first = multiplayer.getNetworkCombatDiagnostics();
    const replay = JSON.parse(JSON.stringify(snapshot));
    replay.sequence += 1;
    multiplayer.applySnapshot(replay);
    const second = multiplayer.getNetworkCombatDiagnostics();
    return { events: snapshot.combatEvents, first, second };
  });

  expect(result.events).toHaveLength(3);
  expect(result.events.every((event) => event.type === "bossWeaponProc")).toBe(true);
  expect(result.events.map((event) => event.kind)).toEqual([
    "launcherCluster",
    "launcherShrapnel",
    "launcherEcho",
  ]);
  expect(result.first.guestEvents).toHaveLength(3);
  expect(result.first.guestEvents.every((event) =>
    event.type === "bossWeaponProc" &&
    event.sound === null &&
    event.visuals > 0
  )).toBe(true);
  expect(result.second.guestEvents).toEqual(result.first.guestEvents);
});

test("Pale Deputy deals exactly half damage to bosses without changing its ordinary damage profile", async ({ page }) => {
  await openGame(page);

  const result = await page.evaluate(() => {
    const api = window.__dustAndDeadTest;
    const profile = api.getPaleDeputyDiagnostics();
    api.startWaveNow(10, "landEater");
    const baseline = api.damageActiveBossWithSourceForTest(12, { type: "test" });
    const deputy = api.damageActiveBossWithSourceForTest(12, {
      type: "paleDeputy",
      alliedSummon: true,
    });
    return { profile, baseline, deputy };
  });

  expect(result.profile.damage).toBe(5.76);
  expect(result.profile.bossDamage).toBe(2.88);
  expect(result.profile.bossDamageMultiplier).toBe(0.5);
  expect(result.baseline.applied).toBe(12);
  expect(result.deputy.applied).toBe(6);
  expect(result.deputy.applied / result.baseline.applied).toBe(0.5);
});
