// Runs before the extension's content.js and tells it it's inside the companion (see EMBED in
// content.js): which site to draw, where its settings come from, and how to refresh or open links.
"use strict";
(() => {
  const q = new URLSearchParams(location.search);
  const MODE = q.get("mode") === "mini" ? "mini" : "popup";
  const APP = ["claude", "chatgpt", "codex"].includes(q.get("app")) ? q.get("app") : "claude";
  const SITE = APP === "claude" ? "claude" : "chatgpt";
  const KEYS = { claude: "gptu-claude", chatgpt: "gptu" }; // content.js storage keys
  const C = window.companion;
  document.documentElement.classList.add(MODE);

  const E = {
    mode: MODE, app: APP, site: SITE, state: null,
    userRefreshUntil: 0, // set when the Refresh button is clicked (see embed-after.js)
    shown: { at: 0, errorAt: 0 },
  };
  E.ready = C.getState().then((s) => { E.state = s; E.prefs = s.prefsVersion[SITE]; theme(s); return s; });

  // Approximate sidebar colors, used when the panel's theme is "Match site".
  const SURFACES = {
    claude: { light: ["#f5f4ed", "#3d3929"], dark: ["#1f1e1d", "#e8e6dc"] },
    chatgpt: { light: ["#f9f9f9", "#0d0d0d"], dark: ["#181818", "#ececec"] },
  };
  function theme(s) {
    const dark = !!s.dark, html = document.documentElement;
    html.classList.toggle("dark", dark);
    html.classList.toggle("light", !dark);
    html.style.colorScheme = dark ? "dark" : "light";
    const [bg, fg] = SURFACES[SITE][dark ? "dark" : "light"];
    const el = document.getElementById("gptu-embed-theme");
    el.style.background = bg;
    el.style.color = fg;
  }

  function settingsFor(site) {
    const s = E.state;
    const out = { ...((s.ext && s.ext[site]) || {}), ...((s.local && s.local[site]) || {}) };
    const u = s.sites && s.sites[site];
    if (u && u.data && (!out.usageAt || u.at >= out.usageAt)) { out.usage = u.data; out.usageAt = u.at; if (u.plan) out.plan = u.plan; }
    return out;
  }
  const siteOfKey = (k) => Object.keys(KEYS).find((x) => KEYS[x] === k);

  function post(type, payload) {
    window.postMessage({ source: "gptu-hook", type, payload }, "*");
  }

  // Send content.js the latest usage (or error) the companion has for this site.
  E.feed = (force) => {
    const u = E.state && E.state.sites && E.state.sites[SITE];
    if (!u) return;
    if (u.data && (force || u.at > E.shown.at)) { E.shown.at = u.at; post("usage", { data: u.data, plan: u.plan, at: u.at }); }
    if (u.error && u.errorAt > E.shown.errorAt && (!u.at || u.errorAt >= u.at)) { E.shown.errorAt = u.errorAt; post("usage-error", { message: u.error, at: u.errorAt }); }
  };

  let settle = 0;
  globalThis.__usageMeterEmbed = {
    site: SITE,
    storage: {
      local: {
        async get(keys) {
          await E.ready;
          const out = {};
          for (const k of [].concat(keys)) { const site = siteOfKey(k); if (site) out[k] = settingsFor(site); }
          return out;
        },
        // Only the panel state (collapsed panel and sections) is kept by the companion; the rest
        // of the look is changed in the browser, under Customize.
        async set(obj) {
          for (const [k, v] of Object.entries(obj || {})) {
            const site = siteOfKey(k);
            if (site === SITE && v && typeof v === "object") C.panelState(site, { collapsed: v.collapsed, closed: v.closed });
          }
        },
      },
    },
    send(msg) {
      if (!msg) return;
      if (msg.type === "refresh") {
        // Only the Refresh button asks the browser; the extension already keeps usage current.
        if (Date.now() < E.userRefreshUntil) C.refresh(APP);
        clearTimeout(settle);
        settle = setTimeout(() => E.feed(true), Date.now() < E.userRefreshUntil ? 12000 : 50);
      } else if (msg.type === "reset-details") {
        post("reset-details", { flowId: msg.payload && msg.payload.flowId, error: "Banked resets can be used on chatgpt.com in your browser." });
      } else if (msg.type === "use-reset") {
        post("reset-result", { flowId: msg.payload && msg.payload.flowId, error: "Banked resets can be used on chatgpt.com in your browser." });
      }
    },
    openUrl(url) { C.openUrl(String(url)); },
  };
  globalThis.__usageMeterCompanion = E;
})();
