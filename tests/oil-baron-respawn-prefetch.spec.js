const path = require("node:path");
const { expect, test } = require("@playwright/test");

function fileUrl(relativePath) {
  const absolute = path.resolve(__dirname, "..", relativePath).replace(/\\/g, "/");
  return `file:///${absolute}`;
}

async function startHunt(page) {
  await page.goto(`${fileUrl("index.html")}?mapSeed=7331&oilRespawnPrefetchAudit=1`);
  const intro = page.locator("#intro-screen");
  if (await intro.isVisible().catch(() => false)) {
    await page.keyboard.press("KeyM");
    await expect(intro).toBeHidden();
  }
  await page.getByRole("button", { name: "Start Hunt" }).click();
  await page.waitForFunction(() => Boolean(
    window.__dustAndDeadTest?.getOilBaronDiagnostics
      && window.__dustAndDeadTest?.spawnOilDerrickBatch
      && window.__dustMultiplayerTest?.getOilBaronRespawnPrefetchDiagnostics
      && window.__dustMultiplayerTest?.getLocalRespawnPresentationDiagnostics
      && window.__dustMultiplayerTest?.buildWireSnapshot
  ));
}

test("old Oil Baron derricks are prefetched offscreen while dead and never pop in after a far revive", async ({ page }) => {
  test.setTimeout(30_000);
  await startHunt(page);

  const host = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const multiplayer = window.__dustMultiplayerTest;
    const clone = (value) => JSON.parse(JSON.stringify(value));
    const guestId = "mock-player-2";

    multiplayer.startMockHost(["Host", "Far revive guest"]);
    game.startWaveNow(10, "oilBaron");
    game.clearEnemies();
    game.setOilBaronAiEnabled(false);
    multiplayer.setPoints(guestId, 50_000);

    // The first death only exposes the deterministic spawn selected for this
    // player. The second death is the real regression setup and uses old rigs.
    multiplayer.damagePlayer(guestId, 999, "mock-player-1");
    const firstPrefetch = multiplayer.getOilBaronRespawnPrefetchDiagnostics(guestId);
    if (!firstPrefetch?.active || !firstPrefetch.respawn) throw new Error("Respawn prefetch did not activate");
    const respawn = firstPrefetch.respawn;
    if (!multiplayer.revive(guestId, "learn-oil-respawn")) throw new Error("Probe revive failed");

    const farX = respawn.x >= 0 ? -180 : 180;
    const farZ = respawn.z >= 0 ? -150 : 150;
    multiplayer.setPlayerPosition("mock-player-1", farX, farZ);
    multiplayer.setPlayerPosition(guestId, farX + (farX < 0 ? 3 : -3), farZ);

    const beforeCount = game.getOilBaronDiagnostics().derrickCount;
    game.spawnOilDerrickBatch([
      { x: respawn.x, z: respawn.z, options: { oilRadius: 14.5, oilAge: 25, logicalOnly: true } },
      { x: respawn.x + 7.5, z: respawn.z + 2.5, options: { oilRadius: 13.8, oilAge: 24, logicalOnly: true } },
      { x: respawn.x - 7.25, z: respawn.z - 3, options: { oilRadius: 14.2, oilAge: 23, logicalOnly: true } },
    ]);
    game.advanceOilBaron(1_200);
    const oldRigIds = game.getOilBaronDiagnostics().derricks
      .slice(beforeCount)
      .map((derrick) => String(derrick.id))
      .sort();

    // While alive at the opposite end of the arena, these rigs must stay out
    // of the viewer packet. This makes the later dead-player packet a genuine
    // prefetch rather than an already-known replica.
    const liveWire = clone(multiplayer.buildWireSnapshot(false, false, guestId));
    const liveBoss = multiplayer.decodeBossState(liveWire.bossState);

    multiplayer.damagePlayer(guestId, 999, "mock-player-1");
    const prefetch = multiplayer.getOilBaronRespawnPrefetchDiagnostics(guestId);
    const deathWire = clone(multiplayer.buildWireSnapshot(false, false, guestId));
    const deathBoss = multiplayer.decodeBossState(deathWire.bossState);

    if (!multiplayer.revive(guestId, "oil-prefetch-regression")) throw new Error("Regression revive failed");
    const reviveWire = clone(multiplayer.buildWireSnapshot(false, false, guestId));
    const reviveBoss = multiplayer.decodeBossState(reviveWire.bossState);
    const scopedIds = (
      prefetch.scopedDerrickIds || prefetch.scopedIds || []
    ).map((id) => String(id)).sort();
    const scopedCount = Number(
      prefetch.scopedDerrickCount == null ? prefetch.scopedCount : prefetch.scopedDerrickCount
    );

    return {
      liveWire,
      deathWire,
      reviveWire,
      deathWireBytes: new TextEncoder().encode(JSON.stringify(deathWire)).length,
      reviveWireBytes: new TextEncoder().encode(JSON.stringify(reviveWire)).length,
      oldRigIds,
      liveBossIds: (liveBoss?.derricks || []).map((entry) => String(entry.id)).sort(),
      deathBossIds: (deathBoss?.derricks || []).map((entry) => String(entry.id)).sort(),
      reviveBossIds: (reviveBoss?.derricks || []).map((entry) => String(entry.id)).sort(),
      deathKeyframe: !!deathBoss?.keyframe,
      deathComplete: !!deathBoss?.derricksComplete,
      prefetch: {
        active: !!prefetch?.active,
        respawn: prefetch?.respawn || null,
        primaryRect: prefetch?.primaryRect || null,
        prefetchRect: prefetch?.prefetchRect || null,
        scopedIds,
        scopedCount,
      },
    };
  });

  expect(host.oldRigIds).toHaveLength(3);
  expect(host.liveBossIds.filter((id) => host.oldRigIds.includes(id))).toEqual([]);
  expect(host.prefetch).toMatchObject({
    active: true,
    respawn: expect.any(Object),
    primaryRect: expect.any(Object),
    prefetchRect: expect.any(Object),
  });
  expect(host.prefetch.scopedIds).toEqual(expect.arrayContaining(host.oldRigIds));
  expect(host.prefetch.scopedCount).toBeGreaterThanOrEqual(host.oldRigIds.length);
  expect(host.deathKeyframe).toBe(true);
  expect(host.deathComplete).toBe(true);
  expect(host.deathBossIds).toEqual(expect.arrayContaining(host.oldRigIds));
  expect(host.reviveBossIds).toEqual(expect.arrayContaining(host.oldRigIds));
  expect(host.deathWireBytes).toBeLessThan(31 * 1024);
  expect(host.reviveWireBytes).toBeLessThan(31 * 1024);

  const guestBeforeRevive = await page.evaluate(({ liveWire, deathWire, oldRigIds }) => {
    const game = window.__dustAndDeadTest;
    const multiplayer = window.__dustMultiplayerTest;
    multiplayer.startMockGuest(["Host", "Far revive guest"], 1);
    multiplayer.applySnapshot(liveWire);
    multiplayer.applySnapshot(deathWire);
    const diagnostics = game.getOilBaronDiagnostics();
    return {
      ids: derrickIdsForPage(diagnostics),
      reveal: diagnostics.replicaReveal,
      presentation: multiplayer.getLocalRespawnPresentationDiagnostics(),
      allOldPresent: oldRigIds.every((id) => diagnostics.derricks.some((derrick) => String(derrick.id) === id)),
    };

    function derrickIdsForPage(value) {
      return (value?.derricks || []).map((entry) => String(entry.id || "")).filter(Boolean).sort();
    }
  }, host);

  expect(guestBeforeRevive.allOldPresent).toBe(true);

  // Let the normal one-component-per-frame upload/reveal queue finish while
  // the player is still looking through the death/spectator presentation.
  await page.waitForFunction((oldRigIds) => {
    const diagnostics = window.__dustAndDeadTest.getOilBaronDiagnostics();
    const reveal = diagnostics?.replicaReveal;
    return oldRigIds.every((id) => diagnostics.derricks.some((derrick) => String(derrick.id) === id))
      && !reveal?.collecting
      && !reveal?.active
      && reveal?.queued === 0
      && !reveal?.measureNextRender
      && !reveal?.upload?.pendingCommit
      && !reveal?.upload?.gatePending;
  }, host.oldRigIds, { polling: "raf", timeout: 15_000 });

  const reviveStart = await page.evaluate(({ reviveWire, oldRigIds }) => {
    const game = window.__dustAndDeadTest;
    const multiplayer = window.__dustMultiplayerTest;
    const before = game.getOilBaronDiagnostics();
    const presentationBefore = multiplayer.getLocalRespawnPresentationDiagnostics();
    multiplayer.applySnapshot(reviveWire);
    const after = game.getOilBaronDiagnostics();
    const presentationAfter = multiplayer.getLocalRespawnPresentationDiagnostics();
    return {
      revealTotalBefore: before.replicaReveal.total,
      revealTotalAfter: after.replicaReveal.total,
      revealQueuedAfter: after.replicaReveal.queued,
      revealActiveAfter: after.replicaReveal.active,
      idsAfter: after.derricks.map((derrick) => String(derrick.id)).sort(),
      allOldPresent: oldRigIds.every((id) => after.derricks.some((derrick) => String(derrick.id) === id)),
      presentationBefore,
      presentationAfter,
    };
  }, host);

  expect(reviveStart.allOldPresent).toBe(true);
  expect(reviveStart.idsAfter).toEqual(expect.arrayContaining(host.oldRigIds));
  expect(reviveStart.revealTotalAfter).toBe(reviveStart.revealTotalBefore);
  expect(reviveStart.revealQueuedAfter).toBe(0);
  expect(reviveStart.revealActiveAfter).toBe(false);
  expect(reviveStart.presentationAfter.active).toBe(true);
  expect(reviveStart.presentationAfter.startedCount).toBe(
    Number(reviveStart.presentationBefore?.startedCount || 0) + 1
  );

  // The transition is released only after a complete hidden render at the new
  // location. No derrick is allowed to enter the reveal queue after exposure.
  await page.waitForFunction((oldRigIds) => {
    const presentation = window.__dustMultiplayerTest.getLocalRespawnPresentationDiagnostics();
    const baron = window.__dustAndDeadTest.getOilBaronDiagnostics();
    const rigs = baron?.derricks?.filter((derrick) => oldRigIds.includes(String(derrick.id))) || [];
    return presentation && !presentation.active && presentation.releasedCount > 0
      && !baron?.replicaReveal?.active
      && baron?.replicaReveal?.queued === 0
      && rigs.length === oldRigIds.length
      && rigs.every((rig) => rig.visualVisible && rig.transform?.visible && !rig.revealPoseFrozen);
  }, host.oldRigIds, { polling: "raf", timeout: 5_000 });

  const exposed = await page.evaluate((oldRigIds) => {
    const game = window.__dustAndDeadTest.getOilBaronDiagnostics();
    const multiplayer = window.__dustMultiplayerTest;
    const presentation = multiplayer.getLocalRespawnPresentationDiagnostics();
    const player = multiplayer.getState().players.find((entry) => entry.id === "mock-player-2");
    const rigs = game.derricks.filter((derrick) => oldRigIds.includes(String(derrick.id)));
    return {
      player,
      presentation,
      reveal: game.replicaReveal,
      rigs: rigs.map((derrick) => ({
        id: String(derrick.id),
        visualVisible: derrick.visualVisible,
        revealPoseFrozen: derrick.revealPoseFrozen,
        transformVisible: derrick.transform?.visible,
      })),
    };
  }, host.oldRigIds);

  console.log(`OIL_BARON_RESPAWN_PREFETCH ${JSON.stringify({
    oldRigIds: host.oldRigIds,
    scopedCount: host.prefetch.scopedCount,
    deathBossCount: host.deathBossIds.length,
    deathWireBytes: host.deathWireBytes,
    revealTotal: exposed.reveal.total,
    releaseReason: exposed.presentation.reason,
    startedCount: exposed.presentation.startedCount,
    releasedCount: exposed.presentation.releasedCount,
  })}`);

  expect(exposed.player).toMatchObject({ alive: true });
  expect(exposed.presentation.active).toBe(false);
  expect(exposed.presentation.releasedCount).toBe(exposed.presentation.startedCount);
  expect(exposed.presentation.reason).toMatch(/ready|render/i);
  expect(exposed.reveal).toMatchObject({ active: false, queued: 0, measureNextRender: false });
  expect(exposed.rigs).toHaveLength(host.oldRigIds.length);
  expect(exposed.rigs.every((rig) => !rig.revealPoseFrozen)).toBe(true);
  expect(exposed.rigs.every((rig) => rig.visualVisible && rig.transformVisible)).toBe(true);
});
