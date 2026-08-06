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
  await page.waitForFunction(() => Boolean(window.__dustMultiplayerTest && window.__dustAndDeadTest));
}

test("trail-layer traps retain the local or remote player's owner id", async ({ page }) => {
  await openGame(page);

  const traps = await page.evaluate(() => {
    const api = window.__dustMultiplayerTest;
    api.startMockHost(["Host Ranger", "Guest Ranger"]);
    return {
      local: api.spawnTrailTrapNow("mock-player-1"),
      remote: api.spawnTrailTrapNow("mock-player-2"),
    };
  });

  expect(traps.local).toEqual({ ownerPlayerId: "mock-player-1", source: "trail-layer" });
  expect(traps.remote).toEqual({ ownerPlayerId: "mock-player-2", source: "trail-layer" });
});

test("launcher shrapnel participates in authoritative PvP", async ({ page }) => {
  await openGame(page);

  const result = await page.evaluate(() => {
    const api = window.__dustMultiplayerTest;
    api.startMockHost(["Bombardier", "Target"]);
    api.setHealth("mock-player-2", 9);
    const hit = api.hitWithLauncherShrapnel("mock-player-1", "mock-player-2");
    return { hit, state: api.getState() };
  });

  expect(result.hit.ownerPlayerId).toBe("mock-player-1");
  expect(result.hit.pvpDamage).toBe(9);
  expect(result.hit.targetHp).toBe(0);
  expect(result.hit.targetAlive).toBe(false);
  expect(result.state.players[0].playerKills).toBe(1);
  expect(result.state.players[1].alive).toBe(false);
});

test("dead host personal systems freeze while world effects keep expiring", async ({ page }) => {
  await openGame(page);

  const result = await page.evaluate(() => {
    const multiplayer = window.__dustMultiplayerTest;
    const game = window.__dustAndDeadTest;

    multiplayer.startMockHost(["Fallen Host", "Survivor"]);
    multiplayer.setProgression("mock-player-1", {
      playerClass: "ranger",
      rifleUpgrade: "trailWarden",
      upgradeCounts: { trailLayer: 1 },
      rifleAutoTrapTimer: 0.2,
    });
    game.setAmmo("revolver", 0, 6);
    game.startReload("revolver");
    multiplayer.spawnHallowedGround("mock-player-1", 2);
    multiplayer.damagePlayer("mock-player-1", 999, "mock-player-2");
    const before = multiplayer.getCombatDiagnostics("mock-player-1");
    window.advanceTime(1000);
    const after = multiplayer.getCombatDiagnostics("mock-player-1");

    multiplayer.startMockHost(["Fallen Marshal", "Survivor"]);
    multiplayer.setProgression("mock-player-1", {
      playerClass: "marshal",
      marshalUpgrade: "graveWarden",
      upgradeCounts: { heavensBounty: 1 },
      marshalBountyTimer: 4,
    });
    multiplayer.damagePlayer("mock-player-1", 999, "mock-player-2");
    window.advanceTime(1000);
    const marshalAfter = multiplayer.getCombatDiagnostics("mock-player-1");

    const fireStart = multiplayer.startMockHost(["Fallen Pyro", "Survivor"]);
    multiplayer.setProgression("mock-player-1", {
      playerClass: "demolitionist",
      launcherUpgrade: "pyrotechnician",
      launcherFireBuffActive: false,
      launcherFireAmmoAccumulator: 0,
    });
    game.spawnFirePatchAt(fireStart.players[0].x, fireStart.players[0].z, 2, 3);
    multiplayer.damagePlayer("mock-player-1", 999, "mock-player-2");
    window.advanceTime(1000);
    const fireAfter = {
      combat: multiplayer.getCombatDiagnostics("mock-player-1"),
      player: multiplayer.getState().players[0],
    };

    return { before, after, marshalAfter, fireAfter };
  });

  expect(result.before.reloadTimers.revolver).toBeGreaterThan(0);
  expect(result.after.reloadTimers.revolver).toBeCloseTo(result.before.reloadTimers.revolver, 5);
  expect(result.after.rifleAutoTrapTimer).toBeCloseTo(result.before.rifleAutoTrapTimer, 5);
  expect(result.after.rifleTraps).toHaveLength(0);
  expect(result.before.hallowedGrounds).toHaveLength(1);
  expect(result.after.hallowedGrounds[0].life).toBeLessThan(result.before.hallowedGrounds[0].life);
  expect(result.marshalAfter.marshalBountyTimer).toBe(4);
  expect(result.fireAfter.player.hp).toBe(0);
  expect(result.fireAfter.combat.launcherFireBuffActive).toBe(false);
  expect(result.fireAfter.combat.launcherFireAmmoAccumulator).toBe(0);
});
