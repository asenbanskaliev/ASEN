import assert from "node:assert/strict";
import test,{type TestContext} from "node:test";
import {mkdir,mkdtemp,readFile,writeFile} from "node:fs/promises";
import path from "node:path";
import {createAsenExtension,createPiExtension} from "../extensions/asen.js";
import type {SessionTodoStore} from "../src/runtime/todo-store.js";
import {ASEN_PROFILES_SCHEMA} from "../src/runtime/profiles.js";

// All state, including incidental lifecycle usage, stays in this excluded project root.
async function fixture(t:TestContext,inventory:"reported"|"empty"|"missing"|"throwing"="reported",listGate?:()=>Promise<void>,production=false){
 await mkdir(path.resolve(".cache"),{recursive:true});
 const root=await mkdtemp(path.resolve(".cache/panel-observation-"));
 const home=path.join(root,"home"),project=path.join(root,"project");
 await Promise.all([mkdir(home),mkdir(project)]);
 const isolated={HOME:home,USERPROFILE:home,XDG_CONFIG_HOME:path.join(root,"config"),XDG_CACHE_HOME:path.join(root,"cache"),XDG_DATA_HOME:path.join(root,"data"),TMPDIR:path.join(root,"tmp"),TMP:path.join(root,"tmp"),TEMP:path.join(root,"tmp")};
 for(const [key,value] of Object.entries(isolated)){
  await mkdir(value,{recursive:true});const prior=process.env[key];process.env[key]=value;
  t.after(()=>{if(prior===undefined)delete process.env[key];else process.env[key]=prior;});
 }
 const commands=new Map<string,any>(),events=new Map<string,Function[]>(),statuses=new Map<string,string|undefined>(),notices:string[]=[];
 const inputs=Object.freeze([{name:"inspect",source:"extension",sourceInfo:{scope:"project",origin:"top-level"},description:"private description"}]);
 let effects=0,id="session-a",inventoryState=inventory;
 if(production){
  const prior=process.env.ASEN_NO_SKILL_REGISTRY;process.env.ASEN_NO_SKILL_REGISTRY="1";
  t.after(()=>{if(prior===undefined)delete process.env.ASEN_NO_SKILL_REGISTRY;else process.env.ASEN_NO_SKILL_REGISTRY=prior;});
 }
 const pi={registerCommand(name:string,command:any){commands.set(name,command);},on(name:string,fn:Function){events.set(name,[...(events.get(name)??[]),fn]);},
  registerTool(){},getFlag(){return false;},
  ...(inventory==="missing"?{}:{getCommands(){assert.equal(this,pi,"Command reader must retain its public host receiver");if(inventoryState==="throwing")throw Error("private error");return inventoryState==="empty"?[]:inputs;},getAllTools(){assert.equal(this,pi,"Tool reader must retain its public host receiver");if(inventoryState==="throwing")throw Error("private error");return inventoryState==="empty"?[]:[{name:"lookup",namespace:{name:"mcp__docs"},description:"private description"}];}}),
  setModel(){effects++;},setActiveTools(){effects++;},sendMessage(){effects++;}};
 const ctx:any={cwd:project,mode:"tui",hasUI:true,model:{provider:"p",id:"m"},thinkingLevel:"high",getContextUsage(){return {tokens:80,contextWindow:100,percent:80};},
  sessionManager:{getSessionId:()=>id},ui:{notify(message:string){notices.push(message);},setStatus(key:string,value:string|undefined){statuses.set(key,value);},setWidget(){},setFooter(){effects++;},confirm(){effects++;return false;}}};
 const dependencies={homeDir:()=>home,packageRoot:root,registryLifecycle:{watch:()=>({close(){}})},autoAdvancePlans:false,enableAgentRuntime:false,enableTodoRuntime:false,enableWorkspaceRuntime:false,enableMemoryRuntime:false,...(listGate?{todoStoreFactory:async()=>({async list(){await listGate();return [];}} as unknown as SessionTodoStore)}:{})};
 if(production)createPiExtension(dependencies)(pi as any);else createAsenExtension(dependencies)(pi);
 const emit=async(name:string)=>{for(const fn of events.get(name)??[])await fn({},ctx);};
 const panel=async(view:string):Promise<string[]>=>{
  const result=await commands.get("asen-panel").handler(view,ctx);
  return production?notices.at(-1)!.split("\n"):result;
 };
 t.after(()=>{assert.equal(effects,0,"Inspection must not select, consent, dispatch or replace the footer");assert.equal(inputs[0]?.description,"private description");});
 return {root,home,project,ctx,statuses,notices,commands,emit,panel,setId(value:string){id=value;},setInventory(value:typeof inventory){inventoryState=value;}};
}

test("production facade forwards public inventories with receiver binding and truthful unavailability",async t=>{
 const f=await fixture(t,"reported",undefined,true);
 await f.emit("session_start");
 assert.ok(f.commands.has("asen-panel"),"Production preflight must register the public panel");
 const common=["  Agent profile: default (inherited-default; frozen in-process)","  Actual routing: unknown · connection: unknown"];
 assert.deepEqual(await f.panel("integrations"),[...common,"  Commands: reported","  inspect · configured · extension/project · connection unknown","  Tools: reported","  lookup [mcp__docs] · registered · unknown · connection unknown"]);
 f.setInventory("empty");
 assert.deepEqual(await f.panel("integrations"),[...common,"  Commands: empty (no entries reported)","  Tools: empty (no entries reported)"]);
 f.setInventory("throwing");
 assert.deepEqual(await f.panel("integrations"),[...common,"  Commands: unavailable","  Tools: unavailable"]);
 assert.doesNotMatch(f.notices.at(-1)!,/private|Permission:|healthy|connected/);
 await f.emit("session_shutdown");
});

test("public lifecycle status is additive, fresh, threshold-aware and clears on shutdown",async t=>{
 const f=await fixture(t);
 const prior=process.env.ASEN_NO_SKILL_REGISTRY;process.env.ASEN_NO_SKILL_REGISTRY="1";
 t.after(()=>{if(prior===undefined)delete process.env.ASEN_NO_SKILL_REGISTRY;else process.env.ASEN_NO_SKILL_REGISTRY=prior;});
 await f.emit("session_start");
 const expected=(context:string)=>`ASEN │ selected p/m · high │ responding ? │ ctx ${context} │ cost/sub ?`;
 assert.equal(f.statuses.get("asen:host"),expected("80% warning"));
 for(const [percent,label] of [[79.999,"80%"],[80,"80% warning"],[94.999,"95% warning"],[95,"95% error"],[null,"?"]] as const){
  f.ctx.getContextUsage=()=>({tokens:percent===null?null:80,contextWindow:100,percent});
  await f.emit("session_compact");
  assert.equal(f.statuses.get("asen:host"),expected(label));
  assert.match((await f.panel("status"))[0]!,new RegExp(`ctx ${label.replace(/[?%]/g,"\\$&")}(?= │|$)`));
 }
 f.statuses.set("asen:workspace","existing Git contribution");
 await f.emit("model_select");assert.equal(f.statuses.get("asen:workspace"),"existing Git contribution");
 await f.emit("session_shutdown");assert.equal(f.statuses.get("asen:host"),undefined);
 await f.emit("turn_end");assert.equal(f.statuses.get("asen:host"),undefined,"Late refresh cannot repopulate an ended session");
});

test("missing and throwing observations stay unknown; headless and optional status support are safe",async t=>{
 const f=await fixture(t);
 delete f.ctx.model;delete f.ctx.thinkingLevel;
 f.ctx.getContextUsage=()=>{throw Error("private host error");};
 assert.deepEqual(await f.panel("status"),["ASEN │ selected ? │ responding ? │ ctx ? │ cost/sub ? │ integrations reported"]);
 await f.emit("thinking_level_select");assert.equal(f.statuses.get("asen:host"),"ASEN │ selected ? │ responding ? │ ctx ? │ cost/sub ?");
 f.ctx.hasUI=false;f.ctx.mode="print";await f.emit("model_select");assert.equal(f.statuses.get("asen:host"),undefined);
 assert.deepEqual(await f.panel("status"),["ASEN │ selected ? │ responding ? │ ctx ? │ cost/sub ? │ integrations reported"]);
 delete f.ctx.ui.setStatus;await f.emit("model_select");
 delete f.ctx.getContextUsage;assert.deepEqual(await f.panel("status"),["ASEN │ selected ? │ responding ? │ ctx ? │ cost/sub ? │ integrations reported"]);
});

test("public theme applies the unrounded context tone without changing plain command output",async t=>{
 const f=await fixture(t);const tones:string[]=[];
 f.ctx.ui.theme={fg(tone:string,text:string){tones.push(tone);return `<${tone}>${text}</${tone}>`;}};
 await f.emit("model_select");assert.deepEqual(tones,["warning"]);
 assert.equal(f.statuses.get("asen:host"),"<warning>ASEN │ selected p/m · high │ responding ? │ ctx 80% warning │ cost/sub ?</warning>");
 assert.deepEqual(await f.panel("status"),["ASEN │ selected p/m · high │ responding ? │ ctx 80% warning │ cost/sub ? │ integrations reported"]);
});

test("the composed host row carries the observed detached workspace changes segment",async t=>{
 const {spawnSync}=await import("node:child_process");
 const f=await fixture(t);
 const git=(...args:string[])=>{const result=spawnSync("git",["-C",f.project,...args],{encoding:"utf8"});assert.equal(result.status,0,`git ${args.join(" ")}: ${result.stderr}`);};
 const commit=()=>git("-c","user.name=asen","-c","user.email=asen@example.invalid","-c","commit.gpgsign=false","commit","-q","-m","fixture");
 git("init","-q");
 await writeFile(path.join(f.project,"tracked.txt"),"tracked\n");
 git("add","tracked.txt");commit();
 await writeFile(path.join(f.project,"pending.txt"),"pending\n");
 git("checkout","--detach","-q");
 await f.emit("model_select");
 assert.equal(f.statuses.get("asen:host"),`ASEN │ detached ±1 │ selected p/m · high │ responding ? │ ctx 80% warning │ cost/sub ?`);
 assert.doesNotMatch(f.statuses.get("asen:host")!,/Permission:|private|connected|healthy|servers: \d/i);
 await f.emit("session_shutdown");
});

for(const inventory of ["reported","empty","missing","throwing"] as const)test(`registered Integrations distinguishes ${inventory} without connection or count claims`,async t=>{
 const f=await fixture(t,inventory),rows=await f.panel("integrations");
 const common=["  Agent profile: default (inherited-default; frozen in-process)","  Actual routing: unknown · connection: unknown"];
 assert.deepEqual(rows,inventory==="reported"?[...common,"  Commands: reported","  inspect · configured · extension/project · connection unknown","  Tools: reported","  lookup [mcp__docs] · registered · unknown · connection unknown"]:
  [...common,`  Commands: ${inventory==="empty"?"empty (no entries reported)":"unavailable"}`,`  Tools: ${inventory==="empty"?"empty (no entries reported)":"unavailable"}`]);
 assert.doesNotMatch(rows.join("\n"),/Permission:|private|connected|healthy|servers: \d/i);
});

const profile=(active:string,routes:Record<string,unknown>)=>({schema:ASEN_PROFILES_SCHEMA,active,profiles:[{name:active,routes}]});
test("project parse and read errors stay unavailable instead of silently defaulting",async t=>{
 const f=await fixture(t);await mkdir(path.join(f.project,".asen"));
 const file=path.join(f.project,".asen","profiles.json");await writeFile(file,"{broken private payload");
 const rows=await f.panel("integrations");assert.equal(rows[0],"  Agent profile: unavailable");assert.doesNotMatch(rows.join("\n"),/private|default/);
 // A directory is an unreadable profile, not absence (no platform permission bypass).
 f.ctx.cwd=path.join(f.root,"unreadable");await mkdir(path.join(f.ctx.cwd,".asen","profiles.json"),{recursive:true});
 assert.equal((await f.panel("integrations"))[0],"  Agent profile: unavailable");
});

test("existing explicit-session and project precedence remains frozen and observational",async t=>{
 const f=await fixture(t);await Promise.all([mkdir(path.join(f.home,".asen"),{mode:0o700}),mkdir(path.join(f.project,".asen"))]);
 const globalFile=path.join(f.home,".asen","profiles.json"),projectFile=path.join(f.project,".asen","profiles.json");
 await writeFile(globalFile,JSON.stringify(profile("global",{worker:{model:"global-model",thinking:"low"}})));
 await writeFile(projectFile,JSON.stringify(profile("project",{worker:{model:"project-model",thinking:"medium"},explorer:{model:"project-model"}})));
 const before=await readFile(projectFile,"utf8");
 assert.ok((await f.panel("integrations")).includes("  worker: project · model configured · thinking medium · actual unknown"));
 await f.commands.get("asen-profiles").handler("session global",f.ctx);
 const rows=await f.panel("integrations");
 assert.equal(rows[0],"  Agent profile: global (explicit-session; frozen in-process)");
 assert.ok(rows.includes("  worker: session · model configured · thinking low · actual unknown"));
 assert.ok(rows.includes("  explorer: project · model configured · actual unknown"));
 assert.equal(await readFile(projectFile,"utf8"),before);
 f.setId("session-b");assert.equal((await f.panel("integrations"))[0],"  Agent profile: global (inherited-global; frozen in-process)");
});

for(const drift of ["session","project","shutdown"] as const)test(`panel rejects ${drift} change during asynchronous loading`,async t=>{
 const f=await fixture(t);const pending=assert.rejects(f.panel("integrations"),/ASEN panel session changed/);
 if(drift==="session")f.setId("session-b");else if(drift==="project")f.ctx.cwd=f.home;else await f.emit("session_shutdown");
 await pending;
 assert.ok(!f.notices.some(row=>row.includes("Agent profile:")),"Never publish stale data");
});

for(const drift of ["session","project"] as const)test(`panel rechecks ${drift} after a pending store read`,async t=>{
 let enter!:()=>void,release!:()=>void;
 const entered=new Promise<void>(resolve=>{enter=resolve;}),gate=new Promise<void>(resolve=>{release=resolve;});
 const f=await fixture(t,"reported",async()=>{enter();await gate;});
 const pending=assert.rejects(f.panel("integrations"),/ASEN panel session changed/);
 await entered;if(drift==="session")f.setId("session-b");else f.ctx.cwd=f.home;
 release();await pending;
 assert.ok(!f.notices.some(row=>row.includes("Agent profile:")));
});

test("session replacement clears the previous UI contribution and observes only the new context",async t=>{
 const f=await fixture(t);await f.emit("model_select");
 const oldUI=f.ctx.ui;let current:string|undefined;
 f.ctx.ui={...oldUI,setStatus(key:string,value:string|undefined){if(key==="asen:host")current=value;}};
 f.setId("session-b");f.ctx.model={provider:"new",id:"selected"};f.ctx.getContextUsage=()=>undefined;
 await f.emit("model_select");
 assert.equal(f.statuses.get("asen:host"),undefined);
 assert.equal(current,"ASEN │ selected new/selected · high │ responding ? │ ctx ? │ cost/sub ?");
});

test("the host row composes workspace and elevated permission once without secondary status keys",async t=>{
 const f=await fixture(t);
 await f.emit("session_start");
 assert.equal(f.statuses.get("asen:host"),"ASEN │ selected p/m · high │ responding ? │ ctx 80% warning │ cost/sub ?");
 assert.equal(f.statuses.get("asen:permissions"),undefined,"The permission mode must not occupy a second status key");
 assert.equal(f.statuses.get("asen:workspace"),undefined,"ASEN contributes no separate workspace status key");
 await f.commands.get("asen-mode").handler("yolo",f.ctx);
 assert.equal(f.statuses.get("asen:host"),"ASEN │ YOLO │ selected p/m · high │ responding ? │ ctx 80% warning │ cost/sub ?");
 const rows=await f.panel("integrations");
 assert.ok(rows.some(row=>row.startsWith("  permissions standing permission for ordinary primary work")),rows.join("\n"));
 assert.doesNotMatch(rows.join("\n"),/Permission:|connected|healthy|servers: \d/i);
 await f.commands.get("asen-mode").handler("normal",f.ctx);
 assert.equal(f.statuses.get("asen:host"),"ASEN │ selected p/m · high │ responding ? │ ctx 80% warning │ cost/sub ?");
 assert.doesNotMatch((await f.panel("integrations")).join("\n"),/permissions /,"Normal mode states no meaning row");
});

test("local status projects inventory states without connection or count claims",async t=>{
 const f=await fixture(t,"reported");
 const rows=await f.commands.get("asen-status").handler(undefined,f.ctx);
 assert.ok(rows.includes("integrations: commands reported · tools reported"),rows.join("\n"));
 assert.doesNotMatch(rows.join("\n"),/connected|servers: \d/i);
 f.setInventory("throwing");
 const failed=await f.commands.get("asen-status").handler(undefined,f.ctx);
 assert.ok(failed.includes("integrations: commands unavailable · tools unavailable"),failed.join("\n"));
});
