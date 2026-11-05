// Runs after content.js: keeps its panel fed with usage, sizes the window to it, and adds the
// companion's own behavior: hover tracking, dragging the panel by any non-interactive part,
// resizing it by its edges, the placement button and the right-click menu.
"use strict";
(() => {
  const E = globalThis.__usageMeterCompanion;
  const C = window.companion;
  const NAMES = { claude: "Claude", chatgpt: "ChatGPT", codex: "Codex" };
  const svg = (paths) => `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
  // The placement button shows where the card sits: floating (a pin, crossed out when it isn't kept
  // on top), on top of its app (a card on a window) or in its app's sidebar (a card in the sidebar).
  const ICONS = {
    float: svg('<path d="M9 3h6"/><path d="M10 3v5l-3 4h10l-3-4V3"/><path d="M12 12v9"/>'),
    floatLoose: svg('<path d="M9 3h6"/><path d="M10 3v5l-3 4h10l-3-4V3"/><path d="M12 12v9"/><path d="M4 4l16 16"/>'),
    app: svg('<rect x="3" y="4" width="18" height="16" rx="2"/><rect x="11" y="8" width="7" height="5" rx="1"/>'),
    dock: svg('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/><rect x="4.5" y="13" width="3" height="5" rx="0.8"/>'),
    rail: svg('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16"/><rect x="16.5" y="13" width="3" height="5" rx="0.8"/>'),
  };
  const PLACE_TEXT = { float: "Floating", app: "On top of its app", dock: "In its app's sidebar", rail: "In Claude's session rail" };
  // Pressing on these never starts a drag.
  const INTERACTIVE = 'button,a[href],input,select,textarea,summary,label,[role="button"],[role="link"],[role="tab"],[role="menuitem"],[role="slider"],[role="checkbox"],[contenteditable]:not([contenteditable="false"]),dialog,[popover]';

  let host = null, root = null, card = null;

  const placement = () => (E.state && E.state.placement && E.state.placement[E.key]) || "float";
  const onTop = () => !(E.state && E.state.onTop && E.state.onTop[E.key] === false);

  // ---------- hover ----------
  // windowHover: the pointer is over this window (from the companion, which polls the cursor, or
  // from the parent page when this is one of two cards). frameHover: over this card's frame.
  let windowHover = E.edit, frameHover = !E.framed;
  function applyHover() { if (card) card.classList.toggle("js-hover", windowHover && frameHover); }
  if (E.framed) {
    window.addEventListener("message", (ev) => {
      if (ev.source !== parent || !ev.data || ev.data.type !== "umc-hover") return;
      windowHover = !!ev.data.on;
      if (!windowHover) frameHover = false;
      applyHover();
    });
    document.documentElement.addEventListener("pointerleave", () => { frameHover = false; applyHover(); });
  } else if (!E.edit) {
    C.onHover((on) => { windowHover = !!on; applyHover(); });
  }
  // Moving over the card shows hover controls right away, without waiting for the next poll.
  document.addEventListener("pointermove", () => { if (!windowHover || !frameHover) { windowHover = true; frameHover = true; applyHover(); } }, { passive: true });

  // ---------- resizing (width) ----------
  // Near the card's left or right edge the pointer becomes a resize arrow; pressing there changes
  // the card's width instead of moving it. Not for two cards in one panel (each is a frame there).
  // The grab zone is inside the card: the see-through margin around it doesn't take clicks.
  const EDGE = 10, EDGE_V = 6; // px
  function edgeAt(e) {
    if (E.framed || E.edit || !card) return null;
    const r = card.getBoundingClientRect();
    if (e.clientX < r.left - 2 || e.clientX > r.right + 2) return null;
    // Height: the top edge when docked (its bottom stays put), else the bottom edge.
    if (dockLook ? e.clientY >= r.top - 2 && e.clientY <= r.top + EDGE_V : e.clientY >= r.bottom - EDGE_V && e.clientY <= r.bottom + 2) return dockLook ? "top" : "bottom";
    if (dockLook) return null; // its width is the sidebar's
    if (e.clientY < r.top || e.clientY > r.bottom) return null;
    if (e.clientX >= r.left - 2 && e.clientX <= r.left + EDGE) return "left";
    if (e.clientX <= r.right + 2 && e.clientX >= r.right - EDGE) return "right";
    return null;
  }
  let resizingEdge = null;
  document.addEventListener("pointermove", (e) => {
    if (!card || resizingEdge) return;
    const edge = edgeAt(e);
    const cur = !edge ? "" : edge === "top" || edge === "bottom" ? "ns-resize" : "ew-resize";
    if (card.style.cursor !== cur) card.style.cursor = cur;
  }, { passive: true });
  function startWidth(e, edge) {
    e.preventDefault();
    e.stopPropagation();
    const target = e.target;
    resizingEdge = edge;
    const end = () => {
      if (!resizingEdge) return;
      resizingEdge = null;
      C.widthEnd();
      for (const t of ["pointerup", "pointercancel", "lostpointercapture"]) target.removeEventListener(t, end);
      window.removeEventListener("blur", end);
    };
    try { target.setPointerCapture(e.pointerId); } catch (_) {}
    for (const t of ["pointerup", "pointercancel", "lostpointercapture"]) target.addEventListener(t, end);
    window.addEventListener("blur", end);
    C.widthStart(edge);
  }
  // Height: like the width, but the page draws it (the window then fits the card).
  let liveHeight = null, heightStyle = null;
  const savedHeight = () => {
    const all = E.state && E.state.settings && E.state.settings.cardHeights;
    const h = all && all[dockLook ? `${E.key}:dock` : E.key];
    return typeof h === "number" && h > 0 ? h : null;
  };
  function applyHeight() {
    if (!root || E.framed || E.edit) return;
    if (!heightStyle) { heightStyle = document.createElement("style"); root.appendChild(heightStyle); }
    const h = liveHeight || savedHeight();
    const css = !h ? "" : `.card:not(.collapsed){height:${Math.round(h)}px !important;display:flex !important;flex-direction:column !important;box-sizing:border-box !important}
      .card:not(.collapsed)>.body{flex:1 1 auto !important;max-height:none !important;min-height:0 !important}`;
    if (heightStyle.textContent !== css) heightStyle.textContent = css;
  }
  if (C.onCardHeight) C.onCardHeight((h) => { if (resizingEdge) { liveHeight = h; applyHeight(); } });
  function startHeight(e, edge) {
    e.preventDefault();
    e.stopPropagation();
    const target = e.target;
    resizingEdge = edge;
    const end = () => {
      if (!resizingEdge) return;
      resizingEdge = null;
      C.heightEnd();
      // Keep the dragged height until the saved one arrives with the next state.
      setTimeout(() => { liveHeight = null; applyHeight(); }, 400);
      for (const t of ["pointerup", "pointercancel", "lostpointercapture"]) target.removeEventListener(t, end);
      window.removeEventListener("blur", end);
    };
    try { target.setPointerCapture(e.pointerId); } catch (_) {}
    for (const t of ["pointerup", "pointercancel", "lostpointercapture"]) target.addEventListener(t, end);
    window.addEventListener("blur", end);
    C.heightStart(edge, card.getBoundingClientRect().height);
  }
  // Double-click the height edge: back to fitting the content.
  document.addEventListener("dblclick", (e) => { const edge = edgeAt(e); if (edge === "top" || edge === "bottom") C.heightReset(); });

  // ---------- docked in the app's sidebar ----------
  // The card is drawn flat, edge to edge, in the sidebar's own color, with a line on top like the
  // app's own dividers. It can't be moved or resized there.
  let dockLook = null, dockStyle = null;
  const COLOR = /^#[0-9a-f]{6}$/i;
  function applyDock() {
    document.documentElement.classList.toggle("docked", !!dockLook);
    if (!root) return;
    if (!dockStyle) { dockStyle = document.createElement("style"); root.appendChild(dockStyle); }
    const bg = dockLook && COLOR.test(dockLook.bg) ? dockLook.bg : null;
    const line = dockLook && COLOR.test(dockLook.line || "") ? dockLook.line : "color-mix(in srgb, var(--fg) 14%, transparent)";
    dockStyle.textContent = !dockLook ? "" : `.panel-layout{padding:0 !important}
      .card,.card:hover,.card:has(:focus-visible){margin:0 !important;border-radius:0 !important;border:0 !important;border-top:1px solid ${line} !important;box-shadow:none !important;${bg ? `background:${bg} !important;` : ""}}`;
    if (card) card.style.cursor = "";
    applyHeight();
    fit();
  }
  if (C.onDock) C.onDock((look) => { dockLook = look && typeof look === "object" ? look : null; applyDock(); });

  // ---------- dragging ----------
  function startDrag(e) {
    if (e.button !== 0 || !e.isPrimary) return;
    const edge = edgeAt(e);
    if (edge === "top" || edge === "bottom") { startHeight(e, edge); return; }
    if (edge) { startWidth(e, edge); return; }
    if (dockLook) return; // stays in its sidebar
    const path = e.composedPath();
    if (path.some((n) => n instanceof Element && n.matches(INTERACTIVE))) return;
    // Leave the scrollbar of the card's body alone.
    const body = path.find((n) => n instanceof Element && n.classList && n.classList.contains("body"));
    if (body && e.clientX >= body.getBoundingClientRect().left + body.clientWidth) return;
    beginDrag(e);
  }
  // The companion moves the window while the button is held.
  function beginDrag(e) {
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
    // No text selection: dragging over text moves the panel. The placement button is hover-only like Refresh.
    style.textContent = `.card{-webkit-user-select:none;user-select:none;cursor:default}
      @media(hover:hover){.card[data-hover-refresh]:not(.js-hover):not(:has(:focus-visible)) .head>.place{width:0;min-width:0;margin-right:-3px;overflow:hidden;}}`;
    root.appendChild(style);
    if (E.edit) {
      // The Customize window: the extension's own Customize panel, opened right away. Its changes
      // become the companion's own look (see storage.set in embed.js).
      const edit = document.createElement("style");
      // The Customize panel fills the space to the right of the card instead of floating over it.
      edit.textContent = `:host([data-embedded]) .customize{display:inline-grid !important;opacity:1 !important;pointer-events:auto !important;width:auto !important}
        .settings{position:fixed !important;inset:16px 16px auto 360px !important;width:auto !important;height:auto !important;max-width:none !important;max-height:calc(100vh - 32px) !important;margin:0 !important}
        .settings .settings-resize,.settings-drag,.settings [data-settings-drag]{display:none !important}
        .card{box-shadow:0 8px 28px #0006 !important}
        .settings-header,.settings-title{cursor:default}`;
      root.appendChild(edit);
      // The window has no frame: the panel's × closes it, and the card or the panel's title moves it.
      root.addEventListener("click", (e) => {
        if (e.target.closest && e.target.closest(".close-settings")) { e.preventDefault(); e.stopImmediatePropagation(); window.close(); }
      }, true);
      // Runs before the panel's own handlers (capture), so its title moves the window rather than
      // sliding the panel around inside it.
      root.addEventListener("pointerdown", (e) => {
        if (e.button !== 0) return;
        const path = e.composedPath();
        const onTitle = path.some((n) => n instanceof Element && n.matches(".settings-title"));
        // The Customize panel itself is a popover: only real controls inside it don't drag.
        if (path.some((n) => n instanceof Element && n.matches(INTERACTIVE) && !n.matches("[popover],dialog,.settings-grab"))) return;
        const onCard = path.some((n) => n === card);
        if (!onCard && !onTitle) return;
        e.stopImmediatePropagation();
        beginDrag(e);
      }, true);
      root.addEventListener("dblclick", (e) => { if (e.target.closest && e.target.closest(".settings-title")) e.stopImmediatePropagation(); }, true);
      // In this window the panel is the whole point: it doesn't close on Esc or a click elsewhere
      // (a "manual" popover), and if it closes anyway it opens again.
      const panel = root.querySelector(".settings");
      if (panel) panel.setAttribute("popover", "manual");
      const open = () => { const b = root.querySelector(".customize"); if (b && b.getAttribute("aria-expanded") !== "true") b.click(); };
      if (panel) panel.addEventListener("toggle", (e) => { if (e.newState === "closed") setTimeout(open, 50); });
      setTimeout(open, 200);
      return true;
    }
    if (E.pin) {
      const b = document.createElement("button");
      b.className = "icon place";
      b.setAttribute("aria-haspopup", "menu");
      b.addEventListener("click", () => C.placementMenu());
      root.querySelector(".head").insertBefore(b, root.querySelector(".head>.refresh"));
      updatePlace();
    }
    root.addEventListener("pointerdown", startDrag);
    // Right-click anywhere opens the panel menu.
    document.addEventListener("contextmenu", (e) => { e.preventDefault(); C.miniMenu(); });
    new ResizeObserver(fit).observe(host);
    applyDock();
    return true;
  }

  function updatePlace() {
    const b = root && root.querySelector(".head>.place");
    if (!b) return;
    const p = placement(), loose = p === "float" && !onTop();
    const html = ICONS[loose ? "floatLoose" : p] || ICONS.float;
    if (b.innerHTML !== html) b.innerHTML = html;
    b.title = `${PLACE_TEXT[p] || PLACE_TEXT.float}${p === "float" ? (loose ? ", not kept on top" : ", kept on top") : ""} · click to change`;
    b.setAttribute("aria-label", `Where this card sits: ${b.title}`);
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
    updatePlace();
    applyHeight();
  });

  E.ready.then(() => {
    E.feed(false);
    if (!decorate()) {
      const mo = new MutationObserver(() => { if (decorate()) mo.disconnect(); });
      mo.observe(document.body, { childList: true });
    }
  });
})();
