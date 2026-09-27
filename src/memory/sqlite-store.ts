import { DatabaseSync } from "node:sqlite";
import type { MemoryItem, MemoryStore } from "./types.js";

export class SqliteMemoryStore implements MemoryStore {
  readonly #db: DatabaseSync;
  constructor(path: string) {
    this.#db=new DatabaseSync(path);
    this.#db.exec(`
      PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS memory (
        id TEXT PRIMARY KEY, project_id TEXT NOT NULL, session_id TEXT NOT NULL,
        kind TEXT NOT NULL, topic TEXT, content TEXT NOT NULL, created_at TEXT NOT NULL
      );
      CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(id UNINDEXED, project_id UNINDEXED, content);
    `);
  }
  save(item: MemoryItem): void {
    const tx=this.#db.prepare("INSERT OR REPLACE INTO memory(id,project_id,session_id,kind,topic,content,created_at) VALUES(?,?,?,?,?,?,?)");
    tx.run(item.id,item.projectId,item.sessionId,item.kind,item.topic ?? null,item.content,item.createdAt);
    this.#db.prepare("DELETE FROM memory_fts WHERE id=?").run(item.id);
    this.#db.prepare("INSERT INTO memory_fts(id,project_id,content) VALUES(?,?,?)").run(item.id,item.projectId,item.content);
  }
  get(id: string): MemoryItem | undefined {
    const r=this.#db.prepare("SELECT * FROM memory WHERE id=?").get(id) as Record<string,unknown>|undefined;
    return r ? row(r) : undefined;
  }
  search(projectId: string, query: string): MemoryItem[] {
    const rows=this.#db.prepare(`SELECT m.* FROM memory_fts f JOIN memory m ON m.id=f.id
      WHERE f.project_id=? AND memory_fts MATCH ? ORDER BY rank LIMIT 20`).all(projectId,query) as Record<string,unknown>[];
    return rows.map(row);
  }
  close(): void { this.#db.close(); }
}
function row(r: Record<string,unknown>): MemoryItem {
  const item: MemoryItem={id:String(r.id),projectId:String(r.project_id),sessionId:String(r.session_id),kind:String(r.kind) as MemoryItem["kind"],content:String(r.content),createdAt:String(r.created_at)};
  if (r.topic != null) item.topic=String(r.topic);
  return item;
}
