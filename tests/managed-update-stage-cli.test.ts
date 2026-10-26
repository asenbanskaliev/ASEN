import test from "node:test";
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {createHash} from "node:crypto";
import fs from "node:fs/promises";
import {syncBuiltinESMExports} from "node:module";
import path from "node:path";
import {runAsen} from "../src/cli.js";
import {parseManagedUpdatePreviewArgs,parseManagedUpdateStageArgs} from "../src/runtime/launcher.js";
import {inspectManagedInstall,selectManagedVersion,stageManagedInstall} from "../src/runtime/managed-install.js";

const USAGE="Unsupported ASEN managed update staging command. Expected: managed update --manifest <absolute-json> --package-root <absolute-dir> --stage --yes.\n";
const NOT_CONFIRMED="Managed update staging is not confirmed; inspect the reported state before retrying.\n";
const sha=(bytes:string)=>createHash("sha256").update(bytes).digest("hex");
type Fixture=Awaited<ReturnType<typeof fixture>>;

async function fixture(owned=true){
 const cache=path.join(process.cwd(),".cache");await fs.mkdir(cache,{recursive:true});
 const root=await fs.mkdtemp(path.join(cache,"u9d-"));
 const home=path.join(root,"home ü space"),prefix=path.join(home,".asen"),packageRoot=path.join(root,"package ü space"),manifestPath=path.join(root,"manifest ü.json");
 await fs.mkdir(home,{recursive:true});await fs.mkdir(packageRoot);
 const executed=path.join(root,"EXECUTED"),bytes=`require('node:fs').writeFileSync(${JSON.stringify(executed)},'unexpected execution');\n`;
 await fs.writeFile(path.join(packageRoot,"cli.cjs"),bytes);
 const manifest={schema:"asen.managed-acquisition/v1",version:"2.0.0",files:[{sourcePath:"cli.cjs",destinationPath:"dist/cli.cjs",size:Buffer.byteLength(bytes),sha256:sha(bytes)}]};
 await fs.writeFile(manifestPath,JSON.stringify(manifest));
 if(owned){
  const initial=path.join(root,"initial");await fs.mkdir(initial);await fs.writeFile(path.join(initial,"cli.cjs"),"old version");
  await stageManagedInstall({prefix,packageRoot:initial,version:"1.0.0",confirmed:true,protectedPaths:[],files:[{sourcePath:"cli.cjs",destinationPath:"cli.cjs"}]});
  await selectManagedVersion({prefix,version:"1.0.0",expectedCurrentVersion:null,confirmed:true});
 }
 for(const data of [path.join(prefix,"agent"),path.join(home,".pi","agent"),path.join(root,"custom data")]){
  await fs.mkdir(data,{recursive:true});await fs.writeFile(path.join(data,"personal.json"),'PRESERVE');
 }
 await fs.writeFile(path.join(prefix,"config.json"),JSON.stringify({home:path.join(root,"custom data")}));
 return{root,home,prefix,packageRoot,manifestPath,manifest,bytes,executed,managed:path.join(prefix,"install"),target:path.join(prefix,"install","versions","2.0.0")};
}
function args(f:Fixture,selectors:readonly string[]=[]){return[...selectors,"managed","update","--manifest",f.manifestPath,"--package-root",f.packageRoot,"--stage","--yes"];}
function env(f:Fixture):NodeJS.ProcessEnv{
 const systemRoot=process.env.SystemRoot??process.env.SYSTEMROOT;
 return{SystemRoot:systemRoot,WINDIR:systemRoot,OS:process.env.OS,PATH:path.dirname(process.execPath),PATHEXT:process.env.PATHEXT,HOME:f.home,USERPROFILE:f.home,TEMP:f.root,TMP:f.root,TMPDIR:f.root,APPDATA:path.join(f.root,"appdata"),LOCALAPPDATA:path.join(f.root,"local"),XDG_CONFIG_HOME:path.join(f.root,"config"),XDG_CACHE_HOME:path.join(f.root,"cache"),XDG_DATA_HOME:path.join(f.root,"data"),TSX_DISABLE_CACHE:"1",ASEN_NO_SKILL_REGISTRY:"1",ASEN_HOME:path.join(f.root,"environment data"),PI_CODING_AGENT_DIR:path.join(f.root,"linked data")};
}
async function invoke(f:Fixture,argv=args(f),environment=env(f)){
 let stdout="",stderr="",homeLookups=0;
 const code=await runAsen(argv,environment,{homeDirectory:()=>{homeLookups++;return f.home;},stdout:text=>{stdout+=text;},stderr:text=>{stderr+=text;}});
 return{code,stdout,stderr,homeLookups};
}
async function absent(file:string){await assert.rejects(()=>fs.lstat(file),{code:"ENOENT"});}
async function tree(root:string):Promise<unknown>{
 const metadata=await fs.lstat(root,{bigint:true});
 if(metadata.isSymbolicLink())return{link:await fs.readlink(root)};
 if(metadata.isDirectory()){
  const names=(await fs.readdir(root)).sort(),children:unknown[]=[];
  for(const name of names)children.push([name,await tree(path.join(root,name))]);
  return{children};
 }
 return{bytes:(await fs.readFile(root)).toString("base64"),mtimeNs:metadata.mtimeNs.toString()};
}
async function preserved(f:Fixture){return Promise.all([tree(f.packageRoot),tree(f.manifestPath),tree(path.join(f.prefix,"agent")),tree(path.join(f.home,".pi")),tree(path.join(f.root,"custom data")),tree(path.join(f.prefix,"config.json")),tree(path.join(f.managed,"versions","1.0.0"))]);}
function expected(f:Fixture,status:"staged"|"unchanged"){
 return{schema:"asen.managed-acquisition-update/v1",operation:"managed-acquisition-update",status,prefix:f.prefix,version:"2.0.0",files:[{path:"dist/cli.cjs",size:Buffer.byteLength(f.bytes),sha256:sha(f.bytes)}],selection:"not-run",activation:"not-run",producerAuthenticity:"not-established",runtimeReady:false};
}

test("stage parser preserves preview API and leaves Pi commands and end-of-options tokens literal",async()=>{
 const f=await fixture(),argv=args(f);
 assert.deepEqual(parseManagedUpdateStageArgs(argv),{kind:"stage",selectorArgs:[],manifestPath:f.manifestPath,packageRoot:f.packageRoot});
 assert.deepEqual(parseManagedUpdatePreviewArgs(argv),{kind:"invalid"});
 assert.deepEqual(parseManagedUpdateStageArgs([...argv.slice(0,-2),"--dry-run"]),{kind:"none"});
 for(const prefix of [["update"],["--"],["install"],["--package-root",f.packageRoot,"--"]])assert.deepEqual(parseManagedUpdateStageArgs([...prefix,...argv]),{kind:"none"});
});

test("confirmed public staging adds verified bytes but preserves selected version, source and personal data",async()=>{
 const f=await fixture(),before=await preserved(f),result=await invoke(f);
 assert.equal(result.code,0,JSON.stringify(result));assert.equal(result.stderr,"");assert.equal(result.homeLookups,1);
 assert.equal(result.stdout,JSON.stringify(expected(f,"staged"),null,2)+"\n");
 assert.equal(await fs.readFile(path.join(f.target,"dist","cli.cjs"),"utf8"),f.bytes);
 assert.deepEqual(await preserved(f),before);
 const inventory=await inspectManagedInstall({prefix:f.prefix});assert.equal(inventory.status,"owned");assert.equal(inventory.activeVersion,"1.0.0");assert.deepEqual(inventory.versions.map(v=>v.version),["1.0.0","2.0.0"]);
 await absent(f.executed);await absent(path.join(f.managed,".asen-maintenance.lock"));
 const staged=await tree(f.root),again=await invoke(f);
 assert.deepEqual(again,{code:0,stdout:JSON.stringify(expected(f,"unchanged"),null,2)+"\n",stderr:"",homeLookups:1});
 assert.deepEqual(await tree(f.root),staged);
});

test("isolated real CLI stages spaces/Unicode paths without executing package code or moving the software prefix",async()=>{
 const f=await fixture(),before=await preserved(f);
 const result=spawnSync(process.execPath,["--import","tsx",path.resolve("src/cli.ts"),...args(f,["--home",path.join(f.root,"explicit data")])],{cwd:process.cwd(),env:env(f),shell:false,timeout:30000,maxBuffer:4*1024*1024,encoding:"utf8"});
 assert.equal(result.error,undefined);assert.equal(result.signal,null);assert.equal(result.status,0,JSON.stringify({stdout:result.stdout,stderr:result.stderr}));assert.equal(result.stderr,"");assert.equal(result.stdout,JSON.stringify(expected(f,"staged"),null,2)+"\n");
 assert.deepEqual(await preserved(f),before);await absent(f.executed);await absent(path.join(f.root,"explicit data"));
});

test("stage grammar requires exact paths, fixed order and explicit yes before home lookup or filesystem I/O",async t=>{
 const f=await fixture(),argv=args(f),cases=[
  ["missing confirmation",argv.slice(0,-1)],
  ["wrong confirmation",[...argv.slice(0,-1),"--dry-run"]],
  ["extra",[...argv,"extra"]],
  ["repeat",[...argv,"--yes"]],
  ["global package root",["--package-root",f.packageRoot,...argv]],
  ["relative manifest",["managed","update","--manifest","relative.json","--package-root",f.packageRoot,"--stage","--yes"]],
  ["relative package",["managed","update","--manifest",f.manifestPath,"--package-root","relative","--stage","--yes"]],
  ["control",["managed","update","--manifest",`${f.manifestPath}\nINJECTED`,"--package-root",f.packageRoot,"--stage","--yes"]],
  ["wrong flags",["managed","update","--package-root",f.packageRoot,"--manifest",f.manifestPath,"--stage","--yes"]],
 ] as const;
 const before=await tree(f.root);
 for(const [name,invalid] of cases)await t.test(name,async()=>{
  let stdout="",stderr="",lookups=0;
  const code=await runAsen([...invalid],{}, {homeDirectory:()=>{lookups++;throw new Error("home forbidden");},stdout:text=>{stdout+=text;},stderr:text=>{stderr+=text;}});
  assert.deepEqual({code,stdout,stderr,lookups},{code:2,stdout:"",stderr:USAGE,lookups:0});
 });
 assert.deepEqual(await tree(f.root),before);
 const conflict=await invoke(f,args(f,["--link","--isolated"]));assert.equal(conflict.code,2);assert.equal(conflict.homeLookups,0);assert.equal(conflict.stderr,"--link and --isolated are mutually exclusive\n");
});

test("stage protects the effective home from flag, configuration, isolated and linked environment precedence",async t=>{
 for(const mode of ["flag","config","isolated","linked","default-asen","default-pi"] as const)await t.test(mode,async()=>{
  const f=await fixture();let selectors:string[]=[];const environment=env(f);
  if(mode==="flag")selectors=["--home",f.packageRoot];
  if(mode==="config")await fs.writeFile(path.join(f.prefix,"config.json"),JSON.stringify({home:f.packageRoot}));
  if(mode==="isolated"){selectors=["--isolated"];environment.ASEN_HOME=f.packageRoot;}
  if(mode==="linked"){selectors=["--link"];environment.PI_CODING_AGENT_DIR=f.packageRoot;}
  if(mode==="default-asen"||mode==="default-pi"){
   const source=path.join(mode==="default-asen"?path.join(f.prefix,"agent"):path.join(f.home,".pi","agent"),"package");
   await fs.rename(f.packageRoot,source);f.packageRoot=source;
  }
  const before=await tree(f.root),result=await invoke(f,args(f,selectors),environment);
  assert.equal(result.code,1);assert.equal(result.stdout,"");assert.match(result.stderr,/^Managed update staging refused: .*overlap[^\r\n]*\n$/u);
  assert.deepEqual(await tree(f.root),before);await absent(f.target);await absent(f.executed);
 });
});

test("stage refuses absent/foreign roots, conflicting slots and stale bytes without adoption or writes",async t=>{
 for(const mode of ["absent","foreign","conflicting","bytes","manifest"] as const)await t.test(mode,async()=>{
  const f=await fixture(mode!=="absent"&&mode!=="foreign");
  if(mode==="foreign"){await fs.mkdir(f.managed,{recursive:true});await fs.writeFile(path.join(f.managed,"foreign"),"KEEP");}
  if(mode==="conflicting"){f.manifest.version="1.0.0";await fs.writeFile(f.manifestPath,JSON.stringify(f.manifest));}
  if(mode==="bytes")await fs.writeFile(path.join(f.packageRoot,"cli.cjs"),"changed");
  if(mode==="manifest")await fs.writeFile(f.manifestPath,"not JSON");
  const before=await tree(f.root),result=await invoke(f);assert.equal(result.code,1);assert.equal(result.stdout,"");assert.match(result.stderr,/^Managed update staging refused: [^\r\n]{1,512}\n$/u);
  assert.deepEqual(await tree(f.root),before);await absent(f.target);await absent(f.executed);
 });
});

test("busy lease preserves its bytes and reports uncertainty rather than claiming a staged update",async()=>{
 const f=await fixture(),lock=path.join(f.managed,".asen-maintenance.lock");await fs.writeFile(lock,"FOREIGN");const before=await tree(f.root),result=await invoke(f);
 assert.equal(result.code,1);assert.equal(result.stderr,NOT_CONFIRMED);const report=JSON.parse(result.stdout);
 assert.equal(report.status,"ambiguous");assert.equal(report.publication,"not-started");assert.equal(report.catalog,"not-committed");assert.deepEqual(report.retainedPaths,[lock]);assert.equal(report.runtimeReady,false);
 assert.deepEqual(await tree(f.root),before);await absent(f.target);await absent(f.executed);
});

test("catalog rename then error retains actual publication and is neither retried nor compensated",async t=>{
 const f=await fixture(),before=await preserved(f),original=fs.rename.bind(fs);let commits=0;
 t.mock.method(fs,"rename",async(from:Parameters<typeof fs.rename>[0],to:Parameters<typeof fs.rename>[1])=>{
  await original(from,to);
  if(String(to)===path.join(f.managed,"managed-versions.json")){commits++;throw new Error("catalog outcome\nuncertain");}
 });syncBuiltinESMExports();
 try{
  const result=await invoke(f);assert.equal(commits,1,JSON.stringify(result));assert.equal(result.code,1);assert.equal(result.stderr,NOT_CONFIRMED);
  const report=JSON.parse(result.stdout);assert.equal(report.status,"ambiguous");assert.equal(report.publication,"published");assert.equal(report.catalog,"uncertain");assert.ok(report.retainedPaths.includes(f.target));assert.equal(report.runtimeReady,false);
  assert.equal(await fs.readFile(path.join(f.target,"dist","cli.cjs"),"utf8"),f.bytes);assert.deepEqual(await preserved(f),before);await absent(f.executed);
 }finally{t.mock.restoreAll();syncBuiltinESMExports();}
});

test("lease release failure keeps a committed catalog observable and does not retry publication",async t=>{
 const f=await fixture(),lock=path.join(f.managed,".asen-maintenance.lock"),original=fs.unlink.bind(fs);let releases=0;
 t.mock.method(fs,"unlink",async(file:Parameters<typeof fs.unlink>[0])=>{
  if(String(file)===lock){releases++;throw new Error("release unavailable");}return original(file);
 });syncBuiltinESMExports();
 try{
  const result=await invoke(f);assert.equal(result.code,1);assert.equal(result.stderr,NOT_CONFIRMED);assert.equal(releases,1);
  const report=JSON.parse(result.stdout);assert.equal(report.status,"ambiguous");assert.equal(report.publication,"published");assert.equal(report.catalog,"committed");assert.deepEqual(report.retainedPaths,[lock]);assert.equal(report.runtimeReady,false);
  const inventory=await inspectManagedInstall({prefix:f.prefix});assert.equal(inventory.status,"owned");assert.equal(inventory.activeVersion,"1.0.0");assert.deepEqual(inventory.versions.map(v=>v.version),["1.0.0","2.0.0"]);
  await absent(f.executed);
 }finally{t.mock.restoreAll();syncBuiltinESMExports();}
});

test("output failure after committed staging propagates without reclassifying or retrying the completed operation",async()=>{
 const f=await fixture(),before=await preserved(f),failure=new Error("output unavailable");let stdoutCalls=0,stderr="";
 await assert.rejects(()=>runAsen(args(f),env(f),{
  homeDirectory:()=>f.home,stdout:()=>{stdoutCalls++;throw failure;},stderr:text=>{stderr+=text;},
 }),error=>error===failure);
 assert.equal(stdoutCalls,1);assert.equal(stderr,"");
 const inventory=await inspectManagedInstall({prefix:f.prefix});assert.equal(inventory.status,"owned");assert.equal(inventory.activeVersion,"1.0.0");assert.deepEqual(inventory.versions.map(v=>v.version),["1.0.0","2.0.0"]);
 assert.equal(await fs.readFile(path.join(f.target,"dist","cli.cjs"),"utf8"),f.bytes);assert.deepEqual(await preserved(f),before);
 await absent(f.executed);await absent(path.join(f.managed,".asen-maintenance.lock"));
});

test("preflight diagnostics are bounded and control-scrubbed",async t=>{
 const f=await fixture();t.mock.method(fs,"readFile",async()=>{throw new Error("unsafe\n\u001b[31m"+"x".repeat(900));});syncBuiltinESMExports();
 try{
  const result=await invoke(f);assert.equal(result.code,1);assert.equal(result.stdout,"");assert.match(result.stderr,/^Managed update staging refused: [^\r\n]{1,512}\n$/u);assert.equal(/[\u0000-\u001f\u007f-\u009f]/u.test(result.stderr.slice(0,-1)),false);
 }finally{t.mock.restoreAll();syncBuiltinESMExports();}
});
