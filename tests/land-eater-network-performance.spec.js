const path = require("node:path");
const { expect, test } = require("@playwright/test");

const MAX_IDLE_OR_DEVOUR_BOSS_BYTES = 96;
const MAX_ZIGZAG_BOSS_BYTES = 160;
const MAX_WIRE_BYTES = 31 * 1024;

function fileUrl(relativePath) {
  const absolute = path.resolve(__dirname, "..", relativePath).replace(/\\/g, "/");
  return `file:///${absolute}`;
}

async function startHunt(page) {
  await page.goto(`${fileUrl("index.html")}?mapSeed=7331&landEaterNetworkBudget=1`);
  const intro = page.locator("#intro-screen");
  if (await intro.isVisible().catch(() => false)) {
    await page.keyboard.press("KeyM");
    await expect(intro).toBeHidden();
  }
  await page.getByRole("button", { name: "Start Hunt" }).click();
  await page.waitForFunction(() => Boolean(
    window.__dustAndDeadTest?.getLandEaterPackedWireDiagnostics
      && window.__dustMultiplayerTest?.buildWireSnapshot
  ));
}

test("the fixed 224-cell overlay and full mask do not allocate as the map is eaten", async ({ page }) => {
  await startHunt(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    game.startWaveNow(10, "landEater");
    game.setLandEaterAiEnabled(false);
    const opening = game.getLandEaterDiagnostics();
    const packedOpening = game.getLandEaterPackedWireDiagnostics();
    const samples = [];
    for (let index = 0; index < 24; index += 1) {
      game.forceLandEaterAction("devour");
      const warning = game.getLandEaterPackedWireDiagnostics();
      game.seekLandEaterAction(0.999);
      game.stepLandEater(1 / 30);
      const after = game.getLandEaterDiagnostics();
      const packed = game.getLandEaterPackedWireDiagnostics();
      samples.push({
        warningBytes: warning.bytes,
        bytes: packed.bytes,
        overlayCreated: Number(
          after.grid.overlayCreated
            ?? after.grid.overlayInstancesCreated
            ?? after.grid.overlayCapacity
        ),
        overlayActive: Number(
          after.grid.overlayActive
            ?? after.grid.voidCellIds?.length
            ?? after.grid.consumedCellIds?.length
        ),
      });
    }
    return {
      opening,
      packedOpening,
      samples,
      final: game.getLandEaterDiagnostics(),
    };
  });

  expect(result.opening.grid).toMatchObject({
    totalCells: 224,
    maskBytes: 28,
    overlayCapacity: 224,
  });
  expect(result.opening.model).toMatchObject({
    drawCalls: 20,
    triangles: 1128,
    geometryAllocationsPerFrame: 0,
    materialAllocationsPerFrame: 0,
    undersideInstances: 10,
  });
  expect(result.opening.model.drawCalls).toBeLessThanOrEqual(24);
  expect(result.opening.model.triangles).toBeLessThanOrEqual(12_000);
  expect(result.packedOpening.bytes).toBeLessThanOrEqual(MAX_IDLE_OR_DEVOUR_BOSS_BYTES);
  result.samples.forEach((sample, index) => {
    expect(sample.warningBytes).toBeLessThanOrEqual(MAX_IDLE_OR_DEVOUR_BOSS_BYTES);
    expect(sample.bytes).toBeLessThanOrEqual(MAX_IDLE_OR_DEVOUR_BOSS_BYTES);
    expect(sample.overlayCreated).toBe(224);
    expect(sample.overlayActive).toBe(index + 1);
  });
  expect(
    result.final.grid.voidCellIds || result.final.grid.consumedCellIds
  ).toHaveLength(24);
});

test("a maximum zigzag route stays bounded inside the regular multiplayer snapshot budget", async ({ page }) => {
  await startHunt(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const multiplayer = window.__dustMultiplayerTest;
    const route = Array.from({ length: 12 }, (_, index) => ({
      x: index % 2 ? 220 : -220,
      z: -176 + index * 32,
    }));
    multiplayer.startMockHost(["Host", "Guest", "Third", "Fourth"]);
    game.startWaveNow(10, "landEater");
    game.setLandEaterAiEnabled(false);
    game.forceLandEaterAction("zigzag", { route });
    game.seekLandEaterAction(0.5);

    const iterations = 120;
    const startedAt = performance.now();
    let packed = null;
    for (let index = 0; index < iterations; index += 1) {
      packed = game.getLandEaterPackedWireDiagnostics();
    }
    const encodeMs = performance.now() - startedAt;
    const snapshot = JSON.parse(JSON.stringify(
      multiplayer.buildWireSnapshot(false, false, "mock-player-2")
    ));
    return {
      diagnostics: game.getLandEaterDiagnostics(),
      packed,
      encodeMs,
      iterations,
      snapshotBytes: new TextEncoder().encode(JSON.stringify(snapshot)).length,
    };
  });

  const route = result.diagnostics.route || result.diagnostics.zigzag?.route;
  const decodedRoute = result.packed.decoded.route || result.packed.decoded.zigzag?.route;
  expect(route).toHaveLength(12);
  expect(decodedRoute).toHaveLength(12);
  expect(result.packed.bytes).toBeLessThanOrEqual(MAX_ZIGZAG_BOSS_BYTES);
  expect(result.snapshotBytes).toBeLessThanOrEqual(MAX_WIRE_BYTES);
  expect(result.encodeMs / result.iterations).toBeLessThan(1);
});
