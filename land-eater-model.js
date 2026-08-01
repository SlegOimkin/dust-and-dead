(function attachLandEaterModelFactory(global) {
  "use strict";

  const THREE = global.THREE;
  if (!THREE) {
    throw new Error("land-eater-model.js requires THREE to be loaded first");
  }

  const PASS_ORDER = [
    "blockout",
    "structural-pass",
    "form-refinement",
    "material-pass",
    "surface-pass",
    "lighting-pass",
    "interaction-pass",
    "optimization-pass",
  ];

  const SEGMENT_LAYOUT = [
    { id: "body-segment-1", x: 4.25, y: 2.35, z: 0.78, yaw: -0.12, length: 4.6, height: 4.9, width: 6.0 },
    { id: "body-segment-2", x: 0.05, y: 2.24, z: 0.0, yaw: -0.22, length: 4.35, height: 4.75, width: 5.82 },
    { id: "body-segment-3", x: -3.95, y: 2.1, z: -1.4, yaw: -0.25, length: 4.25, height: 4.6, width: 5.58 },
    { id: "body-segment-4", x: -7.75, y: 1.94, z: -2.3, yaw: -0.15, length: 4.0, height: 4.35, width: 5.25 },
    { id: "body-segment-5", x: -11.35, y: 1.78, z: -2.1, yaw: 0.05, length: 3.85, height: 4.1, width: 4.9 },
    { id: "body-segment-6", x: -14.75, y: 1.62, z: -1.0, yaw: 0.22, length: 3.6, height: 3.8, width: 4.52 },
    { id: "body-segment-7", x: -17.9, y: 1.45, z: 0.8, yaw: 0.32, length: 3.35, height: 3.45, width: 4.08 },
    { id: "body-segment-8", x: -20.8, y: 1.28, z: 2.5, yaw: 0.34, length: 3.1, height: 3.1, width: 3.62 },
    { id: "body-segment-9", x: -23.45, y: 1.1, z: 3.4, yaw: 0.28, length: 2.8, height: 2.7, width: 3.12 },
    { id: "tail-segment", x: -25.85, y: 0.92, z: 3.05, yaw: 0.15, length: 2.5, height: 2.25, width: 2.58 },
  ];

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function smoothstep(value) {
    const t = clamp(value, 0, 1);
    return t * t * (3 - 2 * t);
  }

  function smootherstep(value) {
    const t = clamp(value, 0, 1);
    return t * t * t * (t * (t * 6 - 15) + 10);
  }

  function passIndex(passId) {
    const index = PASS_ORDER.indexOf(passId);
    return index >= 0 ? index : PASS_ORDER.length - 1;
  }

  function createChamferedPrismGeometry() {
    const points = [
      [-0.34, 0.5],
      [0.34, 0.5],
      [0.5, 0.34],
      [0.5, -0.34],
      [0.34, -0.5],
      [-0.34, -0.5],
      [-0.5, -0.34],
      [-0.5, 0.34],
    ];
    const positions = [];
    const indices = [];
    for (let ring = 0; ring < 2; ring += 1) {
      const x = ring === 0 ? -0.5 : 0.5;
      for (let index = 0; index < points.length; index += 1) {
        const point = points[index];
        positions.push(x, point[1], point[0]);
      }
    }
    for (let index = 0; index < points.length; index += 1) {
      const next = (index + 1) % points.length;
      indices.push(index, next, 8 + next, index, 8 + next, 8 + index);
    }
    for (let index = 1; index < points.length - 1; index += 1) {
      indices.push(0, index + 1, index);
      indices.push(8, 8 + index, 8 + index + 1);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
  }

  function createOctagonalRingGeometry(innerScale) {
    const scale = clamp(Number(innerScale) || 0.58, 0.32, 0.82);
    const points = [
      [-0.34, 0.5],
      [0.34, 0.5],
      [0.5, 0.34],
      [0.5, -0.34],
      [0.34, -0.5],
      [-0.34, -0.5],
      [-0.5, -0.34],
      [-0.5, 0.34],
    ];
    const positions = [];
    const indices = [];
    [-0.5, 0.5].forEach((x) => {
      points.forEach((point) => positions.push(x, point[1], point[0]));
      points.forEach((point) => positions.push(x, point[1] * scale, point[0] * scale));
    });
    const outerBack = 0;
    const innerBack = 8;
    const outerFront = 16;
    const innerFront = 24;
    for (let index = 0; index < 8; index += 1) {
      const next = (index + 1) % 8;
      indices.push(
        outerBack + index, outerBack + next, outerFront + next,
        outerBack + index, outerFront + next, outerFront + index,
        innerBack + index, innerFront + next, innerBack + next,
        innerBack + index, innerFront + index, innerFront + next,
        outerFront + index, outerFront + next, innerFront + next,
        outerFront + index, innerFront + next, innerFront + index,
        outerBack + index, innerBack + next, outerBack + next,
        outerBack + index, innerBack + index, innerBack + next,
      );
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
  }

  function createMaterials(reviewIndex) {
    const colored = reviewIndex >= 3;
    const clay = new THREE.MeshStandardMaterial({
      name: "LandEater_BlockoutClay",
      color: 0x8d7660,
      roughness: 0.92,
      metalness: 0,
      flatShading: true,
    });
    const structureDark = new THREE.MeshStandardMaterial({
      name: colored ? "LandEater_BurgundyBand" : "LandEater_StructuralDark",
      color: colored ? 0x702b36 : 0x46352e,
      roughness: colored ? 0.8 : 0.94,
      metalness: 0,
      flatShading: true,
    });
    const armor = new THREE.MeshStandardMaterial({
      name: "LandEater_PaleArmor",
      color: colored ? 0xd7af77 : 0x8d7660,
      roughness: 0.82,
      metalness: 0,
      flatShading: true,
    });
    const underside = new THREE.MeshStandardMaterial({
      name: "LandEater_DarkUnderside",
      color: colored ? 0x3b2a23 : 0x55443d,
      roughness: 0.88,
      metalness: 0,
      flatShading: true,
    });
    const teeth = new THREE.MeshStandardMaterial({
      name: "LandEater_BlockTeeth",
      color: colored ? 0xb98f5b : 0x8d7660,
      roughness: 0.84,
      metalness: 0,
      flatShading: true,
    });
    const weakpoint = new THREE.MeshStandardMaterial({
      name: "LandEater_Weakpoint",
      color: colored ? 0xe62c22 : 0x8d7660,
      emissive: colored ? 0xb91610 : 0x000000,
      emissiveIntensity: colored ? 0.72 : 0,
      roughness: 0.72,
      metalness: 0,
      flatShading: true,
    });
    const voidMaterial = new THREE.MeshBasicMaterial({
      name: "LandEater_AbsoluteVoid",
      color: 0x000000,
      fog: false,
      toneMapped: false,
      side: THREE.DoubleSide,
    });
    return {
      clay,
      active: colored ? armor : clay,
      armor,
      underside,
      structureDark,
      teeth,
      weakpoint,
      void: voidMaterial,
      reviewIndex,
    };
  }

  function configureMesh(mesh, name, castShadow, receiveShadow) {
    mesh.name = name;
    mesh.castShadow = castShadow;
    mesh.receiveShadow = receiveShadow;
    return mesh;
  }

  function createSocket(name, parent, position) {
    const socket = new THREE.Object3D();
    socket.name = name;
    socket.position.fromArray(position);
    parent.add(socket);
    return socket;
  }

  function createLandEaterModel(options) {
    const config = options || {};
    const reviewPass = PASS_ORDER.includes(config.reviewPass)
      ? config.reviewPass
      : "optimization-pass";
    const reviewIndex = passIndex(reviewPass);
    const castShadow = config.castShadow !== false;
    const receiveShadow = config.receiveShadow !== false;
    const materials = createMaterials(reviewIndex);
    const root = new THREE.Group();
    root.name = "LandEater";

    const bodyRig = new THREE.Group();
    bodyRig.name = "LandEater_BodyRig";
    root.add(bodyRig);

    const segmentGeometry = createChamferedPrismGeometry();
    const segments = [];
    SEGMENT_LAYOUT.forEach((descriptor, index) => {
      const pivot = new THREE.Group();
      pivot.name = `LandEater_${descriptor.id}_Pivot`;
      pivot.position.set(descriptor.x, descriptor.y, descriptor.z);
      pivot.rotation.y = descriptor.yaw;
      pivot.userData.restPosition = pivot.position.clone();
      pivot.userData.restRotation = pivot.rotation.clone();
      pivot.userData.segmentIndex = index;
      bodyRig.add(pivot);

      const mesh = configureMesh(
        new THREE.Mesh(segmentGeometry, materials.active),
        `LandEater_${descriptor.id}_Armor`,
        castShadow,
        receiveShadow,
      );
      mesh.scale.set(descriptor.length, descriptor.height, descriptor.width);
      pivot.add(mesh);
      segments.push({ pivot, mesh, seam: null, descriptor });
    });

    let seamInstances = null;
    const seamMatrix = new THREE.Matrix4();
    const seamPosition = new THREE.Vector3();
    const seamOffset = new THREE.Vector3();
    const seamScale = new THREE.Vector3();
    function updateSeamInstances() {
      if (!seamInstances) return;
      for (let index = 0; index < segments.length - 1; index += 1) {
        const segment = segments[index];
        const descriptor = segment.descriptor;
        seamOffset.set(descriptor.length * 0.47, 0, 0);
        seamOffset.applyQuaternion(segment.pivot.quaternion);
        seamPosition.copy(segment.pivot.position).add(seamOffset);
        seamScale.set(
          Math.max(0.24, descriptor.length * 0.13),
          descriptor.height * 1.015,
          descriptor.width * 1.015,
        );
        seamMatrix.compose(seamPosition, segment.pivot.quaternion, seamScale);
        seamInstances.setMatrixAt(index, seamMatrix);
      }
      seamInstances.instanceMatrix.needsUpdate = true;
    }
    if (reviewIndex >= 1) {
      seamInstances = new THREE.InstancedMesh(
        segmentGeometry,
        materials.structureDark,
        Math.max(0, segments.length - 1),
      );
      seamInstances.name = "LandEater_InstancedStructuralBands";
      seamInstances.castShadow = castShadow;
      seamInstances.receiveShadow = receiveShadow;
      seamInstances.frustumCulled = false;
      seamInstances.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      bodyRig.add(seamInstances);
      updateSeamInstances();
    }

    let lowerShell = null;
    const lowerShellMatrix = new THREE.Matrix4();
    const lowerShellPosition = new THREE.Vector3();
    const lowerShellOffset = new THREE.Vector3();
    const lowerShellScale = new THREE.Vector3();
    function updateLowerShellInstances() {
      if (!lowerShell) return;
      segments.forEach((segment, index) => {
        const descriptor = segment.descriptor;
        lowerShellOffset.set(0, -descriptor.height * 0.34, 0);
        lowerShellOffset.applyQuaternion(segment.pivot.quaternion);
        lowerShellPosition.copy(segment.pivot.position).add(lowerShellOffset);
        lowerShellScale.set(
          descriptor.length * 0.965,
          descriptor.height * 0.36,
          descriptor.width * 0.95,
        );
        lowerShellMatrix.compose(lowerShellPosition, segment.pivot.quaternion, lowerShellScale);
        lowerShell.setMatrixAt(index, lowerShellMatrix);
      });
      lowerShell.instanceMatrix.needsUpdate = true;
    }
    if (reviewIndex >= 3) {
      lowerShell = new THREE.InstancedMesh(segmentGeometry, materials.underside, segments.length);
      lowerShell.name = "LandEater_InstancedDarkUnderside";
      lowerShell.castShadow = castShadow;
      lowerShell.receiveShadow = receiveShadow;
      lowerShell.frustumCulled = false;
      lowerShell.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      bodyRig.add(lowerShell);
      updateLowerShellInstances();
    }

    const headPivot = new THREE.Group();
    headPivot.name = "LandEater_HeadPivot";
    headPivot.position.set(8.4, 3.35, 0.75);
    headPivot.rotation.y = -0.12;
    headPivot.userData.restPosition = headPivot.position.clone();
    headPivot.userData.restRotation = headPivot.rotation.clone();
    root.add(headPivot);

    const headGeometry = reviewIndex >= 1
      ? createOctagonalRingGeometry(0.59)
      : segmentGeometry;
    const head = configureMesh(
      new THREE.Mesh(headGeometry, materials.active),
      reviewIndex >= 1 ? "LandEater_OctagonalHeadRing" : "LandEater_BlockoutHead",
      castShadow,
      receiveShadow,
    );
    head.scale.set(3.7, 7.4, 7.8);
    headPivot.add(head);

    const jawPivot = new THREE.Group();
    jawPivot.name = "LandEater_JawPivot";
    jawPivot.position.set(1.7, -0.88, 0);
    jawPivot.userData.restRotation = jawPivot.rotation.clone();
    headPivot.add(jawPivot);
    let jawArmor = null;
    let mouthVoid = null;
    if (reviewIndex >= 1) {
      jawArmor = configureMesh(
        new THREE.Mesh(segmentGeometry, materials.active),
        "LandEater_LowerJawArmor",
        castShadow,
        receiveShadow,
      );
      jawArmor.position.set(-0.18, -1.82, 0);
      jawArmor.scale.set(1.7, 0.66, 4.35);
      jawPivot.add(jawArmor);

      mouthVoid = configureMesh(
        new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.08, 8, 1, false), materials.void),
        "LandEater_AbsoluteBlackCavity",
        false,
        false,
      );
      mouthVoid.rotation.z = Math.PI * 0.5;
      mouthVoid.position.set(1.66, 0, 0);
      mouthVoid.scale.set(3.15, 2.96, 2.96);
      mouthVoid.renderOrder = 1;
      headPivot.add(mouthVoid);
    }

    let teeth = null;
    if (reviewIndex >= 2) {
      const toothGeometry = new THREE.ConeGeometry(0.54, 1.78, 4, 1, false);
      toothGeometry.rotateY(Math.PI * 0.25);
      teeth = new THREE.InstancedMesh(toothGeometry, materials.teeth, 12);
      teeth.name = "LandEater_RadialBlockTeeth";
      teeth.castShadow = castShadow;
      teeth.receiveShadow = receiveShadow;
      teeth.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      const up = new THREE.Vector3(0, 1, 0);
      const position = new THREE.Vector3();
      const direction = new THREE.Vector3();
      const quaternion = new THREE.Quaternion();
      const scale = new THREE.Vector3();
      const matrix = new THREE.Matrix4();
      for (let index = 0; index < 12; index += 1) {
        const angle = (index / 12) * Math.PI * 2;
        position.set(1.9, Math.cos(angle) * 2.42, Math.sin(angle) * 2.58);
        direction.set(0, -Math.cos(angle), -Math.sin(angle)).normalize();
        quaternion.setFromUnitVectors(up, direction);
        const alternating = index % 2 === 0 ? 1 : 0.9;
        scale.set(1, alternating, index % 3 === 0 ? 1.08 : 0.94);
        matrix.compose(position, quaternion, scale);
        teeth.setMatrixAt(index, matrix);
      }
      teeth.instanceMatrix.needsUpdate = true;
      teeth.userData.toothCount = 12;
      teeth.userData.radialStep = Math.PI / 6;
      headPivot.add(teeth);
    }

    const tailTip = configureMesh(
      new THREE.Mesh(new THREE.ConeGeometry(1, 3.2, 4, 1, false), materials.active),
      "LandEater_BlockoutTailTip",
      castShadow,
      receiveShadow,
    );
    tailTip.rotation.z = Math.PI * 0.5;
    const tailSegment = segments[segments.length - 1];
    tailTip.position.set(-tailSegment.descriptor.length * 0.78, -0.04, 0);
    tailTip.scale.set(0.95, 1.1, 0.8);
    tailSegment.pivot.add(tailTip);

    const weakpoints = [];
    const weakpointSockets = [];
    if (reviewIndex >= 3) {
      const weakpointGeometry = new THREE.BoxGeometry(1, 1, 1);
      [1, 4, 7].forEach((segmentIndex, weakpointIndex) => {
        const segment = segments[segmentIndex];
        const weakpoint = configureMesh(
          new THREE.Mesh(weakpointGeometry, materials.weakpoint),
          `LandEater_Weakpoint_${weakpointIndex + 1}`,
          false,
          false,
        );
        weakpoint.position.set(0.12, segment.descriptor.height * 0.505, 0);
        weakpoint.scale.set(1.18, 0.12, 0.56);
        weakpoint.userData.weakpointIndex = weakpointIndex;
        weakpoint.userData.segmentIndex = segmentIndex;
        segment.pivot.add(weakpoint);
        weakpoints.push(weakpoint);
        weakpointSockets.push(
          createSocket(
            `LandEater_Socket_Weakpoint_${weakpointIndex + 1}`,
            segment.pivot,
            [0.12, segment.descriptor.height * 0.54, 0],
          ),
        );
      });
    }

    const dustVents = reviewIndex >= 6
      ? segments.map((segment, index) => createSocket(
        `LandEater_Socket_DustVent_${index + 1}`,
        segment.pivot,
        [0, -segment.descriptor.height * 0.5, 0],
      ))
      : [];
    const sockets = {
      emergenceOrigin: createSocket("LandEater_Socket_EmergenceOrigin", root, [0, 0, 0]),
      impactOrigin: createSocket("LandEater_Socket_ImpactOrigin", headPivot, [2.35, -2.85, 0]),
      mouthCenter: createSocket("LandEater_Socket_MouthCenter", headPivot, [1.9, 0, 0]),
      deathOrigin: createSocket("LandEater_Socket_DeathOrigin", root, [0, 2.2, 0]),
      weakpoints: weakpointSockets,
      dustVents,
    };

    root.userData.landEaterParts = {
      reviewPass,
      reviewIndex,
      bodyRig,
      segments,
      headPivot,
      head,
      jawPivot,
      jawArmor,
      tailTip,
      lowerShell,
      sockets,
      materials,
      armorMeshes: segments.map((segment) => segment.mesh).concat(head),
      seamMeshes: seamInstances ? [seamInstances] : [],
      teeth,
      mouthVoid,
      weakpoints,
      dustVents,
    };
    root.userData.sculptRuntime = {
      nodes: {
        root,
        "body-assembly": bodyRig,
        head: headPivot,
        "tail-assembly": segments[segments.length - 1].pivot,
        jaw: jawPivot,
      },
      meshes: {
        head,
        jaw: jawArmor,
        "mouth-cavity": mouthVoid,
        "tail-segment": segments[segments.length - 1].mesh,
        "weakpoint-template": weakpoints[0] || null,
      },
      sockets,
      colliders: {
        head: { type: "sphere", radius: 4.05, offset: [8.4, 3.35, 0.75] },
        body: {
          type: "chain",
          radius: 2.75,
          segments: segments.map((segment) => ({
            node: segment.pivot.name,
            type: "box",
            size: [
              segment.descriptor.length,
              segment.descriptor.height,
              segment.descriptor.width,
            ],
          })),
        },
        tail: {
          type: "tapered-capsule",
          node: tailSegment.pivot.name,
          tipNode: tailTip.name,
          radius: 1.05,
          tipRadius: 0.28,
        },
        bite: { type: "sphere", radius: 3.5, socket: "impactOrigin" },
      },
      destructionGroups: {
        armor: segments.map((segment) => segment.mesh).concat(head),
        "armor-phase-1": [segments[1].mesh, segments[5].mesh, segments[8].mesh],
        "armor-phase-2": [segments[0].mesh, segments[3].mesh, segments[6].mesh, segments[9].mesh],
        teeth: teeth ? [teeth] : [],
        weakpoints: weakpoints.slice(),
      },
    };
    root.userData.surfacePolicy = {
      enabled: reviewIndex >= 4,
      flatShading: true,
      edgeTreatment: "single-cut hard chamfer",
      textureMaps: "prohibited",
      surfaceNoise: "prohibited",
      paletteColorCount: reviewIndex >= 3 ? 6 : 2,
    };
    root.userData.lookDevTargets = {
      enabled: reviewIndex >= 5,
      key: "warm hard directional light from upper-left",
      fill: "restrained warm hemisphere",
      rim: "none",
      contactShadow: "compact",
      cavityPolicy: "MeshBasicMaterial RGB 0,0,0; fog=false; toneMapped=false",
    };
    root.userData.actionReadiness = {
      enabled: reviewIndex >= 6,
      stableSectionPivots: segments.length,
      weakpointSockets: weakpointSockets.length,
      dustSockets: dustVents.length,
      states: ["idle", "hunt", "emerge", "devour", "burrow", "zigzag", "recovery", "hurt", "death"],
      allocatesDuringAnimation: false,
      transitionPairs: [
        "idle->hunt",
        "hunt->emerge",
        "emerge->devour",
        "emerge->burrow",
        "devour->recovery",
        "burrow->recovery",
        "zigzag->recovery",
        "recovery->idle",
      ],
      additiveHitReaction: true,
      synchronizedAttackPhase: true,
      distanceSynchronizedLocomotion: true,
      stationaryCornerTurns: true,
      stationaryWallRicochets: true,
      mouthFirstDevour: true,
      subterraneanAmbush: true,
      synchronizedSerpentineHunt: true,
      impactTimedBiteClosure: true,
      articulatedWorldSpine: true,
      independentSegmentTransforms: segments.length,
      rigidRootYawDuringLocomotion: false,
      sectionDelayedEmergence: true,
      sequentialDevourBodyWave: true,
      headToTailTurnPropagation: true,
      solidTailCollider: true,
      mouthForwardAxis: "+X",
    };
    const optimizationGeometryIds = new Set();
    const optimizationMaterialIds = new Set();
    let optimizationTriangles = 0;
    let optimizationDrawCalls = 0;
    root.traverse((node) => {
      if (!node.isMesh || !node.geometry) return;
      optimizationDrawCalls += 1;
      optimizationGeometryIds.add(node.geometry.uuid);
      const materialsForNode = Array.isArray(node.material) ? node.material : [node.material];
      materialsForNode.forEach((material) => {
        if (material) optimizationMaterialIds.add(material.uuid);
      });
      const positions = node.geometry.getAttribute("position");
      const baseTriangles = node.geometry.index
        ? node.geometry.index.count / 3
        : positions ? positions.count / 3 : 0;
      optimizationTriangles += baseTriangles * (node.isInstancedMesh ? node.count : 1);
    });
    root.userData.optimization = {
      enabled: reviewIndex >= 7,
      triangles: Math.round(optimizationTriangles),
      drawCalls: optimizationDrawCalls,
      uniqueGeometries: optimizationGeometryIds.size,
      visibleMaterialColors: optimizationMaterialIds.size,
      toothInstances: teeth ? 12 : 0,
      undersideInstances: lowerShell ? segments.length : 0,
      geometryAllocationsPerFrame: 0,
      materialAllocationsPerFrame: 0,
    };

    root.userData.animationStates = [
      "idle",
      "hunt",
      "emerge",
      "devour",
      "burrow",
      "zigzag",
      "recovery",
      "hurt",
      "death",
    ];
    const deathStartSegmentPositions = segments.map((segment) => segment.pivot.position.clone());
    const deathStartSegmentRotations = segments.map((segment) => segment.pivot.rotation.clone());
    const deathStartHeadPosition = headPivot.position.clone();
    const deathStartHeadRotation = headPivot.rotation.clone();
    const deathStartHeadScale = headPivot.scale.clone();
    const deathStartJawRotation = jawPivot.rotation.clone();
    let deathStartRootY = 0;
    let previousAnimationMode = "idle";
    root.userData.animate = function animateLandEater(timeSeconds, state) {
      const animation = state || {};
      const mode = animation.mode || "idle";
      const phase = clamp(Number(animation.phase) || 1, 1, 3);
      const progress = clamp(Number(animation.progress) || 0, 0, 1);
      const rawTelegraphProgress = Number(animation.telegraphProgress);
      const telegraphProgress = Number.isFinite(rawTelegraphProgress)
        ? clamp(rawTelegraphProgress, 0, 1)
        : mode === "zigzag" ? 1 : progress;
      const rawMotionProgress = Number(animation.motionProgress);
      const motionProgress = Number.isFinite(rawMotionProgress)
        ? clamp(rawMotionProgress, 0, 1)
        : progress;
      const rawLocomotionCycle = Number(animation.locomotionCycle);
      const locomotionCycle = Number.isFinite(rawLocomotionCycle)
        ? Math.max(0, rawLocomotionCycle)
        : motionProgress * (4.8 + phase * 0.4);
      const rawLocomotionWeight = Number(animation.locomotionWeight);
      const hasLocomotionWeight = Number.isFinite(rawLocomotionWeight);
      const locomotionWeight = hasLocomotionWeight
        ? clamp(rawLocomotionWeight, 0, 1)
        : 1;
      const turnAmount = clamp(Number(animation.turnAmount) || 0, -1, 1);
      const hurtAmount = clamp(Number(animation.hurtAmount) || 0, 0, 1);
      const spinePose = animation.spinePose;
      const articulatedSpine = !!(
        spinePose &&
        spinePose.active &&
        Array.isArray(spinePose.segments) &&
        spinePose.segments.length >= segments.length &&
        spinePose.head
      );
      const articulationRippleScale = articulatedSpine ? 0.3 : 1;
      const articulationHeadRippleScale = articulatedSpine ? 0.38 : 1;
      const ambientTravel = timeSeconds * (1.65 + phase * 0.12);
      const synchronizedZigzagTravel =
        locomotionCycle * Math.PI * 2 +
        (Number.isFinite(rawLocomotionCycle) ? 0.37 : phase * 0.37);
      const synchronizedHuntTravel =
        locomotionCycle * Math.PI * 2 +
        (Number.isFinite(rawLocomotionCycle) ? 0.21 : phase * 0.31);
      const huntSyncBlend = mode === "hunt"
        ? smootherstep(clamp(progress / 0.12, 0, 1)) *
          (1 - smootherstep(clamp((progress - 0.88) / 0.12, 0, 1)))
        : 0;
      const travel = mode === "zigzag"
        ? synchronizedZigzagTravel
        : ambientTravel;
      const ambientIdleBob = Math.sin(ambientTravel + 0.5) * 0.09;
      const synchronizedIdleBob =
        Math.sin(synchronizedHuntTravel + 0.5) * 0.09;
      const idleBob = ambientIdleBob +
        (synchronizedIdleBob - ambientIdleBob) * huntSyncBlend;
      const ambientIdleTilt =
        Math.sin(ambientTravel * 0.43 + 0.2) * 0.025;
      const synchronizedIdleTilt =
        Math.sin(synchronizedHuntTravel * 0.43 + 0.2) * 0.025;
      const idleTilt = ambientIdleTilt +
        (synchronizedIdleTilt - ambientIdleTilt) * huntSyncBlend;
      const ambientIdleJaw = -0.035 *
        (0.5 + Math.sin(ambientTravel * 0.55 - 0.4) * 0.5);
      const synchronizedIdleJaw = -0.035 *
        (0.5 + Math.sin(synchronizedHuntTravel * 0.55 - 0.4) * 0.5);
      const idleJaw = ambientIdleJaw +
        (synchronizedIdleJaw - ambientIdleJaw) * huntSyncBlend;
      const devourStrike = mode === "devour" ? smootherstep(progress) : 0;
      const burrowStrike = mode === "burrow" ? smootherstep(progress) : 0;
      const huntMotionEnvelope = mode === "hunt"
        ? Math.pow(Math.max(0, Math.sin(progress * Math.PI)), 0.82) *
          (hasLocomotionWeight ? locomotionWeight : 1)
        : 0;
      const biteClose = mode === "burrow"
        ? smootherstep(clamp((progress - 0.5) / 0.18, 0, 1)) *
          (1 - smootherstep(clamp((progress - 0.68) / 0.2, 0, 1)))
        : 0;
      const recoverySettle = mode === "recovery" ? smootherstep(progress) : 0;
      const zigzagLaunchHold = mode === "zigzag"
        ? (1 - smootherstep(clamp(motionProgress / 0.14, 0, 1))) * smoothstep(telegraphProgress)
        : 0;
      const zigzagFinish = mode === "zigzag"
        ? smootherstep(clamp((motionProgress - 0.82) / 0.18, 0, 1))
        : 0;
      const zigzagMotionEnvelope = mode === "zigzag"
        ? smootherstep(clamp(motionProgress / 0.12, 0, 1)) *
          (1 - zigzagFinish) *
          (hasLocomotionWeight ? locomotionWeight : 1)
        : 0;
      const additiveHitWave = mode === "death"
        ? 0
        : Math.sin((1 - hurtAmount) * Math.PI * 5) * hurtAmount;

      if (mode === "death" && previousAnimationMode !== "death") {
        segments.forEach((segment, index) => {
          deathStartSegmentPositions[index].copy(segment.pivot.position);
          deathStartSegmentRotations[index].copy(segment.pivot.rotation);
        });
        deathStartHeadPosition.copy(headPivot.position);
        deathStartHeadRotation.copy(headPivot.rotation);
        deathStartHeadScale.copy(headPivot.scale);
        deathStartJawRotation.copy(jawPivot.rotation);
        deathStartRootY = root.position.y;
      }

      segments.forEach((segment, index) => {
        const restPosition = segment.pivot.userData.restPosition;
        const restRotation = segment.pivot.userData.restRotation;
        if (mode === "death") {
          const collapse = smootherstep(clamp(progress * 1.35 - index * 0.045, 0, 1));
          const startPosition = deathStartSegmentPositions[index];
          const startRotation = deathStartSegmentRotations[index];
          segment.pivot.position.copy(startPosition);
          segment.pivot.position.x += Math.sin(index * 0.82) * collapse * 0.24;
          segment.pivot.position.y -= collapse * (0.72 + index * 0.035);
          segment.pivot.position.z += (index % 2 === 0 ? -1 : 1) * collapse * 0.16;
          segment.pivot.rotation.copy(startRotation);
          segment.pivot.rotation.x += collapse * Math.sin(index * 1.1) * 0.055;
          segment.pivot.rotation.y += collapse * Math.sin(index * 0.76) * 0.08;
          segment.pivot.rotation.z -= collapse * (0.1 + index * 0.008);
          return;
        }

        const ambientWave = Math.sin(ambientTravel - index * 0.68);
        const synchronizedHuntWave = Math.sin(
          synchronizedHuntTravel - index * 0.68
        );
        const wave = mode === "hunt"
          ? ambientWave +
            (synchronizedHuntWave - ambientWave) * huntSyncBlend
          : Math.sin(travel - index * 0.68);
        const ambientSecondaryWave = Math.sin(
          ambientTravel * 0.56 + index * 0.47
        );
        const synchronizedHuntSecondaryWave = Math.sin(
          synchronizedHuntTravel * 0.56 + index * 0.47
        );
        const secondaryWave = mode === "hunt"
          ? ambientSecondaryWave +
            (
              synchronizedHuntSecondaryWave - ambientSecondaryWave
            ) * huntSyncBlend
          : Math.sin(travel * 0.56 + index * 0.47);
        const sectionRatio = index / Math.max(1, segments.length - 1);
        const targetEmergenceLift = Math.max(1.45, 4.5 - index * 0.24);
        /*
         * Keep the first neck section low enough to remain visually connected
         * to the diving head, then crest through the mid-body like a striking
         * snake instead of lifting the whole front half as a rigid shelf.
         */
        const impactArchPhase = clamp((index + 0.35) / 8.2, 0, 1);
        const impactArchLift =
          Math.sin(impactArchPhase * Math.PI) * 3.4 +
          (1 - sectionRatio) * 0.55;
        const impactPitch = index < 4 ? (index - 1.5) * 0.12 : 0;
        let lift = 0;
        let waveScale = 1;
        let lateralAmplitude = 0.09;
        let verticalAmplitude = 0.055;
        let yawAmplitude = 0.018;
        let rollAmplitude = 0.018;
        let forwardAmplitude = 0;
        let zigzagBounce = 0;
        let hurtLateralOffset = 0;
        let impactBlend = 0;
        let turnLateralOffset = 0;
        let turnYawOffset = 0;
        let turnForwardCompression = 0;
        let turnLift = 0;
        let huntLateralOffset = 0;
        let huntYawOffset = 0;
        let huntRollOffset = 0;
        let huntLift = 0;
        let sectionLateralOffset = 0;
        let sectionYawOffset = 0;
        let sectionRollOffset = 0;
        const spineSegment = articulatedSpine
          ? spinePose.segments[index]
          : null;
        const basePositionX = spineSegment &&
          Number.isFinite(Number(spineSegment.x))
          ? Number(spineSegment.x)
          : restPosition.x;
        const basePositionZ = spineSegment &&
          Number.isFinite(Number(spineSegment.z))
          ? Number(spineSegment.z)
          : restPosition.z;
        const baseYaw = spineSegment &&
          Number.isFinite(Number(spineSegment.angle))
          ? Number(spineSegment.angle)
          : restRotation.y;

        if (mode === "hunt") {
          const huntWave = Math.sin(
            synchronizedHuntTravel - index * 0.74
          );
          const huntSecondary = Math.sin(
            synchronizedHuntTravel * 0.57 + index * 0.51
          );
          const tailWeight = 0.76 + sectionRatio * 0.28;
          huntLateralOffset =
            huntWave * 1.08 * huntMotionEnvelope * tailWeight *
            articulationRippleScale;
          huntYawOffset =
            huntWave * 0.24 * huntMotionEnvelope * tailWeight *
            articulationRippleScale;
          huntRollOffset =
            huntSecondary * 0.085 * huntMotionEnvelope;
          huntLift =
            Math.max(0, huntSecondary) * 0.22 * huntMotionEnvelope;
        } else if (mode === "emerge") {
          /*
           * The buried chain rises head-to-tail instead of translating as one
           * rigid slab. Each delayed section is still exactly normalized at
           * progress 0 and 1, preserving seamless emerge/strike boundaries.
           */
          const emergenceDelay = sectionRatio * 0.42;
          const sectionProgress = smootherstep(clamp(
            (progress - emergenceDelay) /
              Math.max(0.001, 1 - emergenceDelay),
            0,
            1,
          ));
          const emergenceArc = Math.sin(sectionProgress * Math.PI);
          lift =
            sectionProgress * targetEmergenceLift +
            emergenceArc * (0.42 + (1 - sectionRatio) * 0.48);
          sectionLateralOffset =
            emergenceArc *
            Math.sin(index * 0.82 + sectionProgress * Math.PI) *
            (0.18 + sectionRatio * 0.2);
          sectionYawOffset =
            emergenceArc *
            Math.sin(index * 0.71 + 0.4) *
            (0.045 + (1 - sectionRatio) * 0.025);
          sectionRollOffset =
            emergenceArc *
            Math.cos(index * 0.67 - 0.3) *
            0.055;
        } else if (mode === "devour") {
          /*
           * The impact travels down the body. A normalized per-section clock
           * keeps the first and last poses identical to emerge/recovery while
           * making the intervening strike visibly articulated.
           */
          const devourDelay = sectionRatio * 0.34;
          const sectionStrike = smootherstep(clamp(
            (progress - devourDelay) /
              Math.max(0.001, 1 - devourDelay),
            0,
            1,
          ));
          const sectionStrikeArc = Math.sin(sectionStrike * Math.PI);
          impactBlend = sectionStrike;
          lift =
            (1 - sectionStrike) * targetEmergenceLift +
            impactArchLift * sectionStrike +
            sectionStrikeArc * (0.5 + (1 - sectionRatio) * 0.72);
          waveScale = 1 - sectionStrike;
          forwardAmplitude =
            sectionStrikeArc * 0.42 * (1 - sectionRatio);
          sectionLateralOffset =
            sectionStrikeArc *
            Math.sin(index * 0.88 + sectionStrike * Math.PI * 1.4) *
            (0.28 + sectionRatio * 0.16);
          sectionYawOffset =
            sectionStrikeArc *
            Math.sin(index * 0.76 + sectionStrike * Math.PI) *
            (0.075 + (1 - sectionRatio) * 0.035);
          sectionRollOffset =
            sectionStrikeArc *
            Math.cos(index * 0.64 - sectionStrike * Math.PI * 0.8) *
            (0.09 + (1 - sectionRatio) * 0.04);
        } else if (mode === "burrow") {
          impactBlend = burrowStrike;
          lift =
            (1 - burrowStrike) * targetEmergenceLift +
            impactArchLift * impactBlend;
          waveScale = 1 - burrowStrike;
          forwardAmplitude =
            Math.sin(progress * Math.PI) * 0.55 * (1 - sectionRatio);
        } else if (mode === "recovery") {
          const recoil = Math.sin(progress * Math.PI);
          impactBlend = 1 - recoverySettle;
          lift =
            impactArchLift * impactBlend +
            recoil * Math.max(0.28, 1.28 - index * 0.075);
          waveScale = recoverySettle;
        } else if (mode === "zigzag") {
          impactBlend = zigzagFinish;
          lift =
            zigzagLaunchHold * Math.max(0.35, 1.42 - index * 0.085) +
            impactArchLift * impactBlend;
          waveScale = zigzagMotionEnvelope;
          lateralAmplitude = 0.74;
          verticalAmplitude = 0.24;
          yawAmplitude = 0.18;
          rollAmplitude = 0.075;
          forwardAmplitude = 0.38 * zigzagMotionEnvelope;
          zigzagBounce = Math.max(0, wave) * 0.26 * zigzagMotionEnvelope;
          /*
           * A wall turn starts at the neck and fades toward the tail. The
           * previous tail-heavy offset made the whole silhouette pivot at
           * once even though the route clock itself turns smoothly.
           */
          const frontTurnWeight = Math.pow(1 - sectionRatio, 1.35);
          turnLateralOffset =
            turnAmount *
            Math.sin(sectionRatio * Math.PI) *
            (1.45 + frontTurnWeight * 0.55);
          turnYawOffset =
            turnAmount * frontTurnWeight * 0.26;
          const wallCompression = Math.abs(turnAmount);
          turnForwardCompression =
            wallCompression * frontTurnWeight * 0.54;
          turnLift = wallCompression * Math.sin(sectionRatio * Math.PI) * 0.46;
        } else if (mode === "hurt") {
          const hurtDecay = 1 - progress;
          const hurtWave = Math.sin(progress * Math.PI * 8) * hurtDecay;
          lift = Math.abs(hurtWave) * Math.max(0.1, 0.32 - index * 0.016);
          hurtLateralOffset =
            hurtWave * Math.max(0.08, 0.34 - index * 0.022);
        }

        segment.pivot.position.set(
          basePositionX,
          restPosition.y,
          basePositionZ,
        );
        segment.pivot.position.x +=
          secondaryWave * forwardAmplitude * articulationRippleScale +
          impactBlend * (1 - sectionRatio) * 0.45 +
          turnForwardCompression * articulationRippleScale;
        segment.pivot.position.y +=
          lift + wave * verticalAmplitude * waveScale + zigzagBounce +
          turnLift + huntLift;
        segment.pivot.position.z +=
          wave * lateralAmplitude * waveScale * articulationRippleScale +
          turnLateralOffset * articulationRippleScale +
          huntLateralOffset +
          sectionLateralOffset +
          hurtLateralOffset +
          additiveHitWave * Math.max(0.025, 0.12 - index * 0.009);
        segment.pivot.rotation.copy(restRotation);
        segment.pivot.rotation.y = baseYaw;
        segment.pivot.rotation.y +=
          wave * yawAmplitude * waveScale * articulationRippleScale +
          turnYawOffset * articulationRippleScale +
          huntYawOffset +
          sectionYawOffset +
          additiveHitWave * Math.max(0.008, 0.045 - index * 0.0035);
        segment.pivot.rotation.z +=
          impactPitch * impactBlend -
          wave * rollAmplitude * waveScale +
          huntRollOffset +
          sectionRollOffset;
        if (articulatedSpine) {
          const localOffsetX = segment.pivot.position.x - basePositionX;
          const localOffsetZ = segment.pivot.position.z - basePositionZ;
          const spineCos = Math.cos(baseYaw);
          const spineSin = Math.sin(baseYaw);
          segment.pivot.position.x =
            basePositionX +
            spineCos * localOffsetX +
            spineSin * localOffsetZ;
          segment.pivot.position.z =
            basePositionZ -
            spineSin * localOffsetX +
            spineCos * localOffsetZ;
        }
      });
      updateSeamInstances();
      updateLowerShellInstances();

      if (mode === "death") {
        const collapse = smootherstep(progress);
        const headFall = smootherstep(clamp((progress - 0.06) / 0.94, 0, 1));
        headPivot.position.copy(deathStartHeadPosition);
        headPivot.position.x += headFall * 0.7;
        headPivot.position.y -= headFall * 3.2;
        headPivot.position.z += Math.sin(progress * Math.PI) * 0.22;
        headPivot.rotation.copy(deathStartHeadRotation);
        headPivot.rotation.x += headFall * 0.18;
        headPivot.rotation.z += headFall * 1.48;
        headPivot.scale.set(
          deathStartHeadScale.x + (1.06 - deathStartHeadScale.x) * collapse,
          deathStartHeadScale.y + (0.74 - deathStartHeadScale.y) * collapse,
          deathStartHeadScale.z + (1.08 - deathStartHeadScale.z) * collapse,
        );
        jawPivot.rotation.copy(deathStartJawRotation);
        jawPivot.rotation.z -= collapse * 0.92;
        root.position.y = deathStartRootY - collapse * 1.2;
      } else {
        const headRestPosition = headPivot.userData.restPosition;
        const headRestRotation = headPivot.userData.restRotation;
        const spineHead = articulatedSpine ? spinePose.head : null;
        const headBaseX = spineHead && Number.isFinite(Number(spineHead.x))
          ? Number(spineHead.x)
          : headRestPosition.x;
        const headBaseZ = spineHead && Number.isFinite(Number(spineHead.z))
          ? Number(spineHead.z)
          : headRestPosition.z;
        const headSpineYaw = spineHead &&
          Number.isFinite(Number(spineHead.angle))
          ? Number(spineHead.angle)
          : 0;
        headPivot.position.set(
          headBaseX,
          headRestPosition.y,
          headBaseZ,
        );
        headPivot.rotation.copy(headPivot.userData.restRotation);
        if (articulatedSpine) {
          headPivot.rotation.y =
            headSpineYaw + headRestRotation.y;
        }
        headPivot.scale.set(1, 1, 1);
        jawPivot.rotation.copy(jawPivot.userData.restRotation);
        root.position.y = 0;

        if (mode === "hunt") {
          const huntHeadWave = Math.sin(synchronizedHuntTravel + 0.32);
          const huntHeadLift = Math.sin(
            synchronizedHuntTravel * 0.62 - 0.45
          );
          headPivot.position.y +=
            idleBob +
            Math.max(0, huntHeadLift) * 0.38 * huntMotionEnvelope;
          headPivot.position.z +=
            huntHeadWave * 0.92 * huntMotionEnvelope *
            articulationHeadRippleScale;
          headPivot.rotation.y +=
            huntHeadWave * 0.25 * huntMotionEnvelope *
            articulationHeadRippleScale;
          headPivot.rotation.z +=
            idleTilt - huntHeadLift * 0.08 * huntMotionEnvelope;
          jawPivot.rotation.z +=
            idleJaw -
            (0.16 + Math.max(0, huntHeadWave) * 0.1) *
              huntMotionEnvelope;
          headPivot.scale.set(
            1 - Math.abs(huntHeadWave) * 0.018 * huntMotionEnvelope,
            1 + Math.max(0, huntHeadLift) * 0.035 * huntMotionEnvelope,
            1 + Math.abs(huntHeadWave) * 0.024 * huntMotionEnvelope,
          );
        } else if (mode === "emerge") {
          const rise = smootherstep(progress);
          headPivot.position.y += idleBob * (1 - rise) + rise * 6.4;
          headPivot.rotation.z += idleTilt * (1 - rise) - rise * 0.46;
          jawPivot.rotation.z += idleJaw * (1 - rise) - rise * 0.38;
          headPivot.scale.set(
            1 - rise * 0.06,
            1 + rise * 0.08,
            1 + rise * 0.04,
          );
        } else if (mode === "devour") {
          const strikeArc = Math.sin(progress * Math.PI);
          headPivot.position.x += devourStrike * 0.65 + strikeArc * 0.48;
          headPivot.position.y +=
            (1 - devourStrike) * 6.4 -
            devourStrike * 4.8 +
            strikeArc * 1.25;
          headPivot.rotation.z +=
            -0.46 * (1 - devourStrike) -
            1.18 * devourStrike -
            strikeArc * 0.18;
          jawPivot.rotation.z +=
            -0.38 * (1 - devourStrike) -
            1.02 * devourStrike -
            0.32 * strikeArc;
          headPivot.scale.set(
            0.94 + (1.1 - 0.94) * devourStrike - strikeArc * 0.025,
            1.08 + (0.84 - 1.08) * devourStrike + strikeArc * 0.1,
            1.04 + (1.08 - 1.04) * devourStrike + strikeArc * 0.03,
          );
        } else if (mode === "burrow") {
          const strikeArc = Math.sin(progress * Math.PI);
          headPivot.position.x += burrowStrike * 0.65 + strikeArc * 1.12;
          headPivot.position.y +=
            (1 - burrowStrike) * 6.4 -
            burrowStrike * 4.8 +
            strikeArc * 2.05;
          headPivot.rotation.z +=
            -0.46 * (1 - burrowStrike) -
            1.18 * burrowStrike -
            strikeArc * 0.3;
          jawPivot.rotation.z +=
            -0.38 * (1 - burrowStrike) -
            1.02 * burrowStrike -
            0.48 * strikeArc +
            1.22 * biteClose;
          headPivot.scale.set(
            0.94 + (1.1 - 0.94) * burrowStrike -
              strikeArc * 0.045 + biteClose * 0.08,
            1.08 + (0.84 - 1.08) * burrowStrike +
              strikeArc * 0.16 - biteClose * 0.12,
            1.04 + (1.08 - 1.04) * burrowStrike +
              strikeArc * 0.055 + biteClose * 0.04,
          );
        } else if (mode === "recovery") {
          const recoilArc = Math.sin(progress * Math.PI);
          const impactWeight = 1 - recoverySettle;
          headPivot.position.x += impactWeight * 0.65 - recoilArc * 0.38;
          headPivot.position.y +=
            impactWeight * -4.8 +
            idleBob * recoverySettle +
            recoilArc * 2.35;
          headPivot.rotation.z +=
            impactWeight * -1.18 +
            recoilArc * 0.54 +
            idleTilt * recoverySettle;
          jawPivot.rotation.z +=
            impactWeight * -1.02 -
            0.42 * recoilArc * (1 - recoverySettle * 0.15) +
            idleJaw * recoverySettle;
          headPivot.scale.set(
            1.1 + (1 - 1.1) * recoverySettle - recoilArc * 0.035,
            0.84 + (1 - 0.84) * recoverySettle + recoilArc * 0.1,
            1.08 + (1 - 1.08) * recoverySettle + recoilArc * 0.035,
          );
        } else if (mode === "zigzag") {
          const activeWeight = 1 - zigzagFinish;
          const zigzagHeadWave = Math.sin(travel * 0.78);
          const zigzagHeadTurn = Math.cos(travel * 0.44);
          const windupScale = smoothstep(telegraphProgress);
          const wallCompression = Math.abs(turnAmount) * activeWeight;
          headPivot.position.x +=
            zigzagHeadTurn * 0.18 * zigzagMotionEnvelope * activeWeight *
              articulationHeadRippleScale +
            zigzagFinish * 0.65 -
            wallCompression * 0.38 * articulationHeadRippleScale;
          headPivot.position.y +=
            (
              zigzagLaunchHold * 3.35 +
              zigzagHeadWave * 0.34 * zigzagMotionEnvelope
            ) * activeWeight -
            zigzagFinish * 4.8 +
            wallCompression * 0.32;
          headPivot.rotation.y +=
            (
              zigzagHeadTurn * 0.14 * zigzagMotionEnvelope * activeWeight -
              turnAmount * 0.12
            ) * articulationHeadRippleScale;
          headPivot.rotation.z +=
            (-0.38 * zigzagLaunchHold + zigzagHeadWave * 0.22 * zigzagMotionEnvelope) *
              activeWeight +
            -1.18 * zigzagFinish;
          jawPivot.rotation.z += (
            -0.48 * windupScale -
            (0.12 + zigzagHeadWave * 0.1) * zigzagMotionEnvelope
          ) * activeWeight -
            1.02 * zigzagFinish -
            wallCompression * 0.16;
          const zigzagScaleX =
            1 - windupScale * zigzagLaunchHold * 0.05 +
            zigzagMotionEnvelope * zigzagHeadTurn * 0.025 -
            wallCompression * 0.09;
          const zigzagScaleY =
            1 + windupScale * zigzagLaunchHold * 0.07 +
            zigzagMotionEnvelope * Math.abs(zigzagHeadWave) * 0.035 +
            wallCompression * 0.07;
          const zigzagScaleZ =
            1 + windupScale * zigzagLaunchHold * 0.035 +
            zigzagMotionEnvelope * 0.02 +
            wallCompression * 0.04;
          headPivot.scale.set(
            zigzagScaleX * activeWeight + 1.1 * zigzagFinish,
            zigzagScaleY * activeWeight + 0.84 * zigzagFinish,
            zigzagScaleZ * activeWeight + 1.08 * zigzagFinish,
          );
        } else if (mode === "hurt") {
          const hurtDecay = 1 - progress;
          const recoil = Math.sin(progress * Math.PI * 8) * hurtDecay;
          headPivot.position.x -= Math.abs(recoil) * 0.36;
          headPivot.position.y += idleBob + Math.abs(recoil) * 0.26;
          headPivot.position.z += recoil * 0.22;
          headPivot.rotation.y += recoil * 0.12;
          headPivot.rotation.z += idleTilt + recoil * 0.18;
          jawPivot.rotation.z += idleJaw - Math.abs(recoil) * 0.32;
          headPivot.scale.set(
            1 + Math.abs(recoil) * 0.035,
            1 - Math.abs(recoil) * 0.045,
            1 + Math.abs(recoil) * 0.025,
          );
        } else {
          headPivot.position.y += idleBob;
          headPivot.rotation.z += idleTilt;
          jawPivot.rotation.z += idleJaw;
        }

        headPivot.position.z += additiveHitWave * 0.16;
        headPivot.rotation.y += additiveHitWave * 0.055;
        if (articulatedSpine) {
          const localHeadOffsetX = headPivot.position.x - headBaseX;
          const localHeadOffsetZ = headPivot.position.z - headBaseZ;
          const headCos = Math.cos(headSpineYaw);
          const headSin = Math.sin(headSpineYaw);
          headPivot.position.x =
            headBaseX +
            headCos * localHeadOffsetX +
            headSin * localHeadOffsetZ;
          headPivot.position.z =
            headBaseZ -
            headSin * localHeadOffsetX +
            headCos * localHeadOffsetZ;
        }
      }

      if (weakpoints.length > 0) {
        const pulse = 1 + Math.sin(timeSeconds * (4.2 + phase * 0.65)) * 0.12;
        const deathFade = mode === "death" ? 1 - smootherstep(progress) : 1;
        weakpoints.forEach((weakpoint, index) => {
          const stagger = 1 + Math.sin(timeSeconds * 4.5 + index * 1.8) * 0.08;
          weakpoint.scale.set(1.18 * stagger, 0.12 * pulse, 0.56 * stagger);
        });
        materials.weakpoint.emissiveIntensity = (0.58 + pulse * 0.18) * deathFade;
      }
      previousAnimationMode = mode;
    };

    root.userData.setArmorPhase = function setArmorPhase(phaseValue) {
      const phase = clamp(Math.round(Number(phaseValue) || 1), 1, 3);
      const firstBreak = root.userData.sculptRuntime.destructionGroups["armor-phase-1"];
      const secondBreak = root.userData.sculptRuntime.destructionGroups["armor-phase-2"];
      firstBreak.forEach((mesh) => { mesh.visible = phase < 2; });
      secondBreak.forEach((mesh) => { mesh.visible = phase < 3; });
      weakpoints.forEach((weakpoint, index) => {
        weakpoint.visible = index < phase;
      });
    };
    root.userData.setWeakpointHit = function setWeakpointHit(index, amount) {
      const weakpoint = weakpoints[Math.max(0, Math.min(weakpoints.length - 1, index | 0))];
      if (!weakpoint) return;
      const flash = 1 + clamp(Number(amount) || 0, 0, 1) * 0.55;
      weakpoint.scale.set(1.18 * flash, 0.12 * flash, 0.56 * flash);
    };

    root.userData.dispose = function disposeLandEaterModel() {
      const geometries = new Set();
      const modelMaterials = new Set();
      root.traverse((node) => {
        if (node.geometry && !geometries.has(node.geometry)) {
          geometries.add(node.geometry);
          node.geometry.dispose();
        }
        const nodeMaterials = Array.isArray(node.material) ? node.material : [node.material];
        nodeMaterials.forEach((material) => {
          if (material && !modelMaterials.has(material)) {
            modelMaterials.add(material);
            material.dispose();
          }
        });
      });
    };

    return root;
  }

  global.createLandEaterModel = createLandEaterModel;
  global.LAND_EATER_MODEL_PASSES = PASS_ORDER.slice();
})(typeof window !== "undefined" ? window : globalThis);
