// Draws the tray icon: a ring whose colored arc is the share of the limit still left
// (or used, if that's what you chose to show), in the app's color. Red when 10% or less is left.
// Returns raw BGRA pixels for Electron's nativeImage.createFromBitmap.
"use strict";

function hex(c) {
  const m = /^#?([0-9a-f]{6})$/i.exec(c || "");
  const n = m ? parseInt(m[1], 16) : 0x888888;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// fraction: 0..1 of the ring to color, or null for "no data" (grey track only).
function ringBitmap(size, fraction, color, opts) {
  const o = opts || {};
  const buf = Buffer.alloc(size * size * 4);
  const [r, g, b] = hex(color);
  const [tr, tg, tb] = hex(o.track || "#8a8a8a");
  const trackAlpha = o.trackAlpha ?? 0.45;
  const c = size / 2, outer = size / 2 - size / 32, inner = outer - Math.max(2.5, size * 0.2);
  const SS = 4; // 4×4 supersampling for smooth edges
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let on = 0, track = 0;
      for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
        const px = x + (sx + 0.5) / SS - c, py = y + (sy + 0.5) / SS - c;
        const d = Math.hypot(px, py);
        if (d > outer || d < inner) continue;
        // angle clockwise from 12 o'clock, 0..1
        const a = (Math.atan2(px, -py) / (2 * Math.PI) + 1) % 1;
        if (fraction != null && a <= fraction) on++; else track++;
      }
      const ao = on / (SS * SS), at = (track / (SS * SS)) * trackAlpha;
      const alpha = ao + at * (1 - ao);
      if (!alpha) continue;
      const mix = (cv, tv) => Math.round((cv * ao + tv * at * (1 - ao)) / alpha);
      const i = (y * size + x) * 4;
      buf[i] = mix(b, tb); buf[i + 1] = mix(g, tg); buf[i + 2] = mix(r, tr); buf[i + 3] = Math.round(alpha * 255);
    }
  }
  return buf;
}

function trayColor(view, show) {
  if (!view.head) return view.color;
  return view.head.left <= 10 ? "#E5484D" : view.color;
}

function trayFraction(view, show) {
  if (!view.head) return null;
  return (show === "used" ? view.head.used : view.head.left) / 100;
}

module.exports = { ringBitmap, trayColor, trayFraction };
