"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const Store = require("../src/store");

test("only look-and-layout changes count as a settings change", () => {
  const base = { preset: "Catppuccin", compact: true, usage: { a: 1 }, usageAt: 1 };
  assert.strictEqual(Store.prefsKey(base), Store.prefsKey({ ...base, usage: { a: 2 }, usageAt: 2, collapsed: true, closed: { plan: true }, models: { x: 1 } }));
  assert.notStrictEqual(Store.prefsKey(base), Store.prefsKey({ ...base, compact: false }));
  assert.notStrictEqual(Store.prefsKey(base), Store.prefsKey({ ...base, size: { width: 280 } }));
});

test("extension settings and local panel state are stored separately", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "umc-store-"));
  const s = Store.create(dir);
  assert.strictEqual(s.setExt("claude", { preset: "auto", usageAt: 1 }), true);
  assert.strictEqual(s.setExt("claude", { preset: "auto", usageAt: 2 }), false);
  s.setLocal("claude", { collapsed: true, closed: { credits: true }, preset: "nope" });
  s.set({ miniOnTop: false, unknown: 1 });
  await new Promise((r) => setTimeout(r, 400));
  const again = Store.create(dir);
  assert.deepStrictEqual(again.local.claude, { collapsed: true, closed: { credits: true } });
  assert.strictEqual(again.ext.claude.usageAt, 2);
  assert.strictEqual(again.settings.miniOnTop, false);
  assert.ok(!("unknown" in again.settings));
});
