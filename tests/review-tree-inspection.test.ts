import assert from "node:assert/strict";
import {execFileSync,spawnSync} from "node:child_process";
import {createHash} from "node:crypto";
import {
 chmodSync,lstatSync,mkdirSync,readFileSync,readdirSync,realpathSync,rmSync,writeFileSync,
} from "node:fs";
import {join,resolve,sep} from "node:path";
import {pathToFileURL} from "node:url";
import test from "node:test";
import {inspectCandidateGitTree,type CandidateGitTreeManifest} from "../src/review/review-tree-inspection.js";

let sequence=0;
const cacheRoot=resolve(".cache");
const inspectionTemp=resolve(".cache/t05-a2inspection-correction/tmp");
mkdirSync(inspectionTemp,{recursive:true});
for(const key of ["TEMP","TMP","TMPDIR"])process.env[key]=inspectionTemp;

function fixture(t:{after(callback:()=>void):void},name="repo"):{root:string;git:(...args:string[])=>string}{
 sequence+=1;
 const root=join(cacheRoot,`a2c-${process.pid}-${sequence}`,name);
 mkdirSync(root,{recursive:true});
 const owner=resolve(root,"..");
 t.after(()=>{
  try{rmSync(owner,{recursive:true,force:true});}
  catch(error){if(!["EPERM","ENOTEMPTY"].includes((error as NodeJS.ErrnoException).code??""))throw error;}
 });
 const git=(...args:string[]):string=>execFileSync("git",["-C",root,...args],{encoding:"utf8",stdio:["ignore","pipe","pipe"],timeout:10_000}).trim();
 git("init","-q");
 git("config","user.name","ASEN Test");
 git("config","user.email","test@example.invalid");
 return {root:realpathSync(root),git};
}
function commitFixture(t:{after(callback:()=>void):void}){
 const value=fixture(t);
 writeFileSync(join(value.root,"alpha.txt"),"alpha\n");
 mkdirSync(join(value.root,"nested"));
 writeFileSync(join(value.root,"nested","binary.bin"),Buffer.from([0,255,1,128,10]));
 writeFileSync(join(value.root,"run.sh"),"#!/bin/sh\necho ok\n");
 value.git("add",".");
 value.git("update-index","--chmod=+x","run.sh");
 value.git("commit","-q","-m","base");
 return value;
}
function inspect(root:string,treeIdentity:string):CandidateGitTreeManifest{
 return inspectCandidateGitTree({repositoryRoot:root,treeIdentity});
}
function ownedObjectPath(root:string,git:(...args:string[])=>string,objectId:string):string{
 const objects=realpathSync(resolve(root,git("rev-parse","--path-format=absolute","--git-path","objects")));
 const target=resolve(objects,objectId.slice(0,2),objectId.slice(2));
 const ownerPrefix=`${resolve(root,"..")}${sep}`;
 assert.equal(target.startsWith(`${objects}${sep}`),true,"corruption target must stay inside the owned fixture object store");
 assert.equal(objects.startsWith(ownerPrefix),true,"object store must stay inside the owned fixture");
 return target;
}
function state(root:string,git:(...args:string[])=>string){
 const sourcePaths=["alpha.txt","nested/binary.bin","run.sh"];
 return {
  head:git("rev-parse","HEAD"),
  index:readFileSync(git("rev-parse","--path-format=absolute","--git-path","index")),
  refs:git("show-ref"),
  config:readFileSync(git("rev-parse","--path-format=absolute","--git-path","config")),
  sources:sourcePaths.map(path=>({path,bytes:readFileSync(join(root,path)),mode:lstatSync(join(root,path)).mode})),
  objects:git("count-objects","-v"),
 };
}
function assertState(root:string,git:(...args:string[])=>string,before:ReturnType<typeof state>){
 assert.equal(git("rev-parse","HEAD"),before.head);
 assert.deepEqual(readFileSync(git("rev-parse","--path-format=absolute","--git-path","index")),before.index);
 assert.equal(git("show-ref"),before.refs);
 assert.deepEqual(readFileSync(git("rev-parse","--path-format=absolute","--git-path","config")),before.config);
 for(const source of before.sources){
  assert.deepEqual(readFileSync(join(root,source.path)),source.bytes);
  assert.equal(lstatSync(join(root,source.path)).mode,source.mode);
 }
 assert.equal(git("count-objects","-v"),before.objects);
}

test("inspects exact binary bytes, modes, nested trees, hashes, and sorted deeply frozen data",t=>{
 const {root,git}=commitFixture(t);
 const tree=git("rev-parse","HEAD^{tree}");
 const before=state(root,git);
 const manifest=inspect(root,tree);
 assert.equal(manifest.schemaVersion,1);
 assert.equal(manifest.repositoryRoot,root);
 assert.equal(manifest.gitDirectory,realpathSync(join(root,".git")));
 assert.equal(manifest.objectFormat,"sha1");
 assert.equal(manifest.treeIdentity,tree);
 const rawTree=execFileSync("git",["-C",root,"cat-file","tree",tree]);
 assert.equal(manifest.treeSize,rawTree.length);
 assert.equal(manifest.treeSha256,createHash("sha256").update(rawTree).digest("hex"));
 assert.deepEqual(manifest.entries.map(entry=>entry.path),["alpha.txt","nested/binary.bin","run.sh"]);
 assert.deepEqual(manifest.entries.map(entry=>entry.mode),["100644","100644","100755"]);
 const binary=manifest.entries[1]!;
 assert.equal(binary.kind,"regular");
 assert.equal(binary.size,5);
 assert.equal(binary.bytesBase64,Buffer.from([0,255,1,128,10]).toString("base64"));
 assert.equal(binary.contentSha256,createHash("sha256").update(Buffer.from([0,255,1,128,10])).digest("hex"));
 assert(Object.isFrozen(manifest));
 assert(Object.isFrozen(manifest.entries));
 assert(manifest.entries.every(Object.isFrozen));
 assert.throws(()=>{(manifest.entries as unknown as {path:string}[])[0]!.path="changed";},TypeError);
 assertState(root,git,before);
});

test("classifies raw symlink blobs and gitlinks without OS symlink privileges or traversal",t=>{
 const {root,git}=commitFixture(t);
 const payload=Buffer.from("../outside-target");
 const linkBlob=execFileSync("git",["-C",root,"hash-object","-w","--stdin"],{input:payload,encoding:"utf8"}).trim();
 git("update-index","--add","--cacheinfo",`120000,${linkBlob},link`);
 const linkedCommit=git("rev-parse","HEAD");
 git("update-index","--add","--cacheinfo",`160000,${linkedCommit},linked`);
 const tree=git("write-tree"),manifest=inspect(root,tree);
 assert.deepEqual(manifest.entries.find(entry=>entry.path==="link"),{
  path:"link",kind:"symlink",mode:"120000",objectId:linkBlob,size:payload.length,
  contentSha256:createHash("sha256").update(payload).digest("hex"),bytesBase64:payload.toString("base64"),
 });
 assert.deepEqual(manifest.entries.find(entry=>entry.path==="linked"),{
  path:"linked",kind:"gitlink",mode:"160000",objectId:linkedCommit,size:null,contentSha256:null,bytesBase64:null,
 });
});

test("rejects malformed exact descriptors before repository effects and preserves input",t=>{
 const {root,git}=commitFixture(t);
 const tree=git("rev-parse","HEAD^{tree}");
 const before=state(root,git);
 const valid={repositoryRoot:root,treeIdentity:tree};
 const cases:unknown[]=[null,[],{},
  {repositoryRoot:root,treeIdentity:tree,extra:true},
  {repositoryRoot:root},
  {repositoryRoot:root,treeIdentity:"abc"},
  {repositoryRoot:root,treeIdentity:"g".repeat(40)},
  Object.create({repositoryRoot:root,treeIdentity:tree}),
  new Proxy(valid,{get(){throw new Error("getter invoked");}}),
 ];
 const accessor=Object.create(Object.prototype);
 Object.defineProperties(accessor,{repositoryRoot:{enumerable:true,get(){throw new Error("getter invoked");}},treeIdentity:{enumerable:true,value:tree}});
 cases.push(accessor);
 for(const candidate of cases)assert.throws(()=>inspectCandidateGitTree(candidate),/plain data|descriptor|identity|invalid/u);
 assert.deepEqual(valid,{repositoryRoot:root,treeIdentity:tree});
 assertState(root,git,before);
});

test("rejects noncanonical roots, missing objects, and portable-name violations without repository mutation",t=>{
 const {root,git}=commitFixture(t);
 const tree=git("rev-parse","HEAD^{tree}");
 assert.throws(()=>inspect(`${root}/.`,tree),/canonical/u);
 assert.throws(()=>inspect(root,"f".repeat(40)),/object|tree/u);
 const blob=git("hash-object","-w","--stdin");
 const unsafeTree=execFileSync("git",["-C",root,"mktree","-z"],{input:Buffer.from(`100644 blob ${blob}\tCON.txt\0`),encoding:"utf8"}).trim();
 const before=state(root,git);
 assert.throws(()=>inspect(root,unsafeTree),/portable|unsafe/u);
 assertState(root,git,before);
 const corrupt=execFileSync("git",["-C",root,"hash-object","-w","--stdin"],{input:Buffer.from(`corrupt-target-${process.pid}`),encoding:"utf8"}).trim();
 const corruptTree=execFileSync("git",["-C",root,"mktree","-z"],{input:Buffer.from(`100644 blob ${corrupt}\tcorrupt.txt\0`),encoding:"utf8"}).trim();
 const objectPath=ownedObjectPath(root,git,corrupt);
 chmodSync(objectPath,0o600);
 writeFileSync(objectPath,"not a zlib object");
 assert.throws(()=>inspect(root,corruptTree),/object|Git inspection command/u);
});

test("rejects unsafe and aliased empty directory paths",t=>{
 const {root}=commitFixture(t);
 const emptyTree=execFileSync("git",["-C",root,"mktree"],{input:Buffer.alloc(0),encoding:"utf8"}).trim();
 const makeTree=(records:string[])=>execFileSync("git",["-C",root,"mktree","-z"],{
  input:Buffer.from(records.join("")),encoding:"utf8",
 }).trim();
 const reserved=makeTree([`040000 tree ${emptyTree}\tCON\0`]);
 assert.throws(()=>inspect(root,reserved),/portable|unsafe/u);
 const aliases=makeTree([
  `040000 tree ${emptyTree}\tAlpha\0`,
  `040000 tree ${emptyTree}\talpha\0`,
 ]);
 assert.throws(()=>inspect(root,aliases),/alias|overlap|portable|unsafe/u);
});

test("rejects missing and corrupt recursively visited subtree objects",t=>{
 const {root,git}=commitFixture(t);
 const missing="f".repeat(40);
 const missingRoot=execFileSync("git",["-C",root,"mktree","--missing","-z"],{
  input:Buffer.from(`040000 tree ${missing}\tmissing-subtree\0`),encoding:"utf8",
 }).trim();
 assert.throws(()=>inspect(root,missingRoot),/Git inspection command|object|missing/u);
 const leaf=execFileSync("git",["-C",root,"hash-object","-w","--stdin"],{input:Buffer.from("nested\n"),encoding:"utf8"}).trim();
 const subtree=execFileSync("git",["-C",root,"mktree","-z"],{
  input:Buffer.from(`100644 blob ${leaf}\tleaf.txt\0`),encoding:"utf8",
 }).trim();
 const corruptRoot=execFileSync("git",["-C",root,"mktree","-z"],{
  input:Buffer.from(`040000 tree ${subtree}\tcorrupt-subtree\0`),encoding:"utf8",
 }).trim();
 const target=ownedObjectPath(root,git,subtree);
 chmodSync(target,0o600);
 writeFileSync(target,"corrupt subtree object");
 assert.throws(()=>inspect(root,corruptRoot),/Git inspection command|object|corrupt/u);
});

test("supports a linked worktree while binding its pointer relationship",t=>{
 const main=commitFixture(t),owner=resolve(main.root,".."),linked=join(owner,"linked");
 main.git("worktree","add","-q","--detach",linked,"HEAD");
 const linkedRoot=realpathSync(linked);
 const tree=execFileSync("git",["-C",linkedRoot,"rev-parse","HEAD^{tree}"],{encoding:"utf8"}).trim();
 const manifest=inspect(linkedRoot,tree);
 assert.equal(manifest.repositoryRoot,linkedRoot);
 assert.match(manifest.gitDirectory,/[/\\]worktrees[/\\]/u);
 assert.deepEqual(manifest.entries.map(entry=>entry.path),["alpha.txt","nested/binary.bin","run.sh"]);
});

test("rejects linked-worktree .git pointer rebinding while root and original target stay stable",t=>{
 const main=commitFixture(t),owner=resolve(main.root,".."),linked=join(owner,"linked");
 main.git("worktree","add","-q","--detach",linked,"HEAD");
 const linkedRoot=realpathSync(linked),pointer=join(linkedRoot,".git");
 const originalPointer=readFileSync(pointer),originalGitDirectory=realpathSync(originalPointer.toString("utf8").trim().slice("gitdir: ".length));
 const tree=execFileSync("git",["-C",linkedRoot,"rev-parse","HEAD^{tree}"],{encoding:"utf8"}).trim();
 const preload=join(owner,"rebind-pointer.cjs"),runner=join(owner,"run-pointer.mjs");
 writeFileSync(preload,`const cp=require('node:child_process');const fs=require('node:fs');const mod=require('node:module');const original=cp.spawnSync;let done=false;cp.spawnSync=function(file,args,options){const result=original.apply(this,arguments);if(!done&&Array.isArray(args)&&args.includes('--show-toplevel')){done=true;fs.renameSync(${JSON.stringify(pointer)},${JSON.stringify(`${pointer}.original`)});fs.writeFileSync(${JSON.stringify(pointer)},'gitdir: '+${JSON.stringify(join(main.root,".git"))}+'\\n');}return result;};mod.syncBuiltinESMExports();\n`);
 writeFileSync(runner,`import {inspectCandidateGitTree} from ${JSON.stringify(pathToFileURL(resolve("src/review/review-tree-inspection.ts")).href)};try{inspectCandidateGitTree({repositoryRoot:${JSON.stringify(linkedRoot)},treeIdentity:${JSON.stringify(tree)}});process.exitCode=9;}catch(error){console.error(String(error));}\n`);
 const result=spawnSync(process.execPath,["--require",preload,"--import","tsx",runner],{encoding:"utf8",env:process.env,timeout:20_000});
 assert.equal(result.status,0,result.stderr);
 assert.match(result.stderr,/pointer|relationship|changed|identity/u);
 assert.equal(lstatSync(linkedRoot).isDirectory(),true);
 assert.equal(lstatSync(originalGitDirectory).isDirectory(),true);
});

test("enforces one monotonic operation deadline and shrinks subprocess timeouts",t=>{
 const {root,git}=commitFixture(t),tree=git("rev-parse","HEAD^{tree}"),owner=resolve(root,"..");
 const preload=join(owner,"deadline.cjs"),runner=join(owner,"run-deadline.mjs"),log=join(owner,"timeouts.json");
 writeFileSync(preload,`const cp=require('node:child_process');const mod=require('node:module');let now=0n;process.hrtime.bigint=()=>now;const original=cp.spawnSync;const values=[];cp.spawnSync=function(file,args,options){values.push(options.timeout);const result=original.apply(this,arguments);now+=6000000000n;require('node:fs').writeFileSync(${JSON.stringify(log)},JSON.stringify(values));return result;};mod.syncBuiltinESMExports();\n`);
 writeFileSync(runner,`import {inspectCandidateGitTree} from ${JSON.stringify(pathToFileURL(resolve("src/review/review-tree-inspection.ts")).href)};try{inspectCandidateGitTree({repositoryRoot:${JSON.stringify(root)},treeIdentity:${JSON.stringify(tree)}});process.exitCode=9;}catch(error){console.error(String(error));}\n`);
 const result=spawnSync(process.execPath,["--require",preload,"--import","tsx",runner],{encoding:"utf8",env:process.env,timeout:20_000});
 assert.equal(result.status,0,result.stderr);
 assert.match(result.stderr,/deadline|time budget/u);
 let timeouts:unknown;
 try{timeouts=JSON.parse(readFileSync(log,"utf8"));}catch(error){assert.fail(`Invalid timeout evidence: ${String(error)}`);}
 assert(Array.isArray(timeouts));
 assert(timeouts.length>=2);
 assert.equal(timeouts[0],10_000);
 assert(timeouts.some((value,index)=>index>0&&value<timeouts[index-1]!));
});

test("retains nonempty or physically replaced scratch without deleting uncertain data",t=>{
 for(const mode of ["nonempty","replaced"] as const){
  const {root,git}=commitFixture(t),tree=git("rev-parse","HEAD^{tree}"),owner=resolve(root,"..");
  const preload=join(owner,`scratch-${mode}.cjs`),runner=join(owner,`run-scratch-${mode}.mjs`),log=join(owner,`scratch-${mode}.txt`);
  writeFileSync(preload,`const cp=require('node:child_process');const fs=require('node:fs');const mod=require('node:module');const original=cp.spawnSync;let done=false;cp.spawnSync=function(file,args,options){const result=original.apply(this,arguments);if(!done){const setting=args.find(value=>typeof value==='string'&&value.startsWith('core.hooksPath='));if(setting){done=true;const scratch=setting.slice('core.hooksPath='.length);${mode==="nonempty"?"fs.writeFileSync(require('node:path').join(scratch,'foreign.txt'),'foreign');":"fs.renameSync(scratch,scratch+'-original');fs.mkdirSync(scratch);"}fs.writeFileSync(${JSON.stringify(log)},scratch);}}return result;};mod.syncBuiltinESMExports();\n`);
  writeFileSync(runner,`import {inspectCandidateGitTree} from ${JSON.stringify(pathToFileURL(resolve("src/review/review-tree-inspection.ts")).href)};try{inspectCandidateGitTree({repositoryRoot:${JSON.stringify(root)},treeIdentity:${JSON.stringify(tree)}});process.exitCode=9;}catch(error){console.error(String(error));}\n`);
  const result=spawnSync(process.execPath,["--require",preload,"--import","tsx",runner],{encoding:"utf8",env:process.env,timeout:20_000});
  assert.equal(result.status,0,result.stderr);
  assert.match(result.stderr,/scratch ownership is uncertain/u);
  const scratch=readFileSync(log,"utf8");
  assert.equal(lstatSync(scratch).isDirectory(),true);
  if(mode==="nonempty")assert.equal(readFileSync(join(scratch,"foreign.txt"),"utf8"),"foreign");
  else assert.equal(lstatSync(`${scratch}-original`).isDirectory(),true);
 }
});

for(const kind of ["filter","hooks","fsmonitor","external-diff"] as const){
 test(`isolates repository ${kind} after its positive control`,t=>{
  const configure=(root:string,git:(...args:string[])=>string,marker:string,invoke:boolean)=>{
   const probe=join(root,`${kind}.cjs`);
   const quote=(value:string)=>`'${value.replaceAll("\\","/").replaceAll("'","'\\''")}'`;
   let output="";
   if(kind==="filter")output="process.stdout.write(require('node:fs').readFileSync(0));";
   if(kind==="fsmonitor")output="process.stdout.write('token\\0');";
   writeFileSync(probe,`require('node:fs').appendFileSync(${JSON.stringify(marker)},'called\\n');${output}\n`);
   const command=`${quote(process.execPath)} ${quote(probe)}`;
   if(kind==="filter"){
    writeFileSync(join(root,".gitattributes"),"alpha.txt filter=fixture\n");git("config","filter.fixture.clean",command);if(invoke)git("hash-object","--path=alpha.txt","alpha.txt");
   }else if(kind==="hooks"){
    const hooks=join(root,"hooks");mkdirSync(hooks);const hook=join(hooks,"post-index-change");writeFileSync(hook,`#!/bin/sh\nexec ${command}\n`);if(process.platform!=="win32")chmodSync(hook,0o700);git("config","core.hooksPath",hooks);if(invoke)git("hook","run","post-index-change");
   }else if(kind==="fsmonitor"){
    git("config","core.fsmonitor",command);git("config","core.fsmonitorHookVersion","2");if(invoke)git("status","--porcelain");
   }else{
    git("config","diff.external",command);writeFileSync(join(root,"alpha.txt"),"changed\n");if(invoke)git("diff","--ext-diff","--","alpha.txt");
   }
  };
  const control=commitFixture(t),controlMarker=join(control.root,`${kind}.marker`);
  configure(control.root,control.git,controlMarker,true);
  assert.match(readFileSync(controlMarker,"utf8"),/called/u);
  const candidate=commitFixture(t),candidateMarker=join(candidate.root,`${kind}.marker`);
  const candidateTree=candidate.git("rev-parse","HEAD^{tree}");
  configure(candidate.root,candidate.git,candidateMarker,false);
  inspect(candidate.root,candidateTree);
  assert.equal(lstatSync(candidateMarker,{throwIfNoEntry:false}),undefined);
 });
}

test("bounds aggregate retained binary and base64 data",t=>{
 const {root,git}=commitFixture(t);
 const large=Buffer.alloc(8*1024*1024,0x61);
 const largePath=join(root,"large.bin");
 const largeHash=createHash("sha256").update(large).digest("hex");
 writeFileSync(largePath,large);
 assert.equal(lstatSync(largePath).size,large.length);
 git("add","large.bin");
 git("commit","-q","-m","large blob");
 const before=state(root,git);
 assert.throws(
  ()=>inspect(root,git("rev-parse","HEAD^{tree}")),
  /aggregate inspection bounds/u,
 );
 assert.equal(createHash("sha256").update(readFileSync(largePath)).digest("hex"),largeHash);
 assertState(root,git,before);
});

test("removes owned empty hook scratch after success and failure",t=>{
 const {root,git}=commitFixture(t);
 const before=[...readdirSync(inspectionTemp)].sort();
 inspect(root,git("rev-parse","HEAD^{tree}"));
 assert.deepEqual([...readdirSync(inspectionTemp)].sort(),before);
 assert.throws(
  ()=>inspect(root,"f".repeat(40)),
  /object|tree/u,
 );
 assert.deepEqual([...readdirSync(inspectionTemp)].sort(),before);
});

test("fails closed when the physical repository root is replaced during real Git execution",t=>{
 const {root,git}=commitFixture(t);
 const tree=git("rev-parse","HEAD^{tree}");
 const owner=resolve(root,"..");
 const preload=join(owner,"replace.cjs"),runner=join(owner,"run.mjs"),replacement=join(owner,"replacement");
 mkdirSync(replacement);
 writeFileSync(preload,`const cp=require('node:child_process');const fs=require('node:fs');const mod=require('node:module');const original=cp.spawnSync;let done=false;cp.spawnSync=function(file,args,options){const value=original.apply(this,arguments);if(!done&&Array.isArray(args)&&args.includes('--show-toplevel')){done=true;fs.renameSync(${JSON.stringify(root)},${JSON.stringify(`${root}-old`)});fs.renameSync(${JSON.stringify(replacement)},${JSON.stringify(root)});}return value;};mod.syncBuiltinESMExports();\n`);
 writeFileSync(runner,`import {inspectCandidateGitTree} from ${JSON.stringify(pathToFileURL(resolve("src/review/review-tree-inspection.ts")).href)};try{inspectCandidateGitTree({repositoryRoot:${JSON.stringify(root)},treeIdentity:${JSON.stringify(tree)}});process.exitCode=9;}catch(error){console.error(String(error));}\n`);
 const result=spawnSync(process.execPath,["--require",preload,"--import","tsx",runner],{encoding:"utf8",env:process.env,timeout:20_000});
 assert.equal(result.status,0,result.stderr);
 assert.match(result.stderr,/changed|identity|repository/u);
 assert.equal(lstatSync(root).isDirectory(),true);
});

test("fails closed when the physical Git directory is replaced during real Git execution",t=>{
 const {root,git}=commitFixture(t),tree=git("rev-parse","HEAD^{tree}");
 const owner=resolve(root,".."),gitDirectory=join(root,".git"),oldGit=join(owner,"git-old"),replacement=join(owner,"git-replacement");
 const preload=join(owner,"replace-gitdir.cjs"),runner=join(owner,"run-gitdir.mjs");
 mkdirSync(replacement);
 writeFileSync(preload,`const cp=require('node:child_process');const fs=require('node:fs');const mod=require('node:module');const original=cp.spawnSync;let done=false;cp.spawnSync=function(file,args,options){const value=original.apply(this,arguments);if(!done&&Array.isArray(args)&&args.includes('cat-file')&&args.includes('-t')){done=true;fs.renameSync(${JSON.stringify(gitDirectory)},${JSON.stringify(oldGit)});fs.renameSync(${JSON.stringify(replacement)},${JSON.stringify(gitDirectory)});}return value;};mod.syncBuiltinESMExports();\n`);
 writeFileSync(runner,`import {inspectCandidateGitTree} from ${JSON.stringify(pathToFileURL(resolve("src/review/review-tree-inspection.ts")).href)};try{inspectCandidateGitTree({repositoryRoot:${JSON.stringify(root)},treeIdentity:${JSON.stringify(tree)}});process.exitCode=9;}catch(error){console.error(String(error));}\n`);
 const result=spawnSync(process.execPath,["--require",preload,"--import","tsx",runner],{encoding:"utf8",env:process.env,timeout:20_000});
 assert.equal(result.status,0,result.stderr);
 assert.match(result.stderr,/changed|identity|repository/u);
});

test("does not lazily fetch a missing promisor blob or invoke local transport",t=>{
 const source=fixture(t,"source");
 writeFileSync(join(source.root,"kept.txt"),"kept\n");
 writeFileSync(join(source.root,"missing.txt"),"missing payload\n");
 source.git("add",".");source.git("commit","-q","-m","promisor source");
 const owner=resolve(source.root,".."),remote=join(owner,"remote.git"),marker=join(owner,"transport.marker"),wrapper=join(owner,"upload-pack.cjs");
 execFileSync("git",["clone","-q","--bare",source.root,remote]);
 execFileSync("git",["-C",remote,"config","uploadpack.allowFilter","true"]);
 writeFileSync(wrapper,`require('node:fs').appendFileSync(${JSON.stringify(marker)},'called\\n');const {spawnSync}=require('node:child_process');const r=spawnSync('git-upload-pack',process.argv.slice(2),{stdio:'inherit'});process.exit(r.status??1);\n`);
 const quote=(value:string)=>`'${value.replaceAll("\\","/").replaceAll("'","'\\''")}'`;
 const upload=`${quote(process.execPath)} ${quote(wrapper)}`;
 const makeClone=(name:string)=>{
  const root=join(owner,name);
  execFileSync("git",["clone","-q","--filter=blob:none","--no-checkout","--upload-pack",upload,pathToFileURL(remote).href,root],{timeout:20_000});
  const git=(...args:string[])=>execFileSync("git",["-C",root,...args],{encoding:"utf8",stdio:["ignore","pipe","pipe"],timeout:20_000}).trim();
  git("config","remote.origin.promisor","true");git("config","remote.origin.partialclonefilter","blob:none");git("config","remote.origin.uploadpack",upload);
  return {root:realpathSync(root),git};
 };
 const control=makeClone("control"),missing=control.git("rev-parse","HEAD:missing.txt");
 assert.match(control.git("rev-list","--objects","--missing=print","HEAD"),new RegExp(`\\?${missing}`));
 const beforePositive=readFileSync(marker,"utf8");
 assert.equal(control.git("cat-file","-e",`${missing}^{blob}`),"");
 assert.notEqual(readFileSync(marker,"utf8"),beforePositive,"ordinary Git must invoke the local transport positive control");
 const candidate=makeClone("candidate"),tree=candidate.git("rev-parse","HEAD^{tree}"),candidateMissing=candidate.git("rev-parse","HEAD:missing.txt");
 assert.match(candidate.git("rev-list","--objects","--missing=print","HEAD"),new RegExp(`\\?${candidateMissing}`));
 const beforeInspection=readFileSync(marker,"utf8");
 assert.throws(()=>inspect(candidate.root,tree),/object|missing|promisor|transport|protocol/u);
 assert.equal(readFileSync(marker,"utf8"),beforeInspection);
 assert.match(candidate.git("rev-list","--objects","--missing=print","HEAD"),new RegExp(`\\?${candidateMissing}`));
});
// Fixtures are confined to the authorized project-local cache surface.
