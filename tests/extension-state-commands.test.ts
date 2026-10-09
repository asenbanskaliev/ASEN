import assert from "node:assert/strict";import test from "node:test";import {mkdtemp} from "node:fs/promises";import {tmpdir} from "node:os";import path from "node:path";import {createAsenExtension} from "../extensions/asen.js";import {writeProfilesFile} from "../src/runtime/profile-store.js";import {ASEN_PROFILES_SCHEMA} from "../src/runtime/profiles.js";
function host(){const commands=new Map<string,{handler:(...args:any[])=>unknown}>();return {commands,pi:{registerCommand:(n:string,c:any)=>commands.set(n,c)}};}
test("state commands compose existing runtime projections without inventing data",async()=>{const d=await mkdtemp(path.join(tmpdir(),"asen-state-")),f=path.join(d,"profiles.json");await writeProfilesFile(f,{schema:ASEN_PROFILES_SCHEMA,active:"main",profiles:[{name:"main",routes:{}}]});const h=host();createAsenExtension({profilesFile:f,agents:()=>[],changes:()=>[]})(h.pi);assert.deepEqual(await h.commands.get("asen-profiles")!.handler(),{active:"main",profiles:["main"],available:true});assert.deepEqual(h.commands.get("asen-agents")!.handler(),[]);assert.deepEqual(h.commands.get("asen-changes")!.handler(),[]);});
test("state commands fail closed when providers are absent",async()=>{const h=host();createAsenExtension()(h.pi);assert.equal((await h.commands.get("asen-profiles")!.handler() as any).available,false);assert.match((h.commands.get("asen-agents")!.handler() as string[])[0]!,/unavailable/);assert.match((h.commands.get("asen-changes")!.handler() as string[])[0]!,/unavailable/);});
test("public data commands publish their result through the Pi UI",async()=>{
 const h=host();createAsenExtension()(h.pi);
 for(const name of ["asen","asen-commands","asen-status","asen-doctor","asen-agents","asen-changes","asen-profiles"]){
  const messages:string[]=[];
  const result=await h.commands.get(name)!.handler("",{ui:{notify:(message:string)=>messages.push(message)}});
  assert.equal(messages.length,1,`${name} must publish exactly one result`);
  assert.equal(messages[0],typeof result==="string"?result:Array.isArray(result)&&result.every(x=>typeof x==="string")?result.join("\n"):JSON.stringify(result,null,2));
 }
});
