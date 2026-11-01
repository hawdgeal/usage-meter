// Native-messaging host. The browser extension starts it (through usage-meter-host.bat, which runs
// the companion's own executable in Node mode) and keeps it running while the browser is open.
// It relays messages between the extension (stdin/stdout) and the companion app (a named pipe).
// When the companion isn't running, it keeps the latest usage and retries every few seconds.
// stdout carries protocol messages only; nothing else may be written there.
"use strict";
const net = require("net");
const { encode, Decoder, lineReader } = require("./native-messaging");
const { pipePath } = require("./pipe-path");

const RETRY_MS = Number(process.env.USAGE_METER_RETRY_MS) || 3000;
const latest = new Map(); // site -> last usage / usage-error message
let hello = null;
let sock = null;
let closing = false;

function toBrowser(msg) {
  try { process.stdout.write(encode(msg)); } catch (_) {}
}

function toCompanion(msg) {
  if (!sock || sock.destroyed || !sock.writable) return;
  try { sock.write(JSON.stringify(msg) + "\n"); } catch (_) {}
}

function fromBrowser(msg) {
  if (!msg || typeof msg !== "object" || typeof msg.type !== "string") return;
  if (msg.type === "hello") hello = msg;
  else if ((msg.type === "usage" || msg.type === "usage-error") && typeof msg.site === "string") {
    // Keep an error from hiding good data that arrived earlier: replay both, data first.
    const prev = latest.get(msg.site) || {};
    latest.set(msg.site, msg.type === "usage" ? { usage: msg } : { usage: prev.usage, error: msg });
  } else return;
  toCompanion(msg);
}

function connect() {
  if (closing) return;
  const s = net.connect(pipePath());
  s.on("connect", () => {
    sock = s;
    toCompanion({ type: "host-hello", pid: process.pid, browser: hello && hello.browser, extensionVersion: hello && hello.extensionVersion });
    for (const { usage, error } of latest.values()) {
      if (usage) toCompanion(usage);
      if (error) toCompanion(error);
    }
    toBrowser({ type: "companion", connected: true });
  });
  s.on("data", lineReader((msg) => {
    if (msg && msg.type === "refresh") toBrowser({ type: "refresh", site: typeof msg.site === "string" ? msg.site : undefined });
  }));
  s.on("error", () => {});
  s.on("close", () => {
    if (sock === s) { sock = null; toBrowser({ type: "companion", connected: false }); }
    if (!closing) setTimeout(connect, RETRY_MS).unref();
  });
}

const decoder = new Decoder(fromBrowser);
process.stdin.on("data", (c) => decoder.push(c));
process.stdin.on("end", () => { closing = true; if (sock) sock.end(); setTimeout(() => process.exit(0), 200).unref(); });
process.stdin.on("error", () => process.exit(0));
process.stdout.on("error", () => process.exit(0));

// Keep the process alive while stdin is open, even when the pipe is down.
setInterval(() => {}, 1 << 30);
connect();
