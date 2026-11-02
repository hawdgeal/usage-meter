"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { detect, covered } = require("../src/sidebar");

// A fake window picture: background, a sidebar with an edge line, a footer divider, some text.
function picture({ w = 900, h = 800, rail = 0, side = 300, footer = 60, box = false }) {
  const data = Buffer.alloc(w * h * 4);
  const set = (x, y, rgb) => { const i = (y * w + x) * 4; data[i] = rgb & 255; data[i + 1] = (rgb >> 8) & 255; data[i + 2] = rgb >> 16; data[i + 3] = 255; };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let c = x < rail ? 0x202020 : x < rail + side ? 0x1f1f1f : 0x191919;
    if (rail && x === rail - 1) c = 0x333333;
    if (x === rail + side) c = 0x2a2a2a; // the sidebar's edge
    set(x, y, c);
  }
  for (let y = 40; y < h - 100; y += 32) for (let x = rail + 20; x < rail + 120; x++) set(x, y, 0xdddddd); // chat titles
  const fy = h - footer;
  if (box) { for (let y = fy; y < fy + 40; y++) for (let x = rail + 10; x < rail + side - 10; x++) set(x, y, 0x181818); }
  else for (let x = rail; x < rail + side; x++) set(x, fy, 0x3a3a3a);
  return { x: 0, y: 0, w, h, data };
}

test("finds a sidebar from the left edge and the divider above the footer", () => {
  const r = detect(picture({}), { x: 0, y: 0, w: 900, h: 800 });
  assert.deepStrictEqual(r, { left: 1, right: 300, bottom: 740, end: 800, edge: "#2a2a2a", bg: "#1f1f1f", line: "#3a3a3a" });
});

test("finds a sidebar right of an icon strip, above a footer box", () => {
  const r = detect(picture({ rail: 50, box: true }), { x: 0, y: 0, w: 900, h: 800 });
  assert.strictEqual(r.left, 50);
  assert.strictEqual(r.right, 350);
  assert.strictEqual(r.bottom, 740);
});

test("works with the window's invisible borders around the frame", () => {
  const img = picture({ w: 920, h: 810 });
  const r = detect({ ...img, x: -10, y: 0 }, { x: 0, y: 0, w: 900, h: 800 });
  assert.strictEqual(r.right, 290);
});

test("a scrollbar along the sidebar's edge isn't its edge", () => {
  const img = picture({});
  for (let y = 0; y < 800; y++) for (let x = 290; x < 296; x++) { const i = (y * 900 + x) * 4; img.data[i] = img.data[i + 1] = img.data[i + 2] = 0x30; }
  assert.strictEqual(detect(img, { x: 0, y: 0, w: 900, h: 800 }).right, 300);
});

test("no sidebar: nothing found", () => {
  const img = picture({ side: 0 });
  assert.strictEqual(detect(img, { x: 0, y: 0, w: 900, h: 800 }), null);
});

test("an open menu over the card's spot counts as covering it; chat titles don't", () => {
  const img = picture({});
  const frame = { x: 0, y: 0, w: 900, h: 800 }, area = { x: 0, y: 500, w: 300, h: 240 };
  assert.strictEqual(covered(img, frame, "#1f1f1f", area), false);
  for (let y = 520; y < 730; y++) for (let x = 10; x < 260; x++) { const i = (y * 900 + x) * 4; img.data[i] = img.data[i + 1] = img.data[i + 2] = 0x2c; }
  assert.strictEqual(covered(img, frame, "#1f1f1f", area), true);
});
