import assert from "node:assert/strict";
import test from "node:test";
import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {createAsenExtension} from "../extensions/asen.js";
import {writeProfilesFile} from "../src/runtime/lifecycle/profile-store.js";
import {ASEN_PROFILES_SCHEMA} from "../src/runtime/lifecycle/profiles.js";

test("E1B: Pi lee el modo del perfil capturado y bloquea la escritura directa del padre",async t=>{
 const home=await mkdtemp(path.join(tmpdir(),"asen-e1-delegacion-"));
 const profilesFile=path.join(home,".asen","profiles.json");
 await writeProfilesFile(profilesFile,{schema:ASEN_PROFILES_SCHEMA,active:"delegado",
  profiles:[{name:"delegado",mode:"full-delegation",routes:{}}]});
 const events=new Map<string,Array<(event:any,ctx:any)=>unknown>>();
 const pi={
  on(name:string,fn:(event:any,ctx:any)=>unknown){events.set(name,[...(events.get(name)??[]),fn]);},
  registerCommand(){},registerTool(){},
 };
 createAsenExtension({
  homeDir:()=>home,profilesFile,
  enableAgentRuntime:false,enableTodoRuntime:false,enableMemoryRuntime:false,enableWorkspaceRuntime:false,
 })(pi as any);
 let session="delegada";
 const ctx:any={cwd:home,mode:"rpc",hasUI:true,
  sessionManager:{getSessionId:()=>session,getEntries:()=>[]},
  ui:{notify(){},setWidget(){},setStatus(){},confirm:async()=>false},
 };
 t.after(async()=>{
  try{for(const handler of events.get("session_shutdown")??[])await handler({},ctx);}
  finally{await rm(home,{recursive:true,force:true,maxRetries:10,retryDelay:100});}
 });
 for(const h of events.get("session_start")??[])await h({reason:"new"},ctx);
 const policy=(events.get("tool_call")??[])[0];assert.ok(policy);
 const attempt=()=>policy({type:"tool_call",toolCallId:"write-parent",toolName:"write",
  input:{path:"src/a.ts",content:"cambio"}},ctx);
 const blocked=await attempt() as {block?:boolean;reason?:string};
 assert.equal(blocked?.block,true);
 assert.match(blocked.reason??"",/full delegation/u);
 // Una edición del perfil global no modifica silenciosamente la selección capturada.
 await writeProfilesFile(profilesFile,{schema:ASEN_PROFILES_SCHEMA,active:"delegado",
  profiles:[{name:"delegado",mode:"organic",routes:{}}]});
 assert.equal((await attempt() as {block?:boolean})?.block,true);
 // La nueva sesión puede utilizar el perfil actualizado.
 session="organica";
 for(const h of events.get("session_start")??[])await h({reason:"new"},ctx);
 const organic=await attempt() as {block?:boolean}|undefined;
 assert.equal(organic?.block,undefined);
});
