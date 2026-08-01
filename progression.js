(function (global) {
  "use strict";

  var progressionI18n = global.DustAndDeadI18n || null;
  function localizeCatalogField(domain, id, field, fallback, params) {
    if (!progressionI18n) return String(fallback == null ? "" : fallback);
    return progressionI18n.t(
      domain + "." + String(id || "") + "." + String(field || ""),
      params || null,
      fallback
    );
  }

  var VERSION = 1;
  var STORAGE_KEY = "dustAndDeadMetaProgression.v1";
  var MAX_COUNTER = Number.MAX_SAFE_INTEGER || 9007199254740991;
  var SETTLED_MATCH_LIMIT = 32;
  var MASTERY_RECEIPT_LIMIT = 64;
  var PLACE_MULTIPLIERS = [150, 120, 100, 90];
  var LEGACY_ZOMBIE_DUST_CENTS_PER_KILL = 10;
  var ZOMBIE_DUST_CENTS_PER_KILL = 15;
  var BOSS_DUST_CENTS = 5000;
  var WAVE_DUST_CENTS_PER_NUMBER = 100;
  var ZOMBIE_REWARD_UNITS_PER_CENT = 100;
  var CARD_UNLOCK_COST_CENTS = 15000;
  // The single paid cosmetic is priced as an end-of-career trophy: ten times the
  // most expensive class, so it cannot compete with gameplay unlocks for Dust.
  var COSMETIC_UNLOCK_COST_CENTS = 1000000;
  var MARKED_CARD_REQUIRED_UNLOCKS = 10;
  var MARKED_CARD_COUNT = 5;
  var MARKED_CARD_DRAFT_WEIGHT = 2;
  var DEFAULT_COWBOY_COSMETIC_ID = "trailwornDrifter";
  var DEFAULT_HAT_COSMETIC_ID = "weatheredCattleman";
  var BUILD_PROFILE = global.DustAndDeadBuildProfile &&
    typeof global.DustAndDeadBuildProfile === "object"
      ? global.DustAndDeadBuildProfile
      : {};
  var TEST_ALL_ACCESS = BUILD_PROFILE.testAllAccess === true &&
    BUILD_PROFILE.channel === "test-all";
  var testRuntimeCosmetics = null;

  // Contract Marks are milestones, not a spendable third currency. Cosmetics
  // remain unlocked once their requirement is met and only the equipped pair
  // is persisted.
  var COWBOY_COSMETIC_SPECS = [
    {
      id: "trailwornDrifter",
      label: "Trailworn Drifter",
      description: "Sun-faded leather and road-worn denim from the first long ride.",
      requirement: { type: "starter", label: "Starter outfit" },
      swatches: ["#934c22", "#e2b66d", "#2d5c84"],
    },
    {
      id: "ashenProspector",
      label: "Ashen Prospector",
      description: "Soot-dark canvas, copper trim and the stubborn look of a deep-shaft survivor.",
      requirement: { type: "contractMarks", count: 6, label: "Complete 6 contracts" },
      swatches: ["#4b4037", "#c27b3c", "#695b45"],
    },
    {
      id: "mesaRanger",
      label: "Mesa Ranger",
      description: "Sage cloth and pale leather made for watching a very long horizon.",
      requirement: { type: "contractMarks", count: 15, label: "Complete 15 contracts" },
      swatches: ["#64724b", "#d4b878", "#40556a"],
    },
    {
      id: "crimsonLawman",
      label: "Crimson Lawman",
      description: "A black duster, a red trail scarf and no patience for frontier disorder.",
      requirement: { type: "contractMarks", count: 30, label: "Complete 30 contracts" },
      swatches: ["#202329", "#9f2f2b", "#594036"],
    },
    {
      id: "moonlitOutlaw",
      label: "Moonlit Outlaw",
      description: "Midnight blue, silver fittings and a coat that disappears after sundown.",
      requirement: { type: "contractMarks", count: 45, label: "Complete 45 contracts" },
      swatches: ["#18283e", "#94a8b8", "#34313f"],
    },
    {
      id: "gildedLegend",
      label: "Gilded Legend",
      description: "Ivory cloth and frontier gold reserved for a name every contract board knows.",
      requirement: { type: "contractMarks", count: 60, label: "Complete 60 contracts" },
      swatches: ["#e5d2a1", "#c99538", "#7b2d25"],
    },
    {
      id: "baronsBlackGold",
      label: "Baron's Black Gold",
      description: "The oil king's tar-soaked coat and brass fittings, stripped from him at the derrick.",
      requirement: {
        type: "contract",
        id: "boss.oilBaron.1",
        label: "Defeat the Oil Baron",
      },
      swatches: ["#1a1712", "#c8992f", "#3d3527"],
    },
    {
      id: "livingBarrow",
      label: "Living Barrow",
      description: "A torn crimson cloak, bone pauldrons and a dim heart that still keeps the horde's beat.",
      requirement: {
        type: "challenge",
        id: "boss.hordeheart.heartbeat",
        label: "Challenge: One Heartbeat",
      },
      swatches: ["#6d1f24", "#c9b8a0", "#8e2f33"],
    },
    {
      id: "lastSurveyor",
      label: "The Last Surveyor",
      description: "A sand-colored duster scarred like a map of every acre the Land-Eater never got.",
      requirement: {
        type: "challenge",
        id: "boss.landEater.untouched",
        label: "Challenge: Not One Acre",
      },
      swatches: ["#c8a86b", "#7a5c3a", "#3f4c54"],
    },
    {
      id: "shatteredReflection",
      label: "Shattered Reflection",
      description: "A black-and-white suit split down the middle, tailored by a mirror that lost.",
      requirement: {
        type: "challenge",
        id: "boss.doppelganger.shattered",
        label: "Challenge: Broken Mirror",
      },
      swatches: ["#17171a", "#e8e4da", "#8a8a92"],
    },
    {
      id: "lastParishVestments",
      label: "Last Parish Vestments",
      description: "A black cassock bound with gold ropes, worn by the one who never flinched at the bell.",
      requirement: {
        type: "challenge",
        id: "boss.bellRinger.silence",
        label: "Challenge: Perfect Silence",
      },
      swatches: ["#141216", "#c9a542", "#2e2a33"],
    },
    {
      id: "doomConductor",
      label: "Conductor of Doom",
      description: "A deep-blue conductor's tunic whose coattails trail like locomotive steam.",
      requirement: {
        type: "challenge",
        id: "boss.ghostTrain.lastStop",
        label: "Challenge: Terminal Station",
      },
      swatches: ["#2c3f63", "#9fb6d8", "#1b2438"],
    },
    {
      id: "vigilVestments",
      label: "Vestments of the Vigil",
      description: "Violet-and-white robes with open palms on the shoulders. No prayer went to waste.",
      requirement: {
        type: "challenge",
        id: "boss.slothArchbishop.noPrayers",
        label: "Challenge: No Empty Prayers",
      },
      swatches: ["#5b2d70", "#ece2c8", "#8a5aa0"],
    },
    {
      id: "smokingDuelist",
      label: "Smoking Duelist",
      description: "A duelist's suit with mismatched sleeves and two holsters that never stop smoking.",
      requirement: {
        type: "challenge",
        id: "class.gunslinger.exactlyTwelve",
        label: "Challenge: Exactly Twelve",
      },
      swatches: ["#3a3440", "#994c28", "#c0b6a4"],
    },
    {
      id: "stormPoncho",
      label: "Thunderhead Poncho",
      description: "A midnight-blue poncho hemmed with silver lightning that answers to the rifle.",
      requirement: {
        type: "challenge",
        id: "class.ranger.prairieStorm",
        label: "Challenge: Storm over the Prairie",
      },
      swatches: ["#1b2a4a", "#b8c4d4", "#2e3d5e"],
    },
    {
      id: "powderSaint",
      label: "Powder Saint",
      description: "A scorched cloak and a dynamite bandolier, blessed by one very long fuse.",
      requirement: {
        type: "challenge",
        id: "class.demolitionist.oneFuse",
        label: "Challenge: One Fuse",
      },
      swatches: ["#2b2320", "#b3512c", "#d8a13e"],
    },
    {
      id: "trailMaster",
      label: "Trail Master",
      description: "A hunter's cloak hung with sprung traps and a jaw-toothed hat band to match.",
      requirement: {
        type: "challenge",
        id: "class.ranger.trailMaster",
        label: "Challenge: Master of the Trail",
      },
      swatches: ["#4c5638", "#7a5230", "#9c9584"],
    },
    {
      id: "palePosse",
      label: "Pale Posse",
      description: "A ghost-grey duster pinned with three faintly glimmering marshal stars.",
      requirement: {
        type: "challenge",
        id: "class.marshal.palePosse",
        label: "Challenge: Pale Posse",
      },
      swatches: ["#9aa4ac", "#5f6a72", "#d9e2e8"],
    },
    {
      id: "oneGunCreed",
      label: "One-Gun Creed",
      description: "A faded trail suit with a single worn holster. One gun was always going to be enough.",
      requirement: {
        type: "challenge",
        id: "class.any.oneGun",
        label: "Challenge: One Gun, One Fate",
      },
      swatches: ["#6b5a44", "#32393f", "#a89a80"],
    },
    {
      id: "silverGhost",
      label: "Silver Ghost",
      description: "A polished silver-and-black suit with cold eyes. Everyone at the table knows what it means.",
      requirement: {
        type: "challenge",
        id: "rare.silverGhost",
        label: "Challenge: Silver Ghost",
      },
      swatches: ["#c7ccd4", "#1a1c22", "#7d8590"],
    },
    {
      id: "bullionTycoon",
      label: "Bullion Tycoon",
      description: "Every seam plated in frontier gold. Bought outright, and it shows.",
      requirement: {
        type: "dust",
        costCents: COSMETIC_UNLOCK_COST_CENTS,
        label: "Buy for 10000 Dust",
      },
      swatches: ["#f4d264", "#b8860f", "#412f0b"],
    },
  ];
  var HAT_COSMETIC_SPECS = [
    {
      id: "weatheredCattleman",
      label: "Weathered Cattleman",
      description: "The dependable brown hat that has seen every kind of bad weather.",
      requirement: { type: "starter", label: "Starter hat" },
      swatches: ["#6c351a", "#b06c32"],
    },
    {
      id: "gamblersBlack",
      label: "Gambler's Black",
      description: "A low black crown with a wine-red band for dangerous tables.",
      requirement: { type: "contractMarks", count: 4, label: "Complete 4 contracts" },
      swatches: ["#17171b", "#8e2d35"],
    },
    {
      id: "prairieWhite",
      label: "Prairie White",
      description: "Bright felt and a blue band, visible from the far side of the range.",
      requirement: { type: "contractMarks", count: 10, label: "Complete 10 contracts" },
      swatches: ["#e7d9b4", "#3f657c"],
    },
    {
      id: "marshalStar",
      label: "Marshal's Star",
      description: "A stern charcoal crown pinned with a small frontier star.",
      requirement: { type: "contractMarks", count: 22, label: "Complete 22 contracts" },
      swatches: ["#35363a", "#d1a342"],
    },
    {
      id: "undertaker",
      label: "Undertaker",
      description: "Tall, narrow and black as the last page in the burial ledger.",
      requirement: { type: "contractMarks", count: 38, label: "Complete 38 contracts" },
      swatches: ["#111216", "#6e536d"],
    },
    {
      id: "railmanCap",
      label: "Railman's Cap",
      description: "The Ghost Train's brass-marked cap, claimed at the end of the line.",
      requirement: {
        type: "contract",
        id: "boss.ghostTrain.1",
        label: "Defeat the Ghost Train",
      },
      swatches: ["#243346", "#b98538"],
    },
    {
      id: "barrowCrown",
      label: "Barrow Crown",
      description: "A crown of bone spurs pulled from the Hordeheart's burial mound.",
      requirement: {
        type: "contract",
        id: "boss.hordeheart.1",
        label: "Defeat the Hordeheart",
      },
      swatches: ["#c9b8a0", "#6d1f24"],
    },
    {
      id: "surveyorsCap",
      label: "Surveyor's Cap",
      description: "A sand-bleached cap with a map-scarred band, issued for land that no longer exists.",
      requirement: {
        type: "contract",
        id: "boss.landEater.1",
        label: "Defeat the Land-Eater",
      },
      swatches: ["#c8a86b", "#3f4c54"],
    },
    {
      id: "mirrorHalfMask",
      label: "Mirror Half-Mask",
      description: "A cracked mirror half-mask worn where a hat should be. The reflection blinked first.",
      requirement: {
        type: "contract",
        id: "boss.doppelganger.1",
        label: "Defeat the Doppelganger",
      },
      swatches: ["#d7dde6", "#17171a"],
    },
    {
      id: "brokenTopper",
      label: "Baron's Broken Topper",
      description: "A tall top hat cracked at the crown, ringed in brass and streaked with crude oil.",
      requirement: {
        type: "challenge",
        id: "boss.oilBaron.noDeals",
        label: "Challenge: No Deals",
      },
      swatches: ["#141210", "#c8992f"],
    },
    {
      id: "fuseHalo",
      label: "Fuse Halo",
      description: "A smoldering fuse bent into a halo. It never quite burns down.",
      requirement: {
        type: "challenge",
        id: "class.demolitionist.oneFuse",
        label: "Challenge: One Fuse",
      },
      swatches: ["#d8a13e", "#5c4632"],
    },
    {
      id: "bellCrown",
      label: "Bell Crown",
      description: "A burnished bell worn as a crown. Its silence proves the Bell Ringer fell.",
      requirement: {
        type: "contract",
        id: "boss.bellRinger.1",
        label: "Defeat the Bell Ringer",
      },
      swatches: ["#b7802f", "#f0c764"],
    },
    {
      id: "archbishopMitre",
      label: "Archbishop's Mitre",
      description: "The Sloth Archbishop's tall mitre, still heavy with the sermon nobody finished.",
      requirement: {
        type: "contract",
        id: "boss.slothArchbishop.1",
        label: "Defeat the Sloth Archbishop",
      },
      swatches: ["#57276a", "#e6d6a4"],
    },
  ];
  var COWBOY_COSMETIC_IDS = COWBOY_COSMETIC_SPECS.map(function (spec) { return spec.id; });
  var HAT_COSMETIC_IDS = HAT_COSMETIC_SPECS.map(function (spec) { return spec.id; });
  var COWBOY_COSMETICS_BY_ID = COWBOY_COSMETIC_SPECS.reduce(function (result, spec) {
    result[spec.id] = spec;
    return result;
  }, Object.create(null));
  var HAT_COSMETICS_BY_ID = HAT_COSMETIC_SPECS.reduce(function (result, spec) {
    result[spec.id] = spec;
    return result;
  }, Object.create(null));
  var ALL_COSMETIC_IDS = COWBOY_COSMETIC_IDS.concat(HAT_COSMETIC_IDS);
  var PURCHASABLE_COSMETIC_IDS = COWBOY_COSMETIC_SPECS.concat(HAT_COSMETIC_SPECS)
    .filter(function (spec) {
      return spec.requirement && spec.requirement.type === "dust";
    })
    .map(function (spec) { return spec.id; });
  function getCosmeticCostCents(spec) {
    if (!spec || !spec.requirement || spec.requirement.type !== "dust") return 0;
    return Math.max(0, Math.floor(Number(spec.requirement.costCents) || 0));
  }

  // Challenges are one-shot skill feats recorded by the game runtime, unlike
  // contracts they are never re-derived from counters and never revoked.
  var CHALLENGE_SPECS = [
    {
      id: "boss.hordeheart.heartbeat",
      group: "bosses",
      bossKind: "hordeheart",
      title: "Одним сердцебиением",
      description: "Уничтожьте четыре финальных фрагмента Сердца Орды за 25 секунд после гибели первого.",
      target: 4,
    },
    {
      id: "boss.landEater.untouched",
      group: "bosses",
      bossKind: "landEater",
      title: "Ни пяди земли",
      description: "Победите Пожирателя Земли, не получив урона за весь бой.",
      target: 1,
    },
    {
      id: "boss.doppelganger.shattered",
      group: "bosses",
      bossKind: "doppelganger",
      title: "Разбитое отражение",
      description: "Дайте разведчику превратиться в Двойника — и победите его.",
      target: 1,
    },
    {
      id: "boss.bellRinger.silence",
      group: "bosses",
      bossKind: "bellRinger",
      title: "Идеальная тишина",
      description: "Переживите каждый звон Звонаря правильно: ни шага, ни выстрела, ни перезарядки под ударом колокола.",
      target: 1,
    },
    {
      id: "boss.ghostTrain.lastStop",
      group: "bosses",
      bossKind: "ghostTrain",
      title: "Конечная станция",
      description: "Разорвите все сцепки Призрачного поезда и не попадите ни под один взрыв вагона.",
      target: 1,
    },
    {
      id: "boss.oilBaron.noDeals",
      group: "bosses",
      bossKind: "oilBaron",
      title: "Никаких сделок",
      description: "Не берите золото Барона, избегите всего звездопада и победите его.",
      target: 1,
    },
    {
      id: "boss.slothArchbishop.noPrayers",
      group: "bosses",
      bossKind: "slothArchbishop",
      title: "Ни одной пустой молитвы",
      description: "Победите Архиепископа так, чтобы ладони не заблокировали ни один ваш выстрел.",
      target: 1,
    },
    {
      id: "class.gunslinger.exactlyTwelve",
      group: "classes",
      classId: "gunslinger",
      title: "Ровно двенадцать",
      description: "Совершите 12 убийств 12 последовательными выстрелами из револьвера, не промахнувшись.",
      target: 12,
    },
    {
      id: "class.ranger.prairieStorm",
      group: "classes",
      classId: "ranger",
      title: "Гроза над прерией",
      description: "Поразите винтовочной молнией 12 разных врагов за одну волну.",
      target: 12,
    },
    {
      id: "class.demolitionist.oneFuse",
      group: "classes",
      classId: "demolitionist",
      title: "Один фитиль",
      description: "Убейте 15 врагов одной цепной детонацией.",
      target: 15,
    },
    {
      id: "class.ranger.trailMaster",
      group: "classes",
      classId: "ranger",
      title: "Хозяин тропы",
      description: "Уничтожьте 25 врагов ловушками, не сделав ни одного выстрела после срабатывания первой.",
      target: 25,
    },
    {
      id: "class.marshal.palePosse",
      group: "classes",
      classId: "marshal",
      title: "Бледный отряд",
      description: "Держите трёх Бледных помощников одновременно в момент победы над боссом.",
      target: 3,
    },
    {
      id: "class.any.oneGun",
      group: "classes",
      title: "Один ствол — одна судьба",
      description: "Дойдите до 15-й волны, используя только стартовое оружие выбранного класса.",
      target: 15,
    },
    {
      id: "rare.silverGhost",
      group: "rare",
      title: "Серебряный призрак",
      description: "Победите любого босса, не получив урона за время боя.",
      target: 1,
    },
  ];
  if (CHALLENGE_SPECS.length !== 14) {
    throw new Error("DustAndDeadProgression challenge catalog must contain exactly 14 entries.");
  }
  Object.freeze(CHALLENGE_SPECS);
  var CHALLENGE_IDS = CHALLENGE_SPECS.map(function (spec) { return spec.id; });
  var CHALLENGES_BY_ID = CHALLENGE_SPECS.reduce(function (result, spec) {
    result[spec.id] = spec;
    return result;
  }, Object.create(null));

  var CLASS_UNLOCK_SPECS = [
    { id: "gunslinger", label: "Gunslinger", costCents: 0 },
    { id: "ranger", label: "Ranger", costCents: 50000 },
    { id: "demolitionist", label: "Demolitionist", costCents: 100000 },
    { id: "marshal", label: "Marshal", costCents: 100000 },
  ];
  var CLASS_IDS = CLASS_UNLOCK_SPECS.map(function (spec) { return spec.id; });
  var CLASS_UNLOCKS_BY_ID = CLASS_UNLOCK_SPECS.reduce(function (result, spec) {
    result[spec.id] = spec;
    return result;
  }, Object.create(null));

  var BRANCH_UNLOCK_SPECS = [
    { id: "dualRevolvers", label: "Dual Revolvers", classId: "gunslinger", defaultUnlocked: true },
    { id: "bigIron", label: "Big Iron", classId: "gunslinger", contractId: "arsenal.revolver.1" },
    { id: "leverBarrage", label: "Lever Barrage", classId: "ranger", defaultUnlocked: true },
    { id: "trailWarden", label: "Trail Warden", classId: "ranger", contractId: "arsenal.rifle.1" },
    { id: "bombardier", label: "Bombardier", classId: "demolitionist", defaultUnlocked: true },
    { id: "pyrotechnician", label: "Pyrotechnician", classId: "demolitionist", contractId: "arsenal.launcher.1" },
    { id: "breachMarshal", label: "Breach Marshal", classId: "marshal", defaultUnlocked: true },
    { id: "graveWarden", label: "Grave Warden", classId: "marshal", contractId: "arsenal.coachGun.1" },
  ];
  var BRANCH_IDS = BRANCH_UNLOCK_SPECS.map(function (spec) { return spec.id; });
  var BRANCH_UNLOCKS_BY_ID = BRANCH_UNLOCK_SPECS.reduce(function (result, spec) {
    result[spec.id] = spec;
    return result;
  }, Object.create(null));
  var BRANCH_REWARDS_BY_CONTRACT = BRANCH_UNLOCK_SPECS.reduce(function (result, spec) {
    if (spec.contractId) result[spec.contractId] = spec;
    return result;
  }, Object.create(null));

  function getDefaultBranchIdsForClasses(classIds) {
    classIds = Array.isArray(classIds) ? classIds : [];
    return BRANCH_UNLOCK_SPECS.filter(function (spec) {
      return spec.defaultUnlocked && classIds.indexOf(spec.classId) !== -1;
    }).map(function (spec) {
      return spec.id;
    });
  }

  // Exactly 30 of the 86 existing run cards form the readable starter pool.
  // The remaining 56 are bought with Dust; no gameplay content is duplicated.
  var CORE_CARD_IDS = [
    "swiftBoots",
    "steadyHand",
    "quickReload",
    "hairTrigger",
    "scavengerLuck",
    "grit",
    "desertMender",
    "luckyMagnet",
    "xpHunger",
    "longReach",
    "ricochetRounds",
    "moreRicochets",
    "softAim",
    "silverBullet",
    "biggerCaliber",
    "extendedTube",
    "trailLoader",
    "snapTraps",
    "trailLayer",
    "clusterCharge",
    "moreBomblets",
    "chainDetonation",
    "napalmShells",
    "rollingFlame",
    "fireproofPowder",
    "longBurn",
    "doorKicker",
    "doubleTap",
    "rockSalt",
    "stillness",
  ];
  var ALL_CARD_IDS = [
    "swiftBoots",
    "steadyHand",
    "quickReload",
    "hairTrigger",
    "scavengerLuck",
    "grit",
    "desertMender",
    "luckyMagnet",
    "xpHunger",
    "longReach",
    "ricochetRounds",
    "moreRicochets",
    "softAim",
    "fanTheHammer",
    "trickShot",
    "duelistFocus",
    "allRightAllLeft",
    "silverBullet",
    "silverCache",
    "executioner",
    "biggerCaliber",
    "heavyRupture",
    "leadBloom",
    "throughAndThrough",
    "extendedTube",
    "trailLoader",
    "chainLightning",
    "stormTempo",
    "leverEcho",
    "redLine",
    "pinDown",
    "stormFeed",
    "forkedLightning",
    "returnStroke",
    "unbrokenStorm",
    "eyeOfTheStorm",
    "snapTraps",
    "baitedTrap",
    "trailLayer",
    "quickerTrail",
    "powderTrap",
    "salvagedTrap",
    "clusterCharge",
    "moreBomblets",
    "chainDetonation",
    "moreChainDetonations",
    "heavyPayload",
    "fullSalvo",
    "shrapnelRain",
    "powderEcho",
    "madmansJourney",
    "napalmShells",
    "rollingFlame",
    "fireproofPowder",
    "longBurn",
    "hotterFire",
    "scorchedEarth",
    "thermiteCore",
    "backdraft",
    "crossfireShells",
    "doorKicker",
    "doubleTap",
    "lastWord",
    "shellCatcher",
    "buckAndBall",
    "rideTheRecoil",
    "bonebreaker",
    "noTimeToBleed",
    "packedBuckshot",
    "hardCast",
    "roomSweeper",
    "rollingThunder",
    "sheriffsPace",
    "holdTheDoor",
    "powderCurtain",
    "masterKey",
    "rockSalt",
    "stillness",
    "lastRites",
    "graveTithe",
    "heavensBounty",
    "passingJudgment",
    "purifyingSalt",
    "hallowedGround",
    "fineChoke",
    "sanctifiedLead",
  ];
  var CORE_CARD_LOOKUP = CORE_CARD_IDS.reduce(function (result, id) {
    result[id] = true;
    return result;
  }, Object.create(null));
  var ALL_CARD_LOOKUP = ALL_CARD_IDS.reduce(function (result, id) {
    result[id] = true;
    return result;
  }, Object.create(null));
  var LOCKED_CARD_IDS = ALL_CARD_IDS.filter(function (id) {
    return !CORE_CARD_LOOKUP[id];
  });
  var NON_DRAFT_CARD_LOOKUP = {
    napalmShells: true,
    fireproofPowder: true,
  };

  if (CORE_CARD_IDS.length !== 30 || ALL_CARD_IDS.length !== 86 || LOCKED_CARD_IDS.length !== 56) {
    throw new Error("DustAndDeadProgression unlock catalog must contain 30 core and 56 purchasable cards.");
  }

  var ENEMY_TYPES = [
    "walker",
    "runner",
    "fastZombie",
    "brute",
    "spitter",
    "armoredMiner",
    "gravePreacher",
  ];
  var WEAPON_TYPES = ["revolver", "rifle", "launcher", "coachGun"];
  var BOSS_TYPES = [
    "bellRinger",
    "ghostTrain",
    "oilBaron",
    "slothArchbishop",
    "hordeheart",
    "landEater",
    "doppelganger",
  ];
  var MASTERY_METRICS = [
    "dualFreeReloadsEarned",
    "bigIronRuptures",
    "rifleLightningStrikes",
    "rifleTrapTriggers",
    "launcherChainDetonations",
    "launcherFireKills",
    "marshalBountiesClaimed",
    "marshalPaleDeputyKills",
  ];

  var ENEMY_LABELS = {
    walker: "Ходоки",
    runner: "Бегуны",
    fastZombie: "Быстрые зомби",
    brute: "Громилы",
    spitter: "Плевальщики",
    armoredMiner: "Бронированные шахтёры",
    gravePreacher: "Могильные проповедники",
  };
  var WEAPON_LABELS = {
    revolver: "Револьвер",
    rifle: "Винчестер",
    launcher: "Гранатомёт",
    coachGun: "Двустволка",
  };
  var BOSS_LABELS = {
    bellRinger: "Звонарь",
    ghostTrain: "Призрачный поезд",
    oilBaron: "Нефтяной барон",
    slothArchbishop: "Архиепископ Лени",
    hordeheart: "Сердце Орды",
    landEater: "Пожиратель Земли",
    doppelganger: "Двойник",
  };

  var CONTRACTS = [];

  function addContract(id, group, title, description, metric, target) {
    CONTRACTS.push(Object.freeze({
      id: id,
      group: group,
      title: title,
      description: description,
      metric: metric,
      target: target,
    }));
  }

  function addTiers(idPrefix, group, label, metric, targets, descriptionPrefix) {
    for (var i = 0; i < targets.length; i++) {
      addContract(
        idPrefix + "." + (i + 1),
        group,
        label + " " + ["I", "II", "III"][i],
        descriptionPrefix + " " + targets[i] + ".",
        metric,
        targets[i]
      );
    }
  }

  addTiers(
    "hunt.any",
    "hunting",
    "Зачистка",
    "killsTotal",
    [100, 750, 3000],
    "Убейте любых зомби:"
  );

  var enemyTargets = {
    walker: [100, 500, 2000],
    runner: [50, 250, 1000],
    fastZombie: [25, 125, 500],
    brute: [25, 125, 500],
    spitter: [20, 100, 400],
    armoredMiner: [10, 50, 150],
    gravePreacher: [5, 30, 120],
  };
  for (var enemyIndex = 0; enemyIndex < ENEMY_TYPES.length; enemyIndex++) {
    var enemyType = ENEMY_TYPES[enemyIndex];
    addTiers(
      "hunt." + enemyType,
      "hunting",
      ENEMY_LABELS[enemyType],
      "killsByType." + enemyType,
      enemyTargets[enemyType],
      "Убейте врагов этого типа:"
    );
  }

  for (var weaponIndex = 0; weaponIndex < WEAPON_TYPES.length; weaponIndex++) {
    var weaponType = WEAPON_TYPES[weaponIndex];
    addTiers(
      "arsenal." + weaponType,
      "arsenal",
      WEAPON_LABELS[weaponType],
      "killsByWeapon." + weaponType,
      [100, 500, 2000],
      "Совершите убийства этим оружием:"
    );
  }

  addContract(
    "mastery.dualReloads",
    "arsenal",
    "Всё по-честному",
    "Заработайте 25 бесплатных перезарядок парных револьверов.",
    "mastery.dualFreeReloadsEarned",
    25
  );
  addContract(
    "mastery.bigIronRuptures",
    "arsenal",
    "Разрыв навылет",
    "Вызовите 50 разрывов «Большим стволом».",
    "mastery.bigIronRuptures",
    50
  );
  addContract(
    "mastery.rifleLightning",
    "arsenal",
    "Грозовой фронт",
    "Поразите молнией Винчестера 250 целей.",
    "mastery.rifleLightningStrikes",
    250
  );
  addContract(
    "mastery.rifleTraps",
    "arsenal",
    "Хозяин тропы",
    "Активируйте 100 винтовочных ловушек.",
    "mastery.rifleTrapTriggers",
    100
  );
  addContract(
    "mastery.chainDetonations",
    "arsenal",
    "Цепная реакция",
    "Вызовите 100 цепных детонаций.",
    "mastery.launcherChainDetonations",
    100
  );
  addContract(
    "mastery.fireKills",
    "arsenal",
    "Выжженная земля",
    "Убейте огнём гранатомёта 100 врагов.",
    "mastery.launcherFireKills",
    100
  );
  addContract(
    "mastery.bounties",
    "arsenal",
    "Небесная награда",
    "Заберите 25 наград маршала.",
    "mastery.marshalBountiesClaimed",
    25
  );
  addContract(
    "mastery.paleDeputy",
    "arsenal",
    "Бледный помощник",
    "Пусть Бледный помощник убьёт 50 врагов.",
    "mastery.marshalPaleDeputyKills",
    50
  );

  for (var bossIndex = 0; bossIndex < BOSS_TYPES.length; bossIndex++) {
    var bossType = BOSS_TYPES[bossIndex];
    var veteranTarget = bossType === "doppelganger" ? 3 : 5;
    addContract(
      "boss." + bossType + ".1",
      "bosses",
      BOSS_LABELS[bossType] + ": первая победа",
      "Победите этого босса один раз.",
      "bossesByType." + bossType,
      1
    );
    addContract(
      "boss." + bossType + ".2",
      "bosses",
      BOSS_LABELS[bossType] + ": охотник",
      "Победите этого босса " + veteranTarget + " раз.",
      "bossesByType." + bossType,
      veteranTarget
    );
  }

  addTiers(
    "journey.waves",
    "journey",
    "Долгая дорога",
    "wavesCompleted",
    [10, 50, 200],
    "Завершите суммарно волн:"
  );
  addTiers(
    "journey.highestWave",
    "journey",
    "За горизонт",
    "highestWave",
    [10, 20, 30],
    "Достигните в одном забеге волны:"
  );
  addContract(
    "journey.xpOrbs",
    "journey",
    "Искатель опыта",
    "Подберите 250 сфер опыта.",
    "pickups.xpOrbs",
    250
  );
  addContract(
    "journey.ammoCrates",
    "journey",
    "Запасливый стрелок",
    "Подберите 25 ящиков боеприпасов.",
    "pickups.ammoCrates",
    25
  );

  addContract(
    "multiplayer.matches.1",
    "multiplayer",
    "В одной упряжке I",
    "Завершите 5 матчей с другими игроками.",
    "multiplayer.matches",
    5
  );
  addContract(
    "multiplayer.matches.2",
    "multiplayer",
    "В одной упряжке II",
    "Завершите 25 матчей с другими игроками.",
    "multiplayer.matches",
    25
  );
  addContract(
    "multiplayer.firstPlace.1",
    "multiplayer",
    "Первый среди равных I",
    "Займите первое место один раз.",
    "multiplayer.firstPlaces",
    1
  );
  addContract(
    "multiplayer.firstPlace.2",
    "multiplayer",
    "Первый среди равных II",
    "Займите первое место 10 раз.",
    "multiplayer.firstPlaces",
    10
  );
  addContract(
    "multiplayer.revives.1",
    "multiplayer",
    "Ещё не конец I",
    "Успешно возродитесь 3 раза.",
    "multiplayer.revives",
    3
  );
  addContract(
    "multiplayer.revives.2",
    "multiplayer",
    "Ещё не конец II",
    "Успешно возродитесь 15 раз.",
    "multiplayer.revives",
    15
  );

  if (CONTRACTS.length !== 72) {
    throw new Error("DustAndDeadProgression contract catalog must contain exactly 72 entries.");
  }
  Object.freeze(CONTRACTS);
  var CONTRACTS_BY_METRIC = CONTRACTS.reduce(function (result, contract) {
    if (!result[contract.metric]) result[contract.metric] = [];
    result[contract.metric].push(contract);
    return result;
  }, Object.create(null));
  var MASTERY_CONTRACT_METRICS = MASTERY_METRICS.map(function (metric) {
    return "mastery." + metric;
  });

  function createCounterMap(keys) {
    var result = {};
    for (var i = 0; i < keys.length; i++) result[keys[i]] = 0;
    return result;
  }

  function createEmptyStats() {
    return {
      killsTotal: 0,
      killsByType: createCounterMap(ENEMY_TYPES),
      killsByWeapon: createCounterMap(WEAPON_TYPES),
      bossesByType: createCounterMap(BOSS_TYPES),
      wavesCompleted: 0,
      highestWave: 0,
      pickups: {
        xpOrbs: 0,
        ammoCrates: 0,
      },
      mastery: createCounterMap(MASTERY_METRICS),
      multiplayer: {
        matches: 0,
        firstPlaces: 0,
        wins: 0,
        playerKills: 0,
        revives: 0,
      },
    };
  }

  function createFreshUnlockState() {
    var classes = ["gunslinger"];
    return {
      classes: classes,
      branches: getDefaultBranchIdsForClasses(classes),
      purchasedCards: [],
      markedCards: [],
      purchasedCosmetics: [],
    };
  }

  function createLegacyUnlockState() {
    // Legacy saves predate the unlock system, so they keep every gameplay item.
    // Paid cosmetics never existed back then and are not granted retroactively.
    return {
      classes: CLASS_IDS.slice(),
      branches: BRANCH_IDS.slice(),
      purchasedCards: LOCKED_CARD_IDS.slice(),
      markedCards: [],
      purchasedCosmetics: [],
    };
  }

  function createFreshCosmeticState() {
    return {
      cowboyId: DEFAULT_COWBOY_COSMETIC_ID,
      hatId: DEFAULT_HAT_COSMETIC_ID,
    };
  }

  function createFreshChallengeState() {
    return {
      completed: {},
      pinnedId: "",
    };
  }

  function normalizeChallenges(source) {
    var normalized = createFreshChallengeState();
    if (!source || typeof source !== "object") return normalized;
    var completed = source.completed && typeof source.completed === "object"
      ? source.completed
      : {};
    for (var i = 0; i < CHALLENGE_IDS.length; i++) {
      var challengeId = CHALLENGE_IDS[i];
      var timestamp = normalizeTimestamp(completed[challengeId]);
      if (timestamp) normalized.completed[challengeId] = timestamp;
    }
    var pinnedId = normalizeId(source.pinnedId);
    if (pinnedId && CHALLENGES_BY_ID[pinnedId]) normalized.pinnedId = pinnedId;
    return normalized;
  }

  function createEmptyState() {
    return {
      version: VERSION,
      dustCents: 0,
      zombieKillRemainder: 0,
      zombieKillRemainderCents: 0,
      zombieKillRemainderRewardUnits: 0,
      stats: createEmptyStats(),
      completionTimestamps: {},
      settledMatchIds: [],
      masteryReceiptIds: [],
      unlocks: createFreshUnlockState(),
      cosmetics: createFreshCosmeticState(),
      challenges: createFreshChallengeState(),
    };
  }

  function toCounter(value) {
    var number = Number(value);
    if (!Number.isFinite(number) || number <= 0) return 0;
    return Math.min(MAX_COUNTER, Math.floor(number));
  }

  function safeAdd(left, right) {
    left = toCounter(left);
    right = toCounter(right);
    return Math.min(MAX_COUNTER, left + right);
  }

  function normalizeKnownCounterMap(source, keys) {
    var result = createCounterMap(keys);
    if (!source || typeof source !== "object") return result;
    for (var i = 0; i < keys.length; i++) {
      result[keys[i]] = toCounter(source[keys[i]]);
    }
    return result;
  }

  function normalizeId(value) {
    if (typeof value !== "string") return "";
    return value.trim().slice(0, 128);
  }

  function normalizeIdList(source, limit) {
    if (!Array.isArray(source)) return [];
    var seen = Object.create(null);
    var result = [];
    for (var i = Math.max(0, source.length - limit * 2); i < source.length; i++) {
      var id = normalizeId(source[i]);
      if (!id || seen[id]) continue;
      seen[id] = true;
      result.push(id);
    }
    return result.slice(-limit);
  }

  function normalizeKnownIdList(source, knownIds) {
    if (!Array.isArray(source)) return [];
    var known = knownIds.reduce(function (result, id) {
      result[id] = true;
      return result;
    }, Object.create(null));
    var seen = Object.create(null);
    var result = [];
    for (var i = 0; i < source.length; i++) {
      var id = normalizeId(source[i]);
      if (!id || !known[id] || seen[id]) continue;
      seen[id] = true;
      result.push(id);
    }
    return result;
  }

  function appendMissingIds(target, required) {
    for (var i = 0; i < required.length; i++) {
      if (target.indexOf(required[i]) === -1) target.push(required[i]);
    }
    return target;
  }

  function normalizeUnlocks(source, legacy) {
    if (!source || typeof source !== "object") {
      return legacy ? createLegacyUnlockState() : createFreshUnlockState();
    }
    var classes = appendMissingIds(
      normalizeKnownIdList(source.classes, CLASS_IDS),
      ["gunslinger"]
    );
    var branches = normalizeKnownIdList(source.branches, BRANCH_IDS).filter(function (id) {
      var spec = BRANCH_UNLOCKS_BY_ID[id];
      return !!spec && classes.indexOf(spec.classId) !== -1;
    });
    appendMissingIds(branches, getDefaultBranchIdsForClasses(classes));
    var purchasedCards = normalizeKnownIdList(source.purchasedCards, LOCKED_CARD_IDS);
    var unlockedCards = CORE_CARD_IDS.concat(purchasedCards);
    var markedCards = normalizeKnownIdList(source.markedCards, unlockedCards).filter(function (id) {
      return !NON_DRAFT_CARD_LOOKUP[id];
    });
    if (
      purchasedCards.length < MARKED_CARD_REQUIRED_UNLOCKS ||
      markedCards.length !== MARKED_CARD_COUNT
    ) {
      markedCards = [];
    }
    return {
      classes: classes,
      branches: branches,
      purchasedCards: purchasedCards,
      markedCards: markedCards,
      purchasedCosmetics: normalizeKnownIdList(source.purchasedCosmetics, ALL_COSMETIC_IDS),
    };
  }

  function getCosmeticSpec(slot, id) {
    id = String(id || "");
    if (slot === "cowboy") return COWBOY_COSMETICS_BY_ID[id] || null;
    if (slot === "hat") return HAT_COSMETICS_BY_ID[id] || null;
    return null;
  }

  function metricValueFromStats(stats, metric) {
    var path = String(metric || "").split(".");
    var value = stats;
    for (var i = 0; i < path.length; i++) {
      if (!value || typeof value !== "object") return 0;
      value = value[path[i]];
    }
    return toCounter(value);
  }

  function getContractSpec(id) {
    for (var i = 0; i < CONTRACTS.length; i++) {
      if (CONTRACTS[i].id === id) return CONTRACTS[i];
    }
    return null;
  }

  function isPersistedCosmeticSpecUnlockedForState(spec, targetState) {
    if (!spec || !targetState) return false;
    var requirement = spec.requirement || {};
    if (requirement.type === "starter") return true;
    if (requirement.type === "contractMarks") {
      return Object.keys(targetState.completionTimestamps || {}).length >= toCounter(requirement.count);
    }
    if (requirement.type === "contract") {
      if (
        targetState.completionTimestamps &&
        targetState.completionTimestamps[requirement.id]
      ) return true;
      var contract = getContractSpec(requirement.id);
      return !!contract &&
        metricValueFromStats(targetState.stats, contract.metric) >= contract.target;
    }
    if (requirement.type === "dust") {
      return !!targetState.unlocks &&
        hasUnlockedId(targetState.unlocks.purchasedCosmetics, spec.id);
    }
    if (requirement.type === "challenge") {
      return !!(
        targetState.challenges &&
        targetState.challenges.completed &&
        targetState.challenges.completed[requirement.id]
      );
    }
    return false;
  }

  function isCosmeticSpecUnlockedForState(spec, targetState) {
    return TEST_ALL_ACCESS || isPersistedCosmeticSpecUnlockedForState(spec, targetState);
  }

  function normalizeCosmeticProfile(source) {
    source = source && typeof source === "object" ? source : {};
    var cowboyId = normalizeId(source.cowboyId || source.bodyId);
    var hatId = normalizeId(source.hatId);
    return {
      version: 1,
      cowboyId: COWBOY_COSMETICS_BY_ID[cowboyId]
        ? cowboyId
        : DEFAULT_COWBOY_COSMETIC_ID,
      hatId: HAT_COSMETICS_BY_ID[hatId]
        ? hatId
        : DEFAULT_HAT_COSMETIC_ID,
    };
  }

  function normalizeCosmetics(source, targetState) {
    var profile = normalizeCosmeticProfile(source);
    if (!isPersistedCosmeticSpecUnlockedForState(
      COWBOY_COSMETICS_BY_ID[profile.cowboyId],
      targetState
    )) {
      profile.cowboyId = DEFAULT_COWBOY_COSMETIC_ID;
    }
    if (!isPersistedCosmeticSpecUnlockedForState(
      HAT_COSMETICS_BY_ID[profile.hatId],
      targetState
    )) {
      profile.hatId = DEFAULT_HAT_COSMETIC_ID;
    }
    return {
      cowboyId: profile.cowboyId,
      hatId: profile.hatId,
    };
  }

  function normalizeTimestamp(value) {
    if (typeof value !== "string" && typeof value !== "number") return "";
    var date = new Date(value);
    if (!Number.isFinite(date.getTime())) return "";
    return date.toISOString();
  }

  function normalizeStats(source) {
    source = source && typeof source === "object" ? source : {};
    var pickups = source.pickups && typeof source.pickups === "object" ? source.pickups : {};
    var multiplayer = source.multiplayer && typeof source.multiplayer === "object"
      ? source.multiplayer
      : {};
    return {
      killsTotal: toCounter(source.killsTotal),
      killsByType: normalizeKnownCounterMap(source.killsByType, ENEMY_TYPES),
      killsByWeapon: normalizeKnownCounterMap(source.killsByWeapon, WEAPON_TYPES),
      bossesByType: normalizeKnownCounterMap(source.bossesByType, BOSS_TYPES),
      wavesCompleted: toCounter(source.wavesCompleted),
      highestWave: toCounter(source.highestWave),
      pickups: {
        xpOrbs: toCounter(pickups.xpOrbs),
        ammoCrates: toCounter(pickups.ammoCrates),
      },
      mastery: normalizeKnownCounterMap(source.mastery, MASTERY_METRICS),
      multiplayer: {
        matches: toCounter(multiplayer.matches),
        firstPlaces: toCounter(multiplayer.firstPlaces),
        wins: toCounter(multiplayer.wins),
        playerKills: toCounter(multiplayer.playerKills),
        revives: toCounter(multiplayer.revives),
      },
    };
  }

  function normalizeState(source) {
    if (!source || typeof source !== "object" || Number(source.version) !== VERSION) {
      return createEmptyState();
    }
    var completionTimestamps = {};
    var rawTimestamps = source.completionTimestamps;
    if (rawTimestamps && typeof rawTimestamps === "object") {
      for (var i = 0; i < CONTRACTS.length; i++) {
        var contractId = CONTRACTS[i].id;
        var timestamp = normalizeTimestamp(rawTimestamps[contractId]);
        if (timestamp) completionTimestamps[contractId] = timestamp;
      }
    }
    var zombieKillRemainder = Math.min(9, toCounter(source.zombieKillRemainder));
    var storedRemainderCents = source.zombieKillRemainderCents;
    var legacyRemainderCents = storedRemainderCents == null
      ? zombieKillRemainder * LEGACY_ZOMBIE_DUST_CENTS_PER_KILL
      : Math.min(
        zombieKillRemainder * 15,
        toCounter(storedRemainderCents)
      );
    var storedRemainderRewardUnits = source.zombieKillRemainderRewardUnits;
    var remainderRewardUnits = storedRemainderRewardUnits == null
      ? Math.round(
        legacyRemainderCents *
        ZOMBIE_DUST_CENTS_PER_KILL *
        ZOMBIE_REWARD_UNITS_PER_CENT /
        LEGACY_ZOMBIE_DUST_CENTS_PER_KILL
      )
      : Math.min(
        zombieKillRemainder * ZOMBIE_DUST_CENTS_PER_KILL * PLACE_MULTIPLIERS[0],
        toCounter(storedRemainderRewardUnits)
      );
    var normalized = {
      version: VERSION,
      dustCents: toCounter(source.dustCents),
      zombieKillRemainder: zombieKillRemainder,
      // Preserve partial kill credit from the old 0.10-Dust economy while
      // keeping half-cent multiplayer rewards exact until the batch pays out.
      zombieKillRemainderCents: Math.round(
        remainderRewardUnits / ZOMBIE_REWARD_UNITS_PER_CENT
      ),
      zombieKillRemainderRewardUnits: remainderRewardUnits,
      stats: normalizeStats(source.stats),
      completionTimestamps: completionTimestamps,
      settledMatchIds: normalizeIdList(source.settledMatchIds, SETTLED_MATCH_LIMIT),
      masteryReceiptIds: normalizeIdList(source.masteryReceiptIds, MASTERY_RECEIPT_LIMIT),
      // Valid v1 saves created before the store already exposed every class,
      // branch and card. Grandfather them so the migration never removes play.
      unlocks: normalizeUnlocks(
        source.unlocks,
        !Object.prototype.hasOwnProperty.call(source, "unlocks")
      ),
    };
    normalized.challenges = normalizeChallenges(source.challenges);
    normalized.cosmetics = normalizeCosmetics(source.cosmetics, normalized);
    Object.keys(BRANCH_REWARDS_BY_CONTRACT).forEach(function (contractId) {
      if (!normalized.completionTimestamps[contractId]) return;
      var branchSpec = BRANCH_REWARDS_BY_CONTRACT[contractId];
      if (normalized.unlocks.classes.indexOf(branchSpec.classId) === -1) return;
      var branchId = branchSpec.id;
      if (normalized.unlocks.branches.indexOf(branchId) === -1) {
        normalized.unlocks.branches.push(branchId);
      }
    });
    return normalized;
  }

  function getStorage() {
    try {
      return global.localStorage || null;
    } catch (error) {
      return null;
    }
  }

  function loadState() {
    var storage = getStorage();
    if (!storage) return createEmptyState();
    try {
      var raw = storage.getItem(STORAGE_KEY);
      return raw ? normalizeState(JSON.parse(raw)) : createEmptyState();
    } catch (error) {
      return createEmptyState();
    }
  }

  var persistTimer = 0;
  var persistDirty = false;

  function persistState() {
    var storage = getStorage();
    if (!storage) return false;
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(state));
      persistDirty = false;
      return true;
    } catch (error) {
      return false;
    }
  }

  function flushScheduledPersistence() {
    if (persistTimer) {
      global.clearTimeout(persistTimer);
      persistTimer = 0;
    }
    if (persistDirty) persistState();
  }

  function schedulePersistence(immediate) {
    persistDirty = true;
    if (immediate) {
      flushScheduledPersistence();
      return;
    }
    if (persistTimer) return;
    persistTimer = global.setTimeout(function () {
      persistTimer = 0;
      if (persistDirty) persistState();
    }, 600);
  }

  function cloneJson(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function refreshStateFromStorage() {
    var storage = getStorage();
    if (!storage) return false;
    try {
      var raw = storage.getItem(STORAGE_KEY);
      state = raw ? normalizeState(JSON.parse(raw)) : createEmptyState();
      refreshCompletionTimestamps();
      return true;
    } catch (error) {
      return false;
    }
  }

  function hasUnlockedId(list, id) {
    return Array.isArray(list) && list.indexOf(String(id || "")) !== -1;
  }

  function resetTestRuntimeAccess() {
    if (!TEST_ALL_ACCESS || !state) return;
    testRuntimeCosmetics = {
      cowboyId: state.cosmetics.cowboyId,
      hatId: state.cosmetics.hatId,
    };
  }

  function getUnlockedCardIds() {
    return TEST_ALL_ACCESS
      ? ALL_CARD_IDS.slice()
      : CORE_CARD_IDS.concat(state.unlocks.purchasedCards);
  }

  function isPersistedClassUnlocked(id) {
    return hasUnlockedId(state.unlocks.classes, id);
  }

  function isPersistedBranchUnlocked(id) {
    var spec = BRANCH_UNLOCKS_BY_ID[String(id || "")];
    return !!spec &&
      isPersistedClassUnlocked(spec.classId) &&
      hasUnlockedId(state.unlocks.branches, spec.id);
  }

  function isPersistedCardUnlocked(id) {
    id = String(id || "");
    return !!CORE_CARD_LOOKUP[id] || hasUnlockedId(state.unlocks.purchasedCards, id);
  }

  function isClassUnlocked(id) {
    return TEST_ALL_ACCESS || isPersistedClassUnlocked(id);
  }

  function isBranchUnlocked(id) {
    var spec = BRANCH_UNLOCKS_BY_ID[String(id || "")];
    return !!spec && (TEST_ALL_ACCESS || isPersistedBranchUnlocked(spec.id));
  }

  function isCardUnlocked(id) {
    id = String(id || "");
    return !!ALL_CARD_LOOKUP[id] && (
      TEST_ALL_ACCESS ||
      isPersistedCardUnlocked(id)
    );
  }

  function isCosmeticUnlocked(slot, id) {
    return isCosmeticSpecUnlockedForState(getCosmeticSpec(slot, id), state);
  }

  function getCardDraftWeight(id) {
    return hasUnlockedId(state.unlocks.markedCards, id)
      ? MARKED_CARD_DRAFT_WEIGHT
      : 1;
  }

  function grantCompletedContractBranches() {
    var changed = false;
    Object.keys(BRANCH_REWARDS_BY_CONTRACT).forEach(function (contractId) {
      if (!state.completionTimestamps[contractId]) return;
      var branchSpec = BRANCH_REWARDS_BY_CONTRACT[contractId];
      if (!isPersistedClassUnlocked(branchSpec.classId)) return;
      var branchId = branchSpec.id;
      if (state.unlocks.branches.indexOf(branchId) !== -1) return;
      state.unlocks.branches.push(branchId);
      changed = true;
    });
    return changed;
  }

  function metricValue(metric) {
    var path = String(metric || "").split(".");
    var value = state.stats;
    for (var i = 0; i < path.length; i++) {
      if (!value || typeof value !== "object") return 0;
      value = value[path[i]];
    }
    return toCounter(value);
  }

  function refreshCompletionTimestamps(now, completionMetrics) {
    var changed = false;
    var timestamp = new Date(now == null ? Date.now() : now).toISOString();
    var contracts = CONTRACTS;
    if (Array.isArray(completionMetrics)) {
      contracts = [];
      var seenContracts = Object.create(null);
      for (var metricIndex = 0; metricIndex < completionMetrics.length; metricIndex++) {
        var matchingContracts = CONTRACTS_BY_METRIC[completionMetrics[metricIndex]] || [];
        for (var matchIndex = 0; matchIndex < matchingContracts.length; matchIndex++) {
          var matchingContract = matchingContracts[matchIndex];
          if (seenContracts[matchingContract.id]) continue;
          seenContracts[matchingContract.id] = true;
          contracts.push(matchingContract);
        }
      }
    }
    for (var i = 0; i < contracts.length; i++) {
      var contract = contracts[i];
      var complete = metricValue(contract.metric) >= contract.target;
      if (complete && !state.completionTimestamps[contract.id]) {
        state.completionTimestamps[contract.id] = timestamp;
        changed = true;
      } else if (!complete && state.completionTimestamps[contract.id]) {
        delete state.completionTimestamps[contract.id];
        changed = true;
      }
    }
    return grantCompletedContractBranches() || changed;
  }

  function formatDust(cents) {
    var normalized = cents == null ? state.dustCents : toCounter(cents);
    var whole = Math.floor(normalized / 100);
    var fraction = normalized % 100;
    return String(whole) + "." + (fraction < 10 ? "0" : "") + String(fraction);
  }

  function getContracts() {
    return CONTRACTS.map(function (contract) {
      var current = metricValue(contract.metric);
      var completed = current >= contract.target;
      var branchReward = BRANCH_REWARDS_BY_CONTRACT[contract.id] || null;
      return {
        id: contract.id,
        group: contract.group,
        title: localizeCatalogField("contract", contract.id, "title", contract.title, {
          target: contract.target,
        }),
        description: localizeCatalogField("contract", contract.id, "description", contract.description, {
          target: contract.target,
        }),
        metric: contract.metric,
        target: contract.target,
        current: current,
        progress: Math.min(contract.target, current),
        ratio: Math.min(1, current / contract.target),
        completed: completed,
        completedAt: completed ? state.completionTimestamps[contract.id] || null : null,
        reward: branchReward ? {
          type: "masteryBranch",
          id: branchReward.id,
          label: localizeCatalogField("branch", branchReward.id, "label", branchReward.label),
        } : null,
      };
    });
  }

  function getUnlockSnapshot() {
    var unlockedCards = getUnlockedCardIds();
    var effectiveClasses = TEST_ALL_ACCESS ? CLASS_IDS : state.unlocks.classes;
    var effectiveBranches = TEST_ALL_ACCESS ? BRANCH_IDS : state.unlocks.branches;
    return {
      classes: effectiveClasses.slice(),
      branches: effectiveBranches.slice(),
      coreCards: CORE_CARD_IDS.slice(),
      purchasedCards: state.unlocks.purchasedCards.slice(),
      cards: unlockedCards,
      markedCards: state.unlocks.markedCards.slice(),
      purchasedCosmetics: state.unlocks.purchasedCosmetics.slice(),
      purchasedCardCount: state.unlocks.purchasedCards.length,
      unlockedCardCount: unlockedCards.length,
      totalCardCount: ALL_CARD_IDS.length,
      markedDeckUnlocked:
        state.unlocks.purchasedCards.length >= MARKED_CARD_REQUIRED_UNLOCKS,
      markedDeckRequiredUnlocks: MARKED_CARD_REQUIRED_UNLOCKS,
      markedCardCount: MARKED_CARD_COUNT,
      markedCardDraftWeight: MARKED_CARD_DRAFT_WEIGHT,
    };
  }

  function getSnapshot() {
    var marks = Object.keys(state.completionTimestamps).length;
    return {
      version: VERSION,
      storageKey: STORAGE_KEY,
      testAllAccess: TEST_ALL_ACCESS,
      dustCents: state.dustCents,
      dust: state.dustCents / 100,
      formattedDust: formatDust(),
      zombieKillRemainder: state.zombieKillRemainder,
      zombieKillRemainderCents: state.zombieKillRemainderCents,
      zombieKillRemainderRewardUnits: state.zombieKillRemainderRewardUnits,
      contractMarks: marks,
      completedContracts: marks,
      totalContracts: CONTRACTS.length,
      completionTimestamps: cloneJson(state.completionTimestamps),
      stats: cloneJson(state.stats),
      settledMatchIds: state.settledMatchIds.slice(),
      unlocks: getUnlockSnapshot(),
      cosmetics: getCosmeticSnapshot(),
      challenges: {
        pinnedId: state.challenges.pinnedId,
        completed: cloneJson(state.challenges.completed),
        completedCount: Object.keys(state.challenges.completed).length,
        totalCount: CHALLENGE_SPECS.length,
      },
    };
  }

  function getUnlockCatalog() {
    return {
      classes: CLASS_UNLOCK_SPECS.map(function (spec) {
        var owned = isPersistedClassUnlocked(spec.id);
        return {
          id: spec.id,
          label: localizeCatalogField("class", spec.id, "label", spec.label),
          costCents: spec.costCents,
          costDust: spec.costCents / 100,
          unlocked: isClassUnlocked(spec.id),
          owned: owned,
          testEntitled: TEST_ALL_ACCESS && !owned,
        };
      }),
      branches: BRANCH_UNLOCK_SPECS.map(function (spec) {
        var contract = spec.contractId
          ? CONTRACTS.filter(function (entry) { return entry.id === spec.contractId; })[0] || null
          : null;
        var classUnlocked = isClassUnlocked(spec.classId);
        var owned = isPersistedBranchUnlocked(spec.id);
        return {
          id: spec.id,
          label: localizeCatalogField("branch", spec.id, "label", spec.label),
          classId: spec.classId,
          defaultUnlocked: !!spec.defaultUnlocked,
          contractId: spec.contractId || "",
          contractTitle: contract
            ? localizeCatalogField("contract", contract.id, "title", contract.title, {
              target: contract.target,
            })
            : "",
          classUnlocked: classUnlocked,
          unlocked: classUnlocked && isBranchUnlocked(spec.id),
          owned: owned,
          testEntitled: TEST_ALL_ACCESS && !owned,
          lockedReason: classUnlocked ? "" : "class",
        };
      }),
      cards: ALL_CARD_IDS.map(function (id) {
        var core = !!CORE_CARD_LOOKUP[id];
        var owned = isPersistedCardUnlocked(id);
        return {
          id: id,
          core: core,
          purchasable: !core,
          costCents: core ? 0 : CARD_UNLOCK_COST_CENTS,
          costDust: core ? 0 : CARD_UNLOCK_COST_CENTS / 100,
          unlocked: isCardUnlocked(id),
          owned: owned,
          testEntitled: TEST_ALL_ACCESS && !owned,
          marked: hasUnlockedId(state.unlocks.markedCards, id),
          markable: !NON_DRAFT_CARD_LOOKUP[id],
        };
      }),
      markedDeckRequiredUnlocks: MARKED_CARD_REQUIRED_UNLOCKS,
      markedCardCount: MARKED_CARD_COUNT,
      markedCardDraftWeight: MARKED_CARD_DRAFT_WEIGHT,
    };
  }

  function getUnlockProfile() {
    return {
      version: 1,
      classes: (TEST_ALL_ACCESS ? CLASS_IDS : state.unlocks.classes).slice(),
      branches: (TEST_ALL_ACCESS ? BRANCH_IDS : state.unlocks.branches).slice(),
      purchasedCards: (TEST_ALL_ACCESS ? LOCKED_CARD_IDS : state.unlocks.purchasedCards).slice(),
      markedCards: state.unlocks.markedCards.slice(),
    };
  }

  function getCosmeticProfile() {
    var profile = TEST_ALL_ACCESS && testRuntimeCosmetics
      ? testRuntimeCosmetics
      : state.cosmetics;
    return {
      version: 1,
      cowboyId: profile.cowboyId,
      hatId: profile.hatId,
    };
  }

  function getCosmeticCatalogEntry(spec) {
    var requirement = spec.requirement || {};
    var current = 0;
    var target = 1;
    if (requirement.type === "starter") {
      current = 1;
    } else if (requirement.type === "contractMarks") {
      current = Object.keys(state.completionTimestamps).length;
      target = toCounter(requirement.count) || 1;
    } else if (requirement.type === "contract") {
      current = state.completionTimestamps[requirement.id] ? 1 : 0;
    } else if (requirement.type === "challenge") {
      current = state.challenges.completed[requirement.id] ? 1 : 0;
    } else if (requirement.type === "dust") {
      current = isPersistedCosmeticSpecUnlockedForState(spec, state) ? 1 : 0;
    }
    var costCents = getCosmeticCostCents(spec);
    var owned = isPersistedCosmeticSpecUnlockedForState(spec, state);
    return {
      id: spec.id,
      label: localizeCatalogField("cosmetic", spec.id, "label", spec.label),
      description: localizeCatalogField("cosmetic", spec.id, "description", spec.description),
      swatches: spec.swatches.slice(),
      requirement: cloneJson(requirement),
      requirementLabel: localizeCatalogField(
        "cosmetic",
        spec.id,
        "requirement",
        requirement.label || "",
        { count: requirement.count || 0, cost: costCents / 100 }
      ),
      current: Math.min(target, current),
      target: target,
      ratio: Math.min(1, current / target),
      unlocked: isCosmeticSpecUnlockedForState(spec, state),
      owned: owned,
      testEntitled: TEST_ALL_ACCESS && !owned,
      purchasable: requirement.type === "dust",
      costCents: costCents,
      costDust: costCents / 100,
      affordable: costCents > 0 && state.dustCents >= costCents,
    };
  }

  function getCosmeticCatalog() {
    var cowboys = COWBOY_COSMETIC_SPECS.map(getCosmeticCatalogEntry);
    var hats = HAT_COSMETIC_SPECS.map(getCosmeticCatalogEntry);
    return {
      cowboys: cowboys,
      hats: hats,
      equipped: getCosmeticProfile(),
      contractMarks: Object.keys(state.completionTimestamps).length,
      dustCents: state.dustCents,
      formattedDust: formatDust(),
      purchasedCosmetics: state.unlocks.purchasedCosmetics.slice(),
      unlockedCount: cowboys.concat(hats).filter(function (entry) {
        return entry.unlocked;
      }).length,
      totalCount: cowboys.length + hats.length,
    };
  }

  function getCosmeticSnapshot() {
    var catalog = getCosmeticCatalog();
    var profile = getCosmeticProfile();
    return {
      cowboyId: profile.cowboyId,
      hatId: profile.hatId,
      unlockedCount: catalog.unlockedCount,
      totalCount: catalog.totalCount,
    };
  }

  function normalizeUnlockProfile(source) {
    var normalized = normalizeUnlocks(source, false);
    return {
      version: 1,
      classes: normalized.classes,
      branches: normalized.branches,
      purchasedCards: normalized.purchasedCards,
      markedCards: normalized.markedCards,
    };
  }

  var subscribers = [];

  function notifySubscribers(snapshot, change) {
    var listeners = subscribers.slice();
    for (var i = 0; i < listeners.length; i++) {
      try {
        listeners[i](snapshot, change);
      } catch (error) {
        // A UI listener must never make progression recording fail.
      }
    }
  }

  function subscribe(listener) {
    if (typeof listener !== "function") return function () {};
    subscribers.push(listener);
    var active = true;
    return function () {
      if (!active) return;
      active = false;
      var index = subscribers.indexOf(listener);
      if (index !== -1) subscribers.splice(index, 1);
    };
  }

  function rejected(reason) {
    return {
      accepted: false,
      reason: reason,
      dustAddedCents: 0,
      dustSpentCents: 0,
      snapshot: getSnapshot(),
    };
  }

  function commit(change, mutator, durable) {
    if (durable) {
      flushScheduledPersistence();
      if (persistDirty) return rejected("persistence-failed");
      // Rebase paid/selection transactions on the newest cross-tab save so
      // two open game tabs cannot spend an already-consumed Dust balance.
      if (!refreshStateFromStorage()) return rejected("persistence-failed");
    }
    var previousState = durable ? cloneJson(state) : null;
    var details = mutator() || {};
    if (details.accepted === false) return rejected(details.reason || "rejected");
    var completionChanged = refreshCompletionTimestamps(
      null,
      details.completionMetrics
    );
    if (durable) {
      persistDirty = true;
      if (!persistState()) {
        state = normalizeState(previousState);
        persistDirty = false;
        return rejected("persistence-failed");
      }
    } else {
      var immediatePersistence =
        change !== "soloKill" && change !== "pickup" ||
        completionChanged;
      schedulePersistence(immediatePersistence);
    }
    var snapshot = getSnapshot();
    var result = {
      accepted: true,
      reason: "",
      dustAddedCents: toCounter(details.dustAddedCents),
      dustSpentCents: toCounter(details.dustSpentCents),
      snapshot: snapshot,
    };
    if (details.matchId) result.matchId = details.matchId;
    if (details.receiptId) result.receiptId = details.receiptId;
    if (details.placement) result.placement = details.placement;
    if (details.multiplier != null) result.multiplier = details.multiplier;
    if (details.unlockType) result.unlockType = String(details.unlockType);
    if (details.unlockId) result.unlockId = String(details.unlockId);
    if (details.markedCards) result.markedCards = details.markedCards.slice();
    if (details.cosmeticSlot) result.cosmeticSlot = String(details.cosmeticSlot);
    if (details.cosmeticId) result.cosmeticId = String(details.cosmeticId);
    if (details.challengeId) result.challengeId = String(details.challengeId);
    if (details.cosmeticProfile) {
      result.cosmeticProfile = {
        cowboyId: String(details.cosmeticProfile.cowboyId || ""),
        hatId: String(details.cosmeticProfile.hatId || ""),
      };
    }
    notifySubscribers(snapshot, change);
    return result;
  }

  function addDust(baseCents, multiplier) {
    var before = state.dustCents;
    var scaled = Math.round(toCounter(baseCents) * toCounter(multiplier == null ? 100 : multiplier) / 100);
    state.dustCents = safeAdd(state.dustCents, scaled);
    return state.dustCents - before;
  }

  function spendDust(cents) {
    cents = toCounter(cents);
    if (!cents || state.dustCents < cents) return false;
    state.dustCents -= cents;
    return true;
  }

  function purchaseClass(id) {
    id = normalizeId(id);
    var spec = CLASS_UNLOCKS_BY_ID[id];
    if (!spec) return rejected("unknown-class");
    return commit("purchaseClass", function () {
      if (isClassUnlocked(id)) return { accepted: false, reason: "already-unlocked" };
      if (state.dustCents < spec.costCents) return { accepted: false, reason: "insufficient-dust" };
      if (!spendDust(spec.costCents)) return { accepted: false, reason: "insufficient-dust" };
      state.unlocks.classes.push(id);
      appendMissingIds(
        state.unlocks.branches,
        getDefaultBranchIdsForClasses([id])
      );
      grantCompletedContractBranches();
      return {
        dustSpentCents: spec.costCents,
        unlockType: "class",
        unlockId: id,
      };
    }, true);
  }

  function purchaseCard(id) {
    id = normalizeId(id);
    if (!ALL_CARD_LOOKUP[id]) return rejected("unknown-card");
    return commit("purchaseCard", function () {
      if (isCardUnlocked(id)) return { accepted: false, reason: "already-unlocked" };
      if (state.dustCents < CARD_UNLOCK_COST_CENTS) {
        return { accepted: false, reason: "insufficient-dust" };
      }
      if (!spendDust(CARD_UNLOCK_COST_CENTS)) {
        return { accepted: false, reason: "insufficient-dust" };
      }
      state.unlocks.purchasedCards.push(id);
      return {
        dustSpentCents: CARD_UNLOCK_COST_CENTS,
        unlockType: "card",
        unlockId: id,
      };
    }, true);
  }

  function purchaseCosmetic(slot, id) {
    slot = String(slot || "");
    id = normalizeId(id);
    if (slot !== "cowboy" && slot !== "hat") return rejected("unknown-cosmetic-slot");
    var spec = getCosmeticSpec(slot, id);
    if (!spec) return rejected("unknown-cosmetic");
    var costCents = getCosmeticCostCents(spec);
    if (!costCents) return rejected("cosmetic-not-purchasable");
    return commit("purchaseCosmetic", function () {
      if (isCosmeticSpecUnlockedForState(spec, state)) {
        return { accepted: false, reason: "already-unlocked" };
      }
      if (state.dustCents < costCents) return { accepted: false, reason: "insufficient-dust" };
      if (!spendDust(costCents)) return { accepted: false, reason: "insufficient-dust" };
      state.unlocks.purchasedCosmetics.push(id);
      return {
        dustSpentCents: costCents,
        unlockType: "cosmetic",
        unlockId: id,
        cosmeticSlot: slot,
      };
    }, true);
  }

  function setMarkedCards(ids) {
    if (!Array.isArray(ids)) return rejected("invalid-marked-cards");
    var normalized = normalizeKnownIdList(ids, ALL_CARD_IDS).filter(function (id) {
      return !NON_DRAFT_CARD_LOOKUP[id];
    });
    return commit("setMarkedCards", function () {
      if (state.unlocks.purchasedCards.length < MARKED_CARD_REQUIRED_UNLOCKS) {
        return { accepted: false, reason: "marked-deck-locked" };
      }
      if (normalized.length !== MARKED_CARD_COUNT || normalized.length !== ids.length) {
        return { accepted: false, reason: "marked-card-count" };
      }
      for (var i = 0; i < normalized.length; i++) {
        // Marked Deck is durable career state. A playtest entitlement must
        // never make a card look owned to this persistence path.
        if (!isPersistedCardUnlocked(normalized[i])) {
          return { accepted: false, reason: "card-locked" };
        }
      }
      state.unlocks.markedCards = normalized.slice();
      return { markedCards: normalized };
    }, true);
  }

  function selectCosmetic(slot, id) {
    slot = String(slot || "");
    id = normalizeId(id);
    var spec = getCosmeticSpec(slot, id);
    if (slot !== "cowboy" && slot !== "hat") return rejected("unknown-cosmetic-slot");
    if (!spec) return rejected("unknown-cosmetic");
    if (TEST_ALL_ACCESS) {
      if (!testRuntimeCosmetics) resetTestRuntimeAccess();
      var runtimeProperty = slot === "cowboy" ? "cowboyId" : "hatId";
      if (testRuntimeCosmetics[runtimeProperty] === id) {
        return rejected("already-selected");
      }
      testRuntimeCosmetics[runtimeProperty] = id;
      var runtimeSnapshot = getSnapshot();
      var runtimeResult = {
        accepted: true,
        reason: "",
        dustAddedCents: 0,
        dustSpentCents: 0,
        cosmeticSlot: slot,
        cosmeticId: id,
        snapshot: runtimeSnapshot,
      };
      notifySubscribers(runtimeSnapshot, "selectCosmetic");
      return runtimeResult;
    }
    return commit("selectCosmetic", function () {
      if (!isCosmeticSpecUnlockedForState(spec, state)) {
        return { accepted: false, reason: "cosmetic-locked" };
      }
      var property = slot === "cowboy" ? "cowboyId" : "hatId";
      if (state.cosmetics[property] === id) {
        return { accepted: false, reason: "already-selected" };
      }
      state.cosmetics[property] = id;
      return {
        cosmeticSlot: slot,
        cosmeticId: id,
      };
    }, true);
  }

  function selectCosmeticProfile(source) {
    source = source && typeof source === "object" ? source : {};
    var cowboyId = normalizeId(source.cowboyId || source.bodyId);
    var hatId = normalizeId(source.hatId);
    var cowboySpec = COWBOY_COSMETICS_BY_ID[cowboyId];
    var hatSpec = HAT_COSMETICS_BY_ID[hatId];
    if (!cowboySpec || !hatSpec) return rejected("unknown-cosmetic");
    if (TEST_ALL_ACCESS) {
      if (!testRuntimeCosmetics) resetTestRuntimeAccess();
      if (
        testRuntimeCosmetics.cowboyId === cowboyId &&
        testRuntimeCosmetics.hatId === hatId
      ) {
        return rejected("already-selected");
      }
      testRuntimeCosmetics = {
        cowboyId: cowboyId,
        hatId: hatId,
      };
      var runtimeSnapshot = getSnapshot();
      var runtimeProfile = getCosmeticProfile();
      var runtimeResult = {
        accepted: true,
        reason: "",
        dustAddedCents: 0,
        dustSpentCents: 0,
        cosmeticProfile: runtimeProfile,
        snapshot: runtimeSnapshot,
      };
      notifySubscribers(runtimeSnapshot, "selectCosmeticProfile");
      return runtimeResult;
    }
    return commit("selectCosmeticProfile", function () {
      if (
        !isCosmeticSpecUnlockedForState(cowboySpec, state) ||
        !isCosmeticSpecUnlockedForState(hatSpec, state)
      ) {
        return { accepted: false, reason: "cosmetic-locked" };
      }
      if (
        state.cosmetics.cowboyId === cowboyId &&
        state.cosmetics.hatId === hatId
      ) {
        return { accepted: false, reason: "already-selected" };
      }
      state.cosmetics.cowboyId = cowboyId;
      state.cosmetics.hatId = hatId;
      return {
        cosmeticProfile: {
          cowboyId: cowboyId,
          hatId: hatId,
        },
      };
    }, true);
  }

  function getChallengeRewards(challengeId) {
    var rewards = [];
    function scan(specs, slot) {
      for (var i = 0; i < specs.length; i++) {
        var requirement = specs[i].requirement || {};
        if (requirement.type === "challenge" && requirement.id === challengeId) {
          rewards.push({
            slot: slot,
            id: specs[i].id,
            label: localizeCatalogField("cosmetic", specs[i].id, "label", specs[i].label),
          });
        }
      }
    }
    scan(COWBOY_COSMETIC_SPECS, "cowboy");
    scan(HAT_COSMETIC_SPECS, "hat");
    return rewards;
  }

  function getChallenges() {
    return CHALLENGE_SPECS.map(function (spec) {
      var completedAt = state.challenges.completed[spec.id] || null;
      return {
        id: spec.id,
        group: spec.group,
        bossKind: spec.bossKind || "",
        classId: spec.classId || "",
        title: localizeCatalogField("challenge", spec.id, "title", spec.title),
        description: localizeCatalogField("challenge", spec.id, "description", spec.description),
        target: spec.target || 1,
        completed: !!completedAt,
        completedAt: completedAt,
        pinned: state.challenges.pinnedId === spec.id,
        rewards: getChallengeRewards(spec.id),
      };
    });
  }

  function isChallengeCompleted(id) {
    return !!state.challenges.completed[String(id || "")];
  }

  function getPinnedChallengeId() {
    return state.challenges.pinnedId;
  }

  function recordChallengeCompleted(id) {
    id = normalizeId(id);
    if (!CHALLENGES_BY_ID[id]) return rejected("unknown-challenge");
    return commit("challengeCompleted", function () {
      if (state.challenges.completed[id]) {
        return { accepted: false, reason: "already-completed" };
      }
      state.challenges.completed[id] = new Date().toISOString();
      return { challengeId: id };
    });
  }

  function setPinnedChallenge(id) {
    id = normalizeId(id);
    if (id && !CHALLENGES_BY_ID[id]) return rejected("unknown-challenge");
    return commit("pinChallenge", function () {
      if (state.challenges.pinnedId === id) {
        return { accepted: false, reason: "already-pinned" };
      }
      state.challenges.pinnedId = id;
      return { challengeId: id };
    }, true);
  }

  function addZombieDust(kills, multiplier) {
    kills = toCounter(kills);
    if (!kills) return 0;
    var previousRemainder = state.zombieKillRemainder;
    var total = safeAdd(previousRemainder, kills);
    var batches = Math.floor(total / 10);
    var remainder = total % 10;
    var perKillRewardUnits =
      ZOMBIE_DUST_CENTS_PER_KILL *
      toCounter(multiplier == null ? 100 : multiplier);
    if (!batches) {
      state.zombieKillRemainder = total;
      state.zombieKillRemainderRewardUnits = safeAdd(
        state.zombieKillRemainderRewardUnits,
        kills * perKillRewardUnits
      );
      state.zombieKillRemainderCents = Math.round(
        state.zombieKillRemainderRewardUnits / ZOMBIE_REWARD_UNITS_PER_CENT
      );
      return 0;
    }
    var completedNewKills = Math.max(0, kills - remainder);
    var payoutRewardUnits = safeAdd(
      state.zombieKillRemainderRewardUnits,
      completedNewKills * perKillRewardUnits
    );
    state.zombieKillRemainder = remainder;
    state.zombieKillRemainderRewardUnits = remainder * perKillRewardUnits;
    state.zombieKillRemainderCents = Math.round(
      state.zombieKillRemainderRewardUnits / ZOMBIE_REWARD_UNITS_PER_CENT
    );
    return addDust(
      Math.round(payoutRewardUnits / ZOMBIE_REWARD_UNITS_PER_CENT),
      100
    );
  }

  function hasKnownValue(values, value) {
    return values.indexOf(value) !== -1;
  }

  function normalizeWeaponType(sourceType) {
    var source = String(sourceType || "");
    if (source === "revolver") return "revolver";
    if (source === "rifle" || source === "rifleLightning" || source === "rifleTrap") return "rifle";
    if (
      source === "launcher" ||
      source === "launcherExplosion" ||
      source === "launcherShrapnel" ||
      source === "launcherFire" ||
      source === "launcherFireShard"
    ) return "launcher";
    if (source === "coachGun") return "coachGun";
    return "";
  }

  function recordSoloKill(enemyType, sourceType) {
    enemyType = String(enemyType || "");
    if (!hasKnownValue(ENEMY_TYPES, enemyType)) return rejected("unknown-enemy-type");
    var weaponType = normalizeWeaponType(sourceType);
    return commit("soloKill", function () {
      state.stats.killsTotal = safeAdd(state.stats.killsTotal, 1);
      state.stats.killsByType[enemyType] = safeAdd(state.stats.killsByType[enemyType], 1);
      if (weaponType) {
        state.stats.killsByWeapon[weaponType] = safeAdd(state.stats.killsByWeapon[weaponType], 1);
      }
      return {
        dustAddedCents: addZombieDust(1, 100),
        completionMetrics: [
          "killsTotal",
          "killsByType." + enemyType,
          weaponType ? "killsByWeapon." + weaponType : "",
        ],
      };
    });
  }

  function recordSoloBoss(kind) {
    kind = String(kind || "");
    if (!hasKnownValue(BOSS_TYPES, kind)) return rejected("unknown-boss-kind");
    return commit("soloBoss", function () {
      state.stats.bossesByType[kind] = safeAdd(state.stats.bossesByType[kind], 1);
      return {
        dustAddedCents: addDust(BOSS_DUST_CENTS, 100),
        completionMetrics: ["bossesByType." + kind],
      };
    });
  }

  function normalizeWave(value) {
    var wave = Number(value);
    if (!Number.isInteger(wave) || wave < 1 || wave > 100000) return 0;
    return wave;
  }

  function recordSoloWave(wave) {
    wave = normalizeWave(wave);
    if (!wave) return rejected("invalid-wave");
    return commit("soloWave", function () {
      state.stats.wavesCompleted = safeAdd(state.stats.wavesCompleted, 1);
      state.stats.highestWave = Math.max(state.stats.highestWave, wave);
      return {
        dustAddedCents: addDust(wave * WAVE_DUST_CENTS_PER_NUMBER, 100),
        completionMetrics: ["wavesCompleted", "highestWave"],
      };
    });
  }

  function normalizePickupKind(kind) {
    kind = String(kind || "");
    if (kind === "xp" || kind === "xpOrb" || kind === "xpOrbs") return "xpOrbs";
    if (kind === "ammo" || kind === "ammoCrate" || kind === "ammoCrates") return "ammoCrates";
    return "";
  }

  function recordPickup(kind, count) {
    var pickupKind = normalizePickupKind(kind);
    if (!pickupKind) return rejected("unknown-pickup-kind");
    var amount = count == null ? 1 : toCounter(count);
    if (!amount) return rejected("invalid-pickup-count");
    return commit("pickup", function () {
      state.stats.pickups[pickupKind] = safeAdd(state.stats.pickups[pickupKind], amount);
      return {
        dustAddedCents: 0,
        completionMetrics: ["pickups." + pickupKind],
      };
    });
  }

  function normalizeMasteryMetrics(source) {
    return normalizeKnownCounterMap(source, MASTERY_METRICS);
  }

  function addMasteryMetrics(metrics) {
    for (var i = 0; i < MASTERY_METRICS.length; i++) {
      var key = MASTERY_METRICS[i];
      state.stats.mastery[key] = safeAdd(state.stats.mastery[key], metrics[key]);
    }
  }

  function recordSoloMastery(metrics, receiptId) {
    receiptId = normalizeId(receiptId);
    if (!receiptId) return rejected("missing-receipt-id");
    if (state.masteryReceiptIds.indexOf(receiptId) !== -1) return rejected("duplicate-receipt");
    var normalizedMetrics = normalizeMasteryMetrics(metrics);
    return commit("soloMastery", function () {
      addMasteryMetrics(normalizedMetrics);
      state.masteryReceiptIds.push(receiptId);
      if (state.masteryReceiptIds.length > MASTERY_RECEIPT_LIMIT) {
        state.masteryReceiptIds.splice(0, state.masteryReceiptIds.length - MASTERY_RECEIPT_LIMIT);
      }
      return {
        receiptId: receiptId,
        dustAddedCents: 0,
        completionMetrics: MASTERY_CONTRACT_METRICS,
      };
    });
  }

  function normalizeTypeCounts(source, knownTypes) {
    return normalizeKnownCounterMap(source, knownTypes);
  }

  function normalizeWeaponCounts(source) {
    var result = createCounterMap(WEAPON_TYPES);
    if (!source || typeof source !== "object") return result;
    Object.keys(source).forEach(function (sourceType) {
      var family = normalizeWeaponType(sourceType);
      if (!family && hasKnownValue(WEAPON_TYPES, sourceType)) family = sourceType;
      if (!family) return;
      result[family] = safeAdd(result[family], source[sourceType]);
    });
    return result;
  }

  function sumCounterMap(source, keys) {
    var total = 0;
    for (var i = 0; i < keys.length; i++) total = safeAdd(total, source[keys[i]]);
    return total;
  }

  function normalizeCompletedWaves(source) {
    if (!Array.isArray(source)) return [];
    var result = [];
    var seen = Object.create(null);
    var limit = Math.min(source.length, 1000);
    for (var i = 0; i < limit; i++) {
      var wave = normalizeWave(source[i]);
      if (!wave || seen[wave]) continue;
      seen[wave] = true;
      result.push(wave);
    }
    return result;
  }

  function settleMultiplayerMatch(summary) {
    if (!summary || typeof summary !== "object") return rejected("invalid-summary");
    var matchId = normalizeId(summary.matchId);
    if (!matchId) return rejected("missing-match-id");
    if (state.settledMatchIds.indexOf(matchId) !== -1) return rejected("duplicate-match");

    var placement = summary.placement;
    if (!Number.isInteger(placement) || placement < 1 || placement > 4) {
      return rejected("invalid-placement");
    }

    var multiplier = PLACE_MULTIPLIERS[placement - 1];
    var killsByType = normalizeTypeCounts(summary.killsByType, ENEMY_TYPES);
    var killsByWeapon = normalizeWeaponCounts(summary.killsByWeapon);
    var bossesByType = normalizeTypeCounts(summary.bossesByType, BOSS_TYPES);
    var completedWaves = normalizeCompletedWaves(summary.completedWaves);
    var mastery = normalizeMasteryMetrics(summary.mastery);
    var typeKillTotal = sumCounterMap(killsByType, ENEMY_TYPES);
    var weaponKillTotal = sumCounterMap(killsByWeapon, WEAPON_TYPES);
    var zombieKills = Math.max(typeKillTotal, weaponKillTotal);
    var bossTotal = sumCounterMap(bossesByType, BOSS_TYPES);
    var playerKills = toCounter(summary.playerKills);
    var revives = toCounter(summary.revives);
    var xpOrbs = toCounter(summary.xpOrbs);
    var ammoCrates = toCounter(summary.ammoCrates);
    var won = summary.won === true;

    return commit("multiplayerMatch", function () {
      var dustAddedCents = 0;
      var i;

      state.stats.killsTotal = safeAdd(state.stats.killsTotal, zombieKills);
      for (i = 0; i < ENEMY_TYPES.length; i++) {
        var enemyType = ENEMY_TYPES[i];
        state.stats.killsByType[enemyType] = safeAdd(
          state.stats.killsByType[enemyType],
          killsByType[enemyType]
        );
      }
      for (i = 0; i < WEAPON_TYPES.length; i++) {
        var weaponType = WEAPON_TYPES[i];
        state.stats.killsByWeapon[weaponType] = safeAdd(
          state.stats.killsByWeapon[weaponType],
          killsByWeapon[weaponType]
        );
      }
      for (i = 0; i < BOSS_TYPES.length; i++) {
        var bossType = BOSS_TYPES[i];
        state.stats.bossesByType[bossType] = safeAdd(
          state.stats.bossesByType[bossType],
          bossesByType[bossType]
        );
      }

      state.stats.wavesCompleted = safeAdd(state.stats.wavesCompleted, completedWaves.length);
      for (i = 0; i < completedWaves.length; i++) {
        state.stats.highestWave = Math.max(state.stats.highestWave, completedWaves[i]);
      }

      addMasteryMetrics(mastery);
      state.stats.pickups.xpOrbs = safeAdd(state.stats.pickups.xpOrbs, xpOrbs);
      state.stats.pickups.ammoCrates = safeAdd(state.stats.pickups.ammoCrates, ammoCrates);
      state.stats.multiplayer.matches = safeAdd(state.stats.multiplayer.matches, 1);
      state.stats.multiplayer.playerKills = safeAdd(state.stats.multiplayer.playerKills, playerKills);
      state.stats.multiplayer.revives = safeAdd(state.stats.multiplayer.revives, revives);
      if (won) state.stats.multiplayer.wins = safeAdd(state.stats.multiplayer.wins, 1);
      if (placement === 1) {
        state.stats.multiplayer.firstPlaces = safeAdd(state.stats.multiplayer.firstPlaces, 1);
      }

      dustAddedCents += addZombieDust(zombieKills, multiplier);
      if (bossTotal) dustAddedCents += addDust(bossTotal * BOSS_DUST_CENTS, multiplier);
      for (i = 0; i < completedWaves.length; i++) {
        dustAddedCents += addDust(
          completedWaves[i] * WAVE_DUST_CENTS_PER_NUMBER,
          multiplier
        );
      }

      state.settledMatchIds.push(matchId);
      if (state.settledMatchIds.length > SETTLED_MATCH_LIMIT) {
        state.settledMatchIds.splice(0, state.settledMatchIds.length - SETTLED_MATCH_LIMIT);
      }

      return {
        matchId: matchId,
        placement: placement,
        multiplier: multiplier / 100,
        dustAddedCents: dustAddedCents,
      };
    });
  }

  function resetForTest() {
    if (persistTimer) {
      global.clearTimeout(persistTimer);
      persistTimer = 0;
    }
    persistDirty = false;
    state = createEmptyState();
    resetTestRuntimeAccess();
    var storage = getStorage();
    if (storage) {
      try {
        storage.removeItem(STORAGE_KEY);
      } catch (error) {
        // The in-memory reset is still valid when storage is unavailable.
      }
    }
    var snapshot = getSnapshot();
    notifySubscribers(snapshot, "resetForTest");
    return snapshot;
  }

  function grantDustForTest(cents) {
    cents = toCounter(cents);
    if (!cents) return rejected("invalid-dust");
    return commit("grantDustForTest", function () {
      return { dustAddedCents: addDust(cents, 100) };
    });
  }

  function unlockAllForTest() {
    return commit("unlockAllForTest", function () {
      state.unlocks = createLegacyUnlockState();
      state.unlocks.purchasedCosmetics = PURCHASABLE_COSMETIC_IDS.slice();
      return { unlockType: "all", unlockId: "all" };
    });
  }

  var state = loadState();
  refreshCompletionTimestamps();
  resetTestRuntimeAccess();
  persistState();
  if (global.addEventListener) {
    global.addEventListener("pagehide", flushScheduledPersistence);
    global.addEventListener("beforeunload", flushScheduledPersistence);
    global.addEventListener("storage", function (event) {
      if (!event || event.key !== STORAGE_KEY) return;
      // Never replace progress that this tab has earned but has not written
      // yet. Flush it first and let that newer write become the shared value.
      if (persistDirty) {
        flushScheduledPersistence();
        return;
      }
      try {
        state = event.newValue
          ? normalizeState(JSON.parse(event.newValue))
          : createEmptyState();
        refreshCompletionTimestamps();
        resetTestRuntimeAccess();
        notifySubscribers(getSnapshot(), "externalSync");
      } catch (error) {
        // Ignore a partial/corrupt external write and keep the valid local copy.
      }
    });
  }
  if (global.document && global.document.addEventListener) {
    global.document.addEventListener("visibilitychange", function () {
      if (global.document.hidden) flushScheduledPersistence();
    });
    global.document.addEventListener("freeze", flushScheduledPersistence);
  }

  global.DustAndDeadProgression = Object.freeze({
    getSnapshot: getSnapshot,
    getContracts: getContracts,
    getUnlockCatalog: getUnlockCatalog,
    getUnlockProfile: getUnlockProfile,
    normalizeUnlockProfile: normalizeUnlockProfile,
    getCosmeticCatalog: getCosmeticCatalog,
    getCosmeticProfile: getCosmeticProfile,
    normalizeCosmeticProfile: normalizeCosmeticProfile,
    getChallenges: getChallenges,
    isChallengeCompleted: isChallengeCompleted,
    getPinnedChallengeId: getPinnedChallengeId,
    recordChallengeCompleted: recordChallengeCompleted,
    setPinnedChallenge: setPinnedChallenge,
    formatDust: formatDust,
    isClassUnlocked: isClassUnlocked,
    isBranchUnlocked: isBranchUnlocked,
    isCardUnlocked: isCardUnlocked,
    isCosmeticUnlocked: isCosmeticUnlocked,
    getCardDraftWeight: getCardDraftWeight,
    purchaseClass: purchaseClass,
    purchaseCard: purchaseCard,
    purchaseCosmetic: purchaseCosmetic,
    setMarkedCards: setMarkedCards,
    selectCosmetic: selectCosmetic,
    selectCosmeticProfile: selectCosmeticProfile,
    recordSoloKill: recordSoloKill,
    recordSoloBoss: recordSoloBoss,
    recordSoloWave: recordSoloWave,
    recordPickup: recordPickup,
    recordSoloMastery: recordSoloMastery,
    settleMultiplayerMatch: settleMultiplayerMatch,
    resetForTest: resetForTest,
    grantDustForTest: grantDustForTest,
    unlockAllForTest: unlockAllForTest,
    subscribe: subscribe,
  });
})(window);
