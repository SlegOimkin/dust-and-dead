const path = require("node:path");
const { expect, test } = require("@playwright/test");

const PROGRESSION_STORAGE_KEY = "dustAndDeadMetaProgression.v1";

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

async function openGame(page, { reset = true } = {}) {
  await page.goto(`${fileUrl("index.html")}?cosmeticsTest=1`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForFunction(() => Boolean(
    window.DustAndDeadProgression &&
    window.__dustAndDeadTest &&
    window.__dustMultiplayerTest
  ));
  if (reset) {
    await page.evaluate(() => window.DustAndDeadProgression.resetForTest());
  }
  await dismissIntro(page);
}

function expectInside(rect, viewport, label) {
  expect(rect, `${label} should have measurable bounds`).not.toBeNull();
  expect(rect.left, `${label} left`).toBeGreaterThanOrEqual(-1);
  expect(rect.top, `${label} top`).toBeGreaterThanOrEqual(-1);
  expect(rect.right, `${label} right`).toBeLessThanOrEqual(viewport.width + 1);
  expect(rect.bottom, `${label} bottom`).toBeLessThanOrEqual(viewport.height + 1);
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

test("cosmetic catalog gates milestones and boss trophies without spending currency", async ({ page }) => {
  await openGame(page);

  const result = await page.evaluate(() => {
    const progression = window.DustAndDeadProgression;
    const fresh = {
      snapshot: progression.getSnapshot(),
      catalog: progression.getCosmeticCatalog(),
      profile: progression.getCosmeticProfile(),
    };
    const rejected = progression.selectCosmetic("cowboy", "ashenProspector");
    const rejectedLook = progression.selectCosmeticProfile({
      cowboyId: "ashenProspector",
      hatId: "weatheredCattleman",
    });
    const dustBeforeBosses = progression.getSnapshot().dustCents;
    progression.recordSoloBoss("ghostTrain");
    progression.recordSoloBoss("bellRinger");
    const afterBosses = progression.getCosmeticCatalog();
    const railman = progression.selectCosmetic("hat", "railmanCap");
    const bell = progression.selectCosmetic("hat", "bellCrown");
    const finalSnapshot = progression.getSnapshot();
    return {
      fresh,
      rejected: {
        accepted: rejected.accepted,
        reason: rejected.reason,
        profile: rejected.snapshot.cosmetics,
      },
      rejectedLook: {
        accepted: rejectedLook.accepted,
        reason: rejectedLook.reason,
        profile: rejectedLook.snapshot.cosmetics,
      },
      afterBosses,
      railmanAccepted: railman.accepted,
      bellAccepted: bell.accepted,
      finalSnapshot,
      dustBeforeBosses,
    };
  });

  expect(result.fresh.catalog.cowboys).toHaveLength(21);
  expect(result.fresh.catalog.hats).toHaveLength(13);
  expect(new Set([
    ...result.fresh.catalog.cowboys.map((entry) => entry.id),
    ...result.fresh.catalog.hats.map((entry) => entry.id),
  ]).size).toBe(34);
  expect(result.fresh.catalog.unlockedCount).toBe(2);
  expect(result.fresh.profile).toMatchObject({
    cowboyId: "trailwornDrifter",
    hatId: "weatheredCattleman",
  });
  expect(result.rejected).toMatchObject({
    accepted: false,
    reason: "cosmetic-locked",
    profile: {
      cowboyId: "trailwornDrifter",
      hatId: "weatheredCattleman",
    },
  });
  expect(result.rejectedLook).toEqual(result.rejected);
  expect(result.afterBosses.hats.filter((entry) => entry.unlocked).map((entry) => entry.id))
    .toEqual(["weatheredCattleman", "railmanCap", "bellCrown"]);
  expect(result.afterBosses.contractMarks).toBe(2);
  expect(result.railmanAccepted).toBe(true);
  expect(result.bellAccepted).toBe(true);
  expect(result.finalSnapshot.cosmetics.hatId).toBe("bellCrown");
  expect(result.finalSnapshot.dustCents - result.dustBeforeBosses).toBe(10000);
});

test("boss trophies unlock on their own kill and the gold outfit is bought with Dust", async ({ page }) => {
  await openGame(page);

  const result = await page.evaluate(() => {
    const progression = window.DustAndDeadProgression;
    const find = (slot, id) => progression
      .getCosmeticCatalog()[slot]
      .find((entry) => entry.id === id);

    const freshGold = find("cowboys", "bullionTycoon");
    const brokePurchase = progression.purchaseCosmetic("cowboy", "bullionTycoon");

    progression.recordSoloBoss("oilBaron");
    const baronOutfit = find("cowboys", "baronsBlackGold");
    const mitreBeforeItsBoss = find("hats", "archbishopMitre");
    progression.recordSoloBoss("slothArchbishop");
    const mitre = find("hats", "archbishopMitre");

    progression.grantDustForTest(1000000);
    const affordable = find("cowboys", "bullionTycoon");
    const dustBefore = progression.getSnapshot().dustCents;
    const bought = progression.purchaseCosmetic("cowboy", "bullionTycoon");
    const dustAfter = progression.getSnapshot().dustCents;
    const rebuy = progression.purchaseCosmetic("cowboy", "bullionTycoon");
    const equipped = progression.selectCosmeticProfile({
      cowboyId: "bullionTycoon",
      hatId: "archbishopMitre",
    });

    return {
      freshGold,
      brokePurchase: { accepted: brokePurchase.accepted, reason: brokePurchase.reason },
      baronOutfit,
      mitreBeforeItsBoss,
      mitre,
      affordable,
      spent: dustBefore - dustAfter,
      bought: { accepted: bought.accepted, dustSpentCents: bought.dustSpentCents },
      rebuy: { accepted: rebuy.accepted, reason: rebuy.reason },
      equipped: { accepted: equipped.accepted, profile: equipped.cosmeticProfile },
      ownedGold: find("cowboys", "bullionTycoon"),
    };
  });

  expect(result.freshGold).toMatchObject({
    unlocked: false,
    purchasable: true,
    costCents: 1000000,
    costDust: 10000,
    affordable: false,
  });
  expect(result.brokePurchase).toEqual({ accepted: false, reason: "insufficient-dust" });

  expect(result.baronOutfit.unlocked).toBe(true);
  expect(result.mitreBeforeItsBoss.unlocked).toBe(false);
  expect(result.mitre.unlocked).toBe(true);
  expect(result.mitre.purchasable).toBe(false);

  expect(result.affordable.affordable).toBe(true);
  expect(result.bought.accepted).toBe(true);
  expect(result.bought.dustSpentCents).toBe(1000000);
  expect(result.spent).toBe(1000000);
  expect(result.rebuy).toEqual({ accepted: false, reason: "already-unlocked" });
  expect(result.ownedGold.unlocked).toBe(true);
  expect(result.equipped).toEqual({
    accepted: true,
    profile: { cowboyId: "bullionTycoon", hatId: "archbishopMitre" },
  });

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Boolean(window.DustAndDeadProgression));
  expect(await page.evaluate(() => window.DustAndDeadProgression.getCosmeticProfile()))
    .toMatchObject({ cowboyId: "bullionTycoon", hatId: "archbishopMitre" });
});

test("the wardrobe buys the gold outfit and only then lets it be applied", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openGame(page);
  await page.evaluate(() => window.DustAndDeadProgression.grantDustForTest(1000000));

  await page.locator("#wardrobe-btn").click();
  await expect(page.locator("#wardrobe-menu")).toBeVisible();

  const buyButton = page.locator("#wardrobe-buy-btn");
  await expect(buyButton).toBeHidden();

  // The paid outfit sits last in the carousel, one step back from the starter.
  await page.locator('[data-wardrobe-cycle="cowboy"][data-direction="prev"]').click();
  await expect(page.locator("#wardrobe-cowboy-name")).toHaveText("Bullion Tycoon");
  await expect(buyButton).toBeVisible();
  await expect(buyButton).toBeEnabled();
  await expect(buyButton).toHaveText("Buy for 10000 Dust");
  await expect(page.locator("#wardrobe-equip-btn")).toBeDisabled();

  await buyButton.click();
  await expect(buyButton).toBeHidden();
  await expect(page.locator("#wardrobe-equip-btn")).toBeEnabled();
  await expect(page.locator("#wardrobe-owned-value")).toHaveText("3 / 34");

  await page.locator("#wardrobe-equip-btn").click();
  await expect(page.locator("#wardrobe-equip-btn")).toHaveText("Applied");
  expect(await page.evaluate(() => window.DustAndDeadProgression.getSnapshot().dustCents)).toBe(0);
  expect(await page.evaluate(() => window.DustAndDeadProgression.getCosmeticProfile()))
    .toMatchObject({ cowboyId: "bullionTycoon" });
});

test("equipped outfit and hat persist and old v1 saves migrate safely", async ({ page }) => {
  await openGame(page);

  const saved = await page.evaluate((storageKey) => {
    const progression = window.DustAndDeadProgression;
    [
      "ghostTrain",
      "bellRinger",
      "oilBaron",
      "slothArchbishop",
      "hordeheart",
      "landEater",
    ].forEach((boss) => progression.recordSoloBoss(boss));
    const catalog = progression.getCosmeticCatalog();
    const lookResult = progression.selectCosmeticProfile({
      cowboyId: "ashenProspector",
      hatId: "gamblersBlack",
    });
    return {
      catalog,
      lookAccepted: lookResult.accepted,
      appliedProfile: lookResult.cosmeticProfile,
      profile: progression.getCosmeticProfile(),
      raw: JSON.parse(window.localStorage.getItem(storageKey)),
    };
  }, PROGRESSION_STORAGE_KEY);

  expect(saved.catalog.contractMarks).toBeGreaterThanOrEqual(6);
  expect(saved.catalog.cowboys.find((entry) => entry.id === "ashenProspector").unlocked).toBe(true);
  expect(saved.catalog.hats.find((entry) => entry.id === "gamblersBlack").unlocked).toBe(true);
  expect(saved.lookAccepted).toBe(true);
  expect(saved.appliedProfile).toEqual({
    cowboyId: "ashenProspector",
    hatId: "gamblersBlack",
  });
  expect(saved.profile).toMatchObject({
    cowboyId: "ashenProspector",
    hatId: "gamblersBlack",
  });
  expect(saved.raw.cosmetics).toEqual({
    cowboyId: "ashenProspector",
    hatId: "gamblersBlack",
  });

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Boolean(window.DustAndDeadProgression));
  expect(await page.evaluate(() => window.DustAndDeadProgression.getCosmeticProfile()))
    .toMatchObject({
      cowboyId: "ashenProspector",
      hatId: "gamblersBlack",
    });

  const migrated = await page.evaluate((storageKey) => {
    const current = JSON.parse(window.localStorage.getItem(storageKey));
    delete current.cosmetics;
    window.localStorage.setItem(storageKey, JSON.stringify(current));
    return current.version;
  }, PROGRESSION_STORAGE_KEY);
  expect(migrated).toBe(1);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Boolean(window.DustAndDeadProgression));
  expect(await page.evaluate(() => window.DustAndDeadProgression.getCosmeticProfile()))
    .toMatchObject({
      cowboyId: "trailwornDrifter",
      hatId: "weatheredCattleman",
    });
});

test("wardrobe previews on the live cowboy and applies the complete look only on confirmation", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openGame(page);

  await page.locator("#wardrobe-btn").click();
  const dialog = page.locator("#wardrobe-menu");
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute("aria-hidden", "false");
  await expect(page.locator("#wardrobe-close-btn")).toBeFocused();
  await expect(page.locator("#wardrobe-owned-value")).toHaveText("2 / 34");
  await expect(page.locator(".wardrobe-avatar")).toHaveCount(0);
  await expect(page.locator("[data-wardrobe-cycle]")).toHaveCount(4);

  await page.locator('[data-wardrobe-cycle="cowboy"][data-direction="next"]').click();
  await expect(page.locator("#wardrobe-preview-name")).toHaveText("Ashen Prospector");
  await expect(page.locator("#wardrobe-preview-requirement")).toContainText("Complete 6 contracts");
  await expect(page.locator("#wardrobe-equip-btn")).toBeDisabled();

  const lockedPreview = await page.evaluate(() => window.__dustAndDeadTest.getCosmeticDiagnostics());
  expect(lockedPreview.profile).toMatchObject({
    cowboyId: "trailwornDrifter",
    hatId: "weatheredCattleman",
  });
  expect(lockedPreview.wardrobe.selected).toMatchObject({
    cowboyId: "ashenProspector",
    hatId: "weatheredCattleman",
  });
  expect(lockedPreview.menu.cosmetics).toMatchObject(lockedPreview.wardrobe.selected);
  expect(lockedPreview.wardrobe.liveModel).toBe(true);
  expect(lockedPreview.wardrobe.previewObjectUuid).toBe(lockedPreview.wardrobe.menuObjectUuid);
  expect(lockedPreview.wardrobe.cameraMode).toBe("wardrobe");

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  const reverted = await page.evaluate(() => window.__dustAndDeadTest.getCosmeticDiagnostics());
  expect(reverted.menu.cosmetics).toMatchObject(reverted.profile);

  await page.evaluate(() => {
    const progression = window.DustAndDeadProgression;
    [
      "ghostTrain",
      "bellRinger",
      "oilBaron",
      "slothArchbishop",
      "hordeheart",
      "landEater",
    ].forEach((boss) => progression.recordSoloBoss(boss));
  });
  await page.locator("#wardrobe-btn").click();
  // Six boss kills also seal the Hordeheart and Land-Eater first-win trophies now.
  await expect(page.locator("#wardrobe-owned-value")).toHaveText("10 / 34");
  await page.locator('[data-wardrobe-cycle="cowboy"][data-direction="next"]').click();
  // Two steps back from the starter hat: the Archbishop's Mitre is now last.
  await page.locator('[data-wardrobe-cycle="hat"][data-direction="prev"]').click();
  await page.locator('[data-wardrobe-cycle="hat"][data-direction="prev"]').click();
  await expect(page.locator("#wardrobe-hat-name")).toHaveText("Bell Crown");
  await expect(page.locator("#wardrobe-cowboy-name")).toHaveText("Ashen Prospector");
  await expect(page.locator("#wardrobe-preview-requirement")).toContainText("Defeat the Bell Ringer");
  await expect(page.locator("#wardrobe-equip-btn")).toBeEnabled();

  const beforeApply = await page.evaluate((storageKey) => ({
    profile: window.DustAndDeadProgression.getCosmeticProfile(),
    stored: JSON.parse(window.localStorage.getItem(storageKey)).cosmetics,
    preview: window.__dustAndDeadTest.getCosmeticDiagnostics(),
  }), PROGRESSION_STORAGE_KEY);
  expect(beforeApply.profile).toMatchObject({
    cowboyId: "trailwornDrifter",
    hatId: "weatheredCattleman",
  });
  expect(beforeApply.stored).toEqual({
    cowboyId: "trailwornDrifter",
    hatId: "weatheredCattleman",
  });
  expect(beforeApply.preview.menu.cosmetics).toMatchObject({
    cowboyId: "ashenProspector",
    hatId: "bellCrown",
  });

  await page.locator("#wardrobe-equip-btn").click();
  await expect(page.locator("#wardrobe-equip-btn")).toBeDisabled();
  await expect(page.locator("#wardrobe-equip-btn")).toHaveText("Applied");

  const previewDiagnostics = await page.evaluate(() => window.__dustAndDeadTest.getCosmeticDiagnostics());
  expect(previewDiagnostics.profile).toMatchObject({
    cowboyId: "ashenProspector",
    hatId: "bellCrown",
  });
  expect(previewDiagnostics.menu.cosmetics).toMatchObject(previewDiagnostics.profile);
  expect(previewDiagnostics.menu.hatGeometry).toBe("CylinderGeometry");

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page.locator("#wardrobe-btn")).toBeFocused();
  await page.locator("#start-btn").click();
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).mode === "playing");
  const huntDiagnostics = await page.evaluate(() => window.__dustAndDeadTest.getCosmeticDiagnostics());
  expect(huntDiagnostics.player.cosmetics).toMatchObject(previewDiagnostics.profile);
  expect(huntDiagnostics.player.hatGeometry).toBe("CylinderGeometry");
  expect(huntDiagnostics.playerRadius).toBe(0.72);
});

test("weapon hands stay attached through dual-revolver movement and recoil", async ({ page }) => {
  await openGame(page);
  await page.locator("#start-btn").click();
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).mode === "playing");

  const idle = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    game.setAutomaticFrameLoopModeForTest("paused");
    game.clearEnemies();
    game.grantXp(240);
    game.chooseClass("gunslinger");
    game.forceAllStandardUpgrades("swiftBoots");
    game.grantXp(1200);
    game.chooseRevolverUpgrade("dualRevolvers");
    game.forceAllStandardUpgrades("swiftBoots");
    const state = JSON.parse(window.render_game_to_text());
    game.setAimTarget(state.player.x, state.player.z + 12);
    game.advanceRealFrame(17, { render: false });
    return game.getCosmeticDiagnostics().player.weaponAttachments;
  });

  await page.keyboard.down("KeyD");
  let animated;
  try {
    animated = await page.evaluate(() => {
      const game = window.__dustAndDeadTest;
      for (let frame = 0; frame < 10; frame += 1) {
        game.advanceRealFrame(17, { render: false });
      }
      const moving = game.getCosmeticDiagnostics().player.weaponAttachments;
      game.shootOnce();
      game.advanceRealFrame(17, { render: false });
      const recoil = game.getCosmeticDiagnostics().player.weaponAttachments;
      return { moving, recoil };
    });
  } finally {
    await page.keyboard.up("KeyD");
  }

  for (const [phase, diagnostics] of Object.entries({
    idle,
    moving: animated.moving,
    recoil: animated.recoil,
  })) {
    expect(diagnostics.activeVisualId, `${phase} visual`).toBe("dualRevolvers");
    expect(diagnostics.right.rigParentIsArm, `${phase} right rig`).toBe(true);
    expect(diagnostics.right.handParentIsRig, `${phase} right hand`).toBe(true);
    expect(diagnostics.left.rigParentIsArm, `${phase} left rig`).toBe(true);
    expect(diagnostics.left.handParentIsRig, `${phase} left hand`).toBe(true);
    expect(diagnostics.right.visible, `${phase} right visible`).toBe(true);
    expect(diagnostics.left.visible, `${phase} left visible`).toBe(true);
    expect(diagnostics.left.armedGeometry, `${phase} left armed arm`).toBe(true);
    expect(diagnostics.right.localPositionError, `${phase} right grip drift`).toBeLessThan(0.06);
    expect(diagnostics.left.localPositionError, `${phase} left grip drift`).toBeLessThan(0.06);
    expect(diagnostics.right.cuffToPalmDistance, `${phase} right cuff gap`).toBeLessThan(0.26);
    expect(diagnostics.left.cuffToPalmDistance, `${phase} left cuff gap`).toBeLessThan(0.26);
  }
});

test("every weapon keeps its palm centred inside the sleeve across idle, stride, and recoil", async ({ page }) => {
  await openGame(page);
  await page.locator("#start-btn").click();
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).mode === "playing");

  const report = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    game.setAutomaticFrameLoopModeForTest("paused");
    game.clearEnemies();
    const visuals = [
      "revolver",
      "dualRevolvers",
      "rifle",
      "launcher",
      "coachGun",
      "coachGunBreach",
      "coachGunGrave",
    ];
    const poses = {
      idle: { moveAmount: 0, walkPhase: 0, shootKick: 0 },
      stride: { moveAmount: 1, walkPhase: Math.PI * 0.5, shootKick: 0 },
      recoil: {
        moveAmount: 0.65,
        walkPhase: Math.PI * 0.5,
        shootKick: 1,
        lastDualShotSide: -1,
      },
    };
    return Object.fromEntries(visuals.map((visualId) => [
      visualId,
      Object.fromEntries(Object.entries(poses).map(([poseName, pose]) => [
        poseName,
        game.setPlayerWeaponGripPoseForTest(visualId, {
          ...pose,
          render: false,
        }),
      ])),
    ]));
  });

  for (const [visualId, poses] of Object.entries(report)) {
    for (const [poseName, diagnostics] of Object.entries(poses)) {
      const label = `${visualId} ${poseName}`;
      expect(diagnostics.activeVisualId, `${label} visual`).toBe(visualId);
      expect(diagnostics.right.visible, `${label} right visibility`).toBe(true);
      expect(diagnostics.right.rigParentIsArm, `${label} right rig parent`).toBe(true);
      expect(diagnostics.right.handParentIsRig, `${label} right palm parent`).toBe(true);
      expect(
        Math.abs(diagnostics.right.cuffToPalmOffset.x),
        `${label} right palm lateral offset`
      ).toBeLessThanOrEqual(0.04);
      expect(
        diagnostics.right.lateralOverflow,
        `${label} right palm sleeve overflow`
      ).toBeLessThanOrEqual(0.025);
      expect(
        diagnostics.right.sleeveContactDepth,
        `${label} right palm/sleeve contact`
      ).toBeGreaterThanOrEqual(0.075);

      const dual = visualId === "dualRevolvers";
      expect(diagnostics.left.visible, `${label} left visibility`).toBe(dual);
      expect(diagnostics.left.armedGeometry, `${label} left armed geometry`).toBe(dual);
      if (dual) {
        expect(diagnostics.left.rigParentIsArm, `${label} left rig parent`).toBe(true);
        expect(diagnostics.left.handParentIsRig, `${label} left palm parent`).toBe(true);
        expect(
          Math.abs(diagnostics.left.cuffToPalmOffset.x),
          `${label} left palm lateral offset`
        ).toBeLessThanOrEqual(0.04);
        expect(
          diagnostics.left.lateralOverflow,
          `${label} left palm sleeve overflow`
        ).toBeLessThanOrEqual(0.025);
        expect(
          diagnostics.left.sleeveContactDepth,
          `${label} left palm/sleeve contact`
        ).toBeGreaterThanOrEqual(0.075);
      }
    }
  }
});

test("every wardrobe cosmetic renders without recovery and stays inside the lightweight preview", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await openGame(page);
  await page.locator("#wardrobe-btn").click();
  await expect(page.locator("#wardrobe-menu")).toBeVisible();

  const report = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const canvas = document.querySelector("#game-root > canvas");
    const hatNext = document.querySelector(
      '[data-wardrobe-cycle="hat"][data-direction="next"]'
    );
    const outfitNext = document.querySelector(
      '[data-wardrobe-cycle="cowboy"][data-direction="next"]'
    );
    if (!canvas || !hatNext || !outfitNext) {
      throw new Error("Wardrobe render controls are unavailable");
    }

    game.setAutomaticFrameLoopModeForTest("paused");
    const initialRenderer = game.getRendererDiagnosticsForTest();
    const samples = [];
    const sample = (slot, round, index) => {
      const probe = game.profileNextRenderForTest();
      const diagnostics = game.getCosmeticDiagnostics();
      const renderer = game.getRendererDiagnosticsForTest();
      samples.push({
        slot,
        round,
        index,
        label: slot === "hat"
          ? document.querySelector("#wardrobe-hat-name").textContent
          : document.querySelector("#wardrobe-cowboy-name").textContent,
        error: probe ? probe.error : "missing-probe",
        totalMs: probe ? probe.totalMs : Infinity,
        rendererMs: probe ? probe.rendererMs : Infinity,
        renderCalls: probe ? probe.renderCalls : Infinity,
        programs: probe ? probe.programs : Infinity,
        geometries: probe ? probe.geometries : Infinity,
        canvasStable: document.querySelector("#game-root > canvas") === canvas,
        recoveries: renderer.recoveries,
        recreates: renderer.recreates,
        visibleMeshesMissingMaterial: diagnostics.menu.visibleMeshesMissingMaterial,
        visibleMeshesMissingGeometry: diagnostics.menu.visibleMeshesMissingGeometry,
        cosmetics: diagnostics.menu.cosmetics,
        transforms: diagnostics.menu.transforms,
        assemblies: diagnostics.menu.assemblies,
        weaponAttachments: diagnostics.menu.weaponAttachments,
        depth: diagnostics.menu.depth,
        cameraDistance: Number((
          diagnostics.wardrobe.camera.position.z -
          diagnostics.wardrobe.camera.target.z
        ).toFixed(4)),
        cameraTargetY: Number(diagnostics.wardrobe.camera.target.y.toFixed(4)),
      });
    };

    for (let round = 0; round < 2; round += 1) {
      for (let index = 0; index < 13; index += 1) {
        if (round > 0 || index > 0) hatNext.click();
        sample("hat", round, index);
      }
    }
    for (let round = 0; round < 2; round += 1) {
      for (let index = 0; index < 21; index += 1) {
        if (round > 0 || index > 0) outfitNext.click();
        sample("cowboy", round, index);
      }
    }

    return {
      initialRenderer,
      finalRenderer: game.getRendererDiagnosticsForTest(),
      samples,
    };
  });

  expect(new Set(
    report.samples.filter((sample) => sample.slot === "hat" && sample.round === 0)
      .map((sample) => sample.label)
  ).size).toBe(13);
  expect(new Set(
    report.samples.filter((sample) => sample.slot === "cowboy" && sample.round === 0)
      .map((sample) => sample.label)
  ).size).toBe(21);
  expect(report.finalRenderer.recoveries).toBe(report.initialRenderer.recoveries);
  expect(report.finalRenderer.recreates).toBe(report.initialRenderer.recreates);

  for (const sample of report.samples) {
    expect(sample.error, `${sample.slot} ${sample.label}`).toBe("");
    expect(sample.canvasStable, `${sample.slot} ${sample.label} canvas`).toBe(true);
    expect(sample.recoveries, `${sample.slot} ${sample.label} recoveries`)
      .toBe(report.initialRenderer.recoveries);
    expect(sample.recreates, `${sample.slot} ${sample.label} recreates`)
      .toBe(report.initialRenderer.recreates);
    expect(sample.visibleMeshesMissingMaterial, `${sample.slot} ${sample.label} material`)
      .toBe(0);
    expect(sample.visibleMeshesMissingGeometry, `${sample.slot} ${sample.label} geometry`)
      .toBe(0);
    expect(sample.assemblies.torso.maxDistanceError, `${sample.slot} ${sample.label} torso distance`)
      .toBeLessThan(0.00001);
    expect(sample.assemblies.torso.maxRotationError, `${sample.slot} ${sample.label} torso rotation`)
      .toBeLessThan(0.00001);
    expect(sample.assemblies.headwear.maxDistanceError, `${sample.slot} ${sample.label} headwear distance`)
      .toBeLessThan(0.00001);
    expect(sample.assemblies.headwear.maxRotationError, `${sample.slot} ${sample.label} headwear rotation`)
      .toBeLessThan(0.00001);
    expect(sample.weaponAttachments.right.rigParentIsArm, `${sample.slot} ${sample.label} right rig parent`)
      .toBe(true);
    expect(sample.weaponAttachments.right.handParentIsRig, `${sample.slot} ${sample.label} right hand parent`)
      .toBe(true);
    expect(sample.weaponAttachments.left.rigParentIsArm, `${sample.slot} ${sample.label} left rig parent`)
      .toBe(true);
    expect(sample.weaponAttachments.left.handParentIsRig, `${sample.slot} ${sample.label} left hand parent`)
      .toBe(true);
    expect(sample.weaponAttachments.right.visible, `${sample.slot} ${sample.label} hidden fitting weapon`)
      .toBe(false);
    expect(sample.weaponAttachments.right.localPositionError, `${sample.slot} ${sample.label} grip drift`)
      .toBeLessThan(0.01);
    expect(sample.weaponAttachments.right.cuffToPalmDistance, `${sample.slot} ${sample.label} cuff gap`)
      .toBeLessThan(0.24);
    expect(sample.weaponAttachments.poses.rightArmRotationX, `${sample.slot} ${sample.label} fitting pose`)
      .toBeGreaterThan(0.35);
    expect(sample.cameraTargetY, `${sample.slot} ${sample.label} vertical framing`)
      .toBeGreaterThanOrEqual(2.02);
    expect(
      sample.depth.scarf.front - sample.depth.shirt.front,
      `${sample.slot} ${sample.label} scarf clearance`
    ).toBeGreaterThanOrEqual(0.08);
    expect(sample.renderCalls, `${sample.slot} ${sample.label} draw calls`)
      .toBeLessThanOrEqual(32);
    expect(sample.totalMs, `${sample.slot} ${sample.label} total render`)
      .toBeLessThan(160);
  }
  const warmedSamples = report.samples.filter((sample) => sample.round === 1);
  expect(new Set(warmedSamples.map((sample) => sample.programs)).size).toBe(1);
  const warmedGeometryCounts = warmedSamples.map((sample) => sample.geometries);
  expect(Math.max(...warmedGeometryCounts) - Math.min(...warmedGeometryCounts))
    .toBeLessThanOrEqual(8);

  const railman = report.samples.find((sample) =>
    sample.slot === "hat" &&
    sample.round === 0 &&
    sample.cosmetics.hatId === "railmanCap"
  );
  expect(railman).toBeTruthy();
  expect(railman.transforms.hatBrimY).toBeCloseTo(2.41, 3);
  expect(railman.transforms.hatTopY).toBeCloseTo(2.58, 3);
  expect(railman.transforms.hatTopScale).toEqual([1.26, 0.86, 1.18]);
  expect(railman.cameraDistance).toBeCloseTo(9.78, 2);
  expect(railman.cameraTargetY).toBeCloseTo(2.07, 2);

  const undertaker = report.samples.find((sample) =>
    sample.slot === "hat" &&
    sample.round === 0 &&
    sample.cosmetics.hatId === "undertaker"
  );
  expect(undertaker).toBeTruthy();
  expect(undertaker.cameraDistance).toBeCloseTo(10.46, 2);
  expect(undertaker.cameraTargetY).toBeCloseTo(2.1, 2);

  const brokenTopper = report.samples.find((sample) =>
    sample.slot === "hat" &&
    sample.round === 0 &&
    sample.cosmetics.hatId === "brokenTopper"
  );
  expect(brokenTopper).toBeTruthy();
  expect(brokenTopper.cameraDistance).toBeCloseTo(11.55, 2);
  expect(brokenTopper.cameraTargetY).toBeCloseTo(2.55, 2);
});

test("wardrobe stays readable and contained on compact landscape screens", async ({ page }) => {
  test.setTimeout(180_000);
  for (const viewport of [
    { width: 2048, height: 945, mobileRuntime: true },
    { width: 1465, height: 611 },
    { width: 1200, height: 500 },
    { width: 1080, height: 500 },
    { width: 1000, height: 500 },
    { width: 960, height: 521 },
    { width: 900, height: 521 },
    { width: 721, height: 421 },
    { width: 844, height: 390 },
    { width: 667, height: 375 },
  ]) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await openGame(page);
    if (viewport.mobileRuntime) {
      await page.evaluate(() => document.documentElement.classList.add("is-mobile-runtime"));
    }
    await page.evaluate(() => window.DustAndDeadI18n.setLocale("ru", { persist: false }));
    await expect(page.locator("#wardrobe-btn")).toBeVisible();
    await page.locator("#wardrobe-btn").click();
    await expect(page.locator("#wardrobe-menu")).toBeVisible();
    await page.waitForTimeout(320);

    const layout = await page.evaluate(() => {
      const rect = (selector) => {
        const element = document.querySelector(selector);
        if (!element) return null;
        const bounds = element.getBoundingClientRect();
        return {
          left: bounds.left,
          top: bounds.top,
          right: bounds.right,
          bottom: bounds.bottom,
          width: bounds.width,
          height: bounds.height,
        };
      };
      const arrows = Array.from(document.querySelectorAll("[data-wardrobe-cycle]")).map((element) => {
        const bounds = element.getBoundingClientRect();
        return {
          slot: element.getAttribute("data-wardrobe-cycle"),
          direction: element.getAttribute("data-direction"),
          ariaLabel: element.getAttribute("aria-label"),
          left: bounds.left,
          top: bounds.top,
          right: bounds.right,
          bottom: bounds.bottom,
          width: bounds.width,
          height: bounds.height,
          centerX: bounds.left + bounds.width / 2,
          centerY: bounds.top + bounds.height / 2,
        };
      });
      const description = document.querySelector("#wardrobe-preview-description");
      return {
        panel: rect("#wardrobe-panel"),
        body: rect(".wardrobe-menu__body"),
        close: rect("#wardrobe-close-btn"),
        stage: rect("#wardrobe-preview-stage"),
        details: rect(".wardrobe-preview__copy"),
        equip: rect("#wardrobe-equip-btn"),
        back: rect("#wardrobe-back-btn"),
        description: rect("#wardrobe-preview-description"),
        descriptionDisplay: description ? getComputedStyle(description).display : "missing",
        arrows,
        documentScrollWidth: document.documentElement.scrollWidth,
        bodyScrollWidth: document.body.scrollWidth,
      };
    });

    for (const [name, rect] of Object.entries(layout)) {
      if (!rect || typeof rect !== "object" || !("left" in rect)) continue;
      expectInside(rect, viewport, `${viewport.width}px ${name}`);
    }
    expect(layout.documentScrollWidth).toBeLessThanOrEqual(viewport.width);
    expect(layout.bodyScrollWidth).toBeLessThanOrEqual(viewport.width);
    expect(layout.close.width).toBeGreaterThanOrEqual(40);
    expect(layout.close.height).toBeGreaterThanOrEqual(40);
    expect(layout.stage.bottom).toBeLessThanOrEqual(layout.body.bottom + 1);
    expect(layout.details.bottom).toBeLessThanOrEqual(layout.body.bottom + 1);
    expect(layout.equip.bottom).toBeLessThanOrEqual(layout.body.bottom + 1);
    expect(layout.arrows).toHaveLength(4);
    const stageCenter = (layout.stage.left + layout.stage.right) / 2;
    for (const arrow of layout.arrows) {
      expectInside(arrow, viewport, `${viewport.width}px ${arrow.slot} ${arrow.direction}`);
      expect(arrow.width).toBeGreaterThanOrEqual(42);
      expect(arrow.height).toBeGreaterThanOrEqual(42);
      expect(arrow.ariaLabel).toMatch(
        /^(?:(?:Previous|Next) (?:hat|outfit)|(?:Предыдущая|Следующая) шляпа|(?:Предыдущий|Следующий) наряд)$/
      );
      if (arrow.direction === "prev") expect(arrow.centerX).toBeLessThan(stageCenter);
      else expect(arrow.centerX).toBeGreaterThan(stageCenter);
    }
    const hatCenter = layout.arrows.find((arrow) => arrow.slot === "hat").centerY;
    const outfitCenter = layout.arrows.find((arrow) => arrow.slot === "cowboy").centerY;
    const outfitNext = layout.arrows.find(
      (arrow) => arrow.slot === "cowboy" && arrow.direction === "next"
    );
    expect(hatCenter).toBeLessThan(outfitCenter);
    expect(outfitNext.right).toBeLessThanOrEqual(layout.details.left + 1);
    if (viewport.mobileRuntime || (viewport.width <= 1280 && viewport.height <= 520)) {
      expect(layout.descriptionDisplay).toBe("none");
    }
  }
});

test("multiplayer roster applies each player's normalized cosmetics without snapshot traffic", async ({ page }) => {
  await openGame(page);

  const state = await page.evaluate(() => window.__dustMultiplayerTest.startMockHost([
    {
      name: "Golden Host",
      cosmetics: { cowboyId: "gildedLegend", hatId: "bellCrown" },
    },
    {
      name: "Rail Guest",
      cosmetics: { cowboyId: "moonlitOutlaw", hatId: "railmanCap" },
    },
    {
      name: "Invalid Guest",
      cosmetics: { cowboyId: "not-a-skin", hatId: "not-a-hat" },
    },
  ]));

  expect(state.players.map((player) => player.cosmetics)).toEqual([
    { version: 1, cowboyId: "gildedLegend", hatId: "bellCrown" },
    { version: 1, cowboyId: "moonlitOutlaw", hatId: "railmanCap" },
    { version: 1, cowboyId: "trailwornDrifter", hatId: "weatheredCattleman" },
  ]);
  expect(state.players.map((player) => player.entityCosmetics.cosmetics))
    .toEqual(state.players.map((player) => player.cosmetics));
  expect(state.players[0].entityCosmetics.hatGeometry).toBe("CylinderGeometry");
  expect(state.players[1].entityCosmetics.hatGeometry).toBe("BoxGeometry");
});

test("every multiplayer wardrobe stays bound while local and remote cowboys animate", async ({ page }) => {
  await openGame(page);
  const looks = [
    {
      name: "Bell Host",
      cosmetics: { cowboyId: "gildedLegend", hatId: "bellCrown" },
    },
    {
      name: "Rail Guest",
      cosmetics: { cowboyId: "moonlitOutlaw", hatId: "railmanCap" },
    },
    {
      name: "Law Guest",
      cosmetics: { cowboyId: "crimsonLawman", hatId: "undertaker" },
    },
    {
      name: "Mesa Guest",
      cosmetics: { cowboyId: "mesaRanger", hatId: "marshalStar" },
    },
  ];

  await page.evaluate((players) => {
    window.__dustAndDeadTest.setAutomaticFrameLoopModeForTest("paused");
    window.__dustMultiplayerTest.startMockHost(players);
  }, looks);

  await page.keyboard.down("KeyD");
  let report;
  try {
    report = await page.evaluate(() => {
      const game = window.__dustAndDeadTest;
      const multiplayer = window.__dustMultiplayerTest;
      const ids = ["mock-player-1", "mock-player-2", "mock-player-3", "mock-player-4"];
      const before = Object.fromEntries(ids.map((id) => [
        id,
        multiplayer.getPlayerVisualDiagnostics(id),
      ]));
      multiplayer.injectInput("mock-player-2", {
        moveX: 1,
        moveZ: 0,
        aimAngle: Math.PI / 2,
      });
      multiplayer.injectInput("mock-player-3", {
        moveX: 0,
        moveZ: -1,
        aimAngle: Math.PI,
      });
      multiplayer.injectInput("mock-player-4", {
        moveX: -0.7,
        moveZ: 0.7,
        aimAngle: -Math.PI / 2,
      });
      for (let frame = 0; frame < 20; frame += 1) {
        game.advanceRealFrame(17, { render: false });
      }
      const after = Object.fromEntries(ids.map((id) => [
        id,
        multiplayer.getPlayerVisualDiagnostics(id),
      ]));
      const state = multiplayer.getState();
      const snapshot = multiplayer.buildSnapshot(false, false, "mock-player-2");
      const wire = multiplayer.buildWireSnapshot(false, false, "mock-player-2");
      const containsCosmetics = (value) => {
        if (!value || typeof value !== "object") return false;
        if (Object.prototype.hasOwnProperty.call(value, "cosmetics")) return true;
        return Object.values(value).some(containsCosmetics);
      };
      const decodedWirePlayers = multiplayer.decodePlayerWireEntries(wire.ps);
      return {
        before,
        after,
        state,
        semanticSnapshotHasCosmetics: containsCosmetics(snapshot),
        wireSnapshotHasCosmetics: containsCosmetics(wire),
        semanticPlayerHasCosmetics: snapshot.players.some((entry) =>
          Object.prototype.hasOwnProperty.call(entry, "cosmetics")
        ),
        decodedWireCount: decodedWirePlayers ? decodedWirePlayers.length : -1,
        decodedWireHasCosmetics: decodedWirePlayers
          ? decodedWirePlayers.some((entry) =>
              Object.prototype.hasOwnProperty.call(entry, "cosmetics")
            )
          : true,
      };
    });
  } finally {
    await page.keyboard.up("KeyD");
  }

  expect(report.state.players.map((player) => player.cosmetics)).toEqual([
    { version: 1, cowboyId: "gildedLegend", hatId: "bellCrown" },
    { version: 1, cowboyId: "moonlitOutlaw", hatId: "railmanCap" },
    { version: 1, cowboyId: "crimsonLawman", hatId: "undertaker" },
    { version: 1, cowboyId: "mesaRanger", hatId: "marshalStar" },
  ]);

  for (const player of report.state.players) {
    const before = report.before[player.id];
    const after = report.after[player.id];
    expect(after.objectUuid).toBe(before.objectUuid);
    expect(after.cosmetics.cosmetics).toEqual(player.cosmetics);
    expect(after.moveAmount).toBeGreaterThan(0.05);
    expect(Math.abs(after.walkPhase - before.walkPhase)).toBeGreaterThan(0.02);
    expect(Math.abs(after.leftLegRotationX - before.leftLegRotationX)).toBeGreaterThan(0.005);
    expect(Math.abs(after.hatTopRotationZ - after.headRotationZ)).toBeLessThanOrEqual(0.002);
    expect(Math.abs(after.hatBrimRotationZ - after.headRotationZ)).toBeLessThanOrEqual(0.002);
    expect(after.cosmetics.weaponAttachments.right.rigParentIsArm).toBe(true);
    expect(after.cosmetics.weaponAttachments.right.handParentIsRig).toBe(true);
    expect(after.cosmetics.weaponAttachments.right.localPositionError).toBeLessThan(0.06);
    expect(after.cosmetics.weaponAttachments.right.cuffToPalmDistance).toBeLessThan(0.25);
  }

  expect(report.after["mock-player-1"].visibleCosmeticAccessories)
    .toEqual(expect.arrayContaining(["coatTailLeft", "coatTailRight", "poncho", "badge", "hatAccent"]));
  expect(report.after["mock-player-2"].visibleCosmeticAccessories)
    .toEqual(expect.arrayContaining(["coatTailLeft", "coatTailRight", "bandolier", "hatBand", "hatAccent"]));
  expect(report.after["mock-player-3"].visibleCosmeticAccessories)
    .toEqual(expect.arrayContaining(["coatTailLeft", "coatTailRight", "badge", "hatBand"]));
  expect(report.after["mock-player-4"].visibleCosmeticAccessories)
    .toEqual(expect.arrayContaining(["poncho", "hatBand", "hatAccent"]));

  expect(report.semanticSnapshotHasCosmetics).toBe(false);
  expect(report.wireSnapshotHasCosmetics).toBe(false);
  expect(report.semanticPlayerHasCosmetics).toBe(false);
  expect(report.decodedWireCount).toBe(4);
  expect(report.decodedWireHasCosmetics).toBe(false);
});

test("doppelganger copies the equipped trophy hat and animates it with the cowboy", async ({ page }) => {
  await openGame(page);
  const equipped = await page.evaluate(() => {
    const progression = window.DustAndDeadProgression;
    progression.recordSoloBoss("bellRinger");
    window.__dustAndDeadTest.setAutomaticFrameLoopModeForTest("paused");
    return progression.selectCosmeticProfile({
      cowboyId: "trailwornDrifter",
      hatId: "bellCrown",
    });
  });
  expect(equipped.accepted).toBe(true);

  await page.locator("#start-btn").click();
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).mode === "playing");

  const report = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    game.forceDoppelgangerScoutForTest({
      sourceBossWave: 5,
      dueBossWave: 10,
      x: 20,
      z: 20,
    });
    const transformed = game.forceDoppelgangerTransformForTest();
    const initial = transformed.clones[0];
    let peak = initial;
    let peakMotion = 0;
    let sourceHatStayedBound = initial.sourceHatId === "bellCrown";
    for (let frame = 0; frame < 120; frame += 1) {
      game.advanceRealFrame(17, { render: false });
      const sample = game.getDoppelgangerDiagnostics().clones.find(
        (clone) => clone.networkId === initial.networkId
      );
      if (!sample) break;
      sourceHatStayedBound =
        sourceHatStayedBound && sample.sourceHatId === "bellCrown";
      const motion =
        Math.abs(sample.headRotationX || 0) +
        Math.abs(sample.headRotationZ || 0);
      if (motion > peakMotion) {
        peakMotion = motion;
        peak = sample;
      }
    }
    return {
      initial,
      peak,
      peakMotion,
      sourceHatStayedBound,
    };
  });

  expect(report.initial.sourceHatId).toBe("bellCrown");
  expect(report.sourceHatStayedBound).toBe(true);
  expect(report.peak.walkPhase).toBeGreaterThan(report.initial.walkPhase + 0.1);
  expect(report.peakMotion).toBeGreaterThan(0.001);
  expect(Math.abs(report.peak.hatBrimRotationX - report.peak.headRotationX))
    .toBeLessThanOrEqual(0.0002);
  expect(Math.abs(report.peak.hatBrimRotationZ - report.peak.headRotationZ))
    .toBeLessThanOrEqual(0.0002);
  expect(Math.abs(report.peak.hatTopRotationX - report.peak.headRotationX))
    .toBeLessThanOrEqual(0.0002);
  expect(Math.abs(report.peak.hatTopRotationZ - report.peak.headRotationZ))
    .toBeLessThanOrEqual(0.0002);
});

test("doppelganger guest replicas inherit every source player's hat", async ({ page }) => {
  await openGame(page);
  const looks = [
    {
      name: "Bell Host",
      cosmetics: { cowboyId: "gildedLegend", hatId: "bellCrown" },
    },
    {
      name: "Rail Guest",
      cosmetics: { cowboyId: "moonlitOutlaw", hatId: "railmanCap" },
    },
    {
      name: "Law Guest",
      cosmetics: { cowboyId: "crimsonLawman", hatId: "undertaker" },
    },
    {
      name: "Mesa Guest",
      cosmetics: { cowboyId: "mesaRanger", hatId: "marshalStar" },
    },
  ];

  const report = await page.evaluate((players) => {
    const game = window.__dustAndDeadTest;
    const multiplayer = window.__dustMultiplayerTest;
    game.setAutomaticFrameLoopModeForTest("paused");
    multiplayer.startMockHost(players);
    game.forceDoppelgangerScoutForTest({
      sourceBossWave: 5,
      dueBossWave: 10,
      x: 20,
      z: 20,
    });
    game.forceDoppelgangerTransformForTest();
    const firstWire = multiplayer.buildWireSnapshot(
      false,
      false,
      "mock-player-2"
    );
    let host = game.getDoppelgangerDiagnostics();
    let movingWire = firstWire;
    for (let frame = 0; frame < 180; frame += 1) {
      game.advanceRealFrame(17, { render: false });
      host = game.getDoppelgangerDiagnostics();
      if (host.clones.some((clone) => clone.moveAmount > 0.05)) {
        movingWire = multiplayer.buildWireSnapshot(
          false,
          false,
          "mock-player-2"
        );
        break;
      }
    }

    multiplayer.startMockGuest(players, 1);
    multiplayer.applySnapshot(firstWire);
    multiplayer.applySnapshot(movingWire);
    const guestBefore = game.getDoppelgangerDiagnostics();
    for (let frame = 0; frame < 30; frame += 1) {
      game.advanceRealFrame(17, { render: false });
    }
    const guestAfter = game.getDoppelgangerDiagnostics();
    return { host, guestBefore, guestAfter };
  }, looks);

  const expectedHats = ["bellCrown", "railmanCap", "undertaker", "marshalStar"];
  expect(report.host.clones.map((clone) => clone.sourceHatId)).toEqual(expectedHats);
  expect(report.guestBefore).toMatchObject({ replica: true, phase: "boss" });
  expect(report.guestBefore.clones.map((clone) => clone.sourceHatId)).toEqual(expectedHats);
  expect(report.guestAfter.clones.map((clone) => clone.sourceHatId)).toEqual(expectedHats);

  const animatedGuestClones = report.guestAfter.clones.filter(
    (clone) => clone.moveAmount > 0.05
  );
  expect(animatedGuestClones.length).toBeGreaterThan(0);
  for (const clone of animatedGuestClones) {
    expect(Math.abs(clone.hatBrimRotationX - clone.headRotationX))
      .toBeLessThanOrEqual(0.0002);
    expect(Math.abs(clone.hatBrimRotationZ - clone.headRotationZ))
      .toBeLessThanOrEqual(0.0002);
    expect(Math.abs(clone.hatTopRotationX - clone.headRotationX))
      .toBeLessThanOrEqual(0.0002);
    expect(Math.abs(clone.hatTopRotationZ - clone.headRotationZ))
      .toBeLessThanOrEqual(0.0002);
  }
});
