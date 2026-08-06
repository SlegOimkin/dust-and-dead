const path = require("node:path");
const { expect, test } = require("@playwright/test");

function fileUrl(relativePath) {
  const absolute = path.resolve(__dirname, "..", relativePath).replace(/\\/g, "/");
  return `file:///${absolute}`;
}

async function openGame(page, viewport = { width: 1280, height: 720 }) {
  await page.setViewportSize(viewport);
  await page.goto(`${fileUrl("index.html")}?mapSeed=7463`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForFunction(() => Boolean(
    window.__dustAndDeadTest &&
    window.DustAndDeadProgression &&
    window.render_game_to_text
  ));
  const intro = page.locator("#intro-screen");
  if (await intro.isVisible().catch(() => false)) {
    await page.keyboard.press("KeyM");
    await expect(intro).toBeHidden();
  }
}

async function startFreshHunt(page) {
  await page.evaluate(() => window.__dustAndDeadTest.resetMetaProgression());
  await page.locator("#start-btn").click();
  await expect.poll(() => page.evaluate(() => JSON.parse(window.render_game_to_text()).mode))
    .toBe("playing");
}

test("pause exit requires confirmation and keeps the live hunt intact until accepted", async ({ page }) => {
  await openGame(page);
  await startFreshHunt(page);

  const before = await page.evaluate(() => JSON.parse(window.render_game_to_text()));
  await page.locator("#pause-menu-btn").click();
  await expect(page.locator("#pause-menu")).toBeVisible();
  await expect(page.locator("#pause-continue-btn")).toBeFocused();

  await page.locator("#pause-exit-btn").click();
  await expect(page.locator("#pause-exit-confirm-panel")).toHaveClass(/is-visible/);
  await expect(page.locator("#pause-main-panel")).not.toHaveClass(/is-visible/);
  await expect(page.locator("#pause-exit-cancel-btn")).toBeFocused();
  await expect(page.locator(".pause-menu__panel")).toHaveAttribute(
    "aria-labelledby",
    "pause-exit-confirm-title"
  );
  await expect(page.locator(".pause-menu__panel")).toHaveAttribute(
    "aria-describedby",
    "pause-exit-confirm-description"
  );

  const awaitingConfirmation = await page.evaluate(() => JSON.parse(window.render_game_to_text()));
  expect(awaitingConfirmation.mode).toBe("playing");
  expect(awaitingConfirmation.paused).toBe(true);
  expect(awaitingConfirmation.map.seed).toBe(before.map.seed);
  expect(awaitingConfirmation.wave).toBe(before.wave);

  await page.keyboard.press("Tab");
  await expect(page.locator("#pause-exit-confirm-btn")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.locator("#pause-main-panel")).toHaveClass(/is-visible/);
  await expect(page.locator("#pause-exit-btn")).toBeFocused();
  expect((await page.evaluate(() => JSON.parse(window.render_game_to_text()))).paused).toBe(true);

  await page.locator("#pause-exit-btn").click();
  await page.locator("#pause-exit-cancel-btn").click();
  await expect(page.locator("#pause-main-panel")).toHaveClass(/is-visible/);
  await expect(page.locator("#pause-exit-btn")).toBeFocused();

  await page.locator("#pause-exit-btn").click();
  await page.locator("#pause-close-btn").click();
  await expect(page.locator("#pause-main-panel")).toHaveClass(/is-visible/);
  await expect(page.locator("#pause-menu")).toBeVisible();
  await expect(page.locator("#pause-exit-btn")).toBeFocused();

  await page.locator("#pause-exit-btn").click();
  await page.locator("#pause-exit-confirm-btn").click();
  await expect(page.locator("#pause-menu")).toBeHidden();
  await expect(page.locator("#menu")).toBeVisible();
  await expect(page.locator("#start-btn")).toBeFocused();
  const after = await page.evaluate(() => JSON.parse(window.render_game_to_text()));
  expect(after.mode).toBe("menu");
  expect(after.paused).toBe(false);
  expect(after.map.seed).not.toBe(before.map.seed);
});

test("game over freezes a complete run receipt and keeps it localized", async ({ page }) => {
  await openGame(page);
  await startFreshHunt(page);

  const expectedChallengeTitle = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const progression = window.DustAndDeadProgression;
    for (let index = 0; index < 10; index += 1) {
      progression.recordSoloKill("walker", "revolver");
    }
    progression.recordSoloBoss("bellRinger");
    progression.recordSoloWave(3);
    const challenge = progression.getChallenges()[0];
    progression.recordChallengeCompleted(challenge.id);
    game.setSoloRunSummaryStatsForTest({
      time: 65.9,
      wave: 4,
      level: 6,
      score: 1234,
      kills: 10,
    });
    game.forceSinglePlayerGameOver();
    return challenge.title;
  });

  await expect(page.locator("#game-over")).toBeVisible();
  await expect(page.locator("#restart-btn")).toBeFocused();
  await expect(page.locator("#game-over-stats")).toContainText("Wave 4");
  await expect(page.locator("#game-over-stats")).toContainText("Score 1,234");
  await expect(page.locator("#game-over-duration")).toHaveText("1:05");
  await expect(page.locator("#game-over-dust")).toHaveText("+54.50");
  await expect(page.locator("#game-over-bosses")).toHaveText("1");
  await expect(page.locator("#game-over-bosses-detail")).toContainText("BELL RINGER");
  await expect(page.locator("#game-over-best-wave")).toHaveText("3");
  await expect(page.locator("#game-over-new-record")).toBeVisible();
  await expect(page.locator("#game-over-milestones-list")).toContainText(expectedChallengeTitle);
  await expect(page.locator("#game-over-next-unlock-name")).not.toHaveText("—");

  const frozenBefore = await page.evaluate(() => window.__dustAndDeadTest.getSoloRunSummaryForTest());
  expect(frozenBefore).toMatchObject({
    durationSeconds: 65.9,
    wave: 4,
    level: 6,
    score: 1234,
    kills: 10,
    dustSecuredCents: 5450,
    bossTotal: 1,
    bestWave: 3,
    isNewRecord: true,
  });
  expect(frozenBefore.newChallengeIds.length).toBe(1);

  await page.evaluate(() => {
    window.__dustAndDeadTest.advanceRealFrame(5000, { render: false });
    window.__dustAndDeadTest.forceSinglePlayerGameOver();
  });
  const frozenAfter = await page.evaluate(() => window.__dustAndDeadTest.getSoloRunSummaryForTest());
  expect(frozenAfter).toEqual(frozenBefore);
  await expect(page.locator("#game-over-duration")).toHaveText("1:05");

  await page.evaluate(() => document.querySelector('[data-language="ru"]').click());
  await expect(page.locator("#game-over-stats")).toContainText("Волна 4");
  await expect(page.locator("#game-over-duration")).toHaveText("1:05");
  await expect(page.locator("#game-over-dust")).toHaveText("+54.50");
  await expect(page.locator("#game-over-milestones-title")).toHaveText("Новые достижения");
  await expect(page.locator("#game-over-next-unlock-progress")).toHaveAttribute("aria-valuetext", /пыли/);

  await page.locator("#game-over-development-btn").click();
  await expect(page.locator("#game-over")).toBeHidden();
  await expect(page.locator("#unlock-shop")).toBeVisible();
  expect((await page.evaluate(() => JSON.parse(window.render_game_to_text()))).mode).toBe("menu");
});

test("camera shake can be disabled without clearing its gameplay state", async ({ page }) => {
  await openGame(page);
  await startFreshHunt(page);
  await page.locator("#pause-menu-btn").click();
  await page.locator("#pause-settings-btn").click();
  await expect(page.locator("#graphics-camera-shake-btn")).toHaveAttribute("aria-pressed", "true");

  const enabledOffsets = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    game.setCameraShakeForTest(1);
    const offsets = [];
    for (let index = 0; index < 4; index += 1) {
      game.renderNowForTest();
      const sample = game.getCameraShakeDiagnosticsForTest();
      offsets.push(Math.hypot(sample.cameraX - sample.baseX, sample.cameraZ - sample.baseZ));
    }
    return offsets;
  });
  expect(Math.max(...enabledOffsets)).toBeGreaterThan(0.0001);

  await page.locator("#graphics-camera-shake-btn").click();
  const disabled = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    game.setCameraShakeForTest(1);
    game.renderNowForTest();
    return game.getCameraShakeDiagnosticsForTest();
  });
  expect(disabled.enabled).toBe(false);
  expect(disabled.shake).toBe(1);
  expect(disabled.cameraX).toBe(disabled.baseX);
  expect(disabled.cameraZ).toBe(disabled.baseZ);
});
