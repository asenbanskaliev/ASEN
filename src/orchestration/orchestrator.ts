import type { AgentRequest } from "../agents/dispatcher.js";
import type { OddDecision } from "../flow/odd.js";

export interface OrchestrationInput {
  taskId:string; repository:string; prompt:string; writeSurfaces?:string[];
}
export interface OrchestrationPlan { decision:OddDecision; agents:AgentRequest[]; }

export function buildOrchestrationPlan(input:OrchestrationInput, decision:OddDecision):OrchestrationPlan {
  const base={repository:input.repository,prompt:input.prompt};
  const agents:AgentRequest[]=[];
  if(decision.route==="direct"||decision.route==="plan") return {decision,agents};
  if(decision.route==="verify"){
    agents.push({id:`${input.taskId}:verify`,role:"verifier",...base});
    return {decision,agents};
  }
  agents.push({id:`${input.taskId}:explore`,role:"explorer",...base});
  const worker:AgentRequest={id:`${input.taskId}:worker`,role:"worker",...base};
  if(input.writeSurfaces?.length) worker.writeSurfaces=[...input.writeSurfaces];
  agents.push(worker);
  agents.push({id:`${input.taskId}:review`,role:"reviewer",...base});
  agents.push({id:`${input.taskId}:verify`,role:"verifier",...base});
  return {decision,agents};
}
