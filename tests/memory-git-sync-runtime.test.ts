import assert from "node:assert/strict";
import test from "node:test";
import {assembleMemorySync,missingMemorySyncParts,planMemorySync} from "../src/memory/git-sync.js";

test("memory sync resumes missing parts and reconstructs exactly",()=>{
 const value={version:1,projectId:"project-a",observations:[{id:"1",content:"alpha"},{id:"2",content:"beta"}],relations:[],summaries:[]};
 const {plan,parts}=planMemorySync("project-a",value,17);
 assert.ok(parts.length>1);
 const received=new Map(parts.filter(part=>part.index!==1).map(part=>[part.index,part.text]));
 assert.deepEqual(missingMemorySyncParts(plan,received),[1]);
 assert.throws(()=>assembleMemorySync(plan,received),/Incomplete memory sync/);
 received.set(1,parts[1]!.text);
 assert.deepEqual(missingMemorySyncParts(plan,received),[]);
 assert.deepEqual(assembleMemorySync(plan,received),value);
 assert.deepEqual(assembleMemorySync(plan,received),value);
});

test("memory sync rejects corrupted received parts",()=>{
 const value={projectId:"project-a",payload:"x".repeat(100)};
 const {plan,parts}=planMemorySync("project-a",value,20);
 const received=new Map(parts.map(part=>[part.index,part.text]));
 received.set(0,received.get(0)!+"corrupt");
 assert.deepEqual(missingMemorySyncParts(plan,received),[0]);
 assert.throws(()=>assembleMemorySync(plan,received),/Incomplete memory sync/);
});

test("memory sync validates project and chunk size",()=>{
 assert.throws(()=>planMemorySync(" ",{},10),/projectId is required/);
 assert.throws(()=>planMemorySync("project-a",{},0),/maxChars must be positive/);
});
