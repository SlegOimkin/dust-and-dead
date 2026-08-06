(function (global) {
  "use strict";

  var i18n = global.DustAndDeadI18n;
  if (!i18n || typeof i18n.registerPack !== "function") {
    throw new Error("locales/gameplay.js requires DustAndDeadI18n to be loaded first.");
  }

  var LOCALES = ["en", "ru", "hi"];
  var messages = {
    en: Object.create(null),
    ru: Object.create(null),
    hi: Object.create(null),
  };
  var aliases = {
    "THE LAND-EATER · LAST ACRE": "boss.landEater.hudName",
    "THE OIL BARON · KING OF BLACK GOLD": "boss.oilBaron.hudName",
    "THE BELL RINGER · LAST PARISH": "boss.bellRinger.hudName",
    "THE LAST TRAIN TO PERDITION": "boss.ghostTrain.hudName",
    "YOU???": "boss.doppelganger.hudName",
  };
  var upgradeIds = [];
  var masteryFallbackIds = [];

  function localized(en, ru, hi) {
    return { en: en, ru: ru, hi: hi };
  }

  function put(key, values) {
    for (var localeIndex = 0; localeIndex < LOCALES.length; localeIndex++) {
      var locale = LOCALES[localeIndex];
      if (Object.prototype.hasOwnProperty.call(messages[locale], key)) {
        throw new Error("Duplicate gameplay locale key: " + key);
      }
      messages[locale][key] = values[locale];
    }
  }

  function addLabel(domain, id, label) {
    put(domain + "." + id + ".label", label);
  }

  function addUpgrade(id, title, description, subtitle) {
    if (upgradeIds.indexOf(id) !== -1) {
      throw new Error("Duplicate gameplay upgrade id: " + id);
    }
    upgradeIds.push(id);
    put("upgrade." + id + ".title", title);
    put("upgrade." + id + ".description", description);
    if (subtitle) put("upgrade." + id + ".subtitle", subtitle);
  }

  function addMasteryFallback(id, title, description) {
    masteryFallbackIds.push(id);
    put("masteryFallback." + id + ".title", title);
    put("masteryFallback." + id + ".description", description);
  }

  addLabel("weapon", "revolver", localized("Revolver", "Револьвер", "रिवॉल्वर"));
  addLabel("weapon", "rifle", localized("Winchester", "Винчестер", "विनचेस्टर"));
  addLabel("weapon", "launcher", localized("Launcher", "Гранатомёт", "ग्रेनेड लॉन्चर"));
  addLabel("weapon", "coachGun", localized("Coach Gun", "Двустволка", "डबल बैरल बंदूक"));

  addLabel("class", "gunslinger", localized("Gunslinger", "Стрелок", "बंदूकबाज़"));
  addLabel("class", "ranger", localized("Ranger", "Следопыт", "सीमांत प्रहरी"));
  addLabel("class", "demolitionist", localized("Demolitionist", "Подрывник", "विस्फोटक विशेषज्ञ"));
  addLabel("class", "marshal", localized("Marshal", "Маршал", "मार्शल"));

  addLabel("branch", "dualRevolvers", localized("Dual Revolvers", "Парные револьверы", "दो रिवॉल्वर"));
  addLabel("branch", "bigIron", localized("Big Iron", "Большой ствол", "बिग आयरन"));
  addLabel("branch", "leverBarrage", localized("Lever Barrage", "Рычажный шквал", "लीवर की बौछार"));
  addLabel("branch", "trailWarden", localized("Trail Warden", "Страж тропы", "पगडंडी का रक्षक"));
  addLabel("branch", "bombardier", localized("Bombardier", "Бомбардир", "बमवर्षक"));
  addLabel("branch", "pyrotechnician", localized("Pyrotechnician", "Пиротехник", "अग्नि विशेषज्ञ"));
  addLabel("branch", "breachMarshal", localized("Breach Marshal", "Штурмовой маршал", "धावा मार्शल"));
  addLabel("branch", "graveWarden", localized("Grave Warden", "Страж могил", "कब्र का रक्षक"));

  addUpgrade(
    "swiftBoots",
    localized("Swift Boots", "Сапоги-скороходы", "फुर्तीले जूते"),
    localized("+5% move speed. No cap.", "+5% к скорости движения. Без ограничения.", "चलने की गति +5%। कोई सीमा नहीं।")
  );
  addUpgrade(
    "steadyHand",
    localized("Steady Hand", "Твёрдая рука", "स्थिर हाथ"),
    localized("+10% damage for every weapon.", "+10% к урону всего оружия.", "हर हथियार का नुकसान +10%।")
  );
  addUpgrade(
    "quickReload",
    localized("Quick Reload", "Быстрая перезарядка", "तेज़ रीलोड"),
    localized("+12% faster reloads.", "Перезарядка быстрее на 12%.", "रीलोड 12% तेज़ होता है।")
  );
  addUpgrade(
    "hairTrigger",
    localized("Hair Trigger", "Чуткий спуск", "हल्का ट्रिगर"),
    localized("+8% faster shooting.", "Стрельба быстрее на 8%.", "गोली चलाने की गति +8%।")
  );
  addUpgrade(
    "scavengerLuck",
    localized("Scavenger's Luck", "Удача старателя", "खोजी की किस्मत"),
    localized("+10% ammo from every crate.", "На 10% больше боеприпасов из каждого ящика.", "हर पेटी से 10% अधिक गोलियाँ मिलती हैं।")
  );
  addUpgrade(
    "grit",
    localized("Grit", "Закалка", "हौसला"),
    localized("+15 max HP and heal 15.", "+15 к максимуму ОЗ и сразу восстанавливает 15 ОЗ.", "अधिकतम स्वास्थ्य +15 और तुरंत 15 स्वास्थ्य बहाल होता है।")
  );
  addUpgrade(
    "desertMender",
    localized("Desert Mender", "Пустынный лекарь", "रेगिस्तानी वैद्य"),
    localized("+0.4 HP regenerated each second.", "Восстанавливает 0,4 здоровья в секунду.", "हर सेकंड 0.4 स्वास्थ्य वापस मिलता है।")
  );
  addUpgrade(
    "luckyMagnet",
    localized("Lucky Magnet", "Магнит удачи", "भाग्यशाली चुंबक"),
    localized("+25% XP pickup and pull reach.", "Радиус подбора и притяжения опыта +25%.", "XP उठाने और खींचने की दूरी +25%।")
  );
  addUpgrade(
    "xpHunger",
    localized("XP Hunger", "Жажда опыта", "अनुभव की भूख"),
    localized("+10% XP from every pickup.", "Подбираемый опыт увеличен на 10%.", "हर XP वस्तु से 10% अधिक अनुभव मिलता है।")
  );
  addUpgrade(
    "longReach",
    localized("Long Reach", "Длинная рука", "लंबी पहुँच"),
    localized("+10% weapon attack range.", "Дальность атаки оружия +10%.", "हथियारों की मारक दूरी +10%।")
  );

  addUpgrade(
    "ricochetRounds",
    localized("Ricochet Rounds", "Рикошетные пули", "उछलती गोलियाँ"),
    localized(
      "Bullets bounce to 1 enemy; with no other target, a boss takes a reduced rebound.",
      "Пуля рикошетит во врага; если целей больше нет, ослабленный рикошет повторно бьёт босса.",
      "गोलियाँ 1 दुश्मन तक उछलती हैं; कोई दूसरा लक्ष्य न हो तो बॉस को कमज़ोर रिकोशे की दूसरी हिट लगती है।"
    )
  );
  addUpgrade(
    "moreRicochets",
    localized("More Ricochets", "Ещё рикошет", "और रिकोशे"),
    localized("+1 extra ricochet. Can stack.", "+1 дополнительный рикошет. Эффект складывается.", "1 अतिरिक्त उछाल। इसे कई बार लिया जा सकता है।")
  );
  addUpgrade(
    "softAim",
    localized("Soft Aim", "Верная мушка", "सहज निशाना"),
    localized("Bullets bend more toward enemies ahead.", "Пули сильнее доворачивают к врагам впереди.", "गोलियाँ सामने के दुश्मनों की ओर अधिक मुड़ती हैं।")
  );
  addUpgrade(
    "fanTheHammer",
    localized("Fan the Hammer", "Веерный огонь", "हैमर की बौछार"),
    localized(
      "Kills trigger 1.8s rapid fire; 8 confirmed boss hits trigger a shorter burst.",
      "Убийство на 1,8 с ускоряет стрельбу; 8 попаданий по боссу дают короткую очередь.",
      "दुश्मन मारने पर 1.8 सेकंड तेज़ गोलीबारी होती है; बॉस पर 8 पक्की हिट छोटी बौछार चलाती हैं।"
    )
  );
  addUpgrade(
    "trickShot",
    localized("Trick Shot", "Лихой выстрел", "करामाती गोली"),
    localized("Ricochets deal +35% damage per bounce.", "Каждый отскок рикошета увеличивает урон на 35%.", "हर उछाल पर रिकोशे का नुकसान +35% बढ़ता है।")
  );
  addUpgrade(
    "duelistFocus",
    localized("Duelist's Focus", "Выдержка дуэлянта", "द्वंद्ववीर का ध्यान"),
    localized(
      "Moving safely builds stronger Soft Aim faster.",
      "Безопасное движение быстрее усиливает «Верную мушку».",
      "सुरक्षित चलते रहने से सहज निशाना जल्दी और अधिक मज़बूत होता है।"
    )
  );
  addUpgrade(
    "allRightAllLeft",
    localized("ALL RIGHT", "ПРАВОЕ ДЕЛО", "दायाँ ही सही"),
    localized(
      "One fires while the other reloads. Kills or 8-hit boss streaks grant one free round.",
      "Один стреляет, другой перезаряжается. Убийства или серии из 8 попаданий по боссу дают бесплатный патрон.",
      "एक रिवॉल्वर गोली चलाता है, दूसरा रीलोड करता है। दुश्मन मारने या बॉस पर लगातार 8 हिट से एक मुफ़्त गोली मिलती है।"
    ),
    localized("& all left", "и левое тоже", "बायाँ भी सही")
  );
  addUpgrade(
    "silverBullet",
    localized("Silver Bullet", "Серебряная пуля", "चाँदी की गोली"),
    localized(
      "Last Big Iron round: x3 damage, x1.5 size, x1.3 speed.",
      "Последний патрон «Большого ствола»: урон ×3, размер ×1,5, скорость ×1,3.",
      "बिग आयरन की आख़िरी गोली: नुकसान ×3, आकार ×1.5, गति ×1.3।"
    )
  );
  addUpgrade(
    "silverCache",
    localized("Silver Cache", "Серебряный запас", "चाँदी का भंडार"),
    localized(
      "Every 3rd Silver kill drops ammo; 3 Silver boss hits restore 2 rounds.",
      "Каждое 3-е убийство Серебряной пулей роняет боезапас; 3 попадания ею по боссу возвращают 2 патрона.",
      "चाँदी की गोली से हर तीसरे दुश्मन को मारने पर गोलियाँ गिरती हैं; बॉस पर इसकी 3 हिट 2 गोलियाँ लौटाती हैं।"
    )
  );
  addUpgrade(
    "executioner",
    localized("Executioner", "Палач", "जल्लाद"),
    localized(
      "Finishes enemies below 28% HP; instead deals +35% to wounded bosses.",
      "Добивает врагов ниже 28% ОЗ; раненым боссам наносит +35% урона.",
      "28% से कम स्वास्थ्य वाले दुश्मन तुरंत खत्म हो जाते हैं; इसकी जगह घायल बॉस को +35% नुकसान होता है।"
    )
  );
  addUpgrade(
    "biggerCaliber",
    localized("Bigger Caliber", "Калибр покрупнее", "बड़ा कैलिबर"),
    localized("Bigger Big Iron bullet and hitbox.", "Пуля «Большого ствола» и её зона попадания увеличиваются.", "बिग आयरन की गोली और उसका प्रहार क्षेत्र बड़ा होता है।")
  );
  addUpgrade(
    "heavyRupture",
    localized("Heavy Rupture", "Разрыв навылет", "भारी विदारण"),
    localized(
      "Piercing shots end in a shockwave and deepen boss exit wounds.",
      "Пробивающий выстрел рождает ударную волну и углубляет выходную рану у босса.",
      "आर-पार जाने वाली गोली अंत में झटका पैदा करती है और बॉस के निकास घाव को गहरा करती है।"
    )
  );
  addUpgrade(
    "leadBloom",
    localized("Lead Bloom", "Свинцовый цветок", "सीसे का फूल"),
    localized(
      "Kills split into side bullets; every 4th boss hit blooms inside the wound.",
      "После убийства пуля цветёт боковыми выстрелами; каждое 4-е попадание в босса расцветает у него внутри.",
      "दुश्मन मारने पर गोली किनारों में बँटती है; बॉस पर हर चौथी हिट घाव के भीतर फूटती है।"
    )
  );
  addUpgrade(
    "throughAndThrough",
    localized("Through and Through", "Навылет", "आर-पार"),
    localized(
      "Pierces empower the next hit; thick boss bodies also take a +25% exit wound.",
      "Пробитие усиливает следующий удар; крупный босс получает ещё +25% от выходной раны.",
      "आर-पार जाने वाली गोली अगली हिट को मज़बूत करती है; विशाल बॉस को निकास घाव से +25% नुकसान भी होता है।"
    )
  );

  addUpgrade(
    "extendedTube",
    localized("Extended Tube", "Удлинённый магазин", "लंबी मैगज़ीन"),
    localized(
      "Winchester magazine becomes x2. Crates give +43 rifle ammo.",
      "Магазин Винчестера ×2. В ящиках +43 винтовочных патрона.",
      "विनचेस्टर की मैगज़ीन दोगुनी होती है। पेटियाँ 43 अतिरिक्त राइफल गोलियाँ देती हैं।"
    )
  );
  addUpgrade(
    "trailLoader",
    localized("Trail Loader", "Патронная тропа", "कारतूस की राह"),
    localized("Every 3 rifle kills restores 3 shots.", "Каждые 3 винтовочных убийства возвращают 3 патрона.", "राइफल से हर 3 दुश्मन मारने पर 3 गोलियाँ वापस मिलती हैं।")
  );
  addUpgrade(
    "chainLightning",
    localized("Chain Lightning", "Цепная молния", "बिजली की श्रृंखला"),
    localized("Every 4th rifle shot shocks 4 enemies.", "Каждый 4-й выстрел винтовки бьёт молнией 4 врагов.", "राइफल की हर चौथी गोली 4 दुश्मनों को बिजली मारती है।")
  );
  addUpgrade(
    "stormTempo",
    localized("Storm Tempo", "Темп бури", "तूफ़ानी लय"),
    localized("Lightning gives 1.65s faster rifle fire.", "Молния на 1,65 с ускоряет стрельбу из винтовки.", "बिजली 1.65 सेकंड तक राइफल की गोलीबारी तेज़ करती है।")
  );
  addUpgrade(
    "leverEcho",
    localized("Lever Echo", "Эхо рычага", "लीवर की गूँज"),
    localized(
      "Every 6th shot repeats itself at 60% damage for free.",
      "Каждый 6-й выстрел бесплатно повторяется с 60% урона.",
      "हर छठी गोली मुफ़्त में दोहराई जाती है और 60% नुकसान देती है।"
    )
  );
  addUpgrade(
    "redLine",
    localized("Red Line", "Красная черта", "लाल रेखा"),
    localized(
      "The last quarter of the magazine fires 20% faster and pierces 1 extra enemy.",
      "Последняя четверть магазина стреляет на 20% быстрее и пробивает ещё 1 врага.",
      "मैगज़ीन की आख़िरी चौथाई 20% तेज़ चलती है और 1 अतिरिक्त दुश्मन के आर-पार जाती है।"
    )
  );
  addUpgrade(
    "pinDown",
    localized("Pin Down", "Пригвоздить", "जकड़ बंदी"),
    localized(
      "6 rapid hits pin a target: +15% Winchester damage for 2s. Regular enemies also slow by 25%.",
      "6 быстрых попаданий пригвождают цель: +15% урона Винчестера на 2 с. Обычные враги также замедляются на 25%.",
      "6 तेज़ हिट लक्ष्य को जकड़ती हैं: 2 सेकंड तक विनचेस्टर का नुकसान +15%। साधारण दुश्मन 25% धीमे भी होते हैं।"
    )
  );
  addUpgrade(
    "stormFeed",
    localized("Storm Feed", "Грозовая подача", "तूफ़ानी आपूर्ति"),
    localized(
      "A charged shot that hits feeds 1 reserve round straight into the magazine.",
      "Попадание заряженным выстрелом подаёт 1 патрон из резерва прямо в магазин.",
      "चार्ज की गई गोली लगने पर रिज़र्व से 1 गोली सीधे मैगज़ीन में आती है।"
    )
  );
  addUpgrade(
    "forkedLightning",
    localized("Forked Lightning", "Развилка молнии", "शाखादार बिजली"),
    localized(
      "Chain lightning strikes +1 target.",
      "Цепная молния бьёт на 1 цель больше.",
      "बिजली की श्रृंखला 1 अतिरिक्त लक्ष्य पर गिरती है।"
    )
  );
  addUpgrade(
    "returnStroke",
    localized("Return Stroke", "Обратный разряд", "वापसी की बिजली"),
    localized(
      "Unused lightning jumps return to the first target at 30% damage each.",
      "Неиспользованные прыжки молнии возвращаются в первую цель с 30% урона каждый.",
      "बिजली की बची हुई छलाँगें पहले लक्ष्य पर लौटती हैं; हर छलाँग 30% नुकसान देती है।"
    )
  );
  addUpgrade(
    "unbrokenStorm",
    localized("Unbroken Storm", "Буря без пауз", "अटूट तूफ़ान"),
    localized(
      "Reloads started during Storm Tempo run 35% faster and freeze the tempo timer.",
      "Перезарядка, начатая во время Темпа бури, идёт на 35% быстрее, а таймер темпа замирает.",
      "तूफ़ानी लय के दौरान शुरू हुई रीलोड 35% तेज़ चलती है और लय का टाइमर थमा रहता है।"
    )
  );
  addUpgrade(
    "eyeOfTheStorm",
    localized("Eye of the Storm", "Око бури", "तूफ़ान की आँख"),
    localized(
      "During Storm Tempo, lightning arrives every 3rd shot instead of every 4th.",
      "Во время Темпа бури молния приходит каждым 3-м выстрелом вместо 4-го.",
      "तूफ़ानी लय के दौरान बिजली हर चौथी की जगह हर तीसरी गोली पर गिरती है।"
    )
  );
  addUpgrade(
    "snapTraps",
    localized("Snap Traps", "Капканы", "झटपट फंदे"),
    localized("Rifle hits plant damaging traps.", "Попадания из винтовки расставляют капканы.", "राइफल की हिट से नुकसान देने वाले फंदे लगते हैं।")
  );
  addUpgrade(
    "baitedTrap",
    localized("Baited Trap", "Ловушка с приманкой", "चारे वाला फंदा"),
    localized("Traps lure up to 5 nearby zombies.", "Ловушки приманивают до 5 ближайших зомби.", "फंदे पास के अधिकतम 5 ज़ॉम्बियों को लुभाते हैं।")
  );
  addUpgrade(
    "trailLayer",
    localized("Trail Layer", "Ловчая тропа", "राह बिछाने वाला"),
    localized("You leave a trap every 5 seconds.", "Вы автоматически оставляете капкан каждые 5 секунд.", "आप हर 5 सेकंड में एक फंदा छोड़ते हैं।")
  );
  addUpgrade(
    "quickerTrail",
    localized("Quicker Trail", "Быстрый след", "तेज़ राह"),
    localized("Auto-traps appear faster, down to 1s.", "Автоловушки появляются чаще — вплоть до раза в секунду.", "अपने-आप लगने वाले फंदे जल्दी आते हैं; उनका न्यूनतम अंतर 1 सेकंड है।")
  );
  addUpgrade(
    "powderTrap",
    localized("Powder Trap", "Пороховая ловушка", "बारूदी फंदा"),
    localized("Traps get larger radius and 5 damage.", "Капканы становятся больше и наносят 5 урона.", "फंदों का दायरा बढ़ता है और वे 5 नुकसान देते हैं।")
  );
  addUpgrade(
    "salvagedTrap",
    localized("Salvaged Trap", "Ловушка с добычей", "लूट का फंदा"),
    localized("Trap kills restore 2 shots and drop XP.", "Убийства капканом возвращают 2 патрона и оставляют опыт.", "फंदे से दुश्मन मारने पर 2 गोलियाँ वापस मिलती हैं और XP गिरता है।")
  );

  addUpgrade(
    "clusterCharge",
    localized("Cluster Charge", "Кассетный заряд", "गुच्छा विस्फोट"),
    localized(
      "Blasts split into bomblets; direct boss hits focus part of the cluster inward.",
      "Взрыв рождает мини-бомбы; при прямом ударе по боссу часть заряда рвётся внутри.",
      "धमाके छोटे बमों में बँटते हैं; बॉस पर सीधी हिट गुच्छे के एक हिस्से को भीतर ही फोड़ती है।"
    )
  );
  addUpgrade(
    "moreBomblets",
    localized("More Bomblets", "Больше мини-бомб", "और छोटे बम"),
    localized(
      "+1 bomblet; focused boss hits gain +7%. Max 5.",
      "+1 мини-бомба; прямой удар по боссу: +7% урона. До 5.",
      "1 अतिरिक्त छोटा बम; बॉस पर केंद्रित हिट का नुकसान +7%। अधिकतम 5।"
    )
  );
  addUpgrade(
    "chainDetonation",
    localized("Chain Detonation", "Цепной подрыв", "श्रृंखला विस्फोट"),
    localized(
      "Explosion kills chain; every 2nd direct boss hit adds a reduced aftershock.",
      "Взрывные убийства запускают цепь; каждый 2-й прямой удар по боссу даёт слабый повторный взрыв.",
      "धमाके से मरा दुश्मन अगला धमाका शुरू करता है; बॉस पर हर दूसरी सीधी हिट हल्का दूसरा धमाका जोड़ती है।"
    )
  );
  addUpgrade(
    "moreChainDetonations",
    localized("Longer Chain", "Цепь подлиннее", "लंबी श्रृंखला"),
    localized(
      "+1 secondary blast; every 2nd boss hit gains +4%. Up to 10 blasts.",
      "+1 повторный взрыв; каждый 2-й удар по боссу: +4% урона. До 10 взрывов.",
      "1 अतिरिक्त दूसरा धमाका; बॉस पर हर दूसरी हिट का नुकसान +4%। अधिकतम 10 धमाके।"
    )
  );
  addUpgrade(
    "heavyPayload",
    localized("Heavy Payload", "Тяжёлый заряд", "भारी विस्फोटक"),
    localized(
      "+34% blast radius, +2.4 explosion damage, airburst.",
      "Радиус взрыва +34%, урон +2,4; подрыв в воздухе.",
      "धमाके का दायरा +34%, विस्फोट नुकसान +2.4, हवा में विस्फोट।"
    )
  );
  addUpgrade(
    "fullSalvo",
    localized("Full Salvo", "Полный залп", "पूरी बौछार"),
    localized(
      "4 explosion kills refill the magazine; 4 direct boss hits restore 2 shells.",
      "4 взрывных убийства полностью заряжают магазин; 4 прямых удара по боссу возвращают 2 гранаты.",
      "धमाके से 4 दुश्मन मारने पर मैगज़ीन भर जाती है; बॉस पर 4 सीधी हिट 2 गोले लौटाती हैं।"
    )
  );
  addUpgrade(
    "shrapnelRain",
    localized("Shrapnel Rain", "Дождь шрапнели", "छर्रों की बारिश"),
    localized(
      "Fragments fan outward; direct boss hits gain +22%.",
      "Осколки бьют веером; прямой удар по боссу наносит +22% урона.",
      "छर्रे पंखे की तरह फैलते हैं; बॉस पर सीधी हिट का नुकसान +22%।"
    )
  );
  addUpgrade(
    "powderEcho",
    localized("Powder Echo", "Пороховое эхо", "बारूद की गूँज"),
    localized(
      "Every 3rd grenade echoes 3 times; direct boss hits gain +70%.",
      "Каждая 3-я граната даёт 3 эхо-взрыва; прямой удар по боссу — +70% урона.",
      "हर तीसरा ग्रेनेड 3 बार गूँजता है; बॉस पर सीधी हिट का नुकसान +70%।"
    )
  );
  addUpgrade(
    "madmansJourney",
    localized("Madman's Journey", "Путь безумца", "दीवाने का सफ़र"),
    localized(
      "Multi-kills or pairs of direct boss hits ramp fire rate to x2.5.",
      "Серии убийств или пары прямых ударов по боссу разгоняют стрельбу до ×2,5.",
      "एक साथ कई दुश्मन मारने या बॉस पर सीधी हिट की जोड़ी से गोलीबारी की गति ×2.5 तक बढ़ती है।"
    )
  );
  addUpgrade(
    "napalmShells",
    localized("Napalm Shells", "Напалмовые заряды", "नैपाम गोले"),
    localized(
      "Explosions leave fire; direct boss hits attach a non-stacking thermite burn.",
      "Взрывы оставляют огонь; прямой удар по боссу поджигает его термитом. Эффект не складывается.",
      "धमाके आग छोड़ते हैं; बॉस पर सीधी हिट थर्माइट की जलन लगाती है। यह प्रभाव जमा नहीं होता।"
    )
  );
  addUpgrade(
    "rollingFlame",
    localized("Rolling Flame", "Бегущее пламя", "लुढ़कती ज्वाला"),
    localized("Each grenade drags a fire trail.", "Каждая граната оставляет за собой огненный след.", "हर ग्रेनेड अपने पीछे आग की लकीर छोड़ता है।")
  );
  addUpgrade(
    "fireproofPowder",
    localized("Fireproof Powder", "Несгораемый порох", "अग्निरोधी बारूद"),
    localized(
      "Stand in fire: free shots, ammo, +3 HP/s.",
      "В огне: бесплатные выстрелы, боезапас и +3 ОЗ/с.",
      "आग में खड़े रहें: मुफ़्त गोलियाँ, गोला-बारूद और प्रति सेकंड +3 स्वास्थ्य।"
    )
  );
  addUpgrade(
    "longBurn",
    localized("Long Burn", "Долгое горение", "लंबी लौ"),
    localized("Fire lasts +2.1 seconds longer.", "Огонь горит на 2,1 секунды дольше.", "आग 2.1 सेकंड अधिक रहती है।")
  );
  addUpgrade(
    "hotterFire",
    localized("Hotter Fire", "Огонь пожарче", "और गर्म आग"),
    localized("+1 damage per fire tick. Can stack.", "Каждое срабатывание огня наносит +1 урона. Эффект складывается.", "आग के हर असर पर +1 नुकसान। इसे कई बार लिया जा सकता है।")
  );
  addUpgrade(
    "scorchedEarth",
    localized("Scorched Earth", "Выжженная земля", "झुलसी धरती"),
    localized("Burning ground slows zombies.", "Горящая земля замедляет зомби.", "जलती ज़मीन ज़ॉम्बियों को धीमा करती है।")
  );
  addUpgrade(
    "thermiteCore",
    localized("Thermite Core", "Термитное ядро", "थर्माइट कोर"),
    localized(
      "+20% fire radius, +1 fire damage, self-fire.",
      "Радиус огня +20%, урон +1; огонь опасен и для вас.",
      "आग का दायरा +20%, आग का नुकसान +1, अपनी आग भी आपको जला सकती है।"
    )
  );
  addUpgrade(
    "backdraft",
    localized("Backdraft", "Обратная тяга", "पलटती लपट"),
    localized("Fire kills burst into extra flame patches.", "Убитые огнём враги оставляют новые очаги пламени.", "आग से मरे दुश्मन लपटों के अतिरिक्त घेरे छोड़ते हैं।")
  );
  addUpgrade(
    "crossfireShells",
    localized("Crossfire Shells", "Огонь накрест", "क्रॉसफ़ायर गोले"),
    localized(
      "Landing blasts fire 2 burning side shards.",
      "Взрыв выпускает в стороны 2 горящих осколка.",
      "ज़मीन से टकराते ही धमाका दोनों ओर 2 जलते टुकड़े दागता है।"
    )
  );

  addUpgrade(
    "doorKicker",
    localized("Door Kicker", "Вышибала", "दरवाज़ा-तोड़"),
    localized(
      "4+ pellets launch enemies and grant extra Momentum; boss immunity becomes breach damage.",
      "4+ дробины отбрасывают врага и дают больше Напора; иммунитет босса к отбрасыванию превращается в пробивной урон.",
      "4 या अधिक छर्रे दुश्मन को उछालकर अतिरिक्त जोश देते हैं; बॉस पर धक्का बेअसर हो तो उसकी जगह भेदन नुकसान होता है।"
    )
  );
  addUpgrade(
    "doubleTap",
    localized("Double Tap", "Дуплет", "दोहरी गोली"),
    localized(
      "The quick second shot hits 15% harder and grants 2 Momentum on any confirmed hit.",
      "Быстрый второй выстрел: +15% урона и 2 Напора при попадании.",
      "तेज़ दूसरी गोली 15% अधिक नुकसान देती है और पक्की हिट पर 2 जोश देती है।"
    )
  );
  addUpgrade(
    "lastWord",
    localized("Last Word", "Последнее слово", "आख़िरी शब्द"),
    localized(
      "Final shell: +30% damage/knockback; a hit speeds the next reload by 45%.",
      "Последний патрон: +30% урона и отбрасывания. Попадание ускоряет следующую перезарядку на 45%.",
      "आख़िरी गोली: नुकसान और धक्का +30%; हिट अगली रीलोड को 45% तेज़ करती है।"
    )
  );
  addUpgrade(
    "shellCatcher",
    localized("Shell Catcher", "Ловец гильз", "खोखा पकड़ने वाला"),
    localized(
      "Every 3 close Momentum volleys grant one shell, including against bosses.",
      "Каждые 3 близких залпа с Напором дают патрон, в том числе за попадания по боссу.",
      "पास से जोश के साथ दागी हर 3 बौछारों पर एक कारतूस मिलता है, बॉस के विरुद्ध भी।"
    )
  );
  addUpgrade(
    "buckAndBall",
    localized("Breach Step", "Штурмовой шаг", "धावे का कदम"),
    localized(
      "Fire while moving to gain +25% controlled movement speed for 0.45 sec.",
      "Стрельба в движении даёт +25% скорости без потери управления на 0,45 с.",
      "चलते हुए गोली चलाएँ और 0.45 सेकंड के लिए नियंत्रण बनाए रखते हुए गति +25% पाएँ।"
    )
  );
  addUpgrade(
    "rideTheRecoil",
    localized("Ride the Recoil", "Оседлай отдачу", "झटके की सवारी"),
    localized(
      "At full Momentum reach +45% speed; firing delays decay by another 0.75 sec.",
      "Полный Напор: +45% скорости. Выстрел задерживает спад ещё на 0,75 с.",
      "पूरा जोश होने पर गति +45%; गोली चलाने से उसका क्षय 0.75 सेकंड और रुकता है।"
    )
  );
  addUpgrade(
    "bonebreaker",
    localized("Bonebreaker", "Костолом", "हड्डीतोड़"),
    localized(
      "Launched collisions gain +20% force/damage per Momentum; full Momentum scatters neighbors.",
      "Столкновения отброшенных врагов: +20% силы и урона за единицу Напора. Полный Напор разбрасывает соседей.",
      "उछाले गए दुश्मन की टक्कर को जोश की हर इकाई पर +20% बल और नुकसान मिलता है; पूरा जोश आस-पास वालों को बिखेरता है।"
    )
  );
  addUpgrade(
    "noTimeToBleed",
    localized("No Time to Bleed", "Некогда истекать кровью", "खून बहाने का समय नहीं"),
    localized(
      "Every 4 close volleys at full Momentum restore 4 HP, at most once per 3 sec.",
      "Каждые 4 близких залпа при полном Напоре лечат 4 ОЗ. Не чаще раза в 3 с.",
      "पूरे जोश पर पास से हर 4 बौछारों के बाद 4 स्वास्थ्य लौटता है; अधिकतम हर 3 सेकंड में एक बार।"
    )
  );
  addUpgrade(
    "packedBuckshot",
    localized("Packed Buckshot", "Плотная картечь", "सघन छर्रे"),
    localized("+1 pellet per blast. Up to 4 stacks.", "+1 дробина в каждом выстреле. До 4 уровней.", "हर धमाके में 1 अतिरिक्त छर्रा। अधिकतम 4 बार।")
  );
  addUpgrade(
    "hardCast",
    localized("Hard Cast", "Литая мощь", "कठोर ढलाई"),
    localized(
      "Each rank adds +8% knockback and +0.15 sec Momentum life. Max 5; mastery adds damage.",
      "Каждый уровень: +8% отбрасывания и +0,15 с Напора. До 5; мастерство добавляет урон.",
      "हर स्तर धक्का +8% और जोश की अवधि +0.15 सेकंड देता है। अधिकतम 5; महारत नुकसान भी बढ़ाती है।"
    )
  );
  addUpgrade(
    "roomSweeper",
    localized("Room Sweeper", "Зачистка", "कमरा-झाड़ू"),
    localized(
      "Hit 3 different enemies in one volley to load the next shell 35% faster.",
      "Попадите по 3 разным врагам одним залпом — следующий патрон зарядится на 35% быстрее.",
      "एक बौछार में 3 अलग दुश्मनों पर वार करें — अगला कारतूस 35% तेज़ भरता है।"
    )
  );
  addUpgrade(
    "rollingThunder",
    localized("Rolling Thunder", "Раскат грома", "मेघगर्जन"),
    localized(
      "Full-Momentum overflow stores Overpressure, up to 2. Your next volley spends it: +15% knockback, 10% tighter spread per stack.",
      "Избыток при полном Напоре копит Сверхдавление, до 2. Следующий залп тратит его: +15% отбрасывания и на 10% уже разброс за заряд.",
      "पूरे जोश पर बढ़त अतिदाब जमा करती है, अधिकतम 2। अगली बौछार उसे खर्च करती है: हर चार्ज पर धक्का +15% और फैलाव 10% कसा।"
    )
  );
  addUpgrade(
    "sheriffsPace",
    localized("Sheriff's Pace", "Шаг шерифа", "शेरिफ़ की चाल"),
    localized(
      "Close kills during Breach Step extend it 0.2s, up to 0.8s per volley; its speed bonus grows to +40%.",
      "Близкие убийства при Штурмовом шаге продлевают его на 0,2 с, до 0,8 с за залп; его бонус скорости растёт до +40%.",
      "धावे के कदम के दौरान पास की हर मार उसे 0.2 सेकंड बढ़ाती है, हर बौछार में अधिकतम 0.8 सेकंड; उसकी गति का बोनस +40% हो जाता है।"
    )
  );
  addUpgrade(
    "holdTheDoor",
    localized("Hold the Door", "Держи дверь", "दरवाज़ा थामो"),
    localized(
      "Each loaded shell grants 12% damage reduction until you fire it, up to 24%.",
      "Каждый заряженный патрон даёт 12% снижения урона, пока вы не выстрелите. До 24%.",
      "भरा हर कारतूस गोली चलाने तक 12% नुकसान घटाता है, अधिकतम 24%।"
    )
  );
  addUpgrade(
    "powderCurtain",
    localized("Powder Curtain", "Пороховая завеса", "बारूदी परदा"),
    localized(
      "Blasts destroy hostile projectiles in the cone. Clearing any grants 1 Momentum, once per volley.",
      "Залп уничтожает вражеские снаряды в конусе. За уничтожение — 1 Напор, раз в залп.",
      "धमाका शंकु में दुश्मन के गोले नष्ट करता है। सफ़ाई पर 1 जोश, हर बौछार में एक बार।"
    )
  );
  addUpgrade(
    "masterKey",
    localized("Master Key", "Мастер-ключ", "मास्टर चाबी"),
    localized(
      "Close range: Door Kicker triggers at 3 pellets. Boss breach damage +15%; full-Momentum speed +20%.",
      "Вблизи Вышибале хватает 3 дробин. Пробивной урон боссам +15%; скорость при полном Напоре +20%.",
      "पास से दरवाज़ा-तोड़ 3 छर्रों पर ही चलता है। बॉस पर भेदन नुकसान +15%; पूरे जोश पर गति +20%।"
    )
  );
  addUpgrade(
    "rockSalt",
    localized("Rock Salt", "Соляной заряд", "सेंधा नमक"),
    localized(
      "Marked foes are slowed 25%; a marked boss grants 10% damage resistance.",
      "Метка замедляет врага на 25%; метка на боссе даёт 10% сопротивления урону.",
      "चिह्नित दुश्मन 25% धीमे होते हैं; चिह्नित बॉस आपको 10% नुकसान प्रतिरोध देता है।"
    )
  );
  addUpgrade(
    "stillness",
    localized("Stillness", "Затишье", "निश्चलता"),
    localized(
      "Hold fire 0.8s: tighter spread and +50% damage; a quick follow-up gains +25%.",
      "Не стреляйте 0,8 с: разброс уже, урон +50%. Быстрый второй выстрел получает ещё +25%.",
      "0.8 सेकंड गोली न चलाएँ: फैलाव घटे और नुकसान +50%; तुरंत अगली गोली को +25% मिलता है।"
    )
  );
  addUpgrade(
    "lastRites",
    localized("Last Rites", "Последнее причастие", "अंतिम अनुष्ठान"),
    localized(
      "Marked kills or 4 marked boss volleys raise an 18s Pale Deputy. Max 3; excess rites refresh one.",
      "Отмеченный враг убит или босс выдержал 4 залпа — Бледный помощник явится на 18 с. До 3; лишний обновится.",
      "चिह्नित दुश्मन मारने या चिह्नित बॉस पर 4 बौछारों से 18 सेकंड के लिए धवल डिप्टी बुलाता है। अधिकतम 3; अतिरिक्त अनुष्ठान एक की अवधि ताज़ा करता है।"
    )
  );
  addUpgrade(
    "graveTithe",
    localized("Grave Tithe", "Могильная десятина", "कब्र का कर"),
    localized(
      "2 marked kills or 3 marked boss volleys grant one shell.",
      "2 убийства отмеченных врагов или 3 залпа по отмеченному боссу дают патрон.",
      "2 चिह्नित दुश्मन मारने या चिह्नित बॉस पर 3 बौछारों से एक कारतूस मिलता है।"
    )
  );
  addUpgrade(
    "heavensBounty",
    localized("Heaven's Bounty", "Небесная награда", "स्वर्ग का इनाम"),
    localized(
      "Every 10s, seal a dangerous foe. Kill it, or hit a sealed boss 3 times, for 3 shells.",
      "Раз в 10 с появляется печать. Убейте её носителя или трижды попадите по отмеченному боссу — получите 3 патрона.",
      "हर 10 सेकंड खतरनाक दुश्मन पर मुहर लगती है। उसे मारें या मुहर लगे बॉस को 3 बार हिट करें और 3 कारतूस पाएँ।"
    )
  );
  addUpgrade(
    "passingJudgment",
    localized("Passing Judgment", "Приговор по кругу", "घूमता फ़ैसला"),
    localized(
      "Marked deaths pass the mark to 2 nearby foes for 6s. Every 3 marked boss volleys pass it or echo 28% damage.",
      "После смерти метка на 6 с переходит к 2 врагам рядом. Каждый 3-й залп по отмеченному боссу передаёт её или повторяет 28% урона.",
      "चिह्नित दुश्मन के मरने पर निशान 6 सेकंड के लिए पास के 2 दुश्मनों पर जाता है। चिह्नित बॉस पर हर 3 बौछारों के बाद निशान आगे बढ़ता है; लक्ष्य न मिले तो 28% नुकसान दोहराता है।"
    )
  );
  addUpgrade(
    "purifyingSalt",
    localized("Purifying Salt", "Соль очищения", "शुद्ध करने वाला नमक"),
    localized(
      "Pellets erase hostile projectiles and acid; cleansing heals 2 and grants reload +35% for 3s.",
      "Дробь стирает снаряды и кислоту. Очищение лечит 2 ОЗ и на 3 с ускоряет перезарядку на 35%.",
      "छर्रे दुश्मन के प्रक्षेप्य और तेज़ाब मिटाते हैं; शुद्धि 2 स्वास्थ्य बहाल करती है और 3 सेकंड के लिए रीलोड +35% करती है।"
    )
  );
  addUpgrade(
    "hallowedGround",
    localized("Hallowed Ground", "Святая земля", "पवित्र भूमि"),
    localized(
      "Marked elite deaths sanctify a 5m area for 8s: reload +35%, damage +15%, heal 1/s.",
      "Смерть отмеченной элиты освящает область радиусом 5 м на 8 с: перезарядка +35%, урон +15%, лечение +1 ОЗ/с.",
      "चिह्नित विशिष्ट दुश्मन की मौत 5 मीटर क्षेत्र को 8 सेकंड पवित्र करती है: रीलोड +35%, नुकसान +15%, प्रति सेकंड 1 स्वास्थ्य।"
    )
  );
  addUpgrade(
    "fineChoke",
    localized("Fine Choke", "Кучная дробь", "सटीक चोक"),
    localized("+7% reach and a tighter pattern. Up to 5 stacks.", "Дальность +7%, разброс меньше. До 5 уровней.", "दूरी +7% और फैलाव अधिक सघन। अधिकतम 5 बार।")
  );
  addUpgrade(
    "sanctifiedLead",
    localized("Sanctified Lead", "Святой свинец", "पवित्र सीसा"),
    localized(
      "+12% damage to marked enemies. Up to 5 stacks.",
      "+12% урона отмеченным врагам. До 5 уровней.",
      "चिह्नित दुश्मनों को +12% नुकसान। अधिकतम 5 बार।"
    )
  );

  addMasteryFallback(
    "packedBuckshot",
    localized("Packed Mastery", "Мастер плотной картечи", "सघन छर्रों की महारत"),
    localized(
      "Beyond the cap: +3% Coach Gun damage.",
      "Сверх ограничения: +3% к урону двустволки.",
      "सीमा के बाद: डबल बैरल बंदूक का नुकसान +3%।"
    )
  );
  addMasteryFallback(
    "hardCast",
    localized("Hard Cast Mastery", "Мастер литой мощи", "कठोर ढलाई की महारत"),
    localized(
      "Beyond the cap: +3% Coach Gun damage.",
      "Сверх ограничения: +3% к урону двустволки.",
      "सीमा के बाद: डबल बैरल बंदूक का नुकसान +3%।"
    )
  );
  addMasteryFallback(
    "fineChoke",
    localized("Choke Mastery", "Мастер кучной дроби", "चोक की महारत"),
    localized(
      "Beyond the cap: +3% Coach Gun damage.",
      "Сверх ограничения: +3% к урону двустволки.",
      "सीमा के बाद: डबल बैरल बंदूक का नुकसान +3%।"
    )
  );
  addMasteryFallback(
    "sanctifiedLead",
    localized("Sanctified Mastery", "Мастер святого свинца", "पवित्र सीसे की महारत"),
    localized(
      "Beyond the cap: +3% Coach Gun damage.",
      "Сверх ограничения: +3% к урону двустволки.",
      "सीमा के बाद: डबल बैरल बंदूक का नुकसान +3%।"
    )
  );

  put(
    "error.threeLoad",
    localized(
      "Three.js failed to load from vendor/three.min.js.",
      "Не удалось загрузить Three.js из vendor/three.min.js.",
      "vendor/three.min.js से Three.js लोड नहीं हो सका।"
    )
  );
  put(
    "levelUp.subtitleWithLevel",
    localized(
      "Level {level}. Pick a boost for this run.",
      "Уровень {level}. Выберите усиление для этой охоты.",
      "स्तर {level}। इस शिकार के लिए एक सुधार चुनें।"
    )
  );
  put("menu.music.mute", localized("Mute menu music", "Выключить музыку меню", "मेन्यू का संगीत बंद करें"));
  put("menu.music.enable", localized("Enable menu music", "Включить музыку меню", "मेन्यू का संगीत चालू करें"));
  put(
    "hud.minimap.a11y",
    localized(
      "Minimap. Level {level}. Experience {percent}%.",
      "Мини-карта. Уровень {level}. Опыт: {percent}%.",
      "लघु मानचित्र। स्तर {level}। अनुभव {percent}%।"
    )
  );
  put("hud.minimap.ammo", localized("Ammo {count}", "Боеприпасы: {count}", "गोला-बारूद {count}"));
  put(
    "hud.ammo.load",
    localized(
      "LOAD {current}/{magazine} / LEFT {total}",
      "ЗАРЯД {current}/{magazine} / ВСЕГО {total}",
      "लोड {current}/{magazine} / बाकी {total}"
    )
  );
  put(
    "hud.ammo.reload",
    localized(
      "Reload {seconds}s / {remaining}",
      "Перезарядка {seconds} с / {remaining}",
      "रीलोड {seconds} सेकंड / {remaining}"
    )
  );
  put("hud.ammo.empty", localized("Empty", "Пусто", "खाली"));
  put(
    "hud.ammo.lastMagazine",
    localized("LAST MAG / LEFT {total}", "ПОСЛЕДНИЙ МАГАЗИН / ВСЕГО {total}", "आख़िरी मैगज़ीन / बाकी {total}")
  );
  put(
    "hud.ammo.low",
    localized("LOW AMMO / LEFT {total}", "МАЛО ПАТРОНОВ / ВСЕГО {total}", "गोलियाँ कम / बाकी {total}")
  );
  put("hud.ammo.left", localized("LEFT {total}", "ВСЕГО {total}", "बाकी {total}"));
  put(
    "hud.ammo.reloadEmpty",
    localized("Reload {seconds}s / Empty", "Перезарядка {seconds} с / Пусто", "रीलोड {seconds} सेकंड / खाली")
  );
  put(
    "hud.ammo.reloadLastMagazine",
    localized(
      "Reload {seconds}s / LAST MAG / LEFT {total}",
      "Перезарядка {seconds} с / ПОСЛЕДНИЙ МАГАЗИН / ВСЕГО {total}",
      "रीलोड {seconds} सेकंड / आख़िरी मैगज़ीन / बाकी {total}"
    )
  );
  put(
    "hud.ammo.reloadLow",
    localized(
      "Reload {seconds}s / LOW AMMO / LEFT {total}",
      "Перезарядка {seconds} с / МАЛО ПАТРОНОВ / ВСЕГО {total}",
      "रीलोड {seconds} सेकंड / गोलियाँ कम / बाकी {total}"
    )
  );
  put(
    "hud.ammo.reloadLeft",
    localized(
      "Reload {seconds}s / LEFT {total}",
      "Перезарядка {seconds} с / ВСЕГО {total}",
      "रीलोड {seconds} सेकंड / बाकी {total}"
    )
  );
  put(
    "hud.ammo.dual",
    localized(
      "R {rightCurrent}/{rightMagazine}{rightBonus}  L {leftCurrent}/{leftMagazine}{leftBonus}",
      "П {rightCurrent}/{rightMagazine}{rightBonus}  Л {leftCurrent}/{leftMagazine}{leftBonus}",
      "दा {rightCurrent}/{rightMagazine}{rightBonus}  बा {leftCurrent}/{leftMagazine}{leftBonus}"
    )
  );
  put(
    "hud.ammo.a11y",
    localized(
      "{weapon} ammo {current} of {magazine}, total {total}, reserve {reserve}",
      "{weapon}: в магазине {current} из {magazine}, всего {total}, в запасе {reserve}",
      "{weapon}: मैगज़ीन में {current}, क्षमता {magazine}, कुल {total}, भंडार {reserve}"
    )
  );
  put(
    "hud.ammo.dualA11y",
    localized(
      "{weapon} ammo {current} of {magazine}, right {rightCurrent} of {rightMagazine}, left {leftCurrent} of {leftMagazine}, reserve {reserve}",
      "{weapon}: всего в барабанах {current} из {magazine}, справа {rightCurrent} из {rightMagazine}, слева {leftCurrent} из {leftMagazine}, в запасе {reserve}",
      "{weapon}: दोनों में {current}, कुल क्षमता {magazine}, दायाँ {rightCurrent}, क्षमता {rightMagazine}, बायाँ {leftCurrent}, क्षमता {leftMagazine}, भंडार {reserve}"
    )
  );
  put(
    "gameOver.statsDetailed",
    localized(
      "Wave {wave} - Level {level} - Score {score} - Zombies {kills}",
      "Волна {wave} · Уровень {level} · Счёт {score} · Зомби {kills}",
      "लहर {wave} · स्तर {level} · अंक {score} · ज़ॉम्बी {kills}"
    )
  );

  put("boss.hordeheart.name.horde", localized("THE HORDE", "ОРДА", "मुर्दों का झुंड"));
  put(
    "boss.hordeheart.name.full",
    localized("HORDEHEART · MASS OF THE FALLEN", "СЕРДЦЕ ОРДЫ · СКОПИЩЕ ПАВШИХ", "झुंड का हृदय · गिरे हुओं का पिंड")
  );
  put("boss.hordeheart.indicator.horde", localized("Horde", "Орда", "झुंड"));
  put("boss.hordeheart.indicator.whole", localized("Whole mass", "Цельная масса", "पूरा पिंड"));
  put("boss.hordeheart.indicator.halves", localized("Two halves", "Две половины", "दो हिस्से"));
  put("boss.hordeheart.indicator.quarters", localized("Four fragments", "Четыре фрагмента", "चार टुकड़े"));
  put("boss.hordeheart.indicatorsA11y", localized("Hordeheart division phases", "Фазы деления Сердца Орды", "झुंड के हृदय के विभाजन चरण"));

  put("boss.health", localized("{percent}% health", "Здоровье: {percent}%", "स्वास्थ्य {percent}%"));
  put(
    "boss.healthPhase",
    localized(
      "{percent}% health. Phase {phase}.",
      "Здоровье: {percent}%. Фаза {phase}.",
      "स्वास्थ्य {percent}%। चरण {phase}।"
    )
  );
  put("boss.landEater.hudName", localized("THE LAND-EATER · LAST ACRE", "ПОЖИРАТЕЛЬ ЗЕМЛИ · ПОСЛЕДНИЙ АКР", "धरती-भक्षक · आख़िरी एकड़"));
  put(
    "boss.landEater.defeated",
    localized("THE HUNGER STOPS · THE SCARS REMAIN", "ГОЛОД УТИХ · ШРАМЫ ОСТАЛИСЬ", "भूख थमी · घाव बाकी हैं")
  );
  put(
    "boss.landEater.tunneling",
    localized(
      "TUNNELING TO SECTOR {sector} · {seconds}s",
      "ПРОРЫВАЕТСЯ В СЕКТОР {sector} · {seconds} с",
      "क्षेत्र {sector} की ओर सुरंग बना रहा है · {seconds} सेकंड"
    )
  );
  put(
    "boss.landEater.devouring",
    localized(
      "DEVOURING SECTOR {sector} · {seconds}s",
      "ПОЖИРАЕТ СЕКТОР {sector} · {seconds} с",
      "क्षेत्र {sector} निगल रहा है · {seconds} सेकंड"
    )
  );
  put("boss.landEater.underfoot", localized("HUNTER UNDERFOOT · KEEP MOVING", "ТВАРЬ ПОД НОГАМИ · НЕ ОСТАНАВЛИВАЙТЕСЬ", "भक्षक पैरों तले · चलते रहें"));
  put("boss.landEater.mawStrike", localized("MAW STRIKE · GROUND RUPTURED", "УДАР ПАСТИ · ЗЕМЛЯ РАЗОРВАНА", "भक्षक का वार · धरती फटी"));
  put("boss.landEater.eruption", localized("ERUPTION · LEAVE THE RING", "ИЗВЕРЖЕНИЕ · ПОКИНЬТЕ КОЛЬЦО", "विस्फोट · घेरे से निकलें"));
  put(
    "boss.landEater.ricochetWarning",
    localized(
      "RICOCHET MARCH · X-MARKED CELLS WILL FALL",
      "РИКОШЕТНЫЙ МАРШ · КЛЕТКИ С X РУХНУТ",
      "उछलता मार्च · X वाले खाने गिरेंगे"
    )
  );
  put(
    "boss.landEater.ricochetActive",
    localized(
      "RICOCHET MARCH · CLEAR THE LINE AND MARKS",
      "РИКОШЕТНЫЙ МАРШ · СОЙДИТЕ С ЛИНИИ И ОТ МЕТОК",
      "उछलता मार्च · रेखा और निशान से हटें"
    )
  );
  put("boss.landEater.exposed", localized("MAW EXPOSED · 35% BONUS DAMAGE", "ПАСТЬ ОТКРЫТА · +35% УРОНА", "भक्षक का मुँह खुला · +35% नुकसान"));
  put(
    "boss.landEater.phase",
    localized(
      "PHASE {phase} · THE GROUND IS HUNGRY",
      "ФАЗА {phase} · ЗЕМЛЯ ГОЛОДНА",
      "चरण {phase} · धरती भूखी है"
    )
  );

  put("boss.oilBaron.hudName", localized("THE OIL BARON · KING OF BLACK GOLD", "НЕФТЯНОЙ БАРОН · КОРОЛЬ ЧЁРНОГО ЗОЛОТА", "तेल का बैरन · काले सोने का राजा"));
  put(
    "boss.oilBaron.healthOfferA11y",
    localized(
      "{percent}% health. Invulnerable during the offer",
      "Здоровье: {percent}%. Неуязвим во время сделки",
      "स्वास्थ्य {percent}%। सौदे के दौरान अभेद्य"
    )
  );
  put(
    "boss.oilBaron.healthStarfallA11y",
    localized(
      "{percent}% health. Invulnerable during the oil starfall",
      "Здоровье: {percent}%. Неуязвим во время нефтяного звездопада",
      "स्वास्थ्य {percent}%। तेल के तारापात के दौरान अभेद्य"
    )
  );
  put(
    "boss.oilBaron.healthVulnerableA11y",
    localized("{percent}% health. Vulnerable", "Здоровье: {percent}%. Уязвим", "स्वास्थ्य {percent}%। भेद्य")
  );
  put("boss.oilBaron.offerStatus", localized("IMMUNE · THE BARON OFFERS YOU A DEAL", "НЕУЯЗВИМ · БАРОН ПРЕДЛАГАЕТ СДЕЛКУ", "अभेद्य · बैरन सौदे की पेशकश कर रहा है"));
  put("boss.oilBaron.bathing", localized("IMMUNE · THE BARON BATHES IN BLACK GOLD", "НЕУЯЗВИМ · БАРОН КУПАЕТСЯ В ЧЁРНОМ ЗОЛОТЕ", "अभेद्य · बैरन काले सोने में नहा रहा है"));
  put(
    "boss.oilBaron.starfall",
    localized(
      "IMMUNE · STARFALL {current}/{total} · MOVE FROM THE MARK",
      "НЕУЯЗВИМ · ЗВЕЗДОПАД {current}/{total} · УЙДИТЕ С МЕТКИ",
      "अभेद्य · तारापात {current}/{total} · निशान से हटें"
    )
  );
  put("boss.oilBaron.armorShedding", localized("IMMUNE · OIL ARMOR SHEDDING", "НЕУЯЗВИМ · НЕФТЯНАЯ БРОНЯ РАЗРУШАЕТСЯ", "अभेद्य · तेल कवच उतर रहा है"));
  put(
    "boss.oilBaron.groundCrash",
    localized(
      "VULNERABLE · GROUND CRASH · GET OUT OF THE RED RING",
      "УЯЗВИМ · УДАР О ЗЕМЛЮ · ВЫЙДИТЕ ИЗ КРАСНОГО КОЛЬЦА",
      "भेद्य · धरती पर प्रहार · लाल घेरे से निकलें"
    )
  );
  put(
    "boss.oilBaron.derricksPumping",
    localized(
      "VULNERABLE · {count} DERRICKS PUMPING · DESTROY THEM TO DRAIN THE OIL",
      "УЯЗВИМ · РАБОТАЮЩИЕ ВЫШКИ: {count} · УНИЧТОЖЬТЕ ИХ, ЧТОБЫ СЛИТЬ НЕФТЬ",
      "भेद्य · चलती तेल-मीनारें: {count} · तेल बहाने के लिए उन्हें तोड़ें"
    )
  );
  put("boss.oilBaron.derricksCount", localized("DERRICKS · {count}", "ВЫШКИ · {count}", "तेल-मीनारें · {count}"));
  put(
    "boss.oilBaron.derricksA11y",
    localized("{count} active oil derricks", "Активные нефтяные вышки: {count}", "सक्रिय तेल-मीनारें: {count}")
  );
  put(
    "boss.oilBaron.derrickOneA11y",
    localized("1 active oil derrick", "Активные нефтяные вышки: 1", "सक्रिय तेल-मीनार: 1")
  );
  put("boss.oilBaron.derricksGroupA11y", localized("Active oil derricks", "Активные нефтяные вышки", "सक्रिय तेल-मीनारें"));
  put("boss.oilBaron.offerTitle", localized("THE BARON OFFERS YOU A DEAL", "БАРОН ПРЕДЛАГАЕТ ВАМ СДЕЛКУ", "बैरन आपको सौदे की पेशकश करता है"));
  put(
    "boss.oilBaron.offerSolo",
    localized(
      "TAKE $5,000 · GUNS SILENT FOR 45s · REACH THE GOLD · {seconds}s",
      "ВОЗЬМИТЕ $5 000 · ОРУЖИЕ ЗАМОЛЧИТ НА 45 с · ДОБЕРИТЕСЬ ДО ЗОЛОТА · {seconds} с",
      "$5,000 लें · हथियार 45 सेकंड बंद · सोने तक पहुँचें · {seconds} सेकंड"
    )
  );
  put(
    "boss.oilBaron.offerMultiplayer",
    localized(
      "$5,000 · JOIN THE BARON · YOU DIE WITH HIM · +$5,000 IF ALL RIVALS SURRENDER · REACH THE GOLD · {seconds}s",
      "$5 000 · ВСТАНЬТЕ НА СТОРОНУ БАРОНА · ПОГИБНЕТЕ ВМЕСТЕ С НИМ · ЕЩЁ $5 000, ЕСЛИ ВСЕ СОПЕРНИКИ СДАДУТСЯ · ДОБЕРИТЕСЬ ДО ЗОЛОТА · {seconds} с",
      "$5,000 · बैरन का साथ दें · उसके साथ मरेंगे · सभी प्रतिद्वंद्वी झुकें तो +$5,000 · सोने तक पहुँचें · {seconds} सेकंड"
    )
  );
  put(
    "boss.oilBaron.playerBought",
    localized(
      "{name} TOOK THE BARON'S GOLD",
      "{name} ВЗЯЛ ЗОЛОТО БАРОНА",
      "{name} ने बैरन का सोना लिया"
    )
  );
  put("boss.oilBaron.fallbackCowboy", localized("A COWBOY", "ОДИН КОВБОЙ", "एक काउबॉय"));
  put("boss.oilBaron.nowFightsForBaron", localized("THEY NOW FIGHT FOR THE BARON", "ТЕПЕРЬ ЭТО БОЕЦ БАРОНА", "अब ये बैरन के लिए लड़ते हैं"));
  put("boss.oilBaron.dealSealed", localized("THE DEAL IS SEALED", "СДЕЛКА ЗАКЛЮЧЕНА", "सौदा पक्का हुआ"));
  put(
    "boss.oilBaron.goldReceived",
    localized(
      "$5,000 RECEIVED · WEAPONS LOCKED FOR 45 SECONDS",
      "ПОЛУЧЕНО $5 000 · ОРУЖИЕ ЗАБЛОКИРОВАНО НА 45 СЕКУНД",
      "$5,000 मिले · हथियार 45 सेकंड के लिए बंद"
    )
  );
  put("boss.oilBaron.offerWithdrawn", localized("THE BARON WITHDRAWS HIS OFFER", "БАРОН ОТЗЫВАЕТ ПРЕДЛОЖЕНИЕ", "बैरन ने सौदा वापस लिया"));
  put(
    "boss.oilBaron.defiance",
    localized("THE PRICE OF DEFIANCE IS OIL AND FIRE", "ЦЕНА НЕПОКОРНОСТИ — НЕФТЬ И ОГОНЬ", "अवज्ञा की कीमत तेल और आग है")
  );
  put("boss.oilBaron.sidePrevails", localized("THE BARON'S SIDE PREVAILS", "СТОРОНА БАРОНА ПОБЕДИЛА", "बैरन का पक्ष जीता"));
  put(
    "boss.oilBaron.allSurrendered",
    localized(
      "ALL RIVALS SURRENDERED · BONUS $5,000",
      "ВСЕ СОПЕРНИКИ СДАЛИСЬ · БОНУС $5 000",
      "सभी प्रतिद्वंद्वी झुके · $5,000 बोनस"
    )
  );
  put(
    "boss.oilBaron.noDeal",
    localized("NO DEAL · THE BARON IS VULNERABLE AGAIN", "СДЕЛКИ НЕТ · БАРОН СНОВА УЯЗВИМ", "सौदा नहीं · बैरन फिर भेद्य है")
  );
  put("boss.oilBaron.dealDone", localized("THE DEAL IS DONE", "СДЕЛКА ЗАВЕРШЕНА", "सौदा पूरा हुआ"));
  put("boss.oilBaron.triggerOwned", localized("THE BARON OWNS YOUR TRIGGER", "БАРОН ВЛАДЕЕТ ВАШИМ СПУСКОМ", "आपकी बंदूक अब बैरन की है"));
  put(
    "boss.oilBaron.weaponsLocked",
    localized("WEAPONS LOCKED · {seconds}s", "ОРУЖИЕ ЗАБЛОКИРОВАНО · {seconds} с", "हथियार बंद · {seconds} सेकंड")
  );

  put("boss.bellRinger.hudName", localized("THE BELL RINGER · LAST PARISH", "ЗВОНАРЬ · ПОСЛЕДНИЙ ПРИХОД", "घंटीवाला · आख़िरी गिरजा"));
  put(
    "boss.bellRinger.healthShieldedA11y",
    localized("{percent}% health. Shielded", "Здоровье: {percent}%. Под щитом", "स्वास्थ्य {percent}%। ढाल सक्रिय")
  );
  put(
    "boss.bellRinger.healthVulnerableA11y",
    localized("{percent}% health. Vulnerable", "Здоровье: {percent}%. Уязвим", "स्वास्थ्य {percent}%। भेद्य")
  );
  put(
    "boss.bellRinger.silenceBells",
    localized(
      "IMMUNE · SILENCE {count} BELLS",
      "НЕУЯЗВИМ · ЗАГЛУШИТЕ КОЛОКОЛА: {count}",
      "अभेद्य · {count} घंटियाँ शांत करें"
    )
  );
  put("boss.bellRinger.lastJudgment", localized("LAST JUDGMENT · BELLS EVERY 7 SECONDS", "ПОСЛЕДНИЙ СУД · КОЛОКОЛА КАЖДЫЕ 7 СЕКУНД", "अंतिम न्याय · हर 7 सेकंड घंटियाँ"));
  put("boss.bellRinger.resistance", localized("VULNERABLE · 40% DAMAGE RESISTANCE", "УЯЗВИМ · 40% СОПРОТИВЛЕНИЯ УРОНУ", "भेद्य · 40% नुकसान प्रतिरोध"));
  put("boss.bellRinger.breakQuarter", localized("VULNERABLE · BREAK THE NEXT QUARTER", "УЯЗВИМ · СНИМИТЕ ЕЩЁ ЧЕТВЕРТЬ ЗДОРОВЬЯ", "भेद्य · स्वास्थ्य की अगली चौथाई घटाएँ"));
  put("boss.bellRinger.warningTitle", localized("THE BELL TOLLS", "КОЛОКОЛ ЗВОНИТ", "घंटी बजती है"));
  put("boss.bellRinger.warningEcho", localized("THE CHURCH ECHOES", "ЦЕРКОВЬ ОТВЕЧАЕТ ЭХОМ", "गिरजाघर गूँजता है"));
  put("boss.bellRinger.warningInstruction", localized("STAND STILL · NO FIRE · NO RELOAD", "СТОЙТЕ · НЕ СТРЕЛЯЙТЕ · НЕ ПЕРЕЗАРЯЖАЙТЕСЬ", "स्थिर रहें · गोली न चलाएँ · रीलोड न करें"));
  put("boss.bellRinger.towerActiveA11y", localized("Bell tower {number} active", "Колокольня {number} активна", "घंटाघर {number} सक्रिय"));
  put("boss.bellRinger.towersGroupA11y", localized("Active bell towers", "Активные колокольни", "सक्रिय घंटाघर"));

  put("boss.ghostTrain.hudName", localized("THE LAST TRAIN TO PERDITION", "ПОСЛЕДНИЙ ПОЕЗД В ПРЕИСПОДНЮ", "नरक की आख़िरी ट्रेन"));
  put(
    "boss.ghostTrain.healthLocomotiveA11y",
    localized(
      "{percent}% health. Locomotive vulnerable, 20% damage resistance",
      "Здоровье: {percent}%. Локомотив уязвим, сопротивление урону 20%",
      "स्वास्थ्य {percent}%। इंजन भेद्य, नुकसान प्रतिरोध 20%"
    )
  );
  put(
    "boss.ghostTrain.healthTailA11y",
    localized("{percent}% health. Tail vulnerable", "Здоровье: {percent}%. Хвостовой вагон уязвим", "स्वास्थ्य {percent}%। आख़िरी डिब्बा भेद्य")
  );
  put(
    "boss.ghostTrain.healthSpectralA11y",
    localized("{percent}% health. Spectral", "Здоровье: {percent}%. Призрачный", "स्वास्थ्य {percent}%। भूत रूप")
  );
  put("boss.ghostTrain.furnaceExposed", localized("FURNACE EXPOSED · 20% DAMAGE RESISTANCE", "ТОПКА ОТКРЫТА · 20% СОПРОТИВЛЕНИЯ УРОНУ", "भट्ठी खुली · 20% नुकसान प्रतिरोध"));
  put("boss.ghostTrain.tailVulnerable", localized("MATERIALIZED · FIRE AT THE LAST WAGON", "ВОПЛОТИЛСЯ · СТРЕЛЯЙТЕ В ПОСЛЕДНИЙ ВАГОН", "साकार · आख़िरी डिब्बे पर गोली चलाएँ"));
  put("boss.ghostTrain.emerging", localized("PHANTOM TUNNEL · EMERGING ON THE NEXT TARGET", "ПРИЗРАЧНЫЙ ТОННЕЛЬ · ВЫХОДИТ У СЛЕДУЮЩЕЙ ЦЕЛИ", "भूतिया सुरंग · अगले लक्ष्य पर उभर रही है"));
  put("boss.ghostTrain.vanishing", localized("PHANTOM TUNNEL · VANISHING BETWEEN THE RAILS", "ПРИЗРАЧНЫЙ ТОННЕЛЬ · ИСЧЕЗАЕТ МЕЖДУ РЕЛЬСАМИ", "भूतिया सुरंग · पटरियों के बीच गायब हो रही है"));
  put("boss.ghostTrain.materializing", localized("WHISTLE OF PERDITION · MATERIALIZING", "СВИСТОК ИЗ ПРЕИСПОДНЕЙ · ВОПЛОЩЕНИЕ", "विनाश की सीटी · साकार हो रही है"));
  put("boss.ghostTrain.couplingBroken", localized("COUPLING BROKEN · CLEAR THE BLAST", "СЦЕПКА РАЗОРВАНА · УЙДИТЕ ОТ ВЗРЫВА", "जोड़ टूटा · धमाके से हटें"));
  put("boss.ghostTrain.followRails", localized("SPECTRAL · FOLLOW THE RAILS", "ПРИЗРАЧНЫЙ · ДЕРЖИТЕСЬ РЕЛЬСОВ", "भूत रूप · पटरियों के साथ चलें"));
  put("boss.ghostTrain.locomotiveAttached", localized("Locomotive attached", "Локомотив сцеплен", "इंजन जुड़ा"));
  put("boss.ghostTrain.wagonAttached", localized("Wagon {number} attached", "Вагон {number} сцеплен", "डिब्बा {number} जुड़ा"));
  put("boss.ghostTrain.locomotiveState", localized("Locomotive {state}", "Локомотив: {state}", "इंजन: {state}"));
  put("boss.ghostTrain.wagonState", localized("Wagon {number} {state}", "Вагон {number}: {state}", "डिब्बा {number}: {state}"));
  put("boss.ghostTrain.sectionsA11y", localized("Ghost Train sections", "Секции Призрачного поезда", "भूतिया ट्रेन के हिस्से"));

  put("boss.doppelganger.hudName", localized("YOU???", "ЭТО ТЫ???", "तुम???"));
  put("boss.doppelganger.oneCopy", localized("1 COPY REMAINS", "ОСТАЛАСЬ 1 КОПИЯ", "1 प्रतिरूप बाकी"));
  put("boss.doppelganger.copies", localized("{count} COPIES REMAIN", "ОСТАЛОСЬ КОПИЙ: {count}", "{count} प्रतिरूप बाकी"));
  put("boss.doppelganger.broken", localized("THE MIRROR IS BROKEN", "ЗЕРКАЛО РАЗБИТО", "आईना टूट गया"));
  put("boss.doppelganger.mirroring", localized("MIRRORING YOUR BUILD", "КОПИРУЕТ ВАШУ СБОРКУ", "आपके बिल्ड की नकल"));
  put("boss.doppelganger.defeatedA11y", localized("Defeated.", "Побеждён.", "पराजित।"));
  put(
    "boss.doppelganger.healthA11y",
    localized(
      "{percent}% health. Mirroring your build.",
      "Здоровье: {percent}%. Копирует вашу сборку.",
      "स्वास्थ्य {percent}%। आपके बिल्ड की नकल कर रहा है।"
    )
  );
  put(
    "boss.doppelganger.healthCopiesA11y",
    localized(
      "{percent}% health. {count} copies remain.",
      "Здоровье: {percent}%. Осталось копий: {count}.",
      "स्वास्थ्य {percent}%। {count} प्रतिरूप बाकी।"
    )
  );
  put(
    "boss.doppelganger.healthOneCopyA11y",
    localized(
      "{percent}% health. 1 copy remains.",
      "Здоровье: {percent}%. Осталась 1 копия.",
      "स्वास्थ्य {percent}%। 1 प्रतिरूप बाकी।"
    )
  );

  put("boss.sloth.name", localized("BOB · THE ARCHBISHOP OF SLOTH", "БОБ · АРХИЕПИСКОП ЛЕНИ", "बॉब · आलस्य का महाधर्माध्यक्ष"));
  put("boss.sloth.healthDormantA11y", localized("{percent}% health. Dormant", "Здоровье: {percent}%. Дремлет", "स्वास्थ्य {percent}%। सुप्त"));
  put(
    "boss.sloth.healthRotatingPalmsA11y",
    localized(
      "{percent}% health. Two rotating palms block opposite projectile sectors",
      "Здоровье: {percent}%. Две вращающиеся ладони перекрывают огонь с противоположных сторон",
      "स्वास्थ्य {percent}%। दो घूमती हथेलियाँ विपरीत दिशाओं के प्रक्षेप्य रोकती हैं"
    )
  );
  put(
    "boss.sloth.healthFrontalPalmsA11y",
    localized(
      "{percent}% health. Frontal palms can block projectiles",
      "Здоровье: {percent}%. Передние ладони могут блокировать выстрелы",
      "स्वास्थ्य {percent}%। सामने की हथेलियाँ प्रक्षेप्य रोक सकती हैं"
    )
  );
  put(
    "boss.sloth.healthSupportLegsA11y",
    localized(
      "{percent}% health. Support legs leave front and rear open, but rotating palms may cover them",
      "Здоровье: {percent}%. Опорные ноги оставляют босса открытым спереди и сзади, но ладони могут прикрыть эти зоны",
      "स्वास्थ्य {percent}%। सहारे वाले पैर आगे और पीछे का भाग खुला छोड़ते हैं, पर घूमती हथेलियाँ उसे ढक सकती हैं"
    )
  );
  put(
    "boss.sloth.palmsRotating",
    localized(
      "Two rotating palms block opposite projectile sectors",
      "Две вращающиеся ладони перекрывают огонь с противоположных сторон",
      "दो घूमती हथेलियाँ विपरीत दिशाओं के प्रक्षेप्य रोकती हैं"
    )
  );
  put(
    "boss.sloth.palmsFrontal",
    localized(
      "Frontal palms can block projectiles",
      "Передние ладони могут блокировать выстрелы",
      "सामने की हथेलियाँ प्रक्षेप्य रोक सकती हैं"
    )
  );
  put(
    "boss.sloth.supportLegs",
    localized(
      "Support legs leave front and rear open, but rotating palms may cover them",
      "Опорные ноги оставляют босса открытым спереди и сзади, но ладони могут прикрыть эти зоны",
      "सहारे वाले पैर आगे और पीछे का भाग खुला छोड़ते हैं, पर घूमती हथेलियाँ उसे ढक सकती हैं"
    )
  );

  put("multiplayer.spectator.waitingOther", localized("Waiting for another player", "Ожидание другого игрока", "दूसरे खिलाड़ी की प्रतीक्षा"));
  put("multiplayer.history.wentDown", localized("{name} went down", "{name} повержен", "{name} गिर गए"));
  put("multiplayer.history.fellForGood", localized("{name} fell for good", "{name} выбыл окончательно", "{name} हमेशा के लिए बाहर हो गए"));
  put("multiplayer.history.left", localized("{name} left the match", "{name} покинул матч", "{name} ने मैच छोड़ दिया"));
  put("multiplayer.history.wentDownAt", localized("{name} went down at {time}", "{name} повержен, время {time}", "{name} गिर गए, समय {time}"));
  put("multiplayer.history.fellForGoodAt", localized("{name} fell for good at {time}", "{name} выбыл окончательно, время {time}", "{name} हमेशा के लिए बाहर हो गए, समय {time}"));
  put("multiplayer.history.leftAt", localized("{name} left the match at {time}", "{name} покинул матч, время {time}", "{name} ने मैच छोड़ दिया, समय {time}"));
  put("multiplayer.history.atTime", localized("{event} at {time}", "{event}, время {time}", "{event}, समय {time}"));
  put("multiplayer.player.defaultCowboy", localized("Cowboy", "Ковбой", "काउबॉय"));
  put(
    "multiplayer.upgrade.classDescription",
    localized(
      "Unlock {weapon} and its class progression.",
      "Откройте {weapon} и развитие соответствующего класса.",
      "{weapon} और उससे जुड़े वर्ग की प्रगति खोलें।"
    )
  );
  put(
    "multiplayer.upgrade.branchDescription",
    localized(
      "Choose this permanent class branch for the rest of the match.",
      "Выберите эту постоянную ветвь класса до конца матча.",
      "बाकी मैच के लिए इस स्थायी वर्ग-मार्ग को चुनें।"
    )
  );
  put("multiplayer.upgrades.title", localized("Choose an Upgrade", "Выберите улучшение", "एक सुधार चुनें"));
  put("classChoice.title", localized("Choose Your Path", "Выберите свой путь", "अपना मार्ग चुनें"));
  put("mastery.revolver.title", localized("Choose Your Iron", "Выберите свой ствол", "अपनी बंदूक चुनें"));
  put("mastery.rifle.title", localized("Choose Your Trail", "Выберите свою тропу", "अपनी राह चुनें"));
  put("mastery.launcher.title", localized("Choose Your Fuse", "Выберите свой запал", "अपना पलीता चुनें"));
  put("mastery.marshal.title", localized("Choose Your Oath", "Выберите свою клятву", "अपनी शपथ चुनें"));
  put("levelUp.title", localized("Level Up", "Новый уровень", "नया स्तर"));
  put(
    "multiplayer.upgrades.waitingSubtitle",
    localized(
      "New choices wait behind the notification without pausing the match.",
      "Новые варианты доступны через уведомление; матч не останавливается.",
      "नए विकल्प सूचना खोलने पर मिलेंगे; मैच नहीं रुकेगा।"
    )
  );
  put(
    "classChoice.subtitle",
    localized(
      "Level {level}. Pick a role for this run.",
      "Уровень {level}. Выберите роль для этой охоты.",
      "स्तर {level}। इस शिकार के लिए भूमिका चुनें।"
    )
  );
  put(
    "mastery.revolver.subtitle",
    localized(
      "Level {level}. The revolver path splits.",
      "Уровень {level}. Путь револьвера раздваивается.",
      "स्तर {level}। रिवॉल्वर का मार्ग दो भागों में बँटता है।"
    )
  );
  put(
    "mastery.rifle.subtitle",
    localized(
      "Level {level}. The Winchester path splits.",
      "Уровень {level}. Путь Винчестера раздваивается.",
      "स्तर {level}। विनचेस्टर का मार्ग दो भागों में बँटता है।"
    )
  );
  put(
    "mastery.launcher.subtitle",
    localized(
      "Level {level}. The launcher path splits.",
      "Уровень {level}. Путь гранатомёта раздваивается.",
      "स्तर {level}। लॉन्चर का मार्ग दो भागों में बँटता है।"
    )
  );
  put(
    "mastery.marshal.subtitle",
    localized(
      "Level {level}. The Marshal path splits.",
      "Уровень {level}. Путь Маршала раздваивается.",
      "स्तर {level}। मार्शल का मार्ग दो भागों में बँटता है।"
    )
  );
  put(
    "multiplayer.upgrades.pendingCount",
    localized("{count} pending upgrades", "Доступных улучшений: {count}", "बाकी सुधार: {count}")
  );

  put("multiplayer.lobby.foundCount", localized("{count} found", "Найдено: {count}", "मिले: {count}"));
  put("multiplayer.lobby.noMatches", localized("No matches found yet", "Матчи пока не найдены", "अभी कोई मैच नहीं मिला"));
  put("multiplayer.lobby.nearbyHost", localized("Nearby host", "Ведущий поблизости", "पास का होस्ट"));
  put("multiplayer.lobby.join", localized("Join", "Присоединиться", "जुड़ें"));
  put("multiplayer.lobby.ready", localized("Ready", "Готов", "तैयार"));
  put("multiplayer.lobby.notReady", localized("Not Ready", "Не готов", "तैयार नहीं"));
  put("multiplayer.lobby.cancelReady", localized("Cancel Ready", "Отменить готовность", "तैयारी हटाएँ"));
  put(
    "multiplayer.lobby.block.hostNotReady",
    localized("The host is not ready to start yet.", "Ведущий ещё не готов начать.", "होस्ट अभी शुरू करने के लिए तैयार नहीं है।")
  );
  put(
    "multiplayer.lobby.block.needTwoPlayers",
    localized("At least two players are required.", "Нужно как минимум два игрока.", "कम से कम दो खिलाड़ी चाहिए।")
  );
  put(
    "multiplayer.lobby.block.verifyCode",
    localized("Finish verifying the connection code.", "Завершите проверку кода подключения.", "कनेक्शन कोड की जाँच पूरी करें।")
  );
  put(
    "multiplayer.lobby.block.waitForPlayer",
    localized("Wait for the new player to appear in the lobby.", "Подождите, пока новый игрок появится в комнате.", "नए खिलाड़ी के लॉबी में आने तक रुकें।")
  );
  put(
    "multiplayer.lobby.block.everyoneReady",
    localized("Every player must be connected and ready.", "Все игроки должны подключиться и подтвердить готовность.", "हर खिलाड़ी जुड़ा और तैयार होना चाहिए।")
  );
  put(
    "multiplayer.lobby.block.unconfirmedPlayer",
    localized("One player has not confirmed the connection yet.", "Один игрок ещё не подтвердил подключение.", "एक खिलाड़ी ने अभी कनेक्शन की पुष्टि नहीं की है।")
  );
  put(
    "multiplayer.lobby.block.syncingRoster",
    localized("The lobby roster is still synchronizing.", "Список игроков комнаты ещё синхронизируется.", "लॉबी की खिलाड़ी-सूची अभी सिंक हो रही है।")
  );

  put("multiplayer.lobby.status.choose", localized("Create a match or find nearby cowboys.", "Создайте матч или найдите ковбоев поблизости.", "मैच होस्ट करें या पास के काउबॉय खोजें।"));
  put("multiplayer.lobby.status.androidOnly", localized("Nearby Connections is available in the Android APK.", "Nearby Connections доступен в APK для Android.", "Nearby Connections केवल Android APK में उपलब्ध है।"));
  put("multiplayer.lobby.status.permission", localized("Allow Android to find nearby devices for local play…", "Разрешите Android искать устройства поблизости для локальной игры…", "स्थानीय खेल के लिए Android को पास के डिवाइस खोजने दें…"));
  put("multiplayer.lobby.status.permissionGranted", localized("Permission granted. Create a match or find nearby cowboys.", "Разрешение получено. Создайте матч или найдите ковбоев поблизости.", "अनुमति मिल गई। मैच होस्ट करें या पास के काउबॉय खोजें।"));
  put("multiplayer.lobby.status.hostAndroidOnly", localized("Nearby hosting is available only in the Android APK.", "Создать локальный матч можно только в APK для Android.", "Nearby होस्टिंग केवल Android APK में उपलब्ध है।"));
  put("multiplayer.lobby.status.startingHost", localized("Starting a local host…", "Создаём локальный матч…", "लोकल होस्ट शुरू हो रहा है…"));
  put("multiplayer.lobby.status.created", localized("Match created. Tap Find on the other phones.", "Матч создан. Нажмите «Найти» на других телефонах.", "मैच बन गया। दूसरे फ़ोन पर “आस-पास खोजें” दबाएँ।"));
  put("multiplayer.lobby.status.discoveryAndroidOnly", localized("Nearby discovery is available only in the Android APK.", "Искать локальные матчи можно только в APK для Android.", "Nearby खोज केवल Android APK में उपलब्ध है।"));
  put("multiplayer.lobby.status.looking", localized("Looking for nearby matches…", "Поиск матчей поблизости…", "पास के मैच खोजे जा रहे हैं…"));
  put("multiplayer.lobby.status.discoveryStarted", localized("Discovery started. Looking for nearby matches…", "Поиск начат. Ищем матчи поблизости…", "खोज शुरू हुई। पास के मैच ढूँढे जा रहे हैं…"));
  put("multiplayer.lobby.status.selectMatch", localized("Select a discovered match first.", "Сначала выберите найденный матч.", "पहले मिला हुआ कोई मैच चुनें।"));
  put("multiplayer.lobby.status.connecting", localized("Connecting to the selected match…", "Подключение к выбранному матчу…", "चुने हुए मैच से जुड़ रहे हैं…"));
  put("multiplayer.lobby.status.compareCode", localized("Compare this code on both phones: {code}", "Сравните этот код на обоих телефонах: {code}", "दोनों फ़ोन पर यह कोड मिलाएँ: {code}"));
  put("multiplayer.lobby.status.connectionCanceled", localized("Connection canceled.", "Подключение отменено.", "कनेक्शन रद्द हुआ।"));
  put("multiplayer.lobby.status.connectedSyncing", localized("Connected. Synchronizing the lobby…", "Подключено. Синхронизация комнаты…", "कनेक्ट हो गए। लॉबी सिंक हो रही है…"));
  put("multiplayer.lobby.status.disconnected", localized("A player disconnected.", "Игрок отключился.", "एक खिलाड़ी का कनेक्शन टूट गया।"));
  put("multiplayer.lobby.status.connectFailed", localized("Could not connect.", "Не удалось подключиться.", "जुड़ नहीं सके।"));
  put("multiplayer.lobby.status.playerConnected", localized("Player connected. Mark yourself ready.", "Игрок подключился. Подтвердите готовность.", "खिलाड़ी जुड़ गया। “तैयार” दबाएँ।"));
  put("multiplayer.lobby.error.full", localized("The match is already full.", "Матч уже заполнен.", "मैच पहले ही भर चुका है।"));
  put("multiplayer.lobby.error.starting", localized("The match is already starting. Find another host.", "Матч уже начинается. Найдите другого ведущего.", "मैच शुरू हो रहा है। दूसरा होस्ट खोजें।"));
  put("multiplayer.lobby.error.version", localized("Incompatible game version.", "Несовместимая версия игры.", "खेल का संस्करण मेल नहीं खाता।"));
  put("multiplayer.lobby.error.protocolMap", localized("The protocol version or map data does not match.", "Версия протокола или данные карты не совпадают.", "प्रोटोकॉल संस्करण या मानचित्र डेटा मेल नहीं खाता।"));
  put("multiplayer.lobby.status.syncMap", localized("Synchronizing the host map…", "Синхронизация карты ведущего…", "होस्ट का मानचित्र सिंक हो रहा है…"));
  put("multiplayer.lobby.status.entered", localized("You are in the lobby. Tap Ready when you are set.", "Вы в комнате. Нажмите «Готов», когда будете готовы.", "आप लॉबी में हैं। तैयार होने पर “तैयार” दबाएँ।"));
  put("multiplayer.lobby.status.hostDisconnected", localized("The host disconnected. You can search for another nearby match.", "Ведущий отключился. Можно найти другой матч поблизости.", "होस्ट का कनेक्शन टूट गया। अब पास का दूसरा मैच खोज सकते हैं।"));
  put("multiplayer.lobby.status.playerLeftStartup", localized("A player disconnected during startup.", "Игрок отключился во время запуска.", "शुरू करते समय एक खिलाड़ी का जुड़ाव टूट गया।"));
  put("multiplayer.lobby.status.lockRoster", localized("Locking the roster and waiting for every player to confirm…", "Фиксируем состав и ждём подтверждения всех игроков…", "खिलाड़ी-सूची लॉक हो रही है; सबकी पुष्टि का इंतज़ार है…"));
  put("multiplayer.lobby.error.prepareAll", localized("Could not prepare every phone for the match.", "Не удалось подготовить все телефоны к матчу.", "मैच के लिए हर फ़ोन तैयार नहीं हो सका।"));
  put("multiplayer.lobby.error.confirmTimeout", localized("Not every player confirmed the start in time.", "Не все игроки вовремя подтвердили запуск.", "हर खिलाड़ी ने समय पर शुरुआत की पुष्टि नहीं की।"));
  put("multiplayer.lobby.error.invalidRoster", localized("The host sent an invalid match roster.", "Ведущий отправил неверный состав матча.", "होस्ट ने गलत खिलाड़ी-सूची भेजी।"));
  put("multiplayer.lobby.status.generatingMap", localized("Generating the new match map…", "Создание карты нового матча…", "नए मैच का मानचित्र बन रहा है…"));
  put("multiplayer.lobby.error.generateMap", localized("Could not generate the host's match map.", "Не удалось создать карту матча ведущего.", "होस्ट के मैच का मानचित्र नहीं बन सका।"));
  put("multiplayer.lobby.status.confirmStart", localized("Everyone is ready. Confirming the start with the host…", "Все готовы. Подтверждаем запуск с ведущим…", "सब तैयार हैं। होस्ट के साथ शुरुआत की पुष्टि हो रही है…"));
  put("multiplayer.lobby.error.confirmStart", localized("Could not confirm the start. Try connecting again.", "Не удалось подтвердить запуск. Подключитесь снова.", "शुरुआत की पुष्टि नहीं हुई। फिर से जुड़ने का प्रयास करें।"));
  put("multiplayer.lobby.error.startAll", localized("Could not start the match on every phone.", "Не удалось запустить матч на всех телефонах.", "हर फ़ोन पर मैच शुरू नहीं हो सका।"));
  put("multiplayer.lobby.error.startCanceled", localized("Start canceled.", "Запуск отменён.", "शुरुआत रद्द हुई।"));
  put("multiplayer.lobby.error.startMismatch", localized("Cannot start the match: the map or game version does not match.", "Невозможно начать матч: карта или версия игры не совпадает.", "मैच शुरू नहीं हो सकता: मानचित्र या खेल संस्करण मेल नहीं खाता।"));
  put("multiplayer.lobby.status.finished", localized("Match finished. Mark yourself ready when you want to play again.", "Матч завершён. Подтвердите готовность, когда захотите сыграть снова.", "मैच खत्म हुआ। फिर खेलना चाहें तो “तैयार” दबाएँ।"));

  put("multiplayer.nearby.error.generic", localized("Nearby Connections error", "Ошибка Nearby Connections", "Nearby Connections में त्रुटि"));
  put("multiplayer.nearby.error.hostRunning", localized("A Nearby host is already running. Wait a moment and try again.", "Ведущий Nearby уже запущен. Немного подождите и повторите попытку.", "Nearby होस्ट पहले से चल रहा है। थोड़ा रुककर फिर प्रयास करें।"));
  put("multiplayer.nearby.error.closing", localized("Nearby is still closing the previous mode. Wait a moment and try again.", "Nearby ещё завершает предыдущий режим. Немного подождите и повторите попытку.", "Nearby अभी पिछला मोड बंद कर रहा है। थोड़ा रुककर फिर प्रयास करें।"));
  put("multiplayer.nearby.error.wireless", localized("Could not start Nearby wireless communication. Enable Bluetooth and Wi-Fi, then try again.", "Не удалось запустить беспроводную связь Nearby. Включите Bluetooth и Wi‑Fi, затем повторите попытку.", "Nearby वायरलेस कनेक्शन शुरू नहीं हुआ। Bluetooth और Wi‑Fi चालू करके फिर प्रयास करें।"));
  put("multiplayer.nearby.error.location", localized("Nearby requires Location to be enabled in your phone settings.", "Для Nearby необходимо включить геолокацию в настройках телефона.", "Nearby के लिए फ़ोन की सेटिंग में स्थान चालू होना चाहिए।"));
  put("multiplayer.nearby.error.busy", localized("Nearby Connections is busy in another app. Close other Nearby apps or restart Bluetooth.", "Nearby Connections занят другим приложением. Закройте другие Nearby-приложения или перезапустите Bluetooth.", "Nearby Connections किसी दूसरे ऐप में व्यस्त है। दूसरे Nearby ऐप बंद करें या Bluetooth फिर चालू करें।"));
  put("multiplayer.nearby.error.permission", localized("Nearby permission was not granted. Allow Bluetooth, nearby devices, Wi-Fi, and location access for this app.", "Нет разрешений Nearby. Разрешите приложению доступ к Bluetooth, устройствам поблизости, Wi‑Fi и геолокации.", "Nearby की अनुमति नहीं मिली। इस ऐप को Bluetooth, पास के डिवाइस, Wi‑Fi और स्थान की अनुमति दें।"));
  put("multiplayer.nearby.error.playServicesUnavailable", localized("Google Play Services is unavailable or disabled on this phone.", "Google Play Services недоступны или отключены на этом телефоне.", "इस फ़ोन पर Google Play Services उपलब्ध नहीं है या बंद है।"));
  put("multiplayer.nearby.error.playServicesUpdate", localized("Update Google Play Services and try again.", "Обновите Google Play Services и повторите попытку.", "Google Play Services अपडेट करके फिर प्रयास करें।"));
  put("multiplayer.nearby.error.enableWireless", localized("Enable Bluetooth and Wi-Fi, then try again.", "Включите Bluetooth и Wi‑Fi, затем повторите попытку.", "Bluetooth और Wi‑Fi चालू करके फिर प्रयास करें।"));
  put("multiplayer.nearby.error.playServicesRequired", localized("Nearby requires working Google Play Services on this phone.", "Для Nearby необходимы работающие Google Play Services.", "Nearby के लिए इस फ़ोन पर Google Play Services का काम करना ज़रूरी है।"));
  put("multiplayer.nearby.error.start", localized("Could not start Nearby Connections.", "Не удалось запустить Nearby Connections.", "Nearby Connections शुरू नहीं हो सका।"));
  put("multiplayer.nearby.error.code", localized("code {code}", "код {code}", "कोड {code}"));
  put("multiplayer.nearby.error.invalidMessage", localized("Invalid network message", "Неверное сетевое сообщение", "अमान्य नेटवर्क संदेश"));
  put(
    "multiplayer.connection.confirm",
    localized(
      "Connection code: {code}\n\nDoes it match on both phones?",
      "Код подключения: {code}\n\nОн совпадает на обоих телефонах?",
      "कनेक्शन कोड: {code}\n\nक्या दोनों फ़ोन पर यही कोड है?"
    )
  );

  put("multiplayer.oilBaron.boughtName", localized("BOUGHT · {name}", "КУПЛЕН · {name}", "खरीदा गया · {name}"));
  put(
    "multiplayer.oilBaron.hostileA11y",
    localized(
      "{name}, bought by the Oil Baron, hostile",
      "{name}: куплен Нефтяным бароном, враждебен",
      "{name}, तेल के बैरन ने खरीदा, शत्रुतापूर्ण"
    )
  );
  put("multiplayer.playerState.hostile", localized("HOSTILE", "ВРАГ", "शत्रु"));

  put("multiplayer.match.finalizing", localized("Finalizing match…", "Подведение итогов матча…", "मैच पूरा किया जा रहा है…"));
  put("multiplayer.results.waitingHost", localized("Waiting for Host", "Ожидание ведущего", "होस्ट की प्रतीक्षा"));
  put("multiplayer.results.askingHost", localized("Asking the host to bring everyone back to the lobby…", "Просим ведущего вернуть всех в комнату…", "होस्ट से सबको लॉबी में लौटाने को कहा जा रहा है…"));
  put("multiplayer.results.hostUnavailable", localized("Host Unavailable", "Ведущий недоступен", "होस्ट उपलब्ध नहीं"));
  put("multiplayer.results.hostUnavailableBody", localized("The host could not be reached. You can still return to the main menu.", "Связаться с ведущим не удалось. Вы всё ещё можете вернуться в главное меню.", "होस्ट से संपर्क नहीं हुआ। आप फिर भी मुख्य मेन्यू में लौट सकते हैं।"));
  put("multiplayer.results.draw", localized("Draw: {names}", "Ничья: {names}", "बराबरी: {names}"));
  put("multiplayer.results.winnerName", localized("Winner: {name}", "Победитель: {name}", "विजेता: {name}"));
  put(
    "multiplayer.results.winnerComposite",
    localized(
      "Winner: {name} · {reason}{dustSuffix}",
      "Победитель: {name} · {reason}{dustSuffix}",
      "विजेता: {name} · {reason}{dustSuffix}"
    )
  );
  put(
    "multiplayer.results.drawComposite",
    localized(
      "Draw: {names} · {reason}{dustSuffix}",
      "Ничья: {names} · {reason}{dustSuffix}",
      "बराबरी: {names} · {reason}{dustSuffix}"
    )
  );
  put(
    "multiplayer.results.hostDisconnectedComposite",
    localized(
      "Host disconnected · {reason}{dustSuffix}",
      "Ведущий отключился · {reason}{dustSuffix}",
      "होस्ट का कनेक्शन टूटा · {reason}{dustSuffix}"
    )
  );
  put("multiplayer.results.hostDisconnected", localized("Host disconnected", "Ведущий отключился", "होस्ट का कनेक्शन टूटा"));
  put("multiplayer.results.victory", localized("Victory", "Победа", "विजय"));
  put("multiplayer.results.finishedTitle", localized("Match Finished", "Матч завершён", "मैच समाप्त"));
  put("multiplayer.results.connectionLost", localized("Connection Lost", "Соединение потеряно", "कनेक्शन टूट गया"));
  put("multiplayer.results.lastSurvivorReason", localized("the last survivor took the lead", "последний выживший вышел вперёд", "अंतिम जीवित खिलाड़ी आगे निकला"));
  put("multiplayer.results.standingsReason", localized("final score standings", "итоговое положение по очкам", "अंतिम अंक तालिका"));
  put("multiplayer.results.dust", localized("· +{dust} Dust ×{multiplier}", "· +{dust} Пыли ×{multiplier}", "· +{dust} धूल ×{multiplier}"));
  put("multiplayer.scoreboard.alive", localized("Alive: {alive} / {total}", "В живых: {alive} / {total}", "जीवित: {alive} / {total}"));
  put("multiplayer.player.you", localized("(you)", "(вы)", "(आप)"));
  put("multiplayer.player.nameYou", localized("{name} (you)", "{name} (вы)", "{name} (आप)"));
  put("multiplayer.playerState.enforcer", localized("BARON'S ENFORCER", "БОЕЦ БАРОНА", "बैरन का सिपाही"));
  put("multiplayer.playerState.surrendered", localized("Surrendered", "Сдался", "हार मानी"));
  put("multiplayer.playerState.fighting", localized("Fighting", "В бою", "लड़ रहे हैं"));
  put("multiplayer.playerState.down", localized("Down · {seconds}s", "Повержен · {seconds} с", "गिरे · {seconds} सेकंड"));
  put("multiplayer.results.winner", localized("Winner", "Победитель", "विजेता"));
  put("multiplayer.results.eliminated", localized("Eliminated", "Выбыл", "बाहर हुए"));
  put("multiplayer.death.notEnoughPoints", localized("Not enough points", "Недостаточно очков", "पर्याप्त अंक नहीं"));
  put("multiplayer.match.unstable", localized("Connection to the host is unstable", "Соединение с ведущим нестабильно", "होस्ट से कनेक्शन अस्थिर है"));
  put(
    "multiplayer.respawn.label",
    localized(
      "RETURNING TO THE FIGHT\nPreparing the battlefield…",
      "ВОЗВРАЩЕНИЕ В БОЙ\nПодготовка поля боя…",
      "लड़ाई में वापसी\nरणभूमि तैयार हो रही है…"
    )
  );

  put("contracts.group.hunting", localized("Hunting", "Охота", "शिकार"));
  put("contracts.group.arsenal", localized("Arsenal", "Арсенал", "शस्त्रागार"));
  put("contracts.group.wanted", localized("Wanted", "Разыскиваются", "वांछित"));
  put("contracts.group.journey", localized("Journey", "Путь", "यात्रा"));
  put("contracts.group.multiplayer", localized("Multiplayer", "Игра с другими", "मल्टीप्लेयर"));
  put("contracts.group.fallback", localized("Contract", "Контракт", "अनुबंध"));

  put(
    "unlocks.class.gunslinger.description",
    localized(
      "Revolver specialist. At level 10, choose between Dual Revolvers and Big Iron.",
      "Специалист по револьверам. На 10-м уровне выберите парные револьверы или Большой ствол.",
      "रिवॉल्वर विशेषज्ञ। स्तर 10 पर दो रिवॉल्वर या बिग आयरन में से चुनें।"
    )
  );
  put(
    "unlocks.class.ranger.description",
    localized(
      "Unlocks the Winchester and its barrage or trap mastery paths.",
      "Открывает Винчестер и пути шквального огня или ловушек.",
      "विनचेस्टर और उसके बौछार या फंदों वाले महारत-मार्ग खोलता है।"
    )
  );
  put(
    "unlocks.class.demolitionist.description",
    localized(
      "Unlocks the launcher and its bombardment or fire mastery paths.",
      "Открывает гранатомёт и пути бомбардира или пиротехника.",
      "ग्रेनेड लॉन्चर और उसके बमबारी या अग्नि वाले महारत-मार्ग खोलता है।"
    )
  );
  put(
    "unlocks.class.marshal.description",
    localized(
      "Unlocks the Coach Gun and its breach or consecrated mastery paths.",
      "Открывает двустволку и пути штурма или освящения.",
      "डबल बैरल बंदूक और उसके धावे या पवित्रता वाले महारत-मार्ग खोलता है।"
    )
  );
  put("unlocks.branch.dualRevolvers.description", localized("A fast, generous twelve-shot revolver path.", "Быстрый револьверный путь с щедрым запасом в двенадцать выстрелов.", "बारह गोलियों वाला तेज़, भरपूर रिवॉल्वर मार्ग।"));
  put("unlocks.branch.bigIron.description", localized("A deliberate high-caliber revolver path.", "Неторопливый револьверный путь крупного калибра.", "बड़े कैलिबर का धीमा, सधा हुआ रिवॉल्वर मार्ग।"));
  put("unlocks.branch.leverBarrage.description", localized("Rapid Winchester volleys with a lever rhythm that ramps up to +15% fire rate.", "Быстрые залпы Винчестера и рычажный ритм — разгон до +15% к скорострельности.", "विनचेस्टर की तेज़ बौछारें और लीवर की लय — गोलीबारी की रफ़्तार +15% तक बढ़ती है।"));
  put("unlocks.branch.trailWarden.description", localized("Lay traps and control the ground behind you.", "Ставьте ловушки и держите под контролем путь позади.", "फंदे बिछाएँ और पीछे की ज़मीन पर नियंत्रण रखें।"));
  put("unlocks.branch.bombardier.description", localized("Clusters, chain detonations and heavy payloads.", "Кассетные заряды, цепные подрывы и тяжёлые боеприпасы.", "गुच्छा बम, श्रृंखला विस्फोट और भारी विस्फोटक।"));
  put("unlocks.branch.pyrotechnician.description", localized("Burning shells, rolling fire and thermite.", "Горящие гранаты, бегущее пламя и термит.", "जलते गोले, लुढ़कती आग और थर्माइट।"));
  put("unlocks.branch.breachMarshal.description", localized("Close-range momentum and brutal Coach Gun blasts.", "Напор в ближнем бою и сокрушительные выстрелы из двустволки.", "नज़दीकी गोलीबारी का जोश और डबल बैरल बंदूक के क्रूर धमाके।"));
  put("unlocks.branch.graveWarden.description", localized("Bounties, rites and consecrated ground.", "Награды, обряды и освящённая земля.", "इनाम, संस्कार और पवित्र भूमि।"));

  put("unlocks.status.nextRun", localized("Unlocks affect your next run.", "Новые возможности начнут действовать в следующей охоте.", "नई सुविधाएँ अगले शिकार से लागू होंगी।"));
  put("unlocks.status.classes", localized("Buy a class once. It will appear at level 5 from your next run.", "Купите класс один раз — со следующей охоты он появится на 5-м уровне.", "वर्ग एक बार खरीदें। अगले शिकार से वह स्तर 5 पर दिखाई देगा।"));
  put("unlocks.status.mastery", localized("Every class starts with one path. Seal its weapon contract to open the second.", "Каждый класс начинает с одного пути. Завершите оружейный контракт, чтобы открыть второй.", "हर वर्ग एक मार्ग से शुरू करता है। दूसरा खोलने के लिए उसका हथियार अनुबंध पूरा करें।"));
  put("unlocks.status.cards", localized("Each card unlock visibly expands its matching draft pool next run.", "Каждая открытая карта заметно расширяет соответствующий набор в следующей охоте.", "हर खुला पत्ता अगले शिकार में संबंधित चुनाव-समूह को बढ़ाता है।"));
  put("unlocks.status.marked", localized("Choose exactly 5 unlocked cards. They roll at x2 weight, never as a guarantee.", "Выберите ровно 5 открытых карт. Они будут выпадать вдвое чаще (×2), но без гарантии.", "ठीक 5 खुले पत्ते चुनें। चुनाव में उनका वज़न ×2 होगा, पर गारंटी नहीं।"));
  put("unlocks.category.class", localized("Class", "Класс", "वर्ग"));
  put("unlocks.cards.fallbackDescription", localized("Adds a new build choice to its matching draft pool.", "Добавляет новый вариант сборки в соответствующий набор карт.", "संबंधित चुनाव-समूह में बिल्ड का नया विकल्प जोड़ता है।"));
  put("unlocks.cards.pathLabel", localized("{className} · {branchName}", "{className} · {branchName}", "{className} · {branchName}"));
  put("unlocks.cards.frontierCard", localized("Frontier card", "Карта фронтира", "सीमांत पत्ता"));
  put("unlocks.state.unlocked", localized("Unlocked", "Открыто", "खुला"));
  put("unlocks.state.locked", localized("Locked", "Закрыто", "बंद"));
  put("unlocks.state.classLocked", localized("Class locked", "Класс закрыт", "वर्ग बंद"));
  put("unlocks.state.contract", localized("Contract", "Контракт", "अनुबंध"));
  put("unlocks.state.dormant", localized("Dormant", "Неактивно", "सुप्त"));
  put("unlocks.state.inherent", localized("Inherent", "Встроено", "मूल"));
  put("unlocks.state.core", localized("Core", "Базовая", "मूल पत्ता"));
  put("unlocks.action.unlock", localized("Unlock", "Открыть", "खोलें"));
  put("unlocks.action.unlockForDust", localized("Unlock {label} for {dust} Dust", "Открыть «{label}» за {dust} Пыли", "{label} खोलने के लिए {dust} धूल खर्च करें"));
  put("unlocks.price.dust", localized("{dust} Dust", "{dust} Пыли", "{dust} धूल"));
  put("unlocks.owned", localized("Owned", "Получено", "प्राप्त"));
  put("unlocks.starterClass", localized("Starter class", "Начальный класс", "आरंभिक वर्ग"));
  put("unlocks.class.fallbackDescription", localized("A new frontier playstyle.", "Новый стиль игры на фронтире.", "सीमांत पर खेलने का नया ढंग।"));
  put("unlocks.mastery.eyebrow", localized("Level 10 mastery", "Специализация 10-го уровня", "स्तर 10 की महारत"));
  put("unlocks.mastery.choose", localized("Choose one of two paths during a hunt.", "Во время охоты выберите один из двух путей.", "शिकार के दौरान दो मार्गों में से एक चुनें।"));
  put("unlocks.mastery.openClass", localized("Open the class before either path can enter a hunt.", "Откройте класс, прежде чем его пути смогут появиться в охоте.", "दोनों में से कोई भी मार्ग शिकार में आए, उससे पहले वर्ग खोलें।"));
  put("unlocks.mastery.pathCount", localized("{current} / {total} paths", "Путей открыто: {current} / {total}", "मार्ग: {current} / {total}"));
  put("unlocks.mastery.fallbackDescription", localized("A distinct level 10 mastery path.", "Отдельный путь специализации 10-го уровня.", "स्तर 10 का अलग महारत-मार्ग।"));
  put("unlocks.mastery.starterPath", localized("Starter path", "Начальный путь", "आरंभिक मार्ग"));
  put("unlocks.mastery.unlockClassFirst", localized("Unlock {className} first", "Сначала откройте класс «{className}»", "पहले {className} खोलें"));
  put("unlocks.mastery.contractSealed", localized("Contract sealed", "Контракт завершён", "अनुबंध पूरा"));
  put("unlocks.mastery.contractProgress", localized("{title} · {current} / {target}", "{title} · {current} / {target}", "{title} · {current} / {target}"));

  put("unlocks.cards.notice", localized("Core cards are always available. Locked cards cost 150 Dust and join only their matching class or mastery pool.", "Базовые карты доступны всегда. Новые стоят 150 Пыли и добавляются только в набор своего класса или специализации.", "मूल पत्ते हमेशा उपलब्ध हैं। बंद पत्तों की कीमत 150 धूल है और वे केवल अपने वर्ग या महारत समूह में जुड़ते हैं।"));
  put("unlocks.cards.classArsenal", localized("Class arsenal", "Арсенал класса", "वर्ग का शस्त्रागार"));
  put("unlocks.cards.sharedArsenal", localized("Shared arsenal", "Общий арсенал", "साझा शस्त्रागार"));
  put("unlocks.cards.frontierEssentials", localized("Frontier essentials", "Основы фронтира", "सीमांत की ज़रूरतें"));
  put("unlocks.cards.separatedByPath", localized("Cards are separated by their level 10 mastery path.", "Карты разделены по путям специализации 10-го уровня.", "पत्ते स्तर 10 के महारत-मार्ग के अनुसार बाँटे गए हैं।"));
  put("unlocks.cards.generalEveryClass", localized("General cards can appear for every class.", "Общие карты могут появиться у любого класса.", "सामान्य पत्ते हर वर्ग के लिए आ सकते हैं।"));
  put("unlocks.cards.alwaysEligible", localized("Always eligible once owned.", "После получения доступна всегда.", "मिलने के बाद यह हमेशा चुनाव में आ सकता है।"));
  put("unlocks.cards.eligibleWithMastery", localized("Eligible whenever this mastery is chosen.", "Доступна при выборе этой специализации.", "यह महारत चुने जाने पर चुनाव में आ सकता है।"));
  put("unlocks.cards.unlockClassPath", localized("Unlock {className} to activate this path.", "Откройте класс «{className}», чтобы активировать этот путь.", "यह मार्ग सक्रिय करने के लिए {className} खोलें।"));
  put("unlocks.cards.completeMastery", localized("Complete its mastery contract to activate these cards.", "Завершите контракт специализации, чтобы активировать эти карты.", "ये पत्ते सक्रिय करने के लिए महारत अनुबंध पूरा करें।"));
  put("unlocks.cards.masteryPool", localized("Mastery pool", "Набор специализации", "महारत समूह"));
  put("unlocks.cards.corePool", localized("Core pool", "Базовый набор", "मूल समूह"));
  put("unlocks.cards.general", localized("General cards", "Общие карты", "सामान्य पत्ते"));
  put("unlocks.cards.pathOpen", localized("Path open", "Путь открыт", "मार्ग खुला"));
  put("unlocks.cards.pathLocked", localized("Path locked", "Путь закрыт", "मार्ग बंद"));
  put("unlocks.cards.masteryCard", localized("Mastery card", "Карта специализации", "महारत का पत्ता"));
  put("unlocks.cards.ownedRequires", localized("Owned · Requires {requirement}", "Получено · Требуется: {requirement}", "प्राप्त · चाहिए: {requirement}"));
  put("unlocks.cards.itsPath", localized("its path", "соответствующий путь", "इसका मार्ग"));
  put("unlocks.cards.builtIn", localized("Built into its mastery", "Встроено в специализацию", "महारत में शामिल"));
  put("unlocks.cards.starterPool", localized("Starter pool", "Начальный набор", "आरंभिक समूह"));
  put("unlocks.cards.ownedMarked", localized("Owned · Marked x2", "Получено · Отмечено ×2", "प्राप्त · चिह्नित ×2"));

  put("unlocks.marked.title", localized("Your weighted five", "Ваша особая пятёрка", "दोगुने वज़न वाले आपके पाँच"));
  put("unlocks.marked.lockedTitle", localized("Marked Deck is locked", "Отмеченная колода закрыта", "चिह्नित गड्डी बंद है"));
  put("unlocks.marked.description", localized("Marked cards have twice the normal weight whenever they are eligible. They are not guaranteed.", "Подходящие отмеченные карты выпадают вдвое чаще обычного, но не гарантированно.", "चुनाव में आने योग्य चिह्नित पत्तों को दोगुना वज़न मिलता है, पर कोई गारंटी नहीं।"));
  put("unlocks.marked.unlockMore", localized("Unlock {count} more cards to choose five weighted favorites.", "Откройте ещё {count} карт, чтобы выбрать пять любимых с удвоенным шансом.", "दोगुने वज़न वाले पाँच पसंदीदा चुनने के लिए {count} और पत्ते खोलें।"));
  put("unlocks.marked.unlockCount", localized("{current} / {total} card unlocks", "Открыто карт: {current} / {total}", "खुले पत्ते: {current} / {total}"));
  put("unlocks.marked.selectedA11y", localized("Selected marked cards", "Выбранные отмеченные карты", "चुने हुए चिह्नित पत्ते"));
  put("unlocks.marked.empty", localized("Empty", "Пусто", "खाली"));
  put("unlocks.marked.save", localized("Save marked deck", "Сохранить отмеченную колоду", "चिह्नित गड्डी सहेजें"));
  put("unlocks.marked.chooseMore", localized("Choose {count} more", "Выберите ещё {count}", "{count} और चुनें"));

  put("unlocks.error.insufficientDust", localized("Not enough Dust for this unlock.", "Для этой покупки недостаточно Пыли.", "इसे खोलने के लिए पर्याप्त धूल नहीं है।"));
  put("unlocks.error.alreadyOwned", localized("That unlock is already owned.", "Это уже открыто.", "यह पहले से खुला है।"));
  put("unlocks.error.deckLocked", localized("Unlock 10 cards before editing the Marked Deck.", "Откройте 10 карт, прежде чем менять Отмеченную колоду.", "चिह्नित गड्डी बदलने से पहले 10 पत्ते खोलें।"));
  put("unlocks.error.exactFive", localized("Choose exactly five different cards.", "Выберите ровно пять разных карт.", "ठीक पाँच अलग पत्ते चुनें।"));
  put("unlocks.error.lockedCard", localized("A locked card cannot be marked.", "Закрытую карту нельзя отметить.", "बंद पत्ते को चिह्नित नहीं किया जा सकता।"));
  put("unlocks.error.savePurchase", localized("The purchase was cancelled because the save could not be written.", "Покупка отменена: не удалось записать сохранение.", "सेव डेटा नहीं लिखा जा सका, इसलिए खरीद रद्द हुई।"));
  put("unlocks.error.saveChange", localized("That change could not be saved.", "Не удалось сохранить это изменение.", "यह बदलाव सहेजा नहीं जा सका।"));
  put("unlocks.status.purchased", localized("{label} unlocked. It will enter your next run.", "Открыто: {label}. Появится в следующей охоте.", "{label} खुल गया। यह अगले शिकार में आएगा।"));
  put("unlocks.status.selection", localized("{current} / {total} selected. Save when all five slots are filled.", "Выбрано {current} / {total}. Сохраните, когда заполните все пять мест.", "{current} / {total} चुने। पाँचों स्थान भरने पर सहेजें।"));
  put("unlocks.status.deckSaved", localized("Marked Deck saved. These five cards roll at x2 weight next run.", "Отмеченная колода сохранена. В следующей охоте эти пять карт будут выпадать вдвое чаще.", "चिह्नित गड्डी सहेजी गई। अगले शिकार में इन पाँच पत्तों को ×2 वज़न मिलेगा।"));

  put("wardrobe.requirement.always", localized("Always available", "Доступно всегда", "हमेशा उपलब्ध"));
  put("wardrobe.requirement.unlocked", localized("Unlocked: {requirement}", "Открыто: {requirement}", "खुला: {requirement}"));
  put("wardrobe.state.equipped", localized("Equipped", "Надето", "पहना हुआ"));
  put("wardrobe.state.unlocked", localized("Unlocked", "Открыто", "खुला"));
  put("wardrobe.state.locked", localized("Locked", "Закрыто", "बंद"));
  put("wardrobe.preview.equipped", localized("Equipped", "Надето", "पहना हुआ"));
  put("wardrobe.preview.unlocked", localized("Unlocked preview", "Открытый образ", "खुले रूप का पूर्वावलोकन"));
  put("wardrobe.preview.locked", localized("Locked preview", "Закрытый образ", "बंद रूप का पूर्वावलोकन"));
  put("wardrobe.action.applied", localized("Applied", "Применено", "लगा हुआ"));
  put("wardrobe.action.apply", localized("Apply Look", "Применить образ", "रूप पहनें"));
  put("wardrobe.action.locked", localized("Locked Selection", "Выбор закрыт", "चयन बंद"));
  put("wardrobe.status.tryLive", localized("Try any look live. Nothing changes until you press Apply Look.", "Примерьте любой образ. Ничего не изменится, пока вы не нажмёте «Применить образ».", "कोई भी रूप अभी देखें। “रूप पहनें” दबाने तक कुछ नहीं बदलेगा।"));
  put("wardrobe.status.previewing", localized("Previewing {label}. Press Apply Look to keep this outfit.", "Предпросмотр: {label}. Нажмите «Применить образ», чтобы сохранить наряд.", "{label} का पूर्वावलोकन। यह पोशाक रखने के लिए “रूप पहनें” दबाएँ।"));
  put("wardrobe.status.lockedPreview", localized("{label} is a preview. {requirement}", "«{label}» показан только для примерки. {requirement}", "{label} केवल पूर्वावलोकन है। {requirement}"));
  put("wardrobe.error.requirements", localized("Complete both shown requirements before applying this look.", "Выполните оба указанных требования, прежде чем применять образ.", "यह रूप पहनने से पहले दोनों दिखाई गई शर्तें पूरी करें।"));
  put("wardrobe.error.save", localized("The look was not changed because the save could not be written.", "Образ не изменён: не удалось записать сохранение.", "सेव डेटा नहीं लिखा जा सका, इसलिए रूप नहीं बदला।"));
  put("wardrobe.status.alreadyApplied", localized("This look is already applied.", "Этот образ уже применён.", "यह रूप पहले से लगा है।"));
  put("wardrobe.status.applied", localized("Look applied. Your next hunt will use this outfit and hat.", "Образ применён. В следующей охоте будут использованы этот наряд и шляпа.", "रूप पहन लिया गया। अगले शिकार में यही पोशाक और टोपी होगी।"));
  // The bare label is the button's markup placeholder before a price is known.
  put("wardrobe.action.buyShort", localized("Buy", "Купить", "खरीद लें"));
  put("wardrobe.action.buy", localized("Buy for {cost} Dust", "Купить за {cost} Пыли", "{cost} धूल में खरीद लें"));
  put("wardrobe.error.insufficientDust", localized("Not enough Dust to buy this look yet.", "Пока не хватает Пыли, чтобы купить этот образ.", "यह रूप खरीदने के लिए अभी पर्याप्त धूल नहीं है।"));
  put("wardrobe.status.alreadyOwned", localized("You already own this look.", "Этот образ у вас уже есть.", "यह रूप आपके पास पहले से है।"));
  put("wardrobe.status.purchased", localized("Bought. Press Apply Look to wear it.", "Куплено. Нажмите «Применить образ», чтобы надеть.", "खरीद लिया। पहनने के लिए “रूप पहनें” दबाएँ।"));

  put("progression.walletA11y", localized("Dust {dust}, contracts {current} of {total}", "Пыль: {dust}, контрактов {current} из {total}", "धूल {dust}, अनुबंध {current}/{total} पूरे"));
  put("contracts.card.progressLabel", localized("Progress", "Прогресс", "प्रगति"));
  put("contracts.card.complete", localized("Complete", "Выполнено", "पूरा"));
  put("contracts.card.sealed", localized("Sealed", "Завершён", "पूर्ण"));
  put("contracts.card.active", localized("Active", "Активен", "सक्रिय"));
  put("contracts.card.rewardUnlock", localized("+1 · {label}", "+1 · {label}", "+1 · {label}"));
  put("contracts.card.rewardMark", localized("+1 Mark", "+1 метка", "+1 चिह्न"));
  put("contracts.card.rewardUnlockTitle", localized("+1 Contract Mark and unlock {label}", "+1 контрактная метка и «{label}»", "+1 अनुबंध-चिह्न और {label} खुलता है"));
  put("contracts.card.rewardMarkTitle", localized("+1 Contract Mark", "+1 контрактная метка", "+1 अनुबंध-चिह्न"));
  put("contracts.card.titleProgressA11y", localized("{title} progress", "Прогресс: {title}", "{title} की प्रगति"));
  put("progression.toast.dustSecured", localized("Dust secured", "Пыль получена", "धूल मिली"));
  put("progression.toast.dustAmount", localized("+{amount} Dust", "+{amount} Пыли", "+{amount} धूल"));
  put("progression.toast.contractSealed", localized("Contract sealed", "Контракт завершён", "अनुबंध पूरा"));
  put("progression.toast.contractMarks.one", localized("+{count} Contract Mark", "+{count} контрактная метка", "+{count} अनुबंध-चिह्न"));
  put("progression.toast.contractMarks.few", localized("+{count} Contract Marks", "+{count} контрактные метки", "+{count} अनुबंध-चिह्न"));
  put("progression.toast.contractMarks.many", localized("+{count} Contract Marks", "+{count} контрактных меток", "+{count} अनुबंध-चिह्न"));
  put("progression.toast.contractMarks.other", localized("+{count} Contract Marks", "+{count} контрактной метки", "+{count} अनुबंध-चिह्न"));
  put("progression.toast.challengeComplete", localized("Challenge complete", "Испытание пройдено", "चुनौती पूरी"));
  put("progression.toast.challengeReward", localized("{title} — unlocked: {reward}", "{title} — открыто: {reward}", "{title} — खुला: {reward}"));
  put("hud.challenge.onTrack", localized("On track", "Условие соблюдено", "शर्त कायम है"));
  put("hud.challenge.failed", localized("Failed", "Провалено", "नाकाम"));
  put("hud.challenge.waitingBoss", localized("Waiting for the boss", "Ожидание босса", "बॉस का इंतज़ार"));
  put("hud.challenge.armTrap", localized("Waiting for a trap", "Ожидание ловушки", "फंदे का इंतज़ार"));
  put("hud.challenge.reset", localized("Reset", "Сброс", "रीसेट"));
  put("hud.challenge.completed", localized("Completed", "Выполнено", "पूरा हुआ"));

  put("dev.preview.iconShowcase", localized("Icon Showcase", "Витрина значков", "चिह्न प्रदर्शनी"));
  put("dev.preview.breachOne", localized("Display only · Breach Marshal · I", "Только показ · Штурмовой маршал · I", "केवल प्रदर्शन · धावा मार्शल · I"));
  put("dev.preview.breachTwo", localized("Display only · Breach Marshal · II", "Только показ · Штурмовой маршал · II", "केवल प्रदर्शन · धावा मार्शल · II"));
  put("dev.preview.graveOne", localized("Display only · Grave Warden · I", "Только показ · Страж могил · I", "केवल प्रदर्शन · कब्र का रक्षक · I"));
  put("dev.preview.graveTwo", localized("Display only · Grave Warden · II", "Только показ · Страж могил · II", "केवल प्रदर्शन · कब्र का रक्षक · II"));

  var patterns = [
    {
      source: "^Minimap\\. Level (\\d+)\\. Experience (\\d+)%\\.$",
      key: "hud.minimap.a11y",
      params: ["level", "percent"],
    },
    { source: "^Ammo (\\d+)$", key: "hud.minimap.ammo", params: ["count"] },
    {
      source: "^LOAD (\\d+)/(\\d+) / LEFT (\\d+)$",
      key: "hud.ammo.load",
      params: ["current", "magazine", "total"],
    },
    { source: "^Empty$", key: "hud.ammo.empty", params: [] },
    { source: "^LAST MAG / LEFT (\\d+)$", key: "hud.ammo.lastMagazine", params: ["total"] },
    { source: "^LOW AMMO / LEFT (\\d+)$", key: "hud.ammo.low", params: ["total"] },
    { source: "^LEFT (\\d+)$", key: "hud.ammo.left", params: ["total"] },
    { source: "^Reload ([\\d.]+)s / Empty$", key: "hud.ammo.reloadEmpty", params: ["seconds"] },
    {
      source: "^Reload ([\\d.]+)s / LAST MAG / LEFT (\\d+)$",
      key: "hud.ammo.reloadLastMagazine",
      params: ["seconds", "total"],
    },
    {
      source: "^Reload ([\\d.]+)s / LOW AMMO / LEFT (\\d+)$",
      key: "hud.ammo.reloadLow",
      params: ["seconds", "total"],
    },
    {
      source: "^Reload ([\\d.]+)s / LEFT (\\d+)$",
      key: "hud.ammo.reloadLeft",
      params: ["seconds", "total"],
    },
    {
      source: "^R (\\d+)/(\\d+)(?:\\+(\\d+))?  L (\\d+)/(\\d+)(?:\\+(\\d+))?$",
      key: "hud.ammo.dual",
      params: ["rightCurrent", "rightMagazine", "rightFree", "leftCurrent", "leftMagazine", "leftFree"],
      transform: function (params) {
        params.rightBonus = params.rightFree ? "+" + params.rightFree : "";
        params.leftBonus = params.leftFree ? "+" + params.leftFree : "";
        delete params.rightFree;
        delete params.leftFree;
        return params;
      },
    },
    {
      source: "^(.+) ammo (\\d+) of (\\d+), right (\\d+) of (\\d+), left (\\d+) of (\\d+), reserve (\\d+)$",
      key: "hud.ammo.dualA11y",
      params: ["weapon", "current", "magazine", "rightCurrent", "rightMagazine", "leftCurrent", "leftMagazine", "reserve"],
      transform: function (params) {
        params.weapon = i18n.translateSource(params.weapon);
        return params;
      },
    },
    {
      source: "^(.+) ammo (\\d+) of (\\d+), total (\\d+), reserve (\\d+)$",
      key: "hud.ammo.a11y",
      params: ["weapon", "current", "magazine", "total", "reserve"],
      transform: function (params) {
        params.weapon = i18n.translateSource(params.weapon);
        return params;
      },
    },
    {
      source: "^Wave (\\d+) - Level (\\d+) - Score (\\d+) - Zombies (\\d+)$",
      key: "gameOver.statsDetailed",
      params: ["wave", "level", "score", "kills"],
    },
    {
      source: "^Level (\\d+)\\. Pick a boost for this run\\.$",
      key: "levelUp.subtitleWithLevel",
      params: ["level"],
    },
    { source: "^(\\d+)% health\\. Phase (\\d+)\\.$", key: "boss.healthPhase", params: ["percent", "phase"] },
    { source: "^(\\d+)% health$", key: "boss.health", params: ["percent"] },
    {
      source: "^TUNNELING TO SECTOR (.+) · ([\\d.]+)s$",
      key: "boss.landEater.tunneling",
      params: ["sector", "seconds"],
    },
    {
      source: "^DEVOURING SECTOR (.+) · ([\\d.]+)s$",
      key: "boss.landEater.devouring",
      params: ["sector", "seconds"],
    },
    { source: "^PHASE (\\d+) · THE GROUND IS HUNGRY$", key: "boss.landEater.phase", params: ["phase"] },
    {
      source: "^(\\d+)% health\\. Invulnerable during the offer$",
      key: "boss.oilBaron.healthOfferA11y",
      params: ["percent"],
    },
    {
      source: "^(\\d+)% health\\. Invulnerable during the oil starfall$",
      key: "boss.oilBaron.healthStarfallA11y",
      params: ["percent"],
    },
    {
      source: "^(\\d+)% health\\. Vulnerable$",
      key: "boss.oilBaron.healthVulnerableA11y",
      params: ["percent"],
    },
    {
      source: "^IMMUNE · STARFALL (\\d+)/(\\d+) · MOVE FROM THE MARK$",
      key: "boss.oilBaron.starfall",
      params: ["current", "total"],
    },
    {
      source: "^VULNERABLE · (\\d+) DERRICKS? PUMPING · DESTROY THEM TO DRAIN THE OIL$",
      key: "boss.oilBaron.derricksPumping",
      params: ["count"],
    },
    { source: "^DERRICKS · (\\d+)$", key: "boss.oilBaron.derricksCount", params: ["count"] },
    { source: "^1 active oil derrick$", key: "boss.oilBaron.derrickOneA11y", params: [] },
    { source: "^(\\d+) active oil derricks?$", key: "boss.oilBaron.derricksA11y", params: ["count"] },
    {
      source: "^TAKE \\$5,000 · GUNS SILENT FOR 45s · REACH THE GOLD · (\\d+)s$",
      key: "boss.oilBaron.offerSolo",
      params: ["seconds"],
    },
    {
      source: "^\\$5,000 · JOIN THE BARON · YOU DIE WITH HIM · \\+\\$5,000 IF ALL RIVALS SURRENDER · REACH THE GOLD · (\\d+)s$",
      key: "boss.oilBaron.offerMultiplayer",
      params: ["seconds"],
    },
    { source: "^(.+) TOOK THE BARON'S GOLD$", key: "boss.oilBaron.playerBought", params: ["name"] },
    { source: "^WEAPONS LOCKED · (\\d+)s$", key: "boss.oilBaron.weaponsLocked", params: ["seconds"] },
    {
      source: "^IMMUNE · SILENCE (\\d+) BELLS?$",
      key: "boss.bellRinger.silenceBells",
      params: ["count"],
    },
    { source: "^Bell tower (\\d+) active$", key: "boss.bellRinger.towerActiveA11y", params: ["number"] },
    {
      source: "^(\\d+)% health\\. Shielded$",
      key: "boss.bellRinger.healthShieldedA11y",
      params: ["percent"],
    },
    {
      source: "^(\\d+)% health\\. Locomotive vulnerable, 20% damage resistance$",
      key: "boss.ghostTrain.healthLocomotiveA11y",
      params: ["percent"],
    },
    {
      source: "^(\\d+)% health\\. Tail vulnerable$",
      key: "boss.ghostTrain.healthTailA11y",
      params: ["percent"],
    },
    {
      source: "^(\\d+)% health\\. Spectral$",
      key: "boss.ghostTrain.healthSpectralA11y",
      params: ["percent"],
    },
    { source: "^Wagon (\\d+) attached$", key: "boss.ghostTrain.wagonAttached", params: ["number"] },
    {
      source: "^Locomotive (target|attached|destroyed)$",
      key: "boss.ghostTrain.locomotiveState",
      params: ["state"],
      transform: function (params, match, locale) {
        var states = {
          en: { target: "target", attached: "attached", destroyed: "destroyed" },
          ru: { target: "цель", attached: "сцеплен", destroyed: "уничтожен" },
          hi: { target: "लक्ष्य", attached: "जुड़ा", destroyed: "नष्ट" },
        };
        params.state = states[locale][params.state] || params.state;
        return params;
      },
    },
    {
      source: "^Wagon (\\d+) (target|attached|destroyed)$",
      key: "boss.ghostTrain.wagonState",
      params: ["number", "state"],
      transform: function (params, match, locale) {
        var states = {
          en: { target: "target", attached: "attached", destroyed: "destroyed" },
          ru: { target: "цель", attached: "сцеплен", destroyed: "уничтожен" },
          hi: { target: "लक्ष्य", attached: "जुड़ा", destroyed: "नष्ट" },
        };
        params.state = states[locale][params.state] || params.state;
        return params;
      },
    },
    { source: "^(\\d+) COPIES REMAIN$", key: "boss.doppelganger.copies", params: ["count"] },
    {
      source: "^(\\d+)% health\\. Mirroring your build\\.$",
      key: "boss.doppelganger.healthA11y",
      params: ["percent"],
    },
    {
      source: "^(\\d+)% health\\. 1 copy remains\\.$",
      key: "boss.doppelganger.healthOneCopyA11y",
      params: ["percent"],
    },
    {
      source: "^(\\d+)% health\\. (\\d+) copies remain\\.$",
      key: "boss.doppelganger.healthCopiesA11y",
      params: ["percent", "count"],
    },
    {
      source: "^(\\d+)% health\\. Dormant$",
      key: "boss.sloth.healthDormantA11y",
      params: ["percent"],
    },
    {
      source: "^(\\d+)% health\\. Two rotating palms block opposite projectile sectors$",
      key: "boss.sloth.healthRotatingPalmsA11y",
      params: ["percent"],
    },
    {
      source: "^(\\d+)% health\\. Frontal palms can block projectiles$",
      key: "boss.sloth.healthFrontalPalmsA11y",
      params: ["percent"],
    },
    {
      source: "^(\\d+)% health\\. Support legs leave front and rear open, but rotating palms may cover them$",
      key: "boss.sloth.healthSupportLegsA11y",
      params: ["percent"],
    },
    { source: "^(.+) went down$", key: "multiplayer.history.wentDown", params: ["name"] },
    { source: "^(.+) fell for good$", key: "multiplayer.history.fellForGood", params: ["name"] },
    { source: "^(.+) left the match$", key: "multiplayer.history.left", params: ["name"] },
    {
      source: "^(.+) went down at (\\d+:\\d{2})$",
      key: "multiplayer.history.wentDownAt",
      params: ["name", "time"],
    },
    {
      source: "^(.+) fell for good at (\\d+:\\d{2})$",
      key: "multiplayer.history.fellForGoodAt",
      params: ["name", "time"],
    },
    {
      source: "^(.+) left the match at (\\d+:\\d{2})$",
      key: "multiplayer.history.leftAt",
      params: ["name", "time"],
    },
    {
      source: "^(.+) at (\\d+:\\d{2})$",
      key: "multiplayer.history.atTime",
      params: ["event", "time"],
    },
    {
      source: "^Unlock (.+) and its class progression\\.$",
      key: "multiplayer.upgrade.classDescription",
      params: ["weapon"],
    },
    { source: "^(\\d+) pending upgrades$", key: "multiplayer.upgrades.pendingCount", params: ["count"] },
    { source: "^(\\d+) found$", key: "multiplayer.lobby.foundCount", params: ["count"] },
    {
      source: "^Compare this code on both phones: (\\d+)$",
      key: "multiplayer.lobby.status.compareCode",
      params: ["code"],
    },
    {
      source: "^Connection code: (\\d+)\\s+Does it match on both phones\\?$",
      key: "multiplayer.connection.confirm",
      params: ["code"],
    },
    { source: "^BOUGHT · (.+)$", key: "multiplayer.oilBaron.boughtName", params: ["name"] },
    {
      source: "^(.+), bought by the Oil Baron, hostile$",
      key: "multiplayer.oilBaron.hostileA11y",
      params: ["name"],
    },
    {
      source: "^Winner: (.+) · (the last survivor took the lead|final score standings)(?: · \\+([\\d.,]+) Dust ×([\\d.,]+))?$",
      key: "multiplayer.results.winnerComposite",
      params: ["name", "reasonCode", "dust", "multiplier"],
      transform: function (params, match, locale) {
        var reasons = {
          en: {
            "the last survivor took the lead": "the last survivor took the lead",
            "final score standings": "final score standings",
          },
          ru: {
            "the last survivor took the lead": "последний выживший вышел вперёд",
            "final score standings": "итоговое положение по очкам",
          },
          hi: {
            "the last survivor took the lead": "अंतिम जीवित खिलाड़ी आगे निकला",
            "final score standings": "अंतिम अंक तालिका",
          },
        };
        params.reason = reasons[locale][params.reasonCode] || params.reasonCode;
        params.dustSuffix = params.dust
          ? locale === "ru"
            ? " · +" + params.dust + " Пыли ×" + params.multiplier
            : locale === "hi"
              ? " · +" + params.dust + " धूल ×" + params.multiplier
              : " · +" + params.dust + " Dust ×" + params.multiplier
          : "";
        delete params.reasonCode;
        delete params.dust;
        delete params.multiplier;
        return params;
      },
    },
    {
      source: "^Draw: (.+) · (the last survivor took the lead|final score standings)(?: · \\+([\\d.,]+) Dust ×([\\d.,]+))?$",
      key: "multiplayer.results.drawComposite",
      params: ["names", "reasonCode", "dust", "multiplier"],
      transform: function (params, match, locale) {
        var reasons = {
          en: {
            "the last survivor took the lead": "the last survivor took the lead",
            "final score standings": "final score standings",
          },
          ru: {
            "the last survivor took the lead": "последний выживший вышел вперёд",
            "final score standings": "итоговое положение по очкам",
          },
          hi: {
            "the last survivor took the lead": "अंतिम जीवित खिलाड़ी आगे निकला",
            "final score standings": "अंतिम अंक तालिका",
          },
        };
        params.reason = reasons[locale][params.reasonCode] || params.reasonCode;
        params.dustSuffix = params.dust
          ? locale === "ru"
            ? " · +" + params.dust + " Пыли ×" + params.multiplier
            : locale === "hi"
              ? " · +" + params.dust + " धूल ×" + params.multiplier
              : " · +" + params.dust + " Dust ×" + params.multiplier
          : "";
        delete params.reasonCode;
        delete params.dust;
        delete params.multiplier;
        return params;
      },
    },
    {
      source: "^Host disconnected · (the last survivor took the lead|final score standings)(?: · \\+([\\d.,]+) Dust ×([\\d.,]+))?$",
      key: "multiplayer.results.hostDisconnectedComposite",
      params: ["reasonCode", "dust", "multiplier"],
      transform: function (params, match, locale) {
        var reasons = {
          en: {
            "the last survivor took the lead": "the last survivor took the lead",
            "final score standings": "final score standings",
          },
          ru: {
            "the last survivor took the lead": "последний выживший вышел вперёд",
            "final score standings": "итоговое положение по очкам",
          },
          hi: {
            "the last survivor took the lead": "अंतिम जीवित खिलाड़ी आगे निकला",
            "final score standings": "अंतिम अंक तालिका",
          },
        };
        params.reason = reasons[locale][params.reasonCode] || params.reasonCode;
        params.dustSuffix = params.dust
          ? locale === "ru"
            ? " · +" + params.dust + " Пыли ×" + params.multiplier
            : locale === "hi"
              ? " · +" + params.dust + " धूल ×" + params.multiplier
              : " · +" + params.dust + " Dust ×" + params.multiplier
          : "";
        delete params.reasonCode;
        delete params.dust;
        delete params.multiplier;
        return params;
      },
    },
    { source: "^Draw: (.+)$", key: "multiplayer.results.draw", params: ["names"] },
    { source: "^Winner: (.+)$", key: "multiplayer.results.winnerName", params: ["name"] },
    { source: "^(.+) \\(you\\)$", key: "multiplayer.player.nameYou", params: ["name"] },
    {
      source: "^· \\+([\\d.,]+) Dust ×([\\d.,]+)$",
      key: "multiplayer.results.dust",
      params: ["dust", "multiplier"],
    },
    {
      source: "^Alive: (\\d+) / (\\d+)$",
      key: "multiplayer.scoreboard.alive",
      params: ["alive", "total"],
    },
    { source: "^Down · (\\d+)s$", key: "multiplayer.playerState.down", params: ["seconds"] },
    {
      source: "^Unlock (.+) for ([\\d.,]+) Dust$",
      key: "unlocks.action.unlockForDust",
      params: ["label", "dust"],
    },
    { source: "^([\\d.,]+) Dust$", key: "unlocks.price.dust", params: ["dust"] },
    {
      source: "^(\\d+) / (\\d+) paths$",
      key: "unlocks.mastery.pathCount",
      params: ["current", "total"],
    },
    {
      source: "^Unlock (.+) first$",
      key: "unlocks.mastery.unlockClassFirst",
      params: ["className"],
    },
    {
      source: "^(.+) · (\\d+) / (\\d+)$",
      key: "unlocks.mastery.contractProgress",
      params: ["title", "current", "target"],
      transform: function (params) {
        params.title = i18n.translateSource(params.title);
        return params;
      },
    },
    {
      source: "^Unlock (.+) to activate this path\\.$",
      key: "unlocks.cards.unlockClassPath",
      params: ["className"],
    },
    {
      source: "^Owned · Requires (.+)$",
      key: "unlocks.cards.ownedRequires",
      params: ["requirement"],
    },
    {
      source: "^Unlock (\\d+) more cards? to choose five weighted favorites\\.$",
      key: "unlocks.marked.unlockMore",
      params: ["count"],
    },
    {
      source: "^(\\d+) / (\\d+) card unlocks$",
      key: "unlocks.marked.unlockCount",
      params: ["current", "total"],
    },
    { source: "^Choose (\\d+) more$", key: "unlocks.marked.chooseMore", params: ["count"] },
    {
      source: "^(.+) unlocked\\. It will enter your next run\\.$",
      key: "unlocks.status.purchased",
      params: ["label"],
      transform: function (params, match, locale) {
        var classLabels = {
          en: { Gunslinger: "Gunslinger", Ranger: "Ranger", Demolitionist: "Demolitionist", Marshal: "Marshal" },
          ru: { Gunslinger: "Стрелок", Ranger: "Следопыт", Demolitionist: "Подрывник", Marshal: "Маршал" },
          hi: { Gunslinger: "बंदूकबाज़", Ranger: "सीमांत प्रहरी", Demolitionist: "विस्फोटक विशेषज्ञ", Marshal: "मार्शल" },
        };
        params.label = classLabels[locale][params.label] || params.label;
        return params;
      },
    },
    {
      source: "^(\\d+) / (\\d+) selected\\. Save when all five slots are filled\\.$",
      key: "unlocks.status.selection",
      params: ["current", "total"],
    },
    {
      source: "^Unlocked: (.+)$",
      key: "wardrobe.requirement.unlocked",
      params: ["requirement"],
      transform: function (params) {
        params.requirement = i18n.translateSource(params.requirement);
        return params;
      },
    },
    {
      source: "^Previewing (.+)\\. Press Apply Look to keep this outfit\\.$",
      key: "wardrobe.status.previewing",
      params: ["label"],
      transform: function (params) {
        params.label = i18n.translateSource(params.label);
        return params;
      },
    },
    {
      source: "^(.+) is a preview\\. (.+)$",
      key: "wardrobe.status.lockedPreview",
      params: ["label", "requirement"],
      transform: function (params) {
        params.label = i18n.translateSource(params.label);
        params.requirement = i18n.translateSource(params.requirement);
        return params;
      },
    },
    {
      source: "^Dust ([\\d.,]+), contracts (\\d+) of (\\d+)$",
      key: "progression.walletA11y",
      params: ["dust", "current", "total"],
    },
    {
      source: "^\\+1 · (.+)$",
      key: "contracts.card.rewardUnlock",
      params: ["label"],
      transform: function (params) {
        params.label = i18n.translateSource(params.label);
        return params;
      },
    },
    {
      source: "^\\+1 Contract Mark and unlock (.+)$",
      key: "contracts.card.rewardUnlockTitle",
      params: ["label"],
      transform: function (params) {
        params.label = i18n.translateSource(params.label);
        return params;
      },
    },
    {
      source: "^(.+) progress$",
      key: "contracts.card.titleProgressA11y",
      params: ["title"],
      transform: function (params) {
        params.title = i18n.translateSource(params.title);
        return params;
      },
    },
    {
      source: "^\\+([\\d.,]+) Dust$",
      key: "progression.toast.dustAmount",
      params: ["amount"],
    },
    {
      source: "^\\+(\\d+) Contract Mark$",
      key: "progression.toast.contractMarks.one",
      params: ["count"],
    },
    {
      source: "^\\+(\\d+) Contract Marks$",
      key: "progression.toast.contractMarks.other",
      params: ["count"],
    },
  ];

  function placeholderNames(value) {
    var names = [];
    String(value || "").replace(/\{([a-zA-Z0-9_]+)\}/g, function (_, name) {
      if (names.indexOf(name) === -1) names.push(name);
      return _;
    });
    return names.sort().join(",");
  }

  function assertPack() {
    var expectedKeyCount = 578;
    var expectedPatternCount = 95;
    var referenceKeys = Object.keys(messages.en).sort();
    if (referenceKeys.length !== expectedKeyCount) {
      throw new Error(
        "Gameplay locale pack must contain " +
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
        throw new Error("Gameplay locale key count differs for locale: " + locale);
      }
      for (var keyIndex = 0; keyIndex < referenceKeys.length; keyIndex++) {
        var key = referenceKeys[keyIndex];
        if (keys[keyIndex] !== key) {
          throw new Error("Gameplay locale key set differs for locale: " + locale);
        }
        if (typeof messages[locale][key] !== "string" || !messages[locale][key].trim()) {
          throw new Error("Gameplay locale value must be non-empty: " + locale + " / " + key);
        }
        if (placeholderNames(messages[locale][key]) !== placeholderNames(messages.en[key])) {
          throw new Error("Gameplay locale placeholder mismatch: " + locale + " / " + key);
        }
      }
    }
    for (var aliasSource in aliases) {
      if (
        Object.prototype.hasOwnProperty.call(aliases, aliasSource) &&
        !Object.prototype.hasOwnProperty.call(messages.en, aliases[aliasSource])
      ) {
        throw new Error("Gameplay alias targets an unknown key: " + aliasSource);
      }
    }
    if (patterns.length !== expectedPatternCount) {
      throw new Error(
        "Gameplay locale pack must contain " +
          expectedPatternCount +
          " source patterns; found " +
          patterns.length +
          "."
      );
    }
    for (var patternIndex = 0; patternIndex < patterns.length; patternIndex++) {
      if (!patterns[patternIndex] || !messages.en[patterns[patternIndex].key]) {
        throw new Error("Gameplay source pattern targets an unknown key at index " + patternIndex + ".");
      }
    }
    if (upgradeIds.length !== 86) {
      throw new Error("Gameplay locale pack must contain 86 upgrades; found " + upgradeIds.length + ".");
    }
    for (var upgradeIndex = 0; upgradeIndex < upgradeIds.length; upgradeIndex++) {
      var upgradeId = upgradeIds[upgradeIndex];
      if (
        !messages.en["upgrade." + upgradeId + ".title"] ||
        !messages.en["upgrade." + upgradeId + ".description"] ||
        !/[\u0900-\u097f]/.test(messages.hi["upgrade." + upgradeId + ".title"]) ||
        !/[\u0900-\u097f]/.test(messages.hi["upgrade." + upgradeId + ".description"])
      ) {
        throw new Error("Gameplay upgrade localization is incomplete: " + upgradeId);
      }
    }
    if (masteryFallbackIds.length !== 4) {
      throw new Error(
        "Gameplay locale pack must contain 4 mastery fallback upgrades; found " +
          masteryFallbackIds.length +
          "."
      );
    }
  }

  assertPack();
  i18n.registerPack({
    id: "gameplay",
    messages: messages,
    aliases: aliases,
    patterns: patterns,
  });
})(window);
