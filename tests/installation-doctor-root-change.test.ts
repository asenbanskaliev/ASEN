import test from "node:test";
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import {tmpdir} from "node:os";
import {pathToFileURL} from "node:url";
import {stageManagedInstall} from "../src/runtime/managed-install.js";

const VERSION="1.2.0";
const INCOMPLETE="Installation doctor could not complete all metadata observations.\n";

type Entry={mtimeMs:number;children?:readonly unknown[];bytes?:string};
async function tree(root:string):Promise<Entry>{
 const rootEntry=await fs.lstat(root),children:unknown[]=[];
 for(const name of (await fs.readdir(root)).sort()){
  const file=path.join(root,name),entry=await fs.lstat(file);
  children.push([name,entry.isSymbolicLink()?"link":entry.isDirectory()?await tree(file):{mtimeMs:entry.mtimeMs,bytes:(await fs.readFile(file)).toString("base64")}]);
 }
 return{mtimeMs:rootEntry.mtimeMs,children};
}
async function absent(file:string){await assert.rejects(()=>fs.lstat(file),{code:"ENOENT"});}
function cleanEnv(root:string,home:string,extra:NodeJS.ProcessEnv={}):NodeJS.ProcessEnv{
 const systemRoot=process.env.SystemRoot??process.env.SYSTEMROOT;
 return{SystemRoot:systemRoot,WINDIR:systemRoot,OS:process.env.OS,PATH:path.dirname(process.execPath),PATHEXT:process.env.PATHEXT,
  HOME:home,USERPROFILE:home,TEMP:path.join(root,"temp"),TMP:path.join(root,"temp"),TMPDIR:path.join(root,"temp"),
  APPDATA:path.join(root,"appdata"),LOCALAPPDATA:path.join(root,"localappdata"),XDG_CONFIG_HOME:path.join(root,"xdg-config"),
  XDG_CACHE_HOME:path.join(root,"xdg-cache"),XDG_DATA_HOME:path.join(root,"xdg-data"),TSX_DISABLE_CACHE:"1",ASEN_NO_SKILL_REGISTRY:"1",...extra};
}

test("DoctorRootChangeRed public doctor marks an owned root replaced after final inspection incomplete",async t=>{
 const base=process.env.TEMP??process.env.TMP??tmpdir(),root=await fs.mkdtemp(path.join(base,"drc-"));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const home=path.join(root,"home ü"),prefix=path.join(home,".asen"),managedRoot=path.join(prefix,"install"),retainedRoot=path.join(prefix,"install-retained"),data=path.join(root,"data home"),packageRoot=path.join(root,"package source"),effective=path.join(root,"effective package"),control=path.join(root,"CONTROL.json");
 const managedSentinel=path.join(root,"MANAGED-EXECUTED"),packageSentinel=path.join(root,"PACKAGE-EXECUTED"),envSentinel=path.join(root,"ENV-EXECUTED"),probeSentinel=path.join(root,"PROBE-EXECUTED");
 for(const dir of [home,prefix,data,path.join(packageRoot,"dist"),path.join(effective,"node_modules","@earendil-works","pi-coding-agent","dist"),path.join(root,"temp")])await fs.mkdir(dir,{recursive:true});
 await fs.writeFile(path.join(packageRoot,"package.json"),JSON.stringify({name:"asen",version:VERSION,engines:{node:">=0.0.0"},bin:{asen:"dist/cli.cjs"}}));
 await fs.writeFile(path.join(packageRoot,"dist/cli.cjs"),`require("node:fs").writeFileSync(process.argv.includes("--version")?${JSON.stringify(probeSentinel)}:${JSON.stringify(managedSentinel)},"executed");`);
 await stageManagedInstall({prefix,packageRoot,version:VERSION,confirmed:true,protectedPaths:[data],files:[{sourcePath:"package.json",destinationPath:"package.json"},{sourcePath:"dist/cli.cjs",destinationPath:"dist/cli.cjs"}]});
 const bundled=path.join(effective,"node_modules","@earendil-works","pi-coding-agent"),bundledCli=path.join(bundled,"dist","cli.js"),envPi=path.join(root,"env-pi.cjs");
 await fs.writeFile(path.join(bundled,"package.json"),JSON.stringify({type:"commonjs"}));await fs.writeFile(bundledCli,`require("node:fs").writeFileSync(${JSON.stringify(packageSentinel)},"executed");`);await fs.writeFile(envPi,`require("node:fs").writeFileSync(${JSON.stringify(envSentinel)},"executed");`);
 const config=path.join(prefix,"config.json");await fs.writeFile(config,JSON.stringify({home:data}));
 const managedBefore=await tree(managedRoot),packageBefore=await tree(packageRoot),effectiveBefore=await tree(effective),configBefore={bytes:await fs.readFile(config),mtimeMs:(await fs.stat(config)).mtimeMs};
 const child=path.join(root,"doctor-child.mjs"),cliUrl=pathToFileURL(path.resolve("src/cli.ts")).href,replacement="ordinary replacement";
 await fs.writeFile(child,`import fs from "node:fs";import {runAsen} from ${JSON.stringify(cliUrl)};
const original=JSON.stringify,managedRoot=${JSON.stringify(managedRoot)},retainedRoot=${JSON.stringify(retainedRoot)},control=${JSON.stringify(control)};let armed=true,stimulated=false,matches=0;
JSON.stringify=function(value,replacer,space){if(armed&&value&&typeof value==="object"&&!Array.isArray(value)&&value.status==="owned"&&value.managedRoot===managedRoot&&value.runtimeReady===false&&Array.isArray(value.versions)&&Object.prototype.hasOwnProperty.call(value,"activeVersion")){armed=false;matches++;fs.renameSync(managedRoot,retainedRoot);fs.writeFileSync(managedRoot,${JSON.stringify(replacement)});stimulated=true;}return Reflect.apply(original,this,[value,replacer,space]);};
let code=1;try{code=await runAsen(["--package-root",${JSON.stringify(effective)},"doctor"],process.env,{homeDirectory:()=>${JSON.stringify(home)}});}finally{JSON.stringify=original;fs.writeFileSync(control,Reflect.apply(original,JSON,[{stimulated,matches,rootIsFile:fs.lstatSync(managedRoot).isFile(),retainedIsDirectory:fs.lstatSync(retainedRoot).isDirectory()}]));}process.exitCode=code;`);
 const result=spawnSync(process.execPath,["--import","tsx",child],{cwd:process.cwd(),env:cleanEnv(root,home,{ASEN_PI_ON_PATH:envPi}),shell:false,timeout:10000,maxBuffer:1024*1024,encoding:"utf8"});
 assert.equal(result.error,undefined);assert.equal(result.signal,null);assert.deepEqual(JSON.parse(await fs.readFile(control,"utf8")),{stimulated:true,matches:1,rootIsFile:true,retainedIsDirectory:true});
 assert.equal((await fs.lstat(managedRoot)).isFile(),true);assert.equal(await fs.readFile(managedRoot,"utf8"),replacement);assert.deepEqual(await tree(retainedRoot),managedBefore,"renamed owned root bytes or mtimes changed");
 assert.deepEqual(await tree(packageRoot),packageBefore);assert.deepEqual(await tree(effective),effectiveBefore);assert.deepEqual({bytes:await fs.readFile(config),mtimeMs:(await fs.stat(config)).mtimeMs},configBefore);
 for(const sentinel of [managedSentinel,packageSentinel,envSentinel,probeSentinel,path.join(retainedRoot,".asen-maintenance.lock")])await absent(sentinel);
 const report=JSON.parse(result.stdout);assert.equal(result.stdout,JSON.stringify(report,null,2)+"\n");
 assert.deepEqual({code:result.status,stderr:result.stderr,collection:report.collection,maintenance:report.maintenance,runtimeProbe:report.runtimeProbe,runtimeReady:report.runtimeReady,publisherAuthenticity:report.publisherAuthenticity,nativeAuthority:report.nativeAuthority,processHealth:report.processHealth},{code:1,stderr:INCOMPLETE,collection:{status:"incomplete",confidence:"metadata-only",atomic:false,issueCodes:["MANAGED_STATE_CHANGED"]},maintenance:{status:"unknown",observedType:null,confidence:"presence-only"},runtimeProbe:"not-run",runtimeReady:false,publisherAuthenticity:"unknown",nativeAuthority:"unknown",processHealth:"unknown"});
});
