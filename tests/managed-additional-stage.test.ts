import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {tmpdir} from "node:os";
import {inspect} from "node:util";
import {syncBuiltinESMExports} from "node:module";
import {inspectManagedInstall,stageManagedInstall,type ManagedAdditionalStageReport,type ManagedAdditionalStageRequest} from "../src/runtime/managed-install.js";
import {verifyManagedVersion} from "../src/runtime/managed-version-verification.js";
const api=async()=>{const module=await import("../src/runtime/managed-install.js");assert.equal(typeof module.stageAdditionalManagedVersion,"function","additional-stage API missing");return module.stageAdditionalManagedVersion;};
async function incoming(root:string,prefix:string,version:string):Promise<ManagedAdditionalStageRequest>{
 const packageRoot=path.join(root,"p"+version);await fs.mkdir(packageRoot);
 await fs.writeFile(path.join(packageRoot,"package.json"),JSON.stringify({name:"asen",version,engines:{node:">=0.0.0"},bin:{asen:"cli.cjs"}}));
 await fs.writeFile(path.join(packageRoot,"cli.cjs"),'throw new Error("must not execute staged package");');
 return{prefix,packageRoot,version,confirmed:true,protectedPaths:[path.join(root,"protected")],files:[{sourcePath:"package.json",destinationPath:"package.json"},{sourcePath:"cli.cjs",destinationPath:"cli.cjs"}]};
}
async function fixture(t:{after:(fn:()=>Promise<void>)=>void}){
 const root=await fs.mkdtemp(path.join(tmpdir(),"as-"));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const prefix=path.join(root,"home");await fs.mkdir(path.join(prefix,"agent"),{recursive:true});await fs.writeFile(path.join(prefix,"config.json"),"PERSONAL");await fs.writeFile(path.join(prefix,"agent","state"),"STATE");
 const first=await incoming(root,prefix,"1.0.0");await stageManagedInstall(first);
 const request=await incoming(root,prefix,"2.0.0"),managed=path.join(prefix,"install"),receipt=path.join(managed,"managed-install.json"),anchor=await fs.readFile(receipt);
 return{root,prefix,managed,request,receipt,anchor,versionRoot:path.join(managed,"versions","2.0.0"),catalog:path.join(managed,"managed-versions.json"),lock:path.join(managed,".asen-maintenance.lock")};
}
async function tree(root:string):Promise<unknown[]>{const result:unknown[]=[];for(const name of(await fs.readdir(root)).sort()){const file=path.join(root,name),s=await fs.lstat(file);assert.equal(s.isSymbolicLink(),false);result.push([name,s.isDirectory()?await tree(file):(await fs.readFile(file)).toString("base64"),s.mtimeMs]);}return result;}
async function absent(file:string){await assert.rejects(()=>fs.stat(file),{code:"ENOENT"});}
async function preserved(f:Awaited<ReturnType<typeof fixture>>){assert.deepEqual(await fs.readFile(f.receipt),f.anchor);assert.equal(await fs.readFile(path.join(f.prefix,"config.json"),"utf8"),"PERSONAL");assert.equal(await fs.readFile(path.join(f.prefix,"agent","state"),"utf8"),"STATE");}
async function failed(action:()=>Promise<ManagedAdditionalStageReport>){try{await action();assert.fail("expected additional-stage failure");}catch(error){assert.equal((error as Error).name,"ManagedAdditionalStageError",inspect(error,{depth:12,customInspect:false,getters:false}));return error as Error&{report:ManagedAdditionalStageReport};}}
function inactive(report:ManagedAdditionalStageReport){assert.equal(report.runtimeReady,false);assert.equal(report.activation,"not-active");assert(Object.isFrozen(report));}
const sha=(bytes:string|Buffer)=>createHash("sha256").update(bytes).digest("hex");
function expected(request:ManagedAdditionalStageRequest){return{schema:"asen.managed-acquisition/v1" as const,version:request.version,files:request.files.map(file=>({sourcePath:file.sourcePath,destinationPath:file.destinationPath,size:0,sha256:""}))};}
async function expectedFor(request:ManagedAdditionalStageRequest){const value=expected(request);for(const file of value.files){const bytes=await fs.readFile(path.join(request.packageRoot,...file.sourcePath.split("/")));file.size=bytes.length;file.sha256=sha(bytes);}return value;}

test("expected acquisition requires exact version and ordered source-destination agreement before staging",async t=>{
 const stage=await api(),f=await fixture(t),acquisition=await expectedFor(f.request),before=await tree(f.root);
 for(const changed of [{...acquisition,version:"9.0.0"},{...acquisition,files:[{...acquisition.files[0]!,sourcePath:"cli.cjs"},acquisition.files[1]!]},{...acquisition,files:[acquisition.files[1]!,acquisition.files[0]!]}]){
  await assert.rejects(()=>stage({...f.request,expectedAcquisition:changed}));assert.deepEqual(await tree(f.root),before);await absent(f.lock);
 }
});

test("expected acquisition rejects mutation after admitted preview bytes and never publishes another hash",async t=>{
 const stage=await api(),f=await fixture(t),acquisition=await expectedFor(f.request),source=path.join(f.request.packageRoot,"cli.cjs");await fs.writeFile(source,"mutated after preview");
 await assert.rejects(()=>stage({...f.request,expectedAcquisition:acquisition}));await absent(f.versionRoot);await absent(f.catalog);assert.deepEqual(await fs.readdir(path.join(f.managed,"staging")),[]);await preserved(f);
});

test("expected acquisition retains same-inode foreign bytes when cleanup byte ownership is uncertain",async t=>{
 const stage=await api(),f=await fixture(t),acquisition=await expectedFor(f.request),original=await fs.readFile(path.join(f.request.packageRoot,"cli.cjs")),foreign=Buffer.alloc(original.length,0x46);let target="",identity:bigint|undefined;
 const error=await failed(()=>stage({...f.request,expectedAcquisition:acquisition,hooks:{beforePublish:async()=>{const [name]=await fs.readdir(path.join(f.managed,"staging"));assert.ok(name);target=path.join(f.managed,"staging",name,"cli.cjs");const before=await fs.lstat(target,{bigint:true});identity=before.ino;await fs.writeFile(target,foreign);const after=await fs.lstat(target,{bigint:true});assert.equal(after.ino,identity);throw new Error("forced prepublication failure");}}}));
 inactive(error.report);assert.equal(error.report.status,"ambiguous");assert.equal(error.report.publication,"not-started");assert.equal(error.report.catalog,"not-committed");assert.equal(error.report.cleanup,"uncertain");assert.equal(error.report.stagePath,path.dirname(target));assert(error.report.retainedPaths.includes(error.report.stagePath!));assert.deepEqual(await fs.readFile(target),foreign);await absent(f.versionRoot);await absent(f.catalog);assert.deepEqual((await inspectManagedInstall({prefix:f.prefix})).versions.map(item=>item.version),["1.0.0"]);await preserved(f);
});

test("expected acquisition retains a replaced partial stage when cleanup ownership is uncertain",async t=>{
 const stage=await api(),f=await fixture(t),acquisition=await expectedFor(f.request),foreign="FOREIGN-REPLACEMENT";
 const error=await failed(()=>stage({...f.request,expectedAcquisition:acquisition,hooks:{beforePublish:async()=>{const [name]=await fs.readdir(path.join(f.managed,"staging"));assert.ok(name);const target=path.join(f.managed,"staging",name,"cli.cjs");await fs.rename(target,target+".owned");await fs.writeFile(target,foreign);throw new Error("stop after replacement");}}}));
 inactive(error.report);assert.equal(error.report.status,"ambiguous");assert.equal(error.report.cleanup,"uncertain");assert.ok(error.report.stagePath);assert(error.report.retainedPaths.includes(error.report.stagePath));assert.equal(await fs.readFile(path.join(error.report.stagePath!,"cli.cjs"),"utf8"),foreign);await absent(f.versionRoot);await preserved(f);
});

test("expected cleanup retains a replacement nested directory and its creation-time identity",async t=>{
 const stage=await api(),f=await fixture(t),request={...f.request,files:f.request.files.map(file=>file.sourcePath==="cli.cjs"?{...file,destinationPath:"outer/dist/cli.js"}:file)},acquisition=await expectedFor(request),cause=new Error("forced nested directory replacement cleanup");let outerDir="",originalDir="",replacementDir="",outerIdentity:bigint|undefined,originalIdentity:bigint|undefined,replacementIdentity:bigint|undefined;
 const error=await failed(()=>stage({...request,expectedAcquisition:acquisition,hooks:{beforePublish:async()=>{throw cause;},cleanupFile:async file=>{await fs.rm(file);if(file.endsWith(path.join("dist","cli.js"))){replacementDir=path.dirname(file);outerDir=path.dirname(replacementDir);originalDir=replacementDir+".original";outerIdentity=(await fs.lstat(outerDir,{bigint:true})).ino;originalIdentity=(await fs.lstat(replacementDir,{bigint:true})).ino;await fs.rename(replacementDir,originalDir);await fs.mkdir(replacementDir);replacementIdentity=(await fs.lstat(replacementDir,{bigint:true})).ino;assert.notEqual(replacementIdentity,originalIdentity);}}}}));
 inactive(error.report);assert(error.cause instanceof AggregateError);assert((error.cause as AggregateError).errors.includes(cause));assert.equal(error.report.status,"ambiguous");assert.equal(error.report.publication,"not-started");assert.equal(error.report.catalog,"not-committed");assert.equal(error.report.cleanup,"uncertain");assert.equal(error.report.error,cause.message);assert.ok(error.report.stagePath);assert.deepEqual(error.report.retainedPaths,[error.report.stagePath]);const outer=await fs.lstat(outerDir,{bigint:true}),replacement=await fs.lstat(replacementDir,{bigint:true}),original=await fs.lstat(originalDir,{bigint:true});assert.equal(outer.isDirectory(),true);assert.equal(outer.ino,outerIdentity);assert.equal(replacement.isDirectory(),true);assert.equal(replacement.ino,replacementIdentity);assert.equal(original.isDirectory(),true);assert.equal(original.ino,originalIdentity);assert.deepEqual(await fs.readdir(replacementDir),[]);assert.deepEqual(await fs.readdir(originalDir),[]);await absent(f.versionRoot);await absent(f.catalog);const inventory=await inspectManagedInstall({prefix:f.prefix});assert.equal(inventory.status,"owned");assert.equal(inventory.activeVersion,null);assert.deepEqual(inventory.versions.map(item=>item.version),["1.0.0"]);await preserved(f);
});

test("synthetic rounded directory identity collisions retain swapped nested directories",async t=>{
 const high=9007199254740992n,next=9007199254740993n;
 for(const mode of ["inode","device"] as const)await t.test(mode,async()=>{
  const stage=await api(),f=await fixture(t),request={...f.request,files:f.request.files.map(file=>file.sourcePath==="cli.cjs"?{...file,destinationPath:"outer/dist/cli.js"}:file)},acquisition=await expectedFor(request),cause=new Error(`forced synthetic ${mode} collision`),fsPromises=process.getBuiltinModule("fs/promises"),originalLstat=fsPromises.lstat.bind(fsPromises);let replaced=false,originalDir="",replacementDir="",originalPhysical:bigint|undefined,replacementPhysical:bigint|undefined,exactBefore=0,exactAfter=0;
  Object.defineProperty(fsPromises,"lstat",{configurable:true,writable:true,value:async(file:string,options?:{bigint?:boolean})=>{const stats=await originalLstat(file,options);if(path.resolve(file).includes(`${path.sep}install${path.sep}staging${path.sep}`)&&path.resolve(file).endsWith(`${path.sep}outer${path.sep}dist`)&&stats.isDirectory()){if(options?.bigint){exactBefore+=replaced?0:1;exactAfter+=replaced?1:0;(stats as {dev:bigint;ino:bigint}).dev=mode==="device"?(replaced?next:high):0n;(stats as {dev:bigint;ino:bigint}).ino=mode==="inode"?(replaced?next:high):77n;}else{(stats as {dev:number;ino:number}).dev=Number(mode==="device"?(replaced?next:high):0n);(stats as {dev:number;ino:number}).ino=Number(mode==="inode"?(replaced?next:high):77n);}}return stats;}});syncBuiltinESMExports();
  let error!:Error&{report:ManagedAdditionalStageReport};try{error=await failed(()=>stage({...request,expectedAcquisition:acquisition,hooks:{beforePublish:async()=>{throw cause;},cleanupFile:async file=>{await fs.rm(file);if(file.endsWith(path.join("dist","cli.js"))){replacementDir=path.dirname(file);originalDir=replacementDir+".original";originalPhysical=(await originalLstat(replacementDir,{bigint:true})).ino;await fs.rename(replacementDir,originalDir);await fs.mkdir(replacementDir);replacementPhysical=(await originalLstat(replacementDir,{bigint:true})).ino;replaced=true;}}}}));}finally{Object.defineProperty(fsPromises,"lstat",{configurable:true,writable:true,value:originalLstat});syncBuiltinESMExports();}
  inactive(error.report);assert.equal(error.report.status,"ambiguous");assert.equal(error.report.publication,"not-started");assert.equal(error.report.catalog,"not-committed");assert.equal(error.report.cleanup,"uncertain");assert.equal(error.report.error,cause.message);assert.ok(error.report.stagePath);assert.deepEqual(error.report.retainedPaths,[error.report.stagePath]);const replacement=await fs.lstat(replacementDir,{bigint:true}),original=await fs.lstat(originalDir,{bigint:true});assert.equal(replacement.ino,replacementPhysical);assert.equal(original.ino,originalPhysical);assert.ok(exactBefore>0,"mock must exercise the creation-time exact claim");assert.ok(exactAfter>0,"cleanup must freshly revalidate exact bigint identity");await absent(f.versionRoot);await absent(f.catalog);const inventory=await inspectManagedInstall({prefix:f.prefix});assert.equal(inventory.status,"owned");assert.equal(inventory.activeVersion,null);assert.deepEqual(inventory.versions.map(item=>item.version),["1.0.0"]);await preserved(f);
 });
});

test("legacy request without expected acquisition retains byte-for-byte public behavior",async t=>{
 const stage=await api(),f=await fixture(t),result=await stage(f.request),packageBytes=await fs.readFile(path.join(f.request.packageRoot,"package.json")),cliBytes=await fs.readFile(path.join(f.request.packageRoot,"cli.cjs"));inactive(result);assert.deepEqual(result,{status:"staged",prefix:f.prefix,managedRoot:f.managed,versionRoot:f.versionRoot,version:"2.0.0",files:[{path:"package.json",size:packageBytes.length,sha256:sha(packageBytes)},{path:"cli.cjs",size:cliBytes.length,sha256:sha(cliBytes)}],activation:"not-active",runtimeReady:false,publication:"published",catalog:"committed",stagePath:result.stagePath,cleanup:"not-needed",retainedPaths:[],error:null});
});

test("additional versions publish into the real root and preserve v1 and prior catalog entries",async t=>{
 const stage=await api(),f=await fixture(t),result=await stage(f.request);inactive(result);assert.equal(result.status,"staged");assert.equal(result.publication,"published");assert.equal(result.catalog,"committed");assert.deepEqual(result.retainedPaths,[]);
 const third=await incoming(f.root,f.prefix,"3.0.0"),next=await stage(third);inactive(next);assert.equal(next.status,"staged");assert.equal(next.catalog,"committed");
 const inventory=await inspectManagedInstall({prefix:f.prefix});assert.equal(inventory.status,"owned");assert.deepEqual(inventory.versions.map(v=>v.version),["1.0.0","2.0.0","3.0.0"]);assert.equal(inventory.activeVersion,null);assert.equal(inventory.runtimeReady,false);
 const metadata=await verifyManagedVersion({prefix:f.prefix,version:"2.0.0"});assert.equal(metadata.integrity,"verified");assert.equal(metadata.runtimeProbe,"not-run");assert.equal(metadata.runtimeReady,false);await preserved(f);await absent(f.lock);
});

test("additional-stage preflight refusals have no filesystem or callback effects",async t=>{
 const stage=await api(),f=await fixture(t);let copies=0;const hooks={copyPlan:async()=>{copies++;}};
 for(const changes of [{confirmed:false},{prefix:"relative"},{version:"02.0.0"},{files:[{sourcePath:"../bad",destinationPath:"bad"}]},{files:[{sourcePath:"missing",destinationPath:"missing"}]},{packageRoot:f.managed},{protectedPaths:[f.prefix]},{prefix:path.join(f.root,"absent")}]){
  const before=await tree(f.root);await assert.rejects(()=>stage({...f.request,...changes,hooks}));assert.equal(copies,0);assert.deepEqual(await tree(f.root),before);await absent(f.lock);
 }await preserved(f);
});

test("listed identical staging is write-free and conflicting or orphan destinations are never adopted",async t=>{
 const stage=await api(),f=await fixture(t);await stage(f.request);const before=await tree(f.root),same=await stage(f.request);inactive(same);assert.equal(same.status,"unchanged");assert.deepEqual(await tree(f.root),before);
 await fs.writeFile(path.join(f.request.packageRoot,"cli.cjs"),"DIFFERENT");let state=await tree(f.root);await assert.rejects(()=>stage(f.request),error=>(error as {code?:unknown}).code==="VERSION_CONFLICT");assert.deepEqual(await tree(f.root),state);
 const request=await incoming(f.root,f.prefix,"9.0.0"),orphan=path.join(f.managed,"versions","9.0.0");await fs.mkdir(orphan);await fs.writeFile(path.join(orphan,"unknown"),"FOREIGN");state=await tree(f.root);
 await assert.rejects(()=>stage(request),error=>(error as {code?:unknown}).code==="VERSION_CONFLICT");assert.deepEqual(await tree(f.root),state);assert.equal(await fs.readFile(path.join(orphan,"unknown"),"utf8"),"FOREIGN");await preserved(f);
});

test("pre-publication failure cleans only the positively claimed empty private stage",async t=>{
 const stage=await api(),f=await fixture(t),cause=new Error("copy refused");let copies=0,moves=0;
 const error=await failed(()=>stage({...f.request,hooks:{copyPlan:async()=>{copies++;throw cause;},publication:{rename:async()=>{moves++;throw new Error("must not publish");}}}}));
 inactive(error.report);assert.equal(error.cause,cause);assert.equal(error.report.status,"failed");assert.equal(error.report.publication,"not-started");assert.equal(error.report.catalog,"not-committed");assert.equal(error.report.cleanup,"removed");assert.deepEqual(error.report.retainedPaths,[]);assert.equal(copies,1);assert.equal(moves,0);
 assert.deepEqual(await fs.readdir(path.join(f.managed,"staging")),[]);await absent(f.versionRoot);await absent(f.catalog);await absent(f.lock);await preserved(f);
});

test("a published version survives a pre-commit failure as an unlisted conflicting orphan",async t=>{
 const stage=await api(),f=await fixture(t),cause=new Error("commit refused");let commits=0;
 const request={...f.request,catalogPublication:{beforeCommit:async()=>{commits++;throw cause;}}};
 const error=await failed(()=>stage(request));inactive(error.report);assert.equal(error.cause,cause);assert.equal(error.report.publication,"published");assert.equal(error.report.catalog,"not-committed");assert(error.report.retainedPaths.includes(f.versionRoot));
 assert.deepEqual((await inspectManagedInstall({prefix:f.prefix})).versions.map(v=>v.version),["1.0.0"]);await absent(f.catalog);const before=await tree(f.root);
 await assert.rejects(()=>stage(request),error=>(error as {code?:unknown}).code==="VERSION_CONFLICT");assert.equal(commits,1);assert.deepEqual(await tree(f.root),before);await preserved(f);
});

test("root parent anchor catalog and destination drift refuse without adopting or removing changed data",async t=>{
 const stage=await api();
 for(const mode of ["root","parent","anchor","catalog","destination"]){
  const f=await fixture(t),changed=path.join(f.managed,"FOREIGN"),progress:string[]=[];
  let publicError:unknown;
  const mutate=async()=>{
   progress.push("mutation:start");
   if(mode==="root"){progress.push("root-rename:start");await fs.rename(f.managed,f.managed+".saved");progress.push("root-rename:done");await fs.mkdir(f.managed);progress.push("replacement-mkdir:done");await fs.writeFile(changed,"FOREIGN");progress.push("FOREIGN-write:done");}
   else if(mode==="parent"){const versions=path.join(f.managed,"versions");await fs.rename(versions,versions+".saved");await fs.mkdir(versions);await fs.writeFile(path.join(versions,"FOREIGN"),"FOREIGN");}
   else if(mode==="anchor")await fs.writeFile(f.receipt,"CHANGED");
   else if(mode==="catalog")await fs.writeFile(f.catalog,"FOREIGN");
   else{await fs.mkdir(f.versionRoot);await fs.writeFile(path.join(f.versionRoot,"FOREIGN"),"FOREIGN");}
   progress.push("mutation:complete");
  };
  try{
  const error=await failed(()=>stage({...f.request,...mode==="catalog"?{catalogPublication:{beforeCommit:mutate}}:{hooks:{beforePublish:mutate}}}));publicError=error;inactive(error.report);assert(["failed","ambiguous"].includes(error.report.status));
  if(mode==="root")assert.equal(await fs.readFile(changed,"utf8"),"FOREIGN");else if(mode==="parent")assert.equal(await fs.readFile(path.join(f.managed,"versions","FOREIGN"),"utf8"),"FOREIGN");else if(mode==="anchor")assert.equal(await fs.readFile(f.receipt,"utf8"),"CHANGED");else if(mode==="catalog")assert.equal(await fs.readFile(f.catalog,"utf8"),"FOREIGN");else assert.equal(await fs.readFile(path.join(f.versionRoot,"FOREIGN"),"utf8"),"FOREIGN");
  }catch(checkpointError){
   console.error("Additional-stage drift fixture diagnostic:",inspect({mode,progress,publicError,checkpointError},{depth:12,customInspect:false,getters:false}));
   throw checkpointError;
  }
 }
});

test("version rename that moved then failed reports the destination without deleting or adopting it",async t=>{
 const stage=await api(),f=await fixture(t),cause=Object.assign(new Error("move result uncertain"),{code:"EIO"});let moves=0;
 const error=await failed(()=>stage({...f.request,hooks:{publication:{rename:async(a,b)=>{moves++;await fs.rename(a,b);throw cause;}}}}));inactive(error.report);assert.equal(error.cause,cause);assert.equal(moves,1);assert.equal(error.report.publication,"uncertain");assert.equal(error.report.catalog,"not-committed");assert(error.report.retainedPaths.includes(f.versionRoot));await absent(f.catalog);
 assert.deepEqual((await inspectManagedInstall({prefix:f.prefix})).versions.map(v=>v.version),["1.0.0"]);await preserved(f);
});

test("catalog rename that moved then failed remains uncertain and retains the published version",async t=>{
 const stage=await api(),f=await fixture(t),cause=new Error("catalog move result uncertain");
 const error=await failed(()=>stage({...f.request,catalogPublication:{rename:async(a,b)=>{await fs.rename(a,b);throw cause;}}}));inactive(error.report);assert.equal(error.cause,cause);assert.equal(error.report.publication,"published");assert.equal(error.report.catalog,"uncertain");assert(error.report.retainedPaths.includes(f.versionRoot));
 assert.deepEqual((await inspectManagedInstall({prefix:f.prefix})).versions.map(v=>v.version),["1.0.0","2.0.0"]);await preserved(f);
});

test("lease release uncertainty preserves actual committed evidence and the foreign marker",async t=>{
 const stage=await api(),f=await fixture(t);
 const error=await failed(()=>stage({...f.request,catalogPublication:{rename:async(a,b)=>{await fs.rename(a,b);await fs.writeFile(f.lock,"FOREIGN");}}}));inactive(error.report);assert.equal(error.report.status,"ambiguous");assert.equal(error.report.publication,"published");assert.equal(error.report.catalog,"committed");assert.equal(await fs.readFile(f.lock,"utf8"),"FOREIGN");
 assert.deepEqual((await inspectManagedInstall({prefix:f.prefix})).versions.map(v=>v.version),["1.0.0","2.0.0"]);await preserved(f);
});
