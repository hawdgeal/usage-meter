// The companion's own sign-in: a small window where you sign in to claude.ai or chatgpt.com
// yourself. The companion keeps that login (cookies in its own storage, one per site) and fetches
// your usage with it, the same requests the extension makes, so the browser doesn't need to be
// running. Nothing is sent anywhere but claude.ai and chatgpt.com, and the companion never sees
// your password: you type it into the site's own page.
"use strict";
const path = require("path");
const { app, BrowserWindow, session, shell } = require("electron");

const SITES = {
  claude: { host: "claude.ai", origin: "https://claude.ai", login: "https://claude.ai/login" },
  chatgpt: { host: "chatgpt.com", origin: "https://chatgpt.com", login: "https://chatgpt.com/auth/login" },
};

// claude-usage.js (shared with the extension) turns Claude's answer into what the panel draws.
function claudeConverter() {
  if (!globalThis.UsageMeterClaude) {
    const file = app.isPackaged ? path.join(process.resourcesPath, "claude-usage.js") : path.join(__dirname, "..", "..", "claude-usage.js");
    require(file);
  }
  return globalThis.UsageMeterClaude;
}

const sessionOf = (site) => session.fromPartition(`persist:login-${site}`);

// Sites sign-in pages (Google sign-in in particular) refuse browsers that call themselves Electron.
function chromeAgent(ses) {
  return ses.getUserAgent().replace(/\s(Electron|usage-meter-companion|Usage ?Meter ?Companion)\/\S+/gi, "");
}
function prepare(site) {
  const ses = sessionOf(site);
  if (!ses.__umcReady) { ses.setUserAgent(chromeAgent(ses)); ses.__umcReady = true; }
  return ses;
}

class SignInError extends Error { constructor(m) { super(m || "Not signed in"); this.signin = true; } }

async function getJson(ses, url, init) {
  const r = await ses.fetch(url, { credentials: "include", ...init, headers: { Accept: "application/json", ...(init && init.headers) } });
  if (r.status === 401 || r.status === 403) throw new SignInError();
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

const FETCHERS = {
  async claude(ses) {
    const C = claudeConverter();
    const orgs = await getJson(ses, "https://claude.ai/api/organizations");
    const list = Array.isArray(orgs) ? orgs : [];
    const org = list.find((o) => o && Array.isArray(o.capabilities) && o.capabilities.includes("chat")) || list[0];
    if (!org || !org.uuid) throw new SignInError();
    const raw = await getJson(ses, `https://claude.ai/api/organizations/${encodeURIComponent(org.uuid)}/usage`);
    const plan = C.planName(org);
    return { data: C.convert(raw, plan), plan };
  },
  async chatgpt(ses) {
    const s = await getJson(ses, "https://chatgpt.com/api/auth/session");
    if (!s || !s.accessToken) throw new SignInError();
    const headers = { Authorization: `Bearer ${s.accessToken}` };
    const accountId = s.account && (s.account.id || s.account.account_id);
    if (accountId) headers["ChatGPT-Account-Id"] = accountId;
    const data = await getJson(ses, "https://chatgpt.com/backend-api/wham/usage", { headers });
    return { data, plan: (s.account && (s.account.planType || s.account.plan_type)) || null };
  },
};

// { data, plan } or throws (err.signin when the login is missing or expired).
async function fetchUsage(site) {
  if (!SITES[site]) throw new Error("unknown site");
  return FETCHERS[site](prepare(site));
}

// Opens the site's sign-in page in a window of its own. Resolves true once the companion can read
// usage with that login (the window then closes), false if you close it first.
const open = new Map(); // site -> { win, promise }
function signIn(site, parent) {
  if (open.has(site)) { const o = open.get(site); if (!o.win.isDestroyed()) { o.win.show(); o.win.focus(); } return o.promise; }
  const ses = prepare(site);
  const win = new BrowserWindow({
    width: 520, height: 760, title: `Sign in to ${SITES[site].host} · Usage Meter Companion`, autoHideMenuBar: true, parent: parent || undefined,
    webPreferences: { session: ses, contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: true },
  });
  // Pop-ups (Google or Apple sign-in) open as windows that share this login; other links go to your browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url) && !/^https:\/\/(claude\.ai|chatgpt\.com|auth\.openai\.com|accounts\.google\.com|appleid\.apple\.com|login\.microsoftonline\.com|login\.live\.com)\//.test(url)) { shell.openExternal(url); return { action: "deny" }; }
    return { action: "allow", overrideBrowserWindowOptions: { autoHideMenuBar: true, parent: win, webPreferences: { session: ses, contextIsolation: true, sandbox: true } } };
  });
  const promise = new Promise((resolve) => {
    let done = false;
    const finish = (ok) => { if (done) return; done = true; clearInterval(timer); open.delete(site); if (!win.isDestroyed()) win.close(); resolve(ok); };
    // Checks every few seconds whether the login works yet.
    const check = async () => { try { await fetchUsage(site); finish(true); } catch (_) { /* not yet */ } };
    const timer = setInterval(check, 3000);
    win.webContents.on("did-navigate", () => setTimeout(check, 800));
    win.on("closed", () => { if (!done) { done = true; clearInterval(timer); open.delete(site); resolve(false); } });
  });
  open.set(site, { win, promise });
  win.loadURL(SITES[site].login);
  return promise;
}

// Forgets the companion's login for that site.
async function signOut(site) {
  await prepare(site).clearStorageData();
}

module.exports = { SITES, fetchUsage, signIn, signOut };
