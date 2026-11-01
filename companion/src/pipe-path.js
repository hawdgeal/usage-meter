// Where the companion app listens for native hosts: a per-user named pipe on Windows,
// a socket file elsewhere (development and tests). USAGE_METER_PIPE overrides it.
"use strict";
const os = require("os");
const path = require("path");

function pipePath() {
  if (process.env.USAGE_METER_PIPE) return process.env.USAGE_METER_PIPE;
  let user = "user";
  try { user = os.userInfo().username || user; } catch (_) {}
  const safe = user.replace(/[^A-Za-z0-9_.-]/g, "_");
  return process.platform === "win32"
    ? `\\\\.\\pipe\\usage-meter-companion-${safe}`
    : path.join(os.tmpdir(), `usage-meter-companion-${safe}.sock`);
}

module.exports = { pipePath };
