// The color picker layer: shows the color under the pointer next to it; a click picks it, Esc or a
// right-click cancels. The companion reads the pixels and positions (see pickColor in main.js).
"use strict";
(() => {
  const C = window.companion;
  const tip = document.getElementById("tip");
  C.onPicker(({ x, y, hex }) => {
    if (!hex) { tip.hidden = true; return; }
    document.getElementById("swatch").style.background = hex;
    document.getElementById("hex").textContent = hex;
    tip.hidden = false;
    // Below-right of the pointer, flipped near the edges of the layer.
    const w = tip.offsetWidth, h = tip.offsetHeight;
    tip.style.left = (x + 18 + w > innerWidth ? x - 18 - w : x + 18) + "px";
    tip.style.top = (y + 18 + h > innerHeight ? y - 18 - h : y + 18) + "px";
  });
  addEventListener("mousedown", (e) => { e.preventDefault(); C.pickerDone(e.button === 0); });
  addEventListener("contextmenu", (e) => e.preventDefault());
  addEventListener("keydown", (e) => { if (e.key === "Escape") C.pickerDone(false); });
  addEventListener("blur", () => C.pickerDone(false));
})();
