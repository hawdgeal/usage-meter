// The companion's own settings, the last usage received, the extension's panel settings per site,
// and panel state changed in the companion (collapsed panel and sections). JSON in the app's data folder.
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DEFAULTS = {
  mode: "follow", // "follow" the app in front, or always "claude" / "chatgpt" / "codex"
  followBrowsers: true, // match browser windows by title (e.g. "… - Claude")
  followTerminals: true, // match terminals running Claude Code or Codex by title
  cards: "one", // "one" app, "both" Claude and ChatGPT in one panel, or "separate" panels
  cardsLayout: "column", // both cards "column" (stacked) or "row" (side by side)
  miniPanel: true, // show the cards
  placement: {}, // per card (main | claude | chatgpt): "float" (default), "app" (on top of its app) or "dock" (in its app's sidebar)
  onTop: {}, // per floating card: keep above other windows (default true)
  attachMove: false, // "app" cards also move with their app's window
  attachOffsets: {}, // with attachMove: { key: { right, bottom, dx, dy } } from the nearest corner of the app window
  miniOpacity: 1,
  miniBounds: null,
  miniBoundsByApp: {}, // separate cards: { claude: {x, y}, chatgpt: {x, y} }
  cardHeights: {}, // heights set by dragging a card's top or bottom edge: { key or "key:dock": height }
  cardWidths: {}, // widths set by dragging a card's edge: { main | claude | chatgpt: width }
  lookSource: "browser", // the cards' look: "browser" (the extension's, live) or "own" (own-look.json)
  launchAtLogin: false,
  directLogin: {}, // { claude, chatgpt: true } once you signed in in the companion itself (see direct.js)
  updateCheck: true,
  syncAt: 0, // when the settings that follow you (see SYNCED in main.js) last changed here or arrived from browser sync // look for a newer companion on GitHub at start and every few hours
  extensionIds: [], // extra Chromium extension IDs entered by hand
  lastApp: "claude",
  onboarded: false,
};

// Extension settings that change with every usage update, or that belong to where the panel is
// shown rather than how it looks. Changes to these don't redraw the companion's panel.
const VOLATILE = ["usage", "plan", "usageAt", "models", "creditReferencePending", "settingsTab", "settingsClosed", "settingsPosition", "settingsSize", "collapsed", "closed", "floating", "position"];
// Panel state the companion keeps for itself.
const LOCAL_STATE = ["collapsed", "closed"];

function prefsKey(settings) {
  if (!settings || typeof settings !== "object") return "";
  const o = {};
  for (const k of Object.keys(settings).sort()) if (!VOLATILE.includes(k)) o[k] = settings[k];
  return crypto.createHash("sha1").update(JSON.stringify(o)).digest("hex").slice(0, 12);
}

function create(dir) {
  const files = { settings: "settings.json", usage: "last-usage.json", ext: "extension-settings.json", local: "panel-state.json", own: "own-look.json" };
  const read = (f, d) => { try { const v = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")); return v && typeof v === "object" ? v : d; } catch (_) { return d; } };
  const raw = read(files.settings, {});
  const settings = { ...DEFAULTS, ...raw };
  for (const k of Object.keys(settings)) if (!(k in DEFAULTS)) delete settings[k];
  const data = { usage: read(files.usage, {}), ext: read(files.ext, {}), local: read(files.local, {}), own: read(files.own, {}) };
  const timers = {};
  const write = (name, value) => {
    clearTimeout(timers[name]);
    timers[name] = setTimeout(() => {
      try {
        const f = path.join(dir, files[name]);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(f + ".tmp", JSON.stringify(value, null, 2));
        fs.renameSync(f + ".tmp", f);
      } catch (_) {}
    }, 300);
  };
  return {
    settings,
    raw, // settings.json as read, for converting settings an older version wrote
    usage: data.usage,
    ext: data.ext,
    local: data.local,
    own: data.own,
    // The companion's own look for a site (the extension's panel settings, without what changes with
    // every update). value null removes it. Returns true when the look changed.
    setOwn(site, value) {
      const before = prefsKey(data.own[site]);
      if (value) {
        const o = {};
        for (const [k, v] of Object.entries(value)) if (!VOLATILE.includes(k)) o[k] = v;
        data.own[site] = o;
      } else delete data.own[site];
      write("own", data.own);
      return prefsKey(data.own[site]) !== before;
    },
    set(patch) {
      for (const [k, v] of Object.entries(patch || {})) if (k in DEFAULTS) settings[k] = v;
      write("settings", settings);
    },
    saveUsage() { write("usage", data.usage); },
    // Returns true when the panel's look changed (not just its data).
    setExt(site, value) {
      const before = prefsKey(data.ext[site]);
      data.ext[site] = value;
      write("ext", data.ext);
      return prefsKey(value) !== before;
    },
    setLocal(site, patch) {
      const cur = { ...(data.local[site] || {}) };
      for (const k of LOCAL_STATE) if (patch && k in patch) cur[k] = patch[k];
      data.local[site] = cur;
      write("local", data.local);
    },
  };
}

// 0.2.17 and earlier: "Keep on top" (miniOnTop, per card cardOnTop), "On top of its app only"
// (attachToApp), "Dock in its app's sidebar" (dockSidebar, per card cardDock) and "Only while … in
// front" (miniOnlyWithApp) become { placement, onTop } per card. null when there's nothing to convert.
const OLD_PLACEMENT = ["miniOnTop", "cardOnTop", "attachToApp", "dockSidebar", "cardDock", "miniOnlyWithApp"];
function placementFromOld(o) {
  if (!o || !OLD_PLACEMENT.some((k) => k in o)) return null;
  const pin = (k) => (k !== "main" && o.cardOnTop && typeof o.cardOnTop[k] === "boolean" ? o.cardOnTop[k] : o.miniOnTop !== false);
  const dock = (k) => (o.cardDock && typeof o.cardDock[k] === "boolean" ? o.cardDock[k] : !!o.dockSidebar);
  const placement = {}, onTop = {};
  for (const k of ["main", "claude", "chatgpt"]) {
    placement[k] = o.attachToApp ? (dock(k) ? "dock" : pin(k) ? "app" : "float") : o.miniOnlyWithApp ? "app" : "float";
    onTop[k] = pin(k); // unpinned with "on top of its app" was an ordinary window: floating, not on top
  }
  return { placement, onTop };
}

module.exports = { create, DEFAULTS, prefsKey, LOCAL_STATE, placementFromOld };
