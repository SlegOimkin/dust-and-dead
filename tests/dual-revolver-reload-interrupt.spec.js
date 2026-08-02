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
  if (await page.evaluate(() => window.__dustAndDeadTest.getAudioDiagnostics().enabled)) {
    await page.locator("#menu-music-btn").click();
  }
  await page.getByRole("button", { name: "Start Hunt" }).click();
  await page.waitForFunction(() => Boolean(
    window.__dustAndDeadTest?.forceBellRingerToll &&
    window.__dustMultiplayerTest?.startMockHost &&
    typeof window.advanceTime === "function"
  ));
}

test("a Bell toll cannot strand the guest's empty second revolver", async ({ page }) => {
  await startHunt(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const multiplayer = window.__dustMultiplayerTest;
    multiplayer.startMockHost(["Host", "Guest"]);
    game.startWaveNow(10, "bellRinger");
    game.clearEnemies();
    game.setBellRingerAiEnabled(false);

    const guest = multiplayer.getState().players[1];
    multiplayer.setProgression(guest.id, {
      playerClass: "gunslinger",
      revolverUpgrade: "dualRevolvers",
      revolverMagazineBonus: 6,
      upgradeCounts: Object.assign({}, guest.progression.upgrades, { allRightAllLeft: 1 }),
      weapon: "revolver",
      ammo: Object.assign({}, guest.progression.ammo, { revolver: 6 }),
      ammoReserve: Object.assign({}, guest.progression.ammoReserve, { revolver: 24 }),
      reloadTimers: Object.assign({}, guest.progression.reloadTimers, { revolver: 0.8 }),
      dualHandAmmo: { right: 0, left: 6 },
      dualHandReloadTimers: { right: 0.8, left: 0 },
      dualHandFreeReloads: { right: 0, left: 0 },
      dualActiveHand: "left",
      dualLastShotHand: "right",
    });

    const read = () => {
      const snapshot = multiplayer.buildSnapshot(false, false, guest.id);
      const player = snapshot.players.find((entry) => entry.id === guest.id);
      return {
        bellStagger: player.bellStagger,
        ammo: player.progression.ammo.revolver,
        reserve: player.progression.ammoReserve.revolver,
        reloadTimer: player.progression.reloadTimers.revolver,
        handAmmo: player.progression.dualHandAmmo,
        handTimers: player.progression.dualHandReloadTimers,
        activeHand: player.progression.dualActiveHand,
      };
    };

    const before = read();
    const toll = game.forceBellRingerToll();
    const interrupted = read();
    window.advanceTime(2600);
    const recovered = read();
    return { before, toll, interrupted, recovered };
  });

  expect(result.before).toMatchObject({
    ammo: 6,
    reserve: 24,
    handAmmo: { right: 0, left: 6 },
    activeHand: "left",
  });
  expect(result.before.handTimers.right).toBeGreaterThan(0);
  expect(result.toll).toBe(true);
  expect(result.interrupted.bellStagger).toBeGreaterThan(0);
  expect(result.interrupted.handTimers).toEqual({ right: 0, left: 0 });
  expect(result.recovered.handAmmo).toEqual({ right: 6, left: 6 });
  expect(result.recovered.handTimers).toEqual({ right: 0, left: 0 });
  expect(result.recovered.ammo).toBe(12);
  expect(result.recovered.reserve).toBe(18);
});

test("an ordinary reload interrupt preserves dual-hand ownership and resumes the empty off-hand", async ({ page }) => {
  await startHunt(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const multiplayer = window.__dustMultiplayerTest;
    multiplayer.startMockHost(["Host", "Guest"]);

    const host = multiplayer.getState().players[0];
    multiplayer.setProgression(host.id, {
      playerClass: "gunslinger",
      revolverUpgrade: "dualRevolvers",
      revolverMagazineBonus: 6,
      upgradeCounts: Object.assign({}, host.progression.upgrades, { allRightAllLeft: 1 }),
      weapon: "revolver",
      ammo: Object.assign({}, host.progression.ammo, { revolver: 6 }),
      ammoReserve: Object.assign({}, host.progression.ammoReserve, { revolver: 24 }),
      reloadTimers: Object.assign({}, host.progression.reloadTimers, { revolver: 0.8 }),
      dualHandAmmo: { right: 0, left: 6 },
      dualHandReloadTimers: { right: 0.8, left: 0 },
      dualHandFreeReloads: { right: 0, left: 0 },
      dualActiveHand: "left",
      dualLastShotHand: "right",
    });

    const read = () => {
      const snapshot = multiplayer.buildSnapshot(false, false, host.id);
      const player = snapshot.players.find((entry) => entry.id === host.id);
      return {
        ammo: player.progression.ammo.revolver,
        reserve: player.progression.ammoReserve.revolver,
        reloadTimer: player.progression.reloadTimers.revolver,
        handAmmo: player.progression.dualHandAmmo,
        handTimers: player.progression.dualHandReloadTimers,
        activeHand: player.progression.dualActiveHand,
      };
    };

    const before = read();
    const interruptedAmmo = game.interruptPlayerReloadsForTest(0);
    const interrupted = read();
    window.advanceTime(1300);
    const recovered = read();
    return { before, interruptedAmmo, interrupted, recovered };
  });

  expect(result.before.handTimers.right).toBeGreaterThan(0);
  expect(result.interruptedAmmo.dualHands.right.reloading).toBe(false);
  expect(result.interrupted).toMatchObject({
    ammo: 6,
    reserve: 24,
    handAmmo: { right: 0, left: 6 },
    handTimers: { right: 0, left: 0 },
    activeHand: "left",
  });
  expect(result.recovered).toMatchObject({
    ammo: 12,
    reserve: 18,
    handAmmo: { right: 6, left: 6 },
    handTimers: { right: 0, left: 0 },
    activeHand: "left",
  });
});
