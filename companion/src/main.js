// Usage Meter Companion: a tray icon and always-on-top mini panels that show
// Claude or ChatGPT / Codex usage. The panel is the extension's own (content.js, in its embedded
// mode), drawn with your extension settings. Usage and settings arrive from the browser extension
// through native messaging (see host.js and bridge.js). The panel follows the app in front, or a
// fixed app chosen in Settings.
"use strict";
const path = require("path");
const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, nativeTheme, screen, shell } = require("electron");

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
const DEFAULT_WIDTH = 300; // the extension's default floating width
const LINK_HOSTS = ["https://claude.ai/", "https://chatgpt.com/"];
const GAP = 8; // between the two cards when both are shown

let store, bridge, tray;
let settingsWin = null;
let forceShow = false; // the tray asked to show the panels; see showMinis
// Mini panels by key: "main" (one app, or both cards in one window), or "claude" and "chatgpt"
// (separate cards). Each: { key, view, win }.
const minis = new Map();
const loadedWith = new WeakMap(); // window -> settings version and theme it was drawn with
let followApp = "claude"; // last matching app seen in front
let frontMatched = false; // a matching app is in front right now
let foregroundTimer = null;
let reg = { state: "idle" }; // last browser registration result
let quitting = false;
const prefsVersion = { claude: 0, chatgpt: 0 }; // bumps when the extension's panel settings change

const s = () => store.settings;
const currentApp = () => (s().mode === "follow" ? followApp : APP_IDS.includes(s().mode) ? s().mode : "claude");
// What the single mini panel shows: one app, or "both" (Claude and ChatGPT cards in one window).
const currentView = () => (s().cards === "one" ? currentApp() : "both");
const miniWins = () => [...minis.values()].map((m) => m.win).filter((w) => w && !w.isDestroyed());
const entryOf = (win) => [...minis.values()].find((m) => m.win === win) || null;
// Separate cards each have their own pin; otherwise one setting covers the mini panel.
const pinFor = (key) => (key !== "main" && s().cardOnTop && typeof s().cardOnTop[key] === "boolean" ? s().cardOnTop[key] : !!s().miniOnTop);
// "On top of its app" (attachToApp) puts each pinned card just above its app's window instead, and
// an unpinned card is then an ordinary window. The tray's "Show usage" floats them above everything
// until one of the apps next comes to the front.
const attached = () => !!s().attachToApp && foreground.available() && !forceShow;
const cardAttached = (m) => attached() && pinFor(m.key);
const onTopFor = (key) => (attached() ? false : pinFor(key));
const siteOf = (id) => UsageView.APPS[id].site;
const extOf = (site) => store.ext[site] || {};
const showLeft = (site) => extOf(site).showRemainingPlan !== false;

// The width you gave the panel in the browser (its floating width).
function panelWidth(site) {
  const w = Number(extOf(site).size && extOf(site).size.width);
  return Math.round(Math.max(240, Math.min(560, w || DEFAULT_WIDTH)));
}

// The look the cards are drawn with: the extension's (live), or the companion's own.
const ownLook = () => s().lookSource === "own";
function lookOf(site) {
  return ownLook() && store.own[site] ? store.own[site] : store.ext[site];
}

function snapshot() {
  return {
    settings: s(),
    sites: store.usage,
    ext: store.ext,
    look: { claude: lookOf("claude"), chatgpt: lookOf("chatgpt") },
    local: store.local,
    prefsVersion,
    app: currentApp(),
    // The pin's state: on top of everything, or of its own app with "On top of its app only".
    onTop: { main: pinFor("main"), claude: pinFor("claude"), chatgpt: pinFor("chatgpt") },
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
    for (const w of [settingsWin, ...miniWins(), ...editors.values()]) if (w && !w.isDestroyed()) w.webContents.send("state", snap);
    updateTray();
    updateMinis();
  });
}

function onBridgeMessage(msg, host) {
  const site = msg.site;
  if (site !== "claude" && site !== "chatgpt") return;
  if (msg.type === "settings") {
    if (!msg.settings || typeof msg.settings !== "object") return;
    // With the companion's own look, the browser's changes don't redraw the cards.
    if (store.setExt(site, msg.settings)) { if (!ownLook() || !store.own[site]) prefsVersion[site]++; changed(); }
    return;
  }
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
  return { asked: bridge.refresh(appId ? siteOf(appId) : undefined) };
}

// ---------- foreground app ----------
function pollForeground() {
  const win = foreground.get();
  if (!win) return;
  const m = matchApp(win, { browsers: s().followBrowsers, terminals: s().followTerminals, selfExe: process.execPath });
  if (m === "self") return; // our own panels: keep what we show
  let dirty = false;
  if (m && m !== followApp) { followApp = m; store.set({ lastApp: m }); dirty = s().mode === "follow"; }
  // "Show usage" lasts until you next switch to one of the apps.
  if (forceShow && m && (!frontMatched || win.title !== lastFrontTitle)) {
    forceShow = false;
    if (s().attachToApp) for (const e of minis.values()) applyTopmost(e);
    dirty = true;
  }
  lastFrontTitle = win.title;
  // A card that stepped aside comes back once you switch away from its app.
  for (const e of minis.values()) if (e.peek && !(m && e.peekApps.includes(m))) endPeek(e);
  if (!!m !== frontMatched) { frontMatched = !!m; dirty = true; }
  if (dirty) changed();
}
let lastFrontTitle = "";

// ---------- cards attached to their app ----------
// Which apps a card sits on: its own with separate cards (ChatGPT's also covers Codex), otherwise
// the app the panel shows.
function appsFor(m) {
  if (m.key === "claude") return ["claude"];
  if (m.key === "chatgpt") return ["chatgpt", "codex"];
  const id = currentApp();
  return id === "chatgpt" || id === "codex" ? ["chatgpt", "codex"] : [id];
}

// Puts each card just above the highest window of its app, and hides it while that app has no
// window on screen (closed or minimized). Runs often, since clicking the app raises it over the card.
let attachTimer = null;
function attachTick() {
  if (![...minis.values()].some(cardAttached)) { clearInterval(attachTimer); attachTimer = null; return; }
  if (!attachTimer) attachTimer = setInterval(attachTick, 150);
  const opts = { browsers: s().followBrowsers, terminals: s().followTerminals, selfExe: process.execPath };
  const wins = foreground.listWindows().map((w) => ({ ...w, app: matchApp(w, opts) }));
  for (const m of minis.values()) {
    const win = m.win;
    if (!win || win.isDestroyed() || !m.ready || m.peek || !cardAttached(m)) continue;
    const apps = appsFor(m);
    const target = wins.find((w) => apps.includes(w.app));
    if (!target || target.minimized) { if (win.isVisible() && !drags.has(win)) win.hide(); m.target = null; continue; }
    m.target = target.hwnd;
    if (s().attachMove && !drags.has(win) && !widths.has(win)) followTarget(m, target.hwnd);
    if (!win.isVisible()) { if (!s().attachMove) keepOnScreen(win); win.showInactive(); pollHover(); }
    foreground.placeAbove(win.getNativeWindowHandle(), target.hwnd);
  }
}

// ---------- getting out of the app's way ----------
// The apps draw their menus (your name in Claude, your picture in ChatGPT) inside their own window,
// where the companion can't see them. So a click in a card's app close to the card makes the card
// fade and let clicks through ("peek"). It stays that way while the pointer is in that area (the
// menu, its items, a dialog there) and comes back PEEK_BACK_MS after the pointer leaves it, or when
// you switch to another app. Clicks on the card itself don't count.
const PEEK_NEAR_X = 40, PEEK_NEAR_Y = 250, PEEK_BACK_MS = 1500; // physical pixels; ms
const FADED_OPACITY = 0.12;
let clickTimer = null, wasDown = false;
const normalOpacity = () => Math.max(0.3, Math.min(1, Number(s().miniOpacity) || 1));
const inRect = (p, r, mx = 0, my = 0) => p.x >= r.x - mx && p.x < r.x + r.w + mx && p.y >= r.y - my && p.y < r.y + r.h + my;

function clickTick() {
  const active = [...minis.values()].filter((m) => m.win && !m.win.isDestroyed() && (m.win.isVisible() || m.peek));
  if (!active.length || !foreground.available()) { clearInterval(clickTimer); clickTimer = null; return; }
  if (!clickTimer) clickTimer = setInterval(clickTick, 30);
  const p = foreground.pointer();
  if (!p) return;
  const down = p.button && !wasDown;
  wasDown = p.button;
  const now = Date.now();

  for (const m of active) {
    if (!m.peek) continue;
    // Back once the pointer has been away from the area for a moment.
    if (inRect(p, m.peekZone)) m.peekOut = 0;
    else if (!m.peekOut) m.peekOut = now;
    else if (now - m.peekOut > PEEK_BACK_MS) endPeek(m);
  }

  if (!down) return;
  const app = matchApp({ exe: p.exe, title: p.title }, { browsers: s().followBrowsers, terminals: s().followTerminals, selfExe: process.execPath });
  if (!app || app === "self") return;
  for (const m of active) {
    if (m.peek || !m.win.isVisible() || !appsFor(m).includes(app)) continue;
    const c = foreground.rectOf(m.win.getNativeWindowHandle(), true);
    if (c && inRect(p, c, PEEK_NEAR_X, PEEK_NEAR_Y)) startPeek(m, c);
  }
}

function setFaded(m, fade) {
  if (!!m.faded === fade) return;
  m.faded = fade;
  m.win.setOpacity(fade ? FADED_OPACITY : normalOpacity());
  m.win.setIgnoreMouseEvents(fade); // clicks go to the app underneath
}

function startPeek(m, c) {
  m.peek = true;
  m.peekApps = appsFor(m);
  m.peekZone = { x: c.x - PEEK_NEAR_X, y: c.y - PEEK_NEAR_Y, w: c.w + 2 * PEEK_NEAR_X, h: c.h + 2 * PEEK_NEAR_Y };
  m.peekOut = 0;
  stopDrag(m.win);
  setFaded(m, true);
}
function endPeek(m) {
  if (!m.peek) return;
  m.peek = false;
  if (m.win && !m.win.isDestroyed()) setFaded(m, false);
  updateMinis();
}

// "Move with its app": the card keeps its offset from the nearest corner of its app's window, so it
// follows when the window moves or is resized. Rectangles are in physical pixels.
function cornerOffset(t, c) {
  const right = c.x + c.w / 2 > t.x + t.w / 2, bottom = c.y + c.h / 2 > t.y + t.h / 2;
  return { right, bottom, dx: right ? c.x + c.w - (t.x + t.w) : c.x - t.x, dy: bottom ? c.y + c.h - (t.y + t.h) : c.y - t.y };
}
function fromOffset(t, c, o) {
  return { x: o.right ? t.x + t.w + o.dx - c.w : t.x + o.dx, y: o.bottom ? t.y + t.h + o.dy - c.h : t.y + o.dy };
}
function saveOffset(m) {
  const t = m.target && foreground.rectOf(m.target, true), c = foreground.rectOf(m.win.getNativeWindowHandle(), true);
  if (t && c) setSettings({ attachOffsets: { ...(s().attachOffsets || {}), [m.key]: cornerOffset(t, c) } }, true);
}
function followTarget(m, target) {
  const handle = m.win.getNativeWindowHandle();
  const t = foreground.rectOf(target, true), c = foreground.rectOf(handle, true);
  if (!t || !c) return;
  const o = (s().attachOffsets || {})[m.key];
  if (!o) { saveOffset(m); return; } // first time: where it is now
  const p = fromOffset(t, c, o);
  if (Math.abs(p.x - c.x) > 1 || Math.abs(p.y - c.y) > 1) foreground.moveTo(handle, p.x, p.y);
}

function startForeground() {
  clearInterval(foregroundTimer);
  if (foreground.available()) foregroundTimer = setInterval(pollForeground, 700);
}

// ---------- tray ----------
function trayImage(view, show) {
  const frac = trayFraction(view, show);
  const color = trayColor(view, show);
  const img = nativeImage.createFromBitmap(ringBitmap(16, frac, color), { width: 16, height: 16, scaleFactor: 1 });
  for (const [scale, size] of [[1.25, 20], [1.5, 24], [2, 32]]) {
    img.addRepresentation({ scaleFactor: scale, width: size, height: size, buffer: ringBitmap(size, frac, color) });
  }
  return img;
}

// With separate cards there is one tray icon per card (Claude, then ChatGPT); otherwise one icon
// for what the panel shows.
let tray2 = null; // the ChatGPT card's icon, only with separate cards
const lastTrayKey = new WeakMap();
function setTrayIcon(t, id, tip) {
  const site = siteOf(id);
  const show = showLeft(site) ? "left" : "used";
  const view = UsageView.build(id, store.usage[site]);
  const key = `${id}|${view.head ? Math.round(view.head.left) : "-"}|${show}`;
  if (lastTrayKey.get(t) !== key) { t.setImage(trayImage(view, show)); lastTrayKey.set(t, key); }
  t.setToolTip((tip || UsageView.tooltip(view, { show })).slice(0, 127));
  t.setContextMenu(trayMenu());
}

function updateTray() {
  if (!tray) return;
  if (s().cards === "separate" && s().miniPanel) {
    const gpt = followApp === "codex" ? "codex" : "chatgpt";
    setTrayIcon(tray, "claude");
    if (!tray2 || tray2.isDestroyed()) { tray2 = new Tray(trayImage(UsageView.build(gpt, store.usage.chatgpt), "left")); tray2.on("click", () => showMinis("chatgpt")); }
    setTrayIcon(tray2, gpt);
    return;
  }
  if (tray2 && !tray2.isDestroyed()) tray2.destroy();
  tray2 = null;
  const id = currentApp();
  let tip = null;
  if (s().cards !== "one") {
    const other = id === "claude" ? "chatgpt" : "claude";
    const show = (x) => (showLeft(siteOf(x)) ? "left" : "used");
    tip = `${UsageView.tooltip(UsageView.build(id, store.usage[siteOf(id)]), { show: show(id) })}\n${UsageView.tooltip(UsageView.build(other, store.usage[other]), { show: show(other) })}`;
  }
  setTrayIcon(tray, id, tip);
}

function cardItems() {
  return [
    { label: "Show one app", type: "radio", checked: s().cards === "one", click: () => setSettings({ cards: "one" }) },
    { label: "Show Claude and ChatGPT", type: "radio", checked: s().cards === "both", click: () => setSettings({ cards: "both" }) },
    { label: "Separate cards (Claude and ChatGPT)", type: "radio", checked: s().cards === "separate", click: () => setSettings({ cards: "separate" }) },
  ];
}

function modeItems() {
  return [
    { label: "Follow the app in front", type: "radio", checked: s().mode === "follow", click: () => setSettings({ mode: "follow" }) },
    ...APP_IDS.map((id) => ({ label: `Always ${APP_LABELS[id]}`, type: "radio", checked: s().mode === id, click: () => setSettings({ mode: id }) })),
  ];
}

function trayMenu() {
  return Menu.buildFromTemplate([
    { label: "Show usage", click: () => showMinis() },
    { label: "Mini panel", type: "checkbox", checked: s().miniPanel, click: (i) => setSettings({ miniPanel: i.checked }) },
    { label: "Keep mini panel on top", type: "checkbox", checked: s().miniOnTop && !s().attachToApp, enabled: s().miniPanel, click: (i) => setSettings({ miniOnTop: i.checked, cardOnTop: {}, attachToApp: false }) },
    attachItem(),
    moveItem(),
    { type: "separator" },
    ...cardItems(),
    { type: "separator" },
    ...modeItems(),
    { type: "separator" },
    { label: "Refresh", click: () => refresh() },
    { label: "Settings…", click: () => openSettings() },
    { type: "separator" },
    { label: "Quit Usage Meter Companion", click: () => { quitting = true; app.quit(); } },
  ]);
}

// key: which mini panel was right-clicked.
function miniMenu(key) {
  const m = minis.get(key) || minis.values().next().value;
  if (!m || !m.win || m.win.isDestroyed()) return;
  Menu.buildFromTemplate([
    { label: s().attachToApp ? "Keep on top of its app" : "Keep on top", type: "checkbox", checked: pinFor(m.key), click: () => togglePin(m.key) },
    attachItem(),
    moveItem(),
    { label: "Only while Claude, ChatGPT or Codex is in front", type: "checkbox", checked: s().miniOnlyWithApp, enabled: !s().attachToApp, click: (i) => setSettings({ miniOnlyWithApp: i.checked }) },
    { type: "separator" },
    ...cardItems(),
    { label: "Side by side", type: "checkbox", checked: s().cardsLayout === "row", enabled: s().cards === "both", click: (i) => setSettings({ cardsLayout: i.checked ? "row" : "column" }) },
    { type: "separator" },
    ...modeItems(),
    { type: "separator" },
    { label: "Refresh", click: () => refresh() },
    { label: "Reset width", enabled: !!(s().cardWidths || {})[m.key] && m.view !== "both", click: () => resetWidth(m.key) },
    { label: `Customize look${m.view === "both" ? " (Claude)" : ""}…`, click: () => openEditor(m.view === "both" ? "claude" : m.view) },
    ...(m.view === "both" ? [{ label: "Customize look (ChatGPT)…", click: () => openEditor("chatgpt") }] : []),
    { label: "Settings…", click: () => openSettings() },
    { label: "Hide mini panel", click: () => setSettings({ miniPanel: false }) },
  ]).popup({ window: m.win });
}

function attachItem() {
  return { label: "On top of its app only", type: "checkbox", checked: !!s().attachToApp, enabled: s().miniPanel && foreground.available(), click: (i) => setSettings({ attachToApp: i.checked }) };
}
function moveItem() {
  return { label: "Move with its app", type: "checkbox", checked: !!s().attachToApp && !!s().attachMove, enabled: s().miniPanel && !!s().attachToApp, click: (i) => setSettings({ attachMove: i.checked }) };
}

// The pin turns "on top" on or off for that card: on top of everything, or of its own app with
// "On top of its app only".
function togglePin(key) {
  if (key !== "main" && s().cards === "separate") setSettings({ cardOnTop: { ...(s().cardOnTop || {}), [key]: !pinFor(key) } });
  else setSettings({ miniOnTop: !s().miniOnTop, cardOnTop: {} });
}

// ---------- windows ----------
function guard(win) {
  // Pages never navigate away; links go to your browser (see the open-url handler).
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (e) => e.preventDefault());
  return win;
}

function panelWindow(extra) {
  return guard(new BrowserWindow({
    show: false,
    frame: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    // The preload also runs in subframes: with both cards shown, each card is its own frame.
    webPreferences: { preload: PRELOAD, contextIsolation: true, sandbox: true, nodeIntegration: false, nodeIntegrationInSubFrames: true, spellcheck: false },
    ...extra,
  }));
}

function panelKey(view) {
  const v = view === "both" ? `both|${s().cardsLayout}|${prefsVersion.claude}|${prefsVersion.chatgpt}` : `${view}|${prefsVersion[siteOf(view)]}`;
  return `${v}|${nativeTheme.shouldUseDarkColors}`;
}

function viewWidth(view) {
  if (view !== "both") return panelWidth(siteOf(view));
  const a = panelWidth("claude"), b = panelWidth("chatgpt");
  return s().cardsLayout === "row" ? a + b + GAP : Math.max(a, b);
}

// A mini panel's width: the one you gave it by dragging its edge, else the browser panel's.
// (Two cards in one panel always use the browser widths.)
const MIN_WIDTH = 240, MAX_WIDTH = 720;
function widthFor(key, view) {
  const m = minis.get(key);
  if (m && m.liveWidth) return m.liveWidth;
  const w = view !== "both" && (s().cardWidths || {})[key];
  return w ? Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, Math.round(w))) : viewWidth(view);
}

function loadPanel(win, view, key) {
  loadedWith.set(win, panelKey(view));
  win.setContentSize(widthFor(key || "main", view), win.getContentSize()[1]);
  if (view === "both") {
    const row = s().cardsLayout === "row";
    win.loadFile(path.join(RENDERER, "both.html"), { query: { key: key || "main", layout: row ? "row" : "column", gap: String(GAP), w1: String(row ? panelWidth("claude") : viewWidth("both")), w2: String(row ? panelWidth("chatgpt") : viewWidth("both")) } });
  } else {
    win.loadFile(path.join(RENDERER, "panel.html"), { query: { app: view, key: key || "main" } });
  }
}

// Bottom-right corner; with separate cards the ChatGPT card starts to the left of the Claude card.
function defaultMiniBounds(key, w, h) {
  const area = screen.getPrimaryDisplay().workArea;
  const x = area.x + area.width - w - 16 - (key === "chatgpt" ? viewWidth("claude") + 12 : 0);
  return { x, y: area.y + area.height - h - 16 };
}

function savedBounds(key) {
  return key === "main" ? s().miniBounds : (s().miniBoundsByApp || {})[key];
}

function saveBounds(key, b) {
  if (key === "main") setSettings({ miniBounds: b }, true);
  else setSettings({ miniBoundsByApp: { ...(s().miniBoundsByApp || {}), [key]: b } }, true);
}

function onScreen(b) {
  return screen.getAllDisplays().some((d) => {
    const a = d.workArea;
    return b.x + 40 > a.x && b.x < a.x + a.width - 40 && b.y >= a.y - 10 && b.y < a.y + a.height - 30;
  });
}

// Which mini panels should exist; minisVisible() says whether they show right now.
const minisVisible = () => forceShow || !s().miniOnlyWithApp || frontMatched;
function wantedMinis() {
  if (!s().miniPanel) return [];
  if (s().cards === "separate") return [{ key: "claude", view: "claude" }, { key: "chatgpt", view: "chatgpt" }];
  return [{ key: "main", view: currentView() }];
}

function createMini(key, view) {
  const width = widthFor(key, view);
  // Transparent, so the panel's own rounded frame (and hover-only frame) shows as in the browser.
  // It stays focusable (focusable: false stops it being dragged); see applyTopmost for why focus matters.
  const win = panelWindow({ width, height: 120, transparent: true, backgroundColor: "#00000000", hasShadow: false, alwaysOnTop: onTopFor(key) });
  const m = { key, view, win, ready: false };
  minis.set(key, m);
  const saved = savedBounds(key);
  const pos = saved && onScreen(saved) ? saved : defaultMiniBounds(key, width, 120);
  win.setPosition(Math.round(pos.x), Math.round(pos.y));
  // Electron drops WS_EX_TOPMOST when the panel is activated (clicked), so set it again.
  win.on("focus", () => applyTopmost(m));
  win.on("blur", () => applyTopmost(m));
  win.on("system-context-menu", (e) => e.preventDefault()); // no Windows window menu
  win.on("closed", () => { if (minis.get(key) === m) minis.delete(key); stopDrag(win); });
  win.webContents.on("did-start-loading", () => { m.ready = false; });
  win.webContents.on("did-finish-load", () => { m.ready = true; hoverSent.delete(win); updateMinis(); });
  loadPanel(win, view, key);
}

// Keeps a mini panel above other windows (or not). Electron's setAlwaysOnTop doesn't reliably set
// WS_EX_TOPMOST on this transparent window, so it is also set with SetWindowPos.
function applyTopmost(m) {
  if (!m || !m.win || m.win.isDestroyed() || !m.win.isVisible()) return;
  const on = onTopFor(m.key);
  m.win.setAlwaysOnTop(on, "floating");
  if (process.platform === "win32") foreground.setTopmost(m.win.getNativeWindowHandle(), on);
}

// Tray click and "Show usage": turn the mini panel on if it's off, show it if "only while … in
// front" hid it (until a matching app next comes to the front), and bring it above other windows.
// only: with separate cards, the card whose tray icon was clicked.
function showMinis(only) {
  forceShow = true;
  for (const m of minis.values()) endPeek(m);
  if (!s().miniPanel) { setSettings({ miniPanel: true }); return; } // created and shown once loaded
  updateMinis();
  for (const m of minis.values()) {
    if (m.win.isDestroyed() || !m.ready || (only && minis.has(only) && m.key !== only)) continue;
    if (!m.win.isVisible()) { keepOnScreen(m.win); m.win.showInactive(); }
    m.win.moveTop();
    applyTopmost(m);
  }
}

function updateMinis() {
  const wanted = wantedMinis();
  const keys = new Set(wanted.map((w) => w.key));
  for (const [key, m] of minis) if (!keys.has(key)) { minis.delete(key); if (!m.win.isDestroyed()) m.win.destroy(); }
  for (const want of wanted) {
    const m = minis.get(want.key);
    if (!m) { createMini(want.key, want.view); continue; }
    const win = m.win;
    if (win.isDestroyed()) continue;
    // Redraw when it should show another view, or its settings or the Windows theme changed.
    if (m.view !== want.view || loadedWith.get(win) !== panelKey(want.view)) { m.view = want.view; loadPanel(win, want.view, m.key); }
    if (!m.faded) win.setOpacity(normalOpacity());
    if (m.peek) continue; // stepped aside for the app's menu; see clickTick
    if (cardAttached(m)) continue; // attachTick shows, hides and places it
    // Unpinned while "On top of its app only" is on: an ordinary window, always shown.
    if (!minisVisible() && !attached()) { if (win.isVisible()) { stopDrag(win); win.hide(); } }
    else if (!win.isVisible() && m.ready) { keepOnScreen(win); win.showInactive(); applyTopmost(m); }
  }
  attachTick();
  pollHover();
  clickTick();
}

// Moves a mini panel back inside the work area of its display (above the taskbar) without
// resizing it. Not while it's being dragged.
function keepOnScreen(win) {
  if (!win || win.isDestroyed() || drags.has(win)) return;
  const b = win.getBounds();
  const a = screen.getDisplayMatching(b).workArea;
  const x = Math.max(a.x, Math.min(b.x, a.x + a.width - b.width));
  const y = Math.max(a.y, Math.min(b.y, a.y + a.height - b.height));
  if (x !== b.x || y !== b.y) win.setPosition(x, y);
}

// ---------- hover ----------
// A frameless transparent window doesn't report the pointer leaving it reliably, so the companion
// tracks whether the cursor is over each panel window and tells the page (it sets .js-hover).
const hoverSent = new WeakMap();
let hoverTimer = null;
function pollHover() {
  const wins = miniWins().filter((w) => w.isVisible());
  if (!wins.length) { clearInterval(hoverTimer); hoverTimer = null; return; }
  if (!hoverTimer) hoverTimer = setInterval(pollHover, 120);
  const p = screen.getCursorScreenPoint();
  for (const w of wins) {
    const b = w.getBounds();
    const inside = p.x >= b.x && p.x < b.x + b.width && p.y >= b.y && p.y < b.y + b.height;
    if (hoverSent.get(w) !== inside && !w.webContents.isLoading()) { hoverSent.set(w, inside); w.webContents.send("hover", inside); }
  }
}

// ---------- dragging ----------
// The page asks to move the window while a mouse button is held on a non-interactive part of the
// card. (Drag areas would block wheel scrolling, right-click and hover, and don't work in frames.)
const drags = new Map(); // window -> { cx, cy, x, y, started }
let dragTimer = null;
function startDrag(win) {
  if (!win || win.isDestroyed() || !entryOf(win)) return;
  const c = screen.getCursorScreenPoint();
  const [x, y] = win.getPosition();
  drags.set(win, { cx: c.x, cy: c.y, x, y, started: Date.now() });
  if (!dragTimer) dragTimer = setInterval(moveDrags, 10);
}
function moveDrags() {
  const c = screen.getCursorScreenPoint();
  for (const [win, d] of drags) {
    if (win.isDestroyed() || Date.now() - d.started > 120000) { stopDrag(win); continue; }
    const nx = d.x + c.x - d.cx, ny = d.y + c.y - d.cy;
    const [x, y] = win.getPosition();
    if (nx !== x || ny !== y) win.setPosition(nx, ny);
  }
}
function stopDrag(win) {
  const d = drags.get(win);
  drags.delete(win);
  if (!drags.size) { clearInterval(dragTimer); dragTimer = null; }
  const m = d && !win.isDestroyed() ? entryOf(win) : null;
  if (m) {
    const [x, y] = win.getPosition();
    if (x !== d.x || y !== d.y) { saveBounds(m.key, { x, y }); if (attached() && s().attachMove && m.target) saveOffset(m); }
  }
}

// ---------- the companion's own look ----------
// Copies the browser's current look for both sites into the companion's own look.
function importLook() {
  for (const site of ["claude", "chatgpt"]) if (store.ext[site]) store.setOwn(site, store.ext[site]);
  bumpLooks();
}
// Back to the browser's look, live; the own look is cleared.
function resetLook() {
  for (const site of ["claude", "chatgpt"]) store.setOwn(site, null);
  setSettings({ lookSource: "browser" }, true);
  bumpLooks();
}
function bumpLooks() {
  prefsVersion.claude++; prefsVersion.chatgpt++;
  changed();
}

// The editor: a larger window with one site's card and the extension's Customize panel. Its
// changes are saved as the companion's own look (switching to it, from the browser's look, first).
const editors = new Map(); // site -> window
function openEditor(appId) {
  const site = siteOf(appId);
  if (!ownLook()) { if (!store.own.claude && !store.own.chatgpt) importLook(); setSettings({ lookSource: "own" }, true); bumpLooks(); }
  const open = editors.get(site);
  if (open && !open.isDestroyed()) { open.show(); open.focus(); return; }
  const win = guard(new BrowserWindow({
    width: 760, height: 720, minWidth: 700, minHeight: 480, title: `Customize the ${APP_LABELS[site]} card`,
    autoHideMenuBar: true, show: false,
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#202020" : "#ffffff",
    webPreferences: { preload: PRELOAD, contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false },
  }));
  win.setMenu(null);
  win.on("page-title-updated", (e) => e.preventDefault()); // keep "Customize the … card"
  editors.set(site, win);
  win.loadFile(path.join(RENDERER, "panel.html"), { query: { app: site, key: "editor", edit: "1" } });
  win.once("ready-to-show", () => win.show());
  win.on("closed", () => { if (editors.get(site) === win) editors.delete(site); });
}
// What the editor's Customize panel saves.
function saveLook(site, value) {
  if (!ownLook() || (site !== "claude" && site !== "chatgpt") || !value || typeof value !== "object") return;
  if (store.setOwn(site, value)) { prefsVersion[site]++; changed(); }
}

// ---------- resizing (width) ----------
// The page asks for this when a mouse button is held on a card's left or right edge. The card's
// width follows the pointer (the left edge keeps the right side in place) and is saved per card.
const widths = new Map(); // window -> { edge, cx, x, w, started }
let widthTimer = null;
function startWidth(win, edge) {
  const m = win && !win.isDestroyed() ? entryOf(win) : null;
  if (!m || m.view === "both") return;
  const b = win.getBounds();
  widths.set(win, { edge, cx: screen.getCursorScreenPoint().x, x: b.x, w: win.getContentSize()[0], started: Date.now() });
  if (!widthTimer) widthTimer = setInterval(moveWidths, 10);
}
function moveWidths() {
  const cx = screen.getCursorScreenPoint().x;
  for (const [win, d] of widths) {
    const m = entryOf(win);
    if (win.isDestroyed() || !m || Date.now() - d.started > 120000) { stopWidth(win); continue; }
    const dx = cx - d.cx;
    const w = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, Math.round(d.edge === "left" ? d.w - dx : d.w + dx)));
    if (w === m.liveWidth) continue;
    m.liveWidth = w;
    const [, h] = win.getContentSize();
    const [, y] = win.getPosition();
    win.setContentSize(w, h);
    if (d.edge === "left") win.setPosition(d.x + d.w - w, y);
  }
}
function stopWidth(win) {
  const d = widths.get(win);
  widths.delete(win);
  if (!widths.size) { clearInterval(widthTimer); widthTimer = null; }
  const m = d && win && !win.isDestroyed() ? entryOf(win) : null;
  if (!m || !m.liveWidth) return;
  const w = m.liveWidth;
  m.liveWidth = null;
  store.set({ cardWidths: { ...(s().cardWidths || {}), [m.key]: w } });
  const [x, y] = win.getPosition();
  saveBounds(m.key, { x, y });
  if (attached() && s().attachMove && m.target) saveOffset(m);
}
// Back to the browser panel's width.
function resetWidth(key) {
  const cw = { ...(s().cardWidths || {}) };
  delete cw[key];
  setSettings({ cardWidths: cw }, true);
  const m = minis.get(key);
  if (m && !m.win.isDestroyed()) m.win.setContentSize(widthFor(key, m.view), m.win.getContentSize()[1]);
}

function openSettings() {
  if (settingsWin && !settingsWin.isDestroyed()) { settingsWin.show(); settingsWin.focus(); return; }
  settingsWin = guard(new BrowserWindow({
    width: 560, height: 680, minWidth: 460, minHeight: 480, title: "Usage Meter Companion settings",
    autoHideMenuBar: true, show: false,
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#202020" : "#ffffff",
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
  // The pin buttons, tray and right-click menus, and Settings all land here.
  if ("miniOnTop" in patch || "cardOnTop" in patch || "cards" in patch || "attachToApp" in patch) setImmediate(() => { for (const m of minis.values()) applyTopmost(m); });
  if ("cards" in patch) setImmediate(() => updateTray());
  // Moving with the app starts from where each card is now.
  if (patch.attachMove) store.set({ attachOffsets: {} });
  // Switching to the own look starts from the browser's look; either way the cards redraw.
  if ("lookSource" in patch && patch.lookSource !== before.lookSource) {
    if (patch.lookSource === "own" && !store.own.claude && !store.own.chatgpt) importLook();
    else bumpLooks();
  }
  if ("launchAtLogin" in patch && process.platform === "win32") app.setLoginItemSettings({ openAtLogin: !!s().launchAtLogin, args: ["--hidden"] });
  if ("miniBounds" in patch && patch.miniBounds === null) {
    store.set({ miniBoundsByApp: {}, attachOffsets: {} });
    for (const m of minis.values()) {
      if (m.win.isDestroyed()) continue;
      const [w, h] = m.win.getSize();
      const p = defaultMiniBounds(m.key, w, h);
      m.win.setPosition(p.x, p.y);
    }
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

function cleanSettings(patch) {
  const clean = {};
  const D = Store.DEFAULTS;
  for (const [k, v] of Object.entries(patch)) {
    if (!(k in D) || k === "onboarded" || k === "lastApp") continue;
    if (k === "mode" && !["follow", ...APP_IDS].includes(v)) continue;
    if (k === "cards") { if (["one", "both", "separate"].includes(v)) clean[k] = v; continue; }
    if (k === "lookSource") { if (["browser", "own"].includes(v)) clean[k] = v; continue; }
    if (k === "cardOnTop") { if (v && typeof v === "object") clean[k] = Object.fromEntries(["claude", "chatgpt"].filter((a) => typeof v[a] === "boolean").map((a) => [a, v[a]])); continue; }
    if (k === "miniBoundsByApp" || k === "attachOffsets" || k === "cardWidths") continue; // only the app sets these
    if (k === "cardsLayout") { if (["column", "row"].includes(v)) clean[k] = v; continue; }
    if (k === "miniOpacity") { const n = Number(v); if (n >= 0.3 && n <= 1) clean[k] = n; continue; }
    if (k === "miniBounds") { if (v === null) clean[k] = null; continue; }
    if (k === "extensionIds") { if (Array.isArray(v)) clean[k] = [...new Set(v.map(String).filter((id) => registration.ID_RE.test(id)))].slice(0, 20); continue; }
    if (typeof D[k] === "boolean") { clean[k] = !!v; continue; }
  }
  return clean;
}

function setupIpc() {
  handle("state", () => snapshot());
  handle("refresh", (_e, appId) => refresh(APP_IDS.includes(appId) ? appId : undefined));
  handle("settings", (_e, patch) => {
    if (patch && typeof patch === "object") setSettings(cleanSettings(patch));
    return snapshot();
  });
  handle("panel-state", (_e, site, patch) => {
    if ((site === "claude" || site === "chatgpt") && patch && typeof patch === "object") store.setLocal(site, patch);
  });
  handle("open-url", (_e, url) => {
    if (typeof url === "string" && LINK_HOSTS.some((h) => url.startsWith(h))) shell.openExternal(url);
  });
  handle("resize", (e, height) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    const h = Math.max(40, Math.min(1000, Math.round(Number(height) || 0)));
    if (!win || win === settingsWin || !h) return;
    // Use the intended width: reading it back from this transparent frameless window returns a
    // slightly larger value, and setting that again made the width grow on every resize.
    const m = entryOf(win);
    if (!m) return;
    const w = widthFor(m.key, m.view);
    const cur = win.getContentSize()[1];
    if (cur === h && Math.abs(win.getContentSize()[0] - w) <= 2) return;
    // Grow or shrink from the bottom edge when it sits near the bottom of the screen.
    const [x, y] = win.getPosition();
    const area = screen.getDisplayMatching(win.getBounds()).workArea;
    const nearBottom = !drags.has(win) && y + cur > area.y + area.height - 40; // not while being dragged
    win.setContentSize(w, h);
    if (nearBottom) win.setPosition(x, Math.max(area.y, y + cur - h));
    keepOnScreen(win); // a panel that grew past the bottom (or edge) of the screen moves back up
  });
  handle("connect-browsers", () => connectBrowsers());
  const keyOf = (e) => { const m = entryOf(BrowserWindow.fromWebContents(e.sender)); return m && m.key; };
  handle("mini-menu", (e) => { const k = keyOf(e); if (k) miniMenu(k); });
  handle("toggle-pin", (e) => { const k = keyOf(e); if (k) togglePin(k); });
  handle("drag-start", (e) => startDrag(BrowserWindow.fromWebContents(e.sender)));
  handle("drag-end", (e) => stopDrag(BrowserWindow.fromWebContents(e.sender)));
  handle("save-look", (e, site, value) => { if ([...editors.values()].includes(BrowserWindow.fromWebContents(e.sender))) saveLook(site, value); });
  handle("look-import", () => { importLook(); setSettings({ lookSource: "own" }); return snapshot(); });
  handle("look-reset", () => { resetLook(); return snapshot(); });
  handle("customize", (e, appId) => openEditor(APP_IDS.includes(appId) ? appId : currentApp()));
  handle("width-start", (e, edge) => startWidth(BrowserWindow.fromWebContents(e.sender), edge === "left" ? "left" : "right"));
  handle("width-end", (e) => stopWidth(BrowserWindow.fromWebContents(e.sender)));
}

// ---------- start ----------
app.on("second-instance", () => showMinis());
app.on("window-all-closed", () => {}); // keep running in the tray when windows close
app.on("before-quit", () => { quitting = true; if (bridge) bridge.stop(); });

app.whenReady().then(async () => {
  if (process.platform === "win32") app.setAppUserModelId("fr.alencar.usage-meter-companion");
  store = Store.create(app.getPath("userData"));
  followApp = APP_IDS.includes(s().lastApp) ? s().lastApp : "claude";
  nativeTheme.on("updated", () => changed());

  bridge = new Bridge();
  bridge.on("message", onBridgeMessage);
  bridge.on("hosts", () => changed());
  try { await bridge.start(); } catch (e) { console.error("pipe:", e.message); }

  setupIpc();
  tray = new Tray(trayImage(UsageView.build(currentApp(), store.usage[siteOf(currentApp())]), "left"));
  tray.on("click", () => showMinis(s().cards === "separate" ? "claude" : undefined));
  updateTray();
  updateMinis();
  startForeground();

  // Re-register on every start: it is quick, and keeps the host path right after updates or moves.
  await connectBrowsers();
  if (!s().onboarded) { store.set({ onboarded: true }); if (!process.argv.includes("--hidden")) openSettings(); }

  // Keep reset countdowns current in the tooltip.
  setInterval(() => updateTray(), 30 * 1000);
});
