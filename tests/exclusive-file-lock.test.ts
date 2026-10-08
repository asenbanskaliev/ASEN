import test from "node:test";
import assert from "node:assert/strict";
import fsPromises,{mkdtemp,readFile,rm,writeFile} from "node:fs/promises";
import {syncBuiltinESMExports} from "node:module";
import {tmpdir} from "node:os";
import path from "node:path";
import {withExclusiveFileLock} from "../src/io/exclusive-file-lock.js";

function permissionError(code:"EEXIST"|"EPERM"|"EACCES"):NodeJS.ErrnoException{
 const error=new Error(`injected ${code}`) as NodeJS.ErrnoException;error.code=code;return error;
}

test("a stale dead-process lock is recovered",async()=>{
 const directory=await mkdtemp(path.join(tmpdir(),"asen-lock-stale-")),target=path.join(directory,"data.json");
 await writeFile(`${target}.lock`,JSON.stringify({pid:2147483647,token:"dead",createdAt:Date.now()-60000}));
 assert.equal(await withExclusiveFileLock(target,async()=>"locked"),"locked");
});

test("a live process lock is never stolen",async()=>{
 const directory=await mkdtemp(path.join(tmpdir(),"asen-lock-live-")),target=path.join(directory,"data.json"),lock=`${target}.lock`;
 const content=JSON.stringify({pid:process.pid,token:"live",createdAt:Date.now()-60000});await writeFile(lock,content);
 await assert.rejects(()=>withExclusiveFileLock(target,async()=>"unreachable",20),/Timed out waiting/);assert.equal(await readFile(lock,"utf8"),content);
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

test("one wx permission race after contention retries only when the lock has disappeared",{concurrency:false},async t=>{
 const directory=await mkdtemp(path.join(tmpdir(),"asen-lock-create-race-")),target=path.join(directory,"data.json"),lock=`${target}.lock`;
 const originalOpen=fsPromises.open.bind(fsPromises),content=JSON.stringify({pid:process.pid,token:"owner",createdAt:Date.now()});await writeFile(lock,content);
 const exists=permissionError("EEXIST"),transient=permissionError("EPERM");let attempts=0,operations=0;
 t.mock.method(fsPromises,"open",async(...args:Parameters<typeof fsPromises.open>)=>{
  if(args[0].toString()!==lock||args[1]!=="wx")return originalOpen(...args);
  attempts++;if(attempts===1)throw exists;if(attempts===2){await rm(lock);throw transient;}return originalOpen(...args);
 });
 syncBuiltinESMExports();
 try{
  assert.equal(await withExclusiveFileLock(target,async()=>{operations++;return "locked";}),"locked");
  assert.equal(attempts,3);assert.equal(operations,1);await assert.rejects(()=>readFile(lock,"utf8"),{code:"ENOENT"});
 }finally{t.mock.restoreAll();syncBuiltinESMExports();}
});

test("wx permission after contention still fails closed while the lock remains",{concurrency:false},async t=>{
 const directory=await mkdtemp(path.join(tmpdir(),"asen-lock-create-denied-after-contention-")),target=path.join(directory,"data.json"),lock=`${target}.lock`;
 const originalOpen=fsPromises.open.bind(fsPromises),content=JSON.stringify({pid:process.pid,token:"owner",createdAt:Date.now()});await writeFile(lock,content);
 const exists=permissionError("EEXIST"),denied=permissionError("EACCES");let attempts=0,operations=0;
 t.mock.method(fsPromises,"open",async(...args:Parameters<typeof fsPromises.open>)=>{
  if(args[0].toString()!==lock||args[1]!=="wx")return originalOpen(...args);
  attempts++;if(attempts===1)throw exists;if(attempts===2)throw denied;return originalOpen(...args);
 });
 syncBuiltinESMExports();
 try{
  await assert.rejects(()=>withExclusiveFileLock(target,async()=>{operations++;}),error=>error===denied);
  assert.equal(attempts,2);assert.equal(operations,0);assert.equal(await readFile(lock,"utf8"),content);
 }finally{t.mock.restoreAll();syncBuiltinESMExports();}
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
