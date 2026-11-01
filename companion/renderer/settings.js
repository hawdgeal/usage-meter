// Settings window: reads and writes settings through the main process.
"use strict";
const $ = (id) => document.getElementById(id);
let state = null;
const CHECKS = ["followBrowsers", "followTerminals", "miniPanel", "miniOnTop", "attachToApp", "attachMove", "miniOnlyWithApp", "launchAtLogin"];
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
  $("cardsLayout").disabled = s.cards !== "both";
  for (const k of ["miniOnTop", "attachToApp", "miniOnlyWithApp", "miniOpacity"]) $(k).disabled = !s.miniPanel;
  // On top of its own app replaces both "always on top" and "only while … in front".
  if (s.attachToApp) { $("miniOnTop").checked = false; $("miniOnTop").disabled = $("miniOnlyWithApp").disabled = true; }
  if (!state.foreground.available) $("attachToApp").disabled = true;
  $("attachMove").disabled = !s.miniPanel || !s.attachToApp;
  if (!s.attachToApp) $("attachMove").checked = false;
  for (const k of ["followBrowsers", "followTerminals"]) $(k).disabled = s.mode !== "follow" || !state.foreground.available;
  $("followNote").textContent = s.mode !== "follow" ? "" :
    state.foreground.available ? `Showing ${NAMES[state.followApp]} now. When something else is in front, the last app stays.` :
    `Following isn't available here (${state.foreground.error || "unknown reason"}). Showing ${NAMES[state.followApp]}.`;

  const own = s.lookSource === "own";
  for (const r of document.querySelectorAll('input[name="lookSource"]')) r.checked = r.value === (own ? "own" : "browser");
  $("resetLook").disabled = !own;
  const got = ["claude", "chatgpt"].filter((k) => state.ext && state.ext[k]).map((k) => NAMES[k]);
  $("importLook").disabled = !got.length;
  $("lookStatus").textContent = own ? "Using the companion's own look." :
    got.length ? `Using your ${got.join(" and ")} panel settings from the extension.` : "No panel settings received yet; using the extension's defaults until the browser connects.";

  // Connected browsers
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

async function save(patch) {
  state = await window.companion.setSettings(patch);
  render();
}

for (const k of CHECKS) $(k).addEventListener("change", (e) => save({ [k]: e.target.checked }));
// Turning "always on top" back on leaves "on top of its own app".
$("miniOnTop").addEventListener("change", (e) => { if (e.target.checked && state.settings.attachToApp) save({ attachToApp: false }); });
for (const k of SELECTS) $(k).addEventListener("change", (e) => save({ [k]: e.target.value }));
$("miniOpacity").addEventListener("input", (e) => save({ miniOpacity: Number(e.target.value) }));
$("resetPos").addEventListener("click", () => save({ miniBounds: null, miniPanel: true }));
for (const r of document.querySelectorAll('input[name="lookSource"]')) r.addEventListener("change", (e) => { if (e.target.checked) save({ lookSource: e.target.value }); });
$("customizeClaude").addEventListener("click", () => window.companion.customize("claude"));
$("customizeChatgpt").addEventListener("click", () => window.companion.customize("chatgpt"));
$("importLook").addEventListener("click", async () => {
  if (state.settings.lookSource === "own" && !confirm("Replace the companion's look with your browser's current one?")) return;
  state = await window.companion.importLook(); render();
});
$("resetLook").addEventListener("click", async () => {
  if (!confirm("Drop the companion's own look and use your browser's again?")) return;
  state = await window.companion.resetLook(); render();
});
$("connect").addEventListener("click", () => window.companion.connectBrowsers());
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
