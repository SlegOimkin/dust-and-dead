const path = require("node:path");
const { expect, test } = require("@playwright/test");

function fileUrl(relativePath) {
  const absolute = path.resolve(__dirname, "..", relativePath).replace(/\\/g, "/");
  return `file:///${absolute}`;
}

// Local play needs the Nearby Connections plugin, so the menu hides its entry
// outside the Android build. These specs drive that lobby, so they put the
// button back the same way the Android build would.
async function revealLocalMultiplayerEntry(page) {
  await page.evaluate(() =>
    document.documentElement.classList.remove("no-local-multiplayer")
  );
}

async function dismissIntro(page) {
  const intro = page.locator("#intro-screen");
  if (await intro.isVisible().catch(() => false)) {
    await page.keyboard.press("KeyM");
    await expect(intro).toBeHidden();
  }
}

async function openMenu(page) {
  await page.goto(`${fileUrl("index.html")}?mapSeed=7331`);
  await dismissIntro(page);
  await page.waitForFunction(() => Boolean(
    window.__dustAndDeadTest &&
    window.__dustMultiplayerTest &&
    window.render_game_to_text
  ));
  await expect(page.locator("#menu")).toBeVisible();
}

async function readMapSeed(page) {
  return page.evaluate(() => JSON.parse(window.render_game_to_text()).map.seed);
}

async function expectValidMap(page) {
  const layout = await page.evaluate(() => window.__dustAndDeadTest.validateMapLayout());
  expect(layout.issueCount).toBe(0);
}

test("single-player game over offers retry or a fresh-map return to the main menu", async ({ page }) => {
  await openMenu(page);
  const initialSeed = await readMapSeed(page);

  await page.locator("#start-btn").click();
  await expect.poll(() => page.evaluate(() => JSON.parse(window.render_game_to_text()).mode)).toBe("playing");
  expect(await readMapSeed(page)).toBe(initialSeed);

  expect(await page.evaluate(() => window.__dustAndDeadTest.forceSinglePlayerGameOver())).toBe(true);
  await expect(page.locator("#game-over")).toBeVisible();
  await expect(page.locator("#restart-btn")).toBeVisible();
  await expect(page.locator("#game-over-menu-btn")).toBeVisible();

  // Ride Again deliberately retries the current terrain.
  await page.locator("#restart-btn").click();
  await expect.poll(() => page.evaluate(() => JSON.parse(window.render_game_to_text()).mode)).toBe("playing");
  expect(await readMapSeed(page)).toBe(initialSeed);

  expect(await page.evaluate(() => window.__dustAndDeadTest.forceSinglePlayerGameOver())).toBe(true);
  await page.locator("#game-over-menu-btn").click();
  await expect(page.locator("#menu")).toBeVisible();
  await expect(page.locator("#game-over")).toBeHidden();
  await expect.poll(() => page.evaluate(() => JSON.parse(window.render_game_to_text()).mode)).toBe("menu");

  const firstReturnSeed = await readMapSeed(page);
  expect(firstReturnSeed).not.toBe(initialSeed);
  await expectValidMap(page);

  await page.locator("#start-btn").click();
  expect(await readMapSeed(page)).toBe(firstReturnSeed);
  await page.locator("#pause-menu-btn").click();
  await page.locator("#pause-exit-btn").click();
  await expect(page.locator("#pause-exit-confirm-panel")).toHaveClass(/is-visible/);
  await page.locator("#pause-exit-confirm-btn").click();
  await expect(page.locator("#menu")).toBeVisible();

  const secondReturnSeed = await readMapSeed(page);
  expect(secondReturnSeed).not.toBe(firstReturnSeed);
  expect(secondReturnSeed).not.toBe(initialSeed);
  await expectValidMap(page);
});

test("leaving a completed multiplayer match also prepares a fresh solo map", async ({ page }) => {
  await openMenu(page);
  const initialSeed = await readMapSeed(page);

  await page.evaluate(() => {
    window.__dustMultiplayerTest.startMockHost(["Host", "Guest"]);
    window.__dustMultiplayerTest.finishMatch(["mock-player-1"], "test");
  });
  await expect(page.locator("#multiplayer-result-panel")).toBeVisible();
  const matchSeed = await readMapSeed(page);

  await page.locator("#multiplayer-return-menu-btn").click();
  await expect(page.locator("#menu")).toBeVisible();

  const menuSeed = await readMapSeed(page);
  const multiplayer = await page.evaluate(() => window.__dustMultiplayerTest.getState());
  expect(menuSeed).not.toBe(matchSeed);
  expect(menuSeed).not.toBe(initialSeed);
  expect(multiplayer.active).toBe(false);
  expect(multiplayer.mapSeed).toBe(menuSeed);
  expect(multiplayer.renderedMapSeed).toBe(menuSeed);
  await expectValidMap(page);
});

test("opening and closing the multiplayer lobby without a match keeps the current map", async ({ page }) => {
  await openMenu(page);
  const initialSeed = await readMapSeed(page);

  await revealLocalMultiplayerEntry(page);
  await page.locator("#local-multiplayer-btn").click();
  await expect(page.locator("#local-multiplayer-lobby")).toBeVisible();
  await page.locator("#multiplayer-lobby-back-btn").click();
  await expect(page.locator("#menu")).toBeVisible();

  expect(await readMapSeed(page)).toBe(initialSeed);
  await expectValidMap(page);
});
