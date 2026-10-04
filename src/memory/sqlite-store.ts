import { DatabaseSync } from "node:sqlite";
import {createHash,randomUUID} from "node:crypto";
import {existsSync,rmSync} from "node:fs";
import type { MemoryItem, MemoryObservationInput, MemoryObservationStore, MemoryObservationUpdate, MemoryContextOptions, MemoryExport, MemoryRelation, MemoryRelationInput, MemorySessionState, MemorySessionSummary, MemorySearchOptions, MemorySearchPreview, MemorySessionRegistry, MemoryStore } from "./types.js";

const CURRENT_SCHEMA_VERSION=8;
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
  `);}},
 {version:6,apply(db){db.exec(`
   CREATE TABLE memory_relations(id TEXT PRIMARY KEY,source_id TEXT NOT NULL,target_id TEXT NOT NULL,relation TEXT NOT NULL,project_id TEXT NOT NULL,created_at TEXT NOT NULL,UNIQUE(source_id,target_id,relation));
   CREATE INDEX memory_relations_project ON memory_relations(project_id,created_at);
  `);}},
 {version:7,apply(db){db.exec(`
   CREATE TABLE memory_session_summaries(project_id TEXT NOT NULL,session_id TEXT NOT NULL,content TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(project_id,session_id));
  `);}},
 {version:8,apply(db){db.exec(`
   ALTER TABLE memory_relations ADD COLUMN reviewed_at TEXT;
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
 endSession(projectId:string,sessionId:string,summary?:string):void{
  this.#requireIdentity(projectId,sessionId);
  const prepared=summary===undefined?undefined:prepareStoredContent(summary);
  if(summary!==undefined&&!prepared)throw new Error("Memory session summary is required");
  this.#transaction(()=>{
   const existing=this.#db.prepare("SELECT project_id,status FROM memory_sessions WHERE session_id=?").get(sessionId) as {project_id:string;status:string}|undefined;
   if(!existing||existing.project_id!==projectId)throw new Error("Memory session identity conflict");
   if(existing.status==="ended"){
    if(prepared!==undefined)this.#persistSessionSummary(projectId,sessionId,prepared);
    return;
   }
   this.#db.prepare("UPDATE memory_sessions SET status='ended' WHERE session_id=?").run(sessionId);
   if(prepared!==undefined)this.#persistSessionSummary(projectId,sessionId,prepared);
  });
 }
 #persistSessionSummary(projectId:string,sessionId:string,prepared:string):MemorySessionSummary{
  const existing=this.#db.prepare("SELECT * FROM memory_session_summaries WHERE project_id=? AND session_id=?").get(projectId,sessionId) as {project_id:string;session_id:string;content:string;created_at:string}|undefined;
  if(existing){
   if(existing.content!==prepared)throw new Error("Memory session summary already persisted");
   return {projectId:existing.project_id,sessionId:existing.session_id,content:existing.content,createdAt:existing.created_at};
  }
  const createdAt=new Date().toISOString();
  this.#db.prepare("INSERT INTO memory_session_summaries(project_id,session_id,content,created_at) VALUES(?,?,?,?)").run(projectId,sessionId,prepared,createdAt);
  return {projectId,sessionId,content:prepared,createdAt};
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
  const hasKind=input.kind!==undefined,hasTitle=input.title!==undefined,hasContent=input.content!==undefined,hasProjectId=input.projectId!==undefined;
  const hasScope=input.scope!==undefined,hasTopicKey=input.topicKey!==undefined;
  const hasFind=input.find!==undefined,hasReplace=input.replace!==undefined;
  if(hasFind!==hasReplace||hasContent&&(hasFind||hasReplace))throw new Error("Find and replace must be paired and cannot be combined with content");
  if(!hasKind&&!hasTitle&&!hasContent&&!hasProjectId&&!hasScope&&!hasTopicKey&&!hasFind)throw new Error("Memory observation update requires a field");
  const title=hasTitle?stripPrivateTags(input.title!):undefined;
  if(title!==undefined&&!title)throw new Error("Memory observation title is required");
  if(hasFind&&(Buffer.byteLength(input.find!,"utf8")>MAX_OBSERVATION_LENGTH_BYTES||Buffer.byteLength(input.replace!,"utf8")>MAX_OBSERVATION_LENGTH_BYTES))throw new Error("Find and replace values exceed the observation byte limit");
  const directContent=hasContent?prepareStoredContent(input.content!):undefined;
  if(directContent!==undefined&&!directContent)throw new Error("Memory observation content is required");
  return this.#transaction(()=>{
   const existing=this.#db.prepare("SELECT * FROM memory WHERE id=?").get(input.id) as Record<string,unknown>|undefined;
   if(!existing||existing.deleted_at!==null||existing.title===null)throw new Error("Memory observation not found");
   if(String(existing.project_id)!==input.expectedProject)throw new Error("Memory ownership mismatch");
   if(hasProjectId&&input.projectId!==String(existing.project_id))throw new Error("Memory project is immutable");
   const kind=hasKind?input.kind!:String(existing.kind);
   let content=directContent??String(existing.content);
   const hasMetadata=hasKind||hasTitle||hasProjectId||hasScope||hasTopicKey;
   if(hasFind){
    const replaced=replaceObservationContent(content,input.find!,input.replace!);
    if(replaced.noop&&!hasMetadata)return row(existing);
    content=replaced.content;
   }
   const nextTitle=title??String(existing.title??"");
   const scope=hasScope?normalizeScope(input.scope):String(existing.scope);
   const topicKey=hasTopicKey?normalizeTopicKey(input.topicKey!):(existing.topic_key==null?null:String(existing.topic_key));
   const hash=hashNormalizedContent(content);
   const now=new Date().toISOString();
   this.#db.prepare("UPDATE memory SET kind=?,title=?,content=?,scope=?,topic_key=?,normalized_hash=?,revision_count=revision_count+1,updated_at=? WHERE id=?")
    .run(kind,nextTitle,content,scope,topicKey||null,hash,now,input.id);
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
 addRelation(input:MemoryRelationInput):MemoryRelation{
  const valid=new Set(["related","compatible","scoped","conflicts_with","supersedes","not_conflict"]);
  if(!input.id.trim()||!input.expectedProject.trim()||!valid.has(input.relation))throw new Error("Invalid memory relation");
  if(input.sourceId===input.targetId)throw new Error("Memory relation endpoints must differ");
  return this.#transaction(()=>{
   const rows=this.#db.prepare("SELECT id,project_id,deleted_at FROM memory WHERE id IN (?,?)").all(input.sourceId,input.targetId) as Array<{id:string;project_id:string;deleted_at:string|null}>;
   if(rows.length!==2||rows.some(r=>r.deleted_at!==null))throw new Error("Memory relation endpoint not found");
   if(rows.some(r=>r.project_id!==input.expectedProject))throw new Error("Memory ownership mismatch");
   const createdAt=new Date().toISOString();
   this.#db.prepare("INSERT INTO memory_relations(id,source_id,target_id,relation,project_id,created_at) VALUES(?,?,?,?,?,?)").run(input.id,input.sourceId,input.targetId,input.relation,input.expectedProject,createdAt);
   return {id:input.id,sourceId:input.sourceId,targetId:input.targetId,relation:input.relation,projectId:input.expectedProject,createdAt};
  });
 }
 listRelations(projectId:string,observationId?:string):MemoryRelation[]{
  const sql=observationId?"SELECT * FROM memory_relations WHERE project_id=? AND (source_id=? OR target_id=?) ORDER BY created_at,id":"SELECT * FROM memory_relations WHERE project_id=? ORDER BY created_at,id";
  const rows=(observationId?this.#db.prepare(sql).all(projectId,observationId,observationId):this.#db.prepare(sql).all(projectId)) as Array<Record<string,unknown>>;
  return rows.map(r=>relationRow(r));
 }
 markRelationReviewed(id:string,expectedProject:string):MemoryRelation{
  if(!id.trim()||!expectedProject.trim())throw new Error("Memory relation identity is required");
  return this.#transaction(()=>{
   const current=this.#db.prepare("SELECT * FROM memory_relations WHERE id=?").get(id) as Record<string,unknown>|undefined;
   if(!current)throw new Error("Memory relation not found");if(String(current.project_id)!==expectedProject)throw new Error("Memory ownership mismatch");
   if(current.reviewed_at==null)this.#db.prepare("UPDATE memory_relations SET reviewed_at=? WHERE id=?").run(new Date().toISOString(),id);
   return relationRow(this.#db.prepare("SELECT * FROM memory_relations WHERE id=?").get(id) as Record<string,unknown>);
  });
 }
 saveSessionSummary(projectId:string,sessionId:string,content:string):MemorySessionSummary{
  this.#requireIdentity(projectId,sessionId);const prepared=prepareStoredContent(content);if(!prepared)throw new Error("Memory session summary is required");
  return this.#transaction(()=>{
   const session=this.#db.prepare("SELECT project_id,status FROM memory_sessions WHERE session_id=?").get(sessionId) as {project_id:string;status:string}|undefined;
   if(!session||session.project_id!==projectId)throw new Error("Memory session identity conflict");
   if(session.status!=="ended")throw new Error("Memory session must be ended before summary");
   return this.#persistSessionSummary(projectId,sessionId,prepared);
  });
 }
 getSessionSummary(projectId:string,sessionId:string):MemorySessionSummary|undefined{
  const r=this.#db.prepare("SELECT * FROM memory_session_summaries WHERE project_id=? AND session_id=?").get(projectId,sessionId) as {project_id:string;session_id:string;content:string;created_at:string}|undefined;
  return r?{projectId:r.project_id,sessionId:r.session_id,content:r.content,createdAt:r.created_at}:undefined;
 }
 integrityCheck():{ok:boolean;detail:string}{
  const result=this.#db.prepare("PRAGMA integrity_check").get() as Record<string,unknown>|undefined,value=String(result?Object.values(result)[0]:"missing");
  return {ok:value==="ok",detail:value};
 }
 exportProject(projectId:string):MemoryExport{
  if(!projectId.trim())throw new Error("Memory project is required");
  const observations=(this.#db.prepare("SELECT * FROM memory WHERE project_id=? AND deleted_at IS NULL ORDER BY created_at,id").all(projectId) as Record<string,unknown>[]).map(row);
  const relations=this.listRelations(projectId);
  const summaries=(this.#db.prepare("SELECT * FROM memory_session_summaries WHERE project_id=? ORDER BY created_at,session_id").all(projectId) as Array<{project_id:string;session_id:string;content:string;created_at:string}>).map(r=>({projectId:r.project_id,sessionId:r.session_id,content:r.content,createdAt:r.created_at}));
  const sessions=(this.#db.prepare("SELECT * FROM memory_sessions WHERE project_id=? ORDER BY session_id").all(projectId) as Array<{project_id:string;session_id:string;root_session_id:string;parent_session_id:string|null;status:"live"|"ended"}>).map(r=>({projectId:r.project_id,sessionId:r.session_id,rootSessionId:r.root_session_id,...(r.parent_session_id?{parentSessionId:r.parent_session_id}:{}),status:r.status} satisfies MemorySessionState));
  return {version:1,projectId,observations,relations,summaries,sessions};
 }
 importProject(data:MemoryExport):void{
  if(data.version!==1||!data.projectId.trim())throw new Error("Unsupported memory export");
  const sessions=data.sessions??inferExportSessions(data);
  validateMemoryImport(data,sessions);
  this.#transaction(()=>{
   for(const session of sessions){
    const existing=this.#db.prepare("SELECT project_id,root_session_id,parent_session_id,status FROM memory_sessions WHERE session_id=?").get(session.sessionId) as {project_id:string;root_session_id:string;parent_session_id:string|null;status:string}|undefined;
    if(existing){
     if(existing.project_id!==session.projectId||existing.root_session_id!==session.rootSessionId||(existing.parent_session_id??undefined)!==session.parentSessionId||existing.status!==session.status)throw new Error("Memory import session conflict");
    }else this.#db.prepare("INSERT INTO memory_sessions(session_id,project_id,root_session_id,parent_session_id,status) VALUES(?,?,?,?,?)").run(session.sessionId,session.projectId,session.rootSessionId,session.parentSessionId??null,session.status);
   }
   for(const item of data.observations){
    const existing=this.#db.prepare("SELECT * FROM memory WHERE id=?").get(item.id) as Record<string,unknown>|undefined;
    if(existing){const current=row(existing);if(JSON.stringify(current)!==JSON.stringify(item))throw new Error("Memory import observation conflict");continue;}
    this.#db.prepare(`INSERT INTO memory(id,project_id,session_id,kind,topic,content,created_at,pinned,title,tool_name,scope,topic_key,normalized_hash,revision_count,duplicate_count,last_seen_at,updated_at)
     VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(item.id,item.projectId,item.sessionId,item.kind,item.topic??null,item.content,item.createdAt,item.pinned?1:0,item.title??null,item.toolName??null,item.scope??"project",item.topicKey??null,hashNormalizedContent(item.content),item.revisionCount??1,item.duplicateCount??1,item.lastSeenAt??item.createdAt,item.updatedAt??item.createdAt);
   }
   for(const relation of data.relations){
    const existing=this.#db.prepare("SELECT * FROM memory_relations WHERE id=?").get(relation.id) as Record<string,unknown>|undefined;
    if(existing){if(JSON.stringify(relationRow(existing))!==JSON.stringify(relation))throw new Error("Memory import relation conflict");continue;}
    this.#db.prepare("INSERT INTO memory_relations(id,source_id,target_id,relation,project_id,created_at,reviewed_at) VALUES(?,?,?,?,?,?,?)").run(relation.id,relation.sourceId,relation.targetId,relation.relation,relation.projectId,relation.createdAt,relation.reviewedAt??null);
   }
   for(const summary of data.summaries){
    const existing=this.#db.prepare("SELECT content,created_at FROM memory_session_summaries WHERE project_id=? AND session_id=?").get(summary.projectId,summary.sessionId) as {content:string;created_at:string}|undefined;
    if(existing){if(existing.content!==summary.content||existing.created_at!==summary.createdAt)throw new Error("Memory import summary conflict");continue;}
    this.#db.prepare("INSERT INTO memory_session_summaries(project_id,session_id,content,created_at) VALUES(?,?,?,?)").run(summary.projectId,summary.sessionId,summary.content,summary.createdAt);
   }
  });
 }
 get(id:string):MemoryItem|undefined{const r=this.#db.prepare("SELECT * FROM memory WHERE id=? AND deleted_at IS NULL").get(id) as Record<string,unknown>|undefined;return r?row(r):undefined;}
 search(projectId:string,query:string):MemoryItem[]{return this.searchWithOptions(projectId,query);}
 searchWithOptions(projectId:string,query:string,options:MemorySearchOptions={}):MemoryItem[]{
  const matchMode=options.matchMode??"all";if(matchMode!=="all"&&matchMode!=="any")throw new Error("Invalid memory search match mode");
  const limit=Math.min(Math.max(Math.trunc(options.limit??10),1),20),fts=memoryFtsQuery(query,matchMode);
  if(!fts)return [];
  const rows=this.#db.prepare(`SELECT m.* FROM memory_fts f JOIN memory m ON m.id=f.id WHERE f.project_id=? AND m.deleted_at IS NULL AND memory_fts MATCH ? ORDER BY rank LIMIT ?`).all(projectId,fts,limit) as Record<string,unknown>[];
  return rows.map(row);
 }
 searchPreviews(projectId:string,query:string,options:MemorySearchOptions={}):MemorySearchPreview[]{
  return this.searchWithOptions(projectId,query,options).map(item=>{const chars=Array.from(item.content),preview=chars.slice(0,300).join("");return {id:item.id,kind:item.kind,...(item.title!==undefined?{title:item.title}:{}),preview,truncated:chars.length>300,...(item.topicKey!==undefined?{topicKey:item.topicKey}:{})};});
 }
 formatContext(projectId:string,options:MemoryContextOptions={}):string{
  const pinnedLimit=boundedContextLimit(options.pinned,Number.MAX_SAFE_INTEGER),recentLimit=boundedContextLimit(options.observations,20);
  const pinned=this.#db.prepare("SELECT * FROM memory WHERE project_id=? AND deleted_at IS NULL AND pinned=1 ORDER BY created_at DESC,id DESC LIMIT ?").all(projectId,pinnedLimit) as Record<string,unknown>[];
  const recent=this.#db.prepare("SELECT * FROM memory WHERE project_id=? AND deleted_at IS NULL AND pinned=0 ORDER BY created_at DESC,id DESC LIMIT ?").all(projectId,recentLimit) as Record<string,unknown>[];
  if(pinned.length===0&&recent.length===0)return "";
  let out="## Memory from Previous Sessions\\n\\n";
  if(pinned.length){out+="### Pinned\\n"+pinned.map(r=>contextBullet(row(r),options.compact??false)).join("")+"\\n";}
  if(recent.length){out+="### Recent Observations\\n"+recent.map(r=>contextBullet(row(r),options.compact??false)).join("")+"\\n";}
  return limitContextBytes(out,options.maxBytes??0);
 }
 close():void{this.#db.close();}
}
function boundedContextLimit(value:number|undefined,fallback:number):number{if(value===undefined||value===0)return fallback;if(value<0)return 0;return Math.min(Math.trunc(value),1000);}
function contextBullet(item:MemoryItem,compact:boolean):string{const title=item.title?.trim()||item.topicKey||item.id;return compact?`- [${item.kind}] **${title}**\\n`:`- [${item.kind}] **${title}**: ${Array.from(item.content).slice(0,300).join("")}\\n`;}
const contextTruncationMarker="\\n[truncated]\\n";
function limitContextBytes(value:string,maxBytes:number):string{if(maxBytes<=0||Buffer.byteLength(value,"utf8")<=maxBytes)return value;const marker=Buffer.from(contextTruncationMarker);if(maxBytes<marker.length)return truncateUtf8Bytes(value,maxBytes);return truncateUtf8Bytes(value,maxBytes-marker.length)+contextTruncationMarker;}
function truncateUtf8Bytes(value:string,maxBytes:number):string{if(maxBytes<=0)return "";const bytes=Buffer.from(value,"utf8");if(bytes.length<=maxBytes)return value;return bytes.subarray(0,maxBytes).toString("utf8").replace(/\\uFFFD$/u,"");}
function memoryFtsQuery(query:string,mode:"all"|"any"):string{
 const terms=query.trim().split(/\s+/u).map(term=>term.replace(/"/g,'""')).filter(Boolean);
 if(terms.length===0)return "";
 if(mode==="any")return terms.map(term=>`"${term}"`).join(" OR ");
 return terms.map(term=>`"${term}"`).join(" AND ");
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
function replaceObservationContent(content:string,find:string,replacement:string):{content:string;noop:boolean}{
 const marker="... [truncated]";
 let prefix=content,truncationMarker="";
 if(Buffer.byteLength(content,"utf8")>MAX_OBSERVATION_LENGTH_BYTES&&content.endsWith(marker)){truncationMarker=marker;prefix=content.slice(0,-marker.length);}
 if(find===""||!prefix.includes(find))return {content,noop:true};
 if(Buffer.byteLength(prefix,"utf8")>MAX_OBSERVATION_LENGTH_BYTES)throw new Error("Existing observation content exceeds the byte limit");
 const matches=prefix.split(find).length-1;
 const growth=Buffer.byteLength(replacement,"utf8")-Buffer.byteLength(find,"utf8");
 if(growth>0&&matches>Math.floor((MAX_OBSERVATION_LENGTH_BYTES-Buffer.byteLength(prefix,"utf8"))/growth))throw new Error("Find and replace result exceeds the observation byte limit");
 const replaced=stripPrivateTags(prefix.split(find).join(replacement));
 if(!replaced)throw new Error("Memory observation content is required");
 if(Buffer.byteLength(replaced,"utf8")>MAX_OBSERVATION_LENGTH_BYTES)throw new Error("Find and replace result exceeds the observation byte limit");
 const result=replaced+truncationMarker;
 return {content:result,noop:result===content};
}
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

function relationRow(r:Record<string,unknown>):MemoryRelation{return {id:String(r.id),sourceId:String(r.source_id),targetId:String(r.target_id),relation:String(r.relation) as MemoryRelation["relation"],projectId:String(r.project_id),createdAt:String(r.created_at),...(r.reviewed_at==null?{}:{reviewedAt:String(r.reviewed_at)})};}

function inferExportSessions(data:MemoryExport):MemorySessionState[]{
 const ids=new Set<string>();for(const item of data.observations)ids.add(item.sessionId);for(const summary of data.summaries)ids.add(summary.sessionId);
 return [...ids].sort().map(sessionId=>({projectId:data.projectId,sessionId,rootSessionId:sessionId,status:data.summaries.some(s=>s.sessionId===sessionId)?"ended":"live"}));
}
function validateMemoryImport(data:MemoryExport,sessions:MemorySessionState[]):void{
 const sessionIds=new Set<string>();
 for(const s of sessions){if(s.projectId!==data.projectId||!s.sessionId.trim()||!s.rootSessionId.trim()||sessionIds.has(s.sessionId))throw new Error("Invalid memory import session");sessionIds.add(s.sessionId);}
 for(const s of sessions)if(s.parentSessionId&&!sessionIds.has(s.parentSessionId))throw new Error("Invalid memory import session ancestry");
 const observationIds=new Set<string>();
 for(const item of data.observations){if(item.projectId!==data.projectId||!sessionIds.has(item.sessionId)||observationIds.has(item.id))throw new Error("Invalid memory import observation");observationIds.add(item.id);}
 for(const relation of data.relations)if(relation.projectId!==data.projectId||!observationIds.has(relation.sourceId)||!observationIds.has(relation.targetId))throw new Error("Invalid memory import relation");
 for(const summary of data.summaries)if(summary.projectId!==data.projectId||!sessionIds.has(summary.sessionId))throw new Error("Invalid memory import summary");
}
