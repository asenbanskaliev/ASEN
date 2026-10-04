export type MemoryKind = "observation" | "decision" | "summary" | "prompt";
export interface MemoryItem {
  id: string;
  projectId: string;
  sessionId: string;
  kind: MemoryKind;
  topic?: string;
  content: string;
  createdAt: string;
  pinned?: boolean;
  title?: string;
  scope?: string;
  toolName?: string;
  topicKey?: string;
  revisionCount?: number;
  duplicateCount?: number;
  lastSeenAt?: string;
  updatedAt?: string;
}
export interface MemoryObservationInput {
  projectId: string;
  sessionId: string;
  kind: MemoryKind;
  title: string;
  content: string;
  topic?: string;
  scope?: string;
  toolName?: string;
}
export interface MemoryObservationStore {
  addObservation(input: MemoryObservationInput): string;
  updateObservation(input: MemoryObservationUpdate): MemoryItem;
}
export interface MemoryObservationUpdate {
  id: string;
  expectedProject: string;
  projectId?: string;
  kind?: MemoryKind;
  title?: string;
  content?: string;
  scope?: string;
  topicKey?: string;
  find?: string;
  replace?: string;
}
export interface MemorySearchOptions { matchMode?:"all"|"any"; limit?:number; }
export interface MemoryContextOptions { observations?:number; pinned?:number; maxBytes?:number; compact?:boolean; }
export type MemoryRelationType = "related"|"compatible"|"scoped"|"conflicts_with"|"supersedes"|"not_conflict";
export interface MemoryRelation { id:string; sourceId:string; targetId:string; relation:MemoryRelationType; projectId:string; createdAt:string; reviewedAt?:string; }
export interface MemorySessionSummary { projectId:string; sessionId:string; content:string; createdAt:string; }
export interface MemoryExport { version:1; projectId:string; observations:MemoryItem[]; relations:MemoryRelation[]; summaries:MemorySessionSummary[]; }
export interface MemoryRelationInput { id:string; sourceId:string; targetId:string; relation:MemoryRelationType; expectedProject:string; }
export interface MemorySearchPreview { id:string; kind:MemoryKind; title?:string; preview:string; truncated:boolean; topicKey?:string; }
export interface MemoryStore {
  save(item: MemoryItem): void;
  get(id: string): MemoryItem | undefined;
  search(projectId: string, query: string): MemoryItem[];
  searchWithOptions(projectId:string,query:string,options?:MemorySearchOptions):MemoryItem[];
  searchPreviews(projectId:string,query:string,options?:MemorySearchOptions):MemorySearchPreview[];
  formatContext(projectId:string,options?:MemoryContextOptions):string;
  setPinned(id: string, pinned: boolean): void;
  deleteObservation(id: string, expectedProject: string, hardDelete?: boolean): void;
  addRelation(input:MemoryRelationInput):MemoryRelation;
  listRelations(projectId:string,observationId?:string):MemoryRelation[];
  markRelationReviewed(id:string,expectedProject:string):MemoryRelation;
  saveSessionSummary(projectId:string,sessionId:string,content:string):MemorySessionSummary;
  getSessionSummary(projectId:string,sessionId:string):MemorySessionSummary|undefined;
  exportProject(projectId:string):MemoryExport;
  integrityCheck():{ok:boolean;detail:string};
  close(): void;
}
export interface MemorySessionRegistry {
  registerSession(projectId:string,sessionId:string):void;
  endSession(projectId:string,sessionId:string,summary?:string):void;
  continueSession(projectId:string,endedSessionId:string,proposedSessionId:string):string;
}
