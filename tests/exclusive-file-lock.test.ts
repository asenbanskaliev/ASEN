import test from "node:test";
import assert from "node:assert/strict";
import fs,{existsSync,readdirSync} from "node:fs";
import fsPromises,{mkdtemp,readFile,rm,writeFile} from "node:fs/promises";
import {syncBuiltinESMExports} from "node:module";
import {tmpdir} from "node:os";
import path from "node:path";
import {withExclusiveFileLock,withExclusiveFileLockSync} from "../src/io/exclusive-file-lock.js";

const unsupportedHardLinkDiagnostic="Atomic file locking requires hard-link support from the storage filesystem";
type InjectedErrno="EEXIST"|"EPERM"|"EACCES"|"ENOSYS"|"ENOTSUP"|"EOPNOTSUPP"|"EXDEV"|"EISDIR";
function permissionError(code:InjectedErrno):NodeJS.ErrnoException{
 const error=new Error(`injected ${code}`) as NodeJS.ErrnoException;error.code=code;return error;
}

test("async lock initialization failure removes its canonical lock and preserves the original error",{concurrency:false},async t=>{
 const directory=await mkdtemp(path.join(tmpdir(),"asen-lock-async-init-")),target=path.join(directory,"data.json"),lock=`${target}.lock`;t.after(()=>rm(directory,{recursive:true,force:true}));
 const originalOpen=fsPromises.open.bind(fsPromises),failure=new Error("injected async lock write failure");let attempts=0;
 t.mock.method(fsPromises,"open",async(...args:Parameters<typeof fsPromises.open>)=>{
  const handle=await originalOpen(...args);if(attempts++===0)t.mock.method(handle,"writeFile",async()=>{throw failure;});return handle;
 });
 syncBuiltinESMExports();
 try{
  await assert.rejects(()=>withExclusiveFileLock(target,async()=>"unreachable"),error=>error===failure);assert.equal(existsSync(lock),false);
  assert.equal(await withExclusiveFileLock(target,async()=>"successor"),"successor");assert.equal(existsSync(lock),false);
 }finally{t.mock.restoreAll();syncBuiltinESMExports();}
});

test("sync lock initialization failure removes its canonical lock and preserves the original error",{concurrency:false},async t=>{
 const directory=await mkdtemp(path.join(tmpdir(),"asen-lock-sync-init-")),target=path.join(directory,"data.json"),lock=`${target}.lock`;t.after(()=>rm(directory,{recursive:true,force:true}));
 const originalWrite=fs.writeFileSync.bind(fs),failure=new Error("injected sync lock write failure");let attempts=0;
 t.mock.method(fs,"writeFileSync",((...args:Parameters<typeof fs.writeFileSync>)=>{if(attempts++===0)throw failure;return originalWrite(...args);}) as typeof fs.writeFileSync);
 syncBuiltinESMExports();
 try{
  assert.throws(()=>withExclusiveFileLockSync(target,()=>"unreachable"),error=>error===failure);assert.equal(existsSync(lock),false);
  assert.equal(withExclusiveFileLockSync(target,()=>"successor"),"successor");assert.equal(existsSync(lock),false);
 }finally{t.mock.restoreAll();syncBuiltinESMExports();}
});

for(const code of ["ENOSYS","ENOTSUP","EOPNOTSUPP","EXDEV","EISDIR"] as const){
 const skip=code==="EISDIR"&&process.platform!=="win32";
 test(`async unsupported atomic claim ${code} returns the hard-link diagnostic without side effects`,{concurrency:false,skip},async t=>{
  const directory=await mkdtemp(path.join(tmpdir(),"asen-lock-async-unsupported-")),target=path.join(directory,"data.json"),sentinel="sentinel",failure=permissionError(code);t.after(()=>rm(directory,{recursive:true,force:true}));
  await writeFile(target,sentinel);let operations=0;
  t.mock.method(fsPromises,"link",async()=>{throw failure;});syncBuiltinESMExports();
  try{
   await assert.rejects(()=>withExclusiveFileLock(target,async()=>{operations++;return "unreachable";}),error=>error instanceof Error&&error.constructor===Error&&error.message===unsupportedHardLinkDiagnostic&&error.cause===failure);
   assert.equal(operations,0);assert.equal(await readFile(target,"utf8"),sentinel);assert.deepEqual(readdirSync(directory),[path.basename(target)]);
  }finally{t.mock.restoreAll();syncBuiltinESMExports();}
 });
 test(`sync unsupported atomic claim ${code} returns the hard-link diagnostic without side effects`,{concurrency:false,skip},async t=>{
  const directory=await mkdtemp(path.join(tmpdir(),"asen-lock-sync-unsupported-")),target=path.join(directory,"data.json"),sentinel="sentinel",failure=permissionError(code);t.after(()=>rm(directory,{recursive:true,force:true}));
  await writeFile(target,sentinel);let operations=0;
  t.mock.method(fs,"linkSync",()=>{throw failure;});syncBuiltinESMExports();
  try{
   assert.throws(()=>withExclusiveFileLockSync(target,()=>{operations++;return "unreachable";}),error=>error instanceof Error&&error.constructor===Error&&error.message===unsupportedHardLinkDiagnostic&&error.cause===failure);
   assert.equal(operations,0);assert.equal(await readFile(target,"utf8"),sentinel);assert.deepEqual(readdirSync(directory),[path.basename(target)]);
  }finally{t.mock.restoreAll();syncBuiltinESMExports();}
 });
}

for(const mode of ["async","sync"] as const)test(`${mode} Windows EISDIR preserves a foreign destination directory`,{concurrency:false,skip:process.platform!=="win32"},async t=>{
 const directory=await mkdtemp(path.join(tmpdir(),`asen-lock-${mode}-foreign-directory-`)),target=path.join(directory,"data.json"),lock=`${target}.lock`,sentinel="sentinel",marker=path.join(lock,"foreign.txt"),failure=permissionError("EISDIR");t.after(()=>rm(directory,{recursive:true,force:true}));
 await writeFile(target,sentinel);await fsPromises.mkdir(lock);await writeFile(marker,"foreign");let operations=0;
 if(mode==="async")t.mock.method(fsPromises,"link",async()=>{throw failure;});else t.mock.method(fs,"linkSync",()=>{throw failure;});
 syncBuiltinESMExports();
 try{
  if(mode==="async")await assert.rejects(()=>withExclusiveFileLock(target,async()=>{operations++;}),error=>error===failure);
  else assert.throws(()=>withExclusiveFileLockSync(target,()=>{operations++;}),error=>error===failure);
  assert.equal(operations,0);assert.equal(await readFile(target,"utf8"),sentinel);assert.equal(await readFile(marker,"utf8"),"foreign");
  assert.deepEqual(readdirSync(directory).sort(),[path.basename(target),path.basename(lock)].sort());assert.deepEqual(readdirSync(lock),[path.basename(marker)]);
 }finally{t.mock.restoreAll();syncBuiltinESMExports();}
});

for(const mode of ["async","sync"] as const)test(`${mode} Windows EISDIR keeps the native error when capability inspection fails`,{concurrency:false,skip:process.platform!=="win32"},async t=>{
 const directory=await mkdtemp(path.join(tmpdir(),`asen-lock-${mode}-inspection-failure-`)),target=path.join(directory,"data.json"),failure=permissionError("EISDIR"),inspectionFailure=permissionError("EACCES");t.after(()=>rm(directory,{recursive:true,force:true}));
 let operations=0;
 if(mode==="async"){
  t.mock.method(fsPromises,"link",async()=>{throw failure;});t.mock.method(fsPromises,"lstat",async()=>{throw inspectionFailure;});
 }else{
  const originalLstat=fs.lstatSync.bind(fs);let inspections=0;
  t.mock.method(fs,"linkSync",()=>{throw failure;});t.mock.method(fs,"lstatSync",((...args:Parameters<typeof fs.lstatSync>)=>{if(inspections++===0)throw inspectionFailure;return originalLstat(...args);}) as typeof fs.lstatSync);
 }
 syncBuiltinESMExports();
 try{
  if(mode==="async")await assert.rejects(()=>withExclusiveFileLock(target,async()=>{operations++;}),error=>error===failure);
  else assert.throws(()=>withExclusiveFileLockSync(target,()=>{operations++;}),error=>error===failure);
  assert.equal(operations,0);assert.deepEqual(readdirSync(directory),[]);
 }finally{t.mock.restoreAll();syncBuiltinESMExports();}
});

for(const [mode,code] of [["async","EPERM"],["sync","EACCES"]] as const)test(`${mode} atomic claim ${code} cleans its temp and preserves the original error`,{concurrency:false},async t=>{
 const directory=await mkdtemp(path.join(tmpdir(),`asen-lock-${mode}-claim-`)),target=path.join(directory,"data.json"),failure=permissionError(code);t.after(()=>rm(directory,{recursive:true,force:true}));
 if(mode==="async")t.mock.method(fsPromises,"link",async()=>{throw failure;});else t.mock.method(fs,"linkSync",()=>{throw failure;});
 syncBuiltinESMExports();
 try{
  if(mode==="async")await assert.rejects(()=>withExclusiveFileLock(target,async()=>"unreachable"),error=>error===failure);
  else assert.throws(()=>withExclusiveFileLockSync(target,()=>"unreachable"),error=>error===failure);
  assert.deepEqual(readdirSync(directory),[]);
 }finally{t.mock.restoreAll();syncBuiltinESMExports();}
});

test("async failed initialization never removes a replacement canonical owner",{concurrency:false},async t=>{
 const directory=await mkdtemp(path.join(tmpdir(),"asen-lock-async-replacement-")),target=path.join(directory,"data.json"),lock=`${target}.lock`,replacement=JSON.stringify({pid:process.pid,token:"replacement",createdAt:Date.now()});t.after(()=>rm(directory,{recursive:true,force:true}));
 const originalOpen=fsPromises.open.bind(fsPromises),originalStat=fsPromises.stat.bind(fsPromises),failure=new Error("injected async initialization failure");let identity:Awaited<ReturnType<typeof originalStat>>|undefined,first=true;
 t.mock.method(fsPromises,"open",async(...args:Parameters<typeof fsPromises.open>)=>{
  const handle=await originalOpen(...args);if(first){first=false;const originalHandleStat=handle.stat.bind(handle),originalClose=handle.close.bind(handle);t.mock.method(handle,"stat",async()=>identity=await originalHandleStat());t.mock.method(handle,"writeFile",async()=>{throw failure;});t.mock.method(handle,"close",async()=>{await originalClose();await writeFile(lock,replacement);});}return handle;
 });
 t.mock.method(fsPromises,"stat",async(file:Parameters<typeof originalStat>[0],...args:Parameters<typeof originalStat> extends [unknown,...infer Rest]?Rest:never)=>file.toString()===lock&&identity?identity:originalStat(file,...args));syncBuiltinESMExports();
 try{await assert.rejects(()=>withExclusiveFileLock(target,async()=>"unreachable"),error=>error===failure);assert.equal(await readFile(lock,"utf8"),replacement);}
 finally{t.mock.restoreAll();syncBuiltinESMExports();}
});

test("sync failed initialization never removes a replacement canonical owner",{concurrency:false},async t=>{
 const directory=await mkdtemp(path.join(tmpdir(),"asen-lock-sync-replacement-")),target=path.join(directory,"data.json"),lock=`${target}.lock`,replacement=JSON.stringify({pid:process.pid,token:"replacement",createdAt:Date.now()});t.after(()=>rm(directory,{recursive:true,force:true}));
 const originalWrite=fs.writeFileSync.bind(fs),originalClose=fs.closeSync.bind(fs),originalFstat=fs.fstatSync.bind(fs),originalStat=fs.statSync.bind(fs),failure=new Error("injected sync initialization failure");let identity:ReturnType<typeof fs.fstatSync>|undefined,first=true;
 t.mock.method(fs,"writeFileSync",((...args:Parameters<typeof fs.writeFileSync>)=>{if(first){first=false;throw failure;}return originalWrite(...args);}) as typeof fs.writeFileSync);
 t.mock.method(fs,"fstatSync",((...args:Parameters<typeof fs.fstatSync>)=>identity=originalFstat(...args)) as typeof fs.fstatSync);
 t.mock.method(fs,"closeSync",((fd:number)=>{originalClose(fd);if(!existsSync(lock))originalWrite(lock,replacement);}) as typeof fs.closeSync);
 t.mock.method(fs,"statSync",((file,...args:Parameters<typeof fs.statSync> extends [unknown,...infer Rest]?Rest:never)=>file.toString()===lock&&identity?identity:originalStat(file,...args)) as typeof fs.statSync);syncBuiltinESMExports();
 try{assert.throws(()=>withExclusiveFileLockSync(target,()=>"unreachable"),error=>error===failure);assert.equal(await readFile(lock,"utf8"),replacement);}
 finally{t.mock.restoreAll();syncBuiltinESMExports();}
});

test("the synchronous protocol fails closed on malformed lock ownership",async t=>{
 const directory=await mkdtemp(path.join(tmpdir(),"asen-lock-sync-malformed-")),target=path.join(directory,"data.json"),lock=`${target}.lock`;t.after(()=>rm(directory,{recursive:true,force:true}));
 await writeFile(lock,"not-json");
 assert.throws(()=>withExclusiveFileLockSync(target,()=>"unreachable",20),/Timed out waiting/);assert.equal(await readFile(lock,"utf8"),"not-json");
});

test("the synchronous protocol cleans up ownership when its operation throws",async t=>{
 const directory=await mkdtemp(path.join(tmpdir(),"asen-lock-sync-throw-")),target=path.join(directory,"data.json"),lock=`${target}.lock`;t.after(()=>rm(directory,{recursive:true,force:true}));
 const failure=new Error("operation failed");assert.throws(()=>withExclusiveFileLockSync(target,()=>{throw failure;}),error=>error===failure);assert.equal(existsSync(lock),false);
});

test("the synchronous protocol ignores a predecessor tombstone and releases its canonical lock",async t=>{
 const directory=await mkdtemp(path.join(tmpdir(),"asen-lock-sync-tombstone-")),target=path.join(directory,"data.json"),lock=`${target}.lock`,tombstone=`${lock}.release-predecessor`;t.after(()=>rm(directory,{recursive:true,force:true}));
 await writeFile(tombstone,"pending deletion");assert.equal(withExclusiveFileLockSync(target,()=>"successor"),"successor");
 assert.equal(existsSync(lock),false);assert.deepEqual(readdirSync(directory),[path.basename(tombstone)]);
});

test("an aborted async lock waiter exits promptly without running its transaction",{timeout:5000},async t=>{
 const directory=await mkdtemp(path.join(tmpdir(),"asen-lock-abort-")),target=path.join(directory,"data.json"),lock=`${target}.lock`;t.after(()=>rm(directory,{recursive:true,force:true}));
 await writeFile(lock,JSON.stringify({pid:process.pid,token:"live-owner",createdAt:Date.now()}));
 const controller=new AbortController();let operations=0;const pending=withExclusiveFileLock(target,async()=>{operations++;return "unexpected";},30000,controller.signal);
 await new Promise(resolve=>setTimeout(resolve,30));const abortedAt=Date.now();controller.abort();
 await assert.rejects(pending,error=>(error as Error).name==="AbortError"&&/cancelled/i.test((error as Error).message));
 assert.ok(Date.now()-abortedAt<3000,"lock cancellation should not wait for the 30 second timeout even on a loaded Windows runner");assert.equal(operations,0);assert.equal((await readFile(lock,"utf8")).includes("live-owner"),true);
});

test("the synchronous protocol recovers a stale dead-process lock",async t=>{
 const directory=await mkdtemp(path.join(tmpdir(),"asen-lock-sync-stale-")),target=path.join(directory,"data.json");t.after(()=>rm(directory,{recursive:true,force:true}));
 await writeFile(`${target}.lock`,JSON.stringify({pid:2147483647,token:"dead",createdAt:Date.now()-60000}));
 assert.equal(withExclusiveFileLockSync(target,()=>"locked"),"locked");
 await assert.rejects(()=>readFile(`${target}.lock`,"utf8"),{code:"ENOENT"});
});

test("the synchronous protocol never steals a live process lock",async t=>{
 const directory=await mkdtemp(path.join(tmpdir(),"asen-lock-sync-live-")),target=path.join(directory,"data.json"),lock=`${target}.lock`;t.after(()=>rm(directory,{recursive:true,force:true}));
 const content=JSON.stringify({pid:process.pid,token:"live",createdAt:Date.now()-60000});await writeFile(lock,content);
 assert.throws(()=>withExclusiveFileLockSync(target,()=>"unreachable",20),/Timed out waiting/);assert.equal(await readFile(lock,"utf8"),content);assert.deepEqual(readdirSync(directory),[path.basename(lock)]);
});

test("a stale dead-process lock is recovered",async()=>{
 const directory=await mkdtemp(path.join(tmpdir(),"asen-lock-stale-")),target=path.join(directory,"data.json");
 await writeFile(`${target}.lock`,JSON.stringify({pid:2147483647,token:"dead",createdAt:Date.now()-60000}));
 assert.equal(await withExclusiveFileLock(target,async()=>"locked"),"locked");
});

test("a live process lock is never stolen",async()=>{
 const directory=await mkdtemp(path.join(tmpdir(),"asen-lock-live-")),target=path.join(directory,"data.json"),lock=`${target}.lock`;
 const content=JSON.stringify({pid:process.pid,token:"live",createdAt:Date.now()-60000});await writeFile(lock,content);
 await assert.rejects(()=>withExclusiveFileLock(target,async()=>"unreachable",20),/Timed out waiting/);assert.equal(await readFile(lock,"utf8"),content);assert.deepEqual(readdirSync(directory),[path.basename(lock)]);
});

test("an existing-lock inspection permission race retries once and reacquires",{concurrency:false},async t=>{
 const directory=await mkdtemp(path.join(tmpdir(),"asen-lock-inspect-race-")),target=path.join(directory,"data.json"),lock=`${target}.lock`;
 await writeFile(lock,JSON.stringify({pid:process.pid,token:"released",createdAt:Date.now()}));
 const originalReadFile=fsPromises.readFile.bind(fsPromises);let lockReads=0,operations=0;
 t.mock.method(fsPromises,"readFile",async(file:Parameters<typeof originalReadFile>[0],...args:Parameters<typeof originalReadFile> extends [unknown,...infer Rest]?Rest:never)=>{
  if(file.toString()===lock&&lockReads++===0){await rm(lock);throw permissionError("EPERM");}
  return originalReadFile(file,...args);
 });
 syncBuiltinESMExports();
 try{
  assert.equal(await withExclusiveFileLock(target,async()=>{operations++;return "locked";}),"locked");
  assert.equal(lockReads,2,"the injected fault came from lock inspection readFile before cleanup readFile");
  assert.equal(operations,1);
  await assert.rejects(()=>readFile(lock,"utf8"),{code:"ENOENT"});
 }finally{t.mock.restoreAll();syncBuiltinESMExports();}
});

for(const code of ["EPERM","EACCES"] as const)test(`persistent existing-lock inspection ${code} rethrows the original error`,{concurrency:false},async t=>{
 const directory=await mkdtemp(path.join(tmpdir(),"asen-lock-inspect-denied-")),target=path.join(directory,"data.json"),lock=`${target}.lock`;
 const content=JSON.stringify({pid:process.pid,token:"live",createdAt:Date.now()}),original=permissionError(code);await writeFile(lock,content);
 const originalReadFile=fsPromises.readFile.bind(fsPromises);let lockReads=0,operations=0;
 t.mock.method(fsPromises,"readFile",async(file:Parameters<typeof originalReadFile>[0],...args:Parameters<typeof originalReadFile> extends [unknown,...infer Rest]?Rest:never)=>{if(file.toString()===lock){lockReads++;throw original;}return originalReadFile(file,...args);});
 syncBuiltinESMExports();
 try{
  await assert.rejects(()=>withExclusiveFileLock(target,async()=>{operations++;}),error=>error===original&&(error as NodeJS.ErrnoException).code===code);
  assert.equal(lockReads,2);assert.equal(operations,0);assert.equal(await originalReadFile(lock,"utf8"),content);
 }finally{t.mock.restoreAll();syncBuiltinESMExports();}
});

test("one claim permission race after contention retries only when the lock has disappeared",{concurrency:false},async t=>{
 const directory=await mkdtemp(path.join(tmpdir(),"asen-lock-create-race-")),target=path.join(directory,"data.json"),lock=`${target}.lock`;
 const originalLink=fsPromises.link.bind(fsPromises),content=JSON.stringify({pid:process.pid,token:"owner",createdAt:Date.now()});await writeFile(lock,content);
 const exists=permissionError("EEXIST"),transient=permissionError("EPERM");let attempts=0,operations=0;
 t.mock.method(fsPromises,"link",async(...args:Parameters<typeof fsPromises.link>)=>{
  attempts++;if(attempts===1)throw exists;if(attempts===2){await rm(lock);throw transient;}return originalLink(...args);
 });
 syncBuiltinESMExports();
 try{
  assert.equal(await withExclusiveFileLock(target,async()=>{operations++;return "locked";}),"locked");
  assert.equal(attempts,3);assert.equal(operations,1);await assert.rejects(()=>readFile(lock,"utf8"),{code:"ENOENT"});
 }finally{t.mock.restoreAll();syncBuiltinESMExports();}
});

test("claim permission after contention still fails closed while the lock remains",{concurrency:false},async t=>{
 const directory=await mkdtemp(path.join(tmpdir(),"asen-lock-create-denied-after-contention-")),target=path.join(directory,"data.json"),lock=`${target}.lock`;
 const originalLink=fsPromises.link.bind(fsPromises),content=JSON.stringify({pid:process.pid,token:"owner",createdAt:Date.now()});await writeFile(lock,content);
 const exists=permissionError("EEXIST"),denied=permissionError("EACCES");let attempts=0,operations=0;
 t.mock.method(fsPromises,"link",async(...args:Parameters<typeof fsPromises.link>)=>{
  attempts++;if(attempts===1)throw exists;if(attempts===2)throw denied;return originalLink(...args);
 });
 syncBuiltinESMExports();
 try{
  await assert.rejects(()=>withExclusiveFileLock(target,async()=>{operations++;}),error=>error===denied);
  assert.equal(attempts,2);assert.equal(operations,0);assert.equal(await readFile(lock,"utf8"),content);
 }finally{t.mock.restoreAll();syncBuiltinESMExports();}
});

test("a waiting invocation starts after its predecessor exits even while predecessor cleanup is pending",{concurrency:false,timeout:5000},async t=>{
 const directory=await mkdtemp(path.join(tmpdir(),"asen-lock-release-")),target=path.join(directory,"data.json"),lock=`${target}.lock`;
 const originalLink=fsPromises.link.bind(fsPromises),originalRm=fsPromises.rm.bind(fsPromises);
 let allowFirstExit!:()=>void,firstStarted!:()=>void,contenderObserved!:()=>void,cleanupStarted!:()=>void,allowCleanup!:()=>void;
 const firstExit=new Promise<void>(resolve=>{allowFirstExit=resolve;}),started=new Promise<void>(resolve=>{firstStarted=resolve;}),contended=new Promise<void>(resolve=>{contenderObserved=resolve;}),cleanupPending=new Promise<void>(resolve=>{cleanupStarted=resolve;}),finishCleanup=new Promise<void>(resolve=>{allowCleanup=resolve;});
 let firstRemoval=true,active=0,maxActive=0,firstSettled=false;const events:string[]=[];
 t.mock.method(fsPromises,"link",async(...args:Parameters<typeof fsPromises.link>)=>{
  try{return await originalLink(...args);}catch(error){if(args[1].toString()===lock&&(error as NodeJS.ErrnoException).code==="EEXIST")contenderObserved();throw error;}
 });
 t.mock.method(fsPromises,"rm",async(...args:Parameters<typeof fsPromises.rm>)=>{
  if(firstRemoval&&args[0].toString().includes(".release-")){firstRemoval=false;cleanupStarted();await finishCleanup;}
  return originalRm(...args);
 });
 syncBuiltinESMExports();
 const first=withExclusiveFileLock(target,async()=>{events.push("first:start");active++;maxActive=Math.max(maxActive,active);firstStarted();await firstExit;active--;events.push("first:end");return "first";});
 void first.then(()=>{firstSettled=true;},()=>{firstSettled=true;});
 let second:Promise<string>|undefined;
 try{
  await started;
  second=withExclusiveFileLock(target,async()=>{events.push("second:start");active++;maxActive=Math.max(maxActive,active);active--;events.push("second:end");return "second";},500);
  await contended;allowFirstExit();await cleanupPending;
  assert.equal(await second,"second");
  assert.equal(firstSettled,false,"the predecessor is still waiting for cleanup");
  assert.equal(maxActive,1);assert.deepEqual(events,["first:start","first:end","second:start","second:end"]);
 }finally{allowFirstExit();allowCleanup();await Promise.allSettled([first,...second?[second]:[]]);t.mock.restoreAll();syncBuiltinESMExports();}
});

test("initial lock-create permission errors propagate without inspection",{concurrency:false},async t=>{
 const directory=await mkdtemp(path.join(tmpdir(),"asen-lock-create-denied-")),target=path.join(directory,"data.json"),original=permissionError("EPERM");
 let inspections=0,operations=0;
 t.mock.method(fsPromises,"open",async()=>{throw original;});
 t.mock.method(fsPromises,"readFile",async()=>{inspections++;throw new Error("unexpected inspection");});
 syncBuiltinESMExports();
 try{
  await assert.rejects(()=>withExclusiveFileLock(target,async()=>{operations++;}),error=>error===original);
  assert.equal(inspections,0);assert.equal(operations,0);
 }finally{t.mock.restoreAll();syncBuiltinESMExports();}
});
