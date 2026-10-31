import assert from "node:assert/strict";
import {readFile,readdir,rename,rm,stat,symlink,writeFile,mkdir,mkdtemp} from "node:fs/promises";
import {tmpdir} from "node:os";
import {isAbsolute,join} from "node:path";
import test,{type TestContext} from "node:test";
import {createProjectMemoryBackup} from "../src/memory/project-memory-backup.js";
import {SqliteMemoryStore} from "../src/memory/sqlite-store.js";
import type {MemoryExport} from "../src/memory/types.js";

const MODULE_URL=new URL("../src/memory/project-memory-restore-stage.js",import.meta.url);
const RESULT_SCHEMA="asen.project-memory-restore-stage-result/v1",MODE="new-empty-stage" as const,MAX_BYTES=16*1024*1024;
type Stage="read-open"|"read-read"|"read-verify-source"|"create-directory"|"open-store"|"import"|"verify-import"|"close-imported"|"reopen-store"|"verify-reopen"|"close-reopened";
type Context={source:string;stagingDirectory:string;databasePath:string};
type Hooks={before?:(stage:Stage,context:Context)=>void|Promise<void>;after?:(stage:Stage,context:Context)=>void|Promise<void>};
type Reason="invalid-request"|"aborted"|"unsafe-staging-path"|"staging-exists"|"backup-refused"|"staging-parent-changed"|"stage-create-failed"|"stage-ownership-uncertain"|"store-create-failed"|"import-failed"|"verification-failed"|"close-failed"|"reopen-failed";
type Result={schema:string;status:"staged"|"refused"|"failed"|"unknown";source:string;expectedProjectId:string;stagingDirectory:string;mode:string;databasePath:string|null;ownership:"none"|"owned-retained"|"unknown";reason:Reason|null;backupReason:string|null};
type Request={source:string;expectedProjectId:string;stagingDirectory:string;mode:typeof MODE;signal?:AbortSignal;hooks?:Hooks};
type StageRestore=(request:Request)=>Promise<Result>;

async function api():Promise<StageRestore>{
 let loaded:Record<string,unknown>={};
 try{loaded=await import(MODULE_URL.href) as Record<string,unknown>;}catch(error){if(!(typeof error==="object"&&error!==null&&"code" in error&&"message" in error&&error.code==="ERR_MODULE_NOT_FOUND"&&String(error.message).includes("project-memory-restore-stage")))throw error;}
 assert.equal(typeof loaded.stageProjectMemoryBackupRestore,"function","project-memory restore stage capability missing");
 return loaded.stageProjectMemoryBackupRestore as StageRestore;
}
async function root(t:TestContext,prefix:string){const directory=await mkdtemp(join(tmpdir(),prefix));t.after(()=>rm(directory,{recursive:true,force:true}));return directory;}
function payload(projectId="project-a"):MemoryExport{return {version:1,projectId,observations:[{id:"a",projectId,sessionId:"root",kind:"decision",topic:"restore",content:"alpha searchable",createdAt:"2026-01-01T00:00:00.000Z",pinned:true,title:"Alpha",scope:"project",toolName:"mem_save",topicKey:"restore",revisionCount:2,duplicateCount:1,lastSeenAt:"2026-01-02T00:00:00.000Z",updatedAt:"2026-01-02T00:00:00.000Z"},{id:"b",projectId,sessionId:"child",kind:"observation",content:"beta",createdAt:"2026-01-03T00:00:00.000Z"}],relations:[{id:"r",sourceId:"a",targetId:"b",relation:"related",projectId,createdAt:"2026-01-04T00:00:00.000Z",reviewedAt:"2026-01-05T00:00:00.000Z"}],summaries:[{projectId,sessionId:"root",content:"complete",createdAt:"2026-01-06T00:00:00.000Z"}],sessions:[{projectId,sessionId:"child",rootSessionId:"root",parentSessionId:"root",status:"live"},{projectId,sessionId:"root",rootSessionId:"root",status:"ended"}],deletions:[{id:"hard",projectId,deletedAt:"2026-01-08T00:00:00.000Z",mode:"hard"},{id:"soft",projectId,deletedAt:"2026-01-07T00:00:00.000Z",mode:"soft",item:{id:"soft",projectId,sessionId:"child",kind:"decision",content:"deleted",createdAt:"2026-01-03T00:00:00.000Z"}}]};}
function nonRoundtrippablePayload(projectId="project-a"):MemoryExport{const value=payload(projectId);return {...value,sessions:[...value.sessions!].reverse(),deletions:[...value.deletions!].reverse()};}
async function backup(directory:string,value:MemoryExport=payload()){const source=join(directory,"backup.json");const result=await createProjectMemoryBackup({store:{exportProject(){return value;}},projectId:value.projectId,destination:source,createdAt:"2026-10-16T12:34:56.000Z"});assert.equal(result.status,"created");return source;}
async function snapshotFile(source:string){const info=await stat(source);return {bytes:await readFile(source),mtimeMs:info.mtimeMs,siblings:(await readdir(join(source,".."))).sort()};}
async function assertFileUnchanged(source:string,before:Awaited<ReturnType<typeof snapshotFile>>){const after=await snapshotFile(source);assert.deepEqual(after.bytes,before.bytes);assert.equal(after.mtimeMs,before.mtimeMs);assert.deepEqual(after.siblings,before.siblings);}
function refused(request:Request,reason:Reason,backupReason:string|null=null):Result{return {schema:RESULT_SCHEMA,status:"refused",source:request.source,expectedProjectId:request.expectedProjectId,stagingDirectory:request.stagingDirectory,mode:request.mode,databasePath:null,ownership:"none",reason,backupReason};}
function retained(request:Request,reason:Reason):Result{return {...refused(request,reason),status:"failed",databasePath:join(request.stagingDirectory,"memory.db"),ownership:"owned-retained"};}

 test("stages a writer-produced full backup, closes and reopens it, and preserves canonical equality",async t=>{
 const stage=await api(),directory=await root(t,"asen-restore-stage-success-"),sourceDirectory=join(directory,"source"),stagingParent=join(directory,"staging-root");await mkdir(sourceDirectory);await mkdir(stagingParent);const source=await backup(sourceDirectory),sourceBefore=await snapshotFile(source),stagingDirectory=join(stagingParent,"stage"),request={source,expectedProjectId:"project-a",stagingDirectory,mode:MODE},stages:string[]=[];
 const result=await stage({...request,hooks:{before(current,context){assert.deepEqual(context,{source,stagingDirectory,databasePath:join(stagingDirectory,"memory.db")});stages.push(`before:${current}`);},after(current){stages.push(`after:${current}`);}}});
 assert.deepEqual(result,{schema:RESULT_SCHEMA,status:"staged",source,expectedProjectId:"project-a",stagingDirectory,mode:MODE,databasePath:join(stagingDirectory,"memory.db"),ownership:"owned-retained",reason:null,backupReason:null});assert.equal(isAbsolute(result.databasePath!),true);
 assert.deepEqual(stages,["before:read-open","after:read-open","before:read-read","after:read-read","before:read-verify-source","after:read-verify-source","before:create-directory","after:create-directory","before:open-store","after:open-store","before:import","after:import","before:verify-import","after:verify-import","before:close-imported","after:close-imported","before:reopen-store","after:reopen-store","before:verify-reopen","after:verify-reopen","before:close-reopened","after:close-reopened"]);
 const reopened=new SqliteMemoryStore(result.databasePath!);try{assert.deepEqual(reopened.exportProject("project-a"),payload());assert.equal(reopened.search("project-a","searchable").length,1);assert.deepEqual(reopened.exportProject("foreign"),{version:1,projectId:"foreign",observations:[],relations:[],summaries:[],sessions:[],deletions:[]});}finally{reopened.close();}await assertFileUnchanged(source,sourceBefore);assert.deepEqual(await readdir(stagingParent),["stage"]);assert.deepEqual((await readdir(directory)).sort(),["source","staging-root"]);
});

test("refuses a valid backup whose array order cannot roundtrip through the canonical store export",async t=>{
 const stage=await api(),directory=await root(t,"asen-restore-stage-nonroundtrip-"),sourceDirectory=join(directory,"source"),stagingParent=join(directory,"staging-root");await mkdir(sourceDirectory);await mkdir(stagingParent);const source=await backup(sourceDirectory,nonRoundtrippablePayload()),sourceBefore=await snapshotFile(source),stagingDirectory=join(stagingParent,"stage"),request={source,expectedProjectId:"project-a",stagingDirectory,mode:MODE};
 const result=await stage(request);assert.deepEqual(result,retained(request,"verification-failed"));await assertFileUnchanged(source,sourceBefore);assert.equal((await stat(stagingDirectory)).isDirectory(),true);assert.deepEqual(await readdir(stagingParent),["stage"]);assert.deepEqual((await readdir(directory)).sort(),["source","staging-root"]);
});

test("keeps an active unrelated store writable and byte-for-byte logically untouched",async t=>{
 const stage=await api(),directory=await root(t,"asen-restore-stage-live-"),source=await backup(directory),stagingDirectory=join(directory,"stage"),livePath=join(directory,"live.sqlite"),live=new SqliteMemoryStore(livePath);try{live.registerSession("live-project","live-session");live.save({id:"live-1",projectId:"live-project",sessionId:"live-session",kind:"decision",content:"before",createdAt:"2026-01-01T00:00:00.000Z"});const before=live.exportProject("live-project");
  const result=await stage({source,expectedProjectId:"project-a",stagingDirectory,mode:MODE});assert.equal(result.status,"staged");assert.deepEqual(live.exportProject("live-project"),before);live.save({id:"live-2",projectId:"live-project",sessionId:"live-session",kind:"observation",content:"after",createdAt:"2026-01-02T00:00:00.000Z"});assert.equal(live.search("live-project","after").length,1);assert.equal(live.exportProject("project-a").observations.length,0);
 }finally{live.close();}
});

test("rejects invalid requests and prior abort before hooks, reads, or staging effects",async t=>{
 const stage=await api(),directory=await root(t,"asen-restore-stage-preflight-"),source=await backup(directory),controller=new AbortController();controller.abort();let hooks=0;
 const cases=[{source:"relative.json",expectedProjectId:"project-a",stagingDirectory:join(directory,"a"),mode:MODE,reason:"invalid-request"},{source,expectedProjectId:" ",stagingDirectory:join(directory,"b"),mode:MODE,reason:"invalid-request"},{source,expectedProjectId:"project-a",stagingDirectory:"relative",mode:MODE,reason:"invalid-request"},{source,expectedProjectId:"project-a",stagingDirectory:join(directory,"c"),mode:"merge" as typeof MODE,reason:"invalid-request"},{source,expectedProjectId:"project-a",stagingDirectory:join(directory,"d"),mode:MODE,signal:controller.signal,reason:"aborted"}] as const;
 for(const current of cases){const {reason,...request}=current;assert.deepEqual(await stage({...request,hooks:{before(){hooks++;},after(){hooks++;}}}),refused(request,reason));assert.equal((await readdir(directory)).includes(request.stagingDirectory.split(/[\\/]/u).at(-1)!),false);}assert.equal(hooks,0);
});

test("propagates invalid, mismatched, and oversized reader refusals without creating a stage",async t=>{
 const stage=await api(),directory=await root(t,"asen-restore-stage-reader-"),invalid=join(directory,"invalid.json"),mismatch=await backup(directory,payload("other")),oversize=join(directory,"oversize.json");await writeFile(invalid,"not json");await rename(mismatch,join(directory,"other.json"));const mismatchSource=join(directory,"other.json");await writeFile(oversize,Buffer.alloc(MAX_BYTES+1,0x20));
 for(const [source,backupReason,name] of [[invalid,"invalid-json","invalid-stage"],[mismatchSource,"project-mismatch","mismatch-stage"],[oversize,"backup-too-large","oversize-stage"]] as const){const stagingDirectory=join(directory,name),request={source,expectedProjectId:"project-a",stagingDirectory,mode:MODE};const before=await snapshotFile(source);assert.deepEqual(await stage(request),refused(request,"backup-refused",backupReason));await assertFileUnchanged(source,before);assert.equal((await readdir(directory)).includes(name),false);}
});

test("rejects an existing directory, file, or symbolic-link stage before reader effects",async t=>{
 const stage=await api(),directory=await root(t,"asen-restore-stage-existing-"),source=await backup(directory),existingDirectory=join(directory,"existing-directory"),existingFile=join(directory,"existing-file"),link=join(directory,"existing-link");await mkdir(existingDirectory);await writeFile(existingFile,"sentinel");let symlinkAvailable=true;try{await symlink(existingDirectory,link,process.platform==="win32"?"junction":"dir");}catch(error){if(typeof error==="object"&&error!==null&&"code" in error&&(error.code==="EPERM"||error.code==="EACCES")){symlinkAvailable=false;t.diagnostic("platform denied the unprivileged directory-symlink fixture; directory and ordinary-file existing-path cases remain enforced");}else throw error;}
 for(const stagingDirectory of [existingDirectory,existingFile,...(symlinkAvailable?[link]:[])]){let readerHooks=0;const request={source,expectedProjectId:"project-a",stagingDirectory,mode:MODE};assert.deepEqual(await stage({...request,hooks:{before(current){if(current.startsWith("read-"))readerHooks++;}}}),refused(request,"staging-exists"));assert.equal(readerHooks,0);}assert.equal(await readFile(existingFile,"utf8"),"sentinel");
});

test("rejects missing, non-directory, and linked staging parents without touching the source",async t=>{
 const stage=await api(),directory=await root(t,"asen-restore-stage-parent-"),source=await backup(directory),fileParent=join(directory,"file-parent"),linkedParent=join(directory,"linked-parent"),realParent=join(directory,"real-parent");await writeFile(fileParent,"sentinel");await mkdir(realParent);let symlinkAvailable=true;try{await symlink(realParent,linkedParent,process.platform==="win32"?"junction":"dir");}catch(error){if(typeof error==="object"&&error!==null&&"code" in error&&(error.code==="EPERM"||error.code==="EACCES")){symlinkAvailable=false;t.diagnostic("platform denied the unprivileged parent-symlink fixture; missing and ordinary-file parent cases remain enforced");}else throw error;}const sourceBefore=await snapshotFile(source);
 const parents=[join(directory,"missing-parent"),fileParent,...(symlinkAvailable?[linkedParent]:[])];for(const parent of parents){const request={source,expectedProjectId:"project-a",stagingDirectory:join(parent,"stage"),mode:MODE};assert.deepEqual(await stage(request),refused(request,"unsafe-staging-path"));}await assertFileUnchanged(source,sourceBefore);assert.equal(await readFile(fileParent,"utf8"),"sentinel");
});

test("detects source drift through the delegated reader and leaves staging absent",async t=>{
 const stage=await api(),directory=await root(t,"asen-restore-stage-source-drift-"),source=await backup(directory),stagingDirectory=join(directory,"stage"),request={source,expectedProjectId:"project-a",stagingDirectory,mode:MODE};const original=await readFile(source);let changed=0;
 const result=await stage({...request,hooks:{async after(current){if(current==="read-open"){changed++;await writeFile(source," ",{flag:"a"});}}}});assert.equal(changed,1);assert.deepEqual(result,refused(request,"backup-refused","source-changed"));assert.deepEqual(await readFile(source),Buffer.concat([original,Buffer.from(" ")]));assert.deepEqual((await readdir(directory)).sort(),["backup.json"]);
});

test("detects staging-parent path drift before creation and creates nothing in either parent",async t=>{
 const stage=await api(),directory=await root(t,"asen-restore-stage-parent-drift-"),source=await backup(directory),parent=join(directory,"parent"),moved=join(directory,"moved"),stagingDirectory=join(parent,"stage");await mkdir(parent);let drifts=0;const request={source,expectedProjectId:"project-a",stagingDirectory,mode:MODE};
 const result=await stage({...request,hooks:{async before(current){if(current==="create-directory"){drifts++;await rename(parent,moved);await mkdir(parent);}}}});assert.equal(drifts,1);assert.deepEqual(result,refused(request,"staging-parent-changed"));assert.deepEqual(await readdir(parent),[]);assert.deepEqual(await readdir(moved),[]);
});

test("retains the owned stage and never promotes when aborted immediately after creation",async t=>{
 const stage=await api(),directory=await root(t,"asen-restore-stage-abort-"),source=await backup(directory),stagingDirectory=join(directory,"stage"),controller=new AbortController(),request={source,expectedProjectId:"project-a",stagingDirectory,mode:MODE,signal:controller.signal};let aborts=0;
 const result=await stage({...request,hooks:{after(current){if(current==="create-directory"){aborts++;controller.abort();}}}});assert.equal(aborts,1);assert.deepEqual(result,retained(request,"aborted"));assert.deepEqual(await readdir(stagingDirectory),[]);assert.deepEqual((await readdir(directory)).sort(),["backup.json","stage"]);
});

for(const failure of [{name:"store construction",stage:"open-store",side:"before",reason:"store-create-failed"},{name:"import",stage:"import",side:"before",reason:"import-failed"},{name:"import verification",stage:"verify-import",side:"before",reason:"verification-failed"},{name:"first close",stage:"close-imported",side:"after",reason:"close-failed"},{name:"reopen",stage:"reopen-store",side:"before",reason:"reopen-failed"},{name:"reopen verification",stage:"verify-reopen",side:"before",reason:"verification-failed"},{name:"final close",stage:"close-reopened",side:"after",reason:"close-failed"}] as const)test(`retains the owned stage without promotion after ${failure.name} failure`,async t=>{
 const stage=await api(),directory=await root(t,`asen-restore-stage-${failure.stage}-`),source=await backup(directory),stagingDirectory=join(directory,"stage"),request={source,expectedProjectId:"project-a",stagingDirectory,mode:MODE};let faults=0;const fail=(current:Stage)=>{if(current===failure.stage){faults++;throw new Error("injected private fixture failure");}};const hooks:Hooks=failure.side==="before"?{before:fail}:{after:fail};
 const result=await stage({...request,hooks});assert.equal(faults,1);assert.deepEqual(result,retained(request,failure.reason));assert.equal((await stat(stagingDirectory)).isDirectory(),true);assert.deepEqual((await readdir(directory)).sort(),["backup.json","stage"]);
});

test("reports unknown ownership without deleting or promoting after the owned path is replaced",async t=>{
 const stage=await api(),directory=await root(t,"asen-restore-stage-ownership-race-"),source=await backup(directory),stagingDirectory=join(directory,"stage"),moved=join(directory,"owned-moved"),request={source,expectedProjectId:"project-a",stagingDirectory,mode:MODE};let replacements=0;
 const result=await stage({...request,hooks:{async after(current){if(current==="create-directory"){replacements++;await rename(stagingDirectory,moved);await mkdir(stagingDirectory);await writeFile(join(stagingDirectory,"foreign.txt"),"foreign");}}}});assert.equal(replacements,1);assert.deepEqual(result,{...refused(request,"stage-ownership-uncertain"),status:"unknown",ownership:"unknown"});assert.deepEqual(await readdir(moved),[]);assert.equal(await readFile(join(stagingDirectory,"foreign.txt"),"utf8"),"foreign");assert.deepEqual((await readdir(directory)).sort(),["backup.json","owned-moved","stage"]);
});
