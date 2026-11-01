// Usage Meter Companion: a tray icon, a popup and an optional always-on-top mini panel that show
// Claude or ChatGPT / Codex usage. Usage arrives from the Usage Meter browser extension through
// native messaging (see host.js and bridge.js). The panel follows the app in front, or a fixed
// app chosen in Settings.
"use strict";
const path = require("path");
const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, nativeTheme, screen } = require("electron");

if (process.env.USAGE_METER_DATA) app.setPath("userData", process.env.USAGE_METER_DATA);
if (!app.requestSingleInstanceLock()) {
  app.quit();
  return;
}

const Store = require("./store");
const { Bridge } = require("./bridge");
const UsageView = require("./usage");
const { matchApp } = require("./app-match");
const foreground = require("./foreground");
const { ringBitmap, trayColor, trayFraction } = require("./icon");
const registration = require("./register");

const APP_IDS = ["claude", "chatgpt", "codex"];
const APP_LABELS = { claude: "Claude", chatgpt: "ChatGPT", codex: "Codex" };
const RENDERER = path.join(__dirname, "..", "renderer");
const PRELOAD = path.join(__dirname, "preload.js");
const POPUP_WIDTH = 340;
const MINI_WIDTH = 270;

let store, bridge, tray;
let popup = null, mini = null, settingsWin = null;
let followApp = "claude"; // last matching app seen in front
let frontMatched = false; // a matching app is in front right now
let foregroundTimer = null;
let reg = { state: "idle" }; // last browser registration result
let quitting = false;

const s = () => store.settings;
const currentApp = () => (s().mode === "follow" ? followApp : APP_IDS.includes(s().mode) ? s().mode : "claude");
const siteOf = (id) => UsageView.APPS[id].site;

function snapshot() {
  return {
    settings: s(),
    sites: store.usage,
    app: currentApp(),
    followApp,
    frontMatched,
    hosts: bridge ? bridge.list() : [],
    registration: reg,
    platform: process.platform,
    foreground: { available: foreground.available(), error: foreground.error() },
    version: app.getVersion(),
    dark: nativeTheme.shouldUseDarkColors,
    now: Date.now(),
  };
}

// ---------- state changes ----------
let broadcastQueued = false;
function changed() {
  if (broadcastQueued) return;
  broadcastQueued = true;
  setImmediate(() => {
    broadcastQueued = false;
    const snap = snapshot();
    for (const w of [popup, mini, settingsWin]) if (w && !w.isDestroyed()) w.webContents.send("state", snap);
    updateTray();
    updateMini();
  });
}

function onBridgeMessage(msg, host) {
  const site = msg.site;
  if (site !== "claude" && site !== "chatgpt") return;
  const prev = store.usage[site] || {};
  if (msg.type === "usage" && msg.data && typeof msg.data === "object") {
    const at = Number(msg.at) || Date.now();
    // With several browsers connected, keep the newest report.
    if (prev.at && at < prev.at && prev.browser !== host.browser) return;
    store.usage[site] = { data: msg.data, plan: msg.plan || null, at, browser: host.browser, source: msg.source || null, error: null, errorAt: null };
  } else if (msg.type === "usage-error") {
    store.usage[site] = { ...prev, error: String(msg.message || "Usage unavailable").slice(0, 200), errorAt: Number(msg.at) || Date.now(), browser: prev.browser || host.browser };
  } else return;
  store.saveUsage();
  changed();
}

function refresh(appId) {
  const asked = bridge.refresh(appId ? siteOf(appId) : undefined);
  return { asked };
}

// ---------- foreground app ----------
function pollForeground() {
  const win = foreground.get();
  if (!win) return;
  const m = matchApp(win, { browsers: s().followBrowsers, terminals: s().followTerminals, selfExe: process.execPath });
  if (m === "self") return; // our own popup or mini panel: keep what we show
  let dirty = false;
  if (m && m !== followApp) { followApp = m; store.set({ lastApp: m }); dirty = s().mode === "follow"; }
  if (!!m !== frontMatched) { frontMatched = !!m; dirty = true; }
  if (dirty) changed();
}

function startForeground() {
  clearInterval(foregroundTimer);
  if (foreground.available()) foregroundTimer = setInterval(pollForeground, 700);
}

// ---------- tray ----------
function trayImage(view) {
  const show = s().show;
  const frac = trayFraction(view, show);
  const color = trayColor(view, show);
  const img = nativeImage.createFromBitmap(ringBitmap(16, frac, color), { width: 16, height: 16, scaleFactor: 1 });
  for (const [scale, size] of [[1.25, 20], [1.5, 24], [2, 32]]) {
    img.addRepresentation({ scaleFactor: scale, width: size, height: size, buffer: ringBitmap(size, frac, color) });
  }
  return img;
}

let lastTrayKey = "";
function updateTray() {
  if (!tray) return;
  const id = currentApp();
  const view = UsageView.build(id, store.usage[siteOf(id)], { showModels: s().showModels });
  const key = `${id}|${view.head ? Math.round(view.head.left) : "-"}|${s().show}`;
  if (key !== lastTrayKey) { tray.setImage(trayImage(view)); lastTrayKey = key; }
  tray.setToolTip(UsageView.tooltip(view, { show: s().show }));
  tray.setContextMenu(trayMenu());
}

function modeItems() {
  return [
    { label: "Follow the app in front", type: "radio", checked: s().mode === "follow", click: () => setSettings({ mode: "follow" }) },
    ...APP_IDS.map((id) => ({ label: `Always ${APP_LABELS[id]}`, type: "radio", checked: s().mode === id, click: () => setSettings({ mode: id }) })),
  ];
}

function trayMenu() {
  return Menu.buildFromTemplate([
    { label: "Show usage", click: () => showPopup() },
    { label: "Mini panel", type: "checkbox", checked: s().miniPanel, click: (i) => setSettings({ miniPanel: i.checked }) },
    { type: "separator" },
    ...modeItems(),
    { type: "separator" },
    { label: "Refresh", click: () => refresh() },
    { label: "Settings…", click: () => openSettings() },
    { type: "separator" },
    { label: "Quit Usage Meter Companion", click: () => { quitting = true; app.quit(); } },
  ]);
}

// ---------- windows ----------
function baseWindow(extra) {
  return new BrowserWindow({
    show: false,
    frame: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#1f1f1f" : "#ffffff",
    webPreferences: { preload: PRELOAD, contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false },
    ...extra,
  });
}

function guard(win) {
  // Links and navigation never leave the app's own pages.
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (e) => e.preventDefault());
  return win;
}

function showPopup() {
  if (!popup || popup.isDestroyed()) {
    popup = guard(baseWindow({ width: POPUP_WIDTH, height: 260, alwaysOnTop: true }));
    popup.loadFile(path.join(RENDERER, "panel.html"), { query: { mode: "popup" } });
    popup.on("blur", () => { if (!popup.webContents.isDevToolsOpened()) popup.hide(); });
    popup.once("ready-to-show", () => placePopup(true));
    return;
  }
  popup.webContents.send("popup-shown");
  placePopup(true);
}

function togglePopup() {
  if (popup && !popup.isDestroyed() && popup.isVisible()) popup.hide();
  else showPopup();
}

// Next to the tray icon, kept inside the screen's work area (above the taskbar).
function placePopup(show) {
  if (!popup || popup.isDestroyed()) return;
  const [w, h] = popup.getSize();
  const tb = tray ? tray.getBounds() : null;
  const anchor = tb && tb.width ? { x: tb.x + tb.width / 2, y: tb.y } : screen.getCursorScreenPoint();
  const area = screen.getDisplayNearestPoint({ x: Math.round(anchor.x), y: Math.round(anchor.y) }).workArea;
  let x = Math.round(anchor.x - w / 2);
  let y = anchor.y > area.y + area.height / 2 ? area.y + area.height - h - 8 : area.y + 8;
  x = Math.max(area.x + 8, Math.min(x, area.x + area.width - w - 8));
  popup.setPosition(x, y);
  if (show) { popup.show(); popup.focus(); }
}

function miniShouldShow() {
  if (!s().miniPanel) return false;
  if (!s().miniOnlyWithApp) return true;
  return frontMatched || (mini && !mini.isDestroyed() && mini.isFocused());
}

function defaultMiniBounds(h) {
  const area = screen.getPrimaryDisplay().workArea;
  return { x: area.x + area.width - MINI_WIDTH - 16, y: area.y + area.height - h - 16 };
}

function onScreen(b) {
  return screen.getAllDisplays().some((d) => {
    const a = d.workArea;
    return b.x + 40 > a.x && b.x < a.x + a.width - 40 && b.y >= a.y - 10 && b.y < a.y + a.height - 30;
  });
}

function createMini() {
  mini = guard(baseWindow({ width: MINI_WIDTH, height: 120, alwaysOnTop: s().miniOnTop, focusable: true }));
  mini.loadFile(path.join(RENDERER, "panel.html"), { query: { mode: "mini" } });
  const saved = s().miniBounds;
  const pos = saved && onScreen(saved) ? saved : defaultMiniBounds(120);
  mini.setPosition(Math.round(pos.x), Math.round(pos.y));
  mini.on("moved", () => { const [x, y] = mini.getPosition(); setSettings({ miniBounds: { x, y } }, true); });
  mini.on("closed", () => { mini = null; });
  mini.once("ready-to-show", () => updateMini());
}

function updateMini() {
  const want = miniShouldShow();
  if (want && !mini) return createMini();
  if (!mini || mini.isDestroyed()) return;
  mini.setAlwaysOnTop(!!s().miniOnTop, "floating");
  mini.setOpacity(Math.max(0.3, Math.min(1, Number(s().miniOpacity) || 1)));
  if (want && !mini.isVisible() && mini.webContents.getURL()) mini.showInactive();
  else if (!want && mini.isVisible()) mini.hide();
}

function openSettings() {
  if (settingsWin && !settingsWin.isDestroyed()) { settingsWin.show(); settingsWin.focus(); return; }
  settingsWin = guard(new BrowserWindow({
    width: 560, height: 720, minWidth: 460, minHeight: 480, title: "Usage Meter Companion settings",
    autoHideMenuBar: true, show: false,
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#1f1f1f" : "#ffffff",
    webPreferences: { preload: PRELOAD, contextIsolation: true, sandbox: true, nodeIntegration: false },
  }));
  settingsWin.setMenu(null);
  settingsWin.loadFile(path.join(RENDERER, "settings.html"));
  settingsWin.once("ready-to-show", () => settingsWin.show());
  settingsWin.on("closed", () => { settingsWin = null; });
}

// ---------- settings ----------
function setSettings(patch, quiet) {
  const before = { ...s() };
  store.set(patch);
  if ("theme" in patch) nativeTheme.themeSource = ["light", "dark"].includes(s().theme) ? s().theme : "system";
  if ("launchAtLogin" in patch && process.platform === "win32") app.setLoginItemSettings({ openAtLogin: !!s().launchAtLogin, args: ["--hidden"] });
  if ("miniBounds" in patch && patch.miniBounds === null && mini && !mini.isDestroyed()) {
    const p = defaultMiniBounds(mini.getSize()[1]);
    mini.setPosition(p.x, p.y);
  }
  if ("extensionIds" in patch && JSON.stringify(before.extensionIds) !== JSON.stringify(s().extensionIds)) connectBrowsers();
  if (!quiet) changed();
}

async function connectBrowsers() {
  if (process.platform !== "win32") { reg = { state: "unsupported" }; changed(); return reg; }
  reg = { ...reg, state: "working" };
  changed();
  try {
    const scriptPath = app.isPackaged ? path.join(process.resourcesPath, "app.asar.unpacked", "src", "host.js") : path.join(__dirname, "host.js");
    const r = await registration.register({ dir: path.join(app.getPath("userData"), "native-host"), exePath: process.execPath, scriptPath, manualIds: s().extensionIds });
    reg = { state: "done", detected: r.detected, ids: r.ids, results: r.results, at: r.at };
  } catch (e) {
    reg = { state: "error", error: String((e && e.message) || e), at: Date.now() };
  }
  changed();
  return reg;
}

// ---------- IPC ----------
function fromOurWindow(e) {
  const url = e.senderFrame && e.senderFrame.url;
  return typeof url === "string" && url.startsWith("file:") && url.includes("/renderer/");
}

function handle(name, fn) {
  ipcMain.handle(name, (e, ...args) => (fromOurWindow(e) ? fn(e, ...args) : null));
}

function setupIpc() {
  handle("state", () => snapshot());
  handle("refresh", (_e, appId) => refresh(APP_IDS.includes(appId) ? appId : undefined));
  handle("settings", (_e, patch) => {
    if (!patch || typeof patch !== "object") return snapshot();
    const clean = {};
    const D = Store.DEFAULTS;
    for (const [k, v] of Object.entries(patch)) {
      if (!(k in D) || k === "onboarded" || k === "lastApp") continue;
      if (k === "mode" && !["follow", ...APP_IDS].includes(v)) continue;
      if (k === "show" && !["left", "used"].includes(v)) continue;
      if (k === "theme" && !["system", "light", "dark"].includes(v)) continue;
      if (k === "miniOpacity") { const n = Number(v); if (n >= 0.3 && n <= 1) clean[k] = n; continue; }
      if (k === "miniBounds") { if (v === null) clean[k] = null; continue; }
      if (k === "extensionIds") { if (Array.isArray(v)) clean[k] = [...new Set(v.map(String).filter((id) => registration.ID_RE.test(id)))].slice(0, 20); continue; }
      if (typeof D[k] === "boolean") { clean[k] = !!v; continue; }
      clean[k] = v;
    }
    setSettings(clean);
    return snapshot();
  });
  handle("resize", (e, height) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    const h = Math.max(60, Math.min(900, Math.round(Number(height) || 0)));
    if (!win || win === settingsWin || !h) return;
    const [w, cur] = win.getContentSize();
    if (cur === h) return;
    if (win === mini) {
      // Grow or shrink from the bottom edge when docked near the bottom of the screen.
      const [x, y] = win.getPosition();
      const area = screen.getDisplayMatching(win.getBounds()).workArea;
      const nearBottom = y + cur > area.y + area.height - 40;
      win.setContentSize(w, h);
      if (nearBottom) win.setPosition(x, Math.max(area.y, y + cur - h));
    } else {
      win.setContentSize(w, h);
      if (win === popup) placePopup(false);
    }
  });
  handle("open-settings", () => { if (popup && !popup.isDestroyed()) popup.hide(); openSettings(); });
  handle("hide", (e) => { const w = BrowserWindow.fromWebContents(e.sender); if (w && w !== settingsWin) w.hide(); });
  handle("connect-browsers", () => connectBrowsers());
  handle("mini-menu", () => {
    if (!mini || mini.isDestroyed()) return;
    Menu.buildFromTemplate([
      ...modeItems(),
      { type: "separator" },
      { label: "Keep on top", type: "checkbox", checked: s().miniOnTop, click: (i) => setSettings({ miniOnTop: i.checked }) },
      { label: "Only while Claude, ChatGPT or Codex is in front", type: "checkbox", checked: s().miniOnlyWithApp, click: (i) => setSettings({ miniOnlyWithApp: i.checked }) },
      { label: "Hide mini panel", click: () => setSettings({ miniPanel: false }) },
      { type: "separator" },
      { label: "Refresh", click: () => refresh() },
      { label: "Settings…", click: () => openSettings() },
    ]).popup({ window: mini });
  });
}

// ---------- start ----------
app.on("second-instance", () => showPopup());
app.on("window-all-closed", () => {}); // keep running in the tray when windows close
app.on("before-quit", () => { quitting = true; if (bridge) bridge.stop(); });

app.whenReady().then(async () => {
  if (process.platform === "win32") app.setAppUserModelId("fr.alencar.usage-meter-companion");
  store = Store.create(app.getPath("userData"));
  followApp = APP_IDS.includes(s().lastApp) ? s().lastApp : "claude";
  nativeTheme.themeSource = ["light", "dark"].includes(s().theme) ? s().theme : "system";
  nativeTheme.on("updated", () => changed());

  bridge = new Bridge();
  bridge.on("message", onBridgeMessage);
  bridge.on("hosts", () => changed());
  try { await bridge.start(); } catch (e) { console.error("pipe:", e.message); }

  setupIpc();
  tray = new Tray(trayImage(UsageView.build(currentApp(), store.usage[siteOf(currentApp())])));
  tray.on("click", () => togglePopup());
  updateTray();
  updateMini();
  startForeground();

  // Re-register on every start: it is quick, and keeps the host path right after updates or moves.
  await connectBrowsers();
  if (!s().onboarded) { store.set({ onboarded: true }); if (!process.argv.includes("--hidden")) openSettings(); }

  // Keep "Updated … ago" and reset countdowns current in the tooltip.
  setInterval(() => updateTray(), 30 * 1000);
});
