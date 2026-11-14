import assert from "node:assert/strict";
import test,{type TestContext} from "node:test";
import {mkdir,mkdtemp,rm} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {createAsenExtension,createPiExtension} from "../extensions/asen.js";

const cleanups=new WeakMap<TestContext,Array<()=>Promise<void>>>();
async function fixture(t:TestContext,missing=false,raw=false){
 let owned=cleanups.get(t);
 if(!owned){
  owned=[];cleanups.set(t,owned);
  t.after(async()=>{const failures:unknown[]=[];for(const cleanup of owned!.reverse())try{await cleanup();}catch(error){failures.push(error);}if(failures.length)throw new AggregateError(failures,"Fixture cleanup failed");});
 }
 const root=await mkdtemp(path.join(os.tmpdir(),"command-palette-")),home=path.join(root,"home"),project=path.join(root,"project");
 const previous=new Map<string,string|undefined>();
 let shutdown=async()=>{},effects=0;
 owned.push(async()=>{
  try{await shutdown();assert.equal(effects,0,"Discovery must not dispatch, rebind, insert, reload or call a provider");}
  finally{try{await rm(root,{recursive:true,force:true});}finally{for(const [key,value] of previous)if(value===undefined)delete process.env[key];else process.env[key]=value;}}
 });
 await mkdir(project);
 const env={HOME:home,USERPROFILE:home,XDG_CONFIG_HOME:path.join(root,"config"),XDG_CACHE_HOME:path.join(root,"cache"),XDG_DATA_HOME:path.join(root,"data"),TMPDIR:path.join(root,"tmp"),TMP:path.join(root,"tmp"),TEMP:path.join(root,"tmp")};
 for(const [key,value] of Object.entries(env)){await mkdir(value,{recursive:true});previous.set(key,process.env[key]);process.env[key]=value;}
 previous.set("ASEN_NO_SKILL_REGISTRY",process.env.ASEN_NO_SKILL_REGISTRY);process.env.ASEN_NO_SKILL_REGISTRY="1";
 const commands=new Map<string,any>(),events=new Map<string,Function[]>(),notices:string[]=[];
 let id="one",throwing=false,reads=0,selects=0,readerHook:undefined|(()=>void),selection:(labels:string[])=>Promise<string|undefined>=async labels=>labels[0];
 const forbidden=()=>{effects++;};
 const pi={registerCommand(name:string,command:any){commands.set(name,command);},registerTool(){},getAllTools(){return [];},getFlag(){return false;},on(name:string,fn:Function){events.set(name,[...(events.get(name)??[]),fn]);},
  ...(missing?{}:{getCommands(){assert.equal(this,pi);reads++;readerHook?.();if(throwing)throw Error("PRIVATE error");return [...commands].map(([name,command])=>{const row={name,description:command.description,source:"extension"};Object.defineProperties(row,{sourceInfo:{get(){effects++;return {path:"PRIVATE path"};}},handler:{get(){effects++;return command.handler;}}});return row;});}}),
  // UFC-M1-04: startup shortcut registration is now an expected public contribution; it must
  // stay outside the discovery-effects counter, which pins dispatch/rebind/reload/provider calls.
  registerShortcut(){},sendMessage:forbidden,sendUserMessage:forbidden,setModel:forbidden,setActiveTools:forbidden,exec:forbidden};
 const ctx:any={cwd:project,mode:"tui",hasUI:true,sessionManager:{getSessionId:()=>id},reload:forbidden,ui:{notify(message:string){notices.push(message);},setStatus(){},setWidget(){},setEditorText:forbidden,select:async(_title:string,labels:string[])=>{selects++;return selection(labels);}}};
 // Raw public registration preserves return values; production wrappers expose UI effects only.
 (missing||raw?createAsenExtension:createPiExtension)({homeDir:()=>home,packageRoot:root,registryLifecycle:{watch:()=>({close(){}})},autoAdvancePlans:false,enableAgentRuntime:false,enableTodoRuntime:false,enableWorkspaceRuntime:false,enableMemoryRuntime:false})(pi as any);
 const emit=async(name:string)=>{for(const fn of events.get(name)??[])await fn({},ctx);};
 // Public fake-host events only: this fixture never constructs an SDK session.
 shutdown=()=>emit("session_shutdown");
 await emit("session_start");notices.length=0;
 // A registration added after startup must be visible without reload.
 commands.set("external:2",{description:"Distinct live description",handler:forbidden});
 return {commands,ctx,notices,emit,call:async(name:string,args="")=>{notices.length=0;await commands.get(name).handler(args,ctx);return notices.join("\n");},
  setSelection(fn:typeof selection){selection=fn;},setId(){id="two";},setThrowing(){throwing=true;},setReaderHook(fn:()=>void){readerHook=fn;},forbidden, effects:()=>effects,selects:()=>selects,reads:()=>reads};
}

test("public custom-only palette uses live factory controls and exact manual labels",async t=>{
 const f=await fixture(t);delete f.ctx.ui.select;let calls=0,paints=0,rows=20,styles=0;
 const bindings={matches:(key:string,action:string)=>key==="!"&&action==="tui.select.confirm"};
 f.ctx.ui.custom=async(factory:any,options:any)=>{
  calls++;assert.deepEqual(options,{overlay:true,overlayOptions:{width:"70%",maxHeight:"85%",anchor:"center"}});
  const results:unknown[]=[];
  const component=factory({terminal:{get rows(){return rows;}},requestRender:()=>paints++},{fg:(_r:string,s:string)=>{styles++;return s;},bg:(_r:string,s:string)=>s,bold:(s:string)=>s},bindings,(value:unknown)=>results.push(value));
  let lines=component.render(100);assert.ok(lines.length<=17);assert.match(lines.join("\n"),/Registered discovery/);
  rows=8;lines=component.render(100);assert.ok(lines.length<=6);rows=20;
  for(const char of "/external:2")component.handleInput(char);component.render(100);component.handleInput("!");
  assert.equal(results.length,1);assert.match(String(results[0]),/^\/external:2 /);component.dispose();return results[0];
 };
 const before=f.reads(),out=await f.call("asen-commands");
 assert.equal(calls,1);assert.equal(f.reads()-before,2);assert.equal(f.selects(),0);assert.ok(paints>0);assert.ok(styles>0);
 assert.match(out,/To invoke manually, type \/external:2/);assert.match(out,/Nothing was executed/);assert.equal(f.effects(),0);
 await f.call("asen-commands","distinct");assert.equal(calls,1,"Explicit query remains inspection");
});
for(const choice of [undefined,"/external:2 - forged"])test(`custom completion rejects ${String(choice)}`,async t=>{
 const f=await fixture(t);f.ctx.ui.custom=async()=>choice;
 assert.equal(await f.call("asen-commands"),"");assert.equal(f.selects(),0);
});
for(const drift of ["session","project","shutdown"] as const)test(`custom factory fails closed on ${drift} drift but permits cancel`,async t=>{
 const f=await fixture(t);let completions:unknown[]=[];
 f.ctx.ui.custom=async(factory:any)=>{
  const component=factory({terminal:{rows:20},requestRender(){}},{fg:(_r:string,s:string)=>s,bg:(_r:string,s:string)=>s,bold:(s:string)=>s},undefined,(v:unknown)=>completions.push(v));component.render(100);
  if(drift==="session")f.setId();else if(drift==="project")f.ctx.cwd=path.dirname(f.ctx.cwd);else await f.emit("session_shutdown");
  component.handleInput("\r");assert.deepEqual(completions,[]);assert.match(component.render(100).join(""),/scope changed/);
  component.handleInput("\x1b");assert.deepEqual(completions,[undefined]);return completions[0];
 };
 await assert.rejects(f.call("asen-commands"),/session changed|scope changed/);assert.equal(f.notices.length,0);
});
test("custom retains cap disclosure, fresh inventory and select-only explicit query",async t=>{
 const f=await fixture(t);for(let i=0;i<100;i++)f.commands.set(`extra-${i}`,{description:"Extra",handler:f.forbidden});
 let calls=0;f.ctx.ui.custom=async(factory:any)=>{
  calls++;const component=factory({terminal:{rows:100},requestRender(){}},{fg:(_r:string,s:string)=>s,bg:(_r:string,s:string)=>s,bold:(s:string)=>s},undefined,()=>{});
  const lines=component.render(200);assert.match(lines.join("\n"),/limit|truncat|bounded/i);
  assert.ok(lines.filter((line:string)=>/^> |^  \//.test(line)).length<=64);component.dispose();return undefined;
 };
 await f.call("asen-commands");assert.equal(calls,1);
 f.setSelection(async labels=>labels[0]);await f.call("asen-palette","distinct");assert.equal(calls,1);assert.equal(f.selects(),1);
 f.ctx.hasUI=false;await f.call("asen-commands");assert.equal(calls,1);
});

test("custom rereads fresh rows, direct no-context remains synchronous and bare palette opens one screen",async t=>{
 const f=await fixture(t,false,true),before=f.reads();let calls=0;
 f.setReaderHook(()=>{if(f.reads()===before+2){f.commands.delete("external:2");f.commands.set("external:fresh",{description:"Fresh custom read",handler:f.forbidden});}});
 f.ctx.ui.custom=async(factory:any)=>{
  calls++;let selected:unknown;const c=factory({terminal:{rows:100},requestRender(){}},{fg:(_r:string,s:string)=>s,bg:(_r:string,s:string)=>s,bold:(s:string)=>s},undefined,(v:unknown)=>selected=v);
  for(const char of "/external:")c.handleInput(char);const text=c.render(160).join("\n");assert.match(text,/external:fresh/);assert.doesNotMatch(text,/external:2/);c.handleInput("\r");return selected;
 };
 assert.match(await f.call("asen-commands"),/Fresh custom read/);assert.equal(f.reads()-before,2);
 const direct=f.commands.get("asen-commands").handler();assert.equal(direct instanceof Promise,false);assert.ok(Array.isArray(direct));assert.equal(calls,1);
 await f.call("asen-palette");assert.equal(calls,2);assert.equal(f.selects(),0);
});
for(const state of ["missing","throwing","empty"] as const)test(`custom preserves ${state} fallback`,async t=>{
 const f=await fixture(t,state==="missing",true),handler=f.commands.get("asen-commands").handler;
 if(state==="throwing")f.setThrowing();if(state==="empty")f.commands.clear();
 f.ctx.ui.custom=()=>assert.fail("No custom UI for unavailable or empty inventory");
 const expected=handler();assert.equal(expected instanceof Promise,false);assert.deepEqual(await handler("",f.ctx),expected);
});

test("production commands use live receiver-bound inventory and description search",async t=>{
 const f=await fixture(t);
 const output=await f.call("asen-commands","  DISTINCT LIVE  ");
 const rows=JSON.parse(output);assert.equal(rows.length,1);assert.equal(rows[0].name,"external:2");assert.equal(rows[0].implemented,true);
 assert.doesNotMatch(output,/PRIVATE/);assert.ok(f.reads()>0);
 assert.equal(await f.call("asen-commands","no-such-command"),"[]");
 assert.ok(f.commands.has("asen-status"));assert.ok(f.commands.has("asen-help"));assert.ok(f.commands.has("asen-job-inspect"));
 assert.match(await f.call("asen-help","asen-status"),/Type \/asen-status/);
 assert.match(await f.call("asen"),/pi-native/);
});

test("live help is grouped, exact, honest, receiver-bound and reads inventory once per invocation",async t=>{
 const f=await fixture(t);
 let before=f.reads(),output=await f.call("asen-help","");
 assert.equal(f.reads()-before,1);assert.match(output,/Registered command guide/);assert.match(output,/\[extension\]/);assert.doesNotMatch(output,/Unknown command/);
 before=f.reads();output=await f.call("asen-help","/external:2");
 assert.equal(f.reads()-before,1);assert.match(output,/Distinct live description/);assert.match(output,/Type \/external:2 manually/);
 assert.match(await f.call("asen-help","definitely-unknown"),/No exact registered command matches/);
 const help=f.commands.get("asen-help");f.commands.clear();f.notices.length=0;await help.handler("",f.ctx);assert.match(f.notices.join("\n"),/No registered commands reported/);assert.doesNotMatch(f.notices.join("\n"),/Unknown command/);
});

test("palette offers only exact command labels and displays manual details without execution",async t=>{
 const f=await fixture(t);
 f.setSelection(async labels=>{assert.equal(labels.length,1);assert.match(labels[0]!,/^\/external:2 /);return labels[0];});
 const output=await f.call("asen-palette"," DISTINCT ");
 assert.match(output,/external:2/);assert.match(output,/Distinct live description/);assert.match(output,/manually/);
 for(const choice of [undefined,"external:2","▌ CORE ▌","/external:2 - forged"]){f.setSelection(async()=>choice);assert.equal(await f.call("asen-palette","distinct"),"");}
});

test("missing, throwing, empty and headless paths are honest and never select",async t=>{
 const f=await fixture(t,true);f.setSelection(async()=>{assert.fail("must not select");});
 assert.match(await f.call("asen-commands"),/unavailable/);
 assert.equal(f.commands.get("asen-commands").handler().state,"unavailable","Direct internal callers need no UI context");
 assert.match(await f.call("asen-palette"),/unavailable/);
 assert.match(await f.call("asen-help","asen-status"),/inventory unavailable/i);
 assert.doesNotMatch(f.notices.join(""),/Type \/asen-status|performs its/u);
 const g=await fixture(t);g.ctx.hasUI=false;g.ctx.mode="print";g.setSelection(async()=>{assert.fail("headless must not select");});
 assert.match(await g.call("asen-palette","distinct"),/external:2/);
 assert.match(await g.call("asen-palette","absent-query"),/No matching/);
 const palette=g.commands.get("asen-palette"),list=g.commands.get("asen-commands");g.commands.clear();
 g.notices.length=0;await palette.handler("",g.ctx);assert.match(g.notices.join(""),/No registered commands/);
 g.notices.length=0;await list.handler("",g.ctx);assert.equal(g.notices.join(""),"[]");
});

for(const drift of ["session","project","shutdown"] as const)test(`selection rejects ${drift} drift without stale display`,async t=>{
 const f=await fixture(t);
 f.setSelection(async labels=>{if(drift==="session")f.setId();else if(drift==="project")f.ctx.cwd=path.dirname(f.ctx.cwd);else await f.emit("session_shutdown");return labels[0];});
 await assert.rejects(f.call("asen-palette","distinct"),/session changed|scope changed/);
 assert.equal(f.notices.length,0);
});

test("reader failures do not expose errors or fall back to the catalog",async t=>{
 const f=await fixture(t);f.setThrowing();
 assert.match(await f.call("asen-commands"),/unavailable/);
 assert.match(await f.call("asen-help","asen-status"),/inventory unavailable/i);
 assert.doesNotMatch(f.notices.join(""),/PRIVATE|Type \/asen-status|performs its/u);
});

for(const args of [""," \t "])test(`bare native command discovery opens manual-only palette (${JSON.stringify(args)})`,async t=>{
 const f=await fixture(t),count=f.commands.size;
 f.setSelection(async labels=>{
  const choice=labels.find(label=>label.startsWith("/external:2 "));assert.ok(choice);return choice;
 });
 const output=await f.call("asen-commands",args);
 assert.equal(f.selects(),1,"Bare native access must open the existing selector");
 assert.match(output,/To invoke manually, type \/external:2/);
 assert.match(output,/Nothing was executed\./);assert.doesNotMatch(output,/PRIVATE/);
 assert.equal(f.commands.size,count);assert.ok(f.commands.has("asen"));
});

test("command inspection retains synchronous direct, explicit, headless and no-selector results",async t=>{
 const f=await fixture(t,false,true),handler=f.commands.get("asen-commands").handler;
 const direct=handler();assert.equal(direct instanceof Promise,false);assert.ok(Array.isArray(direct));
 const exact=JSON.stringify(direct,null,2);
 assert.equal(await f.call("asen-commands","distinct"),JSON.stringify(direct.filter((row:any)=>row.name==="external:2"),null,2));
 assert.equal(f.selects(),0);
 f.ctx.hasUI=false;assert.equal(await f.call("asen-commands"),exact);
 f.ctx.hasUI=true;delete f.ctx.ui.select;assert.equal(await f.call("asen-commands"),exact);
 assert.equal(f.selects(),0);
 const production=await fixture(t);production.ctx.hasUI=false;
 assert.equal(await production.call("asen-commands"),exact);
 production.ctx.hasUI=true;delete production.ctx.ui.select;
 assert.equal(await production.call("asen-commands"),exact);assert.equal(production.selects(),0);
});

for(const state of ["missing","throwing","empty"] as const)test(`bare command discovery preserves exact ${state} inspection`,async t=>{
 const f=await fixture(t,state==="missing",true),handler=f.commands.get("asen-commands").handler;
 if(state==="throwing")f.setThrowing();if(state==="empty")f.commands.clear();
 const direct=handler();assert.equal(direct instanceof Promise,false);
 assert.deepEqual(direct,state==="empty"?[]:{state:"unavailable",message:"Registered command inventory unavailable."});
 f.notices.length=0;assert.deepEqual(await handler("",f.ctx),direct);
 assert.equal(f.notices.join("\n"),JSON.stringify(direct,null,2));assert.equal(f.selects(),0);
 assert.doesNotMatch(f.notices.join(""),/PRIVATE|asen-status/);
 if(state!=="missing"){
  const production=await fixture(t),invoke=production.commands.get("asen-commands").handler;
  if(state==="throwing")production.setThrowing();else production.commands.clear();
  await invoke("",production.ctx);
  assert.equal(production.notices.join("\n"),JSON.stringify(direct,null,2));assert.equal(production.selects(),0);
 }
});

for(const choice of [undefined,"external:2","▌ CORE ▌","/external:2 - forged"])test(`bare native cancellation or forged choice is inert (${String(choice)})`,async t=>{
 const f=await fixture(t);f.setSelection(async()=>choice);
 assert.equal(await f.call("asen-commands"),"");assert.equal(f.selects(),1);assert.equal(f.effects(),0);
});

for(const drift of ["session","project","shutdown"] as const)test(`bare native selection rejects ${drift} drift`,async t=>{
 const f=await fixture(t);
 f.setSelection(async labels=>{if(drift==="session")f.setId();else if(drift==="project")f.ctx.cwd=path.dirname(f.ctx.cwd);else await f.emit("session_shutdown");return labels[0];});
 await assert.rejects(f.call("asen-commands"),/session changed|scope changed/);
 assert.equal(f.selects(),1);assert.equal(f.notices.length,0);
});

test("bare command discovery checks original scope before forwarding",async t=>{
 const f=await fixture(t),before=f.reads();f.setReaderHook(()=>f.setId());
 await assert.rejects(f.call("asen-commands"),/session changed|scope changed/);
 assert.equal(f.reads()-before,1);assert.equal(f.selects(),0);assert.equal(f.notices.length,0);
});

test("bare native palette rereads live inventory instead of retaining eligibility rows",async t=>{
 const f=await fixture(t),before=f.reads();
 f.setReaderHook(()=>{if(f.reads()===before+2){f.commands.delete("external:2");f.commands.set("external:fresh",{description:"Fresh second read",handler:f.forbidden});}});
 f.setSelection(async labels=>{assert.ok(labels.every(label=>!label.startsWith("/external:2 ")));return labels.find(label=>label.startsWith("/external:fresh "));});
 const output=await f.call("asen-commands");
 assert.equal(f.reads()-before,2);assert.equal(f.selects(),1);assert.match(output,/Fresh second read/);assert.match(output,/Nothing was executed\./);
});

for(const state of ["empty","throwing"] as const)test(`fresh palette ${state} result never reuses initial rows`,async t=>{
 const f=await fixture(t),before=f.reads();
 f.setReaderHook(()=>{if(f.reads()===before+2){if(state==="empty")f.commands.clear();else f.setThrowing();}});
 const output=await f.call("asen-commands");
 assert.equal(f.reads()-before,2);assert.equal(f.selects(),0);
 assert.equal(output,state==="empty"?"No registered commands reported.":"Registered command inventory unavailable.");
});

for(const name of ["asen-customize","asen-mode","asen-profiles","asen-research-probe"])test(`bare palette never dispatches selected action ${name}`,async t=>{
 const f=await fixture(t),command=f.commands.get(name),count=f.commands.size;
 assert.ok(command);command.handler=f.forbidden;
 f.ctx.ui.confirm=f.forbidden;f.ctx.ui.input=f.forbidden;
 t.mock.method(globalThis,"fetch",f.forbidden);
 f.setSelection(async labels=>{const choice=labels.find(label=>label.startsWith(`/${name} `));assert.ok(choice);return choice;});
 const output=await f.call("asen-commands");
 assert.equal(f.selects(),1);assert.match(output,/Nothing was executed\./);
 assert.equal(f.effects(),0,"No handler, permission, model, editor, reload, probe or fetch effects");assert.equal(f.commands.size,count);
});
