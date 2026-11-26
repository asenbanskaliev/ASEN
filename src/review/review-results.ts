/** Pure 4R result aggregator. No synthesized success or approval authority. */
import {isReviewLens} from "./review-lens-contracts.js";
import {isIssuedPiLensReview,type PiLensReviewReport,type PiReviewFinding} from "./pi-model-reviewer.js";
import type {ReviewLens} from "./review-risk.js";

export interface PiLensReviewBundle{
 readonly status:"pass"|"fail";readonly requestId:string;readonly sessionId:string;
 readonly candidateTreeIdentity:string;readonly candidateRevision:string;
 readonly lenses:readonly ReviewLens[];
 readonly reports:readonly PiLensReviewReport[];
 readonly findings:readonly Readonly<{lens:ReviewLens;reviewerId:string;finding:PiReviewFinding}>[];
 readonly acceptance:"not-accepted";readonly deliveryAuthority:false;
}
const issuedBundles=new WeakSet<object>();
export function isIssuedPiLensBundle(value:unknown):value is PiLensReviewBundle{
 return typeof value==="object"&&value!==null&&issuedBundles.has(value);
}
export function consolidatePiLensReviews(expected:{
 requestId:string;sessionId:string;candidateTreeIdentity:string;candidateRevision:string;
 lenses:readonly ReviewLens[];
},reports:readonly PiLensReviewReport[]):PiLensReviewBundle{
 const ids=[expected.requestId,expected.sessionId,expected.candidateTreeIdentity,expected.candidateRevision];
 if(ids.some(v=>typeof v!=="string"||!v||v!==v.trim())||!Array.isArray(expected.lenses)||
   expected.lenses.length<1||expected.lenses.length>4||
   expected.lenses.some(l=>!isReviewLens(l))||
   new Set(expected.lenses).size!==expected.lenses.length)
  throw new Error("Invalid exact review bundle request");
 if(!Array.isArray(reports)||reports.length!==expected.lenses.length)
  throw new Error("Incomplete 4R review: every requested lens requires a genuine result");
 const byLens=new Map<ReviewLens,PiLensReviewReport>();
 for(const report of reports){
  if(!isIssuedPiLensReview(report)||!expected.lenses.includes(report.lens)||
    byLens.has(report.lens)||report.requestId!==expected.requestId||
    report.sessionId!==expected.sessionId||
    report.candidateTreeIdentity!==expected.candidateTreeIdentity||
    report.candidateRevision!==expected.candidateRevision)
   throw new Error("4R review result is forged, duplicated, out of scope or belongs to another candidate");
  byLens.set(report.lens,report);
 }
 const ordered=expected.lenses.map(lens=>{
  const report=byLens.get(lens);
  if(!report)throw new Error("Missing genuine 4R review result");
  return report;
 });
 const findings=ordered.flatMap(report=>report.findings.map(finding=>
  Object.freeze({lens:report.lens,reviewerId:report.reviewerId,finding})));
 const result=Object.freeze({
  status:ordered.some(r=>r.verdict==="fail")?"fail" as const:"pass" as const,
  requestId:expected.requestId,sessionId:expected.sessionId,
  candidateTreeIdentity:expected.candidateTreeIdentity,candidateRevision:expected.candidateRevision,
  lenses:Object.freeze([...expected.lenses]),reports:Object.freeze(ordered),
  findings:Object.freeze(findings),acceptance:"not-accepted" as const,deliveryAuthority:false as const
 });
 issuedBundles.add(result);return result;
}
