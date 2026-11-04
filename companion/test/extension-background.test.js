// Runs the extension's background.js (and claude-usage.js) in a sandbox with a fake browser API.
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const EXT = path.join(__dirname, "..", "..");

// clock: { now } lets a test move time forward (the background script reads Date.now()).
// syncStore: a shared object standing in for browser sync (two browsers can share one).
function makeBrowser({ hostInstalled = true, responses = {}, saved = {}, clock = null, syncStore = null } = {}) {
  const listeners = { message: [], alarm: [], storage: [] };
  const fireStorage = (c, area) => listeners.storage.forEach((f) => f(c, area));
  const pick = (store, keys) => Object.fromEntries([].concat(keys).filter((k) => k in store).map((k) => [k, JSON.parse(JSON.stringify(store[k]))]));
  const ports = [];
  const fetches = [];
  const ev = () => { const l = []; return { addListener: (f) => l.push(f), fire: (...a) => l.forEach((f) => f(...a)), l }; };
  const chrome = {
    runtime: {
      lastError: undefined,
      getManifest: () => ({ version: "0.5.0" }),
      onMessage: { addListener: (f) => listeners.message.push(f) },
      onStartup: ev(), onInstalled: ev(),
      connectNative(name) {
        const port = { name, sent: [], onDisconnect: ev(), onMessage: ev(), postMessage(m) { this.sent.push(JSON.parse(JSON.stringify(m))); } };
        ports.push(port);
        if (!hostInstalled) setTimeout(() => { chrome.runtime.lastError = { message: "Specified native messaging host not found." }; port.onDisconnect.fire(); chrome.runtime.lastError = undefined; }, 0);
        return port;
      },
    },
    action: { setIcon: () => Promise.resolve(), setTitle: () => Promise.resolve() },
    alarms: { get: () => Promise.resolve(null), create: () => {}, onAlarm: { addListener: (f) => listeners.alarm.push(f) } },
    storage: {
      local: {
        get: async (keys) => pick(saved, keys),
        set: async (items) => { const c = {}; for (const [k, v] of Object.entries(items)) { c[k] = { oldValue: saved[k], newValue: v }; saved[k] = JSON.parse(JSON.stringify(v)); } setTimeout(() => fireStorage(c, "local"), 0); },
      },
      ...(syncStore ? { sync: {
        get: async (keys) => pick(syncStore, keys),
        set: async (items) => { const c = {}; for (const [k, v] of Object.entries(items)) { c[k] = { newValue: v }; syncStore[k] = JSON.parse(JSON.stringify(v)); } setTimeout(() => fireStorage(c, "sync"), 0); },
        remove: async (keys) => { for (const k of [].concat(keys)) delete syncStore[k]; },
      } } : {}),
      onChanged: { addListener: (f) => listeners.storage.push(f) },
    },
  };
  const fetch = async (url, init) => {
    fetches.push({ url, init });
    const r = responses[url];
    if (!r) return { ok: false, status: 404, json: async () => ({}) };
    return { ok: (r.status || 200) < 400, status: r.status || 200, json: async () => r.body };
  };
  const FakeDate = clock ? Object.assign(class extends Date {}, { now: () => clock.now }) : Date;
  const ctx = vm.createContext({ chrome, fetch, navigator: { userAgent: "Mozilla/5.0 Chrome/140" }, setTimeout, clearTimeout, console, Date: FakeDate, JSON, Promise, Object, Array, String, Number, Math, Error, encodeURIComponent, isFinite });
  ctx.globalThis = ctx;
  ctx.importScripts = (f) => vm.runInContext(fs.readFileSync(path.join(EXT, f), "utf8"), ctx, { filename: f });
  vm.runInContext(fs.readFileSync(path.join(EXT, "background.js"), "utf8"), ctx, { filename: "background.js" });
  const tabMessage = (m) => listeners.message.forEach((f) => f(m, { tab: { id: 1 } }));
  return { ctx, ports, fetches, tabMessage, storageChange: (c) => fireStorage(c, "local"), saved, alarm: () => listeners.alarm.forEach((f) => f({ name: "usage-meter-companion" })) };
}

const tick = () => new Promise((r) => setTimeout(r, 20));

const CLAUDE = {
  "https://claude.ai/api/organizations": { body: [{ uuid: "org-1", capabilities: ["chat", "claude_max"], rate_limit_tier: "default_claude_max_5x" }] },
  "https://claude.ai/api/organizations/org-1/usage": { body: { five_hour: { utilization: 40, resets_at: "2026-11-01T20:00:00Z" }, seven_day: { utilization: 70 } } },
  "https://chatgpt.com/api/auth/session": { body: {} },
};

async function connected(opts) {
  const b = makeBrowser(opts);
  await tick();
  b.ports[0].onMessage.fire({ type: "companion", connected: true });
  await tick();
  return b;
}

test("host up but companion not running: no background fetching until it connects", async () => {
  const b = makeBrowser({ responses: CLAUDE });
  await tick();
  b.alarm(); await tick();
  assert.strictEqual(b.fetches.length, 0);
  b.ports[0].onMessage.fire({ type: "companion", connected: true });
  await tick();
  assert.ok(b.fetches.length > 0);
});

test("connects, says hello, fetches stale sites itself and reports sign-in problems", async () => {
  const b = await connected({ responses: CLAUDE });
  const port = b.ports[0];
  assert.strictEqual(port.name, "fr.alencar.usage_meter");
  assert.deepStrictEqual(port.sent[0], { type: "hello", extensionVersion: "0.5.0", browser: "Chrome" });
  const claude = port.sent.find((m) => m.type === "usage" && m.site === "claude");
  assert.strictEqual(claude.source, "background");
  assert.strictEqual(claude.plan, "Max 5x");
  assert.strictEqual(claude.data.rate_limit.primary_window.used_percent, 40);
  assert.strictEqual(claude.data.rate_limit.secondary_window.limit_window_seconds, 604800);
  const err = port.sent.find((m) => m.type === "usage-error" && m.site === "chatgpt");
  assert.match(err.message, /^Signed out of chatgpt.com in Chrome. Sign in there/);
  // Credentials are only sent to the two sites.
  assert.ok(b.fetches.every((f) => /^https:\/\/(claude\.ai|chatgpt\.com)\//.test(f.url)));
});

test("tab updates are forwarded, and invalid ones dropped", async () => {
  const b = await connected({ responses: CLAUDE });
  const port = b.ports[0];
  b.tabMessage({ type: "usage-meter-usage", site: "chatgpt", data: { rate_limit: {} }, plan: "plus", at: 123 });
  assert.deepStrictEqual(port.sent.at(-1), { type: "usage", site: "chatgpt", data: { rate_limit: {} }, plan: "plus", at: 123, source: "tab", browser: "Chrome" });
  b.tabMessage({ type: "usage-meter-usage", site: "evil", data: {} });
  b.tabMessage({ type: "usage-meter-usage", site: "claude", data: "x" });
  assert.strictEqual(port.sent.at(-1).site, "chatgpt");
});

test("fresh tab data means no background fetch for that site", async () => {
  const b = makeBrowser({ responses: CLAUDE });
  await tick();
  b.tabMessage({ type: "usage-meter-usage", site: "claude", data: { rate_limit: {} }, at: Date.now() });
  b.ports[0].onMessage.fire({ type: "companion", connected: true });
  await tick();
  assert.ok(!b.fetches.some((f) => f.url.startsWith("https://claude.ai/")));
  assert.ok(b.fetches.some((f) => f.url.startsWith("https://chatgpt.com/")));
});

test("refresh from the companion forces a fetch, but not more than once per 10 s", async () => {
  const b = await connected({ responses: CLAUDE });
  const port = b.ports[0];
  const n = () => b.fetches.filter((f) => f.url.endsWith("/usage")).length;
  const before = n();
  port.onMessage.fire({ type: "refresh", site: "claude" });
  await tick();
  assert.strictEqual(n(), before); // just fetched on connect
  b.ctx.Date = class extends Date { static now() { return Date.now() + 11000; } };
  vm.runInContext("Date = globalThis.Date", b.ctx);
  port.onMessage.fire({ type: "refresh", site: "claude" });
  await tick();
  assert.strictEqual(n(), before + 1);
});

test("missing companion: quiet failure, retried on the next alarm", async () => {
  const b = makeBrowser({ hostInstalled: false, responses: CLAUDE });
  await tick();
  assert.strictEqual(b.ports.length, 1);
  b.alarm();
  await tick();
  assert.strictEqual(b.ports.length, 2);
  // Not installed → no requests to claude.ai or chatgpt.com at all.
  assert.strictEqual(b.fetches.length, 0);
});

test("panel settings go to the companion on connect and when they change", async () => {
  const b = makeBrowser({ saved: { "gptu-claude": { preset: "Catppuccin", compact: true }, other: 1 } });
  await tick();
  const port = b.ports[0];
  assert.deepStrictEqual(port.sent.filter((m) => m.type === "settings"), [{ type: "settings", site: "claude", settings: { preset: "Catppuccin", compact: true }, browser: "Chrome" }]);
  b.storageChange({ gptu: { newValue: { theme: "dark" } }, unrelated: { newValue: 1 } });
  assert.deepStrictEqual(port.sent.at(-1), { type: "settings", site: "chatgpt", settings: { theme: "dark" }, browser: "Chrome" });
});

test("site icon messages still work", async () => {
  const b = makeBrowser();
  assert.doesNotThrow(() => b.tabMessage({ type: "usage-meter-site", site: "claude" }));
});

test("after a sign-in error it tries again within minutes, not ten", async () => {
  const clock = { now: 1_000_000 };
  const b = await connected({ responses: CLAUDE, clock });
  const gptFetches = () => b.fetches.filter((f) => f.url.startsWith("https://chatgpt.com/")).length;
  const first = gptFetches();
  assert.ok(first > 0);
  clock.now += 60 * 1000; b.alarm(); await tick();
  assert.strictEqual(gptFetches(), first, "not again after one minute");
  clock.now += 90 * 1000; b.alarm(); await tick();
  assert.ok(gptFetches() > first, "again after two and a half minutes");
});

test("browser sync: restores from the companion, syncs without per-computer parts, and another browser picks it up", async () => {
  const syncStore = {};
  const a = makeBrowser({ saved: { gptu: { theme: "dark", usage: { x: 1 }, position: { x: 5 } } }, syncStore });
  await tick();
  const port = a.ports[0];
  port.onMessage.fire({ type: "companion", connected: true });
  await tick();
  // Nothing in sync yet: the extension asks the companion for this computer's settings.
  assert.ok(port.sent.some((m) => m.type === "settings-missing"));
  port.onMessage.fire({ type: "restore-settings", settings: { chatgpt: { theme: "light", position: { x: 9 } } } });
  await tick();
  assert.strictEqual(a.saved.gptu.theme, "light");
  assert.deepStrictEqual(a.saved.gptu.position, { x: 5 }, "the panel position stays this computer's");
  // A few seconds later the settings are in sync, without usage or position.
  await new Promise((r) => setTimeout(r, 4300));
  const meta = syncStore["ext:gptu#m"];
  assert.ok(meta && meta.n >= 1);
  const synced = JSON.parse(Array.from({ length: meta.n }, (_, i) => syncStore["ext:gptu#" + i]).join(""));
  assert.strictEqual(synced.theme, "light");
  assert.ok(!("usage" in synced) && !("position" in synced));
  // The companion's own settings are kept in sync too, and the newest wins.
  port.onMessage.fire({ type: "sync-save", data: { settings: { mode: "claude" } }, at: 50 });
  await tick();
  port.onMessage.fire({ type: "sync-save", data: { settings: { mode: "chatgpt" } }, at: 40 });
  await tick();
  assert.strictEqual(JSON.parse(syncStore["umc#0"]).settings.mode, "claude");

  // Another computer: empty extension, same browser account.
  const b = makeBrowser({ syncStore });
  await tick(); await tick();
  assert.strictEqual(b.saved.gptu.theme, "light");
  assert.ok(b.saved.gptu.appliedAt, "open panels reload it");
  b.ports[0].onMessage.fire({ type: "companion", connected: true });
  await tick();
  const data = b.ports[0].sent.find((m) => m.type === "sync-data");
  assert.ok(data && data.data.settings.mode === "claude" && data.at === 50);
  assert.ok(!b.ports[0].sent.some((m) => m.type === "settings-missing"), "nothing to restore: sync had it");
});
