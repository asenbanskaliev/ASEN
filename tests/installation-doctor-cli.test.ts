import test from "node:test";
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import {tmpdir} from "node:os";
import {runAsen} from "../src/cli.js";
import {parseAsenArgs} from "../src/runtime/launcher.js";
import {stageAdditionalManagedVersion,stageManagedInstall} from "../src/runtime/managed-install.js";

// Children run from isolated cwds, so tsx must be resolved from this checkout, not from the child cwd.
const TSX_IMPORT=import.meta.resolve("tsx");
const VERSION="1.2.0";
const SCHEMA="asen.installation-doctor/v1";
const USAGE="Unsupported ASEN doctor command. Expected: [--link|--isolated|--home PATH] [--package-root PATH] doctor.\n";
const INCOMPLETE="Installation doctor could not complete all metadata observations.\n";
type Fixture=Awaited<ReturnType<typeof fixture>>;
type Json=Record<string,any>;

async function missing(file:string){await assert.rejects(()=>fs.lstat(file),{code:"ENOENT"});}
async function tree(root:string):Promise<unknown>{
 const rootEntry=await fs.lstat(root),rows:unknown[]=[];
 for(const name of (await fs.readdir(root)).sort()){
  const file=path.join(root,name),entry=await fs.lstat(file);
  rows.push([name,entry.isSymbolicLink()?"link":entry.isDirectory()?await tree(file):{bytes:(await fs.readFile(file)).toString("base64"),mtimeMs:entry.mtimeMs}]);
 }
 return{mtimeMs:rootEntry.mtimeMs,children:rows};
}
async function packageSource(root:string,version=VERSION,engine=">=0.0.0"){
 const packageRoot=path.join(root,"package source ü "+version);await fs.mkdir(path.join(packageRoot,"dist"),{recursive:true});
 await fs.writeFile(path.join(packageRoot,"package.json"),JSON.stringify({name:"asen",version,engines:{node:engine},bin:{asen:"dist/cli.cjs"}}));
 await fs.writeFile(path.join(packageRoot,"dist/cli.cjs"),`require("node:fs").writeFileSync(${JSON.stringify(path.join(root,"MANAGED-EXECUTED"))},"executed");throw new Error("doctor executed managed package");\n`);
 return packageRoot;
}
async function stage(f:Fixture,version=VERSION,engine=">=0.0.0",additional=false){
 const packageRoot=await packageSource(f.root,version,engine),request={prefix:f.prefix,packageRoot,version,confirmed:true as const,protectedPaths:[],files:[
  {sourcePath:"package.json",destinationPath:"package.json"},{sourcePath:"dist/cli.cjs",destinationPath:"dist/cli.cjs"},
 ]};
 if(additional)await stageAdditionalManagedVersion(request);else await stageManagedInstall(request);
}
async function fixture(t:test.TestContext,name="doctor ü"){
 const base=process.env.TEMP??process.env.TMP??tmpdir(),root=await fs.mkdtemp(path.join(base,"doc-"));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const home=path.join(root,"home "+name),prefix=path.join(home,".asen"),data=path.join(root,"data home"),effective=path.join(root,"effective package ü"),cwd=path.join(root,"caller cwd");
 for(const dir of [home,prefix,data,effective,cwd])await fs.mkdir(dir,{recursive:true});
 return{root,home,prefix,data,effective,cwd,managed:path.join(prefix,"install"),current:path.join(prefix,"install","current"),config:path.join(prefix,"config.json"),marker:path.join(prefix,"install",".asen-maintenance.lock"),sentinel:path.join(root,"PI-EXECUTED"),managedSentinel:path.join(root,"MANAGED-EXECUTED")};
}
function env(f:Fixture,extra:NodeJS.ProcessEnv={}):NodeJS.ProcessEnv{
 const systemRoot=process.env.SystemRoot??process.env.SYSTEMROOT;
 return{SystemRoot:systemRoot,WINDIR:systemRoot,OS:process.env.OS,PATH:path.dirname(process.execPath),PATHEXT:process.env.PATHEXT,
  HOME:f.home,USERPROFILE:f.home,TEMP:f.root,TMP:f.root,TMPDIR:f.root,APPDATA:path.join(f.root,"appdata"),LOCALAPPDATA:path.join(f.root,"local"),
  XDG_CONFIG_HOME:path.join(f.root,"xc"),XDG_CACHE_HOME:path.join(f.root,"xd"),XDG_DATA_HOME:path.join(f.root,"xx"),TSX_DISABLE_CACHE:"1",ASEN_NO_SKILL_REGISTRY:"1",...extra};
}
function invoke(f:Fixture,args:readonly string[],extra:NodeJS.ProcessEnv={},cwd=f.cwd){
 const result=spawnSync(process.execPath,["--import",TSX_IMPORT,path.resolve("src/cli.ts"),...args],{cwd,env:env(f,extra),shell:false,timeout:10000,maxBuffer:1024*1024,encoding:"utf8"});
 assert.equal(result.error,undefined);assert.equal(result.signal,null);return{code:result.status,stdout:result.stdout,stderr:result.stderr};
}
function jsonResult(result:ReturnType<typeof invoke>,code=0,stderr=""):Json{
 assert.equal(result.code,code);assert.equal(result.stderr,stderr);assert.match(result.stdout,/^\{/u);
 const value=JSON.parse(result.stdout) as Json;assert.equal(result.stdout,JSON.stringify(value,null,2)+"\n");assert.equal(value.schema,SCHEMA);return value;
}
async function readonlyDoctor(f:Fixture,args:readonly string[],extra:NodeJS.ProcessEnv={},code=0,stderr=""){
 const before=await tree(f.root);await missing(f.managedSentinel);
 const result=invoke(f,args,extra),report=jsonResult(result,code,stderr);
 assert.deepEqual(await tree(f.root),before,"doctor changed fixture bytes or mtimes");await missing(f.managedSentinel);
 return report;
}
function assertUnknownClaims(value:Json){assert.deepEqual({runtimeProbe:value.runtimeProbe,runtimeReady:value.runtimeReady,publisherAuthenticity:value.publisherAuthenticity,nativeAuthority:value.nativeAuthority,processHealth:value.processHealth},{runtimeProbe:"not-run",runtimeReady:false,publisherAuthenticity:"unknown",nativeAuthority:"unknown",processHealth:"unknown"});assert.equal(value.collection.confidence,"metadata-only");assert.equal(value.collection.atomic,false);assert.equal(Array.isArray(value.collection.issueCodes),true);}

// DoctorRed: admitted763 sends this public token to Pi. The required implementation must report metadata and never execute this inert candidate.
test("DoctorRed public doctor reports a malformed selector without executing Pi or changing owned state",async t=>{
 const f=await fixture(t);await stage(f);await fs.writeFile(f.current,"malformed-current\n");await fs.writeFile(f.config,JSON.stringify({home:f.data}));
 const pi=path.join(f.effective,"node_modules","@earendil-works","pi-coding-agent","dist");await fs.mkdir(pi,{recursive:true});
 await fs.writeFile(path.join(path.dirname(pi),"package.json"),JSON.stringify({type:"commonjs"}));
 await fs.writeFile(path.join(pi,"cli.js"),`require("node:fs").writeFileSync(${JSON.stringify(f.sentinel)},"executed");process.stdout.write("OLD_PI_DOCTOR_EXECUTED\\n");`);
 const report=await readonlyDoctor(f,["--package-root",f.effective,"doctor"]);
 assert.deepEqual(report.collection,{status:"complete",confidence:"metadata-only",atomic:false,issueCodes:[]});assert.deepEqual(report.packageRoots,{executing:path.resolve("."),effective:f.effective});assert.equal(report.managed.prefix,f.prefix);
 assert.deepEqual(report.managed.inspection,{status:"foreign",managedRoot:f.managed,activeVersion:null,runtimeReady:false,versions:[],reason:"ASEN managed-version selector failed validation"});
 assert.deepEqual(report.managed.selection,{status:"not-inspected",version:null});assert.deepEqual(report.managed.versions,[]);
 assert.deepEqual(report.config,{path:f.config,status:"valid",resolvedHome:{mode:"path",dir:f.data,source:"config"}});
 assert.deepEqual(report.pi,{kind:"bundled",confidence:"configured-only"});assertUnknownClaims(report);
 await missing(f.sentinel);
});

test("DoctorRed source checkout with no managed prefix is a complete observation, not broken health",async t=>{
 const f=await fixture(t),report=await readonlyDoctor(f,["--package-root",f.effective,"doctor"]);
 assert.equal(report.collection.status,"complete");assert.deepEqual(report.managed.inspection,{status:"absent",managedRoot:f.managed,activeVersion:null,runtimeReady:false,versions:[]});
 assert.deepEqual(report.managed.selection,{status:"not-inspected",version:null});assert.deepEqual(report.maintenance,{status:"missing",observedType:null,confidence:"presence-only"});assertUnknownClaims(report);
});

test("DoctorRed owned current-absent inventory verifies every finite version without claiming readiness",async t=>{
 const f=await fixture(t);await stage(f);await stage(f,"1.3.0",">=999.0.0",true);const report=await readonlyDoctor(f,["--package-root",f.effective,"doctor"]);
 assert.equal(report.collection.status,"complete");assert.equal(report.managed.inspection.status,"owned");assert.deepEqual(report.managed.selection,{status:"current-absent",version:null});
 assert.equal(report.managed.versions.length,2);assert.deepEqual(report.managed.versions.map((row:Json)=>[row.version,row.verification.packageMetadata,row.verification.nodeCompatibility,row.verification.runtimeProbe,row.verification.runtimeReady]),[
  [VERSION,"verified","compatible","not-run",false],["1.3.0","verified","incompatible","not-run",false],
 ]);assertUnknownClaims(report);
});

test("DoctorRed supported, incompatible, and unverified Node metadata remain bounded verification findings",async t=>{
 for(const [name,engine,nodeCompatibility,reason] of [["compatible",">=0.0.0","compatible",null],["incompatible",">=999.0.0","incompatible","Current Node version does not satisfy managed package engine"],["unverified","^22.19.0","unverified","Managed Node engine range is unsupported"]] as const)await t.test(name,async t=>{
  const f=await fixture(t,name);await stage(f,VERSION,engine);await fs.writeFile(f.current,VERSION+"\n");const report=await readonlyDoctor(f,["--package-root",f.effective,"doctor"]),verification=report.managed.versions[0].verification;
  assert.deepEqual(report.managed.selection,{status:"current",version:VERSION});assert.equal(verification.nodeCompatibility,nodeCompatibility);assert.equal(verification.reason,reason);assert.equal(report.collection.status,"complete");assertUnknownClaims(report);
 });
});

test("DoctorRed corrupt finite catalog remains a foreign finding rather than inferred health",async t=>{
 const f=await fixture(t);await stage(f);await stage(f,"1.3.0",">=0.0.0",true);await fs.writeFile(path.join(f.managed,"managed-versions.json"),"CORRUPT-CATALOG");const report=await readonlyDoctor(f,["--package-root",f.effective,"doctor"]);
 assert.equal(report.collection.status,"complete");assert.deepEqual(report.managed.inspection,{status:"foreign",managedRoot:f.managed,activeVersion:null,runtimeReady:false,versions:[],reason:"ASEN managed-version catalog failed validation"});assert.deepEqual(report.managed.selection,{status:"not-inspected",version:null});
});

test("DoctorRed config absent, valid, invalid, and unreadable are distinguished without leaking contents",async t=>{
 for(const item of [
  {name:"absent",prepare:async(_f:Fixture)=>{},status:"absent",code:0,home:"default"},
  {name:"valid",prepare:async(f:Fixture)=>fs.writeFile(f.config,JSON.stringify({home:f.data})),status:"valid",code:0,home:"config"},
  {name:"invalid",prepare:async(f:Fixture)=>fs.writeFile(f.config,'{"home":"RAW-CONFIG-SECRET","extra":true}'),status:"invalid",code:0,home:"default"},
  {name:"unreadable",prepare:async(f:Fixture)=>fs.mkdir(f.config,{recursive:true}),status:"unreadable",code:1,home:null},
 ] as const)await t.test(item.name,async t=>{
  const f=await fixture(t,item.name);await item.prepare(f);const report=await readonlyDoctor(f,["--package-root",f.effective,"doctor"],{},item.code,item.code?INCOMPLETE:"");
  assert.equal(report.config.status,item.status);assert.equal(report.config.resolvedHome?.source??null,item.home);assert.equal(report.collection.status,item.code?"incomplete":"complete");assert.deepEqual(report.collection.issueCodes,item.code?["CONFIG_UNREADABLE"]:[]);assert.doesNotMatch(JSON.stringify(report),/RAW-CONFIG-SECRET/);
 });
});

test("DoctorRed marker missing, present, and untrusted managed root expose presence only",async t=>{
 const missingFixture=await fixture(t,"missing");await stage(missingFixture);let report=await readonlyDoctor(missingFixture,["--package-root",missingFixture.effective,"doctor"]);assert.deepEqual(report.maintenance,{status:"missing",observedType:null,confidence:"presence-only"});
 const present=await fixture(t,"present");await stage(present);await fs.writeFile(present.marker,"SECRET-PID-TOKEN");report=await readonlyDoctor(present,["--package-root",present.effective,"doctor"]);assert.deepEqual(report.maintenance,{status:"present",observedType:"file",confidence:"presence-only"});assert.doesNotMatch(JSON.stringify(report),/SECRET-PID-TOKEN/);
 const foreign=await fixture(t,"foreign");await fs.mkdir(foreign.prefix,{recursive:true});await fs.writeFile(foreign.managed,"foreign root");report=await readonlyDoctor(foreign,["--package-root",foreign.effective,"doctor"]);assert.deepEqual(report.maintenance,{status:"unknown",observedType:null,confidence:"presence-only"});
});

test("DoctorRed home, package-root, spaces Unicode, and caller cwd stay separate",async t=>{
 const f=await fixture(t);const selectedHome=path.join(f.root,"selected data ü");await fs.mkdir(selectedHome);const report=await readonlyDoctor(f,["--home",selectedHome,"--package-root",f.effective,"doctor"]);
 assert.deepEqual(report.packageRoots,{executing:path.resolve("."),effective:f.effective});assert.equal(report.managed.prefix,f.prefix);assert.deepEqual(report.config.resolvedHome,{mode:"path",dir:selectedHome,source:"flag"});
});

test("DoctorRed opaque Pi configuration is classified but never echoed, scanned, or executed",async t=>{
 for(const item of [{name:"env",extra:{ASEN_PI:"RAW-PI-SECRET"},kind:"env"},{name:"configured path",extra:{ASEN_PI_ON_PATH:"RAW-PATH-SECRET"},kind:"configured-path"},{name:"unavailable",extra:{},kind:"unavailable"}] as const)await t.test(item.name,async t=>{
  const f=await fixture(t,item.name),report=await readonlyDoctor(f,["--package-root",f.effective,"doctor"],item.extra);
  assert.deepEqual(report.pi,{kind:item.kind,confidence:"configured-only"});assert.doesNotMatch(JSON.stringify(report),/RAW-PI-SECRET|RAW-PATH-SECRET/);
 });
});

test("DoctorRed composer rejects a managed state change between observations without extra effects",async t=>{
 const f=await fixture(t,"state change");await stage(f);const before=await tree(f.root);let stimulated:unknown;
 const moduleName="../src/runtime/installation-doctor.js",api=await import(moduleName) as {composeInstallationDoctor:(request:Json)=>Promise<Json>};
 const report=await api.composeInstallationDoctor({executingPackageRoot:path.resolve("."),effectivePackageRoot:f.effective,homeDirectory:f.home,args:parseAsenArgs(["--package-root",f.effective]),env:env(f),hooks:{beforeFinalInspection:async()=>{
  assert.deepEqual(await tree(f.root),before,"composer changed state before the explicit stimulus");await fs.writeFile(f.current,VERSION+"\n");stimulated=await tree(f.root);
 }}});
 assert.deepEqual(report.collection,{status:"incomplete",confidence:"metadata-only",atomic:false,issueCodes:["MANAGED_STATE_CHANGED"]});assertUnknownClaims(report);
 assert.deepEqual(await tree(f.root),stimulated,"composer changed state after the explicit stimulus");await missing(f.managedSentinel);
});

test("DoctorRed invalid doctor grammar exits 2 before home, config, package, or Pi lookup",async t=>{
 const cases=[
  ["two extras",["doctor","extra","two"],USAGE],["separator",["doctor","--"],USAGE],["duplicate",["doctor","doctor"],USAGE],
  ["mutually exclusive selectors",["--link","--isolated","doctor"],"--link and --isolated are mutually exclusive\n"],
 ] as const;
 for(const [name,args,expectedStderr] of cases)await t.test(name,async()=>{
  let stdout="",stderr="",lookups=0;const code=await runAsen([...args],{ASEN_PI:path.join(path.resolve("."),"OWN-MISSING-PI")},{homeDirectory:()=>{lookups++;return path.resolve(".doctor-never-home");},stdout:text=>{stdout+=text;},stderr:text=>{stderr+=text;}});
  assert.deepEqual({code,stdout,stderr,lookups},{code:2,stdout:"",stderr:expectedStderr,lookups:0});
 });
});

test("DoctorRed normal version/help and literal Pi contexts preserve their public namespace",async t=>{
 const f=await fixture(t),pi=path.join(f.effective,"node_modules","@earendil-works","pi-coding-agent","dist"),record=path.join(f.root,"ARGS");await fs.mkdir(pi,{recursive:true});await fs.writeFile(path.join(path.dirname(pi),"package.json"),JSON.stringify({type:"commonjs"}));await fs.writeFile(path.join(pi,"cli.js"),`require("node:fs").writeFileSync(${JSON.stringify(record)},JSON.stringify(process.argv.slice(2)));`);
 assert.deepEqual(invoke(f,["--version"]),{code:0,stdout:"0.1.0\n",stderr:""});const help=invoke(f,["--help"]);assert.equal(help.code,0);assert.match(help.stdout,/ doctor\n/u);
 for(const args of [["install","doctor"],["--","doctor"]]){await missing(record);assert.deepEqual(invoke(f,["--package-root",f.effective,...args]),{code:0,stdout:"",stderr:""});assert.deepEqual(JSON.parse(await fs.readFile(record,"utf8")),args[0]==="--"?args.slice(1):args);await fs.rm(record);}
});
