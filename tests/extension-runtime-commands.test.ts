import assert from "node:assert/strict";import test from "node:test";import {createAsenExtension} from "../extensions/asen.js";import authority from "../extensions/authority.js";import {implementedCommands} from "../src/runtime/command-catalog.js";
import {mkdtemp,readFile,rm} from "node:fs/promises";import {tmpdir} from "node:os";import path from "node:path";
function host(){const commands=new Map<string,{handler:(...args:any[])=>unknown}>();return {commands,pi:{registerCommand:(name:string,c:any)=>commands.set(name,c),on:()=>{}}};}
test("status, doctor and command inventory are wired fail-closed",()=>{const h=host();createAsenExtension({status:()=>({agents:[],changes:[],skills:{enabled:true,count:2},historyEnabled:false,telemetryEnabled:false}),doctor:()=>({piVersionOk:true,homeWritable:true,registryAvailable:true,profileValid:true,historyPrivate:true,telemetryConsentValid:true})})(h.pi);assert.match((h.commands.get("asen-status")!.handler() as string[])[0]!,/profile/);assert.equal((h.commands.get("asen-doctor")!.handler() as any).exitCode,0);assert.ok((h.commands.get("asen-commands")!.handler() as any[]).some(x=>x.name==="asen-status"&&x.implemented));authority(h.pi as any);assert.deepEqual([...h.commands.keys()].sort(),implementedCommands().sort());});
test("doctor does not invent health when diagnostics are absent",()=>{const h=host();createAsenExtension()(h.pi);assert.equal((h.commands.get("asen-doctor")!.handler() as any).exitCode,1);});
test("Pi history capture is opt-in, redacted, project-scoped and usage stays local",async t=>{
 const root=await mkdtemp(path.join(tmpdir(),"asen-history-pi-"));t.after(()=>rm(root,{recursive:true,force:true}));
 const commands=new Map<string,{handler:(...args:any[])=>any}>(),events=new Map<string,(...args:any[])=>any>(),notices:string[]=[];let allow=false;
 const pi={registerCommand:(name:string,command:any)=>commands.set(name,command),on:(name:string,handler:any)=>events.set(name,handler),registerFlag(){},getFlag(){return false;}};
 createAsenExtension({homeDir:()=>root,packageRoot:root})(pi);
 const context:any={cwd:root,hasUI:true,ui:{notify:(message:string)=>notices.push(message),confirm:async()=>allow},sessionManager:{getSessionId:()=>"session-one"}};
 await events.get("session_start")!({},context);
 assert.equal(JSON.parse((await commands.get("asen-usage")!.handler("show",context)).toString()).sessions,1);
 assert.match(await commands.get("asen-history")!.handler("enable",context),/remains disabled/);allow=true;assert.match(await commands.get("asen-history")!.handler("enable",context),/enabled/);
 await events.get("input")!({text:"password=private-value hello",source:"interactive"},context);
 const file=await readFile(path.join(root,".asen","history.json"),"utf8");assert.doesNotMatch(file,/private-value/);assert.match(await commands.get("asen-history")!.handler("search hello",context),/REDACTED/);
 assert.match(await commands.get("asen-usage")!.handler("telemetry preview",context),/nothing sent/);assert.ok(notices.length>0);
 await events.get("session_shutdown")!({},context);
});
