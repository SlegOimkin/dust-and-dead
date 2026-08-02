(function (global) {
  "use strict";

  var STORAGE_KEY = "dustAndDead.locale.v1";
  var SUPPORTED_LOCALES = ["en", "ru", "hi"];
  var ATTRIBUTE_NAMES = [
    "aria-label",
    "aria-description",
    "aria-valuetext",
    "title",
    "placeholder",
    "alt",
  ];
  var NUMBER_LOCALES = {
    en: "en-US",
    ru: "ru-RU",
    hi: "hi-IN",
  };
  var catalogs = {
    en: Object.create(null),
    ru: Object.create(null),
    hi: Object.create(null),
  };
  var sourceAliases = Object.create(null);
  var sourceKeys = Object.create(null);
  var sourcePatterns = [];
  var templatePatterns = [];
  var missingKeys = Object.create(null);
  var textState = new WeakMap();
  var attributeState = new WeakMap();
  var observer = null;
  var initialized = false;
  var currentLocale = readStoredLocale();

  function normalizeLocale(locale) {
    locale = String(locale || "").trim().toLowerCase().split("-")[0];
    return SUPPORTED_LOCALES.indexOf(locale) !== -1 ? locale : "en";
  }

  function readStoredLocale() {
    try {
      var requested = new URLSearchParams(global.location && global.location.search || "").get("lang");
      var requestedBase = String(requested || "").trim().toLowerCase().split("-")[0];
      if (SUPPORTED_LOCALES.indexOf(requestedBase) !== -1) {
        return requestedBase;
      }
      return normalizeLocale(global.localStorage && global.localStorage.getItem(STORAGE_KEY));
    } catch (error) {
      return "en";
    }
  }

  function writeStoredLocale(locale) {
    try {
      if (global.localStorage) global.localStorage.setItem(STORAGE_KEY, locale);
    } catch (error) {
      // A blocked storage area must never prevent the language from changing.
    }
  }

  function formatTemplate(message, params) {
    params = params && typeof params === "object" ? params : {};
    return String(message == null ? "" : message).replace(/\{([a-zA-Z0-9_]+)\}/g, function (_, name) {
      return Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : "{" + name + "}";
    });
  }

  function t(key, params, fallback) {
    key = String(key || "");
    var localized = catalogs[currentLocale][key];
    if (localized == null) localized = catalogs.en[key];
    if (localized == null) {
      missingKeys[key] = true;
      localized = fallback == null ? key : fallback;
    }
    return formatTemplate(localized, params);
  }

  function rebuildSourceKeys() {
    sourceKeys = Object.create(null);
    SUPPORTED_LOCALES.forEach(function (locale) {
      Object.keys(catalogs[locale]).forEach(function (key) {
        var value = catalogs[locale][key];
        if (typeof value !== "string" || !value.trim() || /\{[a-zA-Z0-9_]+\}/.test(value)) return;
        if (!sourceKeys[value.trim()]) sourceKeys[value.trim()] = key;
      });
    });
    Object.keys(sourceAliases).forEach(function (source) {
      sourceKeys[source] = sourceAliases[source];
    });
  }

  function compilePattern(spec) {
    if (!spec || !spec.key || !spec.source) return null;
    try {
      return {
        regex: spec.source instanceof RegExp
          ? spec.source
          : new RegExp(String(spec.source), String(spec.flags || "")),
        key: String(spec.key),
        params: Array.isArray(spec.params) ? spec.params.slice() : [],
        transform: typeof spec.transform === "function" ? spec.transform : null,
      };
    } catch (error) {
      return null;
    }
  }

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function compileTemplatePattern(key, template) {
    template = String(template == null ? "" : template);
    var params = [];
    var cursor = 0;
    var source = "^";
    var placeholder = /\{([a-zA-Z0-9_]+)\}/g;
    var match;
    while ((match = placeholder.exec(template))) {
      source += escapeRegExp(template.slice(cursor, match.index));
      source += "([\\s\\S]*?)";
      params.push(match[1]);
      cursor = match.index + match[0].length;
    }
    if (!params.length) return null;
    source += escapeRegExp(template.slice(cursor)) + "$";
    return {
      regex: new RegExp(source),
      key: String(key),
      params: params,
      transform: function (values) {
        Object.keys(values).forEach(function (name) {
          var raw = String(values[name] == null ? "" : values[name]);
          var sourceKey = sourceKeys[raw.trim()];
          if (sourceKey) values[name] = t(sourceKey);
        });
        return values;
      },
    };
  }

  function registerPack(pack) {
    if (!pack || typeof pack !== "object") return false;
    var messages = pack.messages && typeof pack.messages === "object" ? pack.messages : {};
    SUPPORTED_LOCALES.forEach(function (locale) {
      if (messages[locale] && typeof messages[locale] === "object") {
        Object.assign(catalogs[locale], messages[locale]);
        Object.keys(messages[locale]).forEach(function (key) {
          delete missingKeys[key];
        });
      }
    });
    var aliases = pack.aliases && typeof pack.aliases === "object" ? pack.aliases : {};
    Object.keys(aliases).forEach(function (source) {
      sourceAliases[String(source).trim()] = String(aliases[source]);
    });
    (Array.isArray(pack.patterns) ? pack.patterns : []).forEach(function (spec) {
      var pattern = compilePattern(spec);
      if (pattern) sourcePatterns.push(pattern);
    });
    SUPPORTED_LOCALES.forEach(function (locale) {
      var localeMessages = messages[locale] && typeof messages[locale] === "object"
        ? messages[locale]
        : {};
      Object.keys(localeMessages).forEach(function (key) {
        var pattern = compileTemplatePattern(key, localeMessages[key]);
        if (pattern) templatePatterns.push(pattern);
      });
    });
    templatePatterns.sort(function (a, b) {
      return b.regex.source.length - a.regex.source.length;
    });
    rebuildSourceKeys();
    if (initialized && global.document && global.document.documentElement) {
      refresh(global.document.documentElement);
    }
    return true;
  }

  function preserveOuterWhitespace(source, translated) {
    var leading = String(source).match(/^\s*/);
    var trailing = String(source).match(/\s*$/);
    return (leading ? leading[0] : "") + translated + (trailing ? trailing[0] : "");
  }

  function translateSource(source) {
    source = String(source == null ? "" : source);
    var trimmed = source.trim();
    if (!trimmed) return source;
    var key = sourceKeys[trimmed];
    if (key) return preserveOuterWhitespace(source, t(key));
    for (var groupIndex = 0; groupIndex < 2; groupIndex++) {
      var patterns = groupIndex === 0 ? sourcePatterns : templatePatterns;
      for (var i = 0; i < patterns.length; i++) {
        var pattern = patterns[i];
        pattern.regex.lastIndex = 0;
        var match = pattern.regex.exec(trimmed);
        if (!match) continue;
        var params = {};
        for (var paramIndex = 0; paramIndex < pattern.params.length; paramIndex++) {
          params[pattern.params[paramIndex]] = match[paramIndex + 1];
        }
        if (pattern.transform) params = pattern.transform(params, match, currentLocale) || params;
        return preserveOuterWhitespace(source, t(pattern.key, params, trimmed));
      }
    }
    return source;
  }

  function shouldSkipNode(node) {
    var element = node && (node.nodeType === 1 ? node : node.parentElement);
    if (!element) return true;
    if (/^(SCRIPT|STYLE|NOSCRIPT|TEXTAREA)$/i.test(element.tagName || "")) return true;
    return !!(element.closest && element.closest("[data-i18n-skip]"));
  }

  function localizeTextNode(node) {
    if (!node || node.nodeType !== 3 || shouldSkipNode(node)) return;
    var raw = String(node.nodeValue || "");
    if (!raw.trim()) return;
    var state = textState.get(node);
    if (!state) {
      state = { source: raw, lastApplied: raw };
      textState.set(node, state);
    } else if (raw !== state.lastApplied && raw !== state.source) {
      state.source = raw;
    }
    var translated = translateSource(state.source);
    state.lastApplied = translated;
    if (raw !== translated) node.nodeValue = translated;
  }

  function getAttributeMap(element) {
    var map = attributeState.get(element);
    if (!map) {
      map = Object.create(null);
      attributeState.set(element, map);
    }
    return map;
  }

  function localizeAttribute(element, name) {
    if (!element || !element.hasAttribute(name) || shouldSkipNode(element)) return;
    var raw = element.getAttribute(name);
    if (!raw || !raw.trim()) return;
    var map = getAttributeMap(element);
    var state = map[name];
    if (!state) {
      state = map[name] = { source: raw, lastApplied: raw };
    } else if (raw !== state.lastApplied && raw !== state.source) {
      state.source = raw;
    }
    var translated = translateSource(state.source);
    state.lastApplied = translated;
    if (raw !== translated) element.setAttribute(name, translated);
  }

  function applyExplicitKeys(element) {
    if (!element || element.nodeType !== 1) return;
    var textKey = element.getAttribute("data-i18n");
    if (textKey) {
      var translatedText = t(textKey);
      if (element.textContent !== translatedText) element.textContent = translatedText;
    }
    ATTRIBUTE_NAMES.forEach(function (name) {
      var key = element.getAttribute("data-i18n-" + name);
      if (!key) return;
      var translated = t(key);
      if (element.getAttribute(name) !== translated) element.setAttribute(name, translated);
    });
    Array.prototype.forEach.call(element.attributes || [], function (attribute) {
      var prefix = "data-i18n-attr-";
      if (attribute.name.indexOf(prefix) !== 0) return;
      var targetName = attribute.name.slice(prefix.length);
      if (!targetName) return;
      var translated = t(attribute.value);
      if (element.getAttribute(targetName) !== translated) {
        var shouldUpdateLiveValue =
          targetName === "value" &&
          "value" in element &&
          "defaultValue" in element &&
          element.value === element.defaultValue;
        element.setAttribute(targetName, translated);
        if (shouldUpdateLiveValue) element.value = translated;
      }
    });
  }

  function localizeElement(element) {
    if (!element || element.nodeType !== 1 || shouldSkipNode(element)) return;
    applyExplicitKeys(element);
    ATTRIBUTE_NAMES.forEach(function (name) {
      localizeAttribute(element, name);
    });
    if (
      element.tagName === "INPUT" &&
      /^(button|submit|reset)$/i.test(element.getAttribute("type") || "") &&
      element.hasAttribute("value")
    ) {
      localizeAttribute(element, "value");
    }
  }

  function refresh(root) {
    if (!global.document) return;
    root = root && root.nodeType ? root : global.document.body;
    if (!root) return;
    if (root.nodeType === 3) {
      localizeTextNode(root);
      return;
    }
    if (root.nodeType === 1) localizeElement(root);
    var walker = global.document.createTreeWalker(
      root,
      global.NodeFilter.SHOW_ELEMENT | global.NodeFilter.SHOW_TEXT
    );
    var node = walker.nextNode();
    while (node) {
      if (node.nodeType === 1) localizeElement(node);
      else localizeTextNode(node);
      node = walker.nextNode();
    }
  }

  function updateLanguageButtons() {
    if (!global.document) return;
    var buttons = global.document.querySelectorAll("[data-language]");
    for (var i = 0; i < buttons.length; i++) {
      var locale = normalizeLocale(buttons[i].getAttribute("data-language"));
      var active = locale === currentLocale;
      buttons[i].classList.toggle("is-active", active);
      buttons[i].setAttribute("aria-pressed", active ? "true" : "false");
    }
  }

  function setLocale(locale, options) {
    locale = normalizeLocale(locale);
    var previous = currentLocale;
    currentLocale = locale;
    if (!(options && options.persist === false)) {
      writeStoredLocale(locale);
      try {
        if (global.history && global.location) {
          var localeUrl = new URL(global.location.href);
          localeUrl.searchParams.set("lang", locale);
          global.history.replaceState(global.history.state, "", localeUrl.href);
        }
      } catch (error) {
        // URL synchronization is optional on restricted file/webview origins.
      }
    }
    if (global.document && global.document.documentElement) {
      global.document.documentElement.lang = locale;
      global.document.documentElement.setAttribute("data-locale", locale);
      var languageScopes = global.document.querySelectorAll("[data-i18n-current-lang]");
      for (var scopeIndex = 0; scopeIndex < languageScopes.length; scopeIndex++) {
        languageScopes[scopeIndex].lang = locale;
      }
    }
    updateLanguageButtons();
    if (global.document && global.document.documentElement) {
      refresh(global.document.documentElement);
    }
    if (previous !== locale || (options && options.forceEvent)) {
      global.dispatchEvent(new CustomEvent("dustdead:languagechange", {
        detail: { locale: locale, previousLocale: previous },
      }));
    }
    return locale;
  }

  function formatNumber(value, options) {
    try {
      return new Intl.NumberFormat(NUMBER_LOCALES[currentLocale], options || {}).format(value);
    } catch (error) {
      return String(value);
    }
  }

  function plural(key, count, params, fallback) {
    params = Object.assign({ count: count }, params || {});
    var category = "other";
    try {
      category = new Intl.PluralRules(NUMBER_LOCALES[currentLocale]).select(Number(count) || 0);
    } catch (error) {
      category = Number(count) === 1 ? "one" : "other";
    }
    var candidate = String(key || "") + "." + category;
    if (catalogs[currentLocale][candidate] == null && catalogs.en[candidate] == null) {
      candidate = String(key || "") + ".other";
    }
    return t(candidate, params, fallback);
  }

  function localizeSpec(domain, spec) {
    if (!spec || typeof spec !== "object") return spec;
    var id = String(spec.id || "");
    if (!id) return spec;
    var localized = Object.assign({}, spec);
    ["title", "subtitle", "label", "description"].forEach(function (field) {
      if (spec[field] == null) return;
      localized[field] = t(domain + "." + id + "." + field, null, spec[field]);
    });
    return localized;
  }

  function startObserver() {
    if (!global.MutationObserver || !global.document || !global.document.body) return;
    if (observer) observer.disconnect();
    observer = new MutationObserver(function (records) {
      for (var i = 0; i < records.length; i++) {
        var record = records[i];
        if (record.type === "characterData") {
          localizeTextNode(record.target);
        } else if (record.type === "attributes") {
          localizeAttribute(record.target, record.attributeName);
        } else {
          for (var childIndex = 0; childIndex < record.addedNodes.length; childIndex++) {
            refresh(record.addedNodes[childIndex]);
          }
        }
      }
    });
    observer.observe(global.document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ATTRIBUTE_NAMES.concat(["value"]),
    });
  }

  function initialize() {
    if (initialized || !global.document || !global.document.body) return;
    initialized = true;
    global.document.addEventListener("click", function (event) {
      var button = event.target && event.target.closest
        ? event.target.closest("[data-language]")
        : null;
      if (!button) return;
      setLocale(button.getAttribute("data-language"));
    });
    setLocale(currentLocale, { persist: false });
    startObserver();
  }

  var api = {
    supportedLocales: SUPPORTED_LOCALES.slice(),
    registerPack: registerPack,
    t: t,
    translateSource: translateSource,
    refresh: refresh,
    setLocale: setLocale,
    getLocale: function () { return currentLocale; },
    formatNumber: formatNumber,
    plural: plural,
    localizeSpec: localizeSpec,
    getMissingKeys: function () { return Object.keys(missingKeys).sort(); },
    getCatalog: function (locale) {
      return Object.assign({}, catalogs[normalizeLocale(locale)]);
    },
  };
  global.DustAndDeadI18n = api;

  if (global.document) {
    if (global.document.readyState === "loading") {
      global.document.addEventListener("DOMContentLoaded", initialize, { once: true });
    } else {
      initialize();
    }
  }
})(window);
