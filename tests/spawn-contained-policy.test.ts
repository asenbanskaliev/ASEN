import test from "node:test";
import assert from "node:assert/strict";
import childProcess,{type ChildProcess,type SpawnOptions} from "node:child_process";
import {EventEmitter} from "node:events";
import {syncBuiltinESMExports} from "node:module";
import {mkdtemp,mkdir,readdir,readFile,writeFile,rm,stat} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {spawnContained} from "../src/evidence/spawn-contained.js";

type Launch=(command:string,args:readonly string[],options:SpawnOptions,privateTempRoot:string)=>ChildProcess;
async function inherited():Promise<Launch>{
 const module=await import("../src/evidence/spawn-contained.js") as unknown as Record<string,unknown>;
 assert.equal(typeof module.spawnContainedWithInheritedPolicy,"function","inherited-policy entry is missing");
 return module.spawnContainedWithInheritedPolicy as Launch;
}
const roots:string[]=[];
test.afterEach(async()=>{for(const root of roots.splice(0))await rm(root,{recursive:true,force:true});});
async function fixture(){const root=await mkdtemp(path.join(tmpdir(),"asen-policy-"));roots.push(root);const parent=path.join(root,"private payload ü");await mkdir(parent);return{root,parent};}
interface Call {command:string;args:readonly string[];options:SpawnOptions}
async function recording(body:(calls:Call[],fake:ChildProcess)=>Promise<void>){
 const calls:Call[]=[],fake=new EventEmitter() as ChildProcess,original=childProcess.spawn;
 const replacement=((command:string,args:readonly string[],options:SpawnOptions)=>{calls.push({command,args,options});return fake;}) as typeof childProcess.spawn;
 childProcess.spawn=replacement;syncBuiltinESMExports();
 try{assert.equal((await import("node:child_process")).spawn,replacement);await body(calls,fake);}
 finally{childProcess.spawn=original;syncBuiltinESMExports();}
}

test("legacy contained spawn preserves its existing default command contract",async()=>{
 const f=await fixture();await recording(async(calls,fake)=>{
  const options:SpawnOptions={cwd:f.root,env:process.env,stdio:["ignore","pipe","pipe"],shell:false};
  assert.equal(spawnContained(process.execPath,["--version"],options),fake);assert.equal(calls.length,1);
  const call=calls[0];assert(call);assert.equal(call.options.cwd,f.root);assert.equal(call.options.env,process.env);
  assert.deepEqual(call.options.stdio,["ignore","pipe","pipe"]);assert.equal(call.options.shell,false);
  if(process.platform==="win32"){
   assert.equal(call.command,process.execPath);assert.deepEqual(call.args,["--version"]);
   assert.equal(call.options.shell,false);assert.equal(call.options.detached,false);assert.equal(call.options.windowsHide,true);
  }else{assert.equal(call.command,process.execPath);assert.deepEqual(call.args,["--version"]);}
  fake.emit("close",0,null);
 });
});

test("inherited contained spawn pins policy and private payload without shell",async()=>{
 const launch=await inherited(),f=await fixture();await recording(async(calls,fake)=>{
  assert.equal(launch(process.execPath,["--version"],{cwd:f.root,env:process.env,shell:true},f.parent),fake);
  assert.equal(calls.length,1);const call=calls[0];assert(call);assert.equal(call.options.shell,false);
  assert.equal(call.options.cwd,f.root);assert.equal(call.options.env,process.env);
  if(process.platform==="win32"){
   assert.equal(call.command,process.execPath);assert.deepEqual(call.args,["--version"]);
   assert.equal(call.options.detached,false);assert.equal(call.options.windowsHide,true);
  }else{assert.equal(call.command,process.execPath);assert.deepEqual(call.args,["--version"]);}
  fake.emit("close",0,null);assert.deepEqual(await readdir(f.parent),[]);
 });
});

test("inherited contained spawn refuses a relative payload parent before effects",async()=>{
 const launch=await inherited(),f=await fixture();await recording(async calls=>{
  assert.throws(()=>launch(process.execPath,["--version"],{cwd:f.root},"relative"),{message:"Private process payload parent must be absolute"});
  assert.equal(calls.length,0);assert.deepEqual(await readdir(f.parent),[]);
 });
});

 for(const replacement of [false,true]){
 test(`inherited payload cleanup preserves ${replacement?"replaced":"unlisted"} data`,{skip:"The Windows PowerShell payload bridge was removed after the hosted-runner hang was reproduced"},async()=>{
  const launch=await inherited(),f=await fixture();await recording(async(calls,fake)=>{
   launch(process.execPath,["--version"],{cwd:f.root,env:process.env},f.parent);assert.equal(calls.length,1);
   const names=await readdir(f.parent);assert.equal(names.length,1);const payload=path.join(f.parent,names[0]!);
   if(replacement){await rm(payload,{recursive:true,force:true});await mkdir(payload);}
   const unknown=path.join(payload,replacement?"command.json":"foreign.txt");await writeFile(unknown,"FOREIGN");
   const before=(await stat(unknown)).mtimeMs;fake.emit("close",0,null);
   assert.equal(await readFile(unknown,"utf8"),"FOREIGN");assert.equal((await stat(unknown)).mtimeMs,before);
  });
 });
}

test("inherited contained spawn observes native Node version without policy override",async()=>{
 const launch=await inherited(),f=await fixture();
 const result=await new Promise<{code:number|null;signal:NodeJS.Signals|null;stdout:string;stderr:string}>((resolve,reject)=>{
  const child=launch(process.execPath,["--version"],{cwd:f.root,env:process.env,stdio:["ignore","pipe","pipe"],shell:false},f.parent);
  let stdout="",stderr="",expired=false;
  const timer=setTimeout(()=>{expired=true;child.kill("SIGKILL");},12000);
  child.stdout?.on("data",chunk=>{stdout+=String(chunk);});child.stderr?.on("data",chunk=>{stderr+=String(chunk);});
  child.once("error",error=>{clearTimeout(timer);reject(error);});
  child.once("close",(code,signal)=>{clearTimeout(timer);if(expired)reject(new Error("Inherited-policy native check exceeded 12s"));else resolve({code,signal,stdout,stderr});});
 });
 assert.equal(result.code,0);assert.equal(result.signal,null);assert.equal(result.stderr,"");
 assert.equal([process.version+"\n",process.version+"\r\n"].includes(result.stdout),true);
 assert.deepEqual(await readdir(f.parent),[]);
});
