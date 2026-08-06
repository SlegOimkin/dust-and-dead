const path = require("node:path");
const { expect, test } = require("@playwright/test");

function fileUrl(relativePath) {
  const absolute = path.resolve(__dirname, "..", relativePath).replace(/\\/g, "/");
  return `file:///${absolute}`;
}

async function openGame(page) {
  await page.goto(`${fileUrl("index.html")}?mapSeed=7331`);
  const intro = page.locator("#intro-screen");
  if (await intro.isVisible().catch(() => false)) await page.keyboard.press("KeyM");
  await page.getByRole("button", { name: "Start Hunt" }).click();
}

test("a context restored before the fallback deadline keeps the healthy renderer", async ({ page }) => {
  await openGame(page);

  const result = await page.evaluate(async () => {
    const game = window.__dustAndDeadTest;
    game.setAutomaticFrameLoopModeForTest("paused");
    const canvas = document.querySelector("#game canvas") || document.querySelector("canvas");
    const before = game.getRendererDiagnosticsForTest();

    canvas.dispatchEvent(new Event("webglcontextlost", { cancelable: true }));
    const lost = game.getRendererDiagnosticsForTest();
    canvas.dispatchEvent(new Event("webglcontextrestored"));
    const restored = game.getRendererDiagnosticsForTest();
    await new Promise((resolve) => setTimeout(resolve, 450));

    const activeCanvas = document.querySelector("#game canvas") || document.querySelector("canvas");
    return {
      before,
      lost,
      restored,
      afterDeadline: game.getRendererDiagnosticsForTest(),
      sameCanvas: activeCanvas === canvas,
      canvasConnected: canvas.isConnected,
    };
  });

  expect(result.lost).toMatchObject({
    contextLost: true,
    contextLosses: result.before.contextLosses + 1,
  });
  expect(result.restored).toMatchObject({
    contextLost: false,
    recoveries: result.before.recoveries + 1,
    recreates: result.before.recreates,
    lastReason: "contextrestored",
  });
  expect(result.afterDeadline).toMatchObject(result.restored);
  expect(result.sameCanvas).toBe(true);
  expect(result.canvasConnected).toBe(true);
});

test("catch-up simulation animates visible enemies once at the final pose", async ({ page }) => {
  await openGame(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const multiplayer = window.__dustMultiplayerTest;
    game.setAutomaticFrameLoopModeForTest("paused");
    game.clearEnemies();
    const stress = multiplayer.spawnEnemyStressField(24, "visible");
    game.resetFrameTiming();
    const frame = game.advanceRealFrame(80, { render: false });
    return { stress, frame, world: JSON.parse(window.render_game_to_text()) };
  });

  expect(result.stress).toMatchObject({ added: 24, active: 24, mode: "visible" });
  expect(result.frame.steps).toBe(2);
  expect(result.frame.simulatedMs).toBeCloseTo(80, 3);
  expect(result.frame.enemyVisualSyncPasses).toBe(1);
  expect(result.frame.enemyVisualsSynced).toBe(result.stress.active);
  expect(result.world.enemyCount).toBe(24);
});
