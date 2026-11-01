// Runs after content.js: keeps its panel fed with usage, sizes the window to it, and adds the
// companion's own behavior: hover tracking, dragging the panel by any non-interactive part, the pin
// (always on top) and the right-click menu.
"use strict";
(() => {
  const E = globalThis.__usageMeterCompanion;
  const C = window.companion;
  const NAMES = { claude: "Claude", chatgpt: "ChatGPT", codex: "Codex" };
  const svg = (paths) => `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
  const PIN = svg('<path d="M9 3h6"/><path d="M10 3v5l-3 4h10l-3-4V3"/><path d="M12 12v9"/>');
  const PIN_OFF = svg('<path d="M9 3h6"/><path d="M10 3v5l-3 4h10l-3-4V3"/><path d="M12 12v9"/><path d="M4 4l16 16"/>');
  // Pressing on these never starts a drag.
  const INTERACTIVE = 'button,a[href],input,select,textarea,summary,label,[role="button"],[role="link"],[role="tab"],[role="menuitem"],[role="slider"],[role="checkbox"],[contenteditable]:not([contenteditable="false"]),dialog,[popover]';

  let host = null, root = null, card = null;

  const onTop = () => !!(E.state && E.state.onTop && E.state.onTop[E.key]);

  // ---------- hover ----------
  // windowHover: the pointer is over this window (from the companion, which polls the cursor, or
  // from the parent page when this is one of two cards). frameHover: over this card's frame.
  let windowHover = false, frameHover = !E.framed;
  function applyHover() { if (card) card.classList.toggle("js-hover", windowHover && frameHover); }
  if (E.framed) {
    window.addEventListener("message", (ev) => {
      if (ev.source !== parent || !ev.data || ev.data.type !== "umc-hover") return;
      windowHover = !!ev.data.on;
      if (!windowHover) frameHover = false;
      applyHover();
    });
    document.documentElement.addEventListener("pointerleave", () => { frameHover = false; applyHover(); });
  } else {
    C.onHover((on) => { windowHover = !!on; applyHover(); });
  }
  // Moving over the card shows hover controls right away, without waiting for the next poll.
  document.addEventListener("pointermove", () => { if (!windowHover || !frameHover) { windowHover = true; frameHover = true; applyHover(); } }, { passive: true });

  // ---------- dragging ----------
  function startDrag(e) {
    if (e.button !== 0 || !e.isPrimary) return;
    const path = e.composedPath();
    if (path.some((n) => n instanceof Element && n.matches(INTERACTIVE))) return;
    // Leave the scrollbar of the card's body alone.
    const body = path.find((n) => n instanceof Element && n.classList && n.classList.contains("body"));
    if (body && e.clientX >= body.getBoundingClientRect().left + body.clientWidth) return;
    e.preventDefault();
    const target = e.target;
    let dragging = true;
    const end = () => {
      if (!dragging) return;
      dragging = false;
      C.dragEnd();
      for (const t of ["pointerup", "pointercancel", "lostpointercapture"]) target.removeEventListener(t, end);
      window.removeEventListener("blur", end);
    };
    try { target.setPointerCapture(e.pointerId); } catch (_) {}
    for (const t of ["pointerup", "pointercancel", "lostpointercapture"]) target.addEventListener(t, end);
    window.addEventListener("blur", end);
    C.dragStart();
  }

  function decorate() {
    host = document.getElementById("gptu-usage-host");
    if (!host || !host.shadowRoot) return false;
    root = host.shadowRoot;
    card = root.querySelector(".card");
    applyHover();
    const title = root.querySelector(".title");
    if (title) title.textContent = NAMES[E.app];
    root.addEventListener("click", (e) => { if (e.target.closest && e.target.closest(".refresh")) E.userRefreshUntil = Date.now() + 1500; }, true);
    const style = document.createElement("style");
    // No text selection: dragging over text moves the panel. The pin is hover-only like Refresh.
    style.textContent = `.card{-webkit-user-select:none;user-select:none;cursor:default}
      .head>.pin[aria-pressed="false"]{opacity:.6}
      @media(hover:hover){.card[data-hover-refresh]:not(.js-hover):not(:has(:focus-visible)) .head>.pin{width:0;min-width:0;margin-right:-3px;overflow:hidden;}}`;
    root.appendChild(style);
    if (E.pin) {
      const pin = document.createElement("button");
      pin.className = "icon pin";
      pin.addEventListener("click", () => C.togglePin());
      root.querySelector(".head").insertBefore(pin, root.querySelector(".head>.refresh"));
      updatePin();
    }
    root.addEventListener("pointerdown", startDrag);
    // Right-click anywhere opens the panel menu.
    document.addEventListener("contextmenu", (e) => { e.preventDefault(); C.miniMenu(); });
    new ResizeObserver(fit).observe(host);
    fit();
    return true;
  }

  function updatePin() {
    const pin = root && root.querySelector(".head>.pin");
    if (!pin) return;
    const on = onTop();
    pin.setAttribute("aria-pressed", String(on));
    const where = E.state && E.state.settings && E.state.settings.attachToApp ? "On top of its app" : "Always on top";
    pin.title = `${where}: ${on ? "on (click to turn off)" : "off (click to turn on)"}`;
    pin.setAttribute("aria-label", "Keep on top of other windows");
    pin.innerHTML = on ? PIN : PIN_OFF;
  }

  function fit() {
    if (!host) return;
    if (E.framed) {
      const scheme = getComputedStyle(document.documentElement).colorScheme; // e.g. "dark", set by embed.js
      parent.postMessage({ type: "umc-fit", height: Math.ceil(host.getBoundingClientRect().bottom), scheme }, "*");
      return;
    }
    C.resize(Math.ceil(host.getBoundingClientRect().bottom));
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
