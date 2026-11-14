import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
 createLanguageAnchorState, humanLanguageExcerpt,
 tailIdentity, isAutomatedMessage, isPassiveMessage, recordHumanInput,
 generateLanguageAnchor
} from "../src/runtime/reply-language-anchor.js";

describe("humanLanguageExcerpt", () => {
 it("collapses whitespace and trims", () => {
  assert.equal(humanLanguageExcerpt("  hello   world  "), "hello world");
 });
 it("truncates at maxChars with ellipsis", () => {
  const long = "a".repeat(200);
  const result = humanLanguageExcerpt(long, 100);
  assert.ok(result.endsWith("…"));
  assert.ok(result.length <= 101);
 });
 it("returns full text when under limit", () => {
  assert.equal(humanLanguageExcerpt("short"), "short");
 });
});

describe("isAutomatedMessage", () => {
 it("assistant role is automated", () => {
  assert.ok(isAutomatedMessage({ role: "assistant" }));
 });
 it("system role is automated", () => {
  assert.ok(isAutomatedMessage({ role: "system" }));
 });
 it("customType is automated", () => {
  assert.ok(isAutomatedMessage({ role: "user", customType: "asen.background.result" }));
 });
 it("System-generated prefix is automated", () => {
  assert.ok(isAutomatedMessage({ role: "user", content: "[System-generated notice]" }));
 });
 it("plain user message is not automated", () => {
  assert.ok(!isAutomatedMessage({ role: "user", content: "hello" }));
 });
});

describe("isPassiveMessage", () => {
 it("todo-state is passive", () => {
  assert.ok(isPassiveMessage({ customType: "gentle-todo-state" }));
 });
 it("anchor itself is passive", () => {
  assert.ok(isPassiveMessage({ content: "[Harness note, not written by the human] Reply language: test" }));
 });
 it("normal message is not passive", () => {
  assert.ok(!isPassiveMessage({ content: "hello" }));
 });
});

describe("recordHumanInput", () => {
 it("records valid input", () => {
  const state = createLanguageAnchorState();
  recordHumanInput(state, "hola mundo");
  assert.equal(state.humanText, "hola mundo");
 });
 it("ignores commands", () => {
  const state = createLanguageAnchorState();
  recordHumanInput(state, "/asen-status");
  assert.equal(state.humanText, undefined);
 });
 it("ignores shell commands", () => {
  const state = createLanguageAnchorState();
  recordHumanInput(state, "!ls");
  assert.equal(state.humanText, undefined);
 });
 it("clears anchors on new input", () => {
  const state = createLanguageAnchorState();
  state.anchors.set("key", "value");
  recordHumanInput(state, "new text");
  assert.equal(state.anchors.size, 0);
 });
});

describe("generateLanguageAnchor", () => {
 it("returns undefined without human text", () => {
  const state = createLanguageAnchorState();
  assert.equal(generateLanguageAnchor(state, [{ role: "assistant" }]), undefined);
 });
 it("returns undefined for empty messages", () => {
  const state = createLanguageAnchorState();
  recordHumanInput(state, "hola");
  assert.equal(generateLanguageAnchor(state, []), undefined);
 });
 it("returns undefined when tail is human", () => {
  const state = createLanguageAnchorState();
  recordHumanInput(state, "hola");
  assert.equal(generateLanguageAnchor(state, [{ role: "user", content: "hola" }]), undefined);
 });
 it("generates anchor when tail is automated", () => {
  const state = createLanguageAnchorState();
  recordHumanInput(state, "hola mundo");
  const anchor = generateLanguageAnchor(state, [{ role: "assistant", content: "response" }]);
  assert.ok(anchor);
  assert.ok(anchor.includes("hola mundo"));
  assert.ok(anchor.includes("[Harness note"));
 });
 it("skips passive messages to find automated tail", () => {
  const state = createLanguageAnchorState();
  recordHumanInput(state, "test");
  const msgs = [
   { role: "assistant", content: "response" },
   { customType: "gentle-todo-state", content: "state" },
  ];
  const anchor = generateLanguageAnchor(state, msgs);
  assert.ok(anchor); // assistant is the last non-passive automated msg
 });
 it("does not duplicate anchors for same tail", () => {
  const state = createLanguageAnchorState();
  recordHumanInput(state, "test");
  const msgs = [{ role: "assistant", content: "response", timestamp: "t1" }];
  const first = generateLanguageAnchor(state, msgs);
  assert.ok(first);
  const second = generateLanguageAnchor(state, msgs);
  assert.equal(second, undefined);
 });
 it("regenerates after new human input", () => {
  const state = createLanguageAnchorState();
  recordHumanInput(state, "first");
  const msgs = [{ role: "assistant", content: "r1", timestamp: "t1" }];
  generateLanguageAnchor(state, msgs);
  recordHumanInput(state, "second");
  const anchor = generateLanguageAnchor(state, msgs);
  assert.ok(anchor);
  assert.ok(anchor.includes("second"));
 });
});

describe("tailIdentity", () => {
 it("produces unique keys for different positions", () => {
  const a = tailIdentity("assistant", undefined, "t1", 0);
  const b = tailIdentity("assistant", undefined, "t1", 1);
  assert.notEqual(a, b);
 });
});
