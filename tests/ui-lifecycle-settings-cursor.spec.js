const path = require("node:path");
const { expect, test } = require("@playwright/test");

function fileUrl(relativePath) {
  const absolute = path.resolve(__dirname, "..", relativePath).replace(/\\/g, "/");
  return `file:///${absolute}`;
}

function installLifecycleBindingMock(options = {}) {
  const listeners = Object.create(null);
  const calls = { addListener: [], removeListener: [], getState: 0 };
  const pendingGetStateResolvers = [];
  const mock = {
    failListenerOnce: String(options.failListenerOnce || ""),
    failListenerRemaining: Math.max(
      0,
      Math.floor(Number(options.failListenerCount) || (options.failListenerOnce ? 1 : 0))
    ),
    addListener(eventName, callback) {
      calls.addListener.push(eventName);
      if (mock.failListenerOnce === eventName && mock.failListenerRemaining > 0) {
        mock.failListenerRemaining -= 1;
        if (!mock.failListenerRemaining) mock.failListenerOnce = "";
        return Promise.reject(new Error(`Synthetic ${eventName} listener failure`));
      }
      (listeners[eventName] || (listeners[eventName] = [])).push(callback);
      let removed = false;
      return Promise.resolve({
        remove() {
          if (removed) return Promise.resolve();
          removed = true;
          calls.removeListener.push(eventName);
          const eventListeners = listeners[eventName] || [];
          const index = eventListeners.indexOf(callback);
          if (index !== -1) eventListeners.splice(index, 1);
          return Promise.resolve();
        },
      });
    },
    emit(eventName) {
      (listeners[eventName] || []).slice().forEach((callback) => callback());
    },
    getState() {
      calls.getState += 1;
      if (options.deferGetState) {
        return new Promise((resolve) => pendingGetStateResolvers.push(resolve));
      }
      return Promise.resolve({ isActive: true });
    },
    resolveGetState(appState = { isActive: true }) {
      pendingGetStateResolvers.splice(0).forEach((resolve) => resolve(appState));
    },
    listenerCount(eventName) {
      return (listeners[eventName] || []).length;
    },
  };
  window.__lifecycleBindingMock = { calls, mock };
  window.Capacitor = window.Capacitor || {};
  window.Capacitor.Plugins = window.Capacitor.Plugins || {};
  window.Capacitor.Plugins.App = mock;
}

async function openMainMenu(page, viewport = { width: 1280, height: 720 }) {
  await page.setViewportSize(viewport);
  await page.goto(`${fileUrl("index.html")}?mapSeed=7319`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForFunction(() => Boolean(window.__dustAndDeadTest));
  const intro = page.locator("#intro-screen");
  if (await intro.isVisible().catch(() => false)) {
    await page.keyboard.press("KeyM");
    await expect(intro).toBeHidden();
  }
}

test("main-menu gear opens the shared settings view without starting or pausing a hunt", async ({ page }) => {
  await openMainMenu(page);

  const settingsButton = page.locator("#menu-settings-btn");
  const wallet = page.locator("#progression-wallet");
  await expect(settingsButton).toBeVisible();
  await expect(settingsButton).toHaveAttribute("aria-expanded", "false");
  await expect(wallet).toBeVisible();
  await expect(page.locator("#wardrobe-btn .menu-wardrobe-btn__cabinet")).toHaveCount(1);
  await expect(page.locator("#wardrobe-btn .menu-wardrobe-btn__doors")).toHaveCount(1);
  await expect(page.locator("#wardrobe-btn .menu-wardrobe-btn__hanger")).toHaveCount(0);

  const desktopPlacement = await page.evaluate(() => {
    const button = document.getElementById("menu-settings-btn").getBoundingClientRect();
    const walletRect = document.getElementById("progression-wallet").getBoundingClientRect();
    return {
      button: { left: button.left, top: button.top, right: button.right, bottom: button.bottom },
      wallet: { left: walletRect.left, top: walletRect.top, right: walletRect.right, bottom: walletRect.bottom },
      width: innerWidth,
    };
  });
  expect(desktopPlacement.button.right).toBeLessThanOrEqual(desktopPlacement.width);
  expect(desktopPlacement.wallet.right).toBeLessThan(desktopPlacement.button.left);
  expect(
    Math.abs(
      (desktopPlacement.button.top + desktopPlacement.button.bottom) / 2 -
        (desktopPlacement.wallet.top + desktopPlacement.wallet.bottom) / 2
    )
  ).toBeLessThanOrEqual(1);

  await settingsButton.click();
  await expect(page.locator("#pause-menu")).toBeVisible();
  await expect(page.locator("#pause-settings-panel")).toHaveClass(/is-visible/);
  await expect(page.locator("#pause-main-panel")).not.toHaveClass(/is-visible/);
  // The editor only moves the on-screen stick and fire button, so a desktop
  // pointer build has no use for it.
  await expect(page.locator("#control-layout-btn")).toBeHidden();
  await expect(page.locator(".pause-menu__panel")).toHaveAttribute(
    "aria-labelledby",
    "pause-settings-title"
  );
  await expect(page.locator("#pause-close-btn")).toBeFocused();

  const menuState = await page.evaluate(() => ({
    game: JSON.parse(window.render_game_to_text()),
    lifecycle: window.__dustAndDeadTest.getApplicationLifecycleDiagnostics(),
    rootClass: document.getElementById("game-root").className,
  }));
  expect(menuState.game.mode).toBe("menu");
  expect(menuState.game.paused).toBe(false);
  expect(menuState.lifecycle.menuSettingsOpen).toBe(true);
  expect(menuState.rootClass).toContain("is-menu-settings-open");

  await page.locator("#music-volume").fill("73");
  await page.locator("#sfx-volume").fill("64");
  const volume = await page.evaluate(() => window.__dustAndDeadTest.getAudioDiagnostics());
  expect(volume.musicVolume).toBeCloseTo(0.73, 3);
  expect(volume.sfxVolume).toBeCloseTo(0.64, 3);

  await page.keyboard.press("Escape");
  await expect(page.locator("#pause-menu")).toBeHidden();
  await expect(settingsButton).toBeVisible();
  await expect(settingsButton).toBeFocused();
  await expect(settingsButton).toHaveAttribute("aria-expanded", "false");

  await settingsButton.click();
  await page.locator("#pause-settings-back-btn").click();
  await expect(page.locator("#pause-menu")).toBeHidden();
  await expect(settingsButton).toBeFocused();
});

test("settings gear and wallet remain separate in compact APK landscape", async ({ page }) => {
  const viewports = [
    { width: 844, height: 390 },
    { width: 520, height: 320 },
  ];
  await openMainMenu(page, viewports[0]);

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.waitForFunction(() => {
      const elements = [
        document.getElementById("menu-settings-btn"),
        document.getElementById("progression-wallet"),
        document.querySelector(".language-switcher"),
        document.getElementById("game-guide-btn"),
      ];
      return elements.every(
        (element) =>
          element &&
          element.getAnimations().every((animation) => animation.playState === "finished")
      );
    });
    const placement = await page.evaluate(() => {
      const button = document.getElementById("menu-settings-btn").getBoundingClientRect();
      const wallet = document.getElementById("progression-wallet").getBoundingClientRect();
      const menu = document.getElementById("menu").getBoundingClientRect();
      const language = document.querySelector(".language-switcher").getBoundingClientRect();
      const guide = document.getElementById("game-guide-btn").getBoundingClientRect();
      return {
        button: { left: button.left, top: button.top, right: button.right, bottom: button.bottom },
        wallet: { left: wallet.left, top: wallet.top, right: wallet.right, bottom: wallet.bottom },
        menu: { left: menu.left, top: menu.top, right: menu.right, bottom: menu.bottom },
        language: {
          left: language.left,
          top: language.top,
          right: language.right,
          bottom: language.bottom,
        },
        guide: { left: guide.left, top: guide.top, right: guide.right, bottom: guide.bottom },
        width: innerWidth,
        height: innerHeight,
      };
    });
    expect(placement.button.left).toBeGreaterThanOrEqual(0);
    expect(placement.button.top).toBeGreaterThanOrEqual(0);
    expect(placement.button.right).toBeLessThanOrEqual(placement.width);
    expect(placement.button.bottom).toBeLessThanOrEqual(placement.height);
    expect(placement.wallet.left).toBeGreaterThanOrEqual(0);
    expect(placement.wallet.right).toBeLessThan(placement.button.left);
    if (viewport.width > 600) {
      expect(
        Math.abs(
          (placement.button.top + placement.button.bottom) / 2 -
            (placement.wallet.top + placement.wallet.bottom) / 2
        )
      ).toBeLessThanOrEqual(1);
    } else {
      expect(Math.abs(placement.button.top - placement.wallet.top)).toBeLessThanOrEqual(1);
    }
    expect(Math.abs(placement.language.right - placement.guide.right)).toBeLessThanOrEqual(1);
    expect(placement.language.bottom).toBeLessThanOrEqual(placement.guide.top - 6);
    expect(placement.menu.left).toBeGreaterThanOrEqual(0);
    expect(placement.menu.top).toBeGreaterThanOrEqual(0);
    expect(placement.menu.right).toBeLessThanOrEqual(placement.width);
    expect(placement.menu.bottom).toBeLessThanOrEqual(placement.height);
    expect(
      placement.menu.left < placement.language.right &&
        placement.menu.right > placement.language.left &&
        placement.menu.top < placement.language.bottom &&
        placement.menu.bottom > placement.language.top
    ).toBe(false);
  }
});

test("localized language switcher stays clear of the main menu", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openMainMenu(page, { width: 873, height: 933 });

  for (const locale of ["ru", "hi"]) {
    for (const viewport of [
      { width: 873, height: 933 },
      { width: 1280, height: 720 },
      { width: 960, height: 540 },
    ]) {
      await page.setViewportSize(viewport);
      await page.evaluate((requestedLocale) => {
        window.DustAndDeadI18n.setLocale(requestedLocale, { persist: false });
      }, locale);
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));

      const placement = await page.evaluate(() => {
        const readRect = (element) => {
          const rect = element.getBoundingClientRect();
          return {
            left: rect.left,
            top: rect.top,
            right: rect.right,
            bottom: rect.bottom,
            width: rect.width,
            height: rect.height,
          };
        };
        const menu = readRect(document.getElementById("menu"));
        const language = readRect(document.querySelector(".language-switcher"));
        return {
          menu,
          language,
          viewport: { width: window.innerWidth, height: window.innerHeight },
          overlaps:
            menu.left < language.right &&
            menu.right > language.left &&
            menu.top < language.bottom &&
            menu.bottom > language.top,
        };
      });

      expect(
        placement.overlaps,
        `${locale} menu/language overlap at ${viewport.width}x${viewport.height}: ${JSON.stringify(placement)}`
      ).toBe(false);
      expect(placement.menu.left).toBeGreaterThanOrEqual(0);
      expect(placement.menu.top).toBeGreaterThanOrEqual(0);
      expect(placement.menu.right).toBeLessThanOrEqual(placement.viewport.width);
      expect(placement.menu.bottom).toBeLessThanOrEqual(placement.viewport.height);
      expect(placement.language.left).toBeGreaterThanOrEqual(0);
      expect(placement.language.top).toBeGreaterThanOrEqual(0);
      expect(placement.language.right).toBeLessThanOrEqual(placement.viewport.width);
      expect(placement.language.bottom).toBeLessThanOrEqual(placement.viewport.height);
    }
  }
});

test("the frontier pointer becomes a reticle only during unobstructed gameplay", async ({ page }) => {
  await openMainMenu(page);

  const menuCursor = await page.evaluate(() => {
    const root = document.getElementById("game-root");
    return {
      root: getComputedStyle(root).cursor,
      button: getComputedStyle(document.getElementById("start-btn")).cursor,
    };
  });
  expect(menuCursor.root).toContain("frontier-pointer");
  expect(menuCursor.button).toContain("frontier-pointer");

  await page.locator("#start-btn").click();
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).mode === "playing");
  const combatCursor = await page.evaluate(() => {
    const root = document.getElementById("game-root");
    const canvas = Array.from(root.children).find((element) => element.tagName === "CANVAS");
    return {
      root: getComputedStyle(root).cursor,
      canvas: canvas ? getComputedStyle(canvas).cursor : "",
    };
  });
  expect(combatCursor.root).toContain("frontier-crosshair");
  expect(combatCursor.canvas).toContain("frontier-crosshair");

  await page.locator("#pause-menu-btn").click();
  await expect(page.locator("#pause-menu")).toBeVisible();
  const pauseCursor = await page.evaluate(
    () => getComputedStyle(document.getElementById("game-root")).cursor
  );
  expect(pauseCursor).toContain("frontier-pointer");
  expect(pauseCursor).not.toContain("frontier-crosshair");

  await page.locator("#pause-continue-btn").click();
  await expect(page.locator("#pause-menu")).toBeHidden();
  const resumedCursor = await page.evaluate(
    () => getComputedStyle(document.getElementById("game-root")).cursor
  );
  expect(resumedCursor).toContain("frontier-crosshair");
});

test("lifecycle listener binding rolls back a partial rejection and retries single-flight", async ({ page }) => {
  await page.addInitScript(installLifecycleBindingMock, {
    failListenerOnce: "resume",
    failListenerCount: 100,
  });
  await openMainMenu(page);

  await expect.poll(() => page.evaluate(() => ({
    binding: window.__dustAndDeadTest.getApplicationLifecycleDiagnostics(),
    addListener: window.__lifecycleBindingMock.calls.addListener.slice(),
    removeListener: window.__lifecycleBindingMock.calls.removeListener.slice(),
    activeListeners: ["pause", "resume"].map((eventName) => (
      window.__lifecycleBindingMock.mock.listenerCount(eventName)
    )),
  }))).toMatchObject({
    binding: { pluginBound: false, pluginBinding: false, pluginListenerHandleCount: 0 },
    activeListeners: [0, 0],
  });

  const retry = await page.evaluate(async () => {
    const baseline = {
      addListener: window.__lifecycleBindingMock.calls.addListener.slice(),
      removeListener: window.__lifecycleBindingMock.calls.removeListener.slice(),
    };
    window.__lifecycleBindingMock.mock.failListenerOnce = "";
    window.__lifecycleBindingMock.mock.failListenerRemaining = 0;
    const first = window.__dustAndDeadTest.bindApplicationLifecycleForTest();
    const second = window.__dustAndDeadTest.bindApplicationLifecycleForTest();
    const singleFlight = first === second;
    const results = await Promise.all([first, second]);
    return {
      singleFlight,
      results,
      baseline,
      binding: window.__dustAndDeadTest.getApplicationLifecycleDiagnostics(),
      addListener: window.__lifecycleBindingMock.calls.addListener.slice(),
      removeListener: window.__lifecycleBindingMock.calls.removeListener.slice(),
      getState: window.__lifecycleBindingMock.calls.getState,
      activeListeners: ["pause", "resume"].map((eventName) => (
        window.__lifecycleBindingMock.mock.listenerCount(eventName)
      )),
    };
  });

  expect(retry).toMatchObject({
    singleFlight: true,
    results: [true, true],
    binding: { pluginBound: true, pluginBinding: false, pluginListenerHandleCount: 2 },
    getState: 1,
    activeListeners: [1, 1],
  });
  expect(retry.baseline.addListener.length).toBeGreaterThanOrEqual(2);
  expect(retry.baseline.addListener.length % 2).toBe(0);
  expect(retry.baseline.addListener.every((eventName, index) => (
    eventName === (index % 2 ? "resume" : "pause")
  ))).toBe(true);
  expect(retry.baseline.removeListener).toEqual(
    new Array(retry.baseline.addListener.length / 2).fill("pause")
  );
  expect(retry.addListener).toEqual(retry.baseline.addListener.concat(["pause", "resume"]));
  expect(retry.removeListener).toEqual(retry.baseline.removeListener);
});

test("a stale lifecycle getState cannot override a newer resume signal", async ({ page }) => {
  await page.addInitScript(installLifecycleBindingMock, { deferGetState: true });
  await openMainMenu(page);

  await expect.poll(() => page.evaluate(() => ({
    binding: window.__dustAndDeadTest.getApplicationLifecycleDiagnostics(),
    getState: window.__lifecycleBindingMock.calls.getState,
    activeListeners: ["pause", "resume"].map((eventName) => (
      window.__lifecycleBindingMock.mock.listenerCount(eventName)
    )),
  }))).toMatchObject({
    binding: { pluginBound: true, pluginBinding: false, pluginListenerHandleCount: 2 },
    getState: 1,
    activeListeners: [1, 1],
  });

  await page.evaluate(async () => {
    const mock = window.__lifecycleBindingMock.mock;
    mock.emit("resume");
    mock.resolveGetState({ isActive: false });
    await Promise.resolve();
    await Promise.resolve();
  });

  const result = await page.evaluate(() => ({
    lifecycle: window.__dustAndDeadTest.getApplicationLifecycleDiagnostics(),
    rootClass: document.getElementById("game-root").className,
  }));
  expect(result.lifecycle).toMatchObject({ suspended: false, frameScheduled: true });
  expect(result.rootClass).not.toContain("is-app-suspended");
});

test("a foreground lifecycle event retries a transient plugin listener failure", async ({ page }) => {
  await page.addInitScript(installLifecycleBindingMock, {
    failListenerOnce: "resume",
    failListenerCount: 100,
  });
  await openMainMenu(page);
  await expect.poll(() => page.evaluate(() => (
    window.__dustAndDeadTest.getApplicationLifecycleDiagnostics()
  ))).toMatchObject({
    pluginBound: false,
    pluginBinding: false,
    pluginListenerHandleCount: 0,
  });

  const baseline = await page.evaluate(() => {
    window.__lifecycleBindingMock.mock.failListenerOnce = "";
    window.__lifecycleBindingMock.mock.failListenerRemaining = 0;
    return {
      addListener: window.__lifecycleBindingMock.calls.addListener.length,
      removeListener: window.__lifecycleBindingMock.calls.removeListener.length,
    };
  });
  await page.evaluate(() => window.dispatchEvent(new Event("dustanddead:app-resume")));

  await expect.poll(() => page.evaluate(() => ({
    binding: window.__dustAndDeadTest.getApplicationLifecycleDiagnostics(),
    addListener: window.__lifecycleBindingMock.calls.addListener.length,
    removeListener: window.__lifecycleBindingMock.calls.removeListener.length,
    getState: window.__lifecycleBindingMock.calls.getState,
    activeListeners: ["pause", "resume"].map((eventName) => (
      window.__lifecycleBindingMock.mock.listenerCount(eventName)
    )),
  }))).toEqual({
    binding: expect.objectContaining({
      pluginBound: true,
      pluginBinding: false,
      pluginListenerHandleCount: 2,
    }),
    addListener: baseline.addListener + 2,
    removeListener: baseline.removeListener,
    getState: 1,
    activeListeners: [1, 1],
  });
});

test("background lifecycle suspends audio and frames, then returns a solo hunt to pause", async ({ page }) => {
  await openMainMenu(page);
  await page.waitForFunction(
    () => window.__dustAndDeadTest.getAudioDiagnostics().contextState === "running"
  );

  await page.evaluate(() => window.__dustAndDeadTest.setApplicationSuspendedForTest(true));
  await page.waitForFunction(() => {
    const audio = window.__dustAndDeadTest.getAudioDiagnostics();
    const lifecycle = window.__dustAndDeadTest.getApplicationLifecycleDiagnostics();
    return audio.contextState === "suspended" &&
      audio.schedulerActive === false &&
      lifecycle.suspended &&
      lifecycle.frameScheduled === false;
  });

  await page.evaluate(() => window.__dustAndDeadTest.setApplicationSuspendedForTest(false));
  await page.waitForFunction(() => {
    const audio = window.__dustAndDeadTest.getAudioDiagnostics();
    const lifecycle = window.__dustAndDeadTest.getApplicationLifecycleDiagnostics();
    return audio.contextState === "running" &&
      audio.schedulerActive &&
      !lifecycle.suspended &&
      lifecycle.frameScheduled;
  });

  await page.locator("#start-btn").click();
  await page.waitForFunction(() => {
    const audio = window.__dustAndDeadTest.getAudioDiagnostics();
    return JSON.parse(window.render_game_to_text()).mode === "playing" &&
      audio.contextState === "running" &&
      audio.gameSchedulerActive;
  });
  const stateAtSuspend = await page.evaluate(() => {
    window.__dustAndDeadTest.setApplicationSuspendedForTest(true);
    return JSON.parse(window.render_game_to_text());
  });
  await page.waitForFunction(
    () => window.__dustAndDeadTest.getAudioDiagnostics().contextState === "suspended"
  );
  await expect(page.locator("#pause-menu")).toBeVisible();
  await page.waitForTimeout(220);
  const whileSuspended = await page.evaluate(() => ({
    game: JSON.parse(window.render_game_to_text()),
    audio: window.__dustAndDeadTest.getAudioDiagnostics(),
    lifecycle: window.__dustAndDeadTest.getApplicationLifecycleDiagnostics(),
  }));
  expect(whileSuspended.game.paused).toBe(true);
  expect(
    Math.abs(whileSuspended.game.waveElapsed - stateAtSuspend.waveElapsed)
  ).toBeLessThan(0.01);
  expect(whileSuspended.audio.gameSchedulerActive).toBe(false);
  expect(whileSuspended.lifecycle.frameScheduled).toBe(false);

  await page.evaluate(() => window.__dustAndDeadTest.setApplicationSuspendedForTest(false));
  await page.waitForFunction(
    () => window.__dustAndDeadTest.getAudioDiagnostics().contextState === "running"
  );
  const afterResume = await page.evaluate(() => ({
    game: JSON.parse(window.render_game_to_text()),
    audio: window.__dustAndDeadTest.getAudioDiagnostics(),
    lifecycle: window.__dustAndDeadTest.getApplicationLifecycleDiagnostics(),
  }));
  expect(afterResume.game.paused).toBe(true);
  expect(afterResume.audio.gameSchedulerActive).toBe(true);
  expect(afterResume.lifecycle.suspended).toBe(false);
  await expect(page.locator("#pause-menu")).toBeVisible();
});

test("graphics and accessibility settings switch from the main menu and persist", async ({ page }) => {
  await openMainMenu(page);

  await page.locator("#menu-settings-btn").click();
  await expect(page.locator("#pause-settings-panel")).toHaveClass(/is-visible/);
  await expect(page.locator("#graphics-scale-auto-btn")).toHaveClass(/is-active/);
  await expect(page.locator("#graphics-shadows-btn")).toHaveClass(/is-active/);
  await expect(page.locator("#graphics-shadows-btn")).toHaveText("On");
  await expect(page.locator("#graphics-camera-shake-btn")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#graphics-camera-shake-btn")).toHaveText("On");
  await expect(page.locator("#graphics-intense-flashes-btn")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#graphics-intense-flashes-btn")).toHaveText("On");

  const initial = await page.evaluate(() => JSON.parse(window.render_game_to_text()).render);
  expect(initial.graphicsSettings).toEqual({
    renderScale: "auto",
    shadows: true,
    cameraShake: true,
    intenseFlashes: true,
  });

  const flashBaseline = await page.evaluate(() => {
    const diagnostics = window.__dustAndDeadTest.setLightFlashStressCount(1);
    return diagnostics.slots.find((slot) => slot.activationId)?.intensity || 0;
  });
  expect(flashBaseline).toBeGreaterThan(0);
  const transientBaseline = await page.evaluate(() =>
    window.__dustAndDeadTest.getTransientFlashRenderDiagnosticsForTest()
  );
  expect(transientBaseline.lightScale).toBe(1);
  expect(transientBaseline.surfaceScale).toBe(1);
  expect(transientBaseline.shockwave.renderedOpacity / transientBaseline.shockwave.baseOpacity).toBeCloseTo(1, 3);
  expect(transientBaseline.lightning.mainOpacity / 0.98).toBeCloseTo(1, 3);
  expect(transientBaseline.lightningParticle.renderedOpacity / transientBaseline.lightningParticle.baseOpacity).toBeCloseTo(1, 3);
  for (const material of Object.values(transientBaseline.materials)) {
    expect(material.ratio).toBeCloseTo(1, 3);
  }

  await page.locator("#graphics-scale-low-btn").click();
  await page.locator("#graphics-shadows-btn").click();
  await page.locator("#graphics-camera-shake-btn").click();
  await page.locator("#graphics-intense-flashes-btn").click();
  await expect(page.locator("#graphics-scale-low-btn")).toHaveClass(/is-active/);
  await expect(page.locator("#graphics-scale-auto-btn")).not.toHaveClass(/is-active/);
  await expect(page.locator("#graphics-shadows-btn")).not.toHaveClass(/is-active/);
  await expect(page.locator("#graphics-shadows-btn")).toHaveText("Off");
  await expect(page.locator("#graphics-camera-shake-btn")).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("#graphics-camera-shake-btn")).toHaveText("Off");
  await expect(page.locator("#graphics-intense-flashes-btn")).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("#graphics-intense-flashes-btn")).toHaveText("Reduced");

  const changed = await page.evaluate(() => ({
    render: JSON.parse(window.render_game_to_text()).render,
    stored: JSON.parse(window.localStorage.getItem("dustAndDeadGraphicsSettings") || "null"),
    flash: window.__dustAndDeadTest.getLightFlashRenderBudgetDiagnostics(),
    transient: window.__dustAndDeadTest.getTransientFlashRenderDiagnosticsForTest(),
  }));
  expect(changed.render.graphicsSettings).toEqual({
    renderScale: "low",
    shadows: false,
    cameraShake: false,
    intenseFlashes: false,
  });
  expect(changed.render.pixelRatio).toBeCloseTo(0.75, 3);
  expect(changed.stored).toEqual({
    renderScale: "low",
    shadows: false,
    cameraShake: false,
    intenseFlashes: false,
  });
  expect(changed.flash.logicalActive).toBe(1);
  const reducedFlash = changed.flash.slots.find((slot) => slot.activationId)?.intensity || 0;
  expect(reducedFlash / flashBaseline).toBeCloseTo(0.18, 2);
  expect(changed.transient.lightScale).toBeCloseTo(0.18, 3);
  expect(changed.transient.surfaceScale).toBeCloseTo(0.45, 3);
  expect(changed.transient.shockwave.renderedOpacity / changed.transient.shockwave.baseOpacity).toBeCloseTo(0.45, 3);
  expect(changed.transient.lightning.mainOpacity / 0.98).toBeCloseTo(0.45, 3);
  expect(changed.transient.lightningParticle.renderedOpacity / changed.transient.lightningParticle.baseOpacity).toBeCloseTo(0.45, 3);
  for (const material of Object.values(changed.transient.materials)) {
    expect(material.ratio).toBeCloseTo(0.45, 3);
  }

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Boolean(window.__dustAndDeadTest));
  const persisted = await page.evaluate(() => JSON.parse(window.render_game_to_text()).render);
  expect(persisted.graphicsSettings).toEqual({
    renderScale: "low",
    shadows: false,
    cameraShake: false,
    intenseFlashes: false,
  });
  expect(persisted.pixelRatio).toBeCloseTo(0.75, 3);
});

test("control layout editor opens from the main-menu settings and returns to them", async ({ page }) => {
  // Touch-sized viewport: the entry point is offered only where the on-screen
  // controls it edits actually exist.
  await openMainMenu(page, { width: 740, height: 380 });

  await page.locator("#menu-settings-btn").click();
  await expect(page.locator("#pause-settings-panel")).toHaveClass(/is-visible/);
  const layoutButton = page.locator("#control-layout-btn");
  await expect(layoutButton).toBeVisible();

  await layoutButton.click();
  await expect(page.locator("#control-layout-editor")).toBeVisible();
  await expect(page.locator("#pause-menu")).toBeHidden();
  const editingState = await page.evaluate(() => ({
    game: JSON.parse(window.render_game_to_text()),
    rootClass: document.getElementById("game-root").className,
  }));
  expect(editingState.game.mode).toBe("menu");
  expect(editingState.game.paused).toBe(false);
  expect(editingState.rootClass).toContain("is-layout-editing");

  await page.locator("#control-layout-apply-btn").click();
  await expect(page.locator("#control-layout-editor")).toBeHidden();
  await expect(page.locator("#pause-menu")).toBeVisible();
  await expect(page.locator("#pause-settings-panel")).toHaveClass(/is-visible/);
  const settingsState = await page.evaluate(() => window.__dustAndDeadTest.getApplicationLifecycleDiagnostics());
  expect(settingsState.menuSettingsOpen).toBe(true);
});
