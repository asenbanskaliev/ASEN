import type { MemoryItem, MemoryStore } from "./types.js";

export class MemoryContext {
  constructor(private readonly store: MemoryStore, readonly projectId: string, readonly sessionId: string) {}
  remember(input: Omit<MemoryItem,"projectId"|"sessionId">): void {
    this.store.save({...input,projectId:this.projectId,sessionId:this.sessionId});
  }
  search(query: string): MemoryItem[] { return this.store.search(this.projectId,query); }
}
