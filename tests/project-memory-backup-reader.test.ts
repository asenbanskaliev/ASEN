import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {lstat,mkdir,mkdtemp,readFile,readdir,rename,rm,stat,symlink,utimes,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {isAbsolute,join} from "node:path";
import test,{type TestContext} from "node:test";
import type {MemoryExport,MemoryStore} from "../src/memory/types.js";

const MODULE_URL=new URL("../src/memory/project-memory-backup.js",import.meta.url);
const BACKUP_SCHEMA="asen.project-memory-backup/v1",RESULT_SCHEMA="asen.project-memory-backup-read-result/v1",DOMAIN=`${BACKUP_SCHEMA}\0`,CREATED_AT="2026-10-16T12:34:56.000Z",MAX_BYTES=16*1024*1024;
type Stage="open"|"read"|"verify-source";
type Hooks={before?:(stage:Stage,context:{source:string})=>void|Promise<void>;after?:(stage:Stage,context:{source:string})=>void|Promise<void>};
type Envelope={schema:typeof BACKUP_SCHEMA;projectId:string;createdAt:string;payload:MemoryExport;integrity:{algorithm:"sha256";payloadBytes:number;payloadSha256:string}};
type ReadRequest={source:string;expectedProjectId:string;signal?:AbortSignal;hooks?:Hooks};
type ReadResult={schema:string;status:"read"|"refused";source:string;expectedProjectId:string;backup:Envelope|null;reason:string|null;bytesRead:number};
type ReadBackup=(request:ReadRequest)=>Promise<ReadResult>;
type CreateBackup=(request:{store:Pick<MemoryStore,"exportProject">;projectId:string;destination:string;createdAt:string})=>Promise<unknown>;

async function api(rule:string):Promise<{read:ReadBackup;create:CreateBackup}>{
 const loaded=await import(MODULE_URL.href) as Record<string,unknown>;
 assert.equal(typeof loaded.readProjectMemoryBackup,"function","project-memory backup reader capability missing");
 assert.equal(typeof loaded.createProjectMemoryBackup,"function",`writer capability unavailable for ${rule}`);
 return {read:loaded.readProjectMemoryBackup as ReadBackup,create:loaded.createProjectMemoryBackup as CreateBackup};
}
async function root(t:TestContext,prefix:string){const directory=await mkdtemp(join(tmpdir(),prefix));t.after(()=>rm(directory,{recursive:true,force:true}));return directory;}
function payload(projectId="project-a"):MemoryExport{return {version:1,projectId,observations:[{id:"a",projectId,sessionId:"root",kind:"decision",topic:"backup",content:"alpha",createdAt:"2026-01-01T00:00:00.000Z",pinned:true,title:"Alpha",scope:"project",toolName:"mem_save",topicKey:"backup",revisionCount:2,duplicateCount:1,lastSeenAt:"2026-01-02T00:00:00.000Z",updatedAt:"2026-01-02T00:00:00.000Z"},{id:"b",projectId,sessionId:"child",kind:"observation",content:"beta",createdAt:"2026-01-03T00:00:00.000Z"}],relations:[{id:"r",sourceId:"a",targetId:"b",relation:"related",projectId,createdAt:"2026-01-04T00:00:00.000Z",reviewedAt:"2026-01-05T00:00:00.000Z"}],summaries:[{projectId,sessionId:"root",content:"complete",createdAt:"2026-01-06T00:00:00.000Z"}],sessions:[{projectId,sessionId:"root",rootSessionId:"root",status:"ended"},{projectId,sessionId:"child",rootSessionId:"root",parentSessionId:"root",status:"live"}],deletions:[{id:"soft",projectId,deletedAt:"2026-01-07T00:00:00.000Z",mode:"soft",item:{id:"soft",projectId,sessionId:"child",kind:"decision",content:"deleted",createdAt:"2026-01-03T00:00:00.000Z"}},{id:"hard",projectId,deletedAt:"2026-01-08T00:00:00.000Z",mode:"hard"}]};}
function envelope(value:MemoryExport=payload()):Envelope{const bytes=Buffer.from(JSON.stringify(value),"utf8");return {schema:BACKUP_SCHEMA,projectId:value.projectId,createdAt:CREATED_AT,payload:value,integrity:{algorithm:"sha256",payloadBytes:bytes.length,payloadSha256:createHash("sha256").update(DOMAIN).update(bytes).digest("hex")}};}
function refused(source:string,expectedProjectId:string,reason:string,bytesRead=0):ReadResult{return {schema:RESULT_SCHEMA,status:"refused",source,expectedProjectId,backup:null,reason,bytesRead};}
async function writeEnvelope(source:string,value:unknown=envelope()){const bytes=Buffer.from(JSON.stringify(value),"utf8");await writeFile(source,bytes);return bytes;}
async function snapshot(source:string){const info=await stat(source);return {bytes:await readFile(source),mtimeMs:info.mtimeMs,siblings:(await readdir(join(source,".."))).sort()};}
async function assertUnchanged(source:string,before:Awaited<ReturnType<typeof snapshot>>){const after=await snapshot(source);assert.deepEqual(after.bytes,before.bytes);assert.equal(after.mtimeMs,before.mtimeMs);assert.deepEqual(after.siblings,before.siblings);}

 test("reads a writer-produced backup without opening a store and leaves source and siblings unchanged",async t=>{
 const {read,create}=await api("writer roundtrip"),directory=await root(t,"asen-backup-reader-roundtrip-"),source=join(directory,"backup.json"),value=payload();let exports=0;
 await create({store:{exportProject(){exports++;return value;}},projectId:value.projectId,destination:source,createdAt:CREATED_AT});assert.equal(exports,1);await writeFile(join(directory,"sibling.txt"),"sentinel");const before=await snapshot(source),stages:string[]=[];
 const result=await read({source,expectedProjectId:value.projectId,hooks:{before(stage,context){assert.deepEqual(context,{source});stages.push(`before:${stage}`);},after(stage,context){assert.deepEqual(context,{source});stages.push(`after:${stage}`);}}});
 assert.equal(result.schema,RESULT_SCHEMA);assert.equal(result.status,"read");assert.equal(result.source,source);assert.equal(result.expectedProjectId,value.projectId);assert.equal(result.reason,null);assert.equal(result.bytesRead,before.bytes.length);assert.deepEqual(result.backup,JSON.parse(before.bytes.toString("utf8")));assert.deepEqual(stages,["before:open","after:open","before:read","after:read","before:verify-source","after:verify-source"]);assert.equal(isAbsolute(source),true);assert.equal(exports,1);await assertUnchanged(source,before);
});

test("rejects invalid requests and prior cancellation before hooks or filesystem reads",async t=>{
 const {read}=await api("request preflight"),directory=await root(t,"asen-backup-reader-preflight-"),source=join(directory,"backup.json");await writeEnvelope(source);const before=await snapshot(source),controller=new AbortController();controller.abort();let hooks=0;
 for(const current of [{source:"relative.json",expectedProjectId:"project-a",reason:"invalid-request"},{source,expectedProjectId:" ",reason:"invalid-request"},{source,expectedProjectId:"project-a",signal:controller.signal,reason:"aborted"}]){const result=await read({...current,hooks:{before(){hooks++;},after(){hooks++;}}});assert.deepEqual(result,refused(current.source,current.expectedProjectId,current.reason));}
 assert.equal(hooks,0);await assertUnchanged(source,before);
});

test("refuses missing, directory, and nonordinary sources without reading bytes",async t=>{
 const {read}=await api("ordinary source boundary"),directory=await root(t,"asen-backup-reader-source-"),missing=join(directory,"missing.json"),folder=join(directory,"folder");await mkdir(folder);for(const source of [missing,folder])assert.deepEqual(await read({source,expectedProjectId:"project-a"}),refused(source,"project-a","unsafe-source"));assert.deepEqual((await readdir(directory)).sort(),["folder"]);
});

test("refuses a symbolic-link source when the platform permits an unprivileged fixture",async t=>{
 const {read}=await api("symbolic-link source boundary"),directory=await root(t,"asen-backup-reader-symlink-"),target=join(directory,"target.json"),source=join(directory,"source.json");await writeEnvelope(target);const targetBefore=await snapshot(target);try{await symlink(target,source,"file");}catch(error){if(typeof error==="object"&&error!==null&&"code" in error&&(error.code==="EPERM"||error.code==="EACCES")){t.skip("unprivileged file symlink unavailable on this platform");return;}throw error;}const sourceBefore=await lstat(source);assert.equal(sourceBefore.isSymbolicLink(),true);assert.deepEqual(await read({source,expectedProjectId:"project-a"}),refused(source,"project-a","unsafe-source"));const targetAfter=await stat(target);assert.deepEqual(await readFile(target),targetBefore.bytes);assert.equal(targetAfter.mtimeMs,targetBefore.mtimeMs);assert.equal((await lstat(source)).isSymbolicLink(),true);assert.deepEqual((await readdir(directory)).sort(),["source.json","target.json"]);
});

test("distinguishes strict UTF-8 and JSON failures without returning partial backup",async t=>{
 const {read}=await api("encoding and JSON grammar"),directory=await root(t,"asen-backup-reader-encoding-");const cases:[string,Buffer,string][]=[["utf8.bin",Buffer.from([0xc3,0x28]),"invalid-encoding"],["json.txt",Buffer.from("{not json","utf8"),"invalid-json"],["scalar.json",Buffer.from("42","utf8"),"invalid-envelope"]];
 for(const [name,bytes,reason] of cases){const source=join(directory,name);await writeFile(source,bytes);const before=await snapshot(source);assert.deepEqual(await read({source,expectedProjectId:"project-a"}),refused(source,"project-a",reason,bytes.length));await assertUnchanged(source,before);}
});

test("enforces exact envelope and integrity grammar, admitted schema, and canonical creation time",async t=>{
 const {read}=await api("envelope grammar"),directory=await root(t,"asen-backup-reader-envelope-"),valid=envelope();const invalids:unknown[]=[{...valid,extra:true},{...valid,schema:"asen.project-memory-backup/v2"},{...valid,createdAt:"2026-10-16T12:34:56Z"},{...valid,createdAt:"not-a-date"},{...valid,integrity:{...valid.integrity,extra:true}},{...valid,integrity:{...valid.integrity,algorithm:"SHA-256"}},{...valid,integrity:{...valid.integrity,payloadBytes:-1}},{...valid,integrity:{...valid.integrity,payloadBytes:1.5}},{...valid,integrity:{...valid.integrity,payloadSha256:"A".repeat(64)}}];
 for(let i=0;i<invalids.length;i++){const source=join(directory,`invalid-${i}.json`),bytes=await writeEnvelope(source,invalids[i]),before=await snapshot(source);assert.deepEqual(await read({source,expectedProjectId:"project-a"}),refused(source,"project-a","invalid-envelope",bytes.length));await assertUnchanged(source,before);}
});

test("reports project mismatch for expected, envelope, or payload project disagreement",async t=>{
 const {read}=await api("project matching"),directory=await root(t,"asen-backup-reader-project-");const cases=[{value:envelope(),expected:"other"},{value:{...envelope(),projectId:"other"},expected:"project-a"},{value:{...envelope(),payload:{...payload(),projectId:"other"}},expected:"project-a"}];
 for(let i=0;i<cases.length;i++){const source=join(directory,`mismatch-${i}.json`),bytes=await writeEnvelope(source,cases[i]!.value),before=await snapshot(source);assert.deepEqual(await read({source,expectedProjectId:cases[i]!.expected}),refused(source,cases[i]!.expected,"project-mismatch",bytes.length));await assertUnchanged(source,before);}
});

test("reuses strict payload validation for known fields, ancestry, identity, relations, summaries, and deletions",async t=>{
 const {read}=await api("strict payload validation"),directory=await root(t,"asen-backup-reader-payload-"),valid=payload();const invalids:MemoryExport[]=[{...valid,unexpected:true} as MemoryExport,{...valid,sessions:undefined} as unknown as MemoryExport,{...valid,sessions:[...valid.sessions!,{...valid.sessions![0]!}]},{...valid,sessions:valid.sessions!.map(item=>item.sessionId==="root"?{...item,parentSessionId:"child"}:item)},{...valid,observations:[{...valid.observations[0]!,unexpected:true} as never,valid.observations[1]!]},{...valid,observations:[...valid.observations,{...valid.observations[0]!}]},{...valid,relations:[{...valid.relations[0]!,targetId:"missing"}]},{...valid,summaries:[...valid.summaries,{...valid.summaries[0]!}]},{...valid,deletions:[{id:"a",projectId:valid.projectId,deletedAt:CREATED_AT,mode:"hard"}]}];
 for(let i=0;i<invalids.length;i++){const current=envelope(),source=join(directory,`invalid-${i}.json`);current.payload=invalids[i]!;const bytes=await writeEnvelope(source,current),before=await snapshot(source);assert.deepEqual(await read({source,expectedProjectId:valid.projectId}),refused(source,valid.projectId,"invalid-export",bytes.length));await assertUnchanged(source,before);}
});

test("rejects semantically valid payloads whose parsed field projection is noncanonical",async t=>{
 const {read}=await api("canonical payload projection"),directory=await root(t,"asen-backup-reader-noncanonical-"),valid=payload(),reordered={deletions:valid.deletions,sessions:valid.sessions,summaries:valid.summaries,relations:valid.relations,observations:valid.observations,projectId:valid.projectId,version:valid.version} as MemoryExport,current=envelope(valid);current.payload=reordered;const canonicalBytes=Buffer.from(JSON.stringify(valid),"utf8");current.integrity={algorithm:"sha256",payloadBytes:canonicalBytes.length,payloadSha256:createHash("sha256").update(DOMAIN).update(canonicalBytes).digest("hex")};const source=join(directory,"backup.json"),bytes=await writeEnvelope(source,current),before=await snapshot(source);assert.deepEqual(await read({source,expectedProjectId:valid.projectId}),refused(source,valid.projectId,"noncanonical-payload",bytes.length));await assertUnchanged(source,before);
});

test("distinguishes canonical payload byte-size and digest mismatches",async t=>{
 const {read}=await api("integrity mismatch reasons"),directory=await root(t,"asen-backup-reader-integrity-"),valid=envelope();for(const [name,current,reason] of [["size",{...valid,integrity:{...valid.integrity,payloadBytes:valid.integrity.payloadBytes+1}},"payload-size-mismatch"],["digest",{...valid,integrity:{...valid.integrity,payloadSha256:"0".repeat(64)}},"payload-digest-mismatch"]] as const){const source=join(directory,`${name}.json`),bytes=await writeEnvelope(source,current),before=await snapshot(source);assert.deepEqual(await read({source,expectedProjectId:"project-a"}),refused(source,"project-a",reason,bytes.length));await assertUnchanged(source,before);}
});

test("accepts exactly 16 MiB and refuses 16 MiB plus one by stat or one overflow probe",async t=>{
 const {read}=await api("finite whole artifact boundary"),directory=await root(t,"asen-backup-reader-limit-"),base=Buffer.from(JSON.stringify(envelope()),"utf8");assert.equal(base.length<MAX_BYTES,true);const exact=Buffer.concat([base,Buffer.alloc(MAX_BYTES-base.length,0x20)]),oversize=Buffer.concat([exact,Buffer.from(" ")]);
 const accepted=join(directory,"exact.json");await writeFile(accepted,exact);const exactBefore=await snapshot(accepted),good=await read({source:accepted,expectedProjectId:"project-a"});assert.equal(good.status,"read");assert.equal(good.bytesRead,MAX_BYTES);assert.notEqual(good.backup,null);await assertUnchanged(accepted,exactBefore);
 const refusedSource=join(directory,"oversize.json");await writeFile(refusedSource,oversize);const oversizeBefore=await snapshot(refusedSource),tooLarge=await read({source:refusedSource,expectedProjectId:"project-a"});assert.equal(tooLarge.schema,RESULT_SCHEMA);assert.equal(tooLarge.status,"refused");assert.equal(tooLarge.source,refusedSource);assert.equal(tooLarge.expectedProjectId,"project-a");assert.equal(tooLarge.backup,null);assert.equal(tooLarge.reason,"backup-too-large");assert.equal(tooLarge.bytesRead===0||tooLarge.bytesRead===MAX_BYTES+1,true);assert.equal(oversizeBefore.bytes.length,MAX_BYTES+1);await assertUnchanged(refusedSource,oversizeBefore);
});

test("detects source growth after open and before read without consuming the changed artifact",async t=>{
 const {read}=await api("growth observation"),directory=await root(t,"asen-backup-reader-growth-"),source=join(directory,"backup.json"),original=await writeEnvelope(source),growth=Buffer.alloc(MAX_BYTES+1,0x20);let mutations=0;const result=await read({source,expectedProjectId:"project-a",hooks:{async before(stage){if(stage==="read"){mutations++;await writeFile(source,growth,{flag:"a"});}}}});assert.equal(mutations,1);assert.deepEqual(result,refused(source,"project-a","source-changed",0));assert.deepEqual(await readFile(source),Buffer.concat([original,growth]));assert.deepEqual(await readdir(directory),["backup.json"]);
});

test("detects physical source replacement after open and before read",async t=>{
 const {read}=await api("physical replacement"),directory=await root(t,"asen-backup-reader-replaced-"),source=join(directory,"backup.json"),moved=join(directory,"opened.json"),original=await writeEnvelope(source);let replacements=0,replacement:Buffer|null=null;const result=await read({source,expectedProjectId:"project-a",hooks:{async after(stage){if(stage==="open"){replacements++;await rename(source,moved);replacement=await writeEnvelope(source);}}}});assert.equal(replacements,1);assert.deepEqual(result,refused(source,"project-a","source-changed",0));assert.equal((await lstat(moved)).isFile(),true);assert.equal((await lstat(source)).isFile(),true);assert.deepEqual(await readFile(moved),original);assert.deepEqual(await readFile(source),replacement);assert.deepEqual((await readdir(directory)).sort(),["backup.json","opened.json"]);
});

test("detects timestamp drift after bytes are read and returns no partial backup",async t=>{
 const {read}=await api("post-read source drift"),directory=await root(t,"asen-backup-reader-postread-"),source=join(directory,"backup.json"),bytes=await writeEnvelope(source),before=await snapshot(source);let changed=0;const result=await read({source,expectedProjectId:"project-a",hooks:{async after(stage){if(stage==="read"){changed++;const current=await stat(source);await utimes(source,current.atime,new Date(current.mtimeMs+2000));}}}});assert.equal(changed,1);assert.deepEqual(result,refused(source,"project-a","source-changed",bytes.length));const after=await snapshot(source);assert.deepEqual(after.bytes,before.bytes);assert.deepEqual(after.siblings,before.siblings);assert.notEqual(after.mtimeMs,before.mtimeMs);
});

test("honors cancellation at read boundaries with only actual bytes reported",async t=>{
 const {read}=await api("read cancellation"),directory=await root(t,"asen-backup-reader-abort-"),source=join(directory,"backup.json"),bytes=await writeEnvelope(source),before=await snapshot(source);for(const [point,expectedBytes] of [["before",0],["after",bytes.length]] as const){const controller=new AbortController(),result=await read({source,expectedProjectId:"project-a",signal:controller.signal,hooks:{before(stage){if(point==="before"&&stage==="read")controller.abort();},after(stage){if(point==="after"&&stage==="read")controller.abort();}}});assert.deepEqual(result,refused(source,"project-a","aborted",expectedBytes));await assertUnchanged(source,before);}
});

test("closes and refuses trusted hook failures without leaking data or mutating source",async t=>{
 const {read}=await api("hook failures"),directory=await root(t,"asen-backup-reader-hooks-"),source=join(directory,"backup.json"),bytes=await writeEnvelope(source);const before=await snapshot(source);for(const [side,stage,expectedBytes] of [["before","open",0],["after","open",0],["before","read",0],["after","read",bytes.length],["before","verify-source",bytes.length],["after","verify-source",bytes.length]] as const){const hooks:Hooks={[side](current:Stage){if(current===stage)throw new Error("injected hook failure");}};assert.deepEqual(await read({source,expectedProjectId:"project-a",hooks}),refused(source,"project-a","read-failed",expectedBytes));await assertUnchanged(source,before);}
});
