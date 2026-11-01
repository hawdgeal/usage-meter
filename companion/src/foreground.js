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
      // Window handles are passed as integers: HWND_TOPMOST and HWND_NOTOPMOST are -1 and -2.
      SetWindowPos: user32.func("int __stdcall SetWindowPos(intptr_t hWnd, intptr_t hWndInsertAfter, int X, int Y, int cx, int cy, uint32_t uFlags)"),
      // For walking the windows in stacking order (top first), with handles as integers.
      GetTopWindow: user32.func("intptr_t __stdcall GetTopWindow(intptr_t hWnd)"),
      GetWindow: user32.func("intptr_t __stdcall GetWindow(intptr_t hWnd, uint32_t uCmd)"),
      IsWindowVisible: user32.func("int __stdcall IsWindowVisible(intptr_t hWnd)"),
      IsIconic: user32.func("int __stdcall IsIconic(intptr_t hWnd)"),
      GetWindowLongW: user32.func("int32_t __stdcall GetWindowLongW(intptr_t hWnd, int nIndex)"),
      GetWindowThreadProcessIdI: user32.func("uint32_t __stdcall GetWindowThreadProcessId(intptr_t hWnd, uint32_t *lpdwProcessId)"),
      GetWindowTextWI: user32.func("int __stdcall GetWindowTextW(intptr_t hWnd, uint16_t *lpString, int nMaxCount)"),
    };
    const RECT = koffi.struct("UMC_RECT", { left: "int32_t", top: "int32_t", right: "int32_t", bottom: "int32_t" });
    api.GetWindowRect = user32.func("int __stdcall GetWindowRect(intptr_t hWnd, _Out_ UMC_RECT *lpRect)");
    try {
      // Cloaked windows (other virtual desktops, suspended Store apps) count as visible but aren't shown.
      const dwm = koffi.load("dwmapi.dll");
      api.DwmGetWindowAttribute = dwm.func("int32_t __stdcall DwmGetWindowAttribute(intptr_t hwnd, uint32_t attr, _Out_ uint32_t *value, uint32_t size)");
      // The window's visible frame, without the invisible resize borders GetWindowRect includes.
      api.DwmGetFrameBounds = dwm.func("int32_t __stdcall DwmGetWindowAttribute(intptr_t hwnd, uint32_t attr, _Out_ UMC_RECT *value, uint32_t size)");
    } catch (_) {}
    void RECT;
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

const HWND_TOP = 0, HWND_TOPMOST = -1, HWND_NOTOPMOST = -2;
const SWP_NOSIZE = 0x0001, SWP_NOMOVE = 0x0002, SWP_NOZORDER = 0x0004, SWP_NOACTIVATE = 0x0010;

// handle: the Buffer from BrowserWindow.getNativeWindowHandle(). Electron's own setAlwaysOnTop
// doesn't take on the transparent mini panel, so the companion sets WS_EX_TOPMOST itself.
// Returns true when Windows accepted the change.
function handleValue(handle) {
  if (!Buffer.isBuffer(handle)) return null;
  if (handle.length >= 8) return handle.readBigInt64LE(0);
  if (handle.length >= 4) return handle.readInt32LE(0);
  return null;
}

function setTopmost(handle, on) {
  if (!load()) return false;
  const hwnd = handleValue(handle);
  if (hwnd == null || hwnd === 0n || hwnd === 0) return false;
  try {
    return !!api.SetWindowPos(hwnd, on ? HWND_TOPMOST : HWND_NOTOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
  } catch (_) {
    return false;
  }
}

const GW_HWNDNEXT = 2, GW_HWNDPREV = 3, GW_OWNER = 4;
const GWL_EXSTYLE = -20, WS_EX_TOPMOST = 0x8, WS_EX_TOOLWINDOW = 0x80;
const DWMWA_CLOAKED = 14;

const isTopmost = (hwnd) => (api.GetWindowLongW(hwnd, GWL_EXSTYLE) & WS_EX_TOPMOST) !== 0;
function isCloaked(hwnd) {
  if (!api.DwmGetWindowAttribute) return false;
  const v = [0];
  return api.DwmGetWindowAttribute(hwnd, DWMWA_CLOAKED, v, 4) === 0 && v[0] !== 0;
}

// The app windows on screen, in stacking order (top first): visible, not cloaked, not owned by
// another window and not tool windows. Each: { hwnd, pid, exe, title, minimized }.
function listWindows() {
  if (!load()) return [];
  const out = [];
  try {
    let h = api.GetTopWindow(0);
    for (let i = 0; h && i < 2000; i++, h = api.GetWindow(h, GW_HWNDNEXT)) {
      if (!api.IsWindowVisible(h) || api.GetWindow(h, GW_OWNER)) continue;
      if (api.GetWindowLongW(h, GWL_EXSTYLE) & WS_EX_TOOLWINDOW) continue;
      if (isCloaked(h)) continue;
      const pid = new Uint32Array(1);
      api.GetWindowThreadProcessIdI(h, pid);
      const tbuf = Buffer.alloc(1024);
      const n = api.GetWindowTextWI(h, tbuf, 512);
      out.push({ hwnd: h, pid: pid[0], exe: pid[0] ? exeOf(pid[0]) : null, title: n > 0 ? tbuf.toString("utf16le", 0, n * 2) : "", minimized: !!api.IsIconic(h) });
    }
  } catch (_) {}
  return out;
}

// Puts our window directly above `target` in the stacking order (not always on top), without
// activating it. Does nothing when it's already there. Returns true when it is (or now is) there.
function placeAbove(handle, target) {
  if (!load()) return false;
  const hwnd = handleValue(handle);
  if (hwnd == null || !target) return false;
  const self = Number(hwnd);
  try {
    // The nearest visible window above the target: our window when nothing needs to change.
    let prev = api.GetWindow(target, GW_HWNDPREV);
    while (prev && prev !== self && !api.IsWindowVisible(prev)) prev = api.GetWindow(prev, GW_HWNDPREV);
    if (prev === self && !isTopmost(self)) return true;
    if (isTopmost(self)) api.SetWindowPos(self, HWND_NOTOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
    // Right after the window above the target. When that is an always-on-top window (or there is
    // none), the target is the highest normal window, so go to the top of the normal windows.
    const above = api.GetWindow(target, GW_HWNDPREV);
    const after = above && above !== self && !isTopmost(above) ? above : HWND_TOP;
    return !!api.SetWindowPos(self, after, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
  } catch (_) {
    return false;
  }
}

const DWMWA_EXTENDED_FRAME_BOUNDS = 9;

// A window's rectangle in physical screen pixels, as { x, y, w, h }. visible: the frame you see
// (app windows have invisible resize borders around it). handle: a number or our Buffer handle.
function rectOf(handle, visible) {
  if (!load()) return null;
  const hwnd = Buffer.isBuffer(handle) ? Number(handleValue(handle)) : handle;
  if (!hwnd) return null;
  try {
    const r = {};
    const ok = visible && api.DwmGetFrameBounds ? api.DwmGetFrameBounds(hwnd, DWMWA_EXTENDED_FRAME_BOUNDS, r, 16) === 0 : !!api.GetWindowRect(hwnd, r);
    if (!ok && !(visible && api.GetWindowRect(hwnd, r))) return null;
    return { x: r.left, y: r.top, w: r.right - r.left, h: r.bottom - r.top };
  } catch (_) {
    return null;
  }
}

// Moves our window to x, y (physical pixels) without resizing, reordering or activating it.
function moveTo(handle, x, y) {
  if (!load()) return false;
  const hwnd = handleValue(handle);
  if (hwnd == null) return false;
  try {
    return !!api.SetWindowPos(hwnd, 0, Math.round(x), Math.round(y), 0, 0, SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE);
  } catch (_) {
    return false;
  }
}

function available() {
  return !!load();
}

module.exports = { get, available, setTopmost, handleValue, listWindows, placeAbove, rectOf, moveTo, error: () => (load(), loadError) };
