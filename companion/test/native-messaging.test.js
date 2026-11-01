"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { encode, Decoder, lineReader } = require("../src/native-messaging");

test("encode writes a little-endian length then JSON", () => {
  const b = encode({ a: "é" });
  assert.strictEqual(b.readUInt32LE(0), b.length - 4);
  assert.deepStrictEqual(JSON.parse(b.subarray(4).toString()), { a: "é" });
});

test("decoder handles messages split across and packed into chunks", () => {
  const got = [];
  const d = new Decoder((m) => got.push(m));
  const all = Buffer.concat([encode({ n: 1 }), encode({ n: 2 }), encode({ n: 3 })]);
  for (let i = 0; i < all.length; i += 5) d.push(all.subarray(i, i + 5));
  assert.deepStrictEqual(got, [{ n: 1 }, { n: 2 }, { n: 3 }]);
});

test("decoder skips bad JSON and keeps going", () => {
  const got = [], errs = [];
  const d = new Decoder((m) => got.push(m), (e) => errs.push(e));
  const bad = Buffer.from("{nope"), head = Buffer.alloc(4);
  head.writeUInt32LE(bad.length);
  d.push(Buffer.concat([head, bad, encode({ ok: true })]));
  assert.deepStrictEqual(got, [{ ok: true }]);
  assert.strictEqual(errs.length, 1);
});

test("encode refuses messages over the browser's 1 MB limit", () => {
  assert.throws(() => encode({ x: "a".repeat(1024 * 1024) }));
});

test("lineReader splits newline-delimited JSON", () => {
  const got = [];
  const push = lineReader((m) => got.push(m));
  push('{"a":1}\n{"b"'); push(':2}\n\nnot json\n');
  assert.deepStrictEqual(got, [{ a: 1 }, { b: 2 }]);
});
