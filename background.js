// Colors the toolbar icon for the site in each tab: green on ChatGPT, orange on Claude.
// Other tabs keep the default split icon. Chrome resets per-tab icons on navigation, and
// content.js reports its site again on every page load.
//
// Also feeds the Windows desktop companion (companion/ folder) through native messaging.
// That part stays idle unless the companion is installed: without its host, connecting fails
// quietly and is retried once a minute.
if (typeof importScripts === "function" && !globalThis.UsageMeterClaude) importScripts("claude-usage.js");

const api = globalThis.browser ?? chrome;
const icon = (site) => ({ 16: `icons/${site}-16.png`, 48: `icons/${site}-48.png`, 128: `icons/${site}-128.png` });
const ICONS = { chatgpt: icon("chatgpt"), claude: icon("claude") };
const TITLES = { chatgpt: "Usage Meter · ChatGPT", claude: "Usage Meter · Claude" };

api.runtime.onMessage.addListener((message, sender) => {
  if (message && message.type === "usage-meter-usage") return void companion.fromTab(message);
  const tabId = sender.tab && sender.tab.id;
  if (!message || message.type !== "usage-meter-site" || tabId == null || !ICONS[message.site]) return;
  try {
    api.action.setIcon({ tabId, path: ICONS[message.site] })?.catch?.(() => {});
    api.action.setTitle({ tabId, title: TITLES[message.site] })?.catch?.(() => {});
  } catch (_) { /* tab closed */ }
});

// ---------- desktop companion ----------
// Usage comes from open tabs first (content.js forwards every update). When a site has no recent
// tab update, this script fetches it itself with your existing browser login, so the companion
// keeps working with only the browser running. Nothing is sent anywhere except to the companion
// on this computer; the only web requests go to claude.ai and chatgpt.com.
const companion = (() => {
  const HOST = "fr.alencar.usage_meter";
  const ALARM = "usage-meter-companion";
  const STALE_MS = 150 * 1000; // fetch a site ourselves when no tab updated it for 2.5 minutes
  const MIN_GAP_MS = 10 * 1000; // never fetch one site more often than this
  const ERROR_BACKOFF_MS = 10 * 60 * 1000; // after other errors (site down, unexpected answer)
  const SIGNIN_RETRY_MS = 2 * 60 * 1000; // after "signed out": picks up again soon after you sign in
  const SITES = ["claude", "chatgpt"];
  const SETTINGS_KEYS = { claude: "gptu-claude", chatgpt: "gptu" }; // content.js storage keys

  let port = null;
  let companionUp = false; // the host reports whether the companion app is running
  const latest = {}; // site -> { data, plan, at, source }
  const lastFetch = {}; // site -> ms
  const backoffUntil = {}; // site -> ms
  const inFlight = {};

  const version = (() => { try { return api.runtime.getManifest().version; } catch (_) { return null; } })();
  const browserName = (() => {
    const ua = globalThis.navigator?.userAgent || "";
    if (/Firefox\//.test(ua)) return "Firefox";
    if (/Edg\//.test(ua)) return "Edge";
    if (globalThis.navigator?.brave) return "Brave";
    if (/OPR\//.test(ua)) return "Opera";
    if (/Vivaldi\//.test(ua)) return "Vivaldi";
    return "Chrome";
  })();

  function send(message) {
    if (!port) return;
    try { port.postMessage({ ...message, browser: browserName }); } catch (_) { port = null; }
  }

  function connect() {
    if (port || typeof api.runtime.connectNative !== "function") return;
    let p;
    try { p = api.runtime.connectNative(HOST); } catch (_) { return; }
    port = p;
    p.onDisconnect.addListener(() => {
      void api.runtime.lastError; // read it so a missing companion doesn't log an error
      if (port === p) { port = null; companionUp = false; }
    });
    p.onMessage.addListener((msg) => {
      if (!msg || typeof msg !== "object") return;
      if (msg.type === "refresh") refresh(SITES.includes(msg.site) ? [msg.site] : SITES, true);
      else if (msg.type === "companion") {
        companionUp = !!msg.connected;
        if (companionUp) { refresh(SITES, false); browserSync.companionReady(); }
      }
      else if (msg.type === "sync-save") browserSync.saveCompanion(msg.data, msg.at);
      else if (msg.type === "restore-settings") browserSync.restore(msg.settings);
    });
    send({ type: "hello", extensionVersion: version });
    for (const site of SITES) if (latest[site]) send({ type: "usage", site, ...latest[site] });
    sendSettings();
  }

  // The companion draws the same panel, so it gets each site's panel settings too.
  async function sendSettings() {
    try {
      const saved = await api.storage.local.get(Object.values(SETTINGS_KEYS));
      for (const site of SITES) {
        const value = saved && saved[SETTINGS_KEYS[site]];
        if (value && typeof value === "object") send({ type: "settings", site, settings: value });
      }
    } catch (_) { /* storage unavailable */ }
  }

  function fromTab(msg) {
    if (!SITES.includes(msg.site) || !msg.data || typeof msg.data !== "object") return;
    latest[msg.site] = { data: msg.data, plan: msg.plan ?? null, at: Number(msg.at) || Date.now(), source: "tab" };
    delete backoffUntil[msg.site];
    send({ type: "usage", site: msg.site, ...latest[msg.site] });
  }

  async function getJson(url, init) {
    const r = await fetch(url, { credentials: "include", ...init, headers: { Accept: "application/json", ...(init && init.headers) } });
    if (r.status === 401 || r.status === 403) throw Object.assign(new Error("Not signed in"), { signin: true });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  }

  const FETCHERS = {
    async claude() {
      const C = globalThis.UsageMeterClaude;
      const orgs = await getJson("https://claude.ai/api/organizations");
      const list = Array.isArray(orgs) ? orgs : [];
      const org = list.find((o) => o && Array.isArray(o.capabilities) && o.capabilities.includes("chat")) || list[0];
      if (!org || !org.uuid) throw Object.assign(new Error("Not signed in"), { signin: true });
      const raw = await getJson(`https://claude.ai/api/organizations/${encodeURIComponent(org.uuid)}/usage`);
      const plan = C.planName(org);
      return { data: C.convert(raw, plan), plan };
    },
    async chatgpt() {
      const s = await getJson("https://chatgpt.com/api/auth/session");
      if (!s || !s.accessToken) throw Object.assign(new Error("Not signed in"), { signin: true });
      const headers = { Authorization: `Bearer ${s.accessToken}` };
      const accountId = s.account && (s.account.id || s.account.account_id);
      if (accountId) headers["ChatGPT-Account-Id"] = accountId;
      const data = await getJson("https://chatgpt.com/backend-api/wham/usage", { headers });
      return { data, plan: (s.account && (s.account.planType || s.account.plan_type)) || null };
    },
  };

  async function fetchSite(site) {
    if (inFlight[site]) return;
    inFlight[site] = true;
    lastFetch[site] = Date.now();
    try {
      const { data, plan } = await FETCHERS[site]();
      latest[site] = { data, plan, at: Date.now(), source: "background" };
      delete backoffUntil[site];
      send({ type: "usage", site, ...latest[site] });
    } catch (e) {
      const signin = !!(e && e.signin);
      backoffUntil[site] = Date.now() + (signin ? SIGNIN_RETRY_MS : ERROR_BACKOFF_MS);
      const host = site === "claude" ? "claude.ai" : "chatgpt.com";
      send({ type: "usage-error", site, at: Date.now(), message: signin ? `Signed out of ${host} in ${browserName}. Sign in there to keep this updated; the numbers below are the last ones received.` : String((e && e.message) || e) });
    } finally {
      inFlight[site] = false;
    }
  }

  // force: the companion asked (Refresh button), so ignore staleness and error back-off.
  function refresh(sites, force) {
    if (!port || !companionUp) return;
    const now = Date.now();
    for (const site of sites) {
      if (now - (lastFetch[site] || 0) < MIN_GAP_MS) continue;
      if (!force && (backoffUntil[site] || 0) > now) continue;
      if (!force && latest[site] && now - latest[site].at < STALE_MS) continue;
      fetchSite(site);
    }
  }

  try {
    api.storage.onChanged.addListener((changes, area) => {
      if (area !== "local" || !port) return;
      for (const site of SITES) {
        const change = changes[SETTINGS_KEYS[site]];
        if (change && change.newValue && typeof change.newValue === "object") send({ type: "settings", site, settings: change.newValue });
      }
    });
  } catch (_) {}

  function tick() {
    if (!port) connect();
    else refresh(SITES, false);
  }

  try {
    api.alarms.get(ALARM).then?.((a) => { if (!a) api.alarms.create(ALARM, { periodInMinutes: 1 }); }, () => {});
    api.alarms.onAlarm.addListener((a) => { if (a.name === ALARM) tick(); });
  } catch (_) { /* no alarms permission: connect on wake-ups only */ }
  api.runtime.onStartup?.addListener(tick);
  api.runtime.onInstalled?.addListener(tick);
  tick();

  return { fromTab, send: (m) => send(m), up: () => !!port && companionUp };
})();

// ---------- browser sync ----------
// Your panel settings, and the desktop companion's settings and layout, follow your browser
// account (Chrome or Edge sync, Firefox Sync) to your other computers. The extension's fixed ID
// (the "key" in manifest.json) makes it the same extension everywhere. Things that belong to one
// computer or one moment (usage, panel position, the settings window) stay local. Each setting
// object is stored in a few small items, since sync allows 8 KB per item.
const browserSync = (() => {
  const S = api.storage && api.storage.sync;
  const L = api.storage && api.storage.local;
  const KEYS = { gptu: "chatgpt", "gptu-claude": "claude" }; // content.js storage key -> site
  const VOLATILE = ["usage", "plan", "usageAt", "models", "creditReferencePending", "settingsTab", "settingsClosed", "settingsPosition", "settingsSize", "collapsed", "closed", "floating", "position", "appliedAt"];
  const STATE = "gptu-sync"; // local: { ready, at: { key: ms }, json: { key: last synced JSON } }
  const CHUNK = 3000, DELAY_MS = 4000, RESTORE_WAIT_MS = 45 * 1000;
  let st = null, restoring = false;
  const timers = {};
  const strip = (v) => { const o = { ...(v || {}) }; for (const k of VOLATILE) delete o[k]; return o; };
  const saveState = () => L.set({ [STATE]: st }).catch?.(() => {});

  async function put(name, value, at) {
    const json = JSON.stringify(value), n = Math.max(1, Math.ceil(json.length / CHUNK));
    const old = (await S.get(`${name}#m`))[`${name}#m`];
    const items = { [`${name}#m`]: { n, at } };
    for (let i = 0; i < n; i++) items[`${name}#${i}`] = json.slice(i * CHUNK, (i + 1) * CHUNK);
    await S.set(items);
    if (old && old.n > n) await S.remove(Array.from({ length: old.n - n }, (_, i) => `${name}#${n + i}`));
  }
  async function get(name) {
    const m = (await S.get(`${name}#m`))[`${name}#m`];
    if (!m || !m.n) return null;
    const keys = Array.from({ length: m.n }, (_, i) => `${name}#${i}`);
    const got = await S.get(keys);
    if (keys.some((k) => typeof got[k] !== "string")) return null; // still arriving
    try { return { value: JSON.parse(keys.map((k) => got[k]).join("")), at: m.at }; } catch (_) { return null; }
  }

  // Another computer's settings for this site, over the local ones (keeping what stays local).
  // The new appliedAt makes open panels load them right away.
  async function applyLocal(key, value, at) {
    const cur = (await L.get(key))[key] || {};
    const keep = Object.fromEntries(VOLATILE.filter((k) => k in cur).map((k) => [k, cur[k]]));
    const next = { ...strip(value), ...keep, appliedAt: Date.now() };
    st.at[key] = at;
    st.json[key] = JSON.stringify(strip(next));
    await saveState();
    await L.set({ [key]: next });
  }

  async function push(key) {
    if (!st || !st.ready) return;
    const cur = (await L.get(key))[key];
    if (!cur) return;
    const value = strip(cur), json = JSON.stringify(value);
    if (json === st.json[key]) return;
    const at = Date.now();
    await put(`ext:${key}`, value, at);
    st.at[key] = at;
    st.json[key] = json;
    await saveState();
  }
  const schedule = (key) => { clearTimeout(timers[key]); timers[key] = setTimeout(() => push(key).catch(() => {}), DELAY_MS); };

  async function pull(key) {
    const r = await get(`ext:${key}`);
    if (r && r.at > (st.at[key] || 0) && JSON.stringify(strip(r.value)) !== st.json[key]) await applyLocal(key, r.value, r.at);
    return r;
  }

  async function sendCompanion() {
    if (!companion.up()) return;
    const r = await get("umc");
    if (r) companion.send({ type: "sync-data", data: r.value, at: r.at });
  }

  async function init() {
    if (!S || !L) return;
    st = (await L.get(STATE))[STATE] || null;
    const first = !st;
    if (first) st = { ready: false, at: {}, json: {} };
    let found = false;
    for (const key of Object.keys(KEYS)) if (await pull(key)) found = true;
    if (!st.ready) {
      if (found) st.ready = true;
      else {
        // Nothing synced yet: the companion may still have this computer's settings (a fresh
        // install, or the extension's ID changed). Ask it; after a while, start from what's here.
        restoring = true;
        setTimeout(() => { if (restoring) finishRestore(); }, RESTORE_WAIT_MS);
        companionReady();
      }
    }
    await saveState();
    if (st.ready) for (const key of Object.keys(KEYS)) schedule(key);
  }
  async function finishRestore() {
    restoring = false;
    st.ready = true;
    await saveState();
    for (const key of Object.keys(KEYS)) schedule(key);
  }

  function companionReady() {
    if (!st) return;
    if (restoring && companion.up()) companion.send({ type: "settings-missing" });
    sendCompanion().catch(() => {});
  }
  async function restore(settings) {
    if (!restoring || !settings || typeof settings !== "object") return;
    for (const [key, site] of Object.entries(KEYS)) {
      const v = settings[site];
      if (v && typeof v === "object") await applyLocal(key, v, 0);
    }
    st.json = {}; // push the restored settings to sync
    await finishRestore();
  }
  async function saveCompanion(data, at) {
    if (!S || !data || typeof data !== "object" || !(Number(at) > 0)) return;
    const cur = await get("umc");
    if (cur && cur.at >= at) return;
    await put("umc", data, Number(at));
  }

  try {
    api.storage.onChanged.addListener((changes, area) => {
      if (!st) return;
      if (area === "local") { for (const key of Object.keys(KEYS)) if (changes[key] && st.ready) schedule(key); return; }
      if (area !== "sync") return;
      for (const key of Object.keys(KEYS)) if (changes[`ext:${key}#m`]) pull(key).catch(() => {});
      if (changes["umc#m"]) sendCompanion().catch(() => {});
    });
  } catch (_) {}
  init().catch(() => {});

  return { companionReady, restore, saveCompanion };
})();
