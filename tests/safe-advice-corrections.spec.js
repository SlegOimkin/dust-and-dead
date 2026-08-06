const path = require("node:path");
const { expect, test } = require("@playwright/test");

function fileUrl(relativePath, query = "") {
  const absolute = path.resolve(__dirname, "..", relativePath).replace(/\\/g, "/");
  return `file:///${absolute}${query}`;
}

async function startHunt(page, query = "?mapSeed=7331") {
  await page.goto(fileUrl("index.html", query));
  const intro = page.locator("#intro-screen");
  if (await intro.isVisible().catch(() => false)) {
    await page.keyboard.press("KeyM");
    await expect(intro).toBeHidden();
  }
  await page.getByRole("button", { name: "Start Hunt" }).click();
  await page.waitForFunction(() => Boolean(
    window.__dustAndDeadTest &&
    window.__dustMultiplayerTest &&
    window.render_game_to_text &&
    window.advanceTime
  ));
}

test("offscreen acid puddles update safely in an authoritative host match", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await startHunt(page);

  const result = await page.evaluate(() => {
    const multiplayer = window.__dustMultiplayerTest;
    const game = window.__dustAndDeadTest;
    multiplayer.startMockHost(["Host", "Guest"]);
    multiplayer.setPlayerPosition("mock-player-1", -35, -25);
    game.clearAcidHazards();
    game.spawnAcidPuddleAt(35, 25);
    window.advanceTime(20);
    return game.getAcidPuddleOptimizationStats();
  });

  expect(result.activePuddles).toBe(1);
  expect(pageErrors).toEqual([]);
});

test("minimap backing size follows its unchanged CSS content box after resize", async ({ page }) => {
  await startHunt(page);

  const readSize = () => page.evaluate(() => {
    const canvas = document.querySelector("#minimap-canvas");
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    return {
      clientWidth: canvas.clientWidth,
      clientHeight: canvas.clientHeight,
      width: canvas.width,
      height: canvas.height,
      expectedWidth: Math.max(1, Math.round(canvas.clientWidth * dpr)),
      expectedHeight: Math.max(1, Math.round(canvas.clientHeight * dpr)),
    };
  });

  const initial = await readSize();
  expect(initial.width).toBe(initial.expectedWidth);
  expect(initial.height).toBe(initial.expectedHeight);

  await page.setViewportSize({ width: 740, height: 360 });
  await page.waitForFunction(() => {
    const canvas = document.querySelector("#minimap-canvas");
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    return (
      canvas.clientWidth > 0 &&
      canvas.clientWidth < 174 &&
      canvas.width === Math.max(1, Math.round(canvas.clientWidth * dpr)) &&
      canvas.height === Math.max(1, Math.round(canvas.clientHeight * dpr))
    );
  });

  const compact = await readSize();
  expect(compact.clientWidth).toBeLessThan(initial.clientWidth);
  expect(compact.clientHeight).toBeLessThan(initial.clientHeight);
  expect(compact.width).toBe(compact.expectedWidth);
  expect(compact.height).toBe(compact.expectedHeight);
});

test("an unchanged boss HUD does not rewrite its live DOM", async ({ page }) => {
  await startHunt(page);
  await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    game.startWaveNow(10);
    game.clearEnemies();
    game.setBellRingerAiEnabled(false);
    window.advanceTime(20);
    window.advanceTime(20);
  });
  await expect(page.locator("#boss-hud")).toBeVisible();

  const mutations = await page.evaluate(() => {
    const root = document.querySelector("#boss-hud");
    const observer = new MutationObserver(() => {});
    observer.observe(root, {
      attributes: true,
      characterData: true,
      childList: true,
      subtree: true,
    });
    for (let frame = 0; frame < 6; frame += 1) window.advanceTime(20);
    const records = observer.takeRecords().map((record) => ({
      type: record.type,
      attributeName: record.attributeName || "",
      target: record.target.id || record.target.className || record.target.nodeName,
    }));
    observer.disconnect();
    return records;
  });

  expect(mutations).toEqual([]);
});

test("legacy wire-size serialization stays opt-in without changing the payload", async ({ page }) => {
  await startHunt(page);

  const result = await page.evaluate(() => {
    const multiplayer = window.__dustMultiplayerTest;
    multiplayer.startMockHost(["Host", "Guest"]);
    const wire = multiplayer.buildWireSnapshot(true, true, "mock-player-2");
    const stats = multiplayer.getNetworkBudgetDiagnostics().stats;
    return {
      packedPlayers: Array.isArray(wire.ps) && wire.ps.length > 1,
      legacyPlayersPresent: Array.isArray(wire.players),
      playerLegacyBytes: stats.playerLegacyBytes,
      playerWireBytes: stats.playerWireBytes,
      enemyLegacyBytes: stats.enemyLegacyBytes,
    };
  });

  expect(result).toEqual({
    packedPlayers: true,
    legacyPlayersPresent: false,
    playerLegacyBytes: 0,
    playerWireBytes: 0,
    enemyLegacyBytes: 0,
  });
});
