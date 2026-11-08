import assert from "node:assert/strict";
import test,{type TestContext} from "node:test";
import {mkdir,mkdtemp,readFile,realpath,writeFile,readdir} from "node:fs/promises";
import path from "node:path";
import {createPiExtension} from "../extensions/asen.js";
import {ASEN_PROFILES_SCHEMA,resolveRuntimeRoute,type RouteChoice,type RuntimeProfilesFile} from "../src/runtime/profiles.js";
import {canonicalProfilePartition,readSessionProfile,captureSessionProfile,selectSessionProfile,resetSessionProfile,clearSessionProfiles} from "../src/runtime/session-profile-binding.js";

const profile=(active:string,routes:Record<string,unknown>)=>({schema:ASEN_PROFILES_SCHEMA,active,profiles:[{name:active,routes}]});
const routeFile=(name:string,routes:Record<string,RouteChoice>):RuntimeProfilesFile=>({schema:ASEN_PROFILES_SCHEMA,active:name,profiles:[{name,routes}]});
async function fixture(t:TestContext){
 await mkdir(path.resolve(".cache"),{recursive:true});
 const root=await mkdtemp(path.resolve(".cache/profile-scope-")),home=path.join(root,"home"),project=path.join(root,"project");
 for(const [key,value] of Object.entries({HOME:home,USERPROFILE:home,XDG_CONFIG_HOME:path.join(root,"config"),XDG_CACHE_HOME:path.join(root,"cache"),XDG_DATA_HOME:path.join(root,"data"),TMPDIR:path.join(root,"tmp"),TMP:path.join(root,"tmp"),TEMP:path.join(root,"tmp")})){
  await mkdir(value,{recursive:true});const prior=process.env[key];process.env[key]=value;
  t.after(()=>{if(prior===undefined)delete process.env[key];else process.env[key]=prior;});
 }
 const prior=process.env.ASEN_NO_SKILL_REGISTRY;process.env.ASEN_NO_SKILL_REGISTRY="1";
 t.after(()=>{if(prior===undefined)delete process.env.ASEN_NO_SKILL_REGISTRY;else process.env.ASEN_NO_SKILL_REGISTRY=prior;});
 await mkdir(path.join(home,".asen"));await mkdir(path.join(project,".asen"),{recursive:true});
 const globalFile=path.join(home,".asen","profiles.json"),projectFile=path.join(project,".asen","profiles.json");
 await writeFile(globalFile,JSON.stringify(profile("A",{worker:{model:"private://captured/model",thinking:"low"}})),{flag:"wx"});
 const commands=new Map<string,any>(),events=new Map<string,Function[]>(),notices:string[]=[];let effects=0,id:string|undefined="session-a";
 const pi={on(name:string,fn:Function){events.set(name,[...(events.get(name)??[]),fn]);},registerCommand(name:string,command:any){commands.set(name,command);},registerTool(){},getCommands(){return [];},getAllTools(){return [];},getFlag(){return false;},setModel(){effects++;},sendMessage(){effects++;},setActiveTools(){effects++;}};
 const ctx:any={cwd:project,mode:"tui",hasUI:true,sessionManager:{getSessionId:()=>id},ui:{notify(message:string){notices.push(message);},confirm(){effects++;return false;},setWidget(){},setStatus(){}}};
 createPiExtension({homeDir:()=>home,packageRoot:root,autoAdvancePlans:false,enableAgentRuntime:false,enableTodoRuntime:false,enableWorkspaceRuntime:false,enableMemoryRuntime:false})(pi as any);
 const emit=async(name:string)=>{for(const fn of [...events.get(name)??[]])await fn({},ctx);};
 await emit("session_start");assert.ok(commands.has("asen-profiles"));
 const partition=await canonicalProfilePartition(globalFile),owner={sessionId:"session-a",projectId:await realpath(project)};
 const show=async(args="show")=>{await commands.get("asen-profiles").handler(args,ctx);return JSON.parse(notices.at(-1)!);};
 t.after(()=>assert.equal(effects,0,"No model, dispatch, consent, retry or tool effects"));
 return {root,home,project,globalFile,projectFile,partition,owner,ctx,notices,commands,show,emit,setId(value:string|undefined){id=value;}};
}

test("production show separates saved B, captured A and project C without raw routes or mutations",async t=>{
 const f=await fixture(t);
 await writeFile(f.globalFile,JSON.stringify(profile("B",{worker:{model:"private://saved/model",thinking:"high"}})));
 await writeFile(f.projectFile,JSON.stringify(profile("C",{worker:{model:"private://project/model",thinking:"medium"}})),{flag:"wx"});
 const before=await Promise.all([readFile(f.globalFile,"utf8"),readFile(f.projectFile,"utf8"),readSessionProfile(f.partition,f.owner),readdir(path.dirname(f.globalFile))]);
 const result=await f.show();
 assert.equal(result.projectConfiguration.state,"loaded");assert.equal(result.projectConfiguration.active,"C");
 assert.equal(result.active,"B");assert.deepEqual(result.profiles,["B"]);assert.equal(result.available,true);
 assert.equal(result.savedGlobalProfile.active,"B");assert.equal(result.sessionProfile.active,"A");
 assert.equal(result.sessionProfile.source,"inherited-global");assert.equal(result.sessionProfile.lifetime,"in-process");
 assert.equal(result.sessionProfile.restartDurability,"unproven");assert.equal(result.sessionProfile.frozen,true);
 assert.deepEqual(result.effectiveProfile.routes,[{role:"worker",source:"project",configured:true,model:"configured",thinking:"medium",actual:"unknown"}]);
 assert.equal(result.globalRoles.worker.thinking,"high");assert.equal(result.sessionProfile.roles.worker.thinking,"low");
 assert.equal(result.actual,"unknown");assert.equal(result.parentModel,"unchanged");
 assert.equal(result.fallback,"unsupported");assert.equal(result.cooldown,"unsupported");
 assert.match(result.inherit,/restores captured inheritance.*project can still win/i);
 assert.doesNotMatch(JSON.stringify(result),/private:|session-a|[A-Z]:\\|requested|resolved/);
 assert.deepEqual(await f.show(""),result,"implicit show shares the safe read output");
 assert.deepEqual(await Promise.all([readFile(f.globalFile,"utf8"),readFile(f.projectFile,"utf8"),readSessionProfile(f.partition,f.owner),readdir(path.dirname(f.globalFile))]),before);
});

test("explicit session role wins with project fallback; inherit restores captured A not saved B",async t=>{
 const f=await fixture(t);
 await writeFile(f.globalFile,JSON.stringify(profile("B",{worker:{thinking:"high"}})));
 await writeFile(f.projectFile,JSON.stringify(profile("C",{worker:{thinking:"medium"},explorer:{thinking:"low"}})),{flag:"wx"});
 await f.commands.get("asen-profiles").handler("session B",f.ctx);
 const result=await f.show();assert.equal(result.sessionProfile.source,"explicit-session");
 assert.deepEqual(result.effectiveProfile.routes.map((r:any)=>[r.role,r.source,r.thinking]),[["worker","session","high"],["explorer","project","low"]]);
 await f.commands.get("asen-profiles").handler("session --inherit",f.ctx);
 const restored=await f.show();assert.equal(restored.sessionProfile.active,"A");assert.equal(restored.active,"B");
 assert.equal(restored.effectiveProfile.routes[0].source,"project");
});

for(const state of ["absent","malformed","unreadable"] as const)test(`show distinguishes project ${state} and withholds diagnostics`,async t=>{
 const f=await fixture(t);
 if(state==="malformed")await writeFile(f.projectFile,"{private diagnostic payload",{flag:"wx"});
 if(state==="unreadable")await mkdir(f.projectFile);
 const result=await f.show();assert.equal(result.projectConfiguration.state,state==="absent"?"absent":"unavailable");
 assert.equal(result.effectiveProfile.state,state==="absent"?"available":"unavailable");
 assert.equal(result.sessionProfile.active,"A","project failure must not erase the captured scope");
 if(state==="absent")assert.equal(result.effectiveProfile.routes[0].source,"global");
 else assert.deepEqual(result.effectiveProfile.routes,[]);
 assert.doesNotMatch(JSON.stringify(result),/payload|EISDIR|ENOENT|private:|profiles\.json/);
});

test("missing session or binding stays absent without capture; saved inventory remains inspectable",async t=>{
 const f=await fixture(t);f.setId("uncaptured");
 const owner={...f.owner,sessionId:"uncaptured"};assert.equal(await readSessionProfile(f.partition,owner),undefined);
 const cold=await f.show();assert.equal(cold.sessionProfile.state,"absent");assert.equal(cold.sessionProfile.reason,"not-captured");
 assert.equal(cold.effectiveProfile.state,"unavailable");assert.equal(await readSessionProfile(f.partition,owner),undefined);
 f.setId(undefined);const absent=await f.show();assert.equal(absent.sessionProfile.reason,"no-active-session");assert.equal(absent.active,"A");
 assert.equal(absent.projectConfiguration.state,"absent");
});

for(const drift of ["session","project","manager","abort","shutdown"] as const)test(`show refuses stale publication after ${drift} drift`,async t=>{
 const f=await fixture(t),controller=new AbortController();f.ctx.signal=controller.signal;
 const count=f.notices.length,pending=assert.rejects(f.show(),/Profile inspection cancelled or context changed/);
 if(drift==="session")f.setId("other");
 else if(drift==="project")f.ctx.cwd=f.home;
 else if(drift==="manager")f.ctx.sessionManager={getSessionId:()=>"session-a"};
 else if(drift==="abort")controller.abort();
 else await f.emit("session_shutdown");
 await pending;assert.equal(f.notices.length,count);
});

test("explicit sparse selection does not acquire saved-global routes absent from execution layers",async t=>{
 const f=await fixture(t);
 const saved:RuntimeProfilesFile={schema:ASEN_PROFILES_SCHEMA,active:"B",profiles:[{name:"B",routes:{verifier:{thinking:"high"}}},{name:"sparse",routes:{worker:{thinking:"low"}}}]};
 await writeFile(f.globalFile,JSON.stringify(saved));
 await f.commands.get("asen-profiles").handler("session sparse",f.ctx);
 const captured=await readSessionProfile(f.partition,f.owner);assert.ok(captured);
 const shown=await f.show();
 for(const row of shown.effectiveProfile.routes)assert.equal(row.source,resolveRuntimeRoute({session:captured.file},row.role).source);
 assert.equal(shown.effectiveProfile.routes.find((row:any)=>row.role==="verifier").source,"default");
 assert.equal(shown.globalRoles.verifier.thinking,"high");
});

test("show bounds route output and withholds extra configuration metadata",async t=>{
 const f=await fixture(t),routes=Object.fromEntries(Array.from({length:40},(_,index)=>[`role-${index}`,{model:"https://private.invalid/model",thinking:"low"}]));
 await writeFile(f.projectFile,JSON.stringify({...profile("C",routes),metadata:"PRIVATE metadata",endpoint:"https://private.invalid"}),{flag:"wx"});
 const shown=await f.show();assert.equal(shown.effectiveProfile.routes.length,32);assert.equal(shown.effectiveProfile.limited,true);
 assert.doesNotMatch(JSON.stringify(shown),/PRIVATE|https:|private\.invalid|endpoint|metadata/);
});

test("saved global failure is unavailable, not default, and no raw diagnostic escapes",async t=>{
 const f=await fixture(t);await writeFile(f.globalFile,"{private failure");
 const result=await f.show();assert.equal(result.available,false);assert.equal(result.savedGlobalProfile.state,"unavailable");
 assert.equal(result.effectiveProfile.state,"unavailable");assert.equal(result.sessionProfile.active,"A");
 assert.doesNotMatch(JSON.stringify(result),/private failure|profiles\.json/);
});

// UFC-M3-02: pure precedence over the shipped schema and binding contract. Zero provider calls,
// zero file-system state: every case resolves in memory, as the owner's verification list needs.
test("resolveRuntimeRoute precedence is session over project over global over default",()=>{
 const session=routeFile("s-session",{worker:{thinking:"high"}});
 const project=routeFile("s-project",{worker:{thinking:"medium"},explorer:{thinking:"low"}});
 const global=routeFile("s-global",{worker:{thinking:"low"}});
 assert.deepEqual(resolveRuntimeRoute({session,project,global},"worker"),{choice:{thinking:"high"},source:"session"});
 assert.deepEqual(resolveRuntimeRoute({project,global},"worker"),{choice:{thinking:"medium"},source:"project"});
 assert.deepEqual(resolveRuntimeRoute({global},"worker"),{choice:{thinking:"low"},source:"global"});
 assert.deepEqual(resolveRuntimeRoute({},"worker"),{source:"default"},"Absent layers never fabricate a choice");
 assert.deepEqual(resolveRuntimeRoute({session,project,global},"explorer"),{choice:{thinking:"low"},source:"project"},"A role missing upstream hops exactly one layer down");
 assert.deepEqual(resolveRuntimeRoute({session:{schema:ASEN_PROFILES_SCHEMA,profiles:[]},project},"worker"),{choice:{thinking:"medium"},source:"project"},"An active-less session file cannot shadow lower layers");
});
test("resolveRuntimeRoute rejects invalid roles instead of guessing",()=>{
 const layers={session:routeFile("s-session",{worker:{thinking:"high"}})};
 for(const role of [""," worker","bad role","__proto__","constructor","-x","x".repeat(65),42 as unknown as string])
  assert.deepEqual(resolveRuntimeRoute(layers,role),{source:"default"},"Invalid role "+JSON.stringify(role));
});
test("resolveRuntimeRoute is pure: hand-outs are copies and layers stay untouched",()=>{
 const layers={session:routeFile("s-session",{worker:{model:"private://session/model",thinking:"high"}})},frozen=JSON.stringify(layers);
 const first=resolveRuntimeRoute(layers,"worker"),second=resolveRuntimeRoute(layers,"worker");
 assert.notEqual(first.choice,second.choice);assert.deepEqual(first.choice,second.choice);
 first.choice!.thinking="low";first.choice!.model="tampered";
 assert.equal(JSON.stringify(layers),frozen,"Resolution cannot mutate a configuration layer");
 assert.equal(resolveRuntimeRoute(layers,"worker").choice!.thinking,"high","Tampering a hand-out cannot rewrite later precedence");
});
test("session binding freezes capture, selection wins, reset restores capture, reads hand out clones",async()=>{
 const identity={sessionId:"freeze-session",projectId:process.cwd()};
 const captured=routeFile("A",{worker:{thinking:"low"}});
 const two:RuntimeProfilesFile={schema:ASEN_PROFILES_SCHEMA,active:"B",profiles:[
  {name:"A",routes:{worker:{thinking:"low"}}},
  {name:"B",routes:{worker:{thinking:"high"}}},
 ]};
 const first=await captureSessionProfile("freeze-partition",identity,async()=>captured);
 assert.equal(first.active,"A");assert.equal(first.source,"inherited-global");
 assert.deepEqual(await captureSessionProfile("freeze-partition",identity,async()=>two),first,
  "A later saved file never alters the frozen in-process capture");
 const change=await selectSessionProfile("freeze-partition",identity,"A",async()=>two);
 assert.equal(change.snapshot.source,"explicit-session");assert.equal(change.snapshot.active,"A");
 assert.equal(change.global.active,"B","The writer receives the current saved file for its own persistence decision");
 await assert.rejects(selectSessionProfile("freeze-partition",identity,"missing",async()=>two),/Profile does not exist/);
 const restored=await resetSessionProfile("freeze-partition",identity,async()=>captured);
 assert.equal(restored.snapshot.source,"inherited-global");assert.equal(restored.snapshot.active,"A");
 const clone=await readSessionProfile("freeze-partition",identity);assert.ok(clone);
 clone.file.profiles.length=0;
 assert.equal((await readSessionProfile("freeze-partition",identity))?.file.profiles.length,1,"Reads hand out clones");
 clearSessionProfiles("freeze-partition",identity.sessionId);
 assert.equal(await readSessionProfile("freeze-partition",identity),undefined,"Clearing the session leaves no binding");
});
