import assert from "node:assert/strict";
import test from "node:test";
import {existsSync,readdirSync} from "node:fs";
import {mkdtemp,rm,writeFile} from "node:fs/promises";
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
function workerExecArgv():string[]{
 const importIndex=process.execArgv.indexOf("--import"),loader=process.execArgv[importIndex+1],typeFlag=process.execArgv.find(argument=>argument==="--experimental-strip-types"||argument==="--experimental-transform-types");
 return typeFlag&&loader?.startsWith("data:text/javascript")?[typeFlag,"--import",loader]:["--import","tsx"];
}
function workerMessage(worker:Worker,predicate:(message:Record<string,unknown>)=>boolean,timeoutMs=2000):Promise<Record<string,unknown>>{
 return new Promise((resolve,reject)=>{
  const timeout=setTimeout(()=>{cleanupListeners();reject(new Error("Timed out waiting for memory open worker phase"));},timeoutMs);
  const message=(value:Record<string,unknown>)=>{if(predicate(value)){cleanupListeners();resolve(value);}};
  const error=(cause:Error)=>{cleanupListeners();reject(cause);};
  const exit=(code:number)=>{if(code!==0){cleanupListeners();reject(new Error(`memory open worker exited ${code}`));}};
  const cleanupListeners=()=>{clearTimeout(timeout);worker.off("message",message);worker.off("error",error);worker.off("exit",exit);};
  worker.on("message",message);worker.on("error",error);worker.on("exit",exit);
 });
}

test("versions and backs up an existing legacy store before its ordered migration",async t=>{
 const dir=await directory();t.after(()=>cleanup(dir));
 const path=join(dir,"memory.db"),legacy=new DatabaseSync(path);legacy.exec(legacyTable);legacy.prepare("INSERT INTO memory VALUES(?,?,?,?,?,?,?)").run("legacy-id","project-a","session-b","decision","topic-c","preserve this memory","2026-10-04T00:00:00Z");legacy.close();
 let store=new SqliteMemoryStore(path);
 assert.equal(version(path),8);
 assert.deepEqual(store.get("legacy-id"),{id:"legacy-id",projectId:"project-a",sessionId:"session-b",kind:"decision",topic:"topic-c",content:"preserve this memory",createdAt:"2026-10-04T00:00:00Z"});
 assert.equal(store.search("project-a","preserve")[0]?.id,"legacy-id");store.close();
 const migrated=new DatabaseSync(path);try{assert.notEqual(migrated.prepare("SELECT name FROM sqlite_master WHERE name='memory_relations'").get(),undefined);}finally{migrated.close();}
 const backups=backupFiles(path);assert.equal(backups.length,8);
 const legacyBackup=backups.find(name=>name.includes("v0-to-v1"))!,versionOneBackup=backups.find(name=>name.includes("v1-to-v2"))!;
 const backup=new DatabaseSync(join(dir,legacyBackup));try{assert.equal(version(join(dir,legacyBackup)),0);assert.equal((backup.prepare("SELECT content FROM memory WHERE id=?").get("legacy-id") as {content:string}).content,"preserve this memory");assert.equal(backup.prepare("SELECT name FROM sqlite_master WHERE name='memory_fts'").get(),undefined);}finally{backup.close();}
 const beforeSessions=new DatabaseSync(join(dir,versionOneBackup));try{assert.equal(version(join(dir,versionOneBackup)),1);assert.equal(beforeSessions.prepare("SELECT name FROM sqlite_master WHERE name='memory_sessions'").get(),undefined);}finally{beforeSessions.close();}
 store=new SqliteMemoryStore(path);assert.equal(store.get("legacy-id")?.content,"preserve this memory");store.close();assert.equal(backupFiles(path).length,8);
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
 const store=new SqliteMemoryStore(path);assert.equal(version(path),8);store.close();assert.equal(backupFiles(path).length,9);
});

test("fails closed instead of entering startup while another live process owns the database startup lock",async t=>{
 const dir=await directory();t.after(()=>cleanup(dir));
 const path=join(dir,"locked.db"),lock=`${path}.lock`;
 await writeFile(lock,JSON.stringify({pid:process.pid,token:"startup-owner",createdAt:Date.now()}));
 assert.throws(()=>new SqliteMemoryStore(path),/Timed out waiting for private store lock/);
 assert.equal(existsSync(path),false,"the blocked startup never created or migrated the database");
});

test("a holder worker serializes the complete migration startup before an opener can write",async t=>{
 const dir=await directory();t.after(()=>cleanup(dir));
 const path=join(dir,"worker-serialized.db"),legacy=new DatabaseSync(path);legacy.exec(legacyTable);legacy.close();
 const workerUrl=new URL("./memory-store-open-worker.mjs",import.meta.url),holderGate=new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT),openerGate=new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT);
 const holder=new Worker(workerUrl,{workerData:{mode:"holder",gate:holderGate,path},execArgv:workerExecArgv()});
 t.after(()=>holder.terminate());
 assert.deepEqual(await workerMessage(holder,message=>message.phase==="holder:acquired"),{phase:"holder:acquired"});
 const opener=new Worker(workerUrl,{workerData:{mode:"opener",gate:openerGate,path,id:"serialized-worker"},execArgv:workerExecArgv()});
 t.after(()=>opener.terminate());
 assert.deepEqual(await workerMessage(opener,message=>message.phase==="startup:ready"),{phase:"startup:ready"});
 const entered=workerMessage(opener,message=>message.phase==="startup:enter-constructor"),completed=workerMessage(opener,message=>message.ok!==undefined,10000);
 Atomics.store(new Int32Array(openerGate),0,1);Atomics.notify(new Int32Array(openerGate),0);
 assert.deepEqual(await entered,{phase:"startup:enter-constructor"});
 assert.equal(await Promise.race([completed.then(()=>"completed"),new Promise(resolve=>setTimeout(()=>resolve("blocked"),500))]),"blocked","the scheduled opener cannot migrate or write while the holder owns the startup lock");
 await new Promise(resolve=>setTimeout(resolve,5_500));
 assert.equal(await Promise.race([completed.then(()=>"completed"),new Promise(resolve=>setTimeout(()=>resolve("blocked"),0))]),"blocked","the opener must keep waiting while a live startup owner holds the lock beyond five seconds");
 assert.equal(version(path),0);assert.equal(backupFiles(path).length,0);
 Atomics.store(new Int32Array(holderGate),0,1);Atomics.notify(new Int32Array(holderGate),0);
 assert.deepEqual(await workerMessage(holder,message=>message.phase==="holder:released"),{phase:"holder:released"});
 assert.deepEqual(await completed,{ok:true});
 assert.equal(version(path),8);assert.equal(backupFiles(path).length,8);
 const store=new SqliteMemoryStore(path);assert.equal(store.get("serialized-worker")?.content,"serialized-worker");store.close();
 const sidecars=readdirSync(dir).filter(name=>name===`${basename(path)}.lock`||name.startsWith(`${basename(path)}.lock.release-`));assert.deepEqual(sidecars,[]);
});

test("serializes simultaneous opens and commits one migration before either store writes",async t=>{
 const dir=await directory();t.after(()=>cleanup(dir));
 const path=join(dir,"parallel.db"),legacy=new DatabaseSync(path);legacy.exec(legacyTable);legacy.close();
 const gate=new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT),workerUrl=new URL("./memory-store-open-worker.mjs",import.meta.url);
 const open=(id:string)=>new Promise<{ok:boolean;error?:string}>((resolve,reject)=>{
  const worker=new Worker(workerUrl,{workerData:{gate,path,id},execArgv:workerExecArgv()});
  worker.once("message",resolve);worker.once("error",reject);worker.once("exit",code=>{if(code!==0)reject(new Error(`memory open worker exited ${code}`));});
 });
 assert.deepEqual(await Promise.all([open("worker-a"),open("worker-b")]),[{ok:true},{ok:true}]);
 assert.equal(version(path),8);assert.equal(backupFiles(path).length,8);
 const store=new SqliteMemoryStore(path);assert.deepEqual([store.get("worker-a")?.content,store.get("worker-b")?.content],["worker-a","worker-b"]);store.close();
});
