"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { compare, fromRelease } = require("../src/updater");

test("versions compare by number, not as text", () => {
  assert.strictEqual(compare("0.2.14", "0.2.9"), 1);
  assert.strictEqual(compare("0.2.9", "0.2.14"), -1);
  assert.strictEqual(compare("0.3.0", "0.3.0"), 0);
  assert.strictEqual(compare("1.0", "0.9.9"), 1);
});

test("finds the companion zip and its version in a release", () => {
  const rel = { tag_name: "v0.5.4", name: "Usage Meter 0.5.4", html_url: "https://github.com/x/y/releases/tag/v0.5.4", assets: [
    { name: "Usage-Meter-v0.5.4.zip", browser_download_url: "https://a/ext.zip", size: 10 },
    { name: "usage-meter-companion-0.2.14-win-x64.zip", browser_download_url: "https://a/c.zip", size: 99 },
  ] };
  assert.deepStrictEqual(fromRelease(rel), { version: "0.2.14", url: "https://a/c.zip", size: 99, name: "usage-meter-companion-0.2.14-win-x64.zip", page: rel.html_url, title: "Usage Meter 0.5.4" });
  assert.strictEqual(fromRelease({ assets: [{ name: "other.zip" }] }), null);
});
