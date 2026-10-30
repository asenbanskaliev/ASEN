import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import {existsSync,watch} from "node:fs";
import {syncBuiltinESMExports} from "node:module";
import {tmpdir} from "node:os";
import path from "node:path";
import {stageManagedInstall} from "../src/runtime/managed-install.js";
import {withManagedMaintenanceLock} from "../src/runtime/managed-maintenance-lock.js";
import {probeManagedCliVersion} from "../src/runtime/managed-cli-version-probe.js";

async function fixture(t:{after:(fn:()=>Promise<void>)=>void},mode="plain"){
 const root=await fs.mkdtemp(path.join(tmpdir(),"cl-"));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const prefix=path.join(root,"home"),pkg=path.join(root,"pkg"),log=path.join(root,"events"),ready=path.join(root,"ready"),release=path.join(root,"release"),guard=path.join(root,"guard");
 await fs.mkdir(pkg);
 await fs.writeFile(path.join(pkg,"package.json"),JSON.stringify({name:"asen",version:"0.1.0",engines:{node:">=0.0.0"},bin:{asen:"cli.cjs"}}));
 let code='const fs=require("node:fs"),path=require("node:path");const log='+JSON.stringify(log)+';';
 if(mode==="serial")code+='const ready='+JSON.stringify(ready)+',release='+JSON.stringify(release)+',guard='+JSON.stringify(guard)+';let fd;try{fd=fs.openSync(guard,"wx");fs.appendFileSync(log,"START\\n");let done=false,w;const finish=()=>{if(done)return;done=true;clearTimeout(timer);w?.close();fs.closeSync(fd);fs.unlinkSync(guard);fs.appendFileSync(log,"END\\n");process.stdout.write("0.1.0\\n");};const timer=setTimeout(finish,7000);if(fs.existsSync(release))finish();else{w=fs.watch(path.dirname(release),(_event,name)=>{if(String(name)===path.basename(release)&&fs.existsSync(release))finish();});if(fs.existsSync(release))finish();}fs.writeFileSync(ready,"READY");}catch(e){fs.appendFileSync(log,"OVERLAP\\n");process.stderr.write("OVERLAP");process.exitCode=3;}';
 else{code+='fs.appendFileSync(log,"RUN\\n");';if(mode==="replace")code+='fs.writeFileSync(path.resolve(process.cwd(),"../..",".asen-maintenance.lock"),"FOREIGN");';code+='process.stdout.write("0.1.0\\n");';}
 await fs.writeFile(path.join(pkg,"cli.cjs"),code);
 const staged=await stageManagedInstall({prefix,packageRoot:pkg,version:"0.1.0",confirmed:true,protectedPaths:[],files:[{sourcePath:"package.json",destinationPath:"package.json"},{sourcePath:"cli.cjs",destinationPath:"cli.cjs"}]});
 return{root,prefix,log,ready,release,managed:path.join(prefix,"install"),lock:path.join(prefix,"install",".asen-maintenance.lock"),bin:path.join(staged.versionRoot,"cli.cjs")};
}
const request=(f:Awaited<ReturnType<typeof fixture>>,signal?:AbortSignal)=>({prefix:f.prefix,version:"0.1.0",confirmed:true,...signal?{signal}:{}});
async function state(root:string){return{names:(await fs.readdir(root)).sort(),mtimeMs:(await fs.stat(root)).mtimeMs};}
async function absent(file:string){await assert.rejects(()=>fs.stat(file),{code:"ENOENT"});}
function contention(t:{mock:typeof test.mock},lock:string){
 const original=fs.open.bind(fs);let seen!:()=>void;const waiting=new Promise<void>(r=>{seen=r;});
 t.mock.method(fs,"open",async(...args:Parameters<typeof fs.open>)=>{
  try{return await original(...args);}catch(error){if(String(args[0])===lock&&(error as NodeJS.ErrnoException).code==="EEXIST")seen();throw error;}
 });syncBuiltinESMExports();return waiting;
}
function presence(file:string){
 let found!:()=>void;const ready=new Promise<void>(r=>{found=r;});
 const watcher=watch(path.dirname(file),(_event,name)=>{if(String(name)===path.basename(file)&&existsSync(file))found();});
 if(existsSync(file))found();return{ready,stop:()=>watcher.close()};
}
function observed(result:Awaited<ReturnType<typeof probeManagedCliVersion>>){
 assert.equal(result.cliVersion,"observed",JSON.stringify(result));assert.equal(result.runtimeReady,false);assert.equal(result.launchAttempts,1);
 assert.equal(result.stdout,"0.1.0\n");assert.equal(result.stderr,"");assert.equal(result.exitCode,0);assert.equal(result.termination,"closed");assert(Object.isFrozen(result));
}

test("an existing maintenance marker prevents CLI effects and an aborted waiter preserves it",{concurrency:false},async t=>{
 const f=await fixture(t),bytes='{"pid":2147483647,"createdAt":0,"token":"unknown"}';
 await fs.writeFile(f.lock,bytes);const before=await state(f.managed);
 const refused=await probeManagedCliVersion(request(f));
 assert.equal(refused.cliVersion,"not-run",JSON.stringify(refused));assert.equal(refused.reason,"maintenance-unavailable");
 assert.equal(refused.launchAttempts,0);assert.equal(refused.stdout,"");assert.equal(refused.stderr,"");assert.equal(refused.exitCode,null);assert.equal(refused.temporaryData,null);assert.equal(refused.runtimeReady,false);
 await absent(f.log);assert.equal(await fs.readFile(f.lock,"utf8"),bytes);assert.deepEqual(await state(f.managed),before);
 const controller=new AbortController(),waiting=contention(t,f.lock),pending=probeManagedCliVersion(request(f,controller.signal));
 try{
  assert.equal(await Promise.race([waiting.then(()=>true),pending.then(()=>false)]),true,"probe completed without waiting for the existing marker");
  controller.abort();const cancelled=await pending;
  assert.equal(cancelled.cliVersion,"not-run");assert.equal(cancelled.reason,"cancelled-before-launch");assert.equal(cancelled.launchAttempts,0);assert.equal(cancelled.temporaryData,null);
  assert.equal(cancelled.stdout,"");assert.equal(cancelled.stderr,"");assert.equal(cancelled.exitCode,null);assert.equal(cancelled.runtimeReady,false);
  await absent(f.log);assert.equal(await fs.readFile(f.lock,"utf8"),bytes);assert.deepEqual(await state(f.managed),before);
 }finally{controller.abort();await pending;t.mock.restoreAll();syncBuiltinESMExports();}
});

test("concurrent CLI probes serialize actual package execution",{concurrency:false},async t=>{
 const f=await fixture(t,"serial"),ready=presence(f.ready),first=probeManagedCliVersion(request(f));let second:ReturnType<typeof probeManagedCliVersion>|undefined;
 try{
  assert.equal(await Promise.race([ready.ready.then(()=>true),first.then(()=>false)]),true,"first CLI never reached READY");
  assert.equal(await fs.readFile(f.ready,"utf8"),"READY");
  const waiting=contention(t,f.lock);second=probeManagedCliVersion(request(f));
  assert.equal(await Promise.race([waiting.then(()=>true),second.then(()=>false)]),true,"second CLI bypassed the held maintenance marker");
  await fs.writeFile(f.release,"RELEASE");
  const results=await Promise.all([first,second]);for(const result of results)observed(result);
  assert.equal(await fs.readFile(f.log,"utf8"),"START\nEND\nSTART\nEND\n");await absent(f.lock);
 }finally{await fs.writeFile(f.release,"RELEASE");ready.stop();t.mock.restoreAll();syncBuiltinESMExports();await Promise.allSettled([first,...second?[second]:[]]);}
});

test("release uncertainty never erases already executed CLI output",async t=>{
 const f=await fixture(t,"replace"),result=await probeManagedCliVersion(request(f));
 assert.equal(result.cliVersion,"ambiguous",JSON.stringify(result));assert.equal(result.reason,"maintenance-unavailable");assert.equal(result.runtimeReady,false);
 assert.equal(result.launchAttempts,1);assert.equal(result.stdout,"0.1.0\n");assert.equal(result.stderr,"");assert.equal(result.exitCode,0);assert.equal(result.termination,"closed");assert.equal(typeof result.launcherPid,"number");
 assert.equal(await fs.readFile(f.log,"utf8"),"RUN\n");assert.equal(await fs.readFile(f.lock,"utf8"),"FOREIGN");assert(Object.isFrozen(result));
});

test("candidate drift while queued is retained without executing or creating probe temporaries",{concurrency:false},async t=>{
 const f=await fixture(t);let entered!:()=>void,leave!:()=>void;
 const started=new Promise<void>(r=>{entered=r;}),held=new Promise<void>(r=>{leave=r;});
 const owner=withManagedMaintenanceLock({prefix:f.prefix,confirmed:true},async()=>{entered();await held;});
 await started;const waiting=contention(t,f.lock),pending=probeManagedCliVersion(request(f));
 try{
  assert.equal(await Promise.race([waiting.then(()=>true),pending.then(()=>false)]),true,"CLI executed without waiting for its maintenance lease");
  await fs.writeFile(f.bin,"CHANGED");leave();await owner;const result=await pending;
  assert.equal(result.cliVersion,"not-run");assert.equal(result.reason,"candidate-drift");assert.equal(result.launchAttempts,0);assert.equal(result.temporaryData,null);
  assert.equal(result.stdout,"");assert.equal(result.stderr,"");assert.equal(result.exitCode,null);assert.equal(result.runtimeReady,false);
  assert.equal(await fs.readFile(f.bin,"utf8"),"CHANGED");await absent(f.log);await absent(f.lock);
  assert.equal((await fs.readdir(f.managed)).some(name=>name.startsWith(".cli-probe-")),false);
 }finally{leave();t.mock.restoreAll();syncBuiltinESMExports();await Promise.allSettled([owner,pending]);}
});
