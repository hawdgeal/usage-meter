// Runs in the page's own JS world (MAIN) on claude.ai.
// 1) Fetches plan usage from Claude's internal usage endpoint using your existing session.
// 2) Watches the page's resource timeline so usage refreshes right after a reply finishes.
// Results are posted to content.js (isolated world) via window.postMessage, converted
// into the generic shape the panel draws (rate_limit / additional_rate_limits / credits).
// Nothing leaves your browser: the only requests made go to claude.ai.
(() => {
  if (window.__claudeUsageHooked) return;
  window.__claudeUsageHooked = true;

  const TAG_OUT = "gptu-hook";
  const TAG_IN = "gptu-ui";
  const origFetch = window.fetch.bind(window);

  const post = (type, payload) =>
    window.postMessage({ source: TAG_OUT, type, payload }, location.origin);

  const num = (v) => (typeof v === "number" && isFinite(v) ? v : typeof v === "string" && v.trim() !== "" && isFinite(+v) ? +v : null);

  // ---------- organization ----------
  let org = null; // { id, plan, exp }

  function cookie(name) {
    const hit = document.cookie.split("; ").find((c) => c.startsWith(name + "="));
    return hit ? decodeURIComponent(hit.slice(name.length + 1)) : null;
  }

  const { planName, convert } = globalThis.UsageMeterClaude;

  async function getOrg(force) {
    if (!force && org && Date.now() < org.exp) return org;
    const preferred = cookie("lastActiveOrg");
    let list = null;
    try {
      const r = await origFetch("/api/organizations", { credentials: "include", headers: { Accept: "application/json" } });
      if (r.ok) list = await r.json();
      else if (r.status === 401 || r.status === 403) throw new Error("not signed in");
    } catch (e) {
      if (!preferred) throw e;
    }
    const orgs = Array.isArray(list) ? list : [];
    const chosen =
      orgs.find((o) => o && o.uuid === preferred) ||
      orgs.find((o) => o && Array.isArray(o.capabilities) && o.capabilities.includes("chat")) ||
      orgs[0] || null;
    const id = (chosen && chosen.uuid) || preferred;
    if (!id) throw new Error("not signed in (no organization found)");
    org = { id, plan: planName(chosen), exp: Date.now() + 10 * 60 * 1000 };
    return org;
  }

  async function getJson(path, retry = true) {
    const o = await getOrg(!retry);
    const r = await origFetch(path.replace("{org}", encodeURIComponent(o.id)), {
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    if ((r.status === 401 || r.status === 403 || r.status === 404) && retry) {
      org = null;
      return getJson(path, false);
    }
    if (!r.ok) throw new Error(`${path.replace("{org}", "…")} → HTTP ${r.status}`);
    return r.json();
  }

  async function refreshUsage() {
    try {
      const raw = await getJson("/api/organizations/{org}/usage");
      post("usage", { data: convert(raw, org && org.plan), raw, plan: org && org.plan, at: Date.now() });
    } catch (e) {
      post("usage-error", { message: String((e && e.message) || e), at: Date.now() });
    }
  }

  // ---------- refresh after replies ----------
  // Watch the browser's resource timeline instead of wrapping window.fetch. Claude's own requests
  // then never pass through this script, so their failures (for example analytics blocked by an ad
  // blocker) are not attributed to the extension. A fetch entry is recorded when its response has
  // fully arrived, so a streamed reply is reported when it finishes, and stopped or failed
  // requests are reported too. Requests made inside Web Workers are not visible here; the panel
  // also refreshes every two minutes and when the tab becomes visible.
  const SPENDS_USAGE = /\/(completion|retry_completion|messages|events)$/;
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.initiatorType !== "fetch") continue;
        let url;
        try { url = new URL(entry.name); } catch (_) { continue; }
        if (url.origin === location.origin && SPENDS_USAGE.test(url.pathname)) post("activity", {});
      }
    }).observe({ type: "resource" });
  } catch (_) { /* no PerformanceObserver: rely on periodic refresh */ }

  window.addEventListener("message", (ev) => {
    if (ev.source !== window || !ev.data || ev.data.source !== TAG_IN) return;
    if (ev.data.type === "refresh") refreshUsage();
    else if (ev.data.type === "reset-details")
      post("reset-details", { flowId: ev.data.payload && ev.data.payload.flowId, error: "Usage resets are not available on Claude." });
  });

  post("ready", {});
})();
