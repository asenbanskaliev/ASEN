import type { Candidate, Evidence } from "../core/types.js";
export type Severity="critical"|"high"|"medium"|"low";
export interface Finding{id:string;severity:Severity;message:string;path?:string;}
export interface ReviewReport{candidateId:string;candidateRevision:string;reviewer:string;reviewerRole:"independent"|"author";findings:Finding[];}
export function assertReviewCandidate(candidate:Candidate,report:ReviewReport):void{
 if(candidate.id!==report.candidateId||candidate.revision!==report.candidateRevision) throw new Error("Review candidate revision mismatch");
}
export function reviewEvidence(candidate:Candidate,report:ReviewReport):Omit<Evidence,"candidateId"|"candidateRevision">{
 assertReviewCandidate(candidate,report);
 const blocking=report.findings.filter(f=>f.severity==="critical"||f.severity==="high");
 const independent=report.reviewerRole==="independent";
 return {id:`review:${report.reviewer}:${candidate.id}:${candidate.revision}`,kind:"review",
 status:blocking.length===0&&independent?"pass":"fail",
 summary:!independent?"Review is not independent":blocking.length?`Review contains ${blocking.length} blocking finding(s)`:"Independent review passed",
 createdAt:new Date().toISOString()};
}
