"use strict";
const test = require("node:test");
const assert = require("node:assert");
const edge = require("../src/edge");

// A 1920×1080 screen with a 48 px taskbar at the bottom.
const area = { x: 0, y: 0, width: 1920, height: 1032 };
const card = (x, y) => ({ x, y, width: 300, height: 200 });

test("while dragging, the pointer near an edge snaps the card to that edge", () => {
  assert.strictEqual(edge.sideFor(area, { x: 3, y: 500 }), "left");
  assert.strictEqual(edge.sideFor(area, { x: 1910, y: 500 }), "right");
  assert.strictEqual(edge.sideFor(area, { x: 900, y: 10 }), "top");
  assert.strictEqual(edge.sideFor(area, { x: 900, y: 1025 }), "bottom");
  assert.strictEqual(edge.sideFor(area, { x: 900, y: 500 }), null);
  assert.strictEqual(edge.sideFor(area, { x: edge.SNAP + 1, y: 500 }), null);
});

test("in a corner, the nearer edge wins", () => {
  assert.strictEqual(edge.sideFor(area, { x: 2, y: 15 }), "left");
  assert.strictEqual(edge.sideFor(area, { x: 15, y: 2 }), "top");
});

test("the pointer on another screen doesn't snap to this one", () => {
  assert.strictEqual(edge.sideFor(area, { x: 2500, y: 500 }), null);
});

test("an open card sits a small gap from its edge, at its place along it", () => {
  assert.deepStrictEqual(edge.shownPos("left", area, card(40, 300)), { x: edge.GAP, y: 300 });
  assert.deepStrictEqual(edge.shownPos("right", area, card(40, 300)), { x: 1920 - 300 - edge.GAP, y: 300 });
  assert.deepStrictEqual(edge.shownPos("top", area, card(700, 300)), { x: 700, y: edge.GAP });
  assert.deepStrictEqual(edge.shownPos("bottom", area, card(700, 300)), { x: 700, y: 1032 - 200 - edge.GAP });
});

test("an open card stays on the screen along its edge", () => {
  assert.strictEqual(edge.shownPos("left", area, card(0, 950)).y, 1032 - 200);
  assert.strictEqual(edge.shownPos("top", area, card(1800, 0)).x, 1920 - 300);
  assert.strictEqual(edge.shownPos("right", area, card(0, -40)).y, 0);
});

test("a card tucks away just past its edge", () => {
  assert.strictEqual(edge.hiddenPos("left", area, card(0, 300)).x, -300);
  assert.strictEqual(edge.hiddenPos("right", area, card(0, 300)).x, 1920);
  assert.strictEqual(edge.hiddenPos("top", area, card(0, 300)).y, -200);
  assert.strictEqual(edge.hiddenPos("bottom", area, card(0, 300)).y, 1032);
  assert.strictEqual(edge.hiddenPos("left", area, card(0, 300)).y, 300); // same place along the edge
});

test("an open card sits flush against its edge", () => {
  assert.strictEqual(edge.GAP, 0);
  assert.strictEqual(edge.shownPos("left", area, card(500, 300)).x, 0);
  assert.strictEqual(edge.shownPos("bottom", area, card(500, 300)).y, 832);
});

test("a docked card being dragged goes to the edge nearest the pointer, however far", () => {
  assert.strictEqual(edge.nearestEdge(area, { x: 300, y: 500 }), "left");
  assert.strictEqual(edge.nearestEdge(area, { x: 1500, y: 500 }), "right");
  assert.strictEqual(edge.nearestEdge(area, { x: 900, y: 200 }), "top");
  assert.strictEqual(edge.nearestEdge(area, { x: 900, y: 900 }), "bottom");
});

test("the handle lies along the edge, centered on the card", () => {
  const L = edge.HANDLE_LENGTH, T = edge.HANDLE_THICKNESS;
  assert.deepStrictEqual(edge.handleRect("left", area, card(6, 300)), { x: 0, y: 400 - L / 2, width: T, height: L });
  assert.deepStrictEqual(edge.handleRect("right", area, card(1614, 300)), { x: 1920 - T, y: 400 - L / 2, width: T, height: L });
  assert.deepStrictEqual(edge.handleRect("top", area, card(700, 6)), { x: 850 - L / 2, y: 0, width: L, height: T });
  assert.deepStrictEqual(edge.handleRect("bottom", area, card(700, 826)), { x: 850 - L / 2, y: 1032 - T, width: L, height: T });
});

test("the handle stays on the screen for a card in a corner", () => {
  const h = edge.handleRect("left", area, card(6, 1000));
  assert.strictEqual(h.y, 1032 - edge.HANDLE_LENGTH);
});

test("pointing near the handle opens the card", () => {
  const b = card(1620, 300); // handle: x 1916–1920, y 370–430
  assert.ok(edge.onHandle("right", area, b, { x: 1918, y: 400 }));
  assert.ok(edge.onHandle("right", area, b, { x: 1911, y: 360 })); // 6 across, 12 along
  assert.ok(!edge.onHandle("right", area, b, { x: 1900, y: 400 }));
  assert.ok(!edge.onHandle("right", area, b, { x: 1918, y: 460 }));
  assert.ok(edge.onHandle("top", area, card(700, 6), { x: 850, y: 2 }));
  assert.ok(!edge.onHandle("top", area, card(700, 6), { x: 1100, y: 2 }));
});

test("an open card stays open while the pointer is on or around it", () => {
  const b = card(100, 100);
  assert.ok(edge.nearCard(b, { x: 200, y: 200 }));
  assert.ok(edge.nearCard(b, { x: 90, y: 90 })); // 14 px around
  assert.ok(!edge.nearCard(b, { x: 80, y: 200 }));
});

test("the menu's edge is the one nearest the card", () => {
  assert.strictEqual(edge.nearestSide(area, card(20, 400)), "left");
  assert.strictEqual(edge.nearestSide(area, card(1600, 400)), "right");
  assert.strictEqual(edge.nearestSide(area, card(800, 10)), "top");
  assert.strictEqual(edge.nearestSide(area, card(800, 820)), "bottom");
});
