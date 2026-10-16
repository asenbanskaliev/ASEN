import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,readFile,stat,symlink,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {spawn} from "node:child_process";
import {applyHistoryRetention,appendHistoryEntry,commitHistory,deleteHistoryEntry,deleteProjectHistory,emptyHistoryStore,migrateHistoryStore,parseHistoryStore,readHistoryStore} from "../src/runtime/history-store.js";
import {exportHistory} from "../src/runtime/history.js";

const entry=(id:string,projectId="p")=>({id,sessionId:"s",projectId,text:"safe",createdAt:"2026-10-06T00:00:00Z",redacted:false});
type MigrationArguments=Parameters<typeof migrateHistoryStore>;
// @ts-expect-error Migration durability dependencies are not caller-overridable.
const migrationOverrideArguments:MigrationArguments=["history.json",0,{withLock:async function<T>(_target:string,operation:()=>Promise<T>):Promise<T>{return operation();},atomicWrite:async()=>{}}];
void migrationOverrideArguments;

test("history persistence survives reopen, checks revisions and tombstones safe delete",async()=>{
 const directory=await mkdtemp(path.join(tmpdir(),"asen-history-")),file=path.join(directory,"private","history.json");
 const initial=await readHistoryStore(file);const one=await commitHistory(file,initial.revision,value=>({...value,revision:value.revision+1,policy:{enabled:true,maxEntries:20},entries:[entry("one")]}));
 if(process.platform!=="win32")assert.equal((await stat(file)).mode&0o777,0o600);
 assert.equal((await readHistoryStore(file)).entries[0]?.id,"one");await assert.rejects(()=>commitHistory(file,0,value=>({...value,revision:value.revision+1})),/conflict/);
 const deleted=await commitHistory(file,one.revision,value=>deleteHistoryEntry(value,"one"));assert.deepEqual(deleted.tombstones,["one"]);assert.deepEqual((await readHistoryStore(file)).entries,[]);
 await assert.rejects(()=>appendHistoryEntry(file,entry("one")),/tombstoned/);
});

test("history retention updates policy and tombstones evicted records",()=>{
 const initial={...emptyHistoryStore(),policy:{enabled:true,maxEntries:10},entries:[entry("one"),entry("two")]};
 const retained=applyHistoryRetention(initial,{enabled:true,maxEntries:1});assert.deepEqual(retained.entries.map(value=>value.id),["two"]);assert.deepEqual(retained.tombstones,["one"]);assert.equal(retained.policy.maxEntries,1);
});

test("concurrent writes serialize without lost updates and preserve project isolation",async()=>{
 const directory=await mkdtemp(path.join(tmpdir(),"asen-history-race-")),file=path.join(directory,"history.json");
 await commitHistory(file,0,value=>({...value,revision:1,policy:{enabled:true,maxEntries:100}}));
 await Promise.all(Array.from({length:40},(_,index)=>appendHistoryEntry(file,entry(`p-${index}`))));
 const all=await readHistoryStore(file);assert.equal(all.entries.length,40);assert.equal(all.revision,41);
 await assert.rejects(()=>stat(`${file}.lock`),{code:"ENOENT"});
 const next=await commitHistory(file,all.revision,value=>deleteProjectHistory(value,"p"));assert.equal(next.entries.length,0);assert.equal(next.tombstones.length,40);
});

test("independent Pi processes do not overwrite each other's history updates",async()=>{
 const directory=await mkdtemp(path.join(tmpdir(),"asen-history-processes-")),file=path.join(directory,"history.json");
 await commitHistory(file,0,value=>({...value,revision:1,policy:{enabled:true,maxEntries:20}}));
 const moduleUrl=new URL("../src/runtime/history-store.ts",import.meta.url).href;
 const run=(id:string)=>new Promise<void>((resolve,reject)=>{
  const code=`const store=await import(${JSON.stringify(moduleUrl)});await store.appendHistoryEntry(${JSON.stringify(file)},${JSON.stringify(entry(id))});`;
  const child=spawn(process.execPath,["--import","tsx","--input-type=module","-e",code],{cwd:process.cwd(),stdio:["ignore","ignore","pipe"]});let error="";
  child.stderr.setEncoding("utf8");child.stderr.on("data",chunk=>{error+=chunk;});child.once("error",reject);child.once("close",(status)=>status===0?resolve():reject(Error(`History child failed (${status}): ${error}`)));
 });
 await Promise.all([run("child-a"),run("child-b"),run("child-c"),run("child-d")]);const stored=await readHistoryStore(file);
 assert.equal(stored.entries.length,4);assert.deepEqual(stored.entries.map(value=>value.id).sort(),["child-a","child-b","child-c","child-d"]);
});

test("corrupt or semantically inconsistent history fails closed without replacing bytes",async()=>{
 const directory=await mkdtemp(path.join(tmpdir(),"asen-history-corrupt-")),file=path.join(directory,"history.json"),raw='{"schema":"broken"}\n';await writeFile(file,raw);
 await assert.rejects(()=>readHistoryStore(file),/Invalid history/);await assert.rejects(()=>commitHistory(file,0,value=>({...value,revision:1})),/Invalid history/);assert.equal(await readFile(file,"utf8"),raw);
 const duplicate={...emptyHistoryStore(),entries:[entry("same"),entry("same")]};assert.throws(()=>parseHistoryStore(JSON.stringify(duplicate)),/Duplicate history/);
 const overlap={...emptyHistoryStore(),entries:[entry("same")],tombstones:["same"]};assert.throws(()=>parseHistoryStore(JSON.stringify(overlap)),/tombstones/);
});

test("migration redacts, retains newest entries, tombstones evictions, and is byte-idempotent",async()=>{
 const directory=await mkdtemp(path.join(tmpdir(),"asen-history-migrate-")),file=path.join(directory,"history.json");
 const first=entry("first","alpha"),middle={...entry("middle","beta"),sessionId:"session-beta",text:"token=ASENSyntheticSecret123"},last={...entry("last","alpha"),sessionId:"session-alpha",text:"Bearer ASENSyntheticBearer123"};
 const original={...emptyHistoryStore(),revision:7,policy:{enabled:true,maxEntries:2},entries:[first,middle,last],tombstones:["already-gone"]};await writeFile(file,JSON.stringify(original));
 const result=await migrateHistoryStore(file,7);assert.deepEqual(result,{status:"changed",redactedEntries:2,evictedEntries:1,addedTombstones:1});
 const migrated=await readHistoryStore(file);assert.equal(migrated.revision,8);assert.deepEqual(migrated.entries.map(({id,projectId,sessionId})=>({id,projectId,sessionId})),[{id:"middle",projectId:"beta",sessionId:"session-beta"},{id:"last",projectId:"alpha",sessionId:"session-alpha"}]);
 assert.ok(migrated.entries.every(value=>value.redacted));assert.deepEqual(migrated.tombstones,["already-gone","first"]);assert.deepEqual(JSON.parse(exportHistory(migrated.entries,"alpha")).map((value:{id:string})=>value.id),["last"]);
 const bytes=await readFile(file,"utf8"),again=await migrateHistoryStore(file,8);assert.deepEqual(again,{status:"unchanged",redactedEntries:0,evictedEntries:0,addedTombstones:0});assert.equal(await readFile(file,"utf8"),bytes);assert.equal((await readHistoryStore(file)).revision,8);
});

test("migration canonicalizes legacy policy while disabled capture preserves all entries",async()=>{
 const directory=await mkdtemp(path.join(tmpdir(),"asen-history-legacy-")),file=path.join(directory,"history.json");
 const entries=[entry("one"),{...entry("two"),redacted:true},{...entry("three"),text:"password=ASENSyntheticPassword"}],legacy={schema:"asen.history/v1",revision:2,entries,tombstones:["old"]};await writeFile(file,JSON.stringify(legacy));
 assert.deepEqual(await migrateHistoryStore(file,2),{status:"changed",redactedEntries:1,evictedEntries:0,addedTombstones:0});const migrated=await readHistoryStore(file);
 assert.deepEqual(migrated.policy,{enabled:false,maxEntries:500});assert.deepEqual(migrated.entries.map(value=>value.id),["one","two","three"]);assert.equal(migrated.entries[1]?.redacted,true);assert.equal(migrated.entries[2]?.redacted,true);assert.deepEqual(migrated.tombstones,["old"]);
});

test("migration failures preserve authoritative bytes",async()=>{
 const directory=await mkdtemp(path.join(tmpdir(),"asen-history-migrate-fail-")),file=path.join(directory,"history.json"),base={...emptyHistoryStore(),revision:4,entries:[entry("one")]};
 const invalid:unknown[]=["{broken",{...base,entries:[entry("same"),entry("same")]},{...base,tombstones:["gone","gone"]},{...base,tombstones:["one"]},{...base,tombstones:Array.from({length:100001},(_,index)=>`gone-${index}`)}];
 for(const value of invalid){const raw=typeof value==="string"?value:JSON.stringify(value);await writeFile(file,raw);await assert.rejects(()=>migrateHistoryStore(file,4),/history/i);assert.equal(await readFile(file,"utf8"),raw);}
 const raw=JSON.stringify(base);await writeFile(file,raw);await assert.rejects(()=>migrateHistoryStore(file,3),/conflict/);assert.equal(await readFile(file,"utf8"),raw);
});

test("public migration cannot override lock or atomic durability",async()=>{
 const directory=await mkdtemp(path.join(tmpdir(),"asen-history-public-api-")),file=path.join(directory,"history.json");await writeFile(file,JSON.stringify({schema:"asen.history/v1",revision:0,entries:[{...entry("one"),text:"secret=ASENSyntheticSecret"}],tombstones:[]}));let overrideCalled=false;
 const result=await Reflect.apply(migrateHistoryStore,undefined,[file,0,{withLock:async()=>{overrideCalled=true;throw new Error("bypassed lock");},atomicWrite:async()=>{overrideCalled=true;throw new Error("bypassed atomic write");}}]);
 assert.equal(overrideCalled,false);assert.equal(result.status,"changed");assert.equal((await readHistoryStore(file)).entries[0]?.redacted,true);assert.equal(migrateHistoryStore.length,2);
});

test("private history rejects linked files/directories and stores data with owner-only mode",{skip:process.platform==="win32"?"POSIX private mode and symlink behavior":false},async()=>{
 const directory=await mkdtemp(path.join(tmpdir(),"asen-history-private-")),actual=path.join(directory,"actual"),alias=path.join(directory,"alias"),file=path.join(actual,"history.json");
 await commitHistory(file,0,value=>({...value,revision:1,policy:{enabled:true,maxEntries:1}}));assert.equal((await stat(file)).mode&0o777,0o600);assert.equal((await stat(actual)).mode&0o777,0o700);
 await symlink(actual,alias,"dir");await assert.rejects(()=>readHistoryStore(path.join(alias,"history.json")),/real directory/);
 const linked=path.join(directory,"linked.json");await symlink(file,linked,"file");await assert.rejects(()=>readHistoryStore(linked),/regular file/);
});

test("stale lock left by a crashed process is recovered on the next write",async()=>{
 const directory=await mkdtemp(path.join(tmpdir(),"asen-history-lock-")),file=path.join(directory,"history.json"),lock=`${file}.lock`;
 await writeFile(lock,JSON.stringify({pid:2147483647,token:"crashed",createdAt:Date.now()-60000}));
 const value=await commitHistory(file,0,current=>({...current,revision:1,policy:{enabled:true,maxEntries:10}}));assert.equal(value.revision,1);
});
