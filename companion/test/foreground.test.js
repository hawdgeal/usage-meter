"use strict";
const test = require("node:test");
const assert = require("node:assert");
const f = require("../src/foreground");

test("window handles from getNativeWindowHandle() are read as integers", () => {
  const b8 = Buffer.alloc(8); b8.writeBigInt64LE(0x1a2b3cn);
  const b4 = Buffer.alloc(4); b4.writeInt32LE(0x51234);
  assert.strictEqual(f.handleValue(b8), 0x1a2b3cn); // 64-bit Windows
  assert.strictEqual(f.handleValue(b4), 0x51234);
  assert.strictEqual(f.handleValue(Buffer.alloc(2)), null);
  assert.strictEqual(f.handleValue("nope"), null);
});

test("setTopmost is a safe no-op where Win32 isn't available", { skip: process.platform === "win32" }, () => {
  assert.strictEqual(f.setTopmost(Buffer.alloc(8), true), false);
});
