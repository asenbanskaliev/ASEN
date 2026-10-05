import {createHash} from "node:crypto";import {claimWorkUnitReviewCandidate,type WorkUnitReviewCandidate} from "../delivery/work-unit-review-candidate.js";
export interface DualFinding{readonly id:string;readonly severity:"low"|"medium"|"high"|"critical";readonly summary:string;}
export interface DualJudgeOutput{readonly judgeId:string;readonly findings:readonly DualFinding[];}
export interface DualReviewLedger{readonly ledgerId:string;readonly candidateRevision:string;readonly judges:readonly [DualJudgeOutput,DualJudgeOutput];readonly findings:readonly DualFinding[];readonly status:"frozen";}
export type BlindJudge=(candidate:Readonly<{revision:string;treeIdentity:string;taskIdentity:string}>)=>Promise<DualJudgeOutput>;
const issued=new WeakSet<object>(),claimed=new WeakSet<object>();
const clean=(v:string,n:string)=>{if(typeof v!=="string"||!v||v.trim()!==v||/[\u0000-\u001f\u007f]/u.test(v))throw new Error(`${n} malformed`);return v;};
function output(v:DualJudgeOutput):DualJudgeOutput{
 if(typeof v!=="object"||v===null||Object.getPrototypeOf(v)!==Object.prototype||Reflect.ownKeys(v).length!==2||!Array.isArray(v.findings))throw new Error("Judge output must be exact plain data");
 for(const k of ["judgeId","findings"]){const x=Object.getOwnPropertyDescriptor(v,k);if(!x?.enumerable||!("value" in x))throw new Error("Judge output shape invalid");}\n const seen=new Set<string>(),findings=v.findings.map(f=>{if(typeof f!=="object"||f===null||Object.getPrototypeOf(f)!==Object.prototype||Reflect.ownKeys(f).length!==3)throw new Error("Finding shape invalid");for(const k of ["id","severity","summary"]){const x=Object.getOwnPropertyDescriptor(f,k);if(!x?.enumerable||!("value" in x))throw new Error("Finding shape invalid");}if(!["low","medium","high","critical"].includes(f.severity))throw new Error("Finding shape invalid");const id=clean(f.id,"finding id");if(seen.has(id))throw new Error("Duplicate finding");seen.add(id);return Object.freeze({id,severity:f.severity,summary:clean(f.summary,"finding summary")});});
 return Object.freeze({judgeId:clean(v.judgeId,"judge"),findings:Object.freeze(findings)});
}
/** Dispatches exactly two blind read-only judge calls over one frozen genuine candidate. Outputs remain untrusted review data. */
export async function runDualReview(value:WorkUnitReviewCandidate,a:BlindJudge,b:BlindJudge):Promise<DualReviewLedger>{
 const c=claimWorkUnitReviewCandidate(value),target=Object.freeze({revision:c.revision,treeIdentity:c.treeIdentity,taskIdentity:c.taskIdentity});
 const [left,right]=await Promise.all([a(target),b(target)]).then(x=>x.map(output) as unknown as [DualJudgeOutput,DualJudgeOutput]);
 if(left.judgeId===right.judgeId)throw new Error("Dual review requires distinct judge identities");
 const canonical=[...left.findings,...right.findings].sort((x,y)=>x.id.localeCompare(y.id)||x.severity.localeCompare(y.severity)||x.summary.localeCompare(y.summary));
 const unique=new Map<string,DualFinding>();for(const f of canonical){const prior=unique.get(f.id);if(prior&&(prior.severity!==f.severity||prior.summary!==f.summary))throw new Error("Judges disagree on canonical data for one finding id");unique.set(f.id,f);}
 const payload={candidateRevision:c.revision,judges:Object.freeze([left,right] as const),findings:Object.freeze([...unique.values()]),status:"frozen" as const};
 const ledger=Object.freeze({...payload,ledgerId:createHash("sha256").update("asen.dual-review-ledger.v1\0").update(JSON.stringify(payload)).digest("hex")});issued.add(ledger);return ledger;
}
export function claimDualReviewLedger(v:unknown):DualReviewLedger{if(typeof v!=="object"||v===null||!issued.has(v))throw new Error("Dual review ledger is not genuine");if(claimed.has(v))throw new Error("Dual review ledger already consumed");claimed.add(v);return v as DualReviewLedger;}
