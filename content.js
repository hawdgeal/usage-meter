// Sidebar interface and local preferences. Runs in the extension's isolated world.
(() => {
  if (document.getElementById('gptu-usage-host')) return;

  const INBOUND = 'gptu-hook';
  const OUTBOUND = 'gptu-ui';
  const REFRESH_INTERVAL = 2 * 60 * 1000;
  const MIN_REFRESH_GAP = 15 * 1000;
  const SECTION_NAMES = { plan: 'Plan limits', credits: 'Credits', models: 'Models & features', diagnostics: 'Diagnostics' };
  const SECTION_IDS = Object.keys(SECTION_NAMES);
  const DEFAULT_SECTIONS = ['plan', 'credits', 'models', 'diagnostics'];
  const storage = (globalThis.browser && browser.storage) || chrome.storage;
  const runtime = (globalThis.browser && browser.runtime) || chrome.runtime;
  const state = {
    usage: null, plan: null, usageAt: 0, error: null, models: {},
    collapsed: false, position: 'top', dock: 'sidebar', floatPos: null,
    order: [...DEFAULT_SECTIONS], closed: { diagnostics: true },
    hidden: [], compact: false, showAllModels: false, showRaw: false,
    settingsOpen: false
  };
  let lastRefresh = 0;
  let busy = false;
  let dragInProgress = false;
  let draggingModule = null;
  let dropTarget = null;

  function save() {
    const keys = ['usage', 'plan', 'usageAt', 'models', 'collapsed', 'position', 'dock', 'floatPos', 'order', 'closed', 'hidden', 'compact', 'showAllModels'];
    const data = {};
    for (const key of keys) data[key] = state[key];
    try {
      const request = storage.local.set({ gptu: data });
      if (request && typeof request.catch === 'function') request.catch(() => {});
    } catch (_) { /* optional storage */ }
  }
  async function load() {
    try {
      const data = (globalThis.browser && browser.storage)
        ? await browser.storage.local.get('gptu')
        : await new Promise((resolve) => chrome.storage.local.get('gptu', resolve));
      if (data && data.gptu && typeof data.gptu === 'object') Object.assign(state, data.gptu);
    } catch (_) { /* proceed with defaults */ }
    state.order = [
      ...((Array.isArray(state.order) ? state.order : []).filter((id, i, a) => SECTION_IDS.includes(id) && a.indexOf(id) === i)),
      ...SECTION_IDS.filter((id) => !(Array.isArray(state.order) && state.order.includes(id)))
    ];
    state.hidden = Array.isArray(state.hidden) ? state.hidden.filter((id) => SECTION_IDS.includes(id)) : [];
    state.closed = state.closed && typeof state.closed === 'object' ? state.closed : {};
    state.position = state.position === 'bottom' ? 'bottom' : 'top';
    state.dock = state.dock === 'floating' ? 'floating' : 'sidebar';
    // Keep only recently observed per-model data (the API does not report every model every time).
    const cutoff = Date.now() - 7 * 86400000;
    state.models = state.models && typeof state.models === 'object' ? state.models : {};
    for (const [name, value] of Object.entries(state.models)) {
      if (!value || (value.seenAt || 0) < cutoff) delete state.models[name];
    }
  }

  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(+v) ? +v : null);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const countFmt = (n) => Number.isFinite(Number(n)) ? new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(Number(n)) : String(n);
  function fmtDur(ms) {
    if (ms == null) return '';
    if (ms <= 0) return 'now';
    const mins = Math.max(1, Math.ceil(ms / 60000));
    if (mins < 60) return `${mins}m`;
    const h = Math.floor(mins / 60), m = mins % 60;
    if (h < 48) return m ? `${h}h ${m}m` : `${h}h`;
    const d = Math.floor(h / 24), hours = h % 24;
    return hours ? `${d}d ${hours}h` : `${d}d`;
  }
  function fmtAgo(at) {
    if (!at) return 'Never';
    const diff = Date.now() - at;
    if (diff < 45000) return 'Just now';
    return `${fmtDur(diff)} ago`;
  }
  function windowLabel(seconds, fallback) {
    const sec = num(seconds);
    if (!sec) return fallback;
    const h = sec / 3600;
    if (Math.abs(h - 168) < 1) return 'Weekly';
    if (Math.abs(h - 24) < .5) return 'Daily';
    if (h < 48) return `${+h.toFixed(h < 10 ? 1 : 0)}-hour`;
    return `${Math.round(h / 24)}-day`;
  }
  function resetAt(window) {
    const absolute = window.reset_at ?? window.resets_at;
    if (typeof absolute === 'string' && Number.isNaN(Number(absolute))) {
      const date = Date.parse(absolute);
      if (Number.isFinite(date)) return date;
    }
    const at = num(absolute);
    if (at != null) return at > 1e12 ? at : at * 1000;
    const after = num(window.reset_after_seconds ?? window.resets_in_seconds ?? window.reset_after);
    return after == null ? null : state.usageAt + after * 1000;
  }
  function parseUsage(usage) {
    const rows = [];
    if (!usage || typeof usage !== 'object') return { rows, credits: null, plan: state.plan };
    const addWindows = (rate, prefix) => {
      if (!rate || typeof rate !== 'object') return;
      const pairs = [[rate.primary_window || rate.primary, 'Short window'], [rate.secondary_window || rate.secondary, 'Long window']];
      for (const [window, fallback] of pairs) {
        if (!window || typeof window !== 'object') continue;
        const pct = num(window.used_percent ?? window.usedPercent ?? window.percent_used);
        const value = pct == null ? null : clamp(pct, 0, 100);
        // A global limit_reached flag can refer to the OTHER window. Never label a 0% window 'reached'.
        const explicitlyReached = window.limit_reached ?? window.is_limit_reached;
        const reached = explicitlyReached == null ? (value == null ? !!rate.limit_reached : value >= 100) : !!explicitlyReached;
        rows.push({
          label: prefix ? `${prefix} · ${windowLabel(window.limit_window_seconds ?? window.window_seconds ?? (num(window.window_minutes) != null ? num(window.window_minutes) * 60 : null), fallback)}` : windowLabel(window.limit_window_seconds ?? window.window_seconds ?? (num(window.window_minutes) != null ? num(window.window_minutes) * 60 : null), fallback),
          pct: value, resetsAt: resetAt(window), reached
        });
      }
    };
    addWindows(usage.rate_limit || usage.rate_limits, '');
    const extra = usage.additional_rate_limits || usage.additional_limits || [];
    if (Array.isArray(extra)) {
      for (const entry of extra) addWindows(entry && (entry.rate_limit || entry), entry && (entry.limit_name || entry.name || entry.metered_feature || 'Other'));
    }
    let credits = null;
    if (usage.credits && typeof usage.credits === 'object') {
      const c = usage.credits;
      credits = c.unlimited ? 'Unlimited' : num(c.balance) != null ? num(c.balance) : c.has_credits ? 'Available' : '0';
    }
    return { rows, credits, plan: usage.plan_type || state.plan };
  }
  function modelEntries() {
    return Object.entries(state.models).filter(([name, value]) => name && value && typeof value === 'object')
      .sort((a, b) => (b[1].seenAt || 0) - (a[1].seenAt || 0)).slice(0, 40);
  }
  const tone = (percent) => percent >= 95 ? 'bad' : percent >= 75 ? 'warn' : '';

  // Crisp vector icons; no remote fonts or icon libraries.
  const paths = {
    grip: '<circle cx="9" cy="5" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="19" r="1"/>',
    chevron: '<path d="m6 9 6 6 6-6"/>',
    refresh: '<path d="M20 11a8 8 0 0 0-14.5-4.5L3 9"/><path d="M3 4v5h5"/><path d="M4 13a8 8 0 0 0 14.5 4.5L21 15"/><path d="M21 20v-5h-5"/>',
    move: '<path d="M8 4h12v12"/><path d="M20 4 8 16"/><path d="M4 8v12h12"/>',
    dock: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/><path d="m14 10-2 2 2 2"/>',
    settings: '<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="2" fill="currentColor" stroke="none"/><circle cx="15" cy="17" r="2" fill="currentColor" stroke="none"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    coins: '<ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6"/><path d="M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/>',
    layers: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6"/><path d="M12 7h.01"/>',
    up: '<path d="m6 14 6-6 6 6"/>',
    down: '<path d="m6 10 6 6 6-6"/>'
  };
  const icon = (key, cls = '') => `<svg ${cls ? `class="${cls}"` : ''} viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[key]}</svg>`;

  const host = document.createElement('div');
  host.id = 'gptu-usage-host';
  const shadow = host.attachShadow({ mode: 'open' });
  const stylesheet = document.createElement('link');
  stylesheet.rel = 'stylesheet';
  stylesheet.href = runtime.getURL('meter.css');
  shadow.appendChild(stylesheet);
  // Adopted stylesheets are not affected by site-level style-src rules. Keep the link as a fallback.
  if (typeof CSSStyleSheet !== 'undefined' && 'adoptedStyleSheets' in shadow) {
    fetch(stylesheet.href).then((response) => {
      if (!response.ok) throw new Error('Stylesheet unavailable');
      return response.text();
    }).then((text) => {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(text);
      shadow.adoptedStyleSheets = [sheet];
      stylesheet.remove();
    }).catch(() => {});
  }
  const panel = document.createElement('section');
  panel.className = 'panel';
  panel.setAttribute('aria-label', 'ChatGPT usage meter');
  shadow.appendChild(panel);

  function renderRow(row) {
    const p = row.pct;
    const remaining = row.resetsAt == null ? '' : row.resetsAt > Date.now() ? `Resets in ${fmtDur(row.resetsAt - Date.now())}` : 'Reset due · refresh to update';
    const notice = row.reached ? '<span class="reached">Limit reached</span>' : '';
    return `<div class="metric"><div class="metric-line"><span class="metric-name">${esc(row.label)}</span><span class="metric-value ${row.reached ? 'is-reached' : ''}">${p == null ? '—' : `${Math.round(p)}%`}</span></div>
      ${p == null ? '' : `<div class="progress" role="progressbar" aria-label="${esc(row.label)} usage" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${p}"><i class="${tone(p)}" style="width:${p}%"></i></div>`}
      ${(notice || remaining) ? `<div class="metric-sub">${notice}<span>${esc(remaining)}</span></div>` : ''}</div>`;
  }
  function renderModel(name, m) {
    const remainingMs = m.resetsAt == null ? null : m.resetsAt - Date.now();
    const expired = remainingMs != null && remainingMs <= 0;
    const remaining = num(m.remaining), limit = num(m.limit), used = num(m.used);
    let value = '—';
    if (expired) value = 'Reset due';
    else if (remaining != null && limit != null) value = `${countFmt(remaining)} / ${countFmt(limit)} left`;
    else if (remaining != null) value = `${countFmt(remaining)} left`;
    else if (used != null && limit != null) value = `${countFmt(used)} / ${countFmt(limit)} used`;
    const pct = !expired && remaining != null && limit > 0 ? clamp(100 - remaining / limit * 100, 0, 100) : null;
    const reset = remainingMs != null && remainingMs > 0 ? `Resets in ${fmtDur(remainingMs)}` : '';
    return `<div class="metric"><div class="metric-line"><span class="metric-name">${esc(name.replace(/_/g, ' '))}</span><span class="metric-value">${esc(value)}</span></div>
      ${pct == null ? '' : `<div class="progress" role="progressbar" aria-label="${esc(name)} usage" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><i class="${tone(pct)}" style="width:${pct}%"></i></div>`}
      <div class="metric-sub">${reset ? `<span>${esc(reset)}</span>` : ''}<span>Seen ${esc(fmtAgo(m.seenAt).toLowerCase())}</span></div></div>`;
  }
  function sectionContent(id, parsed, models) {
    if (id === 'plan') {
      if (parsed.rows.length) return parsed.rows.map(renderRow).join('');
      return `<p class="empty">${state.error ? 'Plan data is temporarily unavailable.' : state.usageAt ? 'No plan windows were reported.' : 'Checking plan usage…'}</p>`;
    }
    if (id === 'credits') {
      if (parsed.credits == null) return '<p class="empty">No credit balance reported for this plan.</p>';
      const n = typeof parsed.credits === 'number' ? parsed.credits : null;
      return `<div class="credit-row"><strong class="credit-main" title="${esc(parsed.credits)}">${esc(n == null ? parsed.credits : new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(n))}</strong><span class="credit-note">${n == null ? 'Account credits' : 'Available balance'}</span></div>`;
    }
    if (id === 'models') {
      if (!models.length) return '<p class="empty">Individual limits will appear when ChatGPT reports them.</p>';
      const visible = state.showAllModels ? models : models.slice(0, 6);
      return `${visible.map(([name, value]) => renderModel(name, value)).join('')}${models.length > 6 ? `<button class="text-button" data-action="more-models">${state.showAllModels ? 'Show fewer' : `Show all ${models.length} limits`}</button>` : ''}`;
    }
    if (id === 'diagnostics') {
      return `<div class="diagnostic-buttons"><button class="text-button" data-action="raw">${state.showRaw ? 'Hide API response' : 'View API response'}</button><button class="text-button" data-action="copy">Copy diagnostics</button></div>
        ${state.showRaw ? `<pre class="raw-data">${esc(JSON.stringify({ usage: state.usage, models: state.models, error: state.error }, null, 2))}</pre>` : ''}
        <p class="empty">Data comes from ChatGPT. Model limits may be missing until reported by the site.</p>`;
    }
    return '';
  }
  function sectionMeta(id, parsed, models) {
    if (id === 'plan') return parsed.rows.length ? `${parsed.rows.filter((r) => r.reached).length} / ${parsed.rows.length} reached` : '';
    if (id === 'credits') return '';
    if (id === 'models') return models.length ? `${models.length} tracked` : '';
    return '';
  }
  function renderSection(id, parsed, models) {
    const closed = !!state.closed[id];
    const index = state.order.indexOf(id);
    const sectionIcon = { plan: 'clock', credits: 'coins', models: 'layers', diagnostics: 'info' }[id];
    return `<section class="module" data-id="${id}" ${closed ? 'data-closed' : ''}>
      <div class="module-head">
        <button class="tool module-grip" draggable="true" data-drag-module="${id}" title="Drag to reorder ${esc(SECTION_NAMES[id])}" aria-label="Reorder ${esc(SECTION_NAMES[id])}">${icon('grip')}</button>
        <button class="module-toggle" data-action="toggle-section" data-id="${id}" aria-expanded="${!closed}" aria-controls="gptu-sec-${id}">
          ${icon(sectionIcon, 'module-icon')}<span class="module-name">${esc(SECTION_NAMES[id])}</span><span class="module-meta">${esc(sectionMeta(id, parsed, models))}</span>${icon('chevron', 'section-chevron')}
        </button>
        <button class="tool edit-tool" data-action="move-up" data-id="${id}" ${index === 0 ? 'disabled' : ''} aria-label="Move ${esc(SECTION_NAMES[id])} up" title="Move up">${icon('up')}</button>
        <button class="tool edit-tool" data-action="move-down" data-id="${id}" ${index === state.order.length - 1 ? 'disabled' : ''} aria-label="Move ${esc(SECTION_NAMES[id])} down" title="Move down">${icon('down')}</button>
      </div><div class="module-content" id="gptu-sec-${id}">${closed ? '' : sectionContent(id, parsed, models)}</div>
    </section>`;
  }
  function renderSettings() {
    if (!state.settingsOpen) return '';
    return `<div class="settings"><div class="settings-title">Customize sections</div>
      <div class="check-list">${SECTION_IDS.map((id) => `<label class="check"><input type="checkbox" data-section-visible="${id}" ${state.hidden.includes(id) ? '' : 'checked'}><span>${esc(SECTION_NAMES[id])}</span></label>`).join('')}</div>
      <p class="settings-hint">Drag the dot handles or use the arrows to reorder sections. Drag the header grip to move the entire panel.</p>
      <div class="settings-bottom"><label class="check"><input type="checkbox" data-setting="compact" ${state.compact ? 'checked' : ''}><span>Compact layout</span></label><button class="text-button" data-action="reset-layout">Reset layout</button></div>
    </div>`;
  }
  function render() {
    updateTheme();
    const parsed = parseUsage(state.usage);
    const models = modelEntries();
    const reached = parsed.rows.filter((r) => r.reached).length;
    const plan = parsed.plan;
    const isFloating = host.hasAttribute('data-floating');
    panel.toggleAttribute('data-collapsed', !!state.collapsed);
    panel.toggleAttribute('data-customize', !!state.settingsOpen);
    panel.toggleAttribute('data-compact', !!state.compact);
    const age = state.usageAt ? Date.now() - state.usageAt : Infinity;
    const dot = state.error ? 'problem' : age > 10 * 60 * 1000 ? 'stale' : '';
    panel.innerHTML = `<header class="panel-header">
      <button class="tool grab" data-action="drag-card" title="Drag to reposition the panel" aria-label="Drag usage panel">${icon('grip')}</button>
      <button class="main-toggle" data-action="toggle-all" aria-expanded="${!state.collapsed}" aria-controls="gptu-body">${icon('chevron', 'chevron main-chevron')}<span class="heading">Usage</span>
        ${plan ? `<span class="plan-badge">${esc(plan)}</span>` : ''}<span class="summary ${reached ? 'is-reached' : ''}">${reached ? `${reached} reached` : parsed.rows.length ? `${Math.round(Math.max(...parsed.rows.map((r) => r.pct ?? 0)))}% peak` : 'No data'}</span>
      </button><span class="spacer"></span>
      <button class="tool" data-action="dock" title="${isFloating ? 'Dock in sidebar' : state.position === 'top' ? 'Move below chats' : 'Move above chats'}" aria-label="${isFloating ? 'Dock in sidebar' : 'Switch sidebar position'}">${icon(isFloating ? 'dock' : 'move')}</button>
      <button class="tool" data-action="settings" title="Customize panel" aria-label="Customize panel" aria-pressed="${!!state.settingsOpen}">${icon('settings')}</button>
      <button class="tool spinner ${busy ? 'is-busy' : ''}" data-action="refresh" title="Refresh usage" aria-label="Refresh usage">${icon('refresh')}</button>
    </header>
    <div class="body" id="gptu-body">${renderSettings()}${state.order.filter((id) => !state.hidden.includes(id)).map((id) => renderSection(id, parsed, models)).join('')}
      ${state.error ? `<p class="error" role="alert">${esc(state.error)}</p>` : ''}
      <footer class="footer"><span class="status"><span class="status-dot ${dot}"></span>${esc(state.error ? 'Update failed' : `Updated ${fmtAgo(state.usageAt).toLowerCase()}`)}</span><span>${state.order.filter((id) => !state.hidden.includes(id)).length} sections</span></footer>
    </div>`;
  }
  function setBusy(value) {
    busy = value;
    const refresh = shadow.querySelector('.spinner');
    if (refresh) refresh.classList.toggle('is-busy', busy);
  }
  function requestRefresh(force = false) {
    if (!force && Date.now() - lastRefresh < MIN_REFRESH_GAP) return;
    lastRefresh = Date.now();
    setBusy(true);
    window.postMessage({ source: OUTBOUND, type: 'refresh' }, location.origin);
  }

  function findSidebarNav() {
    const selectors = ['#stage-slideover-sidebar nav', 'nav[aria-label="Chat history"]', '[data-testid="sidebar"] nav', 'nav'];
    for (const selector of selectors) {
      for (const nav of document.querySelectorAll(selector)) {
        const rect = nav.getBoundingClientRect();
        if (rect.width > 120 && rect.height > 180 && rect.left < innerWidth / 2) return nav;
      }
    }
    return null;
  }
  function readBackground(element) {
    for (let el = element, i = 0; el && i < 7; el = el.parentElement, i++) {
      const background = getComputedStyle(el).backgroundColor;
      const values = background && background.match(/rgba?\(([^)]+)\)/);
      if (!values) continue;
      const rgba = values[1].split(/[,\s/]+/).filter(Boolean).map(Number);
      if (rgba.length < 3 || rgba.slice(0, 3).some((v) => !Number.isFinite(v)) || (rgba.length > 3 && rgba[3] < .5)) continue;
      const luminance = (0.2126 * rgba[0] + 0.7152 * rgba[1] + 0.0722 * rgba[2]);
      return luminance < 135 ? 'dark' : 'light';
    }
    return null;
  }
  function updateTheme() {
    const html = document.documentElement;
    // Explicit site preferences beat OS preferences. Computed background catches newer theme implementations.
    const declared = [html.getAttribute('data-theme'), document.body?.getAttribute('data-theme'), html.getAttribute('data-color-scheme')];
    let theme = declared.includes('dark') ? 'dark' : declared.includes('light') ? 'light' : null;
    if (!theme && html.classList.contains('dark')) theme = 'dark';
    if (!theme && html.classList.contains('light')) theme = 'light';
    if (!theme) theme = readBackground(findSidebarNav()) || readBackground(document.body) || readBackground(html);
    if (!theme) theme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    host.setAttribute('data-theme', theme);
  }
  function positionFloating() {
    const coords = state.floatPos && Number.isFinite(state.floatPos.x) && Number.isFinite(state.floatPos.y) ? state.floatPos : null;
    const width = Math.min(338, Math.max(220, innerWidth - 24));
    const height = Math.min(host.getBoundingClientRect().height || 360, Math.max(1, innerHeight - 24));
    const maxY = Math.max(12, innerHeight - height - 12);
    host.style.left = `${clamp(coords ? coords.x : 12, 12, Math.max(12, innerWidth - width - 12))}px`;
    host.style.top = `${clamp(coords ? coords.y : maxY, 12, maxY)}px`;
  }
  function place(force = false) {
    if (dragInProgress) return;
    const nav = findSidebarNav();
    const floating = state.dock === 'floating' || !nav;
    host.toggleAttribute('data-floating', floating);
    if (floating) {
      positionFloating();
      if (host.parentElement !== document.body) document.body.appendChild(host);
      return;
    }
    host.style.left = '';
    host.style.top = '';
    const other = [...nav.children].filter((child) => child !== host);
    const before = state.position === 'top' ? (other[2] || null) : (other[other.length - 1] || null);
    if (force || host.parentElement !== nav || host.nextElementSibling !== before) nav.insertBefore(host, before);
  }
  function resetLayout() {
    state.order = [...DEFAULT_SECTIONS];
    state.closed = { diagnostics: true };
    state.hidden = [];
    state.compact = false;
    state.showAllModels = false;
    state.position = 'top';
    state.dock = 'sidebar';
    state.floatPos = null;
    save(); place(true); render();
  }
  function moveModule(id, direction) {
    const start = state.order.indexOf(id);
    const target = start + direction;
    if (start < 0 || target < 0 || target >= state.order.length) return;
    [state.order[start], state.order[target]] = [state.order[target], state.order[start]];
    save(); render();
    shadow.querySelector(`[data-action="${direction < 0 ? 'move-up' : 'move-down'}"][data-id="${id}"]`)?.focus();
  }
  panel.addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    const action = button.dataset.action;
    if (action === 'toggle-all') state.collapsed = !state.collapsed;
    else if (action === 'toggle-section') state.closed[button.dataset.id] = !state.closed[button.dataset.id];
    else if (action === 'refresh') { requestRefresh(true); return; }
    else if (action === 'dock') {
      if (state.dock === 'floating') { state.dock = 'sidebar'; state.position = 'top'; }
      else state.position = state.position === 'top' ? 'bottom' : 'top';
      place(true);
    } else if (action === 'settings') {
      state.settingsOpen = !state.settingsOpen;
    } else if (action === 'reset-layout') { resetLayout(); return; }
    else if (action === 'more-models') state.showAllModels = !state.showAllModels;
    else if (action === 'raw') state.showRaw = !state.showRaw;
    else if (action === 'move-up') { moveModule(button.dataset.id, -1); return; }
    else if (action === 'move-down') { moveModule(button.dataset.id, 1); return; }
    else if (action === 'copy') {
      const report = JSON.stringify({ usage: state.usage, models: state.models, error: state.error }, null, 2);
      try {
        await navigator.clipboard.writeText(report);
        button.textContent = 'Copied';
      } catch (_) { button.textContent = 'Copy unavailable'; }
      return;
    } else return;
    save(); render();
  });
  panel.addEventListener('change', (event) => {
    const input = event.target;
    if (input.matches('[data-section-visible]')) {
      const id = input.dataset.sectionVisible;
      state.hidden = input.checked ? state.hidden.filter((x) => x !== id) : [...new Set([...state.hidden, id])];
    } else if (input.matches('[data-setting="compact"]')) state.compact = input.checked;
    else return;
    save(); render();
  });

  // Native HTML drag/drop works across the Shadow DOM. Arrow buttons provide a keyboard alternative.
  panel.addEventListener('dragstart', (event) => {
    const handle = event.target.closest('[data-drag-module]');
    if (!handle) { event.preventDefault(); return; }
    draggingModule = handle.dataset.dragModule;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', draggingModule);
    }
    handle.closest('.module')?.setAttribute('data-reordering', '');
  });
  panel.addEventListener('dragover', (event) => {
    if (!draggingModule) return;
    const section = event.target.closest('.module');
    if (!section || section.dataset.id === draggingModule) return;
    event.preventDefault();
    const before = event.clientY < section.getBoundingClientRect().top + section.getBoundingClientRect().height / 2;
    dropTarget = { id: section.dataset.id, before };
    panel.querySelectorAll('.module').forEach((el) => { el.classList.remove('drop-before', 'drop-after'); });
    section.classList.add(before ? 'drop-before' : 'drop-after');
  });
  panel.addEventListener('drop', (event) => {
    if (!draggingModule || !dropTarget) return;
    event.preventDefault();
    const next = state.order.filter((id) => id !== draggingModule);
    const index = next.indexOf(dropTarget.id);
    if (index >= 0) next.splice(index + (dropTarget.before ? 0 : 1), 0, draggingModule);
    state.order = next;
    save();
    draggingModule = null;
    dropTarget = null;
    render();
  });
  panel.addEventListener('dragend', () => {
    draggingModule = null;
    dropTarget = null;
    panel.querySelectorAll('.module').forEach((el) => { el.classList.remove('drop-before', 'drop-after'); el.removeAttribute('data-reordering'); });
  });

  // Pointer dragging the widget's grip undocks it; releasing over the sidebar docks it again.
  panel.addEventListener('pointerdown', (event) => {
    const handle = event.target.closest('[data-action="drag-card"]');
    if (!handle || event.button !== 0) return;
    event.preventDefault();
    const rect = host.getBoundingClientRect();
    const origin = { x: event.clientX, y: event.clientY, left: rect.left, top: rect.top };
    let started = false;
    const onMove = (next) => {
      if (!started && Math.hypot(next.clientX - origin.x, next.clientY - origin.y) < 5) return;
      if (!started) {
        started = true;
        dragInProgress = true;
        state.dock = 'floating';
        host.setAttribute('data-floating', '');
        document.body.appendChild(host);
        panel.setAttribute('data-dragging', '');
      }
      const width = host.getBoundingClientRect().width;
      const x = clamp(origin.left + next.clientX - origin.x, 8, Math.max(8, innerWidth - width - 8));
      const y = clamp(origin.top + next.clientY - origin.y, 8, Math.max(8, innerHeight - host.getBoundingClientRect().height - 8));
      state.floatPos = { x, y };
      positionFloating();
    };
    const onEnd = (next) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onEnd);
      window.removeEventListener('pointercancel', onEnd);
      if (!started) return;
      panel.removeAttribute('data-dragging');
      dragInProgress = false;
      const nav = findSidebarNav();
      const r = nav?.getBoundingClientRect();
      if (r && next.type !== 'pointercancel' && next.clientX >= r.left && next.clientX <= r.right && next.clientY >= r.top && next.clientY <= r.bottom) {
        state.dock = 'sidebar';
        state.position = next.clientY < r.top + r.height / 2 ? 'top' : 'bottom';
      }
      save(); place(true); render();
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onEnd);
    window.addEventListener('pointercancel', onEnd);
  });

  window.addEventListener('message', (event) => {
    if (event.source !== window || !event.data || event.data.source !== INBOUND) return;
    const { type, payload } = event.data;
    if (type === 'ready') requestRefresh(true);
    else if (type === 'usage' && payload) {
      state.usage = payload.data;
      state.plan = payload.plan || state.plan;
      state.usageAt = payload.at || Date.now();
      state.error = null;
      setBusy(false); save(); render();
    } else if (type === 'usage-error' && payload) {
      state.error = String(payload.message || 'Unable to update');
      setBusy(false); render();
    } else if (type === 'model-limits' && payload && Array.isArray(payload.items)) {
      for (const item of payload.items) if (item && item.name) state.models[item.name] = { ...item, seenAt: payload.at || Date.now() };
      save(); render();
    } else if (type === 'activity') setTimeout(() => requestRefresh(false), 4000);
  });

  let pendingPlacement = false;
  const placementObserver = new MutationObserver(() => {
    if (pendingPlacement) return;
    pendingPlacement = true;
    requestAnimationFrame(() => { pendingPlacement = false; place(); updateTheme(); });
  });
  load().then(() => {
    render();
    place(true);
    placementObserver.observe(document.body, { childList: true, subtree: true });
    const onResize = () => place();
    window.addEventListener('resize', onResize);
    window.addEventListener('focus', () => { updateTheme(); requestRefresh(false); });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') requestRefresh(false); });
    new MutationObserver(updateTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme', 'data-color-scheme', 'style'] });
    if (window.matchMedia) {
      const preference = window.matchMedia('(prefers-color-scheme: dark)');
      preference.addEventListener?.('change', updateTheme);
    }
    requestRefresh(true);
    setInterval(() => { if (document.visibilityState === 'visible') requestRefresh(false); }, REFRESH_INTERVAL);
    setInterval(render, 30000);
  });
})();
