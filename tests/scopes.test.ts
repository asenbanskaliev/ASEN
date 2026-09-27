import assert from "node:assert/strict";
import test from "node:test";
import { validateWriteGrant } from "../src/policies/scopes.js";

test("rejects unbounded write authority", () => {
  assert.throws(() => validateWriteGrant({agentId:"a",repository:"r",surfaces:["."]}, []));
});

test("rejects overlapping writers without isolation", () => {
  assert.throws(() => validateWriteGrant(
    {agentId:"b",repository:"r",surfaces:["src/core"]},
    [{agentId:"a",repository:"r",surfaces:["src"]}]
  ));
});

test("allows isolated writers", () => {
  assert.doesNotThrow(() => validateWriteGrant(
    {agentId:"b",repository:"r",surfaces:["src"],isolationKey:"worktree-b"},
    [{agentId:"a",repository:"r",surfaces:["src"],isolationKey:"worktree-a"}]
  ));
});
