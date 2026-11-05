// Updates from GitHub releases (github.com/hawdgeal/usage-meter, public). check() reads the latest
// release and finds its companion zip; install() downloads and unpacks it, then a small PowerShell
// script waits for the companion to quit, copies the new files over the app folder and starts it
// again. Works for the zip and for the installer's per-user folder.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFile } = require("child_process");
const { app, net } = require("electron");

const REPO = "hawdgeal/usage-meter";
const ASSET = /^usage-meter-companion-(\d+\.\d+\.\d+)-win-x64\.zip$/i;
const EXE = "UsageMeterCompanion.exe";

// -1, 0 or 1, comparing "0.2.14" with "0.2.9" by numbers.
function compare(a, b) {
  const x = String(a).split(".").map(Number), y = String(b).split(".").map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d > 0 ? 1 : -1; }
  return 0;
}

// The companion version and download in a release (its tag is the extension's version).
function fromRelease(rel) {
  for (const a of (rel && rel.assets) || []) {
    const m = ASSET.exec(a.name || "");
    if (m) return { version: m[1], url: a.browser_download_url, size: a.size, name: a.name, page: rel.html_url, title: rel.name || rel.tag_name };
  }
  return null;
}

// { current, latest: {version, url, size, page, title} | null, available }
async function check() {
  const r = await net.fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { Accept: "application/vnd.github+json", "User-Agent": "usage-meter-companion" } });
  if (!r.ok) throw new Error(`GitHub answered ${r.status}`);
  const latest = fromRelease(await r.json());
  const current = app.getVersion();
  return { current, latest, available: !!latest && compare(latest.version, current) > 0, checkedAt: Date.now() };
}

// The folder the companion runs from must be writable for an update.
function appDir() { return path.dirname(process.execPath); }
function canInstall() {
  if (!app.isPackaged || process.platform !== "win32") return { ok: false, why: "Updates only work in the installed app." };
  try { fs.accessSync(appDir(), fs.constants.W_OK); return { ok: true }; } catch (_) { return { ok: false, why: `The app's folder (${appDir()}) isn't writable.` }; }
}

const ps = (args) => new Promise((resolve, reject) => execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", ...args], { windowsHide: true }, (e, out, err) => (e ? reject(new Error(String(err || e.message).trim().slice(0, 300))) : resolve(out))));

// Downloads and unpacks the update, then hands over to the script that swaps the files; the app
// quits right after. progress(fraction) while downloading.
async function install(latest, progress) {
  const can = canInstall();
  if (!can.ok) throw new Error(can.why);
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "umc-update-"));
  const zip = path.join(work, latest.name || "update.zip");
  const r = await net.fetch(latest.url, { headers: { "User-Agent": "usage-meter-companion" } });
  if (!r.ok || !r.body) throw new Error(`Download failed (${r.status})`);
  const total = Number(r.headers.get("content-length")) || latest.size || 0;
  const out = fs.createWriteStream(zip);
  let got = 0;
  const reader = r.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    got += value.length;
    if (!out.write(Buffer.from(value))) await new Promise((res) => out.once("drain", res));
    if (progress && total) progress(Math.min(1, got / total));
  }
  await new Promise((res, rej) => out.end((e) => (e ? rej(e) : res())));
  if (latest.size && got !== latest.size) throw new Error("The download is incomplete. Try again.");
  const dir = path.join(work, "app");
  await ps(["-Command", `Expand-Archive -LiteralPath '${zip.replace(/'/g, "''")}' -DestinationPath '${dir.replace(/'/g, "''")}' -Force`]);
  if (!fs.existsSync(path.join(dir, EXE))) throw new Error("The download doesn't contain the app.");

  // The swap: wait for this app to quit, stop the browsers' helper copies of the exe (they
  // reconnect on their own within a minute), copy the files with retries, start the new version.
  const script = path.join(work, "swap.ps1");
  fs.writeFileSync(script, [
    "param($pid0, $src, $dst, $exe, $log)",
    "function Log($m) { Add-Content -LiteralPath $log -Value ((Get-Date -Format s) + ' ' + $m) }",
    "Log 'waiting for the app to quit'",
    "try { Wait-Process -Id $pid0 -Timeout 30 -ErrorAction Stop } catch {}",
    "$ok = $false",
    "for ($i = 0; $i -lt 20 -and -not $ok; $i++) {",
    "  Get-Process -Name 'UsageMeterCompanion' -ErrorAction SilentlyContinue | Where-Object { $_.Path -and $_.Path.StartsWith($dst, [StringComparison]::OrdinalIgnoreCase) } | Stop-Process -Force -ErrorAction SilentlyContinue",
    "  Start-Sleep -Milliseconds 700",
    "  robocopy $src $dst /E /R:2 /W:1 /NFL /NDL /NJH /NJS /NP | Out-Null",
    "  if ($LASTEXITCODE -lt 8) { $ok = $true } else { Log \"copy failed ($LASTEXITCODE), retrying\" }",
    "}",
    "Log ('copied: ' + $ok)",
    "Start-Process -FilePath (Join-Path $dst $exe)",
    "Start-Sleep 5",
    "Remove-Item -LiteralPath (Split-Path $src) -Recurse -Force -ErrorAction SilentlyContinue",
  ].join("\r\n"), "utf8");
  const log = path.join(app.getPath("userData"), "update.log");
  // Started through Start-Process, not spawn({ detached: true }): a detached powershell.exe has
  // no console and exits at once without running the script, so the app quit and never came back.
  // Start-Process gives it its own hidden console and outlives this app; if it fails, this throws
  // and the app stays open with the error instead of quitting.
  await ps(["-Command", swapLaunchCommand(script, { pid0: process.pid, src: dir, dst: appDir(), exe: EXE, log })]);
}

// The PowerShell command that starts swap.ps1 in its own hidden window. Each value goes into
// -ArgumentList in double quotes (paths can hold spaces; Windows paths can't hold "), and the
// whole list is a single-quoted PowerShell string.
function swapLaunchCommand(script, params) {
  const args = ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden", "-File", `"${script}"`];
  for (const [k, v] of Object.entries(params)) args.push(`-${k}`, `"${String(v)}"`);
  const list = args.join(" ").replace(/'/g, "''");
  return `Start-Process -FilePath powershell.exe -WindowStyle Hidden -ArgumentList '${list}'`;
}

module.exports = { check, install, canInstall, compare, fromRelease, swapLaunchCommand };
