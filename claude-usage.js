// Converts claude.ai's usage payload into the generic shape the panel draws
// (rate_limit / additional_rate_limits / credits). Shared by page-hook-claude.js (page world)
// and background.js, which fetches usage for the desktop companion when no Claude tab is open.
(() => {
  if (globalThis.UsageMeterClaude) return;
  const num = (v) => (typeof v === "number" && isFinite(v) ? v : typeof v === "string" && v.trim() !== "" && isFinite(+v) ? +v : null);

  function planName(o) {
    if (!o) return null;
    const caps = Array.isArray(o.capabilities) ? o.capabilities : [];
    const tier = String(o.rate_limit_tier || "").toLowerCase();
    if (caps.includes("claude_max") || tier.includes("max")) {
      if (tier.includes("20x")) return "Max 20x";
      if (tier.includes("5x")) return "Max 5x";
      return "Max";
    }
    if (caps.includes("raven") || tier.includes("raven") || tier.includes("team")) return "Team";
    if (tier.includes("enterprise")) return "Enterprise";
    if (caps.includes("claude_pro") || tier.includes("pro")) return "Pro";
    if (caps.includes("chat")) return "Free";
    return null;
  }

  // ---------- convert Claude's usage payload ----------
  // Claude reports windows like { five_hour: { utilization: 42, resets_at: "ISO" }, seven_day: {...},
  // seven_day_opus: {...}, extra_usage: { is_enabled, monthly_limit, used_credits, ... } }.
  const WINDOW_SECONDS = { five_hour: 5 * 3600, seven_day: 7 * 86400 };
  const NAMES = {
    opus: "Opus",
    sonnet: "Sonnet",
    haiku: "Haiku",
    oauth_apps: "Connected apps",
    cowork: "Cowork",
    claude_code: "Claude Code",
  };
  const prettyName = (key) => NAMES[key] || key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  function toWindow(w, seconds) {
    if (!w || typeof w !== "object") return null;
    const used = num(w.utilization ?? w.used_percent ?? w.percent_used);
    if (used == null) return null;
    const out = { used_percent: used, limit_window_seconds: seconds };
    const at = w.resets_at ?? w.reset_at;
    if (typeof at === "string" && !isNaN(Date.parse(at))) out.reset_at = Math.round(Date.parse(at) / 1000);
    else if (num(at) != null) out.reset_at = num(at) > 1e12 ? Math.round(num(at) / 1000) : num(at);
    return out;
  }

  // Money left on the account (what you topped up), from /api/organizations/{org}/prepaid/credits.
  function prepaidAmount(p) {
    if (!p || typeof p !== "object") return null;
    const c = p.balance && p.balance.credits;
    if (c && num(c.amount_minor) != null) return num(c.amount_minor) / Math.pow(10, num(c.exponent) ?? 2);
    return num(p.amount) == null ? null : num(p.amount) / 100;
  }

  function convert(raw, plan, prepaid) {
    const out = { plan_type: plan || null, source: "claude.ai" };
    if (!raw || typeof raw !== "object") return out;

    const rate = {};
    const primary = toWindow(raw.five_hour, WINDOW_SECONDS.five_hour);
    const secondary = toWindow(raw.seven_day, WINDOW_SECONDS.seven_day);
    if (primary) rate.primary_window = primary;
    if (secondary) rate.secondary_window = secondary;
    if (primary || secondary) out.rate_limit = rate;

    const extra = [];
    for (const [key, value] of Object.entries(raw)) {
      const m = /^(five_hour|seven_day)_(.+)$/.exec(key);
      if (!m) continue;
      const w = toWindow(value, WINDOW_SECONDS[m[1]]);
      if (w) extra.push({ limit_name: prettyName(m[2]), rate_limit: { primary_window: w } });
    }
    if (extra.length) out.additional_rate_limits = extra;

    const e = raw.extra_usage;
    if (e && typeof e === "object") {
      const cents = (v) => (num(v) == null ? null : num(v) / 100);
      const limit = cents(e.monthly_limit ?? e.monthly_credit_limit);
      const used = cents(e.used_credits ?? e.used);
      const left = prepaidAmount(prepaid);
      const money = (v) => (v == null ? null : Math.round(v * 100) / 100);
      out.credits = {
        enabled: e.is_enabled !== false,
        limit,
        used,
        // With a top-up, the money left is that balance (capped by what the monthly limit still allows).
        balance: money(left != null ? (limit != null && used != null ? Math.min(Math.max(0, limit - used), left) : left) : limit != null && used != null ? Math.max(0, limit - used) : null),
        prepaid: left,
        unlimited: e.is_enabled !== false && limit == null,
        currency: typeof e.currency === "string" ? e.currency.toUpperCase() : prepaid && typeof prepaid.currency === "string" ? prepaid.currency.toUpperCase() : null,
      };
    }
    return out;
  }

  globalThis.UsageMeterClaude = Object.freeze({ planName, convert, prepaidAmount });
})();
