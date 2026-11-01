// Runs after content.js: keeps its panel fed with usage, sizes the window to it, and adds the
// companion's own controls (the pin in the mini panel, the app switch in the popup).
"use strict";
(() => {
  const E = globalThis.__usageMeterCompanion;
  const C = window.companion;
  const NAMES = { claude: "Claude", chatgpt: "ChatGPT", codex: "Codex" };
  const svg = (paths) => `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
  const PIN = svg('<path d="M9 3h6"/><path d="M10 3v5l-3 4h10l-3-4V3"/><path d="M12 12v9"/>');
  const PIN_OFF = svg('<path d="M9 3h6"/><path d="M10 3v5l-3 4h10l-3-4V3"/><path d="M12 12v9"/><path d="M4 4l16 16"/>');

  let host = null, root = null, card = null;

  function onTop() { return !!(E.state && E.state.settings.miniOnTop); }

  function decorate() {
    host = document.getElementById("gptu-usage-host");
    if (!host || !host.shadowRoot) return false;
    root = host.shadowRoot;
    card = root.querySelector(".card");
    const title = root.querySelector(".title");
    if (title) title.textContent = NAMES[E.app];
    root.addEventListener("click", (e) => { if (e.target.closest && e.target.closest(".refresh")) E.userRefreshUntil = Date.now() + 1500; }, true);
    if (E.mode === "mini" && E.pin) {
      const style = document.createElement("style");
      // Same hover-only behavior as the Refresh button.
      style.textContent = `.head>.pin[aria-pressed="false"]{opacity:.6}
        @media(hover:hover){.card[data-hover-refresh]:not(:hover):not(:has(:focus-visible)) .head>.pin{width:0;min-width:0;margin-right:-3px;overflow:hidden;}}`;
      root.appendChild(style);
      const pin = document.createElement("button");
      pin.className = "icon pin";
      pin.addEventListener("click", () => C.setSettings({ miniOnTop: !onTop() }));
      root.querySelector(".head").insertBefore(pin, root.querySelector(".head>.refresh"));
      updatePin();
    }
    if (E.mode === "mini") root.addEventListener("contextmenu", (e) => { e.preventDefault(); C.miniMenu(); });
    new ResizeObserver(fit).observe(host);
    if (E.mode === "popup" && !E.framed) { window.companionBar(E.app); barColors(); new MutationObserver(barColors).observe(card, { attributes: true }); }
    fit();
    return true;
  }

  function updatePin() {
    const pin = root && root.querySelector(".head>.pin");
    if (!pin) return;
    const on = onTop();
    pin.setAttribute("aria-pressed", String(on));
    pin.title = on ? "Always on top: on (click to turn off)" : "Always on top: off (click to turn on)";
    pin.setAttribute("aria-label", "Keep on top of other windows");
    pin.innerHTML = on ? PIN : PIN_OFF;
  }

  function fit() {
    if (!host) return;
    if (E.framed) { parent.postMessage({ type: "umc-fit", height: Math.ceil(host.getBoundingClientRect().bottom), colors: cardColors() }, "*"); return; }
    C.resize(Math.ceil(host.getBoundingClientRect().bottom) + (E.mode === "popup" ? 6 : 0));
  }

  function cardColors() {
    const cs = getComputedStyle(card);
    const v = (k) => cs.getPropertyValue(`--${k}`).trim();
    return { surface: cs.backgroundColor, fg: v("fg"), muted: v("muted"), line: v("line"), hover: v("hover"), accent: v("remaining") };
  }

  // The popup's background and switch use the panel's current colors.
  function barColors() {
    if (card && E.mode === "popup" && !E.framed) window.companionBarColors(cardColors());
  }

  C.onState((s) => {
    E.state = s;
    E.feed(false);
    updatePin();
  });

  E.ready.then(() => {
    E.feed(false);
    if (!decorate()) {
      const mo = new MutationObserver(() => { if (decorate()) mo.disconnect(); });
      mo.observe(document.body, { childList: true });
    }
  });
})();
