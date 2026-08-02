const path = require("node:path");
const { expect, test } = require("@playwright/test");

function fileUrl(relativePath) {
  const absolute = path.resolve(__dirname, "..", relativePath).replace(/\\/g, "/");
  return `file:///${absolute}`;
}

async function openGame(page) {
  await page.goto(`${fileUrl("index.html")}?mapSeed=7391`);
  const intro = page.locator("#intro-screen");
  if (await intro.isVisible().catch(() => false)) {
    await page.keyboard.press("KeyM");
    await expect(intro).toBeHidden();
  }
  await page.waitForFunction(() => Boolean(
    window.DustAndDeadProgression &&
    window.__dustMultiplayerTest
  ));
}

test("the host enforces each player's class entitlements and applies a choice only to its owner", async ({ page }) => {
  await openGame(page);

  const result = await page.evaluate(() => {
    const api = window.__dustMultiplayerTest;
    api.startMockHost(["Starter host", "Ranger owner"]);

    const hostProfile = api.setUnlockProfile("mock-player-1", {
      version: 1,
      classes: ["gunslinger"],
      branches: ["dualRevolvers"],
      purchasedCards: [],
      markedCards: [],
    });
    const guestProfile = api.setUnlockProfile("mock-player-2", {
      version: 1,
      classes: ["gunslinger", "ranger"],
      branches: ["dualRevolvers", "leverBarrage"],
      purchasedCards: [],
      markedCards: [],
    });

    function player(playerId) {
      return api.getState().players.find((entry) => entry.id === playerId);
    }

    function awardToLevel(playerId, targetLevel) {
      while (player(playerId).progression.level < targetLevel) {
        const progression = player(playerId).progression;
        api.awardXp(playerId, progression.xpToNext - progression.xp);
      }
    }

    function drainToClassOffer(playerId) {
      for (let guard = 0; guard < 12; guard += 1) {
        const offer = api.getUpgradeOffer(playerId);
        if (!offer) throw new Error(`Missing upgrade offer for ${playerId}`);
        if (offer.kind === "class") return offer;
        if (offer.kind !== "standard") {
          throw new Error(`Unexpected ${offer.kind} before class choice for ${playerId}`);
        }
        if (!api.chooseUpgrade(playerId, offer.choices[0], offer.id)) {
          throw new Error(`Could not drain ${offer.id} for ${playerId}`);
        }
      }
      throw new Error(`Class offer was not reached for ${playerId}`);
    }

    awardToLevel("mock-player-1", 5);
    awardToLevel("mock-player-2", 5);
    const hostOffer = drainToClassOffer("mock-player-1");
    const guestOffer = drainToClassOffer("mock-player-2");

    const rejectedHostRanger = api.chooseUpgrade(
      "mock-player-1",
      "ranger",
      hostOffer.id
    );
    const hostOfferAfterRejection = api.getUpgradeOffer("mock-player-1");
    const appliedGuestRanger = api.chooseUpgrade(
      "mock-player-2",
      "ranger",
      guestOffer.id
    );
    const afterGuestChoice = api.getState().players.map((entry) => ({
      id: entry.id,
      playerClass: entry.progression.playerClass,
      weapon: entry.progression.weapon,
    }));
    const appliedHostGunslinger = api.chooseUpgrade(
      "mock-player-1",
      "gunslinger",
      hostOffer.id
    );
    const finalPlayers = api.getState().players.map((entry) => ({
      id: entry.id,
      playerClass: entry.progression.playerClass,
      weapon: entry.progression.weapon,
    }));

    return {
      hostProfile,
      guestProfile,
      hostOffer,
      guestOffer,
      rejectedHostRanger,
      hostOfferAfterRejection,
      appliedGuestRanger,
      afterGuestChoice,
      appliedHostGunslinger,
      finalPlayers,
    };
  });

  expect(result.hostProfile.classes).toEqual(["gunslinger"]);
  expect(result.guestProfile.classes).toEqual(["gunslinger", "ranger"]);
  expect(result.hostOffer).toMatchObject({
    kind: "class",
    level: 5,
    choices: ["gunslinger"],
  });
  expect(result.guestOffer).toMatchObject({
    kind: "class",
    level: 5,
    choices: ["gunslinger", "ranger"],
  });

  expect(result.rejectedHostRanger).toBe(false);
  expect(result.hostOfferAfterRejection).toEqual(result.hostOffer);
  expect(result.appliedGuestRanger).toBe(true);
  expect(result.afterGuestChoice).toEqual([
    { id: "mock-player-1", playerClass: null, weapon: "revolver" },
    { id: "mock-player-2", playerClass: "ranger", weapon: "rifle" },
  ]);

  expect(result.appliedHostGunslinger).toBe(true);
  expect(result.finalPlayers).toEqual([
    { id: "mock-player-1", playerClass: "gunslinger", weapon: "revolver" },
    { id: "mock-player-2", playerClass: "ranger", weapon: "rifle" },
  ]);
});

test("the host prunes forged mastery branches whose parent classes are locked", async ({ page }) => {
  await openGame(page);

  const result = await page.evaluate(() => {
    const api = window.__dustMultiplayerTest;
    api.startMockHost(["Forged profile"]);
    return api.setUnlockProfile("mock-player-1", {
      version: 1,
      classes: ["gunslinger"],
      branches: [
        "dualRevolvers",
        "leverBarrage",
        "trailWarden",
        "bombardier",
        "breachMarshal",
      ],
      purchasedCards: [],
      markedCards: [],
    });
  });

  expect(result.classes).toEqual(["gunslinger"]);
  expect(result.branches).toEqual(["dualRevolvers"]);
});

test("the host enforces each player's branch entitlements and cannot borrow the other player's branch", async ({ page }) => {
  await openGame(page);

  const result = await page.evaluate(() => {
    const api = window.__dustMultiplayerTest;
    api.startMockHost(["Default iron", "Big Iron owner"]);

    const hostProfile = api.setUnlockProfile("mock-player-1", {
      version: 1,
      classes: ["gunslinger"],
      branches: ["dualRevolvers"],
      purchasedCards: [],
      markedCards: [],
    });
    const guestProfile = api.setUnlockProfile("mock-player-2", {
      version: 1,
      classes: ["gunslinger"],
      branches: [
        "dualRevolvers",
        "bigIron",
      ],
      purchasedCards: [],
      markedCards: [],
    });

    function player(playerId) {
      return api.getState().players.find((entry) => entry.id === playerId);
    }

    function awardToLevel(playerId, targetLevel) {
      while (player(playerId).progression.level < targetLevel) {
        const progression = player(playerId).progression;
        api.awardXp(playerId, progression.xpToNext - progression.xp);
      }
    }

    function drainToKind(playerId, expectedKind) {
      for (let guard = 0; guard < 24; guard += 1) {
        const offer = api.getUpgradeOffer(playerId);
        if (!offer) throw new Error(`Missing upgrade offer for ${playerId}`);
        if (offer.kind === expectedKind) return offer;
        if (offer.kind === "class") {
          if (!api.chooseUpgrade(playerId, "gunslinger", offer.id)) {
            throw new Error(`Could not apply Gunslinger for ${playerId}`);
          }
          continue;
        }
        if (offer.kind !== "standard") {
          throw new Error(`Unexpected ${offer.kind} before ${expectedKind} for ${playerId}`);
        }
        if (!api.chooseUpgrade(playerId, offer.choices[0], offer.id)) {
          throw new Error(`Could not drain ${offer.id} for ${playerId}`);
        }
      }
      throw new Error(`${expectedKind} was not reached for ${playerId}`);
    }

    awardToLevel("mock-player-1", 10);
    awardToLevel("mock-player-2", 10);
    const hostOffer = drainToKind("mock-player-1", "revolverBranch");
    const guestOffer = drainToKind("mock-player-2", "revolverBranch");

    const rejectedHostBigIron = api.chooseUpgrade(
      "mock-player-1",
      "bigIron",
      hostOffer.id
    );
    const hostOfferAfterRejection = api.getUpgradeOffer("mock-player-1");
    const appliedGuestBigIron = api.chooseUpgrade(
      "mock-player-2",
      "bigIron",
      guestOffer.id
    );
    const afterGuestChoice = api.getState().players.map((entry) => ({
      id: entry.id,
      revolverUpgrade: entry.progression.revolverUpgrade,
    }));
    const appliedHostDual = api.chooseUpgrade(
      "mock-player-1",
      "dualRevolvers",
      hostOffer.id
    );
    const finalPlayers = api.getState().players.map((entry) => ({
      id: entry.id,
      revolverUpgrade: entry.progression.revolverUpgrade,
    }));

    return {
      hostProfile,
      guestProfile,
      hostOffer,
      guestOffer,
      rejectedHostBigIron,
      hostOfferAfterRejection,
      appliedGuestBigIron,
      afterGuestChoice,
      appliedHostDual,
      finalPlayers,
    };
  });

  expect(result.hostProfile.branches).toContain("dualRevolvers");
  expect(result.hostProfile.branches).not.toContain("bigIron");
  expect(result.guestProfile.branches).toContain("dualRevolvers");
  expect(result.guestProfile.branches).toContain("bigIron");

  expect(result.hostOffer).toMatchObject({
    kind: "revolverBranch",
    level: 10,
    choices: ["dualRevolvers"],
  });
  expect(result.guestOffer).toMatchObject({
    kind: "revolverBranch",
    level: 10,
    choices: ["dualRevolvers", "bigIron"],
  });

  expect(result.rejectedHostBigIron).toBe(false);
  expect(result.hostOfferAfterRejection).toEqual(result.hostOffer);
  expect(result.appliedGuestBigIron).toBe(true);
  expect(result.afterGuestChoice).toEqual([
    { id: "mock-player-1", revolverUpgrade: null },
    { id: "mock-player-2", revolverUpgrade: "bigIron" },
  ]);

  expect(result.appliedHostDual).toBe(true);
  expect(result.finalPlayers).toEqual([
    { id: "mock-player-1", revolverUpgrade: "dualRevolvers" },
    { id: "mock-player-2", revolverUpgrade: "bigIron" },
  ]);
});

test("authoritative card drafts stay inside each player's profile and purchased cards apply only to their owner", async ({ page }) => {
  test.setTimeout(90000);
  await openGame(page);

  const result = await page.evaluate(() => {
    const api = window.__dustMultiplayerTest;
    const progression = window.DustAndDeadProgression;
    const catalog = progression.getUnlockCatalog();
    const coreCardIds = catalog.cards
      .filter((card) => card.core)
      .map((card) => card.id);
    const targets = {
      "mock-player-1": "fullSalvo",
      "mock-player-2": "madmansJourney",
      "mock-player-3": null,
    };
    const purchasedByPlayer = {
      "mock-player-1": ["fullSalvo"],
      "mock-player-2": ["madmansJourney"],
      "mock-player-3": [],
    };
    const forbiddenByPlayer = {
      "mock-player-1": ["madmansJourney"],
      "mock-player-2": ["fullSalvo"],
      "mock-player-3": ["fullSalvo", "madmansJourney"],
    };
    const playerIds = Object.keys(targets);

    api.startMockHost(["Salvo host", "Madman guest", "Core-only guest"]);
    const profiles = {};
    for (const playerId of playerIds) {
      profiles[playerId] = api.setUnlockProfile(playerId, {
        version: 1,
        classes: ["gunslinger", "demolitionist"],
        branches: [
          "dualRevolvers",
          "bombardier",
        ],
        purchasedCards: purchasedByPlayer[playerId],
        markedCards: [],
      });
    }

    function player(playerId) {
      return api.getState().players.find((entry) => entry.id === playerId);
    }

    function awardToLevel(playerId, targetLevel) {
      while (player(playerId).progression.level < targetLevel) {
        const current = player(playerId).progression;
        api.awardXp(playerId, current.xpToNext - current.xp);
      }
    }

    const offerLogs = Object.fromEntries(playerIds.map((id) => [id, []]));
    const specialOfferLogs = Object.fromEntries(playerIds.map((id) => [id, []]));
    const invalidChoices = [];
    const duplicateChoices = [];
    const rejectedLockedChoices = Object.fromEntries(playerIds.map((id) => [id, {}]));
    const targetApplications = Object.fromEntries(playerIds.map((id) => [id, null]));
    const resolutionFailures = [];
    const allowedByPlayer = {};

    for (const playerId of playerIds) {
      allowedByPlayer[playerId] = new Set(
        coreCardIds.concat(purchasedByPlayer[playerId])
      );
      awardToLevel(playerId, 58);
    }

    for (const playerId of playerIds) {
      for (let guard = 0; guard < 96; guard += 1) {
        const offer = api.getUpgradeOffer(playerId);
        if (!offer) break;

        let choiceId = "";
        if (offer.kind === "class") {
          choiceId = "demolitionist";
        } else if (offer.kind === "launcherBranch") {
          choiceId = "bombardier";
        } else if (offer.kind === "standard") {
          const entry = {
            id: offer.id,
            level: offer.level,
            choices: offer.choices.slice(),
          };
          offerLogs[playerId].push(entry);
          if (offer.level >= 13 && (offer.level - 13) % 3 === 0) {
            specialOfferLogs[playerId].push(entry);
          }

          const uniqueChoices = new Set(offer.choices);
          if (uniqueChoices.size !== offer.choices.length) {
            duplicateChoices.push({ playerId, offer: entry });
          }
          for (const offeredId of offer.choices) {
            if (!allowedByPlayer[playerId].has(offeredId)) {
              invalidChoices.push({ playerId, offeredId, offer: entry });
            }
          }

          for (const lockedId of forbiddenByPlayer[playerId]) {
            if (
              rejectedLockedChoices[playerId][lockedId] == null &&
              offer.choices.indexOf(lockedId) === -1
            ) {
              rejectedLockedChoices[playerId][lockedId] = api.chooseUpgrade(
                playerId,
                lockedId,
                offer.id
              );
            }
          }

          const target = targets[playerId];
          if (
            target &&
            !targetApplications[playerId] &&
            offer.choices.indexOf(target) !== -1
          ) {
            choiceId = target;
          } else {
            choiceId = offer.choices[0];
          }
        } else {
          resolutionFailures.push({
            playerId,
            reason: `unexpected-offer-kind:${offer.kind}`,
            offer,
          });
          break;
        }

        if (!choiceId) {
          resolutionFailures.push({
            playerId,
            reason: "empty-offer",
            offer,
          });
          break;
        }

        const applied = api.chooseUpgrade(playerId, choiceId, offer.id);
        if (!applied) {
          resolutionFailures.push({
            playerId,
            reason: "choice-rejected",
            choiceId,
            offer,
          });
          break;
        }
        if (choiceId === targets[playerId]) {
          targetApplications[playerId] = {
            level: offer.level,
            offerChoices: offer.choices.slice(),
            applied,
          };
        }
      }
    }

    const targetCatalog = catalog.cards
      .filter((card) => card.id === "fullSalvo" || card.id === "madmansJourney")
      .map((card) => ({
        id: card.id,
        core: card.core,
        purchasable: card.purchasable,
      }));
    const players = api.getState().players.map((entry) => ({
      id: entry.id,
      level: entry.progression.level,
      playerClass: entry.progression.playerClass,
      launcherUpgrade: entry.progression.launcherUpgrade,
      fullSalvo: entry.progression.upgrades.fullSalvo || 0,
      madmansJourney: entry.progression.upgrades.madmansJourney || 0,
    }));

    return {
      coreCardIds,
      targetCatalog,
      profiles,
      offerLogs,
      specialOfferLogs,
      invalidChoices,
      duplicateChoices,
      rejectedLockedChoices,
      targetApplications,
      resolutionFailures,
      players,
    };
  });

  expect(result.coreCardIds).toHaveLength(30);
  expect(result.targetCatalog).toEqual([
    { id: "fullSalvo", core: false, purchasable: true },
    { id: "madmansJourney", core: false, purchasable: true },
  ]);
  expect(result.profiles["mock-player-1"].purchasedCards).toEqual(["fullSalvo"]);
  expect(result.profiles["mock-player-2"].purchasedCards).toEqual(["madmansJourney"]);
  expect(result.profiles["mock-player-3"].purchasedCards).toEqual([]);

  expect(result.resolutionFailures).toEqual([]);
  expect(result.invalidChoices).toEqual([]);
  expect(result.duplicateChoices).toEqual([]);

  for (const playerId of ["mock-player-1", "mock-player-2", "mock-player-3"]) {
    expect(result.offerLogs[playerId].length, `${playerId} sampled drafts`).toBeGreaterThan(40);
    expect(result.specialOfferLogs[playerId].length, `${playerId} sampled branch drafts`).toBeGreaterThanOrEqual(12);
  }

  expect(
    result.offerLogs["mock-player-1"].flatMap((offer) => offer.choices)
  ).not.toContain("madmansJourney");
  expect(
    result.offerLogs["mock-player-2"].flatMap((offer) => offer.choices)
  ).not.toContain("fullSalvo");
  expect(
    result.offerLogs["mock-player-3"].flatMap((offer) => offer.choices)
  ).not.toContain("fullSalvo");
  expect(
    result.offerLogs["mock-player-3"].flatMap((offer) => offer.choices)
  ).not.toContain("madmansJourney");

  expect(result.rejectedLockedChoices).toEqual({
    "mock-player-1": { madmansJourney: false },
    "mock-player-2": { fullSalvo: false },
    "mock-player-3": { fullSalvo: false, madmansJourney: false },
  });
  expect(result.targetApplications["mock-player-1"]).toMatchObject({
    applied: true,
  });
  expect(result.targetApplications["mock-player-1"].offerChoices).toContain("fullSalvo");
  expect(result.targetApplications["mock-player-2"]).toMatchObject({
    applied: true,
  });
  expect(result.targetApplications["mock-player-2"].offerChoices).toContain("madmansJourney");
  expect(result.targetApplications["mock-player-3"]).toBeNull();

  expect(result.players).toEqual([
    {
      id: "mock-player-1",
      level: 58,
      playerClass: "demolitionist",
      launcherUpgrade: "bombardier",
      fullSalvo: 1,
      madmansJourney: 0,
    },
    {
      id: "mock-player-2",
      level: 58,
      playerClass: "demolitionist",
      launcherUpgrade: "bombardier",
      fullSalvo: 0,
      madmansJourney: 1,
    },
    {
      id: "mock-player-3",
      level: 58,
      playerClass: "demolitionist",
      launcherUpgrade: "bombardier",
      fullSalvo: 0,
      madmansJourney: 0,
    },
  ]);
});
