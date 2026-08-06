const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const THREE = require("../vendor/three.min.js");

const FLAME_COUNT = 24;
const DISTANCES = [0.2, 0.42, 0.64, 0.84];

function flameSpec(index) {
  const angle = index * 2.399963229728653;
  return {
    baseScale: 0.95 + (index % 5) * 0.11,
    baseX: Math.cos(angle) * DISTANCES[index % DISTANCES.length],
    baseZ: Math.sin(angle) * DISTANCES[index % DISTANCES.length],
    baseY: 0.075,
    phase: index * 0.73,
    baseRotationX: -Math.sin(angle) * (0.1 + (index % 3) * 0.025),
    baseRotationZ: Math.cos(angle) * (0.1 + (index % 3) * 0.025),
  };
}

function flameParent(time, index, oilScale) {
  const spec = flameSpec(index);
  const flicker = 0.94 + Math.sin(time * (10.5 + index % 5) + spec.phase) * 0.22;
  const object = new THREE.Object3D();
  object.position.set(
    spec.baseX * oilScale * 0.94,
    spec.baseY + Math.sin(time * 12.5 + spec.phase) * 0.055,
    spec.baseZ * oilScale * 0.94,
  );
  object.rotation.set(
    spec.baseRotationX + Math.sin(time * 6.5 + spec.phase) * 0.045,
    0,
    spec.baseRotationZ + Math.cos(time * 7.2 + spec.phase) * 0.045,
  );
  object.scale.set(
    spec.baseScale * (0.94 + Math.sin(time * 7.8 + spec.phase) * 0.08),
    Math.max(0.58, spec.baseScale * flicker),
    spec.baseScale * (0.94 + Math.cos(time * 8.6 + spec.phase) * 0.08),
  );
  object.updateMatrix();
  return object;
}

function childTransform(kind) {
  const child = new THREE.Object3D();
  if (kind === "outerCross") child.rotation.y = Math.PI / 2;
  if (kind === "innerFront") child.position.z = 0.012;
  if (kind === "innerCross") {
    child.position.x = 0.012;
    child.rotation.y = Math.PI / 2;
  }
  child.updateMatrix();
  return child;
}

function maximumMatrixDifference(left, right) {
  let maximum = 0;
  for (let index = 0; index < 16; index += 1) {
    maximum = Math.max(maximum, Math.abs(left.elements[index] - right.elements[index]));
  }
  return maximum;
}

test("instanced flame matrices exactly match the former four-child hierarchy", () => {
  const kinds = ["outerFront", "outerCross", "innerFront", "innerCross"];
  for (const time of [0, 0.37, 2.4, 11.75]) {
    for (const oilScale of [2.6, 7.2, 11.8]) {
      for (let index = 0; index < FLAME_COUNT; index += 1) {
        const parent = flameParent(time, index, oilScale);
        for (const kind of kinds) {
          const child = childTransform(kind);
          parent.add(child);
          parent.updateMatrixWorld(true);
          const instancedMatrix = new THREE.Matrix4().multiplyMatrices(parent.matrix, child.matrix);
          assert.ok(maximumMatrixDifference(child.matrixWorld, instancedMatrix) < 1e-12);
          assert.ok(instancedMatrix.elements.every(Number.isFinite));
          parent.remove(child);
        }
      }
    }
  }
});

test("the optimized source keeps all 96 flame cards while using four batches", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "..", "game.js"), "utf8");
  assert.match(source, /outerFront:\s*createOilBaronInstancedEffect/);
  assert.match(source, /outerCross:\s*createOilBaronInstancedEffect/);
  assert.match(source, /innerFront:\s*createOilBaronInstancedEffect/);
  assert.match(source, /innerCross:\s*createOilBaronInstancedEffect/);
  assert.doesNotMatch(source, /parts\.flames\.push/);
  assert.equal(FLAME_COUNT * 4, 96);
});

test("derrick hits stay on the lightweight path and coalesce rapid impact FX", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "..", "game.js"), "utf8");
  const damageStart = source.indexOf("function damageOilDerrick");
  const damageEnd = source.indexOf("function destroyOilDerrick", damageStart);
  const damageBody = source.slice(damageStart, damageEnd);
  assert.ok(damageStart > 0 && damageEnd > damageStart);
  assert.match(damageBody, /source && source\.suppressVisuals/);
  assert.match(damageBody, /derrick\.hitFxCooldown \|\| 0/);
  assert.match(damageBody, /reserveParticleSlots\(14\)/);
  assert.match(damageBody, /updateEnemyHealthBar\(derrick\)/);
  assert.doesNotMatch(damageBody, /updateOilDerrickVisual\(derrick/);

  const destroyStart = source.indexOf("function destroyOilDerrick");
  const destroyEnd = source.indexOf("function clearOilBaronDerricks", destroyStart);
  const destroyBody = source.slice(destroyStart, destroyEnd);
  assert.match(destroyBody, /source && source\.suppressVisuals/);
  assert.doesNotMatch(destroyBody, /updateOilDerrickVisual\(derrick/);

  const visualStart = source.indexOf("function updateOilDerrickVisual");
  const visualEnd = source.indexOf("function isOilBaronAllyEntity", visualStart);
  const visualBody = source.slice(visualStart, visualEnd);
  assert.match(visualBody, /parts\.rig\.scale\.multiplyScalar\(hitScale\)/);
  assert.doesNotMatch(visualBody, /derrick\.group\.scale\.set\(hitScale/);
  assert.match(source, /mats\.oilBaronOil,[\s\S]*mats\.oilBaronBrass,[\s\S]*mats\.oilBaronGold,/);
});

test("the Baron's open offer chest presents a varied treasure pile", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "..", "game.js"), "utf8");
  const start = source.indexOf("function createOilBaronBribeChest");
  const end = source.indexOf("function createOilBaronAttackTelegraph", start);
  const body = source.slice(start, end);
  assert.ok(start > 0 && end > start);
  assert.match(body, /lidPivot\.rotation\.x = -1\.04/);
  assert.match(body, /mats\.oilBaronBurgundy/);
  assert.match(body, /var coinCount = 48/);
  assert.match(body, /var coinAngle = coin \* 2\.3999632297/);
  assert.match(body, /coinInstances\.userData\.layout = "treasure-pile"/);
  assert.match(body, /new THREE\.InstancedMesh\(ingotGeometry, mats\.oilBaronGold, 5\)/);
  assert.match(body, /var nuggetCount = 14/);
  assert.doesNotMatch(body, /oilBaronFlameDummy\.rotation\.set\(Math\.PI \/ 2/);
});

test("derrick visibility is decided before oil, pump and fire transforms", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "..", "game.js"), "utf8");
  const start = source.indexOf("function updateOilDerrickVisual");
  const end = source.indexOf("function isOilBaronAllyEntity", start);
  const body = source.slice(start, end);
  assert.ok(body.indexOf("if (!visualVisible) return false") > 0);
  assert.ok(body.indexOf("if (!visualVisible) return false") < body.indexOf("if (parts.oil)"));
  assert.ok(body.indexOf("getCurrentVisibleGroundRect(oilBaronVisibleGroundScratch)") > 0);
});

test("derrick-only detached-rig state cannot leak into another boss animator", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "..", "game.js"), "utf8");
  const derrickModelStart = source.indexOf("function createOilDerrickModel");
  const derrickVisualStart = source.indexOf("function updateOilDerrickVisual", derrickModelStart);
  const derrickVisualEnd = source.indexOf("function isOilBaronAllyEntity", derrickVisualStart);
  assert.ok(derrickModelStart > 0);
  assert.doesNotMatch(source.slice(0, derrickModelStart), /derrick\.rigDetached/);
  assert.match(
    source.slice(derrickVisualStart, derrickVisualEnd),
    /if \(parts\.rig && !derrick\.rigDetached\)/,
  );
});

test("the cane warning lane uses the same world direction as its damage ray", () => {
  const range = 32;
  const halfWidth = 1.9;
  const bossX = 13.25;
  const bossZ = -7.5;
  for (const angle of [-Math.PI, -2.3, -0.7, 0, 0.84, 2.1, Math.PI]) {
    const dirX = Math.sin(angle);
    const dirZ = Math.cos(angle);
    const telegraph = new THREE.Object3D();
    telegraph.position.set(bossX, 0, bossZ);
    telegraph.rotation.y = Math.atan2(dirX, dirZ);
    telegraph.updateMatrix();

    const start = new THREE.Vector3(0, 0, 0).applyMatrix4(telegraph.matrix);
    const center = new THREE.Vector3(0, 0, range * 0.5).applyMatrix4(telegraph.matrix);
    const end = new THREE.Vector3(0, 0, range).applyMatrix4(telegraph.matrix);
    const leftEdge = new THREE.Vector3(-halfWidth, 0, range * 0.5).applyMatrix4(telegraph.matrix);
    assert.ok(Math.hypot(start.x - bossX, start.z - bossZ) < 1e-12);
    assert.ok(Math.hypot(center.x - (bossX + dirX * range * 0.5), center.z - (bossZ + dirZ * range * 0.5)) < 1e-12);
    assert.ok(Math.hypot(end.x - (bossX + dirX * range), end.z - (bossZ + dirZ * range)) < 1e-12);
    const edgeDx = leftEdge.x - center.x;
    const edgeDz = leftEdge.z - center.z;
    assert.ok(Math.abs(Math.hypot(edgeDx, edgeDz) - halfWidth) < 1e-12);
    assert.ok(Math.abs(edgeDx * dirX + edgeDz * dirZ) < 1e-12);
  }

  const source = fs.readFileSync(path.resolve(__dirname, "..", "game.js"), "utf8");
  assert.match(source, /telegraph\.rotation\.y = Math\.atan2\(boss\.caneDirX, boss\.caneDirZ\)/);
  assert.doesNotMatch(source, /mesh\.rotation\.z = -Math\.atan2\(boss\.caneDirX, boss\.caneDirZ\)/);
});

test("the Oil Baron's extended starfall keeps every chaotic bounce tied to a player", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "..", "game.js"), "utf8");
  assert.match(source, /var starOrder = \[0, 2, 4, 1, 3\]/);
  assert.match(source, /var OIL_BARON_STAR_JUMP_COUNT = 8/);
  assert.match(source, /var directTarget = entries\.length === 1 && pointIndex % 2 === 1/);
  assert.match(source, /playerId: targetEntry \? String\(targetEntry\.id \|\| ""\) : ""/);
  assert.match(source, /entries\.length === 1 \? rand\(7\.2, 10\.4\) : rand\(0\.7, 4\.1\)/);
  assert.match(source, /point\.directTarget \|\| point\.distributedTarget \|\| Math\.hypot\(clearPoint\.x - previousPoint\.x/);
  assert.match(source, /var OIL_BARON_STAR_REPEAT_INTERVALS = \[26, 20\]/);
  assert.match(source, /encounter\.starCooldown <= 0[\s\S]*beginOilBaronStarAttack\(encounter\)/);
});

test("Black Gold Covenant is a dedicated long-form adaptive boss composition", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "..", "game.js"), "utf8");
  assert.match(source, /var OIL_BARON_MUSIC_TEMPOS = \[117, 123, 130\]/);
  assert.match(source, /var OIL_BARON_MUSIC_PHRASE_BARS = 48/);
  assert.match(source, /var OIL_BARON_MUSIC_HOOK_CALL = \[[\s\S]*329\.63[\s\S]*392[\s\S]*466\.16[\s\S]*493\.88/);
  assert.match(source, /function startOilBaronBossMusic[\s\S]*music\.compositionVersion = OIL_BARON_MUSIC_COMPOSITION/);
  assert.match(source, /binding\.id === "oil-baron"\) startOilBaronBossMusic/);
  assert.match(source, /audioState\.bossMusic\.id === "oil-baron"\) scheduleOilBaronBossMusic/);
  assert.match(source, /function scheduleOilBaronBossMusic[\s\S]*OIL_BARON_MUSIC_SWING/);
  assert.match(source, /function getOilBaronMusicStepPlan[\s\S]*action === "offer"[\s\S]*action === "starfall"/);
  assert.match(source, /function playOilBaronPumpHit[\s\S]*function playOilBaronSlideLead[\s\S]*function playOilBaronCoinChime/);
  assert.match(source, /binding\.id === "oil-baron" && !music\.deathStingPlayed[\s\S]*playOilBaronMusicDeathSting/);
  assert.match(source, /The signature E-G-Bb call never reaches its resolving B/);
});

test("oil starfall immunity, landing marker, and network target share one action state", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "..", "game.js"), "utf8");
  assert.match(source, /if \(boss\.action === "oilStar"\)[\s\S]*return 0;/);
  assert.match(source, /telegraph\.position\.set\([\s\S]*boss\.starTargetX[\s\S]*boss\.starTargetZ/);
  assert.match(source, /oilStar: 7/);
  assert.match(source, /actionCode === MULTIPLAYER_OIL_BARON_ACTION_CODES\.oilStar[\s\S]*pushMultiplayerBossPosition\(bytes, data\.starX, data\.starZ\)/);
  assert.match(source, /starPosition = readMultiplayerBossPosition\(reader\)/);
  assert.match(source, /OIL_BARON_STAR_LANDING_RADIUS \+ \(entity\.radius \|\| 0\.7\)/);
  assert.match(source, /queueMultiplayerCombatEvent\("oilBaronStarImpact"/);
  assert.match(source, /event\.type === "oilBaronStarImpact"[\s\S]*applyGuestOilBaronStarImpactEvent/);
  assert.match(source, /function playOilBaronBounceSound[\s\S]*connectSfxOutput[\s\S]*scheduleAudioDisconnect/);
});

test("burning oil is latched to puddle lifetime and chains only in the late phases", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "..", "game.js"), "utf8");
  const updateStart = source.indexOf("function updateOilDerricks");
  const updateEnd = source.indexOf("function findOilBaronTarget", updateStart);
  const updateBody = source.slice(updateStart, updateEnd);
  const spreadStart = source.indexOf("function spreadOilBaronFire");
  const spreadEnd = source.indexOf("function updateOilDerricks", spreadStart);
  const spreadBody = source.slice(spreadStart, spreadEnd);
  assert.match(updateBody, /derrick\.burnTime = \(derrick\.oilRadius \|\| 0\) > 0\.12 \? OIL_BARON_BURN_TIME : 0/);
  assert.doesNotMatch(updateBody, /derrick\.burnTime = Math\.max\(0, derrick\.burnTime - dt\)/);
  assert.match(spreadBody, /encounter\.phase < 1/);
  assert.match(spreadBody, /dx \* dx \+ dz \* dz > reach \* reach/);
  assert.match(spreadBody, /burningQueue\.push\(target\)/);
});

test("ground slam has a distinct compact-wire subtype and the cane top owns the projectile origin", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "..", "game.js"), "utf8");
  assert.match(source, /oilStar: 7,[\s\S]*groundSlam: 7/);
  assert.match(source, /MULTIPLAYER_OIL_BARON_SPECIAL_ACTION_CODES = \{[\s\S]*groundSlam: 1/);
  assert.match(source, /bytes\.push\(Object\.prototype\.hasOwnProperty\.call\(MULTIPLAYER_OIL_BARON_SPECIAL_ACTION_CODES, actionName\)/);
  assert.match(source, /action = MULTIPLAYER_OIL_BARON_SPECIAL_CODE_ACTIONS\[specialActionCode\]/);
  assert.match(source, /oilBaronCaneMuzzlePositionScratch\.setFromMatrixPosition\(muzzle\.matrixWorld\)/);
  assert.match(source, /spawnCoachGunTracer\([\s\S]*OIL_BARON_CANE_PROJECTILE_SPEED/);
  assert.match(source, /caneGripX \+= \(caneAim \* 0\.68/);
});
