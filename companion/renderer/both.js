// Shows a Claude card and a ChatGPT card together. Each card is panel.html in its own frame
// (the extension's panel draws one site per page) and reports its height here.
"use strict";
(() => {
  const C = window.companion;
  const q = new URLSearchParams(location.search);
  const MODE = q.get("mode") === "mini" ? "mini" : "popup";
  const ROW = q.get("layout") === "row";
  const GAP = Number(q.get("gap")) || 8;
  const W = [Number(q.get("w1")) || 300, Number(q.get("w2")) || 300];
  document.documentElement.classList.add(MODE, "both");
  const box = document.getElementById("cards");
  box.style.flexDirection = ROW ? "row" : "column";
  box.style.gap = GAP + "px";

  const heights = new Map();
  const frames = ["claude", "chatgpt"].map((app, i) => {
    const f = document.createElement("iframe");
    const params = new URLSearchParams({ mode: MODE, app, framed: "1", key: q.get("key") || "main" });
    if (MODE === "mini" && i === 0) params.set("pin", "1"); // one pin for the whole panel
    f.src = `panel.html?${params}`;
    f.title = app === "claude" ? "Claude usage" : "ChatGPT usage";
    f.style.width = W[i] + "px";
    f.style.height = "60px";
    box.append(f);
    return f;
  });

  if (MODE === "popup") window.companionBar("both");

  // Hover: pass the window's hover state to both cards; each card also tracks the pointer itself.
  C.onHover((on) => { for (const f of frames) f.contentWindow && f.contentWindow.postMessage({ type: "umc-hover", on }, "*"); });
  if (MODE === "mini") document.addEventListener("contextmenu", (e) => { e.preventDefault(); C.miniMenu(); });

  function fit() {
    const hs = frames.map((f) => heights.get(f) || 0);
    const cards = ROW ? Math.max(...hs) : hs[0] + hs[1] + GAP;
    C.resize(Math.ceil(box.getBoundingClientRect().top + cards + (MODE === "popup" ? 6 : 0)));
  }

  window.addEventListener("message", (ev) => {
    const f = frames.find((x) => x.contentWindow === ev.source);
    const m = ev.data;
    if (!f || !m || m.type !== "umc-fit") return;
    const h = Math.max(0, Math.min(1000, Number(m.height) || 0));
    heights.set(f, h);
    f.style.height = h + "px";
    if (f === frames[0] && MODE === "popup") window.companionBarColors(m.colors);
    fit();
  });
})();
