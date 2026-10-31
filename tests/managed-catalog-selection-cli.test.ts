import test from "node:test";
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import {tmpdir} from "node:os";
import {runAsen} from "../src/cli.js";
import {stageAdditionalManagedVersion,stageManagedInstall,selectManagedVersion,type ManagedVersionSelectionReport} from "../src/runtime/managed-install.js";
import {withManagedMaintenanceLock} from "../src/runtime/managed-maintenance-lock.js";

const V1="1.2.0",V2="1.3.0";
const USAGE="Unsupported ASEN managed select command. Expected: managed select <exact-target-version> --expected-current <exact-current-version>.\n";
const NOT_CONFIRMED="Managed version selection is not confirmed; inspect the reported state before retrying.\n";
type Fixture=Awaited<ReturnType<typeof fixture>>;

async function absent(file:string){await assert.rejects(()=>fs.lstat(file),{code:"ENOENT"});}
async function inventory(root:string):Promise<unknown[]> {
 const rows:unknown[]=[];
 for(const name of (await fs.readdir(root)).sort()){
  const file=path.join(root,name),entry=await fs.lstat(file);
  rows.push([name,entry.isSymbolicLink()?"link":entry.isDirectory()?await inventory(file):{bytes:(await fs.readFile(file)).toString("base64"),mtimeMs:entry.mtimeMs}]);
 }
 return rows;
}
async function incoming(root:string,prefix:string,version:string){
 const packageRoot=path.join(root,"producer-"+version);await fs.mkdir(packageRoot);
 await fs.writeFile(path.join(packageRoot,"package.json"),JSON.stringify({name:"asen",version,engines:{node:">=0.0.0"},bin:{asen:"cli.cjs"}}));
 await fs.writeFile(path.join(packageRoot,"cli.cjs"),`require("node:fs").writeFileSync(${JSON.stringify(path.join(root,"EXECUTED"))},"EXECUTED");throw new Error("managed select executed staged code");`);
 return{prefix,packageRoot,version,confirmed:true,protectedPaths:[],files:[{sourcePath:"package.json",destinationPath:"package.json"},{sourcePath:"cli.cjs",destinationPath:"cli.cjs"}]};
}
async function fixture(t:test.TestContext,selected:typeof V1|typeof V2|null=V2){
 const base=process.env.TEMP??process.env.TMP??tmpdir(),root=await fs.mkdtemp(path.join(base,"mcs-"));
 t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const home=path.join(root,"home ü"),prefix=path.join(home,".asen"),personal=path.join(prefix,"personal.bin");
 await fs.mkdir(prefix,{recursive:true});await fs.writeFile(personal,Buffer.from([0,255,1,2,3]));
 const one=await incoming(root,prefix,V1),two=await incoming(root,prefix,V2);
 await stageManagedInstall(one);await stageAdditionalManagedVersion(two);
 if(selected)await selectManagedVersion({prefix,version:selected,expectedCurrentVersion:null,confirmed:true});
 const managed=path.join(prefix,"install");
 return{root,home,prefix,personal,managed,current:path.join(managed,"current"),catalog:path.join(managed,"managed-versions.json"),receipt:path.join(managed,"managed-install.json"),versions:path.join(managed,"versions"),lock:path.join(managed,".asen-maintenance.lock"),executed:path.join(root,"EXECUTED")};
}
function cleanEnv(f:Fixture,extra:NodeJS.ProcessEnv={}):NodeJS.ProcessEnv{
 const systemRoot=process.env.SystemRoot??process.env.SYSTEMROOT;
 return{SystemRoot:systemRoot,WINDIR:systemRoot,OS:process.env.OS,PATH:path.dirname(process.execPath),PATHEXT:process.env.PATHEXT,
  HOME:f.home,USERPROFILE:f.home,TEMP:f.root,TMP:f.root,TMPDIR:f.root,APPDATA:path.join(f.root,"appdata"),LOCALAPPDATA:path.join(f.root,"local"),
  XDG_CONFIG_HOME:path.join(f.root,"xc"),XDG_CACHE_HOME:path.join(f.root,"xd"),XDG_DATA_HOME:path.join(f.root,"xx"),TSX_DISABLE_CACHE:"1",ASEN_NO_SKILL_REGISTRY:"1",...extra};
}
function invoke(f:Fixture,args:readonly string[],extra:NodeJS.ProcessEnv={}){
 const result=spawnSync(process.execPath,["--import","tsx",path.resolve("src/cli.ts"),...args],{cwd:process.cwd(),env:cleanEnv(f,extra),shell:false,timeout:10000,maxBuffer:1024*1024,encoding:"utf8"});
 assert.equal(result.error,undefined);assert.equal(result.signal,null);
 return{code:result.status,stdout:result.stdout,stderr:result.stderr};
}
function report(f:Fixture,status:"selected"|"unchanged",target:string,previous:string):ManagedVersionSelectionReport{
 return{status,prefix:f.prefix,managedRoot:f.managed,requestedVersion:target,previousSelection:previous,publication:status==="selected"?"committed":"unchanged",cleanup:"not-needed",retainedPaths:[],error:null,activation:"not-active",runtimeReady:false};
}
async function preservedFiles(f:Fixture){
 const files=[f.catalog,f.receipt,f.personal,path.join(f.versions,V1,"package.json"),path.join(f.versions,V1,"cli.cjs"),path.join(f.versions,V2,"package.json"),path.join(f.versions,V2,"cli.cjs")];
 return Promise.all(files.map(async file=>({file,bytes:await fs.readFile(file),mtimeMs:(await fs.stat(file)).mtimeMs})));
}
async function assertPreserved(rows:Awaited<ReturnType<typeof preservedFiles>>){for(const row of rows){assert.deepEqual(await fs.readFile(row.file),row.bytes,row.file);assert.equal((await fs.stat(row.file)).mtimeMs,row.mtimeMs,row.file);}}
async function noTransient(f:Fixture){await absent(f.lock);await absent(f.executed);assert.equal((await fs.readdir(f.managed)).some(name=>name.startsWith("current.")&&name.endsWith(".tmp")),false);}

// Behavioral RED: admitted762 recognizes only managed run, so this real public command returns exit 2 with the old managed-run usage instead of selecting V1.
test("public managed select returns from 2 to retained 1 with exact JSON and metadata-only effects",async t=>{
 const f=await fixture(t,V2),before=await preservedFiles(f);
 assert.deepEqual(invoke(f,["managed","select",V1,"--expected-current",V2]),{code:0,stdout:JSON.stringify(report(f,"selected",V1,V2),null,2)+"\n",stderr:""});
 assert.equal(await fs.readFile(f.current,"utf8"),V1+"\n");await assertPreserved(before);await noTransient(f);
});

test("public managed select advances 1 to retained 2 without executing either staged CLI",async t=>{
 const f=await fixture(t,V1),before=await preservedFiles(f);
 assert.deepEqual(invoke(f,["managed","select",V2,"--expected-current",V1]),{code:0,stdout:JSON.stringify(report(f,"selected",V2,V1),null,2)+"\n",stderr:""});
 assert.equal(await fs.readFile(f.current,"utf8"),V2+"\n");await assertPreserved(before);await noTransient(f);
});

test("matching target and CAS is exact lock-free write-free unchanged output",async t=>{
 const f=await fixture(t,V1);let entered!:()=>void,release!:()=>void;
 const active=new Promise<void>(resolve=>{entered=resolve;}),gate=new Promise<void>(resolve=>{release=resolve;});
 const holder=withManagedMaintenanceLock({prefix:f.prefix,confirmed:true},async()=>{entered();await gate;});await active;
 try{
  const whileHeld=await inventory(f.root);
  assert.deepEqual(invoke(f,["managed","select",V1,"--expected-current",V1]),{code:0,stdout:JSON.stringify(report(f,"unchanged",V1,V1),null,2)+"\n",stderr:""});
  assert.deepEqual(await inventory(f.root),whileHeld,"idempotent selection touched state or contended for the held lease");await absent(f.executed);
 }finally{release();await holder;}
 await noTransient(f);
});

test("selection refusals preserve the complete deliberate state and expose existing backend messages",async t=>{
 const cases=[
  {name:"stale CAS",prepare:async(_f:Fixture)=>{},args:["managed","select",V1,"--expected-current","9.9.9"],message:"Managed version selection compare-and-set value changed"},
  {name:"unlisted target",prepare:async(f:Fixture)=>{await fs.mkdir(path.join(f.versions,"9.9.9"));},args:["managed","select","9.9.9","--expected-current",V2],message:"Requested managed version is not listed in the owned inventory"},
  {name:"foreign prefix",prepare:async(f:Fixture)=>{await fs.rename(f.managed,path.join(f.root,"foreign-install"));},args:["managed","select",V1,"--expected-current",V2],message:"Managed version selection requires a canonical owned inventory"},
  {name:"invalid inventory",prepare:async(f:Fixture)=>{await fs.writeFile(f.catalog,"INVALID-CATALOG");},args:["managed","select",V1,"--expected-current",V2],message:"Managed version selection requires a canonical owned inventory"},
  {name:"current absent",selected:null,prepare:async(_f:Fixture)=>{},args:["managed","select",V1,"--expected-current",V2],message:"Managed version selection compare-and-set value changed"},
 ] as const;
 for(const item of cases)await t.test(item.name,async t=>{
  const f=await fixture(t,"selected" in item?item.selected:V2);await item.prepare(f);const before=await inventory(f.root);
  assert.deepEqual(invoke(f,item.args),{code:1,stdout:"",stderr:`Managed version selection refused: ${item.message}\n`});
  assert.deepEqual(await inventory(f.root),before);await absent(f.executed);await absent(f.lock);
 });
});

test("real held maintenance lease produces the exact truthful ambiguous backend report and no retry",async t=>{
 const f=await fixture(t,V2),before=await inventory(f.root);let entered!:()=>void,release!:()=>void;
 const active=new Promise<void>(resolve=>{entered=resolve;}),gate=new Promise<void>(resolve=>{release=resolve;});
 const holder=withManagedMaintenanceLock({prefix:f.prefix,confirmed:true},async()=>{entered();await gate;});await active;
 try{
  const expected:ManagedVersionSelectionReport={status:"ambiguous",prefix:f.prefix,managedRoot:f.managed,requestedVersion:V1,previousSelection:V2,publication:"not-started",cleanup:"not-needed",retainedPaths:[f.lock],error:"Timed out waiting for managed maintenance lock",activation:"not-active",runtimeReady:false};
  assert.deepEqual(invoke(f,["managed","select",V1,"--expected-current",V2]),{code:1,stdout:JSON.stringify(expected,null,2)+"\n",stderr:NOT_CONFIRMED});
  assert.equal(await fs.readFile(f.current,"utf8"),V2+"\n");await absent(f.executed);
 }finally{release();await holder;}
 assert.deepEqual(await inventory(f.root),before);await noTransient(f);
});

test("malformed select grammar is rejected before home lookup or any filesystem lookup",async t=>{
 const cases:readonly (readonly [string,readonly string[],string])[]=[
  ["missing target",["managed","select"],USAGE],["invalid target",["managed","select","01.2.0","--expected-current",V2],USAGE],
  ["missing expected flag",["managed","select",V1],USAGE],["missing expected value",["managed","select",V1,"--expected-current"],USAGE],
  ["invalid expected",["managed","select",V1,"--expected-current","1.02.0"],USAGE],["repeated expected",["managed","select",V1,"--expected-current",V2,"--expected-current",V2],USAGE],
  ["extra Pi argument",["managed","select",V1,"--expected-current",V2,"--version"],USAGE],["trailing separator",["managed","select",V1,"--expected-current",V2,"--"],USAGE],
  ["caller package root",["--package-root","foreign","managed","select",V1,"--expected-current",V2],USAGE],
  ["link and home",["--link","--home","foreign","managed","select",V1,"--expected-current",V2],"--link and --home are mutually exclusive\n"],
  ["isolated and home",["--isolated","--home","foreign","managed","select",V1,"--expected-current",V2],"--isolated and --home are mutually exclusive\n"],
 ];
 for(const [name,args,expectedStderr] of cases)await t.test(name,async()=>{
  let stdout="",stderr="",lookups=0;
  const code=await runAsen([...args],{}, {homeDirectory:()=>{lookups++;throw new Error("home lookup forbidden");},stdout:text=>{stdout+=text;},stderr:text=>{stderr+=text;}});
  assert.deepEqual({code,stdout,stderr,lookups},{code:2,stdout:"",stderr:expectedStderr,lookups:0});
 });
});

test("data-home environment and unreadable irrelevant config cannot redirect software selection",async t=>{
 const f=await fixture(t,V2),redirect=path.join(f.root,"redirected-data-home"),global=path.join(f.root,"global-config"),config=path.join(f.home,".asen","config.json");
 await fs.mkdir(redirect,{recursive:true});await fs.mkdir(global,{recursive:true});await fs.mkdir(config); // EISDIR if metadata-only selection wrongly reads launcher config.
 const beforeRedirect=await inventory(redirect),beforeGlobal=await inventory(global);
 assert.deepEqual(invoke(f,["managed","select",V1,"--expected-current",V2],{ASEN_HOME:redirect,PI_CODING_AGENT_DIR:redirect,ASEN_GLOBAL_CONFIG:global,ASEN_PI:path.join(f.root,"NEVER-PI")}),{code:0,stdout:JSON.stringify(report(f,"selected",V1,V2),null,2)+"\n",stderr:""});
 assert.equal(await fs.readFile(f.current,"utf8"),V1+"\n");assert.deepEqual(await inventory(redirect),beforeRedirect);assert.deepEqual(await inventory(global),beforeGlobal);await noTransient(f);
});

test("managed select tokens remain literal in protected Pi and existing maintenance contexts",async t=>{
 const f=await fixture(t,V2),packageRoot=path.join(f.root,"pi-package"),pi=path.join(packageRoot,"node_modules","@earendil-works","pi-coding-agent","dist"),record=path.join(f.root,"PI-ARGS");
 await fs.mkdir(pi,{recursive:true});await fs.writeFile(path.join(path.dirname(pi),"package.json"),JSON.stringify({type:"commonjs"}));
 await fs.writeFile(path.join(pi,"cli.js"),`require("node:fs").writeFileSync(${JSON.stringify(record)},JSON.stringify(process.argv.slice(2)));`);
 const contexts=[["install","managed","select",V1,"--expected-current",V2],["--","managed","select",V1,"--expected-current",V2]];
 for(const args of contexts){
  await absent(record);assert.deepEqual(invoke(f,["--package-root",packageRoot,...args]),{code:0,stdout:"",stderr:""});
  assert.deepEqual(JSON.parse(await fs.readFile(record,"utf8")),args[0]==="--"?args.slice(1):args);
  await fs.rm(record); // Remove only the fixture-owned observation before the next independent invocation.
 }
 assert.equal(await fs.readFile(f.current,"utf8"),V2+"\n");await noTransient(f);
});
