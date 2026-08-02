const path = require("node:path");
const { expect, test } = require("@playwright/test");

const PROGRESSION_STORAGE_KEY = "dustAndDeadMetaProgression.v1";
const CHALLENGE_COUNT = 14;

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

async function openGame(page, { reset = true } = {}) {
  await page.goto(`${fileUrl("index.html")}?mapSeed=7351&challengesTest=1`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForFunction(() => Boolean(
    window.DustAndDeadProgression &&
    window.DustAndDeadProgression.getChallenges &&
    window.__dustAndDeadTest &&
    window.__dustAndDeadTest.getChallengeDiagnostics &&
    window.__dustMultiplayerTest
  ));
  if (reset) {
    await page.evaluate(() => window.DustAndDeadProgression.resetForTest());
  }
  await dismissIntro(page);
}

async function startHunt(page) {
  await page.getByRole("button", { name: "Start Hunt" }).click();
  await page.waitForFunction(() => {
    try {
      return JSON.parse(window.render_game_to_text()).mode === "playing";
    } catch (error) {
      return false;
    }
  });
}

test.afterEach(async ({ page }) => {
  if (page.isClosed()) return;
  await page.evaluate((storageKey) => {
    if (window.DustAndDeadProgression) {
      window.DustAndDeadProgression.resetForTest();
    } else {
      window.localStorage.removeItem(storageKey);
    }
  }, PROGRESSION_STORAGE_KEY).catch(() => {});
});

test("challenge catalog carries fourteen feats with trophy rewards and persistent pinning", async ({ page }) => {
  await openGame(page);

  const result = await page.evaluate(() => {
    const progression = window.DustAndDeadProgression;
    const challenges = progression.getChallenges();
    const pin = progression.setPinnedChallenge("boss.bellRinger.silence");
    const repin = progression.setPinnedChallenge("boss.bellRinger.silence");
    const unknown = progression.setPinnedChallenge("nope.not.real");
    return {
      challenges,
      groups: challenges.reduce((counts, challenge) => {
        counts[challenge.group] = (counts[challenge.group] || 0) + 1;
        return counts;
      }, {}),
      rewardless: challenges.filter((challenge) => !challenge.rewards.length).map((c) => c.id),
      pinAccepted: pin.accepted,
      repinReason: repin.reason,
      unknownReason: unknown.reason,
      pinnedId: progression.getPinnedChallengeId(),
      stored: JSON.parse(window.localStorage.getItem("dustAndDeadMetaProgression.v1")).challenges,
    };
  });

  expect(result.challenges).toHaveLength(CHALLENGE_COUNT);
  expect(new Set(result.challenges.map((challenge) => challenge.id)).size).toBe(CHALLENGE_COUNT);
  expect(result.groups).toEqual({ bosses: 7, classes: 6, rare: 1 });
  // Every challenge pays out at least one wardrobe trophy.
  expect(result.rewardless).toEqual([]);
  expect(result.pinAccepted).toBe(true);
  expect(result.repinReason).toBe("already-pinned");
  expect(result.unknownReason).toBe("unknown-challenge");
  expect(result.pinnedId).toBe("boss.bellRinger.silence");
  expect(result.stored.pinnedId).toBe("boss.bellRinger.silence");

  // The pin survives a reload.
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Boolean(window.DustAndDeadProgression));
  expect(await page.evaluate(() => window.DustAndDeadProgression.getPinnedChallengeId()))
    .toBe("boss.bellRinger.silence");
});

test("completing a challenge unlocks its trophy skins exactly once", async ({ page }) => {
  await openGame(page);

  const result = await page.evaluate(() => {
    const progression = window.DustAndDeadProgression;
    const find = (slot, id) => progression
      .getCosmeticCatalog()[slot]
      .find((entry) => entry.id === id);

    const lockedBefore = {
      silverGhost: find("cowboys", "silverGhost").unlocked,
      powderSaint: find("cowboys", "powderSaint").unlocked,
      fuseHalo: find("hats", "fuseHalo").unlocked,
    };
    const equipLocked = progression.selectCosmetic("cowboy", "silverGhost");
    const ghost = progression.recordChallengeCompleted("rare.silverGhost");
    const ghostAgain = progression.recordChallengeCompleted("rare.silverGhost");
    const fuse = progression.recordChallengeCompleted("class.demolitionist.oneFuse");
    const equipUnlocked = progression.selectCosmetic("cowboy", "silverGhost");
    return {
      lockedBefore,
      equipLockedReason: equipLocked.reason,
      ghostAccepted: ghost.accepted,
      ghostChallengeId: ghost.challengeId,
      ghostAgainReason: ghostAgain.reason,
      fuseAccepted: fuse.accepted,
      unlockedAfter: {
        silverGhost: find("cowboys", "silverGhost").unlocked,
        powderSaint: find("cowboys", "powderSaint").unlocked,
        fuseHalo: find("hats", "fuseHalo").unlocked,
        livingBarrow: find("cowboys", "livingBarrow").unlocked,
      },
      equipAccepted: equipUnlocked.accepted,
      profile: progression.getCosmeticProfile(),
      snapshot: progression.getSnapshot().challenges,
    };
  });

  expect(result.lockedBefore).toEqual({ silverGhost: false, powderSaint: false, fuseHalo: false });
  expect(result.equipLockedReason).toBe("cosmetic-locked");
  expect(result.ghostAccepted).toBe(true);
  expect(result.ghostChallengeId).toBe("rare.silverGhost");
  expect(result.ghostAgainReason).toBe("already-completed");
  expect(result.fuseAccepted).toBe(true);
  // One Fuse pays out both halves of the Powder Saint set; other feats stay sealed.
  expect(result.unlockedAfter).toEqual({
    silverGhost: true,
    powderSaint: true,
    fuseHalo: true,
    livingBarrow: false,
  });
  expect(result.equipAccepted).toBe(true);
  expect(result.profile.cowboyId).toBe("silverGhost");
  expect(result.snapshot.completedCount).toBe(2);
});

test("challenges screen lists every feat and pins from the card", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openGame(page);

  await page.locator("#challenges-btn").click();
  const dialog = page.locator("#challenges-menu");
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute("aria-hidden", "false");
  await expect(page.locator("#challenges-list .challenge-card")).toHaveCount(CHALLENGE_COUNT);
  await expect(page.locator("#challenges-completed-value")).toHaveText(`0 / ${CHALLENGE_COUNT}`);

  const silenceCard = page.locator('[data-challenge-id="boss.bellRinger.silence"]');
  await silenceCard.locator("[data-challenge-pin]").click();
  await expect(silenceCard.locator("[data-challenge-pin]")).toHaveAttribute("aria-pressed", "true");
  expect(await page.evaluate(() => window.DustAndDeadProgression.getPinnedChallengeId()))
    .toBe("boss.bellRinger.silence");

  // Pinning another card moves the single pin.
  const ghostCard = page.locator('[data-challenge-id="rare.silverGhost"]');
  await ghostCard.locator("[data-challenge-pin]").click();
  await expect(ghostCard.locator("[data-challenge-pin]")).toHaveAttribute("aria-pressed", "true");
  await expect(silenceCard.locator("[data-challenge-pin]")).toHaveAttribute("aria-pressed", "false");

  // Completed cards seal and hide their pin control.
  await page.evaluate(() => window.DustAndDeadProgression.recordChallengeCompleted("class.any.oneGun"));
  const oneGunCard = page.locator('[data-challenge-id="class.any.oneGun"]');
  await expect(oneGunCard).toHaveClass(/is-complete/);
  await expect(oneGunCard.locator("[data-challenge-pin]")).toBeHidden();
  await expect(page.locator("#challenges-completed-value")).toHaveText(`1 / ${CHALLENGE_COUNT}`);

  await page.locator("#challenges-back-btn").click();
  await expect(dialog).toBeHidden();
  await expect(page.locator("#menu")).toBeVisible();
});

test("mobile challenge cards keep every pin control inside the card", async ({ page }) => {
  await page.setViewportSize({ width: 2048, height: 945 });
  await openGame(page);
  await page.evaluate(() => {
    document.documentElement.classList.add("is-mobile-runtime");
    window.DustAndDeadI18n.setLocale("ru", { persist: false });
  });

  await page.locator("#challenges-btn").click();
  await expect(page.locator("#challenges-menu")).toBeVisible();
  await expect(page.locator("#challenges-list .challenge-card")).toHaveCount(CHALLENGE_COUNT);

  const cards = await page.locator("#challenges-list .challenge-card").evaluateAll((elements) =>
    elements.map((card) => {
      const button = card.querySelector("[data-challenge-pin]");
      const cardRect = card.getBoundingClientRect();
      const buttonRect = button ? button.getBoundingClientRect() : null;
      return {
        card: {
          left: cardRect.left,
          top: cardRect.top,
          right: cardRect.right,
          bottom: cardRect.bottom,
        },
        button: buttonRect ? {
          left: buttonRect.left,
          top: buttonRect.top,
          right: buttonRect.right,
          bottom: buttonRect.bottom,
          width: buttonRect.width,
          height: buttonRect.height,
          clientWidth: button.clientWidth,
          scrollWidth: button.scrollWidth,
          display: getComputedStyle(button).display,
        } : null,
      };
    })
  );

  for (const [index, item] of cards.entries()) {
    expect(item.button, `challenge ${index + 1} must have a pin button`).toBeTruthy();
    expect(item.button.display).not.toBe("none");
    expect(item.button.width).toBeGreaterThan(0);
    expect(item.button.height).toBeGreaterThanOrEqual(32);
    expect(item.button.left).toBeGreaterThanOrEqual(item.card.left - 1);
    expect(item.button.right).toBeLessThanOrEqual(item.card.right + 1);
    expect(item.button.top).toBeGreaterThanOrEqual(item.card.top - 1);
    expect(item.button.bottom).toBeLessThanOrEqual(item.card.bottom + 1);
    expect(item.button.scrollWidth).toBeLessThanOrEqual(item.button.clientWidth + 1);
  }
});

test("the pause menu tracks a pinned boss feat live while the play field stays clear", async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => {
    window.DustAndDeadProgression.setPinnedChallenge("rare.silverGhost");
  });
  await startHunt(page);

  const hud = page.locator("#challenge-hud");
  const pausePin = page.locator("#pause-challenge");

  // Nothing has happened to the feat yet, so the play field carries no badge.
  await page.evaluate(() => window.advanceTime(100));
  await expect(hud).toBeHidden();

  // The standing readout lives in the pause menu instead.
  await page.locator("#pause-menu-btn").click();
  await expect(pausePin).toBeVisible();
  await expect(pausePin).toHaveClass(/is-waiting/);
  await expect(page.locator("#pause-challenge-name")).toHaveText("Silver Ghost");
  await page.locator("#pause-continue-btn").click();
  await expect(page.locator("#pause-menu")).toBeHidden();

  await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    game.startWaveNow(10, "landEater");
    game.setLandEaterAiEnabled(false);
    window.advanceTime(100);
  });
  await expect(hud).toBeHidden();
  await page.locator("#pause-menu-btn").click();
  await expect(pausePin).toHaveClass(/is-holding/);
  await page.locator("#pause-continue-btn").click();
  await expect(page.locator("#pause-menu")).toBeHidden();

  const beforeDamage = await page.evaluate(() => window.__dustAndDeadTest.getChallengeDiagnostics());
  expect(beforeDamage.trackingActive).toBe(true);
  expect(beforeDamage.bossFight).toMatchObject({ kind: "landEater", tookDamage: false });

  await page.evaluate(() => {
    window.__dustAndDeadTest.damagePlayerForTest(10);
    window.advanceTime(100);
  });
  const afterDamage = await page.evaluate(() => window.__dustAndDeadTest.getChallengeDiagnostics());
  expect(afterDamage.bossFight).toMatchObject({ kind: "landEater", tookDamage: true });

  // Failure is the one thing that surfaces in-run, and only for a moment.
  await expect(hud).toBeVisible();
  await expect(hud).toHaveClass(/is-failed/);
  await expect(page.locator("#challenge-hud-name")).toHaveText("Silver Ghost");
  await page.evaluate(() => window.advanceTime(3200));
  await expect(hud).toBeHidden();

  // The run continues: the mode stays "playing" after the failure.
  expect(await page.evaluate(() => JSON.parse(window.render_game_to_text()).mode)).toBe("playing");
});

test("a flawless boss kill seals Silver Ghost and the boss's own feat", async ({ page }) => {
  await openGame(page);
  await startHunt(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    // NOTE: clearEnemies() suspends the wave for career purposes, which also
    // freezes challenge tracking — these scenarios must run unsuspended.
    game.startWaveNow(10, "landEater");
    game.setLandEaterAiEnabled(false);
    window.advanceTime(200);
    game.forceActiveBossDefeat();
    window.advanceTime(200);
    const progression = window.DustAndDeadProgression;
    return {
      silverGhost: progression.isChallengeCompleted("rare.silverGhost"),
      untouched: progression.isChallengeCompleted("boss.landEater.untouched"),
      others: progression.getChallenges()
        .filter((challenge) => challenge.completed)
        .map((challenge) => challenge.id)
        .sort(),
      surveyorsCap: progression.getCosmeticCatalog().hats
        .find((entry) => entry.id === "surveyorsCap").unlocked,
      lastSurveyor: progression.getCosmeticCatalog().cowboys
        .find((entry) => entry.id === "lastSurveyor").unlocked,
    };
  });

  expect(result.silverGhost).toBe(true);
  expect(result.untouched).toBe(true);
  expect(result.others).toEqual(["boss.landEater.untouched", "rare.silverGhost"]);
  // First win opens the hat, the flawless feat opens the outfit half of the set.
  expect(result.surveyorsCap).toBe(true);
  expect(result.lastSurveyor).toBe(true);
});

test("a damaged boss kill still counts the win but not the flawless feats", async ({ page }) => {
  await openGame(page);
  await startHunt(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    game.startWaveNow(10, "landEater");
    game.setLandEaterAiEnabled(false);
    window.advanceTime(200);
    game.damagePlayerForTest(8);
    window.advanceTime(200);
    game.forceActiveBossDefeat();
    window.advanceTime(200);
    const progression = window.DustAndDeadProgression;
    return {
      completed: progression.getChallenges()
        .filter((challenge) => challenge.completed)
        .map((challenge) => challenge.id),
      bossWins: progression.getSnapshot().stats.bossesByType.landEater,
    };
  });

  expect(result.completed).toEqual([]);
  expect(result.bossWins).toBe(1);
});

test("the Hordeheart heartbeat feat times the four quarters from the first fall", async ({ page }) => {
  await openGame(page);
  await startHunt(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    game.startWaveNow(10, "hordeheart");
    game.setHordeheartAiEnabled(false);
    game.forceHordeheartPhase("quarters");
    window.advanceTime(300);
    const diagnosticsBefore = game.getChallengeDiagnostics();
    for (let index = 0; index < 4; index += 1) {
      game.damageHordeheart(9999999, index);
      window.advanceTime(120);
    }
    window.advanceTime(200);
    const progression = window.DustAndDeadProgression;
    return {
      kindBefore: diagnosticsBefore.bossFight && diagnosticsBefore.bossFight.kind,
      heartbeat: progression.isChallengeCompleted("boss.hordeheart.heartbeat"),
      livingBarrow: progression.getCosmeticCatalog().cowboys
        .find((entry) => entry.id === "livingBarrow").unlocked,
      barrowCrown: progression.getCosmeticCatalog().hats
        .find((entry) => entry.id === "barrowCrown").unlocked,
    };
  });

  expect(result.kindBefore).toBe("hordeheart");
  expect(result.heartbeat).toBe(true);
  expect(result.livingBarrow).toBe(true);
  expect(result.barrowCrown).toBe(true);
});

test("the Pale Posse feat needs three deputies standing when the boss falls", async ({ page }) => {
  await openGame(page);
  await startHunt(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    game.startWaveNow(10, "bellRinger");
    game.setBellRingerAiEnabled(false);
    game.spawnPaleDeputyAt(2, 2);
    game.spawnPaleDeputyAt(-2, 2);
    window.advanceTime(200);
    game.forceActiveBossDefeat();
    window.advanceTime(200);
    const withTwo = window.DustAndDeadProgression.isChallengeCompleted("class.marshal.palePosse");

    game.startWaveNow(15, "bellRinger");
    game.setBellRingerAiEnabled(false);
    game.spawnPaleDeputyAt(2, 2);
    game.spawnPaleDeputyAt(-2, 2);
    game.spawnPaleDeputyAt(0, 3);
    window.advanceTime(200);
    game.forceActiveBossDefeat();
    window.advanceTime(200);
    return {
      withTwo,
      withThree: window.DustAndDeadProgression.isChallengeCompleted("class.marshal.palePosse"),
    };
  });

  expect(result.withTwo).toBe(false);
  expect(result.withThree).toBe(true);
});

test("One Gun, One Fate seals on reaching wave 15 with the class weapon", async ({ page }) => {
  await openGame(page);
  await startHunt(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    // grantXp would park the run on the level-up panel; assign the class
    // directly so the mode stays "playing" for career-eligible tracking.
    game.configureBossWeaponBuildForTest({ playerClass: "gunslinger", revolverUpgrade: "dualRevolvers" });
    window.advanceTime(100);
    const beforeWave = window.DustAndDeadProgression.isChallengeCompleted("class.any.oneGun");
    game.startWaveNow(15);
    window.advanceTime(200);
    return {
      beforeWave,
      afterWave: window.DustAndDeadProgression.isChallengeCompleted("class.any.oneGun"),
      oneGunCreed: window.DustAndDeadProgression.getCosmeticCatalog().cowboys
        .find((entry) => entry.id === "oneGunCreed").unlocked,
    };
  });

  expect(result.beforeWave).toBe(false);
  expect(result.afterWave).toBe(true);
  expect(result.oneGunCreed).toBe(true);
});

test("multiplayer matches never track or grant challenges", async ({ page }) => {
  await openGame(page);

  const result = await page.evaluate(() => {
    window.__dustMultiplayerTest.startMockHost(["Host", "Guest"]);
    const game = window.__dustAndDeadTest;
    game.startWaveNow(10, "bellRinger");
    window.advanceTime(200);
    const diagnostics = game.getChallengeDiagnostics();
    game.forceActiveBossDefeat();
    window.advanceTime(200);
    return {
      trackingActive: diagnostics.trackingActive,
      bossFight: diagnostics.bossFight,
      completed: window.DustAndDeadProgression.getChallenges()
        .filter((challenge) => challenge.completed).length,
    };
  });

  expect(result.trackingActive).toBe(false);
  expect(result.bossFight).toBeNull();
  expect(result.completed).toBe(0);
});
