const path = require("node:path");
const { expect, test } = require("@playwright/test");

function fileUrl(relativePath) {
  const absolute = path.resolve(__dirname, "..", relativePath).replace(/\\/g, "/");
  return `file:///${absolute}`;
}

async function startHunt(page) {
  await page.goto(`${fileUrl("index.html")}?mapSeed=7331`);
  const intro = page.locator("#intro-screen");
  if (await intro.isVisible().catch(() => false)) {
    await page.keyboard.press("KeyM");
    await expect(intro).toBeHidden();
  }
  await page.getByRole("button", { name: "Start Hunt" }).click();
  await page.waitForFunction(() => Boolean(
    window.__dustAndDeadTest?.startWaveNow &&
    window.__dustAndDeadTest?.getBellRingerDiagnostics &&
    window.__dustAndDeadTest?.getGhostTrainDiagnostics &&
    window.__dustAndDeadTest?.getOilBaronDiagnostics &&
    window.__dustAndDeadTest?.getSlothArchbishopDiagnostics
  ));
}

test("solo wave 5 bosses have one 2.3rd of wave 10 health except the unchanged Ghost Train", async ({ page }) => {
  await startHunt(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const multiplayer = window.__dustMultiplayerTest;
    const eligibleKinds = [
      "bellRinger",
      "ghostTrain",
      "oilBaron",
      "slothArchbishop",
      "hordeheart",
    ];

    function readBossHealth(wave, kind) {
      const started = game.startWaveNow(wave, kind);
      if (kind === "hordeheart") game.forceHordeheartPhase("whole");
      const diagnostics = kind === "bellRinger"
        ? game.getBellRingerDiagnostics()
        : kind === "ghostTrain"
          ? game.getGhostTrainDiagnostics()
          : kind === "oilBaron"
            ? game.getOilBaronDiagnostics()
            : kind === "slothArchbishop"
              ? game.getSlothArchbishopDiagnostics()
              : game.getHordeheartDiagnostics();
      const maxHp = kind === "oilBaron"
        ? diagnostics.boss.maxHp
        : kind === "hordeheart"
          ? diagnostics.bodies.reduce((total, body) => total + body.maxHp, 0)
          : diagnostics.maxHp;
      const waveScale = kind === "oilBaron"
        ? diagnostics.combatConfig.bossWaveHealthScale
        : diagnostics.healthTuning.waveHealthScale;
      return {
        wave,
        requestedKind: kind,
        selectedKind: started.wave10BossKind,
        maxHp,
        waveScale,
      };
    }

    const soloPairs = eligibleKinds.map((kind) => ({
      kind,
      first: readBossHealth(5, kind),
      standard: readBossHealth(10, kind),
    }));
    const forbidden = game.startWaveNow(5, "landEater");
    const allowedLater = game.startWaveNow(10, "landEater");
    const laterLandEater = game.getLandEaterDiagnostics();
    multiplayer.startMockHost(["Host", "Guest"]);
    const multiplayerPairs = eligibleKinds.map((kind) => ({
      kind,
      first: readBossHealth(5, kind),
      standard: readBossHealth(10, kind),
    }));
    return {
      soloPairs,
      multiplayerPairs,
      forbidden,
      allowedLater,
      laterLandEater,
      rotation: game.getBossRotationDiagnostics(),
    };
  });

  const expectedSoloHealth = {
    bellRinger: { first: 110, standard: 252 },
    ghostTrain: { first: 250, standard: 425 },
    oilBaron: { first: 939, standard: 2160 },
    slothArchbishop: { first: 548, standard: 1260 },
    hordeheart: { first: 730, standard: 1680 },
  };
  for (const pair of result.soloPairs) {
    expect(pair.first.selectedKind, pair.kind).toBe(pair.kind);
    expect(pair.standard.selectedKind, pair.kind).toBe(pair.kind);
    expect(pair.first.maxHp, pair.kind).toBe(expectedSoloHealth[pair.kind].first);
    expect(pair.standard.maxHp, pair.kind).toBe(expectedSoloHealth[pair.kind].standard);
    expect(pair.standard.waveScale, pair.kind).toBe(1);
    if (pair.kind === "ghostTrain") {
      expect(pair.first.waveScale, pair.kind).toBe(0.5);
      expect(pair.first.maxHp, pair.kind).toBe(250);
      expect(pair.standard.maxHp, pair.kind).toBe(425);
    } else {
      const firstWaveBalance = pair.kind === "oilBaron" ? 0.8 : 0.7;
      expect(pair.first.waveScale, pair.kind).toBeCloseTo(firstWaveBalance / 2.3, 2);
      expect(pair.first.maxHp, pair.kind).toBe(Math.round(pair.standard.maxHp / 2.3));
    }
  }
  for (const pair of result.multiplayerPairs) {
    expect(pair.first.selectedKind, pair.kind).toBe(pair.kind);
    expect(pair.standard.selectedKind, pair.kind).toBe(pair.kind);
    expect(pair.first.waveScale, pair.kind).toBe(0.5);
    expect(pair.standard.waveScale, pair.kind).toBe(1);
    const unchangedMultiplayerRatio = pair.kind === "ghostTrain"
      ? 1.7
      : pair.kind === "oilBaron"
        ? 1.6
        : 1.4;
    expect(pair.standard.maxHp / pair.first.maxHp, pair.kind).toBeCloseTo(unchangedMultiplayerRatio, 1);
  }
  expect(result.forbidden.wave).toBe(5);
  expect(result.forbidden.wave10BossKind).not.toBe("landEater");
  expect(result.allowedLater).toMatchObject({ wave: 10, wave10BossKind: "landEater" });
  expect(result.laterLandEater).toMatchObject({
    active: true,
    hp: 2940,
    maxHp: 2940,
  });
  expect(result.rotation).toMatchObject({ firstWave: 5, interval: 5, bossWave: true });
});

test("every boss gains exactly 20 percent of its standard health every five waves after wave 10", async ({ page }) => {
  await startHunt(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const cases = [
      [10, "bellRinger"], [15, "bellRinger"], [20, "bellRinger"],
      [10, "ghostTrain"], [15, "ghostTrain"], [20, "ghostTrain"],
      [10, "oilBaron"], [15, "oilBaron"], [20, "oilBaron"], [25, "oilBaron"],
      [10, "slothArchbishop"], [15, "slothArchbishop"], [20, "slothArchbishop"],
    ];
    return cases.map(([wave, kind]) => {
      game.startWaveNow(wave, kind);
      game.clearEnemies();
      const diagnostics = kind === "bellRinger"
        ? game.getBellRingerDiagnostics()
        : kind === "ghostTrain"
          ? game.getGhostTrainDiagnostics()
          : kind === "oilBaron"
            ? game.getOilBaronDiagnostics()
            : game.getSlothArchbishopDiagnostics();
      const boss = kind === "oilBaron" ? diagnostics.boss : diagnostics;
      return {
        wave,
        kind,
        hp: boss.hp,
        maxHp: boss.maxHp,
        segmentMaxHp: kind === "ghostTrain" ? diagnostics.healthTuning.segmentMaxHp : null,
        waveScale: kind === "oilBaron"
          ? diagnostics.combatConfig.bossWaveHealthScale
          : diagnostics.healthTuning.waveHealthScale,
      };
    });
  });

  expect(result.filter((entry) => entry.kind !== "slothArchbishop")).toEqual([
    { wave: 10, kind: "bellRinger", hp: 252, maxHp: 252, segmentMaxHp: null, waveScale: 1 },
    { wave: 15, kind: "bellRinger", hp: 302, maxHp: 302, segmentMaxHp: null, waveScale: 1.2 },
    { wave: 20, kind: "bellRinger", hp: 353, maxHp: 353, segmentMaxHp: null, waveScale: 1.4 },
    { wave: 10, kind: "ghostTrain", hp: 425, maxHp: 425, segmentMaxHp: 85, waveScale: 1 },
    { wave: 15, kind: "ghostTrain", hp: 510, maxHp: 510, segmentMaxHp: 102, waveScale: 1.2 },
    { wave: 20, kind: "ghostTrain", hp: 595, maxHp: 595, segmentMaxHp: 119, waveScale: 1.4 },
    { wave: 10, kind: "oilBaron", hp: 2160, maxHp: 2160, segmentMaxHp: null, waveScale: 1 },
    { wave: 15, kind: "oilBaron", hp: 2592, maxHp: 2592, segmentMaxHp: null, waveScale: 1.2 },
    { wave: 20, kind: "oilBaron", hp: 3024, maxHp: 3024, segmentMaxHp: null, waveScale: 1.4 },
    { wave: 25, kind: "oilBaron", hp: 3456, maxHp: 3456, segmentMaxHp: null, waveScale: 1.6 },
  ]);

  const sloth = result.filter((entry) => entry.kind === "slothArchbishop");
  expect(sloth).toHaveLength(3);
  expect(sloth.map((entry) => entry.waveScale)).toEqual([1, 1.2, 1.4]);
  expect(sloth.every((entry) => entry.hp === entry.maxHp && entry.maxHp > 0)).toBe(true);
  expect(sloth[1].maxHp).toBeCloseTo(sloth[0].maxHp * 1.2, 5);
  expect(sloth[2].maxHp).toBeCloseTo(sloth[0].maxHp * 1.4, 5);
});

test("wave health scaling composes with four-player health and survives the packed guest replica", async ({ page, context }) => {
  const guest = await context.newPage();
  try {
    await startHunt(page);
    await startHunt(guest);

    const host = await page.evaluate(() => {
      const game = window.__dustAndDeadTest;
      const multiplayer = window.__dustMultiplayerTest;
      multiplayer.startMockHost(["Host", "North", "South", "West"]);

      game.startWaveNow(15, "bellRinger");
      const bell = game.getBellRingerDiagnostics();
      game.startWaveNow(20, "ghostTrain");
      const train = game.getGhostTrainDiagnostics();
      game.startWaveNow(20, "slothArchbishop");
      const sloth = game.getSlothArchbishopDiagnostics();
      const slothSnapshot = multiplayer.buildWireSnapshot(false, false, "mock-player-2");
      game.startWaveNow(25, "oilBaron");
      game.clearEnemies();
      const baron = game.getOilBaronDiagnostics();
      const snapshot = multiplayer.buildWireSnapshot(false, false, "mock-player-2");
      return {
        bell: { hp: bell.hp, maxHp: bell.maxHp },
        train: {
          hp: train.hp,
          maxHp: train.maxHp,
          segmentMaxHp: train.healthTuning.segmentMaxHp,
          playerScale: train.healthTuning.playerHealthScale,
          waveScale: train.healthTuning.waveHealthScale,
        },
        sloth: {
          hp: sloth.hp,
          maxHp: sloth.maxHp,
          baseHp: sloth.healthTuning.baseHp,
          hpPerExtraPlayer: sloth.healthTuning.hpPerExtraPlayer,
          waveScale: sloth.healthTuning.waveHealthScale,
        },
        baron: {
          hp: baron.boss.hp,
          maxHp: baron.boss.maxHp,
          baseHp: baron.combatConfig.bossBaseHp,
          hpPerExtraPlayer: baron.combatConfig.bossHpPerExtraPlayer,
          waveScale: baron.combatConfig.bossWaveHealthScale,
        },
        slothSnapshot,
        decodedSloth: multiplayer.decodeBossState(slothSnapshot.bossState),
        snapshot,
        decoded: multiplayer.decodeBossState(snapshot.bossState),
      };
    });

    const replica = await guest.evaluate((snapshot) => {
      const multiplayer = window.__dustMultiplayerTest;
      multiplayer.startMockGuest(["Host", "North", "South", "West"], 1);
      multiplayer.applySnapshot(snapshot.sloth);
      const sloth = window.__dustAndDeadTest.getSlothArchbishopDiagnostics();
      multiplayer.applySnapshot(snapshot.baron);
      const baron = window.__dustAndDeadTest.getOilBaronDiagnostics();
      return {
        wave: JSON.parse(window.render_game_to_text()).wave,
        sloth: {
          replica: sloth.replica,
          hp: sloth.hp,
          maxHp: sloth.maxHp,
        },
        replica: baron.replica,
        hp: baron.boss.hp,
        maxHp: baron.boss.maxHp,
      };
    }, { sloth: host.slothSnapshot, baron: host.snapshot });

    expect(host.bell).toEqual({ hp: 756, maxHp: 756 });
    expect(host.train).toEqual({ hp: 1490, maxHp: 1490, segmentMaxHp: 298, playerScale: 2.5, waveScale: 1.4 });
    expect(host.sloth.hp).toBe(host.sloth.maxHp);
    expect(host.sloth.baseHp).toBeGreaterThan(0);
    expect(host.sloth.hpPerExtraPlayer).toBeGreaterThanOrEqual(0);
    expect(host.sloth.waveScale).toBe(1.4);
    expect(host.sloth.maxHp).toBe(
      Math.round((host.sloth.baseHp + host.sloth.hpPerExtraPlayer * 3) * host.sloth.waveScale * 0.7)
    );
    expect(host.decodedSloth).toMatchObject({
      kind: "slothArchbishop",
      hp: host.sloth.hp,
      maxHp: host.sloth.maxHp,
    });
    expect(replica.sloth).toEqual({ replica: true, hp: host.sloth.hp, maxHp: host.sloth.maxHp });
    expect(host.baron).toEqual({ hp: 8640, maxHp: 8640, baseHp: 2700, hpPerExtraPlayer: 1350, waveScale: 1.6 });
    expect(host.decoded).toMatchObject({ kind: "oilBaron", hp: 8640, maxHp: 8640 });
    expect(replica).toMatchObject({ wave: 25, replica: true, hp: 8640, maxHp: 8640 });
  } finally {
    await guest.close();
  }
});
