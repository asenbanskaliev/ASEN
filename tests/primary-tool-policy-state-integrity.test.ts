import assert from "node:assert/strict";
import test from "node:test";
import {mkdir,readFile,rm,stat,writeFile} from "node:fs/promises";
import {mkdtemp} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {createPrimaryToolPolicyHandler} from "../src/security/primary-tool-policy.js";

const event=(toolName:string,input:Record<string,unknown>,toolCallId="call-1")=>({type:"tool_call",toolCallId,toolName,input}) as any;
const context=(cwd:string,overrides:Record<string,unknown>={})=>({cwd,mode:"rpc",hasUI:true,signal:new AbortController().signal,sessionManager:{getSessionId:()=>"state-integrity-test",getSessionFile:()=>undefined},ui:{confirm:async()=>true},...overrides}) as any;
async function invoke(policy:any,call:any,ctx:any,execute:()=>Promise<void>|void){const decision=await policy(call,ctx);if(!decision?.block)await execute();return decision;}
async function scratch(t:any,prefix:string){const root=await mkdtemp(path.join(tmpdir(),prefix));t.after(()=>rm(root,{recursive:true,force:true}));return root;}

// ASEN runtime state is human-owned: a model tool may read it, never mutate it.
test("project .asen state cannot be mutated by write or edit and shows zero side effects",async t=>{
 const root=await scratch(t,"asen-state-integrity-");
 await mkdir(path.join(root,".asen"),{recursive:true});
 const todos=path.join(root,".asen","todos.json");
 await writeFile(todos,"{\"items\":[]}\n");
 let executions=0;const policy=createPrimaryToolPolicyHandler();
 for(const toolName of ["write","edit"]){
  const decision=await invoke(policy,event(toolName,{path:path.join(".asen","todos.json")},`state-${toolName}`),context(root),async()=>{executions++;await writeFile(todos,"{\"items\":[{\"state\":\"completed\"}]}\n");});
  assert.equal(decision?.block,true,toolName);
  assert.match(decision?.reason??"",/human-owned ASEN state/,toolName);
 }
 assert.equal(executions,0);
 assert.equal(await readFile(todos,"utf8"),"{\"items\":[]}\n");
});

test("nested project .asen paths are blocked while reads stay available",async t=>{
 const root=await scratch(t,"asen-state-nested-");
 const nested=path.join(root,".asen","receipts");
 await mkdir(nested,{recursive:true});
 await writeFile(path.join(nested,"candidate.json"),"{\"verdict\":\"PASSED\"}\n");
 const policy=createPrimaryToolPolicyHandler();
 const blocked=await invoke(policy,event("write",{path:path.join(".asen","receipts","candidate.json")}),context(root),async()=>{throw new Error("state write executed");});
 assert.equal(blocked?.block,true);
 const readDecision=await policy(event("read",{path:path.join(".asen","receipts","candidate.json")}),context(root));
 assert.equal(readDecision,undefined);
 assert.equal(await readFile(path.join(nested,"candidate.json"),"utf8"),"{\"verdict\":\"PASSED\"}\n");
});

test(".asen traversal spellings cannot reach protected state",async t=>{
 const root=await scratch(t,"asen-state-traversal-");
 await mkdir(path.join(root,".asen"),{recursive:true});
 await writeFile(path.join(root,".asen","rdd-policy.json"),"{\"schema\":\"x\"}\n");
 const policy=createPrimaryToolPolicyHandler();
 for(const spelling of ["./.asen/rdd-policy.json",".asen/../.asen/rdd-policy.json","sub/../.asen/rdd-policy.json"]){
  await mkdir(path.join(root,"sub"),{recursive:true});
  const decision=await invoke(policy,event("write",{path:spelling},`traversal-${spelling}`),context(root),async()=>{throw new Error(`state write executed via ${spelling}`);});
  assert.equal(decision?.block,true,spelling);
 }
 assert.equal(await readFile(path.join(root,".asen","rdd-policy.json"),"utf8"),"{\"schema\":\"x\"}\n");
});

test("configured home state directory is protected even when cwd is elsewhere",async t=>{
 const home=await scratch(t,"asen-state-home-");
 const worktree=await scratch(t,"asen-state-worktree-");
 await mkdir(path.join(home,".asen"),{recursive:true});
 await writeFile(path.join(home,".asen","agents.json"),"{\"agents\":[]}\n");
 const policy=createPrimaryToolPolicyHandler({protectedStateDirs:[path.join(home,".asen")]});
 const decision=await invoke(policy,event("write",{path:path.join(home,".asen","agents.json")},`home-${Date.now()}`),context(worktree),async()=>{throw new Error("home state write executed");});
 assert.equal(decision?.block,true);
 assert.match(decision?.reason??"",/human-owned ASEN state/);
 assert.equal(await readFile(path.join(home,".asen","agents.json"),"utf8"),"{\"agents\":[]}\n");
});

test("similarly named sibling directories and ordinary project files are not over-blocked",async t=>{
 const root=await scratch(t,"asen-state-sibling-");
 await mkdir(path.join(root,".asen-backup"),{recursive:true});
 const sibling=path.join(root,".asen-backup","todos.json");
 await writeFile(sibling,"before\n");
 const ordinary=path.join(root,"notes.md");
 await writeFile(ordinary,"before\n");
 const policy=createPrimaryToolPolicyHandler();
 const siblingDecision=await invoke(policy,event("write",{path:path.join(".asen-backup","todos.json")}),context(root),async()=>{await writeFile(sibling,"after\n");});
 assert.equal(siblingDecision,undefined);
 const ordinaryDecision=await invoke(policy,event("write",{path:"notes.md"}),context(root),async()=>{await writeFile(ordinary,"after\n");});
 assert.equal(ordinaryDecision,undefined);
 assert.equal(await readFile(sibling,"utf8"),"after\n");
 assert.equal(await readFile(ordinary,"utf8"),"after\n");
 assert.equal((await stat(path.join(root,".asen-backup"))).isDirectory(),true);
});
