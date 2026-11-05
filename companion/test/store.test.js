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
  s.set({ attachMove: true, unknown: 1 });
  await new Promise((r) => setTimeout(r, 400));
  const again = Store.create(dir);
  assert.deepStrictEqual(again.local.claude, { collapsed: true, closed: { credits: true } });
  assert.strictEqual(again.ext.claude.usageAt, 2);
  assert.strictEqual(again.settings.attachMove, true);
  assert.ok(!("unknown" in again.settings));
});

test("old placement settings become one choice per card", () => {
  const { placementFromOld } = require("../src/store");
  assert.strictEqual(placementFromOld({ mode: "follow" }), null, "a new install has nothing to convert");
  // Your setup before 0.2.18: separate cards on their apps, docked, the Claude card by its own dock button.
  assert.deepStrictEqual(placementFromOld({ miniOnTop: true, attachToApp: true, dockSidebar: true, cardDock: { claude: true } }).placement, { main: "dock", claude: "dock", chatgpt: "dock" });
  // On its app; the ChatGPT card unpinned there was an ordinary window.
  const r = placementFromOld({ miniOnTop: true, attachToApp: true, cardOnTop: { chatgpt: false } });
  assert.deepStrictEqual(r.placement, { main: "app", claude: "app", chatgpt: "float" });
  assert.strictEqual(r.onTop.chatgpt, false);
  assert.strictEqual(r.onTop.claude, true, "a pinned card stays on top if you later make it floating");
  // Floating; "only while in front" was closest to "on top of its app".
  assert.deepStrictEqual(placementFromOld({ miniOnTop: false }), { placement: { main: "float", claude: "float", chatgpt: "float" }, onTop: { main: false, claude: false, chatgpt: false } });
  assert.strictEqual(placementFromOld({ miniOnlyWithApp: true }).placement.claude, "app");
});

test("settings an older version wrote stay readable for conversion", () => {
  const fs = require("fs"), os = require("os"), path = require("path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "umc-store-"));
  fs.writeFileSync(path.join(dir, "settings.json"), JSON.stringify({ attachToApp: true, dockSidebar: true }));
  const store = require("../src/store").create(dir);
  assert.strictEqual(store.raw.attachToApp, true);
  assert.ok(!("attachToApp" in store.settings), "unknown keys aren't kept in settings");
  fs.rmSync(dir, { recursive: true, force: true });
});
