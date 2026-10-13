import path from "node:path";
import {deriveOddFacts,planOddRoute,type OddRoutingRequest} from "../flow/odd-routing.js";
import {buildOrchestrationPlan} from "../orchestration/orchestrator.js";

const INPUT_KEYS=["taskIdentity","intent","scope","writes","riskOperations","session","testing","review","unresolvedDecisions"] as const;
const PLAN_INPUT_KEYS=["instruction",...INPUT_KEYS] as const;
const MAX_INPUT=16_384;
const exact=(value:unknown,keys:readonly string[]):value is Record<string,unknown>=>!!value&&typeof value==="object"&&!Array.isArray(value)&&Object.getPrototypeOf(value)===Object.prototype&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));

/** User-authored, read-only ODD route preview bound to the active project by the Pi adapter. */
export function routePreviewCommand(args:string,repositoryIdentity:string):string{
 if(typeof args!=="string"||!args.trim()||args.length>MAX_INPUT)throw new Error("Usage: /asen-route <JSON ODD facts>; input must be 1–16384 characters");
 if(typeof repositoryIdentity!=="string"||!path.isAbsolute(repositoryIdentity))throw new Error("ASEN route preview requires a canonical active project path");
 let value:unknown;try{value=JSON.parse(args);}catch{throw new Error("ASEN route preview expects valid JSON ODD facts");}
 if(!exact(value,INPUT_KEYS))throw new Error(`ASEN route facts must contain exactly: ${INPUT_KEYS.join(", ")}`);
 const facts=deriveOddFacts({...value,repositoryIdentity} as unknown as OddRoutingRequest),decision=planOddRoute(facts);
 return [`route: ${decision.route}`,`risk: ${decision.risk}`,`verification: ${decision.verification}`,`reasons: ${decision.reasons.join(", ")}`,`isolated child required: ${decision.requiresIsolatedChild}`,"Preview only: no agent was dispatched and no write permission was granted."].join("\n");
}

/** Builds a bounded, read-only plan from the user's instruction and exact ODD facts. */
export function controlledInstructionPlanCommand(args:string,repositoryIdentity:string):string{
 if(typeof args!=="string"||!args.trim()||args.length>MAX_INPUT)throw new Error("Usage: /asen-plan <JSON instruction and ODD facts>; input must be 1–16384 characters");
 if(typeof repositoryIdentity!=="string"||!path.isAbsolute(repositoryIdentity))throw new Error("ASEN planning requires a canonical active project path");
 let value:unknown;try{value=JSON.parse(args);}catch{throw new Error("ASEN planning expects valid JSON instruction and ODD facts");}
 if(!exact(value,PLAN_INPUT_KEYS))throw new Error(`ASEN plan input must contain exactly: ${PLAN_INPUT_KEYS.join(", ")}`);
 if(typeof value.instruction!=="string"||!value.instruction.trim()||value.instruction!==value.instruction.trim()||value.instruction.length>8192||/[\u0000-\u001f\u007f-\u009f]/u.test(value.instruction))throw new Error("ASEN plan instruction is invalid");
 const {instruction,...factsInput}=value;
 const facts=deriveOddFacts({...factsInput,repositoryIdentity} as unknown as OddRoutingRequest),decision=planOddRoute(facts);
 const plan=buildOrchestrationPlan({taskId:decision.taskIdentity,repository:decision.repositoryIdentity,prompt:instruction},decision);
 const sensitive=facts.riskOperations.length>0;
 return JSON.stringify({
  task:decision.taskIdentity,
  route:decision.route,
  risk:decision.risk,
  verification:decision.verification,
  reasons:decision.reasons,
  requiredAgentRoles:plan.agents.map(agent=>agent.role),
  selectedSkills:plan.skills,
  delegatedAgents:plan.agents.map(agent=>({id:agent.id,role:agent.role,phase:agent.expectedPhase??null,skillPaths:agent.skillPaths??[],model:agent.model??null,thinking:agent.thinking??null})),
  requiresSingleWriter:decision.requiresSingleWriter,
  requiresIsolatedChild:decision.requiresIsolatedChild,
  sensitiveOperationsPresent:sensitive,
  authorizationRequiredBeforeExecution:true,
  recoveryPolicy:"interrupted tasks require fresh authorization; no automatic write replay",
  execution:{started:false,authorized:false},
  actions:{informationRetrieved:false,reviewRequested:false},
  notice:"Plan only. This command does not retrieve information, request review, grant execution authorization, or dispatch agents.",
 },null,2);
}
