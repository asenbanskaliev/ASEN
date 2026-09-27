export type Phase =
  | "DISCOVERING" | "PLANNING" | "IMPLEMENTING" | "TESTING"
  | "REVIEWING" | "VERIFYING" | "VERIFIED" | "BLOCKED" | "FAILED" | "ROLLED_BACK";

export type Risk = "low" | "medium" | "high" | "unknown";

export interface Candidate {
  id: string;
  repository: string;
  revision: string;
  createdAt: string;
}

export interface Evidence {
  id: string;
  candidateId: string;
  kind: "test" | "review" | "command" | "audit";
  status: "pass" | "fail";
  summary: string;
  createdAt: string;
}

export interface TaskState {
  id: string;
  title: string;
  phase: Phase;
  candidateId?: string;
  blockers: string[];
}
