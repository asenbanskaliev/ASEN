import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {mkdir,readFile,realpath,rename,rmdir,stat,writeFile} from "node:fs/promises";
import path from "node:path";
import {tmpdir} from "node:os";
import {mkdtemp,rm} from "node:fs/promises";
import {applySetupPlan} from "../src/runtime/setup.js";

const fixtures:string[]=[];
const digest=(value:string|Buffer)=>createHash("sha256").update(value).digest("hex");
async function api(){return import("../src/runtime/managed-install.js");}
async function fixture(){const root=await mkdtemp(path.join(tmpdir(),"asen-managed-install-"));fixtures.push(root);return root;}
test.afterEach(async()=>{for(const root of fixtures.splice(0))await rm(root,{recursive:true,force:true});});

async function packageFixture(root:string){
 const packageRoot=path.join(root,"package source ü");
 await mkdir(path.join(packageRoot,"dist"),{recursive:true});
 await writeFile(path.join(packageRoot,"package.json"),'{"name":"asen"}\n');
 await writeFile(path.join(packageRoot,"dist","cli.js"),'export const ready=true;\n');
 return packageRoot;
}
const manifest=[
 {sourcePath:"package.json",destinationPath:"package.json"},
 {sourcePath:"dist/cli.js",destinationPath:"dist/cli.js"},
] as const;
async function request(root:string,overrides:Record<string,unknown>={}){
 const packageRoot=await packageFixture(root);
 return {prefix:path.join(root,"shared .asen"),packageRoot,version:"1.2.3",files:manifest,protectedPaths:[path.join(root,"pi-home"),path.join(root,"custom-home")],confirmed:true,...overrides};
}
async function expectManagedError(action:()=>Promise<unknown>,code:string,message:string){
 await assert.rejects(action,error=>{
  assert.equal((error as {code?:unknown}).code,code);
  assert.equal((error as Error).message,message);
  return true;
 });
}

// Each case dynamically imports the new public module: API absence is the intended initial RED.
test("read-only inspection reports an absent managed child with zero writes",async()=>{
 const root=await fixture(),prefix=path.join(root,"shared .asen");
 const {inspectManagedInstall}=await api();
 const before=await stat(root);
 assert.deepEqual(await inspectManagedInstall({prefix}),{status:"absent",managedRoot:path.join(prefix,"install"),activeVersion:null,runtimeReady:false,versions:[]});
 assert.equal(await readFileSafe(prefix),undefined);assert.equal((await stat(root)).mtimeMs,before.mtimeMs);
});

test("fresh staging owns only install beneath an existing shared prefix and reports exact integrity",async()=>{
 const root=await fixture(),input=await request(root),prefix=input.prefix;
 const config=path.join(prefix,"config.json"),agent=path.join(prefix,"agent","memory.db"),foreign=path.join(prefix,"notes.txt");
 await mkdir(path.dirname(agent),{recursive:true});await writeFile(config,'{"home":"isolated"}');await writeFile(agent,"agent-state");await writeFile(foreign,"keep");
 const configTime=(await stat(config)).mtimeMs,agentTime=(await stat(agent)).mtimeMs;
 const {stageManagedInstall,inspectManagedInstall}=await api();
 const result=await stageManagedInstall(input);
 assert.equal(result.status,"staged");assert.equal(result.version,"1.2.3");assert.equal(result.activation,"not-active");assert.equal(result.runtimeReady,false);
 assert.deepEqual(result.files.map(file=>({path:file.path,size:file.size,sha256:file.sha256})),[
  {path:"package.json",size:16,sha256:digest('{"name":"asen"}\n')},
  {path:"dist/cli.js",size:25,sha256:digest('export const ready=true;\n')},
 ]);
 assert.equal(await readFile(path.join(result.versionRoot,"package.json"),"utf8"),'{"name":"asen"}\n');
 assert.equal(await readFile(path.join(result.versionRoot,"dist","cli.js"),"utf8"),'export const ready=true;\n');
 assert.equal(await readFile(config,"utf8"),'{"home":"isolated"}');assert.equal(await readFile(agent,"utf8"),"agent-state");assert.equal(await readFile(foreign,"utf8"),"keep");
 assert.equal((await stat(config)).mtimeMs,configTime);assert.equal((await stat(agent)).mtimeMs,agentTime);
 assert.equal(await readFileSafe(path.join(prefix,"install","current")),undefined);
 assert.deepEqual(await inspectManagedInstall({prefix}),{status:"owned",managedRoot:path.join(prefix,"install"),activeVersion:null,runtimeReady:false,versions:[{version:"1.2.3",files:result.files}]});
});

test("mutation requires explicit confirmation and performs zero effects",async()=>{
 const root=await fixture(),input=await request(root,{confirmed:false}),{stageManagedInstall}=await api();
 await expectManagedError(()=>stageManagedInstall(input as never),"CONFIRMATION_REQUIRED","Managed installation staging requires explicit confirmation");
 assert.equal(await readFileSafe((input as {prefix:string}).prefix),undefined);
});

test("roots, versions, and finite manifest paths reject malformed, duplicate, sensitive, and escaping input",async()=>{
 const cases:[string,Record<string,unknown>,string,string][]=[
  ["relative prefix",{prefix:"relative"},"INVALID_ABSOLUTE_PATH","Managed installation prefix must be absolute"],
  ["relative package root",{packageRoot:"relative"},"INVALID_ABSOLUTE_PATH","Managed package root must be absolute"],
  ["unstable version",{version:"latest"},"INVALID_VERSION","Managed installation version must be a stable semantic version"],
  ["absolute source",{files:[{sourcePath:path.resolve("outside"),destinationPath:"file"}]},"INVALID_MANIFEST_PATH","Managed source path must be canonical relative data"],
  ["traversal",{files:[{sourcePath:"../secret",destinationPath:"file"}]},"INVALID_MANIFEST_PATH","Managed source path must be canonical relative data"],
  ["duplicate",{files:[{sourcePath:"package.json",destinationPath:"same"},{sourcePath:"dist/cli.js",destinationPath:"same"}]},"DUPLICATE_DESTINATION","Managed destination paths must be unique"],
  ["sensitive source",{files:[{sourcePath:".env.production",destinationPath:"file"}]},"SENSITIVE_PATH","Managed source path is sensitive or outside the distributable file set"],
  ["sensitive destination",{files:[{sourcePath:"package.json",destinationPath:"keys/private.pem"}]},"SENSITIVE_PATH","Managed destination path is sensitive or outside the distributable file set"],
 ];
 for(const [name,override,code,message] of cases){
  const caseRoot=path.join(await fixture(),name),input=await request(caseRoot,override),{stageManagedInstall}=await api();
  await expectManagedError(()=>stageManagedInstall(input as never),code,message);
  assert.equal(await readFileSafe((input as {prefix:string}).prefix),undefined,name);
 }
});

test("managed destination refuses source and protected-data overlaps before effects",async()=>{
 const root=await fixture(),{stageManagedInstall}=await api();
 const sourceOverlap=await request(root);sourceOverlap.prefix=sourceOverlap.packageRoot;
 await expectManagedError(()=>stageManagedInstall(sourceOverlap),"PATH_OVERLAP","Managed installation paths overlap package source or protected data");
 const other=await fixture(),protectedOverlap=await request(other);protectedOverlap.protectedPaths=[path.join(protectedOverlap.prefix,"install","versions")];
 await expectManagedError(()=>stageManagedInstall(protectedOverlap),"PATH_OVERLAP","Managed installation paths overlap package source or protected data");
 assert.equal(await readFileSafe(path.join(protectedOverlap.prefix,"install")),undefined);
});

test("foreign and malformed occupied install children are inspected but never adopted",async()=>{
 const root=await fixture(),input=await request(root),managed=path.join(input.prefix,"install");await mkdir(managed,{recursive:true});await writeFile(path.join(managed,"foreign.txt"),"foreign");
 const {inspectManagedInstall,stageManagedInstall}=await api();
 const observed=await inspectManagedInstall({prefix:input.prefix});assert.equal(observed.status,"foreign");assert.equal(observed.reason,"missing or malformed ASEN managed-install receipt");
 await expectManagedError(()=>stageManagedInstall(input),"FOREIGN_MANAGED_ROOT","Refusing foreign or malformed managed installation root");
 assert.equal(await readFile(path.join(managed,"foreign.txt"),"utf8"),"foreign");
});

test("simulated linked managed root and non-regular source refuse with zero mutation",async()=>{
 const root=await fixture(),input=await request(root),{stageManagedInstall}=await api(),managed=path.join(input.prefix,"install"),source=path.join(input.packageRoot,"package.json");
 await expectManagedError(()=>stageManagedInstall({...input,hooks:{metadata:async(file,_phase,fallback)=>file===managed?{kind:"link" as const,canonicalPath:managed}:fallback()}}),"MANAGED_ROOT_LINKED","Refusing linked managed installation root");
 assert.equal(await readFileSafe(input.prefix),undefined);
 await expectManagedError(()=>stageManagedInstall({...input,hooks:{metadata:async(file,_phase,fallback)=>file===source?{kind:"directory" as const,canonicalPath:source}:fallback()}}),"SOURCE_NOT_REGULAR","Managed installation source must be a regular, unlinked file: package.json");
 assert.equal(await readFileSafe(input.prefix),undefined);
});

test("source canonical drift immediately before effects is rejected",async()=>{
 const root=await fixture(),input=await request(root),{stageManagedInstall}=await api(),source=path.join(input.packageRoot,"package.json");let observations=0;
 await expectManagedError(()=>stageManagedInstall({...input,hooks:{metadata:async(file,_phase,fallback)=>{const value=await fallback();if(file===source&&++observations===2&&value)return {...value,canonicalPath:value.canonicalPath+"-drift"};return value;}}}),"SOURCE_DRIFT","Managed installation source identity changed before staging: package.json");
 assert.equal(await readFileSafe(input.prefix),undefined);
});

test("copy failure cleans only the fresh owned stage and preserves shared data",async()=>{
 const root=await fixture(),input=await request(root),config=path.join(input.prefix,"config.json");await mkdir(input.prefix,{recursive:true});await writeFile(config,"personal");
 const {stageManagedInstall}=await api();
 await expectManagedError(()=>stageManagedInstall({...input,hooks:{copyPlan:async(plan:{entries:{destination:string}[]})=>{await mkdir(path.dirname(plan.entries[0]!.destination),{recursive:true});await writeFile(plan.entries[0]!.destination,"partial");throw new Error("injected copy failure");}}}),"STAGING_FAILED","Managed installation staging failed: injected copy failure");
 assert.equal(await readFile(config,"utf8"),"personal");assert.equal(await readFileSafe(path.join(input.prefix,"install")),undefined);
});

test("publish failure propagates its cause and reports retained stage when cleanup safety is uncertain",async()=>{
 const root=await fixture(),input=await request(root),config=path.join(input.prefix,"config.json");await mkdir(input.prefix,{recursive:true});await writeFile(config,"personal");
 const {stageManagedInstall}=await api();
 await assert.rejects(()=>stageManagedInstall({...input,hooks:{beforePublish:async()=>{throw new Error("injected publish failure");},cleanupFile:async()=>{throw new Error("injected cleanup uncertainty");}}}),error=>{
  assert.equal((error as {code?:unknown}).code,"STAGING_RETAINED");assert.equal((error as Error).message,"Managed installation staging failed and a private stage was retained: injected publish failure");
  assert.match((error as {retainedStage?:string}).retainedStage??"",/[\\/]install[\\/]staging[\\/]/u);assert.equal((error as {cause?:Error}).cause?.message,"injected publish failure");return true;
 });
 assert.equal(await readFile(config,"utf8"),"personal");assert.equal(await readFileSafe(path.join(input.prefix,"install","current")),undefined);
});

test("root replacement before a throwing publication hook preserves the foreign replacement",async()=>{
 const root=await fixture(),input=await request(root),managedRoot=path.join(input.prefix,"install"),savedRoot=path.join(root,"saved owned root");
 const config=path.join(input.prefix,"config.json"),source=path.join(input.packageRoot,"package.json");
 await mkdir(input.prefix,{recursive:true});await writeFile(config,"personal");
 const configTime=(await stat(config)).mtimeMs,sourceBytes=await readFile(source),sourceTime=(await stat(source)).mtimeMs;
 const {stageManagedInstall}=await api();let planHome="",copies=0,publishes=0;
 await assert.rejects(()=>stageManagedInstall({...input,hooks:{
  copyPlan:async plan=>{copies++;planHome=plan.home;return applySetupPlan(plan);},
  beforePublish:async()=>{publishes++;await rename(managedRoot,savedRoot);await mkdir(planHome,{recursive:true});await writeFile(path.join(planHome,"package.json"),"FOREIGN-REPLACEMENT");throw new Error("injected root replacement failure");},
 }}),error=>{
  assert.equal((error as {code?:unknown}).code,"STAGING_RETAINED");
  assert.equal((error as Error).message,"Managed installation staging failed and a private stage was retained: injected root replacement failure");
  assert.equal((error as {retainedStage?:string}).retainedStage,planHome);
  assert.equal((error as {cause?:Error}).cause?.message,"injected root replacement failure");return true;
 });
 assert.equal(copies,1);assert.equal(publishes,1);assert.equal(await readFile(path.join(planHome,"package.json"),"utf8"),"FOREIGN-REPLACEMENT");
 assert.equal(await readFile(path.join(savedRoot,"staging",path.basename(planHome),"package.json"),"utf8"),'{"name":"asen"}\n');
 assert.equal(await readFile(config,"utf8"),"personal");assert.equal((await stat(config)).mtimeMs,configTime);
 assert.deepEqual(await readFile(source),sourceBytes);assert.equal((await stat(source)).mtimeMs,sourceTime);assert.equal(await statSafe(path.join(managedRoot,"current")),undefined);
});

test("root replacement before publication is refused without moving foreign data",async()=>{
 const root=await fixture(),input=await request(root),managedRoot=path.join(input.prefix,"install"),savedRoot=path.join(root,"saved owned root");
 const config=path.join(input.prefix,"config.json"),source=path.join(input.packageRoot,"package.json");await mkdir(input.prefix,{recursive:true});await writeFile(config,"personal");
 const configTime=(await stat(config)).mtimeMs,sourceBytes=await readFile(source);const {stageManagedInstall,inspectManagedInstall}=await api();let planHome="",copies=0,publishes=0;
 await assert.rejects(()=>stageManagedInstall({...input,hooks:{
  copyPlan:async plan=>{copies++;planHome=plan.home;return applySetupPlan(plan);},
  beforePublish:async()=>{publishes++;await rename(managedRoot,savedRoot);await mkdir(planHome,{recursive:true});await writeFile(path.join(planHome,"package.json"),"FOREIGN-PUBLISH");},
 }}),error=>{
  const cause=(error as {cause?:unknown}).cause;
  assert.equal((error as {code?:unknown}).code,"STAGING_RETAINED",
   `Unexpected staging result: ${String(error)}; cause: ${String(cause)}`);
  assert.equal((error as Error).message,"Managed installation staging failed and a private stage was retained: Managed installation root identity changed before publication");
  assert.equal((error as {retainedStage?:string}).retainedStage,planHome);
  assert.equal((error as {cause?:Error}).cause?.message,"Managed installation root identity changed before publication");return true;
 });
 assert.equal(copies,1);assert.equal(publishes,1);assert.equal(await readFile(path.join(planHome,"package.json"),"utf8"),"FOREIGN-PUBLISH");
 assert.equal(await readFile(path.join(savedRoot,"staging",path.basename(planHome),"dist","cli.js"),"utf8"),'export const ready=true;\n');
 assert.equal(await readFile(config,"utf8"),"personal");assert.equal((await stat(config)).mtimeMs,configTime);assert.deepEqual(await readFile(source),sourceBytes);
 assert.equal(await statSafe(path.join(managedRoot,"current")),undefined);assert.equal((await inspectManagedInstall({prefix:input.prefix})).status,"foreign");
});

test("an unlisted stage file is retained and reported when publication fails",async()=>{
 const root=await fixture(),input=await request(root),config=path.join(input.prefix,"config.json"),source=path.join(input.packageRoot,"package.json");
 await mkdir(input.prefix,{recursive:true});await writeFile(config,"personal");const configTime=(await stat(config)).mtimeMs,sourceBytes=await readFile(source);
 const {stageManagedInstall}=await api();let planHome="",copies=0;
 await assert.rejects(()=>stageManagedInstall({...input,hooks:{
  copyPlan:async plan=>{copies++;planHome=plan.home;return applySetupPlan(plan);},
  beforePublish:async()=>{await writeFile(path.join(planHome,"unexpected.bin"),"UNLISTED");throw new Error("injected unlisted-stage failure");},
 }}),error=>{
  assert.equal((error as {code?:unknown}).code,"STAGING_RETAINED");
  assert.equal((error as Error).message,"Managed installation staging failed and a private stage was retained: injected unlisted-stage failure");
  assert.equal((error as {retainedStage?:string}).retainedStage,planHome);assert.equal((error as {cause?:Error}).cause?.message,"injected unlisted-stage failure");return true;
 });
 assert.equal(copies,1);assert.equal(await readFile(path.join(planHome,"unexpected.bin"),"utf8"),"UNLISTED");
 assert.equal(await readFile(config,"utf8"),"personal");assert.equal((await stat(config)).mtimeMs,configTime);assert.deepEqual(await readFile(source),sourceBytes);assert.equal(await statSafe(path.join(input.prefix,"install","current")),undefined);
});

test("prerelease versions are rejected before filesystem effects",async()=>{
 const root=await fixture(),input=await request(root,{version:"1.2.3-rc.1"}),{stageManagedInstall}=await api();let caught:unknown;
 try{await stageManagedInstall(input as never);}catch(error){caught=error;}
 assert.equal((caught as {code?:unknown})?.code,"INVALID_VERSION");assert.equal((caught as Error|undefined)?.message,"Managed installation version must be a stable semantic version");
 assert.equal(await statSafe((input as {prefix:string}).prefix),undefined);assert.equal(await statSafe(path.join((input as {prefix:string}).prefix,"install","current")),undefined);
});

test("an empty-files receipt is foreign read-only input",async()=>{
 const root=await fixture(),prefix=path.join(root,"shared .asen"),managedRoot=path.join(prefix,"install"),versionRoot=path.join(managedRoot,"versions","1.2.3");
 await mkdir(versionRoot,{recursive:true});const canonicalManagedRoot=await realpath(managedRoot);
 await writeFile(path.join(managedRoot,"managed-install.json"),JSON.stringify({schema:"asen.managed-install/v1",product:"asen",canonicalManagedRoot,version:"1.2.3",files:[]},null,2)+"\n");
 const before=(await stat(managedRoot)).mtimeMs,{inspectManagedInstall}=await api();
 assert.deepEqual(await inspectManagedInstall({prefix}),{status:"foreign",managedRoot,activeVersion:null,runtimeReady:false,versions:[],reason:"missing or malformed ASEN managed-install receipt"});
 assert.equal((await stat(managedRoot)).mtimeMs,before);assert.equal(await statSafe(path.join(managedRoot,"current")),undefined);
});

test("an identical owned version validates as unchanged without copy or publication writes",async()=>{
 const root=await fixture(),input=await request(root),{stageManagedInstall}=await api();const first=await stageManagedInstall(input);let copies=0,publishes=0;
 const versionTime=(await stat(first.versionRoot)).mtimeMs;
 const second=await stageManagedInstall({...input,hooks:{copyPlan:async()=>{copies++;throw new Error("must not copy");},beforePublish:async()=>{publishes++;}}});
 assert.equal(second.status,"unchanged");assert.deepEqual(second.files,first.files);assert.equal(copies,0);assert.equal(publishes,0);assert.equal((await stat(first.versionRoot)).mtimeMs,versionTime);
 assert.equal(await readFileSafe(path.join(input.prefix,"install","current")),undefined);
});

test("a differing existing version is left byte-identical for later upgrade composition",async()=>{
 const root=await fixture(),input=await request(root),{stageManagedInstall}=await api();const first=await stageManagedInstall(input),installed=path.join(first.versionRoot,"package.json");
 const before=await readFile(installed);await writeFile(path.join(input.packageRoot,"package.json"),'{"name":"changed"}\n');
 await expectManagedError(()=>stageManagedInstall(input),"VERSION_CONFLICT","Managed version 1.2.3 already exists with different data");
 assert.deepEqual(await readFile(installed),before);assert.equal(await readFileSafe(path.join(input.prefix,"install","current")),undefined);
});

async function readFileSafe(file:string):Promise<Buffer|undefined>{try{return await readFile(file);}catch(error){if((error as NodeJS.ErrnoException).code==="ENOENT"|| (error as NodeJS.ErrnoException).code==="EISDIR")return undefined;throw error;}}
async function statSafe(file:string){try{return await stat(file);}catch(error){if((error as NodeJS.ErrnoException).code==="ENOENT")return undefined;throw error;}}


// Controlled publication operations isolate retry semantics from real host locks.
// Existing staging tests above still use the actual platform and native rename.
async function retryFixture() {
 const input = await request(await fixture());
 const shared = [path.join(input.prefix,"config.json"),path.join(input.prefix,"agent","state.txt"),path.join(input.prefix,"foreign.txt")];
 for (const file of shared) {
  await mkdir(path.dirname(file),{recursive:true});
  await writeFile(file,"KEEP:"+path.basename(file));
 }
 const protectedFiles = [...shared,...manifest.map(file=>path.join(input.packageRoot,file.sourcePath))];
 const before = await Promise.all(protectedFiles.map(async file=>({file,bytes:await readFile(file),mtime:(await stat(file)).mtimeMs})));
 return {input,async preserved() {
  for (const entry of before) {
   assert.deepEqual(await readFile(entry.file),entry.bytes);
   assert.equal((await stat(entry.file)).mtimeMs,entry.mtime);
  }
  assert.equal(await statSafe(path.join(input.prefix,"install","current")),undefined);
 }};
}
function publicationError(code: string, attempt = 1) {
 return Object.assign(new Error(`injected ${code} ${attempt}`),{code});
}
async function controlledPublication(from: string,to: string) {
 // Fixture-only successful move, with a finite known file list and no directory rename.
 await mkdir(to);
 await applySetupPlan({home:to,entries:manifest.map(file=>({
  source:path.join(from,file.destinationPath),destination:path.join(to,file.destinationPath),
 }))});
 for (const file of manifest) await rm(path.join(from,file.destinationPath));
 await rmdir(path.join(from,"dist"));
 await rmdir(from);
}

for (const code of ["EPERM","EBUSY","EACCES"]) {
 test(`Windows publication recovers transient ${code}`,async()=>{
  const {input,preserved}=await retryFixture(),{stageManagedInstall,inspectManagedInstall}=await api();
  const first=publicationError(code),calls:string[][]=[],delays:number[]=[];
  const result=await stageManagedInstall({...input,hooks:{publication:{
   platform:"win32",
   rename:async(from,to)=>{calls.push([from,to]);if(calls.length===1)throw first;await controlledPublication(from,to);},
   wait:async milliseconds=>{delays.push(milliseconds);},
  }}});
  assert.equal(calls.length,2);assert.deepEqual(calls[1],calls[0]);assert.deepEqual(delays,[200]);
  assert.equal(result.status,"staged");assert.equal(result.activation,"not-active");assert.equal(result.runtimeReady,false);
  assert.equal((await inspectManagedInstall({prefix:input.prefix})).status,"owned");
  for (const file of result.files) {
   const bytes=await readFile(path.join(result.versionRoot,file.path));
   assert.equal(bytes.length,file.size);assert.equal(digest(bytes),file.sha256);
  }
  await preserved();
 });

 test(`Windows publication exhausts bounded ${code} attempts with first cause`,async()=>{
  const {input,preserved}=await retryFixture(),{stageManagedInstall}=await api();
  const first=publicationError(code),calls:string[][]=[],delays:number[]=[];
  await assert.rejects(()=>stageManagedInstall({...input,hooks:{publication:{
   platform:"win32",
   rename:async(from,to)=>{calls.push([from,to]);throw calls.length===1?first:publicationError(code,calls.length);},
   wait:async milliseconds=>{delays.push(milliseconds);},
  }}}),error=>{
   assert.equal((error as {code?:string}).code,"STAGING_FAILED");
   assert.equal((error as Error).message,`Managed installation staging failed: injected ${code} 1`);
   assert.equal((error as Error).cause,first);return true;
  });
  assert.equal(calls.length,5);for(const call of calls)assert.deepEqual(call,calls[0]);
  assert.deepEqual(delays,[200,400,800,1600]);
  assert.equal(await statSafe(path.join(input.prefix,"install")),undefined);
  await preserved();
 });
}

for (const [platform,code] of [["linux","EPERM"],["darwin","EACCES"],["win32","EIO"]] as const) {
 test(`publication does not retry ${platform} ${code}`,async()=>{
  const {input,preserved}=await retryFixture(),{stageManagedInstall}=await api();
  const cause=publicationError(code);let calls=0,waits=0;
  await assert.rejects(()=>stageManagedInstall({...input,hooks:{publication:{
   platform,rename:async()=>{calls++;throw cause;},wait:async()=>{waits++;},
  }}}),error=>{
   assert.equal((error as {code?:string}).code,"STAGING_FAILED");
   assert.equal((error as Error).message,`Managed installation staging failed: injected ${code} 1`);
   assert.equal((error as Error).cause,cause);return true;
  });
  assert.equal(calls,1);assert.equal(waits,0);
  assert.equal(await statSafe(path.join(input.prefix,"install")),undefined);
  await preserved();
 });
}

for (const change of ["managed root","stage root","versions parent","empty destination","stage bytes"] as const) {
 test(`publication retry refuses changed ${change}`,async()=>{
  const {input,preserved}=await retryFixture(),{stageManagedInstall}=await api();
  let calls=0,waits=0,stage="",destination="",foreign="";
  await assert.rejects(()=>stageManagedInstall({...input,hooks:{publication:{
   platform:"win32",
   rename:async(from,to)=>{calls++;stage=from;destination=to;throw publicationError("EPERM");},
   wait:async milliseconds=>{
    waits++;assert.equal(milliseconds,200);
    if(change==="stage bytes") {await writeFile(path.join(stage,"package.json"),"CHANGED");return;}
    const changed=change==="managed root"?path.join(input.prefix,"install")
     :change==="stage root"?stage:change==="versions parent"?path.dirname(destination):destination;
    if(change!=="empty destination")await rm(changed,{recursive:true,force:true});
    await mkdir(changed,{recursive:true});
    foreign=changed;
    if(change!=="empty destination")await writeFile(path.join(changed,"foreign.txt"),"FOREIGN");
   },
  }}}),error=>{
   const retained=change!=="stage bytes";
   assert.equal((error as {code?:string}).code,retained?"STAGING_RETAINED":"STAGING_FAILED");
   const reason=change==="stage bytes"?"staged bytes failed integrity validation: package.json"
    :change==="empty destination"?"Managed version destination appeared before publication"
    :"Managed installation root identity changed before publication";
   assert.equal((error as Error).message,`Managed installation staging failed${retained?" and a private stage was retained":""}: ${reason}`);
   assert.equal((error as Error).cause instanceof Error,true);
   assert.equal(((error as Error).cause as Error).message,reason);
   if(retained)assert.equal((error as {retainedStage?:string}).retainedStage,stage);
   return true;
  });
  assert.equal(calls,1);assert.equal(waits,1);
  if(foreign){
   assert.equal((await stat(foreign)).isDirectory(),true);
   if(change!=="empty destination")assert.equal(await readFile(path.join(foreign,"foreign.txt"),"utf8"),"FOREIGN");
  }
  assert.equal(await statSafe(path.join(input.prefix,"install","managed-install.json")),undefined);
  if(change!=="empty destination")assert.equal(await statSafe(destination),undefined);
  await preserved();
 });
}


test("unlisted stage entries refuse publication and preserve unknown bytes",async()=>{
 const {input,preserved}=await retryFixture(),{stageManagedInstall,inspectManagedInstall}=await api();
 let home="",moves=0;
 const reason="staged contents include an unlisted or invalid entry";
 await assert.rejects(()=>stageManagedInstall({...input,hooks:{
  copyPlan:async plan=>{home=plan.home;await applySetupPlan(plan);await writeFile(path.join(home,"unexpected.bin"),"UNCLAIMED");},
  publication:{rename:async()=>{moves++;assert.fail("unlisted stage must not publish");}},
 }}),error=>{
  assert.equal((error as {code?:string}).code,"STAGING_RETAINED");
  assert.equal((error as Error).message,`Managed installation staging failed and a private stage was retained: ${reason}`);
  assert.equal(((error as Error).cause as Error).message,reason);
  assert.equal((error as {retainedStage?:string}).retainedStage,home);return true;
 });
 assert.equal(moves,0);assert.equal(await readFile(path.join(home,"unexpected.bin"),"utf8"),"UNCLAIMED");
 assert.equal(await statSafe(path.join(input.prefix,"install","managed-install.json")),undefined);
 assert.equal(await statSafe(path.join(input.prefix,"install","versions","1.2.3")),undefined);
 assert.equal((await inspectManagedInstall({prefix:input.prefix})).status,"foreign");await preserved();
});

test("unlisted installed entries make inspection foreign and unchanged staging conflict",async()=>{
 const {input,preserved}=await retryFixture(),{stageManagedInstall,inspectManagedInstall}=await api();
 const result=await stageManagedInstall({...input,hooks:{publication:{rename:controlledPublication}}});
 const extra=path.join(result.versionRoot,"dist","extra.bin");await writeFile(extra,"EXISTING-UNCLAIMED");
 const before=(await stat(extra)).mtimeMs;
 assert.deepEqual(await inspectManagedInstall({prefix:input.prefix}),{
  status:"foreign",managedRoot:path.join(input.prefix,"install"),activeVersion:null,runtimeReady:false,versions:[],
  reason:"owned ASEN managed-install contents failed integrity validation",
 });
 await expectManagedError(()=>stageManagedInstall(input),"VERSION_CONFLICT","Managed version 1.2.3 already exists with different data");
 assert.equal(await readFile(extra,"utf8"),"EXISTING-UNCLAIMED");assert.equal((await stat(extra)).mtimeMs,before);await preserved();
});

test("ambiguous publication reports the retained destination without adopting it",async()=>{
 const {input,preserved}=await retryFixture(),{stageManagedInstall,inspectManagedInstall}=await api();
 let destination="",moves=0,waits=0;
 const reason="Managed installation root identity changed before publication";
 await assert.rejects(()=>stageManagedInstall({...input,hooks:{publication:{
  platform:"win32",
  rename:async(from,to)=>{moves++;destination=to;await controlledPublication(from,to);throw publicationError("EPERM");},
  wait:async()=>{waits++;assert.fail("ambiguous publication must not wait");},
 }}}),error=>{
  assert.equal((error as {code?:string}).code,"STAGING_RETAINED");
  assert.equal((error as Error).message,`Managed installation staging failed and a private stage was retained: ${reason}`);
  assert.equal(((error as Error).cause as Error).message,reason);
  assert.equal((error as {retainedStage?:string}).retainedStage,destination);return true;
 });
 assert.equal(moves,1);assert.equal(waits,0);
 for(const file of manifest)assert.deepEqual(await readFile(path.join(destination,file.destinationPath)),await readFile(path.join(input.packageRoot,file.sourcePath)));
 assert.equal(await statSafe(path.join(input.prefix,"install","managed-install.json")),undefined);
 assert.equal((await inspectManagedInstall({prefix:input.prefix})).status,"foreign");await preserved();
});
