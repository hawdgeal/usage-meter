// Settings and the last usage received, kept as JSON in the app's data folder.
"use strict";
const fs = require("fs");
const path = require("path");

const DEFAULTS = {
  mode: "follow", // "follow" the app in front, or always "claude" / "chatgpt" / "codex"
  followBrowsers: true, // match browser windows by title (e.g. "… - Claude")
  followTerminals: true, // match terminals running Claude Code or Codex by title
  show: "left", // "left" or "used"
  showModels: true, // per-model limits (e.g. Opus weekly)
  miniPanel: true,
  miniOnTop: true,
  miniOnlyWithApp: false, // show the mini panel only while a matching app is in front
  miniOpacity: 1,
  miniBounds: null,
  theme: "system",
  launchAtLogin: false,
  extensionIds: [], // extra Chromium extension IDs entered by hand
  lastApp: "claude",
  onboarded: false,
};

function create(dir) {
  const file = path.join(dir, "settings.json");
  const usageFile = path.join(dir, "last-usage.json");
  const read = (f, d) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch (_) { return d; } };
  const settings = { ...DEFAULTS, ...read(file, {}) };
  const usage = read(usageFile, {});
  const timers = {};
  const write = (f, data) => {
    clearTimeout(timers[f]);
    timers[f] = setTimeout(() => {
      try {
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(f + ".tmp", JSON.stringify(data, null, 2));
        fs.renameSync(f + ".tmp", f);
      } catch (_) {}
    }, 300);
  };
  return {
    settings,
    usage,
    set(patch) {
      for (const [k, v] of Object.entries(patch || {})) if (k in DEFAULTS) settings[k] = v;
      write(file, settings);
    },
    saveUsage() { write(usageFile, usage); },
  };
}

module.exports = { create, DEFAULTS };
