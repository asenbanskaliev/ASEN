import assert from "node:assert/strict";
import test,{type TestContext} from "node:test";
import {mkdir,mkdtemp,readFile,writeFile} from "node:fs/promises";
import path from "node:path";
import {createPiExtension} from "../extensions/asen.js";
import {BackgroundJobRegistry} from "../src/runtime/background-jobs.js";

// Mocked public Pi host; all incidental startup files remain project-owned.
async function fixture(t:TestContext){
 await mkdir(path.resolve(".cache"),{recursive:true});
 const root=await mkdtemp(path.resolve(".cache/job-inspection-")),home=path.join(root,"home"),project=path.join(root,"project");
 await Promise.all([mkdir(home,{mode:0o700}),mkdir(project)]);
 const env={HOME:home,USERPROFILE:home,XDG_CONFIG_HOME:path.join(root,"config"),XDG_CACHE_HOME:path.join(root,"cache"),XDG_DATA_HOME:path.join(root,"data"),TMP:path.join(root,"tmp"),TEMP:path.join(root,"tmp"),TMPDIR:path.join(root,"tmp"),ASEN_NO_SKILL_REGISTRY:"1"};
 for(const [key,value] of Object.entries(env)){
  if(key!=="ASEN_NO_SKILL_REGISTRY")await mkdir(value,{recursive:true});
  const before=process.env[key];process.env[key]=value;t.after(()=>{if(before===undefined)delete process.env[key];else process.env[key]=before;});
 }
 const commands=new Map<string,any>(),events=new Map<string,Function[]>(),notices:string[]=[],registrations:string[]=[];
 let id="s",effects=0,inventoryUnavailable=false;
 const pi:any={on(name:string,fn:Function){events.set(name,[...(events.get(name)??[]),fn]);},registerCommand(name:string,command:any){registrations.push(name);commands.set(name,command);},registerTool(){},getCommands(){if(inventoryUnavailable)throw new Error("PRIVATE inventory failure");return [...commands].map(([name,command])=>({name,description:command.description,source:"extension"}));},getAllTools(){return [];},getFlag(){return false;},sendMessage(){effects++;},setActiveTools(){effects++;},setModel(){effects++;}};
 const ctx:any={cwd:project,mode:"tui",hasUI:true,sessionManager:{getSessionId:()=>id},ui:{notify(text:string){notices.push(text);},setStatus(){},setWidget(){},confirm(){effects++;return false;}}};
 const journal=path.join(home,"jobs.json");
 createPiExtension({homeDir:()=>home,packageRoot:root,backgroundJobJournalFile:journal,registryLifecycle:{watch:()=>({close(){}})},autoAdvancePlans:false,enableAgentRuntime:false,enableTodoRuntime:false,enableWorkspaceRuntime:false,enableMemoryRuntime:false})(pi);
 for(const fn of events.get("session_start")??[])await fn({},ctx);
 assert.ok(commands.has("asen-job-inspect"),"production facade must register Jobs inspection");
 const secret="SECRET_SENTINEL";
 const registry=new BackgroundJobRegistry();const started=registry.start({sessionId:"s",projectId:project,command:secret});registry.append(started.id,"TAIL_VISIBLE");registry.finish(started.id,"completed",7);
 const owned={...registry.snapshot(started.id),args:[secret],cwd:secret,persistenceError:secret,deliveryError:secret,authorizationId:secret,recoveredAt:new Date().toISOString(),resumable:false};
 const save=async(rows:unknown[])=>writeFile(journal,JSON.stringify(rows),{mode:0o600});
 const inspect=async(args="")=>{notices.length=0;await commands.get("asen-job-inspect").handler(args,ctx);return notices.join("\n");};
 t.after(()=>assert.equal(effects,0,"inspection must not dispatch/sendMessage/consent/change delivery"));
 return {ctx,commands,registrations,owned,save,inspect,journal,setId(value:string){id=value;},setInventoryUnavailable(){inventoryUnavailable=true;},project,home,notices};
}

test("production registered command selects only owned metadata, refreshes and keeps journal immutable",async t=>{
 const f=await fixture(t);await f.save([f.owned,{...f.owned,id:"foreign",sessionId:"other"}]);
 assert.equal(f.registrations.filter(name=>name==="asen-job-inspect").length,1);
 let labels:string[]=[];
 f.ctx.ui.select=async(_title:string,options:string[])=>{labels=options;return options[0];};
 const before=await readFile(f.journal,"utf8"),text=await f.inspect();
 assert.equal(await readFile(f.journal,"utf8"),before,"inspection must not update the delivery journal");
 assert.deepEqual(labels,[`${f.owned.id} · background · completed`]);
 assert.match(text,/Observed exit code: 7/);assert.match(text,/historical; current execution unknown/);
 assert.match(text,/Log tail \(read-only/);assert.match(text,/TAIL_VISIBLE/);assert.doesNotMatch(text,/SECRET_SENTINEL/);
 assert.equal(await f.inspect("foreign"),await f.inspect("absent"));
 assert.match(await f.inspect(f.owned.id),/Observed exit code: 7/);
 await f.save([{...f.owned,id:"foreign-project",projectId:f.home}]);
 assert.equal(await f.inspect("foreign-project"),await f.inspect("absent"));
 await f.save([f.owned]);
 f.ctx.ui.select=async(_title:string,options:string[])=>{await f.save([{...f.owned,exitCode:9,eventCount:42}]);return options[0];};
 assert.match(await f.inspect(),/Observed exit code: 9/);
 f.ctx.ui.select=async()=>undefined;assert.match(await f.inspect(),/closed/);
 const help=await f.commands.get("asen-help").handler("asen-job-inspect",f.ctx);
 assert.equal(help,undefined);assert.match(f.notices.at(-1)!,/metadata|Metadata/);assert.match(f.notices.at(-1)!,/log tail/iu);assert.match(f.notices.at(-1)!,/historical, not resumed/iu);assert.match(f.notices.at(-1)!,/native.*Stop.*owned live ASEN/iu);assert.match(f.notices.at(-1)!,/asen-agent-follow/u);
 f.setInventoryUnavailable();f.notices.length=0;await f.commands.get("asen-help").handler("asen-job-inspect",f.ctx);
 assert.match(f.notices.at(-1)!,/inventory unavailable/iu);assert.doesNotMatch(f.notices.at(-1)!,/log tail|historical, not resumed|native.*Stop|asen-agent-follow/iu);
});

test("Jobs custom overlay refreshes allowlisted scoped snapshots without journal or action effects",{timeout:5000},async t=>{
 const f=await fixture(t);await f.save([f.owned,{...f.owned,id:"foreign",sessionId:"other"},
  {...f.owned,id:"foreign-project",projectId:f.home}]);
 f.ctx.ui.custom=async(factory:any)=>{
  let refreshed!:()=>void,refreshRequested=false;const finished=new Promise<void>(resolve=>{refreshed=resolve;});
  const view=factory({terminal:{rows:30},requestRender(){if(refreshRequested&&!view.render(140).join("\n").includes("Refreshing snapshot"))refreshed();}},null,null,()=>{});
  assert.doesNotMatch(view.render(140).join("\n"),/foreign|SECRET_SENTINEL/u);
  view.handleInput("\r");await f.save([{...f.owned,exitCode:9,eventCount:42},
   {...f.owned,id:"foreign",sessionId:"other"}]);
  const before=await readFile(f.journal,"utf8");refreshRequested=true;view.handleInput("r");await finished;
  const text=view.render(140).join("\n");assert.match(text,/Observed exit code: 9/u);assert.match(text,/Historical events: 42/u);
  assert.doesNotMatch(text,/foreign|SECRET_SENTINEL/u);assert.equal(await readFile(f.journal,"utf8"),before);
  view.handleInput("q");
 };
 assert.match(await f.inspect(),/navigator closed/u);
});

for(const drift of ["session","project","manager","abort"] as const)test(`registered selection rejects ${drift} drift`,async t=>{
 const f=await fixture(t);await f.save([f.owned]);const abort=new AbortController();f.ctx.signal=abort.signal;
 f.ctx.ui.select=async(_title:string,options:string[])=>{if(drift==="session")f.setId("new");else if(drift==="project")f.ctx.cwd=f.home;else if(drift==="manager")f.ctx.sessionManager={getSessionId:()=>"s"};else abort.abort();return options[0];};
 const text=await f.inspect();assert.match(text,/unavailable|closed/);assert.doesNotMatch(text,new RegExp(f.owned.id));
});

test("registered command distinguishes empty from failed journal and rejects scope drift during identity await",async t=>{
 const f=await fixture(t);assert.match(await f.inspect(),/No owned jobs/);
 await writeFile(path.join(f.home,"jobs.json"),"broken SECRET_SENTINEL",{mode:0o600});
 assert.match(await f.inspect(),/reader unavailable/);assert.doesNotMatch(f.notices.join(""),/SECRET_SENTINEL/);
 const pending=f.inspect("any");f.setId("changed");assert.match(await pending,/unavailable/);
});
