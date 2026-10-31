// Isolated-world content script: draws the usage card inside the left sidebar of ChatGPT or Claude.
(() => {
  const TAG_IN = "gptu-hook";
  const TAG_OUT = "gptu-ui";
  const AUTO_REFRESH_MS = 2 * 60 * 1000;
  const MIN_GAP_MS = 15 * 1000;
  const store = (globalThis.browser && browser.storage) || chrome.storage;
  // One extension, two sites. Each site keeps its own settings under its own storage key.
  const SITES={
    chatgpt:{id:'chatgpt',name:'ChatGPT',key:'gptu',preset:'chatgpt',usagePath:'/settings/usage?tab=overview'},
    claude:{id:'claude',name:'Claude',key:'gptu-claude',preset:'claude',usagePath:'/settings/usage'}
  };
  const IS_CLAUDE=location.hostname==='claude.ai'||location.hostname.endsWith('.claude.ai');
  const SITE=IS_CLAUDE?SITES.claude:SITES.chatgpt,OTHER=IS_CLAUDE?SITES.chatgpt:SITES.claude;
  const T=(chatgpt,claude)=>IS_CLAUDE?claude:chatgpt;

  const THEME_PRESETS=[{"id":"ayu-dark","family":"Ayu","type":"dark","surface":"#0d1017","hover":"#47526640","border":"#1b1f29","fg":"#bfbdb6","muted":"#5a6673","accent":"#e6b450"},{"id":"catppuccin-mocha","family":"Catppuccin","type":"dark","surface":"#181825","hover":"#31324480","border":"#585b70","fg":"#cdd6f4","muted":"#9399b2","accent":"#cba6f7"},{"id":"catppuccin-latte","family":"Catppuccin","type":"light","surface":"#e6e9ef","hover":"#ccd0da80","border":"#acb0be","fg":"#4c4f69","muted":"#7c7f93","accent":"#8839ef"},{"id":"absolutely-dark","family":"Absolutely","type":"dark","surface":"#373735","hover":"#373735","border":"#ffffff22","fg":"#f9f9f7","muted":"#b2b2b0","accent":"#cc7d5e"},{"id":"absolutely-light","family":"Absolutely","type":"light","surface":"#f4f4f2","hover":"#f4f4f2","border":"#00000022","fg":"#2d2d2b","muted":"#8e8e8c","accent":"#c27759"},{"id":"dracula","family":"Dracula","type":"dark","surface":"#21222C","hover":"#44475A75","border":"#BD93F9","fg":"#F8F8F2","muted":"#6272A4","accent":"#737583"},{"id":"everforest-dark","family":"Everforest","type":"dark","surface":"#2d353b","hover":"#2d353b00","border":"#2d353b","fg":"#d3c6aa","muted":"#859289","accent":"#a7c080"},{"id":"everforest-light","family":"Everforest","type":"light","surface":"#fdf6e3","hover":"#fdf6e300","border":"#fdf6e3","fg":"#5c6a72","muted":"#859289","accent":"#7d974c"},{"id":"github-dark","family":"GitHub","type":"dark","surface":"#010409","hover":"#6e76811a","border":"#30363d","fg":"#e6edf3","muted":"#8b949e","accent":"#238636"},{"id":"github-light","family":"GitHub","type":"light","surface":"#f6f8fa","hover":"#eaeef280","border":"#d0d7de","fg":"#1f2328","muted":"#6e7781","accent":"#1f883d"},{"id":"gruvbox-dark","family":"Gruvbox","type":"dark","surface":"#282828","hover":"#3c383680","border":"#3c3836","fg":"#ebdbb2","muted":"#928374","accent":"#458588"},{"id":"gruvbox-light","family":"Gruvbox","type":"light","surface":"#fbf1c7","hover":"#ebdbb280","border":"#ebdbb2","fg":"#3c3836","muted":"#928374","accent":"#458588"},{"id":"linear-dark","family":"Linear","type":"dark","surface":"#080a0f","hover":"#080a0f","border":"#ffffff22","fg":"#e6e9ef","muted":"#636b7b","accent":"#606acc"},{"id":"linear-light","family":"Linear","type":"light","surface":"#f2f4f8","hover":"#f2f4f8","border":"#00000022","fg":"#2a3140","muted":"#858ea1","accent":"#5e6ad2"},{"id":"lobster-dark","family":"Lobster","type":"dark","surface":"#111827","hover":"#111827","border":"#ffffff22","fg":"#e4e4e7","muted":"#71717a","accent":"#ff5c5c"},{"id":"material-dark","family":"Material","type":"dark","surface":"#212121","hover":"#212121","border":"#21212160","fg":"#EEFFFF","muted":"#6b6e6e","accent":"#717171"},{"id":"matrix-dark","family":"Matrix","type":"dark","surface":"#020402","hover":"#020402","border":"#ffffff22","fg":"#b8ffca","muted":"#3f8f52","accent":"#1eff5a"},{"id":"monokai","family":"Monokai","type":"dark","surface":"#1e1f1c","hover":"#3e3d32","border":"#414339","fg":"#f8f8f2","muted":"#88846f","accent":"#75715E"},{"id":"night-owl","family":"Night Owl","type":"dark","surface":"#011627","hover":"#011627","border":"#5f7e97","fg":"#d6deeb","muted":"#637777","accent":"#7e57c2"},{"id":"nord","family":"Nord","type":"dark","surface":"#2e3440","hover":"#3b4252","border":"#3b4252","fg":"#d8dee9","muted":"#737f97","accent":"#88c0d0"},{"id":"notion-dark","family":"Notion","type":"dark","surface":"#151515","hover":"#151515","border":"#ffffff22","fg":"#d9d9d8","muted":"#6a9955","accent":"#3183d8"},{"id":"notion-light","family":"Notion","type":"light","surface":"#f7f6f3","hover":"#f7f6f3","border":"#00000022","fg":"#37352f","muted":"#008000","accent":"#3183d8"},{"id":"oscurange","family":"Oscurange","type":"dark","surface":"#0B0B0F","hover":"#0B0B0F","border":"#ffffff22","fg":"#E6E6E6","muted":"#5e5f66","accent":"#F9B98C"},{"id":"one-dark","family":"One","type":"dark","surface":"#21252b","hover":"#2c313a","border":"#3e4452","fg":"#abb2bf","muted":"#abb2bf","accent":"#70757f"},{"id":"one-light","family":"One","type":"light","surface":"#EAEAEB","hover":"#DBDBDC66","border":"#E5E5E6","fg":"#383A42","muted":"#8b8c93","accent":"#5871EF"},{"id":"proof-light","family":"Proof","type":"light","surface":"#efede6","hover":"#efede6","border":"#00000022","fg":"#2f312d","muted":"#8b877c","accent":"#3d755d"},{"id":"raycast-dark","family":"Raycast","type":"dark","surface":"#101010","hover":"#FFFFFF14","border":"#FFFFFF14","fg":"#FFFFFF","muted":"#666666","accent":"#ff6363"},{"id":"raycast-light","family":"Raycast","type":"light","surface":"#fcfcfc","hover":"#0000000f","border":"#00000014","fg":"#000000","muted":"#919191","accent":"#f25e5e"},{"id":"rose-pine-dark","family":"Rose Pine","type":"dark","surface":"#232136","hover":"#817c9c14","border":"#00000000","fg":"#e0def4","muted":"#6e6a86","accent":"#ea9a97"},{"id":"rose-pine-light","family":"Rose Pine","type":"light","surface":"#faf4ed","hover":"#6e6a860d","border":"#00000000","fg":"#575279","muted":"#8e899e","accent":"#c27571"},{"id":"sentry-dark","family":"Sentry","type":"dark","surface":"#26222d","hover":"#26222d","border":"#ffffff22","fg":"#e6dff9","muted":"#8d849f","accent":"#775ef6"},{"id":"solarized-dark","family":"Solarized","type":"dark","surface":"#00212B","hover":"#004454AA","border":"#2b2b4a","fg":"#839496","muted":"#5e747a","accent":"#2AA198"},{"id":"solarized-light","family":"Solarized","type":"light","surface":"#EEE8D5","hover":"#DFCA8844","border":"#DDD6C1","fg":"#5b6f76","muted":"#829294","accent":"#9b8d4e"},{"id":"tokyo-night","family":"Tokyo Night","type":"dark","surface":"#16161e","hover":"#13131a","border":"#101014","fg":"#a9b1d6","muted":"#5e668a","accent":"#506aaa"},{"id":"temple-dark","family":"Temple","type":"dark","surface":"#1d2d0f","hover":"#1d2d0f","border":"#ffffff22","fg":"#c7e6da","muted":"#4e645c","accent":"#e4f222"},{"id":"vercel-dark","family":"Vercel","type":"dark","surface":"#000000","hover":"#000000","border":"#ffffff22","fg":"#ededed","muted":"#666666","accent":"#006efe"},{"id":"vercel-light","family":"Vercel","type":"light","surface":"#ffffff","hover":"#ffffff","border":"#00000022","fg":"#171717","muted":"#666666","accent":"#006aff"},{"id":"vscode-dark","family":"VS Code Plus","type":"dark","surface":"#1E1E1E","hover":"#1E1E1E","border":"#ffffff22","fg":"#D4D4D4","muted":"#6A9955","accent":"#58a6ff"},{"id":"vscode-light","family":"VS Code Plus","type":"light","surface":"#FFFFFF","hover":"#E8E8E8","border":"#00000022","fg":"#000000","muted":"#008000","accent":"#0969da"},{"id":"xcode-dark","family":"Xcode","type":"dark","surface":"#1f1f24","hover":"#1f1f24","border":"#ffffff22","fg":"#ffffff","muted":"#6c7986","accent":"#5482ff"},{"id":"xcode-light","family":"Xcode","type":"light","surface":"#ffffff","hover":"#ffffff","border":"#00000022","fg":"#000000","muted":"#5d6c79","accent":"#0e0eff"}];
  const THEME_FAMILIES=[...new Set(THEME_PRESETS.map(p=>p.family))].sort((a,b)=>a.localeCompare(b));
  const LEGACY_BAR_PALETTE={blue:'#60a5fa',red:'#ff7983',white:'#ffffff',green:'#4ade80',yellow:'#facc15',pink:'#f472b6',orange:'#fb923c',purple:'#c084fc',neutral:'#ececec',gray:'#a3a3a3'};
  const isHex=value=>typeof value==='string'&&/^#[0-9a-f]{6}$/i.test(value);
  const legacyBarColor=(value,fallback)=>isHex(value)?value:LEGACY_BAR_PALETTE[value]||fallback;
  const SETTINGS_TABS={panel:'Layout',modules:'Modules',appearance:'Theme',bars:'Bars',spacing:'Spacing',sync:'Sync'};
  const SPACING_AREAS={
    outer:{label:'Frame margins (outside)',selector:'.panel-layout',kind:'padding',normal:[6,0,0,0]},
    frame:{label:'Inside frame',selector:'',kind:'padding',normal:[6,0,6,0]},
    header:{label:'Usage header',selector:'.head',kind:'padding',normal:[5,6,5,6]},
    status:{label:'Update time & Details',selector:'.foot',kind:'padding',normal:[7,24,9,12],compact:[4,22,5,9]},
    headerStatus:{label:'Header update time',selector:'.head-status.foot',kind:'padding',normal:[0,0,0,0]},
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
  const HOVER_OPTIONS={
    frame:{label:'Frame on hover only'},
    float:{label:'Drag to float on hover only',selector:'.grab'},
    refresh:{label:'Refresh on hover only',selector:'.refresh'},
    customize:{label:'Customize on hover only',selector:'.customize'},
    collapse:{label:'Collapse arrows on hover only',selector:'.collapse-panel,.section-toggle .chev'},
    reorder:{label:'Reorder handles on hover only',selector:'.section-handle'},
    updated:{label:'Update time on hover only',selector:'.foot .updated-at'},
    details:{label:'Details button on hover only',selector:'.foot .raw'},
    resize:{label:'Resize handle on hover only',selector:'.resize'},
    scrollbar:{label:'Scrollbar on hover only'}
  };
  function defaultPreferences(){return {
    floatHandlePosition:'after',hideFrame:false,hover:Object.fromEntries(Object.keys(HOVER_OPTIONS).map(key=>[key,true])),collapsed:false,compact:false,compactHeight:null,hideCollapsed:false,hideWithSidebar:true,footerPosition:T('top','header-after'),showUpdateTime:true,showDetails:true,marginTop:6,marginBottom:6,
    showUsageResets:!IS_CLAUDE,showPaidReset:false,showAddCredits:true,showPlanTooltips:false,showRemainingPlan:true,showCreditBar:IS_CLAUDE,showCreditBalance:true,creditBalanceInTitle:false,creditReference:null,creditReferencePending:false,
    position:'bottom',sections:['plan','credits','features'],closed:{credits:true},
    hidden:{features:true},hiddenFeatures:T({deep_research:true,file_upload:true,paste_text_to_file:true},{}),
    theme:'auto',preset:'auto',accent:'auto',contrast:'auto',barMode:'auto',barColor:T('#60a5fa','#d97757'),barStart:T('#60a5fa','#d97757'),barEnd:'#ff7983',barGradient:false,barGradientVisible:false,gradientStops:[],floating:{x:24,y:100},size:{width:300,height:null},
    syncGroups:{layout:true,modules:true,theme:true,bars:true,spacing:true},settingsTab:'panel',settingsPosition:null,settingsSize:null,spacingMode:'auto',spacing:{normal:{},compact:{}},settingsClosed:{barSource:false,barDisplay:true,barEnds:false,barMiddle:false,hover:true,appearance:false,colors:true,status:true,placement:false,visibility:true,plan:false,credits:true,features:true,spacePanel:false,spaceStatus:true,spaceModules:true,spaceItems:true,spaceBars:true,spaceDetails:true}
  };}
  const state = {
    usage:null,plan:null,usageAt:0,error:null,models:{},showRaw:false,resetInfo:null,
    ...defaultPreferences()
  };
  let lastRefresh = 0;

  // ---------- persistence ----------
  const saveKeys = ["syncGroups", "appliedAt", "floatHandlePosition", "creditBalanceInTitle", "showUsageResets", "barGradientVisible", "showPaidReset", "barMode", "barColor", "barStart", "barEnd", "gradientStops", "barGradient", "hideFrame", "hover", "usage", "plan", "usageAt", "models", "collapsed", "position", "sections", "closed", "hidden", "theme", "preset", "accent", "contrast", "floating", "size", "compact", "compactHeight", "hideCollapsed", "hideWithSidebar", "hiddenFeatures", "showAddCredits", "showPlanTooltips", "showRemainingPlan", "settingsClosed", "settingsTab", "settingsPosition", "settingsSize", "spacing", "spacingMode", "footerPosition", "showUpdateTime", "showDetails", "marginTop", "marginBottom", "showCreditBar", "showCreditBalance", "creditReference", "creditReferencePending"];
  const historyKeys=Object.keys(defaultPreferences()).filter(key=>!['settingsTab','settingsClosed','spacingMode','creditReferencePending','syncGroups'].includes(key));
  const undoChanges=[],redoChanges=[];
  let historyReady=false,historyCurrent=null,historyGroup='',historyEpoch=0;
  const preferenceSnapshot=()=>Object.fromEntries(historyKeys.map(key=>[key,structuredClone(state[key])]));
  function syncHistoryButtons(){
    const undo=$('.undo-changes'),redo=$('.redo-changes');if(undo)undo.disabled=!undoChanges.length;if(redo)redo.disabled=!redoChanges.length;
  }
  function recordPreferenceHistory(record){
    if(!historyReady)return;
    if(!record&&(drag||resizing||settingsDrag||settingsResizing))return;
    const next=preferenceSnapshot(),before={},after={};
    if(record)for(const key of historyKeys)if(JSON.stringify(historyCurrent[key])!==JSON.stringify(next[key])){before[key]=historyCurrent[key];after[key]=next[key];}
    if(Object.keys(after).length){
      const last=undoChanges.at(-1),now=Date.now();
      if(last&&historyGroup.startsWith('edit:')&&last.group===historyGroup&&now-last.at<800){
        for(const key of Object.keys(after)){if(!Object.hasOwn(last.before,key))last.before[key]=before[key];last.after[key]=after[key];}
        last.at=now;
      }else{undoChanges.push({before,after,group:historyGroup,at:now});if(undoChanges.length>100)undoChanges.shift();}
      redoChanges.length=0;
    }
    historyCurrent=next;syncHistoryButtons();
  }
  function travelHistory(redo=false){
    const source=redo?redoChanges:undoChanges,target=redo?undoChanges:redoChanges,change=source.pop();if(!change)return;
    Object.assign(state,structuredClone(redo?change.after:change.before));target.push(change);historyEpoch++;
    persist(false);render();place(true);
    if(settingsOpen){const scroll=$('.settings-body').scrollTop;renderSettings();$('.settings-body').scrollTop=scroll;$(redo?'.redo-changes':'.undo-changes')?.focus();}
    historyCurrent=preferenceSnapshot();syncHistoryButtons();$('.live').textContent=redo?'Changes redone':'Changes undone';
  }
  function persist(record=true) {
    recordPreferenceHistory(record);
    const o = {};
    for (const k of saveKeys) o[k] = state[k];
    try { store.local.set({ [SITE.key]: o })?.catch(() => {}); } catch (_) {}
  }
  async function load() {
    try {
      const r = await store.local.get(SITE.key);
      const saved = r && r[SITE.key];
      if (saved) {
        for (const k of saveKeys) if (saved[k] !== undefined) state[k] = saved[k];
        if(saved.barMode===undefined){
          const old=saved.barColors||{};state.barMode=saved.barGradient||Object.values(old).some(value=>value!=='auto')?'custom':'auto';
          state.barColor=legacyBarColor(old.remaining||old.normal,'#60a5fa');
          state.barStart=legacyBarColor(old.gradientStart,'#60a5fa');state.barEnd=legacyBarColor(old.gradientEnd,'#ff7983');
        }
        if(!saved.spacing)state.spacing={normal:{frame:[state.marginTop,0,state.marginBottom,0]},compact:{frame:[state.marginTop,0,state.marginBottom,0]}};
      }
    } catch (_) {}
    normalizePreferences();
  }
  function normalizePreferences(){
    if(!Number.isFinite(state.creditReference)||state.creditReference<=0)state.creditReference=null;
    for(const key of ['marginTop','marginBottom'])state[key]=Number.isFinite(state[key])?Math.max(0,Math.min(120,state[key])):6;
    if(!['before','after'].includes(state.floatHandlePosition))state.floatHandlePosition='after';
    if(!['top','bottom','header','header-after'].includes(state.footerPosition))state.footerPosition='top';
    if(!Object.hasOwn(SETTINGS_TABS,state.settingsTab))state.settingsTab='panel';
    if(!state.settingsPosition||!Number.isFinite(state.settingsPosition.x)||!Number.isFinite(state.settingsPosition.y))state.settingsPosition=null;
    if(!state.settingsSize||!Number.isFinite(state.settingsSize.width)||!Number.isFinite(state.settingsSize.height))state.settingsSize=null;
    if(!['auto','normal','compact'].includes(state.spacingMode))state.spacingMode='auto';
    const hover=state.hover;state.hover=Object.fromEntries(Object.keys(HOVER_OPTIONS).map(key=>[key,typeof hover?.[key]==='boolean'?hover[key]:true]));
    state.hideFrame=state.hideFrame===true;
    const spacing=state.spacing;state.spacing={normal:{},compact:{}};
    for(const profile of ['normal','compact'])for(const key of Object.keys(SPACING_AREAS)){const values=spacing?.[profile]?.[key];if(Array.isArray(values)&&values.length===4&&values.every(Number.isFinite))state.spacing[profile][key]=values.map(v=>Math.max(0,Math.min(120,v)));}
    if (!Array.isArray(state.sections)) state.sections = ["plan", "credits", "features"];
    for (const key of ["closed", "hidden", "models", "hiddenFeatures", "settingsClosed"]) if (!state[key] || typeof state[key] !== "object") state[key] = {};
    state.settingsClosed={...defaultPreferences().settingsClosed,...state.settingsClosed};
    if (!state.floating || !Number.isFinite(state.floating.x) || !Number.isFinite(state.floating.y)) state.floating = {x:24,y:100};
    if (!state.size || !Number.isFinite(state.size.width)) state.size = {width:300,height:null};
    if (!Number.isFinite(state.size.height)) state.size.height = null;
    if (!["auto", "system", "light", "dark"].includes(state.theme)) state.theme = "auto";
    if(state.preset===OTHER.preset)state.preset=SITE.preset;
    if(!['auto',SITE.preset,...THEME_FAMILIES].includes(state.preset))state.preset='auto';
    if(!['auto','default','blue','green','yellow','pink','orange','purple','neutral'].includes(state.accent))state.accent='auto';
    if(!['auto','system','medium','increased'].includes(state.contrast))state.contrast='auto';
    state.gradientStops=(Array.isArray(state.gradientStops)?state.gradientStops:[]).filter(stop=>stop&&isHex(stop.color)&&Number.isFinite(stop.from??stop.at)&&Number.isFinite(stop.to??stop.at)).slice(0,8).map(stop=>({from:Math.max(1,Math.min(99,stop.from??stop.at)),to:Math.max(1,Math.min(99,stop.to??stop.at)),color:stop.color,blendBefore:Number.isFinite(stop.blendBefore)?Math.max(0,Math.min(100,stop.blendBefore)):null,blendAfter:Number.isFinite(stop.blendAfter)?Math.max(0,Math.min(100,stop.blendAfter)):null})).sort((a,b)=>a.from-b.from);
    for(let i=0;i<state.gradientStops.length;i++){const stop=state.gradientStops[i];stop.from=Math.max(i?state.gradientStops[i-1].to:1,stop.from);stop.to=Math.max(stop.from,stop.to);}
    state.barGradient=state.barGradient===true;state.barGradientVisible=state.barGradientVisible===true;
    if(!['auto','custom'].includes(state.barMode))state.barMode='auto';
    for(const key of ['barColor','barStart','barEnd'])if(!isHex(state[key]))state[key]=defaultPreferences()[key];
    state.showPaidReset=!IS_CLAUDE&&state.showPaidReset===true;state.showUsageResets=!IS_CLAUDE&&state.showUsageResets!==false;
    state.syncGroups={...defaultPreferences().syncGroups,...(state.syncGroups&&typeof state.syncGroups==='object'?state.syncGroups:{})};state.creditBalanceInTitle=state.creditBalanceInTitle===true;
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
    let credits = null, creditLimit = null, currency = null;
    const c = u.credits;
    if (c && typeof c === "object") {
      creditLimit = num(c.limit); currency = typeof c.currency === "string" && /^[A-Z]{3}$/.test(c.currency) ? c.currency : null;
      if (c.enabled === false) { credits = "Off"; creditLimit = null; }
      else if (c.unlimited) credits = "Unlimited";
      else if (c.has_credits || num(c.balance)) credits = `${num(c.balance) ?? c.balance}`;
      else credits = "0";
    }
    return { rows, credits, creditLimit, currency, plan: u.plan_type || state.plan };
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
      state.usage = payload.data;state.rawUsage=payload.raw??null;state.resetInfo=null;
      state.plan = payload.plan || state.plan;
      state.usageAt = payload.at;
      state.error = null;
      persist(false); ui.setBusy(false); render();
    } else if (type === "usage-error") {
      state.error = payload.message;
      ui.setBusy(false); render();
    } else if (type === "model-limits") {
      for (const it of payload.items) state.models[it.name] = { ...it, seenAt: payload.at };
      persist(false); render();
      if(settingsOpen){renderFeatureSettings();positionSettings();}
    } else if(type==='reset-summary'){
      state.resetInfo=payload;render();
    } else if(type==='reset-details'){
      if(resetFlow?.id===payload.flowId){resetFlow.data=payload.data;resetFlow.error=payload.error;resetFlow.loading=false;if(payload.data)state.resetInfo=payload.data;renderResetDialog();render();}
    } else if(type==='reset-result'){
      resetPending=false;render();
      if(resetFlow?.id===payload.flowId){resetFlow.busy=false;resetFlow.finished=true;resetFlow.message=payload.error||(payload.code==='reset'?'Reset applied. Updating usage…':`No reset confirmed (${String(payload.code||'unknown result')}). Review Usage before trying again.`);renderResetDialog();}
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
    .card, .settings, .credits-modal, .reset-dialog, .dock-zone { --fg:#202123; --muted:#656565; --line:#e3e3e3; --surface:#f9f9f9; --hover:#ededed; --track:#e5e5e5; --ok:#087f65; --remaining:#2563eb; --warn:#966000; --bad:#c53240;
      color:var(--fg); background:var(--surface); font:13px/1.45 ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
      margin:0 8px; border:1px solid var(--line); border-radius:14px; overflow:hidden; text-align:left; display:flex; flex-direction:column; }
    .card { position:relative; border-color:transparent; padding-top:var(--gptu-margin-top,6px); padding-bottom:var(--gptu-margin-bottom,6px); }
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
    .head-title-row { display:flex; align-items:center; flex:1; min-width:0; gap:2px; }
    .head-title-row .usage-open { flex:0 1 auto; }
    .head-title-row>.collapse-panel { flex:none; }
    .head-status-slot,.head-status-after-slot { display:contents; }
    .head.has-header-status.has-status-after .head-title-row { flex:1 1 auto; }
    .head-status-after-slot>.head-status.foot { flex:0 1000 auto; max-width:64px; margin-left:0; }
    .head.has-header-status { flex-wrap:nowrap; }
    .head.has-header-status .head-title-row { flex:1 1 0; min-width:0; flex-wrap:nowrap; overflow:hidden; }
    .head.has-header-status .usage-open { flex:0 0 auto; gap:5px; }
    .head.has-header-status .collapse-panel { width:20px; }
    .head-status.foot { flex:1 1 0; min-width:0; margin-left:2px; gap:0; font-size:9px; line-height:1.25; flex-wrap:nowrap; overflow:hidden; }
    .head-status .updated-at { display:block; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
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
    .credit-meter.has-inline-balance .rl { flex-wrap:wrap; gap:2px 8px; }
    .credit-meter.has-inline-balance .v { display:flex; flex-wrap:wrap; justify-content:flex-end; gap:2px 6px; max-width:100%; }
    .credit-meter-balance { color:var(--muted); font-weight:500; }
    .credit-meter-balance::before { content:"·"; margin-right:6px; }
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
    .bar i { display:block; height:100%; border-radius:9px; background:var(--bar-fill,var(--remaining)); }
    .bar i.remaining { background:var(--bar-fill,var(--remaining)); }
    .bar i.warn { background:var(--bar-fill,var(--remaining)); } .bar i.bad { background:var(--bar-fill,var(--remaining)); }
    .sub,.empty,.note { color:var(--muted); font-size:11px; line-height:1.5; }
    .empty { padding-bottom:8px; }
    .credit { font-size:23px; font-weight:600; letter-spacing:-.6px; font-variant-numeric:tabular-nums; }
    .foot { flex-shrink:0; display:flex; align-items:center; justify-content:space-between; gap:8px; padding:2px 22px 2px 12px; line-height:1.45; color:var(--muted); font-size:10px; }
    .text-btn { color:var(--muted); border-radius:4px; padding:3px; font-size:10px; }

    .card[data-meter-gradient] .bar i { background-image:var(--meter-gradient); background-size:var(--meter-scale,100%) 100%; background-repeat:no-repeat; }
    .err { margin:8px 12px; font-size:11px; color:var(--bad); overflow-wrap:anywhere; }
    pre { margin:0 12px 10px; padding:8px; background:var(--hover); border-radius:8px; max-height:160px; overflow:auto; white-space:pre-wrap; overflow-wrap:anywhere; font:10px/1.5 ui-monospace,monospace; }
    .settings { position:fixed; inset:auto; margin:0; padding:14px; width:min(300px,calc(100vw - 16px)); max-height:calc(100dvh - 16px); overflow:auto; border:1px solid var(--line); border-radius:14px; box-shadow:0 10px 40px #0004; }
    .settings:not(:popover-open) { display:none; }
    .settings::backdrop { background:transparent; }
    .history-buttons { display:flex; flex:none; gap:2px; }
    .history-buttons .icon { width:24px; height:26px; }
    .history-buttons button:disabled { opacity:.3; cursor:default; }
    .settings-title>span { min-width:0; margin-right:auto; }
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
    .compact .plan-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(112px,100%),1fr)); column-gap:14px; position:relative; }
    .compact .plan-row { min-width:0; border-radius:4px; }
    .compact .plan-row .rl { gap:4px; }
    .compact .plan-row .sub { white-space:nowrap; font-size:11px; }
    .compact .plan-row .at-limit { color:var(--bad); }
    .plan-tip { display:none; position:absolute; left:0; right:0; top:0; z-index:2; padding:5px 7px; border:1px solid var(--line); border-radius:6px; background:var(--surface); color:var(--fg); font-size:11px; line-height:1.35; box-shadow:0 2px 8px #0003; pointer-events:none; }
    .plan-row:hover .plan-tip,.plan-row:focus-visible .plan-tip { display:block; }
    .plan-row:focus-visible { outline:2px solid var(--ok); outline-offset:2px; }
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
    .settings-file-actions { display:flex; flex-wrap:wrap; align-items:center; gap:6px 16px; padding-top:6px; }
    .settings-file-actions .text-btn { font-size:11px; }
    .settings-help .settings-file-actions .reset { margin:0; padding:3px 0; }
    .export-status:empty { display:none; }
    .sync-note { display:block; color:var(--muted); font-size:11px; line-height:1.35; margin-top:2px; }
    .sync-actions { display:flex; flex-direction:column; gap:6px; padding:10px 0 4px; }
    .sync-btn { border:1px solid var(--line); border-radius:8px; padding:7px 10px !important; text-align:left; font-weight:500; }
    .sync-status .text-btn { margin-left:4px; }
    .export-status { display:block; padding-top:4px; }
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
    .reset-tools { display:flex; align-items:center; gap:5px; flex:none; font-size:9px; white-space:nowrap; }
    .use-reset,.confirm-reset { border:1px solid var(--line); padding:4px 6px; border-radius:6px; }
    .reset-dialog { position:fixed; inset:0; margin:auto; width:min(420px,calc(100vw - 32px)); max-height:calc(100dvh - 32px); overflow:auto; padding:20px; border:1px solid var(--line); border-radius:14px; }
    .reset-dialog:not([open]) { display:none; }
    .reset-dialog::backdrop { background:#0009; }
    .reset-dialog h2 { margin:0 0 12px; font-size:15px; }
    .reset-dialog p,.reset-dialog label { font-size:12px; line-height:1.5; }
    .reset-dialog select { max-width:100%; padding:6px; background:var(--surface); border:1px solid var(--line); border-radius:6px; }
    .reset-dialog .reset-actions { display:flex; gap:10px; justify-content:flex-end; margin-top:16px; }
    .reset-dialog button:disabled { opacity:.5; cursor:default; }
    .credits-modal { position:fixed; inset:0; margin:auto; padding:0; width:min(900px,calc(100vw - 40px)); height:min(740px,calc(100dvh - 40px)); max-width:none; max-height:none; border:1px solid var(--line); border-radius:16px; box-shadow:0 20px 80px #0006; }
    .credits-modal:not([open]) { display:none; }
    .credits-modal::backdrop { background:#0009; }
    .credits-header { display:flex; align-items:center; gap:10px; padding:12px 16px; border-bottom:1px solid var(--line); flex-shrink:0; }
    .credits-header h2 { font:600 14px/1.4 ui-sans-serif,system-ui,sans-serif; margin:0; flex:1; }
    .credit-external { color:var(--fg); text-decoration:none; font-size:12px; border-radius:6px; padding:5px 8px; }
    .credit-external:hover { background:var(--hover); }
    .credit-external:focus-visible { outline:2px solid var(--ok); outline-offset:2px; }
    .credits-frame { display:block; border:0; width:100%; flex:1; min-height:0; background:var(--surface); }
    .credits-frame[data-loading] { visibility:hidden; pointer-events:none; }
    .credits-content { position:relative; display:flex; flex:1; min-height:0; }
    .credits-status { position:absolute; inset:0; display:grid; place-content:center; margin:0; padding:24px; text-align:center; font-size:12px; color:var(--muted); background:var(--surface); }
    .credits-status[hidden] { display:none; }
    .bar-preview { margin:10px 0 14px; }
    .bar-preview-title { font-size:11px; color:var(--muted); margin-bottom:6px; }
    .bar-preview-fill { height:12px; width:100%; border-radius:6px; border:1px solid var(--line); }
    .bar-preview-labels { display:flex; justify-content:space-between; margin-top:4px; font-size:10px; color:var(--muted); }
    .gradient-stop::before { content:attr(data-color-label); flex-basis:100%; font-size:11px; font-weight:600; }
    .gradient-stop { border:1px solid var(--line); padding:8px; border-radius:7px; display:flex; align-items:center; gap:6px; margin:6px 0; }
    .gradient-blends { display:flex; flex-wrap:wrap; gap:8px; flex-basis:100%; }
    .gradient-stop label { display:flex; align-items:center; gap:3px; font-size:10px; }
    .gradient-stop { flex-wrap:wrap; }
    .gradient-stop input[type=number] { width:43px; background:var(--surface); color:var(--fg); border:1px solid var(--line); border-radius:5px; padding:4px; }
    .gradient-stop input[data-gradient-before],.gradient-stop input[data-gradient-after] { width:56px; }
    .gradient-stop input[type=color] { width:32px; height:28px; background:var(--surface); border:1px solid var(--line); border-radius:5px; }
    .gradient-stop button { margin-left:auto; font-size:11px; }
    .bar-color-controls { display:flex; align-items:center; gap:6px; }
    .bar-color-controls select { max-width:145px; }
    .bar-color-controls input[type=color] { width:28px; height:28px; padding:2px; border:1px solid var(--line); border-radius:6px; background:var(--surface); cursor:pointer; }
    @media(max-width:480px) { .credits-modal { width:calc(100vw - 16px); height:calc(100dvh - 16px); } .credits-header { padding:10px; gap:4px; } }
    .dock-zone { position:fixed; z-index:2147483001; margin:0; height:36px; padding:7px 10px; flex-direction:row; justify-content:center; align-items:center; border:1px dashed var(--muted); border-radius:9px; background:var(--surface); color:var(--muted); font-size:12px; pointer-events:none; box-shadow:0 2px 12px #0003; }
    .dock-zone.active { border:2px solid var(--ok); color:var(--fg); background:var(--hover); }
    .live { position:absolute; width:1px; height:1px; overflow:hidden; clip-path:inset(50%); }
    @media(prefers-reduced-motion:reduce) { * { animation:none !important; transition:none !important; } }
  `;
  const paths = {
    undo:'<path d="m8 4-5 5 5 5M3 9h10a7 7 0 0 1 0 14"/>',
    redo:'<path d="m16 4 5 5-5 5M21 9H11a7 7 0 0 0 0 14"/>',
    chevron:'<path d="m6 9 6 6 6-6"/>',
    refresh:'<path d="M20 7v5h-5M20 12a8 8 0 1 0-2 5"/>',
    grip:'<circle cx="9" cy="5" r=".8"/><circle cx="15" cy="5" r=".8"/><circle cx="9" cy="12" r=".8"/><circle cx="15" cy="12" r=".8"/><circle cx="9" cy="19" r=".8"/><circle cx="15" cy="19" r=".8"/>',
    settings:'<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="15" cy="17" r="3"/>',
    plan:'<path d="M4 17v-4m5 4V9m5 8V5m5 12V2"/>',
    credits:'<circle cx="12" cy="12" r="9"/><path d="M15 8h-4a2 2 0 0 0 0 4h2a2 2 0 0 1 0 4H9m3-10v2m0 8v2"/>',
    features:'<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>'
  };
  const icon = (key) => `<svg class="${key === 'chevron' ? 'chev' : ''}" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${paths[key]}</svg>`;
  // Claude's own Usage icon (settings sidebar): an open ring with a needle pointing up.
  const CLAUDE_USAGE_ICON = `<svg aria-hidden="true" height="20" viewBox="0 0 20 20" width="20" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><path d="M5.05 15.95A7 7 0 1 1 14.95 15.95"/><path d="M10 7.4V10.6" stroke-width="1.7"/></svg>`;
  const USAGE_ICON = IS_CLAUDE ? CLAUDE_USAGE_ICON : `<svg aria-hidden="true" height="20" viewBox="0 0 20 20" width="20" xmlns="http://www.w3.org/2000/svg"><path d="M10.0017 1.83496C10.9451 1.83499 11.8556 1.9809 12.7117 2.25098C13.0619 2.36148 13.2567 2.73471 13.1462 3.08496C13.0357 3.43506 12.6624 3.62884 12.3123 3.51855C11.5841 3.28882 10.8078 3.16507 10.0017 3.16504C5.76585 3.16504 2.33179 6.5991 2.33179 10.835C2.33186 12.8582 3.11408 14.6974 4.39429 16.0684C4.64484 16.3367 4.63109 16.7571 4.36304 17.0078C4.09461 17.2585 3.67328 17.244 3.42261 16.9756C1.92156 15.3681 1.00178 13.2083 1.00171 10.835C1.00171 5.86457 5.03131 1.83496 10.0017 1.83496Z" fill="currentColor"></path><path d="M17.7751 7.74902C18.1261 7.64142 18.4984 7.83849 18.6062 8.18945C18.8633 9.02663 19.0007 9.91545 19.0007 10.835C19.0007 13.2083 18.0819 15.369 16.5808 16.9766C16.3302 17.2449 15.9088 17.2583 15.6404 17.0078C15.3723 16.7572 15.3577 16.3367 15.6082 16.0684C16.8883 14.6974 17.6716 12.8582 17.6716 10.835C17.6716 10.0493 17.5534 9.29214 17.3347 8.58008C17.2269 8.22899 17.4241 7.85683 17.7751 7.74902Z" fill="currentColor"></path><path d="M14.8269 5.0957C15.0864 4.83644 15.5076 4.8368 15.7673 5.0957C16.027 5.35536 16.0269 5.7774 15.7673 6.03711L12.2273 9.57617C12.438 9.94814 12.5603 10.377 12.5603 10.835C12.5602 12.2482 11.4149 13.3934 10.0017 13.3936C8.58836 13.3936 7.44228 12.2483 7.44214 10.835C7.4422 9.42157 8.58831 8.27539 10.0017 8.27539C10.4735 8.27544 10.9143 8.40519 11.2937 8.62793L14.8269 5.0957ZM10.0017 9.60547C9.32285 9.60547 8.77228 10.1561 8.77222 10.835C8.77236 11.5137 9.3229 12.0635 10.0017 12.0635C10.6804 12.0633 11.2301 11.5137 11.2302 10.835C11.2302 10.1562 10.6804 9.60561 10.0017 9.60547Z" fill-rule="evenodd" clip-rule="evenodd" fill="currentColor"></path></svg>`;
  const host = document.createElement('div'); host.id='gptu-usage-host';
  const root=host.attachShadow({mode:'open'});
  root.innerHTML=`<style>${CSS}</style><div class="panel-layout"><div class="card" part="card">
    <div class="head"><button class="icon grab" aria-label="Drag panel; use arrow keys to move, Escape to dock" title="Drag to float · Arrow keys to move · Escape to dock">${icon('grip')}</button>
    <div class="head-title-row"><button class="usage-open" aria-label="Open usage overview" title="Open usage overview"><span class="usage-icon">${USAGE_ICON}</span><span class="title">Usage</span><span class="badge" hidden></span></button><button class="icon toggle collapse-panel" aria-expanded="true" aria-label="Collapse usage panel" title="Collapse usage panel">${icon('chevron')}</button><div class="head-status-slot"></div></div>
    <button class="icon refresh" title="Refresh usage" aria-label="Refresh usage">${icon('refresh')}</button><div class="head-status-after-slot"></div>
    <button class="icon customize" title="Customize panel" aria-label="Customize panel" aria-expanded="false">${icon('settings')}</button></div>
    <div class="summary" hidden></div><div class="body"></div><button class="resize" aria-label="Resize panel" title="Drag to resize · Arrow keys to resize · Double-click to reset size"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" aria-hidden="true"><path d="m5 13 8-8m-3 8 3-3"/></svg></button><div class="live" aria-live="polite"></div></div></div><div class="settings" popover="auto" role="dialog" aria-label="Usage settings"></div><dialog class="reset-dialog" aria-labelledby="gptu-reset-title"></dialog><dialog class="credits-modal" aria-labelledby="gptu-page-heading"><div class="credits-header"><h2 id="gptu-page-heading">Add credits</h2><a class="credit-external" target="_blank" rel="noopener noreferrer">Open in tab</a><button class="icon credits-close" aria-label="Close credits">✕</button></div><div class="credits-content"><p class="credits-status" role="status">Loading credits…</p><template class="credits-frame-template"><iframe class="credits-frame" title="Usage" allow="payment" sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads"></iframe></template></div></dialog><div class="dock-targets" hidden aria-hidden="true"><div class="dock-zone" data-dock="top">Dock at top</div><div class="dock-zone" data-dock="bottom">Dock at bottom</div></div>`;
  const $=s=>root.querySelector(s), card=$('.card');
  for(const type of ['click','dblclick','change','input','keydown','pointerdown','dragstart'])root.addEventListener(type,event=>{
    const el=event.target;if(!el?.getAttribute)return;
    if(['input','change','keydown'].includes(type)){
      const signature=el.getAttribute('aria-label')||JSON.stringify(el.dataset)||el.className;
      historyGroup=`edit:${historyEpoch}:${signature}`;
    }else historyGroup=`action:${++historyEpoch}`;
  },true);
  // ---------- applying settings across ChatGPT and Claude ----------
  // Site-specific keys are never copied: resets, the credit reference (different units), feature
  // counters, and the settings window's own state.
  const SYNC_GROUPS={
    layout:{label:'Layout',note:'Placement, floating position, size, compact mode, visibility, hover, drag handle, update time, module order and collapsed state',
      keys:['position','floating','size','compact','compactHeight','hideCollapsed','hideWithSidebar','hideFrame','hover','floatHandlePosition','footerPosition','showUpdateTime','showDetails','collapsed','sections','closed']},
    modules:{label:'Modules',note:'Visible modules, remaining vs used, tooltips, balance bar and button options',
      keys:['hidden','showRemainingPlan','showPlanTooltips','showCreditBar','showCreditBalance','creditBalanceInTitle','showAddCredits']},
    theme:{label:'Theme',note:'Preset, mode, accent and contrast. "Match site" stays matched to each site',keys:['theme','preset','accent','contrast']},
    bars:{label:'Bars',note:'Color source, custom colors, ranges and gradient display',keys:['barMode','barColor','barStart','barEnd','gradientStops','barGradient','barGradientVisible']},
    spacing:{label:'Spacing',note:'Normal and compact spacing profiles',keys:['spacing','spacingMode','marginTop','marginBottom']}
  };
  const SYNCABLE_KEYS=Object.values(SYNC_GROUPS).flatMap(group=>group.keys);
  let syncBackup=null,syncMessage='',otherSaved=undefined;
  function pickSettings(source,fromSite,toSite,groups){
    const out={};
    for(const [key,group] of Object.entries(SYNC_GROUPS))if(groups[key])for(const k of group.keys)if(source[k]!==undefined)out[k]=structuredClone(source[k]);
    if(out.preset===fromSite.preset)out.preset=toSite.preset;
    return out;
  }
  async function readOtherSite(){
    try{const r=await store.local.get(OTHER.key);otherSaved=r?.[OTHER.key]||null;}catch(_){otherSaved=null;}
    return otherSaved;
  }
  function selectedSyncGroups(){return Object.fromEntries(Object.keys(SYNC_GROUPS).map(key=>[key,state.syncGroups[key]!==false]));}
  function applyIncoming(settings){
    Object.assign(state,settings);normalizePreferences();state.appliedAt=Date.now();
    persist();render();place(true);
    if(settingsOpen){const scroll=$('.settings-body').scrollTop;renderSettings();$('.settings-body').scrollTop=scroll;}
  }
  async function copyAcrossSites(direction){
    const groups=selectedSyncGroups();
    if(!Object.values(groups).some(Boolean)){syncMessage='Choose at least one group to copy.';renderSyncPanel();return;}
    if(direction==='from'){
      const other=await readOtherSite();
      if(!other){syncMessage=`No ${OTHER.name} settings saved yet. Open ${OTHER.name} once, or copy from this side instead.`;renderSyncPanel();return;}
      historyGroup='sync';applyIncoming(pickSettings(other,OTHER,SITE,groups));historyGroup='';
      syncBackup=null;syncMessage=`Applied ${OTHER.name} settings here. Use Undo in the title bar to revert.`;
    }else{
      const previous=await readOtherSite();
      const snapshot=Object.fromEntries(SYNCABLE_KEYS.map(key=>[key,state[key]]));
      const next={...(previous||{}),...pickSettings(snapshot,SITE,OTHER,groups),appliedAt:Date.now()};
      try{await store.local.set({[OTHER.key]:next});otherSaved=next;syncBackup={value:previous};
        syncMessage=`Applied to ${OTHER.name}. Open ${OTHER.name} tabs update right away.`;}
      catch(_){syncMessage=`Could not save ${OTHER.name} settings. Try again.`;}
    }
    if(settingsOpen){const scroll=$('.settings-body').scrollTop;renderSettings();$('.settings-body').scrollTop=scroll;}
  }
  async function undoSyncCopy(){
    if(!syncBackup)return;
    try{
      if(syncBackup.value)await store.local.set({[OTHER.key]:{...syncBackup.value,appliedAt:Date.now()}});
      else await store.local.remove(OTHER.key);
      otherSaved=syncBackup.value;syncBackup=null;syncMessage=`Restored the previous ${OTHER.name} settings.`;
    }catch(_){syncMessage='Could not undo. Try again.';}
    renderSyncPanel();
  }
  function syncPanelContent(){
    const groups=selectedSyncGroups();
    const status=otherSaved===undefined?'Checking…':otherSaved?`${OTHER.name} has saved settings.`:`${OTHER.name} has no saved settings yet; it uses defaults.`;
    return `<div class="note">ChatGPT and Claude keep separate settings. Choose groups, then copy them in either direction. The panel position and size are copied as-is; each site still matches its own page colors.</div>`+
      `<details class="settings-section" open><summary>${icon('settings')}<span>Groups to copy</span>${icon('chevron')}</summary><div class="settings-section-content">`+
      Object.entries(SYNC_GROUPS).map(([key,group])=>`<label class="setting"><span>${group.label}<small class="sync-note">${esc(group.note)}</small></span><input type="checkbox" role="switch" aria-label="${group.label}" data-sync-group="${key}" ${groups[key]?'checked':''}></label>`).join('')+
      `<div class="note">Never copied: ${T('banked and paid reset buttons, ','')}the ${T('full credit balance','fallback limit')}, individual feature counters and this settings window.</div></div></details>`+
      `<div class="sync-actions"><button class="text-btn sync-btn" data-sync-copy="to">Apply these settings to ${OTHER.name} →</button><button class="text-btn sync-btn" data-sync-copy="from">← Apply ${OTHER.name} settings here</button></div>`+
      `<div class="note sync-status" role="status">${esc(syncMessage||status)}${syncBackup?` <button class="text-btn" data-sync-undo>Undo</button>`:''}</div>`;
  }
  function renderSyncPanel(){const panel=root.querySelector('#gptu-settings-sync');if(panel)panel.innerHTML=syncPanelContent();}
  root.addEventListener('change',event=>{
    const key=event.target.dataset?.syncGroup;if(!key)return;
    state.syncGroups={...state.syncGroups,[key]:event.target.checked};persist(false);syncMessage='';renderSyncPanel();
  });
  // Another tab (either site) changed this site's settings through Sync or Import: load them live.
  store.onChanged?.addListener((changes,area)=>{
    if(area!=='local')return;
    if(changes[OTHER.key]){otherSaved=changes[OTHER.key].newValue||null;if(settingsOpen&&state.settingsTab==='sync'&&!syncMessage)renderSyncPanel();}
    const change=changes[SITE.key];const value=change?.newValue;
    if(!value||!value.appliedAt||value.appliedAt===state.appliedAt)return;
    for(const k of SYNCABLE_KEYS)if(value[k]!==undefined)state[k]=structuredClone(value[k]);
    state.appliedAt=value.appliedAt;normalizePreferences();render();place(true);
    if(historyReady){historyCurrent=preferenceSnapshot();}
    if(settingsOpen){const scroll=$('.settings-body').scrollTop;renderSettings();$('.settings-body').scrollTop=scroll;}
  });
  function importSettings(){
    const input=document.createElement('input');input.type='file';input.accept='application/json,.json';
    input.addEventListener('change',async()=>{
      const file=input.files?.[0];if(!file)return;
      try{
        const data=JSON.parse(await file.text());
        if(!['usage-meter-settings','chatgpt-usage-meter-settings'].includes(data?.format)||!data.settings||typeof data.settings!=='object')throw Error('format');
        const from=SITES[data.site]||SITES.chatgpt;
        const allGroups=Object.fromEntries(Object.keys(SYNC_GROUPS).map(key=>[key,true]));
        const incoming=pickSettings(data.settings,from,SITE,allGroups);
        // Same-site files also restore site-specific choices.
        if(from===SITE)for(const key of ['showUsageResets','showPaidReset','creditReference','hiddenFeatures','syncGroups'])if(data.settings[key]!==undefined)incoming[key]=structuredClone(data.settings[key]);
        historyGroup='import';applyIncoming(incoming);historyGroup='';
        $('.export-status').textContent=`Imported ${from.name} settings from ${file.name}. Use Undo to revert.`;
      }catch(_){$('.export-status').textContent='Import failed: choose a settings file exported by Usage Meter.';}
    });
    input.click();
  }
  function exportSettings(){
    const settings=Object.fromEntries(Object.keys(defaultPreferences()).filter(key=>key!=='creditReferencePending').map(key=>[key,structuredClone(state[key])]));
    const data={format:'usage-meter-settings',site:SITE.id,version:1,extensionVersion:globalThis.chrome?.runtime?.getManifest?.().version||globalThis.browser?.runtime?.getManifest?.().version||'0.3.34',exportedAt:new Date().toISOString(),settings};
    let url;
    try{
      url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)+'\n'],{type:'application/json'}));
      const link=document.createElement('a');link.href=url;link.download=SITE.name+'-Usage-Meter-settings-'+data.exportedAt.slice(0,10)+'.json';document.body.appendChild(link);link.click();link.remove();
      setTimeout(()=>URL.revokeObjectURL(url),60000);
      $('.export-status').textContent='Settings exported.';
    }catch(_){if(url)URL.revokeObjectURL(url);$('.export-status').textContent='Export failed. Please try again.';}
  }
  root.addEventListener('click',event=>{
    if(event.target.closest('[data-export-settings]'))exportSettings();
    else if(event.target.closest('[data-import-settings]'))importSettings();
    else if(event.target.closest('[data-sync-copy]'))copyAcrossSites(event.target.closest('[data-sync-copy]').dataset.syncCopy);
    else if(event.target.closest('[data-sync-undo]'))undoSyncCopy();
    else if(event.target.closest('.undo-changes'))travelHistory();
    else if(event.target.closest('.redo-changes'))travelHistory(true);
    else if(event.target.closest('[data-reset-bar-colors]')){
      const defaults=defaultPreferences();for(const key of ['barMode','barColor','barStart','barEnd','barGradient','barGradientVisible','gradientStops'])state[key]=defaults[key];
      persist();render();renderSettings();
    }
  });
  root.addEventListener('keydown',event=>{
    if(!(event.ctrlKey||event.metaKey)||event.altKey||event.target.matches('input,textarea,select,[contenteditable="true"]'))return;
    if(event.key.toLowerCase()==='z'||event.key.toLowerCase()==='y'){event.preventDefault();travelHistory(event.shiftKey||event.key.toLowerCase()==='y');}
  });
  let busyTimer, settingsOpen=false, drag=null, resizing=null, sectionDrag=null;
  const ui={ setBusy(b) { card.classList.toggle('busy',b); $('.refresh').disabled=b; $('.refresh').setAttribute('aria-busy',String(b)); clearTimeout(busyTimer); if(b) busyTimer=setTimeout(()=>{ui.setBusy(false); state.error='Refresh timed out. Try again.'; render();},20000); } };
  const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const level=p=>p>=90?'bad':p>=75?'warn':'';
  const labels={plan:'Plan limits',credits:T('Credits','Extra usage'),features:'Models & features'};
  const featureNames=IS_CLAUDE?{}:{deep_research:'Deep Research',file_upload:'File uploads',paste_text_to_file:'Paste text to file',image_gen:'Image generation'};
  const featureLabel=name=>featureNames[name]||name.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
  const format=n=>new Intl.NumberFormat(undefined,{maximumFractionDigits:2}).format(n);
  function colorScalePoints(){
    const bands=[{from:0,to:0,color:state.barStart,endpoint:true},...state.gradientStops,{from:100,to:100,color:state.barEnd,endpoint:true}],points=[{at:0,color:state.barStart}];
    for(let i=1;i<bands.length;i++){
      const left=bands[i-1],right=bands[i],gap=right.from-left.to;
      const before=Number.isFinite(right.blendBefore)?Math.min(gap,right.blendBefore):gap;
      const after=Number.isFinite(left.blendAfter)?Math.min(gap,left.blendAfter):gap;
      let start=left.to,end=right.from;
      if(left.endpoint&&!right.endpoint)start=right.from-before;
      else if(right.endpoint&&!left.endpoint)end=left.to+after;
      else if(!left.endpoint&&!right.endpoint){start=left.to+(gap-before)/2;end=right.from-(gap-after)/2;}
      points.push({at:start,color:left.color},{at:end,color:right.color},{at:right.to,color:right.color});
    }
    return points;
  }
  function colorScaleGradient(){return `linear-gradient(to right,${colorScalePoints().map(point=>point.color+' '+point.at+'%').join(',')})`;}
  function updateBarPreview(){
    const preview=$('.bar-preview-fill');if(!preview)return;
    preview.style.background=state.barMode==='auto'?'var(--remaining)':state.barGradient?colorScaleGradient():state.barColor;
  }
  function percentageColor(value){
    const points=colorScalePoints(),p=Math.max(0,Math.min(100,value));
    let index=0;while(index<points.length-1&&points[index+1].at<=p)index++;
    const left=points[index],right=points[Math.min(index+1,points.length-1)];
    const t=right.at===left.at?0:(p-left.at)/(right.at-left.at);
    const rgb=[1,3,5].map(offset=>Math.round(parseInt(left.color.slice(offset,offset+2),16)*(1-t)+parseInt(right.color.slice(offset,offset+2),16)*t));
    return `rgb(${rgb.join(',')})`;
  }
  const bar=(p,label,remaining=false)=>`<div class="bar" role="progressbar" aria-label="${esc(label)} ${remaining?'remaining':'used'}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${p}"><i class="${remaining?'remaining':level(p)}" style="width:${p}%;--meter-scale:${p>0?10000/p:100}%;${state.barMode==='custom'&&state.barGradient&&!state.barGradientVisible?'background-color:'+percentageColor(p):''}"></i></div>`;

  function creditPurchaseUrl(){
    if(IS_CLAUDE)return new URL(SITE.usagePath,location.origin).href;
    const url=new URL('/pricing/credits',location.origin);
    url.searchParams.set('source','chatgpt_web_merged');
    url.searchParams.set('return_to',location.pathname+location.search+location.hash);
    return url.href;
  }
  function updateCreditLink(event){
    const link=event.target.closest?.('.add-credits:not(.paid-reset)');
    if(link)link.href=creditPurchaseUrl();
  }
  root.addEventListener('pointerdown',updateCreditLink);
  root.addEventListener('click',event=>{
    const link=event.target.closest?.('.add-credits:not(.paid-reset)');if(!link)return;
    updateCreditLink(event);
    if(event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
    event.preventDefault();openCreditDialog(link);
  });
  root.addEventListener('auxclick',updateCreditLink);
  let resetFlow=null,resetFocus=null,resetPending=false;
  function resetCount(){const count=num(state.resetInfo?.available_count??state.usage?.rate_limit_reset_credits?.available_count);return Number.isInteger(count)&&count>=0?count:null;}
  function availableResets(){return (Array.isArray(resetFlow?.data?.credits)?resetFlow.data.credits:[]).filter(c=>c&&typeof c.id==='string'&&c.status==='available'&&(!c.expires_at||Date.parse(c.expires_at)>Date.now())).sort((a,b)=>(Date.parse(a.expires_at)||Infinity)-(Date.parse(b.expires_at)||Infinity));}
  function renderResetDialog(){
    const flow=resetFlow;if(!flow)return;
    const credits=availableResets();if(!credits.some(c=>c.id===flow.creditId))flow.creditId=credits[0]?.id;
    const selected=credits.find(c=>c.id===flow.creditId);
    $('.reset-dialog').innerHTML=`<h2 id="gptu-reset-title">Use a usage limit reset</h2>${flow.loading?'<p role="status">Loading available resets…</p>':flow.error?`<p role="status">${esc(flow.error)}</p>`:`<p>${credits.length?'Choose a banked reset to restore its covered allowances. This consumes one reset immediately; it does not add credits.':'No available, unexpired resets were reported.'}</p>${credits.length?`<label>Available reset <select aria-label="Available reset" ${flow.busy||flow.finished?'disabled':''}>${credits.map(c=>`<option value="${esc(c.id)}" ${c.id===flow.creditId?'selected':''}>${esc(c.title||'Usage reset')}${c.expires_at?' · Expires '+esc(new Date(c.expires_at).toLocaleString()):''}</option>`).join('')}</select></label>${selected?.description?`<p>${esc(selected.description)}</p>`:''}<p>ChatGPT checks eligibility when you confirm. Allowances that qualify are restored, and their next reset times may change.</p>`:''}`}${flow.message?`<p role="status">${esc(flow.message)}</p>`:''}<div class="reset-actions"><button class="text-btn reset-native">Open Usage</button><button class="text-btn cancel-reset">${flow.finished?'Close':'Cancel'}</button>${selected&&!flow.finished?`<button class="confirm-reset" ${flow.busy?'disabled':''}>${flow.busy?'Applying…':'Use this reset'}</button>`:''}</div>`;
  }
  root.addEventListener('click',event=>{
    const target=event.target;
    if(target.closest('.paid-reset'))openPageDialog(new URL(SITE.usagePath,location.origin).href,'Usage',target);
    else if(target.closest('.use-reset')&&!resetPending){
      if(settingsOpen)closeSettings();resetFocus=target;resetFlow={id:crypto.randomUUID(),loading:true};renderResetDialog();$('.reset-dialog').showModal();
      window.postMessage({source:TAG_OUT,type:'reset-details',payload:{flowId:resetFlow.id}},location.origin);
    }else if(target.closest('.cancel-reset'))$('.reset-dialog').close();
    else if(target.closest('.reset-native')){$('.reset-dialog').close();openPageDialog(new URL(SITE.usagePath,location.origin).href,'Usage',$('.usage-open'));}
    else if(target.closest('.confirm-reset')&&resetFlow&&!resetFlow.busy&&!resetFlow.finished){
      const selected=availableResets().find(c=>c.id===resetFlow.creditId);if(!selected)return;
      resetFlow.busy=true;resetPending=true;resetFlow.requestId=crypto.randomUUID();renderResetDialog();render();
      window.postMessage({source:TAG_OUT,type:'use-reset',payload:{flowId:resetFlow.id,creditId:selected.id,requestId:resetFlow.requestId}},location.origin);
    }
  });
  root.addEventListener('change',event=>{if(event.target.matches('.reset-dialog select')&&resetFlow&&!resetFlow.busy){resetFlow.creditId=event.target.value;renderResetDialog();}});
  $('.reset-dialog').addEventListener('close',()=>{resetFlow=null;const target=resetFocus?.isConnected?resetFocus:$('.usage-open');target?.focus();resetFocus=null;});
  let creditReturnFocus=null,creditReturnPath='',creditWatch=null,creditLoadTimeout=null;
  function openCreditDialog(link){openPageDialog(creditPurchaseUrl(),T('Add credits','Usage'),link,!IS_CLAUDE);}
  function openPageDialog(url,title,returnFocus,closeOnReturn=false){
    const dialog=$('.credits-modal');
    if(dialog.open){$('.credits-close').focus();return;}
    if(settingsOpen)closeSettings();
    const frame=$('.credits-frame-template').content.firstElementChild.cloneNode(true);
    frame.setAttribute('data-loading','');frame.setAttribute('aria-hidden','true');frame.tabIndex=-1;
    dialog.setAttribute('aria-busy','true');
    frame.addEventListener('load',()=>creditFrameLoaded(frame));
    creditReturnFocus=returnFocus;creditReturnPath=location.pathname+location.search+location.hash;
    $('#gptu-page-heading').textContent=title;frame.title=title==='Add credits'?'ChatGPT credits purchase':`${SITE.name} usage overview`;
    $('.credit-external').href=url;$('.credits-status').textContent='Loading…';$('.credits-status').hidden=false;
    frame.src=url;$('.credits-content').appendChild(frame);dialog.showModal();$('.credits-close').focus();
    creditLoadTimeout=setTimeout(()=>{if(dialog.open){$('.credits-status').textContent='If the page stays blank, choose Open in tab.';$('.credits-status').hidden=false;}},12000);
    if(closeOnReturn)creditWatch=setInterval(()=>{
      try{const destination=new URL(frame.contentWindow.location.href);if(destination.origin===location.origin&&destination.pathname+destination.search+destination.hash===creditReturnPath){dialog.close();requestRefresh(false);}}catch(_){}
    },1000);
  }
  $('.usage-open').onclick=()=>openPageDialog(new URL(SITE.usagePath,location.origin).href,'Usage',$('.usage-open'));
  $('.credits-close').onclick=()=>$('.credits-modal').close();
  $('.credits-modal').addEventListener('close',()=>{
    clearInterval(creditWatch);clearTimeout(creditLoadTimeout);creditWatch=null;
    $('.credits-frame')?.remove();$('.credits-modal').removeAttribute('aria-busy');
    const target=creditReturnFocus?.isConnected?creditReturnFocus:$('.add-credits');target?.focus();creditReturnFocus=null;requestRefresh(false);
  });
  $('.credits-modal').addEventListener('click',event=>{
    if(event.target!==$('.credits-modal'))return;
    const r=event.target.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)event.target.close();
  });
  function prepareEmbeddedPage(frame){
    try{
      const doc=frame.contentDocument;if(!doc?.head)return false;if(doc.getElementById('gptu-embedded-page-style'))return true;
      const style=doc.createElement('style');style.id='gptu-embedded-page-style';
      style.textContent=`
        .app-shell-left-panel, #stage-slideover-sidebar, [data-testid="sidebar"],
        aside:has(#app-shell-sidebar), #app-shell-sidebar,
        [data-testid="open-sidebar-button"], [data-testid="close-sidebar-button"],
        button[aria-label="Open sidebar"], button[aria-label="Close sidebar"], button[aria-label="Show sidebar"] { display:none !important; }
        [data-gptu-hidden] { display:none !important; }
        html[data-gptu-isolated], html[data-gptu-isolated] body { height:100% !important; overflow:hidden !important; margin:0 !important; }
        [data-gptu-path] { position:static !important; inset:auto !important; transform:none !important; translate:none !important; width:100% !important; height:100% !important;
          max-width:none !important; max-height:none !important; min-width:0 !important; min-height:0 !important; margin:0 !important; padding:0 !important;
          border:0 !important; border-radius:0 !important; box-shadow:none !important; outline:0 !important; display:flex !important; flex-direction:column !important; opacity:1 !important; }
        [data-gptu-content] { flex:1 1 auto !important; width:100% !important; max-width:none !important; height:100% !important; max-height:none !important;
          min-height:0 !important; overflow:auto !important; margin:0 !important; border:0 !important; border-radius:0 !important; }
      `;
      doc.head.appendChild(style);return true;
    }catch(_){return false;}
  }
  // Claude opens settings as its own modal with a settings sidebar. Inside our dialog, keep only
  // the settings content pane: hide everything that is not on the path from it to <html>.
  function isolateEmbeddedContent(doc){
    try{
      const links=[...doc.querySelectorAll('a[href*="/settings/"]')];
      if(!links.length||!doc.body)return false;
      const scope=links[0].closest('[role="dialog"],dialog')||doc.body;
      const hasNav=el=>links.some(a=>el.contains(a));
      const sr=scope.getBoundingClientRect(),minArea=sr.width*sr.height*0.2;
      let best=null,bestArea=0;
      for(const el of scope.querySelectorAll('div,main,section,article')){
        if(hasNav(el))continue;
        const r=el.getBoundingClientRect(),area=r.width*r.height;
        if(area>bestArea&&area>=minArea&&(el.textContent||'').trim().length>20){best=el;bestArea=area;}
      }
      if(!best)return false;
      for(const el of doc.querySelectorAll('[data-gptu-hidden],[data-gptu-path],[data-gptu-content]'))for(const a of ['data-gptu-hidden','data-gptu-path','data-gptu-content'])el.removeAttribute(a);
      for(let el=best;el&&el!==doc.documentElement;el=el.parentElement){
        for(const sib of el.parentElement?.children||[])if(sib!==el&&!['SCRIPT','STYLE','LINK','META','TEMPLATE'].includes(sib.tagName))sib.setAttribute('data-gptu-hidden','');
        if(el!==best&&el!==doc.body)el.setAttribute('data-gptu-path','');
      }
      best.setAttribute('data-gptu-content','');doc.documentElement.setAttribute('data-gptu-isolated','');
      return true;
    }catch(_){return false;}
  }
  function keepEmbeddedIsolated(frame){
    try{
      const doc=frame.contentDocument;let timer=null;
      const observer=new MutationObserver(()=>{clearTimeout(timer);timer=setTimeout(()=>isolateEmbeddedContent(doc),80);});
      observer.observe(doc.body,{childList:true,subtree:true});
      $('.credits-modal').addEventListener('close',()=>observer.disconnect(),{once:true});
    }catch(_){}
  }
  function creditFrameLoaded(frame){
    if(!$('.credits-modal').open||frame!==$('.credits-frame'))return;
    const prepared=prepareEmbeddedPage(frame);
    // Cross-origin checkout pages cannot be styled, but must remain usable.
    if(!prepared&&frame.contentDocument){$('.credits-status').textContent='Unable to prepare the page. Choose Open in tab.';return;}
    // Claude: wait for the settings content to render and be isolated before revealing the frame.
    const started=Date.now();
    const attempt=()=>{
      if(!$('.credits-modal').open||frame!==$('.credits-frame'))return;
      let doc=null;try{doc=frame.contentDocument;}catch(_){}
      if(!IS_CLAUDE||!doc)reveal();
      else if(isolateEmbeddedContent(doc)){keepEmbeddedIsolated(frame);reveal();}
      else if(Date.now()-started>6000)reveal();
      else setTimeout(attempt,100);
    };
    attempt();
    function reveal(){requestAnimationFrame(()=>{
      if(!$('.credits-modal').open||frame!==$('.credits-frame'))return;
      frame.removeAttribute('data-loading');frame.removeAttribute('aria-hidden');frame.removeAttribute('tabindex');
      $('.credits-modal').removeAttribute('aria-busy');
      clearTimeout(creditLoadTimeout);$('.credits-status').hidden=true;
    });}
    try{frame.contentDocument?.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();$('.credits-modal').close();}});}catch(_){}
  }
  const accentNames={auto:'Match theme',default:'Default',blue:'Blue',green:'Green',yellow:'Yellow',pink:'Pink',orange:'Orange',purple:'Purple',neutral:'Black / White'};
  const themeProbe=document.createElement('span');themeProbe.hidden=true;root.appendChild(themeProbe);
  function applyTheme() {
    const html=document.documentElement,body=document.body,nav=currentSidebar();
    const htmlStyle=getComputedStyle(html),bodyStyle=getComputedStyle(body),appStyle=getComputedStyle(document.getElementById('root')||body),navStyle=nav?getComputedStyle(nav):appStyle;
    const systemDark=matchMedia('(prefers-color-scheme: dark)').matches;
    let dark=state.theme==='dark'||state.theme==='system'&&systemDark||state.theme==='auto'&&(html.classList.contains('dark')||html.dataset.theme==='dark'||html.dataset.mode==='dark'||(!html.classList.contains('light')&&html.dataset.theme!=='light'&&html.dataset.mode!=='light'&&(htmlStyle.colorScheme==='dark'||htmlStyle.colorScheme!=='light'&&systemDark)));
    const variants=THEME_PRESETS.filter(p=>p.family===state.preset),preset=variants.find(p=>p.type===(dark?'dark':'light'))||variants[0];
    if(preset)dark=preset.type==='dark';
    host.toggleAttribute('data-dark',dark);
    const resolve=value=>{if(!value)return null;if(!globalThis.CSS.supports('color',value)){value=value.includes('%')?`hsl(${value})`:`rgb(${value})`;if(!globalThis.CSS.supports('color',value))return null;}themeProbe.style.color=value;const color=getComputedStyle(themeProbe).color;return color==='transparent'||color==='rgba(0, 0, 0, 0)'?null:color;};
    const nativeColor=(names,fallback)=>{for(const name of names){const value=navStyle.getPropertyValue(name).trim()||appStyle.getPropertyValue(name).trim()||bodyStyle.getPropertyValue(name).trim()||htmlStyle.getPropertyValue(name).trim();const color=resolve(value);if(color)return color;}return fallback;};
    const palette={claude:dark?'#d97757':'#c6613f',default:dark?'#60a5fa':'#2563eb',blue:dark?'#60a5fa':'#2563eb',green:dark?'#4ade80':'#15803d',yellow:dark?'#facc15':'#a16207',pink:dark?'#f472b6':'#be185d',orange:dark?'#fb923c':'#c2410c',purple:dark?'#c084fc':'#7e22ce',neutral:dark?'#ececec':'#202123'};
    const nativeAccent=(html.dataset.accentColor||body.dataset.accentColor||html.dataset.accent||body.dataset.accent||'').toLowerCase();
    const accent=state.accent==='auto'?(preset?preset.accent:state.preset==='chatgpt'?palette.default:state.preset==='claude'?palette.claude:nativeColor([...(IS_CLAUDE?['--accent-brand','--accent-main-100','--accent-main-000']:[]),'--color-accent','--theme-accent','--accent','--accent-color','--codex-accent','--interactive-bg-accent-default','--bg-accent','--text-accent','--accent-primary','--theme-user-selection-bg'],palette[nativeAccent]||(nativeAccent==='black'||nativeAccent==='white'?palette.neutral:IS_CLAUDE?palette.claude:palette.default))):palette[state.accent];
    const colors={'--remaining':accent,'--ok':accent};
    if(state.preset==='auto'&&state.theme==='auto'){
      if(nav){
        colors['--fg']=getComputedStyle(nav).color;
        for(let el=nav;el;el=el.parentElement){const bg=getComputedStyle(el).backgroundColor;if(bg!=='transparent'&&bg!=='rgba(0, 0, 0, 0)'){colors['--surface']=bg;break;}}
      }
      colors['--muted']=nativeColor([...(IS_CLAUDE?['--text-300']:[]),'--color-text-secondary','--muted-foreground','--text-secondary','--text-tertiary'],`color-mix(in srgb, ${colors['--fg']|| (dark?'#ececec':'#202123')} 70%, ${colors['--surface']|| (dark?'#000000':'#f9f9f9')})`);
      colors['--line']=nativeColor(['--color-border','--border','--border-default','--border-light'],`color-mix(in srgb, ${colors['--fg']|| (dark?'#ececec':'#202123')} 18%, ${colors['--surface']|| (dark?'#000000':'#f9f9f9')})`);
      colors['--hover']=nativeColor(['--color-surface-hover','--sidebar-surface-secondary','--bg-hover'],`color-mix(in srgb, ${colors['--fg']|| (dark?'#ececec':'#202123')} 8%, ${colors['--surface']|| (dark?'#000000':'#f9f9f9')})`);
    }
    if(colors['--surface'])colors['--track']=`color-mix(in srgb, ${colors['--fg']|| (dark?'#ececec':'#202123')} 15%, ${colors['--surface']})`;
    if(preset)Object.assign(colors,{'--surface':preset.surface,'--fg':preset.fg,'--muted':preset.muted,'--line':preset.border,'--hover':preset.hover,'--track':`color-mix(in srgb, ${preset.fg} 15%, ${preset.surface})`});
    const nativeContrast=(html.dataset.contrast||body.dataset.contrast||html.dataset.colorContrast||body.dataset.colorContrast||'system').toLowerCase();
    const increased=state.contrast==='increased'||(state.contrast==='system'||state.contrast==='auto'&&nativeContrast==='system')&&matchMedia('(prefers-contrast: more)').matches||state.contrast==='auto'&&['increased','high','more'].includes(nativeContrast);
    if(increased)Object.assign(colors,{'--fg':dark?'#ffffff':'#000000','--muted':dark?'#d4d4d4':'#424242','--line':dark?'#858585':'#727272','--track':dark?'#454545':'#d4d4d4'});
    if(state.barMode==='custom')card.style.setProperty('--bar-fill',state.barColor);else card.style.removeProperty('--bar-fill');
    card.toggleAttribute('data-meter-gradient',state.barMode==='custom'&&state.barGradient&&state.barGradientVisible);
    card.style.setProperty('--meter-gradient',colorScaleGradient());
    if(state.barMode==='custom'&&state.barGradient&&!state.barGradientVisible)for(const fill of root.querySelectorAll('.bar i'))fill.style.backgroundColor=percentageColor(Number(fill.parentElement.getAttribute('aria-valuenow')));
    else for(const fill of root.querySelectorAll('.bar i'))fill.style.removeProperty('background-color');
    updateBarPreview();
    host.toggleAttribute('data-increased-contrast',increased);
    for(const el of root.querySelectorAll('.card,.settings,.credits-modal,.reset-dialog,.dock-zone'))for(const key of ['--remaining','--ok','--fg','--surface','--muted','--line','--hover','--track']){
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
    const colorInput=(label,key)=>`<label class="setting"><span>${label}</span><input type="color" aria-label="${label}" data-simple-bar-color="${key}" value="${state[key]}"></label>`;
    const barPreview=`<div class="bar-preview"><div class="bar-preview-title">Color scale preview</div><div class="bar-preview-fill" role="img" aria-label="Bar color scale from 0 to 100 percent"></div><div class="bar-preview-labels"><span>0%</span><span>50%</span><span>100%</span></div></div>`;
    const middleControls=`${state.gradientStops.map((stop,index)=>`<div class="gradient-stop" data-color-label="Middle color ${index+1}"><input type="color" value="${stop.color}" data-gradient-color="${index}" aria-label="Middle color ${index+1}"><label>From <input type="number" min="1" max="99" step="1" value="${stop.from}" data-gradient-from="${index}" aria-label="Middle color ${index+1} from">%</label><label>To <input type="number" min="1" max="99" step="1" value="${stop.to}" data-gradient-to="${index}" aria-label="Middle color ${index+1} to">%</label><button class="text-btn" data-remove-stop="${index}" aria-label="Remove middle color ${index+1}">Remove</button><div class="gradient-blends"><label>Blend before <input type="number" min="0" max="100" step="1" value="${stop.blendBefore??''}" placeholder="Auto" data-gradient-before="${index}" aria-label="Middle color ${index+1} blend before">%</label><label>Blend after <input type="number" min="0" max="100" step="1" value="${stop.blendAfter??''}" placeholder="Auto" data-gradient-after="${index}" aria-label="Middle color ${index+1} blend after">%</label></div></div>`).join('')}<button class="text-btn" data-add-stop ${state.gradientStops.length>=8?'disabled':''}>Add middle color</button><div class="note">From/To sets the solid color range. Blend before/after sets transition widths in percentage points: smaller is sharper, 0 is a hard edge, blank fills the gap. Neighboring middle colors share the transition between them. 0% is empty; 100% is full.</div>`;
    const barControls=group('barSource','Color source',select('Bar color','barMode',{auto:'Match theme',custom:'Custom'})+(state.barMode==='custom'?toggle('Color by percentage','data-bar-gradient',state.barGradient)+(state.barGradient?'':colorInput('Custom bar color','barColor')):'')+barPreview+`<div class="note">Applies to plan, credit and feature bars.</div>`)+
      (state.barMode==='custom'&&state.barGradient?group('barDisplay','Meter display',toggle('Show gradient across meters','data-visible-gradient',state.barGradientVisible)+`<div class="note">Off: one color for the current percentage. On: show the color scale across the fill.</div>`)+group('barEnds','End colors',colorInput('Color at 0%','barStart')+colorInput('Color at 100%','barEnd'))+group('barMiddle','Middle colors & transitions',middleControls):'');
    const themeSelect=`<label class="setting"><span>Theme preset</span><select aria-label="Theme preset" data-setting="preset"><optgroup label="${SITE.name}"><option value="auto" ${state.preset==='auto'?'selected':''}>Match ${SITE.name}</option><option value="${SITE.preset}" ${state.preset===SITE.preset?'selected':''}>${T('ChatGPT','Claude (page colors, Claude accent)')}</option></optgroup><optgroup label="Codex themes">${THEME_FAMILIES.map(name=>`<option value="${esc(name)}" ${state.preset===name?'selected':''}>${esc(name)}</option>`).join('')}</optgroup></select></label>`;
    $('.settings').innerHTML=`<div class="settings-header"><div class="settings-title" title="Drag to move settings · Double-click to reset position"><button class="icon settings-grab" aria-label="Move settings" title="Drag or use arrow keys · Home resets position">${icon('grip')}</button><span>Usage settings</span><div class="history-buttons"><button class="icon undo-changes" aria-label="Undo changes" title="Undo changes" ${undoChanges.length?'':'disabled'}>${icon('undo')}</button><button class="icon redo-changes" aria-label="Redo changes" title="Redo changes" ${redoChanges.length?'':'disabled'}>${icon('redo')}</button></div><button class="icon close-settings" aria-label="Close settings">✕</button></div><div class="settings-tabs" role="tablist" aria-label="Settings categories">${Object.entries(SETTINGS_TABS).map(([key,label])=>`<button class="settings-tab" role="tab" id="gptu-tab-${key}" aria-controls="gptu-settings-${key}" aria-selected="${state.settingsTab===key}" tabindex="${state.settingsTab===key?0:-1}" data-settings-tab="${key}">${label}</button>`).join('')}</div></div><div class="settings-body">${
      tab('panel',group('placement','Docking & size',select('Placement','position',{top:'Sidebar top',bottom:'Sidebar bottom',floating:'Floating'})+toggle('Compact mode','data-compact',state.compact)+select('Drag handle position','floatHandlePosition',{before:'Before Usage',after:'After settings'}))+group('visibility','Visibility',toggle('Hide docked panel with sidebar','data-hide-with-sidebar',state.hideWithSidebar)+toggle('Hide frame completely','data-hide-frame',state.hideFrame))+group('hover','Hover behavior',`<div class="note">Turn a switch off to keep that element visible. Keyboard focus also reveals hover-only controls.</div>`+Object.entries(HOVER_OPTIONS).map(([key,item])=>toggle(item.label,`data-hover="${key}" ${key==='frame'&&state.hideFrame?'disabled':''}`,state.hover[key])).join('')+toggle('Hide collapsed Usage until hover','data-hide-collapsed',state.hideCollapsed))+group('status','Update time & Details',toggle('Show update time','data-show-update',state.showUpdateTime)+toggle('Show Details button','data-show-details',state.showDetails)+select('Status position','footerPosition',{header:'Header: before refresh','header-after':'Header: after refresh',top:'Above modules',bottom:'Below modules'})))+
      tab('modules',group('plan','Plan limits',moduleToggle('plan')+(IS_CLAUDE?'':toggle('Show banked reset count & button','data-usage-resets',state.showUsageResets)+toggle('Show paid reset button','data-paid-reset',state.showPaidReset))+toggle('Show remaining plan allowance','data-remaining-plan',state.showRemainingPlan)+`<div class="note">Also applies to the ${T('credits','extra usage')} bar: remaining when enabled, used when disabled.</div>`+toggle('Plan limit tooltips','data-plan-tooltips',state.showPlanTooltips))+group('credits',labels.credits,moduleToggle('credits')+toggle(T('Show credit balance bar','Show extra usage bar'),'data-credit-bar',state.showCreditBar)+`<div class="credit-reference-controls" ${state.showCreditBar?'':'hidden'}>${toggle(T('Show available balance','Show amount left'),'data-credit-balance',state.showCreditBalance)}${toggle(T('Balance beside Credits title','Amount beside Extra usage title'),`data-credit-title ${state.showCreditBalance?'disabled':''}`,state.creditBalanceInTitle)}<div class="note">When the large balance is hidden, move its amount from the percentage row to the ${labels.credits} title.</div><label class="setting"><span>${T('Full balance','Fallback limit')}</span><span class="margin-input"><input type="number" aria-label="Full credit balance" min="0.01" step="any" data-credit-reference value="${state.creditReference??''}" placeholder="${T('e.g. 1000','e.g. 50')}">${T('credits','')}</span></label><div class="note">${T('This amount counts as 100%. Initially uses your balance when enabled; you can change it.','Claude normally reports your monthly extra-usage limit, which counts as 100%. This value is used only when it does not.')}</div></div>`+toggle(T('Add credits button','Manage extra usage button'),'data-add-credits',state.showAddCredits))+group('features','Models & features',moduleToggle('features')+`<div class="feature-settings"><div class="feature-settings-title">Individual counters</div><div class="feature-options" role="group" aria-label="Models & features to show"></div><div class="note">Selections are kept when the module is hidden.</div></div>`))+
      tab('appearance',group('appearance','Theme & mode',themeSelect+select('Appearance','theme',{auto:'Match '+SITE.name,system:'System',light:'Light',dark:'Dark'})+`<div class="note">Match ${SITE.name} follows the page palette and custom colors. Codex presets use available light/dark variants; some have only one mode.</div>`)+group('colors','Accent & contrast',select('Accent color','accent',accentNames)+select('Contrast','contrast',{auto:'Match '+SITE.name,system:'System',medium:'Medium',increased:'Increased'})))+
      tab('bars',barControls+`<button class="text-btn" data-reset-bar-colors>Reset bar colors</button>`)+
      tab('spacing',`${select('Editing spacing','spacingMode',{auto:'Current density',normal:'Normal',compact:'Compact'})}<div class="note">Editing ${profile==='normal'?'normal':'compact'} mode. All values are in pixels. Inside frame controls the space within the border; outside frame controls the surrounding gap.</div>`+group('spacePanel','Panel & header',['outer','frame','header'].map(box).join(''))+group('spaceStatus','Update time & summary',['status','headerStatus','statusButton','summary'].map(box).join(''))+group('spaceModules','Module spacing',['plan','credits','features','sectionHeader','sectionContent'].map(box).join(''))+group('spaceItems','Items & credits',['planRows','featureRows','creditBalance','creditMeter','addCredits'].map(box).join(''))+group('spaceBars','Bars & captions',['planBars','creditBars','featureBars','captions'].map(box).join(''))+group('spaceDetails','Expanded Details',['details','detailsContent'].map(box).join(''))+`<button class="text-btn reset-spacing" data-reset-spacing="${profile}">Reset ${profile} spacing</button>`)
    }${tab('sync',syncPanelContent())}</div><div class="settings-help"><details><summary>Moving & keyboard controls</summary><div class="note">Drag this window by its title. Double-click the title to return it beside the panel. Use arrow keys on a move or reorder handle.</div></details><div class="settings-file-actions"><button class="text-btn" data-export-settings>Export settings</button><button class="text-btn" data-import-settings>Import settings…</button><button class="text-btn reset">Reset all settings</button></div><span class="export-status" role="status"></span></div><button class="icon settings-resize" aria-label="Resize settings" title="Drag to resize · Arrow keys resize · Double-click resets size"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" aria-hidden="true"><path d="m5 13 8-8m-3 8 3-3"/></svg></button>`;
    renderFeatureSettings();updateBarPreview();positionSettings();
  }
  function selectSettingsTab(key,focus=false){
    if(!Object.hasOwn(SETTINGS_TABS,key))return;
    if(key==='sync')readOtherSite().then(()=>{if(!syncMessage)renderSyncPanel();});
    state.settingsTab=key;persist(false);
    if(key==='spacing')renderSettings();
    for(const el of root.querySelectorAll('[data-settings-tab]')){const selected=el.dataset.settingsTab===key;el.setAttribute('aria-selected',String(selected));el.tabIndex=selected?0:-1;if(selected&&focus)el.focus();}
    for(const el of root.querySelectorAll('.settings-panel'))el.hidden=el.id!=='gptu-settings-'+key;
    $('.settings-body').scrollTop=0;positionSettings();
  }
  function renderFeatureSettings(){
    const active=root.activeElement?.dataset.feature;
    const names=[...new Set([...Object.keys(featureNames),...Object.keys(state.models),...Object.keys(state.hiddenFeatures)])];
    $('.feature-options').innerHTML=names.map(name=>`<label><span>${esc(featureLabel(name))}</span><input type="checkbox" role="switch" aria-label="Show ${esc(featureLabel(name))} counter" data-feature="${esc(name)}" ${state.hiddenFeatures[name]!==true?'checked':''}></label>`).join('');
    if(active)[...$('.feature-options').querySelectorAll('[data-feature]')].find(el=>el.dataset.feature===active)?.focus();
  }
  function render() {
    const head=$('.head'),handle=$('.grab');
    if(state.floatHandlePosition==='after'){if(head.lastElementChild!==handle)head.appendChild(handle);}
    else if(head.firstElementChild!==handle)head.prepend(handle);
    applyTheme();
    card.classList.toggle('collapsed',!!state.collapsed);
    card.toggleAttribute('data-hide-frame',state.hideFrame);
    for(const key of Object.keys(HOVER_OPTIONS))card.toggleAttribute('data-hover-'+key,state.hover[key]);
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
    if(state.showPaidReset)blocks.plan+=`<button class="add-credits paid-reset" title="Open ChatGPT Usage to review paid reset offers">Paid reset…</button>`;
    const balance=num(parsed.credits),creditRef=parsed.creditLimit>0?parsed.creditLimit:state.creditReference;
    const money=n=>{try{return parsed.currency?new Intl.NumberFormat(undefined,{style:'currency',currency:parsed.currency}).format(n):format(n);}catch(_){return format(n);}};
    if(state.showCreditBar&&state.creditReferencePending&&!(parsed.creditLimit>0)&&balance>0){state.creditReference=Number(balance.toFixed(2))||balance;state.creditReferencePending=false;persist(false);syncCreditBarSettings();}
    const creditText=balance!=null?money(balance):parsed.credits??'—';
    const balanceInTitle=state.creditBalanceInTitle&&state.showCreditBar&&!state.showCreditBalance&&balance!=null&&creditRef>0;
    let creditMeter='';
    if(state.showCreditBar){
      if(balance!=null&&creditRef>0){
        const remaining=Math.max(0,balance/creditRef*100),percentage=state.showRemainingPlan?remaining:Math.max(0,100-remaining),text=new Intl.NumberFormat(undefined,{maximumFractionDigits:1}).format(percentage);
        creditMeter=`<div class="credit-meter ${state.showCreditBalance||balanceInTitle?'':'has-inline-balance'}"><div class="rl"><span>${state.showRemainingPlan?'Remaining':'Used'}</span><span class="v"><span class="credit-percentage">${text}%</span>${state.showCreditBalance||balanceInTitle?'':`<span class="credit-meter-balance" role="group" aria-label="Available balance">${esc(creditText)}</span>`}</span></div>${bar(Math.min(100,percentage),labels.credits,state.showRemainingPlan)}<div class="sub">${parsed.creditLimit>0?`${money(creditRef-balance)} used of ${money(creditRef)} monthly limit`:`of ${format(creditRef)} credits`}</div></div>`;
      }else if(balance!=null)creditMeter=`<div class="sub credit-meter">Set a ${T('full balance','fallback limit')} in settings to show a percentage.</div>`;
      else if(parsed.credits!=='Unlimited'&&parsed.credits!=='Off')creditMeter=`<div class="sub credit-meter">${T('Balance unavailable.','Extra usage not reported.')}</div>`;
    }
    const hasCreditPercentage=state.showCreditBar&&balance!=null&&creditRef>0;
    const creditBalance=!hasCreditPercentage||state.showCreditBalance?`<div class="credit-balance"><div class="credit">${esc(creditText)}</div><div class="sub">${parsed.credits==null?T('No credit balance reported','Extra usage not reported'):parsed.credits==='Off'?'Extra usage is turned off':parsed.credits==='Unlimited'&&IS_CLAUDE?'No monthly limit':parsed.creditLimit>0?'Left this month':'Available balance'}</div></div>`:'';
    const addCredits=state.showAddCredits?'<a class="add-credits" href="'+esc(creditPurchaseUrl())+'" target="_blank" rel="noopener noreferrer"><svg aria-hidden="true" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 3v10M3 8h10"/></svg>'+T('Add credits','Manage')+'</a>':'';
    blocks.credits=creditBalance+(state.showCreditBar?`<div class="credit-actions">${creditMeter}${addCredits}</div>`:addCredits);
    const models=Object.entries(state.models).filter(([name])=>state.hiddenFeatures[name]!==true).sort((a,b)=>(b[1].seenAt||0)-(a[1].seenAt||0)).slice(0,12);
    blocks.features=models.map(([name,m])=>{
      const expired=m.resetsAt&&m.resetsAt<=Date.now();
      const val=expired?'Refresh needed':m.remaining!=null?(m.limit!=null?`${format(m.remaining)} / ${format(m.limit)} left`:`${format(m.remaining)} left`):m.used!=null&&m.limit!=null?`${format(m.used)} / ${format(m.limit)} used`:'—';
      const label=featureLabel(name);
      const pct=!expired&&m.limit>0?(m.remaining!=null?100-m.remaining/m.limit*100:m.used!=null?m.used/m.limit*100:null):null;
      return `<div class="row" data-counter="${esc(name)}"><div class="rl"><span>${esc(label)}</span><span class="v">${esc(val)}</span></div>${pct==null?'':bar(Math.max(0,Math.min(100,pct)),label)}<div class="sub">${!expired&&m.resetsAt?`Resets in ${fmtDur(m.resetsAt-Date.now())} · `:''}Seen ${fmtAgo(m.seenAt)}</div></div>`;
    }).join('')||`<div class="empty">${Object.keys(state.models).length?'All reported counters are hidden. Choose which to show in settings.':`Limits appear here when ${SITE.name} reports them.`}</div>`;
    const scroll=$('.body').scrollTop;
    const focused=root.activeElement?.dataset;
    const rawFocused=root.activeElement?.classList.contains('raw');
    const inHeader=['header','header-after'].includes(state.footerPosition);
    const footer=state.showUpdateTime||(!inHeader&&state.showDetails)?`<div class="foot ${inHeader?'head-status':''}">${state.showUpdateTime?`<span class="updated-at" title="Updated ${esc(fmtAgo(state.usageAt))}">${inHeader?'':'Updated '}${fmtAgo(state.usageAt)}</span>`:''}${!inHeader&&state.showDetails?`<button class="text-btn raw" aria-expanded="${state.showRaw}">${state.showRaw?'Hide data':'Details'}</button>`:''}</div>`:'';
    $('.head-status-slot').innerHTML=state.footerPosition==='header'?footer:'';
    $('.head-status-after-slot').innerHTML=state.footerPosition==='header-after'?footer:'';
    $('.head').classList.toggle('has-header-status',inHeader&&!!footer);
    $('.head').classList.toggle('has-status-after',state.footerPosition==='header-after'&&!!footer);
    $('.body').innerHTML=(state.footerPosition==='top'?footer:'')+state.sections.filter(k=>!state.hidden[k]).map(k=>`<section class="section" data-section="${k}"><div class="section-head"><button class="section-toggle" data-collapse="${k}" aria-expanded="${!state.closed[k]}" aria-controls="gptu-${k}">${icon(k)}<span>${labels[k]}</span>${k==='credits'&&(state.closed.credits||balanceInTitle)?`<span class="credit-inline" role="group" aria-label="Available balance">${esc(creditText)}</span>`:''}${icon('chevron')}</button>${k==='plan'&&state.showUsageResets&&resetCount()!=null?`<span class="reset-tools" title="Available usage limit resets"><span>${resetCount()} ${resetCount()===1?'reset':'resets'}</span>${resetCount()>0?`<button class="use-reset" aria-label="Use usage limit reset" ${resetPending?'disabled':''}>Use</button>`:''}</span>`:''}<button class="icon section-handle" draggable="true" data-handle="${k}" aria-label="Reorder ${labels[k]}" title="Drag to reorder · ↑ / ↓">${icon('grip')}</button></div><div class="section-content" id="gptu-${k}" ${state.closed[k]?'hidden':''}>${blocks[k]}</div></section>`).join('')+
      `${state.error?`<div class="err" role="status">${esc(state.error)}</div>`:''}${state.footerPosition==='bottom'?footer:''}${state.showRaw?`<pre>${esc(JSON.stringify(IS_CLAUDE?{claude:state.rawUsage??null,usage:state.usage,models:state.models}:{usage:state.usage,models:state.models},null,2))}</pre>`:''}`;
    $('.body').scrollTop=scroll;
    if(host.hasAttribute('data-bottom')) layoutBottom();
    if(rawFocused) $('.raw')?.focus();
    else if(focused?.handle) root.querySelector(`[data-handle="${focused.handle}"]`)?.focus();
    else if(focused?.collapse) root.querySelector(`[data-collapse="${focused.collapse}"]`)?.focus();
  }
  $('.toggle').onclick=()=>{state.collapsed=!state.collapsed; persist(); render();};
  $('.refresh').onclick=()=>requestRefresh(true);
  function applySettingsSize(){
    const menu=$('.settings'),size=state.settingsSize;
    menu.style.width=size?Math.max(Math.min(240,innerWidth-16),Math.min(size.width,innerWidth-16))+'px':'';
    menu.style.height=size?Math.max(Math.min(180,innerHeight-16),Math.min(size.height,innerHeight-16))+'px':'';
  }
  function positionSettings() {
    if(!settingsOpen)return;
    applySettingsSize();
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
    if(state.settingsClosed[key]!==closed){state.settingsClosed[key]=closed;persist(false);}
    positionSettings();
  },true);
  let settingsResizing=null;
  root.addEventListener('pointerdown',event=>{
    const handle=event.target.closest?.('.settings-resize');if(!handle||event.button!==0)return;
    const r=$('.settings').getBoundingClientRect();state.settingsPosition={x:r.left,y:r.top};
    settingsResizing={x:event.clientX,y:event.clientY,width:r.width,height:r.height};handle.setPointerCapture(event.pointerId);event.preventDefault();
  });
  window.addEventListener('pointermove',event=>{
    if(!settingsResizing)return;
    state.settingsSize={width:settingsResizing.width+event.clientX-settingsResizing.x,height:settingsResizing.height+event.clientY-settingsResizing.y};positionSettings();
  });
  const endSettingsResize=()=>{if(!settingsResizing)return;settingsResizing=null;if(settingsOpen){const r=$('.settings').getBoundingClientRect();state.settingsSize={width:r.width,height:r.height};}persist();};
  window.addEventListener('pointerup',endSettingsResize);window.addEventListener('pointercancel',endSettingsResize);window.addEventListener('blur',endSettingsResize);
  root.addEventListener('dblclick',event=>{if(event.target.closest?.('.settings-resize')){state.settingsSize=null;persist();positionSettings();}});
  root.addEventListener('keydown',event=>{
    if(!event.target.closest?.('.settings-resize'))return;
    if(event.key==='Home'){event.preventDefault();state.settingsSize=null;persist();positionSettings();return;}
    if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;
    event.preventDefault();const r=$('.settings').getBoundingClientRect(),step=event.shiftKey?30:10;
    state.settingsPosition={x:r.left,y:r.top};state.settingsSize={width:r.width+(event.key==='ArrowRight'?step:event.key==='ArrowLeft'?-step:0),height:r.height+(event.key==='ArrowDown'?step:event.key==='ArrowUp'?-step:0)};positionSettings();persist();
  });
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
  root.addEventListener('dblclick',event=>{if(event.target.closest?.('.settings-title')&&!event.target.closest('button:not(.settings-grab)'))resetSettingsPosition();});
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
    if(e.target.closest('.raw')){state.showRaw=!state.showRaw;if(state.showRaw&&state.collapsed)state.collapsed=false;persist();render();$('.raw').focus();}
    if(e.target.closest('.reset')){Object.assign(state,defaultPreferences());persist();closeSettings(true);render();place(true);}
  });
  function syncCreditBarSettings(){
    const controls=$('.credit-reference-controls');if(!controls)return;
    const titleToggle=$('[data-credit-title]');if(titleToggle)titleToggle.disabled=state.showCreditBalance;
    controls.hidden=!state.showCreditBar;
    const input=controls.querySelector('[data-credit-reference]');if(root.activeElement!==input)input.value=state.creditReference??'';
  }
  root.addEventListener('change',event=>{
    if(event.target.hasAttribute('data-visible-gradient')){state.barGradientVisible=event.target.checked;persist();render();}
    if(event.target.hasAttribute('data-bar-gradient')){state.barGradient=event.target.checked;persist();render();renderSettings();}
    if(event.target.hasAttribute('data-credit-title')){state.creditBalanceInTitle=event.target.checked;persist();render();}
    if(event.target.hasAttribute('data-usage-resets')){state.showUsageResets=event.target.checked;persist();render();}
    if(event.target.hasAttribute('data-paid-reset')){state.showPaidReset=event.target.checked;persist();render();}
    if(event.target.dataset.setting==='barMode'){state.barMode=event.target.value;persist();render();renderSettings();}
  });
  root.addEventListener('input',event=>{
    const key=event.target.dataset.simpleBarColor,value=event.target.value;if(!['barColor','barStart','barEnd'].includes(key)||!isHex(value))return;
    state[key]=value;persist();render();
  });
  function editMiddleColor(event){
    const target=event.target,index=Number(target.dataset.gradientColor??target.dataset.gradientFrom??target.dataset.gradientTo??target.dataset.gradientBefore??target.dataset.gradientAfter);
    const stop=state.gradientStops[index];if(!Number.isInteger(index)||!stop)return;
    if(target.hasAttribute('data-gradient-color')&&isHex(target.value))stop.color=target.value;
    else if(target.hasAttribute('data-gradient-before')||target.hasAttribute('data-gradient-after')){
      if(!target.validity.valid)return;const key=target.hasAttribute('data-gradient-before')?'blendBefore':'blendAfter';stop[key]=target.value===''?null:Number(target.value);
    }
    else if((target.hasAttribute('data-gradient-from')||target.hasAttribute('data-gradient-to'))&&target.value!==''&&target.validity.valid){
      const lower=index?state.gradientStops[index-1].to:1,upper=state.gradientStops[index+1]?.from??99;
      const value=Math.max(lower,Math.min(upper,Number(target.value)));
      if(target.hasAttribute('data-gradient-from')){stop.from=value;stop.to=Math.max(value,stop.to);}
      else{stop.to=value;stop.from=Math.min(value,stop.from);}
      const other=target.closest('.gradient-stop').querySelector(target.hasAttribute('data-gradient-from')?'[data-gradient-to]':'[data-gradient-from]');
      if(other)other.value=target.hasAttribute('data-gradient-from')?stop.to:stop.from;
      if(event.type==='change')target.value=target.hasAttribute('data-gradient-from')?stop.from:stop.to;
    }else return;
    persist();applyTheme();
  }
  root.addEventListener('input',editMiddleColor);root.addEventListener('change',editMiddleColor);
  root.addEventListener('click',event=>{
    const target=event.target;
    if(target.hasAttribute('data-add-stop')&&state.gradientStops.length<8){
      const points=[0,...state.gradientStops.flatMap(stop=>[stop.from,stop.to]),100];let left=0,right=100,gap=0;
      for(let i=1;i<points.length;i++)if(points[i]-points[i-1]>gap){left=points[i-1];right=points[i];gap=right-left;}
      const at=Math.max(1,Math.min(99,Math.round((left+right)/2)));
      state.gradientStops.push({from:at,to:at,color:'#a78bfa',blendBefore:null,blendAfter:null});state.gradientStops.sort((a,b)=>a.from-b.from);
    }else if(target.hasAttribute('data-remove-stop'))state.gradientStops.splice(Number(target.dataset.removeStop),1);
    else return;
    persist();applyTheme();renderSettings();
  });
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
    if(e.target.hasAttribute('data-credit-balance')){state.showCreditBalance=e.target.checked;persist();render();syncCreditBarSettings();positionSettings();}
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
    if(e.target.hasAttribute('data-hide-frame')){state.hideFrame=e.target.checked;persist();render();const control=$('[data-hover="frame"]');if(control)control.disabled=state.hideFrame;}
    if(e.target.hasAttribute('data-hover')){const key=e.target.dataset.hover;if(Object.hasOwn(HOVER_OPTIONS,key)){state.hover[key]=e.target.checked;persist();render();}}
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
    const nav=currentSidebar();
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
  // aria-hidden/inert only mean "not on screen" when the page set them itself. Menus and dialogs
  // (right-click menus, popovers) mark everything else that way while it all stays visible:
  // those come from hide-others helpers that also add data-aria-hidden / data-inert markers.
  const temporarilyHidden=node=>node.hasAttribute('data-aria-hidden')||node.hasAttribute('data-inert')||node.hasAttribute('data-suppressed');
  function isVisibleElement(el,allowZeroHeight=false,ignoreAria=false) {
    const r=el.getBoundingClientRect();
    if(r.width<=0||(r.height<=0&&!allowZeroHeight)||r.right<=0||r.bottom<=0||r.left>=innerWidth||r.top>=innerHeight)return false;
    for(let node=el;node&&node!==document.body;node=node.parentElement){
      const style=getComputedStyle(node);
      if(style.display==='none'||style.visibility==='hidden'||Number(style.opacity)===0||node.hidden)return false;
      if(!ignoreAria&&!temporarilyHidden(node)&&(node.getAttribute('aria-hidden')==='true'||node.hasAttribute('inert')))return false;
    }
    return true;
  }
  function claudeSidebar(){
    // claude.ai keeps the account button at the foot of the left sidebar; climb to the column that holds it.
    const account=[...document.querySelectorAll('[data-testid="user-menu-button"]')].find(el=>!host.contains(el)&&isVisibleElement(el));
    for(let el=account?.parentElement;el&&el!==document.body;el=el.parentElement){
      const r=el.getBoundingClientRect();
      if(r.left>innerWidth/2||r.width>520)break;
      if(r.width>120&&r.height>innerHeight*0.6&&(el.matches('nav,aside')||el.querySelector('a[href^="/chat/"],a[href^="/code/"],a[href="/new"],a[href^="/project"]')))return el;
    }
    return null;
  }
  // Menus (right-click, popovers) mark the rest of the page aria-hidden/inert while it stays on
  // screen. Keep using the sidebar we already found as long as it is still laid out.
  function currentSidebar(){
    const nav=findSidebarNav();if(nav)return nav;
    return observedSidebar?.isConnected&&isVisibleElement(observedSidebar,false,true)?observedSidebar:null;
  }
  function findSidebarNav(){
    if(IS_CLAUDE){const claude=claudeSidebar();if(claude)return claude;}
    for(const selector of IS_CLAUDE?['nav[aria-label="Sidebar"]','[data-testid="menu-sidebar"]','aside nav','nav']:['nav[aria-label="Chat history"]','#stage-slideover-sidebar nav','[data-testid="sidebar"] nav','nav']){
      for(const el of document.querySelectorAll(selector)){
        const r=el.getBoundingClientRect();
        if(el.getAttribute('aria-label')!=='Show sidebar'&&r.width>120&&(selector==='nav'?r.height>160:r.height>=0)&&r.left>=0&&r.left<innerWidth/2&&isVisibleElement(el,selector!=='nav'))return el;
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
      if(container.matches('#app-shell-sidebar,#stage-slideover-sidebar,[data-testid="sidebar"],[data-testid="menu-sidebar"],aside'))break;
    }
    const selectors=[...(IS_CLAUDE?['[data-testid="user-menu-button"]']:[]),'button[aria-label="Open profile menu"]','[data-testid="accounts-profile-button"], [data-testid="user-menu-button"], [data-testid="profile-button"]','footer'];
    // The collapsed rail and expanded sidebar coexist. Search the active history
    // nav first, and reject hidden duplicate profile controls in every search.
    // Second pass ignores aria-hidden/inert: an open menu marks the account row that way while it
    // stays on screen, and losing it would drop the panel below the account row.
    let account=null;
    for(const ignoreAria of [false,true]){
      for(const scope of [nav,container]){
        for(const selector of selectors){
          account=[...scope.querySelectorAll(selector)].find(el=>!host.contains(el)&&isVisibleElement(el,false,ignoreAria));
          if(account)break;
        }
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
  function layoutBottom(nav=currentSidebar()) {
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
    alignToSidebar(nav);
  }
  // Claude's sidebar column pads its contents, which doubled the panel's side margins. Stretch the
  // docked panel to the column's edges so only the panel's own margin remains, as on ChatGPT.
  function alignToSidebar(nav){
    const docked=IS_CLAUDE&&nav&&!host.hasAttribute('data-floating')&&!host.hasAttribute('data-sidebar-hidden');
    if(!docked){if(host.style.marginLeft||host.style.marginRight){host.style.marginLeft='';host.style.marginRight='';}return;}
    const n=nav.getBoundingClientRect(),h=host.getBoundingClientRect();
    const left=parseFloat(host.style.marginLeft)||0,right=parseFloat(host.style.marginRight)||0;
    const nextLeft=Math.min(0,left-(h.left-n.left)),nextRight=Math.min(0,right-(n.right-h.right));
    const l=Math.abs(nextLeft)<0.5?'':nextLeft+'px',r=Math.abs(nextRight)<0.5?'':nextRight+'px';
    if(host.style.marginLeft!==l)host.style.marginLeft=l;
    if(host.style.marginRight!==r)host.style.marginRight=r;
  }

  function syncHeading(nav){
    const reference=[...nav.querySelectorAll('[data-testid="create-new-chat-button"],a[href="/"],a[href]')].find(el=>!host.contains(el)&&isVisibleElement(el));
    const measured=reference?parseFloat(getComputedStyle(reference).fontSize):14;
    const size=(measured>=13&&measured<=20?measured:14)+'px';
    if(host.style.getPropertyValue('--gptu-title-size')!==size)host.style.setProperty('--gptu-title-size',size);
  }
  let sawSidebar=false;
  function place(force){
    const nav=currentSidebar();
    if(nav)sawSidebar=true;
    const hidden=state.position!=='floating'&&!nav&&(sawSidebar||!IS_CLAUDE)&&state.hideWithSidebar;
    host.toggleAttribute('data-sidebar-hidden',hidden);
    if(hidden){
      if(settingsOpen)closeSettings();
      if($('.credits-modal').open)$('.credits-modal').close();
      if($('.reset-dialog').open)$('.reset-dialog').close();
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
    alignToSidebar(nav);positionSettings();
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
  const settingsWindowStyle=document.createElement('style');settingsWindowStyle.textContent=`.settings{overflow:hidden}.settings-header,.settings-help{flex:none}.settings-body{flex:1 1 auto;min-height:0;overflow:auto;scrollbar-width:thin;scrollbar-color:var(--track) transparent;scrollbar-gutter:stable}.settings-body::-webkit-scrollbar{width:6px}.settings-body::-webkit-scrollbar-thumb{background:var(--track);border-radius:6px}.settings-help{padding-right:30px}.settings-resize{position:absolute;right:2px;bottom:2px;z-index:5;cursor:nwse-resize;touch-action:none;width:22px;height:22px}.settings-resize svg{width:12px;height:12px}`;root.appendChild(settingsWindowStyle);

  const hoverStyle=document.createElement('style');
  const controlSelectors=Object.values(HOVER_OPTIONS).filter(item=>item.selector).flatMap(item=>item.selector.split(',').map(selector=>'.card '+selector));
  const hoverHidden=Object.entries(HOVER_OPTIONS).filter(([,item])=>item.selector).map(([key,item])=>item.selector.split(',').map(selector=>`.card[data-hover-${key}]:not(:hover):not(:has(:focus-visible)) ${selector}`).join(',')+'{opacity:0;pointer-events:none;}').join('');
  hoverStyle.textContent=`
    ${controlSelectors.join(',')},.card .foot{opacity:1;pointer-events:auto;}
    .card{border-color:var(--line);}
    :host([data-floating]) .card{box-shadow:0 8px 32px #0003;}
    .card .body{scrollbar-color:var(--track) transparent;}
    .card .body::-webkit-scrollbar-thumb{background:var(--track);}
    @media(hover:hover){
      ${hoverHidden}
      .card[data-hover-frame]:not(:hover):not(:has(:focus-visible)){border-color:transparent;box-shadow:none;}
      .card[data-hover-float]:not(:hover):not(:has(:focus-visible)) .head .grab{width:0;min-width:0;margin-right:-3px;overflow:hidden;}
      .card[data-hover-updated]:not(:hover):not(:has(:focus-visible)) .head-status.foot{flex:0 0 0;width:0;margin:0;padding:0;}
      .card[data-hover-updated]:not(:hover):not(:has(:focus-visible)) .head-status-after-slot>.head-status.foot{margin-right:-3px;}
      .card[data-hover-collapse]:not(:hover):not(:has(:focus-visible)) .head .collapse-panel{width:0;min-width:0;margin-right:-2px;overflow:hidden;}
      .card[data-hover-refresh]:not(:hover):not(:has(:focus-visible)) .head>.refresh,
      :host(:not([data-settings-open])) .card[data-hover-customize]:not(:hover):not(:has(:focus-visible)) .head>.customize{width:0;min-width:0;margin-right:-3px;overflow:hidden;}
      .card[data-hover-scrollbar]:not(:hover):not(:has(:focus-visible)) .body{scrollbar-color:transparent transparent;}
      .card[data-hover-scrollbar]:not(:hover):not(:has(:focus-visible)) .body::-webkit-scrollbar-thumb{background:transparent;}
    }
    :host([data-settings-open]) .card .customize{opacity:1;pointer-events:auto;}
    .card[data-hide-frame],.card[data-hide-frame]:hover,.card[data-hide-frame]:has(:focus-visible){border-color:transparent;box-shadow:none;}
    :host([data-floating]) .card[data-hide-frame]{border-color:transparent;box-shadow:none;}
  `;
  root.appendChild(hoverStyle);

  // ---------- boot ----------
  // Toolbar icon follows the site (background.js sets it for this tab).
  try{const runtime=(globalThis.browser??chrome).runtime;runtime.sendMessage({type:'usage-meter-site',site:SITE.id})?.catch?.(()=>{});}catch(_){}
  load().then(() => {
    // drop model entries older than 7 days
    const cutoff = Date.now() - 7 * 864e5;
    for (const [k, v] of Object.entries(state.models)) if ((v.seenAt || 0) < cutoff) delete state.models[k];
    state.sections = [...new Set([...state.sections.filter(k => ["plan", "credits", "features"].includes(k)), "plan", "credits", "features"])];
    render();
    place(true);
    historyCurrent=preferenceSnapshot();historyReady=true;
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
