// The popup's top bar: which app to show (or both) and the companion's settings.
"use strict";
window.companionBar = (current) => {
  const C = window.companion;
  const NAMES = { claude: "Claude", chatgpt: "ChatGPT", codex: "Codex", both: "Both" };
  const bar = document.getElementById("bar");
  const apps = document.createElement("div");
  apps.className = "apps";
  for (const id of Object.keys(NAMES)) {
    const b = document.createElement("button");
    b.textContent = NAMES[id];
    if (id === "both") b.title = "Claude and ChatGPT";
    b.setAttribute("aria-pressed", String(id === current));
    b.addEventListener("click", () => { if (id !== current) C.popupApp(id); });
    apps.append(b);
  }
  const gear = document.createElement("button");
  gear.className = "gear";
  gear.title = "Companion settings";
  gear.setAttribute("aria-label", "Companion settings");
  gear.innerHTML = '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/></svg>';
  gear.addEventListener("click", () => C.openSettings());
  bar.append(apps, gear);
  bar.hidden = false;
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") C.hide(); });
};

// colors: { surface, fg, muted, line, hover, accent } taken from a card.
window.companionBarColors = (c) => {
  if (!c) return;
  const b = document.body.style;
  b.background = c.surface;
  for (const k of ["fg", "muted", "line", "hover", "surface", "accent"]) if (c[k]) b.setProperty(`--bar-${k}`, c[k]);
};
