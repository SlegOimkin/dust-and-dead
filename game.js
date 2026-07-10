(function () {
  "use strict";

  if (!window.THREE) {
    document.body.innerHTML =
      "<div style=\"padding:24px;color:#fff;font-family:Arial\">Three.js failed to load from vendor/three.min.js.</div>";
    return;
  }

  var THREE = window.THREE;
  var CITY_W = 60;
  var CITY_D = 42;
  var OUTSKIRT_MARGIN = 28;
  var MAP_SIZE_MULTIPLIER = 4;
  var BASE_ARENA_W = CITY_W + OUTSKIRT_MARGIN * 2;
  var BASE_ARENA_D = CITY_D + OUTSKIRT_MARGIN * 2;
  var ARENA_W = BASE_ARENA_W * MAP_SIZE_MULTIPLIER;
  var ARENA_D = BASE_ARENA_D * MAP_SIZE_MULTIPLIER;
  var MAP_OUTSKIRT_X = (ARENA_W - CITY_W) / 2;
  var MAP_OUTSKIRT_Z = (ARENA_D - CITY_D) / 2;
  var MAP_LINEAR_SCALE = MAP_SIZE_MULTIPLIER;
  var MAIN_TOWN_MIN = 2;
  var MAIN_TOWN_MAX = 5;
  var MAIN_TOWN_TARGET = 0;
  var MICRO_SETTLEMENT_TARGET = Math.max(5, MAP_SIZE_MULTIPLIER * 2);
  var INTEREST_POINT_TARGET = Math.max(18, MAP_SIZE_MULTIPLIER * 7);
  var FIXED_DT = 1 / 60;
  var MAX_ADVANCE_STEPS = 240;
  var MINIMAP_DYNAMIC_INTERVAL = 1 / 30;
  var MAX_PARTICLES = 180;
  var PARTICLE_VISUAL_PREWARM = Math.max(MAX_PARTICLES, 200);
  var SHRAPNEL_TRAIL_VIEW_PAD = 2.4;
  var PROJECTILE_STANDARD_INSTANCE_CAPACITY = 512;
  var PROJECTILE_VISUAL_PREWARM = {
    standard: PROJECTILE_STANDARD_INSTANCE_CAPACITY,
    launcher: 16,
    electric: 16,
    fireShard: 32,
  };
  var MAX_SMOKE_PUFFS = 80;
  var MAX_SHOCKWAVES = 12;
  var SMOKE_PUFF_PREWARM = 96;
  var SHOCKWAVE_PREWARM = 18;
  var MAX_LIGHT_FLASHES = 40;
  var LIGHT_FLASH_PREWARM = MAX_LIGHT_FLASHES;
  var MAX_DECALS = 48;
  var SCORCH_DECAL_VISUAL_PREWARM = MAX_DECALS;
  var MAX_DEBRIS = 120;
  var DEATH_DEBRIS_VISUAL_PREWARM = MAX_DEBRIS;
  var CONTACT_SHADOW_SURFACE_Y = 0.112;
  var MAX_AMMO_CRATES = 4;
  var MAX_XP_ORBS = 90;
  var XP_ORB_VISUAL_PREWARM = MAX_XP_ORBS;
  var AMMO_CRATE_PICKUP_RADIUS = 1.35;
  var MINI_AMMO_CRATE_PICKUP_SCALE = 1 / 3;
  var SILVER_CACHE_KILLS_PER_DROP = 3;
  var XP_PICKUP_RADIUS = 1.1;
  var XP_ATTRACT_RADIUS = 7.5;
  var XP_ORB_SPEED = 8.2;
  var BASE_PLAYER_SPEED = 8.3;
  var BASE_PLAYER_HP = 120;
  var MOBILE_AUTORUN_TRIGGER = 0.92;
  var MOBILE_AUTORUN_KNOB_SCALE = 0.74;
  var AMMO_CRATE_POINTER_RANGE = 34;
  var AMMO_CRATE_POINTER_VIEW_PAD = 1.05;
  var AMMO_CRATE_POINTER_FADE_SPEED = 9.5;
  var AMMO_CRATE_POINTER_HEIGHT = 4.55;
  var AMMO_CRATE_POINTER_OFFSET = 2.05;
  var MIN_PLAYER_PASSAGE = 2.0;
  var MAIN_TOWN_MICRO_BUFFER = 10.5;
  var MICRO_FENCE_ROAD_CLEARANCE = 2.2;
  var ENEMY_BOUNDS_EXTRA = 8.4;
  var ZOMBIE_SPAWN_VIEW_MARGIN_MIN = 4.2;
  var ZOMBIE_SPAWN_VIEW_MARGIN_MAX = 6.0;
  var ZOMBIE_CATCHUP_DISTANCE = 92;
  var ZOMBIE_CATCHUP_VISIBLE_PAD = 4.8;
  var ZOMBIE_CATCHUP_COOLDOWN = 4.5;
  var FAST_ZOMBIE_START_WAVE = 11;
  var FAST_ZOMBIE_CHANCE = 0.1;
  var FAST_ZOMBIE_CHANCE_LATE = 0.16;
  var FAST_ZOMBIE_SPEED_MULTIPLIER = 1.07;
  var FAST_ZOMBIE_SPEED_BONUS = 0.18;
  var ZOMBIES_PER_WAVE_MULTIPLIER = 3;
  var ZOMBIES_PER_WAVE_AFTER_4_MULTIPLIER = 5;
  var ZOMBIES_PER_WAVE_AFTER_9_MULTIPLIER = 7;
  var ZOMBIES_PER_WAVE_AFTER_15_MULTIPLIER = 11;
  var ZOMBIE_SPAWN_BATCH_AFTER_4 = 2;
  var ZOMBIE_SPAWN_BATCH_AFTER_15 = 3;
  var WAVE_LOW_REMAINING_RATIO = 0.1;
  var WAVE_LOW_REMAINING_COUNT = 5;
  var WAVE_LOW_REMAINING_DELAY = 10;
  var WAVE_HARD_LIMIT = 120;
  var WAVE_CLEAR_DELAY = 1.8;
  var OBSTACLE_SPATIAL_CELL_SIZE = 12;
  var ZOMBIE_POOL_PREWARM = {
    walker: 64,
    runner: 34,
    fastZombie: 22,
    brute: 28,
    spitter: 18,
  };
  var ZOMBIE_SPATIAL_CELL_SIZE = 2.8;
  var ZOMBIE_STEER_CACHE_MIN_DISTANCE = 16;
  var ZOMBIE_STEER_CACHE_INTERVAL = 1 / 15;
  var ZOMBIE_STEER_CACHE_DOT = 0.995;
  var ZOMBIE_CLEAR_DIRECTION_OFFSETS = [0, 0.28, -0.28, 0.58, -0.58, 0.95, -0.95, 1.35, -1.35, Math.PI];
  var ZOMBIE_CLEAR_DIRECTION_COS = ZOMBIE_CLEAR_DIRECTION_OFFSETS.map(Math.cos);
  var ZOMBIE_CLEAR_DIRECTION_SIN = ZOMBIE_CLEAR_DIRECTION_OFFSETS.map(Math.sin);
  // Arena cell coordinates stay well inside +/-2048; keep paired numeric keys collision-free.
  var SPATIAL_CELL_KEY_STRIDE = 4096;
  var ENEMY_VISUAL_CULL_PAD = 14;
  var FIRE_VISUAL_CULL_PAD = 9;
  var TRAP_VISUAL_CULL_PAD = 7;
  var LIGHT_VISUAL_CULL_PAD = 12;
  var CLASS_CHOICE_LEVEL = 5;
  var REVOLVER_UPGRADE_LEVEL = 10;
  var REVOLVER_SPECIAL_START_LEVEL = 13;
  var REVOLVER_SPECIAL_INTERVAL = 3;
  var RIFLE_UPGRADE_LEVEL = 10;
  var RIFLE_SPECIAL_START_LEVEL = 13;
  var RIFLE_SPECIAL_INTERVAL = 3;
  var RIFLE_EXTENDED_TUBE_AMMO_PICKUP_BONUS = 36;
  var LAUNCHER_UPGRADE_LEVEL = 10;
  var LAUNCHER_SPECIAL_START_LEVEL = 13;
  var LAUNCHER_SPECIAL_INTERVAL = 3;
  var MARSHAL_UPGRADE_LEVEL = 10;
  var MARSHAL_SPECIAL_START_LEVEL = 13;
  var MARSHAL_SPECIAL_INTERVAL = 3;
  var MARSHAL_MASTERY_DAMAGE_PER_STACK = 0.03;
  var MARSHAL_MASTERY_UPGRADE_IDS = {
    breachMarshal: ["packedBuckshot", "hardCast"],
    graveWarden: ["fineChoke", "sanctifiedLead"],
  };
  var COACH_GUN_BASE_PELLETS = 8;
  var COACH_GUN_BASE_SPREAD = 0.34;
  var COACH_GUN_BASE_RANGE = 15.5;
  var COACH_GUN_POINT_BLANK_RANGE = 4.4;
  var COACH_GUN_MARK_HITS = 5;
  var COACH_GUN_MARK_LIFE = 4;
  var COACH_GUN_MAX_HALLOWED_GROUNDS = 6;
  var MAX_COACH_GUN_TRACERS = 24;
  var PALE_DEPUTY_MAX_COUNT = 3;
  var PALE_DEPUTY_LIFETIME = 12;
  var PALE_DEPUTY_PELLET_DAMAGE = 0.72;
  var PALE_DEPUTY_PELLET_COUNT = COACH_GUN_BASE_PELLETS;
  var PALE_DEPUTY_SPREAD = COACH_GUN_BASE_SPREAD;
  var PALE_DEPUTY_DAMAGE = PALE_DEPUTY_PELLET_DAMAGE * PALE_DEPUTY_PELLET_COUNT;
  var PALE_DEPUTY_ATTACK_COOLDOWN = 0.48;
  var PALE_DEPUTY_ATTACK_RANGE = COACH_GUN_BASE_RANGE;
  var PALE_DEPUTY_TARGET_RADIUS = COACH_GUN_BASE_RANGE;
  var PALE_DEPUTY_HARD_LEASH = 7.5;
  var PALE_DEPUTY_RADIUS = 0.62;
  var PALE_DEPUTY_MODEL_SCALE = 0.78;
  var MAX_PALE_DEPUTY_TRACERS = 21;
  var COACH_GUN_STANDARD_TRACER_COUNT = 7;
  var COACH_GUN_BREACH_TRACER_COUNT = 8;
  var COACH_GUN_GRAVE_TRACER_COUNT = 6;
  var LAUNCHER_CHAIN_BASE_EXPLOSIONS = 2;
  var LAUNCHER_CHAIN_MAX_EXPLOSIONS = 10;
  var LAUNCHER_FULL_SALVO_KILL_THRESHOLD = 4;
  var LAUNCHER_MADMAN_MAX_STACKS = 3;
  var LAUNCHER_MADMAN_STACK_BONUS = 0.5;
  var LAUNCHER_AMMO_CRATE_BONUS = 6;
  var LAUNCHER_BRANCH_AMMO_CRATE_BONUS = 3;
  var LAUNCHER_BOMBARDIER_AMMO_CRATE_BONUS = 3;
  var LAUNCHER_BOMBARDIER_MAGAZINE_MULTIPLIER = 2;
  var LAUNCHER_BLAST_RADIUS_MULTIPLIER = 1.2;
  var LAUNCHER_POWDER_ECHO_COUNT = 3;
  var LAUNCHER_CROSSFIRE_RANGE_MULTIPLIER = 0.82;
  var LAUNCHER_CROSSFIRE_SPEED = 17.5;
  var LAUNCHER_CROSSFIRE_TRAIL_INTERVAL = 0.14;
  var MAX_FIRE_PATCHES = 90;
  var FIRE_PATCH_VISUAL_PREWARM = {
    standard: 10,
    trail: 18,
  };
  var RIFLE_TRAP_VISUAL_PREWARM = 32;
  var FIRE_PATCH_BASE_RADIUS = 2.05;
  var FIRE_PATCH_BASE_LIFE = 12.1;
  var FIRE_PATCH_DAMAGE_INTERVAL = 0.38;
  var FIREPROOF_AMMO_RESTORE_RATE = 1.6;
  var FIREPROOF_HP_REGEN = 3;
  var RIFLE_LIGHTNING_SHOT_INTERVAL = 4;
  var RIFLE_LIGHTNING_BASE_TARGETS = 4;
  var MAX_RIFLE_TRAPS = 240;
  var RIFLE_TRAP_VISUAL_ACTIVE_PREWARM = MAX_RIFLE_TRAPS;
  var RIFLE_TRAP_BASE_BLAST_RADIUS = 2.65;
  var RIFLE_TRAP_POWDER_BLAST_RADIUS = 3.45;
  var RIFLE_AUTO_TRAP_BASE_INTERVAL = 5;
  var RIFLE_AUTO_TRAP_MIN_INTERVAL = 1;
  var RIFLE_AUTO_TRAP_INTERVAL_STEP = 0.5;
  var MAX_LIGHTNING_BOLTS = 28;
  var DUAL_SOFT_AIM_BASE = 0.2;
  var DUELIST_FOCUS_SOFT_AIM_BONUS = 0.38;
  var DUELIST_FOCUS_GAIN_RATE = 0.3;
  var DUELIST_FOCUS_DECAY_RATE = 0.16;
  var SILVER_BULLET_SIZE_MULTIPLIER = 1.5;
  var SILVER_BULLET_SPEED_MULTIPLIER = 1.3;
  var ACID_SPITTER_START_WAVE = 5;
  var ACID_SPITTER_CHANCE = 0.08;
  var ACID_SPITTER_CHANCE_LATE = 0.12;
  var ACID_SPIT_RANGE = 20;
  var ACID_SPIT_MIN_RANGE = 5.2;
  var ACID_SPIT_WINDUP = 0.42;
  var ACID_SPIT_COOLDOWN = 3.1;
  var ACID_SPIT_SPEED = 12.5;
  var ACID_PUDDLE_RADIUS = 2.55;
  var ACID_PUDDLE_LIFE = 5.8;
  var ACID_PUDDLE_DAMAGE = 8;
  var ACID_PUDDLE_DAMAGE_INTERVAL = 0.42;
  var MAX_ACID_PROJECTILES = 12;
  var MAX_ACID_PUDDLES = 10;
  var ACID_PUDDLE_VISUAL_PREWARM = MAX_ACID_PUDDLES;
  var MOBILE_RENDER_MODE = isMobileRuntime();
  var DYNAMIC_LIGHTS_ENABLED = true;

  var root = document.getElementById("game-root");
  var introScreen = document.getElementById("intro-screen");
  var hudHealth = document.getElementById("health-fill");
  var hudWave = document.getElementById("wave-value");
  var hudScore = document.getElementById("score-value");
  var hudKills = document.getElementById("kills-value");
  var hudLevel = document.getElementById("level-value");
  var hudXpFill = document.getElementById("xp-fill");
  var ammoHud = document.getElementById("ammo-hud");
  var ammoStatus = document.getElementById("ammo-status");
  var ammoCurrent = document.getElementById("ammo-current");
  var ammoMax = document.getElementById("ammo-max");
  var ammoReloadFill = document.getElementById("ammo-reload-fill");
  var ammoWeaponIcon = document.getElementById("ammo-weapon-icon");
  var ammoCartridgeRack = document.getElementById("ammo-cartridge-rack");
  var minimapHud = document.getElementById("minimap");
  var minimapCanvas = document.getElementById("minimap-canvas");
  var minimapAmmoCount = document.getElementById("minimap-ammo-count");
  var minimapCtx = minimapCanvas ? minimapCanvas.getContext("2d") : null;
  var minimapStaticCanvas = minimapCanvas ? document.createElement("canvas") : null;
  var minimapStaticCtx = minimapStaticCanvas ? minimapStaticCanvas.getContext("2d") : null;
  var minimapStaticDirty = true;
  var minimapNextDynamicUpdateAt = 0;
  var minimapDynamicCache = {
    ammoCount: "",
  };
  var menu = document.getElementById("menu");
  var gameOverPanel = document.getElementById("game-over");
  var classChoicePanel = document.getElementById("class-choice");
  var revolverUpgradePanel = document.getElementById("revolver-upgrade");
  var rifleUpgradePanel = document.getElementById("rifle-upgrade");
  var launcherUpgradePanel = document.getElementById("launcher-upgrade");
  var marshalUpgradePanel = document.getElementById("marshal-upgrade");
  var levelUpPanel = document.getElementById("level-up-choice");
  var levelUpSubtitle = document.getElementById("level-up-subtitle");
  var levelUpOptions = document.getElementById("level-up-options");
  var gameOverStats = document.getElementById("game-over-stats");
  var startBtn = document.getElementById("start-btn");
  var restartBtn = document.getElementById("restart-btn");
  var menuMusicBtn = document.getElementById("menu-music-btn");
  var pauseMenuBtn = document.getElementById("pause-menu-btn");
  var pauseMenu = document.getElementById("pause-menu");
  var pauseMainPanel = document.getElementById("pause-main-panel");
  var pauseSettingsPanel = document.getElementById("pause-settings-panel");
  var pauseCloseBtn = document.getElementById("pause-close-btn");
  var pauseContinueBtn = document.getElementById("pause-continue-btn");
  var pauseSettingsBtn = document.getElementById("pause-settings-btn");
  var pauseSettingsBackBtn = document.getElementById("pause-settings-back-btn");
  var pauseExitBtn = document.getElementById("pause-exit-btn");
  var controlLayoutBtn = document.getElementById("control-layout-btn");
  var controlLayoutEditor = document.getElementById("control-layout-editor");
  var controlLayoutApplyBtn = document.getElementById("control-layout-apply-btn");
  var controlLayoutResetBtn = document.getElementById("control-layout-reset-btn");
  var musicVolumeInput = document.getElementById("music-volume");
  var musicVolumeValue = document.getElementById("music-volume-value");
  var sfxVolumeInput = document.getElementById("sfx-volume");
  var sfxVolumeValue = document.getElementById("sfx-volume-value");
  var classChoiceButtons = Array.prototype.slice.call(document.querySelectorAll("[data-class]"));
  var revolverUpgradeButtons = Array.prototype.slice.call(document.querySelectorAll("[data-revolver-upgrade]"));
  var rifleUpgradeButtons = Array.prototype.slice.call(document.querySelectorAll("[data-rifle-upgrade]"));
  var launcherUpgradeButtons = Array.prototype.slice.call(document.querySelectorAll("[data-launcher-upgrade]"));
  var marshalUpgradeButtons = Array.prototype.slice.call(document.querySelectorAll("[data-marshal-upgrade]"));
  var classWeaponIcons = Array.prototype.slice.call(document.querySelectorAll("[data-weapon-icon]"));
  var mobileControls = document.getElementById("mobile-controls");
  var moveStick = document.getElementById("move-stick");
  var moveKnob = document.getElementById("move-knob");
  var mobileFire = document.getElementById("mobile-fire");

  var scene = new THREE.Scene();
  scene.background = new THREE.Color(0xcfa269);
  scene.fog = new THREE.Fog(0xcfa269, 42, 125);
  var menuScene = new THREE.Scene();
  menuScene.background = new THREE.Color(0x8f4f2c);
  menuScene.fog = new THREE.Fog(0x8f4f2c, 20, 82);

  var renderer = createGameRenderer();
  root.insertBefore(renderer.domElement, root.firstChild);

  var camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 180);
  var menuCamera = new THREE.PerspectiveCamera(44, 1, 0.1, 220);
  var cameraTarget = new THREE.Vector3(0, 0, 0);
  var menuCameraTarget = new THREE.Vector3(0.5, 2.8, -1.8);
  var cameraBaseOffset = new THREE.Vector3(0, 44, 34);
  var gameplaySun = null;
  var gameplaySunOffset = new THREE.Vector3(-18, 42, 26);
  var gameplaySunRight = new THREE.Vector3();
  var gameplaySunUp = new THREE.Vector3();
  var gameplaySunBack = new THREE.Vector3();
  var gameplayShadowBoundsDirty = true;
  var gameplayShadowTexelX = 0;
  var gameplayShadowTexelY = 0;
  var raycaster = new THREE.Raycaster();
  var pointerNdc = new THREE.Vector2(0, 0);
  var groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  var pointerHit = new THREE.Vector3(0, 0, 6);

  var worldRoot = new THREE.Group();
  var dynamicRoot = new THREE.Group();
  var effectRoot = new THREE.Group();
  scene.add(worldRoot, dynamicRoot, effectRoot);
  var menuWorldRoot = new THREE.Group();
  var menuEffectRoot = new THREE.Group();
  menuScene.add(menuWorldRoot, menuEffectRoot);

  var mats = {};
  var keys = Object.create(null);
  var pointerDown = false;
  var pointerInput = {
    hasPointer: false,
    clientX: 0,
    clientY: 0,
    followOffsetX: 0,
    followOffsetZ: 6,
  };
  var touchMove = {
    active: false,
    pointerId: null,
    baseX: 0,
    baseY: 0,
    x: 0,
    z: 0,
    autoRun: false,
    autoX: 0,
    autoZ: 0,
  };
  var touchFire = {
    active: false,
    pointerId: null,
  };
  var mobileFieldFire = {
    active: false,
    pointerId: null,
  };
  var mobileAimTarget = {
    active: false,
    x: 0,
    z: 0,
    marker: null,
  };
  var lastMobileAim = { x: 0, z: -1 };
  var lastFrame = performance.now();
  var rng = mulberry32(7331);
  var MAP_SEED = createMapSeed();
  var mapRng = mulberry32(MAP_SEED);
  var MAIN_TOWNS = createMainTowns();
  var MAIN_TOWN_CENTER = MAIN_TOWNS[0].center;
  var MAIN_TOWN_LAYOUT = MAIN_TOWNS[0].layout;
  var PLAYER_START = createPlayerStart();
  var obstacleRects = [];
  var obstacleSpatialGrid = new Map();
  var obstacleSpatialGridKeys = [];
  var obstacleSpatialQueryId = 1;
  var obstacleSpatialStats = {
    cellSize: OBSTACLE_SPATIAL_CELL_SIZE,
    cellCount: 0,
    maxBucketSize: 0,
    occupants: 0,
  };
  var mapFootprints = [];
  var microSettlementStats = [];
  var interestPointStats = [];
  var roadSurfaceMeshes = [];
  var terrainPatchMeshes = [];
  var nextMapFootprintId = 1;
  var sharedGeometries = {};
  var zombiePools = createZombiePoolBuckets();
  var zombiePoolCreated = createZombiePoolCounterBuckets();
  var zombiePoolInUse = createZombiePoolCounterBuckets();
  var zombieSpatialGrid = new Map();
  var zombieSpatialGridKeys = [];
  var zombieSpatialBucketPool = [];
  var zombieSeparationScratch = { x: 0, z: 0 };
  var zombieTeleportSideCountScratch = [0, 0, 0, 0];
  var zombieSpatialDirty = true;
  var zombieSpatialStats = {
    cellCount: 0,
    maxBucketSize: 0,
    occupants: 0,
  };
  var gameplayWarmupMode = false;
  var launcherCascadeWarmup = {
    pending: false,
    completed: false,
    stage: 0,
    steps: 0,
    lastMs: 0,
    maxMs: 0,
  };
  var launcherShrapnelResourceWarmup = {
    pending: false,
    completed: false,
    stage: 0,
    steps: 0,
    lastMs: 0,
    maxMs: 0,
    activeItems: [],
  };
  var LAUNCHER_CASCADE_WARMUP_STAGE_COUNT = 10;
  var LAUNCHER_SHRAPNEL_RESOURCE_WARMUP_STAGE_COUNT = 7;
  var LAUNCHER_SHRAPNEL_RESOURCE_PARTICLE_STAGE_SIZE = MAX_PARTICLES;
  var LAUNCHER_SHRAPNEL_RESOURCE_PROJECTILE_STAGE_SIZE = 160;
  var firePatchVisualPools = {
    standard: [],
    trail: [],
  };
  var firePatchVisualCreated = {
    standard: 0,
    trail: 0,
  };
  var firePatchVisualInUse = {
    standard: 0,
    trail: 0,
  };
  var acidPuddleVisualPool = [];
  var acidPuddleVisualCreated = 0;
  var acidPuddleVisualInUse = 0;
  var rifleTrapVisualPool = [];
  var rifleTrapVisualCreated = 0;
  var rifleTrapVisualInUse = 0;
  var rifleTrapBackgroundPrewarmPending = true;
  var launcherWarmupTurn = 0;
  var marshalHallowedVisualPool = [];
  var marshalHallowedVisualCreated = 0;
  var marshalHallowedVisualInUse = 0;
  var paleDeputyPool = [];
  var paleDeputyCreated = 0;
  var paleDeputyInUse = 0;
  var paleDeputyVisibleGroundScratch = {};
  var paleDeputyFormationScratch = { x: 0, z: 0 };
  var paleDeputyClearPointScratch = { x: 0, z: 0 };
  var rifleTrapTargetScratch = [];
  var rifleTrapDistanceScratch = [];
  var shockwaveVisualPool = [];
  var shockwaveVisualCreated = 0;
  var shockwaveVisualInUse = 0;
  var smokePuffVisualPool = [];
  var smokePuffVisualCreated = 0;
  var smokePuffVisualInUse = 0;
  var lightFlashPool = [];
  var lightFlashCreated = 0;
  var lightFlashInUse = 0;
  var scorchDecalVisualPool = [];
  var scorchDecalVisualCreated = 0;
  var scorchDecalVisualInUse = 0;
  var particleVisualPools = {
    box: [],
    sphere: [],
  };
  var particleVisualCreated = {
    box: 0,
    sphere: 0,
  };
  var particleVisualInUse = {
    box: 0,
    sphere: 0,
  };
  var particleInstancedBatches = Object.create(null);
  var particleInstancedBatchList = [];
  var particleMaterialIdCounter = 1;
  var xpOrbVisualPool = [];
  var xpOrbVisualCreated = 0;
  var xpOrbVisualInUse = 0;
  var deathDebrisVisualPool = [];
  var deathDebrisVisualCreated = 0;
  var deathDebrisVisualInUse = 0;
  var projectileVisualPools = {
    standard: [],
    launcher: [],
    electric: [],
    fireShard: [],
  };
  var projectileVisualCreated = {
    standard: 0,
    launcher: 0,
    electric: 0,
    fireShard: 0,
  };
  var projectileVisualInUse = {
    standard: 0,
    launcher: 0,
    electric: 0,
    fireShard: 0,
  };
  var projectileStandardInstancedBatches = Object.create(null);
  var projectileStandardInstancedBatchList = [];
  var projectileStandardMaterialIdCounter = 1;
  var gameplayEffectWarmupDone = false;
  var gameplayEffectWarmupInProgress = false;
  var cameraGroundBounds = { minX: -14, maxX: 14, minZ: -18, maxZ: 18 };
  var cameraMapBounds = {
    minX: -ARENA_W / 2 - 2.5,
    maxX: ARENA_W / 2 + 2.5,
    minZ: -ARENA_D / 2 - 2.5,
    maxZ: ARENA_D / 2 + 2.5,
  };
  var currentAmmoIcon = "";
  var ammoCratePointer = null;
  var ammoVisualState = {
    weapon: "",
    magazine: 0,
    variant: "",
    current: null,
  };
  var ammoHudCache = {
    reloading: null,
    reloadProgress: "",
    statusText: "",
    currentText: "",
    maxText: "",
    ariaLabel: "",
  };
  var hudCache = {
    hpRatio: "",
    wave: "",
    score: "",
    kills: "",
    level: "",
    xpRatio: "",
    interactivitySignature: "",
  };
  var nearestAmmoCrateScratch = [];
  var nearestAmmoCrateDistanceScratch = [];
  var renderDiagnostics = {
    contextLost: false,
    contextLosses: 0,
    recoveries: 0,
    whiteFrames: 0,
    recreates: 0,
    lastReason: "",
    nextHealthCheck: 0,
  };
  var deathDebrisWorldPosScratch = new THREE.Vector3();
  var deathDebrisWorldQuatScratch = new THREE.Quaternion();
  var launcherShrapnelStartScratch = new THREE.Vector3();
  var launcherExplosionEnemiesScratch = [];
  var launcherExplosionDamageScratch = [];
  var launcherExplosionKillScratch = [];
  var delayedExplosionDueScratch = [];
  var launcherShrapnelTrailBudgetScratch = {
    skip: 0,
    spawn: 0,
  };
  var zombieClearDirectionScratch = { x: 0, z: 1 };
  var zombieSteerResultScratch = { x: 0, z: 1 };
  var cameraFollowScratch = { x: 0, z: 0 };
  var visibleGroundFollowScratch = { x: 0, z: 0 };
  var enemyVisibleGroundScratch = {};
  var fireVisibleGroundScratch = {};
  var trapVisibleGroundScratch = {};
  var lightVisibleGroundScratch = {};
  var gameplayShadowAnchorScratch = new THREE.Vector3();
  var moverObstacleQueryScratch = { mover: null, radius: 0, pushed: false };
  var pointObstacleQueryScratch = { x: 0, z: 0, radius: 0 };
  var clearanceObstacleQueryScratch = { x: 0, z: 0, radius: 0, best: 3 };
  var blockingObstacleQueryScratch = { x1: 0, z1: 0, x2: 0, z2: 0, radius: 0, ignoreRect: null, bestRect: null, bestT: Infinity };
  // Callers consume these synchronously; do not retain pooled blocking results in state.
  var blockingObstacleResultPool = [{ rect: null, t: Infinity }, { rect: null, t: Infinity }, { rect: null, t: Infinity }, { rect: null, t: Infinity }];
  var blockingObstacleResultCursor = 0;
  var particleInstanceMatrixScratch = new THREE.Matrix4();
  var particleInstancePositionScratch = new THREE.Vector3();
  var particleInstanceScaleScratch = new THREE.Vector3();
  var particleInstanceQuaternion = new THREE.Quaternion();
  var projectileInstanceMatrixScratch = new THREE.Matrix4();
  var projectileInstancePositionScratch = new THREE.Vector3();
  var projectileInstanceScaleScratch = new THREE.Vector3();
  var projectileInstanceQuaternionScratch = new THREE.Quaternion();
  var coachGunTracerStartScratch = { x: 0, y: 0, z: 0 };
  var coachGunTracerSizeScratch = { width: 0, length: 0 };
  var menuState = {
    time: 0,
    pointerX: 0,
    pointerY: 0,
    cowboy: null,
    zombies: [],
    dust: [],
    firePits: [],
    signLights: [],
    cameraDrift: 0,
  };
  var MENU_MUSIC_STORAGE_KEY = "dustAndDeadMenuMusic";
  var AUDIO_VOLUME_STORAGE_PREFIX = "dustAndDeadAudioVolume.";
  var CONTROL_LAYOUT_STORAGE_KEY = "dustAndDeadControlLayout";
  var MENU_MUSIC_VOLUME = 1;
  var GAME_MUSIC_VOLUME = 1;
  var GAME_MUSIC_INSTRUMENT_BOOST = 4.35;
  var GAME_MUSIC_TEMPO = 116;
  var REVOLVER_HAMMER_LEAD_TIME = 0.045;
  var LAUNCHER_EXPLOSION_AUDIO_GROUP_WINDOW_MS = 42;
  var LAUNCHER_EXPLOSION_AUDIO_GROUP_RADIUS = 6.5;
  var LAUNCHER_EXPLOSION_AUDIO_FULL_WINDOW = 0.12;
  var LAUNCHER_EXPLOSION_AUDIO_FULL_LIMIT = 7;
  var LAUNCHER_EXPLOSION_AUDIO_MAX_GROUPS = 8;
  var LAUNCHER_EXPLOSION_AUDIO_WARMUP_LEVEL = 0.82;
  var AUDIO_DISCONNECT_BATCH_SIZE = 80;
  var AUDIO_DISCONNECT_TICK_MS = 16;
  var introActive = !!introScreen && introScreen.classList.contains("is-visible");
  var audioState = {
    ctx: null,
    masterGain: null,
    musicGain: null,
    sfxGain: null,
    sfxLimiter: null,
    sfxWarmupDestination: null,
    menuGain: null,
    gameGain: null,
    gameExploreGain: null,
    gameBattleGain: null,
    noiseBuffer: null,
    shotNoiseBuffer: null,
    rifleShotBuffer: null,
    zombieHitSfxLastAt: 0,
    zombieHitSfxBurstWindow: 0,
    zombieHitSfxBurstCount: 0,
    launcherWhistleCount: 0,
    transientAudioNodeCount: 0,
    audioDisconnectQueue: [],
    audioDisconnectTimer: null,
    launcherExplosionAudioWindowStart: 0,
    launcherExplosionAudioFullCount: 0,
    launcherExplosionAudioGroups: [],
    launcherExplosionAudioFlushTimer: null,
    launcherExplosionAudioGraphReady: false,
    launcherExplosionAudioStats: {
      grouped: 0,
      mergedGroups: 0,
      fullPlayed: 0,
      compactPlayed: 0,
    },
    enabled: readStoredAudioEnabled(),
    musicVolume: readStoredAudioVolume("music", 1),
    sfxVolume: readStoredAudioVolume("sfx", 1),
    unlocked: false,
    menu: {
      desired: true,
      active: false,
      scheduler: null,
      nextStepTime: 0,
      step: 0,
      tempo: 104,
      nodes: [],
    },
    game: {
      desired: false,
      active: false,
      scheduler: null,
      nextStepTime: 0,
      step: 0,
      tempo: GAME_MUSIC_TEMPO,
      nodes: [],
      battleAmount: 0,
      battleTarget: 0,
      danger: 0,
    },
  };
  var controlLayoutState = {
    saved: readStoredControlLayout(),
    draft: null,
    draftIsDefault: false,
    editing: false,
    drag: null,
  };
  var WEAPONS = {
    revolver: {
      id: "revolver",
      label: "Revolver",
      shortLabel: "REV",
      cost: 0,
      magazine: 6,
      reserveStart: 30,
      reloadTime: 1.05,
      cooldown: 0.22,
      damage: 1,
      speed: 29,
      life: 0.76,
      hitRadius: 0.24,
      width: 0.14,
      length: 0.82,
      muzzleDistance: 0.95,
      muzzleY: 1.18,
      shake: 0.18,
    },
    rifle: {
      id: "rifle",
      label: "Winchester",
      shortLabel: "WIN",
      cost: 300,
      magazine: 18,
      reserveStart: 54,
      reloadTime: 1.55,
      cooldown: 0.14,
      damage: 2,
      speed: 43,
      life: 1.02,
      hitRadius: 0.18,
      width: 0.1,
      length: 1.24,
      muzzleDistance: 1.42,
      muzzleY: 1.24,
      shake: 0.13,
    },
    launcher: {
      id: "launcher",
      label: "Launcher",
      shortLabel: "GL",
      cost: 900,
      magazine: 3,
      reserveStart: 18,
      reloadTime: 2.05,
      cooldown: 0.92,
      damage: 0,
      speed: 15.5,
      life: 1.35,
      range: 22.5,
      hitRadius: 0.45,
      width: 0.34,
      length: 0.5,
      muzzleDistance: 1.18,
      muzzleY: 1.26,
      blastRadius: 3.15,
      blastDamage: 4,
      shake: 0.38,
    },
    coachGun: {
      id: "coachGun",
      label: "Coach Gun",
      shortLabel: "COACH",
      cost: 0,
      magazine: 2,
      reserveStart: 30,
      reloadTime: 0.62,
      cooldown: 0.48,
      damage: 0.72,
      speed: 36,
      life: 0.44,
      range: COACH_GUN_BASE_RANGE,
      hitRadius: 0.16,
      width: 0.08,
      length: 0.48,
      muzzleDistance: 1.22,
      muzzleY: 1.25,
      shake: 0.34,
    },
  };
  var PLAYER_CLASSES = {
    gunslinger: {
      id: "gunslinger",
      label: "Gunslinger",
      weapon: "revolver",
      revolverDamageMultiplier: 2,
      revolverAmmoPickupBonus: 12,
    },
    ranger: {
      id: "ranger",
      label: "Ranger",
      weapon: "rifle",
    },
    demolitionist: {
      id: "demolitionist",
      label: "Demolitionist",
      weapon: "launcher",
    },
    marshal: {
      id: "marshal",
      label: "Marshal",
      weapon: "coachGun",
    },
  };
  var REVOLVER_UPGRADES = {
    dualRevolvers: {
      id: "dualRevolvers",
      label: "Dual Revolvers",
      revolverMagazineBonus: 6,
      revolverReserveBonus: 24,
      revolverAmmoPickupBonus: 24,
      revolverDamageMultiplier: 2,
    },
    bigIron: {
      id: "bigIron",
      label: "Big Iron",
      revolverMagazineBonus: 0,
      revolverReserveBonus: 0,
      revolverAmmoPickupBonus: 12,
      revolverDamageMultiplier: 4,
    },
  };
  var RIFLE_UPGRADES = {
    leverBarrage: {
      id: "leverBarrage",
      label: "Lever Barrage",
      rifleAmmoPickupBonus: 36,
    },
    trailWarden: {
      id: "trailWarden",
      label: "Trail Warden",
      rifleAmmoPickupBonus: 0,
    },
  };
  var LAUNCHER_UPGRADES = {
    bombardier: {
      id: "bombardier",
      label: "Bombardier",
      launcherMagazineMultiplier: LAUNCHER_BOMBARDIER_MAGAZINE_MULTIPLIER,
    },
    pyrotechnician: {
      id: "pyrotechnician",
      label: "Pyrotechnician",
    },
  };
  var MARSHAL_UPGRADES = {
    breachMarshal: {
      id: "breachMarshal",
      label: "Breach Marshal",
    },
    graveWarden: {
      id: "graveWarden",
      label: "Grave Warden",
    },
  };
  var STANDARD_UPGRADES = [
    {
      id: "swiftBoots",
      title: "Swift Boots",
      description: "+5% move speed. No cap.",
      symbol: "SPD",
      rank: "2",
      suit: "H",
      color: "red",
      apply: function () {
        state.moveSpeedBonus += 0.05;
        if (state.player) state.player.speed = BASE_PLAYER_SPEED * (1 + state.moveSpeedBonus);
      },
    },
    {
      id: "steadyHand",
      title: "Steady Hand",
      description: "+10% damage for every weapon.",
      symbol: "DMG",
      rank: "3",
      suit: "S",
      color: "black",
      apply: function () {
        state.globalDamageBonus += 0.1;
      },
    },
    {
      id: "quickReload",
      title: "Quick Reload",
      description: "+12% faster reloads.",
      symbol: "RLD",
      rank: "4",
      suit: "D",
      color: "red",
      apply: function () {
        state.reloadSpeedBonus += 0.12;
      },
    },
    {
      id: "hairTrigger",
      title: "Hair Trigger",
      description: "+8% faster shooting.",
      symbol: "ROF",
      rank: "5",
      suit: "C",
      color: "black",
      apply: function () {
        state.fireRateBonus += 0.08;
      },
    },
    {
      id: "scavengerLuck",
      title: "Scavenger's Luck",
      description: "+10% ammo from every crate.",
      symbol: "AMO",
      rank: "6",
      suit: "D",
      color: "red",
      apply: function () {
        state.ammoPickupBonus += 0.1;
      },
    },
    {
      id: "grit",
      title: "Grit",
      description: "+15 max HP and heal 15.",
      symbol: "HP",
      rank: "7",
      suit: "S",
      color: "black",
      apply: function () {
        state.maxHpBonus += 15;
        if (state.player) {
          state.player.maxHp += 15;
          state.player.hp = Math.min(state.player.maxHp, state.player.hp + 15);
        }
      },
    },
    {
      id: "desertMender",
      title: "Desert Mender",
      description: "+0.4 HP regenerated each second.",
      symbol: "REG",
      rank: "8",
      suit: "H",
      color: "red",
      apply: function () {
        state.hpRegen += 0.4;
      },
    },
    {
      id: "luckyMagnet",
      title: "Lucky Magnet",
      description: "+25% XP pickup and pull reach.",
      symbol: "MAG",
      rank: "9",
      suit: "C",
      color: "black",
      apply: function () {
        state.xpPickupRadiusBonus += 0.25;
      },
    },
    {
      id: "xpHunger",
      title: "XP Hunger",
      description: "+10% XP from every pickup.",
      symbol: "XP",
      rank: "10",
      suit: "H",
      color: "red",
      apply: function () {
        state.xpGainBonus += 0.1;
      },
    },
    {
      id: "longReach",
      title: "Long Reach",
      description: "+10% weapon attack range.",
      symbol: "RNG",
      rank: "J",
      suit: "S",
      color: "black",
      apply: function () {
        state.attackRangeBonus += 0.1;
      },
    },
  ];
  var REVOLVER_SPECIAL_UPGRADES = [
    {
      id: "ricochetRounds",
      branch: "dualRevolvers",
      title: "Ricochet Rounds",
      description: "Revolver bullets bounce to 1 nearby enemy.",
      symbol: "RCH",
      rank: "A",
      suit: "D",
      color: "red",
    },
    {
      id: "moreRicochets",
      branch: "dualRevolvers",
      title: "More Ricochets",
      description: "+1 extra ricochet. Can stack.",
      symbol: "+R",
      rank: "2",
      suit: "D",
      color: "red",
      repeatable: true,
      requires: ["ricochetRounds"],
    },
    {
      id: "softAim",
      branch: "dualRevolvers",
      title: "Soft Aim",
      description: "Bullets bend more toward enemies ahead.",
      symbol: "AIM",
      rank: "K",
      suit: "H",
      color: "red",
    },
    {
      id: "fanTheHammer",
      branch: "dualRevolvers",
      title: "Fan the Hammer",
      description: "Kills trigger 1.8s of rapid fire.",
      symbol: "FAN",
      rank: "Q",
      suit: "H",
      color: "red",
    },
    {
      id: "trickShot",
      branch: "dualRevolvers",
      title: "Trick Shot",
      description: "Ricochets deal +35% damage per bounce.",
      symbol: "TRK",
      rank: "J",
      suit: "D",
      color: "red",
      requires: ["ricochetRounds"],
    },
    {
      id: "duelistFocus",
      branch: "dualRevolvers",
      title: "Duelist's Focus",
      description: "Moving safely builds stronger Soft Aim faster.",
      symbol: "DFS",
      rank: "10",
      suit: "H",
      color: "red",
      requires: ["softAim"],
    },
    {
      id: "allRightAllLeft",
      branch: "dualRevolvers",
      title: "ALL RIGHT",
      subtitle: "& all left",
      description: "One fires, one reloads. Kills add up to 4 free rounds.",
      symbol: "R/L",
      rank: "9",
      suit: "D",
      color: "red",
    },
    {
      id: "silverBullet",
      branch: "bigIron",
      title: "Silver Bullet",
      description: "Last Big Iron round: x3 damage, x1.5 size, x1.3 speed.",
      symbol: "SIL",
      rank: "A",
      suit: "S",
      color: "black",
    },
    {
      id: "silverCache",
      branch: "bigIron",
      title: "Silver Cache",
      description: "Every 3rd Silver Bullet kill drops a 1/3-ammo mini crate.",
      symbol: "BOX",
      rank: "2",
      suit: "S",
      color: "black",
      requires: ["silverBullet"],
    },
    {
      id: "executioner",
      branch: "bigIron",
      title: "Executioner",
      description: "Big Iron finishes enemies below 28% HP.",
      symbol: "EXE",
      rank: "K",
      suit: "S",
      color: "black",
      minLevel: 16,
    },
    {
      id: "biggerCaliber",
      branch: "bigIron",
      title: "Bigger Caliber",
      description: "Bigger Big Iron bullet and hitbox.",
      symbol: "CAL",
      rank: "Q",
      suit: "C",
      color: "black",
      repeatable: true,
    },
    {
      id: "heavyRupture",
      branch: "bigIron",
      title: "Heavy Rupture",
      description: "Piercing shots end in a shockwave.",
      symbol: "RUP",
      rank: "J",
      suit: "S",
      color: "black",
      requires: ["throughAndThrough"],
    },
    {
      id: "leadBloom",
      branch: "bigIron",
      title: "Lead Bloom",
      description: "Big Iron kills split into 2 side bullets.",
      symbol: "BLM",
      rank: "10",
      suit: "C",
      color: "black",
    },
    {
      id: "throughAndThrough",
      branch: "bigIron",
      title: "Through and Through",
      description: "Each pierce gives the next hit +25% damage.",
      symbol: "THR",
      rank: "9",
      suit: "S",
      color: "black",
    },
  ];
  var RIFLE_SPECIAL_UPGRADES = [
    {
      id: "extendedTube",
      branch: "leverBarrage",
      title: "Extended Tube",
      description: "Winchester magazine becomes x2. Crates give +36 rifle ammo.",
      symbol: "TUB",
      rank: "A",
      suit: "H",
      color: "red",
      apply: function () {
        var previousMagazine = getWeaponMagazine(WEAPONS.rifle);
        state.rifleMagazineMultiplier = Math.max(state.rifleMagazineMultiplier || 1, 2);
        state.rifleAmmoPickupBonus += RIFLE_EXTENDED_TUBE_AMMO_PICKUP_BONUS;
        resizeWeaponAmmo("rifle", previousMagazine, getWeaponMagazine(WEAPONS.rifle));
      },
    },
    {
      id: "trailLoader",
      branch: "leverBarrage",
      title: "Trail Loader",
      description: "Every 3 rifle kills restores 3 shots.",
      symbol: "LOD",
      rank: "K",
      suit: "H",
      color: "red",
    },
    {
      id: "chainLightning",
      branch: "leverBarrage",
      title: "Chain Lightning",
      description: "Every 4th rifle shot shocks 4 enemies.",
      symbol: "LIT",
      rank: "Q",
      suit: "D",
      color: "red",
      apply: function () {
        state.rifleShotsFired = 0;
      },
    },
    {
      id: "stormTempo",
      branch: "leverBarrage",
      title: "Storm Tempo",
      description: "Lightning gives 1.65s faster rifle fire.",
      symbol: "STM",
      rank: "J",
      suit: "D",
      color: "red",
      requires: ["chainLightning"],
    },
    {
      id: "snapTraps",
      branch: "trailWarden",
      title: "Snap Traps",
      description: "Rifle hits plant damaging traps.",
      symbol: "TRP",
      rank: "A",
      suit: "C",
      color: "black",
    },
    {
      id: "baitedTrap",
      branch: "trailWarden",
      title: "Baited Trap",
      description: "Traps lure up to 5 nearby zombies.",
      symbol: "BTE",
      rank: "K",
      suit: "C",
      color: "black",
      requires: ["snapTraps"],
    },
    {
      id: "trailLayer",
      branch: "trailWarden",
      title: "Trail Layer",
      description: "You leave a trap every 5 seconds.",
      symbol: "LAY",
      rank: "Q",
      suit: "S",
      color: "black",
      apply: function () {
        state.rifleAutoTrapTimer = getRifleAutoTrapInterval();
      },
    },
    {
      id: "quickerTrail",
      branch: "trailWarden",
      title: "Quicker Trail",
      description: "Auto-traps appear faster, down to 1s.",
      symbol: "QTR",
      rank: "J",
      suit: "S",
      color: "black",
      repeatable: true,
      maxStacks: 8,
      requires: ["trailLayer"],
      apply: function () {
        state.rifleAutoTrapFrequency += 1;
        state.rifleAutoTrapTimer = Math.min(state.rifleAutoTrapTimer || 0, getRifleAutoTrapInterval());
      },
    },
    {
      id: "powderTrap",
      branch: "trailWarden",
      title: "Powder Trap",
      description: "Traps get larger radius and 5 damage.",
      symbol: "PWD",
      rank: "10",
      suit: "C",
      color: "black",
      requires: ["snapTraps"],
    },
    {
      id: "salvagedTrap",
      branch: "trailWarden",
      title: "Salvaged Trap",
      description: "Trap kills restore 2 shots and drop XP.",
      symbol: "SLV",
      rank: "9",
      suit: "S",
      color: "black",
      requires: ["snapTraps"],
    },
  ];
  var LAUNCHER_SPECIAL_UPGRADES = [
    {
      id: "clusterCharge",
      branch: "bombardier",
      title: "Cluster Charge",
      description: "Main launcher blasts split into 3 bomblets.",
      symbol: "CLS",
      rank: "A",
      suit: "S",
      color: "black",
    },
    {
      id: "moreBomblets",
      branch: "bombardier",
      title: "More Bomblets",
      description: "+1 bomblet after each blast. Max 5.",
      symbol: "+B",
      rank: "K",
      suit: "S",
      color: "black",
      repeatable: true,
      maxStacks: 5,
      requires: ["clusterCharge"],
    },
    {
      id: "chainDetonation",
      branch: "bombardier",
      title: "Chain Detonation",
      description: "Explosion kills trigger up to 2 side blasts.",
      symbol: "CHN",
      rank: "Q",
      suit: "C",
      color: "black",
    },
    {
      id: "moreChainDetonations",
      branch: "bombardier",
      title: "Longer Chain",
      description: "+1 secondary blast. Max 10.",
      symbol: "+C",
      rank: "J",
      suit: "C",
      color: "black",
      repeatable: true,
      maxStacks: LAUNCHER_CHAIN_MAX_EXPLOSIONS - LAUNCHER_CHAIN_BASE_EXPLOSIONS,
      requires: ["chainDetonation"],
    },
    {
      id: "heavyPayload",
      branch: "bombardier",
      title: "Heavy Payload",
      description: "+34% blast radius, +2 damage, airburst.",
      symbol: "HVY",
      rank: "10",
      suit: "S",
      color: "black",
    },
    {
      id: "fullSalvo",
      branch: "bombardier",
      title: "Full Salvo",
      description: "4 explosion or shrapnel kills refill the magazine.",
      symbol: "SAL",
      rank: "9",
      suit: "C",
      color: "black",
    },
    {
      id: "shrapnelRain",
      branch: "bombardier",
      title: "Shrapnel Rain",
      description: "Blasts throw hot fragments outward.",
      symbol: "SHR",
      rank: "8",
      suit: "S",
      color: "black",
      requires: ["heavyPayload"],
    },
    {
      id: "powderEcho",
      branch: "bombardier",
      title: "Powder Echo",
      description: "Every 3rd grenade echoes outward 3 times.",
      symbol: "ECH",
      rank: "7",
      suit: "C",
      color: "black",
    },
    {
      id: "madmansJourney",
      branch: "bombardier",
      title: "Madman's Journey",
      description: "Multi-kill grenades ramp fire rate to x2.5.",
      symbol: "MAD",
      rank: "6",
      suit: "S",
      color: "black",
    },
    {
      id: "napalmShells",
      branch: "pyrotechnician",
      title: "Napalm Shells",
      description: "Explosions leave burning ground.",
      symbol: "NAP",
      rank: "A",
      suit: "H",
      color: "red",
      starter: true,
    },
    {
      id: "rollingFlame",
      branch: "pyrotechnician",
      title: "Rolling Flame",
      description: "Each grenade drags a fire trail.",
      symbol: "ROL",
      rank: "K",
      suit: "D",
      color: "red",
    },
    {
      id: "fireproofPowder",
      branch: "pyrotechnician",
      title: "Fireproof Powder",
      description: "Stand in fire: free shots, ammo, +3 HP/s.",
      symbol: "FRP",
      rank: "Q",
      suit: "H",
      color: "red",
      requires: ["rollingFlame"],
      starter: true,
      apply: function () {
        state.launcherFireAmmoAccumulator = 0;
      },
    },
    {
      id: "longBurn",
      branch: "pyrotechnician",
      title: "Long Burn",
      description: "Fire lasts +2.1 seconds longer.",
      symbol: "LNG",
      rank: "J",
      suit: "D",
      color: "red",
      repeatable: true,
      maxStacks: 5,
      requiresAny: ["napalmShells", "rollingFlame"],
    },
    {
      id: "hotterFire",
      branch: "pyrotechnician",
      title: "Hotter Fire",
      description: "+1 damage per fire tick. Can stack.",
      symbol: "HOT",
      rank: "10",
      suit: "H",
      color: "red",
      repeatable: true,
      maxStacks: 5,
      requiresAny: ["napalmShells", "rollingFlame"],
    },
    {
      id: "scorchedEarth",
      branch: "pyrotechnician",
      title: "Scorched Earth",
      description: "Burning ground slows zombies.",
      symbol: "SLW",
      rank: "9",
      suit: "D",
      color: "red",
      requiresAny: ["napalmShells", "rollingFlame"],
    },
    {
      id: "thermiteCore",
      branch: "pyrotechnician",
      title: "Thermite Core",
      description: "+20% fire radius, +1 fire damage, self-fire.",
      symbol: "THM",
      rank: "8",
      suit: "H",
      color: "red",
      requires: ["hotterFire"],
    },
    {
      id: "backdraft",
      branch: "pyrotechnician",
      title: "Backdraft",
      description: "Fire kills burst into extra flame patches.",
      symbol: "BDR",
      rank: "7",
      suit: "D",
      color: "red",
      requiresAny: ["napalmShells", "rollingFlame"],
    },
    {
      id: "crossfireShells",
      branch: "pyrotechnician",
      title: "Crossfire Shells",
      description: "Landing blasts fire 2 burning side shards.",
      symbol: "T",
      rank: "6",
      suit: "H",
      color: "red",
      requiresAny: ["napalmShells", "rollingFlame"],
    },
  ];
  var MARSHAL_SPECIAL_UPGRADES = [
    {
      id: "doorKicker",
      branch: "breachMarshal",
      title: "Door Kicker",
      description: "4+ pellets stun and launch the target.",
      rank: "A",
      suit: "D",
      color: "red",
      starter: true,
    },
    {
      id: "doubleTap",
      branch: "breachMarshal",
      title: "Double Tap",
      description: "A quick second shot fires faster and hits 20% harder.",
      rank: "K",
      suit: "H",
      color: "red",
      starter: true,
    },
    {
      id: "lastWord",
      branch: "breachMarshal",
      title: "Last Word",
      description: "Your final shell deals +45% damage and knockback.",
      rank: "Q",
      suit: "D",
      color: "red",
      starter: true,
    },
    {
      id: "shellCatcher",
      branch: "breachMarshal",
      title: "Shell Catcher",
      description: "3 close kills grant one shell; overflow goes to reserve.",
      rank: "J",
      suit: "H",
      color: "red",
      minLevel: 16,
    },
    {
      id: "buckAndBall",
      branch: "breachMarshal",
      title: "Buck and Ball",
      description: "Each blast carries one long-range heavy ball.",
      rank: "10",
      suit: "D",
      color: "red",
      minLevel: 16,
    },
    {
      id: "rideTheRecoil",
      branch: "breachMarshal",
      title: "Ride the Recoil",
      description: "Hit 3 enemies to gain +30% speed for 1.25s.",
      rank: "9",
      suit: "H",
      color: "red",
      minLevel: 16,
    },
    {
      id: "bonebreaker",
      branch: "breachMarshal",
      title: "Bonebreaker",
      description: "Launched enemies hurt and stun what they collide with.",
      rank: "8",
      suit: "D",
      color: "red",
      minLevel: 19,
      requires: ["doorKicker"],
    },
    {
      id: "noTimeToBleed",
      branch: "breachMarshal",
      title: "No Time to Bleed",
      description: "Every 6 close kills restore 4 HP.",
      rank: "7",
      suit: "H",
      color: "red",
      minLevel: 19,
    },
    {
      id: "packedBuckshot",
      branch: "breachMarshal",
      title: "Packed Buckshot",
      description: "+1 pellet per blast. Up to 4 stacks.",
      rank: "6",
      suit: "D",
      color: "red",
      repeatable: true,
      maxStacks: 4,
      minLevel: 16,
    },
    {
      id: "hardCast",
      branch: "breachMarshal",
      title: "Hard Cast",
      description: "+10% close damage and knockback. Max 5 stacks.",
      rank: "5",
      suit: "H",
      color: "red",
      repeatable: true,
      maxStacks: 5,
      minLevel: 16,
    },
    {
      id: "rockSalt",
      branch: "graveWarden",
      title: "Rock Salt",
      description: "Consecrated targets are slowed by 25%.",
      rank: "A",
      suit: "S",
      color: "black",
      starter: true,
    },
    {
      id: "stillness",
      branch: "graveWarden",
      title: "Stillness",
      description: "Hold fire 1.2s: tighter spread and +45% damage.",
      rank: "K",
      suit: "C",
      color: "black",
      starter: true,
    },
    {
      id: "lastRites",
      branch: "graveWarden",
      title: "Last Rites",
      description: "A marked Coach Gun kill raises a Pale Deputy for 12s. Max 3.",
      rank: "Q",
      suit: "S",
      color: "black",
      starter: true,
    },
    {
      id: "graveTithe",
      branch: "graveWarden",
      title: "Grave Tithe",
      description: "Every 2 marked kills grant one shell; overflow goes to reserve.",
      rank: "J",
      suit: "C",
      color: "black",
      minLevel: 16,
    },
    {
      id: "heavensBounty",
      branch: "graveWarden",
      title: "Heaven's Bounty",
      description: "A dangerous foe is marked every 12s for XP and 2 shells.",
      rank: "10",
      suit: "S",
      color: "black",
      minLevel: 16,
    },
    {
      id: "passingJudgment",
      branch: "graveWarden",
      title: "Passing Judgment",
      description: "A slain mark passes to two nearby enemies.",
      rank: "9",
      suit: "C",
      color: "black",
      minLevel: 19,
      requires: ["lastRites"],
    },
    {
      id: "purifyingSalt",
      branch: "graveWarden",
      title: "Purifying Salt",
      description: "Pellets erase acid; cleansing hastens reload.",
      rank: "8",
      suit: "S",
      color: "black",
      minLevel: 16,
    },
    {
      id: "hallowedGround",
      branch: "graveWarden",
      title: "Hallowed Ground",
      description: "Marked elite deaths sanctify ground: slow foes, reload +25%.",
      rank: "7",
      suit: "C",
      color: "black",
      minLevel: 19,
      requires: ["heavensBounty"],
    },
    {
      id: "fineChoke",
      branch: "graveWarden",
      title: "Fine Choke",
      description: "+7% reach and a tighter pattern. Up to 5 stacks.",
      rank: "6",
      suit: "S",
      color: "black",
      repeatable: true,
      maxStacks: 5,
      minLevel: 16,
    },
    {
      id: "sanctifiedLead",
      branch: "graveWarden",
      title: "Sanctified Lead",
      description: "+12% damage to marked enemies. Up to 5 stacks.",
      rank: "5",
      suit: "C",
      color: "black",
      repeatable: true,
      maxStacks: 5,
      minLevel: 16,
    },
  ];
  var DUAL_REVOLVER_HANDS = ["right", "left"];
  var DUAL_REVOLVER_HAND_SIDES = { right: -1, left: 1 };
  var DUAL_REVOLVER_FREE_RELOAD_MAX = 4;
  var DUAL_REVOLVER_HAND_MAGAZINE = WEAPONS.revolver.magazine;

  var UPGRADE_ICONS = {
    swiftBoots: `
      <svg
        class="upgrade-card__icon"
        color="#9B1B1B"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 128 128"
        focusable="false"
        aria-hidden="true"
      >
        <path
          fill="currentColor"
          fill-rule="evenodd"
          clip-rule="evenodd"
          d="
            M16.6 74.4L16.7 75.4L17.5 75.9L29.9 75.9L30.6 75.4L30.8 74.9L30.6 74.1L29.7 73.6L17.7 73.6L16.9 73.9Z
            M11.0 63.6L11.1 64.5L11.9 65.1L31.1 65.1L31.6 64.9L32.2 64.1L31.9 63.3L31.1 62.8L11.9 62.8L11.6 62.9Z
            M16.5 53.1L16.8 53.9L17.8 54.3L30.4 54.3L31.0 54.1L31.5 53.4L31.3 52.4L30.7 52.0L17.4 52.0L16.7 52.5Z
            M37.0 25.1L35.0 27.0L33.9 28.6L33.0 30.4L32.6 32.3L33.9 38.7L35.9 50.3L37.2 59.4L37.7 65.2L37.7 71.9L36.2 77.8L35.7 80.8L35.8 85.2L36.3 87.7L36.7 88.7L36.3 89.5L36.2 90.2L41.2 103.4L41.9 103.8L55.3 103.8L55.7 103.6L56.0 103.0L56.0 98.2L56.7 97.6L57.6 97.8L59.1 98.6L64.7 102.7L67.4 104.0L71.0 105.0L75.6 105.5L83.7 105.4L90.3 104.5L98.1 102.6L102.4 101.2L106.2 99.5L106.7 98.9L106.9 98.3L106.7 95.9L106.5 95.4L105.6 94.7L105.6 93.9L105.0 92.3L104.1 91.3L102.3 90.5L96.9 90.5L92.7 89.9L88.7 88.7L85.6 87.3L82.1 85.0L79.3 82.8L75.6 78.9L74.0 76.6L72.9 74.5L71.7 71.5L70.8 68.2L70.5 65.8L70.4 61.7L71.2 50.9L72.7 39.6L73.9 32.7L73.9 31.2L73.6 30.0L73.0 28.7L71.3 26.3L69.8 24.8L67.2 23.0L64.5 21.7L62.3 21.0L58.1 20.3L57.9 19.3L57.3 18.7L56.7 18.5L47.7 18.6L47.0 19.2L46.7 19.6L46.7 20.5L46.5 20.7L44.8 21.1L41.4 22.4L38.8 23.8Z
            M38.6 90.9L39.8 90.8L49.4 92.0L55.5 93.1L57.9 93.9L60.1 95.0L65.1 98.4L68.4 100.1L71.5 101.2L75.1 101.8L80.3 102.0L84.2 101.8L88.2 101.3L95.3 99.7L100.5 98.2L104.5 96.8L105.0 97.0L105.0 98.0L104.3 98.5L97.6 100.8L89.7 102.8L82.5 103.7L75.1 103.7L70.6 103.1L67.8 102.2L65.7 101.2L59.9 97.0L57.1 95.6L53.3 94.6L53.1 102.0L42.8 102.0Z
            M39.3 73.9L45.3 78.0L48.2 79.3L50.6 80.1L52.3 80.4L52.7 80.7L52.8 90.5L38.9 88.8L38.3 87.4L37.8 85.3L37.6 82.1L38.0 78.9Z
            M54.6 81.1L55.4 81.0L58.1 81.5L61.6 81.5L63.5 81.1L65.5 80.2L66.8 78.9L67.4 77.4L67.4 75.1L66.8 72.7L66.9 71.0L67.9 68.9L68.6 68.1L68.9 68.1L70.1 72.9L71.1 75.3L72.7 78.1L74.1 80.1L76.2 82.6L80.0 85.9L84.4 88.8L87.2 90.1L90.0 91.2L94.8 92.2L102.5 92.5L103.5 93.4L103.9 95.0L101.7 95.9L95.6 97.8L90.4 99.0L86.9 99.6L83.3 100.0L77.8 100.1L74.4 99.8L71.6 99.2L69.2 98.4L67.2 97.4L62.0 93.9L58.7 92.2L54.8 90.9Z
            M46.6 28.0L47.0 28.1L47.2 33.9L47.6 35.5L48.1 36.3L49.1 37.4L50.0 37.9L51.3 38.3L51.5 38.9L52.5 71.6L52.5 78.5L49.6 77.8L46.7 76.6L43.9 74.8L39.6 71.6L39.6 65.5L39.1 59.4L38.0 50.6L35.6 35.6L37.1 33.6L38.8 31.8L40.1 30.8L42.8 29.3Z
            M39.0 36.0L39.0 36.3L41.1 39.1L42.2 41.2L42.6 42.9L42.5 45.6L42.1 46.9L41.1 48.5L40.5 50.3L40.5 53.7L40.9 55.0L41.9 56.5L43.0 57.7L44.4 58.6L44.7 58.6L44.6 58.2L43.4 56.7L42.2 54.5L41.6 52.5L41.9 50.4L43.6 46.6L44.0 44.8L43.9 42.6L43.2 40.4L43.3 40.1L44.1 40.7L44.9 41.9L46.0 44.3L46.4 46.3L46.2 49.3L45.7 50.9L44.7 53.0L43.8 54.3L43.7 54.8L44.2 55.0L46.4 54.1L47.7 54.0L48.4 55.8L48.4 57.2L48.0 58.8L47.5 59.8L45.1 63.0L44.5 64.1L44.0 65.6L43.9 67.2L44.3 68.9L45.1 70.4L46.6 72.0L48.3 72.9L48.4 72.6L46.2 69.9L45.3 67.5L45.3 66.0L45.7 64.7L48.8 60.2L49.3 59.1L49.7 57.5L49.7 55.5L48.9 53.2L48.4 52.7L46.5 52.6L47.5 50.0L47.8 48.3L47.8 46.1L47.5 44.4L46.1 41.2L45.1 39.8L43.6 38.3L41.1 36.7Z
            M58.0 27.6L61.4 28.2L63.7 29.0L65.8 30.1L67.9 31.6L69.2 33.0L71.0 35.5L68.9 55.1L68.6 60.5L68.6 65.2L66.6 67.5L65.8 68.6L65.0 70.5L64.8 72.5L65.5 75.6L65.5 76.8L65.1 77.9L64.6 78.5L63.4 79.2L61.0 79.6L57.8 79.5L54.8 79.1L54.5 78.9L53.6 38.4L55.8 37.4L57.0 36.2L57.5 35.3L57.8 34.1L57.8 29.1Z
            M66.6 35.7L65.1 36.0L63.4 36.8L60.8 38.9L59.2 41.1L58.3 43.1L57.8 45.0L57.6 46.6L57.8 49.0L58.4 51.1L59.2 53.0L57.4 53.0L57.0 53.3L56.4 54.5L56.2 56.7L56.5 58.3L57.5 60.3L58.3 61.4L60.2 63.4L58.7 66.4L58.2 68.8L58.2 70.1L58.4 71.5L59.0 73.0L59.4 73.6L60.9 75.0L61.1 74.7L60.2 73.1L59.6 71.1L59.5 68.9L59.8 67.4L60.4 65.8L61.6 64.0L62.2 63.4L62.2 63.1L59.8 61.1L58.4 59.2L57.7 57.2L57.7 55.3L58.1 54.3L59.9 54.6L61.7 55.3L62.2 55.1L62.2 54.6L60.7 52.8L59.6 50.5L59.0 48.1L59.0 45.8L59.3 44.3L60.2 42.1L61.8 39.9L62.4 39.5L62.5 39.9L62.0 41.0L61.7 42.5L61.7 45.1L62.4 47.4L64.5 51.1L64.9 52.5L65.0 53.9L64.6 55.5L63.9 56.8L61.8 58.5L61.8 59.0L63.1 59.8L64.0 60.7L64.6 62.4L64.3 64.4L61.9 68.6L61.9 69.2L62.7 68.6L64.6 66.4L65.5 64.8L65.9 63.1L65.9 62.2L65.5 60.6L65.0 59.8L63.9 58.8L63.9 58.6L65.0 57.5L65.8 56.1L66.3 53.9L66.2 52.4L65.6 50.3L63.3 46.0L63.0 44.8L63.0 42.6L63.3 41.2L64.0 39.5L65.1 37.7L66.7 35.8Z
            M46.9 22.9L46.7 26.0L43.7 26.8L40.5 28.3L38.0 30.0L36.0 31.8L34.9 33.3L34.6 33.2L34.4 31.8L35.2 30.0L36.7 28.0L38.3 26.5L40.3 25.1L43.0 23.8L46.1 22.8Z
            M58.0 22.5L58.9 22.4L63.6 23.5L66.4 24.8L68.1 25.9L70.1 27.9L71.2 29.4L72.2 31.4L72.0 33.0L71.7 33.1L70.7 31.8L68.7 29.8L65.8 27.9L62.1 26.3L59.9 25.8L58.1 25.6L57.9 25.4Z
            M48.8 20.4L56.0 20.5L55.8 34.1L55.3 35.1L54.6 35.8L53.5 36.3L51.9 36.4L50.8 36.1L49.6 35.1L49.2 34.3L48.8 24.8Z
          "
        />
      </svg>
    `,
    steadyHand: upgradeIcon(
      '<circle cx="32" cy="32" r="16"/>' +
        '<circle cx="32" cy="32" r="4" fill="currentColor" stroke="none"/>' +
        '<path d="M32 9v10M32 45v10M9 32h10M45 32h10"/>' +
        '<path fill="currentColor" stroke="none" opacity=".16" d="M43 15l8-2-2 8-7 7-6-6 7-7Z"/>' +
        '<path d="M43 15l8-2-2 8-7 7-6-6 7-7Z"/>'
    ),
    quickReload: upgradeIcon(
      '<path d="M51 18a24 24 0 1 0 4 27"/>' +
        '<path d="M51 8v12H39"/>' +
        '<path fill="currentColor" opacity=".16" stroke="none" d="M28 19h8l4 6v23l-4 5h-8l-4-5V25l4-6Z"/>' +
        '<path d="M28 19h8l4 6v23l-4 5h-8l-4-5V25l4-6Z"/>' +
        '<path d="M25 29h14M25 41h14M32 20v32"/>'
    ),
    hairTrigger: upgradeIcon(
      '<path fill="currentColor" opacity=".16" stroke="none" d="M13 27h28l10 7-4 7H33l-6 12H15l7-12h-8c-4 0-7-3-7-7s3-7 6-7Z"/>' +
        '<path d="M13 27h28l10 7-4 7H33l-6 12H15l7-12h-8c-4 0-7-3-7-7s3-7 6-7Z"/>' +
        '<path d="M17 34h19M35 27l5-8M43 25l8-5"/>' +
        '<path d="M33 41c0 7-5 12-13 12M25 41c2 4 1 8-3 11"/>' +
        '<path fill="currentColor" stroke="none" d="M53 8l2 5 5 2-5 2-2 5-2-5-5-2 5-2 2-5Z"/>'
    ),
    scavengerLuck: upgradeIcon(
      '<path fill="currentColor" opacity=".16" stroke="none" d="M13 26l19-10 19 10v23L32 58 13 49V26Z"/>' +
        '<path d="M13 26l19 9 19-9M32 35v22M13 26v23l19 9 19-9V26L32 16 13 26Z"/>' +
        '<path d="M23 21l18 9M50 8v8M46 12h8M14 9l2 4 4 2-4 2-2 4-2-4-4-2 4-2 2-4Z"/>'
    ),
    grit: upgradeIcon(
      '<path fill="currentColor" opacity=".16" stroke="none" d="M32 7l20 7v16c0 14-8 24-20 29-12-5-20-15-20-29V14l20-7Z"/>' +
        '<path d="M32 7l20 7v16c0 14-8 24-20 29-12-5-20-15-20-29V14l20-7Z"/>' +
        '<path fill="currentColor" stroke="none" d="M32 43s-12-6-12-15c0-5 6-8 10-4l2 2 2-2c4-4 10-1 10 4 0 9-12 15-12 15Z"/>'
    ),
    desertMender: upgradeIcon(
      '<path fill="currentColor" opacity=".13" stroke="none" d="M24 15h16l3 7v5l6 5v18c0 4-3 7-7 7H22c-4 0-7-3-7-7V32l6-5v-5l3-7Z"/>' +
        '<path d="M24 15h16l3 7v5l6 5v18c0 4-3 7-7 7H22c-4 0-7-3-7-7V32l6-5v-5l3-7Z"/>' +
        '<path d="M24 15v-5h16v5M22 27h20M32 35v14M25 42h14"/>' +
        '<path d="M50 9v9M45 14h10M12 16l4 4M8 28h7M14 40H8"/>'
    ),
    luckyMagnet: upgradeIcon(
      '<path fill="currentColor" opacity=".14" stroke="none" d="M18 15h10v14c0 4 1 6 4 6s4-2 4-6V15h10v16c0 12-6 21-14 21S18 43 18 31V15Z"/>' +
        '<path d="M18 15v16c0 12 6 21 14 21s14-9 14-21V15"/>' +
        '<path d="M18 15h10v14c0 4 1 6 4 6s4-2 4-6V15h10M16 53h10M38 53h10"/>' +
        '<circle cx="8" cy="40" r="3" fill="currentColor" stroke="none"/><circle cx="56" cy="37" r="3" fill="currentColor" stroke="none"/>'
    ),
    xpHunger: upgradeIcon(
      '<path fill="currentColor" opacity=".16" stroke="none" d="M32 8l18 14-18 34-18-34 18-14Z"/>' +
        '<path d="M32 8l18 14-18 34-18-34 18-14Z"/>' +
        '<path d="M14 22h36M23 22l9 34 9-34M32 8l-9 14M32 8l9 14"/>' +
        '<path d="M9 42c11 10 34 10 46 0M49 38l6 4-7 3"/>'
    ),
    longReach: upgradeIcon(
      '<path d="M9 35h34M17 25h17M17 45h17"/>' +
        '<path fill="currentColor" opacity=".18" stroke="none" d="M42 25l13 10-13 10V25Z"/>' +
        '<path d="M42 25l13 10-13 10V25Z"/>' +
        '<path d="M50 17c7 5 7 31 0 36"/>'
    ),
    ricochetRounds: upgradeIcon(
      '<circle cx="12" cy="18" r="4" fill="currentColor" stroke="none"/><circle cx="20" cy="44" r="4" fill="currentColor" stroke="none"/><circle cx="49" cy="50" r="4" fill="currentColor" stroke="none"/>' +
        '<path d="M15 20l15 9-11 13 28 7"/>' +
        '<path d="M46 41l7 9-11 3M29 28l3 9 8-5"/>'
    ),
    moreRicochets: upgradeIcon(
      '<path d="M9 50l13-28 15 12 16-19"/>' +
        '<circle cx="9" cy="50" r="4" fill="currentColor" stroke="none"/><circle cx="22" cy="22" r="4" fill="currentColor" stroke="none"/><circle cx="37" cy="34" r="4" fill="currentColor" stroke="none"/><circle cx="53" cy="15" r="4" fill="currentColor" stroke="none"/>' +
        '<path d="M49 44v12M43 50h12"/>'
    ),
    softAim: upgradeIcon(
      '<path fill="currentColor" opacity=".12" stroke="none" d="M12 32l40-18v36L12 32Z"/>' +
        '<path d="M12 32l40-18M12 32l40 18"/>' +
        '<path d="M15 42c19-3 28-11 34-24"/>' +
        '<path d="M45 18l8-4-2 9"/><circle cx="42" cy="32" r="5"/>'
    ),
    fanTheHammer: upgradeIcon(
      '<circle cx="25" cy="36" r="10"/><circle cx="25" cy="36" r="3" fill="currentColor" stroke="none"/>' +
        '<path d="M38 34l16-14M40 39l19 2M36 44l13 15"/>' +
        '<path d="M51 18l5-4M58 41h-6M48 60l4-5"/>' +
        '<path fill="currentColor" opacity=".14" stroke="none" d="M16 31h18v10H16z"/>'
    ),
    trickShot: upgradeIcon(
      '<path d="M8 46l15-21 12 10 20-22"/>' +
        '<path d="M49 13h8v8"/>' +
        '<path fill="currentColor" stroke="none" d="M20 8l3 7 7 3-7 3-3 7-3-7-7-3 7-3 3-7Z"/>' +
        '<circle cx="35" cy="35" r="4" fill="currentColor" stroke="none"/>'
    ),
    duelistFocus: upgradeIcon(
      '<path fill="currentColor" opacity=".12" stroke="none" d="M8 32s9-15 24-15 24 15 24 15-9 15-24 15S8 32 8 32Z"/>' +
        '<path d="M8 32s9-15 24-15 24 15 24 15-9 15-24 15S8 32 8 32Z"/>' +
        '<circle cx="32" cy="32" r="7"/><path d="M32 8v7M32 49v7M8 32h7M49 32h7"/>'
    ),
    allRightAllLeft: upgradeIcon(
      '<path fill="currentColor" fill-rule="evenodd" stroke="none" transform="matrix(0.27 0 0 0.27 -2.6 -2.6)" d="M 48.0 204.6 L 48.0 205.8 L 48.4 206.6 L 49.8 207.6 L 52.5 207.6 L 53.7 206.4 L 53.7 204.6 Z M 43.5 196.0 L 43.5 202.1 L 44.1 202.9 L 45.1 203.3 L 119.2 203.1 L 118.6 201.3 L 118.4 194.8 L 44.7 194.8 Z M 170.1 187.0 L 168.2 187.8 L 168.6 191.1 L 169.9 189.7 Z M 161.9 202.3 L 161.9 203.5 L 163.9 202.7 L 167.0 202.9 L 167.0 205.0 L 168.4 209.7 L 171.1 214.4 L 173.9 217.4 L 177.0 219.7 L 180.7 221.5 L 184.8 222.7 L 187.4 223.1 L 193.1 223.1 L 196.4 222.5 L 199.5 221.5 L 203.3 219.5 L 207.8 215.4 L 209.5 213.1 L 211.3 209.3 L 212.3 204.8 L 212.3 201.3 L 211.7 198.0 L 210.1 193.9 L 207.6 190.3 L 205.2 187.8 L 200.3 184.8 L 195.8 183.3 L 192.7 182.9 L 186.8 183.3 L 182.5 184.5 L 180.9 185.4 L 179.9 182.5 L 174.3 191.3 L 185.2 191.3 L 182.7 188.6 L 182.9 188.2 L 187.8 186.6 L 193.1 186.4 L 197.2 187.2 L 200.1 188.4 L 202.3 189.9 L 205.2 192.5 L 207.4 195.8 L 208.6 198.8 L 209.3 202.3 L 209.0 205.8 L 208.0 209.3 L 206.2 212.5 L 202.7 216.2 L 200.3 217.8 L 195.4 219.9 L 190.3 220.7 L 185.8 220.5 L 180.3 219.0 L 176.6 217.2 L 173.3 214.8 L 170.7 211.9 L 168.0 207.2 L 167.2 204.6 L 167.2 202.9 L 169.4 203.9 L 170.5 205.0 L 171.7 207.0 L 173.5 208.6 L 174.7 209.0 L 176.8 209.0 L 178.4 208.4 L 179.0 207.8 L 178.8 207.0 L 176.2 206.0 L 175.4 205.2 L 174.5 203.7 L 173.5 200.3 L 171.3 197.6 L 169.4 196.6 L 167.8 196.2 L 166.0 199.2 L 163.7 201.3 Z M 129.8 179.4 L 129.6 184.3 L 130.0 185.0 L 145.1 185.0 L 146.4 185.6 L 147.0 186.6 L 146.8 187.6 L 145.1 188.8 L 129.8 189.0 L 129.6 195.0 L 130.0 195.6 L 144.1 195.6 L 146.0 196.0 L 147.0 197.4 L 146.2 198.6 L 145.1 199.0 L 130.0 199.0 L 129.6 199.9 L 129.6 201.1 L 130.0 201.9 L 153.5 202.1 L 154.3 201.5 L 154.3 179.6 L 153.9 179.2 Z M 151.7 156.8 L 151.5 157.2 L 154.3 160.1 L 155.2 162.3 L 155.2 163.7 L 154.5 166.0 L 152.3 168.8 L 154.5 168.6 L 155.4 168.2 L 158.0 165.6 L 158.0 162.7 L 157.2 160.7 L 155.2 158.2 L 153.5 157.2 Z M 136.8 170.7 L 144.5 169.6 L 142.1 167.4 L 141.1 165.4 L 140.7 163.5 L 141.1 160.3 L 142.5 157.8 L 144.1 156.2 L 146.8 154.7 L 148.8 154.1 L 155.2 154.1 L 159.0 155.8 L 161.3 158.0 L 162.1 159.6 L 162.7 162.3 L 162.5 163.9 L 169.6 163.9 L 167.4 163.3 L 166.2 162.5 L 164.3 160.3 L 163.9 158.6 L 162.5 156.2 L 161.1 154.7 L 158.8 153.3 L 154.7 152.1 L 148.2 152.3 L 143.7 154.1 L 140.9 156.8 L 139.8 158.2 L 138.6 161.7 L 138.8 167.0 L 138.0 169.2 Z M 196.0 145.8 L 192.9 148.6 L 193.5 149.0 L 195.0 148.8 L 196.0 147.8 Z M 195.2 144.9 L 194.3 144.5 L 192.7 144.9 L 191.7 146.6 L 192.1 147.8 Z M 209.9 134.3 L 208.8 133.3 L 182.5 133.3 L 181.5 134.1 L 181.3 136.0 L 182.3 138.8 L 182.9 142.7 L 182.7 149.0 L 181.5 154.1 L 179.9 157.6 L 178.6 159.4 L 175.6 162.7 L 172.3 164.7 L 170.5 165.4 L 169.4 165.4 L 169.6 177.6 L 179.9 177.8 L 180.7 178.0 L 180.7 178.4 L 178.8 178.8 L 168.6 179.0 L 168.2 176.0 L 168.0 165.6 L 162.9 165.4 L 161.1 166.0 L 157.8 168.6 L 154.3 169.9 L 129.0 172.9 L 128.0 173.7 L 125.1 174.3 L 123.9 175.6 L 123.5 176.6 L 123.5 180.1 L 123.1 182.1 L 122.3 183.5 L 121.3 184.5 L 120.0 185.2 L 119.4 186.2 L 126.4 186.6 L 126.6 186.8 L 126.2 187.2 L 62.7 187.4 L 62.3 186.4 L 61.4 185.6 L 58.6 185.4 L 57.6 186.0 L 57.2 187.2 L 57.4 187.4 L 57.0 187.8 L 56.3 187.6 L 54.5 188.4 L 53.9 189.7 L 53.9 191.7 L 55.3 193.1 L 118.6 193.1 L 119.0 190.3 L 119.4 189.0 L 119.8 188.8 L 120.2 190.9 L 120.0 202.9 L 121.5 204.1 L 123.7 205.0 L 124.5 206.0 L 125.8 206.8 L 158.2 207.0 L 160.1 205.6 L 160.3 201.5 L 162.7 200.1 L 164.1 198.6 L 166.2 195.2 L 166.6 193.5 L 166.6 189.7 L 166.2 188.2 L 164.1 184.8 L 161.7 182.5 L 158.0 180.7 L 160.3 180.7 L 163.1 181.9 L 164.3 182.7 L 166.4 184.8 L 167.4 186.6 L 167.8 186.6 L 169.9 185.6 L 171.3 184.3 L 172.3 182.9 L 173.1 180.7 L 176.8 180.7 L 179.4 179.9 L 183.3 177.8 L 188.0 174.3 L 191.1 171.5 L 194.6 167.4 L 199.5 159.8 L 202.9 152.7 L 207.6 140.0 L 209.9 135.8 Z M 128.2 178.4 L 129.4 177.6 L 155.4 177.8 L 156.0 178.8 L 156.0 202.1 L 155.6 202.9 L 154.7 203.5 L 128.8 203.3 L 128.0 202.3 Z M 193.7 143.5 L 195.6 143.9 L 196.8 145.1 L 197.2 146.2 L 197.2 147.4 L 196.8 148.4 L 195.8 149.4 L 194.1 150.0 L 192.1 149.4 L 190.9 147.8 L 190.9 145.8 L 191.3 144.9 L 192.1 144.1 Z M 96.2 133.9 L 100.8 132.1 L 102.9 136.6 L 105.5 140.2 L 109.2 143.7 L 114.1 146.8 L 118.2 148.4 L 121.7 149.2 L 124.7 149.6 L 128.8 149.6 L 134.1 148.8 L 137.4 147.8 L 141.1 146.2 L 144.1 144.3 L 146.8 142.3 L 150.9 138.0 L 153.7 133.7 L 154.9 131.1 L 152.3 134.5 L 149.2 137.6 L 144.5 141.1 L 141.3 142.7 L 137.2 144.1 L 132.7 144.9 L 126.8 144.9 L 122.7 144.1 L 119.6 143.1 L 116.4 141.5 L 113.5 139.4 L 110.0 136.0 L 108.6 133.9 L 107.2 130.9 L 107.4 130.4 L 113.1 129.6 L 108.6 126.2 L 103.3 120.9 L 99.0 128.2 Z M 51.9 106.8 L 48.6 109.8 L 50.4 110.0 L 51.2 109.6 L 52.1 108.4 Z M 50.8 105.7 L 48.6 105.7 L 47.6 107.0 L 47.8 108.8 L 50.4 106.6 Z M 102.5 114.7 L 105.7 111.5 L 109.2 108.8 L 112.9 106.8 L 116.0 105.5 L 122.9 104.1 L 127.8 104.1 L 131.5 104.7 L 134.3 105.5 L 138.6 107.6 L 143.5 111.3 L 145.6 113.5 L 147.4 116.6 L 147.0 117.0 L 141.7 118.4 L 147.0 121.5 L 152.3 125.6 L 156.2 116.6 L 157.6 112.1 L 153.5 114.5 L 150.3 109.6 L 146.8 106.2 L 142.7 103.3 L 138.8 101.5 L 134.9 100.2 L 131.1 99.6 L 125.8 99.6 L 122.7 100.0 L 117.2 101.7 L 111.5 104.7 L 108.6 107.0 L 106.2 109.4 Z M 90.4 85.3 L 87.4 87.8 L 87.2 90.0 L 87.6 92.1 L 88.8 94.7 L 91.0 97.2 L 92.3 98.0 L 94.3 98.6 L 94.5 98.0 L 91.9 95.5 L 90.4 92.5 L 90.4 89.4 L 90.8 88.2 L 93.1 84.9 Z M 110.0 82.9 L 101.7 84.1 L 103.7 85.7 L 105.1 88.2 L 105.7 90.2 L 105.7 93.3 L 104.5 96.6 L 102.1 99.2 L 100.0 100.4 L 97.6 101.3 L 91.7 101.5 L 88.8 100.6 L 87.0 99.6 L 84.7 97.4 L 83.7 95.5 L 83.1 93.3 L 83.1 90.0 L 81.3 90.6 L 76.1 90.6 L 78.4 91.5 L 80.4 93.3 L 83.3 99.0 L 85.5 101.3 L 88.8 102.9 L 91.3 103.5 L 94.9 103.7 L 98.0 103.3 L 100.0 102.7 L 102.5 101.5 L 106.2 97.8 L 107.4 95.3 L 108.0 92.7 L 107.6 89.0 L 107.8 86.1 L 108.6 84.3 Z M 75.5 61.4 L 74.7 62.3 L 74.1 63.7 L 74.3 65.9 L 76.4 64.9 L 75.7 63.5 Z M 91.3 49.4 L 91.3 73.5 L 117.4 73.5 L 117.6 67.8 L 117.2 67.4 L 100.6 67.4 L 99.2 66.1 L 99.0 65.5 L 99.2 64.5 L 100.2 63.5 L 101.3 63.1 L 117.4 63.1 L 117.4 55.9 L 100.6 55.7 L 99.8 55.3 L 99.0 54.1 L 99.6 52.9 L 101.1 52.3 L 117.4 52.3 L 117.6 49.6 L 117.2 49.2 L 91.9 49.0 Z M 128.8 47.6 L 129.4 49.0 L 129.8 56.5 L 193.7 56.5 L 195.0 57.2 L 204.8 57.2 L 205.6 56.5 L 206.0 55.7 L 206.0 48.8 L 204.8 47.6 Z M 33.3 122.3 L 34.5 123.3 L 62.5 123.3 L 63.5 122.5 L 63.7 120.4 L 62.5 117.0 L 61.7 111.3 L 61.9 105.7 L 62.7 101.7 L 63.9 98.6 L 65.9 95.3 L 68.6 92.7 L 70.6 91.3 L 74.3 89.8 L 73.9 82.7 L 73.9 77.8 L 61.7 77.6 L 61.4 77.4 L 61.9 77.0 L 64.5 76.6 L 74.9 76.6 L 75.3 77.4 L 75.7 89.0 L 82.3 88.8 L 83.9 88.0 L 87.4 85.1 L 90.0 84.1 L 117.6 80.4 L 119.0 79.4 L 121.9 79.0 L 122.7 78.6 L 123.9 77.4 L 124.3 76.4 L 124.7 70.0 L 126.0 68.2 L 128.0 67.0 L 128.8 65.7 L 120.9 65.1 L 120.9 64.7 L 185.6 64.5 L 186.0 65.5 L 187.0 66.3 L 189.9 66.3 L 190.9 65.5 L 191.1 64.5 L 191.5 64.1 L 192.7 64.1 L 194.1 63.1 L 194.8 61.4 L 194.6 59.6 L 193.3 58.4 L 129.4 58.4 L 128.6 62.3 L 128.2 62.9 L 127.8 62.1 L 128.2 48.2 L 127.2 46.7 L 124.5 45.9 L 122.1 43.9 L 86.1 43.9 L 84.5 45.5 L 84.3 49.6 L 81.7 51.2 L 80.0 52.9 L 78.2 56.1 L 77.6 58.6 L 77.6 61.7 L 78.4 64.7 L 80.4 68.0 L 82.9 70.2 L 86.8 72.3 L 85.1 72.5 L 81.9 71.2 L 79.8 69.8 L 78.2 68.2 L 77.2 66.3 L 76.8 66.3 L 73.9 67.8 L 72.1 69.6 L 71.0 71.5 L 70.6 73.9 L 70.2 74.3 L 66.8 74.3 L 64.3 74.9 L 60.0 77.2 L 56.1 79.8 L 53.3 82.3 L 49.2 86.8 L 44.5 93.9 L 39.6 104.5 L 36.1 114.9 L 33.3 120.9 Z M 48.4 104.7 L 50.8 104.5 L 51.6 104.9 L 53.1 106.8 L 53.1 108.8 L 52.7 109.6 L 50.8 111.1 L 48.2 110.9 L 46.5 109.0 L 46.5 106.6 Z M 89.6 48.2 L 90.8 47.4 L 118.6 47.6 L 119.6 48.8 L 119.6 73.7 L 119.2 74.5 L 118.2 75.3 L 117.0 75.5 L 90.2 75.3 L 89.2 74.1 L 89.2 49.0 Z M 193.1 43.7 L 193.1 46.1 L 199.7 45.9 L 199.2 43.9 L 197.6 42.7 L 194.6 42.5 L 193.7 42.9 Z M 63.9 42.7 L 64.5 43.5 L 66.3 44.1 L 67.8 45.5 L 68.6 47.0 L 69.4 50.2 L 70.6 52.3 L 72.9 54.3 L 75.3 55.3 L 76.4 55.5 L 78.4 51.9 L 80.0 50.2 L 82.7 48.4 L 82.7 47.4 L 78.6 48.4 L 75.1 47.6 L 73.3 45.9 L 71.9 43.5 L 70.6 42.3 L 68.6 41.2 L 65.3 41.4 L 64.5 41.9 Z M 216.4 40.2 L 209.7 51.2 L 210.9 51.2 L 211.7 51.6 L 212.7 52.9 L 213.1 54.1 L 212.9 57.6 L 211.5 59.6 L 210.7 60.0 L 209.0 59.8 L 216.4 71.5 L 216.4 66.8 L 216.0 63.5 L 216.2 62.1 L 229.9 66.1 L 220.5 58.6 L 220.7 58.4 L 241.3 55.7 L 221.5 53.7 L 221.1 53.3 L 229.1 46.1 L 216.8 50.6 L 216.4 45.9 Z"/>'
    ),
    silverBullet: upgradeIcon(
      '<path fill="currentColor" opacity=".18" stroke="none" d="M17 36c11-15 23-23 36-24 1 13-8 25-24 36L17 36Z"/>' +
        '<path d="M17 36c11-15 23-23 36-24 1 13-8 25-24 36L17 36Z"/>' +
        '<path d="M27 44l-8 8M18 35l-7 7M43 8l2 5 5 2-5 2-2 5-2-5-5-2 5-2 2-5ZM49 31l6 3"/>'
    ),
    silverCache: upgradeIcon(
      '<path fill="currentColor" opacity=".16" stroke="none" d="M17 30h30l6 8-6 12H17l-6-12 6-8Z"/>' +
        '<path d="M17 30h30l6 8-6 12H17l-6-12 6-8Z"/>' +
        '<path d="M18 30l5-12h18l5 12M23 18l5-7h8l5 7M18 39h30M26 35v9M38 35v9"/>' +
        '<path d="M48 10l2 5 5 2-5 2-2 5-2-5-5-2 5-2 2-5Z"/>'
    ),
    executioner: upgradeIcon(
      '<path fill="currentColor" opacity=".16" stroke="none" d="M34 7l16 12-8 31-10 6-10-6 8-31 4-12Z"/>' +
        '<path d="M34 7l16 12-8 31-10 6-10-6 8-31 4-12Z"/>' +
        '<path d="M18 54h28M21 21h27M32 13l-2 35"/>'
    ),
    biggerCaliber: upgradeIcon(
      '<path fill="currentColor" opacity=".16" stroke="none" d="M15 25h28l10 7-10 7H15c-4 0-7-3-7-7s3-7 7-7Z"/>' +
        '<path d="M15 25h28l10 7-10 7H15c-4 0-7-3-7-7s3-7 7-7Z"/>' +
        '<path d="M15 21v22M27 25v14"/><circle cx="49" cy="32" r="11"/><circle cx="49" cy="32" r="18" opacity=".38"/>'
    ),
    heavyRupture: upgradeIcon(
      '<path d="M10 32h30"/>' +
        '<path fill="currentColor" opacity=".18" stroke="none" d="M37 22l14 10-14 10V22Z"/>' +
        '<path d="M37 22l14 10-14 10V22Z"/>' +
        '<path d="M48 17c8 8 8 22 0 30M54 10c12 12 12 32 0 44M12 22l-5-5M12 42l-5 5"/>'
    ),
    leadBloom: upgradeIcon(
      '<path d="M13 32h26"/>' +
        '<path fill="currentColor" opacity=".18" stroke="none" d="M37 24l12 8-12 8V24Z"/>' +
        '<path d="M37 24l12 8-12 8V24Z"/>' +
        '<path d="M33 32c-8-6-14-10-23-12M33 32c-8 6-14 10-23 12M12 16l-5 3 5 3M12 48l-5-3 5-3"/>'
    ),
    throughAndThrough: upgradeIcon(
      '<path d="M7 32h45"/>' +
        '<path fill="currentColor" opacity=".18" stroke="none" d="M48 24l10 8-10 8V24Z"/>' +
        '<path d="M48 24l10 8-10 8V24Z"/>' +
        '<path d="M18 18v28M31 14v36M44 18v28M18 24h8M18 40h8M31 20h8M31 44h8"/>'
    ),
    extendedTube: upgradeIcon(
      '<path d="M9 35h39"/><path d="M13 26h35"/><path fill="currentColor" opacity=".16" stroke="none" d="M46 23l11 8-11 8V23Z"/><path d="M46 23l11 8-11 8V23Z"/><path d="M17 44h26M19 50h22"/>'
    ),
    trailLoader: upgradeIcon(
      '<path d="M12 21h24l10 8-10 8H12"/><path d="M16 43h9M30 43h9M44 43h9"/><path d="M15 49h9M29 49h9M43 49h9"/><path d="M48 13v12M42 19h12"/>'
    ),
    chainLightning: upgradeIcon(
      '<path fill="currentColor" opacity=".18" stroke="none" d="M35 5L14 34h15l-4 25 25-34H35l0-20Z"/><path d="M35 5L14 34h15l-4 25 25-34H35l0-20Z"/><circle cx="11" cy="48" r="3" fill="currentColor" stroke="none"/><circle cx="53" cy="14" r="3" fill="currentColor" stroke="none"/>'
    ),
    stormTempo: upgradeIcon(
      '<path d="M14 36h18l-3 16 20-25H33l3-15-22 24Z"/><path d="M10 17c11-7 32-7 43 0M11 48c11 7 31 7 42 0"/><path d="M48 12l6 5-7 4"/>'
    ),
    snapTraps: upgradeIcon(
      '<path fill="currentColor" opacity=".14" stroke="none" d="M15 38c0-10 8-18 17-18s17 8 17 18H15Z"/><path d="M15 38c0-10 8-18 17-18s17 8 17 18"/><path d="M15 38h34M21 38l-7 9M28 38l-3 11M36 38l3 11M43 38l7 9M25 20V9M39 20V9"/>'
    ),
    baitedTrap: upgradeIcon(
      '<path d="M18 42h28M22 42l-7 8M42 42l7 8M21 34c2-6 7-10 11-10s9 4 11 10"/><path d="M8 19c8-6 15-6 22 0M34 19c7-6 14-6 22 0"/><circle cx="32" cy="36" r="4" fill="currentColor" stroke="none"/>'
    ),
    trailLayer: upgradeIcon(
      '<path d="M11 43h42M19 36l-6 7 6 7M45 36l6 7-6 7"/><path d="M24 21c3-5 13-5 16 0l5 11H19l5-11Z"/><path d="M32 8v9M25 14l7 7 7-7"/>'
    ),
    quickerTrail: upgradeIcon(
      '<path d="M13 42h38M21 34l-8 8 8 8M43 34l8 8-8 8"/><path d="M21 22h13l-4 11 14-17H31l4-9-14 15Z"/>'
    ),
    powderTrap: upgradeIcon(
      '<path d="M17 40h30M23 40l-7 9M41 40l7 9"/><path d="M32 14l3 8 8 3-8 3-3 8-3-8-8-3 8-3 3-8Z"/><path d="M11 21l4 4M53 21l-4 4M32 6v6"/>'
    ),
    salvagedTrap: upgradeIcon(
      '<path d="M16 40h32M22 40l-7 8M42 40l7 8"/><path d="M24 17h16l5 7v9H19v-9l5-7Z"/><path d="M24 25h16M28 12h8M51 14l2 5 5 2-5 2-2 5-2-5-5-2 5-2 2-5Z"/>'
    ),
    clusterCharge: upgradeIcon(
      '<path fill="currentColor" opacity=".16" stroke="none" d="M21 18h22l7 8-3 14-15 9-15-9-3-14 7-8Z"/><path d="M21 18h22l7 8-3 14-15 9-15-9-3-14 7-8Z"/><circle cx="32" cy="34" r="5" fill="currentColor" stroke="none"/><path d="M15 13l-6-5M49 13l6-5M12 52l-6 4M52 52l6 4M18 49l-9 7M46 49l9 7"/>'
    ),
    moreBomblets: upgradeIcon(
      '<circle cx="20" cy="24" r="6"/><circle cx="42" cy="24" r="6"/><circle cx="31" cy="43" r="6"/><path d="M20 18l-5-7M42 18l5-7M31 37v-8M50 47v11M44 53h12"/><path fill="currentColor" stroke="none" d="M20 24h.1M42 24h.1M31 43h.1"/>'
    ),
    chainDetonation: upgradeIcon(
      '<circle cx="13" cy="32" r="5"/><circle cx="32" cy="18" r="6"/><circle cx="50" cy="35" r="7"/><path d="M17 29l10-7M37 22l8 8M22 42l-6 10M41 48l8 7"/><path d="M31 6v7M50 18l5-5M9 20l-5-4"/>'
    ),
    moreChainDetonations: upgradeIcon(
      '<path d="M10 48l10-19 12 10 12-21 10 9"/><circle cx="10" cy="48" r="4" fill="currentColor" stroke="none"/><circle cx="20" cy="29" r="4" fill="currentColor" stroke="none"/><circle cx="32" cy="39" r="4" fill="currentColor" stroke="none"/><circle cx="44" cy="18" r="4" fill="currentColor" stroke="none"/><circle cx="54" cy="27" r="4" fill="currentColor" stroke="none"/><path d="M50 46v12M44 52h12"/>'
    ),
    heavyPayload: upgradeIcon(
      '<path fill="currentColor" opacity=".18" stroke="none" d="M17 18h25l11 12-4 18-17 8-17-8-4-18 6-12Z"/><path d="M17 18h25l11 12-4 18-17 8-17-8-4-18 6-12Z"/><path d="M21 18l7-10h9l5 10M17 33h30M22 45h20"/><path d="M52 11l3 6 6 3-6 3-3 6-3-6-6-3 6-3 3-6Z"/>'
    ),
    fullSalvo: upgradeIcon(
      '<path fill="currentColor" opacity=".16" stroke="none" d="M15 22h34l6 8v16l-6 8H15l-6-8V30l6-8Z"/><path d="M15 22h34l6 8v16l-6 8H15l-6-8V30l6-8Z"/><path d="M17 32h30M17 44h30M24 17v10M32 17v10M40 17v10"/><path d="M53 8v10M48 13h10"/>'
    ),
    shrapnelRain: upgradeIcon(
      '<path d="M32 8l-6 17 6 4 6-4-6-17Z"/><path d="M17 18l2 17 6 2 3-6-11-13ZM47 18l-11 13 3 6 6-2 2-17Z"/><path d="M12 51l12-9M32 56V42M52 51l-12-9"/><path fill="currentColor" stroke="none" d="M12 51h.1M32 56h.1M52 51h.1"/>'
    ),
    powderEcho: upgradeIcon(
      '<circle cx="25" cy="34" r="12"/><circle cx="39" cy="34" r="12" opacity=".55"/><path d="M25 22V11M17 27l-8-8M39 22l5-9M51 30l8-5M20 46l-7 8M44 46l7 8"/><path fill="currentColor" stroke="none" d="M25 34h.1M39 34h.1"/>'
    ),
    madmansJourney: upgradeIcon(
      '<path fill="currentColor" opacity=".16" stroke="none" d="M12 44c11-22 26-31 45-30-3 18-14 31-33 39l-12-9Z"/>' +
        '<path d="M12 44c11-22 26-31 45-30-3 18-14 31-33 39l-12-9Z"/>' +
        '<circle cx="27" cy="38" r="6"/>' +
        '<path d="M20 30l-7-7M37 31l12-10M42 46l12 5M12 52H5M16 58H7M53 10l5-6M58 16h-8"/>' +
        '<path d="M27 27v-8M23 22h8M27 44v-3" />'
    ),
    napalmShells: upgradeIcon(
      '<path fill="currentColor" opacity=".16" stroke="none" d="M32 8c10 11 16 20 16 31 0 10-7 17-16 17s-16-7-16-17c0-9 6-15 10-20 0 7 4 10 8 12 0-8-2-13-2-23Z"/><path d="M32 8c10 11 16 20 16 31 0 10-7 17-16 17s-16-7-16-17c0-9 6-15 10-20 0 7 4 10 8 12 0-8-2-13-2-23Z"/><path d="M32 37c4 5 6 8 6 12 0 4-3 7-7 7s-7-3-7-7c0-5 4-8 8-12Z"/>'
    ),
    rollingFlame: upgradeIcon(
      '<path d="M9 45c11-10 21-10 31-1 6 5 11 5 16-1"/><path fill="currentColor" opacity=".16" stroke="none" d="M18 34c5-9 12-14 21-22-1 8 5 11 7 18 2 8-4 17-14 17-8 0-15-5-14-13Z"/><path d="M18 34c5-9 12-14 21-22-1 8 5 11 7 18 2 8-4 17-14 17-8 0-15-5-14-13Z"/><path d="M31 28c5 6 6 10 2 17"/>'
    ),
    fireproofPowder: upgradeIcon(
      '<path fill="currentColor" opacity=".16" stroke="none" d="M32 7l19 8v15c0 13-7 23-19 28-12-5-19-15-19-28V15l19-8Z"/><path d="M32 7l19 8v15c0 13-7 23-19 28-12-5-19-15-19-28V15l19-8Z"/><path d="M31 22c7 8 10 14 10 20 0 6-4 10-9 10s-9-4-9-10c0-5 4-9 7-13 0 4 2 6 5 8 0-5-2-8-4-15Z"/><path d="M47 47l7 7M54 47l-7 7"/>'
    ),
    longBurn: upgradeIcon(
      '<path d="M18 47c0-7 5-11 8-16 0 5 3 7 6 9-1-8 1-14 6-21 6 8 10 16 10 24 0 9-6 14-15 14-8 0-15-4-15-10Z"/><path d="M12 14h40M12 14l5-6M52 14l-5-6M17 14c2 6 2 12 0 18M47 14c-2 6-2 12 0 18"/>'
    ),
    hotterFire: upgradeIcon(
      '<path fill="currentColor" opacity=".14" stroke="none" d="M32 7c12 13 18 23 18 33 0 11-8 18-18 18s-18-7-18-18c0-8 5-13 10-20 1 8 5 11 10 13-1-9-5-15-2-26Z"/><path d="M32 7c12 13 18 23 18 33 0 11-8 18-18 18s-18-7-18-18c0-8 5-13 10-20 1 8 5 11 10 13-1-9-5-15-2-26Z"/><path d="M54 12v12M48 18h12"/>'
    ),
    scorchedEarth: upgradeIcon(
      '<path d="M9 48c12-5 26-5 46 0"/><path d="M14 54c13-4 24-4 36 0"/><path fill="currentColor" opacity=".16" stroke="none" d="M26 38c0-5 4-8 6-13 1 5 4 7 6 11 2 6-2 11-7 11-4 0-5-3-5-9Z"/><path d="M26 38c0-5 4-8 6-13 1 5 4 7 6 11 2 6-2 11-7 11-4 0-5-3-5-9Z"/><path d="M18 20l28-8M21 30l26-8"/>'
    ),
    thermiteCore: upgradeIcon(
      '<circle cx="32" cy="36" r="18"/><circle cx="32" cy="36" r="7" fill="currentColor" stroke="none"/><path d="M32 7v13M19 12l6 11M45 12l-6 11M10 31l12 3M54 31l-12 3"/><path d="M23 51l-8 7M41 51l8 7"/>'
    ),
    backdraft: upgradeIcon(
      '<path d="M32 14c8 8 13 14 13 22 0 8-6 14-13 14s-13-6-13-14c0-6 5-11 9-16 0 6 3 8 6 10 0-6-3-11-2-16Z"/><path d="M32 6v8M32 50v8M8 32h9M47 32h9M14 14l7 7M50 14l-7 7M14 50l7-7M50 50l-7-7"/>'
    ),
    crossfireShells: upgradeIcon(
      '<path d="M32 8v28"/>' +
        '<path fill="currentColor" opacity=".16" stroke="none" d="M23 17h18l5 7v15l-14 8-14-8V24l5-7Z"/>' +
        '<path d="M23 17h18l5 7v15l-14 8-14-8V24l5-7Z"/>' +
        '<path d="M16 42H5M48 42h11M13 35l-8 7 8 7M51 35l8 7-8 7"/>' +
        '<path d="M16 54c0-5 4-8 7-12 0 5 3 7 6 9M48 54c0-5-4-8-7-12 0 5-3 7-6 9"/>' +
        '<path d="M32 47c5 5 8 9 8 14M32 47c-5 5-8 9-8 14"/>'
    ),
    doorKicker: upgradeIcon(
      '<path fill="currentColor" opacity=".13" stroke="none" d="M10 12h28v42H10z"/><path d="M10 54V12h28v42M24 12v42M31 32h2"/><path d="M43 39l9-8 5 6-8 9-9 2 3-9Z"/><path d="M47 26l5-6M52 28l8-2M49 30l7 5"/>'
    ),
    doubleTap: upgradeIcon(
      '<path d="M14 44V18h11v26l-2 7h-7l-2-7ZM39 44V18h11v26l-2 7h-7l-2-7ZM14 39h11M39 39h11"/><path d="M8 11l5 2 3-5 2 5 6-2-3 5 4 4-6-1-2 6-2-6-6 1 4-4-5-5ZM36 10l5 2 3-5 2 5 6-2-3 5 4 4-6-1-2 6-2-6-6 1 4-4-5-5Z"/>'
    ),
    lastWord: upgradeIcon(
      '<circle cx="32" cy="32" r="24" stroke-dasharray="10 5"/><path d="M27 43V17h10v26l-2 7h-6l-2-7ZM27 39h10"/><path fill="currentColor" opacity=".14" stroke="none" d="m32 7 3 7 7 1-6 5 2 7-6-4-6 4 2-7-6-5 7-1 3-7Z"/>'
    ),
    shellCatcher: upgradeIcon(
      '<path fill="currentColor" opacity=".14" stroke="none" d="M27 5h10v21l-2 5h-6l-2-5V5Z"/>' +
        '<path d="M27 5h10v21l-2 5h-6l-2-5V5ZM27 11h10M27 24h10"/>' +
        '<path d="M8 42c3-3 7-2 10 1l8 7V37c0-3 5-3 5 0v8-5c0-3 5-3 5 0v6-3c0-3 5-3 5 0v5-2c0-3 5-3 5 0v4c0 6-5 10-12 10h-5c-5 0-9-2-13-7l-4-5c-2-2-1-4 1-6Z"/>'
    ),
    buckAndBall: upgradeIcon(
      '<circle cx="32" cy="32" r="9" fill="currentColor" opacity=".18"/><circle cx="32" cy="32" r="9"/><circle cx="32" cy="10" r="3"/><circle cx="48" cy="16" r="3"/><circle cx="54" cy="32" r="3"/><circle cx="48" cy="48" r="3"/><circle cx="32" cy="54" r="3"/><circle cx="16" cy="48" r="3"/><circle cx="10" cy="32" r="3"/><circle cx="16" cy="16" r="3"/>'
    ),
    rideTheRecoil: upgradeIcon(
      '<path fill="currentColor" opacity=".14" stroke="none" d="M7 29h12l9-8 9 4-4 4h20l8 4-8 4H31l-8 9H9l6-9H7l-4-4 4-4Z"/>' +
        '<path d="M7 29h12l9-8 9 4-4 4h20l8 4-8 4H31l-8 9H9l6-9H7l-4-4 4-4Z"/>' +
        '<path d="M21 14H5m0 0 8-8M5 14l8 8M36 29h19M36 35h19M55 25l6-5M57 32h6M55 39l6 5"/>'
    ),
    bonebreaker: upgradeIcon(
      '<path fill="currentColor" opacity=".14" stroke="none" d="M12 24c-3-4-9-3-10 2-1 3 1 6 4 7-3 2-4 6-1 9 3 3 9 2 11-3h32c2 5 8 6 11 3 3-3 2-7-1-9 3-1 5-4 4-7-1-5-7-6-10-2H12Z"/>' +
        '<path d="M12 24c-3-4-9-3-10 2-1 3 1 6 4 7-3 2-4 6-1 9 3 3 9 2 11-3h32c2 5 8 6 11 3 3-3 2-7-1-9 3-1 5-4 4-7-1-5-7-6-10-2H12Z"/>' +
        '<path d="m33 18-6 12 7 2-5 14 12-17-8-2 5-9"/>'
    ),
    noTimeToBleed: upgradeIcon(
      '<path fill="currentColor" opacity=".13" stroke="none" d="M32 53S10 41 10 24c0-10 13-15 22-4 9-11 22-6 22 4 0 17-22 29-22 29Z"/><path d="M32 53S10 41 10 24c0-10 13-15 22-4 9-11 22-6 22 4 0 17-22 29-22 29Z"/><circle cx="32" cy="31" r="10"/><path d="M32 25v7l5 3M20 12l5 5M44 12l-5 5"/>'
    ),
    packedBuckshot: upgradeIcon(
      '<g fill="currentColor" opacity=".22" stroke="none"><circle cx="18" cy="18" r="4"/><circle cx="32" cy="18" r="4"/><circle cx="46" cy="18" r="4"/><circle cx="18" cy="32" r="4"/><circle cx="32" cy="32" r="4"/><circle cx="46" cy="32" r="4"/><circle cx="18" cy="46" r="4"/><circle cx="32" cy="46" r="4"/><circle cx="46" cy="46" r="4"/></g><g fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="18" cy="18" r="4"/><circle cx="32" cy="18" r="4"/><circle cx="46" cy="18" r="4"/><circle cx="18" cy="32" r="4"/><circle cx="32" cy="32" r="4"/><circle cx="46" cy="32" r="4"/><circle cx="18" cy="46" r="4"/><circle cx="32" cy="46" r="4"/><circle cx="46" cy="46" r="4"/></g><path d="M57 8v14M50 15h14"/>'
    ),
    hardCast: upgradeIcon(
      '<path fill="currentColor" opacity=".18" stroke="none" d="m30 14 11 4 7 10-2 12-10 8-12-3-7-10 2-12 11-9Z"/>' +
        '<path d="m30 14 11 4 7 10-2 12-10 8-12-3-7-10 2-12 11-9ZM5 24h9M3 32h11M5 40h9M51 20l6-6M53 30h8M51 40l6 6"/>'
    ),
    rockSalt: upgradeIcon(
      '<path fill="currentColor" opacity=".12" stroke="none" d="M18 16h25l5 34H13l5-34Z"/><path d="M18 16h25l5 34H13l5-34ZM22 16l3-7h12l3 7"/><path d="m23 29 4-5 4 5-4 5-4-5Zm11 9 4-5 4 5-4 5-4-5ZM17 42l3-4 3 4-3 4-3-4Z"/>'
    ),
    stillness: upgradeIcon(
      '<circle cx="32" cy="34" r="21"/><path d="M27 8h10M32 8v5M32 21v13l8 5"/><circle cx="32" cy="34" r="4"/><path d="M8 34h8M48 34h8M32 10v8M32 50v8"/>'
    ),
    lastRites: upgradeIcon(
      '<path fill="currentColor" opacity=".12" stroke="none" d="M21 53V25c0-9 5-15 11-15s11 6 11 15v28H21Z"/><path d="M21 53V25c0-9 5-15 11-15s11 6 11 15v28M15 53h34M32 19v18M25 27h14M13 22C7 27 7 39 13 44M51 22c6 5 6 17 0 22M8 16C-1 25 0 43 8 50M56 16c9 9 8 27 0 34"/>'
    ),
    graveTithe: upgradeIcon(
      '<path fill="currentColor" opacity=".12" stroke="none" d="M6 48V36c0-4 2-6 5-6s5 2 5 6v12H6Zm11 0V32c0-4 2-6 5-6s5 2 5 6v16H17Zm11 0V38c0-4 2-6 5-6s5 2 5 6v10H28Z"/>' +
        '<path d="M4 48h34M6 48V36c0-4 2-6 5-6s5 2 5 6v12M17 48V32c0-4 2-6 5-6s5 2 5 6v16M28 48V38c0-4 2-6 5-6s5 2 5 6v10M19 32h6M22 29v7M9 18c12-8 29-7 42 3M44 13l7 8-9 2M47 27h10v21l-2 6h-6l-2-6V27ZM47 44h10"/>'
    ),
    heavensBounty: upgradeIcon(
      '<path fill="currentColor" opacity=".14" stroke="none" d="m32 7 6 11 12 2-8 9 2 12-12-5-12 5 2-12-8-9 12-2 6-11Z"/><path d="m32 7 6 11 12 2-8 9 2 12-12-5-12 5 2-12-8-9 12-2 6-11ZM22 47c3-6 17-6 20 0M25 47v7h14v-7M27 27c0-6 10-6 10 0 0 4-2 7-5 7s-5-3-5-7Z"/>'
    ),
    passingJudgment: upgradeIcon(
      '<circle cx="32" cy="16" r="8"/><circle cx="14" cy="48" r="7"/><circle cx="50" cy="48" r="7"/><path d="M32 24v8M32 32 14 41M32 32l18 9M28 16h8M32 12v8M11 48h6M47 48h6"/>'
    ),
    purifyingSalt: upgradeIcon(
      '<path fill="currentColor" opacity=".14" stroke="none" d="M47 7c7 10 11 18 11 25 0 7-5 12-12 12s-12-5-12-12c0-7 6-15 13-25Z"/>' +
        '<path d="M47 7c7 10 11 18 11 25 0 7-5 12-12 12s-12-5-12-12c0-7 6-15 13-25ZM33 47l25-29"/>' +
        '<path d="M10 17l5 5-5 5-5-5 5-5Zm11 11 5 5-5 5-5-5 5-5ZM10 38l5 5-5 5-5-5 5-5ZM2 22h3M8 33h4M2 43h3"/>'
    ),
    hallowedGround: upgradeIcon(
      '<ellipse cx="32" cy="49" rx="25" ry="9" fill="currentColor" opacity=".12" stroke="none"/><ellipse cx="32" cy="49" rx="25" ry="9"/><path d="M22 47V23c0-8 4-13 10-13s10 5 10 13v24M32 18v18M25 26h14M10 49c5-4 10-6 15-7M54 49c-5-4-10-6-15-7"/>'
    ),
    fineChoke: upgradeIcon(
      '<circle cx="21" cy="32" r="9"/><circle cx="43" cy="32" r="9"/><path d="M4 18h13M4 18l6-6M4 18l6 6M60 18H47M60 18l-6-6M60 18l-6 6M4 46h13M4 46l6-6M4 46l6 6M60 46H47M60 46l-6-6M60 46l-6 6"/>'
    ),
    sanctifiedLead: upgradeIcon(
      '<path fill="currentColor" opacity=".13" stroke="none" d="M27 46V20l5-9 5 9v26l-3 7h-4l-3-7Z"/><path d="M27 46V20l5-9 5 9v26l-3 7h-4l-3-7ZM27 40h10"/><circle cx="32" cy="31" r="22"/><path d="M32 3v8M32 53v8M4 31h8M52 31h8M42 12l-5 6"/>'
    ),
    default: upgradeIcon(
      '<path fill="currentColor" opacity=".16" stroke="none" d="M32 8l7 15 16 2-12 11 3 16-14-8-14 8 3-16L9 25l16-2 7-15Z"/>' +
        '<path d="M32 8l7 15 16 2-12 11 3 16-14-8-14 8 3-16L9 25l16-2 7-15Z"/>'
    ),
  };
  var COACH_GUN_REFERENCE_PATH = `
      M 426 113
      L 406 113
      L 404 120
      L 404 133
      L 408 142
      L 412 145
      L 415 142
      L 412 136
      L 413 123
      L 418 117
      Z

      M 579 68
      L 585 81
      L 585 91
      L 580 103
      L 585 108
      L 592 111
      L 809 111
      L 820 105
      L 825 95
      L 825 82
      L 822 76
      L 810 68
      Z

      M 1053 86
      L 1052 71
      L 1045 62
      L 1052 52
      L 1052 34
      L 1045 26
      L 1034 28
      L 1030 19
      L 1024 15
      L 1008 16
      L 1004 20
      L 1001 28
      L 513 28
      L 513 56
      L 1034 56
      L 1039 61
      L 1039 63
      L 1034 68
      L 828 68
      L 832 72
      L 836 81
      L 836 95
      L 1036 95
      L 1043 98
      L 1051 92
      Z

      M 1042 68
      L 1047 71
      L 1049 76
      L 1049 84
      L 1045 92
      L 1041 92
      L 1037 88
      L 1036 84
      L 1037 73
      Z

      M 1041 31
      L 1046 32
      L 1049 39
      L 1049 48
      L 1044 55
      L 1041 55
      L 1036 47
      L 1036 39
      Z

      M 574 80
      L 571 73
      L 566 68
      L 506 68
      L 502 64
      L 502 28
      L 486 28
      L 463 34
      L 459 34
      L 455 31
      L 440 33
      L 433 30
      L 419 13
      L 409 10
      L 404 13
      L 403 17
      L 409 21
      L 415 29
      L 418 42
      L 417 46
      L 386 55
      L 376 55
      L 368 61
      L 341 70
      L 295 90
      L 281 89
      L 261 77
      L 243 76
      L 22 100
      L 16 103
      L 11 109
      L 10 119
      L 20 164
      L 27 225
      L 30 232
      L 36 238
      L 43 241
      L 50 241
      L 240 169
      L 244 169
      L 254 176
      L 269 182
      L 293 185
      L 299 182
      L 310 163
      L 328 144
      L 343 133
      L 362 124
      L 368 124
      L 372 128
      L 374 138
      L 378 146
      L 385 153
      L 392 157
      L 399 159
      L 444 159
      L 451 157
      L 463 148
      L 469 136
      L 470 127
      L 467 115
      L 465 113
      L 453 113
      L 459 118
      L 461 122
      L 462 133
      L 458 142
      L 453 147
      L 445 151
      L 398 151
      L 391 148
      L 384 141
      L 381 134
      L 381 126
      L 384 119
      L 391 114
      L 397 113
      L 388 111
      L 376 103
      L 371 93
      L 371 84
      L 373 78
      L 385 65
      L 398 58
      L 418 51
      L 446 45
      L 480 43
      L 486 47
      L 486 51
      L 482 55
      L 454 55
      L 440 57
      L 415 63
      L 392 73
      L 384 80
      L 382 84
      L 382 93
      L 389 100
      L 398 103
      L 566 103
      L 570 100
      L 574 93
      Z

      M 449 76
      L 450 73
      L 456 68
      L 476 68
      L 483 74
      L 483 82
      L 476 88
      L 455 88
      L 450 83
      Z
    `;

  function coachGunWeaponIcon(variant) {
    var breach = variant === "breach";
    var grave = variant === "grave";
    var fill = "currentColor";
    var breachAccent = "var(--coach-gun-breach-accent,#321b0e)";
    var graveAccent = "var(--coach-gun-grave-accent,#b77932)";
    var referenceShape =
      '<path d="' +
      COACH_GUN_REFERENCE_PATH +
      '" fill="' +
      fill +
      '" fill-rule="evenodd" clip-rule="evenodd" shape-rendering="geometricPrecision"/>';

    if (breach) {
      return (
        '<defs><clipPath id="coach-gun-breach-cut"><rect x="0" y="0" width="916" height="252"/></clipPath></defs>' +
        '<g transform="translate(6.5 16) scale(.12)">' +
        '<g clip-path="url(#coach-gun-breach-cut)">' +
        referenceShape +
        '</g>' +
        '<path d="M486 28h28v80h-28V28ZM579 68l6 13v10l-5 12 5 5 7 3h217l11-6 5-10V82l-3-6-12-8H579ZM900 24h48v31h-48V24ZM900 68h48v31h-48V68ZM892 22h12v79h-12V22Z" fill="' +
        breachAccent +
        '"/>' +
        '</g>'
      );
    }

    if (grave) {
      return (
        '<g transform="translate(.1 16) scale(.12)">' +
        referenceShape +
        '<path d="M135 100h30v30h30v30h-30v48h-30v-48h-30v-30h30V100ZM579 68l6 13v10l-5 12 5 5 7 3h217l11-6 5-10V82l-3-6-12-8H579ZM972 27h18v70h-18V27ZM1010 20h18v82h-18V20Z" fill="' +
        graveAccent +
        '"/>' +
        '</g>'
      );
    }

    return '<g transform="translate(.1 16) scale(.12)">' + referenceShape + '</g>';
  }

  var WEAPON_ICONS = {
    revolver:
      '<g fill="currentColor"><path d="M65 24h57c3 0 5 2 5 5v7H65V24Z"/><path d="M37 22h29c8 0 14 6 14 14s-6 14-14 14H37c-8 0-14-6-14-14s6-14 14-14Z"/><path d="M34 29c-5-3-9-8-10-14 6 1 11 4 15 9l-5 5Z"/><path d="M37 40c-14 3-26 13-34 24h30c4-10 10-17 20-23l-16-1Z"/><path d="M56 44h14c4 6-1 13-9 13h-6c-6-3-6-10 1-13Z"/><path d="M112 18h12l3 6h-17l2-6Z"/></g><g fill="rgba(25, 15, 8, 0.78)"><path d="M70 31h49v3H70z"/><path d="M69 38h43v3H69z"/><path d="M60 48c-2 3 0 6 4 6s6-2 6-6h-4c0 2-1 3-3 3-2 0-3-1-1-3h-2Z"/></g><circle cx="50" cy="34" r="3.2" fill="currentColor"/>',
    coachGun: coachGunWeaponIcon("standard"),
    coachGunBreach: coachGunWeaponIcon("breach"),
    coachGunGrave: coachGunWeaponIcon("grave"),
    rifle:
      '<g fill="currentColor" transform="translate(-2 12.8) scale(0.108)">' +
      '<path d="M39 211 C34 188 31 158 28 137 C90 124 173 110 243 105 C270 103 286 113 295 125 C315 119 338 108 365 98 C385 91 403 99 412 118 C390 128 367 141 326 166 C250 184 164 207 86 225 C61 231 45 225 39 211 Z"/>' +
      '<path d="M28 137 C45 159 49 188 39 211 C29 208 24 199 23 184 L20 153 C19 145 22 140 28 137 Z"/>' +
      '<path d="M344 104 C365 90 389 81 418 75 L444 104 C419 111 398 122 378 138 C359 138 343 126 344 104 Z"/>' +
      '<path fill-rule="evenodd" d="M392 78 C430 76 490 77 544 82 C557 88 564 98 564 112 L564 125 C550 139 529 147 499 148 L401 148 C376 148 360 135 354 113 C349 95 363 83 392 78 Z M462 94 L510 94 Q521 94 521 103 Q521 112 510 112 L462 112 Q452 112 452 103 Q452 94 462 94 Z M419 101 m -5 0 a 5 5 0 1 0 10 0 a 5 5 0 1 0 -10 0 M438 129 m -4 0 a 4 4 0 1 0 8 0 a 4 4 0 1 0 -8 0 M496 132 m -4 0 a 4 4 0 1 0 8 0 a 4 4 0 1 0 -8 0"/>' +
      '<path d="M544 81 L600 82 C610 82 616 91 616 104 L616 126 C616 138 610 145 600 145 L543 145 C557 132 563 118 563 104 C563 94 556 86 544 81 Z"/>' +
      '<path d="M414 70 L540 70 C552 70 561 75 568 82 L392 82 C398 75 405 72 414 70 Z"/>' +
      '<path d="M548 60 L625 60 L639 72 L540 72 Z"/>' +
      '<path d="M391 79 C384 60 390 45 405 34 C418 48 421 66 409 83 C401 82 396 81 391 79 Z"/>' +
      '<path fill-rule="evenodd" d="M360 126 C382 137 413 145 442 141 C468 138 490 125 501 105 C515 114 521 129 518 145 C509 169 482 187 446 193 C401 200 358 185 333 158 C323 147 331 130 346 125 C350 124 355 124 360 126 Z M359 141 C380 153 411 160 441 156 C466 153 486 141 498 124 C500 133 497 144 488 154 C473 170 448 179 419 176 C388 173 359 160 343 145 C346 138 351 137 359 141 Z"/>' +
      '<path d="M318 151 C341 173 376 189 417 195 L403 205 C364 199 329 183 304 160 C303 152 310 148 318 151 Z"/>' +
      '<path d="M418 137 C428 141 435 151 435 163 C433 176 426 184 416 187 C421 173 419 159 410 148 C411 142 414 138 418 137 Z"/>' +
      '<path d="M606 85 C683 78 760 78 842 84 C859 85 872 93 876 104 C873 118 858 126 837 127 C754 131 679 129 606 123 Z"/>' +
      '<path d="M848 81 L878 82 C888 84 893 92 893 104 C893 117 887 126 878 128 L848 129 C857 116 858 93 848 81 Z"/>' +
      '<path d="M884 84 L950 85 C962 86 970 95 970 106 C970 119 962 127 950 128 L884 127 Z"/>' +
      '<path d="M610 73 L1132 73 C1149 73 1158 78 1160 86 L610 86 Z"/>' +
      '<path d="M622 96 L1147 96 C1156 96 1161 102 1161 108 L622 108 Z"/>' +
      '<path d="M930 115 L1138 115 C1147 115 1152 119 1152 124 L930 124 Z"/>' +
      '<path d="M1127 66 L1153 66 C1162 66 1167 73 1167 84 L1167 112 C1167 123 1162 130 1153 130 L1127 130 C1135 114 1136 83 1127 66 Z"/>' +
      '<path d="M1160 71 L1180 76 C1188 78 1192 86 1192 98 C1192 111 1188 119 1180 122 L1160 127 C1166 112 1166 85 1160 71 Z"/>' +
      '<path d="M1071 58 L1085 58 L1090 73 L1067 73 Z"/>' +
      '<path d="M904 69 L914 69 L918 84 L900 84 Z"/>' +
      '</g>',
    launcher:
      '<g fill="currentColor" fill-rule="evenodd" transform="translate(1.2 2.5) scale(0.101)"><path d="M18 129L18 139L19 140L19 143L20 144L20 151L21 152L21 156L22 157L22 163L23 164L23 168L24 169L25 184L26 185L26 189L27 190L27 198L28 199L28 204L29 205L29 216L30 217L30 223L31 224L31 236L32 237L32 248L33 249L33 313L34 314L34 317L35 319L38 322L40 323L43 323L44 324L52 324L53 323L70 323L74 321L79 316L81 316L88 312L94 312L95 313L95 318L99 322L110 322L111 321L113 321L116 319L118 319L122 317L125 314L125 310L126 309L125 308L124 304L122 302L122 296L133 290L135 290L156 279L158 279L163 276L165 276L167 274L169 274L189 264L191 264L196 261L198 261L205 257L207 257L210 255L212 255L217 252L219 252L231 246L233 246L236 244L238 244L246 240L251 239L254 237L262 235L265 233L268 233L269 232L271 232L275 230L278 230L281 228L286 228L287 227L291 227L292 226L349 226L351 225L355 221L355 219L356 218L356 214L358 211L359 207L361 205L363 201L373 191L379 188L381 188L382 187L391 187L392 188L392 194L391 195L391 199L392 200L392 202L394 206L394 221L393 222L393 224L390 230L381 241L379 245L375 249L374 252L372 253L371 256L368 259L368 260L364 265L363 268L360 271L360 273L358 275L351 289L351 291L349 294L349 296L348 297L348 299L346 303L346 308L345 309L345 313L344 314L344 319L346 322L346 324L351 328L354 328L355 329L357 329L358 330L362 330L363 331L367 331L371 333L375 333L376 334L382 335L386 337L390 337L394 339L402 340L406 342L410 342L411 343L413 343L414 344L418 344L422 346L428 346L432 344L434 342L435 336L433 332L433 323L436 317L441 312L446 310L448 308L448 303L447 302L447 292L448 291L448 289L454 283L459 281L459 276L457 273L457 264L459 262L459 260L464 255L466 254L469 254L472 252L479 252L483 255L485 255L488 257L491 257L492 258L564 258L565 257L610 257L611 256L616 256L617 257L617 263L618 264L618 272L619 273L619 283L620 284L620 291L621 292L621 295L622 297L625 300L625 312L626 313L626 315L628 319L631 322L635 324L638 324L639 325L645 325L646 326L662 326L663 327L671 327L672 328L689 328L690 329L699 329L700 330L717 330L718 331L737 331L738 332L747 332L750 334L757 334L758 335L768 335L769 334L777 334L778 333L787 333L788 332L792 332L793 331L801 331L802 330L812 330L813 329L818 329L819 328L829 328L830 327L836 327L837 326L845 326L846 325L852 325L853 324L861 324L862 323L867 323L868 322L874 322L875 321L877 321L879 319L883 317L883 316L886 312L887 306L888 305L888 282L889 281L889 220L894 213L894 187L895 186L921 186L923 190L923 194L926 198L951 198L952 199L952 217L954 219L958 221L964 221L965 220L965 217L966 216L979 216L980 217L980 221L994 221L994 217L995 216L1007 216L1008 217L1008 221L1022 221L1022 217L1023 216L1036 216L1037 217L1037 220L1038 221L1051 221L1051 217L1052 216L1065 216L1066 217L1066 220L1067 221L1080 221L1081 220L1081 217L1082 216L1094 216L1095 217L1095 221L1103 221L1109 216L1109 214L1108 213L1108 197L1109 196L1109 193L1108 192L1108 187L1109 186L1171 186L1172 185L1174 185L1176 183L1178 179L1178 177L1179 176L1179 165L1180 164L1180 158L1181 157L1181 116L1180 115L1180 107L1179 106L1179 98L1178 97L1178 93L1177 92L1177 90L1172 86L1152 86L1151 85L1151 79L1152 78L1152 70L1151 69L1151 63L1150 62L1150 46L1149 45L1149 25L1146 22L1123 22L1121 25L1121 39L1120 40L1120 45L1119 46L1119 61L1118 62L1115 62L1114 63L1093 63L1091 65L1090 65L1090 66L1088 68L1088 85L1087 86L904 86L903 85L903 53L901 50L901 48L899 46L897 45L893 45L892 44L892 37L891 37L884 32L873 32L873 37L872 38L855 38L854 37L854 33L853 32L835 32L835 35L833 38L817 38L816 37L816 32L796 32L796 37L795 38L776 38L775 37L775 32L755 32L754 34L754 37L753 38L737 38L736 37L736 33L735 32L716 32L715 33L715 37L714 38L697 38L696 37L696 32L677 32L677 37L676 38L659 38L658 37L658 33L657 32L640 32L639 33L639 37L638 38L622 38L621 37L621 32L613 32L611 34L606 36L604 38L604 42L603 43L587 43L586 44L576 44L575 45L568 45L567 46L563 46L562 47L556 47L555 48L552 48L551 49L545 49L544 50L541 50L540 51L532 51L524 47L522 47L520 45L520 14L519 13L514 13L513 14L507 14L506 13L503 13L500 17L500 19L497 25L495 27L492 34L490 36L487 43L485 45L482 51L482 65L481 66L476 66L475 65L463 65L459 67L455 71L454 71L454 72L451 75L449 76L446 76L444 79L435 79L435 80L433 82L433 84L434 85L449 85L450 86L450 103L448 105L446 105L445 106L437 108L434 110L428 111L425 113L422 113L419 115L416 115L413 117L410 117L407 119L402 120L400 121L400 123L398 127L392 127L391 126L391 121L390 119L386 117L377 117L376 118L373 118L372 119L367 119L366 120L361 120L357 122L352 122L351 123L349 123L348 124L344 124L340 126L335 126L334 127L330 127L329 128L326 128L325 129L318 129L317 130L304 130L303 129L297 129L296 128L294 128L293 127L291 127L290 126L288 126L287 125L285 125L284 124L282 124L278 122L65 122L62 119L41 119L40 120L27 120L21 123Z M832 312L832 317L829 319L825 319L824 320L813 320L812 321L808 321L807 322L798 322L797 323L791 323L790 322L752 322L751 323L748 323L747 324L735 324L734 323L713 323L712 322L693 322L692 321L682 321L681 320L663 320L662 319L653 319L652 318L652 313L653 312L820 312L822 311L824 308L829 308Z M120 306L120 311L117 314L115 314L114 315L112 315L108 317L102 317L101 316L101 311L103 309L108 308L113 305L119 305Z M635 303L640 303L641 304L641 307L644 311L644 315L643 316L637 316L634 312L634 304Z M44 293L45 292L52 292L53 291L65 291L66 292L66 302L65 303L46 303L44 301Z M44 271L46 269L64 269L66 271L66 280L65 281L45 281L44 280Z M824 252L828 252L829 253L829 273L828 274L824 274L823 273L823 253Z M44 249L45 248L63 248L64 249L64 258L63 259L45 259L44 258Z M42 229L46 227L61 227L63 229L63 236L61 238L43 238L42 237Z M41 212L42 211L59 210L61 212L61 219L60 220L42 220L41 219Z M522 211L532 201L578 201L579 202L579 235L578 236L578 239L577 241L572 247L564 251L526 251L525 250L525 242L520 236L519 232L518 231L518 219Z M486 203L490 202L491 201L506 201L508 204L508 214L507 215L507 223L508 224L508 229L512 237L518 243L522 244L523 245L523 250L522 251L491 251L488 249L486 249L479 242L479 241L476 237L475 231L474 230L474 221L475 220L476 214L478 212L478 211Z M40 200L41 199L59 199L60 200L60 206L59 207L42 207L40 205Z M38 185L41 183L57 183L59 185L59 192L56 195L39 195L38 194Z M391 182L393 180L398 180L400 182L400 186L398 188L392 188L391 187Z M824 169L828 169L829 170L829 185L828 186L824 186L823 185L823 170Z M35 164L37 162L56 162L58 165L58 171L56 174L37 174L35 172Z M33 143L35 141L54 141L56 143L56 150L54 152L34 152L33 151Z M463 79L465 77L473 77L476 80L476 87L473 90L465 90L462 86L462 81Z M601 86L601 68L604 64L655 64L656 63L835 63L836 64L836 72L835 73L832 73L829 77L824 77L820 73L646 73L644 74L641 78L641 83L640 84L640 91L639 92L634 92L633 91L623 91L619 94L609 94L608 93L606 93L604 91L604 89Z M540 132 H682 Q691 132 691 141 Q691 150 682 150 H540 Q531 150 531 141 Q531 132 540 132 Z M529 174 H706 Q716 174 716 184 Q716 194 706 194 H529 Q519 194 519 184 Q519 174 529 174 Z M540 218 H682 Q691 218 691 227 Q691 236 682 236 H540 Q531 236 531 227 Q531 218 540 218 Z"/></g>',
    incendiaryShell:
      '<g fill="none" stroke="currentColor" stroke-width="5.6" stroke-linecap="round" stroke-linejoin="round"><path fill="currentColor" opacity=".18" stroke="none" d="M16 34h43l15 10-15 10H16c-7 0-12-4-12-10s5-10 12-10Z"/><path d="M16 34h43l15 10-15 10H16c-7 0-12-4-12-10s5-10 12-10Z"/><path d="M22 27v34M40 34v20M61 34l10-12"/><path fill="currentColor" opacity=".2" stroke="none" d="M91 7c15 15 23 27 23 40 0 11-9 18-22 18-12 0-21-7-21-18 0-9 8-16 14-24 1 8 6 12 13 14-4-11-8-20-7-30Z"/><path d="M91 7c15 15 23 27 23 40 0 11-9 18-22 18-12 0-21-7-21-18 0-9 8-16 14-24 1 8 6 12 13 14-4-11-8-20-7-30Z"/><path d="M91 39c5 6 7 10 7 15 0 5-4 9-9 9s-9-4-9-9c0-5 5-10 11-15Z"/></g>',
    rifleTrap:
      '<g fill="none" stroke="currentColor" stroke-width="5.8" stroke-linecap="round" stroke-linejoin="round"><path fill="currentColor" opacity=".15" stroke="none" d="M26 42c0-17 17-29 38-29s38 12 38 29H26Z"/><path d="M26 42c0-17 17-29 38-29s38 12 38 29"/><path d="M24 42h80"/><path d="M35 42l-14 16M50 42l-5 17M78 42l5 17M93 42l14 16"/><path d="M41 28V9M54 23V7M74 23V7M87 28V9"/><path d="M43 42c5 8 16 11 21 2 5 9 16 6 21-2"/><circle cx="64" cy="39" r="7" fill="currentColor" stroke="none"/></g>',
  };

  var state = {
    mode: "menu",
    paused: false,
    controlLayoutEditing: false,
    time: 0,
    wave: 1,
    score: 0,
    kills: 0,
    shotsFired: 0,
    spawnLeft: 0,
    waveSpawnTarget: 0,
    waveElapsed: 0,
    waveLowRemainingTimer: 0,
    spawnTimer: 0,
    spawnInterval: 1,
    nextWaveTimer: 0,
    shake: 0,
    player: null,
    enemies: [],
    bullets: [],
    coachGunTracers: [],
    particles: [],
    flashes: [],
    shockwaves: [],
    lightningBolts: [],
    decals: [],
    lightFlashes: [],
    smokePuffs: [],
    ambientDust: [],
    debris: [],
    acidProjectiles: [],
    acidPuddles: [],
    firePatches: [],
    delayedExplosions: [],
    xpOrbs: [],
    rifleTraps: [],
    marshalHallowedGrounds: [],
    paleDeputies: [],
    paleDeputyTracers: [],
    level: 1,
    xp: 0,
    xpToNext: 20,
    totalXp: 0,
    levelUps: 0,
    playerClass: null,
    classChoicePending: false,
    classChoiceOffered: false,
    revolverUpgrade: null,
    revolverUpgradePending: false,
    revolverUpgradeOffered: false,
    rifleUpgrade: null,
    rifleUpgradePending: false,
    rifleUpgradeOffered: false,
    launcherUpgrade: null,
    launcherUpgradePending: false,
    launcherUpgradeOffered: false,
    marshalUpgrade: null,
    marshalUpgradePending: false,
    marshalUpgradeOffered: false,
    standardUpgradePending: false,
    standardUpgradeLevel: 0,
    standardUpgradeChoices: [],
    pendingStandardUpgradeLevels: [],
    standardUpgradesChosen: 0,
    upgradeCounts: {},
    moveSpeedBonus: 0,
    globalDamageBonus: 0,
    reloadSpeedBonus: 0,
    fireRateBonus: 0,
    ammoPickupBonus: 0,
    maxHpBonus: 0,
    hpRegen: 0,
    xpPickupRadiusBonus: 0,
    xpGainBonus: 0,
    attackRangeBonus: 0,
    fanTheHammerTimer: 0,
    duelistFocus: 0,
    bigIronShotsFired: 0,
    bigIronRuptures: 0,
    silverBulletAmmoKills: 0,
    leadBloomShots: 0,
    dualShotSide: -1,
    lastDualShotSide: 0,
    dualActiveHand: "right",
    dualLastShotHand: "",
    dualHandAmmo: { right: 0, left: 0 },
    dualHandReloadTimers: { right: 0, left: 0 },
    dualHandFreeReloads: { right: 0, left: 0 },
    dualFreeReloadsEarned: 0,
    rifleMagazineMultiplier: 1,
    launcherMagazineMultiplier: 1,
    rifleShotsFired: 0,
    rifleKillReloadCounter: 0,
    rifleLightningStrikes: 0,
    rifleStormTempoTimer: 0,
    rifleAutoTrapTimer: 0,
    rifleAutoTrapFrequency: 0,
    rifleTrapTriggers: 0,
    rifleTrapAmmoRestored: 0,
    rifleTrapBonusXp: 0,
    launcherShotsFired: 0,
    launcherChainDetonations: 0,
    launcherBomblets: 0,
    launcherShrapnelShots: 0,
    launcherPowderEchoes: 0,
    launcherAmmoRefills: 0,
    launcherMadmanStacks: 0,
    launcherMadmanTriggers: 0,
    launcherFireKills: 0,
    launcherFireBonusXp: 0,
    launcherBackdrafts: 0,
    launcherThermitePatches: 0,
    launcherFreeShots: 0,
    launcherCrossfireShards: 0,
    launcherFireBuffActive: false,
    launcherFireAmmoAccumulator: 0,
    launcherExplosionSpreadSamples: [],
    marshalShotSequence: 0,
    marshalLastShotTime: -99,
    marshalDoubleTapReadyUntil: 0,
    marshalRecoilSpeedTimer: 0,
    marshalShellCatcherKills: 0,
    marshalCloseKills: 0,
    marshalGraveTitheKills: 0,
    marshalBountyTimer: 12,
    marshalBountyEnemy: null,
    marshalBountiesMarked: 0,
    marshalBountiesClaimed: 0,
    marshalMarksApplied: 0,
    marshalMarksPassed: 0,
    marshalFearBursts: 0,
    marshalGeneratedShells: 0,
    marshalPaleDeputiesRaised: 0,
    marshalPaleDeputySpawnBlocked: 0,
    marshalPaleDeputyShots: 0,
    marshalPaleDeputyKills: 0,
    marshalPaleDeputyRepositions: 0,
    marshalPaleDeputyTracers: 0,
    marshalAcidCleansed: 0,
    marshalPurifyReloadTimer: 0,
    marshalHallowedGroundsCreated: 0,
    marshalLastVolley: null,
    revolverDamageMultiplier: 1,
    revolverMagazineBonus: 0,
    revolverAmmoPickupBonus: 0,
    rifleAmmoPickupBonus: 0,
    weapon: "revolver",
    ownedWeapons: { revolver: true, rifle: false, launcher: false, coachGun: false },
    ammo: {},
    ammoReserve: {},
    reloadTimers: {},
    ammoCrates: [],
    ammoCrateTimer: 0,
    zombieTeleports: 0,
    zombieSpawnSideCursor: 0,
    zombieTeleportSideCursor: 2,
    waveSuspended: false,
    pointerWorld: { x: 0, z: 6 },
  };

  initClassWeaponIcons();
  initMaterials();
  initParticleVisualPools();
  initXpOrbVisualPool();
  initDeathDebrisVisualPool();
  initProjectileVisualPools();
  initZombiePools();
  initPaleDeputyPool();
  initFirePatchVisualPools();
  initAcidPuddleVisualPool();
  initRifleTrapVisualPool();
  initExplosionEffectPools();
  initScorchDecalVisualPool();
  initLights();
  buildEnvironment();
  initMenuScene();
  resetRun("menu");
  applyMarshalPreviewFromQuery();
  resize();
  warmupGameplayEffectResources();
  bindInput();
  updateHud();
  render();
  requestAnimationFrame(loop);

  function initMaterials() {
    mats.sand = material(0xc99759, 0.94, 0.02);
    mats.sandDark = material(0xaa7743, 0.95, 0.01);
    mats.road = material(0x8d6341, 0.96, 0.01);
    mats.wood = material(0x7a4828, 0.82, 0.02);
    mats.darkWood = material(0x4b2b1a, 0.88, 0.02);
    mats.roof = material(0x573224, 0.8, 0.03);
    mats.sign = material(0xd09a55, 0.78, 0.02);
    mats.cactus = material(0x2f7b4f, 0.86, 0.01);
    mats.cactusDark = material(0x22633e, 0.9, 0.01);
    mats.rock = material(0x8f8174, 0.92, 0.01);
    mats.barrel = material(0x8a4125, 0.75, 0.02);
    mats.ammoCrate = material(0x5a381f, 0.8, 0.04);
    mats.ammoCrateLight = material(0xb17837, 0.72, 0.04);
    mats.ammoCrateBand = material(0x2a2017, 0.48, 0.45);
    mats.ammoRound = material(0xe0ad4d, 0.42, 0.16, 0xffbd45, 0.12);
    mats.ammoRing = new THREE.MeshBasicMaterial({
      color: 0xffdc7a,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    mats.ammoCratePointer = new THREE.MeshBasicMaterial({
      color: 0xffd56a,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
    });
    mats.ammoCratePointerGlow = new THREE.MeshBasicMaterial({
      color: 0xfff0a8,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    mats.ammoCratePointerOutline = new THREE.MeshBasicMaterial({
      color: 0x2a1508,
      transparent: true,
      opacity: 0.76,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide,
    });
    mats.metal = material(0x353333, 0.35, 0.75);
    mats.black = material(0x151515, 0.55, 0.25);
    mats.playerHat = material(0x6c351a, 0.78, 0.04);
    mats.playerCoat = material(0x934c22, 0.82, 0.03);
    mats.playerShirt = material(0xe2b66d, 0.85, 0.02);
    mats.playerSkin = material(0xd29a6a, 0.82, 0.01);
    mats.denim = material(0x2d5c84, 0.78, 0.01);
    mats.zombieSkin = material(0x6aa15e, 0.9, 0.01);
    mats.zombieSkinDark = material(0x456f43, 0.9, 0.01);
    mats.fastZombieSkin = material(0x8a4c3f, 0.86, 0.02);
    mats.fastZombieSkinDark = material(0x4b2825, 0.9, 0.01);
    mats.fastZombieClaw = material(0xd43c2c, 0.66, 0.03);
    mats.parasiteShell = material(0xd8b46b, 0.66, 0.04, 0x5b3a1f, 0.04);
    mats.parasiteShellDark = material(0x7c5a38, 0.78, 0.02);
    mats.parasiteFlesh = material(0xb06d54, 0.82, 0.02);
    mats.zombieAcidSkin = material(0x8bcf63, 0.84, 0.02, 0x244a18, 0.12);
    mats.zombieShirt = material(0x5e6254, 0.9, 0.01);
    mats.zombieBlood = material(0x5b1010, 0.85, 0.02);
    mats.acid = material(0x9cff47, 0.36, 0.02, 0x79ff22, 0.72);
    mats.acidDark = material(0x3f7a20, 0.66, 0.01, 0x56d11d, 0.24);
    mats.acidSpitCore = new THREE.MeshBasicMaterial({
      color: 0xdfff1a,
      transparent: true,
      opacity: 0.96,
      depthWrite: false,
    });
    mats.acidSpitShadow = new THREE.MeshBasicMaterial({
      color: 0x64ff00,
      transparent: true,
      opacity: 0.88,
      depthWrite: false,
    });
    mats.acidSpitHot = new THREE.MeshBasicMaterial({
      color: 0xffff66,
      transparent: true,
      opacity: 0.74,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    mats.slimeCore = new THREE.MeshStandardMaterial({
      color: 0x9dff48,
      roughness: 0.24,
      metalness: 0.02,
      emissive: 0x69e421,
      emissiveIntensity: 0.68,
      transparent: true,
      opacity: 0.92,
    });
    mats.slimeDark = new THREE.MeshStandardMaterial({
      color: 0x3f8f24,
      roughness: 0.42,
      metalness: 0.01,
      emissive: 0x2f8f18,
      emissiveIntensity: 0.28,
      transparent: true,
      opacity: 0.82,
    });
    mats.slimeHighlight = new THREE.MeshBasicMaterial({
      color: 0xdbff9d,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    mats.acidPuddle = new THREE.MeshBasicMaterial({
      color: 0x91ff2c,
      transparent: true,
      opacity: 0.38,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    mats.acidPuddleDark = new THREE.MeshBasicMaterial({
      color: 0x2f7518,
      transparent: true,
      opacity: 0.24,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    mats.acidPuddleFoam = new THREE.MeshBasicMaterial({
      color: 0xd8ff7d,
      transparent: true,
      opacity: 0.52,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    mats.fireGround = new THREE.MeshBasicMaterial({
      color: 0xff6a16,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    mats.fireGlow = new THREE.MeshBasicMaterial({
      color: 0xff8f24,
      transparent: true,
      opacity: 0.24,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    mats.fireCore = new THREE.MeshBasicMaterial({
      color: 0xff8626,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    mats.fireHot = new THREE.MeshBasicMaterial({
      color: 0xffb94a,
      transparent: true,
      opacity: 0.26,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    mats.fireBlockHot = new THREE.MeshBasicMaterial({
      color: 0xffa02a,
      transparent: true,
      opacity: 0.86,
      depthWrite: false,
    });
    mats.fireBlockCore = new THREE.MeshBasicMaterial({
      color: 0xff8a22,
      transparent: true,
      opacity: 0.86,
      depthWrite: false,
    });
    mats.fireBlockRed = new THREE.MeshBasicMaterial({
      color: 0xc93a18,
      transparent: true,
      opacity: 0.78,
      depthWrite: false,
    });
    mats.fireOrange = new THREE.MeshBasicMaterial({
      color: 0xff7b24,
      transparent: true,
      opacity: 0.82,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    mats.fireRed = new THREE.MeshBasicMaterial({
      color: 0xc43a16,
      transparent: true,
      opacity: 0.64,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    mats.fireSmoke = new THREE.MeshBasicMaterial({
      color: 0x33231b,
      transparent: true,
      opacity: 0.26,
      depthWrite: false,
    });
    mats.bullet = material(0xffdc67, 0.25, 0.2, 0xffb52f, 0.45);
    mats.rifleTracer = material(0xf8f5d7, 0.2, 0.25, 0xffe27a, 0.35);
    mats.coachTracer = material(0xffe5a4, 0.28, 0.16, 0xff9e38, 0.48);
    mats.grenade = material(0x293226, 0.62, 0.22);
    mats.explosion = material(0xff7b2e, 0.35, 0.02, 0xff6a16, 0.75);
    mats.flash = material(0xfff0a6, 0.2, 0.02, 0xffaa32, 0.9);
    mats.healthRed = material(0xd83a2e, 0.65, 0.02);
    mats.healthBack = material(0x301010, 0.8, 0.01);
    mats.gold = material(0xffc44d, 0.45, 0.08, 0xffa51f, 0.25);
    mats.xp = material(0x62d8ff, 0.32, 0.04, 0x65f4ff, 0.58);
    mats.xpLight = material(0xb8ff6a, 0.28, 0.02, 0xb8ff6a, 0.72);
    mats.contactShadow = new THREE.MeshBasicMaterial({
      color: 0x2a160c,
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
    });
    mats.smoke = new THREE.MeshBasicMaterial({
      color: 0x5a493d,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
    });
    mats.dust = new THREE.MeshBasicMaterial({
      color: 0xffd28a,
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
    });
    mats.shockwave = new THREE.MeshBasicMaterial({
      color: 0xffe0a0,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    mats.lightning = new THREE.MeshBasicMaterial({
      color: 0x86f3ff,
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    mats.paleDeputyBone = material(0xd8d3bb, 0.72, 0.03, 0x9adfff, 0.08);
    mats.paleDeputyBoneShadow = material(0x85887d, 0.82, 0.02, 0x526568, 0.05);
    mats.paleDeputyDuster = material(0x273238, 0.8, 0.04, 0x274c58, 0.1);
    mats.paleDeputyTrim = material(0x526568, 0.66, 0.08, 0x6bbfd1, 0.14);
    mats.paleDeputyHat = material(0x211f1d, 0.76, 0.04);
    mats.paleDeputyBadge = material(0xd7ad55, 0.38, 0.32, 0xffd56d, 0.34);
    mats.paleDeputyGlow = new THREE.MeshBasicMaterial({
      color: 0xe8fbff,
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    mats.paleDeputySeal = new THREE.MeshBasicMaterial({
      color: 0x78dfff,
      transparent: true,
      opacity: 0.56,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    mats.paleDeputySealGold = new THREE.MeshBasicMaterial({
      color: 0xffcf69,
      transparent: true,
      opacity: 0.48,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    mats.paleDeputyTracer = material(0xdffcff, 0.16, 0.2, 0x73ddff, 0.92);
    mats.consecratedMark = new THREE.MeshBasicMaterial({
      color: 0xffe6a2,
      transparent: true,
      opacity: 0.82,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    mats.hallowedGround = new THREE.MeshBasicMaterial({
      color: 0xffd976,
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    mats.rifleElectricGlow = new THREE.MeshBasicMaterial({
      color: 0x53e7ff,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    mats.mobileAimTarget = new THREE.MeshBasicMaterial({
      color: 0xffd66d,
      transparent: true,
      opacity: 0.86,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    mats.mobileAimTargetGlow = new THREE.MeshBasicMaterial({
      color: 0x8fe8ff,
      transparent: true,
      opacity: 0.32,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    mats.trapMetal = material(0x2c2a24, 0.42, 0.48);
    mats.trapWood = material(0x6a3a1e, 0.72, 0.04);
    mats.trapGlow = new THREE.MeshBasicMaterial({
      color: 0xffd36b,
      transparent: true,
      opacity: 0.46,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    mats.scorch = new THREE.MeshBasicMaterial({
      color: 0x2b170d,
      transparent: true,
      opacity: 0.24,
      depthWrite: false,
    });
  }

  function createGameRenderer() {
    var instance = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
    });
    configureRenderer(instance);
    attachRendererRecovery(instance);
    return instance;
  }

  function configureRenderer(instance) {
    instance.domElement.style.background = "#cfa269";
    instance.setPixelRatio(getRendererPixelRatio());
    instance.shadowMap.enabled = true;
    instance.shadowMap.type = THREE.PCFSoftShadowMap;
    instance.outputColorSpace = THREE.SRGBColorSpace;
    instance.toneMapping = THREE.ACESFilmicToneMapping;
    instance.toneMappingExposure = 1.03;
  }

  function getRendererPixelRatio() {
    if (MOBILE_RENDER_MODE) return 1;
    return Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
  }

  function attachRendererRecovery(instance) {
    instance.domElement.addEventListener("webglcontextlost", function (event) {
      event.preventDefault();
      renderDiagnostics.contextLost = true;
      renderDiagnostics.contextLosses += 1;
      renderDiagnostics.lastReason = "contextlost";
      window.setTimeout(function () {
        recoverRenderer("contextlost");
      }, 350);
    });
    instance.domElement.addEventListener("webglcontextrestored", function () {
      renderDiagnostics.contextLost = false;
      renderDiagnostics.recoveries += 1;
      renderDiagnostics.lastReason = "contextrestored";
      gameplayEffectWarmupDone = false;
      configureRenderer(instance);
      resize();
      warmupGameplayEffectResources();
      render();
    });
  }

  function initLights() {
    var hemi = new THREE.HemisphereLight(0xffe5bd, 0x574034, 1.7);
    scene.add(hemi);

    gameplaySun = new THREE.DirectionalLight(0xffd292, 3.1);
    gameplaySun.position.copy(gameplaySunOffset);
    gameplaySun.castShadow = true;
    gameplaySun.shadow.mapSize.set(2048, 2048);
    gameplaySun.shadow.camera.near = 8;
    gameplaySun.shadow.camera.far = 88;
    gameplaySun.target.position.set(0, 0, 0);
    scene.add(gameplaySun, gameplaySun.target);

    gameplaySunBack.copy(gameplaySunOffset).normalize();
    gameplaySunRight.set(0, 1, 0).cross(gameplaySunBack).normalize();
    gameplaySunUp.copy(gameplaySunBack).cross(gameplaySunRight).normalize();
    updateGameplayShadowBounds();

    var rim = new THREE.DirectionalLight(0x8fc5ff, 0.65);
    rim.position.set(30, 20, -24);
    scene.add(rim);
  }

  function buildEnvironment() {
    addBox(worldRoot, ARENA_W + 12, 0.32, ARENA_D + 10, mats.sand, 0, -0.18, 0);
    reservePlayerStartArea();
    buildRoadNetwork();
    buildTerrainPatches();
    buildMainTowns();
    buildMicroSettlements();
    buildDistributedPointsOfInterest();
    scatterTownProps();
    buildOutskirts();
    buildWasteland();
  }

  function initMenuScene() {
    menuState.mats = {
      mesa: material(0x8e5536, 0.96, 0.01),
      mesaDark: material(0x6f3d28, 0.98, 0.01),
      facadeA: material(0x805134, 0.85, 0.02),
      facadeB: material(0x98603a, 0.84, 0.02),
      facadeC: material(0x6f4a34, 0.86, 0.02),
      signBoard: material(0xd5a15c, 0.72, 0.02),
      signGlow: material(0xf2ca7b, 0.62, 0.02, 0xffce7a, 0.24),
      lantern: material(0xffd989, 0.34, 0.02, 0xffce73, 0.42),
      dust: new THREE.MeshBasicMaterial({
        color: 0xf6c782,
        transparent: true,
        opacity: 0.08,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
      dustWarm: new THREE.MeshBasicMaterial({
        color: 0xffd9a1,
        transparent: true,
        opacity: 0.05,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
      fireHalo: new THREE.MeshBasicMaterial({
        color: 0xffc364,
        transparent: true,
        opacity: 0.22,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
      fireRing: new THREE.MeshBasicMaterial({
        color: 0xffefab,
        transparent: true,
        opacity: 0.42,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    };
    buildMenuLights();
    buildMenuEnvironment();
    buildMenuCharacters();
    buildMenuDust();
  }

  function buildMenuLights() {
    var hemi = new THREE.HemisphereLight(0xffe5bf, 0x4f2c17, 1.55);
    menuScene.add(hemi);

    var sun = new THREE.DirectionalLight(0xffc987, 2.65);
    sun.position.set(-16, 24, 18);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -24;
    sun.shadow.camera.right = 24;
    sun.shadow.camera.top = 18;
    sun.shadow.camera.bottom = -18;
    sun.shadow.camera.near = 4;
    sun.shadow.camera.far = 72;
    menuScene.add(sun);

    var rim = new THREE.DirectionalLight(0xff8b54, 0.95);
    rim.position.set(18, 12, -26);
    menuScene.add(rim);

    var moonRim = new THREE.DirectionalLight(0x8db7ff, 0.36);
    moonRim.position.set(24, 18, 12);
    menuScene.add(moonRim);
  }

  function buildMenuEnvironment() {
    var menuMats = menuState.mats;
    addSharedBox(menuWorldRoot, 92, 0.32, 92, mats.sand, 0, -0.18, 0);
    configureRoadSurface(addSharedBox(menuWorldRoot, 18, 0.08, 56, mats.road, 1.5, 0.02, -4.5), 0.08);
    var angledMenuRoad = configureRoadSurface(addSharedBox(menuWorldRoot, 30, 0.06, 10, mats.road, -9.5, 0.03, 10.5), 0.06);
    angledMenuRoad.rotation.z = -0.06;

    for (var i = 0; i < 18; i++) {
      var patch = addSharedBox(
        menuWorldRoot,
        rand(1.2, 5.2),
        0.04,
        rand(0.18, 0.62),
        i % 2 ? mats.sandDark : mats.sand,
        rand(-24, 24),
        0.06 + i * 0.0005,
        rand(-24, 22)
      );
      patch.rotation.y = rand(0, Math.PI);
    }

    buildMenuMesa(-18, 3.8, -37, 18, 7.2, 8, menuMats.mesaDark);
    buildMenuMesa(4, 5.4, -40, 22, 10.8, 9, menuMats.mesa);
    buildMenuMesa(24, 4.2, -35, 16, 8.2, 7, menuMats.mesaDark);
    buildMenuMesa(33, 2.8, -28, 10, 5.2, 6, menuMats.mesa);

    buildMenuFacade(-14.5, -18.4, 8.8, 6.2, {
      wallMat: menuMats.facadeA,
      accentMat: menuMats.signBoard,
      frontMat: menuMats.facadeB,
      awning: true,
      falseFront: true,
      lamps: true,
    });
    buildMenuFacade(-3.4, -20.1, 10.8, 7.2, {
      wallMat: menuMats.facadeB,
      accentMat: menuMats.signGlow,
      frontMat: menuMats.facadeB,
      falseFront: true,
      balcony: true,
      lamps: true,
    });
    buildMenuFacade(10.8, -19.1, 9.6, 5.8, {
      wallMat: menuMats.facadeC,
      accentMat: menuMats.signBoard,
      frontMat: menuMats.facadeA,
      awning: true,
      sideWing: true,
      lamps: true,
    });

    buildMenuWaterTower(21.2, -14.6);

    for (var f = 0; f < 8; f++) {
      buildMenuFence(-23 + f * 3.4, -10.2 + (f % 2) * 0.12, false);
      if (f < 6) buildMenuFence(16.2 + f * 3.3, -8.8 + (f % 2) * 0.16, false);
    }
    for (var s = 0; s < 5; s++) {
      buildMenuFence(-24.6, -6.4 + s * 3.3, true);
      buildMenuFence(35.4, -7.2 + s * 3.6, true);
    }

    buildMenuCactus(-19.2, 1.4, 1.2);
    buildMenuCactus(-14.4, 10.8, 0.92);
    buildMenuCactus(17.8, 6.8, 1.08);
    buildMenuCactus(24.6, 1.1, 0.84);
    buildMenuRock(-7.4, 12.2, 1.1);
    buildMenuRock(14.2, 12.7, 0.92);
    buildMenuRock(20.8, 8.5, 0.78);

    menuState.crate = createAmmoCrate(-9.2, 6.6);
    menuState.crate.group.scale.setScalar(0.9);
    menuWorldRoot.add(menuState.crate.group);

  }

  function buildMenuMesa(x, y, z, w, h, d, mat) {
    var mesa = addSharedBox(menuWorldRoot, w, h, d, mat, x, y, z);
    mesa.rotation.y = rand(-0.08, 0.08);
    addSharedBox(menuWorldRoot, w * 0.56, h * 0.42, d * 0.68, mat, x - w * 0.12, y + h * 0.42, z + d * 0.06).rotation.y = rand(-0.12, 0.12);
    addSharedBox(menuWorldRoot, w * 0.32, h * 0.3, d * 0.34, mat, x + w * 0.18, y + h * 0.62, z - d * 0.04).rotation.y = rand(-0.18, 0.18);
  }

  function buildMenuFacade(x, z, w, h, options) {
    options = options || {};
    var g = new THREE.Group();
    g.position.set(x, 0, z);
    menuWorldRoot.add(g);

    var wallMat = options.wallMat || menuState.mats.facadeA;
    var accentMat = options.accentMat || menuState.mats.signBoard;
    var frontMat = options.frontMat || wallMat;
    var frontRailGap = 2.36;
    var frontRailWidth = Math.max(1.2, (w - 0.8 - frontRailGap) / 2);
    var frontRailOffset = frontRailGap / 2 + frontRailWidth / 2;

    addContactShadow(g, w + 1.5, 5.6, 0.2);
    addSharedBox(g, w, h, 4.1, wallMat, 0, h / 2, 0);
    addSharedBox(g, w + 0.7, 0.38, 4.5, mats.roof, 0, h + 0.16, -0.1);
    addSharedBox(g, frontRailWidth, 0.18, 1.6, mats.wood, -frontRailOffset, 0.92, 2.04);
    addSharedBox(g, frontRailWidth, 0.18, 1.6, mats.wood, frontRailOffset, 0.92, 2.04);
    addSharedBox(g, 1.44, 2.18, 0.5, mats.darkWood, 0, 1.1, 2.06);
    addSharedBox(g, 1.04, 1.64, 0.12, mats.black, 0, 1.06, 2.34);
    addSharedBox(g, 1.58, 0.18, 0.14, mats.metal, 0, 2.1, 2.2);
    addSharedBox(g, 1.58, 0.18, 0.14, mats.metal, 0, 0.22, 2.2);

    if (options.falseFront) {
      addSharedBox(g, w + 0.94, 1.32, 0.36, frontMat, 0, h + 0.44, 1.76);
      addSharedBox(g, w * 0.52, 0.54, 0.24, accentMat, 0, h + 0.72, 1.98);
    }
    if (options.awning) {
      var awning = addSharedBox(g, w * 0.78, 0.16, 1.42, accentMat, 0, h * 0.56, 2.22);
      awning.rotation.x = -0.24;
    }
    if (options.balcony) {
      addSharedBox(g, w * 0.68, 0.12, 1.44, mats.darkWood, 0, h * 0.74, 1.2);
      for (var b = 0; b < 5; b++) {
        addSharedBox(g, 0.1, 0.64, 0.1, mats.darkWood, -w * 0.24 + b * (w * 0.12), h * 0.58, 1.86);
      }
    }
    if (options.sideWing) {
      addSharedBox(g, 2.1, h * 0.78, 3.2, frontMat, -w * 0.42, h * 0.39, -0.78);
    }

    for (var i = -1; i <= 1; i += 2) {
      addSharedBox(g, 0.18, 2.32, 0.24, mats.darkWood, i * (w * 0.32), 1.16, 2);
      addSharedBox(g, 1.18, 1.12, 0.18, mats.black, i * (w * 0.2), 1.92, 2.14);
      addSharedBox(g, 0.92, 0.92, 0.08, accentMat, i * (w * 0.2), 1.92, 2.22);
    }

    if (options.lamps) {
      addMenuLantern(g, -w * 0.3, h * 0.54, 2.22);
      addMenuLantern(g, w * 0.3, h * 0.54, 2.22);
    }
  }

  function addMenuLantern(parent, x, y, z) {
    addSharedBox(parent, 0.12, 0.42, 0.12, mats.metal, x, y + 0.16, z - 0.04);
    var lamp = addSharedBox(parent, 0.24, 0.24, 0.24, menuState.mats.lantern, x, y, z);
    lamp.castShadow = false;
    lamp.receiveShadow = false;
  }

  function buildMenuWaterTower(x, z) {
    var g = new THREE.Group();
    g.position.set(x, 0, z);
    menuWorldRoot.add(g);
    addContactShadow(g, 4.2, 4.2, 0.16);
    addSharedBox(g, 2.8, 1.4, 2.8, mats.wood, 0, 6.1, 0);
    addSharedBox(g, 3.2, 0.18, 3.2, mats.metal, 0, 6.88, 0);
    addSharedBox(g, 0.26, 7.1, 0.26, mats.darkWood, -1.05, 3.55, -1.05);
    addSharedBox(g, 0.26, 7.1, 0.26, mats.darkWood, 1.05, 3.55, -1.05);
    addSharedBox(g, 0.26, 7.1, 0.26, mats.darkWood, -1.05, 3.55, 1.05);
    addSharedBox(g, 0.26, 7.1, 0.26, mats.darkWood, 1.05, 3.55, 1.05);
    addSharedBox(g, 2.7, 0.18, 0.18, mats.darkWood, 0, 4.9, -1.02);
    addSharedBox(g, 2.7, 0.18, 0.18, mats.darkWood, 0, 4.1, 1.02);
    addSharedBox(g, 0.18, 0.18, 2.7, mats.darkWood, -1.02, 4.55, 0);
    addSharedBox(g, 0.18, 0.18, 2.7, mats.darkWood, 1.02, 4.55, 0);
  }

  function buildMenuFence(x, z, vertical) {
    var g = new THREE.Group();
    g.position.set(x, 0, z);
    if (vertical) g.rotation.y = Math.PI / 2;
    menuWorldRoot.add(g);
    addSharedBox(g, 0.14, 1.1, 0.14, mats.darkWood, -0.72, 0.55, 0);
    addSharedBox(g, 0.14, 1.1, 0.14, mats.darkWood, 0.72, 0.55, 0);
    addSharedBox(g, 1.64, 0.14, 0.16, mats.wood, 0, 0.82, 0);
    addSharedBox(g, 1.64, 0.14, 0.16, mats.wood, 0, 0.42, 0);
  }

  function buildMenuCactus(x, z, scale) {
    var g = new THREE.Group();
    g.position.set(x, 0, z);
    menuWorldRoot.add(g);
    addContactShadow(g, 1.15 * scale, 1.05 * scale, 0.12);
    addSharedBox(g, 0.56 * scale, 2.1 * scale, 0.56 * scale, mats.cactus, 0, 1.05 * scale, 0);
    addSharedBox(g, 0.34 * scale, 1.1 * scale, 0.34 * scale, mats.cactusDark, -0.46 * scale, 1.34 * scale, 0);
    addSharedBox(g, 0.34 * scale, 0.34 * scale, 0.34 * scale, mats.cactus, -0.28 * scale, 1.68 * scale, 0);
    addSharedBox(g, 0.34 * scale, 0.92 * scale, 0.34 * scale, mats.cactusDark, 0.44 * scale, 1.18 * scale, 0);
    addSharedBox(g, 0.34 * scale, 0.34 * scale, 0.34 * scale, mats.cactus, 0.28 * scale, 1.44 * scale, 0);
  }

  function buildMenuRock(x, z, scale) {
    var g = new THREE.Group();
    g.position.set(x, 0, z);
    menuWorldRoot.add(g);
    addContactShadow(g, 1.1 * scale, 0.82 * scale, 0.1);
    addSharedBox(g, 1.08 * scale, 0.46 * scale, 0.7 * scale, mats.rock, 0, 0.22 * scale, 0).rotation.y = rand(0, Math.PI);
    addSharedBox(g, 0.48 * scale, 0.34 * scale, 0.5 * scale, mats.rock, 0.36 * scale, 0.43 * scale, 0.12 * scale).rotation.y = rand(0, Math.PI);
  }

  function buildMenuCharacters() {
    var cowboyGroup = createCowboy();
    cowboyGroup.scale.setScalar(1.18);
    cowboyGroup.position.set(-4.8, 0, 6.1);
    setWeaponMeshes(cowboyGroup, "rifle");
    menuWorldRoot.add(cowboyGroup);
    menuState.cowboy = {
      group: cowboyGroup,
      x: -4.8,
      z: 6.1,
      baseScale: 1.18,
      walkPhase: 0.8,
      moveAmount: 0.44,
      shootKick: 0.18,
    };

    var zombies = [
      { type: "walker", x: 2.1, z: 0.8, scale: 1.04 },
      { type: "runner", x: 6.9, z: -2.0, scale: 0.98 },
      { type: "spitter", x: 10.4, z: -5.2, scale: 1.02 },
    ];
    zombies.forEach(function (spec, index) {
      var enemy = makeZombie(spec.type);
      enemy.x = spec.x;
      enemy.z = spec.z;
      enemy.moveAmount = spec.type === "fastZombie" ? 1.08 : spec.type === "runner" ? 0.92 : 0.74;
      enemy.walkPhase = 0.6 + index * 0.9;
      enemy.menuScale = spec.scale || 1;
      enemy.group.position.set(spec.x, 0, spec.z);
      enemy.group.scale.setScalar(enemy.menuScale);
      enemy.group.rotation.y = Math.atan2(menuState.cowboy.x - spec.x, menuState.cowboy.z - spec.z);
      hideMenuHealthBar(enemy.group);
      menuWorldRoot.add(enemy.group);
      menuState.zombies.push(enemy);
    });
  }

  function hideMenuHealthBar(group) {
    if (!group || !group.userData || !group.userData.healthFill) return;
    var fill = group.userData.healthFill;
    fill.visible = false;
    var y = fill.position.y - 0.01;
    group.children.forEach(function (child) {
      if (child !== fill && Math.abs((child.position && child.position.y) - y) < 0.03) child.visible = false;
    });
  }

  function buildMenuDust() {
    for (var i = 0; i < 18; i++) {
      var mesh = new THREE.Mesh(
        getSharedGeometry("menu-dust-plane", function () {
          return new THREE.PlaneGeometry(1, 1);
        }),
        (i % 3 === 0 ? menuState.mats.dustWarm : menuState.mats.dust).clone()
      );
      mesh.userData.disposeGeometry = false;
      mesh.userData.disposeMaterial = true;
      mesh.position.set(rand(-8, 18), rand(0.9, 4.8), rand(-12, 12));
      mesh.scale.set(rand(0.18, 0.62), rand(0.08, 0.28), 1);
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.renderOrder = 3;
      menuEffectRoot.add(mesh);
      menuState.dust.push({
        mesh: mesh,
        baseX: mesh.position.x,
        baseY: mesh.position.y,
        baseZ: mesh.position.z,
        speed: rand(0.08, 0.28),
        drift: rand(0.18, 0.62),
        phase: rand(0, Math.PI * 2),
        spin: rand(-0.65, 0.65),
      });
    }
  }

  function reservePlayerStartArea() {
    registerMapFootprint("player-start-clear", PLAYER_START.x, PLAYER_START.z, 5.4, 5.4, 0.15, false);
  }

  function buildRoadNetwork() {
    MAIN_TOWNS.forEach(function (town) {
      addRoad(CITY_W + 13, 0.08, 7.6, town.center.x, 0.02, town.center.z, 0.28);
      addRoad(8.2, 0.09, CITY_D + 13, town.center.x, 0.04, town.center.z, 0.28);
    });
  }

  function buildMainTowns() {
    MAIN_TOWNS.forEach(function (town) {
      withMainTown(town, function () {
        buildGeneratedTown();
        buildFenceRing();
        buildTownSideRoads();
      });
    });
  }

  function buildTownSideRoads() {
    [-CITY_D * 0.31, CITY_D * 0.31].forEach(function (z) {
      addRoadIfLargeClear(CITY_W * mapRand(0.34, 0.48), 0.055, mapRand(2.0, 2.8), MAIN_TOWN_CENTER.x + mapRand(-3, 3), 0.035, townLocalZ(z + mapRand(-1.2, 1.2)), 0.22);
    });
    [-CITY_W * 0.32, CITY_W * 0.32].forEach(function (x) {
      addRoadIfLargeClear(mapRand(2.0, 2.7), 0.055, CITY_D * mapRand(0.32, 0.46), townLocalX(x + mapRand(-1.1, 1.1)), 0.035, MAIN_TOWN_CENTER.z + mapRand(-2.2, 2.2), 0.22);
    });
  }

  function addRoad(w, h, d, x, y, z, pad, type) {
    var road = addBox(worldRoot, w, h, d, mats.road, x, y, z);
    configureRoadSurface(road, h);
    registerMapFootprint(type || "road-clear", x, z, w, d, pad || 0.2, false);
    return road;
  }

  function configureRoadSurface(road, height) {
    if (!road) return road;
    road.castShadow = false;
    road.receiveShadow = false;
    road.renderOrder = -4;
    road.userData.isRoadSurface = true;
    road.userData.noDebris = true;
    road.userData.surfaceTopY = road.position.y + (Number(height) || 0) / 2;
    roadSurfaceMeshes.push(road);
    return road;
  }

  function addRoadIfLargeClear(w, h, d, x, y, z, pad, type) {
    if (mapAreaHitsLargePassageFootprints(x, z, w, d, pad || 0.2)) return null;
    return addRoad(w, h, d, x, y, z, pad, type);
  }

  function buildTerrainPatches() {
    var count = Math.round((BASE_ARENA_W * BASE_ARENA_D) / 48 * MAP_LINEAR_SCALE);
    var darkCount = Math.ceil(count / 3);
    var sandCount = count - darkCount;
    var geometry = getSharedGeometry("terrain-patch-box", function () {
      return new THREE.BoxGeometry(1, 1, 1);
    });
    var darkBatch = new THREE.InstancedMesh(geometry, mats.sandDark, darkCount);
    var sandBatch = new THREE.InstancedMesh(geometry, mats.sand, sandCount);
    var darkIndex = 0;
    var sandIndex = 0;
    var transform = new THREE.Object3D();
    for (var i = 0; i < count; i++) {
      var px = mapRand(-ARENA_W / 2 - 4, ARENA_W / 2 + 4);
      var pz = mapRand(-ARENA_D / 2 - 3, ARENA_D / 2 + 3);
      var pw = mapRand(0.5, 2.1);
      var pd = mapRand(0.15, 0.62);
      var patchY = 0.006 + mapRand(-0.001, 0.001);
      transform.position.set(px, patchY, pz);
      transform.rotation.set(0, mapRand(0, Math.PI), 0);
      transform.scale.set(pw, 0.035, pd);
      transform.updateMatrix();
      if (i % 3 === 0) darkBatch.setMatrixAt(darkIndex++, transform.matrix);
      else sandBatch.setMatrixAt(sandIndex++, transform.matrix);
      terrainPatchMeshes.push({
        castShadow: false,
        receiveShadow: false,
        userData: { isTerrainPatch: true, noDebris: true, surfaceTopY: patchY + 0.035 / 2 },
      });
    }
    configureTerrainPatchBatch(darkBatch);
    configureTerrainPatchBatch(sandBatch);
    worldRoot.add(darkBatch, sandBatch);
  }

  function configureTerrainPatchBatch(batch) {
    batch.name = "terrain patches";
    batch.castShadow = false;
    batch.receiveShadow = false;
    batch.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    batch.instanceMatrix.needsUpdate = true;
    batch.userData.disposeGeometry = false;
    batch.userData.noDebris = true;
    if (typeof batch.computeBoundingSphere === "function") batch.computeBoundingSphere();
  }

  function buildGeneratedTown() {
    var leftFront = -CITY_W * 0.32 + mapRand(-2.2, 1.6);
    var rightFront = CITY_W * 0.3 + mapRand(-1.6, 2.1);
    buildBuilding(townLocalX(leftFront), townLocalZ(-CITY_D * 0.28 + mapRand(-1.0, 1.0)), mapRand(8.0, 9.6), mapRand(5.0, 5.8), mapRand(4.0, 4.6), "SALOON", mats.wood);
    buildBuilding(townLocalX(rightFront), townLocalZ(-CITY_D * 0.29 + mapRand(-1.0, 1.0)), mapRand(6.8, 8.0), mapRand(4.6, 5.4), mapRand(3.6, 4.2), "SHERIFF", material(0x906043, 0.82, 0.02));
    var stableSlots = [
      [-CITY_W * 0.31, CITY_D * 0.28],
      [-CITY_W * 0.38, CITY_D * 0.1],
      [-CITY_W * 0.18, CITY_D * 0.39],
      [CITY_W * 0.28, CITY_D * 0.34],
    ];
    for (var stableAttempt = 0; stableAttempt < 10; stableAttempt++) {
      var stableSlot = stableSlots[stableAttempt % stableSlots.length];
      var stableX = townLocalX(stableSlot[0] + mapRand(-2, 2));
      var stableZ = townLocalZ(stableSlot[1] + mapRand(-1.2, 1.2));
      if (mainTownLargeAreaClear(stableX, stableZ + 0.25, 9.7, 6.9, 0.5) && tryBuildStable(stableX, stableZ)) break;
    }
    for (var towerAttempt = 0; towerAttempt < 8; towerAttempt++) {
      var towerX = townLocalX(CITY_W * 0.32 + mapRand(-2, 2));
      var towerZ = townLocalZ(CITY_D * 0.27 + mapRand(-1.2, 1.2));
      if (mainTownLargeAreaClear(towerX, towerZ, 3.25, 3.25, 0.5) && tryBuildWaterTower(towerX, towerZ)) break;
    }
    var graveyardSlots = [
      [CITY_W * 0.14, CITY_D * 0.22],
      [CITY_W * 0.02, CITY_D * 0.31],
      [CITY_W * 0.25, CITY_D * 0.36],
      [-CITY_W * 0.02, CITY_D * 0.21],
    ];
    for (var graveAttempt = 0; graveAttempt < 12; graveAttempt++) {
      var graveSlot = graveyardSlots[graveAttempt % graveyardSlots.length];
      var graveX = townLocalX(graveSlot[0] + mapRand(-1.6, 1.6));
      var graveZ = townLocalZ(graveSlot[1] + mapRand(-1.3, 1.3));
      if (mainTownLargeAreaClear(graveX, graveZ + 0.1, 4.95, 4.25, 0.5) && tryBuildGraveyard(graveX, graveZ)) break;
    }

    var extraLabels = ["BANK", "HOTEL", "STORE", "DEPOT", "SMITH", "JAIL"];
    var slots = getTownBuildingSlots();
    for (var i = 0; i < slots.length; i++) {
      if (mapRng() < 0.36) continue;
      var w = mapRand(5.2, 7.8);
      var d = mapRand(3.8, 5.4);
      var localX = slots[i][0] + mapRand(-1.6, 1.6);
      var localZ = slots[i][1] + mapRand(-1.2, 1.2);
      var x = townLocalX(localX);
      var z = townLocalZ(localZ);
      if (Math.abs(localX) < 7.2 || Math.abs(localZ) < 5.4) continue;
      if (!cityBuildingAreaClear(x, z, w, d)) continue;
      if (!canPlaceLargeMapObject(x, z + 0.35, w + 1.8, d + 2.6, 0.35)) continue;
      buildBuilding(x, z, w, d, mapRand(3.2, 4.3), extraLabels[i % extraLabels.length], i % 2 ? mats.wood : material(0x7f5639, 0.84, 0.02));
    }
  }

  function cityBuildingAreaClear(x, z, w, d) {
    return mainTownLargeAreaClear(x, z, w + 1.4, d + 2.25, 0.55);
  }

  function mainTownLargeAreaClear(x, z, w, d, pad) {
    var halfW = (w + 1.4) / 2 + 0.55;
    var halfD = (d + 2.25) / 2 + 0.55;
    if (arguments.length > 4) {
      halfW = w / 2 + (pad || 0);
      halfD = d / 2 + (pad || 0);
    }
    return Math.abs(x - MAIN_TOWN_CENTER.x) + halfW < CITY_W / 2 - 2.35 && Math.abs(z - MAIN_TOWN_CENTER.z) + halfD < CITY_D / 2 - 2.35;
  }

  function getTownBuildingSlots() {
    var sets = [
      [
        [-CITY_W * 0.42, -CITY_D * 0.06], [-CITY_W * 0.18, -CITY_D * 0.36],
        [CITY_W * 0.08, -CITY_D * 0.38], [CITY_W * 0.43, -CITY_D * 0.05],
        [-CITY_W * 0.43, CITY_D * 0.1], [-CITY_W * 0.08, CITY_D * 0.38],
        [CITY_W * 0.12, CITY_D * 0.36], [CITY_W * 0.42, CITY_D * 0.11],
      ],
      [
        [-CITY_W * 0.38, -CITY_D * 0.28], [-CITY_W * 0.12, -CITY_D * 0.42],
        [CITY_W * 0.18, -CITY_D * 0.32], [CITY_W * 0.39, -CITY_D * 0.14],
        [-CITY_W * 0.34, CITY_D * 0.18], [-CITY_W * 0.2, CITY_D * 0.43],
        [CITY_W * 0.08, CITY_D * 0.28], [CITY_W * 0.36, CITY_D * 0.34],
      ],
      [
        [-CITY_W * 0.45, -CITY_D * 0.18], [-CITY_W * 0.28, CITY_D * 0.03],
        [-CITY_W * 0.06, -CITY_D * 0.39], [CITY_W * 0.24, -CITY_D * 0.3],
        [CITY_W * 0.43, CITY_D * 0.02], [-CITY_W * 0.12, CITY_D * 0.34],
        [CITY_W * 0.16, CITY_D * 0.42], [CITY_W * 0.39, CITY_D * 0.24],
      ],
      [
        [-CITY_W * 0.4, -CITY_D * 0.34], [-CITY_W * 0.42, CITY_D * 0.04],
        [-CITY_W * 0.22, CITY_D * 0.28], [CITY_W * 0.0, -CITY_D * 0.42],
        [CITY_W * 0.18, -CITY_D * 0.24], [CITY_W * 0.33, CITY_D * 0.08],
        [CITY_W * 0.05, CITY_D * 0.38], [CITY_W * 0.44, CITY_D * 0.34],
      ],
    ];
    return sets[MAIN_TOWN_LAYOUT.variant % sets.length];
  }

  function buildFenceRing() {
    var fenceCountX = Math.floor(CITY_W / 2.8);
    for (var f = 0; f <= fenceCountX; f++) {
      var fenceX = -CITY_W / 2 - 0.5 + f * 2.8;
      if (Math.abs(fenceX) < 6.2) continue;
      addFenceSegment(townLocalX(fenceX), townLocalZ(-CITY_D / 2 - 0.7), false);
      addFenceSegment(townLocalX(fenceX), townLocalZ(CITY_D / 2 + 0.7), false);
    }
    var fenceCountZ = Math.floor(CITY_D / 2.8);
    for (var s = 0; s <= fenceCountZ; s++) {
      var fenceZ = -CITY_D / 2 + 2 + s * 2.8;
      if (Math.abs(fenceZ) < 4.6) continue;
      addFenceSegment(townLocalX(-CITY_W / 2 - 0.9), townLocalZ(fenceZ), true);
      addFenceSegment(townLocalX(CITY_W / 2 + 0.9), townLocalZ(fenceZ), true);
    }
    addGatePosts();
  }

  function buildMicroSettlements() {
    var settlements = [];
    MAIN_TOWNS.forEach(function (town, townIndex) {
      var c = town.center;
      var spreadX = Math.min(44, MAP_OUTSKIRT_X * 0.24);
      var spreadZ = Math.min(38, MAP_OUTSKIRT_Z * 0.24);
      settlements.push({ x: clampSettlementX(c.x + CITY_W / 2 + mapRand(8, spreadX)), z: clampSettlementZ(c.z + mapRand(-CITY_D * 0.35, CITY_D * 0.25)), name: "east-" + townIndex });
      settlements.push({ x: clampSettlementX(c.x + mapRand(-CITY_W * 0.24, CITY_W * 0.24)), z: clampSettlementZ(c.z + CITY_D / 2 + mapRand(8, spreadZ)), name: "south-" + townIndex });
      if (townIndex % 2 === 0) {
        settlements.push({ x: clampSettlementX(c.x - CITY_W / 2 - mapRand(8, spreadX)), z: clampSettlementZ(c.z + mapRand(-CITY_D * 0.24, CITY_D * 0.34)), name: "west-" + townIndex });
      } else {
        settlements.push({ x: clampSettlementX(c.x + mapRand(-CITY_W * 0.2, CITY_W * 0.26)), z: clampSettlementZ(c.z - CITY_D / 2 - mapRand(8, spreadZ)), name: "north-" + townIndex });
      }
    });
    settlements.forEach(function (settlement, index) {
      buildMicroSettlement(settlement.x + mapRand(-2.2, 2.2), settlement.z + mapRand(-1.8, 1.8), index);
    });
    for (var fallback = 0; countBuiltMicroSettlements() < MICRO_SETTLEMENT_TARGET && fallback < 72; fallback++) {
      var point = findFallbackMicroSettlementPoint();
      if (point) buildMicroSettlement(point.x, point.z, settlements.length + fallback);
    }
  }

  function countBuiltMicroSettlements() {
    var count = 0;
    for (var i = 0; i < microSettlementStats.length; i++) {
      if (!microSettlementStats[i].skipped && microSettlementStats[i].buildingCount >= 2) count += 1;
    }
    return count;
  }

  function findFallbackMicroSettlementPoint() {
    for (var attempt = 0; attempt < 96; attempt++) {
      var p = randomSettledOutskirtPoint();
      if (isWastelandPoint(p.x, p.z)) continue;
      if (mapAreaTouchesMainTownMicroBuffer(p.x, p.z, 21, 18, 0.8, MAIN_TOWN_MICRO_BUFFER)) continue;
      if (!mapAreaWithinBounds(p.x, p.z, 19, 17, 0.8)) continue;
      if (Math.hypot(p.x - PLAYER_START.x, p.z - PLAYER_START.z) < 10) continue;
      if (mapAreaHitsFootprints(p.x, p.z, 8, 7, 0.4)) continue;
      return p;
    }
    return null;
  }

  function clampSettlementX(x) {
    return clamp(x, -ARENA_W / 2 + 12.5, ARENA_W / 2 - 12.5);
  }

  function clampSettlementZ(z) {
    return clamp(z, -ARENA_D / 2 + 12.5, ARENA_D / 2 - 12.5);
  }

  function buildMicroSettlement(cx, zc, index) {
    var plan = findMicroSettlementPlan(cx, zc, index);
    if (!plan || plan.buildings.length < 2) {
      microSettlementStats.push({
        index: index,
        x: cx,
        z: zc,
        buildingCount: 0,
        roadCount: 0,
        fenceCount: 0,
        styleVariants: [],
        skipped: true,
      });
      return;
    }

    cx = plan.x;
    zc = plan.z;
    var placed = plan.buildings;
    for (var i = 0; i < placed.length; i++) {
      var building = placed[i];
      buildBuilding(
        building.x,
        building.z,
        building.w,
        building.d,
        building.h,
        building.label,
        building.wallMat,
        building.style
      );
    }
    var roadCount = buildMicroSettlementRoads(cx, zc, placed);
    if (mapRng() < 0.65) {
      var towerX = cx + mapRand(-5.5, 5.5);
      var towerZ = zc + mapRand(4.8, 6.6);
      if (!isWastelandPoint(towerX, towerZ) && isMapPointOpen(towerX, towerZ, 2.2, true)) tryBuildWaterTower(towerX, towerZ);
    }
    for (var b = 0; b < 3; b++) {
      var bx = cx + mapRand(-6.2, 6.2);
      var bz = zc + mapRand(-5.5, 5.5);
      if (isMapPointOpen(bx, bz, 1.1, true)) buildBarrel(bx, bz);
    }
    var fenceCount = buildMicroSettlementFences(cx, zc, placed);
    microSettlementStats.push({
      index: index,
      x: cx,
      z: zc,
      buildingCount: placed.length,
      roadCount: roadCount,
      fenceCount: fenceCount,
      styleVariants: placed.map(function (building) {
        return building.style ? building.style.variant : "plain";
      }),
      skipped: false,
    });
  }

  function buildMicroSettlementFences(cx, zc, buildings) {
    if (buildings.length < 3) return 0;
    var box = getMicroSettlementFootprintBox(buildings);
    var candidates = createMicroFenceCandidates(cx, zc, box);
    var maxFences = buildings.length >= 4 ? 2 : 1;
    var placed = 0;
    for (var i = 0; i < candidates.length && placed < maxFences; i++) {
      var c = candidates[i];
      if (addMicroFenceSegmentIfOpen(c.x, c.z, c.vertical, cx, zc)) placed += 1;
    }
    return placed;
  }

  function getMicroSettlementFootprintBox(buildings) {
    var minX = Infinity;
    var maxX = -Infinity;
    var minZ = Infinity;
    var maxZ = -Infinity;
    for (var i = 0; i < buildings.length; i++) {
      var b = buildings[i];
      minX = Math.min(minX, b.footprintX - b.footprintW / 2 - b.footprintPad);
      maxX = Math.max(maxX, b.footprintX + b.footprintW / 2 + b.footprintPad);
      minZ = Math.min(minZ, b.footprintZ - b.footprintD / 2 - b.footprintPad);
      maxZ = Math.max(maxZ, b.footprintZ + b.footprintD / 2 + b.footprintPad);
    }
    return {
      minX: minX,
      maxX: maxX,
      minZ: minZ,
      maxZ: maxZ,
      centerX: (minX + maxX) / 2,
      centerZ: (minZ + maxZ) / 2,
    };
  }

  function createMicroFenceCandidates(cx, zc, box) {
    var candidates = [
      { side: "west", vertical: true, x: box.minX - mapRand(2.4, 3.6), z: safeMapRand(box.minZ + 1.6, box.maxZ - 1.6) },
      { side: "east", vertical: true, x: box.maxX + mapRand(2.4, 3.6), z: safeMapRand(box.minZ + 1.6, box.maxZ - 1.6) },
      { side: "north", vertical: false, x: safeMapRand(box.minX + 1.8, box.maxX - 1.8), z: box.minZ - mapRand(2.4, 3.6) },
      { side: "south", vertical: false, x: safeMapRand(box.minX + 1.8, box.maxX - 1.8), z: box.maxZ + mapRand(2.4, 3.6) },
    ];
    var filtered = [];
    for (var i = 0; i < candidates.length; i++) {
      if (!microFenceSideFacesMainTown(box.centerX, box.centerZ, candidates[i].side)) filtered.push(candidates[i]);
    }
    for (var j = filtered.length - 1; j > 0; j--) {
      var swap = Math.floor(mapRng() * (j + 1));
      var tmp = filtered[j];
      filtered[j] = filtered[swap];
      filtered[swap] = tmp;
    }
    return filtered;
  }

  function safeMapRand(min, max) {
    if (max < min) return (min + max) / 2;
    return mapRand(min, max);
  }

  function microFenceSideFacesMainTown(x, z, side) {
    var nearest = nearestMainTown(x, z);
    var dx = nearest.center.x - x;
    var dz = nearest.center.z - z;
    if (side === "west") return dx < 0 && Math.abs(dx) > Math.abs(dz) * 0.55;
    if (side === "east") return dx > 0 && Math.abs(dx) > Math.abs(dz) * 0.55;
    if (side === "north") return dz < 0 && Math.abs(dz) > Math.abs(dx) * 0.55;
    if (side === "south") return dz > 0 && Math.abs(dz) > Math.abs(dx) * 0.55;
    return false;
  }

  function findMicroSettlementPlan(cx, zc, index) {
    var best = null;
    for (var attempt = 0; attempt < 12; attempt++) {
      var planCx = attempt === 0 ? cx : clampSettlementX(cx + mapRand(-5.8, 5.8));
      var planZc = attempt === 0 ? zc : clampSettlementZ(zc + mapRand(-5.4, 5.4));
      var plan = createMicroSettlementPlan(planCx, planZc, index);
      if (!best || plan.buildings.length > best.buildings.length) best = plan;
      if (plan.buildings.length >= 3 || (attempt > 3 && plan.buildings.length >= 2)) break;
    }
    return best;
  }

  function createMicroSettlementPlan(cx, zc, index) {
    var labels = ["TRADER", "STORE", "INN", "BARN", "POST", "DEPOT"];
    var offsets = getMicroSettlementOffsets(index);
    var buildings = [];
    for (var i = 0; i < offsets.length; i++) {
      if (i > 1 && mapRng() < 0.28) continue;
      var building = findMicroBuildingPlan(cx, zc, offsets[i], labels[(index + i) % labels.length], i, buildings);
      if (building) buildings.push(building);
    }
    return { x: cx, z: zc, buildings: buildings };
  }

  function getMicroSettlementOffsets(index) {
    return [
      [-7.5, -5.8], [7.3, -5.5], [-6.9, 6.2], [7.6, 5.9],
    ];
  }

  function findMicroBuildingPlan(cx, zc, offset, label, slotIndex, planned) {
    for (var attempt = 0; attempt < 8; attempt++) {
      var jitter = attempt < 4 ? 1 : 1.7;
      var w = mapRand(4.3, 6.0);
      var d = mapRand(3.0, 4.4);
      var x = cx + offset[0] + mapRand(-0.75 * jitter, 0.75 * jitter);
      var z = zc + offset[1] + mapRand(-0.65 * jitter, 0.65 * jitter);
      if (isWastelandPoint(x, z)) continue;
      if (mapAreaTouchesMainTownMicroBuffer(x, z + 0.35, w + 1.7, d + 2.4, 0.4, MAIN_TOWN_MICRO_BUFFER)) continue;
      if (!canPlaceLargeMapObject(x, z + 0.35, w + 1.7, d + 2.4, 0.4)) continue;
      if (microPlanAreaTooCloseToBuildings(planned, x, z + 0.35, w + 1.7, d + 2.4, 0.4, MIN_PLAYER_PASSAGE)) continue;
      var style = createMicroBuildingStyle(label, slotIndex, planned.length);
      return {
        x: x,
        z: z,
        w: w,
        d: d,
        h: mapRand(2.8, 3.7),
        label: label,
        wallMat: style.wallMat,
        style: style,
        footprintX: x,
        footprintZ: z + 0.35,
        footprintW: w + 1.7,
        footprintD: d + 2.4,
        footprintPad: 0.4,
      };
    }
    return null;
  }

  function createMicroBuildingStyle(label, slotIndex, plannedCount) {
    var variants = ["lean-to", "false-front", "awning", "workshop", "storefront"];
    var variant = variants[(labelHash(label) + slotIndex * 2 + plannedCount) % variants.length];
    var wallMats = [
      mats.wood,
      material(0x855b3c, 0.84, 0.02),
      material(0x9a6844, 0.86, 0.02),
      material(0x6f513b, 0.88, 0.02),
      material(0xa05b37, 0.82, 0.02),
    ];
    var roofMats = [
      mats.roof,
      material(0x4d2c20, 0.84, 0.03),
      material(0x6a3a26, 0.8, 0.03),
      material(0x3f3026, 0.82, 0.04),
    ];
    var signMats = [
      mats.sign,
      material(0xc8833e, 0.76, 0.02),
      material(0xe0ad62, 0.72, 0.02),
    ];
    return {
      variant: variant,
      wallMat: wallMats[(slotIndex + Math.floor(mapRng() * wallMats.length)) % wallMats.length],
      roofMat: roofMats[Math.floor(mapRng() * roofMats.length)],
      signMat: signMats[Math.floor(mapRng() * signMats.length)],
      side: mapRng() < 0.5 ? -1 : 1,
      roofOverhangW: mapRand(0.55, 1.15),
      roofOverhangD: mapRand(0.55, 1.05),
      roofHeight: mapRand(0.42, 0.72),
      signScale: mapRand(0.58, 0.88),
      porchDepth: variant === "storefront" ? mapRand(1.25, 1.55) : mapRand(0.72, 1.15),
      postCount: variant === "storefront" ? 5 : 3 + Math.floor(mapRng() * 3),
      hasLeanTo: variant === "lean-to" || label === "BARN",
      hasAwning: variant === "awning" || label === "TRADER",
      hasFalseFront: variant === "false-front" || label === "HOTEL",
      hasCrates: variant === "workshop" || mapRng() < 0.45,
      hasChimney: mapRng() < 0.6,
      hasRoofVent: mapRng() < 0.55,
    };
  }

  function labelHash(label) {
    var hash = 0;
    for (var i = 0; i < label.length; i++) hash += label.charCodeAt(i) * (i + 1);
    return hash;
  }

  function microPlanAreaTooCloseToBuildings(planned, x, z, w, d, pad, clearance) {
    var halfW = w / 2 + (pad || 0) + clearance;
    var halfD = d / 2 + (pad || 0) + clearance;
    for (var i = 0; i < planned.length; i++) {
      var rect = planned[i];
      if (
        Math.abs(x - rect.footprintX) < halfW + rect.footprintW / 2 + rect.footprintPad &&
        Math.abs(z - rect.footprintZ) < halfD + rect.footprintD / 2 + rect.footprintPad
      ) {
        return true;
      }
    }
    return false;
  }

  function buildMicroSettlementRoads(cx, zc, buildings) {
    if (buildings.length < 2) return 0;
    var roads = 0;
    var hasWest = false;
    var hasEast = false;
    var hasNorth = false;
    var hasSouth = false;
    var minX = Infinity;
    var maxX = -Infinity;
    var minZ = Infinity;
    var maxZ = -Infinity;
    var avgX = 0;
    var avgZ = 0;
    for (var i = 0; i < buildings.length; i++) {
      var b = buildings[i];
      hasWest = hasWest || b.x < cx - 2.2;
      hasEast = hasEast || b.x > cx + 2.2;
      hasNorth = hasNorth || b.z < zc - 2.2;
      hasSouth = hasSouth || b.z > zc + 2.2;
      minX = Math.min(minX, b.x);
      maxX = Math.max(maxX, b.x);
      minZ = Math.min(minZ, b.z);
      maxZ = Math.max(maxZ, b.z);
      avgX += b.x;
      avgZ += b.z;
    }
    avgX /= buildings.length;
    avgZ /= buildings.length;

    if (hasWest && hasEast) {
      roads += addMicroSettlementRoad(clamp(maxX - minX + 2.6, 8.5, 15.2), mapRand(1.25, 1.7), avgX + mapRand(-0.35, 0.35), avgZ + mapRand(-0.25, 0.25));
    }
    if (hasNorth && hasSouth && buildings.length >= 3) {
      roads += addMicroSettlementRoad(mapRand(1.2, 1.65), clamp(maxZ - minZ + 2.4, 7.8, 13.6), avgX + mapRand(-0.25, 0.25), avgZ + mapRand(-0.35, 0.35));
    }
    if (roads === 0) {
      if (maxX - minX >= maxZ - minZ) {
        roads += addMicroSettlementRoad(clamp(maxX - minX + 2.2, 6.2, 12.5), mapRand(1.15, 1.55), (minX + maxX) / 2, avgZ);
      } else {
        roads += addMicroSettlementRoad(mapRand(1.1, 1.5), clamp(maxZ - minZ + 2.0, 6.0, 11.8), avgX, (minZ + maxZ) / 2);
      }
    }
    return roads;
  }

  function addMicroSettlementRoad(w, d, x, z) {
    if (mapAreaTouchesMainTownMicroBuffer(x, z, w, d, 0.18, MAIN_TOWN_MICRO_BUFFER - 1.2)) return 0;
    if (mapAreaHitsFootprintType(x, z, w, d, MICRO_FENCE_ROAD_CLEARANCE + 0.35, "micro-fence")) return 0;
    return addRoadIfLargeClear(w, 0.055, d, x, 0.047, z, 0.18, "micro-road-clear") ? 1 : 0;
  }

  function buildDistributedPointsOfInterest() {
    var cols = 7;
    var rows = 4;
    var cells = [];
    for (var z = 0; z < rows; z++) {
      for (var x = 0; x < cols; x++) cells.push({ col: x, row: z });
    }
    shuffleMapArray(cells);

    for (var i = 0; i < cells.length && interestPointStats.length < INTEREST_POINT_TARGET; i++) {
      var spec = getInterestPointSpec(i);
      var point = findInterestPointInCell(cells[i], cols, rows, spec);
      if (point) buildInterestPoint(point.x, point.z, point.rotation, spec);
    }

    for (var fallback = 0; interestPointStats.length < INTEREST_POINT_TARGET && fallback < 90; fallback++) {
      var fallbackSpec = getInterestPointSpec(cells.length + fallback);
      var p = findInterestPointAnywhere(fallbackSpec);
      if (p) buildInterestPoint(p.x, p.z, p.rotation, fallbackSpec);
    }
  }

  function shuffleMapArray(items) {
    for (var i = items.length - 1; i > 0; i--) {
      var j = Math.floor(mapRng() * (i + 1));
      var tmp = items[i];
      items[i] = items[j];
      items[j] = tmp;
    }
  }

  function getInterestPointSpec(index) {
    var specs = [
      { type: "wagon", w: 6.2, d: 4.2, pad: 0.55, blocks: true },
      { type: "camp", w: 5.8, d: 4.8, pad: 0.42, blocks: false },
      { type: "graves", w: 5.2, d: 4.4, pad: 0.38, blocks: false },
      { type: "cache", w: 4.6, d: 4.2, pad: 0.36, blocks: false },
      { type: "ruin", w: 6.6, d: 5.4, pad: 0.45, blocks: true },
    ];
    return specs[(index * 3 + Math.floor(mapRng() * specs.length)) % specs.length];
  }

  function findInterestPointInCell(cell, cols, rows, spec) {
    var cellW = ARENA_W / cols;
    var cellD = ARENA_D / rows;
    var minX = -ARENA_W / 2 + cell.col * cellW + 8;
    var maxX = -ARENA_W / 2 + (cell.col + 1) * cellW - 8;
    var minZ = -ARENA_D / 2 + cell.row * cellD + 8;
    var maxZ = -ARENA_D / 2 + (cell.row + 1) * cellD - 8;
    for (var attempt = 0; attempt < 24; attempt++) {
      var x = safeMapRand(minX, maxX);
      var z = safeMapRand(minZ, maxZ);
      if (interestPointAreaClear(x, z, spec)) return { x: x, z: z, rotation: mapRand(0, Math.PI * 2) };
    }
    return null;
  }

  function findInterestPointAnywhere(spec) {
    for (var attempt = 0; attempt < 60; attempt++) {
      var x = mapRand(-ARENA_W / 2 + 10, ARENA_W / 2 - 10);
      var z = mapRand(-ARENA_D / 2 + 10, ARENA_D / 2 - 10);
      if (interestPointAreaClear(x, z, spec)) return { x: x, z: z, rotation: mapRand(0, Math.PI * 2) };
    }
    return null;
  }

  function interestPointAreaClear(x, z, spec) {
    if (Math.hypot(x - PLAYER_START.x, z - PLAYER_START.z) < 9.5) return false;
    if (pointNearAnyMainTown(x, z, 11)) return false;
    if (mapAreaTouchesMainTownMicroBuffer(x, z, spec.w, spec.d, spec.pad, 5.5)) return false;
    if (!mapAreaWithinBounds(x, z, spec.w, spec.d, spec.pad)) return false;
    if (mapAreaHitsFootprints(x, z, spec.w, spec.d, spec.pad)) return false;
    if (mapAreaTooCloseToLargeObjects(x, z, spec.w, spec.d, spec.pad, spec.blocks ? MIN_PLAYER_PASSAGE + 0.45 : 1.0)) return false;
    return true;
  }

  function buildInterestPoint(x, z, rotation, spec) {
    var built = false;
    if (spec.type === "wagon") built = buildAbandonedWagon(x, z, rotation, spec);
    else if (spec.type === "camp") built = buildDesertCamp(x, z, rotation, spec);
    else if (spec.type === "graves") built = buildLonelyGraves(x, z, rotation, spec);
    else if (spec.type === "cache") built = buildProspectorCache(x, z, rotation, spec);
    else built = buildLowRuin(x, z, rotation, spec);
    if (!built) return false;
    interestPointStats.push({
      type: spec.type,
      x: x,
      z: z,
      rotation: rotation,
    });
    return true;
  }

  function registerInterestFootprint(spec, x, z) {
    if (spec.blocks) addObstacle(x, z, spec.w, spec.d, spec.pad, "poi-large:" + spec.type);
    else registerMapFootprint("poi:" + spec.type, x, z, spec.w, spec.d, spec.pad, false);
  }

  function buildAbandonedWagon(x, z, rotation, spec) {
    registerInterestFootprint(spec, x, z);
    var g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = rotation;
    worldRoot.add(g);
    addContactShadow(g, 4.8, 2.8, 0.2);
    addBox(g, 3.3, 0.24, 1.45, mats.darkWood, 0, 0.48, 0);
    addBox(g, 3.65, 0.18, 0.18, mats.wood, 0, 0.78, -0.68);
    addBox(g, 3.65, 0.18, 0.18, mats.wood, 0, 0.78, 0.68);
    addBox(g, 0.18, 0.65, 1.45, mats.wood, -1.72, 0.72, 0);
    addBox(g, 0.18, 0.48, 1.35, mats.wood, 1.72, 0.66, 0);
    addBox(g, 1.65, 0.14, 0.14, mats.darkWood, 2.38, 0.43, 0.35).rotation.y = 0.28;
    addBox(g, 1.35, 0.12, 0.12, mats.darkWood, -2.28, 0.38, -0.45).rotation.y = -0.45;
    for (var i = -1; i <= 1; i += 2) {
      addBox(g, 0.22, 0.95, 0.95, mats.black, -1.12, 0.44, i * 0.92);
      addBox(g, 0.18, 0.76, 0.76, mats.wood, -1.12, 0.44, i * 0.94);
      addBox(g, 0.2, 0.82, 0.82, mats.black, 1.14, 0.42, i * 0.92);
      addBox(g, 0.16, 0.62, 0.62, mats.wood, 1.14, 0.42, i * 0.94);
    }
    addBox(g, 1.15, 0.22, 0.55, mats.sign, 0.35, 0.78, 0.05).rotation.y = -0.22;
    addBox(g, 0.58, 0.52, 0.42, mats.barrel, -0.42, 0.82, -0.1);
    return true;
  }

  function buildDesertCamp(x, z, rotation, spec) {
    registerInterestFootprint(spec, x, z);
    var g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = rotation;
    worldRoot.add(g);
    addContactShadow(g, 3.6, 2.7, 0.14);
    addBox(g, 0.72, 0.1, 0.72, mats.black, 0, 0.14, 0);
    for (var r = 0; r < 7; r++) {
      var angle = (r / 7) * Math.PI * 2;
      addBox(g, 0.22, 0.16, 0.18, mats.rock, Math.cos(angle) * 0.52, 0.22, Math.sin(angle) * 0.52).rotation.y = angle;
    }
    addBox(g, 0.16, 0.14, 0.72, mats.wood, -0.12, 0.33, 0).rotation.y = 0.9;
    addBox(g, 0.16, 0.14, 0.64, mats.wood, 0.18, 0.34, 0).rotation.y = -0.65;
    addBox(g, 1.42, 0.12, 0.58, mats.denim, -1.28, 0.16, -0.88).rotation.y = 0.14;
    addBox(g, 1.22, 0.1, 0.44, mats.sign, 1.34, 0.16, 0.92).rotation.y = -0.22;
    addBox(g, 0.72, 0.44, 0.62, mats.wood, 1.52, 0.38, -0.64);
    addBox(g, 0.48, 0.52, 0.48, mats.barrel, -1.52, 0.42, 0.68);
    addBox(g, 0.12, 1.38, 0.12, mats.darkWood, -1.8, 0.76, -1.45).rotation.z = -0.15;
    addBox(g, 0.12, 1.38, 0.12, mats.darkWood, 1.8, 0.76, -1.45).rotation.z = 0.15;
    addBox(g, 3.75, 0.1, 0.26, mats.sign, 0, 1.48, -1.45);
    return true;
  }

  function buildLonelyGraves(x, z, rotation, spec) {
    registerInterestFootprint(spec, x, z);
    var g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = rotation;
    worldRoot.add(g);
    addContactShadow(g, 3.7, 2.8, 0.12);
    for (var i = 0; i < 3; i++) {
      var gx = (i - 1) * 1.05;
      addBox(g, 0.48, 0.56, 0.16, mats.rock, gx, 0.34, -0.38);
      addBox(g, 0.72, 0.07, 0.2, mats.rock, gx, 0.68, -0.38);
      addBox(g, 0.76, 0.08, 1.02, mats.sandDark, gx, 0.12, 0.2);
    }
    addBox(g, 3.6, 0.13, 0.14, mats.darkWood, 0, 0.45, -1.25);
    addBox(g, 3.2, 0.13, 0.14, mats.darkWood, 0, 0.45, 1.25);
    addBox(g, 0.14, 0.82, 0.14, mats.darkWood, -1.92, 0.43, -1.25);
    addBox(g, 0.14, 0.82, 0.14, mats.darkWood, 1.92, 0.43, -1.25);
    return true;
  }

  function buildProspectorCache(x, z, rotation, spec) {
    registerInterestFootprint(spec, x, z);
    var g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = rotation;
    worldRoot.add(g);
    addContactShadow(g, 3.4, 3.1, 0.13);
    addBox(g, 1.04, 0.5, 0.78, mats.wood, -0.68, 0.36, -0.38);
    addBox(g, 0.9, 0.42, 0.68, mats.darkWood, 0.48, 0.32, -0.52);
    addBox(g, 0.48, 0.64, 0.48, mats.barrel, 1.24, 0.42, 0.48);
    addBox(g, 0.58, 0.18, 1.54, mats.sign, -0.54, 0.2, 0.82).rotation.y = 0.18;
    addBox(g, 0.16, 1.3, 0.16, mats.darkWood, -1.75, 0.72, -1.35);
    addBox(g, 0.16, 1.3, 0.16, mats.darkWood, 1.68, 0.72, -1.26);
    addBox(g, 3.54, 0.12, 0.18, mats.wood, -0.04, 1.28, -1.31).rotation.z = 0.04;
    addBox(g, 0.42, 0.22, 0.32, mats.metal, 0.02, 0.36, 0.48);
    addBox(g, 0.34, 0.16, 0.26, mats.ammoRound, 0.48, 0.34, 0.5);
    return true;
  }

  function buildLowRuin(x, z, rotation, spec) {
    var colliderBounds = getRotatedRectBounds(spec.w, spec.d, rotation);
    if (!canPlaceLargeMapObject(x, z + 0.18, colliderBounds.w, colliderBounds.d, spec.pad)) return false;
    var g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = rotation;
    worldRoot.add(g);
    addRotatedObstacle(x, z + 0.18, spec.w, spec.d, spec.pad, rotation, "poi-large:ruin");
    addContactShadow(g, 5.2, 3.7, 0.17);
    addBox(g, 4.2, 0.24, 2.6, mats.darkWood, 0, 0.16, 0);
    addBox(g, 3.4, 1.35, 0.24, material(0x6d4b34, 0.88, 0.01), -0.22, 0.82, -1.16);
    addBox(g, 0.26, 1.12, 2.2, mats.wood, -1.84, 0.68, 0.02);
    addBox(g, 0.24, 0.78, 1.7, mats.wood, 1.74, 0.5, 0.18);
    addBox(g, 3.8, 0.26, 0.46, mats.roof, -0.1, 1.48, -1.22).rotation.z = -0.05;
    addBox(g, 1.2, 0.14, 0.18, mats.sign, 0.85, 1.18, -1.42).rotation.z = 0.12;
    addBox(g, 0.55, 0.4, 0.46, mats.barrel, -0.82, 0.39, 0.9);
    addBox(g, 0.86, 0.18, 0.32, mats.wood, 1.12, 0.28, 1.08).rotation.y = -0.42;
    return true;
  }

  function scatterTownProps() {
    MAIN_TOWNS.forEach(function (town) {
      withMainTown(town, function () {
        scatterProps(18, "cactus", "city");
        scatterProps(13, "barrel", "city");
      });
    });
    scatterProps(scaleMapCount(42), "rock", "all");
  }

  function buildOutskirts() {
    scatterProps(scaleMapCount(34), "cactus", "settledOutskirts");
    scatterProps(scaleMapCount(12), "barrel", "settledOutskirts");
    scatterProps(scaleMapCount(82), "rock", "settledOutskirts");

    for (var s = 0; s < scaleMapCount(46); s++) {
      var scrap = randomSettledOutskirtPoint();
      var plankW = mapRand(0.35, 1.35);
      var plankD = mapRand(0.09, 0.22);
      var plankSide = Math.max(plankW, plankD);
      if (!isMapPointOpen(scrap.x, scrap.z, plankSide / 2 + 0.08, true) || mapAreaHitsFootprints(scrap.x, scrap.z, plankSide, plankSide, 0.08)) continue;
      var plank = addBox(worldRoot, plankW, 0.06, plankD, s % 3 === 0 ? mats.sign : mats.wood, scrap.x, 0.11, scrap.z);
      plank.rotation.y = mapRand(0, Math.PI);
      registerRotatedDecorFootprint("scrap", scrap.x, scrap.z, plankW, plankD, 0.06);
    }
  }

  function buildWasteland() {
    for (var i = 0; i < scaleMapCount(11); i++) {
      var p = randomWastelandPoint();
      var patch = addBox(worldRoot, mapRand(1.4, 3.8), 0.04, mapRand(0.18, 0.55), i % 2 ? mats.sandDark : mats.sand, p.x, 0.09, p.z);
      patch.rotation.y = mapRand(0, Math.PI);
    }
    scatterProps(scaleMapCount(5), "cactus", "wasteland");
    scatterProps(scaleMapCount(9), "rock", "wasteland");
    for (var s = 0; s < scaleMapCount(8); s++) {
      var scrap = randomWastelandPoint();
      var plankW = mapRand(0.45, 1.45);
      var plankD = mapRand(0.08, 0.2);
      var plankSide = Math.max(plankW, plankD);
      if (!isMapPointOpen(scrap.x, scrap.z, plankSide / 2 + 0.08, true) || mapAreaHitsFootprints(scrap.x, scrap.z, plankSide, plankSide, 0.08)) continue;
      var plank = addBox(worldRoot, plankW, 0.055, plankD, s % 3 === 0 ? mats.sign : mats.wood, scrap.x, 0.105, scrap.z);
      plank.rotation.y = mapRand(0, Math.PI);
      registerRotatedDecorFootprint("scrap", scrap.x, scrap.z, plankW, plankD, 0.06);
    }
    var shack = mapRng() < 0.55 ? randomWastelandPoint() : null;
    if (shack) {
      var shackW = mapRand(4.2, 5.4);
      var shackD = mapRand(3.2, 4.2);
      if (isMapPointOpen(shack.x, shack.z, 3.2, true) && canPlaceLargeMapObject(shack.x, shack.z + 0.35, shackW + 1.8, shackD + 2.6, 0.35)) {
        buildBuilding(shack.x, shack.z, shackW, shackD, mapRand(2.5, 3.2), "RUIN", material(0x6d4b34, 0.9, 0.01));
      }
    }
  }

  function scatterProps(count, type, region) {
    for (var i = 0; i < count; i++) {
      var p = findMapPropPoint(region, type === "rock" ? 1.05 : 1.1);
      if (!p) continue;
      if (type === "cactus") buildCactus(p.x, p.z, mapRand(0.58, 1.1));
      else if (type === "barrel") buildBarrel(p.x, p.z);
      else buildRock(p.x, p.z, mapRand(0.38, 1.12));
    }
  }

  function findMapPropPoint(region, radius) {
    for (var attempt = 0; attempt < 70; attempt++) {
      var p = region === "wasteland" ? randomWastelandPoint() : region === "settledOutskirts" ? randomSettledOutskirtPoint() : randomMapPoint(region);
      if (isMapPointOpen(p.x, p.z, radius, region !== "all")) return p;
    }
    return null;
  }

  function randomMapPoint(region) {
    if (region === "city") {
      var town = randomMainTown();
      return {
        x: townLocalXFor(town, mapRand(-CITY_W / 2 + 2, CITY_W / 2 - 2)),
        z: townLocalZFor(town, mapRand(-CITY_D / 2 + 2, CITY_D / 2 - 2)),
      };
    }
    return {
      x: mapRand(-ARENA_W / 2 + 2, ARENA_W / 2 - 2),
      z: mapRand(-ARENA_D / 2 + 2, ARENA_D / 2 - 2),
    };
  }

  function randomOutskirtPoint() {
    for (var attempt = 0; attempt < 28; attempt++) {
      var town = randomMainTown();
      var side = Math.floor(mapRng() * 4);
      var x = town.center.x;
      var z = town.center.z;
      if (side === 0) {
        x += mapRand(-CITY_W * 0.72, CITY_W * 0.72);
        z -= CITY_D / 2 + mapRand(4.5, Math.min(58, MAP_OUTSKIRT_Z * 0.42));
      } else if (side === 1) {
        x += mapRand(-CITY_W * 0.72, CITY_W * 0.72);
        z += CITY_D / 2 + mapRand(4.5, Math.min(58, MAP_OUTSKIRT_Z * 0.42));
      } else if (side === 2) {
        x -= CITY_W / 2 + mapRand(4.5, Math.min(66, MAP_OUTSKIRT_X * 0.42));
        z += mapRand(-CITY_D * 0.72, CITY_D * 0.72);
      } else {
        x += CITY_W / 2 + mapRand(4.5, Math.min(66, MAP_OUTSKIRT_X * 0.42));
        z += mapRand(-CITY_D * 0.72, CITY_D * 0.72);
      }
      x = clamp(x, -ARENA_W / 2 + 1.2, ARENA_W / 2 - 1.2);
      z = clamp(z, -ARENA_D / 2 + 1.2, ARENA_D / 2 - 1.2);
      if (!pointNearAnyMainTown(x, z, 1.5)) return { x: x, z: z };
    }
    return randomMapPoint("all");
  }

  function randomSettledOutskirtPoint() {
    for (var attempt = 0; attempt < 30; attempt++) {
      var p = randomOutskirtPoint();
      if (!isWastelandPoint(p.x, p.z)) return p;
    }
    return {
      x: mapRand(-ARENA_W / 2 + 2.0, ARENA_W / 2 - 1.2),
      z: mapRand(-ARENA_D / 2 + 1.4, ARENA_D / 2 - 1.4),
    };
  }

  function randomWastelandPoint() {
    return {
      x: mapRand(-ARENA_W / 2 + 2, -CITY_W / 2 - 3.5),
      z: mapRand(-ARENA_D / 2 + 2, ARENA_D / 2 - 2),
    };
  }

  function isWastelandPoint(x, z) {
    return x < -CITY_W / 2 - 2.6;
  }

  function isMapPointOpen(x, z, radius, avoidRoads) {
    if (Math.hypot(x - PLAYER_START.x, z - PLAYER_START.z) < 7.2) return false;
    if (avoidRoads && pointNearAnyMainRoad(x, z)) return false;
    if (Math.abs(x) > ARENA_W / 2 - radius - 1 || Math.abs(z) > ARENA_D / 2 - radius - 1) return false;
    return !pointHitsMapFootprint(x, z, radius);
  }

  function rectHitsObstacles(x, z, w, d, pad) {
    return mapAreaHitsFootprints(x, z, w, d, pad);
  }

  function mapAreaHitsFootprints(x, z, w, d, pad) {
    var halfW = w / 2 + (pad || 0);
    var halfD = d / 2 + (pad || 0);
    for (var i = 0; i < mapFootprints.length; i++) {
      var rect = mapFootprints[i];
      if (
        Math.abs(x - rect.x) < halfW + rect.halfW + rect.pad &&
        Math.abs(z - rect.z) < halfD + rect.halfD + rect.pad
      ) {
        return true;
      }
    }
    return false;
  }

  function canPlaceLargeMapObject(x, z, w, d, pad) {
    return mapAreaWithinBounds(x, z, w, d, pad) && !mapAreaHitsFootprints(x, z, w, d, pad) && !mapAreaTooCloseToLargeObjects(x, z, w, d, pad || 0, MIN_PLAYER_PASSAGE);
  }

  function mapAreaTooCloseToLargeObjects(x, z, w, d, pad, clearance) {
    var halfW = w / 2 + pad + clearance;
    var halfD = d / 2 + pad + clearance;
    for (var i = 0; i < mapFootprints.length; i++) {
      var rect = mapFootprints[i];
      if (!isLargePassageFootprint(rect)) continue;
      if (
        Math.abs(x - rect.x) < halfW + rect.halfW + rect.pad &&
        Math.abs(z - rect.z) < halfD + rect.halfD + rect.pad
      ) {
        return true;
      }
    }
    return false;
  }

  function mapAreaHitsLargePassageFootprints(x, z, w, d, pad) {
    var halfW = w / 2 + (pad || 0);
    var halfD = d / 2 + (pad || 0);
    for (var i = 0; i < mapFootprints.length; i++) {
      var rect = mapFootprints[i];
      if (!isLargePassageFootprint(rect)) continue;
      if (
        Math.abs(x - rect.x) < halfW + rect.halfW + rect.pad &&
        Math.abs(z - rect.z) < halfD + rect.halfD + rect.pad
      ) {
        return true;
      }
    }
    return false;
  }

  function mapAreaWithinBounds(x, z, w, d, pad) {
    var halfW = w / 2 + (pad || 0);
    var halfD = d / 2 + (pad || 0);
    return (
      x - halfW >= -ARENA_W / 2 - 2.5 &&
      x + halfW <= ARENA_W / 2 + 2.5 &&
      z - halfD >= -ARENA_D / 2 - 2.5 &&
      z + halfD <= ARENA_D / 2 + 2.5
    );
  }

  function mapAreaTouchesMainTownMicroBuffer(x, z, w, d, pad, buffer) {
    var halfW = w / 2 + (pad || 0);
    var halfD = d / 2 + (pad || 0);
    var margin = buffer || 0;
    for (var i = 0; i < MAIN_TOWNS.length; i++) {
      var c = MAIN_TOWNS[i].center;
      if (
        x + halfW > c.x - CITY_W / 2 - margin &&
        x - halfW < c.x + CITY_W / 2 + margin &&
        z + halfD > c.z - CITY_D / 2 - margin &&
        z - halfD < c.z + CITY_D / 2 + margin
      ) {
        return true;
      }
    }
    return false;
  }

  function mapAreaHitsFootprintType(x, z, w, d, pad, type) {
    var halfW = w / 2 + (pad || 0);
    var halfD = d / 2 + (pad || 0);
    for (var i = 0; i < mapFootprints.length; i++) {
      var rect = mapFootprints[i];
      if (Array.isArray(type) ? type.indexOf(rect.type) === -1 : rect.type !== type) continue;
      if (
        Math.abs(x - rect.x) < halfW + rect.halfW + rect.pad &&
        Math.abs(z - rect.z) < halfD + rect.halfD + rect.pad
      ) {
        return true;
      }
    }
    return false;
  }

  function pointHitsMapFootprint(x, z, radius, ignoreType) {
    for (var i = 0; i < mapFootprints.length; i++) {
      if (footprintTypeIgnored(mapFootprints[i].type, ignoreType)) continue;
      if (circleIntersectsRect(x, z, radius, mapFootprints[i])) return true;
    }
    return false;
  }

  function footprintTypeIgnored(type, ignoreType) {
    if (!ignoreType) return false;
    if (Array.isArray(ignoreType)) return ignoreType.indexOf(type) !== -1;
    return type === ignoreType;
  }

  function registerMapFootprint(type, x, z, w, d, pad, blocking) {
    var footprint = {
      id: nextMapFootprintId++,
      type: type || "map-object",
      x: x,
      z: z,
      halfW: w / 2,
      halfD: d / 2,
      pad: pad || 0,
      blocking: blocking !== false,
    };
    mapFootprints.push(footprint);
    return footprint;
  }

  function registerRotatedDecorFootprint(type, x, z, w, d, pad) {
    var maxSide = Math.max(w, d);
    return registerMapFootprint(type, x, z, maxSide, maxSide, pad || 0, false);
  }

  function isLargePassageFootprint(footprint) {
    return (
      footprint.type.indexOf("building:") === 0 ||
      footprint.type.indexOf("poi-large:") === 0 ||
      footprint.type === "stable" ||
      footprint.type === "water-tower" ||
      footprint.type === "graveyard"
    );
  }

  function isRoadFootprint(footprint) {
    return footprint.type === "road-clear" || footprint.type === "micro-road-clear";
  }

  function validateMapLayout() {
    var issues = [];
    var totalIssues = 0;
    var counts = {};
    var minGap = Infinity;
    for (var t = 0; t < MAIN_TOWNS.length; t++) {
      for (var u = t + 1; u < MAIN_TOWNS.length; u++) {
        if (!isTownCenterFarEnough(MAIN_TOWNS[t].center, [MAIN_TOWNS[u]])) {
          totalIssues += 1;
          if (issues.length < 80) {
            issues.push({
              kind: "main-town-too-close",
              a: MAIN_TOWNS[t].index,
              b: MAIN_TOWNS[u].index,
              ax: Number(MAIN_TOWNS[t].center.x.toFixed(2)),
              az: Number(MAIN_TOWNS[t].center.z.toFixed(2)),
              bx: Number(MAIN_TOWNS[u].center.x.toFixed(2)),
              bz: Number(MAIN_TOWNS[u].center.z.toFixed(2)),
              distance: Number(Math.hypot(MAIN_TOWNS[t].center.x - MAIN_TOWNS[u].center.x, MAIN_TOWNS[t].center.z - MAIN_TOWNS[u].center.z).toFixed(2)),
            });
          }
        }
      }
    }
    for (var i = 0; i < mapFootprints.length; i++) {
      var a = mapFootprints[i];
      counts[a.type] = (counts[a.type] || 0) + 1;
      if (
        !isRoadFootprint(a) &&
        a.x - a.halfW - a.pad < -ARENA_W / 2 - 2.5 ||
        (!isRoadFootprint(a) && a.x + a.halfW + a.pad > ARENA_W / 2 + 2.5) ||
        (!isRoadFootprint(a) && a.z - a.halfD - a.pad < -ARENA_D / 2 - 2.5) ||
        (!isRoadFootprint(a) && a.z + a.halfD + a.pad > ARENA_D / 2 + 2.5)
      ) {
        totalIssues += 1;
        if (issues.length < 80) {
          issues.push({
            kind: "out-of-bounds",
            type: a.type,
            x: Number(a.x.toFixed(2)),
            z: Number(a.z.toFixed(2)),
          });
        }
      }
      if ((a.type === "micro-road-clear" || a.type === "micro-fence") && mapAreaTouchesMainTownMicroBuffer(a.x, a.z, a.halfW * 2, a.halfD * 2, a.pad, MAIN_TOWN_MICRO_BUFFER - 1.2)) {
        totalIssues += 1;
        if (issues.length < 80) {
          issues.push({
            kind: "micro-settlement-town-buffer",
            type: a.type,
            x: Number(a.x.toFixed(2)),
            z: Number(a.z.toFixed(2)),
          });
        }
      }
      for (var j = i + 1; j < mapFootprints.length; j++) {
        var b = mapFootprints[j];
        var overlapX = a.halfW + b.halfW + a.pad + b.pad - Math.abs(a.x - b.x);
        var overlapZ = a.halfD + b.halfD + a.pad + b.pad - Math.abs(a.z - b.z);
        minGap = Math.min(minGap, Math.max(-overlapX, -overlapZ));
        var overlapThreshold = getMapOverlapThreshold(a, b);
        if (overlapX > overlapThreshold && overlapZ > overlapThreshold && !isAllowedMapFootprintContact(a, b)) {
          totalIssues += 1;
          if (issues.length < 80) {
            issues.push({
              kind: "overlap",
              a: a.type,
              b: b.type,
              ax: Number(a.x.toFixed(2)),
              az: Number(a.z.toFixed(2)),
              bx: Number(b.x.toFixed(2)),
              bz: Number(b.z.toFixed(2)),
              overlapX: Number(overlapX.toFixed(3)),
              overlapZ: Number(overlapZ.toFixed(3)),
            });
          }
        }
        var passageIssue = getPassageIssue(a, b);
        if (passageIssue) {
          totalIssues += 1;
          if (issues.length < 80) issues.push(passageIssue);
        }
        var fenceRoadIssue = getMicroFenceRoadIssue(a, b);
        if (fenceRoadIssue) {
          totalIssues += 1;
          if (issues.length < 80) issues.push(fenceRoadIssue);
        }
      }
    }
    for (var s = 0; s < microSettlementStats.length; s++) {
      var settlement = microSettlementStats[s];
      if (settlement.roadCount > 0 && settlement.buildingCount < 2) {
        totalIssues += 1;
        if (issues.length < 80) {
          issues.push({
            kind: "orphan-micro-road",
            index: settlement.index,
            x: Number(settlement.x.toFixed(2)),
            z: Number(settlement.z.toFixed(2)),
            buildingCount: settlement.buildingCount,
            roadCount: settlement.roadCount,
          });
        }
      }
    }
    return {
      seed: MAP_SEED,
      arenaW: ARENA_W,
      arenaD: ARENA_D,
      mainTownCount: MAIN_TOWNS.length,
      interestPointTarget: INTEREST_POINT_TARGET,
      interestPointCount: interestPointStats.length,
      mainTowns: MAIN_TOWNS.map(function (town) {
        return {
          index: town.index,
          x: Number(town.center.x.toFixed(2)),
          z: Number(town.center.z.toFixed(2)),
          mirrorX: town.layout.mirrorX,
          mirrorZ: town.layout.mirrorZ,
          variant: town.layout.variant,
        };
      }),
      mainTownMinDistance: getMainTownMinDistance(),
      mainTownMaxDistance: getMainTownMaxDistance(),
      mainTownSpread: getMainTownSpread(),
      footprintCount: mapFootprints.length,
      obstacleCount: obstacleRects.length,
      issueCount: totalIssues,
      issues: issues,
      counts: counts,
      microSettlements: microSettlementStats.map(function (settlement) {
        return {
          index: settlement.index,
          x: Number(settlement.x.toFixed(2)),
          z: Number(settlement.z.toFixed(2)),
          buildingCount: settlement.buildingCount,
          roadCount: settlement.roadCount,
          fenceCount: settlement.fenceCount || 0,
          styleVariants: settlement.styleVariants || [],
        };
      }),
      interestPoints: interestPointStats.map(function (point) {
        return {
          type: point.type,
          x: Number(point.x.toFixed(2)),
          z: Number(point.z.toFixed(2)),
          rotation: Number((point.rotation || 0).toFixed(3)),
        };
      }),
      playerSpawnClear: !pointHitsMapFootprint(PLAYER_START.x, PLAYER_START.z, 1.05, ["player-start-clear", "road-clear", "micro-road-clear"]),
      minGap: isFinite(minGap) ? Number(minGap.toFixed(3)) : null,
    };
  }

  function getMainTownMinDistance() {
    if (MAIN_TOWNS.length < 2) return null;
    var minDistance = Infinity;
    for (var i = 0; i < MAIN_TOWNS.length; i++) {
      for (var j = i + 1; j < MAIN_TOWNS.length; j++) {
        minDistance = Math.min(minDistance, Math.hypot(MAIN_TOWNS[i].center.x - MAIN_TOWNS[j].center.x, MAIN_TOWNS[i].center.z - MAIN_TOWNS[j].center.z));
      }
    }
    return Number(minDistance.toFixed(2));
  }

  function getMainTownMaxDistance() {
    if (MAIN_TOWNS.length < 2) return null;
    var maxDistance = 0;
    for (var i = 0; i < MAIN_TOWNS.length; i++) {
      for (var j = i + 1; j < MAIN_TOWNS.length; j++) {
        maxDistance = Math.max(maxDistance, Math.hypot(MAIN_TOWNS[i].center.x - MAIN_TOWNS[j].center.x, MAIN_TOWNS[i].center.z - MAIN_TOWNS[j].center.z));
      }
    }
    return Number(maxDistance.toFixed(2));
  }

  function getMainTownSpread() {
    var minX = Infinity;
    var maxX = -Infinity;
    var minZ = Infinity;
    var maxZ = -Infinity;
    for (var i = 0; i < MAIN_TOWNS.length; i++) {
      var c = MAIN_TOWNS[i].center;
      minX = Math.min(minX, c.x);
      maxX = Math.max(maxX, c.x);
      minZ = Math.min(minZ, c.z);
      maxZ = Math.max(maxZ, c.z);
    }
    return {
      width: Number((maxX - minX).toFixed(2)),
      depth: Number((maxZ - minZ).toFixed(2)),
      widthRatio: Number(((maxX - minX) / ARENA_W).toFixed(3)),
      depthRatio: Number(((maxZ - minZ) / ARENA_D).toFixed(3)),
    };
  }

  function getRoadSurfaceDiagnostics() {
    var shadowCastingRoads = 0;
    var shadowReceivingRoads = 0;
    var minRoadSurfaceTopY = Infinity;
    for (var i = 0; i < roadSurfaceMeshes.length; i++) {
      var road = roadSurfaceMeshes[i];
      if (!road) continue;
      if (road.castShadow) shadowCastingRoads += 1;
      if (road.receiveShadow) shadowReceivingRoads += 1;
      if (road.userData && isFinite(road.userData.surfaceTopY)) {
        minRoadSurfaceTopY = Math.min(minRoadSurfaceTopY, road.userData.surfaceTopY);
      }
    }

    var maxTerrainPatchTopY = -Infinity;
    for (var j = 0; j < terrainPatchMeshes.length; j++) {
      var patch = terrainPatchMeshes[j];
      if (patch && patch.userData && isFinite(patch.userData.surfaceTopY)) {
        maxTerrainPatchTopY = Math.max(maxTerrainPatchTopY, patch.userData.surfaceTopY);
      }
    }

    return {
      roadCount: roadSurfaceMeshes.length,
      shadowCastingRoads: shadowCastingRoads,
      shadowReceivingRoads: shadowReceivingRoads,
      terrainPatchCount: terrainPatchMeshes.length,
      minRoadSurfaceTopY: isFinite(minRoadSurfaceTopY) ? Number(minRoadSurfaceTopY.toFixed(4)) : null,
      maxTerrainPatchTopY: isFinite(maxTerrainPatchTopY) ? Number(maxTerrainPatchTopY.toFixed(4)) : null,
    };
  }

  function isAllowedMapFootprintContact(a, b) {
    if (isRoadFootprint(a) || isRoadFootprint(b)) {
      var other = isRoadFootprint(a) ? b : a;
      return !isLargePassageFootprint(other);
    }
    if (a.type === "fence" && b.type === "fence") return true;
    if (
      (a.type === "fence" && b.type === "gate-post") ||
      (a.type === "gate-post" && b.type === "fence")
    ) {
      return true;
    }
    return false;
  }

  function getMapOverlapThreshold(a, b) {
    if (isRoadFootprint(a) || isRoadFootprint(b)) return 0.45;
    return 0.08;
  }

  function getMicroFenceRoadIssue(a, b) {
    var fence = a.type === "micro-fence" ? a : b.type === "micro-fence" ? b : null;
    var road = fence === a ? b : a;
    if (!fence || !isRoadFootprint(road)) return null;
    var overlapX = fence.halfW + road.halfW + fence.pad + road.pad + MICRO_FENCE_ROAD_CLEARANCE - Math.abs(fence.x - road.x);
    var overlapZ = fence.halfD + road.halfD + fence.pad + road.pad + MICRO_FENCE_ROAD_CLEARANCE - Math.abs(fence.z - road.z);
    if (overlapX > 0 && overlapZ > 0) {
      return {
        kind: "micro-fence-road-clearance",
        fenceX: Number(fence.x.toFixed(2)),
        fenceZ: Number(fence.z.toFixed(2)),
        roadType: road.type,
        roadX: Number(road.x.toFixed(2)),
        roadZ: Number(road.z.toFixed(2)),
        overlapX: Number(overlapX.toFixed(3)),
        overlapZ: Number(overlapZ.toFixed(3)),
      };
    }
    return null;
  }

  function getPassageIssue(a, b) {
    if (!isLargePassageFootprint(a) || !isLargePassageFootprint(b)) return null;
    var gapX = Math.abs(a.x - b.x) - (a.halfW + a.pad + b.halfW + b.pad);
    var gapZ = Math.abs(a.z - b.z) - (a.halfD + a.pad + b.halfD + b.pad);
    if (gapX < -0.08 && gapZ < -0.08) return null;
    var passage = Math.max(gapX, gapZ);
    if (passage >= 0 && passage < MIN_PLAYER_PASSAGE) {
      return {
        kind: "narrow-passage",
        a: a.type,
        b: b.type,
        ax: Number(a.x.toFixed(2)),
        az: Number(a.z.toFixed(2)),
        bx: Number(b.x.toFixed(2)),
        bz: Number(b.z.toFixed(2)),
        gapX: Number(gapX.toFixed(3)),
        gapZ: Number(gapZ.toFixed(3)),
        passage: Number(passage.toFixed(3)),
        required: MIN_PLAYER_PASSAGE,
      };
    }
    return null;
  }

  function circleIntersectsUnrotatedRect(x, z, radius, rect) {
    var minDist = radius + rect.pad;
    var closestX = clamp(x, rect.x - rect.halfW, rect.x + rect.halfW);
    var closestZ = clamp(z, rect.z - rect.halfD, rect.z + rect.halfD);
    var dx = x - closestX;
    var dz = z - closestZ;
    return dx * dx + dz * dz < minDist * minDist;
  }

  function getRuinColliderDiagnostics() {
    var count = 0;
    var rotatedCount = 0;
    var rotatedOnlyHits = 0;
    var missedInsideSamples = 0;
    var samplesPerRuin = 0;
    var testRadius = 0.04;
    for (var i = 0; i < obstacleRects.length; i++) {
      var rect = obstacleRects[i];
      if (rect.type !== "poi-large:ruin") continue;
      count += 1;
      if (Math.abs(rect.rotation || 0) > 0.001) rotatedCount += 1;
      var inset = 0.12;
      var samples = [
        { x: rect.halfW - inset, z: rect.halfD - inset },
        { x: -rect.halfW + inset, z: rect.halfD - inset },
        { x: rect.halfW - inset, z: -rect.halfD + inset },
        { x: -rect.halfW + inset, z: -rect.halfD + inset },
      ];
      samplesPerRuin += samples.length;
      for (var j = 0; j < samples.length; j++) {
        var world = rectLocalPointToWorld(rect, samples[j].x, samples[j].z);
        var rotatedHit = circleIntersectsRect(world.x, world.z, testRadius, rect);
        if (!rotatedHit) missedInsideSamples += 1;
        if (rotatedHit && !circleIntersectsUnrotatedRect(world.x, world.z, testRadius, rect)) {
          rotatedOnlyHits += 1;
        }
      }
    }
    return {
      count: count,
      rotatedCount: rotatedCount,
      rotatedOnlyHits: rotatedOnlyHits,
      missedInsideSamples: missedInsideSamples,
      samplesPerRuin: samplesPerRuin,
    };
  }

  function buildBuilding(x, z, w, d, h, label, wallMat, style) {
    style = style || {};
    var g = new THREE.Group();
    g.position.set(x, 0, z);
    worldRoot.add(g);
    addObstacle(x, z + 0.35, w + 1.4, d + 2.25, 0.25, "building:" + label);

    var roofMat = style.roofMat || mats.roof;
    var signMat = style.signMat || mats.sign;
    var roofW = w + (style.roofOverhangW || 0.8);
    var roofD = d + (style.roofOverhangD || 0.9);
    var roofH = style.roofHeight || 0.55;
    var porchDepth = style.porchDepth || 1.1;
    var signScale = style.signScale || 0.72;
    var postCount = style.postCount || 5;

    addBox(g, w + 1.2, 0.25, d + 1.1, mats.darkWood, 0, 0.05, 0);
    addBox(g, w, h, d, wallMat, 0, h / 2, 0);
    addBox(g, roofW, roofH, roofD, roofMat, 0, h + roofH / 2 + 0.04, 0);
    addBox(g, w + 1.8, 0.22, porchDepth, mats.darkWood, 0, 0.6, d / 2 + 0.45 + porchDepth / 2);
    addBox(g, w + 2.1, 0.18, Math.max(0.65, porchDepth * 0.82), mats.darkWood, 0, 1.25, d / 2 + 0.58 + porchDepth / 2);

    for (var i = -1; i <= 1; i += 2) {
      addBox(g, 0.24, 1.65, 0.28, mats.darkWood, i * (w / 2 + 0.2), 1.1, d / 2 + 0.65);
      addBox(g, 1.1, 0.9, 0.08, mats.black, i * 1.8, 2.4, d / 2 + 0.04);
      addBox(g, 0.9, 1.45, 0.08, mats.darkWood, i * 0.95, 0.95, d / 2 + 0.05);
    }

    addBox(g, w * signScale, style.hasFalseFront ? 1.08 : 0.78, 0.16, signMat, 0, h + (style.hasFalseFront ? 1.08 : 0.98), d / 2 + 0.08);
    var letters = label.length;
    for (var l = 0; l < letters; l++) {
      addBox(g, 0.18, 0.28, 0.18, mats.darkWood, (l - letters / 2) * 0.42 + 0.18, h + 1, d / 2 + 0.22);
    }

    for (var p = 0; p < postCount; p++) {
      var postX = postCount === 1 ? 0 : -w / 2 + 0.8 + p * (w - 1.6) / Math.max(1, postCount - 1);
      addBox(g, 0.22, 1.2, 0.22, mats.darkWood, postX, 0.75, d / 2 + 0.65);
    }
    addBuildingStyleDetails(g, w, d, h, label, style);
    return g;
  }

  function addBuildingStyleDetails(g, w, d, h, label, style) {
    if (!style || !style.variant) return;
    if (style.hasFalseFront) {
      addBox(g, w * 0.9, 0.55, 0.18, mats.darkWood, 0, h + 1.45, d / 2 + 0.12);
      addBox(g, w * 0.72, 0.14, 0.2, style.signMat || mats.sign, 0, h + 1.8, d / 2 + 0.18);
    }
    if (style.hasAwning) {
      addBox(g, w * 0.72, 0.16, 0.82, style.signMat || mats.sign, 0, 2.0, d / 2 + 0.82);
      for (var a = -1; a <= 1; a += 2) {
        addBox(g, 0.16, 0.85, 0.16, mats.darkWood, a * w * 0.32, 1.45, d / 2 + 1.18);
      }
    }
    if (style.hasLeanTo) {
      var side = style.side || 1;
      addBox(g, 0.68, h * 0.55, d * 0.58, style.wallMat || mats.wood, side * (w / 2 + 0.32), h * 0.28, -0.1);
      addBox(g, 0.92, 0.28, d * 0.7, style.roofMat || mats.roof, side * (w / 2 + 0.34), h * 0.6, -0.1);
      addBox(g, 0.16, h * 0.52, 0.16, mats.darkWood, side * (w / 2 + 0.7), h * 0.26, d * 0.24);
    }
    if (style.hasChimney) {
      addBox(g, 0.42, 0.9, 0.42, mats.darkWood, -w * 0.28, h + 0.86, -d * 0.2);
      addBox(g, 0.5, 0.16, 0.5, mats.black, -w * 0.28, h + 1.38, -d * 0.2);
    }
    if (style.hasRoofVent) {
      addBox(g, 0.8, 0.24, 0.38, mats.metal, w * 0.23, h + 0.75, d * 0.12);
    }
    if (style.hasCrates) {
      var sideSign = style.side || 1;
      addBox(g, 0.55, 0.48, 0.55, mats.barrel, sideSign * (w / 2 - 0.65), 0.34, d / 2 + 0.95);
      addBox(g, 0.7, 0.34, 0.48, mats.wood, sideSign * (w / 2 - 1.25), 0.28, d / 2 + 0.96);
    }
  }

  function buildStable(x, z) {
    var g = new THREE.Group();
    g.position.set(x, 0, z);
    worldRoot.add(g);
    addObstacle(x, z + 0.25, 9.7, 6.9, 0.35, "stable");

    addBox(g, 8.5, 2.9, 5.2, material(0x775033, 0.88, 0.02), 0, 1.45, 0);
    addBox(g, 9.5, 0.55, 6.2, mats.roof, 0, 3.25, 0);
    addBox(g, 2.2, 2.2, 0.12, mats.black, -2.4, 1.1, 2.65);
    addBox(g, 2.2, 2.2, 0.12, mats.black, 2.4, 1.1, 2.65);
    for (var i = 0; i < 6; i++) {
      addBox(g, 0.18, 2.7, 0.18, mats.darkWood, -4.1 + i * 1.65, 1.35, 2.85);
    }
    addBox(g, 7.8, 0.16, 0.18, mats.darkWood, 0, 2.35, 2.88);
  }

  function tryBuildStable(x, z) {
    if (!canPlaceLargeMapObject(x, z + 0.25, 9.7, 6.9, 0.35)) return false;
    buildStable(x, z);
    return true;
  }

  function tryBuildWaterTower(x, z) {
    if (!canPlaceLargeMapObject(x, z, 3.25, 3.25, 0.5)) return false;
    buildWaterTower(x, z);
    return true;
  }

  function buildWaterTower(x, z) {
    var g = new THREE.Group();
    g.position.set(x, 0, z);
    worldRoot.add(g);
    addObstacle(x, z, 3.25, 3.25, 0.4, "water-tower");
    for (var i = 0; i < 4; i++) {
      var sx = i < 2 ? -1.05 : 1.05;
      var sz = i % 2 === 0 ? -1.05 : 1.05;
      addBox(g, 0.18, 4.4, 0.18, mats.darkWood, sx, 2.2, sz);
    }
    addBox(g, 2.9, 0.24, 2.9, mats.darkWood, 0, 4.45, 0);
    addBox(g, 2.4, 2.1, 2.4, material(0x65412a, 0.8, 0.02), 0, 5.55, 0);
    addBox(g, 2.7, 0.36, 2.7, mats.roof, 0, 6.8, 0);
    addBox(g, 0.14, 3.9, 0.14, mats.darkWood, -0.6, 2.8, -0.6).rotation.z = -0.45;
    addBox(g, 0.14, 3.9, 0.14, mats.darkWood, 0.6, 2.8, -0.6).rotation.z = 0.45;
  }

  function tryBuildGraveyard(x, z) {
    if (!canPlaceLargeMapObject(x, z + 0.1, 4.95, 4.25, 0.42)) return false;
    buildGraveyard(x, z);
    return true;
  }

  function buildGraveyard(x, z) {
    var g = new THREE.Group();
    g.position.set(x, 0, z);
    worldRoot.add(g);
    addObstacle(x, z + 0.1, 4.95, 4.25, 0.25, "graveyard");
    for (var i = 0; i < 6; i++) {
      var gx = (i % 3) * 1.2 - 1.2;
      var gz = Math.floor(i / 3) * 1.25 - 0.6;
      addBox(g, 0.5, 0.75, 0.18, mats.rock, gx, 0.42, gz);
      addBox(g, 0.76, 0.08, 0.24, mats.rock, gx, 0.82, gz);
    }
    addBox(g, 4.6, 0.16, 0.18, mats.darkWood, 0, 0.45, -1.75);
    addBox(g, 4.6, 0.16, 0.18, mats.darkWood, 0, 0.45, 2.0);
  }

  function addFenceSegment(x, z, vertical, type) {
    var g = new THREE.Group();
    g.position.set(x, 0, z);
    worldRoot.add(g);
    if (vertical) g.rotation.y = Math.PI / 2;
    registerMapFootprint(type || "fence", x, z, vertical ? 0.48 : 2.45, vertical ? 2.45 : 0.48, 0.04, false);
    addBox(g, 0.18, 1.1, 0.18, mats.darkWood, -1.05, 0.55, 0);
    addBox(g, 0.18, 1.1, 0.18, mats.darkWood, 1.05, 0.55, 0);
    addBox(g, 2.35, 0.16, 0.16, mats.wood, 0, 0.45, 0);
    addBox(g, 2.35, 0.16, 0.16, mats.wood, 0, 0.86, 0);
  }

  function addFenceSegmentIfOpen(x, z, vertical) {
    var w = vertical ? 0.48 : 2.45;
    var d = vertical ? 2.45 : 0.48;
    if (mapAreaHitsFootprints(x, z, w, d, 0.1)) return false;
    addFenceSegment(x, z, vertical);
    return true;
  }

  function addMicroFenceSegmentIfOpen(x, z, vertical, cx, zc) {
    var w = vertical ? 0.48 : 2.45;
    var d = vertical ? 2.45 : 0.48;
    if (Math.hypot(x - cx, z - zc) < 8.2) return false;
    if (!mapAreaWithinBounds(x, z, w, d, 0.35)) return false;
    if (mapAreaTouchesMainTownMicroBuffer(x, z, w, d, 0.35, MAIN_TOWN_MICRO_BUFFER + 2.5)) return false;
    if (mapAreaHitsFootprints(x, z, w, d, 0.3)) return false;
    if (mapAreaHitsFootprintType(x, z, w, d, MICRO_FENCE_ROAD_CLEARANCE + 0.35, ["road-clear", "micro-road-clear"])) return false;
    addFenceSegment(x, z, vertical, "micro-fence");
    return true;
  }

  function addGatePosts() {
    [
      [-5.25, -CITY_D / 2 - 0.7], [5.25, -CITY_D / 2 - 0.7],
      [-5.25, CITY_D / 2 + 0.7], [5.25, CITY_D / 2 + 0.7],
      [-CITY_W / 2 - 0.9, -3.95], [-CITY_W / 2 - 0.9, 3.95],
      [CITY_W / 2 + 0.9, -3.95], [CITY_W / 2 + 0.9, 3.95],
    ].forEach(function (p) {
      var x = townLocalX(p[0]);
      var z = townLocalZ(p[1]);
      registerMapFootprint("gate-post", x, z, 0.62, 0.62, 0.08, false);
      addBox(worldRoot, 0.28, 1.45, 0.28, mats.darkWood, x, 0.72, z);
      addBox(worldRoot, 0.52, 0.14, 0.52, mats.sign, x, 1.52, z);
    });
  }

  function buildCactus(x, z, scale) {
    var g = new THREE.Group();
    g.position.set(x, 0, z);
    worldRoot.add(g);
    addObstacle(x, z, 0.92 * scale, 0.92 * scale, 0.22, "cactus");
    addBox(g, 0.62 * scale, 2.7 * scale, 0.62 * scale, mats.cactus, 0, 1.35 * scale, 0);
    addBox(g, 0.46 * scale, 1.25 * scale, 0.46 * scale, mats.cactus, -0.72 * scale, 1.65 * scale, 0);
    addBox(g, 0.46 * scale, 1.05 * scale, 0.46 * scale, mats.cactus, 0.72 * scale, 1.35 * scale, 0);
    addBox(g, 0.92 * scale, 0.42 * scale, 0.42 * scale, mats.cactus, -0.48 * scale, 1.18 * scale, 0);
    addBox(g, 0.82 * scale, 0.42 * scale, 0.42 * scale, mats.cactus, 0.48 * scale, 1.0 * scale, 0);
    addBox(g, 0.18 * scale, 0.2 * scale, 0.18 * scale, mats.cactusDark, 0, 2.82 * scale, 0);
  }

  function buildBarrel(x, z) {
    var g = new THREE.Group();
    g.position.set(x, 0, z);
    worldRoot.add(g);
    addObstacle(x, z, 1.05, 1.05, 0.14, "barrel");
    addBox(g, 0.86, 1.1, 0.86, mats.barrel, 0, 0.55, 0);
    addBox(g, 0.96, 0.14, 0.96, mats.metal, 0, 0.22, 0);
    addBox(g, 0.96, 0.14, 0.96, mats.metal, 0, 0.88, 0);
    addBox(g, 0.14, 1.06, 0.94, mats.darkWood, 0.31, 0.55, 0);
    addBox(g, 0.14, 1.06, 0.94, mats.darkWood, -0.31, 0.55, 0);
  }

  function buildRock(x, z, scale) {
    var g = new THREE.Group();
    g.position.set(x, 0, z);
    worldRoot.add(g);
    registerMapFootprint("rock", x, z, 1.25 * scale, 1.05 * scale, 0.08, false);
    addBox(g, 0.9 * scale, 0.45 * scale, 0.7 * scale, mats.rock, 0, 0.2 * scale, 0).rotation.y = mapRand(0, Math.PI);
    addBox(g, 0.45 * scale, 0.35 * scale, 0.5 * scale, mats.rock, 0.35 * scale, 0.45 * scale, 0.12 * scale).rotation.y = mapRand(0, Math.PI);
  }

  function resetRun(mode) {
    camera.zoom = 1;
    camera.updateProjectionMatrix();
    releaseAllEnemiesToPool();
    releaseAllFirePatches();
    releaseAllRifleTraps();
    releaseAllMarshalHallowedGrounds();
    releaseAllPaleDeputies();
    releaseAllPaleDeputyTracersToPool();
    releaseAllParticlesToPool();
    releaseAllXpOrbsToPool();
    releaseAllDeathDebrisToPool();
    releaseAllCoachGunTracersToPool();
    releaseAllProjectilesToPool();
    resetLauncherExplosionAudioMixer();
    resetLauncherCascadeWarmup();
    resetLauncherShrapnelResourceWarmup();
    clearDynamic();
    ammoCratePointer = null;
    mobileAimTarget.active = false;
    mobileAimTarget.marker = null;
    state.mode = mode || "playing";
    state.paused = false;
    state.controlLayoutEditing = false;
    state.time = 0;
    state.wave = 1;
    state.score = 0;
    state.kills = 0;
    state.shotsFired = 0;
    state.spawnLeft = 0;
    state.waveSpawnTarget = 0;
    state.waveElapsed = 0;
    state.waveLowRemainingTimer = 0;
    state.spawnTimer = 0;
    state.spawnInterval = 1;
    state.nextWaveTimer = 0;
    state.shake = 0;
    state.enemies = [];
    state.bullets = [];
    state.coachGunTracers = [];
    state.particles = [];
    state.flashes = [];
    state.shockwaves = [];
    state.lightningBolts = [];
    state.decals = [];
    state.lightFlashes = [];
    state.smokePuffs = [];
    state.ambientDust = [];
    state.debris = [];
    state.acidProjectiles = [];
    state.acidPuddles = [];
    state.firePatches = [];
    state.delayedExplosions = [];
    state.xpOrbs = [];
    state.rifleTraps = [];
    state.marshalHallowedGrounds = [];
    state.paleDeputies = [];
    state.paleDeputyTracers = [];
    state.level = 1;
    state.xp = 0;
    state.xpToNext = getXpToNextLevel(state.level);
    state.totalXp = 0;
    state.levelUps = 0;
    state.playerClass = null;
    state.classChoicePending = false;
    state.classChoiceOffered = false;
    state.revolverUpgrade = null;
    state.revolverUpgradePending = false;
    state.revolverUpgradeOffered = false;
    state.rifleUpgrade = null;
    state.rifleUpgradePending = false;
    state.rifleUpgradeOffered = false;
    state.launcherUpgrade = null;
    state.launcherUpgradePending = false;
    state.launcherUpgradeOffered = false;
    state.marshalUpgrade = null;
    state.marshalUpgradePending = false;
    state.marshalUpgradeOffered = false;
    state.standardUpgradePending = false;
    state.standardUpgradeLevel = 0;
    state.standardUpgradeChoices = [];
    state.pendingStandardUpgradeLevels = [];
    state.standardUpgradesChosen = 0;
    state.upgradeCounts = {};
    state.moveSpeedBonus = 0;
    state.globalDamageBonus = 0;
    state.reloadSpeedBonus = 0;
    state.fireRateBonus = 0;
    state.ammoPickupBonus = 0;
    state.maxHpBonus = 0;
    state.hpRegen = 0;
    state.xpPickupRadiusBonus = 0;
    state.xpGainBonus = 0;
    state.attackRangeBonus = 0;
    state.fanTheHammerTimer = 0;
    state.duelistFocus = 0;
    state.bigIronShotsFired = 0;
    state.bigIronRuptures = 0;
    state.silverBulletAmmoKills = 0;
    state.leadBloomShots = 0;
    state.dualShotSide = -1;
    state.lastDualShotSide = 0;
    state.dualActiveHand = "right";
    state.dualLastShotHand = "";
    state.dualHandAmmo = { right: 0, left: 0 };
    state.dualHandReloadTimers = { right: 0, left: 0 };
    state.dualHandFreeReloads = { right: 0, left: 0 };
    state.dualFreeReloadsEarned = 0;
    state.rifleMagazineMultiplier = 1;
    state.launcherMagazineMultiplier = 1;
    state.rifleShotsFired = 0;
    state.rifleKillReloadCounter = 0;
    state.rifleLightningStrikes = 0;
    state.rifleStormTempoTimer = 0;
    state.rifleAutoTrapTimer = 0;
    state.rifleAutoTrapFrequency = 0;
    state.rifleTrapTriggers = 0;
    state.rifleTrapAmmoRestored = 0;
    state.rifleTrapBonusXp = 0;
    state.launcherShotsFired = 0;
    state.launcherChainDetonations = 0;
    state.launcherBomblets = 0;
    state.launcherShrapnelShots = 0;
    state.launcherPowderEchoes = 0;
    state.launcherAmmoRefills = 0;
    state.launcherMadmanStacks = 0;
    state.launcherMadmanTriggers = 0;
    state.launcherFireKills = 0;
    state.launcherFireBonusXp = 0;
    state.launcherBackdrafts = 0;
    state.launcherThermitePatches = 0;
    state.launcherFreeShots = 0;
    state.launcherCrossfireShards = 0;
    state.launcherFireBuffActive = false;
    state.launcherFireAmmoAccumulator = 0;
    state.launcherExplosionSpreadSamples = [];
    state.marshalShotSequence = 0;
    state.marshalLastShotTime = -99;
    state.marshalDoubleTapReadyUntil = 0;
    state.marshalRecoilSpeedTimer = 0;
    state.marshalShellCatcherKills = 0;
    state.marshalCloseKills = 0;
    state.marshalGraveTitheKills = 0;
    state.marshalBountyTimer = 12;
    state.marshalBountyEnemy = null;
    state.marshalBountiesMarked = 0;
    state.marshalBountiesClaimed = 0;
    state.marshalMarksApplied = 0;
    state.marshalMarksPassed = 0;
    state.marshalFearBursts = 0;
    state.marshalGeneratedShells = 0;
    state.marshalPaleDeputiesRaised = 0;
    state.marshalPaleDeputySpawnBlocked = 0;
    state.marshalPaleDeputyShots = 0;
    state.marshalPaleDeputyKills = 0;
    state.marshalPaleDeputyRepositions = 0;
    state.marshalPaleDeputyTracers = 0;
    state.marshalAcidCleansed = 0;
    state.marshalPurifyReloadTimer = 0;
    state.marshalHallowedGroundsCreated = 0;
    state.marshalLastVolley = null;
    state.revolverDamageMultiplier = 1;
    state.revolverMagazineBonus = 0;
    state.revolverAmmoPickupBonus = 0;
    state.rifleAmmoPickupBonus = 0;
    state.ammoCrates = [];
    state.ammoCrateTimer = state.mode === "playing" ? rand(7, 11) : 0;
    state.zombieTeleports = 0;
    state.waveSuspended = false;
    state.weapon = "revolver";
    state.ownedWeapons = { revolver: true, rifle: false, launcher: false, coachGun: false };
    initAmmoState();
    resetAmmoVisualState();
    pointerDown = false;
    resetTouchControls();

    state.player = {
      x: PLAYER_START.x,
      z: PLAYER_START.z,
      radius: 0.72,
      hp: BASE_PLAYER_HP,
      maxHp: BASE_PLAYER_HP,
      speed: BASE_PLAYER_SPEED,
      cooldown: 0,
      invuln: 0,
      aimAngle: 0,
      weapon: "revolver",
      moveAmount: 0,
      walkPhase: 0,
      shootKick: 0,
      group: createCowboy(),
    };
    state.pointerWorld = { x: PLAYER_START.x, z: PLAYER_START.z + 4 };
    pointerHit.set(state.pointerWorld.x, 0, state.pointerWorld.z);
    pointerInput.hasPointer = false;
    pointerInput.followOffsetX = 0;
    pointerInput.followOffsetZ = 4;
    state.player.group.position.set(state.player.x, 0, state.player.z);
    dynamicRoot.add(state.player.group);
    if (state.mode === "playing") ensureAmmoCratePointer();
    if (state.mode === "menu") {
      setupMenuShowcase();
      setWeaponMeshes(state.player.group, "rifle");
    } else {
      setWeaponVisual("revolver");
    }
    createAmbientDust();

    if (state.mode === "playing") startWave(1);
    setPanel(menu, state.mode === "menu");
    setPanel(gameOverPanel, false);
    setPanel(classChoicePanel, false);
    setPanel(revolverUpgradePanel, false);
    setPanel(rifleUpgradePanel, false);
    setPanel(launcherUpgradePanel, false);
    setPanel(levelUpPanel, false);
    finishControlLayoutEdit(false);
    showPauseMenuView("main");
    syncPauseMenuUi();
    syncMusicForMode();
    updateHud();
  }

  function setupMenuShowcase() {
    menuState.time = 0;
    menuState.pointerX = 0;
    menuState.pointerY = 0;
    state.player.x = PLAYER_START.x;
    state.player.z = PLAYER_START.z;
    state.player.group.position.set(state.player.x, 0, state.player.z);
    state.player.group.visible = false;
    state.pointerWorld.x = state.player.x + 3.5;
    state.pointerWorld.z = state.player.z + 2.5;
    pointerHit.set(state.pointerWorld.x, 0, state.pointerWorld.z);
    if (menuState.cowboy) {
      menuState.cowboy.group.visible = true;
      menuState.cowboy.group.position.set(menuState.cowboy.x, 0, menuState.cowboy.z);
      menuState.cowboy.group.scale.setScalar(menuState.cowboy.baseScale || 1.18);
      menuState.cowboy.walkPhase = 0.8;
      menuState.cowboy.moveAmount = 0.44;
      menuState.cowboy.shootKick = 0.18;
    }
    menuState.zombies.forEach(function (enemy, index) {
      enemy.group.visible = true;
      enemy.group.position.set(enemy.x, 0, enemy.z);
      enemy.group.scale.setScalar(enemy.menuScale || 1);
      enemy.walkPhase = 0.6 + index * 0.9;
      enemy.moveAmount = enemy.type === "runner" ? 0.92 : 0.74;
      enemy.spitPulse = 0;
    });
    if (menuState.crate) {
      menuState.crate.age = 0;
      menuState.crate.group.visible = true;
      menuState.crate.group.scale.setScalar(0.9);
    }
  }

  function isIntroActive() {
    return !!introActive;
  }

  function setIntroActive(active) {
    introActive = !!active;
    if (introScreen) {
      introScreen.classList.toggle("is-visible", introActive);
      introScreen.setAttribute("aria-hidden", introActive ? "false" : "true");
      introScreen.tabIndex = introActive ? 0 : -1;
    }
    updateModeClass();
  }

  function dismissIntroScreen(event) {
    if (!isIntroActive()) return false;
    if (event) {
      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();
    }
    setIntroActive(false);
    unlockAudioFromGesture(true);
    if (isRifleListenSceneRequested() && state.mode === "menu") startGame();
    return true;
  }

  function readStoredAudioEnabled() {
    try {
      if (!window.localStorage) return true;
      return window.localStorage.getItem(MENU_MUSIC_STORAGE_KEY) !== "muted";
    } catch (err) {
      return true;
    }
  }

  function storeAudioEnabled(enabled) {
    try {
      if (window.localStorage) window.localStorage.setItem(MENU_MUSIC_STORAGE_KEY, enabled ? "enabled" : "muted");
    } catch (err) {}
  }

  function readStoredAudioVolume(kind, fallback) {
    try {
      if (!window.localStorage) return fallback;
      var raw = window.localStorage.getItem(AUDIO_VOLUME_STORAGE_PREFIX + kind);
      if (raw == null || raw === "") return fallback;
      var stored = Number(raw);
      return Number.isFinite(stored) ? clamp(stored, 0, 2) : fallback;
    } catch (err) {
      return fallback;
    }
  }

  function storeAudioVolume(kind, volume) {
    try {
      if (window.localStorage) window.localStorage.setItem(AUDIO_VOLUME_STORAGE_PREFIX + kind, String(clamp(volume, 0, 2)));
    } catch (err) {}
  }

  function applyAudioVolumes() {
    if (audioState.musicGain) audioState.musicGain.gain.value = clamp(audioState.musicVolume, 0, 2);
    if (audioState.sfxGain) audioState.sfxGain.gain.value = clamp(audioState.sfxVolume, 0, 2);
  }

  function setAudioVolume(kind, percent) {
    var value = clamp((Number(percent) || 0) / 100, 0, 2);
    if (kind === "music") {
      audioState.musicVolume = value;
    } else if (kind === "sfx") {
      audioState.sfxVolume = value;
    } else {
      return;
    }
    storeAudioVolume(kind, value);
    applyAudioVolumes();
    updatePauseVolumeControls();
  }

  function getAudioVolumePercent(kind) {
    var value = kind === "sfx" ? audioState.sfxVolume : audioState.musicVolume;
    return Math.round(clamp(value == null ? 1 : value, 0, 2) * 100);
  }

  function updatePauseVolumeControls() {
    var musicPercent = getAudioVolumePercent("music");
    var sfxPercent = getAudioVolumePercent("sfx");
    if (musicVolumeInput && musicVolumeInput.value !== String(musicPercent)) musicVolumeInput.value = String(musicPercent);
    if (sfxVolumeInput && sfxVolumeInput.value !== String(sfxPercent)) sfxVolumeInput.value = String(sfxPercent);
    if (musicVolumeValue) musicVolumeValue.textContent = musicPercent + "%";
    if (sfxVolumeValue) sfxVolumeValue.textContent = sfxPercent + "%";
  }

  function normalizeControlPoint(point) {
    if (!point) return null;
    var x = Number(point.x);
    var y = Number(point.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return {
      x: clamp(x, 0, 100),
      y: clamp(y, 0, 100),
    };
  }

  function normalizeControlLayout(layout) {
    if (!layout) return null;
    var move = normalizeControlPoint(layout.move);
    var fire = normalizeControlPoint(layout.fire);
    if (!move || !fire) return null;
    return { move: move, fire: fire };
  }

  function cloneControlLayout(layout) {
    var normalized = normalizeControlLayout(layout);
    return normalized ? { move: { x: normalized.move.x, y: normalized.move.y }, fire: { x: normalized.fire.x, y: normalized.fire.y } } : null;
  }

  function readStoredControlLayout() {
    try {
      if (!window.localStorage) return null;
      return normalizeControlLayout(JSON.parse(window.localStorage.getItem(CONTROL_LAYOUT_STORAGE_KEY) || "null"));
    } catch (err) {
      return null;
    }
  }

  function storeControlLayout(layout) {
    try {
      if (window.localStorage) window.localStorage.setItem(CONTROL_LAYOUT_STORAGE_KEY, JSON.stringify(normalizeControlLayout(layout)));
    } catch (err) {}
  }

  function clearStoredControlLayout() {
    try {
      if (window.localStorage) window.localStorage.removeItem(CONTROL_LAYOUT_STORAGE_KEY);
    } catch (err) {}
  }

  function getCssNumber(style, name, fallback) {
    var value = style ? parseFloat(style.getPropertyValue(name)) : NaN;
    return Number.isFinite(value) ? value : fallback;
  }

  function getDefaultControlLayout() {
    var width = Math.max(1, window.innerWidth || 1);
    var height = Math.max(1, window.innerHeight || 1);
    var style = window.getComputedStyle ? window.getComputedStyle(mobileControls || root) : null;
    var slop = getCssNumber(style, "--mobile-control-hit-slop", 10);
    var moveVisual = getCssNumber(style, "--move-stick-visual-size", 122);
    var fireVisual = getCssNumber(style, "--mobile-fire-visual-size", 92);
    var moveSize = moveVisual + slop * 2;
    var fireSize = fireVisual + slop * 2;
    var sideLeft = Math.max(18 - slop, 0);
    var sideRight = Math.max(22 - slop, 0);
    var bottom = Math.max(22 - slop, 0);
    return {
      move: {
        x: clamp(((sideLeft + moveSize / 2) / width) * 100, 0, 100),
        y: clamp(((height - bottom - moveSize / 2) / height) * 100, 0, 100),
      },
      fire: {
        x: clamp(((width - sideRight - fireSize / 2) / width) * 100, 0, 100),
        y: clamp(((height - bottom - fireSize / 2) / height) * 100, 0, 100),
      },
    };
  }

  function setControlLayoutVars(layout) {
    var normalized = normalizeControlLayout(layout);
    if (!normalized) {
      root.style.removeProperty("--move-stick-left");
      root.style.removeProperty("--move-stick-top");
      root.style.removeProperty("--mobile-fire-left");
      root.style.removeProperty("--mobile-fire-top");
      return;
    }
    root.style.setProperty("--move-stick-left", normalized.move.x.toFixed(3) + "%");
    root.style.setProperty("--move-stick-top", normalized.move.y.toFixed(3) + "%");
    root.style.setProperty("--mobile-fire-left", normalized.fire.x.toFixed(3) + "%");
    root.style.setProperty("--mobile-fire-top", normalized.fire.y.toFixed(3) + "%");
  }

  function applySavedControlLayout() {
    setControlLayoutVars(controlLayoutState.saved);
    root.classList.toggle("has-custom-controls", !!controlLayoutState.saved);
  }

  function updateControlLayoutEditorUi() {
    var visible = !!controlLayoutState.editing;
    state.controlLayoutEditing = visible;
    if (controlLayoutEditor) {
      controlLayoutEditor.classList.toggle("is-visible", visible);
      controlLayoutEditor.setAttribute("aria-hidden", visible ? "false" : "true");
    }
    updateModeClass();
  }

  function beginControlLayoutEdit() {
    if (!canOpenPauseMenu()) return;
    clearActiveInput();
    state.paused = true;
    controlLayoutState.editing = true;
    controlLayoutState.drag = null;
    controlLayoutState.draft = cloneControlLayout(controlLayoutState.saved) || getDefaultControlLayout();
    controlLayoutState.draftIsDefault = !controlLayoutState.saved;
    setControlLayoutVars(controlLayoutState.draft);
    syncPauseMenuUi();
    updateControlLayoutEditorUi();
  }

  function finishControlLayoutEdit(apply) {
    if (!controlLayoutState.editing && !state.controlLayoutEditing) {
      applySavedControlLayout();
      return;
    }
    endControlLayoutDrag();
    if (apply) {
      if (controlLayoutState.draftIsDefault) {
        controlLayoutState.saved = null;
        clearStoredControlLayout();
      } else {
        controlLayoutState.saved = cloneControlLayout(controlLayoutState.draft);
        storeControlLayout(controlLayoutState.saved);
      }
    }
    controlLayoutState.editing = false;
    controlLayoutState.draft = null;
    controlLayoutState.draftIsDefault = false;
    applySavedControlLayout();
    showPauseMenuView("settings");
    updateControlLayoutEditorUi();
  }

  function resetControlLayoutDraft() {
    controlLayoutState.draft = getDefaultControlLayout();
    controlLayoutState.draftIsDefault = true;
    setControlLayoutVars(controlLayoutState.draft);
  }

  function getControlLayoutElement(kind) {
    return kind === "fire" ? mobileFire : moveStick;
  }

  function beginControlLayoutDrag(event, kind) {
    if (!controlLayoutState.editing) return false;
    var el = getControlLayoutElement(kind);
    if (!el) return false;
    event.preventDefault();
    event.stopPropagation();
    var rect = el.getBoundingClientRect();
    controlLayoutState.drag = {
      kind: kind,
      pointerId: event.pointerId,
      offsetX: event.clientX - (rect.left + rect.width / 2),
      offsetY: event.clientY - (rect.top + rect.height / 2),
      width: rect.width,
      height: rect.height,
    };
    el.classList.add("is-layout-dragging");
    try {
      el.setPointerCapture(event.pointerId);
    } catch (err) {}
    updateControlLayoutDrag(event.clientX, event.clientY);
    return true;
  }

  function updateControlLayoutDrag(clientX, clientY) {
    var drag = controlLayoutState.drag;
    if (!drag || !controlLayoutState.draft) return;
    var width = Math.max(1, window.innerWidth || 1);
    var height = Math.max(1, window.innerHeight || 1);
    var centerX = clientX - drag.offsetX;
    var centerY = clientY - drag.offsetY;
    centerX = clamp(centerX, drag.width / 2, width - drag.width / 2);
    centerY = clamp(centerY, drag.height / 2, height - drag.height / 2);
    var point = {
      x: (centerX / width) * 100,
      y: (centerY / height) * 100,
    };
    if (drag.kind === "fire") {
      controlLayoutState.draft.fire = point;
    } else {
      controlLayoutState.draft.move = point;
    }
    controlLayoutState.draftIsDefault = false;
    setControlLayoutVars(controlLayoutState.draft);
  }

  function handleControlLayoutDragMove(event) {
    var drag = controlLayoutState.drag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    event.preventDefault();
    updateControlLayoutDrag(event.clientX, event.clientY);
  }

  function endControlLayoutDrag(event) {
    var drag = controlLayoutState.drag;
    if (!drag || (event && event.pointerId !== drag.pointerId)) return;
    var el = getControlLayoutElement(drag.kind);
    if (el) el.classList.remove("is-layout-dragging");
    controlLayoutState.drag = null;
  }

  function getAudioContextConstructor() {
    return window.AudioContext || window.webkitAudioContext || null;
  }

  function ensureAudioContext() {
    if (audioState.ctx) return audioState.ctx;
    var AudioContextCtor = getAudioContextConstructor();
    if (!AudioContextCtor) {
      updateMenuMusicButton();
      return null;
    }

    try {
      var ctx = new AudioContextCtor();
      audioState.ctx = ctx;
      audioState.masterGain = ctx.createGain();
      audioState.musicGain = ctx.createGain();
      audioState.sfxGain = ctx.createGain();
      audioState.sfxLimiter = ctx.createDynamicsCompressor();
      audioState.menuGain = ctx.createGain();
      audioState.gameGain = ctx.createGain();
      audioState.gameExploreGain = ctx.createGain();
      audioState.gameBattleGain = ctx.createGain();
      audioState.masterGain.gain.value = 1;
      audioState.musicGain.gain.value = clamp(audioState.musicVolume, 0, 2);
      audioState.sfxGain.gain.value = clamp(audioState.sfxVolume, 0, 2);
      audioState.sfxLimiter.threshold.value = -5;
      audioState.sfxLimiter.knee.value = 10;
      audioState.sfxLimiter.ratio.value = 9;
      audioState.sfxLimiter.attack.value = 0.002;
      audioState.sfxLimiter.release.value = 0.16;
      audioState.menuGain.gain.value = 0;
      audioState.gameGain.gain.value = 0;
      audioState.gameExploreGain.gain.value = 1;
      audioState.gameBattleGain.gain.value = 0;
      audioState.menuGain.connect(audioState.musicGain);
      audioState.gameExploreGain.connect(audioState.gameGain);
      audioState.gameBattleGain.connect(audioState.gameGain);
      audioState.gameGain.connect(audioState.musicGain);
      audioState.musicGain.connect(audioState.masterGain);
      audioState.sfxGain.connect(audioState.sfxLimiter);
      audioState.sfxLimiter.connect(audioState.masterGain);
      audioState.masterGain.connect(ctx.destination);
      audioState.noiseBuffer = createMenuNoiseBuffer(ctx);
      audioState.shotNoiseBuffer = createGunshotNoiseBuffer(ctx);
      audioState.rifleShotBuffer = createDryRifleShotBuffer(ctx);
      return ctx;
    } catch (err) {
      audioState.ctx = null;
      updateMenuMusicButton();
      return null;
    }
  }

  function createMenuNoiseBuffer(ctx) {
    var length = Math.max(1, Math.floor(ctx.sampleRate * 2));
    var buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    var data = buffer.getChannelData(0);
    var last = 0;
    for (var i = 0; i < length; i++) {
      last = last * 0.96 + (Math.random() * 2 - 1) * 0.04;
      data[i] = last;
    }
    return buffer;
  }

  function createGunshotNoiseBuffer(ctx) {
    var length = Math.max(1, Math.floor(ctx.sampleRate * 1.2));
    var buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    var data = buffer.getChannelData(0);
    var low = 0;
    var mid = 0;
    for (var i = 0; i < length; i++) {
      var white = Math.random() * 2 - 1;
      low = low * 0.82 + white * 0.18;
      mid = mid * 0.36 + white * 0.64;
      data[i] = white * 0.62 + mid * 0.28 + low * 0.1;
    }
    return buffer;
  }

  function createDryRifleShotBuffer(ctx) {
    var length = Math.max(1, Math.floor(ctx.sampleRate * 0.12));
    var buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    var data = buffer.getChannelData(0);
    var last = 0;
    for (var i = 0; i < length; i++) {
      var t = i / ctx.sampleRate;
      var envelope = Math.exp(-t * 92);
      var snapEnvelope = Math.exp(-t * 520);
      var white = Math.random() * 2 - 1;
      var dry = white - last * 0.86;
      last = white;
      data[i] = clamp(dry * envelope * 0.72 + white * snapEnvelope * 0.38, -1, 1);
    }
    return buffer;
  }

  function unlockAudioFromGesture(startMenuAfterUnlock) {
    var ctx = ensureAudioContext();
    if (!ctx) return;

    var finish = function () {
      audioState.unlocked = ctx.state !== "suspended";
      if (startMenuAfterUnlock || audioState.menu.desired || audioState.game.desired) syncMusicForMode();
      if (audioState.unlocked) warmupLauncherExplosionAudioGraph();
      updateMenuMusicButton();
    };

    if (ctx.state === "suspended" && typeof ctx.resume === "function") {
      var resumeResult = ctx.resume();
      if (resumeResult && typeof resumeResult.then === "function") {
        resumeResult.then(finish).catch(function () {
          updateMenuMusicButton();
        });
      } else {
        finish();
      }
    } else {
      finish();
    }
  }

  function handleMenuMusicButtonClick(event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    if (audioState.enabled) {
      audioState.enabled = false;
      storeAudioEnabled(false);
      stopAllLauncherGrenadeWhistles(0.08);
      stopMenuMusic(0.45);
      stopGameMusic(0.45);
      updateMenuMusicButton();
      return;
    }

    audioState.enabled = true;
    audioState.menu.desired = state.mode === "menu";
    storeAudioEnabled(true);
    unlockAudioFromGesture(true);
    if (audioState.ctx && audioState.ctx.state === "running") syncMusicForMode();
    updateMenuMusicButton();
  }

  function handleDefaultMenuMusicGesture(event) {
    if (isIntroActive()) return;
    if (!audioState.enabled || audioState.menu.active || state.mode !== "menu") return;
    if (event && (event.code === "Enter" || event.code === "Space")) return;
    var target = event && event.target;
    if (target && target.closest && target.closest("#start-btn,#restart-btn,#menu-music-btn")) return;
    unlockAudioFromGesture(true);
  }

  function syncMusicForMode() {
    syncMenuMusicForMode();
    syncGameMusicForMode();
  }

  function syncMenuMusicForMode() {
    audioState.menu.desired = state.mode === "menu";
    if (!audioState.enabled || state.mode !== "menu") {
      stopMenuMusic(0.72);
      updateMenuMusicButton();
      return;
    }
    if (audioState.ctx && audioState.ctx.state !== "suspended") startMenuMusic();
    updateMenuMusicButton();
  }

  function syncGameMusicForMode() {
    audioState.game.desired = isGameplayMusicMode();
    if (!audioState.enabled || !isGameplayMusicMode()) {
      stopGameMusic(0.72);
      return;
    }
    if (audioState.ctx && audioState.ctx.state !== "suspended") startGameMusic();
  }

  function startMenuMusic() {
    if (!audioState.enabled || state.mode !== "menu") return;
    var ctx = ensureAudioContext();
    if (!ctx || ctx.state === "suspended") {
      updateMenuMusicButton();
      return;
    }

    audioState.unlocked = true;
    var now = ctx.currentTime;
    audioState.menuGain.gain.cancelScheduledValues(now);
    audioState.menuGain.gain.setValueAtTime(Math.max(0.0001, audioState.menuGain.gain.value || 0.0001), now);
    audioState.menuGain.gain.linearRampToValueAtTime(MENU_MUSIC_VOLUME, now + 1.2);

    if (audioState.menu.active) {
      updateMenuMusicButton();
      return;
    }

    audioState.menu.active = true;
    audioState.menu.step = 0;
    audioState.menu.nextStepTime = now + 0.06;
    startMenuMusicBed(now);
    scheduleMenuMusic();
    audioState.menu.scheduler = window.setInterval(scheduleMenuMusic, 80);
    updateMenuMusicButton();
  }

  function stopMenuMusic(fadeSeconds) {
    var ctx = audioState.ctx;
    if (!ctx) {
      audioState.menu.active = false;
      updateMenuMusicButton();
      return;
    }

    var fade = Math.max(0.05, fadeSeconds == null ? 0.5 : fadeSeconds);
    var now = ctx.currentTime;
    if (audioState.menu.scheduler) {
      window.clearInterval(audioState.menu.scheduler);
      audioState.menu.scheduler = null;
    }
    if (audioState.menuGain) {
      audioState.menuGain.gain.cancelScheduledValues(now);
      audioState.menuGain.gain.setValueAtTime(Math.max(0.0001, audioState.menuGain.gain.value || 0.0001), now);
      audioState.menuGain.gain.linearRampToValueAtTime(0.0001, now + fade);
    }
    audioState.menu.active = false;
    stopMenuMusicNodes(now + fade + 0.12);
    updateMenuMusicButton();
  }

  function isGameplayMusicMode() {
    return state.mode === "playing" || state.mode === "class-choice" || state.mode === "revolver-upgrade" || state.mode === "rifle-upgrade" || state.mode === "launcher-upgrade" || state.mode === "marshal-upgrade" || state.mode === "level-up";
  }

  function startGameMusic() {
    if (!audioState.enabled || !isGameplayMusicMode()) return;
    var ctx = ensureAudioContext();
    if (!ctx || ctx.state === "suspended") return;

    audioState.unlocked = true;
    var now = ctx.currentTime;
    audioState.gameGain.gain.cancelScheduledValues(now);
    audioState.gameGain.gain.setValueAtTime(Math.max(0.0001, audioState.gameGain.gain.value || 0.0001), now);
    audioState.gameGain.gain.linearRampToValueAtTime(GAME_MUSIC_VOLUME, now + 1.35);

    if (audioState.game.active) return;
    audioState.game.active = true;
    audioState.game.step = 0;
    audioState.game.nextStepTime = now + 0.06;
    audioState.game.battleAmount = 0;
    audioState.game.battleTarget = 0;
    audioState.game.danger = 0;
    startGameMusicBed(now);
    scheduleGameMusic();
    audioState.game.scheduler = window.setInterval(scheduleGameMusic, 80);
  }

  function stopGameMusic(fadeSeconds) {
    var ctx = audioState.ctx;
    if (!ctx) {
      audioState.game.active = false;
      return;
    }

    var fade = Math.max(0.05, fadeSeconds == null ? 0.5 : fadeSeconds);
    var now = ctx.currentTime;
    if (audioState.game.scheduler) {
      window.clearInterval(audioState.game.scheduler);
      audioState.game.scheduler = null;
    }
    if (audioState.gameGain) {
      audioState.gameGain.gain.cancelScheduledValues(now);
      audioState.gameGain.gain.setValueAtTime(Math.max(0.0001, audioState.gameGain.gain.value || 0.0001), now);
      audioState.gameGain.gain.linearRampToValueAtTime(0.0001, now + fade);
    }
    audioState.game.active = false;
    audioState.game.battleTarget = 0;
    stopGameMusicNodes(now + fade + 0.12);
  }

  function startGameMusicBed(now) {
    var ctx = audioState.ctx;
    if (!ctx) return;
    createGamePedalTone(36.71, 0.011, -4, now, audioState.gameExploreGain, 150);
    createGamePedalTone(55, 0.006, 3, now, audioState.gameExploreGain, 190);
    createGamePedalTone(36.71, 0.012, 0, now, audioState.gameBattleGain, 145);
    createGamePedalTone(73.42, 0.004, -6, now, audioState.gameBattleGain, 210);
  }

  function createGamePedalTone(freq, level, detune, now, destination, cutoff) {
    var ctx = audioState.ctx;
    level = boostedGameMusicLevel(level, 0.055);
    var osc = ctx.createOscillator();
    var filter = ctx.createBiquadFilter();
    var gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    osc.detune.value = detune || 0;
    filter.type = "lowpass";
    filter.frequency.value = cutoff || 180;
    filter.Q.value = 0.45;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(level, now + 2.4);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(destination || audioState.gameExploreGain);
    osc.start(now);
    audioState.game.nodes.push(osc, filter, gain);
  }

  function scheduleGameMusic() {
    var ctx = audioState.ctx;
    if (!ctx || !audioState.game.active || !isGameplayMusicMode()) return;
    updateGameMusicBattleMix(ctx.currentTime);
    var stepTime = 60 / audioState.game.tempo / 2;
    var lookahead = 0.38;
    while (audioState.game.nextStepTime < ctx.currentTime + lookahead) {
      scheduleGameMusicStep(audioState.game.nextStepTime, audioState.game.step);
      audioState.game.nextStepTime += stepTime;
      audioState.game.step += 1;
    }
  }

  function updateGameMusicBattleMix(now) {
    var target = getGameplayMusicDanger();
    audioState.game.danger = target;
    audioState.game.battleTarget = target;
    audioState.game.battleAmount += (target - audioState.game.battleAmount) * 0.18;
    var battle = clamp(audioState.game.battleAmount, 0, 1);
    audioState.gameExploreGain.gain.cancelScheduledValues(now);
    audioState.gameBattleGain.gain.cancelScheduledValues(now);
    audioState.gameExploreGain.gain.setValueAtTime(Math.max(0.0001, audioState.gameExploreGain.gain.value || 0.0001), now);
    audioState.gameBattleGain.gain.setValueAtTime(Math.max(0.0001, audioState.gameBattleGain.gain.value || 0.0001), now);
    audioState.gameExploreGain.gain.linearRampToValueAtTime(Math.max(0.26, 1 - battle * 0.74), now + 0.26);
    audioState.gameBattleGain.gain.linearRampToValueAtTime(battle * 0.9, now + 0.26);
  }

  function getGameplayMusicDanger() {
    if (!state.player || !state.enemies || !state.enemies.length || state.mode !== "playing") return 0;
    var count = 0;
    var nearWeight = 0;
    for (var i = 0; i < state.enemies.length; i++) {
      var enemy = state.enemies[i];
      if (!enemy || !enemy.active) continue;
      count += 1;
      var dist = Math.hypot(enemy.x - state.player.x, enemy.z - state.player.z);
      if (dist < 16) nearWeight += clamp((16 - dist) / 12, 0, 1);
    }
    var crowdScore = clamp((count - 5) / 15, 0, 1);
    var nearScore = clamp(nearWeight / 4.2, 0, 1);
    return clamp(Math.max(crowdScore, nearScore), 0, 1);
  }

  function boostedGameMusicLevel(level, maxLevel) {
    return clamp((Number(level) || 0) * GAME_MUSIC_INSTRUMENT_BOOST, 0.0001, maxLevel || 0.24);
  }

  function scheduleGameMusicStep(time, step) {
    var index = step % 32;
    var phrase = Math.floor(step / 32) % 4;
    var bar = Math.floor(index / 8);
    var beat = index % 8;
    var battle = clamp(audioState.game.battleAmount, 0, 1);
    var battleMode = battle > 0.55;
    var barInfo = getGameMusicBar(battleMode, bar);
    var destination = battleMode ? audioState.gameBattleGain : audioState.gameExploreGain;
    var chordPan = beat === 2 ? -0.18 : 0.18;

    if (beat === 0) {
      playGameKick(time, battleMode ? 0.046 + battle * 0.018 : 0.022, destination);
      playGameBass(time + 0.018, barInfo.root, battleMode ? 0.052 : 0.04, destination, battleMode ? 0.34 : 0.48);
    }
    if (beat === 4) {
      playGameBass(time + 0.012, barInfo.alt, battleMode ? 0.044 : 0.031, destination, battleMode ? 0.3 : 0.42);
    }

    if (beat === 2 || beat === 6) {
      playGameChord(time + 0.018, barInfo.chord, battleMode ? 0.016 + battle * 0.006 : 0.015, chordPan, destination, battleMode);
      if (battleMode) {
        playGameRim(time + 0.004, 0.024 + battle * 0.022, destination);
      } else {
        playGameBrush(time + 0.006, 0.012, 520, destination, chordPan * -0.6);
      }
    }

    if (battleMode && (beat === 3 || beat === 7)) {
      playGameBrush(time, 0.012 + battle * 0.014, 1450, audioState.gameBattleGain, beat === 3 ? -0.12 : 0.12);
    }

    var exploreMelodyA = [null, null, null, 349.23, null, null, 293.66, null, null, null, 392, null, null, 349.23, null, null, null, 293.66, null, 261.63, null, null, 293.66, null, null, null, 329.63, null, 349.23, null, 293.66, null];
    var exploreMelodyB = [null, null, 293.66, null, null, 349.23, null, null, null, null, 392, null, 440, null, 392, null, null, null, 349.23, null, null, 293.66, null, null, null, 261.63, null, 277.18, null, null, 293.66, null];
    var battleMelody = [null, 293.66, null, 349.23, null, 415.3, null, 440, null, 349.23, null, 415.3, null, 523.25, null, 493.88, null, 392, null, 466.16, null, 523.25, null, 587.33, null, 440, null, 415.3, null, 349.23, null, 293.66];
    var note = battleMode ? battleMelody[index] : (phrase % 2 ? exploreMelodyB : exploreMelodyA)[index];
    if (note) {
      playGameLead(time + (battleMode ? 0.008 : 0.03), note, battleMode ? 0.018 + battle * 0.008 : 0.015, index % 16 < 8 ? 0.2 : -0.2, battleMode ? 0.28 : 0.62, destination, battleMode);
    }
  }

  function getGameMusicBar(battleMode, bar) {
    var explore = [
      { root: 73.42, alt: 110, chord: [146.83, 174.61, 220] },
      { root: 65.41, alt: 98, chord: [130.81, 164.81, 196] },
      { root: 58.27, alt: 87.31, chord: [116.54, 146.83, 174.61] },
      { root: 55, alt: 82.41, chord: [110, 138.59, 164.81] },
    ];
    var battle = [
      { root: 73.42, alt: 110, chord: [146.83, 220, 293.66] },
      { root: 87.31, alt: 130.81, chord: [174.61, 261.63, 349.23] },
      { root: 98, alt: 146.83, chord: [196, 233.08, 293.66] },
      { root: 55, alt: 82.41, chord: [110, 138.59, 164.81, 220] },
    ];
    return (battleMode ? battle : explore)[bar % 4];
  }

  function playGameBass(time, freq, level, destination, length) {
    var ctx = audioState.ctx;
    if (!ctx) return;
    length = clamp(Number(length) || 0.42, 0.12, 0.8);
    level = boostedGameMusicLevel(level, 0.18);
    var body = ctx.createOscillator();
    var sub = ctx.createOscillator();
    var bodyGain = ctx.createGain();
    var subGain = ctx.createGain();
    var filter = ctx.createBiquadFilter();
    var gain = ctx.createGain();
    body.type = "triangle";
    sub.type = "sine";
    body.frequency.setValueAtTime(freq * 1.01, time);
    body.frequency.exponentialRampToValueAtTime(freq, time + 0.055);
    sub.frequency.setValueAtTime(freq * 0.5, time);
    bodyGain.gain.value = 0.7;
    subGain.gain.value = 0.36;
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(240, time);
    filter.frequency.exponentialRampToValueAtTime(95, time + length);
    filter.Q.value = 0.65;
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(level, time + 0.018);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + length);
    body.connect(bodyGain);
    sub.connect(subGain);
    bodyGain.connect(filter);
    subGain.connect(filter);
    filter.connect(gain);
    var output = connectGameOutput(gain, destination || audioState.gameExploreGain, -0.04);
    body.start(time);
    sub.start(time);
    body.stop(time + length + 0.05);
    sub.stop(time + length + 0.05);
    scheduleAudioDisconnect([body, sub, bodyGain, subGain, filter, gain, output], time + length + 0.14);
  }

  function playGameChord(time, freqs, level, pan, destination, muted) {
    for (var i = 0; i < freqs.length; i++) {
      playGameGuitarNote(time + i * 0.018, freqs[i], level * (i === 0 ? 0.78 : 1), pan + (i - 1) * 0.07, muted ? 0.18 + i * 0.012 : 0.42, destination, muted);
    }
  }

  function playGameGuitarNote(time, freq, level, pan, length, destination, muted) {
    var ctx = audioState.ctx;
    if (!ctx) return;
    length = clamp(Number(length) || 0.36, 0.08, 0.72);
    level = boostedGameMusicLevel(level, muted ? 0.11 : 0.12);
    var body = ctx.createOscillator();
    var bite = ctx.createOscillator();
    var bodyGain = ctx.createGain();
    var biteGain = ctx.createGain();
    var filter = ctx.createBiquadFilter();
    var gain = ctx.createGain();
    body.type = "triangle";
    bite.type = "sawtooth";
    body.frequency.setValueAtTime(freq * 1.018, time);
    body.frequency.exponentialRampToValueAtTime(freq, time + 0.05);
    bite.frequency.setValueAtTime(freq * 0.995, time);
    bite.detune.value = muted ? -7 : -12;
    bodyGain.gain.value = muted ? 0.64 : 0.74;
    biteGain.gain.value = muted ? 0.1 : 0.07;
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(muted ? 1650 : 2150, time);
    filter.frequency.exponentialRampToValueAtTime(muted ? 480 : 640, time + Math.max(0.08, length * 0.74));
    filter.Q.value = muted ? 0.85 : 0.7;
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(level, time + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + length);
    body.connect(bodyGain);
    bite.connect(biteGain);
    bodyGain.connect(filter);
    biteGain.connect(filter);
    filter.connect(gain);
    var output = connectGameOutput(gain, destination || audioState.gameExploreGain, pan || 0);
    body.start(time);
    bite.start(time);
    body.stop(time + length + 0.05);
    bite.stop(time + length + 0.05);
    scheduleAudioDisconnect([body, bite, bodyGain, biteGain, filter, gain, output], time + length + 0.14);
  }

  function playGameLead(time, freq, level, pan, length, destination, grit) {
    var ctx = audioState.ctx;
    if (!ctx) return;
    length = clamp(Number(length) || 0.45, 0.12, 0.86);
    level = boostedGameMusicLevel(level, grit ? 0.12 : 0.1);
    var reed = ctx.createOscillator();
    var body = ctx.createOscillator();
    var lfo = ctx.createOscillator();
    var lfoGain = ctx.createGain();
    var filter = ctx.createBiquadFilter();
    var gain = ctx.createGain();
    reed.type = "sawtooth";
    body.type = "triangle";
    reed.frequency.setValueAtTime(freq * (grit ? 0.985 : 0.994), time);
    reed.frequency.exponentialRampToValueAtTime(freq, time + 0.09);
    body.frequency.setValueAtTime(freq * 0.5, time);
    body.detune.value = grit ? 5 : -4;
    lfo.type = "sine";
    lfo.frequency.value = grit ? 6.5 : 5.2;
    lfoGain.gain.value = freq * (grit ? 0.0048 : 0.0032);
    lfo.connect(lfoGain);
    lfoGain.connect(reed.frequency);
    lfoGain.connect(body.frequency);
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(grit ? 1180 : 980, time);
    filter.Q.value = grit ? 1.35 : 1.1;
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(level, time + 0.035);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + length);
    reed.connect(filter);
    body.connect(filter);
    filter.connect(gain);
    var output = connectGameOutput(gain, destination || audioState.gameExploreGain, pan || 0);
    lfo.start(time);
    reed.start(time);
    body.start(time);
    lfo.stop(time + length + 0.06);
    reed.stop(time + length + 0.06);
    body.stop(time + length + 0.06);
    scheduleAudioDisconnect([reed, body, lfo, lfoGain, filter, gain, output], time + length + 0.15);
  }

  function playGameKick(time, level, destination) {
    var ctx = audioState.ctx;
    if (!ctx) return;
    level = boostedGameMusicLevel(level, 0.2);
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(92, time);
    osc.frequency.exponentialRampToValueAtTime(46, time + 0.13);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(level, time + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.23);
    osc.connect(gain);
    var output = connectGameOutput(gain, destination || audioState.gameExploreGain, 0);
    osc.start(time);
    osc.stop(time + 0.26);
    scheduleAudioDisconnect([osc, gain, output], time + 0.34);
  }

  function playGameBrush(time, level, centerFreq, destination, pan) {
    var ctx = audioState.ctx;
    if (!ctx || !audioState.noiseBuffer) return;
    level = boostedGameMusicLevel(level, 0.09);
    var src = ctx.createBufferSource();
    var filter = ctx.createBiquadFilter();
    var gain = ctx.createGain();
    src.buffer = audioState.noiseBuffer;
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(centerFreq || 900, time);
    filter.Q.value = 1.2;
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(level, time + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.16);
    src.connect(filter);
    filter.connect(gain);
    var output = connectGameOutput(gain, destination || audioState.gameExploreGain, pan || 0);
    src.start(time);
    src.stop(time + 0.18);
    scheduleAudioDisconnect([src, filter, gain, output], time + 0.26);
  }

  function playGameRim(time, level, destination) {
    var ctx = audioState.ctx;
    if (!ctx || !audioState.noiseBuffer) return;
    level = boostedGameMusicLevel(level, 0.16);
    var click = ctx.createBufferSource();
    var noiseFilter = ctx.createBiquadFilter();
    var noiseGain = ctx.createGain();
    var tone = ctx.createOscillator();
    var toneGain = ctx.createGain();
    click.buffer = audioState.noiseBuffer;
    noiseFilter.type = "bandpass";
    noiseFilter.frequency.setValueAtTime(1850, time);
    noiseFilter.Q.value = 2.4;
    noiseGain.gain.setValueAtTime(0.0001, time);
    noiseGain.gain.linearRampToValueAtTime(level, time + 0.004);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.09);
    tone.type = "triangle";
    tone.frequency.setValueAtTime(440, time);
    toneGain.gain.setValueAtTime(0.0001, time);
    toneGain.gain.linearRampToValueAtTime(level * 0.35, time + 0.004);
    toneGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.08);
    click.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    tone.connect(toneGain);
    var noiseOutput = connectGameOutput(noiseGain, destination || audioState.gameBattleGain, rand(-0.08, 0.08));
    var toneOutput = connectGameOutput(toneGain, destination || audioState.gameBattleGain, rand(-0.06, 0.06));
    click.start(time);
    tone.start(time);
    click.stop(time + 0.11);
    tone.stop(time + 0.1);
    scheduleAudioDisconnect([click, noiseFilter, noiseGain, noiseOutput, tone, toneGain, toneOutput], time + 0.2);
  }

  function playRevolverShotSound(position, dir, muzzleSide, heavy) {
    if (!audioState.enabled) return;
    var ctx = audioState.ctx || ensureAudioContext();
    if (!ctx || ctx.state !== "running" || !audioState.sfxGain) return;
    if (!audioState.shotNoiseBuffer) audioState.shotNoiseBuffer = createGunshotNoiseBuffer(ctx);
    var now = ctx.currentTime;
    var side = Number(muzzleSide) || 0;
    var aimPan = dir && isFinite(dir.x) ? dir.x * 0.1 : 0;
    var pan = clamp(side * 0.42 + aimPan, -0.75, 0.75);
    var level = heavy ? 1.2 : 1;
    var shotTime = now + REVOLVER_HAMMER_LEAD_TIME;

    playRevolverHammerCock(now, pan, 0.058 * level);
    playGunshotNoiseLayer(shotTime, pan, 1.34 * level, 920, 11800, 0.34, 0.0008, 0.032, rand(0, 0.16));
    playGunshotNoiseLayer(shotTime + 0.002, pan * 0.85, 1.06 * level, 56, 3400, 0.32, 0.0018, 0.145, rand(0.04, 0.38));
    playGunshotBody(shotTime, pan, 0.54 * level, heavy);
    playGunshotNoiseLayer(shotTime + 0.03, pan * 0.45, 0.38 * level, 86, 1700, 0.3, 0.008, 0.3, rand(0.2, 0.55));
    playGunshotNoiseLayer(shotTime + 0.13, -pan * 0.22, 0.1 * level, 120, 700, 0.28, 0.018, 0.42, rand(0.35, 0.65));
    playRevolverMechanics(shotTime + 0.08, pan, 0.026 * level);
  }

  function playCoachGunShotSound(position, dir, lastShell) {
    if (!audioState.enabled) return;
    var ctx = audioState.ctx || ensureAudioContext();
    if (!ctx || ctx.state !== "running" || !audioState.sfxGain) return;
    if (!audioState.shotNoiseBuffer) audioState.shotNoiseBuffer = createGunshotNoiseBuffer(ctx);
    var now = ctx.currentTime;
    var pan = clamp(dir && isFinite(dir.x) ? dir.x * 0.16 : 0, -0.7, 0.7);
    var level = lastShell ? 1.08 : 1;
    playGunshotNoiseLayer(now, pan, 1.58 * level, 64, 9600, 0.28, 0.001, 0.19, rand(0, 0.18));
    playGunshotNoiseLayer(now + 0.004, pan * 0.78, 1.12 * level, 46, 3300, 0.24, 0.002, 0.28, rand(0.08, 0.42));
    playGunshotBody(now, pan, 0.82 * level, true);
    playGunshotNoiseLayer(now + 0.055, -pan * 0.28, 0.34 * level, 120, 1500, 0.34, 0.008, 0.38, rand(0.25, 0.58));
    playRevolverMechanics(now + 0.12, pan, 0.035 * level);
  }

  function playGunshotNoiseLayer(time, pan, level, highFreq, lowFreq, q, attack, duration, offset) {
    var ctx = audioState.ctx;
    if (!ctx || !audioState.shotNoiseBuffer) return;
    var src = ctx.createBufferSource();
    var high = ctx.createBiquadFilter();
    var low = ctx.createBiquadFilter();
    var gain = ctx.createGain();
    src.buffer = audioState.shotNoiseBuffer;
    src.playbackRate.setValueAtTime(rand(0.94, 1.08), time);
    high.type = "highpass";
    high.frequency.setValueAtTime(Math.max(20, highFreq || 120), time);
    high.Q.value = 0.55;
    low.type = "lowpass";
    low.frequency.setValueAtTime(Math.max(80, lowFreq || 1600), time);
    low.Q.value = q || 0.7;
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(level, time + Math.max(0.001, attack || 0.004));
    gain.gain.exponentialRampToValueAtTime(0.0001, time + Math.max(0.012, duration || 0.12));
    src.connect(high);
    high.connect(low);
    low.connect(gain);
    var output = connectSfxOutput(gain, pan || 0);
    src.start(time, Math.max(0, offset || 0));
    src.stop(time + Math.max(0.03, duration || 0.12) + 0.08);
    scheduleAudioDisconnect([src, high, low, gain, output], time + Math.max(0.03, duration || 0.12) + 0.12);
  }

  function playGunshotBody(time, pan, level, heavy) {
    var ctx = audioState.ctx;
    if (!ctx) return;
    var thump = ctx.createOscillator();
    var filter = ctx.createBiquadFilter();
    var gain = ctx.createGain();
    thump.type = "sine";
    thump.frequency.setValueAtTime(heavy ? 132 : 118, time);
    thump.frequency.exponentialRampToValueAtTime(heavy ? 42 : 48, time + 0.085);
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(heavy ? 240 : 210, time);
    filter.frequency.exponentialRampToValueAtTime(82, time + 0.13);
    filter.Q.value = 0.32;
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(level, time + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.135);
    thump.connect(filter);
    filter.connect(gain);
    var output = connectSfxOutput(gain, pan || 0);
    thump.start(time);
    thump.stop(time + 0.16);
    scheduleAudioDisconnect([thump, filter, gain, output], time + 0.2);
  }

  function playLauncherLaunchSound(position, dir) {
    if (!audioState.enabled) return;
    var ctx = audioState.ctx || ensureAudioContext();
    if (!ctx || ctx.state !== "running" || !audioState.sfxGain) return;
    if (!audioState.shotNoiseBuffer) audioState.shotNoiseBuffer = createGunshotNoiseBuffer(ctx);
    warmupLauncherExplosionAudioGraph();

    var now = ctx.currentTime;
    var pan = getProjectileSfxPan(position, dir, 0.24);
    playLauncherTubeThump(now, pan, 0.58);
    playGunshotNoiseLayer(now + 0.004, pan, 0.52, 70, 2100, 0.24, 0.002, 0.15, rand(0.04, 0.34));
    playGunshotNoiseLayer(now + 0.018, pan * 0.82, 0.2, 760, 5600, 0.36, 0.003, 0.11, rand(0.3, 0.74));
    playGunshotNoiseLayer(now + 0.062, pan * 0.5, 0.075, 1700, 7200, 0.48, 0.004, 0.08, rand(0.58, 0.92));
  }

  function playLauncherTubeThump(time, pan, level) {
    var ctx = audioState.ctx;
    if (!ctx) return;
    var body = ctx.createOscillator();
    var filter = ctx.createBiquadFilter();
    var gain = ctx.createGain();
    body.type = "sine";
    body.frequency.setValueAtTime(88, time);
    body.frequency.exponentialRampToValueAtTime(34, time + 0.11);
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(210, time);
    filter.frequency.exponentialRampToValueAtTime(72, time + 0.16);
    filter.Q.value = 0.26;
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(level, time + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.18);
    body.connect(filter);
    filter.connect(gain);
    var output = connectSfxOutput(gain, pan || 0);
    body.start(time);
    body.stop(time + 0.2);
    scheduleAudioDisconnect([body, filter, gain, output], time + 0.24);
  }

  function startLauncherGrenadeWhistle(grenade) {
    if (!audioState.enabled || !grenade) return null;
    var ctx = audioState.ctx || ensureAudioContext();
    if (!ctx || ctx.state !== "running" || !audioState.sfxGain) return null;

    var now = ctx.currentTime;
    var life = clamp(Number(grenade.maxLife) || 0.7, 0.16, 2.2);
    var whistle = ctx.createOscillator();
    var air = ctx.createOscillator();
    var lfo = ctx.createOscillator();
    var lfoGain = ctx.createGain();
    var whistleGain = ctx.createGain();
    var airGain = ctx.createGain();
    var filter = ctx.createBiquadFilter();
    var gain = ctx.createGain();
    var pan = getProjectileSfxPan(grenade, { x: grenade.dirX, z: grenade.dirZ }, 0.16);

    whistle.type = "sine";
    air.type = "triangle";
    lfo.type = "sine";
    whistle.frequency.setValueAtTime(rand(1180, 1340), now);
    whistle.frequency.exponentialRampToValueAtTime(rand(840, 980), now + life);
    air.frequency.setValueAtTime(rand(1760, 1940), now);
    air.frequency.exponentialRampToValueAtTime(rand(1180, 1360), now + life);
    lfo.frequency.setValueAtTime(rand(5.8, 7.4), now);
    lfoGain.gain.value = rand(12, 22);
    whistleGain.gain.value = 0.82;
    airGain.gain.value = 0.18;
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(1280, now);
    filter.Q.value = 5.8;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.013, now + 0.065);
    gain.gain.setTargetAtTime(0.009, now + 0.12, 0.42);

    lfo.connect(lfoGain);
    lfoGain.connect(whistle.detune);
    whistle.connect(whistleGain);
    air.connect(airGain);
    whistleGain.connect(filter);
    airGain.connect(filter);
    filter.connect(gain);
    var output = connectSfxOutput(gain, pan);
    whistle.start(now);
    air.start(now);
    lfo.start(now);

    audioState.launcherWhistleCount += 1;
    return {
      active: true,
      whistle: whistle,
      air: air,
      lfo: lfo,
      lfoGain: lfoGain,
      whistleGain: whistleGain,
      airGain: airGain,
      filter: filter,
      gain: gain,
      output: output,
    };
  }

  function updateLauncherGrenadeWhistle(grenade) {
    var handle = grenade && grenade.launcherWhistle;
    var ctx = audioState.ctx;
    if (!handle || !handle.active || !ctx) return;
    var now = ctx.currentTime;
    var progress = clamp((grenade.age || 0) / Math.max(0.001, grenade.maxLife || 1), 0, 1);
    if (handle.output && handle.output.pan) {
      handle.output.pan.setTargetAtTime(getProjectileSfxPan(grenade, null, 0.18), now, 0.045);
    }
    if (handle.filter && handle.filter.frequency) {
      handle.filter.frequency.setTargetAtTime(1280 + Math.sin(state.time * 8.5 + progress * 5) * 120, now, 0.06);
    }
    if (handle.gain && handle.gain.gain) {
      handle.gain.gain.setTargetAtTime(0.007 + Math.sin(progress * Math.PI) * 0.006, now, 0.06);
    }
  }

  function stopLauncherGrenadeWhistle(handle, fadeSeconds) {
    if (!handle || !handle.active) return;
    handle.active = false;
    audioState.launcherWhistleCount = Math.max(0, audioState.launcherWhistleCount - 1);
    var ctx = audioState.ctx;
    if (!ctx) return;
    var now = ctx.currentTime;
    var fade = clamp(fadeSeconds == null ? 0.055 : Number(fadeSeconds) || 0.055, 0.018, 0.18);
    var stopAt = now + fade;
    if (handle.gain && handle.gain.gain) {
      handle.gain.gain.cancelScheduledValues(now);
      handle.gain.gain.setValueAtTime(Math.max(0.0001, handle.gain.gain.value || 0.0001), now);
      handle.gain.gain.exponentialRampToValueAtTime(0.0001, stopAt);
    }
    try {
      handle.whistle.stop(stopAt + 0.025);
    } catch (err) {}
    try {
      handle.air.stop(stopAt + 0.025);
    } catch (err) {}
    try {
      handle.lfo.stop(stopAt + 0.025);
    } catch (err) {}
    scheduleAudioDisconnect(
      [handle.whistle, handle.air, handle.lfo, handle.lfoGain, handle.whistleGain, handle.airGain, handle.filter, handle.gain, handle.output],
      stopAt + 0.09
    );
  }

  function stopAllLauncherGrenadeWhistles(fadeSeconds) {
    for (var i = 0; i < state.bullets.length; i++) {
      if (state.bullets[i] && state.bullets[i].launcherWhistle) stopLauncherGrenadeWhistle(state.bullets[i].launcherWhistle, fadeSeconds);
    }
  }

  function playLauncherExplosionSound(x, z, radius, kind) {
    if (!audioState.enabled) return;
    var ctx = audioState.ctx || ensureAudioContext();
    if (!ctx || ctx.state !== "running" || !audioState.sfxGain) return;
    if (!audioState.shotNoiseBuffer) audioState.shotNoiseBuffer = createGunshotNoiseBuffer(ctx);

    var now = ctx.currentTime;
    var impactScale = clamp((Number(radius) || getLauncherBlastRadius()) / WEAPONS.launcher.blastRadius, 0.68, 1.65);
    var childScale = kind === "chain" ? 0.74 : kind === "cluster" ? 0.58 : 1;
    var level = impactScale * childScale * 0.86;
    var pan = getProjectileSfxPan({ x: x, z: z }, null, 0);

    if (kind === "main") {
      reserveLauncherExplosionFullAudio(now, true);
      playLauncherExplosionLayers(now, pan, level, impactScale, "full", 1);
      return;
    }

    queueLauncherExplosionGroupAudio(x, z, pan, level, impactScale, kind || "chain");
  }

  function playLauncherExplosionLayers(time, pan, level, scale, profile, count) {
    var burstSize = Math.max(1, count || 1);
    if (profile === "compact") {
      var compactLift = burstSize > 1 ? clamp(1 + Math.log(burstSize) * 0.05, 1, 1.18) : 1;
      playLauncherExplosionImpact(time, pan, 0.88 * level * compactLift, scale);
      playLauncherExplosionCrack(time + 0.003, pan, 0.54 * level);
      playLauncherExplosionBlastNoise(time + 0.006, pan, 0.46 * level, scale);
      audioState.launcherExplosionAudioStats.compactPlayed += 1;
      return;
    }

    if (profile === "group") {
      var massLift = burstSize > 1 ? clamp(1 + Math.log(burstSize) * 0.08, 1, 1.28) : 1;
      playLauncherExplosionImpact(time, pan, 1.16 * level * massLift, scale);
      playLauncherExplosionCrack(time + 0.003, pan, 0.76 * level);
      playLauncherExplosionBlastNoise(time + 0.006, pan, 0.98 * level, scale);
      playLauncherExplosionDebrisTail(time + 0.044, pan, 0.34 * level, scale);
      audioState.launcherExplosionAudioStats.fullPlayed += 1;
      return;
    }

    playLauncherExplosionImpact(time, pan, 1.18 * level, scale);
    playLauncherExplosionCrack(time + 0.003, pan, 0.82 * level);
    playLauncherExplosionBlastNoise(time + 0.006, pan, 0.92 * level, scale);
    playLauncherExplosionDebrisTail(time + 0.045, pan, 0.38 * level, scale);
    audioState.launcherExplosionAudioStats.fullPlayed += 1;
  }

  function warmupLauncherExplosionAudioGraph() {
    if (audioState.launcherExplosionAudioGraphReady || !audioState.enabled) return false;
    var ctx = audioState.ctx || ensureAudioContext();
    if (!ctx || ctx.state !== "running" || !audioState.sfxGain) return false;
    if (!audioState.shotNoiseBuffer) audioState.shotNoiseBuffer = createGunshotNoiseBuffer(ctx);

    var warmupGain = ctx.createGain();
    warmupGain.gain.value = 0;
    warmupGain.connect(audioState.sfxGain);

    var stats = audioState.launcherExplosionAudioStats;
    var previousGrouped = stats.grouped;
    var previousMergedGroups = stats.mergedGroups;
    var previousFullPlayed = stats.fullPlayed;
    var previousCompactPlayed = stats.compactPlayed;
    var previousDestination = audioState.sfxWarmupDestination;
    var previousGraphReady = audioState.launcherExplosionAudioGraphReady;

    try {
      audioState.sfxWarmupDestination = warmupGain;
      playLauncherExplosionLayers(ctx.currentTime + 0.018, 0, LAUNCHER_EXPLOSION_AUDIO_WARMUP_LEVEL, 1, "full", 1);
      audioState.launcherExplosionAudioGraphReady = true;
      scheduleAudioDisconnect([warmupGain], ctx.currentTime + 0.75);
      return true;
    } catch (err) {
      audioState.launcherExplosionAudioGraphReady = previousGraphReady;
      try {
        warmupGain.disconnect();
      } catch (disconnectErr) {}
      return false;
    } finally {
      audioState.sfxWarmupDestination = previousDestination;
      stats.grouped = previousGrouped;
      stats.mergedGroups = previousMergedGroups;
      stats.fullPlayed = previousFullPlayed;
      stats.compactPlayed = previousCompactPlayed;
    }
  }

  function reserveLauncherExplosionFullAudio(time, priority) {
    if (time - audioState.launcherExplosionAudioWindowStart > LAUNCHER_EXPLOSION_AUDIO_FULL_WINDOW) {
      audioState.launcherExplosionAudioWindowStart = time;
      audioState.launcherExplosionAudioFullCount = 0;
    }
    if (priority) {
      audioState.launcherExplosionAudioFullCount = Math.min(
        LAUNCHER_EXPLOSION_AUDIO_FULL_LIMIT,
        audioState.launcherExplosionAudioFullCount + 1
      );
      return true;
    }
    if (audioState.launcherExplosionAudioFullCount >= LAUNCHER_EXPLOSION_AUDIO_FULL_LIMIT) return false;
    audioState.launcherExplosionAudioFullCount += 1;
    return true;
  }

  function queueLauncherExplosionGroupAudio(x, z, pan, level, scale, kind) {
    var groups = audioState.launcherExplosionAudioGroups;
    var group = findLauncherExplosionAudioGroup(x, z);
    if (!group && groups.length >= LAUNCHER_EXPLOSION_AUDIO_MAX_GROUPS) {
      group = findNearestLauncherExplosionAudioGroup(x, z);
      audioState.launcherExplosionAudioStats.mergedGroups += 1;
    }
    if (!group) {
      group = {
        x: x,
        z: z,
        count: 0,
        energy: 0,
        maxLevel: 0,
        maxScale: 0,
        panSum: 0,
        weight: 0,
        primaryKind: kind || "chain",
      };
      groups.push(group);
    }
    addLauncherExplosionAudioToGroup(group, x, z, pan, level, scale, kind);
    audioState.launcherExplosionAudioStats.grouped += 1;
    scheduleLauncherExplosionAudioFlush();
  }

  function findLauncherExplosionAudioGroup(x, z) {
    var groups = audioState.launcherExplosionAudioGroups;
    var maxDistSq = LAUNCHER_EXPLOSION_AUDIO_GROUP_RADIUS * LAUNCHER_EXPLOSION_AUDIO_GROUP_RADIUS;
    var best = null;
    var bestDistSq = maxDistSq;
    for (var i = 0; i < groups.length; i++) {
      var dx = x - groups[i].x;
      var dz = z - groups[i].z;
      var distSq = dx * dx + dz * dz;
      if (distSq <= bestDistSq) {
        bestDistSq = distSq;
        best = groups[i];
      }
    }
    return best;
  }

  function findNearestLauncherExplosionAudioGroup(x, z) {
    var groups = audioState.launcherExplosionAudioGroups;
    var best = null;
    var bestDistSq = Infinity;
    for (var i = 0; i < groups.length; i++) {
      var dx = x - groups[i].x;
      var dz = z - groups[i].z;
      var distSq = dx * dx + dz * dz;
      if (distSq < bestDistSq) {
        bestDistSq = distSq;
        best = groups[i];
      }
    }
    return best;
  }

  function addLauncherExplosionAudioToGroup(group, x, z, pan, level, scale, kind) {
    var weight = Math.max(0.08, level || 0.08);
    var nextWeight = group.weight + weight;
    group.x = (group.x * group.weight + x * weight) / nextWeight;
    group.z = (group.z * group.weight + z * weight) / nextWeight;
    group.panSum += (pan || 0) * weight;
    group.weight = nextWeight;
    group.count += 1;
    group.energy += weight * weight;
    group.maxLevel = Math.max(group.maxLevel, weight);
    group.maxScale = Math.max(group.maxScale, scale || 1);
    if (kind === "chain" || (kind !== "cluster" && kind !== "echo")) group.primaryKind = kind || group.primaryKind;
  }

  function scheduleLauncherExplosionAudioFlush() {
    if (audioState.launcherExplosionAudioFlushTimer) return;
    audioState.launcherExplosionAudioFlushTimer = window.setTimeout(flushLauncherExplosionAudioGroups, LAUNCHER_EXPLOSION_AUDIO_GROUP_WINDOW_MS);
  }

  function flushLauncherExplosionAudioGroups() {
    audioState.launcherExplosionAudioFlushTimer = null;
    if (!audioState.launcherExplosionAudioGroups.length) return;
    var ctx = audioState.ctx;
    if (!audioState.enabled || !ctx || ctx.state !== "running") {
      audioState.launcherExplosionAudioGroups.length = 0;
      return;
    }
    var groups = audioState.launcherExplosionAudioGroups.splice(0, audioState.launcherExplosionAudioGroups.length);
    var now = ctx.currentTime;
    for (var i = 0; i < groups.length; i++) {
      playLauncherExplosionAudioGroup(groups[i], now + i * 0.006);
    }
  }

  function playLauncherExplosionAudioGroup(group, time) {
    if (!group || !group.count) return;
    var count = group.count;
    var level = group.maxLevel;
    if (count > 1) level = clamp(group.maxLevel * (1 + Math.log(count) * 0.26), 0.12, 2.15);
    else level = clamp(Math.sqrt(group.energy), 0.08, 1.35);
    var scale = clamp(group.maxScale * (count > 1 ? 1 + Math.log(count) * 0.045 : 1), 0.58, 1.82);
    var pan = group.weight > 0 ? clamp(group.panSum / group.weight, -0.76, 0.76) : 0;
    var profile = reserveLauncherExplosionFullAudio(time, false) ? "group" : "compact";
    playLauncherExplosionLayers(time, pan, level, scale, profile, count);
  }

  function resetLauncherExplosionAudioMixer() {
    if (audioState.launcherExplosionAudioFlushTimer) {
      window.clearTimeout(audioState.launcherExplosionAudioFlushTimer);
      audioState.launcherExplosionAudioFlushTimer = null;
    }
    audioState.launcherExplosionAudioGroups.length = 0;
    audioState.launcherExplosionAudioWindowStart = 0;
    audioState.launcherExplosionAudioFullCount = 0;
    audioState.launcherExplosionAudioStats.grouped = 0;
    audioState.launcherExplosionAudioStats.mergedGroups = 0;
    audioState.launcherExplosionAudioStats.fullPlayed = 0;
    audioState.launcherExplosionAudioStats.compactPlayed = 0;
  }

  function playLauncherExplosionImpact(time, pan, level, scale) {
    var ctx = audioState.ctx;
    if (!ctx) return;
    var sub = ctx.createOscillator();
    var body = ctx.createOscillator();
    var subGain = ctx.createGain();
    var bodyGain = ctx.createGain();
    var filter = ctx.createBiquadFilter();
    var mix = ctx.createGain();
    sub.type = "sine";
    body.type = "triangle";
    sub.frequency.setValueAtTime(62 * scale, time);
    sub.frequency.exponentialRampToValueAtTime(28, time + 0.24);
    body.frequency.setValueAtTime(138 * scale, time);
    body.frequency.exponentialRampToValueAtTime(42, time + 0.16);
    subGain.gain.setValueAtTime(0.0001, time);
    subGain.gain.linearRampToValueAtTime(0.72 * level, time + 0.006);
    subGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.34);
    bodyGain.gain.setValueAtTime(0.0001, time);
    bodyGain.gain.linearRampToValueAtTime(0.42 * level, time + 0.003);
    bodyGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.18);
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(320, time);
    filter.frequency.exponentialRampToValueAtTime(86, time + 0.28);
    filter.Q.value = 0.34;
    mix.gain.setValueAtTime(0.0001, time);
    mix.gain.linearRampToValueAtTime(1, time + 0.004);
    mix.gain.exponentialRampToValueAtTime(0.0001, time + 0.38);
    sub.connect(subGain);
    body.connect(bodyGain);
    subGain.connect(filter);
    bodyGain.connect(filter);
    filter.connect(mix);
    var output = connectSfxOutput(mix, pan || 0);
    sub.start(time);
    body.start(time);
    sub.stop(time + 0.4);
    body.stop(time + 0.22);
    scheduleAudioDisconnect([sub, body, subGain, bodyGain, filter, mix, output], time + 0.46);
  }

  function playLauncherExplosionCrack(time, pan, level) {
    var ctx = audioState.ctx;
    if (!ctx || !audioState.shotNoiseBuffer) return;
    var crack = ctx.createBufferSource();
    var high = ctx.createBiquadFilter();
    var peak = ctx.createBiquadFilter();
    var gain = ctx.createGain();
    crack.buffer = audioState.shotNoiseBuffer;
    crack.playbackRate.setValueAtTime(rand(1.18, 1.38), time);
    high.type = "highpass";
    high.frequency.setValueAtTime(780, time);
    high.Q.value = 0.48;
    peak.type = "peaking";
    peak.frequency.setValueAtTime(2300, time);
    peak.Q.value = 0.9;
    peak.gain.value = 5.5;
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(level, time + 0.0015);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.06);
    crack.connect(high);
    high.connect(peak);
    peak.connect(gain);
    var output = connectSfxOutput(gain, pan || 0);
    crack.start(time, rand(0.02, 0.18));
    crack.stop(time + 0.075);
    scheduleAudioDisconnect([crack, high, peak, gain, output], time + 0.12);
  }

  function playLauncherExplosionBlastNoise(time, pan, level, scale) {
    var ctx = audioState.ctx;
    if (!ctx || !audioState.shotNoiseBuffer) return;
    var blast = ctx.createBufferSource();
    var high = ctx.createBiquadFilter();
    var low = ctx.createBiquadFilter();
    var gain = ctx.createGain();
    blast.buffer = audioState.shotNoiseBuffer;
    blast.playbackRate.setValueAtTime(rand(0.62, 0.78), time);
    high.type = "highpass";
    high.frequency.setValueAtTime(58, time);
    high.Q.value = 0.22;
    low.type = "lowpass";
    low.frequency.setValueAtTime(4200 * scale, time);
    low.frequency.exponentialRampToValueAtTime(560, time + 0.44);
    low.Q.value = 0.18;
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(level, time + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.54);
    blast.connect(high);
    high.connect(low);
    low.connect(gain);
    var output = connectSfxOutput(gain, pan || 0);
    blast.start(time, rand(0, 0.12));
    blast.stop(time + 0.62);
    scheduleAudioDisconnect([blast, high, low, gain, output], time + 0.7);
  }

  function playLauncherExplosionDebrisTail(time, pan, level, scale) {
    var ctx = audioState.ctx;
    if (!ctx || !audioState.shotNoiseBuffer) return;
    var dust = ctx.createBufferSource();
    var grit = ctx.createBufferSource();
    var dustFilter = ctx.createBiquadFilter();
    var gritFilter = ctx.createBiquadFilter();
    var dustGain = ctx.createGain();
    var gritGain = ctx.createGain();
    var mix = ctx.createGain();
    dust.buffer = audioState.shotNoiseBuffer;
    grit.buffer = audioState.shotNoiseBuffer;
    dust.playbackRate.setValueAtTime(rand(0.42, 0.55), time);
    grit.playbackRate.setValueAtTime(rand(1.52, 1.86), time);
    dustFilter.type = "bandpass";
    dustFilter.frequency.setValueAtTime(540 * scale, time);
    dustFilter.Q.value = 0.6;
    gritFilter.type = "highpass";
    gritFilter.frequency.setValueAtTime(2300, time);
    gritFilter.Q.value = 0.42;
    dustGain.gain.setValueAtTime(0.0001, time);
    dustGain.gain.linearRampToValueAtTime(0.85 * level, time + 0.026);
    dustGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.72);
    gritGain.gain.setValueAtTime(0.0001, time);
    gritGain.gain.linearRampToValueAtTime(0.26 * level, time + 0.012);
    gritGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.26);
    mix.gain.setValueAtTime(1, time);
    mix.gain.exponentialRampToValueAtTime(0.0001, time + 0.76);
    dust.connect(dustFilter);
    dustFilter.connect(dustGain);
    grit.connect(gritFilter);
    gritFilter.connect(gritGain);
    dustGain.connect(mix);
    gritGain.connect(mix);
    var output = connectSfxOutput(mix, pan || 0);
    dust.start(time, rand(0.18, 0.48));
    grit.start(time, rand(0.55, 0.9));
    dust.stop(time + 0.78);
    grit.stop(time + 0.34);
    scheduleAudioDisconnect([dust, grit, dustFilter, gritFilter, dustGain, gritGain, mix, output], time + 0.86);
  }

  function getProjectileSfxPan(position, dir, aimWeight) {
    var aimPan = dir && isFinite(dir.x) ? dir.x * (aimWeight == null ? 0.18 : aimWeight) : 0;
    var worldPan = 0;
    if (position && state.player && isFinite(position.x)) {
      worldPan = clamp((position.x - state.player.x) / 18, -0.58, 0.58);
    }
    return clamp(worldPan + aimPan, -0.76, 0.76);
  }

  function playRevolverHammerCock(time, pan, level) {
    playGunshotNoiseLayer(time, pan * 0.72, level * 0.72, 2850, 9400, 0.5, 0.001, 0.016, rand(0.58, 0.86));
    playGunshotNoiseLayer(time + 0.022, pan, level * 0.9, 1650, 7600, 0.46, 0.001, 0.023, rand(0.62, 0.94));
  }

  function playRevolverMechanics(time, pan, level) {
    var ctx = audioState.ctx;
    if (!ctx) return;
    playGunshotNoiseLayer(time, pan, level, 2400, 7600, 0.46, 0.001, 0.022, rand(0.68, 0.92));
    playGunshotNoiseLayer(time + 0.038, pan * 0.7, level * 0.42, 1500, 5400, 0.38, 0.001, 0.03, rand(0.45, 0.78));
  }

  function playRifleShotSound(position, dir, chainLightning) {
    if (!audioState.enabled) return;
    var ctx = audioState.ctx || ensureAudioContext();
    if (!ctx || ctx.state !== "running" || !audioState.sfxGain) return;
    if (!audioState.rifleShotBuffer) audioState.rifleShotBuffer = createDryRifleShotBuffer(ctx);

    var now = ctx.currentTime;
    var aimPan = dir && isFinite(dir.x) ? dir.x * 0.18 : 0;
    var pan = clamp(aimPan, -0.68, 0.68);
    var level = chainLightning ? 1.04 : 1;

    playWinchesterPowerShot(now, pan, level);
    if (chainLightning) playRifleLightningShotCharge(now + 0.006, pan, level);
  }

  function playRifleLightningShotCharge(time, pan, level) {
    var ctx = audioState.ctx;
    if (!ctx || !audioState.shotNoiseBuffer) return;
    playGunshotNoiseLayer(time, pan * 0.78, 0.22 * level, 2400, 13800, 0.88, 0.001, 0.044, rand(0.18, 0.52));
    playGunshotNoiseLayer(time + 0.018, -pan * 0.5, 0.14 * level, 3200, 11200, 1.05, 0.001, 0.038, rand(0.36, 0.68));
    playElectricToneBurst(time + 0.004, pan, 0.055 * level, 1180, 0.11, 1.4);
    playElectricToneBurst(time + 0.026, -pan * 0.6, 0.036 * level, 2380, 0.075, 1.15);
  }

  function playWinchesterPowerShot(time, pan, level) {
    var ctx = audioState.ctx;
    if (!ctx || !audioState.rifleShotBuffer) return;
    var blast = ctx.createBufferSource();
    var crack = ctx.createBufferSource();
    var blastHigh = ctx.createBiquadFilter();
    var blastLow = ctx.createBiquadFilter();
    var crackHigh = ctx.createBiquadFilter();
    var crackLow = ctx.createBiquadFilter();
    var presence = ctx.createBiquadFilter();
    var chest = ctx.createBiquadFilter();
    var noiseGain = ctx.createGain();
    var thump = ctx.createOscillator();
    var thumpFilter = ctx.createBiquadFilter();
    var thumpGain = ctx.createGain();
    var mix = ctx.createGain();
    blast.buffer = audioState.rifleShotBuffer;
    crack.buffer = audioState.rifleShotBuffer;
    blast.playbackRate.setValueAtTime(rand(0.92, 1.02), time);
    crack.playbackRate.setValueAtTime(rand(1.28, 1.44), time);
    blastHigh.type = "highpass";
    blastHigh.frequency.setValueAtTime(105, time);
    blastHigh.Q.value = 0.25;
    blastLow.type = "lowpass";
    blastLow.frequency.setValueAtTime(5200, time);
    blastLow.frequency.exponentialRampToValueAtTime(2400, time + 0.055);
    blastLow.Q.value = 0.2;
    crackHigh.type = "highpass";
    crackHigh.frequency.setValueAtTime(1850, time);
    crackHigh.Q.value = 0.5;
    crackLow.type = "lowpass";
    crackLow.frequency.setValueAtTime(10800, time);
    crackLow.Q.value = 0.24;
    presence.type = "peaking";
    presence.frequency.setValueAtTime(2100, time);
    presence.Q.value = 0.82;
    presence.gain.value = 4.8;
    chest.type = "peaking";
    chest.frequency.setValueAtTime(255, time);
    chest.Q.value = 0.72;
    chest.gain.value = 5.4;
    noiseGain.gain.setValueAtTime(0.0001, time);
    noiseGain.gain.linearRampToValueAtTime(1.08 * level, time + 0.0007);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.082);
    thump.type = "sine";
    thump.frequency.setValueAtTime(98, time);
    thump.frequency.exponentialRampToValueAtTime(46, time + 0.075);
    thumpFilter.type = "lowpass";
    thumpFilter.frequency.setValueAtTime(190, time);
    thumpFilter.frequency.exponentialRampToValueAtTime(82, time + 0.09);
    thumpFilter.Q.value = 0.22;
    thumpGain.gain.setValueAtTime(0.0001, time);
    thumpGain.gain.linearRampToValueAtTime(0.62 * level, time + 0.0025);
    thumpGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.105);
    mix.gain.setValueAtTime(0.0001, time);
    mix.gain.linearRampToValueAtTime(1, time + 0.001);
    mix.gain.exponentialRampToValueAtTime(0.0001, time + 0.12);
    blast.connect(blastHigh);
    blastHigh.connect(blastLow);
    blastLow.connect(chest);
    crack.connect(crackHigh);
    crackHigh.connect(crackLow);
    crackLow.connect(presence);
    chest.connect(presence);
    presence.connect(noiseGain);
    noiseGain.connect(mix);
    thump.connect(thumpFilter);
    thumpFilter.connect(thumpGain);
    thumpGain.connect(mix);
    var output = connectSfxOutput(mix, pan || 0);
    blast.start(time, rand(0.004, 0.032));
    crack.start(time, rand(0.001, 0.024));
    thump.start(time);
    blast.stop(time + 0.105);
    crack.stop(time + 0.04);
    thump.stop(time + 0.13);
    scheduleAudioDisconnect(
      [blast, crack, blastHigh, blastLow, crackHigh, crackLow, presence, chest, noiseGain, thump, thumpFilter, thumpGain, mix, output],
      time + 0.18
    );
  }

  function playElectricToneBurst(time, pan, level, freq, length, bend) {
    var ctx = audioState.ctx;
    if (!ctx) return;
    length = clamp(Number(length) || 0.08, 0.028, 0.18);
    bend = Math.max(0.25, Number(bend) || 1);
    var buzz = ctx.createOscillator();
    var shine = ctx.createOscillator();
    var buzzGain = ctx.createGain();
    var shineGain = ctx.createGain();
    var filter = ctx.createBiquadFilter();
    var gain = ctx.createGain();
    buzz.type = "sawtooth";
    shine.type = "square";
    buzz.frequency.setValueAtTime(freq, time);
    buzz.frequency.exponentialRampToValueAtTime(Math.max(80, freq / bend), time + length);
    shine.frequency.setValueAtTime(freq * rand(1.92, 2.22), time);
    shine.frequency.exponentialRampToValueAtTime(Math.max(140, freq * rand(1.12, 1.34)), time + length * 0.82);
    buzzGain.gain.value = 0.68;
    shineGain.gain.value = 0.12;
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(freq * 1.1, time);
    filter.Q.value = 2.2;
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(level, time + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + length);
    buzz.connect(buzzGain);
    shine.connect(shineGain);
    buzzGain.connect(filter);
    shineGain.connect(filter);
    filter.connect(gain);
    var output = connectSfxOutput(gain, pan || 0);
    buzz.start(time);
    shine.start(time + 0.001);
    buzz.stop(time + length + 0.02);
    shine.stop(time + length + 0.02);
    scheduleAudioDisconnect([buzz, shine, buzzGain, shineGain, filter, gain, output], time + length + 0.08);
  }

  function playLightningChainSound(fromX, fromZ, toX, toZ, index, total) {
    if (!audioState.enabled) return;
    var ctx = audioState.ctx || ensureAudioContext();
    if (!ctx || ctx.state !== "running" || !audioState.sfxGain) return;
    if (!audioState.shotNoiseBuffer) audioState.shotNoiseBuffer = createGunshotNoiseBuffer(ctx);
    total = Math.max(1, Math.floor(Number(total) || 1));
    index = Math.max(0, Math.floor(Number(index) || 0));
    var player = state.player;
    var centerX = (fromX + toX) * 0.5;
    var centerZ = (fromZ + toZ) * 0.5;
    var pan = player ? clamp((centerX - player.x) / 14, -0.7, 0.7) : 0;
    var distance = Math.hypot(toX - fromX, toZ - fromZ);
    var chainProgress = total <= 1 ? 0 : index / (total - 1);
    var time = ctx.currentTime + index * 0.038;
    var countBoost = clamp(total / 4, 0.65, 1.35);
    var falloff = 1 - chainProgress * 0.28;
    var level = countBoost * falloff;
    var pitch = 1640 + index * 310 + clamp(distance, 0, 16) * 22;

    playGunshotNoiseLayer(time, pan, 0.2 * level, 1850, 11800, 1.05, 0.001, 0.048, rand(0.22, 0.7));
    playGunshotNoiseLayer(time + 0.01, -pan * 0.45, 0.105 * level, 680, 6200, 0.82, 0.002, 0.072, rand(0.36, 0.78));
    playElectricToneBurst(time + 0.004, pan, 0.05 * level, pitch, 0.085, 1.7 + chainProgress * 0.35);
    if (total > 2 && index > 0) {
      playElectricToneBurst(time + 0.026, pan * 0.5, 0.022 * level, pitch * 1.8, 0.045, 1.2);
    }
  }

  function playZombieHitSound(x, z, damage, source) {
    if (!audioState.enabled || isContinuousHitSoundSource(source)) return;
    var ctx = audioState.ctx || ensureAudioContext();
    if (!ctx || ctx.state !== "running" || !audioState.sfxGain) return;
    if (!audioState.shotNoiseBuffer) audioState.shotNoiseBuffer = createGunshotNoiseBuffer(ctx);

    var now = ctx.currentTime;
    if (now - (audioState.zombieHitSfxLastAt || 0) < 0.018) return;
    if (now - (audioState.zombieHitSfxBurstWindow || 0) > 0.14) {
      audioState.zombieHitSfxBurstWindow = now;
      audioState.zombieHitSfxBurstCount = 0;
    }
    if (audioState.zombieHitSfxBurstCount >= 5) return;
    audioState.zombieHitSfxBurstCount += 1;
    audioState.zombieHitSfxLastAt = now;

    var player = state.player;
    var pan = player ? clamp((x - player.x) / 12, -0.62, 0.62) : 0;
    var impact = clamp((Number(damage) || 1) / 2.5, 0.55, 1.18);
    var level = 0.24 * impact;
    playZombieHitThump(now, pan, level * rand(0.68, 0.92));
    playGunshotNoiseLayer(now + 0.002, pan, level * 0.74, 42, 1180, 0.26, 0.0015, 0.074, rand(0.1, 0.55));
    playGunshotNoiseLayer(now + 0.012, pan * 0.72, level * 0.58, 140, 2600, 0.22, 0.002, 0.095, rand(0.24, 0.7));
    playGunshotNoiseLayer(now + 0.024, pan * 0.5, level * 0.22, 720, 3600, 0.2, 0.0015, 0.036, rand(0.45, 0.82));
  }

  function isContinuousHitSoundSource(source) {
    if (!source) return false;
    return source.type === "firePatch";
  }

  function playZombieHitThump(time, pan, level) {
    var ctx = audioState.ctx;
    if (!ctx) return;
    var thump = ctx.createOscillator();
    var filter = ctx.createBiquadFilter();
    var gain = ctx.createGain();
    thump.type = "triangle";
    thump.frequency.setValueAtTime(rand(78, 96), time);
    thump.frequency.exponentialRampToValueAtTime(rand(42, 54), time + 0.055);
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(260, time);
    filter.frequency.exponentialRampToValueAtTime(120, time + 0.08);
    filter.Q.value = 0.28;
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(level, time + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.082);
    thump.connect(filter);
    filter.connect(gain);
    var output = connectSfxOutput(gain, pan || 0);
    thump.start(time);
    thump.stop(time + 0.1);
    scheduleAudioDisconnect([thump, filter, gain, output], time + 0.13);
  }

  function connectSfxOutput(source, pan) {
    var ctx = audioState.ctx;
    var destination = audioState.sfxWarmupDestination || audioState.sfxGain || audioState.masterGain;
    if (!destination) return;
    if (ctx && typeof ctx.createStereoPanner === "function") {
      var panner = ctx.createStereoPanner();
      panner.pan.value = pan || 0;
      source.connect(panner);
      panner.connect(destination);
      return panner;
    } else {
      source.connect(destination);
    }
    return null;
  }

  function scheduleAudioDisconnect(nodes, stopAt) {
    var ctx = audioState.ctx;
    var cleanNodes = [];
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i]) cleanNodes.push(nodes[i]);
    }
    if (!cleanNodes.length) return;
    audioState.transientAudioNodeCount += cleanNodes.length;
    var delay = Math.max(80, (stopAt - (ctx ? ctx.currentTime : 0)) * 1000 + 80);
    audioState.audioDisconnectQueue.push({
      nodes: cleanNodes,
      dueAt: getAudioWallClockMs() + delay,
    });
    scheduleAudioDisconnectFlush(delay);
  }

  function getAudioWallClockMs() {
    return typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
  }

  function scheduleAudioDisconnectFlush(delayMs) {
    if (audioState.audioDisconnectTimer) return;
    audioState.audioDisconnectTimer = window.setTimeout(flushAudioDisconnectQueue, Math.max(8, Math.min(delayMs || AUDIO_DISCONNECT_TICK_MS, 250)));
  }

  function flushAudioDisconnectQueue() {
    audioState.audioDisconnectTimer = null;
    var queue = audioState.audioDisconnectQueue;
    if (!queue.length) return;
    var now = getAudioWallClockMs();
    var disconnected = 0;
    var nextDue = Infinity;
    var readIndex = 0;
    var writeIndex = 0;
    for (; readIndex < queue.length && disconnected < AUDIO_DISCONNECT_BATCH_SIZE; readIndex++) {
      var item = queue[readIndex];
      if (item.dueAt > now) {
        if (item.dueAt < nextDue) nextDue = item.dueAt;
        queue[writeIndex++] = item;
        continue;
      }
      for (var n = 0; n < item.nodes.length; n++) {
        try {
          item.nodes[n].disconnect();
        } catch (err) {}
      }
      disconnected += item.nodes.length;
      audioState.transientAudioNodeCount = Math.max(0, audioState.transientAudioNodeCount - item.nodes.length);
    }
    while (readIndex < queue.length) queue[writeIndex++] = queue[readIndex++];
    queue.length = writeIndex;
    if (!queue.length) return;
    var hasDue = false;
    for (var q = 0; q < queue.length; q++) {
      if (queue[q].dueAt <= now) hasDue = true;
      else if (queue[q].dueAt < nextDue) nextDue = queue[q].dueAt;
    }
    scheduleAudioDisconnectFlush(hasDue ? AUDIO_DISCONNECT_TICK_MS : Math.max(8, nextDue - now));
  }

  function connectGameOutput(source, destination, pan) {
    var ctx = audioState.ctx;
    if (ctx && typeof ctx.createStereoPanner === "function") {
      var panner = ctx.createStereoPanner();
      panner.pan.value = pan || 0;
      source.connect(panner);
      panner.connect(destination || audioState.gameExploreGain);
      return panner;
    } else {
      source.connect(destination || audioState.gameExploreGain);
    }
    return null;
  }

  function stopGameMusicNodes(stopAt) {
    var nodes = audioState.game.nodes.splice(0);
    nodes.forEach(function (node) {
      try {
        node.stop(stopAt);
      } catch (err) {}
    });
    scheduleAudioDisconnect(nodes, stopAt);
  }

  function startMenuMusicBed(now) {
    var ctx = audioState.ctx;
    if (!ctx) return;

    createMenuDrone(55, 0.046, -9, now);
    createMenuDrone(82.41, 0.026, 5, now);
  }

  function createMenuDrone(freq, level, detune, now) {
    var ctx = audioState.ctx;
    var osc = ctx.createOscillator();
    var filter = ctx.createBiquadFilter();
    var gain = ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.value = freq;
    osc.detune.value = detune || 0;
    filter.type = "lowpass";
    filter.frequency.value = 360;
    filter.Q.value = 0.7;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(level, now + 2.4);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(audioState.menuGain);
    osc.start(now);
    audioState.menu.nodes.push(osc, filter, gain);
  }

  function scheduleMenuMusic() {
    var ctx = audioState.ctx;
    if (!ctx || !audioState.menu.active || state.mode !== "menu") return;
    var stepTime = 60 / audioState.menu.tempo / 2;
    var lookahead = 0.38;
    while (audioState.menu.nextStepTime < ctx.currentTime + lookahead) {
      scheduleMenuMusicStep(audioState.menu.nextStepTime, audioState.menu.step);
      audioState.menu.nextStepTime += stepTime;
      audioState.menu.step += 1;
    }
  }

  function scheduleMenuMusicStep(time, step) {
    var index = step % 32;
    var bar = Math.floor(step / 16) % 4;
    var bassNotes = [55, 55, 65.41, 49, 55, 82.41, 73.42, 65.41];
    if (index % 4 === 0) playMenuBass(time, bassNotes[(step / 4) % bassNotes.length | 0], index === 0 ? 0.15 : 0.112);
    if (index % 4 === 2) playMenuKick(time, index % 8 === 2 ? 0.07 : 0.05);
    if (index === 0 || index === 16) playMenuDustBell(time, bar % 2 ? 293.66 : 329.63);
    if (index % 8 === 6) playMenuPercussion(time, 0.06, 1120);
    if (index === 3 || index === 11 || index === 19 || index === 27) playMenuPercussion(time, 0.032, 540);
    if (index === 14 || index === 30) playMenuPercussion(time, 0.07, 1460);

    var melody = [
      null,
      220,
      261.63,
      null,
      329.63,
      null,
      293.66,
      261.63,
      220,
      null,
      196,
      220,
      null,
      261.63,
      329.63,
      null,
      null,
      220,
      293.66,
      329.63,
      null,
      392,
      329.63,
      293.66,
      261.63,
      null,
      220,
      196,
      null,
      220,
      261.63,
      null,
    ];
    var note = melody[index];
    if (note) {
      var pan = index % 8 < 4 ? -0.22 : 0.2;
      playMenuPluck(time, note, index % 8 === 1 ? 0.095 : 0.07, pan, 0.82);
      if (index === 5 || index === 21) playMenuPluck(time + 0.045, note * 1.5, 0.036, -pan, 0.46);
    }
    if (index % 4 === 1 || index % 4 === 3) {
      playMenuPluck(time + 0.018, index % 8 < 4 ? 110 : 146.83, 0.026, index % 8 < 4 ? -0.12 : 0.14, 0.22);
    }
  }

  function playMenuKick(time, level) {
    var ctx = audioState.ctx;
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(96, time);
    osc.frequency.exponentialRampToValueAtTime(48, time + 0.16);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(level, time + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.24);
    osc.connect(gain);
    gain.connect(audioState.menuGain);
    osc.start(time);
    osc.stop(time + 0.28);
    scheduleAudioDisconnect([osc, gain], time + 0.36);
  }

  function playMenuBass(time, freq, level) {
    var ctx = audioState.ctx;
    var osc = ctx.createOscillator();
    var filter = ctx.createBiquadFilter();
    var gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(freq, time);
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(440, time);
    filter.frequency.exponentialRampToValueAtTime(150, time + 0.42);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(level, time + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.68);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(audioState.menuGain);
    osc.start(time);
    osc.stop(time + 0.74);
    scheduleAudioDisconnect([osc, filter, gain], time + 0.84);
  }

  function playMenuPluck(time, freq, level, pan, length) {
    var ctx = audioState.ctx;
    var osc = ctx.createOscillator();
    var filter = ctx.createBiquadFilter();
    var gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(freq, time);
    osc.detune.setValueAtTime(rand(-5, 5), time);
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(1800, time);
    filter.frequency.exponentialRampToValueAtTime(520, time + Math.max(0.08, length * 0.7));
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(level, time + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + length);
    osc.connect(filter);
    var output = connectMenuAudioNode(filter, gain, pan);
    osc.start(time);
    osc.stop(time + length + 0.04);
    scheduleAudioDisconnect([osc, filter, gain, output], time + length + 0.12);
  }

  function playMenuDustBell(time, freq) {
    var ctx = audioState.ctx;
    playMenuPluck(time, freq * 2, 0.032, 0.26, 1.9);
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq * 3, time + 0.01);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(0.022, time + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 2.2);
    osc.connect(gain);
    var output = connectMenuOutput(gain, -0.18);
    osc.start(time);
    osc.stop(time + 2.25);
    scheduleAudioDisconnect([osc, gain, output], time + 2.35);
  }

  function playMenuPercussion(time, level, centerFreq) {
    var ctx = audioState.ctx;
    if (!audioState.noiseBuffer) return;
    var src = ctx.createBufferSource();
    var filter = ctx.createBiquadFilter();
    var gain = ctx.createGain();
    src.buffer = audioState.noiseBuffer;
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(centerFreq, time);
    filter.Q.value = 2.2;
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(level, time + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.18);
    src.connect(filter);
    filter.connect(gain);
    var output = connectMenuOutput(gain, rand(-0.18, 0.18));
    src.start(time);
    src.stop(time + 0.2);
    scheduleAudioDisconnect([src, filter, gain, output], time + 0.28);
  }

  function connectMenuAudioNode(source, gain, pan) {
    source.connect(gain);
    return connectMenuOutput(gain, pan);
  }

  function connectMenuOutput(source, pan) {
    var ctx = audioState.ctx;
    if (ctx && typeof ctx.createStereoPanner === "function") {
      var panner = ctx.createStereoPanner();
      panner.pan.value = pan || 0;
      source.connect(panner);
      panner.connect(audioState.menuGain);
      return panner;
    } else {
      source.connect(audioState.menuGain);
    }
    return null;
  }

  function stopMenuMusicNodes(stopAt) {
    var nodes = audioState.menu.nodes.splice(0);
    nodes.forEach(function (node) {
      try {
        node.stop(stopAt);
      } catch (err) {}
    });
    scheduleAudioDisconnect(nodes, stopAt);
  }

  function updateMenuMusicButton() {
    if (!menuMusicBtn) return;
    var supported = !!getAudioContextConstructor();
    var running = audioState.ctx && audioState.ctx.state === "running";
    var audible = supported && audioState.enabled && audioState.menu.active && running;
    menuMusicBtn.disabled = !supported;
    menuMusicBtn.classList.toggle("is-muted", !audioState.enabled);
    menuMusicBtn.classList.toggle("is-pending", supported && audioState.enabled && !audible);
    menuMusicBtn.setAttribute("aria-pressed", audioState.enabled ? "true" : "false");
    menuMusicBtn.setAttribute("aria-label", audioState.enabled ? "Mute menu music" : "Enable menu music");
    menuMusicBtn.title = audioState.enabled ? "Mute menu music" : "Enable menu music";
  }

  function getAudioDiagnostics() {
    var gameDanger = getGameplayMusicDanger();
    return {
      supportsWebAudio: !!getAudioContextConstructor(),
      enabled: audioState.enabled,
      unlocked: audioState.unlocked,
      desired: audioState.menu.desired,
      gameDesired: audioState.game.desired,
      menuActive: audioState.menu.active,
      gameActive: audioState.game.active,
      introActive: isIntroActive(),
      contextState: audioState.ctx ? audioState.ctx.state : "none",
      schedulerActive: !!audioState.menu.scheduler,
      gameSchedulerActive: !!audioState.game.scheduler,
      tempo: audioState.menu.tempo,
      gameTempo: audioState.game.tempo,
      volume: MENU_MUSIC_VOLUME * clamp(audioState.musicVolume, 0, 2),
      gameVolume: GAME_MUSIC_VOLUME * clamp(audioState.musicVolume, 0, 2),
      musicVolume: clamp(audioState.musicVolume, 0, 2),
      sfxVolume: clamp(audioState.sfxVolume, 0, 2),
      menuNodeCount: audioState.menu.nodes.length,
      gameNodeCount: audioState.game.nodes.length,
      transientAudioNodeCount: audioState.transientAudioNodeCount,
      pendingAudioDisconnectGroups: audioState.audioDisconnectQueue.length,
      pendingLauncherExplosionAudioGroups: audioState.launcherExplosionAudioGroups.length,
      launcherExplosionAudioGraphReady: !!audioState.launcherExplosionAudioGraphReady,
      launcherExplosionAudioStats: {
        grouped: audioState.launcherExplosionAudioStats.grouped,
        mergedGroups: audioState.launcherExplosionAudioStats.mergedGroups,
        fullPlayed: audioState.launcherExplosionAudioStats.fullPlayed,
        compactPlayed: audioState.launcherExplosionAudioStats.compactPlayed,
      },
      launcherWhistleCount: audioState.launcherWhistleCount,
      gameDanger: Number(gameDanger.toFixed(3)),
      gameBattleTarget: Number(audioState.game.battleTarget.toFixed(3)),
      gameBattleAmount: Number(audioState.game.battleAmount.toFixed(3)),
      hasMenuButton: !!menuMusicBtn,
      hasNoiseBuffer: !!audioState.noiseBuffer,
    };
  }

  function clearDynamic() {
    while (dynamicRoot.children.length) {
      var child = dynamicRoot.children[0];
      if (child.userData && child.userData.pooledZombie && child.userData.pooledZombie.pooled) {
        releaseZombieToPool(child.userData.pooledZombie);
      } else if (child.userData && child.userData.pooledPaleDeputy) {
        releasePaleDeputyEntity(child.userData.pooledPaleDeputy);
      } else {
        removeObject3D(child);
      }
    }
    while (effectRoot.children.length) {
      var effectChild = effectRoot.children[0];
      if (effectChild.userData && effectChild.userData.firePatchVisual) {
        releaseFirePatchVisual(effectChild.userData.firePatchVisual);
      } else if (effectChild.userData && effectChild.userData.marshalHallowedVisual) {
        releaseMarshalHallowedVisual(effectChild.userData.marshalHallowedVisual);
      } else if (effectChild.userData && effectChild.userData.rifleTrapVisual) {
        releaseRifleTrapVisual(effectChild.userData.rifleTrapVisual);
      } else if (effectChild.userData && effectChild.userData.particleVisual) {
        releaseParticleVisual(effectChild.userData.particleVisual);
      } else if (effectChild.userData && effectChild.userData.particleBatch) {
        detachParticleInstancedBatch(effectChild.userData.particleBatch);
      } else if (effectChild.userData && effectChild.userData.projectileStandardBatch) {
        detachStandardProjectileBatch(effectChild.userData.projectileStandardBatch);
      } else if (effectChild.userData && effectChild.userData.xpOrbVisual) {
        releaseXpOrbVisual(effectChild.userData.xpOrbVisual);
      } else if (effectChild.userData && effectChild.userData.deathDebrisVisual) {
        releaseDeathDebrisVisual(effectChild.userData.deathDebrisVisual);
      } else if (effectChild.userData && effectChild.userData.projectileVisual) {
        releaseProjectileVisual(effectChild.userData.projectileVisual);
      } else if (effectChild.userData && effectChild.userData.shockwaveVisual) {
        releaseShockwaveVisual(effectChild.userData.shockwaveVisual);
      } else if (effectChild.userData && effectChild.userData.smokePuffVisual) {
        releaseSmokePuffVisual(effectChild.userData.smokePuffVisual);
      } else if (effectChild.userData && effectChild.userData.scorchDecalVisual) {
        releaseScorchDecalVisual(effectChild.userData.scorchDecalVisual);
      } else if (effectChild.isLight && effectChild.userData && effectChild.userData.lightFlashVisual) {
        releaseLightFlashVisual(effectChild.userData.lightFlashVisual);
      } else {
        removeObject3D(effectChild);
      }
    }
  }

  function createCowboy() {
    var g = new THREE.Group();
    g.name = "blocky cowboy";
    addContactShadow(g, 1.95, 1.55, 0.2);
    var leftLeg = rememberBase(addBox(g, 0.7, 0.55, 0.62, mats.denim, -0.24, 0.45, 0));
    var rightLeg = rememberBase(addBox(g, 0.7, 0.55, 0.62, mats.denim, 0.24, 0.45, 0));
    var leftBoot = rememberBase(addBox(g, 0.7, 0.25, 0.78, mats.black, -0.24, 0.15, 0.04));
    var rightBoot = rememberBase(addBox(g, 0.7, 0.25, 0.78, mats.black, 0.24, 0.15, 0.04));
    var torso = rememberBase(addBox(g, 1.08, 1.12, 0.72, mats.playerCoat, 0, 1.15, 0));
    var shirt = rememberBase(addBox(g, 0.68, 0.92, 0.76, mats.playerShirt, 0, 1.23, 0.05));
    var leftArm = rememberBase(addBox(g, 0.34, 0.92, 0.34, mats.playerSkin, -0.72, 1.17, 0.07));
    var rightArm = rememberBase(addBox(g, 0.34, 0.92, 0.34, mats.playerSkin, 0.72, 1.17, 0.07));
    var head = rememberBase(addBox(g, 0.95, 0.74, 0.9, mats.playerSkin, 0, 2.03, 0));
    var hatBrim = rememberBase(addBox(g, 1.42, 0.18, 1.35, mats.playerHat, 0, 2.44, 0));
    var hatTop = rememberBase(addBox(g, 0.78, 0.42, 0.76, mats.playerHat, 0, 2.7, 0));
    var leftEye = rememberBase(addBox(g, 0.12, 0.1, 0.12, mats.black, -0.2, 2.1, 0.46));
    var rightEye = rememberBase(addBox(g, 0.12, 0.1, 0.12, mats.black, 0.2, 2.1, 0.46));
    var moustache = rememberBase(addBox(g, 0.54, 0.12, 0.12, mats.black, 0, 1.9, 0.48));
    var weaponRig = new THREE.Group();
    weaponRig.position.set(0.76, 1.27, 0.28);
    rememberBase(weaponRig);
    g.add(weaponRig);
    var rightHand = rememberBase(addBox(weaponRig, 0.36, 0.26, 0.32, mats.playerSkin, 0.1, 0, 0.2));
    var revolverParts = [
      rememberBase(addBox(weaponRig, 0.16, 0.16, 0.8, mats.metal, 0.12, 0.03, 0.46)),
      rememberBase(addBox(weaponRig, 0.24, 0.24, 0.28, mats.black, 0.08, 0, 0.08)),
    ];
    var offhandWeaponRig = new THREE.Group();
    offhandWeaponRig.position.set(-0.76, 1.27, 0.28);
    rememberBase(offhandWeaponRig);
    g.add(offhandWeaponRig);
    var leftHand = rememberBase(addBox(offhandWeaponRig, 0.36, 0.26, 0.32, mats.playerSkin, -0.1, 0, 0.2));
    var offhandRevolverParts = [
      leftHand,
      rememberBase(addBox(offhandWeaponRig, 0.16, 0.16, 0.8, mats.metal, -0.12, 0.03, 0.46)),
      rememberBase(addBox(offhandWeaponRig, 0.24, 0.24, 0.28, mats.black, -0.08, 0, 0.08)),
    ];
    var rifleParts = [
      rememberBase(addBox(weaponRig, 0.16, 0.14, 1.42, mats.metal, 0.11, 0.06, 0.82)),
      rememberBase(addBox(weaponRig, 0.32, 0.2, 0.56, mats.wood, 0.01, -0.01, 0.12)),
      rememberBase(addBox(weaponRig, 0.11, 0.11, 0.42, mats.black, 0.1, 0.23, 0.52)),
    ];
    var launcherParts = [
      rememberBase(addBox(weaponRig, 0.44, 0.36, 1.16, mats.grenade, 0.12, 0.09, 0.72)),
      rememberBase(addBox(weaponRig, 0.54, 0.44, 0.26, mats.black, 0.12, 0.09, 1.28)),
      rememberBase(addBox(weaponRig, 0.2, 0.16, 0.42, mats.metal, -0.05, -0.08, 0.15)),
    ];
    var coachGunParts = [
      rememberBase(addSharedBox(weaponRig, 0.11, 0.1, 1.34, mats.metal, 0.035, 0.1, 0.98)),
      rememberBase(addSharedBox(weaponRig, 0.11, 0.1, 1.34, mats.metal, 0.185, 0.1, 0.98)),
      rememberBase(addSharedBox(weaponRig, 0.34, 0.25, 0.34, mats.black, 0.11, 0.03, 0.35)),
      rememberBase(addSharedBox(weaponRig, 0.4, 0.24, 0.58, mats.wood, 0.04, -0.04, 0.02)),
      rememberBase(addSharedBox(weaponRig, 0.29, 0.16, 0.42, mats.wood, 0.11, 0.015, 0.7)),
      rememberBase(addSharedBox(weaponRig, 0.06, 0.11, 0.08, mats.rifleTracer, 0.11, 0.19, 1.63)),
    ];
    var breachCoachGunParts = [
      rememberBase(addSharedBox(weaponRig, 0.14, 0.12, 0.84, mats.metal, 0.025, 0.1, 0.74)),
      rememberBase(addSharedBox(weaponRig, 0.14, 0.12, 0.84, mats.metal, 0.195, 0.1, 0.74)),
      rememberBase(addSharedBox(weaponRig, 0.38, 0.29, 0.38, mats.black, 0.11, 0.03, 0.34)),
      rememberBase(addSharedBox(weaponRig, 0.4, 0.24, 0.54, mats.wood, 0.04, -0.04, 0.02)),
      rememberBase(addSharedBox(weaponRig, 0.31, 0.18, 0.3, mats.wood, 0.11, 0.015, 0.58)),
      rememberBase(addSharedBox(weaponRig, 0.36, 0.2, 0.08, mats.black, 0.11, 0.1, 1.16)),
    ];
    var graveCoachGunParts = [
      rememberBase(addSharedBox(weaponRig, 0.09, 0.08, 1.62, mats.metal, 0.05, 0.1, 1.12)),
      rememberBase(addSharedBox(weaponRig, 0.09, 0.08, 1.62, mats.metal, 0.17, 0.1, 1.12)),
      rememberBase(addSharedBox(weaponRig, 0.3, 0.23, 0.34, mats.black, 0.11, 0.03, 0.34)),
      rememberBase(addSharedBox(weaponRig, 0.38, 0.22, 0.6, mats.wood, 0.04, -0.04, 0.01)),
      rememberBase(addSharedBox(weaponRig, 0.24, 0.13, 0.52, mats.wood, 0.11, 0.015, 0.79)),
      rememberBase(addSharedBox(weaponRig, 0.05, 0.13, 0.07, mats.rifleTracer, 0.11, 0.2, 1.92)),
      rememberBase(addSharedBox(weaponRig, 0.18, 0.04, 0.18, mats.gold, 0.11, 0.2, 0.42)),
    ];
    var leftHolster = rememberBase(addBox(g, 0.22, 0.2, 0.34, mats.metal, -0.58, 0.95, -0.45));
    var rightHolster = rememberBase(addBox(g, 0.16, 0.16, 0.44, mats.metal, 0.58, 0.95, -0.45));
    var belt = rememberBase(addBox(g, 1.2, 0.12, 0.12, mats.black, 0, 1.2, 0.42));
    var scarf = rememberBase(addBox(g, 0.34, 0.18, 0.14, mats.zombieBlood, 0, 1.55, 0.48));
    g.userData.weaponMeshes = {
      revolver: revolverParts,
      rifle: rifleParts,
      launcher: launcherParts,
      coachGun: coachGunParts,
      coachGunBreach: breachCoachGunParts,
      coachGunGrave: graveCoachGunParts,
      dualRevolvers: offhandRevolverParts,
    };
    g.userData.animParts = {
      leftLeg: leftLeg,
      rightLeg: rightLeg,
      leftBoot: leftBoot,
      rightBoot: rightBoot,
      torso: torso,
      shirt: shirt,
      leftArm: leftArm,
      rightArm: rightArm,
      head: head,
      hatBrim: hatBrim,
      hatTop: hatTop,
      leftEye: leftEye,
      rightEye: rightEye,
      moustache: moustache,
      rightHand: rightHand,
      leftHand: leftHand,
      belt: belt,
      scarf: scarf,
      leftHolster: leftHolster,
      rightHolster: rightHolster,
    };
    g.userData.weaponRig = weaponRig;
    g.userData.offhandWeaponRig = offhandWeaponRig;
    setWeaponMeshes(g, "revolver");
    return g;
  }

  function startWave(wave) {
    state.wave = wave;
    state.waveSuspended = false;
    state.waveSpawnTarget = getWaveZombieCount(wave);
    state.waveElapsed = 0;
    state.waveLowRemainingTimer = 0;
    state.spawnLeft = state.waveSpawnTarget;
    state.spawnTimer = 0.2;
    state.spawnInterval = getWaveSpawnInterval(wave);
    state.zombieSpawnSideCursor = Math.max(0, Math.floor(Number(wave) || 1) - 1) % 4;
    state.zombieTeleportSideCursor = (state.zombieSpawnSideCursor + 2) % 4;
    state.nextWaveTimer = 0;
    updateHud();
  }

  function getWaveZombieCount(wave) {
    var lvl = Math.max(1, Math.floor(Number(wave) || 1));
    return (5 + lvl * 2) * getWaveZombieMultiplier(lvl);
  }

  function getWaveZombieMultiplier(wave) {
    var lvl = Math.max(1, Math.floor(Number(wave) || 1));
    if (lvl > 15) return ZOMBIES_PER_WAVE_AFTER_15_MULTIPLIER;
    if (lvl > 9) return ZOMBIES_PER_WAVE_AFTER_9_MULTIPLIER;
    if (lvl > 4) return ZOMBIES_PER_WAVE_AFTER_4_MULTIPLIER;
    return ZOMBIES_PER_WAVE_MULTIPLIER;
  }

  function getWaveSpawnInterval(wave) {
    var lvl = Math.max(1, Math.floor(Number(wave) || 1));
    if (lvl <= 4) return Math.max(0.42, 1.02 - lvl * 0.055);
    return clamp(0.62 - (lvl - 4) * 0.035, 0.22, 0.62);
  }

  function getWaveSpawnBatchSize(wave) {
    var lvl = Math.max(1, Math.floor(Number(wave) || 1));
    if (lvl > 15) return ZOMBIE_SPAWN_BATCH_AFTER_15;
    if (lvl > 4) return ZOMBIE_SPAWN_BATCH_AFTER_4;
    return 1;
  }

  function spawnZombie() {
    var type = chooseZombieType();
    var zombie = acquireZombie(type);
    var spawn = findZombieSpawnPoint(zombie.radius, { preferredSides: chooseZombieSurroundSides("spawn") });
    zombie.x = spawn.x;
    zombie.z = spawn.z;
    zombie.spawnSide = spawn.side;
    rememberZombieSurroundSide("spawn", spawn.side);
    zombie.group.position.set(zombie.x, 0, zombie.z);
    state.enemies.push(zombie);
    dynamicRoot.add(zombie.group);
    zombieSpatialDirty = true;
    addSpawnDust(zombie.x, zombie.z);
  }

  function chooseZombieType() {
    var type = "walker";
    var spitterChance = state.wave >= 8 ? ACID_SPITTER_CHANCE_LATE : ACID_SPITTER_CHANCE;
    if (state.wave >= ACID_SPITTER_START_WAVE && rng() < spitterChance) return "spitter";
    if (state.wave >= FAST_ZOMBIE_START_WAVE && rng() < (state.wave >= 15 ? FAST_ZOMBIE_CHANCE_LATE : FAST_ZOMBIE_CHANCE)) return "fastZombie";
    if (rng() < 0.22) type = "runner";
    if (state.wave >= 5 && rng() < 0.18) type = "brute";
    return type;
  }

  function findZombieSpawnPoint(radius, options) {
    var strict = options && options.strict;
    var sideOrder = getZombieSpawnSideOrder(options);
    var rect = options && options.visibleGround ? options.visibleGround : getCurrentVisibleGroundRect();
    var minX = -ARENA_W / 2 - ENEMY_BOUNDS_EXTRA + radius;
    var maxX = ARENA_W / 2 + ENEMY_BOUNDS_EXTRA - radius;
    var minZ = -ARENA_D / 2 - ENEMY_BOUNDS_EXTRA + radius;
    var maxZ = ARENA_D / 2 + ENEMY_BOUNDS_EXTRA - radius;
    var outsidePad = Math.max(3.65, radius + 0.65);
    var attemptsPerSide = 44;
    for (var orderIndex = 0; orderIndex < sideOrder.length; orderIndex++) {
      var side = sideOrder[orderIndex];
      for (var attempt = 0; attempt < attemptsPerSide; attempt++) {
        var margin = rand(ZOMBIE_SPAWN_VIEW_MARGIN_MIN, ZOMBIE_SPAWN_VIEW_MARGIN_MAX);
        var x = 0;
        var z = 0;
        if (side === 0) {
          x = rand(rect.minX + radius, rect.maxX - radius);
          z = rect.minZ - margin;
        } else if (side === 1) {
          x = rand(rect.minX + radius, rect.maxX - radius);
          z = rect.maxZ + margin;
        } else if (side === 2) {
          x = rect.minX - margin;
          z = rand(rect.minZ + radius, rect.maxZ - radius);
        } else {
          x = rect.maxX + margin;
          z = rand(rect.minZ + radius, rect.maxZ - radius);
        }
        x = clamp(x, minX, maxX);
        z = clamp(z, minZ, maxZ);
        if (!isSafeZombieSpawnPoint(x, z, radius, rect, outsidePad)) continue;
        return { x: x, z: z, side: side };
      }
    }
    return findFallbackZombieSpawnPoint(radius, rect, strict, sideOrder);
  }

  function findFallbackZombieSpawnPoint(radius, rect, strict, sideOrder) {
    var minX = -ARENA_W / 2 - ENEMY_BOUNDS_EXTRA + radius;
    var maxX = ARENA_W / 2 + ENEMY_BOUNDS_EXTRA - radius;
    var minZ = -ARENA_D / 2 - ENEMY_BOUNDS_EXTRA + radius;
    var maxZ = ARENA_D / 2 + ENEMY_BOUNDS_EXTRA - radius;
    var outsidePad = Math.max(radius * 0.5, 0.3);
    var candidates = [
      { x: clamp((rect.minX + rect.maxX) / 2, minX, maxX), z: minZ, side: 0 },
      { x: clamp((rect.minX + rect.maxX) / 2, minX, maxX), z: maxZ, side: 1 },
      { x: minX, z: clamp((rect.minZ + rect.maxZ) / 2, minZ, maxZ), side: 2 },
      { x: maxX, z: clamp((rect.minZ + rect.maxZ) / 2, minZ, maxZ), side: 3 },
    ];
    var order = sideOrder && sideOrder.length ? sideOrder : getZombieSpawnSideOrder(null);
    for (var i = 0; i < order.length; i++) {
      var c = candidates[order[i]];
      if (isSafeZombieSpawnPoint(c.x, c.z, radius, rect, outsidePad)) return c;
    }
    if (strict) return null;
    return candidates[order[0]];
  }

  function getZombieSpawnSideOrder(options) {
    var order = [];
    if (options && Array.isArray(options.preferredSides)) {
      for (var i = 0; i < options.preferredSides.length; i++) {
        var side = Math.floor(Number(options.preferredSides[i]));
        if (side >= 0 && side < 4 && order.indexOf(side) === -1) order.push(side);
      }
    }
    if (order.length === 0) {
      var preferredSide = options && typeof options.preferredSide === "number" ? Math.floor(options.preferredSide) : Math.floor(rng() * 4);
      preferredSide = ((preferredSide % 4) + 4) % 4;
      for (var j = 0; j < 4; j++) order.push((preferredSide + j) % 4);
    } else {
      for (var fill = 0; fill < 4; fill++) {
        if (order.indexOf(fill) === -1) order.push(fill);
      }
    }
    return order.slice(0, 4);
  }

  function chooseZombieSurroundSide(kind, ignoreEnemy) {
    return chooseZombieSurroundSides(kind, ignoreEnemy)[0];
  }

  function chooseZombieSurroundSides(kind, ignoreEnemy, visibleGround, cachedCounts) {
    var rect = visibleGround || getCurrentVisibleGroundRect();
    var counts;
    if (cachedCounts) {
      counts = [cachedCounts[0], cachedCounts[1], cachedCounts[2], cachedCounts[3]];
      if (ignoreEnemy && ignoreEnemy.spawnSide >= 0 && ignoreEnemy.spawnSide < 4) counts[ignoreEnemy.spawnSide] -= 1;
    } else {
      counts = getZombieSurroundSideCounts(rect, ignoreEnemy);
    }
    var key = kind === "teleport" ? "zombieTeleportSideCursor" : "zombieSpawnSideCursor";
    var start = Math.max(0, Math.floor(state[key] || 0)) % 4;
    return [0, 1, 2, 3].sort(function (a, b) {
      if (counts[a] !== counts[b]) return counts[a] - counts[b];
      return getCircularSideOffset(a, start) - getCircularSideOffset(b, start);
    });
  }

  function rememberZombieSurroundSide(kind, side) {
    var key = kind === "teleport" ? "zombieTeleportSideCursor" : "zombieSpawnSideCursor";
    state[key] = (((Math.floor(Number(side)) || 0) + 1) % 4 + 4) % 4;
  }

  function getCircularSideOffset(side, start) {
    return (side - start + 4) % 4;
  }

  function getZombieSurroundSideCounts(rect, ignoreEnemy) {
    var counts = [0, 0, 0, 0];
    var r = rect || getCurrentVisibleGroundRect();
    for (var i = 0; i < state.enemies.length; i++) {
      var enemy = state.enemies[i];
      if (enemy === ignoreEnemy) continue;
      var side = enemy.spawnSide === undefined || enemy.spawnSide === null ? getZombieSideForPoint(enemy.x, enemy.z, r) : enemy.spawnSide;
      counts[side] += 1;
    }
    return counts;
  }

  function getZombieSideForPoint(x, z, rect) {
    var r = rect || getCurrentVisibleGroundRect();
    var dx = x - r.targetX;
    var dz = z - r.targetZ;
    if (Math.abs(dz) >= Math.abs(dx)) return dz < 0 ? 0 : 1;
    return dx < 0 ? 2 : 3;
  }

  function getCurrentVisibleGroundRect(out) {
    var p = state.player;
    var follow = clampCameraTarget(p ? p.x : 0, p ? p.z : 0, visibleGroundFollowScratch);
    var result = out || {};
    result.minX = follow.x + cameraGroundBounds.minX;
    result.maxX = follow.x + cameraGroundBounds.maxX;
    result.minZ = follow.z + cameraGroundBounds.minZ;
    result.maxZ = follow.z + cameraGroundBounds.maxZ;
    result.targetX = follow.x;
    result.targetZ = follow.z;
    return result;
  }

  function pointOutsideVisibleGround(x, z, pad, rect) {
    var r = rect || getCurrentVisibleGroundRect();
    var p = pad || 0;
    return x < r.minX - p || x > r.maxX + p || z < r.minZ - p || z > r.maxZ + p;
  }

  function isSafeZombieSpawnPoint(x, z, radius, visibleGround, outsidePad) {
    return (
      pointInsideEnemyBounds(x, z, radius) &&
      pointOutsideVisibleGround(x, z, outsidePad || 0, visibleGround) &&
      !pointHitsObstacle(x, z, radius + 0.16) &&
      hasClearZombieStep(x, z, radius)
    );
  }

  function hasClearZombieStep(x, z, radius) {
    var step = Math.max(1.2, radius + 1.05);
    for (var i = 0; i < 8; i++) {
      var angle = (Math.PI * 2 * i) / 8;
      var nx = x + Math.cos(angle) * step;
      var nz = z + Math.sin(angle) * step;
      if (pointInsideEnemyBounds(nx, nz, radius) && !pointHitsObstacle(nx, nz, radius + 0.08)) return true;
    }
    return false;
  }

  function createZombiePoolBuckets() {
    return {
      walker: [],
      runner: [],
      fastZombie: [],
      brute: [],
      spitter: [],
    };
  }

  function createZombiePoolCounterBuckets() {
    return {
      walker: 0,
      runner: 0,
      fastZombie: 0,
      brute: 0,
      spitter: 0,
    };
  }

  function initZombiePools() {
    Object.keys(ZOMBIE_POOL_PREWARM).forEach(function (type) {
      prewarmZombiePool(type, ZOMBIE_POOL_PREWARM[type]);
    });
  }

  function initPaleDeputyPool() {
    while (paleDeputyPool.length < PALE_DEPUTY_MAX_COUNT) {
      paleDeputyPool.push(createPaleDeputyEntity());
    }
  }

  function createPaleDeputyEntity() {
    var group = new THREE.Group();
    group.name = "pale deputy revenant";
    addContactShadow(group, 1.72, 1.42, 0.17);

    var outerSeal = new THREE.Mesh(
      getSharedGeometry("pale-deputy-outer-seal", function () {
        return new THREE.RingGeometry(0.78, 0.93, 40);
      }),
      mats.paleDeputySeal
    );
    outerSeal.rotation.x = -Math.PI / 2;
    outerSeal.position.y = 0.075;
    outerSeal.castShadow = false;
    outerSeal.receiveShadow = false;
    outerSeal.renderOrder = 3;
    outerSeal.userData.disposeGeometry = false;
    outerSeal.userData.noDebris = true;
    rememberBase(outerSeal);
    group.add(outerSeal);

    var innerSeal = new THREE.Mesh(
      getSharedGeometry("pale-deputy-inner-seal", function () {
        return new THREE.RingGeometry(0.34, 0.43, 32);
      }),
      mats.paleDeputySealGold
    );
    innerSeal.rotation.x = -Math.PI / 2;
    innerSeal.position.y = 0.082;
    innerSeal.castShadow = false;
    innerSeal.receiveShadow = false;
    innerSeal.renderOrder = 4;
    innerSeal.userData.disposeGeometry = false;
    innerSeal.userData.noDebris = true;
    rememberBase(innerSeal);
    group.add(innerSeal);

    var sealMarkers = [];
    for (var markerIndex = 0; markerIndex < 4; markerIndex++) {
      var markerAngle = markerIndex * Math.PI / 2;
      var marker = rememberBase(addSharedBox(
        group,
        markerIndex % 2 ? 0.08 : 0.28,
        0.035,
        markerIndex % 2 ? 0.28 : 0.08,
        markerIndex % 2 ? mats.paleDeputySeal : mats.paleDeputySealGold,
        Math.sin(markerAngle) * 0.62,
        0.09,
        Math.cos(markerAngle) * 0.62
      ));
      marker.castShadow = false;
      marker.receiveShadow = false;
      marker.userData.noDebris = true;
      sealMarkers.push(marker);
    }

    var body = new THREE.Group();
    body.name = "pale deputy body";
    body.scale.setScalar(PALE_DEPUTY_MODEL_SCALE);
    rememberBase(body);
    group.add(body);

    var leftLeg = new THREE.Group();
    leftLeg.position.set(-0.24, 0.68, 0);
    rememberBase(leftLeg);
    body.add(leftLeg);
    rememberBase(addSharedBox(leftLeg, 0.38, 0.82, 0.42, mats.paleDeputyDuster, 0, 0, 0));
    rememberBase(addSharedBox(leftLeg, 0.44, 0.28, 0.62, mats.paleDeputyHat, 0, -0.42, 0.09));
    rememberBase(addSharedBox(leftLeg, 0.18, 0.09, 0.65, mats.paleDeputyTrim, 0, -0.28, 0.08));

    var rightLeg = new THREE.Group();
    rightLeg.position.set(0.24, 0.68, 0);
    rememberBase(rightLeg);
    body.add(rightLeg);
    rememberBase(addSharedBox(rightLeg, 0.38, 0.82, 0.42, mats.paleDeputyDuster, 0, 0, 0));
    rememberBase(addSharedBox(rightLeg, 0.44, 0.28, 0.62, mats.paleDeputyHat, 0, -0.42, 0.09));
    rememberBase(addSharedBox(rightLeg, 0.18, 0.09, 0.65, mats.paleDeputyTrim, 0, -0.28, 0.08));

    var torso = rememberBase(addSharedBox(body, 1.02, 1.22, 0.68, mats.paleDeputyDuster, 0, 1.53, 0));
    var chest = rememberBase(addSharedBox(body, 0.66, 0.82, 0.72, mats.paleDeputyBoneShadow, 0, 1.65, 0.03));
    var belt = rememberBase(addSharedBox(body, 1.08, 0.13, 0.76, mats.paleDeputyHat, 0, 1.13, 0));
    var beltBuckle = rememberBase(addSharedBox(body, 0.22, 0.18, 0.08, mats.paleDeputyBadge, 0, 1.15, 0.41));
    var leftLapel = rememberBase(addSharedBox(body, 0.14, 0.64, 0.08, mats.paleDeputyBadge, -0.22, 1.75, 0.4));
    var rightLapel = rememberBase(addSharedBox(body, 0.14, 0.64, 0.08, mats.paleDeputyBadge, 0.22, 1.75, 0.4));
    leftLapel.rotation.z = -0.38;
    rightLapel.rotation.z = 0.38;
    rememberBase(leftLapel);
    rememberBase(rightLapel);

    var badge = new THREE.Mesh(
      getSharedGeometry("pale-deputy-star", function () {
        var shape = new THREE.Shape();
        for (var starPoint = 0; starPoint < 10; starPoint++) {
          var starRadius = starPoint % 2 === 0 ? 1 : 0.43;
          var starAngle = -Math.PI / 2 + (starPoint * Math.PI) / 5;
          var starX = Math.cos(starAngle) * starRadius;
          var starY = Math.sin(starAngle) * starRadius;
          if (!starPoint) shape.moveTo(starX, starY);
          else shape.lineTo(starX, starY);
        }
        shape.closePath();
        return new THREE.ShapeGeometry(shape);
      }),
      mats.paleDeputyBadge
    );
    badge.position.set(-0.34, 1.91, 0.395);
    badge.scale.setScalar(0.19);
    badge.castShadow = true;
    badge.receiveShadow = false;
    badge.userData.disposeGeometry = false;
    badge.userData.noDebris = true;
    rememberBase(badge);
    body.add(badge);

    var leftTail = new THREE.Group();
    leftTail.position.set(-0.27, 1.16, -0.08);
    rememberBase(leftTail);
    body.add(leftTail);
    rememberBase(addSharedBox(leftTail, 0.48, 1.18, 0.26, mats.paleDeputyDuster, 0, -0.52, 0));
    rememberBase(addSharedBox(leftTail, 0.1, 1.03, 0.29, mats.paleDeputyTrim, -0.2, -0.52, 0));

    var rightTail = new THREE.Group();
    rightTail.position.set(0.27, 1.16, -0.08);
    rememberBase(rightTail);
    body.add(rightTail);
    rememberBase(addSharedBox(rightTail, 0.48, 1.18, 0.26, mats.paleDeputyDuster, 0, -0.52, 0));
    rememberBase(addSharedBox(rightTail, 0.1, 1.03, 0.29, mats.paleDeputyTrim, 0.2, -0.52, 0));

    var leftArm = new THREE.Group();
    leftArm.position.set(-0.68, 1.64, 0.02);
    rememberBase(leftArm);
    body.add(leftArm);
    rememberBase(addSharedBox(leftArm, 0.32, 1.0, 0.36, mats.paleDeputyDuster, 0, -0.12, 0));
    rememberBase(addSharedBox(leftArm, 0.31, 0.27, 0.33, mats.paleDeputyBone, 0, -0.62, 0.06));
    rememberBase(addSharedBox(leftArm, 0.39, 0.14, 0.42, mats.paleDeputyTrim, 0, 0.31, 0));

    var weaponRig = new THREE.Group();
    weaponRig.position.set(0.7, 1.55, 0.25);
    rememberBase(weaponRig);
    body.add(weaponRig);
    rememberBase(addSharedBox(weaponRig, 0.34, 0.84, 0.34, mats.paleDeputyDuster, 0, -0.12, -0.04));
    rememberBase(addSharedBox(weaponRig, 0.33, 0.27, 0.34, mats.paleDeputyBone, 0, -0.55, 0.1));
    rememberBase(addSharedBox(weaponRig, 0.36, 0.14, 0.43, mats.paleDeputyTrim, 0, 0.27, -0.04));
    var weaponLeftBarrel = rememberBase(addSharedBox(weaponRig, 0.11, 0.1, 1.34, mats.metal, 0.035, -0.43, 0.98));
    var weaponRightBarrel = rememberBase(addSharedBox(weaponRig, 0.11, 0.1, 1.34, mats.metal, 0.185, -0.43, 0.98));
    var weaponReceiver = rememberBase(addSharedBox(weaponRig, 0.34, 0.25, 0.34, mats.black, 0.11, -0.5, 0.35));
    var weaponStock = rememberBase(addSharedBox(weaponRig, 0.4, 0.24, 0.58, mats.wood, 0.04, -0.57, 0.02));
    var weaponForeEnd = rememberBase(addSharedBox(weaponRig, 0.29, 0.16, 0.42, mats.wood, 0.11, -0.515, 0.7));
    var weaponMuzzle = rememberBase(addSharedBox(weaponRig, 0.06, 0.11, 0.08, mats.rifleTracer, 0.11, -0.34, 1.63));
    weaponLeftBarrel.name = "pale deputy coach gun left barrel";
    weaponRightBarrel.name = "pale deputy coach gun right barrel";
    weaponReceiver.name = "pale deputy coach gun receiver";
    weaponStock.name = "pale deputy coach gun stock";
    weaponForeEnd.name = "pale deputy coach gun fore-end";
    weaponMuzzle.castShadow = false;
    weaponMuzzle.userData.noDebris = true;

    var neck = rememberBase(addSharedBox(body, 0.42, 0.34, 0.38, mats.paleDeputyBoneShadow, 0, 2.18, 0));
    var skull = rememberBase(addSharedBox(body, 0.82, 0.68, 0.74, mats.paleDeputyBone, 0, 2.54, 0));
    var jaw = rememberBase(addSharedBox(body, 0.55, 0.24, 0.57, mats.paleDeputyBoneShadow, 0, 2.2, 0.08));
    var noseVoid = rememberBase(addSharedBox(body, 0.13, 0.19, 0.08, mats.paleDeputyHat, 0, 2.49, 0.4));
    var mouthVoid = rememberBase(addSharedBox(body, 0.38, 0.08, 0.08, mats.paleDeputyHat, 0, 2.25, 0.39));
    var leftEyeGlow = rememberBase(addSharedBox(body, 0.18, 0.13, 0.09, mats.paleDeputyGlow, -0.2, 2.61, 0.4));
    var rightEyeGlow = rememberBase(addSharedBox(body, 0.18, 0.13, 0.09, mats.paleDeputyGlow, 0.2, 2.61, 0.4));
    leftEyeGlow.castShadow = false;
    rightEyeGlow.castShadow = false;
    leftEyeGlow.userData.noDebris = true;
    rightEyeGlow.userData.noDebris = true;

    var hatBrim = rememberBase(addSharedBox(body, 1.62, 0.14, 1.22, mats.paleDeputyHat, 0, 2.9, 0));
    var hatCrown = rememberBase(addSharedBox(body, 0.88, 0.48, 0.78, mats.paleDeputyHat, 0, 3.19, -0.02));
    var hatBand = rememberBase(addSharedBox(body, 0.94, 0.11, 0.83, mats.paleDeputyBadge, 0, 3.02, -0.02));
    var hatNotch = rememberBase(addSharedBox(body, 0.34, 0.13, 0.84, mats.paleDeputyTrim, 0.19, 3.34, -0.02));

    var entity = {
      active: false,
      pooled: true,
      x: 0,
      z: 0,
      radius: PALE_DEPUTY_RADIUS,
      life: 0,
      startLife: PALE_DEPUTY_LIFETIME,
      attackTimer: 0,
      target: null,
      targetRefreshTimer: 0,
      walkPhase: 0,
      moveAmount: 0,
      shotPulse: 0,
      phase: 0,
      speed: BASE_PLAYER_SPEED,
      actualMoveSpeed: BASE_PLAYER_SPEED,
      group: group,
      body: body,
      source: { type: "paleDeputy", alliedSummon: true },
      previewDisplay: false,
      parts: {
        leftLeg: leftLeg,
        rightLeg: rightLeg,
        torso: torso,
        chest: chest,
        belt: belt,
        beltBuckle: beltBuckle,
        leftLapel: leftLapel,
        rightLapel: rightLapel,
        badge: badge,
        leftTail: leftTail,
        rightTail: rightTail,
        leftArm: leftArm,
        weaponRig: weaponRig,
        weaponLeftBarrel: weaponLeftBarrel,
        weaponRightBarrel: weaponRightBarrel,
        weaponReceiver: weaponReceiver,
        weaponStock: weaponStock,
        weaponForeEnd: weaponForeEnd,
        weaponMuzzle: weaponMuzzle,
        neck: neck,
        skull: skull,
        jaw: jaw,
        noseVoid: noseVoid,
        mouthVoid: mouthVoid,
        leftEyeGlow: leftEyeGlow,
        rightEyeGlow: rightEyeGlow,
        hatBrim: hatBrim,
        hatCrown: hatCrown,
        hatBand: hatBand,
        hatNotch: hatNotch,
        outerSeal: outerSeal,
        innerSeal: innerSeal,
        sealMarkers: sealMarkers,
      },
    };
    entity.source.deputy = entity;
    group.userData.pooledPaleDeputy = entity;
    group.userData.paleDeputyParts = entity.parts;
    group.userData.paleDeputyModelVersion = 1;
    group.visible = false;
    group.position.set(0, -1000, 0);
    paleDeputyCreated += 1;
    return entity;
  }

  function acquirePaleDeputyEntity(x, z) {
    var entity = paleDeputyPool.length ? paleDeputyPool.pop() : createPaleDeputyEntity();
    entity.active = true;
    entity.pooled = false;
    entity.x = Number(x) || 0;
    entity.z = Number(z) || 0;
    entity.life = PALE_DEPUTY_LIFETIME;
    entity.startLife = PALE_DEPUTY_LIFETIME;
    entity.attackTimer = 0.18;
    entity.target = null;
    entity.targetRefreshTimer = 0;
    entity.walkPhase = 0;
    entity.moveAmount = 0;
    entity.shotPulse = 0;
    entity.phase = ((state.marshalPaleDeputiesRaised || 0) % PALE_DEPUTY_MAX_COUNT) * 2.0943951;
    entity.speed = getPaleDeputyPlayerSpeed();
    entity.actualMoveSpeed = entity.speed;
    entity.previewDisplay = false;
    entity.group.visible = true;
    entity.group.scale.setScalar(1);
    scaleFromBase(entity.body, 1, 1, 1);
    entity.group.position.set(entity.x, 0, entity.z);
    dynamicRoot.add(entity.group);
    paleDeputyInUse += 1;
    return entity;
  }

  function releasePaleDeputyEntity(entity) {
    if (!entity) return;
    if (!entity.active && paleDeputyPool.indexOf(entity) !== -1) return;
    if (entity.group.parent) entity.group.parent.remove(entity.group);
    entity.active = false;
    entity.pooled = true;
    entity.target = null;
    entity.life = 0;
    entity.attackTimer = 0;
    entity.previewDisplay = false;
    entity.group.visible = false;
    entity.group.position.set(0, -1000, 0);
    entity.group.rotation.set(0, 0, 0);
    entity.group.scale.setScalar(1);
    paleDeputyInUse = Math.max(0, paleDeputyInUse - 1);
    if (paleDeputyPool.indexOf(entity) === -1) paleDeputyPool.push(entity);
  }

  function getPaleDeputyPlayerSpeed() {
    if (!state.player) return BASE_PLAYER_SPEED;
    return state.player.speed * ((state.marshalRecoilSpeedTimer || 0) > 0 ? 1.3 : 1);
  }

  function initFirePatchVisualPools() {
    prewarmFirePatchVisualPool("standard", FIRE_PATCH_VISUAL_PREWARM.standard);
    prewarmFirePatchVisualPool("trail", FIRE_PATCH_VISUAL_PREWARM.trail);
  }

  function initAcidPuddleVisualPool() {
    prewarmAcidPuddleVisualPool(ACID_PUDDLE_VISUAL_PREWARM);
  }

  function initRifleTrapVisualPool() {
    prewarmRifleTrapVisualPool(RIFLE_TRAP_VISUAL_PREWARM);
  }

  function initParticleVisualPools() {
    prewarmParticleVisualPool("box", PARTICLE_VISUAL_PREWARM);
    prewarmParticleVisualPool("sphere", PARTICLE_VISUAL_PREWARM);
  }

  function initXpOrbVisualPool() {
    prewarmXpOrbVisualPool(XP_ORB_VISUAL_PREWARM);
  }

  function initDeathDebrisVisualPool() {
    prewarmDeathDebrisVisualPool(DEATH_DEBRIS_VISUAL_PREWARM);
  }

  function initProjectileVisualPools() {
    Object.keys(PROJECTILE_VISUAL_PREWARM).forEach(function (kind) {
      prewarmProjectileVisualPool(kind, PROJECTILE_VISUAL_PREWARM[kind]);
    });
  }

  function prewarmTrailWardenTrapVisuals() {
    rifleTrapBackgroundPrewarmPending = rifleTrapVisualCreated < RIFLE_TRAP_VISUAL_ACTIVE_PREWARM;
  }

  function initExplosionEffectPools() {
    prewarmShockwaveVisualPool(SHOCKWAVE_PREWARM);
    prewarmSmokePuffVisualPool(SMOKE_PUFF_PREWARM);
    prewarmLightFlashPool(LIGHT_FLASH_PREWARM);
  }

  function initScorchDecalVisualPool() {
    prewarmScorchDecalVisualPool(SCORCH_DECAL_VISUAL_PREWARM);
  }

  function warmupGameplayEffectResources() {
    if (gameplayEffectWarmupDone || gameplayEffectWarmupInProgress || renderDiagnostics.contextLost) return false;
    gameplayEffectWarmupInProgress = true;
    var warmupItems = [];
    var previousShake = state.shake || 0;
    var origin = getGameplayWarmupOrigin();
    try {
      warmupParticleInstancedBatches(origin, warmupItems);
      warmupProjectileVisuals(origin, warmupItems);
      warmupExplosionEffectVisuals(origin, warmupItems);
      warmupHazardVisuals(origin, warmupItems);
      warmupXpOrbVisuals(origin, warmupItems);
      warmupDeathDebrisVisuals(origin, warmupItems);
      warmupPaleDeputyVisual(origin, warmupItems);
      renderGameplayWarmupFrame(origin);
      gameplayEffectWarmupDone = true;
      return true;
    } catch (err) {
      return false;
    } finally {
      for (var i = warmupItems.length - 1; i >= 0; i--) releaseWarmupVisual(warmupItems[i]);
      state.shake = previousShake;
      gameplayEffectWarmupInProgress = false;
    }
  }

  function getGameplayWarmupOrigin() {
    if (state.player) return { x: state.player.x || 0, z: state.player.z || 0 };
    return { x: PLAYER_START.x || 0, z: PLAYER_START.z || 0 };
  }

  function rememberWarmupVisual(items, type, visual) {
    if (visual) items.push({ type: type, visual: visual });
    return visual;
  }

  function warmupParticleInstancedBatches(origin, items) {
    var boxMaterials = [
      mats.explosion,
      mats.flash,
      mats.rifleTracer,
      mats.coachTracer,
      mats.ammoRound,
      mats.zombieBlood,
      mats.zombieSkin,
      mats.fireHot,
      mats.fireCore,
      mats.fireOrange,
      mats.gold,
      mats.trapMetal,
      mats.acidSpitHot,
      mats.acidSpitShadow,
      mats.paleDeputyTracer,
      mats.paleDeputyBadge,
    ];
    var sphereMaterials = [mats.xp, mats.xpLight, mats.acid, mats.acidDark, mats.acidSpitCore, mats.slimeCore];
    warmupParticleMaterials("box", boxMaterials, origin, items, 0.08);
    warmupParticleMaterials("sphere", sphereMaterials, origin, items, 0.09);
  }

  function warmupParticleMaterials(kind, materials, origin, items, size) {
    for (var i = 0; i < materials.length; i++) {
      if (!materials[i]) continue;
      rememberWarmupVisual(
        items,
        "particle",
        acquireParticleVisual(kind, origin.x + (i % 8) * 0.16, 0.75 + Math.floor(i / 8) * 0.12, origin.z - 1.8, size, materials[i])
      );
    }
  }

  function warmupProjectileVisuals(origin, items) {
    var angle = Math.PI * 0.12;
    var bulletSize = getWeaponProjectileVisualSize(WEAPONS.revolver);
    var rifleSize = getWeaponProjectileVisualSize(WEAPONS.rifle);
    var coachSize = getWeaponProjectileVisualSize(WEAPONS.coachGun);
    for (var i = 0; i < PROJECTILE_STANDARD_INSTANCE_CAPACITY; i++) {
      var materialIndex = i % 5;
      var material = materialIndex === 0 ? mats.rifleTracer : materialIndex === 1 ? mats.flash : materialIndex === 2 ? mats.coachTracer : materialIndex === 3 ? mats.paleDeputyTracer : mats.bullet;
      var size = materialIndex === 0 ? rifleSize : materialIndex === 2 ? coachSize : materialIndex === 3 ? { width: 0.105, length: 1.12 } : bulletSize;
      rememberWarmupVisual(
        items,
        "projectile",
        acquireProjectileVisual(
          "standard",
          { x: origin.x + (i % 32) * 0.045 - 0.72, y: 1.05 + Math.floor(i / 32) * 0.012, z: origin.z - 2.4 },
          angle,
          size,
          material
        )
      );
    }
    rememberWarmupVisual(items, "projectile", acquireProjectileVisual("launcher", { x: origin.x - 0.4, y: 1.1, z: origin.z - 2.7 }, angle, null, null));
    rememberWarmupVisual(items, "projectile", acquireProjectileVisual("electric", { x: origin.x, y: 1.1, z: origin.z - 2.7 }, angle, rifleSize, null));
    rememberWarmupVisual(items, "projectile", acquireProjectileVisual("fireShard", { x: origin.x + 0.4, y: 0.58, z: origin.z - 2.7 }, angle, null, null));
  }

  function warmupExplosionEffectVisuals(origin, items) {
    rememberWarmupVisual(items, "shockwave", acquireShockwaveVisual(origin.x - 1.4, origin.z - 1.4, 0xffe0a0));
    rememberWarmupVisual(items, "shockwave", acquireShockwaveVisual(origin.x + 1.4, origin.z - 1.4, 0xffb347));
    rememberWarmupVisual(items, "smoke", acquireSmokePuffVisual(origin.x - 0.4, 0.9, origin.z - 1.2, 0.9));
    rememberWarmupVisual(items, "smoke", acquireSmokePuffVisual(origin.x + 0.4, 0.7, origin.z - 1.2, 0.62));
    rememberWarmupVisual(items, "scorch", acquireScorchDecalVisual(origin.x, origin.z - 1.35, 2.1));
    rememberWarmupVisual(items, "light", acquireLightFlashVisual(origin.x, 1.2, origin.z - 1.2, 0xff7a22, 3.2, 8));
  }

  function warmupHazardVisuals(origin, items) {
    rememberWarmupVisual(items, "firePatch", acquireFirePatchVisual(origin.x - 1.5, origin.z + 1.2, getLauncherFireRadius(), false));
    rememberWarmupVisual(items, "firePatch", acquireFirePatchVisual(origin.x + 1.5, origin.z + 1.2, Math.max(0.8, getLauncherFireRadius() * 0.72), true));
    rememberWarmupVisual(items, "acidPuddle", acquireAcidPuddleVisual(origin.x, origin.z + 1.8));
  }

  function warmupXpOrbVisuals(origin, items) {
    var count = Math.min(XP_ORB_VISUAL_PREWARM, 36);
    for (var i = 0; i < count; i++) {
      rememberWarmupVisual(
        items,
        "xpOrb",
        acquireXpOrbVisual(origin.x + (i % 12) * 0.12 - 0.66, origin.z + 2.4 + Math.floor(i / 12) * 0.12, i % 4 === 0 ? 0.31 : 0.24, i % 4 === 0 ? 0.14 : 0.105)
      );
    }
  }

  function warmupDeathDebrisVisuals(origin, items) {
    var sources = getDeathDebrisWarmupSources();
    if (!sources.length) return;
    var count = Math.min(DEATH_DEBRIS_VISUAL_PREWARM, MAX_DEBRIS);
    for (var i = 0; i < count; i++) {
      var source = sources[i % sources.length];
      if (!source) continue;
      source.updateWorldMatrix(true, false);
      source.getWorldPosition(deathDebrisWorldPosScratch);
      source.getWorldQuaternion(deathDebrisWorldQuatScratch);
      deathDebrisWorldPosScratch.set(origin.x + (i % 12) * 0.12 - 0.66, 0.45 + (i % 5) * 0.08, origin.z + 3.1 + Math.floor(i / 12) * 0.12);
      rememberWarmupVisual(items, "debris", acquireDeathDebrisVisual(source, deathDebrisWorldPosScratch, deathDebrisWorldQuatScratch));
    }
  }

  function warmupPaleDeputyVisual(origin, items) {
    var deputy = acquirePaleDeputyEntity(origin.x + 1.8, origin.z - 0.8);
    deputy.group.position.set(deputy.x, 0, deputy.z);
    rememberWarmupVisual(items, "paleDeputy", deputy);
  }

  function getDeathDebrisWarmupSources() {
    var sources = [];
    Object.keys(zombiePools).forEach(function (type) {
      var zombie = zombiePools[type] && zombiePools[type][0];
      var parts = zombie && zombie.group && zombie.group.userData ? zombie.group.userData.deathDebrisParts : null;
      if (!parts || !parts.length) return;
      for (var i = 0; i < parts.length; i++) {
        if (parts[i] && parts[i].isMesh) sources.push(parts[i]);
      }
    });
    return sources;
  }

  function renderGameplayWarmupFrame(origin, options) {
    if (!renderer || !scene || !camera || renderDiagnostics.contextLost) return;
    var savedPosition = camera.position.clone();
    var savedQuaternion = camera.quaternion.clone();
    var savedTarget = cameraTarget.clone();
    var shouldCompile = !options || options.compile !== false;
    try {
      var follow = clampCameraTarget(origin.x, origin.z, cameraFollowScratch);
      cameraTarget.set(follow.x, 0, follow.z);
      camera.position.set(cameraTarget.x + cameraBaseOffset.x, cameraBaseOffset.y, cameraTarget.z + cameraBaseOffset.z);
      camera.lookAt(cameraTarget);
      camera.updateMatrixWorld(true);
      updateGameplayShadowCamera(follow);
      scene.updateMatrixWorld(true);
      if (shouldCompile && typeof renderer.compile === "function") renderer.compile(scene, camera);
      renderer.render(scene, camera);
    } catch (err) {
      renderDiagnostics.lastReason = "warmup-render-error";
    } finally {
      camera.position.copy(savedPosition);
      camera.quaternion.copy(savedQuaternion);
      cameraTarget.copy(savedTarget);
    }
  }

  function releaseWarmupVisual(item) {
    if (!item || !item.visual) return;
    if (item.type === "particle") releaseParticleVisual(item.visual);
    else if (item.type === "projectile") releaseProjectileVisual(item.visual);
    else if (item.type === "shockwave") releaseShockwaveVisual(item.visual);
    else if (item.type === "smoke") releaseSmokePuffVisual(item.visual);
    else if (item.type === "scorch") releaseScorchDecalVisual(item.visual);
    else if (item.type === "light") releaseLightFlashVisual(item.visual);
    else if (item.type === "firePatch") releaseFirePatchVisual(item.visual);
    else if (item.type === "acidPuddle") releaseAcidPuddleVisual(item.visual);
    else if (item.type === "xpOrb") releaseXpOrbVisual(item.visual);
    else if (item.type === "debris") releaseDeathDebrisVisual(item.visual);
    else if (item.type === "paleDeputy") releasePaleDeputyEntity(item.visual);
  }

  function prewarmZombiePool(type, count) {
    var pool = zombiePools[type];
    if (!pool) return;
    while (pool.length < count) {
      pool.push(createZombieEntity(type, true));
    }
  }

  function prewarmFirePatchVisualPool(key, count) {
    var poolKey = key === "trail" ? "trail" : "standard";
    var pool = firePatchVisualPools[poolKey];
    while (pool.length < count) {
      pool.push(createFirePatchVisual(poolKey === "trail"));
    }
  }

  function prewarmAcidPuddleVisualPool(count) {
    while (acidPuddleVisualPool.length < count) {
      acidPuddleVisualPool.push(createAcidPuddleVisual());
    }
  }

  function prewarmRifleTrapVisualPool(count) {
    while (rifleTrapVisualPool.length < count) {
      rifleTrapVisualPool.push(createRifleTrapVisual());
    }
  }

  function prewarmParticleVisualPool(kind, count) {
    var key = getParticleVisualPoolKey(kind);
    var pool = particleVisualPools[key];
    while (pool.length < count) {
      pool.push(createParticleVisual(key));
    }
  }

  function prewarmXpOrbVisualPool(count) {
    while (xpOrbVisualPool.length < count) {
      xpOrbVisualPool.push(createXpOrbVisual());
    }
  }

  function prewarmDeathDebrisVisualPool(count) {
    while (deathDebrisVisualPool.length < count) {
      deathDebrisVisualPool.push(createDeathDebrisVisual());
    }
  }

  function prewarmProjectileVisualPool(kind, count) {
    var key = getProjectileVisualPoolKey(kind);
    var pool = projectileVisualPools[key];
    while (pool.length < count) {
      pool.push(createProjectileVisual(key));
    }
  }

  function prewarmShockwaveVisualPool(count) {
    while (shockwaveVisualPool.length < count) {
      shockwaveVisualPool.push(createShockwaveVisual());
    }
  }

  function prewarmSmokePuffVisualPool(count) {
    while (smokePuffVisualPool.length < count) {
      smokePuffVisualPool.push(createSmokePuffVisual());
    }
  }

  function prewarmLightFlashPool(count) {
    while (lightFlashPool.length < count) {
      lightFlashPool.push(createLightFlashVisual());
    }
  }

  function prewarmScorchDecalVisualPool(count) {
    while (scorchDecalVisualPool.length < count) {
      scorchDecalVisualPool.push(createScorchDecalVisual());
    }
  }

  function getZombieConfig(type) {
    return {
      walker: { hp: 2, speed: 2.35, radius: 0.68, damage: 13, scale: 1, score: 100, xp: 4, color: mats.zombieSkin },
      runner: { hp: 1, speed: 3.85, radius: 0.58, damage: 11, scale: 0.86, score: 140, xp: 5, color: mats.zombieSkin },
      fastZombie: { hp: 2, speed: getFastZombieSpeed(), radius: 0.56, damage: 12, scale: 0.95, score: 220, xp: 8, color: mats.fastZombieSkin, fast: true },
      brute: { hp: 5, speed: 1.85, radius: 0.93, damage: 24, scale: 1.28, score: 280, xp: 12, color: mats.zombieSkin },
      spitter: { hp: 4, speed: 1.92, radius: 0.62, damage: 14, scale: 1.0, score: 320, xp: 16, color: mats.zombieAcidSkin, tall: true },
    }[type] || {
      hp: 2,
      speed: 2.35,
      radius: 0.68,
      damage: 13,
      scale: 1,
      score: 100,
      xp: 4,
      color: mats.zombieSkin,
    };
  }

  function getFastZombieSpeed() {
    var playerSpeed = state.player && state.player.speed ? state.player.speed : BASE_PLAYER_SPEED;
    return playerSpeed * FAST_ZOMBIE_SPEED_MULTIPLIER + FAST_ZOMBIE_SPEED_BONUS;
  }

  function resolveZombieBaseSpeed(type, config) {
    return type === "fastZombie" || (config && config.fast) ? getFastZombieSpeed() : config.speed;
  }

  function refreshZombieSpeed(enemy) {
    if (!enemy) return 0;
    if (enemy.type === "fastZombie") enemy.speed = getFastZombieSpeed();
    return enemy.speed;
  }

  function makeZombie(type) {
    return createZombieEntity(type, false);
  }

  function createZombieEntity(type, pooled) {
    var config = getZombieConfig(type);
    var g = new THREE.Group();
    g.name = "blocky zombie " + type;
    var s = config.scale;
    var fast = !!config.fast;
    var runner = type === "runner";
    var slim = config.tall ? 0.7 : fast ? 0.72 : runner ? 0.82 : 1;
    var tallY = config.tall ? 1.28 : fast ? 1.24 : runner ? 0.82 : 1;
    var legHeight = fast ? 0.9 : runner ? 0.54 : 0.58;
    var torsoHeight = fast ? 1.18 : runner ? 0.88 : 1.05;
    var armHeight = config.tall ? 1.38 : fast ? 1.56 : runner ? 0.82 : 1;
    var zombieBodyMat = fast ? mats.fastZombieSkinDark : runner ? mats.zombieSkinDark : mats.zombieShirt;
    addContactShadow(g, (config.tall ? 1.34 : fast ? 1.36 : runner ? 1.16 : 1.75) * s, (config.tall ? 1.12 : fast ? 1.78 : runner ? 1.02 : 1.45) * s, 0.18);

    function makeFastZombieArm(side) {
      var armGroup = new THREE.Group();
      armGroup.position.set(side * 0.5 * s * slim, 1.12 * s * tallY, 0.22 * s);
      armGroup.name = side < 0 ? "fast zombie left arm" : "fast zombie right arm";
      g.add(armGroup);
      addSharedBox(armGroup, 0.28 * s, armHeight * s, 0.26 * s, config.color, 0, 0, 0);
      addSharedBox(armGroup, 0.25 * s, 0.72 * s, 0.24 * s, mats.fastZombieSkinDark, 0, -0.48 * s, 0.05 * s);
      addSharedBox(armGroup, 0.25 * s, 0.34 * s, 0.24 * s, config.color, 0, -0.78 * s, 0.08 * s);
      addSharedBox(armGroup, 0.15 * s, 0.62 * s, 0.14 * s, mats.fastZombieClaw, 0, -1.0 * s, 0.13 * s);
      return rememberBase(armGroup);
    }

    var leftLeg = rememberBase(addSharedBox(g, (fast ? 0.5 : runner ? 0.54 : 0.62) * s * slim, legHeight * s * tallY, (fast ? 0.42 : runner ? 0.46 : 0.54) * s * slim, zombieBodyMat, -0.18 * s * slim, 0.42 * s * tallY, 0));
    var rightLeg = rememberBase(addSharedBox(g, (fast ? 0.5 : runner ? 0.54 : 0.62) * s * slim, legHeight * s * tallY, (fast ? 0.42 : runner ? 0.46 : 0.54) * s * slim, zombieBodyMat, 0.18 * s * slim, 0.42 * s * tallY, 0));
    var torso = rememberBase(addSharedBox(g, (fast ? 0.94 : runner ? 0.88 : 1.0) * s * slim, torsoHeight * s * tallY, (fast ? 0.68 : runner ? 0.62 : 0.7) * s * slim, zombieBodyMat, 0, 1.16 * s * tallY, fast ? 0.02 * s : runner ? 0.04 * s : 0));
    var leftArm = fast ? makeFastZombieArm(-1) : rememberBase(addSharedBox(g, 0.35 * s * slim, armHeight * s, 0.35 * s * slim, config.color, -0.74 * s * slim, 1.13 * s * tallY, 0.22 * s));
    var rightArm = fast ? makeFastZombieArm(1) : rememberBase(addSharedBox(g, 0.35 * s * slim, armHeight * s, 0.35 * s * slim, config.color, 0.74 * s * slim, 1.13 * s * tallY, 0.22 * s));
    var headY = 2.02 * s * tallY + (config.tall ? 0.14 : fast ? 0.02 : runner ? -0.08 : 0);
    var head = rememberBase(addSharedBox(g, (fast ? 0.72 : runner ? 0.78 : 0.86) * s * slim, (fast ? 0.62 : runner ? 0.64 : 0.75) * s, (fast ? 0.74 : runner ? 0.76 : 0.82) * s * slim, config.color, 0, headY, fast ? 0.03 * s : runner ? 0.04 * s : 0));
    var leftEye = rememberBase(addSharedBox(g, 0.16 * s, 0.12 * s, 0.12 * s, config.tall ? mats.acid : fast ? mats.zombieBlood : mats.black, -0.2 * s * slim, headY + 0.08 * s, 0.44 * s * slim));
    var rightEye = rememberBase(addSharedBox(g, 0.16 * s, 0.12 * s, 0.12 * s, config.tall ? mats.acid : fast ? mats.zombieBlood : mats.black, 0.2 * s * slim, headY + 0.06 * s, 0.44 * s * slim));
    var mouth = rememberBase(addSharedBox(g, 0.55 * s * slim, 0.11 * s, 0.12 * s, config.tall ? mats.acid : mats.zombieBlood, 0, headY - 0.14 * s, 0.46 * s * slim));
    var chestGlow = null;
    var leftClaw = null;
    var rightClaw = null;
    var leftWrist = null;
    var rightWrist = null;
    var chestGash = null;
    var leftShoulder = null;
    var rightShoulder = null;
    var neckGore = null;
    var parasiteShell = null;
    var parasiteShellRidge = null;
    var parasiteLeftPlate = null;
    var parasiteRightPlate = null;
    var parasiteBody = null;
    var parasiteLeftForeLeg = null;
    var parasiteRightForeLeg = null;
    var parasiteLeftLeg = null;
    var parasiteRightLeg = null;
    var parasiteBackLeg = null;
    if (config.tall) {
      chestGlow = rememberBase(addSharedBox(g, 0.24 * s, 0.18 * s, 0.14 * s, mats.acid, 0, 1.42 * s * tallY, 0.38 * s));
      chestGlow.userData.noDebris = true;
    } else if (fast) {
      leftShoulder = rememberBase(addSharedBox(g, 0.26 * s, 0.32 * s, 0.38 * s, mats.fastZombieSkinDark, -0.43 * s * slim, 1.62 * s * tallY, 0.14 * s));
      rightShoulder = rememberBase(addSharedBox(g, 0.26 * s, 0.32 * s, 0.38 * s, mats.fastZombieSkinDark, 0.43 * s * slim, 1.62 * s * tallY, 0.14 * s));
      neckGore = rememberBase(addSharedBox(g, 0.34 * s, 0.22 * s, 0.3 * s, mats.zombieBlood, 0, 1.78 * s * tallY, 0.14 * s));
      chestGash = rememberBase(addSharedBox(g, 0.32 * s, 0.42 * s, 0.1 * s, mats.zombieBlood, 0.02 * s, 1.25 * s * tallY, 0.37 * s));
      parasiteShell = rememberBase(addSharedBox(g, 0.82 * s, 0.28 * s, 0.66 * s, mats.parasiteShell, 0, headY + 0.26 * s, -0.02 * s));
      parasiteShellRidge = rememberBase(addSharedBox(g, 0.22 * s, 0.18 * s, 0.62 * s, mats.parasiteShellDark, 0, headY + 0.42 * s, -0.02 * s));
      parasiteLeftPlate = rememberBase(addSharedBox(g, 0.2 * s, 0.2 * s, 0.42 * s, mats.parasiteShellDark, -0.31 * s, headY + 0.16 * s, -0.02 * s));
      parasiteRightPlate = rememberBase(addSharedBox(g, 0.2 * s, 0.2 * s, 0.42 * s, mats.parasiteShellDark, 0.31 * s, headY + 0.16 * s, -0.02 * s));
      parasiteBody = rememberBase(addSharedBox(g, 0.46 * s, 0.17 * s, 0.36 * s, mats.parasiteFlesh, 0, headY + 0.03 * s, 0.19 * s));
      parasiteLeftForeLeg = rememberBase(addSharedBox(g, 0.1 * s, 0.1 * s, 0.3 * s, mats.parasiteFlesh, -0.25 * s, headY - 0.02 * s, 0.29 * s));
      parasiteRightForeLeg = rememberBase(addSharedBox(g, 0.1 * s, 0.1 * s, 0.3 * s, mats.parasiteFlesh, 0.25 * s, headY - 0.02 * s, 0.29 * s));
      parasiteLeftLeg = rememberBase(addSharedBox(g, 0.1 * s, 0.1 * s, 0.32 * s, mats.parasiteFlesh, -0.24 * s, headY + 0.04 * s, -0.1 * s));
      parasiteRightLeg = rememberBase(addSharedBox(g, 0.1 * s, 0.1 * s, 0.32 * s, mats.parasiteFlesh, 0.24 * s, headY + 0.04 * s, -0.1 * s));
      parasiteBackLeg = rememberBase(addSharedBox(g, 0.46 * s, 0.1 * s, 0.12 * s, mats.parasiteFlesh, 0, headY + 0.08 * s, -0.24 * s));
    }
    addHealthBar(g, s, config.tall ? headY + 0.62 * s : null);
    var marshalMark = new THREE.Mesh(
      getSharedGeometry("marshal-mark-ring", function () {
        return new THREE.RingGeometry(0.74, 0.94, 24);
      }),
      mats.consecratedMark
    );
    marshalMark.name = "consecrated mark";
    marshalMark.rotation.x = -Math.PI / 2;
    marshalMark.position.y = 0.055;
    marshalMark.renderOrder = 3;
    marshalMark.visible = false;
    marshalMark.userData.noDebris = true;
    g.add(marshalMark);
    g.userData.marshalMark = marshalMark;
    g.userData.deathDebrisParts = collectDeathDebrisParts(g);
    g.userData.animParts = {
      leftLeg: leftLeg,
      rightLeg: rightLeg,
      torso: torso,
      leftArm: leftArm,
      rightArm: rightArm,
      head: head,
      leftEye: leftEye,
      rightEye: rightEye,
      mouth: mouth,
      chestGlow: chestGlow,
      leftClaw: leftClaw,
      rightClaw: rightClaw,
      leftWrist: leftWrist,
      rightWrist: rightWrist,
      chestGash: chestGash,
      leftShoulder: leftShoulder,
      rightShoulder: rightShoulder,
      neckGore: neckGore,
      parasiteShell: parasiteShell,
      parasiteShellRidge: parasiteShellRidge,
      parasiteLeftPlate: parasiteLeftPlate,
      parasiteRightPlate: parasiteRightPlate,
      parasiteBody: parasiteBody,
      parasiteLeftForeLeg: parasiteLeftForeLeg,
      parasiteRightForeLeg: parasiteRightForeLeg,
      parasiteLeftLeg: parasiteLeftLeg,
      parasiteRightLeg: parasiteRightLeg,
      parasiteBackLeg: parasiteBackLeg,
    };
    var zombie = {
      type: type,
      active: !pooled,
      x: 0,
      z: 0,
      hp: config.hp,
      maxHp: config.hp,
      speed: resolveZombieBaseSpeed(type, config),
      radius: config.radius,
      damage: config.damage,
      score: config.score,
      xp: config.xp,
      group: g,
      attackCooldown: 0,
      hitPulse: 0,
      walkPhase: pooled && type === "fastZombie" ? 0 : rand(0, Math.PI * 2),
      moveAmount: 0,
      stuckTimer: 0,
      steerX: 0,
      steerZ: 1,
      cachedSteerX: 0,
      cachedSteerZ: 1,
      cachedSteerWantX: 0,
      cachedSteerWantZ: 1,
      cachedSteerTimer: 0,
      avoidSide: pooled && type === "fastZombie" ? 1 : rng() < 0.5 ? -1 : 1,
      navGoal: null,
      navGoalStorage: { x: 0, z: 0, holdUntil: 0, expires: 0 },
      catchupReadyAt: 0,
      teleportCount: 0,
      fireSlowTimer: 0,
      marshalStunTimer: 0,
      marshalFearTimer: 0,
      marshalFearX: 0,
      marshalFearZ: 0,
      marshalMarkTimer: 0,
      marshalBountyTimer: 0,
      marshalBounty: false,
      acidCooldown: type === "spitter" ? rand(0.65, 1.35) : 0,
      acidShots: 0,
      spitWindup: 0,
      spitTarget: null,
      spitTargetStorage: { x: 0, z: 0 },
      spitPulse: 0,
    };
    zombie.pooled = !!pooled;
    g.userData.pooledZombie = zombie;
    g.visible = !pooled;
    if (pooled) {
      zombiePoolCreated[type] += 1;
      g.position.set(0, -1000, 0);
    }
    return zombie;
  }

  function acquireZombie(type) {
    var id = zombiePools[type] ? type : "walker";
    var pool = zombiePools[id];
    var zombie = pool.length ? pool.pop() : createZombieEntity(id, true);
    zombiePoolInUse[id] += 1;
    resetZombieState(zombie, id);
    return zombie;
  }

  function resetZombieState(zombie, type) {
    var config = getZombieConfig(type);
    zombie.type = type;
    zombie.active = true;
    zombie.x = 0;
    zombie.z = 0;
    zombie.hp = config.hp;
    zombie.maxHp = config.hp;
    zombie.speed = resolveZombieBaseSpeed(type, config);
    zombie.radius = config.radius;
    zombie.damage = config.damage;
    zombie.score = config.score;
    zombie.xp = config.xp;
    zombie.attackCooldown = 0;
    zombie.hitPulse = 0;
    zombie.walkPhase = rand(0, Math.PI * 2);
    zombie.moveAmount = 0;
    zombie.stuckTimer = 0;
    zombie.steerX = 0;
    zombie.steerZ = 1;
    zombie.cachedSteerX = 0;
    zombie.cachedSteerZ = 1;
    zombie.cachedSteerWantX = 0;
    zombie.cachedSteerWantZ = 1;
    zombie.cachedSteerTimer = 0;
    zombie.avoidSide = rng() < 0.5 ? -1 : 1;
    zombie.navGoal = null;
    zombie.catchupReadyAt = 0;
    zombie.teleportCount = 0;
    zombie.fireSlowTimer = 0;
    zombie.marshalStunTimer = 0;
    zombie.marshalFearTimer = 0;
    zombie.marshalFearX = 0;
    zombie.marshalFearZ = 0;
    zombie.marshalMarkTimer = 0;
    zombie.marshalBountyTimer = 0;
    zombie.marshalBounty = false;
    zombie.acidCooldown = type === "spitter" ? rand(0.65, 1.35) : 0;
    zombie.acidShots = 0;
    zombie.spitWindup = 0;
    zombie.spitTarget = null;
    zombie.spitPulse = 0;
    zombie.spawnSide = null;
    zombie.group.visible = true;
    zombie.group.position.set(0, 0, 0);
    zombie.group.rotation.set(0, 0, 0);
    zombie.group.scale.setScalar(1);
    if (zombie.group.userData.marshalMark) zombie.group.userData.marshalMark.visible = false;
    updateEnemyHealthBar(zombie);
    return zombie;
  }

  function releaseZombieToPool(zombie) {
    if (!zombie) return;
    if (zombie.group && zombie.group.parent) zombie.group.parent.remove(zombie.group);
    if (!zombie.pooled || !zombiePools[zombie.type]) return;
    zombie.group.visible = false;
    zombie.group.position.set(0, -1000, 0);
    zombie.group.rotation.set(0, 0, 0);
    zombie.group.scale.setScalar(1);
    zombie.hitPulse = 0;
    zombie.moveAmount = 0;
    zombie.navGoal = null;
    zombie.cachedSteerTimer = 0;
    zombie.spitTarget = null;
    zombie.spitPulse = 0;
    zombie.marshalStunTimer = 0;
    zombie.marshalFearTimer = 0;
    zombie.marshalMarkTimer = 0;
    zombie.marshalBountyTimer = 0;
    zombie.marshalBounty = false;
    if (zombie.group.userData.marshalMark) zombie.group.userData.marshalMark.visible = false;
    zombie.active = false;
    zombiePoolInUse[zombie.type] = Math.max(0, (zombiePoolInUse[zombie.type] || 0) - 1);
    zombiePools[zombie.type].push(zombie);
  }

  function releaseAllEnemiesToPool() {
    for (var i = state.enemies.length - 1; i >= 0; i--) {
      releaseZombieToPool(state.enemies[i]);
    }
    state.enemies = [];
    zombieSpatialDirty = true;
  }

  function getZombiePoolStats() {
    return {
      walker: {
        available: zombiePools.walker.length,
        created: zombiePoolCreated.walker,
        inUse: zombiePoolInUse.walker,
      },
      runner: {
        available: zombiePools.runner.length,
        created: zombiePoolCreated.runner,
        inUse: zombiePoolInUse.runner,
      },
      fastZombie: {
        available: zombiePools.fastZombie.length,
        created: zombiePoolCreated.fastZombie,
        inUse: zombiePoolInUse.fastZombie,
      },
      brute: {
        available: zombiePools.brute.length,
        created: zombiePoolCreated.brute,
        inUse: zombiePoolInUse.brute,
      },
      spitter: {
        available: zombiePools.spitter.length,
        created: zombiePoolCreated.spitter,
        inUse: zombiePoolInUse.spitter,
      },
    };
  }

  function addHealthBar(group, scale, y) {
    var healthY = y || 2.74 * scale;
    var back = addSharedBox(group, 1.25 * scale, 0.12 * scale, 0.12 * scale, mats.healthBack, 0, healthY, 0);
    var fill = addSharedBox(group, 1.15 * scale, 0.14 * scale, 0.14 * scale, mats.healthRed, 0, healthY + 0.01 * scale, 0.02);
    fill.name = "health-fill";
    group.userData.healthFill = fill;
    group.userData.healthBaseWidth = 1.15 * scale;
    back.castShadow = false;
    fill.castShadow = false;
    back.userData.noDebris = true;
    fill.userData.noDebris = true;
  }

  function update(dt) {
    if (state.paused) {
      updateHud();
      return;
    }

    state.time += dt;
    state.shake = Math.max(0, state.shake - dt * 5.5);
    updateRifleTrapBackgroundPrewarm();

    if (state.player) {
      updateAim();
      updatePlayerVisual(dt);
    }

    if (state.mode === "menu") {
      updateMenuScene(dt);
    }

    if (state.mode !== "playing") {
      updateAmmoCratePointer(dt);
      updateMobileAimTargetMarker(dt);
      updateParticles(dt);
      updateVisualEffects(dt);
      return;
    }

    updateMarshalSystems(dt);
    updateReloads(dt);
    updateRifleTimers(dt);
    updatePlayer(dt);
    updateXpOrbs(dt);
    updateAmmoCrates(dt);
    updateAmmoCratePointer(dt);
    updateMobileAimTargetMarker(dt);
    updateSpawning(dt);
    updateRifleTraps(dt);
    updateEnemies(dt);
    updateRifleTraps(0);
    updatePaleDeputies(dt);
    updateAcidProjectiles(dt);
    updateAcidPuddles(dt);
    updateFirePatches(dt);
    updateDelayedExplosions(dt);
    updateBullets(dt);
    updateCoachGunTracers(dt);
    updatePaleDeputyTracers(dt);
    updateParticles(dt);
    updateVisualEffects(dt);
    updateWaveProgress(dt);
    updateLauncherBackgroundWarmup(dt);
    updateHud();
  }

  function updateRifleTrapBackgroundPrewarm() {
    if (!rifleTrapBackgroundPrewarmPending) return;
    if (rifleTrapVisualCreated >= RIFLE_TRAP_VISUAL_ACTIVE_PREWARM) {
      rifleTrapBackgroundPrewarmPending = false;
      return;
    }
    rifleTrapVisualPool.push(createRifleTrapVisual());
    if (rifleTrapVisualCreated >= RIFLE_TRAP_VISUAL_ACTIVE_PREWARM) rifleTrapBackgroundPrewarmPending = false;
  }

  function updateLauncherBackgroundWarmup(dt) {
    releaseLauncherShrapnelResourceWarmupItems();
    var shrapnelPending = launcherShrapnelResourceWarmup.pending;
    var cascadePending = launcherCascadeWarmup.pending;
    if (shrapnelPending && cascadePending) {
      if (launcherWarmupTurn === 0) updateLauncherShrapnelResourceWarmup(dt);
      else updateLauncherCascadeWarmup(dt);
      launcherWarmupTurn = launcherWarmupTurn === 0 ? 1 : 0;
    } else if (shrapnelPending) {
      updateLauncherShrapnelResourceWarmup(dt);
    } else if (cascadePending) {
      updateLauncherCascadeWarmup(dt);
    }
  }

  function resetLauncherCascadeWarmup() {
    launcherCascadeWarmup.pending = false;
    launcherCascadeWarmup.completed = false;
    launcherCascadeWarmup.stage = 0;
    launcherCascadeWarmup.steps = 0;
    launcherCascadeWarmup.lastMs = 0;
    launcherCascadeWarmup.maxMs = 0;
  }

  function resetLauncherShrapnelResourceWarmup() {
    releaseLauncherShrapnelResourceWarmupItems();
    launcherShrapnelResourceWarmup.pending = false;
    launcherShrapnelResourceWarmup.completed = false;
    launcherShrapnelResourceWarmup.stage = 0;
    launcherShrapnelResourceWarmup.steps = 0;
    launcherShrapnelResourceWarmup.lastMs = 0;
    launcherShrapnelResourceWarmup.maxMs = 0;
  }

  function releaseLauncherShrapnelResourceWarmupItems() {
    var items = launcherShrapnelResourceWarmup.activeItems;
    if (!items || !items.length) return;
    for (var i = items.length - 1; i >= 0; i--) releaseWarmupVisual(items[i]);
    items.length = 0;
  }

  function requestLauncherCascadeWarmup() {
    if (launcherCascadeWarmup.completed || launcherCascadeWarmup.pending) return;
    launcherCascadeWarmup.pending = true;
    launcherCascadeWarmup.stage = 0;
    launcherCascadeWarmup.steps = 0;
    launcherCascadeWarmup.lastMs = 0;
    launcherCascadeWarmup.maxMs = 0;
  }

  function requestLauncherShrapnelResourceWarmup() {
    if (launcherShrapnelResourceWarmup.completed || launcherShrapnelResourceWarmup.pending) return;
    launcherShrapnelResourceWarmup.pending = true;
    launcherShrapnelResourceWarmup.stage = 0;
    launcherShrapnelResourceWarmup.steps = 0;
    launcherShrapnelResourceWarmup.lastMs = 0;
    launcherShrapnelResourceWarmup.maxMs = 0;
  }

  function updateLauncherShrapnelResourceWarmup(dt) {
    if (!launcherShrapnelResourceWarmup.pending) return;
    if (state.paused || state.mode !== "playing") return;
    if (state.playerClass !== "demolitionist" || state.launcherUpgrade !== "bombardier") return;
    var started = typeof performance !== "undefined" && performance.now ? performance.now() : 0;
    if (!runLauncherShrapnelResourceWarmupStage(launcherShrapnelResourceWarmup.stage)) return;
    var elapsed = started ? performance.now() - started : 0;
    launcherShrapnelResourceWarmup.lastMs = elapsed;
    if (elapsed > launcherShrapnelResourceWarmup.maxMs) launcherShrapnelResourceWarmup.maxMs = elapsed;
    launcherShrapnelResourceWarmup.stage += 1;
    launcherShrapnelResourceWarmup.steps += 1;
    if (launcherShrapnelResourceWarmup.stage >= LAUNCHER_SHRAPNEL_RESOURCE_WARMUP_STAGE_COUNT) {
      launcherShrapnelResourceWarmup.pending = false;
      launcherShrapnelResourceWarmup.completed = true;
    }
  }

  function runLauncherShrapnelResourceWarmupStage(stage) {
    if (renderDiagnostics.contextLost) return false;
    var warmupItems = [];
    var origin = getLauncherShrapnelResourceWarmupOrigin(stage);
    try {
      var warmed = 0;
      if (stage <= 3) {
        warmed += warmupLauncherShrapnelTrailParticles(origin, warmupItems, LAUNCHER_SHRAPNEL_RESOURCE_PARTICLE_STAGE_SIZE, stage);
      } else if (stage <= 5) {
        warmed += warmupLauncherShrapnelProjectiles(origin, warmupItems, LAUNCHER_SHRAPNEL_RESOURCE_PROJECTILE_STAGE_SIZE, stage);
      } else {
        warmed += warmupLauncherShrapnelTrailParticles(origin, warmupItems, Math.floor(LAUNCHER_SHRAPNEL_RESOURCE_PARTICLE_STAGE_SIZE * 0.5), stage);
        warmed += warmupLauncherShrapnelProjectiles(origin, warmupItems, Math.floor(LAUNCHER_SHRAPNEL_RESOURCE_PROJECTILE_STAGE_SIZE * 0.5), stage);
      }
      if (warmed <= 0) return false;
      launcherShrapnelResourceWarmup.activeItems = warmupItems;
      return true;
    } catch (err) {
      for (var i = warmupItems.length - 1; i >= 0; i--) releaseWarmupVisual(warmupItems[i]);
      return false;
    }
  }

  function getLauncherShrapnelResourceWarmupOrigin(stage) {
    return {
      x: ARENA_W + 160 + (stage % 3) * 3,
      z: ARENA_D + 160 + Math.floor(stage / 3) * 3,
    };
  }

  function warmupLauncherShrapnelTrailParticles(origin, items, count, stage) {
    var batch = getParticleInstancedBatch("box", mats.flash);
    var available = Math.max(0, MAX_PARTICLES - (batch.count || 0));
    var amount = Math.min(Math.max(0, Math.floor(Number(count) || 0)), available);
    if (amount <= 0) return 0;
    for (var i = 0; i < amount; i++) {
      var angle = (Math.PI * 2 * i) / amount + (stage || 0) * 0.19;
      var ring = 0.2 + (i % 9) * 0.055;
      rememberWarmupVisual(
        items,
        "particle",
        acquireParticleVisual("box", origin.x + Math.cos(angle) * ring, 0.62 + (i % 7) * 0.035, origin.z + Math.sin(angle) * ring, 0.05, mats.flash)
      );
    }
    return amount;
  }

  function warmupLauncherShrapnelProjectiles(origin, items, count, stage) {
    var amount = Math.max(0, Math.floor(Number(count) || 0));
    var size = { width: 0.08, length: 0.54 };
    for (var i = 0; i < amount; i++) {
      var angle = (Math.PI * 2 * i) / Math.max(1, amount) + (stage || 0) * 0.11;
      rememberWarmupVisual(
        items,
        "projectile",
        acquireProjectileVisual(
          "standard",
          { x: origin.x + Math.sin(angle) * 0.42, y: WEAPONS.revolver.muzzleY, z: origin.z + Math.cos(angle) * 0.42 },
          angle,
          size,
          mats.bullet
        )
      );
    }
    return amount;
  }

  function updateLauncherCascadeWarmup(dt) {
    if (!launcherCascadeWarmup.pending) return;
    if (state.paused || state.mode !== "playing") return;
    if (state.playerClass !== "demolitionist" || state.launcherUpgrade !== "bombardier") return;
    var started = typeof performance !== "undefined" && performance.now ? performance.now() : 0;
    if (!runLauncherCascadeWarmupStage(launcherCascadeWarmup.stage)) return;
    var elapsed = started ? performance.now() - started : 0;
    launcherCascadeWarmup.lastMs = elapsed;
    if (elapsed > launcherCascadeWarmup.maxMs) launcherCascadeWarmup.maxMs = elapsed;
    launcherCascadeWarmup.stage += 1;
    launcherCascadeWarmup.steps += 1;
    if (launcherCascadeWarmup.stage >= LAUNCHER_CASCADE_WARMUP_STAGE_COUNT) {
      launcherCascadeWarmup.pending = false;
      launcherCascadeWarmup.completed = true;
    }
  }

  function runLauncherCascadeWarmupStage(stage) {
    if (stage >= 5) return runLauncherCascadeActiveWarmupStage(stage);
    withLauncherCascadeWarmupIsolation(stage, function () {
      var originX = ARENA_W + 120 + stage * 16;
      var originZ = ARENA_D + 120;
      if (stage === 0) {
        spawnLauncherWarmupZombies(3, originX, originZ, 0.5);
        explodeGrenade(originX, originZ, getLauncherBlastRadius(), getLauncherBlastDamage(), {
          bullet: { x: originX - 4, z: originZ, powderEcho: true },
          kind: "main",
          noAudio: true,
        });
      } else if (stage === 1) {
        spawnLauncherWarmupZombies(2, originX, originZ, 0.52);
        explodeGrenade(originX, originZ, getLauncherBlastRadius() * 0.48, getLauncherBlastDamage() * 0.58, {
          bullet: { x: originX - 4, z: originZ },
          kind: "cluster",
          chainContext: { remaining: 0, triggered: 0 },
          noCluster: true,
          noAudio: true,
        });
      } else if (stage === 2) {
        spawnLauncherWarmupZombies(2, originX, originZ, 0.52);
        explodeGrenade(originX, originZ, getLauncherBlastRadius() * 0.56, getLauncherBlastDamage() * 0.62, {
          bullet: { x: originX - 4, z: originZ },
          kind: "chain",
          chainContext: { remaining: 0, triggered: 0 },
          noCluster: true,
          noAudio: true,
        });
      } else if (stage === 3) {
        spawnLauncherWarmupZombies(1, originX, originZ, 0.5);
        explodeGrenade(originX, originZ, getLauncherBlastRadius() * 0.38, getLauncherBlastDamage() * 0.45, {
          bullet: { x: originX - 4, z: originZ },
          kind: "echo",
          chainContext: { remaining: 0, triggered: 0 },
          noCluster: true,
          noShrapnel: true,
          echoed: true,
          noAudio: true,
        });
      } else {
        var bulletStart = state.bullets.length;
        spawnLauncherWarmupZombies(8, originX, originZ, 2.2);
        spawnLauncherShrapnel(originX, originZ, 8 + getUpgradeCount("moreBomblets"));
        rebuildZombieSpatialGrid();
        for (var step = 0; step < 7; step++) {
          updateLauncherWarmupShrapnelBullets(bulletStart, FIXED_DT);
        }
      }
    });
    return true;
  }

  function canRunActiveLauncherCascadeWarmup() {
    if (state.paused || state.mode !== "playing") return false;
    if (state.bullets.length) return false;
    if (state.delayedExplosions.length) return false;
    if (state.particles.length) return false;
    if (state.smokePuffs.length) return false;
    if (state.shockwaves.length) return false;
    if (state.lightFlashes.length) return false;
    if (state.lightningBolts.length) return false;
    if (state.decals.length) return false;
    if (state.debris.length) return false;
    if (state.xpOrbs.length) return false;
    if (state.firePatches.length) return false;
    if (state.acidProjectiles.length) return false;
    if (state.acidPuddles.length) return false;
    return true;
  }

  function runLauncherCascadeActiveWarmupStage(stage) {
    if (!canRunActiveLauncherCascadeWarmup()) return false;
    withLauncherCascadeActiveWarmupIsolation(stage, function () {
      var originX = ARENA_W + 140 + stage * 18;
      var originZ = ARENA_D + 140;
      if (stage === 5) {
        spawnLauncherActiveWarmupParticles(originX, originZ, MAX_PARTICLES);
        updateParticles(FIXED_DT);
      } else if (stage === 6) {
        for (var orb = 0; orb < MAX_XP_ORBS; orb++) {
          var orbAngle = (Math.PI * 2 * orb) / MAX_XP_ORBS;
          spawnXpOrb(originX + Math.cos(orbAngle) * 1.8, originZ + Math.sin(orbAngle) * 1.8, orb % 5 === 0 ? 12 : 1);
        }
        updateXpOrbs(FIXED_DT);
      } else if (stage === 7) {
        spawnLauncherWarmupZombies(10, originX, originZ, 0.54);
        explodeGrenade(originX, originZ, getLauncherBlastRadius(), getLauncherBlastDamage(), {
          bullet: { x: originX - 4, z: originZ, powderEcho: true },
          kind: "main",
          noCluster: true,
          noShrapnel: true,
          noAudio: true,
        });
        updateParticles(FIXED_DT);
        updateVisualEffects(FIXED_DT);
        updateXpOrbs(FIXED_DT);
      } else if (stage === 8) {
        for (var blast = 0; blast < 4; blast++) {
          var bx = originX + (blast - 1.5) * 2.2;
          var bz = originZ + (blast % 2 ? 1.15 : -1.15);
          spawnLauncherWarmupZombies(2, bx, bz, 0.42);
          explodeGrenade(bx, bz, getLauncherBlastRadius() * (blast % 2 ? 0.56 : 0.48), getLauncherBlastDamage() * 0.6, {
            bullet: { x: bx - 3.5, z: bz },
            kind: blast % 2 ? "chain" : "cluster",
            chainContext: { remaining: 0, triggered: 0 },
            noCluster: true,
            noShrapnel: true,
            noAudio: true,
          });
        }
        updateParticles(FIXED_DT);
        updateVisualEffects(FIXED_DT);
        updateXpOrbs(FIXED_DT);
      } else {
        var bulletStart = state.bullets.length;
        spawnLauncherWarmupZombies(12, originX, originZ, 0.72);
        spawnLauncherShrapnel(originX, originZ, 8 + getUpgradeCount("moreBomblets"));
        rebuildZombieSpatialGrid();
        for (var step = 0; step < 10; step++) {
          updateLauncherWarmupShrapnelBullets(bulletStart, FIXED_DT);
        }
        updateParticles(FIXED_DT);
        updateVisualEffects(FIXED_DT);
        updateXpOrbs(FIXED_DT);
      }
    });
    return true;
  }

  function withLauncherCascadeActiveWarmupIsolation(stage, fn) {
    var previousWarmupMode = gameplayWarmupMode;
    var previousRng = rng;
    var previousEnemies = state.enemies.slice();
    var previousBulletsLength = state.bullets.length;
    var previousDelayedLength = state.delayedExplosions.length;
    var previousSamplesLength = state.launcherExplosionSpreadSamples.length;
    var previousParticlesLength = state.particles.length;
    var previousSmokeLength = state.smokePuffs.length;
    var previousShockwaveLength = state.shockwaves.length;
    var previousLightFlashLength = state.lightFlashes.length;
    var previousLightningLength = state.lightningBolts.length;
    var previousDecalLength = state.decals.length;
    var previousDebrisLength = state.debris.length;
    var previousXpOrbLength = state.xpOrbs.length;
    var previousFirePatchLength = state.firePatches.length;
    var previousAcidProjectileLength = state.acidProjectiles.length;
    var previousAcidPuddleLength = state.acidPuddles.length;
    var previousUpgradeCounts = Object.assign({}, state.upgradeCounts);
    var previousPlayerClass = state.playerClass;
    var previousLauncherUpgrade = state.launcherUpgrade;
    var previousScore = state.score;
    var previousKills = state.kills;
    var previousXp = state.xp;
    var previousTotalXp = state.totalXp;
    var previousLevel = state.level;
    var previousXpToNext = state.xpToNext;
    var previousLevelUps = state.levelUps;
    var previousAmmo = Object.assign({}, state.ammo);
    var previousAmmoReserve = Object.assign({}, state.ammoReserve);
    var previousReloadTimers = Object.assign({}, state.reloadTimers);
    var previousShake = state.shake;
    var previousLauncherCounters = {
      chainDetonations: state.launcherChainDetonations,
      bomblets: state.launcherBomblets,
      shrapnelShots: state.launcherShrapnelShots,
      powderEchoes: state.launcherPowderEchoes,
      ammoRefills: state.launcherAmmoRefills,
      madmanStacks: state.launcherMadmanStacks,
      madmanTriggers: state.launcherMadmanTriggers,
      fireKills: state.launcherFireKills,
      fireBonusXp: state.launcherFireBonusXp,
      backdrafts: state.launcherBackdrafts,
      thermitePatches: state.launcherThermitePatches,
      freeShots: state.launcherFreeShots,
      crossfireShards: state.launcherCrossfireShards,
      fireBuffActive: state.launcherFireBuffActive,
      fireAmmoAccumulator: state.launcherFireAmmoAccumulator,
    };
    var warmupEnemies = [];
    launcherWarmupEnemyScratch = warmupEnemies;
    gameplayWarmupMode = false;
    rng = mulberry32(0xac71ce + Math.max(0, stage || 0) * 9973);
    state.playerClass = "demolitionist";
    state.launcherUpgrade = "bombardier";
    applyLauncherCascadeWarmupUpgrades();
    try {
      fn();
    } finally {
      for (var b = state.bullets.length - 1; b >= previousBulletsLength; b--) removeBullet(b);
      for (var p = state.particles.length - 1; p >= previousParticlesLength; p--) removeParticle(p);
      for (var smoke = state.smokePuffs.length - 1; smoke >= previousSmokeLength; smoke--) removeSmokePuff(smoke);
      for (var shock = state.shockwaves.length - 1; shock >= previousShockwaveLength; shock--) removeShockwave(shock);
      for (var flash = state.lightFlashes.length - 1; flash >= previousLightFlashLength; flash--) removeLightFlash(flash);
      for (var bolt = state.lightningBolts.length - 1; bolt >= previousLightningLength; bolt--) removeLightningBolt(bolt);
      for (var decal = state.decals.length - 1; decal >= previousDecalLength; decal--) removeDecal(decal);
      for (var debris = state.debris.length - 1; debris >= previousDebrisLength; debris--) removeDebris(debris);
      for (var orb = state.xpOrbs.length - 1; orb >= previousXpOrbLength; orb--) removeXpOrb(orb);
      for (var fire = state.firePatches.length - 1; fire >= previousFirePatchLength; fire--) removeFirePatch(fire);
      for (var acidShot = state.acidProjectiles.length - 1; acidShot >= previousAcidProjectileLength; acidShot--) removeAcidProjectile(acidShot);
      for (var acidPool = state.acidPuddles.length - 1; acidPool >= previousAcidPuddleLength; acidPool--) removeAcidPuddle(acidPool);
      for (var e = 0; e < warmupEnemies.length; e++) {
        if (warmupEnemies[e] && warmupEnemies[e].active !== false) releaseZombieToPool(warmupEnemies[e]);
      }
      state.enemies = previousEnemies;
      state.delayedExplosions.length = previousDelayedLength;
      state.launcherExplosionSpreadSamples.length = previousSamplesLength;
      state.upgradeCounts = previousUpgradeCounts;
      state.playerClass = previousPlayerClass;
      state.launcherUpgrade = previousLauncherUpgrade;
      state.score = previousScore;
      state.kills = previousKills;
      state.xp = previousXp;
      state.totalXp = previousTotalXp;
      state.level = previousLevel;
      state.xpToNext = previousXpToNext;
      state.levelUps = previousLevelUps;
      state.ammo = previousAmmo;
      state.ammoReserve = previousAmmoReserve;
      state.reloadTimers = previousReloadTimers;
      state.shake = previousShake;
      state.launcherChainDetonations = previousLauncherCounters.chainDetonations;
      state.launcherBomblets = previousLauncherCounters.bomblets;
      state.launcherShrapnelShots = previousLauncherCounters.shrapnelShots;
      state.launcherPowderEchoes = previousLauncherCounters.powderEchoes;
      state.launcherAmmoRefills = previousLauncherCounters.ammoRefills;
      state.launcherMadmanStacks = previousLauncherCounters.madmanStacks;
      state.launcherMadmanTriggers = previousLauncherCounters.madmanTriggers;
      state.launcherFireKills = previousLauncherCounters.fireKills;
      state.launcherFireBonusXp = previousLauncherCounters.fireBonusXp;
      state.launcherBackdrafts = previousLauncherCounters.backdrafts;
      state.launcherThermitePatches = previousLauncherCounters.thermitePatches;
      state.launcherFreeShots = previousLauncherCounters.freeShots;
      state.launcherCrossfireShards = previousLauncherCounters.crossfireShards;
      state.launcherFireBuffActive = previousLauncherCounters.fireBuffActive;
      state.launcherFireAmmoAccumulator = previousLauncherCounters.fireAmmoAccumulator;
      rng = previousRng;
      gameplayWarmupMode = previousWarmupMode;
      launcherWarmupEnemyScratch = null;
      zombieSpatialDirty = true;
    }
  }

  function withLauncherCascadeWarmupIsolation(stage, fn) {
    var previousWarmupMode = gameplayWarmupMode;
    var previousRng = rng;
    var previousEnemies = state.enemies.slice();
    var previousBulletsLength = state.bullets.length;
    var previousDelayedLength = state.delayedExplosions.length;
    var previousSamplesLength = state.launcherExplosionSpreadSamples.length;
    var previousUpgradeCounts = Object.assign({}, state.upgradeCounts);
    var previousPlayerClass = state.playerClass;
    var previousLauncherUpgrade = state.launcherUpgrade;
    var previousScore = state.score;
    var previousKills = state.kills;
    var previousXp = state.xp;
    var previousTotalXp = state.totalXp;
    var previousLevel = state.level;
    var previousXpToNext = state.xpToNext;
    var previousLevelUps = state.levelUps;
    var previousAmmo = Object.assign({}, state.ammo);
    var previousAmmoReserve = Object.assign({}, state.ammoReserve);
    var previousReloadTimers = Object.assign({}, state.reloadTimers);
    var previousShake = state.shake;
    var previousLauncherCounters = {
      chainDetonations: state.launcherChainDetonations,
      bomblets: state.launcherBomblets,
      shrapnelShots: state.launcherShrapnelShots,
      powderEchoes: state.launcherPowderEchoes,
      ammoRefills: state.launcherAmmoRefills,
      madmanStacks: state.launcherMadmanStacks,
      madmanTriggers: state.launcherMadmanTriggers,
    };
    var warmupEnemies = [];
    launcherWarmupEnemyScratch = warmupEnemies;
    gameplayWarmupMode = true;
    rng = mulberry32(0xc45cade + Math.max(0, stage || 0) * 9973);
    state.playerClass = "demolitionist";
    state.launcherUpgrade = "bombardier";
    applyLauncherCascadeWarmupUpgrades();
    try {
      fn();
    } finally {
      for (var b = state.bullets.length - 1; b >= previousBulletsLength; b--) {
        removeBullet(b);
      }
      for (var e = 0; e < warmupEnemies.length; e++) {
        if (warmupEnemies[e] && warmupEnemies[e].active !== false) releaseZombieToPool(warmupEnemies[e]);
      }
      state.enemies = previousEnemies;
      state.delayedExplosions.length = previousDelayedLength;
      state.launcherExplosionSpreadSamples.length = previousSamplesLength;
      state.upgradeCounts = previousUpgradeCounts;
      state.playerClass = previousPlayerClass;
      state.launcherUpgrade = previousLauncherUpgrade;
      state.score = previousScore;
      state.kills = previousKills;
      state.xp = previousXp;
      state.totalXp = previousTotalXp;
      state.level = previousLevel;
      state.xpToNext = previousXpToNext;
      state.levelUps = previousLevelUps;
      state.ammo = previousAmmo;
      state.ammoReserve = previousAmmoReserve;
      state.reloadTimers = previousReloadTimers;
      state.shake = previousShake;
      state.launcherChainDetonations = previousLauncherCounters.chainDetonations;
      state.launcherBomblets = previousLauncherCounters.bomblets;
      state.launcherShrapnelShots = previousLauncherCounters.shrapnelShots;
      state.launcherPowderEchoes = previousLauncherCounters.powderEchoes;
      state.launcherAmmoRefills = previousLauncherCounters.ammoRefills;
      state.launcherMadmanStacks = previousLauncherCounters.madmanStacks;
      state.launcherMadmanTriggers = previousLauncherCounters.madmanTriggers;
      rng = previousRng;
      gameplayWarmupMode = previousWarmupMode;
      launcherWarmupEnemyScratch = null;
      zombieSpatialDirty = true;
    }
  }

  var launcherWarmupEnemyScratch = null;

  function applyLauncherCascadeWarmupUpgrades() {
    state.upgradeCounts.heavyPayload = Math.max(1, state.upgradeCounts.heavyPayload || 0);
    state.upgradeCounts.fullSalvo = Math.max(1, state.upgradeCounts.fullSalvo || 0);
    state.upgradeCounts.clusterCharge = Math.max(1, state.upgradeCounts.clusterCharge || 0);
    state.upgradeCounts.chainDetonation = Math.max(1, state.upgradeCounts.chainDetonation || 0);
    state.upgradeCounts.moreChainDetonations = Math.max(8, state.upgradeCounts.moreChainDetonations || 0);
    state.upgradeCounts.moreBomblets = Math.max(5, state.upgradeCounts.moreBomblets || 0);
    state.upgradeCounts.shrapnelRain = Math.max(1, state.upgradeCounts.shrapnelRain || 0);
    state.upgradeCounts.powderEcho = Math.max(1, state.upgradeCounts.powderEcho || 0);
    state.upgradeCounts.madmansJourney = Math.max(1, state.upgradeCounts.madmansJourney || 0);
  }

  function spawnLauncherWarmupZombies(count, centerX, centerZ, spacing) {
    var amount = Math.max(0, Math.floor(Number(count) || 0));
    var side = Math.max(1, Math.ceil(Math.sqrt(amount)));
    var half = (side - 1) / 2;
    for (var i = 0; i < amount; i++) {
      var zombie = acquireZombie("walker");
      zombie.x = centerX + ((i % side) - half) * spacing;
      zombie.z = centerZ + (Math.floor(i / side) - half) * spacing;
      zombie.group.position.set(zombie.x, 0, zombie.z);
      state.enemies.push(zombie);
      dynamicRoot.add(zombie.group);
      if (launcherWarmupEnemyScratch) launcherWarmupEnemyScratch.push(zombie);
    }
    zombieSpatialDirty = true;
    rebuildZombieSpatialGrid();
  }

  function spawnLauncherActiveWarmupParticles(originX, originZ, count) {
    var amount = Math.min(MAX_PARTICLES, Math.max(0, Math.floor(Number(count) || 0)));
    reserveParticleSlots(amount);
    for (var i = 0; i < amount; i++) {
      var angle = (Math.PI * 2 * i) / Math.max(1, amount);
      var wave = i % 4;
      var mat = wave === 0 ? mats.flash : wave === 1 ? mats.explosion : wave === 2 ? mats.zombieBlood : mats.gold;
      var speed = 1.2 + (i % 11) * 0.42;
      spawnParticle(
        originX + Math.cos(angle) * (0.25 + (i % 7) * 0.04),
        0.35 + (i % 9) * 0.12,
        originZ + Math.sin(angle) * (0.25 + (i % 7) * 0.04),
        Math.cos(angle) * speed,
        0.8 + (i % 13) * 0.25,
        Math.sin(angle) * speed,
        0.2 + (i % 5) * 0.055,
        0.05 + (i % 6) * 0.025,
        mat,
        true
      );
    }
  }

  function updateLauncherWarmupShrapnelBullets(startIndex, dt) {
    var trailParticles = countLauncherShrapnelTrailParticles(dt, startIndex);
    var trailBudget = prepareLauncherShrapnelTrailBudget(trailParticles);
    for (var i = state.bullets.length - 1; i >= startIndex; i--) {
      var bullet = state.bullets[i];
      if (!bullet || bullet.type !== "launcherShrapnel") continue;
      updateLauncherShrapnelBullet(bullet, i, dt, trailBudget, null);
    }
  }

  function updateMenuScene(dt) {
    menuState.time += dt;
    var t = menuState.time;
    var cowboy = menuState.cowboy;
    if (!cowboy) return;

    cowboy.walkPhase += dt * 2.8;
    cowboy.moveAmount = 0.28 + Math.sin(t * 0.7) * 0.08 + 0.18;
    cowboy.shootKick = 0.12 + Math.max(0, Math.sin(t * 1.9)) * 0.12;

    var targetX = 3.2 + menuState.pointerX * 1.6;
    var targetZ = -1.6 - menuState.pointerY * 0.8;
    cowboy.group.position.x = cowboy.x + Math.sin(t * 0.8) * 0.12;
    cowboy.group.position.z = cowboy.z + Math.cos(t * 0.46) * 0.08;
    cowboy.group.rotation.y = Math.atan2(targetX - cowboy.group.position.x, targetZ - cowboy.group.position.z);
    updateMenuCowboyVisual(cowboy);

    for (var i = 0; i < menuState.zombies.length; i++) {
      var enemy = menuState.zombies[i];
      enemy.walkPhase += dt * (enemy.type === "fastZombie" ? 7.4 : enemy.type === "runner" ? 5 : enemy.type === "spitter" ? 2.4 : 3.2);
      enemy.moveAmount = enemy.type === "fastZombie" ? 1.08 : enemy.type === "runner" ? 0.92 : enemy.type === "spitter" ? 0.52 : 0.74;
      enemy.hitPulse = 0;
      if (enemy.type === "spitter") enemy.spitPulse = 0.24 + Math.max(0, Math.sin(t * 2.4 + i)) * 0.28;
      enemy.group.position.x = enemy.x + Math.sin(t * (0.6 + i * 0.1) + i) * (enemy.type === "fastZombie" ? 0.42 : enemy.type === "runner" ? 0.34 : 0.18);
      enemy.group.position.z = enemy.z + Math.cos(t * (0.42 + i * 0.08) + i * 0.7) * (enemy.type === "fastZombie" ? 0.34 : enemy.type === "runner" ? 0.28 : 0.14);
      enemy.group.rotation.y = Math.atan2(cowboy.group.position.x - enemy.group.position.x, cowboy.group.position.z - enemy.group.position.z);
      updateZombieVisual(enemy);
      enemy.group.scale.setScalar((enemy.menuScale || 1) * (1 + enemy.hitPulse * 0.08));
    }

    if (menuState.crate) {
      menuState.crate.age += dt;
      if (menuState.crate.body) {
        menuState.crate.body.position.y = Math.sin(menuState.crate.age * 2.8) * 0.05;
        menuState.crate.body.rotation.y = Math.sin(menuState.crate.age * 1.3) * 0.06;
      }
      if (menuState.crate.ring) {
        var ringPulse = 1 + Math.sin(menuState.crate.age * 3.6) * 0.08;
        menuState.crate.ring.rotation.z += dt * 0.7;
        menuState.crate.ring.scale.set(ringPulse, ringPulse, ringPulse);
        if (menuState.crate.ring.material) menuState.crate.ring.material.opacity = 0.32 + Math.sin(menuState.crate.age * 4.2) * 0.08;
      }
    }

    for (var j = 0; j < menuState.firePits.length; j++) {
      var fire = menuState.firePits[j];
      var flicker = 0.84 + Math.max(0, Math.sin(t * 7 + fire.phase + j)) * 0.5;
      if (fire.scorch.material) fire.scorch.material.opacity = 0.12 + flicker * 0.09;
      if (fire.ring.material) fire.ring.material.opacity = 0.22 + flicker * 0.18;
      scaleFromBase(fire.ring, 1 + Math.sin(t * 2.2 + fire.phase) * 0.12, 1 + Math.cos(t * 2.4 + fire.phase) * 0.08, 1);
      for (var f = 0; f < fire.flames.length; f++) {
        var flame = fire.flames[f];
        var wobble = Math.sin(t * 8 + fire.phase + f * 0.8) * 0.16;
        animateMesh(flame, {
          x: wobble * 0.08,
          z: Math.cos(t * 6 + fire.phase + f) * 0.05,
          y: Math.max(0, Math.sin(t * 5.4 + fire.phase + f * 0.7)) * 0.12,
        });
        scaleFromBase(flame, 1 + wobble * 0.22, 0.85 + flicker * 0.28, 1 + wobble * 0.12);
      }
      if (fire.light) fire.light.intensity = 1.7 + flicker * 1.2;
    }

    for (var d = 0; d < menuState.dust.length; d++) {
      var dust = menuState.dust[d];
      var driftX = Math.sin(t * dust.speed + dust.phase) * dust.drift;
      var driftY = Math.sin(t * (dust.speed * 1.6) + dust.phase) * 0.18;
      var driftZ = Math.cos(t * dust.speed * 0.8 + dust.phase) * dust.drift * 0.38;
      dust.mesh.position.x = dust.baseX + driftX;
      dust.mesh.position.y = dust.baseY + driftY;
      dust.mesh.position.z = dust.baseZ + driftZ;
      dust.mesh.lookAt(menuCamera.position);
      dust.mesh.rotateZ(dust.spin + Math.sin(t * 1.3 + dust.phase) * 0.22);
      if (dust.mesh.material) dust.mesh.material.opacity = 0.018 + Math.max(0, Math.sin(t * 0.9 + dust.phase)) * 0.085;
    }
  }

  function updateMenuCowboyVisual(actor) {
    var parts = actor.group.userData.animParts || {};
    var intensity = actor.moveAmount || 0;
    var stride = Math.sin(actor.walkPhase);
    var counterStride = Math.sin(actor.walkPhase + Math.PI);
    var bob = Math.abs(Math.sin(actor.walkPhase * 2)) * 0.075 * intensity + Math.sin(menuState.time * 2.6) * 0.02;
    actor.group.position.y = bob;
    actor.group.rotation.z = Math.sin(actor.walkPhase) * 0.038 * intensity;
    actor.group.rotation.x = -actor.shootKick * 0.05;
    animateMesh(parts.leftLeg, { rx: stride * 0.34 * intensity, z: -Math.abs(stride) * 0.04 * intensity });
    animateMesh(parts.rightLeg, { rx: counterStride * 0.34 * intensity, z: -Math.abs(counterStride) * 0.04 * intensity });
    animateMesh(parts.leftBoot, { rx: stride * 0.42 * intensity, z: 0.04 - Math.abs(stride) * 0.03 * intensity });
    animateMesh(parts.rightBoot, { rx: counterStride * 0.42 * intensity, z: 0.04 - Math.abs(counterStride) * 0.03 * intensity });
    animateMesh(parts.leftArm, { rx: counterStride * 0.16 * intensity - 0.06, ry: -0.12 * intensity, rz: -0.06 });
    var rightArmPose = {
      rx: -0.36 - actor.shootKick * 0.42 + stride * 0.06 * intensity,
      ry: 0.22 + actor.shootKick * 0.1,
      rz: 0.08,
      z: 0.1 - actor.shootKick * 0.12,
    };
    animateMesh(parts.rightArm, rightArmPose);
    animateMesh(parts.torso, { rz: Math.sin(actor.walkPhase) * 0.028 * intensity, z: -actor.shootKick * 0.04 });
    animateMesh(parts.shirt, { rz: Math.sin(actor.walkPhase) * 0.022 * intensity, z: 0.05 - actor.shootKick * 0.03 });
    animateMesh(parts.head, { rx: -actor.shootKick * 0.04, rz: Math.sin(actor.walkPhase) * 0.018 * intensity });
    animateMesh(parts.hatBrim, { rx: -actor.shootKick * 0.04, rz: Math.sin(actor.walkPhase) * 0.018 * intensity });
    animateMesh(parts.hatTop, { rx: -actor.shootKick * 0.04, rz: Math.sin(actor.walkPhase) * 0.018 * intensity });
    animateWeaponMeshes(actor.group, actor.shootKick + 0.12, intensity, rightArmPose);
    actor.group.scale.setScalar(actor.baseScale || 1.18);
  }

  function hasAllRightAllLeft() {
    return state.revolverUpgrade === "dualRevolvers" && hasUpgrade("allRightAllLeft");
  }

  function getOppositeDualRevolverHand(hand) {
    return hand === "left" ? "right" : "left";
  }

  function normalizeDualRevolverHand(hand) {
    return hand === "left" ? "left" : "right";
  }

  function getDualRevolverHandSide(hand) {
    return DUAL_REVOLVER_HAND_SIDES[normalizeDualRevolverHand(hand)] || -1;
  }

  function resetDualRevolverHandState() {
    state.dualActiveHand = "right";
    state.dualLastShotHand = "";
    state.dualHandAmmo = { right: 0, left: 0 };
    state.dualHandReloadTimers = { right: 0, left: 0 };
    state.dualHandFreeReloads = { right: 0, left: 0 };
    state.dualFreeReloadsEarned = 0;
  }

  function ensureDualRevolverHandState() {
    if (!state.dualHandAmmo) state.dualHandAmmo = { right: 0, left: 0 };
    if (!state.dualHandReloadTimers) state.dualHandReloadTimers = { right: 0, left: 0 };
    if (!state.dualHandFreeReloads) state.dualHandFreeReloads = { right: 0, left: 0 };
    state.dualActiveHand = normalizeDualRevolverHand(state.dualActiveHand);
    DUAL_REVOLVER_HANDS.forEach(function (hand) {
      state.dualHandAmmo[hand] = Math.round(clamp(state.dualHandAmmo[hand] || 0, 0, DUAL_REVOLVER_HAND_MAGAZINE));
      state.dualHandReloadTimers[hand] = Math.max(0, state.dualHandReloadTimers[hand] || 0);
      state.dualHandFreeReloads[hand] = Math.round(clamp(state.dualHandFreeReloads[hand] || 0, 0, DUAL_REVOLVER_FREE_RELOAD_MAX));
    });
    syncDualRevolverAggregateAmmo();
  }

  function setDualRevolverHandAmmoFromAggregate(current) {
    var magazine = getWeaponMagazine(WEAPONS.revolver);
    var amount = Math.round(clamp(current || 0, 0, magazine));
    var right = Math.min(DUAL_REVOLVER_HAND_MAGAZINE, amount);
    var left = Math.min(DUAL_REVOLVER_HAND_MAGAZINE, Math.max(0, amount - right));
    state.dualHandAmmo = { right: right, left: left };
    state.dualHandReloadTimers = { right: 0, left: 0 };
    state.dualHandFreeReloads = { right: 0, left: 0 };
    state.dualActiveHand = right > 0 || left <= 0 ? "right" : "left";
    state.dualShotSide = getDualRevolverHandSide(state.dualActiveHand);
    state.dualLastShotHand = "";
    syncDualRevolverAggregateAmmo();
  }

  function activateAllRightAllLeft() {
    setDualRevolverHandAmmoFromAggregate(state.ammo && state.ammo.revolver != null ? state.ammo.revolver : getWeaponMagazine(WEAPONS.revolver));
    state.reloadTimers.revolver = 0;
  }

  function syncDualRevolverAggregateAmmo() {
    var current = 0;
    if (state.dualHandAmmo) {
      current = (state.dualHandAmmo.right || 0) + (state.dualHandAmmo.left || 0);
    }
    if (!state.ammo) state.ammo = {};
    state.ammo.revolver = Math.round(clamp(current, 0, getWeaponMagazine(WEAPONS.revolver)));
    if (state.reloadTimers) {
      var timers = state.dualHandReloadTimers || {};
      state.reloadTimers.revolver = Math.max(timers.right || 0, timers.left || 0);
    }
  }

  function getDualRevolverReloadRemaining() {
    if (!hasAllRightAllLeft()) return state.reloadTimers.revolver || 0;
    ensureDualRevolverHandState();
    return Math.max(state.dualHandReloadTimers.right || 0, state.dualHandReloadTimers.left || 0);
  }

  function getDualRevolverReloadProgress() {
    var remaining = getDualRevolverReloadRemaining();
    if (remaining <= 0) return 0;
    return clamp(1 - remaining / getWeaponReloadTime(WEAPONS.revolver), 0, 1);
  }

  function startDualRevolverHandReload(hand) {
    if (!hasAllRightAllLeft()) return false;
    ensureDualRevolverHandState();
    hand = normalizeDualRevolverHand(hand);
    if (state.dualHandReloadTimers[hand] > 0) return false;
    if ((state.dualHandAmmo[hand] || 0) >= DUAL_REVOLVER_HAND_MAGAZINE) return false;
    if ((state.ammoReserve.revolver || 0) <= 0 && (state.dualHandFreeReloads[hand] || 0) <= 0) return false;
    state.dualHandReloadTimers[hand] = getWeaponReloadTime(WEAPONS.revolver);
    syncDualRevolverAggregateAmmo();
    if (state.player) state.player.cooldown = Math.max(state.player.cooldown, 0.08);
    return true;
  }

  function updateDualRevolverReloads(dt) {
    if (!hasAllRightAllLeft()) return false;
    ensureDualRevolverHandState();
    DUAL_REVOLVER_HANDS.forEach(function (hand) {
      if (!state.dualHandReloadTimers[hand]) return;
      state.dualHandReloadTimers[hand] = Math.max(0, state.dualHandReloadTimers[hand] - dt);
      if (state.dualHandReloadTimers[hand] > 0) return;
      state.dualHandReloadTimers[hand] = 0;
      var current = clamp(state.dualHandAmmo[hand] || 0, 0, DUAL_REVOLVER_HAND_MAGAZINE);
      var needed = Math.max(0, DUAL_REVOLVER_HAND_MAGAZINE - current);
      var free = Math.min(needed, Math.max(0, state.dualHandFreeReloads[hand] || 0));
      current += free;
      needed -= free;
      state.dualHandFreeReloads[hand] = 0;
      if (needed > 0) {
        var reserve = Math.max(0, state.ammoReserve.revolver || 0);
        var loaded = Math.min(needed, reserve);
        current += loaded;
        state.ammoReserve.revolver = reserve - loaded;
      }
      state.dualHandAmmo[hand] = Math.round(clamp(current, 0, DUAL_REVOLVER_HAND_MAGAZINE));
    });
    syncDualRevolverAggregateAmmo();
    return true;
  }

  function prepareDualRevolverHandShot() {
    if (!hasAllRightAllLeft()) return "";
    ensureDualRevolverHandState();
    var hand = normalizeDualRevolverHand(state.dualActiveHand);
    if ((state.dualHandAmmo[hand] || 0) <= 0) {
      startDualRevolverHandReload(hand);
      var other = getOppositeDualRevolverHand(hand);
      if ((state.dualHandAmmo[other] || 0) > 0) {
        hand = other;
        state.dualActiveHand = other;
      }
    }
    if ((state.dualHandAmmo[hand] || 0) <= 0) {
      startDualRevolverHandReload(hand);
      startDualRevolverHandReload(getOppositeDualRevolverHand(hand));
      syncDualRevolverAggregateAmmo();
      return "";
    }
    return hand;
  }

  function spendDualRevolverHandShot(hand) {
    if (!hasAllRightAllLeft()) return;
    ensureDualRevolverHandState();
    hand = normalizeDualRevolverHand(hand);
    state.dualHandAmmo[hand] = Math.max(0, (state.dualHandAmmo[hand] || 0) - 1);
    state.dualLastShotHand = hand;
    if (state.dualHandAmmo[hand] <= 0) {
      startDualRevolverHandReload(hand);
      var other = getOppositeDualRevolverHand(hand);
      if ((state.dualHandAmmo[other] || 0) > 0) state.dualActiveHand = other;
    }
    syncDualRevolverAggregateAmmo();
  }

  function handleAllRightAllLeftKill(source) {
    if (!hasAllRightAllLeft() || !source || source.type !== "revolver" || !source.dualHand) return;
    ensureDualRevolverHandState();
    var shotHand = normalizeDualRevolverHand(source.dualHand);
    var reloadHand = getOppositeDualRevolverHand(shotHand);
    if ((state.dualHandReloadTimers[reloadHand] || 0) <= 0) return;
    if ((state.dualHandFreeReloads[reloadHand] || 0) >= DUAL_REVOLVER_FREE_RELOAD_MAX) return;
    state.dualHandFreeReloads[reloadHand] += 1;
    state.dualFreeReloadsEarned += 1;
  }

  function initAmmoState() {
    state.ammo = {};
    state.ammoReserve = {};
    state.reloadTimers = {};
    resetDualRevolverHandState();
    Object.keys(WEAPONS).forEach(function (id) {
      var weapon = WEAPONS[id];
      var magazine = getWeaponMagazine(weapon);
      state.ammo[id] = magazine;
      state.ammoReserve[id] = Math.max(0, (weapon.reserveStart || 0) - magazine);
      state.reloadTimers[id] = 0;
    });
  }

  function resetAmmoVisualState() {
    currentAmmoIcon = "";
    ammoVisualState.weapon = "";
    ammoVisualState.magazine = 0;
    ammoVisualState.variant = "";
    ammoVisualState.current = null;
    ammoVisualState.slotSignature = "";
    if (ammoCartridgeRack) ammoCartridgeRack.innerHTML = "";
  }

  function buildAmmoRack(weapon, current) {
    if (!ammoCartridgeRack) return;
    var magazine = getWeaponMagazine(weapon);
    var variant = getAmmoRackVariantKey(weapon, magazine);
    ammoCartridgeRack.innerHTML = "";
    ammoCartridgeRack.dataset.weapon = weapon.id;
    ammoCartridgeRack.dataset.magazine = String(magazine);
    ammoCartridgeRack.dataset.largeMagazine = weapon.id === "launcher" && magazine > WEAPONS.launcher.magazine ? "true" : "false";
    ammoCartridgeRack.dataset.layout = getAmmoRackLayout(weapon, magazine);
    for (var i = 0; i < magazine; i++) {
      var round = document.createElement("span");
      round.className = "ammo-round";
      round.dataset.index = String(i);
      if (isDualRevolverAmmoRack(weapon, magazine)) {
        round.dataset.row = i < Math.ceil(magazine / 2) ? "top" : "bottom";
      }
      var live = document.createElement("span");
      live.className = "ammo-round-live";
      round.appendChild(live);
      if (isAmmoSlotSpent(weapon, magazine, current, i)) round.classList.add("is-spent");
      round.classList.toggle("is-silver-bullet", isSilverBulletAmmoSlot(weapon, magazine, i));
      round.classList.toggle("is-chain-lightning-round", isChainLightningAmmoSlot(weapon, magazine, current, i));
      ammoCartridgeRack.appendChild(round);
    }
    ammoVisualState.weapon = weapon.id;
    ammoVisualState.magazine = magazine;
    ammoVisualState.variant = variant;
    ammoVisualState.current = current;
    ammoVisualState.slotSignature = getAmmoSlotSignature(weapon, magazine, current);
  }

  function syncAmmoRack(weapon, ammo) {
    if (!ammoCartridgeRack) return;
    var magazine = ammo.magazine;
    var current = Math.round(clamp(ammo.current, 0, magazine));
    var variant = getAmmoRackVariantKey(weapon, magazine);
    var needsRebuild =
      ammoVisualState.weapon !== weapon.id ||
      ammoVisualState.magazine !== magazine ||
      ammoVisualState.variant !== variant ||
      ammoCartridgeRack.children.length !== magazine;
    if (needsRebuild) {
      buildAmmoRack(weapon, current);
      return;
    }

    var previous = ammoVisualState.current == null ? current : ammoVisualState.current;
    var previousSignature = ammoVisualState.slotSignature || "";
    var slotSignature = getAmmoSlotSignature(weapon, magazine, current);
    if (current === previous && slotSignature === previousSignature) return;
    var slots = Array.prototype.slice.call(ammoCartridgeRack.children);
    var previousSpent = slots.map(function (slot) {
      return slot.classList.contains("is-spent");
    });
    slots.forEach(function (slot, index) {
      slot.classList.toggle("is-spent", isAmmoSlotSpent(weapon, magazine, current, index));
      slot.classList.toggle("is-silver-bullet", isSilverBulletAmmoSlot(weapon, magazine, index));
      slot.classList.toggle("is-chain-lightning-round", isChainLightningAmmoSlot(weapon, magazine, current, index));
    });

    slots.forEach(function (slot, index) {
      var spent = slot.classList.contains("is-spent");
      if (spent && !previousSpent[index]) triggerAmmoDrop(slot, index);
      if (!spent && previousSpent[index]) triggerAmmoRefill(slot, index);
    });
    ammoVisualState.current = current;
    ammoVisualState.slotSignature = slotSignature;
  }

  function isDualRevolverAmmoRack(weapon, magazine) {
    return weapon && weapon.id === "revolver" && state.revolverUpgrade === "dualRevolvers" && magazine > WEAPONS.revolver.magazine;
  }

  function isDualRevolverHandAmmoRack(weapon, magazine) {
    return isDualRevolverAmmoRack(weapon, magazine) && hasAllRightAllLeft();
  }

  function getAmmoRackLayout(weapon, magazine) {
    if (isDualRevolverHandAmmoRack(weapon, magazine)) return "dual-hands";
    if (isDualRevolverAmmoRack(weapon, magazine)) return "dual";
    return "single";
  }

  function getAmmoRackVariantKey(weapon, magazine) {
    return [
      weapon ? weapon.id : "",
      getAmmoRackLayout(weapon, magazine),
      isSilverBulletAmmoSlot(weapon, magazine, 0) ? "silver" : "normal",
      hasRifleChainLightningAmmoPreview(weapon) ? "chain-lightning" : "normal-rifle",
    ].join("|");
  }

  function getAmmoSpendOrder(weapon, magazine) {
    if (!isDualRevolverAmmoRack(weapon, magazine)) {
      var normal = [];
      for (var i = magazine - 1; i >= 0; i--) normal.push(i);
      return normal;
    }

    var order = [];
    var columns = Math.ceil(magazine / 2);
    for (var col = columns - 1; col >= 0; col--) {
      order.push(col);
      var lower = columns + col;
      if (lower < magazine) order.push(lower);
    }
    return order;
  }

  function isAmmoSlotSpent(weapon, magazine, current, index) {
    if (isDualRevolverHandAmmoRack(weapon, magazine)) {
      ensureDualRevolverHandState();
      var columns = Math.ceil(magazine / 2);
      var hand = index < columns ? "right" : "left";
      var localIndex = index % columns;
      var handAmmo = clamp(state.dualHandAmmo[hand] || 0, 0, DUAL_REVOLVER_HAND_MAGAZINE);
      return localIndex >= handAmmo;
    }
    var spent = Math.max(0, magazine - Math.round(clamp(current, 0, magazine)));
    var order = getAmmoSpendOrder(weapon, magazine);
    return order.indexOf(index) >= 0 && order.indexOf(index) < spent;
  }

  function getAmmoSlotSignature(weapon, magazine, current) {
    var signature = [];
    for (var i = 0; i < magazine; i++) signature.push(isAmmoSlotSpent(weapon, magazine, current, i) ? "1" : "0");
    return signature.join("");
  }

  function isSilverBulletAmmoSlot(weapon, magazine, index) {
    return weapon && weapon.id === "revolver" && state.revolverUpgrade === "bigIron" && hasUpgrade("silverBullet") && index === 0 && magazine > 0;
  }

  function hasRifleChainLightningAmmoPreview(weapon) {
    return weapon && weapon.id === "rifle" && hasUpgrade("chainLightning");
  }

  function isChainLightningAmmoSlot(weapon, magazine, current, index) {
    if (!hasRifleChainLightningAmmoPreview(weapon)) return false;
    var order = getAmmoSpendOrder(weapon, magazine);
    var spendIndex = order.indexOf(index);
    if (spendIndex < 0) return false;
    var spent = Math.max(0, magazine - Math.round(clamp(current, 0, magazine)));
    var futureShotOffset = spendIndex - spent + 1;
    if (futureShotOffset <= 0) return false;
    var shotNumber = (state.rifleShotsFired || 0) + futureShotOffset;
    return shotNumber > 0 && shotNumber % RIFLE_LIGHTNING_SHOT_INTERVAL === 0;
  }

  function getAmmoSlotChanges(weapon, magazine, previous, current) {
    var order = getAmmoSpendOrder(weapon, magazine);
    var previousSpent = Math.max(0, magazine - Math.round(clamp(previous, 0, magazine)));
    var currentSpent = Math.max(0, magazine - Math.round(clamp(current, 0, magazine)));
    var from = Math.min(previousSpent, currentSpent);
    var to = Math.max(previousSpent, currentSpent);
    return order.slice(from, to);
  }

  function triggerAmmoDrop(slot, index) {
    if (!slot) return;
    slot.classList.remove("is-refilling");
    slot.classList.remove("is-dropping");
    var side = index % 2 === 0 ? -1 : 1;
    slot.style.setProperty("--fall-x", side * (1 + (index % 3)) + "px");
    slot.style.setProperty("--pop-y", -(16 + (index % 3) * 3) + "px");
    slot.style.setProperty("--fall-y", 42 + (index % 4) * 4 + "px");
    slot.style.setProperty("--fall-rot", side * (22 + (index % 4) * 7) + "deg");
    void slot.offsetWidth;
    slot.classList.add("is-dropping");
    window.setTimeout(function () {
      if (slot.isConnected) slot.classList.remove("is-dropping");
    }, 840);
  }

  function triggerAmmoRefill(slot, index) {
    if (!slot) return;
    slot.classList.remove("is-dropping");
    slot.classList.remove("is-refilling");
    slot.style.setProperty("--round-delay", Math.min(180, index * 18) + "ms");
    void slot.offsetWidth;
    slot.classList.add("is-refilling");
    window.setTimeout(function () {
      if (slot.isConnected) slot.classList.remove("is-refilling");
    }, 420);
  }

  function updateReloads(dt) {
    Object.keys(WEAPONS).forEach(function (id) {
      if (id === "revolver" && updateDualRevolverReloads(dt)) return;
      if (!state.reloadTimers[id]) return;
      state.reloadTimers[id] = Math.max(0, state.reloadTimers[id] - dt);
      if (state.reloadTimers[id] <= 0) {
        state.reloadTimers[id] = 0;
        var weapon = WEAPONS[id];
        var magazine = getWeaponMagazine(weapon);
        var current = clamp(state.ammo[id] || 0, 0, magazine);
        var needed = Math.max(0, magazine - current);
        var reserve = Math.max(0, state.ammoReserve[id] || 0);
        if (id === "coachGun") {
          var shellLoaded = Math.min(needed, reserve, 1);
          state.ammo[id] = current + shellLoaded;
          state.ammoReserve[id] = reserve - shellLoaded;
          if (state.ammo[id] < magazine && state.ammoReserve[id] > 0) state.reloadTimers[id] = getWeaponReloadTime(weapon);
          return;
        }
        var loaded = Math.min(needed, reserve);
        state.ammo[id] = current + loaded;
        state.ammoReserve[id] = reserve - loaded;
      }
    });
  }

  function startReload(id) {
    var weapon = WEAPONS[id];
    if (!weapon) return;
    if (id === "revolver" && hasAllRightAllLeft()) {
      ensureDualRevolverHandState();
      startDualRevolverHandReload(state.dualActiveHand);
      startDualRevolverHandReload(getOppositeDualRevolverHand(state.dualActiveHand));
      return;
    }
    if (state.reloadTimers[id] > 0) return;
    var magazine = getWeaponMagazine(weapon);
    var current = clamp(state.ammo[id] || 0, 0, magazine);
    if (current >= magazine) return;
    if ((state.ammoReserve[id] || 0) <= 0) return;
    state.reloadTimers[id] = getWeaponReloadTime(weapon);
    if (state.player) state.player.cooldown = Math.max(state.player.cooldown, 0.08);
  }

  function getAmmoState(id) {
    var weapon = WEAPONS[id] || WEAPONS.revolver;
    var magazine = getWeaponMagazine(weapon);
    if (weapon.id === "revolver" && hasAllRightAllLeft()) {
      ensureDualRevolverHandState();
      var dualRemaining = getDualRevolverReloadRemaining();
      var dualCurrent = clamp((state.dualHandAmmo.right || 0) + (state.dualHandAmmo.left || 0), 0, magazine);
      var dualReserve = Math.max(0, state.ammoReserve.revolver || 0);
      return {
        current: dualCurrent,
        magazine: magazine,
        reserve: dualReserve,
        total: dualCurrent + dualReserve,
        reloading: dualRemaining > 0,
        reloadRemaining: dualRemaining,
        reloadProgress: getDualRevolverReloadProgress(),
        dualHands: {
          active: state.dualActiveHand,
          lastShot: state.dualLastShotHand || "",
          maxFreeReloads: DUAL_REVOLVER_FREE_RELOAD_MAX,
          right: {
            current: state.dualHandAmmo.right || 0,
            magazine: DUAL_REVOLVER_HAND_MAGAZINE,
            reloading: (state.dualHandReloadTimers.right || 0) > 0,
            reloadRemaining: state.dualHandReloadTimers.right || 0,
            freeReloads: state.dualHandFreeReloads.right || 0,
          },
          left: {
            current: state.dualHandAmmo.left || 0,
            magazine: DUAL_REVOLVER_HAND_MAGAZINE,
            reloading: (state.dualHandReloadTimers.left || 0) > 0,
            reloadRemaining: state.dualHandReloadTimers.left || 0,
            freeReloads: state.dualHandFreeReloads.left || 0,
          },
        },
      };
    }
    var remaining = state.reloadTimers[weapon.id] || 0;
    var current = state.ammo[weapon.id] == null ? magazine : clamp(state.ammo[weapon.id], 0, magazine);
    var reserve = Math.max(0, state.ammoReserve[weapon.id] || 0);
    return {
      current: current,
      magazine: magazine,
      reserve: reserve,
      total: current + reserve,
      reloading: remaining > 0,
      reloadRemaining: remaining,
      reloadProgress: remaining > 0 ? clamp(1 - remaining / getWeaponReloadTime(weapon), 0, 1) : 0,
    };
  }

  function getWeaponMagazine(weapon) {
    if (!weapon) return 0;
    if (weapon.id === "revolver") return weapon.magazine + (state.revolverMagazineBonus || 0);
    if (weapon.id === "rifle") return Math.round(weapon.magazine * Math.max(1, state.rifleMagazineMultiplier || 1));
    if (weapon.id === "launcher") return Math.round(weapon.magazine * Math.max(1, state.launcherMagazineMultiplier || 1));
    return weapon.magazine;
  }

  function getWeaponReloadTime(weapon) {
    if (!weapon) return 0;
    var speed = 1 + Math.max(0, state.reloadSpeedBonus || 0);
    if (weapon.id === "coachGun") {
      if ((state.marshalPurifyReloadTimer || 0) > 0) speed *= 1.25;
      if (isPlayerInHallowedGround()) speed *= 1.25;
    }
    return weapon.reloadTime / speed;
  }

  function getWeaponCooldown(weapon) {
    if (!weapon) return 0;
    var cooldown = weapon.cooldown / (1 + Math.max(0, state.fireRateBonus || 0));
    if (weapon.id === "launcher") {
      cooldown /= getLauncherMadmanFireRateMultiplier();
    }
    if (weapon.id === "revolver" && state.revolverUpgrade === "dualRevolvers" && state.fanTheHammerTimer > 0) {
      cooldown *= 0.55;
    }
    if (weapon.id === "rifle" && state.rifleStormTempoTimer > 0) {
      cooldown *= 0.68;
    }
    return cooldown;
  }

  function getLauncherMadmanFireRateMultiplier() {
    if (state.launcherUpgrade !== "bombardier" || !hasUpgrade("madmansJourney")) return 1;
    return Math.min(2.5, 1 + Math.max(0, state.launcherMadmanStacks || 0) * LAUNCHER_MADMAN_STACK_BONUS);
  }

  function updatePlayer(dt) {
    var p = state.player;
    var mx = 0;
    var mz = 0;
    var oldX = p.x;
    var oldZ = p.z;
    var activeMoveSpeed = p.speed * ((state.marshalRecoilSpeedTimer || 0) > 0 ? 1.3 : 1);
    if (keys.KeyW || keys.ArrowUp) mz -= 1;
    if (keys.KeyS || keys.ArrowDown) mz += 1;
    if (keys.KeyA || keys.ArrowLeft) mx -= 1;
    if (keys.KeyD || keys.ArrowRight) mx += 1;
    var touchVector = getTouchMoveVector();
    mx += touchVector.x;
    mz += touchVector.z;
    var len = Math.hypot(mx, mz);
    if (len > 0) {
      mx /= len;
      mz /= len;
      var touchLen = Math.hypot(touchVector.x, touchVector.z);
      if (touchLen > 0.18) {
        lastMobileAim.x = touchVector.x / touchLen;
        lastMobileAim.z = touchVector.z / touchLen;
      }
      p.x += mx * activeMoveSpeed * dt;
      p.z += mz * activeMoveSpeed * dt;
      p.x = clamp(p.x, -ARENA_W / 2 + p.radius, ARENA_W / 2 - p.radius);
      p.z = clamp(p.z, -ARENA_D / 2 + p.radius, ARENA_D / 2 - p.radius);
    }
    resolveMoverPosition(p, p.radius, 0);
    var moved = Math.hypot(p.x - oldX, p.z - oldZ);
    p.moveAmount += (clamp(moved / Math.max(0.001, activeMoveSpeed * dt), 0, 1) - p.moveAmount) * Math.min(1, dt * 12);
    p.walkPhase += dt * (7.5 + activeMoveSpeed * 0.5) * p.moveAmount;
    p.cooldown = Math.max(0, p.cooldown - dt);
    p.invuln = Math.max(0, p.invuln - dt);
    if (state.hpRegen > 0 && p.hp < p.maxHp) p.hp = Math.min(p.maxHp, p.hp + state.hpRegen * dt);
    state.fanTheHammerTimer = Math.max(0, state.fanTheHammerTimer - dt);
    updateDuelistFocus(dt, p.moveAmount);
    p.group.position.set(p.x, 0, p.z);

    if ((pointerDown || touchFire.active || mobileFieldFire.active) && p.cooldown <= 0) shoot();
  }

  function updateDuelistFocus(dt, moveAmount) {
    if (state.revolverUpgrade !== "dualRevolvers" || !hasUpgrade("duelistFocus")) {
      state.duelistFocus = 0;
      return;
    }
    if (moveAmount > 0.28) {
      state.duelistFocus = Math.min(1, state.duelistFocus + dt * DUELIST_FOCUS_GAIN_RATE);
    } else {
      state.duelistFocus = Math.max(0, state.duelistFocus - dt * DUELIST_FOCUS_DECAY_RATE);
    }
  }

  function updateMarshalSystems(dt) {
    state.marshalRecoilSpeedTimer = Math.max(0, (state.marshalRecoilSpeedTimer || 0) - dt);
    state.marshalPurifyReloadTimer = Math.max(0, (state.marshalPurifyReloadTimer || 0) - dt);
    updateMarshalHallowedGrounds(dt);
    updateMarshalBounty(dt);
  }

  function updateMarshalBounty(dt) {
    if (state.playerClass !== "marshal" || state.marshalUpgrade !== "graveWarden" || !hasUpgrade("heavensBounty")) {
      state.marshalBountyEnemy = null;
      state.marshalBountyTimer = 12;
      return;
    }
    state.marshalBountyTimer = Math.max(0, (state.marshalBountyTimer == null ? 12 : state.marshalBountyTimer) - dt);
    var current = state.marshalBountyEnemy;
    if (current && current.active !== false && current.marshalBounty && (current.marshalBountyTimer || 0) > 0) return;
    state.marshalBountyEnemy = null;
    if (state.marshalBountyTimer > 0 || !state.player) return;
    var best = null;
    var bestScore = -Infinity;
    for (var i = 0; i < state.enemies.length; i++) {
      var enemy = state.enemies[i];
      if (!enemy || enemy.active === false) continue;
      var distance = Math.hypot(enemy.x - state.player.x, enemy.z - state.player.z);
      if (distance > 28) continue;
      var danger = enemy.maxHp * 12 + enemy.damage + enemy.xp * 1.5 - distance * 0.12;
      if (enemy.type === "spitter") danger += 26;
      if (enemy.type === "brute") danger += 20;
      if (danger > bestScore) {
        bestScore = danger;
        best = enemy;
      }
    }
    if (!best) {
      state.marshalBountyTimer = 1;
      return;
    }
    best.marshalBounty = true;
    best.marshalBountyTimer = 8;
    best.marshalMarkTimer = Math.max(best.marshalMarkTimer || 0, 8);
    state.marshalBountyEnemy = best;
    state.marshalBountyTimer = 12;
    state.marshalBountiesMarked += 1;
    addShockwave(best.x, best.z, 1.75, 0.32, 0xffe6a2);
  }

  function createMarshalHallowedVisual() {
    var group = new THREE.Group();
    group.name = "hallowed ground";
    var material = mats.hallowedGround.clone();
    var ring = new THREE.Mesh(
      getSharedGeometry("marshal-hallowed-ring", function () {
        return new THREE.RingGeometry(0.72, 1, 40);
      }),
      material
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.07;
    ring.renderOrder = 2;
    group.add(ring);
    var inner = new THREE.Mesh(
      getSharedGeometry("marshal-hallowed-inner-ring", function () {
        return new THREE.RingGeometry(0.25, 0.32, 24);
      }),
      material
    );
    inner.rotation.x = -Math.PI / 2;
    inner.position.y = 0.075;
    inner.renderOrder = 2;
    group.add(inner);
    var visual = { group: group, ring: ring, inner: inner, material: material };
    group.userData.marshalHallowedVisual = visual;
    marshalHallowedVisualCreated += 1;
    return visual;
  }

  function acquireMarshalHallowedVisual(x, z, radius) {
    var visual = marshalHallowedVisualPool.length ? marshalHallowedVisualPool.pop() : createMarshalHallowedVisual();
    visual.group.visible = true;
    visual.group.position.set(x, 0, z);
    visual.group.scale.setScalar(radius);
    visual.group.rotation.y = 0;
    visual.material.opacity = 0.3;
    effectRoot.add(visual.group);
    marshalHallowedVisualInUse += 1;
    return visual;
  }

  function releaseMarshalHallowedVisual(visual) {
    if (!visual) return;
    if (visual.group.parent) visual.group.parent.remove(visual.group);
    visual.group.visible = false;
    visual.group.position.set(0, -1000, 0);
    visual.group.scale.setScalar(1);
    marshalHallowedVisualInUse = Math.max(0, marshalHallowedVisualInUse - 1);
    marshalHallowedVisualPool.push(visual);
  }

  function spawnMarshalHallowedGround(x, z) {
    while (state.marshalHallowedGrounds.length >= COACH_GUN_MAX_HALLOWED_GROUNDS) removeMarshalHallowedGround(0);
    var radius = 3.8;
    var visual = acquireMarshalHallowedVisual(x, z, radius);
    state.marshalHallowedGrounds.push({ x: x, z: z, radius: radius, life: 5, startLife: 5, visual: visual });
    state.marshalHallowedGroundsCreated += 1;
    addShockwave(x, z, radius, 0.5, 0xffe2a0);
  }

  function updateMarshalHallowedGrounds(dt) {
    for (var i = state.marshalHallowedGrounds.length - 1; i >= 0; i--) {
      var ground = state.marshalHallowedGrounds[i];
      ground.life -= dt;
      var t = clamp(ground.life / ground.startLife, 0, 1);
      if (ground.visual) {
        ground.visual.group.rotation.y += dt * 0.24;
        ground.visual.material.opacity = 0.12 + Math.sin(state.time * 4.2 + i) * 0.04 + t * 0.16;
        ground.visual.inner.rotation.z -= dt * 0.6;
      }
      if (ground.life <= 0) removeMarshalHallowedGround(i);
    }
  }

  function removeMarshalHallowedGround(index) {
    var ground = state.marshalHallowedGrounds[index];
    if (!ground) return;
    releaseMarshalHallowedVisual(ground.visual);
    state.marshalHallowedGrounds.splice(index, 1);
  }

  function releaseAllMarshalHallowedGrounds() {
    if (!state.marshalHallowedGrounds) return;
    for (var i = state.marshalHallowedGrounds.length - 1; i >= 0; i--) removeMarshalHallowedGround(i);
  }

  function tryRaisePaleDeputy(x, z) {
    if (!state.paleDeputies || state.paleDeputies.length >= PALE_DEPUTY_MAX_COUNT) {
      state.marshalPaleDeputySpawnBlocked = (state.marshalPaleDeputySpawnBlocked || 0) + 1;
      return null;
    }
    var deputy = acquirePaleDeputyEntity(x, z);
    resolveMoverPosition(deputy, deputy.radius, 0);
    deputy.group.position.set(deputy.x, 0, deputy.z);
    state.paleDeputies.push(deputy);
    state.marshalPaleDeputiesRaised = (state.marshalPaleDeputiesRaised || 0) + 1;
    spawnPaleDeputyRiseEffect(deputy.x, deputy.z, 1);
    return deputy;
  }

  function spawnPaleDeputyRiseEffect(x, z, strength) {
    var amount = clamp(Number(strength) || 1, 0.35, 1.3);
    addShockwave(x, z, 2.1 * amount, 0.42, 0x9adfff);
    for (var i = 0; i < 10; i++) {
      var angle = (Math.PI * 2 * i) / 10;
      var speed = 1.2 + (i % 3) * 0.45;
      spawnParticle(
        x + Math.cos(angle) * 0.28,
        0.24 + (i % 4) * 0.12,
        z + Math.sin(angle) * 0.28,
        Math.cos(angle) * speed,
        1.7 + (i % 3) * 0.42,
        Math.sin(angle) * speed,
        0.34 + (i % 3) * 0.06,
        0.08 + (i % 2) * 0.035,
        i % 3 === 0 ? mats.paleDeputyBadge : mats.paleDeputyTracer
      );
    }
  }

  function getPaleDeputyFormationPoint(index, out) {
    var result = out || { x: 0, z: 0 };
    if (!state.player) {
      result.x = 0;
      result.z = 0;
      return result;
    }
    var angle = state.player.aimAngle || 0;
    var forwardX = Math.sin(angle);
    var forwardZ = Math.cos(angle);
    var rightX = Math.cos(angle);
    var rightZ = -Math.sin(angle);
    var side = index === 0 ? -2.05 : index === 1 ? 2.05 : 0;
    var back = index === 2 ? 2.75 : 1.55;
    result.x = state.player.x + rightX * side - forwardX * back;
    result.z = state.player.z + rightZ * side - forwardZ * back;
    return result;
  }

  function isPaleDeputyInsideSafeView(deputy, visibleGround) {
    return !pointOutsideVisibleGround(deputy.x, deputy.z, -1.25, visibleGround);
  }

  function repositionPaleDeputy(deputy, index) {
    if (!deputy || !state.player) return;
    var oldX = deputy.x;
    var oldZ = deputy.z;
    getPaleDeputyFormationPoint(index, paleDeputyFormationScratch);
    var clear = findNearestClearGroundPoint(paleDeputyFormationScratch.x, paleDeputyFormationScratch.z, deputy.radius + 0.08);
    paleDeputyClearPointScratch.x = clear.x;
    paleDeputyClearPointScratch.z = clear.z;
    deputy.x = paleDeputyClearPointScratch.x;
    deputy.z = paleDeputyClearPointScratch.z;
    resolveMoverPosition(deputy, deputy.radius, 0);
    deputy.group.position.set(deputy.x, 0, deputy.z);
    deputy.target = null;
    state.marshalPaleDeputyRepositions = (state.marshalPaleDeputyRepositions || 0) + 1;
    spawnPaleDeputyRiseEffect(oldX, oldZ, 0.42);
    spawnPaleDeputyRiseEffect(deputy.x, deputy.z, 0.62);
  }

  function isValidPaleDeputyTarget(deputy, enemy, visibleGround) {
    if (!deputy || !enemy || enemy.active === false || !state.player) return false;
    var playerDx = enemy.x - state.player.x;
    var playerDz = enemy.z - state.player.z;
    var targetRadius = PALE_DEPUTY_TARGET_RADIUS + enemy.radius * 0.35;
    if (playerDx * playerDx + playerDz * playerDz > targetRadius * targetRadius) return false;
    var dx = enemy.x - deputy.x;
    var dz = enemy.z - deputy.z;
    var attackRange = PALE_DEPUTY_ATTACK_RANGE + enemy.radius * 0.25;
    if (dx * dx + dz * dz > attackRange * attackRange) return false;
    if (pointOutsideVisibleGround(enemy.x, enemy.z, enemy.radius + 0.35, visibleGround)) return false;
    return !findBlockingObstacle(deputy.x, deputy.z, enemy.x, enemy.z, 0.12, null);
  }

  function findPaleDeputyTarget(deputy, visibleGround) {
    var best = null;
    var bestScore = Infinity;
    for (var i = 0; i < state.enemies.length; i++) {
      var enemy = state.enemies[i];
      if (!isValidPaleDeputyTarget(deputy, enemy, visibleGround)) continue;
      var dx = enemy.x - deputy.x;
      var dz = enemy.z - deputy.z;
      var score = dx * dx + dz * dz;
      // Preserve the Marshal's executions when an ordinary target is available.
      if (isMarshalEnemyMarked(enemy)) score += 120;
      if (enemy.marshalBounty) score += 180;
      if (score < bestScore) {
        bestScore = score;
        best = enemy;
      }
    }
    return best;
  }

  function updatePaleDeputies(dt) {
    if (!state.paleDeputies || !state.paleDeputies.length || !state.player) return;
    var visibleGround = getCurrentVisibleGroundRect(paleDeputyVisibleGroundScratch);
    for (var i = state.paleDeputies.length - 1; i >= 0; i--) {
      var deputy = state.paleDeputies[i];
      if (!deputy || !deputy.active) {
        state.paleDeputies.splice(i, 1);
        continue;
      }
      if (!deputy.previewDisplay) deputy.life -= dt;
      if (deputy.life <= 0) {
        removePaleDeputy(i, true);
        continue;
      }

      if (deputy.previewDisplay) {
        deputy.speed = getPaleDeputyPlayerSpeed();
        deputy.actualMoveSpeed = deputy.speed;
        deputy.target = null;
        deputy.group.rotation.y = -0.34;
        deputy.group.position.set(deputy.x, 0, deputy.z);
        animatePaleDeputy(deputy, dt);
        continue;
      }

      deputy.attackTimer = Math.max(0, deputy.attackTimer - dt);
      deputy.shotPulse = Math.max(0, deputy.shotPulse - dt * 6.5);
      deputy.speed = getPaleDeputyPlayerSpeed();
      var playerDistance = Math.hypot(deputy.x - state.player.x, deputy.z - state.player.z);
      if (playerDistance > PALE_DEPUTY_HARD_LEASH || !isPaleDeputyInsideSafeView(deputy, visibleGround)) {
        repositionPaleDeputy(deputy, i);
        playerDistance = Math.hypot(deputy.x - state.player.x, deputy.z - state.player.z);
      }

      getPaleDeputyFormationPoint(i, paleDeputyFormationScratch);
      var moveX = paleDeputyFormationScratch.x - deputy.x;
      var moveZ = paleDeputyFormationScratch.z - deputy.z;
      var moveDistance = Math.hypot(moveX, moveZ);
      deputy.actualMoveSpeed = deputy.speed;
      var oldX = deputy.x;
      var oldZ = deputy.z;
      if (moveDistance > 0.08) {
        var moveStep = Math.min(moveDistance, deputy.actualMoveSpeed * dt);
        deputy.x += (moveX / moveDistance) * moveStep;
        deputy.z += (moveZ / moveDistance) * moveStep;
        resolveMoverPosition(deputy, deputy.radius, 0);
      }
      var moved = Math.hypot(deputy.x - oldX, deputy.z - oldZ);
      deputy.moveAmount += (clamp(moved / Math.max(0.001, deputy.actualMoveSpeed * dt), 0, 1) - deputy.moveAmount) * Math.min(1, dt * 11);
      deputy.walkPhase += dt * (7.2 + deputy.speed * 0.48) * deputy.moveAmount;

      if (!isValidPaleDeputyTarget(deputy, deputy.target, visibleGround)) deputy.target = null;
      if (deputy.attackTimer <= 0) deputy.target = findPaleDeputyTarget(deputy, visibleGround);
      var aimX = Math.sin(state.player.aimAngle || 0);
      var aimZ = Math.cos(state.player.aimAngle || 0);
      if (deputy.target && deputy.target.active !== false) {
        var targetDx = deputy.target.x - deputy.x;
        var targetDz = deputy.target.z - deputy.z;
        var targetDistance = Math.max(0.001, Math.hypot(targetDx, targetDz));
        aimX = targetDx / targetDistance;
        aimZ = targetDz / targetDistance;
      }
      deputy.group.rotation.y = Math.atan2(aimX, aimZ);
      deputy.group.position.set(deputy.x, 0, deputy.z);
      animatePaleDeputy(deputy, dt);

      if (deputy.attackTimer <= 0 && deputy.target && deputy.target.active !== false) {
        paleDeputyAttack(deputy, deputy.target);
        deputy.attackTimer = PALE_DEPUTY_ATTACK_COOLDOWN;
      }
    }
  }

  function animatePaleDeputy(deputy, dt) {
    var parts = deputy.parts;
    var stride = Math.sin(deputy.walkPhase);
    var bob = Math.abs(Math.sin(deputy.walkPhase * 2)) * 0.045 * deputy.moveAmount;
    var spectral = Math.sin(state.time * 4.8 + deputy.phase);
    var fadeScale = deputy.life < 0.35 ? clamp(deputy.life / 0.35, 0.2, 1) : 1;
    animateMeshValues(deputy.body, 0, 0, spectral * 0.008, 0, bob + spectral * 0.018, 0);
    scaleFromBase(deputy.body, fadeScale, fadeScale, fadeScale);
    animateMeshValues(parts.leftLeg, stride * 0.48 * deputy.moveAmount, 0, 0, 0, 0, 0);
    animateMeshValues(parts.rightLeg, -stride * 0.48 * deputy.moveAmount, 0, 0, 0, 0, 0);
    animateMeshValues(parts.leftTail, 0.18 + stride * 0.14 * deputy.moveAmount + spectral * 0.04, 0, -0.04, 0, 0, 0);
    animateMeshValues(parts.rightTail, 0.16 - stride * 0.12 * deputy.moveAmount - spectral * 0.04, 0, 0.04, 0, 0, 0);
    animateMeshValues(parts.leftArm, -0.18 - stride * 0.16 * deputy.moveAmount, 0, -0.08, 0, 0, 0);
    animateMeshValues(parts.weaponRig, -0.17 - deputy.shotPulse * 0.28, 0, 0.06, 0, deputy.shotPulse * 0.035, -deputy.shotPulse * 0.19);
    animateMeshValues(parts.jaw, spectral * 0.025, 0, 0, 0, Math.max(0, spectral) * 0.018, 0);
    animateMeshValues(parts.outerSeal, 0, 0, state.time * 0.42 + deputy.phase, 0, 0, 0);
    animateMeshValues(parts.innerSeal, 0, 0, -state.time * 0.68 - deputy.phase, 0, 0, 0);
    var sealPulse = 1 + spectral * 0.055;
    scaleFromBase(parts.outerSeal, sealPulse, sealPulse, 1);
    scaleFromBase(parts.innerSeal, 1.04 - spectral * 0.065, 1.04 - spectral * 0.065, 1);
    var eyePulse = 0.9 + (spectral + 1) * 0.15 + deputy.shotPulse * 0.4;
    scaleFromBase(parts.leftEyeGlow, eyePulse, eyePulse, eyePulse);
    scaleFromBase(parts.rightEyeGlow, eyePulse, eyePulse, eyePulse);
    scaleFromBase(parts.badge, 1 + spectral * 0.09, 1 + spectral * 0.09, 1);
    scaleFromBase(parts.weaponMuzzle, 0.72 + deputy.shotPulse * 1.65, 0.72 + deputy.shotPulse * 1.65, 0.72 + deputy.shotPulse * 1.65);
    for (var i = 0; i < parts.sealMarkers.length; i++) {
      var markerPulse = 0.86 + Math.max(0, Math.sin(state.time * 5.2 + deputy.phase + i * 1.57)) * 0.42;
      scaleFromBase(parts.sealMarkers[i], markerPulse, 1, markerPulse);
    }
  }

  function paleDeputyAttack(deputy, target) {
    if (!deputy || !target || target.active === false) return false;
    var dx = target.x - deputy.x;
    var dz = target.z - deputy.z;
    var distance = Math.max(0.001, Math.hypot(dx, dz));
    var dirX = dx / distance;
    var dirZ = dz / distance;
    var context = {
      type: "paleDeputyCoachGun",
      startX: deputy.x + dirX * 0.48,
      startZ: deputy.z + dirZ * 0.48,
      dirX: dirX,
      dirZ: dirZ,
      spread: PALE_DEPUTY_SPREAD,
      range: PALE_DEPUTY_ATTACK_RANGE,
      pelletCount: PALE_DEPUTY_PELLET_COUNT,
      entries: [],
      visualRays: [],
    };
    ensureZombieSpatialGridCurrent();
    var visualPelletCount = Math.min(COACH_GUN_STANDARD_TRACER_COUNT, context.pelletCount);
    var nextVisualSlot = 0;
    for (var i = 0; i < context.pelletCount; i++) {
      var offset = context.pelletCount <= 1 ? 0 : (i / (context.pelletCount - 1) - 0.5) * context.spread;
      var nextVisualIndex =
        visualPelletCount <= 1 ? Math.floor((context.pelletCount - 1) * 0.5) : Math.round((nextVisualSlot * (context.pelletCount - 1)) / (visualPelletCount - 1));
      var captureVisual = nextVisualSlot < visualPelletCount && i === nextVisualIndex;
      if (captureVisual) nextVisualSlot += 1;
      var hit = traceCoachGunRay(context, offset, false, captureVisual);
      if (hit) addCoachGunVolleyHit(context, hit, false);
    }

    for (var ray = 0; ray < context.visualRays.length; ray += 4) {
      spawnPaleDeputyTracer(
        context.startX,
        1.25,
        context.startZ,
        context.visualRays[ray],
        context.visualRays[ray + 1],
        context.visualRays[ray + 2]
      );
    }
    deputy.shotPulse = 1;
    state.marshalPaleDeputyShots = (state.marshalPaleDeputyShots || 0) + 1;

    context.entries.sort(function (a, b) {
      return a.distance - b.distance;
    });
    for (var entryIndex = 0; entryIndex < context.entries.length; entryIndex++) {
      var entry = context.entries[entryIndex];
      var enemy = entry.enemy;
      if (!enemy || enemy.active === false) continue;
      var falloff = clamp(1 - (entry.distance / Math.max(1, context.range)) * 0.55, 0.45, 1);
      var damage = PALE_DEPUTY_PELLET_DAMAGE * entry.pellets * falloff;
      var wasActive = enemy.active !== false;
      damageEnemy(enemy, damage, entry.x, entry.z, deputy.source);
      if (wasActive && enemy.active === false) {
        state.marshalPaleDeputyKills = (state.marshalPaleDeputyKills || 0) + 1;
        if (enemy === deputy.target) deputy.target = null;
      }
    }
    zombieSpatialDirty = true;
    return true;
  }

  function spawnPaleDeputyTracer(startX, startY, startZ, dirX, dirZ, distance) {
    while (state.paleDeputyTracers.length >= MAX_PALE_DEPUTY_TRACERS) removePaleDeputyTracer(0);
    var position = { x: startX, y: startY, z: startZ };
    var size = { width: 0.1, length: 0.78 };
    var visual = acquireProjectileVisual("standard", position, Math.atan2(dirX, dirZ), size, mats.coachTracer);
    state.paleDeputyTracers.push({
      x: startX,
      y: startY,
      z: startZ,
      dirX: dirX,
      dirZ: dirZ,
      speed: 50,
      remaining: Math.max(0.08, distance - 0.34),
      visual: visual,
      mesh: visual.object,
    });
    state.marshalPaleDeputyTracers = (state.marshalPaleDeputyTracers || 0) + 1;
  }

  function updatePaleDeputyTracers(dt) {
    for (var i = state.paleDeputyTracers.length - 1; i >= 0; i--) {
      var tracer = state.paleDeputyTracers[i];
      var step = Math.min(tracer.remaining, tracer.speed * dt);
      tracer.x += tracer.dirX * step;
      tracer.z += tracer.dirZ * step;
      tracer.remaining -= step;
      tracer.mesh.position.set(tracer.x, tracer.y, tracer.z);
      syncStandardProjectileVisual(tracer.visual);
      if (tracer.remaining <= 0.0001) removePaleDeputyTracer(i);
    }
  }

  function removePaleDeputyTracer(index) {
    var tracer = state.paleDeputyTracers[index];
    if (!tracer) return;
    releaseProjectileVisual(tracer.visual);
    state.paleDeputyTracers.splice(index, 1);
  }

  function releaseAllPaleDeputyTracersToPool() {
    if (!state.paleDeputyTracers) return;
    for (var i = state.paleDeputyTracers.length - 1; i >= 0; i--) {
      var tracer = state.paleDeputyTracers[i];
      if (tracer && tracer.visual) releaseProjectileVisual(tracer.visual);
    }
    state.paleDeputyTracers = [];
  }

  function removePaleDeputy(index, showEffect) {
    var deputy = state.paleDeputies[index];
    if (!deputy) return;
    if (showEffect) spawnPaleDeputyRiseEffect(deputy.x, deputy.z, 0.55);
    releasePaleDeputyEntity(deputy);
    state.paleDeputies.splice(index, 1);
  }

  function releaseAllPaleDeputies() {
    if (!state.paleDeputies) return;
    for (var i = state.paleDeputies.length - 1; i >= 0; i--) removePaleDeputy(i, false);
    state.paleDeputies = [];
  }

  function getPaleDeputyDiagnostics() {
    var visibleGround = getCurrentVisibleGroundRect(paleDeputyVisibleGroundScratch);
    var units = (state.paleDeputies || []).map(function (deputy) {
      var meshCount = 0;
      var materialIds = Object.create(null);
      deputy.group.traverse(function (child) {
        if (!child.isMesh) return;
        meshCount += 1;
        var materials = Array.isArray(child.material) ? child.material : [child.material];
        for (var i = 0; i < materials.length; i++) {
          if (materials[i] && materials[i].uuid) materialIds[materials[i].uuid] = true;
        }
      });
      var parts = deputy.parts || {};
      return {
        groupId: deputy.group.uuid,
        x: Number(deputy.x.toFixed(2)),
        z: Number(deputy.z.toFixed(2)),
        life: Number(deputy.life.toFixed(3)),
        speed: Number(deputy.speed.toFixed(3)),
        actualMoveSpeed: Number(deputy.actualMoveSpeed.toFixed(3)),
        distanceToPlayer: state.player ? Number(Math.hypot(deputy.x - state.player.x, deputy.z - state.player.z).toFixed(3)) : 0,
        targetType: deputy.target && deputy.target.active !== false ? deputy.target.type : null,
        targetMarked: !!(deputy.target && deputy.target.active !== false && isMarshalEnemyMarked(deputy.target)),
        visible: !!(deputy.active && deputy.group.visible),
        insideView: !pointOutsideVisibleGround(deputy.x, deputy.z, 0, visibleGround),
        modelVersion: deputy.group.userData.paleDeputyModelVersion || 0,
        modelScale: PALE_DEPUTY_MODEL_SCALE,
        visualHeight: Number((3.405 * PALE_DEPUTY_MODEL_SCALE).toFixed(3)),
        playerVisualHeight: 2.91,
        smallerThanPlayer: 3.405 * PALE_DEPUTY_MODEL_SCALE < 2.91,
        modelParts: meshCount,
        materialCount: Object.keys(materialIds).length,
        hasHat: !!(parts.hatBrim && parts.hatCrown && parts.hatBand),
        hasBadge: !!parts.badge,
        hasWeapon: !!(parts.weaponRig && parts.weaponMuzzle),
        weaponType: "coachGun",
        hasDefaultCoachGun: !!(parts.weaponLeftBarrel && parts.weaponRightBarrel && parts.weaponReceiver && parts.weaponStock && parts.weaponForeEnd),
        hasAura: !!(parts.outerSeal && parts.innerSeal),
        hasCoatTails: !!(parts.leftTail && parts.rightTail),
        hasEyeGlow: !!(parts.leftEyeGlow && parts.rightEyeGlow),
      };
    });
    return {
      active: units.length,
      max: PALE_DEPUTY_MAX_COUNT,
      lifetime: PALE_DEPUTY_LIFETIME,
      damage: Number(PALE_DEPUTY_DAMAGE.toFixed(2)),
      pelletDamage: PALE_DEPUTY_PELLET_DAMAGE,
      pelletCount: PALE_DEPUTY_PELLET_COUNT,
      spread: PALE_DEPUTY_SPREAD,
      attackCooldown: PALE_DEPUTY_ATTACK_COOLDOWN,
      attackRange: PALE_DEPUTY_ATTACK_RANGE,
      targetRadius: PALE_DEPUTY_TARGET_RADIUS,
      hardLeash: PALE_DEPUTY_HARD_LEASH,
      summoned: state.marshalPaleDeputiesRaised || 0,
      spawnBlocked: state.marshalPaleDeputySpawnBlocked || 0,
      shots: state.marshalPaleDeputyShots || 0,
      kills: state.marshalPaleDeputyKills || 0,
      tracers: state.paleDeputyTracers ? state.paleDeputyTracers.length : 0,
      tracersSpawned: state.marshalPaleDeputyTracers || 0,
      repositions: state.marshalPaleDeputyRepositions || 0,
      pool: {
        available: paleDeputyPool.length,
        created: paleDeputyCreated,
        inUse: paleDeputyInUse,
      },
      units: units,
    };
  }

  function isEnemyInHallowedGround(enemy) {
    if (!enemy || !state.marshalHallowedGrounds.length) return false;
    for (var i = 0; i < state.marshalHallowedGrounds.length; i++) {
      var ground = state.marshalHallowedGrounds[i];
      var dx = enemy.x - ground.x;
      var dz = enemy.z - ground.z;
      if (dx * dx + dz * dz <= ground.radius * ground.radius) return true;
    }
    return false;
  }

  function isPlayerInHallowedGround() {
    if (!state.player || !state.marshalHallowedGrounds.length) return false;
    for (var i = 0; i < state.marshalHallowedGrounds.length; i++) {
      var ground = state.marshalHallowedGrounds[i];
      var dx = state.player.x - ground.x;
      var dz = state.player.z - ground.z;
      if (dx * dx + dz * dz <= ground.radius * ground.radius) return true;
    }
    return false;
  }

  function updateAmmoCrates(dt) {
    state.ammoCrateTimer = Math.max(0, state.ammoCrateTimer - dt);
    if (state.ammoCrateTimer <= 0) {
      if (countStandardAmmoCrates() < MAX_AMMO_CRATES) spawnAmmoCrate();
      state.ammoCrateTimer = rand(16, 25);
    }

    for (var i = state.ammoCrates.length - 1; i >= 0; i--) {
      var crate = state.ammoCrates[i];
      crate.age += dt;
      if (crate.body) {
        crate.body.position.y = Math.sin(crate.age * 3.1) * 0.06;
        crate.body.rotation.y = Math.sin(crate.age * 1.7) * 0.08;
      }
      if (crate.ring) {
        crate.ring.rotation.z += dt * 0.85;
        var ringPulse = 1 + Math.sin(crate.age * 3.8) * 0.055;
        crate.ring.scale.set(ringPulse, ringPulse, ringPulse);
        if (crate.ring.material) crate.ring.material.opacity = 0.46 + Math.sin(crate.age * 4.2) * 0.12;
      }
      if (state.player && Math.hypot(state.player.x - crate.x, state.player.z - crate.z) <= AMMO_CRATE_PICKUP_RADIUS) {
        collectAmmoCrate(i);
      }
    }
  }

  function countStandardAmmoCrates() {
    var count = 0;
    for (var i = 0; i < state.ammoCrates.length; i++) {
      if (!state.ammoCrates[i].mini) count += 1;
    }
    return count;
  }

  function ensureAmmoCratePointer() {
    if (ammoCratePointer && ammoCratePointer.parent) return ammoCratePointer;
    ammoCratePointer = createAmmoCratePointer();
    dynamicRoot.add(ammoCratePointer);
    return ammoCratePointer;
  }

  function createAmmoCratePointer() {
    var group = new THREE.Group();
    group.name = "ammo crate offscreen pointer";
    group.visible = false;
    group.userData.alpha = 0;
    group.userData.angle = 0;
    group.userData.targetScale = 1;
    group.userData.target = null;
    group.userData.faders = [];

    var glowMat = mats.ammoCratePointerGlow.clone();
    var glow = new THREE.Mesh(getSharedGeometry("ammo-crate-pointer-glow", function () {
      return new THREE.RingGeometry(0.86, 1.24, 54);
    }), glowMat);
    glow.userData.disposeGeometry = false;
    glow.userData.disposeMaterial = true;
    glow.userData.baseOpacity = glowMat.opacity;
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = -0.09;
    glow.renderOrder = 30;
    glow.castShadow = false;
    glow.receiveShadow = false;
    group.add(glow);

    var arrowGeometry = getSharedGeometry("ammo-crate-pointer-arrow-shape", function () {
      var shape = new THREE.Shape();
      shape.moveTo(-0.34, -0.94);
      shape.lineTo(0.34, -0.94);
      shape.lineTo(0.34, 0.18);
      shape.lineTo(0.78, 0.18);
      shape.lineTo(0, 1.2);
      shape.lineTo(-0.78, 0.18);
      shape.lineTo(-0.34, 0.18);
      shape.lineTo(-0.34, -0.94);
      return new THREE.ShapeGeometry(shape);
    });

    var outlineMat = mats.ammoCratePointerOutline.clone();
    var outline = new THREE.Mesh(arrowGeometry, outlineMat);
    outline.userData.disposeGeometry = false;
    outline.userData.disposeMaterial = true;
    outline.userData.baseOpacity = outlineMat.opacity;
    outline.rotation.x = Math.PI / 2;
    outline.position.y = -0.02;
    outline.scale.setScalar(1.16);
    outline.renderOrder = 31;
    outline.castShadow = false;
    outline.receiveShadow = false;
    group.add(outline);

    var arrowMat = mats.ammoCratePointer.clone();
    var arrow = new THREE.Mesh(arrowGeometry, arrowMat);
    arrow.userData.disposeGeometry = false;
    arrow.userData.disposeMaterial = true;
    arrow.userData.baseOpacity = arrowMat.opacity;
    arrow.rotation.x = Math.PI / 2;
    arrow.position.y = 0.04;
    arrow.renderOrder = 32;
    arrow.castShadow = false;
    arrow.receiveShadow = false;
    group.add(arrow);

    var ridgeMat = mats.ammoCratePointerGlow.clone();
    var ridge = addSharedBox(group, 0.13, 0.04, 1.2, ridgeMat, 0, 0.1, -0.18);
    ridge.userData.disposeMaterial = true;
    ridge.userData.baseOpacity = ridgeMat.opacity;
    ridge.renderOrder = 33;
    ridge.castShadow = false;
    ridge.receiveShadow = false;

    group.traverse(function (child) {
      if (!child.isMesh) return;
      child.castShadow = false;
      child.receiveShadow = false;
      child.userData.noDebris = true;
      child.renderOrder = child.renderOrder || 31;
      if (child.material && child.material.opacity != null) {
        if (child.userData.baseOpacity == null) child.userData.baseOpacity = child.material.opacity;
        group.userData.faders.push(child);
      }
    });
    setAmmoCratePointerOpacity(group, 0);
    return group;
  }

  function updateAmmoCratePointer(dt) {
    var pointer = ammoCratePointer;
    if (state.mode !== "playing" || !state.player) {
      if (pointer) fadeAmmoCratePointer(pointer, null, dt);
      return;
    }

    pointer = ensureAmmoCratePointer();
    fadeAmmoCratePointer(pointer, findAmmoCratePointerTarget(), dt);
  }

  function fadeAmmoCratePointer(pointer, target, dt) {
    if (!pointer) return;
    var currentAlpha = pointer.userData.alpha || 0;
    var targetAlpha = target ? 1 : 0;
    var alpha = currentAlpha + (targetAlpha - currentAlpha) * Math.min(1, dt * AMMO_CRATE_POINTER_FADE_SPEED);
    if (!target && alpha < 0.025) alpha = 0;
    pointer.userData.alpha = alpha;

    if (target || alpha > 0) {
      updateAmmoCratePointerTransform(pointer, target);
      pointer.visible = true;
    } else {
      pointer.visible = false;
    }

    pointer.userData.target = target
      ? {
          x: target.crate.x,
          z: target.crate.z,
          distance: target.distance,
          mini: !!target.crate.mini,
        }
      : null;
    setAmmoCratePointerOpacity(pointer, alpha);
  }

  function updateAmmoCratePointerTransform(pointer, target) {
    var p = state.player;
    if (!p) return;
    var angle = target ? Math.atan2(target.dx, target.dz) : pointer.userData.angle || 0;
    var nx = Math.sin(angle);
    var nz = Math.cos(angle);
    var bob = Math.sin(state.time * 5.2) * 0.09 + Math.sin(state.time * 2.7) * 0.035;
    var pulse = 1 + Math.sin(state.time * 7.6) * 0.035;

    pointer.userData.angle = angle;
    if (target) {
      pointer.userData.targetScale = 0.88 + clamp(target.distance / AMMO_CRATE_POINTER_RANGE, 0, 1) * 0.2;
    }
    pointer.position.set(
      p.x + nx * AMMO_CRATE_POINTER_OFFSET,
      AMMO_CRATE_POINTER_HEIGHT + bob,
      p.z + nz * AMMO_CRATE_POINTER_OFFSET
    );
    pointer.rotation.set(0, angle, 0);
    pointer.scale.setScalar((pointer.userData.targetScale || 1) * pulse);
  }

  function setAmmoCratePointerOpacity(pointer, alpha) {
    var faders = pointer && pointer.userData ? pointer.userData.faders || [] : [];
    for (var i = 0; i < faders.length; i++) {
      var mesh = faders[i];
      if (mesh.material && mesh.material.opacity != null) {
        mesh.material.opacity = (mesh.userData.baseOpacity == null ? 1 : mesh.userData.baseOpacity) * alpha;
      }
    }
  }

  function findAmmoCratePointerTarget() {
    if (!state.player || !state.ammoCrates.length) return null;
    var p = state.player;
    var visibleGround = getCurrentVisibleGroundRect();
    var best = null;
    var bestDist = Infinity;
    for (var i = 0; i < state.ammoCrates.length; i++) {
      var crate = state.ammoCrates[i];
      var dx = crate.x - p.x;
      var dz = crate.z - p.z;
      var dist = Math.hypot(dx, dz);
      if (dist > AMMO_CRATE_POINTER_RANGE) continue;
      if (!pointOutsideVisibleGround(crate.x, crate.z, AMMO_CRATE_POINTER_VIEW_PAD, visibleGround)) continue;
      if (dist < bestDist) {
        best = {
          crate: crate,
          dx: dx,
          dz: dz,
          distance: dist,
        };
        bestDist = dist;
      }
    }
    return best;
  }

  function getAmmoCratePointerDiagnostics() {
    var pointer = ammoCratePointer;
    var alpha = pointer && pointer.userData ? pointer.userData.alpha || 0 : 0;
    var target = pointer && pointer.userData ? pointer.userData.target : null;
    var player = state.player;
    var pointerDistance = pointer && player ? Math.hypot(pointer.position.x - player.x, pointer.position.z - player.z) : 0;
    return {
      visible: !!(pointer && pointer.visible && alpha > 0.05),
      alpha: Number(alpha.toFixed(3)),
      angle: pointer && pointer.userData ? Number((pointer.userData.angle || 0).toFixed(3)) : 0,
      x: pointer ? Number(pointer.position.x.toFixed(2)) : 0,
      y: pointer ? Number(pointer.position.y.toFixed(2)) : 0,
      z: pointer ? Number(pointer.position.z.toFixed(2)) : 0,
      distanceFromPlayer: Number(pointerDistance.toFixed(2)),
      range: AMMO_CRATE_POINTER_RANGE,
      target: target
        ? {
            x: Number(target.x.toFixed(2)),
            z: Number(target.z.toFixed(2)),
            distance: Number(target.distance.toFixed(2)),
            mini: !!target.mini,
          }
        : null,
    };
  }

  function spawnAmmoCrate() {
    var pos = findAmmoCrateSpawnPosition();
    if (!pos) return false;
    return spawnAmmoCrateAt(pos.x, pos.z);
  }

  function spawnAmmoCrateAt(x, z, options) {
    var crate = createAmmoCrate(x, z, options);
    state.ammoCrates.push(crate);
    dynamicRoot.add(crate.group);
    addShockwave(x, z, crate.mini ? 1.05 : 1.65, crate.mini ? 0.26 : 0.34, crate.mini ? 0xdce7ff : 0xffd36b);
    return crate;
  }

  function spawnMiniAmmoCrateAt(x, z) {
    return spawnAmmoCrateAt(x, z, {
      mini: true,
      pickupScale: MINI_AMMO_CRATE_PICKUP_SCALE,
      visualScale: 0.62,
    });
  }

  function findAmmoCrateSpawnPosition() {
    for (var attempt = 0; attempt < 80; attempt++) {
      var x = rand(-ARENA_W / 2 + 3.2, ARENA_W / 2 - 3.2);
      var z = rand(-ARENA_D / 2 + 3.2, ARENA_D / 2 - 3.2);
      if (pointHitsObstacle(x, z, 1.15)) continue;
      if (state.player && Math.hypot(state.player.x - x, state.player.z - z) < 6) continue;
      var blockedByEnemy = false;
      for (var i = 0; i < state.enemies.length; i++) {
        if (Math.hypot(state.enemies[i].x - x, state.enemies[i].z - z) < 2.8) {
          blockedByEnemy = true;
          break;
        }
      }
      if (!blockedByEnemy) return { x: x, z: z };
    }
    return null;
  }

  function createAmmoCrate(x, z, options) {
    options = options || {};
    var group = new THREE.Group();
    var mini = !!options.mini;
    group.name = mini ? "mini ammo crate" : "ammo crate";
    group.position.set(x, 0, z);
    group.scale.setScalar(options.visualScale || 1);

    var ringMat = mats.ammoRing.clone();
    if (mini && ringMat.color) ringMat.color.setHex(0xdce7ff);
    if (mini && ringMat.opacity != null) ringMat.opacity *= 0.82;
    var ring = new THREE.Mesh(getSharedGeometry("ammo-crate-selection-ring", function () {
      return new THREE.RingGeometry(1.78, 1.98, 72);
    }), ringMat);
    ring.userData.disposeGeometry = false;
    ring.userData.disposeMaterial = true;
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.16;
    ring.castShadow = false;
    ring.receiveShadow = false;
    ring.renderOrder = 12;
    group.add(ring);

    var body = new THREE.Group();
    body.rotation.y = rand(-0.26, 0.26);
    group.add(body);
    addContactShadow(body, 1.85, 1.35, 0.24);
    addSharedBox(body, 1.52, 0.18, 1.12, mats.ammoCrate, 0, 0.2, 0);
    addSharedBox(body, 1.52, 0.5, 0.13, mats.ammoCrate, 0, 0.48, -0.5);
    addSharedBox(body, 1.52, 0.5, 0.13, mats.ammoCrate, 0, 0.48, 0.5);
    addSharedBox(body, 0.13, 0.5, 1.12, mats.ammoCrate, -0.7, 0.48, 0);
    addSharedBox(body, 0.13, 0.5, 1.12, mats.ammoCrate, 0.7, 0.48, 0);
    addSharedBox(body, 1.3, 0.08, 0.9, mats.black, 0, 0.5, 0);
    addSharedBox(body, 1.55, 0.08, 0.12, mats.ammoCrateBand, 0, 0.72, -0.5);
    addSharedBox(body, 1.55, 0.08, 0.12, mats.ammoCrateBand, 0, 0.72, 0.5);
    addSharedBox(body, 0.12, 0.58, 1.16, mats.ammoCrateBand, -0.72, 0.48, 0);
    addSharedBox(body, 0.12, 0.58, 1.16, mats.ammoCrateBand, 0.72, 0.48, 0);

    var lid = addSharedBox(body, 1.55, 0.13, 1.02, mats.ammoCrateLight, 0, 0.76, -0.82);
    lid.rotation.x = -0.82;
    addSharedBox(body, 1.43, 0.08, 0.12, mats.ammoCrateBand, 0, 0.57, -1.17).rotation.x = -0.82;
    addSharedBox(body, 0.18, 0.08, 0.26, mats.black, 0, 0.86, -1.12).rotation.x = -0.82;

    addSharedBox(body, 1.14, 0.06, 0.04, mats.ammoCrateBand, 0, 0.62, -0.11);
    addSharedBox(body, 1.14, 0.06, 0.04, mats.ammoCrateBand, 0, 0.62, 0.13);
    for (var row = 0; row < 3; row++) {
      for (var i = 0; i < 4; i++) {
        var px = -0.45 + i * 0.3;
        var pz = -0.25 + row * 0.24;
        addSharedBox(body, 0.06, 0.08, 0.11, mats.black, px - 0.13, 0.68, pz);
        addSharedBox(body, 0.22, 0.1, 0.11, mats.ammoRound, px, 0.69, pz);
        addSharedBox(body, 0.08, 0.1, 0.09, mats.rifleTracer, px + 0.15, 0.7, pz);
      }
    }

    return {
      x: x,
      z: z,
      age: 0,
      mini: mini,
      pickupScale: Math.max(0.05, Number(options.pickupScale) || 1),
      group: group,
      body: body,
      ring: ring,
    };
  }

  function collectAmmoCrate(index) {
    var crate = state.ammoCrates[index];
    if (!crate) return false;
    var amounts = getAmmoPickupAmounts(crate.pickupScale || 1);
    Object.keys(amounts).forEach(function (id) {
      state.ammoReserve[id] = Math.max(0, state.ammoReserve[id] || 0) + amounts[id];
    });
    if (state.weapon && (state.ammo[state.weapon] || 0) <= 0) startReload(state.weapon);
    addAmmoPickupBurst(crate.x, crate.z, crate.mini ? 0.62 : 1);
    removeObject3D(crate.group);
    state.ammoCrates.splice(index, 1);
    updateHud();
    return true;
  }

  function getAmmoPickupAmounts(pickupScale) {
    var scale = pickupScale == null ? 1 : Math.max(0.05, Number(pickupScale) || 1);
    return Object.keys(WEAPONS).reduce(function (acc, id) {
      if (state.ownedWeapons[id]) {
        var bonus = 0;
        if (id === "revolver") bonus = state.revolverAmmoPickupBonus || 0;
        if (id === "rifle") bonus = state.rifleAmmoPickupBonus || 0;
        if (id === "launcher") bonus = getLauncherAmmoPickupBonus();
        var normalAmount = Math.max(1, Math.round(((WEAPONS[id].reserveStart || 0) + bonus) * getAmmoPickupMultiplier()));
        acc[id] = scale === 1 ? normalAmount : Math.max(1, Math.round(normalAmount * scale));
      }
      return acc;
    }, {});
  }

  function getLauncherAmmoPickupBonus() {
    var bonus = LAUNCHER_AMMO_CRATE_BONUS;
    if (state.launcherUpgrade) bonus += LAUNCHER_BRANCH_AMMO_CRATE_BONUS;
    if (state.launcherUpgrade === "bombardier") bonus += LAUNCHER_BOMBARDIER_AMMO_CRATE_BONUS;
    return bonus;
  }

  function getAmmoPickupMultiplier() {
    return 1 + Math.max(0, state.ammoPickupBonus || 0);
  }

  function addAmmoPickupBurst(x, z, scale) {
    var burstScale = scale || 1;
    addShockwave(x, z, 2.15 * burstScale, 0.38, burstScale < 1 ? 0xdce7ff : 0xffd66d);
    addLightFlash(x, 1.05, z, burstScale < 1 ? 0xdce7ff : 0xffd66d, 1.8 * burstScale, 5 * burstScale, 0.18);
    var count = Math.max(6, Math.round(18 * burstScale));
    for (var i = 0; i < count; i++) {
      var angle = rand(0, Math.PI * 2);
      var speed = rand(1.6, 4.6);
      spawnParticle(x, rand(0.55, 1.5) * burstScale, z, Math.cos(angle) * speed, rand(1.2, 4.2), Math.sin(angle) * speed, rand(0.22, 0.48) * burstScale, rand(0.06, 0.15), i % 4 === 0 ? mats.rifleTracer : mats.ammoRound);
    }
  }

  function updateAim() {
    var p = state.player;
    var touchVector = getTouchMoveVector();
    if (mobileAimTarget.active) {
      applyMobileAimTarget();
    } else if (touchFire.active || Math.hypot(touchVector.x, touchVector.z) > 0.18) {
      updateMobileAimTarget(p);
    } else {
      refreshPointerWorldFromFollow(p);
    }
    var dx = state.pointerWorld.x - p.x;
    var dz = state.pointerWorld.z - p.z;
    if (Math.hypot(dx, dz) < 0.001) dz = 1;
    p.aimAngle = Math.atan2(dx, dz);
    p.group.rotation.y = p.aimAngle;
  }

  function applyMobileAimTarget() {
    state.pointerWorld.x = mobileAimTarget.x;
    state.pointerWorld.z = mobileAimTarget.z;
  }

  function updateMobileAimTarget(player) {
    var target = touchFire.active ? findNearestEnemy(player.x, player.z, 18) : null;
    if (target) {
      state.pointerWorld.x = target.x;
      state.pointerWorld.z = target.z;
      var dx = target.x - player.x;
      var dz = target.z - player.z;
      var len = Math.hypot(dx, dz);
      if (len > 0.001) {
        lastMobileAim.x = dx / len;
        lastMobileAim.z = dz / len;
      }
      return;
    }

    var touchVector = getTouchMoveVector();
    var moveLen = Math.hypot(touchVector.x, touchVector.z);
    if (moveLen > 0.18) {
      lastMobileAim.x = touchVector.x / moveLen;
      lastMobileAim.z = touchVector.z / moveLen;
    }
    state.pointerWorld.x = player.x + lastMobileAim.x * 7;
    state.pointerWorld.z = player.z + lastMobileAim.z * 7;
  }

  function setMobileAimTargetFromClient(clientX, clientY) {
    if (!state.player || state.mode !== "playing") return false;
    updatePointerFromClient(clientX, clientY);
    mobileAimTarget.active = true;
    mobileAimTarget.x = state.pointerWorld.x;
    mobileAimTarget.z = state.pointerWorld.z;
    applyMobileAimTarget();
    ensureMobileAimTargetMarker();
    updateMobileAimTargetMarker(0);
    return true;
  }

  function clearMobileAimTarget() {
    mobileAimTarget.active = false;
    if (mobileAimTarget.marker) mobileAimTarget.marker.visible = false;
  }

  function ensureMobileAimTargetMarker() {
    if (mobileAimTarget.marker && mobileAimTarget.marker.parent) return mobileAimTarget.marker;
    mobileAimTarget.marker = createMobileAimTargetMarker();
    dynamicRoot.add(mobileAimTarget.marker);
    return mobileAimTarget.marker;
  }

  function createMobileAimTargetMarker() {
    var group = new THREE.Group();
    group.name = "mobile manual aim target";
    group.visible = false;
    group.userData.faders = [];

    var glowMat = mats.mobileAimTargetGlow.clone();
    var glow = new THREE.Mesh(getSharedGeometry("mobile-aim-target-glow", function () {
      return new THREE.RingGeometry(0.74, 1.02, 48);
    }), glowMat);
    glow.userData.disposeGeometry = false;
    glow.userData.disposeMaterial = true;
    glow.userData.baseOpacity = glowMat.opacity;
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = 0.05;
    glow.renderOrder = 38;
    glow.castShadow = false;
    glow.receiveShadow = false;
    group.add(glow);

    var ringMat = mats.mobileAimTarget.clone();
    var ring = new THREE.Mesh(getSharedGeometry("mobile-aim-target-ring", function () {
      return new THREE.RingGeometry(0.38, 0.5, 36);
    }), ringMat);
    ring.userData.disposeGeometry = false;
    ring.userData.disposeMaterial = true;
    ring.userData.baseOpacity = ringMat.opacity;
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.08;
    ring.renderOrder = 39;
    ring.castShadow = false;
    ring.receiveShadow = false;
    group.add(ring);

    var crossMat = mats.mobileAimTarget.clone();
    var crossA = addSharedBox(group, 1.18, 0.05, 0.1, crossMat, 0, 0.1, 0);
    var crossB = addSharedBox(group, 0.1, 0.05, 1.18, crossMat, 0, 0.1, 0);
    crossA.userData.disposeMaterial = true;
    crossB.userData.disposeMaterial = false;

    group.traverse(function (child) {
      if (!child.isMesh) return;
      child.castShadow = false;
      child.receiveShadow = false;
      child.userData.noDebris = true;
      child.renderOrder = child.renderOrder || 39;
      if (child.material && child.material.opacity != null) {
        if (child.userData.baseOpacity == null) child.userData.baseOpacity = child.material.opacity;
        group.userData.faders.push(child);
      }
    });
    return group;
  }

  function updateMobileAimTargetMarker(dt) {
    var marker = mobileAimTarget.marker;
    if (!marker && mobileAimTarget.active) marker = ensureMobileAimTargetMarker();
    if (!marker) return;
    if (!mobileAimTarget.active || state.mode !== "playing") {
      marker.visible = false;
      return;
    }

    var pulse = 1 + Math.sin(state.time * 7.4) * 0.07;
    marker.visible = true;
    marker.position.set(mobileAimTarget.x, 0, mobileAimTarget.z);
    marker.rotation.y += (dt || 0) * 1.2;
    marker.scale.setScalar(pulse);
    var faders = marker.userData.faders || [];
    for (var i = 0; i < faders.length; i++) {
      var mesh = faders[i];
      if (mesh.material && mesh.material.opacity != null) {
        mesh.material.opacity = (mesh.userData.baseOpacity == null ? 1 : mesh.userData.baseOpacity) * (0.82 + Math.sin(state.time * 5.6 + i) * 0.12);
      }
    }
  }

  function getMobileAimTargetDiagnostics() {
    return {
      active: !!mobileAimTarget.active,
      x: Number(mobileAimTarget.x.toFixed(2)),
      z: Number(mobileAimTarget.z.toFixed(2)),
      markerVisible: !!(mobileAimTarget.marker && mobileAimTarget.marker.visible),
    };
  }

  function findNearestEnemy(x, z, maxDistance) {
    var best = null;
    var bestDist = maxDistance || Infinity;
    for (var i = 0; i < state.enemies.length; i++) {
      var enemy = state.enemies[i];
      var dx = enemy.x - x;
      var dz = enemy.z - z;
      if (dx * dx + dz * dz >= bestDist * bestDist) continue;
      var dist = Math.hypot(dx, dz);
      if (dist < bestDist) {
        best = enemy;
        bestDist = dist;
      }
    }
    return best;
  }

  function updatePlayerVisual(dt) {
    var p = state.player;
    p.shootKick = Math.max(0, p.shootKick - dt * 8.5);
    var parts = p.group.userData.animParts || {};
    var intensity = p.moveAmount || 0;
    var stride = Math.sin(p.walkPhase);
    var counterStride = Math.sin(p.walkPhase + Math.PI);
    var bob = Math.abs(Math.sin(p.walkPhase * 2)) * 0.08 * intensity + Math.sin(state.time * 10) * 0.012;
    p.group.position.y = bob;
    p.group.rotation.z = Math.sin(p.walkPhase) * 0.045 * intensity;
    p.group.rotation.x = -p.shootKick * 0.045;
    animateMesh(parts.leftLeg, { rx: stride * 0.42 * intensity, z: -Math.abs(stride) * 0.05 * intensity });
    animateMesh(parts.rightLeg, { rx: counterStride * 0.42 * intensity, z: -Math.abs(counterStride) * 0.05 * intensity });
    animateMesh(parts.leftBoot, { rx: stride * 0.52 * intensity, z: 0.04 - Math.abs(stride) * 0.05 * intensity });
    animateMesh(parts.rightBoot, { rx: counterStride * 0.52 * intensity, z: 0.04 - Math.abs(counterStride) * 0.05 * intensity });
    animateMesh(parts.leftArm, { rx: counterStride * 0.22 * intensity, ry: -0.08 * intensity });
    var rightArmPose = {
      rx: -0.18 - p.shootKick * 0.58 + stride * 0.08 * intensity,
      ry: 0.08 + p.shootKick * 0.12,
      rz: 0.04 * intensity,
      z: 0.07 - p.shootKick * 0.14,
    };
    animateMesh(parts.rightArm, rightArmPose);
    animateMesh(parts.torso, { rz: Math.sin(p.walkPhase) * 0.045 * intensity, z: -p.shootKick * 0.035 });
    animateMesh(parts.shirt, { rz: Math.sin(p.walkPhase) * 0.035 * intensity, z: 0.05 - p.shootKick * 0.035 });
    animateMesh(parts.head, { rx: -p.shootKick * 0.05, rz: Math.sin(p.walkPhase) * 0.025 * intensity });
    animateMesh(parts.hatBrim, { rx: -p.shootKick * 0.05, rz: Math.sin(p.walkPhase) * 0.025 * intensity });
    animateMesh(parts.hatTop, { rx: -p.shootKick * 0.05, rz: Math.sin(p.walkPhase) * 0.025 * intensity });
    animateWeaponMeshes(p.group, p.shootKick, intensity, rightArmPose);
    if (p.invuln > 0) {
      p.group.scale.setScalar(1 + Math.sin(state.time * 42) * 0.025);
    } else {
      p.group.scale.setScalar(1);
    }
  }

  function shoot() {
    var p = state.player;
    var weapon = WEAPONS[state.weapon] || WEAPONS.revolver;
    var ammo = getAmmoState(weapon.id);
    if (weapon.id === "coachGun") return shootCoachGun(p, weapon, ammo);
    var dualHandShot = "";
    var allRightAllLeftShot = weapon.id === "revolver" && hasAllRightAllLeft();
    var freeLauncherShot = weapon.id === "launcher" && isLauncherFireBuffActive();
    if (freeLauncherShot) {
      state.reloadTimers.launcher = 0;
    }
    if (allRightAllLeftShot) {
      dualHandShot = prepareDualRevolverHandShot();
      ammo = getAmmoState(weapon.id);
      if (!dualHandShot) {
        p.cooldown = Math.max(p.cooldown, ammo.reloading ? 0.08 : 0.16);
        return false;
      }
    } else {
      if (ammo.reloading && !freeLauncherShot) {
        p.cooldown = Math.max(p.cooldown, 0.08);
        return false;
      }
      if (ammo.current <= 0 && !freeLauncherShot) {
        startReload(weapon.id);
        if ((state.ammoReserve[weapon.id] || 0) <= 0) p.cooldown = Math.max(p.cooldown, 0.16);
        return false;
      }
    }
    var shot = getWeaponShotPlan(weapon, p);
    var dir = shot.dir;
    var bigIronShot = isBigIronShot(weapon);
    var silverBullet = false;
    if (bigIronShot && hasUpgrade("silverBullet")) {
      state.bigIronShotsFired += 1;
      silverBullet = isSilverBulletShot(weapon, ammo);
    }
    var projectileSpeed = getWeaponProjectileSpeed(weapon, silverBullet);
    var projectileVisualSize = getWeaponProjectileVisualSize(weapon, silverBullet);
    var projectileLife = getWeaponProjectileLife(weapon, silverBullet);
    var projectileHitRadius = getWeaponProjectileHitRadius(weapon, silverBullet);
    var muzzleSide = dualHandShot ? getDualRevolverHandSide(dualHandShot) : getDualMuzzleSide(weapon);
    var start = getWeaponMuzzleStart(weapon, p, dir, muzzleSide);
    shot.start = start;
    if (shot.target) {
      var tx = shot.target.x - start.x;
      var tz = shot.target.z - start.z;
      var travelDistance = Math.max(0.05, Math.hypot(tx, tz));
      dir.x = tx / travelDistance;
      dir.z = tz / travelDistance;
      shot.travelDistance = travelDistance;
      shot.life = travelDistance / projectileSpeed;
      shot.angle = Math.atan2(dir.x, dir.z);
    }
    var rifleShotNumber = 0;
    var rifleChainLightning = false;
    var launcherShotNumber = 0;
    if (weapon.id === "rifle") {
      state.rifleShotsFired += 1;
      rifleShotNumber = state.rifleShotsFired;
      rifleChainLightning = hasUpgrade("chainLightning") && rifleShotNumber % RIFLE_LIGHTNING_SHOT_INTERVAL === 0;
    }
    if (weapon.id === "launcher") {
      state.launcherShotsFired += 1;
      launcherShotNumber = state.launcherShotsFired;
    }
    var bulletMesh = createProjectileMesh(weapon, start, p.aimAngle, projectileVisualSize, {
      electric: rifleChainLightning,
    });
    var bulletVisual = getProjectileVisualForObject(bulletMesh);
    state.shotsFired += 1;
    var damage = getWeaponDamage(weapon);
    if (silverBullet) damage *= 3;
    var bullet = {
      type: weapon.id,
      x: start.x,
      y: start.y,
      z: start.z,
      dirX: dir.x,
      dirZ: dir.z,
      speed: projectileSpeed,
      life: shot.life || projectileLife,
      maxLife: shot.life || projectileLife,
      age: 0,
      baseDamage: damage,
      damage: damage,
      hitRadius: projectileHitRadius,
      visualWidth: projectileVisualSize.width,
      visualLength: projectileVisualSize.length,
      piercing: bigIronShot,
      piercedEnemies: [],
      hitEnemies: [],
      muzzleSide: muzzleSide,
      dualHand: dualHandShot,
      rifleShotNumber: rifleShotNumber,
      chainLightning: rifleChainLightning,
      lightningTargets: rifleChainLightning ? getRifleLightningTargetCount() : 0,
      launcherShotNumber: launcherShotNumber,
      powderEcho: weapon.id === "launcher" && hasUpgrade("powderEcho") && launcherShotNumber % 3 === 0,
      airburstLanding: weapon.id === "launcher" && hasHeavyPayloadAirburst(),
      rollingFlame: weapon.id === "launcher" && hasUpgrade("rollingFlame"),
      fireTrailTimer: 0,
      plantsTrap: weapon.id === "rifle" && hasUpgrade("snapTraps"),
      ricochetRemaining: weapon.id === "revolver" ? getDualRicochetLimit() : 0,
      ricochetDepth: 0,
      homing: weapon.id === "revolver" ? getDualSoftAimStrength() : 0,
      silverBullet: silverBullet,
      executioner: bigIronShot && hasUpgrade("executioner"),
      heavyRupture: bigIronShot && hasUpgrade("heavyRupture"),
      leadBloom: bigIronShot && hasUpgrade("leadBloom"),
      throughAndThrough: bigIronShot && hasUpgrade("throughAndThrough"),
      blastRadius: weapon.id === "launcher" ? getLauncherBlastRadius() : weapon.blastRadius || 0,
      blastDamage: weapon.id === "launcher" ? getLauncherBlastDamage() : weapon.blastDamage || 0,
      targetX: shot.target ? shot.target.x : null,
      targetZ: shot.target ? shot.target.z : null,
      targetRadius: shot.target ? Math.max(0.12, weapon.hitRadius * 0.7) : 0,
      trailTimer: 0,
      visual: bulletVisual,
      mesh: bulletMesh,
    };
    if (weapon.id === "launcher") bullet.launcherWhistle = startLauncherGrenadeWhistle(bullet);
    state.bullets.push(bullet);
    if (freeLauncherShot) {
      state.launcherFreeShots += 1;
    } else if (dualHandShot) {
      spendDualRevolverHandShot(dualHandShot);
    } else {
      state.ammo[weapon.id] = Math.max(0, ammo.current - 1);
      if (state.ammo[weapon.id] <= 0) startReload(weapon.id);
    }
    if (weapon.id === "launcher" && hasPyrotechnicianThermiteCore()) {
      spawnThermitePlayerFirePatch(p.x, p.z);
    }
    if (muzzleSide) {
      state.lastDualShotSide = muzzleSide;
      state.dualShotSide = dualHandShot ? getDualRevolverHandSide(state.dualActiveHand) : -muzzleSide;
    }
    p.cooldown = getWeaponCooldown(weapon);
    p.shootKick = weapon.id === "launcher" ? 1 : weapon.id === "rifle" ? 0.72 : 0.55;
    state.shake = Math.min(1.2, state.shake + weapon.shake);
    addLightFlash(start.x, start.y, start.z, weapon.id === "launcher" ? 0xff7a24 : 0xffd36b, weapon.id === "launcher" ? 3.2 : 1.7, weapon.id === "launcher" ? 8 : 5, weapon.id === "launcher" ? 0.16 : 0.08);
    addSmokePuff(start.x - dir.x * 0.18, start.y, start.z - dir.z * 0.18, weapon.id === "launcher" ? 0.55 : 0.28, weapon.id === "launcher" ? 0.48 : 0.28);
    if (weapon.id === "revolver") playRevolverShotSound(start, dir, muzzleSide, bigIronShot);
    if (weapon.id === "rifle") playRifleShotSound(start, dir, rifleChainLightning);
    if (weapon.id === "launcher") playLauncherLaunchSound(start, dir);

    var particleCount = weapon.id === "launcher" ? 10 : weapon.id === "rifle" ? 4 : 6;
    for (var i = 0; i < particleCount; i++) {
      spawnParticle(
        start.x + rand(-0.08, 0.08),
        start.y + rand(-0.08, 0.08),
        start.z + rand(-0.08, 0.08),
        dir.x * rand(1.8, weapon.id === "launcher" ? 6.4 : 5.2) + rand(-1, 1),
        rand(0.6, weapon.id === "launcher" ? 2.7 : 2.1),
        dir.z * rand(1.8, weapon.id === "launcher" ? 6.4 : 5.2) + rand(-1, 1),
        weapon.id === "launcher" ? 0.18 : 0.12,
        rand(0.07, weapon.id === "launcher" ? 0.2 : 0.16),
        weapon.id === "launcher" ? mats.explosion : mats.flash
      );
    }
    return true;
  }

  function shootCoachGun(player, weapon, ammo) {
    ammo = ammo || getAmmoState(weapon.id);
    if (ammo.reloading && ammo.current > 0) {
      state.reloadTimers.coachGun = 0;
      ammo = getAmmoState("coachGun");
    }
    if (ammo.reloading || ammo.current <= 0) {
      startReload("coachGun");
      player.cooldown = Math.max(player.cooldown, ammo.reloading ? 0.08 : 0.16);
      return false;
    }

    var shot = getWeaponShotPlan(weapon, player);
    var dir = shot.dir;
    var start = getWeaponMuzzleStart(weapon, player, dir, 0);
    var lastShell = ammo.current === 1;
    var sinceLastShot = state.time - (state.marshalLastShotTime == null ? -99 : state.marshalLastShotTime);
    var doubleTap =
      state.marshalUpgrade === "breachMarshal" &&
      hasUpgrade("doubleTap") &&
      lastShell &&
      (state.marshalDoubleTapReadyUntil || 0) > state.time;
    var braced = state.marshalUpgrade === "graveWarden" && hasUpgrade("stillness") && sinceLastShot >= 1.2;
    var context = {
      id: ++state.marshalShotSequence,
      type: "coachGun",
      startX: start.x,
      startZ: start.z,
      dirX: dir.x,
      dirZ: dir.z,
      spread: getCoachGunSpread(braced),
      range: getCoachGunRange(),
      pelletCount: getCoachGunPelletCount(),
      lastShell: lastShell,
      doubleTap: doubleTap,
      braced: braced,
      entries: [],
      visualRays: [],
      visualPelletCount: 0,
      acidCleansed: 0,
      uniqueHits: 0,
    };

    state.shotsFired += 1;
    state.ammo.coachGun = Math.max(0, ammo.current - 1);
    state.reloadTimers.coachGun = 0;

    if (doubleTap) {
      state.marshalDoubleTapReadyUntil = 0;
    } else if (state.marshalUpgrade === "breachMarshal" && hasUpgrade("doubleTap") && ammo.current >= 2) {
      state.marshalDoubleTapReadyUntil = state.time + 0.75;
    } else {
      state.marshalDoubleTapReadyUntil = 0;
    }

    if (state.marshalUpgrade === "graveWarden" && hasUpgrade("purifyingSalt")) purifyAcidWithCoachGun(context);
    resolveCoachGunVolley(context);
    spawnCoachGunVolleyVisuals(context, weapon);

    if (state.ammo.coachGun < getWeaponMagazine(weapon) && (state.ammoReserve.coachGun || 0) > 0) startReload("coachGun");

    var cooldown = getWeaponCooldown(weapon);
    if (state.marshalUpgrade === "breachMarshal" && hasUpgrade("doubleTap") && ammo.current >= 2) cooldown *= 0.35;
    player.cooldown = cooldown;
    player.shootKick = 0.92;
    state.shake = Math.min(1.2, state.shake + weapon.shake);
    state.marshalLastShotTime = state.time;

    addLightFlash(start.x, start.y, start.z, state.marshalUpgrade === "graveWarden" ? 0xffefbd : 0xffb057, 2.5, 6.4, 0.12);
    addSmokePuff(start.x - dir.x * 0.16, start.y, start.z - dir.z * 0.16, 0.48, 0.42);
    playCoachGunShotSound(start, dir, lastShell);
    for (var p = 0; p < 9; p++) {
      spawnParticle(
        start.x + rand(-0.1, 0.1),
        start.y + rand(-0.08, 0.08),
        start.z + rand(-0.1, 0.1),
        dir.x * rand(3.8, 7.4) + rand(-2.3, 2.3),
        rand(0.7, 2.7),
        dir.z * rand(3.8, 7.4) + rand(-2.3, 2.3),
        rand(0.1, 0.2),
        rand(0.06, 0.14),
        p % 3 ? mats.coachTracer : mats.flash
      );
    }

    state.marshalLastVolley = {
      id: context.id,
      pelletCount: context.pelletCount,
      spread: Number(context.spread.toFixed(3)),
      range: Number(context.range.toFixed(2)),
      lastShell: context.lastShell,
      doubleTap: context.doubleTap,
      braced: context.braced,
      uniqueHits: context.uniqueHits,
      acidCleansed: context.acidCleansed,
      visualPelletCount: context.visualPelletCount,
      visualTracerCount: context.visualRays.length / 4,
      hitCounts: context.entries.map(function (entry) {
        return { type: entry.enemy.type, pellets: entry.pellets, ball: !!entry.ball, distance: Number(entry.distance.toFixed(2)) };
      }),
    };
    return true;
  }

  function getCoachGunPelletCount() {
    return COACH_GUN_BASE_PELLETS + (state.marshalUpgrade === "breachMarshal" ? 2 : 0) + Math.min(4, getUpgradeCount("packedBuckshot"));
  }

  function getCoachGunSpread(braced) {
    var spread = COACH_GUN_BASE_SPREAD;
    if (state.marshalUpgrade === "breachMarshal") spread *= 1.32;
    if (state.marshalUpgrade === "graveWarden") spread *= 0.65;
    if (state.marshalUpgrade === "graveWarden") spread *= Math.max(0.58, 1 - Math.min(5, getUpgradeCount("fineChoke")) * 0.07);
    if (braced) spread *= 0.62;
    return spread;
  }

  function getCoachGunRange() {
    var range = COACH_GUN_BASE_RANGE * getWeaponRangeMultiplier(WEAPONS.coachGun);
    if (state.marshalUpgrade === "breachMarshal") range *= 0.8;
    if (state.marshalUpgrade === "graveWarden") range *= 1.2 * (1 + Math.min(5, getUpgradeCount("fineChoke")) * 0.07);
    return range;
  }

  function getCoachGunVisualPelletCount(pelletCount) {
    var limit = COACH_GUN_STANDARD_TRACER_COUNT;
    if (state.marshalUpgrade === "breachMarshal") limit = COACH_GUN_BREACH_TRACER_COUNT;
    if (state.marshalUpgrade === "graveWarden") limit = COACH_GUN_GRAVE_TRACER_COUNT;
    return Math.min(Math.max(1, pelletCount || 1), limit);
  }

  function resolveCoachGunVolley(context) {
    ensureZombieSpatialGridCurrent();
    var visualPelletCount = getCoachGunVisualPelletCount(context.pelletCount);
    var nextVisualSlot = 0;
    context.visualPelletCount = visualPelletCount;
    for (var i = 0; i < context.pelletCount; i++) {
      var offset = context.pelletCount <= 1 ? 0 : (i / (context.pelletCount - 1) - 0.5) * context.spread;
      var nextVisualIndex =
        visualPelletCount <= 1 ? Math.floor((context.pelletCount - 1) * 0.5) : Math.round((nextVisualSlot * (context.pelletCount - 1)) / (visualPelletCount - 1));
      var captureVisual = nextVisualSlot < visualPelletCount && i === nextVisualIndex;
      if (captureVisual) nextVisualSlot += 1;
      var hit = traceCoachGunRay(context, offset, false, captureVisual);
      if (hit) addCoachGunVolleyHit(context, hit, false);
    }
    if (state.marshalUpgrade === "breachMarshal" && hasUpgrade("buckAndBall")) {
      var ballHit = traceCoachGunRay(context, 0, true, true);
      if (ballHit) addCoachGunVolleyHit(context, ballHit, true);
    }

    context.uniqueHits = context.entries.length;
    if (context.uniqueHits >= 3 && state.marshalUpgrade === "breachMarshal" && hasUpgrade("rideTheRecoil")) {
      state.marshalRecoilSpeedTimer = Math.max(state.marshalRecoilSpeedTimer, 1.25);
    }

    context.entries.sort(function (a, b) {
      return a.distance - b.distance;
    });
    for (var e = 0; e < context.entries.length; e++) applyCoachGunVolleyDamage(context, context.entries[e]);
    zombieSpatialDirty = true;
  }

  function traceCoachGunRay(context, offset, ball, captureVisual) {
    var baseAngle = Math.atan2(context.dirX, context.dirZ) + offset;
    var dirX = Math.sin(baseAngle);
    var dirZ = Math.cos(baseAngle);
    var range = ball ? COACH_GUN_BASE_RANGE * getWeaponRangeMultiplier(WEAPONS.coachGun) : context.range;
    var endX = context.startX + dirX * range;
    var endZ = context.startZ + dirZ * range;
    var blocker = findBlockingObstacle(context.startX, context.startZ, endX, endZ, ball ? 0.12 : 0.06, null);
    var maxDistance = blocker ? Math.max(0.2, range * blocker.t) : range;
    var best = null;
    var bestDistance = maxDistance + 1;
    forEachEnemyNearCircle(context.startX, context.startZ, range + 1.4, function (enemy) {
      if (!enemy || enemy.active === false) return;
      var dx = enemy.x - context.startX;
      var dz = enemy.z - context.startZ;
      var along = dx * dirX + dz * dirZ;
      if (along <= 0.15 || along > maxDistance || along >= bestDistance) return;
      var lateralX = dx - dirX * along;
      var lateralZ = dz - dirZ * along;
      var hitRadius = enemy.radius + (ball ? 0.18 : 0.1);
      if (lateralX * lateralX + lateralZ * lateralZ > hitRadius * hitRadius) return;
      bestDistance = along;
      best = enemy;
    }, true);
    if (captureVisual) {
      context.visualRays.push(dirX, dirZ, best ? bestDistance : maxDistance, ball ? 1 : 0);
    }
    if (!best) return null;
    return {
      enemy: best,
      distance: bestDistance,
      x: context.startX + dirX * bestDistance,
      z: context.startZ + dirZ * bestDistance,
    };
  }

  function addCoachGunVolleyHit(context, hit, ball) {
    var entry = null;
    for (var i = 0; i < context.entries.length; i++) {
      if (context.entries[i].enemy === hit.enemy) {
        entry = context.entries[i];
        break;
      }
    }
    if (!entry) {
      entry = { enemy: hit.enemy, pellets: 0, ball: false, distance: hit.distance, x: hit.x, z: hit.z };
      context.entries.push(entry);
    }
    if (ball) entry.ball = true;
    else entry.pellets += 1;
    entry.distance = Math.min(entry.distance, hit.distance);
    entry.x = hit.x;
    entry.z = hit.z;
  }

  function applyCoachGunVolleyDamage(context, entry) {
    var enemy = entry.enemy;
    if (!enemy || enemy.active === false) return;
    var wasMarked = isMarshalEnemyMarked(enemy);
    var wasBounty = !!enemy.marshalBounty;
    if (state.marshalUpgrade === "graveWarden" && entry.pellets >= COACH_GUN_MARK_HITS) applyMarshalMark(enemy, COACH_GUN_MARK_LIFE);
    if (state.marshalUpgrade === "breachMarshal" && hasUpgrade("doorKicker") && entry.pellets >= 4) {
      enemy.marshalStunTimer = Math.max(enemy.marshalStunTimer || 0, 0.45);
    }

    var falloff = clamp(1 - (entry.distance / Math.max(1, context.range)) * 0.55, 0.45, 1);
    var damage = getWeaponDamage(WEAPONS.coachGun) * entry.pellets * falloff;
    if (entry.ball) damage += getWeaponDamage(WEAPONS.coachGun) * 3 * clamp(1 - entry.distance / (COACH_GUN_BASE_RANGE * 2.25), 0.62, 1);
    var pointBlank = entry.distance <= COACH_GUN_POINT_BLANK_RANGE;
    if (pointBlank) damage *= 1 + Math.min(5, getUpgradeCount("hardCast")) * 0.1;
    if (context.doubleTap) damage *= 1.2;
    if (context.lastShell && state.marshalUpgrade === "breachMarshal" && hasUpgrade("lastWord")) damage *= 1.45;
    if (context.braced) damage *= 1.45;
    if (wasMarked && state.marshalUpgrade === "graveWarden") damage *= 1 + Math.min(5, getUpgradeCount("sanctifiedLead")) * 0.12;

    var source = {
      type: "coachGun",
      volleyId: context.id,
      pointBlank: pointBlank,
      targetWasMarked: isMarshalEnemyMarked(enemy),
      targetWasBounty: wasBounty,
      hitDistance: entry.distance,
      pellets: entry.pellets,
      ball: entry.ball,
      aggregateHitSound: true,
    };
    damageEnemy(enemy, damage, entry.x, entry.z, source);
    if (enemy.active === false) return;

    var knockback = state.marshalUpgrade === "breachMarshal" ? 1.2 + entry.pellets * 0.16 : 0.42 + entry.pellets * 0.06;
    if (state.marshalUpgrade === "breachMarshal" && hasUpgrade("doorKicker") && entry.pellets >= 4) knockback *= 1.35;
    if (pointBlank) knockback *= 1 + Math.min(5, getUpgradeCount("hardCast")) * 0.1;
    if (context.lastShell && state.marshalUpgrade === "breachMarshal" && hasUpgrade("lastWord")) knockback *= 1.4;
    applyCoachGunKnockback(enemy, context.startX, context.startZ, knockback, source);
  }

  function applyCoachGunKnockback(enemy, sourceX, sourceZ, distance, source) {
    if (!enemy || enemy.active === false || distance <= 0) return;
    var dx = enemy.x - sourceX;
    var dz = enemy.z - sourceZ;
    var len = Math.max(0.001, Math.hypot(dx, dz));
    var dirX = dx / len;
    var dirZ = dz / len;
    var oldX = enemy.x;
    var oldZ = enemy.z;
    var targetX = oldX + dirX * distance;
    var targetZ = oldZ + dirZ * distance;
    var obstacle = findBlockingObstacle(oldX, oldZ, targetX, targetZ, enemy.radius + 0.08, null);
    var obstacleCollision = !!obstacle;
    if (obstacle) {
      var safeT = Math.max(0, obstacle.t - 0.04);
      targetX = oldX + (targetX - oldX) * safeT;
      targetZ = oldZ + (targetZ - oldZ) * safeT;
    }

    var travelX = targetX - oldX;
    var travelZ = targetZ - oldZ;
    var travelLengthSq = travelX * travelX + travelZ * travelZ;
    var travelLength = Math.sqrt(travelLengthSq);
    var collisionTarget = null;
    var collisionT = 1;
    for (var i = 0; i < state.enemies.length; i++) {
      var other = state.enemies[i];
      if (!other || other === enemy || other.active === false) continue;
      var minDistance = enemy.radius + other.radius + 0.08;
      var projection = travelLengthSq > 0.0001 ? clamp(((other.x - oldX) * travelX + (other.z - oldZ) * travelZ) / travelLengthSq, 0, 1) : 0;
      var closestX = oldX + travelX * projection;
      var closestZ = oldZ + travelZ * projection;
      var separationX = closestX - other.x;
      var separationZ = closestZ - other.z;
      var separationSq = separationX * separationX + separationZ * separationZ;
      if (separationSq >= minDistance * minDistance) continue;
      var entryOffset = travelLength > 0.001 ? Math.sqrt(Math.max(0, minDistance * minDistance - separationSq)) / travelLength : 0;
      var impactT = clamp(projection - entryOffset - 0.01, 0, 1);
      if (impactT >= collisionT) continue;
      collisionTarget = other;
      collisionT = impactT;
    }
    if (collisionTarget) {
      targetX = oldX + travelX * collisionT;
      targetZ = oldZ + travelZ * collisionT;
      if (state.marshalUpgrade === "breachMarshal" && hasUpgrade("bonebreaker")) {
        collisionTarget.marshalStunTimer = Math.max(collisionTarget.marshalStunTimer || 0, 0.45);
      }
    }
    enemy.x = targetX;
    enemy.z = targetZ;
    resolveMoverPosition(enemy, enemy.radius + 0.16, ENEMY_BOUNDS_EXTRA);
    enemy.navGoal = null;
    enemy.stuckTimer = 0;
    enemy.group.position.set(enemy.x, 0, enemy.z);
    if (collisionTarget && state.marshalUpgrade === "breachMarshal" && hasUpgrade("bonebreaker") && collisionTarget.active !== false) {
      var collisionPointBlank = state.player
        ? Math.hypot(collisionTarget.x - state.player.x, collisionTarget.z - state.player.z) <= COACH_GUN_POINT_BLANK_RANGE
        : false;
      damageEnemy(collisionTarget, 2 * (1 + Math.max(0, state.globalDamageBonus || 0)), collisionTarget.x, collisionTarget.z, {
        type: "coachGun",
        pointBlank: collisionPointBlank,
        targetWasMarked: isMarshalEnemyMarked(collisionTarget),
        targetWasBounty: !!collisionTarget.marshalBounty,
        collision: true,
      });
    } else if (obstacleCollision && state.marshalUpgrade === "breachMarshal" && hasUpgrade("bonebreaker") && enemy.active !== false) {
      enemy.marshalStunTimer = Math.max(enemy.marshalStunTimer || 0, 0.45);
      damageEnemy(enemy, 2 * (1 + Math.max(0, state.globalDamageBonus || 0)), enemy.x, enemy.z, {
        type: "coachGun",
        pointBlank: !!source.pointBlank,
        targetWasMarked: isMarshalEnemyMarked(enemy),
        targetWasBounty: !!enemy.marshalBounty,
        collision: true,
      });
    }
  }

  function applyMarshalMark(enemy, duration) {
    if (!enemy || enemy.active === false) return;
    if (!isMarshalEnemyMarked(enemy)) state.marshalMarksApplied += 1;
    enemy.marshalMarkTimer = Math.max(enemy.marshalMarkTimer || 0, duration || COACH_GUN_MARK_LIFE);
  }

  function isMarshalEnemyMarked(enemy) {
    return !!(enemy && ((enemy.marshalMarkTimer || 0) > 0 || (enemy.marshalBountyTimer || 0) > 0));
  }

  function spawnCoachGunVolleyVisuals(context, weapon) {
    var rays = context.visualRays || [];
    var tracerCount = Math.floor(rays.length / 4);
    if (!tracerCount) return;

    var grave = state.marshalUpgrade === "graveWarden";
    var breach = state.marshalUpgrade === "breachMarshal";
    var speed = grave ? 56 : breach ? 46 : 50;
    var width = grave ? 0.09 : breach ? 0.115 : 0.1;
    var length = grave ? 1.05 : breach ? 0.72 : 0.78;
    var material = grave ? mats.rifleTracer : mats.coachTracer;
    reserveCoachGunTracerSlots(tracerCount);

    for (var i = 0; i < rays.length; i += 4) {
      var ball = rays[i + 3] === 1;
      spawnCoachGunTracer(
        context.startX,
        weapon.muzzleY,
        context.startZ,
        rays[i],
        rays[i + 1],
        rays[i + 2],
        ball ? speed * 1.08 : speed,
        ball ? width * 1.5 : width,
        ball ? length * 1.35 : length,
        material,
        ball
      );
    }
  }

  function reserveCoachGunTracerSlots(count) {
    var overflow = state.coachGunTracers.length + Math.max(0, count || 0) - MAX_COACH_GUN_TRACERS;
    while (overflow > 0 && state.coachGunTracers.length) {
      removeCoachGunTracer(0);
      overflow -= 1;
    }
  }

  function spawnCoachGunTracer(startX, startY, startZ, dirX, dirZ, distance, speed, width, length, material, ball) {
    var muzzleOffset = 0.12;
    coachGunTracerStartScratch.x = startX + dirX * muzzleOffset;
    coachGunTracerStartScratch.y = startY + (ball ? 0.025 : 0);
    coachGunTracerStartScratch.z = startZ + dirZ * muzzleOffset;
    coachGunTracerSizeScratch.width = width;
    coachGunTracerSizeScratch.length = length;
    var visual = acquireProjectileVisual(
      "standard",
      coachGunTracerStartScratch,
      Math.atan2(dirX, dirZ),
      coachGunTracerSizeScratch,
      material
    );
    state.coachGunTracers.push({
      x: coachGunTracerStartScratch.x,
      y: coachGunTracerStartScratch.y,
      z: coachGunTracerStartScratch.z,
      dirX: dirX,
      dirZ: dirZ,
      speed: speed,
      remaining: Math.max(0.08, distance - muzzleOffset - length * 0.34),
      ball: !!ball,
      visual: visual,
      mesh: visual.object,
    });
  }

  function updateCoachGunTracers(dt) {
    for (var i = state.coachGunTracers.length - 1; i >= 0; i--) {
      var tracer = state.coachGunTracers[i];
      var step = Math.min(tracer.remaining, tracer.speed * dt);
      tracer.x += tracer.dirX * step;
      tracer.z += tracer.dirZ * step;
      tracer.remaining -= step;
      tracer.mesh.position.set(tracer.x, tracer.y, tracer.z);
      syncStandardProjectileVisual(tracer.visual);
      if (tracer.remaining <= 0.0001) removeCoachGunTracer(i);
    }
  }

  function removeCoachGunTracer(index) {
    var tracer = state.coachGunTracers[index];
    if (!tracer) return;
    releaseProjectileVisual(tracer.visual);
    state.coachGunTracers.splice(index, 1);
  }

  function releaseAllCoachGunTracersToPool() {
    for (var i = state.coachGunTracers.length - 1; i >= 0; i--) {
      var tracer = state.coachGunTracers[i];
      if (tracer && tracer.visual) releaseProjectileVisual(tracer.visual);
    }
    state.coachGunTracers = [];
  }

  function purifyAcidWithCoachGun(context) {
    var cleansed = 0;
    for (var i = state.acidProjectiles.length - 1; i >= 0; i--) {
      var projectile = state.acidProjectiles[i];
      if (!pointInsideCoachGunCone(projectile.x, projectile.z, context, 0.55)) continue;
      addShockwave(projectile.x, projectile.z, 0.75, 0.22, 0xfff1b8);
      removeAcidProjectile(i);
      cleansed += 1;
    }
    for (var j = state.acidPuddles.length - 1; j >= 0; j--) {
      var puddle = state.acidPuddles[j];
      if (!pointInsideCoachGunCone(puddle.x, puddle.z, context, puddle.radius * 0.35)) continue;
      puddle.life -= 2;
      cleansed += 1;
      if (puddle.life <= 0) removeAcidPuddle(j);
    }
    if (!cleansed) return;
    context.acidCleansed = cleansed;
    state.marshalAcidCleansed += cleansed;
    state.marshalPurifyReloadTimer = Math.max(state.marshalPurifyReloadTimer, 2);
  }

  function pointInsideCoachGunCone(x, z, context, radius) {
    var dx = x - context.startX;
    var dz = z - context.startZ;
    var along = dx * context.dirX + dz * context.dirZ;
    if (along < 0 || along > context.range) return false;
    var lateralX = dx - context.dirX * along;
    var lateralZ = dz - context.dirZ * along;
    var halfWidth = Math.tan(context.spread * 0.5 + 0.08) * along + (radius || 0);
    return lateralX * lateralX + lateralZ * lateralZ <= halfWidth * halfWidth;
  }

  function getDualMuzzleSide(weapon) {
    if (!weapon || weapon.id !== "revolver" || state.revolverUpgrade !== "dualRevolvers") return 0;
    if (hasAllRightAllLeft()) {
      ensureDualRevolverHandState();
      return getDualRevolverHandSide(state.dualActiveHand);
    }
    return state.dualShotSide < 0 ? -1 : 1;
  }

  function getWeaponMuzzleStart(weapon, player, dir, muzzleSide) {
    var sideOffset = muzzleSide ? 0.58 * muzzleSide : 0;
    return new THREE.Vector3(
      player.x + dir.x * weapon.muzzleDistance + dir.z * sideOffset,
      weapon.muzzleY,
      player.z + dir.z * weapon.muzzleDistance - dir.x * sideOffset
    );
  }

  function getWeaponShotPlan(weapon, player) {
    var aimX = state.pointerWorld.x - player.x;
    var aimZ = state.pointerWorld.z - player.z;
    var aimDistance = Math.hypot(aimX, aimZ);
    if (aimDistance < 0.001) {
      aimX = Math.sin(player.aimAngle);
      aimZ = Math.cos(player.aimAngle);
      aimDistance = 1;
    }
    var dir = new THREE.Vector3(aimX / aimDistance, 0, aimZ / aimDistance);
    if (weapon.id !== "launcher") return { dir: dir };

    var maxRange = (weapon.range || weapon.speed * weapon.life) * getWeaponRangeMultiplier(weapon);
    var targetDistance = clamp(aimDistance, weapon.muzzleDistance + 0.25, maxRange);
    return {
      dir: dir,
      target: {
        x: player.x + dir.x * targetDistance,
        z: player.z + dir.z * targetDistance,
      },
    };
  }

  function isBigIronShot(weapon) {
    return weapon && weapon.id === "revolver" && state.revolverUpgrade === "bigIron";
  }

  function isSilverBulletShot(weapon, ammo) {
    if (!isBigIronShot(weapon) || !hasUpgrade("silverBullet") || !ammo) return false;
    var magazine = ammo.magazine || getWeaponMagazine(weapon);
    return Math.round(clamp(ammo.current, 0, magazine)) === 1;
  }

  function getWeaponProjectileSpeed(weapon, silverBullet) {
    var speed = weapon.speed;
    if (isBigIronShot(weapon)) speed *= 0.62;
    if (silverBullet) speed *= SILVER_BULLET_SPEED_MULTIPLIER;
    return speed;
  }

  function getWeaponProjectileLife(weapon, silverBullet) {
    var life = weapon.life * getWeaponRangeMultiplier(weapon);
    if (isBigIronShot(weapon)) return life * 1.7 * getBigIronProjectileSizeMultiplier(silverBullet);
    return life;
  }

  function getWeaponRangeMultiplier(weapon) {
    return 1 + Math.max(0, state.attackRangeBonus || 0);
  }

  function getLauncherBlastRadius() {
    var radius = WEAPONS.launcher.blastRadius * LAUNCHER_BLAST_RADIUS_MULTIPLIER;
    if (state.launcherUpgrade === "bombardier" && hasUpgrade("heavyPayload")) radius *= 1.34;
    return radius;
  }

  function getLauncherBlastDamage() {
    var damage = WEAPONS.launcher.blastDamage;
    if (state.launcherUpgrade === "bombardier" && hasUpgrade("heavyPayload")) damage += 2;
    return damage * (1 + Math.max(0, state.globalDamageBonus || 0));
  }

  function hasHeavyPayloadAirburst() {
    return state.playerClass === "demolitionist" && state.launcherUpgrade === "bombardier" && hasUpgrade("heavyPayload");
  }

  function getLauncherChainDetonationLimit() {
    if (state.launcherUpgrade !== "bombardier" || !hasUpgrade("chainDetonation")) return 0;
    return Math.min(LAUNCHER_CHAIN_MAX_EXPLOSIONS, LAUNCHER_CHAIN_BASE_EXPLOSIONS + getUpgradeCount("moreChainDetonations"));
  }

  function getLauncherFireRadius() {
    return FIRE_PATCH_BASE_RADIUS * (hasUpgrade("thermiteCore") ? 1.2 : 1);
  }

  function getLauncherFireLife() {
    return FIRE_PATCH_BASE_LIFE + getUpgradeCount("longBurn") * 2.1;
  }

  function getLauncherFireDamage() {
    return 1 + getUpgradeCount("hotterFire") + (hasUpgrade("thermiteCore") ? 1 : 0);
  }

  function hasPyrotechnicianFirePuddles() {
    return state.playerClass === "demolitionist" && state.launcherUpgrade === "pyrotechnician";
  }

  function hasPyrotechnicianFireBuff() {
    return state.playerClass === "demolitionist" && state.launcherUpgrade === "pyrotechnician";
  }

  function hasPyrotechnicianThermiteCore() {
    return state.playerClass === "demolitionist" && state.launcherUpgrade === "pyrotechnician" && hasUpgrade("thermiteCore");
  }

  function hasPyrotechnicianCrossfireShells() {
    return state.playerClass === "demolitionist" && state.launcherUpgrade === "pyrotechnician" && hasUpgrade("crossfireShells");
  }

  function getLauncherCrossfireRange() {
    return WEAPONS.launcher.range * getWeaponRangeMultiplier(WEAPONS.launcher) * LAUNCHER_CROSSFIRE_RANGE_MULTIPLIER;
  }

  function getLauncherCrossfireTrailRadius() {
    return getLauncherFireRadius() * 0.46;
  }

  function getLauncherCrossfireTrailLife() {
    return getLauncherFireLife() * 0.58;
  }

  function spawnThermitePlayerFirePatch(x, z) {
    state.launcherThermitePatches += 1;
    return spawnFirePatch(x, z, {
      radius: getLauncherFireRadius(),
      life: getLauncherFireLife(),
      damage: getLauncherFireDamage(),
      thermite: true,
      damageDelay: 0.08,
    });
  }

  function hasLauncherUpgradeOrStarter(id) {
    if ((id === "napalmShells" || id === "fireproofPowder") && state.launcherUpgrade === "pyrotechnician") return true;
    return hasUpgrade(id);
  }

  function getWeaponProjectileVisualSize(weapon, silverBullet) {
    if (isBigIronShot(weapon)) {
      var sizeScale = getBigIronProjectileSizeMultiplier(silverBullet);
      return {
        width: weapon.width * 1.8 * sizeScale,
        length: weapon.length * 1.55 * sizeScale,
      };
    }
    return {
      width: weapon.width,
      length: weapon.length,
    };
  }

  function getBigIronProjectileSizeMultiplier(silverBullet) {
    return (1 + getUpgradeCount("biggerCaliber") * 0.18) * (silverBullet ? SILVER_BULLET_SIZE_MULTIPLIER : 1);
  }

  function getWeaponProjectileHitRadius(weapon, silverBullet) {
    if (!weapon) return 0;
    if (isBigIronShot(weapon)) {
      var radius = weapon.hitRadius + getUpgradeCount("biggerCaliber") * 0.08;
      return radius * (silverBullet ? SILVER_BULLET_SIZE_MULTIPLIER : 1);
    }
    return weapon.hitRadius;
  }

  function getDualRicochetLimit() {
    if (state.revolverUpgrade !== "dualRevolvers" || !hasUpgrade("ricochetRounds")) return 0;
    return 1 + getUpgradeCount("moreRicochets");
  }

  function getDualSoftAimStrength() {
    if (state.revolverUpgrade !== "dualRevolvers" || !hasUpgrade("softAim")) return 0;
    return DUAL_SOFT_AIM_BASE + state.duelistFocus * DUELIST_FOCUS_SOFT_AIM_BONUS;
  }

  function createProjectileMesh(weapon, start, angle, visualSize, options) {
    options = options || {};
    if (weapon.id === "launcher") {
      return acquireProjectileVisual("launcher", start, angle, visualSize, null).object;
    }

    if (weapon.id === "rifle" && options.electric) {
      return acquireProjectileVisual("electric", start, angle, visualSize || getWeaponProjectileVisualSize(weapon), null).object;
    }

    var mat = weapon.id === "rifle" ? mats.rifleTracer : mats.bullet;
    var size = visualSize || getWeaponProjectileVisualSize(weapon);
    return acquireProjectileVisual("standard", start, angle, size, mat).object;
  }

  function createLauncherFireShardMesh(x, z, angle) {
    return acquireProjectileVisual("fireShard", { x: x, y: 0.56, z: z }, angle, null, null).object;
  }

  function willDamageKillEnemy(enemy, damage, source) {
    var hpAfter = enemy.hp - damage;
    if (hpAfter <= 0) return true;
    return !!(source && source.executioner && hpAfter <= enemy.maxHp * 0.28);
  }

  function prepareLauncherExplosionDamageBatch(source, targetCount) {
    if (targetCount <= 0) return;
    var particleCount = targetCount * 14;
    var debrisCount = 0;
    var xpOrbCount = 0;
    var scorchCount = 0;
    for (var i = 0; i < targetCount; i++) {
      if (!launcherExplosionKillScratch[i]) continue;
      var enemy = launcherExplosionEnemiesScratch[i];
      if (!enemy || enemy.active === false) continue;
      particleCount += 18 + getGoldBurstParticleCount(enemy.score);
      debrisCount += getDeathDebrisPieces(enemy).length;
      xpOrbCount += 1;
      scorchCount += 1;
    }
    reserveParticleSlots(particleCount);
    if (debrisCount > 0) reserveDebrisSlots(debrisCount);
    if (xpOrbCount > 0) reserveXpOrbSlots(xpOrbCount);
    if (scorchCount > 0) reserveDecalSlots(scorchCount);
    source.preReservedHitParticles = true;
    source.preReservedKillParticles = true;
    source.preReservedDeathDebris = true;
    source.preReservedXpOrbs = true;
    source.preReservedScorchDecals = true;
    source.aggregateHitSound = targetCount > 1;
  }

  function clearLauncherExplosionDamageScratch(targetCount) {
    for (var i = 0; i < targetCount; i++) {
      launcherExplosionEnemiesScratch[i] = null;
      launcherExplosionDamageScratch[i] = 0;
      launcherExplosionKillScratch[i] = false;
    }
    launcherExplosionEnemiesScratch.length = 0;
    launcherExplosionDamageScratch.length = 0;
    launcherExplosionKillScratch.length = 0;
  }

  function explodeGrenade(x, z, radius, damage, options) {
    options = options || {};
    var blastRadius = radius || getLauncherBlastRadius();
    var blastDamage = damage || getLauncherBlastDamage();
    var source = {
      type: "launcherExplosion",
      kind: options.kind || "main",
      bullet: options.bullet || null,
      chainContext: options.chainContext || null,
      killedEnemies: [],
      deferEnemyRemoval: true,
    };
    addShockwave(x, z, blastRadius, options.kind === "chain" ? 0.38 : 0.5, options.kind === "chain" ? 0xffb347 : 0xffe0a0);
    addScorchMark(x, z, blastRadius * 0.62);
    addLightFlash(x, 1.2, z, options.kind === "chain" ? 0xffb347 : 0xff7a22, options.kind === "chain" ? 4.6 : 5.8, 12, 0.28);
    if (!options.noAudio && !gameplayWarmupMode) playLauncherExplosionSound(x, z, blastRadius, options.kind || "main");
    var smokeCount = options.kind === "cluster" ? 7 : 12;
    reserveSmokePuffSlots(smokeCount);
    for (var s = 0; s < smokeCount; s++) {
      addSmokePuff(x + rand(-0.8, 0.8), rand(0.45, 1.25), z + rand(-0.8, 0.8), rand(0.48, 0.95), rand(0.55, 1.05), true);
    }
    var targetCount = 0;
    forEachEnemyNearCircle(x, z, blastRadius + 1.2, function (enemy) {
      if (!enemy || enemy.active === false) return;
      var dx = enemy.x - x;
      var dz = enemy.z - z;
      var hitRadius = blastRadius + enemy.radius * 0.28;
      if (dx * dx + dz * dz > hitRadius * hitRadius) return;
      var dist = Math.hypot(dx, dz);
      if (dist > hitRadius) return;
      var ratio = 1 - clamp(dist / blastRadius, 0, 1);
      var falloff = hasUpgrade("airburstFuse") ? 0.78 + ratio * 0.42 : ratio;
      var dealt = Math.max(1, Math.ceil(blastDamage * falloff + 0.5));
      launcherExplosionEnemiesScratch[targetCount] = enemy;
      launcherExplosionDamageScratch[targetCount] = dealt;
      launcherExplosionKillScratch[targetCount] = willDamageKillEnemy(enemy, dealt, source);
      targetCount += 1;
    });
    prepareLauncherExplosionDamageBatch(source, targetCount);
    for (var targetIndex = 0; targetIndex < targetCount; targetIndex++) {
      damageEnemy(launcherExplosionEnemiesScratch[targetIndex], launcherExplosionDamageScratch[targetIndex], x, z, source);
    }
    clearLauncherExplosionDamageScratch(targetCount);
    compactEnemiesAfterDeferredRemoval();

    var particleCount = options.kind === "cluster" ? 22 : 34;
    reserveParticleSlots(particleCount);
    for (var p = 0; p < particleCount; p++) {
      var angle = rand(0, Math.PI * 2);
      var speed = rand(1.4, options.kind === "cluster" ? 5.4 : 7.2);
      spawnParticle(
        x + Math.cos(angle) * rand(0, 0.5),
        rand(0.35, 1.35),
        z + Math.sin(angle) * rand(0, 0.5),
        Math.cos(angle) * speed,
        rand(1.2, 5.2),
        Math.sin(angle) * speed,
        rand(0.28, 0.58),
        rand(0.12, 0.38),
        p % 4 === 0 ? mats.flash : mats.explosion,
        true
      );
    }
    state.shake = Math.min(1.4, state.shake + (options.kind === "cluster" ? 0.46 : 0.75));
    handleLauncherExplosionAftermath(x, z, blastRadius, blastDamage, source, options);
    return source;
  }

  function handleLauncherExplosionAftermath(x, z, radius, damage, source, options) {
    var killedCount = source.killedEnemies.length;
    if (hasPyrotechnicianFirePuddles() && !options.noFire) {
      spawnFirePatch(x, z, {
        radius: getLauncherFireRadius(),
        life: getLauncherFireLife(),
        damage: getLauncherFireDamage(),
      });
    }
    if (hasPyrotechnicianCrossfireShells() && source.kind === "main" && options.bullet && !options.noCrossfire) {
      spawnLauncherCrossfireShards(x, z, options.bullet);
    }
    if (state.playerClass === "demolitionist" && state.launcherUpgrade === "bombardier") {
      var spreadContext = getLauncherSpreadContext(options, x, z);
      if (hasUpgrade("chainDetonation") && !options.chainContext) {
        options.chainContext = {
          remaining: getLauncherChainDetonationLimit(),
          triggered: 0,
        };
        source.chainContext = options.chainContext;
      }
      tryTriggerLauncherFullSalvo(killedCount, source);
      maybeRampMadmansJourney(killedCount, source, options);
      if (hasUpgrade("shrapnelRain") && !options.noShrapnel) {
        spawnLauncherShrapnel(x, z, 8 + getUpgradeCount("moreBomblets"));
      }
      if (hasUpgrade("clusterCharge") && !options.noCluster && source.kind === "main") {
        spawnLauncherBomblets(x, z, radius, damage, options, spreadContext);
      }
      if (options.bullet && options.bullet.powderEcho && source.kind === "main" && !options.echoed) {
        spawnLauncherPowderEchoes(x, z, radius, damage, options, spreadContext);
      }
      maybeTriggerLauncherChainDetonations(source, options, x, z, radius, damage, spreadContext);
    }
  }

  function maybeRampMadmansJourney(killedCount, source, options) {
    if (!hasUpgrade("madmansJourney")) return;
    if (!source || source.kind !== "main" || !options || !options.bullet) return;
    if (killedCount <= 1) return;
    var before = state.launcherMadmanStacks || 0;
    state.launcherMadmanStacks = Math.min(LAUNCHER_MADMAN_MAX_STACKS, before + 1);
    if (state.launcherMadmanStacks > before) {
      state.launcherMadmanTriggers = (state.launcherMadmanTriggers || 0) + 1;
      addLightFlash(state.player ? state.player.x : options.bullet.x, 1.25, state.player ? state.player.z : options.bullet.z, 0xffc45f, 2.8, 7.5, 0.2);
    }
  }

  function tryTriggerLauncherFullSalvo(killCount, context) {
    if (state.playerClass !== "demolitionist" || state.launcherUpgrade !== "bombardier" || !hasUpgrade("fullSalvo")) return 0;
    if (killCount < LAUNCHER_FULL_SALVO_KILL_THRESHOLD) return 0;
    var triggerContext = context || {};
    if (triggerContext.fullSalvoTriggered) return 0;
    triggerContext.fullSalvoTriggered = true;
    var restored = restoreWeaponAmmo("launcher", getWeaponMagazine(WEAPONS.launcher));
    if (restored > 0) state.launcherAmmoRefills += 1;
    return restored;
  }

  function spawnLauncherCrossfireShards(x, z, bullet) {
    var dirX = bullet && isFinite(bullet.dirX) ? bullet.dirX : 0;
    var dirZ = bullet && isFinite(bullet.dirZ) ? bullet.dirZ : 0;
    var len = Math.hypot(dirX, dirZ);
    if (len < 0.001 && state.player) {
      dirX = x - state.player.x;
      dirZ = z - state.player.z;
      len = Math.hypot(dirX, dirZ);
    }
    if (len < 0.001) {
      dirX = 0;
      dirZ = 1;
      len = 1;
    }
    dirX /= len;
    dirZ /= len;
    var sideDirs = [
      { x: -dirZ, z: dirX },
      { x: dirZ, z: -dirX },
    ];
    for (var i = 0; i < sideDirs.length; i++) {
      spawnLauncherFireShard(x, z, sideDirs[i].x, sideDirs[i].z);
    }
  }

  function spawnLauncherFireShard(x, z, dirX, dirZ) {
    var len = Math.hypot(dirX, dirZ);
    if (len < 0.001) return;
    dirX /= len;
    dirZ /= len;
    var range = getLauncherCrossfireRange();
    var speed = LAUNCHER_CROSSFIRE_SPEED;
    var life = range / speed;
    var startX = x + dirX * 0.38;
    var startZ = z + dirZ * 0.38;
    var angle = Math.atan2(dirX, dirZ);
    var mesh = createLauncherFireShardMesh(startX, startZ, angle);
    var visual = getProjectileVisualForObject(mesh);
    state.launcherCrossfireShards += 1;
    state.bullets.push({
      type: "launcherFireShard",
      x: startX,
      y: 0.56,
      z: startZ,
      dirX: dirX,
      dirZ: dirZ,
      speed: speed,
      life: life,
      maxLife: life,
      age: 0,
      baseDamage: 0,
      damage: 0,
      hitRadius: 0.18,
      visualWidth: 0.3,
      visualLength: 0.8,
      piercing: false,
      piercedEnemies: [],
      hitEnemies: [],
      ricochetRemaining: 0,
      ricochetDepth: 0,
      homing: 0,
      blastRadius: 0,
      blastDamage: 0,
      targetX: null,
      targetZ: null,
      targetRadius: 0,
      fireShard: true,
      fireTrailTimer: 0,
      trailTimer: 0,
      visual: visual,
      mesh: mesh,
    });
  }

  function getLauncherSpreadContext(options, x, z) {
    options.spreadContext = options.spreadContext || {
      points: [],
    };
    if (!options.spreadContext.seeded) {
      reserveLauncherSpreadPoint(options.spreadContext, x, z);
      options.spreadContext.seeded = true;
    }
    return options.spreadContext;
  }

  function reserveLauncherSpreadPoint(context, x, z) {
    if (!context || !context.points) return;
    context.points.push({ x: x, z: z });
    if (context.points.length > 80) context.points.shift();
  }

  function pointTooCloseToLauncherSpread(context, x, z, minDistance) {
    if (!context || !context.points) return false;
    for (var i = 0; i < context.points.length; i++) {
      var point = context.points[i];
      if (Math.hypot(point.x - x, point.z - z) < minDistance) return true;
    }
    return false;
  }

  function getLauncherSpreadPoint(originX, originZ, desiredX, desiredZ, radius, minDistance, context, index) {
    var baseAngle = Math.atan2(desiredZ - originZ, desiredX - originX);
    if (!isFinite(baseAngle)) baseAngle = rand(0, Math.PI * 2);
    var desiredDistance = Math.max(radius * 0.58, Math.hypot(desiredX - originX, desiredZ - originZ));
    var candidates = [
      { x: desiredX, z: desiredZ },
    ];
    for (var i = 0; i < 12; i++) {
      var side = i % 2 === 0 ? 1 : -1;
      var angle = baseAngle + side * (0.28 + i * 0.17) + index * 0.11;
      var distance = desiredDistance + radius * (0.16 + i * 0.08);
      candidates.push({
        x: originX + Math.cos(angle) * distance,
        z: originZ + Math.sin(angle) * distance,
      });
    }
    for (var c = 0; c < candidates.length; c++) {
      var candidate = candidates[c];
      if (!pointTooCloseToLauncherSpread(context, candidate.x, candidate.z, minDistance)) {
        reserveLauncherSpreadPoint(context, candidate.x, candidate.z);
        return candidate;
      }
    }
    var fallbackAngle = baseAngle + index * 0.72 + rand(-0.22, 0.22);
    var fallbackDistance = desiredDistance + radius * 1.15;
    var fallback = {
      x: originX + Math.cos(fallbackAngle) * fallbackDistance,
      z: originZ + Math.sin(fallbackAngle) * fallbackDistance,
    };
    reserveLauncherSpreadPoint(context, fallback.x, fallback.z);
    return fallback;
  }

  function recordLauncherExplosionSample(x, z, radius, options) {
    if (!options || (options.kind !== "cluster" && options.kind !== "chain" && options.kind !== "echo")) return;
    state.launcherExplosionSpreadSamples.push({
      x: x,
      z: z,
      radius: radius,
      kind: options.kind,
    });
    if (state.launcherExplosionSpreadSamples.length > 80) state.launcherExplosionSpreadSamples.shift();
  }

  function spawnLauncherBomblets(x, z, radius, damage, options, spreadContext) {
    var count = 3 + getUpgradeCount("moreBomblets");
    for (var i = 0; i < count; i++) {
      var angle = (Math.PI * 2 * i) / count + rand(-0.22, 0.22);
      var distance = rand(radius * 0.62, radius * 1.02);
      var point = getLauncherSpreadPoint(x, z, x + Math.cos(angle) * distance, z + Math.sin(angle) * distance, radius, radius * 0.42, spreadContext, i);
      state.launcherBomblets += 1;
      scheduleDelayedExplosion(point.x, point.z, radius * 0.48, damage * 0.58, 0.08 + i * 0.035, {
        bullet: options.bullet || null,
        kind: "cluster",
        chainContext: options.chainContext || null,
        spreadContext: spreadContext,
        noCluster: true,
      });
    }
  }

  function spawnLauncherPowderEchoes(x, z, radius, damage, options, spreadContext) {
    var baseAngle = rand(0, Math.PI * 2);
    for (var i = 0; i < LAUNCHER_POWDER_ECHO_COUNT; i++) {
      var angle = baseAngle + (Math.PI * 2 * i) / LAUNCHER_POWDER_ECHO_COUNT + rand(-0.14, 0.14);
      var distance = radius * rand(0.72, 0.98);
      var point = getLauncherSpreadPoint(x, z, x + Math.cos(angle) * distance, z + Math.sin(angle) * distance, radius, radius * 0.46, spreadContext, i + 20);
      state.launcherPowderEchoes += 1;
      scheduleDelayedExplosion(point.x, point.z, radius * 0.38, damage * 0.45, 0.22 + i * 0.055, {
        bullet: options.bullet,
        kind: "echo",
        chainContext: options.chainContext || null,
        spreadContext: spreadContext,
        noCluster: true,
        noShrapnel: true,
        echoed: true,
      });
    }
  }

  function maybeTriggerLauncherChainDetonations(source, options, originX, originZ, radius, damage, spreadContext) {
    if (!hasUpgrade("chainDetonation") || !source.killedEnemies.length) return;
    var context = source.chainContext || options.chainContext || {
      remaining: getLauncherChainDetonationLimit(),
      triggered: 0,
    };
    source.chainContext = context;
    options.chainContext = context;
    if (context.remaining <= 0) return;
    var killed = source.killedEnemies;
    for (var i = 0; i < killed.length && context.remaining > 0; i++) {
      var kill = killed[i];
      context.remaining -= 1;
      context.triggered += 1;
      state.launcherChainDetonations += 1;
      var killDx = kill.x - originX;
      var killDz = kill.z - originZ;
      var killDist = Math.hypot(killDx, killDz);
      var angle = killDist > 0.001 ? Math.atan2(killDz, killDx) : rand(0, Math.PI * 2);
      var desiredDistance = Math.max(radius * 0.72, killDist + radius * 0.34);
      var desiredX = originX + Math.cos(angle) * desiredDistance;
      var desiredZ = originZ + Math.sin(angle) * desiredDistance;
      var point = getLauncherSpreadPoint(originX, originZ, desiredX, desiredZ, radius, radius * 0.5, spreadContext, i + context.triggered);
      scheduleDelayedExplosion(point.x, point.z, radius * 0.56, damage * 0.62, 0.06 + i * 0.035, {
        bullet: options.bullet || null,
        kind: "chain",
        chainContext: context,
        spreadContext: spreadContext,
        noCluster: true,
      });
    }
  }

  function scheduleDelayedExplosion(x, z, radius, damage, delay, options) {
    recordLauncherExplosionSample(x, z, radius, options || {});
    state.delayedExplosions.push({
      x: x,
      z: z,
      radius: radius,
      damage: damage,
      delay: delay,
      options: options || {},
    });
  }

  function updateDelayedExplosions(dt) {
    var write = 0;
    for (var i = 0; i < state.delayedExplosions.length; i++) {
      var explosion = state.delayedExplosions[i];
      explosion.delay -= dt;
      if (explosion.delay > 0) {
        state.delayedExplosions[write] = explosion;
        write += 1;
      } else {
        delayedExplosionDueScratch.push(explosion);
      }
    }
    state.delayedExplosions.length = write;
    for (var dueIndex = delayedExplosionDueScratch.length - 1; dueIndex >= 0; dueIndex--) {
      var dueExplosion = delayedExplosionDueScratch[dueIndex];
      explodeGrenade(dueExplosion.x, dueExplosion.z, dueExplosion.radius, dueExplosion.damage, dueExplosion.options);
    }
    delayedExplosionDueScratch.length = 0;
  }

  function spawnLauncherShrapnel(x, z, count) {
    var amount = Math.max(4, Math.round(count || 8));
    var fullSalvoContext = {
      kills: 0,
      fullSalvoTriggered: false,
    };
    for (var i = 0; i < amount; i++) {
      var angle = (Math.PI * 2 * i) / amount + rand(-0.12, 0.12);
      var start = launcherShrapnelStartScratch;
      start.set(x + Math.sin(angle) * 0.38, WEAPONS.revolver.muzzleY, z + Math.cos(angle) * 0.38);
      var mesh = createProjectileMesh(WEAPONS.revolver, start, angle, {
        width: 0.08,
        length: 0.54,
      });
      var visual = getProjectileVisualForObject(mesh);
      state.launcherShrapnelShots += 1;
      state.bullets.push({
        type: "launcherShrapnel",
        x: start.x,
        y: start.y,
        z: start.z,
        dirX: Math.sin(angle),
        dirZ: Math.cos(angle),
        speed: 26,
        life: 0.42,
        maxLife: 0.42,
        age: 0,
        baseDamage: 1.2,
        damage: 1.2,
        hitRadius: 0.12,
        visualWidth: 0.08,
        visualLength: 0.54,
        piercing: false,
        piercedEnemies: [],
        hitEnemies: [],
        ricochetRemaining: 0,
        ricochetDepth: 0,
        homing: 0,
        blastRadius: 0,
        blastDamage: 0,
        targetX: null,
        targetZ: null,
        targetRadius: 0,
        trailTimer: 0,
        fullSalvoContext: fullSalvoContext,
        visual: visual,
        mesh: mesh,
      });
    }
  }

  function updateSpawning(dt) {
    if (state.spawnLeft <= 0) return;
    state.spawnTimer -= dt;
    if (state.spawnTimer <= 0) {
      var batch = Math.min(state.spawnLeft, getWaveSpawnBatchSize(state.wave));
      for (var i = 0; i < batch; i++) {
        spawnZombie();
      }
      state.spawnLeft -= batch;
      state.spawnTimer = state.spawnInterval * rand(0.65, 1.25);
    }
  }

  function rebuildZombieSpatialGrid() {
    for (var i = 0; i < zombieSpatialGridKeys.length; i++) {
      var key = zombieSpatialGridKeys[i];
      var bucket = zombieSpatialGrid.get(key);
      if (bucket) {
        bucket.length = 0;
        zombieSpatialBucketPool.push(bucket);
      }
    }
    zombieSpatialGrid.clear();
    zombieSpatialGridKeys.length = 0;
    zombieSpatialStats.cellCount = 0;
    zombieSpatialStats.maxBucketSize = 0;
    zombieSpatialStats.occupants = state.enemies.length;

    for (var e = 0; e < state.enemies.length; e++) {
      var enemy = state.enemies[e];
      var cellX = Math.floor(enemy.x / ZOMBIE_SPATIAL_CELL_SIZE);
      var cellZ = Math.floor(enemy.z / ZOMBIE_SPATIAL_CELL_SIZE);
      enemy.gridCellX = cellX;
      enemy.gridCellZ = cellZ;
      enemy.spatialOrder = e;
      var key = getZombieCellKey(cellX, cellZ);
      var bucket = zombieSpatialGrid.get(key);
      if (!bucket) {
        bucket = zombieSpatialBucketPool.length ? zombieSpatialBucketPool.pop() : [];
        zombieSpatialGrid.set(key, bucket);
        zombieSpatialGridKeys.push(key);
      }
      bucket.push(enemy);
      if (bucket.length > zombieSpatialStats.maxBucketSize) zombieSpatialStats.maxBucketSize = bucket.length;
    }
    zombieSpatialStats.cellCount = zombieSpatialGridKeys.length;
    zombieSpatialDirty = false;
  }

  function getZombieCellKey(cellX, cellZ) {
    return cellX * SPATIAL_CELL_KEY_STRIDE + cellZ;
  }

  function ensureZombieSpatialGridCurrent() {
    if (zombieSpatialDirty || zombieSpatialStats.occupants !== state.enemies.length) rebuildZombieSpatialGrid();
  }

  function accumulateZombieSeparation(enemy, playerDist, nx, nz) {
    var sepX = 0;
    var sepZ = 0;
    var playerMin = enemy.radius + state.player.radius + 0.12;
    if (playerDist < playerMin) {
      sepX -= nx * (playerMin - playerDist);
      sepZ -= nz * (playerMin - playerDist);
    }
    var cellX = enemy.gridCellX == null ? Math.floor(enemy.x / ZOMBIE_SPATIAL_CELL_SIZE) : enemy.gridCellX;
    var cellZ = enemy.gridCellZ == null ? Math.floor(enemy.z / ZOMBIE_SPATIAL_CELL_SIZE) : enemy.gridCellZ;
    for (var dz = -1; dz <= 1; dz++) {
      for (var dx = -1; dx <= 1; dx++) {
        var bucket = zombieSpatialGrid.get(getZombieCellKey(cellX + dx, cellZ + dz));
        if (!bucket) continue;
        for (var i = 0; i < bucket.length; i++) {
          var other = bucket[i];
          if (other === enemy || other.active === false) continue;
          var odx = enemy.x - other.x;
          var odz = enemy.z - other.z;
          var minSep = enemy.radius + other.radius + 0.36;
          if (Math.abs(odx) >= minSep || Math.abs(odz) >= minSep) continue;
          var od = Math.hypot(odx, odz);
          if (od < minSep) {
            if (od <= 0.001) {
              var angle = (cellX * 73856093 + cellZ * 19349663 + i * 83492791) % 6283 / 1000;
              odx = Math.cos(angle);
              odz = Math.sin(angle);
              od = 1;
            }
            sepX += (odx / od) * (minSep - od);
            sepZ += (odz / od) * (minSep - od);
          }
        }
      }
    }
    zombieSeparationScratch.x = sepX;
    zombieSeparationScratch.z = sepZ;
    return zombieSeparationScratch;
  }

  function updateEnemies(dt) {
    var p = state.player;
    var visibleGround = getCurrentVisibleGroundRect(enemyVisibleGroundScratch);
    var teleportSideCounts = prepareZombieTeleportSideCounts();
    ensureZombieSpatialGridCurrent();
    for (var i = state.enemies.length - 1; i >= 0; i--) {
      var e = state.enemies[i];
      if (e.active === false) continue;
      e.attackCooldown = Math.max(0, e.attackCooldown - dt);
      if (e.type === "spitter") e.acidCooldown = Math.max(0, (e.acidCooldown || 0) - dt);
      e.fireSlowTimer = Math.max(0, (e.fireSlowTimer || 0) - dt);
      e.marshalStunTimer = Math.max(0, (e.marshalStunTimer || 0) - dt);
      e.marshalFearTimer = Math.max(0, (e.marshalFearTimer || 0) - dt);
      e.marshalMarkTimer = Math.max(0, (e.marshalMarkTimer || 0) - dt);
      e.marshalBountyTimer = Math.max(0, (e.marshalBountyTimer || 0) - dt);
      if (e.marshalBounty && e.marshalBountyTimer <= 0) e.marshalBounty = false;
      e.hitPulse = Math.max(0, e.hitPulse - dt * 5);
      e.spitPulse = Math.max(0, (e.spitPulse || 0) - dt * 2.7);
      var baseEnemySpeed = refreshZombieSpeed(e);
      var enemySpeed = baseEnemySpeed * (e.fireSlowTimer > 0 && e.type !== "fastZombie" ? 0.62 : 1);
      var marshalMarked = (e.marshalMarkTimer || 0) > 0 || (e.marshalBountyTimer || 0) > 0;
      if (marshalMarked && state.marshalUpgrade === "graveWarden" && hasUpgrade("rockSalt")) enemySpeed *= 0.75;
      if (isEnemyInHallowedGround(e)) enemySpeed *= 0.7;
      var marshalMarkVisual = e.group.userData.marshalMark;
      if (marshalMarkVisual) {
        marshalMarkVisual.visible = marshalMarked;
        if (marshalMarked) {
          var markPulse = (e.marshalBounty ? 1.18 : 1) * (1 + Math.sin(state.time * 7 + e.radius) * 0.08);
          marshalMarkVisual.scale.setScalar(markPulse / Math.max(0.72, e.radius));
        }
      }

      var dx = p.x - e.x;
      var dz = p.z - e.z;
      var dist = Math.max(0.001, Math.hypot(dx, dz));
      if (maybeTeleportDistantZombie(e, p, dist, visibleGround, teleportSideCounts)) {
        continue;
      }
      var nx = dx / dist;
      var nz = dz / dist;
      var oldX = e.x;
      var oldZ = e.z;
      var separation = accumulateZombieSeparation(e, dist, nx, nz);
      var sepX = separation.x;
      var sepZ = separation.z;

      var moveX = 0;
      var moveZ = 0;
      var faceX = nx;
      var faceZ = nz;
      var marshalStunned = (e.marshalStunTimer || 0) > 0;
      var marshalFeared = (e.marshalFearTimer || 0) > 0;
      var spitterBusy = !marshalStunned && !marshalFeared && updateAcidSpitterAttack(e, p, dist, nx, nz, dt);
      if (marshalStunned) {
        moveX = 0;
        moveZ = 0;
      } else if (marshalFeared) {
        var fearDx = e.x - (e.marshalFearX || p.x);
        var fearDz = e.z - (e.marshalFearZ || p.z);
        var fearDist = Math.max(0.001, Math.hypot(fearDx, fearDz));
        var fearSteer = chooseClearZombieDirection(e, fearDx / fearDist, fearDz / fearDist, dt);
        moveX = fearSteer.x * enemySpeed * 0.82;
        moveZ = fearSteer.z * enemySpeed * 0.82;
        faceX = -fearSteer.x;
        faceZ = -fearSteer.z;
      } else if (dist > e.radius + p.radius + 0.18) {
        var steer = null;
        if (e.type === "spitter" && dist < ACID_SPIT_MIN_RANGE) {
          steer = chooseClearZombieDirection(e, -nx, -nz, dt);
          moveX = steer.x * enemySpeed * 0.74;
          moveZ = steer.z * enemySpeed * 0.74;
          faceX = nx;
          faceZ = nz;
        } else if (e.type === "spitter" && dist <= ACID_SPIT_RANGE * 0.92) {
          if (!spitterBusy) {
            var side = e.avoidSide || 1;
            steer = chooseClearZombieDirection(e, -nz * side, nx * side, dt);
            moveX = steer.x * enemySpeed * 0.26;
            moveZ = steer.z * enemySpeed * 0.26;
          }
          faceX = nx;
          faceZ = nz;
        } else {
          steer = chooseZombieDirection(e, p, nx, nz, dist, dt);
          moveX = steer.x * enemySpeed;
          moveZ = steer.z * enemySpeed;
          faceX = steer.x;
          faceZ = steer.z;
        }
      } else if (e.attackCooldown <= 0) {
        damagePlayer(e.damage);
        e.attackCooldown = e.type === "fastZombie" ? 0.72 : e.type === "runner" ? 0.8 : 1.05;
      }
      e.x += (moveX + sepX * 4.2) * dt;
      e.z += (moveZ + sepZ * 4.2) * dt;
      resolveMoverPosition(e, e.radius + 0.16, ENEMY_BOUNDS_EXTRA);
      var moved = Math.hypot(e.x - oldX, e.z - oldZ);
      updateZombieStuckState(e, moved, dist, dt);
      e.moveAmount += (clamp(moved / Math.max(0.001, enemySpeed * dt), 0, 1) - e.moveAmount) * Math.min(1, dt * 10);
      e.walkPhase += dt * (4.6 + enemySpeed * 1.1) * e.moveAmount;

      e.group.position.set(e.x, 0, e.z);
      e.group.rotation.y = Math.atan2(faceX, faceZ);
      e.group.scale.setScalar(1 + e.hitPulse * 0.08);
      var visualVisible = !pointOutsideVisibleGround(e.x, e.z, e.radius + ENEMY_VISUAL_CULL_PAD, visibleGround);
      e.group.visible = visualVisible;
      if (visualVisible) {
        updateZombieVisual(e);
        updateEnemyHealthBar(e);
      }
    }
    rebuildZombieSpatialGrid();
  }

  function prepareZombieTeleportSideCounts() {
    var counts = zombieTeleportSideCountScratch;
    counts[0] = 0;
    counts[1] = 0;
    counts[2] = 0;
    counts[3] = 0;
    for (var i = 0; i < state.enemies.length; i++) {
      var side = state.enemies[i].spawnSide;
      if (side !== 0 && side !== 1 && side !== 2 && side !== 3) return null;
      counts[side] += 1;
    }
    return counts;
  }

  function updateAcidSpitterAttack(enemy, player, dist, nx, nz, dt) {
    if (enemy.type !== "spitter") return false;
    if (enemy.spitWindup > 0) {
      enemy.spitWindup -= dt;
      if (enemy.spitWindup <= 0) {
        var target = enemy.spitTarget;
        launchAcidSpit(enemy, target ? target.x : player.x, target ? target.z : player.z);
        enemy.spitTarget = null;
        enemy.acidCooldown = ACID_SPIT_COOLDOWN + rand(-0.38, 0.52);
        enemy.spitPulse = 1;
      }
      return true;
    }

    if ((enemy.acidCooldown || 0) > 0) return false;
    if (dist < ACID_SPIT_MIN_RANGE || dist > ACID_SPIT_RANGE) return false;
    enemy.spitWindup = ACID_SPIT_WINDUP;
    enemy.spitTargetStorage.x = player.x;
    enemy.spitTargetStorage.z = player.z;
    enemy.spitTarget = enemy.spitTargetStorage;
    enemy.navGoal = null;
    enemy.stuckTimer = 0;
    enemy.steerX = nx;
    enemy.steerZ = nz;
    enemy.spitPulse = 0.55;
    return true;
  }

  function launchAcidSpit(enemy, targetX, targetZ) {
    var dx = targetX - enemy.x;
    var dz = targetZ - enemy.z;
    var dist = Math.max(0.001, Math.hypot(dx, dz));
    var maxRange = ACID_SPIT_RANGE;
    if (dist > maxRange) {
      targetX = enemy.x + (dx / dist) * maxRange;
      targetZ = enemy.z + (dz / dist) * maxRange;
      dist = maxRange;
    }
    var dirX = (targetX - enemy.x) / Math.max(0.001, dist);
    var dirZ = (targetZ - enemy.z) / Math.max(0.001, dist);
    var startX = enemy.x + dirX * (enemy.radius + 0.32);
    var startY = 2.75;
    var startZ = enemy.z + dirZ * (enemy.radius + 0.32);
    var travel = Math.max(0.2, Math.hypot(targetX - startX, targetZ - startZ));
    var mesh = createAcidProjectileMesh(startX, startY, startZ, Math.atan2(dirX, dirZ));
    state.acidProjectiles.push({
      x: startX,
      y: startY,
      z: startZ,
      dirX: (targetX - startX) / travel,
      dirZ: (targetZ - startZ) / travel,
      targetX: targetX,
      targetZ: targetZ,
      speed: ACID_SPIT_SPEED,
      life: travel / ACID_SPIT_SPEED,
      maxLife: travel / ACID_SPIT_SPEED,
      age: 0,
      dripTimer: 0,
      mesh: mesh,
    });
    enemy.acidShots = (enemy.acidShots || 0) + 1;
    addLightFlash(startX, startY, startZ, 0xeaff22, 3.2, 6.8, 0.18);
    for (var i = 0; i < 8; i++) {
      spawnParticle(startX, startY, startZ, dirX * rand(1.4, 3.2) + rand(-0.8, 0.8), rand(0.5, 1.9), dirZ * rand(1.4, 3.2) + rand(-0.8, 0.8), rand(0.18, 0.34), rand(0.06, 0.14), i % 2 ? mats.acidSpitHot : mats.acidSpitShadow);
    }
    trimEffects(state.acidProjectiles, MAX_ACID_PROJECTILES, removeAcidProjectile);
  }

  function createAcidProjectileMesh(x, y, z, angle) {
    var group = new THREE.Group();
    group.position.set(x, y, z);
    group.rotation.y = angle;
    effectRoot.add(group);
    var parts = [];
    parts.push(addSlimeLobe(group, 0.36, 0.24, 0.48, mats.acidSpitCore, -0.02, -0.01, 0, 0.2));
    parts.push(addSlimeLobe(group, 0.24, 0.18, 0.3, mats.acidSpitShadow, -0.22, -0.03, -0.12, 1.4));
    parts.push(addSlimeLobe(group, 0.2, 0.15, 0.23, mats.acidSpitCore, 0.21, 0.07, 0.13, 2.1));
    parts.push(addSlimeLobe(group, 0.13, 0.1, 0.2, mats.acidSpitHot, 0.05, 0.13, 0.28, 3.2));
    parts.push(addSlimeLobe(group, 0.12, 0.09, 0.17, mats.acidSpitShadow, -0.06, -0.13, 0.25, 4.4));
    parts.push(addSlimeLobe(group, 0.16, 0.09, 0.19, mats.acidSpitHot, 0.18, -0.06, -0.08, 5.1));
    parts.push(addSlimeLobe(group, 0.09, 0.07, 0.15, mats.acidSpitHot, -0.2, 0.09, 0.09, 5.9));
    group.userData.slimeParts = parts;
    return group;
  }

  function addSlimeLobe(parent, sx, sy, sz, mat, x, y, z, phase) {
    var mesh = new THREE.Mesh(getSharedGeometry("slime-lobe-sphere", function () {
      return new THREE.SphereGeometry(1, 14, 10);
    }), mat);
    mesh.position.set(x || 0, y || 0, z || 0);
    mesh.scale.set(sx, sy, sz);
    mesh.castShadow = true;
    mesh.receiveShadow = false;
    mesh.userData.disposeGeometry = false;
    mesh.userData.noDebris = true;
    mesh.userData.slimePhase = phase || 0;
    rememberBase(mesh);
    parent.add(mesh);
    return mesh;
  }

  function updateAcidProjectiles(dt) {
    for (var i = state.acidProjectiles.length - 1; i >= 0; i--) {
      var spit = state.acidProjectiles[i];
      spit.age += dt;
      var toTargetX = spit.targetX - spit.x;
      var toTargetZ = spit.targetZ - spit.z;
      var targetDistance = Math.hypot(toTargetX, toTargetZ);
      var step = spit.speed * dt;
      if (targetDistance <= step + 0.18 || spit.life <= 0) {
        spawnAcidPuddle(spit.targetX, spit.targetZ);
        removeAcidProjectile(i);
        continue;
      }
      spit.life -= dt;
      spit.x += spit.dirX * step;
      spit.z += spit.dirZ * step;
      var progress = clamp(spit.age / spit.maxLife, 0, 1);
      spit.y = 0.48 + Math.sin(progress * Math.PI) * 1.75;
      spit.mesh.position.set(spit.x, spit.y, spit.z);
      animateAcidProjectileMesh(spit, progress, dt);
      spit.dripTimer -= dt;
      if (spit.dripTimer <= 0) {
        spit.dripTimer = 0.045;
        spawnSlimeParticle(
          spit.x - spit.dirX * rand(0.05, 0.32),
          spit.y + rand(-0.08, 0.08),
          spit.z - spit.dirZ * rand(0.05, 0.32),
          -spit.dirX * rand(0.4, 1.4) + rand(-0.35, 0.35),
          rand(-0.25, 0.55),
          -spit.dirZ * rand(0.4, 1.4) + rand(-0.35, 0.35),
          rand(0.2, 0.38),
          rand(0.045, 0.095),
          rng() < 0.42 ? mats.acidSpitHot : mats.acidSpitCore
        );
      }
    }
  }

  function animateAcidProjectileMesh(spit, progress, dt) {
    var group = spit.mesh;
    group.rotation.x += dt * 5.6;
    group.rotation.z += dt * 4.4;
    var parts = group.userData.slimeParts || [];
    for (var i = 0; i < parts.length; i++) {
      var part = parts[i];
      var phase = part.userData.slimePhase || 0;
      var wobble = Math.sin(state.time * 13 + phase + progress * Math.PI * 2) * 0.12;
      var stretch = Math.cos(state.time * 9 + phase) * 0.08;
      scaleFromBase(part, 1 + wobble + stretch * 0.4, 1 - wobble * 0.55, 1 + stretch);
      animateMesh(part, {
        x: Math.sin(state.time * 10 + phase) * 0.018,
        y: Math.cos(state.time * 11 + phase) * 0.016,
        z: Math.sin(state.time * 8 + phase) * 0.02,
      });
    }
  }

  function spawnAcidPuddle(x, z) {
    if (pointHitsObstacle(x, z, 0.4)) {
      var safe = findNearestClearGroundPoint(x, z, 0.48);
      x = safe.x;
      z = safe.z;
    }
    var visual = acquireAcidPuddleVisual(x, z);
    state.acidPuddles.push({
      x: x,
      z: z,
      radius: ACID_PUDDLE_RADIUS,
      life: ACID_PUDDLE_LIFE,
      startLife: ACID_PUDDLE_LIFE,
      damageTimer: 0,
      mesh: visual.group,
      surface: visual.surface,
      darkPatch: visual.darkPatch,
      ring: visual.ring,
      foam: visual.foam,
      bubbles: visual.bubbles,
      visual: visual,
    });
    addShockwave(x, z, ACID_PUDDLE_RADIUS * 0.85, 0.34, 0x9cff47);
    addLightFlash(x, 0.8, z, 0x8dff31, 2.1, 5.5, 0.2);
    for (var i = 0; i < 14; i++) {
      var angle = rand(0, Math.PI * 2);
      var speed = rand(0.9, 3.6);
      spawnSlimeParticle(x, rand(0.2, 0.8), z, Math.cos(angle) * speed, rand(0.45, 2.2), Math.sin(angle) * speed, rand(0.22, 0.46), rand(0.05, 0.13), i % 2 ? mats.acid : mats.acidDark);
    }
    trimEffects(state.acidPuddles, MAX_ACID_PUDDLES, removeAcidPuddle);
  }

  function createAcidPuddleVisual() {
    var group = new THREE.Group();
    group.position.set(0, 0, 0);
    group.visible = false;

    var surface = addPuddleCircle(group, mats.acidPuddle.clone(), ACID_PUDDLE_RADIUS, ACID_PUDDLE_RADIUS * 0.82, 0.09, -1, 0);
    var darkPatch = addPuddleCircle(group, mats.acidPuddleDark.clone(), ACID_PUDDLE_RADIUS * 0.55, ACID_PUDDLE_RADIUS * 0.34, 0.095, 0, 0);
    var ring = addPuddleRing(group, ACID_PUDDLE_RADIUS * 0.68, 0.105);
    var foam = addPuddleCircle(group, mats.acidPuddleFoam.clone(), ACID_PUDDLE_RADIUS * 0.34, ACID_PUDDLE_RADIUS * 0.11, 0.11, 1, 0);

    var bubbles = [];
    for (var i = 0; i < 7; i++) {
      bubbles.push(addPuddleBubble(group, 0, 0, 0.1, i));
    }

    var visual = { group: group, surface: surface, darkPatch: darkPatch, ring: ring, foam: foam, bubbles: bubbles };
    group.userData.acidPuddleVisual = visual;
    acidPuddleVisualCreated += 1;
    return visual;
  }

  function configureAcidPuddleVisual(visual, x, z) {
    resetFirePatchCircle(visual.surface, ACID_PUDDLE_RADIUS * rand(0.92, 1.08), ACID_PUDDLE_RADIUS * rand(0.72, 0.96), rand(0, Math.PI * 2));
    resetFirePatchCircle(visual.darkPatch, ACID_PUDDLE_RADIUS * rand(0.48, 0.62), ACID_PUDDLE_RADIUS * rand(0.26, 0.42), rand(0, Math.PI * 2));
    visual.darkPatch.position.set(rand(-0.22, 0.22), 0.095, rand(-0.16, 0.16));
    rememberBase(visual.darkPatch);
    resetFirePatchCircle(visual.ring, ACID_PUDDLE_RADIUS * 0.68, ACID_PUDDLE_RADIUS * 0.68 * 0.82, 0);
    resetFirePatchCircle(visual.foam, ACID_PUDDLE_RADIUS * 0.34, ACID_PUDDLE_RADIUS * 0.11, rand(0, Math.PI * 2));
    visual.foam.position.set(rand(-0.42, 0.42), 0.11, rand(-0.32, 0.32));
    rememberBase(visual.foam);
    for (var i = 0; i < visual.bubbles.length; i++) {
      configureAcidPuddleBubble(visual.bubbles[i], i);
    }
    visual.group.position.set(x, 0, z);
    visual.group.visible = true;
  }

  function acquireAcidPuddleVisual(x, z) {
    var visual = acidPuddleVisualPool.length ? acidPuddleVisualPool.pop() : createAcidPuddleVisual();
    acidPuddleVisualInUse += 1;
    configureAcidPuddleVisual(visual, x, z);
    if (visual.group.parent !== effectRoot) effectRoot.add(visual.group);
    return visual;
  }

  function releaseAcidPuddleVisual(visual) {
    if (!visual) return;
    if (visual.group.parent) visual.group.parent.remove(visual.group);
    visual.group.visible = false;
    acidPuddleVisualInUse = Math.max(0, acidPuddleVisualInUse - 1);
    acidPuddleVisualPool.push(visual);
  }

  function addPuddleCircle(parent, mat, sx, sz, y, renderOrder, angle) {
    mat.opacity = mat.opacity == null ? 0.4 : mat.opacity;
    var mesh = new THREE.Mesh(getSharedGeometry("acid-puddle-circle", function () {
      return new THREE.CircleGeometry(1, 28);
    }), mat);
    mesh.userData.disposeGeometry = false;
    mesh.userData.disposeMaterial = true;
    mesh.rotation.x = -Math.PI / 2;
    mesh.rotation.z = angle || 0;
    mesh.position.y = y;
    mesh.scale.set(sx, sz, 1);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.renderOrder = renderOrder || 0;
    mesh.userData.baseOpacity = mat.opacity;
    rememberBase(mesh);
    parent.add(mesh);
    return mesh;
  }

  function addPuddleRing(parent, radius, y) {
    var mat = mats.acidPuddleFoam.clone();
    mat.opacity = 0.46;
    var mesh = new THREE.Mesh(getSharedGeometry("acid-puddle-ripple-ring", function () {
      return new THREE.RingGeometry(0.78, 1, 36);
    }), mat);
    mesh.userData.disposeGeometry = false;
    mesh.userData.disposeMaterial = true;
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = y;
    mesh.scale.set(radius, radius * 0.82, 1);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.renderOrder = 2;
    rememberBase(mesh);
    parent.add(mesh);
    return mesh;
  }

  function addPuddleBubble(parent, x, z, size, index) {
    var mesh = new THREE.Mesh(getSharedGeometry("acid-puddle-bubble-sphere", function () {
      return new THREE.SphereGeometry(1, 9, 6);
    }), index % 2 ? mats.slimeHighlight : mats.acid);
    mesh.userData.disposeGeometry = false;
    mesh.userData.noDebris = true;
    mesh.userData.bubblePhase = rand(0, Math.PI * 2);
    mesh.position.set(x, 0.13, z);
    mesh.scale.set(size, size * 0.32, size);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    rememberBase(mesh);
    parent.add(mesh);
    return mesh;
  }

  function configureAcidPuddleBubble(mesh, index) {
    var angle = rand(0, Math.PI * 2);
    var distance = rand(0.25, ACID_PUDDLE_RADIUS * 0.78);
    var size = rand(0.055, 0.13);
    mesh.userData.bubblePhase = rand(0, Math.PI * 2);
    mesh.position.set(Math.cos(angle) * distance, 0.13, Math.sin(angle) * distance);
    mesh.scale.set(size, size * 0.32, size);
    mesh.visible = true;
    rememberBase(mesh);
  }

  function findNearestClearGroundPoint(x, z, radius) {
    if (!pointHitsObstacle(x, z, radius)) return { x: x, z: z };
    for (var ring = 1; ring <= 5; ring++) {
      var step = ring * 0.9;
      for (var i = 0; i < 10; i++) {
        var angle = (Math.PI * 2 * i) / 10 + ring * 0.37;
        var nx = x + Math.cos(angle) * step;
        var nz = z + Math.sin(angle) * step;
        if (!pointHitsObstacle(nx, nz, radius)) return { x: nx, z: nz };
      }
    }
    return { x: x, z: z };
  }

  function updateAcidPuddles(dt) {
    for (var i = state.acidPuddles.length - 1; i >= 0; i--) {
      var puddle = state.acidPuddles[i];
      puddle.life -= dt;
      puddle.damageTimer = Math.max(0, puddle.damageTimer - dt);
      var fade = clamp(puddle.life / puddle.startLife, 0, 1);
      var pulse = 1 + Math.sin(state.time * 7 + i) * 0.035;
      if (puddle.surface) {
        puddle.surface.material.opacity = 0.4 * Math.min(1, fade * 1.55);
        puddle.surface.rotation.z += dt * 0.08;
        scaleFromBase(puddle.surface, pulse, 1 - (pulse - 1) * 0.55, 1);
      }
      if (puddle.darkPatch) {
        puddle.darkPatch.material.opacity = 0.24 * Math.min(1, fade * 1.35);
        puddle.darkPatch.rotation.z -= dt * 0.16;
        scaleFromBase(puddle.darkPatch, 1 + Math.sin(state.time * 5.3 + i) * 0.08, 1 + Math.cos(state.time * 4.1 + i) * 0.06, 1);
      }
      if (puddle.ring) {
        var ringPulse = 1 + ((state.time * 0.72 + i * 0.21) % 1) * 0.32;
        puddle.ring.material.opacity = 0.36 * fade * (2 - ringPulse);
        scaleFromBase(puddle.ring, ringPulse, ringPulse * 0.86, 1);
      }
      if (puddle.foam) {
        puddle.foam.material.opacity = 0.45 * Math.min(1, fade * 1.8) * (0.78 + Math.sin(state.time * 8 + i) * 0.22);
        puddle.foam.rotation.z += dt * 0.42;
      }
      var bubbles = puddle.bubbles || [];
      for (var b = 0; b < bubbles.length; b++) {
        var bubble = bubbles[b];
        var phase = bubble.userData.bubblePhase || 0;
        var bubblePulse = 0.7 + Math.max(0, Math.sin(state.time * 5.8 + phase)) * 0.75;
        bubble.position.y = 0.12 + Math.max(0, Math.sin(state.time * 5.8 + phase)) * 0.09;
        scaleFromBase(bubble, bubblePulse, 0.28 + bubblePulse * 0.18, bubblePulse);
      }
      if (state.player && puddle.damageTimer <= 0) {
        var dist = Math.hypot(state.player.x - puddle.x, state.player.z - puddle.z);
        if (dist <= puddle.radius + state.player.radius * 0.35) {
          damagePlayer(ACID_PUDDLE_DAMAGE);
          puddle.damageTimer = ACID_PUDDLE_DAMAGE_INTERVAL;
        }
      }
      if (puddle.life <= 0) removeAcidPuddle(i);
    }
  }

  function removeAcidProjectile(index) {
    var spit = state.acidProjectiles[index];
    if (!spit) return;
    removeObject3D(spit.mesh);
    state.acidProjectiles.splice(index, 1);
  }

  function removeAcidPuddle(index) {
    var puddle = state.acidPuddles[index];
    if (!puddle) return;
    releaseAcidPuddleVisual(puddle.visual);
    state.acidPuddles.splice(index, 1);
  }

  function getFirePatchVisualPoolKey(trail) {
    return trail ? "trail" : "standard";
  }

  function getFirePatchVisualPoolStats() {
    return {
      standard: {
        available: firePatchVisualPools.standard.length,
        created: firePatchVisualCreated.standard,
        inUse: firePatchVisualInUse.standard,
      },
      trail: {
        available: firePatchVisualPools.trail.length,
        created: firePatchVisualCreated.trail,
        inUse: firePatchVisualInUse.trail,
      },
    };
  }

  function getAcidPuddleVisualPoolStats() {
    return {
      available: acidPuddleVisualPool.length,
      created: acidPuddleVisualCreated,
      inUse: acidPuddleVisualInUse,
      prewarm: ACID_PUDDLE_VISUAL_PREWARM,
    };
  }

  function getRifleTrapVisualPoolStats() {
    return {
      available: rifleTrapVisualPool.length,
      created: rifleTrapVisualCreated,
      inUse: rifleTrapVisualInUse,
      prewarm: RIFLE_TRAP_VISUAL_PREWARM,
      activePrewarm: RIFLE_TRAP_VISUAL_ACTIVE_PREWARM,
    };
  }

  function getParticleVisualPoolKey(kind) {
    return kind === "sphere" ? "sphere" : "box";
  }

  function getParticleVisualPoolStats() {
    var batchCount = 0;
    var drawnInstances = 0;
    for (var key in particleInstancedBatches) {
      if (!Object.prototype.hasOwnProperty.call(particleInstancedBatches, key)) continue;
      batchCount += 1;
      drawnInstances += particleInstancedBatches[key].count || 0;
    }
    return {
      box: {
        available: particleVisualPools.box.length,
        created: particleVisualCreated.box,
        inUse: particleVisualInUse.box,
        prewarm: PARTICLE_VISUAL_PREWARM,
      },
      sphere: {
        available: particleVisualPools.sphere.length,
        created: particleVisualCreated.sphere,
        inUse: particleVisualInUse.sphere,
        prewarm: PARTICLE_VISUAL_PREWARM,
      },
      maxParticles: MAX_PARTICLES,
      instanced: true,
      batches: batchCount,
      drawnInstances: drawnInstances,
    };
  }

  function getXpOrbVisualPoolStats() {
    return {
      available: xpOrbVisualPool.length,
      created: xpOrbVisualCreated,
      inUse: xpOrbVisualInUse,
      prewarm: XP_ORB_VISUAL_PREWARM,
      maxActive: MAX_XP_ORBS,
    };
  }

  function getDeathDebrisVisualPoolStats() {
    return {
      available: deathDebrisVisualPool.length,
      created: deathDebrisVisualCreated,
      inUse: deathDebrisVisualInUse,
      prewarm: DEATH_DEBRIS_VISUAL_PREWARM,
      maxActive: MAX_DEBRIS,
    };
  }

  function getProjectileVisualPoolKey(kind) {
    if (kind === "launcher" || kind === "electric" || kind === "fireShard") return kind;
    return "standard";
  }

  function getProjectileVisualPoolStats() {
    var standardBatches = 0;
    var standardDrawnInstances = 0;
    for (var materialKey in projectileStandardInstancedBatches) {
      if (!Object.prototype.hasOwnProperty.call(projectileStandardInstancedBatches, materialKey)) continue;
      var batches = projectileStandardInstancedBatches[materialKey];
      for (var i = 0; i < batches.length; i++) {
        standardBatches += 1;
        standardDrawnInstances += batches[i].count || 0;
      }
    }
    return {
      standard: {
        available: projectileVisualPools.standard.length,
        created: projectileVisualCreated.standard,
        inUse: projectileVisualInUse.standard,
        prewarm: PROJECTILE_VISUAL_PREWARM.standard,
        instanced: true,
        batches: standardBatches,
        drawnInstances: standardDrawnInstances,
        instanceCapacity: PROJECTILE_STANDARD_INSTANCE_CAPACITY,
      },
      launcher: {
        available: projectileVisualPools.launcher.length,
        created: projectileVisualCreated.launcher,
        inUse: projectileVisualInUse.launcher,
        prewarm: PROJECTILE_VISUAL_PREWARM.launcher,
      },
      electric: {
        available: projectileVisualPools.electric.length,
        created: projectileVisualCreated.electric,
        inUse: projectileVisualInUse.electric,
        prewarm: PROJECTILE_VISUAL_PREWARM.electric,
      },
      fireShard: {
        available: projectileVisualPools.fireShard.length,
        created: projectileVisualCreated.fireShard,
        inUse: projectileVisualInUse.fireShard,
        prewarm: PROJECTILE_VISUAL_PREWARM.fireShard,
      },
      activeProjectiles: state.bullets.length,
      activeCoachGunTracers: state.coachGunTracers.length,
      maxCoachGunTracers: MAX_COACH_GUN_TRACERS,
      activePaleDeputyTracers: state.paleDeputyTracers.length,
      maxPaleDeputyTracers: MAX_PALE_DEPUTY_TRACERS,
    };
  }

  function getExplosionEffectPoolStats() {
    return {
      shockwaves: {
        available: shockwaveVisualPool.length,
        created: shockwaveVisualCreated,
        inUse: shockwaveVisualInUse,
      },
      smokePuffs: {
        available: smokePuffVisualPool.length,
        created: smokePuffVisualCreated,
        inUse: smokePuffVisualInUse,
      },
      lightFlashes: {
        available: lightFlashPool.length,
        created: lightFlashCreated,
        inUse: lightFlashInUse,
        prewarm: LIGHT_FLASH_PREWARM,
        maxActive: MAX_LIGHT_FLASHES,
      },
      scorchDecals: {
        available: scorchDecalVisualPool.length,
        created: scorchDecalVisualCreated,
        inUse: scorchDecalVisualInUse,
        prewarm: SCORCH_DECAL_VISUAL_PREWARM,
        maxActive: MAX_DECALS,
      },
    };
  }

  function createParticleVisual(kind) {
    var key = getParticleVisualPoolKey(kind);
    var visual = {
      poolKey: key,
      batch: null,
      index: -1,
      particle: null,
      inUse: false,
    };
    particleVisualCreated[key] += 1;
    return visual;
  }

  function getParticleMaterialKey(material) {
    var mat = material || mats.flash;
    if (!mat.userData) mat.userData = {};
    if (!mat.userData.particleInstanceKey) {
      mat.userData.particleInstanceKey = "particleMat" + particleMaterialIdCounter++;
    }
    return mat.userData.particleInstanceKey;
  }

  function getParticleInstancedBatch(kind, material) {
    var key = getParticleVisualPoolKey(kind);
    var mat = material || mats.flash;
    var batchKey = key + ":" + getParticleMaterialKey(mat);
    var batch = particleInstancedBatches[batchKey];
    if (batch) {
      if (batch.mesh.parent !== effectRoot) effectRoot.add(batch.mesh);
      return batch;
    }
    var geometry =
      key === "sphere"
        ? getSharedGeometry("particle-sphere", function () {
            return new THREE.SphereGeometry(1, 9, 6);
          })
        : getSharedBoxGeometry(1, 1, 1);
    var mesh = new THREE.InstancedMesh(geometry, mat, MAX_PARTICLES);
    mesh.count = 0;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.userData.disposeGeometry = false;
    mesh.userData.particleBatch = null;
    batch = {
      key: batchKey,
      kind: key,
      material: mat,
      mesh: mesh,
      count: 0,
      visuals: [],
    };
    mesh.userData.particleBatch = batch;
    particleInstancedBatches[batchKey] = batch;
    particleInstancedBatchList.push(batch);
    effectRoot.add(mesh);
    return batch;
  }

  function acquireParticleVisual(kind, x, y, z, size, mat) {
    var key = getParticleVisualPoolKey(kind);
    var pool = particleVisualPools[key];
    var visual = pool.length ? pool.pop() : createParticleVisual(key);
    var batch = getParticleInstancedBatch(key, mat);
    visual.inUse = true;
    visual.batch = batch;
    visual.index = batch.count;
    visual.particle = null;
    batch.visuals[visual.index] = visual;
    batch.count += 1;
    batch.mesh.count = batch.count;
    particleVisualInUse[key] += 1;
    writeParticleVisualMatrix(visual, x, y, z, size);
    return visual;
  }

  function writeParticleVisualMatrix(visual, x, y, z, scale) {
    if (!visual || !visual.batch || visual.index < 0) return;
    particleInstancePositionScratch.set(x, y, z);
    particleInstanceScaleScratch.set(scale, scale, scale);
    particleInstanceMatrixScratch.compose(particleInstancePositionScratch, particleInstanceQuaternion, particleInstanceScaleScratch);
    visual.batch.mesh.setMatrixAt(visual.index, particleInstanceMatrixScratch);
    visual.batch.mesh.instanceMatrix.needsUpdate = true;
  }

  function detachParticleInstancedBatch(batch) {
    if (!batch) return;
    batch.count = 0;
    batch.visuals.length = 0;
    batch.mesh.count = 0;
    if (batch.mesh.parent) batch.mesh.parent.remove(batch.mesh);
  }

  function releaseParticleVisual(visual) {
    if (!visual) return;
    if (!visual.inUse) return;
    var batch = visual.batch;
    if (batch) {
      var index = visual.index;
      var lastIndex = batch.count - 1;
      if (index >= 0 && lastIndex >= 0) {
        if (index !== lastIndex) {
          var moved = batch.visuals[lastIndex];
          batch.mesh.getMatrixAt(lastIndex, particleInstanceMatrixScratch);
          batch.mesh.setMatrixAt(index, particleInstanceMatrixScratch);
          if (moved) {
            moved.index = index;
            batch.visuals[index] = moved;
          }
        }
        batch.visuals[lastIndex] = null;
        batch.count = lastIndex;
        batch.mesh.count = batch.count;
        batch.mesh.instanceMatrix.needsUpdate = true;
        if (batch.count <= 0 && batch.mesh.parent) batch.mesh.parent.remove(batch.mesh);
      }
    }
    visual.inUse = false;
    visual.batch = null;
    visual.index = -1;
    visual.particle = null;
    particleVisualInUse[visual.poolKey] = Math.max(0, (particleVisualInUse[visual.poolKey] || 0) - 1);
    particleVisualPools[visual.poolKey].push(visual);
  }

  function releaseAllParticlesToPool() {
    for (var i = state.particles.length - 1; i >= 0; i--) {
      var particle = state.particles[i];
      if (particle && particle.visual) {
        releaseParticleVisual(particle.visual);
      } else if (particle && particle.mesh) {
        removeObject3D(particle.mesh);
      }
    }
    state.particles = [];
  }

  function createXpOrbVisual() {
    var group = new THREE.Group();
    group.visible = false;
    group.userData.xpOrbVisual = null;
    var core = new THREE.Mesh(getSharedGeometry("xp-orb-core", function () {
      return new THREE.OctahedronGeometry(1, 0);
    }), mats.xp);
    core.userData.disposeGeometry = false;
    core.castShadow = false;
    core.receiveShadow = false;
    rememberBase(core);
    group.add(core);
    var glint = new THREE.Mesh(getSharedGeometry("xp-orb-glint", function () {
      return new THREE.OctahedronGeometry(1, 0);
    }), mats.xpLight);
    glint.userData.disposeGeometry = false;
    glint.position.set(0.08, 0.11, 0.07);
    glint.castShadow = false;
    glint.receiveShadow = false;
    rememberBase(glint);
    group.add(glint);
    var visual = {
      group: group,
      core: core,
      glint: glint,
      inUse: false,
    };
    group.userData.xpOrbVisual = visual;
    xpOrbVisualCreated += 1;
    return visual;
  }

  function acquireXpOrbVisual(x, z, coreScale, glintScale) {
    var visual = xpOrbVisualPool.length ? xpOrbVisualPool.pop() : createXpOrbVisual();
    visual.inUse = true;
    xpOrbVisualInUse += 1;
    var group = visual.group;
    group.visible = true;
    group.position.set(x + rand(-0.2, 0.2), 0.5, z + rand(-0.2, 0.2));
    group.rotation.set(0, 0, 0);
    group.scale.setScalar(1);
    visual.core.scale.setScalar(coreScale);
    visual.core.userData.baseScale = visual.core.scale.clone();
    visual.glint.scale.setScalar(glintScale);
    visual.glint.userData.baseScale = visual.glint.scale.clone();
    if (group.parent !== effectRoot) effectRoot.add(group);
    return visual;
  }

  function warmupXpOrbVisual(x, z, coreScale, glintScale) {
    var visual = acquireXpOrbVisual(x, z, coreScale, glintScale);
    releaseXpOrbVisual(visual);
  }

  function releaseXpOrbVisual(visual) {
    if (!visual) return;
    var group = visual.group;
    if (group && group.parent) group.parent.remove(group);
    if (group) {
      group.visible = false;
      group.position.set(0, -1000, 0);
      group.rotation.set(0, 0, 0);
      group.scale.setScalar(1);
    }
    if (!visual.inUse) return;
    visual.inUse = false;
    xpOrbVisualInUse = Math.max(0, xpOrbVisualInUse - 1);
    xpOrbVisualPool.push(visual);
  }

  function releaseAllXpOrbsToPool() {
    for (var i = state.xpOrbs.length - 1; i >= 0; i--) {
      var orb = state.xpOrbs[i];
      if (orb && orb.visual) {
        releaseXpOrbVisual(orb.visual);
      } else if (orb && orb.mesh) {
        removeObject3D(orb.mesh);
      }
    }
    state.xpOrbs = [];
  }

  function createDeathDebrisVisual() {
    var mat = mats.zombieBlood.clone();
    mat.transparent = true;
    mat.opacity = 1;
    var mesh = new THREE.Mesh(getSharedBoxGeometry(1, 1, 1), mat);
    mesh.userData.disposeGeometry = false;
    mesh.userData.disposeMaterial = false;
    mesh.userData.deathDebrisVisual = null;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.visible = false;
    var visual = {
      mesh: mesh,
      inUse: false,
    };
    mesh.userData.deathDebrisVisual = visual;
    deathDebrisVisualCreated += 1;
    return visual;
  }

  function acquireDeathDebrisVisual(source, worldPos, worldQuat) {
    var visual = deathDebrisVisualPool.length ? deathDebrisVisualPool.pop() : createDeathDebrisVisual();
    visual.inUse = true;
    deathDebrisVisualInUse += 1;
    var mesh = visual.mesh;
    var sourceMat = Array.isArray(source.material) ? source.material[0] : source.material;
    mesh.visible = true;
    mesh.geometry = source.geometry || getSharedBoxGeometry(1, 1, 1);
    mesh.userData.disposeGeometry = false;
    if (sourceMat && typeof mesh.material.copy === "function") mesh.material.copy(sourceMat);
    mesh.material.transparent = true;
    mesh.material.opacity = 1;
    mesh.position.copy(worldPos);
    mesh.quaternion.copy(worldQuat);
    mesh.scale.copy(source.scale);
    if (mesh.parent !== effectRoot) effectRoot.add(mesh);
    return visual;
  }

  function warmupDeathDebrisVisual(source, worldPos, worldQuat) {
    var visual = acquireDeathDebrisVisual(source, worldPos, worldQuat);
    releaseDeathDebrisVisual(visual);
  }

  function releaseDeathDebrisVisual(visual) {
    if (!visual) return;
    var mesh = visual.mesh;
    if (mesh && mesh.parent) mesh.parent.remove(mesh);
    if (mesh) {
      mesh.visible = false;
      mesh.geometry = getSharedBoxGeometry(1, 1, 1);
      mesh.material.opacity = 1;
      mesh.position.set(0, -1000, 0);
      mesh.rotation.set(0, 0, 0);
      mesh.scale.setScalar(1);
    }
    if (!visual.inUse) return;
    visual.inUse = false;
    deathDebrisVisualInUse = Math.max(0, deathDebrisVisualInUse - 1);
    deathDebrisVisualPool.push(visual);
  }

  function releaseAllDeathDebrisToPool() {
    for (var i = state.debris.length - 1; i >= 0; i--) {
      var piece = state.debris[i];
      if (piece && piece.visual) {
        releaseDeathDebrisVisual(piece.visual);
      } else if (piece && piece.mesh) {
        removeObject3D(piece.mesh);
      }
    }
    state.debris = [];
  }

  function getProjectileStandardMaterialKey(material) {
    var mat = material || mats.bullet;
    if (!mat.userData) mat.userData = {};
    if (!mat.userData.projectileStandardInstanceKey) {
      mat.userData.projectileStandardInstanceKey = "projectileStandardMat" + projectileStandardMaterialIdCounter++;
    }
    return mat.userData.projectileStandardInstanceKey;
  }

  function getProjectileStandardInstancedBatch(material) {
    var mat = material || mats.bullet;
    var key = getProjectileStandardMaterialKey(mat);
    var batches = projectileStandardInstancedBatches[key];
    if (!batches) {
      batches = [];
      projectileStandardInstancedBatches[key] = batches;
    }
    for (var i = 0; i < batches.length; i++) {
      if (batches[i].count < PROJECTILE_STANDARD_INSTANCE_CAPACITY) {
        if (batches[i].mesh.parent !== effectRoot) effectRoot.add(batches[i].mesh);
        return batches[i];
      }
    }
    var mesh = new THREE.InstancedMesh(getSharedBoxGeometry(1, 1, 1), mat, PROJECTILE_STANDARD_INSTANCE_CAPACITY);
    mesh.count = 0;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.userData.disposeGeometry = false;
    var batch = {
      key: key,
      material: mat,
      mesh: mesh,
      count: 0,
      visuals: [],
    };
    mesh.userData.projectileStandardBatch = batch;
    batches.push(batch);
    projectileStandardInstancedBatchList.push(batch);
    effectRoot.add(mesh);
    return batch;
  }

  function writeStandardProjectileVisualMatrix(visual) {
    if (!visual || !visual.batch || visual.index < 0 || !visual.object) return;
    projectileInstancePositionScratch.copy(visual.object.position);
    projectileInstanceScaleScratch.copy(visual.object.scale);
    projectileInstanceQuaternionScratch.setFromEuler(visual.object.rotation);
    projectileInstanceMatrixScratch.compose(projectileInstancePositionScratch, projectileInstanceQuaternionScratch, projectileInstanceScaleScratch);
    visual.batch.mesh.setMatrixAt(visual.index, projectileInstanceMatrixScratch);
    visual.batch.mesh.instanceMatrix.needsUpdate = true;
  }

  function syncStandardProjectileVisual(visual) {
    if (visual && visual.kind === "standard") writeStandardProjectileVisualMatrix(visual);
  }

  function detachStandardProjectileBatch(batch) {
    if (!batch) return;
    batch.count = 0;
    batch.visuals.length = 0;
    batch.mesh.count = 0;
    if (batch.mesh.parent) batch.mesh.parent.remove(batch.mesh);
  }

  function releaseStandardProjectileVisual(visual) {
    if (!visual || !visual.batch) return;
    var batch = visual.batch;
    var index = visual.index;
    var lastIndex = batch.count - 1;
    if (index >= 0 && lastIndex >= 0) {
      if (index !== lastIndex) {
        var moved = batch.visuals[lastIndex];
        batch.mesh.getMatrixAt(lastIndex, projectileInstanceMatrixScratch);
        batch.mesh.setMatrixAt(index, projectileInstanceMatrixScratch);
        if (moved) {
          moved.index = index;
          batch.visuals[index] = moved;
        }
      }
      batch.visuals[lastIndex] = null;
      batch.count = lastIndex;
      batch.mesh.count = batch.count;
      batch.mesh.instanceMatrix.needsUpdate = true;
      if (batch.count <= 0 && batch.mesh.parent) batch.mesh.parent.remove(batch.mesh);
    }
    visual.batch = null;
    visual.index = -1;
    visual.material = null;
  }

  function createProjectileVisual(kind) {
    var key = getProjectileVisualPoolKey(kind);
    var visual = null;
    if (key === "launcher") {
      visual = createLauncherProjectileVisual();
    } else if (key === "electric") {
      visual = createElectricProjectileVisual();
    } else if (key === "fireShard") {
      visual = createFireShardProjectileVisual();
    } else {
      visual = createStandardProjectileVisual();
    }
    projectileVisualCreated[key] += 1;
    return visual;
  }

  function createStandardProjectileVisual() {
    var object = new THREE.Object3D();
    object.visible = false;
    var visual = {
      kind: "standard",
      object: object,
      batch: null,
      index: -1,
      material: null,
      inUse: false,
    };
    object.userData.projectileVisual = visual;
    return visual;
  }

  function createLauncherProjectileVisual() {
    var group = new THREE.Group();
    group.visible = false;
    group.userData.projectileVisual = null;
    addSharedBox(group, 0.44, 0.34, 0.52, mats.grenade, 0, 0, 0);
    addSharedBox(group, 0.5, 0.12, 0.12, mats.metal, 0, 0.02, -0.28);
    addSharedBox(group, 0.16, 0.16, 0.16, mats.explosion, 0, 0.02, 0.32);
    var visual = {
      kind: "launcher",
      object: group,
      inUse: false,
    };
    group.userData.projectileVisual = visual;
    return visual;
  }

  function createFireShardProjectileVisual() {
    var group = new THREE.Group();
    group.visible = false;
    group.userData.noDebris = true;
    group.userData.projectileVisual = null;
    addSharedBox(group, 0.26, 0.18, 0.8, mats.fireCore, 0, 0, 0);
    addSharedBox(group, 0.18, 0.14, 0.44, mats.fireHot, 0, 0.04, 0.25);
    addSharedBox(group, 0.34, 0.08, 0.34, mats.fireOrange, 0, -0.08, -0.24);
    var visual = {
      kind: "fireShard",
      object: group,
      inUse: false,
    };
    group.userData.projectileVisual = visual;
    return visual;
  }

  function createElectricProjectileVisual() {
    var group = new THREE.Group();
    group.visible = false;
    group.userData.electricProjectile = true;
    group.userData.electricParts = { bolts: [], rings: [] };
    group.userData.projectileVisual = null;

    var core = addSharedBox(group, 1, 1, 1, mats.rifleTracer, 0, 0, 0);
    core.castShadow = true;
    core.receiveShadow = true;
    group.userData.electricParts.core = core;

    var glowMat = mats.rifleElectricGlow.clone();
    glowMat.opacity = 0.34;
    var glow = new THREE.Mesh(
      getSharedGeometry("rifle-electric-projectile-glow", function () {
        return new THREE.SphereGeometry(1, 12, 8);
      }),
      glowMat
    );
    glow.userData.disposeGeometry = false;
    glow.userData.disposeMaterial = true;
    glow.userData.startOpacity = glowMat.opacity;
    glow.castShadow = false;
    glow.receiveShadow = false;
    group.add(glow);
    group.userData.electricParts.glow = glow;

    for (var r = 0; r < 2; r++) {
      var ringMat = mats.lightning.clone();
      ringMat.opacity = r === 0 ? 0.56 : 0.38;
      var ring = new THREE.Mesh(
        getSharedGeometry("rifle-electric-projectile-ring", function () {
          return new THREE.RingGeometry(0.26, 0.36, 42);
        }),
        ringMat
      );
      ring.userData.disposeGeometry = false;
      ring.userData.disposeMaterial = true;
      ring.userData.startOpacity = ringMat.opacity;
      ring.userData.phase = r * Math.PI * 0.5;
      ring.castShadow = false;
      ring.receiveShadow = false;
      group.add(ring);
      group.userData.electricParts.rings.push(ring);
    }

    for (var i = 0; i < 6; i++) {
      var boltMat = mats.lightning.clone();
      boltMat.opacity = 0.86;
      var bolt = addSharedBox(group, 1, 1, 1, boltMat, 0, 0, 0);
      bolt.castShadow = false;
      bolt.receiveShadow = false;
      bolt.userData.disposeGeometry = false;
      bolt.userData.disposeMaterial = true;
      bolt.userData.phase = (Math.PI * 2 * i) / 6;
      bolt.userData.startOpacity = boltMat.opacity;
      group.userData.electricParts.bolts.push(bolt);
    }

    var visual = {
      kind: "electric",
      object: group,
      inUse: false,
    };
    group.userData.projectileVisual = visual;
    return visual;
  }

  function acquireProjectileVisual(kind, start, angle, size, material) {
    var key = getProjectileVisualPoolKey(kind);
    var pool = projectileVisualPools[key];
    var visual = pool.length ? pool.pop() : createProjectileVisual(key);
    visual.inUse = true;
    projectileVisualInUse[key] += 1;
    if (key === "standard") {
      configureStandardProjectileVisual(visual, start, angle, size, material);
    } else if (key === "electric") {
      configureElectricProjectileVisual(visual, start, angle, size);
    } else {
      configureGroupProjectileVisual(visual, start, angle);
    }
    if (key !== "standard" && visual.object.parent !== effectRoot) effectRoot.add(visual.object);
    return visual;
  }

  function configureStandardProjectileVisual(visual, start, angle, size, material) {
    var object = visual.object;
    var projectileSize = size || getWeaponProjectileVisualSize(WEAPONS.revolver);
    var mat = material || mats.bullet;
    var batch = getProjectileStandardInstancedBatch(mat);
    visual.batch = batch;
    visual.index = batch.count;
    visual.material = mat;
    batch.visuals[visual.index] = visual;
    batch.count += 1;
    batch.mesh.count = batch.count;
    object.visible = true;
    object.position.set(start.x, start.y, start.z);
    object.rotation.set(0, angle || 0, 0);
    object.scale.set(projectileSize.width, projectileSize.width, projectileSize.length);
    writeStandardProjectileVisualMatrix(visual);
  }

  function configureGroupProjectileVisual(visual, start, angle) {
    var group = visual.object;
    group.visible = true;
    group.position.set(start.x, start.y, start.z);
    group.rotation.set(0, angle || 0, 0);
    group.scale.setScalar(1);
  }

  function configureElectricProjectileVisual(visual, start, angle, size) {
    configureGroupProjectileVisual(visual, start, angle);
    var projectileSize = size || getWeaponProjectileVisualSize(WEAPONS.rifle);
    var parts = visual.object.userData.electricParts || {};
    if (parts.core) parts.core.scale.set(projectileSize.width * 1.35, projectileSize.width * 1.35, projectileSize.length * 1.12);
    if (parts.glow) {
      parts.glow.material.opacity = parts.glow.userData.startOpacity || 0.34;
      parts.glow.scale.set(projectileSize.width * 4.25, projectileSize.width * 3.1, projectileSize.length * 0.98);
    }
    var rings = parts.rings || [];
    for (var r = 0; r < rings.length; r++) {
      var ring = rings[r];
      ring.material.opacity = ring.userData.startOpacity || (r === 0 ? 0.56 : 0.38);
      ring.rotation.set(Math.PI / 2, 0, r * Math.PI * 0.5);
      ring.scale.setScalar(r === 0 ? 1.12 : 0.86);
    }
    var bolts = parts.bolts || [];
    for (var i = 0; i < bolts.length; i++) {
      var bolt = bolts[i];
      bolt.material.opacity = bolt.userData.startOpacity || 0.86;
      bolt.userData.radiusX = projectileSize.width * rand(1.45, 2.05);
      bolt.userData.radiusY = projectileSize.width * rand(1.1, 1.65);
      bolt.userData.baseZ = rand(-projectileSize.length * 0.42, projectileSize.length * 0.42);
      bolt.userData.baseScaleZ = projectileSize.length * rand(0.42, 0.72);
      bolt.position.set(0, 0, bolt.userData.baseZ || 0);
      bolt.rotation.set(rand(-0.6, 0.6), rand(-0.7, 0.7), bolt.userData.phase || 0);
      bolt.scale.set(projectileSize.width * 0.2, projectileSize.width * 0.2, bolt.userData.baseScaleZ);
    }
  }

  function releaseProjectileVisual(visual) {
    if (!visual) return;
    if (visual.kind === "standard") releaseStandardProjectileVisual(visual);
    var object = visual.object;
    if (object && object.parent) object.parent.remove(object);
    if (object) {
      object.visible = false;
      object.position.set(0, -1000, 0);
      object.rotation.set(0, 0, 0);
      object.scale.setScalar(1);
    }
    if (!visual.inUse) return;
    visual.inUse = false;
    projectileVisualInUse[visual.kind] = Math.max(0, (projectileVisualInUse[visual.kind] || 0) - 1);
    projectileVisualPools[visual.kind].push(visual);
  }

  function getProjectileVisualForObject(object) {
    return object && object.userData ? object.userData.projectileVisual || null : null;
  }

  function releaseAllProjectilesToPool() {
    for (var i = state.bullets.length - 1; i >= 0; i--) {
      var bullet = state.bullets[i];
      if (bullet && bullet.launcherWhistle) stopLauncherGrenadeWhistle(bullet.launcherWhistle, 0.035);
      if (bullet && bullet.visual) {
        releaseProjectileVisual(bullet.visual);
      } else if (bullet && bullet.mesh) {
        var visual = getProjectileVisualForObject(bullet.mesh);
        if (visual) releaseProjectileVisual(visual);
        else removeObject3D(bullet.mesh);
      }
    }
    state.bullets = [];
  }

  function createShockwaveVisual() {
    var mat = mats.shockwave.clone();
    var mesh = new THREE.Mesh(getSharedGeometry("shockwave-ring", function () {
      return new THREE.RingGeometry(0.76, 1, 36);
    }), mat);
    mesh.userData.disposeGeometry = false;
    mesh.userData.disposeMaterial = true;
    mesh.userData.baseOpacity = mat.opacity;
    mesh.rotation.x = -Math.PI / 2;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.renderOrder = 2;
    mesh.visible = false;
    var visual = { mesh: mesh };
    mesh.userData.shockwaveVisual = visual;
    shockwaveVisualCreated += 1;
    return visual;
  }

  function acquireShockwaveVisual(x, z, color) {
    var visual = shockwaveVisualPool.length ? shockwaveVisualPool.pop() : createShockwaveVisual();
    shockwaveVisualInUse += 1;
    var mesh = visual.mesh;
    mesh.visible = true;
    mesh.position.set(x, 0.11, z);
    mesh.scale.setScalar(1);
    mesh.rotation.x = -Math.PI / 2;
    mesh.rotation.z = 0;
    if (mesh.material && mesh.material.color) mesh.material.color.setHex(color || 0xffe0a0);
    if (mesh.material && mesh.userData.baseOpacity != null) mesh.material.opacity = mesh.userData.baseOpacity;
    if (mesh.parent !== effectRoot) effectRoot.add(mesh);
    return visual;
  }

  function warmupShockwaveVisual(x, z, color) {
    var visual = acquireShockwaveVisual(x, z, color);
    releaseShockwaveVisual(visual);
  }

  function releaseShockwaveVisual(visual) {
    if (!visual) return;
    var mesh = visual.mesh;
    if (mesh.parent) mesh.parent.remove(mesh);
    mesh.visible = false;
    shockwaveVisualInUse = Math.max(0, shockwaveVisualInUse - 1);
    shockwaveVisualPool.push(visual);
  }

  function createSmokePuffVisual() {
    var mat = mats.smoke.clone();
    var mesh = new THREE.Mesh(getSharedBoxGeometry(1, 1, 1), mat);
    mesh.userData.disposeGeometry = false;
    mesh.userData.disposeMaterial = true;
    mesh.userData.smokePuffVisual = null;
    mesh.userData.baseOpacity = mat.opacity;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.renderOrder = 1;
    mesh.visible = false;
    var visual = { mesh: mesh };
    mesh.userData.smokePuffVisual = visual;
    smokePuffVisualCreated += 1;
    return visual;
  }

  function acquireSmokePuffVisual(x, y, z, scale) {
    var visual = smokePuffVisualPool.length ? smokePuffVisualPool.pop() : createSmokePuffVisual();
    smokePuffVisualInUse += 1;
    var mesh = visual.mesh;
    mesh.visible = true;
    mesh.position.set(x, y, z);
    mesh.rotation.set(0, 0, 0);
    mesh.scale.setScalar(scale);
    if (mesh.material) {
      mesh.material.opacity = rand(0.16, 0.32);
      mesh.userData.baseOpacity = mesh.material.opacity;
    }
    if (mesh.parent !== effectRoot) effectRoot.add(mesh);
    return visual;
  }

  function warmupSmokePuffVisual(x, y, z, scale) {
    var visual = acquireSmokePuffVisual(x, y, z, scale);
    releaseSmokePuffVisual(visual);
  }

  function releaseSmokePuffVisual(visual) {
    if (!visual) return;
    var mesh = visual.mesh;
    if (mesh.parent) mesh.parent.remove(mesh);
    mesh.visible = false;
    smokePuffVisualInUse = Math.max(0, smokePuffVisualInUse - 1);
    smokePuffVisualPool.push(visual);
  }

  function createScorchDecalVisual() {
    var mat = mats.scorch.clone();
    var mesh = new THREE.Mesh(getSharedGeometry("scorch-circle", function () {
      return new THREE.CircleGeometry(1, 14);
    }), mat);
    mesh.userData.disposeGeometry = false;
    mesh.userData.disposeMaterial = true;
    mesh.userData.scorchDecalVisual = null;
    mesh.rotation.x = -Math.PI / 2;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.renderOrder = -3;
    mesh.visible = false;
    var visual = { mesh: mesh };
    mesh.userData.scorchDecalVisual = visual;
    scorchDecalVisualCreated += 1;
    return visual;
  }

  function acquireScorchDecalVisual(x, z, radius) {
    var visual = scorchDecalVisualPool.length ? scorchDecalVisualPool.pop() : createScorchDecalVisual();
    scorchDecalVisualInUse += 1;
    var mesh = visual.mesh;
    mesh.visible = true;
    mesh.rotation.x = -Math.PI / 2;
    mesh.rotation.z = rand(0, Math.PI * 2);
    mesh.position.set(x, 0.065, z);
    mesh.scale.set(radius * rand(0.75, 1.2), radius * rand(0.55, 0.95), 1);
    if (mesh.material) mesh.material.opacity = rand(0.16, 0.28);
    if (mesh.parent !== effectRoot) effectRoot.add(mesh);
    return visual;
  }

  function warmupScorchDecalVisual(x, z, radius) {
    var visual = acquireScorchDecalVisual(x, z, radius);
    releaseScorchDecalVisual(visual);
  }

  function releaseScorchDecalVisual(visual) {
    if (!visual) return;
    var mesh = visual.mesh;
    if (mesh.parent) mesh.parent.remove(mesh);
    mesh.visible = false;
    mesh.position.set(0, -1000, 0);
    mesh.rotation.set(-Math.PI / 2, 0, 0);
    mesh.scale.setScalar(1);
    if (mesh.material) mesh.material.opacity = 1;
    scorchDecalVisualInUse = Math.max(0, scorchDecalVisualInUse - 1);
    scorchDecalVisualPool.push(visual);
  }

  function createLightFlashVisual() {
    var light = new THREE.PointLight(0xffffff, 1, 1, 2);
    light.visible = false;
    var visual = { light: light };
    light.userData.lightFlashVisual = visual;
    lightFlashCreated += 1;
    return visual;
  }

  function acquireLightFlashVisual(x, y, z, color, intensity, distance) {
    var visual = lightFlashPool.length ? lightFlashPool.pop() : createLightFlashVisual();
    lightFlashInUse += 1;
    var light = visual.light;
    light.visible = true;
    light.color.setHex(color || 0xffffff);
    light.intensity = intensity;
    light.distance = distance;
    light.position.set(x, y, z);
    if (light.parent !== effectRoot) effectRoot.add(light);
    return visual;
  }

  function warmupLightFlashVisual(x, y, z, color, intensity, distance) {
    var visual = acquireLightFlashVisual(x, y, z, color, intensity, distance);
    releaseLightFlashVisual(visual);
  }

  function releaseLightFlashVisual(visual) {
    if (!visual) return;
    var light = visual.light;
    if (light.parent) light.parent.remove(light);
    light.visible = false;
    lightFlashInUse = Math.max(0, lightFlashInUse - 1);
    lightFlashPool.push(visual);
  }

  function createFirePatchVisual(trail) {
    var group = new THREE.Group();
    group.position.set(0, 0, 0);
    group.visible = false;
    effectRoot.add(group);

    var glow = addPuddleCircle(group, mats.fireGlow.clone(), 1, 1, 0.096, 3, 0);
    var surface = addPuddleCircle(group, mats.fireGround.clone(), 1, 1, 0.106, 4, 0);
    var core = addPuddleCircle(group, mats.fireCore.clone(), 1, 1, 0.122, 6, 0);
    var hotCore = addPuddleCircle(group, mats.fireHot.clone(), 1, 1, 0.138, 7, 0);
    var smoke = addPuddleCircle(group, mats.fireSmoke.clone(), 1, 1, 0.082, -1, 0);
    var ring = addFireRing(group, 1, 0.13, mats.fireOrange, 0.52);
    var innerRing = addFireRing(group, 1, 0.142, mats.fireHot, 0.58);

    var flames = [];
    var flameCount = trail ? 7 : 14;
    for (var i = 0; i < flameCount; i++) flames.push(addFireFlame(group, 0, 0, 0.6, i, trail));
    var cinders = [];
    var cinderCount = trail ? 5 : 10;
    for (var c = 0; c < cinderCount; c++) {
      var cinder = addFireCinder(group, 0, 0, 0.24, c);
      cinder.userData.trail = !!trail;
      cinders.push(cinder);
    }

    var key = getFirePatchVisualPoolKey(trail);
    var visual = {
      group: group,
      glow: glow,
      surface: surface,
      core: core,
      hotCore: hotCore,
      smoke: smoke,
      ring: ring,
      innerRing: innerRing,
      flames: flames,
      cinders: cinders,
      trail: !!trail,
      poolKey: key,
    };
    group.userData.firePatchVisual = visual;
    firePatchVisualCreated[key] += 1;
    if (group.parent) group.parent.remove(group);
    return visual;
  }

  function resetFirePatchCircle(mesh, sx, sz, angle) {
    if (!mesh) return;
    mesh.rotation.x = -Math.PI / 2;
    mesh.rotation.z = angle || 0;
    mesh.scale.set(sx, sz, 1);
    if (mesh.userData && mesh.userData.baseOpacity != null && mesh.material && mesh.material.opacity != null) {
      mesh.material.opacity = mesh.userData.baseOpacity;
    }
    rememberBase(mesh);
  }

  function configureFireFlameStack(stack, radius, trail, index) {
    var angle = rand(0, Math.PI * 2);
    var distance = rand(0.08, radius * (trail ? 0.5 : 0.78));
    var size = rand(0.34, trail ? 0.72 : 1.05);
    stack.userData.flamePhase = rand(0, Math.PI * 2);
    stack.userData.baseY = 0;
    stack.position.set(Math.cos(angle) * distance, 0, Math.sin(angle) * distance);
    stack.rotation.set(0, rand(0, Math.PI * 2), 0);
    rememberBase(stack);
    for (var i = 0; i < stack.children.length; i++) {
      var block = stack.children[i];
      var tierScale = 1 - i * 0.23;
      block.position.set(rand(-0.06, 0.06) * size, 0.18 + i * size * 0.42, rand(-0.06, 0.06) * size);
      block.rotation.set(rand(-0.18, 0.18), rand(0, Math.PI * 2), rand(-0.18, 0.18));
      block.scale.set(size * (0.46 + tierScale * 0.2), size * (0.46 + tierScale * 0.48), size * (0.34 + tierScale * 0.16));
      if (block.material && block.material.opacity != null && block.userData.baseOpacity != null) block.material.opacity = block.userData.baseOpacity;
      rememberBase(block);
    }
  }

  function configureFireCinder(mesh, radius) {
    if (!mesh) return;
    var angle = rand(0, Math.PI * 2);
    var distance = rand(radius * 0.18, radius * (mesh.userData.trail ? 0.62 : 0.9));
    var size = rand(0.18, mesh.userData.trail ? 0.32 : 0.48);
    mesh.userData.cinderPhase = rand(0, Math.PI * 2);
    mesh.position.set(Math.cos(angle) * distance, 0.105, Math.sin(angle) * distance);
    mesh.rotation.set(0, rand(0, Math.PI * 2), 0);
    mesh.scale.set(size * rand(0.9, 1.45), 0.035, size * rand(0.55, 1.1));
    if (mesh.material && mesh.material.opacity != null && mesh.userData.baseOpacity != null) mesh.material.opacity = mesh.userData.baseOpacity;
    rememberBase(mesh);
  }

  function configureFirePatchVisual(visual, radius) {
    resetFirePatchCircle(visual.glow, radius * rand(1.16, 1.34), radius * rand(0.86, 1.1), rand(0, Math.PI * 2));
    resetFirePatchCircle(visual.surface, radius * rand(0.92, 1.15), radius * rand(0.72, 1.02), rand(0, Math.PI * 2));
    resetFirePatchCircle(visual.core, radius * rand(0.4, 0.6), radius * rand(0.22, 0.4), rand(0, Math.PI * 2));
    resetFirePatchCircle(visual.hotCore, radius * rand(0.2, 0.32), radius * rand(0.12, 0.22), rand(0, Math.PI * 2));
    resetFirePatchCircle(visual.smoke, radius * rand(0.84, 1.1), radius * rand(0.62, 0.92), rand(0, Math.PI * 2));
    resetFirePatchCircle(visual.ring, radius * 0.78, radius * 0.78 * 0.82, 0);
    resetFirePatchCircle(visual.innerRing, radius * 0.43, radius * 0.43 * 0.78, 0);
    for (var i = 0; i < visual.flames.length; i++) configureFireFlameStack(visual.flames[i], radius, visual.trail, i);
    for (var c = 0; c < visual.cinders.length; c++) configureFireCinder(visual.cinders[c], radius);
    visual.group.visible = true;
  }

  function acquireFirePatchVisual(x, z, radius, trail) {
    var key = getFirePatchVisualPoolKey(trail);
    var pool = firePatchVisualPools[key];
    var visual = pool.length ? pool.pop() : createFirePatchVisual(!!trail);
    firePatchVisualInUse[key] += 1;
    configureFirePatchVisual(visual, radius);
    visual.group.position.set(x, 0, z);
    if (visual.group.parent !== effectRoot) effectRoot.add(visual.group);
    return visual;
  }

  function releaseFirePatchVisual(visual) {
    if (!visual) return;
    if (visual.group.parent) visual.group.parent.remove(visual.group);
    visual.group.visible = false;
    firePatchVisualInUse[visual.poolKey] = Math.max(0, (firePatchVisualInUse[visual.poolKey] || 0) - 1);
    firePatchVisualPools[visual.poolKey].push(visual);
  }

  function releaseAllFirePatches() {
    for (var i = state.firePatches.length - 1; i >= 0; i--) {
      releaseFirePatchVisual(state.firePatches[i].visual);
    }
    state.firePatches = [];
  }

  function spawnFirePatch(x, z, options) {
    options = options || {};
    if (pointHitsObstacle(x, z, 0.38)) {
      var safe = findNearestClearGroundPoint(x, z, 0.48);
      x = safe.x;
      z = safe.z;
    }
    var radius = options.radius || getLauncherFireRadius();
    var life = options.life || getLauncherFireLife();
    var visual = acquireFirePatchVisual(x, z, radius, !!options.trail);
    state.firePatches.push({
      x: x,
      z: z,
      radius: radius,
      life: life,
      startLife: life,
      damage: options.damage || getLauncherFireDamage(),
      damageTimer: options.damageDelay || 0.05,
      emberTimer: 0,
      trail: !!options.trail,
      thermite: !!options.thermite,
      backdraft: !!options.backdraft,
      splinter: !!options.splinter,
      visual: visual,
      mesh: visual.group,
      glow: visual.glow,
      surface: visual.surface,
      core: visual.core,
      hotCore: visual.hotCore,
      smoke: visual.smoke,
      ring: visual.ring,
      innerRing: visual.innerRing,
      flames: visual.flames,
      cinders: visual.cinders,
    });
    addLightFlash(x, 0.75, z, 0xff7b24, options.trail ? 2.0 : 3.6, options.trail ? 6 : 9, 0.22);
    if (!options.trail) addShockwave(x, z, radius * 0.72, 0.26, 0xff8a2a);
    for (var i = 0; i < (options.trail ? 14 : 30); i++) {
      var angle = rand(0, Math.PI * 2);
      var speed = rand(0.6, options.trail ? 2.9 : 4.8);
      spawnParticle(
        x + Math.cos(angle) * rand(0, radius * 0.28),
        rand(0.18, 0.75),
        z + Math.sin(angle) * rand(0, radius * 0.28),
        Math.cos(angle) * speed,
        rand(0.75, 3.2),
        Math.sin(angle) * speed,
        rand(0.18, 0.38),
        rand(0.045, 0.12),
        i % 7 === 0 ? mats.fireHot : i % 4 === 0 ? mats.fireCore : mats.fireOrange
      );
    }
    return state.firePatches[state.firePatches.length - 1];
  }

  function addFireRing(parent, radius, y, sourceMaterial, opacity) {
    var mat = (sourceMaterial || mats.fireOrange).clone();
    mat.opacity = opacity == null ? 0.5 : opacity;
    var mesh = new THREE.Mesh(getSharedGeometry("fire-patch-ring", function () {
      return new THREE.RingGeometry(0.58, 1, 42);
    }), mat);
    mesh.userData.disposeGeometry = false;
    mesh.userData.disposeMaterial = true;
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = y;
    mesh.scale.set(radius, radius * 0.82, 1);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.renderOrder = 6;
    mesh.userData.baseOpacity = mat.opacity;
    rememberBase(mesh);
    parent.add(mesh);
    return mesh;
  }

  function addFireFlame(parent, x, z, size, index, trail) {
    var stack = new THREE.Group();
    stack.userData.noDebris = true;
    stack.userData.flamePhase = rand(0, Math.PI * 2);
    stack.userData.baseY = 0;
    stack.position.set(x, 0, z);
    stack.rotation.y = rand(0, Math.PI * 2);

    var tiers = trail ? 2 : 3;
    for (var i = 0; i < tiers; i++) {
      var materialSource = i === tiers - 1 ? mats.fireBlockHot : i === 0 && index % 3 === 2 ? mats.fireBlockRed : i === 0 ? mats.fireBlockCore : mats.fireBlockHot;
      var mat = materialSource.clone();
      var mesh = new THREE.Mesh(getSharedGeometry("fire-flame-block", function () {
        return new THREE.BoxGeometry(1, 1, 1);
      }), mat);
      mesh.userData.disposeGeometry = false;
      mesh.userData.disposeMaterial = true;
      mesh.userData.noDebris = true;
      mesh.userData.baseOpacity = mat.opacity;
      var tierScale = 1 - i * 0.23;
      mesh.position.set(rand(-0.06, 0.06) * size, 0.18 + i * size * 0.42, rand(-0.06, 0.06) * size);
      mesh.rotation.set(rand(-0.18, 0.18), rand(0, Math.PI * 2), rand(-0.18, 0.18));
      mesh.scale.set(size * (0.46 + tierScale * 0.2), size * (0.46 + tierScale * 0.48), size * (0.34 + tierScale * 0.16));
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.renderOrder = 8 + i * 0.05;
      rememberBase(mesh);
      stack.add(mesh);
    }
    rememberBase(stack);
    parent.add(stack);
    return stack;
  }

  function addFireCinder(parent, x, z, size, index) {
    var mat = (index % 3 === 0 ? mats.fireBlockRed : index % 3 === 1 ? mats.fireBlockCore : mats.fireBlockHot).clone();
    mat.opacity *= 0.72;
    var mesh = new THREE.Mesh(getSharedGeometry("fire-cinder-block", function () {
      return new THREE.BoxGeometry(1, 1, 1);
    }), mat);
    mesh.userData.disposeGeometry = false;
    mesh.userData.disposeMaterial = true;
    mesh.userData.noDebris = true;
    mesh.userData.cinderPhase = rand(0, Math.PI * 2);
    mesh.userData.baseOpacity = mat.opacity;
    mesh.userData.trail = false;
    mesh.position.set(x, 0.105, z);
    mesh.rotation.set(0, rand(0, Math.PI * 2), 0);
    mesh.scale.set(size * rand(0.9, 1.45), 0.035, size * rand(0.55, 1.1));
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.renderOrder = 5;
    rememberBase(mesh);
    parent.add(mesh);
    return mesh;
  }

  function updateFirePatches(dt) {
    var playerInFire = false;
    var visibleGround = getCurrentVisibleGroundRect(fireVisibleGroundScratch);
    for (var i = state.firePatches.length - 1; i >= 0; i--) {
      var patch = state.firePatches[i];
      patch.life -= dt;
      patch.damageTimer = Math.max(0, patch.damageTimer - dt);
      patch.emberTimer -= dt;
      var visualVisible = !pointOutsideVisibleGround(patch.x, patch.z, patch.radius + FIRE_VISUAL_CULL_PAD, visibleGround);
      if (patch.mesh) patch.mesh.visible = visualVisible;
      if (visualVisible) {
        updateFirePatchVisual(patch, i, dt + (patch.visualSkippedDt || 0));
        patch.visualSkippedDt = 0;
      } else {
        patch.visualSkippedDt = (patch.visualSkippedDt || 0) + dt;
      }
      if (patch.damageTimer <= 0) {
        patch.damageTimer = FIRE_PATCH_DAMAGE_INTERVAL;
        damageEnemiesInFirePatch(patch);
      }
      if (state.player && Math.hypot(state.player.x - patch.x, state.player.z - patch.z) <= patch.radius + state.player.radius * 0.35) {
        playerInFire = true;
      }
      if (patch.emberTimer <= 0) {
        patch.emberTimer = patch.trail ? 0.16 : 0.09;
        spawnFirePatchEmber(patch, visualVisible);
      }
      if (patch.life <= 0) removeFirePatch(i);
    }
    updateLauncherFireBuff(dt, playerInFire);
  }

  function updateFirePatchVisual(patch, index, dt) {
    var fade = clamp(patch.life / patch.startLife, 0, 1);
    var pulse = 1 + Math.sin(state.time * 8.5 + index) * 0.075;
    if (patch.glow) {
      var glowPulse = 1 + Math.sin(state.time * 5.6 + index * 0.7) * 0.12;
      patch.glow.material.opacity = 0.28 * Math.min(1, fade * 1.35) * (0.76 + Math.sin(state.time * 11 + index) * 0.18);
      patch.glow.rotation.z -= dt * 0.045;
      scaleFromBase(patch.glow, glowPulse, 1 - (glowPulse - 1) * 0.32, 1);
    }
    if (patch.surface) {
      patch.surface.material.opacity = 0.5 * Math.min(1, fade * 1.45) * (0.84 + Math.sin(state.time * 10 + index) * 0.16);
      patch.surface.rotation.z += dt * (patch.trail ? 0.24 : 0.14);
      scaleFromBase(patch.surface, pulse, 1 - (pulse - 1) * 0.46, 1);
    }
    if (patch.core) {
      patch.core.material.opacity = 0.38 * Math.min(1, fade * 1.85) * (0.7 + Math.sin(state.time * 16 + index) * 0.3);
      patch.core.rotation.z -= dt * 0.42;
      scaleFromBase(patch.core, 1 + Math.sin(state.time * 12 + index) * 0.18, 1 + Math.cos(state.time * 9 + index) * 0.12, 1);
    }
    if (patch.hotCore) {
      var hotPulse = 1 + Math.sin(state.time * 20 + index * 0.6) * 0.22;
      patch.hotCore.material.opacity = 0.14 * Math.min(1, fade * 2.25) * (0.72 + Math.sin(state.time * 28 + index) * 0.24);
      patch.hotCore.rotation.z += dt * 0.7;
      scaleFromBase(patch.hotCore, hotPulse, 1 + Math.cos(state.time * 17 + index) * 0.14, 1);
    }
    if (patch.smoke) {
      patch.smoke.material.opacity = 0.23 * Math.min(1, fade * 1.25) * (0.82 + Math.sin(state.time * 4 + index) * 0.12);
      patch.smoke.rotation.z += dt * 0.07;
    }
    if (patch.ring) {
      var ringPulse = 1 + ((state.time * 0.95 + index * 0.23) % 1) * 0.36;
      patch.ring.material.opacity = 0.42 * fade * (2 - ringPulse);
      scaleFromBase(patch.ring, ringPulse, ringPulse * 0.82, 1);
    }
    if (patch.innerRing) {
      var innerPulse = 1 + ((state.time * 1.35 + index * 0.31) % 1) * 0.48;
      patch.innerRing.material.opacity = 0.46 * fade * (2 - innerPulse);
      patch.innerRing.rotation.z -= dt * 0.22;
      scaleFromBase(patch.innerRing, innerPulse, innerPulse * 0.78, 1);
    }
    var flames = patch.flames || [];
    for (var i = 0; i < flames.length; i++) {
      var flame = flames[i];
      var phase = flame.userData.flamePhase || 0;
      var flicker = 1 + Math.sin(state.time * 18 + phase) * 0.24 + Math.sin(state.time * 34 + phase) * 0.1;
      flame.rotation.y += dt * (0.55 + (i % 4) * 0.18);
      flame.position.y = Math.max(0, Math.sin(state.time * 12 + phase)) * 0.12;
      scaleFromBase(flame, flicker * 0.92, 0.9 + flicker * 0.18, flicker * 0.92);
      for (var blockIndex = 0; blockIndex < flame.children.length; blockIndex++) {
        var block = flame.children[blockIndex];
        var blockFlicker = clamp(flicker + Math.sin(state.time * (22 + blockIndex * 5) + phase) * 0.16, 0.52, 1.48);
        block.material.opacity = (block.userData.baseOpacity || 0.65) * Math.min(1, fade * 2.15) * blockFlicker;
        block.rotation.y += dt * (0.9 + blockIndex * 0.28);
        scaleFromBase(block, blockFlicker * 0.92, 0.82 + blockFlicker * 0.28, blockFlicker * 0.92);
      }
    }
    var cinders = patch.cinders || [];
    for (var c = 0; c < cinders.length; c++) {
      var cinder = cinders[c];
      var cinderPhase = cinder.userData.cinderPhase || 0;
      var cinderGlow = 0.7 + Math.max(0, Math.sin(state.time * 7.2 + cinderPhase)) * 0.4;
      cinder.material.opacity = (cinder.userData.baseOpacity || 0.34) * Math.min(1, fade * 1.5) * cinderGlow;
      cinder.rotation.y += dt * 0.04;
      scaleFromBase(cinder, cinderGlow, 1, 0.78 + cinderGlow * 0.22);
    }
  }

  function forEachEnemyNearCircle(x, z, radius, callback, trustCurrentGrid) {
    if (trustCurrentGrid) {
      if (!zombieSpatialGridKeys.length && state.enemies.length) rebuildZombieSpatialGrid();
    } else {
      ensureZombieSpatialGridCurrent();
    }
    if (!zombieSpatialGridKeys.length) {
      for (var i = 0; i < state.enemies.length; i++) callback(state.enemies[i]);
      return;
    }
    var cellRadius = radius + 1.5;
    var minCellX = Math.floor((x - cellRadius) / ZOMBIE_SPATIAL_CELL_SIZE);
    var maxCellX = Math.floor((x + cellRadius) / ZOMBIE_SPATIAL_CELL_SIZE);
    var minCellZ = Math.floor((z - cellRadius) / ZOMBIE_SPATIAL_CELL_SIZE);
    var maxCellZ = Math.floor((z + cellRadius) / ZOMBIE_SPATIAL_CELL_SIZE);
    for (var cellZ = minCellZ; cellZ <= maxCellZ; cellZ++) {
      for (var cellX = minCellX; cellX <= maxCellX; cellX++) {
        var bucket = zombieSpatialGrid.get(getZombieCellKey(cellX, cellZ));
        if (!bucket) continue;
        for (var i = 0; i < bucket.length; i++) callback(bucket[i]);
      }
    }
  }

  function damageEnemiesInFirePatch(patch) {
    forEachEnemyNearCircle(patch.x, patch.z, patch.radius, function (enemy) {
      if (!enemy || enemy.active === false) return;
      var dx = enemy.x - patch.x;
      var dz = enemy.z - patch.z;
      var hitRadius = patch.radius + enemy.radius * 0.3;
      if (dx * dx + dz * dz > hitRadius * hitRadius) return;
      var dist = Math.hypot(dx, dz);
      if (dist > hitRadius) return;
      if (hasUpgrade("scorchedEarth")) enemy.fireSlowTimer = Math.max(enemy.fireSlowTimer || 0, 0.55);
      var ratio = 1 - clamp(dist / patch.radius, 0, 1);
      var damage = patch.damage;
      if (hasUpgrade("thermiteCore") && ratio > 0.58) damage += 1;
      damageEnemy(enemy, Math.max(1, Math.ceil(damage * (0.72 + ratio * 0.55))), patch.x, patch.z, {
        type: "launcherFire",
        firePatch: patch,
      });
    });
  }

  function spawnFirePatchEmber(patch, emitVisual) {
    var angle = rand(0, Math.PI * 2);
    var distance = rand(0, patch.radius * 0.72);
    var y = rand(0.18, 0.75);
    var vx = Math.cos(angle) * rand(0.15, 0.8);
    var vy = rand(0.8, 2.8);
    var vz = Math.sin(angle) * rand(0.15, 0.8);
    var life = rand(0.18, 0.34);
    var size = rand(0.035, 0.09);
    var materialRoll = rng();
    var emberMaterial = materialRoll < 0.18 ? mats.fireHot : rng() < 0.5 ? mats.fireCore : mats.fireOrange;
    if (!emitVisual) return;
    spawnParticle(patch.x + Math.cos(angle) * distance, y, patch.z + Math.sin(angle) * distance, vx, vy, vz, life, size, emberMaterial);
  }

  function updateLauncherFireBuff(dt, playerInFire) {
    var active = hasPyrotechnicianFireBuff() && !!playerInFire;
    state.launcherFireBuffActive = active;
    if (!active || !state.player) {
      state.launcherFireAmmoAccumulator = 0;
      return;
    }
    state.player.hp = Math.min(state.player.maxHp, state.player.hp + FIREPROOF_HP_REGEN * dt);
    state.launcherFireAmmoAccumulator += FIREPROOF_AMMO_RESTORE_RATE * dt;
    while (state.launcherFireAmmoAccumulator >= 1) {
      state.launcherFireAmmoAccumulator -= 1;
      if (!restoreWeaponAmmo("launcher", 1)) break;
    }
    if ((state.ammo.launcher || 0) > 0) state.reloadTimers.launcher = 0;
  }

  function isLauncherFireBuffActive() {
    return hasPyrotechnicianFireBuff() && isPlayerInFriendlyFire();
  }

  function isPlayerInFriendlyFire() {
    if (!state.player) return false;
    for (var i = 0; i < state.firePatches.length; i++) {
      var patch = state.firePatches[i];
      var dx = state.player.x - patch.x;
      var dz = state.player.z - patch.z;
      var hitRadius = patch.radius + state.player.radius * 0.35;
      if (dx * dx + dz * dz > hitRadius * hitRadius) continue;
      if (Math.hypot(dx, dz) <= hitRadius) return true;
    }
    return false;
  }

  function getFirePatchVisualPartCount(patch) {
    var flameParts = 0;
    var flames = patch.flames || [];
    for (var i = 0; i < flames.length; i++) {
      flameParts += flames[i].children && flames[i].children.length ? flames[i].children.length : 1;
    }
    return (
      (patch.glow ? 1 : 0) +
      (patch.surface ? 1 : 0) +
      (patch.core ? 1 : 0) +
      (patch.hotCore ? 1 : 0) +
      (patch.smoke ? 1 : 0) +
      (patch.ring ? 1 : 0) +
      (patch.innerRing ? 1 : 0) +
      flameParts +
      (patch.cinders ? patch.cinders.length : 0)
    );
  }

  function removeFirePatch(index) {
    var patch = state.firePatches[index];
    if (!patch) return;
    releaseFirePatchVisual(patch.visual);
    state.firePatches.splice(index, 1);
  }

  function maybeTeleportDistantZombie(enemy, player, dist, visibleGround, teleportSideCounts) {
    if (dist < ZOMBIE_CATCHUP_DISTANCE) return false;
    if (state.time < (enemy.catchupReadyAt || 0)) return false;
    if (!pointOutsideVisibleGround(enemy.x, enemy.z, enemy.radius + ZOMBIE_CATCHUP_VISIBLE_PAD, visibleGround)) return false;

    var oldSide = enemy.spawnSide;
    var spawn = findZombieSpawnPoint(enemy.radius, {
      strict: true,
      preferredSides: chooseZombieSurroundSides("teleport", enemy, visibleGround, teleportSideCounts),
      visibleGround: visibleGround,
    });
    if (!spawn) {
      enemy.catchupReadyAt = state.time + ZOMBIE_CATCHUP_COOLDOWN;
      return false;
    }
    var newDist = Math.hypot(player.x - spawn.x, player.z - spawn.z);
    if (newDist > dist - 8) {
      enemy.catchupReadyAt = state.time + ZOMBIE_CATCHUP_COOLDOWN;
      return false;
    }

    enemy.x = spawn.x;
    enemy.z = spawn.z;
    enemy.spawnSide = spawn.side;
    if (teleportSideCounts) {
      teleportSideCounts[oldSide] -= 1;
      teleportSideCounts[spawn.side] += 1;
    }
    rememberZombieSurroundSide("teleport", spawn.side);
    enemy.navGoal = null;
    enemy.stuckTimer = 0;
    enemy.attackCooldown = Math.max(enemy.attackCooldown, 0.25);
    enemy.catchupReadyAt = state.time + ZOMBIE_CATCHUP_COOLDOWN;
    enemy.teleportCount = (enemy.teleportCount || 0) + 1;
    enemy.avoidSide = rng() < 0.5 ? -1 : 1;

    var dx = player.x - enemy.x;
    var dz = player.z - enemy.z;
    var len = Math.max(0.001, Math.hypot(dx, dz));
    enemy.steerX = dx / len;
    enemy.steerZ = dz / len;
    enemy.group.position.set(enemy.x, 0, enemy.z);
    enemy.group.rotation.y = Math.atan2(enemy.steerX, enemy.steerZ);
    enemy.group.scale.setScalar(1 + enemy.hitPulse * 0.08);
    enemy.group.visible = !pointOutsideVisibleGround(enemy.x, enemy.z, enemy.radius + ENEMY_VISUAL_CULL_PAD, visibleGround);

    state.zombieTeleports += 1;
    addSpawnDust(enemy.x, enemy.z);
    return true;
  }

  function chooseZombieDirection(enemy, player, nx, nz, dist, dt) {
    var cachedSteer = getCachedZombieSteer(enemy, nx, nz, dist, dt);
    if (cachedSteer) return cachedSteer;

    var target = getZombieNavigationTarget(enemy, player, dist);
    var tx = target.x - enemy.x;
    var tz = target.z - enemy.z;
    var targetDist = Math.hypot(tx, tz);
    var wantX = nx;
    var wantZ = nz;
    if (targetDist > 0.001) {
      wantX = tx / targetDist;
      wantZ = tz / targetDist;
    }

    var chosen = chooseClearZombieDirection(enemy, wantX, wantZ, dt);
    var blend = Math.min(1, dt * (enemy.stuckTimer > 0.12 ? 18 : 9));
    enemy.steerX += (chosen.x - enemy.steerX) * blend;
    enemy.steerZ += (chosen.z - enemy.steerZ) * blend;
    var len = Math.hypot(enemy.steerX, enemy.steerZ);
    if (len < 0.001) {
      enemy.steerX = chosen.x;
      enemy.steerZ = chosen.z;
      len = 1;
    }
    var steerX = enemy.steerX / len;
    var steerZ = enemy.steerZ / len;
    cacheZombieSteer(enemy, wantX, wantZ, steerX, steerZ, dist);
    zombieSteerResultScratch.x = steerX;
    zombieSteerResultScratch.z = steerZ;
    return zombieSteerResultScratch;
  }

  function getCachedZombieSteer(enemy, nx, nz, dist, dt) {
    if (enemy.cachedSteerTimer > 0) enemy.cachedSteerTimer = Math.max(0, enemy.cachedSteerTimer - dt);
    if (enemy.type === "spitter" || dist < ZOMBIE_STEER_CACHE_MIN_DISTANCE || enemy.navGoal || enemy.stuckTimer > 0.03) return null;
    if (enemy.cachedSteerTimer <= 0) return null;
    var wantDot = (enemy.cachedSteerWantX || 0) * nx + (enemy.cachedSteerWantZ || 0) * nz;
    if (wantDot < ZOMBIE_STEER_CACHE_DOT) {
      enemy.cachedSteerTimer = 0;
      return null;
    }
    zombieSteerResultScratch.x = enemy.cachedSteerX || nx;
    zombieSteerResultScratch.z = enemy.cachedSteerZ || nz;
    return zombieSteerResultScratch;
  }

  function cacheZombieSteer(enemy, wantX, wantZ, steerX, steerZ, dist) {
    if (enemy.type === "spitter" || dist < ZOMBIE_STEER_CACHE_MIN_DISTANCE || enemy.navGoal || enemy.stuckTimer > 0.03) {
      enemy.cachedSteerTimer = 0;
      return;
    }
    enemy.cachedSteerX = steerX;
    enemy.cachedSteerZ = steerZ;
    enemy.cachedSteerWantX = wantX;
    enemy.cachedSteerWantZ = wantZ;
    enemy.cachedSteerTimer = ZOMBIE_STEER_CACHE_INTERVAL;
  }

  function getZombieNavigationTarget(enemy, player, dist) {
    if (dist < 2.2) {
      enemy.navGoal = null;
      return player;
    }

    if (enemy.navGoal) {
      var goalDist = Math.hypot(enemy.navGoal.x - enemy.x, enemy.navGoal.z - enemy.z);
      var playerVisible = !findBlockingObstacle(enemy.x, enemy.z, player.x, player.z, enemy.radius + 0.24, null);
      if (goalDist < enemy.radius + 0.65 || state.time > enemy.navGoal.expires || (playerVisible && state.time > enemy.navGoal.holdUntil)) {
        enemy.navGoal = null;
      } else {
        return enemy.navGoal;
      }
    }

    var blocker = findBlockingObstacle(enemy.x, enemy.z, player.x, player.z, enemy.radius + 0.32, null);
    if (!blocker) return player;

    var corner = chooseObstacleCorner(enemy, blocker.rect, player.x, player.z);
    if (!corner) return player;

    var navGoal = enemy.navGoalStorage;
    navGoal.x = corner.x;
    navGoal.z = corner.z;
    navGoal.holdUntil = state.time + 0.35;
    navGoal.expires = state.time + 2.8;
    enemy.navGoal = navGoal;
    return enemy.navGoal;
  }

  function chooseObstacleCorner(enemy, rect, targetX, targetZ) {
    var margin = enemy.radius + rect.pad + 0.9;
    var corners = [
      { x: rect.x - rect.halfW - margin, z: rect.z - rect.halfD - margin },
      { x: rect.x + rect.halfW + margin, z: rect.z - rect.halfD - margin },
      { x: rect.x - rect.halfW - margin, z: rect.z + rect.halfD + margin },
      { x: rect.x + rect.halfW + margin, z: rect.z + rect.halfD + margin },
    ];
    var best = null;
    var bestScore = Infinity;
    var prevX = enemy.steerX || enemy.avoidSide;
    var prevZ = enemy.steerZ || 0;
    var currentDistance = Math.hypot(targetX - enemy.x, targetZ - enemy.z);
    var targetSideX = targetX >= rect.x ? 1 : -1;
    var targetSideZ = targetZ >= rect.z ? 1 : -1;

    for (var i = 0; i < corners.length; i++) {
      var c = corners[i];
      c.x = clamp(c.x, -ARENA_W / 2 - 3.2 + enemy.radius, ARENA_W / 2 + 3.2 - enemy.radius);
      c.z = clamp(c.z, -ARENA_D / 2 - 3.2 + enemy.radius, ARENA_D / 2 + 3.2 - enemy.radius);

      var toCorner = findBlockingObstacle(enemy.x, enemy.z, c.x, c.z, enemy.radius + 0.1, null);
      var toTarget = findBlockingObstacle(c.x, c.z, targetX, targetZ, enemy.radius + 0.18, null);
      var dx = c.x - enemy.x;
      var dz = c.z - enemy.z;
      var d1 = Math.hypot(dx, dz);
      var d2 = Math.hypot(targetX - c.x, targetZ - c.z);
      var len = Math.max(0.001, d1);
      var continuity = (dx / len) * prevX + (dz / len) * prevZ;
      var score = d1 + d2 - continuity * 0.7;
      var cornerSideX = c.x >= rect.x ? 1 : -1;
      var cornerSideZ = c.z >= rect.z ? 1 : -1;

      if (cornerSideX === targetSideX) score -= 4.5;
      if (cornerSideZ === targetSideZ) score -= 1.5;
      if (d2 > currentDistance) score += (d2 - currentDistance) * 7;
      if (d1 < enemy.radius + 0.9 && d2 >= currentDistance - 0.35) score += 70;

      if (toCorner) score += toCorner.rect === rect ? (toCorner.t > 0.72 ? 6 : 120) : 18;
      if (toTarget) score += 10 + toTarget.t * 5;

      if (score < bestScore) {
        bestScore = score;
        best = c;
      }
    }

    return best;
  }

  function chooseClearZombieDirection(enemy, wantX, wantZ, dt) {
    var side = enemy.avoidSide || 1;
    var prevX = enemy.steerX || wantX;
    var prevZ = enemy.steerZ || wantZ;
    var bestX = wantX;
    var bestZ = wantZ;
    var bestScore = -Infinity;
    var lookNear = enemy.radius + 0.35 + enemy.speed * dt;
    var lookFar = enemy.radius + Math.min(1.8, 0.9 + enemy.speed * 0.2 + enemy.stuckTimer * 2);
    var useCachedAngles = side === 1 || side === -1;

    for (var i = 0; i < ZOMBIE_CLEAR_DIRECTION_OFFSETS.length; i++) {
      var offset = ZOMBIE_CLEAR_DIRECTION_OFFSETS[i] * side;
      var ca = useCachedAngles ? ZOMBIE_CLEAR_DIRECTION_COS[i] : Math.cos(offset);
      var sa = useCachedAngles ? ZOMBIE_CLEAR_DIRECTION_SIN[i] * side : Math.sin(offset);
      var dirX = wantX * ca - wantZ * sa;
      var dirZ = wantX * sa + wantZ * ca;
      var nearX = enemy.x + dirX * lookNear;
      var nearZ = enemy.z + dirZ * lookNear;
      var farX = enemy.x + dirX * lookFar;
      var farZ = enemy.z + dirZ * lookFar;
      var blocked =
        pointHitsObstacle(nearX, nearZ, enemy.radius + 0.08) ||
        pointHitsObstacle(farX, farZ, enemy.radius + 0.08) ||
        !pointInsideEnemyBounds(farX, farZ, enemy.radius);
      var clearance = obstacleClearanceAt(farX, farZ, enemy.radius);
      var wantDot = dirX * wantX + dirZ * wantZ;
      var prevDot = dirX * prevX + dirZ * prevZ;
      var score = wantDot * 3.4 + prevDot * 0.7 + clearance * 0.32;
      if (blocked) score -= 7.5;
      if (enemy.stuckTimer > 0.18) score += prevDot * 0.7 + Math.abs(offset) * 0.22;

      if (score > bestScore) {
        bestScore = score;
        bestX = dirX;
        bestZ = dirZ;
      }
    }

    zombieClearDirectionScratch.x = bestX;
    zombieClearDirectionScratch.z = bestZ;
    return zombieClearDirectionScratch;
  }

  function updateZombieStuckState(enemy, moved, dist, dt) {
    var expected = Math.max(0.001, enemy.speed * dt);
    if (dist > enemy.radius + state.player.radius + 1.1 && moved / expected < 0.18) {
      enemy.stuckTimer += dt;
    } else {
      enemy.stuckTimer = Math.max(0, enemy.stuckTimer - dt * 2.6);
    }

    if (enemy.stuckTimer > 0.55) {
      enemy.navGoal = null;
      enemy.avoidSide *= -1;
      enemy.stuckTimer = 0.18;
    }
  }

  function updateZombieVisual(enemy) {
    var parts = enemy.group.userData.animParts;
    if (!parts) return;
    var intensity = enemy.moveAmount || 0;
    var fast = enemy.type === "fastZombie";
    var runner = enemy.type === "runner";
    var stride = Math.sin(enemy.walkPhase);
    var counterStride = Math.sin(enemy.walkPhase + Math.PI);
    var lurch = Math.sin(enemy.walkPhase * (fast ? 0.8 : runner ? 0.7 : 0.5) + enemy.radius) * (fast ? 0.12 : runner ? 0.1 : 0.08) * intensity;
    var spit = 0;
    if (enemy.type === "spitter") {
      if (enemy.spitWindup > 0) {
        var windupProgress = 1 - clamp(enemy.spitWindup / ACID_SPIT_WINDUP, 0, 1);
        spit = 0.25 + Math.sin(windupProgress * Math.PI) * 0.75;
      } else {
        spit = enemy.spitPulse || 0;
      }
    }
    var legSwing = fast ? 0.48 : runner ? 0.44 : 0.34;
    var armSwing = fast ? 0.32 : runner ? 0.3 : 0.22;
    var armReach = fast ? -0.6 : runner ? -0.48 : -0.55;
    var torsoLean = fast ? -0.17 - 0.06 * intensity : runner ? -0.13 * intensity : -0.08 * intensity - spit * 0.24;
    var headLean = fast ? 0.18 : runner ? 0.12 : 0.08;
    enemy.group.position.y = Math.abs(Math.sin(enemy.walkPhase * 2)) * (fast ? 0.06 : runner ? 0.05 : 0.055) * intensity;
    enemy.group.rotation.z = lurch + enemy.hitPulse * 0.04;
    enemy.group.rotation.x = fast ? -0.025 * intensity : 0;
    animateMeshValues(parts.leftLeg, stride * legSwing * intensity, 0, 0, 0, 0, -Math.abs(stride) * (fast ? 0.08 : 0.05) * intensity);
    animateMeshValues(parts.rightLeg, counterStride * legSwing * intensity, 0, 0, 0, 0, -Math.abs(counterStride) * (fast ? 0.08 : 0.05) * intensity);
    var leftArmRx = armReach - spit * 0.58 + counterStride * armSwing * intensity;
    var leftArmRz = (fast ? -0.18 : runner ? -0.16 : -0.12) - spit * 0.22 + stride * (fast ? 0.1 : runner ? 0.16 : 0.12) * intensity;
    var rightArmRx = armReach - spit * 0.58 + stride * armSwing * intensity;
    var rightArmRz = (fast ? 0.18 : runner ? 0.16 : 0.12) + spit * 0.22 + counterStride * (fast ? 0.1 : runner ? 0.16 : 0.12) * intensity;
    var armZ = spit * 0.12 + (fast ? 0.025 * intensity : 0);
    animateMeshValues(parts.leftArm, leftArmRx, 0, leftArmRz, 0, 0, armZ);
    animateMeshValues(parts.rightArm, rightArmRx, 0, rightArmRz, 0, 0, armZ);
    animateMeshValues(parts.leftWrist, leftArmRx + 0.04, 0, leftArmRz * 0.85 - 0.02, 0, 0, armZ + 0.012 * intensity);
    animateMeshValues(parts.rightWrist, rightArmRx + 0.04, 0, rightArmRz * 0.85 + 0.02, 0, 0, armZ + 0.012 * intensity);
    animateMeshValues(parts.leftClaw, leftArmRx + 0.08, 0, leftArmRz * 0.75 - 0.04, 0, 0, armZ + 0.018 * intensity);
    animateMeshValues(parts.rightClaw, rightArmRx + 0.08, 0, rightArmRz * 0.75 + 0.04, 0, 0, armZ + 0.018 * intensity);
    animateMeshValues(parts.torso, torsoLean, 0, lurch * (fast ? 0.8 : 0.7), 0, 0, spit * 0.08 + (fast ? 0.04 * intensity : 0));
    animateMeshValues(parts.chestGash, torsoLean * 0.35, 0, lurch * 0.8, 0, 0, fast ? 0.04 * intensity : 0.1 * intensity);
    animateMeshValues(parts.leftShoulder, torsoLean * 0.65, 0, -0.08 + lurch * 0.7, 0, 0, 0.03 * intensity);
    animateMeshValues(parts.rightShoulder, torsoLean * 0.65, 0, 0.08 + lurch * 0.7, 0, 0, 0.03 * intensity);
    animateMeshValues(parts.neckGore, torsoLean * 0.45, 0, lurch * 0.65, 0, 0, 0.035 * intensity);
    var headWalkLean = headLean + Math.sin(enemy.walkPhase * (fast ? 1.9 : 1.4)) * 0.06 * intensity;
    var headRz = -lurch * (fast ? 1.45 : 1.6);
    var headZ = fast ? 0.05 * intensity : 0;
    animateMeshValues(parts.head, headWalkLean + spit * 0.34, 0, headRz, 0, 0, spit * 0.18 + headZ);
    animateMeshValues(parts.leftEye, headWalkLean + spit * 0.34, 0, headRz, 0, 0, spit * 0.18 + headZ);
    animateMeshValues(parts.rightEye, headWalkLean + spit * 0.34, 0, headRz, 0, 0, spit * 0.18 + headZ);
    animateMeshValues(parts.mouth, headWalkLean + spit * 0.46, 0, headRz, 0, 0, spit * 0.27 + headZ);
    if (fast) {
      var parasitePulse = 1 + Math.sin(enemy.walkPhase * 2.2) * 0.045 * intensity + enemy.hitPulse * 0.12;
      var parasiteLean = 0.08 + Math.sin(enemy.walkPhase * 1.1) * 0.02 * intensity;
      var parasiteZ = 0.025 * intensity;
      animateMeshValues(parts.parasiteShell, parasiteLean, 0, -lurch * 0.8, 0, 0, parasiteZ);
      animateMeshValues(parts.parasiteShellRidge, parasiteLean + 0.03, 0, -lurch * 0.85, 0, 0, parasiteZ);
      animateMeshValues(parts.parasiteLeftPlate, parasiteLean * 0.8, 0, -0.08 - lurch * 0.7, 0, 0, parasiteZ * 0.8);
      animateMeshValues(parts.parasiteRightPlate, parasiteLean * 0.8, 0, 0.08 - lurch * 0.7, 0, 0, parasiteZ * 0.8);
      animateMeshValues(parts.parasiteBody, parasiteLean + 0.05, 0, -lurch * 0.75, 0, 0, parasiteZ);
      animateMeshValues(parts.parasiteLeftForeLeg, 0, 0, -0.18 + counterStride * 0.05 * intensity, 0, 0, parasiteZ * 0.5);
      animateMeshValues(parts.parasiteRightForeLeg, 0, 0, 0.18 + stride * 0.05 * intensity, 0, 0, parasiteZ * 0.5);
      animateMeshValues(parts.parasiteLeftLeg, 0, 0, -0.12 + stride * 0.04 * intensity, 0, 0, parasiteZ * 0.35);
      animateMeshValues(parts.parasiteRightLeg, 0, 0, 0.12 + counterStride * 0.04 * intensity, 0, 0, parasiteZ * 0.35);
      animateMeshValues(parts.parasiteBackLeg, 0, 0, stride * 0.04 * intensity, 0, 0, 0);
      scaleFromBase(parts.parasiteShell, parasitePulse, 1 + (parasitePulse - 1) * 0.5, parasitePulse);
      scaleFromBase(parts.parasiteShellRidge, 1, parasitePulse, 1);
      scaleFromBase(parts.parasiteLeftPlate, 1 + (parasitePulse - 1) * 0.5, 1, parasitePulse);
      scaleFromBase(parts.parasiteRightPlate, 1 + (parasitePulse - 1) * 0.5, 1, parasitePulse);
      scaleFromBase(parts.parasiteBody, 1 + (parasitePulse - 1) * 0.4, parasitePulse, 1 + (parasitePulse - 1) * 0.5);
    }
    if (enemy.type === "spitter") {
      scaleFromBase(parts.mouth, 1 + spit * 0.65, 1 + spit * 0.45, 1 + spit * 0.8);
      scaleFromBase(parts.leftEye, 1 + spit * 0.28, 1 + spit * 0.28, 1 + spit * 0.28);
      scaleFromBase(parts.rightEye, 1 + spit * 0.28, 1 + spit * 0.28, 1 + spit * 0.28);
      scaleFromBase(parts.chestGlow, 1 + spit * 0.7, 1 + spit * 0.7, 1 + spit * 1.1);
    }
  }

  function damagePlayer(amount) {
    var p = state.player;
    if (p.invuln > 0 || state.mode !== "playing") return;
    p.hp = Math.max(0, p.hp - amount);
    p.invuln = 0.36;
    state.duelistFocus = 0;
    state.shake = Math.min(1.2, state.shake + 0.45);
    for (var i = 0; i < 10; i++) {
      spawnParticle(p.x, 1.1, p.z, rand(-3, 3), rand(1.5, 4.5), rand(-3, 3), 0.35, rand(0.08, 0.18), mats.zombieBlood);
    }
    addShockwave(p.x, p.z, 1.25, 0.22, 0xd83a2e);
    if (p.hp <= 0) endGame();
  }

  function isShrapnelTrailPointVisible(x, z, visibleGround) {
    if (!visibleGround) return true;
    return !pointOutsideVisibleGround(x, z, SHRAPNEL_TRAIL_VIEW_PAD, visibleGround);
  }

  function getLauncherShrapnelTrailX(b, dt) {
    return b.x + b.dirX * b.speed * dt - b.dirX * 0.2;
  }

  function getLauncherShrapnelTrailZ(b, dt) {
    return b.z + b.dirZ * b.speed * dt - b.dirZ * 0.2;
  }

  function countLauncherShrapnelTrailParticles(dt, startIndex, visibleGround) {
    var start = Math.max(0, Math.floor(Number(startIndex) || 0));
    var count = 0;
    for (var i = state.bullets.length - 1; i >= start; i--) {
      var bullet = state.bullets[i];
      if (!bullet || bullet.type !== "launcherShrapnel" || bullet.trailTimer - dt > 0) continue;
      if (!isShrapnelTrailPointVisible(getLauncherShrapnelTrailX(bullet, dt), getLauncherShrapnelTrailZ(bullet, dt), visibleGround)) continue;
      count += 1;
    }
    return count;
  }

  function prepareLauncherShrapnelTrailBudget(count) {
    var requested = Math.max(0, Math.floor(Number(count) || 0));
    if (requested <= 0) return null;
    var visibleBudget = Math.min(requested, MAX_PARTICLES);
    reserveParticleSlots(visibleBudget);
    visibleBudget = Math.min(requested, Math.max(0, MAX_PARTICLES - state.particles.length));
    launcherShrapnelTrailBudgetScratch.skip = requested - visibleBudget;
    launcherShrapnelTrailBudgetScratch.spawn = visibleBudget;
    return launcherShrapnelTrailBudgetScratch;
  }

  function updateBullets(dt) {
    if (state.bullets.length && state.enemies.length) ensureZombieSpatialGridCurrent();
    var shrapnelTrailVisibleGround = state.bullets.length ? getCurrentVisibleGroundRect() : null;
    var shrapnelTrailParticles = countLauncherShrapnelTrailParticles(dt, 0, shrapnelTrailVisibleGround);
    var shrapnelTrailBudget = prepareLauncherShrapnelTrailBudget(shrapnelTrailParticles);
    for (var i = state.bullets.length - 1; i >= 0; i--) {
      var b = state.bullets[i];
      if (b.type === "launcherShrapnel") {
        updateLauncherShrapnelBullet(b, i, dt, shrapnelTrailBudget, shrapnelTrailVisibleGround);
        continue;
      }
      b.age += dt;
      if (b.targetX == null && b.targetZ == null) applyBulletHoming(b, dt);
      if (b.targetX != null && b.targetZ != null) {
        var toTargetX = b.targetX - b.x;
        var toTargetZ = b.targetZ - b.z;
        var targetDistance = Math.hypot(toTargetX, toTargetZ);
        var step = b.speed * dt;
        if (targetDistance <= step + (b.targetRadius || 0)) {
          b.x = b.targetX;
          b.z = b.targetZ;
          b.life = 0;
          b.age = b.maxLife;
        } else {
          b.life -= dt;
          b.x += b.dirX * step;
          b.z += b.dirZ * step;
        }
      } else {
        b.life -= dt;
        b.x += b.dirX * b.speed * dt;
        b.z += b.dirZ * b.speed * dt;
      }
      if (b.type === "launcher") {
        var progress = clamp(b.age / b.maxLife, 0, 1);
        b.y = 0.68 + Math.sin(progress * Math.PI) * 1.15;
        b.mesh.rotation.x += dt * 7.5;
        b.mesh.rotation.z += dt * 5.2;
        updateLauncherGrenadeWhistle(b);
        if (b.rollingFlame) {
          b.fireTrailTimer -= dt;
          if (b.fireTrailTimer <= 0) {
            b.fireTrailTimer = 0.13;
            spawnFirePatch(b.x, b.z, {
              radius: getLauncherFireRadius() * 0.58,
              life: getLauncherFireLife() * 0.72,
              damage: Math.max(1, getLauncherFireDamage() - 1),
              trail: true,
              damageDelay: 0.08,
            });
          }
        }
      } else if (b.type === "launcherFireShard") {
        var shardProgress = clamp(b.age / b.maxLife, 0, 1);
        b.y = 0.48 + Math.sin(shardProgress * Math.PI) * 0.42;
        b.mesh.rotation.x += dt * 9.5;
        b.mesh.rotation.z += dt * 6.5;
        b.fireTrailTimer -= dt;
        if (b.fireTrailTimer <= 0) {
          b.fireTrailTimer = LAUNCHER_CROSSFIRE_TRAIL_INTERVAL;
          spawnFirePatch(b.x, b.z, {
            radius: getLauncherCrossfireTrailRadius(),
            life: getLauncherCrossfireTrailLife(),
            damage: getLauncherFireDamage(),
            trail: true,
            splinter: true,
            damageDelay: 0.08,
          });
        }
      }
      updateElectricProjectileVisual(b, dt);
      b.mesh.position.set(b.x, b.y, b.z);
      syncStandardProjectileVisual(b.visual);
      b.trailTimer -= dt;
      if (b.trailTimer <= 0) {
        b.trailTimer = b.type === "launcher" ? 0.045 : b.chainLightning ? 0.022 : 0.035;
        if (b.type === "launcher") {
          addSmokePuff(b.x - b.dirX * 0.2, b.y, b.z - b.dirZ * 0.2, 0.22, 0.42);
        } else if (b.type === "launcherFireShard") {
          spawnParticle(b.x - b.dirX * 0.18, b.y, b.z - b.dirZ * 0.18, rand(-0.25, 0.25), rand(0.25, 0.8), rand(-0.25, 0.25), 0.13, 0.055, state.shotsFired % 2 ? mats.fireHot : mats.fireOrange);
        } else if (b.chainLightning) {
          spawnElectricBulletSpark(b);
        } else {
          spawnParticle(b.x - b.dirX * 0.2, b.y, b.z - b.dirZ * 0.2, 0, 0.2, 0, 0.12, 0.05, b.type === "rifle" ? mats.rifleTracer : mats.flash);
        }
      }

      var hit = null;
      if (!(b.type === "launcher" && b.airburstLanding) && b.type !== "launcherFireShard") {
        hit = findBulletHitTarget(b);
      }

      if (hit) {
        if (b.type === "launcher") {
          explodeGrenade(b.x, b.z, b.blastRadius, b.blastDamage, { bullet: b, kind: "main" });
        } else {
          if (b.hitEnemies) b.hitEnemies.push(hit);
          if (b.piercing) b.piercedEnemies.push(hit);
          if (b.plantsTrap) spawnRifleTrap(hit.x, hit.z, "rifle-hit");
          damageEnemy(hit, getBulletDamage(b), b.x, b.z, b);
          if (b.chainLightning) triggerRifleChainLightning(b, hit);
          if (b.throughAndThrough && b.piercing) b.damage *= 1.25;
        }
        if (b.type === "launcher") {
          removeBullet(i);
        } else if (!b.piercing && !tryRicochetBullet(b, hit)) {
          removeBullet(i);
        }
      } else {
        var obstacleHit = pointHitsObstacle(b.x, b.z, b.hitRadius * 0.7);
        var expired =
          b.life <= 0 ||
          obstacleHit ||
          b.x < -ARENA_W / 2 - 5 ||
          b.x > ARENA_W / 2 + 5 ||
          b.z < -ARENA_D / 2 - 5 ||
          b.z > ARENA_D / 2 + 5;
        if (!expired) continue;
        if (obstacleHit && b.type !== "launcher") addHitSpark(b.x, b.z);
        if (b.type === "launcher") {
          var explosionX = b.airburstLanding && b.life <= 0 && !obstacleHit && b.targetX != null ? b.targetX : b.x;
          var explosionZ = b.airburstLanding && b.life <= 0 && !obstacleHit && b.targetZ != null ? b.targetZ : b.z;
          explodeGrenade(explosionX, explosionZ, b.blastRadius, b.blastDamage, { bullet: b, kind: "main" });
        } else if (b.type === "launcherFireShard" && b.life <= 0 && !obstacleHit) {
          spawnFirePatch(b.x, b.z, {
            radius: getLauncherCrossfireTrailRadius() * 1.18,
            life: getLauncherCrossfireTrailLife(),
            damage: getLauncherFireDamage(),
            trail: true,
            splinter: true,
            damageDelay: 0.08,
          });
        }
        if (b.heavyRupture) triggerHeavyRupture(b);
        removeBullet(i);
      }
    }
  }

  function updateLauncherShrapnelBullet(b, index, dt, trailBudget, visibleGround) {
    b.age += dt;
    b.life -= dt;
    b.x += b.dirX * b.speed * dt;
    b.z += b.dirZ * b.speed * dt;
    b.mesh.position.set(b.x, b.y, b.z);
    syncStandardProjectileVisual(b.visual);

    b.trailTimer -= dt;
    if (b.trailTimer <= 0) {
      b.trailTimer = 0.035;
      var trailX = b.x - b.dirX * 0.2;
      var trailZ = b.z - b.dirZ * 0.2;
      if (isShrapnelTrailPointVisible(trailX, trailZ, visibleGround)) {
        if (trailBudget && trailBudget.skip > 0) {
          trailBudget.skip -= 1;
        } else {
          var reservedTrailParticle = !!(trailBudget && trailBudget.spawn > 0);
          if (trailBudget && trailBudget.spawn > 0) trailBudget.spawn -= 1;
          spawnParticle(trailX, b.y, trailZ, 0, 0.2, 0, 0.12, 0.05, mats.flash, reservedTrailParticle);
        }
      }
    }

    var hit = findLauncherShrapnelHitTarget(b);
    if (hit) {
      if (b.hitEnemies) b.hitEnemies.push(hit);
      damageEnemy(hit, getBulletDamage(b), b.x, b.z, b);
      removeBullet(index);
      return;
    }

    var obstacleHit = pointHitsObstacle(b.x, b.z, b.hitRadius * 0.7);
    var expired =
      b.life <= 0 ||
      obstacleHit ||
      b.x < -ARENA_W / 2 - 5 ||
      b.x > ARENA_W / 2 + 5 ||
      b.z < -ARENA_D / 2 - 5 ||
      b.z > ARENA_D / 2 + 5;
    if (!expired) return;
    if (obstacleHit) addHitSpark(b.x, b.z);
    removeBullet(index);
  }

  function findLauncherShrapnelHitTarget(b) {
    if (!state.enemies.length) return null;
    var hit = null;
    var hitOrder = Infinity;
    var hitRadius = b.hitRadius || 0.12;
    forEachEnemyNearCircle(b.x, b.z, hitRadius + 1.1, function (enemy) {
      if (!enemy || enemy.active === false) return;
      var radius = enemy.radius + hitRadius;
      var dx = b.x - enemy.x;
      var dz = b.z - enemy.z;
      if (dx * dx + dz * dz >= radius * radius) return;
      var order = getEnemySpatialOrder(enemy);
      if (order < hitOrder) {
        hitOrder = order;
        hit = enemy;
      }
    }, true);
    return hit;
  }

  function updateElectricProjectileVisual(b, dt) {
    if (!b || !b.mesh || !b.mesh.userData || !b.mesh.userData.electricProjectile) return;
    var parts = b.mesh.userData.electricParts || {};
    var t = (b.age || 0) * 18;
    if (parts.glow) {
      var pulse = 1 + Math.sin(t * 1.35) * 0.16;
      parts.glow.scale.set((b.visualWidth || 0.16) * 4.25 * pulse, (b.visualWidth || 0.16) * 3.1 * (1 + Math.cos(t) * 0.1), (b.visualLength || 0.78) * 0.98 * pulse);
      if (parts.glow.material) parts.glow.material.opacity = 0.24 + Math.sin(t * 1.7) * 0.08;
    }
    var rings = parts.rings || [];
    for (var r = 0; r < rings.length; r++) {
      var ring = rings[r];
      var ringPhase = ring.userData.phase || 0;
      var ringPulse = 1 + Math.sin(t * 1.6 + ringPhase) * 0.18;
      ring.rotation.z += dt * (5.4 + r * 2.2);
      ring.scale.setScalar((r === 0 ? 1.12 : 0.86) * ringPulse);
      if (ring.material) ring.material.opacity = (ring.userData.startOpacity || 0.48) * (0.72 + Math.sin(t * 2.1 + ringPhase) * 0.22);
    }
    var bolts = parts.bolts || [];
    for (var i = 0; i < bolts.length; i++) {
      var bolt = bolts[i];
      var phase = bolt.userData.phase || 0;
      var wobble = t + phase;
      bolt.position.x = Math.cos(wobble) * (bolt.userData.radiusX || 0.16);
      bolt.position.y = Math.sin(wobble * 1.27) * (bolt.userData.radiusY || 0.12);
      bolt.position.z = (bolt.userData.baseZ || 0) + Math.sin(wobble * 1.9) * 0.05;
      bolt.rotation.x = Math.sin(wobble * 1.4) * 0.78;
      bolt.rotation.y = Math.cos(wobble * 1.1) * 0.72;
      bolt.rotation.z += dt * (8 + i * 1.7);
      bolt.scale.z = (bolt.userData.baseScaleZ || 1) * (0.72 + Math.sin(wobble * 2.2) * 0.28);
      if (bolt.material) bolt.material.opacity = (bolt.userData.startOpacity || 0.86) * (0.7 + Math.sin(wobble * 2.6) * 0.25);
    }
  }

  function spawnElectricBulletSpark(b) {
    var side = rand(-0.22, 0.22);
    var back = rand(0.12, 0.34);
    spawnParticle(
      b.x - b.dirX * back + b.dirZ * side,
      b.y + rand(-0.08, 0.12),
      b.z - b.dirZ * back - b.dirX * side,
      -b.dirX * rand(0.1, 1.2) + rand(-1.8, 1.8),
      rand(0.35, 1.2),
      -b.dirZ * rand(0.1, 1.2) + rand(-1.8, 1.8),
      rand(0.11, 0.18),
      rand(0.04, 0.085),
      mats.lightning
    );
    if (rand(0, 1) > 0.45) {
      spawnParticle(
        b.x - b.dirX * (back + 0.08) - b.dirZ * side,
        b.y + rand(-0.06, 0.16),
        b.z - b.dirZ * (back + 0.08) + b.dirX * side,
        rand(-2.4, 2.4),
        rand(0.45, 1.5),
        rand(-2.4, 2.4),
        rand(0.08, 0.14),
        rand(0.035, 0.07),
        mats.xp
      );
    }
  }

  function shouldBulletSkipEnemy(b, enemy) {
    if (!enemy || enemy.active === false) return true;
    if (b.piercing && b.piercedEnemies && b.piercedEnemies.indexOf(enemy) !== -1) return true;
    if (b.hitEnemies && b.hitEnemies.indexOf(enemy) !== -1) return true;
    return false;
  }

  function getEnemySpatialOrder(enemy) {
    return enemy && enemy.spatialOrder != null ? enemy.spatialOrder : state.enemies.indexOf(enemy);
  }

  function findBulletHitTarget(b) {
    var hit = null;
    var hitOrder = Infinity;
    forEachEnemyNearCircle(b.x, b.z, b.hitRadius + 1.1, function (enemy) {
      if (shouldBulletSkipEnemy(b, enemy)) return;
      var radius = enemy.radius + b.hitRadius;
      var dx = b.x - enemy.x;
      var dz = b.z - enemy.z;
      if (dx * dx + dz * dz >= radius * radius) return;
      if (Math.hypot(dx, dz) >= radius) return;
      var order = getEnemySpatialOrder(enemy);
      if (order < hitOrder) {
        hitOrder = order;
        hit = enemy;
      }
    }, true);
    return hit;
  }

  function applyBulletHoming(b, dt) {
    if (!b.homing || b.type !== "revolver") return;
    var target = findEnemyInBulletCone(b, 13.5, 0.78);
    if (!target) return;
    var dx = target.x - b.x;
    var dz = target.z - b.z;
    var dist = Math.hypot(dx, dz);
    if (dist < 0.001) return;
    var blend = Math.min(0.34, b.homing * dt * 3.2);
    var nx = dx / dist;
    var nz = dz / dist;
    b.dirX = normalizeMix(b.dirX, nx, blend);
    b.dirZ = normalizeMix(b.dirZ, nz, blend);
    normalizeBulletDirection(b);
  }

  function findEnemyInBulletCone(b, maxDistance, minDot) {
    var best = null;
    var bestScore = Infinity;
    forEachEnemyNearCircle(b.x, b.z, maxDistance, function (enemy) {
      if (!enemy || enemy.active === false) return;
      if (b.hitEnemies && b.hitEnemies.indexOf(enemy) !== -1) return;
      var dx = enemy.x - b.x;
      var dz = enemy.z - b.z;
      if (dx * dx + dz * dz > maxDistance * maxDistance) return;
      var dist = Math.hypot(dx, dz);
      if (dist <= 0.001 || dist > maxDistance) return;
      var dot = (dx / dist) * b.dirX + (dz / dist) * b.dirZ;
      if (dot < minDot) return;
      var score = dist - dot * 3;
      if (score < bestScore) {
        bestScore = score;
        best = enemy;
      }
    }, true);
    return best;
  }

  function normalizeMix(a, b, blend) {
    return a + (b - a) * blend;
  }

  function normalizeBulletDirection(b) {
    var len = Math.hypot(b.dirX, b.dirZ);
    if (len < 0.001) return;
    b.dirX /= len;
    b.dirZ /= len;
    if (b.mesh) b.mesh.rotation.y = Math.atan2(b.dirX, b.dirZ);
  }

  function getBulletDamage(b) {
    if (b.ricochetDepth > 0 && hasUpgrade("trickShot")) {
      return b.baseDamage * (1 + b.ricochetDepth * 0.35);
    }
    return b.damage;
  }

  function tryRicochetBullet(b, hit) {
    if (b.ricochetRemaining <= 0) return false;
    var target = findRicochetTarget(b, hit, 18);
    if (!target) return false;
    var dx = target.x - b.x;
    var dz = target.z - b.z;
    var dist = Math.hypot(dx, dz);
    if (dist < 0.001) return false;
    b.ricochetRemaining -= 1;
    b.ricochetDepth += 1;
    b.dirX = dx / dist;
    b.dirZ = dz / dist;
    b.life = Math.max(b.life, Math.min(0.82, dist / Math.max(0.001, b.speed) + 0.12));
    b.maxLife = Math.max(b.maxLife, b.age + b.life);
    normalizeBulletDirection(b);
    addHitSpark(b.x, b.z);
    return true;
  }

  function findRicochetTarget(b, hit, maxDistance) {
    var best = null;
    var bestDist = maxDistance || Infinity;
    forEachEnemyNearCircle(b.x, b.z, bestDist, function (enemy) {
      if (!enemy || enemy.active === false || enemy === hit) return;
      if (b.hitEnemies && b.hitEnemies.indexOf(enemy) !== -1) return;
      var dx = enemy.x - b.x;
      var dz = enemy.z - b.z;
      if (dx * dx + dz * dz >= bestDist * bestDist) return;
      var dist = Math.hypot(dx, dz);
      if (dist < bestDist) {
        best = enemy;
        bestDist = dist;
      }
    }, true);
    return best;
  }

  function getRifleLightningTargetCount() {
    return RIFLE_LIGHTNING_BASE_TARGETS;
  }

  function getRifleLightningDamage() {
    return 3;
  }

  function triggerRifleChainLightning(b, hit) {
    var targetLimit = Math.max(1, b.lightningTargets || getRifleLightningTargetCount());
    var targets = [hit];
    var chainX = hit.x;
    var chainZ = hit.z;
    while (targets.length < targetLimit) {
      var next = findNextLightningTarget(targets, chainX, chainZ, 16);
      if (!next) break;
      targets.push(next);
      chainX = next.x;
      chainZ = next.z;
    }

    var prevX = b.x;
    var prevZ = b.z;
    addLightFlash(hit.x, 1.45, hit.z, 0x86f3ff, 3.4, 8.5, 0.18);
    addShockwave(hit.x, hit.z, 1.8, 0.28, 0x86f3ff);

    for (var i = 0; i < targets.length; i++) {
      var target = targets[i];
      if (!target) break;
      addLightningBolt(prevX, prevZ, target.x, target.z);
      playLightningChainSound(prevX, prevZ, target.x, target.z, i, targets.length);
      if (target.active !== false) {
        damageEnemy(target, getRifleLightningDamage(), target.x, target.z, { type: "rifleLightning" });
      }
      prevX = target.x;
      prevZ = target.z;
    }

    state.rifleLightningStrikes += targets.length;
    if (hasUpgrade("stormTempo")) state.rifleStormTempoTimer = Math.max(state.rifleStormTempoTimer, 1.65);
  }

  function findNextLightningTarget(existingTargets, x, z, maxDistance) {
    var best = null;
    var bestDist = maxDistance || Infinity;
    forEachEnemyNearCircle(x, z, bestDist, function (enemy) {
      if (!enemy || enemy.active === false) return;
      if (existingTargets.indexOf(enemy) !== -1) return;
      var dx = enemy.x - x;
      var dz = enemy.z - z;
      if (dx * dx + dz * dz >= bestDist * bestDist) return;
      var dist = Math.hypot(dx, dz);
      if (dist < bestDist) {
        best = enemy;
        bestDist = dist;
      }
    }, true);
    return best;
  }

  function addLightningBolt(x1, z1, x2, z2) {
    var group = new THREE.Group();
    group.name = "chain lightning";
    group.userData.fadeParts = [];
    effectRoot.add(group);
    var points = [];
    var segments = 7;
    var dx = x2 - x1;
    var dz = z2 - z1;
    var len = Math.max(0.001, Math.hypot(dx, dz));
    var nx = -dz / len;
    var nz = dx / len;
    for (var i = 0; i <= segments; i++) {
      var t = i / segments;
      var jitter = i === 0 || i === segments ? 0 : rand(-0.38, 0.38);
      points.push({
        x: x1 + dx * t + nx * jitter,
        y: 1.16 + Math.sin(t * Math.PI) * 0.36 + rand(-0.05, 0.05),
        z: z1 + dz * t + nz * jitter,
      });
    }

    for (var s = 0; s < points.length - 1; s++) {
      addLightningSegment(group, points[s], points[s + 1], s % 2 === 0 ? 0.12 : 0.085, 0.98);
      if (s > 0 && s < points.length - 2) {
        var branchSign = s % 2 === 0 ? 1 : -1;
        var branchLength = rand(0.45, 0.8) * branchSign;
        addLightningSegment(
          group,
          points[s],
          {
            x: points[s].x + nx * branchLength + dx / len * rand(-0.16, 0.16),
            y: points[s].y + rand(-0.08, 0.12),
            z: points[s].z + nz * branchLength + dz / len * rand(-0.16, 0.16),
          },
          0.045,
          0.68
        );
      }
    }
    for (var p = 0; p < 10; p++) {
      var angle = rand(0, Math.PI * 2);
      spawnParticle(x2, rand(0.85, 1.6), z2, Math.cos(angle) * rand(1.4, 4.6), rand(0.8, 3.2), Math.sin(angle) * rand(1.4, 4.6), rand(0.13, 0.24), rand(0.045, 0.11), p % 2 ? mats.xpLight : mats.rifleTracer);
    }
    state.lightningBolts.push({ mesh: group, life: 0.32, startLife: 0.32 });
    trimEffects(state.lightningBolts, MAX_LIGHTNING_BOLTS, removeLightningBolt);
  }

  function addLightningSegment(group, a, b, thickness, opacity) {
    var dist = Math.max(0.001, Math.hypot(b.x - a.x, b.z - a.z));
    var mesh = new THREE.Mesh(getSharedGeometry("lightning-segment", function () {
      return new THREE.BoxGeometry(1, 1, 1);
    }), mats.lightning.clone());
    mesh.userData.disposeGeometry = false;
    mesh.userData.disposeMaterial = true;
    mesh.userData.startOpacity = opacity == null ? 0.92 : opacity;
    mesh.material.opacity = mesh.userData.startOpacity;
    mesh.scale.set(thickness, thickness, dist);
    mesh.position.set((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    mesh.rotation.y = Math.atan2(b.x - a.x, b.z - a.z);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    group.add(mesh);
    group.userData.fadeParts.push(mesh);

    var glow = new THREE.Mesh(getSharedGeometry("lightning-ground-glow", function () {
      return new THREE.BoxGeometry(1, 1, 1);
    }), mats.lightning.clone());
    glow.userData.disposeGeometry = false;
    glow.userData.disposeMaterial = true;
    glow.userData.startOpacity = 0.34;
    glow.material.opacity = glow.userData.startOpacity;
    glow.scale.set(thickness * 4.6, 0.018, dist);
    glow.position.set((a.x + b.x) / 2, 0.085, (a.z + b.z) / 2);
    glow.rotation.y = mesh.rotation.y;
    glow.castShadow = false;
    glow.receiveShadow = false;
    glow.renderOrder = 2;
    group.add(glow);
    group.userData.fadeParts.push(glow);
  }

  function updateRifleTimers(dt) {
    state.rifleStormTempoTimer = Math.max(0, (state.rifleStormTempoTimer || 0) - dt);
    if (state.playerClass !== "ranger" || state.rifleUpgrade !== "trailWarden" || !hasUpgrade("trailLayer") || !state.player) return;
    state.rifleAutoTrapTimer -= dt;
    var guard = 0;
    while (state.rifleAutoTrapTimer <= 0 && guard < 12) {
      spawnRifleTrap(state.player.x, state.player.z, "trail-layer");
      state.rifleAutoTrapTimer += getRifleAutoTrapInterval();
      guard += 1;
    }
  }

  function getRifleAutoTrapInterval() {
    return Math.max(RIFLE_AUTO_TRAP_MIN_INTERVAL, RIFLE_AUTO_TRAP_BASE_INTERVAL - (state.rifleAutoTrapFrequency || 0) * RIFLE_AUTO_TRAP_INTERVAL_STEP);
  }

  function spawnRifleTrap(x, z, source) {
    if (pointHitsObstacle(x, z, 0.48)) return null;
    var visual = acquireRifleTrapVisual(x, z);
    var trap = {
      x: x,
      z: z,
      source: source || "rifle",
      age: 0,
      life: Infinity,
      permanent: true,
      armTime: 0.12,
      triggerRadius: 0.85,
      blastRadius: hasUpgrade("powderTrap") ? RIFLE_TRAP_POWDER_BLAST_RADIUS : RIFLE_TRAP_BASE_BLAST_RADIUS,
      damage: hasUpgrade("powderTrap") ? 5 : 3,
      lure: hasUpgrade("baitedTrap"),
      visual: visual,
      mesh: visual.group,
    };
    state.rifleTraps.push(trap);
    trimEffects(state.rifleTraps, MAX_RIFLE_TRAPS, removeRifleTrap);
    return trap;
  }

  function createRifleTrapVisual() {
    var group = new THREE.Group();
    group.name = "rifle trap";
    group.visible = false;
    var ring = new THREE.Mesh(getSharedGeometry("rifle-trap-ring", function () {
      return new THREE.RingGeometry(0.52, 0.68, 32);
    }), mats.trapGlow.clone());
    ring.userData.disposeGeometry = false;
    ring.userData.disposeMaterial = true;
    ring.userData.baseOpacity = mats.trapGlow.opacity;
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.075;
    ring.renderOrder = 1;
    group.add(ring);
    addSharedBox(group, 1.0, 0.12, 0.16, mats.trapMetal, 0, 0.14, 0).rotation.y = 0.28;
    addSharedBox(group, 1.0, 0.12, 0.16, mats.trapMetal, 0, 0.14, 0).rotation.y = -0.28;
    addSharedBox(group, 0.18, 0.1, 0.9, mats.trapWood, -0.32, 0.1, 0);
    addSharedBox(group, 0.18, 0.1, 0.9, mats.trapWood, 0.32, 0.1, 0);
    group.userData.ring = ring;
    var visual = { group: group, ring: ring };
    group.userData.rifleTrapVisual = visual;
    rifleTrapVisualCreated += 1;
    return visual;
  }

  function acquireRifleTrapVisual(x, z) {
    var visual = rifleTrapVisualPool.length ? rifleTrapVisualPool.pop() : createRifleTrapVisual();
    rifleTrapVisualInUse += 1;
    var group = visual.group;
    group.visible = true;
    group.position.set(x, 0, z);
    group.rotation.set(0, 0, 0);
    group.scale.setScalar(1);
    if (visual.ring && visual.ring.material && visual.ring.userData.baseOpacity != null) {
      visual.ring.material.opacity = visual.ring.userData.baseOpacity;
    }
    if (group.parent !== effectRoot) effectRoot.add(group);
    return visual;
  }

  function releaseRifleTrapVisual(visual) {
    if (!visual) return;
    var group = visual.group;
    if (group.parent) group.parent.remove(group);
    group.visible = false;
    group.position.set(0, -1000, 0);
    group.rotation.set(0, 0, 0);
    group.scale.setScalar(1);
    rifleTrapVisualInUse = Math.max(0, rifleTrapVisualInUse - 1);
    rifleTrapVisualPool.push(visual);
  }

  function releaseAllRifleTraps() {
    for (var i = state.rifleTraps.length - 1; i >= 0; i--) {
      var trap = state.rifleTraps[i];
      if (trap && trap.visual) releaseRifleTrapVisual(trap.visual);
    }
    state.rifleTraps = [];
  }

  function updateRifleTraps(dt) {
    if (state.rifleTraps.length && state.enemies.length) ensureZombieSpatialGridCurrent();
    var visibleGround = state.rifleTraps.length ? getCurrentVisibleGroundRect(trapVisibleGroundScratch) : null;
    for (var i = state.rifleTraps.length - 1; i >= 0; i--) {
      var trap = state.rifleTraps[i];
      trap.age += dt;
      if (!trap.permanent) trap.life -= dt;
      trap.armTime = Math.max(0, trap.armTime - dt);
      var visualVisible = !pointOutsideVisibleGround(trap.x, trap.z, trap.triggerRadius + TRAP_VISUAL_CULL_PAD, visibleGround);
      if (trap.mesh) trap.mesh.visible = visualVisible;
      if (dt > 0 && visualVisible) updateRifleTrapVisual(trap);
      if (trap.lure && dt > 0) lureEnemiesToTrap(trap, dt);
      if (trap.armTime <= 0 && findEnemyNearTrap(trap)) {
        triggerRifleTrap(i);
        continue;
      }
      if (trap.life <= 0) removeRifleTrap(i);
    }
  }

  function updateRifleTrapVisual(trap) {
    if (!trap.mesh) return;
    var pulse = 1 + Math.sin((state.time + trap.age) * 7) * 0.08;
    trap.mesh.scale.setScalar(pulse);
    var ring = trap.mesh.userData.ring;
    if (ring && ring.material) {
      ring.material.opacity = (trap.lure ? 0.62 : 0.42) * (0.75 + Math.sin(state.time * 8 + trap.age) * 0.25);
    }
  }

  function lureEnemiesToTrap(trap, dt) {
    rifleTrapTargetScratch.length = 0;
    rifleTrapDistanceScratch.length = 0;
    forEachEnemyNearCircle(trap.x, trap.z, 12, function (enemy) {
      if (!enemy || enemy.active === false) return;
      var dx = trap.x - enemy.x;
      var dz = trap.z - enemy.z;
      var dist = Math.hypot(dx, dz);
      if (dist <= 0.001 || dist > 12) return;
      insertRifleTrapLureTarget(enemy, dist);
    }, true);
    var movedAny = false;
    for (var i = 0; i < rifleTrapTargetScratch.length; i++) {
      var enemy = rifleTrapTargetScratch[i];
      var dist = rifleTrapDistanceScratch[i];
      var dx = trap.x - enemy.x;
      var dz = trap.z - enemy.z;
      var pull = enemy.speed * (0.5 + (1 - Math.min(1, dist / 12)) * 0.45) * dt;
      enemy.x += (dx / dist) * pull;
      enemy.z += (dz / dist) * pull;
      movedAny = true;
    }
    if (movedAny) zombieSpatialDirty = true;
  }

  function insertRifleTrapLureTarget(enemy, dist) {
    var limit = 5;
    var insertAt = rifleTrapDistanceScratch.length;
    for (var i = 0; i < rifleTrapDistanceScratch.length; i++) {
      if (dist < rifleTrapDistanceScratch[i]) {
        insertAt = i;
        break;
      }
    }
    if (insertAt >= limit) return;
    rifleTrapTargetScratch.splice(insertAt, 0, enemy);
    rifleTrapDistanceScratch.splice(insertAt, 0, dist);
    if (rifleTrapTargetScratch.length > limit) {
      rifleTrapTargetScratch.length = limit;
      rifleTrapDistanceScratch.length = limit;
    }
  }

  function findEnemyNearTrap(trap) {
    var found = null;
    forEachEnemyNearCircle(trap.x, trap.z, trap.triggerRadius + 1, function (enemy) {
      if (found || !enemy || enemy.active === false) return;
      var dx = enemy.x - trap.x;
      var dz = enemy.z - trap.z;
      var radius = trap.triggerRadius + enemy.radius;
      if (dx * dx + dz * dz > radius * radius) return;
      if (Math.hypot(dx, dz) <= radius) found = enemy;
    }, true);
    return found;
  }

  function triggerRifleTrap(index) {
    var trap = state.rifleTraps[index];
    if (!trap) return;
    state.rifleTrapTriggers += 1;
    addShockwave(trap.x, trap.z, trap.blastRadius, 0.36, trap.lure ? 0xffd36b : 0xffb35f);
    addLightFlash(trap.x, 0.9, trap.z, trap.lure ? 0xffd36b : 0xffb35f, 3.2, 7, 0.2);
    forEachEnemyNearCircle(trap.x, trap.z, trap.blastRadius + 1.2, function (enemy) {
      if (!enemy || enemy.active === false) return;
      var dx = enemy.x - trap.x;
      var dz = enemy.z - trap.z;
      var hitRadius = trap.blastRadius + enemy.radius * 0.35;
      if (dx * dx + dz * dz > hitRadius * hitRadius) return;
      var dist = Math.hypot(dx, dz);
      if (dist > hitRadius) return;
      var ratio = 1 - clamp(dist / trap.blastRadius, 0, 1);
      damageEnemy(enemy, Math.max(1, Math.ceil(trap.damage * (0.65 + ratio * 0.55))), trap.x, trap.z, { type: "rifleTrap", trap: trap });
    }, true);
    for (var p = 0; p < 18; p++) {
      var angle = rand(0, Math.PI * 2);
      spawnParticle(trap.x, rand(0.25, 1.1), trap.z, Math.cos(angle) * rand(1.4, 5), rand(0.8, 3.6), Math.sin(angle) * rand(1.4, 5), rand(0.18, 0.36), rand(0.055, 0.13), p % 2 ? mats.trapMetal : mats.flash);
    }
    removeRifleTrap(index);
  }

  function triggerHeavyRupture(b) {
    if (!b.piercedEnemies || !b.piercedEnemies.length) return;
    state.bigIronRuptures += 1;
    var radius = 2.15;
    addShockwave(b.x, b.z, radius, 0.36, 0xffc45f);
    addLightFlash(b.x, 1.1, b.z, 0xffb347, 2.8, 6, 0.18);
    forEachEnemyNearCircle(b.x, b.z, radius + 1.1, function (enemy) {
      if (!enemy || enemy.active === false) return;
      var dx = enemy.x - b.x;
      var dz = enemy.z - b.z;
      if (dx * dx + dz * dz > radius * radius) return;
      var dist = Math.hypot(dx, dz);
      if (dist > radius) return;
      damageEnemy(enemy, Math.max(1, Math.ceil(2.4 * (1 - dist / radius))), b.x, b.z, b);
    }, true);
  }

  function damageEnemy(enemy, damage, x, z, source) {
    if (!enemy || enemy.active === false) return;
    enemy.hp -= damage;
    if (source && source.executioner && enemy.hp > 0 && enemy.hp <= enemy.maxHp * 0.28) enemy.hp = 0;
    enemy.hitPulse = 1;
    if (!(source && source.aggregateHitSound && source.aggregateHitSoundPlayed)) {
      playZombieHitSound(x, z, damage, source);
      if (source && source.aggregateHitSound) source.aggregateHitSoundPlayed = true;
    }
    var preReservedHitParticles = !!(source && source.preReservedHitParticles);
    addHitSpark(x, z, preReservedHitParticles);
    if (!preReservedHitParticles) reserveParticleSlots(6);
    for (var i = 0; i < 6; i++) {
      spawnParticle(x, 1.05, z, rand(-2.5, 2.5), rand(0.8, 3.6), rand(-2.5, 2.5), 0.28, rand(0.08, 0.18), mats.zombieBlood, true);
    }
    state.shake = Math.min(1, state.shake + 0.1);
    if (enemy.hp <= 0) killEnemy(enemy, source);
  }

  function killEnemy(enemy, source) {
    if (!enemy || enemy.active === false) return;
    var marshalKillSnapshot = {
      x: enemy.x,
      z: enemy.z,
      xp: enemy.xp || 1,
      type: enemy.type,
      maxHp: enemy.maxHp || 1,
      marked: isMarshalEnemyMarked(enemy),
      bounty: !!enemy.marshalBounty,
    };
    if (source && source.killedEnemies) {
      source.killedEnemies.push({
        x: enemy.x,
        z: enemy.z,
        xp: enemy.xp || 1,
        type: enemy.type,
      });
    }
    if (!(source && source.deferEnemyRemoval)) {
      var idx = state.enemies.indexOf(enemy);
      if (idx !== -1) state.enemies.splice(idx, 1);
    }
    zombieSpatialDirty = true;
    var preReservedKillParticles = !!(source && source.preReservedKillParticles);
    createDeathDebris(enemy, source && source.preReservedDeathDebris);
    releaseZombieToPool(enemy);
    state.score += enemy.score;
    state.kills += 1;
    spawnXpOrb(enemy.x, enemy.z, enemy.xp || 1, source && source.preReservedXpOrbs);
    addScorchMark(enemy.x, enemy.z, 0.9, source && source.preReservedScorchDecals);
    addGoldBurst(enemy.x, enemy.z, enemy.score, preReservedKillParticles);
    if (!preReservedKillParticles) reserveParticleSlots(18);
    for (var i = 0; i < 18; i++) {
      spawnParticle(enemy.x, rand(0.7, 2.1), enemy.z, rand(-4, 4), rand(1.4, 5.2), rand(-4, 4), rand(0.35, 0.7), rand(0.08, 0.22), i % 3 === 0 ? mats.zombieSkin : mats.zombieBlood, true);
    }
    handleRevolverKillEffects(enemy, source);
    handleRifleKillEffects(enemy, source);
    handleLauncherKillEffects(enemy, source);
    handleMarshalKillEffects(marshalKillSnapshot, source);
  }

  function handleMarshalKillEffects(enemy, source) {
    if (!enemy || !source || source.type !== "coachGun" || state.playerClass !== "marshal") return;
    if (source.pointBlank) {
      if (state.marshalUpgrade === "breachMarshal" && hasUpgrade("shellCatcher")) {
        state.marshalShellCatcherKills += 1;
        if (state.marshalShellCatcherKills >= 3) {
          state.marshalShellCatcherKills = 0;
          grantMarshalGeneratedShells(1);
        }
      }
      if (state.marshalUpgrade === "breachMarshal" && hasUpgrade("noTimeToBleed")) {
        state.marshalCloseKills += 1;
        if (state.marshalCloseKills >= 6) {
          state.marshalCloseKills = 0;
          if (state.player) state.player.hp = Math.min(state.player.maxHp, state.player.hp + 4);
        }
      }
    }

    var markedKill = !!(enemy.marked || source.targetWasMarked);
    var bountyKill = !!(enemy.bounty || source.targetWasBounty);
    if (state.marshalUpgrade !== "graveWarden" || !markedKill) return;

    if (hasUpgrade("graveTithe")) {
      state.marshalGraveTitheKills += 1;
      if (state.marshalGraveTitheKills >= 2) {
        state.marshalGraveTitheKills = 0;
        grantMarshalGeneratedShells(1);
      }
    }
    if (hasUpgrade("lastRites")) tryRaisePaleDeputy(enemy.x, enemy.z);
    if (hasUpgrade("passingJudgment")) passMarshalJudgment(enemy.x, enemy.z);
    if (hasUpgrade("hallowedGround") && (enemy.type === "brute" || enemy.type === "spitter" || enemy.maxHp >= 4)) {
      spawnMarshalHallowedGround(enemy.x, enemy.z);
    }
    if (bountyKill && hasUpgrade("heavensBounty")) {
      state.marshalBountiesClaimed += 1;
      state.marshalBountyEnemy = null;
      state.marshalBountyTimer = 12;
      state.ammoReserve.coachGun = Math.max(0, state.ammoReserve.coachGun || 0) + 2;
      spawnXpOrb(enemy.x + 0.2, enemy.z - 0.2, Math.max(1, Math.round(enemy.xp * 0.5)));
    }
  }

  function triggerMarshalFearBurst(x, z) {
    var radius = 5.2;
    state.marshalFearBursts += 1;
    addShockwave(x, z, radius, 0.4, 0xffefbd);
    forEachEnemyNearCircle(x, z, radius + 1.2, function (enemy) {
      if (!enemy || enemy.active === false) return;
      var dx = enemy.x - x;
      var dz = enemy.z - z;
      if (dx * dx + dz * dz > radius * radius) return;
      enemy.marshalFearTimer = Math.max(enemy.marshalFearTimer || 0, 1);
      enemy.marshalFearX = x;
      enemy.marshalFearZ = z;
      enemy.navGoal = null;
    }, true);
  }

  function passMarshalJudgment(x, z) {
    var candidates = [];
    forEachEnemyNearCircle(x, z, 8.5, function (enemy) {
      if (!enemy || enemy.active === false || isMarshalEnemyMarked(enemy)) return;
      candidates.push({ enemy: enemy, distance: Math.hypot(enemy.x - x, enemy.z - z) });
    }, true);
    candidates.sort(function (a, b) {
      return a.distance - b.distance;
    });
    var count = Math.min(2, candidates.length);
    for (var i = 0; i < count; i++) {
      applyMarshalMark(candidates[i].enemy, 3);
      state.marshalMarksPassed += 1;
    }
  }

  function compactEnemiesAfterDeferredRemoval() {
    var write = 0;
    var changed = false;
    for (var read = 0; read < state.enemies.length; read++) {
      var enemy = state.enemies[read];
      if (enemy && enemy.active !== false) {
        if (write !== read) {
          state.enemies[write] = enemy;
          changed = true;
        }
        write += 1;
      } else {
        changed = true;
      }
    }
    if (!changed) return;
    state.enemies.length = write;
    zombieSpatialDirty = true;
  }

  function handleRevolverKillEffects(enemy, source) {
    if (state.revolverUpgrade === "dualRevolvers") {
      if (hasUpgrade("fanTheHammer")) state.fanTheHammerTimer = Math.max(state.fanTheHammerTimer, 1.8);
      handleAllRightAllLeftKill(source);
    }
    handleSilverCacheKill(enemy, source);
    if (source && source.leadBloom && source.type === "revolver") spawnLeadBloom(enemy.x, enemy.z, source);
  }

  function handleSilverCacheKill(enemy, source) {
    if (!enemy || !source || source.type !== "revolver" || !source.silverBullet || !hasUpgrade("silverCache")) return;
    state.silverBulletAmmoKills += 1;
    if (state.silverBulletAmmoKills < SILVER_CACHE_KILLS_PER_DROP) return;
    state.silverBulletAmmoKills = 0;
    spawnMiniAmmoCrateAt(enemy.x, enemy.z);
  }

  function handleRifleKillEffects(enemy, source) {
    if (!source) return;
    if ((source.type === "rifle" || source.type === "rifleLightning") && state.rifleUpgrade === "leverBarrage" && hasUpgrade("trailLoader")) {
      state.rifleKillReloadCounter += 1;
      if (state.rifleKillReloadCounter >= 3) {
        state.rifleKillReloadCounter = 0;
        restoreWeaponAmmo("rifle", 3);
      }
    }

    if (source.type === "rifleTrap" && hasUpgrade("salvagedTrap")) {
      var restored = restoreWeaponAmmo("rifle", 2);
      state.rifleTrapAmmoRestored += restored;
      var bonusXp = Math.max(2, Math.round((enemy.xp || 1) * 0.55));
      state.rifleTrapBonusXp += bonusXp;
      spawnXpOrb(enemy.x + rand(-0.18, 0.18), enemy.z + rand(-0.18, 0.18), bonusXp);
    }
  }

  function handleLauncherKillEffects(enemy, source) {
    if (!source) return;
    if (source.type === "launcherShrapnel") {
      var fullSalvoContext = source.fullSalvoContext || source;
      fullSalvoContext.kills = (fullSalvoContext.kills || 0) + 1;
      tryTriggerLauncherFullSalvo(fullSalvoContext.kills, fullSalvoContext);
    }
    if (source.type === "launcherFire") {
      state.launcherFireKills += 1;
      var bonusXp = Math.max(1, Math.round((enemy.xp || 1) * 2));
      state.launcherFireBonusXp += bonusXp;
      spawnXpOrb(enemy.x, enemy.z, bonusXp);
      if (hasUpgrade("backdraft")) triggerLauncherBackdraft(enemy.x, enemy.z);
    }
  }

  function triggerLauncherBackdraft(x, z) {
    state.launcherBackdrafts += 1;
    addShockwave(x, z, 2.25, 0.28, 0xff7b24);
    addLightFlash(x, 0.95, z, 0xff8a2a, 2.4, 5.8, 0.17);
    spawnFirePatch(x, z, {
      radius: getLauncherFireRadius() * 1.24,
      life: Math.max(1.4, getLauncherFireLife() * 0.42),
      damage: Math.max(1, getLauncherFireDamage() - 1),
      trail: true,
      backdraft: true,
      damageDelay: 0.12,
    });
    forEachEnemyNearCircle(x, z, 2.25 + 1.2, function (enemy) {
      if (!enemy || enemy.active === false) return;
      var dx = enemy.x - x;
      var dz = enemy.z - z;
      var hitRadius = 2.25 + enemy.radius * 0.25;
      if (dx * dx + dz * dz > hitRadius * hitRadius) return;
      var dist = Math.hypot(dx, dz);
      if (dist > hitRadius) return;
      damageEnemy(enemy, Math.max(1, Math.ceil(2.2 * (1 - clamp(dist / 2.25, 0, 1)) + 0.4)), x, z, { type: "launcherBackdraft" });
    }, true);
  }

  function restoreWeaponAmmo(id, amount) {
    var weapon = WEAPONS[id];
    if (!weapon) return 0;
    var magazine = getWeaponMagazine(weapon);
    var current = clamp(state.ammo[id] || 0, 0, magazine);
    var restored = Math.min(Math.max(0, Math.round(amount || 0)), Math.max(0, magazine - current));
    if (!restored) return 0;
    state.ammo[id] = current + restored;
    if (state.ammo[id] > 0) state.reloadTimers[id] = 0;
    return restored;
  }

  function grantMarshalGeneratedShells(amount) {
    var requested = Math.max(0, Math.round(Number(amount) || 0));
    if (!requested) return 0;
    var loaded = restoreWeaponAmmo("coachGun", requested);
    var overflow = requested - loaded;
    if (overflow > 0) state.ammoReserve.coachGun = Math.max(0, state.ammoReserve.coachGun || 0) + overflow;
    state.marshalGeneratedShells = (state.marshalGeneratedShells || 0) + requested;
    return requested;
  }

  function spawnLeadBloom(x, z, source) {
    var baseAngle = Math.atan2(source.dirX, source.dirZ);
    var angles = [baseAngle - Math.PI / 2, baseAngle + Math.PI / 2];
    for (var i = 0; i < angles.length; i++) {
      spawnLeadBloomBullet(x, z, angles[i]);
    }
  }

  function spawnLeadBloomBullet(x, z, angle) {
    var speed = WEAPONS.revolver.speed * 0.88;
    var life = 0.42 * getWeaponRangeMultiplier(WEAPONS.revolver);
    var width = WEAPONS.revolver.width * 0.9;
    var length = WEAPONS.revolver.length * 0.72;
    var start = new THREE.Vector3(x + Math.sin(angle) * 0.35, WEAPONS.revolver.muzzleY, z + Math.cos(angle) * 0.35);
    var mesh = createProjectileMesh(WEAPONS.revolver, start, angle, { width: width, length: length });
    var visual = getProjectileVisualForObject(mesh);
    state.leadBloomShots += 1;
    state.bullets.push({
      type: "leadBloom",
      x: start.x,
      y: start.y,
      z: start.z,
      dirX: Math.sin(angle),
      dirZ: Math.cos(angle),
      speed: speed,
      life: life,
      maxLife: life,
      age: 0,
      baseDamage: WEAPONS.revolver.damage,
      damage: WEAPONS.revolver.damage,
      hitRadius: WEAPONS.revolver.hitRadius * 0.72,
      visualWidth: width,
      visualLength: length,
      piercing: false,
      piercedEnemies: [],
      hitEnemies: [],
      ricochetRemaining: 0,
      ricochetDepth: 0,
      homing: 0,
      blastRadius: 0,
      blastDamage: 0,
      targetX: null,
      targetZ: null,
      targetRadius: 0,
      trailTimer: 0,
      visual: visual,
      mesh: mesh,
    });
  }

  function updateEnemyHealthBar(enemy) {
    var fill = enemy.group.userData.healthFill;
    if (!fill) return;
    var ratio = clamp(enemy.hp / enemy.maxHp, 0, 1);
    fill.scale.x = ratio;
    fill.position.x = -(enemy.group.userData.healthBaseWidth * (1 - ratio)) / 2;
  }

  function removeBullet(index) {
    var b = state.bullets[index];
    if (!b) return;
    if (b.launcherWhistle) stopLauncherGrenadeWhistle(b.launcherWhistle, 0.045);
    if (b.visual) {
      releaseProjectileVisual(b.visual);
    } else {
      var visual = getProjectileVisualForObject(b.mesh);
      if (visual) releaseProjectileVisual(visual);
      else removeObject3D(b.mesh);
    }
    state.bullets.splice(index, 1);
  }

  function updateParticles(dt) {
    for (var i = state.particles.length - 1; i >= 0; i--) {
      var p = state.particles[i];
      p.life -= dt;
      p.vy -= 8.2 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.y < 0.08) {
        p.y = 0.08;
        p.vy *= -0.25;
        p.vx *= 0.65;
        p.vz *= 0.65;
      }
      var fade = clamp(p.life / p.startLife, 0, 1);
      writeParticleVisualMatrix(p.visual, p.x, p.y, p.z, Math.max(0.05, fade) * p.startScale);
      if (p.life <= 0) {
        removeParticle(i);
      }
    }
  }

  function updateVisualEffects(dt) {
    var visibleGround = state.lightFlashes.length ? getCurrentVisibleGroundRect(lightVisibleGroundScratch) : null;
    for (var i = state.shockwaves.length - 1; i >= 0; i--) {
      var wave = state.shockwaves[i];
      wave.life -= dt;
      var t = 1 - clamp(wave.life / wave.startLife, 0, 1);
      wave.mesh.scale.setScalar(0.15 + wave.targetRadius * t);
      wave.mesh.material.opacity = wave.startOpacity * (1 - t);
      if (wave.life <= 0.0001) {
        removeShockwave(i);
      }
    }

    for (var lb = state.lightningBolts.length - 1; lb >= 0; lb--) {
      var bolt = state.lightningBolts[lb];
      bolt.life -= dt;
      var boltFade = clamp(bolt.life / bolt.startLife, 0, 1);
      var fadeParts = bolt.mesh.userData.fadeParts || [];
      for (var partIndex = 0; partIndex < fadeParts.length; partIndex++) {
        var child = fadeParts[partIndex];
        if (child.material && child.material.opacity != null) {
          var startOpacity = child.userData && child.userData.startOpacity != null ? child.userData.startOpacity : 0.92;
          child.material.opacity = startOpacity * boltFade;
        }
      }
      if (bolt.life <= 0) {
        removeLightningBolt(lb);
      }
    }

    for (var d = state.decals.length - 1; d >= 0; d--) {
      var decal = state.decals[d];
      decal.life -= dt;
      var fade = clamp(decal.life / decal.startLife, 0, 1);
      decal.mesh.material.opacity = decal.startOpacity * Math.min(1, fade * 1.4);
      if (decal.life <= 0) {
        removeDecal(d);
      }
    }

    for (var l = state.lightFlashes.length - 1; l >= 0; l--) {
      var flash = state.lightFlashes[l];
      flash.life -= dt;
      flash.light.intensity = flash.startIntensity * clamp(flash.life / flash.startLife, 0, 1);
      flash.light.visible = !pointOutsideVisibleGround(
        flash.light.position.x,
        flash.light.position.z,
        (flash.light.distance || 0) + LIGHT_VISUAL_CULL_PAD,
        visibleGround
      );
      if (flash.life <= 0) {
        removeLightFlash(l);
      }
    }

    for (var s = state.smokePuffs.length - 1; s >= 0; s--) {
      var puff = state.smokePuffs[s];
      puff.life -= dt;
      puff.x += puff.vx * dt;
      puff.y += puff.vy * dt;
      puff.z += puff.vz * dt;
      var st = 1 - clamp(puff.life / puff.startLife, 0, 1);
      puff.mesh.position.set(puff.x, puff.y, puff.z);
      puff.mesh.rotation.y += dt * puff.spin;
      puff.mesh.scale.setScalar(puff.startScale * (1 + st * 1.8));
      puff.mesh.material.opacity = puff.startOpacity * (1 - st);
      if (puff.life <= 0) {
        removeSmokePuff(s);
      }
    }

    for (var a = 0; a < state.ambientDust.length; a++) {
      var dust = state.ambientDust[a];
      dust.x += dust.vx * dt;
      dust.z += dust.vz * dt;
      dust.phase += dt * dust.speed;
      if (dust.x > ARENA_W / 2 + 4) dust.x = -ARENA_W / 2 - 4;
      if (dust.x < -ARENA_W / 2 - 4) dust.x = ARENA_W / 2 + 4;
      if (dust.z > ARENA_D / 2 + 4) dust.z = -ARENA_D / 2 - 4;
      if (dust.z < -ARENA_D / 2 - 4) dust.z = ARENA_D / 2 + 4;
      dust.mesh.position.set(dust.x, dust.y + Math.sin(dust.phase) * 0.18, dust.z);
      dust.mesh.material.opacity = dust.opacity * (0.65 + Math.sin(dust.phase * 1.7) * 0.35);
    }

    for (var b = state.debris.length - 1; b >= 0; b--) {
      var piece = state.debris[b];
      piece.life -= dt;
      piece.vy -= 9.5 * dt;
      piece.x += piece.vx * dt;
      piece.y += piece.vy * dt;
      piece.z += piece.vz * dt;
      if (piece.y < 0.12) {
        piece.y = 0.12;
        piece.vy *= -0.22;
        piece.vx *= 0.72;
        piece.vz *= 0.72;
      }
      piece.mesh.position.set(piece.x, piece.y, piece.z);
      piece.mesh.rotation.x += piece.rx * dt;
      piece.mesh.rotation.y += piece.ry * dt;
      piece.mesh.rotation.z += piece.rz * dt;
      var debrisFade = clamp(piece.life / piece.startLife, 0, 1);
      piece.mesh.material.opacity = piece.startOpacity * Math.min(1, debrisFade * 1.4);
      if (piece.life <= 0) {
        removeDebris(b);
      }
    }
  }

  function removeParticle(index) {
    var particle = state.particles[index];
    if (!particle) return;
    releaseParticleEntry(particle);
    state.particles.splice(index, 1);
  }

  function releaseParticleEntry(particle) {
    if (!particle) return;
    if (particle.visual) {
      releaseParticleVisual(particle.visual);
    } else {
      removeObject3D(particle.mesh);
    }
  }

  function removeShockwave(index) {
    var wave = state.shockwaves[index];
    if (!wave) return;
    releaseShockwaveVisual(wave.visual);
    state.shockwaves.splice(index, 1);
  }

  function removeLightningBolt(index) {
    var bolt = state.lightningBolts[index];
    if (!bolt) return;
    removeObject3D(bolt.mesh);
    state.lightningBolts.splice(index, 1);
  }

  function removeRifleTrap(index) {
    var trap = state.rifleTraps[index];
    if (!trap) return;
    releaseRifleTrapVisual(trap.visual);
    state.rifleTraps.splice(index, 1);
  }

  function removeDecal(index) {
    var decal = state.decals[index];
    if (!decal) return;
    releaseDecalEntry(decal);
    state.decals.splice(index, 1);
  }

  function releaseDecalEntry(decal) {
    if (!decal) return;
    if (decal.visual) {
      releaseScorchDecalVisual(decal.visual);
    } else {
      removeObject3D(decal.mesh);
    }
  }

  function removeSmokePuff(index) {
    var puff = state.smokePuffs[index];
    if (!puff) return;
    releaseSmokePuffEntry(puff);
    state.smokePuffs.splice(index, 1);
  }

  function releaseSmokePuffEntry(puff) {
    if (!puff) return;
    releaseSmokePuffVisual(puff.visual);
  }

  function removeLightFlash(index) {
    var flash = state.lightFlashes[index];
    if (!flash) return;
    releaseLightFlashVisual(flash.visual);
    state.lightFlashes.splice(index, 1);
  }

  function removeDebris(index) {
    var piece = state.debris[index];
    if (!piece) return;
    releaseDebrisEntry(piece);
    state.debris.splice(index, 1);
  }

  function releaseDebrisEntry(piece) {
    if (!piece) return;
    if (piece.visual) {
      releaseDeathDebrisVisual(piece.visual);
    } else {
      removeObject3D(piece.mesh);
    }
  }

  function removeXpOrb(index) {
    var orb = state.xpOrbs[index];
    if (!orb) return;
    releaseXpOrbEntry(orb);
    state.xpOrbs.splice(index, 1);
  }

  function releaseXpOrbEntry(orb) {
    if (!orb) return;
    if (orb.visual) {
      releaseXpOrbVisual(orb.visual);
    } else {
      removeObject3D(orb.mesh);
    }
  }

  function trimEffects(array, maxCount, remover) {
    while (array.length > maxCount) remover(0);
  }

  function reserveEffectSlots(array, maxCount, releaser, count) {
    if (gameplayWarmupMode) return;
    var requested = Math.max(0, Math.floor(Number(count) || 0));
    if (requested <= 0) return;
    var overflow = array.length + requested - maxCount;
    if (overflow <= 0 || !array.length) return;
    var removeCount = Math.min(overflow, array.length);
    for (var i = 0; i < removeCount; i++) {
      releaser(array[i]);
    }
    array.splice(0, removeCount);
  }

  function reserveParticleSlots(count) {
    reserveEffectSlots(state.particles, MAX_PARTICLES, releaseParticleEntry, count);
  }

  function reserveParticleSlot() {
    if (state.particles.length >= MAX_PARTICLES) removeParticle(0);
  }

  function reserveShockwaveSlot() {
    if (state.shockwaves.length >= MAX_SHOCKWAVES) removeShockwave(0);
  }

  function reserveSmokePuffSlot() {
    if (state.smokePuffs.length >= MAX_SMOKE_PUFFS) removeSmokePuff(0);
  }

  function reserveSmokePuffSlots(count) {
    reserveEffectSlots(state.smokePuffs, MAX_SMOKE_PUFFS, releaseSmokePuffEntry, count);
  }

  function reserveLightFlashSlot() {
    if (state.lightFlashes.length >= MAX_LIGHT_FLASHES) removeLightFlash(0);
  }

  function reserveDecalSlot() {
    if (state.decals.length >= MAX_DECALS) removeDecal(0);
  }

  function reserveDebrisSlot() {
    if (state.debris.length >= MAX_DEBRIS) removeDebris(0);
  }

  function reserveDebrisSlots(count) {
    reserveEffectSlots(state.debris, MAX_DEBRIS, releaseDebrisEntry, count);
  }

  function reserveXpOrbSlot() {
    if (state.xpOrbs.length >= MAX_XP_ORBS) removeXpOrb(0);
  }

  function reserveXpOrbSlots(count) {
    reserveEffectSlots(state.xpOrbs, MAX_XP_ORBS, releaseXpOrbEntry, count);
  }

  function reserveDecalSlots(count) {
    reserveEffectSlots(state.decals, MAX_DECALS, releaseDecalEntry, count);
  }

  function updateWaveProgress(dt) {
    if (state.waveSuspended) return;
    state.waveElapsed += dt;
    if (state.waveElapsed + 0.0001 >= WAVE_HARD_LIMIT) {
      startWave(state.wave + 1);
      return;
    }

    var remaining = getWaveRemainingCount();
    if (remaining <= 0) {
      state.waveLowRemainingTimer = 0;
      if (state.nextWaveTimer <= 0) {
        state.nextWaveTimer = WAVE_CLEAR_DELAY;
        return;
      }
      state.nextWaveTimer -= dt;
      if (state.nextWaveTimer <= 0) {
        startWave(state.wave + 1);
      }
      return;
    }

    state.nextWaveTimer = 0;
    if (isWaveLowOnRemainingEnemies(remaining)) {
      if (state.waveLowRemainingTimer <= 0) state.waveLowRemainingTimer = WAVE_LOW_REMAINING_DELAY;
      state.waveLowRemainingTimer -= dt;
      if (state.waveLowRemainingTimer <= 0) {
        startWave(state.wave + 1);
      }
      return;
    }

    state.waveLowRemainingTimer = 0;
  }

  function getWaveRemainingCount() {
    return Math.max(0, state.spawnLeft || 0) + state.enemies.length;
  }

  function isWaveLowOnRemainingEnemies(remaining) {
    var target = Math.max(1, state.waveSpawnTarget || getWaveZombieCount(state.wave));
    return remaining < WAVE_LOW_REMAINING_COUNT || remaining < target * WAVE_LOW_REMAINING_RATIO;
  }

  function endGame() {
    state.mode = "gameover";
    pointerDown = false;
    resetTouchControls();
    syncMusicForMode();
    setPanel(gameOverPanel, true);
    setPanel(classChoicePanel, false);
    setPanel(revolverUpgradePanel, false);
    setPanel(rifleUpgradePanel, false);
    setPanel(launcherUpgradePanel, false);
    setPanel(marshalUpgradePanel, false);
    setPanel(levelUpPanel, false);
    gameOverStats.textContent = "Wave " + state.wave + " - Level " + state.level + " - Score " + state.score + " - Zombies " + state.kills;
    updateHud();
  }

  function spawnParticle(x, y, z, vx, vy, vz, life, size, mat, reserved) {
    if (gameplayWarmupMode) {
      var warmupVisual = acquireParticleVisual("box", x, y, z, size, mat);
      releaseParticleVisual(warmupVisual);
      return;
    }
    if (!reserved || state.particles.length >= MAX_PARTICLES) reserveParticleSlot();
    var visual = acquireParticleVisual("box", x, y, z, size, mat);
    var particle = {
      x: x,
      y: y,
      z: z,
      vx: vx,
      vy: vy,
      vz: vz,
      life: life,
      startLife: life,
      startScale: size,
      visual: visual,
      mesh: visual.batch ? visual.batch.mesh : null,
    };
    visual.particle = particle;
    state.particles.push(particle);
  }

  function spawnSlimeParticle(x, y, z, vx, vy, vz, life, size, mat, reserved) {
    if (gameplayWarmupMode) {
      var warmupVisual = acquireParticleVisual("sphere", x, y, z, size, mat);
      releaseParticleVisual(warmupVisual);
      return;
    }
    if (!reserved || state.particles.length >= MAX_PARTICLES) reserveParticleSlot();
    var visual = acquireParticleVisual("sphere", x, y, z, size, mat);
    var particle = {
      x: x,
      y: y,
      z: z,
      vx: vx,
      vy: vy,
      vz: vz,
      life: life,
      startLife: life,
      startScale: size,
      visual: visual,
      mesh: visual.batch ? visual.batch.mesh : null,
    };
    visual.particle = particle;
    state.particles.push(particle);
  }

  function spawnXpOrb(x, z, value, reserved) {
    var amount = Math.max(1, Math.round(Number(value) || 1));
    var coreScale = amount >= 12 ? 0.31 : 0.24;
    var glintScale = amount >= 12 ? 0.14 : 0.105;
    if (gameplayWarmupMode) {
      warmupXpOrbVisual(x, z, coreScale, glintScale);
      return;
    }
    if (!reserved || state.xpOrbs.length >= MAX_XP_ORBS) reserveXpOrbSlot();
    var visual = acquireXpOrbVisual(x, z, coreScale, glintScale);
    var group = visual.group;
    state.xpOrbs.push({
      x: group.position.x,
      y: group.position.y,
      z: group.position.z,
      vx: rand(-0.8, 0.8),
      vz: rand(-0.8, 0.8),
      value: amount,
      age: 0,
      phase: rand(0, Math.PI * 2),
      visual: visual,
      mesh: group,
      core: visual.core,
      glint: visual.glint,
      visualScale: coreScale,
    });
  }

  function updateXpOrbs(dt) {
    if (!state.player) return;
    for (var i = state.xpOrbs.length - 1; i >= 0; i--) {
      var orb = state.xpOrbs[i];
      orb.age += dt;
      var dx = state.player.x - orb.x;
      var dz = state.player.z - orb.z;
      var dist = Math.hypot(dx, dz);
      var pickupRadius = getXpPickupRadius();
      var attractRadius = getXpAttractRadius();
      if (dist <= pickupRadius) {
        collectXpOrb(i);
        continue;
      }
      if (dist <= attractRadius) {
        var pull = 1 - dist / attractRadius;
        var speed = XP_ORB_SPEED * (0.45 + pull * 1.8);
        var len = Math.max(0.001, dist);
        orb.vx += (dx / len) * speed * dt * 5.2;
        orb.vz += (dz / len) * speed * dt * 5.2;
      } else {
        orb.vx *= Math.max(0, 1 - dt * 1.8);
        orb.vz *= Math.max(0, 1 - dt * 1.8);
      }
      var maxSpeed = XP_ORB_SPEED * 1.7;
      var moveSpeed = Math.hypot(orb.vx, orb.vz);
      if (moveSpeed > maxSpeed) {
        orb.vx = (orb.vx / moveSpeed) * maxSpeed;
        orb.vz = (orb.vz / moveSpeed) * maxSpeed;
      }
      orb.x += orb.vx * dt;
      orb.z += orb.vz * dt;
      orb.y = 0.5 + Math.sin(orb.age * 5.5 + orb.phase) * 0.1;
      orb.mesh.position.set(orb.x, orb.y, orb.z);
      orb.mesh.rotation.y += dt * 2.6;
      orb.mesh.rotation.z += dt * 1.4;
      var pulse = 1 + Math.sin(orb.age * 8 + orb.phase) * 0.08;
      scaleFromBase(orb.core, pulse, pulse, pulse);
      scaleFromBase(orb.glint, 1.1 - pulse * 0.12, 1.1 - pulse * 0.12, 1.1 - pulse * 0.12);
    }
  }

  function collectXpOrb(index) {
    var orb = state.xpOrbs[index];
    if (!orb) return;
    addXp(orb.value, orb.x, orb.z);
    removeXpOrb(index);
  }

  function addXp(amount, x, z) {
    var gained = Math.max(0, Math.round((Number(amount) || 0) * getXpGainMultiplier()));
    if (!gained) return;
    state.xp += gained;
    state.totalXp += gained;
    var leveled = false;
    while (state.xp >= state.xpToNext) {
      state.xp -= state.xpToNext;
      state.level += 1;
      state.levelUps += 1;
      state.xpToNext = getXpToNextLevel(state.level);
      queueStandardUpgradeLevel(state.level);
      leveled = true;
    }
    if (leveled) addLevelUpBurst(x, z);
    maybeOfferNextLevelReward();
    updateHud();
  }

  function getXpGainMultiplier() {
    return 1 + Math.max(0, state.xpGainBonus || 0);
  }

  function getXpPickupRadius() {
    return XP_PICKUP_RADIUS * (1 + Math.max(0, state.xpPickupRadiusBonus || 0));
  }

  function getXpAttractRadius() {
    return XP_ATTRACT_RADIUS * (1 + Math.max(0, state.xpPickupRadiusBonus || 0));
  }

  function maybeOfferNextLevelReward() {
    return (
      maybeOfferClassChoice() ||
      maybeOfferRevolverUpgradeChoice() ||
      maybeOfferRifleUpgradeChoice() ||
      maybeOfferLauncherUpgradeChoice() ||
      maybeOfferMarshalUpgradeChoice() ||
      maybeOfferStandardUpgradeChoice()
    );
  }

  function queueStandardUpgradeLevel(level) {
    if (!isStandardUpgradeLevel(level)) return;
    if (state.pendingStandardUpgradeLevels.indexOf(level) !== -1) return;
    var inserted = false;
    for (var i = 0; i < state.pendingStandardUpgradeLevels.length; i++) {
      if (level < state.pendingStandardUpgradeLevels[i]) {
        state.pendingStandardUpgradeLevels.splice(i, 0, level);
        inserted = true;
        break;
      }
    }
    if (!inserted) state.pendingStandardUpgradeLevels.push(level);
  }

  function isStandardUpgradeLevel(level) {
    if (level <= 1 || level === CLASS_CHOICE_LEVEL) return false;
    if (level === REVOLVER_UPGRADE_LEVEL && (state.playerClass === "gunslinger" || !state.playerClass)) return false;
    if (level === RIFLE_UPGRADE_LEVEL && (state.playerClass === "ranger" || !state.playerClass)) return false;
    if (level === LAUNCHER_UPGRADE_LEVEL && (state.playerClass === "demolitionist" || !state.playerClass)) return false;
    if (level === MARSHAL_UPGRADE_LEVEL && (state.playerClass === "marshal" || !state.playerClass)) return false;
    return true;
  }

  function maybeOfferClassChoice() {
    if (state.playerClass || state.classChoicePending || state.classChoiceOffered) return false;
    if (state.level < CLASS_CHOICE_LEVEL || state.mode !== "playing") return false;
    state.classChoicePending = true;
    state.classChoiceOffered = true;
    state.mode = "class-choice";
    pointerDown = false;
    touchFire.active = false;
    if (mobileFire) mobileFire.classList.remove("is-pressed");
    setPanel(classChoicePanel, true);
    alignClassWeaponIcons(classChoicePanel);
    setPanel(menu, false);
    setPanel(gameOverPanel, false);
    setPanel(revolverUpgradePanel, false);
    setPanel(rifleUpgradePanel, false);
    setPanel(launcherUpgradePanel, false);
    setPanel(marshalUpgradePanel, false);
    setPanel(levelUpPanel, false);
    updateModeClass();
    render();
    return true;
  }

  function maybeOfferRevolverUpgradeChoice() {
    if (state.playerClass !== "gunslinger" || state.revolverUpgrade || state.revolverUpgradePending || state.revolverUpgradeOffered) return false;
    if (state.level < REVOLVER_UPGRADE_LEVEL || state.mode !== "playing") return false;
    state.revolverUpgradePending = true;
    state.revolverUpgradeOffered = true;
    state.mode = "revolver-upgrade";
    pointerDown = false;
    touchFire.active = false;
    if (mobileFire) mobileFire.classList.remove("is-pressed");
    setPanel(revolverUpgradePanel, true);
    alignClassWeaponIcons(revolverUpgradePanel);
    setPanel(menu, false);
    setPanel(gameOverPanel, false);
    setPanel(classChoicePanel, false);
    setPanel(rifleUpgradePanel, false);
    setPanel(launcherUpgradePanel, false);
    setPanel(marshalUpgradePanel, false);
    setPanel(levelUpPanel, false);
    updateModeClass();
    render();
    return true;
  }

  function maybeOfferRifleUpgradeChoice() {
    if (state.playerClass !== "ranger" || state.rifleUpgrade || state.rifleUpgradePending || state.rifleUpgradeOffered) return false;
    if (state.level < RIFLE_UPGRADE_LEVEL || state.mode !== "playing") return false;
    state.rifleUpgradePending = true;
    state.rifleUpgradeOffered = true;
    state.mode = "rifle-upgrade";
    pointerDown = false;
    touchFire.active = false;
    if (mobileFire) mobileFire.classList.remove("is-pressed");
    setPanel(rifleUpgradePanel, true);
    alignClassWeaponIcons(rifleUpgradePanel);
    setPanel(menu, false);
    setPanel(gameOverPanel, false);
    setPanel(classChoicePanel, false);
    setPanel(revolverUpgradePanel, false);
    setPanel(levelUpPanel, false);
    setPanel(launcherUpgradePanel, false);
    setPanel(marshalUpgradePanel, false);
    updateModeClass();
    render();
    return true;
  }

  function maybeOfferLauncherUpgradeChoice() {
    if (state.playerClass !== "demolitionist" || state.launcherUpgrade || state.launcherUpgradePending || state.launcherUpgradeOffered) return false;
    if (state.level < LAUNCHER_UPGRADE_LEVEL || state.mode !== "playing") return false;
    state.launcherUpgradePending = true;
    state.launcherUpgradeOffered = true;
    state.mode = "launcher-upgrade";
    pointerDown = false;
    touchFire.active = false;
    if (mobileFire) mobileFire.classList.remove("is-pressed");
    setPanel(launcherUpgradePanel, true);
    alignClassWeaponIcons(launcherUpgradePanel);
    setPanel(menu, false);
    setPanel(gameOverPanel, false);
    setPanel(classChoicePanel, false);
    setPanel(revolverUpgradePanel, false);
    setPanel(rifleUpgradePanel, false);
    setPanel(levelUpPanel, false);
    setPanel(marshalUpgradePanel, false);
    updateModeClass();
    render();
    return true;
  }

  function maybeOfferMarshalUpgradeChoice() {
    if (state.playerClass !== "marshal" || state.marshalUpgrade || state.marshalUpgradePending || state.marshalUpgradeOffered) return false;
    if (state.level < MARSHAL_UPGRADE_LEVEL || state.mode !== "playing") return false;
    state.marshalUpgradePending = true;
    state.marshalUpgradeOffered = true;
    state.mode = "marshal-upgrade";
    pointerDown = false;
    touchFire.active = false;
    if (mobileFire) mobileFire.classList.remove("is-pressed");
    setPanel(marshalUpgradePanel, true);
    alignClassWeaponIcons(marshalUpgradePanel);
    setPanel(menu, false);
    setPanel(gameOverPanel, false);
    setPanel(classChoicePanel, false);
    setPanel(revolverUpgradePanel, false);
    setPanel(rifleUpgradePanel, false);
    setPanel(launcherUpgradePanel, false);
    setPanel(levelUpPanel, false);
    updateModeClass();
    render();
    return true;
  }

  function maybeOfferStandardUpgradeChoice() {
    if (state.standardUpgradePending || !state.pendingStandardUpgradeLevels.length) return false;
    if (state.mode !== "playing" || !levelUpPanel || !levelUpOptions) return false;
    state.standardUpgradePending = true;
    state.standardUpgradeLevel = state.pendingStandardUpgradeLevels[0];
    state.standardUpgradeChoices = rollStandardUpgradeChoices();
    state.mode = "level-up";
    pointerDown = false;
    touchFire.active = false;
    if (mobileFire) mobileFire.classList.remove("is-pressed");
    renderStandardUpgradeChoices();
    setPanel(levelUpPanel, true);
    setPanel(menu, false);
    setPanel(gameOverPanel, false);
    setPanel(classChoicePanel, false);
    setPanel(revolverUpgradePanel, false);
    setPanel(rifleUpgradePanel, false);
    setPanel(launcherUpgradePanel, false);
    setPanel(marshalUpgradePanel, false);
    updateModeClass();
    render();
    return true;
  }

  function rollStandardUpgradeChoices() {
    var choices = [];
    if (isRevolverSpecialUpgradeLevel(state.standardUpgradeLevel)) {
      choices = choices.concat(rollFromPool(getEligibleRevolverSpecialUpgrades(state.standardUpgradeLevel), 2));
    } else if (isRifleSpecialUpgradeLevel(state.standardUpgradeLevel)) {
      choices = choices.concat(rollFromPool(getEligibleRifleSpecialUpgrades(state.standardUpgradeLevel), 2));
    } else if (isLauncherSpecialUpgradeLevel(state.standardUpgradeLevel)) {
      choices = choices.concat(rollFromPool(getEligibleLauncherSpecialUpgrades(state.standardUpgradeLevel), 2));
    } else if (isMarshalSpecialUpgradeLevel(state.standardUpgradeLevel)) {
      choices = choices.concat(rollMarshalSpecialUpgradeChoices(state.standardUpgradeLevel));
    }
    return choices.concat(rollFromPool(STANDARD_UPGRADES, 3 - choices.length));
  }

  function rollFromPool(source, count) {
    var pool = source.slice();
    var choices = [];
    while (pool.length && choices.length < count) {
      var index = Math.floor(rng() * pool.length);
      choices.push(pool.splice(index, 1)[0]);
    }
    return choices;
  }

  function isRevolverSpecialUpgradeLevel(level) {
    return (
      state.playerClass === "gunslinger" &&
      !!state.revolverUpgrade &&
      level >= REVOLVER_SPECIAL_START_LEVEL &&
      (level - REVOLVER_UPGRADE_LEVEL) % REVOLVER_SPECIAL_INTERVAL === 0
    );
  }

  function getEligibleRevolverSpecialUpgrades(level) {
    return REVOLVER_SPECIAL_UPGRADES.filter(function (spec) {
      if (spec.branch !== state.revolverUpgrade) return false;
      if (spec.minLevel && level < spec.minLevel) return false;
      if (!spec.repeatable && hasUpgrade(spec.id)) return false;
      if (spec.maxStacks && getUpgradeCount(spec.id) >= spec.maxStacks) return false;
      if (spec.id === "quickerTrail" && getRifleAutoTrapInterval() <= RIFLE_AUTO_TRAP_MIN_INTERVAL + 0.001) return false;
      if (spec.requires) {
        for (var i = 0; i < spec.requires.length; i++) {
          if (!hasUpgrade(spec.requires[i])) return false;
        }
      }
      return true;
    });
  }

  function isRifleSpecialUpgradeLevel(level) {
    return (
      state.playerClass === "ranger" &&
      !!state.rifleUpgrade &&
      level >= RIFLE_SPECIAL_START_LEVEL &&
      (level - RIFLE_UPGRADE_LEVEL) % RIFLE_SPECIAL_INTERVAL === 0
    );
  }

  function getEligibleRifleSpecialUpgrades(level) {
    return RIFLE_SPECIAL_UPGRADES.filter(function (spec) {
      if (spec.branch !== state.rifleUpgrade) return false;
      if (spec.minLevel && level < spec.minLevel) return false;
      if (!spec.repeatable && hasUpgrade(spec.id)) return false;
      if (spec.maxStacks && getUpgradeCount(spec.id) >= spec.maxStacks) return false;
      if (spec.requires) {
        for (var i = 0; i < spec.requires.length; i++) {
          if (!hasUpgrade(spec.requires[i])) return false;
        }
      }
      return true;
    });
  }

  function isLauncherSpecialUpgradeLevel(level) {
    return (
      state.playerClass === "demolitionist" &&
      !!state.launcherUpgrade &&
      level >= LAUNCHER_SPECIAL_START_LEVEL &&
      (level - LAUNCHER_UPGRADE_LEVEL) % LAUNCHER_SPECIAL_INTERVAL === 0
    );
  }

  function getEligibleLauncherSpecialUpgrades(level) {
    return LAUNCHER_SPECIAL_UPGRADES.filter(function (spec) {
      if (spec.starter) return false;
      if (spec.branch !== state.launcherUpgrade) return false;
      if (spec.minLevel && level < spec.minLevel) return false;
      if (!spec.repeatable && hasUpgrade(spec.id)) return false;
      if (spec.maxStacks && getUpgradeCount(spec.id) >= spec.maxStacks) return false;
      if (spec.requires) {
        for (var i = 0; i < spec.requires.length; i++) {
          if (!hasLauncherUpgradeOrStarter(spec.requires[i])) return false;
        }
      }
      if (spec.requiresAny) {
        var any = false;
        for (var j = 0; j < spec.requiresAny.length; j++) {
          if (hasLauncherUpgradeOrStarter(spec.requiresAny[j])) any = true;
        }
        if (!any) return false;
      }
      return true;
    });
  }

  function isMarshalSpecialUpgradeLevel(level) {
    return (
      state.playerClass === "marshal" &&
      !!state.marshalUpgrade &&
      level >= MARSHAL_SPECIAL_START_LEVEL &&
      (level - MARSHAL_UPGRADE_LEVEL) % MARSHAL_SPECIAL_INTERVAL === 0
    );
  }

  function getEligibleMarshalSpecialUpgrades(level) {
    return MARSHAL_SPECIAL_UPGRADES.filter(function (spec) {
      if (spec.branch !== state.marshalUpgrade) return false;
      if (level === MARSHAL_SPECIAL_START_LEVEL && !spec.starter) return false;
      if (spec.minLevel && level < spec.minLevel) return false;
      if (!spec.repeatable && hasUpgrade(spec.id)) return false;
      if (spec.maxStacks && getUpgradeCount(spec.id) >= spec.maxStacks) return false;
      if (spec.requires) {
        for (var i = 0; i < spec.requires.length; i++) {
          if (!hasUpgrade(spec.requires[i])) return false;
        }
      }
      if (spec.requiresAny) {
        var any = false;
        for (var j = 0; j < spec.requiresAny.length; j++) {
          if (hasUpgrade(spec.requiresAny[j])) any = true;
        }
        if (!any) return false;
      }
      return true;
    });
  }

  function rollMarshalSpecialUpgradeChoices(level) {
    var choices = rollFromPool(getEligibleMarshalSpecialUpgrades(level), 2);
    if (choices.length >= 2) return choices;
    var used = {};
    for (var i = 0; i < choices.length; i++) used[choices[i].id] = true;
    var fallback = getMarshalMasteryFallbackUpgrades().filter(function (spec) {
      return !used[spec.id];
    });
    return choices.concat(rollFromPool(fallback, 2 - choices.length));
  }

  function getMarshalMasteryFallbackUpgrades() {
    var ids = MARSHAL_MASTERY_UPGRADE_IDS[state.marshalUpgrade] || [];
    var titles = {
      packedBuckshot: "Packed Mastery",
      hardCast: "Hard Cast Mastery",
      fineChoke: "Choke Mastery",
      sanctifiedLead: "Sanctified Mastery",
    };
    return ids.map(function (id) {
      var base = getStandardUpgradeById(id);
      return Object.assign({}, base, {
        title: titles[id] || base.title + " Mastery",
        description: "Beyond the cap: +3% Coach Gun damage.",
        repeatable: true,
        maxStacks: null,
        masteryFallback: true,
      });
    });
  }

  function getMarshalMasteryStackCount() {
    return (
      Math.max(0, getUpgradeCount("packedBuckshot") - 4) +
      Math.max(0, getUpgradeCount("hardCast") - 5) +
      Math.max(0, getUpgradeCount("fineChoke") - 5) +
      Math.max(0, getUpgradeCount("sanctifiedLead") - 5)
    );
  }

  function getMarshalMasteryDamageMultiplier() {
    return 1 + getMarshalMasteryStackCount() * MARSHAL_MASTERY_DAMAGE_PER_STACK;
  }

  function renderStandardUpgradeChoices() {
    if (!levelUpOptions) return;
    levelUpOptions.innerHTML = "";
    if (levelUpSubtitle) levelUpSubtitle.textContent = "Level " + state.standardUpgradeLevel + ". Pick a boost for this run.";
    state.standardUpgradeChoices.forEach(function (spec) {
      levelUpOptions.appendChild(createStandardUpgradeCard(spec));
    });
  }

  function upgradeIcon(inner) {
    return (
      '<svg class="upgrade-card__icon" viewBox="0 0 64 64" focusable="false" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="3.8" stroke-linecap="round" stroke-linejoin="round">' +
      inner +
      "</svg>"
    );
  }

  function getUpgradeIcon(id) {
    return UPGRADE_ICONS[id] || UPGRADE_ICONS.default;
  }

  function createStandardUpgradeCard(spec) {
    var button = document.createElement("button");
    button.className = "class-card upgrade-card class-card--" + (spec.color === "red" ? "red" : "black");
    if (isSpecialUpgradeSpec(spec)) button.classList.add("upgrade-card--special");
    button.type = "button";
    button.setAttribute("data-standard-upgrade", spec.id);
    button.setAttribute("data-upgrade-kind", isSpecialUpgradeSpec(spec) ? "special" : "standard");
    button.setAttribute("data-rank", spec.rank);
    button.setAttribute("data-suit", { D: "♦", H: "♥", S: "♠", C: "♣" }[spec.suit] || spec.suit);

    var mark = document.createElement("span");
    mark.className = "class-card__mark";
    mark.setAttribute("aria-hidden", "true");
    var symbol = document.createElement("span");
    symbol.className = "upgrade-card__symbol";
    symbol.innerHTML = getUpgradeIcon(spec.id);
    mark.appendChild(symbol);

    var title = document.createElement("strong");
    if (spec.subtitle) {
      title.appendChild(document.createTextNode(spec.title));
      var titleSubtitle = document.createElement("span");
      titleSubtitle.className = "upgrade-card__subtitle";
      titleSubtitle.textContent = spec.subtitle;
      title.appendChild(titleSubtitle);
    } else {
      title.textContent = spec.title;
    }
    var description = document.createElement("span");
    description.textContent = spec.description;
    button.appendChild(mark);
    button.appendChild(title);
    button.appendChild(description);
    return button;
  }

  function isSpecialUpgradeSpec(spec) {
    return !!(spec && spec.branch);
  }

  function getStandardUpgradeById(id) {
    for (var i = 0; i < STANDARD_UPGRADES.length; i++) {
      if (STANDARD_UPGRADES[i].id === id) return STANDARD_UPGRADES[i];
    }
    for (var j = 0; j < REVOLVER_SPECIAL_UPGRADES.length; j++) {
      if (REVOLVER_SPECIAL_UPGRADES[j].id === id) return REVOLVER_SPECIAL_UPGRADES[j];
    }
    for (var k = 0; k < RIFLE_SPECIAL_UPGRADES.length; k++) {
      if (RIFLE_SPECIAL_UPGRADES[k].id === id) return RIFLE_SPECIAL_UPGRADES[k];
    }
    for (var l = 0; l < LAUNCHER_SPECIAL_UPGRADES.length; l++) {
      if (LAUNCHER_SPECIAL_UPGRADES[l].id === id) return LAUNCHER_SPECIAL_UPGRADES[l];
    }
    for (var m = 0; m < MARSHAL_SPECIAL_UPGRADES.length; m++) {
      if (MARSHAL_SPECIAL_UPGRADES[m].id === id) return MARSHAL_SPECIAL_UPGRADES[m];
    }
    return null;
  }

  function hasUpgrade(id) {
    return (state.upgradeCounts[id] || 0) > 0;
  }

  function getUpgradeCount(id) {
    return state.upgradeCounts[id] || 0;
  }

  function choosePlayerClass(id) {
    var spec = PLAYER_CLASSES[id];
    if (!spec || state.playerClass || state.level < CLASS_CHOICE_LEVEL) return false;
    state.playerClass = spec.id;
    state.classChoicePending = false;
    state.classChoiceOffered = true;
    state.revolverDamageMultiplier = spec.revolverDamageMultiplier || 1;
    state.revolverAmmoPickupBonus = spec.revolverAmmoPickupBonus || 0;
    state.mode = "playing";
    setPanel(classChoicePanel, false);
    setPanel(revolverUpgradePanel, false);
    setPanel(rifleUpgradePanel, false);
    setPanel(launcherUpgradePanel, false);
    setPanel(marshalUpgradePanel, false);
    updateModeClass();
    grantWeapon(spec.weapon, true);
    spawnClassChoiceBurst(spec.id);
    maybeOfferNextLevelReward();
    updateHud();
    render();
    return true;
  }

  function chooseRevolverUpgrade(id) {
    var spec = REVOLVER_UPGRADES[id];
    if (!spec || state.playerClass !== "gunslinger" || state.revolverUpgrade || state.level < REVOLVER_UPGRADE_LEVEL) return false;
    var previousMagazine = getWeaponMagazine(WEAPONS.revolver);
    state.revolverUpgrade = spec.id;
    state.revolverUpgradePending = false;
    state.revolverUpgradeOffered = true;
    state.revolverDamageMultiplier = spec.revolverDamageMultiplier || state.revolverDamageMultiplier || 1;
    state.revolverMagazineBonus = spec.revolverMagazineBonus || 0;
    state.revolverAmmoPickupBonus = spec.revolverAmmoPickupBonus || state.revolverAmmoPickupBonus || 0;
    resizeWeaponAmmo("revolver", previousMagazine, getWeaponMagazine(WEAPONS.revolver));
    state.ammoReserve.revolver = Math.max(0, state.ammoReserve.revolver || 0) + (spec.revolverReserveBonus || 0);
    state.mode = "playing";
    setPanel(revolverUpgradePanel, false);
    setPanel(rifleUpgradePanel, false);
    setPanel(launcherUpgradePanel, false);
    setPanel(marshalUpgradePanel, false);
    updateModeClass();
    setWeaponVisual("revolver");
    spawnRevolverUpgradeBurst(spec.id);
    maybeOfferNextLevelReward();
    updateHud();
    render();
    return true;
  }

  function chooseRifleUpgrade(id) {
    var spec = RIFLE_UPGRADES[id];
    if (!spec || state.playerClass !== "ranger" || state.rifleUpgrade || state.level < RIFLE_UPGRADE_LEVEL) return false;
    state.rifleUpgrade = spec.id;
    state.rifleUpgradePending = false;
    state.rifleUpgradeOffered = true;
    state.rifleAmmoPickupBonus = spec.rifleAmmoPickupBonus || 0;
    if (spec.id === "trailWarden") prewarmTrailWardenTrapVisuals();
    state.mode = "playing";
    setPanel(rifleUpgradePanel, false);
    setPanel(launcherUpgradePanel, false);
    setPanel(marshalUpgradePanel, false);
    updateModeClass();
    spawnRifleUpgradeBurst(spec.id);
    maybeOfferNextLevelReward();
    updateHud();
    render();
    return true;
  }

  function chooseLauncherUpgrade(id) {
    var spec = LAUNCHER_UPGRADES[id];
    if (!spec || state.playerClass !== "demolitionist" || state.launcherUpgrade || state.level < LAUNCHER_UPGRADE_LEVEL) return false;
    var previousMagazine = getWeaponMagazine(WEAPONS.launcher);
    state.launcherUpgrade = spec.id;
    state.launcherUpgradePending = false;
    state.launcherUpgradeOffered = true;
    state.launcherMagazineMultiplier = spec.launcherMagazineMultiplier || 1;
    resizeWeaponAmmo("launcher", previousMagazine, getWeaponMagazine(WEAPONS.launcher));
    if (spec.id === "pyrotechnician") state.launcherFireAmmoAccumulator = 0;
    if (spec.id === "bombardier") {
      requestLauncherCascadeWarmup();
      requestLauncherShrapnelResourceWarmup();
    }
    state.mode = "playing";
    setPanel(launcherUpgradePanel, false);
    setPanel(marshalUpgradePanel, false);
    updateModeClass();
    spawnLauncherUpgradeBurst(spec.id);
    maybeOfferNextLevelReward();
    updateHud();
    render();
    return true;
  }

  function chooseMarshalUpgrade(id) {
    var spec = MARSHAL_UPGRADES[id];
    if (!spec || state.playerClass !== "marshal" || state.marshalUpgrade || state.level < MARSHAL_UPGRADE_LEVEL) return false;
    state.marshalUpgrade = spec.id;
    state.marshalUpgradePending = false;
    state.marshalUpgradeOffered = true;
    state.marshalBountyTimer = 12;
    state.mode = "playing";
    setPanel(marshalUpgradePanel, false);
    setPanel(revolverUpgradePanel, false);
    setPanel(rifleUpgradePanel, false);
    setPanel(launcherUpgradePanel, false);
    updateModeClass();
    setWeaponVisual("coachGun");
    spawnMarshalUpgradeBurst(spec.id);
    maybeOfferNextLevelReward();
    updateHud();
    render();
    return true;
  }

  function chooseStandardUpgrade(id) {
    if (!state.standardUpgradePending || state.mode !== "level-up") return false;
    var available = state.standardUpgradeChoices.some(function (spec) {
      return spec.id === id;
    });
    if (!available) return false;
    var spec = getStandardUpgradeById(id);
    if (!spec) return false;
    applyStandardUpgrade(spec);
    state.standardUpgradePending = false;
    state.standardUpgradeChoices = [];
    state.standardUpgradeLevel = 0;
    state.pendingStandardUpgradeLevels.shift();
    state.mode = "playing";
    setPanel(levelUpPanel, false);
    setPanel(rifleUpgradePanel, false);
    setPanel(launcherUpgradePanel, false);
    setPanel(marshalUpgradePanel, false);
    updateModeClass();
    spawnStandardUpgradeBurst(spec);
    maybeOfferNextLevelReward();
    updateHud();
    render();
    return true;
  }

  function applyStandardUpgrade(spec) {
    state.upgradeCounts[spec.id] = (state.upgradeCounts[spec.id] || 0) + 1;
    state.standardUpgradesChosen += 1;
    if (spec.id === "silverBullet") state.bigIronShotsFired = 0;
    if (spec.id === "silverCache") state.silverBulletAmmoKills = 0;
    if (spec.id === "duelistFocus") state.duelistFocus = 0;
    if (spec.id === "allRightAllLeft") activateAllRightAllLeft();
    if (spec.id === "chainDetonation") state.launcherChainDetonations = 0;
    if (spec.id === "fireproofPowder") state.launcherFireAmmoAccumulator = 0;
    if (spec.id === "heavensBounty") state.marshalBountyTimer = Math.min(state.marshalBountyTimer || 12, 1.5);
    if (spec.id === "madmansJourney") {
      state.launcherMadmanStacks = 0;
      state.launcherMadmanTriggers = 0;
    }
    if (
      state.launcherUpgrade === "bombardier" &&
      (spec.id === "clusterCharge" ||
        spec.id === "moreBomblets" ||
        spec.id === "chainDetonation" ||
        spec.id === "moreChainDetonations" ||
        spec.id === "shrapnelRain" ||
        spec.id === "powderEcho" ||
        spec.id === "madmansJourney")
    ) {
      requestLauncherShrapnelResourceWarmup();
    }
    if (typeof spec.apply === "function") spec.apply();
  }

  function forceStandardUpgradeForTest(id) {
    if (state.mode === "playing") maybeOfferNextLevelReward();
    if (!state.standardUpgradePending || state.mode !== "level-up") return false;
    var spec = getStandardUpgradeById(id) || state.standardUpgradeChoices[0];
    if (!spec) return false;
    applyStandardUpgrade(spec);
    state.standardUpgradePending = false;
    state.standardUpgradeChoices = [];
    state.standardUpgradeLevel = 0;
    state.pendingStandardUpgradeLevels.shift();
    state.mode = "playing";
    setPanel(levelUpPanel, false);
    setPanel(rifleUpgradePanel, false);
    setPanel(launcherUpgradePanel, false);
    setPanel(marshalUpgradePanel, false);
    updateModeClass();
    maybeOfferNextLevelReward();
    updateHud();
    render();
    return true;
  }

  function resizeWeaponAmmo(id, previousMagazine, nextMagazine) {
    if (nextMagazine > previousMagazine) {
      state.ammo[id] = Math.min(nextMagazine, Math.max(0, state.ammo[id] || 0) + (nextMagazine - previousMagazine));
    } else {
      state.ammo[id] = Math.min(nextMagazine, Math.max(0, state.ammo[id] || 0));
    }
    state.reloadTimers[id] = 0;
  }

  function grantWeapon(id, select) {
    var weapon = WEAPONS[id];
    if (!weapon) return false;
    var magazine = getWeaponMagazine(weapon);
    state.ownedWeapons[id] = true;
    state.ammo[id] = Math.max(state.ammo[id] || 0, magazine);
    state.ammoReserve[id] = Math.max(state.ammoReserve[id] || 0, Math.max(0, (weapon.reserveStart || 0) - magazine));
    state.reloadTimers[id] = 0;
    if (select) return selectWeapon(id);
    return true;
  }

  function selectWeapon(id) {
    var weapon = WEAPONS[id];
    if (!weapon || state.mode !== "playing" || !state.ownedWeapons[id]) return false;
    state.weapon = id;
    if (state.player) state.player.weapon = id;
    if ((state.ammo[id] || 0) <= 0) startReload(id);
    setWeaponVisual(id);
    if (id === "launcher") {
      warmupGameplayEffectResources();
      warmupLauncherExplosionAudioGraph();
    }
    updateHud();
    return true;
  }

  function getWeaponDamage(weapon) {
    if (!weapon) return 0;
    var damage = weapon.id === "revolver" ? weapon.damage * (state.revolverDamageMultiplier || 1) : weapon.damage;
    if (weapon.id === "coachGun") damage *= getMarshalMasteryDamageMultiplier();
    return damage * (1 + Math.max(0, state.globalDamageBonus || 0));
  }

  function spawnClassChoiceBurst(classId) {
    if (!state.player) return;
    var color = classId === "demolitionist" ? 0xff8b35 : classId === "marshal" ? 0xffd99a : classId === "ranger" ? 0xffd66d : 0x87eaff;
    addShockwave(state.player.x, state.player.z, 3.2, 0.46, color);
    addLightFlash(state.player.x, 1.5, state.player.z, color, 3.2, 7, 0.24);
    spawnPurchaseBurst();
  }

  function spawnRevolverUpgradeBurst(upgradeId) {
    if (!state.player) return;
    var color = upgradeId === "bigIron" ? 0xffc44d : 0xff7b73;
    addShockwave(state.player.x, state.player.z, 3.6, 0.48, color);
    addLightFlash(state.player.x, 1.5, state.player.z, color, 3.5, 7.5, 0.25);
    spawnPurchaseBurst();
  }

  function spawnRifleUpgradeBurst(upgradeId) {
    if (!state.player) return;
    var color = upgradeId === "trailWarden" ? 0xffd36b : 0x86f3ff;
    addShockwave(state.player.x, state.player.z, 3.4, 0.46, color);
    addLightFlash(state.player.x, 1.5, state.player.z, color, 3.4, 7.2, 0.24);
    spawnPurchaseBurst();
  }

  function spawnLauncherUpgradeBurst(upgradeId) {
    if (!state.player) return;
    var color = upgradeId === "pyrotechnician" ? 0xff6a16 : 0xffc45f;
    addShockwave(state.player.x, state.player.z, 3.6, 0.48, color);
    addLightFlash(state.player.x, 1.5, state.player.z, color, 3.7, 7.8, 0.25);
    spawnPurchaseBurst();
  }

  function spawnMarshalUpgradeBurst(upgradeId) {
    if (!state.player) return;
    var color = upgradeId === "graveWarden" ? 0xffe8ad : 0xff8f62;
    addShockwave(state.player.x, state.player.z, 3.5, 0.48, color);
    addLightFlash(state.player.x, 1.5, state.player.z, color, 3.6, 7.5, 0.25);
    spawnPurchaseBurst();
  }

  function spawnStandardUpgradeBurst(spec) {
    if (!state.player) return;
    var color = spec && spec.color === "red" ? 0xffc85a : 0x8fe7ff;
    addShockwave(state.player.x, state.player.z, 2.9, 0.42, color);
    addLightFlash(state.player.x, 1.35, state.player.z, color, 2.8, 6.2, 0.2);
    spawnPurchaseBurst();
  }

  function getXpToNextLevel(level) {
    var lvl = Math.max(1, Math.floor(Number(level) || 1));
    return Math.floor(18 + lvl * 9 + Math.pow(lvl, 1.35) * 4);
  }

  function addLevelUpBurst(x, z) {
    var px = x;
    var pz = z;
    if (state.player) {
      px = state.player.x;
      pz = state.player.z;
    }
    addShockwave(px, pz, 2.65, 0.42, 0x87eaff);
    addLightFlash(px, 1.4, pz, 0x9dfcff, 3.1, 7, 0.24);
    for (var i = 0; i < 20; i++) {
      var angle = rand(0, Math.PI * 2);
      var speed = rand(1.4, 4.8);
      spawnSlimeParticle(px, rand(0.7, 1.8), pz, Math.cos(angle) * speed, rand(1.4, 4.6), Math.sin(angle) * speed, rand(0.28, 0.5), rand(0.04, 0.1), i % 2 ? mats.xp : mats.xpLight);
    }
  }

  function createAmbientDust() {
    for (var i = 0; i < 42; i++) {
      var mat = mats.dust.clone();
      mat.opacity = rand(0.06, 0.16);
      var mesh = new THREE.Mesh(getSharedBoxGeometry(1, 1, 1), mat);
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.renderOrder = 1;
      var dust = {
        x: rand(-ARENA_W / 2 - 3, ARENA_W / 2 + 3),
        y: rand(1.4, 5.6),
        z: rand(-ARENA_D / 2 - 3, ARENA_D / 2 + 3),
        vx: rand(0.18, 0.52),
        vz: rand(-0.16, 0.16),
        phase: rand(0, Math.PI * 2),
        speed: rand(0.6, 1.4),
        opacity: mat.opacity,
        mesh: mesh,
      };
      mesh.scale.set(rand(0.035, 0.11), rand(0.035, 0.11), rand(0.035, 0.11));
      mesh.position.set(dust.x, dust.y, dust.z);
      mesh.userData.disposeGeometry = false;
      mesh.userData.disposeMaterial = true;
      effectRoot.add(mesh);
      state.ambientDust.push(dust);
    }
  }

  function addSpawnDust(x, z) {
    addShockwave(x, z, 1.35, 0.32, 0xd9b36f);
    for (var i = 0; i < 14; i++) {
      addSmokePuff(x + rand(-0.45, 0.45), rand(0.2, 0.75), z + rand(-0.45, 0.45), rand(0.22, 0.45), rand(0.45, 0.8));
    }
  }

  function addHitSpark(x, z, reserved) {
    if (!reserved) reserveParticleSlots(8);
    for (var i = 0; i < 8; i++) {
      var angle = rand(0, Math.PI * 2);
      var speed = rand(1.8, 5.4);
      spawnParticle(x, rand(0.75, 1.45), z, Math.cos(angle) * speed, rand(0.8, 3.4), Math.sin(angle) * speed, 0.2, rand(0.05, 0.13), i % 2 === 0 ? mats.flash : mats.rifleTracer, true);
    }
  }

  function getGoldBurstParticleCount(score) {
    return score >= 250 ? 14 : 9;
  }

  function addGoldBurst(x, z, score, reserved) {
    var count = getGoldBurstParticleCount(score);
    if (!reserved) reserveParticleSlots(count);
    for (var i = 0; i < count; i++) {
      var angle = rand(0, Math.PI * 2);
      var speed = rand(1.2, 4.4);
      spawnParticle(x, rand(0.7, 1.8), z, Math.cos(angle) * speed, rand(1.2, 4.8), Math.sin(angle) * speed, rand(0.25, 0.52), rand(0.08, 0.18), mats.gold, true);
    }
  }

  function addShockwave(x, z, targetRadius, life, color) {
    if (gameplayWarmupMode) {
      warmupShockwaveVisual(x, z, color);
      return;
    }
    reserveShockwaveSlot();
    var visual = acquireShockwaveVisual(x, z, color);
    var mesh = visual.mesh;
    state.shockwaves.push({
      visual: visual,
      mesh: mesh,
      life: life,
      startLife: life,
      targetRadius: targetRadius,
      startOpacity: mesh.material.opacity,
    });
  }

  function addScorchMark(x, z, radius, reserved) {
    if (gameplayWarmupMode) {
      warmupScorchDecalVisual(x, z, radius);
      return;
    }
    if (!reserved || state.decals.length >= MAX_DECALS) reserveDecalSlot();
    var visual = acquireScorchDecalVisual(x, z, radius);
    var mesh = visual.mesh;
    state.decals.push({
      visual: visual,
      mesh: mesh,
      life: 7.5,
      startLife: 7.5,
      startOpacity: mesh.material.opacity,
    });
  }

  function addLightFlash(x, y, z, color, intensity, distance, life) {
    if (gameplayWarmupMode) {
      warmupLightFlashVisual(x, y, z, color, intensity, distance);
      return;
    }
    reserveLightFlashSlot();
    var visual = acquireLightFlashVisual(x, y, z, color, intensity, distance);
    var light = visual.light;
    state.lightFlashes.push({
      visual: visual,
      light: light,
      life: life,
      startLife: life,
      startIntensity: intensity,
    });
  }

  function addSmokePuff(x, y, z, scale, life, reserved) {
    if (gameplayWarmupMode) {
      warmupSmokePuffVisual(x, y, z, scale);
      return;
    }
    if (!reserved || state.smokePuffs.length >= MAX_SMOKE_PUFFS) reserveSmokePuffSlot();
    var visual = acquireSmokePuffVisual(x, y, z, scale);
    var mesh = visual.mesh;
    state.smokePuffs.push({
      visual: visual,
      x: x,
      y: y,
      z: z,
      vx: rand(-0.55, 0.55),
      vy: rand(0.55, 1.45),
      vz: rand(-0.55, 0.55),
      spin: rand(-2.2, 2.2),
      life: life,
      startLife: life,
      startScale: scale,
      startOpacity: mesh.material.opacity,
      mesh: mesh,
    });
  }

  function buyOrSelectWeapon(id) {
    return selectWeapon(id);
  }

  function spawnPurchaseBurst() {
    if (!state.player) return;
    for (var i = 0; i < 18; i++) {
      var angle = rand(0, Math.PI * 2);
      var speed = rand(1.2, 4.5);
      spawnParticle(
        state.player.x,
        rand(0.9, 2.1),
        state.player.z,
        Math.cos(angle) * speed,
        rand(1.4, 4.2),
        Math.sin(angle) * speed,
        rand(0.25, 0.48),
        rand(0.08, 0.2),
        i % 3 === 0 ? mats.rifleTracer : mats.flash
      );
    }
    state.shake = Math.min(1, state.shake + 0.22);
  }

  function setWeaponVisual(id) {
    if (!state.player || !state.player.group) return;
    setWeaponMeshes(state.player.group, getWeaponVisualId(id));
  }

  function getWeaponVisualId(id) {
    if (id === "revolver" && state.revolverUpgrade === "dualRevolvers") return "dualRevolvers";
    if (id === "coachGun" && state.marshalUpgrade === "breachMarshal") return "coachGunBreach";
    if (id === "coachGun" && state.marshalUpgrade === "graveWarden") return "coachGunGrave";
    return id;
  }

  function setWeaponMeshes(group, id) {
    var meshMap = group.userData.weaponMeshes;
    if (!meshMap) return;
    Object.keys(meshMap).forEach(function (key) {
      var visible = key === id || (id === "dualRevolvers" && key === "revolver");
      meshMap[key].forEach(function (mesh) {
        mesh.visible = visible;
      });
    });
  }

  function startGame() {
    lockLandscapeIfPossible();
    resetRun("playing");
    warmupGameplayEffectResources();
    warmupLauncherExplosionAudioGraph();
    if (isRifleListenSceneRequested()) setupRifleListenScene();
    setPanel(menu, false);
    setPanel(gameOverPanel, false);
    setPanel(revolverUpgradePanel, false);
    setPanel(rifleUpgradePanel, false);
    setPanel(launcherUpgradePanel, false);
    setPanel(marshalUpgradePanel, false);
    setPanel(levelUpPanel, false);
    updateModeClass();
  }

  function canOpenPauseMenu() {
    return state.mode === "playing" && !isIntroActive();
  }

  function clearActiveInput() {
    pointerDown = false;
    Object.keys(keys).forEach(function (code) {
      keys[code] = false;
    });
    resetTouchControls();
  }

  function showPauseMenuView(view) {
    var showSettings = view === "settings";
    if (pauseMainPanel) pauseMainPanel.classList.toggle("is-visible", !showSettings);
    if (pauseSettingsPanel) pauseSettingsPanel.classList.toggle("is-visible", showSettings);
    if (showSettings) updatePauseVolumeControls();
  }

  function syncPauseMenuUi() {
    var open = !!state.paused;
    if (pauseMenu) {
      pauseMenu.classList.toggle("is-visible", open);
      pauseMenu.setAttribute("aria-hidden", open ? "false" : "true");
    }
    if (pauseMenuBtn) pauseMenuBtn.setAttribute("aria-expanded", open ? "true" : "false");
    updateModeClass();
  }

  function setPauseMenuOpen(open) {
    var shouldOpen = !!open && canOpenPauseMenu();
    if (!shouldOpen && controlLayoutState.editing) finishControlLayoutEdit(false);
    state.paused = shouldOpen;
    clearActiveInput();
    if (shouldOpen) {
      showPauseMenuView("main");
      updatePauseVolumeControls();
    }
    syncPauseMenuUi();
  }

  function exitToMainMenu() {
    setPauseMenuOpen(false);
    resetRun("menu");
    updateModeClass();
  }

  function applyMarshalPreviewFromQuery() {
    var params = new URLSearchParams(window.location.search || "");
    var preview = (params.get("preview") || "").toLowerCase();
    if (!preview) return false;

    var galleries = {
      "marshal-breach-a": {
        branch: "breachMarshal",
        subtitle: "Display only · Breach Marshal · I",
        ids: ["doorKicker", "doubleTap", "lastWord", "shellCatcher", "buckAndBall"],
      },
      "marshal-breach-b": {
        branch: "breachMarshal",
        subtitle: "Display only · Breach Marshal · II",
        ids: ["rideTheRecoil", "bonebreaker", "noTimeToBleed", "packedBuckshot", "hardCast"],
      },
      "marshal-grave-a": {
        branch: "graveWarden",
        subtitle: "Display only · Grave Warden · I",
        ids: ["rockSalt", "stillness", "lastRites", "graveTithe", "heavensBounty"],
      },
      "marshal-grave-b": {
        branch: "graveWarden",
        subtitle: "Display only · Grave Warden · II",
        ids: ["passingJudgment", "purifyingSalt", "hallowedGround", "fineChoke", "sanctifiedLead"],
      },
    };

    var knownPreview =
      preview === "marshal-class" ||
      preview === "marshal-subclasses" ||
      preview === "marshal-gameplay" ||
      preview === "marshal-gameplay-breach" ||
      preview === "pale-deputy" ||
      !!galleries[preview];
    if (!knownPreview) return false;

    resetRun("playing");
    setIntroActive(false);

    if (preview === "marshal-class") {
      state.level = CLASS_CHOICE_LEVEL;
      state.mode = "playing";
      maybeOfferClassChoice();
      return true;
    }

    state.playerClass = "marshal";
    state.classChoiceOffered = true;
    grantWeapon("coachGun", true);

    if (preview === "pale-deputy") {
      state.level = 19;
      state.marshalUpgrade = "graveWarden";
      state.marshalUpgradeOffered = true;
      state.upgradeCounts.lastRites = 1;
      releaseAllEnemiesToPool();
      state.spawnLeft = 0;
      state.waveSuspended = true;
      state.player.aimAngle = Math.PI * 0.84;
      state.pointerWorld.x = state.player.x + Math.sin(state.player.aimAngle) * 5;
      state.pointerWorld.z = state.player.z + Math.cos(state.player.aimAngle) * 5;
      var previewDeputy = tryRaisePaleDeputy(state.player.x + 0.5, state.player.z + 0.2);
      if (previewDeputy) previewDeputy.previewDisplay = true;
      state.player.group.visible = false;
      camera.zoom = 3.4;
      setWeaponVisual("coachGun");
      updateModeClass();
      updateHud();
      render();
      return true;
    }

    if (preview === "marshal-subclasses") {
      state.level = MARSHAL_UPGRADE_LEVEL;
      state.mode = "playing";
      maybeOfferMarshalUpgradeChoice();
      return true;
    }

    var gallery = galleries[preview];
    if (gallery) {
      state.level = 19;
      state.marshalUpgrade = gallery.branch;
      state.marshalUpgradeOffered = true;
      state.standardUpgradeLevel = 19;
      state.standardUpgradePending = true;
      state.standardUpgradeChoices = gallery.ids.map(getStandardUpgradeById).filter(Boolean);
      state.mode = "level-up";
      setWeaponVisual("coachGun");
      renderStandardUpgradeChoices();
      var previewHeading = levelUpPanel ? levelUpPanel.querySelector("h2") : null;
      if (previewHeading) previewHeading.textContent = "Icon Showcase";
      if (levelUpSubtitle) levelUpSubtitle.textContent = gallery.subtitle;
      setPanel(levelUpPanel, true);
      setPanel(menu, false);
      setPanel(gameOverPanel, false);
      setPanel(classChoicePanel, false);
      setPanel(revolverUpgradePanel, false);
      setPanel(rifleUpgradePanel, false);
      setPanel(launcherUpgradePanel, false);
      setPanel(marshalUpgradePanel, false);
      updateModeClass();
      updateHud();
      render();
      return true;
    }

    if (preview === "marshal-gameplay" || preview === "marshal-gameplay-breach") {
      state.level = 19;
      state.marshalUpgrade = preview === "marshal-gameplay-breach" ? "breachMarshal" : "graveWarden";
      state.marshalUpgradeOffered = true;
      setWeaponVisual("coachGun");
      updateModeClass();
      updateHud();
      render();
      return true;
    }

    return false;
  }

  function isRifleListenSceneRequested() {
    var params = new URLSearchParams(window.location.search || "");
    var value = (params.get("listen") || "").toLowerCase();
    return value === "rifle" || value === "winchester";
  }

  function setupRifleListenScene() {
    if (!state.player) return;
    releaseAllEnemiesToPool();
    state.spawnLeft = 0;
    state.spawnTimer = 9999;
    state.waveSuspended = true;
    state.nextWaveTimer = 9999;
    state.playerClass = "ranger";
    state.classChoicePending = false;
    state.classChoiceOffered = true;
    grantWeapon("rifle", true);
    state.ammo.rifle = getWeaponMagazine(WEAPONS.rifle);
    state.ammoReserve.rifle = Math.max(state.ammoReserve.rifle || 0, 180);
    state.reloadTimers.rifle = 0;
    state.pointerWorld.x = state.player.x + 18;
    state.pointerWorld.z = state.player.z;
    pointerHit.set(state.pointerWorld.x, 0, state.pointerWorld.z);
    updateAim();
    updateHud();
    render();
  }

  function bindInput() {
    startBtn.addEventListener("click", startGame);
    restartBtn.addEventListener("click", startGame);
    if (menuMusicBtn) menuMusicBtn.addEventListener("click", handleMenuMusicButtonClick);
    if (pauseMenuBtn) {
      pauseMenuBtn.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopPropagation();
        setPauseMenuOpen(true);
      });
    }
    if (pauseCloseBtn) pauseCloseBtn.addEventListener("click", function () { setPauseMenuOpen(false); });
    if (pauseContinueBtn) pauseContinueBtn.addEventListener("click", function () { setPauseMenuOpen(false); });
    if (pauseSettingsBtn) pauseSettingsBtn.addEventListener("click", function () { showPauseMenuView("settings"); });
    if (pauseSettingsBackBtn) pauseSettingsBackBtn.addEventListener("click", function () { showPauseMenuView("main"); });
    if (pauseExitBtn) pauseExitBtn.addEventListener("click", exitToMainMenu);
    if (controlLayoutBtn) controlLayoutBtn.addEventListener("click", beginControlLayoutEdit);
    if (controlLayoutApplyBtn) controlLayoutApplyBtn.addEventListener("click", function () { finishControlLayoutEdit(true); });
    if (controlLayoutResetBtn) controlLayoutResetBtn.addEventListener("click", resetControlLayoutDraft);
    if (musicVolumeInput) {
      musicVolumeInput.addEventListener("input", function () {
        setAudioVolume("music", musicVolumeInput.value);
      });
    }
    if (sfxVolumeInput) {
      sfxVolumeInput.addEventListener("input", function () {
        setAudioVolume("sfx", sfxVolumeInput.value);
      });
    }
    updatePauseVolumeControls();
    if (introScreen) {
      window.addEventListener("pointerdown", dismissIntroScreen, true);
      window.addEventListener("keydown", dismissIntroScreen, true);
    }
    window.addEventListener("pointerdown", handleDefaultMenuMusicGesture, true);
    window.addEventListener("keydown", handleDefaultMenuMusicGesture, true);
    classChoiceButtons.forEach(function (button) {
      button.addEventListener("click", function () {
        choosePlayerClass(button.getAttribute("data-class"));
      });
    });
    revolverUpgradeButtons.forEach(function (button) {
      button.addEventListener("click", function () {
        chooseRevolverUpgrade(button.getAttribute("data-revolver-upgrade"));
      });
    });
    rifleUpgradeButtons.forEach(function (button) {
      button.addEventListener("click", function () {
        chooseRifleUpgrade(button.getAttribute("data-rifle-upgrade"));
      });
    });
    launcherUpgradeButtons.forEach(function (button) {
      button.addEventListener("click", function () {
        chooseLauncherUpgrade(button.getAttribute("data-launcher-upgrade"));
      });
    });
    marshalUpgradeButtons.forEach(function (button) {
      button.addEventListener("click", function () {
        chooseMarshalUpgrade(button.getAttribute("data-marshal-upgrade"));
      });
    });
    if (levelUpOptions) {
      levelUpOptions.addEventListener("click", function (event) {
        var button = event.target.closest("[data-standard-upgrade]");
        if (button) chooseStandardUpgrade(button.getAttribute("data-standard-upgrade"));
      });
    }

    window.addEventListener("keydown", function (event) {
      if (event.code === "Escape") {
        if (state.paused) {
          event.preventDefault();
          setPauseMenuOpen(false);
          return;
        }
        if (canOpenPauseMenu()) {
          event.preventDefault();
          setPauseMenuOpen(true);
          return;
        }
      }
      if (state.paused) {
        event.preventDefault();
        return;
      }
      keys[event.code] = true;
      if (event.code === "KeyF") toggleFullscreen();
      if (event.code === "KeyR" && state.mode === "gameover") startGame();
      if (event.code === "KeyR" && state.mode === "playing") startReload(state.weapon);
      if ((event.code === "Enter" || event.code === "Space") && (state.mode === "menu" || state.mode === "gameover")) startGame();
    });
    window.addEventListener("keyup", function (event) {
      keys[event.code] = false;
    });

    bindCanvasInput(renderer.domElement);
    window.addEventListener("pointermove", handleControlLayoutDragMove);
    window.addEventListener("pointerup", endControlLayoutDrag);
    window.addEventListener("pointercancel", endControlLayoutDrag);
    window.addEventListener("pointerup", function () {
      pointerDown = false;
    });
    bindMobileControls();
    window.addEventListener("resize", resize);
  }

  function initClassWeaponIcons() {
    classWeaponIcons.forEach(function (icon) {
      var id = icon.getAttribute("data-weapon-icon");
      icon.innerHTML = WEAPON_ICONS[id] || "";
      icon.setAttribute("viewBox", "0 0 128 64");
    });
  }

  function alignClassWeaponIcons(panel) {
    var icons = panel ? Array.prototype.slice.call(panel.querySelectorAll("[data-weapon-icon]")) : classWeaponIcons;
    icons.forEach(function (icon) {
      centerSvgContent(icon, 128, 64);
    });
  }

  function centerSvgContent(svg, viewWidth, viewHeight) {
    try {
      var box = svg.getBBox();
      if (!box.width || !box.height) return;
      var centerX = box.x + box.width / 2;
      var centerY = box.y + box.height / 2;
      var viewX = centerX - viewWidth / 2;
      var viewY = centerY - viewHeight / 2;
      svg.setAttribute("viewBox", [viewX.toFixed(2), viewY.toFixed(2), viewWidth, viewHeight].join(" "));
    } catch (err) {}
  }

  function bindCanvasInput(canvas) {
    canvas.addEventListener("pointermove", handleCanvasPointerMove);
    canvas.addEventListener("pointerdown", handleCanvasPointerDown);
    canvas.addEventListener("pointerup", handleCanvasPointerUp);
    canvas.addEventListener("pointercancel", handleCanvasPointerUp);
    canvas.addEventListener("lostpointercapture", handleCanvasPointerUp);
    canvas.addEventListener("contextmenu", handleCanvasContextMenu);
  }

  function handleCanvasPointerMove(event) {
    if (state.paused) return;
    if (mobileFieldFire.active && event.pointerId === mobileFieldFire.pointerId) {
      event.preventDefault();
      setMobileAimTargetFromClient(event.clientX, event.clientY);
      return;
    }
    if (state.mode === "menu") updateMenuPointerFromClient(event.clientX, event.clientY);
    updatePointerFromClient(event.clientX, event.clientY);
  }

  function handleCanvasPointerDown(event) {
    if (event.button !== 0) return;
    if (state.paused) return;
    if (state.mode === "playing" && isTouchPointerEvent(event)) {
      event.preventDefault();
      startMobileFieldFire(event);
      pointerDown = false;
      return;
    }
    updatePointerFromClient(event.clientX, event.clientY);
    pointerDown = true;
    if (state.mode === "menu") startGame();
  }

  function handleCanvasPointerUp(event) {
    if (mobileFieldFire.active && (!event || event.pointerId === mobileFieldFire.pointerId)) {
      endMobileFieldFire();
    }
  }

  function handleCanvasContextMenu(event) {
    event.preventDefault();
  }

  function isTouchPointerEvent(event) {
    return event && event.pointerType === "touch";
  }

  function startMobileFieldFire(event) {
    mobileFieldFire.active = true;
    mobileFieldFire.pointerId = event.pointerId;
    setMobileAimTargetFromClient(event.clientX, event.clientY);
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch (err) {}
    if (state.player) {
      updateAim();
      if (state.player.cooldown <= 0) {
        shoot();
        updateHud();
      }
    }
  }

  function endMobileFieldFire() {
    mobileFieldFire.active = false;
    mobileFieldFire.pointerId = null;
    clearMobileAimTarget();
  }

  function bindMobileControls() {
    if (moveStick) {
      moveStick.addEventListener("pointerdown", function (event) {
        if (event.button !== 0 && event.pointerType !== "touch") return;
        if (beginControlLayoutDrag(event, "move")) return;
        if (state.paused) return;
        event.preventDefault();
        event.stopPropagation();
        stopTouchAutoRun(false);
        clearMobileAimTarget();
        touchMove.active = true;
        touchMove.pointerId = event.pointerId;
        try {
          moveStick.setPointerCapture(event.pointerId);
        } catch (err) {}
        var rect = moveStick.getBoundingClientRect();
        touchMove.baseX = rect.left + rect.width / 2;
        touchMove.baseY = rect.top + rect.height / 2;
        updateTouchMove(event.clientX, event.clientY);
        moveStick.classList.add("is-active");
      });
      moveStick.addEventListener("pointermove", function (event) {
        if (!touchMove.active || event.pointerId !== touchMove.pointerId) return;
        event.preventDefault();
        updateTouchMove(event.clientX, event.clientY);
      });
      moveStick.addEventListener("pointerup", endTouchMove);
      moveStick.addEventListener("pointercancel", endTouchMove);
      moveStick.addEventListener("lostpointercapture", function (event) {
        if (event.pointerId === touchMove.pointerId) endTouchMove(event);
      });
    }

    if (mobileFire) {
      mobileFire.addEventListener("pointerdown", function (event) {
        if (event.button !== 0 && event.pointerType !== "touch") return;
        if (beginControlLayoutDrag(event, "fire")) return;
        if (state.paused) return;
        event.preventDefault();
        event.stopPropagation();
        touchFire.active = true;
        touchFire.pointerId = event.pointerId;
        try {
          mobileFire.setPointerCapture(event.pointerId);
        } catch (err) {}
        mobileFire.classList.add("is-pressed");
        if (state.mode === "menu") startGame();
      });
      mobileFire.addEventListener("pointerup", endTouchFire);
      mobileFire.addEventListener("pointercancel", endTouchFire);
      mobileFire.addEventListener("lostpointercapture", function (event) {
        if (event.pointerId === touchFire.pointerId) endTouchFire(event);
      });
    }
  }

  function getTouchMoveVector() {
    if (touchMove.active) {
      return { x: touchMove.x, z: touchMove.z };
    }
    if (touchMove.autoRun) {
      return { x: touchMove.autoX, z: touchMove.autoZ };
    }
    return { x: 0, z: 0 };
  }

  function getMoveStickMax() {
    if (!moveStick) return 42;
    var style = window.getComputedStyle ? window.getComputedStyle(moveStick) : null;
    var visualSize = style ? parseFloat(style.getPropertyValue("--move-stick-visual-size")) : 0;
    if (!Number.isFinite(visualSize) || visualSize <= 0) visualSize = moveStick.getBoundingClientRect().width;
    return Math.max(1, visualSize * 0.34);
  }

  function setMoveKnobOffset(x, y) {
    if (!moveKnob) return;
    moveKnob.style.transform = "translate(calc(-50% + " + x.toFixed(1) + "px), calc(-50% + " + y.toFixed(1) + "px))";
  }

  function centerMoveKnob() {
    setMoveKnobOffset(0, 0);
  }

  function updateTouchMove(clientX, clientY) {
    var max = getMoveStickMax();
    var dx = clientX - touchMove.baseX;
    var dy = clientY - touchMove.baseY;
    var dist = Math.hypot(dx, dy);
    var limited = Math.min(max, dist);
    var nx = dist > 0.001 ? dx / dist : 0;
    var ny = dist > 0.001 ? dy / dist : 0;
    touchMove.x = (nx * limited) / max;
    touchMove.z = (ny * limited) / max;
    if (moveStick) moveStick.classList.toggle("is-auto-run-ready", Math.hypot(touchMove.x, touchMove.z) >= MOBILE_AUTORUN_TRIGGER);
    setMoveKnobOffset(nx * limited, ny * limited);
  }

  function endTouchMove(event) {
    if (!touchMove.active || (event && event.pointerId !== touchMove.pointerId)) return;
    var releaseX = touchMove.x;
    var releaseZ = touchMove.z;
    var releaseLen = Math.hypot(releaseX, releaseZ);
    var shouldAutoRun = !!event && event.type === "pointerup" && releaseLen >= MOBILE_AUTORUN_TRIGGER;
    touchMove.active = false;
    touchMove.pointerId = null;
    touchMove.x = 0;
    touchMove.z = 0;
    if (moveStick) {
      moveStick.classList.remove("is-active");
      moveStick.classList.remove("is-auto-run-ready");
    }
    if (shouldAutoRun) {
      startTouchAutoRun(releaseX, releaseZ);
    } else {
      stopTouchAutoRun(true);
    }
  }

  function startTouchAutoRun(x, z) {
    var len = Math.hypot(x, z);
    if (len < 0.001) {
      stopTouchAutoRun(true);
      return;
    }
    touchMove.autoRun = true;
    touchMove.autoX = x / len;
    touchMove.autoZ = z / len;
    if (moveStick) moveStick.classList.add("is-auto-run");
    var max = getMoveStickMax() * MOBILE_AUTORUN_KNOB_SCALE;
    setMoveKnobOffset(touchMove.autoX * max, touchMove.autoZ * max);
  }

  function stopTouchAutoRun(resetKnob) {
    touchMove.autoRun = false;
    touchMove.autoX = 0;
    touchMove.autoZ = 0;
    if (moveStick) {
      moveStick.classList.remove("is-auto-run");
      moveStick.classList.remove("is-auto-run-ready");
    }
    if (resetKnob !== false && !touchMove.active) centerMoveKnob();
  }

  function endTouchFire(event) {
    if (!touchFire.active || (event && event.pointerId !== touchFire.pointerId)) return;
    touchFire.active = false;
    touchFire.pointerId = null;
    if (mobileFire) mobileFire.classList.remove("is-pressed");
  }

  function resetTouchControls() {
    touchMove.active = false;
    touchMove.pointerId = null;
    touchMove.x = 0;
    touchMove.z = 0;
    touchMove.autoRun = false;
    touchMove.autoX = 0;
    touchMove.autoZ = 0;
    touchFire.active = false;
    touchFire.pointerId = null;
    mobileFieldFire.active = false;
    mobileFieldFire.pointerId = null;
    lastMobileAim.x = 0;
    lastMobileAim.z = -1;
    clearMobileAimTarget();
    centerMoveKnob();
    if (moveStick) {
      moveStick.classList.remove("is-active");
      moveStick.classList.remove("is-auto-run");
      moveStick.classList.remove("is-auto-run-ready");
    }
    if (mobileFire) mobileFire.classList.remove("is-pressed");
    updateModeClass();
  }

  function updateModeClass() {
    root.classList.toggle("is-intro", isIntroActive());
    root.classList.toggle("is-menu", state.mode === "menu");
    root.classList.toggle("is-playing", state.mode === "playing");
    root.classList.toggle("is-paused", !!state.paused);
    root.classList.toggle("is-layout-editing", !!state.controlLayoutEditing);
    root.classList.toggle("is-gameover", state.mode === "gameover");
    root.classList.toggle("is-class-choice", state.mode === "class-choice");
    root.classList.toggle("is-revolver-upgrade", state.mode === "revolver-upgrade");
    root.classList.toggle("is-rifle-upgrade", state.mode === "rifle-upgrade");
    root.classList.toggle("is-launcher-upgrade", state.mode === "launcher-upgrade");
    root.classList.toggle("is-marshal-upgrade", state.mode === "marshal-upgrade");
    root.classList.toggle("is-level-up", state.mode === "level-up");
  }

  function updatePointerFromClient(clientX, clientY) {
    pointerInput.hasPointer = true;
    pointerInput.clientX = clientX;
    pointerInput.clientY = clientY;
    var rect = renderer.domElement.getBoundingClientRect();
    pointerNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    pointerNdc.y = -(((clientY - rect.top) / rect.height) * 2 - 1);
    raycaster.setFromCamera(pointerNdc, camera);
    raycaster.ray.intersectPlane(groundPlane, pointerHit);
    state.pointerWorld.x = clamp(pointerHit.x, -ARENA_W / 2 - 4, ARENA_W / 2 + 4);
    state.pointerWorld.z = clamp(pointerHit.z, -ARENA_D / 2 - 4, ARENA_D / 2 + 4);
    updatePointerFollowOffset();
  }

  function updateMenuPointerFromClient(clientX, clientY) {
    var rect = renderer.domElement.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    menuState.pointerX = clamp(((clientX - rect.left) / rect.width) * 2 - 1, -1, 1);
    menuState.pointerY = clamp(((clientY - rect.top) / rect.height) * 2 - 1, -1, 1);
  }

  function updatePointerFollowOffset() {
    var follow = getPointerFollowTarget();
    pointerInput.followOffsetX = state.pointerWorld.x - follow.x;
    pointerInput.followOffsetZ = state.pointerWorld.z - follow.z;
  }

  function refreshPointerWorldFromFollow(player) {
    if (!pointerInput.hasPointer || !player) return;
    var follow = getPointerFollowTarget();
    state.pointerWorld.x = clamp(follow.x + pointerInput.followOffsetX, -ARENA_W / 2 - 4, ARENA_W / 2 + 4);
    state.pointerWorld.z = clamp(follow.z + pointerInput.followOffsetZ, -ARENA_D / 2 - 4, ARENA_D / 2 + 4);
  }

  function getPointerFollowTarget() {
    if (state.player) return clampCameraTarget(state.player.x, state.player.z);
    return {
      x: cameraTarget.x,
      z: cameraTarget.z,
    };
  }

  function updateHud() {
    var ratio = state.player ? clamp(state.player.hp / state.player.maxHp, 0, 1) : 1;
    var ratioText = ratio.toFixed(3);
    if (hudCache.hpRatio !== ratioText) {
      hudHealth.style.transform = "scaleX(" + ratioText + ")";
      hudCache.hpRatio = ratioText;
    }
    if (hudCache.wave !== String(state.wave)) {
      hudWave.textContent = String(state.wave);
      hudCache.wave = String(state.wave);
    }
    if (hudCache.score !== String(state.score)) {
      hudScore.textContent = String(state.score);
      hudCache.score = String(state.score);
    }
    if (hudCache.kills !== String(state.kills)) {
      hudKills.textContent = String(state.kills);
      hudCache.kills = String(state.kills);
    }
    if (hudLevel && hudCache.level !== String(state.level)) {
      hudLevel.textContent = String(state.level);
      hudCache.level = String(state.level);
    }
    if (hudXpFill || minimapHud) {
      var xpRatio = state.xpToNext > 0 ? clamp(state.xp / state.xpToNext, 0, 1) : 0;
      var xpRatioText = xpRatio.toFixed(3);
      if (hudCache.xpRatio !== xpRatioText) {
        if (hudXpFill) hudXpFill.style.transform = "scaleX(" + xpRatioText + ")";
        if (minimapHud) {
          minimapHud.style.setProperty("--xp-progress", xpRatioText);
          minimapHud.style.setProperty("--xp-progress-angle", (xpRatio * 360).toFixed(1) + "deg");
          minimapHud.setAttribute("aria-label", "Minimap. Level " + state.level + ". Experience " + Math.round(xpRatio * 100) + "%.");
        }
        hudCache.xpRatio = xpRatioText;
      } else if (minimapHud && hudCache.level === String(state.level)) {
        minimapHud.setAttribute("aria-label", "Minimap. Level " + state.level + ". Experience " + Math.round(xpRatio * 100) + "%.");
      }
    }
    updateAmmoHud();
    updatePanelInteractivity();
    updateMinimap();
  }

  function updatePanelInteractivity() {
    var signature = [
      state.mode,
      state.classChoicePending ? 1 : 0,
      state.revolverUpgradePending ? 1 : 0,
      state.rifleUpgradePending ? 1 : 0,
      state.launcherUpgradePending ? 1 : 0,
      state.marshalUpgradePending ? 1 : 0,
    ].join("|");
    if (hudCache.interactivitySignature === signature) return;
    hudCache.interactivitySignature = signature;
    syncButtonDisabledState(classChoiceButtons, state.mode !== "class-choice" || !state.classChoicePending);
    syncButtonDisabledState(revolverUpgradeButtons, state.mode !== "revolver-upgrade" || !state.revolverUpgradePending);
    syncButtonDisabledState(rifleUpgradeButtons, state.mode !== "rifle-upgrade" || !state.rifleUpgradePending);
    syncButtonDisabledState(launcherUpgradeButtons, state.mode !== "launcher-upgrade" || !state.launcherUpgradePending);
    syncButtonDisabledState(marshalUpgradeButtons, state.mode !== "marshal-upgrade" || !state.marshalUpgradePending);
  }

  function syncButtonDisabledState(buttons, disabled) {
    for (var i = 0; i < buttons.length; i++) {
      if (buttons[i].disabled !== disabled) buttons[i].disabled = disabled;
    }
  }

  function updateMinimap() {
    if (!minimapCanvas || !minimapCtx) return;
    if (state.mode !== "playing" || !state.player) return;
    resizeMinimapCanvas();
    if (state.time + 1 < minimapNextDynamicUpdateAt) minimapNextDynamicUpdateAt = 0;
    if (!minimapStaticDirty && state.time + 0.0001 < minimapNextDynamicUpdateAt) return;
    minimapNextDynamicUpdateAt = state.time + MINIMAP_DYNAMIC_INTERVAL;
    var ctx = minimapCtx;
    var width = minimapCanvas.width;
    var height = minimapCanvas.height;
    var dpr = getMinimapDpr();
    var layout = getMinimapLayout(width, height, dpr);
    ensureMinimapStaticLayer(width, height, dpr, layout);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, width, height);
    if (minimapStaticCanvas) ctx.drawImage(minimapStaticCanvas, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    var visible = getCurrentVisibleGroundRect();
    var va = layout.toMap(visible.minX, visible.minZ);
    var vb = layout.toMap(visible.maxX, visible.maxZ);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.36)";
    ctx.lineWidth = 1;
    ctx.strokeRect(va.x, va.y, vb.x - va.x, vb.y - va.y);

    var nearestCrates = getNearestAmmoCratesForMinimap(4);
    if (minimapAmmoCount) {
      var ammoText = "Ammo " + nearestCrates.length;
      if (minimapDynamicCache.ammoCount !== ammoText) {
        minimapAmmoCount.textContent = ammoText;
        minimapDynamicCache.ammoCount = ammoText;
      }
    }
    nearestCrates.forEach(function (crate, index) {
      var p = layout.toMap(crate.x, crate.z);
      var pulse = 1 + Math.sin(state.time * 5 + index) * 0.18;
      ctx.fillStyle = index === 0 ? "#ffe285" : "#ffc34f";
      ctx.shadowColor = "rgba(255, 211, 107, 0.75)";
      ctx.shadowBlur = 5;
      fillDiamond(ctx, p.x, p.y, 3.2 * pulse);
      ctx.shadowBlur = 0;
      ctx.strokeStyle = "rgba(45, 23, 8, 0.72)";
      ctx.lineWidth = 1;
      strokeDiamond(ctx, p.x, p.y, 3.2 * pulse);
    });

    var pp = layout.toMap(state.player.x, state.player.z);
    ctx.save();
    ctx.translate(pp.x, pp.y);
    ctx.rotate(Math.PI - state.player.aimAngle);
    ctx.fillStyle = "#ffffff";
    ctx.shadowColor = "rgba(255, 255, 255, 0.8)";
    ctx.shadowBlur = 5;
    ctx.beginPath();
    ctx.moveTo(0, -5.2);
    ctx.lineTo(3.9, 4.4);
    ctx.lineTo(0, 2.5);
    ctx.lineTo(-3.9, 4.4);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "rgba(38, 20, 8, 0.85)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
    ctx.restore();
  }

  function resizeMinimapCanvas() {
    if (!minimapCanvas) return;
    var dpr = getMinimapDpr();
    var w = Math.max(1, Math.round((minimapCanvas.clientWidth || 176) * dpr));
    var h = Math.max(1, Math.round((minimapCanvas.clientHeight || 128) * dpr));
    if (minimapCanvas.width !== w) {
      minimapCanvas.width = w;
      minimapStaticDirty = true;
    }
    if (minimapCanvas.height !== h) {
      minimapCanvas.height = h;
      minimapStaticDirty = true;
    }
    if (minimapStaticCanvas) {
      if (minimapStaticCanvas.width !== w) {
        minimapStaticCanvas.width = w;
        minimapStaticDirty = true;
      }
      if (minimapStaticCanvas.height !== h) {
        minimapStaticCanvas.height = h;
        minimapStaticDirty = true;
      }
    }
  }

  function getMinimapDpr() {
    return Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  }

  function getMinimapLayout(width, height, dpr) {
    var cssW = width / dpr;
    var cssH = height / dpr;
    var pad = 7;
    var scale = Math.min((cssW - pad * 2) / ARENA_W, (cssH - pad * 2) / ARENA_D);
    var mapW = ARENA_W * scale;
    var mapH = ARENA_D * scale;
    var ox = (cssW - mapW) / 2;
    var oy = (cssH - mapH) / 2;
    return {
      cssW: cssW,
      cssH: cssH,
      scale: scale,
      mapW: mapW,
      mapH: mapH,
      ox: ox,
      oy: oy,
      toMap: function (x, z) {
        return {
          x: ox + (x + ARENA_W / 2) * scale,
          y: oy + (z + ARENA_D / 2) * scale,
        };
      },
    };
  }

  function ensureMinimapStaticLayer(width, height, dpr, layout) {
    if (!minimapStaticCanvas || !minimapStaticCtx || !minimapStaticDirty) return;
    var ctx = minimapStaticCtx;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    fillRoundRect(ctx, 0, 0, layout.cssW, layout.cssH, 5, "rgba(28, 16, 8, 0.55)");
    fillRoundRect(ctx, layout.ox, layout.oy, layout.mapW, layout.mapH, 4, "#c29355");
    ctx.strokeStyle = "rgba(255, 236, 182, 0.22)";
    ctx.lineWidth = 1;
    ctx.strokeRect(layout.ox + 0.5, layout.oy + 0.5, layout.mapW - 1, layout.mapH - 1);

    ctx.fillStyle = "rgba(133, 87, 47, 0.42)";
    MAIN_TOWNS.forEach(function (town) {
      var a = layout.toMap(town.center.x - CITY_W / 2, town.center.z - CITY_D / 2);
      ctx.fillRect(a.x, a.y, CITY_W * layout.scale, CITY_D * layout.scale);
      var h = layout.toMap(town.center.x - CITY_W / 2, town.center.z);
      var v = layout.toMap(town.center.x, town.center.z - CITY_D / 2);
      ctx.fillStyle = "rgba(91, 58, 34, 0.72)";
      ctx.fillRect(h.x, h.y - Math.max(1, 3.5 * layout.scale), CITY_W * layout.scale, Math.max(1.3, 7 * layout.scale));
      ctx.fillRect(v.x - Math.max(1, 3.5 * layout.scale), v.y, Math.max(1.3, 7 * layout.scale), CITY_D * layout.scale);
      ctx.fillStyle = "rgba(133, 87, 47, 0.42)";
    });

    ctx.fillStyle = "rgba(255, 223, 148, 0.62)";
    microSettlementStats.forEach(function (settlement) {
      if (settlement.skipped || settlement.buildingCount < 2) return;
      var p = layout.toMap(settlement.x, settlement.z);
      ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
    });

    ctx.fillStyle = "rgba(83, 72, 54, 0.62)";
    interestPointStats.forEach(function (point) {
      var p = layout.toMap(point.x, point.z);
      ctx.fillRect(p.x - 1, p.y - 1, 2, 2);
    });
    ctx.restore();
    minimapStaticDirty = false;
  }

  function getNearestAmmoCratesForMinimap(limit) {
    if (!state.player) return [];
    var max = Math.max(1, limit || 4);
    nearestAmmoCrateScratch.length = 0;
    nearestAmmoCrateDistanceScratch.length = 0;
    for (var i = 0; i < state.ammoCrates.length; i++) {
      var crate = state.ammoCrates[i];
      if (crate.mini) continue;
      var dx = crate.x - state.player.x;
      var dz = crate.z - state.player.z;
      var distSq = dx * dx + dz * dz;
      var insertAt = nearestAmmoCrateScratch.length;
      while (insertAt > 0 && distSq < nearestAmmoCrateDistanceScratch[insertAt - 1]) insertAt -= 1;
      if (insertAt >= max) continue;
      nearestAmmoCrateScratch.splice(insertAt, 0, crate);
      nearestAmmoCrateDistanceScratch.splice(insertAt, 0, distSq);
      if (nearestAmmoCrateScratch.length > max) {
        nearestAmmoCrateScratch.length = max;
        nearestAmmoCrateDistanceScratch.length = max;
      }
    }
    return nearestAmmoCrateScratch;
  }

  function fillRoundRect(ctx, x, y, w, h, r, fillStyle) {
    ctx.fillStyle = fillStyle;
    if (ctx.roundRect) {
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, r);
      ctx.fill();
      return;
    }
    ctx.fillRect(x, y, w, h);
  }

  function fillDiamond(ctx, x, y, r) {
    ctx.beginPath();
    ctx.moveTo(x, y - r);
    ctx.lineTo(x + r, y);
    ctx.lineTo(x, y + r);
    ctx.lineTo(x - r, y);
    ctx.closePath();
    ctx.fill();
  }

  function strokeDiamond(ctx, x, y, r) {
    ctx.beginPath();
    ctx.moveTo(x, y - r);
    ctx.lineTo(x + r, y);
    ctx.lineTo(x, y + r);
    ctx.lineTo(x - r, y);
    ctx.closePath();
    ctx.stroke();
  }

  function updateAmmoHud() {
    if (!ammoHud || !ammoCurrent || !ammoMax) return;
    var weapon = WEAPONS[state.weapon] || WEAPONS.revolver;
    var ammo = getAmmoState(weapon.id);
    if (ammoHudCache.reloading !== ammo.reloading) {
      ammoHud.classList.toggle("is-reloading", ammo.reloading);
      ammoHudCache.reloading = ammo.reloading;
    }
    var reloadProgressText = ammo.reloadProgress.toFixed(3);
    if (ammoHudCache.reloadProgress !== reloadProgressText) {
      ammoHud.style.setProperty("--reload-progress", reloadProgressText);
      ammoHudCache.reloadProgress = reloadProgressText;
    }
    var ammoWarning = getAmmoWarningLevel(ammo);
    ammoHud.classList.toggle("is-low-ammo", ammoWarning === "low");
    ammoHud.classList.toggle("is-critical-ammo", ammoWarning === "critical");
    ammoHud.classList.toggle("is-dual-hands-ammo", !!ammo.dualHands);
    if (ammoStatus) {
      var remainingStatus = getAmmoRemainingStatusText(ammo, ammoWarning);
      var statusText = ammo.dualHands
        ? getDualRevolverAmmoStatusText(ammo.dualHands)
        : weapon.id === "coachGun" && ammo.reloading
          ? "LOAD " + ammo.current + "/" + ammo.magazine + " / LEFT " + ammo.total
        : ammo.reloading
          ? "Reload " + ammo.reloadRemaining.toFixed(1) + "s / " + remainingStatus
          : ammo.total <= 0
            ? "Empty"
            : remainingStatus;
      if (ammoHudCache.statusText !== statusText) {
        ammoStatus.textContent = statusText;
        ammoHudCache.statusText = statusText;
      }
    }
    var currentText = String(ammo.current);
    if (ammoHudCache.currentText !== currentText) {
      ammoCurrent.textContent = currentText;
      ammoHudCache.currentText = currentText;
    }
    var maxText = String(ammo.magazine);
    if (ammoHudCache.maxText !== maxText) {
      ammoMax.textContent = maxText;
      ammoHudCache.maxText = maxText;
    }
    var ariaLabel = ammo.dualHands
      ? weapon.label +
        " ammo " +
        ammo.current +
        " of " +
        ammo.magazine +
        ", right " +
        ammo.dualHands.right.current +
        " of " +
        ammo.dualHands.right.magazine +
        ", left " +
        ammo.dualHands.left.current +
        " of " +
        ammo.dualHands.left.magazine +
        ", reserve " +
        ammo.reserve
      : weapon.label + " ammo " + ammo.current + " of " + ammo.magazine + ", total " + ammo.total + ", reserve " + ammo.reserve;
    if (ammoHudCache.ariaLabel !== ariaLabel) {
      ammoHud.setAttribute("aria-label", ariaLabel);
      ammoHudCache.ariaLabel = ariaLabel;
    }
    syncAmmoRack(weapon, ammo);
    if (ammoReloadFill) ammoReloadFill.style.transform = ammo.reloading ? "scaleX(" + reloadProgressText + ")" : "scaleX(0)";
    var weaponIconId = getWeaponHudIconId(weapon.id);
    if (ammoWeaponIcon && currentAmmoIcon !== weaponIconId) {
      ammoWeaponIcon.innerHTML = WEAPON_ICONS[weaponIconId] || WEAPON_ICONS[weapon.id] || WEAPON_ICONS.revolver;
      currentAmmoIcon = weaponIconId;
    }
  }

  function getWeaponHudIconId(id) {
    if (id === "coachGun" && state.marshalUpgrade === "breachMarshal") return "coachGunBreach";
    if (id === "coachGun" && state.marshalUpgrade === "graveWarden") return "coachGunGrave";
    return id;
  }

  function getAmmoWarningLevel(ammo) {
    if (!ammo || ammo.total <= 0 || ammo.magazine <= 0) return "none";
    if (ammo.total <= ammo.magazine) return "critical";
    if (ammo.total <= ammo.magazine * 2 || ammo.reserve <= ammo.magazine * 2) return "low";
    return "none";
  }

  function getAmmoRemainingStatusText(ammo, warningLevel) {
    if (!ammo || ammo.total <= 0) return "Empty";
    if (warningLevel === "critical") return "LAST MAG / LEFT " + ammo.total;
    if (warningLevel === "low") return "LOW AMMO / LEFT " + ammo.total;
    return "LEFT " + ammo.total;
  }

  function getDualRevolverAmmoStatusText(hands) {
    if (!hands) return "";
    function handText(label, hand) {
      var text = label + " " + hand.current + "/" + hand.magazine;
      if (hand.freeReloads > 0) text += "+" + hand.freeReloads;
      return text;
    }
    return handText("R", hands.right) + "  " + handText("L", hands.left);
  }

  function render() {
    if (renderDiagnostics.contextLost) return;
    var renderScene = scene;
    var renderCamera = camera;
    if (state.mode === "menu") {
      var menuT = menuState.time;
      var menuCowboy = menuState.cowboy;
      var menuBaseX = menuCowboy ? menuCowboy.group.position.x : 0;
      var menuBaseZ = menuCowboy ? menuCowboy.group.position.z : 0;
      var menuParallaxX = menuState.pointerX * 1.8;
      var menuParallaxY = menuState.pointerY * 0.7;
      menuCamera.position.set(
        menuBaseX + 10.6 + Math.sin(menuT * 0.32) * 1.4 + menuParallaxX,
        8.1 + Math.sin(menuT * 0.48) * 0.26 - menuParallaxY * 0.24,
        menuBaseZ + 17.2 + Math.cos(menuT * 0.26) * 1.1
      );
      menuCamera.lookAt(
        menuBaseX + 5.1 + menuParallaxX * 0.32,
        2.6 - menuParallaxY * 0.16,
        menuBaseZ - 4.8
      );
      renderScene = menuScene;
      renderCamera = menuCamera;
    } else {
      var p = state.player;
      var follow = clampCameraTarget(p ? p.x : 0, p ? p.z : 0, cameraFollowScratch);
      var shakePower = state.shake * state.shake;
      var sx = shakePower > 0 ? rand(-0.45, 0.45) * shakePower : 0;
      var sz = shakePower > 0 ? rand(-0.45, 0.45) * shakePower : 0;
      cameraTarget.set(follow.x, 0, follow.z);
      camera.position.set(
        cameraTarget.x + cameraBaseOffset.x + sx,
        cameraBaseOffset.y,
        cameraTarget.z + cameraBaseOffset.z + sz
      );
      camera.lookAt(cameraTarget);
      updateGameplayShadowCamera(follow);
    }
    try {
      renderer.render(renderScene, renderCamera);
      checkRendererHealth();
    } catch (err) {
      renderDiagnostics.lastReason = "render-error";
      recoverRenderer("render-error");
    }
  }

  function clampCameraTarget(x, z, out) {
    var minTargetX = cameraMapBounds.minX - cameraGroundBounds.minX;
    var maxTargetX = cameraMapBounds.maxX - cameraGroundBounds.maxX;
    var minTargetZ = cameraMapBounds.minZ - cameraGroundBounds.minZ;
    var maxTargetZ = cameraMapBounds.maxZ - cameraGroundBounds.maxZ;
    var result = out || {};
    result.x = minTargetX > maxTargetX ? 0 : clamp(x, minTargetX, maxTargetX);
    result.z = minTargetZ > maxTargetZ ? 0 : clamp(z, minTargetZ, maxTargetZ);
    return result;
  }

  function updateGameplayShadowBounds() {
    if (!gameplaySun) return;
    var pad = 12;
    var minX = cameraGroundBounds.minX - pad;
    var maxX = cameraGroundBounds.maxX + pad;
    var minZ = cameraGroundBounds.minZ - pad;
    var maxZ = cameraGroundBounds.maxZ + pad;
    var minLightX = Infinity;
    var maxLightX = -Infinity;
    var minLightY = Infinity;
    var maxLightY = -Infinity;
    var minDepth = Infinity;
    var maxDepth = -Infinity;
    var sunDistance = gameplaySunOffset.length();
    var xs = [minX, maxX];
    var ys = [-1, 10];
    var zs = [minZ, maxZ];
    for (var xi = 0; xi < 2; xi++) {
      for (var yi = 0; yi < 2; yi++) {
        for (var zi = 0; zi < 2; zi++) {
          var x = xs[xi];
          var y = ys[yi];
          var z = zs[zi];
          var lightX = x * gameplaySunRight.x + y * gameplaySunRight.y + z * gameplaySunRight.z;
          var lightY = x * gameplaySunUp.x + y * gameplaySunUp.y + z * gameplaySunUp.z;
          var depth = sunDistance - (x * gameplaySunBack.x + y * gameplaySunBack.y + z * gameplaySunBack.z);
          minLightX = Math.min(minLightX, lightX);
          maxLightX = Math.max(maxLightX, lightX);
          minLightY = Math.min(minLightY, lightY);
          maxLightY = Math.max(maxLightY, lightY);
          minDepth = Math.min(minDepth, depth);
          maxDepth = Math.max(maxDepth, depth);
        }
      }
    }
    var edgeGuard = 2;
    var shadowCamera = gameplaySun.shadow.camera;
    shadowCamera.left = minLightX - edgeGuard;
    shadowCamera.right = maxLightX + edgeGuard;
    shadowCamera.bottom = minLightY - edgeGuard;
    shadowCamera.top = maxLightY + edgeGuard;
    shadowCamera.near = Math.max(0.1, minDepth - 4);
    shadowCamera.far = Math.max(shadowCamera.near + 1, maxDepth + 4);
    shadowCamera.updateProjectionMatrix();
    gameplayShadowTexelX = (shadowCamera.right - shadowCamera.left) / gameplaySun.shadow.mapSize.x;
    gameplayShadowTexelY = (shadowCamera.top - shadowCamera.bottom) / gameplaySun.shadow.mapSize.y;
    gameplayShadowBoundsDirty = false;
  }

  function updateGameplayShadowCamera(follow) {
    if (!gameplaySun || !follow) return;
    if (gameplayShadowBoundsDirty) updateGameplayShadowBounds();
    var anchor = gameplayShadowAnchorScratch.set(follow.x, 0, follow.z);
    if (gameplayShadowTexelX > 0 && gameplayShadowTexelY > 0) {
      var projectedX = anchor.dot(gameplaySunRight);
      var projectedY = anchor.dot(gameplaySunUp);
      var snapX = Math.round(projectedX / gameplayShadowTexelX) * gameplayShadowTexelX - projectedX;
      var snapY = Math.round(projectedY / gameplayShadowTexelY) * gameplayShadowTexelY - projectedY;
      anchor.addScaledVector(gameplaySunRight, snapX);
      anchor.addScaledVector(gameplaySunUp, snapY);
    }
    gameplaySun.target.position.copy(anchor);
    gameplaySun.position.copy(anchor).add(gameplaySunOffset);
  }

  function updateCameraGroundBounds() {
    var savedPosition = camera.position.clone();
    var savedQuaternion = camera.quaternion.clone();
    var savedTarget = cameraTarget.clone();
    camera.position.set(cameraBaseOffset.x, cameraBaseOffset.y, cameraBaseOffset.z);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);

    var minX = Infinity;
    var maxX = -Infinity;
    var minZ = Infinity;
    var maxZ = -Infinity;
    var corners = [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ];
    var ndc = new THREE.Vector2();
    var hit = new THREE.Vector3();
    for (var i = 0; i < corners.length; i++) {
      ndc.set(corners[i][0], corners[i][1]);
      raycaster.setFromCamera(ndc, camera);
      if (!raycaster.ray.intersectPlane(groundPlane, hit)) continue;
      minX = Math.min(minX, hit.x);
      maxX = Math.max(maxX, hit.x);
      minZ = Math.min(minZ, hit.z);
      maxZ = Math.max(maxZ, hit.z);
    }
    if (isFinite(minX) && isFinite(maxX) && isFinite(minZ) && isFinite(maxZ)) {
      cameraGroundBounds = { minX: minX, maxX: maxX, minZ: minZ, maxZ: maxZ };
      gameplayShadowBoundsDirty = true;
    }

    camera.position.copy(savedPosition);
    camera.quaternion.copy(savedQuaternion);
    cameraTarget.copy(savedTarget);
    camera.updateMatrixWorld(true);
  }

  function checkRendererHealth() {
    if (state.time < renderDiagnostics.nextHealthCheck) return;
    renderDiagnostics.nextHealthCheck = state.time + 1.5;
    var gl = renderer.getContext();
    if (!gl || (typeof gl.isContextLost === "function" && gl.isContextLost())) {
      renderDiagnostics.contextLost = true;
      recoverRenderer("isContextLost");
      return;
    }
  }

  function recoverRenderer(reason) {
    renderDiagnostics.lastReason = reason;
    renderDiagnostics.contextLost = false;
    renderDiagnostics.whiteFrames = 0;
    renderDiagnostics.recoveries += 1;
    renderDiagnostics.recreates += 1;

    var oldRenderer = renderer;
    var oldCanvas = oldRenderer.domElement;
    var newRenderer = createGameRenderer();
    renderer = newRenderer;
    root.insertBefore(newRenderer.domElement, oldCanvas);
    bindCanvasInput(newRenderer.domElement);
    if (oldCanvas.parentNode) oldCanvas.parentNode.removeChild(oldCanvas);
    try {
      oldRenderer.dispose();
    } catch (err) {}
    resize();
  }

  function loop(now) {
    var dt = Math.min(0.04, (now - lastFrame) / 1000 || FIXED_DT);
    lastFrame = now;
    update(dt);
    render();
    requestAnimationFrame(loop);
  }

  function resize() {
    var width = Math.max(1, window.innerWidth);
    var height = Math.max(1, window.innerHeight);
    renderer.setSize(width, height, false);
    var aspect = width / height;
    var frustum = height < 650 ? 34 : 31.5;
    camera.left = -frustum * aspect / 2;
    camera.right = frustum * aspect / 2;
    camera.top = frustum / 2;
    camera.bottom = -frustum / 2;
    camera.updateProjectionMatrix();
    menuCamera.aspect = aspect;
    menuCamera.updateProjectionMatrix();
    updateCameraGroundBounds();
  }

  function setPanel(el, visible) {
    el.classList.toggle("is-visible", !!visible);
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(function () {});
      lockLandscapeIfPossible();
    } else {
      document.exitFullscreen().catch(function () {});
    }
  }

  function lockLandscapeIfPossible() {
    if (screen.orientation && typeof screen.orientation.lock === "function") {
      screen.orientation.lock("landscape").catch(function () {});
    }
  }

  function rememberBase(mesh) {
    mesh.userData.basePosition = mesh.position.clone();
    mesh.userData.baseRotation = mesh.rotation.clone();
    mesh.userData.baseScale = mesh.scale.clone();
    return mesh;
  }

  function animateMesh(mesh, opts) {
    if (!mesh || !mesh.userData.basePosition || !mesh.userData.baseRotation) return;
    var bp = mesh.userData.basePosition;
    var br = mesh.userData.baseRotation;
    mesh.position.set(
      bp.x + (opts.x || 0),
      bp.y + (opts.y || 0),
      bp.z + (opts.z || 0)
    );
    mesh.rotation.set(
      br.x + (opts.rx || 0),
      br.y + (opts.ry || 0),
      br.z + (opts.rz || 0)
    );
  }

  function animateMeshValues(mesh, rx, ry, rz, x, y, z) {
    if (!mesh || !mesh.userData.basePosition || !mesh.userData.baseRotation) return;
    var bp = mesh.userData.basePosition;
    var br = mesh.userData.baseRotation;
    mesh.position.set(bp.x + (x || 0), bp.y + (y || 0), bp.z + (z || 0));
    mesh.rotation.set(br.x + (rx || 0), br.y + (ry || 0), br.z + (rz || 0));
  }

  function scaleFromBase(mesh, sx, sy, sz) {
    if (!mesh || !mesh.userData.baseScale) return;
    var bs = mesh.userData.baseScale;
    mesh.scale.set(bs.x * sx, bs.y * sy, bs.z * sz);
  }

  function animateWeaponMeshes(group, kick, intensity, armPose) {
    var rig = group.userData.weaponRig;
    if (!rig) return;
    var offhandRig = group.userData.offhandWeaponRig;
    var weaponId = state.weapon || "revolver";
    var bob = Math.sin(state.time * 9) * 0.012 * intensity;
    var recoil = weaponId === "launcher" ? 0.3 : weaponId === "coachGun" ? 0.28 : weaponId === "rifle" ? 0.22 : 0.16;
    var dualActive = weaponId === "revolver" && state.revolverUpgrade === "dualRevolvers";
    var rightKick = dualActive && state.lastDualShotSide < 0 ? kick * 0.22 : kick;
    var leftKick = dualActive && state.lastDualShotSide > 0 ? kick * 0.22 : kick;
    animateMesh(rig, {
      x: 0.03 * intensity + rightKick * 0.035,
      y: bob + rightKick * 0.035,
      z: -rightKick * recoil,
      rx: (armPose && armPose.rx ? armPose.rx : 0) - rightKick * (weaponId === "launcher" ? 0.22 : 0.14),
      ry: armPose && armPose.ry ? armPose.ry : 0,
      rz: armPose && armPose.rz ? armPose.rz : 0,
    });
    if (offhandRig) {
      animateMesh(offhandRig, {
        x: -0.03 * intensity - leftKick * 0.02,
        y: bob + leftKick * 0.03,
        z: dualActive ? -leftKick * 0.13 : 0,
        rx: -0.18 - leftKick * 0.12,
        ry: -0.08,
        rz: -0.04 * intensity,
      });
    }
  }

  function collectDeathDebrisParts(group) {
    var pieces = [];
    if (!group) return pieces;
    group.traverse(function (child) {
      if (!child.isMesh || child.userData.noDebris) return;
      if (pieces.length >= 13) return;
      pieces.push(child);
    });
    return pieces;
  }

  function getDeathDebrisPieces(enemy) {
    if (!enemy || !enemy.group || !enemy.group.userData) return [];
    var pieces = enemy.group.userData.deathDebrisParts;
    if (!pieces || !pieces.length) {
      pieces = collectDeathDebrisParts(enemy.group);
      enemy.group.userData.deathDebrisParts = pieces;
    }
    return pieces;
  }

  function createDeathDebris(enemy, reserved) {
    var originX = enemy.x;
    var originZ = enemy.z;
    var pieces = getDeathDebrisPieces(enemy);
    if (!reserved) reserveDebrisSlots(pieces.length);
    pieces.forEach(function (source, index) {
      var worldPos = deathDebrisWorldPosScratch;
      var worldQuat = deathDebrisWorldQuatScratch;
      source.getWorldPosition(worldPos);
      source.getWorldQuaternion(worldQuat);
      if (gameplayWarmupMode) {
        warmupDeathDebrisVisual(source, worldPos, worldQuat);
        return;
      }
      if (reserved && state.debris.length >= MAX_DEBRIS) reserveDebrisSlot();
      var visual = acquireDeathDebrisVisual(source, worldPos, worldQuat);
      var mesh = visual.mesh;

      var awayX = worldPos.x - originX;
      var awayZ = worldPos.z - originZ;
      var awayLen = Math.hypot(awayX, awayZ);
      if (awayLen < 0.001) {
        var angle = index * 2.399963 + rand(-0.3, 0.3);
        awayX = Math.cos(angle);
        awayZ = Math.sin(angle);
        awayLen = 1;
      }
      var force = rand(2.2, 6.8) * (enemy.type === "brute" ? 0.8 : 1);
      state.debris.push({
        visual: visual,
        mesh: mesh,
        x: worldPos.x,
        y: worldPos.y,
        z: worldPos.z,
        vx: (awayX / awayLen) * force + rand(-1.2, 1.2),
        vy: rand(2.4, 6.5),
        vz: (awayZ / awayLen) * force + rand(-1.2, 1.2),
        rx: rand(-5.5, 5.5),
        ry: rand(-5.5, 5.5),
        rz: rand(-5.5, 5.5),
        life: rand(1.8, 3.2),
        startLife: 3.2,
        startOpacity: 1,
      });
    });
  }

  function addBox(parent, w, h, d, mat, x, y, z) {
    var mesh = new THREE.Mesh(getSharedBoxGeometry(w, h, d), mat);
    mesh.position.set(x || 0, y || 0, z || 0);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.disposeGeometry = false;
    parent.add(mesh);
    return mesh;
  }

  function addSharedBox(parent, w, h, d, mat, x, y, z) {
    var mesh = new THREE.Mesh(getSharedBoxGeometry(w, h, d), mat);
    mesh.position.set(x || 0, y || 0, z || 0);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.disposeGeometry = false;
    parent.add(mesh);
    return mesh;
  }

  function getSharedBoxGeometry(w, h, d) {
    return getSharedGeometry("box:" + w + ":" + h + ":" + d, function () {
      return new THREE.BoxGeometry(w, h, d);
    });
  }

  function getSharedGeometry(key, factory) {
    if (!sharedGeometries[key]) sharedGeometries[key] = factory();
    return sharedGeometries[key];
  }

  function addContactShadow(parent, w, d, opacity) {
    var mat = mats.contactShadow.clone();
    mat.opacity = opacity;
    var mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = CONTACT_SHADOW_SURFACE_Y;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.renderOrder = -5;
    mesh.userData.noDebris = true;
    mesh.userData.disposeMaterial = true;
    parent.add(mesh);
    return mesh;
  }

  function removeObject3D(object) {
    if (!object) return;
    if (object.parent) object.parent.remove(object);
    disposeObject3D(object);
  }

  function disposeObject3D(object) {
    object.traverse(function (child) {
      if (child.geometry && child.userData.disposeGeometry !== false && typeof child.geometry.dispose === "function") {
        child.geometry.dispose();
      }
      if (child.material && child.userData && child.userData.disposeMaterial) {
        disposeMaterial(child.material);
      }
    });
  }

  function disposeMaterial(material) {
    if (Array.isArray(material)) {
      material.forEach(disposeMaterial);
      return;
    }
    if (!material) return;
    for (var key in material) {
      var value = material[key];
      if (value && value.isTexture && typeof value.dispose === "function") value.dispose();
    }
    if (typeof material.dispose === "function") material.dispose();
  }

  function countMaterialDiagnostics(material, seen) {
    if (Array.isArray(material)) {
      for (var i = 0; i < material.length; i++) countMaterialDiagnostics(material[i], seen);
      return;
    }
    if (material && seen.indexOf(material.uuid) === -1) seen.push(material.uuid);
  }

  function countObjectTree(rootObject) {
    var geometryIds = [];
    var materialIds = [];
    var stats = {
      children: rootObject && rootObject.children ? rootObject.children.length : 0,
      objects: 0,
      groups: 0,
      meshes: 0,
      lights: 0,
      uniqueGeometries: 0,
      uniqueMaterials: 0,
    };
    if (!rootObject || typeof rootObject.traverse !== "function") return stats;
    rootObject.traverse(function (object) {
      stats.objects += 1;
      if (object.isGroup) stats.groups += 1;
      if (object.isMesh) stats.meshes += 1;
      if (object.isLight) stats.lights += 1;
      if (object.geometry && geometryIds.indexOf(object.geometry.uuid) === -1) geometryIds.push(object.geometry.uuid);
      if (object.material) countMaterialDiagnostics(object.material, materialIds);
    });
    stats.uniqueGeometries = geometryIds.length;
    stats.uniqueMaterials = materialIds.length;
    return stats;
  }

  function getThreeObjectDiagnostics() {
    return {
      roots: {
        scene: countObjectTree(scene),
        worldRoot: countObjectTree(worldRoot),
        dynamicRoot: countObjectTree(dynamicRoot),
        effectRoot: countObjectTree(effectRoot),
        menuScene: countObjectTree(menuScene),
        menuWorldRoot: countObjectTree(menuWorldRoot),
        menuEffectRoot: countObjectTree(menuEffectRoot),
      },
      state: {
        enemies: state.enemies.length,
        bullets: state.bullets.length,
        coachGunTracers: state.coachGunTracers.length,
        particles: state.particles.length,
        smokePuffs: state.smokePuffs.length,
        shockwaves: state.shockwaves.length,
        lightFlashes: state.lightFlashes.length,
        lightningBolts: state.lightningBolts.length,
        decals: state.decals.length,
        debris: state.debris.length,
        acidProjectiles: state.acidProjectiles.length,
        acidPuddles: state.acidPuddles.length,
        firePatches: state.firePatches.length,
        xpOrbs: state.xpOrbs.length,
        rifleTraps: state.rifleTraps.length,
        ammoCrates: state.ammoCrates.length,
      },
      spatial: {
        obstacles: {
          cellSize: obstacleSpatialStats.cellSize,
          cellCount: obstacleSpatialStats.cellCount,
          maxBucketSize: obstacleSpatialStats.maxBucketSize,
          occupants: obstacleSpatialStats.occupants,
        },
        zombies: {
          cellSize: ZOMBIE_SPATIAL_CELL_SIZE,
          cellCount: zombieSpatialStats.cellCount,
          maxBucketSize: zombieSpatialStats.maxBucketSize,
          occupants: zombieSpatialStats.occupants,
        },
      },
      pools: {
        zombies: getZombiePoolStats(),
        firePatchVisuals: getFirePatchVisualPoolStats(),
        acidPuddleVisuals: getAcidPuddleVisualPoolStats(),
        rifleTrapVisuals: getRifleTrapVisualPoolStats(),
        explosionEffects: getExplosionEffectPoolStats(),
        particleVisuals: getParticleVisualPoolStats(),
        xpOrbVisuals: getXpOrbVisualPoolStats(),
        deathDebrisVisuals: getDeathDebrisVisualPoolStats(),
        projectileVisuals: getProjectileVisualPoolStats(),
      },
      limits: {
        particles: MAX_PARTICLES,
        smokePuffs: MAX_SMOKE_PUFFS,
        shockwaves: MAX_SHOCKWAVES,
        lightFlashes: MAX_LIGHT_FLASHES,
        lightningBolts: MAX_LIGHTNING_BOLTS,
        decals: MAX_DECALS,
        debris: MAX_DEBRIS,
        xpOrbs: MAX_XP_ORBS,
        rifleTraps: MAX_RIFLE_TRAPS,
        coachGunTracers: MAX_COACH_GUN_TRACERS,
      },
      rendererMemory: renderer && renderer.info && renderer.info.memory
        ? {
            geometries: renderer.info.memory.geometries,
            textures: renderer.info.memory.textures,
          }
        : null,
    };
  }

  function addObstacle(x, z, w, d, pad, type) {
    addObstacleRect(x, z, w, d, pad, type, 0);
  }

  function addRotatedObstacle(x, z, w, d, pad, rotation, type) {
    addObstacleRect(x, z, w, d, pad, type, rotation);
  }

  function addObstacleRect(x, z, w, d, pad, type, rotation) {
    var angle = Number(rotation) || 0;
    var obstacleType = type || "obstacle";
    var obstaclePad = pad || 0;
    var bounds = getRotatedRectBounds(w, d, angle);
    var rect = {
      x: x,
      z: z,
      halfW: w / 2,
      halfD: d / 2,
      pad: obstaclePad,
      rotation: angle,
      rotationCos: Math.cos(angle),
      rotationSin: Math.sin(angle),
      type: obstacleType,
      _obstacleQueryId: 0,
      minX: x - bounds.w / 2 - obstaclePad,
      maxX: x + bounds.w / 2 + obstaclePad,
      minZ: z - bounds.d / 2 - obstaclePad,
      maxZ: z + bounds.d / 2 + obstaclePad,
    };
    obstacleRects.push(rect);
    insertObstacleInSpatialGrid(rect);
    registerMapFootprint(obstacleType, x, z, bounds.w, bounds.d, obstaclePad, true);
  }

  function insertObstacleInSpatialGrid(rect) {
    if (!rect) return;
    var minCellX = getObstacleCell(rect.minX);
    var maxCellX = getObstacleCell(rect.maxX);
    var minCellZ = getObstacleCell(rect.minZ);
    var maxCellZ = getObstacleCell(rect.maxZ);
    for (var cellZ = minCellZ; cellZ <= maxCellZ; cellZ++) {
      for (var cellX = minCellX; cellX <= maxCellX; cellX++) {
        var key = getObstacleCellKey(cellX, cellZ);
        var bucket = obstacleSpatialGrid.get(key);
        if (!bucket) {
          bucket = [];
          obstacleSpatialGrid.set(key, bucket);
          obstacleSpatialGridKeys.push(key);
        }
        bucket.push(rect);
        if (bucket.length > obstacleSpatialStats.maxBucketSize) obstacleSpatialStats.maxBucketSize = bucket.length;
      }
    }
    obstacleSpatialStats.cellCount = obstacleSpatialGridKeys.length;
    obstacleSpatialStats.occupants = obstacleRects.length;
  }

  function getObstacleCell(value) {
    return Math.floor(value / OBSTACLE_SPATIAL_CELL_SIZE);
  }

  function getObstacleCellKey(cellX, cellZ) {
    return cellX * SPATIAL_CELL_KEY_STRIDE + cellZ;
  }

  function nextObstacleSpatialQueryId() {
    obstacleSpatialQueryId += 1;
    if (obstacleSpatialQueryId > 1000000000) obstacleSpatialQueryId = 1;
    return obstacleSpatialQueryId;
  }

  function visitObstaclesInCellRange(minCellX, maxCellX, minCellZ, maxCellZ, callback) {
    if (!obstacleSpatialGridKeys.length) {
      for (var i = 0; i < obstacleRects.length; i++) {
        if (callback(obstacleRects[i])) return true;
      }
      return false;
    }
    var queryId = nextObstacleSpatialQueryId();
    for (var cellZ = minCellZ; cellZ <= maxCellZ; cellZ++) {
      for (var cellX = minCellX; cellX <= maxCellX; cellX++) {
        var bucket = obstacleSpatialGrid.get(getObstacleCellKey(cellX, cellZ));
        if (!bucket) continue;
        for (var i = 0; i < bucket.length; i++) {
          var rect = bucket[i];
          if (rect._obstacleQueryId === queryId) continue;
          rect._obstacleQueryId = queryId;
          if (callback(rect)) return true;
        }
      }
    }
    return false;
  }

  function visitObstaclesNearCircle(x, z, radius, callback) {
    var r = Math.max(0, radius || 0);
    return visitObstaclesInCellRange(
      getObstacleCell(x - r),
      getObstacleCell(x + r),
      getObstacleCell(z - r),
      getObstacleCell(z + r),
      callback
    );
  }

  function visitObstaclesInAabb(minX, maxX, minZ, maxZ, callback) {
    return visitObstaclesInCellRange(
      getObstacleCell(minX),
      getObstacleCell(maxX),
      getObstacleCell(minZ),
      getObstacleCell(maxZ),
      callback
    );
  }

  function getRotatedRectBounds(w, d, rotation) {
    var angle = Number(rotation) || 0;
    var c = Math.abs(Math.cos(angle));
    var s = Math.abs(Math.sin(angle));
    return {
      w: w * c + d * s,
      d: w * s + d * c,
    };
  }

  function worldToRectLocal(x, z, rect) {
    var angle = rect.rotation || 0;
    var dx = x - rect.x;
    var dz = z - rect.z;
    if (!angle) return { x: dx, z: dz };
    var c = rect.rotationCos == null ? Math.cos(angle) : rect.rotationCos;
    var s = rect.rotationSin == null ? Math.sin(angle) : rect.rotationSin;
    return {
      x: dx * c - dz * s,
      z: dx * s + dz * c,
    };
  }

  function rectLocalDeltaToWorld(x, z, rotation) {
    var angle = rotation || 0;
    if (!angle) return { x: x, z: z };
    var c = Math.cos(angle);
    var s = Math.sin(angle);
    return {
      x: x * c + z * s,
      z: -x * s + z * c,
    };
  }

  function rectLocalPointToWorld(rect, x, z) {
    var delta = rectLocalDeltaToWorld(x, z, rect.rotation || 0);
    return {
      x: rect.x + delta.x,
      z: rect.z + delta.z,
    };
  }

  function resolveMoverPosition(mover, radius, boundsExtra) {
    var extra = boundsExtra || 0;
    mover.x = clamp(mover.x, -ARENA_W / 2 - extra + radius, ARENA_W / 2 + extra - radius);
    mover.z = clamp(mover.z, -ARENA_D / 2 - extra + radius, ARENA_D / 2 + extra - radius);
    for (var pass = 0; pass < 2; pass++) {
      moverObstacleQueryScratch.mover = mover;
      moverObstacleQueryScratch.radius = radius;
      moverObstacleQueryScratch.pushed = false;
      visitObstaclesNearCircle(mover.x, mover.z, radius + 4.0, resolveMoverObstacleCallback);
      if (!moverObstacleQueryScratch.pushed) break;
    }
    mover.x = clamp(mover.x, -ARENA_W / 2 - extra + radius, ARENA_W / 2 + extra - radius);
    mover.z = clamp(mover.z, -ARENA_D / 2 - extra + radius, ARENA_D / 2 + extra - radius);
  }

  function resolveMoverObstacleCallback(rect) {
    if (pushCircleOutOfRect(moverObstacleQueryScratch.mover, rect, moverObstacleQueryScratch.radius)) {
      moverObstacleQueryScratch.pushed = true;
    }
    return false;
  }

  function pushCircleOutOfRect(circle, rect, radius) {
    var minDist = radius + rect.pad;
    var angle = rect.rotation || 0;
    var c = rect.rotationCos == null ? Math.cos(angle) : rect.rotationCos;
    var s = rect.rotationSin == null ? Math.sin(angle) : rect.rotationSin;
    var worldDx = circle.x - rect.x;
    var worldDz = circle.z - rect.z;
    var localX = angle ? worldDx * c - worldDz * s : worldDx;
    var localZ = angle ? worldDx * s + worldDz * c : worldDz;
    var closestX = clamp(localX, -rect.halfW, rect.halfW);
    var closestZ = clamp(localZ, -rect.halfD, rect.halfD);
    var dx = localX - closestX;
    var dz = localZ - closestZ;
    var distSq = dx * dx + dz * dz;
    if (distSq >= minDist * minDist) return false;

    var pushX = 0;
    var pushZ = 0;
    if (distSq > 0.000001) {
      var dist = Math.sqrt(distSq);
      var push = minDist - dist;
      pushX = (dx / dist) * push;
      pushZ = (dz / dist) * push;
    } else {
      var left = Math.abs(localX + rect.halfW);
      var right = Math.abs(rect.halfW - localX);
      var top = Math.abs(localZ + rect.halfD);
      var bottom = Math.abs(rect.halfD - localZ);
      var minEdge = Math.min(left, right, top, bottom);
      if (minEdge === left) pushX = -rect.halfW - minDist - localX;
      else if (minEdge === right) pushX = rect.halfW + minDist - localX;
      else if (minEdge === top) pushZ = -rect.halfD - minDist - localZ;
      else pushZ = rect.halfD + minDist - localZ;
    }

    circle.x += angle ? pushX * c + pushZ * s : pushX;
    circle.z += angle ? -pushX * s + pushZ * c : pushZ;
    return true;
  }

  function pointHitsObstacle(x, z, radius) {
    pointObstacleQueryScratch.x = x;
    pointObstacleQueryScratch.z = z;
    pointObstacleQueryScratch.radius = radius;
    return visitObstaclesNearCircle(x, z, radius + 0.05, pointHitsObstacleCallback);
  }

  function pointHitsObstacleCallback(rect) {
    return circleIntersectsRect(pointObstacleQueryScratch.x, pointObstacleQueryScratch.z, pointObstacleQueryScratch.radius, rect);
  }

  function circleIntersectsRect(x, z, radius, rect) {
    var minDist = radius + rect.pad;
    var angle = rect.rotation || 0;
    var c = rect.rotationCos == null ? Math.cos(angle) : rect.rotationCos;
    var s = rect.rotationSin == null ? Math.sin(angle) : rect.rotationSin;
    var worldDx = x - rect.x;
    var worldDz = z - rect.z;
    var localX = angle ? worldDx * c - worldDz * s : worldDx;
    var localZ = angle ? worldDx * s + worldDz * c : worldDz;
    var closestX = clamp(localX, -rect.halfW, rect.halfW);
    var closestZ = clamp(localZ, -rect.halfD, rect.halfD);
    var dx = localX - closestX;
    var dz = localZ - closestZ;
    return dx * dx + dz * dz < minDist * minDist;
  }

  function pointInsideEnemyBounds(x, z, radius) {
    return (
      x >= -ARENA_W / 2 - ENEMY_BOUNDS_EXTRA + radius &&
      x <= ARENA_W / 2 + ENEMY_BOUNDS_EXTRA - radius &&
      z >= -ARENA_D / 2 - ENEMY_BOUNDS_EXTRA + radius &&
      z <= ARENA_D / 2 + ENEMY_BOUNDS_EXTRA - radius
    );
  }

  function obstacleClearanceAt(x, z, radius) {
    clearanceObstacleQueryScratch.x = x;
    clearanceObstacleQueryScratch.z = z;
    clearanceObstacleQueryScratch.radius = radius;
    clearanceObstacleQueryScratch.best = 3;
    visitObstaclesNearCircle(x, z, radius + 3.05, obstacleClearanceCallback);
    return clamp(clearanceObstacleQueryScratch.best, -2, 3);
  }

  function obstacleClearanceCallback(rect) {
    var query = clearanceObstacleQueryScratch;
    var angle = rect.rotation || 0;
    var c = rect.rotationCos == null ? Math.cos(angle) : rect.rotationCos;
    var s = rect.rotationSin == null ? Math.sin(angle) : rect.rotationSin;
    var worldDx = query.x - rect.x;
    var worldDz = query.z - rect.z;
    var localX = angle ? worldDx * c - worldDz * s : worldDx;
    var localZ = angle ? worldDx * s + worldDz * c : worldDz;
    var closestX = clamp(localX, -rect.halfW, rect.halfW);
    var closestZ = clamp(localZ, -rect.halfD, rect.halfD);
    var dx = localX - closestX;
    var dz = localZ - closestZ;
    var clearance = Math.sqrt(dx * dx + dz * dz) - (query.radius + rect.pad);
    query.best = Math.min(query.best, clearance);
    return false;
  }

  function findBlockingObstacle(x1, z1, x2, z2, radius, ignoreRect) {
    var query = blockingObstacleQueryScratch;
    query.x1 = x1;
    query.z1 = z1;
    query.x2 = x2;
    query.z2 = z2;
    query.radius = radius;
    query.ignoreRect = ignoreRect;
    query.bestRect = null;
    query.bestT = Infinity;
    var queryPad = radius + 0.75;
    visitObstaclesInAabb(
      Math.min(x1, x2) - queryPad,
      Math.max(x1, x2) + queryPad,
      Math.min(z1, z2) - queryPad,
      Math.max(z1, z2) + queryPad,
      findBlockingObstacleCallback
    );
    if (!query.bestRect) return null;
    var result = blockingObstacleResultPool[blockingObstacleResultCursor];
    blockingObstacleResultCursor = (blockingObstacleResultCursor + 1) % blockingObstacleResultPool.length;
    result.rect = query.bestRect;
    result.t = query.bestT;
    return result;
  }

  function findBlockingObstacleCallback(rect) {
    var query = blockingObstacleQueryScratch;
    if (rect === query.ignoreRect) return false;
    var t = segmentExpandedRectEntry(query.x1, query.z1, query.x2, query.z2, rect, query.radius);
    if (t !== null && t > 0.015 && t < query.bestT) {
      query.bestT = t;
      query.bestRect = rect;
    }
    return false;
  }

  function segmentExpandedRectEntry(x1, z1, x2, z2, rect, radius) {
    var angle = rect.rotation || 0;
    var c = rect.rotationCos == null ? Math.cos(angle) : rect.rotationCos;
    var s = rect.rotationSin == null ? Math.sin(angle) : rect.rotationSin;
    var startWorldX = x1 - rect.x;
    var startWorldZ = z1 - rect.z;
    var endWorldX = x2 - rect.x;
    var endWorldZ = z2 - rect.z;
    var startX = angle ? startWorldX * c - startWorldZ * s : startWorldX;
    var startZ = angle ? startWorldX * s + startWorldZ * c : startWorldZ;
    var endX = angle ? endWorldX * c - endWorldZ * s : endWorldX;
    var endZ = angle ? endWorldX * s + endWorldZ * c : endWorldZ;
    var minX = -rect.halfW - rect.pad - radius;
    var maxX = rect.halfW + rect.pad + radius;
    var minZ = -rect.halfD - rect.pad - radius;
    var maxZ = rect.halfD + rect.pad + radius;
    var dx = endX - startX;
    var dz = endZ - startZ;
    var tMin = 0;
    var tMax = 1;

    if (Math.abs(dx) < 0.000001) {
      if (startX < minX || startX > maxX) return null;
    } else {
      var tx1 = (minX - startX) / dx;
      var tx2 = (maxX - startX) / dx;
      if (tx1 > tx2) {
        var txSwap = tx1;
        tx1 = tx2;
        tx2 = txSwap;
      }
      tMin = Math.max(tMin, tx1);
      tMax = Math.min(tMax, tx2);
      if (tMin > tMax) return null;
    }

    if (Math.abs(dz) < 0.000001) {
      if (startZ < minZ || startZ > maxZ) return null;
    } else {
      var tz1 = (minZ - startZ) / dz;
      var tz2 = (maxZ - startZ) / dz;
      if (tz1 > tz2) {
        var tzSwap = tz1;
        tz1 = tz2;
        tz2 = tzSwap;
      }
      tMin = Math.max(tMin, tz1);
      tMax = Math.min(tMax, tz2);
      if (tMin > tMax) return null;
    }

    return tMin;
  }

  function material(color, roughness, metalness, emissive, emissiveIntensity) {
    return new THREE.MeshStandardMaterial({
      color: color,
      roughness: roughness,
      metalness: metalness,
      emissive: emissive || 0x000000,
      emissiveIntensity: emissiveIntensity || 0,
    });
  }

  function rand(min, max) {
    return min + (max - min) * rng();
  }

  function createMapSeed() {
    var params = new URLSearchParams(window.location.search || "");
    if (params.has("mapSeed")) {
      var explicit = Number(params.get("mapSeed"));
      if (Number.isFinite(explicit)) return (Math.max(1, Math.floor(explicit)) >>> 0) || 7331;
    }
    return ((Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0) || 7331;
  }

  function mapRand(min, max) {
    return min + (max - min) * mapRng();
  }

  function scaleMapCount(base) {
    return Math.max(1, Math.round(base * MAP_LINEAR_SCALE));
  }

  function createMainTowns() {
    MAIN_TOWN_TARGET = MAIN_TOWN_MIN + Math.floor(mapRng() * (MAIN_TOWN_MAX - MAIN_TOWN_MIN + 1));
    var centers = chooseMainTownCenters(MAIN_TOWN_TARGET);
    if (!centers.length) centers.push({ x: 0, z: 0 });
    return centers.map(function (center, index) {
      return makeMainTown(center, index);
    });
  }

  function chooseMainTownCenters(target) {
    var candidates = createMainTownCandidates();
    if (target <= 2) {
      var pair = chooseFarthestTownPair(candidates);
      if (pair.length) return pair.slice(0, target);
    }

    var chosen = chooseRandomSpreadTownSeed(candidates);
    if (!chosen.length) chosen.push(createMainTownCenter());
    while (chosen.length < target) {
      var next = chooseWeightedSpreadTownCenter(candidates, chosen, target);
      if (next) {
        chosen.push(next);
      } else {
        var fallback = findFallbackTownCenter(chosen);
        if (!fallback) break;
        chosen.push(fallback);
      }
    }
    return chosen.slice(0, target);
  }

  function createMainTownCandidates() {
    var bounds = getMainTownCenterBounds();
    var candidates = [
      { x: bounds.minX, z: bounds.minZ },
      { x: bounds.maxX, z: bounds.minZ },
      { x: bounds.minX, z: bounds.maxZ },
      { x: bounds.maxX, z: bounds.maxZ },
      { x: (bounds.minX + bounds.maxX) / 2, z: bounds.minZ },
      { x: (bounds.minX + bounds.maxX) / 2, z: bounds.maxZ },
      { x: bounds.minX, z: (bounds.minZ + bounds.maxZ) / 2 },
      { x: bounds.maxX, z: (bounds.minZ + bounds.maxZ) / 2 },
      { x: (bounds.minX + bounds.maxX) / 2, z: (bounds.minZ + bounds.maxZ) / 2 },
    ];
    for (var i = 0; i < 180; i++) candidates.push(createMainTownCenter());
    return candidates;
  }

  function townRefsFromCenters(chosen) {
    return chosen.map(function (point, index) {
      return { center: point, index: index };
    });
  }

  function chooseRandomSpreadTownSeed(candidates) {
    if (!candidates.length) return [];
    var start = candidates[Math.floor(mapRng() * candidates.length)];
    return start ? [start] : [];
  }

  function chooseWeightedSpreadTownCenter(candidates, chosen, target) {
    var towns = townRefsFromCenters(chosen);
    var scored = scoreTownCandidates(candidates, chosen, towns);
    if (!scored.length) return null;

    var bestScore = scored[0].score;
    for (var i = 1; i < scored.length; i++) bestScore = Math.max(bestScore, scored[i].score);
    var keepRatio = target >= 5 ? 0.48 : target === 4 ? 0.54 : 0.62;
    var threshold = bestScore * keepRatio;
    var pool = scored.filter(function (entry) {
      return entry.score >= threshold;
    });
    if (!pool.length) pool = scored;
    return pickWeightedTownCandidate(pool);
  }

  function scoreTownCandidates(candidates, chosen, towns) {
    var scored = [];
    for (var i = 0; i < candidates.length; i++) {
      var center = candidates[i];
      if (!isTownCenterFarEnough(center, towns)) continue;
      if (townCenterAlreadyChosen(center, chosen)) continue;
      scored.push({
        center: center,
        score: getTownPlacementScore(center, towns),
      });
    }
    return scored;
  }

  function pickWeightedTownCandidate(scored) {
    var minScore = Infinity;
    for (var i = 0; i < scored.length; i++) minScore = Math.min(minScore, scored[i].score);
    var total = 0;
    for (var j = 0; j < scored.length; j++) {
      scored[j].weight = Math.pow(Math.max(1, scored[j].score - minScore + 24), 1.35);
      total += scored[j].weight;
    }
    var roll = mapRng() * total;
    for (var k = 0; k < scored.length; k++) {
      roll -= scored[k].weight;
      if (roll <= 0) return scored[k].center;
    }
    return scored[scored.length - 1].center;
  }

  function chooseFarthestTownPair(candidates) {
    var bestDistance = -Infinity;
    var topPairs = [];
    for (var i = 0; i < candidates.length; i++) {
      for (var j = i + 1; j < candidates.length; j++) {
        if (!isTownCenterFarEnough(candidates[i], [{ center: candidates[j] }])) continue;
        var distance = Math.hypot(candidates[i].x - candidates[j].x, candidates[i].z - candidates[j].z);
        if (distance > bestDistance + 6) {
          bestDistance = distance;
          topPairs = [{ a: candidates[i], b: candidates[j], distance: distance }];
        } else if (distance >= bestDistance - 6) {
          topPairs.push({ a: candidates[i], b: candidates[j], distance: distance });
        }
      }
    }
    if (!topPairs.length) return [];
    var best = topPairs[Math.floor(mapRng() * topPairs.length)];
    return [best.a, best.b];
  }

  function townCenterAlreadyChosen(center, chosen) {
    for (var i = 0; i < chosen.length; i++) {
      if (Math.hypot(center.x - chosen[i].x, center.z - chosen[i].z) < 1) return true;
    }
    return false;
  }

  function findFallbackTownCenter(chosen) {
    var towns = chosen.map(function (point, index) {
      return { center: point, index: index };
    });
    var best = null;
    for (var attempt = 0; attempt < 300; attempt++) {
      var center = createMainTownCenter();
      if (!isTownCenterFarEnough(center, towns)) continue;
      var score = getTownPlacementScore(center, towns);
      if (!best || score > best.score) best = { center: center, score: score };
    }
    return best ? best.center : null;
  }

  function makeMainTown(center, index) {
    return {
      index: index,
      center: center,
      layout: createMainTownLayout(),
    };
  }

  function createMainTownCenter() {
    var bounds = getMainTownCenterBounds();
    return {
      x: mapRand(bounds.minX, bounds.maxX),
      z: mapRand(bounds.minZ, bounds.maxZ),
    };
  }

  function getMainTownCenterBounds() {
    var safeX = CITY_W / 2 + 14;
    var safeZ = CITY_D / 2 + 14;
    return {
      minX: -ARENA_W / 2 + safeX,
      maxX: ARENA_W / 2 - safeX,
      minZ: -ARENA_D / 2 + safeZ,
      maxZ: ARENA_D / 2 - safeZ,
    };
  }

  function isTownCenterFarEnough(center, towns) {
    if (!towns.length) return true;
    for (var i = 0; i < towns.length; i++) {
      var other = towns[i].center;
      var dx = Math.abs(center.x - other.x);
      var dz = Math.abs(center.z - other.z);
      if (dx < CITY_W + 34 && dz < CITY_D + 30) return false;
      if (Math.hypot(dx, dz) < Math.max(112, CITY_W * 1.85)) return false;
    }
    return true;
  }

  function getTownPlacementScore(center, towns) {
    if (!towns.length) return 1;
    var minDistance = Infinity;
    var minAabbClearance = Infinity;
    var edgeDistance = Math.min(ARENA_W / 2 - Math.abs(center.x), ARENA_D / 2 - Math.abs(center.z));
    for (var i = 0; i < towns.length; i++) {
      var other = towns[i].center;
      var dx = Math.abs(center.x - other.x);
      var dz = Math.abs(center.z - other.z);
      minDistance = Math.min(minDistance, Math.hypot(dx, dz));
      minAabbClearance = Math.min(minAabbClearance, Math.max(dx - (CITY_W + 34), dz - (CITY_D + 30)));
    }
    return minDistance * 0.72 + Math.max(minAabbClearance, 0) * 0.2 + edgeDistance * 0.08;
  }

  function createMainTownLayout() {
    return {
      mirrorX: mapRng() < 0.5,
      mirrorZ: mapRng() < 0.5,
      variant: Math.floor(mapRng() * 4),
    };
  }

  function randomMainTown() {
    return MAIN_TOWNS[Math.floor(mapRng() * MAIN_TOWNS.length)] || MAIN_TOWNS[0];
  }

  function nearestMainTown(x, z) {
    var nearest = MAIN_TOWNS[0];
    var nearestDistance = Infinity;
    for (var i = 0; i < MAIN_TOWNS.length; i++) {
      var town = MAIN_TOWNS[i];
      var distance = Math.hypot(x - town.center.x, z - town.center.z);
      if (distance < nearestDistance) {
        nearest = town;
        nearestDistance = distance;
      }
    }
    return nearest;
  }

  function withMainTown(town, fn) {
    var previousCenter = MAIN_TOWN_CENTER;
    var previousLayout = MAIN_TOWN_LAYOUT;
    MAIN_TOWN_CENTER = town.center;
    MAIN_TOWN_LAYOUT = town.layout;
    try {
      return fn();
    } finally {
      MAIN_TOWN_CENTER = previousCenter;
      MAIN_TOWN_LAYOUT = previousLayout;
    }
  }

  function createPlayerStart() {
    var roll = mapRng();
    if (roll < 0.32) {
      var town = randomMainTown();
      return makePlayerStart(townLocalXFor(town, mapRand(-4.8, 4.8)), townLocalZFor(town, mapRand(-3.8, 4.8)), "town");
    }
    if (roll < 0.62) return createSettledOutskirtStart();
    if (roll < 0.84) return createOpenDesertStart();
    return createWastelandStart();
  }

  function createSettledOutskirtStart() {
    var town = randomMainTown();
    var side = Math.floor(mapRng() * 4);
    if (side === 0) {
      return makePlayerStart(
        clamp(town.center.x + mapRand(-16, 18), -ARENA_W / 2 + 7, ARENA_W / 2 - 7),
        clamp(town.center.z - CITY_D / 2 - mapRand(5.5, 13.5), -ARENA_D / 2 + 7, ARENA_D / 2 - 7),
        "settled-outskirts"
      );
    }
    if (side === 1) {
      return makePlayerStart(
        clamp(town.center.x + mapRand(-16, 18), -ARENA_W / 2 + 7, ARENA_W / 2 - 7),
        clamp(town.center.z + CITY_D / 2 + mapRand(5.5, 13.5), -ARENA_D / 2 + 7, ARENA_D / 2 - 7),
        "settled-outskirts"
      );
    }
    if (side === 2) {
      return makePlayerStart(
        clamp(town.center.x - CITY_W / 2 - mapRand(5.5, 15.5), -ARENA_W / 2 + 7, ARENA_W / 2 - 7),
        clamp(town.center.z + mapRand(-18, 18), -ARENA_D / 2 + 7, ARENA_D / 2 - 7),
        "settled-outskirts"
      );
    }
    return makePlayerStart(
      clamp(town.center.x + CITY_W / 2 + mapRand(5.5, 15.5), -ARENA_W / 2 + 7, ARENA_W / 2 - 7),
      clamp(town.center.z + mapRand(-18, 18), -ARENA_D / 2 + 7, ARENA_D / 2 - 7),
      "settled-outskirts"
    );
  }

  function createOpenDesertStart() {
    for (var attempt = 0; attempt < 36; attempt++) {
      var x = mapRand(-ARENA_W / 2 + 7, ARENA_W / 2 - 7);
      var z = mapRand(-ARENA_D / 2 + 7, ARENA_D / 2 - 7);
      if (pointNearAnyMainTown(x, z, 5)) continue;
      return makePlayerStart(x, z, "open-desert");
    }
    return createSettledOutskirtStart();
  }

  function createWastelandStart() {
    for (var attempt = 0; attempt < 24; attempt++) {
      var x = mapRand(-ARENA_W / 2 + 7, -CITY_W / 2 - 6.5);
      var z = mapRand(-ARENA_D / 2 + 7, ARENA_D / 2 - 7);
      if (!pointNearAnyMainTown(x, z, 4)) return makePlayerStart(x, z, "wasteland");
    }
    return createOpenDesertStart();
  }

  function makePlayerStart(x, z, zone) {
    return {
      x: clamp(x, -ARENA_W / 2 + 5, ARENA_W / 2 - 5),
      z: clamp(z, -ARENA_D / 2 + 5, ARENA_D / 2 - 5),
      zone: zone,
    };
  }

  function townLocalX(x) {
    return MAIN_TOWN_CENTER.x + (MAIN_TOWN_LAYOUT.mirrorX ? -x : x);
  }

  function townLocalZ(z) {
    return MAIN_TOWN_CENTER.z + (MAIN_TOWN_LAYOUT.mirrorZ ? -z : z);
  }

  function townLocalXFor(town, x) {
    return town.center.x + (town.layout.mirrorX ? -x : x);
  }

  function townLocalZFor(town, z) {
    return town.center.z + (town.layout.mirrorZ ? -z : z);
  }

  function pointNearAnyMainTown(x, z, extra) {
    var margin = extra || 0;
    for (var i = 0; i < MAIN_TOWNS.length; i++) {
      var c = MAIN_TOWNS[i].center;
      if (Math.abs(x - c.x) < CITY_W / 2 + margin && Math.abs(z - c.z) < CITY_D / 2 + margin) return true;
    }
    return false;
  }

  function pointNearAnyMainRoad(x, z) {
    for (var i = 0; i < MAIN_TOWNS.length; i++) {
      var c = MAIN_TOWNS[i].center;
      var inTownX = Math.abs(x - c.x) < CITY_W / 2 + 6;
      var inTownZ = Math.abs(z - c.z) < CITY_D / 2 + 6;
      if (inTownX && Math.abs(z - c.z) < 4.6) return true;
      if (inTownZ && Math.abs(x - c.x) < 5.2) return true;
    }
    return false;
  }

  function isMobileRuntime() {
    var coarse = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
    var ua = navigator.userAgent || "";
    return coarse || /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function mulberry32(seed) {
    return function () {
      var t = (seed += 0x6d2b79f5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  window.advanceTime = function (ms) {
    var steps = Math.max(1, Math.min(MAX_ADVANCE_STEPS, Math.round(ms / (1000 / 60))));
    for (var i = 0; i < steps; i++) update(FIXED_DT);
    render();
  };

  window.render_game_to_text = function () {
    var p = state.player;
    var visibleGround = getCurrentVisibleGroundRect();
    return JSON.stringify({
      coordinateSystem: "origin arena center; x east/right; z south/down; y up",
      mode: state.mode,
      paused: !!state.paused,
      wave: state.wave,
      waveSpawnTarget: state.waveSpawnTarget || getWaveZombieCount(state.wave),
      waveSpawnMultiplier: getWaveZombieMultiplier(state.wave),
      waveSpawnBatchSize: getWaveSpawnBatchSize(state.wave),
      spawnInterval: Number((state.spawnInterval || getWaveSpawnInterval(state.wave)).toFixed(2)),
      waveRemaining: getWaveRemainingCount(),
      waveElapsed: Number((state.waveElapsed || 0).toFixed(2)),
      waveLowRemainingTimer: Number((state.waveLowRemainingTimer || 0).toFixed(2)),
      waveNextTimer: Number((state.nextWaveTimer || 0).toFixed(2)),
      waveHardLimit: WAVE_HARD_LIMIT,
      waveLowRemainingDelay: WAVE_LOW_REMAINING_DELAY,
      score: state.score,
      kills: state.kills,
      shotsFired: state.shotsFired,
      map: {
        seed: MAP_SEED,
        arenaW: ARENA_W,
        arenaD: ARENA_D,
        cityW: CITY_W,
        cityD: CITY_D,
        mapSizeMultiplier: MAP_SIZE_MULTIPLIER,
        outskirtMargin: OUTSKIRT_MARGIN,
        outskirtMarginX: MAP_OUTSKIRT_X,
        outskirtMarginZ: MAP_OUTSKIRT_Z,
        microSettlementTarget: MICRO_SETTLEMENT_TARGET,
        interestPointTarget: INTEREST_POINT_TARGET,
        interestPointCount: interestPointStats.length,
        mainTownTarget: MAIN_TOWN_TARGET,
        mainTownCount: MAIN_TOWNS.length,
        mainTown: {
          x: Number(MAIN_TOWN_CENTER.x.toFixed(2)),
          z: Number(MAIN_TOWN_CENTER.z.toFixed(2)),
          mirrorX: MAIN_TOWN_LAYOUT.mirrorX,
          mirrorZ: MAIN_TOWN_LAYOUT.mirrorZ,
          variant: MAIN_TOWN_LAYOUT.variant,
        },
        mainTowns: MAIN_TOWNS.map(function (town) {
          return {
            index: town.index,
            x: Number(town.center.x.toFixed(2)),
            z: Number(town.center.z.toFixed(2)),
            mirrorX: town.layout.mirrorX,
            mirrorZ: town.layout.mirrorZ,
            variant: town.layout.variant,
          };
        }),
        mainTownMinDistance: getMainTownMinDistance(),
        mainTownMaxDistance: getMainTownMaxDistance(),
        mainTownSpread: getMainTownSpread(),
        interestPoints: interestPointStats.map(function (point) {
          return {
            type: point.type,
            x: Number(point.x.toFixed(2)),
            z: Number(point.z.toFixed(2)),
          };
        }),
        playerStart: {
          x: Number(PLAYER_START.x.toFixed(2)),
          z: Number(PLAYER_START.z.toFixed(2)),
          zone: PLAYER_START.zone,
        },
        wasteland: {
          minX: Number((-ARENA_W / 2).toFixed(2)),
          maxX: Number((-CITY_W / 2 - 2.6).toFixed(2)),
        },
      },
      camera: {
        targetX: Number(cameraTarget.x.toFixed(2)),
        targetZ: Number(cameraTarget.z.toFixed(2)),
        viewGround: {
          minX: Number(cameraGroundBounds.minX.toFixed(2)),
          maxX: Number(cameraGroundBounds.maxX.toFixed(2)),
          minZ: Number(cameraGroundBounds.minZ.toFixed(2)),
          maxZ: Number(cameraGroundBounds.maxZ.toFixed(2)),
        },
        mapBounds: {
          minX: Number(cameraMapBounds.minX.toFixed(2)),
          maxX: Number(cameraMapBounds.maxX.toFixed(2)),
          minZ: Number(cameraMapBounds.minZ.toFixed(2)),
          maxZ: Number(cameraMapBounds.maxZ.toFixed(2)),
        },
        visibleGround: {
          minX: Number(visibleGround.minX.toFixed(2)),
          maxX: Number(visibleGround.maxX.toFixed(2)),
          minZ: Number(visibleGround.minZ.toFixed(2)),
          maxZ: Number(visibleGround.maxZ.toFixed(2)),
        },
      },
      optimization: {
        obstacleSpatialGrid: {
          cellSize: obstacleSpatialStats.cellSize,
          cellCount: obstacleSpatialStats.cellCount,
          maxBucketSize: obstacleSpatialStats.maxBucketSize,
          occupants: obstacleSpatialStats.occupants,
        },
        zombiePools: getZombiePoolStats(),
        zombieSpatialGrid: {
          cellSize: ZOMBIE_SPATIAL_CELL_SIZE,
          cellCount: zombieSpatialStats.cellCount,
          maxBucketSize: zombieSpatialStats.maxBucketSize,
          occupants: zombieSpatialStats.occupants,
        },
        firePatchVisualPools: getFirePatchVisualPoolStats(),
        acidPuddleVisualPools: getAcidPuddleVisualPoolStats(),
        rifleTrapVisualPools: getRifleTrapVisualPoolStats(),
        explosionEffectPools: getExplosionEffectPoolStats(),
        particleVisualPools: getParticleVisualPoolStats(),
        projectileVisualPools: getProjectileVisualPoolStats(),
      },
      weapon: state.weapon,
      progression: {
        level: state.level,
        xp: state.xp,
        xpToNext: state.xpToNext,
        totalXp: state.totalXp,
        levelUps: state.levelUps,
        playerClass: state.playerClass,
        classChoicePending: state.classChoicePending,
        classChoiceLevel: CLASS_CHOICE_LEVEL,
        revolverUpgrade: state.revolverUpgrade,
        revolverUpgradePending: state.revolverUpgradePending,
        revolverUpgradeLevel: REVOLVER_UPGRADE_LEVEL,
        rifleUpgrade: state.rifleUpgrade,
        rifleUpgradePending: state.rifleUpgradePending,
        rifleUpgradeLevel: RIFLE_UPGRADE_LEVEL,
        launcherUpgrade: state.launcherUpgrade,
        launcherUpgradePending: state.launcherUpgradePending,
        launcherUpgradeLevel: LAUNCHER_UPGRADE_LEVEL,
        marshalUpgrade: state.marshalUpgrade,
        marshalUpgradePending: state.marshalUpgradePending,
        marshalUpgradeLevel: MARSHAL_UPGRADE_LEVEL,
        standardUpgradePending: state.standardUpgradePending,
        standardUpgradeLevel: state.standardUpgradeLevel,
        standardUpgradeChoices: state.standardUpgradeChoices.map(function (spec) {
          return spec.id;
        }),
        revolverSpecialLevel: isRevolverSpecialUpgradeLevel(state.standardUpgradeLevel),
        rifleSpecialLevel: isRifleSpecialUpgradeLevel(state.standardUpgradeLevel),
        launcherSpecialLevel: isLauncherSpecialUpgradeLevel(state.standardUpgradeLevel),
        marshalSpecialLevel: isMarshalSpecialUpgradeLevel(state.standardUpgradeLevel),
        pendingStandardUpgrades: state.pendingStandardUpgradeLevels.length,
        standardUpgradesChosen: state.standardUpgradesChosen,
        upgrades: Object.assign({}, state.upgradeCounts),
        revolverSpecial: {
          nextStartLevel: REVOLVER_SPECIAL_START_LEVEL,
          interval: REVOLVER_SPECIAL_INTERVAL,
          fanTheHammerTimer: Number((state.fanTheHammerTimer || 0).toFixed(2)),
          duelistFocus: Number((state.duelistFocus || 0).toFixed(2)),
          dualRicochets: getDualRicochetLimit(),
          allRightAllLeft: hasAllRightAllLeft(),
          dualHands: getAmmoState("revolver").dualHands || null,
          dualFreeReloadsEarned: state.dualFreeReloadsEarned || 0,
          bigIronShotsFired: state.bigIronShotsFired || 0,
          bigIronRuptures: state.bigIronRuptures || 0,
          silverBulletAmmoKills: state.silverBulletAmmoKills || 0,
          leadBloomShots: state.leadBloomShots || 0,
          nextDualShotSide: state.dualShotSide || 0,
          lastDualShotSide: state.lastDualShotSide || 0,
        },
        rifleSpecial: {
          nextStartLevel: RIFLE_SPECIAL_START_LEVEL,
          interval: RIFLE_SPECIAL_INTERVAL,
          shotsFired: state.rifleShotsFired || 0,
          lightningInterval: RIFLE_LIGHTNING_SHOT_INTERVAL,
          lightningTargets: getRifleLightningTargetCount(),
          lightningStrikes: state.rifleLightningStrikes || 0,
          stormTempoTimer: Number((state.rifleStormTempoTimer || 0).toFixed(2)),
          killReloadCounter: state.rifleKillReloadCounter || 0,
          magazineMultiplier: state.rifleMagazineMultiplier || 1,
          autoTrapInterval: Number(getRifleAutoTrapInterval().toFixed(2)),
          autoTrapBaseInterval: RIFLE_AUTO_TRAP_BASE_INTERVAL,
          autoTrapMinInterval: RIFLE_AUTO_TRAP_MIN_INTERVAL,
          autoTrapFrequency: state.rifleAutoTrapFrequency || 0,
          trapTriggers: state.rifleTrapTriggers || 0,
          trapAmmoRestored: state.rifleTrapAmmoRestored || 0,
          trapBonusXp: state.rifleTrapBonusXp || 0,
          activeTraps: state.rifleTraps.length,
        },
        launcherSpecial: {
          nextStartLevel: LAUNCHER_SPECIAL_START_LEVEL,
          interval: LAUNCHER_SPECIAL_INTERVAL,
          branch: state.launcherUpgrade,
          shotsFired: state.launcherShotsFired || 0,
          magazineMultiplier: state.launcherMagazineMultiplier || 1,
          chainDetonationLimit: getLauncherChainDetonationLimit(),
          chainDetonations: state.launcherChainDetonations || 0,
          bomblets: state.launcherBomblets || 0,
          shrapnelShots: state.launcherShrapnelShots || 0,
          powderEchoes: state.launcherPowderEchoes || 0,
          ammoRefills: state.launcherAmmoRefills || 0,
          fullSalvoKillThreshold: LAUNCHER_FULL_SALVO_KILL_THRESHOLD,
          madmanStacks: state.launcherMadmanStacks || 0,
          madmanTriggers: state.launcherMadmanTriggers || 0,
          madmanFireRate: Number(getLauncherMadmanFireRateMultiplier().toFixed(2)),
          fireKills: state.launcherFireKills || 0,
          fireBonusXp: state.launcherFireBonusXp || 0,
          backdrafts: state.launcherBackdrafts || 0,
          thermitePatches: state.launcherThermitePatches || 0,
          freeShots: state.launcherFreeShots || 0,
          crossfireShards: state.launcherCrossfireShards || 0,
          crossfireRange: Number(getLauncherCrossfireRange().toFixed(2)),
          firePuddlesDefault: hasPyrotechnicianFirePuddles(),
          fireBuffDefault: hasPyrotechnicianFireBuff(),
          fireBuffActive: !!state.launcherFireBuffActive,
          fireRadius: Number(getLauncherFireRadius().toFixed(2)),
          fireLife: Number(getLauncherFireLife().toFixed(2)),
          fireDamage: getLauncherFireDamage(),
          blastRadius: Number(getLauncherBlastRadius().toFixed(2)),
          blastDamage: Number(getLauncherBlastDamage().toFixed(2)),
          cascadeWarmup: {
            pending: !!launcherCascadeWarmup.pending,
            completed: !!launcherCascadeWarmup.completed,
            stage: launcherCascadeWarmup.stage,
            steps: launcherCascadeWarmup.steps,
            lastMs: Number((launcherCascadeWarmup.lastMs || 0).toFixed(3)),
            maxMs: Number((launcherCascadeWarmup.maxMs || 0).toFixed(3)),
          },
          shrapnelResourceWarmup: {
            pending: !!launcherShrapnelResourceWarmup.pending,
            completed: !!launcherShrapnelResourceWarmup.completed,
            stage: launcherShrapnelResourceWarmup.stage,
            steps: launcherShrapnelResourceWarmup.steps,
            lastMs: Number((launcherShrapnelResourceWarmup.lastMs || 0).toFixed(3)),
            maxMs: Number((launcherShrapnelResourceWarmup.maxMs || 0).toFixed(3)),
          },
        },
        marshalSpecial: {
          nextStartLevel: MARSHAL_SPECIAL_START_LEVEL,
          interval: MARSHAL_SPECIAL_INTERVAL,
          branch: state.marshalUpgrade,
          pelletCount: getCoachGunPelletCount(),
          spread: Number(getCoachGunSpread(false).toFixed(3)),
          range: Number(getCoachGunRange().toFixed(2)),
          visualPelletCount: getCoachGunVisualPelletCount(getCoachGunPelletCount()),
          activeTracers: state.coachGunTracers.length,
          tracerLimit: MAX_COACH_GUN_TRACERS,
          masteryStacks: getMarshalMasteryStackCount(),
          masteryDamageMultiplier: Number(getMarshalMasteryDamageMultiplier().toFixed(3)),
          recoilSpeedTimer: Number((state.marshalRecoilSpeedTimer || 0).toFixed(2)),
          shellCatcherKills: state.marshalShellCatcherKills || 0,
          closeKills: state.marshalCloseKills || 0,
          graveTitheKills: state.marshalGraveTitheKills || 0,
          bountyTimer: Number((state.marshalBountyTimer || 0).toFixed(2)),
          bountiesMarked: state.marshalBountiesMarked || 0,
          bountiesClaimed: state.marshalBountiesClaimed || 0,
          marksApplied: state.marshalMarksApplied || 0,
          marksPassed: state.marshalMarksPassed || 0,
          fearBursts: state.marshalFearBursts || 0,
          generatedShells: state.marshalGeneratedShells || 0,
          paleDeputies: getPaleDeputyDiagnostics(),
          acidCleansed: state.marshalAcidCleansed || 0,
          purifyReloadTimer: Number((state.marshalPurifyReloadTimer || 0).toFixed(2)),
          hallowedGroundsCreated: state.marshalHallowedGroundsCreated || 0,
          activeHallowedGrounds: state.marshalHallowedGrounds.length,
          lastVolley: state.marshalLastVolley,
          hallowedVisualPool: {
            available: marshalHallowedVisualPool.length,
            created: marshalHallowedVisualCreated,
            inUse: marshalHallowedVisualInUse,
          },
        },
        modifiers: {
          moveSpeed: Number((1 + (state.moveSpeedBonus || 0)).toFixed(3)),
          damage: Number((1 + (state.globalDamageBonus || 0)).toFixed(3)),
          reloadSpeed: Number((1 + (state.reloadSpeedBonus || 0)).toFixed(3)),
          fireRate: Number((1 + (state.fireRateBonus || 0)).toFixed(3)),
          ammoPickup: Number(getAmmoPickupMultiplier().toFixed(3)),
          maxHpBonus: state.maxHpBonus || 0,
          hpRegen: Number((state.hpRegen || 0).toFixed(2)),
          xpPickupRadius: Number(getXpPickupRadius().toFixed(2)),
          xpAttractRadius: Number(getXpAttractRadius().toFixed(2)),
          xpGain: Number(getXpGainMultiplier().toFixed(3)),
          attackRange: Number(getWeaponRangeMultiplier().toFixed(3)),
        },
        revolverDamageMultiplier: state.revolverDamageMultiplier || 1,
        revolverMagazineBonus: state.revolverMagazineBonus || 0,
        revolverAmmoPickupBonus: state.revolverAmmoPickupBonus || 0,
        rifleAmmoPickupBonus: state.rifleAmmoPickupBonus || 0,
        launcherAmmoPickupBonus: getLauncherAmmoPickupBonus(),
        xpOrbs: state.xpOrbs.length,
        xpProgress: Number((state.xpToNext > 0 ? state.xp / state.xpToNext : 0).toFixed(3)),
      },
      ownedWeapons: Object.keys(state.ownedWeapons).filter(function (id) {
        return state.ownedWeapons[id];
      }),
      ammo: {
        current: getAmmoState(state.weapon).current,
        magazine: getAmmoState(state.weapon).magazine,
        reserve: getAmmoState(state.weapon).reserve,
        total: getAmmoState(state.weapon).total,
        reloading: getAmmoState(state.weapon).reloading,
        reloadRemaining: Number(getAmmoState(state.weapon).reloadRemaining.toFixed(2)),
        reloadProgress: Number(getAmmoState(state.weapon).reloadProgress.toFixed(2)),
        weapons: Object.keys(WEAPONS).reduce(function (acc, id) {
          var ammo = getAmmoState(id);
          acc[id] = {
            current: ammo.current,
            magazine: ammo.magazine,
            reserve: ammo.reserve,
            total: ammo.total,
            damage: getWeaponDamage(WEAPONS[id]),
            reloadTime: Number(getWeaponReloadTime(WEAPONS[id]).toFixed(2)),
            cooldown: Number(getWeaponCooldown(WEAPONS[id]).toFixed(3)),
            reloading: ammo.reloading,
            reloadRemaining: Number(ammo.reloadRemaining.toFixed(2)),
          };
          if (ammo.dualHands) {
            acc[id].dualHands = {
              active: ammo.dualHands.active,
              lastShot: ammo.dualHands.lastShot,
              maxFreeReloads: ammo.dualHands.maxFreeReloads,
              right: {
                current: ammo.dualHands.right.current,
                magazine: ammo.dualHands.right.magazine,
                reloading: ammo.dualHands.right.reloading,
                reloadRemaining: Number(ammo.dualHands.right.reloadRemaining.toFixed(2)),
                freeReloads: ammo.dualHands.right.freeReloads,
              },
              left: {
                current: ammo.dualHands.left.current,
                magazine: ammo.dualHands.left.magazine,
                reloading: ammo.dualHands.left.reloading,
                reloadRemaining: Number(ammo.dualHands.left.reloadRemaining.toFixed(2)),
                freeReloads: ammo.dualHands.left.freeReloads,
              },
            };
          }
          return acc;
        }, {}),
      },
      spawnLeft: state.spawnLeft,
      rifleTraps: state.rifleTraps.slice(0, 8).map(function (trap) {
        return {
          x: Number(trap.x.toFixed(2)),
          z: Number(trap.z.toFixed(2)),
          lure: !!trap.lure,
          permanent: !!trap.permanent,
          blastRadius: Number(trap.blastRadius.toFixed(2)),
          damage: trap.damage,
          life: trap.permanent ? null : Number(trap.life.toFixed(2)),
        };
      }),
      ammoCrates: state.ammoCrates.map(function (crate) {
        return {
          type: crate.mini ? "mini" : "standard",
          mini: !!crate.mini,
          x: Number(crate.x.toFixed(2)),
          z: Number(crate.z.toFixed(2)),
          pickupScale: Number((crate.pickupScale || 1).toFixed(3)),
        };
      }),
      xpOrbs: state.xpOrbs.slice(0, 8).map(function (orb) {
        return {
          x: Number(orb.x.toFixed(2)),
          z: Number(orb.z.toFixed(2)),
          value: orb.value,
          visualScale: Number((orb.visualScale || 0).toFixed(2)),
          distance: state.player ? Number(Math.hypot(orb.x - state.player.x, orb.z - state.player.z).toFixed(2)) : null,
        };
      }),
      enemyCount: state.enemies.length,
      zombieTeleports: state.zombieTeleports,
      zombieSurround: {
        sideCounts: getZombieSurroundSideCounts(visibleGround),
        spawnCursor: state.zombieSpawnSideCursor || 0,
        teleportCursor: state.zombieTeleportSideCursor || 0,
      },
      player: p
        ? {
            x: Number(p.x.toFixed(2)),
            z: Number(p.z.toFixed(2)),
            hp: Number(p.hp.toFixed(1)),
            maxHp: Number(p.maxHp.toFixed(1)),
            speed: Number(p.speed.toFixed(2)),
            cooldown: Number(p.cooldown.toFixed(2)),
            aimAngle: Number(p.aimAngle.toFixed(2)),
          }
        : null,
      pointer: {
        x: Number(state.pointerWorld.x.toFixed(2)),
        z: Number(state.pointerWorld.z.toFixed(2)),
        screenLocked: pointerInput.hasPointer,
        followOffsetX: Number(pointerInput.followOffsetX.toFixed(2)),
        followOffsetZ: Number(pointerInput.followOffsetZ.toFixed(2)),
      },
      ammoCratePointer: getAmmoCratePointerDiagnostics(),
      minimap: {
        visible: state.mode === "playing",
        nearestAmmoCrates: getNearestAmmoCratesForMinimap(4).map(function (crate) {
          return {
            type: crate.mini ? "mini" : "standard",
            mini: !!crate.mini,
            x: Number(crate.x.toFixed(2)),
            z: Number(crate.z.toFixed(2)),
            pickupScale: Number((crate.pickupScale || 1).toFixed(3)),
            distance: state.player ? Number(Math.hypot(crate.x - state.player.x, crate.z - state.player.z).toFixed(2)) : null,
          };
        }),
      },
      mobileControls: {
        moveActive: touchMove.active,
        moveX: Number(touchMove.x.toFixed(2)),
        moveZ: Number(touchMove.z.toFixed(2)),
        autoRun: !!touchMove.autoRun,
        autoX: Number(touchMove.autoX.toFixed(2)),
        autoZ: Number(touchMove.autoZ.toFixed(2)),
        aimTarget: getMobileAimTargetDiagnostics(),
        fieldFireActive: !!mobileFieldFire.active,
        fireActive: touchFire.active,
        layoutEditing: !!state.controlLayoutEditing,
        customLayout: !!controlLayoutState.saved,
      },
      audio: {
        enabled: audioState.enabled,
        musicVolumePercent: getAudioVolumePercent("music"),
        sfxVolumePercent: getAudioVolumePercent("sfx"),
      },
      bullets: state.bullets.length,
      acidProjectiles: state.acidProjectiles.length,
      acidPuddles: state.acidPuddles.length,
      firePatches: state.firePatches.length,
      delayedExplosions: state.delayedExplosions.length,
      launcherExplosionSamples: state.launcherExplosionSpreadSamples.slice(-24).map(function (sample) {
        return {
          kind: sample.kind,
          x: Number(sample.x.toFixed(2)),
          z: Number(sample.z.toFixed(2)),
          radius: Number(sample.radius.toFixed(2)),
        };
      }),
      effects: {
        particles: state.particles.length,
        coachGunTracers: state.coachGunTracers.length,
        paleDeputyTracers: state.paleDeputyTracers.length,
        paleDeputies: state.paleDeputies.length,
        smoke: state.smokePuffs.length,
        shockwaves: state.shockwaves.length,
        lightningBolts: state.lightningBolts.length,
        rifleTraps: state.rifleTraps.length,
        firePatches: state.firePatches.length,
        decals: state.decals.length,
        debris: state.debris.length,
      },
      render: {
        mobileMode: MOBILE_RENDER_MODE,
        contextLost: renderDiagnostics.contextLost,
        contextLosses: renderDiagnostics.contextLosses,
        recoveries: renderDiagnostics.recoveries,
        recreates: renderDiagnostics.recreates,
        whiteFrames: renderDiagnostics.whiteFrames,
        lastReason: renderDiagnostics.lastReason,
      },
      projectiles: state.bullets.slice(0, 8).map(function (b) {
        return {
          type: b.type,
          x: Number(b.x.toFixed(2)),
          z: Number(b.z.toFixed(2)),
          speed: Number(b.speed.toFixed(2)),
          range: Number((b.speed * b.maxLife).toFixed(2)),
          damage: b.damage,
          baseDamage: b.baseDamage,
          visualWidth: Number((b.visualWidth || 0).toFixed(3)),
          visualLength: Number((b.visualLength || 0).toFixed(3)),
          hitRadius: Number((b.hitRadius || 0).toFixed(3)),
          piercing: !!b.piercing,
          pierced: b.piercedEnemies ? b.piercedEnemies.length : 0,
          muzzleSide: b.muzzleSide || 0,
          dualHand: b.dualHand || "",
          ricochetRemaining: b.ricochetRemaining || 0,
          ricochetDepth: b.ricochetDepth || 0,
          homing: Number((b.homing || 0).toFixed(3)),
          rifleShotNumber: b.rifleShotNumber || 0,
          chainLightning: !!b.chainLightning,
          lightningTargets: b.lightningTargets || 0,
          electricVisual: !!(b.mesh && b.mesh.userData && b.mesh.userData.electricProjectile),
          electricBoltCount:
            b.mesh && b.mesh.userData && b.mesh.userData.electricParts && b.mesh.userData.electricParts.bolts
              ? b.mesh.userData.electricParts.bolts.length
              : 0,
          electricRingCount:
            b.mesh && b.mesh.userData && b.mesh.userData.electricParts && b.mesh.userData.electricParts.rings
              ? b.mesh.userData.electricParts.rings.length
              : 0,
          launcherShotNumber: b.launcherShotNumber || 0,
          powderEcho: !!b.powderEcho,
          airburstLanding: !!b.airburstLanding,
          rollingFlame: !!b.rollingFlame,
          fireShard: !!b.fireShard,
          plantsTrap: !!b.plantsTrap,
          silverBullet: !!b.silverBullet,
          executioner: !!b.executioner,
          heavyRupture: !!b.heavyRupture,
          leadBloom: !!b.leadBloom,
          throughAndThrough: !!b.throughAndThrough,
          blastRadius: Number((b.blastRadius || 0).toFixed(2)),
          blastDamage: Number((b.blastDamage || 0).toFixed(2)),
          targetX: b.targetX == null ? null : Number(b.targetX.toFixed(2)),
          targetZ: b.targetZ == null ? null : Number(b.targetZ.toFixed(2)),
          life: Number(b.life.toFixed(2)),
        };
      }),
      acidShots: state.acidProjectiles.slice(0, 6).map(function (spit) {
        return {
          x: Number(spit.x.toFixed(2)),
          z: Number(spit.z.toFixed(2)),
          targetX: Number(spit.targetX.toFixed(2)),
          targetZ: Number(spit.targetZ.toFixed(2)),
          visualParts: spit.mesh && spit.mesh.userData.slimeParts ? spit.mesh.userData.slimeParts.length : 0,
          life: Number(spit.life.toFixed(2)),
        };
      }),
      acidPools: state.acidPuddles.slice(0, 6).map(function (puddle) {
        return {
          x: Number(puddle.x.toFixed(2)),
          z: Number(puddle.z.toFixed(2)),
          radius: Number(puddle.radius.toFixed(2)),
          visualParts: 1 + (puddle.darkPatch ? 1 : 0) + (puddle.ring ? 1 : 0) + (puddle.foam ? 1 : 0) + (puddle.bubbles ? puddle.bubbles.length : 0),
          life: Number(puddle.life.toFixed(2)),
        };
      }),
      firePools: state.firePatches.slice(0, 8).map(function (patch) {
        return {
          x: Number(patch.x.toFixed(2)),
          z: Number(patch.z.toFixed(2)),
          radius: Number(patch.radius.toFixed(2)),
          damage: patch.damage,
          trail: !!patch.trail,
          thermite: !!patch.thermite,
          backdraft: !!patch.backdraft,
          splinter: !!patch.splinter,
          visualParts: getFirePatchVisualPartCount(patch),
          flameBlocks: (patch.flames || []).reduce(function (sum, flame) {
            return sum + (flame.children && flame.children.length ? flame.children.length : 1);
          }, 0),
          cinders: patch.cinders ? patch.cinders.length : 0,
          life: Number(patch.life.toFixed(2)),
        };
      }),
      enemies: state.enemies.slice(0, 12).map(function (e) {
        return {
          type: e.type,
          groupId: e.group.uuid,
          x: Number(e.x.toFixed(2)),
          z: Number(e.z.toFixed(2)),
          hp: Number(e.hp.toFixed(1)),
          xp: e.xp || 0,
          speed: Number(refreshZombieSpeed(e).toFixed(2)),
          marked: isMarshalEnemyMarked(e),
          markTimer: Number((e.marshalMarkTimer || 0).toFixed(2)),
          bounty: !!e.marshalBounty,
          bountyTimer: Number((e.marshalBountyTimer || 0).toFixed(2)),
          stunTimer: Number((e.marshalStunTimer || 0).toFixed(2)),
          fearTimer: Number((e.marshalFearTimer || 0).toFixed(2)),
          spawnSide: e.spawnSide === undefined ? null : e.spawnSide,
          outsideView: pointOutsideVisibleGround(e.x, e.z, e.radius + 0.2, visibleGround),
          insideEnemyBounds: pointInsideEnemyBounds(e.x, e.z, e.radius),
          blocked: pointHitsObstacle(e.x, e.z, e.radius + 0.16),
          hasClearStep: hasClearZombieStep(e.x, e.z, e.radius),
          teleports: e.teleportCount || 0,
          acidShots: e.acidShots || 0,
          spitWindup: Number((e.spitWindup || 0).toFixed(2)),
          spitPulse: Number((e.spitPulse || 0).toFixed(2)),
          stuck: Number(e.stuckTimer.toFixed(2)),
          navigating: !!e.navGoal,
          navX: e.navGoal ? Number(e.navGoal.x.toFixed(2)) : null,
          navZ: e.navGoal ? Number(e.navGoal.z.toFixed(2)) : null,
        };
      }),
    });
  };

  window.__dustAndDeadTest = {
    grantScore: function (amount) {
      state.score += Math.max(0, Number(amount) || 0);
      updateHud();
      return state.score;
    },
    grantXp: function (amount) {
      addXp(amount, state.player ? state.player.x : 0, state.player ? state.player.z : 0);
      return {
        level: state.level,
        xp: state.xp,
        xpToNext: state.xpToNext,
        playerClass: state.playerClass,
        classChoicePending: state.classChoicePending,
        revolverUpgrade: state.revolverUpgrade,
        revolverUpgradePending: state.revolverUpgradePending,
        rifleUpgrade: state.rifleUpgrade,
        rifleUpgradePending: state.rifleUpgradePending,
        launcherUpgrade: state.launcherUpgrade,
        launcherUpgradePending: state.launcherUpgradePending,
        marshalUpgrade: state.marshalUpgrade,
        marshalUpgradePending: state.marshalUpgradePending,
        standardUpgradePending: state.standardUpgradePending,
        pendingStandardUpgrades: state.pendingStandardUpgradeLevels.length,
        mode: state.mode,
      };
    },
    chooseClass: function (id) {
      return choosePlayerClass(id);
    },
    chooseRevolverUpgrade: function (id) {
      return chooseRevolverUpgrade(id);
    },
    chooseRifleUpgrade: function (id) {
      return chooseRifleUpgrade(id);
    },
    chooseLauncherUpgrade: function (id) {
      return chooseLauncherUpgrade(id);
    },
    chooseMarshalUpgrade: function (id) {
      return chooseMarshalUpgrade(id);
    },
    chooseStandardUpgrade: function (id) {
      return chooseStandardUpgrade(id);
    },
    forceStandardUpgrade: function (id) {
      return forceStandardUpgradeForTest(id);
    },
    grantUpgrade: function (id) {
      var spec = getStandardUpgradeById(id);
      if (!spec) return false;
      applyStandardUpgrade(spec);
      updateHud();
      return getUpgradeCount(id);
    },
    getEligibleMarshalUpgrades: function (level) {
      return getEligibleMarshalSpecialUpgrades(Number(level) || state.level).map(function (spec) {
        return spec.id;
      });
    },
    rollMarshalSpecialChoices: function (level) {
      return rollMarshalSpecialUpgradeChoices(Number(level) || state.level).map(function (spec) {
        return {
          id: spec.id,
          title: spec.title,
          description: spec.description,
          masteryFallback: !!spec.masteryFallback,
        };
      });
    },
    forceAllStandardUpgrades: function (id) {
      var count = 0;
      while (count < 100 && forceStandardUpgradeForTest(id || "swiftBoots")) count++;
      return {
        applied: count,
        mode: state.mode,
        pendingStandardUpgrades: state.pendingStandardUpgradeLevels.length,
        upgrades: Object.assign({}, state.upgradeCounts),
      };
    },
    buyWeapon: function (id) {
      return buyOrSelectWeapon(id);
    },
    killNearestZombie: function () {
      if (!state.player || !state.enemies.length) return false;
      var enemy = findNearestEnemy(state.player.x, state.player.z, Infinity);
      if (!enemy) return false;
      killEnemy(enemy);
      updateHud();
      return true;
    },
    killNearestZombieWithCoachGun: function (marked, bounty) {
      if (!state.player || !state.enemies.length) return false;
      var enemy = findNearestEnemy(state.player.x, state.player.z, Infinity);
      if (!enemy) return false;
      if (marked || bounty) enemy.marshalMarkTimer = Math.max(enemy.marshalMarkTimer || 0, COACH_GUN_MARK_LIFE);
      if (bounty) {
        enemy.marshalBounty = true;
        enemy.marshalBountyTimer = Math.max(enemy.marshalBountyTimer || 0, 4);
        state.marshalBountyEnemy = enemy;
      }
      var distance = Math.hypot(enemy.x - state.player.x, enemy.z - state.player.z);
      killEnemy(enemy, {
        type: "coachGun",
        pointBlank: distance <= COACH_GUN_POINT_BLANK_RANGE,
        targetWasMarked: !!marked || !!bounty,
        targetWasBounty: !!bounty,
      });
      updateHud();
      return true;
    },
    getPaleDeputyDiagnostics: function () {
      return getPaleDeputyDiagnostics();
    },
    spawnPaleDeputyAt: function (x, z) {
      var deputy = tryRaisePaleDeputy(Number(x) || 0, Number(z) || 0);
      return deputy ? getPaleDeputyDiagnostics().units.find(function (unit) { return unit.groupId === deputy.group.uuid; }) : null;
    },
    clearPaleDeputies: function () {
      releaseAllPaleDeputies();
      releaseAllPaleDeputyTracersToPool();
      return getPaleDeputyDiagnostics();
    },
    clearEnemies: function () {
      releaseAllEnemiesToPool();
      state.spawnLeft = 0;
      state.spawnTimer = 0;
      state.waveLowRemainingTimer = 0;
      state.nextWaveTimer = 0;
      state.waveSuspended = true;
      updateHud();
      return true;
    },
    forceWaveState: function (wave, liveCount, spawnLeft) {
      releaseAllEnemiesToPool();
      startWave(Math.max(1, Math.floor(Number(wave) || 1)));
      state.spawnLeft = Math.max(0, Math.floor(Number(spawnLeft) || 0));
      state.spawnTimer = 9999;
      state.waveElapsed = 0;
      state.waveLowRemainingTimer = 0;
      state.nextWaveTimer = 0;
      var count = Math.max(0, Math.floor(Number(liveCount) || 0));
      var originX = state.player ? state.player.x : 0;
      var originZ = state.player ? state.player.z : 0;
      for (var j = 0; j < count; j++) {
        var zombie = acquireZombie("walker");
        zombie.x = originX + 58 + (j % 5) * 1.4;
        zombie.z = originZ + 58 + Math.floor(j / 5) * 1.4;
        resolveMoverPosition(zombie, zombie.radius, ENEMY_BOUNDS_EXTRA);
        zombie.group.position.set(zombie.x, 0, zombie.z);
        state.enemies.push(zombie);
        dynamicRoot.add(zombie.group);
      }
      zombieSpatialDirty = true;
      updateHud();
      render();
      return {
        wave: state.wave,
        waveSpawnTarget: state.waveSpawnTarget,
        spawnInterval: Number(state.spawnInterval.toFixed(2)),
        spawnBatchSize: getWaveSpawnBatchSize(state.wave),
        waveRemaining: getWaveRemainingCount(),
        live: state.enemies.length,
        spawnLeft: state.spawnLeft,
      };
    },
    clearAcidHazards: function () {
      for (var i = state.acidProjectiles.length - 1; i >= 0; i--) {
        removeAcidProjectile(i);
      }
      for (var j = state.acidPuddles.length - 1; j >= 0; j--) {
        removeAcidPuddle(j);
      }
      return true;
    },
    clearFireHazards: function () {
      for (var b = state.bullets.length - 1; b >= 0; b--) {
        if (state.bullets[b].type === "launcherFireShard") removeBullet(b);
      }
      releaseAllFirePatches();
      state.delayedExplosions = [];
      state.launcherFireBuffActive = false;
      state.launcherFireAmmoAccumulator = 0;
      return true;
    },
    clearXpOrbs: function () {
      for (var i = state.xpOrbs.length - 1; i >= 0; i--) {
        removeXpOrb(i);
      }
      return true;
    },
    clearLauncherExplosionSamples: function () {
      state.launcherExplosionSpreadSamples = [];
      return true;
    },
    clearRifleTraps: function () {
      releaseAllRifleTraps();
      return true;
    },
    spawnRifleTrapAt: function (x, z) {
      var trap = spawnRifleTrap(Number(x) || 0, Number(z) || 0, "test-helper");
      return trap
        ? {
            x: Number(trap.x.toFixed(2)),
            z: Number(trap.z.toFixed(2)),
            lure: !!trap.lure,
            permanent: !!trap.permanent,
            visualId: trap.visual && trap.visual.group && trap.visual.group.uuid ? trap.visual.group.uuid : null,
          }
        : null;
    },
    spawnFirePatchAt: function (x, z, radius, life) {
      var patch = spawnFirePatch(Number(x) || 0, Number(z) || 0, {
        radius: Math.max(0.5, Number(radius) || getLauncherFireRadius()),
        life: Math.max(0.8, Number(life) || getLauncherFireLife()),
        damage: getLauncherFireDamage(),
      });
      return patch
        ? {
            groupId: patch.mesh && patch.mesh.uuid ? patch.mesh.uuid : null,
            x: Number(patch.x.toFixed(2)),
            z: Number(patch.z.toFixed(2)),
            radius: Number(patch.radius.toFixed(2)),
            life: Number(patch.life.toFixed(2)),
          }
        : null;
    },
    findFirePatchNear: function (x, z, radius) {
      var px = Number(x) || 0;
      var pz = Number(z) || 0;
      var range = Math.max(0.1, Number(radius) || 0.5);
      for (var i = 0; i < state.firePatches.length; i++) {
        var patch = state.firePatches[i];
        if (Math.hypot(patch.x - px, patch.z - pz) <= range) {
          return {
            groupId: patch.mesh && patch.mesh.uuid ? patch.mesh.uuid : null,
            x: Number(patch.x.toFixed(2)),
            z: Number(patch.z.toFixed(2)),
            radius: Number(patch.radius.toFixed(2)),
            life: Number(patch.life.toFixed(2)),
            startLife: Number(patch.startLife.toFixed(2)),
            trail: !!patch.trail,
            thermite: !!patch.thermite,
            splinter: !!patch.splinter,
          };
        }
      }
      return null;
    },
    triggerLauncherExplosionAt: function (x, z, kind, radius, damage, options) {
      var opts = options || {};
      opts.kind = kind || "main";
      var source = explodeGrenade(Number(x) || 0, Number(z) || 0, Math.max(0.2, Number(radius) || getLauncherBlastRadius()), Math.max(0.1, Number(damage) || getLauncherBlastDamage()), opts);
      updateHud();
      render();
      return {
        kind: source.kind,
        kills: source.killedEnemies.length,
        ammoRefills: state.launcherAmmoRefills || 0,
        currentAmmo: getAmmoState("launcher").current,
        magazine: getAmmoState("launcher").magazine,
      };
    },
    sampleZombieTypes: function (wave, count) {
      var previousWave = state.wave;
      var result = {};
      state.wave = Math.max(1, Math.floor(Number(wave) || 1));
      for (var i = 0; i < Math.max(0, Math.floor(Number(count) || 0)); i++) {
        var type = chooseZombieType();
        result[type] = (result[type] || 0) + 1;
      }
      state.wave = previousWave;
      return result;
    },
    getWaveZombieCount: function (wave) {
      return getWaveZombieCount(wave);
    },
    spawnZombieNow: function () {
      spawnZombie();
      var enemy = state.enemies[state.enemies.length - 1];
      var visible = getCurrentVisibleGroundRect();
      return {
        type: enemy.type,
        groupId: enemy.group.uuid,
        x: Number(enemy.x.toFixed(2)),
        z: Number(enemy.z.toFixed(2)),
        radius: Number(enemy.radius.toFixed(2)),
        spawnSide: enemy.spawnSide,
        outsideView: pointOutsideVisibleGround(enemy.x, enemy.z, enemy.radius + 0.2, visible),
        insideEnemyBounds: pointInsideEnemyBounds(enemy.x, enemy.z, enemy.radius),
        blocked: pointHitsObstacle(enemy.x, enemy.z, enemy.radius + 0.16),
        hasClearStep: hasClearZombieStep(enemy.x, enemy.z, enemy.radius),
        visibleGround: {
          minX: Number(visible.minX.toFixed(2)),
          maxX: Number(visible.maxX.toFixed(2)),
          minZ: Number(visible.minZ.toFixed(2)),
          maxZ: Number(visible.maxZ.toFixed(2)),
        },
      };
    },
    clearAmmoCrates: function () {
      for (var i = state.ammoCrates.length - 1; i >= 0; i--) {
        removeObject3D(state.ammoCrates[i].group);
      }
      state.ammoCrates = [];
      return true;
    },
    setAmmoCrateTimer: function (seconds) {
      state.ammoCrateTimer = Math.max(0, Number(seconds) || 0);
      return Number(state.ammoCrateTimer.toFixed(2));
    },
    spawnAmmoCrateAt: function (x, z) {
      var crate = spawnAmmoCrateAt(Number(x) || 0, Number(z) || 0);
      return { x: Number(crate.x.toFixed(2)), z: Number(crate.z.toFixed(2)) };
    },
    spawnMiniAmmoCrateAt: function (x, z) {
      var crate = spawnMiniAmmoCrateAt(Number(x) || 0, Number(z) || 0);
      return {
        type: crate.mini ? "mini" : "standard",
        mini: !!crate.mini,
        x: Number(crate.x.toFixed(2)),
        z: Number(crate.z.toFixed(2)),
        pickupScale: Number((crate.pickupScale || 1).toFixed(3)),
      };
    },
    collectNearestAmmoCrate: function () {
      if (!state.player || !state.ammoCrates.length) return false;
      var best = 0;
      var bestDist = Infinity;
      for (var i = 0; i < state.ammoCrates.length; i++) {
        var dist = Math.hypot(state.ammoCrates[i].x - state.player.x, state.ammoCrates[i].z - state.player.z);
        if (dist < bestDist) {
          best = i;
          bestDist = dist;
        }
      }
      return collectAmmoCrate(best);
    },
    getAmmoCratePointerDiagnostics: function () {
      return getAmmoCratePointerDiagnostics();
    },
    setAmmo: function (id, current, reserve) {
      var weapon = WEAPONS[id] || WEAPONS.revolver;
      state.ammo[weapon.id] = clamp(Number(current) || 0, 0, getWeaponMagazine(weapon));
      state.ammoReserve[weapon.id] = Math.max(0, Number(reserve) || 0);
      state.reloadTimers[weapon.id] = 0;
      if (weapon.id === "revolver" && hasAllRightAllLeft()) setDualRevolverHandAmmoFromAggregate(state.ammo[weapon.id]);
      updateHud();
      return getAmmoState(weapon.id);
    },
    startReload: function (id) {
      startReload(id || state.weapon);
      updateHud();
      return getAmmoState(id || state.weapon);
    },
    setPlayerPosition: function (x, z) {
      if (!state.player) return null;
      state.player.x = Number(x) || 0;
      state.player.z = Number(z) || 0;
      resolveMoverPosition(state.player, state.player.radius, 0);
      state.player.group.position.set(state.player.x, 0, state.player.z);
      updateAim();
      updateHud();
      render();
      return {
        x: Number(state.player.x.toFixed(2)),
        z: Number(state.player.z.toFixed(2)),
        cameraX: Number(cameraTarget.x.toFixed(2)),
        cameraZ: Number(cameraTarget.z.toFixed(2)),
      };
    },
    setPlayerHp: function (hp) {
      if (!state.player) return null;
      state.player.hp = clamp(Number(hp) || 0, 0, state.player.maxHp);
      state.player.invuln = 0;
      updateHud();
      return {
        hp: Number(state.player.hp.toFixed(1)),
        maxHp: Number(state.player.maxHp.toFixed(1)),
      };
    },
    setAimTarget: function (x, z) {
      if (!state.player) return null;
      state.pointerWorld.x = Number(x) || 0;
      state.pointerWorld.z = Number(z) || 0;
      updateAim();
      render();
      return {
        x: Number(state.pointerWorld.x.toFixed(2)),
        z: Number(state.pointerWorld.z.toFixed(2)),
        angle: Number(state.player.aimAngle.toFixed(3)),
      };
    },
    shootOnce: function () {
      if (!state.player) return false;
      state.player.cooldown = 0;
      var fired = shoot();
      updateHud();
      return fired;
    },
    spawnAcidPuddleAt: function (x, z) {
      spawnAcidPuddle(Number(x) || 0, Number(z) || 0);
      return state.acidPuddles.length;
    },
    previewUpgradeCards: function (ids) {
      var list = Array.isArray(ids) ? ids.slice(0, 10) : [];
      var specs = list.map(getStandardUpgradeById).filter(Boolean);
      setIntroActive(false);
      state.standardUpgradeLevel = 13;
      state.standardUpgradeChoices = specs;
      state.mode = "level-up";
      renderStandardUpgradeChoices();
      setPanel(levelUpPanel, true);
      setPanel(menu, false);
      setPanel(classChoicePanel, false);
      setPanel(revolverUpgradePanel, false);
      setPanel(rifleUpgradePanel, false);
      setPanel(launcherUpgradePanel, false);
      setPanel(marshalUpgradePanel, false);
      updateModeClass();
      render();
      return specs.map(function (spec) { return spec.id; });
    },
    readyNearestSpitter: function () {
      if (!state.player) return null;
      var best = null;
      var bestDist = Infinity;
      for (var i = 0; i < state.enemies.length; i++) {
        var enemy = state.enemies[i];
        if (enemy.type !== "spitter") continue;
        var dist = Math.hypot(enemy.x - state.player.x, enemy.z - state.player.z);
        if (dist < bestDist) {
          best = enemy;
          bestDist = dist;
        }
      }
      if (!best) return null;
      best.acidCooldown = 0;
      best.spitWindup = 0;
      best.spitTarget = null;
      return { x: Number(best.x.toFixed(2)), z: Number(best.z.toFixed(2)), distance: Number(bestDist.toFixed(2)) };
    },
    validateMapLayout: function () {
      return validateMapLayout();
    },
    getRoadSurfaceDiagnostics: function () {
      return getRoadSurfaceDiagnostics();
    },
    getRuinColliderDiagnostics: function () {
      return getRuinColliderDiagnostics();
    },
    getZombieOptimizationStats: function () {
      return {
        pools: getZombiePoolStats(),
        grid: {
          cellSize: ZOMBIE_SPATIAL_CELL_SIZE,
          cellCount: zombieSpatialStats.cellCount,
          maxBucketSize: zombieSpatialStats.maxBucketSize,
          occupants: zombieSpatialStats.occupants,
        },
        obstacleGrid: {
          cellSize: obstacleSpatialStats.cellSize,
          cellCount: obstacleSpatialStats.cellCount,
          maxBucketSize: obstacleSpatialStats.maxBucketSize,
          occupants: obstacleSpatialStats.occupants,
        },
      };
    },
    getFireOptimizationStats: function () {
      return {
        visuals: getFirePatchVisualPoolStats(),
        activePatches: state.firePatches.length,
      };
    },
    getAcidPuddleOptimizationStats: function () {
      return {
        visuals: getAcidPuddleVisualPoolStats(),
        activePuddles: state.acidPuddles.length,
        maxPuddles: MAX_ACID_PUDDLES,
      };
    },
    getRifleTrapOptimizationStats: function () {
      return {
        visuals: getRifleTrapVisualPoolStats(),
        activeTraps: state.rifleTraps.length,
        maxTraps: MAX_RIFLE_TRAPS,
        spatialGrid: {
          cellSize: ZOMBIE_SPATIAL_CELL_SIZE,
          cellCount: zombieSpatialStats.cellCount,
          maxBucketSize: zombieSpatialStats.maxBucketSize,
          occupants: zombieSpatialStats.occupants,
        },
      };
    },
    getParticleOptimizationStats: function () {
      return {
        visuals: getParticleVisualPoolStats(),
        xpOrbVisuals: getXpOrbVisualPoolStats(),
        activeParticles: state.particles.length,
        activeXpOrbs: state.xpOrbs.length,
      };
    },
    getProjectileOptimizationStats: function () {
      return getProjectileVisualPoolStats();
    },
    getAudioDiagnostics: function () {
      return getAudioDiagnostics();
    },
    getExplosionOptimizationStats: function () {
      return {
        visuals: getExplosionEffectPoolStats(),
        particleVisuals: getParticleVisualPoolStats(),
        particles: state.particles.length,
        smoke: state.smokePuffs.length,
        shockwaves: state.shockwaves.length,
        lightFlashes: state.lightFlashes.length,
      };
    },
    getThreeObjectDiagnostics: function () {
      return getThreeObjectDiagnostics();
    },
    getUpgradeIconDiagnostics: function (id) {
      var wrapper = document.createElement("div");
      wrapper.innerHTML = getUpgradeIcon(id);
      var svg = wrapper.querySelector("svg");
      return {
        id: id,
        text: wrapper.textContent.trim(),
        svgCount: wrapper.querySelectorAll("svg").length,
        shapeCount: wrapper.querySelectorAll("path,circle,line,polyline,polygon,rect").length,
        pathCount: wrapper.querySelectorAll("path").length,
        circleCount: wrapper.querySelectorAll("circle").length,
        viewBox: svg ? svg.getAttribute("viewBox") : null,
      };
    },
    spawnZombieAt: function (type, x, z) {
      var id = { walker: true, runner: true, fastZombie: true, brute: true, spitter: true }[type] ? type : "walker";
      var zombie = acquireZombie(id);
      zombie.x = Number(x) || 0;
      zombie.z = Number(z) || 0;
      resolveMoverPosition(zombie, zombie.radius, ENEMY_BOUNDS_EXTRA);
      zombie.group.position.set(zombie.x, 0, zombie.z);
      state.enemies.push(zombie);
      dynamicRoot.add(zombie.group);
      zombieSpatialDirty = true;
      return {
        type: zombie.type,
        groupId: zombie.group.uuid,
        x: Number(zombie.x.toFixed(2)),
        z: Number(zombie.z.toFixed(2)),
        speed: Number(refreshZombieSpeed(zombie).toFixed(2)),
        radius: Number(zombie.radius.toFixed(2)),
        visualParts: zombie.group.children.length,
        hasParasiteSilhouette: !!(zombie.group.userData.animParts && zombie.group.userData.animParts.parasiteShell),
      };
    },
    recoverRenderer: function () {
      recoverRenderer("test-helper");
      return {
        recoveries: renderDiagnostics.recoveries,
        recreates: renderDiagnostics.recreates,
      };
    },
    forceContextLoss: function () {
      if (renderer && typeof renderer.forceContextLoss === "function") {
        renderer.forceContextLoss();
        return true;
      }
      return false;
    },
  };
})();
