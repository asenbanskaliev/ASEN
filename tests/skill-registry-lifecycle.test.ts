import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,mkdir,rm} from "node:fs/promises";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {createAsenExtension} from "../extensions/asen.js";

test("registry startup refresh and shutdown use actual extension event registration",async t=>{
 const root=await mkdtemp(join(tmpdir(),"asen-registry-life-"));t.after(()=>rm(root,{recursive:true,force:true}));
 const events=new Map<string,any>();let refreshes=0;
 createAsenExtension({homeDir:()=>root,packageRoot:root,refresh:async options=>{refreshes++;return {path:join(options.projectRoot,".asen/skill-registry.md"),count:0,cache:"hit",persistence:{status:"unavailable"},entries:[],skipped:[]};}})({registerCommand(){},on:(event:string,fn:any)=>events.set(event,fn)} as any);
 assert.ok(events.has("session_start"));assert.ok(events.has("session_shutdown"));
 await events.get("session_start")({}, {cwd:root,hasUI:false,ui:{notify(){}}});assert.equal(refreshes,1);
 await events.get("session_shutdown")({});
});

import {RegistryLifecycle,registryStartupDisabled} from "../src/skills/registry-lifecycle.js";
const delay=()=>new Promise(resolve=>setTimeout(resolve,25));
const observed=(root:string)=>({path:join(root,".asen/skill-registry.md"),count:0,cache:"hit" as const,persistence:{status:"unavailable" as const},entries:[],skipped:[]});

test("watch debounce, write serialization, shutdown and late callbacks preserve project isolation",async t=>{
 const root=await mkdtemp(join(tmpdir(),"asen-registry-watch-"));t.after(()=>rm(root,{recursive:true,force:true}));
 const second=join(root,"second");await mkdir(second);
 const changes:Array<()=>void>=[],notifications:string[]=[];let calls=0,closed=0,active=0,max=0;
 const lifecycle=new RegistryLifecycle({debounceMs:5,prepare:async cwd=>({projectRoot:cwd,projectId:cwd,sources:[{id:"one",scope:"project",root:cwd}]}),refresh:async options=>{calls++;max=Math.max(max,++active);await delay();active--;return observed(options.projectRoot);},watch:(_root,changed)=>{changes.push(changed);return {close(){closed++;}};}});
 const ctx=(cwd:string)=>({cwd,hasUI:true,ui:{notify:(message:string)=>notifications.push(message)}});
 await lifecycle.start(ctx(root));assert.equal(calls,1);changes[0]!();changes[0]!();changes[0]!();await delay();await lifecycle.shutdown();assert.equal(calls,2);assert.equal(closed,1);
 changes[0]!();await delay();assert.equal(calls,2,"late callbacks must not write");
 await lifecycle.start(ctx(second));assert.equal(calls,3);changes[0]!();await delay();assert.equal(calls,3);
 await Promise.all([lifecycle.refresh(second),lifecycle.refresh(second)]);assert.equal(max,1);
 changes[1]!();await lifecycle.shutdown();await delay();assert.equal(calls,5,"pending debounce must be cancelled");assert.equal(closed,2);
 assert.ok(notifications.every(value=>!value.includes("undefined")));
});
test("disable, unavailable watcher and failing startup remain honest and recoverable",async t=>{
 const root=await mkdtemp(join(tmpdir(),"asen-registry-disable-"));t.after(()=>rm(root,{recursive:true,force:true}));
 let calls=0,fail=true;const notices:string[]=[];
 const lifecycle=new RegistryLifecycle({prepare:async cwd=>({projectRoot:cwd,projectId:cwd,sources:[{id:"one",scope:"project",root:cwd}]}),refresh:async()=>{calls++;if(fail)throw Error("private secret");return observed(root);},watch:()=>{throw Error("unsupported filesystem");}});
 const ctx={cwd:root,hasUI:true,ui:{notify:(message:string)=>notices.push(message)}};
 await lifecycle.start(ctx,true);assert.equal(calls,0);await lifecycle.start(ctx);assert.equal(calls,1);assert.match(notices[0]!,/startup failed/);assert.ok(!notices.join().includes("private secret"));
 fail=false;await lifecycle.start(ctx);assert.match(notices.at(-1)!,/watcher unavailable/);await lifecycle.shutdown();
 assert.equal(registryStartupDisabled(true,[],{}),true);assert.equal(registryStartupDisabled(false,["--no-skills"],{}),true);
 assert.equal(registryStartupDisabled(false,[],{ASEN_NO_SKILL_REGISTRY:"on"}),true);assert.equal(registryStartupDisabled(false,[],{ASEN_NO_SKILL_REGISTRY:"false"}),false);
});
test("shutdown waits for preparation/in-flight refresh; concurrent starts retain only latest generation",async t=>{
 const root=await mkdtemp(join(tmpdir(),"asen-registry-race-"));t.after(()=>rm(root,{recursive:true,force:true}));
 let release!:()=>void,hold=false,calls=0,watchers=0;
 const lifecycle=new RegistryLifecycle({prepare:async cwd=>{if(hold)await new Promise<void>(done=>release=done);return {projectRoot:cwd,projectId:cwd,sources:[{id:"one",scope:"project",root:cwd}]};},refresh:async()=>{calls++;return observed(root);},watch:()=>{watchers++;return {close(){}};}});
 const ctx={cwd:root,hasUI:true,ui:{notify(){}}};hold=true;const refreshing=lifecycle.refresh(root);let settled=false;const stopped=lifecycle.shutdown().then(()=>settled=true);await Promise.resolve();assert.equal(settled,false);hold=false;release();await Promise.all([refreshing,stopped]);assert.equal(calls,1);
 await Promise.all([lifecycle.start(ctx),lifecycle.start(ctx)]);assert.equal(calls,2);assert.equal(watchers,1);await lifecycle.shutdown();
});

test("native recursive watcher invalidates real temporary registry and shutdown preserves last bytes",{skip:process.platform==="win32"?"recursive fs.watch delivery is not a portable Windows contract":false,timeout:12000},async t=>{
 const {writeFile,readFile,realpath}=await import("node:fs/promises");const {refreshSkillRegistry}=await import("../src/skills/generated-registry.js");
 const temporaryRoot=await mkdtemp(join(tmpdir(),"asen-registry-native-")),root=await realpath(temporaryRoot);t.after(()=>rm(temporaryRoot,{recursive:true,force:true}));
 const skills=join(root,"skills"),skill=join(skills,"one");await mkdir(skill,{recursive:true});const file=join(skill,"SKILL.md");
 const document=(description:string)=>`---\nname: one\ndescription: ${description}\n---\nBody\n`;
 await writeFile(file,document("First"));const notices:string[]=[];
 const lifecycle=new RegistryLifecycle({debounceMs:10,refresh:refreshSkillRegistry,prepare:async cwd=>({projectRoot:cwd,projectId:cwd,sources:[{id:"one",scope:"project",root:skills}]})});t.after(()=>lifecycle.shutdown());
 await lifecycle.start({cwd:root,hasUI:true,ui:{notify:message=>notices.push(message)}});assert.equal(notices.some(value=>value.includes("watcher unavailable")),false);
 await writeFile(file,document("Second"));const output=join(root,".asen/skill-registry.md");let current="",until=Date.now()+8000;
 do{current=await readFile(output,"utf8");if(current.includes("Second"))break;await new Promise(resolve=>setTimeout(resolve,20));}while(Date.now()<until);
 assert.match(current,/Second/);await lifecycle.shutdown();await writeFile(file,document("Third"));await delay();assert.equal(await readFile(output,"utf8"),current);
});

test("watch root is snapshotted even when host reuses and mutates its context",async t=>{
 const root=await mkdtemp(join(tmpdir(),"asen-registry-context-"));t.after(()=>rm(root,{recursive:true,force:true}));const second=join(root,"second");await mkdir(second);
 const writes:string[]=[];let changed!:()=>void;
 const lifecycle=new RegistryLifecycle({debounceMs:1,prepare:async cwd=>({projectRoot:cwd,projectId:cwd,sources:[{id:"one",scope:"project",root:cwd}]}),refresh:async options=>{writes.push(options.projectRoot);return observed(options.projectRoot);},watch:(_root,callback)=>{changed=callback;return {close(){}};}});
 const ctx={cwd:root,hasUI:true,ui:{notify(){}}};await lifecycle.start(ctx);ctx.cwd=second;changed();await delay();await lifecycle.shutdown();assert.deepEqual(writes,[root,root]);
});
