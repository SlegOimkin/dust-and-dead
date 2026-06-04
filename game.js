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
  var MAP_SIZE_MULTIPLIER = 2;
  var BASE_ARENA_W = CITY_W + OUTSKIRT_MARGIN * 2;
  var BASE_ARENA_D = CITY_D + OUTSKIRT_MARGIN * 2;
  var ARENA_W = BASE_ARENA_W * MAP_SIZE_MULTIPLIER;
  var ARENA_D = BASE_ARENA_D * MAP_SIZE_MULTIPLIER;
  var MAP_OUTSKIRT_X = (ARENA_W - CITY_W) / 2;
  var MAP_OUTSKIRT_Z = (ARENA_D - CITY_D) / 2;
  var MAP_LINEAR_SCALE = MAP_SIZE_MULTIPLIER;
  var MICRO_SETTLEMENT_TARGET = 5;
  var FIXED_DT = 1 / 60;
  var MAX_ADVANCE_STEPS = 240;
  var MAX_PARTICLES = 180;
  var MAX_SMOKE_PUFFS = 80;
  var MAX_SHOCKWAVES = 12;
  var MAX_DECALS = 48;
  var MAX_DEBRIS = 120;
  var MAX_AMMO_CRATES = 4;
  var AMMO_CRATE_PICKUP_RADIUS = 1.35;
  var MIN_PLAYER_PASSAGE = 2.0;
  var MAIN_TOWN_MICRO_BUFFER = 10.5;
  var MICRO_FENCE_ROAD_CLEARANCE = 2.2;
  var ENEMY_BOUNDS_EXTRA = 8.4;
  var ZOMBIE_SPAWN_VIEW_MARGIN_MIN = 4.2;
  var ZOMBIE_SPAWN_VIEW_MARGIN_MAX = 6.0;
  var MOBILE_RENDER_MODE = isMobileRuntime();
  var DYNAMIC_LIGHTS_ENABLED = true;

  var root = document.getElementById("game-root");
  var hudHealth = document.getElementById("health-fill");
  var hudWave = document.getElementById("wave-value");
  var hudScore = document.getElementById("score-value");
  var hudKills = document.getElementById("kills-value");
  var hudWeapon = document.getElementById("weapon-value");
  var ammoHud = document.getElementById("ammo-hud");
  var ammoStatus = document.getElementById("ammo-status");
  var ammoCurrent = document.getElementById("ammo-current");
  var ammoMax = document.getElementById("ammo-max");
  var ammoReloadFill = document.getElementById("ammo-reload-fill");
  var ammoWeaponIcon = document.getElementById("ammo-weapon-icon");
  var ammoCartridgeRack = document.getElementById("ammo-cartridge-rack");
  var weaponButtons = Array.prototype.slice.call(document.querySelectorAll("[data-weapon]"));
  var menu = document.getElementById("menu");
  var gameOverPanel = document.getElementById("game-over");
  var gameOverStats = document.getElementById("game-over-stats");
  var startBtn = document.getElementById("start-btn");
  var restartBtn = document.getElementById("restart-btn");
  var moveStick = document.getElementById("move-stick");
  var moveKnob = document.getElementById("move-knob");
  var mobileFire = document.getElementById("mobile-fire");

  var scene = new THREE.Scene();
  scene.background = new THREE.Color(0xcfa269);
  scene.fog = new THREE.Fog(0xcfa269, 42, 125);

  var renderer = createGameRenderer();
  root.insertBefore(renderer.domElement, root.firstChild);

  var camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 180);
  var cameraTarget = new THREE.Vector3(0, 0, 0);
  var cameraBaseOffset = new THREE.Vector3(0, 44, 34);
  var raycaster = new THREE.Raycaster();
  var pointerNdc = new THREE.Vector2(0, 0);
  var groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  var pointerHit = new THREE.Vector3(0, 0, 6);

  var worldRoot = new THREE.Group();
  var dynamicRoot = new THREE.Group();
  var effectRoot = new THREE.Group();
  scene.add(worldRoot, dynamicRoot, effectRoot);

  var mats = {};
  var keys = Object.create(null);
  var pointerDown = false;
  var touchMove = {
    active: false,
    pointerId: null,
    baseX: 0,
    baseY: 0,
    x: 0,
    z: 0,
  };
  var touchFire = {
    active: false,
    pointerId: null,
  };
  var lastMobileAim = { x: 0, z: -1 };
  var lastFrame = performance.now();
  var rng = mulberry32(7331);
  var MAP_SEED = createMapSeed();
  var mapRng = mulberry32(MAP_SEED);
  var MAIN_TOWN_CENTER = createMainTownCenter();
  var MAIN_TOWN_LAYOUT = createMainTownLayout();
  var PLAYER_START = createPlayerStart();
  var obstacleRects = [];
  var mapFootprints = [];
  var microSettlementStats = [];
  var nextMapFootprintId = 1;
  var sharedGeometries = {};
  var cameraGroundBounds = { minX: -14, maxX: 14, minZ: -18, maxZ: 18 };
  var cameraMapBounds = {
    minX: -ARENA_W / 2 - 2.5,
    maxX: ARENA_W / 2 + 2.5,
    minZ: -ARENA_D / 2 - 2.5,
    maxZ: ARENA_D / 2 + 2.5,
  };
  var currentAmmoIcon = "";
  var ammoVisualState = {
    weapon: "",
    magazine: 0,
    current: null,
  };
  var renderDiagnostics = {
    contextLost: false,
    contextLosses: 0,
    recoveries: 0,
    whiteFrames: 0,
    recreates: 0,
    lastReason: "",
    nextHealthCheck: 0,
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
      reserveStart: 12,
      reloadTime: 2.05,
      cooldown: 0.92,
      damage: 0,
      speed: 15.5,
      life: 1.35,
      hitRadius: 0.45,
      width: 0.34,
      length: 0.5,
      muzzleDistance: 1.18,
      muzzleY: 1.26,
      blastRadius: 3.15,
      blastDamage: 4,
      shake: 0.38,
    },
  };
  var WEAPON_ICONS = {
    revolver:
      '<g fill="currentColor"><path d="M65 24h57c3 0 5 2 5 5v7H65V24Z"/><path d="M37 22h29c8 0 14 6 14 14s-6 14-14 14H37c-8 0-14-6-14-14s6-14 14-14Z"/><path d="M34 29c-5-3-9-8-10-14 6 1 11 4 15 9l-5 5Z"/><path d="M37 40c-14 3-26 13-34 24h30c4-10 10-17 20-23l-16-1Z"/><path d="M56 44h14c4 6-1 13-9 13h-6c-6-3-6-10 1-13Z"/><path d="M112 18h12l3 6h-17l2-6Z"/></g><g fill="rgba(25, 15, 8, 0.78)"><path d="M70 31h49v3H70z"/><path d="M69 38h43v3H69z"/><path d="M60 48c-2 3 0 6 4 6s6-2 6-6h-4c0 2-1 3-3 3-2 0-3-1-1-3h-2Z"/></g><circle cx="50" cy="34" r="3.2" fill="currentColor"/>',
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
  };

  var state = {
    mode: "menu",
    time: 0,
    wave: 1,
    score: 0,
    kills: 0,
    shotsFired: 0,
    spawnLeft: 0,
    spawnTimer: 0,
    spawnInterval: 1,
    nextWaveTimer: 0,
    shake: 0,
    player: null,
    enemies: [],
    bullets: [],
    particles: [],
    flashes: [],
    shockwaves: [],
    decals: [],
    lightFlashes: [],
    smokePuffs: [],
    ambientDust: [],
    debris: [],
    weapon: "revolver",
    ownedWeapons: { revolver: true, rifle: false, launcher: false },
    ammo: {},
    ammoReserve: {},
    reloadTimers: {},
    ammoCrates: [],
    ammoCrateTimer: 0,
    pointerWorld: { x: 0, z: 6 },
  };

  initMaterials();
  initLights();
  buildEnvironment();
  resetRun("menu");
  resize();
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
    mats.metal = material(0x353333, 0.35, 0.75);
    mats.black = material(0x151515, 0.55, 0.25);
    mats.playerHat = material(0x6c351a, 0.78, 0.04);
    mats.playerCoat = material(0x934c22, 0.82, 0.03);
    mats.playerShirt = material(0xe2b66d, 0.85, 0.02);
    mats.playerSkin = material(0xd29a6a, 0.82, 0.01);
    mats.denim = material(0x2d5c84, 0.78, 0.01);
    mats.zombieSkin = material(0x6aa15e, 0.9, 0.01);
    mats.zombieSkinDark = material(0x456f43, 0.9, 0.01);
    mats.zombieShirt = material(0x5e6254, 0.9, 0.01);
    mats.zombieBlood = material(0x5b1010, 0.85, 0.02);
    mats.bullet = material(0xffdc67, 0.25, 0.2, 0xffb52f, 0.45);
    mats.rifleTracer = material(0xf8f5d7, 0.2, 0.25, 0xffe27a, 0.35);
    mats.grenade = material(0x293226, 0.62, 0.22);
    mats.explosion = material(0xff7b2e, 0.35, 0.02, 0xff6a16, 0.75);
    mats.flash = material(0xfff0a6, 0.2, 0.02, 0xffaa32, 0.9);
    mats.healthRed = material(0xd83a2e, 0.65, 0.02);
    mats.healthBack = material(0x301010, 0.8, 0.01);
    mats.gold = material(0xffc44d, 0.45, 0.08, 0xffa51f, 0.25);
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
    instance.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    instance.shadowMap.enabled = true;
    instance.shadowMap.type = THREE.PCFSoftShadowMap;
    instance.outputColorSpace = THREE.SRGBColorSpace;
    instance.toneMapping = THREE.ACESFilmicToneMapping;
    instance.toneMappingExposure = 1.03;
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
      configureRenderer(instance);
      resize();
      render();
    });
  }

  function initLights() {
    var hemi = new THREE.HemisphereLight(0xffe5bd, 0x574034, 1.7);
    scene.add(hemi);

    var sun = new THREE.DirectionalLight(0xffd292, 3.1);
    sun.position.set(-18, 42, 26);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -ARENA_W / 2 - 10;
    sun.shadow.camera.right = ARENA_W / 2 + 10;
    sun.shadow.camera.top = ARENA_D / 2 + 10;
    sun.shadow.camera.bottom = -ARENA_D / 2 - 10;
    sun.shadow.camera.near = 8;
    sun.shadow.camera.far = 88;
    scene.add(sun);

    var rim = new THREE.DirectionalLight(0x8fc5ff, 0.65);
    rim.position.set(30, 20, -24);
    scene.add(rim);
  }

  function buildEnvironment() {
    addBox(worldRoot, ARENA_W + 12, 0.32, ARENA_D + 10, mats.sand, 0, -0.18, 0);
    reservePlayerStartArea();
    buildRoadNetwork();
    buildTerrainPatches();
    buildGeneratedTown();
    buildFenceRing();
    buildTownSideRoads();
    buildMicroSettlements();
    scatterTownProps();
    buildOutskirts();
    buildWasteland();
  }

  function reservePlayerStartArea() {
    registerMapFootprint("player-start-clear", PLAYER_START.x, PLAYER_START.z, 5.4, 5.4, 0.15, false);
  }

  function buildRoadNetwork() {
    addRoad(ARENA_W + 7, 0.08, 7.6, 0, 0.02, MAIN_TOWN_CENTER.z, 0.28);
    addRoad(8.2, 0.09, ARENA_D + 5, MAIN_TOWN_CENTER.x, 0.04, 0, 0.28);
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
    registerMapFootprint(type || "road-clear", x, z, w, d, pad || 0.2, false);
    return road;
  }

  function addRoadIfLargeClear(w, h, d, x, y, z, pad, type) {
    if (mapAreaHitsLargePassageFootprints(x, z, w, d, pad || 0.2)) return null;
    return addRoad(w, h, d, x, y, z, pad, type);
  }

  function buildTerrainPatches() {
    var count = Math.round((BASE_ARENA_W * BASE_ARENA_D) / 48 * MAP_LINEAR_SCALE);
    for (var i = 0; i < count; i++) {
      var patchMat = i % 3 === 0 ? mats.sandDark : mats.sand;
      var px = mapRand(-ARENA_W / 2 - 4, ARENA_W / 2 + 4);
      var pz = mapRand(-ARENA_D / 2 - 3, ARENA_D / 2 + 3);
      var pw = mapRand(0.5, 2.1);
      var pd = mapRand(0.15, 0.62);
      var patch = addBox(worldRoot, pw, 0.035, pd, patchMat, px, 0.08, pz);
      patch.rotation.y = mapRand(0, Math.PI);
    }
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
    var settlements = [
      { x: clampSettlementX(MAIN_TOWN_CENTER.x + CITY_W / 2 + MAP_OUTSKIRT_X * 0.32), z: clampSettlementZ(MAIN_TOWN_CENTER.z - CITY_D * 0.18), name: "east" },
      { x: clampSettlementX(MAIN_TOWN_CENTER.x + CITY_W * 0.08), z: clampSettlementZ(MAIN_TOWN_CENTER.z + CITY_D / 2 + MAP_OUTSKIRT_Z * 0.34), name: "south" },
      { x: clampSettlementX(MAIN_TOWN_CENTER.x + CITY_W * 0.18), z: clampSettlementZ(MAIN_TOWN_CENTER.z - CITY_D / 2 - MAP_OUTSKIRT_Z * 0.34), name: "north" },
      { x: clampSettlementX(MAIN_TOWN_CENTER.x + CITY_W / 2 + MAP_OUTSKIRT_X * 0.68), z: clampSettlementZ(MAIN_TOWN_CENTER.z + mapRand(-MAP_OUTSKIRT_Z * 0.42, MAP_OUTSKIRT_Z * 0.42)), name: "far-east" },
      { x: clampSettlementX(MAIN_TOWN_CENTER.x + mapRand(-CITY_W * 0.15, MAP_OUTSKIRT_X * 0.5)), z: clampSettlementZ(MAIN_TOWN_CENTER.z + (mapRng() < 0.5 ? -1 : 1) * (CITY_D / 2 + MAP_OUTSKIRT_Z * 0.68)), name: "far-ns" },
    ];
    settlements.forEach(function (settlement, index) {
      buildMicroSettlement(settlement.x + mapRand(-2.2, 2.2), settlement.z + mapRand(-1.8, 1.8), index);
    });
    for (var fallback = 0; countBuiltMicroSettlements() < MICRO_SETTLEMENT_TARGET && fallback < 42; fallback++) {
      var point = findFallbackMicroSettlementPoint();
      if (point) buildMicroSettlement(point.x, point.z, 3 + fallback);
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
    return clamp(x, -CITY_W / 2 - 2.6 + 10, ARENA_W / 2 - 12.5);
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
    var dx = MAIN_TOWN_CENTER.x - x;
    var dz = MAIN_TOWN_CENTER.z - z;
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

  function scatterTownProps() {
    scatterProps(18, "cactus", "city");
    scatterProps(13, "barrel", "city");
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
      return {
        x: townLocalX(mapRand(-CITY_W / 2 + 2, CITY_W / 2 - 2)),
        z: townLocalZ(mapRand(-CITY_D / 2 + 2, CITY_D / 2 - 2)),
      };
    }
    return {
      x: mapRand(-ARENA_W / 2 + 2, ARENA_W / 2 - 2),
      z: mapRand(-ARENA_D / 2 + 2, ARENA_D / 2 - 2),
    };
  }

  function randomOutskirtPoint() {
    var side = Math.floor(mapRng() * 4);
    var x = 0;
    var z = 0;
    if (side === 0) {
      x = mapRand(-ARENA_W / 2 + 1.4, ARENA_W / 2 - 1.4);
      z = mapRand(-ARENA_D / 2 + 1.2, MAIN_TOWN_CENTER.z - CITY_D / 2 - 1.0);
    } else if (side === 1) {
      x = mapRand(-ARENA_W / 2 + 1.4, ARENA_W / 2 - 1.4);
      z = mapRand(MAIN_TOWN_CENTER.z + CITY_D / 2 + 1.0, ARENA_D / 2 - 1.2);
    } else if (side === 2) {
      x = mapRand(-ARENA_W / 2 + 1.2, MAIN_TOWN_CENTER.x - CITY_W / 2 - 1.0);
      z = mapRand(-ARENA_D / 2 + 1.4, ARENA_D / 2 - 1.4);
    } else {
      x = mapRand(MAIN_TOWN_CENTER.x + CITY_W / 2 + 1.0, ARENA_W / 2 - 1.2);
      z = mapRand(-ARENA_D / 2 + 1.4, ARENA_D / 2 - 1.4);
    }
    return { x: x, z: z };
  }

  function randomSettledOutskirtPoint() {
    for (var attempt = 0; attempt < 30; attempt++) {
      var p = randomOutskirtPoint();
      if (!isWastelandPoint(p.x, p.z)) return p;
    }
    return {
      x: mapRand(-CITY_W / 2 - 2.6 + 2.0, ARENA_W / 2 - 1.2),
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
    if (avoidRoads && (Math.abs(x - MAIN_TOWN_CENTER.x) < 5.2 || Math.abs(z - MAIN_TOWN_CENTER.z) < 4.6)) return false;
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
    return (
      x + halfW > MAIN_TOWN_CENTER.x - CITY_W / 2 - margin &&
      x - halfW < MAIN_TOWN_CENTER.x + CITY_W / 2 + margin &&
      z + halfD > MAIN_TOWN_CENTER.z - CITY_D / 2 - margin &&
      z - halfD < MAIN_TOWN_CENTER.z + CITY_D / 2 + margin
    );
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
      playerSpawnClear: !pointHitsMapFootprint(PLAYER_START.x, PLAYER_START.z, 1.05, ["player-start-clear", "road-clear", "micro-road-clear"]),
      minGap: isFinite(minGap) ? Number(minGap.toFixed(3)) : null,
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
    clearDynamic();
    state.mode = mode || "playing";
    state.time = 0;
    state.wave = 1;
    state.score = 0;
    state.kills = 0;
    state.shotsFired = 0;
    state.spawnLeft = 0;
    state.spawnTimer = 0;
    state.spawnInterval = 1;
    state.nextWaveTimer = 0;
    state.shake = 0;
    state.enemies = [];
    state.bullets = [];
    state.particles = [];
    state.flashes = [];
    state.shockwaves = [];
    state.decals = [];
    state.lightFlashes = [];
    state.smokePuffs = [];
    state.ambientDust = [];
    state.debris = [];
    state.ammoCrates = [];
    state.ammoCrateTimer = state.mode === "playing" ? rand(7, 11) : 0;
    state.weapon = "revolver";
    state.ownedWeapons = { revolver: true, rifle: false, launcher: false };
    initAmmoState();
    resetAmmoVisualState();
    pointerDown = false;
    resetTouchControls();

    state.player = {
      x: PLAYER_START.x,
      z: PLAYER_START.z,
      radius: 0.72,
      hp: 120,
      maxHp: 120,
      speed: 8.3,
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
    state.player.group.position.set(state.player.x, 0, state.player.z);
    dynamicRoot.add(state.player.group);
    setWeaponVisual("revolver");
    createAmbientDust();

    if (state.mode === "playing") startWave(1);
    setPanel(menu, state.mode === "menu");
    setPanel(gameOverPanel, false);
    updateHud();
  }

  function clearDynamic() {
    while (dynamicRoot.children.length) removeObject3D(dynamicRoot.children[0]);
    while (effectRoot.children.length) removeObject3D(effectRoot.children[0]);
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
    var leftHolster = rememberBase(addBox(g, 0.22, 0.2, 0.34, mats.metal, -0.58, 0.95, -0.45));
    var rightHolster = rememberBase(addBox(g, 0.16, 0.16, 0.44, mats.metal, 0.58, 0.95, -0.45));
    var belt = rememberBase(addBox(g, 1.2, 0.12, 0.12, mats.black, 0, 1.2, 0.42));
    var scarf = rememberBase(addBox(g, 0.34, 0.18, 0.14, mats.zombieBlood, 0, 1.55, 0.48));
    g.userData.weaponMeshes = {
      revolver: revolverParts,
      rifle: rifleParts,
      launcher: launcherParts,
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
      belt: belt,
      scarf: scarf,
      leftHolster: leftHolster,
      rightHolster: rightHolster,
    };
    g.userData.weaponRig = weaponRig;
    setWeaponMeshes(g, "revolver");
    return g;
  }

  function startWave(wave) {
    state.wave = wave;
    state.spawnLeft = 5 + wave * 2;
    state.spawnTimer = 0.2;
    state.spawnInterval = Math.max(0.42, 1.02 - wave * 0.055);
    state.nextWaveTimer = 0;
    updateHud();
  }

  function spawnZombie() {
    var type = chooseZombieType();
    var zombie = makeZombie(type);
    var spawn = findZombieSpawnPoint(zombie.radius);
    zombie.x = spawn.x;
    zombie.z = spawn.z;
    zombie.spawnSide = spawn.side;
    zombie.group.position.set(zombie.x, 0, zombie.z);
    state.enemies.push(zombie);
    dynamicRoot.add(zombie.group);
    addSpawnDust(zombie.x, zombie.z);
  }

  function chooseZombieType() {
    var type = "walker";
    if (state.wave >= 3 && rng() < 0.22) type = "runner";
    if (state.wave >= 5 && rng() < 0.18) type = "brute";
    if (state.wave >= 8 && rng() < 0.12) type = "spitter";
    return type;
  }

  function findZombieSpawnPoint(radius) {
    var rect = getCurrentVisibleGroundRect();
    var minX = -ARENA_W / 2 - ENEMY_BOUNDS_EXTRA + radius;
    var maxX = ARENA_W / 2 + ENEMY_BOUNDS_EXTRA - radius;
    var minZ = -ARENA_D / 2 - ENEMY_BOUNDS_EXTRA + radius;
    var maxZ = ARENA_D / 2 + ENEMY_BOUNDS_EXTRA - radius;
    var outsidePad = Math.max(3.65, radius + 0.65);
    for (var attempt = 0; attempt < 140; attempt++) {
      var side = Math.floor(rng() * 4);
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
      if (!pointInsideEnemyBounds(x, z, radius)) continue;
      if (!pointOutsideVisibleGround(x, z, outsidePad, rect)) continue;
      if (pointHitsObstacle(x, z, radius + 0.16)) continue;
      return { x: x, z: z, side: side };
    }
    return findFallbackZombieSpawnPoint(radius, rect);
  }

  function findFallbackZombieSpawnPoint(radius, rect) {
    var minX = -ARENA_W / 2 - ENEMY_BOUNDS_EXTRA + radius;
    var maxX = ARENA_W / 2 + ENEMY_BOUNDS_EXTRA - radius;
    var minZ = -ARENA_D / 2 - ENEMY_BOUNDS_EXTRA + radius;
    var maxZ = ARENA_D / 2 + ENEMY_BOUNDS_EXTRA - radius;
    var candidates = [
      { x: clamp((rect.minX + rect.maxX) / 2, minX, maxX), z: minZ, side: 0 },
      { x: clamp((rect.minX + rect.maxX) / 2, minX, maxX), z: maxZ, side: 1 },
      { x: minX, z: clamp((rect.minZ + rect.maxZ) / 2, minZ, maxZ), side: 2 },
      { x: maxX, z: clamp((rect.minZ + rect.maxZ) / 2, minZ, maxZ), side: 3 },
    ];
    for (var i = 0; i < candidates.length; i++) {
      var c = candidates[i];
      if (pointOutsideVisibleGround(c.x, c.z, radius * 0.5, rect) && !pointHitsObstacle(c.x, c.z, radius + 0.16)) return c;
    }
    return candidates[Math.floor(rng() * candidates.length)];
  }

  function getCurrentVisibleGroundRect() {
    var p = state.player;
    var follow = clampCameraTarget(p ? p.x : 0, p ? p.z : 0);
    return {
      minX: follow.x + cameraGroundBounds.minX,
      maxX: follow.x + cameraGroundBounds.maxX,
      minZ: follow.z + cameraGroundBounds.minZ,
      maxZ: follow.z + cameraGroundBounds.maxZ,
      targetX: follow.x,
      targetZ: follow.z,
    };
  }

  function pointOutsideVisibleGround(x, z, pad, rect) {
    var r = rect || getCurrentVisibleGroundRect();
    var p = pad || 0;
    return x < r.minX - p || x > r.maxX + p || z < r.minZ - p || z > r.maxZ + p;
  }

  function makeZombie(type) {
    var config = {
      walker: { hp: 2, speed: 2.35, radius: 0.68, damage: 8, scale: 1, score: 100, color: mats.zombieSkin },
      runner: { hp: 1, speed: 3.85, radius: 0.58, damage: 6, scale: 0.86, score: 140, color: mats.zombieSkinDark },
      brute: { hp: 5, speed: 1.85, radius: 0.93, damage: 15, scale: 1.28, score: 280, color: mats.zombieSkin },
      spitter: { hp: 3, speed: 2.15, radius: 0.72, damage: 12, scale: 1.04, score: 220, color: mats.zombieSkinDark },
    }[type];
    var g = new THREE.Group();
    g.name = "blocky zombie " + type;
    var s = config.scale;
    addContactShadow(g, 1.75 * s, 1.45 * s, 0.18);
    var leftLeg = rememberBase(addBox(g, 0.62 * s, 0.58 * s, 0.54 * s, mats.zombieShirt, -0.18 * s, 0.42 * s, 0));
    var rightLeg = rememberBase(addBox(g, 0.62 * s, 0.58 * s, 0.54 * s, mats.zombieShirt, 0.18 * s, 0.42 * s, 0));
    var torso = rememberBase(addBox(g, 1.0 * s, 1.05 * s, 0.7 * s, mats.zombieShirt, 0, 1.15 * s, 0));
    var leftArm = rememberBase(addBox(g, 0.35 * s, 1.0 * s, 0.35 * s, config.color, -0.74 * s, 1.22 * s, 0.22 * s));
    var rightArm = rememberBase(addBox(g, 0.35 * s, 1.0 * s, 0.35 * s, config.color, 0.74 * s, 1.22 * s, 0.22 * s));
    var head = rememberBase(addBox(g, 0.86 * s, 0.75 * s, 0.82 * s, config.color, 0, 2.02 * s, 0));
    var leftEye = rememberBase(addBox(g, 0.16 * s, 0.12 * s, 0.12 * s, mats.black, -0.2 * s, 2.1 * s, 0.44 * s));
    var rightEye = rememberBase(addBox(g, 0.16 * s, 0.12 * s, 0.12 * s, mats.black, 0.2 * s, 2.08 * s, 0.44 * s));
    var mouth = rememberBase(addBox(g, 0.55 * s, 0.11 * s, 0.12 * s, mats.zombieBlood, 0, 1.88 * s, 0.46 * s));
    addHealthBar(g, s);
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
    };
    return {
      type: type,
      x: 0,
      z: 0,
      hp: config.hp,
      maxHp: config.hp,
      speed: config.speed,
      radius: config.radius,
      damage: config.damage,
      score: config.score,
      group: g,
      attackCooldown: 0,
      hitPulse: 0,
      walkPhase: rand(0, Math.PI * 2),
      moveAmount: 0,
      stuckTimer: 0,
      steerX: 0,
      steerZ: 1,
      avoidSide: rng() < 0.5 ? -1 : 1,
      navGoal: null,
    };
  }

  function addHealthBar(group, scale) {
    var back = addBox(group, 1.25 * scale, 0.12 * scale, 0.12 * scale, mats.healthBack, 0, 2.74 * scale, 0);
    var fill = addBox(group, 1.15 * scale, 0.14 * scale, 0.14 * scale, mats.healthRed, 0, 2.75 * scale, 0.02);
    fill.name = "health-fill";
    group.userData.healthFill = fill;
    group.userData.healthBaseWidth = 1.15 * scale;
    back.castShadow = false;
    fill.castShadow = false;
    back.userData.noDebris = true;
    fill.userData.noDebris = true;
  }

  function update(dt) {
    state.time += dt;
    state.shake = Math.max(0, state.shake - dt * 5.5);

    if (state.player) {
      updateAim();
      updatePlayerVisual(dt);
    }

    if (state.mode !== "playing") {
      updateParticles(dt);
      updateVisualEffects(dt);
      return;
    }

    updateReloads(dt);
    updatePlayer(dt);
    updateAmmoCrates(dt);
    updateSpawning(dt);
    updateEnemies(dt);
    updateBullets(dt);
    updateParticles(dt);
    updateVisualEffects(dt);
    updateWaveProgress(dt);
    updateHud();
  }

  function initAmmoState() {
    state.ammo = {};
    state.ammoReserve = {};
    state.reloadTimers = {};
    Object.keys(WEAPONS).forEach(function (id) {
      state.ammo[id] = WEAPONS[id].magazine;
      state.ammoReserve[id] = Math.max(0, (WEAPONS[id].reserveStart || 0) - WEAPONS[id].magazine);
      state.reloadTimers[id] = 0;
    });
  }

  function resetAmmoVisualState() {
    currentAmmoIcon = "";
    ammoVisualState.weapon = "";
    ammoVisualState.magazine = 0;
    ammoVisualState.current = null;
    if (ammoCartridgeRack) ammoCartridgeRack.innerHTML = "";
  }

  function buildAmmoRack(weapon, current) {
    if (!ammoCartridgeRack) return;
    ammoCartridgeRack.innerHTML = "";
    ammoCartridgeRack.dataset.weapon = weapon.id;
    ammoCartridgeRack.dataset.magazine = String(weapon.magazine);
    for (var i = 0; i < weapon.magazine; i++) {
      var round = document.createElement("span");
      round.className = "ammo-round";
      round.dataset.index = String(i);
      var live = document.createElement("span");
      live.className = "ammo-round-live";
      round.appendChild(live);
      if (i >= current) round.classList.add("is-spent");
      ammoCartridgeRack.appendChild(round);
    }
    ammoVisualState.weapon = weapon.id;
    ammoVisualState.magazine = weapon.magazine;
    ammoVisualState.current = current;
  }

  function syncAmmoRack(weapon, ammo) {
    if (!ammoCartridgeRack) return;
    var current = Math.round(clamp(ammo.current, 0, weapon.magazine));
    var needsRebuild = ammoVisualState.weapon !== weapon.id || ammoVisualState.magazine !== weapon.magazine || ammoCartridgeRack.children.length !== weapon.magazine;
    if (needsRebuild) {
      buildAmmoRack(weapon, current);
      return;
    }

    var previous = ammoVisualState.current == null ? current : ammoVisualState.current;
    var slots = Array.prototype.slice.call(ammoCartridgeRack.children);
    slots.forEach(function (slot, index) {
      slot.classList.toggle("is-spent", index >= current);
    });

    if (current < previous) {
      for (var i = current; i < previous; i++) triggerAmmoDrop(slots[i], i);
    } else if (current > previous) {
      for (var j = previous; j < current; j++) triggerAmmoRefill(slots[j], j);
    }
    ammoVisualState.current = current;
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
      if (!state.reloadTimers[id]) return;
      state.reloadTimers[id] = Math.max(0, state.reloadTimers[id] - dt);
      if (state.reloadTimers[id] <= 0) {
        state.reloadTimers[id] = 0;
        var weapon = WEAPONS[id];
        var current = clamp(state.ammo[id] || 0, 0, weapon.magazine);
        var needed = Math.max(0, weapon.magazine - current);
        var reserve = Math.max(0, state.ammoReserve[id] || 0);
        var loaded = Math.min(needed, reserve);
        state.ammo[id] = current + loaded;
        state.ammoReserve[id] = reserve - loaded;
      }
    });
  }

  function startReload(id) {
    var weapon = WEAPONS[id];
    if (!weapon || state.reloadTimers[id] > 0) return;
    var current = clamp(state.ammo[id] || 0, 0, weapon.magazine);
    if (current >= weapon.magazine) return;
    if ((state.ammoReserve[id] || 0) <= 0) return;
    state.reloadTimers[id] = weapon.reloadTime;
    if (state.player) state.player.cooldown = Math.max(state.player.cooldown, 0.08);
  }

  function getAmmoState(id) {
    var weapon = WEAPONS[id] || WEAPONS.revolver;
    var remaining = state.reloadTimers[weapon.id] || 0;
    return {
      current: state.ammo[weapon.id] == null ? weapon.magazine : state.ammo[weapon.id],
      magazine: weapon.magazine,
      reserve: Math.max(0, state.ammoReserve[weapon.id] || 0),
      total: (state.ammo[weapon.id] == null ? weapon.magazine : state.ammo[weapon.id]) + Math.max(0, state.ammoReserve[weapon.id] || 0),
      reloading: remaining > 0,
      reloadRemaining: remaining,
      reloadProgress: remaining > 0 ? clamp(1 - remaining / weapon.reloadTime, 0, 1) : 0,
    };
  }

  function updatePlayer(dt) {
    var p = state.player;
    var mx = 0;
    var mz = 0;
    var oldX = p.x;
    var oldZ = p.z;
    if (keys.KeyW || keys.ArrowUp) mz -= 1;
    if (keys.KeyS || keys.ArrowDown) mz += 1;
    if (keys.KeyA || keys.ArrowLeft) mx -= 1;
    if (keys.KeyD || keys.ArrowRight) mx += 1;
    mx += touchMove.x;
    mz += touchMove.z;
    var len = Math.hypot(mx, mz);
    if (len > 0) {
      mx /= len;
      mz /= len;
      if (touchMove.active && Math.hypot(touchMove.x, touchMove.z) > 0.18) {
        lastMobileAim.x = touchMove.x / Math.hypot(touchMove.x, touchMove.z);
        lastMobileAim.z = touchMove.z / Math.hypot(touchMove.x, touchMove.z);
      }
      p.x += mx * p.speed * dt;
      p.z += mz * p.speed * dt;
      p.x = clamp(p.x, -ARENA_W / 2 + p.radius, ARENA_W / 2 - p.radius);
      p.z = clamp(p.z, -ARENA_D / 2 + p.radius, ARENA_D / 2 - p.radius);
    }
    resolveMoverPosition(p, p.radius, 0);
    var moved = Math.hypot(p.x - oldX, p.z - oldZ);
    p.moveAmount += (clamp(moved / Math.max(0.001, p.speed * dt), 0, 1) - p.moveAmount) * Math.min(1, dt * 12);
    p.walkPhase += dt * (7.5 + p.speed * 0.5) * p.moveAmount;
    p.cooldown = Math.max(0, p.cooldown - dt);
    p.invuln = Math.max(0, p.invuln - dt);
    p.group.position.set(p.x, 0, p.z);

    if ((pointerDown || touchFire.active) && p.cooldown <= 0) shoot();
  }

  function updateAmmoCrates(dt) {
    state.ammoCrateTimer = Math.max(0, state.ammoCrateTimer - dt);
    if (state.ammoCrateTimer <= 0) {
      if (state.ammoCrates.length < MAX_AMMO_CRATES) spawnAmmoCrate();
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

  function spawnAmmoCrate() {
    var pos = findAmmoCrateSpawnPosition();
    if (!pos) return false;
    return spawnAmmoCrateAt(pos.x, pos.z);
  }

  function spawnAmmoCrateAt(x, z) {
    var crate = createAmmoCrate(x, z);
    state.ammoCrates.push(crate);
    dynamicRoot.add(crate.group);
    addShockwave(x, z, 1.65, 0.34, 0xffd36b);
    return crate;
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

  function createAmmoCrate(x, z) {
    var group = new THREE.Group();
    group.name = "ammo crate";
    group.position.set(x, 0, z);

    var ringMat = mats.ammoRing.clone();
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
      group: group,
      body: body,
      ring: ring,
    };
  }

  function collectAmmoCrate(index) {
    var crate = state.ammoCrates[index];
    if (!crate) return false;
    var amounts = getAmmoPickupAmounts();
    Object.keys(amounts).forEach(function (id) {
      state.ammoReserve[id] = Math.max(0, state.ammoReserve[id] || 0) + amounts[id];
    });
    if (state.weapon && (state.ammo[state.weapon] || 0) <= 0) startReload(state.weapon);
    addAmmoPickupBurst(crate.x, crate.z);
    removeObject3D(crate.group);
    state.ammoCrates.splice(index, 1);
    updateHud();
    return true;
  }

  function getAmmoPickupAmounts() {
    return Object.keys(WEAPONS).reduce(function (acc, id) {
      if (state.ownedWeapons[id]) acc[id] = WEAPONS[id].reserveStart || 0;
      return acc;
    }, {});
  }

  function addAmmoPickupBurst(x, z) {
    addShockwave(x, z, 2.15, 0.38, 0xffd66d);
    addLightFlash(x, 1.05, z, 0xffd66d, 1.8, 5, 0.18);
    for (var i = 0; i < 18; i++) {
      var angle = rand(0, Math.PI * 2);
      var speed = rand(1.6, 4.6);
      spawnParticle(x, rand(0.55, 1.5), z, Math.cos(angle) * speed, rand(1.2, 4.2), Math.sin(angle) * speed, rand(0.22, 0.48), rand(0.06, 0.15), i % 4 === 0 ? mats.rifleTracer : mats.ammoRound);
    }
  }

  function updateAim() {
    var p = state.player;
    if (touchFire.active || (touchMove.active && Math.hypot(touchMove.x, touchMove.z) > 0.18)) {
      updateMobileAimTarget(p);
    }
    var dx = state.pointerWorld.x - p.x;
    var dz = state.pointerWorld.z - p.z;
    if (Math.hypot(dx, dz) < 0.001) dz = 1;
    p.aimAngle = Math.atan2(dx, dz);
    p.group.rotation.y = p.aimAngle;
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

    var moveLen = Math.hypot(touchMove.x, touchMove.z);
    if (moveLen > 0.18) {
      lastMobileAim.x = touchMove.x / moveLen;
      lastMobileAim.z = touchMove.z / moveLen;
    }
    state.pointerWorld.x = player.x + lastMobileAim.x * 7;
    state.pointerWorld.z = player.z + lastMobileAim.z * 7;
  }

  function findNearestEnemy(x, z, maxDistance) {
    var best = null;
    var bestDist = maxDistance || Infinity;
    for (var i = 0; i < state.enemies.length; i++) {
      var enemy = state.enemies[i];
      var dist = Math.hypot(enemy.x - x, enemy.z - z);
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
    if (ammo.reloading) {
      p.cooldown = Math.max(p.cooldown, 0.08);
      return false;
    }
    if (ammo.current <= 0) {
      startReload(weapon.id);
      if ((state.ammoReserve[weapon.id] || 0) <= 0) p.cooldown = Math.max(p.cooldown, 0.16);
      return false;
    }
    var dir = new THREE.Vector3(Math.sin(p.aimAngle), 0, Math.cos(p.aimAngle)).normalize();
    var start = new THREE.Vector3(
      p.x + dir.x * weapon.muzzleDistance,
      weapon.muzzleY,
      p.z + dir.z * weapon.muzzleDistance
    );
    var bulletMesh = createProjectileMesh(weapon, start, p.aimAngle);
    state.shotsFired += 1;
    state.bullets.push({
      type: weapon.id,
      x: start.x,
      y: start.y,
      z: start.z,
      dirX: dir.x,
      dirZ: dir.z,
      speed: weapon.speed,
      life: weapon.life,
      maxLife: weapon.life,
      age: 0,
      damage: weapon.damage,
      hitRadius: weapon.hitRadius,
      blastRadius: weapon.blastRadius || 0,
      blastDamage: weapon.blastDamage || 0,
      trailTimer: 0,
      mesh: bulletMesh,
    });
    state.ammo[weapon.id] = Math.max(0, ammo.current - 1);
    if (state.ammo[weapon.id] <= 0) startReload(weapon.id);
    p.cooldown = weapon.cooldown;
    p.shootKick = weapon.id === "launcher" ? 1 : weapon.id === "rifle" ? 0.72 : 0.55;
    state.shake = Math.min(1.2, state.shake + weapon.shake);
    addLightFlash(start.x, start.y, start.z, weapon.id === "launcher" ? 0xff7a24 : 0xffd36b, weapon.id === "launcher" ? 3.2 : 1.7, weapon.id === "launcher" ? 8 : 5, weapon.id === "launcher" ? 0.16 : 0.08);
    addSmokePuff(start.x - dir.x * 0.18, start.y, start.z - dir.z * 0.18, weapon.id === "launcher" ? 0.55 : 0.28, weapon.id === "launcher" ? 0.48 : 0.28);

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

  function createProjectileMesh(weapon, start, angle) {
    if (weapon.id === "launcher") {
      var grenade = new THREE.Group();
      grenade.position.set(start.x, start.y, start.z);
      grenade.rotation.y = angle;
      effectRoot.add(grenade);
      addSharedBox(grenade, 0.44, 0.34, 0.52, mats.grenade, 0, 0, 0);
      addSharedBox(grenade, 0.5, 0.12, 0.12, mats.metal, 0, 0.02, -0.28);
      addSharedBox(grenade, 0.16, 0.16, 0.16, mats.explosion, 0, 0.02, 0.32);
      return grenade;
    }

    var mat = weapon.id === "rifle" ? mats.rifleTracer : mats.bullet;
    var mesh = addSharedBox(effectRoot, weapon.width, weapon.width, weapon.length, mat, start.x, start.y, start.z);
    mesh.rotation.y = angle;
    return mesh;
  }

  function explodeGrenade(x, z, radius, damage) {
    var blastRadius = radius || WEAPONS.launcher.blastRadius;
    var blastDamage = damage || WEAPONS.launcher.blastDamage;
    addShockwave(x, z, blastRadius, 0.5, 0xffe0a0);
    addScorchMark(x, z, blastRadius * 0.62);
    addLightFlash(x, 1.2, z, 0xff7a22, 5.8, 12, 0.28);
    for (var s = 0; s < 12; s++) {
      addSmokePuff(x + rand(-0.8, 0.8), rand(0.45, 1.25), z + rand(-0.8, 0.8), rand(0.48, 0.95), rand(0.55, 1.05));
    }
    var victims = state.enemies.slice();
    for (var i = 0; i < victims.length; i++) {
      var enemy = victims[i];
      if (state.enemies.indexOf(enemy) === -1) continue;
      var dist = Math.hypot(enemy.x - x, enemy.z - z);
      if (dist > blastRadius) continue;
      var ratio = 1 - dist / blastRadius;
      var dealt = Math.max(1, Math.ceil(blastDamage * ratio + 0.5));
      damageEnemy(enemy, dealt, x, z);
    }

    for (var p = 0; p < 34; p++) {
      var angle = rand(0, Math.PI * 2);
      var speed = rand(1.4, 7.2);
      spawnParticle(
        x + Math.cos(angle) * rand(0, 0.5),
        rand(0.35, 1.35),
        z + Math.sin(angle) * rand(0, 0.5),
        Math.cos(angle) * speed,
        rand(1.2, 5.2),
        Math.sin(angle) * speed,
        rand(0.28, 0.58),
        rand(0.12, 0.38),
        p % 4 === 0 ? mats.flash : mats.explosion
      );
    }
    state.shake = Math.min(1.4, state.shake + 0.75);
  }

  function updateSpawning(dt) {
    if (state.spawnLeft <= 0) return;
    state.spawnTimer -= dt;
    if (state.spawnTimer <= 0) {
      spawnZombie();
      state.spawnLeft -= 1;
      state.spawnTimer = state.spawnInterval * rand(0.65, 1.25);
    }
  }

  function updateEnemies(dt) {
    var p = state.player;
    for (var i = state.enemies.length - 1; i >= 0; i--) {
      var e = state.enemies[i];
      e.attackCooldown = Math.max(0, e.attackCooldown - dt);
      e.hitPulse = Math.max(0, e.hitPulse - dt * 5);

      var dx = p.x - e.x;
      var dz = p.z - e.z;
      var dist = Math.max(0.001, Math.hypot(dx, dz));
      var nx = dx / dist;
      var nz = dz / dist;
      var oldX = e.x;
      var oldZ = e.z;

      var sepX = 0;
      var sepZ = 0;
      var playerMin = e.radius + p.radius + 0.12;
      if (dist < playerMin) {
        sepX -= nx * (playerMin - dist);
        sepZ -= nz * (playerMin - dist);
      }
      for (var j = 0; j < state.enemies.length; j++) {
        if (i === j) continue;
        var o = state.enemies[j];
        var odx = e.x - o.x;
        var odz = e.z - o.z;
        var od = Math.hypot(odx, odz);
        var minSep = e.radius + o.radius + 0.36;
        if (od < minSep) {
          if (od <= 0.001) {
            var angle = (i + j + 1) * 2.399963;
            odx = Math.cos(angle);
            odz = Math.sin(angle);
            od = 1;
          }
          sepX += (odx / od) * (minSep - od);
          sepZ += (odz / od) * (minSep - od);
        }
      }

      var moveX = 0;
      var moveZ = 0;
      var faceX = nx;
      var faceZ = nz;
      if (dist > e.radius + p.radius + 0.18) {
        var steer = chooseZombieDirection(e, p, nx, nz, dist, dt);
        moveX = steer.x * e.speed;
        moveZ = steer.z * e.speed;
        faceX = steer.x;
        faceZ = steer.z;
      } else if (e.attackCooldown <= 0) {
        damagePlayer(e.damage);
        e.attackCooldown = e.type === "runner" ? 0.8 : 1.05;
      }
      e.x += (moveX + sepX * 4.2) * dt;
      e.z += (moveZ + sepZ * 4.2) * dt;
      resolveMoverPosition(e, e.radius, ENEMY_BOUNDS_EXTRA);
      var moved = Math.hypot(e.x - oldX, e.z - oldZ);
      updateZombieStuckState(e, moved, dist, dt);
      e.moveAmount += (clamp(moved / Math.max(0.001, e.speed * dt), 0, 1) - e.moveAmount) * Math.min(1, dt * 10);
      e.walkPhase += dt * (4.6 + e.speed * 1.1) * e.moveAmount;

      e.group.position.set(e.x, 0, e.z);
      e.group.rotation.y = Math.atan2(faceX, faceZ);
      e.group.scale.setScalar(1 + e.hitPulse * 0.08);
      updateZombieVisual(e);
      updateEnemyHealthBar(e);
    }
  }

  function chooseZombieDirection(enemy, player, nx, nz, dist, dt) {
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
    return { x: enemy.steerX / len, z: enemy.steerZ / len };
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

    enemy.navGoal = {
      x: corner.x,
      z: corner.z,
      holdUntil: state.time + 0.35,
      expires: state.time + 2.8,
    };
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
    var offsets = [0, 0.28 * side, -0.28 * side, 0.58 * side, -0.58 * side, 0.95 * side, -0.95 * side, 1.35 * side, -1.35 * side, Math.PI * side];
    var prevX = enemy.steerX || wantX;
    var prevZ = enemy.steerZ || wantZ;
    var best = { x: wantX, z: wantZ };
    var bestScore = -Infinity;
    var lookNear = enemy.radius + 0.35 + enemy.speed * dt;
    var lookFar = enemy.radius + Math.min(1.8, 0.9 + enemy.speed * 0.2 + enemy.stuckTimer * 2);

    for (var i = 0; i < offsets.length; i++) {
      var dir = rotateDirection(wantX, wantZ, offsets[i]);
      var nearX = enemy.x + dir.x * lookNear;
      var nearZ = enemy.z + dir.z * lookNear;
      var farX = enemy.x + dir.x * lookFar;
      var farZ = enemy.z + dir.z * lookFar;
      var blocked =
        pointHitsObstacle(nearX, nearZ, enemy.radius + 0.08) ||
        pointHitsObstacle(farX, farZ, enemy.radius + 0.08) ||
        !pointInsideEnemyBounds(farX, farZ, enemy.radius);
      var clearance = obstacleClearanceAt(farX, farZ, enemy.radius);
      var wantDot = dir.x * wantX + dir.z * wantZ;
      var prevDot = dir.x * prevX + dir.z * prevZ;
      var score = wantDot * 3.4 + prevDot * 0.7 + clearance * 0.32;
      if (blocked) score -= 7.5;
      if (enemy.stuckTimer > 0.18) score += prevDot * 0.7 + Math.abs(offsets[i]) * 0.22;

      if (score > bestScore) {
        bestScore = score;
        best = dir;
      }
    }

    return best;
  }

  function rotateDirection(x, z, angle) {
    var ca = Math.cos(angle);
    var sa = Math.sin(angle);
    return {
      x: x * ca - z * sa,
      z: x * sa + z * ca,
    };
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
    var parts = enemy.group.userData.animParts || {};
    var intensity = enemy.moveAmount || 0;
    var stride = Math.sin(enemy.walkPhase);
    var counterStride = Math.sin(enemy.walkPhase + Math.PI);
    var lurch = Math.sin(enemy.walkPhase * 0.5 + enemy.radius) * 0.08 * intensity;
    enemy.group.position.y = Math.abs(Math.sin(enemy.walkPhase * 2)) * 0.055 * intensity;
    enemy.group.rotation.z = lurch + enemy.hitPulse * 0.04;
    animateMesh(parts.leftLeg, { rx: stride * 0.34 * intensity, z: -Math.abs(stride) * 0.05 * intensity });
    animateMesh(parts.rightLeg, { rx: counterStride * 0.34 * intensity, z: -Math.abs(counterStride) * 0.05 * intensity });
    animateMesh(parts.leftArm, { rx: -0.55 + counterStride * 0.22 * intensity, rz: -0.12 + stride * 0.12 * intensity });
    animateMesh(parts.rightArm, { rx: -0.55 + stride * 0.22 * intensity, rz: 0.12 + counterStride * 0.12 * intensity });
    animateMesh(parts.torso, { rx: -0.08 * intensity, rz: lurch * 0.7 });
    animateMesh(parts.head, { rx: 0.08 + Math.sin(enemy.walkPhase * 1.4) * 0.08 * intensity, rz: -lurch * 1.6 });
    animateMesh(parts.leftEye, { rx: 0.08 + Math.sin(enemy.walkPhase * 1.4) * 0.08 * intensity, rz: -lurch * 1.6 });
    animateMesh(parts.rightEye, { rx: 0.08 + Math.sin(enemy.walkPhase * 1.4) * 0.08 * intensity, rz: -lurch * 1.6 });
    animateMesh(parts.mouth, { rx: 0.08 + Math.sin(enemy.walkPhase * 1.4) * 0.08 * intensity, rz: -lurch * 1.6 });
  }

  function damagePlayer(amount) {
    var p = state.player;
    if (p.invuln > 0 || state.mode !== "playing") return;
    p.hp = Math.max(0, p.hp - amount);
    p.invuln = 0.36;
    state.shake = Math.min(1.2, state.shake + 0.45);
    for (var i = 0; i < 10; i++) {
      spawnParticle(p.x, 1.1, p.z, rand(-3, 3), rand(1.5, 4.5), rand(-3, 3), 0.35, rand(0.08, 0.18), mats.zombieBlood);
    }
    addShockwave(p.x, p.z, 1.25, 0.22, 0xd83a2e);
    if (p.hp <= 0) endGame();
  }

  function updateBullets(dt) {
    for (var i = state.bullets.length - 1; i >= 0; i--) {
      var b = state.bullets[i];
      b.age += dt;
      b.life -= dt;
      b.x += b.dirX * b.speed * dt;
      b.z += b.dirZ * b.speed * dt;
      if (b.type === "launcher") {
        var progress = clamp(b.age / b.maxLife, 0, 1);
        b.y = 0.68 + Math.sin(progress * Math.PI) * 1.15;
        b.mesh.rotation.x += dt * 7.5;
        b.mesh.rotation.z += dt * 5.2;
      }
      b.mesh.position.set(b.x, b.y, b.z);
      b.trailTimer -= dt;
      if (b.trailTimer <= 0) {
        b.trailTimer = b.type === "launcher" ? 0.045 : 0.035;
        if (b.type === "launcher") {
          addSmokePuff(b.x - b.dirX * 0.2, b.y, b.z - b.dirZ * 0.2, 0.22, 0.42);
        } else {
          spawnParticle(b.x - b.dirX * 0.2, b.y, b.z - b.dirZ * 0.2, 0, 0.2, 0, 0.12, 0.05, b.type === "rifle" ? mats.rifleTracer : mats.flash);
        }
      }

      var hit = null;
      for (var j = 0; j < state.enemies.length; j++) {
        var e = state.enemies[j];
        var d = Math.hypot(b.x - e.x, b.z - e.z);
        if (d < e.radius + b.hitRadius) {
          hit = e;
          break;
        }
      }

      if (hit) {
        if (b.type === "launcher") {
          explodeGrenade(b.x, b.z, b.blastRadius, b.blastDamage);
        } else {
          damageEnemy(hit, b.damage, b.x, b.z);
        }
        removeBullet(i);
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
        if (b.type === "launcher") explodeGrenade(b.x, b.z, b.blastRadius, b.blastDamage);
        removeBullet(i);
      }
    }
  }

  function damageEnemy(enemy, damage, x, z) {
    enemy.hp -= damage;
    enemy.hitPulse = 1;
    addHitSpark(x, z);
    for (var i = 0; i < 6; i++) {
      spawnParticle(x, 1.05, z, rand(-2.5, 2.5), rand(0.8, 3.6), rand(-2.5, 2.5), 0.28, rand(0.08, 0.18), mats.zombieBlood);
    }
    state.shake = Math.min(1, state.shake + 0.1);
    if (enemy.hp <= 0) killEnemy(enemy);
  }

  function killEnemy(enemy) {
    var idx = state.enemies.indexOf(enemy);
    if (idx !== -1) state.enemies.splice(idx, 1);
    createDeathDebris(enemy);
    removeObject3D(enemy.group);
    state.score += enemy.score;
    state.kills += 1;
    addScorchMark(enemy.x, enemy.z, 0.9);
    addGoldBurst(enemy.x, enemy.z, enemy.score);
    for (var i = 0; i < 18; i++) {
      spawnParticle(enemy.x, rand(0.7, 2.1), enemy.z, rand(-4, 4), rand(1.4, 5.2), rand(-4, 4), rand(0.35, 0.7), rand(0.08, 0.22), i % 3 === 0 ? mats.zombieSkin : mats.zombieBlood);
    }
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
    removeObject3D(b.mesh);
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
      p.mesh.position.set(p.x, p.y, p.z);
      var fade = clamp(p.life / p.startLife, 0, 1);
      p.mesh.scale.setScalar(Math.max(0.05, fade) * p.startScale);
      if (p.life <= 0) {
        removeParticle(i);
      }
    }
  }

  function updateVisualEffects(dt) {
    for (var i = state.shockwaves.length - 1; i >= 0; i--) {
      var wave = state.shockwaves[i];
      wave.life -= dt;
      var t = 1 - clamp(wave.life / wave.startLife, 0, 1);
      wave.mesh.scale.setScalar(0.15 + wave.targetRadius * t);
      wave.mesh.material.opacity = wave.startOpacity * (1 - t);
      if (wave.life <= 0) {
        removeShockwave(i);
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
      if (flash.life <= 0) {
        effectRoot.remove(flash.light);
        state.lightFlashes.splice(l, 1);
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
    removeObject3D(particle.mesh);
    state.particles.splice(index, 1);
  }

  function removeShockwave(index) {
    var wave = state.shockwaves[index];
    if (!wave) return;
    removeObject3D(wave.mesh);
    state.shockwaves.splice(index, 1);
  }

  function removeDecal(index) {
    var decal = state.decals[index];
    if (!decal) return;
    removeObject3D(decal.mesh);
    state.decals.splice(index, 1);
  }

  function removeSmokePuff(index) {
    var puff = state.smokePuffs[index];
    if (!puff) return;
    removeObject3D(puff.mesh);
    state.smokePuffs.splice(index, 1);
  }

  function removeDebris(index) {
    var piece = state.debris[index];
    if (!piece) return;
    removeObject3D(piece.mesh);
    state.debris.splice(index, 1);
  }

  function trimEffects(array, maxCount, remover) {
    while (array.length > maxCount) remover(0);
  }

  function updateWaveProgress(dt) {
    if (state.spawnLeft > 0 || state.enemies.length > 0) return;
    if (state.nextWaveTimer <= 0) {
      state.nextWaveTimer = 1.8;
      return;
    }
    state.nextWaveTimer -= dt;
    if (state.nextWaveTimer <= 0) {
      startWave(state.wave + 1);
    }
  }

  function endGame() {
    state.mode = "gameover";
    pointerDown = false;
    resetTouchControls();
    setPanel(gameOverPanel, true);
    gameOverStats.textContent = "Wave " + state.wave + " - Score " + state.score + " - Zombies " + state.kills;
    updateHud();
  }

  function spawnParticle(x, y, z, vx, vy, vz, life, size, mat) {
    var mesh = addSharedBox(effectRoot, 1, 1, 1, mat, x, y, z);
    mesh.scale.setScalar(size);
    state.particles.push({
      x: x,
      y: y,
      z: z,
      vx: vx,
      vy: vy,
      vz: vz,
      life: life,
      startLife: life,
      startScale: size,
      mesh: mesh,
    });
    trimEffects(state.particles, MAX_PARTICLES, removeParticle);
  }

  function createAmbientDust() {
    for (var i = 0; i < 42; i++) {
      var mat = mats.dust.clone();
      mat.opacity = rand(0.06, 0.16);
      var mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat);
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

  function addHitSpark(x, z) {
    for (var i = 0; i < 8; i++) {
      var angle = rand(0, Math.PI * 2);
      var speed = rand(1.8, 5.4);
      spawnParticle(x, rand(0.75, 1.45), z, Math.cos(angle) * speed, rand(0.8, 3.4), Math.sin(angle) * speed, 0.2, rand(0.05, 0.13), i % 2 === 0 ? mats.flash : mats.rifleTracer);
    }
  }

  function addGoldBurst(x, z, score) {
    var count = score >= 250 ? 14 : 9;
    for (var i = 0; i < count; i++) {
      var angle = rand(0, Math.PI * 2);
      var speed = rand(1.2, 4.4);
      spawnParticle(x, rand(0.7, 1.8), z, Math.cos(angle) * speed, rand(1.2, 4.8), Math.sin(angle) * speed, rand(0.25, 0.52), rand(0.08, 0.18), mats.gold);
    }
  }

  function addShockwave(x, z, targetRadius, life, color) {
    var mat = mats.shockwave.clone();
    mat.color.setHex(color || 0xffe0a0);
    var mesh = new THREE.Mesh(getSharedGeometry("shockwave-ring", function () {
      return new THREE.RingGeometry(0.76, 1, 36);
    }), mat);
    mesh.userData.disposeGeometry = false;
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0.11, z);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.renderOrder = 2;
    mesh.userData.disposeMaterial = true;
    effectRoot.add(mesh);
    state.shockwaves.push({
      mesh: mesh,
      life: life,
      startLife: life,
      targetRadius: targetRadius,
      startOpacity: mat.opacity,
    });
    trimEffects(state.shockwaves, MAX_SHOCKWAVES, removeShockwave);
  }

  function addScorchMark(x, z, radius) {
    var mat = mats.scorch.clone();
    mat.opacity = rand(0.16, 0.28);
    var mesh = new THREE.Mesh(getSharedGeometry("scorch-circle", function () {
      return new THREE.CircleGeometry(1, 14);
    }), mat);
    mesh.userData.disposeGeometry = false;
    mesh.rotation.x = -Math.PI / 2;
    mesh.rotation.z = rand(0, Math.PI * 2);
    mesh.position.set(x, 0.065, z);
    mesh.scale.set(radius * rand(0.75, 1.2), radius * rand(0.55, 0.95), 1);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.renderOrder = -3;
    mesh.userData.disposeMaterial = true;
    effectRoot.add(mesh);
    state.decals.push({
      mesh: mesh,
      life: 7.5,
      startLife: 7.5,
      startOpacity: mat.opacity,
    });
    trimEffects(state.decals, MAX_DECALS, removeDecal);
  }

  function addLightFlash(x, y, z, color, intensity, distance, life) {
    var light = new THREE.PointLight(color, intensity, distance, 2);
    light.position.set(x, y, z);
    effectRoot.add(light);
    state.lightFlashes.push({
      light: light,
      life: life,
      startLife: life,
      startIntensity: intensity,
    });
  }

  function addSmokePuff(x, y, z, scale, life) {
    var mat = mats.smoke.clone();
    mat.opacity = rand(0.16, 0.32);
    var mesh = new THREE.Mesh(getSharedBoxGeometry(1, 1, 1), mat);
    mesh.userData.disposeGeometry = false;
    mesh.position.set(x, y, z);
    mesh.scale.setScalar(scale);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.renderOrder = 1;
    mesh.userData.disposeMaterial = true;
    effectRoot.add(mesh);
    state.smokePuffs.push({
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
      startOpacity: mat.opacity,
      mesh: mesh,
    });
    trimEffects(state.smokePuffs, MAX_SMOKE_PUFFS, removeSmokePuff);
  }

  function buyOrSelectWeapon(id) {
    var weapon = WEAPONS[id];
    if (!weapon || state.mode !== "playing") return false;
    if (!state.ownedWeapons[id]) {
      if (state.score < weapon.cost) return false;
      state.score -= weapon.cost;
      state.ownedWeapons[id] = true;
      spawnPurchaseBurst();
    }
    state.weapon = id;
    if (state.player) state.player.weapon = id;
    if ((state.ammo[id] || 0) <= 0) startReload(id);
    setWeaponVisual(id);
    updateHud();
    return true;
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
    setWeaponMeshes(state.player.group, id);
  }

  function setWeaponMeshes(group, id) {
    var meshMap = group.userData.weaponMeshes;
    if (!meshMap) return;
    Object.keys(meshMap).forEach(function (key) {
      var visible = key === id;
      meshMap[key].forEach(function (mesh) {
        mesh.visible = visible;
      });
    });
  }

  function startGame() {
    lockLandscapeIfPossible();
    resetRun("playing");
    setPanel(menu, false);
    setPanel(gameOverPanel, false);
    updateModeClass();
  }

  function bindInput() {
    startBtn.addEventListener("click", startGame);
    restartBtn.addEventListener("click", startGame);
    weaponButtons.forEach(function (button) {
      button.addEventListener("click", function () {
        buyOrSelectWeapon(button.getAttribute("data-weapon"));
      });
    });

    window.addEventListener("keydown", function (event) {
      keys[event.code] = true;
      if (event.code === "KeyF") toggleFullscreen();
      if (event.code === "KeyR" && state.mode !== "playing") startGame();
      if ((event.code === "Enter" || event.code === "Space") && state.mode !== "playing") startGame();
      if (event.code === "Digit1") buyOrSelectWeapon("revolver");
      if (event.code === "Digit2") buyOrSelectWeapon("rifle");
      if (event.code === "Digit3") buyOrSelectWeapon("launcher");
    });
    window.addEventListener("keyup", function (event) {
      keys[event.code] = false;
    });

    bindCanvasInput(renderer.domElement);
    window.addEventListener("pointerup", function () {
      pointerDown = false;
    });
    bindMobileControls();
    window.addEventListener("resize", resize);
  }

  function bindCanvasInput(canvas) {
    canvas.addEventListener("pointermove", handleCanvasPointerMove);
    canvas.addEventListener("pointerdown", handleCanvasPointerDown);
    canvas.addEventListener("contextmenu", handleCanvasContextMenu);
  }

  function handleCanvasPointerMove(event) {
    updatePointerFromClient(event.clientX, event.clientY);
  }

  function handleCanvasPointerDown(event) {
    if (event.button !== 0) return;
    updatePointerFromClient(event.clientX, event.clientY);
    pointerDown = true;
    if (state.mode === "menu") startGame();
  }

  function handleCanvasContextMenu(event) {
    event.preventDefault();
  }

  function bindMobileControls() {
    if (moveStick) {
      moveStick.addEventListener("pointerdown", function (event) {
        if (event.button !== 0 && event.pointerType !== "touch") return;
        event.preventDefault();
        event.stopPropagation();
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

  function updateTouchMove(clientX, clientY) {
    var max = moveStick ? moveStick.getBoundingClientRect().width * 0.34 : 42;
    var dx = clientX - touchMove.baseX;
    var dy = clientY - touchMove.baseY;
    var dist = Math.hypot(dx, dy);
    var limited = Math.min(max, dist);
    var nx = dist > 0.001 ? dx / dist : 0;
    var ny = dist > 0.001 ? dy / dist : 0;
    touchMove.x = (nx * limited) / max;
    touchMove.z = (ny * limited) / max;
    if (moveKnob) {
      moveKnob.style.transform = "translate(calc(-50% + " + (nx * limited).toFixed(1) + "px), calc(-50% + " + (ny * limited).toFixed(1) + "px))";
    }
  }

  function endTouchMove(event) {
    if (!touchMove.active || (event && event.pointerId !== touchMove.pointerId)) return;
    touchMove.active = false;
    touchMove.pointerId = null;
    touchMove.x = 0;
    touchMove.z = 0;
    if (moveKnob) moveKnob.style.transform = "translate(-50%, -50%)";
    if (moveStick) moveStick.classList.remove("is-active");
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
    touchFire.active = false;
    touchFire.pointerId = null;
    lastMobileAim.x = 0;
    lastMobileAim.z = -1;
    if (moveKnob) moveKnob.style.transform = "translate(-50%, -50%)";
    if (moveStick) moveStick.classList.remove("is-active");
    if (mobileFire) mobileFire.classList.remove("is-pressed");
    updateModeClass();
  }

  function updateModeClass() {
    root.classList.toggle("is-playing", state.mode === "playing");
  }

  function updatePointerFromClient(clientX, clientY) {
    var rect = renderer.domElement.getBoundingClientRect();
    pointerNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    pointerNdc.y = -(((clientY - rect.top) / rect.height) * 2 - 1);
    raycaster.setFromCamera(pointerNdc, camera);
    raycaster.ray.intersectPlane(groundPlane, pointerHit);
    state.pointerWorld.x = clamp(pointerHit.x, -ARENA_W / 2 - 4, ARENA_W / 2 + 4);
    state.pointerWorld.z = clamp(pointerHit.z, -ARENA_D / 2 - 4, ARENA_D / 2 + 4);
  }

  function updateHud() {
    var ratio = state.player ? clamp(state.player.hp / state.player.maxHp, 0, 1) : 1;
    hudHealth.style.transform = "scaleX(" + ratio.toFixed(3) + ")";
    hudWave.textContent = String(state.wave);
    hudScore.textContent = String(state.score);
    hudKills.textContent = String(state.kills);
    if (hudWeapon) hudWeapon.textContent = (WEAPONS[state.weapon] || WEAPONS.revolver).label;
    updateAmmoHud();
    weaponButtons.forEach(function (button) {
      var id = button.getAttribute("data-weapon");
      var weapon = WEAPONS[id];
      if (!weapon) return;
      var owned = !!state.ownedWeapons[id];
      button.textContent = owned ? weapon.shortLabel : weapon.shortLabel + " " + weapon.cost;
      button.disabled = state.mode !== "playing" || (!owned && state.score < weapon.cost);
      button.classList.toggle("is-active", id === state.weapon);
      button.classList.toggle("is-owned", owned);
    });
  }

  function updateAmmoHud() {
    if (!ammoHud || !ammoCurrent || !ammoMax) return;
    var weapon = WEAPONS[state.weapon] || WEAPONS.revolver;
    var ammo = getAmmoState(weapon.id);
    ammoHud.classList.toggle("is-reloading", ammo.reloading);
    ammoHud.style.setProperty("--reload-progress", ammo.reloadProgress.toFixed(3));
    if (ammoStatus) {
      ammoStatus.textContent = ammo.reloading
        ? "Reload " + ammo.reloadRemaining.toFixed(1) + "s"
        : ammo.total <= 0
          ? "Empty"
          : "LEFT " + ammo.total;
    }
    ammoCurrent.textContent = String(ammo.current);
    ammoMax.textContent = String(ammo.magazine);
    ammoHud.setAttribute("aria-label", weapon.label + " ammo " + ammo.current + " of " + ammo.magazine + ", total " + ammo.total + ", reserve " + ammo.reserve);
    syncAmmoRack(weapon, ammo);
    if (ammoReloadFill) ammoReloadFill.style.transform = ammo.reloading ? "scaleX(" + ammo.reloadProgress.toFixed(3) + ")" : "scaleX(0)";
    if (ammoWeaponIcon && currentAmmoIcon !== weapon.id) {
      ammoWeaponIcon.innerHTML = WEAPON_ICONS[weapon.id] || WEAPON_ICONS.revolver;
      currentAmmoIcon = weapon.id;
    }
  }

  function render() {
    if (renderDiagnostics.contextLost) return;
    var p = state.player;
    var follow = clampCameraTarget(p ? p.x : 0, p ? p.z : 0);
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
    try {
      renderer.render(scene, camera);
      checkRendererHealth();
    } catch (err) {
      renderDiagnostics.lastReason = "render-error";
      recoverRenderer("render-error");
    }
  }

  function clampCameraTarget(x, z) {
    var minTargetX = cameraMapBounds.minX - cameraGroundBounds.minX;
    var maxTargetX = cameraMapBounds.maxX - cameraGroundBounds.maxX;
    var minTargetZ = cameraMapBounds.minZ - cameraGroundBounds.minZ;
    var maxTargetZ = cameraMapBounds.maxZ - cameraGroundBounds.maxZ;
    return {
      x: minTargetX > maxTargetX ? 0 : clamp(x, minTargetX, maxTargetX),
      z: minTargetZ > maxTargetZ ? 0 : clamp(z, minTargetZ, maxTargetZ),
    };
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

    var pixels = new Uint8Array(4 * 4 * 4);
    try {
      gl.readPixels(
        Math.max(0, Math.floor(renderer.domElement.width / 2) - 2),
        Math.max(0, Math.floor(renderer.domElement.height / 2) - 2),
        4,
        4,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        pixels
      );
    } catch (err) {
      recoverRenderer("readPixels");
      return;
    }

    var total = 0;
    var low = 255;
    var high = 0;
    for (var i = 0; i < pixels.length; i += 4) {
      var brightness = (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3;
      total += brightness;
      low = Math.min(low, brightness);
      high = Math.max(high, brightness);
    }
    var avg = total / (pixels.length / 4);
    if (avg > 247 && high - low < 9 && state.mode === "playing") {
      renderDiagnostics.whiteFrames += 1;
      if (renderDiagnostics.whiteFrames >= 2) recoverRenderer("white-canvas");
    } else {
      renderDiagnostics.whiteFrames = 0;
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

  function animateWeaponMeshes(group, kick, intensity, armPose) {
    var rig = group.userData.weaponRig;
    if (!rig) return;
    var weaponId = state.weapon || "revolver";
    var bob = Math.sin(state.time * 9) * 0.012 * intensity;
    var recoil = weaponId === "launcher" ? 0.3 : weaponId === "rifle" ? 0.22 : 0.16;
    animateMesh(rig, {
      x: 0.03 * intensity + kick * 0.035,
      y: bob + kick * 0.035,
      z: -kick * recoil,
      rx: (armPose && armPose.rx ? armPose.rx : 0) - kick * (weaponId === "launcher" ? 0.22 : 0.14),
      ry: armPose && armPose.ry ? armPose.ry : 0,
      rz: armPose && armPose.rz ? armPose.rz : 0,
    });
  }

  function createDeathDebris(enemy) {
    var origin = new THREE.Vector3(enemy.x, 0.8, enemy.z);
    var pieces = [];
    enemy.group.traverse(function (child) {
      if (!child.isMesh || child.userData.noDebris) return;
      if (pieces.length >= 13) return;
      pieces.push(child);
    });

    pieces.forEach(function (source, index) {
      var worldPos = new THREE.Vector3();
      var worldQuat = new THREE.Quaternion();
      source.getWorldPosition(worldPos);
      source.getWorldQuaternion(worldQuat);
      var mat = source.material.clone();
      mat.transparent = true;
      mat.opacity = 1;
      var mesh = new THREE.Mesh(source.geometry.clone(), mat);
      mesh.userData.disposeMaterial = true;
      mesh.position.copy(worldPos);
      mesh.quaternion.copy(worldQuat);
      mesh.scale.copy(source.scale);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      effectRoot.add(mesh);

      var awayX = worldPos.x - origin.x;
      var awayZ = worldPos.z - origin.z;
      var awayLen = Math.hypot(awayX, awayZ);
      if (awayLen < 0.001) {
        var angle = index * 2.399963 + rand(-0.3, 0.3);
        awayX = Math.cos(angle);
        awayZ = Math.sin(angle);
        awayLen = 1;
      }
      var force = rand(2.2, 6.8) * (enemy.type === "brute" ? 0.8 : 1);
      state.debris.push({
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
      trimEffects(state.debris, MAX_DEBRIS, removeDebris);
    });
  }

  function addBox(parent, w, h, d, mat, x, y, z) {
    var mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x || 0, y || 0, z || 0);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
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
    mesh.position.y = 0.035;
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

  function addObstacle(x, z, w, d, pad, type) {
    obstacleRects.push({
      x: x,
      z: z,
      halfW: w / 2,
      halfD: d / 2,
      pad: pad || 0,
    });
    registerMapFootprint(type || "obstacle", x, z, w, d, pad || 0, true);
  }

  function resolveMoverPosition(mover, radius, boundsExtra) {
    var extra = boundsExtra || 0;
    mover.x = clamp(mover.x, -ARENA_W / 2 - extra + radius, ARENA_W / 2 + extra - radius);
    mover.z = clamp(mover.z, -ARENA_D / 2 - extra + radius, ARENA_D / 2 + extra - radius);
    for (var i = 0; i < obstacleRects.length; i++) {
      pushCircleOutOfRect(mover, obstacleRects[i], radius);
    }
    mover.x = clamp(mover.x, -ARENA_W / 2 - extra + radius, ARENA_W / 2 + extra - radius);
    mover.z = clamp(mover.z, -ARENA_D / 2 - extra + radius, ARENA_D / 2 + extra - radius);
  }

  function pushCircleOutOfRect(circle, rect, radius) {
    var minDist = radius + rect.pad;
    var closestX = clamp(circle.x, rect.x - rect.halfW, rect.x + rect.halfW);
    var closestZ = clamp(circle.z, rect.z - rect.halfD, rect.z + rect.halfD);
    var dx = circle.x - closestX;
    var dz = circle.z - closestZ;
    var distSq = dx * dx + dz * dz;
    if (distSq >= minDist * minDist) return;

    if (distSq > 0.000001) {
      var dist = Math.sqrt(distSq);
      var push = minDist - dist;
      circle.x += (dx / dist) * push;
      circle.z += (dz / dist) * push;
      return;
    }

    var left = Math.abs(circle.x - (rect.x - rect.halfW));
    var right = Math.abs(rect.x + rect.halfW - circle.x);
    var top = Math.abs(circle.z - (rect.z - rect.halfD));
    var bottom = Math.abs(rect.z + rect.halfD - circle.z);
    var minEdge = Math.min(left, right, top, bottom);
    if (minEdge === left) circle.x = rect.x - rect.halfW - minDist;
    else if (minEdge === right) circle.x = rect.x + rect.halfW + minDist;
    else if (minEdge === top) circle.z = rect.z - rect.halfD - minDist;
    else circle.z = rect.z + rect.halfD + minDist;
  }

  function pointHitsObstacle(x, z, radius) {
    for (var i = 0; i < obstacleRects.length; i++) {
      if (circleIntersectsRect(x, z, radius, obstacleRects[i])) return true;
    }
    return false;
  }

  function circleIntersectsRect(x, z, radius, rect) {
    var minDist = radius + rect.pad;
    var closestX = clamp(x, rect.x - rect.halfW, rect.x + rect.halfW);
    var closestZ = clamp(z, rect.z - rect.halfD, rect.z + rect.halfD);
    var dx = x - closestX;
    var dz = z - closestZ;
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
    var best = 3;
    for (var i = 0; i < obstacleRects.length; i++) {
      var rect = obstacleRects[i];
      var closestX = clamp(x, rect.x - rect.halfW, rect.x + rect.halfW);
      var closestZ = clamp(z, rect.z - rect.halfD, rect.z + rect.halfD);
      var dx = x - closestX;
      var dz = z - closestZ;
      var clearance = Math.sqrt(dx * dx + dz * dz) - (radius + rect.pad);
      best = Math.min(best, clearance);
    }
    return clamp(best, -2, 3);
  }

  function findBlockingObstacle(x1, z1, x2, z2, radius, ignoreRect) {
    var best = null;
    var bestT = Infinity;
    for (var i = 0; i < obstacleRects.length; i++) {
      var rect = obstacleRects[i];
      if (rect === ignoreRect) continue;
      var t = segmentExpandedRectEntry(x1, z1, x2, z2, rect, radius);
      if (t !== null && t > 0.015 && t < bestT) {
        bestT = t;
        best = { rect: rect, t: t };
      }
    }
    return best;
  }

  function segmentExpandedRectEntry(x1, z1, x2, z2, rect, radius) {
    var minX = rect.x - rect.halfW - rect.pad - radius;
    var maxX = rect.x + rect.halfW + rect.pad + radius;
    var minZ = rect.z - rect.halfD - rect.pad - radius;
    var maxZ = rect.z + rect.halfD + rect.pad + radius;
    var dx = x2 - x1;
    var dz = z2 - z1;
    var tMin = 0;
    var tMax = 1;

    if (Math.abs(dx) < 0.000001) {
      if (x1 < minX || x1 > maxX) return null;
    } else {
      var tx1 = (minX - x1) / dx;
      var tx2 = (maxX - x1) / dx;
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
      if (z1 < minZ || z1 > maxZ) return null;
    } else {
      var tz1 = (minZ - z1) / dz;
      var tz2 = (maxZ - z1) / dz;
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

  function createMainTownCenter() {
    var maxTownX = Math.min(ARENA_W / 2 - CITY_W / 2 - 12, MAP_OUTSKIRT_X * 0.48);
    var townZRange = Math.min(ARENA_D / 2 - CITY_D / 2 - 12, MAP_OUTSKIRT_Z * 0.42);
    return {
      x: mapRand(0.8, maxTownX),
      z: mapRand(-townZRange, townZRange),
    };
  }

  function createMainTownLayout() {
    return {
      mirrorX: mapRng() < 0.5,
      mirrorZ: mapRng() < 0.5,
      variant: Math.floor(mapRng() * 4),
    };
  }

  function createPlayerStart() {
    var roll = mapRng();
    if (roll < 0.32) return makePlayerStart(townLocalX(mapRand(-4.8, 4.8)), townLocalZ(mapRand(-3.8, 4.8)), "town");
    if (roll < 0.62) return createSettledOutskirtStart();
    if (roll < 0.84) return createOpenDesertStart();
    return createWastelandStart();
  }

  function createSettledOutskirtStart() {
    var side = Math.floor(mapRng() * 3);
    if (side === 0) {
      return makePlayerStart(
        clamp(MAIN_TOWN_CENTER.x + mapRand(-16, 18), -CITY_W / 2 - 2.6 + 7, ARENA_W / 2 - 7),
        clamp(MAIN_TOWN_CENTER.z - CITY_D / 2 - mapRand(5.5, 13.5), -ARENA_D / 2 + 7, ARENA_D / 2 - 7),
        "settled-outskirts"
      );
    }
    if (side === 1) {
      return makePlayerStart(
        clamp(MAIN_TOWN_CENTER.x + mapRand(-16, 18), -CITY_W / 2 - 2.6 + 7, ARENA_W / 2 - 7),
        clamp(MAIN_TOWN_CENTER.z + CITY_D / 2 + mapRand(5.5, 13.5), -ARENA_D / 2 + 7, ARENA_D / 2 - 7),
        "settled-outskirts"
      );
    }
    return makePlayerStart(
      clamp(MAIN_TOWN_CENTER.x + CITY_W / 2 + mapRand(5.5, 15.5), -CITY_W / 2 - 2.6 + 7, ARENA_W / 2 - 7),
      clamp(MAIN_TOWN_CENTER.z + mapRand(-18, 18), -ARENA_D / 2 + 7, ARENA_D / 2 - 7),
      "settled-outskirts"
    );
  }

  function createOpenDesertStart() {
    for (var attempt = 0; attempt < 36; attempt++) {
      var x = mapRand(-CITY_W / 2 - 2.6 + 7, ARENA_W / 2 - 7);
      var z = mapRand(-ARENA_D / 2 + 7, ARENA_D / 2 - 7);
      if (Math.abs(x - MAIN_TOWN_CENTER.x) < CITY_W / 2 + 5 && Math.abs(z - MAIN_TOWN_CENTER.z) < CITY_D / 2 + 5) continue;
      return makePlayerStart(x, z, "open-desert");
    }
    return createSettledOutskirtStart();
  }

  function createWastelandStart() {
    return makePlayerStart(
      mapRand(-ARENA_W / 2 + 7, -CITY_W / 2 - 6.5),
      mapRand(-ARENA_D / 2 + 7, ARENA_D / 2 - 7),
      "wasteland"
    );
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
      wave: state.wave,
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
        mainTown: {
          x: Number(MAIN_TOWN_CENTER.x.toFixed(2)),
          z: Number(MAIN_TOWN_CENTER.z.toFixed(2)),
          mirrorX: MAIN_TOWN_LAYOUT.mirrorX,
          mirrorZ: MAIN_TOWN_LAYOUT.mirrorZ,
          variant: MAIN_TOWN_LAYOUT.variant,
        },
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
      weapon: state.weapon,
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
            reloading: ammo.reloading,
            reloadRemaining: Number(ammo.reloadRemaining.toFixed(2)),
          };
          return acc;
        }, {}),
      },
      spawnLeft: state.spawnLeft,
      ammoCrates: state.ammoCrates.map(function (crate) {
        return {
          x: Number(crate.x.toFixed(2)),
          z: Number(crate.z.toFixed(2)),
        };
      }),
      enemyCount: state.enemies.length,
      player: p
        ? {
            x: Number(p.x.toFixed(2)),
            z: Number(p.z.toFixed(2)),
            hp: Number(p.hp.toFixed(1)),
            cooldown: Number(p.cooldown.toFixed(2)),
            aimAngle: Number(p.aimAngle.toFixed(2)),
          }
        : null,
      pointer: {
        x: Number(state.pointerWorld.x.toFixed(2)),
        z: Number(state.pointerWorld.z.toFixed(2)),
      },
      mobileControls: {
        moveActive: touchMove.active,
        moveX: Number(touchMove.x.toFixed(2)),
        moveZ: Number(touchMove.z.toFixed(2)),
        fireActive: touchFire.active,
      },
      bullets: state.bullets.length,
      effects: {
        particles: state.particles.length,
        smoke: state.smokePuffs.length,
        shockwaves: state.shockwaves.length,
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
          life: Number(b.life.toFixed(2)),
        };
      }),
      enemies: state.enemies.slice(0, 12).map(function (e) {
        return {
          type: e.type,
          x: Number(e.x.toFixed(2)),
          z: Number(e.z.toFixed(2)),
          hp: Number(e.hp.toFixed(1)),
          spawnSide: e.spawnSide === undefined ? null : e.spawnSide,
          outsideView: pointOutsideVisibleGround(e.x, e.z, e.radius + 0.2, visibleGround),
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
    clearEnemies: function () {
      for (var i = state.enemies.length - 1; i >= 0; i--) {
        removeObject3D(state.enemies[i].group);
      }
      state.enemies = [];
      state.spawnLeft = 0;
      state.spawnTimer = 0;
      updateHud();
      return true;
    },
    spawnZombieNow: function () {
      spawnZombie();
      var enemy = state.enemies[state.enemies.length - 1];
      var visible = getCurrentVisibleGroundRect();
      return {
        type: enemy.type,
        x: Number(enemy.x.toFixed(2)),
        z: Number(enemy.z.toFixed(2)),
        radius: Number(enemy.radius.toFixed(2)),
        spawnSide: enemy.spawnSide,
        outsideView: pointOutsideVisibleGround(enemy.x, enemy.z, enemy.radius + 0.2, visible),
        insideEnemyBounds: pointInsideEnemyBounds(enemy.x, enemy.z, enemy.radius),
        blocked: pointHitsObstacle(enemy.x, enemy.z, enemy.radius + 0.16),
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
    spawnAmmoCrateAt: function (x, z) {
      var crate = spawnAmmoCrateAt(Number(x) || 0, Number(z) || 0);
      return { x: Number(crate.x.toFixed(2)), z: Number(crate.z.toFixed(2)) };
    },
    setAmmo: function (id, current, reserve) {
      var weapon = WEAPONS[id] || WEAPONS.revolver;
      state.ammo[weapon.id] = clamp(Number(current) || 0, 0, weapon.magazine);
      state.ammoReserve[weapon.id] = Math.max(0, Number(reserve) || 0);
      state.reloadTimers[weapon.id] = 0;
      updateHud();
      return getAmmoState(weapon.id);
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
    validateMapLayout: function () {
      return validateMapLayout();
    },
    spawnZombieAt: function (type, x, z) {
      var id = { walker: true, runner: true, brute: true, spitter: true }[type] ? type : "walker";
      var zombie = makeZombie(id);
      zombie.x = Number(x) || 0;
      zombie.z = Number(z) || 0;
      resolveMoverPosition(zombie, zombie.radius, ENEMY_BOUNDS_EXTRA);
      zombie.group.position.set(zombie.x, 0, zombie.z);
      state.enemies.push(zombie);
      dynamicRoot.add(zombie.group);
      return { type: zombie.type, x: Number(zombie.x.toFixed(2)), z: Number(zombie.z.toFixed(2)) };
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
