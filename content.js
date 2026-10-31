// Isolated-world content script: draws the usage card inside ChatGPT's left sidebar.
(() => {
  const TAG_IN = "gptu-hook";
  const TAG_OUT = "gptu-ui";
  const AUTO_REFRESH_MS = 2 * 60 * 1000;
  const MIN_GAP_MS = 15 * 1000;
  const store = (globalThis.browser && browser.storage) || chrome.storage;

  const THEME_PRESETS=[{"id":"ayu-dark","family":"Ayu","type":"dark","surface":"#0d1017","hover":"#47526640","border":"#1b1f29","fg":"#bfbdb6","muted":"#5a6673","accent":"#e6b450"},{"id":"catppuccin-mocha","family":"Catppuccin","type":"dark","surface":"#181825","hover":"#31324480","border":"#585b70","fg":"#cdd6f4","muted":"#9399b2","accent":"#cba6f7"},{"id":"catppuccin-latte","family":"Catppuccin","type":"light","surface":"#e6e9ef","hover":"#ccd0da80","border":"#acb0be","fg":"#4c4f69","muted":"#7c7f93","accent":"#8839ef"},{"id":"absolutely-dark","family":"Absolutely","type":"dark","surface":"#373735","hover":"#373735","border":"#ffffff22","fg":"#f9f9f7","muted":"#b2b2b0","accent":"#cc7d5e"},{"id":"absolutely-light","family":"Absolutely","type":"light","surface":"#f4f4f2","hover":"#f4f4f2","border":"#00000022","fg":"#2d2d2b","muted":"#8e8e8c","accent":"#c27759"},{"id":"dracula","family":"Dracula","type":"dark","surface":"#21222C","hover":"#44475A75","border":"#BD93F9","fg":"#F8F8F2","muted":"#6272A4","accent":"#737583"},{"id":"everforest-dark","family":"Everforest","type":"dark","surface":"#2d353b","hover":"#2d353b00","border":"#2d353b","fg":"#d3c6aa","muted":"#859289","accent":"#a7c080"},{"id":"everforest-light","family":"Everforest","type":"light","surface":"#fdf6e3","hover":"#fdf6e300","border":"#fdf6e3","fg":"#5c6a72","muted":"#859289","accent":"#7d974c"},{"id":"github-dark","family":"GitHub","type":"dark","surface":"#010409","hover":"#6e76811a","border":"#30363d","fg":"#e6edf3","muted":"#8b949e","accent":"#238636"},{"id":"github-light","family":"GitHub","type":"light","surface":"#f6f8fa","hover":"#eaeef280","border":"#d0d7de","fg":"#1f2328","muted":"#6e7781","accent":"#1f883d"},{"id":"gruvbox-dark","family":"Gruvbox","type":"dark","surface":"#282828","hover":"#3c383680","border":"#3c3836","fg":"#ebdbb2","muted":"#928374","accent":"#458588"},{"id":"gruvbox-light","family":"Gruvbox","type":"light","surface":"#fbf1c7","hover":"#ebdbb280","border":"#ebdbb2","fg":"#3c3836","muted":"#928374","accent":"#458588"},{"id":"linear-dark","family":"Linear","type":"dark","surface":"#080a0f","hover":"#080a0f","border":"#ffffff22","fg":"#e6e9ef","muted":"#636b7b","accent":"#606acc"},{"id":"linear-light","family":"Linear","type":"light","surface":"#f2f4f8","hover":"#f2f4f8","border":"#00000022","fg":"#2a3140","muted":"#858ea1","accent":"#5e6ad2"},{"id":"lobster-dark","family":"Lobster","type":"dark","surface":"#111827","hover":"#111827","border":"#ffffff22","fg":"#e4e4e7","muted":"#71717a","accent":"#ff5c5c"},{"id":"material-dark","family":"Material","type":"dark","surface":"#212121","hover":"#212121","border":"#21212160","fg":"#EEFFFF","muted":"#6b6e6e","accent":"#717171"},{"id":"matrix-dark","family":"Matrix","type":"dark","surface":"#020402","hover":"#020402","border":"#ffffff22","fg":"#b8ffca","muted":"#3f8f52","accent":"#1eff5a"},{"id":"monokai","family":"Monokai","type":"dark","surface":"#1e1f1c","hover":"#3e3d32","border":"#414339","fg":"#f8f8f2","muted":"#88846f","accent":"#75715E"},{"id":"night-owl","family":"Night Owl","type":"dark","surface":"#011627","hover":"#011627","border":"#5f7e97","fg":"#d6deeb","muted":"#637777","accent":"#7e57c2"},{"id":"nord","family":"Nord","type":"dark","surface":"#2e3440","hover":"#3b4252","border":"#3b4252","fg":"#d8dee9","muted":"#737f97","accent":"#88c0d0"},{"id":"notion-dark","family":"Notion","type":"dark","surface":"#151515","hover":"#151515","border":"#ffffff22","fg":"#d9d9d8","muted":"#6a9955","accent":"#3183d8"},{"id":"notion-light","family":"Notion","type":"light","surface":"#f7f6f3","hover":"#f7f6f3","border":"#00000022","fg":"#37352f","muted":"#008000","accent":"#3183d8"},{"id":"oscurange","family":"Oscurange","type":"dark","surface":"#0B0B0F","hover":"#0B0B0F","border":"#ffffff22","fg":"#E6E6E6","muted":"#5e5f66","accent":"#F9B98C"},{"id":"one-dark","family":"One","type":"dark","surface":"#21252b","hover":"#2c313a","border":"#3e4452","fg":"#abb2bf","muted":"#abb2bf","accent":"#70757f"},{"id":"one-light","family":"One","type":"light","surface":"#EAEAEB","hover":"#DBDBDC66","border":"#E5E5E6","fg":"#383A42","muted":"#8b8c93","accent":"#5871EF"},{"id":"proof-light","family":"Proof","type":"light","surface":"#efede6","hover":"#efede6","border":"#00000022","fg":"#2f312d","muted":"#8b877c","accent":"#3d755d"},{"id":"raycast-dark","family":"Raycast","type":"dark","surface":"#101010","hover":"#FFFFFF14","border":"#FFFFFF14","fg":"#FFFFFF","muted":"#666666","accent":"#ff6363"},{"id":"raycast-light","family":"Raycast","type":"light","surface":"#fcfcfc","hover":"#0000000f","border":"#00000014","fg":"#000000","muted":"#919191","accent":"#f25e5e"},{"id":"rose-pine-dark","family":"Rose Pine","type":"dark","surface":"#232136","hover":"#817c9c14","border":"#00000000","fg":"#e0def4","muted":"#6e6a86","accent":"#ea9a97"},{"id":"rose-pine-light","family":"Rose Pine","type":"light","surface":"#faf4ed","hover":"#6e6a860d","border":"#00000000","fg":"#575279","muted":"#8e899e","accent":"#c27571"},{"id":"sentry-dark","family":"Sentry","type":"dark","surface":"#26222d","hover":"#26222d","border":"#ffffff22","fg":"#e6dff9","muted":"#8d849f","accent":"#775ef6"},{"id":"solarized-dark","family":"Solarized","type":"dark","surface":"#00212B","hover":"#004454AA","border":"#2b2b4a","fg":"#839496","muted":"#5e747a","accent":"#2AA198"},{"id":"solarized-light","family":"Solarized","type":"light","surface":"#EEE8D5","hover":"#DFCA8844","border":"#DDD6C1","fg":"#5b6f76","muted":"#829294","accent":"#9b8d4e"},{"id":"tokyo-night","family":"Tokyo Night","type":"dark","surface":"#16161e","hover":"#13131a","border":"#101014","fg":"#a9b1d6","muted":"#5e668a","accent":"#506aaa"},{"id":"temple-dark","family":"Temple","type":"dark","surface":"#1d2d0f","hover":"#1d2d0f","border":"#ffffff22","fg":"#c7e6da","muted":"#4e645c","accent":"#e4f222"},{"id":"vercel-dark","family":"Vercel","type":"dark","surface":"#000000","hover":"#000000","border":"#ffffff22","fg":"#ededed","muted":"#666666","accent":"#006efe"},{"id":"vercel-light","family":"Vercel","type":"light","surface":"#ffffff","hover":"#ffffff","border":"#00000022","fg":"#171717","muted":"#666666","accent":"#006aff"},{"id":"vscode-dark","family":"VS Code Plus","type":"dark","surface":"#1E1E1E","hover":"#1E1E1E","border":"#ffffff22","fg":"#D4D4D4","muted":"#6A9955","accent":"#58a6ff"},{"id":"vscode-light","family":"VS Code Plus","type":"light","surface":"#FFFFFF","hover":"#E8E8E8","border":"#00000022","fg":"#000000","muted":"#008000","accent":"#0969da"},{"id":"xcode-dark","family":"Xcode","type":"dark","surface":"#1f1f24","hover":"#1f1f24","border":"#ffffff22","fg":"#ffffff","muted":"#6c7986","accent":"#5482ff"},{"id":"xcode-light","family":"Xcode","type":"light","surface":"#ffffff","hover":"#ffffff","border":"#00000022","fg":"#000000","muted":"#5d6c79","accent":"#0e0eff"}];
  const THEME_FAMILIES=[...new Set(THEME_PRESETS.map(p=>p.family))].sort((a,b)=>a.localeCompare(b));
  const SETTINGS_TABS={panel:'General',modules:'Modules',appearance:'Appearance',spacing:'Spacing'};
  const SPACING_AREAS={
    outer:{label:'Outside frame',selector:'.panel-layout',kind:'padding',normal:[6,0,6,0]},
    frame:{label:'Inside frame',selector:'',kind:'padding',normal:[6,0,6,0]},
    header:{label:'Usage header',selector:'.head',kind:'padding',normal:[5,6,5,6]},
    status:{label:'Update time & Details',selector:'.foot',kind:'padding',normal:[7,24,9,12],compact:[4,22,5,9]},
    statusButton:{label:'Details button',selector:'.foot .text-btn',kind:'padding',normal:[3,3,3,3]},
    summary:{label:'Collapsed summary',selector:'.summary',kind:'padding',normal:[0,12,8,12],compact:[0,9,5,9]},
    plan:{label:'Plan limits module',selector:'[data-section="plan"]',kind:'margin',normal:[0,10,0,10],compact:[0,8,0,8]},
    credits:{label:'Credits module',selector:'[data-section="credits"]',kind:'margin',normal:[0,10,0,10],compact:[0,8,0,8]},
    features:{label:'Models & features module',selector:'[data-section="features"]',kind:'margin',normal:[0,10,0,10],compact:[0,8,0,8]},
    sectionHeader:{label:'Module headings',selector:'.section-head',kind:'padding',normal:[5,0,5,0],compact:[2,0,2,0]},
    sectionContent:{label:'Module content',selector:'.section-content',kind:'padding',normal:[1,2,6,2],compact:[0,1,3,1]},
    planRows:{label:'Plan limit items',selector:'.plan-row',kind:'padding',normal:[5,0,8,0],compact:[3,0,5,0]},
    featureRows:{label:'Feature items',selector:'[data-counter]',kind:'padding',normal:[5,0,8,0],compact:[3,0,5,0]},
    creditBalance:{label:'Available balance',selector:'.credit-balance',kind:'padding',normal:[0,0,0,0]},
    creditMeter:{label:'Credit remaining meter',selector:'.credit-meter',kind:'margin',normal:[8,0,0,0],compact:[5,0,0,0]},
    addCredits:{label:'Add credits button',selector:'.add-credits',kind:'margin',normal:[8,0,0,0],compact:[5,0,0,0]},
    planBars:{label:'Plan bars',selector:'[data-section="plan"] .bar',kind:'margin',normal:[7,0,5,0],compact:[4,0,4,0]},
    creditBars:{label:'Credit bar',selector:'.credit-meter .bar',kind:'margin',normal:[7,0,5,0],compact:[4,0,4,0]},
    featureBars:{label:'Feature bars',selector:'[data-counter] .bar',kind:'margin',normal:[7,0,5,0],compact:[4,0,4,0]},
    captions:{label:'Reset captions & descriptions',selector:'.sub',kind:'margin',normal:[0,0,0,0]},
    details:{label:'Expanded Details',selector:'pre',kind:'margin',normal:[0,12,10,12]},
    detailsContent:{label:'Inside Details',selector:'pre',kind:'padding',normal:[8,8,8,8]}
  };
  const SPACING_SIDES=['Top','Right','Bottom','Left'];
  function spacingProfile(){return state.spacingMode==='auto'?(state.compact?'compact':'normal'):state.spacingMode;}
  function spacingValues(profile,key){
    const area=SPACING_AREAS[key],saved=state.spacing[profile]?.[key];
    const values=[...(saved||area[profile]||area.normal)];
    if(!saved&&key==='addCredits'&&profile==='compact'&&state.showCreditBar)values[0]=0;
    return values;
  }
  function applySpacing(){
    const profile=state.compact?'compact':'normal';
    for(const key of Object.keys(SPACING_AREAS)){
      const el=key==='outer'?$('.panel-layout'):card,values=spacingValues(profile,key).map(v=>v+'px').join(' '),prop='--gptu-space-'+key;
      if(el.style.getPropertyValue(prop)!==values)el.style.setProperty(prop,values);
    }
  }
  function defaultPreferences(){return {
    collapsed:false,compact:false,compactHeight:null,hideCollapsed:false,hideWithSidebar:true,footerPosition:'top',showUpdateTime:true,showDetails:true,marginTop:6,marginBottom:6,
    showAddCredits:true,showPlanTooltips:false,showRemainingPlan:true,showCreditBar:false,showCreditBalance:true,creditReference:null,creditReferencePending:false,
    position:'bottom',sections:['plan','credits','features'],closed:{credits:true},
    hidden:{features:true},hiddenFeatures:{deep_research:true,file_upload:true,paste_text_to_file:true},
    theme:'auto',preset:'auto',accent:'auto',contrast:'auto',floating:{x:24,y:100},size:{width:300,height:null},
    settingsTab:'panel',settingsPosition:null,spacingMode:'auto',spacing:{normal:{},compact:{}},settingsClosed:{appearance:false,colors:true,status:true,placement:false,visibility:true,plan:false,credits:true,features:true,spacePanel:false,spaceStatus:true,spaceModules:true,spaceItems:true,spaceBars:true,spaceDetails:true}
  };}
  const state = {
    usage:null,plan:null,usageAt:0,error:null,models:{},showRaw:false,
    ...defaultPreferences()
  };
  let lastRefresh = 0;

  // ---------- persistence ----------
  const saveKeys = ["usage", "plan", "usageAt", "models", "collapsed", "position", "sections", "closed", "hidden", "theme", "preset", "accent", "contrast", "floating", "size", "compact", "compactHeight", "hideCollapsed", "hideWithSidebar", "hiddenFeatures", "showAddCredits", "showPlanTooltips", "showRemainingPlan", "settingsClosed", "settingsTab", "settingsPosition", "spacing", "spacingMode", "footerPosition", "showUpdateTime", "showDetails", "marginTop", "marginBottom", "showCreditBar", "showCreditBalance", "creditReference", "creditReferencePending"];
  function persist() {
    const o = {};
    for (const k of saveKeys) o[k] = state[k];
    try { store.local.set({ gptu: o })?.catch(() => {}); } catch (_) {}
  }
  async function load() {
    try {
      const r = await store.local.get("gptu");
      if (r && r.gptu) {
        for (const k of saveKeys) if (r.gptu[k] !== undefined) state[k] = r.gptu[k];
        if(!r.gptu.spacing)state.spacing={normal:{frame:[state.marginTop,0,state.marginBottom,0]},compact:{frame:[state.marginTop,0,state.marginBottom,0]}};
      }
    } catch (_) {}
    if(!Number.isFinite(state.creditReference)||state.creditReference<=0)state.creditReference=null;
    for(const key of ['marginTop','marginBottom'])state[key]=Number.isFinite(state[key])?Math.max(0,Math.min(120,state[key])):6;
    if(!['top','bottom'].includes(state.footerPosition))state.footerPosition='top';
    if(!Object.hasOwn(SETTINGS_TABS,state.settingsTab))state.settingsTab='panel';
    if(!state.settingsPosition||!Number.isFinite(state.settingsPosition.x)||!Number.isFinite(state.settingsPosition.y))state.settingsPosition=null;
    if(!['auto','normal','compact'].includes(state.spacingMode))state.spacingMode='auto';
    const spacing=state.spacing;state.spacing={normal:{},compact:{}};
    for(const profile of ['normal','compact'])for(const key of Object.keys(SPACING_AREAS)){const values=spacing?.[profile]?.[key];if(Array.isArray(values)&&values.length===4&&values.every(Number.isFinite))state.spacing[profile][key]=values.map(v=>Math.max(0,Math.min(120,v)));}
    if (!Array.isArray(state.sections)) state.sections = ["plan", "credits", "features"];
    for (const key of ["closed", "hidden", "models", "hiddenFeatures", "settingsClosed"]) if (!state[key] || typeof state[key] !== "object") state[key] = {};
    state.settingsClosed={...defaultPreferences().settingsClosed,...state.settingsClosed};
    if (!state.floating || !Number.isFinite(state.floating.x) || !Number.isFinite(state.floating.y)) state.floating = {x:24,y:100};
    if (!state.size || !Number.isFinite(state.size.width)) state.size = {width:300,height:null};
    if (!Number.isFinite(state.size.height)) state.size.height = null;
    if (!["auto", "system", "light", "dark"].includes(state.theme)) state.theme = "auto";
    if(!['auto','chatgpt',...THEME_FAMILIES].includes(state.preset))state.preset='auto';
    if(!['auto','default','blue','green','yellow','pink','orange','purple','neutral'].includes(state.accent))state.accent='auto';
    if(!['auto','system','medium','increased'].includes(state.contrast))state.contrast='auto';
    if (!["top", "bottom", "floating"].includes(state.position)) state.position = "bottom";
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
      if(settingsOpen){renderFeatureSettings();positionSettings();}
    } else if (type === "activity") {
      setTimeout(() => requestRefresh(false), 4000);
    }
  });

  // All panel colors are owned here: page custom properties can change independently.
  const CSS = `
    :host { all:initial; display:block; box-sizing:border-box; padding:0; min-width:0; flex-shrink:0; color-scheme:light; }
    * { box-sizing:border-box; }
    [hidden] { display:none !important; }
    .panel-layout { display:flow-root; min-width:0; padding:6px 0; }
    .card, .settings, .credits-modal, .dock-zone { --fg:#202123; --muted:#656565; --line:#e3e3e3; --surface:#f9f9f9; --hover:#ededed; --track:#e5e5e5; --ok:#087f65; --remaining:#2563eb; --warn:#966000; --bad:#c53240;
      color:var(--fg); background:var(--surface); font:13px/1.45 ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
      margin:0 8px; border:1px solid var(--line); border-radius:14px; overflow:hidden; text-align:left; display:flex; flex-direction:column; }
    .card { position:relative; border-color:transparent; padding-top:var(--gptu-margin-top,6px); padding-bottom:var(--gptu-margin-bottom,6px); }
    .card:hover, .card:has(:focus-visible) { border-color:var(--line); }
    .resize { opacity:0; pointer-events:none; }
    .card:hover .resize, .card:has(:focus-visible) .resize { opacity:1; pointer-events:auto; }
    @media(hover:none) { .resize { opacity:1; pointer-events:auto; } }
    :host([data-sidebar-hidden]) { display:none !important; }
    :host([data-bottom]) { position:relative; margin-top:0; width:auto; flex:0 0 auto; }
    :host([data-bottom]) .card { margin:0 8px; }
    .card.collapsed.hide-collapsed .usage-icon,.card.collapsed.hide-collapsed .title,.card.collapsed.hide-collapsed .badge,.card.collapsed.hide-collapsed .summary { opacity:0; pointer-events:none; }
    .card.collapsed.hide-collapsed:hover .usage-icon,.card.collapsed.hide-collapsed:hover .title,.card.collapsed.hide-collapsed:hover .badge,.card.collapsed.hide-collapsed:hover .summary,
    .card.collapsed.hide-collapsed:has(:focus-visible) .usage-icon,.card.collapsed.hide-collapsed:has(:focus-visible) .title,.card.collapsed.hide-collapsed:has(:focus-visible) .badge,.card.collapsed.hide-collapsed:has(:focus-visible) .summary { opacity:1; pointer-events:auto; }
    @media(hover:none) { .card.collapsed.hide-collapsed .usage-icon,.card.collapsed.hide-collapsed .title,.card.collapsed.hide-collapsed .badge,.card.collapsed.hide-collapsed .summary { opacity:1; pointer-events:auto; } }
    :host([data-dark]) { color-scheme:dark; }
    :host([data-dark]) .card, :host([data-dark]) .settings, :host([data-dark]) .credits-modal, :host([data-dark]) .dock-zone { --fg:#ececec; --muted:#ababab; --line:#292929; --surface:#000000; --hover:#171717; --track:#292929; --ok:#57c7a6; --remaining:#60a5fa; --warn:#e9b55f; --bad:#ff7983; }
    button,select { font:inherit; color:inherit; }
    button { border:0; background:none; cursor:pointer; padding:0; }
    button:hover { background:var(--hover); }
    button:focus-visible,select:focus-visible { outline:2px solid var(--ok); outline-offset:2px; }
    svg { width:16px; height:16px; flex-shrink:0; vertical-align:middle; pointer-events:none; }
    .head { flex-shrink:0; display:flex; align-items:center; gap:3px; padding:5px 6px; min-height:38px; }
    .icon { width:28px; height:28px; display:inline-flex; align-items:center; justify-content:center; border-radius:7px; flex-shrink:0; color:var(--muted); }
    .grab { cursor:grab; touch-action:none; }
    .grab:active { cursor:grabbing; }
    .usage-open { display:flex; align-items:center; gap:8px; min-width:0; flex:1; border-radius:7px; padding:5px 2px; text-align:left; }
    .title { font-size:var(--gptu-title-size,14px); font-weight:500; white-space:nowrap; }
    .badge { color:var(--muted); border:1px solid var(--line); font-size:9px; padding:1px 4px; border-radius:5px; text-transform:uppercase; max-width:58px; overflow:hidden; text-overflow:ellipsis; }
    .chev { width:13px; transition:transform .15s; }
    [aria-expanded="false"] .chev { transform:rotate(-90deg); }
    .body { min-height:0; max-height:min(56vh,540px); overflow:auto; scrollbar-width:thin; scrollbar-color:transparent transparent; }
    .section { margin:0 10px; border-top:1px solid var(--line); }
    .section-head { display:flex; align-items:center; gap:2px; padding:5px 0; }
    .section-toggle { display:flex; flex:1; align-items:center; gap:7px; min-width:0; text-align:left; padding:6px 2px; border-radius:6px; font-size:11px; font-weight:600; color:var(--muted); }
    .add-credits { display:inline-flex; align-items:center; justify-content:center; gap:5px; align-self:flex-start; margin-top:8px; border:1px solid var(--line); border-radius:7px; padding:5px 9px; color:var(--fg); background:var(--surface); font:12px/1.4 ui-sans-serif,system-ui,sans-serif; text-decoration:none; }
    .add-credits:hover { background:var(--hover); }
    .add-credits:focus-visible { outline:2px solid var(--ok); outline-offset:2px; }
    .add-credits svg { width:13px; height:13px; }
    .compact .add-credits { margin-top:5px; padding:3px 7px; font-size:11px; }
    .credit-meter { margin-top:8px; }
    .credit-meter .rl { font-size:11px; }
    .credit-meter .v { font-size:11px; }
    .credit-reference-controls [data-credit-reference] { width:94px; }
    .compact .credit-meter { margin-top:5px; }
    .compact .credit-actions { display:flex; align-items:center; gap:10px; }
    .compact .credit-actions .credit-meter { flex:1; min-width:0; }
    .compact .credit-actions .add-credits { flex:none; align-self:center; margin-top:0; white-space:nowrap; }
    .credit-inline { color:var(--fg); font-size:12px; font-weight:600; font-variant-numeric:tabular-nums; }
    .section-toggle .chev { margin-left:auto; }
    .section-handle { width:22px; height:24px; cursor:grab; }
    .section-content { padding:1px 2px 6px; }
    .row { padding:5px 0 8px; }
    .rl,.kv { display:flex; align-items:baseline; justify-content:space-between; gap:8px; }
    .rl>span:first-child { min-width:0; overflow-wrap:anywhere; }
    .v { font-size:12px; font-weight:600; font-variant-numeric:tabular-nums; flex-shrink:0; }
    .bar { height:4px; background:var(--track); border-radius:9px; overflow:hidden; margin:7px 0 5px; }
    .bar i { display:block; height:100%; border-radius:9px; background:var(--ok); }
    .bar i.remaining { background:var(--remaining); }
    .bar i.warn { background:var(--warn); } .bar i.bad { background:var(--bad); }
    .sub,.empty,.note { color:var(--muted); font-size:11px; line-height:1.5; }
    .empty { padding-bottom:8px; }
    .credit { font-size:23px; font-weight:600; letter-spacing:-.6px; font-variant-numeric:tabular-nums; }
    .foot { flex-shrink:0; display:flex; align-items:center; justify-content:space-between; gap:8px; padding:2px 22px 2px 12px; line-height:1.45; color:var(--muted); font-size:10px; }
    .text-btn { color:var(--muted); border-radius:4px; padding:3px; font-size:10px; }
    .err { margin:8px 12px; font-size:11px; color:var(--bad); overflow-wrap:anywhere; }
    pre { margin:0 12px 10px; padding:8px; background:var(--hover); border-radius:8px; max-height:160px; overflow:auto; white-space:pre-wrap; overflow-wrap:anywhere; font:10px/1.5 ui-monospace,monospace; }
    .settings { position:fixed; inset:auto; margin:0; padding:14px; width:min(300px,calc(100vw - 16px)); max-height:calc(100dvh - 16px); overflow:auto; border:1px solid var(--line); border-radius:14px; box-shadow:0 10px 40px #0004; }
    .settings:not(:popover-open) { display:none; }
    .settings::backdrop { background:transparent; }
    .settings-title { display:flex; align-items:center; justify-content:space-between; margin-bottom:16px; font-weight:600; }
    .checks { padding-top:10px; border-top:1px solid var(--line); }
    .checks label { width:100%; padding:5px 0; justify-content:space-between; }
    .modules-title { font-size:11px; font-weight:600; color:var(--muted); margin-top:6px; }
    .settings .reset { font-size:11px; margin-top:8px; }
    .settings .note { margin-top:8px; }
    .setting { display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:10px; font-size:12px; }
    select { background:var(--surface); border:1px solid var(--line); border-radius:6px; padding:4px; max-width:145px; font-size:11px; }
    .checks { display:flex; flex-wrap:wrap; gap:8px; font-size:11px; margin-bottom:10px; }
    .checks label { display:flex; align-items:center; gap:4px; } input { accent-color:var(--ok); margin:0; }
    .busy .refresh svg { animation:spin 1s linear infinite; } @keyframes spin { to { transform:rotate(360deg); } }
    :host([data-floating]) { position:fixed; width:min(300px,calc(100vw - 16px)); z-index:2147483000; }
    :host([data-floating]) .card { margin:0; }
    :host([data-floating]) .card:hover, :host([data-floating]) .card:has(:focus-visible) { box-shadow:0 8px 32px #0003; }
    .resize { position:absolute; bottom:2px; right:2px; width:22px; height:22px; color:var(--muted); cursor:ns-resize; touch-action:none; border-radius:5px; display:grid; place-items:center; }
    .resize svg { width:12px; height:12px; }
    :host([data-floating]) .resize { cursor:nwse-resize; }
    .card.sized .body { max-height:none; flex:1; }
    .drag-over { border-top:2px solid var(--ok); }
    .summary { padding:0 12px 8px; color:var(--muted); font-size:11px; }
    .card.compact { font-size:12px; line-height:1.4; border-radius:10px; }
    .compact .head { padding:5px 6px; min-height:38px; }
    .compact .icon { width:24px; height:24px; }
    .compact svg { width:14px; height:14px; }
    .compact .chev { width:11px; }
    .compact .badge { font-size:9px; }
    .compact .section { margin:0 8px; }
    .compact .section-head { padding:2px 0; }
    .compact .section-toggle { padding:4px 1px; font-size:11px; gap:5px; }
    .compact .section-content { padding:0 1px 3px; }
    .compact .row { padding:3px 0 5px; }
    .compact .v { font-size:11px; }
    .compact .sub,.compact .empty { font-size:11px; line-height:1.35; }
    .compact .bar { height:3px; margin:4px 0; }
    .compact .credit { font-size:19px; line-height:1.3; }
    .compact .foot { padding:1px 22px 1px 9px; }
    .foot:not(:has(.updated-at)) { justify-content:flex-end; }
    .margin-input { display:flex; align-items:center; gap:5px; color:var(--muted); }
    .margin-input input { width:62px; padding:4px 5px; border:1px solid var(--line); border-radius:6px; background:var(--surface); color:var(--fg); font:inherit; }
    .foot .text-btn { padding:1px 3px; }
    .compact .summary { padding:0 9px 5px; }
    .compact-toggle { padding-top:8px; border-top:1px solid var(--line); }
    .compact-toggle input { width:16px; height:16px; cursor:pointer; }
    /* Opacity preserves layout and tab order while keeping the idle view quiet. */
    .card .grab,.card .refresh,.card .customize,.card .collapse-panel,.card .section-handle,.card .foot,.card .chev { opacity:0; pointer-events:none; }
    .card:hover .grab,.card:hover .refresh,.card:hover .customize,.card:hover .collapse-panel,.card:hover .section-handle,.card:hover .foot,.card:hover .chev,
    .card:has(:focus-visible) .grab,.card:has(:focus-visible) .refresh,.card:has(:focus-visible) .customize,.card:has(:focus-visible) .collapse-panel,.card:has(:focus-visible) .section-handle,.card:has(:focus-visible) .foot,.card:has(:focus-visible) .chev { opacity:1; pointer-events:auto; }
    :host([data-settings-open]) .customize { opacity:1; pointer-events:auto; }
    .compact .plan-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(112px,100%),1fr)); column-gap:14px; position:relative; }
    .compact .plan-row { min-width:0; border-radius:4px; }
    .compact .plan-row .rl { gap:4px; }
    .compact .plan-row .sub { white-space:nowrap; font-size:11px; }
    .compact .plan-row .at-limit { color:var(--bad); }
    .plan-tip { display:none; position:absolute; left:0; right:0; top:0; z-index:2; padding:5px 7px; border:1px solid var(--line); border-radius:6px; background:var(--surface); color:var(--fg); font-size:11px; line-height:1.35; box-shadow:0 2px 8px #0003; pointer-events:none; }
    .plan-row:hover .plan-tip,.plan-row:focus-visible .plan-tip { display:block; }
    .plan-row:focus-visible { outline:2px solid var(--ok); outline-offset:2px; }
    @media(hover:none) { .card .grab,.card .refresh,.card .customize,.card .collapse-panel,.card .section-handle,.card .foot,.card .chev { opacity:1; pointer-events:auto; } }
    .card .head .grab { width:0; min-width:0; margin-right:-3px; overflow:hidden; }
    .card:hover .head .grab,.card:has(:focus-visible) .head .grab { width:28px; margin-right:0; overflow:visible; }
    .card.compact:hover .head .grab,.card.compact:has(:focus-visible) .head .grab { width:24px; }
    @media(hover:none) { .card .head .grab { width:28px; margin-right:0; overflow:visible; } .card.compact .head .grab { width:24px; } }
    .feature-options { margin:0; padding:0 0 0 10px; border-left:1px solid var(--line); }
    .feature-settings { border-top:1px solid var(--line); padding-top:9px; margin-top:4px; }
    .feature-settings-title { font-size:11px; font-weight:600; color:var(--muted); margin-bottom:6px; }
    .feature-options label { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:5px 0; font-size:11px; overflow-wrap:anywhere; }
    .feature-options input { flex-shrink:0; }
    .usage-icon { display:inline-flex; flex:0 0 20px; width:20px; color:var(--fg); }
    .usage-icon svg,.compact .usage-icon svg { width:20px; height:20px; }
    .settings { padding:0; width:min(324px,calc(100vw - 16px)); }
    .settings-title { position:sticky; top:0; z-index:3; background:var(--surface); margin:0; padding:12px 14px; border-bottom:1px solid var(--line); }
    .settings-header { position:sticky; top:0; z-index:3; background:var(--surface); }
    .settings-header .settings-title { position:static; border:0; padding-bottom:8px; }
    .settings-tabs { display:flex; gap:4px; padding:0 12px 10px; border-bottom:1px solid var(--line); }
    .settings-tab { flex:1; border-radius:7px; padding:6px 10px; font-size:12px; color:var(--muted); }
    .settings-tab[aria-selected="true"] { background:var(--hover); color:var(--fg); font-weight:600; }
    .settings-body { padding:0 12px; }
    .settings-panel[hidden] { display:none !important; }
    .module-hint { color:var(--muted); font-size:10.5px; padding:0 0 5px; }

    .settings-section { border-bottom:1px solid var(--line); }
    .settings-section:last-child { border-bottom:0; }
    .settings-section>summary { display:flex; align-items:center; gap:8px; cursor:pointer; list-style:none; padding:11px 2px; font-size:12px; font-weight:600; }
    .settings-section>summary::-webkit-details-marker { display:none; }
    .settings-section>summary .chev { margin-left:auto; }
    .settings-section:not([open])>summary .chev { transform:rotate(-90deg); }
    .settings-section>summary:focus-visible { outline:2px solid var(--ok); outline-offset:-2px; border-radius:6px; }
    .settings-section-content { padding:2px 2px 10px; }
    .settings-section .setting { margin:0; padding:7px 0; border:0; font-size:11.5px; }
    .settings-section .checks { margin:0; padding:0; border:0; }
    .settings-section .feature-settings { border:0; margin:0; padding:4px 0 0; }
    .settings-help { font-size:10.5px; color:var(--muted); padding:10px 14px; border-top:1px solid var(--line); }
    .settings-help .reset { font-size:11px; margin:6px 0 0; padding:5px 0; }
    .body { scrollbar-width:thin; scrollbar-color:transparent transparent; scrollbar-gutter:stable; }
    .settings { scrollbar-width:thin; scrollbar-color:var(--track) transparent; scrollbar-gutter:stable; }
    .card:hover .body,.card:has(:focus-visible) .body { scrollbar-color:var(--track) transparent; }
    .body::-webkit-scrollbar,.settings::-webkit-scrollbar { width:6px; }
    .body::-webkit-scrollbar-track,.settings::-webkit-scrollbar-track { background:transparent; }
    .body::-webkit-scrollbar-thumb { background:transparent; border-radius:6px; }
    .settings::-webkit-scrollbar-thumb { background:var(--track); border-radius:6px; }
    .card:hover .body::-webkit-scrollbar-thumb,.card:has(:focus-visible) .body::-webkit-scrollbar-thumb { background:var(--track); }
    @media(hover:none) { .body { scrollbar-color:var(--track) transparent; } }
    .credits-modal { position:fixed; inset:0; margin:auto; padding:0; width:min(900px,calc(100vw - 40px)); height:min(740px,calc(100dvh - 40px)); max-width:none; max-height:none; border:1px solid var(--line); border-radius:16px; box-shadow:0 20px 80px #0006; }
    .credits-modal:not([open]) { display:none; }
    .credits-modal::backdrop { background:#0009; }
    .credits-header { display:flex; align-items:center; gap:10px; padding:12px 16px; border-bottom:1px solid var(--line); flex-shrink:0; }
    .credits-header h2 { font:600 14px/1.4 ui-sans-serif,system-ui,sans-serif; margin:0; flex:1; }
    .credit-external { color:var(--fg); text-decoration:none; font-size:12px; border-radius:6px; padding:5px 8px; }
    .credit-external:hover { background:var(--hover); }
    .credit-external:focus-visible { outline:2px solid var(--ok); outline-offset:2px; }
    .credits-frame { display:block; border:0; width:100%; flex:1; min-height:0; background:var(--surface); }
    .credits-status { margin:0; padding:8px 16px; font-size:11px; color:var(--muted); border-bottom:1px solid var(--line); flex-shrink:0; }
    @media(max-width:480px) { .credits-modal { width:calc(100vw - 16px); height:calc(100dvh - 16px); } .credits-header { padding:10px; gap:4px; } }
    .dock-zone { position:fixed; z-index:2147483001; margin:0; height:36px; padding:7px 10px; flex-direction:row; justify-content:center; align-items:center; border:1px dashed var(--muted); border-radius:9px; background:var(--surface); color:var(--muted); font-size:12px; pointer-events:none; box-shadow:0 2px 12px #0003; }
    .dock-zone.active { border:2px solid var(--ok); color:var(--fg); background:var(--hover); }
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
  const USAGE_ICON = `<svg aria-hidden="true" height="20" viewBox="0 0 20 20" width="20" xmlns="http://www.w3.org/2000/svg"><path d="M10.0017 1.83496C10.9451 1.83499 11.8556 1.9809 12.7117 2.25098C13.0619 2.36148 13.2567 2.73471 13.1462 3.08496C13.0357 3.43506 12.6624 3.62884 12.3123 3.51855C11.5841 3.28882 10.8078 3.16507 10.0017 3.16504C5.76585 3.16504 2.33179 6.5991 2.33179 10.835C2.33186 12.8582 3.11408 14.6974 4.39429 16.0684C4.64484 16.3367 4.63109 16.7571 4.36304 17.0078C4.09461 17.2585 3.67328 17.244 3.42261 16.9756C1.92156 15.3681 1.00178 13.2083 1.00171 10.835C1.00171 5.86457 5.03131 1.83496 10.0017 1.83496Z" fill="currentColor"></path><path d="M17.7751 7.74902C18.1261 7.64142 18.4984 7.83849 18.6062 8.18945C18.8633 9.02663 19.0007 9.91545 19.0007 10.835C19.0007 13.2083 18.0819 15.369 16.5808 16.9766C16.3302 17.2449 15.9088 17.2583 15.6404 17.0078C15.3723 16.7572 15.3577 16.3367 15.6082 16.0684C16.8883 14.6974 17.6716 12.8582 17.6716 10.835C17.6716 10.0493 17.5534 9.29214 17.3347 8.58008C17.2269 8.22899 17.4241 7.85683 17.7751 7.74902Z" fill="currentColor"></path><path d="M14.8269 5.0957C15.0864 4.83644 15.5076 4.8368 15.7673 5.0957C16.027 5.35536 16.0269 5.7774 15.7673 6.03711L12.2273 9.57617C12.438 9.94814 12.5603 10.377 12.5603 10.835C12.5602 12.2482 11.4149 13.3934 10.0017 13.3936C8.58836 13.3936 7.44228 12.2483 7.44214 10.835C7.4422 9.42157 8.58831 8.27539 10.0017 8.27539C10.4735 8.27544 10.9143 8.40519 11.2937 8.62793L14.8269 5.0957ZM10.0017 9.60547C9.32285 9.60547 8.77228 10.1561 8.77222 10.835C8.77236 11.5137 9.3229 12.0635 10.0017 12.0635C10.6804 12.0633 11.2301 11.5137 11.2302 10.835C11.2302 10.1562 10.6804 9.60561 10.0017 9.60547Z" fill-rule="evenodd" clip-rule="evenodd" fill="currentColor"></path></svg>`;
  const host = document.createElement('div'); host.id='gptu-usage-host';
  const root=host.attachShadow({mode:'open'});
  root.innerHTML=`<style>${CSS}</style><div class="panel-layout"><div class="card" part="card">
    <div class="head"><button class="icon grab" aria-label="Drag panel; use arrow keys to move, Escape to dock" title="Drag to float · Arrow keys to move · Escape to dock">${icon('grip')}</button>
    <button class="usage-open" aria-label="Open usage overview" title="Open usage overview"><span class="usage-icon">${USAGE_ICON}</span><span class="title">Usage</span><span class="badge" hidden></span></button><button class="icon toggle collapse-panel" aria-expanded="true" aria-label="Collapse usage panel" title="Collapse usage panel">${icon('chevron')}</button>
    <button class="icon refresh" title="Refresh usage" aria-label="Refresh usage">${icon('refresh')}</button>
    <button class="icon customize" title="Customize panel" aria-label="Customize panel" aria-expanded="false">${icon('settings')}</button></div>
    <div class="summary" hidden></div><div class="body"></div><button class="resize" aria-label="Resize panel" title="Drag to resize · Arrow keys to resize · Double-click to reset size"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" aria-hidden="true"><path d="m5 13 8-8m-3 8 3-3"/></svg></button><div class="live" aria-live="polite"></div></div></div><div class="settings" popover="auto" role="dialog" aria-label="Usage settings"></div><dialog class="credits-modal" aria-labelledby="gptu-page-heading"><div class="credits-header"><h2 id="gptu-page-heading">Add credits</h2><a class="credit-external" target="_blank" rel="noopener noreferrer">Open in tab</a><button class="icon credits-close" aria-label="Close credits">✕</button></div><p class="credits-status" role="status">Loading credits…</p><template class="credits-frame-template"><iframe class="credits-frame" title="ChatGPT credits purchase" allow="payment" sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads"></iframe></template></dialog><div class="dock-targets" hidden aria-hidden="true"><div class="dock-zone" data-dock="top">Dock at top</div><div class="dock-zone" data-dock="bottom">Dock at bottom</div></div>`;
  const $=s=>root.querySelector(s), card=$('.card');
  let busyTimer, settingsOpen=false, drag=null, resizing=null, sectionDrag=null;
  const ui={ setBusy(b) { card.classList.toggle('busy',b); $('.refresh').disabled=b; $('.refresh').setAttribute('aria-busy',String(b)); clearTimeout(busyTimer); if(b) busyTimer=setTimeout(()=>{ui.setBusy(false); state.error='Refresh timed out. Try again.'; render();},20000); } };
  const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const level=p=>p>=90?'bad':p>=75?'warn':'';
  const labels={plan:'Plan limits',credits:'Credits',features:'Models & features'};
  const featureNames={deep_research:'Deep Research',file_upload:'File uploads',paste_text_to_file:'Paste text to file',image_gen:'Image generation'};
  const featureLabel=name=>featureNames[name]||name.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
  const format=n=>new Intl.NumberFormat(undefined,{maximumFractionDigits:2}).format(n);
  const bar=(p,label,remaining=false)=>`<div class="bar" role="progressbar" aria-label="${esc(label)} ${remaining?'remaining':'used'}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${p}"><i class="${remaining?'remaining':level(p)}" style="width:${p}%"></i></div>`;
  function creditPurchaseUrl(){
    const url=new URL('/pricing/credits',location.origin);
    url.searchParams.set('source','chatgpt_web_merged');
    url.searchParams.set('return_to',location.pathname+location.search+location.hash);
    return url.href;
  }
  function updateCreditLink(event){
    const link=event.target.closest?.('.add-credits');
    if(link)link.href=creditPurchaseUrl();
  }
  root.addEventListener('pointerdown',updateCreditLink);
  root.addEventListener('click',event=>{
    const link=event.target.closest?.('.add-credits');if(!link)return;
    updateCreditLink(event);
    if(event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
    event.preventDefault();openCreditDialog(link);
  });
  root.addEventListener('auxclick',updateCreditLink);
  let creditReturnFocus=null,creditReturnPath='',creditWatch=null,creditLoadTimeout=null;
  function openCreditDialog(link){openPageDialog(creditPurchaseUrl(),'Add credits',link,true);}
  function openPageDialog(url,title,returnFocus,closeOnReturn=false){
    const dialog=$('.credits-modal');
    if(dialog.open){$('.credits-close').focus();return;}
    if(settingsOpen)closeSettings();
    const frame=$('.credits-frame-template').content.firstElementChild.cloneNode(true);
    frame.addEventListener('load',()=>creditFrameLoaded(frame));
    creditReturnFocus=returnFocus;creditReturnPath=location.pathname+location.search+location.hash;
    $('#gptu-page-heading').textContent=title;frame.title=title==='Add credits'?'ChatGPT credits purchase':'ChatGPT usage overview';
    $('.credit-external').href=url;$('.credits-status').textContent='Loading…';$('.credits-status').hidden=false;
    frame.src=url;dialog.appendChild(frame);dialog.showModal();$('.credits-close').focus();
    creditLoadTimeout=setTimeout(()=>{if(dialog.open){$('.credits-status').textContent='If the page stays blank, choose Open in tab.';$('.credits-status').hidden=false;}},12000);
    if(closeOnReturn)creditWatch=setInterval(()=>{
      try{const destination=new URL(frame.contentWindow.location.href);if(destination.origin===location.origin&&destination.pathname+destination.search+destination.hash===creditReturnPath){dialog.close();requestRefresh(false);}}catch(_){}
    },1000);
  }
  $('.usage-open').onclick=()=>openPageDialog(new URL('/settings/usage?tab=overview',location.origin).href,'Usage',$('.usage-open'));
  $('.credits-close').onclick=()=>$('.credits-modal').close();
  $('.credits-modal').addEventListener('close',()=>{
    clearInterval(creditWatch);clearTimeout(creditLoadTimeout);creditWatch=null;
    $('.credits-frame')?.remove();
    const target=creditReturnFocus?.isConnected?creditReturnFocus:$('.add-credits');target?.focus();creditReturnFocus=null;
  });
  $('.credits-modal').addEventListener('click',event=>{
    if(event.target!==$('.credits-modal'))return;
    const r=event.target.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)event.target.close();
  });
  function prepareEmbeddedPage(frame){
    try{
      const doc=frame.contentDocument;if(!doc?.head||doc.getElementById('gptu-embedded-page-style'))return;
      const style=doc.createElement('style');style.id='gptu-embedded-page-style';
      style.textContent=`
        .app-shell-left-panel, #stage-slideover-sidebar, [data-testid="sidebar"],
        aside:has(#app-shell-sidebar), #app-shell-sidebar,
        [data-testid="open-sidebar-button"], [data-testid="close-sidebar-button"],
        button[aria-label="Open sidebar"], button[aria-label="Close sidebar"], button[aria-label="Show sidebar"] { display:none !important; }
      `;
      doc.head.appendChild(style);
    }catch(_){}
  }
  function creditFrameLoaded(frame){
    if(!$('.credits-modal').open||frame!==$('.credits-frame'))return;
    prepareEmbeddedPage(frame);
    clearTimeout(creditLoadTimeout);$('.credits-status').hidden=true;
    try{frame.contentDocument?.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();$('.credits-modal').close();}});}catch(_){}
  }
  const accentNames={auto:'Match theme',default:'Default',blue:'Blue',green:'Green',yellow:'Yellow',pink:'Pink',orange:'Orange',purple:'Purple',neutral:'Black / White'};
  const themeProbe=document.createElement('span');themeProbe.hidden=true;root.appendChild(themeProbe);
  function applyTheme() {
    const html=document.documentElement,body=document.body,nav=findSidebarNav();
    const htmlStyle=getComputedStyle(html),bodyStyle=getComputedStyle(body),appStyle=getComputedStyle(document.getElementById('root')||body),navStyle=nav?getComputedStyle(nav):appStyle;
    const systemDark=matchMedia('(prefers-color-scheme: dark)').matches;
    let dark=state.theme==='dark'||state.theme==='system'&&systemDark||state.theme==='auto'&&(html.classList.contains('dark')||html.dataset.theme==='dark'||(!html.classList.contains('light')&&html.dataset.theme!=='light'&&(htmlStyle.colorScheme==='dark'||htmlStyle.colorScheme!=='light'&&systemDark)));
    const variants=THEME_PRESETS.filter(p=>p.family===state.preset),preset=variants.find(p=>p.type===(dark?'dark':'light'))||variants[0];
    if(preset)dark=preset.type==='dark';
    host.toggleAttribute('data-dark',dark);
    const resolve=value=>{if(!value)return null;if(!globalThis.CSS.supports('color',value)){value=value.includes('%')?`hsl(${value})`:`rgb(${value})`;if(!globalThis.CSS.supports('color',value))return null;}themeProbe.style.color=value;const color=getComputedStyle(themeProbe).color;return color==='transparent'||color==='rgba(0, 0, 0, 0)'?null:color;};
    const nativeColor=(names,fallback)=>{for(const name of names){const value=navStyle.getPropertyValue(name).trim()||appStyle.getPropertyValue(name).trim()||bodyStyle.getPropertyValue(name).trim()||htmlStyle.getPropertyValue(name).trim();const color=resolve(value);if(color)return color;}return fallback;};
    const palette={default:dark?'#60a5fa':'#2563eb',blue:dark?'#60a5fa':'#2563eb',green:dark?'#4ade80':'#15803d',yellow:dark?'#facc15':'#a16207',pink:dark?'#f472b6':'#be185d',orange:dark?'#fb923c':'#c2410c',purple:dark?'#c084fc':'#7e22ce',neutral:dark?'#ececec':'#202123'};
    const nativeAccent=(html.dataset.accentColor||body.dataset.accentColor||html.dataset.accent||body.dataset.accent||'').toLowerCase();
    const accent=state.accent==='auto'?(preset?preset.accent:state.preset==='chatgpt'?palette.default:nativeColor(['--color-accent','--theme-accent','--accent','--accent-color','--codex-accent','--interactive-bg-accent-default','--bg-accent','--text-accent','--accent-primary','--theme-user-selection-bg'],palette[nativeAccent]||(nativeAccent==='black'||nativeAccent==='white'?palette.neutral:palette.default))):palette[state.accent];
    const colors={'--remaining':accent,'--ok':accent};
    if(state.preset==='auto'&&state.theme==='auto'){
      if(nav){
        colors['--fg']=getComputedStyle(nav).color;
        for(let el=nav;el;el=el.parentElement){const bg=getComputedStyle(el).backgroundColor;if(bg!=='transparent'&&bg!=='rgba(0, 0, 0, 0)'){colors['--surface']=bg;break;}}
      }
      colors['--muted']=nativeColor(['--color-text-secondary','--muted-foreground','--text-secondary','--text-tertiary'],`color-mix(in srgb, ${colors['--fg']|| (dark?'#ececec':'#202123')} 70%, ${colors['--surface']|| (dark?'#000000':'#f9f9f9')})`);
      colors['--line']=nativeColor(['--color-border','--border','--border-default','--border-light'],`color-mix(in srgb, ${colors['--fg']|| (dark?'#ececec':'#202123')} 18%, ${colors['--surface']|| (dark?'#000000':'#f9f9f9')})`);
      colors['--hover']=nativeColor(['--color-surface-hover','--sidebar-surface-secondary','--bg-hover'],`color-mix(in srgb, ${colors['--fg']|| (dark?'#ececec':'#202123')} 8%, ${colors['--surface']|| (dark?'#000000':'#f9f9f9')})`);
    }
    if(colors['--surface'])colors['--track']=`color-mix(in srgb, ${colors['--fg']|| (dark?'#ececec':'#202123')} 15%, ${colors['--surface']})`;
    if(preset)Object.assign(colors,{'--surface':preset.surface,'--fg':preset.fg,'--muted':preset.muted,'--line':preset.border,'--hover':preset.hover,'--track':`color-mix(in srgb, ${preset.fg} 15%, ${preset.surface})`});
    const nativeContrast=(html.dataset.contrast||body.dataset.contrast||html.dataset.colorContrast||body.dataset.colorContrast||'system').toLowerCase();
    const increased=state.contrast==='increased'||(state.contrast==='system'||state.contrast==='auto'&&nativeContrast==='system')&&matchMedia('(prefers-contrast: more)').matches||state.contrast==='auto'&&['increased','high','more'].includes(nativeContrast);
    if(increased)Object.assign(colors,{'--fg':dark?'#ffffff':'#000000','--muted':dark?'#d4d4d4':'#424242','--line':dark?'#858585':'#727272','--track':dark?'#454545':'#d4d4d4'});
    host.toggleAttribute('data-increased-contrast',increased);
    for(const el of root.querySelectorAll('.card,.settings,.credits-modal,.dock-zone'))for(const key of ['--remaining','--ok','--fg','--surface','--muted','--line','--hover','--track']){
      const value=colors[key]||'';
      if(value){if(el.style.getPropertyValue(key)!==value)el.style.setProperty(key,value);}else if(el.style.getPropertyValue(key))el.style.removeProperty(key);
    }
  }
  function renderSettings() {
    $('.customize').setAttribute('aria-expanded',String(settingsOpen));
    const toggle=(label,attr,checked)=>`<label class="setting"><span>${label}</span><input type="checkbox" role="switch" aria-label="${label}" ${attr} ${checked?'checked':''}></label>`;
    const select=(label,key,choices)=>`<label class="setting"><span>${label}</span><select aria-label="${label}" data-setting="${key}">${Object.entries(choices).map(([value,text])=>`<option value="${value}" ${state[key]===value?'selected':''}>${text}</option>`).join('')}</select></label>`;
    const moduleToggle=key=>toggle('Show '+labels[key],`data-visible="${key}"`,!state.hidden[key]);
    const group=(key,label,content)=>`<details class="settings-section" data-settings-section="${key}" ${!state.settingsClosed[key]?'open':''}><summary>${icon(['plan','credits','features'].includes(key)?key:'settings')}<span>${label}</span>${icon('chevron')}</summary><div class="settings-section-content">${content}</div></details>`;
    const profile=spacingProfile();
    const box=key=>`<div class="spacing-box"><span class="spacing-box-title">${SPACING_AREAS[key].label}</span><div class="spacing-grid">${spacingValues(profile,key).map((value,side)=>`<label><span>${SPACING_SIDES[side]}</span><input type="number" min="0" max="120" step="1" value="${value}" aria-label="${SPACING_AREAS[key].label} ${SPACING_SIDES[side].toLowerCase()} spacing" data-space-area="${key}" data-space-side="${side}" data-space-profile="${profile}"></label>`).join('')}</div></div>`;
    const tab=(key,content)=>`<div class="settings-panel" role="tabpanel" id="gptu-settings-${key}" aria-labelledby="gptu-tab-${key}" ${state.settingsTab===key?'':'hidden'}>${content}</div>`;
    const themeSelect=`<label class="setting"><span>Theme preset</span><select aria-label="Theme preset" data-setting="preset"><optgroup label="ChatGPT"><option value="auto" ${state.preset==='auto'?'selected':''}>Match ChatGPT</option><option value="chatgpt" ${state.preset==='chatgpt'?'selected':''}>ChatGPT</option></optgroup><optgroup label="Codex themes">${THEME_FAMILIES.map(name=>`<option value="${esc(name)}" ${state.preset===name?'selected':''}>${esc(name)}</option>`).join('')}</optgroup></select></label>`;
    $('.settings').innerHTML=`<div class="settings-header"><div class="settings-title" title="Drag to move settings · Double-click to reset position"><button class="icon settings-grab" aria-label="Move settings" title="Drag or use arrow keys · Home resets position">${icon('grip')}</button><span>Usage settings</span><button class="icon close-settings" aria-label="Close settings">✕</button></div><div class="settings-tabs" role="tablist" aria-label="Settings categories">${Object.entries(SETTINGS_TABS).map(([key,label])=>`<button class="settings-tab" role="tab" id="gptu-tab-${key}" aria-controls="gptu-settings-${key}" aria-selected="${state.settingsTab===key}" tabindex="${state.settingsTab===key?0:-1}" data-settings-tab="${key}">${label}</button>`).join('')}</div></div><div class="settings-body">${
      tab('panel',group('placement','Layout',select('Placement','position',{top:'Sidebar top',bottom:'Sidebar bottom',floating:'Floating'})+toggle('Compact mode','data-compact',state.compact))+group('visibility','Visibility',toggle('Hide docked panel with sidebar','data-hide-with-sidebar',state.hideWithSidebar)+toggle('Hide collapsed Usage until hover','data-hide-collapsed',state.hideCollapsed))+group('status','Update time & Details',toggle('Show update time','data-show-update',state.showUpdateTime)+toggle('Show Details button','data-show-details',state.showDetails)+toggle('Update time and Details at top','data-footer-top',state.footerPosition==='top')))+
      tab('modules',group('plan','Plan limits',moduleToggle('plan')+toggle('Show remaining plan allowance','data-remaining-plan',state.showRemainingPlan)+toggle('Plan limit tooltips','data-plan-tooltips',state.showPlanTooltips))+group('credits','Credits',moduleToggle('credits')+toggle('Show credit balance bar','data-credit-bar',state.showCreditBar)+`<div class="credit-reference-controls" ${state.showCreditBar?'':'hidden'}>${toggle('Show available balance','data-credit-balance',state.showCreditBalance)}<label class="setting"><span>Full balance</span><span class="margin-input"><input type="number" aria-label="Full credit balance" min="0.01" step="any" data-credit-reference value="${state.creditReference??''}" placeholder="e.g. 1000">credits</span></label><div class="note">This amount counts as 100%. Initially uses your balance when enabled; you can change it.</div></div>`+toggle('Add credits button','data-add-credits',state.showAddCredits))+group('features','Models & features',moduleToggle('features')+`<div class="feature-settings"><div class="feature-settings-title">Individual counters</div><div class="feature-options" role="group" aria-label="Models & features to show"></div><div class="note">Selections are kept when the module is hidden.</div></div>`))+
      tab('appearance',group('appearance','Theme & mode',themeSelect+select('Appearance','theme',{auto:'Match ChatGPT',system:'System',light:'Light',dark:'Dark'})+`<div class="note">Match ChatGPT follows the page palette and custom colors. Codex presets use available light/dark variants; some have only one mode.</div>`)+group('colors','Accent & contrast',select('Accent color','accent',accentNames)+select('Contrast','contrast',{auto:'Match ChatGPT',system:'System',medium:'Medium',increased:'Increased'})))+
      tab('spacing',`${select('Editing spacing','spacingMode',{auto:'Current density',normal:'Normal',compact:'Compact'})}<div class="note">Editing ${profile==='normal'?'normal':'compact'} mode. All values are in pixels. Inside frame controls the space within the border; outside frame controls the surrounding gap.</div>`+group('spacePanel','Panel & header',['outer','frame','header'].map(box).join(''))+group('spaceStatus','Update time & summary',['status','statusButton','summary'].map(box).join(''))+group('spaceModules','Module spacing',['plan','credits','features','sectionHeader','sectionContent'].map(box).join(''))+group('spaceItems','Items & credits',['planRows','featureRows','creditBalance','creditMeter','addCredits'].map(box).join(''))+group('spaceBars','Bars & captions',['planBars','creditBars','featureBars','captions'].map(box).join(''))+group('spaceDetails','Expanded Details',['details','detailsContent'].map(box).join(''))+`<button class="text-btn reset-spacing" data-reset-spacing="${profile}">Reset ${profile} spacing</button>`)
    }</div><div class="settings-help"><details><summary>Moving & keyboard controls</summary><div class="note">Drag this window by its title. Double-click the title to return it beside the panel. Use arrow keys on a move or reorder handle.</div></details><button class="text-btn reset">Reset all settings</button></div>`;
    renderFeatureSettings();positionSettings();
  }
  function selectSettingsTab(key,focus=false){
    if(!Object.hasOwn(SETTINGS_TABS,key))return;
    state.settingsTab=key;persist();
    if(key==='spacing')renderSettings();
    for(const el of root.querySelectorAll('[data-settings-tab]')){const selected=el.dataset.settingsTab===key;el.setAttribute('aria-selected',String(selected));el.tabIndex=selected?0:-1;if(selected&&focus)el.focus();}
    for(const el of root.querySelectorAll('.settings-panel'))el.hidden=el.id!=='gptu-settings-'+key;
    $('.settings').scrollTop=0;positionSettings();
  }
  function renderFeatureSettings(){
    const active=root.activeElement?.dataset.feature;
    const names=[...new Set([...Object.keys(featureNames),...Object.keys(state.models),...Object.keys(state.hiddenFeatures)])];
    $('.feature-options').innerHTML=names.map(name=>`<label><span>${esc(featureLabel(name))}</span><input type="checkbox" role="switch" aria-label="Show ${esc(featureLabel(name))} counter" data-feature="${esc(name)}" ${state.hiddenFeatures[name]!==true?'checked':''}></label>`).join('');
    if(active)[...$('.feature-options').querySelectorAll('[data-feature]')].find(el=>el.dataset.feature===active)?.focus();
  }
  function render() {
    applyTheme();
    card.classList.toggle('collapsed',!!state.collapsed);
    card.classList.toggle('compact',!!state.compact);
    card.classList.toggle('hide-collapsed',!!state.hideCollapsed);
    applySize();
    const parsed=parseUsage(state.usage), plan=parsed.plan||state.plan;
    $('.badge').hidden=!plan; $('.badge').textContent=plan||'';
    $('.toggle').setAttribute('aria-expanded',String(!state.collapsed));
    $('.toggle').title=state.collapsed?'Expand usage panel':'Collapse usage panel';$('.toggle').setAttribute('aria-label',$('.toggle').title);
    $('.body').hidden=!!state.collapsed;
    const pcts=parsed.rows.map(r=>r.pct).filter(p=>p!=null);
    $('.summary').hidden=!state.collapsed;
    $('.summary').textContent=pcts.length?`${Math.round(state.showRemainingPlan?100-Math.max(...pcts):Math.max(...pcts))}% ${state.showRemainingPlan?'left':'used'}${state.showUpdateTime?' · '+fmtAgo(state.usageAt):''}`:'No usage reported yet';
    const blocks={};
    blocks.plan=parsed.rows.length?`<div class="plan-grid">${parsed.rows.map(r=>{
      const left=r.resetsAt?r.resetsAt-Date.now():null;
      const reset=left==null?'Reset not reported':left>0?`Resets in ${fmtDur(left)}`:'Reset · refresh to update';
      const displayed=r.pct==null?null:state.showRemainingPlan?100-r.pct:r.pct;
      const full=`${r.label}: ${displayed==null?'Usage not reported':Math.round(displayed)+(state.showRemainingPlan?'% left':'% used')}${r.reached?' · Limit reached':''} · ${reset}${r.resetsAt?' · '+new Date(r.resetsAt).toLocaleString():''}`;
      const caption=state.compact?(left==null?'Reset unknown':left>0?`Resets ${fmtDur(left)}`:'Refresh to update'):`${r.reached?'Limit reached · ':''}${left==null?'':reset}`;
      return `<div class="row plan-row" ${state.compact?`tabindex="0" role="group" aria-label="${esc(full)}"`:''}><div class="rl"><span>${esc(r.label)}</span><span class="v ${r.reached&&!state.showRemainingPlan?'at-limit':''}">${displayed==null?'—':Math.round(displayed)+(state.showRemainingPlan?'% left':'%')}</span></div>${displayed==null?'':bar(displayed,r.label,state.showRemainingPlan)}<div class="sub">${esc(caption)}</div>${state.compact&&state.showPlanTooltips?`<div class="plan-tip" aria-hidden="true">${esc(full)}</div>`:''}</div>`;
    }).join('')}</div>`:`<div class="empty">${state.error?'Usage unavailable. Try refreshing.':state.usageAt?'No plan limits reported.':'Waiting for usage…'}</div>`;
    const balance=num(parsed.credits);
    if(state.showCreditBar&&state.creditReferencePending&&balance>0){state.creditReference=Number(balance.toFixed(2))||balance;state.creditReferencePending=false;persist();syncCreditBarSettings();}
    const creditText=balance!=null?format(balance):parsed.credits??'—';
    let creditMeter='';
    if(state.showCreditBar){
      if(balance!=null&&state.creditReference>0){
        const percentage=Math.max(0,balance/state.creditReference*100),text=new Intl.NumberFormat(undefined,{maximumFractionDigits:1}).format(percentage);
        creditMeter=`<div class="credit-meter"><div class="rl"><span>Remaining</span><span class="v">${text}%</span></div>${bar(Math.min(100,percentage),'Credit balance',true)}<div class="sub">of ${format(state.creditReference)} credits</div></div>`;
      }else if(balance!=null)creditMeter='<div class="sub credit-meter">Set a full balance in settings to show a percentage.</div>';
      else if(parsed.credits!=='Unlimited')creditMeter='<div class="sub credit-meter">Balance unavailable.</div>';
    }
    const creditBalance=!state.showCreditBar||state.showCreditBalance?`<div class="credit-balance"><div class="credit">${esc(creditText)}</div><div class="sub">${parsed.credits==null?'No credit balance reported':'Available balance'}</div></div>`:'';
    const addCredits=state.showAddCredits?'<a class="add-credits" href="'+esc(creditPurchaseUrl())+'" target="_blank" rel="noopener noreferrer"><svg aria-hidden="true" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 3v10M3 8h10"/></svg>Add credits</a>':'';
    blocks.credits=creditBalance+(state.showCreditBar?`<div class="credit-actions">${creditMeter}${addCredits}</div>`:addCredits);
    const models=Object.entries(state.models).filter(([name])=>state.hiddenFeatures[name]!==true).sort((a,b)=>(b[1].seenAt||0)-(a[1].seenAt||0)).slice(0,12);
    blocks.features=models.map(([name,m])=>{
      const expired=m.resetsAt&&m.resetsAt<=Date.now();
      const val=expired?'Refresh needed':m.remaining!=null?(m.limit!=null?`${format(m.remaining)} / ${format(m.limit)} left`:`${format(m.remaining)} left`):m.used!=null&&m.limit!=null?`${format(m.used)} / ${format(m.limit)} used`:'—';
      const label=featureLabel(name);
      const pct=!expired&&m.limit>0?(m.remaining!=null?100-m.remaining/m.limit*100:m.used!=null?m.used/m.limit*100:null):null;
      return `<div class="row" data-counter="${esc(name)}"><div class="rl"><span>${esc(label)}</span><span class="v">${esc(val)}</span></div>${pct==null?'':bar(Math.max(0,Math.min(100,pct)),label)}<div class="sub">${!expired&&m.resetsAt?`Resets in ${fmtDur(m.resetsAt-Date.now())} · `:''}Seen ${fmtAgo(m.seenAt)}</div></div>`;
    }).join('')||`<div class="empty">${Object.keys(state.models).length?'All reported counters are hidden. Choose which to show in settings.':'Limits appear here when ChatGPT reports them.'}</div>`;
    const scroll=$('.body').scrollTop;
    const focused=root.activeElement?.dataset;
    const rawFocused=root.activeElement?.classList.contains('raw');
    const footer=state.showUpdateTime||state.showDetails?`<div class="foot">${state.showUpdateTime?`<span class="updated-at">Updated ${fmtAgo(state.usageAt)}</span>`:''}${state.showDetails?`<button class="text-btn raw" aria-expanded="${state.showRaw}">${state.showRaw?'Hide data':'Details'}</button>`:''}</div>`:'';
    $('.body').innerHTML=(state.footerPosition==='top'?footer:'')+state.sections.filter(k=>!state.hidden[k]).map(k=>`<section class="section" data-section="${k}"><div class="section-head"><button class="section-toggle" data-collapse="${k}" aria-expanded="${!state.closed[k]}" aria-controls="gptu-${k}">${icon(k)}<span>${labels[k]}</span>${k==='credits'&&state.closed.credits?`<span class="credit-inline">${esc(creditText)}</span>`:''}${icon('chevron')}</button><button class="icon section-handle" draggable="true" data-handle="${k}" aria-label="Reorder ${labels[k]}" title="Drag to reorder · ↑ / ↓">${icon('grip')}</button></div><div class="section-content" id="gptu-${k}" ${state.closed[k]?'hidden':''}>${blocks[k]}</div></section>`).join('')+
      `${state.error?`<div class="err" role="status">${esc(state.error)}</div>`:''}${state.footerPosition==='bottom'?footer:''}${state.showRaw?`<pre>${esc(JSON.stringify({usage:state.usage,models:state.models},null,2))}</pre>`:''}`;
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
    if(state.settingsPosition){menu.style.left=Math.max(8,Math.min(state.settingsPosition.x,innerWidth-r.width-8))+'px';menu.style.top=Math.max(8,Math.min(state.settingsPosition.y,innerHeight-r.height-8))+'px';return;}
    menu.style.left=Math.max(8,Math.min(anchor.right-r.width,innerWidth-r.width-8))+'px';
    const below=innerHeight-anchor.bottom-8;
    menu.style.top=Math.max(8,Math.min(below>=r.height?anchor.bottom+6:anchor.top-r.height-6,innerHeight-r.height-8))+'px';
  }
  function closeSettings(focus=false) { host.removeAttribute('data-settings-open');$('.settings').hidePopover(); settingsOpen=false;$('.customize').setAttribute('aria-expanded','false');if(focus)$('.customize').focus(); }
  $('.customize').onclick=()=>{if(settingsOpen){closeSettings();return;}settingsOpen=true;host.setAttribute('data-settings-open','');renderSettings();$('.settings').showPopover();positionSettings();$('.settings').querySelector('[aria-selected="true"]').focus();};
  $('.settings').addEventListener('toggle',e=>{settingsOpen=e.newState==='open';host.toggleAttribute('data-settings-open',settingsOpen);$('.customize').setAttribute('aria-expanded',String(settingsOpen));});
  root.addEventListener('click',e=>{if(e.target.closest('.close-settings'))closeSettings(true);const tab=e.target.closest('[data-settings-tab]');if(tab)selectSettingsTab(tab.dataset.settingsTab);});
  root.addEventListener('keydown',e=>{
    const tab=e.target.closest('[data-settings-tab]');if(!tab||!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;
    const tabs=Object.keys(SETTINGS_TABS),index=tabs.indexOf(tab.dataset.settingsTab),next=e.key==='Home'?0:e.key==='End'?tabs.length-1:(index+(e.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;
    e.preventDefault();selectSettingsTab(tabs[next],true);
  });
  root.addEventListener('toggle',e=>{
    const key=e.target.dataset?.settingsSection;if(!key)return;
    const closed=!e.target.open;
    if(state.settingsClosed[key]!==closed){state.settingsClosed[key]=closed;persist();}
    positionSettings();
  },true);
  let settingsDrag=null;
  function resetSettingsPosition(){state.settingsPosition=null;persist();positionSettings();}
  root.addEventListener('pointerdown',event=>{
    const title=event.target.closest?.('.settings-title');
    if(!title||event.button!==0||event.target.closest('button:not(.settings-grab)'))return;
    const r=$('.settings').getBoundingClientRect();settingsDrag={x:event.clientX,y:event.clientY,left:r.left,top:r.top};
    state.settingsPosition={x:r.left,y:r.top};title.setPointerCapture(event.pointerId);event.preventDefault();
  });
  window.addEventListener('pointermove',event=>{
    if(!settingsDrag)return;
    state.settingsPosition={x:settingsDrag.left+event.clientX-settingsDrag.x,y:settingsDrag.top+event.clientY-settingsDrag.y};positionSettings();
  });
  const endSettingsDrag=()=>{if(!settingsDrag)return;settingsDrag=null;if(!settingsOpen){persist();return;}const r=$('.settings').getBoundingClientRect();state.settingsPosition={x:r.left,y:r.top};persist();};
  window.addEventListener('pointerup',endSettingsDrag);window.addEventListener('pointercancel',endSettingsDrag);window.addEventListener('blur',endSettingsDrag);
  root.addEventListener('dblclick',event=>{if(event.target.closest?.('.settings-title')&&!event.target.closest('.close-settings'))resetSettingsPosition();});
  root.addEventListener('keydown',event=>{
    if(!event.target.closest?.('.settings-grab'))return;
    if(event.key==='Home'){event.preventDefault();resetSettingsPosition();return;}
    if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;
    event.preventDefault();const r=$('.settings').getBoundingClientRect(),step=event.shiftKey?30:10;
    state.settingsPosition={x:r.left+(event.key==='ArrowRight'?step:event.key==='ArrowLeft'?-step:0),y:r.top+(event.key==='ArrowDown'?step:event.key==='ArrowUp'?-step:0)};
    positionSettings();persist();
  });
  window.addEventListener('resize',positionSettings);
  document.addEventListener('scroll',positionSettings,true);
  root.addEventListener('click',e=>{
    const k=e.target.closest('[data-collapse]')?.dataset.collapse;
    if(k){state.closed[k]=!state.closed[k];persist();render();}
    if(e.target.closest('.raw')){state.showRaw=!state.showRaw;render();$('.raw').focus();}
    if(e.target.closest('.reset')){Object.assign(state,defaultPreferences());persist();closeSettings(true);render();place(true);}
  });
  function syncCreditBarSettings(){
    const controls=$('.credit-reference-controls');if(!controls)return;
    controls.hidden=!state.showCreditBar;
    const input=controls.querySelector('[data-credit-reference]');if(root.activeElement!==input)input.value=state.creditReference??'';
  }
  function changeCreditReference(event){
    if(!event.target.hasAttribute?.('data-credit-reference'))return;
    const value=Number(event.target.value);state.creditReference=Number.isFinite(value)&&value>0?value:null;state.creditReferencePending=false;persist();render();positionSettings();
  }
  root.addEventListener('input',changeCreditReference);
  function changeSpacing(event){
    const {spaceArea:key,spaceSide:side,spaceProfile:profile}=event.target.dataset||{};
    if(!Object.hasOwn(SPACING_AREAS,key)||!['normal','compact'].includes(profile)||!['0','1','2','3'].includes(side))return;
    if(event.type==='input'&&(event.target.value===''||!event.target.validity.valid))return;
    const values=spacingValues(profile,key),value=Math.max(0,Math.min(120,Number(event.target.value)||0));values[Number(side)]=value;
    state.spacing[profile][key]=values;if(event.type==='change')event.target.value=String(value);
    persist();render();place(true);positionSettings();
  }
  root.addEventListener('input',changeSpacing);root.addEventListener('change',changeSpacing);
  root.addEventListener('click',e=>{const profile=e.target.dataset?.resetSpacing;if(!['normal','compact'].includes(profile))return;state.spacing[profile]={};persist();render();place(true);renderSettings();});
  root.addEventListener('change',e=>{
    if(e.target.hasAttribute('data-credit-reference'))changeCreditReference(e);
    if(e.target.hasAttribute('data-credit-balance')){state.showCreditBalance=e.target.checked;persist();render();positionSettings();}
    if(e.target.hasAttribute('data-credit-bar')){
      state.showCreditBar=e.target.checked;
      if(state.showCreditBar&&!state.creditReference){const balance=num(parseUsage(state.usage).credits);if(balance>0){state.creditReference=Number(balance.toFixed(2))||balance;state.creditReferencePending=false;}else state.creditReferencePending=true;}
      persist();syncCreditBarSettings();render();positionSettings();
    }
    if(e.target.hasAttribute('data-show-update')){state.showUpdateTime=e.target.checked;persist();render();positionSettings();}
    if(e.target.hasAttribute('data-show-details')){state.showDetails=e.target.checked;if(!state.showDetails)state.showRaw=false;persist();render();positionSettings();}
    if(e.target.hasAttribute('data-footer-top')){state.footerPosition=e.target.checked?'top':'bottom';persist();render();positionSettings();}
    if(e.target.hasAttribute('data-remaining-plan')){state.showRemainingPlan=e.target.checked;persist();render();positionSettings();}
    if(e.target.hasAttribute('data-add-credits')){state.showAddCredits=e.target.checked;persist();render();positionSettings();}
    if(e.target.hasAttribute('data-plan-tooltips')){state.showPlanTooltips=e.target.checked;persist();render();positionSettings();}
    if(e.target.hasAttribute('data-feature')){state.hiddenFeatures={...state.hiddenFeatures,[e.target.dataset.feature]:!e.target.checked};persist();render();positionSettings();}
    if(e.target.hasAttribute('data-hide-with-sidebar')){state.hideWithSidebar=e.target.checked;persist();render();place(true);positionSettings();}
    if(e.target.hasAttribute('data-hide-collapsed')){state.hideCollapsed=e.target.checked;persist();render();positionSettings();}
    if(e.target.hasAttribute('data-compact')){state.compact=e.target.checked;persist();render();place(true);positionSettings();}
    if(e.target.dataset.setting==='spacingMode'){state.spacingMode=e.target.value;persist();renderSettings();return;}
    if(e.target.dataset.setting){const placement=e.target.dataset.setting==='position';state[e.target.dataset.setting]=e.target.value;if(placement)closeSettings(true);persist();render();place(true);positionSettings();}
    if(e.target.dataset.visible){state.hidden[e.target.dataset.visible]=!e.target.checked;persist();render();}
  });
  function reorder(from,to){const list=state.sections, target=list.indexOf(to);list.splice(list.indexOf(from),1);list.splice(target,0,from);persist();render();$('.live').textContent=`${labels[from]} moved`;}
  root.addEventListener('dragstart',e=>{const h=e.target.closest('[data-handle]');if(!h)return;sectionDrag=h.dataset.handle;e.dataTransfer.setData('text/plain',sectionDrag);e.dataTransfer.effectAllowed='move';});
  root.addEventListener('dragover',e=>{if(!sectionDrag)return;const s=e.target.closest('[data-section]');if(s){e.preventDefault();root.querySelectorAll('.drag-over').forEach(n=>n.classList.remove('drag-over'));s.classList.add('drag-over');}});
  root.addEventListener('drop',e=>{const to=e.target.closest('[data-section]')?.dataset.section;if(sectionDrag&&to){e.preventDefault();if(to!==sectionDrag)reorder(sectionDrag,to);}sectionDrag=null;root.querySelectorAll('.drag-over').forEach(n=>n.classList.remove('drag-over'));});
  root.addEventListener('dragend',()=>{sectionDrag=null;root.querySelectorAll('.drag-over').forEach(n=>n.classList.remove('drag-over'));});
  root.addEventListener('keydown',e=>{const k=e.target.dataset.handle;if(!k||!['ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();const visible=state.sections.filter(x=>!state.hidden[x]), i=visible.indexOf(k)+(e.key==='ArrowUp'?-1:1);if(visible[i]){reorder(k,visible[i]);root.querySelector(`[data-handle="${k}"]`).focus();}});
  function setPanelHeight(height){if(state.compact)state.compactHeight=height;else state.size.height=height;}
  function applySize() {
    applySpacing();
    const floating=host.hasAttribute('data-floating');
    if(floating)host.style.width=Math.max(Math.min(240,innerWidth-16),Math.min(state.size.width,innerWidth-16))+'px';else host.style.width='';
    const requestedHeight=state.compact?state.compactHeight:state.size.height;
    const height=requestedHeight==null||state.collapsed?null:Math.max(Math.min(140,innerHeight-16),Math.min(requestedHeight,innerHeight-16));
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
    setPanelHeight(Math.max(140,Math.min(resizing.height+(resizing.bottom?-1:1)*(e.clientY-resizing.y),resizing.bottom?resizing.edge-8:innerHeight-card.getBoundingClientRect().top-8)));
    applySize();
  });
  const endResize=()=>{if(resizing){resizing=null;persist();}};
  window.addEventListener('pointerup',endResize);window.addEventListener('pointercancel',endResize);window.addEventListener('blur',endResize);
  $('.resize').addEventListener('dblclick',()=>{state.size={width:300,height:null};state.compactHeight=null;applySize();if(host.hasAttribute('data-floating'))clampFloat();persist();});
  $('.resize').addEventListener('keydown',e=>{
    if(!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key))return;
    e.preventDefault();const r=card.getBoundingClientRect(),step=e.shiftKey?40:10;
    if(['ArrowLeft','ArrowRight'].includes(e.key)&&host.hasAttribute('data-floating'))state.size.width=Math.max(240,Math.min(r.width+(e.key==='ArrowRight'?step:-step),innerWidth-host.getBoundingClientRect().left-8));
    if(['ArrowUp','ArrowDown'].includes(e.key))setPanelHeight(Math.max(140,Math.min(r.height+(e.key==='ArrowDown'?step:-step),host.hasAttribute('data-bottom')?r.bottom-8:innerHeight-r.top-8)));
    applySize();persist();
  });
  function clampFloat(){const rect=host.getBoundingClientRect();state.floating.x=Math.max(8,Math.min(state.floating.x,innerWidth-rect.width-8));state.floating.y=Math.max(8,Math.min(state.floating.y,innerHeight-Math.min(rect.height,innerHeight-16)-8));host.style.left=state.floating.x+'px';host.style.top=state.floating.y+'px';const outer=spacingValues(state.compact?'compact':'normal','outer');card.style.maxHeight=`calc(100dvh - ${16+outer[0]+outer[2]}px)`;}
  $('.grab').addEventListener('pointerdown',e=>{if(e.button!==0)return;const r=host.getBoundingClientRect();drag={x:e.clientX,y:e.clientY,left:r.left,top:r.top,started:false};$('.grab').setPointerCapture(e.pointerId);e.preventDefault();});
  function updateDockTargets(event){
    const nav=findSidebarNav();
    if(!nav){$('.dock-targets').hidden=true;if(drag)drag.dockTarget=null;return;}
    const {container,before}=bottomTarget(nav),r=container.getBoundingClientRect(),nr=nav.getBoundingClientRect(),footer=before?.getBoundingClientRect();
    const top=Math.max(8,nr.top+8),bottom=Math.max(top+44,Math.min(innerHeight-44,footer&&footer.height>0?footer.top-44:r.bottom-44));
    const inside=event.clientX>=r.left&&event.clientX<=r.right&&event.clientY>=r.top&&event.clientY<=r.bottom;
    const target=inside?(event.clientY<(top+bottom+36)/2?'top':'bottom'):null;
    $('.dock-targets').hidden=false;
    for(const zone of root.querySelectorAll('[data-dock]')){
      zone.style.left=Math.max(8,r.left+8)+'px';zone.style.width=Math.max(80,Math.min(r.width-16,innerWidth-16))+'px';zone.style.top=(zone.dataset.dock==='top'?top:bottom)+'px';zone.classList.toggle('active',zone.dataset.dock===target);
    }
    if(drag)drag.dockTarget=target;
  }
  window.addEventListener('pointermove',e=>{
    if(!drag)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;
    if(!drag.started&&Math.hypot(dx,dy)<5)return;
    drag.started=true;state.position='floating';state.floating={x:drag.left+dx,y:drag.top+dy};place(false);$('.grab').setPointerCapture(e.pointerId);clampFloat();updateDockTargets(e);
  });
  const endDrag=event=>{
    if(drag?.started){
      if(event.type==='pointerup')updateDockTargets(event);
      const dock=event.type==='pointerup'?drag.dockTarget:null;
      drag=null;$('.dock-targets').hidden=true;
      if(dock){state.position=dock;place(true);$('.live').textContent=`Docked at ${dock} of sidebar`;}
      persist();if(settingsOpen)renderSettings();
    }
    drag=null;$('.dock-targets').hidden=true;
  };
  window.addEventListener('pointerup',endDrag);window.addEventListener('pointercancel',endDrag);window.addEventListener('blur',endDrag);
  $('.grab').addEventListener('keydown',e=>{if(e.key==='Escape'){state.position='top';persist();place(true);if(settingsOpen)renderSettings();return;}if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();if(state.position!=='floating'){const r=host.getBoundingClientRect();state.floating={x:r.left,y:r.top};state.position='floating';}const step=e.shiftKey?30:10;state.floating.x+=e.key==='ArrowRight'?step:e.key==='ArrowLeft'?-step:0;state.floating.y+=e.key==='ArrowDown'?step:e.key==='ArrowUp'?-step:0;place(false);persist();if(settingsOpen)renderSettings();});
  function isVisibleElement(el) {
    const r=el.getBoundingClientRect();
    if(r.width<=0||r.height<=0||r.right<=0||r.bottom<=0||r.left>=innerWidth||r.top>=innerHeight)return false;
    for(let node=el;node&&node!==document.body;node=node.parentElement){
      const style=getComputedStyle(node);
      if(style.display==='none'||style.visibility==='hidden'||Number(style.opacity)===0||node.hidden||node.getAttribute('aria-hidden')==='true'||node.hasAttribute('inert'))return false;
    }
    return true;
  }
  function findSidebarNav(){
    for(const selector of ['nav[aria-label="Chat history"]','#stage-slideover-sidebar nav','[data-testid="sidebar"] nav','nav']){
      for(const el of document.querySelectorAll(selector)){
        const r=el.getBoundingClientRect();
        if(el.getAttribute('aria-label')!=='Show sidebar'&&r.width>120&&r.height>(selector==='nav'?160:0)&&r.left>=0&&r.left<innerWidth/2&&isVisibleElement(el))return el;
      }
    }
    return null;
  }
  function bottomTarget(nav) {
    let container=nav;
    for(let i=0;i<6&&container.parentElement&&container.parentElement!==document.body;i++){
      const parent=container.parentElement,r=parent.getBoundingClientRect();
      if(r.width>520||r.left>innerWidth/2)break;
      container=parent;
      if(container.matches('#app-shell-sidebar,#stage-slideover-sidebar,[data-testid="sidebar"],aside'))break;
    }
    const selectors=['button[aria-label="Open profile menu"]','[data-testid="accounts-profile-button"], [data-testid="user-menu-button"], [data-testid="profile-button"]','footer'];
    // The collapsed rail and expanded sidebar coexist. Search the active history
    // nav first, and reject hidden duplicate profile controls in every search.
    let account=null;
    for(const scope of [nav,container]){
      for(const selector of selectors){
        account=[...scope.querySelectorAll(selector)].find(el=>!host.contains(el)&&isVisibleElement(el));
        if(account)break;
      }
      if(account)break;
    }
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
  const trimmedStyles=new Map();
  function restoreHistorySpace(){
    for(const [el,props] of trimmedStyles)for(const [key,entry] of Object.entries(props)){
      if(el.style.getPropertyValue(key)===entry.applied){
        if(entry.original)el.style.setProperty(key,entry.original,entry.priority);else el.style.removeProperty(key);
      }
    }
    trimmedStyles.clear();
  }
  function trimHistorySpace(nav,reserve){
    if(!reserve){restoreHistorySpace();return;}
    // History already reserves padding for the absolute profile footer. Once
    // Usage sits outside history that reserve becomes the blank gap above it.
    // Trim only footer-sized bottom spacing along the scroll-container path.
    const scrollers=[...nav.querySelectorAll('*')].filter(el=>!host.contains(el)&&el.clientHeight>40&&/(auto|scroll)/.test(getComputedStyle(el).overflowY));
    const paths=new Set([nav]);
    for(const scroller of scrollers)for(let el=scroller;el&&nav.contains(el);el=el.parentElement){paths.add(el);if(el===nav)break;}
    for(const el of [...trimmedStyles.keys()])if(!paths.has(el)){
      const props=trimmedStyles.get(el);
      for(const [key,entry] of Object.entries(props))if(el.style.getPropertyValue(key)===entry.applied){if(entry.original)el.style.setProperty(key,entry.original,entry.priority);else el.style.removeProperty(key);}
      trimmedStyles.delete(el);
    }
    for(const el of paths){
      const computed=getComputedStyle(el), props=trimmedStyles.get(el)||{};
      for(const [key,field] of [['padding-bottom','paddingBottom'],['margin-bottom','marginBottom']]){
        let entry=props[key];const base=entry?entry.base:parseFloat(computed[field]);
        if(!entry&&!(base>=reserve-8&&base<=reserve+32))continue;
        if(!entry)entry=props[key]={base,original:el.style.getPropertyValue(key),priority:el.style.getPropertyPriority(key)};
        const value=Math.max(0,base-reserve)+'px';entry.applied=value;
        if(el.style.getPropertyValue(key)!==value||el.style.getPropertyPriority(key)!=='important')el.style.setProperty(key,value,'important');
      }
      if(Object.keys(props).length)trimmedStyles.set(el,props);
    }
  }
  function layoutBottom(nav=findSidebarNav()) {
    if(!nav||!host.hasAttribute('data-bottom'))return;
    const {parent,before}=bottomTarget(nav);
    if(host.parentElement!==parent||host.nextElementSibling!==before)parent.insertBefore(host,before);
    // display:contents contributes no box; its children participate in the next
    // ancestor's flex layout. Measure that box rather than the zero-sized wrapper.
    let layout=parent;
    while(layout.parentElement&&getComputedStyle(layout).display==='contents')layout=layout.parentElement;
    const r=layout.getBoundingClientRect(),footer=before?.getBoundingClientRect();
    const outOfFlow=before&&['absolute','fixed'].includes(getComputedStyle(before).position);
    const reserve=outOfFlow&&footer?.height>0?Math.max(0,Math.min(r.height,r.bottom-footer.top)):0;
    trimHistorySpace(nav,reserve);
    const margin=reserve?reserve+'px':'';
    if(host.style.marginBottom!==margin)host.style.marginBottom=margin;
    if(observedFooter!==before){footerResizeObserver.disconnect();if(before)footerResizeObserver.observe(before);observedFooter=before;}
    const available=Math.max(80,Math.min(innerHeight,r.height||innerHeight)-(reserve||(footer?.height||0))-100-spacingValues(state.compact?'compact':'normal','outer')[0]-spacingValues(state.compact?'compact':'normal','outer')[2]);
    card.style.maxHeight=Math.min(available,innerHeight*.6)+'px';
  }

  function syncHeading(nav){
    const reference=[...nav.querySelectorAll('[data-testid="create-new-chat-button"],a[href="/"],a[href]')].find(el=>!host.contains(el)&&isVisibleElement(el));
    const measured=reference?parseFloat(getComputedStyle(reference).fontSize):14;
    const size=(measured>=13&&measured<=20?measured:14)+'px';
    if(host.style.getPropertyValue('--gptu-title-size')!==size)host.style.setProperty('--gptu-title-size',size);
  }
  function place(force){
    const nav=findSidebarNav(), hidden=state.position!=='floating'&&!nav&&state.hideWithSidebar;
    host.toggleAttribute('data-sidebar-hidden',hidden);
    if(hidden){
      if(settingsOpen)closeSettings();
      if($('.credits-modal').open)$('.credits-modal').close();
      host.removeAttribute('data-floating');applySize();return;
    }
    const floating=state.position==='floating'||!nav, bottom=!floating&&state.position==='bottom';
    if(nav)syncHeading(nav);
    if(nav&&observedSidebar!==nav){sidebarResizeObserver.disconnect();sidebarResizeObserver.observe(nav);const {container}=bottomTarget(nav);if(container!==nav)sidebarResizeObserver.observe(container);sidebarAttributes.disconnect();sidebarAttributes.observe(container,{attributes:true,subtree:true,attributeFilter:['class','style','hidden','aria-hidden','inert']});observedSidebar=nav;}
    host.toggleAttribute('data-floating',floating);host.toggleAttribute('data-bottom',bottom);
    applySize();
    host.style.bottom='';host.style.left='';host.style.top='';
    if(!bottom){restoreHistorySpace();host.style.marginBottom='';footerResizeObserver.disconnect();observedFooter=null;}
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
  function queueBottom(){if(state.position!=='floating'&&!bottomFrame)bottomFrame=requestAnimationFrame(()=>{bottomFrame=0;place(false);});}
  document.addEventListener('scroll',queueBottom,true);
  let observedSidebar=null,observedFooter=null;
  const footerResizeObserver=new ResizeObserver(queueBottom);
  const sidebarResizeObserver=new ResizeObserver(queueBottom);
  const sidebarAttributes=new MutationObserver(records=>{if(records.some(r=>r.target!==host&&!host.contains(r.target)))queueBottom();});
  const panelResizeObserver=new ResizeObserver(queueBottom);panelResizeObserver.observe(card);
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change',applyTheme);
  matchMedia('(prefers-contrast: more)').addEventListener('change',applyTheme);

  let placeQueued = false;
  const mo = new MutationObserver(() => {
    if (placeQueued) return;
    placeQueued = true;
    requestAnimationFrame(() => { placeQueued = false; place(false); });
  });

  const spacingStyle=document.createElement('style');
  spacingStyle.textContent=Object.entries(SPACING_AREAS).map(([key,area])=>{
    const selector=key==='outer'?'.panel-layout':'.card:is(.compact,:not(.compact))'+(area.selector?' '+area.selector:'');
    return `${selector}{${area.kind}:var(--gptu-space-${key});}`;
  }).join('')+`.settings-tabs{gap:2px;padding:0 8px 8px}.settings-tab{padding:6px 3px;font-size:11px;min-width:0}.spacing-box{padding:6px 0 10px;border-bottom:1px solid var(--line)}.spacing-box:last-child{border:0}.spacing-box-title{display:block;font-size:11px;margin-bottom:5px}.spacing-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px}.spacing-grid label{display:flex;flex-direction:column;gap:3px;font-size:10px;color:var(--muted)}.spacing-grid input{min-width:0;width:100%;padding:5px;border:1px solid var(--line);border-radius:6px;background:var(--surface);color:var(--fg);font:inherit}.settings-title{cursor:grab;touch-action:none}.settings-title:active{cursor:grabbing}.settings-grab{flex:none;cursor:grab}.settings-grab svg{width:16px;height:16px}`;
  root.appendChild(spacingStyle);

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
    const themeObserver=new MutationObserver(applyTheme);
    themeObserver.observe(document.documentElement,{attributes:true});
    themeObserver.observe(document.body,{attributes:true});
    const appRoot=document.getElementById('root');if(appRoot)themeObserver.observe(appRoot,{attributes:true});
    themeObserver.observe(document.head,{childList:true,subtree:true,characterData:true});
  });
})();
