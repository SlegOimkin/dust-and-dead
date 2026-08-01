const path = require("node:path");
const { expect, test } = require("@playwright/test");

function fileUrl(relativePath) {
  const absolute = path.resolve(__dirname, "..", relativePath).replace(/\\/g, "/");
  return `file:///${absolute}`;
}

test("the random wave 10 level 13 stand stocks every weapon with huge reserves", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto(`${fileUrl("index.html")}?mapSeed=7331&preview=wave10-level13-test`);
  await page.waitForFunction(() => (
    document.body.classList.contains("test-stand-active")
      && document.body.dataset.testStandLevel === "13"
      && Boolean(window.__dustAndDeadTest)
  ));

  const readAmmo = () => page.evaluate(() => ({
    reserveAttribute: Number(document.body.getAttribute("data-test-stand-ammo-reserve")),
    boss: document.body.dataset.testStandBoss,
    ammo: JSON.parse(window.render_game_to_text()).ammo.weapons,
  }));
  const opening = await readAmmo();

  expect(opening.boss).not.toBe("");
  for (const weapon of Object.values(opening.ammo)) {
    expect(weapon.current).toBe(weapon.magazine);
    expect(weapon.reserve).toBeGreaterThanOrEqual(999999);
  }

  await page.getByRole("button", { name: "Перезапустить стенд с другим случайным боссом" }).click();
  await expect.poll(async () => (await readAmmo()).boss).not.toBe(opening.boss);
  const rerolled = await readAmmo();
  for (const weapon of Object.values(rerolled.ammo)) {
    expect(weapon.current).toBe(weapon.magazine);
    expect(weapon.reserve).toBeGreaterThanOrEqual(999999);
  }
  expect(pageErrors).toEqual([]);
});
