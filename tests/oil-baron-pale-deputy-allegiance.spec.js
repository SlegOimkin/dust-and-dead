const path = require("node:path");
const { expect, test } = require("@playwright/test");

function fileUrl(relativePath) {
  const absolute = path.resolve(__dirname, "..", relativePath).replace(/\\/g, "/");
  return `file:///${absolute}`;
}

async function openGame(page) {
  await page.goto(`${fileUrl("index.html")}?mapSeed=7331&baronDeputyPact=1`);
  const intro = page.locator("#intro-screen");
  if (await intro.isVisible().catch(() => false)) {
    await page.keyboard.press("KeyM");
    await expect(intro).toBeHidden();
  }
  await page.waitForFunction(() => Boolean(
    window.__dustAndDeadTest?.acceptOilBaronBribe
      && window.__dustMultiplayerTest?.capturePaleDeputyDamageSource
      && window.__dustMultiplayerTest?.applyOilBaronDamageSource
  ));
}

function marshalProgression() {
  return {
    playerClass: "marshal",
    marshalUpgrade: "graveWarden",
    weapon: "coachGun",
    ownedWeapons: { revolver: true, coachGun: true },
    upgradeCounts: { lastRites: 1 },
  };
}

test("a buyer's Pale Deputies stop targeting and damaging the Oil Baron before and after the pact", async ({ page }) => {
  await openGame(page);

  const result = await page.evaluate((progression) => {
    const game = window.__dustAndDeadTest;
    const multiplayer = window.__dustMultiplayerTest;
    multiplayer.startMockHost(["Host Marshal", "Future Buyer"]);
    multiplayer.setProgression("mock-player-1", progression);
    multiplayer.setProgression("mock-player-2", progression);
    game.startWaveNow(10, "oilBaron");
    game.clearEnemies();
    game.setOilBaronAiEnabled(false);

    const boss = game.getOilBaronDiagnostics().boss;
    multiplayer.setPlayerPosition("mock-player-1", boss.x - 7, boss.z);
    multiplayer.setPlayerPosition("mock-player-2", boss.x + 7, boss.z);

    multiplayer.spawnPaleDeputy("mock-player-2", boss.x + 5.5, boss.z);
    window.advanceTime(320);
    const beforeDeal = {
      boss: game.getOilBaronDiagnostics().boss,
      deputies: multiplayer.getPaleDeputyOwnership(),
      combat: multiplayer.getCombatDiagnostics("mock-player-2"),
    };
    const queuedSource = multiplayer.capturePaleDeputyDamageSource("mock-player-2");

    game.acceptOilBaronBribe("mock-player-2");
    const immediatelyAfterDeal = {
      boss: game.getOilBaronDiagnostics().boss,
      deputies: multiplayer.getPaleDeputyOwnership(),
    };
    const queuedImpact = multiplayer.applyOilBaronDamageSource(queuedSource, 80);
    window.advanceTime(900);
    const oldDeputyAfterDeal = {
      boss: game.getOilBaronDiagnostics().boss,
      deputies: multiplayer.getPaleDeputyOwnership(),
      combat: multiplayer.getCombatDiagnostics("mock-player-2"),
    };

    multiplayer.spawnPaleDeputy("mock-player-2", boss.x + 5, boss.z + 0.5);
    window.advanceTime(900);
    const newDeputyAfterDeal = {
      boss: game.getOilBaronDiagnostics().boss,
      deputies: multiplayer.getPaleDeputyOwnership(),
      combat: multiplayer.getCombatDiagnostics("mock-player-2"),
    };

    // The protection is owner-scoped: another Marshal's summon can still hurt
    // the Baron while the buyer's pre-pact damage source cannot.
    multiplayer.spawnPaleDeputy("mock-player-1", boss.x - 5, boss.z);
    const hostSource = multiplayer.capturePaleDeputyDamageSource("mock-player-1");
    const rivalImpact = multiplayer.applyOilBaronDamageSource(hostSource, 1);

    game.damageOilBaron(99999, true, "mock-player-1");
    const defeated = {
      baron: game.getOilBaronDiagnostics(),
      players: multiplayer.getState().players,
      deputies: multiplayer.getPaleDeputyOwnership(),
    };

    // A later encounter must not inherit the expired pact. This also exercises
    // a damage source captured before the original deal.
    game.startWaveNow(10, "oilBaron");
    game.clearEnemies();
    game.setOilBaronAiEnabled(false);
    const restoredImpact = multiplayer.applyOilBaronDamageSource(queuedSource, 1);
    return {
      beforeDeal,
      immediatelyAfterDeal,
      queuedSource,
      queuedImpact,
      oldDeputyAfterDeal,
      newDeputyAfterDeal,
      rivalImpact,
      defeated,
      restoredImpact,
    };
  }, marshalProgression());

  const buyerDeputiesBefore = result.beforeDeal.deputies.filter((unit) => unit.ownerPlayerId === "mock-player-2");
  expect(buyerDeputiesBefore).toHaveLength(1);
  expect(buyerDeputiesBefore[0]).toMatchObject({ targetType: "oilBaron", oilBaronFriendly: false });
  expect(result.beforeDeal.combat.marshalPaleDeputyShots).toBeGreaterThan(0);
  expect(result.queuedSource).toMatchObject({ type: "paleDeputy", ownerPlayerId: "mock-player-2" });

  const buyerImmediately = result.immediatelyAfterDeal.deputies.filter((unit) => unit.ownerPlayerId === "mock-player-2");
  expect(buyerImmediately).toMatchObject([{ targetType: null, oilBaronFriendly: true }]);
  expect(result.queuedImpact).toMatchObject({ applied: 0, ownerPlayerId: "mock-player-2" });
  expect(result.queuedImpact.hpAfter).toBe(result.queuedImpact.hpBefore);

  const buyerOldAfter = result.oldDeputyAfterDeal.deputies.filter((unit) => unit.ownerPlayerId === "mock-player-2");
  expect(buyerOldAfter).toMatchObject([{ targetType: null, oilBaronFriendly: true }]);
  expect(result.oldDeputyAfterDeal.boss.hp).toBe(result.immediatelyAfterDeal.boss.hp);
  expect(result.oldDeputyAfterDeal.combat.marshalPaleDeputyShots).toBe(result.beforeDeal.combat.marshalPaleDeputyShots);

  const buyerNewAfter = result.newDeputyAfterDeal.deputies.filter((unit) => unit.ownerPlayerId === "mock-player-2");
  expect(buyerNewAfter).toHaveLength(2);
  expect(buyerNewAfter.every((unit) => unit.targetType === null && unit.oilBaronFriendly)).toBe(true);
  expect(result.newDeputyAfterDeal.boss.hp).toBe(result.immediatelyAfterDeal.boss.hp);
  expect(result.newDeputyAfterDeal.combat.marshalPaleDeputyShots).toBe(result.beforeDeal.combat.marshalPaleDeputyShots);

  expect(result.rivalImpact.applied).toBe(0.5);
  expect(result.rivalImpact.hpAfter).toBe(result.rivalImpact.hpBefore - 0.5);

  const defeatedBuyer = result.defeated.players.find((player) => player.id === "mock-player-2");
  expect(result.defeated.baron).toMatchObject({ defeated: true, bribe: { boughtPlayerId: "" } });
  expect(defeatedBuyer.oilBaronAlly).toBe(false);
  expect(result.defeated.deputies
    .filter((unit) => unit.ownerPlayerId === "mock-player-2")
    .every((unit) => unit.oilBaronFriendly === false)).toBe(true);

  expect(result.restoredImpact).toMatchObject({ applied: 0.5, ownerPlayerId: "mock-player-2" });
  expect(result.restoredImpact.hpAfter).toBe(result.restoredImpact.hpBefore - 0.5);
});
