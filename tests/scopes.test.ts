import assert from "node:assert/strict";import test from "node:test";import {validateWriteGrant} from "../src/policies/scopes.js";
test("rejects unbounded write authority",()=>assert.throws(()=>validateWriteGrant({agentId:"a",repository:"r",surfaces:["."]},[])));
test("rejects overlapping writers even when they belong to different sessions",()=>assert.throws(()=>validateWriteGrant({agentId:"b",repository:"r",surfaces:["src/core"],isolationKey:"session-b"},[{agentId:"a",repository:"r",surfaces:["src"],isolationKey:"session-a"}]),/Overlapping writer authority/));
test("allows writers with disjoint surfaces or distinct repository roots",()=>{assert.doesNotThrow(()=>validateWriteGrant({agentId:"b",repository:"r",surfaces:["docs"]},[{agentId:"a",repository:"r",surfaces:["src"]}]));assert.doesNotThrow(()=>validateWriteGrant({agentId:"b",repository:"worktree-b",surfaces:["src"]},[{agentId:"a",repository:"worktree-a",surfaces:["src"]}]));});
test("rejects traversal and NUL surfaces",()=>{assert.throws(()=>validateWriteGrant({agentId:"a",repository:"r",surfaces:["src/../secret"]},[]),/Invalid/);assert.throws(()=>validateWriteGrant({agentId:"a",repository:"r",surfaces:["src/\0x"]},[]),/Invalid/);});
test("write scopes must be canonical workspace-relative paths",()=>{
 for(const surface of ["/etc/passwd","C:\\Users\\admin","\\\\server\\share","./src","src/./owned.ts"," src/file.ts","src/file.ts "]){
  assert.throws(()=>validateWriteGrant({agentId:"a",repository:"r",surfaces:[surface]},[]),/Invalid write surface/);
 }
 assert.throws(()=>validateWriteGrant({agentId:"a",repository:"r",surfaces:[42 as unknown as string]},[]),/Invalid write surface/);
 assert.throws(()=>validateWriteGrant({agentId:" ",repository:"r",surfaces:["src/file.ts"]},[]),/Invalid write grant/);
});
test("write grant validation fails closed on malformed active authorities",()=>{
 const next={agentId:"new",repository:"r",surfaces:["src/new.ts"]};
 for(const active of [null,[null],[{agentId:" ",repository:"r",surfaces:["src"]}],[{agentId:"old",repository:"r",surfaces:[]}],[{agentId:"old",repository:"r",surfaces:["../secret"]}]]){
  assert.throws(()=>validateWriteGrant(next,active as never));
 }
});
test("normalizes windows separators before overlap check",()=>assert.throws(()=>validateWriteGrant({agentId:"b",repository:"r",surfaces:["src/core"]},[{agentId:"a",repository:"r",surfaces:["src\\core\\x"]}])));
