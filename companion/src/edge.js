// Docking a floating card on an edge of a screen, the way the Moonlight Switcher's bar does: drag a
// floating card until the pointer comes near an edge and it snaps there; drag a docked card and it
// stays docked, sliding along the edge and moving to whichever edge is nearest the pointer. Docked,
// it sits flush against its edge and, once the pointer leaves it, slides out past the edge (fading,
// so it never shows on a screen next to it) leaving a slim handle; pointing at the handle slides it
// back in. Any edge of any screen works.
"use strict";

const EDGES = ["left", "right", "top", "bottom"];
const SNAP = 24; // the pointer this close to an edge while dragging docks the card there
const GAP = 0; // between an open card and its edge: flush
const HANDLE_LENGTH = 60; // the handle along the edge
const HANDLE_THICKNESS = 4; // and across it
const vertical = (side) => side === "left" || side === "right";

// The edge of area (a screen's work area) the pointer is near, or null. Ties go to the closest.
function sideFor(area, p) {
  if (!p || p.x < area.x - SNAP || p.x >= area.x + area.width + SNAP || p.y < area.y - SNAP || p.y >= area.y + area.height + SNAP) return null;
  const d = { left: p.x - area.x, right: area.x + area.width - 1 - p.x, top: p.y - area.y, bottom: area.y + area.height - 1 - p.y };
  const side = EDGES.reduce((a, b) => (d[b] < d[a] ? b : a));
  return d[side] <= SNAP ? side : null;
}

// The edge of area nearest a point, however far (dragging a docked card).
function nearestEdge(area, p) {
  const d = { left: p.x - area.x, right: area.x + area.width - 1 - p.x, top: p.y - area.y, bottom: area.y + area.height - 1 - p.y };
  return EDGES.reduce((a, b) => (d[b] < d[a] ? b : a));
}

// The edge nearest a card's middle ("Hide at the screen edge" from its menu).
function nearestSide(area, b) {
  const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
  const d = { left: cx - area.x, right: area.x + area.width - cx, top: cy - area.y, bottom: area.y + area.height - cy };
  return EDGES.reduce((a, s) => (d[s] < d[a] ? s : a));
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(v, hi));

// Where an open card sits on its edge: GAP away from it, at its place along it (kept on the screen).
function shownPos(side, area, b) {
  if (side === "left") return { x: area.x + GAP, y: clamp(b.y, area.y, area.y + area.height - b.height) };
  if (side === "right") return { x: area.x + area.width - b.width - GAP, y: clamp(b.y, area.y, area.y + area.height - b.height) };
  if (side === "top") return { x: clamp(b.x, area.x, area.x + area.width - b.width), y: area.y + GAP };
  return { x: clamp(b.x, area.x, area.x + area.width - b.width), y: area.y + area.height - b.height - GAP };
}

// Where it ends up as it tucks away: just past its edge (it fades out on the way).
function hiddenPos(side, area, b) {
  const p = shownPos(side, area, b);
  if (side === "left") p.x = area.x - b.width;
  else if (side === "right") p.x = area.x + area.width;
  else if (side === "top") p.y = area.y - b.height;
  else p.y = area.y + area.height;
  return p;
}

// A tucked-away card's handle: on its edge, centered on the card, kept inside the work area.
function handleRect(side, area, b) {
  if (vertical(side)) {
    const len = HANDLE_LENGTH;
    const y = clamp(Math.round(b.y + (b.height - len) / 2), area.y, area.y + area.height - len);
    return { x: side === "left" ? area.x : area.x + area.width - HANDLE_THICKNESS, y, width: HANDLE_THICKNESS, height: len };
  }
  const len = HANDLE_LENGTH;
  const x = clamp(Math.round(b.x + (b.width - len) / 2), area.x, area.x + area.width - len);
  return { x, y: side === "top" ? area.y : area.y + area.height - HANDLE_THICKNESS, width: len, height: HANDLE_THICKNESS };
}

// Whether the pointer is near a handle: 6 px across it, 12 px along it (as in the Moonlight bar),
// and up to the screen's edge.
function onHandle(side, area, b, p) {
  const h = handleRect(side, area, b);
  const across = 6, along = 12;
  const z = vertical(side)
    ? { x: h.x - across, y: h.y - along, width: h.width + 2 * across, height: h.height + 2 * along }
    : { x: h.x - along, y: h.y - across, width: h.width + 2 * along, height: h.height + 2 * across };
  return inside(p, z);
}

// Whether the pointer is on or around an open card (14 px around it, as in the Moonlight bar).
function nearCard(b, p) {
  return inside(p, { x: b.x - 14, y: b.y - 14, width: b.width + 28, height: b.height + 28 });
}

const inside = (p, r) => p.x >= r.x && p.x < r.x + r.width && p.y >= r.y && p.y < r.y + r.height;

module.exports = { EDGES, SNAP, GAP, HANDLE_LENGTH, HANDLE_THICKNESS, vertical, sideFor, nearestEdge, nearestSide, shownPos, hiddenPos, handleRect, onHandle, nearCard };
