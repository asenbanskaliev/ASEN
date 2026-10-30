import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import {syncBuiltinESMExports} from "node:module";
import {tmpdir} from "node:os";
import path from "node:path";
import {stageManagedInstall} from "../src/runtime/managed-install.js";

const api=()=>import("../src/runtime/managed-maintenance-lock.js");
async function fixture(t:{after:(fn:()=>Promise<void>)=>void}){
 const directory=await fs.mkdtemp(path.join(tmpdir(),"ml-"));
 t.after(()=>fs.rm(directory,{recursive:true,force:true}));
 const prefix=path.join(directory,"home"),pkg=path.join(directory,"pkg");
 await fs.mkdir(pkg);await fs.writeFile(path.join(pkg,"fixture.txt"),"owned fixture\n");
 await stageManagedInstall({prefix,packageRoot:pkg,version:"1.0.0",files:[{sourcePath:"fixture.txt",destinationPath:"fixture.txt"}],protectedPaths:[],confirmed:true});
 return{prefix,root:path.join(prefix,"install"),lock:path.join(prefix,"install",".asen-maintenance.lock")};
}
const code=(expected:string)=>(error:unknown)=>(error as {code?:unknown}).code===expected;
async function state(root:string){return{names:(await fs.readdir(root)).sort(),mtimeMs:(await fs.stat(root)).mtimeMs};}

test("maintenance refusals run no callback and preserve the original installation",async t=>{
 const {withManagedMaintenanceLock}=await api(),f=await fixture(t),before=await state(f.root);let calls=0;
 const cancelled=new AbortController();cancelled.abort();
 for(const request of [
  {prefix:f.prefix,confirmed:false},{prefix:"relative",confirmed:true},
  ...[0,30001,NaN,Infinity,1.5].map(timeoutMs=>({prefix:f.prefix,confirmed:true,timeoutMs})),
  {prefix:f.prefix,confirmed:true,signal:cancelled.signal},
 ]){
  await assert.rejects(()=>withManagedMaintenanceLock(request,async()=>{calls++;}));
  assert.equal(calls,0);assert.deepEqual(await state(f.root),before);
 }
 const absent=path.join(f.prefix,"absent");
 await assert.rejects(()=>withManagedMaintenanceLock({prefix:absent,confirmed:true},async()=>{calls++;}),code("OWNED_ROOT_REQUIRED"));
 await assert.rejects(()=>fs.stat(absent),{code:"ENOENT"});assert.equal(calls,0);assert.deepEqual(await state(f.root),before);
 const foreign=path.join(f.prefix,"foreign"),foreignRoot=path.join(foreign,"install");
 await fs.mkdir(foreignRoot,{recursive:true});await fs.writeFile(path.join(foreignRoot,"unknown"),"keep");const foreignBefore=await state(foreignRoot);
 await assert.rejects(()=>withManagedMaintenanceLock({prefix:foreign,confirmed:true},async()=>{calls++;}),code("OWNED_ROOT_REQUIRED"));
 assert.equal(calls,0);assert.equal(await fs.readFile(path.join(foreignRoot,"unknown"),"utf8"),"keep");assert.deepEqual(await state(foreignRoot),foreignBefore);assert.deepEqual(await state(f.root),before);
});

test("an owned maintenance lease returns the result and removes only its own marker",async t=>{
 const {withManagedMaintenanceLock}=await api(),f=await fixture(t),names=(await fs.readdir(f.root)).sort();let calls=0;
 const value=await withManagedMaintenanceLock({prefix:f.prefix,confirmed:true},async()=>{
  calls++;const marker=JSON.parse(await fs.readFile(f.lock,"utf8"));
  assert.equal(marker.schema,"asen.managed-maintenance-lock/v1");assert.equal(marker.pid,process.pid);
  assert.equal(typeof marker.token,"string");assert.equal(typeof marker.createdAt,"number");
  assert.deepEqual((await fs.readdir(f.root)).sort(),[...names,".asen-maintenance.lock"].sort());return 42;
 });
 assert.equal(value,42);assert.equal(calls,1);assert.deepEqual((await fs.readdir(f.root)).sort(),names);
});

test("maintenance callback failure is preserved after a clean release",async t=>{
 const {withManagedMaintenanceLock}=await api(),f=await fixture(t),failure=new Error("operation failed");let calls=0;
 await assert.rejects(()=>withManagedMaintenanceLock({prefix:f.prefix,confirmed:true},async()=>{calls++;throw failure;}),error=>error===failure);
 assert.equal(calls,1);await assert.rejects(()=>fs.stat(f.lock),{code:"ENOENT"});
});

test("contending maintenance callbacks never overlap",{concurrency:false,timeout:5000},async t=>{
 const {withManagedMaintenanceLock}=await api(),f=await fixture(t),originalOpen=fs.open.bind(fs);
 let entered!:()=>void,leave!:()=>void,contended!:()=>void,active=0,max=0;
 const started=new Promise<void>(r=>{entered=r;}),held=new Promise<void>(r=>{leave=r;}),waiting=new Promise<void>(r=>{contended=r;});
 const first=withManagedMaintenanceLock({prefix:f.prefix,confirmed:true},async()=>{active++;max=Math.max(max,active);entered();await held;active--;return "first";});
 await started;const firstBytes=await fs.readFile(f.lock,"utf8");
 t.mock.method(fs,"open",async(...args:Parameters<typeof fs.open>)=>{
  try{return await originalOpen(...args);}catch(error){if(String(args[0])===f.lock&&(error as NodeJS.ErrnoException).code==="EEXIST")contended();throw error;}
 });syncBuiltinESMExports();
 try{
  const second=withManagedMaintenanceLock({prefix:f.prefix,confirmed:true,timeoutMs:1000},async()=>{active++;max=Math.max(max,active);active--;return "second";});
  await waiting;assert.equal(active,1);assert.equal(await fs.readFile(f.lock,"utf8"),firstBytes);
  leave();assert.deepEqual(await Promise.all([first,second]),["first","second"]);assert.equal(max,1);
  await assert.rejects(()=>fs.stat(f.lock),{code:"ENOENT"});
 }finally{leave();t.mock.restoreAll();syncBuiltinESMExports();await first;}
});

test("old dead-owner and malformed maintenance markers are never stolen",async t=>{
 const {withManagedMaintenanceLock}=await api(),f=await fixture(t);let calls=0;
 for(const bytes of [JSON.stringify({pid:2147483647,createdAt:0,token:"dead"}),"not-json"]){
  await fs.writeFile(f.lock,bytes);const before=await state(f.root);
  await assert.rejects(()=>withManagedMaintenanceLock({prefix:f.prefix,confirmed:true,timeoutMs:20},async()=>{calls++;}),code("LOCK_TIMEOUT"));
  assert.equal(calls,0);assert.equal(await fs.readFile(f.lock,"utf8"),bytes);assert.deepEqual(await state(f.root),before);
 }
});

test("an aborted maintenance waiter preserves the existing marker",{concurrency:false,timeout:5000},async t=>{
 const {withManagedMaintenanceLock}=await api(),f=await fixture(t),bytes="unknown existing lease",originalOpen=fs.open.bind(fs);
 await fs.writeFile(f.lock,bytes);const before=await state(f.root),controller=new AbortController();let seen!:()=>void,calls=0;
 const waiting=new Promise<void>(r=>{seen=r;});
 t.mock.method(fs,"open",async(...args:Parameters<typeof fs.open>)=>{
  try{return await originalOpen(...args);}catch(error){if(String(args[0])===f.lock)seen();throw error;}
 });syncBuiltinESMExports();
 try{
  const pending=withManagedMaintenanceLock({prefix:f.prefix,confirmed:true,signal:controller.signal},async()=>{calls++;});
  await waiting;controller.abort();await assert.rejects(pending,code("LOCK_CANCELLED"));
  assert.equal(calls,0);assert.equal(await fs.readFile(f.lock,"utf8"),bytes);assert.deepEqual(await state(f.root),before);
 }finally{t.mock.restoreAll();syncBuiltinESMExports();}
});

test("copied marker bytes on a different physical file are retained",async t=>{
 const {withManagedMaintenanceLock}=await api(),f=await fixture(t);let expected="",calls=0;
 await assert.rejects(()=>withManagedMaintenanceLock({prefix:f.prefix,confirmed:true},async()=>{
  calls++;expected=await fs.readFile(f.lock,"utf8");await fs.rename(f.lock,f.lock+".saved");await fs.writeFile(f.lock,expected);
 }),code("LOCK_RETAINED"));
 assert.equal(calls,1);assert.equal(await fs.readFile(f.lock,"utf8"),expected);assert.equal(await fs.readFile(f.lock+".saved","utf8"),expected);
});

test("replaced maintenance roots and their foreign bytes are never cleaned",async t=>{
 const {withManagedMaintenanceLock}=await api(),f=await fixture(t);let original="";
 await assert.rejects(()=>withManagedMaintenanceLock({prefix:f.prefix,confirmed:true},async()=>{
  original=await fs.readFile(f.lock,"utf8");await fs.rename(f.root,f.root+".saved");await fs.mkdir(f.root);await fs.writeFile(f.lock,"foreign");
 }),code("LOCK_RETAINED"));
 assert.equal(await fs.readFile(f.lock,"utf8"),"foreign");
 assert.equal(await fs.readFile(path.join(f.root+".saved",path.basename(f.lock)),"utf8"),original);
});

test("failed marker initialization is retained with its original cause",{concurrency:false},async t=>{
 const {withManagedMaintenanceLock}=await api(),f=await fixture(t),originalOpen=fs.open.bind(fs),failure=new Error("injected initialization failure");let calls=0;
 t.mock.method(fs,"open",async(...args:Parameters<typeof fs.open>)=>{
  const handle=await originalOpen(...args);if(String(args[0])===f.lock)t.mock.method(handle,"writeFile",async()=>{throw failure;});return handle;
 });syncBuiltinESMExports();
 try{
  await assert.rejects(()=>withManagedMaintenanceLock({prefix:f.prefix,confirmed:true},async()=>{calls++;}),
   error=>code("LOCK_INIT_FAILED")(error)&&(error as Error).cause===failure);
  assert.equal(calls,0);assert.equal(await fs.readFile(f.lock,"utf8"),"");
 }finally{t.mock.restoreAll();syncBuiltinESMExports();}
});

test("operation and uncertain-release errors both survive",async t=>{
 const {withManagedMaintenanceLock}=await api(),f=await fixture(t),failure=new Error("original operation failure");
 await assert.rejects(()=>withManagedMaintenanceLock({prefix:f.prefix,confirmed:true},async()=>{
  await fs.writeFile(f.lock,"unknown replacement bytes");throw failure;
 }),error=>error instanceof AggregateError&&error.errors[0]===failure&&code("LOCK_RETAINED")(error.errors[1]));
 assert.equal(await fs.readFile(f.lock,"utf8"),"unknown replacement bytes");
});
