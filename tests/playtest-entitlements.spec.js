const path = require("node:path");
const { expect, test } = require("@playwright/test");

const STORAGE_KEY = "dustAndDeadMetaProgression.v1";

function fileUrl(relativePath) {
  const absolute = path.resolve(__dirname, "..", relativePath).replace(/\\/g, "/");
  return `file:///${absolute}`;
}

async function openProgression(page) {
  await page.goto(`${fileUrl("index.html")}?playtestEntitlements=1`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForFunction(() => Boolean(window.DustAndDeadProgression));
}

test("playtest access opens content without persisting ownership and normal mode restores locks", async ({ browser }) => {
  const testContext = await browser.newContext();
  await testContext.addInitScript(() => {
    window.DustAndDeadBuildProfile = Object.freeze({
      channel: "test-all",
      testAllAccess: true,
    });
  });
  const testPage = await testContext.newPage();
  await openProgression(testPage);
  await testPage.evaluate(() => window.DustAndDeadProgression.resetForTest());

  const playtest = await testPage.evaluate((storageKey) => {
    const progression = window.DustAndDeadProgression;
    const fresh = progression.getSnapshot();
    const unlocks = progression.getUnlockCatalog();
    const cosmetics = progression.getCosmeticCatalog();
    const temporaryClass = unlocks.classes.find((entry) => entry.testEntitled);
    const temporaryCard = unlocks.cards.find((entry) => entry.testEntitled);
    const temporaryCosmetic = cosmetics.cowboys.find((entry) => entry.testEntitled);
    const firstChallenge = progression.getChallenges()[0];

    const selected = progression.selectCosmetic("cowboy", temporaryCosmetic.id);
    const dustBeforePurchases = progression.getSnapshot().dustCents;
    const purchaseResults = [
      progression.purchaseClass(temporaryClass.id),
      progression.purchaseCard(temporaryCard.id),
      progression.purchaseCosmetic("cowboy", temporaryCosmetic.id),
    ];

    for (let index = 0; index < 10; index += 1) {
      progression.recordSoloKill("walker", "revolver");
    }
    progression.recordChallengeCompleted(firstChallenge.id);

    const finalSnapshot = progression.getSnapshot();
    const stored = JSON.parse(localStorage.getItem(storageKey));
    return {
      fresh,
      unlocks,
      cosmetics,
      temporaryCosmeticId: temporaryCosmetic.id,
      selected,
      purchaseResults: purchaseResults.map((result) => ({
        accepted: result.accepted,
        reason: result.reason,
      })),
      dustBeforePurchases,
      finalSnapshot,
      stored,
      completedChallengeId: firstChallenge.id,
    };
  }, STORAGE_KEY);

  expect(playtest.fresh.testAllAccess).toBe(true);
  expect(playtest.fresh.challenges.completedCount).toBe(0);
  expect(playtest.unlocks.classes.every((entry) => entry.unlocked)).toBe(true);
  expect(playtest.unlocks.branches.every((entry) => entry.unlocked)).toBe(true);
  expect(playtest.unlocks.cards.every((entry) => entry.unlocked)).toBe(true);
  expect([
    ...playtest.cosmetics.cowboys,
    ...playtest.cosmetics.hats,
  ].every((entry) => entry.unlocked)).toBe(true);

  expect(playtest.selected.accepted).toBe(true);
  expect(playtest.finalSnapshot.cosmetics.cowboyId).toBe(playtest.temporaryCosmeticId);
  expect(playtest.stored.cosmetics.cowboyId).toBe("trailwornDrifter");
  expect(playtest.purchaseResults.every((result) => !result.accepted)).toBe(true);
  expect(playtest.finalSnapshot.dustCents).toBeGreaterThan(playtest.dustBeforePurchases);
  expect(playtest.stored.unlocks.classes).toEqual(["gunslinger"]);
  expect(playtest.stored.unlocks.branches).toEqual(["dualRevolvers"]);
  expect(playtest.stored.unlocks.purchasedCards).toEqual([]);
  expect(playtest.stored.unlocks.purchasedCosmetics).toEqual([]);
  expect(playtest.stored.stats.killsTotal).toBe(10);
  expect(playtest.stored.challenges.completed[playtest.completedChallengeId]).toBeTruthy();

  const savedState = JSON.stringify(playtest.stored);
  await testContext.close();

  const normalContext = await browser.newContext();
  await normalContext.addInitScript(({ storageKey, savedState }) => {
    localStorage.setItem(storageKey, savedState);
  }, { storageKey: STORAGE_KEY, savedState });
  const normalPage = await normalContext.newPage();
  await openProgression(normalPage);

  const normal = await normalPage.evaluate(() => {
    const progression = window.DustAndDeadProgression;
    return {
      snapshot: progression.getSnapshot(),
      unlocks: progression.getUnlockCatalog(),
      cosmetics: progression.getCosmeticCatalog(),
    };
  });

  expect(normal.snapshot.testAllAccess).toBe(false);
  expect(normal.snapshot.unlocks.classes).toEqual(["gunslinger"]);
  expect(normal.snapshot.unlocks.branches).toEqual(["dualRevolvers"]);
  expect(normal.snapshot.unlocks.purchasedCards).toEqual([]);
  expect(normal.snapshot.stats.killsTotal).toBe(10);
  expect(normal.snapshot.dustCents).toBe(playtest.finalSnapshot.dustCents);
  expect(normal.snapshot.challenges.completed[playtest.completedChallengeId]).toBeTruthy();
  expect(normal.unlocks.classes.some((entry) => !entry.unlocked)).toBe(true);
  expect(normal.unlocks.cards.some((entry) => !entry.unlocked)).toBe(true);
  expect(normal.cosmetics.cowboys.some((entry) => !entry.unlocked)).toBe(true);
  expect(normal.snapshot.cosmetics.cowboyId).toBe("trailwornDrifter");

  await normalContext.close();
});
