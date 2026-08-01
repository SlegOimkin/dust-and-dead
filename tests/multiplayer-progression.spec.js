const path = require("node:path");
const { expect, test } = require("@playwright/test");

function fileUrl(relativePath) {
  const absolute = path.resolve(__dirname, "..", relativePath).replace(/\\/g, "/");
  return `file:///${absolute}`;
}

async function dismissIntro(page) {
  const intro = page.locator("#intro-screen");
  if (await intro.isVisible().catch(() => false)) {
    await page.keyboard.press("KeyM");
    await expect(intro).toBeHidden();
  }
}

async function openGame(page) {
  await page.goto(`${fileUrl("index.html")}?mapSeed=7331`);
  await dismissIntro(page);
  await page.waitForFunction(() => Boolean(window.__dustMultiplayerTest));
}

test("upgrade notification opens solo-style cards and drains stacked rewards without pausing", async ({ page }) => {
  await openGame(page);

  const initial = await page.evaluate(() => {
    const api = window.__dustMultiplayerTest;
    api.startMockHost(["Leveler", "Baseline"]);
    for (let level = 1; level < 5; level += 1) {
      const player = api.getState().players[0];
      api.awardXp("mock-player-1", player.progression.xpToNext - player.progression.xp);
    }
    return {
      multiplayer: api.getState(),
      game: JSON.parse(window.render_game_to_text()),
      soloLevelTitle: document.querySelector("#level-up-choice h2").textContent.trim(),
      soloLevelSubtitle: document.querySelector("#level-up-choice p").textContent.trim(),
    };
  });

  expect(initial.game.mode).toBe("playing");
  expect(initial.game.paused).toBe(false);
  expect(initial.multiplayer.players[0].progression.level).toBe(5);
  expect(initial.multiplayer.players[0].progression.pendingUpgradeLevels).toEqual([2, 3, 4, 5]);
  expect(initial.multiplayer.players[1].progression.level).toBe(1);
  await expect(page.locator("#multiplayer-upgrade-toggle")).toBeVisible();
  await expect(page.locator("#multiplayer-upgrade-pending-count")).toHaveText("4");
  await expect(page.locator("#multiplayer-upgrade-drawer")).not.toHaveClass(/is-open/);

  await page.locator("#multiplayer-upgrade-toggle").click();

  await expect(page.locator("#multiplayer-upgrade-drawer")).toHaveClass(/is-open/);
  await expect(page.locator("#multiplayer-upgrade-drawer")).toHaveAttribute("aria-hidden", "false");
  await expect(page.locator("#multiplayer-upgrade-title")).toHaveText(initial.soloLevelTitle);
  await expect(page.locator("#multiplayer-upgrade-subtitle")).toContainText(initial.soloLevelSubtitle);
  await expect(page.locator("#multiplayer-upgrade-options [data-multiplayer-upgrade]")).toHaveCount(3);

  const firstOffer = await page.evaluate(() => window.__dustMultiplayerTest.getUpgradeOffer("mock-player-1"));
  expect(firstOffer.kind).toBe("standard");
  expect(firstOffer.level).toBe(2);

  const firstCards = await page.locator("#multiplayer-upgrade-options [data-multiplayer-upgrade]").evaluateAll((cards) =>
    cards.map((card) => ({
      id: card.getAttribute("data-multiplayer-upgrade"),
      classCard: card.classList.contains("class-card"),
      upgradeCard: card.classList.contains("upgrade-card"),
      hasSoloMark: Boolean(card.querySelector(".class-card__mark .upgrade-card__symbol svg")),
      title: card.querySelector("strong")?.textContent.trim() || "",
      description: Array.from(card.children).at(-1)?.textContent.trim() || "",
    }))
  );
  expect(firstCards.map((card) => card.id)).toEqual(firstOffer.choices);
  expect(firstCards.every((card) => card.classCard && card.upgradeCard && card.hasSoloMark)).toBe(true);
  expect(firstCards.every((card) => card.title.length > 0 && card.description.length > 0)).toBe(true);

  await page.locator("#multiplayer-upgrade-options [data-multiplayer-upgrade]").first().click();

  const afterFirstChoice = await page.evaluate(() => ({
    offer: window.__dustMultiplayerTest.getUpgradeOffer("mock-player-1"),
    multiplayer: window.__dustMultiplayerTest.getState(),
    game: JSON.parse(window.render_game_to_text()),
  }));
  expect(afterFirstChoice.offer.id).not.toBe(firstOffer.id);
  expect(afterFirstChoice.offer.level).toBe(3);
  expect(afterFirstChoice.multiplayer.players[0].progression.pendingUpgradeLevels).toEqual([3, 4, 5]);
  expect(afterFirstChoice.game.mode).toBe("playing");
  expect(afterFirstChoice.game.paused).toBe(false);
  await expect(page.locator("#multiplayer-upgrade-drawer")).toHaveClass(/is-open/);
  await expect(page.locator("#multiplayer-upgrade-pending-count")).toHaveText("3");
  await expect(page.locator("#multiplayer-upgrade-subtitle")).toContainText(initial.soloLevelSubtitle);

  // Levels 3 and 4 are shown immediately one after another in the same open window.
  await page.locator("#multiplayer-upgrade-options [data-multiplayer-upgrade]").first().click();
  await expect(page.locator("#multiplayer-upgrade-pending-count")).toHaveText("2");
  await page.locator("#multiplayer-upgrade-options [data-multiplayer-upgrade]").first().click();
  await expect(page.locator("#multiplayer-upgrade-pending-count")).toHaveText("1");

  const classParity = await page.evaluate(() => {
    const normalize = (value) => value.replace(/\s+/g, " ").trim();
    // The responsive icon fitter adjusts viewBox to the card's actual size; all other solo markup must stay identical.
    const normalizeMarkup = (value) => normalize(value).replace(/ viewBox="[^"]*"/gi, "");
    const multiplayerCards = Array.from(document.querySelectorAll("#multiplayer-upgrade-options [data-multiplayer-upgrade]"));
    return {
      multiplayerTitle: document.getElementById("multiplayer-upgrade-title").textContent.trim(),
      multiplayerSubtitle: document.getElementById("multiplayer-upgrade-subtitle").textContent.trim(),
      soloTitle: document.querySelector("#class-choice h2").textContent.trim(),
      soloSubtitle: document.querySelector("#class-choice p").textContent.trim(),
      cards: multiplayerCards.map((card) => {
        const id = card.getAttribute("data-multiplayer-upgrade");
        const soloCard = document.querySelector(`#class-choice [data-class="${id}"]`);
        const multiplayerMarkup = normalizeMarkup(card.innerHTML);
        const soloMarkup = normalizeMarkup(soloCard.innerHTML);
        return {
          id,
          sameText: normalize(card.textContent) === normalize(soloCard.textContent),
          sameMarkup: multiplayerMarkup === soloMarkup,
          keepsSoloClasses: Array.from(soloCard.classList).every((className) => card.classList.contains(className)),
          sameRank: card.getAttribute("data-rank") === soloCard.getAttribute("data-rank"),
          sameSuit: card.getAttribute("data-suit") === soloCard.getAttribute("data-suit"),
        };
      }),
    };
  });

  expect(classParity.multiplayerTitle).toBe(classParity.soloTitle);
  expect(classParity.multiplayerSubtitle).toBe(classParity.soloSubtitle);
  expect(classParity.cards.map((card) => card.id)).toEqual(["gunslinger", "ranger", "demolitionist", "marshal"]);
  expect(
    classParity.cards.every((card) => card.sameText && card.sameMarkup && card.keepsSoloClasses && card.sameRank && card.sameSuit),
    JSON.stringify(classParity.cards, null, 2)
  ).toBe(true);

  await page.locator('[data-multiplayer-upgrade="ranger"]').click();

  const result = await page.evaluate(() => ({
    state: window.__dustMultiplayerTest.getState(),
    game: JSON.parse(window.render_game_to_text()),
  }));
  expect(result.state.players[0].progression.playerClass).toBe("ranger");
  expect(result.state.players[0].progression.weapon).toBe("rifle");
  expect(result.state.players[1].progression.playerClass).toBeNull();
  expect(result.game.mode).toBe("playing");
  expect(result.game.paused).toBe(false);
  await expect(page.locator("#multiplayer-upgrade-pending-count")).toHaveText("0");
  await expect(page.locator("#multiplayer-upgrade-drawer")).not.toHaveClass(/is-open/);
  await expect(page.locator("#multiplayer-upgrade-drawer")).toHaveAttribute("aria-hidden", "true");
});

test("the host snapshots the authoritative local progression and upgraded weapon", async ({ page }) => {
  await openGame(page);

  const snapshot = await page.evaluate(() => {
    const api = window.__dustMultiplayerTest;
    api.startMockHost(["Host", "Phone"]);
    for (let level = 1; level < 5; level += 1) {
      const player = api.getState().players[1];
      api.awardXp("mock-player-2", player.progression.xpToNext - player.progression.xp);
    }
    while (true) {
      const offer = api.getUpgradeOffer("mock-player-2");
      if (offer.kind === "class") {
        api.chooseUpgrade("mock-player-2", "demolitionist", offer.id);
        break;
      }
      api.chooseUpgrade("mock-player-2", offer.choices[0], offer.id);
    }
    return api.buildSnapshot();
  });

  const guest = await page.evaluate((authoritativeSnapshot) => {
    const api = window.__dustMultiplayerTest;
    api.startMockGuest(["Host", "Phone"], 1);
    api.applySnapshot(authoritativeSnapshot);
    return {
      state: api.getState(),
      game: JSON.parse(window.render_game_to_text()),
    };
  }, snapshot);

  expect(guest.state.players[1].progression.level).toBe(5);
  expect(guest.state.players[1].progression.playerClass).toBe("demolitionist");
  expect(guest.state.players[1].progression.weapon).toBe("launcher");
  expect(guest.game.weapon).toBe("launcher");
  expect(guest.game.mode).toBe("playing");
});

test("class weapons use the shared authoritative projectile path", async ({ page }) => {
  await openGame(page);

  const projectile = await page.evaluate(() => {
    const api = window.__dustMultiplayerTest;
    api.startMockHost(["Ranger", "Target"]);
    for (let level = 1; level < 5; level += 1) {
      const player = api.getState().players[0];
      api.awardXp("mock-player-1", player.progression.xpToNext - player.progression.xp);
    }
    while (true) {
      const offer = api.getUpgradeOffer("mock-player-1");
      if (offer.kind === "class") {
        api.chooseUpgrade("mock-player-1", "ranger", offer.id);
        break;
      }
      api.chooseUpgrade("mock-player-1", offer.choices[0], offer.id);
    }
    const state = api.getState();
    api.setPlayerPosition("mock-player-2", state.players[0].x + 8, state.players[0].z);
    api.fireAt("mock-player-1", state.players[0].x + 8, state.players[0].z);
    const snapshot = api.buildSnapshot();
    return snapshot.bullets[0];
  });

  expect(projectile).toBeTruthy();
  expect(projectile.ownerId).toBe("mock-player-1");
  expect(projectile.type).toBe("rifle");
});

test("a zombie kill awards points immediately but XP only after its orb is collected", async ({ page }) => {
  await openGame(page);

  const result = await page.evaluate(() => {
    const multiplayer = window.__dustMultiplayerTest;
    const game = window.__dustAndDeadTest;
    const initial = multiplayer.startMockHost(["Hunter", "Observer"]);
    const hunter = initial.players[0];
    multiplayer.setPlayerPosition("mock-player-2", hunter.x - 20, hunter.z - 20);
    game.spawnZombieAt("walker", hunter.x + 12, hunter.z);
    window.advanceTime(100);
    for (let shot = 0; shot < 6; shot += 1) {
      multiplayer.fireAt("mock-player-1", hunter.x + 12, hunter.z);
      window.advanceTime(320);
      if (multiplayer.getState().players[0].zombieKills > 0) break;
    }
    const beforePickup = { state: multiplayer.getState(), orbs: multiplayer.getXpOrbs() };
    multiplayer.setPlayerPosition("mock-player-1", hunter.x + 9, hunter.z);
    window.advanceTime(1600);
    const afterPickup = { state: multiplayer.getState(), orbs: multiplayer.getXpOrbs() };
    return { beforePickup, afterPickup };
  });

  expect(result.beforePickup.state.players[0].zombieKills).toBe(1);
  expect(result.beforePickup.state.players[0].points).toBe(1);
  expect(result.beforePickup.state.players[0].progression.totalXp).toBe(0);
  expect(result.beforePickup.orbs.length).toBeGreaterThan(0);
  expect(result.beforePickup.state.players[1].zombieKills).toBe(0);
  expect(result.beforePickup.state.players[1].points).toBe(0);
  expect(result.beforePickup.state.players[1].progression.totalXp).toBe(0);
  expect(result.afterPickup.state.players[0].progression.totalXp).toBeGreaterThan(0);
  expect(result.afterPickup.state.players[1].progression.totalXp).toBe(0);
  expect(result.afterPickup.orbs).toEqual([]);
});

test("a remote guest fire claim owns its kill, career credit, perk, and local HUD count", async ({ page }) => {
  await openGame(page);

  const result = await page.evaluate(() => {
    const multiplayer = window.__dustMultiplayerTest;
    const game = window.__dustAndDeadTest;
    const started = multiplayer.startMockHost(["Host", "Guest"]);
    const guest = started.players[1];
    game.startWaveNow(1);
    multiplayer.setPlayerPosition("mock-player-1", guest.x - 20, guest.z - 20);
    multiplayer.setProgression("mock-player-2", {
      playerClass: "gunslinger",
      weapon: "revolver",
      revolverUpgrade: "dualRevolvers",
      ownedWeapons: { revolver: true, rifle: false, launcher: false, coachGun: false },
      upgradeCounts: { fanTheHammer: 1 },
      ammo: { revolver: 6, rifle: 18, launcher: 3, coachGun: 2 },
      ammoReserve: { revolver: 30, rifle: 54, launcher: 9, coachGun: 12 },
      reloadTimers: { revolver: 0, rifle: 0, launcher: 0, coachGun: 0 },
    });
    const target = multiplayer.spawnEnemyAt(guest.x + 4, guest.z, "walker", 1);
    const dx = target.x - guest.x;
    const dz = target.z - guest.z;
    const accepted = multiplayer.injectFireAction(
      "mock-player-2",
      1,
      Math.atan2(dx, dz),
      Math.hypot(dx, dz),
      {
        weaponId: "revolver",
        targetKind: "enemy",
        targetId: target.id,
        targetX: target.x,
        targetZ: target.z,
      }
    );
    // One normal frame consumes the endpoint-owned action; stepping only the
    // projectile then avoids unrelated wave spawns in this attribution probe.
    window.advanceTime(17);
    multiplayer.stepBullets(0.25);
    window.advanceTime(17);

    const hostState = multiplayer.getState();
    const hostCombat = multiplayer.getCombatDiagnostics("mock-player-1");
    const guestCombat = multiplayer.getCombatDiagnostics("mock-player-2");
    const hostHud = document.getElementById("kills-value").textContent;
    const snapshot = multiplayer.buildSnapshot(false, false, "mock-player-2");

    multiplayer.startMockGuest(["Host", "Guest"], 1);
    multiplayer.applySnapshot(snapshot);
    window.advanceTime(17);
    return {
      accepted,
      hostState,
      hostCombat,
      guestCombat,
      hostHud,
      guestHud: document.getElementById("kills-value").textContent,
      guestState: multiplayer.getState(),
    };
  });

  const host = result.hostState.players[0];
  const guest = result.hostState.players[1];
  expect(result.accepted).toBe(true);
  expect(host).toMatchObject({ points: 0, zombieKills: 0 });
  expect(guest).toMatchObject({ points: 1, zombieKills: 1 });
  expect(host.career.k[0]).toBe(0);
  expect(host.career.w[0]).toBe(0);
  expect(guest.career.k[0]).toBe(1);
  expect(guest.career.w[0]).toBe(1);
  expect(result.hostCombat.fanTheHammerTimer).toBe(0);
  expect(result.guestCombat.fanTheHammerTimer).toBeGreaterThan(1.5);
  expect(result.hostHud).toBe("0");
  expect(result.guestHud).toBe("1");
  expect(result.guestState.players[1]).toMatchObject({ points: 1, zombieKills: 1 });
});

test("level ten branch selection is queued behind earlier rewards without pausing", async ({ page }) => {
  await openGame(page);

  const result = await page.evaluate(() => {
    const api = window.__dustMultiplayerTest;
    api.startMockHost(["Branch", "Other"]);
    for (let level = 1; level < 10; level += 1) {
      const player = api.getState().players[0];
      api.awardXp("mock-player-1", player.progression.xpToNext - player.progression.xp);
    }
    while (true) {
      const offer = api.getUpgradeOffer("mock-player-1");
      if (offer.kind === "class") api.chooseUpgrade("mock-player-1", "ranger", offer.id);
      else if (offer.kind === "rifleBranch") {
        api.chooseUpgrade("mock-player-1", "trailWarden", offer.id);
        break;
      } else api.chooseUpgrade("mock-player-1", offer.choices[0], offer.id);
    }
    return {
      state: api.getState(),
      game: JSON.parse(window.render_game_to_text()),
    };
  });

  expect(result.state.players[0].progression.level).toBe(10);
  expect(result.state.players[0].progression.playerClass).toBe("ranger");
  expect(result.state.players[0].progression.rifleUpgrade).toBe("trailWarden");
  expect(result.state.players[0].progression.pendingUpgradeLevels).toEqual([]);
  expect(result.game.mode).toBe("playing");
  expect(result.game.paused).toBe(false);
});

test("weapon ammunition is isolated between multiplayer players", async ({ page }) => {
  await openGame(page);

  const ammo = await page.evaluate(() => {
    const api = window.__dustMultiplayerTest;
    const initial = api.startMockHost(["Shooter", "Loaded"]);
    api.setPlayerPosition("mock-player-2", initial.players[0].x + 12, initial.players[0].z);
    api.fireAt("mock-player-1", initial.players[0].x + 12, initial.players[0].z);
    const state = api.getState();
    return {
      shooter: state.players[0].progression.ammo.revolver,
      other: state.players[1].progression.ammo.revolver,
    };
  });

  expect(ammo.shooter).toBeLessThan(ammo.other);
  expect(ammo.other).toBe(6);
});
