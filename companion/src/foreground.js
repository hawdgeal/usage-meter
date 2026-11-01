// Reports the window in front (its executable path and title) on Windows, using user32/kernel32
// through koffi. On other systems, or if koffi can't load, get() returns null and the companion
// simply keeps showing the app you picked.
"use strict";

let api = null;
let loadError = null;

function load() {
  if (api || loadError) return api;
  if (process.platform !== "win32") { loadError = "Only available on Windows"; return null; }
  try {
    const koffi = require("koffi");
    const user32 = koffi.load("user32.dll");
    const kernel32 = koffi.load("kernel32.dll");
    api = {
      GetForegroundWindow: user32.func("void * __stdcall GetForegroundWindow()"),
      GetWindowThreadProcessId: user32.func("uint32_t __stdcall GetWindowThreadProcessId(void *hWnd, uint32_t *lpdwProcessId)"),
      GetWindowTextW: user32.func("int __stdcall GetWindowTextW(void *hWnd, uint16_t *lpString, int nMaxCount)"),
      OpenProcess: kernel32.func("void * __stdcall OpenProcess(uint32_t dwDesiredAccess, int bInheritHandle, uint32_t dwProcessId)"),
      QueryFullProcessImageNameW: kernel32.func("int __stdcall QueryFullProcessImageNameW(void *hProcess, uint32_t dwFlags, uint16_t *lpExeName, uint32_t *lpdwSize)"),
      CloseHandle: kernel32.func("int __stdcall CloseHandle(void *hObject)"),
    };
  } catch (e) {
    loadError = String((e && e.message) || e);
    api = null;
  }
  return api;
}

const PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;
const exeCache = new Map(); // pid -> exe path (pids are reused, so the cache is small and short-lived)

function exeOf(pid) {
  if (exeCache.has(pid)) return exeCache.get(pid);
  let exe = null;
  const h = api.OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
  if (h) {
    try {
      const buf = Buffer.alloc(2048);
      const len = new Uint32Array([1024]);
      if (api.QueryFullProcessImageNameW(h, 0, buf, len)) exe = buf.toString("utf16le", 0, len[0] * 2);
    } finally { api.CloseHandle(h); }
  }
  if (exeCache.size > 64) exeCache.clear();
  exeCache.set(pid, exe);
  setTimeout(() => exeCache.delete(pid), 60 * 1000).unref?.();
  return exe;
}

function get() {
  if (!load()) return null;
  try {
    const hwnd = api.GetForegroundWindow();
    if (!hwnd) return null;
    const pid = new Uint32Array(1);
    api.GetWindowThreadProcessId(hwnd, pid);
    const tbuf = Buffer.alloc(1024);
    const n = api.GetWindowTextW(hwnd, tbuf, 512);
    return { pid: pid[0], exe: pid[0] ? exeOf(pid[0]) : null, title: n > 0 ? tbuf.toString("utf16le", 0, n * 2) : "" };
  } catch (e) {
    return null;
  }
}

function available() {
  return !!load();
}

module.exports = { get, available, error: () => (load(), loadError) };
