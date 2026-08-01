const path = require("node:path");
const { expect, test } = require("@playwright/test");

const PROGRESSION_STORAGE_KEY = "dustAndDeadMetaProgression.v1";
const STORAGE_SENTINEL_KEY = "dustAndDeadProgression.testSentinel";

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

async function openProgressionMenu(page, options = {}) {
  await page.goto(`${fileUrl("index.html")}?mapSeed=7301`);
  await dismissIntro(page);
  await page.waitForFunction(() => Boolean(
    window.DustAndDeadProgression &&
    window.__dustAndDeadTest &&
    window.__dustMultiplayerTest
  ));
  if (options.reset !== false) {
    await page.evaluate(() => window.__dustAndDeadTest.resetMetaProgression());
  }
}

function expectRectInsideViewport(rect, viewport, label) {
  expect(rect, `${label} must have measurable bounds`).not.toBeNull();
  expect(rect.left, `${label} left edge`).toBeGreaterThanOrEqual(-1);
  expect(rect.top, `${label} top edge`).toBeGreaterThanOrEqual(-1);
  expect(rect.right, `${label} right edge`).toBeLessThanOrEqual(viewport.width + 1);
  expect(rect.bottom, `${label} bottom edge`).toBeLessThanOrEqual(viewport.height + 1);
}

test("wallet and contracts menu expose all 72 contracts and working filters", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openProgressionMenu(page);

  const wallet = page.locator("#progression-wallet");
  await expect(wallet).toBeVisible();
  await expect(page.locator("#dust-balance-value")).toHaveText("0.00");
  await expect(page.locator("#contracts-completed-value")).toHaveText("0");
  await expect(page.locator("#contracts-total-value")).toHaveText("72");
  await expect(wallet.locator(".progression-wallet__icon--dust svg")).toBeVisible();
  await expect(wallet.locator(".progression-wallet__icon--seal svg")).toBeVisible();

  const currencyGlyphs = await page.evaluate(() => {
    const signature = (svg) => Array.from(svg?.children || []).map((element) => [
      element.tagName,
      element.getAttribute("d"),
      element.getAttribute("cx"),
      element.getAttribute("cy"),
      element.getAttribute("r"),
    ].join(":")).join("|");
    const toastTemplate = document.querySelector("#progression-toast-template");
    const toastContent = toastTemplate?.content;
    const toastDust = signature(toastContent?.querySelector(".progression-toast__icon-svg--dust"));
    const toastSeal = signature(toastContent?.querySelector(".progression-toast__icon-svg--contract"));
    return {
      walletDustMatches: signature(document.querySelector(".progression-wallet__icon--dust svg")) === toastDust,
      walletSealMatches: signature(document.querySelector(".progression-wallet__icon--seal svg")) === toastSeal,
      summaryDustMatches: signature(document.querySelector(".contracts-menu__summary-icon--dust svg")) === toastDust,
      summarySealMatches: signature(document.querySelector(".contracts-menu__summary-icon--mark svg")) === toastSeal,
    };
  });
  expect(currencyGlyphs).toEqual({
    walletDustMatches: true,
    walletSealMatches: true,
    summaryDustMatches: true,
    summarySealMatches: true,
  });

  const walletBox = await wallet.boundingBox();
  expectRectInsideViewport(
    walletBox && {
      left: walletBox.x,
      top: walletBox.y,
      right: walletBox.x + walletBox.width,
      bottom: walletBox.y + walletBox.height,
    },
    { width: 1440, height: 900 },
    "desktop wallet"
  );
  expect(walletBox.x).toBeGreaterThan(720);

  const catalog = await page.evaluate(() => {
    const contracts = window.DustAndDeadProgression.getContracts();
    return {
      total: contracts.length,
      uniqueIds: new Set(contracts.map((contract) => contract.id)).size,
      groups: contracts.reduce((result, contract) => {
        result[contract.group] = (result[contract.group] || 0) + 1;
        return result;
      }, {}),
    };
  });
  expect(catalog.total).toBe(72);
  expect(catalog.uniqueIds).toBe(72);

  await page.locator("#contracts-btn").click();
  const dialog = page.locator("#contracts-menu");
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveClass(/is-visible/);
  await expect(dialog).toHaveAttribute("aria-hidden", "false");
  await expect(page.locator("#contracts-list .contract-card")).toHaveCount(72);

  const renderedCatalog = await page.locator("#contracts-list .contract-card").evaluateAll((cards) =>
    cards.map((card) => ({
      id: card.getAttribute("data-contract-id"),
      group: card.getAttribute("data-contract-group"),
      title: card.querySelector("h3")?.textContent.trim() || "",
    }))
  );
  expect(new Set(renderedCatalog.map((card) => card.id)).size).toBe(72);
  expect(renderedCatalog.every((card) => card.id && card.group && card.title)).toBe(true);

  const filters = ["all", "hunting", "arsenal", "bosses", "journey", "multiplayer"];
  for (const filter of filters) {
    const button = page.locator(`[data-contract-filter="${filter}"]`);
    await button.click();
    await expect(button).toHaveAttribute("aria-pressed", "true");
    const expectedCount = filter === "all" ? 72 : catalog.groups[filter];
    const cards = page.locator("#contracts-list .contract-card");
    await expect(cards).toHaveCount(expectedCount);
    if (filter !== "all") {
      const renderedGroups = await cards.evaluateAll((entries) =>
        entries.map((entry) => entry.getAttribute("data-contract-group"))
      );
      expect(renderedGroups.every((group) => group === filter)).toBe(true);
    }
  }

  await page.locator("#contracts-back-btn").click();
  await expect(dialog).toBeHidden();
  await expect(page.locator("#menu")).toBeVisible();
  await expect(page.locator("#contracts-btn")).toBeFocused();
});

test("wallet and contracts dialog stay inside a landscape phone viewport", async ({ page }) => {
  const viewport = { width: 844, height: 390 };
  await page.setViewportSize(viewport);
  await openProgressionMenu(page);

  const walletBounds = await page.locator("#progression-wallet").evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
  });
  expectRectInsideViewport(walletBounds, viewport, "mobile wallet");

  await page.locator("#contracts-btn").click();
  await expect(page.locator("#contracts-menu")).toBeVisible();
  await expect(page.locator("#contracts-close-btn")).toBeVisible();

  const bounds = await page.evaluate(() => {
    const readRect = (selector) => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
    };
    const panel = document.querySelector(".contracts-menu__panel");
    const body = document.querySelector(".contracts-menu__body");
    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      panel: readRect(".contracts-menu__panel"),
      close: readRect("#contracts-close-btn"),
      filters: readRect(".contracts-menu__filters"),
      body: readRect(".contracts-menu__body"),
      back: readRect("#contracts-back-btn"),
      documentScrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
      panelHorizontalOverflow: panel ? panel.scrollWidth - panel.clientWidth : Infinity,
      bodyHorizontalOverflow: body ? body.scrollWidth - body.clientWidth : Infinity,
    };
  });

  expect(bounds.viewport).toEqual(viewport);
  expectRectInsideViewport(bounds.panel, viewport, "contracts panel");
  expectRectInsideViewport(bounds.close, viewport, "contracts close button");
  expectRectInsideViewport(bounds.filters, viewport, "contracts filters");
  expectRectInsideViewport(bounds.body, viewport, "contracts scroll body");
  expectRectInsideViewport(bounds.back, viewport, "contracts back button");
  expect(bounds.documentScrollWidth).toBeLessThanOrEqual(viewport.width + 1);
  expect(bounds.bodyScrollWidth).toBeLessThanOrEqual(viewport.width + 1);
  expect(bounds.panelHorizontalOverflow).toBeLessThanOrEqual(1);
  expect(bounds.bodyHorizontalOverflow).toBeLessThanOrEqual(1);
});

test("progression toast SVG icons stay clear of their copy on a landscape phone viewport", async ({ page }) => {
  const viewport = { width: 844, height: 390 };
  await page.setViewportSize(viewport);
  await openProgressionMenu(page);

  await page.evaluate(() => {
    for (let kill = 0; kill < 10; kill += 1) {
      window.DustAndDeadProgression.recordSoloKill("armoredMiner", "revolver");
    }
  });

  const dustToast = page.locator('.progression-toast[data-kind="dust"]');
  const contractToast = page.locator('.progression-toast[data-kind="contract"]');
  await expect(dustToast).toBeVisible();
  await expect(contractToast).toBeVisible();
  await page.waitForFunction(() =>
    Array.from(document.querySelectorAll(".progression-toast")).every((toast) =>
      toast.getAnimations().every((animation) => animation.playState === "finished")
    )
  );

  const layouts = await page.locator(".progression-toast").evaluateAll((toasts) =>
    toasts.map((toast) => {
      const icon = toast.querySelector(".progression-toast__icon");
      const visibleSvg = Array.from(toast.querySelectorAll(".progression-toast__icon-svg"))
        .find((svg) => getComputedStyle(svg).display !== "none");
      const copy = toast.querySelector(".progression-toast__copy");
      const toastRect = toast.getBoundingClientRect();
      const iconRect = icon?.getBoundingClientRect();
      const svgRect = visibleSvg?.getBoundingClientRect();
      const copyRect = copy?.getBoundingClientRect();
      const toastStyle = getComputedStyle(toast);
      return {
        kind: toast.getAttribute("data-kind"),
        toast: {
          left: toastRect.left,
          top: toastRect.top,
          right: toastRect.right,
          bottom: toastRect.bottom,
        },
        iconRight: iconRect?.right ?? Infinity,
        svgWidth: svgRect?.width ?? 0,
        svgHeight: svgRect?.height ?? 0,
        copyLeft: copyRect?.left ?? -Infinity,
        copyWidth: copyRect?.width ?? 0,
        backdropFilter: toastStyle.backdropFilter,
        contain: toastStyle.contain,
      };
    })
  );

  expect(new Set(layouts.map((layout) => layout.kind))).toEqual(new Set(["dust", "contract"]));
  for (const layout of layouts) {
    expectRectInsideViewport(layout.toast, viewport, `${layout.kind} toast`);
    expect(layout.copyLeft - layout.iconRight, `${layout.kind} icon/copy gap`).toBeGreaterThanOrEqual(10);
    expect(layout.svgWidth, `${layout.kind} SVG width`).toBeGreaterThanOrEqual(32);
    expect(layout.svgHeight, `${layout.kind} SVG height`).toBeGreaterThanOrEqual(32);
    expect(layout.copyWidth, `${layout.kind} copy width`).toBeGreaterThan(120);
    expect(layout.backdropFilter, `${layout.kind} must not blur the live WebGL frame`).toBe("none");
    expect(
      layout.contain === "content" || layout.contain.split(/\s+/).includes("paint"),
      `${layout.kind} repaint containment`
    ).toBe(true);
  }
});

test("ordinary kills do not invalidate the wallet DOM before a visible reward", async ({ page }) => {
  await openProgressionMenu(page);

  const result = await page.evaluate(async () => {
    const wallet = document.getElementById("progression-wallet");
    const outputs = Array.from(document.querySelectorAll("[data-progression-output]"));
    const mutations = [];
    const observer = new MutationObserver((records) => {
      records.forEach((record) => {
        mutations.push({
          type: record.type,
          targetId: record.target.id || "",
          targetKey: record.target.getAttribute?.("data-progression-output") || "",
          attributeName: record.attributeName || "",
        });
      });
    });
    outputs.forEach((output) => observer.observe(output, {
      childList: true,
      characterData: true,
      subtree: true,
    }));
    observer.observe(wallet, { attributes: true, attributeFilter: ["aria-label", "hidden"] });

    window.DustAndDeadProgression.recordSoloKill("walker", "revolver");
    await Promise.resolve();
    const ordinaryKillMutations = mutations.splice(0);

    for (let kill = 1; kill < 10; kill += 1) {
      window.DustAndDeadProgression.recordSoloKill("walker", "revolver");
    }
    await Promise.resolve();
    const rewardMutations = mutations.splice(0);
    observer.disconnect();

    return {
      ordinaryKillMutations,
      rewardMutations,
      dust: document.getElementById("dust-balance-value")?.textContent || "",
      toastKinds: Array.from(document.querySelectorAll(".progression-toast"))
        .map((toast) => toast.getAttribute("data-kind")),
    };
  });

  expect(result.ordinaryKillMutations).toEqual([]);
  expect(result.rewardMutations.length).toBeGreaterThan(0);
  expect(result.rewardMutations.every((mutation) =>
    mutation.targetKey === "dust" ||
    mutation.targetId === "progression-wallet"
  )).toBe(true);
  expect(result.dust).toBe("1.50");
  expect(result.toastKinds).toEqual(["dust"]);
});

test("solo gameplay shows Dust and contract notifications without covering fire controls", async ({ page }) => {
  const viewport = { width: 720, height: 390 };
  await page.setViewportSize(viewport);
  await openProgressionMenu(page);
  await page.locator("#start-btn").click();
  await expect.poll(() => page.evaluate(() => JSON.parse(window.render_game_to_text()).mode)).toBe("playing");

  await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    game.setAutomaticFrameLoopModeForTest("paused");
    game.resetMetaProgression();
    game.clearEnemies();
    game.startWaveNow(1);
    for (let kill = 0; kill < 10; kill += 1) {
      const snapshot = game.defeatZombieForProgressionTest("armoredMiner", "revolver");
      if (!snapshot) throw new Error(`canonical Armored Miner kill ${kill + 1} was rejected`);
    }
  });

  const dustToast = page.locator('.progression-toast[data-kind="dust"]');
  const contractToast = page.locator('.progression-toast[data-kind="contract"]');
  await expect(dustToast).toBeVisible();
  await expect(dustToast.locator("[data-progression-toast-title]")).toHaveText("Dust secured");
  await expect(dustToast.locator("[data-progression-toast-message]")).toHaveText("+1.50 Dust");
  await expect(contractToast).toBeVisible();
  await expect(contractToast.locator("[data-progression-toast-title]")).toHaveText("Contract sealed");

  const layout = await page.evaluate(() => {
    const readRect = (element) => {
      const rect = element.getBoundingClientRect();
      return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
    };
    return {
      stack: readRect(document.getElementById("progression-toast-stack")),
      fire: readRect(document.getElementById("mobile-fire")),
    };
  });
  expectRectInsideViewport(layout.stack, viewport, "in-game progression toast stack");
  expectRectInsideViewport(layout.fire, viewport, "mobile fire control");
  expect(layout.stack.bottom, "toasts must stay above the fire control").toBeLessThanOrEqual(layout.fire.top + 1);
  expect(layout.stack.left, "notifications should remain on the right side").toBeGreaterThan(viewport.width / 2);
});

test("corrupt progression storage recovers without touching unrelated keys", async ({ page }) => {
  await page.addInitScript(({ storageKey, sentinelKey }) => {
    window.localStorage.setItem(storageKey, "{not-valid-json");
    window.localStorage.setItem(sentinelKey, "leave-me-alone");
  }, {
    storageKey: PROGRESSION_STORAGE_KEY,
    sentinelKey: STORAGE_SENTINEL_KEY,
  });

  await openProgressionMenu(page, { reset: false });

  const recovered = await page.evaluate(({ storageKey, sentinelKey }) => {
    const snapshot = window.DustAndDeadProgression.getSnapshot();
    const stored = JSON.parse(window.localStorage.getItem(storageKey));
    return {
      snapshot,
      stored,
      sentinel: window.localStorage.getItem(sentinelKey),
    };
  }, {
    storageKey: PROGRESSION_STORAGE_KEY,
    sentinelKey: STORAGE_SENTINEL_KEY,
  });

  expect(recovered.snapshot).toMatchObject({
    version: 1,
    dustCents: 0,
    zombieKillRemainder: 0,
    completedContracts: 0,
    totalContracts: 72,
  });
  expect(recovered.stored).toMatchObject({
    version: 1,
    dustCents: 0,
    zombieKillRemainder: 0,
  });
  expect(recovered.sentinel).toBe("leave-me-alone");
});

test("Dust starts at the tenth zombie and Armored Miner mastery seals at exactly 50", async ({ page }) => {
  await openProgressionMenu(page);

  const result = await page.evaluate(() => {
    const api = window.DustAndDeadProgression;
    api.resetForTest();

    for (let index = 0; index < 9; index += 1) {
      api.recordSoloKill("walker", "revolver");
    }
    const afterNine = api.getSnapshot();

    const tenth = api.recordSoloKill("armoredMiner", "rifle");
    const afterTen = api.getSnapshot();

    for (let index = 0; index < 48; index += 1) {
      api.recordSoloKill("armoredMiner", "rifle");
    }
    const minerAt49 = api.getContracts().find((contract) => contract.id === "hunt.armoredMiner.2");

    api.recordSoloKill("armoredMiner", "rifle");
    const minerAt50 = api.getContracts().find((contract) => contract.id === "hunt.armoredMiner.2");
    const finalSnapshot = api.getSnapshot();

    return { afterNine, tenth, afterTen, minerAt49, minerAt50, finalSnapshot };
  });

  expect(result.afterNine.dustCents).toBe(0);
  expect(result.afterNine.zombieKillRemainder).toBe(9);
  expect(result.afterNine.stats.killsTotal).toBe(9);

  expect(result.tenth).toMatchObject({ accepted: true, dustAddedCents: 150 });
  expect(result.afterTen.dustCents).toBe(150);
  expect(result.afterTen.zombieKillRemainder).toBe(0);
  expect(result.afterTen.stats.killsByType.armoredMiner).toBe(1);

  expect(result.minerAt49).toMatchObject({
    target: 50,
    current: 49,
    progress: 49,
    completed: false,
  });
  expect(result.minerAt50).toMatchObject({
    target: 50,
    current: 50,
    progress: 50,
    completed: true,
  });
  expect(result.minerAt50.completedAt).toEqual(expect.any(String));
  expect(result.finalSnapshot.stats.killsByType.armoredMiner).toBe(50);
});

test("canonical solo gameplay hooks award zombie and wave progression exactly once", async ({ page }) => {
  await openProgressionMenu(page);
  await page.locator("#start-btn").click();
  await page.waitForFunction(() => {
    if (typeof window.render_game_to_text !== "function") return false;
    return JSON.parse(window.render_game_to_text()).mode === "playing";
  });

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;

    game.resetMetaProgression();
    game.clearEnemies();
    const startedWave = game.startWaveNow(1);
    let lastKillSnapshot = null;
    for (let index = 0; index < 10; index += 1) {
      lastKillSnapshot = game.defeatZombieForProgressionTest("walker", "revolver");
      if (!lastKillSnapshot) throw new Error(`canonical zombie kill ${index + 1} was rejected`);
    }
    const afterKills = game.getMetaProgression();

    game.resetMetaProgression();
    const completedWave = game.completeCurrentWaveForProgressionTest(10);
    const renderedAfterWave = JSON.parse(window.render_game_to_text());

    return {
      startedWave,
      lastKillSnapshot,
      afterKills,
      completedWave,
      renderedAfterWave: {
        mode: renderedAfterWave.mode,
        wave: renderedAfterWave.wave,
      },
    };
  });

  expect(result.startedWave.wave).toBe(1);
  expect(result.lastKillSnapshot).toMatchObject({
    dustCents: 150,
    zombieKillRemainder: 0,
  });
  expect(result.afterKills).toMatchObject({
    dustCents: 150,
    zombieKillRemainder: 0,
  });
  expect(result.afterKills.stats).toMatchObject({
    killsTotal: 10,
    killsByType: { walker: 10 },
    killsByWeapon: { revolver: 10 },
  });

  expect(result.completedWave).toMatchObject({
    completedWave: 10,
    nextWave: 11,
    snapshot: {
      dustCents: 1000,
      stats: {
        killsTotal: 0,
        wavesCompleted: 1,
        highestWave: 10,
      },
    },
  });
  expect(result.renderedAfterWave).toEqual({ mode: "playing", wave: 11 });
});

test("a boss grants 50 Dust and completing wave 10 grants 10 Dust", async ({ page }) => {
  await openProgressionMenu(page);

  const result = await page.evaluate(() => {
    const api = window.DustAndDeadProgression;

    api.resetForTest();
    const bossReceipt = api.recordSoloBoss("oilBaron");
    const afterBoss = api.getSnapshot();
    const oilContract = api.getContracts().find((contract) => contract.id === "boss.oilBaron.1");

    api.resetForTest();
    const waveReceipt = api.recordSoloWave(10);
    const afterWave = api.getSnapshot();

    return { bossReceipt, afterBoss, oilContract, waveReceipt, afterWave };
  });

  expect(result.bossReceipt).toMatchObject({ accepted: true, dustAddedCents: 5000 });
  expect(result.afterBoss.dustCents).toBe(5000);
  expect(result.afterBoss.formattedDust).toBe("50.00");
  expect(result.afterBoss.stats.bossesByType.oilBaron).toBe(1);
  expect(result.oilContract).toMatchObject({ target: 1, current: 1, completed: true });

  expect(result.waveReceipt).toMatchObject({ accepted: true, dustAddedCents: 1000 });
  expect(result.afterWave.dustCents).toBe(1000);
  expect(result.afterWave.formattedDust).toBe("10.00");
  expect(result.afterWave.stats.wavesCompleted).toBe(1);
  expect(result.afterWave.stats.highestWave).toBe(10);
});

test("a solo mastery receipt is applied once", async ({ page }) => {
  await openProgressionMenu(page);

  const result = await page.evaluate(() => {
    const api = window.DustAndDeadProgression;
    api.resetForTest();
    const first = api.recordSoloMastery(
      { bigIronRuptures: 7, rifleTrapTriggers: 3 },
      "solo-run-stable-receipt"
    );
    const duplicate = api.recordSoloMastery(
      { bigIronRuptures: 70, rifleTrapTriggers: 30 },
      "solo-run-stable-receipt"
    );
    return {
      first,
      duplicate,
      snapshot: api.getSnapshot(),
    };
  });

  expect(result.first).toMatchObject({
    accepted: true,
    receiptId: "solo-run-stable-receipt",
  });
  expect(result.duplicate).toMatchObject({
    accepted: false,
    reason: "duplicate-receipt",
    dustAddedCents: 0,
  });
  expect(result.snapshot.stats.mastery.bigIronRuptures).toBe(7);
  expect(result.snapshot.stats.mastery.rifleTrapTriggers).toBe(3);
});

test("multiplayer settlement preserves weighted kill remainder and validates placement semantics", async ({ page }) => {
  await openProgressionMenu(page);

  const result = await page.evaluate(() => {
    const api = window.DustAndDeadProgression;

    api.resetForTest();
    const nineAtFourth = api.settleMultiplayerMatch({
      matchId: "weighted-remainder-fourth",
      placement: 4,
      killsByType: { walker: 9 },
    });
    const afterNine = api.getSnapshot();
    const oneAtFirst = api.settleMultiplayerMatch({
      matchId: "weighted-remainder-first",
      placement: 1,
      killsByType: { walker: 1 },
    });
    const afterTen = api.getSnapshot();

    api.resetForTest();
    const decimalPlacement = api.settleMultiplayerMatch({
      matchId: "invalid-decimal-placement",
      placement: 1.9,
      killsByType: { walker: 10 },
    });
    const booleanPlacement = api.settleMultiplayerMatch({
      matchId: "invalid-boolean-placement",
      placement: true,
      killsByType: { walker: 10 },
    });
    const afterInvalidPlacements = api.getSnapshot();

    api.resetForTest();
    const fourthPlaceWin = api.settleMultiplayerMatch({
      matchId: "fourth-place-explicit-win",
      placement: 4,
      won: true,
    });
    const afterFourthPlaceWin = api.getSnapshot();

    return {
      nineAtFourth,
      afterNine,
      oneAtFirst,
      afterTen,
      decimalPlacement,
      booleanPlacement,
      afterInvalidPlacements,
      fourthPlaceWin,
      afterFourthPlaceWin,
    };
  });

  expect(result.nineAtFourth).toMatchObject({
    accepted: true,
    placement: 4,
    multiplier: 0.9,
    dustAddedCents: 0,
  });
  expect(result.afterNine).toMatchObject({
    dustCents: 0,
    zombieKillRemainder: 9,
    zombieKillRemainderCents: 122,
    zombieKillRemainderRewardUnits: 12150,
  });
  expect(result.oneAtFirst).toMatchObject({
    accepted: true,
    placement: 1,
    multiplier: 1.5,
    dustAddedCents: 144,
  });
  expect(result.afterTen).toMatchObject({
    dustCents: 144,
    zombieKillRemainder: 0,
    zombieKillRemainderCents: 0,
    zombieKillRemainderRewardUnits: 0,
  });

  expect(result.decimalPlacement).toMatchObject({
    accepted: false,
    reason: "invalid-placement",
    dustAddedCents: 0,
  });
  expect(result.booleanPlacement).toMatchObject({
    accepted: false,
    reason: "invalid-placement",
    dustAddedCents: 0,
  });
  expect(result.afterInvalidPlacements.settledMatchIds).toEqual([]);
  expect(result.afterInvalidPlacements.stats.multiplayer.matches).toBe(0);

  expect(result.fourthPlaceWin).toMatchObject({
    accepted: true,
    placement: 4,
    multiplier: 0.9,
  });
  expect(result.afterFourthPlaceWin.stats.multiplayer).toMatchObject({
    matches: 1,
    wins: 1,
    firstPlaces: 0,
  });
});

test("multiplayer settlement applies places 1-4, rewards the loser, and rejects duplicate match ids", async ({ page }) => {
  await openProgressionMenu(page);

  const cases = await page.evaluate(() => {
    const progression = window.DustAndDeadProgression;
    const multiplayer = window.__dustMultiplayerTest;
    const ids = ["mock-player-1", "mock-player-2", "mock-player-3", "mock-player-4"];
    const names = ["Local", "Second", "Third", "Fourth"];
    const results = [];

    for (let placement = 1; placement <= 4; placement += 1) {
      progression.resetForTest();
      multiplayer.startMockHost(names);
      const started = multiplayer.getState();
      const standings = ids.filter((id) => id !== "mock-player-1");
      standings.splice(placement - 1, 0, "mock-player-1");
      standings.forEach((id, index) => {
        multiplayer.setPoints(id, (standings.length - index) * 100);
      });
      multiplayer.setCareerLedger("mock-player-1", {
        killsByType: { walker: 10 },
        killsByWeapon: { revolver: 10 },
      });

      const winnerId = standings[0];
      const finished = multiplayer.finishMatch([winnerId], "progression-test");
      const afterFinish = progression.getSnapshot();
      const duplicate = progression.settleMultiplayerMatch({
        matchId: started.matchId,
        placement,
        killsByType: { walker: 10 },
      });
      const afterDuplicate = progression.getSnapshot();

      results.push({
        placement,
        matchId: started.matchId,
        winnerId,
        localWon: winnerId === "mock-player-1",
        settlement: finished.careerSettlement,
        dustCents: afterFinish.dustCents,
        dustAfterDuplicate: afterDuplicate.dustCents,
        matches: afterDuplicate.stats.multiplayer.matches,
        settledMatchIds: afterDuplicate.settledMatchIds,
        duplicate: {
          accepted: duplicate.accepted,
          reason: duplicate.reason,
          dustAddedCents: duplicate.dustAddedCents,
        },
      });
    }
    return results;
  });

  expect(cases.map((entry) => entry.placement)).toEqual([1, 2, 3, 4]);
  expect(cases.map((entry) => entry.settlement.placement)).toEqual([1, 2, 3, 4]);
  expect(cases.map((entry) => entry.settlement.multiplier)).toEqual([1.5, 1.2, 1, 0.9]);
  expect(cases.map((entry) => entry.dustCents)).toEqual([225, 180, 150, 135]);

  for (const entry of cases) {
    expect(entry.settlement.result.accepted).toBe(true);
    expect(entry.dustAfterDuplicate).toBe(entry.dustCents);
    expect(entry.matches).toBe(1);
    expect(entry.settledMatchIds).toContain(entry.matchId);
    expect(entry.duplicate).toEqual({
      accepted: false,
      reason: "duplicate-match",
      dustAddedCents: 0,
    });
  }

  expect(cases[3].localWon).toBe(false);
  expect(cases[3].dustCents).toBe(135);
});
