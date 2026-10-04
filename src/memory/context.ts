import type { MemoryItem, MemorySearchOptions, MemorySearchPreview, MemorySessionRegistry, MemoryStore } from "./types.js";

export interface MemoryProjectIdentity { explicit?:string; configured?:string; repository?:string; }
const contextAdmission=Symbol("memory-session-admission");

export function resolveMemoryProjectId(identity:MemoryProjectIdentity):string {
  const candidates=[identity.explicit,identity.configured,identity.repository].filter((value):value is string=>value!==undefined);
  if(candidates.length===0)throw new Error("Memory project identity is missing");
  if(candidates.some(value=>typeof value!=="string"||value.trim()===""))throw new Error("Memory project identity is blank");
  if(candidates.some(value=>value!==candidates[0]))throw new Error("Memory project identity mismatch");
  return candidates[0]!;
}

export class MemoryContext {
  constructor(private readonly store: MemoryStore, readonly projectId: string, readonly sessionId: string, admission?:symbol) {
    if(admission!==contextAdmission)throw new Error("Memory context requires a registered session binding");
  }
  remember(input: Omit<MemoryItem,"projectId"|"sessionId">): void {
    this.store.save({...input,projectId:this.projectId,sessionId:this.sessionId});
  }
  search(query: string): MemoryItem[] { return this.store.search(this.projectId,query); }
  searchWithOptions(query:string,options:MemorySearchOptions={}):MemoryItem[]{return this.store.searchWithOptions(this.projectId,query,options);}
  searchPreviews(query:string,options:MemorySearchOptions={}):MemorySearchPreview[]{return this.store.searchPreviews(this.projectId,query,options);}
}

export function createMemoryContext(store:MemoryStore&MemorySessionRegistry,identity:MemoryProjectIdentity,sessionId:string):MemoryContext {
  const projectId=resolveMemoryProjectId(identity);
  store.registerSession(projectId,sessionId);
  return new MemoryContext(store,projectId,sessionId,contextAdmission);
}

export function continueMemoryContext(store:MemoryStore&MemorySessionRegistry,identity:MemoryProjectIdentity,endedSessionId:string,proposedSessionId:string):MemoryContext {
  const projectId=resolveMemoryProjectId(identity);
  const sessionId=store.continueSession(projectId,endedSessionId,proposedSessionId);
  return new MemoryContext(store,projectId,sessionId,contextAdmission);
}
