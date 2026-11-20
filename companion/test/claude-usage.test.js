"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
require("../../claude-usage.js");
const C = globalThis.UsageMeterClaude;

const prepaid = { amount: 1981, currency: "USD", balance: { money: null, credits: { amount_minor: 1981, exponent: 2 } } };
const extra = (limit) => ({ extra_usage: { is_enabled: true, monthly_limit: limit, used_credits: 7030, currency: "USD" } });

test("extra usage with no monthly limit shows the topped-up balance", () => {
  const c = C.convert(extra(null), "Max", prepaid).credits;
  assert.equal(c.balance, 19.81);
  assert.equal(c.used, 70.3);
  assert.equal(c.unlimited, true);
});

test("a monthly limit caps the balance", () => {
  assert.equal(C.convert(extra(10000), "Max", prepaid).credits.balance, 19.81);
  assert.equal(C.convert(extra(8000), "Max", prepaid).credits.balance, 9.7);
});

test("without the balance request, no limit means no balance", () => {
  assert.equal(C.convert(extra(null), "Max", null).credits.balance, null);
});
