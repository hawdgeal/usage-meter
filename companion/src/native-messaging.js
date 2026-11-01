// Browser native-messaging framing: each message is a 32-bit little-endian length followed by
// that many bytes of UTF-8 JSON. Used by host.js and the tests.
"use strict";

const MAX_TO_BROWSER = 1024 * 1024; // browsers reject larger host → extension messages
const MAX_FROM_BROWSER = 64 * 1024 * 1024; // sanity limit for extension → host messages

function encode(message) {
  const body = Buffer.from(JSON.stringify(message), "utf8");
  if (body.length > MAX_TO_BROWSER) throw new Error(`message too large (${body.length} bytes)`);
  const head = Buffer.alloc(4);
  head.writeUInt32LE(body.length, 0);
  return Buffer.concat([head, body]);
}

// Collects stdin chunks and calls onMessage for every complete message. Bad JSON is skipped.
class Decoder {
  constructor(onMessage, onError) {
    this.buf = Buffer.alloc(0);
    this.onMessage = onMessage;
    this.onError = onError || (() => {});
  }
  push(chunk) {
    this.buf = this.buf.length ? Buffer.concat([this.buf, chunk]) : chunk;
    while (this.buf.length >= 4) {
      const size = this.buf.readUInt32LE(0);
      if (size > MAX_FROM_BROWSER) {
        this.onError(new Error(`message too large (${size} bytes)`));
        this.buf = Buffer.alloc(0);
        return;
      }
      if (this.buf.length < 4 + size) return;
      const body = this.buf.subarray(4, 4 + size);
      this.buf = this.buf.subarray(4 + size);
      let msg;
      try { msg = JSON.parse(body.toString("utf8")); } catch (e) { this.onError(e); continue; }
      this.onMessage(msg);
    }
  }
}

// Newline-delimited JSON, used on the pipe between host.js and the companion app.
function lineReader(onMessage) {
  let rest = "";
  return (chunk) => {
    rest += chunk.toString("utf8");
    let i;
    while ((i = rest.indexOf("\n")) >= 0) {
      const line = rest.slice(0, i).trim();
      rest = rest.slice(i + 1);
      if (!line) continue;
      try { onMessage(JSON.parse(line)); } catch (_) { /* skip bad line */ }
    }
    if (rest.length > 16 * 1024 * 1024) rest = "";
  };
}

module.exports = { encode, Decoder, lineReader, MAX_TO_BROWSER };
