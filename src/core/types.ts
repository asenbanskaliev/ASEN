export type Phase =
  | "DISCOVERING" | "PLANNING" | "IMPLEMENTING" | "TESTING"
  | "REVIEWING" | "VERIFYING" | "VERIFIED" | "BLOCKED" | "FAILED" | "ROLLED_BACK";
export type Risk = "low" | "medium" | "high" | "unknown";
export interface Candidate { id:string; repository:string; revision:string; createdAt:string; }
export interface Evidence {
 id:string; candidateRepository:string; candidateId:string; candidateRevision:string;
 kind:"test"|"review"|"command"|"audit"|"tdd"|"lifecycle-completion"|"route-decision"|"work-unit"|"scope"|"rollback"|"defect-intake";
 status:"pass"|"fail"|"expected-fail"; summary:string; createdAt:string;
 execution?:{command:string[];cwd:string;exitCode:number;startedAt:string;finishedAt:string};
 review?:{taskId:string;reviewerId:string;authorId:string};
 tdd?:{cycleId:string;stage:"RED"|"GREEN"|"REFACTOR";previousRevision?:string};
 defect?:import("../defects/rdd-defect-binding.js").RddDefectBinding;
 completion?:import("../test/tdd-completion-record.js").TddCompletionRecord;
}
export interface TaskState { id:string; title:string; phase:Phase; candidateId?:string; blockers:string[]; }
