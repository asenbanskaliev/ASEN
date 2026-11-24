import path from "node:path";
import {deriveOddFacts,describeOddUnitPartition,planOddRoute,type OddRoutingRequest} from "../../flow/odd-routing.js";
import {buildOrchestrationPlan} from "../../orchestration/orchestrator.js";
import {materializeExecutablePlan} from "../../orchestration/executable-plan.js";
import type {Candidate} from "../../core/types.js";
import type {ProfileLayer} from "./profiles.js";
import {isPartitionUnitBasis,materializeOddPartitionPlan,materializePartitionRoot} from "./odd-unit-plan.js";

const INPUT_KEYS=["taskIdentity","intent","scope","writes","riskOperations","session","testing","review","unresolvedDecisions"] as const;
const PLAN_INPUT_KEYS=["instruction",...INPUT_KEYS] as const;
const MAX_INPUT=262_144;
const exact=(value:unknown,keys:readonly string[]):value is Record<string,unknown>=>!!value&&typeof value==="object"&&!Array.isArray(value)&&Object.getPrototypeOf(value)===Object.prototype&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
function exactWithOptionalUnits(value:unknown,keys:readonly string[]):value is Record<string,unknown>{
 const optional=[...(Object.hasOwn(value??{},"namedRisks")?["namedRisks"]:[]),...(Object.hasOwn(value??{},"taskUnits")?["taskUnits"]:[])];
 return exact(value,[...keys,...optional]);
}

/** User-authored, read-only ODD route preview bound to the active project by the Pi adapter. */
export function routePreviewCommand(args:string,repositoryIdentity:string):string{
 if(typeof args!=="string"||!args.trim()||args.length>MAX_INPUT)throw new Error("Usage: /asen-route <JSON ODD facts>; input must be 1–262144 characters");
 if(typeof repositoryIdentity!=="string"||!path.isAbsolute(repositoryIdentity))throw new Error("ASEN route preview requires a canonical active project path");
 let value:unknown;try{value=JSON.parse(args);}catch{throw new Error("ASEN route preview expects valid JSON ODD facts");}
 if(!exactWithOptionalUnits(value,INPUT_KEYS))throw new Error(`ASEN route facts must contain exactly: ${INPUT_KEYS.join(", ")} (optional namedRisks, taskUnits)`);
 const facts=deriveOddFacts({...value,repositoryIdentity} as unknown as OddRoutingRequest),decision=planOddRoute(facts);
 return [`route: ${decision.route}`,`risk: ${decision.risk}`,`verification: ${decision.verification}`,`reasons: ${decision.reasons.join(", ")}`,`isolated child required: ${decision.requiresIsolatedChild}`,"Preview only: no agent was dispatched and no write permission was granted."].join("\n");
}

/** Builds a bounded, read-only plan from the user's instruction and exact ODD facts. */
export function controlledInstructionPlanCommand(args:string,repositoryIdentity:string,candidate?:Candidate,runtimeProfiles?:ProfileLayer):string{
 if(typeof args!=="string"||!args.trim()||args.length>MAX_INPUT)throw new Error("Usage: /asen-plan <JSON instruction and ODD facts>; input must be 1–262144 characters");
 if(typeof repositoryIdentity!=="string"||!path.isAbsolute(repositoryIdentity))throw new Error("ASEN planning requires a canonical active project path");
 if(!args.trimStart().startsWith("{")){
  const instruction=args.trim();
  if(instruction.length>8192||/[\u0000-\u001f\u007f-\u009f]/u.test(instruction))throw new Error("ASEN plan instruction is invalid");
  return JSON.stringify({
   instruction,repository:repositoryIdentity,status:"needs-verified-facts",
   steps:["Establish task identity and intended scope","Confirm whether writes or sensitive operations are requested","Determine session, verification and review requirements","Derive ODD route from verified facts","Select skills and roles before any authorized execution"],
   missingFacts:[...INPUT_KEYS],execution:{started:false,authorized:false},
   notice:"Conservative instruction triage only. No ODD decision, skills, agents, permissions or execution were issued."
  },null,2);
 }
 let value:unknown;try{value=JSON.parse(args);}catch{throw new Error("ASEN planning expects valid JSON instruction and ODD facts");}
 // Una base de unidad solo puede producir un plan acotado; el despacho
 // posterior requiere además la selección exacta del supervisor de hijos.
 if(isPartitionUnitBasis(value)){
  if(!candidate)throw new Error("ODD partition requires a real candidate");
  const {decision,plan,graph}=materializePartitionRoot(value,repositoryIdentity,candidate,runtimeProfiles);
  return JSON.stringify({task:decision.taskIdentity,route:decision.route,risk:decision.risk,verification:decision.verification,
   reasons:decision.reasons,requiredAgentRoles:plan.agents.map(agent=>agent.role),selectedSkills:plan.skills,
   executablePlan:graph,requiresSingleWriter:true,requiresIsolatedChild:true,
   authorizationRequiredBeforeExecution:true,execution:{started:false,authorized:false},
   notice:"Unidad ODD reconstruida; solo el supervisor puede iniciar este Writer con autorización individual."},null,2);
 }
 if(!exactWithOptionalUnits(value,PLAN_INPUT_KEYS))throw new Error(`ASEN plan input must contain exactly: ${PLAN_INPUT_KEYS.join(", ")} (optional namedRisks, taskUnits)`);
 if(typeof value.instruction!=="string"||!value.instruction.trim()||value.instruction!==value.instruction.trim()||value.instruction.length>8192||/[\u0000-\u001f\u007f-\u009f]/u.test(value.instruction))throw new Error("ASEN plan instruction is invalid");
 const {instruction,...factsInput}=value;
 if(candidate&&(candidate.repository!==repositoryIdentity||!candidate.id||!candidate.revision||!candidate.createdAt))
  throw new Error("ASEN plan candidate does not match the active project");
 // Si el modelo propone escribir fuera del ámbito original, solo mostramos
 // los archivos adicionales. Un plan nuevo necesita consentimiento explícito.
 const raw=factsInput as Record<string,unknown>,scope=raw.scope as {kind?:unknown;expectedPaths?:unknown}|undefined;
 if(scope?.kind==="known"&&Array.isArray(scope.expectedPaths)&&Array.isArray(raw.writes)){
  const writes=raw.writes as Array<{path?:unknown}>,originalPaths=scope.expectedPaths as unknown[];
  const added=writes.map(write=>write?.path).filter(path=>typeof path==="string"&&
   !originalPaths.includes(path)) as string[];
  if(added.length){
   const nextPaths=[...originalPaths,...added];
   // La validación completa rechaza rutas sensibles, duplicados, traversal
   // y entradas mal formadas antes de construir cualquier propuesta.
   deriveOddFacts({...factsInput,scope:{kind:"known",expectedPaths:nextPaths},repositoryIdentity} as unknown as OddRoutingRequest);
   return JSON.stringify({
    status:"needs-scope-approval",repository:repositoryIdentity,
    candidateRevision:candidate?.revision??null,
    originalPaths:scope.expectedPaths,additionalPaths:added,
    execution:{started:false,authorized:false},
    scopeAuthorization:"not-granted",
    nextStep:"Solicitar autorización expresa de los archivos añadidos; después preparar un plan ODD nuevo sobre el candidato actual. Este resultado no concede permiso ni inicia tareas.",
   },null,2);
  }
 }
 const facts=deriveOddFacts({...factsInput,repositoryIdentity} as unknown as OddRoutingRequest),decision=planOddRoute(facts);
 const writeSurfaces=facts.writes.map(write=>write.path);
 const plan=buildOrchestrationPlan({selectionProfile:"organic",taskId:decision.taskIdentity,repository:decision.repositoryIdentity,prompt:instruction,...(candidate?{candidate}:{}),...(candidate&&writeSurfaces.length?{writeSurfaces}:{}),...(runtimeProfiles?{runtimeProfiles}:{})},decision);
 const writerAuthorizationBasis=candidate&&writeSurfaces.length?JSON.stringify({instruction,...factsInput}):undefined;
 const partitionPlan=candidate&&decision.route==="orchestrate"
  ?materializeOddPartitionPlan(facts,{instruction,...factsInput},candidate,runtimeProfiles):undefined;
 const executablePlan=partitionPlan??materializeExecutablePlan(plan,instruction,writerAuthorizationBasis);
 const sensitive=facts.riskOperations.length>0;
 const unitPartition=describeOddUnitPartition(facts);
 return JSON.stringify({
  task:decision.taskIdentity,
  route:decision.route,
  risk:decision.risk,
  verification:decision.verification,
  reasons:decision.reasons,
  requiredAgentRoles:partitionPlan?partitionPlan.tasks.map(task=>task.role):plan.agents.map(agent=>agent.role),
  selectedSkills:plan.skills,
  delegatedAgents:partitionPlan?partitionPlan.tasks.map(task=>({id:task.id,role:task.role,phase:task.skillSelection?.phase??null,skillPaths:task.skillPaths,model:task.model??null,thinking:task.thinking??null})):plan.agents.map(agent=>({id:agent.id,role:agent.role,phase:agent.expectedPhase??null,skillPaths:agent.skillPaths??[],model:agent.model??null,thinking:agent.thinking??null})),
  executablePlan,
  ...(unitPartition?{unitPartition}:{}),
  ...(partitionPlan?{partitionExecution:"supervised-worktrees-required",dependentUnits:"fresh-planning-after-integration-required"}:{}),
  requiresSingleWriter:partitionPlan?false:decision.requiresSingleWriter,
  requiresIsolatedChild:decision.requiresIsolatedChild,
  sensitiveOperationsPresent:sensitive,
  authorizationRequiredBeforeExecution:true,
  recoveryPolicy:"interrupted tasks require fresh authorization; no automatic write replay",
  execution:{started:false,authorized:false},
  actions:{informationRetrieved:false,reviewRequested:false},
  notice:"Plan only. This command does not retrieve information, request review, grant execution authorization, or dispatch agents.",
 },null,2);
}
