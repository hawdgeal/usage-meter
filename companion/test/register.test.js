"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const R = require("../src/register");

const REPO = path.join(__dirname, "..", "..");
const ID = "abcdefghijklmnopabcdefghijklmnop";
const OTHER = "pponmlkjihgfedcbapponmlkjihgfedc";

function fakeProfiles() {
  const local = fs.mkdtempSync(path.join(os.tmpdir(), "umc-local-"));
  const appData = fs.mkdtempSync(path.join(os.tmpdir(), "umc-roam-"));
  const chrome = path.join(local, "Google", "Chrome", "User Data", "Profile 2");
  fs.mkdirSync(chrome, { recursive: true });
  // Unpacked copy of this repo's extension (real manifest.json) and an unrelated extension.
  fs.writeFileSync(path.join(chrome, "Secure Preferences"), JSON.stringify({ extensions: { settings: {
    [ID]: { path: REPO, location: 4 },
    [OTHER]: { path: "pponm/1.0", manifest: { name: "Some Other Extension" } },
  } } }));
  fs.writeFileSync(path.join(chrome, "Preferences"), "{}");
  const opera = path.join(appData, "Opera Software", "Opera Stable");
  fs.mkdirSync(opera, { recursive: true });
  fs.writeFileSync(path.join(opera, "Preferences"), "not json");
  return { LOCALAPPDATA: local, APPDATA: appData };
}

test("finds the unpacked extension by its manifest and ignores others", () => {
  const found = R.detectExtensionIds(fakeProfiles());
  assert.deepStrictEqual(found.map((f) => [f.id, f.browser, f.profile]), [[ID, "Chrome", "Profile 2"]]);
});

test("no browsers installed: nothing found, no errors", () => {
  assert.deepStrictEqual(R.detectExtensionIds({ LOCALAPPDATA: "/nonexistent", APPDATA: undefined }), []);
});

test("host files: launcher runs the app's exe in Node mode; manifests list the right extensions", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "umc-host-"));
  const f = R.writeHostFiles(dir, { exePath: "C:\\Apps\\Usage Meter Companion.exe", scriptPath: "C:\\Apps\\resources\\app.asar.unpacked\\src\\host.js", ids: [ID, ID, "bad"] });
  const bat = fs.readFileSync(f.bat, "utf8");
  assert.match(bat, /set ELECTRON_RUN_AS_NODE=1\r\n"C:\\Apps\\Usage Meter Companion\.exe" "C:\\Apps\\resources\\app\.asar\.unpacked\\src\\host\.js" %\*/);
  const c = JSON.parse(fs.readFileSync(f.chromium, "utf8"));
  assert.deepStrictEqual(c.allowed_origins, [`chrome-extension://${ID}/`]);
  assert.strictEqual(c.name, "fr.alencar.usage_meter");
  assert.strictEqual(c.type, "stdio");
  const ff = JSON.parse(fs.readFileSync(f.firefox, "utf8"));
  assert.deepStrictEqual(ff.allowed_extensions, ["chatgpt-usage-meter@alencar.fr"]);
  // The Firefox ID must match the extension's own manifest.
  const ext = JSON.parse(fs.readFileSync(path.join(REPO, "manifest.json"), "utf8"));
  assert.strictEqual(ext.browser_specific_settings.gecko.id, R.FIREFOX_ID);
  assert.ok(ext.permissions.includes("nativeMessaging"));
});

test("registry plan: Chromium keys only when an ID is known; Firefox always", () => {
  const files = { chromium: "C:\\h\\c.json", firefox: "C:\\h\\f.json" };
  const all = R.registryPlan(files, true);
  assert.deepStrictEqual(all.map((p) => p.browser), ["Chrome", "Edge", "Brave", "Chromium", "Firefox"]);
  assert.strictEqual(all[0].key, "HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\fr.alencar.usage_meter");
  assert.strictEqual(all.at(-1).value, files.firefox);
  assert.deepStrictEqual(R.registryPlan(files, false).map((p) => p.browser), ["Firefox"]);
});
