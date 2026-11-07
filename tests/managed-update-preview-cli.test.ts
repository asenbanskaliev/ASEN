import test from "node:test";
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {createHash,randomUUID} from "node:crypto";
import fs,{type FileHandle} from "node:fs/promises";
import {syncBuiltinESMExports} from "node:module";
import path from "node:path";
import {performance} from "node:perf_hooks";
import {runAsen} from "../src/cli.js";
import {stageAdditionalManagedVersion,stageManagedInstall,selectManagedVersion} from "../src/runtime/managed-install.js";

const VERSION="1.2.3";
const USAGE="Unsupported ASEN managed update command. Expected: managed update --manifest <absolute-json> --package-root <absolute-dir> --dry-run.\n";
const sha=(bytes:string|Buffer)=>createHash("sha256").update(bytes).digest("hex");
type Fixture=Awaited<ReturnType<typeof fixture>>;
type Result={code:number|null;stdout:string;stderr:string};

async function absent(file:string){await assert.rejects(()=>fs.lstat(file),{code:"ENOENT"});}
async function tree(root:string):Promise<unknown>{
 const children:unknown[]=[];
 for(const name of (await fs.readdir(root)).sort()){
  const file=path.join(root,name),item=await fs.lstat(file);
  children.push([name,item.isSymbolicLink()?{kind:"link",target:await fs.readlink(file)}:item.isDirectory()?await tree(file):{kind:"file",bytes:(await fs.readFile(file)).toString("base64"),mtimeNs:(await fs.stat(file,{bigint:true})).mtimeNs.toString()}]);
 }
 return{mtimeNs:(await fs.stat(root,{bigint:true})).mtimeNs.toString(),children};
}
async function fixture(){
 const root=path.join(process.cwd(),".cache",`u9b-${randomUUID()} ü space`);
 assert.ok(path.relative(process.cwd(),root).startsWith(`.cache${path.sep}u9b-`));
 const home=path.join(root,"home selector independent"),packageRoot=path.join(root,"package bytes ü"),manifestPath=path.join(root,"manifest ü.json");
 await fs.mkdir(home,{recursive:true});await fs.mkdir(packageRoot,{recursive:true});
 const bytes="module.exports='never execute managed preview';\n",sourcePath="package/cli.js",destinationPath="dist/cli.js";
 await fs.mkdir(path.join(packageRoot,"package"));await fs.writeFile(path.join(packageRoot,...sourcePath.split("/")),bytes,{flag:"wx"});
 const manifest={schema:"asen.managed-acquisition/v1",version:VERSION,files:[{sourcePath,destinationPath,size:Buffer.byteLength(bytes),sha256:sha(bytes)}]};
 await fs.writeFile(manifestPath,JSON.stringify(manifest),{flag:"wx"});
 return{root,home,prefix:path.join(home,".asen"),managed:path.join(home,".asen","install"),packageRoot,manifestPath,manifest,bytes,executed:path.join(root,"EXECUTED")};
}
function args(f:Fixture,selector:string[]=[]){return[...selector,"managed","update","--manifest",f.manifestPath,"--package-root",f.packageRoot,"--dry-run"];}
function env(f:Fixture,extra:NodeJS.ProcessEnv={}):NodeJS.ProcessEnv{
 const systemRoot=process.env.SystemRoot??process.env.SYSTEMROOT;
 return{SystemRoot:systemRoot,WINDIR:systemRoot,OS:process.env.OS,PATH:path.dirname(process.execPath),PATHEXT:process.env.PATHEXT,HOME:f.home,USERPROFILE:f.home,TEMP:f.root,TMP:f.root,TMPDIR:f.root,APPDATA:path.join(f.root,"appdata"),LOCALAPPDATA:path.join(f.root,"local"),XDG_CONFIG_HOME:path.join(f.root,"xc"),XDG_CACHE_HOME:path.join(f.root,"xd"),XDG_DATA_HOME:path.join(f.root,"data-selector-must-not-move-prefix"),TSX_DISABLE_CACHE:"1",ASEN_NO_SKILL_REGISTRY:"1",...extra};
}
function invokeCli(f:Fixture,argv=args(f)):Result{
 const result=spawnSync(process.execPath,["--import","tsx",path.resolve("src/cli.ts"),...argv],{cwd:process.cwd(),env:env(f),shell:false,timeout:30000,maxBuffer:4*1024*1024,encoding:"utf8"});
 assert.equal(result.error,undefined);assert.equal(result.signal,null);
 return{code:result.status,stdout:result.stdout,stderr:result.stderr};
}
async function invokeRun(f:Fixture,argv=args(f)){
 let stdout="",stderr="",homeLookups=0;
 const code=await runAsen(argv,env(f),{homeDirectory:()=>{homeLookups++;return f.home;},stdout:text=>{stdout+=text;},stderr:text=>{stderr+=text;}});
 return{code,stdout,stderr,homeLookups};
}
function expected(f:Fixture,status:"absent"|"foreign"|"owned",selectedVersion:string|null,targetVersionState:"not-retained"|"matching-retained"|"conflicting-retained"|"not-observable"){
 return{schema:"asen.managed-update-preview/v1",operation:"managed-update-preview",executable:false,authorized:false,manifestPath:f.manifestPath,acquisition:{status:"verified",packageRoot:f.packageRoot,canonicalPackageRoot:f.packageRoot,version:VERSION,files:[{...f.manifest.files[0],contentObservation:"declared-bytes-matched",confinementObservation:"contained-at-validation-points"}],bytesRead:Buffer.byteLength(f.bytes),contentObservation:"declared-bytes-matched",confinementObservation:"contained-at-validation-points",snapshotGuarantee:"none",producerAuthenticity:"not-established",authority:false,runtimeReady:false,budgets:{perFileBytes:64*1024*1024,totalBytes:256*1024*1024,readChunkBytes:1024*1024,cooperativeDeadlineMs:30000}},managed:{prefix:f.prefix,status,selectedVersion,targetVersionState},staging:"not-run",selection:"not-run",activation:"not-run",snapshotGuarantee:"none",producerAuthenticity:"not-established",runtimeReady:false};
}
async function stage(f:Fixture,version=VERSION,bytes=f.bytes,additional=false){
 const producer=path.join(f.root,`producer-${version}-${randomUUID()}`);await fs.mkdir(path.join(producer,"dist"),{recursive:true});
 await fs.writeFile(path.join(producer,"dist","cli.js"),bytes);
 const request={prefix:f.prefix,packageRoot:producer,version,confirmed:true as const,protectedPaths:[],files:[{sourcePath:"dist/cli.js",destinationPath:"dist/cli.js"}]};
 if(additional)await stageAdditionalManagedVersion(request);else await stageManagedInstall(request);
}
function parseExact(result:{stdout:string;stderr:string},expectedValue:unknown){assert.equal(result.stderr,"");assert.equal(result.stdout,JSON.stringify(expectedValue,null,2)+"\n");}

// Behavioral RED: before T09-U9b the public route falls through to managed-run grammar and cannot produce this report.
test("public preview observes absent state with exact JSON and preserves every fixture byte, name, and mtime",async()=>{
 const f=await fixture(),before=await tree(f.root),result=await invokeRun(f);
 assert.equal(result.code,0);assert.equal(result.homeLookups,1);parseExact(result,expected(f,"absent",null,"not-retained"));
 assert.deepEqual(await tree(f.root),before);await absent(f.executed);await absent(path.join(f.managed,".asen-maintenance.lock"));
});

test("real CLI smoke supports spaces and Unicode without execution, staging, selector, or output effects",async()=>{
 const f=await fixture(),before=await tree(f.root),result=invokeCli(f);
 assert.equal(result.code,0);parseExact(result,expected(f,"absent",null,"not-retained"));assert.deepEqual(await tree(f.root),before);
 await absent(f.executed);await absent(f.managed);assert.equal((await fs.readdir(f.root)).some(name=>name.includes("stage")||name.includes("tmp")),false);
});

test("fixed grammar errors exit 2 before home lookup or filesystem I/O",async t=>{
 const f=await fixture(),missing=path.join(f.root,"must-not-read.json"),cases=[
  ["missing values",["managed","update"]],
  ["wrong order",["managed","update","--package-root",f.packageRoot,"--manifest",missing,"--dry-run"]],
  ["missing dry run",["managed","update","--manifest",missing,"--package-root",f.packageRoot]],
  ["extra",[...args(f),"extra"]],
  ["repeat",[...args(f),"--dry-run"]],
  ["global package root",["--package-root",f.packageRoot,...args(f)]],
  ["relative manifest",["managed","update","--manifest","relative.json","--package-root",f.packageRoot,"--dry-run"]],
  ["relative package",["managed","update","--manifest",missing,"--package-root","relative","--dry-run"]],
  ["control",["managed","update","--manifest",`${missing}\nINJECTED`,"--package-root",f.packageRoot,"--dry-run"]],
 ] as const;
 for(const [name,argv] of cases)await t.test(name,async()=>{
  let stdout="",stderr="",lookups=0;const code=await runAsen([...argv],{}, {homeDirectory:()=>{lookups++;throw new Error("home forbidden");},stdout:text=>{stdout+=text;},stderr:text=>{stderr+=text;}});
  assert.deepEqual({code,stdout,stderr,lookups},{code:2,stdout:"",stderr:USAGE,lookups:0});await absent(missing);
 });
});

test("existing selector conflicts remain exact and data-home selectors never relocate the software prefix",async()=>{
 const f=await fixture();
 assert.deepEqual(await invokeRun(f,["--link","--home",path.join(f.root,"other"),...args(f)]),{code:2,stdout:"",stderr:"--link and --home are mutually exclusive\n",homeLookups:0});
 for(const selector of [["--isolated"],["--home",path.join(f.root,"other data ü")]]){
  const result=await invokeRun(f,args(f,selector));assert.equal(result.code,0);const report=JSON.parse(result.stdout);assert.equal(report.managed.prefix,f.prefix);assert.equal(result.stderr,"");
 }
});

test("protected Pi and update passthrough contexts retain their old literal behavior",async()=>{
 const f=await fixture(),piRoot=path.join(f.root,"pi package"),record=path.join(f.root,"PI-ARGS");
 for(const runtimeRoot of [piRoot,f.packageRoot]){
  const dist=path.join(runtimeRoot,"node_modules","@earendil-works","pi-coding-agent","dist");await fs.mkdir(dist,{recursive:true});await fs.writeFile(path.join(path.dirname(dist),"package.json"),JSON.stringify({type:"commonjs"}));await fs.writeFile(path.join(dist,"cli.js"),`require("node:fs").writeFileSync(${JSON.stringify(record)},JSON.stringify(process.argv.slice(2)));`);
 }
 for(const literal of [["update","managed","update","--manifest",f.manifestPath,"--package-root",f.packageRoot,"--dry-run"],["--","managed","update","--manifest",f.manifestPath,"--package-root",f.packageRoot,"--dry-run"]]){
  const result=invokeCli(f,["--package-root",piRoot,...literal]);assert.deepEqual(result,{code:0,stdout:"",stderr:""});
  const expectedArgs=literal[0]==="--"?literal.slice(1):literal.filter((_,index)=>index!==5&&index!==6);
  assert.deepEqual(JSON.parse(await fs.readFile(record,"utf8")),expectedArgs);await fs.unlink(record);
 }
});

test("foreign, matching, conflicting, selected-different, and absent-selector owned states are truthful",async t=>{
 for(const item of [
  {name:"foreign",prepare:async(f:Fixture)=>{await fs.mkdir(f.managed,{recursive:true});await fs.writeFile(path.join(f.managed,"foreign"),"x");},state:["foreign",null,"not-observable"]},
  {name:"matching",prepare:async(f:Fixture)=>{await stage(f);await selectManagedVersion({prefix:f.prefix,version:VERSION,expectedCurrentVersion:null,confirmed:true});},state:["owned",VERSION,"matching-retained"]},
  {name:"conflicting",prepare:async(f:Fixture)=>{await stage(f,VERSION,"different bytes");},state:["owned",null,"conflicting-retained"]},
  {name:"selected different",prepare:async(f:Fixture)=>{await stage(f);await stage(f,"2.0.0","other",true);await selectManagedVersion({prefix:f.prefix,version:"2.0.0",expectedCurrentVersion:null,confirmed:true});},state:["owned","2.0.0","matching-retained"]},
  {name:"selector absent",prepare:async(f:Fixture)=>{await stage(f);},state:["owned",null,"matching-retained"]},
 ] as const)await t.test(item.name,async()=>{
  const f=await fixture();await item.prepare(f);const before=await tree(f.root),result=await invokeRun(f),[status,selected,target]=item.state;
  assert.equal(result.code,0);parseExact(result,expected(f,status,selected,target));assert.deepEqual(await tree(f.root),before);await absent(f.executed);await absent(path.join(f.managed,".asen-maintenance.lock"));
 });
});

test("retained comparison requires exact ordered destination path, size, and hash inventory",async()=>{
 const f=await fixture(),secondBytes="second",second={sourcePath:"package/second.js",destinationPath:"second.js",size:Buffer.byteLength(secondBytes),sha256:sha(secondBytes)};
 await fs.writeFile(path.join(f.packageRoot,"package","second.js"),secondBytes);f.manifest.files.push(second as typeof f.manifest.files[number]);await fs.writeFile(f.manifestPath,JSON.stringify(f.manifest));
 const producer=path.join(f.root,"producer-ordered");await fs.mkdir(path.join(producer,"dist"),{recursive:true});await fs.writeFile(path.join(producer,"dist","cli.js"),f.bytes);await fs.writeFile(path.join(producer,"second.js"),secondBytes);
 await stageManagedInstall({prefix:f.prefix,packageRoot:producer,version:VERSION,confirmed:true,protectedPaths:[],files:[{sourcePath:"second.js",destinationPath:"second.js"},{sourcePath:"dist/cli.js",destinationPath:"dist/cli.js"}]});
 const result=await invokeRun(f),report=JSON.parse(result.stdout);assert.equal(result.code,0);assert.equal(result.stderr,"");assert.equal(result.stdout,JSON.stringify(report,null,2)+"\n");assert.deepEqual(report.acquisition.files.map((item:{destinationPath:string})=>item.destinationPath),["dist/cli.js","second.js"]);assert.deepEqual(report.managed,{prefix:f.prefix,status:"owned",selectedVersion:null,targetVersionState:"conflicting-retained"});
});

async function refused(f:Fixture,expectedMessage?:RegExp,preserved=true){const before=await tree(f.root),result=await invokeRun(f);assert.equal(result.code,1);assert.equal(result.stdout,"");assert.match(result.stderr,/^Managed update preview refused: [^\r\n]*\n$/u);assert.ok(result.stderr.length<="Managed update preview refused: ".length+512+1);if(expectedMessage)assert.match(result.stderr,expectedMessage);if(preserved)assert.deepEqual(await tree(f.root),before);await absent(f.executed);return result;}

test("manifest size, link, nonregular, fatal UTF-8, JSON, schema, and package mismatch refuse without effects",async t=>{
 const cases=[
  {name:"oversize",prepare:async(f:Fixture)=>fs.writeFile(f.manifestPath,Buffer.alloc(1024*1024+1,0x20))},
  {name:"directory",prepare:async(f:Fixture)=>{await fs.unlink(f.manifestPath);await fs.mkdir(f.manifestPath);}},
  {name:"utf8",prepare:async(f:Fixture)=>fs.writeFile(f.manifestPath,Buffer.from([0xc3,0x28]))},
  {name:"json",prepare:async(f:Fixture)=>{f.manifestPath=path.join(f.root,"malformed-manifest.txt");await fs.writeFile(f.manifestPath,"{");}},
  {name:"schema",prepare:async(f:Fixture)=>fs.writeFile(f.manifestPath,JSON.stringify({...f.manifest,schema:"wrong"}))},
  {name:"package mismatch",prepare:async(f:Fixture)=>fs.writeFile(path.join(f.packageRoot,"package","cli.js"),"changed")},
 ] as const;
 for(const item of cases)await t.test(item.name,async()=>{const f=await fixture();await item.prepare(f);await refused(f);});
 await t.test("hardlink",async()=>{const f=await fixture(),other=path.join(f.root,"manifest-hardlink.json");await fs.link(f.manifestPath,other);await refused(f);});
 await t.test("symlink",async t=>{const f=await fixture(),real=f.manifestPath;await fs.rename(real,real+".real");try{await fs.symlink(real+".real",real,"file");}catch(error){if(process.platform==="win32"&&(error as NodeJS.ErrnoException).code==="EPERM"){t.skip("Windows file-symlink fixture creation unavailable: EPERM");return;}throw error;}await refused(f);});
});

test("manifest descriptor ownership, identity, drift, and cooperative deadline fail closed and close once",async t=>{
 const fsPromises=process.getBuiltinModule("fs/promises"),originalOpen=fsPromises.open.bind(fsPromises),replaceOpen=(value:Function)=>Object.defineProperty(fsPromises,"open",{configurable:true,writable:true,value});
 await t.test("unsupported descriptor identity closes",async()=>{const f=await fixture();let closes=0;replaceOpen(async(...a:unknown[])=>{const h=await (originalOpen as Function)(...a) as FileHandle,stat=h.stat.bind(h),close=h.close.bind(h);Object.defineProperties(h,{stat:{configurable:true,value:async(...s:unknown[])=>{const value=await (stat as Function)(...s);(value as {ino:bigint}).ino=0n;return value;}},close:{configurable:true,value:async()=>{closes++;return close();}}});return h;});syncBuiltinESMExports();try{await refused(f,/identity/iu);assert.equal(closes,1);}finally{replaceOpen(originalOpen);syncBuiltinESMExports();}});
 await t.test("read drift closes",async()=>{const f=await fixture();let closes=0,changed=false;replaceOpen(async(...a:unknown[])=>{const h=await (originalOpen as Function)(...a) as FileHandle,mutable=h as unknown as {read:Function;close:Function},read=mutable.read.bind(h),close=mutable.close.bind(h);mutable.read=async(...r:unknown[])=>{const value=await read(...r);if(!changed){changed=true;await fs.appendFile(f.manifestPath," ");}return value;};mutable.close=async()=>{closes++;return close();};return h;});syncBuiltinESMExports();try{await refused(f,/changed|drift/iu,false);assert.equal(closes,1);assert.equal((await fs.readFile(f.manifestPath,"utf8")).endsWith(" "),true);await absent(f.managed);}finally{replaceOpen(originalOpen);syncBuiltinESMExports();}});
 await t.test("deadline immediately after open still closes",async()=>{const f=await fixture(),performanceProto=Object.getPrototypeOf(performance) as {now:Function},originalNow=performanceProto.now;let now=10,closes=0;performanceProto.now=()=>now;replaceOpen(async(...a:unknown[])=>{const h=await (originalOpen as Function)(...a) as FileHandle,close=h.close.bind(h);h.close=async()=>{closes++;return close();};now=30011;return h;});syncBuiltinESMExports();try{await refused(f,/deadline/iu);assert.equal(closes,1);}finally{replaceOpen(originalOpen);performanceProto.now=originalNow;syncBuiltinESMExports();}});
});

test("operational errors are one line, control-scrubbed, and bounded to 512 message characters",async()=>{
 const f=await fixture(),longName="x".repeat(900),manifest=path.join(f.root,longName,"missing.json"),result=await invokeRun(f,["managed","update","--manifest",manifest,"--package-root",f.packageRoot,"--dry-run"]);
 assert.equal(result.code,1);assert.equal(result.stdout,"");assert.match(result.stderr,/^Managed update preview refused: [^\r\n]{1,512}\n$/u);assert.equal(result.stderr.includes("\u0000"),false);
});
