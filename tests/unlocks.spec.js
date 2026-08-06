const path = require("node:path");
const { expect, test } = require("@playwright/test");

const PROGRESSION_STORAGE_KEY = "dustAndDeadMetaProgression.v1";

function fileUrl(relativePath) {
  const absolute = path.resolve(__dirname, "..", relativePath).replace(/\\/g, "/");
  return `file:///${absolute}`;
}

async function openProgression(page, { reset = true } = {}) {
  await page.goto(`${fileUrl("index.html")}?unlockModelTest=1`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForFunction(() => Boolean(window.DustAndDeadProgression));
  if (reset) {
    await page.evaluate(() => window.DustAndDeadProgression.resetForTest());
  }
}

async function dismissIntro(page) {
  const intro = page.locator("#intro-screen");
  if (await intro.isVisible().catch(() => false)) {
    await page.keyboard.press("KeyM");
    await expect(intro).toBeHidden();
  }
}

async function expectLegibleDesktopUnlockCards(page, selector) {
  const samples = await page.locator(selector).evaluateAll((cards) =>
    cards.map((card) => {
      const heading = card.querySelector("h3");
      const description = card.querySelector(".unlock-card__copy");
      const eyebrow = card.querySelector(".unlock-card__eyebrow");
      const meta = card.querySelector(".unlock-card__price");
      const action = card.querySelector(".unlock-card__action");
      return {
        headingSize: Number.parseFloat(getComputedStyle(heading).fontSize),
        descriptionSize: Number.parseFloat(getComputedStyle(description).fontSize),
        eyebrowSize: Number.parseFloat(getComputedStyle(eyebrow).fontSize),
        metaSize: Number.parseFloat(getComputedStyle(meta).fontSize),
        actionSize: action ? Number.parseFloat(getComputedStyle(action).fontSize) : null,
        cardOverflow: card.scrollHeight - card.clientHeight,
        headingOverflowX: heading.scrollWidth - heading.clientWidth,
        headingOverflowY: heading.scrollHeight - heading.clientHeight,
        descriptionOverflowX: description.scrollWidth - description.clientWidth,
        descriptionOverflowY: description.scrollHeight - description.clientHeight,
      };
    })
  );
  expect(samples.length).toBeGreaterThan(0);
  for (const sample of samples) {
    expect(sample.headingSize).toBeGreaterThanOrEqual(19);
    expect(sample.descriptionSize).toBeGreaterThanOrEqual(10.5);
    expect(sample.eyebrowSize).toBeGreaterThanOrEqual(7.5);
    expect(sample.metaSize).toBeGreaterThanOrEqual(8.5);
    if (sample.actionSize != null) expect(sample.actionSize).toBeGreaterThanOrEqual(9.5);
    expect(sample.cardOverflow).toBeLessThanOrEqual(1);
    expect(sample.headingOverflowX).toBeLessThanOrEqual(1);
    expect(sample.headingOverflowY).toBeLessThanOrEqual(1);
    expect(sample.descriptionOverflowX).toBeLessThanOrEqual(1);
    expect(sample.descriptionOverflowY).toBeLessThanOrEqual(1);
  }
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

test("a fresh profile exposes one class, its starter mastery, and a 30/56 card split", async ({ page }) => {
  await openProgression(page);

  const model = await page.evaluate(() => {
    const progression = window.DustAndDeadProgression;
    return {
      snapshot: progression.getSnapshot(),
      catalog: progression.getUnlockCatalog(),
    };
  });

  expect(model.snapshot.unlocks.classes).toEqual(["gunslinger"]);
  expect(model.catalog.classes.map(({ id, costCents, unlocked }) => ({
    id,
    costCents,
    unlocked,
  }))).toEqual([
    { id: "gunslinger", costCents: 0, unlocked: true },
    { id: "ranger", costCents: 50000, unlocked: false },
    { id: "demolitionist", costCents: 100000, unlocked: false },
    { id: "marshal", costCents: 100000, unlocked: false },
  ]);

  expect(model.snapshot.unlocks.branches).toEqual(["dualRevolvers"]);
  expect(model.catalog.branches.filter((branch) => branch.unlocked).map((branch) => branch.id))
    .toEqual(model.snapshot.unlocks.branches);
  expect(model.catalog.branches.filter((branch) => !branch.classUnlocked).map((branch) => branch.id))
    .toEqual([
      "leverBarrage",
      "trailWarden",
      "bombardier",
      "pyrotechnician",
      "breachMarshal",
      "graveWarden",
    ]);

  const coreCards = model.catalog.cards.filter((card) => card.core);
  const lockedCards = model.catalog.cards.filter((card) => !card.core);
  expect(model.catalog.cards).toHaveLength(86);
  expect(new Set(model.catalog.cards.map((card) => card.id)).size).toBe(86);
  expect(coreCards).toHaveLength(30);
  expect(lockedCards).toHaveLength(56);
  expect(coreCards.every((card) => card.unlocked && !card.purchasable && card.costCents === 0))
    .toBe(true);
  expect(lockedCards.every((card) => !card.unlocked && card.purchasable && card.costCents > 0))
    .toBe(true);

  for (const id of ["swiftBoots", "steadyHand", "quickReload", "grit"]) {
    expect(coreCards.map((card) => card.id)).toContain(id);
  }
  for (const id of [
    "madmansJourney",
    "thermiteCore",
    "chainLightning",
    "allRightAllLeft",
    "lastRites",
    "heavensBounty",
  ]) {
    expect(lockedCards.map((card) => card.id)).toContain(id);
  }
});

test("a run snapshots unlocks and rejects hidden class or mastery choices in game logic", async ({ page }) => {
  await openProgression(page);
  await dismissIntro(page);
  await page.getByRole("button", { name: "Start Hunt" }).click();
  await page.waitForFunction(() => Boolean(window.__dustAndDeadTest && window.render_game_to_text));

  await page.evaluate(() => {
    const progression = window.DustAndDeadProgression;
    progression.grantDustForTest(50000);
    progression.purchaseClass("ranger");
    progression.grantDustForTest(15000);
    progression.purchaseCard("fanTheHammer");
    window.__dustAndDeadTest.clearEnemies();
    window.__dustAndDeadTest.grantXp(240, { preserveUnlockProfile: true });
  });

  await expect(page.locator("#class-choice")).toBeVisible();
  await expect(page.locator("#class-choice")).toHaveAttribute("data-visible-choices", "1");
  await expect(page.locator("#class-choice [data-class]:visible")).toHaveCount(1);
  await expect(page.locator('#class-choice [data-class="gunslinger"]')).toBeVisible();
  await expect(page.locator('#class-choice [data-class="ranger"]')).toBeHidden();

  const singleClassLayout = await page.locator("#class-choice").evaluate((panel) => {
    const options = panel.querySelector(".class-options");
    const card = panel.querySelector("[data-class]:not([hidden])");
    return {
      panelWidth: panel.getBoundingClientRect().width,
      cardWidth: card.getBoundingClientRect().width,
      columns: getComputedStyle(options).gridTemplateColumns.trim().split(/\s+/).length,
    };
  });
  expect(singleClassLayout.panelWidth).toBeLessThanOrEqual(400);
  expect(singleClassLayout.cardWidth).toBeGreaterThanOrEqual(220);
  expect(singleClassLayout.columns).toBe(1);

  const rejectedRanger = await page.evaluate(() => {
    const button = document.querySelector('#class-choice [data-class="ranger"]');
    button.hidden = false;
    button.disabled = false;
    button.setAttribute("data-meta-locked", "false");
    button.click();
    return JSON.parse(window.render_game_to_text()).progression.playerClass;
  });
  expect(rejectedRanger).toBeNull();

  await page.locator('#class-choice [data-class="gunslinger"]').click();
  await page.evaluate(() => {
    window.__dustAndDeadTest.forceAllStandardUpgrades("swiftBoots");
    window.__dustAndDeadTest.grantXp(1200, { preserveUnlockProfile: true });
  });

  await expect(page.locator("#revolver-upgrade")).toBeVisible();
  await expect(page.locator("#revolver-upgrade")).toHaveAttribute("data-visible-choices", "1");
  await expect(page.locator("#revolver-upgrade [data-revolver-upgrade]:visible")).toHaveCount(1);
  await expect(page.locator('[data-revolver-upgrade="dualRevolvers"]')).toBeVisible();
  await expect(page.locator('[data-revolver-upgrade="bigIron"]')).toBeHidden();
  expect(await page.locator("#revolver-upgrade").evaluate(
    (panel) => panel.getBoundingClientRect().width
  )).toBeLessThanOrEqual(400);

  const rejectedBigIron = await page.evaluate(() => {
    const button = document.querySelector('[data-revolver-upgrade="bigIron"]');
    button.hidden = false;
    button.disabled = false;
    button.setAttribute("data-meta-locked", "false");
    button.click();
    return JSON.parse(window.render_game_to_text()).progression.revolverUpgrade;
  });
  expect(rejectedBigIron).toBeNull();

  await page.locator('[data-revolver-upgrade="dualRevolvers"]').click();
  expect(await page.evaluate(
    () => JSON.parse(window.render_game_to_text()).progression.revolverUpgrade
  )).toBe("dualRevolvers");

  const currentRunRolls = await page.evaluate(
    () => window.__dustAndDeadTest.rollUpgradeChoicesForTest(13, 200)
  );
  expect(currentRunRolls.seen).toContain("ricochetRounds");
  expect(currentRunRolls.seen).toContain("softAim");
  expect(currentRunRolls.seen).not.toContain("fanTheHammer");
  expect(currentRunRolls.seen).not.toContain("allRightAllLeft");
  expect(currentRunRolls.offers.every(
    (offer) => offer.length === new Set(offer).size
  )).toBe(true);

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Boolean(window.__dustAndDeadTest && window.DustAndDeadProgression));
  await dismissIntro(page);
  await page.getByRole("button", { name: "Start Hunt" }).click();
  await page.evaluate(() => {
    window.__dustAndDeadTest.clearEnemies();
    window.__dustAndDeadTest.grantXp(240, { preserveUnlockProfile: true });
  });
  await expect(page.locator("#class-choice")).toBeVisible();
  await expect(page.locator("#class-choice")).toHaveAttribute("data-visible-choices", "2");
  await expect(page.locator("#class-choice [data-class]:visible")).toHaveCount(2);
  const twoClassLayout = await page.locator("#class-choice").evaluate((panel) => ({
    panelWidth: panel.getBoundingClientRect().width,
    columns: getComputedStyle(panel.querySelector(".class-options")).gridTemplateColumns
      .trim()
      .split(/\s+/)
      .length,
  }));
  expect(twoClassLayout.panelWidth).toBeGreaterThan(singleClassLayout.panelWidth);
  expect(twoClassLayout.panelWidth).toBeLessThanOrEqual(560);
  expect(twoClassLayout.columns).toBe(2);
  await page.locator('#class-choice [data-class="gunslinger"]').click();
  await page.evaluate(() => {
    window.__dustAndDeadTest.forceAllStandardUpgrades("swiftBoots");
    window.__dustAndDeadTest.grantXp(1200, { preserveUnlockProfile: true });
  });
  await page.locator('[data-revolver-upgrade="dualRevolvers"]').click();
  const nextRunRolls = await page.evaluate(
    () => window.__dustAndDeadTest.rollUpgradeChoicesForTest(13, 200)
  );
  expect(nextRunRolls.seen).toContain("fanTheHammer");
});

test("class and card purchases reject insufficient Dust atomically and persist successful unlocks", async ({ page }) => {
  await openProgression(page);

  const result = await page.evaluate((storageKey) => {
    const progression = window.DustAndDeadProgression;
    const card = progression.getUnlockCatalog().cards.find((entry) => entry.id === "madmansJourney");

    progression.grantDustForTest(49999);
    const beforeRejectedClass = progression.getSnapshot();
    const rejectedClass = progression.purchaseClass("ranger");
    const afterRejectedClass = progression.getSnapshot();

    progression.grantDustForTest(1);
    const boughtClass = progression.purchaseClass("ranger");

    progression.grantDustForTest(card.costCents - 1);
    const beforeRejectedCard = progression.getSnapshot();
    const rejectedCard = progression.purchaseCard(card.id);
    const afterRejectedCard = progression.getSnapshot();

    progression.grantDustForTest(1);
    const boughtCard = progression.purchaseCard(card.id);

    progression.grantDustForTest(100000);
    const beforePersistenceFailure = progression.getSnapshot();
    const originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function () {
      throw new DOMException("test quota failure", "QuotaExceededError");
    };
    const failedDurablePurchase = progression.purchaseClass("demolitionist");
    Storage.prototype.setItem = originalSetItem;
    const afterPersistenceFailure = progression.getSnapshot();

    return {
      cardCostCents: card.costCents,
      beforeRejectedClass,
      rejectedClass,
      afterRejectedClass,
      boughtClass,
      beforeRejectedCard,
      rejectedCard,
      afterRejectedCard,
      boughtCard,
      beforePersistenceFailure,
      failedDurablePurchase,
      afterPersistenceFailure,
      stored: JSON.parse(window.localStorage.getItem(storageKey)),
    };
  }, PROGRESSION_STORAGE_KEY);

  expect(result.rejectedClass).toMatchObject({
    accepted: false,
    reason: "insufficient-dust",
    dustSpentCents: 0,
  });
  expect(result.afterRejectedClass.dustCents).toBe(result.beforeRejectedClass.dustCents);
  expect(result.afterRejectedClass.unlocks.classes).toEqual(result.beforeRejectedClass.unlocks.classes);

  expect(result.boughtClass).toMatchObject({
    accepted: true,
    dustSpentCents: 50000,
    unlockType: "class",
    unlockId: "ranger",
  });
  expect(result.rejectedCard).toMatchObject({
    accepted: false,
    reason: "insufficient-dust",
    dustSpentCents: 0,
  });
  expect(result.afterRejectedCard.dustCents).toBe(result.beforeRejectedCard.dustCents);
  expect(result.afterRejectedCard.unlocks.purchasedCards)
    .toEqual(result.beforeRejectedCard.unlocks.purchasedCards);
  expect(result.boughtCard).toMatchObject({
    accepted: true,
    dustSpentCents: result.cardCostCents,
    unlockType: "card",
    unlockId: "madmansJourney",
  });

  expect(result.failedDurablePurchase).toMatchObject({
    accepted: false,
    reason: "persistence-failed",
    dustSpentCents: 0,
  });
  expect(result.afterPersistenceFailure).toEqual(result.beforePersistenceFailure);
  expect(result.stored.unlocks.classes).toContain("ranger");
  expect(result.stored.unlocks.classes).not.toContain("demolitionist");
  expect(result.stored.unlocks.branches).toEqual([
    "dualRevolvers",
    "leverBarrage",
  ]);
  expect(result.stored.unlocks.purchasedCards).toContain("madmansJourney");

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Boolean(window.DustAndDeadProgression));
  const reloaded = await page.evaluate(() => window.DustAndDeadProgression.getSnapshot());
  expect(reloaded.dustCents).toBe(result.beforePersistenceFailure.dustCents);
  expect(reloaded.unlocks.classes).toContain("ranger");
  expect(reloaded.unlocks.classes).not.toContain("demolitionist");
  expect(reloaded.unlocks.branches).toEqual([
    "dualRevolvers",
    "leverBarrage",
  ]);
  expect(reloaded.unlocks.purchasedCards).toContain("madmansJourney");
});

test("a pre-store v1 save is grandfathered into the full legacy unlock catalog", async ({ page }) => {
  await page.addInitScript(({ storageKey, legacyState }) => {
    window.localStorage.setItem(storageKey, JSON.stringify(legacyState));
  }, {
    storageKey: PROGRESSION_STORAGE_KEY,
    legacyState: {
      version: 1,
      dustCents: 12345,
      zombieKillRemainder: 3,
      stats: {},
      completionTimestamps: {},
      settledMatchIds: [],
      masteryReceiptIds: [],
    },
  });
  await openProgression(page, { reset: false });

  const migrated = await page.evaluate((storageKey) => ({
    snapshot: window.DustAndDeadProgression.getSnapshot(),
    stored: JSON.parse(window.localStorage.getItem(storageKey)),
  }), PROGRESSION_STORAGE_KEY);

  expect(migrated.snapshot.dustCents).toBe(12345);
  expect(migrated.snapshot.unlocks.classes).toHaveLength(4);
  expect(migrated.snapshot.unlocks.branches).toHaveLength(8);
  expect(migrated.snapshot.unlocks.cards).toHaveLength(86);
  expect(migrated.snapshot.unlocks.purchasedCards).toHaveLength(56);
  expect(migrated.snapshot.unlocks.markedCards).toEqual([]);
  expect(migrated.stored.unlocks.classes).toHaveLength(4);
  expect(migrated.stored.unlocks.branches).toHaveLength(8);
  expect(migrated.stored.unlocks.purchasedCards).toHaveLength(56);
});

test("a current v1 save drops starter masteries that belong to locked classes", async ({ page }) => {
  await page.addInitScript(({ storageKey }) => {
    window.localStorage.setItem(storageKey, JSON.stringify({
      version: 1,
      dustCents: 0,
      zombieKillRemainder: 0,
      stats: {},
      completionTimestamps: {},
      settledMatchIds: [],
      masteryReceiptIds: [],
      unlocks: {
        classes: ["gunslinger"],
        branches: [
          "dualRevolvers",
          "leverBarrage",
          "bombardier",
          "breachMarshal",
        ],
        purchasedCards: [],
        markedCards: [],
      },
    }));
  }, { storageKey: PROGRESSION_STORAGE_KEY });
  await openProgression(page, { reset: false });

  const repaired = await page.evaluate((storageKey) => ({
    snapshot: window.DustAndDeadProgression.getSnapshot(),
    catalog: window.DustAndDeadProgression.getUnlockCatalog(),
    stored: JSON.parse(window.localStorage.getItem(storageKey)),
  }), PROGRESSION_STORAGE_KEY);

  expect(repaired.snapshot.unlocks.classes).toEqual(["gunslinger"]);
  expect(repaired.snapshot.unlocks.branches).toEqual(["dualRevolvers"]);
  expect(repaired.stored.unlocks.branches).toEqual(["dualRevolvers"]);
  expect(repaired.catalog.branches.filter((branch) => branch.unlocked).map((branch) => branch.id))
    .toEqual(["dualRevolvers"]);
});

test("a current v1 save repairs a missing starter mastery for every unlocked class", async ({ page }) => {
  await page.addInitScript(({ storageKey }) => {
    window.localStorage.setItem(storageKey, JSON.stringify({
      version: 1,
      dustCents: 0,
      zombieKillRemainder: 0,
      stats: {},
      completionTimestamps: {},
      settledMatchIds: [],
      masteryReceiptIds: [],
      unlocks: {
        classes: ["gunslinger", "ranger"],
        branches: ["dualRevolvers"],
        purchasedCards: [],
        markedCards: [],
      },
    }));
  }, { storageKey: PROGRESSION_STORAGE_KEY });
  await openProgression(page, { reset: false });

  const repaired = await page.evaluate((storageKey) => ({
    snapshot: window.DustAndDeadProgression.getSnapshot(),
    rangerStarterUnlocked: window.DustAndDeadProgression.isBranchUnlocked("leverBarrage"),
    stored: JSON.parse(window.localStorage.getItem(storageKey)),
  }), PROGRESSION_STORAGE_KEY);

  expect(repaired.snapshot.unlocks.classes).toEqual(["gunslinger", "ranger"]);
  expect(repaired.snapshot.unlocks.branches).toEqual([
    "dualRevolvers",
    "leverBarrage",
  ]);
  expect(repaired.rangerStarterUnlocked).toBe(true);
  expect(repaired.stored.unlocks.branches).toEqual([
    "dualRevolvers",
    "leverBarrage",
  ]);
});

test("the marked deck opens after ten card unlocks and accepts exactly five unlocked draftable cards", async ({ page }) => {
  await openProgression(page);

  const result = await page.evaluate(() => {
    const progression = window.DustAndDeadProgression;
    const purchasable = progression.getUnlockCatalog().cards.filter((card) => card.purchasable);
    const firstTen = purchasable.slice(0, 10);
    const stillLocked = purchasable[10];
    const totalCost = firstTen.reduce((sum, card) => sum + card.costCents, 0);
    progression.grantDustForTest(totalCost);

    for (const card of firstTen.slice(0, 9)) progression.purchaseCard(card.id);
    const selected = firstTen.slice(0, 5).map((card) => card.id);
    const beforeTenth = progression.setMarkedCards(selected);

    progression.purchaseCard(firstTen[9].id);
    const afterTenth = progression.getSnapshot();
    const fourCards = progression.setMarkedCards(selected.slice(0, 4));
    const duplicateCard = progression.setMarkedCards([
      selected[0],
      selected[0],
      selected[1],
      selected[2],
      selected[3],
    ]);
    const lockedCard = progression.setMarkedCards([
      selected[0],
      selected[1],
      selected[2],
      selected[3],
      stillLocked.id,
    ]);
    const nonDraftCard = progression.setMarkedCards([
      selected[0],
      selected[1],
      selected[2],
      selected[3],
      "napalmShells",
    ]);
    const saved = progression.setMarkedCards(selected);

    return {
      firstTen: firstTen.map((card) => card.id),
      stillLocked: stillLocked.id,
      selected,
      beforeTenth,
      afterTenth,
      fourCards,
      duplicateCard,
      lockedCard,
      nonDraftCard,
      saved,
      snapshot: progression.getSnapshot(),
      weights: {
        marked: progression.getCardDraftWeight(selected[0]),
        unmarked: progression.getCardDraftWeight(firstTen[9].id),
      },
    };
  });

  expect(result.beforeTenth).toMatchObject({
    accepted: false,
    reason: "marked-deck-locked",
  });
  expect(result.afterTenth.unlocks).toMatchObject({
    purchasedCardCount: 10,
    markedDeckUnlocked: true,
    markedDeckRequiredUnlocks: 10,
    markedCardCount: 5,
    markedCardDraftWeight: 2,
  });
  expect(result.fourCards).toMatchObject({ accepted: false, reason: "marked-card-count" });
  expect(result.duplicateCard).toMatchObject({ accepted: false, reason: "marked-card-count" });
  expect(result.lockedCard).toMatchObject({ accepted: false, reason: "card-locked" });
  expect(result.nonDraftCard).toMatchObject({ accepted: false, reason: "marked-card-count" });
  expect(result.saved).toMatchObject({
    accepted: true,
    markedCards: result.selected,
  });
  expect(result.snapshot.unlocks.markedCards).toEqual(result.selected);
  expect(result.weights).toEqual({ marked: 2, unmarked: 1 });

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Boolean(window.DustAndDeadProgression));
  const reloadedMarkedCards = await page.evaluate(
    () => window.DustAndDeadProgression.getSnapshot().unlocks.markedCards
  );
  expect(reloadedMarkedCards).toEqual(result.selected);
});

test("marked cards receive higher game-draft weight without becoming guaranteed or duplicating", async ({ page }) => {
  await openProgression(page);
  await page.evaluate(() => {
    const progression = window.DustAndDeadProgression;
    const cards = progression.getUnlockCatalog().cards.filter((card) => card.purchasable).slice(0, 10);
    progression.grantDustForTest(cards.reduce((sum, card) => sum + card.costCents, 0));
    cards.forEach((card) => progression.purchaseCard(card.id));
    const result = progression.setMarkedCards([
      "swiftBoots",
      "ricochetRounds",
      "softAim",
      "extendedTube",
      "trailLoader",
    ]);
    if (!result.accepted) throw new Error(result.reason);
  });
  await dismissIntro(page);
  await page.getByRole("button", { name: "Start Hunt" }).click();

  const sample = await page.evaluate(
    () => window.__dustAndDeadTest.rollUpgradeChoicesForTest(2, 500)
  );
  const counts = Object.create(null);
  for (const offer of sample.offers) {
    for (const id of offer) counts[id] = (counts[id] || 0) + 1;
  }

  expect(sample.offers).toHaveLength(500);
  expect(sample.offers.every(
    (offer) => offer.length === 3 && offer.length === new Set(offer).size
  )).toBe(true);
  expect(counts.swiftBoots).toBeGreaterThan(counts.steadyHand * 1.35);
  expect(counts.swiftBoots).toBeLessThan(500);
  expect(counts.steadyHand).toBeGreaterThan(0);
});

test("the Marked Deck UI selects and saves five unlocked cards", async ({ page }) => {
  await openProgression(page);
  const selected = [
    "swiftBoots",
    "steadyHand",
    "quickReload",
    "grit",
    "desertMender",
  ];
  await page.evaluate(() => {
    const progression = window.DustAndDeadProgression;
    const cards = progression.getUnlockCatalog().cards.filter((card) => card.purchasable).slice(0, 10);
    progression.grantDustForTest(cards.reduce((sum, card) => sum + card.costCents, 0));
    cards.forEach((card) => progression.purchaseCard(card.id));
  });
  await dismissIntro(page);
  await page.locator("#unlock-shop-btn").click();
  await page.locator('[data-unlock-tab="marked"]').click();

  await expect(page.locator(".marked-deck__slots .marked-deck__slot")).toHaveCount(5);
  await expect(page.locator("#unlock-shop-save-marked-btn")).toBeDisabled();
  for (const id of selected) {
    await page.locator(`[data-mark-card="${id}"]`).click();
  }
  await expect(page.locator('[data-unlock-tab-count="marked"]')).toHaveText("5 / 5");
  await expect(page.locator(".marked-deck__slot.is-filled")).toHaveCount(5);
  await expect(page.locator(".marked-deck__choice.is-selected")).toHaveCount(5);
  await expect(page.locator("#unlock-shop-save-marked-btn")).toBeEnabled();
  await expect(page.locator('[data-mark-card="luckyMagnet"]')).toBeDisabled();

  await page.locator("#unlock-shop-save-marked-btn").click();
  await expect(page.locator("#unlock-shop-status")).toHaveText(
    "Marked Deck saved. These five cards roll at x2 weight next run."
  );
  expect(await page.evaluate(
    () => window.DustAndDeadProgression.getSnapshot().unlocks.markedCards
  )).toEqual(selected);
});

test("completing a branch contract unlocks its second mastery branch", async ({ page }) => {
  await openProgression(page);

  const result = await page.evaluate(() => {
    const progression = window.DustAndDeadProgression;
    const branchBefore = progression.isBranchUnlocked("bigIron");
    for (let index = 0; index < 99; index += 1) {
      progression.recordSoloKill("walker", "revolver");
    }
    const contractAt99 = progression.getContracts()
      .find((contract) => contract.id === "arsenal.revolver.1");
    const branchAt99 = progression.isBranchUnlocked("bigIron");
    progression.recordSoloKill("walker", "revolver");
    const contractAt100 = progression.getContracts()
      .find((contract) => contract.id === "arsenal.revolver.1");
    const branchAt100 = progression.isBranchUnlocked("bigIron");
    return {
      branchBefore,
      branchAt99,
      branchAt100,
      contractAt99,
      contractAt100,
      snapshot: progression.getSnapshot(),
    };
  });

  expect(result.branchBefore).toBe(false);
  expect(result.branchAt99).toBe(false);
  expect(result.contractAt99).toMatchObject({
    target: 100,
    current: 99,
    completed: false,
    reward: {
      type: "masteryBranch",
      id: "bigIron",
      label: "Big Iron",
    },
  });
  expect(result.branchAt100).toBe(true);
  expect(result.contractAt100).toMatchObject({
    target: 100,
    current: 100,
    completed: true,
    reward: {
      type: "masteryBranch",
      id: "bigIron",
      label: "Big Iron",
    },
  });
  expect(result.snapshot.unlocks.branches).toContain("bigIron");

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Boolean(window.DustAndDeadProgression));
  expect(await page.evaluate(
    () => window.DustAndDeadProgression.isBranchUnlocked("bigIron")
  )).toBe(true);
});

test("a completed Ranger contract stays dormant until Ranger is purchased", async ({ page }) => {
  await openProgression(page);

  const beforePurchase = await page.evaluate(() => {
    const progression = window.DustAndDeadProgression;
    for (let index = 0; index < 100; index += 1) {
      progression.recordSoloKill("walker", "rifle");
    }
    const contract = progression.getContracts()
      .find((entry) => entry.id === "arsenal.rifle.1");
    const catalogBranch = progression.getUnlockCatalog().branches
      .find((entry) => entry.id === "trailWarden");
    return {
      contract,
      catalogBranch,
      branchUnlocked: progression.isBranchUnlocked("trailWarden"),
      snapshot: progression.getSnapshot(),
    };
  });

  expect(beforePurchase.contract).toMatchObject({
    id: "arsenal.rifle.1",
    current: 100,
    target: 100,
    completed: true,
  });
  expect(beforePurchase.branchUnlocked).toBe(false);
  expect(beforePurchase.snapshot.unlocks.branches).toEqual(["dualRevolvers"]);
  expect(beforePurchase.catalogBranch).toMatchObject({
    id: "trailWarden",
    classId: "ranger",
    classUnlocked: false,
    unlocked: false,
  });

  const afterPurchase = await page.evaluate(() => {
    const progression = window.DustAndDeadProgression;
    progression.grantDustForTest(50000);
    const purchase = progression.purchaseClass("ranger");
    return {
      purchase,
      snapshot: progression.getSnapshot(),
      leverBarrageUnlocked: progression.isBranchUnlocked("leverBarrage"),
      trailWardenUnlocked: progression.isBranchUnlocked("trailWarden"),
    };
  });

  expect(afterPurchase.purchase).toMatchObject({
    accepted: true,
    unlockType: "class",
    unlockId: "ranger",
  });
  expect(afterPurchase.snapshot.unlocks.branches).toEqual([
    "dualRevolvers",
    "leverBarrage",
    "trailWarden",
  ]);
  expect(afterPurchase.leverBarrageUnlocked).toBe(true);
  expect(afterPurchase.trailWardenUnlocked).toBe(true);

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Boolean(window.DustAndDeadProgression));
  expect(await page.evaluate(
    () => window.DustAndDeadProgression.getSnapshot().unlocks.branches
  )).toEqual([
    "dualRevolvers",
    "leverBarrage",
    "trailWarden",
  ]);
});

test("the unlock shop purchases Ranger, saves the deduction, and restores focus on Escape", async ({ page }) => {
  await openProgression(page);
  await dismissIntro(page);

  await page.locator("#unlock-shop-btn").click();
  const shop = page.locator("#unlock-shop");
  await expect(shop).toBeVisible();
  await expect(shop).toHaveClass(/is-visible/);
  await expect(shop).toHaveAttribute("aria-hidden", "false");
  await expect(page.locator("#unlock-shop-close-btn")).toBeFocused();

  await expect(page.locator('[data-unlock-tab-count="classes"]')).toHaveText("1 / 4");
  await expect(page.locator('[data-unlock-tab-count="mastery"]')).toHaveText("1 / 8");
  await expect(page.locator('[data-unlock-tab-count="cards"]')).toHaveText("30 / 86");
  await expect(page.locator('[data-unlock-tab-count="marked"]')).toHaveText("0 / 5");
  await expect(page.locator("#unlock-shop-card-progress")).toHaveText("30 / 86");
  await expect(page.locator("#unlock-shop-content .unlock-card--class")).toHaveCount(4);
  await expect(page.locator("#unlock-shop-content .unlock-card--class.unlock-playing-card"))
    .toHaveCount(4);
  await expect(page.locator("#unlock-shop-content .unlock-card--class.is-unlocked")).toHaveCount(1);
  await expect(page.locator("#unlock-shop-content .unlock-card--class.is-locked")).toHaveCount(3);
  await expect(page.locator("#unlock-shop-content .unlock-card--class").first())
    .toHaveAttribute("data-rank", /\S+/);
  await expect(page.locator("#unlock-shop-content .unlock-card--class").first())
    .toHaveAttribute("data-suit", /\S+/);

  const desktopClassTypography = await page.evaluate(() =>
    Array.from(document.querySelectorAll("#unlock-shop-content .unlock-card--class")).map((card) => {
      const heading = card.querySelector("h3");
      const description = card.querySelector(".unlock-card__copy");
      const meta = card.querySelector(".unlock-card__price");
      const action = card.querySelector(".unlock-card__action");
      return {
        headingSize: Number.parseFloat(getComputedStyle(heading).fontSize),
        descriptionSize: Number.parseFloat(getComputedStyle(description).fontSize),
        metaSize: Number.parseFloat(getComputedStyle(meta).fontSize),
        actionSize: action ? Number.parseFloat(getComputedStyle(action).fontSize) : null,
        cardOverflow: card.scrollHeight - card.clientHeight,
        descriptionOverflow: description.scrollHeight - description.clientHeight,
      };
    })
  );
  for (const sample of desktopClassTypography) {
    expect(sample.headingSize).toBeGreaterThanOrEqual(19);
    expect(sample.descriptionSize).toBeGreaterThanOrEqual(10.5);
    expect(sample.metaSize).toBeGreaterThanOrEqual(8.5);
    if (sample.actionSize != null) expect(sample.actionSize).toBeGreaterThanOrEqual(9.5);
    expect(sample.cardOverflow).toBeLessThanOrEqual(1);
    expect(sample.descriptionOverflow).toBeLessThanOrEqual(1);
  }

  await page.locator('[data-unlock-tab="mastery"]').click();
  await expect(page.locator(".unlock-group--mastery[data-unlock-class]")).toHaveCount(4);
  await expect(page.locator(".unlock-card--mastery.unlock-playing-card")).toHaveCount(8);
  await expect(page.locator(".unlock-card--mastery").first()).toHaveAttribute("data-rank", /\S+/);
  await expect(page.locator(".unlock-card--mastery").first()).toHaveAttribute("data-suit", /\S+/);
  const lockedRangerGroup = page.locator(
    '.unlock-group--mastery[data-unlock-class="ranger"]'
  );
  await expect(lockedRangerGroup).toHaveClass(/is-class-locked/);
  await expect(lockedRangerGroup.locator(".unlock-card--mastery.is-parent-locked"))
    .toHaveCount(2);
  await expect(lockedRangerGroup.locator(".unlock-card--mastery.is-unlocked"))
    .toHaveCount(0);
  await expect(lockedRangerGroup.locator(".unlock-card__status"))
    .toHaveText(["Class locked", "Class locked"]);
  await expectLegibleDesktopUnlockCards(page, ".unlock-card--mastery");
  await page.locator('[data-unlock-tab="classes"]').click();

  const rangerPurchase = page.locator('[data-purchase-class="ranger"]');
  await expect(rangerPurchase).toBeDisabled();
  await page.evaluate(() => window.DustAndDeadProgression.grantDustForTest(50000));
  await expect(shop.locator('[data-progression-output="dust"]')).toHaveText("500.00");
  await expect(rangerPurchase).toBeEnabled();
  await rangerPurchase.click();

  await expect(shop.locator('[data-progression-output="dust"]')).toHaveText("0.00");
  await expect(page.locator('[data-unlock-tab-count="classes"]')).toHaveText("2 / 4");
  await expect(page.locator('[data-unlock-tab-count="mastery"]')).toHaveText("2 / 8");
  await expect(page.locator('[data-purchase-class="ranger"]')).toHaveCount(0);
  const rangerCard = page.locator("#unlock-shop-content .unlock-card--class").filter({
    has: page.getByRole("heading", { name: "Ranger", exact: true }),
  });
  await expect(rangerCard).toHaveClass(/is-unlocked/);
  await expect(rangerCard.locator(".unlock-card__status")).toHaveText("Unlocked");
  await expect(page.locator("#unlock-shop-status")).toHaveText(
    "Ranger unlocked. It will enter your next run."
  );
  await expect(page.locator("#unlock-shop-status")).toHaveAttribute("data-kind", "success");

  const storedAfterPurchase = await page.evaluate((storageKey) => {
    const stored = JSON.parse(window.localStorage.getItem(storageKey));
    return {
      dustCents: stored.dustCents,
      classes: stored.unlocks.classes,
      branches: stored.unlocks.branches,
    };
  }, PROGRESSION_STORAGE_KEY);
  expect(storedAfterPurchase).toEqual({
    dustCents: 0,
    classes: ["gunslinger", "ranger"],
    branches: ["dualRevolvers", "leverBarrage"],
  });

  await page.locator('[data-unlock-tab="mastery"]').click();
  const unlockedRangerGroup = page.locator(
    '.unlock-group--mastery[data-unlock-class="ranger"]'
  );
  await expect(unlockedRangerGroup).not.toHaveClass(/is-class-locked/);
  await expect(unlockedRangerGroup.locator(".unlock-card--mastery.is-parent-locked"))
    .toHaveCount(0);
  await expect(unlockedRangerGroup.locator(".unlock-card--mastery.is-unlocked"))
    .toHaveCount(1);
  const leverBarrageCard = unlockedRangerGroup.locator(".unlock-card--mastery").filter({
    has: page.getByRole("heading", { name: "Lever Barrage", exact: true }),
  });
  await expect(leverBarrageCard).toHaveClass(/is-unlocked/);
  await expect(leverBarrageCard.locator(".unlock-card__status")).toHaveText("Unlocked");

  await page.locator('[data-unlock-tab="cards"]').click();
  await expect(page.locator(".unlock-card--card.unlock-playing-card")).toHaveCount(86);
  await expectLegibleDesktopUnlockCards(page, ".unlock-card--card");
  await expect(page.locator('.unlock-class-group[data-card-class-group="frontier"]'))
    .toHaveCount(1);
  await expect(page.locator('.unlock-class-group[data-card-class-group="gunslinger"]'))
    .toHaveCount(1);
  await expect(page.locator('.unlock-class-group[data-card-class-group="ranger"]'))
    .toHaveCount(1);
  await expect(page.locator('.unlock-branch-group[data-card-branch-group="frontier"]'))
    .toHaveCount(1);
  await expect(page.locator('.unlock-branch-group[data-card-branch-group="dualRevolvers"]'))
    .toHaveCount(1);
  await expect(page.locator('.unlock-branch-group[data-card-branch-group="leverBarrage"]'))
    .toHaveCount(1);

  await page.keyboard.press("Escape");
  await expect(shop).toBeHidden();
  await expect(shop).toHaveAttribute("aria-hidden", "true");
  await expect(page.locator("#menu")).toBeVisible();
  await expect(page.locator("#unlock-shop-btn")).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator("#unlock-shop-btn")).toBeFocused();

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Boolean(window.DustAndDeadProgression));
  const reloaded = await page.evaluate(() => ({
    dustCents: window.DustAndDeadProgression.getSnapshot().dustCents,
    rangerUnlocked: window.DustAndDeadProgression.isClassUnlocked("ranger"),
    branches: window.DustAndDeadProgression.getSnapshot().unlocks.branches,
  }));
  expect(reloaded).toEqual({
    dustCents: 0,
    rangerUnlocked: true,
    branches: ["dualRevolvers", "leverBarrage"],
  });
});

test("multiplayer class offers use each player's own unlock profile", async ({ page }) => {
  await openProgression(page);
  await dismissIntro(page);

  const result = await page.evaluate(() => {
    const api = window.__dustMultiplayerTest;
    api.startMockHost(["Newcomer", "Ranger owner"]);

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

    function awardThroughLevelFive(playerId) {
      for (let level = 1; level < 5; level += 1) {
        const player = api.getState().players.find((entry) => entry.id === playerId);
        api.awardXp(playerId, player.progression.xpToNext - player.progression.xp);
      }
    }

    function drainToClassOffer(playerId) {
      for (let guard = 0; guard < 8; guard += 1) {
        const offer = api.getUpgradeOffer(playerId);
        if (!offer) throw new Error(`missing upgrade offer for ${playerId}`);
        if (offer.kind === "class") return offer;
        api.chooseUpgrade(playerId, offer.choices[0], offer.id);
      }
      throw new Error(`class offer was not reached for ${playerId}`);
    }

    awardThroughLevelFive("mock-player-1");
    awardThroughLevelFive("mock-player-2");
    const hostOffer = drainToClassOffer("mock-player-1");
    const guestOffer = drainToClassOffer("mock-player-2");
    return {
      hostProfile,
      guestProfile,
      hostOffer,
      guestOffer,
      players: api.getState().players.map((player) => ({
        id: player.id,
        level: player.progression.level,
        playerClass: player.progression.playerClass,
      })),
    };
  });

  expect(result.hostProfile.classes).toEqual(["gunslinger"]);
  expect(result.guestProfile.classes).toEqual(["gunslinger", "ranger"]);
  expect(result.players).toEqual([
    { id: "mock-player-1", level: 5, playerClass: null },
    { id: "mock-player-2", level: 5, playerClass: null },
  ]);
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
  expect(result.hostOffer.choices).not.toEqual(result.guestOffer.choices);
  expect(result.hostOffer.choices).not.toContain("ranger");
  expect(result.hostOffer.choices).not.toContain("demolitionist");
  expect(result.hostOffer.choices).not.toContain("marshal");
  expect(result.guestOffer.choices).not.toContain("demolitionist");
  expect(result.guestOffer.choices).not.toContain("marshal");
});
