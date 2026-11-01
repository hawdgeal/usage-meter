// The companion side of the pipe: each running browser's native host connects here and sends
// usage as newline-delimited JSON. Refresh requests go back the same way.
"use strict";
const fs = require("fs");
const net = require("net");
const { EventEmitter } = require("events");
const { lineReader } = require("./native-messaging");
const { pipePath } = require("./pipe-path");

class Bridge extends EventEmitter {
  constructor() {
    super();
    this.hosts = new Map(); // socket -> { browser, extensionVersion, since, lastAt }
    this.server = null;
  }

  start() {
    const where = pipePath();
    if (process.platform !== "win32") { try { fs.unlinkSync(where); } catch (_) {} }
    return new Promise((resolve, reject) => {
      const server = net.createServer((sock) => this._accept(sock));
      server.once("error", reject);
      server.listen(where, () => { server.removeListener("error", reject); server.on("error", () => {}); this.server = server; resolve(where); });
    });
  }

  _accept(sock) {
    const info = { browser: null, extensionVersion: null, since: Date.now(), lastAt: null };
    this.hosts.set(sock, info);
    sock.setEncoding("utf8");
    sock.on("data", lineReader((msg) => {
      if (!msg || typeof msg !== "object") return;
      if (msg.browser) info.browser = String(msg.browser).slice(0, 40);
      if (msg.extensionVersion) info.extensionVersion = String(msg.extensionVersion).slice(0, 20);
      if (msg.type === "usage") info.lastAt = Date.now();
      if (msg.type !== "host-hello") this.emit("message", msg, info);
      this.emit("hosts");
    }));
    const drop = () => { if (this.hosts.delete(sock)) this.emit("hosts"); };
    sock.on("close", drop);
    sock.on("error", drop);
    this.emit("hosts");
  }

  list() {
    return [...this.hosts.values()].map((h) => ({ ...h }));
  }

  // Ask every connected browser to fetch fresh usage. Returns how many were asked.
  refresh(site) {
    let n = 0;
    for (const sock of this.hosts.keys()) {
      try { sock.write(JSON.stringify({ type: "refresh", site }) + "\n"); n++; } catch (_) {}
    }
    return n;
  }

  stop() {
    for (const sock of this.hosts.keys()) sock.destroy();
    if (this.server) this.server.close();
  }
}

module.exports = { Bridge };
