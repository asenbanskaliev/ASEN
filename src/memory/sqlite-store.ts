import { DatabaseSync } from "node:sqlite";
import type { MemoryItem, MemoryStore } from "./types.js";
export class SqliteMemoryStore implements MemoryStore {
 readonly #db:DatabaseSync;
 constructor(path:string){
  this.#db=new DatabaseSync(path);this.#db.exec(`
   PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
   CREATE TABLE IF NOT EXISTS memory(id TEXT PRIMARY KEY,project_id TEXT NOT NULL,session_id TEXT NOT NULL,kind TEXT NOT NULL,topic TEXT,content TEXT NOT NULL,created_at TEXT NOT NULL);
   CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(id UNINDEXED,project_id UNINDEXED,content);
   CREATE TRIGGER IF NOT EXISTS memory_ai AFTER INSERT ON memory BEGIN INSERT INTO memory_fts(id,project_id,content) VALUES(new.id,new.project_id,new.content); END;
   CREATE TRIGGER IF NOT EXISTS memory_ad AFTER DELETE ON memory BEGIN DELETE FROM memory_fts WHERE id=old.id; END;
   CREATE TRIGGER IF NOT EXISTS memory_au AFTER UPDATE ON memory BEGIN DELETE FROM memory_fts WHERE id=old.id; INSERT INTO memory_fts(id,project_id,content) VALUES(new.id,new.project_id,new.content); END;
  `);
  this.#repairFts();
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
