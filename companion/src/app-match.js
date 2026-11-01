// Decides which usage to show from the window in front: its executable and title.
// Returns "claude", "chatgpt", "codex", "self" (one of our own windows) or null (unrelated app).
"use strict";

const APPS = { "claude.exe": "claude", "chatgpt.exe": "chatgpt", "codex.exe": "codex" };
const BROWSERS = new Set(["chrome.exe", "msedge.exe", "firefox.exe", "brave.exe", "opera.exe", "vivaldi.exe", "arc.exe", "chromium.exe", "zen.exe", "librewolf.exe", "floorp.exe"]);
const TERMINALS = new Set(["windowsterminal.exe", "wt.exe", "cmd.exe", "powershell.exe", "pwsh.exe", "conhost.exe", "openconsole.exe", "wezterm-gui.exe", "alacritty.exe", "mintty.exe", "tabby.exe", "hyper.exe", "warp.exe"]);

function base(exe) {
  return String(exe || "").split(/[\\/]/).pop().toLowerCase();
}

function fromTitle(title) {
  const t = String(title || "");
  if (/\bcodex\b/i.test(t)) return "codex";
  if (/\bclaude\b/i.test(t)) return "claude";
  if (/\bchatgpt\b/i.test(t)) return "chatgpt";
  return null;
}

function matchApp(win, opts) {
  if (!win) return null;
  const o = { browsers: true, terminals: true, ...opts };
  const exe = base(win.exe);
  if (o.selfExe && exe === base(o.selfExe)) return "self";
  if (APPS[exe]) return APPS[exe];
  if (o.browsers && BROWSERS.has(exe)) return fromTitle(win.title);
  if (o.terminals && TERMINALS.has(exe)) return fromTitle(win.title);
  return null;
}

// True for the desktop apps themselves (not a browser or terminal window matched by its title).
function isDesktopApp(exe) {
  return !!APPS[base(exe)];
}

module.exports = { matchApp, fromTitle, isDesktopApp };
