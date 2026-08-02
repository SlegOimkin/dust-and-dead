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
  await page.waitForFunction(() => Boolean(window.__dustMultiplayerTest && window.__dustAndDeadTest && window.advanceTime));
}

test("multiplayer caps large ammo crates at five or six while mini crates remain unlimited", async ({ page }) => {
  await openGame(page);

  const result = await page.evaluate(() => {
    const multiplayer = window.__dustMultiplayerTest;
    const game = window.__dustAndDeadTest;
    multiplayer.startMockHost(["One", "Two", "Three", "Four"]);
    game.clearAmmoCrates();

    for (let index = 0; index < 5; index += 1) game.spawnAmmoCrateAt(-12 + index * 6, 0);
    game.setAmmoCrateTimer(0);
    window.advanceTime(50);
    const fullPartyLimit = multiplayer.getState().ammoCrateLimit;
    const afterSixthLargeCrate = JSON.parse(window.render_game_to_text()).ammoCrates;
    game.setAmmoCrateTimer(0);
    window.advanceTime(50);
    const afterSeventhLargeAttempt = JSON.parse(window.render_game_to_text()).ammoCrates;

    for (let index = 0; index < 7; index += 1) game.spawnMiniAmmoCrateAt(-18 + index * 6, 12);
    game.setAmmoCrateTimer(0);
    window.advanceTime(50);
    const afterMiniCrates = JSON.parse(window.render_game_to_text()).ammoCrates;

    return {
      fullPartyLimit,
      regularPartyLimit: multiplayer.getAmmoCrateLimitForPlayerCount(3),
      afterSixthLargeCrate,
      afterSeventhLargeAttempt,
      afterMiniCrates,
    };
  });

  expect(result.fullPartyLimit).toBe(6);
  expect(result.afterSixthLargeCrate.filter((crate) => !crate.mini)).toHaveLength(6);
  expect(result.afterSeventhLargeAttempt.filter((crate) => !crate.mini)).toHaveLength(6);
  expect(result.afterMiniCrates.filter((crate) => !crate.mini)).toHaveLength(6);
  expect(result.afterMiniCrates.filter((crate) => crate.mini)).toHaveLength(7);
  expect(result.regularPartyLimit).toBe(5);
});

test("reviving grants three upgraded magazines of reserve ammo", async ({ page }) => {
  await openGame(page);

  const result = await page.evaluate(() => {
    const api = window.__dustMultiplayerTest;
    api.startMockHost(["Host", "Reviving player"]);
    api.setProgression("mock-player-2", { revolverMagazineBonus: 2 });
    api.setPoints("mock-player-2", 10);
    const before = api.getState();
    api.damagePlayer("mock-player-2", 999, "mock-player-1");
    const revived = api.revive("mock-player-2", "three-magazines-test");
    const after = api.getState();
    return { before, revived, after };
  });

  const beforePlayer = result.before.players[1];
  const afterPlayer = result.after.players[1];
  expect(result.revived).toBe(true);
  expect(result.after.reviveAmmoMagazines).toBe(3);
  expect(afterPlayer.progression.ammoReserve.revolver - beforePlayer.progression.ammoReserve.revolver).toBe(29);
});

test("remote players appear on the minimap and get compact on-screen nameplates", async ({ page }) => {
  await openGame(page);

  const result = await page.evaluate(() => {
    const api = window.__dustMultiplayerTest;
    const started = api.startMockHost(["Local", "Alice", "Bob", "Charlie"]);
    const local = started.players[0];
    api.setPlayerPosition("mock-player-2", local.x + 2.5, local.z);
    api.setPlayerPosition("mock-player-3", local.x - 2.5, local.z + 1.5);
    api.setPlayerPosition("mock-player-4", local.x, local.z - 2.5);
    const alive = api.refreshPlayerUi();
    api.damagePlayer("mock-player-2", 999, "mock-player-1");
    const downed = api.refreshPlayerUi();
    const styles = Array.from(document.querySelectorAll(".multiplayer-player-nameplate")).map((label) => {
      const computed = getComputedStyle(label);
      return {
        id: label.dataset.playerId,
        fontSize: computed.fontSize,
        pointerEvents: computed.pointerEvents,
        width: label.getBoundingClientRect().width,
      };
    });
    return { alive, downed, styles };
  });

  expect(result.alive.minimapMarkers).toHaveLength(3);
  expect(result.alive.nameplates).toHaveLength(3);
  expect(result.alive.nameplates.every((label) => label.visible && label.transform.includes("translate3d"))).toBe(true);
  expect(new Set(result.alive.minimapMarkers.map((marker) => marker.color)).size).toBe(3);

  const downedMarker = result.downed.minimapMarkers.find((marker) => marker.id === "mock-player-2");
  const downedNameplate = result.downed.nameplates.find((label) => label.id === "mock-player-2");
  expect(downedMarker.alive).toBe(false);
  expect(downedNameplate.visible).toBe(false);
  expect(result.styles.every((style) => style.pointerEvents === "none" && style.fontSize === "10px" && style.width <= 132)).toBe(true);
});
