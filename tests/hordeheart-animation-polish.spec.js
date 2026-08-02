const path = require("node:path");
const { expect, test } = require("@playwright/test");

const ACTIONS = [
  "fleshTide", "ribBloom", "systole", "pincer", "arterialSweep", "rush", "carrionNest",
];

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
    window.THREE
    && window.__dustAndDeadTest?.startWaveNow
    && window.__dustAndDeadTest?.advanceHordeheart
  ));
}

async function installHordeheartTelegraphCapture(page) {
  await page.evaluate(() => {
    window.__hordeheartAnimationPolish = { telegraph: null };
    const objectPrototype = window.THREE.Object3D.prototype;
    if (objectPrototype.__hordeheartAnimationPolishOriginalAdd) return;
    const originalAdd = objectPrototype.add;
    Object.defineProperty(objectPrototype, "__hordeheartAnimationPolishOriginalAdd", {
      configurable: true,
      value: originalAdd,
    });
    objectPrototype.add = function captureHordeheartNodes(...objects) {
      for (const object of objects) {
        if (object?.name === "Hordeheart_Telegraph") {
          window.__hordeheartAnimationPolish.telegraph = object;
        }
      }
      return originalAdd.apply(this, objects);
    };
  });
}

async function prepareNaturalAttack(page, phase, expectedAction) {
  return page.evaluate(({ phaseName, actionName }) => {
    const game = window.__dustAndDeadTest;
    game.setPlayerMaxHp(10000, 10000);
    game.startWaveNow(10, "hordeheart");
    game.forceHordeheartPhase(phaseName);
    const opening = game.getHordeheartDiagnostics();
    const focus = opening.bodies[0];
    game.setPlayerPosition(focus.x, focus.z + 12);

    let diagnostics = game.forceHordeheartAttack(actionName);
    if (diagnostics) diagnostics = game.advanceHordeheart(120);
    if (diagnostics.attack !== actionName) {
      return { found: false, diagnostics };
    }

    const telegraph = window.__hordeheartAnimationPolish?.telegraph;
    const parts = telegraph?.userData?.parts;
    const world = JSON.parse(window.render_game_to_text());
    if (!telegraph || !parts) {
      return { found: true, missingTelegraph: true, diagnostics, world };
    }

    const laneInfo = (rig, lane, targetSpec, caps) => {
      if (!rig || !lane || !targetSpec) return null;
      const parameters = lane.geometry?.parameters || {};
      const renderedLength = Math.abs((Number(parameters.height) || 0) * rig.scale.z);
      const renderedWidth = Math.abs((Number(parameters.width) || 0) * rig.scale.x);
      const actualTargetDistance = Math.hypot(
        targetSpec.targetX - targetSpec.sourceX,
        targetSpec.targetZ - targetSpec.sourceZ
      );
      const midpointEncodedDistance = Math.hypot(
        rig.position.x - targetSpec.sourceX,
        rig.position.z - targetSpec.sourceZ
      ) * 2;
      const capInfo = Array.from(caps?.children || []).map((cap) => {
        const worldPosition = new window.THREE.Vector3();
        cap.getWorldPosition(worldPosition);
        return {
          x: worldPosition.x,
          z: worldPosition.z,
          radiusX: Math.abs(cap.scale.x * rig.scale.x),
          radiusZ: Math.abs(cap.scale.z * rig.scale.z),
        };
      });
      return {
        visible: rig.visible,
        geometryType: lane.geometry?.type || "",
        renderedLength,
        renderedWidth,
        hitRadius: Number(rig.userData?.hitRadius) || 0,
        actualTargetDistance,
        midpointEncodedDistance,
        source: { x: targetSpec.sourceX, z: targetSpec.sourceZ },
        target: { x: targetSpec.targetX, z: targetSpec.targetZ },
        caps: capInfo,
      };
    };

    const primaryTarget = diagnostics.actionTargets[0];
    const secondaryTarget = diagnostics.actionTargets[1];
    const circlePositions = parts.systoleFill?.geometry?.attributes?.position;
    let systoleNearestVertexToCenter = Infinity;
    if (circlePositions) {
      for (let index = 0; index < circlePositions.count; index += 1) {
        systoleNearestVertexToCenter = Math.min(
          systoleNearestVertexToCenter,
          Math.hypot(
            circlePositions.getX(index),
            circlePositions.getY(index),
            circlePositions.getZ(index)
          )
        );
      }
    }

    return {
      found: true,
      missingTelegraph: false,
      diagnostics,
      actionKind: parts.actionKind,
      primaryLane: laneInfo(parts.primaryLaneRig, parts.lane, primaryTarget, parts.primaryLaneCaps),
      secondaryLane: laneInfo(parts.secondaryLaneRig, parts.secondaryLane, secondaryTarget, parts.secondaryLaneCaps),
      ribBloom: {
        visible: Boolean(parts.ring?.visible),
        name: parts.ring?.name || "",
        dangerRadius: Number(parts.dangerRadius) || 0,
        entityRadius: Number(parts.entityRadius) || 0,
        arcs: Array.from(parts.ring?.children || []).map((arc) => ({
          uuid: arc.uuid,
          geometryType: arc.geometry?.type || "",
          thetaStart: Number(arc.geometry?.parameters?.thetaStart),
          thetaLength: Number(arc.geometry?.parameters?.thetaLength),
          innerRadius: Number(arc.geometry?.parameters?.innerRadius),
          outerRadius: Number(arc.geometry?.parameters?.outerRadius),
          scale: arc.scale.x,
        })),
      },
      systole: {
        visible: Boolean(parts.systoleFill?.visible),
        name: parts.systoleFill?.name || "",
        geometryType: parts.systoleFill?.geometry?.type || "",
        nearestVertexToCenter: systoleNearestVertexToCenter,
        radius: Number(parts.systoleFill?.geometry?.parameters?.radius) || 0,
        scale: Number(parts.systoleFill?.scale?.x) || 0,
        dangerRadius: Number(parts.dangerRadius) || 0,
        entityRadius: Number(parts.entityRadius) || 0,
        ribBloomArcsVisible: Boolean(parts.ring?.visible),
      },
    };
  }, { phaseName: phase, actionName: expectedAction });
}

test("action preview preserves an explicit zero progress for all seven attacks", async ({ page }) => {
  test.setTimeout(100_000);
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  for (const action of ACTIONS) {
    await page.goto(
      `${fileUrl("index.html")}?mapSeed=7331&preview=hordeheart-action&action=${action}&progress=0`
    );
    await page.waitForFunction((expected) => (
      window.__dustAndDeadTest?.getHordeheartDiagnostics?.().attack === expected
    ), action);

    const state = await page.evaluate((expected) => {
      const diagnostics = window.__dustAndDeadTest.getHordeheartDiagnostics();
      const wire = window.__dustAndDeadTest.getHordeheartWireState();
      const attackingBodies = wire.bodies.filter((body) => body.action === expected);
      return {
        attack: diagnostics.attack,
        attackingCount: attackingBodies.length,
        timers: attackingBodies.map((body) => body.actionTimer),
      };
    }, action);

    expect(state.attack).toBe(action);
    const expectedCount = action === "pincer" || action === "arterialSweep" ? 2
      : action === "rush" || action === "carrionNest" ? 4 : 1;
    expect(state.attackingCount).toBe(expectedCount);
    expect(state.timers).toEqual(Array(state.attackingCount).fill(0));
  }

  expect(pageErrors).toEqual([]);
});

test("telegraphs expose truthful radial topology and target-sized lanes", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await startHunt(page);
  await installHordeheartTelegraphCapture(page);

  const ordinary = await prepareNaturalAttack(page, "whole", "fleshTide");
  expect(ordinary).toMatchObject({
    found: true,
    missingTelegraph: false,
    actionKind: "fleshTide",
    primaryLane: { visible: true, geometryType: "PlaneGeometry" },
  });
  expect(ordinary.primaryLane.renderedLength).toBeCloseTo(
    ordinary.primaryLane.actualTargetDistance,
    1
  );
  // Body coordinates in public diagnostics are rounded to 3 decimals while
  // the Three.js rig keeps the exact source point.  Allow only that known
  // serialization quantum; the rendered lane still comes from the exact
  // collision segment.
  expect(Math.abs(
    ordinary.primaryLane.renderedLength - ordinary.primaryLane.midpointEncodedDistance
  )).toBeLessThan(0.002);
  expect(ordinary.primaryLane.hitRadius).toBeCloseTo(ordinary.diagnostics.actionTargets[0].radius, 4);
  expect(ordinary.primaryLane.renderedWidth).toBeCloseTo(ordinary.primaryLane.hitRadius * 2, 4);
  expect(ordinary.primaryLane.caps).toHaveLength(2);
  for (const cap of ordinary.primaryLane.caps) {
    expect(cap.radiusX).toBeCloseTo(ordinary.primaryLane.hitRadius, 4);
    expect(cap.radiusZ).toBeCloseTo(ordinary.primaryLane.hitRadius, 4);
  }
  for (const endpoint of [ordinary.primaryLane.source, ordinary.primaryLane.target]) {
    expect(Math.min(...ordinary.primaryLane.caps.map((cap) => Math.hypot(
      cap.x - endpoint.x,
      cap.z - endpoint.z,
    )))).toBeLessThan(0.01);
  }

  const pincer = await prepareNaturalAttack(page, "halves", "pincer");
  expect(pincer).toMatchObject({
    found: true,
    missingTelegraph: false,
    actionKind: "pincer",
    primaryLane: { visible: true },
    secondaryLane: { visible: true },
  });
  for (const lane of [pincer.primaryLane, pincer.secondaryLane]) {
    expect(lane.renderedLength).toBeCloseTo(lane.actualTargetDistance, 1);
    expect(Math.abs(lane.renderedLength - lane.midpointEncodedDistance)).toBeLessThan(0.002);
    expect(lane.hitRadius).toBeCloseTo(
      pincer.diagnostics.actionTargets[[pincer.primaryLane, pincer.secondaryLane].indexOf(lane)].radius,
      4
    );
    expect(lane.renderedWidth).toBeCloseTo(lane.hitRadius * 2, 4);
    expect(lane.caps).toHaveLength(2);
    for (const cap of lane.caps) {
      expect(cap.radiusX).toBeCloseTo(lane.hitRadius, 4);
      expect(cap.radiusZ).toBeCloseTo(lane.hitRadius, 4);
    }
    for (const endpoint of [lane.source, lane.target]) {
      expect(Math.min(...lane.caps.map((cap) => Math.hypot(
        cap.x - endpoint.x,
        cap.z - endpoint.z,
      ))), JSON.stringify(lane)).toBeLessThan(0.01);
    }
  }

  const ribBloom = await prepareNaturalAttack(page, "whole", "ribBloom");
  expect(ribBloom).toMatchObject({
    found: true,
    missingTelegraph: false,
    actionKind: "ribBloom",
    ribBloom: {
      visible: true,
      name: "Hordeheart_RibBloomDangerArcs",
    },
  });
  expect(ribBloom.ribBloom.arcs).toHaveLength(4);
  expect(new Set(ribBloom.ribBloom.arcs.map((arc) => arc.uuid)).size).toBe(4);
  for (const arc of ribBloom.ribBloom.arcs) {
    expect(arc.geometryType).toBe("RingGeometry");
    expect(arc.innerRadius).toBeCloseTo(2 * 3, 4);
    expect(arc.outerRadius).toBeCloseTo((6.2 + 0.72) * 3, 4);
    expect(arc.scale).toBe(1);
    expect(arc.thetaLength).toBeGreaterThan(0);
    expect(arc.thetaLength).toBeLessThan(Math.PI / 2);
  }
  expect(ribBloom.ribBloom.dangerRadius).toBeCloseTo((6.2 + 0.72) * 3, 4);
  expect(ribBloom.ribBloom.entityRadius).toBeCloseTo(0.72, 4);
  const orderedArcStarts = ribBloom.ribBloom.arcs
    .map((arc) => arc.thetaStart)
    .sort((left, right) => left - right);
  for (let index = 1; index < orderedArcStarts.length; index += 1) {
    expect(orderedArcStarts[index] - orderedArcStarts[index - 1]).toBeCloseTo(Math.PI / 2, 4);
  }

  const systole = await prepareNaturalAttack(page, "whole", "systole");
  expect(systole).toMatchObject({
    found: true,
    missingTelegraph: false,
    actionKind: "systole",
    systole: {
      visible: true,
      name: "Hordeheart_SystoleDangerMembrane",
      geometryType: "CircleGeometry",
      ribBloomArcsVisible: false,
    },
  });
  expect(systole.systole.nearestVertexToCenter).toBeLessThan(0.0001);
  expect(systole.systole.entityRadius).toBeCloseTo(0.72, 4);
  expect(systole.systole.dangerRadius).toBeCloseTo((5.1 + 0.72) * 3, 4);
  expect(systole.systole.radius).toBeCloseTo(systole.systole.dangerRadius, 4);
  expect(systole.systole.scale).toBe(1);
  expect(pageErrors).toEqual([]);
});

test("whole-form attacks erupt through physical flesh crests and launch organs from the body", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await startHunt(page);
  await installHordeheartTelegraphCapture(page);

  const presentation = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    const capture = (action, progress) => {
      game.startWaveNow(10, "hordeheart");
      game.forceHordeheartPhase("whole");
      game.setHordeheartAiEnabled(false);
      const opening = game.getHordeheartDiagnostics();
      const body = opening.bodies[0];
      game.setPlayerPosition(body.x + 1.5, body.z + (body.z > 0 ? -14 : 14));
      game.forceHordeheartAttack(action);
      game.seekHordeheartAction(progress);

      const diagnostics = game.getHordeheartDiagnostics();
      const parts = window.__hordeheartAnimationPolish?.telegraph?.userData?.parts;
      const lanes = Array.from(parts?.lanePool || [])
        .filter((entry) => entry.rig?.visible)
        .map((entry) => ({
          ridgeCount: entry.ridges?.children?.length || 0,
          maxRidgeRise: Math.max(0, ...Array.from(entry.ridges?.children || []).map(
            (ridge) => Number(ridge.scale?.y) || 0
          )),
          maxRidgeY: Math.max(0, ...Array.from(entry.ridges?.children || []).map(
            (ridge) => Number(ridge.position?.y) || 0
          )),
        }));
      const projectile = Array.from(parts?.projectileMarkers || []).find((entry) => entry.visible);
      const vent = Array.from(parts?.projectileLaunchVents || []).find((entry) => entry.visible);
      const target = diagnostics.actionTargets[0] || null;
      return {
        action,
        progress: diagnostics.actionProgress,
        body: { x: body.x, z: body.z },
        target,
        lanes,
        projectile: projectile ? {
          visible: true,
          x: projectile.position.x,
          y: projectile.position.y,
          z: projectile.position.z,
          scale: projectile.scale.x,
          birthProgress: Number(projectile.userData?.birthProgress) || 0,
          flightProgress: Number(projectile.userData?.flightProgress) || 0,
          visualSourceX: Number(projectile.userData?.visualSourceX),
          visualSourceZ: Number(projectile.userData?.visualSourceZ),
          trailBlobs: projectile.userData?.trail?.children?.length || 0,
        } : { visible: false },
        launchVent: vent ? {
          visible: true,
          x: vent.position.x,
          y: vent.position.y,
          z: vent.position.z,
          tendrils: vent.userData?.tendrils?.children?.length || 0,
        } : { visible: false },
      };
    };

    return {
      fleshTide: capture("fleshTide", 0.55),
      ribBloom: capture("ribBloom", 0.54),
      systoleBirth: capture("systole", 0.18),
      systoleFlight: capture("systole", 0.52),
    };
  });

  expect(presentation.fleshTide.lanes).toHaveLength(1);
  expect(presentation.fleshTide.lanes[0].ridgeCount).toBe(9);
  expect(presentation.fleshTide.lanes[0].maxRidgeRise).toBeGreaterThan(0.7);
  expect(presentation.fleshTide.lanes[0].maxRidgeY).toBeGreaterThan(0.35);

  expect(presentation.ribBloom.lanes).toHaveLength(8);
  expect(presentation.ribBloom.lanes.every((lane) => lane.ridgeCount === 9)).toBe(true);
  expect(Math.max(...presentation.ribBloom.lanes.map((lane) => lane.maxRidgeRise))).toBeGreaterThan(0.55);

  const born = presentation.systoleBirth;
  expect(born.projectile).toMatchObject({ visible: true, flightProgress: 0, trailBlobs: 3 });
  expect(born.launchVent).toMatchObject({ visible: true, tendrils: 4 });
  expect(Math.hypot(
    born.target.sourceX - born.body.x,
    born.target.sourceZ - born.body.z,
  )).toBeLessThan(0.02);
  expect(Math.hypot(
    born.projectile.visualSourceX - born.target.sourceX,
    born.projectile.visualSourceZ - born.target.sourceZ,
  )).toBeGreaterThan(4.5);
  expect(Math.hypot(
    born.projectile.visualSourceX - born.target.sourceX,
    born.projectile.visualSourceZ - born.target.sourceZ,
  )).toBeLessThan(6.6);
  expect(Math.hypot(
    born.projectile.x - born.projectile.visualSourceX,
    born.projectile.z - born.projectile.visualSourceZ,
  )).toBeLessThan(0.02);
  expect(Math.hypot(
    born.launchVent.x - born.projectile.visualSourceX,
    born.launchVent.z - born.projectile.visualSourceZ,
  )).toBeLessThan(0.02);
  expect(born.projectile.y).toBeGreaterThan(2);
  expect(born.projectile.birthProgress).toBeGreaterThan(0.1);

  const flying = presentation.systoleFlight;
  const totalFlight = Math.hypot(
    flying.target.targetX - flying.target.sourceX,
    flying.target.targetZ - flying.target.sourceZ,
  );
  const travelled = Math.hypot(
    flying.projectile.x - flying.target.sourceX,
    flying.projectile.z - flying.target.sourceZ,
  );
  expect(flying.projectile).toMatchObject({ visible: true, trailBlobs: 3 });
  expect(flying.projectile.flightProgress).toBeGreaterThan(0.5);
  expect(travelled).toBeGreaterThan(totalFlight * 0.45);
  expect(travelled).toBeLessThan(totalFlight * 0.8);
  expect(flying.projectile.y).toBeGreaterThan(3.2);
  expect(pageErrors).toEqual([]);
});

test("all seven model attacks have distinct windup, impact, and recovery poses", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto(fileUrl("index.html"));
  await page.waitForFunction(() => Boolean(window.THREE && window.createHordeheartModel));

  const poses = await page.evaluate((actions) => {
    const configuration = {
      fleshTide: { sizeClass: "whole", splitIndex: 0 },
      ribBloom: { sizeClass: "whole", splitIndex: 0 },
      systole: { sizeClass: "whole", splitIndex: 0 },
      pincer: { sizeClass: "half", splitIndex: 1 },
      arterialSweep: { sizeClass: "half", splitIndex: 1 },
      rush: { sizeClass: "quarter", splitIndex: 3 },
      carrionNest: { sizeClass: "quarter", splitIndex: 3 },
    };
    const progressFrames = { windup: 0.42, impact: 0.68, recovery: 0.92 };

    const appendTransform = (values, object) => {
      if (!object) return;
      values.push(
        object.position.x, object.position.y, object.position.z,
        object.rotation.x, object.rotation.y, object.rotation.z,
        object.scale.x, object.scale.y, object.scale.z
      );
    };
    const signature = (model) => {
      const parts = model.userData.hordeheartParts;
      const values = [];
      appendTransform(values, parts.bodyRoot);
      for (const quarter of parts.quarterGroups) appendTransform(values, quarter);
      for (const heart of parts.hearts) appendTransform(values, heart);
      for (const rib of parts.ribPivots) appendTransform(values, rib);
      for (const rig of parts.armRigs) {
        appendTransform(values, rig.shoulder);
        appendTransform(values, rig.elbow);
        appendTransform(values, rig.wrist);
      }
      appendTransform(values, parts.centralChestRig);
      appendTransform(values, parts.skull);
      appendTransform(values, parts.jawPivot);
      return values.map((value) => Number(value.toFixed(6)));
    };

    const result = {};
    for (const action of actions) {
      result[action] = {};
      for (const [frame, actionProgress] of Object.entries(progressFrames)) {
        const model = window.createHordeheartModel({
          ...configuration[action],
          reviewPass: "interaction-pass",
        });
        model.userData.animate(2.375, {
          action,
          actionProgress,
          moveAmount: 0,
          enraged: configuration[action].sizeClass !== "whole",
          damageFlash: 0,
        });
        result[action][frame] = signature(model);
        model.userData.dispose();
      }
    }
    return result;
  }, ACTIONS);

  const maximumPoseDelta = (left, right) => Math.max(
    ...left.map((value, index) => Math.abs(value - right[index]))
  );
  for (const action of ACTIONS) {
    const { windup, impact, recovery } = poses[action];
    expect(windup.length).toBeGreaterThan(30);
    expect(impact).toHaveLength(windup.length);
    expect(recovery).toHaveLength(windup.length);
    expect(maximumPoseDelta(windup, impact), `${action}: windup -> impact`).toBeGreaterThan(0.05);
    expect(maximumPoseDelta(impact, recovery), `${action}: impact -> recovery`).toBeGreaterThan(0.05);
    expect(maximumPoseDelta(windup, recovery), `${action}: windup -> recovery`).toBeGreaterThan(0.025);
  }
  expect(pageErrors).toEqual([]);
});

test("halves and quarters plant their surviving claws before hauling the body", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto(fileUrl("index.html"));
  await page.waitForFunction(() => Boolean(window.THREE && window.createHordeheartModel));

  const poses = await page.evaluate(() => {
    const capture = (model) => {
      const parts = model.userData.hordeheartParts;
      return {
        body: {
          y: parts.bodyRoot.position.y,
          z: parts.bodyRoot.position.z,
          rotationX: parts.bodyRoot.rotation.x,
          scaleY: parts.bodyRoot.scale.y,
        },
        arms: parts.armRigs.map((rig) => ({
          shoulderY: rig.shoulder.rotation.y,
          shoulderZ: rig.shoulder.position.z,
          elbowX: rig.elbow.rotation.x,
          wristX: rig.wrist.rotation.x,
          fingerX: rig.fingers[1].rotation.x,
        })),
      };
    };
    const inspect = (sizeClass, splitIndex) => {
      const model = window.createHordeheartModel({
        sizeClass,
        splitIndex,
        reviewPass: "interaction-pass",
      });
      const sample = (gaitPhase) => {
        model.userData.animate(2.25, {
          action: "idle",
          actionProgress: 0,
          moveAmount: 1,
          gaitPhase,
          enraged: sizeClass !== "whole",
          damageFlash: 0,
        });
        return capture(model);
      };
      const result = {
        reach: sample(Math.PI * 1.5),
        haul: sample(Math.PI * 0.5),
        settle: sample(Math.PI),
      };
      model.userData.dispose();
      return result;
    };
    return {
      whole: inspect("whole", 0),
      half: inspect("half", 1),
      quarter: inspect("quarter", 3),
    };
  });

  const checkFragment = (fragment, expectedArmCount) => {
    expect(fragment.reach.arms).toHaveLength(expectedArmCount);
    expect(fragment.haul.body.z - fragment.reach.body.z).toBeGreaterThan(0.5);
    expect(fragment.haul.body.y - fragment.reach.body.y).toBeGreaterThan(0.1);
    expect(fragment.settle.body.scaleY).toBeLessThan(0.96);
    for (let index = 0; index < expectedArmCount; index += 1) {
      const reach = fragment.reach.arms[index];
      const haul = fragment.haul.arms[index];
      expect(Math.abs(haul.shoulderY - reach.shoulderY), `arm ${index}: shoulder sweep`).toBeGreaterThan(0.45);
      expect(Math.abs(haul.elbowX - reach.elbowX), `arm ${index}: elbow fold`).toBeGreaterThan(0.16);
      expect(Math.abs(haul.fingerX - reach.fingerX), `arm ${index}: claw grip`).toBeGreaterThan(0.15);
    }
  };
  checkFragment(poses.half, 4);
  checkFragment(poses.quarter, 2);
  expect(Math.abs(poses.whole.haul.body.z - poses.whole.reach.body.z)).toBeLessThan(0.05);
  expect(pageErrors).toEqual([]);
});

test("half and quarter gameplay movement follows the pull burst instead of sliding", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  const samplePhase = async (preview, expectedSizeClass) => {
    await page.goto(`${fileUrl("index.html")}?mapSeed=7331&preview=${preview}`);
    await page.waitForFunction((sizeClass) => (
      window.__dustAndDeadTest?.getHordeheartDiagnostics?.().bodies?.[0]?.sizeClass === sizeClass
    ), expectedSizeClass);
    return page.evaluate(() => {
      const game = window.__dustAndDeadTest;
      const opening = game.getHordeheartDiagnostics();
      const first = opening.bodies[0];
      game.setPlayerPosition(first.x, first.z + 24);
      const samples = [];
      let previous = game.getHordeheartDiagnostics().bodies[0];
      for (let frame = 0; frame < 140; frame += 1) {
        const current = game.advanceHordeheart(17).bodies[0];
        samples.push({
          distance: Math.hypot(current.x - previous.x, current.z - previous.z),
          pullDrive: current.pullDrive,
          speedMultiplier: current.pullSpeedMultiplier,
          gaitPhase: current.gaitPhase,
          moveAmount: current.moveAmount,
        });
        previous = current;
      }
      const mean = (values) => values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
      const braceSteps = samples.filter((sample) => sample.pullDrive < 0.01 && sample.moveAmount > 0.95);
      const haulSteps = samples.filter((sample) => sample.pullDrive > 0.6 && sample.moveAmount > 0.95);
      const wireBody = game.getHordeheartWireState().bodies[0];
      const packedBody = game.getHordeheartPackedWireDiagnostics().decoded.bodies[0];
      const packedPhaseError = Math.abs(Math.atan2(
        Math.sin(packedBody.gaitPhase - wireBody.gaitPhase),
        Math.cos(packedBody.gaitPhase - wireBody.gaitPhase)
      ));
      return {
        sizeClass: first.sizeClass,
        totalDistance: samples.reduce((sum, sample) => sum + sample.distance, 0),
        minStep: Math.min(...samples.slice(20).map((sample) => sample.distance)),
        maxStep: Math.max(...samples.slice(20).map((sample) => sample.distance)),
        braceCount: braceSteps.length,
        haulCount: haulSteps.length,
        braceMean: mean(braceSteps.map((sample) => sample.distance)),
        haulMean: mean(haulSteps.map((sample) => sample.distance)),
        minMultiplier: Math.min(...samples.map((sample) => sample.speedMultiplier)),
        maxMultiplier: Math.max(...samples.map((sample) => sample.speedMultiplier)),
        gaitTravel: samples[samples.length - 1].gaitPhase - samples[0].gaitPhase,
        wireMoving: wireBody.moving,
        packedMoving: packedBody.moving,
        packedPhaseError,
      };
    });
  };

  for (const result of [
    await samplePhase("hordeheart-halves", "half"),
    await samplePhase("hordeheart-quarters", "quarter"),
  ]) {
    expect(result.totalDistance, `${result.sizeClass}: total travel`).toBeGreaterThan(3);
    expect(result.braceCount, `${result.sizeClass}: planted frames`).toBeGreaterThan(20);
    expect(result.haulCount, `${result.sizeClass}: haul frames`).toBeGreaterThan(8);
    expect(result.haulMean, `${result.sizeClass}: burst/brace speed`).toBeGreaterThan(result.braceMean * 12);
    expect(result.maxStep, `${result.sizeClass}: burst step`).toBeGreaterThan(result.minStep * 12);
    expect(result.minMultiplier).toBeLessThan(0.08);
    expect(result.maxMultiplier).toBeGreaterThan(3.5);
    expect(result.gaitTravel).toBeGreaterThan(Math.PI * 1.5);
    expect(result.wireMoving).toBe(true);
    expect(result.packedMoving).toBe(true);
    expect(result.packedPhaseError).toBeLessThan(0.02);
  }
  expect(pageErrors).toEqual([]);
});

test("a half keeps its pull gait while routing around a building instead of pushing into it", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await startHunt(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    game.startWaveNow(10, "hordeheart");
    game.forceHordeheartPhase("halves");
    const scenario = game.configureHordeheartHalfNavigationTest();
    if (!scenario) return { scenario: null };

    const samples = [];
    let previous = game.getHordeheartDiagnostics().bodies
      .find((body) => body.index === scenario.bodyIndex);
    for (let step = 0; step < 140; step += 1) {
      const diagnostics = game.advanceHordeheart(100);
      const body = diagnostics.bodies.find((candidate) => candidate.index === scenario.bodyIndex);
      samples.push({
        x: body.x,
        z: body.z,
        step: Math.hypot(body.x - previous.x, body.z - previous.z),
        pullDrive: body.pullDrive,
        navigating: body.navigation.navigating,
        blockerType: body.navigation.blockerType,
      });
      previous = body;
    }
    const final = game.getHordeheartDiagnostics().bodies
      .find((body) => body.index === scenario.bodyIndex);
    return { scenario, samples, final };
  });

  expect(result.scenario).toBeTruthy();
  expect(result.scenario.obstacle.type).toMatch(/^building:/);
  expect(result.samples.some((sample) => sample.navigating)).toBe(true);

  const start = result.scenario.body;
  const formation = result.scenario.formation;
  const obstacle = result.scenario.obstacle;
  const initialDistance = Math.hypot(formation.x - start.x, formation.z - start.z);
  const finalDistance = Math.hypot(formation.x - result.final.x, formation.z - result.final.z);
  const maximumDetour = Math.max(...result.samples.map((sample) => Math.abs(sample.z - start.z)));
  const directionalProgress = (result.final.x - start.x) * result.scenario.direction;
  expect(maximumDetour).toBeGreaterThan(obstacle.halfD + start.radius * 0.7);
  expect(directionalProgress).toBeGreaterThan(obstacle.halfW * 2 + start.radius);
  expect(finalDistance).toBeLessThan(initialDistance * 0.35);
  expect(Math.max(...result.samples.map((sample) => sample.step))).toBeLessThan(4);
  expect(result.samples.some((sample) => sample.pullDrive > 0.6)).toBe(true);
  expect(pageErrors).toEqual([]);
});

test("split phases apply the requested speed and attack-rate escalation", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await startHunt(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    game.setPlayerMaxHp(10000, 10000);

    const inspectPhase = (phase, attack) => {
      game.startWaveNow(10, "hordeheart");
      game.forceHordeheartPhase(phase);
      const opening = game.getHordeheartDiagnostics();
      const body = opening.bodies[0];
      game.setPlayerPosition(body.x, body.z + 18);
      game.forceHordeheartAttack(attack);
      game.setHordeheartAiEnabled(true);
      let completed = game.getHordeheartDiagnostics();
      for (let frame = 0; frame < 180 && completed.attack; frame += 1) {
        completed = game.advanceHordeheart(17);
      }
      return { opening, completed };
    };

    return {
      halves: inspectPhase("halves", "arterialSweep"),
      quarters: inspectPhase("quarters", "carrionNest"),
    };
  });

  const halves = result.halves;
  const quarters = result.quarters;
  expect(halves.opening.movementTuning.speedMultiplier).toEqual({ half: 2, quarter: 3 });
  expect(halves.opening.movementTuning.attackRateMultiplier).toEqual({ half: 2, quarter: 3 });
  expect(halves.opening.bodies.every((body) => body.speed === 6.6)).toBe(true);
  expect(quarters.opening.bodies.every((body) => body.speed === 11.55)).toBe(true);
  expect(halves.opening.attackCooldown).toBeCloseTo(0.675, 3);
  expect(quarters.opening.attackCooldown).toBeCloseTo(0.3, 3);
  expect(halves.completed.attack).toBe("");
  expect(quarters.completed.attack).toBe("");
  expect(halves.completed.attackCooldown).toBeCloseTo(0.525, 3);
  expect(quarters.completed.attackCooldown).toBeCloseTo(0.85 / 3, 3);
  expect(quarters.completed.attackCooldown).toBeLessThan(halves.completed.attackCooldown);
  expect(halves.opening.bodies.every((body) => body.replicaMaxDisplaySpeed > body.speed * 4)).toBe(true);
  expect(quarters.opening.bodies.every((body) => body.replicaMaxDisplaySpeed > body.speed * 4)).toBe(true);
  expect(pageErrors).toEqual([]);
});

test("two half fragments hold opposite flanks and cannot collapse into one body", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await startHunt(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    game.startWaveNow(10, "hordeheart");
    game.forceHordeheartPhase("halves");
    game.setHordeheartAiEnabled(false);
    const opening = game.getHordeheartDiagnostics();
    const center = opening.bodies.reduce((point, body) => ({
      x: point.x + body.x / opening.bodies.length,
      z: point.z + body.z / opening.bodies.length,
    }), { x: 0, z: 0 });
    const player = { x: center.x + 2.5, z: center.z + 12 };
    game.setPlayerPosition(player.x, player.z);
    game.advanceHordeheart(7000);
    const closing = game.getHordeheartDiagnostics();
    const left = closing.bodies[0];
    const right = closing.bodies[1];
    return {
      bodies: closing.bodies,
      bodyDistance: Math.hypot(left.x - right.x, left.z - right.z),
      targetDistance: Math.hypot(left.targetX - right.targetX, left.targetZ - right.targetZ),
      oppositeSides: (left.x - player.x) * (right.x - player.x) < 0,
      playerDistances: closing.bodies.map((body) => Math.hypot(body.x - player.x, body.z - player.z)),
      requiredDistance: left.radius + right.radius + closing.movementTuning.separationPadding.halves,
    };
  });

  expect(result.bodies).toHaveLength(2);
  expect(result.targetDistance).toBeGreaterThan(12);
  expect(result.bodyDistance).toBeGreaterThanOrEqual(result.requiredDistance - 0.03);
  expect(result.oppositeSides).toBe(true);
  expect(Math.max(...result.playerDistances)).toBeLessThan(21.5);
  expect(pageErrors).toEqual([]);
});

test("four quarter fragments hold separate flank slots instead of collapsing into one clump", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await startHunt(page);

  const result = await page.evaluate(() => {
    const game = window.__dustAndDeadTest;
    game.startWaveNow(10, "hordeheart");
    game.forceHordeheartPhase("quarters");
    game.setHordeheartAiEnabled(false);
    const opening = game.getHordeheartDiagnostics();
    const center = opening.bodies.reduce((point, body) => ({
      x: point.x + body.x / opening.bodies.length,
      z: point.z + body.z / opening.bodies.length,
    }), { x: 0, z: 0 });
    const player = { x: center.x + 3, z: center.z + 12 };
    game.setPlayerPosition(player.x, player.z);
    game.advanceHordeheart(7000);
    const closing = game.getHordeheartDiagnostics();

    const pairDistances = [];
    const targetPairDistances = [];
    for (let left = 0; left < closing.bodies.length; left += 1) {
      for (let right = left + 1; right < closing.bodies.length; right += 1) {
        pairDistances.push(Math.hypot(
          closing.bodies[left].x - closing.bodies[right].x,
          closing.bodies[left].z - closing.bodies[right].z,
        ));
        targetPairDistances.push(Math.hypot(
          closing.bodies[left].targetX - closing.bodies[right].targetX,
          closing.bodies[left].targetZ - closing.bodies[right].targetZ,
        ));
      }
    }
    const angles = closing.bodies.map((body) => Math.atan2(
      body.x - player.x,
      body.z - player.z,
    )).sort((left, right) => left - right);
    const angularGaps = angles.map((angle, index) => {
      const next = index === angles.length - 1 ? angles[0] + Math.PI * 2 : angles[index + 1];
      return next - angle;
    });
    return {
      bodies: closing.bodies,
      minPairDistance: Math.min(...pairDistances),
      minTargetPairDistance: Math.min(...targetPairDistances),
      minAngularGap: Math.min(...angularGaps),
      playerDistances: closing.bodies.map((body) => Math.hypot(body.x - player.x, body.z - player.z)),
    };
  });

  expect(result.bodies).toHaveLength(4);
  expect(result.minTargetPairDistance).toBeGreaterThan(7.2);
  expect(result.minPairDistance).toBeGreaterThan(3.65);
  expect(result.minAngularGap).toBeGreaterThan(0.75);
  expect(Math.max(...result.playerDistances)).toBeLessThan(20);
  expect(pageErrors).toEqual([]);
});

test("a guest keeps fragment locomotion continuous through uneven and dropped snapshots", async ({ page, context }) => {
  test.setTimeout(120_000);
  const guest = await context.newPage();
  const pageErrors = [];
  const guestErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  guest.on("pageerror", (error) => guestErrors.push(error.message));

  try {
    await startHunt(page);
    await startHunt(guest);

    const host = await page.evaluate(() => {
      const game = window.__dustAndDeadTest;
      const multiplayer = window.__dustMultiplayerTest;
      const frameCounts = [4, 4, 8, 3, 6, 4, 8, 4, 5, 7, 3, 8, 4, 6, 4, 8, 3, 5, 7, 4, 8, 4, 6, 3];
      multiplayer.startMockHost(["Host", "Guest"]);
      game.startWaveNow(10, "hordeheart");
      game.forceHordeheartPhase("halves");
      game.setHordeheartAiEnabled(false);
      const opening = game.getHordeheartDiagnostics();
      const focus = opening.bodies[0];
      multiplayer.setPlayerPosition("mock-player-1", focus.x + 30, focus.z + 34);
      multiplayer.setPlayerPosition("mock-player-2", focus.x + 32, focus.z + 35);
      // Let the tear-out emergence finish before sampling the pull gait.
      game.advanceHordeheart(1100);

      const snapshots = [multiplayer.buildWireSnapshot(true, true, "mock-player-2")];
      for (const frames of frameCounts) {
        game.advanceHordeheart(frames * (1000 / 60));
        snapshots.push(multiplayer.buildWireSnapshot(true, true, "mock-player-2"));
      }
      return {
        frameCounts,
        snapshots,
        final: game.getHordeheartDiagnostics(),
      };
    });

    const result = await guest.evaluate(({ frameCounts, snapshots }) => {
      const game = window.__dustAndDeadTest;
      const multiplayer = window.__dustMultiplayerTest;
      const capturedRoots = [];
      const objectPrototype = window.THREE.Object3D.prototype;
      const originalAdd = objectPrototype.add;
      objectPrototype.add = function captureReplicaFragments(...objects) {
        for (const object of objects) {
          if (object?.name === "Hordeheart_half") capturedRoots.push(object);
        }
        return originalAdd.apply(this, objects);
      };

      multiplayer.startMockGuest(["Host", "Guest"], 1);
      multiplayer.applySnapshot(snapshots[0]);
      objectPrototype.add = originalAdd;
      const roots = capturedRoots.filter((root) => root.parent).slice(-2);
      const dropped = new Set([4, 9, 14, 19]);
      const frames = [];
      const packetBoundaries = [];

      const poseSignature = () => roots.flatMap((root) => {
        const parts = root.userData?.hordeheartParts;
        const values = [];
        const append = (object) => {
          if (!object) return;
          values.push(
            object.position.x, object.position.y, object.position.z,
            object.rotation.x, object.rotation.y, object.rotation.z
          );
        };
        append(parts?.bodyRoot);
        for (const rig of parts?.armRigs || []) {
          append(rig.shoulder);
          append(rig.elbow);
          append(rig.wrist);
        }
        return values;
      });
      const capture = () => {
        const diagnostics = game.getHordeheartDiagnostics();
        return {
          bodies: diagnostics.bodies.map((body) => ({
            x: body.x,
            z: body.z,
            gaitPhase: body.gaitPhase,
            moveAmount: body.moveAmount,
            displayStep: body.networkDisplayStep,
          })),
          pose: poseSignature(),
          network: diagnostics.networkInterpolation,
        };
      };
      const maxDelta = (left, right) => Math.max(
        0,
        ...left.map((value, index) => Math.abs(value - right[index]))
      );

      for (let packetIndex = 1; packetIndex < snapshots.length; packetIndex += 1) {
        for (let frame = 0; frame < frameCounts[packetIndex - 1]; frame += 1) {
          game.advanceHordeheart(1000 / 60);
          frames.push(capture());
        }
        if (dropped.has(packetIndex)) continue;
        const before = capture();
        multiplayer.applySnapshot(snapshots[packetIndex]);
        const after = capture();
        packetBoundaries.push({
          position: Math.max(...before.bodies.map((body, index) => Math.hypot(
            after.bodies[index].x - body.x,
            after.bodies[index].z - body.z
          ))),
          gait: Math.max(...before.bodies.map((body, index) => Math.abs(
            Math.atan2(
              Math.sin(after.bodies[index].gaitPhase - body.gaitPhase),
              Math.cos(after.bodies[index].gaitPhase - body.gaitPhase)
            )
          ))),
          pose: maxDelta(before.pose, after.pose),
        });
      }

      const opening = frames[0];
      const closing = frames[frames.length - 1];
      const movementSteps = [];
      const gaitSteps = [];
      for (let index = 1; index < frames.length; index += 1) {
        for (let bodyIndex = 0; bodyIndex < frames[index].bodies.length; bodyIndex += 1) {
          const previous = frames[index - 1].bodies[bodyIndex];
          const current = frames[index].bodies[bodyIndex];
          movementSteps.push(Math.hypot(current.x - previous.x, current.z - previous.z));
          gaitSteps.push(Math.atan2(
            Math.sin(current.gaitPhase - previous.gaitPhase),
            Math.cos(current.gaitPhase - previous.gaitPhase)
          ));
        }
      }
      return {
        rootCount: roots.length,
        frameCount: frames.length,
        packetCount: packetBoundaries.length,
        maxPacketPositionJump: Math.max(...packetBoundaries.map((entry) => entry.position)),
        maxPacketGaitJump: Math.max(...packetBoundaries.map((entry) => entry.gait)),
        maxPacketPoseJump: Math.max(...packetBoundaries.map((entry) => entry.pose)),
        maxFrameMovement: Math.max(...movementSteps),
        minMovingGaitStep: Math.min(...gaitSteps.filter((step) => Number.isFinite(step))),
        totalTravel: Math.hypot(
          closing.bodies[0].x - opening.bodies[0].x,
          closing.bodies[0].z - opening.bodies[0].z
        ),
        final: game.getHordeheartDiagnostics(),
      };
    }, host);

    expect(result.rootCount).toBe(2);
    expect(result.frameCount).toBeGreaterThan(100);
    expect(result.packetCount).toBe(host.snapshots.length - 1 - 4);
    // Applying a packet only updates the buffered target. The currently drawn
    // transform must remain continuous at that exact render boundary.
    expect(result.maxPacketPositionJump).toBeLessThan(0.002);
    expect(result.maxPacketGaitJump).toBeLessThan(0.002);
    expect(result.maxPacketPoseJump).toBeLessThan(0.002);
    // Haul bursts remain punchy, but even a two-packet gap cannot teleport a
    // fragment across the arena or run its claw cycle backwards.
    expect(result.maxFrameMovement).toBeLessThan(0.5);
    expect(result.minMovingGaitStep).toBeGreaterThanOrEqual(-0.0002);
    expect(result.totalTravel).toBeGreaterThan(2);
    expect(result.final.networkInterpolation).toMatchObject({
      snapshotHz: 15,
      bufferedBodyMotion: true,
      boundedExtrapolation: true,
      gaitPhaseSmoothed: true,
      telegraphFollowsRenderedBody: true,
    });
    expect(result.final.networkInterpolation.snapshotCount).toBe(result.packetCount + 1);
    for (let index = 0; index < result.final.bodies.length; index += 1) {
      expect(Math.hypot(
        result.final.bodies[index].targetX - host.final.bodies[index].x,
        result.final.bodies[index].targetZ - host.final.bodies[index].z
      )).toBeLessThan(0.02);
    }
    expect(pageErrors).toEqual([]);
    expect(guestErrors).toEqual([]);
  } finally {
    await guest.close();
  }
});

test("accelerated quarters stay buffered on a guest through dropped snapshots", async ({ page, context }) => {
  test.setTimeout(120_000);
  const guest = await context.newPage();
  const pageErrors = [];
  const guestErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  guest.on("pageerror", (error) => guestErrors.push(error.message));

  try {
    await startHunt(page);
    await startHunt(guest);

    const host = await page.evaluate(() => {
      const game = window.__dustAndDeadTest;
      const multiplayer = window.__dustMultiplayerTest;
      const frameCounts = [4, 7, 3, 8, 5, 4, 7, 3, 6, 8, 4, 5, 7, 3, 8, 4, 6, 5];
      multiplayer.startMockHost(["Host", "Guest"]);
      game.startWaveNow(10, "hordeheart");
      game.forceHordeheartPhase("quarters");
      game.setHordeheartAiEnabled(false);
      const opening = game.getHordeheartDiagnostics();
      const focus = opening.bodies[0];
      multiplayer.setPlayerPosition("mock-player-1", focus.x + 30, focus.z + 34);
      multiplayer.setPlayerPosition("mock-player-2", focus.x + 32, focus.z + 35);
      game.advanceHordeheart(1100);

      const snapshots = [multiplayer.buildWireSnapshot(true, true, "mock-player-2")];
      for (const frames of frameCounts) {
        game.advanceHordeheart(frames * (1000 / 60));
        snapshots.push(multiplayer.buildWireSnapshot(true, true, "mock-player-2"));
      }
      return { frameCounts, snapshots, final: game.getHordeheartDiagnostics() };
    });

    const result = await guest.evaluate(({ frameCounts, snapshots }) => {
      const game = window.__dustAndDeadTest;
      const multiplayer = window.__dustMultiplayerTest;
      const dropped = new Set([4, 9, 14]);
      multiplayer.startMockGuest(["Host", "Guest"], 1);
      multiplayer.applySnapshot(snapshots[0]);

      const positions = () => game.getHordeheartDiagnostics().bodies.map((body) => ({
        x: body.x,
        z: body.z,
        gaitPhase: body.gaitPhase,
      }));
      const opening = positions();
      let previous = opening;
      let maxPacketJump = 0;
      let maxPacketGaitJump = 0;
      let maxFrameMovement = 0;
      let minGaitStep = Infinity;

      for (let packetIndex = 1; packetIndex < snapshots.length; packetIndex += 1) {
        for (let frame = 0; frame < frameCounts[packetIndex - 1]; frame += 1) {
          game.advanceHordeheart(1000 / 60);
          const current = positions();
          for (let bodyIndex = 0; bodyIndex < current.length; bodyIndex += 1) {
            maxFrameMovement = Math.max(maxFrameMovement, Math.hypot(
              current[bodyIndex].x - previous[bodyIndex].x,
              current[bodyIndex].z - previous[bodyIndex].z
            ));
            minGaitStep = Math.min(minGaitStep, Math.atan2(
              Math.sin(current[bodyIndex].gaitPhase - previous[bodyIndex].gaitPhase),
              Math.cos(current[bodyIndex].gaitPhase - previous[bodyIndex].gaitPhase)
            ));
          }
          previous = current;
        }
        if (dropped.has(packetIndex)) continue;
        const beforePacket = positions();
        multiplayer.applySnapshot(snapshots[packetIndex]);
        const afterPacket = positions();
        for (let bodyIndex = 0; bodyIndex < afterPacket.length; bodyIndex += 1) {
          maxPacketJump = Math.max(maxPacketJump, Math.hypot(
            afterPacket[bodyIndex].x - beforePacket[bodyIndex].x,
            afterPacket[bodyIndex].z - beforePacket[bodyIndex].z
          ));
          maxPacketGaitJump = Math.max(maxPacketGaitJump, Math.abs(Math.atan2(
            Math.sin(afterPacket[bodyIndex].gaitPhase - beforePacket[bodyIndex].gaitPhase),
            Math.cos(afterPacket[bodyIndex].gaitPhase - beforePacket[bodyIndex].gaitPhase)
          )));
        }
      }

      const closing = positions();
      return {
        bodyCount: closing.length,
        maxPacketJump,
        maxPacketGaitJump,
        maxFrameMovement,
        minGaitStep,
        totalTravel: Math.hypot(closing[0].x - opening[0].x, closing[0].z - opening[0].z),
        final: game.getHordeheartDiagnostics(),
      };
    }, host);

    expect(result.bodyCount).toBe(4);
    expect(result.maxPacketJump).toBeLessThan(0.002);
    expect(result.maxPacketGaitJump).toBeLessThan(0.002);
    expect(result.maxFrameMovement).toBeLessThan(1);
    expect(result.minGaitStep).toBeGreaterThanOrEqual(-0.0002);
    expect(result.totalTravel).toBeGreaterThan(3);
    expect(result.final.bodies.every((body) => body.replicaMaxDisplaySpeed === 56)).toBe(true);
    for (let index = 0; index < result.final.bodies.length; index += 1) {
      expect(Math.hypot(
        result.final.bodies[index].targetX - host.final.bodies[index].x,
        result.final.bodies[index].targetZ - host.final.bodies[index].z
      )).toBeLessThan(0.02);
    }
    expect(pageErrors).toEqual([]);
    expect(guestErrors).toEqual([]);
  } finally {
    await guest.close();
  }
});

test("a downed half deflates in place without toppling or clipping below the floor", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await startHunt(page);

  const result = await page.evaluate(() => {
    const captured = [];
    const objectPrototype = window.THREE.Object3D.prototype;
    const originalAdd = objectPrototype.add;
    objectPrototype.add = function captureHordeheartHalf(...objects) {
      for (const object of objects) {
        if (object?.name === "Hordeheart_half") captured.push(object);
      }
      return originalAdd.apply(this, objects);
    };

    const game = window.__dustAndDeadTest;
    game.startWaveNow(10, "hordeheart");
    game.forceHordeheartPhase("halves");
    const roots = captured.filter((root) => root.parent).slice(-2);
    const root = roots[0];
    const body = game.getHordeheartDiagnostics().bodies[0];

    const visibleMinY = (model) => {
      model.updateWorldMatrix(true, true);
      const bounds = new window.THREE.Box3();
      const local = new window.THREE.Box3();
      let found = false;
      model.traverse((object) => {
        if (!object.isMesh || !object.geometry) return;
        let cursor = object;
        while (cursor) {
          if (!cursor.visible) return;
          if (cursor === model) break;
          cursor = cursor.parent;
        }
        if (!object.geometry.boundingBox) object.geometry.computeBoundingBox();
        if (!object.geometry.boundingBox) return;
        local.copy(object.geometry.boundingBox).applyMatrix4(object.matrixWorld);
        if (!found) bounds.copy(local);
        else bounds.union(local);
        found = true;
      });
      return found ? bounds.min.y : Infinity;
    };
    const sample = (elapsed) => ({
      elapsed,
      y: root.position.y,
      rotationX: root.rotation.x,
      rotationZ: root.rotation.z,
      minY: visibleMinY(root),
    });

    const samples = [sample(0)];
    game.damageHordeheart(body.maxHp + 1, body.index);
    for (const milliseconds of [220, 680, 900, 1200]) {
      game.advanceHordeheart(milliseconds);
      samples.push(sample(samples[samples.length - 1].elapsed + milliseconds));
    }
    objectPrototype.add = originalAdd;
    return { samples, downed: game.getHordeheartDiagnostics().bodies[0].downed };
  });

  expect(result.downed).toBe(true);
  const standingMinY = result.samples[0].minY;
  for (const sample of result.samples.slice(1)) {
    expect(sample.y).toBeGreaterThanOrEqual(-0.0001);
    expect(Math.abs(sample.rotationX)).toBeLessThan(0.04);
    expect(Math.abs(sample.rotationZ)).toBeLessThan(0.06);
    expect(sample.minY).toBeGreaterThanOrEqual(standingMinY - 0.015);
  }
  expect(pageErrors).toEqual([]);
});

test("split preview keeps zero intact and moves real fragment nodes by progress 0.99", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto(fileUrl("index.html"));
  await page.waitForFunction(() => Boolean(window.THREE && window.createHordeheartModel));

  const result = await page.evaluate(() => {
    const inspect = (sizeClass, splitIndex, axis) => {
      const model = window.createHordeheartModel({
        sizeClass,
        splitIndex,
        reviewPass: "interaction-pass",
      });
      const parts = model.userData.hordeheartParts;
      const nodes = sizeClass === "whole" ? parts.halfGroups : parts.quarterGroups;
      const readNodes = () => nodes.map((node) => ({
        x: node.position.x,
        y: node.position.y,
        z: node.position.z,
        rx: node.rotation.x,
        ry: node.rotation.y,
        rz: node.rotation.z,
      }));

      model.userData.setSplitPreview(0, axis);
      const zero = {
        amount: parts.splitPreviewAmount,
        nodes: readNodes(),
        anchors: model.userData.getSplitAnchors(),
      };
      model.userData.setSplitPreview(0.99, axis);
      const almostComplete = {
        amount: parts.splitPreviewAmount,
        nodes: readNodes(),
        anchors: model.userData.getSplitAnchors(),
      };
      model.userData.dispose();
      return { zero, almostComplete };
    };
    return {
      whole: inspect("whole", 0, "x"),
      half: inspect("half", 1, "z"),
    };
  });

  const nodeDelta = (before, after) => Math.hypot(
    after.x - before.x,
    after.y - before.y,
    after.z - before.z,
    after.rx - before.rx,
    after.ry - before.ry,
    after.rz - before.rz
  );
  const anchorDelta = (before, after) => Math.hypot(
    after.position.x - before.position.x,
    after.position.y - before.position.y,
    after.position.z - before.position.z
  );

  for (const split of [result.whole, result.half]) {
    expect(split.zero.amount).toBe(0);
    expect(split.almostComplete.amount).toBeCloseTo(0.99, 6);
    expect(split.zero.nodes).toHaveLength(split.almostComplete.nodes.length);
    expect(split.zero.anchors).toHaveLength(split.almostComplete.anchors.length);
    expect(Math.max(...split.zero.nodes.map((node, index) => (
      nodeDelta(node, split.almostComplete.nodes[index])
    )))).toBeGreaterThan(0.5);
    expect(Math.max(...split.zero.anchors.map((anchor, index) => (
      anchorDelta(anchor, split.almostComplete.anchors[index])
    )))).toBeGreaterThan(0.5);
  }
  expect(pageErrors).toEqual([]);
});

test("a guest reconstructs a packed Hordeheart pincer with one visual impact and no local damage", async ({ page, context }) => {
  test.setTimeout(120_000);
  const guest = await context.newPage();
  const pageErrors = [];
  const guestErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  guest.on("pageerror", (error) => guestErrors.push(error.message));

  try {
    await startHunt(page);
    await startHunt(guest);
    await installHordeheartTelegraphCapture(guest);

    const host = await page.evaluate(() => {
      const game = window.__dustAndDeadTest;
      const multiplayer = window.__dustMultiplayerTest;
      multiplayer.startMockHost(["Host", "Guest"]);
      game.startWaveNow(10, "hordeheart");
      game.forceHordeheartPhase("halves");
      const opening = game.getHordeheartDiagnostics();
      const focus = opening.bodies[0];
      multiplayer.setPlayerPosition("mock-player-1", focus.x, focus.z + 12);
      multiplayer.setPlayerPosition("mock-player-2", focus.x + 1.5, focus.z + 12);

      let diagnostics = game.forceHordeheartAttack("pincer");
      game.setHordeheartAiEnabled(true);
      diagnostics = game.advanceHordeheart(250);
      const wire = game.getHordeheartWireState();
      return {
        diagnostics,
        wire,
        snapshot: multiplayer.buildWireSnapshot(true, true, "mock-player-2"),
      };
    });

    expect(host.diagnostics.attack).toBe("pincer");
    expect(host.wire.bodies.filter((body) => body.action === "pincer")).toHaveLength(2);

    const reconstructed = await guest.evaluate((snapshot) => {
      const game = window.__dustAndDeadTest;
      const multiplayer = window.__dustMultiplayerTest;
      multiplayer.startMockGuest(["Host", "Guest"], 1);
      multiplayer.applySnapshot(snapshot);
      const diagnostics = game.getHordeheartDiagnostics();
      const wire = game.getHordeheartWireState();
      const parts = window.__hordeheartAnimationPolish?.telegraph?.userData?.parts;
      const effects = game.getThreeObjectDiagnostics().state;
      const world = JSON.parse(window.render_game_to_text());
      return {
        diagnostics,
        wire,
        hp: world.player.hp,
        effects,
        telegraph: {
          actionKind: parts?.actionKind || "",
          primaryVisible: Boolean(parts?.primaryLaneRig?.visible),
          secondaryVisible: Boolean(parts?.secondaryLaneRig?.visible),
        },
      };
    }, host.snapshot);

    expect(reconstructed.diagnostics).toMatchObject({ replica: true, attack: "pincer" });
    expect(reconstructed.wire.bodies.filter((body) => body.action === "pincer")).toHaveLength(2);
    expect(reconstructed.telegraph).toEqual({
      actionKind: "pincer",
      primaryVisible: true,
      secondaryVisible: true,
    });

    const extrapolated = await guest.evaluate(() => {
      const game = window.__dustAndDeadTest;
      game.advanceHordeheart(120);
      const wire = game.getHordeheartWireState();
      const diagnostics = game.getHordeheartDiagnostics();
      const body = diagnostics.bodies[0];
      const rig = window.__hordeheartAnimationPolish.telegraph.userData.parts.primaryLaneRig;
      return {
        timer: Math.max(...wire.bodies.filter((entry) => entry.action === "pincer").map((entry) => entry.actionTimer)),
        actionProgress: diagnostics.actionProgress,
        body: { x: body.x, z: body.z, gaitPhase: body.gaitPhase },
        target: {
          x: body.x + (rig.position.x - body.x) * 2,
          z: body.z + (rig.position.z - body.z) * 2,
        },
      };
    });

    const delayedHostSnapshot = await page.evaluate(() => {
      const game = window.__dustAndDeadTest;
      const multiplayer = window.__dustMultiplayerTest;
      const body = game.getHordeheartDiagnostics().bodies[0];
      multiplayer.setPlayerPosition("mock-player-1", body.x + 38, body.z - 30);
      multiplayer.setPlayerPosition("mock-player-2", body.x + 40, body.z - 32);
      game.advanceHordeheart(17);
      return multiplayer.buildWireSnapshot(true, true, "mock-player-2");
    });

    const afterDelayedPacket = await guest.evaluate((snapshot) => {
      const game = window.__dustAndDeadTest;
      const beforeWire = game.getHordeheartWireState();
      const beforeDiagnostics = game.getHordeheartDiagnostics();
      const beforeBody = beforeDiagnostics.bodies[0];
      window.__dustMultiplayerTest.applySnapshot(snapshot);
      const wire = game.getHordeheartWireState();
      const diagnostics = game.getHordeheartDiagnostics();
      const body = diagnostics.bodies[0];
      const rig = window.__hordeheartAnimationPolish.telegraph.userData.parts.primaryLaneRig;
      return {
        before: {
          timer: Math.max(...beforeWire.bodies.filter((entry) => entry.action === "pincer").map((entry) => entry.actionTimer)),
          actionProgress: beforeDiagnostics.actionProgress,
          body: { x: beforeBody.x, z: beforeBody.z, gaitPhase: beforeBody.gaitPhase },
        },
        timer: Math.max(...wire.bodies.filter((entry) => entry.action === "pincer").map((entry) => entry.actionTimer)),
        actionProgress: diagnostics.actionProgress,
        body: { x: body.x, z: body.z, gaitPhase: body.gaitPhase },
        target: {
          x: body.x + (rig.position.x - body.x) * 2,
          z: body.z + (rig.position.z - body.z) * 2,
        },
      };
    }, delayedHostSnapshot);

    expect(afterDelayedPacket.timer).toBeGreaterThanOrEqual(extrapolated.timer - 0.002);
    expect(Math.abs(afterDelayedPacket.timer - afterDelayedPacket.before.timer)).toBeLessThan(0.002);
    expect(Math.abs(afterDelayedPacket.actionProgress - afterDelayedPacket.before.actionProgress)).toBeLessThan(0.002);
    expect(Math.hypot(
      afterDelayedPacket.body.x - afterDelayedPacket.before.body.x,
      afterDelayedPacket.body.z - afterDelayedPacket.before.body.z,
    )).toBeLessThan(0.002);
    expect(Math.abs(Math.atan2(
      Math.sin(afterDelayedPacket.body.gaitPhase - afterDelayedPacket.before.body.gaitPhase),
      Math.cos(afterDelayedPacket.body.gaitPhase - afterDelayedPacket.before.body.gaitPhase),
    ))).toBeLessThan(0.002);
    expect(Math.hypot(
      afterDelayedPacket.target.x - extrapolated.target.x,
      afterDelayedPacket.target.z - extrapolated.target.z,
    )).toBeLessThan(0.01);

    const impact = await guest.evaluate(({ initialHp, initialEffects }) => {
      const game = window.__dustAndDeadTest;
      for (let guard = 0; guard < 100 && game.getHordeheartDiagnostics().actionProgress < 0.6; guard += 1) {
        game.advanceHordeheart(17);
      }
      const before = {
        effects: game.getThreeObjectDiagnostics().state,
        hp: JSON.parse(window.render_game_to_text()).player.hp,
      };
      for (let guard = 0; guard < 40 && game.getHordeheartDiagnostics().actionProgress < 0.7; guard += 1) {
        game.advanceHordeheart(17);
      }
      const after = {
        diagnostics: game.getHordeheartDiagnostics(),
        effects: game.getThreeObjectDiagnostics().state,
        hp: JSON.parse(window.render_game_to_text()).player.hp,
      };
      game.advanceHordeheart(100);
      const noReplay = {
        effects: game.getThreeObjectDiagnostics().state,
        hp: JSON.parse(window.render_game_to_text()).player.hp,
      };
      game.advanceHordeheart(600);
      const finishedParts = window.__hordeheartAnimationPolish?.telegraph?.userData?.parts;
      return {
        initialHp,
        initialEffects,
        before,
        after,
        noReplay,
        finished: {
          diagnostics: game.getHordeheartDiagnostics(),
          actions: game.getHordeheartWireState().bodies.map((body) => body.action),
          primaryVisible: Boolean(finishedParts?.primaryLaneRig?.visible),
          secondaryVisible: Boolean(finishedParts?.secondaryLaneRig?.visible),
        },
      };
    }, { initialHp: reconstructed.hp, initialEffects: reconstructed.effects });

    expect(impact.after.effects.particles - impact.before.effects.particles).toBeGreaterThanOrEqual(18);
    expect(impact.after.effects.shockwaves - impact.before.effects.shockwaves).toBe(4);
    expect(impact.after.effects.lightFlashes - impact.before.effects.lightFlashes).toBe(4);
    expect(impact.noReplay.effects).toMatchObject({
      particles: impact.after.effects.particles,
      shockwaves: impact.after.effects.shockwaves,
      lightFlashes: impact.after.effects.lightFlashes,
    });
    expect([
      impact.initialHp,
      impact.before.hp,
      impact.after.hp,
      impact.noReplay.hp,
    ].every((hp) => hp === impact.initialHp)).toBe(true);
    expect(impact.finished.diagnostics.attack).toBe("");
    expect(impact.finished.actions).toEqual(["idle", "idle"]);
    expect(impact.finished.primaryVisible).toBe(false);
    expect(impact.finished.secondaryVisible).toBe(false);
    expect(pageErrors).toEqual([]);
    expect(guestErrors).toEqual([]);
  } finally {
    await guest.close();
  }
});
