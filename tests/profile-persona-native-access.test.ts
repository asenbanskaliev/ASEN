import assert from "node:assert/strict";
import test,{after,type TestContext} from "node:test";
import {mkdir,mkdtemp,readFile,writeFile,access,symlink,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {readFileSync} from "node:fs";
import path from "node:path";
import {createPiExtension} from "../extensions/asen.js";
import {ASEN_PROFILES_SCHEMA,type RuntimeProfilesFile} from "../src/runtime/profiles.js";
import {canonicalProfilePartition,captureSessionProfile,selectSessionProfile,resetSessionProfile,readSessionProfile,clearSessionProfiles} from "../src/runtime/session-profile-binding.js";
import {selectPersonaStyle} from "../src/runtime/persona.js";
import {readProfilesFile} from "../src/runtime/profile-store.js";

const ownedFixtureRoots=new Set<string>();
after(async()=>{for(const root of ownedFixtureRoots)await rm(root,{recursive:true,force:true});});

async function fixture(t:TestContext,empty=false,sharedHome?:string){
 const root=await mkdtemp(path.join(tmpdir(),"native-access-")),home=sharedHome??path.join(root,"home"),project=path.join(root,"project");
 ownedFixtureRoots.add(root);
 for(const dir of [path.join(home,".asen"),path.join(project,".asen"),path.join(root,"tmp")])await mkdir(dir,{recursive:true});
 const previous=process.env.ASEN_NO_SKILL_REGISTRY;process.env.ASEN_NO_SKILL_REGISTRY="1";
 t.after(()=>{if(previous===undefined)delete process.env.ASEN_NO_SKILL_REGISTRY;else process.env.ASEN_NO_SKILL_REGISTRY=previous;});
 const file=path.join(home,".asen","profiles.json");
 if(!sharedHome)await writeFile(file,JSON.stringify({schema:ASEN_PROFILES_SCHEMA,...(empty?{}:{active:"A"}),profiles:empty?[]:[{name:"A",routes:{}},{name:"B",routes:{}}]}));
 const commands=new Map<string,any>(),events=new Map<string,Function[]>(),notices:string[]=[],screens:{title:string;choices:string[]}[]=[];
 let id="session-a",effects=0;
 const forbidden=()=>{effects++;throw new Error("Unexpected provider/model effect");};
 const ctx:any={cwd:project,mode:"rpc",hasUI:true,sessionManager:{getSessionId:()=>id},modelRegistry:{find:forbidden,getAvailable:forbidden,refresh:forbidden,getApiKey:forbidden,getAll:()=>[{provider:"catalog",id:"model"}] },
  ui:{input:async()=>queue.shift(),notify:(text:string)=>notices.push(text),setWidget(){},setStatus(){},select:async(title:string,choices:string[])=>{screens.push({title,choices});return queue.shift();}}};
 const queue:(string|undefined)[]=[];
 const pi:any={on(name:string,fn:Function){events.set(name,[...(events.get(name)??[]),fn]);},registerCommand(name:string,command:any){commands.set(name,command);},registerTool(){},getCommands:()=>[],getAllTools:()=>[],getFlag:()=>false,setModel:forbidden,sendMessage:forbidden,sendUserMessage:forbidden,setThinkingLevel:forbidden};
 createPiExtension({homeDir:()=>home,packageRoot:root,autoAdvancePlans:false,enableAgentRuntime:false,enableTodoRuntime:false,enableWorkspaceRuntime:false,enableMemoryRuntime:false})(pi);
 const emit=async(name:string)=>{for(const fn of [...events.get(name)??[]])await fn({},ctx);};
 await emit("session_start");assert.ok(commands.has("asen-profiles"),notices.join("\n"));
 t.after(async()=>{await emit("session_shutdown");assert.equal(effects,0);});
 const run=async(command:string,args="")=>{await commands.get(command).handler(args,ctx);return JSON.parse(notices.at(-1)!);};
 return {ctx,home,project,file,queue,screens,notices,commands,run,emit,setId:(value:string)=>{id=value;}};
}

const createChoices=(scope="Global",name="Created",model=true)=>["Create saved profile",scope,name,model?"Role: worker":"Unspecified defaults",...(model?["Catalog model: catalog/model"]:[]),"Save profile"];

const editChoices=(scope="Global",effort="Default (unspecified)")=>["Edit saved profile",scope,"Profile: A","Role: worker","Catalog model: catalog/model",effort,"Save profile"];
async function editFixture(t:TestContext,scope="Global",absent=false){
 const f=await fixture(t),local=path.join(f.project,".asen","profiles.json");
 const record={name:"A",routes:{worker:{model:"old/model",thinking:"high"},explorer:{},reviewer:{thinking:"low"},verifier:{model:"noncatalog/model"},custom:{model:"other/model",thinking:"max"}}};
 const value={schema:ASEN_PROFILES_SCHEMA,...(absent?{}:{active:"A"}),profiles:[record,{name:"B",routes:{}}]};
 await writeFile(f.file,JSON.stringify(value));await writeFile(local,JSON.stringify(value));
 f.ctx.modelRegistry.getAll=()=>[{provider:"catalog",id:"model",reasoning:false}];
 return {...f,target:scope==="Global"?f.file:local,other:scope==="Global"?local:f.file};
}
for(const scope of ["Global","Project"])for(const absent of [false,true])test(`native edit success ${scope} absent=${absent}`,async t=>{
 const f=await editFixture(t,scope,absent),before=await readProfilesFile(f.target),other=await readFile(f.other,"utf8");
 const inherited=(await f.run("asen-profiles","show")).sessionProfile;
 await f.run("asen-profiles","session A");const explicit=(await f.run("asen-profiles","show")).sessionProfile;
 f.queue.push(...editChoices(scope,absent?"off":"Default (unspecified)"));const result=await f.run("asen-profiles");
 const expected=structuredClone(before);expected.profiles[0]!.routes.worker={model:"catalog/model",...(absent?{thinking:"off" as const}:{})};
 assert.deepEqual(await readProfilesFile(f.target),expected);assert.equal(await readFile(f.other,"utf8"),other);
 assert.deepEqual((await f.run("asen-profiles","show")).sessionProfile,explicit);
 await f.run("asen-profiles","session --inherit");assert.deepEqual((await f.run("asen-profiles","show")).sessionProfile,inherited);
 assert.equal(result.saved,true);assert.match(f.screens.at(-1)!.title,new RegExp(`${scope}.*A.*worker.*catalog/model.*${absent?"off":"Default"}.*saved configuration only`,"i"));
});
for(const change of ["chosen","sibling","absent role","deleted","renamed","missing file"])test(`native edit conflict ${change}`,async t=>{
 const f=await editFixture(t),count=f.notices.length;let rejectedBytes="";
 const select=f.ctx.ui.select;f.ctx.ui.select=async(...args:any[])=>{
  const choice=await select(...args);if(choice==="Save profile"){
   const current=await readProfilesFile(f.target);
   if(change==="chosen")current.profiles[0]!.routes.worker={model:"changed/model"};
   if(change==="sibling")current.profiles[0]!.routes.custom={};
   if(change==="absent role")delete current.profiles[0]!.routes.explorer;
   if(change==="deleted") {current.profiles.shift();current.active="B";}
   if(change==="renamed") {current.profiles[0]!.name="Renamed";current.active="Renamed";}
   if(change==="missing file")await rm(f.target);else await writeFile(f.target,JSON.stringify(current));
   rejectedBytes=change==="missing file"?"":await readFile(f.target,"utf8");
  }return choice;
 };
 f.queue.push(...editChoices());await assert.rejects(f.run("asen-profiles"),/Saved profile changed or disappeared; nothing saved\. Reopen Edit\./);
 if(change==="missing file")await assert.rejects(access(f.target));else assert.equal(await readFile(f.target,"utf8"),rejectedBytes);
 assert.equal(f.notices.length,count);
});
for(const change of ["unrelated","default","reordered"])test(`native edit retains concurrent ${change}`,async t=>{
 const f=await editFixture(t),select=f.ctx.ui.select;let expected:RuntimeProfilesFile;
 f.ctx.ui.select=async(...args:any[])=>{
  const choice=await select(...args);if(choice==="Save profile"){
   const current=await readProfilesFile(f.target);
   if(change==="unrelated"){current.profiles[1]!.routes={worker:{model:"updated/other"}};current.profiles.push({name:"Added",routes:{}});}
   if(change==="default")current.active="B";
   if(change==="reordered")current.profiles[0]={routes:Object.fromEntries(Object.entries(current.profiles[0]!.routes).reverse().map(([role,route])=>[role,Object.fromEntries(Object.entries(route).reverse())])),name:"A"};
   await writeFile(f.target,JSON.stringify(current));expected=structuredClone(current);expected.profiles[0]!.routes.worker={model:"catalog/model"};
  }return choice;
 };
 f.queue.push(...editChoices());await f.run("asen-profiles");assert.deepEqual(await readProfilesFile(f.target),expected!);
});
test("native edit two independent hosts conflict instead of lost update",async t=>{
 const a=await editFixture(t),b=await fixture(t,false,a.home);b.setId("session-b");await b.emit("session_start");
 b.ctx.modelRegistry.getAll=a.ctx.modelRegistry.getAll;
 let release!:()=>void,ready!:()=>void;const gate=new Promise<void>(r=>{release=r;}),selected=new Promise<void>(r=>{ready=r;});
 const select=b.ctx.ui.select;b.ctx.ui.select=async(...args:any[])=>{const choice=await select(...args);if(choice==="Save profile"){ready();await gate;}return choice;};
 b.queue.push(...editChoices("Global","off"));const losing=b.run("asen-profiles");await selected;
 a.queue.push(...editChoices());await a.run("asen-profiles");const bytes=await readFile(a.file,"utf8"),count=b.notices.length;release();
 await assert.rejects(losing,/Saved profile changed or disappeared/);assert.equal(await readFile(a.file,"utf8"),bytes);assert.equal(b.notices.length,count);
});
test("native edit lists selected scope only and existing known own roles",async t=>{
 const f=await editFixture(t),local=path.join(f.project,".asen","profiles.json");
 await writeFile(local,JSON.stringify({schema:ASEN_PROFILES_SCHEMA,profiles:[{name:"Local",routes:{custom:{},worker:{}}}]}));
 f.queue.push("Edit saved profile","Project","Profile: Local","Back");await f.run("asen-profiles");
 assert.deepEqual(f.screens[2]!.choices,["Profile: Local","Back"]);assert.deepEqual(f.screens[3]!.choices,["Role: worker","Back"]);
 await writeFile(local,JSON.stringify({schema:ASEN_PROFILES_SCHEMA,profiles:[]}));
 f.queue.push("Edit saved profile","Project","Back");await f.run("asen-profiles");assert.deepEqual(f.screens.at(-1)!.choices,["Back"]);
});
for(const stage of [1,2,3,4,5,6])for(const cancel of [undefined,"Back"])test(`native edit cancellation ${stage} ${cancel??"Esc"}`,async t=>{
 const f=await editFixture(t),bytes=await readFile(f.target,"utf8"),count=f.notices.length,steps=editChoices();
 steps[stage]=cancel as string;f.queue.push(...steps.slice(0,stage+1));
 if(stage===5){await assert.rejects(f.run("asen-profiles"),/cancelled/);assert.equal(f.notices.length,count);}else await f.run("asen-profiles");
 assert.equal(await readFile(f.target,"utf8"),bytes);
});
for(const stage of [1,2,3,4,5,6])test(`native edit forged choice ${stage}`,async t=>{
 const f=await editFixture(t),bytes=await readFile(f.target,"utf8"),count=f.notices.length,steps=editChoices();steps[stage]="Forged";f.queue.push(...steps);
 await assert.rejects(f.run("asen-profiles"),/unknown choice/);assert.equal(await readFile(f.target,"utf8"),bytes);assert.equal(f.notices.length,count);
});
for(const catalog of ["missing","throws","invalid","empty"])test(`native edit catalog ${catalog}`,async t=>{
 const f=await editFixture(t),bytes=await readFile(f.target,"utf8");
 if(catalog==="missing")delete f.ctx.modelRegistry.getAll;
 if(catalog==="throws")f.ctx.modelRegistry.getAll=()=>{throw new Error("catalog failed");};
 if(catalog==="invalid")f.ctx.modelRegistry.getAll=()=>[{provider:"catalog",id:"bad\nmodel"}];
 if(catalog==="empty")f.ctx.modelRegistry.getAll=()=>[];
 f.queue.push(...editChoices().slice(0,4),"Back");
 if(catalog==="throws"||catalog==="invalid")await assert.rejects(f.run("asen-profiles"),/catalog failed|Invalid/);
 else {const result=await f.run("asen-profiles");if(catalog==="missing")assert.equal(result.available,false);else assert.deepEqual(f.screens.at(-1)?.choices,["Back"]);}
 assert.equal(await readFile(f.target,"utf8"),bytes);
});
for(const drift of ["manager","session","cwd","epoch","abort"])for(const stage of [1,2,3,4,5,6])test(`native edit freshness ${drift} await ${stage}`,async t=>{
 const f=await editFixture(t),bytes=await readFile(f.target,"utf8"),count=f.notices.length,abort=new AbortController();f.ctx.signal=abort.signal;
 const steps=editChoices();let index=0;
 f.ctx.ui.select=async()=>{const value=steps[index];if(index++===stage){
  if(drift==="manager")f.ctx.sessionManager={getSessionId:()=>"session-a"};if(drift==="session")f.setId("other");
  if(drift==="cwd")f.ctx.cwd=f.home;if(drift==="epoch")await f.emit("session_shutdown");if(drift==="abort")abort.abort();
 }return value;};
 await assert.rejects(f.run("asen-profiles"),/changed|cancelled/i);assert.equal(await readFile(f.target,"utf8"),bytes);assert.equal(f.notices.length,count);
});
for(const drift of ["manager","session","cwd","epoch","abort"])test(`native edit scope read freshness ${drift}`,async t=>{
 const f=await editFixture(t),bytes=await readFile(f.target,"utf8"),count=f.notices.length,abort=new AbortController();f.ctx.signal=abort.signal;
 const select=f.ctx.ui.select;let expired!:Promise<void>;
 f.ctx.ui.select=async(...args:any[])=>{const value=await select(...args);if(value==="Global")expired=new Promise<void>(resolve=>{
  // Let the scope selector's postguard and caller resume before expiring the pending file read.
  queueMicrotask(()=>queueMicrotask(()=>queueMicrotask(()=>{
   if(drift==="manager")f.ctx.sessionManager={getSessionId:()=>"session-a"};if(drift==="session")f.setId("other");
   if(drift==="cwd")f.ctx.cwd=f.home;if(drift==="abort")abort.abort();
   void (drift==="epoch"?f.emit("session_shutdown"):Promise.resolve()).then(resolve);
  })));
 });return value;};
 f.queue.push(...editChoices());await assert.rejects(f.run("asen-profiles"),/changed|cancelled/i);await expired;
 assert.equal(f.screens.length,2);assert.equal(await readFile(f.target,"utf8"),bytes);assert.equal(f.notices.length,count);
});
for(const drift of ["manager","session","cwd","epoch","abort"])test(`native edit real lock freshness ${drift}`,async t=>{
 const f=await editFixture(t),bytes=await readFile(f.target,"utf8"),count=f.notices.length,abort=new AbortController();f.ctx.signal=abort.signal;
 const {withExclusiveFileLock}=await import("../src/io/exclusive-file-lock.js");let release!:()=>void,ready!:()=>void,saved!:()=>void;
 const gate=new Promise<void>(r=>{release=r;}),locked=new Promise<void>(r=>{ready=r;}),saving=new Promise<void>(r=>{saved=r;});
 const select=f.ctx.ui.select;f.ctx.ui.select=async(...args:any[])=>{const value=await select(...args);if(value==="Save profile")saved();return value;};
 const holder=withExclusiveFileLock(f.target,async()=>{ready();await gate;});await locked;
 f.queue.push(...editChoices());let settled=false;const pending=f.run("asen-profiles").finally(()=>{settled=true;});await saving;
 await new Promise(r=>setTimeout(r,40));assert.equal(settled,false);
 if(drift==="manager")f.ctx.sessionManager={getSessionId:()=>"session-a"};if(drift==="session")f.setId("other");
 if(drift==="cwd")f.ctx.cwd=f.home;if(drift==="epoch")await f.emit("session_shutdown");if(drift==="abort")abort.abort();release();await holder;
 await assert.rejects(pending,/changed|cancelled/i);assert.equal(await readFile(f.target,"utf8"),bytes);assert.equal(f.notices.length,count);
});
test("native edit suppresses stale publication after persistence without rollback",async t=>{
 const f=await editFixture(t),count=f.notices.length;let persisted=false;
 f.ctx.sessionManager.getSessionId=()=>{persisted=JSON.parse(readFileSync(f.target,"utf8")).profiles[0].routes.worker.model==="catalog/model";return persisted?"other":"session-a";};
 f.queue.push(...editChoices());await assert.rejects(f.run("asen-profiles"),/changed/);
 assert.equal(persisted,true);assert.equal((await readProfilesFile(f.target)).profiles[0]!.routes.worker!.model,"catalog/model");assert.equal(f.notices.length,count);
});

const effortCases=[
 {name:"unknown",metadata:{},levels:[]},
 {name:"missing reasoning with map",metadata:{thinkingLevelMap:{max:"highest"}},levels:[]},
 {name:"nonreasoning",metadata:{reasoning:false,thinkingLevelMap:{max:"highest",off:null}},levels:["off"]},
 {name:"reasoning defaults",metadata:{reasoning:true},levels:["off","minimal","low","medium","high"]},
 {name:"null exclusions",metadata:{reasoning:true,thinkingLevelMap:{off:null,minimal:null,high:null,xhigh:null,max:null}},levels:["low","medium"]},
 {name:"mapped xhigh",metadata:{reasoning:true,thinkingLevelMap:{xhigh:"extra"}},levels:["off","minimal","low","medium","high","xhigh"]},
 {name:"mapped max only",metadata:{reasoning:true,thinkingLevelMap:{max:"highest"}},levels:["off","minimal","low","medium","high","max"]},
 {name:"invalid mapping value",metadata:{reasoning:true,thinkingLevelMap:{max:123}},levels:[]},
 {name:"all seven",metadata:{reasoning:true,thinkingLevelMap:{xhigh:"extra",max:"highest"}},levels:["off","minimal","low","medium","high","xhigh","max"]},
 {name:"all excluded",metadata:{reasoning:true,thinkingLevelMap:{off:null,minimal:null,low:null,medium:null,high:null,xhigh:null,max:null}},levels:[]},
];
for(const {name,metadata,levels} of effortCases)test(`native create effort Default: ${name}`,async t=>{
 const f=await fixture(t),before=await readProfilesFile(f.file);
 f.ctx.modelRegistry.getAll=()=>[{provider:"catalog",id:"model",...metadata}];
 const steps=createChoices();if(levels.length)steps.splice(5,0,"Default (unspecified)");
 f.queue.push(...steps);await f.run("asen-profiles");
 const dialog=f.screens.find(screen=>screen.title.startsWith("Declared catalog effort"));
 if(levels.length){assert.deepEqual(dialog?.choices,["Default (unspecified)",...levels,"Back"]);assert.match(dialog!.title,/not provider-used/);}
 else assert.equal(dialog,undefined,"unknown/no supported options retain the old Default-only flow");
 assert.deepEqual(await readProfilesFile(f.file),{...before,profiles:[...before.profiles,{name:"Created",routes:{worker:{model:"catalog/model"}}}]});
});

for(const scope of ["Global","Project"])for(const effort of ["off","minimal","low","medium","high","xhigh","max"])test(`native create effort explicit ${scope}: ${effort}`,async t=>{
 const f=await fixture(t,effort!=="off"),projectFile=path.join(f.project,".asen","profiles.json"),target=scope==="Global"?f.file:projectFile;
 if(scope==="Project"&&effort==="off")await writeFile(projectFile,await readFile(f.file,"utf8"));
 const before=await readProfilesFile(target);
 const frozen=(await f.run("asen-profiles","show")).sessionProfile,global=await readFile(f.file,"utf8");
 f.ctx.modelRegistry.getAll=()=>[{provider:"catalog",id:"model",reasoning:true,thinkingLevelMap:{xhigh:"extra",max:"highest"}}];
 const steps=createChoices(scope);steps.splice(5,0,effort);f.queue.push(...steps);await f.run("asen-profiles");
 assert.deepEqual(await readProfilesFile(target),{...before,profiles:[...before.profiles,{name:"Created",routes:{worker:{model:"catalog/model",thinking:effort}}}]});
 if(scope==="Project")assert.equal(await readFile(f.file,"utf8"),global);else await assert.rejects(access(projectFile));
 assert.deepEqual((await f.run("asen-profiles","show")).sessionProfile,frozen);
 assert.match(f.screens.at(-1)!.title,new RegExp(`effort: ${effort}`));
});

for(const [choice,metadata] of [
 ["xhigh",{reasoning:true}],["max",{reasoning:true}],
 ["medium",{reasoning:true,thinkingLevelMap:{medium:null}}],["off",{reasoning:true,thinkingLevelMap:{off:null}}],
 ["high",{reasoning:false}],["Default extra",{reasoning:true}],
] as const)test(`native create effort rejects unsupported/forged ${choice}`,async t=>{
 const f=await fixture(t),bytes=await readFile(f.file,"utf8"),count=f.notices.length;
 f.ctx.modelRegistry.getAll=()=>[{provider:"catalog",id:"model",...metadata}];
 const steps=createChoices();steps.splice(5,0,choice);f.queue.push(...steps);
 await assert.rejects(f.run("asen-profiles"),/unknown choice/);
 assert.equal(await readFile(f.file,"utf8"),bytes);assert.equal(f.notices.length,count);
});

for(const choice of [undefined,"Back"])test(`native create effort cancels ${choice??"Esc"}`,async t=>{
 const f=await fixture(t),bytes=await readFile(f.file,"utf8"),count=f.notices.length;
 f.ctx.modelRegistry.getAll=()=>[{provider:"catalog",id:"model",reasoning:false}];
 f.queue.push(...createChoices().slice(0,5),choice);await assert.rejects(f.run("asen-profiles"),/cancelled/);
 assert.equal(f.notices.length,count);
 assert.ok(f.screens.some(screen=>screen.title.startsWith("Declared catalog effort")));
 assert.equal(await readFile(f.file,"utf8"),bytes);await assert.rejects(access(path.join(f.project,".asen","profiles.json")));
});

for(const drift of ["manager","session","cwd","epoch","abort"])test(`native create effort rejects dialog drift ${drift}`,async t=>{
 const f=await fixture(t),bytes=await readFile(f.file,"utf8"),count=f.notices.length,abort=new AbortController();f.ctx.signal=abort.signal;
 f.ctx.modelRegistry.getAll=()=>[{provider:"catalog",id:"model",reasoning:false}];
 const select=f.ctx.ui.select;f.ctx.ui.select=async(title:string,choices:string[])=>{
  const value=await select(title,choices);if(title.startsWith("Declared catalog effort")){
   if(drift==="manager")f.ctx.sessionManager={getSessionId:()=>"session-a"};if(drift==="session")f.setId("other");
   if(drift==="cwd")f.ctx.cwd=f.home;if(drift==="epoch")await f.emit("session_shutdown");if(drift==="abort")abort.abort();
  }return value;
 };
 const steps=createChoices();steps.splice(5,0,"off");f.queue.push(...steps);
 await assert.rejects(f.run("asen-profiles"),/changed|cancelled/);
 assert.equal(await readFile(f.file,"utf8"),bytes);assert.equal(f.notices.length,count);
});

for(const scope of ["Global","Project"])for(const absent of [false,true])test(`create saved profile ${scope}, absent active=${absent}`,async t=>{
 const f=await fixture(t,absent),projectFile=path.join(f.project,".asen","profiles.json");
 await writeFile(projectFile,JSON.stringify({schema:ASEN_PROFILES_SCHEMA,...(absent?{}:{active:"Local"}),profiles:[{name:"Local",routes:{}}]}));
 // The same name in the other scope must neither block creation nor get overwritten.
 const otherFile=scope==="Global"?projectFile:f.file,other=await readProfilesFile(otherFile);
 await writeFile(otherFile,JSON.stringify({...other,profiles:[...other.profiles,{name:"Created",routes:{reviewer:{model:"other/scope"}}}]}));
 const global=await readProfilesFile(f.file),project=await readProfilesFile(projectFile),shown=await f.run("asen-profiles","show");
 f.queue.push(...createChoices(scope));await f.run("asen-profiles");
 const target=scope==="Global"?f.file:projectFile,old=scope==="Global"?global:project;
 assert.deepEqual(await readProfilesFile(target),{...old,profiles:[...old.profiles,{name:"Created",routes:{worker:{model:"catalog/model"}}}]});
 assert.deepEqual(await readProfilesFile(scope==="Global"?projectFile:f.file),scope==="Global"?project:global);
 assert.deepEqual((await f.run("asen-profiles","show")).sessionProfile,shown.sessionProfile);
});

test("create saved profile rejects atomic concurrent duplicates across separate hosts",async t=>{
 const a=await fixture(t),b=await fixture(t,false,a.home);b.setId("session-b");await b.emit("session_start");
 b.ctx.modelRegistry.getAll=()=>[{provider:"catalog",id:"second"}];
 const before=await readProfilesFile(a.file);a.queue.push(...createChoices());
 const second=createChoices();second[4]="Catalog model: catalog/second";b.queue.push(...second);
 const results=await Promise.allSettled([a.run("asen-profiles"),b.run("asen-profiles")]);
 assert.equal(results.filter(r=>r.status==="fulfilled").length,1);
 assert.match(String((results.find(r=>r.status==="rejected") as PromiseRejectedResult).reason),/already exists/);
 const winner=results[0]!.status==="fulfilled"?"catalog/model":"catalog/second";
 assert.deepEqual(await readProfilesFile(a.file),{...before,profiles:[...before.profiles,{name:"Created",routes:{worker:{model:winner}}}]});
 a.queue.push(...createChoices("Global","A"));const bytes=await readFile(a.file,"utf8");
 await assert.rejects(a.run("asen-profiles"),/already exists/);assert.equal(await readFile(a.file,"utf8"),bytes);
});

for(const scope of ["Global","Project"])test(`create refuses existing ${scope} name without writes`,async t=>{
 const f=await fixture(t),file=scope==="Global"?f.file:path.join(f.project,".asen","profiles.json");
 if(scope==="Project")await writeFile(file,await readFile(f.file,"utf8"));
 const bytes=await readFile(file,"utf8"),count=f.notices.length;
 f.queue.push(...createChoices(scope,"A"));await assert.rejects(f.run("asen-profiles"),/already exists/);
 assert.equal(await readFile(file,"utf8"),bytes);assert.equal(f.notices.length,count);
});

for(const stage of [1,2,3,4,5])for(const cancel of [undefined,"Back"])test(`create cancel ${stage} ${cancel??"Esc"}`,async t=>{
 const f=await fixture(t),bytes=await readFile(f.file,"utf8"),steps=createChoices();steps[stage]=cancel as string;
 f.queue.push(...steps.slice(0,stage+1));await f.run("asen-profiles");
 assert.equal(await readFile(f.file,"utf8"),bytes);await assert.rejects(access(path.join(f.project,".asen","profiles.json")));
});

for(const invalid of ["name","model","scope","route","save","malformed"])test(`create rejects ${invalid}`,async t=>{
 const f=await fixture(t),steps=createChoices();
 if(invalid==="name")steps[2]="bad name";
 if(invalid==="model")f.ctx.modelRegistry.getAll=()=>[{provider:"catalog",id:"bad\nmodel"}];
 if(invalid==="scope")steps[1]="Elsewhere";if(invalid==="route")steps[3]="Orchestrator";if(invalid==="save")steps[5]="Activate";
 if(invalid==="malformed")await writeFile(f.file,"{broken");
 const bytes=await readFile(f.file,"utf8"),count=f.notices.length;f.queue.push(...steps);
 await assert.rejects(f.run("asen-profiles"),/Invalid|unknown/i);
 assert.equal(await readFile(f.file,"utf8"),bytes);assert.equal(f.notices.length,count);
});

for(const drift of ["manager","session","cwd","epoch","abort"])for(const stage of [1,2,3,4,5])test(`create freshness ${drift} await ${stage}`,async t=>{
 const f=await fixture(t),steps=createChoices(),bytes=await readFile(f.file,"utf8"),count=f.notices.length,abort=new AbortController();f.ctx.signal=abort.signal;
 let index=0;
 const next=async()=>{const value=steps[index];if(index++===stage){
  if(drift==="manager")f.ctx.sessionManager={getSessionId:()=>"session-a"};if(drift==="session")f.setId("other");
  if(drift==="cwd")f.ctx.cwd=f.home;if(drift==="epoch")await f.emit("session_shutdown");if(drift==="abort")abort.abort();
 }return value;};f.ctx.ui.select=next;f.ctx.ui.input=next;
 await assert.rejects(f.run("asen-profiles"),/changed|cancelled/i);
 assert.equal(await readFile(f.file,"utf8"),bytes);assert.equal(f.notices.length,count);
});

for(const drift of ["abort","session","cwd","manager","epoch"])test(`create guards freshness after waiting for authoritative store read: ${drift}`,async t=>{
 const f=await fixture(t),bytes=await readFile(f.file,"utf8"),count=f.notices.length,abort=new AbortController();f.ctx.signal=abort.signal;
 let release!:()=>void;const gate=new Promise<void>(r=>{release=r;});
 // Hold a real lock via the public lock seam, never replace the store or its callback.
 const {withExclusiveFileLock}=await import("../src/io/exclusive-file-lock.js");
 let locked!:()=>void;const ready=new Promise<void>(r=>{locked=r;});
 const holder=withExclusiveFileLock(f.file,async()=>{locked();await gate;});await ready;
 f.queue.push(...createChoices());const select=f.ctx.ui.select;
 let waiting!:()=>void;const saved=new Promise<void>(r=>{waiting=r;});
 f.ctx.ui.select=async(...args:any[])=>{const choice=await select(...args);if(choice==="Save profile")waiting();return choice;};
 let settled=false;const saving=f.run("asen-profiles").finally(()=>{settled=true;});await saved;
 await new Promise(r=>setTimeout(r,40));assert.equal(settled,false,"save must wait behind the store lock");
 if(drift==="abort")abort.abort();if(drift==="session")f.setId("other");if(drift==="cwd")f.ctx.cwd=f.home;
 if(drift==="manager")f.ctx.sessionManager={getSessionId:()=>"session-a"};if(drift==="epoch")await f.emit("session_shutdown");
 release();await holder;
 await assert.rejects(saving,/cancelled|changed/);assert.equal(await readFile(f.file,"utf8"),bytes);assert.equal(f.notices.length,count);
});

test("create suppresses stale publication after persistence; saved bytes cannot be rolled back",async t=>{
 const f=await fixture(t),count=f.notices.length;let persisted=false;
 f.ctx.sessionManager.getSessionId=()=>{
  persisted=JSON.parse(readFileSync(f.file,"utf8")).profiles.some((p:{name:string})=>p.name==="Created");
  return persisted?"other":"session-a";
 };
 f.queue.push(...createChoices());await assert.rejects(f.run("asen-profiles"),/changed/);
 assert.equal(persisted,true);assert.equal((await readProfilesFile(f.file)).profiles.at(-1)?.name,"Created");assert.equal(f.notices.length,count);
});

test("create unavailable catalog cannot invent a model or write a role profile",async t=>{
 const f=await fixture(t),bytes=await readFile(f.file,"utf8");delete f.ctx.modelRegistry.getAll;
 f.queue.push(...createChoices());assert.equal((await f.run("asen-profiles")).available,false);
 assert.equal(await readFile(f.file,"utf8"),bytes);
 f.queue.length=0;f.ctx.modelRegistry.getAll=()=>[];f.queue.push(...createChoices().slice(0,4),"Back");
 await f.run("asen-profiles");assert.deepEqual(f.screens.at(-1)?.choices,["Back"]);assert.equal(await readFile(f.file,"utf8"),bytes);
});

test("create permits unspecified defaults without catalog, but missing input is unavailable",async t=>{
 const f=await fixture(t,true);delete f.ctx.modelRegistry.getAll;
 f.queue.push(...createChoices("Global","Empty",false));await f.run("asen-profiles");
 assert.deepEqual((await readProfilesFile(f.file)).profiles,[{name:"Empty",routes:{}}]);
 const bytes=await readFile(f.file,"utf8");delete f.ctx.ui.input;f.queue.push("Create saved profile");
 assert.equal((await f.run("asen-profiles")).available,false);assert.equal(await readFile(f.file,"utf8"),bytes);
});

test("bare production profile access selects session/default/inherit without refreshing frozen capture",async t=>{
 const f=await fixture(t);
 f.queue.push("Make default","Profile: B");await f.run("asen-profiles");
 assert.equal(f.screens.length,2,"bare command must open native selectors, not JSON only");
 assert.equal(JSON.parse(await readFile(f.file,"utf8")).active,"B");
 assert.equal((await f.run("asen-profiles","show")).sessionProfile.active,"A","saved default must not refresh current capture");
 f.queue.push("Use this session","Profile: B");await f.run("asen-profiles");
 assert.equal((await f.run("asen-profiles","show")).sessionProfile.active,"B");
 f.queue.push("Restore captured inheritance");await f.run("asen-profiles");
 const shown=await f.run("asen-profiles","show");assert.equal(shown.active,"B");assert.equal(shown.sessionProfile.active,"A");
 assert.equal(shown.fallback,"unsupported");assert.equal(shown.cooldown,"unsupported");
});

test("bare persona selects styles; show/headless and old explicit commands bypass menus",async t=>{
 const f=await fixture(t);f.queue.push("simple");await f.run("asen-persona");
 assert.equal(f.screens.length,1,"bare persona must open a selector");
 assert.deepEqual(await f.run("asen-persona","show"),{style:"simple",source:"global",available:true});
 await assert.rejects(access(path.join(f.project,".asen","persona.json")));
 assert.equal((await f.run("asen-persona","neutral")).style,"neutral");
 const count=f.screens.length;f.ctx.hasUI=false;
 assert.equal((await f.run("asen-persona")).style,"neutral");
 assert.deepEqual(await f.run("asen-profiles"),await f.run("asen-profiles","show"));
 f.ctx.hasUI=true;delete f.ctx.ui.select;await f.run("asen-persona");await f.run("asen-profiles");
 assert.equal(f.screens.length,count);
 await f.run("asen-profiles","session B");await f.run("asen-profiles","global B");await f.run("asen-profiles","session --inherit");
 assert.equal((await f.run("asen-profiles","show")).sessionProfile.active,"A");
 for(const [command,args] of [["asen-persona","show extra"],["asen-persona","bogus"],["asen-profiles","show extra"],["asen-profiles","global missing"]] as const){
  const before=f.notices.length;
  if(args==="global missing")await assert.rejects(f.run(command,args),/Profile does not exist/);
  else {await f.commands.get(command).handler(args,f.ctx);assert.match(f.notices[before]!,/^Usage:/);
   if(command==="asen-persona")assert.equal(f.notices[before],"Usage: /asen-persona [show | professional | neutral | simple]");}
 }
});

for(const empty of [false,true])test(`Esc/Back are nonmutating; empty=${empty}`,async t=>{
 const f=await fixture(t,empty),before=await readFile(f.file,"utf8");
 f.queue.push("Use this session","Back","Back");await f.run("asen-profiles");
 assert.equal(f.screens.length,3);if(empty){assert.deepEqual(f.screens[1]!.choices,["Back"]);assert.match(f.screens[1]!.title,/No saved profiles/);}
 f.queue.push(undefined);await f.run("asen-profiles");f.queue.push(undefined);await f.run("asen-persona");
 assert.equal(await readFile(f.file,"utf8"),before);
 await assert.rejects(access(path.join(f.home,".asen","persona.json")));
});

for(const command of ["asen-profiles","asen-persona"])for(const drift of ["forged","abort","session","project","manager","shutdown"])
 test(`${command} rejects ${drift} without writes/publication`,async t=>{
  const f=await fixture(t),before=await readFile(f.file,"utf8"),count=f.notices.length,abort=new AbortController();f.ctx.signal=abort.signal;
  f.ctx.ui.select=async()=>{
   if(drift==="abort")abort.abort();if(drift==="session")f.setId("other");if(drift==="project")f.ctx.cwd=f.home;
   if(drift==="manager")f.ctx.sessionManager={getSessionId:()=>"session-a"};if(drift==="shutdown")await f.emit("session_shutdown");
   if(drift==="forged")return "forged";
   return command==="asen-persona"?"simple":"Make default";
  };
  await assert.rejects(f.run(command),/unknown|changed|cancelled/i);assert.equal(f.notices.length,count);
  assert.equal(await readFile(f.file,"utf8"),before);await assert.rejects(access(path.join(f.home,".asen","persona.json")));
 });

for(const selected of ["Profile: missing","Back extra",""])test(`nested profile picker rejects forged label ${JSON.stringify(selected)}`,async t=>{
 const f=await fixture(t),before=await readFile(f.file,"utf8"),count=f.notices.length;
 f.queue.push("Make default",selected);await assert.rejects(f.run("asen-profiles"),/unknown choice/);
 assert.equal(await readFile(f.file,"utf8"),before);assert.equal(f.notices.length,count);
});

test("persona persistence guard blocks later project write; completed global write is not rolled back",async t=>{
 const f=await fixture(t),global=path.join(f.home,".asen","persona.json"),project=path.join(f.project,".asen","persona.json");
 await selectPersonaStyle(global,project,"neutral");
 await writeFile(project,JSON.stringify({schema:"asen.persona/v1",style:"professional"}));
 await assert.rejects(selectPersonaStyle(global,project,"simple",()=>{
  // The guard observes completed global persistence and expires before any later write.
  const current=requireStyle(global);if(current==="simple")throw new Error("expired");
 }),/expired/);
 assert.equal(JSON.parse(await readFile(global,"utf8")).style,"simple");
 assert.equal(JSON.parse(await readFile(project,"utf8")).style,"professional");
});
function requireStyle(file:string){return JSON.parse(readFileSync(file,"utf8")).style;}

for(const drift of ["session","project","abort","shutdown"])test(`production persona expires after global write on ${drift}; no later write/notify`,async t=>{
 const f=await fixture(t),global=path.join(f.home,".asen","persona.json"),project=path.join(f.project,".asen","persona.json");
 await selectPersonaStyle(global,project,"neutral");
 await writeFile(project,JSON.stringify({schema:"asen.persona/v1",style:"professional"}));
 const count=f.notices.length,abort=new AbortController();f.ctx.signal=abort.signal;let expired=false,shutdown:Promise<void>|undefined;
 f.ctx.sessionManager.getSessionId=()=>{
  if(!expired&&requireStyle(global)==="simple"){
   expired=true;
   if(drift==="project")f.ctx.cwd=f.home;
   if(drift==="abort")abort.abort();
   if(drift==="shutdown")shutdown=f.emit("session_shutdown");
  }
  return expired&&drift==="session"?"other":"session-a";
 };
 f.queue.push("simple");await assert.rejects(f.run("asen-persona"),/cancelled|changed/i);await shutdown;
 assert.equal(expired,true);assert.equal(requireStyle(global),"simple");assert.equal(requireStyle(project),"professional");assert.equal(f.notices.length,count);
});

for(const operation of ["select","reset"])for(const drift of ["abort","session","cwd","epoch"])test(`commit freshness: ${operation} rejects microtask ${drift} without binding mutation`,async t=>{
 const partition=`native-commit-${operation}-${drift}`,owner={sessionId:"commit",projectId:path.resolve(tmpdir())};
 const file:RuntimeProfilesFile={schema:ASEN_PROFILES_SCHEMA,active:"A",profiles:[{name:"A",routes:{}},{name:"B",routes:{}}]},load=async()=>file;
 t.after(()=>clearSessionProfiles(partition,owner.sessionId));await captureSessionProfile(partition,owner,load);
 if(operation==="reset")await selectSessionProfile(partition,owner,"B",load);
 const before=await readSessionProfile(partition,owner),live:Record<string,unknown>={abort:false,session:owner.sessionId,cwd:owner.projectId,epoch:0},trusted=structuredClone(live);
 const validate=()=>{assert.deepEqual(live,trusted);queueMicrotask(()=>{live[drift]=drift==="abort"?true:drift==="epoch"?1:"other";});};
 const commit=()=>{assert.deepEqual(live,trusted,"commit expired: "+drift);return true;};
 const args=operation==="select"?[partition,owner,"B",load,validate,commit]:[partition,owner,load,validate,commit];
 const rejected=await Reflect.apply(operation==="select"?selectSessionProfile:resetSessionProfile,undefined,args).then(()=>false,()=>true);
 assert.deepEqual(await readSessionProfile(partition,owner),before);assert.equal(rejected,true);
});

test("native session command: abort queued by final async validation leaves binding unchanged",async t=>{
 const f=await fixture(t),partition=await canonicalProfilePartition(f.file),owner={sessionId:"session-a",projectId:f.project};
 const before=await readSessionProfile(partition,owner),bytes=await readFile(f.file,"utf8"),count=f.notices.length,abort=new AbortController();f.ctx.signal=abort.signal;
 let validationChecks=0;
 f.ctx.sessionManager.getSessionId=()=>{
  // Observe the two direct assertContext calls in validate, not nested native guard reads.
  const stack=new Error().stack??"";
  if(stack.split("\n")[2]?.includes("assertContext")&&stack.includes("at validate")&&++validationChecks===2)queueMicrotask(()=>abort.abort());
  return "session-a";
 };
 f.queue.push("Use this session","Profile: B");await assert.rejects(f.run("asen-profiles"),/cancelled/);
 assert.equal(validationChecks>=2,true);assert.deepEqual(await readSessionProfile(partition,owner),before);
 assert.equal(f.notices.length,count);assert.equal(await readFile(f.file,"utf8"),bytes);
});

test("commit guard rejects nonconfirmation/async and rechecks callback ownership/revision",async()=>{
 const partition="native-commit-callback",owner={sessionId:"commit",projectId:path.resolve(tmpdir())};
 const file:RuntimeProfilesFile={schema:ASEN_PROFILES_SCHEMA,active:"A",profiles:[{name:"A",routes:{}},{name:"B",routes:{}}]},load=async()=>file;
 await captureSessionProfile(partition,owner,load);const before=await readSessionProfile(partition,owner);
 for(const guard of [()=>undefined,()=>false,async()=>true,()=>Promise.reject(new Error("async rejected"))]){
  await assert.rejects(Reflect.apply(selectSessionProfile,undefined,[partition,owner,"B",load,undefined,guard]),/synchronous.*true/);
  assert.deepEqual(await readSessionProfile(partition,owner),before);
 }
 await assert.rejects(Reflect.apply(selectSessionProfile,undefined,[partition,owner,"B",load,undefined,()=>{clearSessionProfiles(partition,owner.sessionId);return true;}]),/ended/);
 assert.equal(await readSessionProfile(partition,owner),undefined);
 let newer:ReturnType<typeof selectSessionProfile>|undefined;
 await assert.rejects(Reflect.apply(selectSessionProfile,undefined,[partition,owner,"B",load,undefined,()=>{newer=selectSessionProfile(partition,owner,"A",load);return true;}]),/superseded/);
 await newer;assert.equal((await readSessionProfile(partition,owner))?.active,"A");clearSessionProfiles(partition,owner.sessionId);
 let loads=0;const capture=()=>captureSessionProfile(partition,owner,async()=>{loads++;return file;});
 const captures=await Promise.all([capture(),capture()]);assert.equal(loads,1);assert.deepEqual(captures[0],captures[1]);
 const selections=await Promise.allSettled([selectSessionProfile(partition,owner,"B",load),selectSessionProfile(partition,owner,"A",load)]);
 assert.deepEqual(selections.map(result=>result.status),["rejected","fulfilled"]);clearSessionProfiles(partition,owner.sessionId);
});

test("legacy persona persistence keeps absent override absent and rejects malformed/symlink configuration",async t=>{
 const f=await fixture(t),global=path.join(f.home,".asen","persona.json"),project=path.join(f.project,".asen","persona.json");
 assert.equal((await selectPersonaStyle(global,project,"neutral")).source,"global");await assert.rejects(access(project));
 await writeFile(project,JSON.stringify({schema:"asen.persona/v1",style:"professional"}));
 assert.equal((await f.run("asen-persona","simple")).source,"project");
 assert.equal(requireStyle(global),"simple");assert.equal(requireStyle(project),"simple");
 const before=await readFile(global,"utf8");await writeFile(project,"{malformed");
 await assert.rejects(selectPersonaStyle(global,project,"simple"),/Invalid persona configuration/);assert.equal(await readFile(global,"utf8"),before);
 const linked=path.join(f.home,"linked");await symlink(path.dirname(global),linked,"junction");
 await assert.rejects(selectPersonaStyle(path.join(linked,"persona.json"),path.join(f.home,"absent","persona.json"),"simple"),/real directory/);
 assert.equal(await readFile(global,"utf8"),before);
});
