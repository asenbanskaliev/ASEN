import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import {tmpdir} from "node:os";
import {inspectManagedInstall,stageManagedInstall} from "../src/runtime/managed-install.js";
import {resolveManagedCliCandidate,verifyManagedVersion} from "../src/runtime/managed-version-verification.js";

async function fixture(t:{after:(fn:()=>Promise<void>)=>void},extra:Record<string,unknown>={}){
 const root=await fs.mkdtemp(path.join(tmpdir(),"vc-"));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const executed=path.join(root,"EXECUTED");
 async function staged(version:string,overrides:Record<string,unknown>){
  const prefix=path.join(root,"h"+version[0]),packageRoot=path.join(root,"p"+version[0]);await fs.mkdir(packageRoot);
  await fs.writeFile(path.join(packageRoot,"package.json"),JSON.stringify({name:"asen",version,engines:{node:">=0.0.0"},bin:{asen:"./cli.cjs"},...overrides}));
  await fs.writeFile(path.join(packageRoot,"cli.cjs"),'require("node:fs").writeFileSync('+JSON.stringify(executed)+',"UNEXPECTED");throw new Error("must not execute");');
  const request={prefix,packageRoot,version,confirmed:true,protectedPaths:[],files:[{sourcePath:"package.json",destinationPath:"package.json"},{sourcePath:"cli.cjs",destinationPath:"cli.cjs"}]};
  return{request,report:await stageManagedInstall(request)};
 }
 const first=await staged("1.0.0",{}),second=await staged("2.0.0",extra),prefix=first.request.prefix,managed=path.join(prefix,"install");
 await fs.cp(second.report.versionRoot,path.join(managed,"versions","2.0.0"),{recursive:true,errorOnExist:true,force:false});
 const versions=[first,second].map(item=>({version:item.report.version,files:item.report.files}));
 const catalog={schema:"asen.managed-version-catalog/v1",product:"asen",canonicalManagedRoot:await fs.realpath(managed),versions};
 return{root,prefix,managed,executed,first,versions,catalog,file:path.join(managed,"managed-versions.json"),secondRoot:path.join(managed,"versions","2.0.0")};
}
async function tree(root:string,omit?:string):Promise<unknown[]>{
 const rows:unknown[]=[];
 for(const name of (await fs.readdir(root)).sort()){
  const file=path.join(root,name);if(file===omit)continue;const stat=await fs.lstat(file);assert.equal(stat.isSymbolicLink(),false);
  rows.push([name,stat.isDirectory()?await tree(file,omit):(await fs.readFile(file)).toString("base64"),stat.mtimeMs]);
 }return rows;
}
async function absent(file:string){await assert.rejects(()=>fs.stat(file),{code:"ENOENT"});}
async function writeCatalog(f:Awaited<ReturnType<typeof fixture>>,value:unknown=f.catalog){await fs.writeFile(f.file,typeof value==="string"?value:JSON.stringify(value));}
function foreign(value:Awaited<ReturnType<typeof inspectManagedInstall>>){
 assert.equal(value.status,"foreign",JSON.stringify(value));assert.deepEqual(value.versions,[]);assert.equal(value.activeVersion,null);assert.equal(value.runtimeReady,false);
 assert.equal(value.reason,"ASEN managed-version catalog failed validation");
}

test("absent catalog preserves the exact legacy inventory and write-free identical staging",async t=>{
 const f=await fixture(t),before=await tree(f.root);
 assert.deepEqual(await inspectManagedInstall({prefix:f.prefix}),{status:"owned",managedRoot:f.managed,activeVersion:null,runtimeReady:false,versions:[f.versions[0]]});
 const staged=await stageManagedInstall(f.first.request);assert.equal(staged.status,"unchanged");assert.deepEqual(staged.files,f.versions[0]!.files);
 assert.deepEqual(await tree(f.root),before);await absent(f.file);await absent(f.executed);
});

test("a finite catalog inventories verified versions only and leaves legacy staging unchanged",async t=>{
 const f=await fixture(t);await writeCatalog(f);
 const orphan=path.join(f.managed,"versions","9.0.0");await fs.mkdir(orphan);await fs.writeFile(path.join(orphan,"unknown"),"FOREIGN");const before=await tree(f.root);
 assert.deepEqual(await inspectManagedInstall({prefix:f.prefix}),{status:"owned",managedRoot:f.managed,activeVersion:null,runtimeReady:false,versions:f.versions});
 assert.equal((await stageManagedInstall(f.first.request)).status,"unchanged");
 const unlisted=await resolveManagedCliCandidate({prefix:f.prefix,version:"9.0.0"});assert.equal(unlisted.candidate,null);assert.equal(unlisted.verification.integrity,"unverified");
 assert.deepEqual(await tree(f.root),before);assert.equal(await fs.readFile(path.join(orphan,"unknown"),"utf8"),"FOREIGN");await absent(f.executed);
});

test("malformed duplicate unsafe and legacy-mismatched catalogs fail closed without writes",async t=>{
 const f=await fixture(t),v1=f.versions[0]!,v2=f.versions[1]!;
 const cases:unknown[]=["not-json",{...f.catalog,schema:"unknown"},{...f.catalog,extra:true},{...f.catalog,versions:[]},
  {...f.catalog,versions:[v1,v2,v2]},{...f.catalog,versions:[v2]},
  {...f.catalog,versions:[{...v1,files:v1.files.map((file,i)=>i?file:{...file,sha256:"0".repeat(64)})},v2]},
  {...f.catalog,canonicalManagedRoot:f.root},{...f.catalog,versions:[v1,{...v2,extra:true}]},
  {...f.catalog,versions:[v1,{...v2,version:"02.0.0"}]},
  {...f.catalog,versions:[v1,{...v2,files:[...v2.files,v2.files[0]!]}]},
  {...f.catalog,versions:[v1,{...v2,files:v2.files.map((file,i)=>i?file:{...file,path:"../escape"})}]},
 ];
 if(process.platform==="win32")cases.push({...f.catalog,versions:[v1,{...v2,files:[...v2.files,{...v2.files[0]!,path:"PACKAGE.JSON"}]}]});
 for(const value of cases){await writeCatalog(f,value);const before=await tree(f.root);foreign(await inspectManagedInstall({prefix:f.prefix}));assert.deepEqual(await tree(f.root),before);await absent(f.executed);}
 await fs.rm(f.file);await fs.mkdir(f.file);const before=await tree(f.root);foreign(await inspectManagedInstall({prefix:f.prefix}));assert.deepEqual(await tree(f.root),before);
});

test("missing changed and namespace-expanded listed versions are retained rather than inventoried",async t=>{
 for(const mode of ["missing","changed","file","directory"]){
  const f=await fixture(t);await writeCatalog(f);
  if(mode==="missing")await fs.rm(path.join(f.secondRoot,"cli.cjs"));
  else if(mode==="changed")await fs.writeFile(path.join(f.secondRoot,"cli.cjs"),"CHANGED");
  else if(mode==="file")await fs.writeFile(path.join(f.secondRoot,"unlisted"),"FOREIGN");
  else await fs.mkdir(path.join(f.secondRoot,"unlisted"));
  const before=await tree(f.root);foreign(await inspectManagedInstall({prefix:f.prefix}));assert.deepEqual(await tree(f.root),before);await absent(f.executed);
 }
});

test("catalog-only metadata candidates keep the existing package bin and Node rules",async t=>{
 const f=await fixture(t);await writeCatalog(f);const before=await tree(f.root),resolved=await resolveManagedCliCandidate({prefix:f.prefix,version:"2.0.0"});
 assert.notEqual(resolved.candidate,null);assert.equal(resolved.candidate?.versionRoot,f.secondRoot);assert.equal(resolved.candidate?.bin,"cli.cjs");
 assert.equal(resolved.verification.integrity,"verified");assert.equal(resolved.verification.packageMetadata,"verified");assert.equal(resolved.verification.nodeCompatibility,"compatible");assert.equal(resolved.verification.reason,null);
 assert.equal(resolved.verification.runtimeProbe,"not-run");assert.equal(resolved.verification.runtimeReady,false);assert.deepEqual(await tree(f.root),before);await absent(f.executed);
 for(const [extra,reason] of [
  [{name:"not-asen"},"Managed package metadata is invalid"],
  [{version:"3.0.0"},"Managed package metadata is invalid"],
  [{bin:{asen:"unlisted.cjs"}},"Managed bin.asen must identify a listed canonical file"],
  [{engines:{node:"^22.0.0"}},"Managed Node engine range is unsupported"],
 ] as const){
  const other=await fixture(t,extra);await writeCatalog(other);const previous=await tree(other.root),report=await verifyManagedVersion({prefix:other.prefix,version:"2.0.0"});
  assert.equal(report.integrity,"verified");assert.equal(report.reason,reason);assert.equal(report.runtimeProbe,"not-run");assert.equal(report.runtimeReady,false);
  assert.deepEqual(await tree(other.root),previous);await absent(other.executed);
 }
});

test("catalog drift during inspection is refused without repairing the caller's changed data",async t=>{
 const f=await fixture(t);await writeCatalog(f);const before=await tree(f.root,f.file);let changes=0;
 const report=await inspectManagedInstall({prefix:f.prefix,hooks:{metadata:async(file,phase,fallback)=>{
  if(file===f.first.report.versionRoot&&phase==="verify"&&changes===0){changes++;await fs.writeFile(f.file,"CHANGED");}return fallback();
 }}});
 foreign(report);assert.equal(changes,1);assert.equal(await fs.readFile(f.file,"utf8"),"CHANGED");assert.deepEqual(await tree(f.root,f.file),before);await absent(f.executed);
});

function selectorForeign(value:Awaited<ReturnType<typeof inspectManagedInstall>>){
 assert.equal(value.status,"foreign",JSON.stringify(value));assert.deepEqual(value.versions,[]);assert.equal(value.activeVersion,null);assert.equal(value.runtimeReady,false);
 assert.equal(value.reason,"ASEN managed-version selector failed validation");
}
test("ordinary current selects a verified catalog or legacy version without writes or execution",async t=>{
 for(const [catalog,version] of [[true,"1.0.0"],[true,"2.0.0"],[false,"1.0.0"]] as const){
  const f=await fixture(t);if(catalog)await writeCatalog(f);const current=path.join(f.managed,"current");await fs.writeFile(current,version+"\n");const before=await tree(f.root);
  const value=await inspectManagedInstall({prefix:f.prefix});assert.equal(value.status,"owned");assert.equal(value.activeVersion,version);assert.equal(value.runtimeReady,false);assert.deepEqual(value.versions,catalog?f.versions:[f.versions[0]]);
  const explicit=await resolveManagedCliCandidate({prefix:f.prefix,version:"1.0.0"});assert.equal(explicit.candidate?.versionRoot,f.first.report.versionRoot);assert.equal(explicit.verification.runtimeProbe,"not-run");assert.equal(explicit.verification.runtimeReady,false);
  assert.deepEqual(await tree(f.root),before);await absent(path.join(f.managed,".asen-maintenance.lock"));await absent(f.executed);
 }
});
test("malformed unlisted and non-file selectors are refused without changing caller data",async t=>{
 const f=await fixture(t);await writeCatalog(f);const current=path.join(f.managed,"current");
 for(const bytes of ["","2.0.0","2.0.0\r\n","02.0.0\n","../2.0.0\n","2.0.0\n\n","9.0.0\n"," 2.0.0\n","2.0.0\0\n","2.0.0-rc.1\n","\uFEFF2.0.0\n"]){
  await fs.writeFile(current,bytes);const before=await tree(f.root);selectorForeign(await inspectManagedInstall({prefix:f.prefix}));assert.deepEqual(await tree(f.root),before);await absent(f.executed);await absent(path.join(f.managed,".asen-maintenance.lock"));
 }
 await fs.rm(current);await fs.mkdir(current);const before=await tree(f.root);selectorForeign(await inspectManagedInstall({prefix:f.prefix}));assert.deepEqual(await tree(f.root),before);await absent(f.executed);
 const legacy=await fixture(t);await fs.writeFile(path.join(legacy.managed,"current"),"2.0.0\n");const previous=await tree(legacy.root);selectorForeign(await inspectManagedInstall({prefix:legacy.prefix}));assert.deepEqual(await tree(legacy.root),previous);
});
test("linked noncanonical and incomplete selector claims fail closed using simulated metadata",async t=>{
 for(const mode of ["link","canonical","identity","size"]){
  const f=await fixture(t);await writeCatalog(f);const current=path.join(f.managed,"current");await fs.writeFile(current,"2.0.0\n");const before=await tree(f.root);let observations=0;
  const value=await inspectManagedInstall({prefix:f.prefix,hooks:{metadata:async(file,phase,fallback)=>{
   const item=await fallback();if(file!==current||phase!=="validate")return item;observations++;assert(item);
   if(mode==="link")return{...item,kind:"link"};
   if(mode==="canonical")return{...item,canonicalPath:path.join(f.root,"not-the-selector")};
   if(mode==="identity"){const {identity:_identity,...rest}=item;return rest;}
   const {size:_size,...rest}=item;return rest;
  }}});
  selectorForeign(value);assert.equal(observations,1);assert.deepEqual(await tree(f.root),before);await absent(f.executed);await absent(path.join(f.managed,".asen-maintenance.lock"));
 }
});
test("selector bytes identity disappearance and appearance drift preserve the caller mutation",async t=>{
 for(const mode of ["bytes","replacement","delete","appear"]){
  const f=await fixture(t);await writeCatalog(f);const current=path.join(f.managed,"current");if(mode!=="appear")await fs.writeFile(current,"2.0.0\n");
  let changes=0,changedState:unknown[]|undefined;
  const value=await inspectManagedInstall({prefix:f.prefix,hooks:{metadata:async(file,phase,fallback)=>{
   if(file===f.first.report.versionRoot&&phase==="verify"&&changes===0){
    changes++;if(mode==="delete")await fs.rm(current);
    else if(mode==="replacement"){await fs.rename(current,current+".saved");await fs.writeFile(current,"2.0.0\n");}
    else await fs.writeFile(current,mode==="bytes"?"1.0.0\n":"2.0.0\n");
    changedState=await tree(f.root);
   }return fallback();
  }}});
  selectorForeign(value);assert.equal(changes,1);assert(changedState);assert.deepEqual(await tree(f.root),changedState);await absent(f.executed);await absent(path.join(f.managed,".asen-maintenance.lock"));
 }
});
test("selector inspection rejects simulated root identity drift without writes",async t=>{
 const f=await fixture(t);await writeCatalog(f);await fs.writeFile(path.join(f.managed,"current"),"2.0.0\n");const before=await tree(f.root);let changes=0;
 const value=await inspectManagedInstall({prefix:f.prefix,hooks:{metadata:async(file,phase,fallback)=>{
  const item=await fallback();if(file===f.managed&&phase==="revalidate"){changes++;assert(item);return{...item,identity:"SIMULATED-REPLACEMENT"};}return item;
 }}});
 selectorForeign(value);assert.equal(changes,1);assert.deepEqual(await tree(f.root),before);await absent(f.executed);await absent(path.join(f.managed,".asen-maintenance.lock"));
});
test("absent selector inspection still rejects simulated root identity drift without writes",async t=>{
 const f=await fixture(t);await writeCatalog(f);const current=path.join(f.managed,"current"),before=await tree(f.root);let changes=0;
 const value=await inspectManagedInstall({prefix:f.prefix,hooks:{metadata:async(file,phase,fallback)=>{
  const item=await fallback();if(file===f.managed&&phase==="revalidate"){changes++;assert(item);return{...item,identity:"SIMULATED-REPLACEMENT"};}return item;
 }}});
 selectorForeign(value);assert.equal(changes,1);assert.deepEqual(await tree(f.root),before);await absent(current);await absent(f.executed);await absent(path.join(f.managed,".asen-maintenance.lock"));
});
