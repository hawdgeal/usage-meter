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
  cardOnTop: {}, // separate cards: { claude: bool, chatgpt: bool } set by each card's pin
  miniPanel: true,
  miniOnTop: true,
  miniOnlyWithApp: false, // show the mini panel only while a matching app is in front
  attachToApp: false, // keep each card just above its own app's window instead of above everything
  dockSidebar: false, // with attachToApp: each card sits in its app's sidebar, as wide as it, above its footer
  attachMove: false, // with attachToApp: the card also moves with its app's window
  attachOffsets: {}, // with attachMove: { key: { right, bottom, dx, dy } } from the nearest corner of the app window
  miniOpacity: 1,
  miniBounds: null,
  miniBoundsByApp: {}, // separate cards: { claude: {x, y}, chatgpt: {x, y} }
  cardDock: {}, // per card, overriding dockSidebar: { main | claude | chatgpt: true/false } (its dock button)
  cardHeights: {}, // heights set by dragging a card's top or bottom edge: { key or "key:dock": height }
  cardWidths: {}, // widths set by dragging a card's edge: { main | claude | chatgpt: width }
  lookSource: "browser", // the cards' look: "browser" (the extension's, live) or "own" (own-look.json)
  launchAtLogin: false,
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
  const settings = { ...DEFAULTS, ...read(files.settings, {}) };
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

module.exports = { create, DEFAULTS, prefsKey, LOCAL_STATE };
