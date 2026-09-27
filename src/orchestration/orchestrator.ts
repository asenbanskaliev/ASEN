import type { AgentRequest } from "../agents/dispatcher.js";
import type { OddDecision } from "../flow/odd.js";
import type {Candidate} from "../core/types.js";
import {selectSkills,type SkillId,type SkillPhase} from "../skills/registry.js";
import {issueSkillContext} from "../skills/context.js";

export interface OrchestrationInput {
  taskId:string; repository:string; prompt:string; writeSurfaces?:string[];
  codeChange?:boolean; behaviorChange?:boolean; filesTouched?:number; candidate?:Candidate; skillPhase?:SkillPhase;
}
export interface OrchestrationPlan { decision:OddDecision; agents:AgentRequest[]; skills:SkillId[]; }

export function buildOrchestrationPlan(input:OrchestrationInput, decision:OddDecision):OrchestrationPlan {
  const base={repository:input.repository,prompt:input.prompt};
  const skillContext=issueSkillContext(input.taskId,input.repository,input.candidate,{
    risk:decision.risk,
    ...(input.skillPhase===undefined?{}:{phase:input.skillPhase}),
    verification:decision.route==="verify"||decision.verification==="independent",
    ...(input.codeChange===undefined?{}:{codeChange:input.codeChange}),
    ...(input.behaviorChange===undefined?{}:{behaviorChange:input.behaviorChange}),
    ...(input.filesTouched===undefined?{}:{filesTouched:input.filesTouched})
  });
  const selected=selectSkills(skillContext);
  const skills=selected.map(skill=>skill.id);
  const skillPaths=selected.map(skill=>skill.path);
  const agents:AgentRequest[]=[];
  if(decision.route==="direct"||decision.route==="plan") return {decision,agents,skills};
  if(decision.route==="verify"){
    agents.push({id:`${input.taskId}:verify`,role:"verifier",...base,skillContext,skillPaths});
    return {decision,agents,skills};
  }
  agents.push({id:`${input.taskId}:explore`,role:"explorer",...base,skillContext,skillPaths});
  const worker:AgentRequest={id:`${input.taskId}:worker`,role:"worker",...base,skillContext,skillPaths};
  if(input.writeSurfaces?.length){
    worker.writeSurfaces=[...input.writeSurfaces];
    if(!input.candidate) throw new Error("Writer orchestration requires an exact candidate");
    if(input.candidate.repository!==input.repository) throw new Error("Orchestration candidate repository mismatch");
    worker.candidate=input.candidate;
  }
  agents.push(worker);
  agents.push({id:`${input.taskId}:review`,role:"reviewer",...base,skillContext,skillPaths});
  agents.push({id:`${input.taskId}:verify`,role:"verifier",...base,skillContext,skillPaths});
  return {decision,agents,skills};
}
