import assert from "node:assert/strict";import test from "node:test";import {validateWriteGrant} from "../src/policies/scopes.js";
test("rejects unbounded write authority",()=>assert.throws(()=>validateWriteGrant({agentId:"a",repository:"r",surfaces:["."]},[])));
test("rejects overlapping writers without isolation",()=>assert.throws(()=>validateWriteGrant({agentId:"b",repository:"r",surfaces:["src/core"]},[{agentId:"a",repository:"r",surfaces:["src"]}])));
test("allows isolated writers",()=>assert.doesNotThrow(()=>validateWriteGrant({agentId:"b",repository:"r",surfaces:["src"],isolationKey:"b"},[{agentId:"a",repository:"r",surfaces:["src"],isolationKey:"a"}])));
test("rejects traversal and NUL surfaces",()=>{assert.throws(()=>validateWriteGrant({agentId:"a",repository:"r",surfaces:["src/../secret"]},[]),/Invalid/);assert.throws(()=>validateWriteGrant({agentId:"a",repository:"r",surfaces:["src/\0x"]},[]),/Invalid/);});
test("normalizes windows separators before overlap check",()=>assert.throws(()=>validateWriteGrant({agentId:"b",repository:"r",surfaces:["src/core"]},[{agentId:"a",repository:"r",surfaces:["src\\core\\x"]}])));
