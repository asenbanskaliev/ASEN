import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,mkdir,readFile,writeFile,stat,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {stageManagedInstall,inspectManagedInstall} from "../../src/runtime/managed-install.js";
const roots:string[]=[];
test.afterEach(async()=>{for(const root of roots.splice(0))await rm(root,{recursive:true,force:true});});
export const api=()=>import("../../src/runtime/managed-cli-version-probe.js");
export async function absent(file:string){try{await stat(file);return false;}catch(e){if((e as NodeJS.ErrnoException).code==="ENOENT")return true;throw e;}}
export async function fixture(mode="ok",unicode=false){
 const root=await mkdtemp(path.join(tmpdir(),"cp-"));roots.push(root);
 const prefix=path.join(root,unicode?"shared ü":"shared"),packageRoot=path.join(root,"source");
 const record=path.join(root,"record.json"),ready=path.join(root,"ready");
 await mkdir(packageRoot);await mkdir(path.join(prefix,"agent"),{recursive:true});
 await writeFile(path.join(prefix,"config.json"),"PERSONAL");await writeFile(path.join(prefix,"agent","state"),"STATE");
 const metadata={name:"asen",version:"0.1.0",engines:{node:mode==="unverified"?"^22.0.0":">=0.0.0"},bin:{asen:"./cli.cjs"}};
 await writeFile(path.join(packageRoot,"package.json"),JSON.stringify(metadata));
 let code='const fs=require("node:fs"),path=require("node:path");fs.writeFileSync('+JSON.stringify(record)+',JSON.stringify({args:process.argv.slice(2),entry:process.argv[1],cwd:process.cwd(),home:process.env.HOME,keys:Object.keys(process.env),secret:process.env.ASEN_PROBE_SECRET??null}));';
 if(mode==="hang")code+='fs.writeFileSync('+JSON.stringify(ready+".tmp")+',"READY");fs.renameSync('+JSON.stringify(ready+".tmp")+','+JSON.stringify(ready)+');setInterval(()=>{},1000);';
 else{
  if(mode==="drift")code+='fs.writeFileSync(__filename,"CHANGED");';
  if(mode==="foreign")code+='fs.writeFileSync(path.join(process.env.HOME,"foreign.txt"),"FOREIGN");';
  let stdout="0.1.0\n";
  if(mode==="wrong")stdout="WRONG\n";
  if(mode==="overflow")stdout="x".repeat(1024);
  code+='process.stdout.write('+JSON.stringify(stdout)+');';
  if(mode==="stderr")code+='process.stderr.write("fixture warning\\n");';
  if(mode==="exit")code+='process.exitCode=7;';
 }
 await writeFile(path.join(packageRoot,"cli.cjs"),code);
 const staged=await stageManagedInstall({prefix,packageRoot,version:"0.1.0",confirmed:true,protectedPaths:[path.join(root,"pi-home")],files:[
  {sourcePath:"package.json",destinationPath:"package.json"},{sourcePath:"cli.cjs",destinationPath:"cli.cjs"},
 ]});
 const bin=path.join(staged.versionRoot,"cli.cjs");
 const files=[path.join(prefix,"config.json"),path.join(prefix,"agent","state"),path.join(prefix,"install","managed-install.json"),
  path.join(packageRoot,"package.json"),path.join(packageRoot,"cli.cjs"),path.join(staged.versionRoot,"package.json"),bin];
 return {root,prefix,versionRoot:staged.versionRoot,record,ready,bin,files};
}
export async function snapshot(f:Awaited<ReturnType<typeof fixture>>,omitBin=false){
 return Promise.all(f.files.filter(file=>!omitBin||file!==f.bin).map(async file=>({file,bytes:await readFile(file),mtime:(await stat(file)).mtimeMs})));
}
export async function preserved(before:Awaited<ReturnType<typeof snapshot>>){
 for(const entry of before){assert.deepEqual(await readFile(entry.file),entry.bytes);assert.equal((await stat(entry.file)).mtimeMs,entry.mtime);}
}
export function baseReport(report:{schema:string;runtimeReady:boolean}){
 assert.equal(report.schema,"asen.managed-cli-version-observation/v1");assert.equal(report.runtimeReady,false);assert(Object.isFrozen(report));
}
export async function invocation(f:Awaited<ReturnType<typeof fixture>>){
 const result=JSON.parse(await readFile(f.record,"utf8")) as {args:string[];entry:string;cwd:string;home:string;keys:string[];secret:unknown};
 assert.deepEqual(result.args,["--version"]);assert.equal(result.cwd,f.versionRoot);assert.equal(result.secret,null);
 assert.equal(result.keys.some(key=>/NODE_OPTIONS|TOKEN|SECRET|PASSWORD|API_KEY|CREDENTIAL|PROVIDER/iu.test(key)),false);
 return result;
}
export {inspectManagedInstall};
