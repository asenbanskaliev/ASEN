import assert from "node:assert/strict";import test from "node:test";import {createAsenExtension} from "../extensions/asen.js";import authority from "../extensions/authority.js";import {implementedCommands} from "../src/runtime/command-catalog.js";
import {mkdtemp,readFile,rm,writeFile} from "node:fs/promises";import {tmpdir} from "node:os";import path from "node:path";
function host(){const commands=new Map<string,{handler:(...args:any[])=>unknown}>();return {commands,pi:{registerCommand:(name:string,c:any)=>commands.set(name,c),on:()=>{}}};}
test("status, doctor and command inventory are wired fail-closed",()=>{const h=host();createAsenExtension({status:()=>({agents:[],changes:[],skills:{enabled:true,count:2},historyEnabled:false,telemetryEnabled:false}),doctor:()=>({piVersionOk:true,homeWritable:true,registryAvailable:true,profileValid:true,historyPrivate:true,telemetryConsentValid:true})})(h.pi);assert.match((h.commands.get("asen-status")!.handler() as string[])[0]!,/profile/);assert.equal((h.commands.get("asen-doctor")!.handler() as any).exitCode,0);assert.ok((h.commands.get("asen-commands")!.handler() as any[]).some(x=>x.name==="asen-status"&&x.implemented));authority(h.pi as any);assert.deepEqual([...h.commands.keys()].sort(),[...implementedCommands(),"asen-task-agents"].sort());});
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

test("Pi history selection forwards selector and signal, returns void, and notifies without private row data",async t=>{
 const root=await mkdtemp(path.join(tmpdir(),"asen-history-select-pi-"));t.after(()=>rm(root,{recursive:true,force:true}));
 const commands=new Map<string,{handler:(...args:any[])=>any}>(),events=new Map<string,(...args:any[])=>any>(),notices:string[]=[];
 const pi={registerCommand:(name:string,command:any)=>commands.set(name,command),on:(name:string,handler:any)=>events.set(name,handler),registerFlag(){},getFlag(){return false;}};
 createAsenExtension({homeDir:()=>root,packageRoot:root})(pi);
 const signal=new AbortController().signal;let seenSignal:AbortSignal|undefined,labels:string[]=[];
 const context:any={cwd:root,hasUI:true,signal,ui:{notify:(message:string)=>notices.push(message),confirm:async()=>true,select:async(_title:string,options:string[],opts:{signal?:AbortSignal})=>{labels=options;seenSignal=opts.signal;return options[0];}},sessionManager:{getSessionId:()=>"session-one"}};
 await commands.get("asen-history")!.handler("enable",context);await events.get("input")!({text:"private preview text",source:"interactive"},context);
 const before=await readFile(path.join(root,".asen","history.json"),"utf8"),storedId=JSON.parse(before).entries[0].id;notices.length=0;
 const returned=await commands.get("asen-history")!.handler("select private",context),after=await readFile(path.join(root,".asen","history.json"),"utf8");
 assert.equal(returned,undefined);assert.equal(seenSignal,signal);assert.equal(labels.length,1);assert.match(labels[0]!,new RegExp(storedId));
 assert.deepEqual(notices,["History entry selected."]);assert.doesNotMatch(notices[0]!,new RegExp(`${storedId}|private preview text`));assert.equal(after,before);
});

test("Pi history selection notifications stay generic for every non-success state and failure",async t=>{
 const root=await mkdtemp(path.join(tmpdir(),"asen-history-select-notices-"));t.after(()=>rm(root,{recursive:true,force:true}));
 const commands=new Map<string,{handler:(...args:any[])=>any}>(),events=new Map<string,(...args:any[])=>any>(),notices:string[]=[];
 const pi={registerCommand:(name:string,command:any)=>commands.set(name,command),on:(name:string,handler:any)=>events.set(name,handler),registerFlag(){},getFlag(){return false;}};createAsenExtension({homeDir:()=>root,packageRoot:root})(pi);
 const base:any={cwd:root,hasUI:true,ui:{notify:(message:string)=>notices.push(message),confirm:async()=>true,select:async()=>undefined},sessionManager:{getSessionId:()=>"session-one"}};
 await commands.get("asen-history")!.handler("enable",base);await events.get("input")!({text:"private preview marker",source:"interactive"},base);
 const storePath=path.join(root,".asen","history.json"),valid=await readFile(storePath,"utf8"),id=JSON.parse(valid).entries[0].id;
 notices.length=0;base.ui.select=async()=>{throw new Error("raw selector failure marker");};assert.equal(await commands.get("asen-history")!.handler("select",base),undefined);assert.deepEqual(notices,["ASEN history selection failed."]);
 notices.length=0;base.ui.select=async()=>undefined;assert.equal(await commands.get("asen-history")!.handler("select",base),undefined);assert.deepEqual(notices,["History selection cancelled."]);
 notices.length=0;assert.equal(await commands.get("asen-history")!.handler("select absent-query",base),undefined);assert.deepEqual(notices,["No matching history entries."]);
 await writeFile(storePath,"{malformed private raw marker\n");notices.length=0;assert.equal(await commands.get("asen-history")!.handler("select",{...base,hasUI:false}),undefined);assert.deepEqual(notices,["History selection is unavailable."]);
 notices.length=0;assert.equal(await commands.get("asen-history")!.handler("select",base),undefined);assert.deepEqual(notices,["ASEN history selection failed."]);
 assert.ok(notices.flat().every(message=>message.length<128));assert.doesNotMatch(notices.join("\n"),new RegExp(`${id}|private preview marker|raw selector failure marker|malformed private raw marker`));
});
