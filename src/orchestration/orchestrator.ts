import type { AgentRequest } from "../agents/dispatcher.js";
import {claimOddRouteDecision,type OddRouteDecision} from "../flow/odd-routing.js";
import type {Candidate} from "../core/types.js";
import {selectSkills,type SkillId,type SkillPhase,type SkillSelectionContext} from "../skills/registry.js";
import {issueSkillContext} from "../skills/context.js";

export interface OrchestrationInput {
  taskId:string; repository:string; prompt:string; writeSurfaces?:string[];
  codeChange?:boolean; behaviorChange?:boolean; filesTouched?:number; candidate?:Candidate; skillPhase?:SkillPhase;
}
export interface OrchestrationRouteEvidence {
  readonly taskId:string; readonly repository:string; readonly candidateId:string; readonly candidateRevision:string;
  readonly decisionId:string; readonly route:OddRouteDecision["route"]; readonly risk:OddRouteDecision["risk"];
  readonly verification:OddRouteDecision["verification"];
}
export interface OrchestrationPlan { decision:OddRouteDecision; agents:AgentRequest[]; skills:SkillId[]; routeEvidence?:OrchestrationRouteEvidence; }

const issuedRouteEvidence=new WeakSet<object>();
const claimedRouteEvidence=new WeakSet<object>();
function issueRouteEvidence(input:OrchestrationInput,decision:OddRouteDecision):OrchestrationRouteEvidence|undefined{
  if(!input.candidate)return undefined;
  const proof=Object.freeze({taskId:input.taskId,repository:input.repository,candidateId:input.candidate.id,candidateRevision:input.candidate.revision,
    decisionId:decision.decisionId,route:decision.route,risk:decision.risk,verification:decision.verification});
  issuedRouteEvidence.add(proof);
  return proof;
}
/** Burns genuine orchestration evidence before validating its exact candidate binding. */
export function claimOrchestrationRouteEvidence(candidate:Candidate,proof:unknown):asserts proof is OrchestrationRouteEvidence{
  if(typeof proof!=="object"||proof===null||!issuedRouteEvidence.has(proof))throw new Error("Route evidence was not issued by orchestration");
  if(claimedRouteEvidence.has(proof))throw new Error("Route evidence has already been claimed");
  claimedRouteEvidence.add(proof);
  const route=proof as OrchestrationRouteEvidence;
  if(route.repository!==candidate.repository||route.candidateId!==candidate.id||route.candidateRevision!==candidate.revision)throw new Error("Route evidence candidate mismatch");
}

export function buildOrchestrationPlan(input:OrchestrationInput, decision:OddRouteDecision):OrchestrationPlan {
  claimOddRouteDecision(decision);
  if(decision.taskIdentity!==input.taskId)throw new Error("ODD route decision task mismatch");
  if(decision.repositoryIdentity!==input.repository)throw new Error("ODD route decision repository mismatch");
  if(input.candidate&&input.candidate.repository!==input.repository)throw new Error("Orchestration candidate repository mismatch");
  const routeEvidence=issueRouteEvidence(input,decision);
  const planned=<T extends {decision:OddRouteDecision;agents:AgentRequest[];skills:SkillId[]}>(plan:T):T&{routeEvidence?:OrchestrationRouteEvidence}=>
    routeEvidence?{...plan,routeEvidence}:plan;
  const base={repository:input.repository,prompt:input.prompt,...(input.candidate?{candidate:input.candidate}:{})};
  const common:SkillSelectionContext={
    risk:decision.risk,
    ...(input.codeChange===undefined?{}:{codeChange:input.codeChange}),
    ...(input.behaviorChange===undefined?{}:{behaviorChange:input.behaviorChange}),
    ...(input.filesTouched===undefined?{}:{filesTouched:input.filesTouched})
  };
  const contextFor=(suffix:string,phase:SkillPhase,verification=false)=>{
    const context=issueSkillContext(`${input.taskId}:${suffix}`,input.repository,input.candidate,{...common,phase,...(verification?{verification:true}:{})});
    const selected=selectSkills(context);
    return {context,skills:selected.map(skill=>skill.id),skillPaths:selected.map(skill=>skill.path)};
  };
  const requestedPhase=input.skillPhase??"apply";
  if(input.writeSurfaces?.length&&requestedPhase!=="apply")throw new Error("Writer orchestration requires apply phase");
  const primary=contextFor("worker",requestedPhase,decision.verification==="independent");
  const skills=primary.skills;
  const agents:AgentRequest[]=[];
  if(decision.route==="direct"||decision.route==="plan") return planned({decision,agents,skills});
  if(decision.route==="verify"){
    const verifier=contextFor("verify","verify",true);
    agents.push({id:`${input.taskId}:verify`,role:"verifier",...base,skillContext:verifier.context,skillPaths:verifier.skillPaths});
    return planned({decision,agents,skills:verifier.skills});
  }
  const explorer=contextFor("explore","explore");
  agents.push({id:`${input.taskId}:explore`,role:"explorer",...base,skillContext:explorer.context,skillPaths:explorer.skillPaths});
  const worker:AgentRequest={id:`${input.taskId}:worker`,role:"worker",...base,skillContext:primary.context,skillPaths:primary.skillPaths};
  if(input.writeSurfaces?.length){
    worker.writeSurfaces=[...input.writeSurfaces];
    if(!input.candidate) throw new Error("Writer orchestration requires an exact candidate");
    worker.candidate=input.candidate;
  }
  agents.push(worker);
  const reviewer=contextFor("review","adversarial-review",true);
  agents.push({id:`${input.taskId}:review`,role:"reviewer",...base,skillContext:reviewer.context,skillPaths:reviewer.skillPaths});
  const verifier=contextFor("verify","verify",true);
  agents.push({id:`${input.taskId}:verify`,role:"verifier",...base,skillContext:verifier.context,skillPaths:verifier.skillPaths});
  return planned({decision,agents,skills});
}
