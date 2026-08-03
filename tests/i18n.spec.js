const path = require("node:path");
const { expect, test } = require("@playwright/test");

const LOCALES = ["en", "ru", "hi"];
const LOCALE_STORAGE_KEY = "dustAndDead.locale.v1";
const CATALOG_KEY_COUNT = 1341;
const CONTRACT_COUNT = 72;
const UPGRADE_COUNT = 86;
const CLASS_COUNT = 4;
const BRANCH_COUNT = 8;
const COSMETIC_COUNT = 34;
const HINDI_EDITORIAL_SENTINELS = {
  "common.menu": "मेन्यू",
  "common.mainMenu": "मुख्य मेन्यू",
  "guide.progress.unlocks.mastery.title": "महारत",
  "guide.controls.action.fullscreen": "फ़ुलस्क्रीन",
  "mobile.rotate.body": "यह खेल लैंडस्केप मोड के लिए बनाया गया है",
  "boss.oilBaron.name": "तेल का बैरन",
  "boss.ghostTrain.name": "भूतिया ट्रेन",
  "boss.oilBaron.healthVulnerableA11y": "स्वास्थ्य {percent}%। भेद्य",
  "boss.bellRinger.healthVulnerableA11y": "स्वास्थ्य {percent}%। भेद्य",
  "multiplayer.session.host": "होस्ट",
};
const ALL_RIGHT_ALL_LEFT_COPY = {
  en: {
    title: "ALL RIGHT",
    subtitle: "& all left",
    description:
      "One fires while the other reloads. Kills or 8-hit boss streaks grant one free round.",
  },
  ru: {
    title: "ПРАВОЕ ДЕЛО",
    subtitle: "и левое тоже",
    description:
      "Один стреляет, другой перезаряжается. Убийства или серии из 8 попаданий по боссу дают бесплатный патрон.",
  },
  hi: {
    title: "दायाँ ही सही",
    subtitle: "बायाँ भी सही",
    description:
      "एक रिवॉल्वर गोली चलाता है, दूसरा रीलोड करता है। दुश्मन मारने या बॉस पर लगातार 8 हिट से एक मुफ़्त गोली मिलती है।",
  },
};
const HINDI_DEPRECATED_COPY =
  /निपुणता|मुख्य शत्रु|असुरक्षित|अजेय|तेल सम्राट|भूतिया रेल|भूत रेल|सहेजाव|अंतरजाल|बिना जाल|आड़े दृश्य|पूर्ण पटल|संगणक|कुंजीपटल|जुड़ाव संकेत|प्रतीक्षा-कक्ष|मेज़बान|हथगोल|पिछला ढंग|आने का भार|बढ़े पत्ते|शिकार यात्रा|संवेग/u;
const BOSS_IDS = [
  "bellRinger",
  "ghostTrain",
  "oilBaron",
  "slothArchbishop",
  "hordeheart",
  "landEater",
  "doppelganger",
];
const CYRILLIC = /[\u0400-\u04ff]/;
const DEVANAGARI = /[\u0900-\u097f]/;
const DYNAMIC_SAMPLE_COUNT = 127;
const REQUIRED_DYNAMIC_AREAS = [
  "boss/bell-ringer",
  "boss/doppelganger",
  "boss/ghost-train",
  "boss/hordeheart",
  "boss/land-eater",
  "boss/oil-baron",
  "boss/sloth-archbishop",
  "contracts",
  "game-over",
  "hud/ammo",
  "hud/ammo-a11y",
  "hud/minimap",
  "hud/minimap-a11y",
  "multiplayer/confirm",
  "multiplayer/history",
  "multiplayer/lobby",
  "multiplayer/nameplate",
  "multiplayer/results",
  "multiplayer/scoreboard",
  "progression",
  "unlocks/cards",
  "unlocks/classes",
  "unlocks/marked",
  "unlocks/mastery",
  "wardrobe",
];
const DYNAMIC_SOURCE_SAMPLES = [
  // Land-Eater: phases, sectors, attack states, and countdowns.
  { area: "boss/land-eater", source: "THE LAND-EATER \u00b7 LAST ACRE" },
  { area: "boss/land-eater", source: "87% health. Phase 2." },
  { area: "boss/land-eater", source: "TUNNELING TO SECTOR B4 \u00b7 2.6s" },
  { area: "boss/land-eater", source: "DEVOURING SECTOR B4 \u00b7 2.6s" },
  { area: "boss/land-eater", source: "PHASE 2 \u00b7 THE GROUND IS HUNGRY" },
  { area: "boss/land-eater", source: "MAW EXPOSED \u00b7 35% BONUS DAMAGE" },
  {
    area: "boss/land-eater",
    source: "RICOCHET MARCH \u00b7 X-MARKED CELLS WILL FALL",
  },

  // Oil Baron: offer state and both English derrick plural branches.
  { area: "boss/oil-baron", source: "THE OIL BARON \u00b7 KING OF BLACK GOLD" },
  {
    area: "boss/oil-baron",
    source: "82% health. Invulnerable during the offer",
  },
  { area: "boss/oil-baron", source: "82% health. Vulnerable" },
  {
    area: "boss/oil-baron",
    source: "IMMUNE \u00b7 THE BARON OFFERS YOU A DEAL",
  },
  {
    area: "boss/oil-baron",
    source: "VULNERABLE \u00b7 1 DERRICK PUMPING \u00b7 DESTROY THEM TO DRAIN THE OIL",
  },
  {
    area: "boss/oil-baron",
    source: "VULNERABLE \u00b7 2 DERRICKS PUMPING \u00b7 DESTROY THEM TO DRAIN THE OIL",
  },
  { area: "boss/oil-baron", source: "DERRICKS \u00b7 2" },
  { area: "boss/oil-baron", source: "1 active oil derrick" },
  { area: "boss/oil-baron", source: "2 active oil derricks" },
  {
    area: "boss/oil-baron",
    source: "TAKE $5,000 \u00b7 GUNS SILENT FOR 45s \u00b7 REACH THE GOLD \u00b7 17s",
  },
  {
    area: "boss/oil-baron",
    source:
      "$5,000 \u00b7 JOIN THE BARON \u00b7 YOU DIE WITH HIM \u00b7 +$5,000 IF ALL RIVALS SURRENDER \u00b7 REACH THE GOLD \u00b7 17s",
  },
  { area: "boss/oil-baron", source: "WEAPONS LOCKED \u00b7 12s" },

  // Bell Ringer: health state plus singular/plural objective copy.
  { area: "boss/bell-ringer", source: "THE BELL RINGER \u00b7 LAST PARISH" },
  { area: "boss/bell-ringer", source: "73% health. Shielded" },
  { area: "boss/bell-ringer", source: "73% health. Vulnerable" },
  { area: "boss/bell-ringer", source: "IMMUNE \u00b7 SILENCE 1 BELL" },
  { area: "boss/bell-ringer", source: "IMMUNE \u00b7 SILENCE 3 BELLS" },
  {
    area: "boss/bell-ringer",
    source: "LAST JUDGMENT \u00b7 BELLS EVERY 7 SECONDS",
  },
  {
    area: "boss/bell-ringer",
    source: "STAND STILL \u00b7 NO FIRE \u00b7 NO RELOAD",
  },
  { area: "boss/bell-ringer", source: "Bell tower 1 active" },

  // Ghost Train: all health modes and section accessibility states.
  { area: "boss/ghost-train", source: "THE LAST TRAIN TO PERDITION" },
  {
    area: "boss/ghost-train",
    source: "64% health. Locomotive vulnerable, 20% damage resistance",
  },
  { area: "boss/ghost-train", source: "64% health. Tail vulnerable" },
  { area: "boss/ghost-train", source: "64% health. Spectral" },
  { area: "boss/ghost-train", source: "Locomotive attached" },
  { area: "boss/ghost-train", source: "Locomotive target" },
  { area: "boss/ghost-train", source: "Locomotive destroyed" },
  { area: "boss/ghost-train", source: "Wagon 2 attached" },
  { area: "boss/ghost-train", source: "Wagon 2 target" },
  { area: "boss/ghost-train", source: "Wagon 2 destroyed" },
  { area: "boss/ghost-train", source: "Ghost Train sections" },

  // Doppelganger: singular/plural copies and health accessibility copy.
  { area: "boss/doppelganger", source: "YOU???" },
  { area: "boss/doppelganger", source: "1 COPY REMAINS" },
  { area: "boss/doppelganger", source: "4 COPIES REMAIN" },
  {
    area: "boss/doppelganger",
    source: "42% health. Mirroring your build.",
  },
  { area: "boss/doppelganger", source: "42% health. 4 copies remain." },

  // Sloth Archbishop and Hordeheart expose most of their copy through ARIA.
  {
    area: "boss/sloth-archbishop",
    source: "BOB \u00b7 THE ARCHBISHOP OF SLOTH",
  },
  { area: "boss/sloth-archbishop", source: "52% health. Dormant" },
  {
    area: "boss/sloth-archbishop",
    source: "52% health. Frontal palms can block projectiles",
  },
  {
    area: "boss/sloth-archbishop",
    source: "52% health. Two rotating palms block opposite projectile sectors",
  },
  {
    area: "boss/sloth-archbishop",
    source:
      "52% health. Support legs leave front and rear open, but rotating palms may cover them",
  },
  { area: "boss/hordeheart", source: "THE HORDE" },
  { area: "boss/hordeheart", source: "HORDEHEART \u00b7 MASS OF THE FALLEN" },
  { area: "boss/hordeheart", source: "61% health" },

  // Gameplay HUD, minimap, and game-over summary.
  { area: "hud/ammo", source: "Empty" },
  { area: "hud/ammo", source: "LAST MAG / LEFT 6" },
  { area: "hud/ammo", source: "LOW AMMO / LEFT 8" },
  { area: "hud/ammo", source: "LEFT 24" },
  { area: "hud/ammo", source: "Reload 1.4s / LOW AMMO / LEFT 8" },
  { area: "hud/ammo", source: "LOAD 1/2 / LEFT 8" },
  {
    area: "hud/ammo-a11y",
    source: "Revolver ammo 3 of 6, total 18, reserve 12",
  },
  {
    area: "hud/ammo-a11y",
    source:
      "Dual Revolvers ammo 8 of 12, right 4 of 6, left 4 of 6, reserve 20",
  },
  {
    area: "hud/minimap-a11y",
    source: "Minimap. Level 7. Experience 42%.",
  },
  { area: "hud/minimap", source: "Ammo 3" },
  {
    area: "game-over",
    source: "Wave 12 - Level 8 - Score 4300 - Zombies 211",
  },

  // Nearby lobby discovery, readiness, and host confirmation states.
  { area: "multiplayer/lobby", source: "3 pending upgrades" },
  { area: "multiplayer/lobby", source: "3 found" },
  { area: "multiplayer/lobby", source: "No matches found yet" },
  { area: "multiplayer/lobby", source: "Nearby host" },
  { area: "multiplayer/lobby", source: "Join" },
  {
    area: "multiplayer/lobby",
    source: "Create a match or find nearby cowboys.",
  },
  {
    area: "multiplayer/lobby",
    source: "Nearby Connections is available in the Android APK.",
  },
  {
    area: "multiplayer/lobby",
    source: "Allow Android to find nearby devices for local play\u2026",
  },
  {
    area: "multiplayer/lobby",
    source: "Permission granted. Create a match or find nearby cowboys.",
  },
  { area: "multiplayer/lobby", source: "Looking for nearby matches\u2026" },
  {
    area: "multiplayer/lobby",
    source: "Discovery started. Looking for nearby matches\u2026",
  },
  {
    area: "multiplayer/confirm",
    source: "Everyone is ready. Confirming the start with the host\u2026",
  },
  {
    area: "multiplayer/confirm",
    source: "Could not confirm the start. Try connecting again.",
  },

  // Match history, scoreboard, results, and dynamic player nameplates.
  { area: "multiplayer/history", source: "Alice went down" },
  { area: "multiplayer/history", source: "Alice fell for good" },
  { area: "multiplayer/history", source: "Alice left the match" },
  { area: "multiplayer/history", source: "Alice went down at 2:07" },
  { area: "multiplayer/history", source: "Alice fell for good at 2:07" },
  { area: "multiplayer/history", source: "Alice left the match at 2:07" },
  { area: "multiplayer/scoreboard", source: "Alive: 2 / 4" },
  { area: "multiplayer/scoreboard", source: "Alice (you)" },
  { area: "multiplayer/scoreboard", source: "BARON'S ENFORCER" },
  { area: "multiplayer/scoreboard", source: "Surrendered" },
  { area: "multiplayer/scoreboard", source: "Fighting" },
  { area: "multiplayer/scoreboard", source: "Down \u00b7 8s" },
  { area: "multiplayer/results", source: "Draw: Alice, Bob" },
  { area: "multiplayer/results", source: "Winner: Alice" },
  { area: "multiplayer/results", source: "Host disconnected" },
  {
    area: "multiplayer/results",
    source:
      "Winner: Alice \u00b7 the last survivor took the lead \u00b7 +150.00 Dust \u00d71.5",
  },
  {
    area: "multiplayer/results",
    source: "Draw: Alice, Bob \u00b7 final score standings",
  },
  { area: "multiplayer/results", source: "Victory" },
  { area: "multiplayer/results", source: "Match Finished" },
  { area: "multiplayer/results", source: "Connection Lost" },
  { area: "multiplayer/results", source: "Winner" },
  { area: "multiplayer/results", source: "Eliminated" },
  { area: "multiplayer/nameplate", source: "BOUGHT \u00b7 Alice" },
  {
    area: "multiplayer/nameplate",
    source: "Alice, bought by the Oil Baron, hostile",
  },
  { area: "multiplayer/nameplate", source: "HOSTILE" },

  // Unlock shop, wardrobe, contracts, and career progression composites.
  {
    area: "unlocks/classes",
    source: "Buy a class once. It will appear at level 5 from your next run.",
  },
  {
    area: "unlocks/classes",
    source: "Unlock Ranger for 500.00 Dust",
  },
  {
    area: "unlocks/mastery",
    source: "Every class starts with one path. Seal its weapon contract to open the second.",
  },
  { area: "unlocks/mastery", source: "Unlock Ranger first" },
  {
    area: "unlocks/mastery",
    source: "Clearout I \u00b7 12 / 100",
  },
  {
    area: "unlocks/cards",
    source: "Each card unlock visibly expands its matching draft pool next run.",
  },
  { area: "unlocks/cards", source: "Owned \u00b7 Requires Ranger" },
  { area: "unlocks/cards", source: "Owned \u00b7 Marked x2" },
  {
    area: "unlocks/marked",
    source: "Choose exactly 5 unlocked cards. They roll at x2 weight, never as a guarantee.",
  },
  {
    area: "unlocks/marked",
    source: "Unlock 10 more cards to choose five weighted favorites.",
  },
  { area: "unlocks/marked", source: "0 / 10 card unlocks" },
  {
    area: "unlocks/marked",
    source: "3 / 5 selected. Save when all five slots are filled.",
  },
  {
    area: "contracts",
    source: "Clearout I progress",
  },
  { area: "contracts", source: "+1 Contract Mark and unlock Big Iron" },
  {
    area: "wardrobe",
    source: "Unlocked: Complete 6 contracts",
  },
  { area: "wardrobe", source: "Unlocked preview" },
  { area: "wardrobe", source: "Locked preview" },
  { area: "wardrobe", source: "Apply Look" },
  { area: "wardrobe", source: "Locked Selection" },
  {
    area: "wardrobe",
    source: "Try any look live. Nothing changes until you press Apply Look.",
  },
  {
    area: "wardrobe",
    source: "Previewing Ashen Prospector. Press Apply Look to keep this outfit.",
  },
  {
    area: "wardrobe",
    source: "Ashen Prospector is a preview. Complete 6 contracts",
  },
  {
    area: "progression",
    source: "Dust 150.00, contracts 3 of 72",
  },
  { area: "progression", source: "+150.00 Dust" },
  { area: "progression", source: "+1 Contract Mark" },
  { area: "progression", source: "+2 Contract Marks" },
  {
    area: "progression",
    source: "Ranger unlocked. It will enter your next run.",
  },
];

function fileUrl(relativePath) {
  const absolute = path.resolve(__dirname, "..", relativePath).replace(/\\/g, "/");
  return `file:///${absolute}`;
}

function appUrl(locale) {
  return `${fileUrl("index.html")}?lang=${locale}&mapSeed=7301&i18nQa=1`;
}

async function waitForLocalizedApp(page) {
  await page.waitForFunction(
    ({ contractCount, upgradeCount }) => {
      const i18n = window.DustAndDeadI18n;
      if (
        !i18n ||
        !window.DustAndDeadProgression ||
        !window.__dustAndDeadTest ||
        typeof i18n.getCatalog !== "function"
      ) {
        return false;
      }
      const keys = Object.keys(i18n.getCatalog("en"));
      const contractTitles = keys.filter(
        (key) => /^contract\..+\.title$/.test(key)
      );
      const contractDescriptions = keys.filter(
        (key) => /^contract\..+\.description$/.test(key)
      );
      const upgradeTitles = keys.filter(
        (key) => /^upgrade\..+\.title$/.test(key)
      );
      const upgradeDescriptions = keys.filter(
        (key) => /^upgrade\..+\.description$/.test(key)
      );
      return (
        contractTitles.length === contractCount &&
        contractDescriptions.length === contractCount &&
        upgradeTitles.length === upgradeCount &&
        upgradeDescriptions.length === upgradeCount
      );
    },
    { contractCount: CONTRACT_COUNT, upgradeCount: UPGRADE_COUNT }
  );
}

async function openLocale(page, locale) {
  await page.goto(appUrl(locale), { waitUntil: "domcontentloaded" });
  await waitForLocalizedApp(page);
  await page.waitForFunction(
    (expected) =>
      document.documentElement.lang === expected &&
      window.DustAndDeadI18n.getLocale() === expected,
    locale
  );
}

async function dismissIntro(page) {
  const intro = page.locator("#intro-screen");
  if (await intro.isVisible().catch(() => false)) {
    await page.keyboard.press("KeyM");
    await expect(intro).toBeHidden();
  }
}

async function resetProgression(page) {
  await page.evaluate(() => {
    if (window.__dustAndDeadTest?.resetMetaProgression) {
      window.__dustAndDeadTest.resetMetaProgression();
    } else {
      window.DustAndDeadProgression?.resetForTest();
    }
  });
}

async function translated(page, key, params) {
  return page.evaluate(
    ({ messageKey, messageParams }) =>
      window.DustAndDeadI18n.t(messageKey, messageParams || null),
    { messageKey: key, messageParams: params || null }
  );
}

async function expectTextKey(page, selector, key, params) {
  const expected = await translated(page, key, params);
  await expect(page.locator(selector)).toHaveText(expected);
}

async function expectAttributeKey(page, selector, attribute, key, params) {
  const expected = await translated(page, key, params);
  await expect(page.locator(selector)).toHaveAttribute(attribute, expected);
}

async function expectLanguageState(page, activeLocale) {
  await expect(page.locator("html")).toHaveAttribute("lang", activeLocale);
  await expect(page.locator("html")).toHaveAttribute(
    "data-locale",
    activeLocale
  );
  const states = await page.evaluate(() =>
    Array.from(document.querySelectorAll("[data-language]")).map((button) => ({
      locale: button.getAttribute("data-language"),
      pressed: button.getAttribute("aria-pressed"),
      active: button.classList.contains("is-active"),
    }))
  );
  expect(states).toEqual(
    LOCALES.map((locale) => ({
      locale,
      pressed: locale === activeLocale ? "true" : "false",
      active: locale === activeLocale,
    }))
  );
}

async function readSurfaceCopy(page, selector, label) {
  return page.evaluate(
    ({ rootSelector, rootLabel }) => {
      const root = document.querySelector(rootSelector);
      if (!root) throw new Error(`Missing i18n audit root: ${rootSelector}`);
      const entries = [];
      const blocked = (element) =>
        Boolean(
          element?.closest(
            "script, style, noscript, template, [data-i18n-skip], [aria-hidden='true']"
          )
        );
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let node = walker.nextNode();
      while (node) {
        const value = String(node.nodeValue || "").replace(/\s+/g, " ").trim();
        if (value && !blocked(node.parentElement)) {
          entries.push({
            source: `${rootLabel}:text`,
            value,
          });
        }
        node = walker.nextNode();
      }

      const attributeNames = [
        "aria-label",
        "aria-description",
        "aria-valuetext",
        "title",
        "placeholder",
        "alt",
        "data-label",
        "data-right-label",
        "data-left-label",
      ];
      [root, ...root.querySelectorAll("*")].forEach((element) => {
        if (blocked(element)) return;
        attributeNames.forEach((attribute) => {
          if (!element.hasAttribute(attribute)) return;
          const value = String(element.getAttribute(attribute) || "")
            .replace(/\s+/g, " ")
            .trim();
          if (!value) return;
          entries.push({
            source: `${rootLabel}:${element.id || element.tagName.toLowerCase()}@${attribute}`,
            value,
          });
        });
      });
      return entries;
    },
    { rootSelector: selector, rootLabel: label }
  );
}

function badCopyReason(value, options = {}) {
  const normalized = String(value || "").trim();
  if (
    /\ufffd|(?:Ã.|Â.|Ð.|Ñ.)|(?:Р[\u0402-\u04ff]|С[\u0402-\u04ff]){3,}|а(?:¤|Ґ)|в(?:Ђ|„|)|â(?:€|€™|€œ|€�|€¦)/u.test(
      normalized
    )
  ) {
    return "mojibake";
  }
  if (/\[object Object\]|\b(?:undefined|NaN)\b/i.test(normalized)) {
    return "runtime artifact";
  }
  if (
    /(?:^|[\s"'(:])(?:menu|guide|pause|contracts|unlocks|wardrobe|progression|contract|upgrade|class|branch|cosmetic|boss|hud|gameOver|levelUp|multiplayer)\.[a-z0-9_.-]+(?=$|[\s"',;:)])/i.test(
      normalized
    )
  ) {
    return "raw localization key";
  }
  if (
    !options.allowTemplates &&
    /\{[a-zA-Z][a-zA-Z0-9_]*\}/.test(normalized)
  ) {
    return "unresolved template";
  }
  return "";
}

function expectCleanEntries(entries, label, options) {
  const failures = entries
    .map((entry) => ({
      ...entry,
      reason: badCopyReason(entry.value, options),
    }))
    .filter((entry) => entry.reason);
  expect(
    failures.slice(0, 30),
    `${label} contains localization artifacts (${failures.length} total)`
  ).toEqual([]);
}

function stripAllowedLatin(value) {
  return value
    .replace(/\{[a-zA-Z][a-zA-Z0-9_]*\}/g, "")
    .replace(/Dust\s*&\s*Dead/gi, "")
    .replace(/\b(?:XP|HP|PvP|WASD|Esc|AoE|DPS|DoT)\b/gi, "")
    .replace(/\b[IVXLCDM]+\b/g, "");
}

function stripDynamicAllowedLatin(value) {
  return stripAllowedLatin(value)
    .replace(/\b(?:Alice|Bob|Ranger|Clearout|Android|APK|Nearby|Connections)\b/gi, "")
    .replace(/\bAshen\s+Prospector\b/gi, "");
}

function expectNoEnglishFallback(entries, locale, label) {
  if (locale === "en") return;
  const leakEntries = entries.filter((entry) =>
    /[A-Za-z]{3,}/.test(stripAllowedLatin(entry.value))
  );
  const grouped = new Map();
  for (const entry of leakEntries) {
    const existing = grouped.get(entry.value);
    if (existing) {
      existing.occurrences += 1;
    } else {
      grouped.set(entry.value, {
        source: entry.source,
        value: entry.value,
        occurrences: 1,
      });
    }
  }
  const leaks = [...grouped.values()];
  expect(
    leaks.slice(0, 40),
    `${label} contains visible English fallback in ${locale} ` +
      `(${leakEntries.length} entries, ${leaks.length} unique)`
  ).toEqual([]);
}

function expectLocaleScript(entries, locale, label) {
  const combined = entries.map((entry) => entry.value).join("\n");
  if (locale === "en") {
    expect(CYRILLIC.test(combined), `${label} must not contain Cyrillic in en`).toBe(false);
    expect(DEVANAGARI.test(combined), `${label} must not contain Devanagari in en`).toBe(false);
  } else if (locale === "ru") {
    expect(CYRILLIC.test(combined), `${label} must contain Russian copy`).toBe(true);
    expect(DEVANAGARI.test(combined), `${label} must not contain Hindi copy`).toBe(false);
  } else {
    expect(DEVANAGARI.test(combined), `${label} must contain Hindi copy`).toBe(true);
    expect(CYRILLIC.test(combined), `${label} must not contain Russian copy`).toBe(false);
  }
}

function sortedUnique(values) {
  return [...new Set(values)].sort();
}

function placeholders(value) {
  return sortedUnique(
    [...String(value).matchAll(/\{([a-zA-Z0-9_]+)\}/g)].map((match) => match[1])
  );
}

function sourceNumericModifiers(value) {
  return sortedUnique(
    [
      ...String(value).matchAll(
        /(?<![A-Za-z])[+×x]\s*(\d+(?:[.,]\d+)?)|\b(\d+(?:[.,]\d+)?)%|\b(\d+[.,]\d+)\b/gi
      ),
    ].map((match) =>
      String(match[1] || match[2] || match[3]).replace(",", ".")
    )
  );
}

function semanticNumbers(value, locale) {
  const normalized = String(value).toLowerCase();
  const values = [...normalized.matchAll(/\d+(?:[.,]\d+)?/g)].map((match) =>
    match[0].replace(",", ".")
  );
  if (
    (locale === "ru" && /вдвое|двойн/u.test(normalized)) ||
    (locale === "hi" && /दोगुन/u.test(normalized))
  ) {
    values.push("2");
  }
  return sortedUnique(values);
}

function dynamicSentinels(value) {
  return sortedUnique(
    [...String(value).matchAll(/\b(?:Alice|Bob|B\d+)\b/g)].map(
      (match) => match[0]
    )
  );
}

test("all loaded locale packs have equal, complete catalogs", async ({ page }) => {
  test.setTimeout(120_000);
  await openLocale(page, "en");

  const audit = await page.evaluate(() => {
    const i18n = window.DustAndDeadI18n;
    const catalogs = {
      en: i18n.getCatalog("en"),
      ru: i18n.getCatalog("ru"),
      hi: i18n.getCatalog("hi"),
    };
    const keys = Object.keys(catalogs.en);
    const idsFor = (expression) =>
      keys
        .map((key) => key.match(expression)?.[1] || "")
        .filter(Boolean)
        .sort();
    const progressionIds = window.DustAndDeadProgression
      .getUnlockCatalog()
      .cards.map((card) => card.id)
      .sort();
    const runtimeUpgradeIds = window.__dustAndDeadTest
      .getRunUpgradeCatalogForTest()
      .map((card) => card.id)
      .sort();
    const rotationPool =
      window.__dustAndDeadTest.getBossRotationDiagnostics?.().pool || [];
    return {
      catalogs,
      missingKeys: i18n.getMissingKeys(),
      contractTitleIds: idsFor(/^contract\.(.+)\.title$/),
      contractDescriptionIds: idsFor(/^contract\.(.+)\.description$/),
      upgradeTitleIds: idsFor(/^upgrade\.(.+)\.title$/),
      upgradeDescriptionIds: idsFor(/^upgrade\.(.+)\.description$/),
      classLabelIds: idsFor(/^class\.(.+)\.label$/),
      branchLabelIds: idsFor(/^branch\.(.+)\.label$/),
      cosmeticLabelIds: idsFor(/^cosmetic\.(.+)\.label$/),
      cosmeticDescriptionIds: idsFor(/^cosmetic\.(.+)\.description$/),
      cosmeticRequirementIds: idsFor(/^cosmetic\.(.+)\.requirement$/),
      progressionIds,
      runtimeUpgradeIds,
      rotationPool,
    };
  });

  const referenceKeys = Object.keys(audit.catalogs.en).sort();
  expect(referenceKeys, "combined i18n catalog key count").toHaveLength(
    CATALOG_KEY_COUNT
  );
  const catalogFailures = [];
  for (const locale of LOCALES) {
    const localeKeys = Object.keys(audit.catalogs[locale]).sort();
    expect(localeKeys, `${locale} catalog key set`).toEqual(referenceKeys);
    for (const key of referenceKeys) {
      const value = audit.catalogs[locale][key];
      if (typeof value !== "string") {
        catalogFailures.push({ locale, key, value, reason: "non-string value" });
        continue;
      }
      if (!value.trim()) {
        catalogFailures.push({ locale, key, value, reason: "empty value" });
      }
      if (value.trim() === key) {
        catalogFailures.push({ locale, key, value, reason: "value exposes key" });
      }
      if (value !== value.normalize("NFC")) {
        catalogFailures.push({ locale, key, value, reason: "value is not NFC-normalized" });
      }
      const artifact = badCopyReason(value, { allowTemplates: true });
      if (artifact) {
        catalogFailures.push({ locale, key, value, reason: artifact });
      }
      const actualPlaceholders = placeholders(value);
      const expectedPlaceholders = placeholders(audit.catalogs.en[key]);
      if (
        JSON.stringify(actualPlaceholders) !== JSON.stringify(expectedPlaceholders)
      ) {
        catalogFailures.push({
          locale,
          key,
          value,
          reason:
            `placeholder mismatch: ${actualPlaceholders.join(",")} != ` +
            expectedPlaceholders.join(","),
        });
      }
      if (
        locale !== "en" &&
        /^(?:upgrade|contract|class|branch)\./.test(key) &&
        /[A-Za-z]{3,}/.test(stripAllowedLatin(value))
      ) {
        catalogFailures.push({
          locale,
          key,
          value,
          reason: "visible English fallback in localized gameplay copy",
        });
      }
      if (/^upgrade\..+\.description$/.test(key)) {
        const actualNumbers = semanticNumbers(value, locale);
        const expectedNumbers = sourceNumericModifiers(audit.catalogs.en[key]);
        const missingNumbers = expectedNumbers.filter(
          (number) => !actualNumbers.includes(number)
        );
        if (missingNumbers.length) {
          catalogFailures.push({
            locale,
            key,
            value,
            reason:
              `missing gameplay modifiers: ${missingNumbers.join(",")} ` +
              `(found ${actualNumbers.join(",")})`,
          });
        }
      }
    }
  }
  expect(
    catalogFailures.slice(0, 100),
    `catalog validation failures (${catalogFailures.length} total)`
  ).toEqual([]);

  for (const [key, expected] of Object.entries(HINDI_EDITORIAL_SENTINELS)) {
    expect(audit.catalogs.hi[key], `Hindi editorial sentinel ${key}`).toBe(expected);
  }
  const deprecatedHindiCopy = Object.entries(audit.catalogs.hi)
    .filter(([, value]) => HINDI_DEPRECATED_COPY.test(value))
    .map(([key, value]) => ({ key, value }));
  expect(
    deprecatedHindiCopy,
    "Hindi catalog must not reintroduce superseded terminology"
  ).toEqual([]);

  expect(audit.contractTitleIds).toHaveLength(CONTRACT_COUNT);
  expect(audit.contractDescriptionIds).toEqual(audit.contractTitleIds);
  expect(audit.classLabelIds).toHaveLength(CLASS_COUNT);
  expect(audit.branchLabelIds).toHaveLength(BRANCH_COUNT);
  expect(audit.cosmeticLabelIds).toHaveLength(COSMETIC_COUNT);
  expect(audit.cosmeticDescriptionIds).toEqual(audit.cosmeticLabelIds);
  expect(audit.cosmeticRequirementIds).toEqual(audit.cosmeticLabelIds);
  expect(audit.upgradeTitleIds).toHaveLength(UPGRADE_COUNT);
  expect(audit.upgradeDescriptionIds).toEqual(audit.upgradeTitleIds);
  expect(audit.progressionIds).toEqual(audit.upgradeTitleIds);
  expect(audit.runtimeUpgradeIds).toEqual(audit.upgradeTitleIds);

  const expectCatalogScripts = (domain, id, fields, allowBrandOnly = false) => {
    const valueFor = (locale) =>
      fields.map((field) => audit.catalogs[locale][`${domain}.${id}.${field}`]).join(" ");
    const en = valueFor("en");
    const ru = valueFor("ru");
    const hi = valueFor("hi");
    expect(CYRILLIC.test(en), `en ${domain}.${id}`).toBe(false);
    expect(DEVANAGARI.test(en), `en ${domain}.${id}`).toBe(false);
    if (!allowBrandOnly) {
      expect(CYRILLIC.test(ru), `ru ${domain}.${id}`).toBe(true);
      expect(DEVANAGARI.test(hi), `hi ${domain}.${id}`).toBe(true);
    }
  };
  for (const id of audit.classLabelIds) {
    expectCatalogScripts("class", id, ["label"]);
  }
  for (const id of audit.branchLabelIds) {
    expectCatalogScripts("branch", id, ["label"], id === "bigIron");
  }
  for (const id of audit.cosmeticLabelIds) {
    for (const field of ["label", "description", "requirement"]) {
      expectCatalogScripts("cosmetic", id, [field]);
    }
  }

  for (const id of [...audit.contractTitleIds, ...audit.upgradeTitleIds]) {
    const domain = audit.contractTitleIds.includes(id) ? "contract" : "upgrade";
    const en = `${audit.catalogs.en[`${domain}.${id}.title`]} ${
      audit.catalogs.en[`${domain}.${id}.description`]
    }`;
    const ru = `${audit.catalogs.ru[`${domain}.${id}.title`]} ${
      audit.catalogs.ru[`${domain}.${id}.description`]
    }`;
    const hi = `${audit.catalogs.hi[`${domain}.${id}.title`]} ${
      audit.catalogs.hi[`${domain}.${id}.description`]
    }`;
    expect(CYRILLIC.test(en), `en ${domain}.${id}`).toBe(false);
    expect(DEVANAGARI.test(en), `en ${domain}.${id}`).toBe(false);
    expect(CYRILLIC.test(ru), `ru ${domain}.${id}`).toBe(true);
    expect(DEVANAGARI.test(hi), `hi ${domain}.${id}`).toBe(true);
  }

  for (const locale of LOCALES) {
    const titles = audit.upgradeTitleIds.map(
      (id) => audit.catalogs[locale][`upgrade.${id}.title`]
    );
    expect(
      new Set(titles).size,
      `${locale} upgrade titles must remain distinguishable`
    ).toBe(titles.length);
  }

  expect(sortedUnique([...audit.rotationPool, "doppelganger"])).toEqual(
    sortedUnique(BOSS_IDS)
  );
  for (const bossId of BOSS_IDS) {
    const key = `boss.${bossId}.name`;
    expect(audit.catalogs.en[key], `${key} en`).toBeTruthy();
    expect(CYRILLIC.test(audit.catalogs.ru[key]), `${key} ru`).toBe(true);
    expect(DEVANAGARI.test(audit.catalogs.hi[key]), `${key} hi`).toBe(true);
  }

  for (const locale of LOCALES) {
    const catalog = audit.catalogs[locale];
    for (const classId of ["gunslinger", "ranger", "demolitionist", "marshal"]) {
      expect(
        catalog[`classes.${classId}.name`],
        `${locale} class name ${classId}`
      ).toBe(catalog[`class.${classId}.label`]);
    }
    for (const branchId of [
      "dualRevolvers",
      "bigIron",
      "leverBarrage",
      "trailWarden",
      "bombardier",
      "pyrotechnician",
      "breachMarshal",
      "graveWarden",
    ]) {
      expect(
        catalog[`mastery.${branchId}.name`],
        `${locale} branch name ${branchId}`
      ).toBe(catalog[`branch.${branchId}.label`]);
    }
    expect(catalog["upgrades.swiftBoots.name"]).toBe(
      catalog["upgrade.swiftBoots.title"]
    );
    expect(catalog["wardrobe.item.trailwornDrifter.name"]).toBe(
      catalog["cosmetic.trailwornDrifter.label"]
    );
    expect(catalog["wardrobe.item.weatheredCattleman.name"]).toBe(
      catalog["cosmetic.weatheredCattleman.label"]
    );
  }
  for (const locale of LOCALES) {
    const expected = ALL_RIGHT_ALL_LEFT_COPY[locale];
    expect(audit.catalogs[locale]["upgrade.allRightAllLeft.title"]).toBe(
      expected.title
    );
    expect(audit.catalogs[locale]["upgrade.allRightAllLeft.subtitle"]).toBe(
      expected.subtitle
    );
    expect(audit.catalogs[locale]["upgrade.allRightAllLeft.description"]).toBe(
      expected.description
    );
  }
  expect(audit.missingKeys).toEqual([]);
});

test("ALL RIGHT keeps its localized subtitle in unlock cards, accessible names, and the Marked Deck", async ({
  page,
}) => {
  test.setTimeout(120_000);

  for (const locale of LOCALES) {
    const expected = ALL_RIGHT_ALL_LEFT_COPY[locale];
    const fullTitle = `${expected.title} ${expected.subtitle}`;
    await openLocale(page, locale);
    await resetProgression(page);
    await dismissIntro(page);
    await page.locator("#unlock-shop-btn").click();
    await page.locator('[data-unlock-tab="cards"]').click();

    const card = page.locator(
      '.unlock-card--card:has([data-purchase-card="allRightAllLeft"])'
    );
    await expect(card).toHaveCount(1);
    const heading = card.locator("h3");
    const directTitle = await heading.evaluate((element) =>
      Array.from(element.childNodes)
        .filter((node) => node.nodeType === Node.TEXT_NODE)
        .map((node) => node.nodeValue)
        .join("")
        .trim()
    );
    expect(directTitle).toBe(expected.title);
    const subtitle = heading.locator(".unlock-card__subtitle");
    await expect(subtitle).toHaveText(expected.subtitle);
    await expect(subtitle).toBeVisible();
    await expect(card.locator(".unlock-card__copy")).toHaveText(
      expected.description
    );
    const purchaseButton = card.locator('[data-purchase-card="allRightAllLeft"]');
    await expect(purchaseButton).toHaveAttribute("aria-label", /\S/);
    expect(await purchaseButton.getAttribute("aria-label")).toContain(fullTitle);

    const markedDeckReady = await page.evaluate(() => {
      const progression = window.DustAndDeadProgression;
      const purchasable = progression
        .getUnlockCatalog()
        .cards.filter((entry) => entry.purchasable);
      const target = purchasable.find((entry) => entry.id === "allRightAllLeft");
      const purchases = [
        target,
        ...purchasable
          .filter((entry) => entry.id !== "allRightAllLeft")
          .slice(0, 9),
      ].filter(Boolean);
      progression.grantDustForTest(
        purchases.reduce((total, entry) => total + entry.costCents, 0)
      );
      purchases.forEach((entry) => progression.purchaseCard(entry.id));
      return progression.getSnapshot().unlocks.markedDeckUnlocked;
    });
    expect(markedDeckReady).toBe(true);

    await page.locator('[data-unlock-tab="marked"]').click();
    const markedChoice = page.locator(
      '[data-mark-card="allRightAllLeft"]'
    );
    await expect(markedChoice.locator("strong")).toHaveText(fullTitle);
    await markedChoice.click();
    await expect(page.locator(".marked-deck__slot.is-filled").first()).toHaveText(
      fullTitle
    );
  }
});

test("dynamic gameplay source strings translate deterministically in Russian and Hindi", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await openLocale(page, "en");

  expect(DYNAMIC_SOURCE_SAMPLES).toHaveLength(DYNAMIC_SAMPLE_COUNT);
  expect(sortedUnique(DYNAMIC_SOURCE_SAMPLES.map((sample) => sample.area))).toEqual(
    REQUIRED_DYNAMIC_AREAS
  );
  expect(
    sortedUnique(
      DYNAMIC_SOURCE_SAMPLES.map((sample) => `${sample.area}\u0000${sample.source}`)
    )
  ).toHaveLength(DYNAMIC_SOURCE_SAMPLES.length);

  const allFailures = [];
  const missingPatternKeys = [];
  for (const locale of ["ru", "hi"]) {
    const audit = await page.evaluate(
      ({ requestedLocale, samples }) => {
        const i18n = window.DustAndDeadI18n;
        i18n.setLocale(requestedLocale, { persist: false });
        return {
          locale: i18n.getLocale(),
          results: samples.map((sample) => ({
            area: sample.area,
            source: sample.source,
            translated: i18n.translateSource(sample.source),
            translatedAgain: i18n.translateSource(sample.source),
          })),
          missingKeys: i18n.getMissingKeys(),
        };
      },
      { requestedLocale: locale, samples: DYNAMIC_SOURCE_SAMPLES }
    );

    expect(audit.locale).toBe(locale);
    expect(audit.results).toHaveLength(DYNAMIC_SOURCE_SAMPLES.length);
    for (const result of audit.results) {
      const context = `${locale} ${result.area}: ${result.source}`;
      const reasons = [];
      if (result.translatedAgain !== result.translated) {
        reasons.push("non-deterministic result");
      }
      if (result.translated === result.source) {
        reasons.push("unchanged");
      }
      if (!result.translated.trim()) {
        reasons.push("empty");
      }
      const artifact = badCopyReason(result.translated);
      if (artifact) reasons.push(artifact);
      if (/[A-Za-z]{3,}/.test(stripDynamicAllowedLatin(result.translated))) {
        reasons.push("visible English fallback");
      }
      const missingSentinels = dynamicSentinels(result.source).filter(
        (sentinel) => !result.translated.includes(sentinel)
      );
      if (missingSentinels.length) {
        reasons.push(`lost sentinel values: ${missingSentinels.join(", ")}`);
      }
      const sourceDigits = result.source.replace(/\D/g, "");
      const translatedDigits = result.translated.replace(/\D/g, "");
      if (translatedDigits !== sourceDigits) {
        reasons.push(
          `numeric captures changed: ${sourceDigits} -> ${translatedDigits}`
        );
      }
      if (locale === "ru") {
        if (!CYRILLIC.test(result.translated)) reasons.push("missing Cyrillic");
        if (DEVANAGARI.test(result.translated)) reasons.push("leaked Devanagari");
      } else {
        if (!DEVANAGARI.test(result.translated)) reasons.push("missing Devanagari");
        if (CYRILLIC.test(result.translated)) reasons.push("leaked Cyrillic");
      }
      if (reasons.length) {
        allFailures.push({
          context,
          translated: result.translated,
          reasons,
        });
      }
    }
    if (audit.missingKeys.length) {
      missingPatternKeys.push({ locale, keys: audit.missingKeys });
    }
  }
  expect(
    allFailures.slice(0, 160),
    `dynamic localization failures (${allFailures.length} total)`
  ).toEqual([]);
  expect(missingPatternKeys, "dynamic pattern keys").toEqual([]);
});

for (const locale of LOCALES) {
  test(`${locale} localizes menus, guide, progression surfaces, and pause UI`, async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    await openLocale(page, locale);
    await dismissIntro(page);
    await resetProgression(page);

    await expect(page.locator("html")).toHaveAttribute("lang", locale);
    await expect(page.locator("html")).toHaveAttribute("data-locale", locale);
    await expect(page.locator("[data-language]")).toHaveCount(3);
    await expect(page.locator(".language-switcher__flag")).toHaveCount(3);

    const flagAudit = await page.evaluate((activeLocale) => {
      return Array.from(document.querySelectorAll("[data-language]")).map((button) => ({
        locale: button.getAttribute("data-language"),
        pressed: button.getAttribute("aria-pressed"),
        label: button.getAttribute("aria-label"),
        title: button.getAttribute("title"),
        svgCount: button.querySelectorAll("svg.language-switcher__flag").length,
        shapeCount: button.querySelectorAll("svg rect, svg path, svg circle").length,
        active: button.classList.contains("is-active"),
        expectedActive: button.getAttribute("data-language") === activeLocale,
      }));
    }, locale);
    expect(flagAudit.map((entry) => entry.locale)).toEqual(LOCALES);
    for (const flag of flagAudit) {
      expect(flag.svgCount, `${flag.locale} flag SVG`).toBe(1);
      expect(flag.shapeCount, `${flag.locale} flag artwork`).toBeGreaterThan(0);
      expect(flag.label, `${flag.locale} flag accessible name`).toBeTruthy();
      expect(flag.title, `${flag.locale} flag title`).toBeTruthy();
      expect(flag.pressed).toBe(flag.expectedActive ? "true" : "false");
      expect(flag.active).toBe(flag.expectedActive);
      expectCleanEntries(
        [
          { source: `${flag.locale}@aria-label`, value: flag.label },
          { source: `${flag.locale}@title`, value: flag.title },
        ],
        `${flag.locale} language button`
      );
    }

    await expectTextKey(page, "#start-btn", "menu.startHunt");
    await expectAttributeKey(page, "#menu", "aria-label", "menu.a11y");
    const entries = [
      ...(await readSurfaceCopy(page, "#menu", "main-menu")),
      ...(await readSurfaceCopy(page, "#game-guide-btn", "guide-launcher")),
      ...(await readSurfaceCopy(page, "#progression-wallet", "progression-wallet")),
    ];

    await page.locator("#game-guide-btn").click();
    await expect(page.locator("#game-guide")).toBeVisible();
    await expectTextKey(page, "#game-guide-title", "guide.title");
    await expectAttributeKey(
      page,
      "#game-guide-close-btn",
      "aria-label",
      "guide.close"
    );
    entries.push(...(await readSurfaceCopy(page, "#game-guide", "field-guide")));
    await page.locator("#game-guide-close-btn").click();
    await expect(page.locator("#game-guide")).toBeHidden();

    await page.locator("#contracts-btn").click();
    await expect(page.locator("#contracts-menu")).toBeVisible();
    await expect(page.locator(".contract-card")).toHaveCount(CONTRACT_COUNT);
    await expectTextKey(page, "#contracts-title", "progression.contracts");
    await expectAttributeKey(
      page,
      "#contracts-close-btn",
      "aria-label",
      "contracts.close"
    );
    await expectAttributeKey(
      page,
      "#contracts-list",
      "aria-label",
      "contracts.list.a11y"
    );
    entries.push(...(await readSurfaceCopy(page, "#contracts-menu", "contracts")));

    const contractParity = await page.evaluate(() => {
      const expected = new Map(
        window.DustAndDeadProgression
          .getContracts()
          .map((contract) => [contract.id, contract])
      );
      return Array.from(document.querySelectorAll(".contract-card")).map((card) => {
        const id = card.getAttribute("data-contract-id");
        const contract = expected.get(id);
        return {
          id,
          title: card.querySelector("[data-contract-title]")?.textContent.trim() || "",
          description:
            card.querySelector("[data-contract-description]")?.textContent.trim() || "",
          expectedTitle: contract?.title || "",
          expectedDescription: contract?.description || "",
        };
      });
    });
    expect(contractParity).toHaveLength(CONTRACT_COUNT);
    for (const contract of contractParity) {
      expect(contract.title, `${locale}:${contract.id} runtime title`)
        .toBe(contract.expectedTitle);
      expect(contract.description, `${locale}:${contract.id} runtime description`)
        .toBe(contract.expectedDescription);
    }
    await page.locator("#contracts-close-btn").click();
    await expect(page.locator("#contracts-menu")).toBeHidden();

    await page.locator("#unlock-shop-btn").click();
    await expect(page.locator("#unlock-shop")).toBeVisible();
    await expectTextKey(page, "#unlock-shop-title", "menu.unlocks.title");
    await expectAttributeKey(
      page,
      "#unlock-shop-close-btn",
      "aria-label",
      "unlocks.close"
    );
    await expect(page.locator(".unlock-card--class")).toHaveCount(CLASS_COUNT);
    entries.push(
      ...(await readSurfaceCopy(page, "#unlock-shop", "unlocks-classes"))
    );

    await page.locator('[data-unlock-tab="mastery"]').click();
    await expect(page.locator("#unlock-shop-content"))
      .toHaveAttribute("data-unlock-view", "mastery");
    await expect(page.locator(".unlock-card--mastery")).toHaveCount(BRANCH_COUNT);
    entries.push(
      ...(await readSurfaceCopy(page, "#unlock-shop", "unlocks-mastery"))
    );

    await page.locator('[data-unlock-tab="cards"]').click();
    await expect(page.locator("#unlock-shop-content"))
      .toHaveAttribute("data-unlock-view", "cards");
    await expect(page.locator(".unlock-card--card")).toHaveCount(UPGRADE_COUNT);
    entries.push(...(await readSurfaceCopy(page, "#unlock-shop", "unlocks-cards")));

    const upgradeParity = await page.evaluate(() => {
      const catalog = window.DustAndDeadI18n.getCatalog(
        window.DustAndDeadI18n.getLocale()
      );
      const cardIds = window.DustAndDeadProgression
        .getUnlockCatalog()
        .cards.map((card) => card.id);
      const rendered = Array.from(
        document.querySelectorAll(".unlock-card--card")
      );
      return cardIds.map((id, index) => {
        const heading = rendered[index]?.querySelector("h3");
        return {
          id,
          title: heading
            ? Array.from(heading.childNodes)
              .filter((node) => node.nodeType === Node.TEXT_NODE)
              .map((node) => node.nodeValue)
              .join("")
              .trim()
            : "",
          subtitle:
            heading?.querySelector(".unlock-card__subtitle")?.textContent.trim() || "",
          description:
            rendered[index]?.querySelector(".unlock-card__copy")?.textContent.trim() || "",
          expectedTitle: catalog[`upgrade.${id}.title`] || "",
          expectedSubtitle: catalog[`upgrade.${id}.subtitle`] || "",
          expectedDescription: catalog[`upgrade.${id}.description`] || "",
        };
      });
    });
    expect(upgradeParity).toHaveLength(UPGRADE_COUNT);
    for (const card of upgradeParity) {
      expect(card.expectedTitle, `${locale}:${card.id} catalog title`).not.toBe("");
      expect(card.expectedDescription, `${locale}:${card.id} catalog description`)
        .not.toBe("");
      expect(card.title, `${locale}:${card.id} rendered title`).toBe(card.expectedTitle);
      expect(card.subtitle, `${locale}:${card.id} rendered subtitle`)
        .toBe(card.expectedSubtitle);
      expect(card.description, `${locale}:${card.id} rendered description`)
        .toBe(card.expectedDescription);
    }

    await page.locator('[data-unlock-tab="marked"]').click();
    await expect(page.locator("#unlock-shop-content"))
      .toHaveAttribute("data-unlock-view", "marked");
    entries.push(...(await readSurfaceCopy(page, "#unlock-shop", "unlocks-marked")));
    await page.locator("#unlock-shop-close-btn").click();
    await expect(page.locator("#unlock-shop")).toBeHidden();

    await page.locator("#wardrobe-btn").click();
    await expect(page.locator("#wardrobe-menu")).toBeVisible();
    await expectTextKey(page, "#wardrobe-title", "menu.wardrobe.title");
    await expectAttributeKey(
      page,
      "#wardrobe-close-btn",
      "aria-label",
      "wardrobe.close"
    );
    entries.push(...(await readSurfaceCopy(page, "#wardrobe-menu", "wardrobe")));
    const wardrobeParity = await page.evaluate(() => {
      const catalog = window.DustAndDeadProgression.getCosmeticCatalog();
      return {
        cowboyCount: catalog.cowboys.length,
        hatCount: catalog.hats.length,
        cowboyName: document.getElementById("wardrobe-cowboy-name")?.textContent.trim(),
        expectedCowboyName: catalog.cowboys[0]?.label,
        hatName: document.getElementById("wardrobe-hat-name")?.textContent.trim(),
        expectedHatName: catalog.hats[0]?.label,
      };
    });
    expect(wardrobeParity).toMatchObject({
      cowboyCount: 21,
      hatCount: 13,
      cowboyName: wardrobeParity.expectedCowboyName,
      hatName: wardrobeParity.expectedHatName,
    });
    await page.locator("#wardrobe-close-btn").click();
    await expect(page.locator("#wardrobe-menu")).toBeHidden();

    await page.locator("#start-btn").click();
    await page.waitForFunction(() => {
      try {
        return JSON.parse(window.render_game_to_text()).mode === "playing";
      } catch (error) {
        return false;
      }
    });
    await page.locator("#pause-menu-btn").click();
    await expect(page.locator("#pause-menu")).toHaveAttribute("aria-hidden", "false");
    await expectTextKey(page, "#pause-menu-title", "pause.title");
    await expectAttributeKey(page, "#pause-menu", "aria-label", "pause.menu.a11y");
    await expectAttributeKey(
      page,
      "#pause-close-btn",
      "aria-label",
      "pause.close.a11y"
    );
    entries.push(...(await readSurfaceCopy(page, "#pause-menu", "pause")));
    await page.locator("#pause-settings-btn").click();
    await expect(page.locator("#pause-settings-panel")).toHaveClass(/is-visible/);
    entries.push(
      ...(await readSurfaceCopy(page, "#pause-menu", "pause-settings"))
    );

    expectCleanEntries(entries, `${locale} UI`);
    expectLocaleScript(entries, locale, `${locale} UI`);
    expectNoEnglishFallback(entries, locale, `${locale} UI`);
    expect(pageErrors).toEqual([]);
  });
}

test("language switching updates an open catalog and persists the choice", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await openLocale(page, "en");
  await dismissIntro(page);
  await resetProgression(page);

  await page.locator('[data-language="ru"]').click();
  await expectLanguageState(page, "ru");
  await expectTextKey(page, "#start-btn", "menu.startHunt");
  expect(
    await page.evaluate((key) => localStorage.getItem(key), LOCALE_STORAGE_KEY)
  ).toBe("ru");

  await page.locator("#contracts-btn").click();
  await expect(page.locator(".contract-card")).toHaveCount(CONTRACT_COUNT);
  const contract = page.locator(
    '[data-contract-id="hunt.any.1"] [data-contract-title]'
  );
  const russianTitle = await translated(page, "contract.hunt.any.1.title");
  await expect(contract).toHaveText(russianTitle);

  await page.evaluate(() => {
    document.querySelector('[data-language="hi"]').click();
  });
  await expectLanguageState(page, "hi");
  const hindiTitle = await translated(page, "contract.hunt.any.1.title");
  expect(hindiTitle).not.toBe(russianTitle);
  expect(DEVANAGARI.test(hindiTitle)).toBe(true);
  await expect(contract).toHaveText(hindiTitle);
  expect(
    await page.evaluate((key) => localStorage.getItem(key), LOCALE_STORAGE_KEY)
  ).toBe("hi");

  await page.goto(`${fileUrl("index.html")}?mapSeed=7301&i18nQa=1`, {
    waitUntil: "domcontentloaded",
  });
  await waitForLocalizedApp(page);
  await expectLanguageState(page, "hi");
  await dismissIntro(page);
  await expectTextKey(page, "#start-btn", "menu.startHunt");

  await page.goto(appUrl("ru"), { waitUntil: "domcontentloaded" });
  await waitForLocalizedApp(page);
  await expectLanguageState(page, "ru");
});

test("localized main-menu labels are not visually truncated", async ({ page }) => {
  test.setTimeout(120_000);
  const viewports = [
    { width: 960, height: 540 },
    { width: 844, height: 390 },
    { width: 667, height: 375 },
    { width: 520, height: 320 },
  ];
  const failures = [];

  for (const locale of LOCALES) {
    await page.setViewportSize(viewports[0]);
    await openLocale(page, locale);
    await dismissIntro(page);

    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await page.evaluate(
        () => new Promise((resolve) => requestAnimationFrame(() => resolve()))
      );
      const entries = await page.evaluate(() =>
        Array.from(
          document.querySelectorAll(
            [
              "#start-btn",
              "#local-multiplayer-btn",
              ".menu-contracts-btn__copy strong",
              ".menu-contracts-btn__copy small",
              ".game-guide-launcher__copy strong",
              ".game-guide-launcher__copy small",
            ].join(",")
          )
        )
          .filter((element) => {
            const style = getComputedStyle(element);
            const rect = element.getBoundingClientRect();
            return (
              style.display !== "none" &&
              style.visibility !== "hidden" &&
              rect.width > 0 &&
              rect.height > 0
            );
          })
          .map((element, index) => ({
            index,
            text: element.textContent.trim(),
            overflowX: element.scrollWidth - element.clientWidth,
            overflowY: element.scrollHeight - element.clientHeight,
          }))
      );
      for (const entry of entries) {
        if (entry.overflowX > 1 || entry.overflowY > 1) {
          failures.push({
            locale,
            viewport: `${viewport.width}x${viewport.height}`,
            ...entry,
          });
        }
      }
    }
  }

  expect(failures, "localized main-menu text clipping").toEqual([]);
});

test("phone dialogs respect safe areas and guide step numbers clear their titles", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const viewports = [
    { width: 780, height: 360, safeLeft: 32, safeRight: 6 },
    { width: 667, height: 375, safeLeft: 28, safeRight: 8 },
  ];
  const surfaces = [
    {
      trigger: "#contracts-btn",
      dialog: "#contracts-menu",
      panel: "#contracts-menu > .contracts-menu__panel",
      close: "#contracts-close-btn",
    },
    {
      trigger: "#unlock-shop-btn",
      dialog: "#unlock-shop",
      panel: "#unlock-shop > .unlock-shop__panel",
      close: "#unlock-shop-close-btn",
    },
    {
      trigger: "#wardrobe-btn",
      dialog: "#wardrobe-menu",
      panel: "#wardrobe-menu > .wardrobe-menu__panel",
      close: "#wardrobe-close-btn",
    },
    {
      trigger: "#game-guide-btn",
      dialog: "#game-guide",
      panel: "#game-guide > .game-guide__panel",
      close: "#game-guide-close-btn",
      guide: true,
    },
  ];
  const failures = [];

  await page.emulateMedia({ reducedMotion: "reduce" });

  for (const locale of LOCALES) {
    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await openLocale(page, locale);
      await dismissIntro(page);

      for (const surface of surfaces) {
        const trigger = page.locator(surface.trigger);
        await expect(trigger).toBeVisible();
        await trigger.click();
        await expect(page.locator(surface.dialog)).toBeVisible();

        const layout = await page.evaluate(
          ({ dialogSelector, panelSelector, closeSelector, safeLeft, safeRight, guide }) => {
            const dialog = document.querySelector(dialogSelector);
            dialog.style.setProperty("--dialog-safe-left", `${safeLeft}px`);
            dialog.style.setProperty("--dialog-safe-right", `${safeRight}px`);

            const readRect = (element) => {
              const rect = element.getBoundingClientRect();
              return {
                left: rect.left,
                top: rect.top,
                right: rect.right,
                bottom: rect.bottom,
                width: rect.width,
                height: rect.height,
              };
            };
            const panel = document.querySelector(panelSelector);
            const close = document.querySelector(closeSelector);
            const dialogStyle = getComputedStyle(dialog);
            const stepLayouts = guide
              ? Array.from(
                  document.querySelectorAll(
                    "#game-guide-first-hunt .game-guide__steps article"
                  )
                ).map((article) => {
                  const number = article.querySelector(":scope > span");
                  const title = article.querySelector("h4");
                  const numberRect = readRect(number);
                  const titleRange = document.createRange();
                  titleRange.selectNodeContents(title);
                  const titleTextRects = Array.from(titleRange.getClientRects()).map(
                    (rect) => ({
                      left: rect.left,
                      top: rect.top,
                      right: rect.right,
                      bottom: rect.bottom,
                    })
                  );
                  const overlapsTitle = titleTextRects.some(
                    (rect) =>
                      rect.left < numberRect.right - 1 &&
                      rect.right > numberRect.left + 1 &&
                      rect.top < numberRect.bottom - 1 &&
                      rect.bottom > numberRect.top + 1
                  );
                  return {
                    number: number.textContent.trim(),
                    numberRect,
                    title: title.textContent.trim(),
                    titleTextRects,
                    overlapsTitle,
                  };
                })
              : [];

            return {
              viewport: {
                width: window.innerWidth,
                height: window.innerHeight,
              },
              paddingLeft: Number.parseFloat(dialogStyle.paddingLeft),
              paddingRight: Number.parseFloat(dialogStyle.paddingRight),
              panel: readRect(panel),
              close: readRect(close),
              documentScrollWidth: document.documentElement.scrollWidth,
              bodyScrollWidth: document.body.scrollWidth,
              stepLayouts,
            };
          },
          {
            dialogSelector: surface.dialog,
            panelSelector: surface.panel,
            closeSelector: surface.close,
            safeLeft: viewport.safeLeft,
            safeRight: viewport.safeRight,
            guide: Boolean(surface.guide),
          }
        );

        const expectedGutter = Math.max(viewport.safeLeft, viewport.safeRight);
        const reasons = [];
        if (Math.abs(layout.paddingLeft - expectedGutter) > 1) {
          reasons.push(`left-padding:${layout.paddingLeft}`);
        }
        if (Math.abs(layout.paddingRight - expectedGutter) > 1) {
          reasons.push(`right-padding:${layout.paddingRight}`);
        }
        for (const [name, rect] of [
          ["panel", layout.panel],
          ["close", layout.close],
        ]) {
          if (rect.left < -1) reasons.push(`${name}-left:${rect.left}`);
          if (rect.top < -1) reasons.push(`${name}-top:${rect.top}`);
          if (rect.right > layout.viewport.width + 1) {
            reasons.push(`${name}-right:${rect.right}`);
          }
          if (rect.bottom > layout.viewport.height + 1) {
            reasons.push(`${name}-bottom:${rect.bottom}`);
          }
        }
        const panelCenter = (layout.panel.left + layout.panel.right) / 2;
        if (Math.abs(panelCenter - layout.viewport.width / 2) > 1) {
          reasons.push(`panel-center:${panelCenter}`);
        }
        if (layout.documentScrollWidth > layout.viewport.width + 1) {
          reasons.push(`document-width:${layout.documentScrollWidth}`);
        }
        if (layout.bodyScrollWidth > layout.viewport.width + 1) {
          reasons.push(`body-width:${layout.bodyScrollWidth}`);
        }
        for (const step of layout.stepLayouts) {
          if (step.overlapsTitle) {
            reasons.push(`step-${step.number}-overlaps:${step.title}`);
          }
        }
        if (reasons.length) {
          failures.push({
            locale,
            viewport: `${viewport.width}x${viewport.height}`,
            dialog: surface.dialog,
            reasons,
          });
        }

        await page.locator(surface.close).click();
        await expect(page.locator(surface.dialog)).toBeHidden();
      }
    }
  }

  expect(failures, "mobile dialog safe-area or guide-number layout").toEqual([]);
});

test("Hindi UI uses a Devanagari font stack without glyph tracking", async ({
  page,
}) => {
  await page.setViewportSize({ width: 960, height: 540 });
  await openLocale(page, "hi");
  await dismissIntro(page);

  const typography = await page.evaluate(() => {
    const selectors = [
      "#start-btn",
      "#local-multiplayer-btn",
      ".menu-contracts-btn__copy strong",
      ".game-guide-launcher__copy strong",
    ];
    return {
      bodyFontFamily: getComputedStyle(document.body).fontFamily,
      samples: selectors.map((selector) => {
        const element = document.querySelector(selector);
        const style = getComputedStyle(element);
        return {
          selector,
          fontFamily: style.fontFamily,
          fontSize: Number.parseFloat(style.fontSize),
          letterSpacing: style.letterSpacing,
          lineHeight: Number.parseFloat(style.lineHeight),
        };
      }),
    };
  });

  expect(typography.bodyFontFamily).toMatch(
    /Nirmala UI|Noto Sans Devanagari|Mangal/
  );
  for (const sample of typography.samples) {
    expect(sample.fontFamily, sample.selector).toMatch(
      /Nirmala UI|Noto Sans Devanagari|Mangal/
    );
    expect(["normal", "0px"], sample.selector).toContain(sample.letterSpacing);
    if (sample.selector.startsWith("#")) {
      expect(sample.lineHeight, sample.selector).toBeGreaterThanOrEqual(
        sample.fontSize * 1.15
      );
    }
  }
});

test("localized contract cards keep titles, descriptions, and rewards complete", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const viewports = [
    { width: 1280, height: 720 },
    { width: 960, height: 540 },
    { width: 844, height: 390 },
    { width: 667, height: 375 },
    { width: 520, height: 320 },
  ];
  const failures = [];

  for (const locale of LOCALES) {
    await page.setViewportSize(viewports[0]);
    await openLocale(page, locale);
    await dismissIntro(page);
    await page.locator("#contracts-btn").click();

    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await page.evaluate(
        () => new Promise((resolve) => requestAnimationFrame(() => resolve()))
      );
      const cards = await page.evaluate(() =>
        Array.from(
          document.querySelectorAll("#contracts-list .contract-card")
        ).map((card) => {
            const title = card.querySelector("[data-contract-title]");
            const description = card.querySelector("[data-contract-description]");
            const reward = card.querySelector("[data-contract-reward]");
            return {
              title: title.textContent.trim(),
              reward: reward.textContent.trim(),
              titleOverflowX: title.scrollWidth - title.clientWidth,
              titleOverflowY: title.scrollHeight - title.clientHeight,
              descriptionOverflowX:
                description.scrollWidth - description.clientWidth,
              descriptionOverflowY:
                description.scrollHeight - description.clientHeight,
              rewardOverflowX: reward.scrollWidth - reward.clientWidth,
              rewardOverflowY: reward.scrollHeight - reward.clientHeight,
            };
          })
      );
      for (const card of cards) {
        const reasons = [];
        for (const [field, value] of Object.entries(card)) {
          if (field.includes("Overflow") && value > 1) {
            reasons.push(`${field}:${value}`);
          }
        }
        if (reasons.length) {
          failures.push({
            locale,
            viewport: `${viewport.width}x${viewport.height}`,
            title: card.title,
            reward: card.reward,
            reasons,
          });
        }
      }
    }
  }

  expect(failures, "localized contract-card clipping").toEqual([]);
});

test("localized wardrobe names stay complete while cycling every cosmetic", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const viewports = [
    { width: 960, height: 540 },
    { width: 667, height: 375 },
    { width: 520, height: 320 },
  ];
  const failures = [];

  for (const locale of LOCALES) {
    await page.setViewportSize(viewports[0]);
    await openLocale(page, locale);
    await dismissIntro(page);
    await page.locator("#wardrobe-btn").click();

    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      for (const [type, count] of [
        ["hat", 12],
        ["cowboy", 20],
      ]) {
        for (let index = 0; index < count; index += 1) {
          const entries = await page.evaluate(() =>
            [
              "#wardrobe-hat-name",
              "#wardrobe-cowboy-name",
              "#wardrobe-preview-name",
              "#wardrobe-preview-description",
            ].map((selector) => {
              const element = document.querySelector(selector);
              return {
                selector,
                text: element.textContent.trim(),
                overflowX: element.scrollWidth - element.clientWidth,
                overflowY: element.scrollHeight - element.clientHeight,
              };
            })
          );
          for (const entry of entries) {
            if (entry.overflowX > 1 || entry.overflowY > 1) {
              failures.push({
                locale,
                viewport: `${viewport.width}x${viewport.height}`,
                type,
                index,
                ...entry,
              });
            }
          }
          await page.evaluate((cycleType) => {
            document
              .querySelector(
                `[data-wardrobe-cycle="${cycleType}"][data-direction="next"]`
              )
              .click();
          }, type);
        }
      }
    }
  }

  expect(failures, "localized wardrobe text clipping").toEqual([]);
});

test("localized unlock-card copy stays complete at supported landscape sizes", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const viewports = [
    { width: 960, height: 540 },
    { width: 844, height: 390 },
    { width: 667, height: 375 },
    { width: 520, height: 320 },
  ];
  const failures = [];

  for (const locale of LOCALES) {
    await page.setViewportSize(viewports[0]);
    await openLocale(page, locale);
    await dismissIntro(page);
    await page.locator("#unlock-shop-btn").click();
    await page.locator('[data-unlock-tab="cards"]').click();
    await expect(page.locator("#unlock-shop-content")).toHaveAttribute(
      "data-unlock-view",
      "cards"
    );
    await expect(page.locator(".unlock-card--card")).toHaveCount(UPGRADE_COUNT);

    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await page.evaluate(
        () => new Promise((resolve) => requestAnimationFrame(() => resolve()))
      );
      const cards = await page.evaluate(() =>
        Array.from(document.querySelectorAll(".unlock-card--card")).map((card) => {
          const title = card.querySelector("h3");
          const description = card.querySelector(".unlock-card__copy");
          const descriptionStyle = getComputedStyle(description);
          return {
            title: title.textContent.trim(),
            titleOverflowX: title.scrollWidth - title.clientWidth,
            titleOverflowY: title.scrollHeight - title.clientHeight,
            descriptionVisible:
              descriptionStyle.display !== "none" &&
              descriptionStyle.visibility !== "hidden",
            descriptionOverflowX:
              description.scrollWidth - description.clientWidth,
            descriptionOverflowY:
              description.scrollHeight - description.clientHeight,
          };
        })
      );

      for (const card of cards) {
        const reasons = [];
        if (card.titleOverflowX > 1) {
          reasons.push(`title-x:${card.titleOverflowX}`);
        }
        if (card.titleOverflowY > 1) {
          reasons.push(`title-y:${card.titleOverflowY}`);
        }
        if (card.descriptionVisible && card.descriptionOverflowX > 1) {
          reasons.push(`description-x:${card.descriptionOverflowX}`);
        }
        if (card.descriptionVisible && card.descriptionOverflowY > 1) {
          reasons.push(`description-y:${card.descriptionOverflowY}`);
        }
        if (reasons.length) {
          failures.push({
            locale,
            viewport: `${viewport.width}x${viewport.height}`,
            title: card.title,
            reasons,
          });
        }
      }
    }
  }

  expect(failures, "localized unlock-card clipping").toEqual([]);
});

test("localized upgrade copy stays complete inside every card at supported landscape sizes", async ({
  page,
}) => {
  test.setTimeout(480_000);
  const viewports = [
    { width: 1440, height: 900 },
    { width: 960, height: 540 },
    { width: 844, height: 390 },
    { width: 667, height: 375 },
    { width: 520, height: 320 },
  ];

  await page.setViewportSize(viewports[0]);
  await openLocale(page, LOCALES[0]);
  const upgradeIds = await page.evaluate(() =>
    window.__dustAndDeadTest
      .getRunUpgradeCatalogForTest()
      .map((upgrade) => upgrade.id)
  );
  expect(upgradeIds).toHaveLength(UPGRADE_COUNT);

  const failures = [];
  for (const locale of LOCALES) {
    await page.setViewportSize(viewports[0]);
    await openLocale(page, locale);
    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      for (let offset = 0; offset < upgradeIds.length; offset += 3) {
        const batch = upgradeIds.slice(offset, offset + 3);
        const audit = await page.evaluate(
          async ({ ids, activeLocale }) => {
            window.__dustAndDeadTest.previewUpgradeCards(ids);
            await new Promise((resolve) => requestAnimationFrame(resolve));

            const catalog =
              window.DustAndDeadI18n.getCatalog(activeLocale);
            const panel = document.getElementById("level-up-choice");
            const options = document.getElementById("level-up-options");
            const panelRect = panel.getBoundingClientRect();
            const cards = Array.from(options.querySelectorAll(".upgrade-card")).map(
              (card) => {
                const id = card.getAttribute("data-standard-upgrade");
                const mark = card.querySelector(".class-card__mark");
                const title = card.querySelector("strong");
                const subtitle = title.querySelector(".upgrade-card__subtitle");
                const description = card.querySelector(
                  ":scope > span:not(.class-card__mark)"
                );
                const cardRect = card.getBoundingClientRect();
                const markRect = mark.getBoundingClientRect();
                const titleRect = title.getBoundingClientRect();
                const descriptionRect = description.getBoundingClientRect();
                const directTitle = Array.from(title.childNodes)
                  .filter((node) => node.nodeType === 3)
                  .map((node) => node.nodeValue)
                  .join("")
                  .trim();
                return {
                  id,
                  title: directTitle,
                  expectedTitle: catalog[`upgrade.${id}.title`],
                  subtitle: subtitle ? subtitle.textContent.trim() : "",
                  expectedSubtitle: catalog[`upgrade.${id}.subtitle`] || "",
                  description: description.textContent.trim(),
                  expectedDescription: catalog[`upgrade.${id}.description`],
                  cardOverflowX: card.scrollWidth - card.clientWidth,
                  cardOverflowY: card.scrollHeight - card.clientHeight,
                  titleOverflowX: title.scrollWidth - title.clientWidth,
                  titleOverflowY: title.scrollHeight - title.clientHeight,
                  descriptionOverflowX:
                    description.scrollWidth - description.clientWidth,
                  descriptionOverflowY:
                    description.scrollHeight - description.clientHeight,
                  markBottom: markRect.bottom,
                  titleTop: titleRect.top,
                  titleBottom: titleRect.bottom,
                  descriptionTop: descriptionRect.top,
                  descriptionBottom: descriptionRect.bottom,
                  cardTop: cardRect.top,
                  cardBottom: cardRect.bottom,
                  cardLeft: cardRect.left,
                  cardRight: cardRect.right,
                  titleLeft: titleRect.left,
                  titleRight: titleRect.right,
                  descriptionLeft: descriptionRect.left,
                  descriptionRight: descriptionRect.right,
                };
              }
            );
            return {
              panelOverflowY: panel.scrollHeight - panel.clientHeight,
              optionsOverflowX: options.scrollWidth - options.clientWidth,
              panelTop: panelRect.top,
              panelBottom: panelRect.bottom,
              viewportHeight: window.innerHeight,
              cards,
            };
          },
          { ids: batch, activeLocale: locale }
        );

        if (
          audit.panelOverflowY > 1 ||
          audit.optionsOverflowX > 1 ||
          audit.panelTop < -1 ||
          audit.panelBottom > audit.viewportHeight + 1
        ) {
          failures.push({
            locale,
            viewport: `${viewport.width}x${viewport.height}`,
            batch,
            scope: "panel",
            panelOverflowY: audit.panelOverflowY,
            optionsOverflowX: audit.optionsOverflowX,
            panelTop: audit.panelTop,
            panelBottom: audit.panelBottom,
            viewportHeight: audit.viewportHeight,
          });
        }

        for (const card of audit.cards) {
          const reasons = [];
          if (card.title !== card.expectedTitle) reasons.push("title-copy");
          if (card.subtitle !== card.expectedSubtitle) {
            reasons.push("subtitle-copy");
          }
          if (card.description !== card.expectedDescription) {
            reasons.push("description-copy");
          }
          if (card.cardOverflowX > 1) reasons.push(`card-x:${card.cardOverflowX}`);
          if (card.cardOverflowY > 1) reasons.push(`card-y:${card.cardOverflowY}`);
          if (card.titleOverflowX > 1) {
            reasons.push(`title-x:${card.titleOverflowX}`);
          }
          if (card.titleOverflowY > 1) {
            reasons.push(`title-y:${card.titleOverflowY}`);
          }
          if (card.descriptionOverflowX > 1) {
            reasons.push(`description-x:${card.descriptionOverflowX}`);
          }
          if (card.descriptionOverflowY > 1) {
            reasons.push(`description-y:${card.descriptionOverflowY}`);
          }
          if (card.markBottom > card.titleTop + 1) {
            reasons.push("mark-title-overlap");
          }
          if (card.titleBottom > card.descriptionTop + 1) {
            reasons.push("title-description-overlap");
          }
          if (card.descriptionBottom > card.cardBottom - 6) {
            reasons.push("description-below-card");
          }
          if (
            card.titleLeft < card.cardLeft - 1 ||
            card.titleRight > card.cardRight + 1
          ) {
            reasons.push("title-outside-card");
          }
          if (
            card.descriptionLeft < card.cardLeft - 1 ||
            card.descriptionRight > card.cardRight + 1
          ) {
            reasons.push("description-outside-card");
          }
          if (reasons.length) {
            failures.push({
              locale,
              viewport: `${viewport.width}x${viewport.height}`,
              scope: "card",
              id: card.id,
              title: card.title,
              description: card.description,
              reasons,
            });
          }
        }
      }
    }
  }

  expect(
    failures.slice(0, 80),
    `localized upgrade-card clipping/copy failures (${failures.length} total)`
  ).toEqual([]);
});
