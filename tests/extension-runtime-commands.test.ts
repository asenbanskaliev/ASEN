import assert from "node:assert/strict";import test from "node:test";import {createAsenExtension} from "../extensions/asen.js";import authority from "../extensions/authority.js";import {implementedCommands} from "../src/runtime/command-catalog.js";
import {mkdir,mkdtemp,readFile,rm,writeFile} from "node:fs/promises";import {tmpdir} from "node:os";import path from "node:path";
function host(){const commands=new Map<string,{handler:(...args:any[])=>unknown}>();return {commands,pi:{registerCommand:(name:string,c:any)=>commands.set(name,c),on:()=>{}}};}
test("status, doctor and command inventory are wired fail-closed",async()=>{const h=host();createAsenExtension({status:()=>({agents:[],changes:[],skills:{enabled:true,count:2},historyEnabled:false,telemetryEnabled:false}),doctor:()=>({piVersionOk:true,homeWritable:true,registryAvailable:true,profileValid:true,historyPrivate:true,telemetryConsentValid:true})})(h.pi);assert.match(((await h.commands.get("asen-status")!.handler()) as string[])[0]!,/profile/);assert.equal(((await h.commands.get("asen-doctor")!.handler()) as any).exitCode,0);assert.ok((h.commands.get("asen-commands")!.handler() as any[]).some(x=>x.name==="asen-status"&&x.implemented));authority(h.pi as any);assert.deepEqual([...h.commands.keys()].sort(),[...implementedCommands(),"asen-task-agents"].sort());});
test("status and doctor compose local state while reporting unconfigured runtimes",async t=>{
 const root=await mkdtemp(path.join(tmpdir(),"asen-local-diagnostics-"));t.after(()=>rm(root,{recursive:true,force:true}));
 const h=host();createAsenExtension({homeDir:()=>root,packageRoot:root})(h.pi);
 const status=await h.commands.get("asen-status")!.handler(undefined,{cwd:root,ui:{notify(){},confirm:async()=>false},sessionManager:{getSessionId:()=>"session-one"}}) as string[];
 assert.ok(status.includes("agents: unavailable"));assert.ok(status.includes("workspace changes: unavailable"));assert.ok(status.includes("skills: unavailable"));assert.ok(status.includes("history: disabled (opt-in)"));
 const healthy=await h.commands.get("asen-doctor")!.handler() as {exitCode:number;checks:{name:string;state:string}[]};assert.equal(healthy.exitCode,0);assert.equal(healthy.checks.find(c=>c.name==="skill-registry")?.state,"warn");
 await mkdir(path.join(root,".asen"),{recursive:true,mode:0o700});await writeFile(path.join(root,".asen","profiles.json"),"{invalid");
 const broken=await h.commands.get("asen-doctor")!.handler() as {exitCode:number;checks:{name:string;state:string}[]};assert.equal(broken.exitCode,1);assert.equal(broken.checks.find(c=>c.name==="profiles")?.state,"fail");
});
test("registry diagnostics stay project-bound and clear stale success after refresh failure",async t=>{
 const root=await mkdtemp(path.join(tmpdir(),"asen-registry-status-"));t.after(()=>rm(root,{recursive:true,force:true}));const firstProject=path.join(root,"first"),secondProject=path.join(root,"second");await Promise.all([mkdir(firstProject),mkdir(secondProject)]);
 let calls=0;const fake={path:"/registry",count:3,cache:"hit" as const,persistence:{status:"unavailable" as const},entries:[],skipped:[]};const h=host();createAsenExtension({homeDir:()=>root,packageRoot:root,refresh:async()=>{calls++;if(calls===2)throw new Error("refresh failed");return fake;}})(h.pi);
 const context=(cwd:string)=>({cwd,ui:{notify(){},confirm:async()=>false},sessionManager:{getSessionId:()=>"session-one"}}),registry=h.commands.get("asen-skill-registry")!,status=h.commands.get("asen-status")!,doctor=h.commands.get("asen-doctor")!;
 await registry.handler("refresh",context(firstProject));assert.ok((await status.handler(undefined,context(firstProject)) as string[]).includes("skills: enabled (3)"));
 assert.ok((await status.handler(undefined,context(secondProject)) as string[]).includes("skills: unavailable"));assert.equal(((await doctor.handler(undefined,context(secondProject)) as any).checks.find((c:any)=>c.name==="skill-registry")).state,"warn");
 await assert.rejects(async()=>await registry.handler("refresh",context(firstProject)),/refresh failed/);assert.ok((await status.handler(undefined,context(firstProject)) as string[]).includes("skills: unavailable"));assert.equal(((await doctor.handler(undefined,context(firstProject)) as any).checks.find((c:any)=>c.name==="skill-registry")).state,"warn");
});
test("status and doctor reject overly broad private-state directory permissions",async t=>{
 if(process.platform==="win32"){t.skip("POSIX private-directory modes are unavailable on Windows");return;}
 const root=await mkdtemp(path.join(tmpdir(),"asen-diagnostics-permissions-"));t.after(()=>rm(root,{recursive:true,force:true}));const store=path.join(root,".asen");await mkdir(store,{mode:0o755});
 const h=host();createAsenExtension({homeDir:()=>root,packageRoot:root})(h.pi);const context={cwd:root,ui:{notify(){},confirm:async()=>false},sessionManager:{getSessionId:()=>"session-one"}};
 await assert.rejects(async()=>await h.commands.get("asen-status")!.handler(undefined,context),/not safe to read/);
 const result=await h.commands.get("asen-doctor")!.handler() as {exitCode:number;checks:{name:string;state:string}[]};assert.equal(result.exitCode,1);assert.equal(result.checks.find(c=>c.name==="history-privacy")?.state,"fail");assert.equal(result.checks.find(c=>c.name==="telemetry-consent")?.state,"fail");
});
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
