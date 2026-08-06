// What a backfill bot's steering can actually see of each boss's attacks.
//
// Every case stages a real attack through the game's own forcing hooks and then
// samples the hazard field on a grid. Two things are asserted: that the model
// sees the attack at all (it saw four of the six bosses not at all before), and
// that a lane-shaped attack produces a LANE-shaped danger region. The second is
// the whole mechanism — a bot leaves an attack sideways because the field is
// long and thin, not because anything tells it to.
const path = require("node:path");
const { expect, test } = require("@playwright/test");

function fileUrl(relativePath) {
  const absolute = path.resolve(__dirname, "..", relativePath).replace(/\\/g, "/");
  return `file:///${absolute}`;
}

async function openWave(page, wave, bossKind) {
  await page.goto(`${fileUrl("index.html")}?mapSeed=7331`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Boolean(
    window.__dustAndDeadTest && window.__dustMultiplayerTest && window.render_game_to_text
  ));
  const intro = page.locator("#intro-screen");
  if (await intro.isVisible().catch(() => false)) await page.keyboard.press("KeyM");
  await page.getByRole("button", { name: "Start Hunt" }).click();
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).mode === "playing");
  await page.evaluate((args) => {
    const game = window.__dustAndDeadTest;
    game.setAutomaticFrameLoopModeForTest("paused");
    game.forceWaveState(args.wave, 0, 0, args.bossKind);
    game.clearEnemies();
  }, { wave, bossKind });
}

// Every point within `span` of a centre that the bot model considers unsafe.
// The centre defaults to the player, who is what these attacks aim at.
function sampleHazardField(page, span, step, centre) {
  return page.evaluate((args) => {
    const multi = window.__dustMultiplayerTest;
    const world = JSON.parse(window.render_game_to_text());
    const centreX = args.centre ? args.centre.x : world.player.x;
    const centreZ = args.centre ? args.centre.z : world.player.z;
    const points = [];
    for (let dx = -args.span; dx <= args.span; dx += args.step) {
      for (let dz = -args.span; dz <= args.span; dz += args.step) {
        const x = centreX + dx;
        const z = centreZ + dz;
        if (multi.getBossHazardPenaltyForTest(x, z) > 0) points.push([x, z]);
      }
    }
    return points;
  }, { span, step, centre: centre || null });
}

// How elongated the danger region is: the spread along its own long axis
// divided by the spread across it. A disc is about 1; a lane is several.
function aspectRatio(points) {
  const count = points.length;
  if (count < 3) return 0;
  let meanX = 0;
  let meanZ = 0;
  for (const [x, z] of points) {
    meanX += x;
    meanZ += z;
  }
  meanX /= count;
  meanZ /= count;
  let xx = 0;
  let zz = 0;
  let xz = 0;
  for (const [x, z] of points) {
    const dx = x - meanX;
    const dz = z - meanZ;
    xx += dx * dx;
    zz += dz * dz;
    xz += dx * dz;
  }
  xx /= count;
  zz /= count;
  xz /= count;
  const trace = xx + zz;
  const gap = Math.sqrt(Math.max(0, (xx - zz) * (xx - zz) + 4 * xz * xz));
  const major = (trace + gap) / 2;
  const minor = (trace - gap) / 2;
  if (minor <= 1e-6) return Infinity;
  return Math.sqrt(major / minor);
}

test("the Bell Ringer's ground slam reads as a lane, and his sweep as a disc", async ({ page }) => {
  await openWave(page, 10, "bellRinger");

  const boss = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    game.setBellRingerAiEnabled(false);
    game.forceBellRingerAction("groundSlam");
    return game.getBellRingerDiagnostics().bossPosition;
  });
  // Centred on the boss: his lane starts at his feet and runs seventeen units
  // out, which need not be anywhere near the player.
  const slam = await sampleHazardField(page, 26, 1, boss);
  expect(slam.length).toBeGreaterThan(0);
  // The slam is the fattest lane in the game — seventeen long by seven wide,
  // and the model pads it by a player's radius on each side — so its honest
  // ratio is under two. A disc still cannot reach this.
  expect(aspectRatio(slam)).toBeGreaterThan(1.5);

  const sweepBoss = await page.evaluate(() => {
    window.__dustAndDeadTest.forceBellRingerAction("sweep");
    return window.__dustAndDeadTest.getBellRingerDiagnostics().bossPosition;
  });
  const sweep = await sampleHazardField(page, 26, 1, sweepBoss);
  expect(sweep.length).toBeGreaterThan(0);
  // A disc around the boss: no long axis to run down.
  expect(aspectRatio(sweep)).toBeLessThan(1.25);
});

test("a Ghost Train cannon warning is visible and lane-shaped", async ({ page }) => {
  await openWave(page, 15, "ghostTrain");
  const before = await sampleHazardField(page, 30, 1.5);
  expect(before.length).toBe(0);

  await page.evaluate(() => {
    window.__dustAndDeadTest.forceGhostTrainAction("broadside");
    window.__dustAndDeadTest.advanceGhostTrain(700);
  });
  const armed = await sampleHazardField(page, 30, 1.5);
  // Before this change the Ghost Train contributed nothing at all: no branch in
  // the hazard model, and its shells live outside state.bullets so even the
  // generic bullet dodge could not see them.
  expect(armed.length).toBeGreaterThan(0);
  expect(aspectRatio(armed)).toBeGreaterThan(2);
});

test("the Oil Baron's cane sweep reads as a lane", async ({ page }) => {
  await openWave(page, 20, "oilBaron");
  await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    game.setOilBaronAiEnabled(false);
    game.forceOilBaronAction("caneWindup");
  });
  const cane = await sampleHazardField(page, 30, 1);
  expect(cane.length).toBeGreaterThan(0);
  expect(aspectRatio(cane)).toBeGreaterThan(2);
});

test("the Land Eater's burrow is scored along the trench, not just at its end", async ({ page }) => {
  await openWave(page, 25, "landEater");
  await page.evaluate(() => window.__dustAndDeadTest.forceLandEaterAction("burrow"));
  const burrow = await sampleHazardField(page, 34, 1.5);
  expect(burrow.length).toBeGreaterThan(0);
  // Only the end point used to be modelled, which is a circle — the trench it
  // ploughs through scored zero for its whole length.
  expect(aspectRatio(burrow)).toBeGreaterThan(2);
});

// Hordeheart is deliberately not covered here. Its flesh trails are laid by an
// action EVENT, and neither forceHordeheartAttack + advanceHordeheart nor
// seekHordeheartAction reaches that event from a test — measured over 3.2 s of
// stepped advancing, attackHazards stayed empty. The shape fix it received (a
// capsule from source to target instead of a circle on the target alone) mirrors
// the authority's own isPlayerInsideHordeheartHazard, which is the strongest
// check available without a hook that can stage a live hazard.
