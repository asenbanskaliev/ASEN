import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import {tmpdir} from "node:os";
import {inspectManagedInstall,stageAdditionalManagedVersion,stageManagedInstall,type ManagedVersionSelectionReport} from "../src/runtime/managed-install.js";
import {withManagedMaintenanceLock} from "../src/runtime/managed-maintenance-lock.js";

const api=async()=>{
 const module=await import("../src/runtime/managed-install.js");
 assert.equal(typeof module.selectManagedVersion,"function","managed-version selection API missing");
 return module.selectManagedVersion;
};
async function absent(file:string){await assert.rejects(()=>fs.lstat(file),{code:"ENOENT"});}
async function tree(root:string):Promise<unknown[]>{
 const rows:unknown[]=[];
 for(const name of(await fs.readdir(root)).sort()){
  const file=path.join(root,name),stat=await fs.lstat(file);
  rows.push([name,stat.isSymbolicLink()?"link":stat.isDirectory()?await tree(file):(await fs.readFile(file)).toString("base64"),stat.mtimeMs]);
 }
 return rows;
}
async function incoming(root:string,prefix:string,version:string){
 const packageRoot=path.join(root,"package-"+version);await fs.mkdir(packageRoot);
 await fs.writeFile(path.join(packageRoot,"package.json"),JSON.stringify({name:"asen",version,engines:{node:">=0.0.0"},bin:{asen:"cli.cjs"}}));
 await fs.writeFile(path.join(packageRoot,"cli.cjs"),'require("node:fs").writeFileSync('+JSON.stringify(path.join(root,"EXECUTED"))+',"EXECUTED");throw new Error("selection must not execute package code");');
 return{prefix,packageRoot,version,confirmed:true,protectedPaths:[],files:[{sourcePath:"package.json",destinationPath:"package.json"},{sourcePath:"cli.cjs",destinationPath:"cli.cjs"}]};
}
async function fixture(t:{after:(fn:()=>Promise<void>)=>void},catalog=false){
 const root=await fs.mkdtemp(path.join(tmpdir(),"vs-"));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const prefix=path.join(root,"home"),personal=path.join(prefix,"config.json");await fs.mkdir(prefix);await fs.writeFile(personal,"PERSONAL");
 const first=await incoming(root,prefix,"1.0.0"),firstReport=await stageManagedInstall(first);
 let second:Awaited<ReturnType<typeof incoming>>|undefined;
 if(catalog){second=await incoming(root,prefix,"2.0.0");await stageAdditionalManagedVersion(second);}
 const managed=path.join(prefix,"install"),current=path.join(managed,"current"),lock=path.join(managed,".asen-maintenance.lock"),executed=path.join(root,"EXECUTED");
 return{root,prefix,personal,first,firstReport,second,managed,current,lock,executed};
}
function inactive(report:ManagedVersionSelectionReport){
 assert.equal(report.activation,"not-active");assert.equal(report.runtimeReady,false);assert(Object.isFrozen(report));assert(Object.isFrozen(report.retainedPaths));
}
async function failed(action:()=>Promise<ManagedVersionSelectionReport>){
 try{await action();assert.fail("expected managed-version selection failure");}
 catch(error){assert.equal((error as Error).name,"ManagedVersionSelectionError");return error as Error&{report:ManagedVersionSelectionReport};}
}

test("selection preflight refusals are write-free and create no selector temporary lease or execution",async t=>{
 const select=await api(),f=await fixture(t,true);
 const cases=[
  {...f.second!,confirmed:false,expectedCurrentVersion:null},
  {...f.second!,prefix:"relative",expectedCurrentVersion:null},
  {...f.second!,version:"02.0.0",expectedCurrentVersion:null},
  {...f.second!,version:"9.0.0",expectedCurrentVersion:null},
  {...f.second!,expectedCurrentVersion:"02.0.0"},
  {...f.second!,expectedCurrentVersion:"1.0.0"},
 ];
 for(const request of cases){const before=await tree(f.root);await assert.rejects(()=>select(request));assert.deepEqual(await tree(f.root),before);await absent(f.current);await absent(f.lock);await absent(f.executed);}
 await fs.writeFile(f.current,"malformed");const malformed=await tree(f.root);await assert.rejects(()=>select({...f.second!,expectedCurrentVersion:null}));assert.deepEqual(await tree(f.root),malformed);await absent(f.lock);await absent(f.executed);
 const foreign=path.join(f.root,"foreign");await fs.mkdir(foreign);const foreignBefore=await tree(f.root);await assert.rejects(()=>select({prefix:foreign,version:"1.0.0",expectedCurrentVersion:null,confirmed:true}));assert.deepEqual(await tree(f.root),foreignBefore);await absent(f.executed);
});

test("legacy singleton selection atomically publishes exact LF metadata without activation",async t=>{
 const select=await api(),f=await fixture(t),beforePersonal=await fs.readFile(f.personal),report=await select({prefix:f.prefix,version:"1.0.0",expectedCurrentVersion:null,confirmed:true});
 inactive(report);assert.deepEqual(report,{status:"selected",prefix:f.prefix,managedRoot:f.managed,requestedVersion:"1.0.0",previousSelection:null,publication:"committed",cleanup:"not-needed",retainedPaths:[],error:null,activation:"not-active",runtimeReady:false});
 assert.equal(await fs.readFile(f.current,"utf8"),"1.0.0\n");assert.deepEqual(await fs.readFile(f.personal),beforePersonal);assert.equal((await inspectManagedInstall({prefix:f.prefix})).activeVersion,"1.0.0");await absent(f.lock);await absent(f.executed);
});

test("actual additional-stage catalog selection preserves all package catalog receipt and personal bytes",async t=>{
 const select=await api(),f=await fixture(t,true),catalog=path.join(f.managed,"managed-versions.json"),receipt=path.join(f.managed,"managed-install.json");
 const preserved=await Promise.all([fs.readFile(catalog),fs.readFile(receipt),fs.readFile(f.personal),fs.readFile(path.join(f.managed,"versions","1.0.0","cli.cjs")),fs.readFile(path.join(f.managed,"versions","2.0.0","cli.cjs"))]);
 const report=await select({prefix:f.prefix,version:"2.0.0",expectedCurrentVersion:null,confirmed:true});inactive(report);assert.equal(report.status,"selected");assert.equal(report.publication,"committed");assert.equal(await fs.readFile(f.current,"utf8"),"2.0.0\n");
 assert.deepEqual(await Promise.all([fs.readFile(catalog),fs.readFile(receipt),fs.readFile(f.personal),fs.readFile(path.join(f.managed,"versions","1.0.0","cli.cjs")),fs.readFile(path.join(f.managed,"versions","2.0.0","cli.cjs"))]),preserved);
 const inventory=await inspectManagedInstall({prefix:f.prefix});assert.equal(inventory.status,"owned");assert.equal(inventory.activeVersion,"2.0.0");assert.equal(inventory.runtimeReady,false);await absent(f.lock);await absent(f.executed);
});

test("already-selected identical CAS intent is frozen and completely write-free",async t=>{
 const select=await api(),f=await fixture(t);await fs.writeFile(f.current,"1.0.0\n");const before=await tree(f.root),report=await select({prefix:f.prefix,version:"1.0.0",expectedCurrentVersion:"1.0.0",confirmed:true});
 inactive(report);assert.deepEqual(report,{status:"unchanged",prefix:f.prefix,managedRoot:f.managed,requestedVersion:"1.0.0",previousSelection:"1.0.0",publication:"unchanged",cleanup:"not-needed",retainedPaths:[],error:null,activation:"not-active",runtimeReady:false});assert.deepEqual(await tree(f.root),before);await absent(f.lock);await absent(f.executed);
});

test("busy lease refusal and held selection rebind current target inventory and root instead of repairing drift",async t=>{
 const select=await api();
 {
  const f=await fixture(t,true);let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});let entered!:()=>void;const held=new Promise<void>(resolve=>{entered=resolve;});
  const holder=withManagedMaintenanceLock({prefix:f.prefix,confirmed:true},async()=>{entered();await gate;});await held;
  const refusal=assert.rejects(select({prefix:f.prefix,version:"2.0.0",expectedCurrentVersion:null,confirmed:true}),error=>{
   const value=error as Error&{cause?:{code?:unknown};report?:ManagedVersionSelectionReport};assert.equal(value.name,"ManagedVersionSelectionError");assert.equal(value.cause?.code,"LOCK_TIMEOUT");assert.equal(value.report?.status,"ambiguous");assert.equal(value.report?.publication,"not-started");assert(value.report?.retainedPaths.includes(f.lock));return true;
  });
  await refusal;assert.equal((await fs.readdir(f.managed)).some(name=>name.startsWith("current.")),false);release();await holder;await absent(f.current);await absent(f.lock);await absent(f.executed);
 }
 for(const mode of ["root","catalog","current","target"] as const){
  const f=await fixture(t,true),catalog=path.join(f.managed,"managed-versions.json"),target=path.join(f.managed,"versions","2.0.0","cli.cjs"),rootMarker=path.join(f.managed,"CALLER-ROOT-DRIFT");let rootChanged=false;
  const error=await failed(()=>select({prefix:f.prefix,version:"2.0.0",expectedCurrentVersion:null,confirmed:true,hooks:{
   metadata:async(file,phase,fallback)=>{const value=await fallback();return mode==="root"&&rootChanged&&file===f.managed&&phase==="revalidate"&&value?{...value,identity:"SIMULATED-ROOT-DRIFT"}:value;},
   beforePublish:async()=>{
    if(mode==="root"){await fs.writeFile(rootMarker,"CALLER");rootChanged=true;}
    else if(mode==="catalog")await fs.writeFile(catalog,"CALLER-CATALOG");
    else if(mode==="current")await fs.writeFile(f.current,"1.0.0\n");
    else await fs.writeFile(target,"CALLER-TARGET");
   },
  }}));
  inactive(error.report);assert.equal((error.cause as {code?:unknown}).code,"SOURCE_DRIFT");assert.equal(error.report.status,"failed");assert.equal(error.report.publication,"not-started");assert.equal(error.report.cleanup,"uncertain");const retainedTemp=error.report.retainedPaths.find(file=>path.basename(file).startsWith("current.")&&file.endsWith(".tmp"));assert(retainedTemp);assert.equal(error.report.retainedPaths.includes(f.current),mode==="current");
  if(mode==="root")assert.equal(await fs.readFile(rootMarker,"utf8"),"CALLER");else if(mode==="catalog")assert.equal(await fs.readFile(catalog,"utf8"),"CALLER-CATALOG");else if(mode==="current")assert.equal(await fs.readFile(f.current,"utf8"),"1.0.0\n");else assert.equal(await fs.readFile(target,"utf8"),"CALLER-TARGET");
  await absent(f.lock);await absent(f.executed);
 }
});

test("nonordinary linked noncanonical and replaced selector or temporary inputs are refused and retained",async t=>{
 const select=await api();
 for(const mode of ["linked","noncanonical","identity","replaced"] as const){
  const f=await fixture(t);await fs.writeFile(f.current,"1.0.0\n");
  const before=await tree(f.root);await assert.rejects(()=>select({prefix:f.prefix,version:"1.0.0",expectedCurrentVersion:"1.0.0",confirmed:true,hooks:{metadata:async(file,phase,fallback)=>{
   const value=await fallback();if(file!==f.current||phase!=="validate"||!value)return value;
   if(mode==="linked")return{...value,kind:"link" as const};
   if(mode==="noncanonical")return{...value,canonicalPath:path.join(f.root,"FOREIGN-CURRENT")};
   if(mode==="identity"){const {identity:_identity,...withoutIdentity}=value;return withoutIdentity;}
   await fs.writeFile(f.current,"CALLER-REPLACED");return value;
  }}}),error=>(error as {code?:unknown}).code==="FOREIGN_MANAGED_ROOT");
  if(mode==="replaced")assert.equal(await fs.readFile(f.current,"utf8"),"CALLER-REPLACED");else assert.deepEqual(await tree(f.root),before);
  await absent(f.lock);await absent(f.executed);
 }
 {
  const f=await fixture(t);await fs.mkdir(f.current);const before=await tree(f.root);
  await assert.rejects(()=>select({prefix:f.prefix,version:"1.0.0",expectedCurrentVersion:null,confirmed:true}),error=>(error as {code?:unknown}).code==="FOREIGN_MANAGED_ROOT");assert.deepEqual(await tree(f.root),before);await absent(f.lock);await absent(f.executed);
 }
 for(const mode of ["linked","noncanonical","identity","replaced"] as const){
  const f=await fixture(t);let temp="";
  const error=await failed(()=>select({prefix:f.prefix,version:"1.0.0",expectedCurrentVersion:null,confirmed:true,hooks:{metadata:async(file,phase,fallback)=>{
   const value=await fallback();if(!path.basename(file).startsWith("current.")||phase!=="verify"||!value)return value;temp=file;
   if(mode==="linked")return{...value,kind:"link" as const};
   if(mode==="noncanonical")return{...value,canonicalPath:path.join(f.root,"FOREIGN-TEMP")};
   if(mode==="identity"){const {identity:_identity,...withoutIdentity}=value;return withoutIdentity;}
   await fs.writeFile(file,"CALLER-REPLACED");return value;
  }}}));
  inactive(error.report);assert.equal((error.cause as {code?:unknown}).code,"SOURCE_DRIFT");assert.equal(error.report.status,"failed");assert.equal(error.report.publication,"not-started");assert.equal(error.report.cleanup,"uncertain");assert(temp);assert(error.report.retainedPaths.includes(temp));
  assert.equal(await fs.readFile(temp,"utf8"),mode==="replaced"?"CALLER-REPLACED":"1.0.0\n");await absent(f.current);await absent(f.lock);await absent(f.executed);
 }
});

test("exclusive selector temporary collision preserves foreign bytes and reports no publication",async t=>{
 const select=await api(),f=await fixture(t);let collision="";
 const error=await failed(()=>select({prefix:f.prefix,version:"1.0.0",expectedCurrentVersion:null,confirmed:true,hooks:{metadata:async(file,phase,fallback)=>{const value=await fallback();if(path.basename(file).startsWith("current.")&&phase==="validate"&&!value){collision=file;await fs.writeFile(file,"FOREIGN");}return value;}}}));inactive(error.report);assert.equal(error.report.status,"failed");assert.equal(error.report.publication,"not-started");assert.equal(error.report.cleanup,"retained");assert.equal(await fs.readFile(collision,"utf8"),"FOREIGN");assert(error.report.retainedPaths.includes(collision));await absent(f.current);await absent(f.lock);await absent(f.executed);
});

test("selector rename moved then threw remains ambiguous uncertain and never deletes destination",async t=>{
 const select=await api(),f=await fixture(t),cause=new Error("move result uncertain");let moves=0;
 const error=await failed(()=>select({prefix:f.prefix,version:"1.0.0",expectedCurrentVersion:null,confirmed:true,hooks:{publication:{rename:async(from,to)=>{moves++;await fs.rename(from,to);throw cause;}}}}));inactive(error.report);assert.equal(error.cause,cause);assert.equal(moves,1);assert.equal(error.report.status,"ambiguous");assert.equal(error.report.publication,"uncertain");assert.equal(error.report.cleanup,"retained");assert.equal(await fs.readFile(f.current,"utf8"),"1.0.0\n");assert(error.report.retainedPaths.includes(f.current));await absent(f.lock);await absent(f.executed);
});

test("verified selector commit plus foreign lease release preserves committed evidence and both causes",async t=>{
 const select=await api(),f=await fixture(t);const releaseCause="FOREIGN";
 const error=await failed(()=>select({prefix:f.prefix,version:"1.0.0",expectedCurrentVersion:null,confirmed:true,hooks:{publication:{rename:async(from,to)=>{await fs.rename(from,to);await fs.writeFile(f.lock,releaseCause);}}}}));inactive(error.report);assert.equal(error.report.status,"ambiguous");assert.equal(error.report.publication,"committed");assert.equal(error.report.previousSelection,null);assert.equal(await fs.readFile(f.current,"utf8"),"1.0.0\n");assert.equal((await inspectManagedInstall({prefix:f.prefix})).activeVersion,"1.0.0");assert.equal(await fs.readFile(f.lock,"utf8"),releaseCause);assert(error.report.retainedPaths.includes(f.lock));assert(error.cause);await absent(f.executed);
});

test("non-null CAS atomically replaces an existing catalog selection under the held lease",async t=>{
 const select=await api(),f=await fixture(t,true),catalog=path.join(f.managed,"managed-versions.json"),receipt=path.join(f.managed,"managed-install.json"),versionsRoot=path.join(f.managed,"versions");
 await fs.writeFile(f.current,"1.0.0\n");
 const files=[catalog,receipt,f.personal,path.join(versionsRoot,"1.0.0","package.json"),path.join(versionsRoot,"1.0.0","cli.cjs"),path.join(versionsRoot,"2.0.0","package.json"),path.join(versionsRoot,"2.0.0","cli.cjs")];
 const directories=[versionsRoot,path.join(versionsRoot,"1.0.0"),path.join(versionsRoot,"2.0.0")];
 const beforeFiles=await Promise.all(files.map(async file=>({file,bytes:await fs.readFile(file),mtimeMs:(await fs.stat(file)).mtimeMs})));
 const beforeDirectories=await Promise.all(directories.map(async directory=>({directory,mtimeMs:(await fs.stat(directory)).mtimeMs})));
 let moves=0,contentionEntered=0;
 const report=await select({prefix:f.prefix,version:"2.0.0",expectedCurrentVersion:"1.0.0",confirmed:true,hooks:{publication:{rename:async(from,to)=>{
  moves++;assert.equal(moves,1);assert.equal(to,f.current);assert.equal(await fs.readFile(f.current,"utf8"),"1.0.0\n");
  await assert.rejects(()=>withManagedMaintenanceLock({prefix:f.prefix,confirmed:true,timeoutMs:1},async()=>{contentionEntered++;}),error=>(error as {code?:unknown}).code==="LOCK_TIMEOUT");assert.equal(contentionEntered,0);
  await fs.rename(from,to);
 }}}});
 inactive(report);assert.deepEqual(report,{status:"selected",prefix:f.prefix,managedRoot:f.managed,requestedVersion:"2.0.0",previousSelection:"1.0.0",publication:"committed",cleanup:"not-needed",retainedPaths:[],error:null,activation:"not-active",runtimeReady:false});assert.equal(moves,1);
 assert.equal(await fs.readFile(f.current,"utf8"),"2.0.0\n");const inventory=await inspectManagedInstall({prefix:f.prefix});assert.equal(inventory.status,"owned");assert.equal(inventory.activeVersion,"2.0.0");assert.equal(inventory.runtimeReady,false);
 for(const before of beforeFiles){assert.deepEqual(await fs.readFile(before.file),before.bytes);assert.equal((await fs.stat(before.file)).mtimeMs,before.mtimeMs);}
 for(const before of beforeDirectories)assert.equal((await fs.stat(before.directory)).mtimeMs,before.mtimeMs);
 assert.equal((await fs.readdir(f.managed)).some(name=>name.startsWith("current.")&&name.endsWith(".tmp")),false);await absent(f.lock);await absent(f.executed);
});
