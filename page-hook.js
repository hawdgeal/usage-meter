// Runs in the page's own JS world (MAIN) on claude.ai.
// 1) Fetches plan usage from Claude's internal usage endpoint using your existing session.
// 2) Watches Claude's own requests so usage refreshes right after you send a message.
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

  // ---------- passive scan for extra limits in Claude's own JSON ----------
  const LIMIT_KEYS = ["limits_progress", "model_limits", "message_limits", "usage_limits"];

  function normalizeLimit(item) {
    if (!item || typeof item !== "object") return null;
    const name = item.feature_name || item.model_slug || item.model || item.slug || item.name || item.feature || item.limit_name;
    if (!name) return null;
    const remaining = num(item.remaining ?? item.remaining_messages ?? item.messages_remaining);
    const limit = num(item.limit ?? item.max ?? item.cap ?? item.total);
    const used = num(item.used ?? item.count ?? item.usage);
    let resetsAt = null;
    const ra = item.reset_after ?? item.resets_at ?? item.reset_at ?? item.resetsAt ?? item.reset_time;
    if (typeof ra === "string" && isNaN(+ra)) {
      const t = Date.parse(ra);
      if (!isNaN(t)) resetsAt = t;
    } else if (num(ra) != null) {
      const n = num(ra);
      resetsAt = n > 1e12 ? n : n > 1e9 ? n * 1000 : Date.now() + n * 1000;
    }
    if (remaining == null && limit == null && used == null && resetsAt == null) return null;
    return { name: String(name), remaining, limit, used, resetsAt };
  }

  function scan(obj, found, depth) {
    if (!obj || typeof obj !== "object" || depth > 6) return;
    if (Array.isArray(obj)) {
      for (const v of obj.slice(0, 200)) scan(v, found, depth + 1);
      return;
    }
    for (const k of Object.keys(obj)) {
      const v = obj[k];
      if (LIMIT_KEYS.includes(k)) {
        const arr = Array.isArray(v) ? v : v && typeof v === "object"
          ? Object.entries(v).map(([n, x]) => (x && typeof x === "object" ? { name: n, ...x } : null))
          : [];
        for (const it of arr) {
          const n = normalizeLimit(it);
          if (n) found.push(n);
        }
      } else if (v && typeof v === "object") {
        scan(v, found, depth + 1);
      }
    }
  }

  // Requests that spend usage: chat completions on claude.ai and session turns on claude.ai/code.
  const SPENDS_USAGE = /\/(completion|retry_completion|messages|events)(\?|$)/;

  window.fetch = async function (input, init) {
    const res = await origFetch(input, init);
    try {
      const url = input instanceof Request ? input.url : String(input || "");
      const method = ((init && init.method) || (input && input.method) || "GET").toUpperCase();
      const sameOrigin = url.startsWith("/") || url.startsWith(location.origin);
      if (sameOrigin && method === "POST" && SPENDS_USAGE.test(url)) {
        const ct = res.headers.get("content-type") || "";
        if (ct.includes("text/event-stream") && res.body) {
          // Refresh once the reply has finished streaming, when the new usage is recorded.
          res.clone().text().then(() => post("activity", {}), () => post("activity", {}));
        } else {
          post("activity", {});
        }
      } else if (sameOrigin && url.includes("/api/") && !/\/usage(\?|$)/.test(url)) {
        const ct = res.headers.get("content-type") || "";
        if (ct.includes("application/json")) {
          res.clone().json().then((j) => {
            const found = [];
            scan(j, found, 0);
            if (found.length) post("model-limits", { items: found, from: url.split("?")[0], at: Date.now() });
          }).catch(() => {});
        }
      }
    } catch (_) { /* never break the page */ }
    return res;
  };

  window.addEventListener("message", (ev) => {
    if (ev.source !== window || !ev.data || ev.data.source !== TAG_IN) return;
    if (ev.data.type === "refresh") refreshUsage();
    else if (ev.data.type === "reset-details")
      post("reset-details", { flowId: ev.data.payload && ev.data.payload.flowId, error: "Usage resets are not available on Claude." });
  });

  post("ready", {});
})();
