const path = require("node:path");
const { expect, test } = require("@playwright/test");

const VIEWPORTS = [
  { name: "desktop", width: 1280, height: 720 },
  { name: "android-landscape", width: 915, height: 412 },
  { name: "android-narrow", width: 740, height: 360 },
];

function fileUrl(relativePath) {
  const absolute = path.resolve(__dirname, "..", relativePath).replace(/\\/g, "/");
  return `file:///${absolute}`;
}

async function openGame(page, viewport) {
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`${fileUrl("index.html")}?mapSeed=7331`);

  const intro = page.locator("#intro-screen");
  if (await intro.isVisible().catch(() => false)) {
    await page.keyboard.press("KeyM");
    await expect(intro).toBeHidden();
  }
  await page.waitForFunction(() => Boolean(window.__dustMultiplayerTest));
}

async function prepareClassOffer(page) {
  return page.evaluate(() => {
    const api = window.__dustMultiplayerTest;
    api.startMockHost(["Leveler", "Baseline"]);

    while (api.getState().players[0].progression.level < 5) {
      const player = api.getState().players[0];
      api.awardXp("mock-player-1", player.progression.xpToNext - player.progression.xp);
    }

    let offer = api.getUpgradeOffer("mock-player-1");
    while (offer && offer.kind !== "class") {
      api.chooseUpgrade("mock-player-1", offer.choices[0], offer.id);
      offer = api.getUpgradeOffer("mock-player-1");
    }

    return {
      offer,
      multiplayer: api.getState(),
      game: JSON.parse(window.render_game_to_text()),
    };
  });
}

async function prepareSingleClassOffer(page) {
  return page.evaluate(() => {
    const api = window.__dustMultiplayerTest;
    api.startMockHost(["Starter"]);
    api.setUnlockProfile("mock-player-1", {
      version: 1,
      classes: ["gunslinger"],
      branches: ["dualRevolvers"],
      purchasedCards: [],
      markedCards: [],
    });

    while (api.getState().players[0].progression.level < 5) {
      const player = api.getState().players[0];
      api.awardXp("mock-player-1", player.progression.xpToNext - player.progression.xp);
    }

    let offer = api.getUpgradeOffer("mock-player-1");
    while (offer && offer.kind !== "class") {
      api.chooseUpgrade("mock-player-1", offer.choices[0], offer.id);
      offer = api.getUpgradeOffer("mock-player-1");
    }
    return offer;
  });
}

function expectRectInsideViewport(rect, viewport, label) {
  const epsilon = 1;
  expect(rect.width, `${label} must have a positive width`).toBeGreaterThan(0);
  expect(rect.height, `${label} must have a positive height`).toBeGreaterThan(0);
  expect(rect.left, `${label} clips the viewport on the left`).toBeGreaterThanOrEqual(-epsilon);
  expect(rect.top, `${label} clips the viewport at the top`).toBeGreaterThanOrEqual(-epsilon);
  expect(rect.right, `${label} clips the viewport on the right`).toBeLessThanOrEqual(viewport.width + epsilon);
  expect(rect.bottom, `${label} clips the viewport at the bottom`).toBeLessThanOrEqual(viewport.height + epsilon);
}

for (const viewport of VIEWPORTS) {
  test(`solo-style multiplayer class picker fits ${viewport.name} ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await openGame(page, viewport);

    const prepared = await prepareClassOffer(page);
    expect(prepared.offer).toBeTruthy();
    expect(prepared.offer.kind).toBe("class");
    expect(prepared.offer.choices).toEqual(["gunslinger", "ranger", "demolitionist", "marshal"]);
    expect(prepared.multiplayer.players[0].progression.pendingUpgradeLevels).toEqual([5]);
    expect(prepared.game.mode).toBe("playing");
    expect(prepared.game.paused).toBe(false);

    const notification = page.locator("#multiplayer-upgrade-toggle");
    await expect(notification).toBeVisible();
    await expect(page.locator("#multiplayer-upgrade-pending-count")).toHaveText("1");
    await notification.click();

    const drawer = page.locator("#multiplayer-upgrade-drawer");
    const cards = drawer.locator("[data-multiplayer-upgrade]");
    await expect(drawer).toHaveClass(/is-open/);
    await expect(drawer).toHaveAttribute("aria-hidden", "false");
    await expect(notification).toHaveAttribute("aria-expanded", "true");
    await expect(cards).toHaveCount(4);

    for (let index = 0; index < 4; index += 1) {
      await expect(cards.nth(index)).toBeVisible();
      await expect(cards.nth(index)).toBeEnabled();
    }

    const layout = await drawer.evaluate((element) => {
      const rectToObject = (rect) => ({
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      });
      const body = element.querySelector(".multiplayer-upgrade-drawer__body");
      const optionCards = Array.from(element.querySelectorAll("[data-multiplayer-upgrade]"));
      const style = window.getComputedStyle(element);
      const bodyStyle = body ? window.getComputedStyle(body) : null;

      return {
        viewport: { width: window.innerWidth, height: window.innerHeight },
        drawer: {
          rect: rectToObject(element.getBoundingClientRect()),
          clientWidth: element.clientWidth,
          clientHeight: element.clientHeight,
          scrollWidth: element.scrollWidth,
          scrollHeight: element.scrollHeight,
          overflowX: style.overflowX,
          overflowY: style.overflowY,
        },
        body: body ? {
          rect: rectToObject(body.getBoundingClientRect()),
          clientWidth: body.clientWidth,
          scrollWidth: body.scrollWidth,
          overflowX: bodyStyle.overflowX,
        } : null,
        cards: optionCards.map((card) => rectToObject(card.getBoundingClientRect())),
      };
    });

    expect(layout.viewport).toEqual({ width: viewport.width, height: viewport.height });
    expectRectInsideViewport(layout.drawer.rect, viewport, "upgrade drawer");
    expect(layout.body, "upgrade drawer body must exist").toBeTruthy();
    expect(layout.body.rect.width).toBeGreaterThan(0);
    expect(layout.body.rect.height).toBeGreaterThan(0);

    const drawerHasNoHorizontalOverflow = layout.drawer.scrollWidth <= layout.drawer.clientWidth + 1;
    const bodyHasNoHorizontalOverflow = layout.body.scrollWidth <= layout.body.clientWidth + 1;
    expect(drawerHasNoHorizontalOverflow, JSON.stringify(layout.drawer, null, 2)).toBe(true);
    expect(bodyHasNoHorizontalOverflow, JSON.stringify(layout.body, null, 2)).toBe(true);

    const drawerFitsVertically = layout.drawer.scrollHeight <= layout.drawer.clientHeight + 1;
    const drawerCanScrollVertically = layout.drawer.overflowY === "auto" || layout.drawer.overflowY === "scroll";
    expect(
      drawerFitsVertically || drawerCanScrollVertically,
      `drawer must fit vertically or be scrollable: ${JSON.stringify(layout.drawer, null, 2)}`
    ).toBe(true);

    expect(layout.cards).toHaveLength(4);
    for (const [index, cardRect] of layout.cards.entries()) {
      expectRectInsideViewport(cardRect, viewport, `class card ${index + 1}`);
      expect(cardRect.left, `class card ${index + 1} clips drawer left`).toBeGreaterThanOrEqual(layout.drawer.rect.left - 1);
      expect(cardRect.right, `class card ${index + 1} clips drawer right`).toBeLessThanOrEqual(layout.drawer.rect.right + 1);
    }

    const whileOpen = await page.evaluate(() => ({
      game: JSON.parse(window.render_game_to_text()),
      rootPlaying: document.getElementById("game-root").classList.contains("is-playing"),
      rootPaused: document.getElementById("game-root").classList.contains("is-paused"),
    }));
    expect(whileOpen.game.mode).toBe("playing");
    expect(whileOpen.game.paused).toBe(false);
    expect(whileOpen.rootPlaying).toBe(true);
    expect(whileOpen.rootPaused).toBe(false);

    await drawer.locator('[data-multiplayer-upgrade="ranger"]').click();

    const afterChoice = await page.evaluate(() => ({
      multiplayer: window.__dustMultiplayerTest.getState(),
      game: JSON.parse(window.render_game_to_text()),
    }));
    expect(afterChoice.multiplayer.players[0].progression.playerClass).toBe("ranger");
    expect(afterChoice.game.mode).toBe("playing");
    expect(afterChoice.game.paused).toBe(false);
    await expect(page.locator("#multiplayer-upgrade-pending-count")).toHaveText("0");
    await expect(drawer).not.toHaveClass(/is-open/);
    await expect(drawer).toHaveAttribute("aria-hidden", "true");
  });
}

test("a one-card mobile multiplayer offer uses a one-card panel", async ({ page }) => {
  const viewport = { width: 2048, height: 945 };
  await openGame(page, viewport);
  await page.evaluate(() => document.documentElement.classList.add("is-mobile-runtime"));

  const offer = await prepareSingleClassOffer(page);
  expect(offer).toBeTruthy();
  expect(offer.kind).toBe("class");
  expect(offer.choices).toEqual(["gunslinger"]);

  await page.locator("#multiplayer-upgrade-toggle").click();
  const drawer = page.locator("#multiplayer-upgrade-drawer");
  const options = page.locator("#multiplayer-upgrade-options");
  const cards = options.locator("[data-multiplayer-upgrade]");
  await expect(drawer).toHaveClass(/is-open/);
  await expect(drawer).toHaveAttribute("data-visible-choices", "1");
  await expect(options).toHaveAttribute("data-visible-choices", "1");
  await expect(cards).toHaveCount(1);

  const layout = await page.evaluate(() => {
    const drawerElement = document.getElementById("multiplayer-upgrade-drawer");
    const optionsElement = document.getElementById("multiplayer-upgrade-options");
    const card = optionsElement.querySelector("[data-multiplayer-upgrade]");
    const rect = (element) => {
      const bounds = element.getBoundingClientRect();
      return {
        left: bounds.left,
        right: bounds.right,
        width: bounds.width,
      };
    };
    return {
      drawer: rect(drawerElement),
      options: rect(optionsElement),
      card: rect(card),
    };
  });

  expect(layout.drawer.width).toBeLessThanOrEqual(382);
  expect(layout.card.width).toBeLessThanOrEqual(232);
  expect(Math.abs(
    (layout.card.left + layout.card.right) / 2 -
    (layout.options.left + layout.options.right) / 2
  )).toBeLessThanOrEqual(1);
});
