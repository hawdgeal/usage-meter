"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { ringBitmap, trayColor, trayFraction } = require("../src/icon");

const px = (buf, size, x, y) => { const i = (y * size + x) * 4; return { b: buf[i], g: buf[i + 1], r: buf[i + 2], a: buf[i + 3] }; };

test("ring: colored from 12 o'clock clockwise, track elsewhere, clear centre", () => {
  const size = 32, buf = ringBitmap(size, 0.25, "#D97757");
  assert.strictEqual(buf.length, size * size * 4);
  const right = px(buf, size, 29, 10); // ~1–2 o'clock: inside the colored quarter
  assert.ok(right.a > 200 && right.r > 180 && right.b < 120, JSON.stringify(right));
  const left = px(buf, size, 2, 16); // 9 o'clock: track
  assert.ok(left.a > 50 && left.a < 160, JSON.stringify(left));
  assert.strictEqual(px(buf, size, 16, 16).a, 0);
});

test("no data draws only the track", () => {
  const buf = ringBitmap(16, null, "#10A37F");
  let max = 0;
  for (let i = 3; i < buf.length; i += 4) max = Math.max(max, buf[i]);
  assert.ok(max > 0 && max < 130);
});

test("tray turns red at 10% left and follows the left/used choice", () => {
  const v = { color: "#10A37F", head: { left: 8, used: 92 } };
  assert.strictEqual(trayColor(v), "#E5484D");
  assert.strictEqual(trayFraction(v, "left"), 0.08);
  assert.strictEqual(trayFraction(v, "used"), 0.92);
  assert.strictEqual(trayFraction({ color: "#fff", head: null }), null);
});
