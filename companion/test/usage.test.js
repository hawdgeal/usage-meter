"use strict";
const test = require("node:test");
const assert = require("node:assert");
const V = require("../src/usage");
const F = require("./fixtures");

test("Claude view: limits, headline, model limits and extra usage", () => {
  const v = V.build("claude", { data: F.claude, at: F.now, browser: "Chrome" });
  assert.strictEqual(v.name, "Claude");
  assert.strictEqual(v.plan, "Max 5x");
  assert.deepStrictEqual(v.rows.map((r) => r.label), ["5-hour", "Weekly", "Opus · Weekly"]);
  assert.strictEqual(v.head.label, "Weekly"); // main limit closest to running out; model limits don't drive it
  assert.strictEqual(v.head.left, 19);
  assert.match(v.credits.text, /37[.,]50.*50[.,]00/);
  assert.match(V.resetText(v.rows[0].resetsAt, F.now), /Resets in 2h 14m/);
});

test("model limits can be hidden", () => {
  const v = V.build("claude", { data: F.claude, at: F.now }, { showModels: false });
  assert.deepStrictEqual(v.rows.map((r) => r.label), ["5-hour", "Weekly"]);
});

test("ChatGPT and Codex share ChatGPT's data; relative resets use the report time", () => {
  for (const id of ["chatgpt", "codex"]) {
    const v = V.build(id, { data: F.chatgpt, at: F.now });
    assert.strictEqual(v.site, "chatgpt");
    assert.strictEqual(v.rows[0].resetsAt, F.now + 3600 * 1000);
    assert.strictEqual(v.credits.text, "12.5 credits");
  }
  assert.strictEqual(V.build("codex", {}).name, "Codex");
});

test("errors newer than the data are shown; older ones aren't", () => {
  assert.strictEqual(V.build("claude", { data: F.claude, at: 10, error: "Not signed in", errorAt: 20 }).error, "Not signed in");
  assert.strictEqual(V.build("claude", { data: F.claude, at: 30, error: "Not signed in", errorAt: 20 }).error, null);
});

test("tooltip is short and readable", () => {
  const t = V.tooltip(V.build("claude", { data: F.claude, at: F.now }), { now: F.now });
  assert.match(t, /^Claude Max 5x · Weekly: 19% left · resets in 3d/);
  assert.ok(t.length <= 127);
  assert.strictEqual(V.tooltip(V.build("chatgpt", null)), "ChatGPT · Waiting for usage");
  assert.match(V.tooltip(V.build("claude", { data: F.claude, at: F.now }), { show: "used" }), /81% used/);
});

test("odd payloads don't throw", () => {
  for (const data of [null, {}, { rate_limit: "x" }, { additional_rate_limits: [null, 1] }, { credits: { enabled: false } }]) {
    const v = V.build("chatgpt", { data });
    assert.ok(Array.isArray(v.rows));
  }
});
