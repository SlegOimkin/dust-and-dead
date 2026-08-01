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
    window.__dustAndDeadTest?.startWaveNow &&
    window.__dustAndDeadTest?.getBossRotationDiagnostics
  ));
}

test("bosses appear every five waves from wave 5 and rotate through a non-repeating random bag", async ({ page }) => {
  await startHunt(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const initialRotation = game.getBossRotationDiagnostics();
    const poolSize = initialRotation.pool.length;
    const normalWaves = [1, 4, 6, 9, 11].map((wave) => {
      const started = game.startWaveNow(wave, "random");
      return {
        wave: started.wave,
        kind: started.wave10BossKind,
        rotation: game.getBossRotationDiagnostics(),
      };
    });
    const bossWaves = Array.from(
      { length: poolSize * 2 + 1 },
      (_, index) => 5 + index * 5
    ).map((wave) => {
      const started = game.startWaveNow(wave, "random");
      return {
        wave: started.wave,
        kind: started.wave10BossKind,
        rotation: game.getBossRotationDiagnostics(),
      };
    });
    const finalRotation = game.getBossRotationDiagnostics();
    window.__dustMultiplayerTest.startMockHost(["Host", "Guest"]);
    const resetRotation = game.getBossRotationDiagnostics();
    return { initialRotation, normalWaves, bossWaves, finalRotation, resetRotation };
  });

  expect(result.initialRotation.pool).toEqual([
    "bellRinger",
    "ghostTrain",
    "oilBaron",
    "slothArchbishop",
    "hordeheart",
    "landEater",
  ]);
  const poolSize = result.initialRotation.pool.length;
  expect(result.normalWaves.map((entry) => entry.kind)).toEqual(["", "", "", "", ""]);
  expect(result.normalWaves.every((entry) => entry.rotation.bossWave === false)).toBe(true);
  expect(result.bossWaves.map((entry) => entry.wave)).toEqual(
    Array.from({ length: poolSize * 2 + 1 }, (_, index) => 5 + index * 5)
  );
  expect(result.bossWaves.every((entry) => entry.kind.length > 0 && entry.rotation.bossWave)).toBe(true);

  const kinds = result.bossWaves.map((entry) => entry.kind);
  expect(kinds[0]).not.toBe("landEater");
  expect(new Set(kinds.slice(0, poolSize)).size).toBe(poolSize);
  expect(new Set(kinds.slice(poolSize, poolSize * 2)).size).toBe(poolSize);
  for (let index = 1; index < kinds.length; index += 1) {
    expect(kinds[index]).not.toBe(kinds[index - 1]);
  }
  expect(result.finalRotation).toMatchObject({
    firstWave: 5,
    interval: 5,
    cycle: 3,
  });
  expect(result.finalRotation.remaining).toHaveLength(poolSize - 1);
  expect(result.resetRotation).toMatchObject({ cycle: 1, lastKind: "" });
  expect(result.resetRotation.remaining).toHaveLength(poolSize);
});

test("a later boss wave waits for its boss death and then advances to the following wave", async ({ page }) => {
  await startHunt(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    game.startWaveNow(15, "bellRinger");
    const maxHp = game.getBellRingerDiagnostics().maxHp;
    for (let cycle = 0; cycle < 4; cycle += 1) {
      game.completeBellChurchCapture(0);
      game.completeBellChurchCapture(1);
      game.completeBellChurchCapture(2);
      game.damageBellRinger(maxHp * 10);
    }
    const defeated = game.getBellRingerDiagnostics();
    const progressed = game.advanceWaveProgress(10000);
    const world = JSON.parse(window.render_game_to_text());
    return { defeated, progressed, world };
  });

  expect(result.defeated).toMatchObject({ defeated: true });
  expect(result.progressed.wave).toBe(16);
  expect(result.world).toMatchObject({
    wave: 16,
    wave10BossKind: "",
    bossRotation: { bossWave: false },
  });
});

test("the host alone chooses a later-wave boss and the guest receives that exact encounter", async ({ page }) => {
  await startHunt(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const multiplayer = window.__dustMultiplayerTest;
    multiplayer.startMockHost(["Host", "Guest"]);
    const hostWave = game.startWaveNow(20, "random");
    const hostRotation = game.getBossRotationDiagnostics();
    const wire = JSON.parse(JSON.stringify(multiplayer.buildWireSnapshot(false, false, "mock-player-2")));
    const decodedBoss = multiplayer.decodeBossState(wire.bossState);

    multiplayer.startMockGuest(["Host", "Guest"], 1);
    const guestRotationBefore = game.getBossRotationDiagnostics();
    multiplayer.applySnapshot(wire);
    const guestWorld = JSON.parse(window.render_game_to_text());
    const guestRotationAfter = game.getBossRotationDiagnostics();
    return {
      hostWave,
      hostRotation,
      decodedKind: decodedBoss && decodedBoss.kind,
      guestRotationBefore,
      guestRotationAfter,
      guestWorld,
    };
  });

  expect(result.hostWave.wave).toBe(20);
  expect(result.hostWave.wave10BossKind).toBe(result.decodedKind);
  expect(result.guestWorld).toMatchObject({
    wave: 20,
    wave10BossKind: result.hostWave.wave10BossKind,
    bossRotation: { bossWave: true },
  });
  const poolSize = result.guestRotationBefore.pool.length;
  expect(result.guestRotationBefore.remaining).toHaveLength(poolSize);
  expect(result.guestRotationAfter.remaining).toHaveLength(poolSize);
  expect(result.guestRotationAfter.lastKind).toBe("");
});
