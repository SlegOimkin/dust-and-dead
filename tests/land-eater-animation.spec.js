const path = require("node:path");
const { expect, test } = require("@playwright/test");

function fileUrl(relativePath) {
  const absolute = path.resolve(__dirname, "..", relativePath).replace(/\\/g, "/");
  return `file:///${absolute}`;
}

async function openReview(page) {
  await page.goto(
    `${fileUrl("artifacts/land-eater/sculpt/preview.html")}`
      + "?pass=optimization-pass&view=reference&pose=idle&time=3.125"
  );
  await page.waitForFunction(() => Boolean(
    window.__LAND_EATER_PREVIEW_READY__
      && window.__LAND_EATER_REVIEW__?.model?.userData?.animate
  ));
}

test("Land Eater action boundaries preserve the exact rendered pose", async ({ page }) => {
  await openReview(page);

  const result = await page.evaluate(() => {
    const model = createLandEaterModel({ reviewPass: "optimization-pass" });
    const parts = model.userData.landEaterParts;
    const time = 3.125;
    const phase = 2;
    const flattenTransform = (node) => [
      node.position.x,
      node.position.y,
      node.position.z,
      node.rotation.x,
      node.rotation.y,
      node.rotation.z,
      node.scale.x,
      node.scale.y,
      node.scale.z,
    ];
    const snapshot = () => [
      ...flattenTransform(model),
      ...flattenTransform(parts.headPivot),
      ...flattenTransform(parts.jawPivot),
      ...parts.segments.flatMap((segment) => flattenTransform(segment.pivot)),
    ];
    const poseAt = (sampleTime, state) => {
      model.userData.animate(sampleTime, { phase, ...state });
      return snapshot();
    };
    const pose = (state) => poseAt(time, state);
    const maximumDelta = (left, right) => left.reduce(
      (maximum, value, index) => Math.max(maximum, Math.abs(value - right[index])),
      0
    );

    const pairs = [
      {
        id: "idle->hunt",
        left: pose({ mode: "idle", progress: 0 }),
        right: pose({
          mode: "hunt",
          progress: 0,
          locomotionCycle: 4.25,
          locomotionWeight: 0,
        }),
      },
      {
        id: "hunt->emerge",
        left: pose({
          mode: "hunt",
          progress: 1,
          locomotionCycle: 8.5,
          locomotionWeight: 0,
        }),
        right: pose({ mode: "emerge", progress: 0 }),
      },
      {
        id: "emerge->devour",
        left: pose({ mode: "emerge", progress: 1 }),
        right: pose({ mode: "devour", progress: 0 }),
      },
      {
        id: "emerge->burrow",
        left: pose({ mode: "emerge", progress: 1 }),
        right: pose({ mode: "burrow", progress: 0 }),
      },
      {
        id: "devour->recovery",
        left: pose({ mode: "devour", progress: 1 }),
        right: pose({ mode: "recovery", progress: 0 }),
      },
      {
        id: "burrow->recovery",
        left: pose({ mode: "burrow", progress: 1 }),
        right: pose({ mode: "recovery", progress: 0 }),
      },
      {
        id: "zigzag->recovery",
        left: pose({
          mode: "zigzag",
          progress: 1,
          telegraphProgress: 1,
          motionProgress: 1,
        }),
        right: pose({ mode: "recovery", progress: 0 }),
      },
      {
        id: "recovery->idle",
        left: pose({ mode: "recovery", progress: 1 }),
        right: pose({ mode: "idle", progress: 0 }),
      },
    ].map((pair) => ({
      id: pair.id,
      maximumDelta: maximumDelta(pair.left, pair.right),
    }));

    const beforeDeath = pose({ mode: "devour", progress: 0.47 });
    const deathStart = pose({ mode: "death", progress: 0 });
    const deathEntryDelta = maximumDelta(beforeDeath, deathStart);
    const synchronizedZigzagDelta = maximumDelta(
      poseAt(1.25, {
        mode: "zigzag",
        progress: 0.46,
        telegraphProgress: 1,
        motionProgress: 0.46,
      }),
      poseAt(91.75, {
        mode: "zigzag",
        progress: 0.46,
        telegraphProgress: 1,
        motionProgress: 0.46,
      })
    );
    const distanceSynchronizedZigzagDelta = maximumDelta(
      poseAt(1.25, {
        mode: "zigzag",
        progress: 0.46,
        telegraphProgress: 1,
        motionProgress: 0.46,
        locomotionCycle: 7.25,
        locomotionWeight: 0.82,
      }),
      poseAt(91.75, {
        mode: "zigzag",
        progress: 0.46,
        telegraphProgress: 1,
        motionProgress: 0.46,
        locomotionCycle: 7.25,
        locomotionWeight: 0.82,
      })
    );
    const distanceSynchronizedHuntDelta = maximumDelta(
      poseAt(1.25, {
        mode: "hunt",
        progress: 0.52,
        locomotionCycle: 5.75,
        locomotionWeight: 0.94,
      }),
      poseAt(91.75, {
        mode: "hunt",
        progress: 0.52,
        locomotionCycle: 5.75,
        locomotionWeight: 0.94,
      })
    );
    return {
      pairs,
      deathEntryDelta,
      synchronizedZigzagDelta,
      distanceSynchronizedZigzagDelta,
      distanceSynchronizedHuntDelta,
      allFinite: pairs.every((pair) => Number.isFinite(pair.maximumDelta))
        && Number.isFinite(deathEntryDelta)
        && Number.isFinite(synchronizedZigzagDelta)
        && Number.isFinite(distanceSynchronizedZigzagDelta)
        && Number.isFinite(distanceSynchronizedHuntDelta),
    };
  });

  expect(result.allFinite).toBe(true);
  for (const pair of result.pairs) {
    expect(pair.maximumDelta, `${pair.id} introduced a pose discontinuity`).toBeLessThan(1e-6);
  }
  expect(result.deathEntryDelta, "death must begin from the live attack pose").toBeLessThan(1e-6);
  expect(
    result.synchronizedZigzagDelta,
    "zigzag pose must depend on synchronized action progress, not a client's local clock"
  ).toBeLessThan(1e-6);
  expect(
    result.distanceSynchronizedZigzagDelta,
    "distance-synchronized locomotion must not depend on a client's local clock"
  ).toBeLessThan(1e-6);
  expect(
    result.distanceSynchronizedHuntDelta,
    "serpentine hunt pose must use route distance instead of a client's local clock"
  ).toBeLessThan(1e-6);
});

test("Land Eater emergence and devour travel through independent body sections", async ({ page }) => {
  await openReview(page);

  const result = await page.evaluate(() => {
    const model = createLandEaterModel({ reviewPass: "optimization-pass" });
    const parts = model.userData.landEaterParts;
    const sample = (mode, progress) => {
      model.userData.animate(4.75, { mode, phase: 2, progress });
      return parts.segments.map((segment) => ({
        y: segment.pivot.position.y,
        z: segment.pivot.position.z,
        yaw: segment.pivot.rotation.y,
        roll: segment.pivot.rotation.z,
      }));
    };
    const devourStart = sample("devour", 0);
    const emergeEarly = sample("emerge", 0.46);
    const emergeLate = sample("emerge", 0.72);
    const devourEarly = sample("devour", 0.38);
    const devourLate = sample("devour", 0.68);
    const transformDelta = (left, right) => Math.max(
      Math.abs(left.y - right.y),
      Math.abs(left.z - right.z),
      Math.abs(left.yaw - right.yaw),
      Math.abs(left.roll - right.roll)
    );
    const earlyStrikeDelta = devourEarly.map(
      (pose, index) => transformDelta(pose, devourStart[index])
    );
    const lateStrikeDelta = devourLate.map(
      (pose, index) => transformDelta(pose, devourStart[index])
    );
    const uniquePoseCount = (poses) => new Set(
      poses.map((pose) => [
        pose.y.toFixed(3),
        pose.z.toFixed(3),
        pose.yaw.toFixed(3),
        pose.roll.toFixed(3),
      ].join(":"))
    ).size;
    return {
      emergeEarly,
      emergeLate,
      devourEarly,
      devourLate,
      earlyStrikeDelta,
      lateStrikeDelta,
      emergeEarlyFrontTailLift:
        emergeEarly[0].y - emergeEarly[9].y,
      emergeLateTailTravel:
        emergeLate[9].y - emergeEarly[9].y,
      frontLeadsEarlyStrike:
        earlyStrikeDelta[0] - earlyStrikeDelta[9],
      tailWaveArrival:
        lateStrikeDelta[9] - earlyStrikeDelta[9],
      devourFrameDelta: Math.max(
        ...devourLate.map(
          (pose, index) => transformDelta(pose, devourEarly[index])
        )
      ),
      uniqueEmergeSections: uniquePoseCount(emergeEarly),
      uniqueDevourSections: uniquePoseCount(devourEarly),
      readiness: model.userData.actionReadiness,
      tailCollider: model.userData.sculptRuntime.colliders.tail,
      finite: [
        ...emergeEarly,
        ...emergeLate,
        ...devourEarly,
        ...devourLate,
      ].every((pose) => Object.values(pose).every(Number.isFinite)),
    };
  });

  expect(result.finite).toBe(true);
  expect(result.uniqueEmergeSections).toBeGreaterThanOrEqual(8);
  expect(result.uniqueDevourSections).toBeGreaterThanOrEqual(8);
  expect(result.emergeEarlyFrontTailLift).toBeGreaterThan(2);
  expect(result.emergeLateTailTravel).toBeGreaterThan(0.5);
  expect(result.frontLeadsEarlyStrike).toBeGreaterThan(0.15);
  expect(result.tailWaveArrival).toBeGreaterThan(0.4);
  expect(result.devourFrameDelta).toBeGreaterThan(0.7);
  expect(result.readiness).toMatchObject({
    sectionDelayedEmergence: true,
    sequentialDevourBodyWave: true,
    headToTailTurnPropagation: true,
    solidTailCollider: true,
  });
  expect(result.tailCollider).toMatchObject({
    type: "tapered-capsule",
    radius: 1.05,
    tipRadius: 0.28,
  });
});

test("Land Eater states stay expressive, finite, and allocation-free", async ({ page }) => {
  await openReview(page);

  const result = await page.evaluate(() => {
    const model = createLandEaterModel({ reviewPass: "optimization-pass" });
    const parts = model.userData.landEaterParts;
    const geometryIds = () => {
      const ids = [];
      model.traverse((node) => {
        if (node.isMesh && node.geometry) ids.push(node.geometry.uuid);
      });
      return [...new Set(ids)].sort();
    };
    const materialIds = () => {
      const ids = [];
      model.traverse((node) => {
        if (!node.isMesh) return;
        const materials = Array.isArray(node.material) ? node.material : [node.material];
        materials.forEach((material) => {
          if (material) ids.push(material.uuid);
        });
      });
      return [...new Set(ids)].sort();
    };
    const snapshot = () => ({
      headX: parts.headPivot.position.x,
      headY: parts.headPivot.position.y,
      headRotationZ: parts.headPivot.rotation.z,
      headScaleX: parts.headPivot.scale.x,
      headScaleY: parts.headPivot.scale.y,
      jawRotationZ: parts.jawPivot.rotation.z,
      bodyX: parts.segments.map((segment) => segment.pivot.position.x),
      bodyZ: parts.segments.map((segment) => segment.pivot.position.z),
      bodyY: parts.segments.map((segment) => segment.pivot.position.y),
      values: [
        model.position.x,
        model.position.y,
        model.position.z,
        parts.headPivot.position.x,
        parts.headPivot.position.y,
        parts.headPivot.position.z,
        parts.headPivot.rotation.x,
        parts.headPivot.rotation.y,
        parts.headPivot.rotation.z,
        parts.headPivot.scale.x,
        parts.headPivot.scale.y,
        parts.headPivot.scale.z,
        parts.jawPivot.rotation.z,
        ...parts.segments.flatMap((segment) => [
          segment.pivot.position.x,
          segment.pivot.position.y,
          segment.pivot.position.z,
          segment.pivot.rotation.x,
          segment.pivot.rotation.y,
          segment.pivot.rotation.z,
        ]),
      ],
    });
    const pose = (mode, progress, extras = {}) => {
      model.userData.animate(2.75, {
        mode,
        progress,
        phase: 2,
        telegraphProgress: 1,
        motionProgress: progress,
        ...extras,
      });
      return snapshot();
    };

    const states = {
      idle: pose("idle", 0),
      huntA: pose("hunt", 0.52, {
        locomotionCycle: 3.1,
        locomotionWeight: 1,
      }),
      huntB: pose("hunt", 0.52, {
        locomotionCycle: 3.35,
        locomotionWeight: 1,
      }),
      emerge: pose("emerge", 0.74),
      devour: pose("devour", 0.5),
      devourImpact: pose("devour", 1),
      burrow: pose("burrow", 0.5),
      burrowBite: pose("burrow", 0.68),
      burrowImpact: pose("burrow", 1),
      zigzag: pose("zigzag", 0.46),
      stationaryTurn: pose("zigzag", 0.46, {
        locomotionCycle: 2.25,
        locomotionWeight: 0,
        turnAmount: 1,
      }),
      strideA: pose("zigzag", 0.46, {
        locomotionCycle: 2.0,
        locomotionWeight: 1,
        turnAmount: 0,
      }),
      strideB: pose("zigzag", 0.46, {
        locomotionCycle: 2.25,
        locomotionWeight: 1,
        turnAmount: 0,
      }),
      recovery: pose("recovery", 0.43),
      hurt: pose("hurt", 0.16),
      death: pose("death", 0.68),
    };
    const beforeGeometry = geometryIds();
    const beforeMaterials = materialIds();
    const sequence = [
      "idle", "hunt", "emerge", "devour", "burrow",
      "zigzag", "recovery", "hurt", "death",
    ];
    for (let frame = 0; frame < 1080; frame += 1) {
      const mode = sequence[Math.floor(frame / 120)];
      const progress = (frame % 120) / 119;
      model.userData.animate(frame / 60, {
        mode,
        progress,
        phase: 1 + Math.floor(frame / 320),
        telegraphProgress: Math.min(1, progress * 2.5),
        motionProgress: progress,
        hurtAmount: frame % 73 < 10 ? 1 - (frame % 73) / 10 : 0,
      });
    }
    const afterGeometry = geometryIds();
    const afterMaterials = materialIds();
    const bodyLateralDisplacement = Math.max(
      ...states.zigzag.bodyZ.map(
        (value, index) => Math.abs(value - states.idle.bodyZ[index])
      )
    );
    const huntLateralDisplacement = Math.max(
      ...states.huntA.bodyZ.map(
        (value, index) => Math.abs(value - states.idle.bodyZ[index])
      )
    );
    const huntStrideDelta = Math.max(
      ...states.huntA.bodyZ.map(
        (value, index) => Math.abs(value - states.huntB.bodyZ[index])
      )
    );
    const devourBodyArch = Math.max(
      ...states.devourImpact.bodyY.map(
        (value, index) => value - states.idle.bodyY[index]
      )
    );
    const stationaryTurnBend = Math.max(
      ...states.stationaryTurn.bodyZ.map(
        (value, index) => Math.abs(value - states.idle.bodyZ[index])
      )
    );
    const stationaryTurnCompression = Math.max(
      ...states.stationaryTurn.bodyX.map(
        (value, index) => value - states.idle.bodyX[index]
      )
    );
    const strideDelta = Math.max(
      ...states.strideA.bodyX.map(
        (value, index) => Math.abs(value - states.strideB.bodyX[index])
      ),
      ...states.strideA.bodyY.map(
        (value, index) => Math.abs(value - states.strideB.bodyY[index])
      ),
      ...states.strideA.bodyZ.map(
        (value, index) => Math.abs(value - states.strideB.bodyZ[index])
      )
    );
    const burrowImpactDelta = Math.max(
      ...states.burrowImpact.values.map(
        (value, index) => Math.abs(value - states.devourImpact.values[index])
      )
    );
    return {
      states,
      bodyLateralDisplacement,
      huntLateralDisplacement,
      huntStrideDelta,
      devourBodyArch,
      stationaryTurnBend,
      stationaryTurnCompression,
      strideDelta,
      burrowImpactDelta,
      sameGeometryIds: JSON.stringify(beforeGeometry) === JSON.stringify(afterGeometry),
      sameMaterialIds: JSON.stringify(beforeMaterials) === JSON.stringify(afterMaterials),
      optimization: model.userData.optimization,
      readiness: model.userData.actionReadiness,
      allFinite: Object.values(states).every(
        (state) => state.values.every(Number.isFinite)
      ),
    };
  });

  expect(result.allFinite).toBe(true);
  expect(result.states.emerge.headY - result.states.idle.headY).toBeGreaterThan(4);
  expect(result.states.devour.jawRotationZ).toBeLessThan(result.states.idle.jawRotationZ - 0.65);
  expect(result.states.devour.headScaleY).toBeGreaterThan(result.states.idle.headScaleY + 0.04);
  expect(result.states.devourImpact.headY).toBeLessThan(result.states.idle.headY - 4.5);
  expect(result.states.devourImpact.headRotationZ).toBeLessThan(-1.1);
  expect(result.states.devourImpact.jawRotationZ).toBeLessThan(-0.95);
  expect(result.states.burrow.headX).toBeGreaterThan(
    result.states.devour.headX + 0.25
  );
  expect(result.states.burrow.jawRotationZ).toBeLessThan(
    result.states.devour.jawRotationZ - 0.1
  );
  expect(result.states.burrowBite.jawRotationZ).toBeGreaterThan(
    result.states.burrow.jawRotationZ + 0.55
  );
  expect(result.burrowImpactDelta).toBeLessThan(1e-6);
  expect(result.devourBodyArch).toBeGreaterThan(3);
  expect(result.bodyLateralDisplacement).toBeGreaterThan(0.55);
  expect(result.huntLateralDisplacement).toBeGreaterThan(0.8);
  expect(result.huntStrideDelta).toBeGreaterThan(0.45);
  expect(result.stationaryTurnBend).toBeGreaterThan(1.5);
  expect(result.stationaryTurnCompression).toBeGreaterThan(0.5);
  expect(result.states.stationaryTurn.headScaleX).toBeLessThan(
    result.states.idle.headScaleX - 0.07
  );
  expect(result.states.stationaryTurn.headScaleY).toBeGreaterThan(
    result.states.idle.headScaleY + 0.05
  );
  expect(result.strideDelta).toBeGreaterThan(0.5);
  expect(Math.abs(result.states.hurt.headRotationZ - result.states.idle.headRotationZ)).toBeGreaterThan(0.05);
  expect(result.states.death.headY).toBeLessThan(result.states.idle.headY - 2);
  expect(result.sameGeometryIds).toBe(true);
  expect(result.sameMaterialIds).toBe(true);
  expect(result.optimization).toMatchObject({
    triangles: 1128,
    drawCalls: 20,
    uniqueGeometries: 6,
    visibleMaterialColors: 6,
    geometryAllocationsPerFrame: 0,
    materialAllocationsPerFrame: 0,
  });
  expect(result.readiness).toMatchObject({
    stableSectionPivots: 10,
    allocatesDuringAnimation: false,
    additiveHitReaction: true,
    synchronizedAttackPhase: true,
    distanceSynchronizedLocomotion: true,
    stationaryCornerTurns: true,
    stationaryWallRicochets: true,
    mouthFirstDevour: true,
    subterraneanAmbush: true,
    synchronizedSerpentineHunt: true,
    impactTimedBiteClosure: true,
    mouthForwardAxis: "+X",
  });
});

test("Land Eater consumes an articulated spine pose without rotating as one rigid piece", async ({ page }) => {
  await openReview(page);

  const result = await page.evaluate(() => {
    const model = createLandEaterModel({ reviewPass: "optimization-pass" });
    const parts = model.userData.landEaterParts;
    const geometryIds = [];
    const materialIds = [];
    model.traverse((node) => {
      if (node.isMesh && node.geometry) geometryIds.push(node.geometry.uuid);
      if (!node.isMesh || !node.material) return;
      const materials = Array.isArray(node.material)
        ? node.material
        : [node.material];
      materials.forEach((material) => {
        if (material) materialIds.push(material.uuid);
      });
    });
    const spinePose = {
      active: true,
      head: { x: 8.7, z: -0.6, angle: -0.2 },
      segments: parts.segments.map((segment, index) => ({
        x: 4.4 - index * 3.42,
        z: Math.sin(index * 0.62) * 3.15 - index * 0.22,
        angle: -0.12 - Math.sin(index * 0.62) * 0.38,
      })),
    };
    const animate = () => model.userData.animate(7.25, {
      mode: "hunt",
      phase: 2,
      progress: 0.54,
      locomotionCycle: 5.4,
      locomotionWeight: 0.9,
      spinePose,
    });
    const snapshot = () => ({
      rootYaw: model.rotation.y,
      head: {
        x: parts.headPivot.position.x,
        z: parts.headPivot.position.z,
        yaw: parts.headPivot.rotation.y,
      },
      segments: parts.segments.map((segment) => ({
        x: segment.pivot.position.x,
        z: segment.pivot.position.z,
        yaw: segment.pivot.rotation.y,
      })),
      seamMatrices: parts.seamMeshes[0]
        ? Array.from(parts.seamMeshes[0].instanceMatrix.array)
        : [],
      lowerShellMatrices: parts.lowerShell
        ? Array.from(parts.lowerShell.instanceMatrix.array)
        : [],
    });

    animate();
    const before = snapshot();
    const originalHead = { ...before.head };
    const originalFront = { ...before.segments[0] };
    spinePose.segments[8].z += 2.4;
    spinePose.segments[8].angle += 0.48;
    spinePose.segments[9].z += 4.1;
    spinePose.segments[9].angle += 0.72;
    animate();
    const after = snapshot();
    const delta = (left, right) => Math.max(
      Math.abs(left.x - right.x),
      Math.abs(left.z - right.z),
      Math.abs(left.yaw - right.yaw)
    );
    const uniqueYawCount = new Set(
      after.segments.map((segment) => segment.yaw.toFixed(3))
    ).size;
    const seamMatrixDelta = Math.max(
      ...after.seamMatrices.map(
        (value, index) => Math.abs(value - before.seamMatrices[index])
      )
    );
    const lowerShellMatrixDelta = Math.max(
      ...after.lowerShellMatrices.map(
        (value, index) => Math.abs(value - before.lowerShellMatrices[index])
      )
    );
    const afterGeometryIds = [];
    const afterMaterialIds = [];
    model.traverse((node) => {
      if (node.isMesh && node.geometry) afterGeometryIds.push(node.geometry.uuid);
      if (!node.isMesh || !node.material) return;
      const materials = Array.isArray(node.material)
        ? node.material
        : [node.material];
      materials.forEach((material) => {
        if (material) afterMaterialIds.push(material.uuid);
      });
    });
    return {
      before,
      after,
      headDelta: delta(originalHead, after.head),
      frontDelta: delta(originalFront, after.segments[0]),
      tailDelta: delta(before.segments[9], after.segments[9]),
      uniqueYawCount,
      seamMatrixDelta,
      lowerShellMatrixDelta,
      geometryStable:
        JSON.stringify(geometryIds) === JSON.stringify(afterGeometryIds),
      materialsStable:
        JSON.stringify(materialIds) === JSON.stringify(afterMaterialIds),
      readiness: model.userData.actionReadiness,
      allFinite: [
        after.rootYaw,
        after.head.x,
        after.head.z,
        after.head.yaw,
        ...after.segments.flatMap((segment) => [
          segment.x,
          segment.z,
          segment.yaw,
        ]),
      ].every(Number.isFinite),
    };
  });

  expect(result.allFinite).toBe(true);
  expect(result.before.rootYaw).toBeCloseTo(0, 8);
  expect(result.after.rootYaw).toBeCloseTo(0, 8);
  expect(result.uniqueYawCount).toBeGreaterThanOrEqual(6);
  expect(result.headDelta).toBeLessThan(1e-7);
  expect(result.frontDelta).toBeLessThan(1e-7);
  expect(result.tailDelta).toBeGreaterThan(3);
  expect(result.seamMatrixDelta).toBeGreaterThan(0.1);
  expect(result.lowerShellMatrixDelta).toBeGreaterThan(0.1);
  expect(result.geometryStable).toBe(true);
  expect(result.materialsStable).toBe(true);
  expect(result.readiness).toMatchObject({
    articulatedWorldSpine: true,
    independentSegmentTransforms: 10,
    rigidRootYawDuringLocomotion: false,
    allocatesDuringAnimation: false,
  });
});
