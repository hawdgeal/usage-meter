// Isolated-world content script: draws the usage card inside ChatGPT's left sidebar.
(() => {
  const TAG_IN = "gptu-hook";
  const TAG_OUT = "gptu-ui";
  const AUTO_REFRESH_MS = 2 * 60 * 1000;
  const MIN_GAP_MS = 15 * 1000;
  const store = (globalThis.browser && browser.storage) || chrome.storage;

  const state = {
    usage: null,        // raw /wham/usage JSON
    plan: null,
    usageAt: 0,
    error: null,
    models: {},         // name -> {remaining, limit, used, resetsAt, seenAt}
    collapsed: false,
    position: "bottom", // "top" | "bottom" inside the sidebar
    showRaw: false,
  };
  let lastRefresh = 0;

  // ---------- persistence ----------
  const saveKeys = ["usage", "plan", "usageAt", "models", "collapsed", "position"];
  function persist() {
    const o = {};
    for (const k of saveKeys) o[k] = state[k];
    try { store.local.set({ gptu: o }); } catch (_) {}
  }
  function load() {
    return new Promise((resolve) => {
      try {
        store.local.get("gptu", (r) => {
          if (r && r.gptu) Object.assign(state, r.gptu);
          resolve();
        });
      } catch (_) { resolve(); }
    });
  }

  // ---------- helpers ----------
  const num = (v) => (typeof v === "number" && isFinite(v) ? v : typeof v === "string" && v !== "" && isFinite(+v) ? +v : null);

  function fmtDur(ms) {
    if (ms == null) return "";
    if (ms <= 0) return "now";
    const m = Math.round(ms / 60000);
    if (m < 60) return `${Math.max(m, 1)}m`;
    const h = Math.floor(m / 60), mm = m % 60;
    if (h < 48) return mm ? `${h}h ${mm}m` : `${h}h`;
    const d = Math.floor(h / 24), hh = h % 24;
    return hh ? `${d}d ${hh}h` : `${d}d`;
  }
  function fmtAgo(t) {
    if (!t) return "never";
    const s = Math.round((Date.now() - t) / 1000);
    if (s < 45) return "just now";
    return `${fmtDur(Date.now() - t)} ago`;
  }
  function windowLabel(sec, fallback) {
    sec = num(sec);
    if (!sec) return fallback;
    const h = sec / 3600;
    if (Math.abs(h - 168) < 1) return "Weekly";
    if (Math.abs(h - 24) < 0.5) return "Daily";
    if (h < 48) return `${+h.toFixed(h < 10 ? 1 : 0)}-hour`;
    return `${Math.round(h / 24)}-day`;
  }
  function resetTime(w) {
    const at = num(w.reset_at ?? w.resets_at);
    if (at) return at > 1e12 ? at : at * 1000;
    const after = num(w.reset_after_seconds ?? w.resets_in_seconds ?? w.reset_after);
    if (after != null) return state.usageAt + after * 1000;
    return null;
  }

  // Turn the usage payload into rows the UI can draw. Defensive: the endpoint is undocumented.
  function parseUsage(u) {
    const rows = [];
    if (!u || typeof u !== "object") return { rows, credits: null };
    const addWindows = (rl, prefix) => {
      if (!rl || typeof rl !== "object") return;
      const pairs = [
        [rl.primary_window || rl.primary, "Short window"],
        [rl.secondary_window || rl.secondary, "Long window"],
      ];
      for (const [w, fb] of pairs) {
        if (!w || typeof w !== "object") continue;
        const pct = num(w.used_percent ?? w.usedPercent ?? w.percent_used);
        const label = windowLabel(w.limit_window_seconds ?? w.window_seconds ?? (num(w.window_minutes) && w.window_minutes * 60), fb);
        rows.push({
          label: prefix ? `${prefix} · ${label}` : label,
          pct: pct == null ? null : Math.max(0, Math.min(100, pct)),
          resetsAt: resetTime(w),
          reached: !!(rl.limit_reached || (pct != null && pct >= 100)),
        });
      }
    };
    addWindows(u.rate_limit || u.rate_limits, "");
    const extra = u.additional_rate_limits || u.additional_limits || [];
    if (Array.isArray(extra)) {
      for (const x of extra) addWindows(x && (x.rate_limit || x), x && (x.limit_name || x.name || x.metered_feature || "Other"));
    }
    let credits = null;
    const c = u.credits;
    if (c && typeof c === "object") {
      if (c.unlimited) credits = "Unlimited";
      else if (c.has_credits || num(c.balance)) credits = `${num(c.balance) ?? c.balance}`;
      else credits = "0";
    }
    return { rows, credits, plan: u.plan_type || state.plan };
  }

  // ---------- messaging with page-hook ----------
  function requestRefresh(force) {
    if (!force && Date.now() - lastRefresh < MIN_GAP_MS) return;
    lastRefresh = Date.now();
    ui.setBusy(true);
    window.postMessage({ source: TAG_OUT, type: "refresh" }, location.origin);
  }

  window.addEventListener("message", (ev) => {
    if (ev.source !== window || !ev.data || ev.data.source !== TAG_IN) return;
    const { type, payload } = ev.data;
    if (type === "ready") requestRefresh(true);
    else if (type === "usage") {
      state.usage = payload.data;
      state.plan = payload.plan || state.plan;
      state.usageAt = payload.at;
      state.error = null;
      persist(); ui.setBusy(false); render();
    } else if (type === "usage-error") {
      state.error = payload.message;
      ui.setBusy(false); render();
    } else if (type === "model-limits") {
      for (const it of payload.items) state.models[it.name] = { ...it, seenAt: payload.at };
      persist(); render();
    } else if (type === "activity") {
      setTimeout(() => requestRefresh(false), 4000);
    }
  });

  // ---------- UI ----------
  const CSS = `
  :host { all: initial; display:block; }
  .card {
    --fg: var(--text-primary, #0d0d0d);
    --muted: var(--text-tertiary, #8f8f8f);
    --line: var(--border-light, rgba(0,0,0,.08));
    --surf: var(--main-surface-tertiary, rgba(0,0,0,.035));
    --track: rgba(127,127,127,.18);
    --ok: #10a37f; --warn: #d4a017; --bad: #e5484d;
    font: 13px/1.35 ui-sans-serif, -apple-system, system-ui, "Segoe UI", sans-serif;
    color: var(--fg);
    margin: 6px 6px 8px; padding: 10px 10px 8px;
    border-radius: 12px; background: var(--surf); border: 1px solid var(--line);
  }
  .card.floating { position: fixed; left: 12px; bottom: 12px; width: 240px; z-index: 2147483000;
    background: var(--main-surface-primary, #fff); box-shadow: 0 6px 24px rgba(0,0,0,.18); margin:0; }
  :host([data-dark]) .card.floating { background: var(--main-surface-primary, #212121); }
  :host([data-dark]) .card { --fg: var(--text-primary, #ececec); --muted: var(--text-tertiary, #9b9b9b);
    --line: var(--border-light, rgba(255,255,255,.08)); --surf: var(--main-surface-tertiary, rgba(255,255,255,.04)); }
  .head { display:flex; align-items:center; gap:6px; cursor:pointer; user-select:none; }
  .title { font-weight:600; font-size:13px; }
  .badge { font-size:10.5px; font-weight:600; text-transform:uppercase; letter-spacing:.04em;
    padding:1px 6px; border-radius:6px; background: var(--track); color: var(--fg); }
  .sp { flex:1; }
  button { all:unset; cursor:pointer; width:22px; height:22px; display:grid; place-items:center;
    border-radius:6px; color: var(--muted); }
  button:hover { background: var(--track); color: var(--fg); }
  button:focus-visible { outline: 2px solid var(--ok); }
  svg { width:14px; height:14px; }
  .busy svg.r { animation: spin .8s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .chev { transition: transform .15s; }
  .collapsed .chev { transform: rotate(-90deg); }
  .collapsed .body { display:none; }
  .mini { display:none; white-space:nowrap; font-variant-numeric: tabular-nums; color: var(--muted); font-size:12px; }
  .collapsed .mini { display:block; }
  .sec { margin-top:10px; }
  .sec h4 { margin:0 0 6px; font-size:10.5px; font-weight:600; letter-spacing:.05em; text-transform:uppercase; color: var(--muted); }
  .row { margin: 0 0 8px; }
  .rl { display:flex; justify-content:space-between; gap:8px; font-size:12.5px; }
  .rl .v { font-variant-numeric: tabular-nums; font-weight:600; }
  .bar { height:5px; border-radius:3px; background: var(--track); margin-top:4px; overflow:hidden; }
  .bar i { display:block; height:100%; border-radius:3px; background: var(--ok); }
  .bar i.warn { background: var(--warn); } .bar i.bad { background: var(--bad); }
  .sub { font-size:11.5px; color: var(--muted); margin-top:2px; }
  .kv { display:flex; justify-content:space-between; font-size:12.5px; padding:2px 0; }
  .kv .v { font-variant-numeric: tabular-nums; font-weight:600; }
  .empty { font-size:12px; color: var(--muted); }
  .err { font-size:12px; color: var(--bad); margin-top:8px; word-break: break-word; }
  .foot { display:flex; align-items:center; gap:6px; margin-top:8px; padding-top:6px; border-top:1px solid var(--line);
    font-size:11px; color: var(--muted); }
  .foot a { color: var(--muted); cursor:pointer; text-decoration: underline dotted; }
  pre { max-height:180px; overflow:auto; font: 10.5px/1.3 ui-monospace, Menlo, monospace; background: var(--track);
    padding:6px; border-radius:6px; white-space:pre-wrap; word-break:break-all; margin:6px 0 0; }
  `;
  const ICON_R = `<svg class="r" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v6h-6"/></svg>`;
  const ICON_C = `<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>`;
  const ICON_POS = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"/><path d="m8 9 4-4 4 4"/><path d="m8 15 4 4 4-4"/></svg>`;

  const host = document.createElement("div");
  host.id = "gptu-usage-host";
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = `<style>${CSS}</style>
    <div class="card" part="card">
      <div class="head" role="button" tabindex="0" aria-expanded="true">
        ${ICON_C}<span class="title">Usage</span><span class="badge" hidden></span>
        <span class="mini"></span><span class="sp"></span>
        <button class="pos" title="Move to top/bottom of sidebar" aria-label="Move card">${ICON_POS}</button>
        <button class="refresh" title="Refresh" aria-label="Refresh usage">${ICON_R}</button>
      </div>
      <div class="body"></div>
    </div>`;
  const $ = (s) => root.querySelector(s);
  const card = $(".card");

  const ui = {
    setBusy(b) { card.classList.toggle("busy", b); },
  };

  $(".head").addEventListener("click", (e) => {
    if (e.target.closest("button")) return;
    state.collapsed = !state.collapsed; persist(); render();
  });
  $(".head").addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); state.collapsed = !state.collapsed; persist(); render(); }
  });
  $(".refresh").addEventListener("click", () => requestRefresh(true));
  $(".pos").addEventListener("click", () => {
    state.position = state.position === "top" ? "bottom" : "top"; persist(); place(true);
  });

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const level = (p) => (p >= 90 ? "bad" : p >= 75 ? "warn" : "");

  function render() {
    host.toggleAttribute("data-dark", document.documentElement.classList.contains("dark"));
    card.classList.toggle("collapsed", !!state.collapsed);
    $(".head").setAttribute("aria-expanded", String(!state.collapsed));
    const parsed = parseUsage(state.usage);
    const badge = $(".badge");
    const plan = parsed.plan || state.plan;
    badge.hidden = !plan; badge.textContent = plan || "";

    // collapsed summary: highest usage %
    const pcts = parsed.rows.map((r) => r.pct).filter((p) => p != null);
    $(".mini").textContent = pcts.length ? `${Math.round(Math.max(...pcts))}% used` : "";

    let h = "";
    h += `<div class="sec"><h4>Plan limits</h4>`;
    if (parsed.rows.length) {
      for (const r of parsed.rows) {
        const p = r.pct;
        const left = r.resetsAt ? r.resetsAt - Date.now() : null;
        h += `<div class="row"><div class="rl"><span>${esc(r.label)}</span><span class="v">${p == null ? "—" : Math.round(p) + "%"}</span></div>
          <div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${p ?? 0}"><i class="${level(p ?? 0)}" style="width:${p ?? 0}%"></i></div>
          <div class="sub">${r.reached ? "Limit reached · " : ""}${left != null ? (left > 0 ? `Resets in ${fmtDur(left)}` : "Reset — refresh to update") : ""}</div></div>`;
      }
    } else {
      h += `<div class="empty">${state.error ? "Couldn't load plan usage." : state.usageAt ? "No rate-limit windows reported for this plan." : "Loading…"}</div>`;
    }
    if (parsed.credits != null) h += `<div class="kv"><span>Credits</span><span class="v">${esc(parsed.credits)}</span></div>`;
    h += `</div>`;

    const models = Object.entries(state.models)
      .sort((a, b) => (b[1].seenAt || 0) - (a[1].seenAt || 0)).slice(0, 12);
    h += `<div class="sec"><h4>Model &amp; feature limits</h4>`;
    if (models.length) {
      for (const [name, m] of models) {
        const left = m.resetsAt ? m.resetsAt - Date.now() : null;
        const expired = left != null && left <= 0;
        let val = "—";
        if (expired) val = "reset";
        else if (m.remaining != null && m.limit != null) val = `${m.remaining} / ${m.limit} left`;
        else if (m.remaining != null) val = `${m.remaining} left`;
        else if (m.used != null && m.limit != null) val = `${m.used} / ${m.limit} used`;
        h += `<div class="row"><div class="rl"><span>${esc(name.replace(/_/g, " "))}</span><span class="v">${esc(val)}</span></div>`;
        if (!expired && m.remaining != null && m.limit) {
          const usedP = 100 - (m.remaining / m.limit) * 100;
          h += `<div class="bar"><i class="${level(usedP)}" style="width:${Math.max(0, Math.min(100, usedP))}%"></i></div>`;
        }
        h += `<div class="sub">${left != null && left > 0 ? `Resets in ${fmtDur(left)} · ` : ""}seen ${fmtAgo(m.seenAt)}</div></div>`;
      }
    } else {
      h += `<div class="empty">None reported yet. ChatGPT only sends these once you get close to a limit — they'll appear here automatically.</div>`;
    }
    h += `</div>`;

    if (state.error) h += `<div class="err">${esc(state.error)}</div>`;
    h += `<div class="foot"><span>Updated ${fmtAgo(state.usageAt)}</span><span class="sp"></span><a class="raw">${state.showRaw ? "hide" : "raw"}</a></div>`;
    if (state.showRaw) h += `<pre>${esc(JSON.stringify({ usage: state.usage, models: state.models }, null, 2))}</pre>`;

    $(".body").innerHTML = h;
    const raw = $(".raw");
    if (raw) raw.addEventListener("click", () => { state.showRaw = !state.showRaw; render(); });
  }

  // ---------- placement inside ChatGPT's sidebar ----------
  function findSidebarNav() {
    const cands = [
      "#stage-slideover-sidebar nav",
      'nav[aria-label="Chat history"]',
      '[data-testid="sidebar"] nav',
      "nav",
    ];
    for (const s of cands) {
      for (const el of document.querySelectorAll(s)) {
        const r = el.getBoundingClientRect();
        if (r.width > 120 && r.height > 200 && r.left < window.innerWidth / 2) return el;
      }
    }
    return null;
  }

  function place(force) {
    const nav = findSidebarNav();
    if (nav) {
      card.classList.remove("floating");
      // Bottom: just above the account/profile footer (nav's last child). Top: after the first block.
      const kids = [...nav.children].filter((c) => c !== host);
      const before = state.position === "top" ? (kids[1] || null) : (kids[kids.length - 1] || null);
      const ok = host.parentElement === nav && host.nextElementSibling === before;
      if (force || !ok) nav.insertBefore(host, before);
    } else {
      // Sidebar collapsed or not found: small floating card bottom-left.
      card.classList.add("floating");
      if (host.parentElement !== document.body) document.body.appendChild(host);
    }
  }

  let placeQueued = false;
  const mo = new MutationObserver(() => {
    if (placeQueued) return;
    placeQueued = true;
    requestAnimationFrame(() => { placeQueued = false; place(false); });
  });

  // ---------- boot ----------
  load().then(() => {
    // drop model entries older than 7 days
    const cutoff = Date.now() - 7 * 864e5;
    for (const [k, v] of Object.entries(state.models)) if ((v.seenAt || 0) < cutoff) delete state.models[k];
    render();
    place(true);
    mo.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("resize", () => place(false));
    requestRefresh(true);
    setInterval(() => { if (document.visibilityState === "visible") requestRefresh(false); }, AUTO_REFRESH_MS);
    setInterval(render, 30 * 1000);
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") requestRefresh(false); });
    new MutationObserver(render).observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  });
})();
