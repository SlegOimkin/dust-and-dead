(function attachHordeheartModelFactory(global) {
  "use strict";

  const THREE = global.THREE;
  if (!THREE) {
    throw new Error("hordeheart-model.js requires THREE to be loaded first");
  }

  const PASS_ORDER = [
    "blockout",
    "structural-pass",
    "form-refinement",
    "material-pass",
    "surface-pass",
    "lighting-pass",
    "interaction-pass",
  ];

  const QUARTER_LAYOUTS = {
    whole: [
      // The quarters overlap heavily on purpose.  They remain independent split
      // rigs, but the intact creature reads as one broad, collapsed mound rather
      // than four balls arranged in a square.
      { id: "front-left", x: -1.18, y: 1.5, z: 0.78, sx: 2.05, sy: 1.55, sz: 1.94, seed: 11, side: -1, front: 1 },
      { id: "rear-left", x: -1.05, y: 2.86, z: -0.78, sx: 2.25, sy: 2.96, sz: 2.04, seed: 23, side: -1, front: -1 },
      { id: "front-right", x: 1.18, y: 1.5, z: 0.78, sx: 2.05, sy: 1.55, sz: 1.94, seed: 37, side: 1, front: 1 },
      { id: "rear-right", x: 1.05, y: 2.86, z: -0.78, sx: 2.25, sy: 2.96, sz: 2.04, seed: 53, side: 1, front: -1 },
    ],
    half: [
      { id: "front", x: -0.12, y: 1.42, z: 0.72, sx: 2.04, sy: 1.42, sz: 1.76, seed: 67, side: 1, front: 1 },
      { id: "rear", x: 0.12, y: 1.82, z: -0.72, sx: 2.16, sy: 1.9, sz: 1.88, seed: 79, side: 1, front: -1 },
    ],
    quarter: [
      { id: "single", x: 0, y: 1.32, z: 0, sx: 1.72, sy: 1.3, sz: 1.62, seed: 97, side: 1, front: 1 },
    ],
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function smoothstep01(value) {
    const t = clamp(value, 0, 1);
    return t * t * (3 - 2 * t);
  }

  function smootherstep01(value) {
    const t = clamp(value, 0, 1);
    return t * t * t * (t * (t * 6 - 15) + 10);
  }

  function smoothWindow(value, start, peak, end) {
    if (value <= start || value >= end) return 0;
    if (value < peak) return smootherstep01((value - start) / Math.max(0.0001, peak - start));
    return 1 - smootherstep01((value - peak) / Math.max(0.0001, end - peak));
  }

  function dampedWave(value, start, cycles, power) {
    if (value <= start) return 0;
    const t = clamp((value - start) / Math.max(0.0001, 1 - start), 0, 1);
    return Math.sin(t * Math.PI * cycles) * Math.pow(1 - t, power || 1);
  }

  function fract(value) {
    return value - Math.floor(value);
  }

  function seeded(seed, index) {
    return fract(Math.sin(seed * 91.731 + index * 53.117) * 43758.5453);
  }

  function passIndex(passId) {
    const index = PASS_ORDER.indexOf(passId);
    return index >= 0 ? index : PASS_ORDER.length - 1;
  }

  function createMaterials(reviewIndex) {
    const clay = reviewIndex < 3;
    const surface = reviewIndex >= 3;
    const flesh = new THREE.MeshStandardMaterial({
      name: "Hordeheart_FleshCrust",
      color: clay ? 0x775a50 : 0xffffff,
      roughness: clay ? 0.88 : 0.78,
      metalness: 0,
      flatShading: true,
      vertexColors: surface,
    });
    const fleshLimb = new THREE.MeshStandardMaterial({
      name: "Hordeheart_FleshLimb",
      color: clay ? 0x775a50 : 0x642027,
      roughness: clay ? 0.88 : 0.8,
      metalness: 0,
      flatShading: true,
    });
    const fleshDark = new THREE.MeshStandardMaterial({
      name: "Hordeheart_FleshCavity",
      color: clay ? 0x55443f : 0x2b080c,
      roughness: clay ? 0.9 : 0.66,
      metalness: 0,
      flatShading: true,
    });
    const fissure = new THREE.MeshStandardMaterial({
      name: "Hordeheart_ShallowDarkSeam",
      color: clay ? 0x4f403c : 0x24060a,
      emissive: 0x000000,
      emissiveIntensity: 0,
      roughness: clay ? 0.84 : 0.68,
      metalness: 0,
      flatShading: true,
      side: THREE.FrontSide,
      depthTest: true,
      depthWrite: true,
      transparent: false,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    });
    const bone = new THREE.MeshStandardMaterial({
      name: "Hordeheart_PorousBone",
      color: clay ? 0x9a8171 : 0xc3a476,
      roughness: clay ? 0.86 : 0.7,
      metalness: 0,
      flatShading: false,
      vertexColors: surface,
    });
    // The preview harness may attach its inferred PBR maps to `bone` and `core`.
    // Important focal features use clean siblings so inferred height maps can
    // never stamp false triangular cracks across the skull or organic heart.
    const boneClean = new THREE.MeshStandardMaterial({
      name: "Hordeheart_CleanCattleBone",
      color: clay ? 0x9a8171 : 0xc7aa7d,
      roughness: clay ? 0.88 : 0.74,
      metalness: 0,
      flatShading: false,
    });
    const boneDark = new THREE.MeshStandardMaterial({
      name: "Hordeheart_BloodStainedBone",
      color: clay ? 0x705d55 : 0x71413a,
      roughness: 0.76,
      metalness: 0,
      flatShading: true,
    });
    const core = new THREE.MeshPhysicalMaterial({
      name: "Hordeheart_OrganicCore",
      color: clay ? 0x8b625a : 0xcf3035,
      emissive: clay ? 0x000000 : 0x8f210d,
      emissiveIntensity: clay ? 0 : 0.85,
      roughness: clay ? 0.76 : 0.34,
      metalness: 0,
      clearcoat: clay ? 0 : 0.22,
      flatShading: true,
      vertexColors: surface,
    });
    const organ = new THREE.MeshStandardMaterial({
      name: "Hordeheart_OrganicHeartMuscle",
      color: clay ? 0x8b625a : 0xa51e27,
      emissive: clay ? 0x000000 : 0x681016,
      emissiveIntensity: clay ? 0 : 0.46,
      roughness: clay ? 0.8 : 0.5,
      metalness: 0,
      flatShading: false,
    });
    const socket = new THREE.MeshStandardMaterial({
      name: "Hordeheart_DeepSockets",
      color: 0x140609,
      roughness: 0.96,
      metalness: 0,
      flatShading: true,
    });
    const claw = new THREE.MeshStandardMaterial({
      name: "Hordeheart_ClawTips",
      color: clay ? 0x5b4a45 : 0x2a1716,
      roughness: 0.62,
      metalness: 0,
      flatShading: true,
    });
    return { flesh, fleshLimb, fleshDark, fissure, bone, boneClean, boneDark, core, organ, socket, claw };
  }

  function deformGeometry(geometry, seed, strength, colorA, colorB, addColors) {
    // Deform shared positions before de-indexing.  The previous implementation
    // randomized each emitted triangle, so duplicated corner vertices moved by
    // different amounts and opened literal background-coloured cracks.
    const watertight = geometry.clone();
    const positions = watertight.attributes.position;
    const colors = [];
    const a = new THREE.Color(colorA);
    const b = new THREE.Color(colorB);
    for (let index = 0; index < positions.count; index += 1) {
      const x = positions.getX(index);
      const y = positions.getY(index);
      const z = positions.getZ(index);
      const broad = Math.sin(x * 3.7 + seed) * Math.cos(z * 4.3 - seed * 0.31);
      // Hash quantized source coordinates, never the triangle/vertex index.
      // Duplicate vertices at a seam therefore receive the exact same offset.
      const qx = Math.round(x * 10000);
      const qy = Math.round(y * 10000);
      const qz = Math.round(z * 10000);
      const cell = fract(Math.sin(seed * 17.17 + qx * 0.0137 + qy * 0.0199 + qz * 0.0271) * 43758.5453);
      const scale = 1 + broad * strength * 0.42 + (cell - 0.5) * strength;
      positions.setXYZ(index, x * scale, y * scale, z * scale);
      if (addColors) {
        const color = a.clone().lerp(b, clamp(cell * 0.72 + Math.max(0, y) * 0.14, 0, 1));
        colors.push(color.r, color.g, color.b);
      }
    }
    if (addColors) {
      watertight.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    }
    watertight.computeVertexNormals();
    const nonIndexed = watertight.index ? watertight.toNonIndexed() : watertight;
    nonIndexed.computeVertexNormals();
    if (watertight !== nonIndexed) watertight.dispose();
    return nonIndexed;
  }

  function createFacetedEllipsoid(name, scale, material, seed, reviewIndex, palette, detailOverride) {
    const detail = Number.isFinite(detailOverride) ? detailOverride : (reviewIndex >= 2 ? 2 : 1);
    const base = new THREE.IcosahedronGeometry(1, detail);
    const geometry = deformGeometry(
      base,
      seed,
      reviewIndex >= 2 ? 0.11 : 0.055,
      palette[0],
      palette[1],
      reviewIndex >= 3,
    );
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.scale.set(scale[0], scale[1], scale[2]);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  function carveCentralAtrium(mesh, descriptor) {
    if (!mesh || !mesh.geometry) return;
    const positions = mesh.geometry.getAttribute("position");
    for (let index = 0; index < positions.count; index += 1) {
      let x = positions.getX(index);
      let y = positions.getY(index);
      const z = positions.getZ(index);

      // Pull the rear pair away from the inner front wall. This keeps the
      // central anatomy recessed instead of pasted over the flesh shell.
      if (descriptor.front < 0) {
        const innerCoordinate = x * -descriptor.side;
        if (innerCoordinate > -0.12) {
          const yWeight = clamp(1 - Math.abs(y - 0.08) / 0.82, 0, 1);
          const zWeight = clamp((z + 0.08) / 0.92, 0, 1);
          const innerWeight = clamp((innerCoordinate + 0.12) / 0.82, 0, 1);
          const cut = yWeight * zWeight * innerWeight;
          x += descriptor.side * 0.52 * cut;
        }
      }

      // The whole creature has a shallow dorsal seat over the footprint
      // centre. The heart/rib assembly rests in this saddle, well behind the
      // +Z skull prow. Moving closed surface vertices preserves watertightness.
      if (descriptor.id === "rear-left" || descriptor.id === "rear-right") {
        const worldX = descriptor.x + x * descriptor.sx;
        const worldZ = descriptor.z + z * descriptor.sz;
        const radial = Math.sqrt(
          Math.pow(worldX / 1.62, 2) +
          Math.pow((worldZ + 0.16) / 1.46, 2),
        );
        const centreWeight = clamp(1 - radial, 0, 1);
        const crownWeight = clamp((y - 0.24) / 0.62, 0, 1);
        const seat = centreWeight * crownWeight;
        x += descriptor.side * 0.17 * seat;
        y -= 0.24 * seat;
      }

      positions.setX(index, x);
      positions.setY(index, y);
    }
    positions.needsUpdate = true;
    mesh.geometry.computeVertexNormals();
    mesh.geometry.computeBoundingSphere();
  }

  function addNeutralVertexColors(geometry, material) {
    if (!material || !material.vertexColors || geometry.getAttribute("color")) return;
    const positions = geometry.getAttribute("position");
    if (!positions) return;
    const colors = new Float32Array(positions.count * 3);
    colors.fill(1);
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  }

  function createTaperedSegment(name, start, end, startRadius, endRadius, material, radialSegments) {
    const startPoint = new THREE.Vector3(start[0], start[1], start[2]);
    const endPoint = new THREE.Vector3(end[0], end[1], end[2]);
    const delta = endPoint.clone().sub(startPoint);
    const length = Math.max(0.001, delta.length());
    const geometry = new THREE.CylinderGeometry(endRadius, startRadius, length, radialSegments || 5, 1, false);
    addNeutralVertexColors(geometry, material);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.position.copy(startPoint).add(endPoint).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  function createCurveTube(name, points, radius, material, tubularSegments, radialSegments) {
    const curve = new THREE.CatmullRomCurve3(points.map((point) => new THREE.Vector3(point[0], point[1], point[2])));
    const geometry = new THREE.TubeGeometry(curve, tubularSegments || 8, radius, radialSegments || 4, false);
    addNeutralVertexColors(geometry, material);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  function createHeart(name, scale, materials, seed, reviewIndex) {
    const group = new THREE.Group();
    group.name = name;
    // An anatomical, interlocking silhouette: two atria, a broad ventricle and
    // a blunt tapered apex.  No cleft/tube is laid over the front, which avoids
    // the old "faceted crystal with a crack" read.
    const detail = reviewIndex >= 2 && scale > 0.7 ? 2 : 1;
    const ventricle = createFacetedEllipsoid(
      `${name}_Ventricle`,
      [scale * 0.68, scale * 0.68, scale * 0.46],
      materials.organ,
      seed,
      reviewIndex,
      [0x8b1820, 0xc9433c],
      detail,
    );
    ventricle.position.set(scale * 0.035, -scale * 0.13, 0);
    ventricle.rotation.z = seed % 2 ? -0.08 : 0.08;
    group.add(ventricle);

    const leftAtrium = createFacetedEllipsoid(
      `${name}_LeftAtrium`,
      [scale * 0.43, scale * 0.4, scale * 0.39],
      materials.organ,
      seed + 3,
      reviewIndex,
      [0x8b1820, 0xc9433c],
      detail,
    );
    leftAtrium.position.set(-scale * 0.31, scale * 0.42, -scale * 0.015);
    leftAtrium.rotation.z = -0.18;
    group.add(leftAtrium);

    const rightAtrium = createFacetedEllipsoid(
      `${name}_RightAtrium`,
      [scale * 0.4, scale * 0.37, scale * 0.37],
      materials.organ,
      seed + 7,
      reviewIndex,
      [0x8b1820, 0xc9433c],
      detail,
    );
    rightAtrium.position.set(scale * 0.32, scale * 0.4, -scale * 0.02);
    rightAtrium.rotation.z = 0.16;
    group.add(rightAtrium);

    const apex = createFacetedEllipsoid(
      `${name}_BluntApex`,
      [scale * 0.38, scale * 0.43, scale * 0.34],
      materials.organ,
      seed + 11,
      reviewIndex,
      [0x82151e, 0xb83132],
      detail,
    );
    apex.position.set(scale * 0.1, -scale * 0.62, -scale * 0.015);
    apex.rotation.z = -0.14;
    group.add(apex);

    if (reviewIndex >= 2 && scale > 0.7) {
      const aorta = new THREE.Group();
      aorta.name = `${name}_Aorta`;
      aorta.add(createTaperedSegment(`${name}_AortaBase`, [scale * 0.18, scale * 0.62, -scale * 0.06], [scale * 0.28, scale * 0.82, 0], scale * 0.1, scale * 0.085, materials.organ, 6));
      aorta.add(createTaperedSegment(`${name}_AortaTip`, [scale * 0.28, scale * 0.82, 0], [scale * 0.12, scale * 0.98, scale * 0.05], scale * 0.086, scale * 0.055, materials.organ, 6));
      group.add(aorta);
    }
    group.userData.pulseMesh = ventricle;
    return group;
  }

  function createCrustPlates(lobe, descriptor, materials, reviewIndex) {
    if (reviewIndex < 2) return;
    // Overlapping muscle nodules merge the four hidden split rigs into one
    // irregular mound.  They are volumes, not thin armor plates.
    const isRear = descriptor.front < 0;
    const sites = isRear ? [
      [-descriptor.side * 0.42, 0.88, 0.08],
      [descriptor.side * 0.54, 0.72, 0.05],
      [descriptor.side * 0.82, 0.27, 0.24],
      [descriptor.side * 0.35, 0.51, 1.27],
      [descriptor.side * 0.59, 0.34, 1.25],
      [descriptor.side * 0.4, 0.28, 0.82],
    ] : [
      [-descriptor.side * 0.2, 0.68, 0.08],
      [descriptor.side * 0.58, 0.62, 0.05],
      [descriptor.side * 0.81, 0.18, 0.26],
      [descriptor.side * 0.38, 0.18, 0.82],
      [-descriptor.side * 0.25, 0.02, 0.94],
      [-descriptor.side * 0.7, 0.42, 0.62],
    ];
    const count = reviewIndex >= 4 ? sites.length : 4;
    for (let index = 0; index < count; index += 1) {
      const site = sites[index];
      const nodule = createFacetedEllipsoid(
        `MuscleNodule_${descriptor.id}_${index}`,
        [
          0.62 + seeded(descriptor.seed, index + 14) * 0.34,
          0.58 + seeded(descriptor.seed, index + 21) * 0.42,
          0.58 + seeded(descriptor.seed, index + 29) * 0.34,
        ],
        materials.flesh,
        descriptor.seed + index * 7,
        reviewIndex,
        [0x421018, 0x7f2830],
        1,
      );
      nodule.position.set(
        site[0] * descriptor.sx,
        site[1] * descriptor.sy,
        site[2] * descriptor.sz,
      );
      nodule.rotation.set(
        (seeded(descriptor.seed + 31, index) - 0.5) * 0.34,
        (seeded(descriptor.seed + 37, index) - 0.5) * 0.5,
        (seeded(descriptor.seed + 41, index) - 0.5) * 0.38,
      );
      lobe.add(nodule);
    }
  }

  function createSupportArm(descriptor, variant, materials, reviewIndex) {
    const shoulderPivot = new THREE.Group();
    shoulderPivot.name = `SupportArm_${descriptor.id}_${variant}`;
    const side = descriptor.side || (variant % 2 ? 1 : -1);
    const front = descriptor.front || 1;
    const isStrideLeg = variant === 0;
    // Two different diagonals per quarter keep the intact creature from reading
    // as eight straight spokes.  Every root is buried in the lobe, while the
    // distal wrist reaches the floor beyond the silhouette.
    const root = [
      side * descriptor.sx * 0.65,
      -descriptor.sy * 0.58,
      front * descriptor.sz * (isStrideLeg ? 0.52 : 0.28),
    ];
    const upperEnd = [
      side * (isStrideLeg ? 0.92 : 1.04),
      -(0.38 + Math.max(0, descriptor.sy - 1.5) * 0.12),
      front * (isStrideLeg ? 0.9 : -0.18),
    ];
    const forearmEnd = [
      side * (isStrideLeg ? 0.78 : 0.92),
      -(0.29 + Math.max(0, descriptor.sy - 1.5) * 0.13),
      front * (isStrideLeg ? 0.78 : 0.62),
    ];
    const elbow = [root[0] + upperEnd[0], root[1] + upperEnd[1], root[2] + upperEnd[2]];
    const wrist = [elbow[0] + forearmEnd[0], elbow[1] + forearmEnd[1], elbow[2] + forearmEnd[2]];
    shoulderPivot.position.set(root[0], root[1], root[2]);

    const shoulderMass = createFacetedEllipsoid(
      "EmbeddedShoulder",
      [0.62, 0.5, 0.58],
      materials.fleshLimb,
      descriptor.seed + variant * 17,
      reviewIndex,
      [0x491018, 0x7f2830],
      1,
    );
    shoulderMass.position.set(-side * 0.09, 0.08, -front * 0.07);
    shoulderPivot.add(shoulderMass);
    shoulderPivot.add(createTaperedSegment("FleshUpperArm", [0, 0, 0], upperEnd, 0.5, 0.36, materials.fleshLimb, 8));
    const shoulderPlate = createFacetedEllipsoid(
      "ShoulderBonePlate",
      [0.42, 0.18, 0.39],
      materials.boneDark,
      descriptor.seed + variant * 31,
      reviewIndex,
      [0x704039, 0x98705d],
      1,
    );
    shoulderPlate.position.set(side * 0.12, 0.28, front * 0.06);
    shoulderPlate.rotation.z = side * -0.16;
    shoulderPivot.add(shoulderPlate);

    const elbowPivot = new THREE.Group();
    elbowPivot.name = "ElbowPivot";
    elbowPivot.position.set(upperEnd[0], upperEnd[1], upperEnd[2]);
    shoulderPivot.add(elbowPivot);
    const elbowJoint = createFacetedEllipsoid(
      "ElbowJoint",
      [0.46, 0.37, 0.44],
      materials.fleshDark,
      descriptor.seed + variant * 19,
      reviewIndex,
      [0x3a0a10, 0x76242a],
      1,
    );
    elbowPivot.add(elbowJoint);
    const elbowCap = createFacetedEllipsoid(
      "ElbowBoneCap",
      [0.34, 0.2, 0.32],
      materials.boneDark,
      descriptor.seed + variant * 37,
      reviewIndex,
      [0x704039, 0x98705d],
      1,
    );
    elbowCap.position.y = 0.2;
    elbowPivot.add(elbowCap);
    elbowPivot.add(createTaperedSegment("FleshForearmCore", [0, 0, 0], forearmEnd, 0.36, 0.25, materials.fleshLimb, 8));

    if (reviewIndex >= 1) {
      // A broad bone sleeve gives the limb the armoured, weight-bearing read of
      // the concept.  It deliberately leaves red muscle visible at both joints.
      const plateStart = [forearmEnd[0] * 0.13, forearmEnd[1] * 0.13 + 0.08, forearmEnd[2] * 0.13];
      const plateEnd = [forearmEnd[0] * 0.78, forearmEnd[1] * 0.78 + 0.08, forearmEnd[2] * 0.78];
      elbowPivot.add(createTaperedSegment("ForearmBoneSleeve", plateStart, plateEnd, 0.31, 0.23, materials.boneClean, 7));
      const stainStart = [forearmEnd[0] * 0.31, forearmEnd[1] * 0.31 + 0.125, forearmEnd[2] * 0.31];
      const stainEnd = [forearmEnd[0] * 0.49, forearmEnd[1] * 0.49 + 0.125, forearmEnd[2] * 0.49];
      elbowPivot.add(createTaperedSegment("ForearmBloodBand", stainStart, stainEnd, 0.318, 0.275, materials.boneDark, 7));

      const wristPivot = new THREE.Group();
      wristPivot.name = "WristPivot";
      wristPivot.position.set(forearmEnd[0], forearmEnd[1], forearmEnd[2]);
      elbowPivot.add(wristPivot);
      const palmAngle = Math.atan2(forearmEnd[0], forearmEnd[2]);
      const wristJoint = createFacetedEllipsoid(
        "FleshyWristJoint",
        [0.34, 0.27, 0.33],
        materials.fleshDark,
        descriptor.seed + variant * 23,
        reviewIndex,
        [0x3a0a10, 0x76242a],
        1,
      );
      wristPivot.add(wristJoint);
      const palmPad = createFacetedEllipsoid(
        "FleshyPalmPad",
        [0.48, 0.16, 0.53],
        materials.fleshLimb,
        descriptor.seed + variant * 27,
        reviewIndex,
        [0x481018, 0x7f2a30],
        1,
      );
      palmPad.position.y = -0.06;
      palmPad.rotation.y = palmAngle;
      wristPivot.add(palmPad);
      const palmPlate = createFacetedEllipsoid(
        "BonePalmPlate",
        [0.43, 0.13, 0.48],
        materials.boneClean,
        descriptor.seed + variant * 29,
        reviewIndex,
        [0x8b6d4f, 0xd0b47f],
        1,
      );
      palmPlate.position.y = 0.1;
      palmPlate.rotation.y = palmAngle;
      wristPivot.add(palmPlate);

      const direction = new THREE.Vector3(forearmEnd[0], 0, forearmEnd[2]).normalize();
      const perpendicular = new THREE.Vector3(-direction.z, 0, direction.x);
      const fingerPivots = [];
      for (let finger = 0; finger < 4; finger += 1) {
        const fingerPivot = new THREE.Group();
        fingerPivot.name = `DigitPivot_${finger}`;
        const spread = (finger - 1.5) * 0.17;
        fingerPivot.position.set(
          direction.x * 0.27 + perpendicular.x * spread,
          0.005,
          direction.z * 0.27 + perpendicular.z * spread,
        );
        const lengthBias = finger === 0 || finger === 3 ? 0.86 : 1;
        const proximalEnd = [
          direction.x * (0.34 * lengthBias) + perpendicular.x * spread * 0.24,
          -0.045,
          direction.z * (0.34 * lengthBias) + perpendicular.z * spread * 0.24,
        ];
        const middleEnd = [
          proximalEnd[0] + direction.x * (0.25 * lengthBias) + perpendicular.x * spread * 0.18,
          -0.105,
          proximalEnd[2] + direction.z * (0.25 * lengthBias) + perpendicular.z * spread * 0.18,
        ];
        const clawEnd = [
          middleEnd[0] + direction.x * (0.24 * lengthBias) + perpendicular.x * spread * 0.12,
          -0.19,
          middleEnd[2] + direction.z * (0.24 * lengthBias) + perpendicular.z * spread * 0.12,
        ];
        fingerPivot.add(createTaperedSegment(`BoneDigitProximal_${finger}`, [0, 0, 0], proximalEnd, 0.105, 0.082, materials.boneClean, 6));
        fingerPivot.add(createTaperedSegment(`BoneDigitDistal_${finger}`, proximalEnd, middleEnd, 0.084, 0.058, materials.boneDark, 6));
        fingerPivot.add(createTaperedSegment(`ClawTip_${finger}`, middleEnd, clawEnd, 0.065, 0.012, materials.claw, 5));
        wristPivot.add(fingerPivot);
        fingerPivots.push(fingerPivot);
      }

      shoulderPivot.userData.rig = {
        shoulder: shoulderPivot,
        elbow: elbowPivot,
        wrist: wristPivot,
        fingers: fingerPivots,
        side,
        front,
        variant,
        phase: descriptor.seed * 0.17 + variant * Math.PI,
        restShoulderPosition: shoulderPivot.position.clone(),
        restShoulderRotation: shoulderPivot.rotation.clone(),
        restElbowRotation: elbowPivot.rotation.clone(),
        restWristRotation: wristPivot.rotation.clone(),
      };
    }
    shoulderPivot.userData.palmPosition = wrist;
    return shoulderPivot;
  }

  function createLocalCore(name, scale, materials, seed, reviewIndex) {
    const group = new THREE.Group();
    group.name = name;
    const socket = createFacetedEllipsoid(
      `${name}_Recess`,
      [scale * 1.3, scale * 1.3, scale * 0.34],
      materials.fleshDark,
      seed,
      reviewIndex,
      [0x160307, 0x35080d],
      1,
    );
    group.add(socket);
    const node = createFacetedEllipsoid(
      `${name}_Node`,
      [scale * 0.78, scale * 0.82, scale * 0.42],
      materials.organ,
      seed + 5,
      reviewIndex,
      [0x8b1820, 0xd4483d],
      1,
    );
    node.position.z = scale * 0.23;
    group.add(node);
    group.userData.pulseMesh = node;
    return group;
  }

  function createLobe(descriptor, materials, reviewIndex) {
    const pivot = new THREE.Group();
    pivot.name = `Quarter_${descriptor.id}`;
    pivot.userData.quarterId = descriptor.id;
    pivot.userData.animationSide = descriptor.side || 1;
    pivot.userData.animationFront = descriptor.front || 1;
    pivot.userData.animationPhase = descriptor.seed * 0.071;
    pivot.position.set(descriptor.x, descriptor.y, descriptor.z);
    pivot.rotation.set(0.012 * descriptor.front, -0.025 * descriptor.side, 0.035 * descriptor.side);
    const flesh = createFacetedEllipsoid(
      `FleshLobe_${descriptor.id}`,
      [descriptor.sx, descriptor.sy, descriptor.sz],
      materials.flesh,
      descriptor.seed,
      reviewIndex,
      [0x3a0b12, 0x7f2830],
      2,
    );
    carveCentralAtrium(flesh, descriptor);
    pivot.add(flesh);
    createCrustPlates(pivot, descriptor, materials, reviewIndex);
    if (reviewIndex >= 1) {
      const rearNode = descriptor.front < 0;
      const localCore = createLocalCore(`LocalCore_${descriptor.id}`, rearNode ? 0.4 : 0.43, materials, descriptor.seed + 9, reviewIndex);
      localCore.position.set(
        descriptor.side * descriptor.sx * (rearNode ? 0.46 : 0.32),
        rearNode ? descriptor.sy * 0.42 : descriptor.sy * 0.3,
        descriptor.sz * (rearNode ? 1.62 : 1.16),
      );
      localCore.rotation.x = rearNode ? -0.12 : -0.04;
      pivot.add(localCore);
      pivot.userData.heart = localCore;
      const armA = createSupportArm(descriptor, 0, materials, reviewIndex);
      const armB = createSupportArm(descriptor, 1, materials, reviewIndex);
      pivot.add(armA, armB);
      pivot.userData.arms = [armA, armB];
    }
    pivot.userData.flesh = flesh;
    pivot.userData.restPosition = pivot.position.clone();
    pivot.userData.restRotation = pivot.rotation.clone();
    return pivot;
  }

  function createRibCage(materials, reviewIndex, scale) {
    const group = new THREE.Group();
    group.name = "CentralRibCage";
    if (reviewIndex < 1) return group;
    const ribPivots = [];

    // Each rib is an independent, rooted prong.  The embedded base starts in
    // the wet cavity wall and the tapered free tip rises out of the body like
    // an opposing tooth.  Deliberately avoid any enclosing oval rail.
    for (let side = -1; side <= 1; side += 2) {
      for (let rib = 0; rib < 5; rib += 1) {
        const vertical = scale * (0.9 - rib * 0.45);
        const baseX = side * scale * (1.43 + Math.abs(2 - rib) * 0.045);
        const pivot = new THREE.Group();
        pivot.name = `CentralRibPivot_${side}_${rib}`;
        pivot.position.set(baseX, vertical, -0.08 * scale);
        const reach = scale * (0.88 + (2 - Math.abs(2 - rib)) * 0.055);
        const bend = -side;
        const p1 = [bend * reach * 0.38, -vertical * 0.035, 0.23 * scale];
        const p2 = [bend * reach * 0.72, -vertical * 0.075, 0.48 * scale];
        const p3 = [bend * reach, -vertical * 0.12, 0.67 * scale];
        pivot.add(createTaperedSegment(
          `CentralRib_${side}_${rib}`,
          [0, 0, 0],
          p1,
          scale * 0.14,
          scale * 0.105,
          materials.boneClean,
          7,
        ));
        pivot.add(createTaperedSegment(
          `RibMiddle_${side}_${rib}`,
          p1,
          p2,
          scale * 0.112,
          scale * 0.068,
          materials.boneClean,
          7,
        ));
        pivot.add(createTaperedSegment(
          `RibPoint_${side}_${rib}`,
          p2,
          p3,
          scale * 0.073,
          scale * 0.012,
          materials.boneClean,
          7,
        ));
        pivot.userData.side = side;
        pivot.userData.ribIndex = rib;
        pivot.userData.restRotation = pivot.rotation.clone();
        group.add(pivot);
        ribPivots.push(pivot);
      }
    }
    group.userData.ribPivots = ribPivots;
    return group;
  }

  function createHorn(name, side, materials, reviewIndex, scale) {
    const group = new THREE.Group();
    group.name = name;
    const points = [
      [side * 0.82 * scale, 0.52 * scale, 0.2 * scale],
      [side * 1.2 * scale, 0.65 * scale, 0.27 * scale],
      [side * 1.64 * scale, 0.92 * scale, 0.34 * scale],
      [side * 1.98 * scale, 1.31 * scale, 0.39 * scale],
      [side * 2.17 * scale, 1.7 * scale, 0.42 * scale],
      [side * 2.08 * scale, 2.04 * scale, 0.44 * scale],
    ];
    for (let index = 0; index < points.length - 1; index += 1) {
      const progress = index / (points.length - 1);
      group.add(createTaperedSegment(
        `${name}_Segment_${index}`,
        points[index],
        points[index + 1],
        scale * Math.max(0.055, 0.24 * (1 - progress * 0.86)),
        scale * Math.max(0.025, 0.2 * (1 - (progress + 0.18) * 0.94)),
        materials.boneClean,
        reviewIndex >= 2 ? 7 : 6,
      ));
    }
    return group;
  }

  function createSkullFaceplate(name, materials, scale) {
    const shape = new THREE.Shape();
    shape.moveTo(0, -1.23 * scale);
    shape.lineTo(-0.24 * scale, -1.1 * scale);
    shape.lineTo(-0.39 * scale, -0.72 * scale);
    shape.lineTo(-0.46 * scale, -0.24 * scale);
    shape.lineTo(-0.78 * scale, 0.02 * scale);
    shape.lineTo(-0.96 * scale, 0.42 * scale);
    shape.lineTo(-0.72 * scale, 0.78 * scale);
    shape.lineTo(-0.36 * scale, 0.98 * scale);
    shape.lineTo(0, 1.03 * scale);
    shape.lineTo(0.36 * scale, 0.98 * scale);
    shape.lineTo(0.72 * scale, 0.78 * scale);
    shape.lineTo(0.96 * scale, 0.42 * scale);
    shape.lineTo(0.78 * scale, 0.02 * scale);
    shape.lineTo(0.46 * scale, -0.24 * scale);
    shape.lineTo(0.39 * scale, -0.72 * scale);
    shape.lineTo(0.24 * scale, -1.1 * scale);
    shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: 0.28 * scale,
      bevelEnabled: true,
      bevelSegments: 1,
      bevelSize: 0.055 * scale,
      bevelThickness: 0.055 * scale,
      curveSegments: 2,
      steps: 1,
    });
    geometry.translate(0, 0, -0.14 * scale);
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, materials.boneClean);
    mesh.name = name;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  function createSkull(materials, reviewIndex, scale, fragmentSide) {
    const group = new THREE.Group();
    group.name = fragmentSide ? "SkullFragment" : "CattleSkullProw";
    const cranium = createFacetedEllipsoid("SkullCranium", [1.12 * scale, 0.72 * scale, 0.36 * scale], materials.boneClean, 131, reviewIndex, [0xb89b70, 0xd8bf93], 2);
    cranium.position.set(0, 0.34 * scale, -0.1 * scale);
    group.add(cranium);
    const faceplate = createSkullFaceplate("TaperedCattleFaceplate", materials, scale);
    faceplate.position.z = 0.19 * scale;
    faceplate.rotation.x = -0.035;
    group.add(faceplate);
    if (reviewIndex >= 1) {
      [-1, 1].forEach((side) => {
        const browPlate = createFacetedEllipsoid(
          `RaisedBrowPlate_${side}`,
          [0.48 * scale, 0.19 * scale, 0.12 * scale],
          materials.boneClean,
          143 + side,
          reviewIndex,
          [0xb89b70, 0xd8bf93],
          1,
        );
        browPlate.position.set(side * 0.39 * scale, 0.66 * scale, 0.35 * scale);
        browPlate.rotation.z = side * -0.2;
        group.add(browPlate);
      });
      group.add(createTaperedSegment(
        "RaisedNasalKeel",
        [0, 0.55 * scale, 0.42 * scale],
        [0, -0.66 * scale, 0.44 * scale],
        0.11 * scale,
        0.055 * scale,
        materials.boneDark,
        6,
      ));
    }
    const nasalWedge = createFacetedEllipsoid("BroadNasalWedge", [0.3 * scale, 0.64 * scale, 0.16 * scale], materials.boneClean, 149, reviewIndex, [0xb89b70, 0xd8bf93], 1);
    nasalWedge.position.set(fragmentSide ? fragmentSide * 0.04 * scale : 0, -0.44 * scale, 0.39 * scale);
    group.add(nasalWedge);
    const muzzleCap = createFacetedEllipsoid("BroadMuzzleCap", [0.33 * scale, 0.25 * scale, 0.17 * scale], materials.boneClean, 153, reviewIndex, [0xb89b70, 0xd8bf93], 1);
    muzzleCap.position.set(fragmentSide ? fragmentSide * 0.05 * scale : 0, -0.96 * scale, 0.4 * scale);
    group.add(muzzleCap);
    if (reviewIndex >= 1) {
      const visibleSides = fragmentSide ? [fragmentSide] : [-1, 1];
      visibleSides.forEach((side) => {
        const cheek = createFacetedEllipsoid(`CheekPlate_${side}`, [0.34 * scale, 0.32 * scale, 0.13 * scale], materials.boneClean, 157 + side, reviewIndex, [0xb89b70, 0xd8bf93], 1);
        cheek.position.set(side * 0.69 * scale, 0.13 * scale, 0.35 * scale);
        group.add(cheek);
        const socket = createFacetedEllipsoid(`EyeSocket_${side}`, [0.235 * scale, 0.185 * scale, 0.05 * scale], materials.socket, 163 + side, reviewIndex, [0x090304, 0x1b080b], 1);
        socket.position.set(side * 0.51 * scale, 0.4 * scale, 0.45 * scale);
        socket.rotation.z = side * -0.12;
        group.add(socket);
        group.add(createHorn(`Horn_${side}`, side, materials, reviewIndex, scale));
      });
      const nostrilSides = fragmentSide ? [fragmentSide] : [-1, 1];
      nostrilSides.forEach((side) => {
        const nasal = createFacetedEllipsoid(`NasalCavity_${side}`, [0.085 * scale, 0.16 * scale, 0.035 * scale], materials.socket, 173 + side, reviewIndex, [0x090304, 0x1b080b], 1);
        nasal.position.set(side * 0.105 * scale, -0.91 * scale, 0.45 * scale);
        nasal.rotation.z = side * 0.16;
        group.add(nasal);
      });
      const mouth = createFacetedEllipsoid("OpenMouthCavity", [0.27 * scale, 0.22 * scale, 0.045 * scale], materials.socket, 177, reviewIndex, [0x090304, 0x1b080b], 1);
      mouth.scale.x *= 1.28;
      mouth.scale.y *= 1.35;
      mouth.position.set(0, -1.13 * scale, 0.43 * scale);
      group.add(mouth);
      for (let tooth = 0; tooth < 4; tooth += 1) {
        const toothGeometry = new THREE.ConeGeometry(0.052 * scale, (0.18 + (tooth % 2) * 0.04) * scale, 4);
        const toothMesh = new THREE.Mesh(toothGeometry, materials.boneClean);
        toothMesh.name = `UpperTooth_${tooth}`;
        toothMesh.position.set((-0.18 + tooth * 0.12) * scale, -1.1 * scale, 0.5 * scale);
        toothMesh.rotation.z = Math.PI;
        toothMesh.castShadow = true;
        group.add(toothMesh);
      }
    }
    if (reviewIndex >= 1) {
      const jawPivot = new THREE.Group();
      jawPivot.name = "JawPivot";
      jawPivot.position.set(0, -1.08 * scale, 0.31 * scale);
      jawPivot.rotation.x = -0.08;
      const leftJaw = createFacetedEllipsoid("LeftMandible", [0.15 * scale, 0.4 * scale, 0.17 * scale], materials.boneClean, 181, reviewIndex, [0xb89b70, 0xd8bf93], 1);
      leftJaw.position.set(-0.31 * scale, -0.2 * scale, 0.04 * scale);
      leftJaw.rotation.z = -0.1;
      jawPivot.add(leftJaw);
      const rightJaw = createFacetedEllipsoid("RightMandible", [0.15 * scale, 0.4 * scale, 0.17 * scale], materials.boneClean, 183, reviewIndex, [0xb89b70, 0xd8bf93], 1);
      rightJaw.position.set(0.31 * scale, -0.2 * scale, 0.04 * scale);
      rightJaw.rotation.z = 0.1;
      jawPivot.add(rightJaw);
      const chin = createFacetedEllipsoid("MandibleChin", [0.4 * scale, 0.16 * scale, 0.19 * scale], materials.boneClean, 185, reviewIndex, [0xb89b70, 0xd8bf93], 1);
      chin.position.set(0, -0.5 * scale, 0.06 * scale);
      jawPivot.add(chin);
      const toothSides = fragmentSide ? [fragmentSide] : [-1, 1];
      toothSides.forEach((side) => {
        for (let tooth = 0; tooth < 3; tooth += 1) {
          if (!fragmentSide && side === 1 && tooth === 1) continue;
          const x = side * (0.09 + tooth * 0.075) * scale;
          const height = (0.16 + seeded(191 + side, tooth) * 0.09) * scale;
          const toothGeometry = new THREE.ConeGeometry(0.055 * scale, height, 4);
          const mesh = new THREE.Mesh(toothGeometry, materials.boneClean);
          mesh.name = `Tooth_${side}_${tooth}`;
          mesh.position.set(x, -0.01 * scale, 0.16 * scale + seeded(197, tooth) * 0.025);
          mesh.rotation.z = (seeded(199 + side, tooth) - 0.5) * 0.12;
          mesh.castShadow = true;
          jawPivot.add(mesh);
        }
      });
      group.add(jawPivot);
      jawPivot.userData.restRotation = jawPivot.rotation.clone();
      group.userData.jawPivot = jawPivot;
    }
    return group;
  }

  function createFissureSystem(layout, materials, reviewIndex, sizeClass) {
    const group = new THREE.Group();
    group.name = "FissureSystem";
    if (reviewIndex < 2) return group;
    if (sizeClass === "whole" || sizeClass === "half") {
      layout.forEach((descriptor, index) => {
        // Short, opaque grooves sit only on the camera-facing flesh shell. They
        // do not traverse a volume, join split planes, emit light, or touch the
        // clean heart/skull materials.
        const frontZ = descriptor.z + descriptor.sz * 0.96;
        const centerX = descriptor.x + descriptor.side * descriptor.sx * 0.28;
        const centerY = descriptor.y + descriptor.sy * (descriptor.front < 0 ? 0.28 : 0.36);
        const seam = createCurveTube(
          `ShallowFleshGroove_${index}`,
          [
            [centerX - descriptor.side * 0.34, centerY + 0.28, frontZ - 0.04],
            [centerX, centerY, frontZ + 0.035],
            [centerX + descriptor.side * 0.26, centerY - 0.22, frontZ - 0.015],
          ],
          0.022,
          materials.fissure,
          5,
          4,
        );
        group.add(seam);
      });
    } else {
      const wound = createFacetedEllipsoid("QuarterWound", [0.58, 0.68, 0.08], materials.fissure, 211, reviewIndex, [0x210307, 0x3a080c], 1);
      wound.position.set(-0.74, 0.2, -0.2);
      wound.rotation.y = -0.7;
      group.add(wound);
    }
    return group;
  }

  function addLateralRibs(root, layout, materials, reviewIndex) {
    const group = new THREE.Group();
    group.name = "LateralRibFragments";
    root.add(group);
    if (reviewIndex < 2) return group;
    layout.forEach((descriptor, layoutIndex) => {
      for (let rib = 0; rib < 2; rib += 1) {
        const side = descriptor.side || (layoutIndex % 2 ? 1 : -1);
        const x0 = descriptor.x + side * descriptor.sx * (0.52 + rib * 0.1);
        const z0 = descriptor.z + descriptor.sz * (0.24 - rib * 0.16);
        const points = [
          [x0, descriptor.y + descriptor.sy * (0.16 + rib * 0.2), z0],
          [x0 + side * 0.44, descriptor.y + descriptor.sy * (0.32 + rib * 0.15), z0 + 0.06],
          [x0 + side * (0.76 + rib * 0.07), descriptor.y + descriptor.sy * (0.42 + rib * 0.08), z0 - 0.12],
        ];
        group.add(createCurveTube(`SideRib_${layoutIndex}_${rib}`, points, 0.068 - rib * 0.007, materials.bone, 6, 4));
      }
    });
    return group;
  }

  function normalizeOptions(sizeClassOrOptions, splitIndex, extraOptions) {
    if (typeof sizeClassOrOptions === "object" && sizeClassOrOptions) {
      return Object.assign({}, sizeClassOrOptions);
    }
    return Object.assign({}, extraOptions || {}, {
      sizeClass: sizeClassOrOptions || "whole",
      splitIndex: Number.isFinite(splitIndex) ? splitIndex : 0,
    });
  }

  function* buildHordeheartModel(sizeClassOrOptions, splitIndex, extraOptions) {
    const options = normalizeOptions(sizeClassOrOptions, splitIndex, extraOptions);
    const sizeClass = QUARTER_LAYOUTS[options.sizeClass] ? options.sizeClass : "whole";
    const reviewPass = options.reviewPass || "interaction-pass";
    const reviewIndex = passIndex(reviewPass);
    const materials = createMaterials(reviewIndex);
    const root = new THREE.Group();
    root.name = `Hordeheart_${sizeClass}`;
    root.userData.isHordeheartModel = true;
    root.userData.modelVersion = 10;
    root.userData.sizeClass = sizeClass;
    root.userData.splitIndex = options.splitIndex || 0;
    root.userData.reviewPass = reviewPass;

    const bodyRoot = new THREE.Group();
    bodyRoot.name = "bodyRoot";
    root.add(bodyRoot);
    const halfLeft = new THREE.Group();
    halfLeft.name = "leftHalfRig";
    const halfRight = new THREE.Group();
    halfRight.name = "rightHalfRig";
    bodyRoot.add(halfLeft, halfRight);
    [halfLeft, halfRight].forEach((half) => {
      half.userData.restPosition = half.position.clone();
      half.userData.restRotation = half.rotation.clone();
      half.userData.restScale = half.scale.clone();
    });

    const instanceIndex = Math.max(0, Math.floor(Number(options.splitIndex) || 0));
    const instanceSide = instanceIndex % 2 === 0 ? -1 : 1;
    const instanceFront = instanceIndex < 2 ? -1 : 1;
    const layout = QUARTER_LAYOUTS[sizeClass].map((descriptor) => Object.assign({}, descriptor));
    if (sizeClass === "half") {
      layout.forEach((descriptor) => { descriptor.side = instanceSide; });
    } else if (sizeClass === "quarter") {
      layout[0].side = instanceSide;
      layout[0].front = instanceFront;
      layout[0].seed += instanceIndex * 17;
    }
    const quarters = [];
    const hearts = [];
    const arms = [];
    const splitAnchors = [];
    for (let index = 0; index < layout.length; index += 1) {
      const descriptor = layout[index];
      const lobe = createLobe(descriptor, materials, reviewIndex);
      const parent = sizeClass === "whole" && descriptor.side < 0 ? halfLeft : halfRight;
      parent.add(lobe);
      quarters.push(lobe);
      if (lobe.userData.heart) hearts.push(lobe.userData.heart);
      if (lobe.userData.arms) arms.push(...lobe.userData.arms);
      yield { stage: "lobe", index, count: layout.length, sizeClass };
    }

    if (sizeClass === "whole") {
      const targetHalfCenter = QUARTER_LAYOUTS.half.reduce((center, descriptor) => {
        center.x += descriptor.x / QUARTER_LAYOUTS.half.length;
        center.y += descriptor.y / QUARTER_LAYOUTS.half.length;
        center.z += descriptor.z / QUARTER_LAYOUTS.half.length;
        return center;
      }, { x: 0, y: 0, z: 0 });
      [-1, 1].forEach((side) => {
        const members = layout.filter((descriptor) => descriptor.side === side);
        const memberCount = Math.max(1, members.length);
        const anchor = new THREE.Object3D();
        anchor.name = side < 0 ? "LeftHalfSplitAnchor" : "RightHalfSplitAnchor";
        anchor.userData.fragmentIndex = side < 0 ? 0 : 1;
        anchor.userData.targetSplitIndex = side < 0 ? 0 : 1;
        anchor.userData.targetSizeClass = "half";
        anchor.position.set(
          members.reduce((sum, descriptor) => sum + descriptor.x, 0) / memberCount - targetHalfCenter.x,
          members.reduce((sum, descriptor) => sum + descriptor.y, 0) / memberCount - targetHalfCenter.y,
          members.reduce((sum, descriptor) => sum + descriptor.z, 0) / memberCount - targetHalfCenter.z,
        );
        (side < 0 ? halfLeft : halfRight).add(anchor);
        splitAnchors.push(anchor);
      });
    } else if (sizeClass === "half") {
      quarters.forEach((quarter, index) => {
        const side = quarter.userData.animationSide || instanceSide;
        const front = quarter.userData.animationFront || (index === 0 ? 1 : -1);
        const targetPivotPosition = new THREE.Vector3(0, QUARTER_LAYOUTS.quarter[0].y, 0);
        const targetPivotQuaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(
          0.012 * front,
          -0.025 * side,
          0.035 * side,
        ));
        const inverseTargetPivot = new THREE.Matrix4().compose(
          targetPivotPosition,
          targetPivotQuaternion,
          new THREE.Vector3(1, 1, 1),
        ).invert();
        const anchor = new THREE.Object3D();
        anchor.name = `QuarterSplitAnchor_${index}`;
        inverseTargetPivot.decompose(anchor.position, anchor.quaternion, anchor.scale);
        anchor.userData.fragmentIndex = index;
        anchor.userData.targetSplitIndex = side < 0
          ? (front > 0 ? 2 : 0)
          : (front > 0 ? 3 : 1);
        anchor.userData.targetSizeClass = "quarter";
        quarter.add(anchor);
        splitAnchors.push(anchor);
      });
    }

    // Close the front cleft without sacrificing the independent half rigs.
    // One overlapping muscle bridge belongs to each half, so the intact boss
    // reads as a single mound and the bridge still tears apart with split one.
    if (sizeClass === "whole") {
      [-1, 1].forEach((side, index) => {
        const bridge = createFacetedEllipsoid(
          `FrontBellyBridge_${side}`,
          [1.12, 1.16, 1.24],
          materials.flesh,
          241 + index * 13,
          reviewIndex,
          [0x3a0b12, 0x7f2830],
          2,
        );
        bridge.position.set(side * 0.5, 1.42, 1.34);
        bridge.rotation.set(side * 0.035, side * -0.08, side * 0.04);
        (side < 0 ? halfLeft : halfRight).add(bridge);

        const dorsalBridge = createFacetedEllipsoid(
          `DorsalMuscleBridge_${side}`,
          [1.2, 1.54, 1.32],
          materials.flesh,
          269 + index * 17,
          reviewIndex,
          [0x350910, 0x72242b],
          2,
        );
        dorsalBridge.position.set(side * 0.52, 2.72, 0.16);
        dorsalBridge.rotation.set(side * -0.04, side * 0.09, side * -0.035);
        (side < 0 ? halfLeft : halfRight).add(dorsalBridge);
      });
    }

    const fissures = createFissureSystem(layout, materials, reviewIndex, sizeClass);
    bodyRoot.add(fissures);
    yield { stage: "fissures", sizeClass };
    const lateralRibs = addLateralRibs(bodyRoot, layout, materials, reviewIndex);
    yield { stage: "lateral-ribs", sizeClass };
    [fissures, lateralRibs].forEach((detailGroup) => {
      detailGroup.userData.restPosition = detailGroup.position.clone();
      detailGroup.userData.restRotation = detailGroup.rotation.clone();
      detailGroup.userData.restScale = detailGroup.scale.clone();
    });

    let centralChestRig = null;
    let centralHeart = null;
    let ribCage = null;
    let skull = null;
    if (sizeClass === "whole") {
      if (reviewIndex >= 1) {
        centralChestRig = new THREE.Group();
        centralChestRig.name = "CentralDorsalChestRig";
        // The heart belongs in the middle of the mound, not perched on its
        // crown.  It sits above and behind the skull, with the rib teeth
        // breaking through the central flesh shelf.
        centralChestRig.position.set(0, 1.85, 0.18);
        centralChestRig.rotation.x = -Math.PI * 0.31;
        centralChestRig.userData.restPosition = centralChestRig.position.clone();
        centralChestRig.userData.restRotation = centralChestRig.rotation.clone();
        centralChestRig.userData.restScale = centralChestRig.scale.clone();

        const cavity = createFacetedEllipsoid("CentralHeartCavity", [1.78, 1.5, 0.3], materials.fleshDark, 223, reviewIndex, [0x160307, 0x3b0810], 1);
        cavity.position.z = 1.55;
        centralChestRig.add(cavity);
        centralHeart = createHeart("CentralHeart", 1.02, materials, 227, reviewIndex);
        centralHeart.position.z = 1.85;
        centralChestRig.add(centralHeart);
        hearts.push(centralHeart);
        ribCage = createRibCage(materials, reviewIndex, 1.04);
        ribCage.position.z = 2.05;
        centralChestRig.add(ribCage);
        bodyRoot.add(centralChestRig);
      }
      skull = createSkull(materials, reviewIndex, 1.14, 0);
      skull.position.set(0, 1.58, 3.34);
      skull.rotation.x = -0.035;
      bodyRoot.add(skull);
    } else if (reviewIndex >= 1) {
      const fragmentSide = instanceSide;
      skull = createSkull(materials, reviewIndex, sizeClass === "half" ? 0.68 : 0.48, fragmentSide);
      skull.position.set(fragmentSide * (sizeClass === "half" ? 0.35 : 0.28), sizeClass === "half" ? 1.42 : 1.22, sizeClass === "half" ? 2.28 : 1.7);
      skull.rotation.z = fragmentSide * 0.18;
      bodyRoot.add(skull);
    }

    if (skull) {
      skull.userData.restPosition = skull.position.clone();
      skull.userData.restRotation = skull.rotation.clone();
      skull.userData.restScale = skull.scale.clone();
    }
    yield { stage: "central-anatomy", sizeClass };

    const woundSockets = quarters.map((quarter, index) => {
      const socket = new THREE.Object3D();
      socket.name = `WoundSocket_${index}`;
      socket.position.set(quarter.position.x * 0.42, quarter.position.y, quarter.position.z * 0.42);
      bodyRoot.add(socket);
      return socket;
    });
    if (sizeClass === "quarter") {
      woundSockets.forEach((socket, index) => {
        socket.userData.fragmentIndex = index;
        socket.userData.targetSizeClass = "debris";
        splitAnchors.push(socket);
      });
    }

    const modelScale = Number.isFinite(options.scale) ? options.scale : 1;
    root.scale.setScalar(modelScale);
    root.userData.hordeheartParts = {
      bodyRoot,
      halfGroups: [halfLeft, halfRight],
      quarterGroups: quarters,
      hearts,
      arms,
      skull,
      jawPivot: skull && skull.userData.jawPivot ? skull.userData.jawPivot : null,
      centralChestRig,
      ribCage,
      ribPivots: ribCage && ribCage.userData.ribPivots ? ribCage.userData.ribPivots : [],
      armRigs: arms.map((arm) => arm.userData.rig).filter(Boolean),
      fissures,
      lateralRibs,
      splitDetailGroups: [fissures, lateralRibs],
      woundSockets,
      splitAnchors,
      materials,
      colliders: quarters.map((quarter, index) => ({
        id: `quarter-${index}`,
        localCenter: quarter.position.clone(),
        radius: Math.max(layout[index].sx, layout[index].sz) * 0.86,
      })),
      destructionGroups: {
        whole: ["leftHalfRig", "rightHalfRig"],
        halves: quarters.map((quarter) => quarter.name),
        final: woundSockets.map((socket) => socket.name),
      },
      splitPreviewAmount: 0,
      splitPreviewAxis: "",
      splitPreviewPull: 0,
      splitPreviewTear: 0,
      splitPreviewSettle: 0,
      animationRuntime: {
        wasDowned: false,
        downedStartedAt: 0,
      },
    };

    function applyStoredSplitPose(resetTransforms) {
      const parts = root.userData.hordeheartParts;
      const pull = parts.splitPreviewPull;
      const tear = parts.splitPreviewTear;
      const settle = parts.splitPreviewSettle;
      const amount = parts.splitPreviewAmount;
      const shudder = dampedWave(amount, 0.18, 5, 1.7);
      if (sizeClass === "whole") {
        parts.halfGroups.forEach((half, index) => {
          const side = index === 0 ? -1 : 1;
          if (resetTransforms) {
            half.position.copy(half.userData.restPosition);
            half.rotation.copy(half.userData.restRotation);
            half.scale.copy(half.userData.restScale);
          }
          half.position.x += side * (tear * 1.56 - pull * 0.18);
          half.position.y += Math.sin(tear * Math.PI) * (0.28 + index * 0.055) - settle * (0.035 + index * 0.025);
          half.position.z += -side * tear * 0.16 + shudder * 0.045;
          half.rotation.x += side * tear * 0.055 + shudder * 0.025;
          half.rotation.y += side * (tear * 0.16 + shudder * 0.04);
          half.rotation.z += -side * (tear * 0.245 + shudder * 0.055);
          half.scale.set(
            half.userData.restScale.x * (1 + pull * 0.035 - tear * 0.018),
            half.userData.restScale.y * (1 - pull * 0.06 + tear * 0.025),
            half.userData.restScale.z * (1 + pull * 0.025),
          );
        });
      } else if (sizeClass === "half") {
        parts.quarterGroups.forEach((quarter, index) => {
          const direction = index === 0 ? 1 : -1;
          if (resetTransforms) {
            quarter.position.copy(quarter.userData.restPosition);
            quarter.rotation.copy(quarter.userData.restRotation);
            quarter.scale.set(1, 1, 1);
          }
          quarter.position.z += direction * (tear * 1.46 - pull * 0.16);
          quarter.position.x += instanceSide * direction * tear * 0.14;
          quarter.position.y += Math.sin(tear * Math.PI) * (0.24 + index * 0.07) - settle * (0.055 + index * 0.035);
          quarter.rotation.x += direction * (tear * 0.24 + shudder * 0.05);
          quarter.rotation.y += instanceSide * direction * (tear * 0.11 + shudder * 0.035);
          quarter.rotation.z += -instanceSide * direction * tear * 0.13;
          quarter.scale.x *= 1 + pull * 0.025;
          quarter.scale.y *= 1 - pull * 0.055 + tear * 0.018;
          quarter.scale.z *= 1 + pull * 0.045;
        });
      }
    }

    root.userData.animationStates = [
      "idle", "crawl", "fleshTide", "ribBloom", "systole", "pincer", "rush",
      "arterialSweep", "carrionNest", "downed", "split", "defeated",
    ];
    root.userData.animate = function animateHordeheart(timeSeconds, state) {
      const parts = root.userData.hordeheartParts;
      const phase = state || {};
      const action = String(phase.action || "idle");
      const actionProgress = clamp(Number(phase.actionProgress) || 0, 0, 1);
      const requestedMoveAmount = Number(phase.moveAmount);
      const moveAmount = clamp(
        Number.isFinite(requestedMoveAmount) ? requestedMoveAmount : action === "crawl" ? 1 : 0,
        0,
        1,
      );
      const isFleshTide = action === "fleshTide";
      const isRibBloom = action === "ribBloom";
      const isSystole = action === "systole";
      const isPincer = action === "pincer";
      const isRush = action === "rush";
      const isArterialSweep = action === "arterialSweep";
      const isCarrionNest = action === "carrionNest";
      const isAttack = isFleshTide || isRibBloom || isSystole || isPincer || isRush
        || isArterialSweep || isCarrionNest;
      const isDowned = Boolean(phase.downed) || action === "downed" || action === "defeated";
      const runtime = parts.animationRuntime;
      if (isDowned && !runtime.wasDowned) runtime.downedStartedAt = timeSeconds;
      runtime.wasDowned = isDowned;
      const downedElapsed = isDowned ? Math.max(0, timeSeconds - runtime.downedStartedAt) : 0;
      const suppliedDecay = Number(phase.decayProgress);
      const hasSuppliedDecay = isDowned && Number.isFinite(suppliedDecay);
      const decayProgress = isDowned
        ? (hasSuppliedDecay ? clamp(suppliedDecay, 0, 1) : smootherstep01(downedElapsed / 1.35))
        : 0;
      const collapse = smootherstep01(decayProgress / 0.46);
      const lateDecay = smootherstep01((decayProgress - 0.42) / 0.58);
      const deathKick = isDowned
        ? (hasSuppliedDecay
          ? smoothWindow(decayProgress, 0.004, 0.055, 0.19)
          : smoothWindow(downedElapsed, 0.015, 0.13, 0.48))
        : 0;
      const deathTremor = isDowned
        ? Math.sin(decayProgress * 48 + instanceIndex) * Math.pow(1 - decayProgress, 2.4)
        : 0;
      const windup = isAttack ? smootherstep01(actionProgress / 0.48) : 0;
      const release = isAttack ? smootherstep01((actionProgress - 0.48) / 0.2) : 0;
      const recovery = isAttack ? smootherstep01((actionProgress - 0.72) / 0.28) : 0;
      const anticipation = windup * (1 - release);
      const drive = release * (1 - recovery);
      const impact = isAttack ? smoothWindow(actionProgress, 0.565, 0.68, 0.825) : 0;
      const recoil = isAttack ? dampedWave(actionProgress, 0.68, 3.2, 1.45) : 0;
      // Fragment attacks use their own silhouettes instead of inheriting the
      // forward body-slam timing.  Both envelopes return exactly to rest at 1,
      // which keeps snapshot-driven action changes free from pose pops.
      const arterialBrace = isArterialSweep ? smoothWindow(actionProgress, 0, 0.34, 0.55) : 0;
      const arterialTension = isArterialSweep
        ? smootherstep01(actionProgress / 0.32)
          * (1 - smootherstep01((actionProgress - 0.76) / 0.24))
        : 0;
      const arterialDrag = isArterialSweep ? smoothWindow(actionProgress, 0.38, 0.59, 0.86) : 0;
      const arterialSnap = isArterialSweep ? smoothWindow(actionProgress, 0.51, 0.61, 0.76) : 0;
      const arterialRecoil = isArterialSweep ? dampedWave(actionProgress, 0.61, 2.6, 1.75) : 0;
      const carrionGather = isCarrionNest ? smoothWindow(actionProgress, 0, 0.37, 0.56) : 0;
      const carrionHold = isCarrionNest
        ? smootherstep01(actionProgress / 0.27)
          * (1 - smootherstep01((actionProgress - 0.5) / 0.15))
        : 0;
      const carrionThrow = isCarrionNest ? smoothWindow(actionProgress, 0.4, 0.58, 0.79) : 0;
      const carrionRelease = isCarrionNest ? smoothWindow(actionProgress, 0.51, 0.595, 0.72) : 0;
      const carrionRecoil = isCarrionNest ? dampedWave(actionProgress, 0.59, 2.4, 1.8) : 0;
      // Rib Bloom is a visible one-two rupture: the first cardinal wave lands
      // at .58, the rotated second wave at .80, matching gameplay exactly.
      const ribFirstBeat = isRibBloom ? smoothWindow(actionProgress, 0.47, 0.58, 0.69) : 0;
      const ribSecondBeat = isRibBloom ? smoothWindow(actionProgress, 0.7, 0.8, 0.93) : 0;
      const ribDualBeat = ribFirstBeat + ribSecondBeat * 0.9;
      const systole = isSystole ? anticipation * 0.4 + drive : 0;
      const livingFactor = isDowned ? 1 - smootherstep01(decayProgress / 0.105) : 1;
      const pulse = (0.5 + 0.5 * Math.sin(timeSeconds * (phase.enraged ? 5.8 : 3.7))) * livingFactor;
      const idleBreath = Math.sin(timeSeconds * 1.28 + instanceIndex * 0.37) * livingFactor;
      const idleSway = Math.sin(timeSeconds * 0.61 + instanceIndex * 0.83) * livingFactor;
      const requestedGaitPhase = Number(phase.gaitPhase);
      const legacyMovePhase = Number(phase.movePhase);
      const gaitClock = Number.isFinite(requestedGaitPhase)
        ? requestedGaitPhase
        : Number.isFinite(legacyMovePhase)
          ? legacyMovePhase
        : timeSeconds * (phase.enraged ? 5.65 : 4.35);
      const gaitSin = Math.sin(gaitClock);
      const attackLocomotionBlend = isAttack
        ? 1 - smoothstep01(actionProgress / 0.16) * 0.88
        : 1;
      const activeMove = isDowned ? 0 : moveAmount * attackLocomotionBlend;
      const fragmentCrawler = sizeClass === "half" || sizeClass === "quarter";
      // The host advances fragment bodies with this same positive-sine burst.
      // Negative sine is the long reach/plant, positive sine is the short haul,
      // and the back of the cycle gives the mass a soft post-pull settle.
      const pullDrive = fragmentCrawler
        ? Math.pow(Math.max(0, gaitSin), 4) * activeMove : 0;
      const pullReach = fragmentCrawler
        ? Math.pow(Math.max(0, -gaitSin), 2) * activeMove : 0;
      const pullSettle = fragmentCrawler
        ? Math.pow(Math.max(0, -Math.cos(gaitClock)), 4) * activeMove : 0;
      const fragmentPullScale = sizeClass === "quarter" ? 1.12 : 1;

      parts.bodyRoot.position.set(
        idleSway * 0.012,
        0.015 + idleBreath * 0.018,
        Math.sin(timeSeconds * 0.47 + 1.2) * 0.012 * livingFactor,
      );
      parts.bodyRoot.rotation.set(
        Math.sin(timeSeconds * 0.73) * 0.006 * livingFactor,
        idleSway * 0.012,
        Math.cos(timeSeconds * 0.57 + 0.4) * 0.008 * livingFactor,
      );
      parts.bodyRoot.scale.set(
        1 + idleBreath * 0.009,
        1 + idleBreath * 0.017,
        1 + idleBreath * 0.011,
      );
      parts.bodyRoot.position.x += Math.sin(gaitClock * 0.5) * activeMove * 0.035;
      parts.bodyRoot.position.y += (0.025 + Math.abs(gaitSin) * 0.045) * activeMove;
      parts.bodyRoot.position.z += Math.cos(gaitClock) * activeMove * 0.022;
      parts.bodyRoot.rotation.x += (-0.035 + Math.cos(gaitClock) * 0.022) * activeMove;
      parts.bodyRoot.rotation.y += Math.sin(gaitClock * 0.5) * activeMove * 0.032;
      parts.bodyRoot.rotation.z += gaitSin * activeMove * 0.018;

      if (fragmentCrawler) {
        // Reach back, catch the floor, then snap the actual surviving mass to
        // the claws. The settle is deliberately broad and low so the motion
        // reads as weight rather than a looping hop.
        parts.bodyRoot.position.x += instanceSide
          * (pullReach * 0.035 - pullDrive * 0.052) * fragmentPullScale;
        parts.bodyRoot.position.y += (-pullReach * 0.035 + pullDrive * 0.115 - pullSettle * 0.028)
          * fragmentPullScale;
        parts.bodyRoot.position.z += (-pullReach * 0.16 + pullDrive * 0.42 + pullSettle * 0.045)
          * fragmentPullScale;
        parts.bodyRoot.rotation.x += (pullReach * 0.13 - pullDrive * 0.2 + pullSettle * 0.055)
          * fragmentPullScale;
        parts.bodyRoot.rotation.y += instanceSide * (pullReach * -0.035 + pullDrive * 0.06)
          * fragmentPullScale;
        parts.bodyRoot.rotation.z += instanceSide * (pullReach * 0.032 - pullDrive * 0.052)
          * fragmentPullScale;
        parts.bodyRoot.scale.x *= 1 + pullReach * 0.045 - pullDrive * 0.018 + pullSettle * 0.04;
        parts.bodyRoot.scale.y *= 1 - pullReach * 0.065 + pullDrive * 0.055 - pullSettle * 0.075;
        parts.bodyRoot.scale.z *= 1 + pullReach * 0.105 - pullDrive * 0.055 + pullSettle * 0.035;
      }

      if (isFleshTide) {
        parts.bodyRoot.position.z += -anticipation * 0.64 + drive * 1.78 + recoil * 0.12;
        parts.bodyRoot.position.y += -anticipation * 0.18 + impact * 0.2;
        parts.bodyRoot.position.x += Math.sin(actionProgress * Math.PI) * 0.06;
        parts.bodyRoot.rotation.x += anticipation * 0.13 - drive * 0.2 + recoil * 0.035;
        parts.bodyRoot.rotation.y += anticipation * -0.055 + drive * 0.075;
        parts.bodyRoot.scale.x *= 1 + anticipation * 0.09 + impact * 0.06;
        parts.bodyRoot.scale.y *= 1 - anticipation * 0.13 - impact * 0.075;
        parts.bodyRoot.scale.z *= 1 - anticipation * 0.07 + drive * 0.19;
      } else if (isPincer) {
        parts.bodyRoot.position.z += -anticipation * 0.42 + drive * 1.48;
        parts.bodyRoot.position.x += instanceSide * (anticipation * 0.25 - drive * 0.14);
        parts.bodyRoot.position.y += -anticipation * 0.09 + impact * 0.14;
        parts.bodyRoot.rotation.x += anticipation * 0.07 - drive * 0.12;
        parts.bodyRoot.rotation.y += instanceSide * (anticipation * 0.28 - drive * 0.36 + recoil * 0.055);
        parts.bodyRoot.rotation.z += instanceSide * (anticipation * 0.11 - drive * 0.15);
        parts.bodyRoot.scale.x *= 1 - anticipation * 0.07 + impact * 0.12;
        parts.bodyRoot.scale.y *= 1 - impact * 0.08;
        parts.bodyRoot.scale.z *= 1 + drive * 0.12;
      } else if (isArterialSweep) {
        // Each half first digs its claws in and leans away from its sibling,
        // visibly drawing the artery taut.  The planted mass then whips
        // sideways in one low, heavy pull instead of floating through the arc.
        parts.bodyRoot.position.x += instanceSide
          * (-arterialBrace * 0.46 + arterialDrag * 1.34 + arterialRecoil * 0.12);
        parts.bodyRoot.position.y += -arterialBrace * 0.17 - arterialSnap * 0.075
          + Math.max(0, arterialRecoil) * 0.055;
        parts.bodyRoot.position.z += -arterialBrace * 0.28 + arterialDrag * 0.2;
        parts.bodyRoot.rotation.x += arterialBrace * 0.09 - arterialDrag * 0.075;
        parts.bodyRoot.rotation.y += instanceSide
          * (-arterialBrace * 0.24 + arterialDrag * 0.38 + arterialRecoil * 0.045);
        parts.bodyRoot.rotation.z += instanceSide
          * (arterialBrace * 0.2 - arterialDrag * 0.31 + arterialRecoil * 0.075);
        parts.bodyRoot.scale.x *= 1 + arterialTension * 0.12 + arterialSnap * 0.055;
        parts.bodyRoot.scale.y *= 1 - arterialBrace * 0.13 - arterialSnap * 0.07;
        parts.bodyRoot.scale.z *= 1 + arterialBrace * 0.055 - arterialDrag * 0.045;
      } else if (isCarrionNest) {
        // A quarter folds around the payload, snaps open at release and lets
        // the rearward recoil travel through the whole surviving chunk.
        parts.bodyRoot.position.z += -carrionGather * 0.62 + carrionThrow * 1.32
          - carrionRecoil * 0.13;
        parts.bodyRoot.position.y += -carrionGather * 0.22 + carrionRelease * 0.2
          + Math.max(0, carrionRecoil) * 0.035;
        parts.bodyRoot.position.x += instanceSide
          * (carrionGather * 0.12 - carrionThrow * 0.075 + carrionRecoil * 0.05);
        parts.bodyRoot.rotation.x += carrionGather * 0.27 - carrionThrow * 0.38
          + carrionRecoil * 0.075;
        parts.bodyRoot.rotation.y += instanceSide
          * (carrionGather * 0.16 - carrionThrow * 0.19);
        parts.bodyRoot.rotation.z += instanceSide
          * (carrionGather * 0.15 - carrionRelease * 0.18 + carrionRecoil * 0.055);
        parts.bodyRoot.scale.x *= 1 + carrionGather * 0.105 - carrionRelease * 0.055;
        parts.bodyRoot.scale.y *= 1 - carrionGather * 0.16 + carrionRelease * 0.09;
        parts.bodyRoot.scale.z *= 1 - carrionGather * 0.11 + carrionThrow * 0.2;
      } else if (isRush) {
        parts.bodyRoot.position.z += -anticipation * 0.78 + drive * 2.12 + recoil * 0.16;
        parts.bodyRoot.position.y += -anticipation * 0.22 + impact * 0.17;
        parts.bodyRoot.position.x += instanceSide * (anticipation * 0.06 + recoil * 0.055);
        parts.bodyRoot.rotation.x += anticipation * 0.18 - drive * 0.3 + recoil * 0.055;
        parts.bodyRoot.rotation.y += instanceSide * (anticipation * -0.07 + drive * 0.055);
        parts.bodyRoot.rotation.z += instanceSide * recoil * 0.065;
        parts.bodyRoot.scale.x *= 1 - anticipation * 0.1 + impact * 0.035;
        parts.bodyRoot.scale.y *= 1 - anticipation * 0.14 - impact * 0.09;
        parts.bodyRoot.scale.z *= 1 + anticipation * 0.04 + drive * 0.25;
      } else if (isRibBloom) {
        parts.bodyRoot.position.y += -anticipation * 0.3 + ribDualBeat * 0.28 + recoil * 0.035;
        parts.bodyRoot.position.z += anticipation * -0.08 + ribDualBeat * 0.09;
        parts.bodyRoot.rotation.x += anticipation * 0.09 - ribDualBeat * 0.12;
        parts.bodyRoot.rotation.z += (ribFirstBeat - ribSecondBeat) * 0.026 + recoil * 0.018;
        parts.bodyRoot.scale.x *= 1 - anticipation * 0.08 + ribDualBeat * 0.16;
        parts.bodyRoot.scale.y *= 1 - anticipation * 0.1 + ribDualBeat * 0.07;
        parts.bodyRoot.scale.z *= 1 - anticipation * 0.06 + ribDualBeat * 0.15;
      } else if (isSystole) {
        const secondaryBeat = smoothWindow(actionProgress, 0.18, 0.28, 0.41);
        parts.bodyRoot.position.y += -anticipation * 0.2 + impact * 0.26 + secondaryBeat * 0.035;
        parts.bodyRoot.position.z += anticipation * -0.11 + drive * 0.12;
        parts.bodyRoot.rotation.x += anticipation * -0.035 + drive * 0.075;
        parts.bodyRoot.rotation.z += instanceSide * (anticipation * 0.025 - recoil * 0.04);
        parts.bodyRoot.scale.x *= 1 - anticipation * 0.13 + drive * 0.23 + secondaryBeat * 0.025;
        parts.bodyRoot.scale.y *= 1 + anticipation * 0.1 - drive * 0.15;
        parts.bodyRoot.scale.z *= 1 - anticipation * 0.13 + drive * 0.23 + secondaryBeat * 0.025;
      }

      if (isDowned) {
        // Collapse into the planted mass instead of pitching the whole corpse
        // onto its side.  Vertical offsets stay shallow so even the wider half
        // rig remains above the ground plane throughout the decay.
        parts.bodyRoot.position.x += instanceSide * collapse * 0.06;
        // The lobes flatten below their former center as they deflate. Lift
        // that shrinking center just enough to keep the planted underside on
        // the same floor plane instead of letting the compressed mesh sink.
        parts.bodyRoot.position.y += -collapse * 0.08 - lateDecay * 0.025 + deathKick * 0.06;
        parts.bodyRoot.position.z += collapse * 0.08 + lateDecay * 0.025;
        parts.bodyRoot.rotation.x += collapse * 0.045 - deathKick * 0.035;
        parts.bodyRoot.rotation.y += instanceSide * collapse * 0.035 + deathTremor * 0.012;
        parts.bodyRoot.rotation.z += instanceSide * collapse * 0.04 + deathTremor * 0.016;
        parts.bodyRoot.scale.x *= 1 + collapse * 0.075 + lateDecay * 0.035;
        parts.bodyRoot.scale.y *= 1 - collapse * 0.15 - lateDecay * 0.05;
        parts.bodyRoot.scale.z *= 1 + collapse * 0.045 + lateDecay * 0.025;
      }

      parts.quarterGroups.forEach((quarter, index) => {
        const restPosition = quarter.userData.restPosition;
        const restRotation = quarter.userData.restRotation;
        if (restPosition) quarter.position.copy(restPosition);
        if (restRotation) quarter.rotation.copy(restRotation);
        const side = quarter.userData.animationSide || (index % 2 ? 1 : -1);
        const front = quarter.userData.animationFront || (index < 2 ? 1 : -1);
        const localPhase = quarter.userData.animationPhase || index * 1.37;
        const cycle = gaitClock + localPhase + front * 0.42;
        const stride = Math.sin(cycle);
        const crawlLift = Math.max(0, Math.sin(cycle + side * 0.42)) * activeMove;
        const localBreath = Math.sin(timeSeconds * 1.31 + localPhase) * livingFactor;
        let scaleX = 1 + localBreath * 0.018 + idleBreath * 0.007;
        let scaleY = 1 + localBreath * 0.03;
        let scaleZ = 1 + localBreath * 0.021 - idleBreath * 0.004;
        quarter.position.y += crawlLift * (front > 0 ? 0.105 : 0.075);
        quarter.position.z += stride * activeMove * 0.045 * front;
        quarter.position.x += side * Math.cos(cycle) * activeMove * 0.026;
        quarter.rotation.x += stride * activeMove * 0.022 * front;
        quarter.rotation.y += stride * activeMove * 0.042 + side * crawlLift * 0.018;
        quarter.rotation.z += side * Math.cos(cycle) * activeMove * 0.032;

        if (fragmentCrawler) {
          const lobeTraction = (front > 0 ? 1 : 0.86) * fragmentPullScale;
          quarter.position.x += side * (pullReach * 0.045 - pullDrive * 0.065) * lobeTraction;
          quarter.position.y += (-pullReach * 0.028 + pullDrive * 0.065 - pullSettle * 0.035) * lobeTraction;
          quarter.position.z += (pullReach * 0.055 - pullDrive * 0.09) * lobeTraction;
          quarter.rotation.x += front * (pullReach * 0.055 - pullDrive * 0.09 + pullSettle * 0.025)
            * lobeTraction;
          quarter.rotation.y += side * (pullReach * -0.045 + pullDrive * 0.075) * lobeTraction;
          quarter.rotation.z += side * (pullReach * 0.048 - pullDrive * 0.082) * lobeTraction;
          scaleX *= 1 + pullReach * 0.025 + pullSettle * 0.025;
          scaleY *= 1 - pullReach * 0.035 + pullDrive * 0.04 - pullSettle * 0.055;
          scaleZ *= 1 + pullReach * 0.06 - pullDrive * 0.035 + pullSettle * 0.02;
        }

        if (isFleshTide) {
          const delay = front > 0 ? 0.035 : 0;
          const tideWave = smoothWindow(actionProgress, 0.34 + delay, 0.66 + delay, 0.97);
          quarter.position.z += tideWave * (front > 0 ? 0.34 : 0.22);
          quarter.position.y += -anticipation * (front > 0 ? 0.08 : 0.15) + tideWave * 0.09;
          quarter.position.x += side * tideWave * 0.075;
          quarter.rotation.x += anticipation * front * 0.06 - tideWave * front * 0.1;
          quarter.rotation.y += side * (anticipation * -0.035 + tideWave * 0.065);
          quarter.rotation.z += side * tideWave * 0.035;
          scaleX *= 1 + tideWave * 0.065;
          scaleY *= 1 - anticipation * 0.07 - tideWave * 0.04;
          scaleZ *= 1 - anticipation * 0.055 + tideWave * 0.13;
        } else if (isRibBloom) {
          const bloomAsymmetry = 0.9 + ((index + (side > 0 ? 1 : 0)) % 3) * 0.055;
          quarter.position.x += side * drive * 0.13 * bloomAsymmetry;
          quarter.position.z += front * drive * 0.1 * bloomAsymmetry;
          quarter.position.y += -anticipation * 0.08 + drive * (front > 0 ? 0.12 : 0.075);
          quarter.rotation.x += -front * anticipation * 0.045 + front * drive * 0.07;
          quarter.rotation.z += side * (anticipation * -0.045 + drive * 0.08);
          scaleX *= 1 - anticipation * 0.055 + drive * 0.1;
          scaleY *= 1 - anticipation * 0.07 + drive * 0.055;
          scaleZ *= 1 - anticipation * 0.045 + drive * 0.095;
        } else if (isSystole) {
          const organKick = smoothWindow(actionProgress, 0.19 + index * 0.008, 0.29 + index * 0.008, 0.43);
          quarter.position.x += side * (drive * 0.16 + organKick * 0.025);
          quarter.position.z += front * (drive * 0.14 + organKick * 0.02);
          quarter.position.y += anticipation * 0.065 - drive * 0.045;
          quarter.rotation.z += side * (-anticipation * 0.055 + drive * 0.085);
          scaleX *= 1 - anticipation * 0.095 + drive * 0.145 + organKick * 0.018;
          scaleY *= 1 + anticipation * 0.075 - drive * 0.09;
          scaleZ *= 1 - anticipation * 0.095 + drive * 0.145 + organKick * 0.018;
        } else if (isPincer) {
          const hinge = front > 0 ? 1 : -0.72;
          quarter.position.x += instanceSide * (anticipation * 0.1 - drive * 0.08) * hinge;
          quarter.position.z += drive * (front > 0 ? 0.2 : 0.1);
          quarter.position.y += drive * (front > 0 ? 0.08 : 0.035);
          quarter.rotation.y += instanceSide * (anticipation * 0.1 - drive * 0.16) * hinge;
          quarter.rotation.z += instanceSide * (anticipation * 0.06 - drive * 0.095);
          scaleX *= 1 - anticipation * 0.045 + drive * 0.075;
          scaleY *= 1 - drive * 0.055;
          scaleZ *= 1 + drive * (front > 0 ? 0.13 : 0.08);
        } else if (isArterialSweep) {
          const tetherHinge = front > 0 ? 1 : 0.82;
          const delayedDrag = smoothWindow(
            actionProgress,
            0.38 + (front > 0 ? 0 : 0.025),
            0.59 + (front > 0 ? 0 : 0.018),
            0.86,
          );
          quarter.position.x += instanceSide
            * (-arterialBrace * 0.12 + delayedDrag * 0.27) * tetherHinge;
          quarter.position.y += -arterialBrace * (front > 0 ? 0.075 : 0.11)
            + arterialSnap * (front > 0 ? 0.035 : 0.055);
          quarter.position.z += front * (arterialBrace * -0.08 + delayedDrag * 0.1);
          quarter.rotation.x += front * (arterialBrace * 0.075 - delayedDrag * 0.11);
          quarter.rotation.y += instanceSide
            * (-arterialBrace * 0.12 + delayedDrag * 0.2) * tetherHinge;
          quarter.rotation.z += instanceSide
            * (arterialBrace * 0.115 - delayedDrag * 0.17 + arterialRecoil * 0.035);
          scaleX *= 1 + arterialTension * 0.07 + arterialSnap * 0.035;
          scaleY *= 1 - arterialBrace * 0.075 - arterialSnap * 0.04;
          scaleZ *= 1 + arterialBrace * 0.04 - delayedDrag * 0.035;
        } else if (isCarrionNest) {
          const fleshBundle = smoothWindow(actionProgress, 0.16, 0.37, 0.61);
          quarter.position.z += -carrionGather * 0.18 + carrionThrow * 0.31;
          quarter.position.y += -carrionGather * 0.1 + carrionRelease * 0.11;
          quarter.position.x += instanceSide
            * (fleshBundle * 0.09 - carrionRelease * 0.075 + carrionRecoil * 0.025);
          quarter.rotation.x += carrionGather * 0.14 - carrionThrow * 0.21
            + carrionRecoil * 0.035;
          quarter.rotation.y += instanceSide * (carrionGather * 0.11 - carrionThrow * 0.14);
          quarter.rotation.z += instanceSide
            * (fleshBundle * 0.13 - carrionRelease * 0.16 + carrionRecoil * 0.04);
          scaleX *= 1 + fleshBundle * 0.12 - carrionRelease * 0.06;
          scaleY *= 1 - carrionGather * 0.13 + carrionRelease * 0.09;
          scaleZ *= 1 - carrionGather * 0.09 + carrionThrow * 0.16;
        } else if (isRush) {
          const lead = front > 0 ? 1 : 0.76;
          quarter.position.z += drive * 0.28 * lead - anticipation * 0.1 * front;
          quarter.position.y += -anticipation * 0.1 + impact * 0.09 * lead;
          quarter.position.x += side * recoil * 0.055;
          quarter.rotation.x += anticipation * 0.07 - drive * 0.14 * lead;
          quarter.rotation.z += side * recoil * 0.045;
          scaleX *= 1 - anticipation * 0.065 + impact * 0.025;
          scaleY *= 1 - anticipation * 0.09 - impact * 0.045;
          scaleZ *= 1 + drive * 0.17 * lead;
        }

        if (isDowned) {
          const fallBias = 0.82 + seeded(instanceIndex + 331, index) * 0.34;
          quarter.position.x += side * (collapse * 0.18 + lateDecay * 0.07) * fallBias;
          quarter.position.z += front * (collapse * 0.12 + lateDecay * 0.055) * fallBias;
          quarter.position.y += -collapse * (0.045 + index * 0.008)
            - lateDecay * (0.025 + index * 0.004)
            + deathKick * 0.035 * fallBias;
          quarter.rotation.x += front * collapse * 0.055 + deathTremor * 0.01;
          quarter.rotation.y += side * collapse * 0.05 * fallBias;
          quarter.rotation.z += side * collapse * 0.06 * fallBias + deathTremor * 0.012;
          scaleX *= 1 + collapse * 0.055 + lateDecay * 0.025;
          scaleY *= 1 - collapse * 0.13 - lateDecay * 0.07;
          scaleZ *= 1 + collapse * 0.035 + lateDecay * 0.018;
        }
        quarter.scale.set(
          scaleX,
          scaleY,
          scaleZ,
        );
      });
      if (sizeClass === "whole") applyStoredSplitPose(true);
      else if (sizeClass === "half") applyStoredSplitPose(false);

      parts.hearts.forEach((heart, index) => {
        const beatPhase = fract(timeSeconds * (phase.enraged ? 0.98 : 0.72) + index * 0.023);
        const doubleBeat = (smoothWindow(beatPhase, 0.015, 0.075, 0.19)
          + smoothWindow(beatPhase, 0.255, 0.305, 0.405) * 0.48) * livingFactor;
        const isCentralHeart = index === parts.hearts.length - 1 && sizeClass === "whole";
        let heartScale = 0.99 + doubleBeat * (isCentralHeart ? 0.085 : 0.06)
          + Math.sin(timeSeconds * 1.7 + index * 1.91) * 0.008 * livingFactor;
        if (isFleshTide) {
          const tideBeat = smoothWindow(actionProgress, 0.39 + index * 0.012, 0.66 + index * 0.004, 0.9);
          heartScale *= 1 - anticipation * 0.07 + tideBeat * (isCentralHeart ? 0.16 : 0.1);
        } else if (isRibBloom) {
          heartScale *= 1 - anticipation * 0.09 + ribDualBeat * (isCentralHeart ? 0.18 : 0.1);
        } else if (isSystole) {
          const firstBeat = smoothWindow(actionProgress, 0.16 + index * 0.006, 0.275 + index * 0.005, 0.43);
          heartScale *= 1 - anticipation * (isCentralHeart ? 0.28 : 0.19)
            + firstBeat * (isCentralHeart ? 0.17 : 0.1)
            + drive * (isCentralHeart ? 0.47 : 0.28);
        } else if (isPincer) {
          heartScale *= 1 + impact * 0.13;
        } else if (isArterialSweep) {
          const tensionBeat = smoothWindow(actionProgress, 0.24 + index * 0.006, 0.4, 0.67);
          heartScale *= 1 - arterialBrace * 0.08
            + tensionBeat * 0.12 + arterialSnap * 0.2;
        } else if (isCarrionNest) {
          const payloadBeat = smoothWindow(actionProgress, 0.15 + index * 0.008, 0.36, 0.61);
          heartScale *= 1 + payloadBeat * 0.17 - carrionHold * 0.07
            + carrionRelease * 0.21;
        } else if (isRush) {
          heartScale *= 1 - anticipation * 0.08 + drive * 0.17;
        }
        if (parts.splitPreviewAmount > 0) {
          heartScale *= 1 + Math.sin(timeSeconds * 9.5 + index * 2.3) * parts.splitPreviewTear * 0.025;
        }
        if (isDowned) heartScale *= 1 - collapse * 0.34 - lateDecay * 0.2 + deathTremor * 0.012;
        heart.scale.setScalar(Math.max(0.48, heartScale));
      });

      parts.ribPivots.forEach((ribPivot, index) => {
        const restRotation = ribPivot.userData.restRotation;
        if (restRotation) ribPivot.rotation.copy(restRotation);
        ribPivot.scale.setScalar(1);
        const side = ribPivot.userData.side || (index < parts.ribPivots.length / 2 ? -1 : 1);
        const ribIndex = Number(ribPivot.userData.ribIndex) || 0;
        const radialBand = (2 - ribIndex) / 2;
        const idleSpread = 0.04 + idleBreath * 0.018
          + Math.sin(timeSeconds * 1.37 + index * 0.43) * 0.009 * livingFactor;
        ribPivot.rotation.y += side * idleSpread;
        ribPivot.rotation.z += side * Math.sin(timeSeconds * 0.93 + index) * 0.009 * livingFactor;
        if (isRibBloom) {
          const stagger = Math.abs(ribIndex - 2) * 0.018 + (side > 0 ? 0.012 : 0);
          const ribWindup = smootherstep01(actionProgress / (0.41 + stagger))
            * (1 - smootherstep01((actionProgress - 0.43 - stagger) / 0.2));
          const secondWaveRib = (index + ribIndex) % 2 === 1;
          const ribPeak = secondWaveRib ? 0.8 : 0.58;
          const ribStrike = smoothWindow(
            actionProgress,
            ribPeak - 0.11 + stagger * 0.35,
            ribPeak + stagger * 0.18,
            ribPeak + (secondWaveRib ? 0.13 : 0.12),
          );
          ribPivot.rotation.y += side * (-ribWindup * 0.14 + ribStrike * (0.54 + Math.abs(radialBand) * 0.08));
          ribPivot.rotation.x += ribWindup * 0.055 - ribStrike * (0.08 + ribIndex * 0.008);
          ribPivot.rotation.z += -side * radialBand * (ribWindup * 0.14 + ribStrike * 0.48);
          ribPivot.rotation.z += side * recoil * 0.045;
          ribPivot.scale.setScalar(1 - ribWindup * 0.045 + ribStrike * 0.22);
        } else if (isSystole) {
          ribPivot.rotation.y += side * (-anticipation * 0.12 + drive * 0.27);
          ribPivot.rotation.x += anticipation * 0.045 - drive * 0.06;
          ribPivot.rotation.z += -side * radialBand * drive * 0.11 + side * recoil * 0.025;
          ribPivot.scale.setScalar(1 - anticipation * 0.055 + drive * 0.105);
        } else if (isFleshTide) {
          const sweep = smoothWindow(actionProgress, 0.4 + ribIndex * 0.012, 0.68, 0.93);
          ribPivot.rotation.x += anticipation * 0.04 - sweep * 0.09;
          ribPivot.rotation.y += side * sweep * 0.1;
          ribPivot.rotation.z += side * radialBand * sweep * 0.08;
        } else if (isPincer) {
          ribPivot.rotation.y += side * (anticipation * 0.08 + impact * 0.11);
          ribPivot.rotation.z += instanceSide * (anticipation * 0.04 - drive * 0.07);
        } else if (isArterialSweep) {
          const tensionBand = 0.78 + Math.abs(radialBand) * 0.22;
          ribPivot.rotation.x += arterialBrace * 0.055 - arterialDrag * 0.075;
          ribPivot.rotation.y += side * arterialTension * 0.11 * tensionBand;
          ribPivot.rotation.z += instanceSide
            * (arterialBrace * 0.1 - arterialDrag * 0.17) * tensionBand
            + side * arterialRecoil * 0.025;
          ribPivot.scale.setScalar(1 + arterialTension * 0.055 + arterialSnap * 0.035);
        } else if (isCarrionNest) {
          const nestFold = 0.84 + ribIndex * 0.035;
          ribPivot.rotation.x += carrionGather * 0.08 - carrionThrow * 0.13 * nestFold;
          ribPivot.rotation.y += side
            * (-carrionGather * 0.13 + carrionRelease * 0.24) * nestFold;
          ribPivot.rotation.z += -side * radialBand * carrionGather * 0.09
            + instanceSide * carrionRecoil * 0.03;
          ribPivot.scale.setScalar(1 - carrionGather * 0.055 + carrionRelease * 0.11);
        } else if (isRush) {
          ribPivot.rotation.y += side * (-anticipation * 0.07 + drive * 0.13);
          ribPivot.rotation.x += anticipation * 0.055 - drive * 0.1;
        }
        if (parts.splitPreviewAmount > 0) {
          ribPivot.rotation.y += side * parts.splitPreviewTear * 0.12;
          ribPivot.rotation.z += -side * radialBand * parts.splitPreviewTear * 0.14;
        }
        if (isDowned) {
          ribPivot.rotation.x += collapse * (0.16 + ribIndex * 0.025);
          ribPivot.rotation.y += side * collapse * (0.08 + ribIndex * 0.012);
          ribPivot.rotation.z += side * collapse * (0.1 + radialBand * 0.07) + deathTremor * 0.018;
          ribPivot.scale.multiplyScalar(1 - collapse * 0.08 - lateDecay * 0.16);
        }
      });

      parts.armRigs.forEach((rig, index) => {
        rig.shoulder.position.copy(rig.restShoulderPosition);
        rig.shoulder.rotation.copy(rig.restShoulderRotation);
        rig.elbow.rotation.copy(rig.restElbowRotation);
        rig.wrist.rotation.copy(rig.restWristRotation);
        const cycle = gaitClock + rig.phase + rig.front * 0.38 + rig.variant * 0.55;
        const localMove = activeMove * (fragmentCrawler ? 0.18 : 1);
        const step = Math.sin(cycle) * localMove;
        const lift = Math.max(0, Math.cos(cycle)) * localMove;
        const plant = Math.max(0, -Math.cos(cycle)) * localMove;
        const asymmetry = index % 2 ? -1 : 1;
        rig.shoulder.position.y += lift * 0.15 - plant * 0.018;
        rig.shoulder.position.x += rig.side * lift * 0.035;
        rig.shoulder.position.z += rig.front * step * 0.04;
        rig.shoulder.rotation.x += -lift * 0.055 + plant * 0.025;
        rig.shoulder.rotation.y += step * (rig.variant === 0 ? 0.29 : 0.23);
        rig.shoulder.rotation.z += -rig.side * lift * 0.13 + rig.side * plant * 0.035;
        rig.elbow.rotation.x += lift * 0.09;
        rig.elbow.rotation.y -= step * (rig.variant === 0 ? 0.39 : 0.31);
        rig.elbow.rotation.z += rig.side * (lift * 0.15 - plant * 0.045);
        rig.wrist.rotation.y += step * 0.18;
        rig.wrist.rotation.x -= lift * 0.13 + plant * 0.035;
        rig.wrist.rotation.z += rig.side * step * 0.045;

        let clawCurl = plant * 0.12
          + Math.max(0, Math.sin(timeSeconds * 1.2 + rig.phase)) * 0.018 * livingFactor;
        if (fragmentCrawler) {
          // All remaining legs share the haul beat, while front/rear and the
          // secondary limb retain a little asymmetry. During reach the claws
          // sweep toward +Z and bite; during drive the elbows fold and the
          // shoulders pass the planted wrists, selling a genuine pull.
          const traction = (rig.variant === 0 ? 1 : 0.84)
            * (rig.front > 0 ? 1 : 0.9) * fragmentPullScale;
          rig.shoulder.position.y -= (pullReach * 0.035 + pullDrive * 0.065) * traction;
          rig.shoulder.position.z += (pullReach * 0.2 - pullDrive * 0.18 + pullSettle * 0.035) * traction;
          rig.shoulder.rotation.x += rig.front * (pullReach * 0.15 - pullDrive * 0.22) * traction;
          rig.shoulder.rotation.y += rig.side * (-pullReach * 0.4 + pullDrive * 0.56) * traction;
          rig.shoulder.rotation.z += rig.side * (pullReach * 0.13 - pullDrive * 0.2) * traction;
          rig.elbow.rotation.x += (pullReach * 0.1 + pullDrive * 0.34 + pullSettle * 0.07) * traction;
          rig.elbow.rotation.y += rig.side * (pullReach * 0.24 - pullDrive * 0.4) * traction;
          rig.elbow.rotation.z += rig.side * (-pullReach * 0.12 + pullDrive * 0.29) * traction;
          rig.wrist.rotation.x += (pullReach * 0.08 + pullDrive * 0.29 + pullSettle * 0.055) * traction;
          rig.wrist.rotation.y += rig.side * (-pullReach * 0.14 + pullDrive * 0.21) * traction;
          rig.wrist.rotation.z += rig.side * (pullReach * 0.065 - pullDrive * 0.13) * traction;
          clawCurl += (pullReach * 0.27 + pullDrive * 0.57 + pullSettle * 0.18) * traction;
        }
        if (isFleshTide) {
          const lead = rig.front > 0 ? 1 : 0.74;
          const armWave = smoothWindow(actionProgress, 0.39 + rig.variant * 0.025, 0.67, 0.94);
          rig.shoulder.position.y += -anticipation * 0.08 + armWave * 0.13 * lead;
          rig.shoulder.position.z += -anticipation * 0.08 + armWave * 0.15 * lead;
          rig.shoulder.rotation.x += -anticipation * 0.28 + armWave * 0.46 * lead;
          rig.shoulder.rotation.y += asymmetry * (anticipation * 0.08 - armWave * 0.11);
          rig.shoulder.rotation.z += rig.side * (anticipation * 0.2 - armWave * 0.27);
          rig.elbow.rotation.x += anticipation * 0.31 - armWave * 0.24;
          rig.elbow.rotation.y += -asymmetry * armWave * 0.09;
          rig.wrist.rotation.x += anticipation * 0.18 - armWave * 0.29;
          clawCurl += anticipation * 0.31 - armWave * 0.16;
        } else if (isRibBloom) {
          const brace = 0.86 + (rig.variant === 0 ? 0.14 : 0);
          const armRibBeat = rig.variant % 2 ? ribSecondBeat : ribFirstBeat;
          rig.shoulder.position.y += -anticipation * 0.11 + armRibBeat * 0.07 * brace;
          rig.shoulder.position.x += rig.side * armRibBeat * 0.08;
          rig.shoulder.rotation.x += anticipation * 0.12 - armRibBeat * 0.18;
          rig.shoulder.rotation.z += rig.side * (anticipation * -0.16 + armRibBeat * 0.42 * brace);
          rig.elbow.rotation.x += anticipation * 0.15 - armRibBeat * 0.16;
          rig.elbow.rotation.z += rig.side * (anticipation * 0.18 - armRibBeat * 0.27);
          rig.wrist.rotation.x += anticipation * 0.09 - armRibBeat * 0.17;
          rig.wrist.rotation.z += rig.side * drive * 0.09;
          clawCurl += anticipation * 0.22 - drive * 0.11;
        } else if (isSystole) {
          const braceSide = rig.variant === 0 ? 1 : 0.78;
          rig.shoulder.position.y += anticipation * 0.055 - impact * 0.09;
          rig.shoulder.rotation.x += anticipation * 0.21 - drive * 0.3 * braceSide;
          rig.shoulder.rotation.y += rig.side * (-anticipation * 0.25 + drive * 0.34 * braceSide);
          rig.shoulder.rotation.z += rig.side * (anticipation * 0.14 - drive * 0.23);
          rig.elbow.rotation.x += anticipation * 0.23 - drive * 0.29;
          rig.elbow.rotation.y += rig.side * anticipation * 0.12;
          rig.wrist.rotation.x += anticipation * 0.16 - drive * 0.22;
          clawCurl += anticipation * 0.38 - drive * 0.13;
        } else if (isPincer) {
          const leadingClaw = rig.variant === 0 ? 1 : 0.72;
          const coilSign = asymmetry * instanceSide;
          rig.shoulder.position.x += instanceSide * (anticipation * 0.08 - drive * 0.06);
          rig.shoulder.position.z += drive * 0.12 * leadingClaw;
          rig.shoulder.rotation.x += -anticipation * 0.19 + drive * 0.37 * leadingClaw;
          rig.shoulder.rotation.y += coilSign * (anticipation * 0.3 - drive * 0.42);
          rig.shoulder.rotation.z += rig.side * (anticipation * 0.2 - drive * 0.3 * leadingClaw);
          rig.elbow.rotation.x += anticipation * 0.27 - drive * 0.2;
          rig.elbow.rotation.y += -coilSign * (anticipation * 0.18 - drive * 0.26);
          rig.wrist.rotation.x += anticipation * 0.21 - drive * 0.31;
          rig.wrist.rotation.y += coilSign * drive * 0.13;
          clawCurl += anticipation * 0.42 - drive * 0.2;
        } else if (isArterialSweep) {
          const plantWeight = (rig.front < 0 ? 1 : 0.88) * (rig.variant === 1 ? 1 : 0.84);
          const clawLoad = arterialTension * plantWeight;
          // The claws remain planted while the shoulders cross over them.  A
          // slight front/rear delay keeps the half from looking like one rigid
          // object sliding laterally.
          const limbDrag = smoothWindow(
            actionProgress,
            0.39 + (rig.front < 0 ? 0 : 0.018) + rig.variant * 0.012,
            0.6 + rig.variant * 0.008,
            0.86,
          );
          rig.shoulder.position.x += instanceSide
            * (-arterialBrace * 0.14 + limbDrag * 0.24) * plantWeight;
          rig.shoulder.position.y -= (arterialBrace * 0.085 + arterialSnap * 0.045) * plantWeight;
          rig.shoulder.position.z += rig.front
            * (arterialBrace * 0.1 - limbDrag * 0.075) * plantWeight;
          rig.shoulder.rotation.x += arterialBrace * 0.17 - limbDrag * 0.22 * plantWeight;
          rig.shoulder.rotation.y += instanceSide
            * (-arterialBrace * 0.39 + limbDrag * 0.58) * plantWeight;
          rig.shoulder.rotation.z += rig.side
            * (arterialBrace * 0.3 - limbDrag * 0.46 + arterialRecoil * 0.06) * plantWeight;
          rig.elbow.rotation.x += arterialBrace * 0.28 + limbDrag * 0.38 * plantWeight;
          rig.elbow.rotation.y += instanceSide
            * (arterialBrace * 0.27 - limbDrag * 0.43) * plantWeight;
          rig.elbow.rotation.z += rig.side
            * (-arterialBrace * 0.17 + limbDrag * 0.31) * plantWeight;
          rig.wrist.rotation.x += arterialBrace * 0.18 + limbDrag * 0.34 * plantWeight;
          rig.wrist.rotation.y += instanceSide
            * (-arterialBrace * 0.16 + limbDrag * 0.25) * plantWeight;
          rig.wrist.rotation.z += rig.side
            * (arterialBrace * 0.1 - limbDrag * 0.18) * plantWeight;
          clawCurl += clawLoad * 0.68 + arterialSnap * 0.19 * plantWeight;
        } else if (isCarrionNest) {
          const throwingClaw = rig.variant === 0;
          if (throwingClaw) {
            // The leading limb cups the gathered carrion, rises behind the
            // shoulder, then lashes past the face and opens at release.
            rig.shoulder.position.y += carrionGather * 0.2 - carrionRelease * 0.105;
            rig.shoulder.position.z += -carrionGather * 0.19 + carrionThrow * 0.31;
            rig.shoulder.position.x += instanceSide
              * (carrionGather * 0.1 - carrionThrow * 0.075);
            rig.shoulder.rotation.x += -carrionGather * 0.46 + carrionThrow * 0.78
              + carrionRecoil * 0.06;
            rig.shoulder.rotation.y += instanceSide
              * (carrionGather * 0.34 - carrionThrow * 0.43);
            rig.shoulder.rotation.z += rig.side
              * (carrionGather * 0.3 - carrionThrow * 0.38 + carrionRecoil * 0.055);
            rig.elbow.rotation.x += carrionGather * 0.7 - carrionThrow * 0.48;
            rig.elbow.rotation.y += -instanceSide
              * (carrionGather * 0.25 - carrionThrow * 0.34);
            rig.elbow.rotation.z += rig.side
              * (carrionGather * 0.29 - carrionThrow * 0.24);
            rig.wrist.rotation.x += carrionGather * 0.45 - carrionRelease * 0.76;
            rig.wrist.rotation.y += instanceSide
              * (carrionGather * 0.17 - carrionThrow * 0.25);
            rig.wrist.rotation.z += rig.side
              * (carrionGather * 0.13 - carrionRelease * 0.21);
            clawCurl += carrionHold * 0.72 - carrionRelease * 0.38;
          } else {
            // The remaining limb stays under the body as a real fulcrum for
            // the throw; its fingers tighten through the recoil.
            rig.shoulder.position.y -= carrionGather * 0.105 + carrionRelease * 0.045;
            rig.shoulder.position.z += carrionGather * 0.11 - carrionRecoil * 0.045;
            rig.shoulder.position.x -= instanceSide * carrionGather * 0.07;
            rig.shoulder.rotation.x += carrionGather * 0.2 - carrionThrow * 0.14;
            rig.shoulder.rotation.y += instanceSide
              * (-carrionGather * 0.28 + carrionThrow * 0.19);
            rig.shoulder.rotation.z += rig.side
              * (-carrionGather * 0.32 + carrionRelease * 0.2);
            rig.elbow.rotation.x += carrionGather * 0.37 + carrionRelease * 0.17;
            rig.elbow.rotation.y += instanceSide * carrionGather * 0.23;
            rig.elbow.rotation.z += rig.side
              * (-carrionGather * 0.2 + carrionRelease * 0.13);
            rig.wrist.rotation.x += carrionGather * 0.29 + carrionRelease * 0.14;
            rig.wrist.rotation.y -= instanceSide * carrionGather * 0.14;
            clawCurl += carrionHold * 0.64 + carrionRelease * 0.21;
          }
        } else if (isRush) {
          const lead = rig.front > 0 && rig.variant === 0 ? 1 : rig.front > 0 ? 0.84 : 0.62;
          rig.shoulder.position.y += anticipation * (0.09 + (1 - lead) * 0.07) - impact * 0.11 * lead;
          rig.shoulder.position.z += -anticipation * 0.1 + drive * 0.18 * lead;
          rig.shoulder.rotation.x += -anticipation * (0.35 - lead * 0.08) + drive * 0.54 * lead;
          rig.shoulder.rotation.y += asymmetry * (anticipation * 0.16 - drive * 0.2);
          rig.shoulder.rotation.z += rig.side * (anticipation * 0.17 - drive * 0.24 * lead + recoil * 0.08);
          rig.elbow.rotation.x += anticipation * 0.38 - drive * 0.31 * lead;
          rig.elbow.rotation.y += -asymmetry * drive * 0.13;
          rig.wrist.rotation.x += anticipation * 0.28 - drive * 0.36 * lead;
          clawCurl += anticipation * 0.48 - drive * 0.24;
        }

        if (isDowned) {
          const loosen = 0.84 + seeded(401 + instanceIndex, index) * 0.3;
          rig.shoulder.position.y -= collapse * 0.045 * loosen;
          rig.shoulder.position.x += rig.side * collapse * 0.09 * loosen;
          rig.shoulder.rotation.x += collapse * (0.16 + rig.variant * 0.07);
          rig.shoulder.rotation.y += asymmetry * collapse * 0.18;
          rig.shoulder.rotation.z += rig.side * collapse * 0.28 * loosen + deathTremor * 0.025;
          rig.shoulder.rotation.x += lateDecay * 0.08;
          rig.elbow.rotation.x += collapse * 0.24 + lateDecay * 0.12;
          rig.elbow.rotation.y -= asymmetry * collapse * 0.2;
          rig.elbow.rotation.z += rig.side * collapse * 0.18;
          rig.wrist.rotation.x += collapse * 0.27 + lateDecay * 0.15;
          rig.wrist.rotation.z += -rig.side * collapse * 0.13;
          clawCurl += collapse * 0.24 + lateDecay * 0.13;
        }
        rig.fingers.forEach((finger, fingerIndex) => {
          const digitOffset = (fingerIndex - 1.5) * 0.038;
          const digitAsymmetry = (fingerIndex === 0 || fingerIndex === 3) ? 0.86 : 1;
          finger.rotation.set(
            -0.075 - clawCurl * digitAsymmetry - lift * 0.045,
            digitOffset * (1 + drive * 0.6 + carrionRelease * (rig.variant === 0 ? 0.9 : 0.12)),
            -rig.side * digitOffset * (isDowned ? collapse * 0.5 : impact * 0.24),
          );
        });
      });

      if (parts.centralChestRig && parts.centralChestRig.userData.restRotation) {
        parts.centralChestRig.position.copy(parts.centralChestRig.userData.restPosition);
        parts.centralChestRig.rotation.copy(parts.centralChestRig.userData.restRotation);
        parts.centralChestRig.scale.copy(parts.centralChestRig.userData.restScale);
        parts.centralChestRig.position.y += idleBreath * 0.018;
        parts.centralChestRig.rotation.x += idleBreath * 0.012;
        parts.centralChestRig.rotation.z += Math.sin(timeSeconds * 0.83) * 0.015 * livingFactor;
        if (isFleshTide) {
          parts.centralChestRig.position.z += -anticipation * 0.09 + drive * 0.18;
          parts.centralChestRig.rotation.x += anticipation * 0.055 - drive * 0.095;
          parts.centralChestRig.rotation.z += -anticipation * 0.04 + drive * 0.055;
        } else if (isRibBloom) {
          parts.centralChestRig.position.y += -anticipation * 0.14 + ribDualBeat * 0.24;
          parts.centralChestRig.position.z += ribDualBeat * 0.11;
          parts.centralChestRig.rotation.x += anticipation * 0.1 - ribDualBeat * 0.16;
          parts.centralChestRig.rotation.z += (ribFirstBeat - ribSecondBeat) * 0.045;
          parts.centralChestRig.scale.set(
            1 - anticipation * 0.07 + ribDualBeat * 0.13,
            1 - anticipation * 0.08 + ribDualBeat * 0.1,
            1 - anticipation * 0.06 + ribDualBeat * 0.15,
          );
        } else if (isSystole) {
          parts.centralChestRig.position.y += anticipation * 0.075 + impact * 0.12;
          parts.centralChestRig.position.z += -anticipation * 0.1 + drive * 0.16;
          parts.centralChestRig.rotation.x += -anticipation * 0.05 + drive * 0.085;
          parts.centralChestRig.rotation.z += instanceSide * recoil * 0.035;
          parts.centralChestRig.scale.set(
            1 - anticipation * 0.12 + drive * 0.21,
            1 + anticipation * 0.08 - drive * 0.1,
            1 - anticipation * 0.1 + drive * 0.23,
          );
        } else if (isPincer) {
          parts.centralChestRig.rotation.y += instanceSide * (anticipation * 0.17 - drive * 0.21);
          parts.centralChestRig.rotation.z += instanceSide * (anticipation * 0.05 - drive * 0.08);
        } else if (isArterialSweep) {
          parts.centralChestRig.position.x += instanceSide
            * (-arterialBrace * 0.11 + arterialDrag * 0.19);
          parts.centralChestRig.position.y -= arterialBrace * 0.085;
          parts.centralChestRig.rotation.y += instanceSide
            * (-arterialBrace * 0.19 + arterialDrag * 0.27);
          parts.centralChestRig.rotation.z += instanceSide
            * (arterialBrace * 0.13 - arterialDrag * 0.21 + arterialRecoil * 0.035);
          parts.centralChestRig.scale.set(
            1 + arterialTension * 0.08,
            1 - arterialBrace * 0.07,
            1 + arterialSnap * 0.055,
          );
        } else if (isCarrionNest) {
          parts.centralChestRig.position.y -= carrionGather * 0.1;
          parts.centralChestRig.position.z += -carrionGather * 0.13 + carrionThrow * 0.2;
          parts.centralChestRig.rotation.x += carrionGather * 0.12 - carrionThrow * 0.2;
          parts.centralChestRig.rotation.z += instanceSide
            * (carrionGather * 0.1 - carrionRelease * 0.14);
          parts.centralChestRig.scale.set(
            1 + carrionGather * 0.08 - carrionRelease * 0.04,
            1 - carrionGather * 0.09 + carrionRelease * 0.065,
            1 - carrionGather * 0.06 + carrionThrow * 0.12,
          );
        } else if (isRush) {
          parts.centralChestRig.position.z += -anticipation * 0.12 + drive * 0.22;
          parts.centralChestRig.rotation.x += anticipation * 0.08 - drive * 0.14;
        }
        if (parts.splitPreviewAmount > 0) {
          const anatomyScale = Math.max(0.045, 1 - parts.splitPreviewTear * 0.955);
          parts.centralChestRig.position.y -= parts.splitPreviewTear * 0.18;
          parts.centralChestRig.position.z -= parts.splitPreviewTear * 0.1;
          parts.centralChestRig.rotation.x -= parts.splitPreviewTear * 0.025;
          parts.centralChestRig.rotation.z += instanceSide * parts.splitPreviewTear * 0.07;
          parts.centralChestRig.scale.multiplyScalar(anatomyScale);
        }
        if (isDowned) {
          parts.centralChestRig.position.y -= collapse * 0.08;
          parts.centralChestRig.position.z += collapse * 0.07;
          parts.centralChestRig.rotation.x += collapse * 0.1;
          parts.centralChestRig.rotation.z += instanceSide * collapse * 0.065 + deathTremor * 0.014;
          parts.centralChestRig.scale.multiplyScalar((1 - collapse * 0.2) * (1 - lateDecay * 0.48));
        }
      }
      if (parts.skull && parts.skull.userData.restRotation) {
        parts.skull.position.copy(parts.skull.userData.restPosition);
        parts.skull.rotation.copy(parts.skull.userData.restRotation);
        parts.skull.scale.copy(parts.skull.userData.restScale);
        parts.skull.position.y += Math.sin(timeSeconds * 1.11 + 0.7) * 0.014 * livingFactor;
        parts.skull.rotation.x += Math.sin(timeSeconds * 0.91) * 0.012 * livingFactor;
        parts.skull.rotation.z += idleSway * 0.008;
        if (fragmentCrawler) {
          // The skull lags behind the hauling mass, then catches up with a
          // small sideways recoil instead of moving as a rigid ornament.
          parts.skull.position.y += (-pullReach * 0.025 + pullDrive * 0.045 - pullSettle * 0.018)
            * fragmentPullScale;
          parts.skull.position.z += (pullReach * 0.055 - pullDrive * 0.115 + pullSettle * 0.028)
            * fragmentPullScale;
          parts.skull.rotation.x += (pullReach * 0.065 - pullDrive * 0.105 + pullSettle * 0.035)
            * fragmentPullScale;
          parts.skull.rotation.z += instanceSide * (-pullReach * 0.045 + pullDrive * 0.075)
            * fragmentPullScale;
        }
        if (isFleshTide) {
          parts.skull.position.z += -anticipation * 0.09 + drive * 0.2;
          parts.skull.rotation.x += anticipation * 0.08 - drive * 0.14;
          parts.skull.rotation.y += -anticipation * 0.035 + drive * 0.045;
        } else if (isRibBloom) {
          parts.skull.position.y += -anticipation * 0.08 + ribDualBeat * 0.1;
          parts.skull.rotation.x += anticipation * 0.055 - ribDualBeat * 0.08;
          parts.skull.rotation.z += (ribFirstBeat - ribSecondBeat) * 0.028;
        } else if (isSystole) {
          parts.skull.position.z += -anticipation * 0.055 + impact * 0.08;
          parts.skull.rotation.x += anticipation * -0.035 + drive * 0.065;
        } else if (isPincer) {
          parts.skull.rotation.y += instanceSide * (anticipation * 0.16 - drive * 0.22);
          parts.skull.rotation.z += instanceSide * (anticipation * 0.055 - drive * 0.075);
        } else if (isArterialSweep) {
          // The head keeps looking into the taut connection for a beat, then
          // catches the sideways haul late to reinforce the mass of the body.
          parts.skull.position.x += instanceSide
            * (-arterialBrace * 0.055 + arterialDrag * 0.105);
          parts.skull.position.y -= arterialBrace * 0.045;
          parts.skull.rotation.y += instanceSide
            * (-arterialTension * 0.24 + arterialDrag * 0.36);
          parts.skull.rotation.z += instanceSide
            * (arterialBrace * 0.11 - arterialDrag * 0.17 + arterialRecoil * 0.045);
        } else if (isCarrionNest) {
          parts.skull.position.y += carrionGather * 0.055 - carrionRelease * 0.04;
          parts.skull.position.z += -carrionGather * 0.12 + carrionThrow * 0.21;
          parts.skull.rotation.x += -carrionGather * 0.14 + carrionThrow * 0.24
            + carrionRecoil * 0.04;
          parts.skull.rotation.y += instanceSide
            * (carrionGather * 0.18 - carrionThrow * 0.23);
          parts.skull.rotation.z += instanceSide
            * (carrionGather * 0.09 - carrionRelease * 0.13);
        } else if (isRush) {
          parts.skull.position.z += -anticipation * 0.14 + drive * 0.27;
          parts.skull.rotation.x += anticipation * 0.11 - drive * 0.18;
        }
        if (parts.splitPreviewAmount > 0) {
          const skullScale = Math.max(0.055, 1 - parts.splitPreviewTear * 0.945);
          parts.skull.position.y -= parts.splitPreviewTear * 0.14;
          parts.skull.position.z += parts.splitPreviewTear * 0.1;
          parts.skull.rotation.x += parts.splitPreviewTear * 0.24;
          parts.skull.rotation.z += -instanceSide * parts.splitPreviewTear * 0.09;
          parts.skull.scale.multiplyScalar(skullScale);
        }
        if (isDowned) {
          parts.skull.position.y -= collapse * 0.075;
          parts.skull.position.z += collapse * 0.07;
          parts.skull.position.y -= lateDecay * 0.025;
          parts.skull.rotation.x += collapse * 0.12 + lateDecay * 0.055;
          parts.skull.rotation.z += instanceSide * collapse * 0.065 + deathTremor * 0.016;
          parts.skull.scale.multiplyScalar(1 - lateDecay * 0.5);
        }
      }
      parts.splitDetailGroups.forEach((detailGroup, detailIndex) => {
        if (!detailGroup || !detailGroup.userData.restScale) return;
        detailGroup.position.copy(detailGroup.userData.restPosition);
        detailGroup.rotation.copy(detailGroup.userData.restRotation);
        detailGroup.scale.copy(detailGroup.userData.restScale);
        if (parts.splitPreviewAmount > 0) {
          const detailScale = Math.max(0.04, 1 - parts.splitPreviewTear * 0.96);
          detailGroup.position.y -= parts.splitPreviewTear * (0.09 + detailIndex * 0.035);
          detailGroup.position.z += (detailIndex ? -1 : 1) * parts.splitPreviewTear * 0.055;
          detailGroup.rotation.x += parts.splitPreviewTear * (detailIndex ? -0.08 : 0.1);
          detailGroup.rotation.z += instanceSide * parts.splitPreviewTear * 0.075;
          detailGroup.scale.multiplyScalar(detailScale);
        }
        if (isDowned) {
          detailGroup.position.y -= collapse * 0.035;
          detailGroup.rotation.z += instanceSide * collapse * 0.06;
          detailGroup.scale.multiplyScalar(1 - collapse * 0.12 - lateDecay * 0.28);
        }
      });
      if (parts.jawPivot) {
        const jawRest = parts.jawPivot.userData.restRotation;
        if (jawRest) parts.jawPivot.rotation.copy(jawRest);
        const idleOpen = Math.max(0, Math.sin(timeSeconds * 1.37 + 0.5)) * 0.075 * livingFactor;
        let attackOpen = 0;
        if (isFleshTide) attackOpen = anticipation * 0.46 + drive * 0.12 - impact * 0.08;
        else if (isPincer) attackOpen = anticipation * 0.36 + impact * 0.11;
        else if (isArterialSweep) {
          attackOpen = arterialTension * 0.28 + arterialSnap * 0.21
            + Math.max(0, arterialRecoil) * 0.055;
        } else if (isCarrionNest) {
          attackOpen = carrionGather * 0.18 + carrionRelease * 0.48
            - Math.max(0, -carrionRecoil) * 0.04;
        } else if (isRush) {
          attackOpen = anticipation * 0.52 - impact * 0.14 + Math.max(0, recoil) * 0.08;
        }
        else if (isRibBloom) attackOpen = anticipation * 0.18 + ribDualBeat * 0.27;
        else if (isSystole) attackOpen = anticipation * 0.2 + impact * 0.24;
        const pullSnarl = fragmentCrawler ? pullReach * 0.1 + pullDrive * 0.23 : 0;
        parts.jawPivot.rotation.x += -0.085 - idleOpen - attackOpen - pullSnarl
          - collapse * 0.42 - lateDecay * 0.08;
      }
      if (parts.materials.core.emissiveIntensity !== undefined) {
        const dyingLight = Math.max(0.04, 1 - collapse * 0.66 - lateDecay * 0.3);
        const splitFlicker = parts.splitPreviewAmount > 0
          ? Math.max(0, Math.sin(timeSeconds * 13.2 + instanceIndex)) * parts.splitPreviewTear * 0.22
          : 0;
        parts.materials.core.emissiveIntensity = reviewIndex >= 3
          ? (0.34 + pulse * 0.38 + impact * 0.18
            + arterialSnap * 0.24 + carrionRelease * 0.28 + splitFlicker) * dyingLight
          : 0;
        parts.materials.organ.emissiveIntensity = reviewIndex >= 3
          ? (0.29 + pulse * 0.28 + systole * 0.58
            + arterialTension * 0.16 + carrionHold * 0.2 + carrionRelease * 0.22
            + splitFlicker) * dyingLight
          : 0;
        parts.materials.fissure.emissiveIntensity = 0;
      }
      const flash = clamp(Number(phase.damageFlash) || 0, 0, 1);
      parts.materials.flesh.emissive = parts.materials.flesh.emissive || new THREE.Color(0x000000);
      parts.materials.flesh.emissive.setRGB(flash * 0.48, flash * 0.06, flash * 0.035);
      parts.materials.flesh.emissiveIntensity = flash;
    };

    root.userData.setSplitPreview = function setSplitPreview(amount, axis) {
      const parts = root.userData.hordeheartParts;
      const separation = clamp(amount, 0, 1);
      parts.splitPreviewAmount = separation;
      parts.splitPreviewAxis = axis || "";
      parts.splitPreviewPull = smoothWindow(separation, 0, 0.135, 0.34);
      parts.splitPreviewTear = smootherstep01((separation - 0.14) / 0.6);
      parts.splitPreviewSettle = smootherstep01((separation - 0.72) / 0.28);
      applyStoredSplitPose(true);
    };

    root.userData.getSplitAnchors = function getSplitAnchors() {
      const parts = root.userData.hordeheartParts;
      if (typeof root.updateWorldMatrix === "function") root.updateWorldMatrix(true, true);
      else root.updateMatrixWorld(true);
      return parts.splitAnchors.map((anchor, index) => {
        const worldPosition = new THREE.Vector3();
        const worldQuaternion = new THREE.Quaternion();
        const worldScale = new THREE.Vector3();
        anchor.matrixWorld.decompose(worldPosition, worldQuaternion, worldScale);
        return {
          index,
          id: anchor.name || `HordeheartSplitAnchor_${index}`,
          fragmentIndex: Number.isFinite(anchor.userData.fragmentIndex)
            ? anchor.userData.fragmentIndex
            : index,
          targetSplitIndex: Number.isFinite(anchor.userData.targetSplitIndex)
            ? anchor.userData.targetSplitIndex
            : index,
          sourceSizeClass: sizeClass,
          targetSizeClass: anchor.userData.targetSizeClass
            || (sizeClass === "whole" ? "half" : sizeClass === "half" ? "quarter" : "debris"),
          axis: parts.splitPreviewAxis,
          progress: parts.splitPreviewAmount,
          position: { x: worldPosition.x, y: worldPosition.y, z: worldPosition.z },
          quaternion: {
            x: worldQuaternion.x,
            y: worldQuaternion.y,
            z: worldQuaternion.z,
            w: worldQuaternion.w,
          },
          scale: { x: worldScale.x, y: worldScale.y, z: worldScale.z },
        };
      });
    };

    root.userData.dispose = function disposeHordeheartModel() {
      const disposedGeometries = new Set();
      const disposedMaterials = new Set();
      root.traverse((node) => {
        if (node.geometry && !disposedGeometries.has(node.geometry)) {
          disposedGeometries.add(node.geometry);
          node.geometry.dispose();
        }
        const nodeMaterials = Array.isArray(node.material) ? node.material : [node.material];
        nodeMaterials.forEach((material) => {
          if (material && !disposedMaterials.has(material)) {
            disposedMaterials.add(material);
            material.dispose();
          }
        });
      });
    };

    return root;
  }

  function createHordeheartModelBuildJob(sizeClassOrOptions, splitIndex, extraOptions) {
    const iterator = buildHordeheartModel(sizeClassOrOptions, splitIndex, extraOptions);
    const job = {
      done: false,
      result: null,
      stage: "pending",
      steps: 0,
      step() {
        if (job.done) return { done: true, model: job.result, stage: job.stage };
        const next = iterator.next();
        job.steps += 1;
        job.done = !!next.done;
        if (next.done) {
          job.result = next.value || null;
          job.stage = "complete";
        } else {
          job.stage = next.value && next.value.stage || "building";
        }
        return {
          done: job.done,
          model: job.result,
          stage: job.stage,
          detail: next.done ? null : next.value,
        };
      },
    };
    return job;
  }

  function createHordeheartModel(sizeClassOrOptions, splitIndex, extraOptions) {
    const job = createHordeheartModelBuildJob(sizeClassOrOptions, splitIndex, extraOptions);
    while (!job.done) job.step();
    return job.result;
  }

  global.createHordeheartModel = createHordeheartModel;
  global.createHordeheartModelBuildJob = createHordeheartModelBuildJob;
  global.HORDEHEART_MODEL_PASSES = PASS_ORDER.slice();
})(typeof window !== "undefined" ? window : globalThis);
