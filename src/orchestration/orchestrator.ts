import type { AgentRequest } from "../agents/dispatcher.js";
import type { OddDecision } from "../flow/odd.js";
import type {Candidate} from "../core/types.js";
import {selectSkills,type SkillId,type SkillPhase,type SkillSelectionContext} from "../skills/registry.js";
import {issueSkillContext} from "../skills/context.js";

export interface OrchestrationInput {
  taskId:string; repository:string; prompt:string; writeSurfaces?:string[];
  codeChange?:boolean; behaviorChange?:boolean; filesTouched?:number; candidate?:Candidate; skillPhase?:SkillPhase;
}
export interface OrchestrationPlan { decision:OddDecision; agents:AgentRequest[]; skills:SkillId[]; }

export function buildOrchestrationPlan(input:OrchestrationInput, decision:OddDecision):OrchestrationPlan {
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
  if(decision.route==="direct"||decision.route==="plan") return {decision,agents,skills};
  if(decision.route==="verify"){
    const verifier=contextFor("verify","verify",true);
    agents.push({id:`${input.taskId}:verify`,role:"verifier",...base,skillContext:verifier.context,skillPaths:verifier.skillPaths});
    return {decision,agents,skills:verifier.skills};
  }
  const explorer=contextFor("explore","explore");
  agents.push({id:`${input.taskId}:explore`,role:"explorer",...base,skillContext:explorer.context,skillPaths:explorer.skillPaths});
  const worker:AgentRequest={id:`${input.taskId}:worker`,role:"worker",...base,skillContext:primary.context,skillPaths:primary.skillPaths};
  if(input.writeSurfaces?.length){
    worker.writeSurfaces=[...input.writeSurfaces];
    if(!input.candidate) throw new Error("Writer orchestration requires an exact candidate");
    if(input.candidate.repository!==input.repository) throw new Error("Orchestration candidate repository mismatch");
    worker.candidate=input.candidate;
  }
  agents.push(worker);
  const reviewer=contextFor("review","adversarial-review",true);
  agents.push({id:`${input.taskId}:review`,role:"reviewer",...base,skillContext:reviewer.context,skillPaths:reviewer.skillPaths});
  const verifier=contextFor("verify","verify",true);
  agents.push({id:`${input.taskId}:verify`,role:"verifier",...base,skillContext:verifier.context,skillPaths:verifier.skillPaths});
  return {decision,agents,skills};
}
