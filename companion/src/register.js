// Connects the browser extension to this app: writes the native-messaging host files and
// registers them for each browser under HKEY_CURRENT_USER (no admin rights needed).
// Chromium browsers only let listed extension IDs start a host, so the IDs of installed copies
// of Usage Meter are read from each browser profile; IDs can also be added by hand.
"use strict";
const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");

const HOST = "fr.alencar.usage_meter";
const FIREFOX_ID = "chatgpt-usage-meter@alencar.fr";
const ID_RE = /^[a-p]{32}$/;

// reg: where the browser looks for hosts (null: it reads Chrome's key).
// data: its profile folder, under %LOCALAPPDATA% (local) or %APPDATA% (roaming).
const BROWSERS = [
  { id: "chrome", name: "Chrome", reg: "Software\\Google\\Chrome\\NativeMessagingHosts", local: "Google\\Chrome\\User Data" },
  { id: "edge", name: "Edge", reg: "Software\\Microsoft\\Edge\\NativeMessagingHosts", local: "Microsoft\\Edge\\User Data" },
  { id: "brave", name: "Brave", reg: "Software\\BraveSoftware\\Brave-Browser\\NativeMessagingHosts", local: "BraveSoftware\\Brave-Browser\\User Data" },
  { id: "chromium", name: "Chromium", reg: "Software\\Chromium\\NativeMessagingHosts", local: "Chromium\\User Data" },
  { id: "vivaldi", name: "Vivaldi", reg: null, local: "Vivaldi\\User Data" },
  { id: "opera", name: "Opera", reg: null, roaming: "Opera Software\\Opera Stable", single: true },
  { id: "firefox", name: "Firefox", reg: "Software\\Mozilla\\NativeMessagingHosts", firefox: true },
];

const winJoin = (...p) => p.filter(Boolean).join("\\");

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch (_) { return null; }
}

function isUsageMeter(manifest) {
  if (!manifest || typeof manifest !== "object") return false;
  const gecko = manifest.browser_specific_settings && manifest.browser_specific_settings.gecko;
  if (gecko && gecko.id === FIREFOX_ID) return true;
  return /usage meter/i.test(`${manifest.name || ""} ${manifest.short_name || ""}`) && /chatgpt|claude/i.test(manifest.name || "");
}

function profilesOf(dir, single) {
  if (single) return fs.existsSync(path.join(dir, "Preferences")) ? [dir] : [];
  let names = [];
  try { names = fs.readdirSync(dir); } catch (_) { return []; }
  return names.map((n) => path.join(dir, n)).filter((p) => fs.existsSync(path.join(p, "Preferences")) || fs.existsSync(path.join(p, "Secure Preferences")));
}

// env: { LOCALAPPDATA, APPDATA }. Returns [{ id, browser, profile, path }].
function detectExtensionIds(env) {
  const e = env || process.env;
  const found = new Map();
  for (const b of BROWSERS) {
    if (b.firefox) continue;
    const rootDir = b.local ? e.LOCALAPPDATA && path.join(e.LOCALAPPDATA, ...b.local.split("\\")) : e.APPDATA && path.join(e.APPDATA, ...b.roaming.split("\\"));
    if (!rootDir) continue;
    for (const profile of profilesOf(rootDir, b.single)) {
      for (const f of ["Secure Preferences", "Preferences"]) {
        const prefs = readJson(path.join(profile, f));
        const settings = prefs && prefs.extensions && prefs.extensions.settings;
        if (!settings || typeof settings !== "object") continue;
        for (const [id, s] of Object.entries(settings)) {
          if (!ID_RE.test(id) || !s || typeof s !== "object" || found.has(id)) continue;
          let manifest = s.manifest || null;
          let dir = null;
          if (typeof s.path === "string" && s.path) {
            dir = path.isAbsolute(s.path) || /^[a-z]:[\\/]/i.test(s.path) ? s.path : path.join(profile, "Extensions", s.path);
            if (!manifest) manifest = readJson(path.join(dir, "manifest.json"));
          }
          if (isUsageMeter(manifest)) found.set(id, { id, browser: b.name, profile: path.basename(profile), path: dir });
        }
      }
    }
  }
  return [...found.values()];
}

// Writes usage-meter-host.bat and the two host manifests into dir. Returns their paths.
function writeHostFiles(dir, { exePath, scriptPath, ids }) {
  fs.mkdirSync(dir, { recursive: true });
  const bat = path.join(dir, "usage-meter-host.bat");
  fs.writeFileSync(bat, ["@echo off", "set ELECTRON_RUN_AS_NODE=1", `"${exePath}" "${scriptPath}" %*`, ""].join("\r\n"));
  const base = { name: HOST, description: "Usage Meter desktop companion", path: bat, type: "stdio" };
  const chromium = path.join(dir, `${HOST}.chromium.json`);
  const firefox = path.join(dir, `${HOST}.firefox.json`);
  const origins = [...new Set(ids)].filter((id) => ID_RE.test(id)).map((id) => `chrome-extension://${id}/`);
  fs.writeFileSync(chromium, JSON.stringify({ ...base, allowed_origins: origins }, null, 2));
  fs.writeFileSync(firefox, JSON.stringify({ ...base, allowed_extensions: [FIREFOX_ID] }, null, 2));
  return { bat, chromium, firefox, origins };
}

function reg(args) {
  return new Promise((resolve) => {
    execFile("reg.exe", args, { windowsHide: true }, (err, stdout) => resolve({ ok: !err, out: String(stdout || "") }));
  });
}

// One registry entry per browser key (Vivaldi and Opera read Chrome's).
function registryPlan(files, hasChromiumIds) {
  return BROWSERS.filter((b) => b.reg && (b.firefox || hasChromiumIds)).map((b) => ({
    browser: b.name, key: `HKCU\\${winJoin(b.reg, HOST)}`, value: b.firefox ? files.firefox : files.chromium,
  }));
}

async function register({ dir, exePath, scriptPath, manualIds, env }) {
  const detected = detectExtensionIds(env);
  const ids = [...detected.map((d) => d.id), ...(manualIds || [])];
  const files = writeHostFiles(dir, { exePath, scriptPath, ids });
  const plan = registryPlan(files, files.origins.length > 0);
  const results = [];
  for (const p of plan) {
    const r = process.platform === "win32" ? await reg(["add", p.key, "/ve", "/t", "REG_SZ", "/d", p.value, "/f"]) : { ok: false };
    results.push({ browser: p.browser, ok: r.ok });
  }
  return { detected, ids: files.origins.length, files, results, at: Date.now() };
}

async function unregister() {
  const out = [];
  for (const b of BROWSERS) if (b.reg && process.platform === "win32") out.push((await reg(["delete", `HKCU\\${winJoin(b.reg, HOST)}`, "/f"])).ok);
  return out;
}

module.exports = { HOST, FIREFOX_ID, ID_RE, BROWSERS, detectExtensionIds, writeHostFiles, registryPlan, register, unregister, isUsageMeter };
