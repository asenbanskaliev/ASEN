import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { evaluateExecutionSurface, EXTERNAL_FALLBACK_PROHIBITED } from "../src/security/execution-surface-guard.js";

describe("execution-surface-guard", () => {
 it("passes when input is not an object", () => {
  assert.equal(evaluateExecutionSurface("bash", undefined), undefined);
  assert.equal(evaluateExecutionSurface("bash", null), undefined);
  assert.equal(evaluateExecutionSurface("bash", "string"), undefined);
  assert.equal(evaluateExecutionSurface("bash", 42), undefined);
 });

 it("passes when property is absent", () => {
  assert.equal(evaluateExecutionSurface("bash", { command: "ls" }), undefined);
  assert.equal(evaluateExecutionSurface("write", { path: "/tmp/x" }), undefined);
 });

 it("passes when property is exactly false", () => {
  assert.equal(evaluateExecutionSurface("bash", { openProjectPaneIfMissing: false }), undefined);
 });

 it("blocks when property is true", () => {
  const result = evaluateExecutionSurface("bash", { openProjectPaneIfMissing: true });
  assert.ok(result);
  assert.equal(result.block, true);
  assert.ok(result.reason.includes(EXTERNAL_FALLBACK_PROHIBITED));
  assert.ok(result.reason.includes("tool=bash"));
 });

 it("fails closed for non-boolean truthy values", () => {
  for (const value of ["true", 1, "", [], {}, "false"]) {
   const result = evaluateExecutionSurface("edit", { openProjectPaneIfMissing: value });
   assert.ok(result, `Expected block for value ${JSON.stringify(value)}`);
   assert.equal(result.block, true);
  }
 });

 it("fails closed for non-boolean falsy non-false values", () => {
  // 0 and "" are not === false, so they fail closed
  const zero = evaluateExecutionSurface("edit", { openProjectPaneIfMissing: 0 });
  assert.ok(zero);
  assert.equal(zero.block, true);
 });

 it("does not inspect nested options.openProjectPaneIfMissing", () => {
  // Only own property matters; nested is not a bypass vector
  assert.equal(evaluateExecutionSurface("bash", { options: { openProjectPaneIfMissing: true } }), undefined);
 });

 it("reason never leaks input paths or content", () => {
  const result = evaluateExecutionSurface("write", {
   openProjectPaneIfMissing: true,
   path: "/secret/credentials.json",
   content: "API_KEY=sk-12345",
  });
  assert.ok(result);
  assert.ok(!result.reason.includes("/secret"));
  assert.ok(!result.reason.includes("credentials"));
  assert.ok(!result.reason.includes("API_KEY"));
  assert.ok(!result.reason.includes("sk-12345"));
 });

 it("includes remediation guidance in reason", () => {
  const result = evaluateExecutionSurface("bash", { openProjectPaneIfMissing: true });
  assert.ok(result);
  assert.ok(result.reason.includes("next="));
  assert.ok(result.reason.includes("subagent"));
 });
});
