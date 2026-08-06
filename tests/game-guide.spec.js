const fs = require("node:fs");
const path = require("node:path");
const { expect, test } = require("@playwright/test");

function fileUrl(relativePath) {
  const absolute = path.resolve(__dirname, "..", relativePath).replace(/\\/g, "/");
  return `file:///${absolute}`;
}

async function openMainMenu(page) {
  await page.goto(`${fileUrl("index.html")}?mapSeed=7301&guideQa=1`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForFunction(() => Boolean(window.__dustAndDeadTest));
  const intro = page.locator("#intro-screen");
  if (await intro.isVisible().catch(() => false)) {
    await page.keyboard.press("KeyM");
    await expect(intro).toBeHidden();
  }
}

async function waitForGuideSettled(page) {
  await page.waitForFunction(() => {
    const panel = document.querySelector(".game-guide__panel");
    return panel && panel.getAnimations().every((animation) => animation.playState === "finished");
  });
}

async function waitForLauncherSettled(page) {
  await page.waitForFunction(() => {
    const launcher = document.getElementById("game-guide-btn");
    return launcher && launcher.getAnimations().every((animation) => animation.playState === "finished");
  });
}

function expectInside(rect, viewport, label) {
  expect(rect, `${label} should have measurable bounds`).not.toBeNull();
  expect(rect.left, `${label} left`).toBeGreaterThanOrEqual(-1);
  expect(rect.top, `${label} top`).toBeGreaterThanOrEqual(-1);
  expect(rect.right, `${label} right`).toBeLessThanOrEqual(viewport.width + 1);
  expect(rect.bottom, `${label} bottom`).toBeLessThanOrEqual(viewport.height + 1);
}

test("field guide opens from the lower-right menu button with English copy and game SVG art", async ({ page }) => {
  const viewport = { width: 1280, height: 720 };
  const browserErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));

  await page.setViewportSize(viewport);
  await openMainMenu(page);
  await waitForLauncherSettled(page);

  const launcher = page.locator("#game-guide-btn");
  await expect(launcher).toBeVisible();
  await expect(launcher).toHaveAttribute("aria-expanded", "false");
  const launcherBounds = await launcher.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
  });
  expectInside(launcherBounds, viewport, "desktop guide launcher");
  expect(launcherBounds.left).toBeGreaterThan(viewport.width / 2);
  expect(launcherBounds.top).toBeGreaterThan(viewport.height / 2);
  fs.mkdirSync(path.resolve(__dirname, "..", "test-results"), { recursive: true });
  await page.screenshot({
    path: path.resolve(__dirname, "..", "test-results", "game-guide-launcher-desktop.png"),
  });

  await launcher.click();
  await waitForGuideSettled(page);

  const guide = page.locator("#game-guide");
  await expect(guide).toBeVisible();
  await expect(guide).toHaveClass(/is-visible/);
  await expect(guide).toHaveAttribute("aria-hidden", "false");
  await expect(launcher).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator("#menu")).toBeHidden();
  await expect(page.locator("#game-guide-close-btn")).toBeFocused();

  await expect(guide.getByRole("heading", { name: "A Hunter's Guide" })).toBeVisible();
  await expect(guide.getByRole("heading", { name: "Your first minute" })).toBeVisible();
  await expect(guide.getByRole("heading", { name: "Simple hands, clear eyes" })).toBeVisible();
  await expect(guide.getByRole("heading", { name: "Four moments shape a hunt" })).toBeVisible();

  const contentAudit = await page.evaluate(() => {
    const guideElement = document.getElementById("game-guide");
    const weaponIcons = Array.from(guideElement.querySelectorAll("[data-weapon-icon]"));
    return {
      documentLanguage: document.documentElement.lang,
      guideLanguage: guideElement.lang,
      hasCyrillic: /[А-Яа-яЁё]/.test(guideElement.textContent || ""),
      upgradeSvgCount: guideElement.querySelectorAll("#game-guide-upgrade-icon svg").length,
      upgradePathCount: guideElement.querySelectorAll("#game-guide-upgrade-icon path").length,
      weaponIconCount: weaponIcons.length,
      populatedWeaponIcons: weaponIcons.filter((icon) => icon.children.length > 0).length,
    };
  });
  expect(contentAudit).toEqual({
    documentLanguage: "en",
    guideLanguage: "en",
    hasCyrillic: false,
    upgradeSvgCount: 1,
    upgradePathCount: 1,
    weaponIconCount: 4,
    populatedWeaponIcons: 4,
  });

  await page.screenshot({
    path: path.resolve(__dirname, "..", "test-results", "game-guide-desktop.png"),
  });

  const progressNav = guide.getByRole("button", { name: "Progress" });
  await progressNav.click();
  await page.waitForTimeout(350);
  expect(await page.locator("#game-guide-body").evaluate((element) => element.scrollTop)).toBeGreaterThan(100);
  await expect(progressNav).toHaveAttribute("aria-current", "page");
  await expect(guide.getByRole("heading", { name: "Where permanent progress lives" })).toBeVisible();

  await page.locator("#game-guide-body").evaluate((element) => {
    element.style.scrollBehavior = "auto";
    element.scrollTop = 0;
  });
  await expect(guide.getByRole("button", { name: "First Hunt" })).toHaveAttribute("aria-current", "page");

  await page.keyboard.press("Escape");
  await expect(guide).toBeHidden();
  await expect(page.locator("#menu")).toBeVisible();
  await expect(launcher).toHaveAttribute("aria-expanded", "false");
  await expect(launcher).toBeFocused();
  expect(browserErrors).toEqual([]);
});

test("field guide closes through Back, Close, and the backdrop while restoring focus", async ({ page }) => {
  await openMainMenu(page);

  const launcher = page.locator("#game-guide-btn");
  const guide = page.locator("#game-guide");

  await launcher.click();
  await waitForGuideSettled(page);
  await page.locator("#game-guide-back-btn").click();
  await expect(guide).toBeHidden();
  await expect(launcher).toBeFocused();

  await launcher.click();
  await waitForGuideSettled(page);
  await page.locator("#game-guide-close-btn").click();
  await expect(guide).toBeHidden();
  await expect(launcher).toBeFocused();

  await launcher.click();
  await waitForGuideSettled(page);
  await guide.click({ position: { x: 3, y: 3 } });
  await expect(guide).toBeHidden();
  await expect(launcher).toBeFocused();

  await page.getByRole("button", { name: "Start Hunt" }).click();
  await expect(page.locator("#game-guide-btn")).toBeHidden();
  const state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  expect(state.mode).toBe("playing");
});

test("launcher and guide stay contained and scroll correctly on landscape phones", async ({ page }) => {
  const viewports = [
    { width: 844, height: 390 },
    { width: 667, height: 375 },
    { width: 600, height: 360 },
    { width: 520, height: 320 },
    { width: 480, height: 300 },
  ];

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await openMainMenu(page);
    await waitForLauncherSettled(page);

    const launcher = page.locator("#game-guide-btn");
    await expect(launcher).toBeVisible();
    const menuAndLauncher = await page.evaluate(() => {
      const readRect = (selector) => {
        const element = document.querySelector(selector);
        const rect = element && element.getBoundingClientRect();
        return rect
          ? { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height }
          : null;
      };
      return {
        menu: readRect("#menu"),
        launcher: readRect("#game-guide-btn"),
      };
    });
    expectInside(menuAndLauncher.launcher, viewport, `${viewport.width}x${viewport.height} guide launcher`);
    expect(menuAndLauncher.launcher.height).toBeGreaterThanOrEqual(48);
    expect(menuAndLauncher.launcher.left).toBeGreaterThanOrEqual(menuAndLauncher.menu.right + 6);
    if (viewport.width === 844) {
      fs.mkdirSync(path.resolve(__dirname, "..", "test-results"), { recursive: true });
      await page.screenshot({
        path: path.resolve(__dirname, "..", "test-results", "game-guide-launcher-mobile.png"),
      });
    }

    await launcher.click();
    await expect(page.locator("#game-guide")).toBeVisible();
    await waitForGuideSettled(page);

    const layout = await page.evaluate(() => {
      const readRect = (selector) => {
        const element = document.querySelector(selector);
        const rect = element && element.getBoundingClientRect();
        return rect
          ? { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height }
          : null;
      };
      const body = document.getElementById("game-guide-body");
      const header = document.querySelector(".game-guide__header");
      const close = document.getElementById("game-guide-close-btn");
      const back = document.getElementById("game-guide-back-btn");
      const copySelectors = [
        ".game-guide__lead",
        ".game-guide__steps p",
        ".game-guide__keys dd",
        ".game-guide__mobile-list span",
        ".game-guide__timeline p",
        ".game-guide__classes span",
        ".game-guide__progress-card p",
        ".game-guide__where dd",
        ".game-guide__aftercare p",
      ];
      return {
        panel: readRect(".game-guide__panel"),
        close: readRect("#game-guide-close-btn"),
        back: readRect("#game-guide-back-btn"),
        headerHorizontalOverflow: header.scrollWidth - header.clientWidth,
        bodyClientHeight: body.clientHeight,
        bodyScrollHeight: body.scrollHeight,
        bodyHorizontalOverflow: body.scrollWidth - body.clientWidth,
        minimumBodyCopyFontSize: Math.min(
          ...copySelectors.map((selector) => parseFloat(getComputedStyle(document.querySelector(selector)).fontSize)),
        ),
        touchAction: getComputedStyle(body).touchAction,
        closeSize: Math.min(close.getBoundingClientRect().width, close.getBoundingClientRect().height),
        backHeight: back.getBoundingClientRect().height,
        documentHorizontalOverflow: document.documentElement.scrollWidth - window.innerWidth,
        pageHorizontalOverflow: document.body.scrollWidth - window.innerWidth,
      };
    });

    expectInside(layout.panel, viewport, `${viewport.width}x${viewport.height} guide panel`);
    expectInside(layout.close, viewport, `${viewport.width}x${viewport.height} close button`);
    expectInside(layout.back, viewport, `${viewport.width}x${viewport.height} back button`);
    expect(layout.bodyScrollHeight).toBeGreaterThan(layout.bodyClientHeight);
    expect(layout.headerHorizontalOverflow).toBeLessThanOrEqual(1);
    expect(layout.bodyHorizontalOverflow).toBeLessThanOrEqual(1);
    expect(layout.minimumBodyCopyFontSize).toBeGreaterThanOrEqual(11);
    expect(layout.touchAction).toContain("pan-y");
    expect(layout.closeSize).toBeGreaterThanOrEqual(42);
    expect(layout.backHeight).toBeGreaterThanOrEqual(42);
    expect(layout.documentHorizontalOverflow).toBeLessThanOrEqual(1);
    expect(layout.pageHorizontalOverflow).toBeLessThanOrEqual(1);

    if (viewport.width === 844) {
      fs.mkdirSync(path.resolve(__dirname, "..", "test-results"), { recursive: true });
      await page.screenshot({
        path: path.resolve(__dirname, "..", "test-results", "game-guide-mobile-top.png"),
      });
    }
    if (viewport.width === 600) {
      await page.screenshot({
        path: path.resolve(__dirname, "..", "test-results", "game-guide-mobile-narrow.png"),
      });
    }

    await page.locator("#game-guide-body").evaluate((element) => {
      element.style.scrollBehavior = "auto";
      element.scrollTop = element.scrollHeight;
    });
    const scrolled = await page.locator("#game-guide-body").evaluate((element) => ({
      scrollTop: element.scrollTop,
      maxScroll: element.scrollHeight - element.clientHeight,
    }));
    expect(scrolled.scrollTop).toBeGreaterThanOrEqual(scrolled.maxScroll - 2);
    await expect(page.getByRole("heading", { name: "Where permanent progress lives" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Progress" })).toHaveAttribute("aria-current", "page");

    if (viewport.width === 844) {
      await page.screenshot({
        path: path.resolve(__dirname, "..", "test-results", "game-guide-mobile-progress.png"),
      });
    }

    await page.locator("#game-guide-back-btn").click();
    await expect(page.locator("#game-guide")).toBeHidden();
  }
});
