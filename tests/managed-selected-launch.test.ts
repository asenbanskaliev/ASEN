import test from "node:test";
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import {tmpdir} from "node:os";
import {stageManagedInstall,selectManagedVersion} from "../src/runtime/managed-install.js";
import {probeManagedCliVersion} from "../src/runtime/managed-cli-version-probe.js";

const VERSION="1.2.3";
type Fixture=Awaited<ReturnType<typeof fixture>>;
type Launch=(request:Record<string,unknown>)=>Promise<Record<string,unknown>>;

async function absent(file:string){await assert.rejects(()=>fs.lstat(file),{code:"ENOENT"});}
async function tree(root:string):Promise<unknown[]> {
 const rows:unknown[]=[];
 for(const name of (await fs.readdir(root)).sort()){
  if(name===".asen-maintenance.lock")continue;
  const file=path.join(root,name),entry=await fs.lstat(file);
  rows.push([name,entry.isDirectory()?await tree(file):(await fs.readFile(file)).toString("base64"),entry.mtimeMs]);
 }
 return rows;
}
async function fixture(t:test.TestContext,selected=true){
 const fixtureBase=process.env.TEMP??process.env.TMP??tmpdir();
 const root=await fs.mkdtemp(path.join(fixtureBase,"msl-"));
 t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const launcherHome=path.join(root,"home ü"),prefix=path.join(launcherHome,".asen"),source=path.join(root,"source");
 const dataHome=path.join(root,"agent data ü"),record=path.join(root,"selected.json"),personal=path.join(prefix,"personal.json");
 const managed=path.join(prefix,"install"),lock=path.join(managed,".asen-maintenance.lock");
 await fs.mkdir(source,{recursive:true});await fs.mkdir(prefix,{recursive:true});await fs.writeFile(personal,"PERSONAL");
 const program=`const fs=require("node:fs");const argv=process.argv.slice(2);const record=${JSON.stringify(record)};const lock=${JSON.stringify(lock)};let rows=[];try{rows=JSON.parse(fs.readFileSync(record,"utf8"))}catch{}rows.push({args:argv,cwd:process.cwd(),home:process.env.PI_CODING_AGENT_DIR,root:process.env.ASEN_PACKAGE_ROOT});fs.writeFileSync(record,JSON.stringify(rows));if(argv.length===1&&argv[0]==="--version")process.stdout.write(${JSON.stringify(VERSION+"\n")});if(argv.includes("fixture:release-lock"))fs.writeFileSync(lock,"FOREIGN");`;
 await fs.writeFile(path.join(source,"package.json"),JSON.stringify({name:"asen",version:VERSION,engines:{node:">=0.0.0"},bin:{asen:"cli.cjs"}}));
 await fs.writeFile(path.join(source,"cli.cjs"),program);
 await stageManagedInstall({prefix,packageRoot:source,version:VERSION,confirmed:true,protectedPaths:[],files:[{sourcePath:"package.json",destinationPath:"package.json"},{sourcePath:"cli.cjs",destinationPath:"cli.cjs"}]});
 if(selected)await selectManagedVersion({prefix,version:VERSION,expectedCurrentVersion:null,confirmed:true});
 const versionRoot=path.join(managed,"versions",VERSION);
 return{root,launcherHome,prefix,dataHome,record,personal,managed,lock,versionRoot,current:path.join(managed,"current"),bin:path.join(versionRoot,"cli.cjs"),packageFile:path.join(versionRoot,"package.json"),receipt:path.join(managed,"managed-install.json")};
}
function cleanEnv(f:Fixture):NodeJS.ProcessEnv{
 return{SystemRoot:process.env.SystemRoot??process.env.SYSTEMROOT,WINDIR:process.env.SystemRoot??process.env.SYSTEMROOT,OS:process.env.OS,PATH:path.dirname(process.execPath),PATHEXT:process.env.PATHEXT,
  HOME:f.launcherHome,USERPROFILE:f.launcherHome,TEMP:f.root,TMP:f.root,TMPDIR:f.root,APPDATA:path.join(f.root,"ar"),LOCALAPPDATA:path.join(f.root,"al"),
  XDG_CONFIG_HOME:path.join(f.root,"xc"),XDG_CACHE_HOME:path.join(f.root,"xd"),XDG_DATA_HOME:path.join(f.root,"xx"),ASEN_PI:path.join(f.root,"fallback-must-not-launch"),TSX_DISABLE_CACHE:"1"};
}
function invoke(f:Fixture,args:readonly string[]){
 const cli=path.resolve("src/cli.ts");
 const result=spawnSync(process.execPath,["--import","tsx",cli,...args],{cwd:process.cwd(),env:cleanEnv(f),shell:false,timeout:10000,maxBuffer:1024*1024,encoding:"utf8"});
 assert.equal(result.signal,null);assert.equal(result.error,undefined);
 return{code:result.status,stdout:result.stdout,stderr:result.stderr};
}
async function records(f:Fixture){return JSON.parse(await fs.readFile(f.record,"utf8")) as Array<Record<string,unknown>>;}
async function backend():Promise<Launch>{
 const moduleName="../src/runtime/managed-selected-launch.js",api=await import(moduleName).catch(()=>({} as Record<string,unknown>));
 assert.equal(typeof api.launchManagedSelectedVersion,"function","managed selected-launch backend API missing");
 return api.launchManagedSelectedVersion as Launch;
}
function request(f:Fixture,extra:Record<string,unknown>={}):Record<string,unknown>{
 return{prefix:f.prefix,version:VERSION,home:f.dataHome,args:["--version"],confirmed:true,cwd:process.cwd(),env:cleanEnv(f),...extra};
}
function refused(report:Record<string,unknown>,reason="candidate-drift"){
 assert.equal(Object.isFrozen(report),true);
 assert.deepEqual({status:report.status,reason:report.reason,launchAttempts:report.launchAttempts,termination:report.termination},{status:"refused",reason,launchAttempts:0,termination:"not-started"});
}

// Behavioral RED: admitted760 currently falls through to ASEN_PI instead of consuming this namespace.
test("public managed run launches the exact selected owned CLI once with protected argv and empty child streams",async t=>{
 const f=await fixture(t),before=await tree(f.managed);
 const piArgs=["managed","setup","home","--help","--package-root","foreign","--home","foreign","install","npm:x"];
 assert.deepEqual(invoke(f,["--home",f.dataHome,"managed","run",VERSION,"--",...piArgs]),{code:0,stdout:"",stderr:""});
 assert.deepEqual(await records(f),[{args:["--home",f.dataHome,"--package-root",f.versionRoot,"--",...piArgs],cwd:process.cwd(),home:f.dataHome,root:f.versionRoot}]);
 assert.deepEqual(await tree(f.managed),before);assert.equal(await fs.readFile(f.personal,"utf8"),"PERSONAL");await absent(f.lock);
});

test("managed grammar and caller package-root refuse exactly with zero selected or fallback process",async t=>{
 const cases:[string,readonly string[]][]=[
  ["missing version",["managed","run"]],
  ["missing separator",["managed","run",VERSION]],
  ["malformed version",["managed","run","01.2.3","--"]],
  ["unknown action",["managed","inspect",VERSION,"--"]],
  ["caller package root",["--package-root",path.join(process.env.TEMP??process.env.TMP??tmpdir(),"foreign"),"managed","run",VERSION,"--"]],
 ];
 for(const [name,args] of cases)await t.test(name,async t=>{
  const f=await fixture(t),before=await tree(f.managed);
  assert.deepEqual(invoke(f,args),{code:2,stdout:"",stderr:"Unsupported ASEN managed command. Expected: managed run <exact-version> -- <Pi arguments>.\n"});
  await absent(f.record);assert.deepEqual(await tree(f.managed),before);await absent(f.lock);
 });
});

test("persistent selection source and inventory refusals launch zero and preserve the deliberate stimulus",async t=>{
 for(const mode of ["mismatch","selector-no-lf","bin","receipt"] as const)await t.test(mode,async t=>{
  const f=await fixture(t);
  if(mode==="mismatch")await fs.writeFile(f.current,"0.0.1\n");
  else if(mode==="selector-no-lf")await fs.writeFile(f.current,VERSION);
  else if(mode==="bin")await fs.writeFile(f.bin,"CHANGED");
  else await fs.writeFile(f.receipt,"{}");
  const before=await tree(f.managed);
  assert.deepEqual(invoke(f,["managed","run",VERSION,"--","--version"]),{code:1,stdout:"",stderr:"Managed selected launch refused: candidate-drift.\n"});
  await absent(f.record);assert.deepEqual(await tree(f.managed),before);await absent(f.lock);
 });
});

test("a successful prior probe is one inert trace, not selection or launch permission",async t=>{
 const f=await fixture(t,false),probe=await probeManagedCliVersion({prefix:f.prefix,version:VERSION,confirmed:true});
 assert.equal(probe.cliVersion,"observed");assert.equal(probe.stdout,VERSION+"\n");assert.equal(probe.stderr,"");assert.equal(probe.launchAttempts,1);assert.equal((await records(f)).length,1);
 const before=await tree(f.managed);
 assert.deepEqual(invoke(f,["managed","run",VERSION,"--","--version"]),{code:1,stdout:"",stderr:"Managed selected launch refused: candidate-drift.\n"});
 assert.equal((await records(f)).length,1);assert.deepEqual(await tree(f.managed),before);await absent(f.lock);
});

test("backend false confirmation refuses before hook lease or launch",async t=>{
 const f=await fixture(t),launch=await backend();let hooks=0;
 const before=await tree(f.managed),report=await launch(request(f,{confirmed:false,hooks:{beforeLaunch:async()=>{hooks++;}}}));
 refused(report,"confirmation-required");assert.equal(hooks,0);await absent(f.record);assert.deepEqual(await tree(f.managed),before);await absent(f.lock);
});

test("pre-spawn binding detects root version bin source inventory and physical-current races",async t=>{
 for(const mode of ["root","version","bin","source","inventory","current"] as const)await t.test(mode,async t=>{
  const f=await fixture(t),launch=await backend();let displaced="",stimulus:unknown[]=[];
  const report=await launch(request(f,{hooks:{beforeLaunch:async()=>{
   if(mode==="root"){displaced=path.join(f.root,"old-install");await fs.rename(f.managed,displaced);await fs.cp(displaced,f.managed,{recursive:true});}
   else if(mode==="version"){displaced=path.join(f.root,"old-version");await fs.rename(f.versionRoot,displaced);await fs.cp(displaced,f.versionRoot,{recursive:true});}
   else if(mode==="bin")await fs.writeFile(f.bin,"CHANGED-BIN");
   else if(mode==="source")await fs.writeFile(f.packageFile,"CHANGED-SOURCE");
   else if(mode==="inventory")await fs.writeFile(f.receipt,"{}");
   else{const replacement=path.join(f.root,"replacement-current");await fs.writeFile(replacement,VERSION+"\n");await fs.rename(replacement,f.current);}
   stimulus=await tree(f.managed);
  }}}));
  refused(report,mode==="root"?"maintenance-unavailable":"candidate-drift");await absent(f.record);
  assert.deepEqual(await tree(f.managed),stimulus,"launch refusal changed public managed files beyond the deliberate stimulus");
  if(mode==="current")assert.equal(await fs.readFile(f.current,"utf8"),VERSION+"\n");
  if(displaced)assert.equal((await fs.lstat(displaced)).isDirectory(),true);
 });
});

test("one public child close followed by uncertain lease release is exact ambiguous evidence and never retries",async t=>{
 const f=await fixture(t);
 assert.deepEqual(invoke(f,["managed","run",VERSION,"--","fixture:release-lock"]),{code:1,stdout:"",stderr:"Managed selected launch is ambiguous after one attempted launch; it was not retried.\n"});
 assert.equal((await records(f)).length,1);assert.equal(await fs.readFile(f.lock,"utf8"),"FOREIGN");
});

test("selected launch retains a moved outer payload and its empty replacement as cleanup-uncertain",async t=>{
 const fixtureBase=process.env.TEMP??process.env.TMP??tmpdir(),root=await fs.mkdtemp(path.join(fixtureBase,"msl-cleanup-"));
 t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const launcherHome=path.join(root,"home"),prefix=path.join(launcherHome,".asen"),source=path.join(root,"source"),managed=path.join(prefix,"install");
 const dataHome=path.join(root,"agent"),trace=path.join(root,"trace.json"),personal=path.join(prefix,"personal.json"),lock=path.join(managed,".asen-maintenance.lock");
 await fs.mkdir(source,{recursive:true});await fs.mkdir(prefix,{recursive:true});await fs.writeFile(personal,"PERSONAL");
 const version="4.5.6";
 const program=`const fs=require("node:fs"),path=require("node:path");const managed=path.dirname(path.dirname(process.env.ASEN_PACKAGE_ROOT));const trace=${JSON.stringify(trace)};let previous={count:0};try{previous=JSON.parse(fs.readFileSync(trace,"utf8"))}catch{}const name=fs.readdirSync(managed).find(value=>value.startsWith(".selected-launch-")&&!value.includes(".moved-"));if(!name)throw new Error("payload-not-found");const outer=path.join(managed,name),moved=outer+".moved-"+(previous.count+1);fs.renameSync(outer,moved);fs.mkdirSync(outer);fs.writeFileSync(trace,JSON.stringify({count:previous.count+1,outer,moved,replacementCreated:fs.existsSync(outer)}));`;
 await fs.writeFile(path.join(source,"package.json"),JSON.stringify({name:"asen",version,engines:{node:">=0.0.0"},bin:{asen:"cli.cjs"}}));
 await fs.writeFile(path.join(source,"cli.cjs"),program);
 await stageManagedInstall({prefix,packageRoot:source,version,confirmed:true,protectedPaths:[],files:[{sourcePath:"package.json",destinationPath:"package.json"},{sourcePath:"cli.cjs",destinationPath:"cli.cjs"}]});
 await selectManagedVersion({prefix,version,expectedCurrentVersion:null,confirmed:true});
 const current=path.join(managed,"current"),receipt=path.join(managed,"managed-install.json"),versionRoot=path.join(managed,"versions",version);
 const preserved=await Promise.all([personal,current,receipt,path.join(versionRoot,"package.json"),path.join(versionRoot,"cli.cjs")].map(async file=>({file,bytes:await fs.readFile(file),mtimeMs:(await fs.stat(file)).mtimeMs})));
 const moduleName="../src/runtime/managed-selected-launch.js",api=await import(moduleName),launch=api.launchManagedSelectedVersion;
 const report=await launch({prefix,version,home:dataHome,args:[],confirmed:true,cwd:process.cwd(),env:cleanEnv({root,launcherHome} as Fixture)});
 const effect=JSON.parse(await fs.readFile(trace,"utf8")) as {count:number;outer:string;moved:string;replacementCreated:boolean};
 const exists=async(file:string)=>fs.lstat(file).then(()=>true,error=>{if((error as NodeJS.ErrnoException).code==="ENOENT")return false;throw error;});
 const filesPreserved=(await Promise.all(preserved.map(async before=>({bytes:(await fs.readFile(before.file)).equals(before.bytes),mtimeMs:(await fs.stat(before.file)).mtimeMs===before.mtimeMs})))).every(value=>value.bytes&&value.mtimeMs);
 assert.deepEqual({frozen:Object.isFrozen(report),status:report.status,reason:report.reason,attempts:report.launchAttempts,termination:report.termination,exitCode:report.exitCode,signal:report.signal,
  traceCount:effect.count,replacementCreated:effect.replacementCreated,replacementExists:await exists(effect.outer),movedExists:await exists(effect.moved),filesPreserved,personal:await fs.readFile(personal,"utf8"),leaseExists:await exists(lock)},
 {frozen:true,status:"ambiguous",reason:"cleanup-uncertain",attempts:1,termination:"closed",exitCode:0,signal:null,
  traceCount:1,replacementCreated:true,replacementExists:true,movedExists:true,filesPreserved:true,personal:"PERSONAL",leaseExists:false});
});
