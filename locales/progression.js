(function (global) {
  "use strict";

  var i18n = global.DustAndDeadI18n;
  if (!i18n || typeof i18n.registerPack !== "function") {
    throw new Error("locales/progression.js requires DustAndDeadI18n to be loaded first.");
  }

  var LOCALES = ["en", "ru", "hi"];
  var ROMAN_TIERS = ["I", "II", "III"];
  var messages = {
    en: Object.create(null),
    ru: Object.create(null),
    hi: Object.create(null),
  };
  var contractIds = [];

  function localized(en, ru, hi) {
    return { en: en, ru: ru, hi: hi };
  }

  function put(key, values) {
    for (var localeIndex = 0; localeIndex < LOCALES.length; localeIndex++) {
      var locale = LOCALES[localeIndex];
      if (Object.prototype.hasOwnProperty.call(messages[locale], key)) {
        throw new Error("Duplicate progression locale key: " + key);
      }
      messages[locale][key] = values[locale];
    }
  }

  function addContract(id, title, description) {
    if (contractIds.indexOf(id) !== -1) {
      throw new Error("Duplicate progression contract id: " + id);
    }
    contractIds.push(id);
    put("contract." + id + ".title", title);
    put("contract." + id + ".description", description);
  }

  function addTieredContracts(prefix, title, targets, description) {
    if (!Array.isArray(targets) || targets.length !== ROMAN_TIERS.length) {
      throw new Error("Tiered progression contract requires exactly three targets: " + prefix);
    }
    for (var tierIndex = 0; tierIndex < ROMAN_TIERS.length; tierIndex++) {
      var tierTitle = {};
      for (var localeIndex = 0; localeIndex < LOCALES.length; localeIndex++) {
        var locale = LOCALES[localeIndex];
        tierTitle[locale] = title[locale] + " " + ROMAN_TIERS[tierIndex];
      }
      addContract(prefix + "." + (tierIndex + 1), tierTitle, description);
    }
  }

  var enemyNames = {
    walker: localized("Walker", "Ходок", "भटकता ज़ॉम्बी"),
    runner: localized("Runner", "Бегун", "धावक"),
    fastZombie: localized("Fast Zombie", "Быстрый зомби", "तेज़ ज़ॉम्बी"),
    brute: localized("Brute", "Громила", "दरिंदा"),
    spitter: localized("Spitter", "Плевальщик", "ज़हर थूकने वाला"),
    armoredMiner: localized("Armored Miner", "Бронированный шахтёр", "बख़्तरबंद खनिक"),
    gravePreacher: localized("Grave Preacher", "Могильный проповедник", "कब्र-उपदेशक"),
  };

  Object.keys(enemyNames).forEach(function (enemyId) {
    put("enemy." + enemyId + ".label", enemyNames[enemyId]);
  });

  var bossNames = {
    bellRinger: localized("Bell Ringer", "Звонарь", "घंटीवाला"),
    ghostTrain: localized("Ghost Train", "Призрачный поезд", "भूतिया ट्रेन"),
    oilBaron: localized("Oil Baron", "Нефтяной барон", "तेल का बैरन"),
    slothArchbishop: localized(
      "Sloth Archbishop",
      "Архиепископ Лени",
      "आलस्य का महाधर्माध्यक्ष"
    ),
    hordeheart: localized("Hordeheart", "Сердце Орды", "झुंड का हृदय"),
    landEater: localized("Land-Eater", "Пожиратель Земли", "धरती-भक्षक"),
    doppelganger: localized("Doppelganger", "Двойник", "हमशक्ल"),
  };

  Object.keys(bossNames).forEach(function (bossId) {
    put("boss." + bossId + ".name", bossNames[bossId]);
  });

  addTieredContracts(
    "hunt.any",
    localized("Clearout", "Зачистка", "सफ़ाया"),
    [100, 750, 3000],
    localized(
      "Kill {target} zombies of any kind.",
      "Убейте {target} зомби любого типа.",
      "किसी भी प्रकार के {target} ज़ॉम्बियों को मार गिराएँ।"
    )
  );

  addTieredContracts(
    "hunt.walker",
    localized("Walker Hunt", "Охота на ходоков", "भटकते ज़ॉम्बियों का शिकार"),
    [100, 500, 2000],
    localized(
      "Kill {target} walkers.",
      "Убейте {target} ходоков.",
      "{target} भटकते ज़ॉम्बियों को मार गिराएँ।"
    )
  );
  addTieredContracts(
    "hunt.runner",
    localized("Runner Hunt", "Охота на бегунов", "धावकों का शिकार"),
    [50, 250, 1000],
    localized(
      "Kill {target} runners.",
      "Убейте {target} бегунов.",
      "{target} धावक ज़ॉम्बियों को मार गिराएँ।"
    )
  );
  addTieredContracts(
    "hunt.fastZombie",
    localized("Fast Zombie Hunt", "Охота на быстрых зомби", "तेज़ ज़ॉम्बियों का शिकार"),
    [25, 125, 500],
    localized(
      "Kill {target} fast zombies.",
      "Убейте {target} быстрых зомби.",
      "{target} तेज़ ज़ॉम्बियों को मार गिराएँ।"
    )
  );
  addTieredContracts(
    "hunt.brute",
    localized("Brute Hunt", "Охота на громил", "दरिंदों का शिकार"),
    [25, 125, 500],
    localized(
      "Kill {target} brutes.",
      "Убейте {target} громил.",
      "{target} दरिंदों को मार गिराएँ।"
    )
  );
  addTieredContracts(
    "hunt.spitter",
    localized("Spitter Hunt", "Охота на плевальщиков", "ज़हर थूकने वालों का शिकार"),
    [20, 100, 400],
    localized(
      "Kill {target} spitters.",
      "Убейте {target} плевальщиков.",
      "{target} ज़हर थूकने वाले ज़ॉम्बियों को मार गिराएँ।"
    )
  );
  addTieredContracts(
    "hunt.armoredMiner",
    localized(
      "Armored Miner Hunt",
      "Охота на бронированных шахтёров",
      "बख़्तरबंद खनिकों का शिकार"
    ),
    [10, 50, 150],
    localized(
      "Kill {target} armored miners.",
      "Убейте {target} бронированных шахтёров.",
      "{target} बख़्तरबंद खनिकों को मार गिराएँ।"
    )
  );
  addTieredContracts(
    "hunt.gravePreacher",
    localized(
      "Grave Preacher Hunt",
      "Охота на могильных проповедников",
      "कब्र-उपदेशकों का शिकार"
    ),
    [5, 30, 120],
    localized(
      "Kill {target} grave preachers.",
      "Убейте {target} могильных проповедников.",
      "{target} कब्र-उपदेशकों को मार गिराएँ।"
    )
  );

  addTieredContracts(
    "arsenal.revolver",
    localized("Revolver Mastery", "Мастер револьвера", "रिवॉल्वर की महारत"),
    [100, 500, 2000],
    localized(
      "Score {target} kills with the revolver.",
      "Совершите {target} убийств из револьвера.",
      "रिवॉल्वर से {target} दुश्मनों को मार गिराएँ।"
    )
  );
  addTieredContracts(
    "arsenal.rifle",
    localized("Winchester Mastery", "Мастер винчестера", "विनचेस्टर की महारत"),
    [100, 500, 2000],
    localized(
      "Score {target} kills with the Winchester.",
      "Совершите {target} убийств из винчестера.",
      "विनचेस्टर से {target} दुश्मनों को मार गिराएँ।"
    )
  );
  addTieredContracts(
    "arsenal.launcher",
    localized("Grenade Launcher Mastery", "Мастер гранатомёта", "ग्रेनेड लॉन्चर की महारत"),
    [100, 500, 2000],
    localized(
      "Score {target} kills with the grenade launcher.",
      "Совершите {target} убийств из гранатомёта.",
      "ग्रेनेड लॉन्चर से {target} दुश्मनों को मार गिराएँ।"
    )
  );
  addTieredContracts(
    "arsenal.coachGun",
    localized("Coach Gun Mastery", "Мастер двустволки", "डबल बैरल बंदूक की महारत"),
    [100, 500, 2000],
    localized(
      "Score {target} kills with the Coach Gun.",
      "Совершите {target} убийств из двустволки.",
      "डबल बैरल बंदूक से {target} दुश्मनों को मार गिराएँ।"
    )
  );

  addContract(
    "mastery.dualReloads",
    localized("Fair and Square", "Всё по-честному", "बराबरी का मुकाबला"),
    localized(
      "Earn {target} free reloads with Dual Revolvers.",
      "Заработайте {target} бесплатных перезарядок парных револьверов.",
      "दो रिवॉल्वर से {target} मुफ़्त रीलोड अर्जित करें।"
    )
  );
  addContract(
    "mastery.bigIronRuptures",
    localized("Heavy Rupture", "Разрыв навылет", "भारी विदारण"),
    localized(
      "Trigger {target} ruptures with Big Iron.",
      "Вызовите {target} разрывов «Большим стволом».",
      "बिग आयरन से {target} विदारण कराएँ।"
    )
  );
  addContract(
    "mastery.rifleLightning",
    localized("Stormfront", "Грозовой фронт", "तूफ़ानी मोर्चा"),
    localized(
      "Strike {target} enemies with Winchester lightning.",
      "Поразите {target} врагов молниями винчестера.",
      "विनचेस्टर की बिजली से {target} दुश्मनों को झटका दें।"
    )
  );
  addContract(
    "mastery.rifleTraps",
    localized("Trail Master", "Хозяин тропы", "पगडंडी का उस्ताद"),
    localized(
      "Trigger {target} Winchester traps.",
      "Активируйте {target} ловушек винчестера.",
      "विनचेस्टर के {target} फंदे सक्रिय करें।"
    )
  );
  addContract(
    "mastery.chainDetonations",
    localized("Chain Reaction", "Цепная реакция", "श्रृंखलाबद्ध धमाका"),
    localized(
      "Trigger {target} chain detonations.",
      "Вызовите {target} цепных детонаций.",
      "{target} श्रृंखलाबद्ध धमाके कराएँ।"
    )
  );
  addContract(
    "mastery.fireKills",
    localized("Scorched Earth", "Выжженная земля", "झुलसी धरती"),
    localized(
      "Kill {target} enemies with grenade-launcher fire.",
      "Убейте {target} врагов огнём гранатомёта.",
      "ग्रेनेड लॉन्चर की आग से {target} दुश्मनों को मार गिराएँ।"
    )
  );
  addContract(
    "mastery.bounties",
    localized("Heaven's Bounty", "Небесная награда", "स्वर्ग का इनाम"),
    localized(
      "Claim {target} bounties as the Marshal.",
      "Заберите {target} наград, играя за маршала.",
      "मार्शल के रूप में {target} इनाम हासिल करें।"
    )
  );
  addContract(
    "mastery.paleDeputy",
    localized("Pale Deputy", "Бледный помощник", "धवल डिप्टी"),
    localized(
      "Have Pale Deputy kill {target} enemies.",
      "Пусть Бледный помощник убьёт {target} врагов.",
      "धवल डिप्टी से {target} दुश्मनों को मरवाएँ।"
    )
  );

  var bossContractSpecs = [
    {
      id: "bellRinger",
      veteranTarget: 5,
      ruObject: "Звонаря",
      hiObject: "घंटीवाले",
    },
    {
      id: "ghostTrain",
      veteranTarget: 5,
      ruObject: "Призрачный поезд",
      hiObject: "भूतिया ट्रेन",
    },
    {
      id: "oilBaron",
      veteranTarget: 5,
      ruObject: "Нефтяного барона",
      hiObject: "तेल के बैरन",
    },
    {
      id: "slothArchbishop",
      veteranTarget: 5,
      ruObject: "Архиепископа Лени",
      hiObject: "आलस्य के महाधर्माध्यक्ष",
    },
    {
      id: "hordeheart",
      veteranTarget: 5,
      ruObject: "Сердце Орды",
      hiObject: "झुंड के हृदय",
    },
    {
      id: "landEater",
      veteranTarget: 5,
      ruObject: "Пожирателя Земли",
      hiObject: "धरती-भक्षक",
    },
    {
      id: "doppelganger",
      veteranTarget: 3,
      ruObject: "Двойника",
      hiObject: "हमशक्ल",
    },
  ];

  bossContractSpecs.forEach(function (boss) {
    var name = bossNames[boss.id];
    addContract(
      "boss." + boss.id + ".1",
      localized(
        name.en + ": First Victory",
        name.ru + ": первая победа",
        name.hi + ": पहली जीत"
      ),
      localized(
        "Defeat the " + name.en + " once.",
        "Одолейте " + boss.ruObject + " один раз.",
        boss.hiObject + " को एक बार हराएँ।"
      )
    );
    addContract(
      "boss." + boss.id + ".2",
      localized(
        name.en + ": Seasoned Hunter",
        name.ru + ": опытный охотник",
        name.hi + ": अनुभवी शिकारी"
      ),
      localized(
        "Defeat the " + name.en + " {target} times.",
        "Одолейте " +
          boss.ruObject +
          " {target} " +
          (boss.veteranTarget === 3 ? "раза." : "раз."),
        boss.hiObject + " को {target} बार हराएँ।"
      )
    );
  });

  addTieredContracts(
    "journey.waves",
    localized("The Long Road", "Долгая дорога", "लंबा सफ़र"),
    [10, 50, 200],
    localized(
      "Complete {target} waves in total.",
      "Завершите суммарно {target} волн.",
      "कुल {target} लहरें पूरी करें।"
    )
  );
  addTieredContracts(
    "journey.highestWave",
    localized("Beyond the Horizon", "За горизонт", "क्षितिज के पार"),
    [10, 20, 30],
    localized(
      "Reach wave {target} in a single run.",
      "Достигните волны {target} за один забег.",
      "एक ही शिकार में {target}वीं लहर तक पहुँचें।"
    )
  );
  addContract(
    "journey.xpOrbs",
    localized("Experience Seeker", "Искатель опыта", "अनुभव-संग्राहक"),
    localized(
      "Collect {target} experience orbs.",
      "Подберите {target} сфер опыта.",
      "अनुभव के {target} गोले इकट्ठा करें।"
    )
  );
  addContract(
    "journey.ammoCrates",
    localized("Well-Stocked", "Запасливый стрелок", "भरपूर भंडार"),
    localized(
      "Collect {target} ammo crates.",
      "Подберите {target} ящиков боеприпасов.",
      "गोला-बारूद की {target} पेटियाँ इकट्ठा करें।"
    )
  );

  addContract(
    "multiplayer.matches.1",
    localized("Riding Together I", "В одной упряжке I", "साथ-साथ सवारी I"),
    localized(
      "Complete {target} multiplayer matches.",
      "Завершите {target} матчей с другими игроками.",
      "{target} मल्टीप्लेयर मैच पूरे करें।"
    )
  );
  addContract(
    "multiplayer.matches.2",
    localized("Riding Together II", "В одной упряжке II", "साथ-साथ सवारी II"),
    localized(
      "Complete {target} multiplayer matches.",
      "Завершите {target} матчей с другими игроками.",
      "{target} मल्टीप्लेयर मैच पूरे करें।"
    )
  );
  addContract(
    "multiplayer.firstPlace.1",
    localized("First Among Equals I", "Первый среди равных I", "बराबरों में अव्वल I"),
    localized(
      "Finish first in one multiplayer match.",
      "Один раз займите первое место в матче с другими игроками.",
      "एक मल्टीप्लेयर मैच में पहला स्थान पाएँ।"
    )
  );
  addContract(
    "multiplayer.firstPlace.2",
    localized("First Among Equals II", "Первый среди равных II", "बराबरों में अव्वल II"),
    localized(
      "Finish first in {target} multiplayer matches.",
      "Займите первое место в {target} матчах с другими игроками.",
      "{target} मल्टीप्लेयर मैचों में पहला स्थान पाएँ।"
    )
  );
  addContract(
    "multiplayer.revives.1",
    localized("Not Over Yet I", "Ещё не конец I", "अभी अंत नहीं I"),
    localized(
      "Return to the fight {target} times after being knocked out.",
      "Успешно вернитесь в бой после нокаута {target} раза.",
      "गिराए जाने के बाद {target} बार फिर लड़ाई में लौटें।"
    )
  );
  addContract(
    "multiplayer.revives.2",
    localized("Not Over Yet II", "Ещё не конец II", "अभी अंत नहीं II"),
    localized(
      "Return to the fight {target} times after being knocked out.",
      "Успешно вернитесь в бой после нокаута {target} раз.",
      "गिराए जाने के बाद {target} बार फिर लड़ाई में लौटें।"
    )
  );

  var classLabels = {
    gunslinger: localized("Gunslinger", "Стрелок", "बंदूकबाज़"),
    ranger: localized("Ranger", "Следопыт", "सीमांत प्रहरी"),
    demolitionist: localized("Demolitionist", "Подрывник", "विस्फोटक विशेषज्ञ"),
    marshal: localized("Marshal", "Маршал", "मार्शल"),
  };
  Object.keys(classLabels).forEach(function (classId) {
    put("class." + classId + ".label", classLabels[classId]);
  });

  var branchLabels = {
    dualRevolvers: localized("Dual Revolvers", "Парные револьверы", "दो रिवॉल्वर"),
    bigIron: localized("Big Iron", "Большой ствол", "बिग आयरन"),
    leverBarrage: localized("Lever Barrage", "Рычажный шквал", "लीवर की बौछार"),
    trailWarden: localized("Trail Warden", "Страж тропы", "पगडंडी का रक्षक"),
    bombardier: localized("Bombardier", "Бомбардир", "बमवर्षक"),
    pyrotechnician: localized("Pyrotechnician", "Пиротехник", "अग्नि विशेषज्ञ"),
    breachMarshal: localized("Breach Marshal", "Штурмовой маршал", "धावा मार्शल"),
    graveWarden: localized("Grave Warden", "Страж могил", "कब्र का रक्षक"),
  };
  Object.keys(branchLabels).forEach(function (branchId) {
    put("branch." + branchId + ".label", branchLabels[branchId]);
  });

  var cosmetics = [
    {
      id: "trailwornDrifter",
      label: localized("Trailworn Drifter", "Скиталец пыльных дорог", "राह-थका घुमक्कड़"),
      description: localized(
        "Sun-faded leather and road-worn denim from the first long ride.",
        "Выцветшая кожа и потёртый дорожной пылью деним — память о первом долгом пути.",
        "पहली लंबी यात्रा की धूप से फीका पड़ा चमड़ा और राह में घिसा मोटा सूती कपड़ा।"
      ),
      requirement: localized("Starter outfit", "Стартовый костюм", "शुरुआती पोशाक"),
    },
    {
      id: "ashenProspector",
      label: localized("Ashen Prospector", "Пепельный старатель", "राख-लिपटा खनिक"),
      description: localized(
        "Soot-dark canvas, copper trim and the stubborn look of a deep-shaft survivor.",
        "Почерневшая от сажи парусина, медная отделка и упрямый взгляд того, кто выбрался из глубокой шахты.",
        "कालिख से काला कैनवास, ताँबे की सजावट और गहरी खदान से जीवित लौटे खनिक की ज़िद्दी झलक।"
      ),
      requirement: localized(
        "Complete {count} contracts",
        "Завершите {count} контрактов",
        "{count} अनुबंध पूरे करें"
      ),
    },
    {
      id: "mesaRanger",
      label: localized("Mesa Ranger", "Страж плато", "पठारी प्रहरी"),
      description: localized(
        "Sage cloth and pale leather made for watching a very long horizon.",
        "Ткань цвета шалфея и светлая кожа для тех, кто подолгу смотрит за горизонт.",
        "धूसर-हरा कपड़ा और हल्का चमड़ा, दूर क्षितिज पर नज़र रखने वालों के लिए।"
      ),
      requirement: localized(
        "Complete {count} contracts",
        "Завершите {count} контрактов",
        "{count} अनुबंध पूरे करें"
      ),
    },
    {
      id: "crimsonLawman",
      label: localized("Crimson Lawman", "Багровый законник", "सुर्ख़ कानूनपाल"),
      description: localized(
        "A black duster, a red trail scarf and no patience for frontier disorder.",
        "Чёрный плащ-пыльник, красный шейный платок и никакого терпения к беспорядку на фронтире.",
        "काला लंबा कोट, लाल गले का रूमाल और सरहद की बदइंतज़ामी के लिए कोई धैर्य नहीं।"
      ),
      requirement: localized(
        "Complete {count} contracts",
        "Завершите {count} контрактов",
        "{count} अनुबंध पूरे करें"
      ),
    },
    {
      id: "moonlitOutlaw",
      label: localized("Moonlit Outlaw", "Лунный бандит", "चाँदनी का बाग़ी"),
      description: localized(
        "Midnight blue, silver fittings and a coat that disappears after sundown.",
        "Полуночная синева, серебряная отделка и плащ, который растворяется в сумерках.",
        "आधी रात-सा नीला रंग, चाँदी की सजावट और सूरज ढलते ही ओझल होता कोट।"
      ),
      requirement: localized(
        "Complete {count} contracts",
        "Завершите {count} контрактов",
        "{count} अनुबंध पूरे करें"
      ),
    },
    {
      id: "gildedLegend",
      label: localized("Gilded Legend", "Легенда в золоте", "सुनहरी दास्तान"),
      description: localized(
        "Ivory cloth and frontier gold reserved for a name every contract board knows.",
        "Ткань цвета слоновой кости и золото фронтира — для имени, знакомого каждой доске контрактов.",
        "हाथीदाँत-सा कपड़ा और सरहद का सोना, उस नाम के लिए जिसे हर अनुबंध-पट्ट जानता है।"
      ),
      requirement: localized(
        "Complete {count} contracts",
        "Завершите {count} контрактов",
        "{count} अनुबंध पूरे करें"
      ),
    },
    {
      id: "baronsBlackGold",
      label: localized("Baron's Black Gold", "Чёрное золото барона", "बैरन का काला सोना"),
      description: localized(
        "The oil king's tar-soaked coat and brass fittings, stripped from him at the derrick.",
        "Просмолённый плащ и латунная отделка нефтяного короля, снятые с него у самой вышки.",
        "तेल के राजा का तारकोल में डूबा कोट और पीतल की सजावट, उसी तेल-मीनार पर उससे छीने गए।"
      ),
      requirement: localized(
        "Defeat the Oil Baron",
        "Одолейте Нефтяного барона",
        "तेल के बैरन को हराएँ"
      ),
    },
    {
      id: "livingBarrow",
      label: localized("Living Barrow", "Живой Курган", "जीवित टीला"),
      description: localized(
        "A torn crimson cloak, bone pauldrons and a dim heart that still keeps the horde's beat.",
        "Рваный багровый плащ, костяные наплечники и тускло пульсирующее сердце, всё ещё бьющееся в ритме орды.",
        "फटा गहरा लाल लबादा, हड्डी के कंधे-कवच और मद्धम धड़कता दिल, जो अब भी झुंड की ताल पर चलता है।"
      ),
      requirement: localized(
        "Challenge: One Heartbeat",
        "Испытание: Одним сердцебиением",
        "चुनौती: एक धड़कन में"
      ),
    },
    {
      id: "lastSurveyor",
      label: localized("The Last Surveyor", "Последний Землемер", "आख़िरी सर्वेयर"),
      description: localized(
        "A sand-colored duster scarred like a map of every acre the Land-Eater never got.",
        "Песочный плащ-пыльник со шрамами-картой всех земель, что не достались Пожирателю.",
        "रेत के रंग का लंबा कोट, जिसके निशान उस हर एकड़ का नक्शा हैं जो धरती-भक्षक को कभी नहीं मिला।"
      ),
      requirement: localized(
        "Challenge: Not One Acre",
        "Испытание: Ни пяди земли",
        "चुनौती: एक इंच ज़मीन नहीं"
      ),
    },
    {
      id: "shatteredReflection",
      label: localized("Shattered Reflection", "Разбитое отражение", "टूटा अक्स"),
      description: localized(
        "A black-and-white suit split down the middle, tailored by a mirror that lost.",
        "Чёрно-белый костюм, рассечённый надвое, — его скроило зеркало, которое проиграло.",
        "बीच से बँटा काला-सफ़ेद सूट, जिसे उस आईने ने सिला जो हार गया।"
      ),
      requirement: localized(
        "Challenge: Shattered Reflection",
        "Испытание: Разбитое отражение",
        "चुनौती: टूटा अक्स"
      ),
    },
    {
      id: "lastParishVestments",
      label: localized("Last Parish Vestments", "Ряса Последнего Прихода", "आख़िरी गिरजे का चोग़ा"),
      description: localized(
        "A black cassock bound with gold ropes, worn by the one who never flinched at the bell.",
        "Чёрная ряса с золотыми канатами — для того, кто ни разу не дрогнул под колоколом.",
        "सुनहरी रस्सियों से बँधा काला चोग़ा, उसके लिए जो घंटी की गूँज पर कभी नहीं काँपा।"
      ),
      requirement: localized(
        "Challenge: Perfect Silence",
        "Испытание: Идеальная тишина",
        "चुनौती: मुकम्मल ख़ामोशी"
      ),
    },
    {
      id: "doomConductor",
      label: localized("Conductor of Doom", "Кондуктор Погибели", "क़यामत का कंडक्टर"),
      description: localized(
        "A deep-blue conductor's tunic whose coattails trail like locomotive steam.",
        "Тёмно-синий мундир кондуктора, фалды которого стелются, как паровозный пар.",
        "गहरे नीले रंग की कंडक्टर वर्दी, जिसके पिछले सिरे इंजन की भाप की तरह लहराते हैं।"
      ),
      requirement: localized(
        "Challenge: Terminal Station",
        "Испытание: Конечная станция",
        "चुनौती: आख़िरी स्टेशन"
      ),
    },
    {
      id: "vigilVestments",
      label: localized("Vestments of the Vigil", "Ряса Неусыпного", "जागते पहरे का चोग़ा"),
      description: localized(
        "Violet-and-white robes with open palms on the shoulders. No prayer went to waste.",
        "Фиолетово-белое облачение с раскрытыми ладонями на наплечниках. Ни одна молитва не пропала зря.",
        "बैंगनी-सफ़ेद चोग़ा, कंधों पर खुली हथेलियाँ। एक भी दुआ बेकार नहीं गई।"
      ),
      requirement: localized(
        "Challenge: No Empty Prayers",
        "Испытание: Ни одной пустой молитвы",
        "चुनौती: कोई दुआ ख़ाली नहीं"
      ),
    },
    {
      id: "smokingDuelist",
      label: localized("Smoking Duelist", "Дымящийся дуэлянт", "धुआँ उड़ाता द्वंद्वबाज़"),
      description: localized(
        "A duelist's suit with mismatched sleeves and two holsters that never stop smoking.",
        "Костюм дуэлянта с разными рукавами и двумя кобурами, которые никогда не перестают дымиться.",
        "अलग-अलग आस्तीनों वाला द्वंद्वबाज़ का सूट और दो होल्स्टर, जिनसे धुआँ उठना कभी नहीं रुकता।"
      ),
      requirement: localized(
        "Challenge: Exactly Twelve",
        "Испытание: Ровно двенадцать",
        "चुनौती: ठीक बारह"
      ),
    },
    {
      id: "stormPoncho",
      label: localized("Thunderhead Poncho", "Грозовое пончо", "तूफ़ानी पोंचो"),
      description: localized(
        "A midnight-blue poncho hemmed with silver lightning that answers to the rifle.",
        "Тёмно-синее пончо с серебряными молниями по краям, послушными винчестеру.",
        "गहरे नीले रंग का पोंचो, किनारों पर चाँदी की बिजलियाँ जो राइफ़ल की पुकार पर चमकती हैं।"
      ),
      requirement: localized(
        "Challenge: Storm over the Prairie",
        "Испытание: Гроза над прерией",
        "चुनौती: मैदान पर तूफ़ान"
      ),
    },
    {
      id: "powderSaint",
      label: localized("Powder Saint", "Пороховой святой", "बारूद का संत"),
      description: localized(
        "A scorched cloak and a dynamite bandolier, blessed by one very long fuse.",
        "Обгоревший плащ и динамитная перевязь, благословлённые одним очень длинным фитилём.",
        "झुलसा हुआ लबादा और डायनामाइट की पेटी, जिन्हें एक बहुत लंबे फ़्यूज़ ने आशीर्वाद दिया है।"
      ),
      requirement: localized(
        "Challenge: One Fuse",
        "Испытание: Один фитиль",
        "चुनौती: एक फ़्यूज़"
      ),
    },
    {
      id: "trailMaster",
      label: localized("Trail Master", "Хозяин тропы", "पगडंडी का उस्ताद"),
      description: localized(
        "A hunter's cloak hung with sprung traps and a jaw-toothed hat band to match.",
        "Охотничий плащ, увешанный сработавшими капканами, и зубчатая шляпная лента им под стать.",
        "शिकारी का लबादा, जिस पर चले हुए फंदे टँगे हैं, और उसी अंदाज़ का दाँतेदार टोपी-फीता।"
      ),
      requirement: localized(
        "Challenge: Master of the Trail",
        "Испытание: Хозяин тропы",
        "चुनौती: पगडंडी का उस्ताद"
      ),
    },
    {
      id: "palePosse",
      label: localized("Pale Posse", "Бледный отряд", "भुतहा दस्ता"),
      description: localized(
        "A ghost-grey duster pinned with three faintly glimmering marshal stars.",
        "Призрачно-серый плащ с тремя тускло мерцающими звёздами маршала.",
        "भूतिया धूसर कोट, जिस पर मार्शल के तीन हल्के टिमटिमाते सितारे टँके हैं।"
      ),
      requirement: localized(
        "Challenge: Pale Posse",
        "Испытание: Бледный отряд",
        "चुनौती: भुतहा दस्ता"
      ),
    },
    {
      id: "oneGunCreed",
      label: localized("One-Gun Creed", "Кредо одного ствола", "एक बंदूक का उसूल"),
      description: localized(
        "A faded trail suit with a single worn holster. One gun was always going to be enough.",
        "Выцветший походный костюм с единственной потёртой кобурой. Одного ствола всегда было достаточно.",
        "फीका पड़ा सफ़री सूट और एक ही घिसा होल्स्टर। एक बंदूक हमेशा काफ़ी थी।"
      ),
      requirement: localized(
        "Challenge: One Gun, One Fate",
        "Испытание: Один ствол — одна судьба",
        "चुनौती: एक बंदूक, एक तक़दीर"
      ),
    },
    {
      id: "silverGhost",
      label: localized("Silver Ghost", "Серебряный призрак", "चाँदी का भूत"),
      description: localized(
        "A polished silver-and-black suit with cold eyes. Everyone at the table knows what it means.",
        "Полированный серебристо-чёрный костюм и холодный взгляд. Все за столом знают, что это значит.",
        "चमकाया हुआ चाँदी-काला सूट और ठंडी निगाहें। मेज़ पर बैठे सब जानते हैं कि इसका क्या मतलब है।"
      ),
      requirement: localized(
        "Challenge: Silver Ghost",
        "Испытание: Серебряный призрак",
        "चुनौती: चाँदी का भूत"
      ),
    },
    {
      id: "bullionTycoon",
      label: localized("Bullion Tycoon", "Золотой магнат", "सोने का रईस"),
      description: localized(
        "Every seam plated in frontier gold. Bought outright, and it shows.",
        "Каждый шов покрыт золотом фронтира. Куплено за наличные — и это заметно.",
        "हर सिलाई पर सरहद का सोना चढ़ा है। सीधे खरीद लिया गया, और यह दिखता है।"
      ),
      requirement: localized(
        "Buy for {cost} Dust",
        "Купите за {cost} Пыли",
        "{cost} धूल में खरीद लें"
      ),
    },
    {
      id: "weatheredCattleman",
      label: localized("Weathered Cattleman", "Потёртая ковбойская шляпа", "घिसी काउबॉय टोपी"),
      description: localized(
        "The dependable brown hat that has seen every kind of bad weather.",
        "Надёжная коричневая шляпа, повидавшая любую непогоду.",
        "भरोसेमंद भूरी टोपी, जिसने हर तरह का खराब मौसम देखा है।"
      ),
      requirement: localized("Starter hat", "Стартовая шляпа", "शुरुआती टोपी"),
    },
    {
      id: "gamblersBlack",
      label: localized("Gambler's Black", "Чёрная шляпа картёжника", "जुआरी की काली टोपी"),
      description: localized(
        "A low black crown with a wine-red band for dangerous tables.",
        "Низкая чёрная тулья с винно-красной лентой для самых опасных столов.",
        "खतरनाक बाज़ियों के लिए नीची काली टोपी और गहरे लाल रंग का फीता।"
      ),
      requirement: localized(
        "Complete {count} contracts",
        "Завершите {count} контракта",
        "{count} अनुबंध पूरे करें"
      ),
    },
    {
      id: "prairieWhite",
      label: localized("Prairie White", "Белая шляпа прерий", "मैदान की सफ़ेद टोपी"),
      description: localized(
        "Bright felt and a blue band, visible from the far side of the range.",
        "Светлый фетр и синяя лента — такую шляпу видно с другого края равнины.",
        "चमकीला फ़ेल्ट और नीला फीता, जिसे मैदान के दूसरे छोर से भी देखा जा सके।"
      ),
      requirement: localized(
        "Complete {count} contracts",
        "Завершите {count} контрактов",
        "{count} अनुबंध पूरे करें"
      ),
    },
    {
      id: "marshalStar",
      label: localized("Marshal's Star", "Звезда маршала", "मार्शल का सितारा"),
      description: localized(
        "A stern charcoal crown pinned with a small frontier star.",
        "Строгая тёмно-серая шляпа с маленькой звездой фронтира.",
        "कोयले-सी गहरी टोपी, जिस पर सरहद का छोटा सितारा जड़ा है।"
      ),
      requirement: localized(
        "Complete {count} contracts",
        "Завершите {count} контракта",
        "{count} अनुबंध पूरे करें"
      ),
    },
    {
      id: "undertaker",
      label: localized("Undertaker", "Гробовщик", "कब्रसाज़"),
      description: localized(
        "Tall, narrow and black as the last page in the burial ledger.",
        "Высокая, узкая и чёрная, как последняя страница погребальной книги.",
        "ऊँची, सँकरी और दफ़न-रजिस्टर के आख़िरी पन्ने जितनी काली।"
      ),
      requirement: localized(
        "Complete {count} contracts",
        "Завершите {count} контрактов",
        "{count} अनुबंध पूरे करें"
      ),
    },
    {
      id: "railmanCap",
      label: localized("Railman's Cap", "Фуражка путейца", "रेलकर्मी की टोपी"),
      description: localized(
        "The Ghost Train's brass-marked cap, claimed at the end of the line.",
        "Фуражка с латунным знаком Призрачного поезда, добытая в конце пути.",
        "भूतिया ट्रेन की पीतल-निशान वाली टोपी, पटरी के आख़िरी छोर पर जीती गई।"
      ),
      requirement: localized(
        "Defeat the Ghost Train",
        "Одолейте Призрачный поезд",
        "भूतिया ट्रेन को हराएँ"
      ),
    },
    {
      id: "barrowCrown",
      label: localized("Barrow Crown", "Корона Кургана", "टीले का मुकुट"),
      description: localized(
        "A crown of bone spurs pulled from the Hordeheart's burial mound.",
        "Венец из костяных шипов, вырванных из могильного кургана Сердца Орды.",
        "हड्डी के काँटों का मुकुट, जो झुंड के हृदय के कब्र वाले टीले से उखाड़ा गया।"
      ),
      requirement: localized(
        "Defeat the Hordeheart",
        "Одолейте Сердце Орды",
        "झुंड के हृदय को हराएँ"
      ),
    },
    {
      id: "surveyorsCap",
      label: localized("Surveyor's Cap", "Картуз Землемера", "सर्वेयर की टोपी"),
      description: localized(
        "A sand-bleached cap with a map-scarred band, issued for land that no longer exists.",
        "Выгоревший на солнце картуз с лентой-картой, выданный для земли, которой больше нет.",
        "धूप में फीकी पड़ी टोपी और नक्शे-से कटे-फटे निशानों वाला फीता, उस ज़मीन के लिए जारी जो अब है ही नहीं।"
      ),
      requirement: localized(
        "Defeat the Land-Eater",
        "Одолейте Пожирателя Земли",
        "धरती-भक्षक को हराएँ"
      ),
    },
    {
      id: "mirrorHalfMask",
      label: localized("Mirror Half-Mask", "Зеркальная полумаска", "आईने का आधा नक़ाब"),
      description: localized(
        "A cracked mirror half-mask worn where a hat should be. The reflection blinked first.",
        "Треснувшая зеркальная полумаска на месте шляпы. Отражение моргнуло первым.",
        "टोपी की जगह पहना आईने का चटका आधा नक़ाब। अक्स ने पहले पलक झपकाई।"
      ),
      requirement: localized(
        "Defeat the Doppelganger",
        "Одолейте Двойника",
        "हमशक्ल को हराएँ"
      ),
    },
    {
      id: "brokenTopper",
      label: localized("Baron's Broken Topper", "Сломанный цилиндр Барона", "बैरन की टूटी ऊँची टोपी"),
      description: localized(
        "A tall top hat cracked at the crown, ringed in brass and streaked with crude oil.",
        "Высокий цилиндр с расколотой тульей, опоясанный латунной короной и залитый потёками нефти.",
        "चोटी से चटकी ऊँची टोपी, जिस पर पीतल का घेरा और कच्चे तेल की धारियाँ हैं।"
      ),
      requirement: localized(
        "Challenge: No Deals",
        "Испытание: Никаких сделок",
        "चुनौती: कोई सौदा नहीं"
      ),
    },
    {
      id: "fuseHalo",
      label: localized("Fuse Halo", "Нимб-фитиль", "जलते फ़्यूज़ का मुकुट"),
      description: localized(
        "A smoldering fuse bent into a halo. It never quite burns down.",
        "Тлеющий фитиль, согнутый в нимб. Он никогда не догорает до конца.",
        "सुलगता फ़्यूज़, जिसे मुकुट की तरह मोड़ा गया है। यह कभी पूरा नहीं जलता।"
      ),
      requirement: localized(
        "Challenge: One Fuse",
        "Испытание: Один фитиль",
        "चुनौती: एक फ़्यूज़"
      ),
    },
    {
      id: "bellCrown",
      label: localized("Bell Crown", "Колокольный венец", "घंटी का मुकुट"),
      description: localized(
        "A burnished bell worn as a crown. Its silence proves the Bell Ringer fell.",
        "Начищенный колокол вместо короны. Его тишина доказывает, что Звонарь повержен.",
        "मुकुट की तरह पहनी चमकाई हुई घंटी। उसकी ख़ामोशी घंटीवाले की हार का सबूत है।"
      ),
      requirement: localized(
        "Defeat the Bell Ringer",
        "Одолейте Звонаря",
        "घंटीवाले को हराएँ"
      ),
    },
    {
      id: "archbishopMitre",
      label: localized("Archbishop's Mitre", "Митра архиепископа", "महाधर्माध्यक्ष का मुकुट"),
      description: localized(
        "The Sloth Archbishop's tall mitre, still heavy with the sermon nobody finished.",
        "Высокая митра Архиепископа Лени, всё ещё тяжёлая от недочитанной проповеди.",
        "आलस्य के महाधर्माध्यक्ष का ऊँचा मुकुट, उस उपदेश के बोझ से अब भी भारी जो कभी पूरा नहीं हुआ।"
      ),
      requirement: localized(
        "Defeat the Sloth Archbishop",
        "Одолейте Архиепископа Лени",
        "आलस्य के महाधर्माध्यक्ष को हराएँ"
      ),
    },
  ];

  cosmetics.forEach(function (cosmetic) {
    put("cosmetic." + cosmetic.id + ".label", cosmetic.label);
    put("cosmetic." + cosmetic.id + ".description", cosmetic.description);
    put("cosmetic." + cosmetic.id + ".requirement", cosmetic.requirement);
  });

  // Challenges: one-shot skill feats. Ids mirror progression.js CHALLENGE_SPECS.
  var challenges = [
    {
      id: "boss.hordeheart.heartbeat",
      title: localized("One Heartbeat", "Одним сердцебиением", "एक धड़कन में"),
      description: localized(
        "Destroy all four final fragments of the Hordeheart within 25 seconds of the first one falling.",
        "Уничтожьте четыре финальных фрагмента Сердца Орды за 25 секунд после гибели первого.",
        "पहले टुकड़े के गिरने के 25 सेकंड के भीतर झुंड के हृदय के चारों आख़िरी टुकड़े नष्ट कर दें।"
      ),
    },
    {
      id: "boss.landEater.untouched",
      title: localized("Not One Acre", "Ни пяди земли", "एक इंच ज़मीन नहीं"),
      description: localized(
        "Defeat the Land-Eater without taking any damage for the whole fight.",
        "Победите Пожирателя Земли, не получив урона за весь бой.",
        "पूरी लड़ाई में बिना कोई चोट खाए धरती-भक्षक को हराएँ।"
      ),
    },
    {
      id: "boss.doppelganger.shattered",
      title: localized("Shattered Reflection", "Разбитое отражение", "टूटा अक्स"),
      description: localized(
        "Let the scout become the Doppelganger — then defeat it.",
        "Дайте разведчику превратиться в Двойника — и победите его.",
        "जासूस को हमशक्ल बनने दें — और फिर उसे हरा दें।"
      ),
    },
    {
      id: "boss.bellRinger.silence",
      title: localized("Perfect Silence", "Идеальная тишина", "मुकम्मल ख़ामोशी"),
      description: localized(
        "Survive every toll of the Bell Ringer correctly: no step, no shot, no reload under the bell.",
        "Переживите каждый звон Звонаря правильно: ни шага, ни выстрела, ни перезарядки под ударом колокола.",
        "घंटीवाले की हर गूँज सही ढंग से झेलें: घंटी के नीचे न कोई कदम, न कोई गोली, न कोई रीलोड।"
      ),
    },
    {
      id: "boss.ghostTrain.lastStop",
      title: localized("Terminal Station", "Конечная станция", "आख़िरी स्टेशन"),
      description: localized(
        "Break every coupling of the Ghost Train and dodge every wagon blast.",
        "Разорвите все сцепки Призрачного поезда и не попадите ни под один взрыв вагона.",
        "भूतिया ट्रेन की हर कड़ी तोड़ें और हर डिब्बे के धमाके से बचें।"
      ),
    },
    {
      id: "boss.oilBaron.noDeals",
      title: localized("No Deals", "Никаких сделок", "कोई सौदा नहीं"),
      description: localized(
        "Refuse the Baron's gold, dodge the whole starfall and defeat him.",
        "Не берите золото Барона, избегите всего звездопада и победите его.",
        "बैरन का सोना ठुकराएँ, पूरे सितारों की बौछार से बचें और उसे हराएँ।"
      ),
    },
    {
      id: "boss.slothArchbishop.noPrayers",
      title: localized("No Empty Prayers", "Ни одной пустой молитвы", "कोई दुआ ख़ाली नहीं"),
      description: localized(
        "Defeat the Archbishop without a single shot of yours blocked by the palms.",
        "Победите Архиепископа так, чтобы ладони не заблокировали ни один ваш выстрел.",
        "महाधर्माध्यक्ष को ऐसे हराएँ कि हथेलियाँ आपकी एक भी गोली न रोक पाएँ।"
      ),
    },
    {
      id: "class.gunslinger.exactlyTwelve",
      title: localized("Exactly Twelve", "Ровно двенадцать", "ठीक बारह"),
      description: localized(
        "Score 12 kills with 12 consecutive revolver shots without a single miss.",
        "Совершите 12 убийств 12 последовательными выстрелами из револьвера, не промахнувшись.",
        "रिवॉल्वर की लगातार 12 गोलियों से 12 दुश्मन गिराएँ, एक भी निशाना चूके बिना।"
      ),
    },
    {
      id: "class.ranger.prairieStorm",
      title: localized("Storm over the Prairie", "Гроза над прерией", "मैदान पर तूफ़ान"),
      description: localized(
        "Strike 12 different enemies with rifle lightning within a single wave.",
        "Поразите винтовочной молнией 12 разных врагов за одну волну.",
        "एक ही लहर के भीतर राइफ़ल की बिजली से 12 अलग-अलग दुश्मनों पर वार करें।"
      ),
    },
    {
      id: "class.demolitionist.oneFuse",
      title: localized("One Fuse", "Один фитиль", "एक फ़्यूज़"),
      description: localized(
        "Kill 15 enemies with a single chain detonation.",
        "Убейте 15 врагов одной цепной детонацией.",
        "एक ही चेन धमाके से 15 दुश्मनों को मार गिराएँ।"
      ),
    },
    {
      id: "class.ranger.trailMaster",
      title: localized("Master of the Trail", "Хозяин тропы", "पगडंडी का उस्ताद"),
      description: localized(
        "Destroy 25 enemies with traps without firing a single shot after the first trap springs.",
        "Уничтожьте 25 врагов ловушками, не сделав ни одного выстрела после срабатывания первой.",
        "पहला फंदा चलने के बाद एक भी गोली चलाए बिना फंदों से 25 दुश्मनों को ख़त्म करें।"
      ),
    },
    {
      id: "class.marshal.palePosse",
      title: localized("Pale Posse", "Бледный отряд", "भुतहा दस्ता"),
      description: localized(
        "Have three Pale Deputies standing at the moment a boss falls.",
        "Держите трёх Бледных помощников одновременно в момент победы над боссом.",
        "जिस पल बॉस गिरे, उस पल आपके तीन पीले सहायक खड़े हों।"
      ),
    },
    {
      id: "class.any.oneGun",
      title: localized("One Gun, One Fate", "Один ствол — одна судьба", "एक बंदूक, एक तक़दीर"),
      description: localized(
        "Reach wave 15 using only your class's starting weapon.",
        "Дойдите до 15-й волны, используя только стартовое оружие выбранного класса.",
        "सिर्फ़ अपने वर्ग के शुरुआती हथियार से लहर 15 तक पहुँचें।"
      ),
    },
    {
      id: "rare.silverGhost",
      title: localized("Silver Ghost", "Серебряный призрак", "चाँदी का भूत"),
      description: localized(
        "Defeat any boss without taking any damage during the fight.",
        "Победите любого босса, не получив урона за время боя.",
        "किसी भी बॉस को लड़ाई के दौरान बिना कोई चोट खाए हराएँ।"
      ),
    },
  ];
  challenges.forEach(function (challenge) {
    put("challenge." + challenge.id + ".title", challenge.title);
    put("challenge." + challenge.id + ".description", challenge.description);
  });

  function assertLocalePack() {
    var expectedKeyCount = 300;
    var referenceKeys = Object.keys(messages.en).sort();
    if (referenceKeys.length !== expectedKeyCount) {
      throw new Error(
        "Progression locale pack must contain " +
          expectedKeyCount +
          " keys per locale; found " +
          referenceKeys.length +
          "."
      );
    }

    for (var localeIndex = 0; localeIndex < LOCALES.length; localeIndex++) {
      var locale = LOCALES[localeIndex];
      var keys = Object.keys(messages[locale]).sort();
      if (keys.length !== referenceKeys.length) {
        throw new Error("Progression locale key count differs for locale: " + locale);
      }
      for (var keyIndex = 0; keyIndex < referenceKeys.length; keyIndex++) {
        if (keys[keyIndex] !== referenceKeys[keyIndex]) {
          throw new Error("Progression locale key set differs for locale: " + locale);
        }
        var value = messages[locale][keys[keyIndex]];
        if (typeof value !== "string" || !value.trim()) {
          throw new Error(
            "Progression locale value must be a non-empty string: " +
              locale +
              " / " +
              keys[keyIndex]
          );
        }
      }
    }

    if (contractIds.length !== 72) {
      throw new Error(
        "Progression locale pack must contain 72 contracts; found " +
          contractIds.length +
          "."
      );
    }

    for (var contractIndex = 0; contractIndex < contractIds.length; contractIndex++) {
      var contractId = contractIds[contractIndex];
      for (var localeIndex = 0; localeIndex < LOCALES.length; localeIndex++) {
        var locale = LOCALES[localeIndex];
        var titleKey = "contract." + contractId + ".title";
        var descriptionKey = "contract." + contractId + ".description";
        if (!messages[locale][titleKey] || !messages[locale][descriptionKey]) {
          throw new Error(
            "Missing localized contract title or description: " +
              locale +
              " / " +
              contractId
          );
        }
      }
      if (
        !/[\u0900-\u097f]/.test(messages.hi["contract." + contractId + ".title"]) ||
        !/[\u0900-\u097f]/.test(messages.hi["contract." + contractId + ".description"])
      ) {
        throw new Error("Hindi contract copy must contain Devanagari: " + contractId);
      }
      if (
        /[\u0400-\u04ff\u0900-\u097f]/.test(
          messages.en["contract." + contractId + ".title"] +
            messages.en["contract." + contractId + ".description"]
        )
      ) {
        throw new Error("English contract copy contains non-English script: " + contractId);
      }
    }

    if (challenges.length !== 14) {
      throw new Error(
        "Progression locale pack must contain 14 challenges; found " +
          challenges.length +
          "."
      );
    }
    for (var challengeIndex = 0; challengeIndex < challenges.length; challengeIndex++) {
      var challengeId = challenges[challengeIndex].id;
      if (
        !/[ऀ-ॿ]/.test(messages.hi["challenge." + challengeId + ".title"]) ||
        !/[ऀ-ॿ]/.test(messages.hi["challenge." + challengeId + ".description"])
      ) {
        throw new Error("Hindi challenge copy must contain Devanagari: " + challengeId);
      }
      if (
        /[Ѐ-ӿऀ-ॿ]/.test(
          messages.en["challenge." + challengeId + ".title"] +
            messages.en["challenge." + challengeId + ".description"]
        )
      ) {
        throw new Error("English challenge copy contains non-English script: " + challengeId);
      }
    }

    return {
      keysPerLocale: referenceKeys.length,
      contracts: contractIds.length,
      contractFieldsPerLocale: contractIds.length * 2,
      classes: Object.keys(classLabels).length,
      branches: Object.keys(branchLabels).length,
      cosmetics: cosmetics.length,
      cosmeticFieldsPerLocale: cosmetics.length * 3,
      challenges: challenges.length,
      challengeFieldsPerLocale: challenges.length * 2,
      enemies: Object.keys(enemyNames).length,
      bosses: Object.keys(bossNames).length,
    };
  }

  assertLocalePack();
  i18n.registerPack({
    id: "progression",
    messages: messages,
  });
})(window);
