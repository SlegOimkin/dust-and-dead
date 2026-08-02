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

async function startHunt(page, query) {
  await page.goto(`${fileUrl("index.html")}?${query}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Boolean(
    window.DustAndDeadProgression &&
    window.__dustAndDeadTest &&
    window.render_game_to_text
  ));
  await page.evaluate(() => window.DustAndDeadProgression.resetForTest());
  await dismissIntro(page);
  await page.getByRole("button", { name: "Start Hunt" }).click();
}

const BRANCH_CASES = [
  { classId: "gunslinger", branchId: "dualRevolvers", chooser: "chooseRevolverUpgrade" },
  { classId: "gunslinger", branchId: "bigIron", chooser: "chooseRevolverUpgrade" },
  { classId: "ranger", branchId: "leverBarrage", chooser: "chooseRifleUpgrade" },
  { classId: "ranger", branchId: "trailWarden", chooser: "chooseRifleUpgrade" },
  { classId: "demolitionist", branchId: "bombardier", chooser: "chooseLauncherUpgrade" },
  { classId: "demolitionist", branchId: "pyrotechnician", chooser: "chooseLauncherUpgrade" },
  { classId: "marshal", branchId: "breachMarshal", chooser: "chooseMarshalUpgrade" },
  { classId: "marshal", branchId: "graveWarden", chooser: "chooseMarshalUpgrade" },
];

test.afterEach(async ({ page }) => {
  if (page.isClosed()) return;
  await page.evaluate(() => window.DustAndDeadProgression?.resetForTest()).catch(() => {});
});

test("all ten standard cards enter the real weighted draft without duplicates", async ({ page }) => {
  await startHunt(page, "allStandardReachability=1");

  const result = await page.evaluate(() => {
    const progression = window.DustAndDeadProgression;
    const api = window.__dustAndDeadTest;
    progression.unlockAllForTest();
    api.setCareerUnlockProfileForTest(progression.getUnlockProfile());
    const catalog = api.getRunUpgradeCatalogForTest();
    const standardIds = catalog.filter((card) => !card.branch).map((card) => card.id);
    const eligible = api.getEligibleUpgradeIdsForTest(2).standard;
    const sample = api.rollUpgradeChoicesForTest(2, 500);
    return { standardIds, eligible, sample };
  });

  expect(result.standardIds).toHaveLength(10);
  expect(result.eligible.sort()).toEqual(result.standardIds.sort());
  expect(result.sample.seen.sort()).toEqual(result.standardIds.sort());
  expect(result.sample.offers.every(
    (offer) => offer.length === 3 && offer.length === new Set(offer).size
  )).toBe(true);
});

for (const branchCase of BRANCH_CASES) {
  test(`${branchCase.branchId}: every draftable card becomes eligible and appears in real rolls`, async ({ page }) => {
    await startHunt(page, `branchReachability=${branchCase.branchId}`);

    const result = await page.evaluate(({ classId, branchId, chooser }) => {
      const api = window.__dustAndDeadTest;
      api.clearEnemies();
      api.grantXp(240);
      if (!api.chooseClass(classId)) throw new Error(`Could not choose ${classId}`);
      api.forceAllStandardUpgrades("swiftBoots");
      api.grantXp(1200);
      if (!api[chooser](branchId)) throw new Error(`Could not choose ${branchId}`);
      api.forceAllStandardUpgrades("swiftBoots");

      const branchCards = api.getRunUpgradeCatalogForTest().filter(
        (card) => card.branch === branchId
      );
      const inherent = branchCards.filter(
        (card) => branchId === "pyrotechnician" && card.starter
      ).map((card) => card.id);
      const expected = branchCards.filter(
        (card) => !(branchId === "pyrotechnician" && card.starter)
      ).map((card) => card.id);
      const seen = new Set();
      const eligibilityWaves = [];
      const missingFromRolls = [];

      for (let guard = 0; guard < expected.length + 4; guard += 1) {
        const eligible = api.getEligibleUpgradeIdsForTest(100).special.filter(
          (id) => expected.includes(id)
        );
        const sample = api.rollUpgradeChoicesForTest(100, 500);
        const sampled = new Set(sample.seen);
        for (const id of eligible) {
          if (!sampled.has(id)) missingFromRolls.push(id);
        }
        const newlyEligible = eligible.filter((id) => !seen.has(id));
        eligibilityWaves.push(newlyEligible.slice());
        if (!newlyEligible.length) break;
        for (const id of newlyEligible) {
          seen.add(id);
          api.grantUpgrade(id);
        }
      }

      return {
        totalBranchCards: branchCards.map((card) => card.id),
        inherent,
        expected,
        seen: Array.from(seen),
        eligibilityWaves,
        missingFromRolls,
      };
    }, branchCase);

    expect(result.missingFromRolls).toEqual([]);
    expect(result.seen.sort()).toEqual(result.expected.sort());
    expect(result.totalBranchCards).toHaveLength(result.expected.length + result.inherent.length);
    if (branchCase.branchId === "pyrotechnician") {
      expect(result.inherent.sort()).toEqual(["fireproofPowder", "napalmShells"]);
    } else {
      expect(result.inherent).toEqual([]);
    }
    expect(result.eligibilityWaves.some((wave) => wave.length > 0)).toBe(true);
  });
}
