export type MemoryKind = "observation" | "decision" | "summary" | "prompt";
export interface MemoryItem {
  id: string;
  projectId: string;
  sessionId: string;
  kind: MemoryKind;
  topic?: string;
  content: string;
  createdAt: string;
}
export interface MemoryStore {
  save(item: MemoryItem): void;
  get(id: string): MemoryItem | undefined;
  search(projectId: string, query: string): MemoryItem[];
  close(): void;
}
export interface MemorySessionRegistry {
  registerSession(projectId:string,sessionId:string):void;
  endSession(projectId:string,sessionId:string):void;
  continueSession(projectId:string,endedSessionId:string,proposedSessionId:string):string;
}
