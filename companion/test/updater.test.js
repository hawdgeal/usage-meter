"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFile } = require("child_process");
const { compare, fromRelease, swapLaunchCommand } = require("../src/updater");

test("versions compare by number, not as text", () => {
  assert.strictEqual(compare("0.2.14", "0.2.9"), 1);
  assert.strictEqual(compare("0.2.9", "0.2.14"), -1);
  assert.strictEqual(compare("0.3.0", "0.3.0"), 0);
  assert.strictEqual(compare("1.0", "0.9.9"), 1);
});

test("finds the companion zip and its version in a release", () => {
  const rel = { tag_name: "v0.5.4", name: "Usage Meter 0.5.4", html_url: "https://github.com/x/y/releases/tag/v0.5.4", assets: [
    { name: "Usage-Meter-v0.5.4.zip", browser_download_url: "https://a/ext.zip", size: 10 },
    { name: "usage-meter-companion-0.2.14-win-x64.zip", browser_download_url: "https://a/c.zip", size: 99 },
  ] };
  assert.deepStrictEqual(fromRelease(rel), { version: "0.2.14", url: "https://a/c.zip", size: 99, name: "usage-meter-companion-0.2.14-win-x64.zip", page: rel.html_url, title: "Usage Meter 0.5.4" });
  assert.strictEqual(fromRelease({ assets: [{ name: "other.zip" }] }), null);
});

test("the swap script is started with Start-Process, each value quoted", () => {
  const cmd = swapLaunchCommand("C:\\Temp\\umc-update-x\\swap.ps1", { pid0: 42, dst: "C:\\Users\\a\\Usage Meter\\companion", log: "C:\\Users\\o'brien\\update.log" });
  assert.strictEqual(cmd, "Start-Process -FilePath powershell.exe -WindowStyle Hidden -ArgumentList '-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File \"C:\\Temp\\umc-update-x\\swap.ps1\" -pid0 \"42\" -dst \"C:\\Users\\a\\Usage Meter\\companion\" -log \"C:\\Users\\o''brien\\update.log\"'");
});

// The real thing on Windows: the started script must run even though the PowerShell that started
// it has exited (a detached spawn exited without running it, so updates never restarted the app).
test("the swap script runs after the launcher exits", { skip: process.platform !== "win32" }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "umc test it's "));
  const script = path.join(dir, "swap.ps1");
  const log = path.join(dir, "out dir", "update.log");
  fs.mkdirSync(path.dirname(log));
  fs.writeFileSync(script, "param($pid0, $log)\r\nAdd-Content -LiteralPath $log -Value \"ran $pid0\"", "utf8");
  await new Promise((res, rej) => execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", swapLaunchCommand(script, { pid0: 7, log })], { windowsHide: true }, (e) => (e ? rej(e) : res())));
  for (let i = 0; i < 100 && !fs.existsSync(log); i++) await new Promise((r) => setTimeout(r, 100));
  assert.strictEqual(fs.readFileSync(log, "utf8").trim(), "ran 7");
  fs.rmSync(dir, { recursive: true, force: true });
});
