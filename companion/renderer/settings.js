// Settings window: reads and writes settings through the main process.
"use strict";
const $ = (id) => document.getElementById(id);
let state = null;
const CHECKS = ["followBrowsers", "followTerminals", "miniPanel", "attachMove", "launchAtLogin", "updateCheck"];
const PLACES = [["float", "Floating"], ["app", "On top of its app"], ["dock", "In its app's sidebar"], ["rail", "In Claude's session rail"]];
const SELECTS = ["mode", "cards", "cardsLayout"];
const NAMES = { claude: "Claude", chatgpt: "ChatGPT", codex: "Codex" };

function item(cls, text, sub) {
  const el = document.createElement("div");
  el.className = "item";
  const dot = document.createElement("span"); dot.className = "dot " + cls;
  const t = document.createElement("span"); t.textContent = text;
  el.append(dot, t);
  if (sub) { const m = document.createElement("span"); m.className = "muted small"; m.textContent = sub; el.append(m); }
  return el;
}

function ago(ts) {
  if (!ts) return "";
  const s = Math.round((Date.now() - ts) / 1000);
  return s < 60 ? "just now" : s < 3600 ? `${Math.floor(s / 60)} min ago` : `${Math.floor(s / 3600)} h ago`;
}

function render() {
  const s = state.settings;
  document.documentElement.dataset.theme = state.dark ? "dark" : "light";
  $("version").textContent = `Version ${state.version}`;
  for (const k of CHECKS) $(k).checked = !!s[k];
  for (const k of SELECTS) $(k).value = s[k];
  $("miniOpacity").value = s.miniOpacity;
  // Options that only apply to one mode show only there.
  $("followBox").hidden = s.cards !== "one";
  $("layoutBox").hidden = s.cards !== "both";
  for (const k of ["followBrowsers", "followTerminals"]) $(k).disabled = s.mode !== "follow" || !state.foreground.available;
  renderPlaces(s);
  for (const k of ["cards", "miniOpacity", "resetPos"]) $(k).disabled = !s.miniPanel;
  // Only shown while a card sits on top of its app.
  const keys = s.cards === "separate" ? ["claude", "chatgpt"] : ["main"];
  $("attachMove").closest("label").hidden = !keys.some((k) => (state.placement || {})[k] === "app");
  $("attachMove").disabled = !s.miniPanel;
  $("followNote").textContent = s.mode !== "follow" ? "" :
    state.foreground.available ? `Showing ${NAMES[state.followApp]} now. When something else is in front, the last app stays.` :
    `Following isn't available here (${state.foreground.error || "unknown reason"}). Showing ${NAMES[state.followApp]}.`;

  const own = s.lookSource === "own";
  for (const r of document.querySelectorAll('input[name="lookSource"]')) r.checked = r.value === (own ? "own" : "browser");
  const got = ["claude", "chatgpt"].filter((k) => state.ext && state.ext[k]).map((k) => NAMES[k]);
  for (const row of document.querySelectorAll(".look-row")) {
    const site = row.dataset.site;
    const hasOwn = own && !!(state.ownLooks && state.ownLooks[site]);
    row.querySelector('[data-look="import"]').disabled = !(state.ext && state.ext[site]);
    row.querySelector('[data-look="reset"]').disabled = !hasOwn;
    row.querySelector("[data-look-state]").textContent = !own ? "same as the browser" : hasOwn ? "own look" : "same as the browser (not customized yet)";
  }
  $("lookStatus").textContent = own ? "Using the companion's own look." :
    got.length ? `Using your ${got.join(" and ")} panel settings from the extension.` : "No panel settings received yet; using the extension's defaults until the browser connects.";

  // Connected browsers
  // The companion's own login
  for (const row of document.querySelectorAll(".direct-row")) {
    const d = (state.direct || {})[row.dataset.site] || {};
    row.querySelector('[data-direct="in"]').textContent = d.signedIn ? "Sign in again…" : "Sign in…";
    row.querySelector('[data-direct="out"]').disabled = !d.signedIn;
    row.querySelector("[data-direct-state]").textContent = !d.signedIn ? "Not signed in here" : d.error ? d.error : d.at ? `Signed in · last update ${ago(d.at)}` : "Signed in";
  }
  // Updates
  const u = state.update || {};
  const us = $("updateStatus");
  us.replaceChildren();
  const ver = (u.latest && u.latest.version) || "";
  if (u.state === "checking") us.append(item("wait", "Checking for updates…"));
  else if (u.state === "downloading") us.append(item("wait", `Downloading ${ver}… ${Math.round((u.progress || 0) * 100)}%`));
  else if (u.state === "installing") us.append(item("wait", `Installing ${ver}; the companion restarts in a moment`));
  else if (u.available) us.append(item("warn", `Version ${ver} is available (you have ${u.current})`, u.can && !u.can.ok ? u.can.why : ""));
  else if (u.state === "ready") us.append(item("ok", `Up to date (${u.current})`, u.checkedAt ? `checked ${ago(u.checkedAt)}` : ""));
  if (u.error) us.append(item("bad", u.error));
  $("updateInstall").hidden = !u.available;
  $("updateInstall").disabled = !(u.can && u.can.ok) || u.state === "downloading" || u.state === "installing";
  $("updateInstall").textContent = ver ? `Update to ${ver} and restart` : "Update and restart";
  $("updateCheckNow").disabled = u.state === "checking" || u.state === "downloading" || u.state === "installing";

  const hosts = state.hosts || [];
  const hostBox = $("hosts");
  hostBox.replaceChildren();
  if (hosts.length) for (const x of hosts) hostBox.append(item("ok", `Connected: ${x.browser || "browser"}`, [x.extensionVersion && `extension ${x.extensionVersion}`, x.lastAt && `last update ${ago(x.lastAt)}`].filter(Boolean).join(" · ")));
  else hostBox.append(item("", "No browser connected right now", "Open your browser with the extension installed (version 0.5.0 or later)."));

  // Registration
  const r = state.registration || {};
  const regBox = $("reg");
  regBox.replaceChildren();
  if (r.state === "working") regBox.append(item("", "Connecting browsers…"));
  else if (r.state === "unsupported") regBox.append(item("bad", "Browser connection is set up on Windows only"));
  else if (r.state === "error") regBox.append(item("bad", "Couldn't set up the browser connection", r.error));
  else if (r.state === "done") {
    const ok = (r.results || []).filter((x) => x.ok).map((x) => x.browser);
    const failed = (r.results || []).filter((x) => !x.ok).map((x) => x.browser);
    if (ok.length) regBox.append(item("ok", `Set up for ${ok.join(", ")}`));
    if (failed.length) regBox.append(item("bad", `Couldn't set up ${failed.join(", ")}`));
    if (!r.ids) regBox.append(item("bad", "Usage Meter wasn't found in Chrome, Edge, Brave, Vivaldi or Opera", "Firefox works without it. For the others, add the extension ID below."));
    $("manual").open = $("manual").open || !r.ids;
  }

  // Extension IDs
  const list = $("ids");
  list.replaceChildren();
  const manual = s.extensionIds || [];
  const detected = (r.detected || []).filter((d) => !manual.includes(d.id));
  for (const d of detected) {
    const li = document.createElement("li");
    li.append(d.id, Object.assign(document.createElement("span"), { className: "src", textContent: `found in ${d.browser} (${d.profile})` }));
    list.append(li);
  }
  for (const id of manual) {
    const li = document.createElement("li");
    const rm = Object.assign(document.createElement("button"), { className: "btn", textContent: "Remove" });
    rm.onclick = () => save({ extensionIds: manual.filter((x) => x !== id) });
    li.append(id, Object.assign(document.createElement("span"), { className: "src", textContent: "added by hand" }), rm);
    list.append(li);
  }
}

// One row per card: where it sits, and for a floating card whether it stays on top.
function renderPlaces(s) {
  const keys = s.cards === "separate" ? ["claude", "chatgpt"] : ["main"];
  const box = $("placeRows");
  if (box.dataset.keys !== keys.join()) {
    box.dataset.keys = keys.join();
    box.replaceChildren(...keys.map((key) => {
      const row = Object.assign(document.createElement("div"), { className: "place-row" });
      row.dataset.key = key;
      const name = Object.assign(document.createElement("span"), { textContent: key === "main" ? "The card" : `${NAMES[key]} card` });
      const sel = document.createElement("select");
      sel.setAttribute("aria-label", `Where the ${key === "main" ? "" : NAMES[key] + " "}card sits`);
      for (const [v, label] of PLACES) sel.append(Object.assign(document.createElement("option"), { value: v, textContent: label }));
      sel.addEventListener("change", () => save({ placement: { ...(state.placement || {}), [key]: sel.value } }));
      const top = Object.assign(document.createElement("label"), { className: "check" });
      const cb = Object.assign(document.createElement("input"), { type: "checkbox" });
      cb.addEventListener("change", () => save({ onTop: { ...(state.onTop || {}), [key]: cb.checked } }));
      top.append(cb, " Keep on top");
      row.append(name, sel, top);
      return row;
    }));
  }
  for (const row of box.children) {
    const key = row.dataset.key, p = (state.placement || {})[key] || "float";
    const sel = row.querySelector("select"), cb = row.querySelector("input");
    sel.value = p;
    sel.disabled = !s.miniPanel;
    for (const o of sel.options) {
      o.disabled = o.value !== "float" && (!state.foreground.available || (o.value === "dock" && s.cards === "both"));
      // Only Claude has a session rail: the Claude card, or a single card (when it shows Claude).
      if (o.value === "rail") o.hidden = key === "chatgpt" || (key === "main" && s.cards === "both");
    }
    cb.checked = (state.onTop || {})[key] !== false;
    cb.disabled = !s.miniPanel;
    // Only floating cards can be kept on top; the space stays so the rows line up.
    row.querySelector(".check").style.visibility = p === "float" ? "" : "hidden";
  }
}

async function save(patch) {
  state = await window.companion.setSettings(patch);
  render();
}

for (const k of CHECKS) $(k).addEventListener("change", (e) => save({ [k]: e.target.checked }));
for (const k of SELECTS) $(k).addEventListener("change", (e) => save({ [k]: e.target.value }));
$("miniOpacity").addEventListener("input", (e) => save({ miniOpacity: Number(e.target.value) }));
$("resetPos").addEventListener("click", () => save({ miniBounds: null, miniPanel: true }));
for (const r of document.querySelectorAll('input[name="lookSource"]')) r.addEventListener("change", (e) => { if (e.target.checked) save({ lookSource: e.target.value }); });
for (const row of document.querySelectorAll(".look-row")) {
  const site = row.dataset.site, name = NAMES[site];
  row.querySelector('[data-look="customize"]').addEventListener("click", () => window.companion.customize(site));
  row.querySelector('[data-look="import"]').addEventListener("click", async () => {
    if (!row.querySelector('[data-look="reset"]').disabled && !confirm(`Replace the companion's ${name} look with your browser's current one?`)) return;
    state = await window.companion.importLook(site); render();
  });
  row.querySelector('[data-look="reset"]').addEventListener("click", async () => {
    if (!confirm(`Drop the companion's own ${name} look and follow your browser's again?`)) return;
    state = await window.companion.resetLook(site); render();
  });
}
$("connect").addEventListener("click", () => window.companion.connectBrowsers());
for (const row of document.querySelectorAll(".direct-row")) {
  const site = row.dataset.site, name = NAMES[site];
  row.querySelector('[data-direct="in"]').addEventListener("click", async (e) => {
    const b = e.currentTarget;
    b.disabled = true;
    row.querySelector("[data-direct-state]").textContent = "Sign in in the window that opened…";
    try { await window.companion.signIn(site); } finally { b.disabled = false; }
  });
  row.querySelector('[data-direct="out"]').addEventListener("click", async () => {
    if (!confirm(`Sign out of ${name} in the companion? Usage then comes from the browser only.`)) return;
    state = await window.companion.signOut(site); render();
  });
}
$("updateCheckNow").addEventListener("click", async () => { state = await window.companion.checkUpdate(); render(); });
$("updateInstall").addEventListener("click", () => window.companion.installUpdate());
$("addId").addEventListener("click", () => {
  const id = $("idInput").value.trim().toLowerCase();
  const err = $("idError");
  if (!/^[a-p]{32}$/.test(id)) { err.textContent = "An extension ID is 32 letters from a to p."; err.hidden = false; return; }
  err.hidden = true;
  $("idInput").value = "";
  save({ extensionIds: [...new Set([...(state.settings.extensionIds || []), id])] });
});
$("idInput").addEventListener("keydown", (e) => { if (e.key === "Enter") $("addId").click(); });

window.companion.onState((s) => { state = s; render(); });
window.companion.getState().then((s) => { state = s; render(); });
setInterval(() => state && render(), 30 * 1000);
