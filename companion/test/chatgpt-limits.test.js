"use strict";
const test = require("node:test");
const assert = require("node:assert");
require("../../chatgpt-limits.js");
const L = globalThis.UsageMeterChatGPTLimits;

test("reads ChatGPT's per-feature limits from conversation/init", () => {
  const items = L.fromInit({ limits_progress: [
    { feature_name: "image_gen", remaining: 117, reset_after: "2026-11-19T00:59:22+00:00" },
    { feature_name: "deep_research", remaining: 25, reset_after: "2026-12-18T00:59:22+00:00" },
    { remaining: 3 },
  ], model_limits: [] });
  assert.deepStrictEqual(items.map((i) => [i.name, i.remaining]), [["image_gen", 117], ["deep_research", 25]]);
  assert.strictEqual(items[0].resetsAt, Date.parse("2026-11-19T00:59:22+00:00"));
});

test("keeps the most left seen since the last reset as the total", () => {
  const t0 = Date.parse("2026-11-18T01:00:00Z"), reset = Date.parse("2026-11-19T01:00:00Z");
  let m = L.merge({}, [{ name: "image_gen", remaining: 120, resetsAt: reset }], t0);
  m = L.merge(m, [{ name: "image_gen", remaining: 117, resetsAt: reset }], t0 + 60000);
  assert.strictEqual(m.image_gen.remaining, 117);
  assert.strictEqual(m.image_gen.peak, 120);
  // After the reset, the count starts again.
  m = L.merge(m, [{ name: "image_gen", remaining: 119, resetsAt: reset + 86400000 }], reset + 1000);
  assert.strictEqual(m.image_gen.peak, 119);
});
