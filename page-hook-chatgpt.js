// Runs in the page's own JS world (MAIN) on chatgpt.com.
// 1) Fetches plan usage from ChatGPT's internal usage endpoint using your existing session.
// 2) Passively watches ChatGPT's own JSON responses for per-model limit info.
// Results are posted to content.js (isolated world) via window.postMessage.
// Nothing leaves your browser: the only requests made go to chatgpt.com.
(() => {
  if (window.__gptuHooked) return;
  window.__gptuHooked = true;

  const TAG_OUT = "gptu-hook";
  const TAG_IN = "gptu-ui";
  const origFetch = window.fetch.bind(window);

  const post = (type, payload) =>
    window.postMessage({ source: TAG_OUT, type, payload }, location.origin);

  // ---------- session token ----------
  let session = null; // { token, accountId, exp }
  async function getSession(force) {
    if (!force && session && Date.now() < session.exp) return session;
    const r = await origFetch("/api/auth/session", { credentials: "include" });
    if (!r.ok) throw new Error(`session ${r.status}`);
    const j = await r.json();
    if (!j || !j.accessToken) throw new Error("not signed in");
    session = {
      token: j.accessToken,
      accountId: (j.account && (j.account.id || j.account.account_id)) || null,
      plan: (j.account && (j.account.planType || j.account.plan_type)) || null,
      // refresh token copy every 10 min; the real one lives much longer
      exp: Date.now() + 10 * 60 * 1000,
    };
    return session;
  }

  async function authedGet(path, retry = true) {
    const s = await getSession(false);
    const headers = { Authorization: `Bearer ${s.token}`, Accept: "application/json" };
    if (s.accountId) headers["ChatGPT-Account-Id"] = s.accountId;
    const r = await origFetch(path, { headers, credentials: "include" });
    if ((r.status === 401 || r.status === 403) && retry) {
      session = null;
      return authedGet(path, false);
    }
    if (!r.ok) throw new Error(`${path} → HTTP ${r.status}`);
    return r.json();
  }

  async function refreshUsage() {
    try {
      const usage = await authedGet("/backend-api/wham/usage");
      post("usage", { data: usage, plan: session && session.plan, at: Date.now() });
      if(!Number.isInteger(usage.rate_limit_reset_credits?.available_count)){
        try{const details=await authedGet('/backend-api/wham/rate-limit-reset-credits');post('reset-summary',{available_count:details.available_count});}catch(_){}
      }
    } catch (e) {
      post("usage-error", { message: String(e && e.message || e), at: Date.now() });
    }
  }

  let resetInFlight=false;
  async function resetDetails(flowId){
    try{const data=await authedGet('/backend-api/wham/rate-limit-reset-credits');post('reset-details',{flowId,data});}
    catch(_){post('reset-details',{flowId,error:'Unable to load available resets. Open Usage to review them.'});}
  }
  async function useReset(payload){
    if(resetInFlight)return;
    if(typeof payload?.creditId!=='string'||typeof payload?.requestId!=='string'||!/^[0-9a-f-]{36}$/i.test(payload.requestId))return;
    resetInFlight=true;
    try{
      const details=await authedGet('/backend-api/wham/rate-limit-reset-credits');
      const credit=details.credits?.find(c=>c.id===payload.creditId&&c.status==='available'&&(!c.expires_at||Date.parse(c.expires_at)>Date.now()));
      if(!credit)throw Error('unavailable');
      const auth=await getSession(false),headers={Authorization:`Bearer ${auth.token}`,Accept:'application/json','Content-Type':'application/json'};
      if(auth.accountId)headers['ChatGPT-Account-Id']=auth.accountId;
      const response=await origFetch('/backend-api/wham/rate-limit-reset-credits/consume',{method:'POST',headers,credentials:'include',body:JSON.stringify({redeem_request_id:payload.requestId,credit_id:credit.id})});
      if(!response.ok)throw Error('request failed');
      const result=await response.json();
      post('reset-result',{flowId:payload.flowId,code:result.code,windows:result.windows_reset});
    }catch(_){post('reset-result',{flowId:payload.flowId,error:'The reset could not be confirmed. Refresh Usage and check your reset balance before trying again.'});}
    finally{resetInFlight=false;refreshUsage();}
  }

  // ---------- passive scan for per-model limits ----------
  const LIMIT_KEYS = ["limits_progress", "model_limits", "message_limits", "usage_limits"];

  function normalizeLimit(item) {
    if (!item || typeof item !== "object") return null;
    const name =
      item.feature_name || item.model_slug || item.model || item.slug ||
      item.name || item.feature || item.limit_name;
    if (!name) return null;
    const num = (v) => (typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" && !isNaN(+v) ? +v : null);
    const remaining = num(item.remaining ?? item.remaining_messages ?? item.messages_remaining);
    const limit = num(item.limit ?? item.max ?? item.cap ?? item.total);
    const used = num(item.used ?? item.count ?? item.usage);
    let resetsAt = null;
    const ra = item.reset_after ?? item.resets_at ?? item.reset_at ?? item.reset_time;
    if (typeof ra === "string" && isNaN(+ra)) {
      const t = Date.parse(ra);
      if (!isNaN(t)) resetsAt = t;
    } else if (num(ra) != null) {
      const n = num(ra);
      // epoch seconds vs relative seconds
      resetsAt = n > 1e9 ? n * 1000 : Date.now() + n * 1000;
    }
    const ras = num(item.reset_after_seconds ?? item.resets_in_seconds);
    if (ras != null) resetsAt = Date.now() + ras * 1000;
    if (remaining == null && limit == null && used == null && resetsAt == null) return null;
    return { name: String(name), remaining, limit, used, resetsAt };
  }

  function scan(obj, found, depth) {
    if (!obj || typeof obj !== "object" || depth > 6) return;
    if (Array.isArray(obj)) {
      for (const v of obj.slice(0, 200)) scan(v, found, depth + 1);
      return;
    }
    for (const k of Object.keys(obj)) {
      const v = obj[k];
      if (LIMIT_KEYS.includes(k)) {
        const arr = Array.isArray(v) ? v : v && typeof v === "object"
          ? Object.entries(v).map(([n, x]) => (x && typeof x === "object" ? { name: n, ...x } : null))
          : [];
        for (const it of arr) {
          const n = normalizeLimit(it);
          if (n) found.push(n);
        }
      } else if (v && typeof v === "object") {
        scan(v, found, depth + 1);
      }
    }
  }

  // The wrapper hands the page its own promise unchanged: the page's requests, their timing and
  // their errors stay the page's. Inspection runs on the side, after the response, when idle.
  const MAX_SCAN_BYTES = 2 * 1024 * 1024;
  const whenIdle = window.requestIdleCallback ? (fn) => requestIdleCallback(fn, { timeout: 2000 }) : (fn) => setTimeout(fn, 0);
  function inspect(res, url, method) {
    try {
      // After you send a message, nudge the UI to re-check usage shortly after.
      if (method === "POST" && /\/backend-api\/(f\/)?conversation(\?|$)/.test(url)) post("activity", {});
      if (!url.includes("/backend-api/") || url.includes("/wham/usage")) return;
      const ct = res.headers.get("content-type") || "";
      if (!ct.includes("application/json")) return;
      // Skip very large bodies (for example long conversation histories) rather than parse them twice.
      const size = +(res.headers.get("content-length") || 0);
      if (size > MAX_SCAN_BYTES) return;
      const copy = res.clone();
      whenIdle(() => {
        copy.text().then((text) => {
          if (text.length > MAX_SCAN_BYTES) return;
          const found = [];
          scan(JSON.parse(text), found, 0);
          if (found.length) post("model-limits", { items: found, from: url.split("?")[0], at: Date.now() });
        }).catch(() => {});
      });
    } catch (_) { /* never break the page */ }
  }

  window.fetch = function (input, init) {
    const request = origFetch(input, init);
    try {
      const url = input instanceof Request ? input.url : String(input || "");
      const method = ((init && init.method) || (input && input.method) || "GET").toUpperCase();
      request.then((res) => inspect(res, url, method), () => {});
    } catch (_) { /* never break the page */ }
    return request;
  };

  window.addEventListener("message", (ev) => {
    if (ev.source !== window || !ev.data || ev.data.source !== TAG_IN) return;
    if (ev.data.type === "refresh") refreshUsage();
    else if(ev.data.type==='reset-details')resetDetails(ev.data.payload?.flowId);
    else if(ev.data.type==='use-reset')useReset(ev.data.payload);
  });

  post("ready", {});
})();
