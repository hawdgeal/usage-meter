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
    // Mouse and keyboard state, and the window under the cursor (physical pixels).
    koffi.struct("UMC_POINT", { x: "int32_t", y: "int32_t" });
    api.GetCursorPos = user32.func("int __stdcall GetCursorPos(_Out_ UMC_POINT *lpPoint)");
    api.WindowFromPoint = user32.func("intptr_t __stdcall WindowFromPoint(UMC_POINT Point)");
    api.GetAncestor = user32.func("intptr_t __stdcall GetAncestor(intptr_t hwnd, uint32_t gaFlags)");
    api.GetAsyncKeyState = user32.func("int16_t __stdcall GetAsyncKeyState(int vKey)");
    // Reading a pixel from the screen (for the color picker).
    api.GetDC = user32.func("intptr_t __stdcall GetDC(intptr_t hWnd)");
    api.ReleaseDC = user32.func("int __stdcall ReleaseDC(intptr_t hWnd, intptr_t hDC)");
    const gdi32 = koffi.load("gdi32.dll");
    api.GetPixel = gdi32.func("uint32_t __stdcall GetPixel(intptr_t hdc, int x, int y)");
    // Drawing another app's window into memory (for docking to its sidebar).
    api.PrintWindow = user32.func("int __stdcall PrintWindow(intptr_t hwnd, intptr_t hdcBlt, uint32_t nFlags)");
    api.CreateCompatibleDC = gdi32.func("intptr_t __stdcall CreateCompatibleDC(intptr_t hdc)");
    api.CreateCompatibleBitmap = gdi32.func("intptr_t __stdcall CreateCompatibleBitmap(intptr_t hdc, int cx, int cy)");
    api.SelectObject = gdi32.func("intptr_t __stdcall SelectObject(intptr_t hdc, intptr_t h)");
    api.DeleteObject = gdi32.func("int __stdcall DeleteObject(intptr_t h)");
    api.DeleteDC = gdi32.func("int __stdcall DeleteDC(intptr_t hdc)");
    api.GetDIBits = gdi32.func("int __stdcall GetDIBits(intptr_t hdc, intptr_t hbm, uint32_t start, uint32_t lines, void *bits, void *bmi, uint32_t usage)");
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

// The app windows on screen, in stacking order (top first): visible, not cloaked, not tool windows,
// and not owned by another window of the same program (its dialogs and pop-ups). A window owned by
// another program counts: tab tools such as WindowTabs make each grouped app window owned by one of
// theirs. Each: { hwnd, pid, exe, title, minimized } (minimized also covers windows parked off-screen,
// as some tab tools do with inactive tabs).
function listWindows() {
  if (!load()) return [];
  const out = [];
  const pidOf = (w) => { const p = new Uint32Array(1); api.GetWindowThreadProcessIdI(w, p); return p[0]; };
  try {
    let h = api.GetTopWindow(0);
    for (let i = 0; h && i < 2000; i++, h = api.GetWindow(h, GW_HWNDNEXT)) {
      if (!api.IsWindowVisible(h)) continue;
      if (api.GetWindowLongW(h, GWL_EXSTYLE) & WS_EX_TOOLWINDOW) continue;
      if (isCloaked(h)) continue;
      const pid = pidOf(h);
      const owner = api.GetWindow(h, GW_OWNER);
      if (owner && pidOf(owner) === pid) continue;
      const tbuf = Buffer.alloc(1024);
      const n = api.GetWindowTextWI(h, tbuf, 512);
      const r = {};
      const parked = api.GetWindowRect(h, r) && (r.left <= -30000 || r.top <= -30000);
      out.push({ hwnd: h, pid, exe: pid ? exeOf(pid) : null, title: n > 0 ? tbuf.toString("utf16le", 0, n * 2) : "", minimized: !!api.IsIconic(h) || !!parked });
    }
  } catch (_) {}
  return out;
}

// Tab tools keep their own windows (tab bars) right above the app window they group, and put the
// app back under them if anything slips in between. So their windows above an app count as part of it.
const TAB_TOOLS = new Set(["groupyctrl.exe", "groupy.exe", "windowtabs.exe", "tidytabs.exe", "tidytabs.daemon.exe"]);
const exeBase = (exe) => String(exe || "").split(/[\\/]/).pop().toLowerCase();
function isTabTool(h) {
  const p = new Uint32Array(1);
  api.GetWindowThreadProcessIdI(h, p);
  return !!p[0] && TAB_TOOLS.has(exeBase(exeOf(p[0])));
}
// The highest window of the app's group: the app window itself, or a tab tool's window stacked
// directly above it (skipping hidden windows and `self`).
function groupTop(target, self) {
  let top = target;
  for (let h = api.GetWindow(target, GW_HWNDPREV), i = 0; h && i < 50; h = api.GetWindow(h, GW_HWNDPREV), i++) {
    if (h === self || !api.IsWindowVisible(h)) continue;
    if (!isTabTool(h)) break;
    top = h;
  }
  return top;
}

// Puts our window directly above `target` in the stacking order (not always on top), without
// activating it; above a tab tool's bar when one sits on the app. Does nothing when it's already
// there. Returns true when it is (or now is) there.
function placeAbove(handle, app) {
  if (!load()) return false;
  const hwnd = handleValue(handle);
  if (hwnd == null || !app) return false;
  const self = Number(hwnd);
  try {
    const target = groupTop(app, self);
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

const VK_LBUTTON = 0x01, VK_RBUTTON = 0x02, VK_ESCAPE = 0x1b, GA_ROOT = 2;
const isDown = (vk) => (api.GetAsyncKeyState(vk) & 0x8000) !== 0;

// Where the pointer is and what's held: { x, y (physical pixels), button, escape, hwnd (the
// top-level window under the pointer), exe, title }.
function pointer() {
  if (!load()) return null;
  try {
    const p = {};
    if (!api.GetCursorPos(p)) return null;
    const child = api.WindowFromPoint(p);
    const hwnd = child ? api.GetAncestor(child, GA_ROOT) : 0;
    let exe = null, title = "";
    if (hwnd) {
      const pid = new Uint32Array(1);
      api.GetWindowThreadProcessIdI(hwnd, pid);
      exe = pid[0] ? exeOf(pid[0]) : null;
      const tbuf = Buffer.alloc(1024);
      const n = api.GetWindowTextWI(hwnd, tbuf, 512);
      title = n > 0 ? tbuf.toString("utf16le", 0, n * 2) : "";
    }
    return { x: p.x, y: p.y, button: isDown(VK_LBUTTON) || isDown(VK_RBUTTON), escape: isDown(VK_ESCAPE), hwnd, exe, title };
  } catch (_) {
    return null;
  }
}

// The top-level window at x, y (physical pixels), as a number; 0 if none.
function windowAt(x, y) {
  if (!load()) return 0;
  try {
    const child = api.WindowFromPoint({ x: Math.round(x), y: Math.round(y) });
    return child ? Number(api.GetAncestor(child, GA_ROOT)) : 0;
  } catch (_) {
    return 0;
  }
}

// The color on screen at x, y (physical pixels), as "#rrggbb"; null if it can't be read.
function pixelAt(x, y) {
  if (!load()) return null;
  let dc = 0;
  try {
    dc = api.GetDC(0);
    const c = api.GetPixel(dc, Math.round(x), Math.round(y));
    if (c === 0xffffffff) return null; // CLR_INVALID: outside every screen
    return "#" + [c & 0xff, (c >> 8) & 0xff, (c >> 16) & 0xff].map((n) => n.toString(16).padStart(2, "0")).join("");
  } catch (_) {
    return null;
  } finally {
    if (dc) api.ReleaseDC(0, dc);
  }
}

// Draws a window (even when other windows cover it) into memory. Returns { x, y, w, h, data }:
// the window's rectangle in physical pixels (with its invisible borders) and its pixels as BGRA rows,
// top to bottom. null if it can't. PW_RENDERFULLCONTENT is needed for Chromium-based apps.
const PW_RENDERFULLCONTENT = 2;
function capture(hwnd) {
  if (!load() || !api.PrintWindow) return null;
  const r = rectOf(hwnd, false);
  if (!r || r.w <= 0 || r.h <= 0 || r.w > 10000 || r.h > 10000) return null;
  let screenDc = 0, dc = 0, bmp = 0, old = 0;
  try {
    screenDc = api.GetDC(0);
    dc = api.CreateCompatibleDC(screenDc);
    bmp = api.CreateCompatibleBitmap(screenDc, r.w, r.h);
    old = api.SelectObject(dc, bmp);
    if (!api.PrintWindow(hwnd, dc, PW_RENDERFULLCONTENT)) return null;
    api.SelectObject(dc, old); old = 0;
    const bmi = Buffer.alloc(44);
    bmi.writeUInt32LE(40, 0); bmi.writeInt32LE(r.w, 4); bmi.writeInt32LE(-r.h, 8); // top-down rows
    bmi.writeUInt16LE(1, 12); bmi.writeUInt16LE(32, 14);
    const data = Buffer.alloc(r.w * r.h * 4);
    if (!api.GetDIBits(dc, bmp, 0, r.h, data, bmi, 0)) return null;
    return { ...r, data };
  } catch (_) {
    return null;
  } finally {
    if (old) api.SelectObject(dc, old);
    if (bmp) api.DeleteObject(bmp);
    if (dc) api.DeleteDC(dc);
    if (screenDc) api.ReleaseDC(0, screenDc);
  }
}

function available() {
  return !!load();
}

module.exports = { get, available, setTopmost, handleValue, listWindows, placeAbove, rectOf, moveTo, pointer, windowAt, pixelAt, capture, error: () => (load(), loadError) };
