import assert from "node:assert/strict";import test from "node:test";import {mkdtemp,realpath,rm} from "node:fs/promises";import {tmpdir} from "node:os";import path from "node:path";import {createAsenExtension} from "../extensions/asen.js";import {writeProfilesFile} from "../src/runtime/profile-store.js";import {ASEN_PROFILES_SCHEMA} from "../src/runtime/profiles.js";import {SessionTodoStore} from "../src/runtime/todo-store.js";
function host(){const commands=new Map<string,{handler:(...args:any[])=>unknown}>();return {commands,pi:{registerCommand:(n:string,c:any)=>commands.set(n,c)}};}
test("state commands compose existing runtime projections without inventing data",async()=>{const d=await mkdtemp(path.join(tmpdir(),"asen-state-")),f=path.join(d,"profiles.json");await writeProfilesFile(f,{schema:ASEN_PROFILES_SCHEMA,active:"main",profiles:[{name:"main",routes:{}}]});const h=host();createAsenExtension({profilesFile:f,agents:()=>[],changes:()=>[]})(h.pi);assert.deepEqual(await h.commands.get("asen-profiles")!.handler(),{active:"main",profiles:["main"],available:true});assert.deepEqual(await h.commands.get("asen-agents")!.handler(),[]);assert.deepEqual(await h.commands.get("asen-changes")!.handler(),[]);});
test("state commands fail closed when providers are absent",async()=>{const h=host();createAsenExtension()(h.pi);assert.equal((await h.commands.get("asen-profiles")!.handler() as any).available,false);assert.match((await h.commands.get("asen-agents")!.handler() as string[])[0]!,/unavailable/);assert.match((await h.commands.get("asen-changes")!.handler() as string[])[0]!,/unavailable/);});
test("asen-todos shows only the active session and project with bounded state and recovery reason",async t=>{
 const root=await mkdtemp(path.join(tmpdir(),"asen-todos-ui-"));t.after(()=>rm(root,{recursive:true,force:true}));const store=await SessionTodoStore.open(path.join(root,"todos.json")),project=await realpath(process.cwd());
 const own=await store.add("Inspect active project",{sessionId:"session-ui",projectId:project}),foreign=await store.add("Foreign task",{sessionId:"other-session",projectId:project});await store.update(own.taskId,{sessionId:"session-ui",projectId:project},1,"running");await store.recover({sessionId:"session-ui",projectId:project});
 const h=host();createAsenExtension({todoStoreFactory:async()=>store})(h.pi);const messages:string[]=[],rows=await h.commands.get("asen-todos")!.handler("",{cwd:process.cwd(),sessionManager:{getSessionId:()=>"session-ui"},ui:{notify:(message:string)=>messages.push(message)}}) as string[];
 assert.equal(rows.length,1);assert.match(rows[0]!,/blocked.*Inspect active project.*explicit review/i);assert.ok(!rows.join("\n").includes(foreign.taskId));assert.deepEqual(messages,[rows.join("\n")]);
});
test("public data commands publish their result through the Pi UI",async()=>{
 const h=host();createAsenExtension()(h.pi);
 for(const name of ["asen","asen-commands","asen-status","asen-doctor","asen-agents","asen-changes","asen-todos","asen-profiles"]){
  const messages:string[]=[];
  const result=await h.commands.get(name)!.handler("",{ui:{notify:(message:string)=>messages.push(message)}});
  assert.equal(messages.length,1,`${name} must publish exactly one result`);
  assert.equal(messages[0],typeof result==="string"?result:Array.isArray(result)&&result.every(x=>typeof x==="string")?result.join("\n"):JSON.stringify(result,null,2));
 }
});
