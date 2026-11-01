// End to end: a fake browser talks to host.js over stdin/stdout; the real Bridge listens on the pipe.
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const path = require("path");
const os = require("os");
const fs = require("fs");
const { spawn } = require("child_process");
const { encode, Decoder } = require("../src/native-messaging");
const F = require("./fixtures");

const sock = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "umc-")), "pipe.sock");
process.env.USAGE_METER_PIPE = sock;
const { Bridge } = require("../src/bridge");

const waitFor = (fn, ms = 4000) => new Promise((resolve, reject) => {
  const t0 = Date.now();
  const iv = setInterval(() => {
    const v = fn();
    if (v) { clearInterval(iv); resolve(v); } else if (Date.now() - t0 > ms) { clearInterval(iv); reject(new Error("timeout")); }
  }, 20);
});

function startHost() {
  const child = spawn(process.execPath, [path.join(__dirname, "..", "src", "host.js"), "chrome-extension://abc/", "--parent-window=0"], {
    env: { ...process.env, USAGE_METER_PIPE: sock, USAGE_METER_RETRY_MS: "100" }, stdio: ["pipe", "pipe", "inherit"],
  });
  const out = [];
  const d = new Decoder((m) => out.push(m));
  child.stdout.on("data", (c) => d.push(c));
  return { child, out, send: (m) => child.stdin.write(encode(m)) };
}

test("host relays usage to the companion, refresh back, and replays after a companion restart", async () => {
  // Host starts first, with no companion running: it must keep the data.
  const host = startHost();
  host.send({ type: "hello", extensionVersion: "0.5.0", browser: "Chrome" });
  host.send({ type: "usage", site: "claude", data: F.claude, plan: "Max 5x", at: F.now, source: "tab", browser: "Chrome" });
  host.send({ type: "settings", site: "claude", settings: { preset: "Catppuccin" }, browser: "Chrome" });
  await new Promise((r) => setTimeout(r, 150));

  let bridge = new Bridge();
  let got = [];
  bridge.on("message", (m, info) => got.push({ m, info }));
  await bridge.start();
  const first = await waitFor(() => got.find((g) => g.m.type === "usage"));
  assert.strictEqual(got[0].m.type, "settings"); // settings replay first, so the panel draws with them
  assert.strictEqual(got[0].m.settings.preset, "Catppuccin");
  assert.strictEqual(first.m.site, "claude");
  assert.strictEqual(first.info.browser, "Chrome");
  assert.strictEqual(first.info.extensionVersion, "0.5.0");
  assert.strictEqual(bridge.list().length, 1);
  await waitFor(() => host.out.find((m) => m.type === "companion" && m.connected));

  // Refresh request reaches the browser side.
  assert.strictEqual(bridge.refresh("chatgpt"), 1);
  const r = await waitFor(() => host.out.find((m) => m.type === "refresh"));
  assert.strictEqual(r.site, "chatgpt");

  // Errors pass through, and good data is replayed before them after a restart.
  host.send({ type: "usage-error", site: "claude", message: "Not signed in", at: F.now + 1 });
  await waitFor(() => got.find((g) => g.m.type === "usage-error"));
  bridge.stop();
  await new Promise((r) => setTimeout(r, 100));

  bridge = new Bridge();
  got = [];
  bridge.on("message", (m) => got.push({ m }));
  await bridge.start();
  await waitFor(() => got.length >= 3);
  assert.deepStrictEqual(got.map((g) => g.m.type), ["settings", "usage", "usage-error"]);

  // Browser closes the port: the host exits.
  const exited = new Promise((r) => host.child.on("exit", r));
  host.child.stdin.end();
  assert.strictEqual(await exited, 0);
  bridge.stop();
});

test("host ignores junk from the pipe and only forwards refresh", async () => {
  const bridge = new Bridge();
  await bridge.start();
  const host = startHost();
  await waitFor(() => bridge.list().length === 1);
  for (const s of bridge.hosts.keys()) s.write('garbage\n{"type":"run","cmd":"calc"}\n{"type":"refresh"}\n');
  await waitFor(() => host.out.find((m) => m.type === "refresh"));
  assert.deepStrictEqual(host.out.filter((m) => m.type !== "companion"), [{ type: "refresh" }]);
  host.child.stdin.end();
  bridge.stop();
});
