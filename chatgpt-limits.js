// ChatGPT's per-feature limits (deep research, image generation, file uploads…) as the panel's
// "Models & features" module stores them. ChatGPT reports them in its conversation/init answer as
// limits_progress: [{ feature_name, remaining, reset_after }]. Used by background.js (which fetches
// them for the desktop companion every few minutes) and by the companion's own sign-in.
(() => {
  if (globalThis.UsageMeterChatGPTLimits) return;
  const num = (v) => (typeof v === "number" && isFinite(v) ? v : typeof v === "string" && v.trim() !== "" && isFinite(+v) ? +v : null);

  // The request ChatGPT's own page makes when it loads.
  const INIT_URL = "https://chatgpt.com/backend-api/conversation/init";
  const initBody = () => JSON.stringify({ gizmo_id: null, requested_default_model: null, conversation_id: null, timezone_offset_min: new Date().getTimezoneOffset() });

  // [{ name, remaining, limit, used, resetsAt }] from a conversation/init answer.
  function fromInit(json) {
    const out = [];
    for (const key of ["limits_progress", "model_limits"]) {
      for (const it of Array.isArray(json && json[key]) ? json[key] : []) {
        const name = it && (it.feature_name || it.model_slug || it.name);
        if (!name) continue;
        let resetsAt = null;
        const ra = it.reset_after ?? it.resets_at ?? it.reset_at;
        if (typeof ra === "string" && isNaN(+ra)) { const t = Date.parse(ra); if (!isNaN(t)) resetsAt = t; }
        else if (num(ra) != null) resetsAt = num(ra) > 1e9 ? num(ra) * 1000 : Date.now() + num(ra) * 1000;
        out.push({ name: String(name), remaining: num(it.remaining), limit: num(it.limit ?? it.max ?? it.cap), used: num(it.used), resetsAt });
      }
    }
    return out;
  }

  // The stored models with new items merged in (seen at `at`). peak, the most left seen since the
  // last reset, stands in for the total, which ChatGPT doesn't report (same rule as content.js).
  function merge(models, items, at) {
    const next = { ...(models || {}) };
    for (const it of items) {
      const prev = next[it.name];
      const sameWindow = prev && prev.resetsAt && prev.resetsAt > at;
      const peak = Math.max(it.remaining ?? 0, sameWindow ? (prev.peak ?? prev.remaining ?? 0) : 0) || null;
      next[it.name] = { ...it, peak, seenAt: at };
    }
    return next;
  }

  globalThis.UsageMeterChatGPTLimits = { INIT_URL, initBody, fromInit, merge };
})();
