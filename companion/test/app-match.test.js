"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { matchApp } = require("../src/app-match");

const w = (exe, title) => ({ exe, title });

test("desktop apps by executable", () => {
  assert.strictEqual(matchApp(w("C:\\Users\\me\\AppData\\Local\\AnthropicClaude\\app-1.0\\claude.exe", "Claude")), "claude");
  assert.strictEqual(matchApp(w("C:\\Program Files\\WindowsApps\\OpenAI.ChatGPT-Desktop\\app\\ChatGPT.exe", "ChatGPT")), "chatgpt");
  assert.strictEqual(matchApp(w("C:\\x\\Codex.exe", "Codex")), "codex");
});

test("browsers and terminals by title, and only when allowed", () => {
  assert.strictEqual(matchApp(w("C:\\x\\chrome.exe", "Trip ideas - Claude - Google Chrome")), "claude");
  assert.strictEqual(matchApp(w("C:\\x\\msedge.exe", "ChatGPT - Profile 1 - Microsoft Edge")), "chatgpt");
  assert.strictEqual(matchApp(w("C:\\x\\chrome.exe", "Inbox - Gmail - Google Chrome")), null);
  assert.strictEqual(matchApp(w("C:\\x\\WindowsTerminal.exe", "✳ Claude Code")), "claude");
  assert.strictEqual(matchApp(w("C:\\x\\WindowsTerminal.exe", "codex - repo")), "codex");
  assert.strictEqual(matchApp(w("C:\\x\\chrome.exe", "Claude"), { browsers: false }), null);
  assert.strictEqual(matchApp(w("C:\\x\\pwsh.exe", "claude"), { terminals: false }), null);
});

test("our own windows and unrelated apps", () => {
  assert.strictEqual(matchApp(w("C:\\Apps\\Usage Meter Companion.exe", ""), { selfExe: "C:\\Apps\\Usage Meter Companion.exe" }), "self");
  assert.strictEqual(matchApp(w("C:\\Windows\\explorer.exe", "")), null);
  assert.strictEqual(matchApp(w("C:\\x\\notepad.exe", "claude notes.txt - Notepad")), null);
  assert.strictEqual(matchApp(null), null);
});
