/** T04/T08: valida la instrucción ODD NUEVA aportada por el usuario para
 * una propuesta Fix. No acepta el texto de los jueces como instrucción. */
import {deriveOddFacts,type OddRoutingRequest} from "../flow/odd-routing.js";
import {controlledInstructionPlanCommand} from "../runtime/lifecycle/route-command.js";
import type {JudgmentFixOddDraft} from "./judgment-fix-odd-draft.js";

const keys=["instruction","taskIdentity","intent","scope","writes","riskOperations",
 "session","testing","review","unresolvedDecisions"];
const exact=(v:unknown,names:readonly string[]):v is Record<string,unknown>=>
 typeof v==="object"&&v!==null&&!Array.isArray(v)&&
 Object.getPrototypeOf(v)===Object.prototype&&
 Object.keys(v).length===names.length&&names.every(key=>Object.hasOwn(v,key));
export interface FreshFixOddRequest{
 readonly raw:string;
 readonly taskIdentity:string;
 readonly scope:readonly string[];
 readonly route:"orchestrate";
 readonly readyToSavePlan:true;
 readonly authorized:false;
 readonly writerAuthority:false;
 readonly modelConsumed:false;
 readonly autoLaunch:false;
}
/** Necesita datos ODD válidos y un alcance idéntico al informe original.
 * El planificador existente reconstruirá la ruta con un candidato nuevo.
 * Esta validación NO concede consentimiento Writer ni guarda tareas. */
export function validateFreshFixOddRequest(draft:JudgmentFixOddDraft,raw:unknown):FreshFixOddRequest{
 if(draft?.status!=="draft-only"||draft.requiresHumanTriage||
  draft.writerAuthority!==false||draft.authorized!==false||
  draft.autoLaunch!==false||draft.requiresFreshWriterConsent!==true||
  typeof raw!=="string"||!raw.trim()||raw.length>16_384)
  throw new Error("Fix ODD requires a fresh authorized user planning request");
 let parsed:unknown;
 try{parsed=JSON.parse(raw);}catch{throw new Error("Fix ODD requires valid JSON facts supplied by the user");}
 if(!exact(parsed,keys)||typeof parsed.instruction!=="string"||
  parsed.instruction.length<12||parsed.instruction.length>3000||
  parsed.instruction!==parsed.instruction.trim()||
  /[\u0000-\u001f\u007f-\u009f]/u.test(parsed.instruction)||
  parsed.taskIdentity!=="fix-"+draft.sourceProposalId.slice(0,24)||
  parsed.intent!=="defect"||
  !exact(parsed.scope,["kind","expectedPaths"])||
  parsed.scope.kind!=="known"||!Array.isArray(parsed.scope.expectedPaths)||
  JSON.stringify(parsed.scope.expectedPaths)!==JSON.stringify(draft.writeSurfaces)||
  !Array.isArray(parsed.writes)||
  JSON.stringify(parsed.writes.map((item:unknown)=>(
   typeof item==="object"&&item!==null&&"path" in item?item.path:null
  )))!==JSON.stringify(draft.writeSurfaces)||
  !exact(parsed.testing,["kind"])||parsed.testing.kind!=="required"||
  !exact(parsed.review,["kind","estimatedMinutes"])||
  parsed.review.kind!=="dual_explicit"||
  !Array.isArray(parsed.unresolvedDecisions)||parsed.unresolvedDecisions.length!==0)
  throw new Error("Fix ODD instruction or original reviewed scope is invalid");
 const {instruction,...rawFacts}=parsed;
 const facts=deriveOddFacts({...rawFacts,repositoryIdentity:draft.projectId} as unknown as OddRoutingRequest);
 if(facts.intent!=="defect"||facts.risk==="high"||
  facts.scope.kind!=="known"||facts.scope.expectedPaths.length!==draft.writeSurfaces.length||
  facts.writes.length!==draft.writeSurfaces.length)
  throw new Error("Fix ODD requires fresh human triage for high-risk or changed scope");
 const preview=JSON.parse(controlledInstructionPlanCommand(
  raw,draft.projectId
 )) as {executablePlan?:{route?:string;tasks?:Array<{role:string;writeSurfaces?:string[]}>}};
 if(preview.executablePlan?.route!=="orchestrate"||
  !preview.executablePlan.tasks?.some(task=>task.role==="worker"&&
   JSON.stringify(task.writeSurfaces)===JSON.stringify(draft.writeSurfaces)))
  throw new Error("Fix ODD does not generate an exact scoped Worker");
 return Object.freeze({
  raw,taskIdentity:facts.taskIdentity,
  scope:Object.freeze([...draft.writeSurfaces]),
  route:"orchestrate" as const,readyToSavePlan:true as const,
  authorized:false as const,writerAuthority:false as const,
  modelConsumed:false as const,autoLaunch:false as const
 });
}
