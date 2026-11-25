/** Two genuinely independent, no-tools Pi judges over one issued candidate.
 * The result is analysis only; no write, correction, merge or RDD approval. */
import {reviewModelIdentityKey,availableIndependentPiReviewers,isPiReviewVerdictGenuine,runIndependentPiReview,type PiReviewEvidence,type PiReviewFinding,type PiReviewRegistry,type PiReviewerModel,type PiReviewVerdict,type PiReviewIdentity} from "./pi-model-reviewer.js";
import {isWorkspaceReviewEvidenceGenuine} from "./workspace-review-session.js";

export interface JudgmentDayInput{
 registry:PiReviewRegistry;author:PiReviewerModel;judgeA:PiReviewerModel;judgeB:PiReviewerModel;
 evidence:PiReviewEvidence;requirements:string;signal?:AbortSignal;validateBeforeJudge?:(judge:"jd-judge-a"|"jd-judge-b")=>void|Promise<void>;
}
export interface JudgmentDayReport{
 readonly status:"analysis-complete"|"findings-require-review"|"disagreement-requires-review";
 readonly requestId:string;readonly sessionId:string;readonly candidateTreeIdentity:string;readonly candidateRevision:string;
 readonly judges:readonly Readonly<{judge:"jd-judge-a"|"jd-judge-b";reviewerId:string;identity?:PiReviewIdentity;verdict:PiReviewVerdict["verdict"];summary:string;findingsCount:number}>[];
 readonly findings:readonly Readonly<{judge:"jd-judge-a"|"jd-judge-b";reviewerId:string;finding:PiReviewFinding}>[];
 readonly acceptance:"not-accepted";readonly deliveryAuthority:false;readonly autoMerge:false;readonly fixAgent:"not-launched";
}
const issued=new WeakSet<object>();
export function isIssuedJudgmentDayReport(value:unknown):value is JudgmentDayReport{return typeof value==="object"&&value!==null&&issued.has(value);}
function identity(model:PiReviewerModel):string{return model.provider+"/"+model.id;}

export async function runJudgmentDay(input:JudgmentDayInput):Promise<JudgmentDayReport>{
 const {registry,author,judgeA,judgeB,evidence,requirements,signal}=input;
 if(!isWorkspaceReviewEvidenceGenuine(evidence))throw new Error("Judgment Day requires controller-issued candidate evidence");
 if(typeof requirements!=="string"||!requirements.trim()||requirements.length>20000)throw new Error("Judgment Day requirements are missing or oversized");
 if(!author||typeof author.provider!=="string"||!author.provider||typeof author.id!=="string"||!author.id)throw new Error("Judgment Day requires an observed author model");
 if(!judgeA||!judgeB||reviewModelIdentityKey(judgeA)===reviewModelIdentityKey(judgeB))throw new Error("Judgment Day requires distinct independent judges");
 const available=availableIndependentPiReviewers(registry,author);
 if(!available.some(model=>identity(model)===identity(judgeA))||!available.some(model=>identity(model)===identity(judgeB)))
  throw new Error("Judgment Day judges must be authenticated and different from the author");
 if(signal?.aborted)throw new Error("Judgment Day cancelled before model use");
 await input.validateBeforeJudge?.("jd-judge-a");
 if(signal?.aborted)throw new Error("Judgment Day cancelled before Judge A");
 const first=await runIndependentPiReview({registry,model:judgeA,author,evidence,requirements,perspective:"jd-judge-a",...(signal?{signal}:{})});
 if(signal?.aborted)throw new Error("Judgment Day cancelled after Judge A");
 await input.validateBeforeJudge?.("jd-judge-b");
 if(signal?.aborted)throw new Error("Judgment Day cancelled before Judge B");
 const second=await runIndependentPiReview({registry,model:judgeB,author,evidence,requirements,perspective:"jd-judge-b",...(signal?{signal}:{})});
 if(!isPiReviewVerdictGenuine(first)||!isPiReviewVerdictGenuine(second))throw new Error("Judgment Day did not receive genuine Pi results");
 if(signal?.aborted)throw new Error("Judgment Day cancelled after Judge B");
 const judges=Object.freeze([
  Object.freeze({judge:"jd-judge-a" as const,reviewerId:first.reviewerId,...(first.identity?{identity:first.identity}:{}),verdict:first.verdict,summary:first.summary,findingsCount:first.findings.length}),
  Object.freeze({judge:"jd-judge-b" as const,reviewerId:second.reviewerId,...(second.identity?{identity:second.identity}:{}),verdict:second.verdict,summary:second.summary,findingsCount:second.findings.length})
 ]);
 const findings=Object.freeze([
  ...first.findings.map(finding=>Object.freeze({judge:"jd-judge-a" as const,reviewerId:first.reviewerId,finding})),
  ...second.findings.map(finding=>Object.freeze({judge:"jd-judge-b" as const,reviewerId:second.reviewerId,finding}))
 ]);
 // Un 'pass' puede contener hallazgos menores: no deben perderse en el
 // traspaso ODD, ni tratarse como aceptación automática del candidato.
 const status=first.verdict!==second.verdict?"disagreement-requires-review" as const:
  first.verdict==="fail"||findings.length>0?"findings-require-review" as const:"analysis-complete" as const;
 const result=Object.freeze({status,requestId:evidence.requestId,sessionId:evidence.sessionId,candidateTreeIdentity:evidence.candidate.treeIdentity,
  candidateRevision:evidence.candidate.revision,judges,findings,acceptance:"not-accepted" as const,
  deliveryAuthority:false as const,autoMerge:false as const,fixAgent:"not-launched" as const});
 issued.add(result);return result;
}
