import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {lstat,mkdir,mkdtemp,readFile,rename,rm,stat,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {basename,isAbsolute,join} from "node:path";
import test,{type TestContext} from "node:test";
import {SqliteMemoryStore} from "../src/memory/sqlite-store.js";
import type {MemoryExport,MemoryStore} from "../src/memory/types.js";

const MODULE_URL=new URL("../src/memory/project-memory-backup.js",import.meta.url);
const CREATED_AT="2026-10-16T12:34:56.000Z";
const DOMAIN="asen.project-memory-backup/v1\0";
const MAX_BACKUP_BYTES=16*1024*1024;
type Stage="write"|"sync"|"close"|"verify-temporary"|"link"|"verify-destination"|"cleanup";
type HookContext={temporaryPath:string;destination:string};
type Hooks={before?:(stage:Stage,context:HookContext)=>void|Promise<void>;after?:(stage:Stage,context:HookContext)=>void|Promise<void>};
type FileSystem={link:(existingPath:string,newPath:string)=>Promise<void>};
type BackupRequest={store:Pick<MemoryStore,"exportProject">;projectId:string;destination:string;createdAt?:string;signal?:AbortSignal;hooks?:Hooks;fileSystem?:FileSystem};
type BackupResult={schema:string;status:"created"|"refused"|"unknown";projectId:string;destination:string;publishAttempts:0|1;cleanup:"none"|"removed"|"retained";temporaryPath:string|null;reason:string|null;payloadBytes:number|null;payloadSha256:string|null};
type CreateBackup=(request:BackupRequest)=>Promise<BackupResult>;

async function api(rule:string):Promise<CreateBackup>{
 let loaded:Record<string,unknown>;
 try{loaded=await import(MODULE_URL.href) as Record<string,unknown>;}catch(error){assert.fail(`project-memory backup capability missing for ${rule}: ${String(error)}`);}
 assert.equal(typeof loaded.createProjectMemoryBackup,"function",`project-memory backup API unavailable for ${rule}`);
 return loaded.createProjectMemoryBackup as CreateBackup;
}
async function root(t:TestContext,prefix:string){const directory=await mkdtemp(join(tmpdir(),prefix));t.after(()=>rm(directory,{recursive:true,force:true}));return directory;}
function exportFixture(projectId="project-a"):MemoryExport{return {
 version:1,projectId,
 sessions:[{projectId,sessionId:"root",rootSessionId:"root",status:"ended"},{projectId,sessionId:"child",rootSessionId:"root",parentSessionId:"root",status:"live"}],
 observations:[{id:"a",projectId,sessionId:"root",kind:"decision",topic:"backup",content:"alpha",createdAt:"2026-01-01T00:00:00.000Z",pinned:true,title:"Alpha",scope:"project",toolName:"mem_save",topicKey:"backup",revisionCount:2,duplicateCount:1,lastSeenAt:"2026-01-02T00:00:00.000Z",updatedAt:"2026-01-02T00:00:00.000Z"},{id:"b",projectId,sessionId:"child",kind:"observation",content:"beta",createdAt:"2026-01-03T00:00:00.000Z"}],
 relations:[{id:"r",sourceId:"a",targetId:"b",relation:"related",projectId,createdAt:"2026-01-04T00:00:00.000Z",reviewedAt:"2026-01-05T00:00:00.000Z"}],
 summaries:[{projectId,sessionId:"root",content:"root complete",createdAt:"2026-01-06T00:00:00.000Z"}],
 deletions:[{id:"soft",projectId,deletedAt:"2026-01-07T00:00:00.000Z",mode:"soft",item:{id:"soft",projectId,sessionId:"child",kind:"decision",content:"deleted",createdAt:"2026-01-03T00:00:00.000Z"}},{id:"hard",projectId,deletedAt:"2026-01-08T00:00:00.000Z",mode:"hard"}]
};}
function storeFor(payload:MemoryExport,onExport?:()=>void):Pick<MemoryStore,"exportProject">{return {exportProject(){onExport?.();return payload;}};}
function expectedResult(overrides:Partial<BackupResult>&Pick<BackupResult,"projectId"|"destination">):BackupResult{const {projectId,destination,...rest}=overrides;return {schema:"asen.project-memory-backup-result/v1",status:"refused",projectId,destination,publishAttempts:0,cleanup:"none",temporaryPath:null,reason:null,payloadBytes:null,payloadSha256:null,...rest};}
async function entries(directory:string):Promise<string[]>{return (await import("node:fs/promises")).readdir(directory);}
async function identity(path:string){const value=await stat(path);return {dev:value.dev,ino:value.ino,size:value.size};}
function digest(payloadBytes:Buffer):string{return createHash("sha256").update(DOMAIN).update(payloadBytes).digest("hex");}
async function assertNoMutation(directory:string,before:string[]=[]){assert.deepEqual((await entries(directory)).sort(),before.slice().sort());}

async function populatedStore(t:TestContext,directory:string){
 const database=join(directory,"source.sqlite"),store=new SqliteMemoryStore(database);t.after(()=>store.close());
 store.registerSession("project-a","root");store.save({id:"a",projectId:"project-a",sessionId:"root",kind:"decision",topic:"backup",content:"alpha",createdAt:"2026-01-01T00:00:00.000Z"});
 store.endSession("project-a","root","root complete");assert.equal(store.continueSession("project-a","root","child"),"child");store.save({id:"b",projectId:"project-a",sessionId:"child",kind:"observation",content:"beta",createdAt:"2026-01-03T00:00:00.000Z"});
 store.addRelation({id:"r",sourceId:"a",targetId:"b",relation:"related",expectedProject:"project-a"});store.registerSession("project-b","other");store.save({id:"other",projectId:"project-b",sessionId:"other",kind:"decision",content:"excluded",createdAt:"2026-01-09T00:00:00.000Z"});return {store,database};
}

async function createWithFailure(t:TestContext,stage:Stage){
 const create=await api(`${stage} failure reporting`),directory=await root(t,`asen-backup-${stage}-`),destination=join(directory,"backup.json"),payload=exportFixture();
 let temporaryPath:string|undefined,linkCalls=0;
 const hooks:Hooks={before(current,context){temporaryPath=context.temporaryPath;if(current===stage&&stage!=="link")throw new Error(`injected ${stage}`);}};
 const fileSystem:FileSystem={async link(existingPath,newPath){linkCalls++;assert.equal(existingPath,temporaryPath);assert.equal(newPath,destination);throw new Error("injected link operation failure");}};
 const result=await create({store:storeFor(payload),projectId:payload.projectId,destination,createdAt:CREATED_AT,hooks,...(stage==="link"?{fileSystem}:{})});
 return {directory,destination,payload,result,temporaryPath,linkCalls};
}

test("creates one deterministic plaintext project backup from one consistent SQLite export",async t=>{
 const create=await api("deterministic real-store publication"),directory=await mkdtemp(join(tmpdir(),"asen-backup-created-")),{store,database}=await populatedStore(t,directory),destination=join(directory,"backup.json");t.after(()=>rm(directory,{recursive:true,force:true}));
 const sourceBefore=store.exportProject("project-a"),otherProjectBefore=store.exportProject("project-b"),databaseBefore=await readFile(database),databaseMtime=(await stat(database)).mtimeMs;let exports=0,linkedIdentity:{temp:Awaited<ReturnType<typeof identity>>;destination:Awaited<ReturnType<typeof identity>>}|undefined;
 const observedStore={exportProject(projectId:string){exports++;return store.exportProject(projectId);}};
 const result=await create({store:observedStore,projectId:"project-a",destination,createdAt:CREATED_AT,hooks:{async after(stage,context){if(stage==="link")linkedIdentity={temp:await identity(context.temporaryPath),destination:await identity(context.destination)};}}});
 assert.equal(exports,1);assert.equal(result.status,"created");assert.equal(result.publishAttempts,1);assert.equal(result.cleanup,"removed");assert.equal(result.temporaryPath,null);assert.equal(result.reason,null);assert.equal(result.schema,"asen.project-memory-backup-result/v1");assert.equal(result.projectId,"project-a");assert.equal(result.destination,destination);assert.equal(isAbsolute(destination),true);
 assert.ok(linkedIdentity,"link observation hook did not run");assert.deepEqual(linkedIdentity.temp,linkedIdentity.destination,"publication was not a physical hard link");
 const bytes=await readFile(destination),envelope=JSON.parse(bytes.toString("utf8"));assert.equal(envelope.schema,"asen.project-memory-backup/v1");assert.equal(envelope.projectId,"project-a");assert.equal(envelope.createdAt,CREATED_AT);assert.deepEqual(envelope.payload,sourceBefore);assert.deepEqual(envelope.integrity,{algorithm:"sha256",payloadBytes:result.payloadBytes,payloadSha256:result.payloadSha256});
 const payloadBytes=Buffer.from(JSON.stringify(envelope.payload),"utf8");assert.equal(result.payloadBytes,payloadBytes.length);assert.equal(result.payloadSha256,digest(payloadBytes));assert.equal(bytes.length<=MAX_BACKUP_BYTES,true);assert.deepEqual(store.exportProject("project-a"),sourceBefore);assert.deepEqual(store.exportProject("project-b"),otherProjectBefore);assert.equal(JSON.stringify(envelope).includes("excluded"),false);assert.deepEqual(await readFile(database),databaseBefore);assert.equal((await stat(database)).mtimeMs,databaseMtime);assert.deepEqual((await entries(directory)).sort(),["backup.json","source.sqlite","source.sqlite-shm","source.sqlite-wal"]);
});

test("canonicalizes known payload fields independently of caller insertion order",async t=>{
 const create=await api("canonical payload bytes"),directory=await root(t,"asen-backup-canonical-"),payload=exportFixture(),reordered={deletions:payload.deletions,summaries:payload.summaries,relations:payload.relations,observations:payload.observations,sessions:payload.sessions,projectId:payload.projectId,version:payload.version} as MemoryExport;
 const first=join(directory,"first.json"),second=join(directory,"second.json");const a=await create({store:storeFor(payload),projectId:payload.projectId,destination:first,createdAt:CREATED_AT}),b=await create({store:storeFor(reordered),projectId:payload.projectId,destination:second,createdAt:CREATED_AT});
 assert.equal(a.status,"created");assert.equal(b.status,"created");assert.equal(a.payloadSha256,b.payloadSha256);assert.equal(a.payloadBytes,b.payloadBytes);assert.deepEqual(await readFile(first),await readFile(second));
});

test("refuses invalid requests and prior abort before export or filesystem mutation",async t=>{
 const create=await api("pure request preflight"),directory=await root(t,"asen-backup-preflight-"),payload=exportFixture();let exports=0;const store=storeFor(payload,()=>exports++),controller=new AbortController(),parentFile=join(directory,"parent-file");controller.abort();await writeFile(parentFile,"ordinary file");
 const cases=[{projectId:" ",destination:join(directory,"blank.json"),reason:"invalid-request"},{projectId:payload.projectId,destination:"relative.json",reason:"invalid-request"},{projectId:payload.projectId,destination:join(directory,"aborted.json"),signal:controller.signal,reason:"aborted"},{projectId:payload.projectId,destination:join(directory,"missing","backup.json"),reason:"unsafe-parent"},{projectId:payload.projectId,destination:join(parentFile,"backup.json"),reason:"unsafe-parent"}];
 for(const current of cases){const result=await create({store,projectId:current.projectId,destination:current.destination,createdAt:CREATED_AT,...(current.signal?{signal:current.signal}:{})});assert.deepEqual(result,expectedResult({projectId:current.projectId,destination:current.destination,reason:current.reason}));}
 assert.equal(exports,0);assert.equal(await readFile(parentFile,"utf8"),"ordinary file");await assertNoMutation(directory,["parent-file"]);
});

test("strict backup validation rejects named project, ancestry, identity, type, relation, deletion, and known-field violations before writes",async t=>{
 const create=await api("strict new backup boundary"),directory=await root(t,"asen-backup-invalid-export-"),valid=exportFixture();
 const cyclicSessions=valid.sessions!.map(session=>session.sessionId==="root"?{...session,parentSessionId:"child"}:session);
 const duplicateSessions=[...valid.sessions!,{...valid.sessions![0]!}];
 const invalidStatus=valid.sessions!.map(session=>session.sessionId==="child"?{...session,status:"paused"}:session);
 const duplicateObservations=[...valid.observations,{...valid.observations[0]!}];
 const invalids:unknown[]=[
  {...valid,projectId:"other"},
  {...valid,sessions:undefined},
  {...valid,unexpected:true},
  {...valid,observations:[{...valid.observations[0],unexpected:true},valid.observations[1]]},
  {...valid,sessions:cyclicSessions},
  {...valid,sessions:duplicateSessions},
  {...valid,sessions:invalidStatus},
  {...valid,observations:duplicateObservations},
  {...valid,observations:[{...valid.observations[0],revisionCount:Number.POSITIVE_INFINITY},valid.observations[1]]},
  {...valid,relations:[{...valid.relations[0],targetId:"missing"}]},
  {...valid,deletions:[{id:"a",projectId:valid.projectId,deletedAt:CREATED_AT,mode:"hard"}]},
  {...valid,deletions:[{id:"hard",projectId:valid.projectId,deletedAt:CREATED_AT,mode:"hard",item:valid.observations[0]}]}
 ];
 let exports=0;
 for(let index=0;index<invalids.length;index++){
  const destination=join(directory,`invalid-${index}.json`),result=await create({store:storeFor(invalids[index] as MemoryExport,()=>exports++),projectId:valid.projectId,destination,createdAt:CREATED_AT});
  assert.deepEqual(result,expectedResult({projectId:valid.projectId,destination,reason:index===0?"project-mismatch":"invalid-export"}));assert.equal(exports,index+1);assert.deepEqual(await entries(directory),[]);
 }
 await assertNoMutation(directory);
});

test("legacy import remains permissive for unknown fields while backup rejects the same DTO",async t=>{
 const create=await api("legacy import compatibility"),directory=await root(t,"asen-backup-legacy-"),valid=exportFixture(),payload={...valid,futureField:{ignored:true}} as MemoryExport;
 const validLegacy=new SqliteMemoryStore(":memory:"),extraLegacy=new SqliteMemoryStore(":memory:");t.after(()=>{validLegacy.close();extraLegacy.close();});
 assert.doesNotThrow(()=>validLegacy.importProject(valid));assert.doesNotThrow(()=>extraLegacy.importProject(payload));assert.deepEqual(extraLegacy.exportProject(payload.projectId),validLegacy.exportProject(valid.projectId));
 const destination=join(directory,"backup.json"),result=await create({store:storeFor(payload),projectId:payload.projectId,destination,createdAt:CREATED_AT});assert.deepEqual(result,expectedResult({projectId:payload.projectId,destination,reason:"invalid-export"}));await assertNoMutation(directory);
});

test("refuses a backup larger than 16 MiB rather than truncating or writing",async t=>{
 const create=await api("finite encoded backup"),directory=await root(t,"asen-backup-large-"),payload=exportFixture();payload.observations[0]={...payload.observations[0]!,content:"x".repeat(MAX_BACKUP_BYTES)};const destination=join(directory,"backup.json");
 const result=await create({store:storeFor(payload),projectId:payload.projectId,destination,createdAt:CREATED_AT});assert.deepEqual(result,expectedResult({projectId:payload.projectId,destination,reason:"backup-too-large"}));await assertNoMutation(directory);
});

test("requires a canonical descriptive creation timestamp before any write",async t=>{
 const create=await api("canonical createdAt"),directory=await root(t,"asen-backup-time-"),payload=exportFixture();for(const createdAt of ["2026-10-16T12:34:56Z","not-a-date","2026-02-30T00:00:00.000Z"]){const destination=join(directory,encodeURIComponent(createdAt)+".json"),result=await create({store:storeFor(payload),projectId:payload.projectId,destination,createdAt});assert.deepEqual(result,expectedResult({projectId:payload.projectId,destination,reason:"invalid-request"}));}await assertNoMutation(directory);
});

test("preserves existing file and directory destinations without replacement",async t=>{
 const create=await api("no-overwrite existing destinations"),directory=await root(t,"asen-backup-existing-"),payload=exportFixture(),file=join(directory,"existing.json"),child=join(directory,"existing-dir");await writeFile(file,"sentinel");await mkdir(child);const fileBefore=await stat(file),dirBefore=await stat(child);
 for(const destination of [file,child]){const result=await create({store:storeFor(payload),projectId:payload.projectId,destination,createdAt:CREATED_AT});assert.deepEqual(result,expectedResult({projectId:payload.projectId,destination,reason:"destination-exists"}));}
 assert.equal(await readFile(file,"utf8"),"sentinel");assert.equal((await stat(file)).mtimeMs,fileBefore.mtimeMs);assert.equal((await stat(child)).mtimeMs,dirBefore.mtimeMs);assert.deepEqual((await entries(directory)).sort(),["existing-dir","existing.json"]);
});

test("retains a competing target created immediately before the sole link attempt",async t=>{
 const create=await api("competing EEXIST target"),directory=await root(t,"asen-backup-race-"),payload=exportFixture(),destination=join(directory,"backup.json");let linkStages=0;
 const result=await create({store:storeFor(payload),projectId:payload.projectId,destination,createdAt:CREATED_AT,hooks:{async before(stage){if(stage==="link"){linkStages++;await writeFile(destination,"competitor",{flag:"wx"});}}}});
 assert.equal(linkStages,1);assert.deepEqual(result,expectedResult({projectId:payload.projectId,destination,status:"refused",publishAttempts:1,cleanup:"removed",reason:"destination-exists",payloadBytes:result.payloadBytes,payloadSha256:result.payloadSha256}));assert.equal(await readFile(destination,"utf8"),"competitor");assert.deepEqual(await entries(directory),["backup.json"]);
});

test("fails closed when the ordinary destination parent is replaced before publication",async t=>{
 const create=await api("parent physical identity revalidation"),directory=await root(t,"asen-backup-parent-change-"),parent=join(directory,"parent"),moved=join(directory,"moved"),destination=join(parent,"backup.json"),payload=exportFixture();await mkdir(parent);let temporaryPath:string|undefined;
 const result=await create({store:storeFor(payload),projectId:payload.projectId,destination,createdAt:CREATED_AT,hooks:{async before(stage,context){temporaryPath=context.temporaryPath;if(stage==="link"){await rename(parent,moved);await mkdir(parent);}}}});
 assert.equal(result.status,"refused");assert.equal(result.reason,"parent-changed");assert.equal(result.publishAttempts,0);assert.equal(result.cleanup,"retained");assert.equal(result.temporaryPath,null);assert.equal(temporaryPath===undefined,false);assert.equal(await lstat(moved).then(x=>x.isDirectory()),true);assert.deepEqual(await entries(parent),[]);assert.equal((await entries(moved)).length,1);
});

for(const [stage,reason] of [["write","temporary-write-failed"],["sync","temporary-sync-failed"],["close","temporary-close-failed"],["verify-temporary","temporary-verification-failed"]] as const){
 test(`reports ${stage} failure before publication and removes only its owned temporary`,async t=>{
  const {directory,destination,payload,result}=await createWithFailure(t,stage);assert.deepEqual(result,expectedResult({projectId:payload.projectId,destination,status:"refused",publishAttempts:0,cleanup:stage==="close"?"retained":"removed",temporaryPath:stage==="close"?result.temporaryPath:null,reason,payloadBytes:result.payloadBytes,payloadSha256:result.payloadSha256}));
  if(stage==="close"){assert.notEqual(result.temporaryPath,null);const retained=await readFile(result.temporaryPath!);assert.equal(retained.length>0,true);assert.deepEqual(JSON.parse(retained.toString("utf8")).payload,payload);}else assert.deepEqual(await entries(directory),[]);
  assert.equal((await entries(directory)).includes("backup.json"),false);
 });
}

test("does not remove a temporary path whose physical file was replaced",async t=>{
 const create=await api("owned temporary identity cleanup"),directory=await root(t,"asen-backup-temp-replaced-"),payload=exportFixture(),destination=join(directory,"backup.json");let replacement="";
 const result=await create({store:storeFor(payload),projectId:payload.projectId,destination,createdAt:CREATED_AT,hooks:{async before(stage,context){if(stage==="verify-temporary"){await rm(context.temporaryPath);replacement="foreign replacement";await writeFile(context.temporaryPath,replacement,{flag:"wx"});}}}});
 assert.equal(result.status,"refused");assert.equal(result.reason,"temporary-verification-failed");assert.equal(result.publishAttempts,0);assert.equal(result.cleanup,"retained");assert.equal(result.temporaryPath,null);const [retained]=await entries(directory);assert.equal(await readFile(join(directory,retained!),"utf8"),replacement);assert.equal((await entries(directory)).includes("backup.json"),false);
});

test("counts one actual injected link operation failure without fallback or retry",async t=>{
 const {directory,destination,payload,result,linkCalls}=await createWithFailure(t,"link");assert.equal(linkCalls,1);assert.deepEqual(result,expectedResult({projectId:payload.projectId,destination,status:"refused",publishAttempts:1,cleanup:"removed",reason:"publish-failed",payloadBytes:result.payloadBytes,payloadSha256:result.payloadSha256}));assert.deepEqual(await entries(directory),[]);
});

test("post-link uncertainty retains both the destination and proven temporary without compensation",async t=>{
 const create=await api("post-link uncertain publication"),directory=await root(t,"asen-backup-uncertain-"),payload=exportFixture(),destination=join(directory,"backup.json");let linked:HookContext|undefined;
 const result=await create({store:storeFor(payload),projectId:payload.projectId,destination,createdAt:CREATED_AT,hooks:{after(stage,context){if(stage==="link"){linked=context;throw new Error("post-link observation unavailable");}}}});
 assert.equal(result.status,"unknown");assert.equal(result.reason,"publish-uncertain");assert.equal(result.publishAttempts,1);assert.equal(result.cleanup,"retained");assert.equal(result.temporaryPath,linked?.temporaryPath);assert.deepEqual(await readFile(destination),await readFile(result.temporaryPath!));assert.deepEqual(await identity(destination),await identity(result.temporaryPath!));
});

test("destination readback failure after link is unknown and never deletes destination",async t=>{
 const {destination,result,temporaryPath}=await createWithFailure(t,"verify-destination");assert.equal(result.status,"unknown");assert.equal(result.reason,"destination-verification-failed");assert.equal(result.publishAttempts,1);assert.equal(result.cleanup,"retained");assert.equal(result.temporaryPath,temporaryPath);assert.deepEqual(await readFile(destination),await readFile(temporaryPath!));
});

test("confirmed publication can report retained cleanup failure without claiming an unconditional clean success",async t=>{
 const {destination,payload,result,temporaryPath}=await createWithFailure(t,"cleanup");assert.equal(result.status,"created");assert.equal(result.reason,"cleanup-failed");assert.equal(result.publishAttempts,1);assert.equal(result.cleanup,"retained");assert.equal(result.temporaryPath,temporaryPath);assert.deepEqual(await readFile(destination),await readFile(temporaryPath!));assert.equal(result.projectId,payload.projectId);
});

test("abort before link refuses with no attempt, while abort after link reports unknown and preserves paths",async t=>{
 const create=await api("abort phase boundaries"),directory=await root(t,"asen-backup-abort-"),payload=exportFixture();
 const beforeController=new AbortController(),beforeDestination=join(directory,"before.json");const before=await create({store:storeFor(payload),projectId:payload.projectId,destination:beforeDestination,createdAt:CREATED_AT,signal:beforeController.signal,hooks:{before(stage){if(stage==="link")beforeController.abort();}}});assert.equal(before.status,"refused");assert.equal(before.reason,"aborted");assert.equal(before.publishAttempts,0);assert.equal(before.cleanup,"removed");assert.equal(before.temporaryPath,null);
 const afterController=new AbortController(),afterDestination=join(directory,"after.json");const after=await create({store:storeFor(payload),projectId:payload.projectId,destination:afterDestination,createdAt:CREATED_AT,signal:afterController.signal,hooks:{after(stage){if(stage==="link")afterController.abort();}}});assert.equal(after.status,"unknown");assert.equal(after.reason,"publish-uncertain");assert.equal(after.publishAttempts,1);assert.equal(after.cleanup,"retained");assert.equal(after.temporaryPath===null,false);assert.deepEqual(await readFile(afterDestination),await readFile(after.temporaryPath!));assert.deepEqual((await entries(directory)).sort(),["after.json",after.temporaryPath!.split(/[\\/]/u).at(-1)!].sort());
});

test("does not touch unrelated siblings when the actual injected link operation reports an unsupported filesystem",async t=>{
 const create=await api("unsupported filesystem fail-closed result"),directory=await root(t,"asen-backup-unsupported-"),payload=exportFixture(),destination=join(directory,"backup.json"),sibling=join(directory,"sibling.txt");await writeFile(sibling,"keep");const siblingBefore=await stat(sibling);let linkCalls=0;
 const fileSystem:FileSystem={async link(){linkCalls++;throw Object.assign(new Error("hard links unsupported"),{code:"ENOTSUP"});}};
 const result=await create({store:storeFor(payload),projectId:payload.projectId,destination,createdAt:CREATED_AT,fileSystem});
 assert.equal(linkCalls,1);assert.equal(result.status,"refused");assert.equal(result.reason,"unsupported-filesystem");assert.equal(result.publishAttempts,1);assert.equal(result.cleanup,"removed");assert.equal(await readFile(sibling,"utf8"),"keep");assert.equal((await stat(sibling)).mtimeMs,siblingBefore.mtimeMs);assert.deepEqual(await entries(directory),["sibling.txt"]);
});

async function inodeIdentity(path:string):Promise<{dev:number;ino:number}>{const value=await stat(path);return {dev:value.dev,ino:value.ino};}
function sameInode(left:{dev:number;ino:number}|null,right:{dev:number;ino:number}|null):boolean{return left!==null&&right!==null&&left.dev===right.dev&&left.ino===right.ino;}
async function optionalBytes(path:string):Promise<string|null>{try{return await readFile(path,"utf8");}catch{return null;}}
async function pathPresent(path:string):Promise<boolean>{try{await lstat(path);return true;}catch{return false;}}

test("same-inode temporary byte change before publication is retained without dispatch",async t=>{
 const create=await api("same-inode pre-dispatch byte ownership"),directory=await root(t,"asen-backup-same-inode-before-link-"),payload=exportFixture(),destination=join(directory,"backup.json"),changedBytes="same inode changed before publication";
 let temporaryPath="",beforeIdentity:{dev:number;ino:number}|null=null,afterIdentity:{dev:number;ino:number}|null=null,linkCalls=0,calledDestination:string|null=null;
 const hooks:Hooks={async before(stage,context){if(stage==="link"){temporaryPath=context.temporaryPath;beforeIdentity=await inodeIdentity(temporaryPath);await writeFile(temporaryPath,changedBytes);afterIdentity=await inodeIdentity(temporaryPath);}}};
 const fileSystem:FileSystem={async link(_existingPath,newPath){linkCalls++;calledDestination=newPath;throw new Error("link must not run after temporary bytes change");}};
 const result=await create({store:storeFor(payload),projectId:payload.projectId,destination,createdAt:CREATED_AT,hooks,fileSystem});
 const observed={result,linkCalls,calledDestination,sameInode:sameInode(beforeIdentity,afterIdentity),retainedBytes:await optionalBytes(temporaryPath),destinationPresent:await pathPresent(destination),directoryEntries:(await entries(directory)).sort()};
 assert.deepEqual(observed,{result:expectedResult({projectId:payload.projectId,destination,status:"refused",publishAttempts:0,cleanup:"retained",temporaryPath:null,reason:"temporary-verification-failed",payloadBytes:result.payloadBytes,payloadSha256:result.payloadSha256}),linkCalls:0,calledDestination:null,sameInode:true,retainedBytes:changedBytes,destinationPresent:false,directoryEntries:[basename(temporaryPath)]});
});

test("same-inode temporary byte change inside failed link operation is retained",async t=>{
 const create=await api("same-inode post-dispatch cleanup ownership"),directory=await root(t,"asen-backup-same-inode-link-failure-"),payload=exportFixture(),destination=join(directory,"backup.json"),changedBytes="same inode changed by link adapter";
 let temporaryPath="",beforeIdentity:{dev:number;ino:number}|null=null,afterIdentity:{dev:number;ino:number}|null=null,linkCalls=0,calledDestination:string|null=null;
 const fileSystem:FileSystem={async link(existingPath,newPath){linkCalls++;temporaryPath=existingPath;calledDestination=newPath;beforeIdentity=await inodeIdentity(existingPath);await writeFile(existingPath,changedBytes);afterIdentity=await inodeIdentity(existingPath);throw new Error("injected link failure after same-inode byte change");}};
 const result=await create({store:storeFor(payload),projectId:payload.projectId,destination,createdAt:CREATED_AT,fileSystem});
 const observed={result,linkCalls,calledDestination,sameInode:sameInode(beforeIdentity,afterIdentity),retainedBytes:await optionalBytes(temporaryPath),destinationPresent:await pathPresent(destination),directoryEntries:(await entries(directory)).sort()};
 assert.deepEqual(observed,{result:expectedResult({projectId:payload.projectId,destination,status:"refused",publishAttempts:1,cleanup:"retained",temporaryPath:null,reason:"publish-failed",payloadBytes:result.payloadBytes,payloadSha256:result.payloadSha256}),linkCalls:1,calledDestination:destination,sameInode:true,retainedBytes:changedBytes,destinationPresent:false,directoryEntries:[basename(temporaryPath)]});
});
