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
  title?: string;
  content?: string;
  find?: string;
  replace?: string;
}
export interface MemoryStore {
  save(item: MemoryItem): void;
  get(id: string): MemoryItem | undefined;
  search(projectId: string, query: string): MemoryItem[];
  setPinned(id: string, pinned: boolean): void;
  deleteObservation(id: string, expectedProject: string, hardDelete?: boolean): void;
  close(): void;
}
export interface MemorySessionRegistry {
  registerSession(projectId:string,sessionId:string):void;
  endSession(projectId:string,sessionId:string):void;
  continueSession(projectId:string,endedSessionId:string,proposedSessionId:string):string;
}
