import { DatabaseSync } from "node:sqlite";
import {randomUUID} from "node:crypto";
import {existsSync,rmSync} from "node:fs";
import type { MemoryItem, MemoryStore } from "./types.js";

const CURRENT_SCHEMA_VERSION=1;
type Migration={readonly version:number;apply(db:DatabaseSync):void};
const migrations:readonly Migration[]=[
 {version:1,apply(db){db.exec(`
   CREATE TABLE IF NOT EXISTS memory(id TEXT PRIMARY KEY,project_id TEXT NOT NULL,session_id TEXT NOT NULL,kind TEXT NOT NULL,topic TEXT,content TEXT NOT NULL,created_at TEXT NOT NULL);
   CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(id UNINDEXED,project_id UNINDEXED,content);
   CREATE TRIGGER IF NOT EXISTS memory_ai AFTER INSERT ON memory BEGIN INSERT INTO memory_fts(id,project_id,content) VALUES(new.id,new.project_id, new.content); END;
   CREATE TRIGGER IF NOT EXISTS memory_ad AFTER DELETE ON memory BEGIN DELETE FROM memory_fts WHERE id=old.id; END;
   CREATE TRIGGER IF NOT EXISTS memory_au AFTER UPDATE ON memory BEGIN DELETE FROM memory_fts WHERE id=old.id; INSERT INTO memory_fts(id,project_id,content) VALUES(new.id,new.project_id,new.content); END;
  `);
  const columns=new Set((db.prepare("PRAGMA table_info(memory)").all() as Array<{name:string}>).map(column=>column.name));
  if(["id","project_id","session_id","kind","topic","content","created_at"].some(name=>!columns.has(name)))throw new Error("Legacy memory schema is incompatible");
 }}
];
function schemaVersion(db:DatabaseSync):number{
 const value=(db.prepare("PRAGMA user_version").get() as {user_version?:unknown}|undefined)?.user_version;
 if(!Number.isSafeInteger(value)||Number(value)<0)throw new Error("Memory schema version is malformed");
 return Number(value);
}
function backupBeforeMigration(db:DatabaseSync,path:string,from:number,to:number):string{
 const backup=`${path}.pre-migration-v${from}-to-v${to}-${randomUUID()}.sqlite`;
 db.prepare("VACUUM INTO ?").run(backup);
 return backup;
}
function migrate(db:DatabaseSync,path:string,existingFile:boolean):void{
 let version=schemaVersion(db);
 if(version>CURRENT_SCHEMA_VERSION)throw new Error(`Memory database uses future schema version ${version}`);
 for(const migration of migrations){
  if(migration.version<=version)continue;
  if(migration.version!==version+1)throw new Error(`Memory schema migration gap after version ${version}`);
  const backup=existingFile?backupBeforeMigration(db,path,version,migration.version):undefined;
  db.exec("BEGIN IMMEDIATE");
  let applied=false;
  try{
   version=schemaVersion(db);
   if(version>CURRENT_SCHEMA_VERSION)throw new Error(`Memory database uses future schema version ${version}`);
   if(version>=migration.version){db.exec("COMMIT");}
   else{
    if(version!==migration.version-1)throw new Error(`Memory schema migration gap after version ${version}`);
    migration.apply(db);
    db.exec(`PRAGMA user_version=${migration.version}`);
    db.exec("COMMIT");applied=true;
   }
  }catch(error){try{db.exec("ROLLBACK");}catch{/* Keep the migration failure as primary. */}throw error;}
  if(!applied&&backup)try{rmSync(backup,{force:true});}catch{/* A redundant preflight snapshot is harmless. */}
  version=schemaVersion(db);
 }
 if(version!==CURRENT_SCHEMA_VERSION)throw new Error(`Memory schema version ${version} is unsupported`);
}

export class SqliteMemoryStore implements MemoryStore {
 readonly #db:DatabaseSync;
 constructor(path:string){
  const existingFile=path!==":memory:"&&path!==""&&existsSync(path);
  this.#db=new DatabaseSync(path);
  try{
   this.#db.exec("PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;");
   migrate(this.#db,path,existingFile);
   this.#db.exec("PRAGMA journal_mode=WAL;");
   this.#repairFts();
  }catch(error){try{this.#db.close();}catch{/* Preserve the startup failure. */}throw error;}
 }
 #repairFts():void{
  this.#db.exec("BEGIN IMMEDIATE");
  try{this.#db.exec("DELETE FROM memory_fts; INSERT INTO memory_fts(id,project_id,content) SELECT id,project_id,content FROM memory; COMMIT");}
  catch(e){this.#db.exec("ROLLBACK");throw e;}
 }
 save(item:MemoryItem):void{
  const existing=this.#db.prepare("SELECT project_id FROM memory WHERE id=?").get(item.id) as {project_id?:string}|undefined;
  if(existing&&existing.project_id!==item.projectId) throw new Error("Memory ownership mismatch");
  this.#db.prepare(`INSERT INTO memory(id,project_id,session_id,kind,topic,content,created_at) VALUES(?,?,?,?,?,?,?)
   ON CONFLICT(id) DO UPDATE SET session_id=excluded.session_id,kind=excluded.kind,topic=excluded.topic,content=excluded.content,created_at=excluded.created_at`)
   .run(item.id,item.projectId,item.sessionId,item.kind,item.topic??null,item.content,item.createdAt);
 }
 get(id:string):MemoryItem|undefined{const r=this.#db.prepare("SELECT * FROM memory WHERE id=?").get(id) as Record<string,unknown>|undefined;return r?row(r):undefined;}
 search(projectId:string,query:string):MemoryItem[]{const rows=this.#db.prepare(`SELECT m.* FROM memory_fts f JOIN memory m ON m.id=f.id WHERE f.project_id=? AND memory_fts MATCH ? ORDER BY rank LIMIT 20`).all(projectId,query) as Record<string,unknown>[];return rows.map(row);}
 close():void{this.#db.close();}
}
function row(r:Record<string,unknown>):MemoryItem{const i:MemoryItem={id:String(r.id),projectId:String(r.project_id),sessionId:String(r.session_id),kind:String(r.kind) as MemoryItem["kind"],content:String(r.content),createdAt:String(r.created_at)};if(r.topic!=null)i.topic=String(r.topic);return i;}
