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

test("a legacy multiplayer URL hides the title before the main script executes", async ({ page }) => {
  let releaseGameScript;
  const gameScriptGate = new Promise((resolve) => {
    releaseGameScript = resolve;
  });
  await page.route("**/game.js", async (route) => {
    await gameScriptGate;
    await route.continue();
  });

  await page.goto(`${fileUrl("index.html")}?mapSeed=7331&localMultiplayer=1`, { waitUntil: "commit" });
  await page.locator("#intro-screen").waitFor({ state: "attached" });

  const bootFrame = await page.evaluate(() => ({
    bootClass: document.documentElement.classList.contains("local-multiplayer-boot"),
    introDisplay: getComputedStyle(document.getElementById("intro-screen")).display,
    menuDisplay: getComputedStyle(document.getElementById("menu")).display,
    lobbyDisplay: getComputedStyle(document.getElementById("local-multiplayer-lobby")).display,
  }));
  expect(bootFrame).toEqual({
    bootClass: true,
    introDisplay: "none",
    menuDisplay: "none",
    lobbyDisplay: "block",
  });

  releaseGameScript();
  await page.waitForLoadState("load");
  await expect(page.locator("#local-multiplayer-lobby")).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.classList.contains("local-multiplayer-boot"))).toBe(false);
});

test("the menu multiplayer button opens in place without navigation or changing the solo map", async ({ page }) => {
  await page.goto(`${fileUrl("index.html")}?mapSeed=19`);

  const intro = page.locator("#intro-screen");
  const menu = page.locator("#menu");
  const lobby = page.locator("#local-multiplayer-lobby");

  await expect(intro).toBeVisible();
  // The title screen intentionally dismisses on pointerdown, before a browser
  // click event is completed, so exercise it with a genuine mouse gesture.
  await page.mouse.click(640, 360);
  await expect(intro).toBeHidden();
  await expect(menu).toBeVisible();

  const initialUrl = page.url();
  let navigationCount = 0;
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) navigationCount += 1;
  });
  await revealLocalMultiplayerEntry(page);
  await page.locator("#local-multiplayer-btn").click();

  const url = new URL(page.url());
  expect(page.url()).toBe(initialUrl);
  expect(navigationCount).toBe(0);
  expect(url.searchParams.get("mapSeed")).toBe("19");
  expect(url.searchParams.has("localMultiplayer")).toBe(false);
  await expect(intro).toBeHidden();
  await expect(menu).toBeHidden();
  await expect(lobby).toBeVisible();
  await expect(page.locator("#game-root")).not.toHaveClass(/is-intro/);

  const multiplayerState = await page.evaluate(() => window.__dustMultiplayerTest.getState());
  expect(multiplayerState).toMatchObject({ active: true, phase: "lobby", mapSeed: 19, renderedMapSeed: 19 });

  await page.locator("#multiplayer-lobby-back-btn").click();
  await page.locator("#start-btn").click();
  const soloState = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  expect(soloState.map.seed).toBe(19);
});

test("a normalized local multiplayer URL boots straight into the lobby", async ({ page }) => {
  await page.goto(`${fileUrl("index.html")}?mapSeed=7331&localMultiplayer=1`);

  await expect(page.locator("#intro-screen")).toBeHidden();
  await expect(page.locator("#menu")).toBeHidden();
  await expect(page.locator("#local-multiplayer-lobby")).toBeVisible();

  await page.locator("#multiplayer-lobby-back-btn").click();
  await expect(page.locator("#local-multiplayer-lobby")).toBeHidden();
  await expect(page.locator("#menu")).toBeVisible();
  await expect(page.locator("#intro-screen")).toBeHidden();

  expect(new URL(page.url()).searchParams.has("localMultiplayer")).toBe(false);
  await page.reload();
  await expect(page.locator("#intro-screen")).toBeVisible();
  await expect(page.locator("#local-multiplayer-lobby")).toBeHidden();
});

test("random background input never starts a solo match", async ({ page }) => {
  await page.goto(`${fileUrl("index.html")}?mapSeed=91`);
  await page.keyboard.press("KeyM");
  await expect(page.locator("#intro-screen")).toBeHidden();
  await expect(page.locator("#menu")).toBeVisible();

  await page.mouse.click(6, 6);
  await page.keyboard.press("Enter");
  await page.keyboard.press("Space");
  await page.keyboard.press("KeyR");

  const game = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  expect(game.mode).toBe("menu");
  await expect(page.locator("#menu")).toBeVisible();
});

test("lobby blocks the main menu and ignores clicks outside its dialog", async ({ page }) => {
  await page.goto(`${fileUrl("index.html")}?mapSeed=92`);
  await page.keyboard.press("KeyM");
  await revealLocalMultiplayerEntry(page);
  await page.locator("#local-multiplayer-btn").click();

  await expect(page.locator("#local-multiplayer-lobby")).toBeVisible();
  expect(await page.locator("#menu").evaluate((element) => element.inert)).toBe(true);
  await page.mouse.click(6, 6);

  const multiplayer = await page.evaluate(() => window.__dustMultiplayerTest.getState());
  const game = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  expect(multiplayer).toMatchObject({ active: true, phase: "lobby" });
  expect(game.mode).toBe("menu");
  await expect(page.locator("#local-multiplayer-lobby")).toBeVisible();
});

test("match results include the final standings and outside clicks cannot restart play", async ({ page }) => {
  await page.goto(`${fileUrl("index.html")}?mapSeed=93`);
  await page.keyboard.press("KeyM");
  await page.evaluate(() => {
    const api = window.__dustMultiplayerTest;
    api.startMockHost(["Host", "Guest"]);
    api.setPoints("mock-player-1", 8);
    api.setPoints("mock-player-2", 3);
    api.finishMatch(["mock-player-1"], "lastSurvivorLeads");
  });

  await expect(page.locator("#multiplayer-result-panel")).toBeVisible();
  await expect(page.locator("#multiplayer-final-results-body tr")).toHaveCount(2);
  await expect(page.locator('#multiplayer-final-results-body tr[data-player-id="mock-player-1"]')).toContainText("Winner");
  await expect(page.locator("#multiplayer-scoreboard")).toBeHidden();
  expect(await page.locator("#menu").evaluate((element) => element.inert)).toBe(true);

  await page.mouse.click(6, 6);
  await page.keyboard.press("Enter");
  const multiplayer = await page.evaluate(() => window.__dustMultiplayerTest.getState());
  const game = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  expect(multiplayer).toMatchObject({ active: true, phase: "ended", matchEnded: true });
  expect(game.mode).toBe("gameover");
  await expect(page.locator("#multiplayer-result-panel")).toBeVisible();
});
