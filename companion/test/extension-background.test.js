// Runs the extension's background.js (and claude-usage.js) in a sandbox with a fake browser API.
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const EXT = path.join(__dirname, "..", "..");

function makeBrowser({ hostInstalled = true, responses = {}, saved = {} } = {}) {
  const listeners = { message: [], alarm: [] };
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
      local: { get: async (keys) => Object.fromEntries([].concat(keys).filter((k) => k in saved).map((k) => [k, saved[k]])) },
      onChanged: { addListener: (f) => listeners.storage = f },
    },
  };
  const fetch = async (url, init) => {
    fetches.push({ url, init });
    const r = responses[url];
    if (!r) return { ok: false, status: 404, json: async () => ({}) };
    return { ok: (r.status || 200) < 400, status: r.status || 200, json: async () => r.body };
  };
  const ctx = vm.createContext({ chrome, fetch, navigator: { userAgent: "Mozilla/5.0 Chrome/140" }, setTimeout, console, Date, JSON, Promise, Object, Array, String, Number, Math, Error, encodeURIComponent, isFinite });
  ctx.globalThis = ctx;
  ctx.importScripts = (f) => vm.runInContext(fs.readFileSync(path.join(EXT, f), "utf8"), ctx, { filename: f });
  vm.runInContext(fs.readFileSync(path.join(EXT, "background.js"), "utf8"), ctx, { filename: "background.js" });
  const tabMessage = (m) => listeners.message.forEach((f) => f(m, { tab: { id: 1 } }));
  return { ctx, ports, fetches, tabMessage, storageChange: (c) => listeners.storage(c, "local"), alarm: () => listeners.alarm.forEach((f) => f({ name: "usage-meter-companion" })) };
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
  assert.strictEqual(err.message, "Not signed in to chatgpt.com in Chrome");
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
