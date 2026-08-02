const path = require("node:path");
const { expect, test } = require("@playwright/test");

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
  await page.waitForFunction(() => Boolean(
    window.__dustAndDeadTest?.getOilBaronDiagnostics
      && window.__dustAndDeadTest?.forceOilBaronAction
      && window.__dustAndDeadTest?.advanceOilBaron
  ));
}

async function startBaron(page) {
  return page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    game.startWaveNow(10, "oilBaron");
    game.clearEnemies();
    game.setOilBaronAiEnabled(false);
    return game.getOilBaronDiagnostics();
  });
}

function poseDistance(first, second) {
  const partNames = ["rig", "torsoRig", "leftArm", "rightArm", "caneGrip", "headRig"];
  let distance = 0;
  for (const partName of partNames) {
    const firstPart = first.parts[partName];
    const secondPart = second.parts[partName];
    for (const property of ["position", "rotation", "scale"]) {
      for (const axis of ["x", "y", "z"]) {
        distance += Math.abs(firstPart[property][axis] - secondPart[property][axis]);
      }
    }
  }
  return distance;
}

test("Oil Baron's cigar projects naturally from the corner of his mouth", async ({ page }) => {
  await startHunt(page);
  await startBaron(page);

  const parts = await page.evaluate(() => window.__dustAndDeadTest.getOilBaronDiagnostics().animation.parts);
  const cigar = parts.cigar;
  const ember = parts.cigarEmber;
  const direction = {
    x: -Math.sin(cigar.rotation.z),
    y: Math.cos(cigar.rotation.z) * Math.cos(cigar.rotation.x),
    z: Math.cos(cigar.rotation.z) * Math.sin(cigar.rotation.x),
  };
  const mouthEnd = {
    x: cigar.position.x - direction.x * 0.37,
    y: cigar.position.y - direction.y * 0.37,
    z: cigar.position.z - direction.z * 0.37,
  };
  const litTip = {
    x: cigar.position.x + direction.x * 0.37,
    y: cigar.position.y + direction.y * 0.37,
    z: cigar.position.z + direction.z * 0.37,
  };

  expect(direction.z).toBeGreaterThan(0.95);
  expect(Math.abs(direction.x)).toBeLessThan(0.25);
  expect(mouthEnd.z).toBeGreaterThan(0.62);
  expect(mouthEnd.z).toBeLessThan(0.74);
  expect(Math.hypot(
    litTip.x - ember.position.x,
    litTip.y - ember.position.y,
    litTip.z - ember.position.z,
  )).toBeLessThan(0.05);
});

test("Oil Baron combat and deal poses advance with AI disabled and remain distinct", async ({ page }) => {
  await startHunt(page);
  await startBaron(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const boss = game.getOilBaronDiagnostics().boss;
    game.spawnOilDerrick(boss.x + 6, boss.z, {
      instant: true,
      silent: true,
      oilRadius: 7,
      oilAge: 8,
    });

    const idle = game.getOilBaronDiagnostics().animation;

    const caneStart = game.forceOilBaronAction("cane").animation;
    const cane = game.advanceOilBaron(500).animation;
    const caneRecover = game.advanceOilBaron(600).animation;
    const caneIdle = game.advanceOilBaron(500).animation;

    const plantStart = game.forceOilBaronAction("plant").animation;
    const plant = game.advanceOilBaron(690).animation;
    const plantRecover = game.advanceOilBaron(280).animation;
    const plantIdle = game.advanceOilBaron(600).animation;

    const igniteStart = game.forceOilBaronAction("ignite").animation;
    const ignite = game.advanceOilBaron(500).animation;
    const igniteRecover = game.advanceOilBaron(250).animation;
    const igniteIdle = game.advanceOilBaron(400).animation;

    game.forceOilBaronAction("offer");
    const offer = game.advanceOilBaron(300).animation;

    return {
      idle,
      caneStart,
      cane,
      caneRecover,
      caneIdle,
      plantStart,
      plant,
      plantRecover,
      plantIdle,
      igniteStart,
      ignite,
      igniteRecover,
      igniteIdle,
      offer,
    };
  });

  expect(result.caneStart).toMatchObject({ action: "caneWindup", progress: 0, allFinite: true });
  expect(result.cane.progress).toBeGreaterThan(0.4);
  expect(result.cane.progress).toBeLessThan(0.6);
  expect(result.cane.timeLeft).toBeLessThan(result.caneStart.timeLeft);
  expect(result.caneRecover).toMatchObject({ action: "recover", recoverFrom: "caneWindup", allFinite: true });
  expect(result.caneIdle.action).toBe("idle");

  expect(result.plantStart).toMatchObject({ action: "plantWindup", progress: 0, allFinite: true });
  expect(result.plant.progress).toBeGreaterThan(0.68);
  expect(result.plant.progress).toBeLessThan(0.82);
  expect(result.plantRecover).toMatchObject({ action: "recover", recoverFrom: "plantWindup", allFinite: true });
  expect(result.plantRecover.duration).toBeCloseTo(0.56, 2);
  expect(result.plantIdle.action).toBe("idle");

  expect(result.igniteStart).toMatchObject({ action: "igniteWindup", progress: 0, allFinite: true });
  expect(result.ignite.progress).toBeGreaterThan(0.62);
  expect(result.ignite.progress).toBeLessThan(0.78);
  expect(result.igniteRecover).toMatchObject({ action: "recover", recoverFrom: "igniteWindup", allFinite: true });
  expect(result.igniteIdle.action).toBe("idle");

  for (const frame of Object.values(result)) expect(frame.allFinite).toBe(true);
  expect(poseDistance(result.cane, result.plant)).toBeGreaterThan(0.5);
  expect(poseDistance(result.cane, result.ignite)).toBeGreaterThan(0.5);
  expect(poseDistance(result.plant, result.ignite)).toBeGreaterThan(0.5);

  expect(Math.abs(result.cane.parts.rightArm.rotation.x - result.idle.parts.rightArm.rotation.x)).toBeGreaterThan(0.25);
  expect(Math.abs(result.plant.parts.rig.position.y - result.idle.parts.rig.position.y)).toBeGreaterThan(0.15);
  expect(Math.abs(result.ignite.parts.leftArm.rotation.x - result.idle.parts.leftArm.rotation.x)).toBeGreaterThan(0.45);
  expect(result.offer).toMatchObject({ action: "offer", allFinite: true });
  expect(result.offer.offerPoseBlend).toBeGreaterThan(0.75);
  expect(result.offer.parts.offerAura.visible).toBe(true);
  expect(Math.abs(result.offer.parts.leftArm.rotation.x - result.idle.parts.leftArm.rotation.x)).toBeGreaterThan(0.55);
});

test("Oil Baron oil-star animation reads as a coated, airborne star with a weighted landing", async ({ page }) => {
  await startHunt(page);
  await startBaron(page);

  const frames = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const idle = game.getOilBaronDiagnostics();
    const start = game.forceOilBaronAction("star");
    const soak = game.advanceOilBaron(900);
    const flight = game.advanceOilBaron(1100);
    const landing = game.advanceOilBaron(430);
    const nextBounce = game.advanceOilBaron(720);
    const finished = game.advanceOilBaron(7000);
    return { idle, start, soak, flight, landing, nextBounce, finished };
  });

  expect(frames.start.animation).toMatchObject({ action: "oilStar", allFinite: true });
  for (const frame of [frames.soak, frames.flight, frames.landing, frames.nextBounce]) {
    expect(frame.animation).toMatchObject({ action: "oilStar", allFinite: true });
    expect(frame.starAttack.coatingVisible).toBe(true);
  }
  expect(frames.start.boss.invulnerable).toBe(true);
  expect(frames.soak.starAttack.oilBlend).toBeGreaterThan(0.6);
  expect(frames.soak.starAttack).toMatchObject({ pourStreams: 6, pourVisible: true });
  expect(frames.flight.boss.starVisualY).toBeGreaterThan(4);
  expect(frames.flight.animation.parts.rig.position.y).toBeGreaterThan(4);
  expect(Math.abs(frames.flight.animation.parts.leftArm.rotation.z - frames.idle.animation.parts.leftArm.rotation.z)).toBeGreaterThan(0.7);
  expect(Math.abs(frames.flight.animation.parts.rightArm.rotation.z - frames.idle.animation.parts.rightArm.rotation.z)).toBeGreaterThan(0.7);
  expect(frames.flight.starAttack.telegraphVisible).toBe(true);
  expect(frames.landing.boss.starVisualY).toBeLessThan(frames.flight.boss.starVisualY);
  expect(frames.nextBounce.starAttack.jumpIndex).toBeGreaterThanOrEqual(1);
  expect(frames.finished.boss).toMatchObject({ action: "idle", invulnerable: false });
  expect(frames.finished.starAttack.coatingVisible).toBe(false);
});

test("Oil Baron ground slam has a readable hoist, heavy impact, and weighted recovery", async ({ page }) => {
  await startHunt(page);
  await startBaron(page);

  const frames = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const boss = game.getOilBaronDiagnostics().boss;
    game.setPlayerPosition(boss.x + 10, boss.z);
    const idle = game.getOilBaronDiagnostics();
    const start = game.forceOilBaronAction("slam");
    const hoist = game.advanceOilBaron(450);
    const impact = game.advanceOilBaron(400);
    const recover = game.advanceOilBaron(450);
    const finished = game.advanceOilBaron(700);
    return { idle, start, hoist, impact, recover, finished };
  });

  for (const frame of Object.values(frames)) expect(frame.animation.allFinite).toBe(true);
  expect(frames.start).toMatchObject({
    boss: { action: "groundSlam" },
    groundSlam: { active: true, resolved: false, telegraphVisible: true },
  });
  expect(frames.hoist.groundSlam.telegraphVisible).toBe(true);
  expect(frames.impact.groundSlam).toMatchObject({ resolved: true, telegraphVisible: false });
  expect(frames.recover.animation).toMatchObject({ action: "recover", recoverFrom: "groundSlam" });
  expect(frames.finished.boss.action).toBe("idle");
  expect(Math.abs(
    frames.hoist.animation.parts.rightArm.rotation.x
      - frames.impact.animation.parts.rightArm.rotation.x,
  )).toBeGreaterThan(0.8);
  expect(frames.impact.animation.parts.rig.position.y).toBeLessThan(frames.idle.animation.parts.rig.position.y - 0.2);
  expect(frames.impact.animation.parts.rig.scale.y).toBeLessThan(frames.idle.animation.parts.rig.scale.y);
  expect(poseDistance(frames.hoist.animation, frames.impact.animation)).toBeGreaterThan(2);
});

test("Oil Baron guest derives gait and hit reaction from authoritative snapshots", async ({ page, context }) => {
  const guest = await context.newPage();
  try {
    await startHunt(page);
    await startHunt(guest);

    const initial = await page.evaluate(() => {
      const game = window.__dustAndDeadTest;
      const multi = window.__dustMultiplayerTest;
      multi.startMockHost(["Host", "Guest"]);
      game.startWaveNow(10, "oilBaron");
      game.clearEnemies();
      game.setOilBaronAiEnabled(false);
      return {
        diagnostics: game.getOilBaronDiagnostics(),
        snapshot: multi.buildWireSnapshot(true, true, "mock-player-2"),
      };
    });

    const guestInitial = await guest.evaluate((snapshot) => {
      const multi = window.__dustMultiplayerTest;
      multi.startMockGuest(["Host", "Guest"], 1);
      multi.applySnapshot(snapshot);
      return window.__dustAndDeadTest.getOilBaronDiagnostics();
    }, initial.snapshot);
    expect(guestInitial).toMatchObject({ replica: true, defeated: false });

    const moved = await page.evaluate(() => {
      const game = window.__dustAndDeadTest;
      const multi = window.__dustMultiplayerTest;
      const before = game.getOilBaronDiagnostics();
      const direction = before.boss.x < 0 ? 1 : -1;
      const targetX = before.boss.x + direction * 28;
      multi.setPlayerPosition("mock-player-1", targetX, before.boss.z);
      multi.setPlayerPosition("mock-player-2", targetX, before.boss.z);
      game.setOilBaronAiEnabled(true);
      const after = game.advanceOilBaron(700);
      game.setOilBaronAiEnabled(false);
      return {
        before,
        after,
        snapshot: multi.buildWireSnapshot(true, true, "mock-player-2"),
      };
    });
    const hostDistance = Math.hypot(
      moved.after.boss.x - moved.before.boss.x,
      moved.after.boss.z - moved.before.boss.z,
    );
    expect(hostDistance).toBeGreaterThan(0.5);
    expect(hostDistance).toBeLessThan(9);

    const guestMotion = await guest.evaluate((snapshot) => {
      const game = window.__dustAndDeadTest;
      window.__dustMultiplayerTest.applySnapshot(snapshot);
      const before = game.getOilBaronDiagnostics();
      const samples = [];
      for (let sample = 0; sample < 8; sample += 1) samples.push(game.advanceOilBaron(50));
      return { before, samples, after: samples[samples.length - 1] };
    }, moved.snapshot);
    expect(guestMotion.samples.every((sample) => sample.animation.allFinite)).toBe(true);
    expect(Math.max(...guestMotion.samples.map((sample) => sample.animation.moveAmount))).toBeGreaterThan(0.15);
    expect(guestMotion.after.animation.walkPhase - guestMotion.before.animation.walkPhase).toBeGreaterThan(0.25);
    expect(Math.hypot(
      guestMotion.after.boss.x - guestMotion.before.boss.x,
      guestMotion.after.boss.z - guestMotion.before.boss.z,
    )).toBeGreaterThan(0.25);

    const damaged = await page.evaluate(() => {
      const game = window.__dustAndDeadTest;
      const multi = window.__dustMultiplayerTest;
      const hpBefore = game.getOilBaronDiagnostics().boss.hp;
      const applied = game.damageOilBaron(30, true, "mock-player-1");
      return {
        hpBefore,
        applied,
        diagnostics: game.getOilBaronDiagnostics(),
        snapshot: multi.buildWireSnapshot(true, true, "mock-player-2"),
      };
    });
    expect(damaged.applied).toBeGreaterThan(0);
    expect(damaged.diagnostics.boss.hp).toBeLessThan(damaged.hpBefore);

    const guestHit = await guest.evaluate((snapshot) => {
      const game = window.__dustAndDeadTest;
      window.__dustMultiplayerTest.applySnapshot(snapshot);
      const immediate = game.getOilBaronDiagnostics();
      const decayed = game.advanceOilBaron(100);
      return { immediate, decayed };
    }, damaged.snapshot);
    expect(guestHit.immediate.boss.hp).toBe(damaged.diagnostics.boss.hp);
    expect(guestHit.immediate.animation.hitPulse).toBeGreaterThan(0.8);
    expect(guestHit.decayed.animation.hitPulse).toBeGreaterThan(0);
    expect(guestHit.decayed.animation.hitPulse).toBeLessThan(guestHit.immediate.animation.hitPulse);
    expect(guestHit.immediate.animation.allFinite).toBe(true);
    expect(guestHit.decayed.animation.allFinite).toBe(true);
  } finally {
    await guest.close();
  }
});

test("Oil Baron death pose progresses through pressure, collapse, and impact without invalid transforms", async ({ page }) => {
  await startHunt(page);
  await startBaron(page);

  const stages = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    game.damageOilBaron(99999, true);
    const start = game.getOilBaronDiagnostics();
    const pressure = game.advanceOilBaron(850);
    const collapse = game.advanceOilBaron(1650);
    const impact = game.advanceOilBaron(1700);
    return { start, pressure, collapse, impact };
  });

  for (const stage of Object.values(stages)) {
    expect(stage.defeated).toBe(true);
    expect(stage.animation).toMatchObject({ action: "defeated", allFinite: true });
  }
  expect(Math.abs(
    stages.pressure.animation.parts.gaugeNeedle.rotation.z
      - stages.start.animation.parts.gaugeNeedle.rotation.z,
  )).toBeGreaterThan(0.2);
  expect(Math.abs(stages.collapse.animation.parts.rig.rotation.z)).toBeGreaterThan(0.25);
  expect(Math.abs(
    stages.impact.animation.parts.hatRig.position.x
      - stages.start.animation.parts.hatRig.position.x,
  )).toBeGreaterThan(0.4);
  expect(stages.impact.animation.parts.rig.scale.y).toBeLessThan(stages.start.animation.parts.rig.scale.y);
});
