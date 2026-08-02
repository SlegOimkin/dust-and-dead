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

function marshalProgression(upgrades = {}) {
  return {
    playerClass: "marshal",
    marshalUpgrade: "graveWarden",
    weapon: "coachGun",
    ownedWeapons: { revolver: true, coachGun: true },
    upgradeCounts: upgrades,
  };
}

test("Marshal marks, bounties, and remote Rock Salt remain owner-scoped", async ({ page }) => {
  await openGame(page);

  const result = await page.evaluate(({ hostProgression, remoteProgression }) => {
    const multiplayer = window.__dustMultiplayerTest;
    const game = window.__dustAndDeadTest;
    const started = multiplayer.startMockHost(["Host Marshal", "Remote Marshal"]);
    multiplayer.setProgression("mock-player-1", hostProgression);
    multiplayer.setProgression("mock-player-2", remoteProgression);
    const remote = started.players[1];
    game.spawnZombieAt("walker", remote.x + 4, remote.z);
    return {
      mark: multiplayer.applyMarshalEffectToFirstEnemy("mock-player-2", "mark", 4),
      bounty: multiplayer.applyMarshalEffectToFirstEnemy("mock-player-2", "bounty", 8),
      game: JSON.parse(window.render_game_to_text()),
    };
  }, {
    hostProgression: marshalProgression({}),
    remoteProgression: marshalProgression({ rockSalt: 1, heavensBounty: 1 }),
  });

  expect(result.mark.markedBy).toEqual({
    "mock-player-1": false,
    "mock-player-2": true,
  });
  expect(result.mark.bountyBy).toEqual({
    "mock-player-1": false,
    "mock-player-2": false,
  });
  expect(result.mark.rockSaltSlowed).toBe(true);
  expect(result.bounty.bountyBy).toEqual({
    "mock-player-1": false,
    "mock-player-2": true,
  });
  expect(result.game.mode).toBe("playing");
  expect(result.game.paused).toBe(false);
});

test("Hallowed Ground shortens reload only for its owning Marshal", async ({ page }) => {
  await openGame(page);

  const reload = await page.evaluate((progression) => {
    const multiplayer = window.__dustMultiplayerTest;
    const started = multiplayer.startMockHost(["Visitor", "Ground Owner"]);
    multiplayer.setProgression("mock-player-1", progression);
    multiplayer.setProgression("mock-player-2", progression);
    const owner = started.players[1];
    multiplayer.setPlayerPosition("mock-player-1", owner.x, owner.z);
    multiplayer.setPlayerPosition("mock-player-2", owner.x, owner.z);
    multiplayer.spawnHallowedGround("mock-player-2", 5);
    const times = {
      visitor: multiplayer.getCoachGunReloadTime("mock-player-1"),
      owner: multiplayer.getCoachGunReloadTime("mock-player-2"),
    };
    multiplayer.damagePlayer("mock-player-1", 10, "");
    multiplayer.damagePlayer("mock-player-2", 10, "");
    const hurt = multiplayer.getState().players;
    window.advanceTime(1000);
    const healed = multiplayer.getState().players;
    return {
      ...times,
      visitorHurtHp: hurt[0].hp,
      ownerHurtHp: hurt[1].hp,
      visitorHealedHp: healed[0].hp,
      ownerHealedHp: healed[1].hp,
    };
  }, marshalProgression({ hallowedGround: 1 }));

  expect(reload.visitor).toBeGreaterThan(reload.owner);
  expect(reload.visitor / reload.owner).toBeCloseTo(1.35, 5);
  expect(reload.ownerHurtHp).toBeCloseTo(reload.visitorHurtHp, 4);
  expect(reload.visitorHealedHp).toBeCloseTo(reload.visitorHurtHp, 4);
  expect(reload.ownerHealedHp - reload.ownerHurtHp).toBeCloseTo(1, 1);
});

test("remote Pale Deputies use owner-local formations and fight outside the host viewport", async ({ page }) => {
  await openGame(page);

  const result = await page.evaluate((progression) => {
    const multiplayer = window.__dustMultiplayerTest;
    const game = window.__dustAndDeadTest;
    multiplayer.startMockHost(["Host", "Remote Deputy Owner"]);
    multiplayer.setProgression("mock-player-1", progression);
    multiplayer.setProgression("mock-player-2", progression);
    multiplayer.setPlayerPosition("mock-player-2", 82, 82);
    const state = multiplayer.getState();
    const host = state.players[0];
    const remote = state.players[1];

    multiplayer.spawnPaleDeputy("mock-player-1", host.x, host.z);
    multiplayer.spawnPaleDeputy("mock-player-2", remote.x, remote.z);
    multiplayer.spawnPaleDeputy("mock-player-1", host.x, host.z);
    multiplayer.spawnPaleDeputy("mock-player-2", remote.x, remote.z);
    game.spawnZombieAt("walker", remote.x + 3.5, remote.z);
    window.advanceTime(900);

    return {
      deputies: multiplayer.getPaleDeputyOwnership(),
      remoteCombat: multiplayer.getCombatDiagnostics("mock-player-2"),
    };
  }, marshalProgression({ lastRites: 1 }));

  const hostDeputies = result.deputies.filter((deputy) => deputy.ownerPlayerId === "mock-player-1");
  const remoteDeputies = result.deputies.filter((deputy) => deputy.ownerPlayerId === "mock-player-2");
  expect(hostDeputies.map((deputy) => deputy.formationIndex)).toEqual([0, 1]);
  expect(remoteDeputies.map((deputy) => deputy.formationIndex)).toEqual([0, 1]);
  expect(remoteDeputies.every((deputy) => deputy.distanceToOwner < 8)).toBe(true);
  expect(result.remoteCombat.marshalPaleDeputyShots).toBeGreaterThan(0);
});
