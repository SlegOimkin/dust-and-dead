const path = require("node:path");
const { expect, test } = require("@playwright/test");

const TOTAL_CARD_COUNT = 86;
const CORE_CARD_COUNT = 30;
const PURCHASABLE_CARD_COUNT = 56;

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

async function waitForUnlockTestApi(page) {
  await page.waitForFunction(() => Boolean(
    window.DustAndDeadProgression &&
    window.__dustAndDeadTest &&
    typeof window.__dustAndDeadTest.getRunUpgradeCatalogForTest === "function"
  ));
}

async function openFreshGame(page) {
  await page.goto(`${fileUrl("index.html")}?allCardUnlocksTest=1`, {
    waitUntil: "domcontentloaded",
  });
  await waitForUnlockTestApi(page);
  await page.evaluate(() => window.__dustAndDeadTest.resetMetaProgression());
  await dismissIntro(page);
}

async function openCardsShop(page) {
  await page.locator("#unlock-shop-btn").click();
  await expect(page.locator("#unlock-shop")).toBeVisible();
  await page.locator('[data-unlock-tab="cards"]').click();
  await expect(page.locator("#unlock-shop-content")).toHaveAttribute(
    "data-unlock-view",
    "cards"
  );
  await expect(page.locator(".unlock-grid--cards .unlock-card--card"))
    .toHaveCount(TOTAL_CARD_COUNT);
}

async function readCardsShop(page) {
  return page.evaluate(() => {
    const progressionCards = window.DustAndDeadProgression.getUnlockCatalog().cards;
    const progressionBranches = window.DustAndDeadProgression.getUnlockCatalog().branches;
    const branchById = new Map(progressionBranches.map((branch) => [branch.id, branch]));
    const gameplayCards = window.__dustAndDeadTest.getRunUpgradeCatalogForTest();
    const gameplayById = new Map(gameplayCards.map((card) => [card.id, card]));
    const cardElements = Array.from(
      document.querySelectorAll(".unlock-grid--cards .unlock-card--card")
    );

    const rendered = cardElements.map((element, index) => {
      const catalogCard = progressionCards[index] || null;
      const gameplayCard = catalogCard ? gameplayById.get(catalogCard.id) : null;
      const branch = gameplayCard?.branch ? branchById.get(gameplayCard.branch) : null;
      const dormant = Boolean(catalogCard?.unlocked && branch && !branch.unlocked);
      return {
        id: catalogCard ? catalogCard.id : "",
        core: Boolean(catalogCard?.core),
        purchasable: Boolean(catalogCard?.purchasable),
        title: element.querySelector("h3")?.textContent.trim() || "",
        description: element.querySelector(".unlock-card__copy")?.textContent.trim() || "",
        status: element.querySelector(".unlock-card__status")?.textContent.trim() || "",
        expectedTitle: gameplayCard
          ? [gameplayCard.title, gameplayCard.subtitle].filter(Boolean).join(" ")
          : "",
        expectedDescription: gameplayCard ? gameplayCard.description : "",
        expectedStatus: catalogCard
          ? (
            dormant
              ? "Dormant"
              : catalogCard.core
              ? (gameplayCard?.starter ? "Inherent" : "Core")
              : (catalogCard.unlocked ? "Unlocked" : "Locked")
          )
          : "",
        isDormant: element.classList.contains("is-dormant"),
        isUnlocked: element.classList.contains("is-unlocked"),
        isLocked: element.classList.contains("is-locked"),
        purchaseId:
          element.querySelector("[data-purchase-card]")?.getAttribute("data-purchase-card") || "",
      };
    });

    return {
      progressionIds: progressionCards.map((card) => card.id),
      gameplayIds: gameplayCards.map((card) => card.id),
      coreIds: progressionCards.filter((card) => card.core).map((card) => card.id),
      purchasableIds: progressionCards
        .filter((card) => card.purchasable)
        .map((card) => card.id),
      purchaseButtonIds: Array.from(
        document.querySelectorAll("[data-purchase-card]")
      ).map((button) => button.getAttribute("data-purchase-card")),
      rendered,
    };
  });
}

function expectUniqueIds(ids, expectedCount, label) {
  expect(ids, `${label} count`).toHaveLength(expectedCount);
  expect(new Set(ids).size, `${label} must not contain duplicate IDs`).toBe(expectedCount);
  expect(ids.every(Boolean), `${label} must not contain empty IDs`).toBe(true);
}

function expectRenderedCardsMatchCatalog(shop, expectedUnlocked) {
  expectUniqueIds(shop.progressionIds, TOTAL_CARD_COUNT, "progression card catalog");
  expectUniqueIds(shop.gameplayIds, TOTAL_CARD_COUNT, "gameplay card catalog");
  expectUniqueIds(
    shop.rendered.map((card) => card.id),
    TOTAL_CARD_COUNT,
    "rendered Cards shop catalog"
  );
  expect([...shop.progressionIds].sort()).toEqual([...shop.gameplayIds].sort());
  expect(shop.rendered).toHaveLength(TOTAL_CARD_COUNT);

  for (const card of shop.rendered) {
    expect(card.title, `${card.id} title`).toBe(card.expectedTitle);
    expect(card.title, `${card.id} title must not be empty`).not.toBe("");
    expect(card.description, `${card.id} description`).toBe(card.expectedDescription);
    expect(card.description, `${card.id} description must not be empty`).not.toBe("");
    expect(card.status, `${card.id} status`).toBe(card.expectedStatus);
    expect(card.isUnlocked, `${card.id} unlocked CSS state`).toBe(expectedUnlocked(card));
    expect(card.isLocked, `${card.id} locked CSS state`).toBe(!expectedUnlocked(card));
    expect(card.isDormant, `${card.id} dormant CSS state`).toBe(card.status === "Dormant");
  }
}

test.afterEach(async ({ page }) => {
  if (page.isClosed()) return;
  await page.evaluate(() => {
    window.DustAndDeadProgression?.resetForTest();
  }).catch(() => {});
});

test("all 56 card unlocks purchase durably and all 86 Cards shop entries stay synchronized", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openFreshGame(page);

  await openCardsShop(page);
  const freshShop = await readCardsShop(page);

  expectUniqueIds(freshShop.coreIds, CORE_CARD_COUNT, "core card catalog");
  expectUniqueIds(
    freshShop.purchasableIds,
    PURCHASABLE_CARD_COUNT,
    "purchasable card catalog"
  );
  expectUniqueIds(
    freshShop.purchaseButtonIds,
    PURCHASABLE_CARD_COUNT,
    "fresh purchase buttons"
  );
  expect(freshShop.purchaseButtonIds).toEqual(freshShop.purchasableIds);
  expectRenderedCardsMatchCatalog(freshShop, (card) => card.status !== "Locked");
  expect(freshShop.rendered.filter((card) => card.status === "Locked")).toHaveLength(
    PURCHASABLE_CARD_COUNT
  );
  for (const card of freshShop.rendered) {
    expect(card.purchaseId, `${card.id} fresh purchase action`).toBe(
      card.status === "Locked" ? card.id : ""
    );
  }

  await page.locator("#unlock-shop-back-btn").click();
  await expect(page.locator("#unlock-shop")).toBeHidden();

  const purchaseAudit = await page.evaluate(() => {
    const progression = window.DustAndDeadProgression;
    const purchasable = progression.getUnlockCatalog().cards
      .filter((card) => card.purchasable)
      .map((card) => ({ id: card.id, costCents: card.costCents }));
    const totalCostCents = purchasable.reduce((sum, card) => sum + card.costCents, 0);
    const grant = progression.grantDustForTest(totalCostCents);
    const storageKey = progression.getSnapshot().storageKey;
    const receipts = [];
    let spentCents = 0;

    for (const card of purchasable) {
      const beforeCard = progression.getUnlockCatalog().cards
        .find((entry) => entry.id === card.id);
      const receipt = progression.purchaseCard(card.id);
      spentCents += card.costCents;
      const snapshot = progression.getSnapshot();
      const catalogCard = progression.getUnlockCatalog().cards
        .find((entry) => entry.id === card.id);
      const stored = JSON.parse(window.localStorage.getItem(storageKey));
      const storedCards = stored?.unlocks?.purchasedCards || [];

      receipts.push({
        id: card.id,
        costCents: card.costCents,
        beforeUnlocked: beforeCard?.unlocked,
        accepted: receipt.accepted,
        reason: receipt.reason,
        unlockType: receipt.unlockType,
        unlockId: receipt.unlockId,
        dustSpentCents: receipt.dustSpentCents,
        expectedDustCents: totalCostCents - spentCents,
        snapshotDustCents: snapshot.dustCents,
        snapshotUnlocked: snapshot.unlocks.cards.includes(card.id),
        snapshotPurchaseOccurrences:
          snapshot.unlocks.purchasedCards.filter((id) => id === card.id).length,
        catalogUnlocked: catalogCard?.unlocked,
        storedDustCents: stored?.dustCents,
        storedPurchaseCount: storedCards.length,
        storedPurchaseOccurrences: storedCards.filter((id) => id === card.id).length,
      });
    }

    const finalSnapshot = progression.getSnapshot();
    const finalCatalog = progression.getUnlockCatalog();
    const finalStored = JSON.parse(window.localStorage.getItem(storageKey));
    return {
      grantAccepted: grant.accepted,
      totalCostCents,
      purchasable,
      receipts,
      finalSnapshot,
      finalUnlockedIds: finalCatalog.cards
        .filter((card) => card.unlocked)
        .map((card) => card.id),
      finalStoredDustCents: finalStored?.dustCents,
      finalStoredPurchasedCards: finalStored?.unlocks?.purchasedCards || [],
    };
  });

  expect(purchaseAudit.grantAccepted).toBe(true);
  expect(purchaseAudit.purchasable).toHaveLength(PURCHASABLE_CARD_COUNT);
  expect(purchaseAudit.receipts).toHaveLength(PURCHASABLE_CARD_COUNT);
  for (const [index, receipt] of purchaseAudit.receipts.entries()) {
    expect(receipt, `durable purchase ${index + 1}: ${receipt.id}`).toEqual({
      id: purchaseAudit.purchasable[index].id,
      costCents: purchaseAudit.purchasable[index].costCents,
      beforeUnlocked: false,
      accepted: true,
      reason: "",
      unlockType: "card",
      unlockId: purchaseAudit.purchasable[index].id,
      dustSpentCents: purchaseAudit.purchasable[index].costCents,
      expectedDustCents: receipt.expectedDustCents,
      snapshotDustCents: receipt.expectedDustCents,
      snapshotUnlocked: true,
      snapshotPurchaseOccurrences: 1,
      catalogUnlocked: true,
      storedDustCents: receipt.expectedDustCents,
      storedPurchaseCount: index + 1,
      storedPurchaseOccurrences: 1,
    });
  }
  expect(purchaseAudit.finalSnapshot.dustCents).toBe(0);
  expect(purchaseAudit.finalSnapshot.unlocks.purchasedCards).toEqual(
    purchaseAudit.purchasable.map((card) => card.id)
  );
  expect(purchaseAudit.finalSnapshot.unlocks.unlockedCardCount).toBe(TOTAL_CARD_COUNT);
  expectUniqueIds(
    purchaseAudit.finalUnlockedIds,
    TOTAL_CARD_COUNT,
    "fully unlocked in-memory catalog"
  );
  expect(purchaseAudit.finalStoredDustCents).toBe(0);
  expect(purchaseAudit.finalStoredPurchasedCards).toEqual(
    purchaseAudit.purchasable.map((card) => card.id)
  );

  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForUnlockTestApi(page);

  const reloaded = await page.evaluate(() => {
    const progression = window.DustAndDeadProgression;
    const snapshot = progression.getSnapshot();
    const catalog = progression.getUnlockCatalog();
    const stored = JSON.parse(window.localStorage.getItem(snapshot.storageKey));
    return {
      dustCents: snapshot.dustCents,
      purchasedCards: snapshot.unlocks.purchasedCards,
      unlockedCardCount: snapshot.unlocks.unlockedCardCount,
      totalCardCount: snapshot.unlocks.totalCardCount,
      catalogUnlockedIds: catalog.cards
        .filter((card) => card.unlocked)
        .map((card) => card.id),
      catalogPurchasableIds: catalog.cards
        .filter((card) => card.purchasable)
        .map((card) => card.id),
      storedDustCents: stored?.dustCents,
      storedPurchasedCards: stored?.unlocks?.purchasedCards || [],
    };
  });
  const purchasedIds = purchaseAudit.purchasable.map((card) => card.id);
  expect(reloaded).toMatchObject({
    dustCents: 0,
    purchasedCards: purchasedIds,
    unlockedCardCount: TOTAL_CARD_COUNT,
    totalCardCount: TOTAL_CARD_COUNT,
    catalogPurchasableIds: purchasedIds,
    storedDustCents: 0,
    storedPurchasedCards: purchasedIds,
  });
  expectUniqueIds(
    reloaded.catalogUnlockedIds,
    TOTAL_CARD_COUNT,
    "reloaded unlocked catalog"
  );

  await dismissIntro(page);
  await openCardsShop(page);
  const unlockedShop = await readCardsShop(page);

  expectRenderedCardsMatchCatalog(unlockedShop, () => true);
  expect(unlockedShop.purchaseButtonIds).toEqual([]);
  expect(unlockedShop.rendered.filter(
    (card) =>
      card.purchasable &&
      (card.status === "Unlocked" || card.status === "Dormant")
  )).toHaveLength(PURCHASABLE_CARD_COUNT);
  expect(unlockedShop.rendered.filter((card) => card.status === "Locked")).toEqual([]);
  for (const card of unlockedShop.rendered) {
    expect(card.purchaseId, `${card.id} must not retain a purchase action`).toBe("");
  }
});
