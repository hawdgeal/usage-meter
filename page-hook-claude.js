// Runs in the page's own JS world (MAIN) on claude.ai.
// 1) Fetches plan usage from Claude's internal usage endpoint using your existing session.
// 2) Watches the page's resource timeline so usage refreshes right after a reply finishes.
// Results are posted to content.js (isolated world) via window.postMessage, converted
// into the generic shape the panel draws (rate_limit / additional_rate_limits / credits).
// Nothing leaves your browser: the only requests made go to claude.ai.
(() => {
  if (window.__claudeUsageHooked) return;
  window.__claudeUsageHooked = true;

  const TAG_OUT = "gptu-hook";
  const TAG_IN = "gptu-ui";
  const origFetch = window.fetch.bind(window);

  const post = (type, payload) =>
    window.postMessage({ source: TAG_OUT, type, payload }, location.origin);

  const num = (v) => (typeof v === "number" && isFinite(v) ? v : typeof v === "string" && v.trim() !== "" && isFinite(+v) ? +v : null);

  // ---------- organization ----------
  let org = null; // { id, plan, exp }

  function cookie(name) {
    const hit = document.cookie.split("; ").find((c) => c.startsWith(name + "="));
    return hit ? decodeURIComponent(hit.slice(name.length + 1)) : null;
  }

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

  async function getOrg(force) {
    if (!force && org && Date.now() < org.exp) return org;
    const preferred = cookie("lastActiveOrg");
    let list = null;
    try {
      const r = await origFetch("/api/organizations", { credentials: "include", headers: { Accept: "application/json" } });
      if (r.ok) list = await r.json();
      else if (r.status === 401 || r.status === 403) throw new Error("not signed in");
    } catch (e) {
      if (!preferred) throw e;
    }
    const orgs = Array.isArray(list) ? list : [];
    const chosen =
      orgs.find((o) => o && o.uuid === preferred) ||
      orgs.find((o) => o && Array.isArray(o.capabilities) && o.capabilities.includes("chat")) ||
      orgs[0] || null;
    const id = (chosen && chosen.uuid) || preferred;
    if (!id) throw new Error("not signed in (no organization found)");
    org = { id, plan: planName(chosen), exp: Date.now() + 10 * 60 * 1000 };
    return org;
  }

  async function getJson(path, retry = true) {
    const o = await getOrg(!retry);
    const r = await origFetch(path.replace("{org}", encodeURIComponent(o.id)), {
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    if ((r.status === 401 || r.status === 403 || r.status === 404) && retry) {
      org = null;
      return getJson(path, false);
    }
    if (!r.ok) throw new Error(`${path.replace("{org}", "…")} → HTTP ${r.status}`);
    return r.json();
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

  function convert(raw) {
    const out = { plan_type: org && org.plan, source: "claude.ai" };
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
      out.credits = {
        enabled: e.is_enabled !== false,
        limit,
        used,
        balance: limit != null && used != null ? Math.max(0, limit - used) : null,
        unlimited: e.is_enabled !== false && limit == null,
        currency: typeof e.currency === "string" ? e.currency.toUpperCase() : null,
      };
    }
    return out;
  }

  async function refreshUsage() {
    try {
      const raw = await getJson("/api/organizations/{org}/usage");
      post("usage", { data: convert(raw), raw, plan: org && org.plan, at: Date.now() });
    } catch (e) {
      post("usage-error", { message: String((e && e.message) || e), at: Date.now() });
    }
  }

  // ---------- refresh after replies ----------
  // Watch the browser's resource timeline instead of wrapping window.fetch. Claude's own requests
  // then never pass through this script, so their failures (for example analytics blocked by an ad
  // blocker) are not attributed to the extension. A fetch entry is recorded when its response has
  // fully arrived, so a streamed reply is reported when it finishes, and stopped or failed
  // requests are reported too. Requests made inside Web Workers are not visible here; the panel
  // also refreshes every two minutes and when the tab becomes visible.
  const SPENDS_USAGE = /\/(completion|retry_completion|messages|events)$/;
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.initiatorType !== "fetch") continue;
        let url;
        try { url = new URL(entry.name); } catch (_) { continue; }
        if (url.origin === location.origin && SPENDS_USAGE.test(url.pathname)) post("activity", {});
      }
    }).observe({ type: "resource" });
  } catch (_) { /* no PerformanceObserver: rely on periodic refresh */ }

  window.addEventListener("message", (ev) => {
    if (ev.source !== window || !ev.data || ev.data.source !== TAG_IN) return;
    if (ev.data.type === "refresh") refreshUsage();
    else if (ev.data.type === "reset-details")
      post("reset-details", { flowId: ev.data.payload && ev.data.payload.flowId, error: "Usage resets are not available on Claude." });
  });

  post("ready", {});
})();
