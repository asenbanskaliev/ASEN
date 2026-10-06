import {claimDualReviewLedger,type DualFinding,type DualReviewLedger} from "./dual-review.js";
export type DualTerminal={readonly status:"approved"|"escalated";readonly roundsUsed:0|1|2;readonly surviving:readonly string[];readonly ledgerId:string};
export interface DualRound{readonly round:1|2;readonly findingIds:readonly string[];readonly status:"correction";}
const states=new WeakMap<object,{ledger:DualReviewLedger;round:0|1|2;surviving:readonly DualFinding[];closed:boolean}>();
const severe=(f:DualFinding)=>f.severity==="high"||f.severity==="critical";
export function startDualRejudgment(value:unknown):DualRound|DualTerminal{
 const ledger=claimDualReviewLedger(value),surviving=ledger.findings.filter(severe);
 if(!surviving.length)return Object.freeze({status:"approved",roundsUsed:0,surviving:Object.freeze([]),ledgerId:ledger.ledgerId});
 const token=Object.freeze({round:1 as const,findingIds:Object.freeze(surviving.map(x=>x.id)),status:"correction" as const});states.set(token,{ledger,round:1,surviving,closed:false});return token;
}
/** Re-judges only frozen severe IDs. A second surviving round escalates; no third round exists. */
export function recordDualRejudgment(token:unknown,input:{resolved:readonly string[];regressions:readonly string[]}):DualRound|DualTerminal{
 const s=typeof token==="object"&&token!==null?states.get(token):undefined;if(!s||s.closed)throw new Error("Dual review round is not live");s.closed=true;
 if(typeof input!=="object"||input===null||Object.getPrototypeOf(input)!==Object.prototype||Reflect.ownKeys(input).length!==2||!Array.isArray(input.resolved)||!Array.isArray(input.regressions))throw new Error("Re-judgment must be exact plain data");
 const allowed=new Set(s.surviving.map(x=>x.id));\n const validIds=(values:readonly string[])=>values.every(id=>typeof id==="string"&&id&&id.trim()===id&&!/[\\u0000-\\u001f\\u007f]/u.test(id))&&new Set(values).size===values.length;\n if(!validIds(input.resolved)||!validIds(input.regressions)||input.resolved.some(id=>!allowed.has(id))||input.regressions.some(id=>allowed.has(id)))throw new Error("Re-judgment exceeds frozen finding scope");\n const resolved=new Set(input.resolved),remaining=s.surviving.filter(x=>!resolved.has(x.id));const ids=Object.freeze([...remaining.map(x=>x.id),...input.regressions]);
 if(!ids.length)return Object.freeze({status:"approved",roundsUsed:s.round,surviving:ids,ledgerId:s.ledger.ledgerId});
 if(s.round===2)return Object.freeze({status:"escalated",roundsUsed:2,surviving:ids,ledgerId:s.ledger.ledgerId});
 const next=Object.freeze({round:2 as const,findingIds:ids,status:"correction" as const});const inherited=new Map(s.ledger.findings.map(f=>[f.id,f] as const));\n const nextSurviving=ids.map(id=>inherited.get(id)??Object.freeze({id,severity:"high" as const,summary:"regression reported during re-judgment"}));\n states.set(next,{ledger:s.ledger,round:2,surviving:Object.freeze(nextSurviving),closed:false});return next;
}
