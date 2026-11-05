import assert from "node:assert/strict";
import test,{type TestContext} from "node:test";
import {mkdir,mkdtemp} from "node:fs/promises";
import path from "node:path";
import {createAsenExtension,createPiExtension} from "../extensions/asen.js";

async function fixture(t:TestContext,missing=false){
 const root=await mkdtemp(path.resolve(".cache/command-palette-")),home=path.join(root,"home"),project=path.join(root,"project");
 await mkdir(project);
 const env={HOME:home,USERPROFILE:home,XDG_CONFIG_HOME:path.join(root,"config"),XDG_CACHE_HOME:path.join(root,"cache"),XDG_DATA_HOME:path.join(root,"data"),TMPDIR:path.join(root,"tmp"),TMP:path.join(root,"tmp"),TEMP:path.join(root,"tmp")};
 for(const [key,value] of Object.entries(env)){await mkdir(value,{recursive:true});const prior=process.env[key];process.env[key]=value;t.after(()=>{if(prior===undefined)delete process.env[key];else process.env[key]=prior;});}
 const prior=process.env.ASEN_NO_SKILL_REGISTRY;process.env.ASEN_NO_SKILL_REGISTRY="1";
 t.after(()=>{if(prior===undefined)delete process.env.ASEN_NO_SKILL_REGISTRY;else process.env.ASEN_NO_SKILL_REGISTRY=prior;});
 const commands=new Map<string,any>(),events=new Map<string,Function[]>(),notices:string[]=[];
 let effects=0,id="one",throwing=false,reads=0,selection:(labels:string[])=>Promise<string|undefined>=async labels=>labels[0];
 const forbidden=()=>{effects++;};
 const pi={registerCommand(name:string,command:any){commands.set(name,command);},registerTool(){},getAllTools(){return [];},getFlag(){return false;},on(name:string,fn:Function){events.set(name,[...(events.get(name)??[]),fn]);},
  ...(missing?{}:{getCommands(){assert.equal(this,pi);reads++;if(throwing)throw Error("PRIVATE error");return [...commands].map(([name,command])=>({name,description:command.description,source:"extension",sourceInfo:{path:"PRIVATE path"}}));}}),
  registerShortcut:forbidden,sendMessage:forbidden,sendUserMessage:forbidden,setModel:forbidden,setActiveTools:forbidden,exec:forbidden};
 const ctx:any={cwd:project,mode:"tui",hasUI:true,sessionManager:{getSessionId:()=>id},reload:forbidden,ui:{notify(message:string){notices.push(message);},setStatus(){},setWidget(){},setEditorText:forbidden,select:async(_title:string,labels:string[])=>selection(labels)}};
 (missing?createAsenExtension:createPiExtension)({homeDir:()=>home,packageRoot:root,registryLifecycle:{watch:()=>({close(){}})},autoAdvancePlans:false,enableAgentRuntime:false,enableTodoRuntime:false,enableWorkspaceRuntime:false,enableMemoryRuntime:false})(pi as any);
 const emit=async(name:string)=>{for(const fn of events.get(name)??[])await fn({},ctx);};
 await emit("session_start");notices.length=0;
 // A registration added after startup must be visible without reload.
 commands.set("external:2",{description:"Distinct live description",handler:forbidden});
 t.after(async()=>{await emit("session_shutdown");assert.equal(effects,0,"Discovery must not dispatch, rebind, insert, reload or call a provider");});
 return {commands,ctx,notices,emit,call:async(name:string,args="")=>{notices.length=0;await commands.get(name).handler(args,ctx);return notices.join("\n");},
  setSelection(fn:typeof selection){selection=fn;},setId(){id="two";},setThrowing(){throwing=true;},reads:()=>reads};
}

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
 assert.doesNotMatch(f.notices.join(""),/PRIVATE|asen-help/);
});
