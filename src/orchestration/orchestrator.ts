import type { AgentRequest } from "../agents/dispatcher.js";
import type { OddDecision } from "../flow/odd.js";
import {selectSkills,type SkillId} from "../skills/registry.js";

export interface OrchestrationInput {
  taskId:string; repository:string; prompt:string; writeSurfaces?:string[];
  codeChange?:boolean; behaviorChange?:boolean; filesTouched?:number;
}
export interface OrchestrationPlan { decision:OddDecision; agents:AgentRequest[]; skills:SkillId[]; }

export function buildOrchestrationPlan(input:OrchestrationInput, decision:OddDecision):OrchestrationPlan {
  const base={repository:input.repository,prompt:input.prompt};
  const skillContext={
    risk:decision.risk,
    verification:decision.route==="verify"||decision.verification==="independent",
    ...(input.codeChange===undefined?{}:{codeChange:input.codeChange}),
    ...(input.behaviorChange===undefined?{}:{behaviorChange:input.behaviorChange}),
    ...(input.filesTouched===undefined?{}:{filesTouched:input.filesTouched})
  };
  const skills=selectSkills(skillContext).map(skill=>skill.id);
  const agents:AgentRequest[]=[];
  if(decision.route==="direct"||decision.route==="plan") return {decision,agents,skills};
  if(decision.route==="verify"){
    agents.push({id:`${input.taskId}:verify`,role:"verifier",...base});
    return {decision,agents,skills};
  }
  agents.push({id:`${input.taskId}:explore`,role:"explorer",...base});
  const worker:AgentRequest={id:`${input.taskId}:worker`,role:"worker",...base};
  if(input.writeSurfaces?.length){
    worker.writeSurfaces=[...input.writeSurfaces];
    worker.skillContext=skillContext;
  }
  agents.push(worker);
  agents.push({id:`${input.taskId}:review`,role:"reviewer",...base});
  agents.push({id:`${input.taskId}:verify`,role:"verifier",...base});
  return {decision,agents,skills};
}
