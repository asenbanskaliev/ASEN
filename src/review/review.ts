import type { Candidate, Evidence } from "../core/types.js";

export type Severity = "critical" | "high" | "medium" | "low";
export interface Finding { id: string; severity: Severity; message: string; path?: string; }
export interface ReviewReport { candidateId: string; reviewer: string; findings: Finding[]; }

export function reviewEvidence(report: ReviewReport): Omit<Evidence,"candidateId"> {
  const failing=report.findings.some((f)=>f.severity==="critical" || f.severity==="high");
  return {
    id:`review:${report.reviewer}:${report.candidateId}`,
    kind:"review",
    status:failing ? "fail" : "pass",
    summary:failing ? "Review contains blocking findings" : "Independent review passed",
    createdAt:new Date().toISOString()
  };
}

export function assertReviewCandidate(candidate: Candidate, report: ReviewReport): void {
  if (candidate.id !== report.candidateId) throw new Error("Review candidate mismatch");
}
