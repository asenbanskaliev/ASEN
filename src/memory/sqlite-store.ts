import { DatabaseSync } from "node:sqlite";
import {createHash,randomUUID} from "node:crypto";
import {existsSync,rmSync} from "node:fs";
import type { MemoryItem, MemoryObservationInput, MemoryObservationStore, MemoryObservationUpdate, MemorySessionRegistry, MemoryStore } from "./types.js";

const CURRENT_SCHEMA_VERSION=5;
const MAX_OBSERVATION_LENGTH_BYTES=50_000;
const DEFAULT_DEDUPE_WINDOW_MS=15*60_000;
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
 }},
 {version:2,apply(db){db.exec(`
   CREATE TABLE IF NOT EXISTS memory_sessions(session_id TEXT PRIMARY KEY,project_id TEXT NOT NULL,root_session_id TEXT NOT NULL,parent_session_id TEXT REFERENCES memory_sessions(session_id),status TEXT NOT NULL CHECK(status IN ('live','ended')));
   CREATE UNIQUE INDEX IF NOT EXISTS memory_one_live_continuation ON memory_sessions(parent_session_id) WHERE parent_session_id IS NOT NULL AND status='live';
  `);}},
 {version:3,apply(db){db.exec(`
   ALTER TABLE memory ADD COLUMN deleted_at TEXT;
   ALTER TABLE memory ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0 CHECK(pinned IN (0,1));
  `);}},
 {version:4,apply(db){db.exec(`
   CREATE TABLE memory_tombstones(id TEXT PRIMARY KEY,project_id TEXT NOT NULL,deleted_at TEXT NOT NULL);
  `);}},
 {version:5,apply(db){db.exec(`
   ALTER TABLE memory ADD COLUMN title TEXT;
   ALTER TABLE memory ADD COLUMN tool_name TEXT;
   ALTER TABLE memory ADD COLUMN scope TEXT NOT NULL DEFAULT 'project';
   ALTER TABLE memory ADD COLUMN topic_key TEXT;
   ALTER TABLE memory ADD COLUMN normalized_hash TEXT;
   ALTER TABLE memory ADD COLUMN revision_count INTEGER NOT NULL DEFAULT 1;
   ALTER TABLE memory ADD COLUMN duplicate_count INTEGER NOT NULL DEFAULT 1;
   ALTER TABLE memory ADD COLUMN last_seen_at TEXT;
   ALTER TABLE memory ADD COLUMN updated_at TEXT;
   UPDATE memory SET last_seen_at=created_at,updated_at=created_at;
  `);}}
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

export class SqliteMemoryStore implements MemoryStore,MemoryObservationStore,MemorySessionRegistry {
 readonly #db:DatabaseSync;
 readonly #dedupeWindowMs:number;
 constructor(path:string,dedupeWindowMs=DEFAULT_DEDUPE_WINDOW_MS){
  if(!Number.isFinite(dedupeWindowMs))throw new Error("Memory dedupe window must be finite");
  this.#dedupeWindowMs=dedupeWindowMs;
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
 #transaction<T>(operation:()=>T):T{
  this.#db.exec("BEGIN IMMEDIATE");
  try{const result=operation();this.#db.exec("COMMIT");return result;}
  catch(error){try{this.#db.exec("ROLLBACK");}catch{/* Preserve the session-operation failure. */}throw error;}
 }
 registerSession(projectId:string,sessionId:string):void{
  this.#requireIdentity(projectId,sessionId);
  this.#transaction(()=>{
   const existing=this.#db.prepare("SELECT project_id,parent_session_id,status FROM memory_sessions WHERE session_id=?").get(sessionId) as {project_id:string;parent_session_id:string|null;status:string}|undefined;
   if(existing){if(existing.project_id!==projectId||existing.parent_session_id!==null)throw new Error("Memory session identity conflict");if(existing.status!=="live")throw new Error("Memory session is ended");return;}
   this.#db.prepare("INSERT INTO memory_sessions(session_id,project_id,root_session_id,parent_session_id,status) VALUES(?,?,?,NULL,'live')").run(sessionId,projectId,sessionId);
  });
 }
 endSession(projectId:string,sessionId:string):void{
  this.#requireIdentity(projectId,sessionId);
  this.#transaction(()=>{
   const existing=this.#db.prepare("SELECT project_id FROM memory_sessions WHERE session_id=?").get(sessionId) as {project_id:string}|undefined;
   if(!existing||existing.project_id!==projectId)throw new Error("Memory session identity conflict");
   this.#db.prepare("UPDATE memory_sessions SET status='ended' WHERE session_id=?").run(sessionId);
  });
 }
 continueSession(projectId:string,endedSessionId:string,proposedSessionId:string):string{
  this.#requireIdentity(projectId,endedSessionId);this.#requireIdentity(projectId,proposedSessionId);
  return this.#transaction(()=>{
   const parent=this.#db.prepare("SELECT project_id,root_session_id,status FROM memory_sessions WHERE session_id=?").get(endedSessionId) as {project_id:string;root_session_id:string;status:string}|undefined;
   if(!parent||parent.project_id!==projectId)throw new Error("Memory session identity conflict");
   if(parent.status!=="ended")throw new Error("Memory session must be ended before continuation");
   const current=this.#db.prepare("SELECT session_id,project_id FROM memory_sessions WHERE parent_session_id=? AND status='live'").get(endedSessionId) as {session_id:string;project_id:string}|undefined;
   if(current){if(current.project_id!==projectId)throw new Error("Memory session identity conflict");return current.session_id;}
   const collision=this.#db.prepare("SELECT project_id,parent_session_id FROM memory_sessions WHERE session_id=?").get(proposedSessionId) as {project_id:string;parent_session_id:string|null}|undefined;
   if(collision)throw new Error("Memory session identity conflict");
   this.#db.prepare("INSERT INTO memory_sessions(session_id,project_id,root_session_id,parent_session_id,status) VALUES(?,?,?,?, 'live')").run(proposedSessionId,projectId,parent.root_session_id,endedSessionId);
   return proposedSessionId;
  });
 }
 #requireIdentity(projectId:string,sessionId:string):void{if(!projectId.trim()||!sessionId.trim())throw new Error("Memory project and session IDs must be nonblank");}
 save(item:MemoryItem):void{
  this.#requireIdentity(item.projectId,item.sessionId);
  const content=stripPrivateTags(item.content);
  if(!content)throw new Error("Memory content is empty");
  this.#transaction(()=>{
   const session=this.#db.prepare("SELECT project_id,status FROM memory_sessions WHERE session_id=?").get(item.sessionId) as {project_id:string;status:string}|undefined;
   if(!session||session.project_id!==item.projectId)throw new Error("Memory session identity conflict");
   if(session.status!=="live")throw new Error("Memory session is ended");
   const existing=this.#db.prepare("SELECT project_id FROM memory WHERE id=?").get(item.id) as {project_id?:string}|undefined;
   if(existing&&existing.project_id!==item.projectId) throw new Error("Memory ownership mismatch");
   this.#db.prepare(`INSERT INTO memory(id,project_id,session_id,kind,topic,content,created_at) VALUES(?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET session_id=excluded.session_id,kind=excluded.kind,topic=excluded.topic,content=excluded.content,created_at=excluded.created_at`)
    .run(item.id,item.projectId,item.sessionId,item.kind,item.topic??null,content,item.createdAt);
  });
 }
 addObservation(item:MemoryObservationInput):string{
  this.#requireIdentity(item.projectId,item.sessionId);
  const title=stripPrivateTags(item.title);
  if(!title)throw new Error("Memory observation title is required");
  const content=prepareStoredContent(item.content);
  if(!content)throw new Error("Memory observation content is required");
  let id:string=randomUUID();
  const scope=normalizeScope(item.scope),topicKey=normalizeTopicKey(item.topic??"");
  const normalizedHash=hashNormalizedContent(content);
  const now=new Date().toISOString();
  this.#transaction(()=>{
   const session=this.#db.prepare("SELECT project_id,status FROM memory_sessions WHERE session_id=?").get(item.sessionId) as {project_id:string;status:string}|undefined;
   if(!session||session.project_id!==item.projectId)throw new Error("Memory session identity conflict");
   if(session.status!=="live")throw new Error("Memory session is ended");
   if(topicKey){
    const existing=this.#db.prepare(`SELECT id FROM memory WHERE topic_key=? AND project_id=? AND scope=? AND deleted_at IS NULL
     ORDER BY updated_at DESC,created_at DESC LIMIT 1`).get(topicKey,item.projectId,scope) as {id:string}|undefined;
    if(existing){
     id=existing.id;
     this.#db.prepare(`UPDATE memory SET session_id=?,kind=?,topic=?,content=?,title=?,tool_name=?,topic_key=?,normalized_hash=?,
      revision_count=revision_count+1,last_seen_at=?,updated_at=? WHERE id=?`)
      .run(item.sessionId,item.kind,item.topic??null,content,title,item.toolName??null,topicKey,normalizedHash,now,now,id);
     return;
    }
   }
   const duplicate=this.#db.prepare(`SELECT id FROM memory WHERE normalized_hash=? AND project_id=? AND scope=? AND kind=? AND title=? AND deleted_at IS NULL
    AND datetime(created_at)>=datetime('now',?) ORDER BY created_at DESC LIMIT 1`)
    .get(normalizedHash,item.projectId,scope,item.kind,title,dedupeWindowExpression(this.#dedupeWindowMs)) as {id:string}|undefined;
   if(duplicate){
    id=duplicate.id;
    this.#db.prepare("UPDATE memory SET duplicate_count=duplicate_count+1,last_seen_at=?,updated_at=? WHERE id=?").run(now,now,id);
    return;
   }
   this.#db.prepare(`INSERT INTO memory(id,project_id,session_id,kind,topic,content,created_at,title,tool_name,scope,topic_key,normalized_hash,revision_count,duplicate_count,last_seen_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,1,1,?,?)`)
    .run(id,item.projectId,item.sessionId,item.kind,item.topic??null,content,now,title,item.toolName??null,scope,topicKey||null,normalizedHash,now,now);
  });
  return id;
 }
 updateObservation(input:MemoryObservationUpdate):MemoryItem{
  if(!input.expectedProject.trim())throw new Error("Expected memory project must be nonblank");
  const hasTitle=input.title!==undefined,hasContent=input.content!==undefined;
  const hasFind=input.find!==undefined,hasReplace=input.replace!==undefined;
  if(hasFind!==hasReplace||hasContent&&(hasFind||hasReplace))throw new Error("Find and replace must be paired and cannot be combined with content");
  if(!hasTitle&&!hasContent&&!hasFind)throw new Error("Memory observation update requires a field");
  const title=hasTitle?stripPrivateTags(input.title!):undefined;
  if(title!==undefined&&!title)throw new Error("Memory observation title is required");
  if(hasFind&&!input.find)throw new Error("Memory observation find text is required");
  if(hasFind&&(Buffer.byteLength(input.find!,"utf8")>MAX_OBSERVATION_LENGTH_BYTES||Buffer.byteLength(input.replace!,"utf8")>MAX_OBSERVATION_LENGTH_BYTES))throw new Error("Find and replace values exceed the observation byte limit");
  const directContent=hasContent?prepareStoredContent(input.content!):undefined;
  if(directContent!==undefined&&!directContent)throw new Error("Memory observation content is required");
  return this.#transaction(()=>{
   const existing=this.#db.prepare("SELECT * FROM memory WHERE id=?").get(input.id) as Record<string,unknown>|undefined;
   if(!existing||existing.deleted_at!==null||existing.title===null)throw new Error("Memory observation not found");
   if(String(existing.project_id)!==input.expectedProject)throw new Error("Memory ownership mismatch");
   let content=directContent??String(existing.content);
   if(hasFind){
    const replaced=content.split(input.find!).join(input.replace!);
    if(replaced===content&&!hasTitle)return row(existing);
    content=prepareStoredContent(replaced);
    if(!content)throw new Error("Memory observation content is required");
   }
   const nextTitle=title??String(existing.title??"");
   const hash=hasContent||hasFind?hashNormalizedContent(content):String(existing.normalized_hash??"");
   const now=new Date().toISOString();
   this.#db.prepare("UPDATE memory SET title=?,content=?,normalized_hash=?,revision_count=revision_count+1,last_seen_at=?,updated_at=? WHERE id=?")
    .run(nextTitle,content,hash,now,now,input.id);
   const updated=this.#db.prepare("SELECT * FROM memory WHERE id=?").get(input.id) as Record<string,unknown>;
   return row(updated);
  });
 }
 setPinned(id:string,pinned:boolean):void{
  this.#transaction(()=>{
   const result=this.#db.prepare("UPDATE memory SET pinned=? WHERE id=? AND deleted_at IS NULL").run(pinned?1:0,id);
   if(Number(result.changes)===0)throw new Error("Memory observation not found");
  });
 }
 deleteObservation(id:string,expectedProject:string,hardDelete=false):void{
  if(!expectedProject.trim())throw new Error("Expected memory project must be nonblank");
  this.#transaction(()=>{
   const existing=this.#db.prepare("SELECT project_id FROM memory WHERE id=?").get(id) as {project_id:string}|undefined;
   if(!existing)throw new Error("Memory observation not found");
   if(existing.project_id!==expectedProject)throw new Error("Memory ownership mismatch");
   const deletedAt=new Date().toISOString();
   if(hardDelete){
    this.#db.prepare("INSERT INTO memory_tombstones(id,project_id,deleted_at) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET project_id=excluded.project_id,deleted_at=excluded.deleted_at").run(id,expectedProject,deletedAt);
    this.#db.prepare("DELETE FROM memory WHERE id=?").run(id);
   }else{
    this.#db.prepare("UPDATE memory SET deleted_at=? WHERE id=? AND deleted_at IS NULL").run(deletedAt,id);
   }
  });
 }
 get(id:string):MemoryItem|undefined{const r=this.#db.prepare("SELECT * FROM memory WHERE id=? AND deleted_at IS NULL").get(id) as Record<string,unknown>|undefined;return r?row(r):undefined;}
 search(projectId:string,query:string):MemoryItem[]{const rows=this.#db.prepare(`SELECT m.* FROM memory_fts f JOIN memory m ON m.id=f.id WHERE f.project_id=? AND m.deleted_at IS NULL AND memory_fts MATCH ? ORDER BY rank LIMIT 20`).all(projectId,query) as Record<string,unknown>[];return rows.map(row);}
 close():void{this.#db.close();}
}
function prepareStoredContent(content:string):string{
 const redacted=stripPrivateTags(content);
 const bytes=Buffer.from(redacted,"utf8");
 if(bytes.length<=MAX_OBSERVATION_LENGTH_BYTES)return redacted;
 let end=MAX_OBSERVATION_LENGTH_BYTES;
 while(end>0&&(bytes[end]!&0xc0)===0x80)end--;
 return bytes.subarray(0,end).toString("utf8")+"... [truncated]";
}
function stripPrivateTags(value:string):string{return value.replace(/<private>.*?<\/private>/gis,"[REDACTED]").trim();}
function hashNormalizedContent(content:string):string{return createHash("sha256").update(content.toLowerCase().split(/\s+/u).filter(Boolean).join(" ")).digest("hex");}
function normalizeScope(scope:string|undefined):string{const value=(scope??"").trim().toLowerCase();return value==="personal"||value==="global"?value:"project";}
function normalizeTopicKey(topic:string):string{
 const normalized=topic.trim().toLowerCase().split(/\s+/u).filter(Boolean).join("-");
 const bytes=Buffer.from(normalized,"utf8");
 if(bytes.length<=120)return normalized;
 let end=120;while(end>0&&(bytes[end]!&0xc0)===0x80)end--;
 return bytes.subarray(0,end).toString("utf8");
}
function dedupeWindowExpression(windowMs:number):string{
 if(windowMs<=0)windowMs=DEFAULT_DEDUPE_WINDOW_MS;
 let minutes=Math.trunc(windowMs/60_000);
 if(minutes<1)minutes=1;
 return `-${minutes} minutes`;
}
function row(r:Record<string,unknown>):MemoryItem{
 const i:MemoryItem={id:String(r.id),projectId:String(r.project_id),sessionId:String(r.session_id),kind:String(r.kind) as MemoryItem["kind"],content:String(r.content),createdAt:String(r.created_at)};
 if(r.topic!=null)i.topic=String(r.topic);if(Number(r.pinned)===1)i.pinned=true;
 if(r.title!=null){i.title=String(r.title);i.scope=String(r.scope);i.revisionCount=Number(r.revision_count);i.duplicateCount=Number(r.duplicate_count);i.lastSeenAt=String(r.last_seen_at);i.updatedAt=String(r.updated_at);}
 if(r.tool_name!=null)i.toolName=String(r.tool_name);if(r.topic_key!=null)i.topicKey=String(r.topic_key);
 return i;
}
