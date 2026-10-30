import test from "node:test";
import assert from "node:assert/strict";
import {createHash,randomUUID} from "node:crypto";
import {syncBuiltinESMExports} from "node:module";
import {lstat,link,mkdir,open,readFile,readdir,readlink,rename,symlink,utimes,writeFile} from "node:fs/promises";
// Filesystem mutation in this suite is confined to fresh owned u9v fixtures.
import path from "node:path";
import {performance} from "node:perf_hooks";
import {
 ManagedAcquisitionVerificationError,
 verifyManagedAcquisitionPackage,
} from "../src/runtime/managed-acquisition-verification.js";
import {ManagedInstallError} from "../src/runtime/managed-install.js";

const sha=(bytes:string|Buffer)=>createHash("sha256").update(bytes).digest("hex");
const described=(sourcePath:string,bytes:string|Buffer,destinationPath=sourcePath)=>({sourcePath,destinationPath,size:Buffer.byteLength(bytes),sha256:sha(bytes)});
const manifest=(files:unknown[])=>({schema:"asen.managed-acquisition/v1",version:"1.2.3",files});

async function fixture(files:Record<string,string|Buffer>={"package/cli.js":"hello"}){
 const root=path.join(process.cwd(),".cache",`u9v-${randomUUID()}`);
 const relative=path.relative(process.cwd(),root);
 assert.ok(relative.startsWith(`.cache${path.sep}u9v-`)&&!relative.includes(".."));
 await mkdir(root,{recursive:false});
 for(const [name,bytes] of Object.entries(files)){
  const target=path.join(root,...name.split("/"));
  assert.equal(path.relative(root,target).startsWith(".."),false);
  await mkdir(path.dirname(target),{recursive:true});
  await writeFile(target,bytes,{flag:"wx"});
 }
 return root;
}
async function expectVerificationError(
 promise:Promise<unknown>,
 code:string,
 message:string,
):Promise<ManagedAcquisitionVerificationError>{
 let observed:ManagedAcquisitionVerificationError|undefined;
 await assert.rejects(promise,error=>{
  assert.ok(error instanceof ManagedAcquisitionVerificationError);
  assert.equal(error.name,"ManagedAcquisitionVerificationError");
  assert.equal(error.code,code);
  assert.equal(error.message,message);
  observed=error;
  return true;
 });
 assert.ok(observed);
 return observed;
}
async function expectCode(promise:Promise<unknown>,code:string){
 await assert.rejects(promise,error=>error instanceof ManagedAcquisitionVerificationError&&error.code===code);
}


test("decodes before I/O and validates local absolute root forms",async()=>{
 await assert.rejects(verifyManagedAcquisitionPackage(path.join(process.cwd(),"missing"),{bad:true}),error=>error instanceof ManagedInstallError&&error.code==="INVALID_ACQUISITION_MANIFEST");
 for(const root of ["", ".", "relative/root", Object(process.cwd())]){
  await expectCode(verifyManagedAcquisitionPackage(root as string,manifest([described("x","x")])),"INVALID_PACKAGE_ROOT");
 }
 if(process.platform==="win32"){
  for(const root of ["\\rooted", "C:relative", "\\\\server\\share", "\\\\?\\C:\\extended", "\\\\.\\device"]){
   await expectCode(verifyManagedAcquisitionPackage(root,manifest([described("x","x")])),"INVALID_PACKAGE_ROOT");
  }
 }
});

test("verifies repeated sources, multiple and empty files into frozen independent metadata",async()=>{
 const root=await fixture({"package/a.bin":"alpha","package/empty.bin":""});
 const input=manifest([
  described("package/a.bin","alpha","dist/a.bin"),
  described("package/a.bin","alpha","copy/a.bin"),
  described("package/empty.bin","","empty.bin"),
 ]);
 const report=await verifyManagedAcquisitionPackage(root,input);
 assert.equal(report.status,"verified");
 assert.equal(report.bytesRead,10);
 assert.equal(report.files.length,3);
 assert.equal(report.contentObservation,"declared-bytes-matched");
 assert.equal(report.confinementObservation,"contained-at-validation-points");
 assert.equal(report.snapshotGuarantee,"none");
 assert.equal(report.producerAuthenticity,"not-established");
 assert.equal(report.authority,false);
 assert.equal(report.runtimeReady,false);
 assert.ok(Object.isFrozen(report)&&Object.isFrozen(report.files)&&report.files.every(Object.isFrozen));
 (input.files as Array<{sourcePath:string}>)[0]!.sourcePath="changed";
 assert.equal(report.files[0]!.sourcePath,"package/a.bin");
 assert.equal("bytes" in report.files[0]!,false);
 assert.equal((await readFile(path.join(root,"package/a.bin"),"utf8")),"alpha");
 assert.equal(await lstat(path.join(root,"dist")).then(()=>true,()=>false),false);
});

test("rejects declared per-file and aggregate bounds before opening",async()=>{
 const root=await fixture();
 const handle=await open(path.join(root,"package/cli.js"),"r");
 const proto=Object.getPrototypeOf(handle) as {read:Function};
 await handle.close();
 const original=proto.read;let reads=0;
 const stats=await lstat(root,{bigint:true});
 const statsProto=Object.getPrototypeOf(stats) as {isSymbolicLink:Function};
 const originalIsSymbolicLink=statsProto.isSymbolicLink;let metadataCalls=0;
 proto.read=function(...args:unknown[]){reads++;return original.apply(this,args);};
 statsProto.isSymbolicLink=function(this:unknown,...args:unknown[]){metadataCalls++;return originalIsSymbolicLink.apply(this,args);};
 try{
  await expectCode(verifyManagedAcquisitionPackage(root,manifest([{sourcePath:"package/cli.js",destinationPath:"x",size:64*1024*1024+1,sha256:"0".repeat(64)}])),"PACKAGE_BOUNDS_EXCEEDED");
  const files=Array.from({length:5},(_,i)=>({sourcePath:"package/cli.js",destinationPath:`x${i}`,size:64*1024*1024,sha256:"0".repeat(64)}));
  await expectCode(verifyManagedAcquisitionPackage(root,manifest(files)),"PACKAGE_BOUNDS_EXCEEDED");
  assert.equal(reads,0);
  assert.equal(metadataCalls,0);
 }finally{proto.read=original;statsProto.isSymbolicLink=originalIsSymbolicLink;}
});

test("reports hash, truncation, and growth mismatches without changing names or content",async()=>{
 const hashRoot=await fixture({"f":"abc"});
 await expectVerificationError(
  verifyManagedAcquisitionPackage(hashRoot,manifest([{...described("f","abc"),sha256:"0".repeat(64)}])),
  "PACKAGE_CONTENT_MISMATCH",
  "Managed acquisition sha256 does not match its declaration: f",
 );
 assert.equal(await readFile(path.join(hashRoot,"f"),"utf8"),"abc");
 assert.deepEqual(await readdir(hashRoot),["f"]);
 const shortRoot=await fixture({"f":"ab"});
 await expectCode(verifyManagedAcquisitionPackage(shortRoot,manifest([{...described("f","abc")}])) ,"PACKAGE_CONTENT_MISMATCH");
 const longRoot=await fixture({"f":"abcd"});
 await expectCode(verifyManagedAcquisitionPackage(longRoot,manifest([{...described("f","abc")}])) ,"PACKAGE_CONTENT_MISMATCH");
 assert.equal(await readFile(path.join(longRoot,"f"),"utf8"),"abcd");
 assert.deepEqual(await readdir(longRoot),["f"]);
});

test("rejects nonregular files and hardlinks",async()=>{
 const directoryRoot=await fixture({"present":"x"});
 await mkdir(path.join(directoryRoot,"dir"));
 await expectCode(verifyManagedAcquisitionPackage(directoryRoot,manifest([described("dir","x")])),"PACKAGE_SOURCE_NOT_REGULAR");
 const hardRoot=await fixture({"a":"x"});
 await link(path.join(hardRoot,"a"),path.join(hardRoot,"b"));
 await expectCode(verifyManagedAcquisitionPackage(hardRoot,manifest([described("a","x")])),"PACKAGE_SOURCE_LINKED");
});

test("rejects a linked package root independently",async t=>{
 const root=await fixture({"real/file":"x"});
 const rootLink=`${root}-root-link`;
 try{await symlink(root,rootLink,process.platform==="win32"?"junction":"dir");}
 catch(error){
  if(process.platform==="win32"&&(error as NodeJS.ErrnoException).code==="EPERM"){
   t.skip("Windows root-junction fixture creation unavailable: EPERM");return;
  }
  throw error;
 }
 const linkTarget=await readlink(rootLink);
 await expectVerificationError(
  verifyManagedAcquisitionPackage(rootLink,manifest([described("real/file","x")])),
  "PACKAGE_SOURCE_LINKED",
  `Managed acquisition path is linked: ${rootLink.split(path.sep).join("/")}`,
 );
 assert.equal(await readFile(path.join(root,"real","file"),"utf8"),"x");
 assert.deepEqual(await readdir(root),["real"]);
 assert.deepEqual(await readdir(path.join(root,"real")),["file"]);
 assert.equal((await lstat(rootLink)).isSymbolicLink(),true);
 assert.equal(await readlink(rootLink),linkTarget);
});

test("rejects a file symlink independently",async t=>{
 const root=await fixture({"real":"x"});
 const linked=path.join(root,"linked");
 try{await symlink(path.join(root,"real"),linked,"file");}
 catch(error){
  if(process.platform==="win32"&&(error as NodeJS.ErrnoException).code==="EPERM"){
   t.skip("Windows file-symlink fixture creation unavailable: EPERM");return;
  }
  throw error;
 }
 await expectCode(verifyManagedAcquisitionPackage(root,manifest([described("linked","x")])),"PACKAGE_SOURCE_LINKED");
});

test("rejects an intermediate junction independently",async t=>{
 const root=await fixture({"real/file":"x"});
 const linked=path.join(root,"linked-dir");
 try{await symlink(path.join(root,"real"),linked,process.platform==="win32"?"junction":"dir");}
 catch(error){
  if(process.platform==="win32"&&(error as NodeJS.ErrnoException).code==="EPERM"){
   t.skip("Windows intermediate-junction fixture creation unavailable: EPERM");return;
  }
  throw error;
 }
 await expectCode(verifyManagedAcquisitionPackage(root,manifest([described("linked-dir/file","x")])),"PACKAGE_SOURCE_LINKED");
});

test("rejects an escaping link independently",async t=>{
 const root=await fixture({"inside":"x"});
 const outside=await fixture({"outside":"x"});
 const linked=path.join(root,"escape");
 try{await symlink(path.join(outside,"outside"),linked,"file");}
 catch(error){
  if(process.platform==="win32"&&(error as NodeJS.ErrnoException).code==="EPERM"){
   t.skip("Windows escaping-symlink fixture creation unavailable: EPERM");return;
  }
  throw error;
 }
 await expectCode(verifyManagedAcquisitionPackage(root,manifest([described("escape","x")])),"PACKAGE_SOURCE_LINKED");
});

test("rejects zero and missing path identity",async t=>{
 for(const [name,unsupported] of [["zero",0n],["missing",undefined]] as const){
  await t.test(name,async()=>{
   const root=await fixture({"f":"abc"});
   const stats=await lstat(root,{bigint:true});
   const proto=Object.getPrototypeOf(stats) as {isSymbolicLink:Function};
   const original=proto.isSymbolicLink;
   proto.isSymbolicLink=function(this:unknown,...args:unknown[]){
    // Test-only mutation of the controlled Stats instance.
    (this as {ino:bigint|undefined}).ino=unsupported;
    return original.apply(this,args);
   };
   try{
    await expectVerificationError(
     verifyManagedAcquisitionPackage(root,manifest([described("f","abc")])),
     "PACKAGE_IDENTITY_UNAVAILABLE",
     `Managed acquisition path identity is unavailable: ${root.split(path.sep).join("/")}`,
    );
   }finally{proto.isSymbolicLink=original;}
  });
 }
});

test("rejects zero and missing descriptor identity",async t=>{
 for(const [name,unsupported] of [["zero",0n],["missing",undefined]] as const){
  await t.test(name,async()=>{
   const root=await fixture({"f":"abc"});
   const handle=await open(path.join(root,"f"),"r");
   const proto=Object.getPrototypeOf(handle) as {stat:Function};
   await handle.close();
   const original=proto.stat;
   proto.stat=async function(this:unknown,...args:unknown[]){
    const value=await original.apply(this,args);
    // Test-only mutation of the controlled descriptor Stats instance.
    (value as {ino:bigint|undefined}).ino=unsupported;
    return value;
   };
   try{
    await expectVerificationError(
     verifyManagedAcquisitionPackage(root,manifest([described("f","abc")])),
     "PACKAGE_IDENTITY_UNAVAILABLE",
     "Managed acquisition descriptor identity is unavailable: f",
    );
   }finally{proto.stat=original;}
  });
 }
});

test("accepts a supported identity when only dev is zero",async()=>{
 const root=await fixture({"f":"abc"});
 const stats=await lstat(root,{bigint:true});
 const statsProto=Object.getPrototypeOf(stats) as {isSymbolicLink:Function};
 const originalIsSymbolicLink=statsProto.isSymbolicLink;
 const handle=await open(path.join(root,"f"),"r");
 const handleProto=Object.getPrototypeOf(handle) as {stat:Function};
 await handle.close();
 const originalStat=handleProto.stat;
 statsProto.isSymbolicLink=function(this:unknown,...args:unknown[]){
  // Test-only mutation proves dev zero alone remains supported.
  (this as {dev:bigint}).dev=0n;
  return originalIsSymbolicLink.apply(this,args);
 };
 handleProto.stat=async function(this:unknown,...args:unknown[]){
  const value=await originalStat.apply(this,args);
  // Test-only mutation keeps path and descriptor device identity aligned.
  (value as {dev:bigint}).dev=0n;
  return value;
 };
 try{assert.equal((await verifyManagedAcquisitionPackage(root,manifest([described("f","abc")]))).status,"verified");}
 finally{statsProto.isSymbolicLink=originalIsSymbolicLink;handleProto.stat=originalStat;}
});

test("checks the monotonic budget between lstat and realpath",async()=>{
 const root=await fixture({"f":"abc"});
 const moved=`${root}-moved-before-realpath`;
 const stats=await lstat(root,{bigint:true});
 const statsProto=Object.getPrototypeOf(stats) as {isSymbolicLink:Function};
 const performanceProto=Object.getPrototypeOf(performance) as {now:Function};
 const originalIsSymbolicLink=statsProto.isSymbolicLink;
 const originalNow=performanceProto.now;
 let now=100;
 performanceProto.now=function(){return now;};
 statsProto.isSymbolicLink=function(this:unknown,...args:unknown[]){
  process.getBuiltinModule("fs").renameSync(root,moved);
  now=30101;
  return originalIsSymbolicLink.apply(this,args);
 };
 try{
  await expectVerificationError(
   verifyManagedAcquisitionPackage(root,manifest([described("f","abc")])),
   "PACKAGE_DEADLINE_EXCEEDED",
   "Managed acquisition verification exceeded its cooperative deadline",
  );
 }finally{statsProto.isSymbolicLink=originalIsSymbolicLink;performanceProto.now=originalNow;}
});

test("revalidates root after first close before reading the second file",async()=>{
 const root=await fixture({"a":"alpha","b":"beta"});
 const handle=await open(path.join(root,"a"),"r");
 const proto=Object.getPrototypeOf(handle) as {read:Function};
 await handle.close();
 const originalRead=proto.read;
 const seen=new WeakSet<object>();
 let reads=0;
 let injected=false;
 proto.read=async function(this:unknown,...args:unknown[]){
  reads++;
  const owner=this as object&{close:Function};
  if(!seen.has(owner)){
   seen.add(owner);
   const close=owner.close.bind(owner);
   owner.close=async()=>{await close();if(!injected){injected=true;await writeFile(path.join(root,"injected"),"root-change",{flag:"wx"});await utimes(root,new Date(0),new Date(0));}};
  }
  return originalRead.apply(this,args);
 };
 try{
  await expectCode(
   verifyManagedAcquisitionPackage(root,manifest([described("a","alpha"),described("b","beta")])),
   "PACKAGE_SOURCE_DRIFT",
  );
  assert.equal(reads,2);
  assert.equal(await readFile(path.join(root,"injected"),"utf8"),"root-change");
  assert.equal(await readFile(path.join(root,"b"),"utf8"),"beta");
 }finally{proto.read=originalRead;}
});

test("revalidates relevant ancestors after first close before the next file",async()=>{
 const root=await fixture({"dir/a":"alpha","dir/b":"beta"});
 const handle=await open(path.join(root,"dir/a"),"r");
 const proto=Object.getPrototypeOf(handle) as {read:Function};
 await handle.close();
 const originalRead=proto.read;
 const seen=new WeakSet<object>();
 let reads=0;
 let injected=false;
 proto.read=async function(this:unknown,...args:unknown[]){
  reads++;
  const owner=this as object&{close:Function};
  if(!seen.has(owner)){
   seen.add(owner);
   const close=owner.close.bind(owner);
   owner.close=async()=>{await close();if(!injected){injected=true;await rename(path.join(root,"dir"),path.join(root,"dir-replaced"));await mkdir(path.join(root,"dir"));await writeFile(path.join(root,"dir/b"),"beta",{flag:"wx"});await writeFile(path.join(root,"dir/injected"),"ancestor-change",{flag:"wx"});}};
  }
  return originalRead.apply(this,args);
 };
 try{
  await expectCode(
   verifyManagedAcquisitionPackage(root,manifest([described("dir/a","alpha"),described("dir/b","beta")])),
   "PACKAGE_SOURCE_DRIFT",
  );
  assert.equal(reads,2);
  assert.equal(await readFile(path.join(root,"dir/injected"),"utf8"),"ancestor-change");
  assert.equal(await readFile(path.join(root,"dir/b"),"utf8"),"beta");
 }finally{proto.read=originalRead;}
});

test("detects streaming truncation and growth with bounded requests and closure",async()=>{
 const initial=Buffer.alloc(1024*1024+2,0x61);
 for(const mode of ["truncate","grow"] as const){
  const root=await fixture({"f":initial});
  const file=path.join(root,"f");
  const mutator=await open(file,mode==="truncate"?"r+":"a");
  const probe=await open(file,"r");
  const proto=Object.getPrototypeOf(probe) as {read:Function};
  await probe.close();
  const originalRead=proto.read;
  const requests:number[]=[];
  let mutated=false;
  let closes=0;
  proto.read=async function(this:unknown,buffer:Buffer,offset:number,length:number,position:number|null){
   const owner=this as object&{close:Function};
   if(!mutated){
    const close=owner.close.bind(owner);
    owner.close=async()=>{closes++;return close();};
   }
   requests.push(length);
   const result=await originalRead.call(this,buffer,offset,length,position);
   if(!mutated){
    mutated=true;
    if(mode==="truncate")await mutator.truncate(1024*1024);
    else await mutator.write(Buffer.from("x"));
   }
   return result;
  };
  try{
   const message=mode==="truncate"
    ?"Managed acquisition source ended before its declared size: f"
    :"Managed acquisition source grew beyond its declared size: f";
   await expectVerificationError(
    verifyManagedAcquisitionPackage(root,manifest([described("f",initial)])),
    "PACKAGE_CONTENT_MISMATCH",
    message,
   );
   assert.ok(requests.every(length=>length<=1024*1024));
   assert.equal(requests[0],1024*1024);
   assert.equal(closes,1);
   const after=await readFile(file);
   assert.equal(after.length,mode==="truncate"?1024*1024:initial.length+1);
   assert.equal(after.subarray(0,Math.min(after.length,initial.length)).equals(initial.subarray(0,Math.min(after.length,initial.length))),true);
  }finally{proto.read=originalRead;await mutator.close();}
 }
});

test("detects descriptor mismatch, deterministic drift, and root replacement",async()=>{
 const root=await fixture({"f":"abc"});
 const handle=await open(path.join(root,"f"),"r");const proto=Object.getPrototypeOf(handle) as {read:Function,stat:Function};await handle.close();
 const originalRead=proto.read;let mutated=false;
 proto.read=async function(this:unknown,...args:unknown[]){const result=await originalRead.apply(this,args);if(!mutated){mutated=true;const owner=this as unknown as {close:Function};const close=owner.close.bind(owner);owner.close=async()=>{await close();await writeFile(path.join(root,"f"),"ab");};}return result;};
 try{
  await expectVerificationError(
   verifyManagedAcquisitionPackage(root,manifest([described("f","abc")])),
   "PACKAGE_SOURCE_DRIFT",
   `Managed acquisition path changed during verification: ${path.join(root,"f").split(path.sep).join("/")}`,
  );
  assert.equal(await readFile(path.join(root,"f"),"utf8"),"ab");
  assert.deepEqual(await readdir(root),["f"]);
 }finally{proto.read=originalRead;}
 const descriptorRoot=await fixture({"f":"abc"});const originalStat=proto.stat;
 proto.stat=async function(this:unknown,...args:unknown[]){const value=await originalStat.apply(this,args);(value as {size:bigint}).size=999n;return value;};
 try{await expectCode(verifyManagedAcquisitionPackage(descriptorRoot,manifest([described("f","abc")])),"PACKAGE_SOURCE_DRIFT");}finally{proto.stat=originalStat;}
 const replaceRoot=await fixture({"f":"abc"}),moved=`${replaceRoot}-moved`;
 const originalRead2=proto.read;let replaced=false;
 proto.read=async function(this:unknown,...args:unknown[]){const result=await originalRead2.apply(this,args);if(!replaced){replaced=true;const owner=this as unknown as {close:Function};const close=owner.close.bind(owner);owner.close=async()=>{await close();await rename(replaceRoot,moved);await mkdir(replaceRoot);await writeFile(path.join(replaceRoot,"f"),"abc");};}return result;};
 try{await expectCode(verifyManagedAcquisitionPackage(replaceRoot,manifest([described("f","abc")])),"PACKAGE_SOURCE_DRIFT");}finally{proto.read=originalRead2;}
});

test("closes an owned descriptor exactly once after read failure",async()=>{
 const root=await fixture({"f":"abc"});
 const handle=await open(path.join(root,"f"),"r");const proto=Object.getPrototypeOf(handle) as {read:Function};await handle.close();
 const originalRead=proto.read;let closes=0;
 proto.read=async function(this:unknown){const owner=this as unknown as {close:Function};const close=owner.close.bind(owner);owner.close=async()=>{closes++;return close();};throw Object.assign(new Error("controlled read failure"),{code:"EIO"});};
 try{
  await expectVerificationError(
   verifyManagedAcquisitionPackage(root,manifest([described("f","abc")])),
   "PACKAGE_READ_FAILED",
   "Managed acquisition source could not be read: f",
  );
  assert.equal(closes,1);
  assert.equal(await readFile(path.join(root,"f"),"utf8"),"abc");
  assert.deepEqual(await readdir(root),["f"]);
 }finally{proto.read=originalRead;}
});

test("closes a descriptor acquired immediately before deadline expiry",async()=>{
 const root=await fixture({"f":"abc"});
 const source=path.join(root,"f");
 const fsPromises=process.getBuiltinModule("fs/promises");
 const originalOpen=fsPromises.open;
 const performanceProto=Object.getPrototypeOf(performance) as {now:Function};
 const originalNow=performanceProto.now;
 let now=100;
 let captured:Awaited<ReturnType<typeof open>>|undefined;
 let cleanupClose:(()=>Promise<void>)|undefined;
 let verifierCloses=0;
 performanceProto.now=function(){return now;};
 fsPromises.open=async function(...args:Parameters<typeof open>){
  const handle=await originalOpen(...args);
  captured=handle;
  const close=handle.close.bind(handle);
  cleanupClose=close;
  handle.close=async()=>{verifierCloses++;return close();};
  now=30101;
  return handle;
 };
 syncBuiltinESMExports();
 try{
  await expectVerificationError(
   verifyManagedAcquisitionPackage(root,manifest([described("f","abc")])),
   "PACKAGE_DEADLINE_EXCEEDED",
   "Managed acquisition verification exceeded its cooperative deadline",
  );
  assert.ok(captured);
  assert.equal(verifierCloses,1);
  assert.equal(await readFile(source,"utf8"),"abc");
  assert.deepEqual(await readdir(root),["f"]);
 }finally{
  fsPromises.open=originalOpen;
  syncBuiltinESMExports();
  performanceProto.now=originalNow;
  if(verifierCloses===0&&cleanupClose)await cleanupClose();
 }
});

test("preserves deadline after close advances time and renames the source",async()=>{
 const root=await fixture({"f":"abc"});
 const source=path.join(root,"f");
 const moved=path.join(root,"f-injected-moved");
 const handle=await open(source,"r");
 const proto=Object.getPrototypeOf(handle) as {read:Function};
 await handle.close();
 const performanceProto=Object.getPrototypeOf(performance) as {now:Function};
 const originalNow=performanceProto.now;
 const originalRead=proto.read;
 let now=100;
 let closes=0;
 let wrapped=false;
 performanceProto.now=function(){return now;};
 proto.read=async function(this:unknown,...args:unknown[]){
  const owner=this as unknown as {close:Function};
  if(!wrapped){
   wrapped=true;
   const close=owner.close.bind(owner);
   owner.close=async()=>{closes++;await close();await rename(source,moved);now=30101;};
  }
  return originalRead.apply(this,args);
 };
 try{
  await expectVerificationError(
   verifyManagedAcquisitionPackage(root,manifest([described("f","abc")])),
   "PACKAGE_DEADLINE_EXCEEDED",
   "Managed acquisition verification exceeded its cooperative deadline",
  );
  assert.equal(closes,1);
  assert.equal(await readFile(moved,"utf8"),"abc");
  assert.deepEqual(await readdir(root),["f-injected-moved"]);
 }finally{performanceProto.now=originalNow;proto.read=originalRead;}
});
