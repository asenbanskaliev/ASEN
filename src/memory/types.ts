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
