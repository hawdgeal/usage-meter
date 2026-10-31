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
    position: "top", // "top" | "bottom" inside the sidebar
    showRaw: false,
    sections: ["plan", "credits", "features"],
    closed: {},
    hidden: {},
    theme: "auto",
    floating: { x: 24, y: 100 },
    size: { width: 300, height: null },
  };
  let lastRefresh = 0;

  // ---------- persistence ----------
  const saveKeys = ["usage", "plan", "usageAt", "models", "collapsed", "position", "sections", "closed", "hidden", "theme", "floating", "size"];
  function persist() {
    const o = {};
    for (const k of saveKeys) o[k] = state[k];
    try { store.local.set({ gptu: o })?.catch(() => {}); } catch (_) {}
  }
  async function load() {
    try {
      const r = await store.local.get("gptu");
      if (r && r.gptu) for (const k of saveKeys) if (r.gptu[k] !== undefined) state[k] = r.gptu[k];
    } catch (_) {}
    if (!Array.isArray(state.sections)) state.sections = ["plan", "credits", "features"];
    for (const key of ["closed", "hidden", "models"]) if (!state[key] || typeof state[key] !== "object") state[key] = {};
    if (!state.floating || !Number.isFinite(state.floating.x) || !Number.isFinite(state.floating.y)) state.floating = {x:24,y:100};
    if (!state.size || !Number.isFinite(state.size.width)) state.size = {width:300,height:null};
    if (!Number.isFinite(state.size.height)) state.size.height = null;
    if (!["auto", "light", "dark"].includes(state.theme)) state.theme = "auto";
    if (!["top", "bottom", "floating"].includes(state.position)) state.position = "top";
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
          reached: pct != null ? pct >= 100 : !!rl.limit_reached,
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

  // All panel colors are owned here: page custom properties can change independently.
  const CSS = `
    :host { all:initial; display:block; min-width:0; flex-shrink:0; color-scheme:light; }
    * { box-sizing:border-box; }
    [hidden] { display:none !important; }
    .card, .settings { --fg:#202123; --muted:#656565; --line:#e3e3e3; --surface:#f9f9f9; --hover:#ededed; --track:#e5e5e5; --ok:#087f65; --warn:#966000; --bad:#c53240;
      color:var(--fg); background:var(--surface); font:13px/1.45 ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
      margin:6px 8px; border:1px solid var(--line); border-radius:14px; overflow:hidden; text-align:left; display:flex; flex-direction:column; }
    .card { position:relative; border-color:transparent; }
    .card:hover, .card:focus-within { border-color:var(--line); }
    .resize { opacity:0; pointer-events:none; }
    .card:hover .resize, .card:focus-within .resize { opacity:1; pointer-events:auto; }
    @media(hover:none) { .resize { opacity:1; pointer-events:auto; } }
    :host([data-bottom]) { position:relative; margin-top:auto; width:auto; flex:0 0 auto; }
    :host([data-bottom]) .card { margin:6px 8px; }
    .card.collapsed .grab, .card.collapsed .refresh, .card.collapsed .customize,
    .card.collapsed .title, .card.collapsed .badge, .card.collapsed .summary, .card.collapsed .toggle .chev { opacity:0; pointer-events:none; }
    .card.collapsed:hover .grab, .card.collapsed:hover .refresh, .card.collapsed:hover .customize,
    .card.collapsed:hover .title, .card.collapsed:hover .badge, .card.collapsed:hover .summary, .card.collapsed:hover .toggle .chev,
    .card.collapsed:focus-within .grab, .card.collapsed:focus-within .refresh, .card.collapsed:focus-within .customize,
    .card.collapsed:focus-within .title, .card.collapsed:focus-within .badge, .card.collapsed:focus-within .summary, .card.collapsed:focus-within .toggle .chev { opacity:1; pointer-events:auto; }
    @media(hover:none) { .card.collapsed .icon, .card.collapsed .toggle .chev { opacity:1; pointer-events:auto; } }
    :host([data-dark]) { color-scheme:dark; }
    :host([data-dark]) .card, :host([data-dark]) .settings { --fg:#ececec; --muted:#ababab; --line:#292929; --surface:#000000; --hover:#171717; --track:#292929; --ok:#57c7a6; --warn:#e9b55f; --bad:#ff7983; }
    button,select { font:inherit; color:inherit; }
    button { border:0; background:none; cursor:pointer; padding:0; }
    button:hover { background:var(--hover); }
    button:focus-visible,select:focus-visible { outline:2px solid var(--ok); outline-offset:2px; }
    svg { width:16px; height:16px; flex-shrink:0; vertical-align:middle; pointer-events:none; }
    .head { flex-shrink:0; display:flex; align-items:center; gap:3px; padding:7px 6px; }
    .icon { width:28px; height:28px; display:inline-flex; align-items:center; justify-content:center; border-radius:7px; flex-shrink:0; color:var(--muted); }
    .grab { cursor:grab; touch-action:none; }
    .grab:active { cursor:grabbing; }
    .toggle { display:flex; align-items:center; gap:6px; min-width:0; flex:1; border-radius:7px; padding:5px 2px; text-align:left; }
    .title { font-weight:600; white-space:nowrap; }
    .badge { color:var(--muted); border:1px solid var(--line); font-size:9px; padding:1px 4px; border-radius:5px; text-transform:uppercase; max-width:58px; overflow:hidden; text-overflow:ellipsis; }
    .chev { width:13px; transition:transform .15s; }
    [aria-expanded="false"] .chev { transform:rotate(-90deg); }
    .body { min-height:0; max-height:min(56vh,540px); overflow:auto; scrollbar-width:thin; scrollbar-color:var(--track) transparent; }
    .section { margin:0 10px; border-top:1px solid var(--line); }
    .section-head { display:flex; align-items:center; gap:2px; padding:5px 0; }
    .section-toggle { display:flex; flex:1; align-items:center; gap:7px; min-width:0; text-align:left; padding:6px 2px; border-radius:6px; font-size:11px; font-weight:600; color:var(--muted); }
    .section-toggle .chev { margin-left:auto; }
    .section-handle { width:22px; height:24px; cursor:grab; }
    .section-content { padding:1px 2px 6px; }
    .row { padding:5px 0 8px; }
    .rl,.kv { display:flex; align-items:baseline; justify-content:space-between; gap:8px; }
    .rl>span:first-child { min-width:0; overflow-wrap:anywhere; }
    .v { font-size:12px; font-weight:600; font-variant-numeric:tabular-nums; flex-shrink:0; }
    .bar { height:4px; background:var(--track); border-radius:9px; overflow:hidden; margin:7px 0 5px; }
    .bar i { display:block; height:100%; border-radius:9px; background:var(--ok); }
    .bar i.warn { background:var(--warn); } .bar i.bad { background:var(--bad); }
    .sub,.empty,.note { color:var(--muted); font-size:11px; line-height:1.5; }
    .empty { padding-bottom:8px; }
    .credit { font-size:23px; font-weight:600; letter-spacing:-.6px; font-variant-numeric:tabular-nums; }
    .foot { flex-shrink:0; display:flex; align-items:center; justify-content:space-between; gap:8px; padding:7px 24px 9px 12px; color:var(--muted); font-size:10px; }
    .text-btn { color:var(--muted); border-radius:4px; padding:3px; font-size:10px; }
    .err { margin:8px 12px; font-size:11px; color:var(--bad); overflow-wrap:anywhere; }
    pre { margin:0 12px 10px; padding:8px; background:var(--hover); border-radius:8px; max-height:160px; overflow:auto; white-space:pre-wrap; overflow-wrap:anywhere; font:10px/1.5 ui-monospace,monospace; }
    .settings { position:fixed; inset:auto; margin:0; padding:14px; width:min(300px,calc(100vw - 16px)); max-height:calc(100dvh - 16px); overflow:auto; border:1px solid var(--line); border-radius:14px; box-shadow:0 10px 40px #0004; }
    .settings:not(:popover-open) { display:none; }
    .settings::backdrop { background:transparent; }
    .settings-title { display:flex; align-items:center; justify-content:space-between; margin-bottom:16px; font-weight:600; }
    .checks { padding-top:10px; border-top:1px solid var(--line); }
    .checks label { width:100%; padding:5px 0; }
    .settings .reset { font-size:11px; margin-top:8px; }
    .settings .note { margin-top:8px; }
    .setting { display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:10px; font-size:12px; }
    select { background:var(--surface); border:1px solid var(--line); border-radius:6px; padding:4px; max-width:145px; font-size:11px; }
    .checks { display:flex; flex-wrap:wrap; gap:8px; font-size:11px; margin-bottom:10px; }
    .checks label { display:flex; align-items:center; gap:4px; } input { accent-color:var(--ok); margin:0; }
    .busy .refresh svg { animation:spin 1s linear infinite; } @keyframes spin { to { transform:rotate(360deg); } }
    :host([data-floating]) { position:fixed; width:min(300px,calc(100vw - 16px)); z-index:2147483000; }
    :host([data-floating]) .card { margin:0; }
    :host([data-floating]) .card:hover, :host([data-floating]) .card:focus-within { box-shadow:0 8px 32px #0003; }
    .resize { position:absolute; bottom:2px; right:2px; width:22px; height:22px; color:var(--muted); cursor:ns-resize; touch-action:none; border-radius:5px; display:grid; place-items:center; }
    .resize svg { width:12px; height:12px; }
    :host([data-floating]) .resize { cursor:nwse-resize; }
    .card.sized .body { max-height:none; flex:1; }
    .drag-over { border-top:2px solid var(--ok); }
    .summary { padding:0 12px 8px; color:var(--muted); font-size:11px; }
    .live { position:absolute; width:1px; height:1px; overflow:hidden; clip-path:inset(50%); }
    @media(prefers-reduced-motion:reduce) { * { animation:none !important; transition:none !important; } }
  `;
  const paths = {
    chevron:'<path d="m6 9 6 6 6-6"/>',
    refresh:'<path d="M20 7v5h-5M20 12a8 8 0 1 0-2 5"/>',
    grip:'<circle cx="9" cy="5" r=".8"/><circle cx="15" cy="5" r=".8"/><circle cx="9" cy="12" r=".8"/><circle cx="15" cy="12" r=".8"/><circle cx="9" cy="19" r=".8"/><circle cx="15" cy="19" r=".8"/>',
    settings:'<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="15" cy="17" r="3"/>',
    plan:'<path d="M4 17v-4m5 4V9m5 8V5m5 12V2"/>',
    credits:'<circle cx="12" cy="12" r="9"/><path d="M15 8h-4a2 2 0 0 0 0 4h2a2 2 0 0 1 0 4H9m3-10v2m0 8v2"/>',
    features:'<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>'
  };
  const icon = (key) => `<svg class="${key === 'chevron' ? 'chev' : ''}" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${paths[key]}</svg>`;
  const host = document.createElement('div'); host.id='gptu-usage-host';
  const root=host.attachShadow({mode:'open'});
  root.innerHTML=`<style>${CSS}</style><div class="card" part="card">
    <div class="head"><button class="icon grab" aria-label="Drag panel; use arrow keys to move, Escape to dock" title="Drag to float · Arrow keys to move · Escape to dock">${icon('grip')}</button>
    <button class="toggle" aria-expanded="true">${icon('chevron')}<span class="title">Usage</span><span class="badge" hidden></span></button>
    <button class="icon refresh" title="Refresh usage" aria-label="Refresh usage">${icon('refresh')}</button>
    <button class="icon customize" title="Customize panel" aria-label="Customize panel" aria-expanded="false">${icon('settings')}</button></div>
    <div class="summary" hidden></div><div class="body"></div><button class="resize" aria-label="Resize panel" title="Drag to resize · Arrow keys to resize · Double-click to reset size"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" aria-hidden="true"><path d="m5 13 8-8m-3 8 3-3"/></svg></button><div class="live" aria-live="polite"></div></div><div class="settings" popover="auto" role="dialog" aria-label="Usage settings"></div>`;
  const $=s=>root.querySelector(s), card=$('.card');
  let busyTimer, settingsOpen=false, drag=null, resizing=null, sectionDrag=null;
  const ui={ setBusy(b) { card.classList.toggle('busy',b); $('.refresh').disabled=b; $('.refresh').setAttribute('aria-busy',String(b)); clearTimeout(busyTimer); if(b) busyTimer=setTimeout(()=>{ui.setBusy(false); state.error='Refresh timed out. Try again.'; render();},20000); } };
  const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const level=p=>p>=90?'bad':p>=75?'warn':'';
  const labels={plan:'Plan limits',credits:'Credits',features:'Models & features'};
  const format=n=>new Intl.NumberFormat(undefined,{maximumFractionDigits:2}).format(n);
  const bar=(p,label)=>`<div class="bar" role="progressbar" aria-label="${esc(label)} used" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${p}"><i class="${level(p)}" style="width:${p}%"></i></div>`;
  function applyTheme() {
    const html=document.documentElement;
    const dark=state.theme==='dark'||state.theme==='auto'&&(html.classList.contains('dark')||html.dataset.theme==='dark'||(!html.classList.contains('light')&&html.dataset.theme!=='light'&&(getComputedStyle(html).colorScheme==='dark'||getComputedStyle(html).colorScheme!=='light'&&matchMedia('(prefers-color-scheme: dark)').matches)));
    host.toggleAttribute('data-dark',dark);
  }
  function renderSettings() {

    $('.customize').setAttribute('aria-expanded',String(settingsOpen));
    $('.settings').innerHTML=`<div class="settings-title"><span>Usage settings</span><button class="icon close-settings" aria-label="Close settings">✕</button></div><div class="setting"><span>Appearance</span><select aria-label="Appearance" data-setting="theme">${['auto','light','dark'].map(k=>`<option value="${k}" ${state.theme===k?'selected':''}>${k==='auto'?'Match ChatGPT':k==='light'?'Light':'Dark'}</option>`).join('')}</select></div>
    <div class="setting"><span>Placement</span><select aria-label="Placement" data-setting="position">${['top','bottom','floating'].map(k=>`<option value="${k}" ${state.position===k?'selected':''}>${k==='top'?'Sidebar top':k==='bottom'?'Sidebar bottom':'Floating'}</option>`).join('')}</select></div>
    <div class="checks">${Object.keys(labels).map(k=>`<label><input type="checkbox" data-visible="${k}" ${!state.hidden[k]?'checked':''}>${labels[k]}</label>`).join('')}</div>
    <div class="note">Drag section handles to reorder. Use ↑ / ↓ on a section handle for keyboard reordering.</div><button class="text-btn reset">Reset layout</button>`;
  }
  function render() {
    applyTheme();
    card.classList.toggle('collapsed',!!state.collapsed);
    applySize();
    const parsed=parseUsage(state.usage), plan=parsed.plan||state.plan;
    $('.badge').hidden=!plan; $('.badge').textContent=plan||'';
    $('.toggle').setAttribute('aria-expanded',String(!state.collapsed));
    $('.body').hidden=!!state.collapsed;
    const pcts=parsed.rows.map(r=>r.pct).filter(p=>p!=null);
    $('.summary').hidden=!state.collapsed;
    $('.summary').textContent=pcts.length?`${Math.round(Math.max(...pcts))}% used · ${fmtAgo(state.usageAt)}`:'No usage reported yet';
    const blocks={};
    blocks.plan=parsed.rows.map(r=>`<div class="row"><div class="rl"><span>${esc(r.label)}</span><span class="v">${r.pct==null?'—':Math.round(r.pct)+'%'}</span></div>${r.pct==null?'':bar(r.pct,r.label)}<div class="sub">${r.reached?'Limit reached · ':''}${r.resetsAt?(r.resetsAt>Date.now()?`Resets in ${fmtDur(r.resetsAt-Date.now())}`:'Reset · refresh to update'):''}</div></div>`).join('')||`<div class="empty">${state.error?'Usage unavailable. Try refreshing.':state.usageAt?'No plan limits reported.':'Waiting for usage…'}</div>`;
    const balance=num(parsed.credits);
    blocks.credits=`<div class="credit">${balance!=null?format(balance):esc(parsed.credits??'—')}</div><div class="sub">${parsed.credits==null?'No credit balance reported':'Available balance'}</div>`;
    const models=Object.entries(state.models).sort((a,b)=>(b[1].seenAt||0)-(a[1].seenAt||0)).slice(0,12);
    blocks.features=models.map(([name,m])=>{
      const expired=m.resetsAt&&m.resetsAt<=Date.now();
      const val=expired?'Refresh needed':m.remaining!=null?(m.limit!=null?`${format(m.remaining)} / ${format(m.limit)} left`:`${format(m.remaining)} left`):m.used!=null&&m.limit!=null?`${format(m.used)} / ${format(m.limit)} used`:'—';
      const label=name.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
      const pct=!expired&&m.limit>0?(m.remaining!=null?100-m.remaining/m.limit*100:m.used!=null?m.used/m.limit*100:null):null;
      return `<div class="row"><div class="rl"><span>${esc(label)}</span><span class="v">${esc(val)}</span></div>${pct==null?'':bar(Math.max(0,Math.min(100,pct)),label)}<div class="sub">${!expired&&m.resetsAt?`Resets in ${fmtDur(m.resetsAt-Date.now())} · `:''}Seen ${fmtAgo(m.seenAt)}</div></div>`;
    }).join('')||'<div class="empty">Limits appear here when ChatGPT reports them.</div>';
    const scroll=$('.body').scrollTop;
    const focused=root.activeElement?.dataset;
    const rawFocused=root.activeElement?.classList.contains('raw');
    $('.body').innerHTML=state.sections.filter(k=>!state.hidden[k]).map(k=>`<section class="section" data-section="${k}"><div class="section-head"><button class="section-toggle" data-collapse="${k}" aria-expanded="${!state.closed[k]}" aria-controls="gptu-${k}">${icon(k)}<span>${labels[k]}</span>${icon('chevron')}</button><button class="icon section-handle" draggable="true" data-handle="${k}" aria-label="Reorder ${labels[k]}" title="Drag to reorder · ↑ / ↓">${icon('grip')}</button></div><div class="section-content" id="gptu-${k}" ${state.closed[k]?'hidden':''}>${blocks[k]}</div></section>`).join('')+
      `${state.error?`<div class="err" role="status">${esc(state.error)}</div>`:''}<div class="foot"><span>Updated ${fmtAgo(state.usageAt)}</span><button class="text-btn raw" aria-expanded="${state.showRaw}">${state.showRaw?'Hide data':'Details'}</button></div>${state.showRaw?`<pre>${esc(JSON.stringify({usage:state.usage,models:state.models},null,2))}</pre>`:''}`;
    $('.body').scrollTop=scroll;
    if(host.hasAttribute('data-bottom')) layoutBottom();
    if(rawFocused) $('.raw')?.focus();
    else if(focused?.handle) root.querySelector(`[data-handle="${focused.handle}"]`)?.focus();
    else if(focused?.collapse) root.querySelector(`[data-collapse="${focused.collapse}"]`)?.focus();
  }
  $('.toggle').onclick=()=>{state.collapsed=!state.collapsed; persist(); render();};
  $('.refresh').onclick=()=>requestRefresh(true);
  function positionSettings() {
    if(!settingsOpen)return;
    const menu=$('.settings'), anchor=$('.customize').getBoundingClientRect(), r=menu.getBoundingClientRect();
    menu.style.left=Math.max(8,Math.min(anchor.right-r.width,innerWidth-r.width-8))+'px';
    const below=innerHeight-anchor.bottom-8;
    menu.style.top=Math.max(8,Math.min(below>=r.height?anchor.bottom+6:anchor.top-r.height-6,innerHeight-r.height-8))+'px';
  }
  function closeSettings(focus=false) { $('.settings').hidePopover(); settingsOpen=false;$('.customize').setAttribute('aria-expanded','false');if(focus)$('.customize').focus(); }
  $('.customize').onclick=()=>{if(settingsOpen){closeSettings();return;}settingsOpen=true;renderSettings();$('.settings').showPopover();positionSettings();$('.settings').querySelector('select').focus();};
  $('.settings').addEventListener('toggle',e=>{settingsOpen=e.newState==='open';$('.customize').setAttribute('aria-expanded',String(settingsOpen));});
  root.addEventListener('click',e=>{if(e.target.closest('.close-settings'))closeSettings(true);});
  window.addEventListener('resize',positionSettings);
  document.addEventListener('scroll',positionSettings,true);
  root.addEventListener('click',e=>{
    const k=e.target.closest('[data-collapse]')?.dataset.collapse;
    if(k){state.closed[k]=!state.closed[k];persist();render();}
    if(e.target.closest('.raw')){state.showRaw=!state.showRaw;render();$('.raw').focus();}
    if(e.target.closest('.reset')){Object.assign(state,{sections:['plan','credits','features'],closed:{},hidden:{},theme:'auto',position:'top',floating:{x:24,y:100},size:{width:300,height:null}});persist();closeSettings(true);render();place(true);}
  });
  root.addEventListener('change',e=>{
    if(e.target.dataset.setting){const placement=e.target.dataset.setting==='position';state[e.target.dataset.setting]=e.target.value;if(placement)closeSettings(true);persist();render();place(true);positionSettings();}
    if(e.target.dataset.visible){state.hidden[e.target.dataset.visible]=!e.target.checked;persist();render();}
  });
  function reorder(from,to){const list=state.sections, target=list.indexOf(to);list.splice(list.indexOf(from),1);list.splice(target,0,from);persist();render();$('.live').textContent=`${labels[from]} moved`;}
  root.addEventListener('dragstart',e=>{const h=e.target.closest('[data-handle]');if(!h)return;sectionDrag=h.dataset.handle;e.dataTransfer.setData('text/plain',sectionDrag);e.dataTransfer.effectAllowed='move';});
  root.addEventListener('dragover',e=>{if(!sectionDrag)return;const s=e.target.closest('[data-section]');if(s){e.preventDefault();root.querySelectorAll('.drag-over').forEach(n=>n.classList.remove('drag-over'));s.classList.add('drag-over');}});
  root.addEventListener('drop',e=>{const to=e.target.closest('[data-section]')?.dataset.section;if(sectionDrag&&to){e.preventDefault();if(to!==sectionDrag)reorder(sectionDrag,to);}sectionDrag=null;root.querySelectorAll('.drag-over').forEach(n=>n.classList.remove('drag-over'));});
  root.addEventListener('dragend',()=>{sectionDrag=null;root.querySelectorAll('.drag-over').forEach(n=>n.classList.remove('drag-over'));});
  root.addEventListener('keydown',e=>{const k=e.target.dataset.handle;if(!k||!['ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();const visible=state.sections.filter(x=>!state.hidden[x]), i=visible.indexOf(k)+(e.key==='ArrowUp'?-1:1);if(visible[i]){reorder(k,visible[i]);root.querySelector(`[data-handle="${k}"]`).focus();}});
  function applySize() {
    const floating=host.hasAttribute('data-floating');
    if(floating)host.style.width=Math.max(Math.min(240,innerWidth-16),Math.min(state.size.width,innerWidth-16))+'px';else host.style.width='';
    const height=state.size.height==null||state.collapsed?null:Math.max(Math.min(140,innerHeight-16),Math.min(state.size.height,innerHeight-16));
    card.style.height=height==null?'':height+'px';
    card.classList.toggle('sized',height!=null);
    $('.resize').hidden=!!state.collapsed;
    $('.resize').title=floating?'Drag to resize width and height · Arrow keys to resize · Double-click to reset':'Drag to resize height · ↑ / ↓ to resize · Double-click to reset';
  }
  $('.resize').addEventListener('pointerdown',e=>{
    if(e.button!==0)return;
    const r=card.getBoundingClientRect();
    resizing={x:e.clientX,y:e.clientY,width:r.width,height:r.height,bottom:host.hasAttribute('data-bottom'),edge:r.bottom};
    e.preventDefault();
  });
  window.addEventListener('pointermove',e=>{
    if(!resizing)return;
    if(host.hasAttribute('data-floating')) state.size.width=Math.max(240,Math.min(resizing.width+e.clientX-resizing.x,innerWidth-host.getBoundingClientRect().left-8));
    state.size.height=Math.max(140,Math.min(resizing.height+(resizing.bottom?-1:1)*(e.clientY-resizing.y),resizing.bottom?resizing.edge-8:innerHeight-card.getBoundingClientRect().top-8));
    applySize();
  });
  const endResize=()=>{if(resizing){resizing=null;persist();}};
  window.addEventListener('pointerup',endResize);window.addEventListener('pointercancel',endResize);window.addEventListener('blur',endResize);
  $('.resize').addEventListener('dblclick',()=>{state.size={width:300,height:null};applySize();if(host.hasAttribute('data-floating'))clampFloat();persist();});
  $('.resize').addEventListener('keydown',e=>{
    if(!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key))return;
    e.preventDefault();const r=card.getBoundingClientRect(),step=e.shiftKey?40:10;
    if(['ArrowLeft','ArrowRight'].includes(e.key)&&host.hasAttribute('data-floating'))state.size.width=Math.max(240,Math.min(r.width+(e.key==='ArrowRight'?step:-step),innerWidth-host.getBoundingClientRect().left-8));
    if(['ArrowUp','ArrowDown'].includes(e.key))state.size.height=Math.max(140,Math.min(r.height+(e.key==='ArrowDown'?step:-step),host.hasAttribute('data-bottom')?r.bottom-8:innerHeight-r.top-8));
    applySize();persist();
  });
  function clampFloat(){const rect=host.getBoundingClientRect();state.floating.x=Math.max(8,Math.min(state.floating.x,innerWidth-rect.width-8));state.floating.y=Math.max(8,Math.min(state.floating.y,innerHeight-Math.min(rect.height,innerHeight-16)-8));host.style.left=state.floating.x+'px';host.style.top=state.floating.y+'px';card.style.maxHeight='calc(100dvh - 16px)';}
  $('.grab').addEventListener('pointerdown',e=>{if(e.button!==0)return;const r=host.getBoundingClientRect();drag={x:e.clientX,y:e.clientY,left:r.left,top:r.top,started:false};$('.grab').setPointerCapture(e.pointerId);e.preventDefault();});
  window.addEventListener('pointermove',e=>{if(!drag)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(!drag.started&&Math.hypot(dx,dy)<5)return;drag.started=true;state.position='floating';state.floating={x:drag.left+dx,y:drag.top+dy};place(false);$('.grab').setPointerCapture(e.pointerId);clampFloat();});
  const endDrag=()=>{if(drag?.started){persist();if(settingsOpen)renderSettings();}drag=null;};
  window.addEventListener('pointerup',endDrag);window.addEventListener('pointercancel',endDrag);window.addEventListener('blur',endDrag);
  $('.grab').addEventListener('keydown',e=>{if(e.key==='Escape'){state.position='top';persist();place(true);if(settingsOpen)renderSettings();return;}if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();if(state.position!=='floating'){const r=host.getBoundingClientRect();state.floating={x:r.left,y:r.top};state.position='floating';}const step=e.shiftKey?30:10;state.floating.x+=e.key==='ArrowRight'?step:e.key==='ArrowLeft'?-step:0;state.floating.y+=e.key==='ArrowDown'?step:e.key==='ArrowUp'?-step:0;place(false);persist();if(settingsOpen)renderSettings();});
  function findSidebarNav(){for(const selector of ['#stage-slideover-sidebar nav','nav[aria-label="Chat history"]','[data-testid="sidebar"] nav','nav'])for(const el of document.querySelectorAll(selector)){const r=el.getBoundingClientRect();if(r.width>120&&r.height>(selector==='nav'?160:40)&&r.left>=0&&r.left<innerWidth/2&&r.right>100&&getComputedStyle(el).visibility!=='hidden')return el;}return null;}

  function bottomTarget(nav) {
    // The account footer can live outside the history nav, below its scroll area.
    let container=nav;
    for(let i=0;i<6&&container.parentElement&&container.parentElement!==document.body;i++){
      const parent=container.parentElement, r=parent.getBoundingClientRect();
      if(r.width>520||r.left>innerWidth/2)break;
      container=parent;
      if(container.matches('#stage-slideover-sidebar,[data-testid="sidebar"],aside'))break;
    }
    // Prefer the exact profile control; the absolute button itself is an overlay
    // inside the account row, so insert beside its containing footer branch.
    const account=container.querySelector('button[aria-label="Open profile menu"]')||container.querySelector('[data-testid="accounts-profile-button"], [data-testid="user-menu-button"], [data-testid="profile-button"]')||container.querySelector('footer');
    if(account){
      let parent=nav;
      while(parent&&!parent.contains(account))parent=parent.parentElement;
      if(parent&&parent!==document.body){
        let before=account;
        while(before.parentElement!==parent)before=before.parentElement;
        return {container,parent,before,account};
      }
    }
    return {container,parent:nav,before:null,account:null};
  }
  function opaqueBackground(el){
    for(;el&&el!==document.documentElement;el=el.parentElement){const c=getComputedStyle(el).backgroundColor;if(c&&c!=='transparent'&&!/rgba\([^)]*,\s*0\)$/.test(c))return c;}
    return getComputedStyle(document.body).backgroundColor||'';
  }
  function clearSticky(){host.style.position='';host.style.bottom='';host.style.zIndex='';host.style.background='';}
  function layoutBottom(nav=findSidebarNav()) {
    if(!nav||!host.hasAttribute('data-bottom'))return;
    const {parent,before}=bottomTarget(nav);
    if(host.parentElement!==parent||host.nextElementSibling!==before)parent.insertBefore(host,before);
    // When the footer lives inside the scrolling history list, a plain insert puts the
    // panel after every chat. Pin it above the footer so it stays docked while scrolling.
    const scrolls=/(auto|scroll|overlay)/.test(getComputedStyle(parent).overflowY);
    if(scrolls){
      const fs=before?getComputedStyle(before):null;
      const footerSticky=fs&&fs.position==='sticky';
      const offset=footerSticky?before.getBoundingClientRect().height+(parseFloat(fs.bottom)||0):0;
      host.style.position='sticky';
      host.style.bottom=offset+'px';
      host.style.zIndex=footerSticky&&fs.zIndex!=='auto'?fs.zIndex:'1';
      host.style.background=opaqueBackground(before||parent);
    }else clearSticky();
    const r=parent.getBoundingClientRect(), account=before?.getBoundingClientRect();
    // Limit the panel's own height, leaving the account and history room in the layout.
    const available=Math.max(100,Math.min(innerHeight,r.height||innerHeight)-(account?.height||0)-100);
    card.style.maxHeight=Math.min(available,innerHeight*.6)+'px';
  }
  function place(force){
    const nav=findSidebarNav(), floating=state.position==='floating'||!nav, bottom=!floating&&state.position==='bottom';
    if(nav&&observedSidebar!==nav){sidebarResizeObserver.disconnect();sidebarResizeObserver.observe(nav);const {container}=bottomTarget(nav);if(container!==nav)sidebarResizeObserver.observe(container);sidebarAttributes.disconnect();sidebarAttributes.observe(container,{attributes:true,attributeFilter:['class','style','hidden']});observedSidebar=nav;}
    host.toggleAttribute('data-floating',floating);host.toggleAttribute('data-bottom',bottom);
    applySize();
    host.style.left='';host.style.top='';
    if(!bottom)clearSticky();
    if(floating){if(host.parentElement!==document.body)document.body.appendChild(host);clampFloat();}
    else if(bottom){
      layoutBottom(nav);
    }else{
      host.style.left='';host.style.top='';card.style.maxHeight='';
      const kids=[...nav.children].filter(c=>c!==host), before=kids[1]||null;
      if(host.parentElement!==nav||host.nextElementSibling!==before)nav.insertBefore(host,before);
    }
    positionSettings();
  }
  let bottomFrame=0;
  function queueBottom(){if(state.position==='bottom'&&!bottomFrame)bottomFrame=requestAnimationFrame(()=>{bottomFrame=0;place(false);});}
  document.addEventListener('scroll',queueBottom,true);
  let observedSidebar=null;
  const sidebarResizeObserver=new ResizeObserver(queueBottom);
  const sidebarAttributes=new MutationObserver(queueBottom);
  const panelResizeObserver=new ResizeObserver(queueBottom);panelResizeObserver.observe(card);
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change',applyTheme);

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
    state.sections = [...new Set([...state.sections.filter(k => ["plan", "credits", "features"].includes(k)), "plan", "credits", "features"])];
    render();
    place(true);
    mo.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("resize", () => place(false));
    requestRefresh(true);
    setInterval(() => { if (document.visibilityState === "visible") requestRefresh(false); }, AUTO_REFRESH_MS);
    setInterval(render, 30 * 1000);
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") requestRefresh(false); });
    new MutationObserver(render).observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style", "data-theme"] });
  });
})();
