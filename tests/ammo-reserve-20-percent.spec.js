const path = require("node:path");
const { expect, test } = require("@playwright/test");

function fileUrl(relativePath) {
  const absolute = path.resolve(__dirname, "..", relativePath).replace(/\\/g, "/");
  return `file:///${absolute}`;
}

async function openGame(page, query = "mapSeed=120") {
  await page.goto(`${fileUrl("index.html")}?${query}`);
  const intro = page.locator("#intro-screen");
  if (await intro.isVisible().catch(() => false)) {
    await page.keyboard.press("KeyM");
    await expect(intro).toBeHidden();
  }
  await page.getByRole("button", { name: "Start Hunt" }).click();
  await page.waitForFunction(() => Boolean(window.__dustAndDeadTest && window.render_game_to_text));
}

test("every weapon gets 20% more starting, full-crate and mini-crate reserve without changing magazines", async ({ page }) => {
  await openGame(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const read = () => JSON.parse(window.render_game_to_text());
    const ids = ["revolver", "rifle", "launcher", "coachGun"];
    const snapshot = () => Object.fromEntries(ids.map((id) => {
      const ammo = read().ammo.weapons[id];
      return [id, { current: ammo.current, magazine: ammo.magazine, reserve: ammo.reserve }];
    }));

    const starting = snapshot();
    ids.forEach((id) => game.grantWeaponForTest(id));
    ids.forEach((id) => game.setAmmo(id, read().ammo.weapons[id].magazine, 0));
    const beforeFullCrate = snapshot();
    let state = read();
    game.spawnAmmoCrateAt(state.player.x, state.player.z);
    game.collectNearestAmmoCrate();
    const afterFullCrate = snapshot();

    ids.forEach((id) => game.setAmmo(id, read().ammo.weapons[id].magazine, 0));
    const beforeMiniCrate = snapshot();
    state = read();
    game.spawnMiniAmmoCrateAt(state.player.x, state.player.z);
    game.collectNearestAmmoCrate();
    const afterMiniCrate = snapshot();
    return { starting, beforeFullCrate, afterFullCrate, beforeMiniCrate, afterMiniCrate };
  });

  const magazines = { revolver: 6, rifle: 18, launcher: 3, coachGun: 2 };
  const oldStartingReserve = { revolver: 24, rifle: 36, launcher: 15, coachGun: 28 };
  const oldFullCrate = { revolver: 30, rifle: 54, launcher: 24, coachGun: 30 };
  const expectedFullCrate = { revolver: 36, rifle: 65, launcher: 30, coachGun: 36 };
  const expectedMiniCrate = { revolver: 12, rifle: 22, launcher: 10, coachGun: 12 };

  for (const id of Object.keys(magazines)) {
    expect(result.starting[id].reserve, `${id} starting reserve`).toBe(Math.ceil(oldStartingReserve[id] * 1.2));
    expect(result.starting[id].magazine, `${id} starting magazine`).toBe(magazines[id]);
    expect(result.starting[id].current, `${id} starting loaded ammo`).toBe(magazines[id]);

    expect(result.beforeFullCrate[id]).toEqual({ current: magazines[id], magazine: magazines[id], reserve: 0 });
    expect(result.afterFullCrate[id].reserve, `${id} full crate reserve`).toBe(expectedFullCrate[id]);
    expect(result.afterFullCrate[id].reserve, `${id} full crate baseline`).toBeGreaterThanOrEqual(oldFullCrate[id] * 1.2);
    expect(result.afterFullCrate[id].current, `${id} loaded ammo after full crate`).toBe(magazines[id]);
    expect(result.afterFullCrate[id].magazine, `${id} magazine after full crate`).toBe(magazines[id]);

    expect(result.beforeMiniCrate[id]).toEqual({ current: magazines[id], magazine: magazines[id], reserve: 0 });
    expect(result.afterMiniCrate[id].reserve, `${id} mini crate reserve`).toBe(expectedMiniCrate[id]);
    expect(result.afterMiniCrate[id].current, `${id} loaded ammo after mini crate`).toBe(magazines[id]);
    expect(result.afterMiniCrate[id].magazine, `${id} magazine after mini crate`).toBe(magazines[id]);
  }
});

test("Dual reserve bonus and Heaven's Bounty reserve reward are scaled while loaded ammo stays unchanged", async ({ page }) => {
  await openGame(page, "mapSeed=121&ammoReward=dual");

  const dual = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const read = () => JSON.parse(window.render_game_to_text());
    game.clearEnemies();
    game.grantXp(240);
    if (!game.chooseClass("gunslinger")) throw new Error("Could not choose Gunslinger");
    game.forceAllStandardUpgrades("swiftBoots");
    game.grantXp(1200);
    game.setAmmo("revolver", 6, 0);
    const before = read().ammo.weapons.revolver;
    if (!game.chooseRevolverUpgrade("dualRevolvers")) throw new Error("Could not choose Dual Revolvers");
    const after = read().ammo.weapons.revolver;
    return { before, after };
  });

  expect(dual.before).toMatchObject({ current: 6, magazine: 6, reserve: 0 });
  expect(dual.after).toMatchObject({ current: 12, magazine: 12, reserve: 29 });
  expect(dual.after.reserve - dual.before.reserve).toBe(Math.ceil(24 * 1.2));

  await openGame(page, "mapSeed=122&ammoReward=bounty");
  const bounty = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const read = () => JSON.parse(window.render_game_to_text());
    game.clearEnemies();
    game.grantXp(240);
    if (!game.chooseClass("marshal")) throw new Error("Could not choose Marshal");
    game.forceAllStandardUpgrades("swiftBoots");
    game.grantXp(1200);
    if (!game.chooseMarshalUpgrade("graveWarden")) throw new Error("Could not choose Grave Warden");
    game.forceAllStandardUpgrades("swiftBoots");
    game.grantUpgrade("heavensBounty");
    game.clearEnemies();
    game.setAmmo("coachGun", 2, 0);
    const before = read().ammo.weapons.coachGun;
    const state = read();
    game.spawnZombieAt("walker", state.player.x, state.player.z + 2);
    if (!game.killNearestZombieWithCoachGun(true, true)) throw new Error("Bounty kill failed");
    const after = read().ammo.weapons.coachGun;
    return { before, after };
  });

  expect(bounty.before).toMatchObject({ current: 2, magazine: 2, reserve: 0 });
  expect(bounty.after).toMatchObject({ current: 2, magazine: 2, reserve: 3 });
  expect(bounty.after.reserve - bounty.before.reserve).toBe(Math.ceil(2 * 1.2));
});

test("multiplayer revive grants 20% more reserve and does not alter the magazine or loaded ammo", async ({ page }) => {
  await page.goto(`${fileUrl("index.html")}?mapSeed=123&ammoReward=revive`);
  const intro = page.locator("#intro-screen");
  if (await intro.isVisible().catch(() => false)) {
    await page.keyboard.press("KeyM");
    await expect(intro).toBeHidden();
  }
  await page.waitForFunction(() => Boolean(window.__dustMultiplayerTest && window.__dustAndDeadTest));

  const result = await page.evaluate(() => {
    const api = window.__dustMultiplayerTest;
    api.startMockHost(["Host", "Reviving player"]);
    api.setProgression("mock-player-2", {
      revolverMagazineBonus: 2,
      ammo: { revolver: 5, rifle: 0, launcher: 0, coachGun: 0 },
      ammoReserve: { revolver: 0, rifle: 0, launcher: 0, coachGun: 0 },
    });
    api.setPoints("mock-player-2", 10);
    const before = api.getState().players[1];
    api.damagePlayer("mock-player-2", 999, "mock-player-1");
    if (!api.revive("mock-player-2", "reserve-20-percent")) throw new Error("Revive failed");
    const after = api.getState().players[1];
    return { before, after };
  });

  expect(result.before.progression.ammo.revolver).toBe(5);
  expect(result.after.progression.ammo.revolver).toBe(5);
  expect(result.after.progression.ammoReserve.revolver - result.before.progression.ammoReserve.revolver).toBe(Math.ceil(8 * 3 * 1.2));
  expect(result.after.progression.revolverMagazineBonus).toBe(2);
});
