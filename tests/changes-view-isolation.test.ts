import assert from "node:assert/strict";
import test,{type TestContext} from "node:test";
import {mkdir,mkdtemp,writeFile,readFile,rename} from "node:fs/promises";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {createPiExtension} from "../extensions/asen.js";
import {renderGitDiffPreview} from "../src/runtime/git-diff-preview.js";
import {renderAsenPanelSection} from "../src/runtime/ide-panel.js";
import {captureWorkspaceRootIdentity,assertWorkspaceRootIdentity,parseWorkspaceStatus} from "../src/runtime/workspace-snapshot.js";
import {visibleWidth} from "../src/runtime/responsive-layout.js";

async function fixture(t:TestContext){
 const root=await mkdtemp(path.resolve(".cache/changes-view-")),home=path.join(root,"home"),project=path.join(root,"project");
 for(const [key,value] of Object.entries({HOME:home,USERPROFILE:home,XDG_CONFIG_HOME:path.join(root,"config"),XDG_CACHE_HOME:path.join(root,"cache"),XDG_DATA_HOME:path.join(root,"data"),TMPDIR:path.join(root,"tmp"),TMP:path.join(root,"tmp"),TEMP:path.join(root,"tmp")})){
  await mkdir(value,{recursive:true});const prior=process.env[key];process.env[key]=value;
  t.after(()=>{if(prior===undefined)delete process.env[key];else process.env[key]=prior;});
 }
 await mkdir(project);const prior=process.env.ASEN_NO_SKILL_REGISTRY;process.env.ASEN_NO_SKILL_REGISTRY="1";
 t.after(()=>{if(prior===undefined)delete process.env.ASEN_NO_SKILL_REGISTRY;else process.env.ASEN_NO_SKILL_REGISTRY=prior;});
 const commands=new Map<string,any>(),events=new Map<string,Function[]>(),notices:string[]=[];let effects=0,id:string|undefined="session-a",selects=0;
 const effect=()=>{effects++;throw new Error("Unexpected action");};
 const pi={on(name:string,fn:Function){events.set(name,[...(events.get(name)??[]),fn]);},registerCommand(name:string,command:any){commands.set(name,command);},registerTool(){},getCommands(){return [];},getAllTools(){return [];},getFlag(){return false;},sendMessage:effect,sendUserMessage:effect,setModel:effect,setActiveTools:effect,exec:effect};
 const ctx:any={cwd:project,mode:"tui",hasUI:true,sessionManager:{getSessionId:()=>id},ui:{notify(message:string){notices.push(message);},select(){selects++;return undefined;},confirm:effect,editor:effect,setEditorText:effect,setWidget(){},setStatus(){}}};
 createPiExtension({homeDir:()=>home,packageRoot:root,autoAdvancePlans:false,enableAgentRuntime:false,enableTodoRuntime:false,enableWorkspaceRuntime:false,enableMemoryRuntime:false})(pi as any);
 const emit=async(name:string)=>{for(const fn of events.get(name)??[])await fn({},ctx);};
 await emit("session_start");assert.ok(commands.has("asen-changes-view"));notices.length=0;
 const view=async(args="")=>{await commands.get("asen-changes-view").handler(args,ctx);return notices.at(-1)!.split("\n");};
 t.after(()=>assert.equal(effects,0,"No dispatch, message, consent, editor, tool or model effects"));
 return {root,home,project,ctx,notices,view,emit,setId(value:string|undefined){id=value;},selects:()=>selects};
}

test("non-Git pre-aborted command publishes nothing",async t=>{
 const f=await fixture(t),controller=new AbortController();controller.abort();f.ctx.signal=controller.signal;
 await assert.rejects(f.view(),/Git inspection cancelled or context changed/);
 assert.equal(f.notices.length,0);assert.equal(f.selects(),0);
});
for(const drift of ["abort","session","project","manager","restart"] as const)test(`non-Git ${drift} during identity await publishes nothing`,async t=>{
 const f=await fixture(t),controller=new AbortController();f.ctx.signal=controller.signal;
 const pending=assert.rejects(f.view(),/Git inspection cancelled or context changed/);void pending.catch(()=>{});
 if(drift==="abort")controller.abort();
 else if(drift==="session")f.setId("other");
 else if(drift==="project")f.ctx.cwd=f.home;
 else if(drift==="manager")f.ctx.sessionManager={getSessionId:()=>"session-a"};
 else {await f.emit("session_shutdown");await f.emit("session_start");}
 await pending;
 if(drift==="restart")assert.ok(f.notices.every(message=>!/^Git |^CHANGES/u.test(message)),"Lifecycle notices are not Git publications");
 else assert.equal(f.notices.length,0);
 assert.equal(f.selects(),0);
});
test("non-Git missing session uses only a generic read error",async t=>{
 const f=await fixture(t);f.setId(undefined);
 const lines=await f.view();assert.deepEqual(lines,["Git diff could not be safely previewed; inspect the current repository state."]);
 assert.doesNotMatch(f.notices.join(""),/session-a|requires|[A-Z]:|ENOENT/);
});
test("non-Git throwing session reader withholds its raw exception",async t=>{
 const f=await fixture(t);f.ctx.sessionManager={getSessionId(){throw new Error("FOREIGN_PATH_PAYLOAD");}};
 assert.deepEqual(await f.view(),["Git diff could not be safely previewed; inspect the current repository state."]);
 assert.doesNotMatch(f.notices.join(""),/FOREIGN_PATH_PAYLOAD/);assert.equal(f.selects(),0);
});
test("non-Git unavailable repository is generic and does not select",async t=>{
 const f=await fixture(t);const lines=await f.view();assert.deepEqual(lines,["Git state unavailable for this project."]);
 assert.equal(f.selects(),0);assert.doesNotMatch(f.notices.join(""),/dubious|ownership|fatal|[A-Z]:/);
});

for(const drift of ["abort","session","project","manager","shutdown"] as const)test(`non-Git publication microtask rejects ${drift} after final handler check`,async t=>{
 const f=await fixture(t),controller=new AbortController();f.ctx.signal=controller.signal;
 let armed=false,queued=false,id:string|undefined,shutdown:Promise<void>|undefined;
 const order:string[]=[];
 // Only this invocation's public reader is observed; no Promise/global patch.
 // Missing session rejects identity asynchronously. Its catch performs the last
 // scope read, which queues drift ahead of registerData's Promise publication.
 f.ctx.sessionManager={getSessionId(){
  if(!armed)queueMicrotask(()=>{armed=true;});
  else if(!queued){
   queued=true;order.push("last handler read");
   queueMicrotask(()=>{
    order.push("drift");
    if(drift==="abort")controller.abort();
    else if(drift==="session")id="replacement";
    else if(drift==="project")f.ctx.cwd=f.home;
    else if(drift==="manager")f.ctx.sessionManager={getSessionId:()=>undefined};
    else shutdown=f.emit("session_shutdown");
   });
  }
  return id;
 }};
 let error:unknown;try{await f.view();}catch(caught){error=caught;}
 await shutdown;
 assert.deepEqual(order,["last handler read","drift"]);
 assert.equal(f.notices.filter(message=>message.startsWith("Git ")).length,0,"No stale Git notification at the actual publish boundary");
 assert.match(String(error),/Git inspection cancelled or context changed/);
 assert.equal(f.selects(),0);
});

test("non-Git shared directory identity rejects same-path replacement",async t=>{
 const f=await fixture(t),captured=captureWorkspaceRootIdentity(f.project);
 await rename(f.project,path.join(f.root,"original-project"));await mkdir(f.project);
 assert.throws(()=>assertWorkspaceRootIdentity(f.project,captured),/changed during snapshot/);
});
test("non-Git renderers bound narrow output and point to the registered preview",()=>{
 for(const width of [12,35,80]){
  const rows=renderGitDiffPreview({root:"unused",branch:"main",path:"long".repeat(50),status:"??",lines:["+"+"x".repeat(200)],truncated:true},width);
  assert.ok(rows.every(row=>visibleWidth(row)<=width));
 }
 const hint=renderAsenPanelSection({todos:[],agents:[],jobs:[]},"CHANGES",100).join("\n");
 assert.match(hint,/\/asen-changes-view/);
});

// Genuine Git setup only. Locally select the non-Git cases when ownership is unavailable;
// these public-command success paths remain runnable on an ownership-capable hosted filesystem.
async function gitFixture(t:TestContext){
 const f=await fixture(t);
 const git=(...args:string[])=>execFileSync("git",["-C",f.project,...args],{encoding:"utf8",stdio:["ignore","pipe","pipe"],timeout:5000,windowsHide:true});
 git("init");await writeFile(path.join(f.project,"base.txt"),"base\n",{flag:"wx"});
 git("add","base.txt");git("-c","user.name=Fixture","-c","user.email=fixture@example.invalid","-c","commit.gpgsign=false","commit","-m","fixture");
 const before=git("rev-parse","HEAD");
 t.after(()=>assert.equal(git("rev-parse","HEAD"),before,"Inspection must not mutate HEAD"));
 return {...f,git};
}
test("Git unique bounded labels map collisions to the exact original path",async t=>{
 const f=await gitFixture(t);
 const names=["a\tb.txt","a\u007fb.txt"]; // Both controls project to the same replacement glyph on POSIX.
 if(process.platform==="win32"){t.skip("Control-character filenames are not supported on Windows");return;}
 await writeFile(path.join(f.project,names[0]!),"FIRST_PAYLOAD\n");await writeFile(path.join(f.project,names[1]!),"SECOND_PAYLOAD\n");
 f.ctx.ui.select=async(_title:string,labels:string[])=>{
  assert.equal(new Set(labels).size,2);assert.ok(labels.every(label=>label.length<=100));
  assert.ok(labels.every(label=>label.endsWith("a�b.txt")));
  const originalIndex=parseWorkspaceStatus(f.git("status","--porcelain=v1","-z","--untracked-files=all")).findIndex(file=>file.path===names[1]);
  assert.ok(originalIndex>=0);return labels[originalIndex];
 };
 const before=f.git("status","--porcelain=v1","-z");
 const lines=await f.view();assert.match(lines.join("\n"),/SECOND_PAYLOAD/);assert.doesNotMatch(lines.join("\n"),/FIRST_PAYLOAD/);
 assert.equal(f.git("status","--porcelain=v1","-z"),before);
});
for(const action of ["cancel","invalid","read-error","abort","session","project","manager","restart","root"] as const)test(`Git selection ${action} discloses no diff`,async t=>{
 const f=await gitFixture(t),controller=new AbortController();f.ctx.signal=controller.signal;
 await writeFile(path.join(f.project,"change.txt"),"WITHHELD_PAYLOAD\n");
 f.ctx.ui.select=async(_title:string,labels:string[])=>{
  if(action==="cancel")return undefined;if(action==="invalid")return "not a choice";
  if(action==="read-error")throw new Error("FOREIGN_PATH_PAYLOAD");
  if(action==="abort")controller.abort();
  else if(action==="session")f.setId("other");
  else if(action==="project")f.ctx.cwd=f.home;
  else if(action==="manager")f.ctx.sessionManager={getSessionId:()=>"session-a"};
  else if(action==="restart"){await f.emit("session_shutdown");await f.emit("session_start");}
  else if(action==="root"){
   await rename(f.project,path.join(f.root,"original-project"));await mkdir(f.project);
  }
  return labels[0];
 };
 if(action==="cancel"||action==="invalid")assert.deepEqual(await f.view(),["Git diff inspection closed."]);
 else if(action==="read-error")assert.deepEqual(await f.view(),["Git diff could not be safely previewed; inspect the current repository state."]);
 else await assert.rejects(f.view(),/Git inspection cancelled or context changed/);
 assert.doesNotMatch(f.notices.join(""),/WITHHELD_PAYLOAD|FOREIGN_PATH_PAYLOAD/);
 // Restore the fixture route without deleting either owned directory for the HEAD assertion.
 if(action==="root"){await rename(f.project,path.join(f.root,"replacement-project"));await rename(path.join(f.root,"original-project"),f.project);}
});
test("Git selection reads current content and rejects removed membership",async t=>{
 const f=await gitFixture(t);await writeFile(path.join(f.project,"base.txt"),"OLD_PAYLOAD\n");
 f.ctx.ui.select=async(_title:string,labels:string[])=>{await writeFile(path.join(f.project,"base.txt"),"CURRENT_PAYLOAD\n");return labels[0];};
 assert.match((await f.view()).join("\n"),/CURRENT_PAYLOAD/);
 f.ctx.ui.select=async(_title:string,labels:string[])=>{await writeFile(path.join(f.project,"base.txt"),"base\n");return labels[0];};
 const lines=await f.view();assert.match(lines.join(""),/could not be safely previewed/);assert.doesNotMatch(lines.join(""),/CURRENT_PAYLOAD|OLD_PAYLOAD/);
});
test("Git selector discloses partial 100-entry choice set and bounded preview",async t=>{
 const f=await gitFixture(t);
 for(let i=0;i<101;i++)await writeFile(path.join(f.project,`entry-${String(i).padStart(3,"0")}.txt`),"line\n".repeat(170));
 f.ctx.ui.select=async(title:string,labels:string[])=>{assert.match(title,/100 of 101.*partial/i);assert.equal(labels.length,100);return labels[0];};
 const lines=await f.view();assert.ok(lines.length<=153);assert.match(lines.join("\n"),/truncated at 150 lines/);
 await writeFile(path.join(f.project,"oversized.txt"),"x".repeat(256*1024+1));
 assert.match((await f.view("oversized.txt")).join(""),/could not be safely previewed/);
});
test("Git explicit path and headless or missing selector retain index behavior",async t=>{
 const f=await gitFixture(t);await writeFile(path.join(f.project,"change.txt"),"EXPLICIT_PAYLOAD\n");
 f.ctx.mode="print";f.ctx.hasUI=false;assert.match((await f.view()).join(""),/1 changes/);assert.equal(f.selects(),0);
 assert.match((await f.view("change.txt")).join(""),/EXPLICIT_PAYLOAD/);
 f.ctx.mode="tui";f.ctx.hasUI=true;delete f.ctx.ui.select;assert.match((await f.view()).join(""),/1 changes/);
 assert.equal(await readFile(path.join(f.project,"change.txt"),"utf8"),"EXPLICIT_PAYLOAD\n");
});
