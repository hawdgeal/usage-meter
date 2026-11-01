// Draws the popup (?mode=popup) and the mini panel (?mode=mini) from the main process's state.
"use strict";
const MODE = new URLSearchParams(location.search).get("mode") === "mini" ? "mini" : "popup";
document.body.classList.add(MODE);
const root = document.getElementById("root");
const V = window.UsageView;
const LOGOS = { claude: "../assets/claude.png", chatgpt: "../assets/chatgpt.png", codex: "../assets/chatgpt.png" };
const ICONS = {
  refresh: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9"/><path d="M13.5 2.5v3h-3"/></svg>',
  gear: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="8" cy="8" r="2.2"/><path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4"/></svg>',
};

let state = null;
let peek = null; // popup only: an app picked with the switch, until the popup closes
let busyUntil = 0;

function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "style") el.style.cssText = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "html") el.innerHTML = v; // only for the static icons above
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid);
  return el;
}

function rowEl(r, show) {
  const val = r.used == null ? null : show === "used" ? r.used : r.left;
  const cls = r.left == null ? "" : r.left <= 10 ? " bad" : r.left <= 25 ? " warn" : "";
  const reset = V.resetText(r.resetsAt);
  return h("div", { class: "row" + cls, title: reset || null },
    h("div", { class: "row-top" },
      h("span", { class: "label" }, r.label),
      h("span", { class: "value" }, val == null ? "–" : `${Math.round(val)}% ${show === "used" ? "used" : "left"}`)),
    h("div", { class: "bar", role: "progressbar", "aria-label": r.label, "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": val == null ? null : String(Math.round(val)) },
      h("i", { style: `width:${val == null ? 0 : Math.max(0, Math.min(100, val))}%` })),
    reset ? h("div", { class: "sub" }, reset) : null);
}

function connectionHint(v) {
  const hosts = state.hosts || [];
  if (v.error) return { title: v.error, text: `Sign in to ${v.host} in your browser, then refresh.` };
  if (!hosts.length) return { title: "Not connected to your browser", text: "Install or update the Usage Meter extension, then open Settings to connect it." };
  return { title: "Waiting for usage…", text: `Connected to ${hosts.map((x) => x.browser || "browser").join(", ")}. Sign in to ${v.host} there if nothing appears.` };
}

function render() {
  if (!state) return;
  document.documentElement.dataset.theme = state.dark ? "dark" : "light";
  const appId = (MODE === "popup" && peek) || state.app;
  const show = state.settings.show;
  const v = V.build(appId, state.sites[V.APPS[appId].site], { showModels: state.settings.showModels });
  root.style.setProperty("--accent", v.color);
  root.replaceChildren();

  const refreshBtn = h("button", { class: "icon refresh" + (Date.now() < busyUntil ? " busy" : ""), title: "Refresh", "aria-label": "Refresh usage", html: ICONS.refresh, onclick: onRefresh });
  root.append(h("header", { class: "head" },
    h("img", { class: "logo", src: LOGOS[appId], alt: "" }),
    h("div", { class: "title" }, h("span", { class: "name" }, v.name), v.plan ? h("span", { class: "plan" }, v.plan) : null),
    refreshBtn,
    MODE === "popup" ? h("button", { class: "icon", title: "Settings", "aria-label": "Settings", html: ICONS.gear, onclick: () => window.companion.openSettings() }) : null));

  if (MODE === "popup") {
    root.append(h("nav", { class: "switch", "aria-label": "Show usage for" },
      ["claude", "chatgpt", "codex"].map((id) => h("button", { "aria-pressed": String(id === appId), onclick: () => { peek = id === state.app ? null : id; render(); } }, V.APPS[id].name))));
  }

  const main = v.rows.filter((r) => r.main), models = v.rows.filter((r) => !r.main);
  if (main.length || models.length) {
    if (main.length) root.append(h("section", { class: "rows" }, main.map((r) => rowEl(r, show))));
    if (models.length) root.append(h("section", { class: "rows models" + (main.length ? "" : "") }, models.map((r) => rowEl(r, show))));
  } else if (v.hasData && !v.error) {
    root.append(h("div", { class: "empty" }, "No plan limits reported."));
  } else {
    const hint = connectionHint(v);
    root.append(h("div", { class: "empty" }, h("strong", null, hint.title), hint.text));
    if (MODE === "popup" && !(state.hosts || []).length) root.append(h("div", { class: "actions" }, h("button", { class: "btn", onclick: () => window.companion.openSettings() }, "Open Settings")));
  }

  if (v.credits) root.append(h("div", { class: "credits" }, h("span", { class: "k" }, v.credits.label), h("span", null, v.credits.text)));

  const footLeft = [];
  if (v.at) footLeft.push(`Updated ${V.agoText(v.at).toLowerCase()}`);
  if (v.browser && MODE === "popup") footLeft.push(`via ${v.browser}`);
  const footRight = MODE === "popup" ? followNote(appId) : (v.head && v.head.resetsAt ? V.resetText(v.head.resetsAt) : "");
  if (v.hasData && (footLeft.length || footRight)) {
    root.append(h("footer", { class: "foot" }, h("span", { class: v.error ? "err" : null }, v.error && v.hasData ? v.error : footLeft.join(" · ")), h("span", null, footRight)));
  }
  requestAnimationFrame(() => window.companion.resize(Math.ceil(root.getBoundingClientRect().height)));
}

function followNote(appId) {
  if (peek) return "";
  return state.settings.mode === "follow" ? "Following the app in front" : `Always ${V.APPS[appId].name}`;
}

async function onRefresh() {
  busyUntil = Date.now() + 4000;
  render();
  const appId = (MODE === "popup" && peek) || state.app;
  await window.companion.refresh(appId);
  setTimeout(render, 4100);
}

root.addEventListener("contextmenu", (e) => { if (MODE === "mini") { e.preventDefault(); window.companion.miniMenu(); } });
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && MODE === "popup") window.companion.hide(); });
window.companion.onState((s) => { state = s; render(); });
window.companion.onPopupShown(() => { peek = null; render(); });
window.companion.getState().then((s) => { state = s; render(); });
setInterval(render, 30 * 1000);
