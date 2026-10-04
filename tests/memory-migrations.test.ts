import assert from "node:assert/strict";
import test from "node:test";
import {readdirSync} from "node:fs";
import {mkdtemp,rm} from "node:fs/promises";
import {DatabaseSync} from "node:sqlite";
import {tmpdir} from "node:os";
import {basename,dirname,join} from "node:path";
import {Worker} from "node:worker_threads";
import {SqliteMemoryStore} from "../src/memory/sqlite-store.js";

const legacyTable="CREATE TABLE memory(id TEXT PRIMARY KEY,project_id TEXT NOT NULL,session_id TEXT NOT NULL,kind TEXT NOT NULL,topic TEXT,content TEXT NOT NULL,created_at TEXT NOT NULL);";
async function directory():Promise<string>{return mkdtemp(join(tmpdir(),"asen-memory-migration-"));}
function backupFiles(path:string):string[]{return readdirSync(dirname(path)).filter(name=>name.startsWith(`${basename(path)}.pre-migration-`));}
function version(path:string):number{const db=new DatabaseSync(path);try{return Number((db.prepare("PRAGMA user_version").get() as {user_version:number}).user_version);}finally{db.close();}}
const cleanup=(path:string)=>rm(path,{recursive:true,force:true});

test("versions and backs up an existing legacy store before its ordered migration",async t=>{
 const dir=await directory();t.after(()=>cleanup(dir));
 const path=join(dir,"memory.db"),legacy=new DatabaseSync(path);legacy.exec(legacyTable);legacy.prepare("INSERT INTO memory VALUES(?,?,?,?,?,?,?)").run("legacy-id","project-a","session-b","decision","topic-c","preserve this memory","2026-10-04T00:00:00Z");legacy.close();
 let store=new SqliteMemoryStore(path);
 assert.equal(version(path),5);
 assert.deepEqual(store.get("legacy-id"),{id:"legacy-id",projectId:"project-a",sessionId:"session-b",kind:"decision",topic:"topic-c",content:"preserve this memory",createdAt:"2026-10-04T00:00:00Z"});
 assert.equal(store.search("project-a","preserve")[0]?.id,"legacy-id");store.close();
 const backups=backupFiles(path);assert.equal(backups.length,5);
 const legacyBackup=backups.find(name=>name.includes("v0-to-v1"))!,versionOneBackup=backups.find(name=>name.includes("v1-to-v2"))!;
 const backup=new DatabaseSync(join(dir,legacyBackup));try{assert.equal(version(join(dir,legacyBackup)),0);assert.equal((backup.prepare("SELECT content FROM memory WHERE id=?").get("legacy-id") as {content:string}).content,"preserve this memory");assert.equal(backup.prepare("SELECT name FROM sqlite_master WHERE name='memory_fts'").get(),undefined);}finally{backup.close();}
 const beforeSessions=new DatabaseSync(join(dir,versionOneBackup));try{assert.equal(version(join(dir,versionOneBackup)),1);assert.equal(beforeSessions.prepare("SELECT name FROM sqlite_master WHERE name='memory_sessions'").get(),undefined);}finally{beforeSessions.close();}
 store=new SqliteMemoryStore(path);assert.equal(store.get("legacy-id")?.content,"preserve this memory");store.close();assert.equal(backupFiles(path).length,5);
});

test("rejects a future schema version before changing its database",async t=>{
 const dir=await directory();t.after(()=>cleanup(dir));
 const path=join(dir,"future.db"),db=new DatabaseSync(path);db.exec("CREATE TABLE marker(value TEXT); INSERT INTO marker VALUES('future'); PRAGMA user_version=99;");db.close();
 assert.throws(()=>new SqliteMemoryStore(path),/future schema version 99/);
 const check=new DatabaseSync(path);try{assert.equal(version(path),99);assert.equal((check.prepare("SELECT value FROM marker").get() as {value:string}).value,"future");assert.equal(check.prepare("SELECT name FROM sqlite_master WHERE name='memory'").get(),undefined);}finally{check.close();}
 assert.deepEqual(backupFiles(path),[]);
});

test("rolls back every schema change when a legacy migration fails",async t=>{
 const dir=await directory();t.after(()=>cleanup(dir));
 const path=join(dir,"malformed.db"),db=new DatabaseSync(path);db.exec("CREATE TABLE memory(id TEXT PRIMARY KEY); PRAGMA user_version=0;");db.close();
 assert.throws(()=>new SqliteMemoryStore(path));
 const check=new DatabaseSync(path);try{assert.equal(version(path),0);assert.equal(check.prepare("SELECT name FROM sqlite_master WHERE name='memory_fts'").get(),undefined);assert.deepEqual((check.prepare("PRAGMA table_info(memory)").all() as Array<{name:string}>).map(column=>column.name),["id"]);}finally{check.close();}
 assert.equal(backupFiles(path).length,1);
 const repaired=new DatabaseSync(path);repaired.exec("ALTER TABLE memory ADD COLUMN project_id TEXT; ALTER TABLE memory ADD COLUMN session_id TEXT; ALTER TABLE memory ADD COLUMN kind TEXT; ALTER TABLE memory ADD COLUMN topic TEXT; ALTER TABLE memory ADD COLUMN content TEXT; ALTER TABLE memory ADD COLUMN created_at TEXT;");repaired.close();
 const store=new SqliteMemoryStore(path);assert.equal(version(path),5);store.close();assert.equal(backupFiles(path).length,6);
});

test("serializes simultaneous opens and commits one migration before either store writes",async t=>{
 const dir=await directory();t.after(()=>cleanup(dir));
 const path=join(dir,"parallel.db"),legacy=new DatabaseSync(path);legacy.exec(legacyTable);legacy.close();
 const gate=new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT),workerUrl=new URL("./memory-store-open-worker.mjs",import.meta.url);
 const open=(id:string)=>new Promise<{ok:boolean;error?:string}>((resolve,reject)=>{
  const worker=new Worker(workerUrl,{workerData:{gate,path,id},execArgv:["--import","tsx"]});
  worker.once("message",resolve);worker.once("error",reject);worker.once("exit",code=>{if(code!==0)reject(new Error(`memory open worker exited ${code}`));});
 });
 assert.deepEqual(await Promise.all([open("worker-a"),open("worker-b")]),[{ok:true},{ok:true}]);
 assert.equal(version(path),5);assert.equal(backupFiles(path).length,5);
 const store=new SqliteMemoryStore(path);assert.deepEqual([store.get("worker-a")?.content,store.get("worker-b")?.content],["worker-a","worker-b"]);store.close();
});
