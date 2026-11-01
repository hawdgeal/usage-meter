// Turns the usage payload forwarded by the extension (the same generic shape the extension's
// panel draws) into a small view model for the tray, popup and mini panel.
// Loaded by the main process (require) and by the renderer (<script>, as window.UsageView).
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.UsageView = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const APPS = {
    claude: { id: "claude", site: "claude", name: "Claude", color: "#D97757", host: "claude.ai" },
    chatgpt: { id: "chatgpt", site: "chatgpt", name: "ChatGPT", color: "#10A37F", host: "chatgpt.com" },
    codex: { id: "codex", site: "chatgpt", name: "Codex", color: "#10A37F", host: "chatgpt.com" },
  };

  const num = (v) => (typeof v === "number" && isFinite(v) ? v : typeof v === "string" && v.trim() !== "" && isFinite(+v) ? +v : null);

  function windowLabel(sec, fallback) {
    sec = num(sec);
    if (!sec) return fallback;
    const h = sec / 3600;
    if (Math.abs(h - 168) < 1) return "Weekly";
    if (Math.abs(h - 24) < 0.5) return "Daily";
    if (h < 48) return `${+h.toFixed(h < 10 ? 1 : 0)}-hour`;
    return `${Math.round(h / 24)}-day`;
  }

  function resetTime(w, at) {
    const r = num(w.reset_at ?? w.resets_at);
    if (r) return r > 1e12 ? r : r * 1000;
    if (typeof w.resets_at === "string" && !isNaN(Date.parse(w.resets_at))) return Date.parse(w.resets_at);
    const after = num(w.reset_after_seconds ?? w.resets_in_seconds ?? w.reset_after);
    return after != null && at ? at + after * 1000 : null;
  }

  function rowsOf(u, at) {
    const rows = [];
    const add = (rl, prefix, main) => {
      if (!rl || typeof rl !== "object") return;
      const pairs = [[rl.primary_window || rl.primary, "Short window"], [rl.secondary_window || rl.secondary, "Long window"]];
      for (const [w, fb] of pairs) {
        if (!w || typeof w !== "object") continue;
        const p = num(w.used_percent ?? w.usedPercent ?? w.percent_used);
        const label = windowLabel(w.limit_window_seconds ?? w.window_seconds ?? (num(w.window_minutes) && w.window_minutes * 60), fb);
        const used = p == null ? null : Math.max(0, Math.min(100, p));
        rows.push({ label: prefix ? `${prefix} · ${label}` : label, used, left: used == null ? null : 100 - used, resetsAt: resetTime(w, at), reached: used != null ? used >= 100 : !!rl.limit_reached, main });
      }
    };
    add(u.rate_limit || u.rate_limits, "", true);
    const extra = u.additional_rate_limits || u.additional_limits || [];
    if (Array.isArray(extra)) for (const x of extra) add(x && (x.rate_limit || x), x && (x.limit_name || x.name || x.metered_feature || "Other"), false);
    return rows;
  }

  function money(v, currency) {
    if (v == null) return null;
    try { if (currency) return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(v); } catch (_) {}
    return (+v.toFixed(2)).toString();
  }

  function creditsOf(u, site) {
    const c = u.credits;
    if (!c || typeof c !== "object" || c.enabled === false) return null;
    if (site === "claude") {
      const limit = num(c.limit), balance = num(c.balance), cur = typeof c.currency === "string" ? c.currency : null;
      if (c.unlimited) return { label: "Extra usage", text: "On", short: "Extra usage on", pct: null };
      if (!limit) return null;
      return { label: "Extra usage", text: `${money(balance, cur)} left of ${money(limit, cur)}`, short: `${money(balance, cur)} extra`, pct: balance == null ? null : Math.max(0, Math.min(100, (balance / limit) * 100)) };
    }
    if (c.unlimited) return { label: "Credits", text: "Unlimited", short: "Unlimited credits", pct: null };
    const bal = num(c.balance);
    if (!bal) return null;
    const t = `${+bal.toFixed(2)} credits`;
    return { label: "Credits", text: t, short: t, pct: null };
  }

  // entry: { data, plan, at, error, errorAt, browser } as stored by the main process.
  function build(appId, entry, opts) {
    const app = APPS[appId] || APPS.claude;
    const o = opts || {};
    const e = entry || {};
    const u = e.data && typeof e.data === "object" ? e.data : null;
    const rows = u ? rowsOf(u, e.at) : [];
    const shown = rows.filter((r) => r.main || o.showModels !== false);
    // The limit closest to running out drives the tray ring and the headline.
    const main = rows.filter((r) => r.main && r.used != null);
    const head = (main.length ? main : rows.filter((r) => r.used != null)).reduce((a, r) => (!a || r.used > a.used ? r : a), null);
    const credits = u ? creditsOf(u, app.site) : null;
    const errorIsNewer = e.error && (!e.at || (e.errorAt || 0) >= e.at);
    return {
      app: app.id, site: app.site, name: app.name, color: app.color, host: app.host,
      plan: (u && u.plan_type) || e.plan || null,
      rows: shown, head, credits,
      at: e.at || null, browser: e.browser || null,
      error: errorIsNewer ? e.error : null,
      hasData: !!u,
    };
  }

  function duration(ms) {
    const m = Math.max(0, Math.round(ms / 60000));
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60), r = m % 60;
    if (h < 24) return r ? `${h}h ${r}m` : `${h}h`;
    const d = Math.floor(h / 24), hh = h % 24;
    return hh ? `${d}d ${hh}h` : `${d}d`;
  }

  function resetText(ts, now) {
    if (!ts) return "";
    const diff = ts - (now || Date.now());
    if (diff <= 0) return "Resetting";
    return `Resets in ${duration(diff)}`;
  }

  function agoText(ts, now) {
    if (!ts) return "";
    const s = Math.round(((now || Date.now()) - ts) / 1000);
    if (s < 60) return "Just now";
    if (s < 3600) return `${Math.floor(s / 60)} min ago`;
    if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
    return new Date(ts).toLocaleDateString();
  }

  // One line for the tray tooltip (Windows limits it to 127 characters).
  function tooltip(v, opts) {
    const remaining = !opts || opts.show !== "used";
    const parts = [v.plan ? `${v.name} ${v.plan}` : v.name];
    if (v.head) parts.push(`${v.head.label}: ${remaining ? `${Math.round(v.head.left)}% left` : `${Math.round(v.head.used)}% used`}`);
    else if (v.error) parts.push(v.error);
    else parts.push(v.hasData ? "No limits reported" : "Waiting for usage");
    if (v.head && v.head.resetsAt) parts.push(resetText(v.head.resetsAt, opts && opts.now).toLowerCase());
    if (v.credits && v.credits.short) parts.push(v.credits.short);
    const s = parts.join(" · ");
    return s.length > 127 ? s.slice(0, 126) + "…" : s;
  }

  return { APPS, build, resetText, agoText, tooltip, windowLabel };
});
