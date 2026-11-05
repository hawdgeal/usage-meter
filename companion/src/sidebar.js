// Finds an app's sidebar in a picture of its window, for docking a card into it.
//
// The sidebar is the column on the left whose edge (a 1-pixel line or a change of background) runs
// down most of the window. Claude: from the left edge; ChatGPT: right of its icon strip. Its footer
// (Claude's divider above your name, ChatGPT's "Getting started" box) is the lowest full-width line
// near the bottom; the card docks just above it, or at the bottom when there is none.
"use strict";

const SAME = 6; // colors closer than this (sum of channel differences) count as the same

const diff = (a, b) => Math.abs((a >> 16) - (b >> 16)) + Math.abs(((a >> 8) & 255) - ((b >> 8) & 255)) + Math.abs((a & 255) - (b & 255));
const hex = (c) => "#" + c.toString(16).padStart(6, "0");

// img: { x, y, w, h, data } from foreground.capture (BGRA rows); frame: the window's visible
// rectangle { x, y, w, h }; scale: the display's scale factor. Returns, in pixels from the frame's
// top-left corner, { left, right, bottom, end, bg, line } (right, bottom and end exclusive; bottom is
// the footer's top, end the sidebar's own bottom; bg and line as
// "#rrggbb"), or null when there is no sidebar (collapsed, or a layout this doesn't recognize).
// prev: the last result for this window. While its edges are still there (even partly covered,
// say by a scrollbar that shows on hover), they are kept, so the card doesn't jump.
function detect(img, frame, scale = 1, prev = null) {
  if (!img || !frame || !img.data) return null;
  const ox = frame.x - img.x, oy = frame.y - img.y;
  const W = Math.min(frame.w, img.w - ox), H = Math.min(frame.h, img.h - oy);
  if (W < 200 || H < 200 || ox < 0 || oy < 0) return null;
  const d = img.data;
  const px = (x, y) => { const i = ((y + oy) * img.w + x + ox) * 4; return (d[i + 2] << 16) | (d[i + 1] << 8) | d[i]; };
  const u = (n) => Math.round(n * scale);

  // Vertical edges: columns where most sample rows change color. The rows are in the upper part of
  // the window: menus open near the bottom (around the card) and would cover the edges there.
  const ys = [];
  for (let y = Math.round(H * 0.1); y < H * 0.65; y += Math.max(2, u(4))) ys.push(y);
  // A 1-pixel line changes color on both of its sides: one edge, at the line.
  const edges = [], strong = new Set();
  let last = -9;
  for (let x = 1; x < W * 0.5; x++) {
    let n = 0;
    for (const y of ys) if (diff(px(x - 1, y), px(x, y)) > SAME) n++;
    if (n < ys.length * 0.75) continue;
    const next = x - last > 1;
    last = x;
    if (!next) continue;
    edges.push(x);
    if (n >= ys.length * 0.9) strong.add(x);
  }
  const near = (x) => edges.find((e) => Math.abs(e - x) <= 2);
  let right = prev && near(prev.right) != null ? prev.right : null;
  if (right == null) {
    let i = edges.findIndex((x) => x >= u(160) && strong.has(x));
    if (i < 0) return null;
    // A scrollbar running down the sidebar is another edge just before the real one.
    while (i + 1 < edges.length && edges[i + 1] - edges[i] <= u(20) && strong.has(edges[i + 1])) i++;
    right = edges[i];
  }
  // The edge's own color, to notice a dialog dimming the window (see main.js).
  const edgeCounts = new Map();
  for (const y of ys) { const c = px(right, y); edgeCounts.set(c, (edgeCounts.get(c) || 0) + 1); }
  const edge = [...edgeCounts].sort((a, b) => b[1] - a[1])[0][0];
  const before = edges.filter((x) => x < right - u(100));
  let left = before.length ? before[before.length - 1] + 1 : 0;
  if (prev && prev.right === right && (prev.left <= 1 ? left <= 1 : near(prev.left - 1) != null)) left = prev.left;

  // Background: the most common color inside the sidebar.
  const counts = new Map();
  let total = 0;
  for (const y of ys) for (let x = left + u(4); x < right - u(4); x += 3) { const c = px(x, y); counts.set(c, (counts.get(c) || 0) + 1); total++; }
  let bg = 0, best = 0;
  for (const [c, n] of counts) if (n > best) { bg = c; best = n; }
  if (best < total * 0.4) return null;
  // Leave the window's border showing: Windows draws it over the window's outer pixel, so it isn't
  // in the picture.
  if (left === 0) left = 1;

  // Footer: going up from the bottom, the first row that is a line across the sidebar starts it;
  // it continues up through its own rows to the last such line before plain background.
  const x0 = left + u(8), x1 = right - u(8);
  const kind = (y) => {
    let off = 0, n = 0;
    for (let x = x0; x < x1; x += 2) { n++; if (diff(px(x, y), bg) > SAME) off++; }
    return off >= n * 0.7 ? "line" : off <= n * 0.02 ? "plain" : "content";
  };
  // Lines touching the very bottom are the window's own bottom edge, not a footer.
  let y = H - 1;
  while (y > H - u(12) && kind(y) === "line") y--;
  const end = y + 1;
  let bottom = end, line = null, seen = false;
  for (; y >= H - u(130); y--) {
    const k = kind(y);
    if (k === "line") { seen = true; bottom = y; if (line == null) line = px(Math.round((x0 + x1) / 2), y); }
    else if (k === "plain" && seen) break;
  }
  return { left, right, bottom, end, edge: hex(edge), bg: hex(bg), line: line == null ? null : hex(line) };
}

// Claude's session rail: the panel on the right of the window (Environment, Context, Outputs…),
// from its edge line to the window's right edge. Same result shape as detect() (side "right"), with
// no footer: the card sits at the rail's bottom. null while the rail is hidden.
function detectRail(img, frame, scale = 1, prev = null) {
  if (!img || !frame || !img.data) return null;
  const ox = frame.x - img.x, oy = frame.y - img.y;
  const W = Math.min(frame.w, img.w - ox), H = Math.min(frame.h, img.h - oy);
  if (W < 400 || H < 200 || ox < 0 || oy < 0) return null;
  const d = img.data;
  const px = (x, y) => { const i = ((y + oy) * img.w + x + ox) * 4; return (d[i + 2] << 16) | (d[i + 1] << 8) | d[i]; };
  const u = (n) => Math.round(n * scale);
  const ys = [];
  for (let y = Math.round(H * 0.1); y < H * 0.65; y += Math.max(2, u(4))) ys.push(y);
  const edges = [], strong = new Set();
  let last = -9;
  for (let x = Math.round(W * 0.5); x < W - 1; x++) {
    let n = 0;
    for (const y of ys) if (diff(px(x - 1, y), px(x, y)) > SAME) n++;
    if (n < ys.length * 0.75) continue;
    const next = x - last > 1;
    last = x;
    if (!next) continue;
    edges.push(x);
    if (n >= ys.length * 0.9) strong.add(x);
  }
  // The rail starts where its edge line ends: the last edge with room for a rail to its right.
  let left = prev && prev.side === "right" && edges.some((e) => Math.abs(e - prev.left) <= 2) ? prev.left : null;
  if (left == null) {
    const fits = edges.filter((x) => strong.has(x) && W - x >= u(200) && W - x <= W * 0.45);
    if (!fits.length) return null;
    left = fits[fits.length - 1];
  }
  const right = W - 1; // the window's border is drawn over its outer pixel
  const counts = new Map();
  let total = 0;
  for (const y of ys) for (let x = left + u(4); x < right - u(4); x += 3) { const c = px(x, y); counts.set(c, (counts.get(c) || 0) + 1); total++; }
  let bg = 0, best = 0;
  for (const [c, n] of counts) if (n > best) { bg = c; best = n; }
  if (best < total * 0.4) return null;
  const edgeCounts = new Map();
  for (const y of ys) { const c = px(left - 1, y); edgeCounts.set(c, (edgeCounts.get(c) || 0) + 1); }
  const edge = [...edgeCounts].sort((a, b) => b[1] - a[1])[0][0];
  // Rows at the very bottom that differ from the rail are the window's own bottom edge.
  let y = H - 1;
  while (y > H - u(12) && diff(px(Math.round((left + right) / 2), y), bg) > SAME) y--;
  const end = y + 1;
  return { side: "right", left, right, bottom: end, end, edge: hex(edge), bg: hex(bg), line: hex(edge) };
}

// Whether a menu of the app covers area { x, y, w, h } (pixels from the frame's top-left corner):
// a menu is a panel (solid, or see-through in ChatGPT), so most of the area isn't the sidebar's
// own color (bg, "#rrggbb"). Chat titles, a selected row and ChatGPT's "Getting started" box leave
// most of it plain (a quarter at most, measured).
function covered(img, frame, bg, area) {
  if (!img || !frame || !area || !img.data) return false;
  const ox = frame.x - img.x, oy = frame.y - img.y, d = img.data;
  const base = parseInt(String(bg).slice(1), 16);
  let total = 0, off = 0;
  for (let y = Math.max(0, area.y); y < Math.min(img.h - oy, area.y + area.h); y += 3) {
    for (let x = Math.max(0, area.x); x < Math.min(img.w - ox, area.x + area.w); x += 3) {
      const i = ((y + oy) * img.w + x + ox) * 4;
      const c = (d[i + 2] << 16) | (d[i + 1] << 8) | d[i];
      total++;
      if (diff(c, base) > SAME) off++;
    }
  }
  return total > 0 && off >= total * 0.5;
}

module.exports = { detect, detectRail, covered };
