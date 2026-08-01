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

async function startHunt(page, query = "mapSeed=7") {
  await page.goto(`${fileUrl("index.html")}?${query}`);
  await dismissIntro(page);
  await page.getByRole("button", { name: "Start Hunt" }).click();
}

async function startMarshalBranch(page, branch, query = `mapSeed=7&marshalTest=${branch}`) {
  await startHunt(page, query);
  await page.waitForFunction(() => typeof window.advanceTime === "function" && typeof window.render_game_to_text === "function");
  await page.evaluate((marshalBranch) => {
    window.__dustAndDeadTest.clearEnemies();
    window.__dustAndDeadTest.clearPaleDeputies?.();
    window.__dustAndDeadTest.grantXp(240);
    if (!window.__dustAndDeadTest.chooseClass("marshal")) throw new Error("Could not choose Marshal");
    window.__dustAndDeadTest.forceAllStandardUpgrades("swiftBoots");
    window.__dustAndDeadTest.grantXp(1200);
    if (!window.__dustAndDeadTest.chooseMarshalUpgrade(marshalBranch)) throw new Error(`Could not choose ${marshalBranch}`);
    window.__dustAndDeadTest.forceAllStandardUpgrades("swiftBoots");
    window.__dustAndDeadTest.clearEnemies();
  }, branch);
}

test("starts the game and exposes a valid deterministic state", async ({ page }) => {
  const browserErrors = [];

  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));

  await startHunt(page, `mapSeed=7`);
  await page.waitForFunction(() => typeof window.advanceTime === "function" && typeof window.render_game_to_text === "function");
  await page.evaluate(() => window.advanceTime(1000));

  const state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  const layout = await page.evaluate(() => window.__dustAndDeadTest.validateMapLayout());

  expect(state.mode).toBe("playing");
  expect(state.waveSpawnTarget).toBe(21);
  expect(state.map.mapSizeMultiplier).toBe(4);
  expect(state.map.mainTownCount).toBeGreaterThanOrEqual(2);
  expect(state.map.mainTownCount).toBeLessThanOrEqual(5);
  expect(state.map.interestPointCount).toBe(state.map.interestPointTarget);
  expect(layout.issueCount).toBe(0);
  expect(await page.evaluate(() => [1, 5, 9, 10, 15, 16].map((wave) => window.__dustAndDeadTest.getWaveZombieCount(wave)))).toEqual([21, 75, 115, 175, 245, 407]);
  await expect(page.getByLabel("Minimap")).toBeVisible();
  await expect(page.getByLabel(/Revolver ammo/)).toBeVisible();
  expect(browserErrors).toEqual([]);
});

test("Russian minimap ammo label stays complete on a mobile runtime", async ({ page }) => {
  await page.setViewportSize({ width: 2048, height: 945 });
  await startHunt(page, "mapSeed=7");
  await page.waitForFunction(() => typeof window.advanceTime === "function");
  await page.evaluate(() => {
    document.documentElement.classList.add("is-mobile-runtime");
    window.DustAndDeadI18n.setLocale("ru", { persist: false });
    window.advanceTime(50);
  });

  const label = page.locator("#minimap-ammo-count");
  await expect(label).toContainText("Боеприпасы");
  const layout = await label.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    const rowBounds = element.parentElement.getBoundingClientRect();
    return {
      text: element.textContent,
      left: bounds.left,
      right: bounds.right,
      rowLeft: rowBounds.left,
      rowRight: rowBounds.right,
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
      whiteSpace: getComputedStyle(element).whiteSpace,
    };
  });

  expect(layout.text).toMatch(/^Боеприпасы:/);
  expect(layout.whiteSpace).toBe("nowrap");
  expect(layout.left).toBeGreaterThanOrEqual(layout.rowLeft - 1);
  expect(layout.right).toBeLessThanOrEqual(layout.rowRight + 1);
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth + 1);
});

test("experience progress wraps the minimap with a level badge", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await startHunt(page, `mapSeed=7`);
  await page.waitForFunction(() => typeof window.advanceTime === "function" && typeof window.render_game_to_text === "function");

  const metrics = await page.evaluate(() => {
    const hud = document.getElementById("hud");
    const minimap = document.getElementById("minimap");
    const xpHud = document.getElementById("xp-hud");
    const xpFrame = minimap.querySelector(".minimap-xp-frame");
    const xpInner = minimap.querySelector(".minimap-xp-inner");
    const levelBadge = minimap.querySelector(".minimap-level-badge");
    const xpFill = document.getElementById("xp-fill");
    const hudRect = hud.getBoundingClientRect();
    const minimapRect = minimap.getBoundingClientRect();
    const xpFrameRect = xpFrame.getBoundingClientRect();
    const xpInnerRect = xpInner.getBoundingClientRect();
    const levelBadgeRect = levelBadge.getBoundingClientRect();
    const initialFrameStyle = getComputedStyle(xpFrame);
    const progressLayerStyle = getComputedStyle(xpFrame, "::before");
    const initialAngle = getComputedStyle(minimap).getPropertyValue("--xp-progress-angle").trim();
    const state = JSON.parse(window.render_game_to_text());
    window.__dustAndDeadTest.grantXp(Math.floor(state.progression.xpToNext * 0.37));
    const updatedAngle = getComputedStyle(minimap).getPropertyValue("--xp-progress-angle").trim();
    return {
      oldXpHudMissing: xpHud == null,
      xpFillMissing: xpFill == null,
      xpInsideHud: !!hud.querySelector("#xp-fill"),
      levelInsideMinimap: !!minimap.querySelector("#level-value"),
      levelText: document.getElementById("level-value").textContent,
      hudHeight: hudRect.height,
      minimapWidth: minimapRect.width,
      minimapBottom: minimapRect.bottom,
      frameWidth: xpFrameRect.width,
      innerWidth: xpInnerRect.width,
      levelBadgeBottom: levelBadgeRect.bottom,
      frameTop: xpFrameRect.top,
      viewportHeight: window.innerHeight,
      viewportWidth: window.innerWidth,
      frameBackground: initialFrameStyle.backgroundImage,
      progressBackground: progressLayerStyle.backgroundImage,
      initialAngle: parseFloat(initialAngle),
      updatedAngle: parseFloat(updatedAngle),
      ariaLabel: minimap.getAttribute("aria-label"),
    };
  });

  expect(metrics.oldXpHudMissing).toBe(true);
  expect(metrics.xpFillMissing).toBe(true);
  expect(metrics.xpInsideHud).toBe(false);
  expect(metrics.levelInsideMinimap).toBe(true);
  expect(metrics.levelText).toBe("1");
  expect(metrics.hudHeight).toBeLessThan(88);
  expect(metrics.minimapBottom).toBeLessThanOrEqual(metrics.viewportHeight - 12);
  expect(metrics.frameWidth).toBeLessThanOrEqual(metrics.minimapWidth + 1);
  expect(metrics.frameWidth).toBeGreaterThan(metrics.innerWidth);
  expect(metrics.levelBadgeBottom).toBeLessThan(metrics.frameTop + 10);
  expect(metrics.frameBackground).toBe("none");
  expect(metrics.progressBackground).toContain("conic-gradient");
  expect(metrics.initialAngle).toBeCloseTo(0, 1);
  expect(metrics.updatedAngle).toBeGreaterThan(metrics.initialAngle);
  expect(metrics.ariaLabel).toContain("Experience");
});

test("mobile joystick flick enables visible auto-run and the next manual touch cancels it", async ({ page }) => {
  await page.setViewportSize({ width: 667, height: 375 });
  await startHunt(page, `mapSeed=7`);
  await page.waitForFunction(() => typeof window.advanceTime === "function" && typeof window.render_game_to_text === "function");
  await page.waitForFunction(() => getComputedStyle(document.getElementById("move-stick")).display !== "none");

  const result = await page.evaluate(() => {
    const read = () => JSON.parse(window.render_game_to_text());
    const stick = document.getElementById("move-stick");
    const fire = document.getElementById("mobile-fire");
    const rect = stick.getBoundingClientRect();
    const fireRect = fire.getBoundingClientRect();
    const stickStyle = getComputedStyle(stick);
    const fireStyle = getComputedStyle(fire);
    const stickVisualSize = parseFloat(stickStyle.getPropertyValue("--move-stick-visual-size"));
    const fireVisualSize = parseFloat(fireStyle.getPropertyValue("--mobile-fire-visual-size"));
    const stickEdgeTarget = document.elementFromPoint(rect.left + 3, rect.top + rect.height / 2);
    const fireEdgeTarget = document.elementFromPoint(fireRect.right - 3, fireRect.top + fireRect.height / 2);
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const dragX = centerX + stickVisualSize * 0.42;
    const pointerId = 71;
    const dispatch = (type, x, y, buttons) => {
      stick.dispatchEvent(new PointerEvent(type, {
        bubbles: true,
        button: 0,
        buttons,
        clientX: x,
        clientY: y,
        pointerId,
        pointerType: "touch",
      }));
    };

    const zoneStyle = getComputedStyle(stick, "::after");
    const before = read();
    dispatch("pointerdown", centerX, centerY, 1);
    dispatch("pointermove", dragX, centerY, 1);
    const readyDuringDrag = stick.classList.contains("is-auto-run-ready");
    dispatch("pointerup", dragX, centerY, 0);
    const afterRelease = read();
    const classAfterRelease = stick.classList.contains("is-auto-run");
    window.advanceTime(700);
    const afterRun = read();

    dispatch("pointerdown", centerX, centerY, 1);
    const afterCancelTouch = read();
    const classAfterCancelTouch = stick.classList.contains("is-auto-run");
    dispatch("pointerup", centerX, centerY, 0);
    window.advanceTime(400);
    const afterCancelSettle = read();

    return {
      stickHitboxWidth: rect.width,
      stickVisualSize,
      fireHitboxWidth: fireRect.width,
      fireVisualSize,
      stickEdgeHit: !!(stickEdgeTarget && stickEdgeTarget.closest("#move-stick")),
      fireEdgeHit: !!(fireEdgeTarget && fireEdgeTarget.closest("#mobile-fire")),
      zoneBorderStyle: zoneStyle.borderTopStyle,
      zoneOpacity: Number(zoneStyle.opacity),
      readyDuringDrag,
      classAfterRelease,
      classAfterCancelTouch,
      before,
      afterRelease,
      afterRun,
      afterCancelTouch,
      afterCancelSettle,
    };
  });

  expect(result.stickHitboxWidth).toBeGreaterThan(result.stickVisualSize);
  expect(result.fireHitboxWidth).toBeGreaterThan(result.fireVisualSize);
  expect(result.stickEdgeHit).toBe(true);
  expect(result.fireEdgeHit).toBe(true);
  expect(result.zoneBorderStyle).toBe("dashed");
  expect(result.zoneOpacity).toBeGreaterThan(0.5);
  expect(result.readyDuringDrag).toBe(true);
  expect(result.afterRelease.mobileControls.autoRun).toBe(true);
  expect(result.afterRelease.mobileControls.autoX).toBeGreaterThan(0.9);
  expect(result.afterRelease.mobileControls.autoZ).toBeCloseTo(0, 1);
  expect(result.classAfterRelease).toBe(true);
  expect(result.afterRun.player.x).toBeGreaterThan(result.before.player.x + 2);
  expect(result.afterCancelTouch.mobileControls.autoRun).toBe(false);
  expect(result.classAfterCancelTouch).toBe(false);
  expect(Math.abs(result.afterCancelSettle.player.x - result.afterCancelTouch.player.x)).toBeLessThan(0.25);
});

test("mobile field touch fires at the tapped point while held", async ({ page }) => {
  await page.setViewportSize({ width: 667, height: 375 });
  await startHunt(page, `mapSeed=7`);
  await page.waitForFunction(() => typeof window.advanceTime === "function" && typeof window.render_game_to_text === "function");
  await page.waitForFunction(() => getComputedStyle(document.getElementById("mobile-fire")).display !== "none");

  const result = await page.evaluate(() => {
    const read = () => JSON.parse(window.render_game_to_text());
    const canvas = Array.from(document.querySelectorAll("canvas")).find((node) => node.id !== "minimap-canvas");
    const minimap = document.querySelector(".minimap");
    const xpFrame = minimap.querySelector(".minimap-xp-frame");
    const stick = document.getElementById("move-stick");
    const canvasRect = canvas.getBoundingClientRect();
    const minimapRect = minimap.getBoundingClientRect();
    const xpRect = xpFrame.getBoundingClientRect();
    const stickRect = stick.getBoundingClientRect();
    const tapX = canvasRect.left + canvasRect.width * 0.73;
    const tapY = canvasRect.top + canvasRect.height * 0.48;
    const minimapX = minimapRect.left + minimapRect.width / 2;
    const minimapY = minimapRect.top + minimapRect.height / 2;
    const xpX = xpRect.left + xpRect.width / 2;
    const xpY = xpRect.top + 4;
    const minimapHitTarget = document.elementFromPoint(minimapX, minimapY);
    const xpHitTarget = document.elementFromPoint(xpX, xpY);
    const stickX = stickRect.left + stickRect.width / 2;
    const stickY = stickRect.top + stickRect.height / 2;
    const dispatch = (target, type, x, y, pointerId, buttons) => {
      target.dispatchEvent(new PointerEvent(type, {
        bubbles: true,
        button: 0,
        buttons,
        clientX: x,
        clientY: y,
        pointerId,
        pointerType: "touch",
      }));
    };

    window.__dustAndDeadTest.clearEnemies();
    window.__dustAndDeadTest.setAmmo("revolver", 6, 0);
    dispatch(minimapHitTarget, "pointerdown", minimapX, minimapY, 84, 1);
    const afterMinimapPointerDown = read();
    dispatch(minimapHitTarget, "pointerup", minimapX, minimapY, 84, 0);
    const afterMinimapRelease = read();

    window.__dustAndDeadTest.setAmmo("revolver", 6, 0);
    dispatch(xpHitTarget, "pointerdown", xpX, xpY, 85, 1);
    const afterXpPointerDown = read();
    dispatch(xpHitTarget, "pointerup", xpX, xpY, 85, 0);
    const afterXpRelease = read();
    window.advanceTime(700);

    window.__dustAndDeadTest.setAmmo("revolver", 6, 0);
    const before = read();
    dispatch(canvas, "pointerdown", tapX, tapY, 81, 1);
    const afterPointerDown = read();
    window.advanceTime(900);
    const afterHold = read();
    dispatch(canvas, "pointerup", tapX, tapY, 81, 0);
    const afterRelease = read();

    dispatch(stick, "pointerdown", stickX, stickY, 83, 1);
    const afterStickTouch = read();
    dispatch(stick, "pointerup", stickX, stickY, 83, 0);

    return {
      minimapHitIsCanvas: minimapHitTarget === canvas,
      xpHitIsCanvas: xpHitTarget === canvas,
      xpFrameBottomGap: window.innerHeight - xpRect.bottom,
      afterMinimapPointerDown,
      afterMinimapRelease,
      afterXpPointerDown,
      afterXpRelease,
      before,
      afterPointerDown,
      afterHold,
      afterRelease,
      afterStickTouch,
    };
  });

  expect(result.minimapHitIsCanvas).toBe(true);
  expect(result.xpHitIsCanvas).toBe(true);
  expect(Math.abs(result.xpFrameBottomGap)).toBeLessThanOrEqual(1);
  expect(result.afterMinimapPointerDown.mobileControls.fieldFireActive).toBe(true);
  expect(result.afterMinimapPointerDown.mobileControls.aimTarget.active).toBe(true);
  expect(result.afterMinimapRelease.mobileControls.fieldFireActive).toBe(false);
  expect(result.afterXpPointerDown.mobileControls.fieldFireActive).toBe(true);
  expect(result.afterXpPointerDown.mobileControls.aimTarget.active).toBe(true);
  expect(result.afterXpRelease.mobileControls.fieldFireActive).toBe(false);
  expect(result.afterPointerDown.mobileControls.fieldFireActive).toBe(true);
  expect(result.afterPointerDown.mobileControls.aimTarget.active).toBe(true);
  expect(result.afterPointerDown.mobileControls.aimTarget.markerVisible).toBe(true);
  expect(result.afterPointerDown.mobileControls.aimTarget.x).toBeGreaterThan(result.before.player.x + 3);
  expect(result.afterPointerDown.shotsFired).toBe(result.before.shotsFired + 1);
  expect(result.afterPointerDown.ammo.current).toBe(result.before.ammo.current - 1);
  expect(result.afterPointerDown.projectiles.at(-1).x).toBeGreaterThan(result.afterPointerDown.player.x);
  expect(result.afterHold.shotsFired).toBeGreaterThanOrEqual(result.before.shotsFired + 2);
  expect(result.afterHold.ammo.current).toBeLessThan(result.afterPointerDown.ammo.current);
  expect(result.afterRelease.mobileControls.fieldFireActive).toBe(false);
  expect(result.afterRelease.mobileControls.aimTarget.active).toBe(false);
  expect(result.afterStickTouch.mobileControls.aimTarget.active).toBe(false);
});

test("menu music is enabled by default and fades out when the hunt starts", async ({ page }) => {
  const browserErrors = [];

  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));

  await page.goto(`${fileUrl("index.html")}?mapSeed=7`);
  await page.waitForFunction(() => typeof window.__dustAndDeadTest?.getAudioDiagnostics === "function");

  await expect(page.locator("#menu-music-btn")).toBeVisible();
  const before = await page.evaluate(() => window.__dustAndDeadTest.getAudioDiagnostics());
  expect(before.supportsWebAudio).toBe(true);
  expect(before.enabled).toBe(true);
  expect(before.desired).toBe(true);
  expect(before.menuActive).toBe(false);
  expect(before.introActive).toBe(true);
  expect(before.tempo).toBe(104);
  expect(before.volume).toBeCloseTo(1, 2);

  await page.keyboard.press("KeyM");
  await expect(page.locator("#intro-screen")).toBeHidden();
  await page.waitForFunction(() => window.__dustAndDeadTest.getAudioDiagnostics().menuActive);
  const playing = await page.evaluate(() => window.__dustAndDeadTest.getAudioDiagnostics());
  expect(playing.contextState).toBe("running");
  expect(playing.schedulerActive).toBe(true);
  expect(playing.introActive).toBe(false);
  expect(playing.menuNodeCount).toBeGreaterThanOrEqual(2);
  await expect(page.locator("#menu-music-btn")).toHaveAttribute("aria-pressed", "true");

  await page.locator("#menu-music-btn").click();
  await page.waitForFunction(() => !window.__dustAndDeadTest.getAudioDiagnostics().schedulerActive);
  const muted = await page.evaluate(() => window.__dustAndDeadTest.getAudioDiagnostics());
  expect(muted.enabled).toBe(false);
  expect(muted.menuActive).toBe(false);
  await expect(page.locator("#menu-music-btn")).toHaveAttribute("aria-pressed", "false");

  await page.locator("#menu-music-btn").click();
  await page.waitForFunction(() => window.__dustAndDeadTest.getAudioDiagnostics().menuActive);

  await page.getByRole("button", { name: "Start Hunt" }).click();
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).mode === "playing");
  await page.waitForFunction(() => !window.__dustAndDeadTest.getAudioDiagnostics().schedulerActive);
  await page.waitForFunction(() => window.__dustAndDeadTest.getAudioDiagnostics().gameSchedulerActive);
  const afterStart = await page.evaluate(() => window.__dustAndDeadTest.getAudioDiagnostics());
  expect(afterStart.desired).toBe(false);
  expect(afterStart.gameDesired).toBe(true);
  expect(afterStart.menuActive).toBe(false);
  expect(afterStart.gameActive).toBe(true);
  expect(afterStart.gameTempo).toBe(116);
  expect(afterStart.gameVolume).toBeCloseTo(1, 2);

  const battleMusic = await page.evaluate(() => {
    const read = () => JSON.parse(window.render_game_to_text());
    window.__dustAndDeadTest.clearEnemies();
    const state = read();
    for (let i = 0; i < 12; i++) {
      const angle = (Math.PI * 2 * i) / 12;
      window.__dustAndDeadTest.spawnZombieAt("walker", state.player.x + Math.cos(angle) * 5.5, state.player.z + Math.sin(angle) * 5.5);
    }
    return window.__dustAndDeadTest.getAudioDiagnostics();
  });
  expect(battleMusic.gameDanger).toBeGreaterThan(0.5);
  await page.waitForFunction(() => window.__dustAndDeadTest.getAudioDiagnostics().gameBattleTarget > 0.5);
  await page.waitForFunction(() => window.__dustAndDeadTest.getAudioDiagnostics().gameBattleAmount > 0.08);
  const battleAfterMix = await page.evaluate(() => window.__dustAndDeadTest.getAudioDiagnostics());
  expect(battleAfterMix.gameBattleTarget).toBeGreaterThan(0.5);
  expect(battleAfterMix.gameBattleAmount).toBeGreaterThan(0.08);
  expect(browserErrors).toEqual([]);
});

test("single-player music returns after dying during a boss and pressing restart", async ({ page }) => {
  await startHunt(page, `mapSeed=7`);
  await page.waitForFunction(() => {
    const audio = window.__dustAndDeadTest.getAudioDiagnostics();
    return audio.contextState === "running" && audio.gameSchedulerActive;
  });

  await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    game.startWaveNow(10, "oilBaron");
    game.clearEnemies();
    game.setOilBaronAiEnabled(false);
  });
  await page.waitForFunction(() => {
    const music = window.__dustAndDeadTest.getAudioDiagnostics().bossMusic;
    return music.id === "oil-baron" && music.active && music.normalSuppressed && music.normalGain < 0.01;
  });

  const defeated = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    return {
      forced: game.forceSinglePlayerGameOver(),
      audio: game.getAudioDiagnostics(),
      mode: JSON.parse(window.render_game_to_text()).mode,
    };
  });
  expect(defeated.forced).toBe(true);
  expect(defeated.mode).toBe("gameover");
  expect(defeated.audio.gameActive).toBe(false);

  await page.locator("#restart-btn").click();
  await page.waitForFunction(() => {
    const audio = window.__dustAndDeadTest.getAudioDiagnostics();
    return JSON.parse(window.render_game_to_text()).mode === "playing" &&
      audio.gameActive && audio.gameSchedulerActive && audio.gameNodeCount >= 4;
  });
  await page.waitForTimeout(180);
  const restarted = await page.evaluate(() => window.__dustAndDeadTest.getAudioDiagnostics());

  expect(restarted.bossMusic).toMatchObject({ lifecycle: "normal", normalSuppressed: false });
  expect(restarted.bossMusic.normalGain).toBeGreaterThan(0.85);
  expect(restarted.gameActive).toBe(true);
  expect(restarted.gameSchedulerActive).toBe(true);
  expect(restarted.gameNodeCount).toBeGreaterThanOrEqual(4);
});

test("winchester shots schedule a powerful rifle report", async ({ page }) => {
  const browserErrors = [];

  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));

  await startHunt(page, `mapSeed=7`);
  await page.waitForFunction(() => window.__dustAndDeadTest.getAudioDiagnostics().contextState === "running");

  const result = await page.evaluate(() => {
    const read = () => JSON.parse(window.render_game_to_text());
    window.__dustAndDeadTest.clearEnemies();
    window.__dustAndDeadTest.grantXp(240);
    const choseRanger = window.__dustAndDeadTest.chooseClass("ranger");
    let state = read();
    window.__dustAndDeadTest.setAmmo("rifle", 18, 0);
    window.__dustAndDeadTest.setAimTarget(state.player.x + 16, state.player.z);
    const before = window.__dustAndDeadTest.getAudioDiagnostics();
    const fired = window.__dustAndDeadTest.shootOnce();
    const after = window.__dustAndDeadTest.getAudioDiagnostics();
    state = read();
    return {
      choseRanger,
      fired,
      weapon: state.weapon,
      rifleAmmo: state.ammo.weapons.rifle.current,
      scheduledNodes: after.transientAudioNodeCount - before.transientAudioNodeCount,
    };
  });

  expect(result.choseRanger).toBe(true);
  expect(result.fired).toBe(true);
  expect(result.weapon).toBe("rifle");
  expect(result.rifleAmmo).toBe(17);
  expect(result.scheduledNodes).toBeGreaterThanOrEqual(12);
  expect(browserErrors).toEqual([]);
});

test("launcher shots schedule a launch report and quiet grenade whistle", async ({ page }) => {
  const browserErrors = [];

  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));

  await startHunt(page, `mapSeed=7`);
  await page.waitForFunction(() => window.__dustAndDeadTest.getAudioDiagnostics().contextState === "running");

  const result = await page.evaluate(() => {
    const read = () => JSON.parse(window.render_game_to_text());
    const advanceUntilNoLauncher = () => {
      for (let i = 0; i < 50; i++) {
        if (!read().projectiles.some((projectile) => projectile.type === "launcher")) return;
        window.advanceTime(100);
      }
    };
    window.__dustAndDeadTest.clearEnemies();
    window.__dustAndDeadTest.grantXp(240);
    const choseDemolitionist = window.__dustAndDeadTest.chooseClass("demolitionist");
    window.__dustAndDeadTest.forceAllStandardUpgrades("swiftBoots");
    let state = read();
    window.__dustAndDeadTest.setAmmo("launcher", 3, 0);
    window.__dustAndDeadTest.setAimTarget(state.player.x + 12, state.player.z);
    const before = window.__dustAndDeadTest.getAudioDiagnostics();
    const fired = window.__dustAndDeadTest.shootOnce();
    const afterShot = window.__dustAndDeadTest.getAudioDiagnostics();
    const projectileDuringFlight = read().projectiles[0];
    advanceUntilNoLauncher();
    const afterLanding = window.__dustAndDeadTest.getAudioDiagnostics();
    state = read();
    return {
      choseDemolitionist,
      fired,
      weapon: state.weapon,
      launcherAmmo: state.ammo.weapons.launcher.current,
      projectileType: projectileDuringFlight && projectileDuringFlight.type,
      launchNodes: afterShot.transientAudioNodeCount - before.transientAudioNodeCount,
      landingNodes: afterLanding.transientAudioNodeCount - afterShot.transientAudioNodeCount,
      whistleDuringFlight: afterShot.launcherWhistleCount,
      whistleAfterLanding: afterLanding.launcherWhistleCount,
      activeProjectiles: state.projectiles.filter((projectile) => projectile.type === "launcher").length,
    };
  });

  expect(result.choseDemolitionist).toBe(true);
  expect(result.fired).toBe(true);
  expect(result.weapon).toBe("launcher");
  expect(result.launcherAmmo).toBe(2);
  expect(result.projectileType).toBe("launcher");
  expect(result.launchNodes).toBeGreaterThanOrEqual(16);
  expect(result.landingNodes).toBeGreaterThanOrEqual(25);
  expect(result.whistleDuringFlight).toBe(1);
  expect(result.whistleAfterLanding).toBe(0);
  expect(result.activeProjectiles).toBe(0);
  expect(browserErrors).toEqual([]);
});

test("transient three objects are reclaimed after dense effect stress", async ({ page }) => {
  test.setTimeout(90000);
  await startHunt(page, `mapSeed=7`);
  await page.waitForFunction(() => typeof window.advanceTime === "function" && typeof window.__dustAndDeadTest?.getThreeObjectDiagnostics === "function");

  const result = await page.evaluate(() => {
    const advanceFully = (ms) => {
      let remaining = ms;
      while (remaining > 0) {
        const chunk = Math.min(1000, remaining);
        window.advanceTime(chunk);
        remaining -= chunk;
      }
    };
    const settle = () => {
      window.__dustAndDeadTest.clearEnemies();
      window.__dustAndDeadTest.clearFireHazards();
      window.__dustAndDeadTest.clearAcidHazards();
      window.__dustAndDeadTest.clearXpOrbs();
      window.__dustAndDeadTest.clearAmmoCrates();
      window.__dustAndDeadTest.clearRifleTraps();
      window.__dustAndDeadTest.clearLauncherExplosionSamples();
      window.__dustAndDeadTest.setAmmoCrateTimer(9999);
      advanceFully(9000);
      window.__dustAndDeadTest.clearAmmoCrates();
      return window.__dustAndDeadTest.getThreeObjectDiagnostics();
    };

    const baseline = settle();
    const state = JSON.parse(window.render_game_to_text());
    const px = state.player.x;
    const pz = state.player.z;

    for (let i = 0; i < 80; i++) {
      window.__dustAndDeadTest.triggerLauncherExplosionAt(px + 12 + (i % 10) * 0.45, pz + 12 + Math.floor(i / 10) * 0.45, "main", 3.2, 5.5, {
        noFire: true,
        noShrapnel: true,
        noCluster: true,
      });
    }
    for (let i = 0; i < 120; i++) {
      window.__dustAndDeadTest.spawnFirePatchAt(px + 25 + (i % 12) * 0.7, pz + 14 + Math.floor(i / 12) * 0.7, 0.6, 0.8);
    }
    const stressed = window.__dustAndDeadTest.getThreeObjectDiagnostics();
    const settled = settle();
    return { baseline, stressed, settled };
  });

  expect(result.stressed.state.lightFlashes).toBeLessThanOrEqual(result.stressed.limits.lightFlashes);
  expect(result.stressed.pools.explosionEffects.lightFlashes.created).toBeLessThanOrEqual(result.stressed.limits.lightFlashes);
  expect(result.stressed.state.particles).toBeLessThanOrEqual(result.stressed.limits.particles);
  expect(result.stressed.state.smokePuffs).toBeLessThanOrEqual(result.stressed.limits.smokePuffs);
  expect(result.stressed.state.shockwaves).toBeLessThanOrEqual(result.stressed.limits.shockwaves);
  expect(result.stressed.state.decals).toBeLessThanOrEqual(result.stressed.limits.decals);

  expect(result.settled.state.enemies).toBe(0);
  expect(result.settled.state.bullets).toBe(0);
  expect(result.settled.state.particles).toBe(0);
  expect(result.settled.state.smokePuffs).toBe(0);
  expect(result.settled.state.shockwaves).toBe(0);
  expect(result.settled.state.lightFlashes).toBe(0);
  expect(result.settled.state.lightningBolts).toBe(0);
  expect(result.settled.state.decals).toBe(0);
  expect(result.settled.state.debris).toBe(0);
  expect(result.settled.state.firePatches).toBe(0);
  expect(result.settled.state.xpOrbs).toBe(0);
  expect(result.settled.state.rifleTraps).toBe(0);
  expect(result.settled.state.ammoCrates).toBe(0);
  expect(result.settled.pools.explosionEffects.lightFlashes.inUse).toBe(0);
  expect(result.settled.pools.particleVisuals.box.inUse).toBe(0);
  expect(result.settled.roots.dynamicRoot.objects).toBe(result.baseline.roots.dynamicRoot.objects);
  expect(result.settled.roots.effectRoot.objects).toBe(result.baseline.roots.effectRoot.objects);
});

test("projectile visuals are pooled for repeated revolver and launcher shots", async ({ page }) => {
  await startHunt(page, `mapSeed=7`);
  await page.waitForFunction(() => typeof window.advanceTime === "function" && typeof window.__dustAndDeadTest?.getProjectileOptimizationStats === "function");

  const result = await page.evaluate(() => {
    const read = () => JSON.parse(window.render_game_to_text());
    const advanceFully = (ms) => {
      let remaining = ms;
      while (remaining > 0) {
        const chunk = Math.min(1000, remaining);
        window.advanceTime(chunk);
        remaining -= chunk;
      }
    };

    window.__dustAndDeadTest.clearEnemies();
    window.__dustAndDeadTest.clearFireHazards();
    window.__dustAndDeadTest.clearAcidHazards();
    window.__dustAndDeadTest.clearXpOrbs();
    window.__dustAndDeadTest.clearAmmoCrates();
    window.__dustAndDeadTest.setAmmoCrateTimer(9999);

    const before = window.__dustAndDeadTest.getProjectileOptimizationStats();
    let state = read();
    window.__dustAndDeadTest.setAmmo("revolver", 6, 0);
    window.__dustAndDeadTest.setAimTarget(state.player.x, state.player.z + 18);
    const revolverFirstFired = window.__dustAndDeadTest.shootOnce();
    const revolverFirst = window.__dustAndDeadTest.getProjectileOptimizationStats();
    advanceFully(1200);
    const revolverAfterFirst = window.__dustAndDeadTest.getProjectileOptimizationStats();

    state = read();
    window.__dustAndDeadTest.setAmmo("revolver", 6, 0);
    window.__dustAndDeadTest.setAimTarget(state.player.x, state.player.z + 18);
    const revolverSecondFired = window.__dustAndDeadTest.shootOnce();
    const revolverSecond = window.__dustAndDeadTest.getProjectileOptimizationStats();
    advanceFully(1200);
    const afterRevolver = window.__dustAndDeadTest.getProjectileOptimizationStats();

    window.__dustAndDeadTest.grantXp(240);
    window.__dustAndDeadTest.chooseClass("demolitionist");
    window.__dustAndDeadTest.forceAllStandardUpgrades("swiftBoots");
    state = read();
    window.__dustAndDeadTest.setAmmo("launcher", 3, 9);
    window.__dustAndDeadTest.setAimTarget(state.player.x + 10, state.player.z);
    const launcherFirstFired = window.__dustAndDeadTest.shootOnce();
    const launcherFirst = window.__dustAndDeadTest.getProjectileOptimizationStats();
    advanceFully(1800);
    const launcherAfterFirst = window.__dustAndDeadTest.getProjectileOptimizationStats();

    state = read();
    window.__dustAndDeadTest.setAmmo("launcher", 3, 9);
    window.__dustAndDeadTest.setAimTarget(state.player.x + 10, state.player.z);
    const launcherSecondFired = window.__dustAndDeadTest.shootOnce();
    const launcherSecond = window.__dustAndDeadTest.getProjectileOptimizationStats();

    return {
      before,
      revolverFirstFired,
      revolverFirst,
      revolverAfterFirst,
      revolverSecondFired,
      revolverSecond,
      afterRevolver,
      launcherFirstFired,
      launcherFirst,
      launcherAfterFirst,
      launcherSecondFired,
      launcherSecond,
    };
  });

  expect(result.revolverFirstFired).toBe(true);
  expect(result.revolverFirst.standard.inUse).toBeGreaterThan(result.before.standard.inUse);
  expect(result.revolverAfterFirst.standard.inUse).toBe(0);
  expect(result.revolverSecondFired).toBe(true);
  expect(result.revolverSecond.standard.created).toBe(result.before.standard.created);
  expect(result.afterRevolver.standard.inUse).toBe(0);

  expect(result.launcherFirstFired).toBe(true);
  expect(result.launcherFirst.launcher.inUse).toBeGreaterThan(result.launcherAfterFirst.launcher.inUse);
  expect(result.launcherAfterFirst.launcher.inUse).toBe(0);
  expect(result.launcherSecondFired).toBe(true);
  expect(result.launcherSecond.launcher.created).toBe(result.before.launcher.created);
});

test("zombie pooling reuses groups and spatial grid tracks active hordes", async ({ page }) => {
  await startHunt(page, `mapSeed=7`);
  await page.waitForFunction(() => typeof window.advanceTime === "function" && typeof window.render_game_to_text === "function");

  const result = await page.evaluate(() => {
    const read = () => JSON.parse(window.render_game_to_text());
    window.__dustAndDeadTest.clearEnemies();
    const before = window.__dustAndDeadTest.getZombieOptimizationStats();
    const player = read().player;

    const first = window.__dustAndDeadTest.spawnZombieAt("walker", player.x + 2.2, player.z);
    const afterFirst = window.__dustAndDeadTest.getZombieOptimizationStats();

    window.__dustAndDeadTest.killNearestZombie();
    const afterKill = window.__dustAndDeadTest.getZombieOptimizationStats();

    const second = window.__dustAndDeadTest.spawnZombieAt("walker", player.x + 4.2, player.z);
    window.advanceTime(16);
    const afterReuse = window.__dustAndDeadTest.getZombieOptimizationStats();

    window.__dustAndDeadTest.spawnZombieAt("runner", player.x + 4.9, player.z + 0.4);
    window.__dustAndDeadTest.spawnZombieAt("brute", player.x + 5.6, player.z + 0.7);
    window.advanceTime(16);
    const afterCluster = window.__dustAndDeadTest.getZombieOptimizationStats();

    return { before, first, afterFirst, afterKill, second, afterReuse, afterCluster };
  });

  expect(result.afterFirst.pools.walker.created).toBe(result.before.pools.walker.created);
  expect(result.afterFirst.pools.walker.inUse).toBe(result.before.pools.walker.inUse + 1);
  expect(result.afterKill.pools.walker.available).toBe(result.before.pools.walker.available);
  expect(result.afterKill.pools.walker.inUse).toBe(result.before.pools.walker.inUse);
  expect(result.second.groupId).toBe(result.first.groupId);
  expect(result.afterReuse.pools.walker.created).toBe(result.before.pools.walker.created);
  expect(result.afterCluster.grid.occupants).toBeGreaterThanOrEqual(3);
  expect(result.afterCluster.grid.cellCount).toBeGreaterThan(0);
  expect(result.afterCluster.grid.maxBucketSize).toBeGreaterThan(0);
});

test("fast zombies spawn from later waves and stay slightly faster than the player", async ({ page }) => {
  await startHunt(page, `mapSeed=7`);
  await page.waitForFunction(() => typeof window.advanceTime === "function" && typeof window.render_game_to_text === "function");

  const result = await page.evaluate(() => {
    const read = () => JSON.parse(window.render_game_to_text());
    const grantNextLevel = () => {
      const state = read();
      window.__dustAndDeadTest.grantXp(state.progression.xpToNext);
      return read();
    };
    const forceSwiftBoots = () => {
      grantNextLevel();
      const forced = window.__dustAndDeadTest.forceStandardUpgrade("swiftBoots");
      if (!forced) throw new Error("Could not force swiftBoots");
      return read();
    };

    window.__dustAndDeadTest.clearEnemies();
    const wave1 = window.__dustAndDeadTest.sampleZombieTypes(1, 220);
    const wave10 = window.__dustAndDeadTest.sampleZombieTypes(10, 220);
    const wave11 = window.__dustAndDeadTest.sampleZombieTypes(11, 220);
    const poolBefore = window.__dustAndDeadTest.getZombieOptimizationStats();
    const before = read();
    const first = window.__dustAndDeadTest.spawnZombieAt("fastZombie", before.player.x + 7, before.player.z);
    const poolAfterSpawn = window.__dustAndDeadTest.getZombieOptimizationStats();
    const afterSpawn = read();
    const runner = window.__dustAndDeadTest.spawnZombieAt("runner", before.player.x + 5, before.player.z + 1.2);

    forceSwiftBoots();
    const boosted = forceSwiftBoots();
    window.advanceTime(16);
    const afterBoostUpdate = read();
    const fast = afterBoostUpdate.enemies.find((enemy) => enemy.type === "fastZombie");

    return { wave1, wave10, wave11, poolBefore, poolAfterSpawn, before, first, runner, afterSpawn, boosted, fast };
  });

  expect(result.wave1.runner).toBeGreaterThan(0);
  expect(result.wave1.fastZombie || 0).toBe(0);
  expect(result.wave10.fastZombie || 0).toBe(0);
  expect(result.wave11.fastZombie).toBeGreaterThan(0);
  expect(result.poolBefore.pools.walker.created).toBeGreaterThanOrEqual(64);
  expect(result.poolBefore.pools.runner.created).toBeGreaterThanOrEqual(34);
  expect(result.poolBefore.pools.brute.created).toBeGreaterThanOrEqual(28);
  expect(result.poolBefore.pools.spitter.created).toBeGreaterThanOrEqual(18);
  expect(result.poolBefore.pools.fastZombie.available).toBeGreaterThan(0);
  expect(result.poolAfterSpawn.pools.fastZombie.created).toBe(result.poolBefore.pools.fastZombie.created);
  expect(result.poolAfterSpawn.pools.fastZombie.inUse).toBe(result.poolBefore.pools.fastZombie.inUse + 1);
  expect(result.first.type).toBe("fastZombie");
  expect(result.runner.type).toBe("runner");
  expect(result.runner.speed).toBeLessThan(result.first.speed);
  expect(result.runner.hasParasiteSilhouette).toBe(false);
  expect(result.first.hasParasiteSilhouette).toBe(true);
  expect(result.first.visualParts).toBeGreaterThan(20);
  expect(result.first.speed).toBeGreaterThan(result.before.player.speed);
  expect(result.afterSpawn.enemies[0].speed).toBeGreaterThan(result.before.player.speed);
  expect(result.boosted.player.speed).toBeGreaterThan(result.before.player.speed);
  expect(result.fast.speed).toBeGreaterThan(result.boosted.player.speed);
  expect(result.fast.speed - result.boosted.player.speed).toBeLessThan(1.2);
});

test("zombies drop xp and collected xp can level the player", async ({ page }) => {
  await startHunt(page, `mapSeed=7`);
  await page.waitForFunction(() => typeof window.advanceTime === "function" && typeof window.render_game_to_text === "function");

  let firstDrop = await page.evaluate(() => {
    window.__dustAndDeadTest.clearEnemies();
    let state = JSON.parse(window.render_game_to_text());
    const player = state.player;
    window.__dustAndDeadTest.spawnZombieAt("walker", player.x + 2.2, player.z);
    window.__dustAndDeadTest.killNearestZombie();
    state = JSON.parse(window.render_game_to_text());
    return { progression: state.progression, orb: state.xpOrbs[0] };
  });

  expect(firstDrop.progression.level).toBe(1);
  expect(firstDrop.progression.totalXp).toBe(0);
  expect(firstDrop.progression.xpOrbs).toBe(1);
  expect(firstDrop.orb.value).toBe(4);
  expect(firstDrop.orb.visualScale).toBeGreaterThanOrEqual(0.24);

  let collected = await page.evaluate(() => {
    const liveState = JSON.parse(window.render_game_to_text());
    const orb = liveState.xpOrbs[0];
    // The live RAF can legitimately finish pulling this nearby orb in while
    // Playwright evaluates the assertions above. If it is still present,
    // collect it explicitly; otherwise verify the already-collected state.
    if (orb) {
      window.__dustAndDeadTest.setPlayerPosition(orb.x, orb.z);
      window.advanceTime(120);
    }
    return JSON.parse(window.render_game_to_text()).progression;
  });

  expect(collected.level).toBe(1);
  expect(collected.xp).toBe(4);
  expect(collected.totalXp).toBe(4);
  expect(collected.xpOrbs).toBe(0);

  for (let i = 0; i < 7; i++) {
    collected = await page.evaluate(() => {
      const state = JSON.parse(window.render_game_to_text());
      const player = state.player;
      window.__dustAndDeadTest.spawnZombieAt("walker", player.x + 2.2, player.z);
      window.__dustAndDeadTest.killNearestZombie();
      const afterKill = JSON.parse(window.render_game_to_text());
      const orb = afterKill.xpOrbs[0];
      window.__dustAndDeadTest.setPlayerPosition(orb.x, orb.z);
      window.advanceTime(120);
      return JSON.parse(window.render_game_to_text()).progression;
    });
  }

  expect(collected.level).toBe(2);
  expect(collected.levelUps).toBe(1);
  expect(collected.totalXp).toBe(32);
  expect(collected.xp).toBe(1);
  expect(collected.standardUpgradePending).toBe(true);
  expect(collected.standardUpgradeChoices).toHaveLength(3);
  await expect(page.locator("#level-value")).toHaveText("2");
  await expect(page.getByLabel("Level up choice")).toBeVisible();

  const firstUpgrade = collected.standardUpgradeChoices[0];
  const choseUpgrade = await page.evaluate((id) => window.__dustAndDeadTest.chooseStandardUpgrade(id), firstUpgrade);
  expect(choseUpgrade).toBe(true);
  const afterUpgrade = JSON.parse(await page.evaluate(() => window.render_game_to_text())).progression;
  expect(afterUpgrade.standardUpgradePending).toBe(false);
  expect(afterUpgrade.standardUpgradesChosen).toBe(1);
  expect(afterUpgrade.upgrades[firstUpgrade]).toBe(1);
});

test("ammo reserve remains visible while reloading", async ({ page }) => {
  await startHunt(page, `mapSeed=7`);
  await page.waitForFunction(() => typeof window.advanceTime === "function" && typeof window.render_game_to_text === "function");

  const result = await page.evaluate(() => {
    const read = () => JSON.parse(window.render_game_to_text());
    const readHud = () => {
      const hud = document.getElementById("ammo-hud");
      const iconFrame = document.querySelector(".ammo-icon-frame");
      const style = getComputedStyle(hud);
      const iconStyle = getComputedStyle(iconFrame);
      return {
        statusText: document.getElementById("ammo-status").textContent,
        low: hud.classList.contains("is-low-ammo"),
        critical: hud.classList.contains("is-critical-ammo"),
        borderWidth: parseFloat(style.borderTopWidth),
        iconBorderWidth: parseFloat(iconStyle.borderTopWidth),
        iconBoxShadow: iconStyle.boxShadow,
      };
    };
    const setup = read();
    window.__dustAndDeadTest.clearEnemies();
    window.__dustAndDeadTest.setAmmo("revolver", setup.ammo.weapons.revolver.magazine, setup.ammo.weapons.revolver.magazine * 2);
    const twoReserveHud = readHud();

    window.__dustAndDeadTest.setAmmo("revolver", 1, 12);
    window.__dustAndDeadTest.setAimTarget(setup.player.x, setup.player.z + 12);
    const lowFired = window.__dustAndDeadTest.shootOnce();
    const lowState = read();
    const lowHud = readHud();

    window.__dustAndDeadTest.setAmmo("revolver", 1, 5);
    window.__dustAndDeadTest.setAimTarget(setup.player.x, setup.player.z + 12);
    const criticalFired = window.__dustAndDeadTest.shootOnce();
    const criticalState = read();
    const criticalHud = readHud();

    return {
      twoReserve: {
        statusText: twoReserveHud.statusText,
        lowClass: twoReserveHud.low,
        criticalClass: twoReserveHud.critical,
        borderWidth: twoReserveHud.borderWidth,
        iconBorderWidth: twoReserveHud.iconBorderWidth,
        iconBoxShadow: twoReserveHud.iconBoxShadow,
      },
      low: {
        fired: lowFired,
        statusText: lowHud.statusText,
        lowClass: lowHud.low,
        criticalClass: lowHud.critical,
        borderWidth: lowHud.borderWidth,
        iconBorderWidth: lowHud.iconBorderWidth,
        iconBoxShadow: lowHud.iconBoxShadow,
        reloading: lowState.ammo.reloading,
        current: lowState.ammo.current,
        reserve: lowState.ammo.reserve,
        total: lowState.ammo.total,
      },
      critical: {
        fired: criticalFired,
        statusText: criticalHud.statusText,
        lowClass: criticalHud.low,
        criticalClass: criticalHud.critical,
        borderWidth: criticalHud.borderWidth,
        iconBorderWidth: criticalHud.iconBorderWidth,
        iconBoxShadow: criticalHud.iconBoxShadow,
        reloading: criticalState.ammo.reloading,
        current: criticalState.ammo.current,
        reserve: criticalState.ammo.reserve,
        total: criticalState.ammo.total,
      },
    };
  });

  expect(result.twoReserve.lowClass).toBe(true);
  expect(result.twoReserve.criticalClass).toBe(false);
  expect(result.twoReserve.borderWidth).toBeGreaterThanOrEqual(2);
  expect(result.twoReserve.iconBorderWidth).toBeGreaterThanOrEqual(2);
  expect(result.twoReserve.iconBoxShadow).not.toBe("none");
  expect(result.twoReserve.statusText).toContain("LOW AMMO");

  expect(result.low.fired).toBe(true);
  expect(result.low.reloading).toBe(true);
  expect(result.low.current).toBe(0);
  expect(result.low.reserve).toBe(12);
  expect(result.low.total).toBe(12);
  expect(result.low.lowClass).toBe(true);
  expect(result.low.criticalClass).toBe(false);
  expect(result.low.borderWidth).toBeGreaterThanOrEqual(2);
  expect(result.low.iconBorderWidth).toBeGreaterThanOrEqual(2);
  expect(result.low.iconBoxShadow).not.toBe("none");
  expect(result.low.statusText).toContain("Reload");
  expect(result.low.statusText).toContain("LOW AMMO");
  expect(result.low.statusText).toContain("LEFT 12");

  expect(result.critical.fired).toBe(true);
  expect(result.critical.reloading).toBe(true);
  expect(result.critical.current).toBe(0);
  expect(result.critical.reserve).toBe(5);
  expect(result.critical.total).toBe(5);
  expect(result.critical.lowClass).toBe(false);
  expect(result.critical.criticalClass).toBe(true);
  expect(result.critical.borderWidth).toBeGreaterThanOrEqual(2);
  expect(result.critical.iconBorderWidth).toBeGreaterThanOrEqual(2);
  expect(result.critical.iconBoxShadow).not.toBe("none");
  expect(result.critical.statusText).toContain("Reload");
  expect(result.critical.statusText).toContain("LAST MAG");
  expect(result.critical.statusText).toContain("LEFT 5");
});

test("ammo crate pointer appears over the player for nearby offscreen crates", async ({ page }) => {
  await page.setViewportSize({ width: 960, height: 720 });
  await startHunt(page, `mapSeed=7`);
  await page.waitForFunction(() => typeof window.advanceTime === "function" && typeof window.render_game_to_text === "function");

  const result = await page.evaluate(() => {
    const read = () => JSON.parse(window.render_game_to_text());
    const settlePointer = () => {
      window.advanceTime(320);
      return read().ammoCratePointer;
    };

    window.__dustAndDeadTest.clearEnemies();
    window.__dustAndDeadTest.clearAmmoCrates();
    window.__dustAndDeadTest.setAmmoCrateTimer(9999);

    let state = read();
    window.__dustAndDeadTest.spawnAmmoCrateAt(state.player.x + 3, state.player.z);
    const visibleCrate = settlePointer();

    window.__dustAndDeadTest.clearAmmoCrates();
    state = read();
    window.__dustAndDeadTest.spawnAmmoCrateAt(state.player.x + state.ammoCratePointer.range + 8, state.player.z);
    const farCrate = settlePointer();

    window.__dustAndDeadTest.clearAmmoCrates();
    state = read();
    const offscreenX = state.camera.visibleGround.maxX + 2.2;
    const offscreenZ = state.player.z;
    window.__dustAndDeadTest.spawnAmmoCrateAt(offscreenX, offscreenZ);
    const offscreenCrate = settlePointer();

    return {
      visibleCrate,
      farCrate,
      offscreenCrate,
      player: state.player,
      offscreenTarget: { x: offscreenX, z: offscreenZ },
    };
  });

  expect(result.visibleCrate.visible).toBe(false);
  expect(result.visibleCrate.target).toBeNull();
  expect(result.farCrate.visible).toBe(false);
  expect(result.farCrate.target).toBeNull();
  expect(result.offscreenCrate.visible).toBe(true);
  expect(result.offscreenCrate.alpha).toBeGreaterThan(0.4);
  expect(result.offscreenCrate.target.x).toBeCloseTo(result.offscreenTarget.x, 2);
  expect(result.offscreenCrate.target.z).toBeCloseTo(result.offscreenTarget.z, 2);
  expect(result.offscreenCrate.target.distance).toBeLessThanOrEqual(result.offscreenCrate.range);
  expect(result.offscreenCrate.angle).toBeCloseTo(Math.PI / 2, 1);
  expect(result.offscreenCrate.distanceFromPlayer).toBeGreaterThan(1.75);
  expect(result.offscreenCrate.y).toBeGreaterThan(4.2);
  expect(result.offscreenCrate.x).toBeGreaterThan(result.player.x + 1.5);
});

test("mini ammo crates do not block standard crate spawns or minimap markers", async ({ page }) => {
  await startHunt(page, `mapSeed=7`);
  await page.waitForFunction(() => typeof window.advanceTime === "function" && typeof window.render_game_to_text === "function");

  const result = await page.evaluate(() => {
    const read = () => JSON.parse(window.render_game_to_text());
    window.__dustAndDeadTest.clearEnemies();
    window.__dustAndDeadTest.clearAmmoCrates();
    window.__dustAndDeadTest.setAmmoCrateTimer(9999);

    const state = read();
    for (let i = 0; i < 4; i++) {
      window.__dustAndDeadTest.spawnMiniAmmoCrateAt(state.player.x + 3 + i * 0.55, state.player.z + 0.35);
    }
    const afterMinis = read();

    window.__dustAndDeadTest.setAmmoCrateTimer(0);
    window.advanceTime(100);
    const afterStandardSpawn = read();

    return { afterMinis, afterStandardSpawn };
  });

  expect(result.afterMinis.ammoCrates).toHaveLength(4);
  expect(result.afterMinis.ammoCrates.every((crate) => crate.mini)).toBe(true);
  expect(result.afterMinis.minimap.nearestAmmoCrates).toHaveLength(0);
  expect(result.afterStandardSpawn.ammoCrates.filter((crate) => crate.mini)).toHaveLength(4);
  expect(result.afterStandardSpawn.ammoCrates.filter((crate) => !crate.mini)).toHaveLength(1);
  expect(result.afterStandardSpawn.minimap.nearestAmmoCrates).toHaveLength(1);
  expect(result.afterStandardSpawn.minimap.nearestAmmoCrates.every((crate) => !crate.mini)).toBe(true);
});

test("dual revolvers alternate muzzle sides and ammo rows", async ({ page }) => {
  await startHunt(page, `mapSeed=7`);
  await page.waitForFunction(() => typeof window.advanceTime === "function" && typeof window.render_game_to_text === "function");

  const result = await page.evaluate(() => {
    const read = () => JSON.parse(window.render_game_to_text());
    const spentIndices = () =>
      Array.from(document.querySelectorAll("#ammo-cartridge-rack .ammo-round"))
        .filter((round) => round.classList.contains("is-spent"))
        .map((round) => Number(round.dataset.index));

    window.__dustAndDeadTest.clearEnemies();
    window.__dustAndDeadTest.grantXp(240);
    window.__dustAndDeadTest.chooseClass("gunslinger");
    window.__dustAndDeadTest.forceAllStandardUpgrades("swiftBoots");
    window.__dustAndDeadTest.grantXp(1200);
    window.__dustAndDeadTest.chooseRevolverUpgrade("dualRevolvers");
    window.__dustAndDeadTest.forceAllStandardUpgrades("swiftBoots");
    const setup = read();
    window.__dustAndDeadTest.clearEnemies();
    window.__dustAndDeadTest.setAmmo("revolver", setup.ammo.weapons.revolver.magazine, 0);
    window.__dustAndDeadTest.setAimTarget(setup.player.x, setup.player.z + 12);

    window.__dustAndDeadTest.shootOnce();
    const first = read();
    const firstSpent = spentIndices();

    window.__dustAndDeadTest.shootOnce();
    const second = read();
    const secondSpent = spentIndices();
    const rack = document.getElementById("ammo-cartridge-rack");

    return {
      playerX: setup.player.x,
      layout: rack.dataset.layout,
      rows: Array.from(rack.querySelectorAll(".ammo-round")).map((round) => round.dataset.row || ""),
      firstProjectile: first.projectiles[0],
      secondProjectile: second.projectiles[1],
      firstSpent,
      secondSpent,
      ammoCurrent: second.ammo.weapons.revolver.current,
    };
  });

  expect(result.layout).toBe("dual");
  expect(result.rows.slice(0, 6).every((row) => row === "top")).toBe(true);
  expect(result.rows.slice(6).every((row) => row === "bottom")).toBe(true);
  expect(result.firstProjectile.muzzleSide).toBe(-1);
  expect(result.secondProjectile.muzzleSide).toBe(1);
  expect(result.firstProjectile.x).toBeLessThan(result.playerX);
  expect(result.secondProjectile.x).toBeGreaterThan(result.playerX);
  expect(result.firstSpent).toEqual([5]);
  expect(result.secondSpent).toEqual([5, 11]);
  expect(result.ammoCurrent).toBe(10);
});

test("all right all left gives dual revolvers separate cylinders and free reload rounds", async ({ page }) => {
  await startHunt(page, `mapSeed=7`);
  await page.waitForFunction(() => typeof window.advanceTime === "function" && typeof window.render_game_to_text === "function");

  const result = await page.evaluate(() => {
    const read = () => JSON.parse(window.render_game_to_text());
    const spentIndices = () =>
      Array.from(document.querySelectorAll("#ammo-cartridge-rack .ammo-round"))
        .filter((round) => round.classList.contains("is-spent"))
        .map((round) => Number(round.dataset.index));
    const forceUpgrade = (id) => {
      const state = read();
      window.__dustAndDeadTest.grantXp(state.progression.xpToNext);
      const forced = window.__dustAndDeadTest.forceStandardUpgrade(id);
      if (!forced) throw new Error(`Could not force ${id}`);
      return read();
    };

    window.__dustAndDeadTest.clearEnemies();
    window.__dustAndDeadTest.grantXp(240);
    window.__dustAndDeadTest.chooseClass("gunslinger");
    window.__dustAndDeadTest.forceAllStandardUpgrades("swiftBoots");
    window.__dustAndDeadTest.grantXp(1200);
    window.__dustAndDeadTest.chooseRevolverUpgrade("dualRevolvers");
    window.__dustAndDeadTest.forceAllStandardUpgrades("swiftBoots");
    forceUpgrade("allRightAllLeft");

    const afterPerk = read();
    const rackAfterPerk = document.getElementById("ammo-cartridge-rack");
    window.__dustAndDeadTest.setAmmo("revolver", 12, 2);
    const setup = read();
    window.__dustAndDeadTest.clearEnemies();
    window.__dustAndDeadTest.setAimTarget(setup.player.x + 20, setup.player.z);
    for (let i = 0; i < 6; i++) window.__dustAndDeadTest.shootOnce();
    const afterRightEmpty = read();
    const rightEmptySpent = spentIndices();
    const firstSixProjectiles = afterRightEmpty.projectiles.slice(0, 6);

    window.__dustAndDeadTest.setAimTarget(setup.player.x, setup.player.z + 20);
    const beforeKills = read();
    for (let i = 0; i < 5; i++) {
      const state = read();
      window.__dustAndDeadTest.spawnZombieAt("walker", state.player.x, state.player.z + 4);
      window.__dustAndDeadTest.shootOnce();
      window.advanceTime(200);
    }
    const afterKills = read();
    window.advanceTime(550);
    const afterReload = read();
    const rack = document.getElementById("ammo-cartridge-rack");

    return {
      afterPerk,
      layoutAfterPerk: rackAfterPerk.dataset.layout,
      rows: Array.from(rack.querySelectorAll(".ammo-round")).map((round) => round.dataset.row || ""),
      firstSixSides: firstSixProjectiles.map((projectile) => projectile.muzzleSide),
      firstSixHands: firstSixProjectiles.map((projectile) => projectile.dualHand),
      rightEmptySpent,
      beforeKills,
      afterRightEmpty,
      afterKills,
      afterReload,
      finalStatus: document.getElementById("ammo-status").textContent,
      finalLayout: rack.dataset.layout,
    };
  });

  expect(result.afterPerk.progression.upgrades.allRightAllLeft).toBe(1);
  expect(result.afterPerk.progression.revolverSpecial.allRightAllLeft).toBe(true);
  expect(result.layoutAfterPerk).toBe("dual-hands");
  expect(result.finalLayout).toBe("dual-hands");
  expect(result.rows.slice(0, 6).every((row) => row === "top")).toBe(true);
  expect(result.rows.slice(6).every((row) => row === "bottom")).toBe(true);
  expect(result.firstSixSides.every((side) => side === -1)).toBe(true);
  expect(result.firstSixHands.every((hand) => hand === "right")).toBe(true);
  expect(result.rightEmptySpent).toEqual([0, 1, 2, 3, 4, 5]);
  expect(result.afterRightEmpty.ammo.weapons.revolver.current).toBe(6);
  expect(result.afterRightEmpty.ammo.weapons.revolver.dualHands.active).toBe("left");
  expect(result.afterRightEmpty.ammo.weapons.revolver.dualHands.right.current).toBe(0);
  expect(result.afterRightEmpty.ammo.weapons.revolver.dualHands.right.reloading).toBe(true);
  expect(result.afterRightEmpty.ammo.weapons.revolver.dualHands.left.current).toBe(6);
  expect(result.afterKills.kills - result.beforeKills.kills).toBe(5);
  expect(result.afterKills.ammo.weapons.revolver.dualHands.right.freeReloads).toBe(4);
  expect(result.afterKills.progression.revolverSpecial.dualFreeReloadsEarned).toBe(4);
  expect(result.afterReload.ammo.weapons.revolver.dualHands.right.current).toBe(6);
  expect(result.afterReload.ammo.weapons.revolver.dualHands.right.reloading).toBe(false);
  expect(result.afterReload.ammo.weapons.revolver.dualHands.right.freeReloads).toBe(0);
  expect(result.afterReload.ammo.weapons.revolver.dualHands.left.current).toBe(1);
  expect(result.afterReload.ammo.weapons.revolver.reserve).toBe(0);
  expect(result.afterReload.ammo.weapons.revolver.current).toBe(7);
  expect(result.finalStatus).toContain("R 6/6");
  expect(result.finalStatus).toContain("L 1/6");
});

test("waves advance on low remaining enemies and hard time limit", async ({ page }) => {
  await startHunt(page, `mapSeed=7`);
  await page.waitForFunction(() => typeof window.advanceTime === "function" && typeof window.render_game_to_text === "function");

  const result = await page.evaluate(() => {
    const read = () => JSON.parse(window.render_game_to_text());
    const advanceSeconds = (seconds) => {
      for (let i = 0; i < seconds; i++) window.advanceTime(1000);
      return read();
    };

    const lowSetup = window.__dustAndDeadTest.forceWaveState(6, 4, 0);
    const lowAfter9 = advanceSeconds(9);
    const lowAfter11 = advanceSeconds(2);

    const earlyPressure = window.__dustAndDeadTest.forceWaveState(4, 0, 0);
    const postFourPressure = window.__dustAndDeadTest.forceWaveState(5, 0, 0);

    const hardSetup = window.__dustAndDeadTest.forceWaveState(8, 0, 12);
    for (let i = 0; i < 29; i++) window.advanceTime(4000);
    const hardBefore = read();
    window.advanceTime(4000);
    const hardAfter = read();

    return { lowSetup, lowAfter9, lowAfter11, earlyPressure, postFourPressure, hardSetup, hardBefore, hardAfter };
  });

  expect(result.lowSetup.waveRemaining).toBe(4);
  expect(result.lowAfter9.wave).toBe(6);
  expect(result.lowAfter9.waveLowRemainingTimer).toBeGreaterThan(0);
  expect(result.lowAfter11.wave).toBe(7);
  expect(result.earlyPressure.waveSpawnTarget).toBe(39);
  expect(result.earlyPressure.spawnBatchSize).toBe(1);
  expect(result.postFourPressure.waveSpawnTarget).toBe(75);
  expect(result.postFourPressure.spawnBatchSize).toBe(2);
  expect(result.postFourPressure.spawnInterval).toBeLessThan(result.earlyPressure.spawnInterval);
  expect(result.hardSetup.waveRemaining).toBe(12);
  expect(result.hardBefore.wave).toBe(8);
  expect(result.hardBefore.waveElapsed).toBeGreaterThanOrEqual(115);
  expect(result.hardAfter.wave).toBe(9);
});

test("level-up card centers stay aligned", async ({ page }) => {
  await startHunt(page, `mapSeed=7`);
  await page.waitForFunction(() => typeof window.advanceTime === "function" && typeof window.render_game_to_text === "function");

  const measureCenters = () =>
    page.evaluate(() => {
      const panel = document.getElementById("level-up-choice").getBoundingClientRect();
      return Array.from(document.querySelectorAll("#level-up-options .class-card__mark")).map((mark) => {
        const rect = mark.getBoundingClientRect();
        return Number((rect.top + rect.height / 2 - panel.top).toFixed(2));
      });
    });
  const readUpgradeIcons = () =>
    page.evaluate(() =>
      Array.from(document.querySelectorAll("#level-up-options .upgrade-card__symbol")).map((symbol) => ({
        text: symbol.textContent.trim(),
        svgCount: symbol.querySelectorAll("svg").length,
        shapeCount: symbol.querySelectorAll("path,circle,line,polyline,polygon,rect").length,
      }))
    );

  await page.evaluate(() => {
    const state = JSON.parse(window.render_game_to_text());
    window.__dustAndDeadTest.grantXp(state.progression.xpToNext);
  });
  let centers = await measureCenters();
  expect(Math.max(...centers) - Math.min(...centers)).toBeLessThanOrEqual(1);
  let icons = await readUpgradeIcons();
  expect(icons.every((icon) => icon.text === "")).toBe(true);
  expect(icons.every((icon) => icon.svgCount === 1 && icon.shapeCount > 0)).toBe(true);
  const swiftBootsIcon = await page.evaluate(() => window.__dustAndDeadTest.getUpgradeIconDiagnostics("swiftBoots"));
  expect(swiftBootsIcon.text).toBe("");
  expect(swiftBootsIcon.svgCount).toBe(1);
  expect(swiftBootsIcon.shapeCount).toBe(1);
  expect(swiftBootsIcon.pathCount).toBe(1);
  expect(swiftBootsIcon.circleCount).toBe(0);
  expect(swiftBootsIcon.viewBox).toBe("0 0 128 128");

  await page.evaluate(() => {
    const read = () => JSON.parse(window.render_game_to_text());
    const levelOnce = () => {
      const state = read();
      window.__dustAndDeadTest.grantXp(state.progression.xpToNext);
      return read();
    };
    window.__dustAndDeadTest.forceStandardUpgrade("swiftBoots");
    while (read().progression.level < 5) {
      levelOnce();
      if (read().mode === "level-up") window.__dustAndDeadTest.forceStandardUpgrade("swiftBoots");
    }
    window.__dustAndDeadTest.chooseClass("gunslinger");
    while (read().progression.level < 10) {
      levelOnce();
      if (read().mode === "level-up") window.__dustAndDeadTest.forceStandardUpgrade("swiftBoots");
    }
    window.__dustAndDeadTest.chooseRevolverUpgrade("dualRevolvers");
    while (read().progression.level < 12) {
      levelOnce();
      if (read().mode === "level-up") window.__dustAndDeadTest.forceStandardUpgrade("swiftBoots");
    }
    levelOnce();
  });
  centers = await measureCenters();
  expect(Math.max(...centers) - Math.min(...centers)).toBeLessThanOrEqual(1);
  icons = await readUpgradeIcons();
  expect(icons.every((icon) => icon.text === "")).toBe(true);
  expect(icons.every((icon) => icon.svgCount === 1 && icon.shapeCount > 0)).toBe(true);
});

test("choice cards fit phone landscape screens without scrolling", async ({ page }) => {
  await page.setViewportSize({ width: 667, height: 375 });

  const assertPanelFits = async (selector) => {
    const metrics = await page.evaluate((selector) => {
      const panel = document.querySelector(selector);
      const rect = panel.getBoundingClientRect();
      const cards = Array.from(panel.querySelectorAll(".class-card")).map((card) => {
        const cardRect = card.getBoundingClientRect();
        const title = card.querySelector("strong");
        const description = card.querySelector(":scope > span:not(.class-card__mark)");
        const descriptionRect = description.getBoundingClientRect();
        return {
          height: cardRect.height,
          bottom: cardRect.bottom,
          titleFont: parseFloat(getComputedStyle(title).fontSize),
          descriptionFont: parseFloat(getComputedStyle(description).fontSize),
          descriptionBottom: descriptionRect.bottom,
          descriptionScrollHeight: description.scrollHeight,
          descriptionClientHeight: description.clientHeight,
        };
      });
      return {
        top: rect.top,
        bottom: rect.bottom,
        viewportHeight: window.innerHeight,
        scrollHeight: panel.scrollHeight,
        clientHeight: panel.clientHeight,
        cards,
      };
    }, selector);
    expect(metrics.top, `${selector} top should stay on screen`).toBeGreaterThanOrEqual(0);
    expect(metrics.bottom, `${selector} bottom should stay on screen`).toBeLessThanOrEqual(metrics.viewportHeight);
    expect(metrics.scrollHeight, `${selector} should not need internal vertical scrolling`).toBeLessThanOrEqual(metrics.clientHeight + 1);
    expect(Math.min(...metrics.cards.map((card) => card.height)), `${selector} cards should remain tappable`).toBeGreaterThanOrEqual(156);
    expect(Math.min(...metrics.cards.map((card) => card.titleFont)), `${selector} titles should remain readable`).toBeGreaterThanOrEqual(17);
    expect(Math.min(...metrics.cards.map((card) => card.descriptionFont)), `${selector} descriptions should remain readable`).toBeGreaterThanOrEqual(12);
    for (const card of metrics.cards) {
      expect(card.descriptionBottom, `${selector} description should stay inside its card`).toBeLessThanOrEqual(card.bottom - 8);
      expect(card.descriptionScrollHeight, `${selector} description should not be clipped`).toBeLessThanOrEqual(card.descriptionClientHeight + 1);
    }
  };

  await startHunt(page, `mapSeed=7`);
  await page.waitForFunction(() => typeof window.advanceTime === "function" && typeof window.render_game_to_text === "function");

  await page.evaluate(() => {
    const state = JSON.parse(window.render_game_to_text());
    window.__dustAndDeadTest.grantXp(state.progression.xpToNext);
  });
  await assertPanelFits("#level-up-choice");
  const iconVectorEffects = await page.evaluate(() =>
    Array.from(document.querySelectorAll("#level-up-options .upgrade-card__icon *")).map((shape) => getComputedStyle(shape).vectorEffect)
  );
  expect(iconVectorEffects.length).toBeGreaterThan(0);
  expect(iconVectorEffects.every((value) => value === "none")).toBe(true);

  await startHunt(page, `mapSeed=7`);
  await page.waitForFunction(() => typeof window.advanceTime === "function" && typeof window.render_game_to_text === "function");
  await page.evaluate(() => {
    window.__dustAndDeadTest.clearEnemies();
    window.__dustAndDeadTest.grantXp(240);
  });
  await assertPanelFits("#class-choice");

  await page.evaluate(() => {
    window.__dustAndDeadTest.chooseClass("gunslinger");
    window.__dustAndDeadTest.forceAllStandardUpgrades("swiftBoots");
    window.__dustAndDeadTest.grantXp(1200);
  });
  await assertPanelFits("#revolver-upgrade");

  for (const flow of [
    { playerClass: "ranger", panel: "#rifle-upgrade" },
    { playerClass: "demolitionist", panel: "#launcher-upgrade" },
  ]) {
    await startHunt(page, `mapSeed=7&phone=${flow.playerClass}`);
    await page.waitForFunction(() => typeof window.advanceTime === "function" && typeof window.render_game_to_text === "function");
    await page.evaluate((playerClass) => {
      window.__dustAndDeadTest.clearEnemies();
      window.__dustAndDeadTest.grantXp(240);
      window.__dustAndDeadTest.chooseClass(playerClass);
      window.__dustAndDeadTest.forceAllStandardUpgrades("swiftBoots");
      window.__dustAndDeadTest.grantXp(1200);
    }, flow.playerClass);
    await assertPanelFits(flow.panel);
  }

  await startHunt(page, `mapSeed=7&phone=marshal`);
  await page.waitForFunction(() => typeof window.advanceTime === "function" && typeof window.render_game_to_text === "function");
  await page.evaluate(() => {
    window.__dustAndDeadTest.clearEnemies();
    window.__dustAndDeadTest.grantXp(240);
    window.__dustAndDeadTest.chooseClass("marshal");
    window.__dustAndDeadTest.forceAllStandardUpgrades("swiftBoots");
    window.__dustAndDeadTest.grantXp(1200);
  });
  await assertPanelFits("#marshal-upgrade");
});

test("silver bullet upgrade description fits phone landscape cards", async ({ page }) => {
  await page.setViewportSize({ width: 667, height: 375 });
  await startHunt(page, `mapSeed=7`);
  await page.waitForFunction(() => typeof window.advanceTime === "function" && typeof window.render_game_to_text === "function");

  const metrics = await page.evaluate(() => {
    const read = () => JSON.parse(window.render_game_to_text());
    window.__dustAndDeadTest.clearEnemies();
    window.__dustAndDeadTest.previewUpgradeCards(["silverBullet", "leadBloom", "biggerCaliber"]);

    const card = document.querySelector('[data-standard-upgrade="silverBullet"]');
    const descriptionSpans = Array.from(card.querySelectorAll(":scope > span:not(.class-card__mark)"));
    const description = descriptionSpans[descriptionSpans.length - 1];
    const cardRect = card.getBoundingClientRect();
    const descriptionRect = description.getBoundingClientRect();
    const panel = document.getElementById("level-up-choice");

    return {
      mode: read().mode,
      choices: read().progression.standardUpgradeChoices,
      text: description.textContent,
      cardBottom: cardRect.bottom,
      descriptionBottom: descriptionRect.bottom,
      descriptionScrollHeight: description.scrollHeight,
      descriptionClientHeight: description.clientHeight,
      panelScrollHeight: panel.scrollHeight,
      panelClientHeight: panel.clientHeight,
    };
  });

  expect(metrics.mode).toBe("level-up");
  expect(metrics.choices).toContain("silverBullet");
  expect(metrics.text).toBe("Last Big Iron round: x3 damage, x1.5 size, x1.3 speed.");
  expect(metrics.descriptionBottom).toBeLessThanOrEqual(metrics.cardBottom - 10);
  expect(metrics.descriptionScrollHeight).toBeLessThanOrEqual(metrics.descriptionClientHeight + 1);
  expect(metrics.panelScrollHeight).toBeLessThanOrEqual(metrics.panelClientHeight + 1);
});

test("long upgrade descriptions stay readable on desktop and phone landscape", async ({ page }) => {
  const viewports = [
    { width: 1440, height: 900, titleFont: 24, descriptionFont: 16 },
    { width: 844, height: 390, titleFont: 18, descriptionFont: 12.5 },
    { width: 667, height: 375, titleFont: 17, descriptionFont: 12 },
  ];

  await page.setViewportSize(viewports[0]);
  await startHunt(page, `mapSeed=7`);
  await page.waitForFunction(() => typeof window.render_game_to_text === "function");
  await page.evaluate(() => {
    window.__dustAndDeadTest.clearEnemies();
    window.__dustAndDeadTest.previewUpgradeCards(["lastRites", "purifyingSalt", "bonebreaker"]);
  });

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    const metrics = await page.evaluate(() => {
      const panel = document.getElementById("level-up-choice");
      const panelRect = panel.getBoundingClientRect();
      const cards = Array.from(panel.querySelectorAll(".upgrade-card")).map((card) => {
        const cardRect = card.getBoundingClientRect();
        const title = card.querySelector("strong");
        const description = card.querySelector(":scope > span:not(.class-card__mark)");
        const descriptionRect = description.getBoundingClientRect();
        return {
          cardBottom: cardRect.bottom,
          titleFont: parseFloat(getComputedStyle(title).fontSize),
          descriptionFont: parseFloat(getComputedStyle(description).fontSize),
          descriptionLetterSpacing: parseFloat(getComputedStyle(description).letterSpacing),
          descriptionBottom: descriptionRect.bottom,
          descriptionScrollHeight: description.scrollHeight,
          descriptionClientHeight: description.clientHeight,
          horizontalOverflow: card.scrollWidth - card.clientWidth,
        };
      });
      return {
        panelTop: panelRect.top,
        panelBottom: panelRect.bottom,
        panelScrollHeight: panel.scrollHeight,
        panelClientHeight: panel.clientHeight,
        viewportHeight: window.innerHeight,
        documentHorizontalOverflow: document.documentElement.scrollWidth - window.innerWidth,
        cards,
      };
    });

    expect(metrics.panelTop).toBeGreaterThanOrEqual(0);
    expect(metrics.panelBottom).toBeLessThanOrEqual(metrics.viewportHeight);
    expect(metrics.panelScrollHeight).toBeLessThanOrEqual(metrics.panelClientHeight + 1);
    expect(metrics.documentHorizontalOverflow).toBeLessThanOrEqual(1);
    expect(metrics.cards).toHaveLength(3);
    for (const card of metrics.cards) {
      expect(card.titleFont).toBeGreaterThanOrEqual(viewport.titleFont);
      expect(card.descriptionFont).toBeGreaterThanOrEqual(viewport.descriptionFont);
      expect(card.descriptionLetterSpacing).toBeLessThanOrEqual(0.2);
      expect(card.descriptionBottom).toBeLessThanOrEqual(card.cardBottom - 8);
      expect(card.descriptionScrollHeight).toBeLessThanOrEqual(card.descriptionClientHeight + 1);
      expect(card.horizontalOverflow).toBeLessThanOrEqual(1);
    }
  }
});

test("standard level-up cards apply run upgrades", async ({ page }) => {
  await startHunt(page, `mapSeed=7`);
  await page.waitForFunction(() => typeof window.advanceTime === "function" && typeof window.render_game_to_text === "function");

  const result = await page.evaluate(() => {
    const read = () => JSON.parse(window.render_game_to_text());
    const grantNextLevel = () => {
      const state = read();
      window.__dustAndDeadTest.grantXp(state.progression.xpToNext);
      return read();
    };
    const forceNextStandardUpgrade = (id) => {
      grantNextLevel();
      const forced = window.__dustAndDeadTest.forceStandardUpgrade(id);
      if (!forced) throw new Error(`Could not force standard upgrade ${id}`);
      return read();
    };

    window.__dustAndDeadTest.clearEnemies();
    const before = read();

    const afterSwiftOne = forceNextStandardUpgrade("swiftBoots");
    const afterDamage = forceNextStandardUpgrade("steadyHand");
    const afterReload = forceNextStandardUpgrade("quickReload");

    grantNextLevel();
    const choseClass = window.__dustAndDeadTest.chooseClass("ranger");
    if (!choseClass) throw new Error("Could not choose ranger class");
    const afterClass = read();

    const afterRegenUpgrade = forceNextStandardUpgrade("desertMender");
    window.__dustAndDeadTest.clearEnemies();
    window.__dustAndDeadTest.setPlayerHp(90);
    const beforeRegen = read();
    window.advanceTime(1000);
    const afterRegen = read();

    const afterFireRate = forceNextStandardUpgrade("hairTrigger");
    const afterScavenger = forceNextStandardUpgrade("scavengerLuck");
    window.__dustAndDeadTest.setAmmo("revolver", 0, 0);
    const beforeCrate = read();
    window.__dustAndDeadTest.spawnAmmoCrateAt(beforeCrate.player.x, beforeCrate.player.z);
    window.__dustAndDeadTest.collectNearestAmmoCrate();
    const afterCrate = read();

    const afterGrit = forceNextStandardUpgrade("grit");

    grantNextLevel();
    const levelTenOffer = read();
    const choseRifleBranch = window.__dustAndDeadTest.chooseRifleUpgrade("leverBarrage");
    if (!choseRifleBranch) throw new Error("Could not choose rifle branch at level 10");
    const afterRifleBranch = read();

    const afterMagnet = forceNextStandardUpgrade("luckyMagnet");

    const afterXpHunger = forceNextStandardUpgrade("xpHunger");
    const beforeSmallXpGrant = read();
    window.__dustAndDeadTest.grantXp(10);
    const afterSmallXpGrant = read();

    const afterRangeUpgrade = forceNextStandardUpgrade("longReach");
    const afterSwiftTwo = forceNextStandardUpgrade("swiftBoots");
    window.__dustAndDeadTest.buyWeapon("revolver");
    window.__dustAndDeadTest.setAmmo("revolver", afterSwiftTwo.ammo.weapons.revolver.magazine, 0);
    window.__dustAndDeadTest.setAimTarget(afterSwiftTwo.player.x, afterSwiftTwo.player.z + 40);
    window.__dustAndDeadTest.shootOnce();
    const afterLongReachShot = read();

    return {
      before,
      afterSwiftOne,
      afterDamage,
      afterReload,
      afterClass,
      afterRegenUpgrade,
      beforeRegen,
      afterRegen,
      afterFireRate,
      afterScavenger,
      afterCrate,
      afterGrit,
      levelTenOffer,
      afterRifleBranch,
      afterMagnet,
      afterXpHunger,
      beforeSmallXpGrant,
      afterSmallXpGrant,
      afterRangeUpgrade,
      afterSwiftTwo,
      afterLongReachShot,
    };
  });

  expect(result.afterSwiftOne.player.speed).toBeCloseTo(result.before.player.speed * 1.05, 2);
  expect(result.afterSwiftOne.progression.modifiers.moveSpeed).toBe(1.05);
  expect(result.afterDamage.ammo.weapons.revolver.damage).toBeCloseTo(1.1, 3);
  expect(result.afterDamage.progression.modifiers.damage).toBe(1.1);
  expect(result.afterReload.ammo.weapons.revolver.reloadTime).toBeLessThan(result.before.ammo.weapons.revolver.reloadTime);
  expect(result.afterReload.progression.modifiers.reloadSpeed).toBe(1.12);
  expect(result.afterClass.progression.playerClass).toBe("ranger");
  expect(result.beforeRegen.progression.modifiers.hpRegen).toBe(0.4);
  expect(result.afterRegen.player.hp).toBeGreaterThan(result.beforeRegen.player.hp);
  expect(result.afterFireRate.ammo.weapons.revolver.cooldown).toBeLessThan(result.before.ammo.weapons.revolver.cooldown);
  expect(result.afterFireRate.progression.modifiers.fireRate).toBe(1.08);
  expect(result.afterScavenger.progression.modifiers.ammoPickup).toBe(1.1);
  expect(result.afterCrate.ammo.weapons.revolver.reserve).toBe(40);
  expect(result.afterGrit.player.maxHp).toBe(result.before.player.maxHp + 15);
  expect(result.afterGrit.progression.modifiers.maxHpBonus).toBe(15);
  expect(result.levelTenOffer.mode).toBe("rifle-upgrade");
  expect(result.levelTenOffer.progression.rifleUpgradePending).toBe(true);
  expect(result.levelTenOffer.progression.revolverUpgradePending).toBe(false);
  expect(result.afterRifleBranch.progression.rifleUpgrade).toBe("leverBarrage");
  expect(result.afterMagnet.progression.modifiers.xpPickupRadius).toBeCloseTo(1.38, 2);
  expect(result.afterMagnet.progression.modifiers.xpAttractRadius).toBeCloseTo(9.38, 2);
  expect(result.afterXpHunger.progression.modifiers.xpGain).toBe(1.1);
  expect(result.afterSmallXpGrant.progression.totalXp - result.beforeSmallXpGrant.progression.totalXp).toBe(11);
  expect(result.afterRangeUpgrade.progression.modifiers.attackRange).toBe(1.1);
  expect(result.afterLongReachShot.projectiles[0].range).toBeCloseTo(24.24, 2);
  expect(result.afterSwiftTwo.progression.upgrades.swiftBoots).toBe(2);
  expect(result.afterSwiftTwo.progression.modifiers.moveSpeed).toBe(1.1);
  expect(result.afterSwiftTwo.player.speed).toBeCloseTo(result.before.player.speed * 1.1, 2);
  expect(result.afterSwiftTwo.progression.standardUpgradesChosen).toBe(11);
});

test("distant zombies catch up outside the visible camera", async ({ page }) => {
  const browserErrors = [];

  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));

  await startHunt(page, `mapSeed=7`);
  await page.waitForFunction(() => typeof window.advanceTime === "function" && typeof window.render_game_to_text === "function");

  const before = await page.evaluate(() => {
    window.__dustAndDeadTest.clearEnemies();
    const state = JSON.parse(window.render_game_to_text());
    const player = state.player;
    const enemy = window.__dustAndDeadTest.spawnZombieAt("walker", player.x + 130, player.z);
    return { player, enemy };
  });

  await page.evaluate(() => window.advanceTime(250));
  const state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  const enemy = state.enemies[0];
  const beforeDistance = Math.hypot(before.enemy.x - before.player.x, before.enemy.z - before.player.z);
  const afterDistance = Math.hypot(enemy.x - state.player.x, enemy.z - state.player.z);

  expect(state.enemyCount).toBe(1);
  expect(state.zombieTeleports).toBe(1);
  expect(enemy.teleports).toBe(1);
  expect(enemy.outsideView).toBe(true);
  expect(enemy.insideEnemyBounds).toBe(true);
  expect(enemy.blocked).toBe(false);
  expect(enemy.hasClearStep).toBe(true);
  expect(afterDistance).toBeLessThan(beforeDistance - 30);
  expect(afterDistance).toBeGreaterThan(10);
  expect(browserErrors).toEqual([]);
});

test("catch-up teleports only use clear zombie positions", async ({ page }) => {
  test.setTimeout(60000);
  const seeds = [1, 4, 7, 12, 18, 31];

  for (const seed of seeds) {
    await startHunt(page, `mapSeed=${seed}`);
    await page.waitForFunction(() => typeof window.advanceTime === "function" && typeof window.render_game_to_text === "function");

    const before = await page.evaluate(() => {
      window.__dustAndDeadTest.clearEnemies();
      const state = JSON.parse(window.render_game_to_text());
      const player = state.player;
      const farX = player.x < 0 ? player.x + 130 : player.x - 130;
      const enemy = window.__dustAndDeadTest.spawnZombieAt("walker", farX, player.z);
      return { player, enemy };
    });

    await page.evaluate(() => window.advanceTime(250));
    let state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
    let enemy = state.enemies[0];
    const beforeDistance = Math.hypot(before.enemy.x - before.player.x, before.enemy.z - before.player.z);
    const afterDistance = Math.hypot(enemy.x - state.player.x, enemy.z - state.player.z);

    expect(state.enemyCount, `enemy count after teleport for seed ${seed}`).toBe(1);
    expect(state.zombieTeleports, `teleport count for seed ${seed}`).toBe(1);
    expect(enemy.teleports, `enemy teleport count for seed ${seed}`).toBe(1);
    expect(enemy.outsideView, `outside view after teleport for seed ${seed}`).toBe(true);
    expect(enemy.insideEnemyBounds, `inside enemy bounds after teleport for seed ${seed}`).toBe(true);
    expect(enemy.blocked, `blocked after teleport for seed ${seed}`).toBe(false);
    expect(enemy.hasClearStep, `clear step after teleport for seed ${seed}`).toBe(true);
    expect(afterDistance, `catch-up distance for seed ${seed}`).toBeLessThan(beforeDistance - 30);

    await page.evaluate(() => window.advanceTime(1200));
    state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
    enemy = state.enemies[0];

    expect(state.enemyCount, `enemy count after moving for seed ${seed}`).toBe(1);
    expect(enemy.insideEnemyBounds, `inside enemy bounds after moving for seed ${seed}`).toBe(true);
    expect(enemy.blocked, `blocked after moving for seed ${seed}`).toBe(false);
    expect(enemy.hasClearStep, `clear step after moving for seed ${seed}`).toBe(true);
    expect(enemy.stuck, `stuck timer after moving for seed ${seed}`).toBeLessThan(0.55);
  }
});

test("zombie spawns and catch-up teleports distribute around the player", async ({ page }) => {
  await startHunt(page, `mapSeed=7`);
  await page.waitForFunction(() => typeof window.advanceTime === "function" && typeof window.render_game_to_text === "function");

  const spawned = await page.evaluate(() => {
    window.__dustAndDeadTest.clearEnemies();
    window.__dustAndDeadTest.forceWaveState(12, 0, 0);
    const sides = [];
    for (let i = 0; i < 16; i++) {
      sides.push(window.__dustAndDeadTest.spawnZombieNow().spawnSide);
    }
    const state = JSON.parse(window.render_game_to_text());
    return { sides, sideCounts: state.zombieSurround.sideCounts, enemyCount: state.enemyCount };
  });

  expect(spawned.enemyCount).toBe(16);
  expect(spawned.sideCounts.every((count) => count > 0)).toBe(true);
  expect(Math.max(...spawned.sideCounts) - Math.min(...spawned.sideCounts)).toBeLessThanOrEqual(2);

  const teleported = await page.evaluate(() => {
    window.__dustAndDeadTest.clearEnemies();
    const state = JSON.parse(window.render_game_to_text());
    const player = state.player;
    for (let i = 0; i < 8; i++) {
      window.__dustAndDeadTest.spawnZombieAt("walker", player.x + 130 + i * 1.4, player.z + (i - 3.5) * 1.6);
    }
    window.advanceTime(300);
    const after = JSON.parse(window.render_game_to_text());
    const spawnSideCounts = [0, 0, 0, 0];
    after.enemies.forEach((enemy) => {
      if (enemy.spawnSide !== null && enemy.spawnSide !== undefined) spawnSideCounts[enemy.spawnSide] += 1;
    });
    return {
      teleports: after.zombieTeleports,
      sideCounts: after.zombieSurround.sideCounts,
      spawnSideCounts,
      enemies: after.enemies,
    };
  });

  expect(teleported.teleports).toBe(8);
  expect(teleported.spawnSideCounts.every((count) => count > 0)).toBe(true);
  expect(Math.max(...teleported.spawnSideCounts) - Math.min(...teleported.spawnSideCounts)).toBeLessThanOrEqual(2);
  expect(teleported.sideCounts.every((count) => count > 0)).toBe(true);
  expect(teleported.enemies.every((enemy) => enemy.outsideView && enemy.insideEnemyBounds && !enemy.blocked && enemy.hasClearStep)).toBe(true);
});

test("natural zombie spawns remain hidden and distant when the player is at the arena edge", async ({ page }) => {
  await startHunt(page, `mapSeed=7`);
  await page.waitForFunction(() => typeof window.advanceTime === "function" && typeof window.render_game_to_text === "function");

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    game.clearEnemies();
    const player = game.setPlayerPosition(230, 190);
    const spawns = [];
    for (let index = 0; index < 16; index += 1) spawns.push(game.spawnZombieNow());
    return { player, spawns };
  });

  expect(result.spawns).toHaveLength(16);
  expect(result.spawns.every(Boolean)).toBe(true);
  expect(result.spawns.every((spawn) => spawn.outsideView)).toBe(true);
  expect(result.spawns.every((spawn) => spawn.nearestAlivePlayerDistance >= 20)).toBe(true);
  expect(result.spawns.every((spawn) => spawn.insideEnemyBounds && !spawn.blocked && spawn.hasClearStep)).toBe(true);
});

test("launcher lands on the aimed point within its max range", async ({ page }) => {
  await startHunt(page, `mapSeed=7`);
  await page.waitForFunction(() => typeof window.advanceTime === "function" && typeof window.render_game_to_text === "function");

  const setup = await page.evaluate(() => {
    window.__dustAndDeadTest.clearEnemies();
    window.__dustAndDeadTest.grantXp(240);
    window.__dustAndDeadTest.chooseClass("demolitionist");
    window.__dustAndDeadTest.forceAllStandardUpgrades("swiftBoots");
    window.__dustAndDeadTest.setAmmo("launcher", 3, 9);
    const state = JSON.parse(window.render_game_to_text());
    return { player: state.player };
  });

  const nearTarget = { x: setup.player.x + 9, z: setup.player.z };
  let shot = await page.evaluate((target) => {
    window.__dustAndDeadTest.setAimTarget(target.x, target.z);
    const fired = window.__dustAndDeadTest.shootOnce();
    const state = JSON.parse(window.render_game_to_text());
    return { fired, projectile: state.projectiles[0], bullets: state.bullets };
  }, nearTarget);

  expect(shot.fired).toBe(true);
  expect(shot.bullets).toBe(1);
  expect(shot.projectile.type).toBe("launcher");
  expect(shot.projectile.targetX).toBeCloseTo(nearTarget.x, 1);
  expect(shot.projectile.targetZ).toBeCloseTo(nearTarget.z, 1);

  await page.evaluate(() => window.advanceTime(900));
  let state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  expect(state.bullets).toBe(0);

  const farTarget = { x: state.player.x + 80, z: state.player.z };
  shot = await page.evaluate((target) => {
    window.__dustAndDeadTest.setAmmo("launcher", 3, 9);
    window.__dustAndDeadTest.setAimTarget(target.x, target.z);
    const fired = window.__dustAndDeadTest.shootOnce();
    const state = JSON.parse(window.render_game_to_text());
    return { fired, projectile: state.projectiles[0], player: state.player };
  }, farTarget);

  const maxRange = 22.5;
  expect(shot.fired).toBe(true);
  expect(shot.projectile.type).toBe("launcher");
  expect(shot.projectile.targetX).toBeCloseTo(shot.player.x + maxRange, 1);
  expect(shot.projectile.targetZ).toBeCloseTo(shot.player.z, 1);
  expect(shot.projectile.targetX).toBeLessThan(farTarget.x - 40);

  await page.evaluate(() => window.advanceTime(1500));
  state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  expect(state.bullets).toBe(0);
});

test("demolitionist gets a level ten launcher branch choice", async ({ page }) => {
  const branches = [
    { id: "bombardier", label: /Bombardier/, magazine: 6, launcherAmmoPickupBonus: 12, launcherCrateReserve: 37, icon: "launcher" },
    { id: "pyrotechnician", label: /Pyrotechnician/, magazine: 3, launcherAmmoPickupBonus: 9, launcherCrateReserve: 33, icon: "incendiaryShell" },
  ];

  for (const branch of branches) {
    await startHunt(page, `mapSeed=7&launcher=${branch.id}`);
    await page.waitForFunction(() => typeof window.advanceTime === "function" && typeof window.render_game_to_text === "function");

    let state = await page.evaluate(() => {
      window.__dustAndDeadTest.clearEnemies();
      window.__dustAndDeadTest.grantXp(240);
      return JSON.parse(window.render_game_to_text());
    });

    expect(state.mode, `class choice before ${branch.id}`).toBe("class-choice");
    expect(await page.evaluate(() => window.__dustAndDeadTest.chooseClass("demolitionist")), `choose demolitionist before ${branch.id}`).toBe(true);
    await page.evaluate(() => window.__dustAndDeadTest.forceAllStandardUpgrades("swiftBoots"));

    state = await page.evaluate(() => {
      window.__dustAndDeadTest.grantXp(1200);
      return JSON.parse(window.render_game_to_text());
    });

    expect(state.mode, `launcher upgrade choice for ${branch.id}`).toBe("launcher-upgrade");
    expect(state.progression.level, `level for ${branch.id}`).toBeGreaterThanOrEqual(10);
    expect(state.progression.launcherUpgradePending, `pending launcher upgrade for ${branch.id}`).toBe(true);
    await expect(page.getByRole("button", { name: branch.label })).toBeVisible();

    const centers = await page.evaluate(() => {
      const panel = document.getElementById("launcher-upgrade").getBoundingClientRect();
      return Array.from(document.querySelectorAll("#launcher-upgrade .class-card__mark")).map((mark) => {
        const rect = mark.getBoundingClientRect();
        return Number((rect.top + rect.height / 2 - panel.top).toFixed(2));
      });
    });
    expect(Math.max(...centers) - Math.min(...centers)).toBeLessThanOrEqual(1);
    const icon = await page.evaluate((id) => {
      const svg = document.querySelector(`[data-launcher-upgrade="${id}"] [data-weapon-icon]`);
      return {
        id: svg ? svg.getAttribute("data-weapon-icon") : null,
        shapeCount: svg ? svg.querySelectorAll("path,circle,line,polyline,polygon,rect").length : 0,
      };
    }, branch.id);
    expect(icon.id, `launcher branch icon for ${branch.id}`).toBe(branch.icon);
    expect(icon.shapeCount, `launcher branch icon shapes for ${branch.id}`).toBeGreaterThan(0);

    const chosen = await page.evaluate((id) => window.__dustAndDeadTest.chooseLauncherUpgrade(id), branch.id);
    expect(chosen, `choose launcher branch ${branch.id}`).toBe(true);
    await page.evaluate(() => window.__dustAndDeadTest.forceAllStandardUpgrades("swiftBoots"));
    state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));

    expect(state.mode, `mode after ${branch.id}`).toBe("playing");
    expect(state.progression.launcherUpgrade, `branch after ${branch.id}`).toBe(branch.id);
    expect(state.progression.launcherUpgradePending, `pending after ${branch.id}`).toBe(false);
    expect(state.progression.launcherSpecial.magazineMultiplier, `launcher magazine multiplier for ${branch.id}`).toBe(branch.id === "bombardier" ? 2 : 1);
    expect(state.ammo.weapons.launcher.magazine, `launcher magazine after ${branch.id}`).toBe(branch.magazine);
    expect(state.ammo.weapons.launcher.current, `launcher current ammo after ${branch.id}`).toBe(branch.magazine);
    expect(state.progression.launcherAmmoPickupBonus, `launcher crate branch bonus for ${branch.id}`).toBe(branch.launcherAmmoPickupBonus);
    expect(state.weapon, `weapon after ${branch.id}`).toBe("launcher");
    const launcherRack = await page.evaluate(() => {
      const rack = document.getElementById("ammo-cartridge-rack");
      const hud = document.getElementById("ammo-hud");
      const rackRect = rack.getBoundingClientRect();
      const hudRect = hud.getBoundingClientRect();
      return {
        weapon: rack.dataset.weapon,
        magazine: rack.dataset.magazine,
        largeMagazine: rack.dataset.largeMagazine,
        roundCount: rack.querySelectorAll(".ammo-round").length,
        fitsHud: rackRect.left >= hudRect.left && rackRect.right <= hudRect.right && rackRect.top >= hudRect.top && rackRect.bottom <= hudRect.bottom,
      };
    });
    expect(launcherRack.weapon, `ammo rack weapon for ${branch.id}`).toBe("launcher");
    expect(launcherRack.magazine, `ammo rack magazine for ${branch.id}`).toBe(String(branch.magazine));
    expect(launcherRack.roundCount, `ammo rack round count for ${branch.id}`).toBe(branch.magazine);
    expect(launcherRack.largeMagazine, `ammo rack large-mag flag for ${branch.id}`).toBe(branch.id === "bombardier" ? "true" : "false");
    expect(launcherRack.fitsHud, `ammo rack should fit HUD for ${branch.id}`).toBe(true);

    await page.evaluate(() => {
      const state = JSON.parse(window.render_game_to_text());
      window.__dustAndDeadTest.setAmmo("launcher", 0, 0);
      window.__dustAndDeadTest.spawnAmmoCrateAt(state.player.x, state.player.z);
      window.__dustAndDeadTest.collectNearestAmmoCrate();
    });
    state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
    expect(state.ammo.weapons.launcher.reserve, `launcher crate reserve after ${branch.id}`).toBe(branch.launcherCrateReserve);
  }
});

test("launcher explosion damage gains 20 percent before branch scaling without changing fire damage", async ({ page }) => {
  await startHunt(page, `mapSeed=7`);
  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const read = () => JSON.parse(window.render_game_to_text());
    game.clearEnemies();
    game.grantXp(240);
    game.chooseClass("demolitionist");
    game.forceAllStandardUpgrades("swiftBoots");
    game.grantXp(1200);
    const beforeBranch = read().progression.launcherSpecial;
    game.chooseLauncherUpgrade("pyrotechnician");
    const pyrotechnician = read().progression.launcherSpecial;
    game.setAmmo("launcher", 3, 9);
    const player = read().player;
    game.setAimTarget(player.x + 8, player.z);
    game.shootOnce();
    const shot = read().projectiles.find((projectile) => projectile.type === "launcher");
    return { beforeBranch, pyrotechnician, shot };
  });

  expect(result.beforeBranch.blastDamage).toBeCloseTo(4.8, 5);
  expect(result.beforeBranch.playerBlastCenterDamage).toBeCloseTo((24 + 4 * 2.2) * 1.2, 5);
  expect(result.pyrotechnician.blastDamage).toBeCloseTo(4.8, 5);
  expect(result.pyrotechnician.playerBlastCenterDamage).toBeCloseTo((24 + 4 * 2.2) * 1.2, 5);
  expect(result.shot.blastDamage).toBeCloseTo(4.8, 5);
  expect(result.beforeBranch.fireDamage).toBe(1);
  expect(result.pyrotechnician.fireDamage).toBe(1);
});

test("launcher branch specials appear every third level after ten", async ({ page }) => {
  const branchCases = [
    { branch: "bombardier", specialIds: new Set(["clusterCharge", "chainDetonation", "heavyPayload", "fullSalvo", "powderEcho", "madmansJourney"]) },
    { branch: "pyrotechnician", specialIds: new Set(["rollingFlame", "longBurn", "hotterFire", "scorchedEarth", "backdraft", "crossfireShells"]) },
  ];
  const standardIds = new Set(["swiftBoots", "steadyHand", "quickReload", "hairTrigger", "scavengerLuck", "grit", "desertMender", "luckyMagnet", "xpHunger", "longReach"]);

  for (const branchCase of branchCases) {
    await startHunt(page, `mapSeed=7&launcherSpecial=${branchCase.branch}`);
    await page.waitForFunction(() => typeof window.advanceTime === "function" && typeof window.render_game_to_text === "function");

    const state = await page.evaluate((branch) => {
      const read = () => JSON.parse(window.render_game_to_text());
      const levelOnce = () => {
        const state = read();
        window.__dustAndDeadTest.grantXp(state.progression.xpToNext);
        return read();
      };
      const takeNormal = () => window.__dustAndDeadTest.forceStandardUpgrade("swiftBoots");

      window.__dustAndDeadTest.clearEnemies();
      while (read().progression.level < 5) {
        levelOnce();
        if (read().mode === "level-up") takeNormal();
      }
      window.__dustAndDeadTest.chooseClass("demolitionist");
      while (read().progression.level < 10) {
        levelOnce();
        if (read().mode === "level-up") takeNormal();
      }
      window.__dustAndDeadTest.chooseLauncherUpgrade(branch);
      while (read().progression.level < 12) {
        levelOnce();
        if (read().mode === "level-up") takeNormal();
      }
      levelOnce();
      return read();
    }, branchCase.branch);

    const specialChoices = state.progression.standardUpgradeChoices.filter((id) => branchCase.specialIds.has(id));
    const standardChoices = state.progression.standardUpgradeChoices.filter((id) => standardIds.has(id));

    expect(state.mode, `mode for ${branchCase.branch}`).toBe("level-up");
    expect(state.progression.level, `level for ${branchCase.branch}`).toBe(13);
    expect(state.progression.launcherSpecialLevel, `special level for ${branchCase.branch}`).toBe(true);
    expect(state.progression.standardUpgradeChoices, `choices for ${branchCase.branch}`).toHaveLength(3);
    expect(specialChoices, `special choices for ${branchCase.branch}`).toHaveLength(2);
    expect(standardChoices, `standard choices for ${branchCase.branch}`).toHaveLength(1);

    const icons = await page.evaluate(() =>
      Array.from(document.querySelectorAll("#level-up-options .upgrade-card__symbol")).map((symbol) => ({
        text: symbol.textContent.trim(),
        svgCount: symbol.querySelectorAll("svg").length,
        shapeCount: symbol.querySelectorAll("path,circle,line,polyline,polygon,rect").length,
      }))
    );
    expect(icons.every((icon) => icon.text === "")).toBe(true);
    expect(icons.every((icon) => icon.svgCount === 1 && icon.shapeCount > 0)).toBe(true);

    const cardStyles = await page.evaluate(() =>
      Array.from(document.querySelectorAll("#level-up-options .upgrade-card")).map((card) => {
        const style = getComputedStyle(card);
        return {
          id: card.dataset.standardUpgrade,
          kind: card.dataset.upgradeKind,
          specialClass: card.classList.contains("upgrade-card--special"),
          animationName: style.animationName,
          backgroundImage: style.backgroundImage,
        };
      })
    );
    const specialCards = cardStyles.filter((card) => branchCase.specialIds.has(card.id));
    const standardCards = cardStyles.filter((card) => standardIds.has(card.id));
    expect(specialCards, `special styled cards for ${branchCase.branch}`).toHaveLength(2);
    expect(standardCards, `standard styled cards for ${branchCase.branch}`).toHaveLength(1);
    expect(specialCards.every((card) => card.kind === "special" && card.specialClass), `special class for ${branchCase.branch}`).toBe(true);
    expect(standardCards.every((card) => card.kind === "standard" && !card.specialClass), `standard class for ${branchCase.branch}`).toBe(true);
    expect(specialCards.every((card) => card.animationName.includes("specialUpgradeBorderFlow")), `special border animation for ${branchCase.branch}`).toBe(true);
    expect(specialCards.every((card) => card.animationName.includes("specialUpgradeGlow")), `special glow animation for ${branchCase.branch}`).toBe(true);
    expect(specialCards.every((card) => card.backgroundImage.includes("conic-gradient")), `special border gradient for ${branchCase.branch}`).toBe(true);
  }
});

test("heavy payload launcher explodes at its landing point instead of enemy contact", async ({ page }) => {
  await startHunt(page, `mapSeed=7`);
  await page.waitForFunction(() => typeof window.advanceTime === "function" && typeof window.render_game_to_text === "function");

  const result = await page.evaluate(() => {
    const read = () => JSON.parse(window.render_game_to_text());
    const forceUpgrade = (id) => {
      const state = read();
      window.__dustAndDeadTest.grantXp(state.progression.xpToNext);
      const forced = window.__dustAndDeadTest.forceStandardUpgrade(id);
      if (!forced) throw new Error(`Could not force ${id}`);
      return read();
    };

    window.__dustAndDeadTest.clearEnemies();
    window.__dustAndDeadTest.grantXp(240);
    window.__dustAndDeadTest.chooseClass("demolitionist");
    window.__dustAndDeadTest.forceAllStandardUpgrades("swiftBoots");
    window.__dustAndDeadTest.grantXp(1200);
    window.__dustAndDeadTest.chooseLauncherUpgrade("bombardier");
    window.__dustAndDeadTest.forceAllStandardUpgrades("swiftBoots");
    forceUpgrade("heavyPayload");

    window.__dustAndDeadTest.clearEnemies();
    window.__dustAndDeadTest.setAmmo("launcher", 1, 0);
    const setup = read();
    const blocker = window.__dustAndDeadTest.spawnZombieAt("walker", setup.player.x + 4, setup.player.z);
    const landing = window.__dustAndDeadTest.spawnZombieAt("walker", setup.player.x + 12, setup.player.z);
    window.__dustAndDeadTest.setAimTarget(landing.x, landing.z);
    const beforeShot = read();
    const fired = window.__dustAndDeadTest.shootOnce();
    const afterShot = read();
    window.advanceTime(1800);
    const afterExplosion = read();

    return { blocker, landing, beforeShot, fired, afterShot, afterExplosion };
  });

  expect(result.fired).toBe(true);
  expect(result.afterShot.projectiles[0].type).toBe("launcher");
  expect(result.afterShot.projectiles[0].airburstLanding).toBe(true);
  expect(result.afterShot.projectiles[0].targetX).toBeCloseTo(result.landing.x, 1);
  expect(result.afterShot.projectiles[0].targetZ).toBeCloseTo(result.landing.z, 1);
  expect(result.afterExplosion.bullets).toBe(0);
  expect(result.afterExplosion.kills - result.beforeShot.kills).toBe(1);
  expect(result.afterExplosion.enemyCount).toBe(1);
  expect(Math.hypot(result.afterExplosion.enemies[0].x - result.blocker.x, result.afterExplosion.enemies[0].z - result.blocker.z)).toBeLessThan(4.5);
  expect(Math.hypot(result.afterExplosion.enemies[0].x - result.landing.x, result.afterExplosion.enemies[0].z - result.landing.z)).toBeGreaterThan(6);
});

test("regular launcher explosions reuse pooled shockwave smoke light and particle effects", async ({ page }) => {
  await startHunt(page, `mapSeed=7`);
  await page.waitForFunction(() => typeof window.advanceTime === "function" && typeof window.render_game_to_text === "function");

  const result = await page.evaluate(() => {
    window.__dustAndDeadTest.clearEnemies();
    window.__dustAndDeadTest.clearFireHazards();
    window.__dustAndDeadTest.clearAcidHazards();
    window.__dustAndDeadTest.clearAmmoCrates();
    window.__dustAndDeadTest.clearLauncherExplosionSamples();
    window.__dustAndDeadTest.setAmmoCrateTimer(9999);

    const before = window.__dustAndDeadTest.getExplosionOptimizationStats();
    const beforeParticles = window.__dustAndDeadTest.getParticleOptimizationStats();
    const first = window.__dustAndDeadTest.triggerLauncherExplosionAt(12, 12, "main", 3.2, 5.5, { noFire: true });
    const duringFirst = window.__dustAndDeadTest.getExplosionOptimizationStats();
    const duringFirstParticles = window.__dustAndDeadTest.getParticleOptimizationStats();
    window.advanceTime(1800);
    const afterFirst = window.__dustAndDeadTest.getExplosionOptimizationStats();
    const afterFirstParticles = window.__dustAndDeadTest.getParticleOptimizationStats();
    const second = window.__dustAndDeadTest.triggerLauncherExplosionAt(15, 13, "main", 3.2, 5.5, { noFire: true });
    const duringSecond = window.__dustAndDeadTest.getExplosionOptimizationStats();
    const duringSecondParticles = window.__dustAndDeadTest.getParticleOptimizationStats();
    return { before, beforeParticles, first, duringFirst, duringFirstParticles, afterFirst, afterFirstParticles, second, duringSecond, duringSecondParticles };
  });

  expect(result.first.kind).toBe("main");
  expect(result.duringFirst.visuals.shockwaves.inUse).toBeGreaterThan(0);
  expect(result.duringFirst.visuals.smokePuffs.inUse).toBeGreaterThan(0);
  expect(result.duringFirst.visuals.lightFlashes.inUse).toBeGreaterThan(0);
  expect(result.duringFirstParticles.activeParticles).toBeGreaterThan(0);
  expect(result.duringFirstParticles.visuals.box.inUse).toBeGreaterThan(0);
  expect(result.afterFirst.shockwaves).toBe(0);
  expect(result.afterFirst.smoke).toBeLessThan(result.duringFirst.smoke);
  expect(result.afterFirst.lightFlashes).toBe(0);
  expect(result.afterFirstParticles.activeParticles).toBe(0);
  expect(result.duringSecond.visuals.shockwaves.created).toBe(result.before.visuals.shockwaves.created);
  expect(result.duringSecond.visuals.smokePuffs.created).toBe(result.before.visuals.smokePuffs.created);
  expect(result.duringSecond.visuals.lightFlashes.created).toBe(result.before.visuals.lightFlashes.created);
  expect(result.duringSecondParticles.visuals.box.created).toBe(result.beforeParticles.visuals.box.created);
});

test("bombardier cascade warmup preserves active wave state", async ({ page }) => {
  await startHunt(page, `mapSeed=7`);
  await page.waitForFunction(() => typeof window.advanceTime === "function" && typeof window.render_game_to_text === "function");

  const result = await page.evaluate(() => {
    const read = () => JSON.parse(window.render_game_to_text());
    window.__dustAndDeadTest.clearEnemies();
    window.__dustAndDeadTest.grantXp(240);
    window.__dustAndDeadTest.chooseClass("demolitionist");
    window.__dustAndDeadTest.forceAllStandardUpgrades("swiftBoots");
    window.__dustAndDeadTest.grantXp(1200);
    window.__dustAndDeadTest.chooseLauncherUpgrade("bombardier");
    window.__dustAndDeadTest.forceAllStandardUpgrades("swiftBoots");
    window.__dustAndDeadTest.forceWaveState(6, 6, 20);
    const before = read();
    for (let i = 0; i < 160 && read().progression.launcherSpecial.cascadeWarmup.pending; i++) {
      window.advanceTime(16);
    }
    const after = read();
    return {
      before,
      after,
      warmup: after.progression.launcherSpecial.cascadeWarmup,
      shrapnelResourceWarmup: after.progression.launcherSpecial.shrapnelResourceWarmup,
    };
  });

  expect(result.warmup.completed).toBe(true);
  expect(result.warmup.stage).toBe(10);
  expect(result.shrapnelResourceWarmup.completed).toBe(true);
  expect(result.shrapnelResourceWarmup.stage).toBe(7);
  expect(result.after.wave).toBe(result.before.wave);
  expect(result.after.enemies.length).toBe(result.before.enemies.length);
  expect(result.after.spawnLeft).toBe(result.before.spawnLeft);
  expect(result.after.kills).toBe(result.before.kills);
  expect(result.after.score).toBe(result.before.score);
  expect(result.after.progression.xp).toBe(result.before.progression.xp);
  expect(result.after.progression.launcherSpecial.chainDetonations).toBe(result.before.progression.launcherSpecial.chainDetonations);
  expect(result.after.progression.launcherSpecial.bomblets).toBe(result.before.progression.launcherSpecial.bomblets);
  expect(result.after.progression.launcherSpecial.shrapnelShots).toBe(result.before.progression.launcherSpecial.shrapnelShots);
  expect(result.after.progression.launcherSpecial.powderEchoes).toBe(result.before.progression.launcherSpecial.powderEchoes);
  expect(result.after.launcherExplosionSamples).toHaveLength(result.before.launcherExplosionSamples.length);
});

test("bombardier upgrades chain within its limit and refill launcher magazines", async ({ page }) => {
  await startHunt(page, `mapSeed=7`);
  await page.waitForFunction(() => typeof window.advanceTime === "function" && typeof window.render_game_to_text === "function");

  const result = await page.evaluate(() => {
    const read = () => JSON.parse(window.render_game_to_text());
    const forceUpgrade = (id) => {
      const state = read();
      window.__dustAndDeadTest.grantXp(state.progression.xpToNext);
      const forced = window.__dustAndDeadTest.forceStandardUpgrade(id);
      if (!forced) throw new Error(`Could not force ${id}`);
      return read();
    };

    window.__dustAndDeadTest.clearEnemies();
    window.__dustAndDeadTest.grantXp(240);
    window.__dustAndDeadTest.chooseClass("demolitionist");
    window.__dustAndDeadTest.forceAllStandardUpgrades("swiftBoots");
    window.__dustAndDeadTest.grantXp(1200);
    window.__dustAndDeadTest.chooseLauncherUpgrade("bombardier");
    window.__dustAndDeadTest.forceAllStandardUpgrades("swiftBoots");

    forceUpgrade("heavyPayload");
    forceUpgrade("fullSalvo");
    forceUpgrade("clusterCharge");
    forceUpgrade("chainDetonation");
    for (let i = 0; i < 8; i++) forceUpgrade("moreChainDetonations");
    forceUpgrade("shrapnelRain");
    forceUpgrade("powderEcho");
    const afterUpgrades = read();

    window.__dustAndDeadTest.clearEnemies();
    window.__dustAndDeadTest.setAmmo("launcher", 3, 0);
    const setup = read();
    window.__dustAndDeadTest.setAimTarget(setup.player.x + 12, setup.player.z - 12);
    window.__dustAndDeadTest.shootOnce();
    window.advanceTime(1200);
    window.__dustAndDeadTest.setAimTarget(setup.player.x - 12, setup.player.z - 12);
    window.__dustAndDeadTest.shootOnce();
    window.advanceTime(1600);
    window.__dustAndDeadTest.clearLauncherExplosionSamples();
    window.__dustAndDeadTest.clearFireHazards();
    window.__dustAndDeadTest.clearEnemies();
    window.__dustAndDeadTest.setAmmo("launcher", 1, 0);
    const target = { x: setup.player.x, z: setup.player.z + 8 };
    window.__dustAndDeadTest.setAimTarget(target.x, target.z);
    for (let i = 0; i < 4; i++) {
      const offsetX = (i % 2 - 0.5) * 0.85;
      const offsetZ = Math.floor(i / 2) * 0.75;
      window.__dustAndDeadTest.spawnZombieAt("walker", target.x + offsetX, target.z + offsetZ);
    }
    const beforeShot = read();
    window.__dustAndDeadTest.shootOnce();
    const afterShot = read();
    window.advanceTime(1900);
    const afterExplosion = read();

    return { afterUpgrades, beforeShot, afterShot, afterExplosion, target };
  });

  expect(result.afterUpgrades.progression.launcherSpecial.chainDetonationLimit).toBe(10);
  expect(result.afterUpgrades.progression.launcherSpecial.magazineMultiplier).toBe(2);
  expect(result.afterUpgrades.ammo.weapons.launcher.magazine).toBe(6);
  expect(result.afterUpgrades.progression.upgrades.heavyPayload).toBe(1);
  expect(result.afterUpgrades.progression.upgrades.fullSalvo).toBe(1);
  expect(result.afterUpgrades.progression.upgrades.chainDetonation).toBe(1);
  expect(result.afterUpgrades.progression.upgrades.moreChainDetonations).toBe(8);
  expect(result.afterUpgrades.progression.launcherSpecial.fullSalvoKillThreshold).toBe(4);
  expect(result.afterUpgrades.progression.launcherSpecial.blastDamage).toBeCloseTo(7.2, 5);
  expect(result.afterUpgrades.progression.launcherSpecial.blastRadius).toBeGreaterThan(5);
  expect(result.afterShot.projectiles[0].blastRadius).toBeGreaterThan(5);
  expect(result.afterExplosion.kills - result.beforeShot.kills).toBeGreaterThanOrEqual(4);
  expect(result.afterExplosion.progression.launcherSpecial.chainDetonations).toBeGreaterThan(0);
  expect(result.afterExplosion.progression.launcherSpecial.chainDetonations).toBeLessThanOrEqual(10);
  expect(result.afterExplosion.progression.launcherSpecial.bomblets).toBeGreaterThan(0);
  expect(result.afterExplosion.progression.launcherSpecial.shrapnelShots).toBeGreaterThan(0);
  expect(result.afterExplosion.progression.launcherSpecial.powderEchoes).toBeGreaterThanOrEqual(3);
  expect(result.afterExplosion.progression.launcherSpecial.ammoRefills).toBeGreaterThan(0);
  expect(result.afterExplosion.ammo.weapons.launcher.current).toBe(result.afterExplosion.ammo.weapons.launcher.magazine);
  const echoSamples = result.afterExplosion.launcherExplosionSamples.filter((sample) => sample.kind === "echo");
  expect(echoSamples.length).toBeGreaterThanOrEqual(3);
  expect(Math.min(...echoSamples.map((sample) => Math.hypot(sample.x - result.target.x, sample.z - result.target.z)))).toBeGreaterThan(2.4);
  const echoPairDistances = [];
  for (let i = 0; i < echoSamples.length; i++) {
    for (let j = i + 1; j < echoSamples.length; j++) {
      echoPairDistances.push(Math.hypot(echoSamples[i].x - echoSamples[j].x, echoSamples[i].z - echoSamples[j].z));
    }
  }
  expect(Math.min(...echoPairDistances)).toBeGreaterThan(2);
  const clusterSamples = result.afterExplosion.launcherExplosionSamples.filter((sample) => sample.kind === "cluster");
  expect(clusterSamples.length).toBeGreaterThan(0);
  expect(Math.max(...clusterSamples.map((sample) => Math.hypot(sample.x - result.target.x, sample.z - result.target.z)))).toBeGreaterThan(2);
});

test("full salvo counts secondary explosions and shrapnel kills", async ({ page }) => {
  await startHunt(page, `mapSeed=7`);
  await page.waitForFunction(() => typeof window.advanceTime === "function" && typeof window.render_game_to_text === "function");

  const result = await page.evaluate(() => {
    const read = () => JSON.parse(window.render_game_to_text());
    const forceUpgrade = (id) => {
      const state = read();
      window.__dustAndDeadTest.grantXp(state.progression.xpToNext);
      const forced = window.__dustAndDeadTest.forceStandardUpgrade(id);
      if (!forced) throw new Error(`Could not force ${id}`);
      return read();
    };

    window.__dustAndDeadTest.clearEnemies();
    window.__dustAndDeadTest.grantXp(240);
    window.__dustAndDeadTest.chooseClass("demolitionist");
    window.__dustAndDeadTest.forceAllStandardUpgrades("swiftBoots");
    window.__dustAndDeadTest.grantXp(1200);
    window.__dustAndDeadTest.chooseLauncherUpgrade("bombardier");
    window.__dustAndDeadTest.forceAllStandardUpgrades("swiftBoots");

    forceUpgrade("fullSalvo");
    forceUpgrade("heavyPayload");
    forceUpgrade("shrapnelRain");
    const afterUpgrades = read();
    const center = { x: afterUpgrades.player.x, z: afterUpgrades.player.z + 9 };

    window.__dustAndDeadTest.clearEnemies();
    window.__dustAndDeadTest.setAmmo("launcher", 0, 0);
    for (let i = 0; i < 4; i++) {
      const angle = (Math.PI * 2 * i) / 4;
      window.__dustAndDeadTest.spawnZombieAt("runner", center.x + Math.sin(angle) * 0.75, center.z + Math.cos(angle) * 0.75);
    }
    const beforeSecondary = read();
    const secondaryTrigger = window.__dustAndDeadTest.triggerLauncherExplosionAt(center.x, center.z, "chain", 2.6, 4, { noShrapnel: true, noCluster: true });
    const afterSecondary = read();

    window.__dustAndDeadTest.clearEnemies();
    window.__dustAndDeadTest.setAmmo("launcher", 0, 0);
    const shrapnelCenter = { x: center.x + 11, z: center.z };
    for (let i = 0; i < 8; i++) {
      const angle = (Math.PI * 2 * i) / 8;
      window.__dustAndDeadTest.spawnZombieAt("runner", shrapnelCenter.x + Math.sin(angle) * 5.4, shrapnelCenter.z + Math.cos(angle) * 5.4);
    }
    const beforeShrapnel = read();
    const shrapnelTrigger = window.__dustAndDeadTest.triggerLauncherExplosionAt(shrapnelCenter.x, shrapnelCenter.z, "chain", 3.2, 0.1, { noCluster: true });
    window.advanceTime(900);
    const afterShrapnel = read();

    return {
      afterUpgrades,
      beforeSecondary,
      secondaryTrigger,
      afterSecondary,
      beforeShrapnel,
      shrapnelTrigger,
      afterShrapnel,
    };
  });

  expect(result.afterUpgrades.progression.upgrades.fullSalvo).toBe(1);
  expect(result.afterUpgrades.progression.launcherSpecial.fullSalvoKillThreshold).toBe(4);
  expect(result.secondaryTrigger.kind).toBe("chain");
  expect(result.secondaryTrigger.kills).toBeGreaterThanOrEqual(4);
  expect(result.afterSecondary.progression.launcherSpecial.ammoRefills - result.beforeSecondary.progression.launcherSpecial.ammoRefills).toBe(1);
  expect(result.afterSecondary.ammo.weapons.launcher.current).toBe(result.afterSecondary.ammo.weapons.launcher.magazine);
  expect(result.shrapnelTrigger.kind).toBe("chain");
  expect(result.shrapnelTrigger.kills).toBe(0);
  expect(result.afterShrapnel.kills - result.beforeShrapnel.kills).toBeGreaterThanOrEqual(4);
  expect(result.afterShrapnel.progression.launcherSpecial.ammoRefills - result.beforeShrapnel.progression.launcherSpecial.ammoRefills).toBe(1);
  expect(result.afterShrapnel.ammo.weapons.launcher.current).toBe(result.afterShrapnel.ammo.weapons.launcher.magazine);
});

test("madman's journey ramps bombardier fire rate after grenade multikills", async ({ page }) => {
  await startHunt(page, `mapSeed=7`);
  await page.waitForFunction(() => typeof window.advanceTime === "function" && typeof window.render_game_to_text === "function");

  const result = await page.evaluate(() => {
    const read = () => JSON.parse(window.render_game_to_text());
    const forceUpgrade = (id) => {
      const state = read();
      window.__dustAndDeadTest.grantXp(state.progression.xpToNext);
      const forced = window.__dustAndDeadTest.forceStandardUpgrade(id);
      if (!forced) throw new Error(`Could not force ${id}`);
      return read();
    };
    const fireMultikillGrenade = (offsetX, offsetZ) => {
      window.__dustAndDeadTest.clearEnemies();
      window.__dustAndDeadTest.setAmmo("launcher", 6, 0);
      const setup = read();
      const target = { x: setup.player.x + offsetX, z: setup.player.z + offsetZ };
      window.__dustAndDeadTest.setAimTarget(target.x, target.z);
      window.__dustAndDeadTest.spawnZombieAt("walker", target.x - 0.35, target.z);
      window.__dustAndDeadTest.spawnZombieAt("walker", target.x + 0.35, target.z);
      const beforeShot = read();
      const fired = window.__dustAndDeadTest.shootOnce();
      window.advanceTime(1500);
      const afterExplosion = read();
      return { fired, beforeShot, afterExplosion };
    };

    window.__dustAndDeadTest.clearEnemies();
    window.__dustAndDeadTest.grantXp(240);
    window.__dustAndDeadTest.chooseClass("demolitionist");
    window.__dustAndDeadTest.forceAllStandardUpgrades("swiftBoots");
    window.__dustAndDeadTest.grantXp(1200);
    window.__dustAndDeadTest.chooseLauncherUpgrade("bombardier");
    window.__dustAndDeadTest.forceAllStandardUpgrades("swiftBoots");
    const beforeUpgrade = read();
    const afterUpgrade = forceUpgrade("madmansJourney");
    const first = fireMultikillGrenade(0, 8);
    const second = fireMultikillGrenade(8, 0);
    const third = fireMultikillGrenade(0, -8);
    const fourth = fireMultikillGrenade(-8, 0);

    return { beforeUpgrade, afterUpgrade, first, second, third, fourth };
  });

  const baseCooldown = result.beforeUpgrade.ammo.weapons.launcher.cooldown;
  expect(result.afterUpgrade.progression.launcherUpgrade).toBe("bombardier");
  expect(result.afterUpgrade.progression.upgrades.madmansJourney).toBe(1);
  expect(result.afterUpgrade.progression.launcherSpecial.madmanStacks).toBe(0);
  expect(result.afterUpgrade.progression.launcherSpecial.madmanFireRate).toBe(1);

  expect(result.first.fired).toBe(true);
  expect(result.first.afterExplosion.kills - result.first.beforeShot.kills).toBeGreaterThanOrEqual(2);
  expect(result.first.afterExplosion.progression.launcherSpecial.madmanStacks).toBe(1);
  expect(result.first.afterExplosion.progression.launcherSpecial.madmanFireRate).toBe(1.5);
  expect(result.first.afterExplosion.ammo.weapons.launcher.cooldown).toBeCloseTo(baseCooldown / 1.5, 2);

  expect(result.second.afterExplosion.progression.launcherSpecial.madmanStacks).toBe(2);
  expect(result.second.afterExplosion.progression.launcherSpecial.madmanFireRate).toBe(2);
  expect(result.second.afterExplosion.ammo.weapons.launcher.cooldown).toBeCloseTo(baseCooldown / 2, 2);

  expect(result.third.afterExplosion.progression.launcherSpecial.madmanStacks).toBe(3);
  expect(result.third.afterExplosion.progression.launcherSpecial.madmanFireRate).toBe(2.5);
  expect(result.third.afterExplosion.ammo.weapons.launcher.cooldown).toBeCloseTo(baseCooldown / 2.5, 2);

  expect(result.fourth.afterExplosion.progression.launcherSpecial.madmanStacks).toBe(3);
  expect(result.fourth.afterExplosion.progression.launcherSpecial.madmanFireRate).toBe(2.5);
  expect(result.fourth.afterExplosion.progression.launcherSpecial.madmanTriggers).toBe(3);
  expect(result.fourth.afterExplosion.ammo.weapons.launcher.cooldown).toBeCloseTo(baseCooldown / 2.5, 2);
});

test("pyrotechnician upgrades leave fire trails and reward standing in fire", async ({ page }) => {
  await startHunt(page, `mapSeed=7`);
  await page.waitForFunction(() => typeof window.advanceTime === "function" && typeof window.render_game_to_text === "function");

  const result = await page.evaluate(() => {
    const read = () => JSON.parse(window.render_game_to_text());
    const forceUpgrade = (id) => {
      const state = read();
      window.__dustAndDeadTest.grantXp(state.progression.xpToNext);
      const forced = window.__dustAndDeadTest.forceStandardUpgrade(id);
      if (!forced) throw new Error(`Could not force ${id}`);
      return read();
    };

    window.__dustAndDeadTest.clearEnemies();
    window.__dustAndDeadTest.grantXp(240);
    window.__dustAndDeadTest.chooseClass("demolitionist");
    window.__dustAndDeadTest.forceAllStandardUpgrades("swiftBoots");
    window.__dustAndDeadTest.grantXp(1200);
    window.__dustAndDeadTest.chooseLauncherUpgrade("pyrotechnician");
    window.__dustAndDeadTest.forceAllStandardUpgrades("swiftBoots");

    forceUpgrade("rollingFlame");
    forceUpgrade("hotterFire");
    forceUpgrade("thermiteCore");
    forceUpgrade("longBurn");
    forceUpgrade("scorchedEarth");
    forceUpgrade("backdraft");
    const afterUpgrades = read();

    window.__dustAndDeadTest.clearEnemies();
    window.__dustAndDeadTest.clearFireHazards();
    window.__dustAndDeadTest.setAmmo("launcher", 3, 0);
    window.__dustAndDeadTest.setPlayerHp(70);
    const setup = read();
    window.__dustAndDeadTest.setAimTarget(setup.player.x, setup.player.z + 10);
    window.__dustAndDeadTest.shootOnce();
    const afterShot = read();
    window.advanceTime(900);
    const afterTrail = read();
    const firstFire = afterTrail.firePools[0];

    window.__dustAndDeadTest.setPlayerPosition(firstFire.x, firstFire.z);
    window.__dustAndDeadTest.setAmmo("launcher", 1, 0);
    window.__dustAndDeadTest.setPlayerHp(70);
    window.advanceTime(180);
    const beforeFreeShot = read();
    window.__dustAndDeadTest.shootOnce();
    const afterFreeShot = read();
    window.advanceTime(1200);
    const afterStanding = read();

    window.__dustAndDeadTest.clearEnemies();
    window.__dustAndDeadTest.clearFireHazards();
    window.__dustAndDeadTest.clearXpOrbs();
    window.__dustAndDeadTest.setPlayerPosition(setup.player.x - 12, setup.player.z - 12);
    const backdraftFire = window.__dustAndDeadTest.spawnFirePatchAt(setup.player.x + 3, setup.player.z, 0, 0);
    window.__dustAndDeadTest.spawnZombieAt("walker", backdraftFire.x, backdraftFire.z);
    window.advanceTime(1400);
    const afterBackdraft = read();

    return { afterUpgrades, afterShot, afterTrail, beforeFreeShot, afterFreeShot, afterStanding, afterBackdraft };
  });

  expect(result.afterUpgrades.progression.launcherUpgrade).toBe("pyrotechnician");
  expect(result.afterUpgrades.progression.launcherSpecial.magazineMultiplier).toBe(1);
  expect(result.afterUpgrades.ammo.weapons.launcher.magazine).toBe(3);
  expect(result.afterUpgrades.progression.upgrades.rollingFlame).toBe(1);
  expect(result.afterUpgrades.progression.upgrades.thermiteCore).toBe(1);
  expect(result.afterUpgrades.progression.upgrades.backdraft).toBe(1);
  expect(result.afterUpgrades.progression.upgrades.napalmShells || 0).toBe(0);
  expect(result.afterUpgrades.progression.upgrades.fireproofPowder || 0).toBe(0);
  expect(result.afterUpgrades.progression.launcherSpecial.firePuddlesDefault).toBe(true);
  expect(result.afterUpgrades.progression.launcherSpecial.fireBuffDefault).toBe(true);
  expect(result.afterUpgrades.progression.launcherSpecial.fireRadius).toBeGreaterThan(2.4);
  expect(result.afterUpgrades.progression.launcherSpecial.fireDamage).toBe(3);
  expect(result.afterUpgrades.progression.launcherSpecial.fireLife).toBeGreaterThan(14);
  expect(result.afterShot.projectiles[0].rollingFlame).toBe(true);
  expect(result.afterShot.progression.launcherSpecial.thermitePatches).toBe(1);
  expect(result.afterShot.firePools.some((pool) => pool.thermite && Math.hypot(pool.x - result.afterShot.player.x, pool.z - result.afterShot.player.z) < 0.8 && pool.radius > 2.4)).toBe(true);
  expect(result.afterTrail.firePatches).toBeGreaterThan(0);
  expect(result.afterTrail.firePools.some((pool) => pool.trail)).toBe(true);
  expect(result.afterTrail.firePools.some((pool) => !pool.trail)).toBe(true);
  expect(result.afterTrail.firePools.every((pool) => pool.visualParts >= 24)).toBe(true);
  expect(result.afterTrail.firePools.every((pool) => pool.flameBlocks >= 14)).toBe(true);
  expect(result.afterTrail.firePools.every((pool) => pool.cinders >= 5)).toBe(true);
  expect(result.beforeFreeShot.progression.launcherSpecial.fireBuffActive).toBe(true);
  expect(result.afterFreeShot.progression.launcherSpecial.freeShots).toBe(result.beforeFreeShot.progression.launcherSpecial.freeShots + 1);
  expect(result.afterFreeShot.ammo.weapons.launcher.current).toBe(result.beforeFreeShot.ammo.weapons.launcher.current);
  expect(result.afterStanding.player.hp).toBeGreaterThan(result.afterFreeShot.player.hp);
  expect(result.afterStanding.ammo.weapons.launcher.current).toBeGreaterThanOrEqual(result.afterFreeShot.ammo.weapons.launcher.current);
  expect(result.afterBackdraft.progression.launcherSpecial.backdrafts).toBeGreaterThan(0);
  expect(result.afterBackdraft.progression.launcherSpecial.fireBonusXp).toBeGreaterThanOrEqual(8);
  expect(result.afterBackdraft.firePools.some((pool) => pool.backdraft && pool.radius > 3)).toBe(true);
  expect(result.afterBackdraft.xpOrbs.map((orb) => orb.value).sort((a, b) => a - b)).toEqual([4, 8]);
});

test("fire patches keep full lifetime under heavy fire load and reuse pooled visuals", async ({ page }) => {
  await startHunt(page, `mapSeed=7`);
  await page.waitForFunction(() => typeof window.advanceTime === "function" && typeof window.render_game_to_text === "function");

  const result = await page.evaluate(() => {
    const read = () => JSON.parse(window.render_game_to_text());
    const forceUpgrade = (id) => {
      const state = read();
      window.__dustAndDeadTest.grantXp(state.progression.xpToNext);
      const forced = window.__dustAndDeadTest.forceStandardUpgrade(id);
      if (!forced) throw new Error(`Could not force ${id}`);
      return read();
    };

    window.__dustAndDeadTest.clearEnemies();
    window.__dustAndDeadTest.clearFireHazards();
    window.__dustAndDeadTest.grantXp(240);
    window.__dustAndDeadTest.chooseClass("demolitionist");
    window.__dustAndDeadTest.forceAllStandardUpgrades("swiftBoots");
    window.__dustAndDeadTest.grantXp(1200);
    window.__dustAndDeadTest.chooseLauncherUpgrade("pyrotechnician");
    window.__dustAndDeadTest.forceAllStandardUpgrades("swiftBoots");
    forceUpgrade("longBurn");

    const setup = read();
    const before = window.__dustAndDeadTest.getFireOptimizationStats();
    const beforeParticles = window.__dustAndDeadTest.getParticleOptimizationStats();
    const anchor = window.__dustAndDeadTest.spawnFirePatchAt(setup.player.x + 18, setup.player.z + 18, 0, 0);
    const afterAnchor = window.__dustAndDeadTest.getFireOptimizationStats();
    const afterAnchorParticles = window.__dustAndDeadTest.getParticleOptimizationStats();

    for (let i = 0; i < 110; i++) {
      window.__dustAndDeadTest.spawnFirePatchAt(
        setup.player.x + 28 + (i % 11) * 0.9,
        setup.player.z + 16 + Math.floor(i / 11) * 0.9,
        0.6,
        0.8
      );
    }

    const duringOverload = read();
    const anchorDuring = window.__dustAndDeadTest.findFirePatchNear(anchor.x, anchor.z, 0.9);
    window.advanceTime(1200);
    const afterWait = read();
    const anchorAfterWait = window.__dustAndDeadTest.findFirePatchNear(anchor.x, anchor.z, 0.9);

    window.__dustAndDeadTest.clearFireHazards();
    const afterClear = window.__dustAndDeadTest.getFireOptimizationStats();
    const reused = window.__dustAndDeadTest.spawnFirePatchAt(setup.player.x + 22, setup.player.z + 22, 0, 0);
    const afterReuse = window.__dustAndDeadTest.getFireOptimizationStats();

    return {
      setup,
      before,
      beforeParticles,
      afterAnchor,
      afterAnchorParticles,
      anchor,
      duringOverload,
      anchorDuring,
      afterWait,
      anchorAfterWait,
      afterClear,
      reused,
      afterReuse,
    };
  });

  expect(result.setup.progression.upgrades.longBurn).toBe(1);
  expect(result.setup.progression.launcherSpecial.fireLife).toBeGreaterThan(14);
  expect(result.duringOverload.firePatches).toBeGreaterThan(90);
  expect(result.anchorDuring).not.toBeNull();
  expect(result.anchorDuring.startLife).toBeCloseTo(result.setup.progression.launcherSpecial.fireLife, 1);
  expect(result.anchorAfterWait).not.toBeNull();
  expect(result.anchorAfterWait.life).toBeGreaterThan(result.setup.progression.launcherSpecial.fireLife - 1.6);
  expect(result.afterWait.firePatches).toBeGreaterThan(0);
  expect(result.afterAnchor.visuals.standard.inUse).toBeGreaterThan(result.before.visuals.standard.inUse);
  expect(result.afterAnchorParticles.activeParticles).toBeGreaterThan(result.beforeParticles.activeParticles);
  expect(result.afterAnchorParticles.visuals.box.created).toBe(result.beforeParticles.visuals.box.created);
  expect(result.duringOverload.optimization.particleVisualPools.box.inUse).toBeLessThanOrEqual(result.duringOverload.optimization.particleVisualPools.maxParticles);
  expect(result.duringOverload.optimization.particleVisualPools.box.created).toBe(result.beforeParticles.visuals.box.created);
  expect(result.afterClear.visuals.standard.available).toBeGreaterThan(0);
  expect(result.afterReuse.visuals.standard.created).toBe(result.afterClear.visuals.standard.created);
  expect(result.afterReuse.activePatches).toBe(1);
});

test("crossfire shells split pyrotechnician landings into burning side shards", async ({ page }) => {
  await startHunt(page, `mapSeed=7`);
  await page.waitForFunction(() => typeof window.advanceTime === "function" && typeof window.render_game_to_text === "function");

  const result = await page.evaluate(() => {
    const read = () => JSON.parse(window.render_game_to_text());
    const forceUpgrade = (id) => {
      const state = read();
      window.__dustAndDeadTest.grantXp(state.progression.xpToNext);
      const forced = window.__dustAndDeadTest.forceStandardUpgrade(id);
      if (!forced) throw new Error(`Could not force ${id}`);
      return read();
    };

    window.__dustAndDeadTest.clearEnemies();
    window.__dustAndDeadTest.grantXp(240);
    window.__dustAndDeadTest.chooseClass("demolitionist");
    window.__dustAndDeadTest.forceAllStandardUpgrades("swiftBoots");
    window.__dustAndDeadTest.grantXp(1200);
    window.__dustAndDeadTest.chooseLauncherUpgrade("pyrotechnician");
    window.__dustAndDeadTest.forceAllStandardUpgrades("swiftBoots");
    forceUpgrade("crossfireShells");
    const afterUpgrade = read();

    window.__dustAndDeadTest.clearEnemies();
    window.__dustAndDeadTest.clearFireHazards();
    window.__dustAndDeadTest.setAmmo("launcher", 1, 0);
    const setup = read();
    const target = { x: setup.player.x, z: setup.player.z + 10 };
    window.__dustAndDeadTest.spawnZombieAt("brute", target.x - 3, target.z);
    window.__dustAndDeadTest.spawnZombieAt("brute", target.x + 3, target.z);
    const beforeShot = read();
    window.__dustAndDeadTest.setAimTarget(target.x, target.z);
    const fired = window.__dustAndDeadTest.shootOnce();
    const afterShot = read();
    window.advanceTime(900);
    const afterSplit = read();
    window.advanceTime(1200);
    const afterFinish = read();

    return { afterUpgrade, beforeShot, fired, afterShot, afterSplit, afterFinish, target };
  });

  expect(result.afterUpgrade.progression.launcherUpgrade).toBe("pyrotechnician");
  expect(result.afterUpgrade.progression.upgrades.crossfireShells).toBe(1);
  expect(result.afterUpgrade.progression.launcherSpecial.crossfireRange).toBeGreaterThan(18);
  expect(result.afterUpgrade.progression.launcherSpecial.crossfireRange).toBeLessThan(result.afterUpgrade.ammo.weapons.launcher.range || 23);
  expect(result.fired).toBe(true);
  expect(result.afterShot.projectiles[0].type).toBe("launcher");

  const shards = result.afterSplit.projectiles.filter((projectile) => projectile.type === "launcherFireShard");
  expect(result.afterSplit.progression.launcherSpecial.crossfireShards).toBe(2);
  expect(shards).toHaveLength(2);
  expect(shards.every((projectile) => projectile.fireShard)).toBe(true);
  expect(Math.min(...shards.map((projectile) => projectile.x))).toBeLessThan(result.target.x - 1.2);
  expect(Math.max(...shards.map((projectile) => projectile.x))).toBeGreaterThan(result.target.x + 1.2);
  expect(Math.max(...shards.map((projectile) => Math.abs(projectile.z - result.target.z)))).toBeLessThan(1.5);
  expect(result.afterSplit.enemyCount).toBe(2);
  expect(result.afterSplit.enemies.every((enemy) => enemy.type === "brute" && enemy.hp > 0)).toBe(true);
  expect(result.afterSplit.firePools.some((pool) => pool.splinter && pool.trail)).toBe(true);

  expect(result.afterFinish.projectiles.filter((projectile) => projectile.type === "launcherFireShard")).toHaveLength(0);
  expect(result.afterFinish.firePools.filter((pool) => pool.splinter && pool.trail).length).toBeGreaterThanOrEqual(4);
});

test("level five class choice grants specialization rewards", async ({ page }) => {
  const classes = [
    { id: "gunslinger", label: "Gunslinger", weapon: "revolver", owned: ["revolver"], revolverDamage: 2, revolverCrateReserve: 51, revolverAmmoPickupBonus: 12 },
    { id: "ranger", label: "Ranger", weapon: "rifle", owned: ["revolver", "rifle"], revolverDamage: 1 },
    { id: "demolitionist", label: "Demolitionist", weapon: "launcher", owned: ["revolver", "launcher"], revolverDamage: 1, launcherTotal: 21, launcherCrateReserve: 30 },
    { id: "marshal", label: "Marshal", weapon: "coachGun", owned: ["revolver", "coachGun"], revolverDamage: 1, coachGunTotal: 36 },
  ];

  for (const choice of classes) {
    await startHunt(page, `mapSeed=7&class=${choice.id}`);
    await page.waitForFunction(() => typeof window.advanceTime === "function" && typeof window.render_game_to_text === "function");

    let state = await page.evaluate(() => {
      window.__dustAndDeadTest.clearEnemies();
      window.__dustAndDeadTest.grantXp(240);
      return JSON.parse(window.render_game_to_text());
    });

    expect(state.mode, `class choice mode for ${choice.id}`).toBe("class-choice");
    expect(state.progression.level, `level for ${choice.id}`).toBeGreaterThanOrEqual(5);
    expect(state.progression.classChoicePending, `pending choice for ${choice.id}`).toBe(true);
    await expect(page.getByRole("button", { name: new RegExp(choice.label) })).toBeVisible();

    if (choice.id === "gunslinger") {
      const classChoiceUi = await page.evaluate(() => {
        const panel = document.getElementById("class-choice").getBoundingClientRect();
        return {
          panelCenterDelta: Math.abs(panel.top + panel.height / 2 - window.innerHeight / 2),
          panelTop: panel.top,
          panelBottom: panel.bottom,
          viewportHeight: window.innerHeight,
          icons: Array.from(document.querySelectorAll("#class-choice .class-card__weapon-icon")).map((icon) => {
            const rect = icon.getBoundingClientRect();
            const box = icon.getBBox();
            const viewBox = icon.viewBox.baseVal;
            return {
              weapon: icon.dataset.weaponIcon,
              drawnParts: icon.querySelectorAll("path, circle, g").length,
              width: rect.width,
              height: rect.height,
              contentCenterX: (box.x + box.width / 2 - viewBox.x) / viewBox.width,
              contentCenterY: (box.y + box.height / 2 - viewBox.y) / viewBox.height,
            };
          }),
        };
      });
      expect(classChoiceUi.panelCenterDelta).toBeLessThanOrEqual(2);
      expect(classChoiceUi.panelTop).toBeGreaterThanOrEqual(0);
      expect(classChoiceUi.panelBottom).toBeLessThanOrEqual(classChoiceUi.viewportHeight);
      expect(classChoiceUi.icons.map((icon) => icon.weapon)).toEqual(["revolver", "rifle", "launcher", "coachGun"]);
      for (const icon of classChoiceUi.icons) {
        expect(icon.drawnParts, `drawn svg parts for ${icon.weapon}`).toBeGreaterThan(0);
        expect(icon.width, `svg width for ${icon.weapon}`).toBeGreaterThan(0);
        expect(icon.height, `svg height for ${icon.weapon}`).toBeGreaterThan(0);
        expect(Math.abs(icon.contentCenterX - 0.5), `svg x center for ${icon.weapon}`).toBeLessThanOrEqual(0.001);
        expect(Math.abs(icon.contentCenterY - 0.5), `svg y center for ${icon.weapon}`).toBeLessThanOrEqual(0.001);
      }
    }

    const chosen = await page.evaluate((id) => window.__dustAndDeadTest.chooseClass(id), choice.id);
    expect(chosen, `choose ${choice.id}`).toBe(true);
    await page.evaluate(() => window.__dustAndDeadTest.forceAllStandardUpgrades("swiftBoots"));
    state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));

    expect(state.mode, `mode after ${choice.id}`).toBe("playing");
    expect(state.progression.playerClass, `class after ${choice.id}`).toBe(choice.id);
    expect(state.progression.classChoicePending, `pending after ${choice.id}`).toBe(false);
    expect(state.weapon, `selected weapon after ${choice.id}`).toBe(choice.weapon);
    expect(state.ownedWeapons.sort(), `owned weapons after ${choice.id}`).toEqual(choice.owned.sort());
    expect(state.ammo.weapons.revolver.damage, `revolver damage after ${choice.id}`).toBe(choice.revolverDamage);
    expect(state.progression.revolverAmmoPickupBonus, `revolver crate bonus after ${choice.id}`).toBe(choice.revolverAmmoPickupBonus || 0);

    if (choice.id === "gunslinger") {
      await page.evaluate(() => {
        const state = JSON.parse(window.render_game_to_text());
        window.__dustAndDeadTest.setAmmo("revolver", 0, 0);
        window.__dustAndDeadTest.spawnAmmoCrateAt(state.player.x, state.player.z);
        window.__dustAndDeadTest.collectNearestAmmoCrate();
      });
      state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
      expect(state.ammo.weapons.revolver.reserve).toBe(choice.revolverCrateReserve);
    }

    if (choice.id === "demolitionist") {
      expect(state.ammo.weapons.launcher.total).toBe(choice.launcherTotal);
      await page.evaluate(() => {
        const state = JSON.parse(window.render_game_to_text());
        window.__dustAndDeadTest.setAmmo("launcher", 0, 0);
        window.__dustAndDeadTest.spawnAmmoCrateAt(state.player.x, state.player.z);
        window.__dustAndDeadTest.collectNearestAmmoCrate();
      });
      state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
      expect(state.ammo.weapons.launcher.reserve).toBe(choice.launcherCrateReserve);
    }

    if (choice.id === "marshal") {
      expect(state.ammo.weapons.coachGun.magazine).toBe(2);
      expect(state.ammo.weapons.coachGun.current).toBe(2);
      expect(state.ammo.weapons.coachGun.total).toBe(choice.coachGunTotal);
      await expect(page.getByLabel(/Coach Gun ammo/)).toBeVisible();

      const crateAmmo = await page.evaluate(() => {
        const current = JSON.parse(window.render_game_to_text());
        window.__dustAndDeadTest.setAmmo("coachGun", 0, 0);
        window.__dustAndDeadTest.spawnAmmoCrateAt(current.player.x, current.player.z);
        window.__dustAndDeadTest.collectNearestAmmoCrate();
        return JSON.parse(window.render_game_to_text()).ammo.weapons.coachGun;
      });
      expect(crateAmmo).toMatchObject({ current: 0, reserve: 36, total: 36, reloading: true });
    }
  }
});

test("Marshal ammo rewards use the new thresholds and preserve full-gun shells in reserve", async ({ page }) => {
  test.setTimeout(90000);
  await startMarshalBranch(page, "breachMarshal", "mapSeed=7&marshalAmmo=breach");

  const breach = await page.evaluate(() => {
    const read = () => JSON.parse(window.render_game_to_text());
    const killClose = () => {
      const state = read();
      window.__dustAndDeadTest.spawnZombieAt("walker", state.player.x, state.player.z + 2);
      if (!window.__dustAndDeadTest.killNearestZombieWithCoachGun(false, false)) throw new Error("Coach Gun test kill failed");
      return read();
    };

    window.__dustAndDeadTest.grantUpgrade("shellCatcher");
    window.__dustAndDeadTest.setAmmo("coachGun", 2, 0);
    const fullGunRewards = [killClose(), killClose(), killClose()];

    window.__dustAndDeadTest.setAmmo("coachGun", 1, 0);
    const chamberRewards = [killClose(), killClose(), killClose()];
    return { fullGunRewards, chamberRewards };
  });

  expect(breach.fullGunRewards.map((state) => state.progression.marshalSpecial.shellCatcherKills)).toEqual([1, 2, 0]);
  expect(breach.fullGunRewards[2].ammo.weapons.coachGun).toMatchObject({ current: 2, reserve: 1, total: 3 });
  expect(breach.chamberRewards.map((state) => state.progression.marshalSpecial.shellCatcherKills)).toEqual([1, 2, 0]);
  expect(breach.chamberRewards[2].ammo.weapons.coachGun).toMatchObject({ current: 2, reserve: 0, total: 2 });

  await startMarshalBranch(page, "graveWarden", "mapSeed=7&marshalAmmo=grave");

  const grave = await page.evaluate(() => {
    const read = () => JSON.parse(window.render_game_to_text());
    const kill = (marked, bounty) => {
      const state = read();
      window.__dustAndDeadTest.spawnZombieAt("walker", state.player.x, state.player.z + 2);
      if (!window.__dustAndDeadTest.killNearestZombieWithCoachGun(marked, bounty)) throw new Error("Coach Gun test kill failed");
      return read();
    };

    window.__dustAndDeadTest.grantUpgrade("heavensBounty");
    window.__dustAndDeadTest.setAmmo("coachGun", 2, 0);
    const beforeBounty = read();
    const bountyReward = kill(true, true);

    window.__dustAndDeadTest.grantUpgrade("graveTithe");
    window.__dustAndDeadTest.setAmmo("coachGun", 2, 0);
    const unmarked = kill(false, false);
    const fullGunRewards = [kill(true, false), kill(true, false)];

    window.__dustAndDeadTest.setAmmo("coachGun", 1, 0);
    const chamberRewards = [kill(true, false), kill(true, false)];
    return { beforeBounty, bountyReward, unmarked, fullGunRewards, chamberRewards };
  });

  expect(grave.bountyReward.progression.marshalSpecial.bountiesClaimed - grave.beforeBounty.progression.marshalSpecial.bountiesClaimed).toBe(1);
  expect(grave.bountyReward.ammo.weapons.coachGun).toMatchObject({ current: 2, reserve: 3, total: 5 });
  expect(grave.unmarked.progression.marshalSpecial.graveTitheKills).toBe(0);
  expect(grave.unmarked.ammo.weapons.coachGun).toMatchObject({ current: 2, reserve: 0 });
  expect(grave.fullGunRewards.map((state) => state.progression.marshalSpecial.graveTitheKills)).toEqual([1, 0]);
  expect(grave.fullGunRewards[1].ammo.weapons.coachGun).toMatchObject({ current: 2, reserve: 1, total: 3 });
  expect(grave.chamberRewards.map((state) => state.progression.marshalSpecial.graveTitheKills)).toEqual([1, 0]);
  expect(grave.chamberRewards[1].ammo.weapons.coachGun).toMatchObject({ current: 2, reserve: 0, total: 2 });
});

test("marshal gets a level ten Coach Gun branch choice", async ({ page }) => {
  const branches = [
    { id: "breachMarshal", label: /Breach Marshal/, icon: "coachGunBreach", pelletCount: 10, visualCount: 8, spread: 0.449, range: 12.4 },
    { id: "graveWarden", label: /Grave Warden/, icon: "coachGunGrave", pelletCount: 8, visualCount: 6, spread: 0.221, range: 18.6 },
  ];
  const renderedBranchIcons = [];

  for (const branch of branches) {
    await startHunt(page, `mapSeed=7&marshal=${branch.id}`);
    await page.waitForFunction(() => typeof window.advanceTime === "function" && typeof window.render_game_to_text === "function");

    let state = await page.evaluate(() => {
      window.__dustAndDeadTest.clearEnemies();
      window.__dustAndDeadTest.grantXp(240);
      return JSON.parse(window.render_game_to_text());
    });

    expect(state.mode, `class choice before ${branch.id}`).toBe("class-choice");
    expect(await page.evaluate(() => window.__dustAndDeadTest.chooseClass("marshal")), `choose Marshal before ${branch.id}`).toBe(true);
    await page.evaluate(() => window.__dustAndDeadTest.forceAllStandardUpgrades("swiftBoots"));

    state = await page.evaluate(() => {
      window.__dustAndDeadTest.grantXp(1200);
      return JSON.parse(window.render_game_to_text());
    });

    expect(state.mode, `Marshal branch choice for ${branch.id}`).toBe("marshal-upgrade");
    expect(state.progression.level, `level for ${branch.id}`).toBeGreaterThanOrEqual(10);
    expect(state.progression.marshalUpgradePending, `pending Marshal branch for ${branch.id}`).toBe(true);
    expect(state.progression.marshalUpgradeLevel).toBe(10);
    await expect(page.getByRole("button", { name: branch.label })).toBeVisible();

    const ui = await page.evaluate((id) => {
      const panel = document.getElementById("marshal-upgrade").getBoundingClientRect();
      const centers = Array.from(document.querySelectorAll("#marshal-upgrade .class-card__mark")).map((mark) => {
        const rect = mark.getBoundingClientRect();
        return Number((rect.top + rect.height / 2 - panel.top).toFixed(2));
      });
      const svg = document.querySelector(`[data-marshal-upgrade="${id}"] [data-weapon-icon]`);
      const rect = svg.getBoundingClientRect();
      return {
        centers,
        icon: svg.getAttribute("data-weapon-icon"),
        shapeCount: svg.querySelectorAll("path,circle,line,polyline,polygon,rect").length,
        brightPaintCount: Array.from(svg.querySelectorAll("*")).filter((part) =>
          /rgba\(255\s*,\s*24[0-9]/.test(`${part.getAttribute("fill") || ""} ${part.getAttribute("stroke") || ""}`)
        ).length,
        markup: svg.innerHTML,
        width: rect.width,
        height: rect.height,
      };
    }, branch.id);
    expect(Math.max(...ui.centers) - Math.min(...ui.centers), `card centers for ${branch.id}`).toBeLessThanOrEqual(1);
    expect(ui.icon, `branch icon for ${branch.id}`).toBe(branch.icon);
    expect(ui.shapeCount, `branch icon shapes for ${branch.id}`).toBeGreaterThan(0);
    expect(ui.brightPaintCount, `bright artifact paint for ${branch.id}`).toBe(0);
    expect(ui.width).toBeGreaterThan(0);
    expect(ui.height).toBeGreaterThan(0);
    renderedBranchIcons.push(ui.markup);

    expect(await page.evaluate((id) => window.__dustAndDeadTest.chooseMarshalUpgrade(id), branch.id), `choose ${branch.id}`).toBe(true);
    await page.evaluate(() => window.__dustAndDeadTest.forceAllStandardUpgrades("swiftBoots"));
    state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));

    expect(state.mode, `mode after ${branch.id}`).toBe("playing");
    expect(state.progression.playerClass).toBe("marshal");
    expect(state.progression.marshalUpgrade).toBe(branch.id);
    expect(state.progression.marshalUpgradePending).toBe(false);
    expect(state.weapon).toBe("coachGun");
    expect(state.ammo.weapons.coachGun.magazine).toBe(2);
    expect(state.ammo.weapons.coachGun.current).toBe(2);
    expect(state.progression.marshalSpecial.pelletCount).toBe(branch.pelletCount);
    expect(state.progression.marshalSpecial.visualPelletCount).toBe(branch.visualCount);
    expect(state.progression.marshalSpecial.spread).toBe(branch.spread);
    expect(state.progression.marshalSpecial.range).toBe(branch.range);

    const rack = await page.evaluate(() => {
      const element = document.getElementById("ammo-cartridge-rack");
      return {
        weapon: element.dataset.weapon,
        magazine: element.dataset.magazine,
        rounds: element.querySelectorAll(".ammo-round").length,
      };
    });
    expect(rack).toEqual({ weapon: "coachGun", magazine: "2", rounds: 2 });
  }
  expect(new Set(renderedBranchIcons).size, "Marshal branch silhouettes").toBe(branches.length);
});

test("Marshal specials keep the 13, 16, 19 cadence with two branch cards", async ({ page }) => {
  test.setTimeout(90000);
  const cases = [
    { branch: "breachMarshal", starters: new Set(["doorKicker", "doubleTap", "lastWord"]) },
    { branch: "graveWarden", starters: new Set(["rockSalt", "stillness", "lastRites"]) },
  ];

  for (const branchCase of cases) {
    await startHunt(page, `mapSeed=7&marshalCadence=${branchCase.branch}`);
    await page.waitForFunction(() => typeof window.advanceTime === "function" && typeof window.render_game_to_text === "function");

    const records = await page.evaluate((branch) => {
      const read = () => JSON.parse(window.render_game_to_text());
      const levelOnce = () => {
        const state = read();
        window.__dustAndDeadTest.grantXp(Math.max(1, state.progression.xpToNext - state.progression.xp));
        return read();
      };
      const takeCurrentCard = () => {
        const state = read();
        if (state.mode !== "level-up") return;
        const id = state.progression.standardUpgradeChoices[0];
        if (!window.__dustAndDeadTest.chooseStandardUpgrade(id)) throw new Error(`Could not choose ${id}`);
      };

      window.__dustAndDeadTest.clearEnemies();
      while (read().progression.level < 5) {
        levelOnce();
        takeCurrentCard();
      }
      if (!window.__dustAndDeadTest.chooseClass("marshal")) throw new Error("Could not choose Marshal");
      while (read().progression.level < 10) {
        levelOnce();
        takeCurrentCard();
      }
      if (!window.__dustAndDeadTest.chooseMarshalUpgrade(branch)) throw new Error(`Could not choose ${branch}`);

      const result = [];
      while (read().progression.level < 19) {
        const offered = levelOnce();
        const cards = Array.from(document.querySelectorAll("#level-up-options .upgrade-card")).map((card) => {
          const symbol = card.querySelector(".upgrade-card__symbol");
          return {
            id: card.dataset.standardUpgrade,
            kind: card.dataset.upgradeKind,
            specialClass: card.classList.contains("upgrade-card--special"),
            text: symbol.textContent.trim(),
            svgCount: symbol.querySelectorAll("svg").length,
            shapeCount: symbol.querySelectorAll("path,circle,line,polyline,polygon,rect").length,
          };
        });
        result.push({
          level: offered.progression.level,
          mode: offered.mode,
          marshalSpecialLevel: offered.progression.marshalSpecialLevel,
          choices: offered.progression.standardUpgradeChoices,
          cards,
        });
        takeCurrentCard();
      }
      return result;
    }, branchCase.branch);

    expect(records.map((record) => record.level)).toEqual([11, 12, 13, 14, 15, 16, 17, 18, 19]);
    for (const record of records) {
      const shouldBeSpecial = [13, 16, 19].includes(record.level);
      const specialCards = record.cards.filter((card) => card.kind === "special");
      const standardCards = record.cards.filter((card) => card.kind === "standard");
      expect(record.mode, `mode at level ${record.level} for ${branchCase.branch}`).toBe("level-up");
      expect(record.marshalSpecialLevel, `special flag at level ${record.level} for ${branchCase.branch}`).toBe(shouldBeSpecial);
      expect(record.choices, `choice count at level ${record.level} for ${branchCase.branch}`).toHaveLength(3);
      expect(specialCards, `special cards at level ${record.level} for ${branchCase.branch}`).toHaveLength(shouldBeSpecial ? 2 : 0);
      expect(standardCards, `standard cards at level ${record.level} for ${branchCase.branch}`).toHaveLength(shouldBeSpecial ? 1 : 3);
      expect(record.cards.every((card) => card.text === "" && card.svgCount === 1 && card.shapeCount > 0)).toBe(true);
      expect(specialCards.every((card) => card.specialClass)).toBe(true);
      expect(standardCards.every((card) => !card.specialClass)).toBe(true);
    }

    const levelThirteen = records.find((record) => record.level === 13);
    const starterChoices = levelThirteen.cards.filter((card) => card.kind === "special").map((card) => card.id);
    expect(starterChoices.every((id) => branchCase.starters.has(id)), `starter pool for ${branchCase.branch}`).toBe(true);
  }
});

test("Marshal upgrade eligibility honors starter pools, dependencies, caps, and vector icons", async ({ page }) => {
  test.setTimeout(90000);
  const cases = [
    {
      branch: "breachMarshal",
      starters: ["doorKicker", "doubleTap", "lastWord"],
      levelSixteen: ["shellCatcher", "buckAndBall", "rideTheRecoil", "packedBuckshot", "hardCast"],
      gated: "bonebreaker",
      dependency: "doorKicker",
      levelNineteen: "noTimeToBleed",
      repeatable: "packedBuckshot",
      cap: 4,
    },
    {
      branch: "graveWarden",
      starters: ["rockSalt", "stillness", "lastRites"],
      levelSixteen: ["graveTithe", "heavensBounty", "purifyingSalt", "fineChoke", "sanctifiedLead"],
      gated: "passingJudgment",
      dependency: "lastRites",
      secondGated: "hallowedGround",
      secondDependency: "heavensBounty",
      repeatable: "fineChoke",
      cap: 5,
    },
  ];
  const allMarshalUpgradeIds = [
    "doorKicker", "doubleTap", "lastWord", "shellCatcher", "buckAndBall", "rideTheRecoil", "bonebreaker", "noTimeToBleed", "packedBuckshot", "hardCast",
    "rockSalt", "stillness", "lastRites", "graveTithe", "heavensBounty", "passingJudgment", "purifyingSalt", "hallowedGround", "fineChoke", "sanctifiedLead",
  ];

  for (const branchCase of cases) {
    await startHunt(page, `mapSeed=7&marshalEligibility=${branchCase.branch}`);
    await page.waitForFunction(() => typeof window.advanceTime === "function" && typeof window.render_game_to_text === "function");

    const result = await page.evaluate((branchCase) => {
      window.__dustAndDeadTest.clearEnemies();
      window.__dustAndDeadTest.grantXp(240);
      window.__dustAndDeadTest.chooseClass("marshal");
      window.__dustAndDeadTest.forceAllStandardUpgrades("swiftBoots");
      window.__dustAndDeadTest.grantXp(1200);
      window.__dustAndDeadTest.chooseMarshalUpgrade(branchCase.branch);
      window.__dustAndDeadTest.forceAllStandardUpgrades("swiftBoots");

      const level13 = window.__dustAndDeadTest.getEligibleMarshalUpgrades(13);
      const level16 = window.__dustAndDeadTest.getEligibleMarshalUpgrades(16);
      const level19Before = window.__dustAndDeadTest.getEligibleMarshalUpgrades(19);
      window.__dustAndDeadTest.grantUpgrade(branchCase.dependency);
      if (branchCase.secondDependency) window.__dustAndDeadTest.grantUpgrade(branchCase.secondDependency);
      const level19AfterDependencies = window.__dustAndDeadTest.getEligibleMarshalUpgrades(19);
      for (let i = 0; i < branchCase.cap; i++) window.__dustAndDeadTest.grantUpgrade(branchCase.repeatable);
      const afterCap = window.__dustAndDeadTest.getEligibleMarshalUpgrades(19);
      return { level13, level16, level19Before, level19AfterDependencies, afterCap };
    }, branchCase);

    expect(result.level13.sort(), `level 13 starter pool for ${branchCase.branch}`).toEqual(branchCase.starters.slice().sort());
    for (const id of branchCase.levelSixteen) expect(result.level16, `${id} at level 16 for ${branchCase.branch}`).toContain(id);
    expect(result.level19Before, `${branchCase.gated} before dependency`).not.toContain(branchCase.gated);
    expect(result.level19AfterDependencies, `${branchCase.gated} after dependency`).toContain(branchCase.gated);
    if (branchCase.levelNineteen) expect(result.level19Before).toContain(branchCase.levelNineteen);
    if (branchCase.secondGated) {
      expect(result.level19Before, `${branchCase.secondGated} before dependency`).not.toContain(branchCase.secondGated);
      expect(result.level19AfterDependencies, `${branchCase.secondGated} after dependency`).toContain(branchCase.secondGated);
    }
    expect(result.afterCap, `${branchCase.repeatable} after cap`).not.toContain(branchCase.repeatable);
  }

  const iconDiagnostics = await page.evaluate((ids) => ids.map((id) => window.__dustAndDeadTest.getUpgradeIconDiagnostics(id)), allMarshalUpgradeIds);
  expect(iconDiagnostics.map((icon) => icon.id)).toEqual(allMarshalUpgradeIds);
  for (const icon of iconDiagnostics) {
    expect(icon.text, `text fallback for ${icon.id}`).toBe("");
    expect(icon.svgCount, `SVG count for ${icon.id}`).toBe(1);
    expect(icon.shapeCount, `vector shapes for ${icon.id}`).toBeGreaterThan(0);
    expect(icon.viewBox, `viewBox for ${icon.id}`).toBeTruthy();
  }
});

test("Marshal keeps two meaningful branch offers after every finite upgrade is exhausted", async ({ page }) => {
  const cases = [
    {
      branch: "breachMarshal",
      ids: ["doorKicker", "doubleTap", "lastWord", "shellCatcher", "buckAndBall", "rideTheRecoil", "bonebreaker", "noTimeToBleed", "packedBuckshot", "hardCast", "roomSweeper", "rollingThunder", "sheriffsPace", "holdTheDoor", "powderCurtain", "masterKey"],
      repeatables: { packedBuckshot: 4, hardCast: 5 },
      fallbackIds: ["packedBuckshot", "hardCast"],
    },
    {
      branch: "graveWarden",
      ids: ["rockSalt", "stillness", "lastRites", "graveTithe", "heavensBounty", "passingJudgment", "purifyingSalt", "hallowedGround", "fineChoke", "sanctifiedLead"],
      repeatables: { fineChoke: 5, sanctifiedLead: 5 },
      fallbackIds: ["fineChoke", "sanctifiedLead"],
    },
  ];

  for (const branchCase of cases) {
    await startHunt(page, `mapSeed=7&marshalMastery=${branchCase.branch}`);
    await page.waitForFunction(() => typeof window.advanceTime === "function" && typeof window.render_game_to_text === "function");

    const result = await page.evaluate((branchCase) => {
      const read = () => JSON.parse(window.render_game_to_text());
      window.__dustAndDeadTest.clearEnemies();
      window.__dustAndDeadTest.grantXp(240);
      window.__dustAndDeadTest.chooseClass("marshal");
      window.__dustAndDeadTest.forceAllStandardUpgrades("swiftBoots");
      window.__dustAndDeadTest.grantXp(1200);
      window.__dustAndDeadTest.chooseMarshalUpgrade(branchCase.branch);
      window.__dustAndDeadTest.forceAllStandardUpgrades("swiftBoots");

      for (const id of branchCase.ids) window.__dustAndDeadTest.grantUpgrade(id);
      for (const [id, cap] of Object.entries(branchCase.repeatables)) {
        for (let rank = 1; rank < cap; rank++) window.__dustAndDeadTest.grantUpgrade(id);
      }

      const before = read();
      const choices = window.__dustAndDeadTest.rollMarshalSpecialChoices(52);
      window.__dustAndDeadTest.grantUpgrade(choices[0].id);
      const after = read();
      return { before, choices, after };
    }, branchCase);

    expect(result.choices).toHaveLength(2);
    expect(new Set(result.choices.map((choice) => choice.id)).size).toBe(2);
    expect(result.choices.map((choice) => choice.id).sort()).toEqual(branchCase.fallbackIds.slice().sort());
    expect(result.choices.every((choice) => choice.masteryFallback)).toBe(true);
    expect(result.choices.every((choice) => choice.description.includes("+3% Coach Gun damage"))).toBe(true);
    expect(result.before.progression.marshalSpecial.masteryStacks).toBe(0);
    expect(result.after.progression.marshalSpecial.masteryStacks).toBe(1);
    expect(result.after.progression.marshalSpecial.masteryDamageMultiplier).toBe(1.03);
    expect(result.after.progression.marshalSpecial.pelletCount).toBe(result.before.progression.marshalSpecial.pelletCount);
    expect(result.after.progression.marshalSpecial.spread).toBe(result.before.progression.marshalSpecial.spread);
    expect(result.after.progression.marshalSpecial.range).toBe(result.before.progression.marshalSpecial.range);
  }
});

test("unknown Marshal preview parameters cannot alter a normal menu run", async ({ page }) => {
  await page.goto(`${fileUrl("index.html")}?preview=marshal-unknown&mapSeed=7`);
  await page.waitForFunction(() => typeof window.render_game_to_text === "function");
  const state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));

  expect(state.mode).toBe("menu");
  expect(state.progression.playerClass).toBeNull();
  expect(state.progression.marshalUpgrade).toBeNull();
  expect(state.weapon).toBe("revolver");
});

test("Coach Gun volleys spend one shell and interrupt a shell-by-shell reload", async ({ page }) => {
  await startHunt(page, `mapSeed=7&coachGun=reload`);
  await page.waitForFunction(() => typeof window.advanceTime === "function" && typeof window.render_game_to_text === "function");

  const result = await page.evaluate(() => {
    const read = () => JSON.parse(window.render_game_to_text());
    window.__dustAndDeadTest.clearEnemies();
    window.__dustAndDeadTest.grantXp(240);
    window.__dustAndDeadTest.chooseClass("marshal");
    window.__dustAndDeadTest.forceAllStandardUpgrades("swiftBoots");

    const setup = read();
    window.__dustAndDeadTest.setAimTarget(setup.player.x, setup.player.z + 12);
    window.__dustAndDeadTest.setAmmo("coachGun", 2, 0);
    const beforeVolley = read();
    const firstFired = window.__dustAndDeadTest.shootOnce();
    const afterFirst = read();
    const secondFired = window.__dustAndDeadTest.shootOnce();
    const afterSecond = read();

    window.__dustAndDeadTest.setAmmo("coachGun", 0, 3);
    const reloadStarted = window.__dustAndDeadTest.startReload("coachGun");
    window.advanceTime(650);
    const afterOneShell = read();
    const interruptFired = window.__dustAndDeadTest.shootOnce();
    const afterInterrupt = read();
    window.advanceTime(650);
    const afterReloadedOneAgain = read();
    window.advanceTime(650);
    const afterFullReload = read();

    return {
      beforeVolley,
      firstFired,
      afterFirst,
      secondFired,
      afterSecond,
      reloadStarted,
      afterOneShell,
      interruptFired,
      afterInterrupt,
      afterReloadedOneAgain,
      afterFullReload,
    };
  });

  expect(result.firstFired).toBe(true);
  expect(result.afterFirst.shotsFired - result.beforeVolley.shotsFired).toBe(1);
  expect(result.afterFirst.ammo.weapons.coachGun.current).toBe(1);
  expect(result.afterFirst.progression.marshalSpecial.lastVolley).toMatchObject({
    pelletCount: 8,
    visualPelletCount: 7,
    visualTracerCount: 7,
    spread: 0.34,
    range: 15.5,
    lastShell: false,
  });
  expect(result.afterFirst.effects.coachGunTracers).toBe(7);
  expect(result.afterFirst.optimization.projectileVisualPools.activeCoachGunTracers).toBe(7);
  expect(result.afterFirst.optimization.projectileVisualPools.standard.inUse).toBe(
    result.beforeVolley.optimization.projectileVisualPools.standard.inUse + 7
  );
  expect(result.afterFirst.optimization.projectileVisualPools.standard.created).toBe(
    result.beforeVolley.optimization.projectileVisualPools.standard.created
  );
  expect(result.secondFired).toBe(true);
  expect(result.afterSecond.shotsFired - result.beforeVolley.shotsFired).toBe(2);
  expect(result.afterSecond.ammo.weapons.coachGun.current).toBe(0);
  expect(result.afterSecond.progression.marshalSpecial.lastVolley).toMatchObject({ pelletCount: 8, lastShell: true });
  expect(result.afterSecond.effects.coachGunTracers).toBe(14);
  expect(result.afterSecond.optimization.projectileVisualPools.activeCoachGunTracers).toBe(14);

  expect(result.reloadStarted).toMatchObject({ current: 0, reserve: 3, reloading: true });
  expect(result.afterOneShell.ammo.weapons.coachGun).toMatchObject({ current: 1, reserve: 2, reloading: true });
  expect(result.afterOneShell.effects.coachGunTracers).toBe(0);
  expect(result.interruptFired).toBe(true);
  expect(result.afterInterrupt.ammo.weapons.coachGun).toMatchObject({ current: 0, reserve: 2, reloading: true });
  expect(result.afterInterrupt.progression.marshalSpecial.lastVolley.lastShell).toBe(true);
  expect(result.afterReloadedOneAgain.ammo.weapons.coachGun).toMatchObject({ current: 1, reserve: 1, reloading: true });
  expect(result.afterFullReload.ammo.weapons.coachGun).toMatchObject({ current: 2, reserve: 0, reloading: false });
});

test("Marshal subclasses render capped pooled pellet tracers without gameplay projectiles", async ({ page }) => {
  const cases = [
    { preview: "marshal-gameplay-breach", branch: "breachMarshal", visualCount: 8 },
    { preview: "marshal-gameplay", branch: "graveWarden", visualCount: 6 },
  ];

  for (const branchCase of cases) {
    await page.goto(`${fileUrl("index.html")}?preview=${branchCase.preview}&mapSeed=7`);
    await page.waitForFunction(() => typeof window.advanceTime === "function" && typeof window.render_game_to_text === "function");

    const result = await page.evaluate(() => {
      const read = () => JSON.parse(window.render_game_to_text());
      window.__dustAndDeadTest.clearEnemies();
      window.__dustAndDeadTest.setAmmo("coachGun", 2, 0);
      const setup = read();
      window.__dustAndDeadTest.setAimTarget(setup.player.x, setup.player.z + 18);
      const before = read();
      const fired = window.__dustAndDeadTest.shootOnce();
      const after = read();
      window.advanceTime(500);
      const expired = read();
      for (let i = 0; i < 5; i++) {
        window.__dustAndDeadTest.setAmmo("coachGun", 2, 0);
        window.__dustAndDeadTest.shootOnce();
      }
      const stressed = read();
      window.advanceTime(500);
      const settled = read();
      return { before, fired, after, expired, stressed, settled };
    });

    expect(result.fired, `shot for ${branchCase.branch}`).toBe(true);
    expect(result.after.progression.marshalUpgrade).toBe(branchCase.branch);
    expect(result.after.progression.marshalSpecial.lastVolley).toMatchObject({
      visualPelletCount: branchCase.visualCount,
      visualTracerCount: branchCase.visualCount,
    });
    expect(result.after.bullets, `gameplay projectiles for ${branchCase.branch}`).toBe(0);
    expect(result.after.effects.coachGunTracers).toBe(branchCase.visualCount);
    expect(result.after.optimization.projectileVisualPools.activeCoachGunTracers).toBe(branchCase.visualCount);
    expect(result.after.optimization.projectileVisualPools.standard.inUse).toBe(
      result.before.optimization.projectileVisualPools.standard.inUse + branchCase.visualCount
    );
    expect(result.after.optimization.projectileVisualPools.standard.created).toBe(
      result.before.optimization.projectileVisualPools.standard.created
    );
    expect(result.after.optimization.projectileVisualPools.maxCoachGunTracers).toBe(24);
    expect(result.expired.effects.coachGunTracers).toBe(0);
    expect(result.expired.optimization.projectileVisualPools.activeCoachGunTracers).toBe(0);
    expect(result.stressed.effects.coachGunTracers).toBe(24);
    expect(result.stressed.optimization.projectileVisualPools.activeCoachGunTracers).toBe(24);
    expect(result.stressed.optimization.projectileVisualPools.standard.created).toBe(
      result.before.optimization.projectileVisualPools.standard.created
    );
    expect(result.settled.effects.coachGunTracers).toBe(0);
    expect(result.settled.optimization.projectileVisualPools.activeCoachGunTracers).toBe(0);
  }
});

test("Last Rites raises Pale Deputies without fear and refreshes the oldest deputy at the cap", async ({ page }) => {
  test.setTimeout(90000);
  await startMarshalBranch(page, "graveWarden", "mapSeed=7&paleDeputy=cap");

  const result = await page.evaluate(() => {
    const read = () => JSON.parse(window.render_game_to_text());
    const deputies = () => window.__dustAndDeadTest.getPaleDeputyDiagnostics();
    const advanceFully = (ms) => {
      let remaining = ms;
      while (remaining > 0) {
        const chunk = Math.min(4000, remaining);
        window.advanceTime(chunk);
        remaining -= chunk;
      }
    };
    const killEligible = () => {
      window.__dustAndDeadTest.clearEnemies();
      const state = read();
      window.__dustAndDeadTest.spawnZombieAt("walker", state.player.x, state.player.z + 2);
      if (!window.__dustAndDeadTest.killNearestZombieWithCoachGun(true, false)) throw new Error("Eligible Pale Deputy kill failed");
    };

    window.__dustAndDeadTest.grantUpgrade("lastRites");
    window.__dustAndDeadTest.clearPaleDeputies();

    const setup = read();
    const guard = window.__dustAndDeadTest.spawnZombieAt("walker", setup.player.x, setup.player.z + 4.6);
    window.__dustAndDeadTest.spawnZombieAt("walker", setup.player.x, setup.player.z + 2);
    const fearBefore = read().progression.marshalSpecial.fearBursts;
    if (!window.__dustAndDeadTest.killNearestZombieWithCoachGun(true, false)) throw new Error("Initial Pale Deputy kill failed");
    const afterFirstState = read();
    const afterFirst = deputies();
    const guardAfter = afterFirstState.enemies.find((enemy) => enemy.groupId === guard.groupId);

    window.__dustAndDeadTest.clearEnemies();
    window.advanceTime(1000);
    killEligible();
    killEligible();
    const beforeCap = deputies();
    killEligible();
    const afterCap = deputies();

    advanceFully(11100);
    const afterOldestExpires = deputies();
    killEligible();
    const afterNewKill = deputies();

    return {
      fearBefore,
      fearAfter: afterFirstState.progression.marshalSpecial.fearBursts,
      guardAfter,
      afterFirst,
      beforeCap,
      afterCap,
      afterOldestExpires,
      afterNewKill,
    };
  });

  expect(result.afterFirst.active).toBe(1);
  expect(result.fearAfter).toBe(result.fearBefore);
  expect(result.guardAfter).toBeTruthy();
  expect(result.guardAfter.fearTimer).toBe(0);

  expect(result.beforeCap).toMatchObject({ active: 3, max: 3, summoned: 3, refreshed: 0, spawnBlocked: 0 });
  expect(result.afterCap).toMatchObject({ active: 3, max: 3, summoned: 3, refreshed: 1, spawnBlocked: 0 });
  const idsBeforeCap = result.beforeCap.units.map((unit) => unit.groupId).sort();
  const idsAfterCap = result.afterCap.units.map((unit) => unit.groupId).sort();
  expect(idsAfterCap).toEqual(idsBeforeCap);
  const lifeRefreshes = [];
  for (const unit of result.beforeCap.units) {
    const preserved = result.afterCap.units.find((candidate) => candidate.groupId === unit.groupId);
    expect(preserved).toBeTruthy();
    lifeRefreshes.push(preserved.life - unit.life);
  }
  expect(Math.max(...lifeRefreshes)).toBeGreaterThan(0.8);

  expect(result.afterOldestExpires.active).toBe(3);
  expect(result.afterOldestExpires.summoned).toBe(3);
  expect(result.afterOldestExpires.units.map((unit) => unit.groupId).sort()).toEqual(idsBeforeCap);
  expect(result.afterNewKill.active).toBe(3);
  expect(result.afterNewKill.summoned).toBe(3);
  expect(result.afterNewKill.refreshed).toBe(2);
});

test("Pale Deputy keeps its distinctive model, follows the player, fights strongly, and reuses its pool", async ({ page }) => {
  test.setTimeout(90000);
  await startMarshalBranch(page, "graveWarden", "mapSeed=7&paleDeputy=runtime");

  const result = await page.evaluate(() => {
    const read = () => JSON.parse(window.render_game_to_text());
    const deputies = () => window.__dustAndDeadTest.getPaleDeputyDiagnostics();
    const advanceFully = (ms) => {
      let remaining = ms;
      while (remaining > 0) {
        const chunk = Math.min(4000, remaining);
        window.advanceTime(chunk);
        remaining -= chunk;
      }
    };

    window.__dustAndDeadTest.grantUpgrade("lastRites");
    window.__dustAndDeadTest.grantUpgrade("graveTithe");
    window.__dustAndDeadTest.clearPaleDeputies();
    window.__dustAndDeadTest.clearEnemies();
    let state = read();
    window.__dustAndDeadTest.spawnPaleDeputyAt(state.player.x + 1, state.player.z + 1);
    const initialPlayerSpeed = state.player.speed;
    const initial = deputies();

    window.__dustAndDeadTest.grantUpgrade("swiftBoots");
    window.advanceTime(50);
    state = read();
    const afterSpeedUpgrade = deputies();

    const originalGroupId = afterSpeedUpgrade.units[0].groupId;
    window.__dustAndDeadTest.setPlayerPosition(state.player.x + 22, state.player.z + 18);
    window.advanceTime(100);
    const afterLongMoveState = read();
    const afterLongMove = deputies();

    window.__dustAndDeadTest.setPlayerPosition(afterLongMoveState.map.arenaW / 2 - 2, afterLongMoveState.map.arenaD / 2 - 2);
    window.advanceTime(100);
    state = read();
    const nearCorner = deputies();

    window.__dustAndDeadTest.setPlayerPosition(state.map.playerStart.x, state.map.playerStart.z);
    window.advanceTime(100);
    state = read();

    window.__dustAndDeadTest.clearEnemies();
    window.__dustAndDeadTest.setAmmo("coachGun", 2, 0);
    const brute = window.__dustAndDeadTest.spawnZombieAt("brute", state.player.x, state.player.z + 13);
    window.__dustAndDeadTest.setAimTarget(brute.x, brute.z);
    if (!window.__dustAndDeadTest.shootOnce()) throw new Error("Could not prepare marked brute for Pale Deputy");
    const afterCoachShot = read();
    const markedBrute = afterCoachShot.enemies.find((enemy) => enemy.groupId === brute.groupId);
    const afterCoachAmmo = afterCoachShot.ammo.weapons.coachGun;
    const titheAfterCoachShot = afterCoachShot.progression.marshalSpecial.graveTitheKills;
    const deputyBeforeAttack = deputies();
    window.advanceTime(100);
    const duringAttack = deputies();
    window.advanceTime(900);
    const afterAttackState = read();
    const afterAttack = deputies();

    advanceFully(19000);
    const expired = deputies();
    const createdBeforeReuse = expired.pool.created;
    window.__dustAndDeadTest.spawnPaleDeputyAt(afterAttackState.player.x + 1, afterAttackState.player.z + 1);
    const reused = deputies();
    window.__dustAndDeadTest.clearPaleDeputies();
    const cleared = deputies();

    return {
      initial,
      initialPlayerSpeed,
      playerSpeedAfterUpgrade: state.player.speed,
      afterSpeedUpgrade,
      originalGroupId,
      afterLongMove,
      nearCorner,
      markedBrute,
      afterCoachAmmo,
      titheAfterCoachShot,
      deputyBeforeAttack,
      duringAttack,
      afterAttackState,
      afterAttack,
      expired,
      createdBeforeReuse,
      reused,
      cleared,
    };
  });

  expect(result.initial).toMatchObject({
    active: 1,
    max: 3,
    lifetime: 18,
    damage: 5.76,
    pelletDamage: 0.72,
    pelletCount: 8,
    spread: 0.34,
    attackCooldown: 0.48,
    attackRange: 15.5,
    targetRadius: 15.5,
    hardLeash: 7.5,
  });
  const model = result.initial.units[0];
  expect(model.modelParts).toBeGreaterThanOrEqual(10);
  expect(model).toMatchObject({
    modelVersion: 1,
    hasHat: true,
    hasBadge: true,
    hasWeapon: true,
    weaponType: "coachGun",
    hasDefaultCoachGun: true,
    hasAura: true,
    hasCoatTails: true,
    hasEyeGlow: true,
    visible: true,
    insideView: true,
  });
  expect(model).toMatchObject({ modelScale: 0.78, smallerThanPlayer: true });
  expect(model.visualHeight).toBeLessThan(model.playerVisualHeight);
  expect(model.speed).toBeCloseTo(result.initialPlayerSpeed, 2);

  expect(result.afterSpeedUpgrade.units[0].speed).toBeCloseTo(result.playerSpeedAfterUpgrade, 2);
  expect(result.afterLongMove.units[0]).toMatchObject({ groupId: result.originalGroupId, visible: true, insideView: true });
  expect(result.afterLongMove.units[0].distanceToPlayer).toBeLessThanOrEqual(7.5);
  expect(result.nearCorner.units[0]).toMatchObject({ groupId: result.originalGroupId, visible: true, insideView: true });
  expect(result.nearCorner.units[0].distanceToPlayer).toBeLessThanOrEqual(7.5);

  expect(result.markedBrute).toBeTruthy();
  expect(result.markedBrute.marked).toBe(true);
  expect(result.markedBrute.hp).toBeGreaterThan(0);
  expect(result.duringAttack.tracers).toBeGreaterThan(0);
  expect(result.afterAttackState.enemies.some((enemy) => enemy.groupId === result.markedBrute.groupId)).toBe(false);
  expect(result.afterAttack.kills - result.deputyBeforeAttack.kills).toBe(1);
  expect(result.afterAttack.active).toBe(1);
  expect(result.afterAttack.summoned).toBe(result.deputyBeforeAttack.summoned);
  expect(result.afterAttackState.progression.marshalSpecial.graveTitheKills).toBe(result.titheAfterCoachShot);
  expect(result.afterAttackState.ammo.weapons.coachGun).toMatchObject({ current: result.afterCoachAmmo.current, reserve: result.afterCoachAmmo.reserve });

  expect(result.expired.active).toBe(0);
  expect(result.expired.pool.inUse).toBe(0);
  expect(result.reused.active).toBe(1);
  expect(result.reused.pool.created).toBe(result.createdBeforeReuse);
  expect(result.cleared.active).toBe(0);
  expect(result.cleared.pool.inUse).toBe(0);
});

test("Marshal marks and hallowed visuals are cleaned when entities return to their pools", async ({ page }) => {
  await startHunt(page, `mapSeed=7&marshalCleanup=1`);
  await page.waitForFunction(() => typeof window.advanceTime === "function" && typeof window.render_game_to_text === "function");

  const result = await page.evaluate(() => {
    const read = () => JSON.parse(window.render_game_to_text());
    window.__dustAndDeadTest.clearEnemies();
    window.__dustAndDeadTest.grantXp(240);
    window.__dustAndDeadTest.chooseClass("marshal");
    window.__dustAndDeadTest.forceAllStandardUpgrades("swiftBoots");
    window.__dustAndDeadTest.grantXp(1200);
    window.__dustAndDeadTest.chooseMarshalUpgrade("graveWarden");
    window.__dustAndDeadTest.forceAllStandardUpgrades("swiftBoots");

    let state = read();
    window.__dustAndDeadTest.clearEnemies();
    window.__dustAndDeadTest.setAmmo("coachGun", 2, 0);
    const first = window.__dustAndDeadTest.spawnZombieAt("brute", state.player.x, state.player.z + 13);
    window.__dustAndDeadTest.setAimTarget(first.x, first.z);
    const markFired = window.__dustAndDeadTest.shootOnce();
    const marked = read();

    window.__dustAndDeadTest.clearEnemies();
    const reused = window.__dustAndDeadTest.spawnZombieAt("brute", state.player.x, state.player.z + 8);
    const afterReuse = read();

    window.__dustAndDeadTest.grantUpgrade("heavensBounty");
    window.__dustAndDeadTest.grantUpgrade("hallowedGround");
    window.__dustAndDeadTest.clearEnemies();
    window.__dustAndDeadTest.setAmmo("coachGun", 2, 0);
    state = read();
    const elite = window.__dustAndDeadTest.spawnZombieAt("brute", state.player.x, state.player.z + 6);
    window.__dustAndDeadTest.setAimTarget(elite.x, elite.z);
    window.__dustAndDeadTest.shootOnce();
    if (read().enemyCount > 0) window.__dustAndDeadTest.shootOnce();
    const duringHallowed = read();
    window.advanceTime(4000);
    window.advanceTime(4000);
    window.advanceTime(1000);
    const afterHallowed = read();

    return { first, markFired, marked, reused, afterReuse, duringHallowed, afterHallowed };
  });

  expect(result.markFired).toBe(true);
  const markedEnemy = result.marked.enemies.find((enemy) => enemy.groupId === result.first.groupId);
  expect(markedEnemy).toBeTruthy();
  expect(markedEnemy.marked).toBe(true);
  expect(markedEnemy.markTimer).toBeGreaterThan(0);
  expect(result.reused.groupId).toBe(result.first.groupId);
  const reusedEnemy = result.afterReuse.enemies.find((enemy) => enemy.groupId === result.reused.groupId);
  expect(reusedEnemy).toMatchObject({ marked: false, bounty: false, markTimer: 0, bountyTimer: 0, stunTimer: 0, fearTimer: 0 });

  expect(result.duringHallowed.progression.marshalSpecial.activeHallowedGrounds).toBe(1);
  expect(result.duringHallowed.progression.marshalSpecial.hallowedVisualPool.inUse).toBe(1);
  expect(result.afterHallowed.progression.marshalSpecial.activeHallowedGrounds).toBe(0);
  expect(result.afterHallowed.progression.marshalSpecial.hallowedVisualPool.inUse).toBe(0);
  expect(result.afterHallowed.progression.marshalSpecial.hallowedVisualPool.created).toBe(result.duringHallowed.progression.marshalSpecial.hallowedVisualPool.created);
});

test("gunslinger gets a level ten revolver upgrade choice", async ({ page }) => {
  const upgrades = [
    { id: "dualRevolvers", magazine: 12, damage: 2, crateReserve: 65, ammoPickupBonus: 24, magazineBonus: 6, bulletWidth: 0.14, bulletLength: 0.82, bulletRange: 22.04 },
    { id: "bigIron", magazine: 6, damage: 4, crateReserve: 51, ammoPickupBonus: 12, magazineBonus: 0, bulletWidth: 0.252, bulletLength: 1.271, bulletRange: 23.23 },
  ];

  for (const upgrade of upgrades) {
    await startHunt(page, `mapSeed=7&upgrade=${upgrade.id}`);
    await page.waitForFunction(() => typeof window.advanceTime === "function" && typeof window.render_game_to_text === "function");

    let state = await page.evaluate(() => {
      window.__dustAndDeadTest.clearEnemies();
      window.__dustAndDeadTest.grantXp(240);
      return JSON.parse(window.render_game_to_text());
    });

    expect(state.mode, `class choice before ${upgrade.id}`).toBe("class-choice");
    expect(await page.evaluate(() => window.__dustAndDeadTest.chooseClass("gunslinger")), `choose gunslinger before ${upgrade.id}`).toBe(true);
    await page.evaluate(() => window.__dustAndDeadTest.forceAllStandardUpgrades("swiftBoots"));
    state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
    expect(state.mode, `mode after gunslinger before ${upgrade.id}`).toBe("playing");

    state = await page.evaluate(() => {
      window.__dustAndDeadTest.grantXp(1200);
      return JSON.parse(window.render_game_to_text());
    });

    expect(state.mode, `revolver upgrade choice for ${upgrade.id}`).toBe("revolver-upgrade");
    expect(state.progression.level, `level for ${upgrade.id}`).toBeGreaterThanOrEqual(10);
    expect(state.progression.revolverUpgradePending, `pending revolver upgrade for ${upgrade.id}`).toBe(true);
    await expect(page.getByRole("button", { name: upgrade.id === "dualRevolvers" ? /Dual Revolvers/ : /Big Iron/ })).toBeVisible();

    const chosen = await page.evaluate((id) => window.__dustAndDeadTest.chooseRevolverUpgrade(id), upgrade.id);
    expect(chosen, `choose revolver upgrade ${upgrade.id}`).toBe(true);
    await page.evaluate(() => window.__dustAndDeadTest.forceAllStandardUpgrades("swiftBoots"));
    state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));

    expect(state.mode, `mode after ${upgrade.id}`).toBe("playing");
    expect(state.progression.revolverUpgrade, `upgrade after ${upgrade.id}`).toBe(upgrade.id);
    expect(state.progression.revolverUpgradePending, `pending after ${upgrade.id}`).toBe(false);
    expect(state.progression.revolverMagazineBonus, `magazine bonus after ${upgrade.id}`).toBe(upgrade.magazineBonus);
    expect(state.progression.revolverAmmoPickupBonus, `crate bonus after ${upgrade.id}`).toBe(upgrade.ammoPickupBonus);
    expect(state.ammo.weapons.revolver.magazine, `magazine after ${upgrade.id}`).toBe(upgrade.magazine);
    expect(state.ammo.weapons.revolver.damage, `damage after ${upgrade.id}`).toBe(upgrade.damage);

    await page.evaluate(() => {
      const state = JSON.parse(window.render_game_to_text());
      window.__dustAndDeadTest.setAmmo("revolver", 0, 0);
      window.__dustAndDeadTest.spawnAmmoCrateAt(state.player.x, state.player.z);
      window.__dustAndDeadTest.collectNearestAmmoCrate();
    });
    state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
    expect(state.ammo.weapons.revolver.reserve, `crate reserve after ${upgrade.id}`).toBe(upgrade.crateReserve);

    await page.evaluate(() => {
      const state = JSON.parse(window.render_game_to_text());
      window.__dustAndDeadTest.clearEnemies();
      window.__dustAndDeadTest.setAmmo("revolver", state.ammo.weapons.revolver.magazine, 0);
      window.__dustAndDeadTest.setAimTarget(state.player.x, state.player.z + 14);
      window.__dustAndDeadTest.spawnZombieAt("walker", state.player.x, state.player.z + 4);
      window.__dustAndDeadTest.spawnZombieAt("walker", state.player.x, state.player.z + 6);
    });

    const shot = await page.evaluate(() => {
      const before = JSON.parse(window.render_game_to_text());
      const fired = window.__dustAndDeadTest.shootOnce();
      const after = JSON.parse(window.render_game_to_text());
      return {
        fired,
        beforeKills: before.kills,
        projectile: after.projectiles[0],
      };
    });
    expect(shot.fired, `fire revolver after ${upgrade.id}`).toBe(true);
    expect(shot.projectile.speed, `projectile speed after ${upgrade.id}`).toBe(upgrade.id === "bigIron" ? 17.98 : 29);
    expect(shot.projectile.range, `projectile range after ${upgrade.id}`).toBe(upgrade.bulletRange);
    expect(shot.projectile.visualWidth, `projectile visual width after ${upgrade.id}`).toBe(upgrade.bulletWidth);
    expect(shot.projectile.visualLength, `projectile visual length after ${upgrade.id}`).toBe(upgrade.bulletLength);
    expect(shot.projectile.piercing, `projectile piercing after ${upgrade.id}`).toBe(upgrade.id === "bigIron");

    state = await page.evaluate(() => {
      window.advanceTime(420);
      return JSON.parse(window.render_game_to_text());
    });
    if (upgrade.id === "bigIron") {
      expect(state.kills - shot.beforeKills, "Big Iron pierces through two walkers").toBe(2);
      expect(state.projectiles[0]?.pierced || 0, "Big Iron pierced count").toBeGreaterThanOrEqual(2);
    } else {
      expect(state.kills - shot.beforeKills, "Dual Revolvers normal bullet stops on first walker").toBe(1);
    }
  }
});

test("revolver branch specials appear every third level after ten", async ({ page }) => {
  await startHunt(page, `mapSeed=7`);
  await page.waitForFunction(() => typeof window.advanceTime === "function" && typeof window.render_game_to_text === "function");

  const state = await page.evaluate(() => {
    const read = () => JSON.parse(window.render_game_to_text());
    const levelOnce = () => {
      const state = read();
      window.__dustAndDeadTest.grantXp(state.progression.xpToNext);
      return read();
    };
    const takeNormal = () => window.__dustAndDeadTest.forceStandardUpgrade("swiftBoots");

    window.__dustAndDeadTest.clearEnemies();
    while (read().progression.level < 5) {
      levelOnce();
      if (read().mode === "level-up") takeNormal();
    }
    window.__dustAndDeadTest.chooseClass("gunslinger");
    while (read().progression.level < 10) {
      levelOnce();
      if (read().mode === "level-up") takeNormal();
    }
    window.__dustAndDeadTest.chooseRevolverUpgrade("dualRevolvers");
    while (read().progression.level < 12) {
      levelOnce();
      if (read().mode === "level-up") takeNormal();
    }
    levelOnce();
    return read();
  });

  const dualSpecialIds = new Set([
    "ricochetRounds",
    "softAim",
    "fanTheHammer",
    "allRightAllLeft",
    "moreRicochets",
    "trickShot",
    "duelistFocus",
  ]);
  const standardIds = new Set(["swiftBoots", "steadyHand", "quickReload", "hairTrigger", "scavengerLuck", "grit", "desertMender", "luckyMagnet", "xpHunger", "longReach"]);
  const specialChoices = state.progression.standardUpgradeChoices.filter((id) => dualSpecialIds.has(id));
  const standardChoices = state.progression.standardUpgradeChoices.filter((id) => standardIds.has(id));

  expect(state.mode).toBe("level-up");
  expect(state.progression.level).toBe(13);
  expect(state.progression.revolverSpecialLevel).toBe(true);
  expect(state.progression.standardUpgradeChoices).toHaveLength(3);
  expect(specialChoices).toHaveLength(2);
  expect(standardChoices).toHaveLength(1);
});

test("ranger gets a level ten rifle branch choice", async ({ page }) => {
  const branches = [
    { id: "leverBarrage", label: /Lever Barrage/, rifleAmmoPickupBonus: 36, crateReserve: 109, icon: "rifle" },
    { id: "trailWarden", label: /Trail Warden/, rifleAmmoPickupBonus: 0, crateReserve: 65, icon: "rifleTrap" },
  ];

  for (const branch of branches) {
    await startHunt(page, `mapSeed=7&rifle=${branch.id}`);
    await page.waitForFunction(() => typeof window.advanceTime === "function" && typeof window.render_game_to_text === "function");

    let state = await page.evaluate(() => {
      window.__dustAndDeadTest.clearEnemies();
      window.__dustAndDeadTest.grantXp(240);
      return JSON.parse(window.render_game_to_text());
    });

    expect(state.mode, `class choice before ${branch.id}`).toBe("class-choice");
    expect(await page.evaluate(() => window.__dustAndDeadTest.chooseClass("ranger")), `choose ranger before ${branch.id}`).toBe(true);
    await page.evaluate(() => window.__dustAndDeadTest.forceAllStandardUpgrades("swiftBoots"));
    state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
    expect(state.mode, `mode after ranger before ${branch.id}`).toBe("playing");
    expect(state.weapon, `weapon after ranger before ${branch.id}`).toBe("rifle");

    state = await page.evaluate(() => {
      window.__dustAndDeadTest.grantXp(1200);
      return JSON.parse(window.render_game_to_text());
    });

    expect(state.mode, `rifle upgrade choice for ${branch.id}`).toBe("rifle-upgrade");
    expect(state.progression.level, `level for ${branch.id}`).toBeGreaterThanOrEqual(10);
    expect(state.progression.rifleUpgradePending, `pending rifle upgrade for ${branch.id}`).toBe(true);
    await expect(page.getByRole("button", { name: branch.label })).toBeVisible();

    const centers = await page.evaluate(() => {
      const panel = document.getElementById("rifle-upgrade").getBoundingClientRect();
      return Array.from(document.querySelectorAll("#rifle-upgrade .class-card__mark")).map((mark) => {
        const rect = mark.getBoundingClientRect();
        return Number((rect.top + rect.height / 2 - panel.top).toFixed(2));
      });
    });
    expect(Math.max(...centers) - Math.min(...centers)).toBeLessThanOrEqual(1);
    const icon = await page.evaluate((id) => {
      const svg = document.querySelector(`[data-rifle-upgrade="${id}"] [data-weapon-icon]`);
      return {
        id: svg ? svg.getAttribute("data-weapon-icon") : null,
        shapeCount: svg ? svg.querySelectorAll("path,circle,line,polyline,polygon,rect").length : 0,
      };
    }, branch.id);
    expect(icon.id, `rifle branch icon for ${branch.id}`).toBe(branch.icon);
    expect(icon.shapeCount, `rifle branch icon shapes for ${branch.id}`).toBeGreaterThan(0);

    const chosen = await page.evaluate((id) => window.__dustAndDeadTest.chooseRifleUpgrade(id), branch.id);
    expect(chosen, `choose rifle branch ${branch.id}`).toBe(true);
    await page.evaluate(() => window.__dustAndDeadTest.forceAllStandardUpgrades("swiftBoots"));
    state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));

    expect(state.mode, `mode after ${branch.id}`).toBe("playing");
    expect(state.progression.rifleUpgrade, `branch after ${branch.id}`).toBe(branch.id);
    expect(state.progression.rifleUpgradePending, `pending after ${branch.id}`).toBe(false);
    expect(state.progression.rifleAmmoPickupBonus, `rifle crate bonus after ${branch.id}`).toBe(branch.rifleAmmoPickupBonus);
    expect(state.ammo.weapons.rifle.magazine, `base rifle magazine after ${branch.id}`).toBe(18);

    await page.evaluate(() => {
      const state = JSON.parse(window.render_game_to_text());
      window.__dustAndDeadTest.setAmmo("rifle", 0, 0);
      window.__dustAndDeadTest.spawnAmmoCrateAt(state.player.x, state.player.z);
      window.__dustAndDeadTest.collectNearestAmmoCrate();
    });
    state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
    expect(state.ammo.weapons.rifle.reserve, `rifle crate reserve after ${branch.id}`).toBe(branch.crateReserve);
  }
});

test("rifle branch specials appear every third level after ten", async ({ page }) => {
  const branchCases = [
    { branch: "leverBarrage", specialIds: new Set(["extendedTube", "trailLoader", "chainLightning", "leverEcho", "redLine", "pinDown"]) },
    { branch: "trailWarden", specialIds: new Set(["snapTraps", "trailLayer"]) },
  ];
  const standardIds = new Set(["swiftBoots", "steadyHand", "quickReload", "hairTrigger", "scavengerLuck", "grit", "desertMender", "luckyMagnet", "xpHunger", "longReach"]);

  for (const branchCase of branchCases) {
    await startHunt(page, `mapSeed=7&rifleSpecial=${branchCase.branch}`);
    await page.waitForFunction(() => typeof window.advanceTime === "function" && typeof window.render_game_to_text === "function");

    const state = await page.evaluate((branch) => {
      const read = () => JSON.parse(window.render_game_to_text());
      const levelOnce = () => {
        const state = read();
        window.__dustAndDeadTest.grantXp(state.progression.xpToNext);
        return read();
      };
      const takeNormal = () => window.__dustAndDeadTest.forceStandardUpgrade("swiftBoots");

      window.__dustAndDeadTest.clearEnemies();
      while (read().progression.level < 5) {
        levelOnce();
        if (read().mode === "level-up") takeNormal();
      }
      window.__dustAndDeadTest.chooseClass("ranger");
      while (read().progression.level < 10) {
        levelOnce();
        if (read().mode === "level-up") takeNormal();
      }
      window.__dustAndDeadTest.chooseRifleUpgrade(branch);
      while (read().progression.level < 12) {
        levelOnce();
        if (read().mode === "level-up") takeNormal();
      }
      levelOnce();
      return read();
    }, branchCase.branch);

    const specialChoices = state.progression.standardUpgradeChoices.filter((id) => branchCase.specialIds.has(id));
    const standardChoices = state.progression.standardUpgradeChoices.filter((id) => standardIds.has(id));

    expect(state.mode, `mode for ${branchCase.branch}`).toBe("level-up");
    expect(state.progression.level, `level for ${branchCase.branch}`).toBe(13);
    expect(state.progression.rifleSpecialLevel, `special level for ${branchCase.branch}`).toBe(true);
    expect(state.progression.standardUpgradeChoices, `choices for ${branchCase.branch}`).toHaveLength(3);
    expect(specialChoices, `special choices for ${branchCase.branch}`).toHaveLength(2);
    expect(standardChoices, `standard choices for ${branchCase.branch}`).toHaveLength(1);

    const icons = await page.evaluate(() =>
      Array.from(document.querySelectorAll("#level-up-options .upgrade-card__symbol")).map((symbol) => ({
        text: symbol.textContent.trim(),
        svgCount: symbol.querySelectorAll("svg").length,
        shapeCount: symbol.querySelectorAll("path,circle,line,polyline,polygon,rect").length,
      }))
    );
    expect(icons.every((icon) => icon.text === "")).toBe(true);
    expect(icons.every((icon) => icon.svgCount === 1 && icon.shapeCount > 0)).toBe(true);
  }
});

test("lever barrage upgrades double the rifle, chain lightning, speed up, and refill", async ({ page }) => {
  await startHunt(page, `mapSeed=7`);
  await page.waitForFunction(() => typeof window.advanceTime === "function" && typeof window.render_game_to_text === "function");

  const result = await page.evaluate(() => {
    const read = () => JSON.parse(window.render_game_to_text());
    const forceUpgrade = (id) => {
      const state = read();
      window.__dustAndDeadTest.grantXp(state.progression.xpToNext);
      const forced = window.__dustAndDeadTest.forceStandardUpgrade(id);
      if (!forced) throw new Error(`Could not force ${id}`);
      return read();
    };

    window.__dustAndDeadTest.clearEnemies();
    window.__dustAndDeadTest.grantXp(240);
    window.__dustAndDeadTest.chooseClass("ranger");
    window.__dustAndDeadTest.forceAllStandardUpgrades("swiftBoots");
    window.__dustAndDeadTest.grantXp(1200);
    window.__dustAndDeadTest.chooseRifleUpgrade("leverBarrage");
    window.__dustAndDeadTest.forceAllStandardUpgrades("swiftBoots");

    forceUpgrade("extendedTube");
    forceUpgrade("chainLightning");
    forceUpgrade("stormTempo");
    forceUpgrade("trailLoader");
    const afterUpgrades = read();

    window.__dustAndDeadTest.setAmmo("rifle", 0, 0);
    window.__dustAndDeadTest.spawnAmmoCrateAt(afterUpgrades.player.x, afterUpgrades.player.z);
    window.__dustAndDeadTest.collectNearestAmmoCrate();
    const afterExtendedTubeCrate = read();

    window.__dustAndDeadTest.clearEnemies();
    window.__dustAndDeadTest.setAmmo("rifle", 4, 0);
    const setup = read();
    window.__dustAndDeadTest.setAimTarget(setup.player.x, setup.player.z + 12);
    window.__dustAndDeadTest.spawnZombieAt("walker", setup.player.x, setup.player.z + 4);
    window.__dustAndDeadTest.spawnZombieAt("walker", setup.player.x + 2.4, setup.player.z + 4.3);
    window.__dustAndDeadTest.spawnZombieAt("walker", setup.player.x + 4.8, setup.player.z + 4.6);
    window.__dustAndDeadTest.spawnZombieAt("walker", setup.player.x + 7.2, setup.player.z + 4.9);
    const beforeShot = read();
    const beforeAudio = window.__dustAndDeadTest.getAudioDiagnostics();
    const beforeLightningPool = window.__dustAndDeadTest.getThreeObjectDiagnostics().pools.lightningBoltVisuals;
    for (let i = 0; i < 4; i++) window.__dustAndDeadTest.shootOnce();
    const afterShotAudio = window.__dustAndDeadTest.getAudioDiagnostics();
    const afterShots = read();
    window.advanceTime(110);
    const duringLightning = read();
    const duringLightningPool = window.__dustAndDeadTest.getThreeObjectDiagnostics().pools.lightningBoltVisuals;
    window.advanceTime(650);
    const afterLightning = read();
    const afterLightningPool = window.__dustAndDeadTest.getThreeObjectDiagnostics().pools.lightningBoltVisuals;

    return {
      afterUpgrades,
      afterExtendedTubeCrate,
      beforeShot,
      afterShots,
      duringLightning,
      afterLightning,
      beforeLightningPool,
      duringLightningPool,
      afterLightningPool,
      audioNodesScheduled: afterShotAudio.transientAudioNodeCount - beforeAudio.transientAudioNodeCount,
    };
  });

  expect(result.afterUpgrades.progression.upgrades.extendedTube).toBe(1);
  expect(result.afterUpgrades.progression.upgrades.chainLightning).toBe(1);
  expect(result.afterUpgrades.progression.upgrades.stormTempo).toBe(1);
  expect(result.afterUpgrades.progression.upgrades.trailLoader).toBe(1);
  expect(result.afterUpgrades.progression.rifleSpecial.magazineMultiplier).toBe(2);
  expect(result.afterUpgrades.progression.rifleAmmoPickupBonus).toBe(72);
  expect(result.afterUpgrades.ammo.weapons.rifle.magazine).toBe(36);
  expect(result.afterExtendedTubeCrate.ammo.weapons.rifle.reserve).toBe(152);
  expect(result.afterShots.projectiles.some((projectile) => projectile.chainLightning && projectile.lightningTargets === 4)).toBe(true);
  const chargedShot = result.afterShots.projectiles.find((projectile) => projectile.chainLightning);
  expect(chargedShot.electricVisual).toBe(true);
  expect(chargedShot.electricBoltCount).toBeGreaterThanOrEqual(5);
  expect(chargedShot.electricRingCount).toBeGreaterThanOrEqual(2);
  expect(result.duringLightning.effects.lightningBolts).toBeGreaterThan(0);
  expect(result.duringLightningPool.instanced).toBe(true);
  expect(result.duringLightningPool.inUse).toBe(result.duringLightning.effects.lightningBolts);
  expect(result.duringLightningPool.drawCalls).toBeLessThanOrEqual(result.duringLightningPool.inUse * 3);
  expect(result.duringLightningPool.mainInstances).toBe(result.duringLightningPool.inUse * 7);
  expect(result.duringLightningPool.branchInstances).toBe(result.duringLightningPool.inUse * 5);
  expect(result.duringLightningPool.glowInstances).toBe(result.duringLightningPool.inUse * 12);
  expect(result.afterLightningPool.inUse).toBe(0);
  expect(result.afterLightningPool.available).toBe(result.afterLightningPool.created);
  expect(result.afterLightningPool.created).toBeGreaterThanOrEqual(result.beforeLightningPool.created);
  expect(result.audioNodesScheduled).toBeGreaterThanOrEqual(80);
  expect(result.afterLightning.progression.rifleSpecial.lightningStrikes).toBeGreaterThanOrEqual(4);
  expect(result.afterLightning.kills - result.beforeShot.kills).toBe(4);
  expect(result.afterLightning.progression.rifleSpecial.stormTempoTimer).toBeGreaterThan(0);
  expect(result.afterLightning.ammo.weapons.rifle.cooldown).toBeLessThan(result.beforeShot.ammo.weapons.rifle.cooldown);
  expect(result.afterLightning.ammo.weapons.rifle.current).toBe(3);
});

test("rifle ammo rack marks chain lightning rounds by actual future shot count", async ({ page }) => {
  await startHunt(page, `mapSeed=7`);
  await page.waitForFunction(() => typeof window.advanceTime === "function" && typeof window.render_game_to_text === "function");

  const result = await page.evaluate(() => {
    const read = () => JSON.parse(window.render_game_to_text());
    const readAmmoRounds = () =>
      Array.from(document.querySelectorAll("#ammo-cartridge-rack .ammo-round")).map((round) => ({
        index: Number(round.dataset.index),
        spent: round.classList.contains("is-spent"),
        electric: round.classList.contains("is-chain-lightning-round"),
      }));
    const forceUpgrade = (id) => {
      const state = read();
      window.__dustAndDeadTest.grantXp(state.progression.xpToNext);
      const forced = window.__dustAndDeadTest.forceStandardUpgrade(id);
      if (!forced) throw new Error(`Could not force ${id}`);
      return read();
    };

    window.__dustAndDeadTest.clearEnemies();
    window.__dustAndDeadTest.grantXp(240);
    window.__dustAndDeadTest.chooseClass("ranger");
    window.__dustAndDeadTest.forceAllStandardUpgrades("swiftBoots");
    window.__dustAndDeadTest.grantXp(1200);
    window.__dustAndDeadTest.chooseRifleUpgrade("leverBarrage");
    window.__dustAndDeadTest.forceAllStandardUpgrades("swiftBoots");
    forceUpgrade("chainLightning");

    const setup = read();
    window.__dustAndDeadTest.setAmmo("rifle", 6, 0);
    const zeroOffsetRack = readAmmoRounds();
    window.__dustAndDeadTest.setAimTarget(setup.player.x, setup.player.z + 12);
    window.__dustAndDeadTest.shootOnce();
    window.advanceTime(1700);
    window.__dustAndDeadTest.setAmmo("rifle", 6, 0);
    const oneShotOffsetRack = readAmmoRounds();
    const afterOneShot = read();

    return {
      zeroOffsetRack,
      oneShotOffsetRack,
      afterOneShot,
    };
  });

  const zeroOffsetElectric = result.zeroOffsetRack.filter((round) => round.electric);
  const oneShotOffsetElectric = result.oneShotOffsetRack.filter((round) => round.electric);
  expect(result.afterOneShot.progression.upgrades.chainLightning).toBe(1);
  expect(result.afterOneShot.progression.rifleSpecial.shotsFired).toBe(1);
  expect(zeroOffsetElectric.map((round) => round.index)).toEqual([2]);
  expect(zeroOffsetElectric.every((round) => !round.spent)).toBe(true);
  expect(oneShotOffsetElectric.map((round) => round.index)).toEqual([3]);
  expect(oneShotOffsetElectric.every((round) => !round.spent)).toBe(true);
});

test("trail warden upgrades lure zombies, plant traps, and salvage ammo and xp", async ({ page }) => {
  await startHunt(page, `mapSeed=7`);
  await page.waitForFunction(() => typeof window.advanceTime === "function" && typeof window.render_game_to_text === "function");

  const result = await page.evaluate(() => {
    const read = () => JSON.parse(window.render_game_to_text());
    const forceUpgrade = (id) => {
      const state = read();
      window.__dustAndDeadTest.grantXp(state.progression.xpToNext);
      const forced = window.__dustAndDeadTest.forceStandardUpgrade(id);
      if (!forced) throw new Error(`Could not force ${id}`);
      return read();
    };

    window.__dustAndDeadTest.clearEnemies();
    window.__dustAndDeadTest.grantXp(240);
    window.__dustAndDeadTest.chooseClass("ranger");
    window.__dustAndDeadTest.forceAllStandardUpgrades("swiftBoots");
    window.__dustAndDeadTest.grantXp(1200);
    window.__dustAndDeadTest.chooseRifleUpgrade("trailWarden");
    window.__dustAndDeadTest.forceAllStandardUpgrades("swiftBoots");

    forceUpgrade("snapTraps");
    forceUpgrade("baitedTrap");
    const afterTrailLayer = forceUpgrade("trailLayer");
    const afterOneQuicker = forceUpgrade("quickerTrail");
    for (let i = 1; i < 8; i++) forceUpgrade("quickerTrail");
    forceUpgrade("powderTrap");
    forceUpgrade("salvagedTrap");
    const afterUpgrades = read();

    window.__dustAndDeadTest.clearEnemies();
    window.advanceTime(900);
    const beforeAutoTrapSpawn = read();
    window.advanceTime(220);
    const autoTrap = read();

    window.__dustAndDeadTest.clearEnemies();
    const setup = read();
    window.__dustAndDeadTest.spawnZombieAt("walker", setup.player.x + 6, setup.player.z);
    const beforeLure = read();
    const beforeLureDistance = Math.hypot(beforeLure.enemies[0].x - beforeLure.player.x, beforeLure.enemies[0].z - beforeLure.player.z);
    window.advanceTime(700);
    const afterLure = read();
    const afterLureDistance = Math.hypot(afterLure.enemies[0].x - afterLure.player.x, afterLure.enemies[0].z - afterLure.player.z);

    window.__dustAndDeadTest.clearEnemies();
    for (let i = 0; i < 22; i++) window.advanceTime(1000);
    const persistentAutoTraps = read();

    window.__dustAndDeadTest.clearEnemies();
    window.__dustAndDeadTest.setAmmo("rifle", 1, 0);
    const trapSetup = read();
    window.__dustAndDeadTest.setAimTarget(trapSetup.player.x, trapSetup.player.z + 9);
    window.__dustAndDeadTest.spawnZombieAt("brute", trapSetup.player.x, trapSetup.player.z + 4);
    const beforeTrapShot = read();
    window.__dustAndDeadTest.shootOnce();
    window.advanceTime(90);
    const plantedTrap = read();
    window.advanceTime(360);
    const afterTrap = read();

    return {
      afterTrailLayer,
      afterOneQuicker,
      afterUpgrades,
      beforeAutoTrapSpawn,
      autoTrap,
      persistentAutoTraps,
      beforeLureDistance,
      afterLureDistance,
      beforeTrapShot,
      plantedTrap,
      afterTrap,
    };
  });

  expect(result.afterUpgrades.progression.upgrades.snapTraps).toBe(1);
  expect(result.afterUpgrades.progression.upgrades.baitedTrap).toBe(1);
  expect(result.afterUpgrades.progression.upgrades.trailLayer).toBe(1);
  expect(result.afterUpgrades.progression.upgrades.quickerTrail).toBe(8);
  expect(result.afterUpgrades.progression.upgrades.powderTrap).toBe(1);
  expect(result.afterUpgrades.progression.upgrades.salvagedTrap).toBe(1);
  expect(result.afterTrailLayer.progression.rifleSpecial.autoTrapInterval).toBe(5);
  expect(result.afterOneQuicker.progression.rifleSpecial.autoTrapInterval).toBe(4.5);
  expect(result.afterUpgrades.progression.rifleSpecial.autoTrapInterval).toBe(1);
  expect(result.afterUpgrades.progression.rifleSpecial.autoTrapMinInterval).toBe(1);
  expect(result.beforeAutoTrapSpawn.progression.rifleSpecial.activeTraps).toBe(0);
  expect(result.autoTrap.rifleTraps[0].lure).toBe(true);
  expect(result.autoTrap.rifleTraps[0].permanent).toBe(true);
  expect(result.autoTrap.rifleTraps[0].life).toBeNull();
  expect(result.autoTrap.rifleTraps[0].blastRadius).toBeGreaterThan(3.05);
  expect(result.persistentAutoTraps.progression.rifleSpecial.activeTraps).toBeGreaterThan(18);
  expect(result.persistentAutoTraps.rifleTraps.every((trap) => trap.permanent && trap.life === null)).toBe(true);
  expect(result.afterLureDistance).toBeLessThan(result.beforeLureDistance);
  expect(result.plantedTrap.rifleTraps[0].lure).toBe(true);
  expect(result.plantedTrap.rifleTraps[0].blastRadius).toBeGreaterThan(3.05);
  expect(result.afterTrap.kills - result.beforeTrapShot.kills).toBe(1);
  expect(result.afterTrap.progression.rifleSpecial.trapTriggers).toBeGreaterThan(0);
  expect(result.afterTrap.progression.rifleSpecial.trapAmmoRestored).toBeGreaterThan(result.beforeTrapShot.progression.rifleSpecial.trapAmmoRestored);
  expect(result.afterTrap.progression.rifleSpecial.trapBonusXp).toBeGreaterThan(result.beforeTrapShot.progression.rifleSpecial.trapBonusXp);
  expect(result.afterTrap.ammo.weapons.rifle.current).toBeGreaterThan(0);
});

test("trail warden quicker trail stops appearing after one second auto-trap cap", async ({ page }) => {
  await startHunt(page, `mapSeed=7`);
  await page.waitForFunction(() => typeof window.advanceTime === "function" && typeof window.render_game_to_text === "function");

  const result = await page.evaluate(() => {
    const read = () => JSON.parse(window.render_game_to_text());
    const forceUpgrade = (id) => {
      const state = read();
      window.__dustAndDeadTest.grantXp(state.progression.xpToNext);
      const forced = window.__dustAndDeadTest.forceStandardUpgrade(id);
      if (!forced) throw new Error(`Could not force ${id}`);
      return read();
    };

    window.__dustAndDeadTest.clearEnemies();
    window.__dustAndDeadTest.grantXp(240);
    window.__dustAndDeadTest.chooseClass("ranger");
    window.__dustAndDeadTest.forceAllStandardUpgrades("swiftBoots");
    window.__dustAndDeadTest.grantXp(1200);
    window.__dustAndDeadTest.chooseRifleUpgrade("trailWarden");
    window.__dustAndDeadTest.forceAllStandardUpgrades("swiftBoots");

    forceUpgrade("snapTraps");
    forceUpgrade("baitedTrap");
    forceUpgrade("trailLayer");
    forceUpgrade("powderTrap");
    forceUpgrade("salvagedTrap");
    for (let i = 0; i < 8; i++) forceUpgrade("quickerTrail");

    const capped = read();
    let cappedOffer = null;
    for (let i = 0; i < 18 && !cappedOffer; i++) {
      const state = read();
      if (state.mode === "playing") window.__dustAndDeadTest.grantXp(state.progression.xpToNext);
      const offered = read();
      if (offered.progression.standardUpgradePending && offered.progression.rifleSpecialLevel) {
        cappedOffer = offered;
        break;
      }
      if (offered.progression.standardUpgradePending) {
        window.__dustAndDeadTest.forceStandardUpgrade("swiftBoots");
      }
    }

    return {
      capped,
      cappedOffer,
    };
  });

  expect(result.capped.progression.upgrades.quickerTrail).toBe(8);
  expect(result.capped.progression.rifleSpecial.autoTrapInterval).toBe(1);
  expect(result.capped.progression.rifleSpecial.autoTrapMinInterval).toBe(1);
  expect(result.cappedOffer).not.toBeNull();
  expect(result.cappedOffer.progression.rifleSpecialLevel).toBe(true);
  expect(result.cappedOffer.progression.standardUpgradeChoices).not.toContain("quickerTrail");
});

test("trail warden trap visuals are pooled and dense trap checks stay responsive", async ({ page }) => {
  await startHunt(page, `mapSeed=7`);
  await page.waitForFunction(() => typeof window.advanceTime === "function" && typeof window.render_game_to_text === "function");

  const result = await page.evaluate(() => {
    const api = window.__dustAndDeadTest;
    const read = () => JSON.parse(window.render_game_to_text());
    const forceUpgrade = (id) => {
      const state = read();
      window.__dustAndDeadTest.grantXp(state.progression.xpToNext);
      const forced = window.__dustAndDeadTest.forceStandardUpgrade(id);
      if (!forced) throw new Error(`Could not force ${id}`);
      return read();
    };
    const spawnTrapBatch = (count) => {
      const state = read();
      const traps = [];
      for (let i = 0; i < count; i++) {
        traps.push(window.__dustAndDeadTest.spawnRifleTrapAt(state.player.x, state.player.z));
      }
      return traps;
    };

    window.__dustAndDeadTest.clearEnemies();
    window.__dustAndDeadTest.grantXp(240);
    window.__dustAndDeadTest.chooseClass("ranger");
    window.__dustAndDeadTest.forceAllStandardUpgrades("swiftBoots");
    window.__dustAndDeadTest.grantXp(1200);
    const warmupBeforeChoice = api.getRifleTrapOptimizationStats();
    const choseTrail = api.chooseRifleUpgrade("trailWarden");
    const warmupAfterChoice = api.getRifleTrapOptimizationStats();
    window.__dustAndDeadTest.forceAllStandardUpgrades("swiftBoots");
    forceUpgrade("snapTraps");
    forceUpgrade("baitedTrap");
    forceUpgrade("powderTrap");

    // Background GPU/visual warmups are intentionally limited to one heavy
    // job per displayed frame. Model live frames (up to six seconds) so this
    // test exercises the production scheduler instead of one synthetic RAF.
    for (let frame = 0; frame < 360; frame += 1) {
      const warmup = api.getRifleTrapOptimizationStats().visuals;
      if (warmup.created >= warmup.activePrewarm) break;
      api.advanceRealFrame(1000 / 60, { render: false });
    }
    const before = api.getRifleTrapOptimizationStats();
    const objectsBefore = api.getThreeObjectDiagnostics().roots.effectRoot;
    const firstTraps = spawnTrapBatch(96);
    const afterFirst = window.__dustAndDeadTest.getRifleTrapOptimizationStats();
    const objectsAfterFirst = api.getThreeObjectDiagnostics().roots.effectRoot;
    window.__dustAndDeadTest.clearRifleTraps();
    const afterClear = window.__dustAndDeadTest.getRifleTrapOptimizationStats();
    const reusedTraps = spawnTrapBatch(96);
    const afterReuse = window.__dustAndDeadTest.getRifleTrapOptimizationStats();

    window.__dustAndDeadTest.clearEnemies();
    const setup = read();
    window.__dustAndDeadTest.spawnZombieAt("walker", setup.player.x, setup.player.z);
    const beforeTrigger = read();
    window.advanceTime(220);
    const afterTrigger = read();
    const afterTriggerStats = window.__dustAndDeadTest.getRifleTrapOptimizationStats();

    return {
      choseTrail,
      warmupBeforeChoice,
      warmupAfterChoice,
      before,
      objectsBefore,
      firstTraps,
      afterFirst,
      objectsAfterFirst,
      afterClear,
      reusedTraps,
      afterReuse,
      beforeTrigger,
      afterTrigger,
      afterTriggerStats,
    };
  });

  expect(result.choseTrail).toBe(true);
  expect(result.warmupAfterChoice.visuals.created).toBe(result.warmupBeforeChoice.visuals.created);
  expect(result.before.visuals.created).toBe(result.before.visuals.activePrewarm);
  expect(result.before.visuals.available).toBe(result.before.visuals.activePrewarm);
  expect(result.before.visuals.activePrewarm).toBeLessThan(result.before.maxTraps);
  expect(result.before.visuals.activePrewarm).toBeLessThanOrEqual(96);
  expect(result.before.visuals).toMatchObject({
    mode: "instanced",
    instanced: true,
    shaderValidated: true,
    capacity: 240,
    drawCalls: 0,
    fallbackInUse: 0,
  });
  expect(result.firstTraps.every(Boolean)).toBe(true);
  expect(result.afterFirst.visuals.inUse).toBe(96);
  expect(result.afterFirst.activeTraps).toBe(96);
  expect(result.afterFirst.visuals).toMatchObject({
    drawCalls: 3,
    estimatedRenderPasses: 4,
    ringInstances: 96,
    metalInstances: 192,
    woodInstances: 192,
    submittedRingInstances: 96,
    submittedMetalInstances: 192,
    submittedWoodInstances: 192,
    fallbackInUse: 0,
    meshCount: 3,
  });
  expect(result.objectsAfterFirst.meshes).toBe(result.objectsBefore.meshes);
  expect(result.objectsAfterFirst.groups).toBe(result.objectsBefore.groups);
  expect(result.afterClear.visuals.inUse).toBe(0);
  expect(result.afterClear.activeTraps).toBe(0);
  expect(result.afterClear.visuals.drawCalls).toBe(0);
  expect(result.afterClear.visuals.available).toBe(result.afterFirst.visuals.created);
  expect(result.reusedTraps.every(Boolean)).toBe(true);
  expect(result.afterReuse.visuals.created).toBe(result.afterFirst.visuals.created);
  expect(result.afterReuse.visuals.inUse).toBe(96);
  expect(result.afterReuse.visuals.drawCalls).toBe(3);
  expect(result.afterReuse.visuals.fallbackInUse).toBe(0);
  expect(new Set(result.firstTraps.map((trap) => trap.visualId))).toEqual(new Set(result.reusedTraps.map((trap) => trap.visualId)));
  expect(result.afterTrigger.kills - result.beforeTrigger.kills).toBe(1);
  expect(result.afterTrigger.progression.rifleSpecial.trapTriggers).toBeGreaterThan(0);
  expect(result.afterTriggerStats.visuals.inUse).toBeLessThan(result.afterReuse.visuals.inUse);
  expect(result.afterTriggerStats.visuals.created).toBe(result.afterReuse.visuals.created);
});

test("batched trap rings keep individual opacity and the legacy visual fallback remains available", async ({ page }) => {
  await startHunt(page, `mapSeed=7`);
  await page.waitForFunction(() => typeof window.advanceTime === "function" && typeof window.render_game_to_text === "function");

  const instanced = await page.evaluate(() => {
    const api = window.__dustAndDeadTest;
    const state = JSON.parse(window.render_game_to_text());
    api.clearEnemies();
    api.spawnRifleTrapAt(state.player.x - 0.7, state.player.z);
    window.advanceTime(500);
    api.spawnRifleTrapAt(state.player.x, state.player.z);
    window.advanceTime(500);
    api.spawnRifleTrapAt(state.player.x + 0.7, state.player.z);
    window.advanceTime(17);
    return api.getRifleTrapOptimizationStats();
  });

  expect(instanced.visuals).toMatchObject({
    mode: "instanced",
    instanced: true,
    shaderValidated: true,
    inUse: 3,
    drawCalls: 3,
    estimatedRenderPasses: 4,
    ringInstances: 3,
    metalInstances: 6,
    woodInstances: 6,
  });
  expect(instanced.visuals.opacityMax - instanced.visuals.opacityMin).toBeGreaterThan(0.005);

  await startHunt(page, `mapSeed=7&trapVisualFallback=1`);
  await page.waitForFunction(() => typeof window.advanceTime === "function" && typeof window.render_game_to_text === "function");
  const fallback = await page.evaluate(() => {
    const api = window.__dustAndDeadTest;
    const state = JSON.parse(window.render_game_to_text());
    api.clearEnemies();
    for (let index = 0; index < 3; index += 1) {
      api.spawnRifleTrapAt(state.player.x + index * 0.3, state.player.z);
    }
    window.advanceTime(17);
    return api.getRifleTrapOptimizationStats();
  });

  expect(fallback.activeTraps).toBe(3);
  expect(fallback.visuals).toMatchObject({
    mode: "fallback",
    instanced: false,
    fallbackReason: "forced-by-query",
    inUse: 3,
    fallbackInUse: 3,
    drawCalls: 15,
    ringInstances: 0,
    metalInstances: 0,
    woodInstances: 0,
    shaderValidated: false,
  });
});

test("dual revolver special upgrades ricochet, aim, and speed up", async ({ page }) => {
  await startHunt(page, `mapSeed=7`);
  await page.waitForFunction(() => typeof window.advanceTime === "function" && typeof window.render_game_to_text === "function");

  const result = await page.evaluate(() => {
    const read = () => JSON.parse(window.render_game_to_text());
    const forceUpgrade = (id) => {
      const state = read();
      window.__dustAndDeadTest.grantXp(state.progression.xpToNext);
      const forced = window.__dustAndDeadTest.forceStandardUpgrade(id);
      if (!forced) throw new Error(`Could not force ${id}`);
      return read();
    };

    window.__dustAndDeadTest.clearEnemies();
    window.__dustAndDeadTest.grantXp(240);
    window.__dustAndDeadTest.chooseClass("gunslinger");
    window.__dustAndDeadTest.forceAllStandardUpgrades("swiftBoots");
    window.__dustAndDeadTest.grantXp(1200);
    window.__dustAndDeadTest.chooseRevolverUpgrade("dualRevolvers");
    window.__dustAndDeadTest.forceAllStandardUpgrades("swiftBoots");

    forceUpgrade("ricochetRounds");
    forceUpgrade("moreRicochets");
    forceUpgrade("trickShot");
    forceUpgrade("softAim");
    forceUpgrade("duelistFocus");
    forceUpgrade("fanTheHammer");
    const afterUpgrades = read();
    window.__dustAndDeadTest.clearEnemies();
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyD" }));
    window.advanceTime(1500);
    window.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyD" }));
    const afterFocus = read();

    window.__dustAndDeadTest.clearEnemies();
    window.__dustAndDeadTest.setAmmo("revolver", 1, 0);
    const setup = read();
    window.__dustAndDeadTest.setAimTarget(setup.player.x, setup.player.z + 9);
    window.__dustAndDeadTest.spawnZombieAt("walker", setup.player.x, setup.player.z + 4);
    window.__dustAndDeadTest.spawnZombieAt("walker", setup.player.x + 3.1, setup.player.z + 4.2);
    window.__dustAndDeadTest.spawnZombieAt("walker", setup.player.x + 6.2, setup.player.z + 4.4);
    const beforeShot = read();
    window.__dustAndDeadTest.shootOnce();
    const afterShot = read();
    window.advanceTime(700);
    const afterRicochet = read();

    return { afterUpgrades, afterFocus, beforeShot, afterShot, afterRicochet };
  });

  expect(result.afterUpgrades.progression.upgrades.ricochetRounds).toBe(1);
  expect(result.afterUpgrades.progression.upgrades.moreRicochets).toBe(1);
  expect(result.afterUpgrades.progression.upgrades.softAim).toBe(1);
  expect(result.afterUpgrades.progression.upgrades.duelistFocus).toBe(1);
  expect(result.afterFocus.progression.revolverSpecial.duelistFocus).toBeGreaterThan(0.25);
  expect(result.afterUpgrades.progression.revolverSpecial.dualRicochets).toBe(2);
  expect(result.afterShot.projectiles[0].ricochetRemaining).toBe(2);
  expect(result.afterShot.projectiles[0].homing).toBeGreaterThan(0.29);
  expect(result.afterRicochet.kills - result.beforeShot.kills).toBe(3);
  expect(result.afterRicochet.progression.revolverSpecial.fanTheHammerTimer).toBeGreaterThan(0);
  expect(result.afterRicochet.ammo.weapons.revolver.cooldown).toBeLessThan(result.beforeShot.ammo.weapons.revolver.cooldown);
});

test("big iron special upgrades make heavy cascading shots", async ({ page }) => {
  await startHunt(page, `mapSeed=7`);
  await page.waitForFunction(() => typeof window.advanceTime === "function" && typeof window.render_game_to_text === "function");

  const result = await page.evaluate(() => {
    const read = () => JSON.parse(window.render_game_to_text());
    const readAmmoRounds = () =>
      Array.from(document.querySelectorAll("#ammo-cartridge-rack .ammo-round")).map((round) => ({
        index: Number(round.dataset.index),
        spent: round.classList.contains("is-spent"),
        silver: round.classList.contains("is-silver-bullet"),
      }));
    const forceUpgrade = (id) => {
      const state = read();
      window.__dustAndDeadTest.grantXp(state.progression.xpToNext);
      const forced = window.__dustAndDeadTest.forceStandardUpgrade(id);
      if (!forced) throw new Error(`Could not force ${id}`);
      return read();
    };

    window.__dustAndDeadTest.clearEnemies();
    window.__dustAndDeadTest.grantXp(240);
    window.__dustAndDeadTest.chooseClass("gunslinger");
    window.__dustAndDeadTest.forceAllStandardUpgrades("swiftBoots");
    window.__dustAndDeadTest.grantXp(1200);
    window.__dustAndDeadTest.chooseRevolverUpgrade("bigIron");
    window.__dustAndDeadTest.forceAllStandardUpgrades("swiftBoots");

    forceUpgrade("silverBullet");
    forceUpgrade("silverCache");
    forceUpgrade("biggerCaliber");
    forceUpgrade("throughAndThrough");
    forceUpgrade("heavyRupture");
    forceUpgrade("leadBloom");
    forceUpgrade("executioner");
    const afterUpgrades = read();
    const silverAmmoSlots = readAmmoRounds();

    window.__dustAndDeadTest.clearEnemies();
    window.__dustAndDeadTest.setAmmo("revolver", 6, 0);
    let state = read();
    window.__dustAndDeadTest.setAimTarget(state.player.x, state.player.z + 20);
    for (let i = 0; i < 5; i++) window.__dustAndDeadTest.shootOnce();
    const afterFiveSilverShots = readAmmoRounds();
    window.__dustAndDeadTest.shootOnce();
    const afterSilver = read();
    window.advanceTime(1800);

    window.__dustAndDeadTest.setAmmo("revolver", 3, 0);
    state = read();
    window.__dustAndDeadTest.setAimTarget(state.player.x, state.player.z + 20);
    const partialProjectileStart = read().projectiles.length;
    for (let i = 0; i < 2; i++) window.__dustAndDeadTest.shootOnce();
    const afterPartialTwoSilverShots = readAmmoRounds();
    const afterPartialTwo = read();
    window.__dustAndDeadTest.shootOnce();
    const afterPartialSilver = read();
    const partialProjectiles = afterPartialSilver.projectiles.slice(partialProjectileStart);
    window.advanceTime(1800);

    window.__dustAndDeadTest.clearEnemies();
    window.__dustAndDeadTest.clearAmmoCrates();
    window.__dustAndDeadTest.setAmmoCrateTimer(9999);
    window.__dustAndDeadTest.setAmmo("revolver", 1, 0);
    state = read();
    window.__dustAndDeadTest.setAimTarget(state.player.x, state.player.z + 9);
    window.__dustAndDeadTest.spawnZombieAt("walker", state.player.x, state.player.z + 4);
    const beforeCacheFirst = read();
    window.__dustAndDeadTest.shootOnce();
    window.advanceTime(420);
    const afterCacheFirst = read();
    window.advanceTime(1600);

    window.__dustAndDeadTest.clearEnemies();
    window.__dustAndDeadTest.setAmmo("revolver", 1, 0);
    state = read();
    window.__dustAndDeadTest.setAimTarget(state.player.x, state.player.z + 9);
    window.__dustAndDeadTest.spawnZombieAt("walker", state.player.x, state.player.z + 4);
    const beforeCacheSecond = read();
    window.__dustAndDeadTest.shootOnce();
    window.advanceTime(420);
    const afterCacheSecond = read();
    window.advanceTime(1600);

    window.__dustAndDeadTest.clearEnemies();
    window.__dustAndDeadTest.setAmmo("revolver", 1, 0);
    state = read();
    window.__dustAndDeadTest.setAimTarget(state.player.x, state.player.z + 9);
    window.__dustAndDeadTest.spawnZombieAt("walker", state.player.x, state.player.z + 4);
    const beforeCacheThird = read();
    window.__dustAndDeadTest.shootOnce();
    window.advanceTime(420);
    const afterCacheThird = read();
    window.__dustAndDeadTest.collectNearestAmmoCrate();
    const afterCacheCollect = read();
    window.advanceTime(1600);

    window.__dustAndDeadTest.clearEnemies();
    window.__dustAndDeadTest.setAmmo("revolver", 6, 0);
    state = read();
    window.__dustAndDeadTest.setAimTarget(state.player.x, state.player.z + 14);
    window.__dustAndDeadTest.spawnZombieAt("brute", state.player.x, state.player.z + 4);
    window.__dustAndDeadTest.spawnZombieAt("brute", state.player.x, state.player.z + 8);
    const beforeThrough = read();
    window.__dustAndDeadTest.shootOnce();
    window.advanceTime(620);
    const afterThrough = read();

    window.__dustAndDeadTest.clearEnemies();
    window.__dustAndDeadTest.setAmmo("revolver", 6, 0);
    state = read();
    window.__dustAndDeadTest.setAimTarget(state.player.x, state.player.z + 10);
    window.__dustAndDeadTest.spawnZombieAt("walker", state.player.x, state.player.z + 4);
    const beforeBloom = read();
    window.__dustAndDeadTest.shootOnce();
    window.advanceTime(360);
    const afterBloom = read();

    window.__dustAndDeadTest.clearEnemies();
    window.__dustAndDeadTest.setAmmo("revolver", 6, 0);
    state = read();
    window.__dustAndDeadTest.setAimTarget(state.player.x, state.player.z + 26);
    window.__dustAndDeadTest.spawnZombieAt("walker", state.player.x, state.player.z + 4);
    window.__dustAndDeadTest.spawnZombieAt("runner", state.player.x + 1.05, state.player.z + 24);
    const beforeRupture = read();
    window.__dustAndDeadTest.shootOnce();
    window.advanceTime(1700);
    const afterRupture = read();

    return {
      afterUpgrades,
      silverAmmoSlots,
      afterFiveSilverShots,
      afterSilver,
      afterPartialTwoSilverShots,
      afterPartialTwo,
      afterPartialSilver,
      partialProjectiles,
      beforeCacheFirst,
      afterCacheFirst,
      beforeCacheSecond,
      afterCacheSecond,
      beforeCacheThird,
      afterCacheThird,
      afterCacheCollect,
      beforeThrough,
      afterThrough,
      beforeBloom,
      afterBloom,
      beforeRupture,
      afterRupture,
    };
  });

  expect(result.afterUpgrades.progression.upgrades.silverBullet).toBe(1);
  expect(result.afterUpgrades.progression.upgrades.silverCache).toBe(1);
  expect(result.afterUpgrades.progression.upgrades.biggerCaliber).toBe(1);
  expect(result.silverAmmoSlots.filter((slot) => slot.silver).map((slot) => slot.index)).toEqual([0]);
  expect(result.afterFiveSilverShots.find((slot) => slot.index === 0)).toMatchObject({ spent: false, silver: true });
  expect(result.afterFiveSilverShots.filter((slot) => slot.spent).map((slot) => slot.index)).toEqual([1, 2, 3, 4, 5]);
  expect(result.afterSilver.projectiles[0].visualWidth).toBeGreaterThan(0.252);
  expect(result.afterSilver.projectiles[0].hitRadius).toBeGreaterThan(0.24);
  expect(result.afterSilver.projectiles[0].range).toBeCloseTo(27.41, 2);
  expect(result.afterSilver.projectiles[5].silverBullet).toBe(true);
  expect(result.afterSilver.projectiles[5].damage).toBe(12);
  expect(result.afterSilver.projectiles[5].speed).toBeCloseTo(result.afterSilver.projectiles[0].speed * 1.3, 2);
  expect(result.afterSilver.projectiles[5].visualWidth).toBeCloseTo(result.afterSilver.projectiles[0].visualWidth * 1.5, 2);
  expect(result.afterSilver.projectiles[5].hitRadius).toBeCloseTo(result.afterSilver.projectiles[0].hitRadius * 1.5, 2);
  expect(result.afterSilver.projectiles[5].range).toBeCloseTo(result.afterSilver.projectiles[0].range * 1.95, 2);
  expect(result.afterPartialTwoSilverShots.find((slot) => slot.index === 0)).toMatchObject({ spent: false, silver: true });
  expect(result.afterPartialTwoSilverShots.filter((slot) => slot.spent).map((slot) => slot.index)).toEqual([1, 2, 3, 4, 5]);
  expect(result.afterPartialTwo.projectiles.slice(-2).every((projectile) => !projectile.silverBullet)).toBe(true);
  expect(result.partialProjectiles).toHaveLength(3);
  expect(result.partialProjectiles[2].silverBullet).toBe(true);
  expect(result.partialProjectiles[2].damage).toBe(12);
  expect(result.partialProjectiles[2].range).toBeCloseTo(result.partialProjectiles[0].range * 1.95, 2);
  expect(result.afterCacheFirst.kills - result.beforeCacheFirst.kills).toBe(1);
  expect(result.afterCacheFirst.progression.revolverSpecial.silverBulletAmmoKills).toBe(1);
  expect(result.afterCacheFirst.ammoCrates).toHaveLength(0);
  expect(result.afterCacheSecond.kills - result.beforeCacheSecond.kills).toBe(1);
  expect(result.afterCacheSecond.progression.revolverSpecial.silverBulletAmmoKills).toBe(2);
  expect(result.afterCacheSecond.ammoCrates).toHaveLength(0);
  expect(result.afterCacheThird.kills - result.beforeCacheThird.kills).toBe(1);
  expect(result.afterCacheThird.progression.revolverSpecial.silverBulletAmmoKills).toBe(0);
  expect(result.afterCacheThird.ammoCrates).toHaveLength(1);
  expect(result.afterCacheThird.ammoCrates[0]).toMatchObject({ type: "mini", mini: true });
  expect(result.afterCacheThird.ammoCrates[0].pickupScale).toBeCloseTo(1 / 3, 2);
  expect(result.afterCacheCollect.ammoCrates).toHaveLength(0);
  expect(result.afterCacheCollect.ammo.weapons.revolver.reserve).toBe(17);
  expect(result.afterThrough.kills - result.beforeThrough.kills).toBe(2);
  expect(result.afterBloom.projectiles.filter((p) => p.type === "leadBloom")).toHaveLength(2);
  expect(result.afterBloom.progression.revolverSpecial.leadBloomShots).toBeGreaterThanOrEqual(2);
  expect(result.afterRupture.progression.revolverSpecial.bigIronRuptures).toBeGreaterThanOrEqual(1);
  expect(result.afterRupture.kills - result.beforeRupture.kills).toBeGreaterThanOrEqual(2);
});

test("acid spitter appears after wave four and leaves damaging puddles", async ({ page }) => {
  await startHunt(page, `mapSeed=7`);
  await page.waitForFunction(() => typeof window.advanceTime === "function" && typeof window.render_game_to_text === "function");

  const typeSamples = await page.evaluate(() => ({
    wave4: window.__dustAndDeadTest.sampleZombieTypes(4, 120),
    wave5: window.__dustAndDeadTest.sampleZombieTypes(5, 120),
  }));

  expect(typeSamples.wave4.spitter || 0).toBe(0);
  expect(typeSamples.wave5.spitter || 0).toBeGreaterThan(0);

  const setup = await page.evaluate(() => {
    window.__dustAndDeadTest.clearEnemies();
    window.__dustAndDeadTest.clearAcidHazards();
    const acidOptimization = window.__dustAndDeadTest.getAcidPuddleOptimizationStats();
    const state = JSON.parse(window.render_game_to_text());
    const player = state.player;
    const enemy = window.__dustAndDeadTest.spawnZombieAt("spitter", player.x + 12, player.z);
    const ready = window.__dustAndDeadTest.readyNearestSpitter();
    return { player, enemy, ready, acidOptimization };
  });

  expect(setup.enemy.type).toBe("spitter");
  expect(setup.ready.distance).toBeGreaterThan(5);
  expect(setup.acidOptimization.maxPuddles).toBe(50);
  expect(setup.acidOptimization.visuals.created).toBeGreaterThanOrEqual(setup.acidOptimization.visuals.prewarm);
  expect(setup.acidOptimization.visuals.inUse).toBe(0);

  await page.evaluate(() => window.advanceTime(120));
  let state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  let spitter = state.enemies.find((enemy) => enemy.type === "spitter");

  expect(spitter).toBeTruthy();
  expect(spitter.spitWindup).toBeGreaterThan(0);
  expect(spitter.acidShots).toBe(0);

  await page.evaluate(() => window.advanceTime(520));
  state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  spitter = state.enemies.find((enemy) => enemy.type === "spitter");

  expect(spitter.acidShots).toBeGreaterThanOrEqual(1);
  expect(state.acidProjectiles + state.acidPuddles).toBeGreaterThan(0);
  if (state.acidProjectiles > 0) expect(state.acidShots[0].visualParts).toBeGreaterThanOrEqual(5);

  await page.evaluate(() => window.advanceTime(1400));
  state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  expect(state.acidPuddles).toBeGreaterThanOrEqual(1);
  expect(state.acidPools[0].x).toBeCloseTo(setup.player.x, 1);
  expect(state.acidPools[0].z).toBeCloseTo(setup.player.z, 1);
  expect(state.acidPools[0].visualParts).toBeGreaterThanOrEqual(10);
  expect(state.player.hp).toBeLessThan(setup.player.hp);

  const pooled = await page.evaluate(() => {
    const active = window.__dustAndDeadTest.getAcidPuddleOptimizationStats();
    window.__dustAndDeadTest.clearAcidHazards();
    const cleared = window.__dustAndDeadTest.getAcidPuddleOptimizationStats();
    return { active, cleared };
  });
  expect(pooled.active.visuals.created).toBeGreaterThanOrEqual(setup.acidOptimization.visuals.created);
  expect(pooled.active.visuals.created).toBeLessThanOrEqual(pooled.active.maxPuddles);
  expect(pooled.active.visuals.inUse).toBeGreaterThanOrEqual(1);
  expect(pooled.cleared.visuals.inUse).toBe(0);
  expect(pooled.cleared.visuals.available).toBeGreaterThanOrEqual(pooled.active.visuals.created);
});

test("town placement keeps two-town maps far and multi-town maps varied", async ({ page }) => {
  const seeds = [4, 7, 12, 14, 16];
  let sawTwoTownFarPair = false;
  let sawRelaxedMultiTownSpread = false;

  for (const seed of seeds) {
    await page.goto(`${fileUrl("index.html")}?mapSeed=${seed}`);
    await page.waitForFunction(() => typeof window.render_game_to_text === "function");

    const state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
    const layout = await page.evaluate(() => window.__dustAndDeadTest.validateMapLayout());
    const townCount = state.map.mainTownCount;

    expect(layout.issueCount, `layout issues for seed ${seed}`).toBe(0);
    expect(townCount, `town count for seed ${seed}`).toBeGreaterThanOrEqual(2);
    expect(townCount, `town count for seed ${seed}`).toBeLessThanOrEqual(5);
    expect(state.map.mainTownMinDistance, `minimum town distance for seed ${seed}`).toBeGreaterThanOrEqual(112);

    if (townCount === 2) {
      expect(state.map.mainTownMaxDistance, `two-town max distance for seed ${seed}`).toBeGreaterThan(450);
      sawTwoTownFarPair = true;
    } else {
      expect(state.map.mainTownMaxDistance, `multi-town spread for seed ${seed}`).toBeGreaterThan(240);
      if (state.map.mainTownMaxDistance < 450) sawRelaxedMultiTownSpread = true;
    }
  }

  expect(sawTwoTownFarPair).toBe(true);
  expect(sawRelaxedMultiTownSpread).toBe(true);
});

test("road surfaces avoid shadow and terrain-patch stripe artifacts", async ({ page }) => {
  await page.goto(`${fileUrl("index.html")}?mapSeed=7`);
  await page.waitForFunction(() => typeof window.__dustAndDeadTest?.getRoadSurfaceDiagnostics === "function");

  const diagnostics = await page.evaluate(() => window.__dustAndDeadTest.getRoadSurfaceDiagnostics());

  expect(diagnostics.roadCount).toBeGreaterThan(0);
  expect(diagnostics.shadowCastingRoads).toBe(0);
  expect(diagnostics.shadowReceivingRoads).toBe(0);
  expect(diagnostics.terrainPatchCount).toBeGreaterThan(100);
  expect(diagnostics.maxTerrainPatchTopY).toBeLessThan(diagnostics.minRoadSurfaceTopY - 0.02);
});

test("acid puddles and death debris stay safely above raised roads", async ({ page }) => {
  await startHunt(page, "mapSeed=7");
  await page.waitForFunction(() => (
    typeof window.advanceTime === "function" &&
    typeof window.__dustAndDeadTest?.getGroundEffectDepthDiagnostics === "function"
  ));

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    game.clearEnemies();
    game.clearAcidHazards();
    const roads = game.getRoadSurfaceDiagnostics();
    const road = roads.sampleGameplayRoad;
    if (!road) throw new Error("No gameplay road was available for the depth regression");

    game.setPlayerPosition(road.x, road.z);
    game.spawnAcidPuddleAt(road.x, road.z);
    game.spawnZombieAt("walker", road.x + 0.2, road.z + 0.2);
    if (!game.killNearestZombie()) throw new Error("Could not create road debris");
    window.advanceTime(900);

    return {
      roads,
      depth: game.getGroundEffectDepthDiagnostics(),
    };
  });

  expect(result.depth.acidPuddles).toHaveLength(1);
  const acid = result.depth.acidPuddles[0];
  expect(acid.surfaceY).toBeGreaterThanOrEqual(
    result.roads.maxRoadSurfaceTopY + result.roads.acidPuddleRoadClearance - 0.0001
  );
  expect(acid.darkY - acid.surfaceY).toBeCloseTo(0.005, 4);
  expect(acid.ringY - acid.surfaceY).toBeCloseTo(0.015, 4);
  expect(acid.foamY - acid.surfaceY).toBeCloseTo(0.02, 4);
  expect(acid.minBubbleY).toBeGreaterThanOrEqual(acid.surfaceY + 0.029);

  expect(result.depth.debris.length).toBeGreaterThan(0);
  expect(result.depth.debris.some((piece) => piece.roadTopY > 0)).toBe(true);
  expect(result.depth.debris.every((piece) => piece.y >= piece.restY - 0.0001)).toBe(true);
});

test("ruin colliders follow their rotated visuals", async ({ page }) => {
  const seeds = [1, 4, 7, 12, 18, 31, 42, 55];
  let sawRuin = false;
  let sawRotatedOnlyHit = false;

  for (const seed of seeds) {
    await page.goto(`${fileUrl("index.html")}?mapSeed=${seed}`);
    await page.waitForFunction(() => typeof window.__dustAndDeadTest?.getRuinColliderDiagnostics === "function");

    const diagnostics = await page.evaluate(() => window.__dustAndDeadTest.getRuinColliderDiagnostics());
    if (!diagnostics.count) continue;

    sawRuin = true;
    expect(diagnostics.rotatedCount, `rotated ruins for seed ${seed}`).toBe(diagnostics.count);
    expect(diagnostics.missedInsideSamples, `inside-collider samples for seed ${seed}`).toBe(0);
    expect(diagnostics.samplesPerRuin, `sample count for seed ${seed}`).toBe(diagnostics.count * 4);
    if (diagnostics.rotatedOnlyHits > 0) sawRotatedOnlyHit = true;
  }

  expect(sawRuin).toBe(true);
  expect(sawRotatedOnlyHit).toBe(true);
});

test("local multiplayer lobby opens on the shared deterministic map", async ({ page }) => {
  await page.goto(`${fileUrl("index.html")}?mapSeed=7331&localMultiplayer=1`);
  await dismissIntro(page);
  await expect(page.locator("#local-multiplayer-lobby")).toBeVisible();
  await expect(page.locator("#multiplayer-player-name")).toHaveValue(/Cowboy|.+/);
  await expect(page.locator("#multiplayer-lobby-status")).toContainText("Nearby Connections");
});

test("multiplayer revives cost 2 4 8 and the leading last survivor wins", async ({ page }) => {
  await page.goto(`${fileUrl("index.html")}?mapSeed=7331`);
  await dismissIntro(page);
  await page.waitForFunction(() => !!window.__dustMultiplayerTest);

  const result = await page.evaluate(() => {
    const api = window.__dustMultiplayerTest;
    const initial = api.startMockHost(["Alice", "Bob"]);
    api.setPoints("mock-player-2", 10);

    api.damagePlayer("mock-player-2", 999, "mock-player-1");
    const firstDeath = api.getState();
    const firstRevive = api.revive("mock-player-2", "revive-1");

    api.damagePlayer("mock-player-2", 999, "mock-player-1");
    const secondDeath = api.getState();
    const secondRevive = api.revive("mock-player-2", "revive-2");

    api.damagePlayer("mock-player-2", 999, "mock-player-1");
    api.forceScoreCheck();
    const waitingState = api.getState();
    for (let chunk = 0; chunk < 4; chunk += 1) window.advanceTime(4000);
    const finalState = api.getState();
    return { initial, firstDeath, firstRevive, secondDeath, secondRevive, waitingState, finalState };
  });

  expect(Math.hypot(result.initial.players[0].x - result.initial.players[1].x, result.initial.players[0].z - result.initial.players[1].z)).toBeGreaterThan(100);
  expect(result.firstDeath.players[1].reviveCost).toBe(2);
  expect(result.firstDeath.matchEnded).toBe(false);
  expect(result.firstRevive).toBe(true);
  expect(result.secondDeath.players[1].reviveCost).toBe(4);
  expect(result.secondRevive).toBe(true);
  expect(result.waitingState.matchEnded).toBe(false);
  expect(result.waitingState.players[1].decisionTimeLeft).toBeGreaterThan(14);
  expect(result.finalState.players[1].reviveCost).toBe(8);
  expect(result.finalState.players[1].points).toBe(4);
  expect(result.finalState.players[1].surrendered).toBe(true);
  expect(result.finalState.matchEnded).toBe(true);
  expect(result.finalState.winnerIds).toEqual(["mock-player-1"]);
  await expect(page.locator("#multiplayer-scoreboard-body tr")).toHaveCount(2);
  await expect(page.locator("#game-over")).toBeHidden();
  await expect(page.locator("#multiplayer-result-panel")).toBeVisible();
  await page.locator("#multiplayer-return-lobby-btn").click();
  await expect(page.locator("#local-multiplayer-lobby")).toBeVisible();
  expect((await page.evaluate(() => window.__dustMultiplayerTest.getState())).phase).toBe("lobby");
});

test("a downed multiplayer player automatically surrenders after 15 seconds", async ({ page }) => {
  await page.goto(`${fileUrl("index.html")}?mapSeed=7331`);
  await dismissIntro(page);
  await page.waitForFunction(() => !!window.__dustMultiplayerTest);

  await page.evaluate(() => {
    const api = window.__dustMultiplayerTest;
    api.startMockHost(["Host", "Guest"]);
    api.setPoints("mock-player-1", 4);
    api.damagePlayer("mock-player-1", 999, "mock-player-2");
  });

  await expect(page.locator("#multiplayer-death-panel")).toBeVisible();
  await expect(page.locator("#multiplayer-death-countdown")).toHaveText("15");
  await page.evaluate(() => {
    for (let chunk = 0; chunk < 4; chunk += 1) window.advanceTime(4000);
  });
  const state = await page.evaluate(() => window.__dustMultiplayerTest.getState());
  expect(state.players[0].surrendered).toBe(true);
  expect(state.matchEnded).toBe(true);
  await expect(page.locator("#multiplayer-death-panel")).toBeHidden();
  await expect(page.locator("#multiplayer-result-panel")).toBeVisible();
});

test("host applies validated remote input and stops stale movement", async ({ page }) => {
  await page.goto(`${fileUrl("index.html")}?mapSeed=7331`);
  await dismissIntro(page);
  await page.waitForFunction(() => !!window.__dustMultiplayerTest);

  const movement = await page.evaluate(() => {
    const api = window.__dustMultiplayerTest;
    const initial = api.startMockHost(["Host", "Guest"]);
    api.injectInput("mock-player-2", { sequence: 1, moveX: 1, moveZ: 0, aimAngle: 1.2, fire: false });
    window.advanceTime(250);
    const moving = api.getState();
    window.advanceTime(1000);
    const stale = api.getState();
    return {
      initialX: initial.players[1].x,
      movingX: moving.players[1].x,
      staleX: stale.players[1].x,
    };
  });

  expect(movement.movingX).toBeGreaterThan(movement.initialX);
  expect(movement.staleX).toBeGreaterThanOrEqual(movement.movingX);
  expect(movement.staleX - movement.movingX).toBeLessThan(4.5);
});

test("authoritative multiplayer bullets damage opponents and credit one player kill", async ({ page }) => {
  await page.goto(`${fileUrl("index.html")}?mapSeed=7331`);
  await dismissIntro(page);
  await page.waitForFunction(() => !!window.__dustMultiplayerTest);

  const result = await page.evaluate(() => {
    const api = window.__dustMultiplayerTest;
    let state = api.startMockHost(["Shooter", "Target"]);
    const host = state.players[0];
    api.setPlayerPosition("mock-player-1", host.x, host.z);
    api.setPlayerPosition("mock-player-2", host.x + 5, host.z);
    window.advanceTime(1800);
    for (let shot = 0; shot < 5; shot += 1) {
      const target = api.getState().players[1];
      api.fireAt("mock-player-1", target.x, target.z);
      window.advanceTime(300);
    }
    const waiting = api.getState();
    api.surrender("mock-player-2");
    return { waiting, finalState: api.getState() };
  });

  expect(result.waiting.players[1].alive).toBe(false);
  expect(result.waiting.players[0].playerKills).toBe(1);
  expect(result.waiting.players[0].points).toBe(5);
  expect(result.waiting.matchEnded).toBe(false);
  expect(result.waiting.players[1].decisionTimeLeft).toBeGreaterThan(14);
  expect(result.finalState.winnerIds).toEqual(["mock-player-1"]);
});

test("guest applies authoritative snapshots and ignores stale ones", async ({ page }) => {
  await page.goto(`${fileUrl("index.html")}?mapSeed=7331`);
  await dismissIntro(page);
  await page.waitForFunction(() => !!window.__dustMultiplayerTest);

  const result = await page.evaluate(() => {
    const api = window.__dustMultiplayerTest;
    api.startMockHost(["Host", "Guest"]);
    api.setPoints("mock-player-1", 7);
    api.setPoints("mock-player-2", 3);
    const snapshot = api.buildSnapshot();
    snapshot.combatEvents = [{ type: "xpOrb", sequence: 1, ownerId: "mock-player-2", x: snapshot.players[1].x, z: snapshot.players[1].z - 2, value: 3 }];
    api.startMockGuest(["Host", "Guest"], 1);
    const applied = api.applySnapshot(snapshot);
    const stale = JSON.parse(JSON.stringify(snapshot));
    stale.sequence = snapshot.sequence - 1;
    stale.players[1].points = 999;
    const afterStale = api.applySnapshot(stale);
    return { applied, afterStale, snapshotSequence: snapshot.sequence };
  });

  expect(result.applied.role).toBe("guest");
  expect(result.applied.localPlayerId).toBe("mock-player-2");
  expect(result.applied.players[0].points).toBe(7);
  expect(result.applied.players[1].points).toBe(3);
  expect(result.applied.xpVisuals).toBe(1);
  expect(result.afterStale.players[1].points).toBe(3);
  expect(result.snapshotSequence).toBeGreaterThan(0);
});

test("guest interpolates remote player snapshots instead of snapping each frame", async ({ page }) => {
  await page.goto(`${fileUrl("index.html")}?mapSeed=7331`);
  await dismissIntro(page);
  await page.waitForFunction(() => !!window.__dustMultiplayerTest);

  const result = await page.evaluate(() => {
    const api = window.__dustMultiplayerTest;
    api.startMockGuest(["Host", "Guest"], 1);
    const baseline = api.buildSnapshot();
    baseline.sequence = 1;
    api.applySnapshot(baseline);
    const before = api.getState().players[0].x;
    const moved = JSON.parse(JSON.stringify(baseline));
    moved.sequence = 2;
    moved.players[0].x += 6;
    api.applySnapshot(moved);
    const immediate = api.getState().players[0].x;
    window.advanceTime(200);
    const smoothed = api.getState().players[0].x;
    return { before, immediate, smoothed, target: moved.players[0].x };
  });

  expect(result.immediate).toBeCloseTo(result.before, 1);
  expect(result.smoothed).toBeGreaterThan(result.immediate);
  expect(result.smoothed).toBeLessThan(result.target + 1);
});

test("same-tick multiplayer shots can trade without declaring a premature winner", async ({ page }) => {
  await page.goto(`${fileUrl("index.html")}?mapSeed=7331`);
  await dismissIntro(page);
  await page.waitForFunction(() => !!window.__dustMultiplayerTest);

  const result = await page.evaluate(() => {
    const api = window.__dustMultiplayerTest;
    const initial = api.startMockHost(["Left", "Right"]);
    const x = initial.players[0].x;
    const z = initial.players[0].z;
    api.setPlayerPosition("mock-player-1", x, z);
    api.setPlayerPosition("mock-player-2", x + 5, z);
    window.advanceTime(1800);
    api.setHealth("mock-player-1", 24);
    api.setHealth("mock-player-2", 24);
    api.fireAt("mock-player-1", x + 5, z);
    api.fireAt("mock-player-2", x, z);
    window.advanceTime(300);
    return api.getState();
  });

  expect(result.players[0].alive).toBe(false);
  expect(result.players[1].alive).toBe(false);
  expect(result.players[0].playerKills).toBe(1);
  expect(result.players[1].playerKills).toBe(1);
  expect(result.players[0].points).toBe(5);
  expect(result.players[1].points).toBe(5);
  expect(result.matchEnded).toBe(false);
});
